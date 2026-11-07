// #73 本机登记从名册派生：只用临时目录、合成名册与隔离主库，不读真实名册、data/、Vault 与 Agent 配置。
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { openRepository } from "../server/repository.mjs";
import { createRosterSync, inspectRosterPath, rosterRecordId } from "../server/roster-sync.mjs";
import { createRelaySessions } from "../server/relay-sessions.mjs";
import { startServer } from "../server/http.mjs";
import { seed } from "../src/store.js";
import { CURRENT_SAMPLE } from "./project-status-fixture.mjs";

const UUID = "11111111-2222-3333-4444-555555555555";
const ids = Array.from({ length: 16 }, (_, i) => `p${String(i + 1).padStart(2, "0")}`);
const noInspect = async () => ({});

// base 不取真实路径（macOS 临时目录在 /var 下，真实路径是 /private/var），用来覆盖按真实路径对上旧登记。
async function setup(t, { roster = ids } = {}) {
  const base = await fs.mkdtemp(join(tmpdir(), "roster-sync-"));
  t.after(() => fs.rm(base, { recursive: true, force: true }));
  const work = join(base, "work");
  for (const id of ids) await fs.mkdir(join(work, id), { recursive: true });
  const rosterPath = join(base, "projects.json");
  const writeRoster = (list) => fs.writeFile(rosterPath, JSON.stringify({ version: "1.5", projects: list.map((id) => ({ id, name: `项目${id}`, type: "work", path: join(work, id) })) }));
  await writeRoster(roster);
  const repository = await openRepository(join(base, "data"));
  t.after(() => repository.close());
  await repository.write(seed(), { initialize: true });
  const pointer = () => fs.readFile(join(base, "data", "CURRENT.json"), "utf8");
  return { base, work, rosterPath, writeRoster, repository, pointer, real: await fs.realpath(work) };
}
const connections = (projects, roots) => ({
  roots, projects, agents: [], github: { status: "not_connected", login: "", message: "", at: "" },
  projectScannedAt: "", agentScannedAt: "", errors: [], truncated: false,
});

test("名册同步：16 个项目都派生成本机登记；同路径旧登记就地补 rosterId、保留置顶；名册外旧登记不变；重复同步不升版本", async (t) => {
  const f = await setup(t);
  const byPath = { id: "local-aaa", name: "旧名字", localPaths: [join(f.work, "p01")], repoKey: "old/p01", kind: "Node", active: true };
  const byReal = { id: "manual-bbb", name: "真实路径登记", localPaths: [join(f.real, "p02")], active: true, manual: true };
  const outside = { id: "local-ccc", name: "名册外", localPaths: ["/fixture/elsewhere"], repoKey: "x/y", active: true };
  await f.repository.updateConnections(() => connections([byPath, byReal, outside], [f.work]));
  const before = await f.repository.read();
  const sync = createRosterSync(f.repository, { rosterPath: f.rosterPath, inspect: async (path) => ({ kind: "Git", branch: "main", ...(path.endsWith("p03") ? { repoKey: "tester/p03" } : {}) }) });

  const r = await sync.sync();
  assert.equal(r.state, "updated");
  assert.equal(r.revision, before.revision + 1);
  assert.deepEqual(r.linked, ["p01", "p02"]);
  assert.deepEqual(r.added, ids.slice(2));
  assert.equal(r.legacy, 1);
  const after = await f.repository.read();
  const projects = after.connections.projects;
  assert.equal(projects.length, 17);
  for (const id of ids) assert.equal(projects.filter((p) => p.rosterId === id).length, 1, `${id} 应有且只有一条`);
  const p01 = projects.find((p) => p.rosterId === "p01"), p02 = projects.find((p) => p.rosterId === "p02");
  assert.deepEqual(p01, { ...byPath, rosterId: "p01", name: "项目p01", branch: "main" }, "旧登记就地挂上：ID、置顶、旧 repoKey/kind 不变，只补缺的字段");
  assert.equal(p02.id, "manual-bbb");
  assert.equal(p02.active, true);
  assert.deepEqual(p02.localPaths, byReal.localPaths, "按真实路径对上的旧登记不改路径");
  const p03 = projects.find((p) => p.rosterId === "p03");
  assert.deepEqual(p03, { id: "roster-p03", rosterId: "p03", name: "项目p03", localPaths: [join(f.work, "p03")], repoKey: "tester/p03", branch: "main", kind: "Git" });
  assert.deepEqual(projects.find((p) => p.id === "local-ccc"), outside, "名册外的旧登记原样保留");
  // 其余连接字段不动。
  assert.deepEqual({ ...after.connections, projects: null }, { ...before.connections, projects: null });

  const pointer = await f.pointer();
  const again = await sync.sync();
  assert.equal(again.state, "unchanged");
  assert.equal(again.revision, after.revision);
  assert.deepEqual([again.added, again.linked, again.removed], [[], [], []]);
  assert.equal(await f.pointer(), pointer, "没有变化不写库");
});

