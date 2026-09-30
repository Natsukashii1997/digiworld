// 主库字段 knowledgeZones（三区规则、个人说明共享授权）与 profileProposals（Agent 通过 MCP 提交的
// 个人说明修改建议队列）的结构与历史约束。两者都只能经由 server/knowledge-profile.mjs 的专用操作更新。
import { validateZoneRules } from "../src/knowledge-zones.js";

function invalid(message) {
  throw Object.assign(new Error(`数据校验失败：${message}`), { status: 400 });
}
export const PROFILE_LIMITS = Object.freeze({
  proposals: 200,
  pending: 50,
  paragraph: 4000,
  reason: 1000,
  proposer: 60,
  path: 1000,
});
const CONTROL = /[\x00-\x08\x0b-\x1f\x7f]/;
const plain = (value) =>
  value && typeof value === "object" && !Array.isArray(value);
const exactKeys = (value, required, optional = []) => {
  if (!plain(value)) invalid("对象");
  const keys = Object.keys(value);
  if (
    required.some((key) => !Object.hasOwn(value, key)) ||
    keys.some((key) => !required.includes(key) && !optional.includes(key))
  )
    invalid("包含不支持或缺少的字段");
};
const date = (value) => {
  if (typeof value !== "string" || value.length > 40 || !Number.isFinite(Date.parse(value)))
    invalid("时间格式");
};
const sha = (value) => {
  if (typeof value !== "string" || !/^[a-f0-9]{64}$/.test(value)) invalid("指纹");
};
const id = (value) => {
  if (typeof value !== "string" || !/^[a-zA-Z0-9_-]{1,100}$/.test(value)) invalid("记录 ID");
};
// 多行文本：非空、有上限、除换行与制表符外无控制字符。
export function paragraphText(value, label, max) {
  if (typeof value !== "string" || !value.trim() || value.length > max || CONTROL.test(value))
    invalid(label);
}
// 单行短文本（提出者）。
export function lineText(value, label, max) {
  if (typeof value !== "string" || !value.trim() || value.length > max || /[\x00-\x1f\x7f]/.test(value))
    invalid(label);
}
// Vault 内相对 Markdown 路径：不越界、不隐藏、不含反斜杠或冒号。是否属于个人说明区由服务按规则判断。
export function vaultMarkdownPath(value) {
  if (
    typeof value !== "string" ||
    value.length > PROFILE_LIMITS.path ||
    !/\.md$/i.test(value) ||
    /[\\:\x00-\x1f\x7f]/.test(value) ||
    value.split("/").some((part) => !part || part.startsWith(".") || part !== part.trim())
  )
    invalid("目标文件必须是 Vault 内的相对 Markdown 路径");
  return value;
}

export function validateKnowledgeZones(value) {
  exactKeys(value, ["schema", "rules", "sourceId", "profileSharing", "updatedAt"]);
  if (value.schema !== 1) invalid("三区规则版本");
  try {
    validateZoneRules(value.rules);
  } catch (error) {
    invalid(error.message);
  }
  if (value.sourceId !== null) id(value.sourceId);
  if (typeof value.profileSharing !== "boolean") invalid("个人说明共享状态");
  date(value.updatedAt);
}

const STATUSES = ["pending", "rejected", "confirmed"];
export function validateProposal(p) {
  exactKeys(
    p,
    ["schema", "id", "sourceId", "path", "original", "proposed", "reason", "proposer", "baseSha256", "createdAt", "status"],
    ["decidedAt", "confirmation"],
  );
  if (p.schema !== 1) invalid("建议版本");
  id(p.id);
  id(p.sourceId);
  vaultMarkdownPath(p.path);
  paragraphText(p.original, "原段落", PROFILE_LIMITS.paragraph);
  paragraphText(p.proposed, "建议段落", PROFILE_LIMITS.paragraph);
  if (p.original === p.proposed) invalid("建议段落与原段落相同");
  paragraphText(p.reason, "理由", PROFILE_LIMITS.reason);
  lineText(p.proposer, "提出者", PROFILE_LIMITS.proposer);
  sha(p.baseSha256);
  date(p.createdAt);
  if (!STATUSES.includes(p.status)) invalid("建议状态");
  if (p.status === "pending") {
    if (p.decidedAt !== undefined || p.confirmation !== undefined) invalid("待处理建议不能带决定结果");
  } else date(p.decidedAt);
  if (p.status === "confirmed") {
    exactKeys(p.confirmation, ["baseSha256", "resultSha256", "confirmedAt", "write"]);
    sha(p.confirmation.baseSha256);
    sha(p.confirmation.resultSha256);
    date(p.confirmation.confirmedAt);
    // 写入 Vault 尚未实现：确认后等待本机受控写入接口（需本机验证）。
    if (p.confirmation.write !== "awaiting_local") invalid("写入状态");
  } else if (p.confirmation !== undefined) invalid("只有已确认的建议带确认结果");
}
export function validateProfileProposals(list) {
  if (!Array.isArray(list) || list.length > PROFILE_LIMITS.proposals) invalid("个人说明建议数量");
  const ids = new Set();
  let pending = 0;
  for (const p of list) {
    validateProposal(p);
    if (ids.has(p.id)) invalid("建议 ID 重复");
    ids.add(p.id);
    if (p.status === "pending") pending++;
  }
  if (pending > PROFILE_LIMITS.pending) invalid("待处理建议数量");
}

const sorted = (value) =>
  JSON.stringify(value, (key, item) =>
    plain(item) ? Object.fromEntries(Object.keys(item).sort().map((k) => [k, item[k]])) : item,
  );
const identity = ({ status, decidedAt, confirmation, ...rest }) => sorted(rest);
// 建议只能追加；内容不可改写；待处理只能单向变为已拒绝或已确认；已决定的建议可在容量清理时移除。
export function validateProfileHistory(previous = [], next = []) {
  for (const old of previous) {
    const current = next.find((p) => p.id === old.id);
    if (!current) {
      if (old.status === "pending") invalid("待处理的个人说明建议不能被删除");
      continue;
    }
    if (identity(current) !== identity(old)) invalid("个人说明建议内容不可改写");
    if (old.status !== "pending" && sorted(current) !== sorted(old))
      invalid("已处理的个人说明建议不可更改");
  }
}
