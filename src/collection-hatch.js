// 收藏的孵化入口（阶段 2 C 批）：由 Collection.jsx 提供，收藏展开卡读取；单独成模块，避免收藏组件与外壳循环引用。
import { createContext } from "react";
export const CollectionHatch = createContext(null);
// 收藏条目作为捕获时的标题与正文（孵成资产、收入焚决、口令快照都用它）。
export const collectionCapture = (note) => ({
  kind: "collection",
  id: note.id,
  title: note.title?.trim() || "未命名收藏",
  text: [note.title?.trim(), note.content?.trim()].filter(Boolean).join("\n\n"),
  url: /^https?:\/\//i.test(note.sourceUrl || "") ? note.sourceUrl : undefined,
});
