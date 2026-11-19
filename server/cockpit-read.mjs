// 驾驶舱只读读取的公共部分（#74）：路径都由 home 推出，读文件前按 realpath 核对白名单根目录，
// 前端不能传路径；配置原文不出本模块，只交出调用方挑过的键。
import filesystem from "node:fs/promises";
import { execFile } from "node:child_process";
import { homedir } from "node:os";
import { join, sep } from "node:path";

const MAX_BYTES = 2 * 1024 * 1024;

export function cockpitPaths(home = homedir()) {
  const work = join(home, "Documents", "ChatGPT", "个人", "work");
  const support = join(home, "Library", "Application Support");
  return {
    home,
    work,
    agentKit: join(work, "agent-kit"),
    mySkills: join(work, "my-skills"),
    projects: join(work, "digital-twin", "projects.json"),
    kitState: join(support, "agent-kit"),
    readings: join(support, "app.postpane.mac", "last-account-readings.json"),
    vaultPrefs: join(home, "Documents", "Obsidian Vault", "个人上下文", "当前人机协作偏好.md"),
    claude: join(home, ".claude"),
    claudeJson: join(home, ".claude.json"),
    codex: join(home, ".codex"),
    agents: join(home, ".agents"),
    hermes: join(home, ".hermes"),
  };
}

// 白名单根目录：只有 realpath 落在这些目录（或正好是这些文件）里的才读。
export function allowedRoots(paths) {
  return [
    paths.claude, paths.claudeJson, paths.codex, paths.agents, paths.hermes,
    paths.work, paths.kitState, paths.readings, paths.vaultPrefs,
  ];
}

// 不论在哪个根下面，这些一律不读：凭据、备份、会话记录。
const DENIED = [/(^|\/)auth\.json$/i, /(^|\/)sessions(\/|$)/, /\.bak$|\.backup|backup/i, /(^|\/)state\.db/];

export function createSafeReader({ home = homedir(), fs = filesystem } = {}) {
  const paths = cockpitPaths(home);
  let realRoots;
  async function roots() {
    if (!realRoots)
      realRoots = await Promise.all(allowedRoots(paths).map(async (root) => {
        try { return await fs.realpath(root); } catch { return null; }
      }));
    return realRoots.filter(Boolean);
  }
  async function resolveAllowed(path) {
    if (DENIED.some((re) => re.test(path))) return null;
    let real;
    try { real = await fs.realpath(path); } catch { return null; }
    if (DENIED.some((re) => re.test(real))) return null;
    const ok = (await roots()).some((root) => real === root || real.startsWith(root + sep));
    return ok ? real : null;
  }
  return {
    paths,
    resolveAllowed,
    // 读文本：不在白名单、不存在、超过上限都返回 null（页面显示「未知」）。
    async text(path) {
      const real = await resolveAllowed(path);
      if (!real) return null;
      try {
        const info = await fs.stat(real);
        if (!info.isFile() || info.size > MAX_BYTES) return null;
        return { text: await fs.readFile(real, "utf8"), mtime: info.mtime.toISOString() };
      } catch { return null; }
    },
    async json(path) {
      const file = await this.text(path);
      if (!file) return null;
      try { return { value: JSON.parse(file.text), mtime: file.mtime }; } catch { return null; }
    },
    async stat(path) {
      const real = await resolveAllowed(path);
      if (!real) return null;
      try { const info = await fs.stat(real); return { mtime: info.mtime.toISOString(), dir: info.isDirectory() }; } catch { return null; }
    },
    // 列目录名（不读内容）；目录不在白名单就返回 null。
    async list(path) {
      const real = await resolveAllowed(path);
      if (!real) return null;
      try { return (await fs.readdir(real, { withFileTypes: true })).filter((e) => !e.name.startsWith(".")); } catch { return null; }
    },
    // 只算 realpath，不读内容：用于判断 Skill 来自哪里。目录外的链接也只给出路径前缀分类。
    async realpathOf(path) {
      try { return await fs.realpath(path); } catch { return null; }
    },
  };
}

