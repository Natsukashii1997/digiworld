// 元数据操作日志：复用ConfigJournal文件安全，不存Key/请求原文/报告大正文到主库。
import {guardCapabilityFilesystem} from "./guarded-capability-filesystem.mjs";
const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
const hash = /^[a-f0-9]{64}$/;
const instant = value => typeof value === "string" && /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(value) && Number.isFinite(Date.parse(value));
const fail = () => { throw Object.assign(new Error("能力操作日志无法核验，停止新执行"), { code: "INVALID_CAPABILITY_JOURNAL" }); };
const exact = (r, keys) => r && typeof r === "object" && !Array.isArray(r) && Object.keys(r).length === keys.length && keys.every(k => Object.hasOwn(r, k));
const metadataKeys = new Set(["provider", "model", "targetId", "projectId", "sourceRef", "version", "identity", "sessionId", "backupCredentialRef",
  "expectedCredentialRef", "credentialExisted", "authorizationGeneration", "revision", "enabledBefore", "enabledAfter",
  "taskId", "budgetMicrosUsd", "timeoutMs", "maxTurns", "outputRelativePath", "inputSha256", "inputBytes", "maxOutputTokens", "estimateMicrosUsd",
  "beforeProvider", "beforeModel", "budgetSource", "instructionSha256", "fileManifestSha256","priceSource","priceAsOf"]);
