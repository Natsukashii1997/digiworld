// #93 第二批：Skill 页只读 my-skills 与 agent-kit 调用记录。全部用临时目录里的合成 home，不读真实 my-skills。
import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, rm, readdir, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parseLinks, parseFrontmatter, parseGitLog, usageStats, readMySkills } from "../server/my-skills.mjs";
import { validateState } from "../server/schema.mjs";
import { seed } from "../src/store.js";
import { DEFAULT_CATEGORIES, UNSORTED, shortDay, skillBadgesOf, skillCategoryOf, validateSkillMeta } from "../src/asset-categories.js";

const DAY = 864e5;
const NOW = Date.parse("2026-11-19T12:00:00.000Z");

test("links.tsv：注释与空行跳过，一个 skill 多行合并；.claude 是 Claude，.agents / .codex 是 Codex", () => {
  const map = parseLinks([
    "# 注释",
    "",
    "alpha\t~/.claude/skills",
    "alpha\t~/.agents/skills",
    "beta\t~/.codex/skills",
    "gamma\t/Users/x/.claude/skills/",
    "Bad Name\t~/.claude/skills",
    "delta\t~/somewhere/else",
  ].join("\n"));
  assert.deepEqual([...map.keys()], ["alpha", "beta", "gamma", "delta"]);
  assert.deepEqual([...map.get("alpha")].sort(), ["Claude", "Codex"]);
  assert.deepEqual([...map.get("beta")], ["Codex"]);
  assert.deepEqual([...map.get("gamma")], ["Claude"]);
  assert.deepEqual([...map.get("delta")], []);
});

test("SKILL.md 头部：取 name、单行 description、metadata 下一层的 version；更深的 version 不算", () => {
  assert.deepEqual(parseFrontmatter([
    "---", "name: alpha", 'description: "「甲」：做一件事"', "metadata:", '  version: "1.2.0"', "  governance:", "    version: 9", "---", "# 正文", "version: 7",
  ].join("\n")), { name: "alpha", description: "「甲」：做一件事", version: "1.2.0" });
  assert.deepEqual(parseFrontmatter("---\nname: b\ndescription: 说明\n---\n"), { name: "b", description: "说明" });
  assert.equal(parseFrontmatter("# 没有头部"), null);
  assert.equal(parseFrontmatter("---\nname: 没收尾"), null);
});

test("git 记录：最近提交日期取最新一次；首次登记取最早一次加入 SKILL.md；没有加入记录时取最早出现日期", () => {
  const log = [
    "@2026-11-18", "M\tskills/alpha/references/a.md", "",
    "@2026-11-10", "A\tskills/beta/SKILL.md", "M\tskills/alpha/SKILL.md", "",
    "@2026-11-01", "R100\tskills/old/SKILL.md\tskills/alpha/SKILL.md", "M\tskills/gamma/x.md", "",
    "@2026-10-27", "M\tREADME.md", "",
  ].join("\n");
  const m = parseGitLog(log);
  assert.deepEqual(m.get("alpha"), { updatedAt: "2026-11-18", firstAt: "2026-11-01" });
  assert.deepEqual(m.get("beta"), { updatedAt: "2026-11-10", firstAt: "2026-11-10" });
  assert.deepEqual(m.get("gamma"), { updatedAt: "2026-11-01", firstAt: "2026-11-01" });
  assert.equal(m.has("README.md"), false);
});

test("调用记录：只按 skill 名精确匹配，近 30 天单独计，坏行跳过；since 是最早一条记录", () => {
  const lines = [
    { time: new Date(NOW - 2 * DAY).toISOString(), skill: "alpha", cwd: "/x" },
    { time: new Date(NOW - 40 * DAY).toISOString(), skill: "alpha" },
    { time: new Date(NOW - 1 * DAY).toISOString(), skill: "/alpha" },
    { time: new Date(NOW - 1 * DAY).toISOString(), skill: "plugin:alpha" },
    { time: "坏时间", skill: "alpha" },
    { time: new Date(NOW - 3 * DAY).toISOString(), skill: "other" },
  ].map((r) => JSON.stringify(r));
  const { stats, since } = usageStats([...lines, "{坏行"].join("\n"), ["alpha", "beta"], NOW);
  assert.deepEqual(stats.get("alpha"), { total: 3, recent: 2, lastAt: new Date(NOW - DAY).toISOString() });
  assert.deepEqual(stats.get("beta"), { total: 0, recent: 0, lastAt: null });
  assert.equal(since, new Date(NOW - 40 * DAY).toISOString());
  assert.equal(stats.has("other"), false);
});

