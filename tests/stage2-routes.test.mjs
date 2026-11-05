// 阶段 2 主线串联 A 批：去向模型（项目桌、归档、孵化来源、焚决来源、留痕引用）与去向推导。全部合成数据。
import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { projectStatusFixture } from "./project-status-fixture.mjs";
import { openRepository } from "../server/repository.mjs";
import { validateState } from "../server/schema.mjs";
import { seed, makeAsset, revise, restore, current } from "../src/store.js";
import { captureRouteIndex, pendingInbox, relayOf } from "../src/capture-routes.js";

const AT = "2026-10-23T08:00:00.000Z";
const SHA = "a".repeat(64);
const skill = (title = "合成 Skill") => makeAsset({ title, type: "Prompt", content: "合成正文" });

async function desk() {
  const app = await projectStatusFixture();
  // 准备失败时也关掉服务，否则监听句柄让整个测试文件永不退出。
  try {
    const before = await app.workspace();
    const [slot, other] = before.connections.projects;
    await app.call("/project-status/mark", { projectId: slot.id, active: true, revision: before.revision });
    const state = await app.workspace();
    state.notes = [{ id: "note-a", at: AT, text: "合成需求便签" }, { id: "note-b", at: AT, text: "另一条" }];
    state.assets = [...state.assets, skill()];
    const saved = await app.call("/workspace", { state }, "PUT");
    assert.equal(saved.status, 200, JSON.stringify(saved.body));
    return { app, slot: slot.id, other: other.id, asset: saved.body.assets.at(-1) };
  } catch (error) {
    await app.close().catch(() => {});
    throw error;
  }
}

test("旧库没有任何阶段 2 字段时照常校验；新字段格式错误被拒绝", () => {
  validateState({ ...seed(), revision: 0 });
  const ok = { ...seed(), projectDesk: [{ projectId: "p1", inbox: [{ kind: "note", id: "n1", at: AT }], loadout: [{ assetId: "a1", versionId: "v1", at: AT }], next: { text: "下一步", at: AT } }] };
  validateState(ok);
  for (const projectDesk of [
    [{ projectId: "p1", inbox: [], loadout: [], extra: 1 }],
    [{ projectId: "p1", inbox: [{ kind: "reverse", id: "r", at: AT }], loadout: [] }],
    [{ projectId: "p1", inbox: [{ kind: "note", id: "n", at: AT }, { kind: "note", id: "n", at: AT }], loadout: [] }],
    [{ projectId: "p1", inbox: [], loadout: [{ assetId: "a", versionId: "v", at: AT }, { assetId: "a", versionId: "w", at: AT }] }],
    [{ projectId: "p1", inbox: [], loadout: [], next: { text: "多行\n下一步", at: AT } }],
    [{ projectId: "p1", inbox: [], loadout: [] }, { projectId: "p1", inbox: [], loadout: [] }],
  ]) assert.throws(() => validateState({ ...seed(), projectDesk }), /数据校验失败/, JSON.stringify(projectDesk));
  validateState({ ...seed(), notes: [{ id: "n", at: AT, text: "x", archivedAt: AT }] });
  assert.throws(() => validateState({ ...seed(), notes: [{ id: "n", at: AT, text: "x", archivedAt: "昨天" }] }), /数据校验失败/);
});

test("孵化来源只在新建资产的首个版本；编辑与恢复都不继承", () => {
  const hatched = makeAsset({ title: "孵出的规则", type: "Rule", content: "正文", hatchedFrom: { kind: "note", id: "note-a" } });
  validateState({ ...seed(), assets: [hatched] });
  const edited = revise(hatched, { content: "改过" });
  assert.equal(current(edited).hatchedFrom, undefined);
  assert.deepEqual(edited.versions[0].hatchedFrom, { kind: "note", id: "note-a" });
  assert.equal(current(restore(edited, hatched.versions[0].id)).hatchedFrom, undefined);
  validateState({ ...seed(), assets: [restore(edited, hatched.versions[0].id)] });
  const forged = { ...edited, versions: [edited.versions[0], { ...edited.versions[1], hatchedFrom: { kind: "note", id: "x" } }] };
  assert.throws(() => validateState({ ...seed(), assets: [forged] }), /孵化来源只能在首个版本/);
  assert.throws(() => validateState({ ...seed(), assets: [makeAsset({ title: "t", type: "Rule", hatchedFrom: { kind: "scroll", id: "r" } })] }), /孵化来源类型/);
  // 逆向标本孵化的 Skill（#29）也记来源
  validateState({ ...seed(), assets: [makeAsset({ title: "t", type: "Skill", files: [{ path: "SKILL.md", text: true, data: "# t\n" }], hatchedFrom: { kind: "reverse", id: "r" } })] });
});

