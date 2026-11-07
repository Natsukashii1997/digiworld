// #71 项目名册只读：旧的项目目录、扫描登记、目录关联写接口直接请求也被拒绝且主库不变；
// 整库保存不能借 connections 改 projects / projectCatalog / projectExclusions，同一请求里的其他修改照常生效。
// 只用 fixture.mjs 的合成扫描结果和临时目录，不碰真实 data、名册与 Agent 配置。
import test from "node:test";
import assert from "node:assert/strict";
import { readFile, writeFile, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { fixture } from "./fixture.mjs";
import { seedProjects } from "./seed-projects.mjs";
import { seed } from "../src/store.js";
import { stringify, parse } from "../src/serialization.js";
import { groupPortfolioSections } from "../src/projects-v16.js";

const synthetic = async () => ({
  items: [
    { id: "project-a", name: "我的网站", kind: "Git", repoKey: "tester/website", localPaths: ["/fixture/projects/website"] },
    { id: "project-b", name: "知识编译器", kind: "Node", repoKey: "", localPaths: ["/fixture/work/compiler"] },
  ],
  errors: [], truncated: false, at: new Date().toISOString(),
});

async function setup(discovery) {
  const app = await fixture({ discovery });
  const session = await (await fetch(app.url + "/api/session", { headers: { "x-workbench-client": "1" } })).json();
  const headers = { "x-workbench-token": session.token, "content-type": "application/json" };
  const call = async (path, data, method = data === undefined ? "GET" : "POST") => {
    const r = await fetch(app.url + "/api" + path, { method, headers, ...(data === undefined ? {} : { body: stringify(data) }) });
    return { status: r.status, body: parse(await r.text()) };
  };
  assert.equal((await call("/workspace", { state: seed(), initialize: true }, "PUT")).status, 200);
  await seedProjects(app.repository, { roots: ["/fixture/projects", "/fixture/work"], scanLocal: synthetic });
  await app.repository.updateConnections((c) => ({
    ...c,
    projectCatalog: [
      { projectId: "project-a", displayName: "网站（旧目录）", section: "business", view: "main" },
      { projectId: "project-b", displayName: "编译器（旧目录）", section: "tools", view: "asset" },
    ],
    projectExclusions: ["path:/fixture/old"],
  }));
  const pointer = () => readFile(join(app.repository.directory, "CURRENT.json"), "utf8");
  return { app, call, pointer, workspace: async () => (await call("/workspace")).body };
}

const readonlyFields = (state) => ({
  projects: state.connections.projects,
  projectCatalog: state.connections.projectCatalog,
  projectExclusions: state.connections.projectExclusions,
});

test("下线的项目名册写接口一律 410，主库和指针不变，扫描器不被调用", async () => {
  const { app, call, pointer, workspace } = await setup();
  try {
    const before = await workspace();
    const pointerBefore = await pointer();
    const requests = [
      ["/project-catalog/apply", { revision: before.revision, items: [], exclusions: ["id:project-a"], manualProjects: [{ path: "/fixture/projects/new" }] }],
      ["/scan/projects", {}],
      ["/scan/projects", { roots: ["/"], expectedRoots: before.connections.roots }],
      ["/project-identity/preview", { mode: "merge", projectId: "project-a", candidateId: "project-b", revision: before.revision }],
      ["/project-identity/confirm", { token: "x", revision: before.revision }],
    ];
    for (const [path, data] of requests) {
      const result = await call(path, data);
      assert.equal(result.status, 410, `${path} 应被拒绝`);
      assert.match(result.body.error, /digital-twin\/projects\.json/);
      assert.match(result.body.error, /只读/);
    }
    assert.equal(app.calls.projects, 0, "拒绝时不启动本地项目扫描");
    const after = await workspace();
    assert.equal(after.revision, before.revision);
    assert.deepEqual(after.connections, before.connections);
    assert.equal(await pointer(), pointerBefore);
  } finally { await app.close(); }
});

test("整库 PUT 夹带改过的项目名册三项：三项保留主库原值，同一请求里的 Prompt 修改照常保存", async () => {
  const { app, call, workspace } = await setup();
  try {
    const before = await workspace();
    const forged = structuredClone(before);
    forged.connections.projects = [...forged.connections.projects.map((p) => ({ ...p, name: "被改名" })),
      { ...forged.connections.projects[0], id: "forged-project", localPaths: ["/fixture/forged"] }];
    forged.connections.projectCatalog = [{ projectId: "project-b", displayName: "被改的展示名", section: "business", view: "main" }];
    forged.connections.projectExclusions = ["id:project-a", "path:/fixture/projects"];
    // 同一请求里正常改一条 Prompt：追加新版本（编辑保存的写法）并取消收藏。
    const prompt = forged.assets.find((a) => a.type === "Prompt");
    const edited = { ...prompt.versions.at(-1), id: randomUUID(), at: new Date().toISOString(), content: "合成修改后的 Prompt 正文" };
    prompt.versions = [...prompt.versions, edited];
    prompt.favorite = !prompt.favorite;
    const saved = await call("/workspace", { state: forged }, "PUT");
    assert.equal(saved.status, 200, JSON.stringify(saved.body));
    const after = await workspace();
    assert.equal(after.revision, before.revision + 1);
    assert.deepEqual(readonlyFields(after), readonlyFields(before));
    const savedPrompt = after.assets.find((a) => a.id === prompt.id);
    assert.equal(savedPrompt.versions.at(-1).content, "合成修改后的 Prompt 正文");
    assert.equal(savedPrompt.favorite, prompt.favorite);

    // 删掉三项同样无效：主库原值保留。
    const dropped = structuredClone(after);
    delete dropped.connections.projectCatalog;
    delete dropped.connections.projectExclusions;
    dropped.connections.projects = [];
    assert.equal((await call("/workspace", { state: dropped }, "PUT")).status, 200);
    assert.deepEqual(readonlyFields(await workspace()), readonlyFields(before));

    // 其他连接字段仍按原规则拒绝整库改写。
    const roots = structuredClone(await workspace());
    roots.connections.roots = ["/"];
    assert.equal((await call("/workspace", { state: roots }, "PUT")).status, 400);
  } finally { await app.close(); }
});

test("旧目录数据保留只读：展示名与分区照常用于旧版项目页分组", async () => {
  const { app, workspace } = await setup();
  try {
    const { connections } = await workspace();
    const visible = connections.projects.map((p) => ({
      ...p, name: connections.projectCatalog.find((item) => item.projectId === p.id)?.displayName || p.name,
    }));
    assert.deepEqual(groupPortfolioSections(visible, connections.projectCatalog).map((g) => [g.label, g.items.map((p) => p.name)]),
      [["业务系统", ["网站（旧目录）"]]]);
  } finally { await app.close(); }
});

test("#73 名册同步写入的派生登记：整库 PUT 改 rosterId、删派生记录、伪造派生记录，都保留主库原值", async () => {
  const dir = await mkdtemp(join(tmpdir(), "roster-readonly-"));
  const rosterPath = join(dir, "projects.json");
  await writeFile(rosterPath, JSON.stringify({ projects: [
    { id: "website", name: "我的网站", path: "/fixture/projects/website" },
    { id: "fresh", name: "新项目", path: "/fixture/work/fresh" },
  ] }));
  const { app, call, workspace } = await setup({ projectsSpace: { rosterPath }, rosterSync: { inspect: async () => ({}) } });
  try {
    const synced = await call("/projects-space/sync", { revision: (await workspace()).revision });
    assert.equal(synced.status, 200, JSON.stringify(synced.body));
    assert.deepEqual([synced.body.linked, synced.body.added], [["website"], ["fresh"]]);
    const before = await workspace();
    assert.equal(before.connections.projects.find((p) => p.id === "project-a").rosterId, "website");
    assert.equal(before.connections.projects.find((p) => p.id === "roster-fresh").rosterId, "fresh");

    const forged = structuredClone(before);
    forged.connections.projects = forged.connections.projects
      .filter((p) => p.id !== "roster-fresh")
      .map((p) => (p.rosterId === "website" ? { ...p, rosterId: "hijacked", rosterRemoved: true, active: true } : p))
      .concat({ id: "roster-forged", rosterId: "forged", name: "伪造", localPaths: ["/fixture/forged"], active: true });
    const saved = await call("/workspace", { state: forged }, "PUT");
    assert.equal(saved.status, 200, JSON.stringify(saved.body));
    assert.deepEqual(readonlyFields(await workspace()), readonlyFields(before));
    // 再同步一次也没有变化：整库保存没有在名册派生上留下任何改动。
    assert.equal((await call("/projects-space/sync", {})).body.state, "unchanged");
  } finally { await app.close(); await rm(dir, { recursive: true, force: true }); }
});
