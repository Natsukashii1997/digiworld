// 驾驶舱规则页（#74）：六块只读汇总。Vault 偏好表受限，只取编号和「确认依据」列，不取正文；
// 标题取自审核包第 3 节的「内容（简）」，审核包之后新增的编号从 CLAUDE.md 对应节标题补。
import { homedir } from "node:os";
import { join } from "node:path";
import { createSafeReader, tilde, freshness, instructionSync, runGit } from "./cockpit-read.mjs";

const DOCTOR_MAX_MS = 7 * 24 * 60 * 60 * 1000;
const REVIEW_FILE = "2026-11-07-全局规则审核包.md";

function cells(text) {
  return text.split("|").slice(1, -1).map((c) => c.trim());
}
function section(text, startRe, endRe) {
  const lines = String(text).split("\n");
  const from = lines.findIndex((l) => startRe.test(l));
  if (from < 0) return null;
  const rest = lines.slice(from + 1);
  const to = rest.findIndex((l) => endRe.test(l));
  return (to < 0 ? rest : rest.slice(0, to)).join("\n");
}

// Vault 偏好表：只认表格行的第 1 列（编号）和第 3 列（确认依据），其余列一律丢弃。
export function vaultPrefIds(text) {
  const out = [];
  for (const line of String(text).split("\n")) {
    if (!/^\|\s*P-\d{2}\s*\|/.test(line)) continue;
    const c = cells(line);
    out.push({ id: c[0], basis: c[2] || "" });
  }
  return out;
}

const LEVEL = { 有: "y", 部分: "p", 无: "n" };
function landingCell(raw = "") {
  const m = /^(有|部分|无)/.exec(raw.replace(/\*/g, ""));
  const note = raw.replace(/\*/g, "").replace(/^(有|部分|无)[：:（(]?/, "").replace(/[）)]$/, "").trim();
  return { level: m ? LEVEL[m[1]] : "u", note };
}

