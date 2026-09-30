// 路线 v3 切片 2.1/2.2：在推进项目的状态卡、停滞雷达与安全体检。
// 全部只读：只读项目自己的 CURRENT.md 开头与 Git 元数据，不写项目文件、不执行 Git 写操作、
// 不调用需要写权限的接口。读取前必须通过项目身份与扫描范围校验，不接受任意路径。
import { lstat, open } from "node:fs/promises";
import { constants } from "node:fs";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { dirname, join } from "node:path";
import { failure } from "./repository.mjs";
import {
  projectDirectory,
  assertDirectoryConfirmed,
} from "./project-context.mjs";

const exec = promisify(execFile);
const DAY = 86400000;
export const CURRENT_READ_LIMIT = 64 * 1024;
export const DEFAULT_STALL_DAYS = 7;
export const ACTIVE_SOFT_LIMIT = 7;
const VALUE_LIMIT = 500;

// ---------- CURRENT.md 协作状态表 ----------

const FIELDS = [
  ["stateId", "状态编号", ["state_id", "状态编号", "state id"]],
  ["writer", "当前写入者", ["当前写入者"]],
  ["next", "唯一下一步", ["唯一下一步"]],
  ["handoff", "最新交接", ["最新交接"]],
];
function cells(line) {
  const body = line.trim().replace(/^\|/, "").replace(/\|$/, "");
  const out = [];
  let cell = "";
  for (let i = 0; i < body.length; i++) {
    if (body[i] === "\\" && body[i + 1] === "|") {
      cell += "|";
      i++;
    } else if (body[i] === "|") {
      out.push(cell.trim());
      cell = "";
    } else cell += body[i];
  }
  out.push(cell.trim());
  return out;
}
const plain = (value) =>
  value
    .replace(/\*\*(.+?)\*\*/g, "$1")
    .replace(/__(.+?)__/g, "$1")
    .replace(/`([^`]*)`/g, "$1")
    .replace(/<br\s*\/?>/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
const clip = (value) =>
  value.length > VALUE_LIMIT ? value.slice(0, VALUE_LIMIT) + "…" : value;

// 只认两列“字段 | 值”形式的行；取每个字段第一次出现的值。不解释其余正文。
export function parseCurrentStatus(text) {
  const fields = {};
  for (const line of String(text).split(/\r?\n/)) {
    if (!/^\s*\|.*\|\s*$/.test(line)) continue;
    const row = cells(line);
    if (row.length < 2) continue;
    const key = plain(row[0]).toLowerCase();
    const field = FIELDS.find(([, , aliases]) => aliases.includes(key));
    if (!field || fields[field[0]] !== undefined) continue;
    const raw = row.slice(1).join(" | ");
    if (!plain(raw)) continue;
    if (field[0] === "handoff") {
      const link = raw.match(/\[([^\]]+)\]\(([^)\s]+)\)/);
      fields.handoff = link
        ? { text: clip(plain(link[1])), href: clip(link[2]) }
        : { text: clip(plain(raw)), href: "" };
    } else fields[field[0]] = clip(plain(raw));
  }
  const missing = FIELDS.filter(([id]) => fields[id] === undefined).map(
    ([, label]) => label,
  );
  return {
    state: !Object.keys(fields).length
      ? "unparsed"
      : missing.length
        ? "partial"
        : "ok",
    fields,
    missing,
  };
}

// 只在截断读取时允许末尾出现被截断的多字节字符；其余任何非 UTF-8 字节都拒绝。
export function decodeCurrentHead(buffer, truncated) {
  const decoder = new TextDecoder("utf-8", { fatal: true, ignoreBOM: false });
  let text;
  try {
    text = decoder.decode(buffer, { stream: !!truncated });
  } catch {
    throw failure("CURRENT.md 不是 UTF-8 文本，无法解析");
  }
  if (text.includes("\0")) throw failure("CURRENT.md 含二进制内容，无法解析");
  return text;
}

function relativeParts(path) {
  const parts = String(path).split("/");
  if (
    !parts.length ||
    parts.some((p) => !p || p === "." || p === ".." || p.startsWith(".")) ||
    /[\\\x00-\x1f\x7f]/.test(path)
  )
    throw failure("状态文件路径无效");
  return parts;
}

// 读 root 下的相对路径文件开头 limit 字节（默认 CURRENT_READ_LIMIT）。root 必须已经过身份与范围校验。
export async function readCurrentFile(root, path, limit = CURRENT_READ_LIMIT) {
  try {
    const parts = relativeParts(path);
    let target = root;
    for (const part of parts) {
      target = join(target, part);
      const info = await lstat(target);
      if (info.isSymbolicLink())
        return { state: "error", message: "状态文件路径经过符号链接，不读取" };
    }
    const file = await open(
      target,
      constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK,
    );
    try {
      const before = await file.stat();
      if (!before.isFile() || before.nlink !== 1)
        return {
          state: "error",
          message: "状态文件必须是普通文件，不能是特殊文件或硬链接",
        };
      const buffer = Buffer.alloc(limit);
      let length = 0;
      while (length < buffer.length) {
        const { bytesRead } = await file.read(
          buffer,
          length,
          buffer.length - length,
          null,
        );
        if (!bytesRead) break;
        length += bytesRead;
      }
      const after = await file.stat();
      if (before.mtimeMs !== after.mtimeMs || before.size !== after.size)
        return { state: "error", message: "读取期间状态文件发生变化，请稍后重试" };
      const truncated = after.size > length;
      let text;
      try {
        text = decodeCurrentHead(buffer.subarray(0, length), truncated);
      } catch (e) {
        return { state: "error", message: e.message };
      }
      return {
        state: "read",
        text,
        truncated,
        size: after.size,
        modifiedAt: after.mtime.toISOString(),
      };
    } finally {
      await file.close();
    }
  } catch (e) {
    if (e.status) return { state: "error", message: e.message };
    if (["ENOENT", "ENOTDIR"].includes(e.code)) return { state: "absent" };
    if (e.code === "ELOOP")
      return { state: "error", message: "状态文件是符号链接，不读取" };
    if (["EACCES", "EPERM"].includes(e.code))
      return { state: "error", message: "状态文件读取受阻，请检查权限" };
    return { state: "error", message: "状态文件无法读取" };
  }
}

// ---------- 停滞雷达 ----------

// current / git：{ state: "ok", at } | { state: "absent" } | { state: "error" }。
// 取可读来源中较新者；超过 days 天（严格大于）才算停滞。任何一侧读取出错时，
// 只有另一侧足以证明“没停滞”才下结论，否则为未知。两侧都没有信号也是未知。
export function stallVerdict({ now, days, current, git }) {
  const sources = [
    ["CURRENT", current],
    ["Git", git],
  ].filter(([, s]) => s?.state === "ok" && Number.isFinite(Date.parse(s.at)));
  const errored = [current, git].some((s) => s?.state === "error");
  if (!sources.length) return { state: "unknown" };
  const [source, latest] = sources.sort(
    (a, b) => Date.parse(b[1].at) - Date.parse(a[1].at),
  )[0];
  const idle = Math.max(0, now - Date.parse(latest.at));
  const stalled = idle > days * DAY;
  if (stalled && errored)
    return { state: "unknown", latestAt: latest.at, source };
  return {
    state: stalled ? "stalled" : "active",
    latestAt: latest.at,
    source,
    idleDays: Math.floor(idle / DAY),
  };
}

// ---------- 敏感文件判定（按 git ls-files 的路径） ----------

export function sensitivePaths(paths) {
  return paths.filter((path) => {
    const parts = path.split("/");
    const name = parts.at(-1);
    const lower = name.toLowerCase();
    return (
      name === ".env" ||
      name.startsWith(".env.") ||
      /\.(pem|key|p12|sqlite|db)$/.test(lower) ||
      lower.startsWith("id_rsa") ||
      parts.slice(0, -1).includes("data")
    );
  });
}

// ---------- Git 只读查询 ----------

function gitRunner(root) {
  const env = Object.fromEntries(
    Object.entries(process.env).filter(([key]) => !key.startsWith("GIT_")),
  );
  const options = {
    timeout: 5000,
    maxBuffer: 16 * 1024 * 1024,
    encoding: "buffer",
    env: {
      ...env,
      GIT_OPTIONAL_LOCKS: "0",
      GIT_CONFIG_NOSYSTEM: "1",
      GIT_CONFIG_GLOBAL: "/dev/null",
      GIT_TERMINAL_PROMPT: "0",
      // 只认项目目录本身的仓库，不把上级目录的仓库算成这个项目的。
      GIT_CEILING_DIRECTORIES: dirname(root),
    },
  };
  return async (args) =>
    (
      await exec(
        "/usr/bin/git",
        [
          "--no-optional-locks",
          // 仓库本地配置可能指定外部程序；体检一律不启用。
          "-c",
          "core.fsmonitor=false",
          "-c",
          "core.untrackedCache=false",
          "-C",
          root,
          ...args,
        ],
        options,
      )
    ).stdout.toString("utf8");
}
const notRepository = (e) =>
  e.code === 128 && /not a git repository/i.test(String(e.stderr || ""));
const noCommits = (e) =>
  e.code === 128 &&
  /does not have any commits|bad default revision|unknown revision/i.test(
    String(e.stderr || ""),
  );

function porcelainCount(output) {
  const tokens = output.split("\0");
  let count = 0;
  for (let i = 0; i < tokens.length; i++) {
    const entry = tokens[i];
    if (!entry) continue;
    count++;
    // 重命名/复制条目后面紧跟原路径。
    if (/^[RC]/.test(entry) || /^.[RC]/.test(entry)) i++;
  }
  return count;
}

async function inspectGit(root) {
  const git = gitRunner(root);
  const checks = {
    git: { state: "unknown" },
    remote: { state: "unknown" },
    dirty: { state: "unknown" },
    sensitive: { state: "unknown" },
  };
  let commit = { state: "error" };
  try {
    const top = (await git(["rev-parse", "--show-toplevel"])).trim();
    checks.git = { state: "repo", top };
  } catch (e) {
    if (notRepository(e)) {
      checks.git = { state: "none" };
      for (const key of ["remote", "dirty", "sensitive"])
        checks[key] = { state: "n/a" };
      return { checks, commit: { state: "absent" } };
    }
    checks.git = { state: "unknown", message: "Git 状态读取失败" };
    return { checks, commit };
  }
  try {
    const at = (await git(["log", "-1", "--format=%cI"])).trim();
    commit = at ? { state: "ok", at: new Date(at).toISOString() } : { state: "absent" };
  } catch (e) {
    commit = noCommits(e) ? { state: "absent" } : { state: "error" };
  }
  try {
    const names = (await git(["remote"])).split("\n").map((s) => s.trim()).filter(Boolean);
    checks.remote = names.length
      ? { state: "present", names: names.slice(0, 20) }
      : { state: "none", names: [] };
  } catch {
    checks.remote = { state: "unknown", message: "远程读取失败" };
  }
  try {
    checks.dirty = {
      state: "ok",
      count: porcelainCount(
        await git(["status", "--porcelain=v1", "-z", "--untracked-files=normal"]),
      ),
    };
  } catch {
    checks.dirty = { state: "unknown", message: "改动读取失败" };
  }
  try {
    const files = sensitivePaths(
      (await git(["ls-files", "-z"])).split("\0").filter(Boolean),
    );
    checks.sensitive = {
      state: "ok",
      total: files.length,
      files: files.slice(0, 20),
    };
  } catch {
    checks.sensitive = { state: "unknown", message: "跟踪文件读取失败" };
  }
  return { checks, commit };
}

// 默认的远程可见性查询：只用本机已登录的 gh 做只读 GET；找不到 gh、没登录或任何失败都返回未知。
const GH = ["/opt/homebrew/bin/gh", "/usr/local/bin/gh", "/usr/bin/gh"];
export async function ghVisibility(repoKey) {
  for (const path of GH) {
    try {
      await lstat(path);
    } catch {
      continue;
    }
    try {
      const { stdout } = await exec(
        path,
        ["api", "--method", "GET", "--hostname", "github.com", `repos/${repoKey}`],
        {
          timeout: 10000,
          maxBuffer: 2 * 1024 * 1024,
          env: { ...process.env, GH_PROMPT_DISABLED: "1", GH_PAGER: "cat" },
        },
      );
      const record = JSON.parse(stdout);
      if (typeof record.private !== "boolean") break;
      return { state: record.private ? "private" : "public" };
    } catch {
      return { state: "unknown", message: "GitHub 查询没有结果（可能未登录或无权限）" };
    }
  }
  return { state: "unknown", message: "未找到可用的 GitHub CLI" };
}

async function inspectVisibility(project, remote, visibility) {
  if (remote.state !== "present")
    return { state: "unknown", message: "没有可查询的远程" };
  if (!project.repoKey)
    return { state: "unknown", message: "远程不是可识别的 GitHub 仓库" };
  let live;
  try {
    live = await visibility(project.repoKey);
  } catch {
    live = { state: "unknown", message: "GitHub 查询失败" };
  }
  if (live?.state === "private" || live?.state === "public")
    return { state: live.state, source: "gh" };
  if (typeof project.private === "boolean" && project.githubSeenAt)
    return {
      state: project.private ? "private" : "public",
      source: "scan",
      message: `实时查询未成功，沿用 GitHub 扫描结果（${project.githubSeenAt.slice(0, 10)}）`,
    };
  return { state: "unknown", message: live?.message || "GitHub 查询失败" };
}

function safetyIssues(checks) {
  const issues = [];
  if (checks.git.state === "none")
    issues.push({ id: "git", text: "项目目录不是 Git 仓库，没有版本记录与远程备份" });
  if (checks.remote.state === "none")
    issues.push({ id: "remote", text: "没有 Git 远程备份" });
  if (checks.dirty.state === "ok" && checks.dirty.count > 0)
    issues.push({ id: "dirty", text: `有 ${checks.dirty.count} 个未提交改动` });
  if (checks.sensitive.state === "ok" && checks.sensitive.total > 0)
    issues.push({
      id: "sensitive",
      text: `Git 跟踪了 ${checks.sensitive.total} 个敏感文件：${checks.sensitive.files.slice(0, 3).join("、")}${checks.sensitive.total > 3 ? " 等" : ""}`,
    });
  if (checks.visibility.state === "public")
    issues.push({ id: "public", text: "GitHub 远程仓库是公开的" });
  return issues;
}

const unknownChecks = (message) => ({
  git: { state: "unknown", message },
  remote: { state: "unknown" },
  dirty: { state: "unknown" },
  sensitive: { state: "unknown" },
  visibility: { state: "unknown" },
});

// ---------- 服务 ----------

function exactKeys(input, allowed) {
  if (
    !input ||
    typeof input !== "object" ||
    Array.isArray(input) ||
    Object.keys(input).some((k) => !allowed.includes(k))
  )
    throw failure("请求包含不支持的字段");
}
function revision(input) {
  if (!Number.isSafeInteger(input.revision) || input.revision < 0)
    throw failure("缺少当前主库版本，请刷新");
  return { expectedRevision: input.revision };
}

// 在推进项目的目录解析与校验（2.1 状态卡与 2.3 协同看板共用）：只用登记的本地目录，
// 先核对身份与扫描范围，返回校验得到的真实路径与 CURRENT 相对路径；失败时返回 error，不抛出。
export async function resolveProjectRoot(project, connections) {
  const binding = connections.contextBindings?.find(
    (b) => b.projectId === project.id,
  );
  const root =
    binding && project.localPaths.includes(binding.root)
      ? binding.root
      : project.localPaths[0];
  if (!root)
    return { root: "", error: "没有本地目录（仅 GitHub 项目），无法读取状态与 Git" };
  try {
    assertDirectoryConfirmed(project, root);
    const directory = await projectDirectory(connections.roots, root);
    assertDirectoryConfirmed(project, root, directory.identity);
    // 之后的读取与 Git 查询都用校验得到的真实路径。
    return {
      root,
      canonical: directory.root,
      path:
        binding?.root === root && binding.currentPath
          ? binding.currentPath
          : "CURRENT.md",
    };
  } catch (e) {
    if (e.status) return { root, error: e.message };
    if (["ENOENT", "ENOTDIR"].includes(e.code))
      return { root, error: "项目目录不存在，请重新扫描" };
    return { root, error: "项目目录无法核实" };
  }
}

export function createProjectStatus(
  repository,
  { clock = Date.now, visibility = ghVisibility } = {},
) {
  async function inspectProject(project, connections) {
    const item = { projectId: project.id, name: project.name, root: "" };
    const blocked = (message) => ({
      ...item,
      current: { state: "error", path: "CURRENT.md", message },
      activity: { state: "unknown" },
      safety: { checks: unknownChecks(message), issues: [] },
    });
    const resolved = await resolveProjectRoot(project, connections);
    item.root = resolved.root;
    if (resolved.error) return blocked(resolved.error);
    const { canonical, path } = resolved;
    const file = await readCurrentFile(canonical, path);
    const current =
      file.state === "read"
        ? {
            ...parseCurrentStatus(file.text),
            path,
            modifiedAt: file.modifiedAt,
            truncated: file.truncated,
          }
        : { state: file.state, path, ...(file.message ? { message: file.message } : {}) };
    const { checks, commit } = await inspectGit(canonical);
    checks.visibility =
      checks.git.state === "repo"
        ? await inspectVisibility(project, checks.remote, visibility)
        : { state: "unknown", message: "不是 Git 仓库" };
    const days = connections.projectStallDays || DEFAULT_STALL_DAYS;
    const activity = stallVerdict({
      now: clock(),
      days,
      current:
        file.state === "read"
          ? { state: "ok", at: file.modifiedAt }
          : { state: file.state },
      git: commit,
    });
    activity.current = file.state === "read" ? { state: "ok", at: file.modifiedAt } : { state: file.state };
    activity.git = commit;
    return {
      ...item,
      current,
      activity,
      safety: { checks, issues: safetyIssues(checks) },
    };
  }
  return {
    async inspect(input = {}) {
      exactKeys(input, []);
      const state = await repository.read();
      const connections = state?.connections;
      const active = (connections?.projects || []).filter((p) => p.active === true);
      const items = [];
      for (const project of active)
        items.push(await inspectProject(project, connections));
      return {
        at: new Date(clock()).toISOString(),
        stallDays: connections?.projectStallDays || DEFAULT_STALL_DAYS,
        activeCount: active.length,
        softLimit: ACTIVE_SOFT_LIMIT,
        items,
      };
    },
    mark(input) {
      exactKeys(input, ["projectId", "active", "revision"]);
      if (typeof input.projectId !== "string" || typeof input.active !== "boolean")
        throw failure("请选择项目并指明是否在推进");
      return repository.updateConnections((c) => {
        if (!c?.projects.some((p) => p.id === input.projectId))
          throw failure("项目已不存在，请重新扫描", 404);
        return {
          ...c,
          projects: c.projects.map((p) => {
            if (p.id !== input.projectId) return p;
            const { active, ...rest } = p;
            return input.active ? { ...rest, active: true } : rest;
          }),
        };
      }, revision(input));
    },
    settings(input) {
      exactKeys(input, ["stallDays", "revision"]);
      if (
        !Number.isSafeInteger(input.stallDays) ||
        input.stallDays < 1 ||
        input.stallDays > 365
      )
        throw failure("停滞阈值需要 1–365 之间的整数天");
      return repository.updateConnections(
        (c) => {
          if (!c) throw failure("请先扫描项目", 409);
          return { ...c, projectStallDays: input.stallDays };
        },
        revision(input),
      );
    },
  };
}
