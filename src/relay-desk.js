// 「继续」口令的收件与装备段（阶段 2 D 批）。只由规则生成，不调用模型；同一串文字同时供预览与复制。
// 收件只带还没交代的，正文是复制这一刻的快照（每条不超过 3000 字）；装备写固定版本，Prompt/Rule 附正文，其余只写名称与版本。
// 原条目和资产都不改；Agent 应把收件写进项目自己的 CURRENT 或派单。已交代 ≠ 已完成。
import { pendingInbox } from "./capture-routes.js";
import { parseStoredNote } from "./note-document.js";
import { imagePlainText } from "./note-image-model.js";
import { plainText } from "./rich-note.js";

export const SNAPSHOT_MAX = 3000;
const WITH_BODY = ["Prompt", "Rule"];
const TYPE = { Prompt: "Prompt", Rule: "规则", Skill: "Skill", Workflow: "工作流", MCP: "MCP", Design: "设计" };
const day = (value) => {
  const d = new Date(value);
  return Number.isFinite(d.getTime()) ? `${d.getMonth() + 1}/${d.getDate()}` : "";
};
const stamp = (value) => {
  const d = new Date(value);
  return Number.isFinite(d.getTime()) ? `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}` : "";
};
const clip = (text) => {
  const value = text.trim();
  return value.length > SNAPSHOT_MAX
    ? `${value.slice(0, SNAPSHOT_MAX)}\n…（已截断：原文共 ${value.length} 字，全文在工作台）`
    : value;
};
function noteText(note) {
  let body = note.text;
  try {
    const doc = parseStoredNote(note);
    body = doc.mode === "md1" ? plainText(note.text) : note.text;
  } catch {}
  return [note.title?.trim(), imagePlainText(body, note.images)].filter(Boolean).join("\n");
}

// 这个项目此刻要带进口令的收件与装备；条目或资产已删除的标为 missing，不带正文。
export function relayDesk(state, projectId, { collectionNotes = [] } = {}) {
  const entry = (state.projectDesk || []).find((e) => e.projectId === projectId);
  const inbox = pendingInbox(state, projectId).map((item) => {
    if (item.kind === "note") {
      const note = state.notes.find((n) => n.id === item.id);
      return { ref: { kind: item.kind, id: item.id }, at: item.at, source: "随手记", ...(note ? { title: note.title?.trim() || "", text: noteText(note) } : { missing: true }) };
    }
    const note = collectionNotes.find((n) => n.id === item.id);
    return { ref: { kind: item.kind, id: item.id }, at: item.at, source: "收藏", ...(note
      ? { title: note.title?.trim() || "未命名收藏", url: /^https?:\/\//i.test(note.sourceUrl || "") ? note.sourceUrl : "", text: [note.title?.trim(), note.content?.trim()].filter(Boolean).join("\n\n") }
      : { missing: true }) };
  });
  const loadout = (entry?.loadout || []).map((item) => {
    const asset = state.assets.find((a) => a.id === item.assetId && !a.archived);
    const index = asset ? asset.versions.findIndex((v) => v.id === item.versionId) : -1;
    return { ref: { assetId: item.assetId, versionId: item.versionId }, ...(index >= 0
      ? { asset, version: asset.versions[index], number: index + 1, newer: index < asset.versions.length - 1 }
      : { missing: true }) };
  });
  // next：没有协作表格的项目由用户手填的下一步（口令的“下一步”行用它，不进收件装备段）。
  return { inbox, loadout, next: entry?.next || null };
}

// 口令里追加的两段；收件与装备都为空时返回空串，口令与改造前一致。
export function relayDeskSection({ inbox, loadout }) {
  const parts = [];
  const items = inbox.filter((i) => !i.missing), gear = loadout.filter((i) => !i.missing);
  if (items.length) {
    parts.push("", "收件（工作台投递来的需求，正文是复制这一刻的快照）：先写进本项目自己的 CURRENT.md 或派单，再处理；工作台只记“已交代”，不代表已完成。");
    items.forEach((item, i) => {
      parts.push(`【收件 ${i + 1} · ${item.source} · ${day(item.at)}${item.source === "收藏" ? ` · ${item.title}` : ""}${item.url ? ` · ${item.url}` : ""}】`);
      parts.push(clip(item.text || item.title || ""));
    });
  }
  if (gear.length) {
    parts.push("", "装备（固定版本，按这个版本用）：");
    for (const item of gear) {
      const v = item.version;
      parts.push(`- ${v.title} · ${TYPE[item.asset.type] || item.asset.type} · v${item.number}（${stamp(v.at)} 版本 ${v.id.slice(0, 8)}）${WITH_BODY.includes(item.asset.type) ? "" : "：只列名称与版本，Agent 已安装就直接用"}`);
      if (WITH_BODY.includes(item.asset.type) && v.content?.trim()) parts.push(clip(v.content));
    }
  }
  return parts.join("\n");
}