// 只读 git（规则页的 agent-kit 提交、Skill 页的 my-skills 登记日期共用）：失败或超时返回 null，测试可注入替身。
export function runGit(args, { maxBuffer = 256 * 1024 } = {}) {
  return new Promise((resolve) => {
    execFile("/usr/bin/git", args, { timeout: 5000, maxBuffer }, (error, stdout) => resolve(error ? null : stdout));
  });
}

// 显示用路径：把 home 换成 ~。
export function tilde(path, home) {
  return path === home ? "~" : path.startsWith(home + sep) ? "~" + path.slice(home.length) : path;
}

// 正文里疑似密钥的值打码：键名像 token/secret/key/password，或值本身像密钥。
const SECRET_KEY = /((?:api[_-]?key|token|secret|password|passwd|app[_-]?secret|access[_-]?key|client[_-]?secret|authorization)["']?\s*[:=]\s*)(["']?)[^\s"',}]+/gi;
const SECRET_VALUE = /\b(?:sk-[A-Za-z0-9_-]{8,}|gh[pousr]_[A-Za-z0-9]{16,}|xox[abpr]-[A-Za-z0-9-]{10,}|AKIA[0-9A-Z]{16}|eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]+|[A-Fa-f0-9]{40,}|cli_[A-Za-z0-9]{12,})\b/g;
export const MASK = "••••••••";
export function maskSecrets(text) {
  return String(text)
    .replace(SECRET_KEY, (_, head, quote) => `${head}${quote}${MASK}`)
    .replace(SECRET_VALUE, MASK);
}

// 读数是否过期：没有时间算未知，超过阈值算过期。
export function freshness(at, now, maxMs) {
  const t = Date.parse(at || "");
  if (!Number.isFinite(t)) return "missing";
  return now - t > maxMs ? "stale" : "ok";
}

// 内存快照（G-10）：有快照先回快照，超过 maxAgeMs 就后台刷新；refresh=true 才等现读。
// 只放内存，不写数据目录；服务重启后第一次打开现读一次。
export function cachedRead(read, { maxAgeMs = 60_000, clock = Date.now } = {}) {
  let snapshot = null, at = 0, pending = null;
  function reload() {
    pending ||= read().then((value) => { snapshot = value; at = clock(); return value; }).finally(() => { pending = null; });
    return pending;
  }
  return async ({ refresh = false } = {}) => {
    if (refresh || !snapshot) return reload();
    if (clock() - at > maxAgeMs) reload().catch(() => {});
    return snapshot;
  };
}

// 全局指令「仓库版 + 个人段」拼装后与本机文件比对（与 agent-kit tools/global-instructions.mjs 同一规则，只读）。
const MARK = /<!-- personal:([\w-]+) -->/g;
export function composeInstructions(base, personalText) {
  const blocks = {};
  const re = /<!-- personal:([\w-]+) -->\n([\s\S]*?)\n<!-- \/personal:\1 -->/g;
  for (const m of String(personalText || "").matchAll(re)) blocks[m[1]] = m[2];
  const missing = [];
  const text = base.replace(MARK, (all, name) => {
    if (!(name in blocks)) { missing.push(name); return all; }
    return blocks[name];
  });
  return { text, missing };
}

export async function instructionSync(reader, which) {
  const p = reader.paths;
  const base = await reader.text(join(p.agentKit, "global", which, which === "claude" ? "CLAUDE.md" : "AGENTS.md"));
  const personal = await reader.text(join(p.kitState, "personal", `${which}.md`));
  const installed = await reader.text(which === "claude" ? join(p.claude, "CLAUDE.md") : join(p.codex, "AGENTS.md"));
  if (!base || !installed) return { level: "unk", text: "缺少仓库版或本机文件，无从比对" };
  const { text, missing } = composeInstructions(base.text, personal?.text || "");
  if (missing.length) return { level: "warn", text: `个人段缺 ${missing.join("、")}` };
  return text === installed.text
    ? { level: "ok", text: "和 agent-kit 仓库版一致" }
    : { level: "warn", text: "和 agent-kit 仓库版不一致" };
}