test("焚决条目来源可以是收藏 ID，但不能同时指向逆向记录", () => {
  const scroll = (source) => ({ ...seed(), scrolls: [{ id: "s", name: "卷", pinned: false, createdAt: AT, entries: [{ id: "e", text: "正文", tags: [], uses: 0, createdAt: AT, source }] }] });
  validateState(scroll({ collectionId: "a".repeat(24) }));
  validateState(scroll({ collectionId: "a".repeat(24), url: "https://example.test/x" }));
  assert.throws(() => validateState(scroll({ collectionId: "c", reverseId: "r" })), /焚决来源/);
  assert.throws(() => validateState(scroll({ url: "https://example.test/x" })), /记录 ID/);
});

test("整库保存不能改项目桌；专用接口投递、重放不推进版本、撤回", async () => {
  const { app, slot, other } = await desk();
  try {
    const state = await app.workspace();
    const forged = await app.call("/workspace", { state: { ...state, projectDesk: [{ projectId: slot, inbox: [], loadout: [], next: { text: "伪造", at: AT } }] } }, "PUT");
    assert.equal(forged.status, 400);
    assert.match(forged.body.error, /项目桌只能通过/);

    const first = await app.call("/project-desk/deliver", { projectId: slot, kind: "note", id: "note-a" });
    assert.equal(first.status, 200, JSON.stringify(first.body));
    const entry = first.body.state.projectDesk[0];
    assert.equal(entry.projectId, slot);
    assert.deepEqual(entry.inbox.map(({ kind, id }) => ({ kind, id })), [{ kind: "note", id: "note-a" }]);
    const replay = await app.call("/project-desk/deliver", { projectId: slot, kind: "note", id: "note-a" });
    assert.equal(replay.body.state.revision, first.body.state.revision);
    assert.deepEqual(replay.body.state.projectDesk, first.body.state.projectDesk);

    // 整库保存带着刚读到的项目桌照常可存（只改别的字段）。
    const latest = await app.workspace();
    const unrelated = await app.call("/workspace", { state: { ...latest, notes: [...latest.notes, { id: "note-c", at: AT, text: "新便签" }] } }, "PUT");
    assert.equal(unrelated.status, 200, JSON.stringify(unrelated.body));
    assert.deepEqual(unrelated.body.projectDesk, first.body.state.projectDesk);

    assert.equal((await app.call("/project-desk/deliver", { projectId: other, kind: "note", id: "note-a" })).status, 409);
    assert.equal((await app.call("/project-desk/deliver", { projectId: slot, kind: "note", id: "missing" })).status, 404);
    assert.equal((await app.call("/project-desk/deliver", { projectId: "local-nope", kind: "note", id: "note-a" })).status, 404);
    assert.equal((await app.call("/project-desk/deliver", { projectId: slot, kind: "reverse", id: "note-a" })).status, 400);
    assert.equal((await app.call("/project-desk/deliver", { projectId: slot, kind: "note", id: "note-a", text: "正文" })).status, 400);

    const read = await app.call("/project-desk");
    assert.deepEqual(read.body.projectDesk, unrelated.body.projectDesk);
    const withdrawn = await app.call("/project-desk/withdraw", { projectId: slot, kind: "note", id: "note-a" });
    assert.deepEqual(withdrawn.body.state.projectDesk, []);
    const again = await app.call("/project-desk/withdraw", { projectId: slot, kind: "note", id: "note-a" });
    assert.equal(again.body.state.revision, withdrawn.body.state.revision);
  } finally { await app.close(); }
});