// 审核包第 3 节：编号对照表。
export function reviewLanding(text) {
  const body = section(text, /^## 3\./, /^## \d+\./);
  if (!body) return null;
  const rows = {};
  for (const line of body.split("\n")) {
    if (!/^\|\s*P-\d{2}\s*\|/.test(line)) continue;
    const [id, title, claude, codex, hermes] = cells(line);
    rows[id] = { title, claude: landingCell(claude), codex: landingCell(codex), hermes: landingCell(hermes) };
  }
  return rows;
}

const ISSUE_GROUPS = { A: "真源", B: "冲突", C: "重复", D: "表达", E: "机制化" };
// 审核包第 4 节：「- B1　内容」条目。标题取第一个冒号前（不超过 30 字），其余作说明。
export function reviewIssues(text) {
  const body = section(text, /^## 4\./, /^## \d+\./);
  if (!body) return null;
  const out = [];
  for (const line of body.split("\n")) {
    const m = /^-\s+([A-E]\d+)[\s　]+(.+)$/.exec(line.trim());
    if (!m) continue;
    const t = m[2].trim();
    const cut = t.indexOf("：");
    const [title, detail] = cut > 0 && cut <= 30 ? [t.slice(0, cut), t.slice(cut + 1)] : [t, ""];
    out.push({ id: m[1], group: ISSUE_GROUPS[m[1][0]], title, detail });
  }
  const order = { B: 0, A: 1, C: 2, D: 3, E: 4 };
  return out.sort((a, b) => order[a.id[0]] - order[b.id[0]] || a.id.localeCompare(b.id, "en", { numeric: true }));
}

// CLAUDE.md 里某节写了「Vault P-xx」，就用该节标题补偏好标题。
function prefTitlesFromInstructions(text) {
  const out = {};
  let heading = null;
  for (const line of String(text || "").split("\n")) {
    const h = /^## (?:\d+\.\s*)?(.+)$/.exec(line);
    if (h) { heading = h[1].trim(); continue; }
    for (const p of line.match(/Vault P-\d{2}/g) || []) out[p.slice(6)] ||= heading;
  }
  return out;
}

// LESSONS：「## G-01 标题（2026-10-24 提升）」。
export function lessonsTitles(text) {
  const out = [];
  for (const line of String(text).split("\n")) {
    const m = /^## (G-\d{2}) (.+?)(?:（(\d{4}-\d{2}-\d{2}) ?(提升|新增)[^）]*）)?\s*$/.exec(line);
    if (m) out.push({ id: m[1], title: m[2].trim(), date: m[3] || null, kind: m[4] || null });
  }
  return out;
}

// CLAUDE.md §7「全局坑里这几条每次都要守」下面的 G 编号。
function mustKeep(text) {
  const body = section(text || "", /每次都要守/, /^##? /);
  return new Set((body || "").match(/G-\d{2}/g) || []);
}

export function countHits(jsonl) {
  const hits = {};
  let since = null;
  for (const line of String(jsonl).split("\n")) {
    if (!line.trim()) continue;
    let row;
    try { row = JSON.parse(line); } catch { continue; }
    if (!since || (row.time && row.time < since)) since = row.time || since;
    for (const id of Array.isArray(row.ids) ? row.ids : []) if (/^G-\d{2}$/.test(id)) hits[id] = (hits[id] || 0) + 1;
  }
  return { hits, since };
}

// 自检报告：✓ ⚠ ✗ · 开头的是检查项，缩进的下一行是说明。
export function parseDoctor(text) {
  const items = [];
  const MARK = { "✓": "ok", "⚠": "warn", "✗": "fail", "·": "info" };
  let at = null;
  for (const line of String(text).split("\n")) {
    const start = /^开始 (\S+)/.exec(line);
    if (start) { at = start[1]; continue; }
    const m = /^([✓⚠✗·]) (.+)$/.exec(line);
    if (m) { items.push({ mark: MARK[m[1]], title: m[2].trim(), detail: "" }); continue; }
    if (/^\s{2,}\S/.test(line) && items.length && !items.at(-1).detail) items.at(-1).detail = line.trim();
  }
  const count = (k) => items.filter((i) => i.mark === k).length;
  return { at, items, ok: count("ok"), warn: count("warn"), fail: count("fail") };
}

// 机器守护卡片：说明是固定对照表，证据现读。
const GUARDS = [
  { id: "deny", title: "强推、删除远端 main", what: "直接拒绝", who: ["Claude 拒绝", "Codex 先问"], keeps: "工程流程" },
  { id: "git", title: "git 危险操作", what: "Codex 先问；Claude 只保留拒绝", who: ["Codex"], keeps: "工程流程" },
  { id: "remind", title: "按关键词提醒全局坑", what: "动手前把相关 G 条目塞给 Agent", who: ["Claude", "Codex"], keeps: "全局坑" },
  { id: "handoff", title: "上下文提醒交接", what: "上下文到一半时提醒出交接卡", who: ["Claude"], keeps: "CLAUDE.md §5" },
  { id: "sync", title: "全局指令和仓库版一致", what: "自检比对本机文件和仓库版", who: ["Claude", "Codex"], keeps: "全局指令进 git" },
  { id: "weekly", title: "每周汇总与再犯统计", what: "每周汇总 LESSONS 命中和 Skill 调用", who: ["Claude", "Codex"], keeps: "复盘" },
];


async function projectRules(reader, roster) {
  const list = roster?.value?.projects;
  if (!Array.isArray(list)) return null;
  const home = reader.paths.home;
  return Promise.all(list.map(async (p) => {
    const raw = String(p.path || "");
    const path = raw.startsWith("~/") ? join(home, raw.slice(2)) : raw;
    // 只读工作目录里的项目；名册写到别处的一律不读（读不到显示未知）。
    const inWork = path.startsWith(reader.paths.work + "/");
    const read = async (rel) => (inWork ? reader.text(join(path, rel)) : null);
    const [agents, claude, lessons, adr] = await Promise.all([
      read("AGENTS.md"), read("CLAUDE.md"), read("docs/LESSONS.md"),
      inWork ? reader.list(join(path, "docs", "adr")) : null,
    ]);
    const lines = (f) => (f ? f.text.split("\n").length : null);
    return {
      name: p.name || p.id || "未知", type: p.type || null, readable: inWork,
      agents: lines(agents), claude: lines(claude),
      lessons: lessons ? (lessons.text.match(/^## L-\d+/gm) || []).length : null,
      adr: adr ? adr.filter((e) => e.isFile() && e.name.endsWith(".md")).length : null,
    };
  }));
}

async function claudeMemory(reader) {
  const projects = await reader.list(join(reader.paths.claude, "projects"));
  if (!projects) return null;
  const counts = await Promise.all(projects.filter((e) => e.isDirectory()).map(async (dir) => {
    const files = await reader.list(join(reader.paths.claude, "projects", dir.name, "memory"));
    return (files || []).filter((f) => f.isFile() && f.name.endsWith(".md") && f.name !== "MEMORY.md").length;
  }));
  return { count: counts.reduce((a, b) => a + b, 0), location: "~/.claude/projects/*/memory/" };
}

export async function readCockpitRules({ home = homedir(), clock = Date.now, fs, git = runGit } = {}) {
  const reader = createSafeReader({ home, ...(fs ? { fs } : {}) });
  const p = reader.paths, now = clock();
  const doctorDir = join(p.kitState, "doctor");
  const [vault, review, claudeMd, codexMd, hermesMem, lessons, flow, hitsFile, doctorList, roster, memory, settings, claudeSync, codexSync, log] = await Promise.all([
    reader.text(p.vaultPrefs),
    reader.text(join(p.kitState, "reviews", REVIEW_FILE)),
    reader.text(join(p.claude, "CLAUDE.md")),
    reader.text(join(p.codex, "AGENTS.md")),
    reader.stat(join(p.hermes, "memories", "USER.md")),
    reader.text(join(p.agentKit, "LESSONS.md")),
    reader.stat(join(p.agentKit, "工程流程.md")),
    reader.text(join(p.kitState, "lessons-hits.jsonl")),
    reader.list(doctorDir),
    reader.json(p.projects),
    claudeMemory(reader),
    reader.json(join(p.claude, "settings.json")),
    instructionSync(reader, "claude"),
    instructionSync(reader, "codex"),
    (await reader.resolveAllowed(p.agentKit)) ? git(["-C", p.agentKit, "log", "-n", "12", "--date=short", "--format=%ad%x09%s"]) : null,
  ]);

  // 1 个人偏好 + 2 落地对照
  const landing = review ? reviewLanding(review.text) : null;
  const fromClaude = prefTitlesFromInstructions(claudeMd?.text);
  const prefs = vault ? vaultPrefIds(vault.text).map(({ id, basis }) => {
    const row = landing?.[id];
    const u = { level: "u", note: "" };
    return {
      id, basis, title: row?.title || fromClaude[id] || "标题未知",
      claude: row?.claude || u, codex: row?.codex || u, hermes: row?.hermes || u, agumon: u,
      reviewed: !!row,
    };
  }) : null;

  // 3 工程约束
  const { hits, since } = hitsFile ? countHits(hitsFile.text) : { hits: {}, since: null };
  const must = mustKeep(claudeMd?.text);
  const lessonRows = lessons ? lessonsTitles(lessons.text).map((g) => ({ ...g, hits: hitsFile ? hits[g.id] || 0 : null, must: must.has(g.id) })) : null;

  // 4 机器守护
  const latest = (doctorList || []).filter((e) => e.isFile() && /^doctor-.*\.txt$/.test(e.name)).map((e) => e.name).sort().at(-1);
  const doctorFile = latest ? await reader.text(join(doctorDir, latest)) : null;
  const doctor = doctorFile ? { ...parseDoctor(doctorFile.text), file: tilde(join(doctorDir, latest), home), mtime: doctorFile.mtime } : null;
  if (doctor) doctor.state = freshness(doctor.at || doctor.mtime, now, DOCTOR_MAX_MS);
  const deny = settings ? (settings.value?.permissions?.deny || []).length : null;
  const totalHits = Object.values(hits).reduce((a, b) => a + b, 0);
  const hookCmds = JSON.stringify(settings?.value?.hooks || {});
  const evidence = {
    deny: deny == null ? "未知" : `${deny} 条拒绝规则`,
    git: "agent-kit.rules",
    remind: hitsFile ? `lessons-remind；累计命中 ${totalHits.toLocaleString("en-US")} 次` : "未知",
    handoff: settings ? (/context[_-]handoff/.test(hookCmds) ? "context-handoff hook 已装" : "没找到 context-handoff hook") : "未知",
    sync: [claudeSync, codexSync].every((s) => s.level === "ok") ? "两份都一致" : `Claude：${claudeSync.text}；Codex：${codexSync.text}`,
    weekly: "weekly-review",
  };
  const guards = GUARDS.map((g) => ({ ...g, evidence: evidence[g.id], level: g.id === "sync" ? ([claudeSync, codexSync].every((s) => s.level === "ok") ? "ok" : "warn") : null }));

  // 5 项目规则
  const projects = await projectRules(reader, roster);

  // 6 问题与变更
  const issues = review ? reviewIssues(review.text) : null;
  const changes = log ? log.split("\n").filter(Boolean).map((l) => {
    const [date, ...rest] = l.split("\t");
    const subject = rest.join("\t");
    const ref = /\(#(\d+)\)\s*$/.exec(subject);
    return { date, subject: subject.replace(/\s*\(#\d+\)\s*$/, ""), ref: ref ? `agent-kit #${ref[1]}` : "agent-kit" };
  }) : null;

  const src = (path, at) => ({ path: tilde(path, home), at: at || null, state: at ? "ok" : "missing" });
  return {
    readAt: new Date(now).toISOString(),
    layers: {
      pref: { ...src(p.vaultPrefs, vault?.mtime), count: prefs?.length ?? null, restricted: true },
      land: { ...src(join(p.kitState, "reviews", REVIEW_FILE), review?.mtime), count: 4,
        sync: { claude: claudeSync, codex: codexSync }, hermesMemoryAt: hermesMem?.mtime || null },
      eng: { ...src(join(p.agentKit, "LESSONS.md"), lessons?.mtime), count: lessonRows?.length ?? null, flowAt: flow?.mtime || null, hitsSince: since },
      guard: { ...(doctor ? { path: doctor.file, at: doctor.at || doctor.mtime, state: doctor.state } : src(doctorDir, null)), count: GUARDS.length },
      proj: { ...src(p.projects, roster?.mtime), count: projects?.length ?? null },
      issue: { ...src(join(p.kitState, "reviews", REVIEW_FILE), review?.mtime), count: issues ? issues.filter((i) => i.group === "冲突").length : null },
    },
    prefs, lessons: lessonRows, doctor, guards, projects, memory, issues, changes,
  };
}
