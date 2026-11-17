// 驾驶舱 Agent 页（#74）：只读汇总本机 4 个 Agent。ChatGPT 不计入。
// 配置文件只取挑过的键（模型名、MCP 名字、hook 名字、条数）；指令文件给全文，疑似密钥打码。
import { homedir } from "node:os";
import { join } from "node:path";
import { parse as parseYaml } from "yaml";
import { createSafeReader, tilde, maskSecrets, freshness, instructionSync } from "./cockpit-read.mjs";

const QUOTA_MAX_MS = 30 * 60 * 1000;
const GATEWAY_MAX_MS = 15 * 60 * 1000;

const PROFILES = {
  claude: { name: "Claude Code", en: "CLAUDE CODE", role: "编程主力", entry: "Claude 桌面应用 · Code 标签",
    desc: "写代码、改文档、做 UI 稿；和 Codex 在同一项目目录接力。" },
  codex: { name: "Codex", en: "CODEX", role: "编程与审查搭档", entry: "Codex 桌面应用 / 命令行",
    desc: "写代码、做工程审查，也做业务分析和长文档；和 Claude 共用协作规则。" },
  hermes: { name: "Hermes 私人分身", en: "HERMES · 私人", role: "私人数字分身", entry: "飞书私聊",
    desc: "常浩的私人助手，在飞书里回消息、查知识库、跑定时任务。" },
  agumon: { name: "Hermes 企业分身", en: "HERMES · 企业", role: "企业数字分身", entry: "飞书（含群聊）",
    desc: "面向团队的分身，在飞书群和私聊里答问题。" },
};

// hook 说明对照表：文件里读不出用途，按名字对上；对不上的只显示名字。
const HOOK_NOTES = {
  "guard-git": "危险 git 操作先问或直接拒绝",
  "lessons-remind": "按关键词提醒全局坑",
  "skill-usage": "记录 Skill 调用",
  "context-handoff": "上下文到一半时提醒交接",
  "session-organize-once": "新会话自动命名、归组",
  "PostPane": "会话来源、权限请求、提醒、压缩前",
};
const PERMISSION_MODES = { bypassPermissions: "跳过确认", acceptEdits: "自动接受编辑", plan: "计划模式", default: "逐项确认" };
const QUOTA_LABELS = { "5h": "5 小时", Weekly: "本周", Fable: "Fable 本周", Cloud: "云端会话" };

function modelName(id) {
  const m = /^claude-(opus|sonnet|haiku|fable)-(\d+)-(\d+)/.exec(id || "");
  return m ? `${m[1][0].toUpperCase()}${m[1].slice(1)} ${m[2]}.${m[3]}` : id || null;
}

