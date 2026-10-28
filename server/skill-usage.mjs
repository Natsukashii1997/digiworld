// 项目空间第二版第 2 批（issue #9）：实战——本机会话里用过哪些技能。默认关闭。
// 只记四样：技能名、次数、最近日期、归到哪个名册项目；不读、不存对话正文与会话路径。
// 开关关着时不碰会话目录（连目录列表都不读）。结果缓存到数据目录 skill-usage.json，只存统计值。
// 这一版不接设置页开关（用户 2026-10-29）：enabled 默认恒为 false，等设置页那一批连同能力授权迁移一起接。
import fs from "node:fs/promises";
import { createReadStream } from "node:fs";
import { createInterface } from "node:readline";
import { homedir } from "node:os";
import { join, basename, resolve } from "node:path";
import { failure } from "./repository.mjs";

const DAY = 86400000;
const WINDOW_DAYS = 30;
const FILE_LIMIT = 5000;
const NAME = /^[\w.-]{1,80}$/;
// Claude Code 内置命令不算技能。
export const BUILTIN = new Set([
  "add-dir", "agents", "bashes", "bug", "clear", "compact", "config", "context", "cost", "doctor", "effort",
  "exit", "export", "fast", "help", "hooks", "ide", "init", "install-github-app", "login", "logout", "mcp",
  "memory", "model", "output-style", "permissions", "plugin", "plugins", "pr-comments", "privacy-settings",
  "release-notes", "rename", "resume", "review", "rewind", "status", "statusline", "terminal-setup", "theme",
  "todos", "upgrade", "usage", "vim",
]);

