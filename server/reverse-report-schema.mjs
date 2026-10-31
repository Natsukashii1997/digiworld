// 逆向 v5 回执通道：顶层集合 reverseReports。外部 Agent 经 MCP reverse_report 交回一轮的回执，进待过目；
// 用户预览后采纳（写进档案）或退回。旧库缺失按空；普通保存不能改，只能经专用接口更新。
import { invalid, equivalent } from "./schema.mjs";

export const REVERSE_REPORT_LIMITS = { reports: 200, pending: 20, text: 50000, proposer: 60 };
export const REPORT_KINDS = ["report", "replica", "skill"];
export const REPORT_STATUSES = ["pending", "adopted", "rejected"];
const ID = /^[a-zA-Z0-9_-]{1,100}$/;
const AT = /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/;
const CONTROL = /[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/;
const LINE_CONTROL = /[\x00-\x1f\x7f]/;
const time = (value, label) => {
  if (typeof value !== "string" || !AT.test(value) || !Number.isFinite(Date.parse(value))) invalid(label);
};

export function validateReverseReports(state) {
  const list = state.reverseReports === undefined ? [] : state.reverseReports;
  if (!Array.isArray(list) || list.length > REVERSE_REPORT_LIMITS.reports) invalid("逆向回执数量");
  const ids = new Set(), records = new Set((state.reverseRecords || []).map((r) => r.id));
  let pending = 0;
  for (const r of list) {
    if (!r || typeof r !== "object" || Array.isArray(r) ||
      Object.keys(r).some((k) => !["id", "recordId", "round", "kind", "text", "proposer", "createdAt", "status", "decidedAt"].includes(k)))
      invalid("逆向回执字段");
    if (typeof r.id !== "string" || !ID.test(r.id) || ids.has(r.id)) invalid("逆向回执 ID");
    ids.add(r.id);
    if (typeof r.recordId !== "string" || !records.has(r.recordId)) invalid("逆向回执所属记录");
    if (!Number.isInteger(r.round) || r.round < 1) invalid("逆向回执轮次");
    if (!REPORT_KINDS.includes(r.kind)) invalid("逆向回执类型");
    if (typeof r.text !== "string" || !r.text.trim() || r.text.length > REVERSE_REPORT_LIMITS.text || CONTROL.test(r.text))
      invalid("逆向回执正文");
    if (typeof r.proposer !== "string" || !r.proposer.trim() || r.proposer.length > REVERSE_REPORT_LIMITS.proposer || LINE_CONTROL.test(r.proposer))
      invalid("逆向回执提交者");
    time(r.createdAt, "逆向回执时间");
    if (!REPORT_STATUSES.includes(r.status)) invalid("逆向回执状态");
    if (r.status === "pending") {
      if (r.decidedAt !== undefined) invalid("待过目回执不能带处理时间");
      pending++;
    } else time(r.decidedAt, "逆向回执处理时间");
  }
  if (pending > REVERSE_REPORT_LIMITS.pending) invalid("待过目回执数量");
}

// 回执只追加；内容不可改写；待过目只能单向变成已采纳或已退回；已处理的可在容量清理时移除，待过目的不能删。
export function validateReverseReportHistory(previous = [], next = [], allowed = false) {
  if (!allowed && !equivalent(previous, next)) invalid("逆向回执只能通过专用操作更新");
  for (const old of previous) {
    const current = next.find((r) => r.id === old.id);
    if (!current) {
      if (old.status === "pending") invalid("待过目的逆向回执不能被删除");
      continue;
    }
    const { status, decidedAt, ...rest } = current, { status: s0, decidedAt: d0, ...rest0 } = old;
    if (!equivalent(rest, rest0)) invalid("逆向回执内容不可改写");
    if (old.status !== "pending" && !equivalent(current, old)) invalid("已处理的逆向回执不可更改");
  }
}