test("名册删掉项目：派生登记保留并标 rosterRemoved，置顶不丢；加回来去掉标记；名册改名、改路径跟着改", async (t) => {
  const f = await setup(t, { roster: ids.slice(0, 3) });
  const sync = createRosterSync(f.repository, { rosterPath: f.rosterPath, inspect: noInspect });
  assert.equal((await sync.sync()).state, "updated");
  await f.repository.updateConnections((c) => ({ ...c, projects: c.projects.map((p) => (p.rosterId === "p02" ? { ...p, active: true } : p)) }));

  await f.writeRoster(["p01", "p03"]);
  const removed = await sync.sync();
  assert.deepEqual(removed.removed, ["p02"]);
  const kept = (await f.repository.read()).connections.projects.find((p) => p.rosterId === "p02");
  assert.equal(kept.rosterRemoved, true);
  assert.equal(kept.active, true);
  assert.equal(kept.id, "roster-p02");
  assert.equal((await sync.sync()).state, "unchanged", "已标记的不重复写");

  const moved = join(f.work, "p02-moved");
  await fs.mkdir(moved);
  await fs.writeFile(f.rosterPath, JSON.stringify({ projects: [
    { id: "p01", name: "改过名的p01", path: join(f.work, "p01") },
    { id: "p02", name: "项目p02", path: moved },
    { id: "p03", name: "项目p03", path: join(f.work, "p03") },
  ] }));
  const back = await sync.sync();
  assert.deepEqual([back.restored, back.renamed, back.moved], [["p02"], ["p01"], ["p02"]]);
  const projects = (await f.repository.read()).connections.projects;
  const p02 = projects.find((p) => p.rosterId === "p02");
  assert.equal(p02.rosterRemoved, undefined);
  assert.deepEqual(p02.localPaths, [moved, join(f.work, "p02")], "新路径排第一，旧路径留着");
  assert.equal(projects.find((p) => p.rosterId === "p01").name, "改过名的p01");
});

test("名册坏了、缺失或主库没初始化：不写库，返回明确状态；请求只认 revision", async (t) => {
  const f = await setup(t);
  const sync = createRosterSync(f.repository, { rosterPath: f.rosterPath, inspect: noInspect });
  const revision = (await f.repository.read()).revision, pointer = await f.pointer();
  await fs.writeFile(f.rosterPath, "{坏的");
  const broken = await sync.sync();
  assert.equal(broken.state, "error");
  assert.match(broken.message, /JSON/);
  await fs.rm(f.rosterPath);
  const missing = await sync.sync();
  assert.equal(missing.state, "error");
  assert.match(missing.message, /不存在/);
  assert.equal((await f.repository.read()).revision, revision);
  assert.equal(await f.pointer(), pointer);
  await f.writeRoster(ids);
  await assert.rejects(sync.sync({ revision: revision + 5 }), (e) => e.status === 409);
  await assert.rejects(sync.sync({ revision, extra: 1 }), /不支持的字段/);
  assert.equal((await f.repository.read()).revision, revision);

  const empty = await openRepository(join(f.base, "empty"));
  t.after(() => empty.close());
  const skipped = await createRosterSync(empty, { rosterPath: f.rosterPath, inspect: noInspect }).sync();
  assert.equal(skipped.state, "skipped");
  assert.equal(await empty.read(), null);
});

