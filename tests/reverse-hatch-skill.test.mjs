// 逆向工程孵蛋 3C 第 3 批（#29）：孵化成 Skill 的接口。只用合成记录和临时目录里的仓库，不读 data/。
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { seed } from '../src/store.js';
import { createSpecimen } from '../src/reverse-recipe.js';
import { editSlot } from '../src/reverse-hatch.js';
import { captureRouteIndex } from '../src/capture-routes.js';
import { createReverseSkillV4 } from '../server/reverse-skill-v4.mjs';
import { openRepository } from '../server/repository.mjs';
import { assetDeleteBlockers } from '../server/asset-delete.mjs';

const specimen = () => createSpecimen({ type: 'FN', title: '接力', target: { kind: 'web', url: 'https://app.example.test/agents', feature: 'Agent 接力', clues: ['handoff'], authorized: true } });
async function repo(records, fn) {
  const dir = await mkdtemp(join(tmpdir(), 'reverse-hatch-skill-')), repository = await openRepository(dir);
  try { const input = seed(); input.reverseRecords = records; await repository.write(input, { initialize: true }); await fn(repository); }
  finally { await repository.close(); await rm(dir, { recursive: true, force: true }); }
}
// 改一格并写回，模拟页面手改或放回结论。
async function edit(repository, id, value) {
  const state = await repository.read();
  state.reverseRecords[0].hatch = editSlot(state.reverseRecords[0], id, value);
  await repository.write(state);
}
const start = async (svc, repository, title) => svc.hatchPreview({ recordId: (await repository.read()).reverseRecords[0].id, expectedRevision: (await repository.read()).revision, title });

