import { identityOptions } from "./directory-identity.mjs";
// 路线 v3 切片 2.1/2.2：在推进项目的状态卡、停滞雷达与安全体检。
// 全部只读：只读项目自己的 CURRENT.md 开头与 Git 元数据，不写项目文件、不执行 Git 写操作、
// 不调用需要写权限的接口。读取前必须通过项目身份与扫描范围校验，不接受任意路径。
import { lstat, open } from "node:fs/promises";
import { constants } from "node:fs";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { dirname, join } from "node:path";
import { failure } from "./repository.mjs";
import { inferStage, parseStateHeadings, latestHeading } from "./collab-board.mjs";
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

// 没有协作状态表时的退路（阶段 2 E 批）：按“新内容写在最上面”的约定，取第一个二级标题与它下面的第一段文字，
// 作为“最近进展”给人看、带进口令。不据此推断写入者、阶段或停滞；表格与代码块不当正文。
const OUTLINE_TITLE_LIMIT = 120;
const OUTLINE_SUMMARY_LIMIT = 300;
const FENCE = /^\s*(```|~~~)/;
const unlink = (value) => value.replace(/\[([^\]]*)\]\([^)\s]*\)/g, "$1");
const cut = (value, limit) => (value.length > limit ? value.slice(0, limit) + "…" : value);
export function parseCurrentOutline(text) {
  const lines = String(text).split(/\r?\n/);
  let fence = false,
    at = -1;
  for (let i = 0; i < lines.length && at < 0; i++) {
    if (FENCE.test(lines[i])) fence = !fence;
    else if (!fence && /^##\s+\S/.test(lines[i])) at = i;
  }
  if (at < 0) return null;
  const title = plain(unlink(lines[at].replace(/^##\s+/, "").replace(/\s+#+\s*$/, "")));
  if (!title) return null;
  const block = [];
  fence = false;
  for (const line of lines.slice(at + 1)) {
    if (FENCE.test(line)) {
      if (block.length) break;
      fence = !fence;
      continue;
    }
    if (fence) continue;
    if (/^#{1,6}\s/.test(line)) break;
    if (!line.trim() || /^\s*\|/.test(line)) {
      if (block.length) break;
      continue;
    }
    block.push(line.replace(/^\s*(?:[-*+]|\d+\.)\s+/, "").replace(/^\s*>\s?/, ""));
  }
  return {
    title: cut(title, OUTLINE_TITLE_LIMIT),
    summary: cut(plain(unlink(block.join(" "))), OUTLINE_SUMMARY_LIMIT),
  };
}

// 状态表解析不出时（unparsed）再看有没有二级标题；有就记为 outline，可继续但只带“最近进展”。
export function withOutline(parsed, text) {
  if (parsed.state !== "unparsed") return parsed;
  const outline = parseCurrentOutline(text);
  return outline ? { ...parsed, state: "outline", outline } : parsed;
}

// 项目空间第二版：CURRENT 顶节（新记录写在最上面）——标题、日期、作者与顶节里写的下一步。
// 跳过只放协作状态表的那一节；日期与作者先看标题，再看标题前的说明行（如“更新：2026-10-23”）。
// 头表的“唯一下一步”与“更新时间”单独给出，供下一步取数与过期判断用。不解释其余正文。
const AUTHOR = /(Claude|Codex|Hermes|常浩)/;
const DATE = /(20\d\d)[-./年](\d{1,2})[-./月](\d{1,2})/;
const STAMP = /\b[a-z]{2}-(20\d\d)(\d\d)(\d\d)-\d+/i;
function dateOf(value) {
  const m = String(value || "").match(DATE) || String(value || "").match(STAMP);
  if (!m) return "";
  const [y, mo, d] = [m[1], m[2].padStart(2, "0"), m[3].padStart(2, "0")];
  return Number(mo) >= 1 && Number(mo) <= 12 && Number(d) >= 1 && Number(d) <= 31 ? `${y}-${mo}-${d}` : "";
}
function cleanTitle(raw) {
  let title = raw.replace(/^\s*20\d\d[-./]\d{1,2}[-./]\d{1,2}\s*[·・|｜:：\-—]?\s*/, "");
  title = title.replace(/^(Claude|Codex|Hermes)\s*[：:·]?\s*/, "");
  // 末尾括注：去掉其中的日期与作者两段；剩下的太长就整段不要。
  title = title.replace(/[（(]([^（）()]*)[）)]\s*$/, (_, inner) => {
    const rest = inner.split(/[，,、；;]/).map((s) => s.trim())
      .filter((s) => s && !DATE.test(s) && !AUTHOR.test(s));
    const kept = rest.join("，");
    return kept && kept.length <= 30 ? `（${kept}）` : "";
  });
  return title.trim();
}
const NEXT_LINE = /^\s*(?:[-*+]\s+)?(?:\*\*|__)?(?:唯一)?下一步(?:\*\*|__)?\s*[：:]\s*(.+)$/;
// 顶节里“- 键：值”的关键几行（项目空间“现在”用）：按下面的顺序各取第一条，最多 4 条；“★ 来由：”嵌在同一行时拆开算。
const FACT_LINE = /^\s*[-*+]\s+(?:\*\*|__)?\s*([^：:*_`|]{1,12}?)\s*(?:\*\*|__)?\s*[：:]\s*(.+)$/;
const FACT_KINDS = [/来由|原因|发现|背景|起因/, /做了什么|改动|改了|决定|实现/, /测试|复核|验证/, /发布|回读|上线/, /遗留|未验证|范围外/];
const FACT_LIMIT = 90;
function sectionFacts(section) {
  const pairs = [];
  for (const raw of section) {
    for (const [n, part] of raw.split(/\s*★\s*/).entries()) {
      const m = (n ? `- ${part}` : part).match(FACT_LINE);
      if (m && !/^(唯一)?下一步$/.test(m[1].trim())) pairs.push([plain(m[1]).trim(), plain(unlink(m[2])).trim()]);
    }
  }
  const facts = [];
  for (const kind of FACT_KINDS) {
    const hit = pairs.find(([k]) => kind.test(k));
    if (hit && !facts.some((f) => f.k === hit[0])) facts.push({ k: hit[0], v: cut(hit[1], FACT_LIMIT) });
    if (facts.length >= 4) break;
  }
  const left = pairs.find(([k]) => /^遗留/.test(k))?.[1] || "";
  // 没有“来由”类的行时，用标题下第一段说明顶上。
  if (!facts.some((f) => FACT_KINDS[0].test(f.k))) {
    const lead = section.find((l) => l.trim() && !/^\s*([-*+|>]|\d+\.)/.test(l));
    if (lead) facts.unshift({ k: "来由", v: cut(plain(unlink(lead)).trim(), FACT_LIMIT) });
  }
  return { facts: facts.slice(0, 4), leftover: !left.trim() || /^(无|没有|—|-)(?![\p{Script=Han}])/u.test(left.trim()) ? "" : cut(left, OUTLINE_SUMMARY_LIMIT) };
}
export function parseCurrentTop(text) {
  const lines = String(text).split(/\r?\n/);
  const table = parseCurrentStatus(text);
  let tableDate = "";
  for (const line of lines) {
    if (!/^\s*\|/.test(line)) continue;
    const row = cells(line);
    if (row.length >= 2 && plain(row[0]) === "更新时间") {
      tableDate = dateOf(row[1]);
      break;
    }
  }
  const tableNext = table.fields.next ? { text: table.fields.next, date: tableDate } : null;
  let fence = false, at = -1;
  const preamble = [], heads = [];
  for (let i = 0; i < lines.length; i++) {
    if (FENCE.test(lines[i])) { fence = !fence; continue; }
    if (fence) continue;
    if (/^##\s+\S/.test(lines[i])) {
      // 协作状态一节（或只放表格的一节）不算顶节。
      if (/^##\s+(协作状态|状态表)\s*$/.test(lines[i])) continue;
      const body = [];
      for (const l of lines.slice(i + 1)) {
        if (/^#{1,2}\s/.test(l)) break;
        if (l.trim()) body.push(l);
      }
      if (body.length && body.every((l) => /^\s*\|/.test(l))) continue;
      if (at < 0) at = i;
      else heads.push(lines[i]);
      if (heads.length >= 2) break;
      continue;
    }
    if (at < 0) preamble.push(lines[i]);
  }
  if (at < 0) return { top: null, tableNext };
  const heading = plain(unlink(lines[at].replace(/^##\s+/, "").replace(/\s+#+\s*$/, "")));
  const section = [];
  fence = false;
  for (const l of lines.slice(at + 1)) {
    if (FENCE.test(l)) { fence = !fence; continue; }
    if (!fence && /^#{1,2}\s/.test(l)) break;
    if (!fence) section.push(l);
  }
  const head = preamble.join("\n");
  const nextLine = section.map((l) => l.match(NEXT_LINE)?.[1]).find(Boolean);
  const { facts, leftover } = sectionFacts(section);
  // 顶节之后的两节：只给标题与日期。
  const earlier = heads.map((l) => {
    const h = plain(unlink(l.replace(/^##\s+/, "").replace(/\s+#+\s*$/, "")));
    return { title: cut(cleanTitle(h) || h, OUTLINE_TITLE_LIMIT), date: dateOf(h) };
  });
  return {
    top: {
      title: cut(cleanTitle(heading) || heading, OUTLINE_TITLE_LIMIT),
      date: dateOf(heading) || dateOf(head),
      by: heading.match(AUTHOR)?.[1] || "",
      next: nextLine ? cut(plain(unlink(nextLine)), OUTLINE_SUMMARY_LIMIT) : "",
      facts,
      leftover,
      earlier,
    },
    tableNext,
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
      // 用户 2026-10-03：.env.example 是给人看的样例，不算敏感文件。
      (name.startsWith(".env.") && name !== ".env.example") ||
      /\.(pem|key|p12|sqlite|db)$/.test(lower) ||
      lower.startsWith("id_rsa") ||
      parts.slice(0, -1).includes("data")
    );
  });
}

// ---------- Git 只读查询 ----------

export function gitRunner(root) {
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
export const notRepository = (e) =>
  e.code === 128 && /not a git repository/i.test(String(e.stderr || ""));
export const noCommits = (e) =>
  e.code === 128 &&
  /does not have any commits|bad default revision|unknown revision/i.test(
    String(e.stderr || ""),
  );

// 未提交改动的路径（重命名/复制取新路径），用于读最早的修改时间。
function porcelainPaths(output) {
  const tokens = output.split("\0");
  const paths = [];
  for (let i = 0; i < tokens.length; i++) {
    const entry = tokens[i];
    if (!entry) continue;
    paths.push(entry.slice(3));
    if (/^[RC]/.test(entry) || /^.[RC]/.test(entry)) i++;
  }
  return paths;
}
// 最早的未提交改动时间：只 lstat 前 200 个仍存在的路径；全部读不到（例如只有删除）返回 null。
async function oldestChange(root, paths) {
  let oldest = null;
  for (const path of paths.slice(0, 200)) {
    try {
      const t = (await lstat(join(root, path))).mtimeMs;
      if (oldest === null || t < oldest) oldest = t;
    } catch {}
  }
  return oldest === null ? null : new Date(oldest).toISOString();
}

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
    const status = await git(["status", "--porcelain=v1", "-z", "--untracked-files=normal"]);
    checks.dirty = {
      state: "ok",
      count: porcelainCount(status),
      oldestAt: await oldestChange(root, porcelainPaths(status)),
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

export function safetyIssues(checks, now = Date.now()) {
  const issues = [];
  if (checks.git.state === "none")
    issues.push({ id: "git", text: "项目目录不是 Git 仓库，没有版本记录与远程备份" });
  if (checks.remote.state === "none")
    issues.push({ id: "remote", text: "没有 Git 远程备份" });
  // 未提交改动超过 1 天才算问题（用户 2026-10-03）；时长读不到时如实算问题。
  const dirtyAt = Date.parse(checks.dirty.oldestAt ?? "");
  if (
    checks.dirty.state === "ok" &&
    checks.dirty.count > 0 &&
    !(Number.isFinite(dirtyAt) && now - dirtyAt < DAY)
  )
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
    const directory = await projectDirectory(connections.roots, root, identityOptions(project, root));
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
    if (e.status) return { root, error: e.message, ...(e.code === 'DIRECTORY_IDENTITY_CHANGED' ? { code: e.code } : {}) };
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
      stage: {id:"unknown",label:"未知",basis:"",keyword:""},
      activity: { state: "unknown" },
      safety: { checks: unknownChecks(message), issues: [] },
    });
    const resolved = await resolveProjectRoot(project, connections);
    item.root = resolved.root;
    if (resolved.error) {
      const result = blocked(resolved.error);
      if (resolved.code) result.current.code = resolved.code;
      return result;
    }
    const { canonical, path } = resolved;
    const file = await readCurrentFile(canonical, path);
    const current =
      file.state === "read"
        ? {
            ...withOutline(parseCurrentStatus(file.text), file.text),
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
      stage: projectCurrentStage(file, current),
      activity,
      safety: { checks, issues: safetyIssues(checks, clock()) },
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
      exactKeys(input, ["stallDays", "revision", "savepointWarnDays", "savepointDangerDays"]);
      if (input.stallDays !== undefined && (
        !Number.isSafeInteger(input.stallDays) ||
        input.stallDays < 1 ||
        input.stallDays > 365
      ))
        throw failure("停滞阈值需要 1–365 之间的整数天");
      const hasSavepoint=input.savepointWarnDays!==undefined||input.savepointDangerDays!==undefined;
      if(input.stallDays===undefined&&!hasSavepoint)throw failure("请提供要保存的设置");
      if (hasSavepoint && (![input.savepointWarnDays,input.savepointDangerDays].every(v=>Number.isSafeInteger(v)&&v>=1&&v<=365)||input.savepointWarnDays>=input.savepointDangerDays))
        throw failure("未存档阈值必须为1–365整数，成对提供且黄小于红");
      return repository.updateConnections(
        (c) => {
          if (!c) throw failure("请先扫描项目", 409);
          return { ...c, ...(input.stallDays===undefined?{}:{projectStallDays: input.stallDays}), ...(hasSavepoint?{projectSavepointWarnDays:input.savepointWarnDays,projectSavepointDangerDays:input.savepointDangerDays}:{}) };
        },
        revision(input),
      );
    },
  };
}

// 同一次已校验Current读取派生阶段，与协同共用判定，不增加扫描/写入。
export function projectCurrentStage(file, current) {
  if (file?.state !== "read" || !["ok", "partial"].includes(current?.state))
    return {id:"unknown",label:"未知",basis:"",keyword:""};
  const headings = parseStateHeadings(file.text);
  const matched = headings.filter(h=>h.stateId===current.fields?.stateId);
  // 有界前缀没覆盖当前state标题时，不用旧状态标题推断本轮阶段。
  const heading = file.truncated && !matched.length ? null : latestHeading(headings, current.fields?.stateId);
  return inferStage({writer:current.fields?.writer, heading:heading?.title, handoff:current.fields?.handoff?.text});
}