function primitiveMap(map) {
  if (!map || typeof map !== "object" || Array.isArray(map) || Object.keys(map).length > 40) fail();
  for (const [key, value] of Object.entries(map)) {
    if (!metadataKeys.has(key) || !(value === null || typeof value === "boolean" || Number.isSafeInteger(value)
      || typeof value === "string" && value.length <= 2048 && !/[\0\r\n]/.test(value))) fail();
  }
}
function validatePrepared(r) {
  if (!exact(r, ["schema", "id", "capability", "action", "targetRef", "beforeSha256", "afterSha256", "metadata", "at"])
    || r.schema !== "capability-operation/v1" || !uuid.test(r.id) || !["model", "night", "agent", "vault", "daemon", "switch"].includes(r.capability)
    || !/^[a-z-]{1,50}$/.test(r.action) || typeof r.targetRef !== "string" || r.targetRef.length > 2048
    || ![r.beforeSha256, r.afterSha256].every(v => v === "" || hash.test(v)) || !instant(r.at)) fail();
  primitiveMap(r.metadata); return r;
}
function validateStep(type, r) {
  if (!exact(r, ["schema", "id", "type", "value", "at"]) || r.schema !== "capability-step/v1" || !uuid.test(r.id) || r.type !== type || !instant(r.at)) fail();
  const value = r.value;
  if (type === "started") {
    if (!exact(value, ["phase"]) || value.phase !== "execution_started") fail();
  } else if (type === "process") {
    if (!exact(value, ["pid", "processGroup", "sessionId"]) || !Number.isSafeInteger(value.pid) || value.pid < 1
      || value.processGroup !== value.pid || !uuid.test(value.sessionId)) fail();
  } else {
    const allowed = new Set(["status", "reason", "outputSha256", "outputArtifactRef", "outputFingerprint", "requestRef", "costMicrosUsd", "costSource", "billedCost",
      "usage", "exitCode", "exitSignal", "stopped", "models", "hasCredential", "reachable", "generationVerified", "httpStatus", "durationMs"]);
    if (!value || typeof value !== "object" || Array.isArray(value) || Object.keys(value).some(k => !allowed.has(k))
      || !["verified", "failed", "unknown", "not_started", "not_applied", "rolled_back"].includes(value.status)) fail();
    for (const [key, item] of Object.entries(value)) {
      if (key === "usage") {
        if (item !== null && (typeof item !== "object" || Object.entries(item).some(([k, v]) =>
          !["input_tokens", "output_tokens", "cache_creation_input_tokens", "cache_read_input_tokens"].includes(k) || !Number.isSafeInteger(v) || v < 0))) fail();
      } else if (key === "models") {
        if (!Array.isArray(item) || item.length > 500 || item.some(v => typeof v !== "string" || !/^[a-zA-Z0-9._:-]{1,128}$/.test(v))) fail();
      } else if (!(item === null || typeof item === "boolean" || Number.isSafeInteger(item) || typeof item === "string" && item.length <= 2048 && !item.includes("\0"))) fail();
    }
    if (value.billedCost !== undefined && value.billedCost !== null) fail();
  }
  return r;
}
const strip = row => { if (!row) return null; const { completedAt: _unused, ...rest } = row; return rest; };
export function createCapabilityOperationJournal(directory, { createConfigJournal, filesystem, now = () => new Date().toISOString() }) {
  const common = { ...(filesystem ? { filesystem } : {}), label: "能力", readLimit: 256 * 1024 };
  const prepared = createConfigJournal(directory, { ...common, folder: "capability-prepared", validate: validatePrepared });
  const steps = Object.fromEntries(["started", "process", "completed", "stopped", "delivered", "rolled-back"].map(type => [type,
    createConfigJournal(directory, { ...common, folder: "capability-" + type, validate: r => validateStep(type, r) })]));
  const locks = new Map();
  async function locked(id, fn) {
    const old = locks.get(id) || Promise.resolve(); let release;
    const waiting = new Promise(r => { release = r; }); locks.set(id, old.then(() => waiting));
    await old; try { return await fn(); } finally { release(); }
  }
  async function writeStep(type, id, value, {guard}={}) {
    if (!await prepared.get(id)) fail();
    const record = { schema: "capability-step/v1", id, type, value, at: now() }; validateStep(type, record);
    const old = await steps[type].get(id);
    if (old) return strip(old).value; // immutable，不能把未知旧回执覆盖成成功。
    const target=guard?createConfigJournal(directory,{...common,filesystem:guardCapabilityFilesystem(filesystem,guard),folder:"capability-"+type,validate:r=>validateStep(type,r)}):steps[type];
    if(guard)await guard();await target.prepare(record); return value;
  }
  async function checkExisting(id) {
    const record = strip(await prepared.get(id)); if (!record) return { exists: false, phase: "not_started", executionStarted: false };
    const done = await steps.completed.get(id), stop = await steps.stopped.get(id),delivery = await steps.delivered.get(id), undo = await steps["rolled-back"].get(id), start = await steps.started.get(id), process = await steps.process.get(id);
    return { exists: true, record, phase: undo ? "rolled_back" : done ? "completed" : start ? "started" : "prepared",
      executionStarted: Boolean(start),startedAt:start?.at||null,receipt: undo?.value || done?.value || null,processStopped:Boolean(stop)||done?.value?.stopped===true,delivered: Boolean(delivery), process: process?.value || null };
  }
  return {
    prepare: async r => strip(await prepared.prepare(r)),
    checkExisting,
    started: id => locked(id, async () => { if ((await checkExisting(id)).phase !== "prepared") return false;
      await writeStep("started", id, { phase: "execution_started" }); return true; }),
    processStarted: (id, p) => writeStep("process", id, p),
    completed: (id, r) => writeStep("completed", id, r),
    delivered: id => writeStep("delivered", id, {status:"verified"}),
    confirmStopped:id=>writeStep("stopped",id,{status:"verified",stopped:true}),
    rolledBack: (id, r, options) => writeStep("rolled-back", id, r, options),
    async list() { const result = []; for (const row of await prepared.list()) result.push(await checkExisting(row.id)); return result; },
    async unresolvedForTarget(targetRef) {
      return (await this.list()).filter(row => row.record.targetRef === targetRef && row.executionStarted
        && (!row.receipt||row.receipt.status==="unknown")&&row.phase!=="rolled_back");
    },
  };
}
