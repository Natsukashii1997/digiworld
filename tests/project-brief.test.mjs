// 项目空间第二批：GitHub 面板（只读 gh 查询 + 缓存 + 失败回退为“未知”）与每日项目简报
// （本机数据规则生成、不调用模型；已读状态存主库，严格 schema，旧库缺失按空）。
// gh 一律用本地桩脚本或函数桩，不调用真实 GitHub、不读凭据。
import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, readdir, readFile, lstat, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  GH_PATHS,
  readOnlyGhArgs,
  createGhRunner,
  ghFailure,
  parseRepoInfo,
  parsePullRequests,
  parseIssues,
  parseRuns,
  ciSummary,
  fetchGithubPanel,
  createProjectGithub,
} from "../server/project-github.mjs";
import { briefWindow, composeBrief } from "../server/project-brief.mjs";
import { validateState, validateHistory } from "../server/schema.mjs";
import { mergeBackup } from "../server/merge.mjs";
import { seed } from "../src/store.js";
import {
  HOUR,
  DAY,
  ghData,
  writeGhStub,
  projectBriefFixture,
  git,
} from "./project-brief-fixture.mjs";

const sha = (text) => createHash("sha256").update(text).digest("hex");

async function tree(dir) {
  const out = {};
  async function walk(d) {
    for (const e of await readdir(d, { withFileTypes: true })) {
      const p = join(d, e.name);
      const info = await lstat(p);
      if (e.isDirectory()) {
        out[p] = `dir ${info.mtimeMs}`;
        await walk(p);
      } else out[p] = `${info.mtimeMs} ${sha(await readFile(p))}`;
    }
  }
  await walk(dir);
  return out;
}

// ---------- gh 调用只读白名单 ----------

test("gh 只允许四种只读调用：api GET、pr list、issue list、run list", () => {
  const ok = [
    ["api", "--method", "GET", "--hostname", "github.com", "repos/tester/collab"],
    ["pr", "list", "--repo", "tester/collab", "--state", "open", "--limit", "20", "--json", "number,title"],
    ["pr", "list", "--repo", "tester/collab", "--state", "merged", "--limit", "10", "--json", "number"],
    ["issue", "list", "--repo", "tester/collab", "--state", "open", "--limit", "20", "--json", "number"],
    ["run", "list", "--repo", "tester/collab", "--branch", "main", "--limit", "10", "--json", "status"],
  ];
  for (const args of ok) assert.deepEqual(readOnlyGhArgs(args), args);
  const bad = [
    ["pr", "create", "--repo", "tester/collab"],
    ["pr", "merge", "7", "--repo", "tester/collab"],
    ["issue", "close", "3", "--repo", "tester/collab"],
    ["api", "--method", "POST", "--hostname", "github.com", "repos/tester/collab"],
    ["api", "--hostname", "github.com", "repos/tester/collab"],
    ["api", "--method", "GET", "--hostname", "github.com", "repos/tester/collab", "-f", "x=1"],
    ["api", "--method", "GET", "--hostname", "github.com", "repos/../collab"],
    ["pr", "list", "--repo", "-tester/collab", "--state", "open", "--limit", "20", "--json", "number"],
    ["pr", "list", "--repo", "tester/collab", "--state", "all", "--limit", "20", "--json", "number"],
    ["run", "list", "--repo", "tester/collab", "--branch", "--help", "--limit", "10", "--json", "status"],
    ["run", "rerun", "902", "--repo", "tester/collab"],
    ["auth", "login"],
    ["auth", "token"],
  ];
  for (const args of bad)
    assert.throws(() => readOnlyGhArgs(args), /只读/, args.join(" "));
});

// ---------- gh 输出解析 ----------

test("解析 PR / Issue：只取白名单字段，去控制字符、截断标题，只接受 GitHub https 链接", () => {
  const prs = parsePullRequests(
    JSON.stringify([
      {
        number: 7,
        title: "状态卡\u0007返修\n第二行",
        url: "https://github.com/tester/collab/pull/7",
        isDraft: false,
        author: { login: "tester", name: "不需要的字段" },
        createdAt: "2026-09-30T06:00:00Z",
        updatedAt: "2026-09-30T07:00:00Z",
        body: "BODY-MARKER 正文不取",
      },
      {
        number: 8,
        title: "x".repeat(400),
        url: "javascript:alert(1)",
        isDraft: true,
        createdAt: "not a date",
      },
      { title: "没有编号的条目跳过" },
    ]),
  );
  assert.equal(prs.length, 2);
  assert.deepEqual(prs[0], {
    number: 7,
    title: "状态卡 返修 第二行",
    url: "https://github.com/tester/collab/pull/7",
    draft: false,
    author: "tester",
    createdAt: "2026-09-30T06:00:00.000Z",
    updatedAt: "2026-09-30T07:00:00.000Z",
    mergedAt: "",
  });
  assert.equal(prs[1].url, "");
  assert.equal(prs[1].createdAt, "");
  assert.equal(prs[1].draft, true);
  assert.ok(prs[1].title.length <= 201 && prs[1].title.endsWith("…"));
  assert.doesNotMatch(JSON.stringify(prs), /BODY-MARKER|不需要的字段/);
  const issues = parseIssues(
    JSON.stringify([
      { number: 3, title: "窄屏折行", url: "https://github.com/tester/collab/issues/3", createdAt: "2026-09-26T00:00:00Z" },
    ]),
  );
  assert.equal(issues[0].number, 3);
  assert.equal(issues[0].url, "https://github.com/tester/collab/issues/3");
  for (const raw of ["", "<html>", "{}", "null", '{"a":1}'])
    assert.throws(() => parsePullRequests(raw), /无法解析/, raw);
  assert.throws(() => parseIssues("[1"), /无法解析/);
});

