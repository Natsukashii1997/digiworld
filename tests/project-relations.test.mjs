// 项目关系（#78）：名册 relations + AGENTS.md 引用 + 技能统计 → 关系边与支撑流。全部用合成数据，不读真实名册、项目与 Vault。
import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, symlink, rm, realpath } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { buildRelations, readAgentsFile, baseTerms, mentions, SANKEY_RULE } from "../server/project-relations.mjs";
import { parseRoster } from "../server/project-roster.mjs";
import { spaceFixture } from "./projects-space-fixture.mjs";

const P = (id, type, extra = {}) => ({ id, name: id.toUpperCase(), path: `/w/${id}`, card: "", github: "", type, ...extra });
const item = (id, total, kind = "last", skills = []) => ({
  id, commits: { state: "ok", total }, attention: { kind, text: `状态-${kind}` }, skills: { skills, calls: 0, sessions: 0, codex: [] },
});

test("名册：type / relations / version 只在写了时带上，旧字段不变", () => {
  const r = parseRoster(JSON.stringify({ version: "v9 · 2026-11-08", projects: [
    { id: "a", name: "甲", path: "/a", type: "capability", relations: [{ to: "b", kind: "data" }] },
    { id: "b", name: "乙", path: "/b", type: "奇怪" },
    { id: "c", name: "丙", path: "/c" },
  ] }));
  assert.equal(r.version, "v9 · 2026-11-08");
  assert.deepEqual(r.projects[0], { id: "a", name: "甲", path: "/a", card: "", github: "", type: "capability", relations: [{ to: "b", kind: "data" }] });
  assert.equal(r.projects[1].type, "unknown");
  assert.deepEqual(r.projects[2], { id: "c", name: "丙", path: "/c", card: "", github: "" });
});

test("底座匹配词：id、仓库短名、目录名；按词边界匹配，不用 aliases", () => {
  const kit = { id: "agent-kit", path: "/w/agent-kit", github: "me/agent-kit-repo", aliases: ["LESSONS", "全局坑"] };
  assert.deepEqual(baseTerms(kit), ["agent-kit", "agent-kit-repo"]);
  assert.ok(mentions("见 agent-kit/工程流程.md", "agent-kit"));
  assert.ok(mentions("`AGENT-KIT` 的全局坑", "agent-kit"));
  assert.ok(!mentions("my-agent-kit 是另一个东西", "agent-kit"));
  assert.ok(!mentions("agent-kit2 不是它", "agent-kit"));
  assert.ok(!mentions("先 grep docs/LESSONS.md", "agent-kit"));
});

test("关系边：名册优先去重、非法项跳过、AGENTS 引用底座、自建 skill 连到自建技能库", () => {
  const projects = [
    P("app", "product", { relations: [
      { to: "web", kind: "data", note: "推断的", inferred: true },
      { to: "nobody", kind: "data" },
      { to: "web", kind: "friend" },
      { to: "app", kind: "data" },
    ] }),
    P("web", "product"),
    P("kit", "infrastructure", { relations: [{ to: "app", kind: "support", note: "手写", source: "名册" }] }),
    P("my-skills", "capability"),
    P("idle", "capability"),
  ];
  const agents = {
    app: { state: "ok", text: "开工前读 kit 的工程流程；坑见 LESSONS。" },
    web: { state: "ok", text: "## 协作\n参考 kit。" },
    kit: { state: "ok", text: "kit 自己的说明" },
    "my-skills": { state: "error", reason: "AGENTS.md 是软链接，不读" },
    idle: { state: "absent" },
  };
  const items = [item("app", 30, "agent", [{ name: "ai-landing", src: "自建", n: 3 }, { name: "x", src: "Matt Pocock", n: 9 }]), item("web", 10, "pr"),
    item("kit", 4), item("my-skills", 2), item("idle", 0)];
  const r = buildRelations({ projects, items, agents });
  const key = (e) => `${e.from}>${e.to}:${e.kind}:${e.origin}`;
  assert.deepEqual(r.edges.map(key), [
    "app>web:data:roster",
    "kit>app:support:roster",
    "kit>web:support:agents",
    "my-skills>app:support:skills",
  ]);
  assert.equal(r.edges[0].inferred, true);
  assert.equal(r.edges[1].note, "手写");
  assert.match(r.edges[3].note, /ai-landing/);
  assert.equal(r.edges[2].source, "WEB AGENTS.md");
  // kit 自己的 AGENTS 提到自己不算；app 的 AGENTS 引用 kit 与名册手写同一条，名册那条保留
  assert.ok(!r.edges.some((e) => e.from === "kit" && e.to === "kit"));
  assert.deepEqual(r.skipped.map((s) => s.where), ["roster.relations", "roster.relations", "roster.relations", "agents"]);
  const node = Object.fromEntries(r.nodes.map((n) => [n.id, n]));
  assert.deepEqual(node.app.status, { key: "agent", text: "状态-agent" });
  assert.equal(node.app.c30, 30);
  assert.equal(node.kit.degree, 2);
  assert.equal(node.idle.agents.state, "absent");
});

