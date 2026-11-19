import test from 'node:test';
import assert from 'node:assert/strict';
import { makeAsset, revise, restore, current, seed } from '../src/store.js';
import { validateState } from '../server/schema.mjs';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { unzipSync, strFromU8 } from 'fflate';
import { openRepository } from '../server/repository.mjs';
import { createDeliveries } from '../server/delivery.mjs';
import { createAssetActivity } from '../server/asset-activity.mjs';
import { designCopyText } from '../src/design-asset.js';

const files = () => [
  { path: 'poster/SKILL.md', text: true, mode: 0o644, data: '---\nname: poster-studio\n---\n# Poster\nUse all references.' },
  { path: 'poster/references/配色.md', text: true, mode: 0o644, data: '粉色画框，保留来源。' },
  { path: 'poster/assets/pixel.bin', text: false, mode: 0o644, data: new Uint8Array([0, 255, 128, 4]) },
  { path: 'poster/empty', text: true, mode: 0o755, directory: true, data: '' },
];
const input = (kind = 'skill') => ({ type: 'Design', title: '示例设计', content: '请生成一张留白海报。', design: { kind, skillName: 'poster-studio' }, files: kind === 'skill' ? files() : [] });

test('设计两形态可保存，切换和恢复保持固定版本的形态、指令和完整包', () => {
  const skill = makeAsset(input());
  validateState({ ...seed(), assets: [skill] });
  const prompt = revise(skill, { ...input('prompt'), content: '请画一张蓝色封面。' });
  validateState({ ...seed(), assets: [prompt] });
  assert.equal(current(prompt).design.kind, 'prompt');
  assert.equal(current(prompt).files.length, 0);
  const restored = restore(prompt, current(skill).id);
  validateState({ ...seed(), assets: [restored] });
  assert.deepEqual(current(restored).design, { kind: 'skill', skillName: 'poster-studio' });
  assert.deepEqual(current(restored).files, files());
  assert.equal(current(restored).content, '请生成一张留白海报。');
  assert.equal(current(restored).restoredFrom, current(skill).id);
  const promptAgain = restore(restored, current(prompt).id);
  assert.equal(current(promptAgain).design.kind, 'prompt');
  assert.deepEqual(current(promptAgain).files, []);
  assert.equal(current(skill).content, '请生成一张留白海报。');
});

test('设计Skill复制交付完整固定包，切为Prompt后旧交付与使用历史仍有效，过期不得补记', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'design-delivery-'));
  const repo = await openRepository(directory);
  let now = Date.now();
  const deliveries = createDeliveries(repo, () => now);
  const activity = createAssetActivity(repo, deliveries, () => now);
  try {
    const skill = makeAsset(input());
    let state = await repo.write({ ...seed(), assets: [skill] }, { initialize: true });
    const delivery = await deliveries.create({ assetId: skill.id, versionId: current(skill).id }, 'http://127.0.0.1:12345');
    assert.match(delivery.instructions, /poster-studio/);
    assert.match(delivery.instructions, /已可用.*直接/);
    assert.match(delivery.instructions, /未安装/);
    assert.match(delivery.instructions, /留白海报/);
    assert.match(delivery.instructions, /仅限本机/);
    assert.match(delivery.instructions, /准入/);
    assert.match(delivery.instructions, new RegExp(current(skill).id));
    const secret = /packages\/(.+)\.zip$/.exec(delivery.url)[1];
    const zip = unzipSync((await deliveries.download(secret)).bytes);
    assert.equal(strFromU8(zip['poster/references/配色.md']), '粉色画框，保留来源。');
    assert.deepEqual([...zip['poster/assets/pixel.bin']], [0, 255, 128, 4]);
    assert.ok(zip['poster/empty/']);
    const use = { id: randomUUID(), assetId: skill.id, versionId: current(skill).id, kind: 'use', action: 'copy-design', deliveryId: delivery.id };
    state = (await activity.append({ ...use, expectedRevision: state.revision })).state;
    const prompt = revise(state.assets[0], { ...input('prompt'), content: '蓝色封面' });
    state = await repo.write({ ...state, assets: [prompt] });
    validateState(state);
    assert.match(strFromU8(unzipSync((await deliveries.download(secret)).bytes)['poster/SKILL.md']), /# Poster/);
    await assert.rejects(deliveries.create({ assetId: prompt.id, versionId: current(prompt).id }, 'http://127.0.0.1:12345'), /Skill 包/);
    // #93 第三批：设计 Prompt 复制原样给出正文（不再包 ChatGPT 生图说明）。
    assert.equal(designCopyText(current(prompt)), '蓝色封面');
    state = (await activity.append({ id: randomUUID(), assetId: prompt.id, versionId: current(prompt).id, kind: 'use', action: 'copy-design', expectedRevision: state.revision })).state;
    assert.equal(state.assetActivity.length, 2);
    now += 600001;
    await assert.rejects(activity.append({ ...use, id: randomUUID(), expectedRevision: state.revision }), /失效/);
    assert.equal((await repo.read()).assetActivity.length, 2);
    assert.equal((await activity.query(use.id)).record.deliveryId, delivery.id);
  } finally { deliveries.close(); await repo.close(); await rm(directory, {recursive:true,force:true}); }
});

