// 面向HTTP/UI的夜巡service候选：status不探宿主，preview用户点击才核验；官方CLI仅run调用。
import { randomUUID, createHash } from "node:crypto";
import { createClaudeNightAdapter, supportsClaudeNight, spawnBoundedClaude } from "./claude-night-adapter.mjs";
const hash = v => createHash("sha256").update(v).digest("hex");
const fail = (code, message) => { throw Object.assign(new Error(message), { code }); };
const hhmm = v => typeof v === "string" && /^\d\d:\d\d$/.test(v) && Number(v.slice(0, 2)) < 24 && Number(v.slice(3)) < 60;
const minutes = v => Number(v.slice(0, 2)) * 60 + Number(v.slice(3));
const day = date => [date.getFullYear(), String(date.getMonth() + 1).padStart(2, "0"), String(date.getDate()).padStart(2, "0")].join("-");
function windowAt(draft, date) {
  if (!hhmm(draft.time) || !hhmm(draft.end) || draft.time === draft.end) fail("INVALID_WINDOW", "夜巡窗口无效");
  const start = minutes(draft.time), end = minutes(draft.end), now = date.getHours() * 60 + date.getMinutes();
  const crosses = start > end, inside = crosses ? now >= start || now < end : now >= start && now < end;
  const beginning = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  if (crosses && now < end) beginning.setDate(beginning.getDate() - 1);
  return { inside, nightDate: day(beginning), end };
}
function deterministicRunId(value) {
  const h = hash(value).slice(0, 32).split(""); h[12] = "4"; h[16] = "8";
  const x = h.join(""); return [x.slice(0, 8), x.slice(8, 12), x.slice(12, 16), x.slice(16, 20), x.slice(20)].join("-");
}
function validateDraft(draft, options) {
  if (!draft || !Array.isArray(draft.tasks) || draft.tasks.length < 1 || draft.tasks.length > 20) fail("TASKS_MISSING", "请逐条保存结构化夜巡任务");
  if (!Number.isSafeInteger(options.budgetMicrosUsd) || options.budgetMicrosUsd < 1 || options.budgetMicrosUsd > 1_000_000_000)
    fail("BUDGET_UNKNOWN", "需要明确USD预算；旧人民币意向不自动换算");
  const ids = new Set(); let reserved = 0;
  for (const task of draft.tasks) {
    if (!task || typeof task.id !== "string" || !/^[a-zA-Z0-9_-]{1,100}$/.test(task.id) || ids.has(task.id)
      || !/^[a-zA-Z0-9_-]{1,100}$/.test(task.projectId || "") || !/^[a-zA-Z0-9_-]{1,100}$/.test(task.agentTargetId || "")
      || typeof task.instruction !== "string" || !task.instruction.trim() || Buffer.byteLength(task.instruction) > 16_384
      || !Array.isArray(task.readFileIds) || task.readFileIds.length < 1 || task.readFileIds.length > 200
      || task.readFileIds.some(id => typeof id !== "string" || !/^[a-zA-Z0-9_-]{1,100}$/.test(id))
      || !/^[a-zA-Z0-9\u4e00-\u9fff_-][a-zA-Z0-9\u4e00-\u9fff_.-]{0,99}\.md$/u.test(task.outputRelativePath || "")
      || task.outputRelativePath.includes("..") || !Number.isSafeInteger(task.budgetMicrosUsd) || task.budgetMicrosUsd < 1)
      fail("INVALID_TASK", "任务字段、只读文件ID或指定输出名无效");
    ids.add(task.id); reserved += task.budgetMicrosUsd;
  }
  if (!Number.isSafeInteger(reserved) || reserved > options.budgetMicrosUsd) fail("BUDGET_EXCEEDED", "任务预算预留总额超过当夜USD上限");
  if (!Number.isSafeInteger(options.timeoutSeconds) || options.timeoutSeconds < 1 || options.timeoutSeconds > 3600
    || !Number.isSafeInteger(options.maxTurns) || options.maxTurns < 1 || options.maxTurns > 20) fail("INVALID_LIMIT", "任务超时/轮数上限无效");
  windowAt(draft, new Date()); return reserved;
}
export function createNightCapabilityService({ settings, journal, getDraft, saveDraft, inspectTask,
  keychain, artifacts, enqueueMorningReport, withdrawMorningReport,inspectStoppedProcess,proxyFactory, runProcess = spawnBoundedClaude, clock = () => new Date(),
  setTimer = setTimeout, clearTimer = clearTimeout }) {
  const previews = new Map(), active = new Map();
  const draftHash = (draft, options) => hash(JSON.stringify({ draft, options }));
  const at = () => clock().toISOString();
  async function current() {
    const gate = await settings.get("night"), draft = await getDraft();
    return { gate, draft, sha256: draftHash(draft, gate.options) };
  }
  async function approvalFor(sha256, generation) {
    const rows = await journal.list();
    return rows.filter(r => r.record.capability === "night" && r.record.action === "approval"
      && r.record.afterSha256 === sha256 && r.record.metadata.authorizationGeneration === generation && r.phase!=="rolled_back"&&r.receipt?.status === "verified")
      .sort((a, b) => b.record.at.localeCompare(a.record.at))[0] || null;
  }
  const api = {
    async status() {
      const { gate, draft, sha256 } = await current();
      // 不读Agent目录、private会话、钥匙串、CLI版本，不自动run。显示缓存草稿与本机回执。
      return { enabled: gate.enabled, generation: gate.generation, options: gate.options, draft, draftSha256: sha256,
        running: [...active.keys()], requiredAgent: "Claude Code >=2.1.286 + macOS Seatbelt",
        budgetMeaning: "USD执行停止阈值；账单未核验" };
    },
    async saveTasks({ tasks, time, end,operationId }) {
      const { gate } = await current(); const next = { time, end, tasks };
      validateDraft(next, gate.options);const result=await saveDraft(next,{operationId});return{saved:true,operationId:result?.operationId||operationId||null,draft:await getDraft()};
    },
    async preview() {
      const gate = await settings.assertEnabled("night"), draft = await getDraft(); validateDraft(draft, gate.options);
      const bindings = [];
      for (const task of draft.tasks) {
        const binding = await inspectTask(task); // 服务端已登记项目+已登记CLI+显式文件ID，不能接受绝对路径。
        if (!binding || !supportsClaudeNight(binding.version, binding.platform).supported || binding.agent !== "claude-code"
          || !/^[a-f0-9]{64}$/.test(binding.identity || "") || !/^[a-f0-9]{64}$/.test(binding.fileManifestSha256 || ""))
          fail("UNSUPPORTED_AGENT", "Agent只读/固定网络/官方预算能力或文件来源未核验；Codex暂不支持预算夜巡");
        bindings.push(binding);
      }
      const id = randomUUID(), token = randomUUID(), sha256 = draftHash(draft, gate.options);
      previews.set(token, { id, sha256, draft, generation: gate.generation, bindings, expires: clock().getTime() + 300_000 });
      return { token, operationId: id, draftSha256: sha256, window: { time: draft.time, end: draft.end }, budgetMicrosUsd: gate.options.budgetMicrosUsd,
        budgetMeaning: "官方CLI USD停止阈值；费用回执为客户端估算",
        tasks: draft.tasks.map((task, index) => ({ ...task, readFiles: bindings[index].readFiles,
          fileManifestSha256: bindings[index].fileManifestSha256, version: bindings[index].version,
          outputDirectory: "工作台私有夜巡产物目录", transmittedInput: "以下明确文件的内容及本任务指令会发送固定Anthropic API；其余路径不可读取" })),
        backup: "计划SHA与原批准记录留痕；每次执行另存prepared/started/PID/回执，产物可回滚但费用不可撤销" };
    },
    async confirm({ token, operationId, confirmed }) {
      if (confirmed !== true) fail("CONFIRM_REQUIRED", "需要确认完整夜巡预览");
      const p = previews.get(token), { gate, draft, sha256 } = await current(); await settings.assertEnabled("night");
      if (!p || p.id !== operationId || p.expires < clock().getTime() || p.generation !== gate.generation || p.sha256 !== sha256)
        fail("PREVIEW_EXPIRED", "草稿或授权已变化，重新预览");
      for (let i = 0; i < draft.tasks.length; i++) {
        const actual = await inspectTask(draft.tasks[i]), expected = p.bindings[i];
        if (actual.identity !== expected.identity || actual.version !== expected.version || actual.fileManifestSha256 !== expected.fileManifestSha256)
          fail("SOURCE_CHANGED", "Agent或只读输入已变化，重新预览");
      }
      const old = await approvalFor(sha256, gate.generation);
      await journal.prepare({ schema: "capability-operation/v1", id: p.id, capability: "night", action: "approval", targetRef: "night/plan",
        beforeSha256: old?.record.afterSha256 || "", afterSha256: sha256, at: at(), metadata: {
          authorizationGeneration: gate.generation, budgetMicrosUsd: gate.options.budgetMicrosUsd,
          fileManifestSha256: hash(JSON.stringify(p.bindings.map(b => b.fileManifestSha256))) } });
      await journal.completed(p.id, { status: "verified" }); previews.delete(token);
      return { operationId: p.id, status: "verified", approvedDraftSha256: sha256 };
    },
    async run({ signal } = {}) {
      const { gate, draft, sha256 } = await current(); await settings.assertEnabled("night"); validateDraft(draft, gate.options);
      const window = windowAt(draft, clock()); if (!window.inside) fail("OUTSIDE_WINDOW", "当前不在已确认夜巡窗口");
      const approval = await approvalFor(sha256, gate.generation); if (!approval) fail("APPROVAL_MISSING", "当前草稿没有有效确认");
      // 每夜一个固定ID，即使改草稿/重开窗口也不能绕过“每晚一次”。
      const id = deterministicRunId("workbench-night/" + window.nightDate);
      const old = await journal.checkExisting(id); if (old.exists) return await api.check(id,{inspectProcesses:false});
      const unresolved=(await journal.list()).filter(r=>r.record.capability==="night"&&["task","night-run"].includes(r.record.action)&&r.executionStarted&&!r.processStopped&&r.phase!=="rolled_back");
      if(unresolved.length)fail("PROCESS_STOP_UNKNOWN","旧夜巡进程停止未确认；请先显式查询并由本人处理，不能换草稿/目标/夜晚绕过");
      if (active.has(id)) return { operationId: id, status: "running" };
      const controller = new AbortController(); active.set(id, controller);
      const startedDate = clock(), endMinute = minutes(draft.end), endDate = new Date(startedDate.getFullYear(), startedDate.getMonth(), startedDate.getDate(),
        Math.floor(endMinute / 60), endMinute % 60);
      if (endDate.getTime() <= startedDate.getTime()) endDate.setDate(endDate.getDate() + 1);
      const endTimer = setTimer(() => controller.abort(), Math.max(1, endDate.getTime() - startedDate.getTime()));
      endTimer?.unref?.();
      const onAbort = () => controller.abort(); signal?.addEventListener("abort", onAbort, { once: true }); if (signal?.aborted) controller.abort();
      const results = []; let spent = 0, unknownCost = false;
      try {
        await journal.prepare({ schema: "capability-operation/v1", id, capability: "night", action: "night-run", targetRef: "night/" + window.nightDate,
          beforeSha256: "", afterSha256: sha256, at: at(), metadata: { authorizationGeneration: gate.generation, budgetMicrosUsd: gate.options.budgetMicrosUsd,
            sourceRef: approval.record.id } });
        if (!await journal.started(id)) return await api.check(id);
        const runBindings = [];
        for (const task of draft.tasks) runBindings.push(await inspectTask(task));
        if (hash(JSON.stringify(runBindings.map(b => b.fileManifestSha256))) !== approval.record.metadata.fileManifestSha256)
          fail("SOURCE_CHANGED", "已批准的文件清单已变化，不能执行");
        for (let index = 0; index < draft.tasks.length; index++) {
          const task = draft.tasks[index], live = await settings.get("night"), binding = runBindings[index];
          if (!live.enabled || live.generation !== gate.generation || !windowAt(draft, clock()).inside || controller.signal.aborted || unknownCost)
            { results.push({ taskId: task.id, status: "skipped",stopped:true,reason: "窗口结束、全局停止、授权变化或费用未知" }); continue; }
          if (spent + task.budgetMicrosUsd > gate.options.budgetMicrosUsd)
            { results.push({ taskId: task.id, status: "skipped",stopped:true,reason: "当夜预算剩余额度不足" }); continue; }
          if (!supportsClaudeNight(binding.version, binding.platform).supported) fail("UNSUPPORTED_AGENT", "Agent版本不符合只读预算契约");
          const taskId = randomUUID(), sessionId = randomUUID(), begin = clock().getTime();
          await journal.prepare({ schema: "capability-operation/v1", id: taskId, capability: "night", action: "task", targetRef: "night-task/" + id + "/" + task.id,
            beforeSha256: "", afterSha256: hash(task.instruction), at: at(), metadata: { sourceRef: id, taskId: task.id,
              targetId: task.agentTargetId, projectId: task.projectId, identity: binding.identity, version: binding.version,
              authorizationGeneration: gate.generation, budgetMicrosUsd: task.budgetMicrosUsd, timeoutMs: gate.options.timeoutSeconds * 1000,
              maxTurns: gate.options.maxTurns, sessionId, outputRelativePath: task.outputRelativePath, fileManifestSha256: binding.fileManifestSha256 } });
          const adapter = createClaudeNightAdapter({
            inspectBinding: async () => { const b = await inspectTask(task);
              if (b.fileManifestSha256 !== binding.fileManifestSha256) fail("SOURCE_CHANGED", "任务文件已变化"); return b; },
            getCredential: ref => keychain.get(ref), makeScratch: op => artifacts.createScratch(op), proxyFactory,
            runProcess:async(plan,key,options)=>{const actual=await inspectTask(task);if(actual.identity!==binding.identity||actual.fileManifestSha256!==binding.fileManifestSha256)fail("SOURCE_CHANGED","spawn前身份或文件已变化");const live=await settings.get("night");if(!live.enabled||live.generation!==gate.generation||options.signal.aborted||!windowAt(draft,clock()).inside)return{status:"not_started",reason:"spawn前授权已关闭或窗口结束",stopped:true,costMicrosUsd:null,billedCost:null};return runProcess(plan,key,options);},
            started: op => journal.started(op), processStarted: (op, p) => journal.processStarted(op, p),
            checkExisting: op => journal.checkExisting(op),
            completed: async (op, receipt) => {
              const { output, stderrBytes: _stderr, ...safe } = receipt;
              safe.durationMs=Math.max(0,clock().getTime()-begin);
              if (output) { const artifact = await artifacts.put(op, output); safe.outputArtifactRef = artifact.ref; safe.outputSha256 = artifact.sha256;safe.outputFingerprint=artifact.fingerprint; }
              await journal.completed(op, safe);
            },
          });
          const receipt = await adapter.run({ operationId: taskId, signal: controller.signal, preparedPlan: {
            targetId: task.agentTargetId, identity: binding.identity, version: binding.version, sessionId, credentialRef: "anthropic/main",
            task: { instruction: task.instruction, budgetMicrosUsd: task.budgetMicrosUsd, timeoutMs: gate.options.timeoutSeconds * 1000, maxTurns: gate.options.maxTurns } } });
          const checked = await journal.checkExisting(taskId), saved = checked.receipt || receipt;
          results.push({ taskId: task.id, operationId: taskId, status: saved.status, outputArtifactRef: saved.outputArtifactRef || "",
            stopped:saved.stopped??null,exitCode: saved.exitCode ?? null,durationMs:Math.max(0,clock().getTime()-begin),costMicrosUsd:saved.costMicrosUsd??null });
          if (saved.costMicrosUsd === null || !Number.isSafeInteger(saved.costMicrosUsd) || saved.costMicrosUsd > task.budgetMicrosUsd || saved.stopped === false)
            unknownCost = true;
          else spent += saved.costMicrosUsd;
          if (saved.status !== "verified") controller.abort(); // 失败不继续扩大执行。
        }
        const report = ["# 夜巡晨报", "执行日期：" + window.nightDate, ...results.map(r => "- " + r.taskId + "：" + r.status
          + "；耗时：" + (r.durationMs ?? "未知") + "ms；费用：" + (r.costMicrosUsd === null || r.costMicrosUsd === undefined ? "未知" : r.costMicrosUsd + " USD微元（客户端估算）"))].join("\n");
        const artifact = await artifacts.put(id, report);
        const receipt = { status: unknownCost ? "unknown" : results.every(r => r.status === "verified") ? "verified" : "failed",
          outputArtifactRef: artifact.ref, outputSha256: artifact.sha256,outputFingerprint:artifact.fingerprint,costMicrosUsd: unknownCost ? null : spent,
          costSource: "cli-client-estimate",stopped:results.every(r=>r.stopped===true),billedCost: null };
        receipt.durationMs=Math.max(0,clock().getTime()-startedDate.getTime());
        await journal.completed(id, receipt); await enqueueMorningReport({ operationId: id, artifactRef: artifact.ref, nightDate: window.nightDate, receipt, tasks: results });
        await journal.delivered(id);
        return { operationId: id, ...receipt, tasks: results, status: receipt.status || "verified", newlyStarted: true };
      } catch {
        controller.abort(); return { operationId: id, status: "unknown", newlyStarted: true, reason: "执行、预算或回执不完整；先查询，不能重跑同夜" };
      } finally { clearTimer(endTimer); active.delete(id); signal?.removeEventListener("abort", onAbort); }
    },
    async stop() { for (const controller of active.values()) controller.abort(); return { stopRequested: true, running: [...active.keys()] }; },
    async deliverMorning({operationId,confirmed}) {
      if(confirmed!==true)fail("CONFIRM_REQUIRED","确认补交本次已存晨报；不会重跑任务");
      await settings.assertEnabled("night"); const row=await journal.checkExisting(operationId);
      if(!row.exists||row.record.action!=="night-run"||!row.receipt?.outputArtifactRef||row.phase==="rolled_back")fail("REPORT_UNKNOWN","没有可补交的已存晨报");
      const file=await artifacts.inspect(row.receipt.outputArtifactRef);if(file?.sha256!==row.receipt.outputSha256||file?.fingerprint!==row.receipt.outputFingerprint)fail("REPORT_UNKNOWN","晨报文件回读失败");
      if(!row.delivered){const tasks=(await journal.list()).filter(r=>r.record.action==="task"&&r.record.metadata.sourceRef===operationId)
        .map(r=>({taskId:r.record.metadata.taskId,operationId:r.record.id,...r.receipt}));
        await enqueueMorningReport({operationId,artifactRef:row.receipt.outputArtifactRef,nightDate:row.record.targetRef.slice(6),receipt:row.receipt,tasks});await journal.delivered(operationId);}
      return await api.check(operationId);
    },
    async check(operationId,{inspectProcesses=true}={}) {
      let row=await journal.checkExisting(operationId);if(!row.exists)return{operationId,status:"not_started"};
      if (row.record.capability !== "night") fail("WRONG_OPERATION", "不是夜巡操作");
      // 仅显式用户check核进程组，status/tick/run不能借查旧记录探宿主或解除锁。
      if(inspectProcesses&&typeof inspectStoppedProcess==="function"&&row.executionStarted&&!row.processStopped){
        const children=row.record.action==="night-run"?(await journal.list()).filter(r=>r.record.action==="task"&&r.record.metadata.sourceRef===operationId):[row];
        for(const child of children)if(child.executionStarted&&!child.processStopped&&child.process){if(await inspectStoppedProcess(child.process)===true)await journal.confirmStopped(child.record.id);}
        if(row.record.action==="night-run"){const liveChildren=(await journal.list()).filter(r=>r.record.action==="task"&&r.record.metadata.sourceRef===operationId);if(liveChildren.every(r=>!r.executionStarted||r.processStopped))await journal.confirmStopped(operationId);}
        row=await journal.checkExisting(operationId);
      }
      if (row.phase === "rolled_back") return { operationId, status: "rolled_back" };
      if (row.receipt) {
        if (row.receipt.outputArtifactRef) { const file = await artifacts.inspect(row.receipt.outputArtifactRef);
          if (!file || file.sha256 !== row.receipt.outputSha256||file.fingerprint!==row.receipt.outputFingerprint) return { operationId, status: "unknown", reason: "回执产物内容或身份回读不一致" }; }
        if(row.record.action==="night-run"&&!row.delivered)return{operationId,...row.receipt,status:"unknown",reason:"执行回执已存；晨报入待处理尚未回读。仅补交晨报，不重跑任务"};
        return { operationId,...row.receipt,stopped:row.processStopped||row.receipt.stopped===true };
      }
      return { operationId, status: active.has(operationId) ? "running" : row.executionStarted ? "unknown" : "not_started",
        stopped:row.processStopped,process:row.process,reason:"重开后只查询已存PID/回执，不重放任务" };
    },
    async history() {
      const rows=(await journal.list()).filter(row=>row.record.capability==="night");
      return rows.map(row=>{const parent=row.record.action==="task"?rows.find(r=>r.record.id===row.record.metadata.sourceRef):row;
        return{operationId:row.record.id,action:row.record.action,targetRef:row.record.targetRef,at:row.record.at,startedAt:row.startedAt||null,
          nightDate:parent?.record.action==="night-run"?parent.record.targetRef.slice(6):null,taskId:row.record.metadata.taskId||null,
          agentTargetId:row.record.metadata.targetId||null,projectId:row.record.metadata.projectId||null,sourceOperationId:row.record.metadata.sourceRef||null,
          ...row.receipt,stopped:row.processStopped||row.receipt?.stopped===true,status:row.phase==="rolled_back"?"rolled_back":row.receipt?.status||(row.executionStarted?"unknown":"not_started"),durationMs:row.receipt?.durationMs??null,process:row.process};});
    },
    async read(operationId){const row=await journal.checkExisting(operationId);if(!row.exists||row.record.capability!=="night"||row.phase==="rolled_back"||!row.receipt?.outputArtifactRef)fail("OUTPUT_UNKNOWN","本次夜巡没有可回读的已存输出");const text=await artifacts.read(row.receipt.outputArtifactRef,row.receipt.outputSha256,row.receipt.outputFingerprint);return{operationId,text,sha256:row.receipt.outputSha256,status:row.receipt.status,costMicrosUsd:row.receipt.costMicrosUsd??null,billedCost:null};},
    async rollbackPreview(operationId) {
      const gate = await settings.assertEnabled("night");
      const row = await journal.checkExisting(operationId), checked = await api.check(operationId);
      if (!row.exists || !row.receipt || !["verified", "failed"].includes(checked.status) || active.has(operationId))
        fail("UNKNOWN_RESULT", "正在运行或结果未知，不能自动移除产物");
      const token = randomUUID(); previews.set(token, { rollback: row, id: operationId, generation: gate.generation,
        receiptSha256: hash(JSON.stringify(row.receipt)), expires: clock().getTime() + 300_000 });
      return { token, operationId, action: row.record.action==="approval"?"撤销本次计划批准":"移除本次未变化的晨报及任务产物；不撤销已经发生的费用" };
    },
    async rollback({ token, operationId,confirmed }) {
      if(confirmed!==true)fail("CONFIRM_REQUIRED","需要确认夜巡回滚预览");
      const p = previews.get(token), gate = await settings.assertEnabled("night");
      if (!p?.rollback || p.id !== operationId || p.generation !== gate.generation || p.expires < clock().getTime() || active.has(operationId))
        fail("PREVIEW_EXPIRED", "夜巡回滚预览失效");
      const guard = async () => {
        const live = await settings.assertEnabled("night"), actual = await journal.checkExisting(operationId);
        if (live.generation !== p.generation || !actual.exists || actual.phase === "rolled_back" || active.has(operationId)
          || hash(JSON.stringify(actual.receipt)) !== p.receiptSha256) fail("PLAN_CHANGED", "夜巡回滚授权或原回执已变化");
        const finalGate = await settings.assertEnabled("night");
        if (finalGate.generation !== p.generation) fail("PLAN_CHANGED", "夜巡回滚授权已变化");
      };
      await guard();
      const row = await journal.checkExisting(operationId), receipt = row.receipt;
      const children=row.record.action==="night-run"?(await journal.list()).filter(r=>r.record.action==="task"&&r.record.metadata.sourceRef===operationId):[];
      try {
        for(const child of children)if(child.receipt?.outputArtifactRef){const file=await artifacts.inspect(child.receipt.outputArtifactRef);if(file?.sha256!==child.receipt.outputSha256||file?.fingerprint!==child.receipt.outputFingerprint)fail("TARGET_CHANGED","任务产物已变化，拒绝覆盖或删除");}
        if(row.record.action==="night-run"&&row.delivered){if(typeof withdrawMorningReport!=="function")fail("ROLLBACK_UNAVAILABLE","晨报移除适配器未接入");await guard();await withdrawMorningReport(operationId,{guard});}
        for(const child of children){
          if(child.receipt?.outputArtifactRef){await guard();await artifacts.remove(child.receipt.outputArtifactRef,child.receipt.outputSha256,child.receipt.outputFingerprint,guard);}
          await guard();await journal.rolledBack(child.record.id,{status:"rolled_back"},{guard});
        }
        if (receipt?.outputArtifactRef) {
          await guard();await artifacts.remove(receipt.outputArtifactRef, receipt.outputSha256,receipt.outputFingerprint,guard);
          if (await artifacts.inspect(receipt.outputArtifactRef)) fail("READBACK_FAILED", "产物移除回读失败");
        }
        await guard();await journal.rolledBack(operationId, { status: "rolled_back" },{guard}); previews.delete(token);
        return { operationId, status: "rolled_back", feeReversed: false };
      } catch { return { operationId, status: "unknown", reason: "夜巡回滚中断或结果未知；仅查询，不继续删除" }; }
    },
    async tick() {
      const { gate, draft } = await current(); if (!gate.enabled || !Array.isArray(draft?.tasks) || !draft.tasks.length) return { skipped: true };
      if (!windowAt(draft, clock()).inside) return { skipped: true };
      return await api.run(); // 由server显式注册timer；factory自己不创建timer或宿主动作。
    },
  };
  return api;
}