test("解析仓库信息与 workflow run；CI 汇总取最近一次并与同一 workflow 的上一次比较", () => {
  assert.deepEqual(parseRepoInfo('{"default_branch":"main","private":true,"x":1}'), {
    defaultBranch: "main",
    private: true,
  });
  for (const raw of ["{}", '{"default_branch":""}', '{"default_branch":"--help"}', "[]", "x"])
    assert.throws(() => parseRepoInfo(raw), /无法解析/, raw);
  const runs = parseRuns(JSON.stringify(ghData(Date.parse("2026-09-30T09:00:00Z"))["tester/collab"].runs));
  assert.equal(runs.length, 2);
  assert.deepEqual(Object.keys(runs[0]).sort(), [
    "conclusion",
    "createdAt",
    "id",
    "status",
    "updatedAt",
    "url",
    "workflow",
  ]);
  const ci = ciSummary(runs);
  assert.equal(ci.status, "failure");
  assert.equal(ci.latest.workflow, "CI");
  assert.equal(ci.previous.status, "success");
  assert.equal(ciSummary([]).status, "none");
  assert.equal(ciSummary([]).latest, null);
  const running = ciSummary(
    parseRuns(JSON.stringify([{ databaseId: 1, workflowName: "CI", status: "in_progress", conclusion: "", createdAt: "2026-09-30T08:00:00Z", updatedAt: "2026-09-30T08:01:00Z", url: "https://github.com/a/b/actions/runs/1" }])),
  );
  assert.equal(running.status, "running");
  assert.equal(running.previous, null);
  const other = (conclusion) =>
    ciSummary(parseRuns(JSON.stringify([{ databaseId: 1, workflowName: "CI", status: "completed", conclusion, createdAt: "2026-09-30T08:00:00Z", updatedAt: "2026-09-30T08:00:00Z", url: "" }]))).status;
  assert.equal(other("timed_out"), "failure");
  assert.equal(other("startup_failure"), "failure");
  assert.equal(other("cancelled"), "cancelled");
  assert.equal(other("success"), "success");
  assert.equal(other("skipped"), "other");
  // 上一次只比较同一 workflow。
  const mixed = ciSummary(
    parseRuns(
      JSON.stringify([
        { databaseId: 3, workflowName: "CI", status: "completed", conclusion: "success", createdAt: "2026-09-30T08:00:00Z", updatedAt: "2026-09-30T08:00:00Z", url: "" },
        { databaseId: 2, workflowName: "Pages", status: "completed", conclusion: "failure", createdAt: "2026-09-30T07:00:00Z", updatedAt: "2026-09-30T07:00:00Z", url: "" },
        { databaseId: 1, workflowName: "CI", status: "completed", conclusion: "failure", createdAt: "2026-09-29T07:00:00Z", updatedAt: "2026-09-29T07:00:00Z", url: "" },
      ]),
    ),
  );
  assert.equal(mixed.status, "success");
  assert.equal(mixed.previous.id, 1);
});

