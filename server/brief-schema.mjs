// 每日项目简报的已读状态（项目空间第二批）：顶层集合 briefReads。
// 每条只记：哪天（本机日期）、哪个项目、看到的段落指纹、标记时间。不存段落正文。
// 旧库缺失按空；普通保存不能改，只能经“标为已读”专用操作更新；不随备份导入。
import { invalid, equivalent } from "./schema.mjs";

export const BRIEF_READS_LIMIT = 1000;
export const BRIEF_KEEP_DAYS = 31;
const KEYS = ["schema", "date", "projectId", "digest", "at"];

export function isBriefDate(value) {
  if (typeof value !== "string" || !/^\d{4}-\d\d-\d\d$/.test(value)) return false;
  const [y, m, d] = value.split("-").map(Number);
  const t = new Date(Date.UTC(y, m - 1, d));
  return t.getUTCFullYear() === y && t.getUTCMonth() === m - 1 && t.getUTCDate() === d;
}

export function validateBriefReads(state) {
  const reads = state.briefReads === undefined ? [] : state.briefReads;
  if (!Array.isArray(reads) || reads.length > BRIEF_READS_LIMIT)
    invalid("简报已读状态容量");
  const seen = new Set();
  for (const r of reads) {
    if (!r || typeof r !== "object" || Array.isArray(r))
      invalid("简报已读状态格式");
    if (Object.keys(r).some((k) => !KEYS.includes(k)) || r.schema !== 1)
      invalid("简报已读状态字段");
    if (!isBriefDate(r.date)) invalid("简报已读日期");
    if (typeof r.projectId !== "string" || !/^[a-zA-Z0-9_-]{1,100}$/.test(r.projectId))
      invalid("简报已读项目");
    if (typeof r.digest !== "string" || !/^[a-f0-9]{64}$/.test(r.digest))
      invalid("简报已读指纹");
    if (
      typeof r.at !== "string" ||
      !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(r.at) ||
      !Number.isFinite(Date.parse(r.at))
    )
      invalid("简报已读时间");
    const key = `${r.date} ${r.projectId}`;
    if (seen.has(key)) invalid("简报已读状态重复");
    seen.add(key);
  }
}

export function validateBriefHistory(before = [], after = [], allow = false) {
  if (!allow && !equivalent(before, after))
    invalid("简报已读状态只能通过“标为已读”更新");
}