async function fakeHome() {
  const home = await mkdtemp(join(tmpdir(), "my-skills-"));
  const root = join(home, "Documents", "ChatGPT", "个人", "work", "my-skills");
  await mkdir(join(root, "skills", "alpha"), { recursive: true });
  await mkdir(join(root, "skills", "beta"), { recursive: true });
  await writeFile(join(root, "links.tsv"), "# x\nalpha\t~/.claude/skills\nbeta\t~/.agents/skills\nghost\t~/.claude/skills\n");
  await writeFile(join(root, "skills", "alpha", "SKILL.md"), '---\nname: alpha\ndescription: 第一性原理拆问题\nmetadata:\n  version: "1.0.0"\n---\n');
  await writeFile(join(root, "skills", "beta", "SKILL.md"), "---\nname: beta\ndescription: 部署清单\n---\n");
  const kit = join(home, "Library", "Application Support", "agent-kit");
  await mkdir(kit, { recursive: true });
  await writeFile(join(kit, "skill-usage.jsonl"), JSON.stringify({ time: new Date(NOW - DAY).toISOString(), skill: "alpha", session: "s", cwd: "/p" }) + "\n");
  return { home, root };
}

test("readMySkills：读登记、头部、git 日期与调用次数；缺 SKILL.md 的标 missing；只跑只读的 git log", async () => {
  const { home, root } = await fakeHome();
  const calls = [];
  try {
    const before = await readdir(root, { recursive: true });
    const r = await readMySkills({
      home, clock: () => NOW,
      git: async (args) => { calls.push(args); return "@2026-11-15\nA\tskills/alpha/SKILL.md\n\n@2026-10-27\nA\tskills/beta/SKILL.md\n"; },
    });
    assert.equal(r.available, true);
    assert.deepEqual(r.items.map((i) => i.name), ["alpha", "beta", "ghost"]);
    assert.deepEqual(r.items[0], {
      name: "alpha", description: "第一性原理拆问题", version: "1.0.0", agents: ["Claude"],
      firstAt: "2026-11-15", updatedAt: "2026-11-15",
      uses: { total: 1, recent: 1, lastAt: new Date(NOW - DAY).toISOString() }, missing: false,
    });
    assert.deepEqual([r.items[1].version, r.items[1].agents, r.items[1].firstAt], [null, ["Codex"], "2026-10-27"]);
    assert.equal(r.items[2].missing, true);
    assert.equal(r.items[2].description, "");
    assert.equal(r.usageSince, new Date(NOW - DAY).toISOString());
    assert.match(r.sources.registry, /^~\/Documents\/ChatGPT\/个人\/work\/my-skills\/links\.tsv$/);
    assert.equal(calls.length, 1);
    assert.deepEqual(calls[0].slice(0, 3), ["-C", root, "log"]);
    assert.deepEqual(await readdir(root, { recursive: true }), before, "不写 my-skills");
  } finally { await rm(home, { recursive: true, force: true }); }
});

test("readMySkills：没有 links.tsv 时不可用、不报错；没有调用记录时次数为 null；git 失败时日期为 null", async () => {
  const empty = await mkdtemp(join(tmpdir(), "my-skills-empty-"));
  try {
    const r = await readMySkills({ home: empty, clock: () => NOW, git: async () => null });
    assert.deepEqual([r.available, r.items, r.error], [false, [], "没读到 my-skills 的 links.tsv"]);
  } finally { await rm(empty, { recursive: true, force: true }); }
  const { home } = await fakeHome();
  try {
    await rm(join(home, "Library"), { recursive: true });
    const r = await readMySkills({ home, clock: () => NOW, git: async () => null });
    assert.equal(r.items[0].uses, null);
    assert.equal(r.items[0].firstAt, null);
    assert.equal(r.usageSince, null);
  } finally { await rm(home, { recursive: true, force: true }); }
});

test("Skill 自动归组用名称与 description；手选的以 skillMeta 为准", () => {
  const item = { name: "alpha", description: "第一性原理拆问题" };
  assert.deepEqual(skillCategoryOf(item, undefined, DEFAULT_CATEGORIES), { id: "think", inferred: true });
  assert.deepEqual(skillCategoryOf(item, { category: "ops" }, DEFAULT_CATEGORIES), { id: "ops", inferred: false });
  assert.deepEqual(skillCategoryOf({ name: "x", description: "" }, {}, DEFAULT_CATEGORIES), { id: UNSORTED, inferred: true });
});