test("同步途中主库被别处改了：按新版本重算，不盖掉别处的修改", async (t) => {
  const f = await setup(t);
  await f.repository.updateConnections(() => connections([], [f.work]));
  let raced = false;
  const sync = createRosterSync(f.repository, {
    rosterPath: f.rosterPath,
    inspect: async () => {
      if (!raced) {
        raced = true;
        await f.repository.updateConnections((c) => ({ ...c, projectStallDays: 9 }));
      }
      return {};
    },
  });
  const r = await sync.sync();
  assert.equal(r.state, "updated");
  const after = await f.repository.read();
  assert.equal(after.connections.projectStallDays, 9);
  assert.equal(after.connections.projects.filter((p) => p.rosterId).length, 16);
});

test("记录 ID：名册 id 合规就用 roster-<id>，带点号改用摘要；目录检查复用单目录只读检查", async (t) => {
  assert.equal(rosterRecordId("digital-twin"), "roster-digital-twin");
  assert.match(rosterRecordId("a.b"), /^roster-[a-f0-9]{24}$/);
  const f = await setup(t);
  const repo = join(f.work, "p01");
  const git = (args) => promisify(execFile)("/usr/bin/git", ["-C", repo, ...args], { env: { ...process.env, GIT_CONFIG_GLOBAL: "/dev/null", GIT_CONFIG_NOSYSTEM: "1" } });
  await git(["init", "-q", "-b", "main"]);
  await git(["remote", "add", "origin", "https://github.com/Tester/P01.git"]);
  const found = await inspectRosterPath(repo, { volumeUuid: async () => UUID });
  assert.deepEqual(found, { repoKey: "tester/p01", branch: "main", kind: "Git" });
  assert.deepEqual(await inspectRosterPath(join(f.work, "p02"), { volumeUuid: async () => UUID }), {}, "认不出是项目就留空");
  assert.deepEqual(await inspectRosterPath(join(f.work, "不存在"), { volumeUuid: async () => UUID }), {});
});

test("下游：接力包按派生登记读到项目 CURRENT 的唯一下一步", async (t) => {
  const f = await setup(t);
  const project = join(f.real, "p01");
  await fs.writeFile(join(project, "CURRENT.md"), CURRENT_SAMPLE);
  // 名册写真实路径，接力会话的 cwd 也是它；roots 取旧扫描目录。
  await fs.writeFile(f.rosterPath, JSON.stringify({ projects: [{ id: "p01", name: "项目p01", path: project }] }));
  await f.repository.updateConnections(() => connections([], [f.real]));
  assert.equal((await createRosterSync(f.repository, { rosterPath: f.rosterPath, inspect: noInspect }).sync()).state, "updated");

  const home = join(f.real, "home"), at = "2026-10-05T04:12:00.000Z";
  const sessions = join(home, ".claude/projects/p");
  await fs.mkdir(sessions, { recursive: true });
  const line = (uuid, parentUuid, role, text) => JSON.stringify({ timestamp: at, uuid, parentUuid, type: role, cwd: project, message: { role, content: text } });
  await fs.writeFile(join(sessions, "s.jsonl"), [line("u", null, "user", "目标"), line("a", "u", "assistant", "结果")].join("\n"));
  const relay = createRelaySessions({ home, clock: () => new Date(at), getWorkspace: () => f.repository.read() });
  const list = await relay.list({ pageId: "fixture-page-00000001" });
  const prepared = await relay.prepare({ pageId: "fixture-page-00000001", id: list.sessions[0].id });
  assert.equal(prepared.nextStatus, "ok");
  assert.match(prepared.prompt, /项目唯一下一步：Claude 读回 12 并合入/);
});

test("启动时同步：只在打开开关时按名册派生一次（测试起的服务默认不同步）", async (t) => {
  const f = await setup(t);
  await f.repository.close();
  const start = (syncRosterOnStart) => startServer({
    directory: join(f.base, "data"), port: 0, syncRosterOnStart,
    discovery: { defaultRoots: () => [f.work], projectsSpace: { rosterPath: f.rosterPath }, rosterSync: { inspect: noInspect } },
  });
  let app = await start(false);
  assert.equal((await app.repository.read()).connections, undefined);
  await app.close();
  app = await start(true);
  try {
    const { connections } = await app.repository.read();
    assert.deepEqual(connections.roots, [f.work]);
    assert.deepEqual(connections.projects.map((p) => p.rosterId), ids);
  } finally {
    await app.close();
  }
});

