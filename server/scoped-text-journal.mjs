// 复用既有私有700目录/600文件/owner/link/SHA/fsync不可变日志；不放宽原ConfigOperation验证器。
import { createHash } from "node:crypto";
const sha = v => createHash("sha256").update(v).digest("hex");
const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
const hash = /^[a-f0-9]{64}$/;
const exact = (r, keys) => r && typeof r === "object" && !Array.isArray(r) && Object.keys(r).length === keys.length && keys.every(k => Object.hasOwn(r, k));
const fail = () => { throw Object.assign(new Error("受控文字日志损坏，停止写入并保留本机记录"), { code: "INVALID_JOURNAL" }); };
const instant = v => typeof v === "string" && /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(v) && Number.isFinite(Date.parse(v));
const short = v => typeof v === "string" && v.length > 0 && v.length < 8192 && !v.includes("\0");
function validatePrepared(r) {
  if (!exact(r, ["schema", "id", "capability", "targetRef", "mode", "targetIdentity", "revision", "authorizationGeneration", "before", "after", "afterSha256", "createdAt", "at"])
    || r.schema !== "scoped-text-operation/v1" || !uuid.test(r.id) || !["vault", "agent-skill-files"].includes(r.capability)
    || !short(r.targetRef) || !["create", "replace", "exact-segment"].includes(r.mode) || !hash.test(r.targetIdentity)
    || !Number.isSafeInteger(r.revision) || r.revision < 0 || !(Number.isSafeInteger(r.authorizationGeneration) && r.authorizationGeneration >= 1
      || r.authorizationGeneration === "initial" || uuid.test(r.authorizationGeneration))
    || typeof r.after !== "string" || Buffer.byteLength(r.after) > 256 * 1024 || r.afterSha256 !== sha(r.after)
    || !instant(r.createdAt) || r.at !== r.createdAt) fail();
  if (r.before !== null && (!exact(r.before, ["sha256", "fingerprint", "parentIdentity", "content"])
    || !hash.test(r.before.sha256) || !short(r.before.fingerprint) || !short(r.before.parentIdentity) || typeof r.before.content !== "string"
    || Buffer.byteLength(r.before.content) > 256 * 1024 || sha(r.before.content) !== r.before.sha256)) fail();
  if (r.mode === "create" ? r.before !== null : r.before === null) fail();
  return r;
}
function validateReceipt(type, r) {
  const extras = type === "applied" ? ["sha256", "fingerprint"] : type === "rollback-started" ? ["expectedFingerprint"] : ["sha256", "fingerprint"];
  if (!exact(r, ["schema", "id", "type", "at", ...extras]) || r.schema !== "scoped-text-receipt/v1" || !uuid.test(r.id) || r.type !== type || !instant(r.at)) fail();
  if (type === "rollback-started" ? !short(r.expectedFingerprint)
    : !(hash.test(r.sha256) && short(r.fingerprint) || type === "rolled-back" && r.sha256 === "" && r.fingerprint === "")) fail();
  return r;
}
const withoutComplete = row => { if (!row) return null; const { completedAt: _unused, ...rest } = row; return rest; };
export function createScopedTextJournal(directory, { createConfigJournal, filesystem }) {
  const common = { ...(filesystem ? { filesystem } : {}), label: "受控文字", readLimit: 1024 * 1024 };
  const prepared = createConfigJournal(directory, { ...common, folder: "scoped-text-prepared", validate: validatePrepared });
  const sets = Object.fromEntries(["applied", "rollback-started", "rolled-back"].map(type => [type,
    createConfigJournal(directory, { ...common, folder: "scoped-text-" + type, validate: r => validateReceipt(type, r) })]));
  async function add(type, id, values, options = {}) {
    if (!await prepared.get(id)) fail();
    const record = { schema: "scoped-text-receipt/v1", id, type, ...values };
    validateReceipt(type, record);
    const existing = withoutComplete(await sets[type].get(id));
    if (existing) { if (JSON.stringify(existing) !== JSON.stringify(record)) fail(); return existing; }
    return withoutComplete(await sets[type].prepare(record,options));
  }
  return {
    async prepare(r, options = {}) { return withoutComplete(await prepared.prepare({ ...r, at: r.createdAt },options)); },
    async read(id) { const row = withoutComplete(await prepared.get(id)); if (!row) return null; const { at: _at, ...r } = row; return r; },
    applied: (id, values, options) => add("applied", id, values, options),
    appliedReceipt: async id => withoutComplete(await sets.applied.get(id)),
    rollbackStarted: (id, values, options) => add("rollback-started", id, values, options),
    rolledBack: (id, values, options) => add("rolled-back", id, values, options),
    rolledBackReceipt: async id => withoutComplete(await sets["rolled-back"].get(id)),
    async unresolvedForTarget(ref) {
      const result = [];
      for (const row of await prepared.list()) {
        if (row.targetRef !== ref || await sets.applied.get(row.id) || await sets["rolled-back"].get(row.id)) continue;
        const { completedAt: _completed, at: _at, ...record } = row; result.push(record);
      }
      return result;
    },
    async history() { return (await prepared.list()).map(r => ({ operationId: r.id, capability: r.capability, targetRef: r.targetRef,
      beforeSha256: r.before?.sha256 || "", afterSha256: r.afterSha256, at: r.createdAt })); },
  };
}
