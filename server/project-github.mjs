// 项目空间第二批：GitHub 面板（产品定义 v1.2 §4.1 第二批，D29）。
// 只对“在推进”且有 GitHub 远程的项目，用本机已登录的 gh 做只读查询：打开的 PR、最近合并的 PR、
// 打开的 Issue、默认分支最近的 workflow run。任何写操作都不做——gh 参数必须命中下方只读白名单，
// 否则不启动进程。找不到 gh、没登录、无权限、超时或输出无法解析，一律如实返回“未知”，不报错、不要求登录。
// 结果只缓存在服务进程内存里（带查询时间），不进主库、不进备份。
import { lstat } from "node:fs/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { failure } from "./repository.mjs";

const exec = promisify(execFile);
export const GH_PATHS = ["/opt/homebrew/bin/gh", "/usr/local/bin/gh", "/usr/bin/gh"];
export const PANEL_TTL_MS = 10 * 60000;
export const LIMITS = { open: 20, merged: 10, issues: 20, runs: 10 };
const TITLE_LIMIT = 200;

// ---------- 只读白名单 ----------

const REPO_PART = /^[A-Za-z0-9_.-]{1,100}$/;
function repoKeyOk(key) {
  if (typeof key !== "string") return false;
  const parts = key.split("/");
  return (
    parts.length === 2 &&
    parts.every((p) => REPO_PART.test(p) && p !== "." && p !== ".." && !p.startsWith("-"))
  );
}
function branchOk(branch) {
  return (
    typeof branch === "string" &&
    /^[A-Za-z0-9._/-]{1,255}$/.test(branch) &&
    !branch.startsWith("-") &&
    !branch.startsWith("/") &&
    !branch.endsWith("/") &&
    !branch.endsWith(".lock") &&
    !branch.includes("..") &&
    !branch.includes("//")
  );
}
const NUM = /^\d{1,3}$/;
const FIELDS = /^[A-Za-z]+(,[A-Za-z]+)*$/;
const listShape = (args, sub, stateValues, extraFlag) =>
  args.length === 10 &&
  args[0] === sub &&
  args[1] === "list" &&
  args[2] === "--repo" &&
  repoKeyOk(args[3]) &&
  args[4] === extraFlag[0] &&
  extraFlag[1](args[5]) &&
  args[6] === "--limit" &&
  NUM.test(args[7]) &&
  args[8] === "--json" &&
  FIELDS.test(args[9]) &&
  stateValues;

// 只有四种形状：api GET repos/<owner>/<name>、pr list（open/merged）、issue list（open）、run list（指定分支）。
export function readOnlyGhArgs(args) {
  const ok =
    Array.isArray(args) &&
    args.every((a) => typeof a === "string" && !/[\x00-\x1f\x7f]/.test(a)) &&
    ((args.length === 6 &&
      args[0] === "api" &&
      args[1] === "--method" &&
      args[2] === "GET" &&
      args[3] === "--hostname" &&
      args[4] === "github.com" &&
      args[5].startsWith("repos/") &&
      repoKeyOk(args[5].slice(6))) ||
      listShape(args, "pr", true, ["--state", (v) => v === "open" || v === "merged"]) ||
      listShape(args, "issue", true, ["--state", (v) => v === "open"]) ||
      listShape(args, "run", true, ["--branch", branchOk]));
  if (!ok) throw failure("gh 调用不在只读白名单内，已拒绝");
  return args;
}

// ---------- 失败分类 ----------

const REASONS = {
  missing: "未找到可用的 GitHub CLI",
  auth: "gh 未登录",
  denied: "没有权限或仓库不存在",
  timeout: "GitHub 查询超时",
  parse: "GitHub 返回内容无法解析",
  failed: "GitHub 查询失败",
};
const ghError = (reason) =>
  Object.assign(new Error(REASONS[reason]), { reason });

export function ghFailure(e) {
  if (e?.reason && REASONS[e.reason]) return { reason: e.reason, message: REASONS[e.reason] };
  const stderr = String(e?.stderr || "");
  let reason = "failed";
  if (["ENOENT", "EACCES", "ENOEXEC"].includes(e?.code)) reason = "missing";
  else if (e?.killed || e?.code === "ETIMEDOUT") reason = "timeout";
  else if (
    e?.code === 4 ||
    /auth login|not logged|HTTP 401|authentication required|Bad credentials/i.test(stderr)
  )
    reason = "auth";
  else if (
    /HTTP 40[34]|Could not resolve to a Repository|Resource not accessible|Not Found/i.test(stderr)
  )
    reason = "denied";
  return { reason, message: REASONS[reason] };
}

// ---------- 运行器 ----------

