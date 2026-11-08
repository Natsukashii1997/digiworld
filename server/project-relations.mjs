// 项目关系（#78）：名册 + 各项目 AGENTS.md + 技能调用统计 → 关系边与「底座 → 产品 → 当前状态」支撑流数据。
// 只读：不写名册、不写项目文件、不写主库。关系的权威源是名册 relations 字段（数字分身仓库），AGENTS 与技能统计只是自动推出的补充。
import fs from "node:fs/promises";
import { join, basename, sep } from "node:path";

export const RELATION_KINDS = ["support", "data", "contract", "part", "apart"];
export const SANKEY_RULE = "宽度＝近 30 天提交；一个产品连着几个底座就平均分给这几个底座";
const BASE_TYPES = new Set(["capability", "infrastructure"]);
const AGENTS_LIMIT = 256 * 1024;
const SELF_BUILT = "自建";
const SKILLS_BASE = "my-skills";
const text = (v, n = 200) => (typeof v === "string" ? v.trim().replace(/\s+/g, " ").slice(0, n) : "");

// 读项目根目录的 AGENTS.md：只认普通文件，拒绝软链接、越出项目目录和超过 256 KB 的文件。
export async function readAgentsFile(projectPath, { filesystem = fs } = {}) {
  let root;
  try {
    const info = await filesystem.lstat(projectPath);
    if (!info.isDirectory()) return { state: "absent" };
    root = await filesystem.realpath(projectPath);
  } catch {
    return { state: "absent" };
  }
  const file = join(projectPath, "AGENTS.md");
  let info;
  try {
    info = await filesystem.lstat(file);
  } catch (e) {
    return e?.code === "ENOENT" || e?.code === "ENOTDIR" ? { state: "absent" } : { state: "error", reason: "AGENTS.md 读不到" };
  }
  if (info.isSymbolicLink()) return { state: "error", reason: "AGENTS.md 是软链接，不读" };
  if (!info.isFile()) return { state: "error", reason: "AGENTS.md 不是普通文件" };
  if (info.size > AGENTS_LIMIT) return { state: "error", reason: "AGENTS.md 超过 256 KB，不读" };
  try {
    const real = await filesystem.realpath(file);
    if (!real.startsWith(root + sep)) return { state: "error", reason: "AGENTS.md 越出项目目录，不读" };
    return { state: "ok", text: await filesystem.readFile(real, "utf8") };
  } catch {
    return { state: "error", reason: "AGENTS.md 读不到" };
  }
}

// 底座的匹配词：id、GitHub 仓库短名、目录名。不用 aliases（里面有「LESSONS」「知识库」这类通用词，会误报）。
export function baseTerms(project) {
  const terms = new Set([project.id, project.github ? project.github.split("/")[1] : "", project.path ? basename(project.path) : ""]);
  return [...terms].filter((t) => typeof t === "string" && t.length >= 3).map((t) => t.toLowerCase());
}
const escape = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
export function mentions(source, term) {
  return new RegExp(`(^|[^A-Za-z0-9_-])${escape(term)}(?![A-Za-z0-9_-])`, "i").test(source);
}

/**
 * projects：parseRoster 的 projects（可带 type、relations）
 * items：projects-space inspect() 的 items（commits、attention、skills）
 * agents：{ [id]: readAgentsFile 的结果 }
 */
export function buildRelations({ projects, items = [], agents = {} }) {
  const byId = new Map(projects.map((p) => [p.id, p]));
  const itemOf = new Map(items.map((i) => [i.id, i]));
  const typeOf = (id) => byId.get(id)?.type || "unknown";
  const edges = [], seen = new Set(), skipped = [];
  const add = (edge) => {
    const key = `${edge.from}|${edge.to}|${edge.kind}`;
    if (seen.has(key)) return;
    seen.add(key);
    edges.push(edge);
  };

  // 1. 名册手写关系（权威）。
  for (const p of projects) {
    for (const r of p.relations || []) {
      const to = typeof r?.to === "string" ? r.to : "";
      if (!RELATION_KINDS.includes(r?.kind)) { skipped.push({ where: "roster.relations", id: p.id, reason: `关系类型不认识：${text(String(r?.kind ?? ""), 30) || "空"}` }); continue; }
      if (!byId.has(to) || to === p.id) { skipped.push({ where: "roster.relations", id: p.id, reason: `关系指向的项目不在名册里：${text(to, 80) || "空"}` }); continue; }
      add({ from: p.id, to, kind: r.kind, note: text(r.note), source: text(r.source, 120) || "名册", inferred: r.inferred === true, origin: "roster" });
    }
  }

  // 2. AGENTS.md 引用了哪些底座。
  const bases = projects.filter((p) => BASE_TYPES.has(p.type));
  for (const p of projects) {
    const doc = agents[p.id];
    if (doc?.state !== "ok") {
      if (doc?.state === "error") skipped.push({ where: "agents", id: p.id, reason: doc.reason });
      continue;
    }
    for (const b of bases) {
      if (b.id === p.id) continue;
      if (baseTerms(b).some((t) => mentions(doc.text, t)))
        add({ from: b.id, to: p.id, kind: "support", note: `AGENTS 引用了${b.name}`, source: `${p.name} AGENTS.md`, inferred: false, origin: "agents" });
    }
  }

  // 3. 技能调用统计：会话里调用过自建 skill 的项目，连上自建技能库。
  if (byId.has(SKILLS_BASE)) {
    for (const p of projects) {
      if (p.id === SKILLS_BASE) continue;
      const own = (itemOf.get(p.id)?.skills?.skills || []).filter((s) => s.src === SELF_BUILT).sort((a, b) => b.n - a.n);
      if (own.length)
        add({ from: SKILLS_BASE, to: p.id, kind: "support", note: `会话里调用自建 skill（${text(own[0].name, 60)}${own.length > 1 ? " 等" : ""}）`, source: "技能调用统计", inferred: false, origin: "skills" });
    }
  }

  const degree = (id) => edges.filter((e) => e.from === id || e.to === id).length;
  const c30 = (id) => { const c = itemOf.get(id)?.commits; return c?.state === "ok" ? c.total : null; };
  const nodes = projects.map((p) => {
    const item = itemOf.get(p.id), a = item?.attention;
    return {
      id: p.id, name: p.name, type: typeOf(p.id), c30: c30(p.id),
      status: a ? { key: a.kind, text: a.text } : null,
      agents: { state: agents[p.id]?.state || "skipped" },
      degree: degree(p.id),
    };
  });

  // 支撑流：只算产品。底座＝与它之间有任何非「明确独立」关系的底座（方向不限）；一个也没有记为 none（未接底座）。
  const links = [], status = [];
  for (const p of projects.filter((x) => x.type === "product")) {
    const linked = [...new Set(edges.filter((e) => e.kind !== "apart" && (e.from === p.id || e.to === p.id))
      .map((e) => (e.from === p.id ? e.to : e.from)).filter((id) => BASE_TYPES.has(typeOf(id))))];
    const own = linked.length ? linked : ["none"], total = c30(p.id) ?? 0;
    for (const base of own) links.push({ base, project: p.id, value: Math.round((total / own.length) * 100) / 100 });
    const a = itemOf.get(p.id)?.attention;
    status.push({ project: p.id, key: a?.kind || "unknown", text: a?.text || "读不到" });
  }
  const used = new Set(links.map((l) => l.base));
  return {
    nodes, edges,
    sankey: { rule: SANKEY_RULE, links, status, unusedBases: bases.filter((b) => !used.has(b.id)).map((b) => b.id) },
    skipped,
  };
}
