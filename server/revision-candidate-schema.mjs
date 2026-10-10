// 主库集合 revisionCandidates（进化回路 v1，产品定义 v1.1 §4.6）：用户把 Agent 回复粘贴回工作台后
// 生成的改版候选。旧库缺失按空处理，不写迁移。候选只能追加；正文等身份字段不可改写；
// 待处理只能单向变为“已采用”或“已退回”，决定后不可更改，也不能删除。
// 采用时同一次保存在资产历史末尾追加新版本，版本上的 candidateId 与候选的 adoptedVersionId 互相指向。
import { CANDIDATE_LIMITS } from "../src/evolution.js";

function invalid(message) {
  throw Object.assign(new Error(`数据校验失败：${message}`), { status: 400 });
}
const CONTROL = /[\x00-\x08\x0b-\x1f\x7f]/;
const plain = (value) =>
  value && typeof value === "object" && !Array.isArray(value);
const id = (value) => {
  if (typeof value !== "string" || !/^[a-zA-Z0-9_-]{1,100}$/.test(value))
    invalid("改版候选 ID");
};
const date = (value) => {
  if (
    typeof value !== "string" ||
    value.length > 40 ||
    !Number.isFinite(Date.parse(value))
  )
    invalid("改版候选时间");
};
const paragraph = (value, label, max, required = true) => {
  if (
    typeof value !== "string" ||
    (required && !value.trim()) ||
    value.length > max ||
    CONTROL.test(value)
  )
    invalid(label);
};
const REQUIRED = [
  "schema",
  "id",
  "assetId",
  "baseVersionId",
  "content",
  "changeNote",
  "createdAt",
  "status",
];
const OPTIONAL = ["decidedAt", "adoptedVersionId", "returnReason"];
const STATUSES = ["pending", "adopted", "returned"];

export function validateRevisionCandidates(state) {
  const list = state.revisionCandidates;
  if (list === undefined) {
    if (
      state.assets.some((a) => a?.versions?.some((v) => v?.candidateId !== undefined))
    )
      invalid("版本注明的改版候选不存在");
    return;
  }
  if (!Array.isArray(list) || list.length > CANDIDATE_LIMITS.candidates)
    invalid("改版候选数量");
  const assets = new Map(state.assets.map((a) => [a.id, a]));
  const byId = new Map();
  let pending = 0;
  for (const c of list) {
    if (!plain(c)) invalid("改版候选格式");
    const keys = Object.keys(c);
    if (
      REQUIRED.some((k) => !Object.hasOwn(c, k)) ||
      keys.some((k) => !REQUIRED.includes(k) && !OPTIONAL.includes(k))
    )
      invalid("改版候选包含不支持或缺少的字段");
    if (c.schema !== 1) invalid("改版候选版本");
    id(c.id);
    id(c.assetId);
    id(c.baseVersionId);
    if (byId.has(c.id)) invalid("改版候选 ID 重复");
    byId.set(c.id, c);
    const asset = assets.get(c.assetId);
    if (!asset) invalid("改版候选所属资产不存在");
    if (["Skill", "MCP"].includes(asset.type)) invalid("Skill 与 MCP 结构化资产不支持正文改版候选");
    if (!asset.versions.some((v) => v.id === c.baseVersionId))
      invalid("改版候选的基准版本不存在");
    paragraph(c.content, "改版候选正文", CANDIDATE_LIMITS.content);
    paragraph(c.changeNote, "改版候选改动说明", CANDIDATE_LIMITS.changeNote);
    date(c.createdAt);
    if (!STATUSES.includes(c.status)) invalid("改版候选状态");
    if (c.status === "pending") {
      pending++;
      if (OPTIONAL.some((k) => c[k] !== undefined))
        invalid("待处理的改版候选不能带决定结果");
      continue;
    }
    if (c.decidedAt === undefined) invalid("已决定的改版候选缺少决定时间");
    date(c.decidedAt);
    if (c.status === "adopted") {
      if (c.returnReason !== undefined) invalid("已采用的改版候选不能带退回原因");
      id(c.adoptedVersionId);
      const index = asset.versions.findIndex((v) => v.id === c.adoptedVersionId);
      const version = asset.versions[index];
      if (!version || version.candidateId !== c.id)
        invalid("已采用的改版候选没有对应的新版本");
      if (index < 1 || asset.versions[index - 1].id !== c.baseVersionId)
        invalid("采用生成的版本必须紧接在候选的基准版本之后");
      if (version.content !== c.content) invalid("采用生成的版本正文与候选不一致");
    } else {
      if (c.adoptedVersionId !== undefined) invalid("已退回的改版候选不能带新版本");
      if (c.returnReason !== undefined)
        paragraph(c.returnReason, "退回原因", CANDIDATE_LIMITS.returnReason);
    }
  }
  if (pending > CANDIDATE_LIMITS.pending) invalid("待处理的改版候选数量");
  for (const a of state.assets)
    for (const v of a.versions) {
      if (v.candidateId === undefined) continue;
      id(v.candidateId);
      const c = byId.get(v.candidateId);
      if (
        !c ||
        c.status !== "adopted" ||
        c.assetId !== a.id ||
        c.adoptedVersionId !== v.id
      )
        invalid("版本注明的改版候选不存在或未被采用");
    }
}

const sorted = (value) =>
  JSON.stringify(value, (key, item) =>
    plain(item)
      ? Object.fromEntries(Object.keys(item).sort().map((k) => [k, item[k]]))
      : item,
  );
const identity = ({ status, decidedAt, adoptedVersionId, returnReason, ...rest }) =>
  sorted(rest);
// allowImport：备份导入可以带来已决定的新候选；普通保存新增的候选必须是待处理。
export function validateCandidateHistory(previous = [], next = [], allowImport = false) {
  const nextById = new Map(next.map((c) => [c.id, c]));
  const oldIds = new Set();
  for (const old of previous) {
    oldIds.add(old.id);
    const current = nextById.get(old.id);
    if (!current) invalid("改版候选不能删除");
    if (identity(current) !== identity(old)) invalid("改版候选内容不可改写");
    if (old.status !== "pending" && sorted(current) !== sorted(old))
      invalid("已处理的改版候选不可更改");
  }
  if (!allowImport)
    for (const c of next)
      if (!oldIds.has(c.id) && c.status !== "pending")
        invalid("新的改版候选必须是待处理状态");
}