// Markdown 目录：二级标题；每节里出现的 P 编号记在该节上。
export function outline(text) {
  const lines = String(text).split("\n");
  let level = lines.some((l) => /^## /.test(l)) ? "## " : "# ";
  const toc = [];
  let skippedTitle = level === "# ";
  for (const line of lines) {
    if (line.startsWith(level)) {
      if (skippedTitle) { skippedTitle = false; continue; }
      const raw = line.slice(level.length).trim();
      const m = /^(\d+)\.\s*(.*)$/.exec(raw);
      toc.push({ num: m ? `§${m[1]}` : "", title: m ? m[2] : raw, prefs: [] });
    } else if (toc.length) {
      for (const p of line.match(/P-\d{2}/g) || []) if (!toc.at(-1).prefs.includes(p)) toc.at(-1).prefs.push(p);
    }
  }
  return toc;
}

const ORIGIN = {
  claude: "agent-kit global/claude/CLAUDE.md + 本机个人段，由 global-instructions.mjs 拼装",
  codex: "agent-kit global/codex/AGENTS.md + 本机个人段，由 global-instructions.mjs 拼装",
};

async function instructions(reader, path, syncFor) {
  const file = await reader.text(path);
  const display = tilde(path, reader.paths.home);
  if (!file) return { path: display, state: "missing" };
  const text = maskSecrets(file.text);
  const toc = outline(text);
  const prefs = [...new Set(toc.flatMap((t) => t.prefs))].sort();
  return {
    path: display, state: "ok", lines: file.text.split("\n").length, updatedAt: file.mtime,
    origin: ORIGIN[syncFor] || "本机文件，没有进任何仓库",
    sync: syncFor ? await instructionSync(reader, syncFor) : { level: "unk", text: "没有仓库版，无从比对" },
    prefs, toc, text,
  };
}

async function skillsIn(reader, dir) {
  const entries = await reader.list(dir);
  if (!entries) return null;
  const out = [];
  for (const e of entries) {
    const real = await reader.realpathOf(join(dir, e.name));
    out.push({ name: e.name, real: real || "" });
  }
  return out;
}

function quota(readings, provider, now) {
  const p = readings?.value?.providers?.find((x) => x.provider === provider);
  if (!p) return null;
  const checked = freshness(p.checkedAt, now, QUOTA_MAX_MS);
  return {
    checkedAt: p.checkedAt || null,
    rows: (p.quotas || []).map((q) => {
      const state = checked === "ok" ? freshness(q.observedAt || p.checkedAt, now, QUOTA_MAX_MS) : checked;
      return {
        label: QUOTA_LABELS[q.shortLabel] || q.shortLabel || "未知",
        usedPercent: Number.isFinite(q.usedPercent) ? Math.round(q.usedPercent * 10) / 10 : null,
        resetAt: q.resetAt || null,
        level: q.status === "normal" ? "ok" : "warn",
        state,
        observedAt: q.observedAt || p.checkedAt || null,
      };
    }),
  };
}

function hookName(command = "") {
  if (/PostPane/.test(command)) return { name: "PostPane", origin: "驿窗" };
  const m = /([\w-]+)\.(?:mjs|js|py|sh)\b/.exec(command);
  const name = m ? m[1].replace(/_/g, "-") : "未知 hook";
  return { name, origin: /agent-kit/.test(command) ? "agent-kit" : "本机" };
}

function source(label, path, at, state, home) {
  return { label, path: tilde(path, home), at: at || null, state: state || (at ? "ok" : "missing") };
}

async function claudeAgent(reader, readings, now) {
  const p = reader.paths, home = p.home;
  const [instr, settings, cj] = await Promise.all([
    instructions(reader, join(p.claude, "CLAUDE.md"), "claude"),
    reader.json(join(p.claude, "settings.json")),
    reader.json(p.claudeJson),
  ]);
  const s = settings?.value || {};
  const modelIds = Object.keys(s.modelSettings || {});
  const hooks = [];
  const seen = new Map();
  for (const groups of Object.values(s.hooks || {}))
    for (const g of groups || []) for (const h of g.hooks || []) {
      const { name, origin } = hookName(h.command);
      seen.set(name, { name, origin, count: (seen.get(name)?.count || 0) + 1 });
    }
  for (const h of seen.values())
    hooks.push({ name: h.count > 1 && h.name === "PostPane" ? `PostPane × ${h.count}` : h.name, desc: HOOK_NOTES[h.name] || "", origin: h.origin });
  const skills = await skillsIn(reader, join(p.claude, "skills"));
  let skillInfo = null;
  if (skills) {
    const mine = skills.filter((x) => x.real.startsWith(p.mySkills + "/"));
    const linked = skills.filter((x) => !mine.includes(x) && (x.real.startsWith(join(p.agents, "skills") + "/") || x.real.startsWith(join(p.codex, "skills") + "/")));
    skillInfo = { total: skills.length, mine: mine.length, mineList: mine.map((x) => x.name).sort(),
      parts: [["链到 ~/.agents/skills 等", linked.length], ["来自 my-skills", mine.length], ["仅本机", skills.length - mine.length - linked.length]] };
  }
  const q = quota(readings, "claude", now);
  const mcp = cj ? Object.keys(cj.value?.mcpServers || {}) : null;
  return {
    instructions: instr,
    model: settings ? { main: modelName(modelIds[0]) || "未知", id: modelIds[0] || null, note: "按会话选择；这里取 settings.json 里记过的模型",
      permission: PERMISSION_MODES[s.permissions?.defaultMode] || s.permissions?.defaultMode || "未知", deny: (s.permissions?.deny || []).length } : null,
    skills: skillInfo, mcp, hooks: settings ? hooks : null, quota: q,
    sources: [
      source("全局指令", join(p.claude, "CLAUDE.md"), instr.updatedAt, instr.state, home),
      source("模型、权限与 hook", join(p.claude, "settings.json"), settings?.mtime, null, home),
      source("Skill", join(p.claude, "skills"), skills ? new Date(now).toISOString() : null, null, home),
      { ...source("MCP", p.claudeJson, cj?.mtime, null, home), note: "只取名字" },
      { ...source("额度", p.readings, q?.checkedAt, q ? freshness(q.checkedAt, now, QUOTA_MAX_MS) : "missing", home), note: "驿窗 HUD 快照" },
    ],
    skipped: ["~/.claude.json 里除 MCP 名字以外的内容", "projects/ 会话记录"],
  };
}

// config.toml 只读顶层四个键和 [mcp_servers.名字] 表名，不解析其余内容。
export function codexConfig(text) {
  const top = {}, mcp = [];
  let inTop = true;
  for (const line of String(text).split("\n")) {
    const table = /^\s*\[([^\]]+)\]\s*$/.exec(line);
    if (table) {
      inTop = false;
      const m = /^mcp_servers\.("([^"]+)"|[\w-]+)$/.exec(table[1].trim());
      if (m) mcp.push(m[2] || m[1]);
      continue;
    }
    if (!inTop) continue;
    const kv = /^\s*(model|model_reasoning_effort|approval_policy|sandbox_mode)\s*=\s*"([^"]*)"/.exec(line);
    if (kv) top[kv[1]] = kv[2];
  }
  return { ...top, mcp };
}
const APPROVAL = { "on-request": "按需确认", never: "从不确认", untrusted: "不信任的先问", "on-failure": "失败时确认" };
const SANDBOX = { "danger-full-access": "沙箱完全访问", "workspace-write": "可写工作区", "read-only": "只读" };