test("收藏条目可投递；收藏不存在则拒绝", async () => {
  const { app, slot } = await desk();
  try {
    const created = await app.call("/collection/notes/manual", { url: "https://example.test/dashboard", title: "6 种 dashboard 交互" });
    assert.equal(created.status, 200, JSON.stringify(created.body));
    const id = created.body.note.id;
    const ok = await app.call("/project-desk/deliver", { projectId: slot, kind: "collection", id });
    assert.equal(ok.status, 200, JSON.stringify(ok.body));
    assert.equal(ok.body.state.projectDesk[0].inbox[0].kind, "collection");
    assert.equal((await app.call("/project-desk/deliver", { projectId: slot, kind: "collection", id: "b".repeat(24) })).status, 404);
  } finally { await app.close(); }
});

test("装备固定版本：换版本覆盖、同版本重放不写、卸下；资产或版本不存在被拒绝", async () => {
  const { app, slot, asset } = await desk();
  try {
    const v1 = asset.versions[0].id;
    const equipped = await app.call("/project-desk/equip", { projectId: slot, assetId: asset.id, versionId: v1 });
    assert.equal(equipped.status, 200, JSON.stringify(equipped.body));
    assert.deepEqual(equipped.body.state.projectDesk[0].loadout.map((x) => x.versionId), [v1]);
    const replay = await app.call("/project-desk/equip", { projectId: slot, assetId: asset.id, versionId: v1 });
    assert.equal(replay.body.state.revision, equipped.body.state.revision);

    const state = await app.workspace();
    const next = revise(state.assets.find((a) => a.id === asset.id), { content: "第二版" });
    const saved = await app.call("/workspace", { state: { ...state, assets: state.assets.map((a) => (a.id === asset.id ? next : a)) } }, "PUT");
    assert.equal(saved.status, 200, JSON.stringify(saved.body));
    const upgraded = await app.call("/project-desk/equip", { projectId: slot, assetId: asset.id, versionId: current(next).id });
    assert.deepEqual(upgraded.body.state.projectDesk[0].loadout.map((x) => x.versionId), [current(next).id]);

    assert.equal((await app.call("/project-desk/equip", { projectId: slot, assetId: asset.id, versionId: "nope" })).status, 404);
    assert.equal((await app.call("/project-desk/equip", { projectId: slot, assetId: "nope", versionId: v1 })).status, 404);
    const removed = await app.call("/project-desk/unequip", { projectId: slot, assetId: asset.id });
    assert.deepEqual(removed.body.state.projectDesk, []);
  } finally { await app.close(); }
});

test("手填下一步：带修改前文字，别处改过则拒绝覆盖；清空即删除", async () => {
  const { app, slot } = await desk();
  try {
    const set = await app.call("/project-desk/next", { projectId: slot, text: " 把物料交付改读 NAS ", base: "" });
    assert.equal(set.status, 200, JSON.stringify(set.body));
    assert.equal(set.body.state.projectDesk[0].next.text, "把物料交付改读 NAS");
    const same = await app.call("/project-desk/next", { projectId: slot, text: "把物料交付改读 NAS", base: "旧的" });
    assert.equal(same.body.state.revision, set.body.state.revision);
    const stale = await app.call("/project-desk/next", { projectId: slot, text: "我的旧草稿", base: "" });
    assert.equal(stale.status, 409);
    assert.equal((await app.call("/project-desk/next", { projectId: slot, text: "多行\n内容", base: "" })).status, 400);
    const cleared = await app.call("/project-desk/next", { projectId: slot, text: "", base: "把物料交付改读 NAS" });
    assert.deepEqual(cleared.body.state.projectDesk, []);
  } finally { await app.close(); }
});

