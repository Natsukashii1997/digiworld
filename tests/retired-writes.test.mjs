// #111 写接口统一封口：下线表里的路径绕过界面直接请求也回 410，主库和指针不变，夹具里的扫描适配器不被调用；
// 保留的只读、停止类动作和现役页面在用的接口不在表里。只用 fixture.mjs 的临时目录，不碰真实 data 与 Agent 配置。
import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { fixture } from "./fixture.mjs";
import { seed, makeAsset, current } from "../src/store.js";
import { stringify, parse } from "../src/serialization.js";
import { retiredWrite } from "../server/retired-writes.mjs";

// 每组：下线说明里应出现的字样 + 该组的全部路径（都是 POST）。
const RETIRED = [
  [/不再写入真实 Agent/, [
    "/agent-config/preview", "/agent-config/apply", "/agent-config/restore-preview",
    "/capabilities/agent/apply", "/capabilities/agent/model-apply", "/capabilities/agent/model-rollback",
    "/capabilities/agent/pool-publish-apply", "/capabilities/agent/pool-publish-rollback",
    "/capabilities/agent/migration-batch-apply", "/capabilities/agent/repair-apply", "/capabilities/agent/snapshot-save",
    "/capabilities/agent/inspect",
    "/agent-targets/save", "/agent-targets/remove",
  ]],
  [/my-skills/, [
    "/skill-copies/preview", "/skill-copies/bind", "/skill-copies/remove",
    "/skill-sources/preview", "/skill-sources/import", "/skill-sources/derive",
    "/skill-source-updates/adopt",
  ]],
  [/不再往项目里写/, [
    "/rule-templates/preview", "/rule-templates/apply", "/rule-templates/revert-preview",
    "/capabilities/workflow/preview", "/capabilities/workflow/authorize", "/capabilities/workflow/apply",
  ]],
  [/不再自己调用模型或执行任务/, [
    "/reverse/runs/start",
    "/learning/metadata", "/learning/folders/add", "/learning/folders/remove",
    "/capabilities/model/apply-credentials", "/capabilities/model/confirm-test", "/capabilities/model/confirm-book",
    "/capabilities/night/register-confirm", "/capabilities/night/save-tasks", "/capabilities/night/confirm", "/capabilities/night/run",
    "/night-v2/recheck", "/night-v2/actions/preview", "/night-v2/actions/confirm",
    "/night-v2/actions/suggestion-preview", "/night-v2/actions/suggestion-confirm", "/night-v2/morning/reconcile",
    "/controlled-execution/preview", "/controlled-execution/confirm", "/controlled-execution/resolve", "/controlled-execution/start",
    "/controlled-execution/gate-preview", "/controlled-execution/gate", "/controlled-execution/collect",
  ]],
  [/不再写入 Vault/, [
    "/knowledge/writes/preview", "/knowledge/writes/apply", "/knowledge/writes/rollback-preview", "/knowledge/writes/rollback",
    "/knowledge/tasks/create", "/knowledge/tasks/packet", "/knowledge/tasks/receive", "/knowledge/tasks/archive",
    "/knowledge/maintenance/preview", "/knowledge/maintenance/create", "/knowledge/maintenance/recover",
    "/knowledge/clip/preview", "/knowledge/clip/confirm",
    "/capabilities/vault/preview-note", "/capabilities/vault/preview-profile", "/capabilities/vault/apply", "/capabilities/vault/rollback",
  ]],
  [/日历在数码世界只读/, [
    "/calendar/blocks/create", "/calendar/blocks/update", "/calendar/blocks/delete",
    "/calendar/todos/create", "/calendar/todos/update",
  ]],
  [/已随信息驾驶舱改造下线/, [
    "/relay-sessions/prepare", "/relay-sessions/clear",
    "/project-desk/deliver", "/project-desk/equip", "/project-desk/unequip",
    "/savepoints/preview", "/savepoints/confirm",
  ]],
];

