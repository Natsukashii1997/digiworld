// 协同操作留痕 v1（路线 v3 切片 2.3/2.4）：顶层集合 collabLog，只记“口令已复制”这一事实。
// 不存口令正文，只存其 SHA-256；时间与 schema 由服务端生成。旧库缺失按空；只增不改。
import { invalid, equivalent } from "./schema.mjs";

export const COLLAB_AGENT_IDS = ["codex", "claude-code", "hermes"];
export const COLLAB_KINDS = ["dispatch", "start"];
export const COLLAB_STAGE_IDS = [
  "claim",
  "implement",
  "review",
  "rework",
  "accept",
  "unknown",
];
export const COLLAB_LOG_LIMIT = 20000;
const RECORD_KEYS = [
  "schema",
  "id",
  "kind",
  "projectId",
  "projectName",
  "agent",
  "stateId",
  "stage",
  "promptSha256",
  "at",
];
const identifier = (s) =>
  typeof s === "string" && /^[a-zA-Z0-9_-]{1,100}$/.test(s);
export const STATE_ID = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/;

export function validateCollabLog(state) {
  const records = state.collabLog === undefined ? [] : state.collabLog;
  if (!Array.isArray(records) || records.length > COLLAB_LOG_LIMIT)
    invalid("操作留痕容量");
  const ids = new Set();
  for (const r of records) {
    if (!r || typeof r !== "object" || Array.isArray(r))
      invalid("操作留痕格式");
    if (Object.keys(r).some((k) => !RECORD_KEYS.includes(k)) || r.schema !== 1)
      invalid("操作留痕字段");
    if (!identifier(r.id) || ids.has(r.id)) invalid("操作留痕 ID");
    ids.add(r.id);
    if (!COLLAB_KINDS.includes(r.kind)) invalid("操作留痕种类");
    if (!identifier(r.projectId)) invalid("操作留痕项目");
    if (
      typeof r.projectName !== "string" ||
      !r.projectName.trim() ||
      r.projectName.length > 200 ||
      /[\x00-\x1f\x7f]/.test(r.projectName)
    )
      invalid("操作留痕项目名称");
    if (!COLLAB_AGENT_IDS.includes(r.agent) && !(r.kind === "start" && r.agent === "openclaw")) invalid("操作留痕 Agent");
    if (r.stateId !== undefined && (typeof r.stateId !== "string" || !STATE_ID.test(r.stateId)))
      invalid("操作留痕状态编号");
    if (r.stage !== undefined && !COLLAB_STAGE_IDS.includes(r.stage))
      invalid("操作留痕阶段");
    if (typeof r.promptSha256 !== "string" || !/^[a-f0-9]{64}$/.test(r.promptSha256))
      invalid("操作留痕口令指纹");
    if (
      typeof r.at !== "string" ||
      !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(r.at) ||
      !Number.isFinite(Date.parse(r.at))
    )
      invalid("操作留痕时间");
  }
}

// 普通保存不能动留痕；专用追加只能在末尾加，已有记录逐条不变。
export function validateCollabHistory(before = [], after = [], allow = false) {
  if (!allow) {
    if (!equivalent(before, after))
      invalid("操作留痕只能通过复制口令追加");
    return;
  }
  if (
    after.length < before.length ||
    !before.every((r, i) => equivalent(r, after[i]))
  )
    invalid("操作留痕只能追加，不能改写或删除");
}