test('设计类型非法组合被服务端拒绝，失败不推进主库版本', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'design-reject-'));
  const repo = await openRepository(directory), deliveries = createDeliveries(repo), activity = createAssetActivity(repo, deliveries);
  try {
    const skill = makeAsset(input()), prompt = makeAsset(input('prompt'));
    const state = await repo.write({ ...seed(), assets: [skill, prompt] }, { initialize: true });
    const delivery = await deliveries.create({ assetId: skill.id, versionId: current(skill).id }, 'http://127.0.0.1:12345');
    for (const payload of [
      { assetId: skill.id, versionId: current(skill).id },
      { assetId: prompt.id, versionId: current(prompt).id, deliveryId: delivery.id },
      { assetId: skill.id, versionId: current(prompt).id, deliveryId: delivery.id },
    ]) {
      await assert.rejects(activity.append({ id: randomUUID(), kind: 'use', action: 'copy-design', ...payload, expectedRevision: state.revision }));
      assert.deepEqual(await repo.read(), state);
    }
    for (const change of [
      { design: { kind: 'wrong', skillName: 'poster-studio' } },
      { design: { kind: 'prompt', skillName: 'poster-studio' } },
      { design: { kind: 'skill', skillName: 'other-name' } },
      { files: [] },
      { files: [...files(), { path: 'extra/SKILL.md', text: true, data: '# extra' }] },
      { mediaManifest: {} },
    ]) {
      const malformed = structuredClone(state);
      Object.assign(current(malformed.assets[0]), change);
      await assert.rejects(repo.write(malformed));
      assert.deepEqual(await repo.read(), state);
    }
    assert.throws(() => makeAsset({ ...input('prompt'), content: ' ' }), /提示词/);
    assert.throws(() => makeAsset({ ...input('prompt'), design: {kind:'prompt', skillName:'bad name'} }), /Skill/);
  } finally { deliveries.close(); await repo.close(); await rm(directory,{recursive:true,force:true}); }
});

test('设计版本与二进制包、使用记录经JSON合并和完整备份恢复无损', async () => {
  const { stringify, parse } = await import('../src/serialization.js');
  const { mergeBackup } = await import('../server/merge.mjs');
  const { packDirectory, restoreTo } = await import('../server/full-backup.mjs');
  const parent = await mkdtemp(join(tmpdir(), 'design-backup-'));
  const directory = join(parent, 'source'), repo = await openRepository(directory);
  const deliveries = createDeliveries(repo), activity = createAssetActivity(repo, deliveries);
  let restoredRepo;
  try {
    const original = makeAsset(input());
    let state = await repo.write({...seed(), assets:[original]}, { initialize:true });
    const link = await deliveries.create({assetId:original.id,versionId:current(original).id}, 'http://127.0.0.1:12345');
    state = (await activity.append({id:randomUUID(),assetId:original.id,versionId:current(original).id,kind:'use',action:'copy-design',deliveryId:link.id,expectedRevision:state.revision})).state;
    const switched = revise(state.assets[0], input('prompt'));
    state = await repo.write({...state,assets:[restore(switched,current(original).id)]});
    const merged = mergeBackup({...seed(), assets:[]}, parse(stringify(state)));
    assert.deepEqual(merged.state.assets,state.assets);
    assert.deepEqual(merged.state.assetActivity,state.assetActivity);
    const {bytes} = await packDirectory(directory);
    const target = join(parent,'restored');
    await restoreTo(bytes,target,{current:directory});
    restoredRepo = await openRepository(target);
    const read = await restoredRepo.read();
    assert.deepEqual(read.assets,state.assets);
    assert.deepEqual(read.assetActivity,state.assetActivity);
    const again = createDeliveries(restoredRepo);
    try {
      const result = await again.create({assetId:original.id,versionId:current(read.assets[0]).id}, 'http://127.0.0.1:12345');
      assert.match(result.instructions,/poster-studio/);
    } finally { again.close(); }
  } finally { deliveries.close(); await repo.close(); await restoredRepo?.close(); await rm(parent,{recursive:true,force:true}); }
});