test("Skill 状态标识：NEW 7 天、UPD 7 天且非 NEW、HOT 近 30 天 ≥ 5 次、IDLE 记录满 30 天才判断", () => {
  const day = (n) => new Date(NOW - n * DAY).toISOString().slice(0, 10);
  const since = (n) => new Date(NOW - n * DAY).toISOString();
  const s = (firstAt, updatedAt, recent) => ({ firstAt, updatedAt, uses: { total: recent, recent, lastAt: null } });
  assert.deepEqual(skillBadgesOf(s(day(7), day(7), 0), since(12), NOW), ["NEW"]);
  assert.deepEqual(skillBadgesOf(s(day(8), day(8), 0), since(12), NOW), []);
  assert.deepEqual(skillBadgesOf(s(day(20), day(3), 0), since(12), NOW), ["UPD"]);
  assert.deepEqual(skillBadgesOf(s(day(20), day(20), 5), since(12), NOW), ["HOT"]);
  assert.deepEqual(skillBadgesOf(s(day(2), day(1), 9), since(12), NOW), ["NEW", "HOT"]);
  // 记录不满 30 天：不点亮 IDLE。
  assert.deepEqual(skillBadgesOf(s(day(60), day(60), 0), since(12), NOW), []);
  // 记录满 30 天：登记超过 30 天、近 30 天 0 次才点亮；没有记录（uses 为 null）不判断。
  assert.deepEqual(skillBadgesOf(s(day(60), day(60), 0), since(30), NOW), ["IDLE"]);
  assert.deepEqual(skillBadgesOf(s(day(30), day(30), 0), since(30), NOW), []);
  assert.deepEqual(skillBadgesOf({ firstAt: day(60), updatedAt: day(60), uses: null }, since(40), NOW), []);
  assert.deepEqual(skillBadgesOf({ firstAt: null, updatedAt: null, uses: null }, null, NOW), []);
});

test("skillMeta 校验与 schema：名、分类、置顶；非法值整份被拒", () => {
  const ids = new Set(DEFAULT_CATEGORIES.map((c) => c.id));
  assert.doesNotThrow(() => validateSkillMeta({ alpha: { category: "think", pinned: true }, "b.c-d": {} }, ids));
  for (const bad of [[], { "Bad Name": {} }, { a: { category: "nope" } }, { a: { pinned: false } }, { a: { color: "x" } }, { a: null }])
    assert.throws(() => validateSkillMeta(bad, ids), undefined, JSON.stringify(bad));
  assert.doesNotThrow(() => validateState({ ...seed(), skillMeta: { alpha: { category: "dev", pinned: true } } }));
  assert.throws(() => validateState({ ...seed(), skillMeta: { alpha: { category: "nope" } } }), /分类不存在/);
  assert.equal("skillMeta" in validateState(seed()), false);
});

test("卡片日期（G-02）：ISO 时刻按上海时区跨日、跨年；纯日期原样；空值为空", () => {
  assert.equal(shortDay("2026-11-18T16:30:00.000Z"), "11-19", "UTC 16:30 已是上海次日 00:30");
  assert.equal(shortDay("2026-11-18T15:59:59.000Z"), "11-18");
  assert.equal(shortDay("2026-12-31T17:00:00.000Z"), "1-01", "跨年");
  assert.equal(shortDay("2026-11-05"), "11-05");
  assert.equal(shortDay(""), "");
  assert.equal(shortDay(null), "");
});

test("服务默认不读本机 my-skills：只有正式入口传 discovery.mySkills.home 才读", async () => {
  const { startServer } = await import("../server/http.mjs");
  const directory = await mkdtemp(join(tmpdir(), "my-skills-http-"));
  const app = await startServer({ directory, port: 0, staticRoot: directory });
  try {
    const { token } = await (await fetch(app.url + "/api/session", { headers: { "x-workbench-client": "1" } })).json();
    const r = await (await fetch(app.url + "/api/my-skills", { headers: { "x-workbench-token": token } })).json();
    assert.deepEqual([r.available, r.items, r.error], [false, [], "本服务未配置 my-skills 读取"]);
  } finally {
    await app.close();
    await rm(directory, { recursive: true, force: true });
  }
  const source = await (await import("node:fs/promises")).readFile(new URL("../server/index.mjs", import.meta.url), "utf8");
  assert.match(source, /mySkills: \{ home: homedir\(\) \}/, "正式入口读本机 my-skills");
});
