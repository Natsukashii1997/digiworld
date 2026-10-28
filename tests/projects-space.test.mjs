// 项目空间第二版第 1 批（issue #8）：名册、CURRENT 顶节、issue 拆分、未推送数、30 天提交、聚合接口与置顶。
// 只用合成名册、合成 CURRENT、合成项目卡与注入的 gh 桩；不读真实名册、Vault、~/.claude、~/.codex 与 data/。
import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, rm, realpath } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parseCurrentTop } from "../server/project-status.mjs";
import { parseIssues, issueBreakdown } from "../server/project-github.mjs";
import { unpushedCount } from "../server/savepoint-git.mjs";
import { parseRoster, readRoster, cardSummary, expandHome, createCardReader } from "../server/project-roster.mjs";
import { pickNext, attentionOf, matchProject, PIN_LIMIT } from "../server/projects-space.mjs";
import { projectHue, fallbackCode, PROJECT_HUES } from "../src/project-hues.js";
import { startServer } from "../server/http.mjs";
import { seed } from "../src/store.js";
import { stringify, parse } from "../src/serialization.js";
import { buildProjects } from "./project-status-fixture.mjs";

// ---------- CURRENT 顶节：名册里各仓库的写法（合成样例） ----------

const FORMATS = {
  // 1. 顶节标题末尾括注写日期与作者（牛马之家式）
  parenthesized: `# 当前状态\n\n更新：2026-10-23。\n\n## 首页改为 no-store（2026-10-28，Claude，用户说「一并改」；已提交 \`533cb89\`）\n\n- 时间：开工 22:50\n- 遗留：无。\n\n## 更早一节（2026-10-20，Codex）\n`,
  // 2. 头表 + 作者打头、括注里带发布编号（数码世界式）
  headTable: `# 唯一当前状态\n\n## 协作状态\n\n| 字段 | 当前值 |\n|---|---|\n| state_id | WB-1 |\n| 更新时间 | 2026-10-24 13:30 CST |\n| 当前写入者 | Claude |\n| 唯一下一步 | 从第 2 批继续 |\n\n运行中的任务必须遵循协作约定。\n\n## Claude 发布到正式 5178（wb-20261028-671，2026-10-28，回读通过）\n\n正文\n`,
  // 3. 标题不带日期，日期在标题前的“更新日期”（GitHub 快速中心式）
  preambleDate: `# 当前状态\n\n更新日期：2026-10-24（上午）。\n\n## 交接入口与本地变更\n\n用户要求由 Claude 接手。\n`,
  // 4. 日期打头的标题 + 顶节里写“下一步”（数字分身式）
  datedHeading: `# 数字分身 · 当前状态\n\n---\n\n## 2026-10-28 · 首日运行核对（已上线）\n\n- 时间：开工 09:42\n- **下一步**：10-29 巡检应只剩真实问题\n`,
  // 5. 只有头表，没有其他小节
  tableOnly: `# 状态\n\n| 字段 | 值 |\n|---|---|\n| 唯一下一步 | 合入 12 |\n| 更新时间 | 2026-09-30 |\n`,
  // 6. 没有任何二级标题
  plain: `# 记录\n\n随手写的一段话。\n`,
  // 7. 代码块里的 ## 不算标题；只放表格的一节跳过
  fenced: "# 状态\n\n```\n## 不是标题\n```\n\n## 状态表\n\n| a | b |\n|---|---|\n\n## Codex 修好登录（2026/10/27）\n\n唯一下一步：等用户验收\n",
};

