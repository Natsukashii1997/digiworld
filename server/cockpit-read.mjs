// 驾驶舱只读读取的公共部分（#74）：路径都由 home 推出，读文件前按 realpath 核对白名单根目录，
// 前端不能传路径；配置原文不出本模块，只交出调用方挑过的键。
import filesystem from "node:fs/promises";
import { execFile } from "node:child_process";
import { constants } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, sep } from "node:path";

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
  const sameIdentity = (before, after) => before.dev === after.dev && before.ino === after.ino;
  const sameFile = (before, after) => sameIdentity(before, after)
    && before.size === after.size && before.mtimeMs === after.mtimeMs
    && before.ctimeMs === after.ctimeMs && before.mode === after.mode && before.nlink === after.nlink;
  async function parentIdentities(real) {
    const root = (await roots()).filter((entry) => real === entry || real.startsWith(entry + sep))
      .sort((left, right) => right.length - left.length)[0];
    const boundary = real === root ? dirname(root) : root;
    const parents = [];
    for (let path = dirname(real); ; path = dirname(path)) {
      const info = await fs.lstat(path);
      if (!info.isDirectory() || info.isSymbolicLink()) throw new Error("读取目录身份变化");
      parents.push({ path, info });
      if (path === boundary) return parents;
    }
  }
  async function unchangedPath(real, info, parents) {
    if (await fs.realpath(real) !== real || !sameFile(info, await fs.lstat(real))) return false;
    for (const parent of parents) {
      const current = await fs.lstat(parent.path);
      if (!current.isDirectory() || current.isSymbolicLink() || !sameIdentity(parent.info, current)) return false;
    }
    return true;
  }
  return {
    paths,
    resolveAllowed,
    // 读文本：不在白名单、不存在、超过上限都返回 null（页面显示「未知」）。
    async text(path) {
      const real = await resolveAllowed(path);
      if (!real) return null;
      let handle;
      try {
        const parents = await parentIdentities(real);
        const info = await fs.lstat(real);
        if (!info.isFile() || info.isSymbolicLink() || info.size > MAX_BYTES) return null;
        // Bind the checked leaf to the descriptor before reading any bytes.
        // NONBLOCK also prevents a raced-in FIFO from blocking this read-only API.
        handle = await fs.open(real, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
        if (!sameFile(info, await handle.stat()) || !await unchangedPath(real, info, parents)) return null;
        const chunks = [];
        let bytes = 0;
        while (bytes <= MAX_BYTES) {
          const buffer = Buffer.alloc(Math.min(64 * 1024, MAX_BYTES + 1 - bytes));
          const { bytesRead } = await handle.read(buffer, 0, buffer.length, null);
          if (!bytesRead) break;
          bytes += bytesRead;
          if (bytes > MAX_BYTES) return null;
          chunks.push(buffer.subarray(0, bytesRead));
        }
        if (bytes !== info.size || !sameFile(info, await handle.stat()) || !await unchangedPath(real, info, parents)) return null;
        return { text: Buffer.concat(chunks, bytes).toString("utf8"), mtime: info.mtime.toISOString() };
      } catch { return null; }
      finally { await handle?.close().catch(() => {}); }
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
const SECRET_KEY = /((?:api[_-]?key|token|secret|password|passwd|app[_-]?secret|access[_-]?key|client[_-]?secret|authorization)["']?\s*[:=]\s*)("(?:\\[^\r\n]|[^"\\\r\n])*(?:"|\\?(?=\r?$))|'(?:\\[^\r\n]|[^'\\\r\n])*(?:'|\\?(?=\r?$))|(?:Bearer[\t ]+)?[^\s"',}]+)/gim;
const SECRET_VALUE = /\b(?:sk-[A-Za-z0-9_-]{8,}|gh[pousr]_[A-Za-z0-9]{16,}|xox[abpr]-[A-Za-z0-9-]{10,}|AKIA[0-9A-Z]{16}|eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]+|[A-Fa-f0-9]{40,}|cli_[A-Za-z0-9]{12,})\b/g;
export const MASK = "••••••••";
export function maskSecrets(text) {
  return String(text)
    .replace(SECRET_KEY, (_, head, value) => {
      const quote = /^["']/.test(value) ? value[0] : "";
      return `${head}${quote}${MASK}${quote && value.endsWith(quote) ? quote : ""}`;
    })
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
