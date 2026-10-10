import { invalid, equivalent } from "./schema.mjs";

const identifier = (s) =>
  typeof s === "string" && /^[a-zA-Z0-9_-]{1,100}$/.test(s);
export function validateActivityNote(note, version) {
  if (typeof note !== "string" || note.length > 500)
    invalid("反馈备注最多 500 字");
  // Do not echo rejected content into diagnostics. These are bounded patterns,
  // not a claim that arbitrary unlabelled secrets can be detected.
  const pathOrLink =
    /https?:\/\/|file:\/\/|(?:^|[\s"'（(:：])(?:\/(?=\S)|~\/)|~\/(?=[A-Za-z0-9._~-]|[^\s/\\]+\/)|(?<![A-Za-z0-9._~-])\/[^\s/\\]+\/|[A-Za-z]:[\\/]|\\\\[^\s\\]+\\/im;
  const credential =
    /\b(?:sk-|ghp_|github_pat_|xox[baprs]-)[A-Za-z0-9_-]+|-----BEGIN|(?:api[_ -]?key|secret|password|密钥|密码)\s*[:=：]\s*\S+|token\s*[:=：]\s*[A-Za-z0-9_+./=-]+/i;
  // A slash inside prose (4/5, A/B, json/yaml) is not a rooted path.
  // "token: 省了很多" describes usage, unlike an ASCII credential value.
  if (pathOrLink.test(note) || credential.test(note))
    invalid("反馈请只填写效果评价，不含路径、链接或凭据");
  const texts = [
    version.content,
    ...version.files.filter((file) => file.text).map((file) => file.data),
  ];
  if (
    note.trim() &&
    texts.some(
      (text) =>
        text?.trim() && text.trim().length <= 500 && note.includes(text.trim()),
    )
  )
    invalid("反馈不能包含资产完整正文");
}
export function validateActivity(state) {
  const records = state.assetActivity === undefined ? [] : state.assetActivity;
  if (!Array.isArray(records) || records.length > 20000)
    invalid("使用与反馈记录容量");
  const ids = new Map();
  const assets = new Map(
    state.assets.map((a) => [
      a.id,
      { asset: a, versions: new Map(a.versions.map((v) => [v.id, v])) },
    ]),
  );
  for (const r of records) {
    if (!r || typeof r !== "object" || Array.isArray(r))
      invalid("使用记录格式");
    const base = ["schema", "id", "assetId", "versionId", "at", "kind"];
    const allowed =
      r.kind === "use"
        ? [...base, "action", "deliveryId", "usedAt"]
        : [...base, "rating", "note", "useId"];
    if (Object.keys(r).some((k) => !allowed.includes(k)) || r.schema !== 1)
      invalid("使用记录字段");
    if (![r.id, r.assetId, r.versionId].every(identifier) || ids.has(r.id))
      invalid("使用记录 ID");
    if (
      typeof r.at !== "string" ||
      !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(r.at) ||
      !Number.isFinite(Date.parse(r.at))
    )
      invalid("使用记录时间");
    const entry = assets.get(r.assetId),
      asset = entry?.asset,
      version = entry?.versions.get(r.versionId);
    if (!version) invalid("使用记录固定版本不存在");
    if (r.kind === "use") {
      if (
        r.usedAt !== undefined &&
        (typeof r.usedAt !== "string" ||
          !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(r.usedAt) ||
          !Number.isFinite(Date.parse(r.usedAt)) ||
          Date.parse(r.usedAt) > Date.parse(r.at) + 60000)
      )
        invalid("使用发生时间无效");
      if (
        r.action !==
        {
          Prompt: "copy-prompt",
          Workflow: "copy-workflow",
          Skill: "copy-skill",
          Rule: "copy-rule",
          MCP: "copy-mcp-config",
        }[asset.type]
      )
        invalid("使用动作类型");
      if (
        asset.type === "Skill"
          ? !identifier(r.deliveryId)
          : r.deliveryId !== undefined
      )
        invalid("交付记录身份");
    } else if (r.kind === "feedback") {
      if (
        !["good", "improve"].includes(r.rating) ||
        (r.useId !== undefined && !identifier(r.useId))
      )
        invalid("反馈类型或使用关联");
      validateActivityNote(r.note, version);
    } else invalid("使用记录种类");
    ids.set(r.id, r);
  }
  for (const r of records.filter((r) => r.kind === "feedback" && r.useId)) {
    const use = ids.get(r.useId);
    if (
      !use ||
      use.kind !== "use" ||
      use.assetId !== r.assetId ||
      use.versionId !== r.versionId ||
      use.at > r.at
    )
      invalid("反馈使用关联不匹配");
  }
}
export function validateActivityHistory(before, after, allow) {
  if (!allow && !equivalent(before, after))
    invalid("使用与反馈只能通过专用操作更新");
  const records = new Map(after.map((r) => [r.id, r]));
  if (before.some((r) => !equivalent(r, records.get(r.id))))
    invalid("使用与反馈历史不可覆盖或移除");
}
