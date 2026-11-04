// 逆向 v5 回执通道（#47）：外部 Agent 交回一轮的回执 → 待过目 → 用户预览后采纳或退回。照个人说明修改建议的「提交 → 预览 → 确认」。
// 工作台不取证、不调模型：这里只存回执原文、拆格、写回档案。拆解回执（report）写八格，复刻对照（replica，#55）写 hatch.replica。
import { randomUUID } from "node:crypto";
import { failure } from "./repository.mjs";
import { REVERSE_REPORT_LIMITS } from "./reverse-report-schema.mjs";
import { SLOT_IDS } from "../src/reverse-hatch.js";
import { adoptReport, adoptReplica, parseReplica } from "../src/reverse-flow.js";
import { filterRelayText } from "../src/relay-prompt.js";

const PREVIEW_TTL = 5 * 60 * 1000;
const ACCEPTED_KINDS = ["report", "replica"];
const shape = (input, allowed) => {
  if (!input || typeof input !== "object" || Array.isArray(input) || Object.keys(input).some((k) => !allowed.includes(k)))
    throw failure("请求字段无效");
};
const revisionOf = (value) => {
  if (!Number.isInteger(value) || value < 0) throw failure("缺少主库版本，请刷新后重试");
  return value;
};
// 回执原文：统一换行、去掉控制字符、隐去密钥一类内容后再存。
const normalize = (text) => filterRelayText(String(text).replace(/\r\n?/g, "\n").replace(/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/g, "")).text;

