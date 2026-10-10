// 焚决（路线 v3 切片 1.3）的纯函数：卷排序、标签拆分、条目增删改移。
// 所有函数返回新的 scrolls 数组，由页面整体保存到主库；字段与上限以 server/schema.mjs 为准。
import { uid, now } from "./store.js";

export const TAG_MAX = 24;
export const TAGS_PER_ENTRY = 12;
export const NAME_MAX = 60;
export const TEXT_MAX = 20000;

export const scrollsOf = (state) => state.scrolls || [];
export const liveEntries = (scroll) => scroll.entries.filter((e) => !e.deletedAt);
// 置顶卷在前；同组内按创建先后（排序稳定，时间相同时保持数组顺序）。
export const orderScrolls = (scrolls) =>
  scrolls
    .filter((s) => !s.deletedAt)
    .sort(
      (a, b) =>
        Number(b.pinned) - Number(a.pinned) ||
        a.createdAt.localeCompare(b.createdAt),
    );
export function parseTags(input) {
  const tags = [];
  for (const raw of input.split(/[\s,，、]+/)) {
    const tag = raw.slice(0, TAG_MAX);
    if (tag && !tags.includes(tag)) tags.push(tag);
  }
  return tags.slice(0, TAGS_PER_ENTRY);
}
export const shortText = (text) => {
  const s = text.replace(/\s+/g, " ").trim();
  return s.length > 20 ? `${s.slice(0, 20)}…` : s;
};
const cleanName = (name) =>
  name.replace(/[\x00-\x1f\x7f]/g, " ").trim().slice(0, NAME_MAX);
const cleanText = (text) =>
  text.replace(/[\x00-\x08\x0b-\x1f\x7f]/g, "").slice(0, TEXT_MAX);

const mapScroll = (scrolls, id, fn) =>
  scrolls.map((s) => (s.id === id ? fn(s) : s));
const mapEntry = (scrolls, scrollId, entryId, fn) =>
  mapScroll(scrolls, scrollId, (s) => ({
    ...s,
    entries: s.entries.map((e) => (e.id === entryId ? fn(e) : e)),
  }));

export function createScroll(scrolls, name) {
  const scroll = {
    id: uid(),
    name: cleanName(name),
    pinned: false,
    createdAt: now(),
    entries: [],
  };
  return { scrolls: [...scrolls, scroll], scroll };
}
export const renameScroll = (scrolls, id, name) =>
  mapScroll(scrolls, id, (s) => ({ ...s, name: cleanName(name), updatedAt: now() }));
export const pinScroll = (scrolls, id, pinned) =>
  mapScroll(scrolls, id, (s) => ({ ...s, pinned, updatedAt: now() }));
export const deleteScroll = (scrolls, id) =>
  mapScroll(scrolls, id, (s) => ({ ...s, deletedAt: now() }));
export function scrollDeleteBlockers(state, id) {
  const blockers = [];
  for (const record of state.reverseRecords || []) {
    if (record.imports?.some(item => item.kind === "scroll" && item.scrollId === id))
      blockers.push({ kind: "reverse", ownerId: record.id, label: `逆向记录：${record.title}` });
  }
  for (const note of state.notes || []) {
    if (note.refined?.scrollId === id)
      blockers.push({ kind: "note", ownerId: note.id, label: `已炼入的随手记：${note.text?.split("\n").find(line => line.trim())?.slice(0, 40) || "未命名念头"}` });
  }
  return blockers;
}
export const restoreScroll = (scrolls, id) =>
  mapScroll(scrolls, id, ({ deletedAt, ...s }) => ({ ...s, updatedAt: now() }));

// source：可选的来源（逆向工程入库时为 { reverseId, url? }），只记录，不参与显示与计次。
export function addEntry(scrolls, scrollId, text, tags = [], source) {
  const entry = {
    id: uid(),
    text: cleanText(text),
    tags,
    uses: 0,
    createdAt: now(),
    ...(source ? { source } : {}),
  };
  return {
    scrolls: mapScroll(scrolls, scrollId, (s) => ({
      ...s,
      entries: [...s.entries, entry],
    })),
    entry,
  };
}
export const editEntry = (scrolls, scrollId, entryId, text, tags) =>
  mapEntry(scrolls, scrollId, entryId, (e) => ({
    ...e,
    text: cleanText(text),
    tags,
    updatedAt: now(),
  }));
export const deleteEntry = (scrolls, scrollId, entryId) =>
  mapEntry(scrolls, scrollId, entryId, (e) => ({ ...e, deletedAt: now() }));
export const restoreEntry = (scrolls, scrollId, entryId) =>
  mapEntry(scrolls, scrollId, entryId, ({ deletedAt, ...e }) => e);
export const countUse = (scrolls, scrollId, entryId) =>
  mapEntry(scrolls, scrollId, entryId, (e) => ({
    ...e,
    uses: e.uses + 1,
    lastUsedAt: now(),
  }));
// 与相邻的未删除条目交换位置；回收区里的条目原位不动，恢复后回到原处。
export function moveEntry(scrolls, scrollId, entryId, step) {
  return mapScroll(scrolls, scrollId, (s) => {
    const live = s.entries
      .map((e, i) => [e, i])
      .filter(([e]) => !e.deletedAt);
    const at = live.findIndex(([e]) => e.id === entryId);
    const other = live[at + step];
    if (at === -1 || !other) return s;
    const entries = [...s.entries];
    const from = live[at][1],
      to = other[1];
    [entries[from], entries[to]] = [entries[to], entries[from]];
    return { ...s, entries };
  });
}

// 资产仓库里的焚决卡（切片 1.3b）：编号按创建先后，含已删卷，恢复后编号不变（与资产 serialsOf 同义）。
export function scrollSerials(scrolls) {
  const out = {};
  [...scrolls]
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
    .forEach((s, i) => (out[s.id] = i + 1));
  return out;
}
// 卡片摘要：条数、复制次数之和、最近复制时间、按出现次数排序的标签（同次数按首次出现先后）。
export function scrollStats(scroll) {
  const live = liveEntries(scroll);
  const counts = new Map();
  for (const e of live) for (const t of e.tags) counts.set(t, (counts.get(t) || 0) + 1);
  return {
    count: live.length,
    uses: live.reduce((n, e) => n + e.uses, 0),
    lastAt: live.reduce((at, e) => (e.lastUsedAt && e.lastUsedAt > at ? e.lastUsedAt : at), ""),
    tags: [...counts].sort((a, b) => b[1] - a[1]).map(([t]) => t),
  };
}
// 页内搜索：每个关键词都要命中卷名、某条未删除条目的正文或标签（words 已是小写，见 search.js terms）。
export function scrollHit(scroll, words) {
  const text = [
    scroll.name,
    ...liveEntries(scroll).flatMap((e) => [e.text, e.tags.join(" ")]),
  ]
    .join("\n")
    .toLowerCase();
  return words.every((w) => text.includes(w));
}
