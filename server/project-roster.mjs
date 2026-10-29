// 项目空间第二版（issue #8）：项目只认数字分身名册 projects.json，只读。
// 名册不复制进主库；每次读取都从文件现读。项目卡（Vault）只取三段摘要，跟着已连接的 Vault 知识源只读，经知识源访问策略。
import fs from "node:fs/promises";
import { homedir } from "node:os";
import { join, isAbsolute, normalize, basename } from "node:path";
import { selectedProfileSource } from "./knowledge-access-policy.mjs";

export const DEFAULT_ROSTER_PATH = join(homedir(), "Documents/ChatGPT/个人/work/digital-twin/projects.json");
const ROSTER_LIMIT = 256 * 1024;
const ID = /^[A-Za-z0-9][\w.-]{0,79}$/;
const text = (v, n = 200) => (typeof v === "string" ? v.trim().slice(0, n) : "");

export function expandHome(path, home = homedir()) {
  if (typeof path !== "string" || !path) return "";
  const full = path === "~" ? home : path.startsWith("~/") ? join(home, path.slice(2)) : path;
  return isAbsolute(full) ? normalize(full) : "";
}
export const displayPath = (path, home = homedir()) =>
  path === home || path.startsWith(home + "/") ? "~" + path.slice(home.length) : path;

// 名册条目只留页面用到的字段；格式不对的条目跳过并计数，不让整页失败。
export function parseRoster(raw, { home = homedir() } = {}) {
  let data;
  try {
    data = JSON.parse(raw);
  } catch {
    return { state: "error", message: "名册不是有效的 JSON" };
  }
  const list = Array.isArray(data) ? data : data?.projects;
  if (!Array.isArray(list)) return { state: "error", message: "名册里没有 projects 列表" };
  const projects = [], seen = new Set();
  let skipped = 0;
  for (const p of list.slice(0, 100)) {
    const path = expandHome(p?.path, home);
    if (!p || !ID.test(p.id || "") || seen.has(p.id) || !text(p.name) || !path) {
      skipped++;
      continue;
    }
    seen.add(p.id);
    const card = text(p.card, 300);
    projects.push({
      id: p.id,
      name: text(p.name, 60),
      path,
      card: card && !card.startsWith("/") && !card.split("/").includes("..") ? card : "",
      github: /^[\w.-]+\/[\w.-]+$/.test(p.github || "") ? p.github : "",
    });
  }
  return { state: "ok", projects, skipped };
}

export async function readRoster(path = DEFAULT_ROSTER_PATH, { filesystem = fs, home = homedir() } = {}) {
  const shown = displayPath(path, home);
  try {
    const info = await filesystem.lstat(path);
    if (!info.isFile()) return { state: "error", path: shown, message: "名册不是普通文件" };
    if (info.size > ROSTER_LIMIT) return { state: "error", path: shown, message: "名册超过 256 KB，不读取" };
    const parsed = parseRoster(await filesystem.readFile(path, "utf8"), { home });
    return { ...parsed, path: shown };
  } catch (e) {
    if (["ENOENT", "ENOTDIR"].includes(e.code))
      return { state: "error", path: shown, message: "名册读不到：文件不存在" };
    return { state: "error", path: shown, message: "名册读不到" };
  }
}

// ---------- 项目卡摘要 ----------

const SECTIONS = [
  ["one", /一句话|是什么/],
  ["goal", /目标/],
  ["not", /不做/],
];
const plain = (v) =>
  v.replace(/\[\[([^\]|]+)\|([^\]]+)\]\]/g, "$2").replace(/\[\[([^\]]+)\]\]/g, "$1")
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1").replace(/\*\*(.+?)\*\*/g, "$1")
    .replace(/`([^`]*)`/g, "$1").replace(/\s+/g, " ").trim();
const clip = (v, n = 160) => (v.length > n ? v.slice(0, n) + "…" : v);

// 每段取对应小节下第一段文字（列表取前几项连成一句）；没有“是什么”小节时，一句话取标题后的第一段。
export function cardSummary(markdown) {
  const lines = String(markdown).replace(/^---\n[\s\S]*?\n---\n?/, "").split(/\r?\n/);
  const out = { one: "", goal: "", not: "" };
  const firstBlock = (from) => {
    const block = [];
    let fence = false;
    for (const line of lines.slice(from)) {
      if (/^\s*(```|~~~)/.test(line)) { fence = !fence; continue; }
      if (fence) continue;
      if (/^#{1,6}\s/.test(line)) break;
      if (!line.trim() || /^\s*\|/.test(line)) {
        if (block.length) break;
        continue;
      }
      block.push(line.replace(/^\s*(?:[-*+]|\d+\.)\s+/, "").replace(/^\s*>\s?(\[![^\]]*\]\s*)?/, ""));
      if (block.length >= 3) break;
    }
    return clip(plain(block.join("；").replace(/；+/g, "；")));
  };
  lines.forEach((line, i) => {
    const h = line.match(/^#{2,6}\s+(.+)$/);
    if (!h) return;
    for (const [key, re] of SECTIONS) if (!out[key] && re.test(h[1])) out[key] = firstBlock(i + 1);
  });
  if (!out.one) {
    const h1 = lines.findIndex((l) => /^#\s/.test(l));
    out.one = firstBlock(h1 + 1);
  }
  return out;
}

// 读项目卡：跟着已连接的 Vault 知识源只读（与个人说明同一个来源），不挂在「写入 Obsidian Vault」开关下。
// 没连知识源、来源待重新确认、卡读不到，都如实返回状态，不抛错。
export function createCardReader(repository, { files }) {
  return async function readCard(card) {
    if (!card) return { state: "absent", message: "名册里没写项目卡" };
    let source;
    try {
      source = selectedProfileSource(await repository.read());
    } catch {
      return { state: "error", message: "Vault 知识源读不到" };
    }
    if (!source) return { state: "off" };
    const url = `obsidian://open?vault=${encodeURIComponent(basename(source.root))}&file=${encodeURIComponent(card.replace(/\.md$/, ""))}`;
    try {
      const { document } = await files.current(source, card);
      return { state: "ok", url, ...cardSummary(document.content) };
    } catch (error) {
      return { state: "error", url, message: error?.code === "KNOWLEDGE_ROOT_IDENTITY_CHANGED" ? "Vault 知识源要在设置里重新确认" : "项目卡读不到" };
    }
  };
}