test("随手记归档与收藏归档：幂等、可撤销、对象不存在 404", async () => {
  const { app } = await desk();
  try {
    const archived = await app.call("/notes/note-a/archive", { archived: true });
    assert.equal(archived.status, 200, JSON.stringify(archived.body));
    assert.ok(archived.body.note.archivedAt);
    const replay = await app.call("/notes/note-a/archive", { archived: true });
    assert.equal(replay.body.revision, archived.body.revision);
    assert.equal(replay.body.note.archivedAt, archived.body.note.archivedAt);
    // 正文编辑保留归档标记。
    const edited = await app.call("/notes/note-a", { id: "note-a", text: "改过的正文", at: AT, base: { text: "合成需求便签" } }, "PUT");
    assert.equal(edited.body.note.archivedAt, archived.body.note.archivedAt);
    const restored = await app.call("/notes/note-a/archive", { archived: false });
    assert.equal(restored.body.note.archivedAt, undefined);
    assert.equal((await app.call("/notes/missing/archive", { archived: true })).status, 404);
    assert.equal((await app.call("/notes/note-a/archive", { archived: "yes" })).status, 400);

    const created = await app.call("/collection/notes/manual", { url: "https://example.test/a", title: "收藏" });
    const id = created.body.note.id;
    const shelved = await app.call(`/collection/notes/${id}/archive`, { archived: true });
    assert.equal(shelved.status, 200, JSON.stringify(shelved.body));
    assert.ok(shelved.body.archived[id]);
    const again = await app.call(`/collection/notes/${id}/archive`, { archived: true });
    assert.equal(again.body.revision, shelved.body.revision);
    assert.ok((await app.call("/collection/notes")).body.archived[id]);
    const back = await app.call(`/collection/notes/${id}/archive`, { archived: false });
    assert.deepEqual(back.body.archived, {});
    assert.equal((await app.call(`/collection/notes/${"c".repeat(24)}/archive`, { archived: true })).status, 404);
  } finally { await app.close(); }
});

test("继续口令留痕可带收件与装备引用；只限 start，重放必须同一内容", async () => {
  const { app, slot, asset } = await desk();
  try {
    const record = { id: "collab-relay-1", kind: "start", projectId: slot, agent: "codex", promptSha256: SHA,
      inbox: [{ kind: "note", id: "note-a" }], loadout: [{ assetId: asset.id, versionId: asset.versions[0].id }] };
    const saved = await app.call("/collab/record", record);
    assert.equal(saved.status, 200, JSON.stringify(saved.body));
    assert.deepEqual(saved.body.record.inbox, record.inbox);
    assert.equal((await app.call("/collab/record", record)).status, 200);
    assert.equal((await app.call("/collab/record", { ...record, inbox: [{ kind: "note", id: "note-b" }] })).status, 409);
    assert.equal((await app.call("/collab/record", { ...record, id: "collab-relay-2", kind: "dispatch" })).status, 400);
    assert.equal((await app.call("/collab/record", { ...record, id: "collab-relay-3", inbox: [] })).status, 400);
    assert.equal((await app.call("/collab/record", { ...record, id: "collab-relay-4", inbox: [{ kind: "note", id: "note-a", text: "正文" }] })).status, 400);
  } finally { await app.close(); }
});

test("备份恢复：恢复进空工作台带回项目桌；并入已有工作台保留当前项目桌", async () => {
  const { app, slot } = await desk();
  const dirs = [];
  try {
    await app.call("/project-desk/deliver", { projectId: slot, kind: "note", id: "note-a" });
    const exported = (await app.call("/backup")).body;
    assert.equal(exported.state.projectDesk.length, 1);
    const empty = await mkdtemp(join(tmpdir(), "stage2-restore-")); dirs.push(empty);
    const fresh = await openRepository(empty);
    try {
      const preview = await fresh.previewImport(exported);
      await fresh.importBackup(exported, preview.token);
      assert.deepEqual((await fresh.read()).projectDesk, exported.state.projectDesk);
    } finally { await fresh.close(); }

    const busy = await mkdtemp(join(tmpdir(), "stage2-merge-")); dirs.push(busy);
    const existing = await openRepository(busy);
    try {
      await existing.write(seed(), { initialize: true });
      const local = [{ projectId: "local-own", inbox: [], loadout: [], next: { text: "本机的下一步", at: AT } }];
      await existing.updateProjectDesk(() => local);
      const preview = await existing.previewImport(exported);
      await existing.importBackup(exported, preview.token);
      assert.deepEqual((await existing.read()).projectDesk, local);
    } finally { await existing.close(); }
  } finally {
    await app.close();
    for (const dir of dirs) await rm(dir, { recursive: true, force: true });
  }
});