test("CURRENT 顶节：七种写法都取到标题、日期、作者与下一步", () => {
  const r = Object.fromEntries(Object.entries(FORMATS).map(([k, v]) => [k, parseCurrentTop(v)]));
  // 括注去掉日期与作者两段，剩下的不长就留着。
  assert.deepEqual(r.parenthesized.top, { title: "首页改为 no-store（用户说「一并改」，已提交 533cb89）", date: "2026-10-28", by: "Claude", next: "" });
  assert.equal(r.parenthesized.tableNext, null);
  assert.deepEqual(r.headTable.top, { title: "发布到正式 5178（wb-20261028-671，回读通过）", date: "2026-10-28", by: "Claude", next: "" });
  assert.deepEqual(r.headTable.tableNext, { text: "从第 2 批继续", date: "2026-10-24" });
  assert.deepEqual(r.preambleDate.top, { title: "交接入口与本地变更", date: "2026-10-24", by: "", next: "" });
  assert.deepEqual(r.datedHeading.top, { title: "首日运行核对（已上线）", date: "2026-10-28", by: "", next: "10-29 巡检应只剩真实问题" });
  assert.equal(r.tableOnly.top, null);
  assert.deepEqual(r.tableOnly.tableNext, { text: "合入 12", date: "2026-09-30" });
  assert.deepEqual(r.plain, { top: null, tableNext: null });
  assert.deepEqual(r.fenced.top, { title: "修好登录", date: "2026-10-27", by: "Codex", next: "等用户验收" });
});

// ---------- issue 标签拆分 ----------

test("issue 只取标签名并按分流标签计数；读取失败不当成 0", () => {
  const items = parseIssues(JSON.stringify([
    { number: 3, title: "a", labels: [{ name: "ready-for-agent", color: "x" }, { name: "bug" }] },
    { number: 1, title: "b", labels: [{ name: "ready-for-agent" }] },
    { number: 2, title: "c", labels: [{ name: "ready-for-human" }] },
    { number: 4, title: "d", labels: [{ name: "needs-triage" }] },
    { number: 5, title: "e" },
  ]));
  assert.deepEqual(items[0].labels, ["ready-for-agent", "bug"]);
  assert.deepEqual(items[4].labels, []);
  assert.deepEqual(issueBreakdown({ state: "ok", items, truncated: false }),
    { open: 5, truncated: false, agent: 2, human: 1, triage: 1 });
  assert.equal(issueBreakdown({ state: "unknown" }), null);
});

test("未推送数：有上游返回数字，没有上游返回 null", async () => {
  assert.equal(await unpushedCount(async () => "12\n"), 12);
  assert.equal(await unpushedCount(async () => { throw new Error("no upstream"); }), null);
  assert.equal(await unpushedCount(async () => "oops"), null);
});

// ---------- 下一步与“要注意的一件事” ----------

test("下一步：ready-for-agent 编号最小 → ready-for-human → 顶节 → 头表 → 没写；CURRENT 比最近提交早 3 天以上标过期", () => {
  const issues = { state: "ok", items: [
    { number: 9, title: "九", url: "u9", labels: ["ready-for-agent"] },
    { number: 4, title: "四", url: "u4", labels: ["ready-for-agent"] },
    { number: 2, title: "二", url: "u2", labels: ["ready-for-human"] },
  ] };
  assert.deepEqual(pickNext({ issues }), { src: "agent", text: "#4 四", number: 4, url: "u4", from: "issue #4 · ready-for-agent", stale: false });
  assert.equal(pickNext({ issues: { state: "ok", items: issues.items.slice(2) } }).src, "human");
  const top = { next: "写测试", date: "2026-10-20" };
  assert.deepEqual(pickNext({ top, lastCommitAt: "2026-10-23T10:00:00Z" }), { src: "top", text: "写测试", from: "", date: "2026-10-20", stale: false });
  assert.equal(pickNext({ top, lastCommitAt: "2026-10-24T10:00:00Z" }).stale, true);
  const table = pickNext({ top: { next: "" }, tableNext: { text: "合入", date: "2026-10-01" }, lastCommitAt: "2026-10-28T00:00:00Z" });
  assert.equal(table.src, "table");
  assert.equal(table.from, "CURRENT 头表");
  assert.equal(table.stale, true);
  assert.deepEqual(pickNext({ issues: { state: "unknown" } }), { src: "none", text: "顶节没写下一步", from: "", stale: false });
});