test("支撑流：产品按底座平分提交，没有底座记 none，「明确独立」不算接入", () => {
  const projects = [
    P("app", "product", { relations: [{ to: "web", kind: "apart" }, { to: "kb", kind: "data" }] }),
    P("web", "product", { relations: [{ to: "kb", kind: "apart" }] }),
    P("kit", "infrastructure", { relations: [{ to: "app", kind: "support" }] }),
    P("kb", "infrastructure"),
    P("ui", "capability"),
  ];
  const r = buildRelations({ projects, items: [item("app", 31, "pr"), item("web", 5, "nogh")], agents: {} });
  assert.equal(r.sankey.rule, SANKEY_RULE);
  assert.deepEqual(r.sankey.links, [
    { base: "kb", project: "app", value: 15.5 },
    { base: "kit", project: "app", value: 15.5 },
    { base: "none", project: "web", value: 5 },
  ]);
  assert.deepEqual(r.sankey.status, [{ project: "app", key: "pr", text: "状态-pr" }, { project: "web", key: "nogh", text: "状态-nogh" }]);
  assert.deepEqual(r.sankey.unusedBases, ["ui"]);
  // 读不到提交的产品宽度记 0，状态记 unknown
  const lost = buildRelations({ projects: [P("x", "product")], items: [], agents: {} });
  assert.deepEqual(lost.sankey.links, [{ base: "none", project: "x", value: 0 }]);
  assert.equal(lost.sankey.status[0].key, "unknown");
  assert.equal(lost.nodes[0].c30, null);
});

test("读 AGENTS.md：普通文件才读，软链接、超大文件、缺失如实报告", async () => {
  const dir = await realpath(await mkdtemp(join(tmpdir(), "relations-agents-")));
  try {
    const ok = join(dir, "ok"), link = join(dir, "link"), big = join(dir, "big"), none = join(dir, "none");
    for (const d of [ok, link, big, none]) await mkdir(d);
    await writeFile(join(ok, "AGENTS.md"), "引用 agent-kit");
    await writeFile(join(dir, "outside.md"), "外面的文件");
    await symlink(join(dir, "outside.md"), join(link, "AGENTS.md"));
    await writeFile(join(big, "AGENTS.md"), "x".repeat(256 * 1024 + 1));
    assert.deepEqual(await readAgentsFile(ok), { state: "ok", text: "引用 agent-kit" });
    assert.equal((await readAgentsFile(link)).state, "error");
    assert.match((await readAgentsFile(big)).reason, /256 KB/);
    assert.deepEqual(await readAgentsFile(none), { state: "absent" });
    assert.deepEqual(await readAgentsFile(join(dir, "不存在")), { state: "absent" });
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("接口 GET /api/projects-space/relations：要令牌、只读、返回关系边与支撑流", async () => {
  const app = await spaceFixture();
  try {
    const { paths, rosterPath } = app;
    await writeFile(rosterPath, JSON.stringify({ version: "测试名册 v1", projects: [
      { id: "collab", name: "协同项目", path: paths.collab, github: "tester/collab", type: "product",
        relations: [{ to: "bare", kind: "data", note: "协同的产出给无协议项目", source: "合成名册" }] },
      { id: "bare", name: "无协议项目", path: paths.bare, type: "product" },
      { id: "agent-kit", name: "协作底座", path: paths.docs, type: "infrastructure" },
    ] }));
    await writeFile(join(paths.collab, "AGENTS.md"), "开工前读 agent-kit 的工程流程。\n");
    await writeFile(join(paths.bare, "AGENTS.md"), "坑见 docs/LESSONS.md。\n");

    const anonymous = await fetch(app.url + "/api/projects-space/relations");
    assert.notEqual(anonymous.status, 200);
    const post = await app.call("/projects-space/relations", {});
    assert.notEqual(post.status, 200);

    const r = await app.call("/projects-space/relations");
    assert.equal(r.status, 200);
    assert.equal(r.body.roster.state, "ok");
    assert.equal(r.body.roster.version, "测试名册 v1");
    assert.deepEqual(r.body.nodes.map((n) => [n.id, n.type]), [["collab", "product"], ["bare", "product"], ["agent-kit", "infrastructure"]]);
    assert.deepEqual(r.body.edges.map((e) => `${e.from}>${e.to}:${e.origin}`), ["collab>bare:roster", "agent-kit>collab:agents"]);
    const collab = r.body.nodes.find((n) => n.id === "collab");
    assert.equal(typeof collab.c30, "number");
    assert.ok(collab.status?.key);
    assert.deepEqual(r.body.sankey.links.map((l) => [l.base, l.project]), [["agent-kit", "collab"], ["none", "bare"]]);
    assert.ok(r.body.sankey.links.every((l) => typeof l.value === "number"));

    // 只读：名册与 AGENTS.md 原样
    const again = await app.call("/projects-space/relations?refresh=1");
    assert.equal(again.status, 200);
    assert.equal(again.body.edges.length, 2);
  } finally {
    await app.close();
  }
});

test("接口：名册读不到时整体报错，返回空数据", async () => {
  const app = await spaceFixture();
  try {
    await writeFile(app.rosterPath, "{ 不是 JSON");
    const r = await app.call("/projects-space/relations");
    assert.equal(r.status, 200);
    assert.equal(r.body.roster.state, "error");
    assert.deepEqual(r.body.nodes, []);
    assert.deepEqual(r.body.sankey.links, []);
  } finally {
    await app.close();
  }
});
