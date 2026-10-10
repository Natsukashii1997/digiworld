// 本机搜索：只读已加载的主库，不访问服务端、知识库正文或 Agent 配置。
// 范围与边界见 ASSET-SEARCH.md。
import { current } from "./store.js";

export const GROUP_LIMIT = 20;
const SNIPPET = 40;

export function terms(query) {
  return query.trim().toLowerCase().split(/\s+/).filter(Boolean);
}

// long 字段命中时显示摘录；短字段只标出命中位置。
function field(label, text, long = false) {
  const value = typeof text === "string" ? text : "";
  return { label, text: value, lower: value.toLowerCase(), long };
}

// 按版本对象缓存小写文本，在同一份主库快照内复用；保存或刷新后对象整体更新，会重建。
const versionIndex = new WeakMap();
function indexVersion(v) {
  let entry = versionIndex.get(v);
  if (!entry) {
    const fields = [
      field("标题", v.title),
      field("说明", v.description),
      field("标签", v.tags.join(" ")),
      field("正文", v.content, true),
      ...(v.mcpConfig ? [field("MCP 服务标识", v.mcpConfig.serverId),
        field("MCP 公开地址", v.mcpConfig.origin + v.mcpConfig.path)] : []),
      ...v.files
        .filter((f) => f.text && !f.directory)
        .flatMap((f) => [
          field("文件路径", f.path),
          field(`文件 ${f.path}`, f.data, true),
        ]),
    ];
    entry = { fields, all: fields.map((f) => f.lower).join("\n") };
    versionIndex.set(v, entry);
  }
  return entry;
}

function locate(fields, words) {
  // 列出所有命中的字段；任一关键词命中正文/文件时附带摘录，与关键词顺序无关。
  const labels = [];
  let snippet;
  for (const f of fields) {
    const hits = words
      .map((w) => [f.lower.indexOf(w), w])
      .filter(([at]) => at !== -1);
    if (!hits.length) continue;
    if (!labels.includes(f.label)) labels.push(f.label);
    if (!f.long || snippet !== undefined) continue;
    const [at, word] = hits.reduce((a, b) => (b[0] < a[0] ? b : a));
    // toLowerCase 可能改变少数字符的长度，此时用小写文本截取，避免错位。
    const source = f.lower.length === f.text.length ? f.text : f.lower;
    const start = Math.max(0, at - SNIPPET),
      end = Math.min(source.length, at + word.length + SNIPPET);
    snippet =
      (start > 0 ? "…" : "") +
      source.slice(start, end).replace(/\s+/g, " ").trim() +
      (end < source.length ? "…" : "");
  }
  const where =
    labels.length > 3
      ? `${labels.slice(0, 3).join("、")}等`
      : labels.join("、") || "多个字段";
  return snippet === undefined ? { where } : { where, snippet };
}

function matches(all, words) {
  return words.every((w) => all.includes(w));
}

export function assetHit(asset, words) {
  if (!words.length) return null;
  const { fields, all } = indexVersion(current(asset));
  return matches(all, words) ? locate(fields, words) : null;
}

export function searchAssets(assets, words) {
  const hits = [];
  let archived = 0;
  for (const asset of assets) {
    const hit = assetHit(asset, words);
    if (!hit) continue;
    if (asset.archived) archived++;
    else hits.push({ asset, ...hit });
  }
  return { hits, archived };
}

function searchPlain(items, words, toFields) {
  const hits = [];
  for (const item of items) {
    const fields = toFields(item);
    if (matches(fields.map((f) => f.lower).join("\n"), words))
      hits.push({ item, ...locate(fields, words) });
  }
  return hits;
}

export function searchWorkspace(state, query) {
  const words = terms(query);
  if (!words.length) return null;
  const { hits: assets, archived } = searchAssets(state.assets, words);
  const notes = searchPlain(state.notes, words, (n) => [
    field("正文", n.text, true),
  ]);
  const references = searchPlain(state.references, words, (r) => [
    field("名称", r.title),
    field("链接", r.url),
    field("笔记", r.note, true),
  ]);
  const projects = [
    ...searchPlain(state.projects, words, (p) => [
      field("名称", p.name),
      field("目标", p.goal, true),
      field("下一步", p.next, true),
      field("位置", p.location),
    ]),
    ...searchPlain(state.connections?.projects || [], words, (p) => [
      field("名称", p.name),
      field("仓库", p.repoKey),
      field("说明", p.description, true),
      field("语言", p.language),
      field("位置", (p.localPaths || []).join(" ")),
    ]),
  ];
  return { words, assets, archived, notes, references, projects };
}

// 资产库标签筛选：只统计未归档资产的当前版本，按使用数量、再按名称排序。
export function tagCounts(assets) {
  const counts = new Map();
  for (const a of assets) {
    if (a.archived) continue;
    for (const tag of new Set(current(a).tags))
      counts.set(tag, (counts.get(tag) || 0) + 1);
  }
  return [...counts].sort(
    (a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "zh"),
  );
}