test("要注意的一件事按简报 §4.3 的优先级只取一条", () => {
  const base = { dir: "ok", github: { state: "ok", issues: { agent: 0, human: 0 }, prs: 0 }, next: { stale: false }, unpushed: 0, lastCommitAt: "2026-10-28T08:00:00Z" };
  const at = (patch) => attentionOf({ ...base, ...patch });
  assert.deepEqual(at({ dir: "missing", github: { state: "none" } }), { kind: "missing", text: "本机找不到目录", warn: true });
  assert.equal(at({ github: { state: "ok", issues: { human: 2, agent: 3 }, prs: 1 }, next: { stale: true } }).text, "待人工验收 2 张");
  assert.equal(at({ next: { stale: true }, unpushed: 40 }).kind, "stale");
  assert.deepEqual(at({ unpushed: 11 }), { kind: "unpushed", text: "未推送 11 个", warn: true });
  assert.equal(at({ unpushed: 10 }).kind, "last");
  assert.deepEqual(at({ github: { state: "ok", issues: { agent: 3, human: 0 }, prs: 2 } }), { kind: "agent", text: "待 Agent 3 张", warn: false });
  assert.equal(at({ github: { state: "ok", issues: { agent: 0, human: 0 }, prs: 2 } }).text, "PR 待合并 2 个");
  assert.deepEqual(at({ github: { state: "none" } }), { kind: "nogh", text: "没有 GitHub 远端", warn: true });
  assert.deepEqual(at({}), { kind: "last", text: "最近提交 10-28", warn: false });
  assert.equal(at({ lastCommitAt: "" }).text, "还没有提交");
});

// ---------- 名册与项目卡 ----------