// 只在固定路径里找 gh（与 2.2 的可见性查询一致），不经 PATH。环境只关闭交互与分页，不传入也不读取任何令牌。
export function createGhRunner({ paths = GH_PATHS, timeout = 15000 } = {}) {
  return async (args) => {
    readOnlyGhArgs(args);
    let bin = "";
    for (const path of paths) {
      try {
        const info = await lstat(path);
        if (info.isFile() || info.isSymbolicLink()) {
          bin = path;
          break;
        }
      } catch {}
    }
    if (!bin) throw ghError("missing");
    try {
      const { stdout } = await exec(bin, args, {
        timeout,
        maxBuffer: 4 * 1024 * 1024,
        env: {
          ...process.env,
          GH_PROMPT_DISABLED: "1",
          GH_PAGER: "cat",
          GH_NO_UPDATE_NOTIFIER: "1",
          GH_HOST: "github.com",
          NO_COLOR: "1",
        },
      });
      return String(stdout);
    } catch (e) {
      throw ghError(ghFailure(e).reason);
    }
  };
}

// ---------- 输出解析（只取白名单字段） ----------

const parseError = () => ghError("parse");
function jsonOf(stdout) {
  try {
    return JSON.parse(String(stdout));
  } catch {
    throw parseError();
  }
}
function arrayOf(stdout) {
  const value = jsonOf(stdout);
  if (!Array.isArray(value)) throw parseError();
  return value;
}
const text = (value, limit = TITLE_LIMIT) => {
  const s = String(value ?? "").replace(/[\x00-\x1f\x7f]/g, " ").replace(/\s+/g, " ").trim();
  return s.length > limit ? s.slice(0, limit) + "…" : s;
};
const when = (value) => {
  const t = Date.parse(value);
  return typeof value === "string" && Number.isFinite(t) ? new Date(t).toISOString() : "";
};
const githubUrl = (value) =>
  typeof value === "string" && value.length <= 500 && /^https:\/\/github\.com\/[^\s"'<>]*$/.test(value)
    ? value
    : "";
const numbered = (r) =>
  r && typeof r === "object" && Number.isSafeInteger(r.number) && r.number > 0;

export function parseRepoInfo(stdout) {
  const value = jsonOf(stdout);
  if (!value || typeof value !== "object" || Array.isArray(value) || !branchOk(value.default_branch))
    throw parseError();
  return {
    defaultBranch: value.default_branch,
    ...(typeof value.private === "boolean" ? { private: value.private } : {}),
  };
}

export function parsePullRequests(stdout) {
  return arrayOf(stdout)
    .filter(numbered)
    .map((r) => ({
      number: r.number,
      title: text(r.title),
      url: githubUrl(r.url),
      draft: r.isDraft === true,
      author: text(r.author?.login, 100),
      createdAt: when(r.createdAt),
      updatedAt: when(r.updatedAt),
      mergedAt: when(r.mergedAt),
    }));
}

export function parseIssues(stdout) {
  return arrayOf(stdout)
    .filter(numbered)
    .map((r) => ({
      number: r.number,
      title: text(r.title),
      url: githubUrl(r.url),
      author: text(r.author?.login, 100),
      createdAt: when(r.createdAt),
      updatedAt: when(r.updatedAt),
    }));
}

function runStatus(status, conclusion) {
  if (status !== "completed") return "running";
  if (conclusion === "success") return "success";
  if (["failure", "timed_out", "startup_failure"].includes(conclusion)) return "failure";
  if (conclusion === "cancelled") return "cancelled";
  return "other";
}
export function parseRuns(stdout) {
  return arrayOf(stdout)
    .filter((r) => r && typeof r === "object" && Number.isSafeInteger(r.databaseId))
    .map((r) => ({
      id: r.databaseId,
      workflow: text(r.workflowName, 100),
      status: runStatus(r.status, r.conclusion),
      conclusion: text(r.conclusion, 30),
      createdAt: when(r.createdAt),
      updatedAt: when(r.updatedAt),
      url: githubUrl(r.url),
    }));
}

// 默认分支 CI：最近一次运行；上一次只取同一 workflow 已结束的运行，用于判断“变化”。
export function ciSummary(runs) {
  const sorted = [...runs].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const latest = sorted[0] || null;
  if (!latest) return { status: "none", latest: null, previous: null };
  const previous =
    sorted.slice(1).find((r) => r.workflow === latest.workflow && r.status !== "running") || null;
  return { status: latest.status, latest, previous };
}

// ---------- 单个仓库的面板 ----------

const PR_FIELDS = "number,title,url,isDraft,author,createdAt,updatedAt";
const MERGED_FIELDS = "number,title,url,author,mergedAt";
const ISSUE_FIELDS = "number,title,url,author,createdAt,updatedAt";
const RUN_FIELDS = "databaseId,workflowName,status,conclusion,createdAt,updatedAt,url";

export async function fetchGithubPanel(gh, repoKey) {
  if (!repoKeyOk(repoKey))
    return { state: "unknown", repoKey: "", reason: "denied", message: "远程不是可识别的 GitHub 仓库" };
  let info;
  try {
    info = parseRepoInfo(
      await gh(["api", "--method", "GET", "--hostname", "github.com", `repos/${repoKey}`]),
    );
  } catch (e) {
    // 第一步就失败（没有 gh、没登录、无权限）时不再继续查询。
    return { state: "unknown", repoKey, ...ghFailure(e) };
  }
  async function section(args, parse, limit) {
    try {
      const items = parse(await gh(args));
      return { state: "ok", items, truncated: items.length >= limit };
    } catch (e) {
      return { state: "unknown", ...ghFailure(e) };
    }
  }
  const list = (sub, state, limit, fields) => [
    sub, "list", "--repo", repoKey, "--state", state, "--limit", String(limit), "--json", fields,
  ];
  const openPrs = await section(list("pr", "open", LIMITS.open, PR_FIELDS), parsePullRequests, LIMITS.open);
  const mergedPrs = await section(list("pr", "merged", LIMITS.merged, MERGED_FIELDS), parsePullRequests, LIMITS.merged);
  const issues = await section(list("issue", "open", LIMITS.issues, ISSUE_FIELDS), parseIssues, LIMITS.issues);
  const runs = await section(
    ["run", "list", "--repo", repoKey, "--branch", info.defaultBranch, "--limit", String(LIMITS.runs), "--json", RUN_FIELDS],
    parseRuns,
    LIMITS.runs,
  );
  const ci =
    runs.state === "ok"
      ? { state: "ok", ...ciSummary(runs.items) }
      : { state: "unknown", reason: runs.reason, message: runs.message };
  return {
    state: "ok",
    repoKey,
    defaultBranch: info.defaultBranch,
    openPrs,
    mergedPrs,
    issues,
    ci,
  };
}

// ---------- 服务：在推进项目的面板 + 内存缓存 ----------

function exactKeys(input, allowed) {
  if (
    !input ||
    typeof input !== "object" ||
    Array.isArray(input) ||
    Object.keys(input).some((k) => !allowed.includes(k))
  )
    throw failure("请求包含不支持的字段");
}

export function createProjectGithub(
  repository,
  { gh = createGhRunner(), clock = Date.now, ttlMs = PANEL_TTL_MS } = {},
) {
  const cache = new Map(); // repoKey → { at, result, lastSuccessAt }
  const inflight = new Map();
  async function query(repoKey) {
    let result;
    try {
      result = await fetchGithubPanel(gh, repoKey);
    } catch (e) {
      result = { state: "unknown", repoKey, ...ghFailure(e) };
    }
    const at = clock();
    const prior = cache.get(repoKey);
    const lastSuccessAt =
      result.state === "ok" ? new Date(at).toISOString() : prior?.lastSuccessAt || "";
    cache.set(repoKey, { at, result, lastSuccessAt });
    return cache.get(repoKey);
  }
  async function forProject(project, { refresh = false } = {}) {
    const repoKey = project?.repoKey || "";
    if (!repoKey) return { state: "none", message: "没有 GitHub 远程" };
    let entry = cache.get(repoKey);
    let cached = true;
    if (refresh || !entry || clock() - entry.at >= ttlMs) {
      if (!inflight.has(repoKey))
        inflight.set(
          repoKey,
          query(repoKey).finally(() => inflight.delete(repoKey)),
        );
      entry = await inflight.get(repoKey);
      cached = false;
    }
    return {
      ...entry.result,
      fetchedAt: new Date(entry.at).toISOString(),
      cached,
      ...(entry.result.state !== "ok" && entry.lastSuccessAt
        ? { lastSuccessAt: entry.lastSuccessAt }
        : {}),
    };
  }
  return {
    forProject,
    panel(input = {}) {
      exactKeys(input, ["refresh"]);
      if (input.refresh !== undefined && typeof input.refresh !== "boolean")
        throw failure("刷新参数必须是布尔值");
      return (async () => {
        const state = await repository.read();
        const active = (state?.connections?.projects || []).filter((p) => p.active === true);
        const items = [];
        for (const project of active)
          items.push({
            projectId: project.id,
            name: project.name,
            repoKey: project.repoKey || "",
            github: await forProject(project, { refresh: input.refresh === true }),
          });
        return { at: new Date(clock()).toISOString(), ttlMs, items };
      })();
    },
  };
}