test("gh 失败分类：找不到、未登录、无权限、超时、其他；都不要求登录", () => {
  const cases = [
    [Object.assign(new Error("spawn"), { code: "ENOENT" }), "missing", /未找到可用的 GitHub CLI/],
    [Object.assign(new Error("x"), { code: 4, stderr: "" }), "auth", /gh 未登录/],
    [Object.assign(new Error("x"), { code: 1, stderr: "To get started with GitHub CLI, please run:  gh auth login" }), "auth", /gh 未登录/],
    [Object.assign(new Error("x"), { code: 1, stderr: "HTTP 401: Bad credentials" }), "auth", /gh 未登录/],
    [Object.assign(new Error("x"), { code: 1, stderr: "HTTP 404: Not Found (https://api.github.com/repos/a/b)" }), "denied", /没有权限或仓库不存在/],
    [Object.assign(new Error("x"), { code: 1, stderr: "GraphQL: Could not resolve to a Repository with the name 'a/b'." }), "denied", /没有权限或仓库不存在/],
    [Object.assign(new Error("x"), { code: 1, stderr: "HTTP 403: Resource not accessible by integration" }), "denied", /没有权限或仓库不存在/],
    [Object.assign(new Error("x"), { killed: true, signal: "SIGTERM" }), "timeout", /超时/],
    [Object.assign(new Error("x"), { code: 1, stderr: "HTTP 500" }), "failed", /查询失败/],
  ];
  for (const [error, reason, message] of cases) {
    const r = ghFailure(error);
    assert.equal(r.reason, reason, error.stderr || error.code);
    assert.match(r.message, message);
    assert.doesNotMatch(r.message, /请.*登录|gh auth login/);
  }
});

// ---------- 真实执行路径（桩脚本） ----------