test('设计正文改版明确ChatGPT生图边界且只更新生图要求，不改包', async () => {
  const {buildRevisionPacket, addCandidate, adoptCandidate}=await import('../src/evolution.js');
  const asset=makeAsset(input());
  const packet=buildRevisionPacket(asset);
  assert.match(packet,/ChatGPT 的生图能力/);
  assert.doesNotMatch(packet,/调用 Skill|poster-studio/);
  assert.match(packet,/仅优化生图要求正文/);
  assert.match(packet,/不改写或安装 Skill/);
});


test('新设计无需调用名，旧Prompt调用名兼容保留但不进入复制正文', () => {
  const prompt = makeAsset({...input('prompt'), design:{kind:'prompt'}});
  const skill = makeAsset({...input(), design:{kind:'skill'}});
  validateState({...seed(),assets:[prompt,skill]});
  const legacy = makeAsset(input('prompt'));
  const oldVersion = structuredClone(current(legacy));
  assert.equal(designCopyText(current(legacy)), designCopyText(current(prompt)));
  assert.deepEqual(current(legacy), oldVersion, '复制不改写旧版本');
  const edited = revise(legacy, {...input('prompt'),design:{kind:'prompt'}});
  const restored = restore(edited,oldVersion.id);
  validateState({...seed(),assets:[restored]});
  assert.deepEqual(current(restored).design,oldVersion.design);
  assert.doesNotMatch(designCopyText(current(restored)),/Skill|poster-studio|安装|调用/);
});

test('缺name设计包自动依据入口核对身份，旧手填名不作交付身份，ChatGPT提示需手动附包', async () => {
  const directory=await mkdtemp(join(tmpdir(),'design-unnamed-'));
  const repo=await openRepository(directory), deliveries=createDeliveries(repo);
  try {
    const unnamedFiles=files();unnamedFiles[0].data='# A design package without a name';
    const unnamed=makeAsset({...input(),title:'不能猜这个标题',files:unnamedFiles,design:{kind:'skill'}});
    const legacy=makeAsset({...input(),files:unnamedFiles,design:{kind:'skill',skillName:'do-not-use-legacy-name'}});
    await repo.write({...seed(),assets:[unnamed,legacy]},{initialize:true});
    for(const asset of [unnamed,legacy]) {
      const link=await deliveries.create({assetId:asset.id,versionId:current(asset).id},'http://127.0.0.1:12345');
      assert.equal(link.name,null);
      assert.match(link.instructions,/poster\/SKILL.md/);
      assert.doesNotMatch(link.instructions,/不能猜这个标题|do-not-use-legacy-name|Skill「null」|undefined/);
      assert.match(link.instructions,/ZIP 不会随复制提示词自动上传/);
      assert.match(link.instructions,/导出完整 Skill 包/);
      assert.match(link.instructions,/ChatGPT 默认的生图能力/);
      assert.match(link.instructions,/仅在未安装时/);
      assert.doesNotMatch(link.instructions.split('【在支持本机 Skill 的 Agent 中】')[1],/ChatGPT/);
    }
  } finally {deliveries.close();await repo.close();await rm(directory,{recursive:true,force:true});}
});
