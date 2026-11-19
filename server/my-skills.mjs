// #93 第二批（用户 2026-11-19）：资产仓库 Skill 页只读展示 my-skills 登记的 skill。
// 登记清单以 my-skills/links.tsv 为准（不用 catalog/skills.json，它是 11-07 生成的旧快照）；
// 每个 skill 读 skills/<名>/SKILL.md 头部的 name、description、metadata.version；
// 首次登记与最近更新取自 my-skills 的 git 记录；调用次数取自 agent-kit 的 skill-usage.jsonl（只记 Claude 端，11-07 起）。
// 全部只读：路径由 home 推出、前端不传路径，读文件前按白名单核对；不写 my-skills，读不到的项显示「未知」。
import { homedir } from "node:os";
import { join } from "node:path";
import { createSafeReader, runGit, tilde } from "./cockpit-read.mjs";

const DAY = 864e5;
const NAME = /^[a-z0-9][a-z0-9._-]{0,63}$/;

// links.tsv：每行「skill 名<TAB>链接到的目录」，一个 skill 可以有多行；# 开头是注释。
// ~/.claude/skills 给 Claude；~/.agents/skills、~/.codex/skills 给 Codex。
export function parseLinks(text) {
  const out = new Map();
  for (const line of String(text || "").split("\n")) {
    if (!line.trim() || line.trimStart().startsWith("#")) continue;
    const [name, target = ""] = line.split("\t").map((x) => x.trim());
    if (!NAME.test(name || "")) continue;
    const agents = out.get(name) || new Set();
    if (/(^|\/)\.claude\/skills\/?$/.test(target)) agents.add("Claude");
    if (/(^|\/)\.(agents|codex)\/skills\/?$/.test(target)) agents.add("Codex");
    out.set(name, agents);
  }
  return out;
}

const unquote = (v) => {
  const s = v.trim();
  return /^(["']).*\1$/.test(s) ? s.slice(1, -1) : s;
};

// SKILL.md 头部：只取顶层 name、description（单行）与 metadata 下一层的 version。
export function parseFrontmatter(text) {
  const lines = String(text || "").split("\n");
  if (lines[0]?.trim() !== "---") return null;
  const out = {};
  let inMeta = false;
  for (const line of lines.slice(1)) {
    if (line.trim() === "---") return out;
    const top = line.match(/^([\w-]+):\s*(.*)$/);
    if (top) {
      inMeta = top[1] === "metadata";
      if (top[1] === "name" || top[1] === "description") out[top[1]] = unquote(top[2]);
      continue;
    }
    const meta = inMeta && line.match(/^ {2}version:\s*(.+)$/);
    if (meta) out.version = unquote(meta[1]);
  }
  return null;
}

// git log --date=short --format=@%ad --name-status -- skills（新的在前）：
// updatedAt = 该 skill 目录最近一次提交日期；firstAt = 最早一次加入 SKILL.md 的日期（没有加入记录时取最早出现日期）。
export function parseGitLog(text) {
  const out = new Map();
  let date = null;
  for (const line of String(text || "").split("\n")) {
    if (line.startsWith("@")) { date = line.slice(1).trim(); continue; }
    if (!date || !line.trim()) continue;
    const parts = line.split("\t");
    const status = parts[0];
    for (const path of parts.slice(1)) {
      const m = path.match(/^skills\/([^/]+)\/(.+)$/);
      if (!m) continue;
      const rec = out.get(m[1]) || { updatedAt: date, firstAt: null, oldest: date };
      rec.oldest = date;
      if (m[2] === "SKILL.md" && (status === "A" || status.startsWith("R") || status.startsWith("C"))) rec.firstAt = date;
      out.set(m[1], rec);
    }
  }
  return new Map([...out].map(([k, v]) => [k, { updatedAt: v.updatedAt, firstAt: v.firstAt || v.oldest }]));
}

// skill-usage.jsonl：每行 {time, session, cwd, skill}；只按 skill 名精确匹配，不读会话、不保留 cwd。
export function usageStats(text, names, now) {
  const stats = new Map([...names].map((n) => [n, { total: 0, recent: 0, lastAt: null }]));
  let since = null;
  for (const line of String(text || "").split("\n")) {
    if (!line.trim()) continue;
    let r;
    try { r = JSON.parse(line); } catch { continue; }
    const at = Date.parse(r?.time);
    if (!Number.isFinite(at)) continue;
    if (since === null || at < since) since = at;
    const s = stats.get(String(r.skill || "").replace(/^\//, ""));
    if (!s) continue;
    s.total++;
    if (now - at <= 30 * DAY) s.recent++;
    if (!s.lastAt || at > Date.parse(s.lastAt)) s.lastAt = new Date(at).toISOString();
  }
  return { stats, since: since === null ? null : new Date(since).toISOString() };
}

export async function readMySkills({ home = homedir(), clock = Date.now, fs, git = runGit } = {}) {
  const reader = createSafeReader({ home, ...(fs ? { fs } : {}) });
  const p = reader.paths;
  const now = clock();
  const at = new Date(now).toISOString();
  const usagePath = join(p.kitState, "skill-usage.jsonl");
  const sources = { registry: tilde(join(p.mySkills, "links.tsv"), home), usage: tilde(usagePath, home) };
  const links = await reader.text(join(p.mySkills, "links.tsv"));
  if (!links) return { at, available: false, items: [], usageSince: null, sources, error: "没读到 my-skills 的 links.tsv" };
  const registry = parseLinks(links.text);
  const names = [...registry.keys()];
  const [docs, log, usage] = await Promise.all([
    Promise.all(names.map((n) => reader.text(join(p.mySkills, "skills", n, "SKILL.md")))),
    (await reader.resolveAllowed(p.mySkills))
      ? git(["-C", p.mySkills, "log", "--date=short", "--format=@%ad", "--name-status", "--", "skills"], { maxBuffer: 2 * 1024 * 1024 })
      : null,
    reader.text(usagePath),
  ]);
  const dates = log ? parseGitLog(log) : new Map();
  const used = usage ? usageStats(usage.text, names, now) : null;
  const items = names.map((name, i) => {
    const head = docs[i] ? parseFrontmatter(docs[i].text) : null;
    const d = dates.get(name);
    return {
      name,
      description: head?.description || "",
      version: head?.version || null,
      agents: [...registry.get(name)].sort(),
      firstAt: d?.firstAt || null,
      updatedAt: d?.updatedAt || null,
      uses: used ? used.stats.get(name) : null,
      missing: !docs[i],
    };
  });
  return { at, available: true, items, usageSince: used?.since ?? null, sources, error: null };
}