async function codexAgent(reader, readings, now) {
  const p = reader.paths, home = p.home;
  const [instr, cfgFile, hooksFile, rules] = await Promise.all([
    instructions(reader, join(p.codex, "AGENTS.md"), "codex"),
    reader.text(join(p.codex, "config.toml")),
    reader.json(join(p.codex, "hooks.json")),
    reader.list(join(p.codex, "rules")),
  ]);
  const cfg = cfgFile ? codexConfig(cfgFile.text) : null;
  const [agentSkills, codexSkills] = await Promise.all([skillsIn(reader, join(p.agents, "skills")), skillsIn(reader, join(p.codex, "skills"))]);
  let skillInfo = null;
  if (agentSkills || codexSkills) {
    const all = [...(agentSkills || []), ...(codexSkills || [])];
    const mine = [...new Set(all.filter((x) => x.real.startsWith(p.mySkills + "/")).map((x) => x.name))].sort();
    skillInfo = { total: all.length, mine: mine.length, mineList: mine,
      parts: [["~/.agents/skills", agentSkills?.length ?? 0], ["~/.codex/skills", codexSkills?.length ?? 0], ["其中来自 my-skills", mine.length]] };
  }
  const hookGroups = hooksFile?.value?.hooks || {};
  const hookCount = Object.values(hookGroups).reduce((n, v) => n + (Array.isArray(v) ? v.length : 0), 0);
  const hooks = hooksFile ? [{ name: `hooks.json · ${hookCount} 条`, desc: Object.entries(hookGroups).map(([k, v]) => `${k} ${Array.isArray(v) ? v.length : 0}`).join(" · "), origin: "本机" }] : [];
  for (const r of rules || []) if (r.name.endsWith(".rules")) hooks.push({ name: r.name, desc: r.name === "agent-kit.rules" ? "危险 git 操作先问" : "", origin: r.name.startsWith("agent-kit") ? "agent-kit" : "本机" });
  const q = quota(readings, "codex", now);
  return {
    instructions: instr,
    model: cfg ? { main: cfg.model || "未知", id: cfg.model_reasoning_effort ? `推理强度 ${cfg.model_reasoning_effort}` : null, note: "取自 config.toml",
      permission: [APPROVAL[cfg.approval_policy] || cfg.approval_policy, SANDBOX[cfg.sandbox_mode] || cfg.sandbox_mode].filter(Boolean).join(" · ") || "未知" } : null,
    skills: skillInfo, mcp: cfg ? cfg.mcp : null, hooks: hooksFile || rules ? hooks : null, quota: q,
    sources: [
      source("全局指令", join(p.codex, "AGENTS.md"), instr.updatedAt, instr.state, home),
      { ...source("模型与 MCP", join(p.codex, "config.toml"), cfgFile?.mtime, null, home), note: "只取模型和名字" },
      source("Skill", join(p.agents, "skills"), agentSkills ? new Date(now).toISOString() : null, null, home),
      source("Hook", join(p.codex, "hooks.json"), hooksFile?.mtime, null, home),
      { ...source("额度", p.readings, q?.checkedAt, q ? freshness(q.checkedAt, now, QUOTA_MAX_MS) : "missing", home), note: "驿窗 HUD 快照" },
    ],
    skipped: ["auth.json 及其备份", "config.toml 的备份", "sessions/"],
  };
}

