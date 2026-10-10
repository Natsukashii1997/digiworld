// Skill包文件、Vault记事与个人说明共用事务候选。
// Agent显示/启用配置复用既有agent-config的逆向patch日志，不能把任意完整配置备份到此日志。
// target由服务器现有连接/目录身份核验器派生；不直接使用前端绝对路径。
// fs适配器应复用readConfigFile/atomicReplaceConfig与knowledge-write-files的身份核验。
import { createHash, randomUUID } from "node:crypto";
const sha = value => createHash("sha256").update(value).digest("hex");
const fail = (code, message) => { throw Object.assign(new Error(message), { code }); };
export function createScopedTextOperations({ resolveTarget, inspect, create, replace, remove,
  journal, assertEnabled, revision, clock = () => Date.now() }) {
  const previews = new Map(), busy = new Set();
  async function exclusive(key, fn) {
    if (busy.has(key)) fail("BUSY", "同一目标已有操作，先查询结果");
    busy.add(key); try { return await fn(); } finally { busy.delete(key); }
  }
  async function guard(record,expires,authorizationGeneration=record.authorizationGeneration,expectedRevision=record.revision){
    const gate=await assertEnabled(record.capability);if(gate.generation!==authorizationGeneration||await revision()!==expectedRevision||clock()>=expires)fail('PLAN_CHANGED','授权、工作区或预览期限已变化');
    const target=await resolveTarget(record.targetRef);if(target.identity!==record.targetIdentity)fail('PLAN_CHANGED','目标身份已变化');
    const latest=await assertEnabled(record.capability);if(latest.generation!==authorizationGeneration||await revision()!==expectedRevision||clock()>=expires)fail('PLAN_CHANGED','授权、工作区或预览期限已变化');return target;
  }
  function sameBefore(record, current) {
    return record.before === null ? current === null : current && current.sha256 === record.before.sha256
      && current.fingerprint === record.before.fingerprint && current.parentIdentity === record.before.parentIdentity;
  }
  async function observe(record) {
    let current;
    try { current = await inspect(await resolveTarget(record.targetRef)); }
    catch { return { operationId: record.id, status: "unknown", reason: "目标无法安全回读" }; }
    let undone,applied;
    try{undone=await journal.rolledBackReceipt(record.id);applied=await journal.appliedReceipt(record.id);}
    catch{return{operationId:record.id,status:"unknown",reason:"目标可回读但操作留痕无法核验；停止新写入"};}
    if (undone && (record.before ? current?.sha256 === record.before.sha256 && current?.fingerprint === undone.fingerprint : current === null))
      return { operationId: record.id, status: "rolled_back" };
    if (current?.sha256 === record.afterSha256) {
      // 同字节另一个inode不能被认为本操作已写；无applied只能保留candidate_match，不能回滚删除。
      const ours = applied && applied.fingerprint === current.fingerprint;
      return { operationId: record.id, status: ours ? "verified" : "unknown", observation: ours ? "matches_after" : "candidate_match", currentSha256: current.sha256 };
    }
    if (sameBefore(record, current)) return { operationId: record.id, status: "not_applied", observation: "matches_before" };
    return { operationId: record.id, status: "unknown", observation: "changed", reason: "内容或文件身份已变化" };
  }
  return {
    async preview({ capability, targetRef, mode, text, beforeSegment, replacement }) {
      const gate = await assertEnabled(capability);
      if (journal.unresolvedForTarget) for (const old of await journal.unresolvedForTarget(targetRef)) {
        const observed = await observe(old);
        if (observed.status === "unknown") fail("UNKNOWN_RESULT", "同一目标有未明确的旧操作，先查询处理，不能换操作ID绕过");
      }
      if (!["create", "replace", "exact-segment"].includes(mode)) fail("INVALID_MODE", "写入类型无效");
      const target = await resolveTarget(targetRef); // 子目录必须已存在；不root、不..、不链接、不凭据文件。
      const current = await inspect(target);
      if (mode === "create" && current) fail("NAME_CONFLICT", "同名文件已存在，请选择其他名称或取消");
      if (mode !== "create" && !current) fail("TARGET_MISSING", "原文件不存在");
      let after = text;
      if (mode === "exact-segment") {
        if (typeof beforeSegment !== "string" || !beforeSegment || typeof replacement !== "string") fail("INVALID_SEGMENT", "原段落或替换文本无效");
        const at = current.content.indexOf(beforeSegment);
        if (at < 0 || current.content.indexOf(beforeSegment, at + beforeSegment.length) >= 0) fail("AMBIGUOUS_SEGMENT", "原段落不是唯一精确匹配");
        after = current.content.slice(0, at) + replacement + current.content.slice(at + beforeSegment.length);
      }
      if (typeof after !== "string" || Buffer.byteLength(after) > 256 * 1024) fail("TEXT_LIMIT", "正文超过受控写入上限");
      if (current && sha(after) === current.sha256) fail("NO_CHANGE", "正文没有变化");
      const token = randomUUID(), id = randomUUID(), expires = clock() + 300_000;
      const record = { schema: "scoped-text-operation/v1", id, capability, targetRef, mode,
        targetIdentity: target.identity, revision: await revision(), authorizationGeneration: gate.generation,
        before: current ? { sha256: current.sha256, fingerprint: current.fingerprint, parentIdentity: current.parentIdentity,
          content: current.content } : null,
        after: after, afterSha256: sha(after), createdAt: new Date(clock()).toISOString() };
      previews.set(token, { expires, record });
      // public内容为本次明确预览的target与diff。before backup是600私有日志；普通导出/快照不得包含。
      return { token, operationId: id, expiresAt: new Date(expires).toISOString(), target: target.displayPath,
        beforeSha256: current?.sha256 || "", afterSha256: record.afterSha256, before: current?.content || "",
        after, backup: current ? "写之前保存原文字节与身份" : "备份不存在状态；回滚仅删除本次原样文件" };
    },
    async apply({ token, operationId }) {
      const p = previews.get(token);
      if (!p || p.expires < clock() || p.record.id !== operationId) {
        const prior = await journal.read(operationId); if (prior) return await observe(prior);
        fail("PREVIEW_EXPIRED", "预览失效；重新预览不会补发旧操作");
      }
      const record = p.record;
      return await exclusive(record.targetRef, async () => {
        const prior = await journal.read(record.id); if (prior) return await observe(prior);
        const gate = await assertEnabled(record.capability), target = await resolveTarget(record.targetRef);
        if (gate.generation !== record.authorizationGeneration || await revision() !== record.revision || target.identity !== record.targetIdentity)
          fail("PLAN_CHANGED", "授权、工作区或目标已变化");
        const current = await inspect(target);
        if (!sameBefore(record, current)) fail("TARGET_CHANGED", "原文件已变化，请重新预览");
        const writeGuard=()=>guard(record,p.expires);
        await journal.prepare(record,{guard:writeGuard}); // durable先存备份与prepared，失败则不能写。
        // prepared 后和底层每次实际写入前再次核验；异常保留记录，不能重放。
        await writeGuard();
        const rechecked = await inspect(await resolveTarget(record.targetRef));
        if (!sameBefore(record, rechecked)) fail("TARGET_CHANGED", "备份后原文件已变化");
        try {
          if (record.mode === "create") await create(target, record.after,{guard:writeGuard});
          else await replace(target, rechecked, record.after,{guard:writeGuard});
          const after = await inspect(target);
          if (!after || after.sha256 !== record.afterSha256 || after.parentIdentity !== (current?.parentIdentity || target.parentIdentity))
            fail("READBACK_FAILED", "写后回读不一致");
          await writeGuard();
          await journal.applied(record.id, { at: new Date(clock()).toISOString(), sha256: after.sha256, fingerprint: after.fingerprint },{guard:writeGuard});
          previews.delete(token);
          return await observe(record);
        } catch { return { operationId: record.id, status: "unknown", reason: "写入或留痕结果未知，先查询，不重试" }; }
      });
    },
    async check(operationId) { const r = await journal.read(operationId); return r ? await observe(r) : { status: "not_started" }; },
    async rollbackPreview(operationId) {
      const r = await journal.read(operationId); if (!r) fail("OPERATION_MISSING", "操作不存在");
      const observed = await observe(r); if (observed.status !== "verified") fail("UNKNOWN_RESULT", "只能回滚已确认且仍原样的本操作文件");
      const gate=await assertEnabled(r.capability),currentRevision=await revision();
      const receipt = await journal.appliedReceipt(operationId), token = randomUUID();
      previews.set(token, { expires: clock() + 300_000, rollback: { record: r, receipt,authorizationGeneration:gate.generation,revision:currentRevision } });
      return { token, operationId, beforeSha256: r.afterSha256, afterSha256: r.before?.sha256 || "", action: r.before ? "恢复原文" : "移除本次新建文件" };
    },
    async rollback({ token, operationId }) {
      const p = previews.get(token); if (!p?.rollback || p.expires < clock() || p.rollback.record.id !== operationId) fail("PREVIEW_EXPIRED", "回滚预览失效");
      const { record: r, receipt,authorizationGeneration,revision:rollbackRevision } = p.rollback;
      return await exclusive(r.targetRef, async () => {
        const writeGuard=()=>guard(r,p.expires,authorizationGeneration,rollbackRevision);
        await writeGuard();
        const target = await resolveTarget(r.targetRef), current = await inspect(target);
        if (target.identity !== r.targetIdentity || !current || current.sha256 !== r.afterSha256 || current.fingerprint !== receipt.fingerprint)
          fail("TARGET_CHANGED", "本次写入后文件已变化，不能自动回滚");
        await journal.rollbackStarted(operationId, { at: new Date(clock()).toISOString(), expectedFingerprint: current.fingerprint },{guard:writeGuard});
        try {
          await writeGuard();
          if (r.before) await replace(target, current, r.before.content,{guard:writeGuard}); else await remove(target, current,{guard:writeGuard});
          const after = await inspect(target);
          if (r.before ? after?.sha256 !== r.before.sha256 : after !== null) fail("READBACK_FAILED", "回滚回读失败");
          await writeGuard();
          await journal.rolledBack(operationId, { at: new Date(clock()).toISOString(), sha256: after?.sha256 || "", fingerprint: after?.fingerprint || "" },{guard:writeGuard});
          previews.delete(token); return { operationId, status: "rolled_back" };
        } catch { return { operationId, status: "unknown", reason: "回滚结果未知，先查询" }; }
      });
    },
  };
}