test('预览 → 确认 → 回读：写固定版本 Skill、来源 reverse、回执带 slotsHash；去向认得出、产出可删', async () => {
  const r = specimen();
  await repo([r], async (repository) => {
    const svc = createReverseSkillV4({ repository }), before = await repository.read();
    const p = await start(svc, repository);
    assert.equal((await repository.read()).revision, before.revision, '预览不写入');
    assert.match(p.content, /未经复刻验证/); assert.match(p.content, /## 局限（还没弄清楚）/);
    assert.deepEqual(p.files.map((f) => f.path), ['SKILL.md', 'task-pack.md', 'source.json']);
    assert.equal(p.score.full, 1);
    const done = await svc.hatchConfirm({ recordId: r.id, token: p.token, title: '接力 · 我的拆解' });
    const state = await repository.read(), asset = state.assets.find((a) => a.id === done.saved.assetId);
    assert.equal(state.assets.length, before.assets.length + 1);
    assert.equal(asset.type, 'Skill'); assert.equal(asset.versions.length, 1);
    assert.equal(done.title, '接力 · 我的拆解'); assert.match(asset.versions[0].content, /^# 接力 · 我的拆解$/m, '确认时按改过的名字生成');
    assert.deepEqual(asset.versions[0].hatchedFrom, { kind: 'reverse', id: r.id });
    assert.deepEqual(state.reverseRecords[0].hatchSkills, [done.saved]);
    assert.equal(done.saved.slotsHash, p.slotsHash); assert.equal(done.current, true); assert.equal(done.versionNo, 1);
    assert.deepEqual((await svc.hatchQuery({ recordId: r.id })).saved, done.saved, '回读');
    assert.deepEqual(captureRouteIndex(state).routes('reverse', r.id).map((x) => [x.to, x.assetId]), [['asset', asset.id]], '只算一次去向');
    assert.ok(!assetDeleteBlockers(state, asset.id).some((b) => b.kind === 'reverse'), '孵出的 Skill 不挡删除');
  });
});

test('revision 冲突拒绝：预览带旧 revision；预览后记录有别的改动，确认也拒绝', async () => {
  const r = specimen();
  await repo([r], async (repository) => {
    const svc = createReverseSkillV4({ repository }), { revision } = await repository.read();
    await assert.rejects(svc.hatchPreview({ recordId: r.id, expectedRevision: revision - 1 }), /记录已变化/);
    const p = await start(svc, repository), state = await repository.read();
    state.reverseRecords[0].why = '改了一句'; await repository.write(state);
    await assert.rejects(svc.hatchConfirm({ recordId: r.id, token: p.token }), /已变化，请重新预览/);
    assert.equal((await repository.read()).reverseRecords[0].hatchSkills, undefined);
  });
});

test('八格变化后旧预览失效；过期、乱给的 token 也拒绝', async () => {
  const r = specimen();
  await repo([r], async (repository) => {
    let time = 100; const svc = createReverseSkillV4({ repository, clock: () => time });
    let p = await start(svc, repository);
    await edit(repository, 'ui', { known: '三栏' });
    await assert.rejects(svc.hatchConfirm({ recordId: r.id, token: p.token }), /八格或记录已变化/);
    p = await start(svc, repository); time += 300001;
    await assert.rejects(svc.hatchConfirm({ recordId: r.id, token: p.token }), /预览已失效/);
    await assert.rejects(svc.hatchConfirm({ recordId: r.id, token: 'nope' }), /预览已失效/);
    await assert.rejects(svc.hatchPreview({ recordId: r.id, expectedRevision: (await repository.read()).revision, title: ' ' }), /请填写 Skill 名字/);
    assert.equal((await repository.read()).reverseRecords[0].hatchSkills, undefined);
  });
});

test('同一状态重复确认复用；八格变了再孵化给同一资产加新版本，资产归档后另建', async () => {
  const r = specimen();
  await repo([r], async (repository) => {
    const svc = createReverseSkillV4({ repository }), assets = (await repository.read()).assets.length;
    const p = await start(svc, repository);
    const [a, b] = await Promise.all([svc.hatchConfirm({ recordId: r.id, token: p.token }), svc.hatchConfirm({ recordId: r.id, token: p.token })]);
    assert.deepEqual(a.saved, b.saved);
    assert.deepEqual((await svc.hatchConfirm({ recordId: r.id, token: p.token })).saved, a.saved, '写完后再点确认也回读那一版');
    const again = await start(svc, repository);
    assert.deepEqual(again.saved, a.saved, '同一八格再预览，直接给已孵化的那一版');
    assert.equal((await repository.read()).assets.length, assets + 1);

    await edit(repository, 'flow', { known: '先复制再粘贴' });
    const stale = await svc.hatchQuery({ recordId: r.id });
    assert.equal(stale.saved, null); assert.deepEqual(stale.latest, a.saved, '八格变了：没有当前这一版，但能看到上一次');
    const v2 = await svc.hatchConfirm({ recordId: r.id, token: (await start(svc, repository)).token });
    let state = await repository.read();
    const asset = state.assets.find((x) => x.id === a.saved.assetId);
    assert.equal(v2.saved.assetId, a.saved.assetId); assert.equal(v2.versionNo, 2);
    assert.equal(asset.versions.length, 2); assert.equal(asset.versions[1].hatchedFrom, undefined, '来源只在首个版本');
    assert.equal(state.reverseRecords[0].hatchSkills.length, 2);
    assert.deepEqual((await svc.hatchQuery({ recordId: r.id, slotsHash: a.saved.slotsHash })).saved, a.saved, '旧回执仍可回读');

    state.assets = state.assets.map((x) => x.id === asset.id ? { ...x, archived: true } : x); await repository.write(state);
    await edit(repository, 'edge', { known: '只读' });
    const v3 = await svc.hatchConfirm({ recordId: r.id, token: (await start(svc, repository)).token });
    state = await repository.read();
    assert.notEqual(v3.saved.assetId, asset.id);
    assert.deepEqual(state.assets.find((x) => x.id === v3.saved.assetId).versions[0].hatchedFrom, { kind: 'reverse', id: r.id });

    // 八格没变、但那份资产被归档：不再复用，另建一份
    state.assets = state.assets.map((x) => x.id === v3.saved.assetId ? { ...x, archived: true } : x); await repository.write(state);
    const archived = await svc.hatchQuery({ recordId: r.id });
    assert.equal(archived.archived, true);
    const p4 = await start(svc, repository);
    assert.ok(p4.token, '归档后同一八格可以再预览');
    const v4 = await svc.hatchConfirm({ recordId: r.id, token: p4.token });
    assert.notEqual(v4.saved.assetId, v3.saved.assetId); assert.equal(v4.archived, false);
    assert.deepEqual((await svc.hatchQuery({ recordId: r.id })).saved, v4.saved, '回读取没归档的那一版');
  });
});

test('写入结果不明时先查询：已写入就回读那一版，再确认也不重复写', async () => {
  const r = specimen();
  await repo([r], async (repository) => {
    let lost = true;
    const flaky = { ...repository, read: () => repository.read(), async updateReverseSkill(update) { const out = await repository.updateReverseSkill(update); if (lost) { lost = false; throw new Error('连接中断'); } return out; } };
    const svc = createReverseSkillV4({ repository: flaky }), assets = (await repository.read()).assets.length;
    const p = await start(svc, repository);
    await assert.rejects(svc.hatchConfirm({ recordId: r.id, token: p.token }), /连接中断/);
    const known = await svc.hatchQuery({ recordId: r.id, slotsHash: p.slotsHash });
    assert.ok(known.saved, '查询得知已经写入');
    assert.deepEqual((await svc.hatchConfirm({ recordId: r.id, token: p.token })).saved, known.saved);
    assert.equal((await repository.read()).assets.length, assets + 1);
  });
});

test('回执指向的版本对不上：回读拒绝，不当成已孵化（仓库本身不允许改历史版本，这里在读出的数据上模拟）', async () => {
  const r = specimen();
  await repo([r], async (repository) => {
    const done = await createReverseSkillV4({ repository }).hatchConfirm({ recordId: r.id, token: (await start(createReverseSkillV4({ repository }), repository)).token }).catch(() => null);
    assert.equal(done, null, '换了服务实例，旧 token 不认');
    const svc = createReverseSkillV4({ repository }), saved = (await svc.hatchConfirm({ recordId: r.id, token: (await start(svc, repository)).token })).saved;
    const tampered = { ...repository, async read() { const state = await repository.read(), file = state.assets.find((a) => a.id === saved.assetId).versions[0].files.find((f) => f.path === 'source.json'); file.data = file.data.replace(saved.slotsHash, 'f'.repeat(64)); return state; } };
    await assert.rejects(createReverseSkillV4({ repository: tampered }).hatchQuery({ recordId: r.id }), /内容与回执不一致/);
  });
});