// 插件前缀合并到技能名：mattpocock-skills:tdd → tdd（来源记为插件名）。
export function skillName(raw) {
  const value = String(raw || "").trim().replace(/^\//, "");
  const at = value.lastIndexOf(":");
  const name = at >= 0 ? value.slice(at + 1) : value;
  const plugin = at >= 0 ? value.slice(0, at) : "";
  return NAME.test(name) ? { name, plugin: NAME.test(plugin) ? plugin : "" } : null;
}

// 会话目录归到名册项目：在项目目录里（含仓库内 worktree）；或路径里某一段就是仓库名（外置 worktree）。
export function projectOf(cwd, projects) {
  if (typeof cwd !== "string" || !cwd.startsWith("/")) return null;
  const path = resolve(cwd);
  const inside = projects.find((p) => path === p.path || path.startsWith(p.path + "/"));
  if (inside) return inside.id;
  const parts = path.split("/");
  return projects.find((p) => parts.includes(basename(p.path)))?.id || null;
}

const COMMAND = /<command-name>\/?([\w:.-]+)<\/command-name>/g;
const textOf = (content) =>
  typeof content === "string" ? content
    : Array.isArray(content) ? content.map((c) => (c && typeof c.text === "string" ? c.text : "")).join(" ") : "";

// Claude Code 一行记录里的技能使用：Skill 工具调用 + 用户输入的斜杠命令（排除内置命令）。
export function claudeSkillsInLine(record) {
  const message = record?.message, out = [];
  if (!message) return out;
  if (Array.isArray(message.content))
    for (const c of message.content)
      if (c?.type === "tool_use" && c.name === "Skill" && typeof c.input?.skill === "string") out.push(c.input.skill);
  if (message.role === "user")
    for (const m of textOf(message.content).matchAll(COMMAND)) out.push(m[1]);
  return out.map(skillName).filter((s) => s && !BUILTIN.has(s.name));
}

// Codex 一行记录里用户点名的 $技能名（只认本机已装技能）；读技能文件不算。
export function codexSkillsInLine(record, installed) {
  const p = record?.payload;
  const user = p?.type === "user_message" || (p?.type === "message" && p.role === "user");
  if (!user) return [];
  const text = typeof p.message === "string" ? p.message : textOf(p.content);
  return [...text.matchAll(/\$([a-z][\w-]{2,})/g)].map((m) => m[1]).filter((n) => installed.has(n));
}

// 逐行读；提前停下时也关掉文件。
async function* readLines(path) {
  const input = createReadStream(path, { encoding: "utf8" });
  const rl = createInterface({ input, crlfDelay: Infinity });
  try {
    for await (const line of rl) yield line;
  } finally {
    rl.close();
    input.destroy();
  }
}

const dayOf = (record) => (typeof record?.timestamp === "string" && /^\d{4}-\d\d-\d\d/.test(record.timestamp) ? record.timestamp.slice(0, 10) : "");

export function createSkillUsage({
  directory,
  enabled = async () => false,
  roster = async () => ({ state: "error" }),
  clock = Date.now,
  filesystem = fs,
  lines = readLines,
  home = homedir(),
  claudeRoot = join(home, ".claude/projects"),
  codexRoot = join(home, ".codex/sessions"),
  skillDirs = {
    "自建": join(home, "Documents/ChatGPT/个人/work/my-skills/skills"),
    "Matt Pocock": join(home, ".agents/skills"),
    "Claude": join(home, ".claude/skills"),
    "Codex": join(home, ".codex/skills"),
  },
} = {}) {
  const cachePath = join(directory, "skill-usage.json");
  let running = null;

  async function recentFiles(root, recursive) {
    const out = [], since = clock() - WINDOW_DAYS * DAY;
    async function walk(dir, depth) {
      let entries;
      try {
        entries = await filesystem.readdir(dir, { withFileTypes: true });
      } catch {
        return;
      }
      for (const e of entries) {
        if (out.length >= FILE_LIMIT) return;
        const path = join(dir, e.name);
        if (e.isDirectory() && (recursive || depth === 0)) await walk(path, depth + 1);
        else if (e.isFile() && e.name.endsWith(".jsonl")) {
          try {
            if ((await filesystem.stat(path)).mtimeMs >= since) out.push(path);
          } catch {}
        }
      }
    }
    await walk(root, 0);
    return out;
  }

  async function installedSkills() {
    const names = new Map();
    for (const [src, dir] of Object.entries(skillDirs)) {
      try {
        for (const n of await filesystem.readdir(dir)) if (NAME.test(n) && !n.startsWith(".") && !names.has(n)) names.set(n, src);
      } catch {}
    }
    return names;
  }

  async function scan(projects) {
    const sinceDay = new Date(clock() - WINDOW_DAYS * DAY).toISOString().slice(0, 10);
    const installed = await installedSkills();
    const result = Object.fromEntries(projects.map((p) => [p.id, { skills: new Map(), codex: new Map(), sessions: new Set() }]));
    const bump = (map, name, src, day, session, sessions) => {
      const e = map.get(name) || { name, src, n: 0, last: "" };
      e.n++;
      if (day > e.last) e.last = day;
      if (!e.src && src) e.src = src;
      map.set(name, e);
      if (sessions) sessions.add(session);
    };
    let files = 0;
    for (const file of await recentFiles(claudeRoot, false)) {
      files++;
      for await (const line of lines(file)) {
        if (!line.includes('"Skill"') && !line.includes("command-name")) continue;
        let record;
        try { record = JSON.parse(line); } catch { continue; }
        const day = dayOf(record);
        if (!day || day < sinceDay) continue;
        const id = projectOf(record.cwd, projects);
        if (!id) continue;
        for (const s of claudeSkillsInLine(record))
          bump(result[id].skills, s.name, s.plugin || installed.get(s.name) || "", day, file, result[id].sessions);
      }
    }
    const names = new Set(installed.keys());
    for (const file of await recentFiles(codexRoot, true)) {
      files++;
      let id = null, first = true;
      for await (const line of lines(file)) {
        // 第一行是会话元数据，只取会话目录；归不到名册项目的会话不再往下读。
        if (first) {
          first = false;
          try { id = projectOf(JSON.parse(line)?.payload?.cwd, projects); } catch {}
          if (!id) break;
          continue;
        }
        if (!line.includes("$")) continue;
        let record;
        try { record = JSON.parse(line); } catch { continue; }
        const day = dayOf(record);
        if (!day || day < sinceDay) continue;
        for (const n of codexSkillsInLine(record, names)) bump(result[id].codex, n, "", day, file, null);
      }
    }
    const sorted = (map) => [...map.values()].sort((a, b) => b.n - a.n || a.name.localeCompare(b.name));
    return {
      files,
      projects: Object.fromEntries(Object.entries(result).map(([id, r]) => {
        const skills = sorted(r.skills).map(({ name, src, n, last }) => ({ name, src, n, last }));
        return [id, {
          skills,
          calls: skills.reduce((a, s) => a + s.n, 0),
          sessions: r.sessions.size,
          codex: sorted(r.codex).map(({ name, n, last }) => ({ name, n, last })),
        }];
      })),
    };
  }

  async function readCache() {
    try {
      const value = JSON.parse(await fs.readFile(cachePath, "utf8"));
      return value?.schema === 1 && value.projects && typeof value.projects === "object" ? value : null;
    } catch {
      return null;
    }
  }

  return {
    // 开关关着：只回“未开启”，不读缓存也不碰会话目录。
    async read() {
      if (!(await enabled())) return { state: "off" };
      const cached = await readCache();
      return cached ? { state: "ok", ...cached } : { state: "empty" };
    },
    async refresh(input = {}) {
      if (!input || typeof input !== "object" || Array.isArray(input) || Object.keys(input).length)
        throw failure("刷新不接受参数");
      if (!(await enabled())) throw failure("读取会话里的技能使用：未开启", 409);
      if (running) return running;
      running = (async () => {
        const r = await roster();
        if (r.state !== "ok") throw failure("名册读不到，无法归属技能使用", 409);
        const { projects } = await scan(r.projects);
        const value = { schema: 1, at: new Date(clock()).toISOString(), days: WINDOW_DAYS, projects };
        const tmp = `${cachePath}.${process.pid}.tmp`;
        await fs.writeFile(tmp, JSON.stringify(value) + "\n", { mode: 0o600 });
        await fs.rename(tmp, cachePath);
        const saved = await readCache();
        if (saved?.at !== value.at) throw failure("技能使用统计写后回读不一致", 500);
        return { state: "ok", ...saved };
      })().finally(() => { running = null; });
      return running;
    },
  };
}