test("名册：展开 ~、跳过格式不对的条目；读不到或不是 JSON 如实报告", async () => {
  const r = parseRoster(JSON.stringify({ projects: [
    { id: "a", name: "甲", path: "~/work/a", card: "10 项目/甲.md", github: "me/a" },
    { id: "a", name: "重复", path: "~/work/a2" },
    { id: "b", name: "乙", path: "relative/b", card: "../越界.md" },
    { id: "c", name: "丙", path: "/abs/c", card: "../越界.md", github: "不是仓库" },
    { name: "没 id", path: "/x" },
  ] }), { home: "/Users/tester" });
  assert.equal(r.state, "ok");
  assert.equal(r.skipped, 3);
  assert.deepEqual(r.projects, [
    { id: "a", name: "甲", path: "/Users/tester/work/a", card: "10 项目/甲.md", github: "me/a" },
    { id: "c", name: "丙", path: "/abs/c", card: "", github: "" },
  ]);
  assert.equal(parseRoster("{").state, "error");
  assert.equal(parseRoster('{"x":1}').message, "名册里没有 projects 列表");
  assert.equal(expandHome("~", "/h"), "/h");
  const dir = await mkdtemp(join(tmpdir(), "roster-"));
  try {
    const missing = await readRoster(join(dir, "none.json"));
    assert.equal(missing.state, "error");
    assert.match(missing.message, /读不到/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("项目卡摘要：取「是什么 / 目标 / 不做」三段，去掉 frontmatter 与链接语法", () => {
  const card = `---\nsensitivity: 受限\n---\n# 甲项目\n\n开头一段。\n\n## 是什么\n\n把散的东西收成 [[资产]]。\n\n## 目标和做完的样子\n\n- 能稳定复用\n- 不以入口多少论成败\n\n## 不做什么\n\n**不做**聊天工作台。\n\n## 关键决定\n\n略\n`;
  assert.deepEqual(cardSummary(card), { one: "把散的东西收成 资产。", goal: "能稳定复用；不以入口多少论成败", not: "不做聊天工作台。" });
  assert.deepEqual(cardSummary("# 乙\n\n只有一段话。\n"), { one: "只有一段话。", goal: "", not: "" });
});

test("项目卡读取：vault 没开不读文件；开了按授权的知识源读并给出 Obsidian 链接", async () => {
  let reads = 0;
  const files = { current: async (source, path) => { reads++; return { document: { content: `# x\n\n## 是什么\n\n${source.id}:${path}\n` } }; } };
  const repo = { read: async () => ({ connections: { knowledgeSources: [{ id: "v1", kind: "local", root: "/Vault 库" }] } }) };
  const off = createCardReader(repo, { settings: { get: async () => ({ enabled: false, options: {} }) }, files });
  assert.deepEqual(await off("10 项目/甲.md"), { state: "off" });
  assert.equal(reads, 0);
  const on = createCardReader(repo, { settings: { get: async () => ({ enabled: true, options: { sourceId: "v1" } }) }, files });
  const card = await on("10 项目/甲.md");
  assert.equal(card.state, "ok");
  assert.equal(card.one, "v1:10 项目/甲.md");
  assert.equal(card.url, "obsidian://open?vault=Vault%20%E5%BA%93&file=10%20%E9%A1%B9%E7%9B%AE%2F%E7%94%B2");
  assert.deepEqual(await on(""), { state: "absent", message: "名册里没写项目卡" });
  const gone = createCardReader(repo, { settings: { get: async () => ({ enabled: true, options: { sourceId: "v2" } }) }, files });
  assert.equal((await gone("a.md")).state, "error");
});

test("代表色与代号：登记过的按表，没登记的按名字取两字母、按 id 稳定取色", () => {
  assert.deepEqual(projectHue({ id: "work-desk", name: "牛马之家" }), PROJECT_HUES["work-desk"]);
  const a = projectHue({ id: "new-one", name: "Foo bar" });
  assert.equal(a.code, "FO");
  assert.deepEqual(projectHue({ id: "new-one", name: "Foo bar" }), a);
  assert.match(a.hue, /^#[0-9a-f]{6}$/);
  assert.equal(fallbackCode("汽配", "x"), "汽配");
});

test("名册条目按本机路径或真实路径对上已登记项目", () => {
  const projects = [{ id: "p1", localPaths: ["/real/a"] }];
  assert.equal(matchProject({ path: "/link/a" }, projects, "/real/a").id, "p1");
  assert.equal(matchProject({ path: "/real/a/" }, projects), projects[0]);
  assert.equal(matchProject({ path: "/other" }, projects), null);
});

// ---------- 接口 ----------

async function spaceFixture({ roster, gh } = {}) {
  const dir = await realpath(await mkdtemp(join(tmpdir(), "projects-space-")));
  const paths = await buildProjects(dir);
  const outside = join(dir, "没扫描的项目");
  await mkdir(outside);
  const rosterPath = join(dir, "projects.json");
  await writeFile(rosterPath, JSON.stringify(roster ?? { projects: [
    { id: "collab", name: "协同项目", path: paths.collab, card: "10 项目/协同.md", github: "tester/collab" },
    { id: "bare", name: "无协议项目", path: paths.bare },
    { id: "leaky", name: "泄露项目", path: paths.leaky },
    { id: "docs", name: "文档项目", path: paths.docs },
    { id: "gone", name: "已删项目", path: join(dir, "不存在") },
    { id: "outside", name: "没扫描", path: outside },
  ] }));
  const calls = [];
  const fakeGh = gh ?? (async (args) => {
    calls.push(args);
    const repo = args.find((a) => /^tester\//.test(a)) || args.at(-1).replace(/^repos\//, "");
    if (repo.includes("leaky")) throw Object.assign(new Error("HTTP 502"), { code: 1, stderr: "HTTP 502" });
    if (args[0] === "api") return JSON.stringify({ default_branch: "main", private: true });
    if (args[0] === "pr") return args.includes("open") ? JSON.stringify([{ number: 7, title: "PR", url: "https://github.com/tester/collab/pull/7" }]) : "[]";
    if (args[0] === "issue") return JSON.stringify([
      { number: 5, title: "待人验", labels: [{ name: "ready-for-human" }] },
      { number: 3, title: "修窄屏", url: "https://github.com/tester/collab/issues/3", labels: [{ name: "ready-for-agent" }] },
      { number: 8, title: "未分流", labels: [{ name: "needs-triage" }] },
    ]);
    return "[]";
  });
  const app = await startServer({
    directory: join(dir, "data"),
    port: 0,
    staticRoot: join(dir, "static"),
    discovery: {
      defaultRoots: () => [paths.projects],
      scanGitHub: async () => ({ status: "not_connected", items: [], truncated: false, message: "", at: new Date().toISOString() }),
      detectAgents: async () => ({ items: [], at: new Date().toISOString() }),
      repoVisibility: async () => ({ state: "unknown" }),
      githubCli: fakeGh,
      projectsSpace: {
        rosterPath,
        readCard: async (card) => (card ? { state: "ok", one: "合成一句话", goal: "合成目标", not: "合成不做", url: "obsidian://x" } : { state: "absent" }),
      },
    },
  });
  const session = await (await fetch(app.url + "/api/session", { headers: { "x-workbench-client": "1" } })).json();
  const headers = { "x-workbench-token": session.token, "content-type": "application/json" };
  const call = async (path, data, method = data === undefined ? "GET" : "POST") => {
    const r = await fetch(app.url + "/api" + path, { method, headers, ...(data === undefined ? {} : { body: stringify(data) }) });
    return { status: r.status, body: parse(await r.text()) };
  };
  await call("/workspace", { state: seed(), initialize: true }, "PUT");
  assert.equal((await call("/scan/projects", {})).status, 200);
  return { ...app, dir, paths, call, calls, rosterPath, async close() { await app.close(); await rm(dir, { recursive: true, force: true }); } };
}

test("GET /api/projects-space：按名册列项目，读数、现在 / 下一步、30 天提交与要注意的事各自如实", async () => {
  const app = await spaceFixture();
  try {
    const r = await app.call("/projects-space");
    assert.equal(r.status, 200, JSON.stringify(r.body));
    const s = r.body;
    assert.equal(s.roster.state, "ok");
    assert.equal(s.pinLimit, PIN_LIMIT);
    assert.equal(s.days.length, 30);
    assert.deepEqual(s.items.map((i) => i.id), ["collab", "bare", "leaky", "docs", "gone", "outside"]);
    const by = Object.fromEntries(s.items.map((i) => [i.id, i]));

    const c = by.collab;
    assert.equal(c.dir, "ok");
    assert.ok(c.projectId);
    assert.deepEqual(c.doc, { state: "ok", one: "合成一句话", goal: "合成目标", not: "合成不做", url: "obsidian://x" });
    assert.deepEqual(c.github.issues, { open: 3, truncated: false, agent: 1, human: 1, triage: 1 });
    assert.equal(c.github.prs, 1);
    assert.deepEqual(c.next, { src: "agent", text: "#3 修窄屏", number: 3, url: "https://github.com/tester/collab/issues/3", from: "issue #3 · ready-for-agent", stale: false });
    assert.equal(c.now.src, "CURRENT");
    assert.equal(c.now.title, "当前事实");
    assert.equal(c.unpushed, null, "没有上游时不当成 0");
    assert.equal(c.commits.state, "ok");
    assert.equal(c.commits.days.length, 30);
    assert.equal(c.commits.total, 1);
    assert.equal(c.lit, true);
    assert.deepEqual(c.attention, { kind: "human", text: "待人工验收 1 张", warn: true });
    assert.equal(c.skills, null);

    // 没有 CURRENT：现在取最近提交；30 天前的唯一提交不算进图
    assert.equal(by.bare.now.src, "commit");
    assert.equal(by.bare.now.title, "init");
    assert.equal(by.bare.commits.total, 0);
    assert.equal(by.bare.lit, false);
    assert.equal(by.bare.github.state, "none");
    assert.equal(by.bare.attention.kind, "nogh");
    assert.equal(by.bare.next.src, "none");

    // GitHub 读取失败：标记失败，不当成 0
    assert.equal(by.leaky.github.state, "error");
    assert.equal(by.leaky.github.issues, undefined);
    // 不是 Git 仓库
    assert.equal(by.docs.commits.state, "none");
    assert.equal(by.docs.now, null);
    // 目录不存在 / 没扫描登记
    assert.equal(by.gone.dir, "missing");
    assert.equal(by.gone.attention.text, "本机找不到目录");
    assert.equal(by.gone.commits.state, "error");
    assert.equal(by.outside.dir, "unregistered");
    assert.equal(by.outside.projectId, null);
    assert.equal(by.outside.doc.state, "absent");

    assert.equal(s.totals.projects, 6);
    assert.equal(s.totals.issues, 3);
    assert.equal(s.totals.issuesPartial, true);
    assert.equal(s.totals.skillCalls, null);
    assert.ok(!app.calls.some((a) => a.includes("--label")), "不用 --label 过滤");
    assert.ok(app.calls.some((a) => a[0] === "issue" && a.at(-1).split(",").includes("labels")));
  } finally {
    await app.close();
  }
});

test("GET /api/projects-space：名册读不到时整页只给原因；旧接口照常", async () => {
  const app = await spaceFixture();
  try {
    await rm(app.rosterPath);
    const r = await app.call("/projects-space");
    assert.equal(r.status, 200);
    assert.equal(r.body.roster.state, "error");
    assert.match(r.body.roster.message, /名册读不到/);
    assert.deepEqual(r.body.items, []);
    assert.equal(r.body.totals, null);
    assert.equal((await app.call("/project-github/panel", {})).status, 200);
    assert.equal((await app.call("/project-status/inspect", {})).status, 200);
  } finally {
    await app.close();
  }
});

test("POST /api/projects-space/pin：置顶带版本检查、最多 3 个、写后回读；没登记的项目不能置顶", async () => {
  const app = await spaceFixture();
  try {
    const rev = async () => (await app.call("/workspace")).body.revision;
    const bad = await app.call("/projects-space/pin", { id: "collab", pinned: true, revision: await rev(), path: "/etc" });
    assert.equal(bad.status, 400);
    const stale = await app.call("/projects-space/pin", { id: "collab", pinned: true, revision: (await rev()) - 1 });
    assert.equal(stale.status, 409);
    assert.equal((await app.call("/projects-space/pin", { id: "nope", pinned: true, revision: await rev() })).status, 404);
    const outside = await app.call("/projects-space/pin", { id: "outside", pinned: true, revision: await rev() });
    assert.equal(outside.status, 409);
    assert.match(outside.body.error || JSON.stringify(outside.body), /扫描登记/);

    for (const id of ["bare", "leaky", "docs"]) {
      const ok = await app.call("/projects-space/pin", { id, pinned: true, revision: await rev() });
      assert.equal(ok.status, 200, JSON.stringify(ok.body));
      assert.equal(ok.body.pinned, true);
    }
    const fourth = await app.call("/projects-space/pin", { id: "collab", pinned: true, revision: await rev() });
    assert.equal(fourth.status, 409);
    assert.match(JSON.stringify(fourth.body), /最多置顶 3 个，先取消一个/);

    const off = await app.call("/projects-space/pin", { id: "bare", pinned: false, revision: await rev() });
    assert.equal(off.status, 200);
    assert.equal(off.body.pinned, false);
    const on = await app.call("/projects-space/pin", { id: "collab", pinned: true, revision: off.body.revision });
    assert.equal(on.status, 200);

    // 置顶沿用旧字段 active：世界总览读到的就是它；页面上置顶的排在最前
    const ws = (await app.call("/workspace")).body;
    assert.equal(ws.connections.projects.filter((p) => p.active === true).length, 3);
    const s = (await app.call("/projects-space")).body;
    assert.deepEqual(s.items.slice(0, 3).map((i) => i.id).sort(), ["collab", "docs", "leaky"]);
    assert.equal(s.totals.pinned, 3);
  } finally {
    await app.close();
  }
});