export function createReverseReports(repository, { clock = Date.now } = {}) {
  const previews = new Map();
  const now = () => new Date(clock()).toISOString();
  const recordOf = (state, id) => {
    const r = state?.reverseRecords?.find((r) => r.id === id && !r.deletedAt);
    if (!r) throw failure("任务编号对不上：这件参照物不存在或已移入回收区", 404);
    return r;
  };
  const reportOf = (state, id) => {
    const report = (state?.reverseReports || []).find((r) => r.id === id);
    if (!report) throw failure("回执不存在，请刷新待过目", 404);
    if (report.status !== "pending") throw failure("这份回执已处理", 409);
    return report;
  };
  // 写回规则在 adoptReport / adoptReplica（手动粘贴也用它们）；这里把「轮次不在」转成服务端错误。
  const adoptInto = (record, report, { at, overwrite }) => {
    try { return report.kind === "replica" ? adoptReplica(record, report.text, report.round, { at }) : adoptReport(record, report.text, report.round, { at, overwrite }); }
    catch (e) { throw e.status === 409 ? failure(e.message, 409) : e; }
  };

  return {
    // Agent 交回：只进待过目，不改档案。同一记录、同一轮、同一正文重复交回不重复写入。
    async propose(input) {
      shape(input, ["taskId", "round", "kind", "text", "proposer"]);
      if (!ACCEPTED_KINDS.includes(input.kind)) throw failure("回执类型只能是 report（拆解回执）或 replica（复刻对照）");
      if (!Number.isInteger(input.round) || input.round < 1) throw failure("轮次需为正整数");
      if (typeof input.text !== "string") throw failure("回执需为文本");
      if (typeof input.proposer !== "string" || !input.proposer.trim() || input.proposer.length > REVERSE_REPORT_LIMITS.proposer || /[\x00-\x1f\x7f]/.test(input.proposer))
        throw failure(`提交者需为 1–${REVERSE_REPORT_LIMITS.proposer} 字的单行名称`);
      const text = normalize(input.text);
      if (!text.trim()) throw failure("回执为空");
      if (text.length > REVERSE_REPORT_LIMITS.text) throw failure(`回执超过 ${REVERSE_REPORT_LIMITS.text} 字，请精简后再交`);
      // 复刻对照一行都认不出时当场退给 Agent，不进待过目。
      if (input.kind === "replica" && !parseReplica(text).rows.length) throw failure("没认出复刻对照行：每项写成「能力：一致 / 有差异 ｜ 差在哪 / 未验证 ｜ 为什么」");
      let result;
      await repository.updateReverseReports((stored) => {
        const record = recordOf(stored, input.taskId);
        if (!(record.hatch?.rounds || []).some((x) => x.n === input.round)) throw failure("这件参照物没有这一轮，请核对任务编号和轮次", 404);
        const list = stored.reverseReports || [];
        const same = list.find((r) => r.recordId === record.id && r.round === input.round && r.kind === input.kind && r.text === text);
        if (same) {
          result = { id: same.id, status: same.status, duplicate: true };
          return {};
        }
        if (list.filter((r) => r.status === "pending").length >= REVERSE_REPORT_LIMITS.pending)
          throw failure("待过目的回执已达上限，请先在工作台处理", 429);
        const report = { id: randomUUID(), recordId: record.id, round: input.round, kind: input.kind, text, proposer: input.proposer.trim(), createdAt: now(), status: "pending" };
        const next = [...list, report];
        // 超出总量时移除最早的已处理回执；待过目的永不自动移除。
        while (next.length > REVERSE_REPORT_LIMITS.reports) {
          const index = next.findIndex((r) => r.status !== "pending");
          if (index === -1) break;
          next.splice(index, 1);
        }
        result = { id: report.id, status: "pending", duplicate: false };
        return { reverseReports: next };
      });
      return { ...result, recordId: input.taskId, round: input.round };
    },
    // 预览：会写进档案的格子变化、因「你改过」不覆盖的格子、分不进格的段落。token 绑主库版本与覆盖选择。
    async preview(input) {
      shape(input, ["id", "overwrite"]);
      const overwrite = input.overwrite ?? [];
      if (!Array.isArray(overwrite) || overwrite.some((k) => !SLOT_IDS.includes(k))) throw failure("覆盖的格子无效");
      const stored = await repository.read();
      const report = reportOf(stored, input.id);
      const record = recordOf(stored, report.recordId);
      const at = now();
      const adopted = adoptInto(record, report, { at, overwrite });
      for (const [key, value] of previews) if (value.expires <= clock()) previews.delete(key);
      if (previews.size >= 30) previews.delete(previews.keys().next().value);
      const previewId = randomUUID(), expires = clock() + PREVIEW_TTL;
      previews.set(previewId, { reportId: report.id, revision: stored.revision, overwrite, expires });
      const head = { previewId, reportId: report.id, recordId: record.id, round: report.round, kind: report.kind, revision: stored.revision, latest: adopted.latest, unplaced: adopted.unplaced, redactions: adopted.redactions, expiresAt: new Date(expires).toISOString() };
      if (report.kind === "replica") return { ...head, replica: adopted.replica };
      const { changes, kept, missing, report: parsed } = adopted;
      return { ...head, report: parsed, changes, kept, missing };
    },
    // 采纳：预览后主库没变才写；回执标为已采纳，档案按预览时的覆盖选择写入。
    async adopt(input) {
      shape(input, ["previewId", "expectedRevision"]);
      const expectedRevision = revisionOf(input.expectedRevision);
      const preview = typeof input.previewId === "string" && previews.get(input.previewId);
      if (!preview || preview.expires <= clock()) throw failure("预览已过期或不存在，请重新预览", 409);
      if (preview.revision !== expectedRevision) throw failure("预览后记录已变化，请重新预览", 409);
      const state = await repository.updateReverseReports(
        (stored) => {
          const report = reportOf(stored, preview.reportId);
          const record = recordOf(stored, report.recordId);
          const at = now();
          const { hatch } = adoptInto(record, report, { at, overwrite: preview.overwrite });
          return {
            reverseRecords: stored.reverseRecords.map((r) => (r.id === record.id ? { ...r, hatch, updatedAt: at } : r)),
            reverseReports: stored.reverseReports.map((r) => (r.id === report.id ? { ...r, status: "adopted", decidedAt: at } : r)),
          };
        },
        { expectedRevision },
      );
      previews.delete(input.previewId);
      return state;
    },
    async reject(input) {
      shape(input, ["id", "expectedRevision"]);
      return repository.updateReverseReports(
        (stored) => {
          reportOf(stored, input.id);
          const at = now();
          return { reverseReports: stored.reverseReports.map((r) => (r.id === input.id ? { ...r, status: "rejected", decidedAt: at } : r)) };
        },
        { expectedRevision: revisionOf(input.expectedRevision) },
      );
    },
  };
}
