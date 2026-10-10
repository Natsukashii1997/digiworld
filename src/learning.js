// 学习成长（路线 v3 切片 5.4）：主库 learning 集合的纯函数。旧库没有 learning 时按空处理。
// 书只记学习状态（原件留在原处）；链接收藏删除写 deletedAt 进回收区；同一链接只收藏一次。
import { uid, now } from "./store.js";

export const STATUS = [
  ["want", "想学"],
  ["learning", "在学"],
  ["done", "学完"],
];
export const statusLabel = Object.fromEntries(STATUS);
export const LIMITS = { title: 200, summary: 1000, source: 80, url: 2000 };
const EMPTY = { folders: [], books: [], links: [] };
export const learningOf = (state) => state.learning || EMPTY;
const withLearning = (state, learning) => ({ ...state, learning: { ...learningOf(state), ...learning } });

const clip = (text, max) => {
  const chars = [...String(text || "").replace(/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/g, "").trim()];
  return chars.length > max ? chars.slice(0, max - 1).join("") + "…" : chars.join("");
};
const oneLine = (text, max) => clip(String(text || "").replace(/\s+/g, " "), max);
// 只接受 http/https，返回规范化的地址；不合法时返回空字符串。
export function httpLink(value) {
  try {
    const url = new URL(String(value || "").trim());
    if (!["http:", "https:"].includes(url.protocol) || url.username || url.password) return "";
    return url.href.length > LIMITS.url ? "" : url.href;
  } catch {
    return "";
  }
}

// 收藏：返回 { state, result }，result 为 added / restored / duplicate / invalid。
// 已在回收区的同一链接直接恢复，不另建一条。
export function collectLink(state, { title, url, summary = "", source = "", origin = "manual" }) {
  const href = httpLink(url);
  const name = oneLine(title, LIMITS.title);
  if (!href || !name) return { state, result: "invalid" };
  const learning = learningOf(state);
  const existing = learning.links.find((l) => l.url === href);
  if (existing && !existing.deletedAt) return { state, result: "duplicate", link: existing };
  if (existing) {
    const { deletedAt, ...rest } = existing;
    const link = { ...rest, updatedAt: now() };
    return {
      state: withLearning(state, { links: learning.links.map((l) => (l.id === existing.id ? link : l)) }),
      result: "restored",
      link,
    };
  }
  const link = {
    id: uid(),
    title: name,
    url: href,
    summary: clip(summary, LIMITS.summary),
    source: oneLine(source, LIMITS.source),
    origin,
    status: "want",
    createdAt: now(),
  };
  return { state: withLearning(state, { links: [link, ...learning.links] }), result: "added", link };
}
const editLink = (state, id, change) =>
  withLearning(state, {
    links: learningOf(state).links.map((l) => (l.id === id ? change(l) : l)),
  });
export const setLinkStatus = (state, id, status) =>
  editLink(state, id, (l) => ({ ...l, status, updatedAt: now() }));
export const deleteLink = (state, id) => editLink(state, id, (l) => ({ ...l, deletedAt: now() }));
export const restoreLink = (state, id) =>
  editLink(state, id, ({ deletedAt, ...l }) => ({ ...l, updatedAt: now() }));

// 书的状态：按书架索引给出的 id 写入或更新一条记录（只存位置、文件名与状态）。
export function setBookStatus(state, book, status) {
  const books = learningOf(state).books;
  const previous = books.find(b => b.id === book.id);
  const record = { ...previous, id: book.id, root: book.root, path: book.path, name: book.name, status, updatedAt: now() };
  return withLearning(state, {
    books: books.some((b) => b.id === book.id)
      ? books.map((b) => (b.id === book.id ? record : b))
      : [...books, record],
  });
}
export const bookStatus = (state, id) => learningOf(state).books.find((b) => b.id === id)?.status || "";

// 阅读进度只来自用户输入；不推导学习状态，也不从文件大小/章节数估计完成率。
export function setBookProgress(state, book, {unit, value}) {
  if (unit === "percent") {
    if (typeof value !== "number" || !Number.isFinite(value) || value < 0 || value > 100)
      throw new Error("阅读百分比应为 0 到 100 的数值");
  } else if (unit === "chapter") {
    if (typeof value !== "string" || !value.trim() || value.length > 100 || /[\x00-\x1f\x7f]/.test(value))
      throw new Error("请填写 100 字以内、没有控制字符的阅读位置");
    value = value.trim();
  } else throw new Error("阅读进度单位无效");
  const books = learningOf(state).books, previous = books.find(b => b.id === book.id), at = now();
  const record = {...previous, id:book.id, root:book.root, path:book.path, name:book.name,
    progress:{unit,value,updatedAt:at}, updatedAt:at};
  return withLearning(state, {books:previous ? books.map(b => b.id === book.id ? record : b) : [...books,record]});
}
export const bookProgress = (state, id) => learningOf(state).books.find(b => b.id === id)?.progress;
export const progressLabel = progress => !progress ? "尚未记录阅读进度" :
  progress.unit === "percent" ? `已读 ${progress.value}%（手动记录）` : `读到 ${progress.value}（手动记录）`;
