import test from "node:test";
import assert from "node:assert/strict";
import { fixture } from "./fixture.mjs";
import { assetDeleteBlockers } from "../server/asset-delete.mjs";
import { scrollDeleteBlockers } from "../src/scrolls.js";
import { makeAsset, seed, current } from "../src/store.js";
import { stringify, parse } from "../src/serialization.js";
import { validateHistory } from "../server/schema.mjs";

test("引用索引覆盖历史工作流、派生来源和项目，忽略同名不同 ID", () => {
  const target = makeAsset({ title: "目标", type: "Prompt", content: "提示" });
  const other = makeAsset({ title: "目标", type: "Prompt", content: "另一份" });
  const workflow = makeAsset({ title: "流程", type: "Workflow", content: "步骤", references: [{ assetId: target.id, versionId: current(target).id }] });
  workflow.versions.push({ ...current(workflow), id: crypto.randomUUID(), references: [], at: "2026-10-07T00:00:00.000Z" });
  const parentSkill = { id: "source-skill", type: "Skill", versions: [{ title: "源 Skill" }] };
  const derivedSkill = { id: "derived-skill", type: "Skill", origin: { kind: "derived", assetId: parentSkill.id }, versions: [{ title: "衍生 Skill" }] };
  const state = {
    assets: [target, other, workflow, parentSkill, derivedSkill],
    collabRunSettings: [{ templateAssetId: workflow.id, projectId: "project-a", runId: "run-a", round: "第一轮" }],
    connections: { projects: [{ id: "project-a", name: "试验项目" }] },
    reverseRecords: [{ id: "reverse-a", title: "逆向稿", imports: [{ assetId: target.id }] }],
  };
  const refs = assetDeleteBlockers(state, target.id, [{ assetId: target.id, projectId: "project-a", file: "AGENTS.md" }]);
  assert.deepEqual(refs.map(item => item.kind), ["workflow", "rule", "reverse"]);
  assert.match(refs[0].label, /流程 · v1/);
  assert.match(refs[1].label, /试验项目.*AGENTS\.md/);
  assert.deepEqual(assetDeleteBlockers(state, parentSkill.id).map(item => item.kind), ["derived"]);
  assert.deepEqual(assetDeleteBlockers(state, workflow.id).map(item => item.kind), ["collab"]);
  assert.deepEqual(assetDeleteBlockers(state, other.id), []);
  assert.deepEqual(assetDeleteBlockers(state, parentSkill.id, [], [{ id: "publish-a", kind: "publish", assetId: parentSkill.id, name: "已发布 Skill", targetId: "codex" }]).map(item => item.kind), ["derived", "published"]);
});

test("删除接口在同一主库 revision 检查引用；无引用的资产从仓库消失且保留版本", async () => {
  const app = await fixture();
  try {
    const session = await (await fetch(app.url + "/api/session", { headers: { "x-workbench-client": "1" } })).json();
    const headers = { "x-workbench-token": session.token, "content-type": "application/json" };
    const call = async (path, data) => {
      const response = await fetch(app.url + "/api" + path, { method: "POST", headers, body: stringify(data) });
      return { status: response.status, body: parse(await response.text()) };
    };
    const initial = await app.repository.write(seed(), { initialize: true });
    const free = makeAsset({ title: "可删除", type: "Prompt", content: "内容" });
    const linked = makeAsset({ title: "被引用", type: "Prompt", content: "内容" });
    const workflow = makeAsset({ title: "引用流程", type: "Workflow", content: "步骤", references: [{ assetId: linked.id, versionId: current(linked).id }] });
    const prepared = await app.repository.write({ ...initial, assets: [...initial.assets, free, linked, workflow] });
    const genericArchive = await fetch(app.url + "/api/workspace", { method: "PUT", headers, body: stringify({ state: { ...prepared, assets: prepared.assets.map(item => item.id === free.id ? { ...item, archived: true } : item) } }) });
    assert.equal(genericArchive.status, 400);
    assert.match((await genericArchive.text()), /资产删除只能通过专用操作/);
    const demo = prepared.assets.find(item => item.demo);
    assert.ok(demo);
    const genericRemove = await fetch(app.url + "/api/workspace", { method: "PUT", headers, body: stringify({ state: { ...prepared, assets: prepared.assets.filter(item => item.id !== demo.id) } }) });
    assert.equal(genericRemove.status, 400);

    const blocked = await call("/assets/delete", { assetId: linked.id, expectedRevision: prepared.revision });
    assert.equal(blocked.status, 200);
    assert.equal(blocked.body.deleted, false);
    assert.equal(blocked.body.blockers[0].kind, "workflow");
    assert.equal((await app.repository.read()).revision, prepared.revision);

    const deleted = await call("/assets/delete", { assetId: free.id, expectedRevision: prepared.revision });
    assert.equal(deleted.status, 200);
    assert.equal(deleted.body.deleted, true);
    assert.equal(deleted.body.state.assets.find(item => item.id === free.id).archived, true);
    assert.deepEqual(deleted.body.state.assets.find(item => item.id === free.id).versions, free.versions);
    const stale = await call("/assets/delete", { assetId: linked.id, expectedRevision: prepared.revision });
    assert.equal(stale.status, 409);
    assert.equal((await app.repository.read()).assets.find(item => item.id === linked.id).archived, false);
  } finally { await app.close(); }
});

test("卷删除前列出随手记与逆向记录的结构化引用", () => {
  const blockers = scrollDeleteBlockers({
    notes: [{ id: "note-a", text: "判断一\n正文", refined: { scrollId: "scroll-a" } }],
    reverseRecords: [{ id: "reverse-a", title: "逆向材料", imports: [{ kind: "scroll", scrollId: "scroll-a" }] }],
  }, "scroll-a");
  assert.deepEqual(blockers.map(item => item.kind), ["reverse", "note"]);
  const scroll = { id: "scroll-a", deletedAt: undefined };
  const previous = { assets: [], scrolls: [scroll], notes: [{ id: "note-a", refined: { scrollId: "scroll-a" } }], reverseRecords: [] };
  const next = { ...previous, scrolls: [{ ...scroll, deletedAt: "2026-10-07T00:00:00.000Z" }] };
  assert.throws(() => validateHistory(previous, next), /卷仍被随手记或逆向记录引用/);
});