// 保留的接口：只读、停止类，以及现役页面在用的写入。封口不能误伤它们。
const KEPT = [
  ["POST", "/agent-config/inspect"], ["POST", "/agent-config/check"], ["POST", "/agent-config/history"],
  ["POST", "/agent-targets/options"],
  ["POST", "/skill-copies/discover"], ["POST", "/skill-copies/check"],
  ["GET", "/deliveries"], ["POST", "/deliveries"], ["POST", "/deliveries/revoke"], ["POST", "/deliveries/copied"], ["GET", "/skill-sources"],
  ["POST", "/rule-templates/check"], ["POST", "/rule-templates/installs"],
  ["POST", "/reverse/runs/stop"], ["GET", "/reverse/runs/query"],
  ["POST", "/reverse/reports/preview"], ["POST", "/reverse/reports/adopt"],
  ["GET", "/learning/shelf"],
  ["POST", "/capabilities/night/stop"], ["GET", "/capabilities/night/status"], ["GET", "/capabilities/model/status"],
  ["POST", "/capabilities/settings/apply"], ["POST", "/capabilities/daemon/apply"],
  ["POST", "/night-v2/stop"], ["GET", "/night-v2/status"],
  ["POST", "/controlled-execution/list"], ["POST", "/controlled-execution/stop"],
  ["POST", "/knowledge/writes/history"], ["POST", "/knowledge/tasks/check"], ["POST", "/knowledge/maintenance/impact"],
  ["POST", "/knowledge/clip/check"], ["POST", "/knowledge/reconfirm"], ["POST", "/knowledge/profile/proposals/confirm"],
  ["POST", "/calendar/access"], ["POST", "/calendar/week"], ["POST", "/calendar/todos"], ["POST", "/calendar/blocks/check"],
  ["POST", "/relay-sessions/open"], ["POST", "/relay-sessions/list"],
  ["POST", "/project-desk/withdraw"], ["POST", "/project-desk/next"], ["GET", "/project-desk"],
  ["POST", "/savepoints/inspect"], ["POST", "/savepoints/query"],
  ["POST", "/collab/record"], ["POST", "/collab/board"], ["POST", "/collab/protocol"],
  ["PUT", "/workspace"], ["POST", "/project-context/bind"], ["POST", "/notes"], ["POST", "/collection/notes"],
  ["POST", "/full-backup/create"], ["POST", "/import/confirm"],
];

test("下线表：表里的写路径都命中并带对应说明，保留的接口都不命中", () => {
  for (const [why, paths] of RETIRED)
    for (const path of paths) {
      assert.match(retiredWrite("/api" + path, "POST") || "", why, `${path} 应在下线表里`);
      assert.equal(retiredWrite("/api" + path, "GET"), null, `${path} 只拦 POST`);
    }
  for (const [method, path] of KEPT)
    assert.equal(retiredWrite("/api" + path, method), null, `${method} ${path} 不应被封`);
  // 项目名册（#71）不分方法。
  for (const method of ["GET", "POST", "PUT"])
    assert.match(retiredWrite("/api/scan/projects", method), /digital-twin\/projects\.json/);
  // 只认完整路径，不误伤前缀相同的别的路径。
  assert.equal(retiredWrite("/api/skill-copies/checks", "POST"), null);
  assert.equal(retiredWrite("/api/capabilities/agent", "POST"), null);
  assert.equal(retiredWrite("/api/agent-config/apply/extra", "POST"), null);
});