test("去向推导：投递、已交代、孵成资产、逆向存成 Skill、收入焚决、归档；都没有即待孵化", () => {
  const hatched = makeAsset({ title: "孵出的提示词", type: "Prompt", content: "x", hatchedFrom: { kind: "collection", id: "c1" } });
  const gone = { ...makeAsset({ title: "已删", type: "Prompt", content: "x", hatchedFrom: { kind: "note", id: "n5" } }), archived: true };
  const saved = makeAsset({ title: "逆向 Skill", type: "Prompt", content: "x" });
  const state = {
    ...seed(),
    assets: [hatched, gone, saved],
    notes: [
      { id: "n1", at: AT, text: "投递了" },
      { id: "n2", at: AT, text: "炼过", refined: { scrollId: "s", entryId: "e", at: "2026-10-23T09:00:00.000Z" } },
      { id: "n3", at: AT, text: "归档", archivedAt: "2026-10-23T10:00:00.000Z" },
      { id: "n4", at: AT, text: "什么都没做" },
      { id: "n5", at: AT, text: "孵出的资产已删除" },
    ],
    scrolls: [
      { id: "s", name: "卷", pinned: false, createdAt: AT, entries: [{ id: "e", text: "正文", tags: [], uses: 0, createdAt: AT }, { id: "e2", text: "收藏来的", tags: [], uses: 0, createdAt: AT, source: { collectionId: "c2" } }] },
      { id: "s2", name: "删掉的卷", pinned: false, createdAt: AT, deletedAt: AT, entries: [{ id: "e3", text: "x", tags: [], uses: 0, createdAt: AT, source: { collectionId: "c3" } }] },
    ],
    reverseRecords: [{ id: "r1", savedSkill: { assetId: saved.id, versionId: saved.versions[0].id, at: AT } }],
    connections: { projects: [{ id: "p1", name: "牛马之家" }] },
    projectDesk: [{ projectId: "p1", inbox: [{ kind: "note", id: "n1", at: "2026-10-23T11:00:00.000Z" }, { kind: "collection", id: "c4", at: "2026-10-23T11:00:00.000Z" }], loadout: [] }],
    collabLog: [
      { kind: "start", projectId: "p1", at: "2026-10-23T10:59:00.000Z", inbox: [{ kind: "collection", id: "c4" }] },
      { kind: "start", projectId: "p1", at: "2026-10-23T12:00:00.000Z", inbox: [{ kind: "note", id: "n1" }] },
      { kind: "start", projectId: "p2", at: "2026-10-23T13:00:00.000Z", inbox: [{ kind: "collection", id: "c4" }] },
    ],
  };
  const index = captureRouteIndex(state, { collectionArchived: { c5: AT } });
  assert.deepEqual(index.routes("note", "n1"), [{ to: "project", projectId: "p1", projectName: "牛马之家", at: "2026-10-23T11:00:00.000Z", relayedAt: "2026-10-23T12:00:00.000Z" }]);
  // 早于投递的留痕、别的项目的留痕都不算交代了这次投递。
  assert.equal(index.routes("collection", "c4")[0].relayedAt, undefined);
  assert.deepEqual(pendingInbox(state, "p1").map((item) => item.id), ["c4"]);
  assert.equal(relayOf(state.collabLog, "p1", state.projectDesk[0].inbox[0]).at, "2026-10-23T12:00:00.000Z");
  assert.deepEqual(index.routes("collection", "c1").map((r) => [r.to, r.assetId]), [["asset", hatched.id]]);
  assert.deepEqual(index.routes("reverse", "r1").map((r) => [r.to, r.title]), [["asset", "逆向 Skill"]]);
  assert.deepEqual(index.routes("note", "n2").map((r) => r.to), ["scroll"]);
  assert.deepEqual(index.routes("collection", "c2").map((r) => [r.to, r.entryId]), [["scroll", "e2"]]);
  assert.deepEqual(index.routes("note", "n3").map((r) => r.to), ["archive"]);
  assert.deepEqual(index.routes("collection", "c5").map((r) => r.to), ["archive"]);
  for (const [kind, id] of [["note", "n4"], ["note", "n5"], ["collection", "c3"], ["reverse", "r2"]]) {
    assert.equal(index.pending(kind, id), true, `${kind}:${id}`);
    assert.deepEqual(index.routes(kind, id), []);
  }
  assert.equal(index.pending("note", "n1"), false);
});
