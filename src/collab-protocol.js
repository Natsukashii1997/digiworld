// Slice A: deterministic read projection, never a workflow record store.
import { filterRelayText } from "./relay-prompt.js";
import { dispatchPrompt, linkText } from "./collab.js";
import {
  DESIGN_IMPLEMENTATION_V1,
  validateWorkflowTemplate,
} from "./workflow-template.js";
export const RUN_PHASES = [
  [
    "方向梳理",
    "claude-code",
    "页面简报",
    "按项目现有方法逐轮确认目标、范围与验收。",
  ],
  [
    "视觉稿",
    "claude-code",
    "视觉稿",
    "按批准方向生成多状态参照，并取得用户确认。",
  ],
  ["派单", "claude-code", "派单", "按既有派单文本登记 CURRENT 编号。"],
  [
    "认领与实现",
    "codex",
    "实现",
    "冻结批准参照，隔离实现、全量回归与逐区叠图。",
  ],
  ["交付交接", "codex", "交接", "保存证据，更新 CURRENT，写后回读并释放认领。"],
  [
    "逐区验收",
    "claude-code",
    "逐区验收",
    "核对交接、叠图和关键 diff，明确通过或返修。",
  ],
  ["终验", "user", "终验", "由用户实际使用并明确确认；Agent 不代签。"],
  ["存档", "user", "存档点", "由用户审阅存档；提交和推送须单独授权。"],
].map(([label, actor, artifact, method], i) => ({
  number: i + 1,
  label,
  actor,
  artifact,
  method,
}));
const KEYS = {
  run_id: "runId",
  运行编号: "runId",
  event_id: "eventId",
  事件编号: "eventId",
  issue_id: "issueId",
  返修项: "issueId",
  title: "title",
  事项: "title",
  phase: "phase",
  阶段: "phase",
  actor: "actor",
  执行者: "actor",
  status: "status",
  状态: "status",
  at: "at",
  时间: "at",
  artifact: "artifact",
  交付物: "artifact",
  method: "method",
  方法: "method",
  result: "result",
  过关结论: "result",
  gate: "gate",
  用户闸门: "gate",
  commit: "commit",
  存档点: "commit",
  阶段开始: "stageStartedAt",
  template: "template",
  模板: "template",
  当前写入者: "writer",
  state_id: "stateId",
  唯一下一步: "next",
  当前任务: "task",
  最新交接: "handoff",
};
const clean = (v) =>
  filterRelayText(
    String(v ?? "")
      .replace(/\*\*|`/g, "")
      .trim(),
  ).text.slice(0, 2000);
export const protocolTime = (v) =>
  typeof v === "string" &&
  /^\d{4}-\d\d-\d\dT\d\d:\d\d(?::\d\d(?:\.\d+)?)?(Z|[+-]\d\d:\d\d)$/.test(v) &&
  Number.isFinite(Date.parse(v))
    ? v
    : "";
export function protocolPath(value) {
  const p =
    String(value || "").match(/\[[^\]]*\]\(([^)]+)\)/)?.[1] ||
    String(value || "");
  return p &&
    p.length < 1000 &&
    !/[:\\\x00-\x20\x7f?#]/.test(p) &&
    p.split("/").every((x) => x && !x.startsWith(".") && x !== "..")
    ? p
    : "";
}
export function actorId(v) {
  const s = String(v || "");
  return /codex/i.test(s)
    ? "codex"
    : /claude/i.test(s)
      ? "claude-code"
      : /hermes/i.test(s)
        ? "hermes"
        : /用户|^你$|^user$/i.test(s)
          ? "user"
          : "";
}
export function parseProtocolHead(text, { current = false, path = "" } = {}) {
  const all = String(text).split(/\r?\n/),
    lines = [],
    fields = {},
    conflicts = [];
  for (const line of all.slice(0, 80)) {
    if (/^##\s/.test(line) && !(current && !Object.keys(fields).length)) break;
    lines.push(line);
    const match =
      line.match(/^\s*\|\s*([^|]+?)\s*\|\s*(.*?)\s*\|\s*$/) ||
      line.match(/^([A-Za-z_\u4e00-\u9fff]+)\s*[:：]\s*(.+)$/);
    if (!match) continue;
    const key = KEYS[clean(match[1])];
    if (!key) continue;
    const v = clean(match[2]);
    if (fields[key] !== undefined && fields[key] !== v)
      conflicts.push(`字段 ${match[1]} 重复且不一致`);
    else fields[key] = v;
  }
  const heading = clean(lines.find((v) => /^#\s/.test(v))?.replace(/^#\s/, ""));
  const phase =
    Number(fields.phase) ||
    RUN_PHASES.find((p) => p.label === fields.phase)?.number ||
    DESIGN_IMPLEMENTATION_V1.stages.find((p) => p.label === fields.phase)?.number ||
    null;
  if (fields.phase && !(Number.isInteger(phase) && phase >= 1 && phase <= 20))
    conflicts.push("阶段格式无效");
  if (fields.at && !protocolTime(fields.at)) conflicts.push("时间格式无效");
  if (fields.runId && !/^[\w.-]{1,80}$/.test(fields.runId))
    conflicts.push("运行编号格式无效");
  if (fields.eventId && !/^[\w.-]{1,80}$/.test(fields.eventId))
    conflicts.push("事件编号格式无效");
  if (
    fields.issueId &&
    !/^[\p{L}\p{N}._:-]{1,80}$/u.test(fields.issueId)
  )
    conflicts.push("返修项标识格式无效");
  if (
    fields.status &&
    !["working", "passed", "failed", "waiting", "delivered", "skipped"].includes(
      fields.status,
    ) &&
    fields.runId
  )
    conflicts.push("状态格式无效");
  const missing = fields.runId
    ? ["eventId", "phase", "actor", "status", "at"].filter((k) => !fields[k])
    : [];
  return {
    path,
    heading,
    fields,
    missing,
    phase: Number.isInteger(phase) && phase >= 1 && phase <= 20 ? phase : null,
    conflicts,
    mode: fields.runId ? "explicit" : "legacy",
  };
}
export function inferRunPhase(f = {}, heading = "", phases = RUN_PHASES) {
  if (f.phase) {
    const n =
      Number(f.phase) || phases.find((p) => p.label === f.phase)?.number;
    if (Number.isInteger(n) && n >= 1 && n <= phases.length)
      return { number: n, inferred: false, basis: "CURRENT 阶段字段" };
    return {
      number: null,
      inferred: true,
      basis: "CURRENT 阶段不在锁定模板范围内，保持未知",
    };
  }
  const sources = [
    [
      "CURRENT 当前写入者",
      /^(无|none)(?:$|[；;，,])/i.test(f.writer || "") ? "" : f.writer,
    ],
    ["CURRENT 唯一下一步", f.next],
    ["CURRENT 当前任务", f.task],
    ["最新交接标题", heading],
  ];
  const numberOf = (...labels) =>
    phases.find((p) => labels.includes(p.label))?.number;
  const rules = [
    [numberOf("验收", "逐区验收"), /独立复核|逐区验收|复核(?:状态|返修|结果|交接)/],
    [numberOf("认领与实现"), /返修|修复|实现|开发|认领/],
    [numberOf("终验"), /(?:用户|你).{0,12}(?:确认|终验|验收)|终验/],
    [numberOf("运行采用"), /运行采用|受控重启.{0,8}实测/],
    [numberOf("验收", "逐区验收"), /逐区验收|复核|审查|Claude.{0,12}验收/i],
    [numberOf("存档"), /存档/],
    [numberOf("交付交接"), /交付|交接/],
    [numberOf("派单"), /登记|派单/],
    [numberOf("视觉稿"), /视觉稿/],
    [numberOf("方向梳理"), /方向|简报/],
  ];
  for (const [basis, value] of sources)
    for (const [number, re] of rules)
      if (number && re.test(value || ""))
        return { number, inferred: true, basis: `${basis}：“${clean(value)}”` };
  return {
    number: null,
    inferred: true,
    basis: "字段没有可识别的阶段，保持未知",
  };
}
export function idleWriter(writer = "") {
  return /^(无|无人|没有|空闲|none|n\/a|—|-)\s*(?:$|[；;，,。:：（(])/i.test(
    writer,
  );
}
export function writerConflict(writer = "") {
  if (idleWriter(writer)) return false;
  const present = writer.split(/[（(;；]/)[0];
  return (
    /冲突/.test(present) ||
    (/[/、+&]|同时|共同/.test(present) &&
      [/codex/i, /claude/i, /hermes/i, /用户|^你$/].filter((r) =>
        r.test(present),
      ).length > 1)
  );
}
const unknownIssues = (path = "", reason = "待议清单未绑定或未完整读取") => ({
  state: "unknown",
  path,
  count: null,
  total: null,
  items: [],
  reason,
});

// Only a bounded, explicit issue table is projected. Neither prose nor a partial table
// is treated as evidence that the round has zero pending issues.
export function summarizeProtocolIssues(text, path = "") {
  const lines = String(text).split(/\r?\n/);
  const cells = (line) => line.trim().replace(/^\|/, "").replace(/\|$/, "").split(/(?<!\\)\|/).map((cell) => cell.trim());
  const headerAt = lines.findIndex((line) => {
    if (!/^\s*\|.*\|\s*$/.test(line)) return false;
    const row = cells(line);
    return row.includes("#") && row.includes("问题") && row.includes("结论");
  });
  if (headerAt < 0 || !/^\s*\|(?:\s*:?-+:?\s*\|)+\s*$/.test(lines[headerAt + 1] || ""))
    return unknownIssues(path, "待议清单缺少完整的问题与结论表");
  const header = cells(lines[headerAt]);
  const numberAt = header.indexOf("#"), titleAt = header.indexOf("问题"), decisionAt = header.indexOf("结论");
  const items = [], numbers = new Set();
  for (const line of lines.slice(headerAt + 2)) {
    if (!/^\s*\|.*\|\s*$/.test(line)) break;
    const row = cells(line);
    if (row.length !== header.length || !/^\d{1,4}$/.test(row[numberAt]))
      return unknownIssues(path, "待议清单表格不完整或行格式无效");
    if (numbers.has(row[numberAt]))
      return unknownIssues(path, "待议清单编号重复，条数未知");
    numbers.add(row[numberAt]);
    if (items.length >= 100) return unknownIssues(path, "待议清单超过100项读取上限");
    const title = clean(row[titleAt]).slice(0, 180),
      decision = clean(row[decisionAt]).slice(0, 200);
    if (!title) return unknownIssues(path, "待议清单问题标题为空");
    items.push({ number: Number(row[numberAt]), title, decision });
  }
  return {
    state: "ok",
    path,
    count: items.filter((item) => !item.decision).length,
    total: items.length,
    items,
    reason: "",
  };
}

function templateForRun(projectId, runId, assets, runSettings) {
  const matches = (Array.isArray(runSettings) ? runSettings : []).filter(
    (setting) => setting?.projectId === projectId && setting.runId === runId,
  );
  if (!matches.length)
    return { state: "legacy", phases: RUN_PHASES, setting: null, version: null };
  const setting = matches[0];
  if (matches.length !== 1)
    return { state: "unknown", phases: [], setting, reason: "同一运行存在多个模板绑定" };
  if (!Array.isArray(setting.actorOverrides) ||
      !["per-run", "continuous"].includes(setting.pace) ||
      typeof setting.functionOnly !== "boolean")
    return { state: "unknown", phases: [], setting, reason: "运行设置格式无效" };
  const asset = (Array.isArray(assets) ? assets : []).find(
    (item) => item?.id === setting.templateAssetId && item.type === "Workflow",
  );
  const version = Array.isArray(asset?.versions)
    ? asset.versions.find((item) => item.id === setting.templateVersionId)
    : null;
  if (!version?.workflowTemplate)
    return { state: "unknown", phases: [], setting, reason: "锁定的工作流模板版本不存在" };
  try {
    const template = validateWorkflowTemplate(version.workflowTemplate);
    const overrides = new Map(setting.actorOverrides.map((item) => [item.phase, item.actor]));
    if (overrides.size !== setting.actorOverrides.length ||
        setting.actorOverrides.some((item) => !template.stages[item.phase - 1] ||
          !["claude-code", "codex", "hermes", "user"].includes(item.actor)))
      throw new Error("替换执行者阶段超出锁定版本");
    return {
      state: "bound",
      setting,
      version,
      template,
      phases: template.stages.map((stage) => ({
        number: stage.number,
        label: stage.label,
        actor: overrides.get(stage.number) || stage.defaultActor,
        actorOverridden: overrides.has(stage.number),
        artifact: stage.artifact,
        method: stage.method,
        gateCondition: stage.gate,
        skippable: stage.skippable,
      })),
    };
  } catch {
    return { state: "unknown", phases: [], setting, reason: "锁定的工作流模板版本无效" };
  }
}
export function projectProtocolRuns({
  projectId,
  name,
  current,
  documents = [],
  git = { state: "unknown", commits: [] },
  now = Date.now(),
  partial = false,
  assets = [],
  runSettings = [],
  issuesByPath = {},
}) {
  const f = current.fields,
    groups = new Map(),
    issues = [...current.conflicts];
  for (const d of documents) {
    if (!d.fields.runId) continue;
    if (!groups.has(d.fields.runId)) groups.set(d.fields.runId, []);
    groups.get(d.fields.runId).push(d);
  }
  const currentId = f.runId || `current-${projectId}`;
  // Legacy files attach ONLY when CURRENT explicitly references the path. No history-to-run guessing.
  const linked = documents.filter(
    (d) => !d.fields.runId && (f.handoff || "").includes(`](${d.path})`),
  );
  if (!groups.has(currentId) && (f.stateId || f.next || f.writer))
    groups.set(currentId, linked);
  const runs = [];
  for (const [id, docs] of groups) {
    const isCurrent = id === currentId,
      conflicts = [...(isCurrent ? issues : [])],
      binding = templateForRun(projectId, id, assets, runSettings),
      phases = binding.phases,
      seen = new Map(),
      ambiguousPhases = new Set(),
      events = [];
    if (binding.state === "unknown") conflicts.push(binding.reason);
    for (const d of docs) {
      conflicts.push(...d.conflicts.map((v) => `${d.path}：${v}`));
      const documentPhase = Number(d.fields.phase) ||
        phases.find((entry) => entry.label === d.fields.phase)?.number || null;
      if (!documentPhase || d.conflicts.length) {
        if (documentPhase) ambiguousPhases.add(documentPhase);
        else if (d.fields.phase && !d.conflicts.length)
          conflicts.push(`${d.path}：阶段不在锁定模板范围内`);
        continue;
      }
      if (binding.state === "unknown" || documentPhase > phases.length) {
        conflicts.push(`${d.path}：阶段不在锁定模板范围内`);
        continue;
      }
      const x = d.fields,
        key = x.eventId || d.path;
      if (x.status === "skipped" &&
          !(binding.state === "bound" && binding.setting.functionOnly &&
            documentPhase <= 2 && phases[documentPhase - 1]?.skippable)) {
        conflicts.push(`${d.path}：跳过不符合该运行的模板规则`);
        ambiguousPhases.add(documentPhase);
        continue;
      }
      const event = {
        id: key,
        phase: documentPhase,
        actor: actorId(x.actor),
        actorText: x.actor || "未知",
        status: x.status || "unknown",
        at: protocolTime(x.at),
        artifact: protocolPath(x.artifact),
        method: x.method || "",
        result: x.result || "",
        gate: x.gate === "confirmed",
        commit: /^[a-f0-9]{40}$/.test(x.commit || "") ? x.commit : "",
        path: d.path,
        title: x.title || d.heading,
        issueId: x.issueId || "",
        basis: `${d.path} 文首字段`,
        number: x.eventId || "",
      };
      if (seen.has(key)) {
        if (
          JSON.stringify({ ...seen.get(key), path: "", basis: "" }) !==
          JSON.stringify({ ...event, path: "", basis: "" })
        ) {
          conflicts.push(`事件 ${key} 内容冲突`);
          ambiguousPhases.add(event.phase);
          ambiguousPhases.add(seen.get(key).phase);
          seen.get(key).ambiguous = true;
        }
        continue;
      }
      seen.set(key, event);
      events.push(event);
    }
    events.sort(
      (a, b) =>
        (Date.parse(a.at) || 0) - (Date.parse(b.at) || 0) ||
        a.id.localeCompare(b.id),
    );
    const latest = events.filter((e) => e.at).at(-1),
      phase = binding.state === "unknown"
        ? { number: null, inferred: true, basis: binding.reason }
        : isCurrent
        ? inferRunPhase(f, linked[0]?.heading, phases)
        : {
            number: latest?.phase || null,
            inferred: false,
            basis: latest?.basis || "事件时间未知",
          };
    if (binding.state === "bound" && binding.setting.functionOnly &&
        phase.number <= 2 && phases[phase.number - 1]?.skippable)
      conflicts.push("CURRENT 当前阶段指向纯功能任务已跳过的站点，请在项目协议核对阶段");
    const stations = phases.map((p) => {
      const list = events.filter((e) => e.phase === p.number),
        dated = list.filter((e) => e.at),
        event = dated.at(-1) || list[0] || null;
      const ambiguous =
        ambiguousPhases.has(p.number) ||
        list.some((e) => !e.at) ||
        dated
          .filter((e) => Date.parse(e.at) === Date.parse(event?.at))
          .some(
            (e) =>
              e.status !== event.status ||
              e.gate !== event.gate ||
              e.result !== event.result,
          );
      if (ambiguous) conflicts.push(`第${p.number}阶段事件先后或结论冲突`);
      return {
        ...p,
        event,
        status: ambiguous
          ? "unknown"
          : event?.status ||
            (binding.state === "bound" && binding.setting.functionOnly &&
            p.number <= 2 && p.skippable ? "skipped" : "unknown"),
        ambiguous,
        current: phase.number === p.number,
      };
    });
    const writer = isCurrent ? f.writer || "未知" : "未记录",
      conflict = conflicts.length > 0 || (isCurrent && writerConflict(writer));
    const phaseEvents = events.filter((e) => e.phase === phase.number && e.at),
      stageAt = isCurrent
        ? protocolTime(f.stageStartedAt) || phaseEvents.at(-1)?.at || ""
        : phaseEvents.at(-1)?.at || "";
    const idleDays = stageAt
      ? Math.max(0, (now - Date.parse(stageAt)) / 86400000)
      : null;
    const failed = stations.filter((s) => s.status === "failed");
    const issueGroups = new Map();
    for (const event of events.filter((item) => item.issueId && item.at)) {
      if (!issueGroups.has(event.issueId)) issueGroups.set(event.issueId, []);
      issueGroups.get(event.issueId).push(event);
    }
    const threshold = binding.state === "bound"
      ? binding.template.escalationAfter : null;
    const repairIssues = [...issueGroups].map(([issueId, list]) => {
      const failures = list.filter((item) => item.status === "failed");
      const lastFailedAt = failures.at(-1)?.at || "";
      const lastPassedAt = list.filter((item) => item.status === "passed").at(-1)?.at || "";
      return {
        issueId,
        failures: failures.length,
        lastFailedAt,
        needsDecision: !!threshold && failures.length >= threshold &&
          !!lastFailedAt && (!lastPassedAt || Date.parse(lastPassedAt) < Date.parse(lastFailedAt)),
      };
    });
    const repairTarget = phases.find((item) => item.label === "认领与实现")?.number;
    if (repairIssues.some((item) => item.needsDecision))
      for (const station of stations)
        station.decisionRequired = station.number === phase.number ||
          station.number === repairTarget;
    const alerts = [];
    if (conflict)
      alerts.push({
        kind: "conflict",
        label: writerConflict(writer) ? "写入者冲突" : "协议字段冲突",
        main: true,
      });
    if (
      !(phase.number === phases.length && stations.at(-1)?.status === "passed") &&
      idleDays !== null &&
      idleDays > 3
    )
      alerts.push({
        kind: "stalled",
        label: `卡住 ${Math.floor(idleDays)} 天`,
        main: true,
      });
    if (failed.length)
      alerts.push({ kind: "failed", label: "验收不通过", main: true });
    for (const item of repairIssues.filter((entry) => entry.needsDecision))
      alerts.push({
        kind: "needs_decision",
        label: `同项返修 ${item.failures} 次仍不过 · 待你决定`,
        main: true,
        issueId: item.issueId,
      });
    const finalGate = binding.state === "bound"
      ? phases.find((item) => item.label === "终验")?.number
      : 7;
    if (
      (phase.number === finalGate &&
        !(stations[finalGate - 1]?.status === "passed" &&
          stations[finalGate - 1]?.event?.gate)) ||
      (isCurrent && /等(?:待)?(?:你|用户)确认/.test(f.next || ""))
    )
      alerts.push({ kind: "waiting", label: "等你确认 / 终验", main: false });
    const first = events.find((e) => e.at)?.at || "",
      lastRepair = events.filter((e) => e.status === "failed").at(-1);
    const issuePath = binding.setting?.issuesPath || "";
    const roundIssues = issuePath
      ? issuesByPath[issuePath] || unknownIssues(issuePath)
      : unknownIssues("", "该运行未绑定轮次待议清单");
    const terminalFrom = finalGate ||
      phases.find((item) => item.label === "存档" && item.actor === "user")?.number ||
      (phases.length ? phases.length + 1 : null);
    runs.push({
      id,
      stableId: !isCurrent || !!f.runId,
      projectId,
      name,
      // CURRENT 的“当前任务”常是交接链接加状态句，并非运行事项标题。
      // 保留原文供协议/口令使用，展示层只使用明确登记的“事项”。
      title: linkText(
        (isCurrent ? f.title : "") ||
        docs.find((d) => d.fields.title)?.fields.title ||
        (isCurrent ? "当前协作" : "当前事项"),
      ),
      taskRaw: isCurrent ? f.task || "" : "",
      taskSummary: isCurrent && !f.title ? linkText(f.task || "") : "",
      template: binding.state === "bound"
        ? binding.version.title
        : binding.state === "unknown"
          ? "锁定模板版本未知"
          : (isCurrent ? f.template : "") || "设计实现流 · 现有文本",
      templateState: binding.state,
      templateAssetId: binding.setting?.templateAssetId || "",
      templateVersionId: binding.setting?.templateVersionId || "",
      pace: binding.state === "bound" ? binding.setting.pace : null,
      round: binding.setting?.round || "",
      issues: roundIssues,
      escalationAfter: threshold,
      functionOnly: binding.state === "bound" ? binding.setting.functionOnly : false,
      repairIssues,
      terminalFrom,
      copyBlocked: binding.state === "unknown" || !phase.number ||
        !terminalFrom || phase.number >= terminalFrom || conflict,
      isCurrent,
      phase,
      writer,
      holder: idleWriter(writer) ? "" : actorId(writer.split(/[（(;；]/)[0]),
      conflict,
      conflicts,
      partial:
        partial || binding.state === "unknown" ||
        (binding.state === "bound" && roundIssues.state !== "ok") ||
        docs.some((d) => d.mode === "legacy" || d.missing?.length),
      events,
      stations,
      startedAt: first,
      stageAt,
      idleDays,
      elapsedDays: first
        ? Math.max(0, Math.floor((now - Date.parse(first)) / 86400000))
        : null,
      reworks: events.filter((e) => e.status === "failed").length,
      reworkAt: lastRepair?.at || "",
      alerts,
      git,
      next: isCurrent ? f.next || "" : "请先核对 CURRENT 中当前推进事项",
      method:
        stations.find((s) => s.current)?.event?.method ||
        stations.find((s) => s.current)?.method ||
        "先核对 CURRENT 与阶段要求。",
    });
  }
  return runs.sort(
    (a, b) =>
      Number(b.isCurrent) - Number(a.isCurrent) || a.id.localeCompare(b.id),
  );
}
export function runPrompt(item, run, agent) {
  const station = run.stations.find((entry) =>
    entry.number === run.phase.number);
  const phaseLabel = station?.label || "未知";
  const bound = run.templateState === "bound";
  const pace = run.pace === "continuous" ? "连续推进、最后一次验收" :
    run.pace === "per-run" ? "逐单停等" : "未知";
  const actor = station?.actor || "未知";
  const observedActor = station?.event?.actorText || "尚无可核对事件";
  const skip = run.functionOnly
    ? `\n纯功能任务：第 1、2 站仅在锁定模板允许时标记跳过；跳过不代表过关。`
    : "";
  return filterRelayText(
    dispatchPrompt({ ...item, stage: { id: "unknown" } }, agent) +
      `\n\n本次事项：${run.title === "当前协作" && run.taskRaw ? run.taskRaw : run.title}\n运行编号：${run.id}` +
      `\n轮次：${run.round || "未知"}` +
      `\n锁定模板：${bound ? `${run.template}（资产 ${run.templateAssetId} / 版本 ${run.templateVersionId}）` : run.templateState === "legacy" ? "旧运行八站（未绑定结构化模板）" : "未知，禁止按最新版推断"}` +
      `\n推进节奏：${pace}` +
      `\n当前展示阶段：${phaseLabel}${run.phase.inferred ? "（推断；须核对原文）" : ""}` +
      `\n本阶段执行者：${actor}${station?.actorOverridden ? "（本运行替换）" : "（模板默认）"}；协议事件执行者：${observedActor}` +
      `\n本阶段现有方法要求 / 工具：${station?.event?.method || station?.method || "未知"}` +
      `\n本阶段交付物：${station?.artifact || "未知"}` +
      `\n本阶段过关条件：${station?.gateCondition || "以项目协议为准，结构化条件未知"}` +
      `\n依据：${run.phase.basis}${skip}` +
      `\n未记载的过关、真人验收与接手均不得推定。`,
  ).text;
}

// Guidance follows explicit alerts; it does not change claims or dispatch agents.
export function collabAlertGuidance(run) {
  const kinds = new Set((run.alerts || []).filter(alert => alert.main).map(alert => alert.kind));
  const steps = [];
  if (kinds.has('conflict')) steps.push(writerConflict(run.writer)
    ? '先暂停双方写入，由当前负责人核对 CURRENT，确认唯一写入者并释放另一方认领；随后刷新看板。'
    : '请当前负责人对照 CURRENT 与交接记录，统一冲突字段和唯一下一步，再刷新看板。');
  if (kinds.has('needs_decision')) steps.push('同项返修已达到门槛，请先查看失败证据，由你决定继续返修或调整目标，再交给 Agent 推进。');
  if (kinds.has('failed') && !kinds.has('needs_decision')) steps.push('请查看未通过的验收项和证据，交给原实现 Agent 定点返修，再由复核方重新验收。');
  if (kinds.has('stalled')) steps.push('请负责的 Agent 核对最后交接、依赖和阻塞原因，更新可执行的唯一下一步；若需要你决定，明确列出选项。');
  if (!steps.length && kinds.size) steps.push('先查看冲突依据，请负责的 Agent 核对并处理阻塞；确认后刷新看板。');
  return steps;
}