async function hermesAgent(reader, root, now) {
  const home = reader.paths.home;
  const [instr, cfgFile, gw, skills, memory] = await Promise.all([
    instructions(reader, join(root, "SOUL.md"), null),
    reader.text(join(root, "config.yaml")),
    reader.json(join(root, "gateway_state.json")),
    reader.list(join(root, "skills")),
    reader.stat(join(root, "memories", "USER.md")),
  ]);
  let cfg = null;
  if (cfgFile) try { cfg = parseYaml(cfgFile.text) || {}; } catch { cfg = null; }
  const fallback = cfg?.fallback_model?.model;
  const g = gw?.value;
  const online = g ? {
    state: g.gateway_state || "未知", version: g.code_version || null, updatedAt: g.updated_at || null,
    freshness: freshness(g.updated_at, now, GATEWAY_MAX_MS),
    platforms: Object.entries(g.platforms || {}).map(([name, v]) => ({ name, state: v?.state || "未知" })),
  } : null;
  const dirs = (skills || []).filter((e) => e.isDirectory());
  return {
    instructions: instr,
    model: cfg ? { main: cfg.model?.default || "未知", id: cfg.model?.provider ? `经 ${cfg.model.provider}` : null,
      note: fallback ? `备用模型 ${fallback}；取自 config.yaml` : "取自 config.yaml", permission: "命令白名单 + 审批" } : null,
    skills: skills ? { total: dirs.length, mine: 0, mineList: [], parts: [["Hermes 自带分类", dirs.length], ["来自 my-skills", 0]] } : null,
    mcp: cfg ? Object.keys(cfg.mcp_servers || {}) : null, hooks: [], online,
    memoryAt: memory?.mtime || null,
    sources: [
      source("指令", join(root, "SOUL.md"), instr.updatedAt, instr.state, home),
      { ...source("记忆", join(root, "memories", "USER.md"), memory?.mtime, null, home), note: "只取更新时间" },
      { ...source("模型与 MCP", join(root, "config.yaml"), cfgFile?.mtime, null, home), note: "只取模型和名字" },
      source("Skill", join(root, "skills"), skills ? new Date(now).toISOString() : null, null, home),
      source("在线", join(root, "gateway_state.json"), online?.updatedAt, online ? online.freshness : "missing", home),
    ],
    skipped: ["auth.json", "sessions/、state.db", "飞书消息缓存"],
  };
}

function overall(agent) {
  if (agent.instructions.state !== "ok" && !agent.model && !agent.online) return { level: "unk", text: "未知 · 本机读不到配置" };
  if (agent.online) {
    if (agent.online.freshness !== "ok") return { level: "warn", text: "网关读数过期" };
    if (agent.online.state !== "running") return { level: "warn", text: `网关 ${agent.online.state}` };
    const feishu = agent.online.platforms.find((x) => x.name === "feishu");
    return feishu && feishu.state !== "connected"
      ? { level: "warn", text: `网关运行中 · 飞书 ${feishu.state}` }
      : { level: "ok", text: feishu ? "网关运行中 · 飞书已连接" : "网关运行中" };
  }
  const stale = (agent.quota?.rows || []).filter((r) => r.state !== "ok").length;
  return stale ? { level: "warn", text: `可用 · ${stale} 项读数过期` } : { level: "ok", text: "可用" };
}

export async function readCockpitAgents({ home = homedir(), clock = Date.now, fs } = {}) {
  const reader = createSafeReader({ home, ...(fs ? { fs } : {}) });
  const now = clock();
  const [readings, catalog] = await Promise.all([
    reader.json(reader.paths.readings),
    reader.json(join(reader.paths.mySkills, "catalog", "skills.json")),
  ]);
  const parts = await Promise.all([
    claudeAgent(reader, readings, now),
    codexAgent(reader, readings, now),
    hermesAgent(reader, reader.paths.hermes, now),
    hermesAgent(reader, join(reader.paths.hermes, "profiles", "agumon"), now),
  ]);
  const agents = ["claude", "codex", "hermes", "agumon"].map((id, i) => {
    const a = { id, ...PROFILES[id], ...parts[i] };
    return { ...a, status: overall(a) };
  });
  const mySkillsTotal = Array.isArray(catalog?.value?.skills) ? catalog.value.skills.length : null;
  return { readAt: new Date(now).toISOString(), mySkillsTotal, agents };
}