test("直接请求下线的写接口一律 410：不校验请求体，主库、指针不变，扫描适配器不被调用", async () => {
  const app = await fixture();
  try {
    const session = await (await fetch(app.url + "/api/session", { headers: { "x-workbench-client": "1" } })).json();
    const headers = { "x-workbench-token": session.token, "content-type": "application/json" };
    const call = async (path, data, method = data === undefined ? "GET" : "POST") => {
      const r = await fetch(app.url + "/api" + path, { method, headers, ...(data === undefined ? {} : { body: stringify(data) }) });
      return { status: r.status, body: parse(await r.text()) };
    };
    assert.equal((await call("/workspace", { state: seed(), initialize: true }, "PUT")).status, 200);
    const pointer = () => readFile(join(app.repository.directory, "CURRENT.json"), "utf8");
    const before = (await call("/workspace")).body, pointerBefore = await pointer(), callsBefore = { ...app.calls };
    for (const [why, paths] of RETIRED)
      for (const path of paths) {
        // 请求体故意给不合法的形状：下线的接口不该走到参数校验（那会是 400）。
        const result = await call(path, { anything: true });
        assert.equal(result.status, 410, `${path} 应回 410`);
        assert.match(result.body.error, why);
      }
    // 没带会话令牌的请求仍先被鉴权拒绝，下线说明不对未鉴权方泄露。
    const anonymous = await fetch(app.url + "/api/agent-config/apply", { method: "POST", headers: { "content-type": "application/json" }, body: "{}" });
    assert.equal(anonymous.status, 403);
    const after = (await call("/workspace")).body;
    assert.equal(after.revision, before.revision);
    assert.deepEqual(after, before);
    assert.equal(await pointer(), pointerBefore);
    assert.deepEqual({ ...app.calls }, callsBefore);
  } finally { await app.close(); }
});

test("封口不误伤：保留的读接口照常应答", async () => {
  const app = await fixture();
  try {
    const session = await (await fetch(app.url + "/api/session", { headers: { "x-workbench-client": "1" } })).json();
    const headers = { "x-workbench-token": session.token, "content-type": "application/json" };
    const put = await fetch(app.url + "/api/workspace", { method: "PUT", headers, body: stringify({ state: seed(), initialize: true }) });
    assert.equal(put.status, 200);
    for (const path of ["/deliveries", "/skill-sources", "/capabilities/night/status", "/capabilities/model/status", "/night-v2/status", "/learning/shelf", "/project-desk"]) {
      const r = await fetch(app.url + "/api" + path, { headers });
      assert.notEqual(r.status, 410, `GET ${path} 不应被封`);
      assert.ok(r.status < 500, `GET ${path} 不应报服务端错误（实际 ${r.status}）`);
    }
  } finally { await app.close(); }
});

test("交付链接：Skill 资产直接请求回 410 且不生成链接；设计 Skill 的旧版 ZIP 包照旧可交付（#93）", async () => {
  const app = await fixture();
  try {
    const session = await (await fetch(app.url + "/api/session", { headers: { "x-workbench-client": "1" } })).json();
    const headers = { "x-workbench-token": session.token, "content-type": "application/json" };
    const call = async (path, data, method = data === undefined ? "GET" : "POST") => {
      const r = await fetch(app.url + "/api" + path, { method, headers, ...(data === undefined ? {} : { body: stringify(data) }) });
      return { status: r.status, body: parse(await r.text()) };
    };
    const files = (name) => [{ path: `${name}/SKILL.md`, text: true, mode: 0o644, data: `---\nname: ${name}\n---\n# ${name}\n合成内容。` }];
    const skill = makeAsset({ type: "Skill", title: "合成 Skill", content: "合成说明", files: files("fixture-skill") });
    const design = makeAsset({ type: "Design", title: "合成设计包", content: "请生成一张留白海报。", design: { kind: "skill", skillName: "fixture-design" }, files: files("fixture-design") });
    assert.equal((await call("/workspace", { state: { ...seed(), assets: [skill, design] }, initialize: true }, "PUT")).status, 200);
    const refused = await call("/deliveries", { assetId: skill.id, versionId: current(skill).id });
    assert.equal(refused.status, 410);
    assert.match(refused.body.error, /my-skills/);
    assert.deepEqual((await call(`/deliveries?assetId=${skill.id}`)).body, []);
    const made = await call("/deliveries", { assetId: design.id, versionId: current(design).id });
    assert.equal(made.status, 200, stringify(made.body));
    assert.match(made.body.instructions, /留白海报/);
    assert.equal((await call("/deliveries/revoke", { id: made.body.id })).status, 200);
  } finally { await app.close(); }
});
