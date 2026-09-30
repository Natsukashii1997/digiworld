// 银饰计划（路线 v3 5.5；产品定义 v1.2 §4.8）的纯函数：收藏格计算、记录增删改。
// 所有函数返回新的 silver 对象，由页面整体保存到主库；字段与上限以 server/silver-schema.mjs 为准。
import { uid, now } from "./store.js";

export const IMAGE_MAX = 8 * 1024 * 1024;
export const ACCEPT = "image/jpeg,image/png,image/webp";
export const TARGET_MAX = 999;
export const CATEGORY_MAX = 50;
export const LIMITS = { name: 30, itemName: 60, author: 100, source: 200, url: 2000, note: 2000 };

const EMPTY = { wall: [], categories: [], items: [] };
export const silverOf = (state) => state.silver || EMPTY;

const oneLine = (v, max) => String(v || "").replace(/[\x00-\x1f\x7f]/g, " ").trim().slice(0, max);
const multiLine = (v, max) => String(v || "").replace(/[\x00-\x08\x0b-\x1f\x7f]/g, "").trim().slice(0, max);

// 一个品类的格子：已填格按记录顺序在前，空格在后；目标调低时已填格照常显示，不丢记录。
export function cellsOf(category, items) {
  const filled = items.filter((i) => i.categoryId === category.id && !i.deletedAt);
  const count = Math.max(category.target, filled.length);
  return Array.from({ length: count }, (_, index) => ({ index, item: filled[index] || null }));
}
export const liveOf = (list) => list.filter((r) => !r.deletedAt);

export function addWall(silver, { image, author, source, sourceUrl, note }) {
  const record = {
    id: uid(),
    image,
    author: oneLine(author, LIMITS.author),
    source: oneLine(source, LIMITS.source),
    note: multiLine(note, LIMITS.note),
    createdAt: now(),
  };
  const url = oneLine(sourceUrl, LIMITS.url);
  if (url) record.sourceUrl = url;
  return { ...silver, wall: [record, ...silver.wall] };
}
export function addCategory(silver, name, target) {
  return {
    ...silver,
    categories: [
      ...silver.categories,
      { id: uid(), name: oneLine(name, LIMITS.name), target, createdAt: now() },
    ],
  };
}
export function addItem(silver, categoryId, { image, name, boughtAt, price, note }) {
  const record = { id: uid(), categoryId, image, name: oneLine(name, LIMITS.itemName), createdAt: now() };
  if (boughtAt) record.boughtAt = boughtAt;
  if (price !== undefined) record.price = price;
  const n = multiLine(note, LIMITS.note);
  if (n) record.note = n;
  return { silver: { ...silver, items: [...silver.items, record] }, item: record };
}
// 通用更新：list 为 "wall" | "categories" | "items"。
export function update(silver, list, id, patch) {
  return {
    ...silver,
    [list]: silver[list].map((r) => {
      if (r.id !== id) return r;
      const next = { ...r, ...patch, updatedAt: now() };
      for (const [k, v] of Object.entries(next)) if (v === undefined) delete next[k];
      return next;
    }),
  };
}
export const remove = (silver, list, id) => update(silver, list, id, { deletedAt: now() });
export const restore = (silver, list, id) => update(silver, list, id, { deletedAt: undefined });

// 价格：空为未填；否则 0–1e8、最多两位小数。返回 undefined（未填）、数值或 null（非法）。
export function parsePrice(input) {
  const s = String(input ?? "").trim();
  if (!s) return undefined;
  if (!/^\d{1,9}(\.\d{1,2})?$/.test(s)) return null;
  const n = Number(s);
  return n <= 1e8 ? n : null;
}