test("gh 运行器：固定路径查找，找不到时为 missing，白名单外的命令不启动进程", async () => {
  assert.ok(GH_PATHS.every((p) => p.startsWith("/")));
  const dir = await mkdtemp(join(tmpdir(), "guiji-gh-"));
  try {
    const none = createGhRunner({ paths: [join(dir, "no-such-gh")] });
    await assert.rejects(none(["auth", "status"]), /只读/);
    await assert.rejects(
      none(["api", "--method", "GET", "--hostname", "github.com", "repos/a/b"]),
      (e) => e.reason === "missing",
    );
    const stub = await writeGhStub(join(dir, "stub"), ghData(Date.now()));
    const gh = createGhRunner({ paths: [join(dir, "no-such-gh"), stub.path] });
    await assert.rejects(gh(["pr", "create", "--repo", "tester/collab"]), /只读/);
    assert.deepEqual(await stub.calls(), []);
    const out = await gh(["api", "--method", "GET", "--hostname", "github.com", "repos/tester/collab"]);
    assert.equal(JSON.parse(out).default_branch, "main");
    await stub.mode("auth");
    await assert.rejects(
      gh(["api", "--method", "GET", "--hostname", "github.com", "repos/tester/collab"]),
      (e) => e.reason === "auth" && /gh 未登录/.test(e.message),
    );
    assert.equal((await stub.calls()).length, 2);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("GitHub 面板查询：成功时四类数据齐全；未登录、无权限、输出损坏都回退为“未知”，不抛错", async () => {
  const dir = await mkdtemp(join(tmpdir(), "guiji-gh-"));
  const now = Date.parse("2026-09-30T09:00:00Z");
  try {
    const data = ghData(now);
    data["tester/partial"] = { ...data["tester/collab"], failRuns: true };
    const stub = await writeGhStub(join(dir, "stub"), data);
    const gh = createGhRunner({ paths: [stub.path] });
    const ok = await fetchGithubPanel(gh, "tester/collab");
    assert.equal(ok.state, "ok");
    assert.equal(ok.defaultBranch, "main");
    assert.deepEqual(ok.openPrs.items.map((p) => p.number), [7, 5]);
    assert.deepEqual(ok.mergedPrs.items.map((p) => p.number), [6, 4]);
    assert.deepEqual(ok.issues.items.map((p) => p.number), [3]);
    assert.equal(ok.ci.state, "ok");
    assert.equal(ok.ci.status, "failure");
    assert.equal(ok.ci.previous.status, "success");
    // 所有调用都是白名单内的只读调用，run list 限定默认分支。
    const calls = await stub.calls();
    for (const args of calls) assert.deepEqual(readOnlyGhArgs(args), args);
    assert.ok(calls.some((a) => a[0] === "run" && a.includes("--branch") && a[a.indexOf("--branch") + 1] === "main"));
    // 子命令只有 api（GET）与 list；参数里没有写方法与令牌。
    for (const a of calls) {
      assert.ok(a[0] === "api" ? a[2] === "GET" : a[1] === "list", a.join(" "));
      assert.doesNotMatch(a.join(" "), /\b(POST|PATCH|PUT|DELETE)\b|token/i);
    }

    const partial = await fetchGithubPanel(gh, "tester/partial");
    assert.equal(partial.state, "ok");
    assert.equal(partial.openPrs.state, "ok");
    assert.equal(partial.ci.state, "unknown");
    assert.match(partial.ci.message, /查询失败/);

    const denied = await fetchGithubPanel(gh, "tester/leaky");
    assert.equal(denied.state, "unknown");
    assert.equal(denied.reason, "denied");
    assert.match(denied.message, /没有权限或仓库不存在/);

    await stub.mode("auth");
    const before = (await stub.calls()).length;
    const auth = await fetchGithubPanel(gh, "tester/collab");
    assert.equal(auth.state, "unknown");
    assert.equal(auth.reason, "auth");
    // 仓库信息那一步就失败时，不再继续发其余查询。
    assert.equal((await stub.calls()).length, before + 1);

    await stub.mode("garbage");
    const garbage = await fetchGithubPanel(gh, "tester/collab");
    assert.equal(garbage.state, "unknown");
    assert.match(garbage.message, /无法解析/);

    const missing = await fetchGithubPanel(createGhRunner({ paths: [join(dir, "nope")] }), "tester/collab");
    assert.equal(missing.state, "unknown");
    assert.equal(missing.reason, "missing");
    // 适配器本身抛出非预期异常也只算未知。
    const thrown = await fetchGithubPanel(async () => {
      throw new TypeError("boom");
    }, "tester/collab");
    assert.equal(thrown.state, "unknown");
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

// ---------- 缓存 ----------

function fakeRepository(projects) {
  return { read: async () => ({ connections: { projects } }) };
}
function countingGh(data) {
  const calls = [];
  const gh = async (args) => {
    readOnlyGhArgs(args);
    calls.push(args);
    if (data.fail) throw Object.assign(new Error("x"), { code: 4, stderr: "" });
    const key = args[0] === "api" ? args.at(-1).replace(/^repos\//, "") : args[args.indexOf("--repo") + 1];
    const repo = data.repos[key];
    if (args[0] === "api") return JSON.stringify(repo.repo);
    if (args[0] === "pr") return JSON.stringify(args.includes("merged") ? repo.merged : repo.open);
    if (args[0] === "issue") return JSON.stringify(repo.issues);
    return JSON.stringify(repo.runs);
  };
  return { gh, calls, data };
}

test("面板缓存：在推进且有 GitHub 远程才查询；有效期内复用并显示更新时间，刷新或过期才重查", async () => {
  let now = Date.parse("2026-09-30T09:00:00Z");
  const g = countingGh({ repos: ghData(now) });
  const projects = [
    { id: "p1", name: "协同项目", repoKey: "tester/collab", localPaths: [], active: true },
    { id: "p2", name: "无远程", repoKey: "", localPaths: ["/x"], active: true },
    { id: "p3", name: "没在推进", repoKey: "tester/collab", localPaths: [] },
  ];
  const svc = createProjectGithub(fakeRepository(projects), {
    gh: g.gh,
    clock: () => now,
    ttlMs: 10 * 60000,
  });
  assert.throws(() => svc.panel({ path: "/etc" }), /不支持/);
  await assert.rejects(async () => svc.panel({ refresh: "yes" }), /刷新/);
  const first = await svc.panel({});
  assert.deepEqual(first.items.map((i) => i.projectId), ["p1", "p2"]);
  assert.equal(first.items[1].github.state, "none");
  assert.match(first.items[1].github.message, /没有 GitHub 远程/);
  const gh1 = first.items[0].github;
  assert.equal(gh1.state, "ok");
  assert.equal(gh1.fetchedAt, new Date(now).toISOString());
  assert.equal(gh1.cached, false);
  const n = g.calls.length;
  assert.equal(n, 5);

  now += 5 * 60000;
  const second = await svc.panel({});
  assert.equal(g.calls.length, n, "有效期内不重查");
  assert.equal(second.items[0].github.cached, true);
  assert.equal(second.items[0].github.fetchedAt, gh1.fetchedAt);

  await svc.panel({ refresh: true });
  assert.equal(g.calls.length, 2 * n, "刷新时重查");

  now += 11 * 60000;
  await svc.panel({});
  assert.equal(g.calls.length, 3 * n, "过期后重查");

  // 成功之后再失败：如实为未知，并给出上次成功的时间；不沿用旧列表冒充当前。
  g.data.fail = true;
  const failed = (await svc.panel({ refresh: true })).items[0].github;
  assert.equal(failed.state, "unknown");
  assert.equal(failed.reason, "auth");
  assert.equal(failed.lastSuccessAt, new Date(now).toISOString());
  assert.equal(failed.openPrs, undefined);

  // 同时发出的两次查询共用一次 gh 调用。
  const g2 = countingGh({ repos: ghData(now) });
  const svc2 = createProjectGithub(fakeRepository(projects), { gh: g2.gh, clock: () => now });
  await Promise.all([svc2.panel({}), svc2.panel({})]);
  assert.equal(g2.calls.length, 5);
});

// ---------- 简报规则 ----------

const NOW = new Date(2026, 8, 30, 9, 15).getTime();
// 惰性计算，避免模块加载阶段出错时整份文件无法逐条报告。
let cachedWindow;
const windowOf = () => (cachedWindow ||= briefWindow(NOW));
const iso = (ms) => new Date(ms).toISOString();
const at = (ago) => iso(NOW - ago);

test("统计区间是昨天 0 点（本机时区）到现在；日期按本机时区", () => {
  const WINDOW = windowOf();
  assert.equal(WINDOW.date, "2026-09-30");
  assert.equal(WINDOW.since, "2026-09-29");
  assert.equal(WINDOW.start, new Date(2026, 8, 29, 0, 0, 0, 0).toISOString());
  assert.equal(WINDOW.end, iso(NOW));
  const jan1 = briefWindow(new Date(2027, 0, 1, 0, 5).getTime());
  assert.equal(jan1.since, "2026-12-31");
  assert.equal(jan1.date, "2027-01-01");
});

function fullFacts(overrides = {}) {
  const data = ghData(NOW)["tester/collab"];
  const runs = parseRuns(JSON.stringify(data.runs));
  return {
    name: "协同项目",
    current: {
      state: "ok",
      path: "CURRENT.md",
      modifiedAt: at(HOUR),
      fields: {
        stateId: "P-20260930-21",
        writer: "无",
        next: "Codex 复核 21 号 GitHub 面板",
        handoff: { text: "Claude 实现 21", href: "docs/agents/handoffs/2026-09-30-claude-21.md" },
      },
    },
    states: {
      state: "read",
      headings: [
        { stateId: "P-20250101-19", title: "Claude 认领 19（P-20250101-19）", date: "2025-01-01", seq: 19 },
        { stateId: "P-20260929-20", title: "Codex 复核（P-20260929-20）", date: "2026-09-29", seq: 20 },
        { stateId: "P-20260930-21", title: "Claude 实现 GitHub 面板（P-20260930-21）", date: "2026-09-30", seq: 21 },
      ],
    },
    handoffs: {
      state: "ok",
      files: [
        { name: "2026-09-30-claude-21.md", date: "2026-09-30", modifiedAt: at(HOUR) },
        { name: "2025-01-01-claude-19.md", date: "2025-01-01", modifiedAt: at(HOUR) },
        { name: "2026-09-28-codex-18.md", date: "2026-09-28", modifiedAt: at(3 * DAY) },
      ],
    },
    commits: { state: "ok", count: 4 },
    github: {
      state: "ok",
      openPrs: { state: "ok", items: parsePullRequests(JSON.stringify(data.open)) },
      mergedPrs: { state: "ok", items: parsePullRequests(JSON.stringify(data.merged)) },
      issues: { state: "ok", items: parseIssues(JSON.stringify(data.issues)) },
      ci: { state: "ok", ...ciSummary(runs) },
    },
    activity: { state: "active", idleDays: 0 },
    safety: { issues: [] },
    ...overrides,
  };
}

test("简报：多来源同时有变化时逐项列出，唯一下一步来自 CURRENT，CI 失败进卡点", () => {
  const b = composeBrief(fullFacts(), windowOf());
  assert.deepEqual(b.happened, [
    "CURRENT 新增 2 个状态，最新 P-20260930-21（Claude 实现 GitHub 面板（P-20260930-21））",
    "新增交接 1 份：2026-09-30-claude-21.md",
    "新提交 4 个",
    "新开 PR 1 个（#7 状态卡返修）",
    "合并 PR 1 个（#6 接入停滞雷达）",
    "CI 由成功变为失败",
  ]);
  assert.equal(b.next, "Codex 复核 21 号 GitHub 面板");
  assert.deepEqual(b.blockers, ["默认分支 CI 失败（CI）"]);
  assert.equal(
    b.text,
    "昨天到今天：" +
      b.happened.join("；") +
      "。今天的唯一下一步：Codex 复核 21 号 GitHub 面板。卡点：默认分支 CI 失败（CI）。",
  );
  assert.equal(b.digest, sha(b.text));
  // 同样的事实得到同样的段落与指纹；任何一项变化指纹就变。
  assert.equal(composeBrief(fullFacts(), windowOf()).digest, b.digest);
  assert.notEqual(
    composeBrief(fullFacts({ commits: { state: "ok", count: 5 } }), windowOf()).digest,
    b.digest,
  );
});

test("简报：完全没有数据时如实写“没有记录到新的变化”和“未知”，不补造", () => {
  const b = composeBrief(
    {
      name: "文档项目",
      current: { state: "absent", path: "CURRENT.md" },
      states: { state: "absent", headings: [] },
      handoffs: { state: "absent", files: [] },
      commits: { state: "none" },
      github: null,
      activity: { state: "unknown" },
      safety: { issues: [] },
    },
    windowOf(),
  );
  assert.deepEqual(b.happened, ["没有记录到新的变化"]);
  assert.equal(b.next, "未知（项目里没有 CURRENT.md）");
  assert.deepEqual(b.blockers, []);
  assert.equal(
    b.text,
    "昨天到今天：没有记录到新的变化。今天的唯一下一步：未知（项目里没有 CURRENT.md）。卡点：未发现。",
  );
});

test("简报：停滞 + 安全体检问题 + GitHub 未知 + 提交数未知", () => {
  const b = composeBrief(
    fullFacts({
      current: { state: "unparsed", path: "docs/CURRENT.md", modifiedAt: at(40 * DAY) },
      states: { state: "read", headings: [] },
      handoffs: { state: "absent", files: [] },
      commits: { state: "unknown" },
      github: { state: "unknown", reason: "auth", message: "gh 未登录" },
      activity: { state: "stalled", idleDays: 40 },
      safety: {
        issues: [
          { id: "dirty", text: "有 1 个未提交改动" },
          { id: "public", text: "GitHub 远程仓库是公开的" },
        ],
      },
    }),
    windowOf(),
  );
  assert.deepEqual(b.happened, [
    "没有记录到新的变化",
    "新提交数未知",
    "GitHub 情况未知（gh 未登录）",
  ]);
  assert.equal(b.next, "未知（docs/CURRENT.md 没有协作状态表）");
  assert.deepEqual(b.blockers, [
    "已 40 天没有状态更新或提交",
    "安全体检发现 2 项问题（有 1 个未提交改动；GitHub 远程仓库是公开的）",
  ]);
});

test("简报：CURRENT 只改了正文、CI 成功未变化、区间外的失败仍是卡点、部分 GitHub 未知", () => {
  const facts = fullFacts({
    states: { state: "read", headings: [] },
    handoffs: { state: "ok", files: [] },
    commits: { state: "ok", count: 0 },
  });
  const ok = composeBrief(
    {
      ...facts,
      github: {
        ...facts.github,
        openPrs: { state: "unknown", message: "查询失败" },
        mergedPrs: { state: "ok", items: [] },
        ci: {
          state: "ok",
          status: "success",
          latest: { id: 2, workflow: "CI", status: "success", updatedAt: at(2 * HOUR), createdAt: at(2 * HOUR), url: "" },
          previous: { id: 1, workflow: "CI", status: "success", updatedAt: at(3 * DAY), createdAt: at(3 * DAY), url: "" },
        },
      },
    },
    windowOf(),
  );
  assert.deepEqual(ok.happened, [
    "CURRENT 有修改（状态编号 P-20260930-21）",
    "CI 最近一次运行成功",
    "GitHub 部分未知：PR",
  ]);
  assert.deepEqual(ok.blockers, []);
  const oldFailure = composeBrief(
    {
      ...facts,
      current: { ...facts.current, modifiedAt: at(3 * DAY) },
      github: {
        ...facts.github,
        openPrs: { state: "ok", items: [] },
        mergedPrs: { state: "ok", items: [] },
        ci: {
          state: "ok",
          status: "failure",
          latest: { id: 2, workflow: "Build", status: "failure", updatedAt: at(3 * DAY), createdAt: at(3 * DAY), url: "" },
          previous: null,
        },
      },
    },
    windowOf(),
  );
  assert.deepEqual(oldFailure.happened, ["没有记录到新的变化"]);
  assert.deepEqual(oldFailure.blockers, ["默认分支 CI 失败（Build）"]);
});

test("简报：区间边界（恰好昨天 0 点算在内）、状态读取失败、唯一下一步缺失与疑似凭据", () => {
  const start = windowOf().start;
  const edge = composeBrief(
    fullFacts({
      states: { state: "read", headings: [] },
      handoffs: {
        state: "ok",
        files: [
          { name: "edge.md", date: "", modifiedAt: start },
          { name: "before.md", date: "", modifiedAt: iso(Date.parse(start) - 1) },
        ],
      },
      commits: { state: "ok", count: 0 },
      github: null,
      current: { ...fullFacts().current, modifiedAt: iso(Date.parse(start) - 1) },
    }),
    windowOf(),
  );
  assert.deepEqual(edge.happened, ["新增交接 1 份：edge.md"]);
  const broken = composeBrief(
    fullFacts({
      current: { state: "error", path: "CURRENT.md", message: "状态文件是符号链接，不读取" },
      states: { state: "error", headings: [] },
      handoffs: { state: "error", files: [] },
      github: null,
      commits: { state: "ok", count: 0 },
    }),
    windowOf(),
  );
  assert.equal(broken.next, "未知（状态无法读取：状态文件是符号链接，不读取）");
  const partial = composeBrief(
    fullFacts({
      current: { state: "partial", path: "CURRENT.md", modifiedAt: at(3 * DAY), fields: { stateId: "P-1" }, missing: ["唯一下一步"] },
    }),
    windowOf(),
  );
  assert.equal(partial.next, "未知（状态表缺少唯一下一步）");
  const secret = composeBrief(
    fullFacts({
      current: { ...fullFacts().current, fields: { ...fullFacts().current.fields, next: "用 token: ghp_abcdefghijklmnop 推送" } },
    }),
    windowOf(),
  );
  assert.doesNotMatch(secret.text, /ghp_|abcdefghijklmnop/);
  assert.match(secret.next, /已省略/);
  // 多份交接只列前三个名字。
  const many = composeBrief(
    fullFacts({
      handoffs: {
        state: "ok",
        files: ["a", "b", "c", "d"].map((n) => ({ name: `2026-09-30-${n}.md`, date: "2026-09-30", modifiedAt: at(HOUR) })),
      },
    }),
    windowOf(),
  );
  assert.ok(
    many.happened.includes(
      "新增交接 4 份：2026-09-30-a.md、2026-09-30-b.md、2026-09-30-c.md 等",
    ),
  );
});

// ---------- 已读状态：严格 schema ----------

const READ = {
  schema: 1,
  date: "2026-09-30",
  projectId: "p1",
  digest: "a".repeat(64),
  at: "2026-09-30T01:00:00.000Z",
};

test("已读状态 schema：旧库缺失按空；字段、日期、指纹、重复与容量严格校验", () => {
  const base = seed();
  assert.equal(base.briefReads, undefined);
  validateState(base);
  validateState({ ...base, briefReads: [] });
  validateState({ ...base, briefReads: [READ, { ...READ, projectId: "p2" }] });
  const bad = [
    "x",
    [{ ...READ, extra: 1 }],
    [{ ...READ, schema: 2 }],
    [{ ...READ, date: "2026-9-30" }],
    [{ ...READ, date: "2026-02-30" }],
    [{ ...READ, digest: "A".repeat(64) }],
    [{ ...READ, projectId: "../p" }],
    [{ ...READ, at: "yesterday" }],
    [READ, { ...READ, digest: "b".repeat(64) }],
    Array.from({ length: 1001 }, (_, i) => ({ ...READ, projectId: `p${i}` })),
  ];
  for (const briefReads of bad)
    assert.throws(() => validateState({ ...base, briefReads }), /简报已读/, JSON.stringify(briefReads).slice(0, 80));
});

test("已读状态只能经专用操作修改；备份合并不导入也不覆盖本机已读状态", () => {
  const before = { ...seed(), revision: 3, briefReads: [READ] };
  assert.throws(
    () => validateHistory(before, { ...before, briefReads: [] }),
    /简报已读状态只能通过/,
  );
  validateHistory(before, { ...before, briefReads: [] }, { allowBriefs: true });
  const incoming = { ...seed(), briefReads: [{ ...READ, projectId: "other" }] };
  const restored = mergeBackup(null, incoming).state;
  assert.equal(restored.briefReads, undefined);
  const merged = mergeBackup(before, incoming).state;
  assert.deepEqual(merged.briefReads, [READ]);
});

// ---------- HTTP：面板、简报、已读 ----------

test("HTTP：面板与简报只读，项目文件与主库版本不变；gh 只收到白名单只读调用", async () => {
  const app = await projectBriefFixture();
  try {
    // 没有在推进项目时不查询。
    let r = await app.call("/project-github/panel", {});
    assert.equal(r.status, 200);
    assert.deepEqual(r.body.items, []);
    r = await app.call("/project-brief/today", {});
    assert.deepEqual(r.body.items, []);
    assert.deepEqual(await app.gh.calls(), []);

    for (const name of ["协同项目", "泄露项目", "无协议项目", "文档项目"]) await app.mark(name);
    const revision = (await app.workspace()).revision;
    const before = await tree(app.paths.projects);

    r = await app.call("/project-github/panel", {});
    assert.equal(r.status, 200, JSON.stringify(r.body));
    const byName = Object.fromEntries(r.body.items.map((i) => [i.name, i.github]));
    assert.equal(byName["协同项目"].state, "ok");
    assert.equal(byName["协同项目"].ci.status, "failure");
    assert.equal(byName["泄露项目"].state, "unknown");
    assert.match(byName["泄露项目"].message, /没有权限或仓库不存在/);
    assert.equal(byName["无协议项目"].state, "none");
    assert.equal(byName["文档项目"].state, "none");

    r = await app.call("/project-brief/today", {});
    assert.equal(r.status, 200, JSON.stringify(r.body));
    const brief = Object.fromEntries(r.body.items.map((i) => [i.name, i]));
    const collab = brief["协同项目"];
    assert.match(collab.text, /CURRENT 新增 1 个状态，最新 P-\d{8}-21/);
    assert.match(collab.text, /新增交接 1 份：\d{4}-\d\d-\d\d-claude-21\.md/);
    assert.match(collab.text, /新提交 4 个/);
    assert.match(collab.text, /新开 PR 1 个（#7 状态卡返修）/);
    assert.match(collab.text, /合并 PR 1 个（#6 接入停滞雷达）/);
    assert.match(collab.text, /CI 由成功变为失败/);
    assert.match(collab.text, /今天的唯一下一步：Codex 复核 21 号 GitHub 面板。/);
    assert.match(collab.text, /卡点：默认分支 CI 失败（CI）。/);
    assert.doesNotMatch(JSON.stringify(r.body), /BODY-MARKER/);
    assert.equal(collab.read, "unread");
    assert.equal(collab.root, app.paths.collab);
    assert.equal(collab.current.fields.next, "Codex 复核 21 号 GitHub 面板");
    assert.match(brief["泄露项目"].text, /GitHub 情况未知（没有权限或仓库不存在）/);
    assert.match(brief["泄露项目"].text, /安全体检发现 3 项问题/);
    assert.match(brief["无协议项目"].text, /已 30 天没有状态更新或提交/);
    assert.match(brief["文档项目"].text, /没有记录到新的变化/);

    const calls = await app.gh.calls();
    assert.ok(calls.length > 0);
    for (const args of calls) assert.deepEqual(readOnlyGhArgs(args), args);
    // 简报复用面板缓存：刚查过的仓库不再重复调用 gh。
    const again = (await app.gh.calls()).length;
    await app.call("/project-brief/today", {});
    assert.equal((await app.gh.calls()).length, again);

    assert.equal((await app.workspace()).revision, revision);
    assert.deepEqual(await tree(app.paths.projects), before);

    for (const bad of [{ path: "/etc" }, { refresh: 1 }, []]) {
      assert.equal((await app.call("/project-github/panel", bad)).status, 400);
      assert.equal((await app.call("/project-brief/today", bad)).status, 400);
    }
  } finally {
    await app.close();
  }
});

test("HTTP：标为已读写入主库；重复标记不增版本；内容变化后显示“有更新”；非法输入拒绝", async () => {
  const app = await projectBriefFixture();
  try {
    await app.mark("协同项目");
    await app.mark("无协议项目");
    let brief = (await app.call("/project-brief/today", {})).body;
    const collab = brief.items.find((i) => i.name === "协同项目");
    const rev = (await app.workspace()).revision;
    let r = await app.call("/project-brief/read", {
      date: brief.date,
      items: [{ projectId: collab.projectId, digest: collab.digest }],
    });
    assert.equal(r.status, 200, JSON.stringify(r.body));
    assert.equal(r.body.revision, rev + 1);
    const ws = await app.workspace();
    assert.equal(ws.briefReads.length, 1);
    assert.deepEqual(
      Object.keys(ws.briefReads[0]).sort(),
      ["at", "date", "digest", "projectId", "schema"],
    );
    assert.equal(ws.briefReads[0].digest, collab.digest);
    brief = (await app.call("/project-brief/today", {})).body;
    assert.equal(brief.items.find((i) => i.name === "协同项目").read, "read");
    assert.equal(brief.items.find((i) => i.name === "无协议项目").read, "unread");

    // 重复标记同一内容：不写主库。
    r = await app.call("/project-brief/read", {
      date: brief.date,
      items: [{ projectId: collab.projectId, digest: collab.digest }],
    });
    assert.equal(r.body.revision, rev + 1);

    // 普通保存不能改已读状态。
    const current = await app.workspace();
    r = await app.call("/workspace", { state: { ...current, briefReads: [] } }, "PUT");
    assert.ok(r.status >= 400, JSON.stringify(r.body));

    // 项目出现新提交后，简报内容变了：显示“有更新”。
    await writeFile(join(app.paths.collab, "step-3.md"), "第 3 步\n");
    await git(app.paths.collab, ["add", "-A"]);
    await git(app.paths.collab, ["commit", "-q", "-m", "第 3 步"]);
    brief = (await app.call("/project-brief/today", {})).body;
    const changed = brief.items.find((i) => i.name === "协同项目");
    assert.match(changed.text, /新提交 5 个/);
    assert.equal(changed.read, "changed");

    const bad = [
      {},
      { date: brief.date },
      { date: "2026-13-01", items: [{ projectId: collab.projectId, digest: collab.digest }] },
      { date: brief.date, items: [] },
      { date: brief.date, items: [{ projectId: collab.projectId, digest: "x" }] },
      { date: brief.date, items: [{ projectId: collab.projectId, digest: collab.digest, extra: 1 }] },
      { date: brief.date, items: [{ projectId: collab.projectId, digest: collab.digest }], revision: 1 },
    ];
    for (const input of bad)
      assert.equal((await app.call("/project-brief/read", input)).status, 400, JSON.stringify(input));
    r = await app.call("/project-brief/read", {
      date: brief.date,
      items: [{ projectId: "no-such-project", digest: collab.digest }],
    });
    assert.equal(r.status, 404);
  } finally {
    await app.close();
  }
});
