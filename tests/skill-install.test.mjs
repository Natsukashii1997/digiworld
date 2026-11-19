import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { zipSync, strToU8 } from 'fflate';
import { makeAsset, current, revise, restore, seed } from '../src/store.js';
import { validateState } from '../server/schema.mjs';
import { validateActivity } from '../server/asset-activity-schema.mjs';
import { hasSkillPackage } from '../src/design-asset.js';
import { isInstallSkill, isSelfSkill, skillInstallText, validateInstallUrl } from '../src/skill-install.js';
import { readSkillZip } from '../src/skill-package.js';
import { resolveReferences } from '../src/workflow-references.js';

const URL_ = 'https://github.com/morluto/rea/tree/main/skills/reverse-engineer-anything';
const install = () => makeAsset({ type: 'Skill', title: '逆向一切', description: '按证据解释程序行为', installUrl: URL_ });
const self = () => makeAsset({ type: 'Skill', title: '周报口径', files: [{ path: 'weekly/SKILL.md', data: '---\nname: weekly\n---\n合成', text: true }] });

test('Skill 两种来源：安装地址不带包，自建带 ZIP 包', () => {
  const a = install(), b = self();
  assert.equal(current(a).installUrl, URL_);
  assert.deepEqual(current(a).files, []);
  assert.equal(isInstallSkill(current(a)), true);
  assert.equal(isSelfSkill(a), false);
  assert.equal(hasSkillPackage(a, current(a)), false);
  assert.equal(isSelfSkill(b), true);
  assert.equal(hasSkillPackage(b, current(b)), true);
  assert.throws(() => makeAsset({ type: 'Prompt', title: 'x', content: 'y', installUrl: URL_ }), /安装地址/);
  assert.throws(() => makeAsset({ type: 'Skill', title: 'x' }), /SKILL\.md/);
});

test('安装地址只收 https 链接，不收账号密码', () => {
  assert.equal(validateInstallUrl(`  ${URL_}  `), URL_);
  for (const bad of ['', 'http://github.com/a/b', 'github.com/a/b', 'https://u:p@github.com/a/b', 'javascript:alert(1)'])
    assert.throws(() => validateInstallUrl(bad));
});

test('安装话术带名称、地址、用途和四条规则', () => {
  const text = skillInstallText(current(install()));
  assert.match(text, /把 Skill「逆向一切」装进你自己/);
  assert.match(text, new RegExp(`安装地址：${URL_.replace(/[/.]/g, '\\$&')}`));
  assert.match(text, /用途：按证据解释程序行为/);
  assert.match(text, /同名的 Skill 已经存在时，先问我要不要覆盖/);
  for (const n of [1, 2, 3, 4]) assert.match(text, new RegExp(`\\n${n}\\. `));
});

test('服务端接受安装地址形态，拒绝带包、非 Skill 与不规范地址', () => {
  const a = install();
  assert.doesNotThrow(() => validateState({ ...seed(), assets: [a, self()] }));
  const broken = (patch, type = 'Skill') => ({ ...seed(), assets: [{ ...a, type, versions: [{ ...current(a), ...patch }] }] });
  assert.throws(() => validateState(broken({ files: [{ path: 'SKILL.md', data: 'x', text: true }] })), /安装地址/);
  assert.throws(() => validateState(broken({ installUrl: 'http://x.com' })), /https/);
  assert.throws(() => validateState(broken({ installUrl: ' https://x.com/a' })), /规范链接/);
  assert.throws(() => validateState(broken({}, 'Prompt')), /安装地址/);
});

test('改版保留安装地址，恢复旧版不补媒体清单；复制记录不要求交付编号', () => {
  const a = install();
  const next = revise(a, { title: '逆向一切 2', installUrl: 'https://github.com/morluto/rea' });
  assert.equal(current(next).installUrl, 'https://github.com/morluto/rea');
  const back = restore(next, a.versions[0].id);
  assert.equal(current(back).installUrl, URL_);
  assert.equal(current(back).mediaManifest, undefined);
  assert.doesNotThrow(() => validateState({ ...seed(), assets: [back] }));
  assert.throws(() => revise(a, { files: [{ path: 'SKILL.md', data: 'x', text: true }] }), /安装地址/);
  const state = { ...seed(), assets: [a] };
  const use = { schema: 1, id: 'use-install', assetId: a.id, versionId: current(a).id, at: '2026-10-27T00:00:00.000Z', kind: 'use', action: 'copy-skill' };
  assert.doesNotThrow(() => validateActivity({ ...state, assetActivity: [use] }));
  assert.throws(() => validateActivity({ ...state, assetActivity: [{ ...use, deliveryId: 'delivery-1' }] }));
});

test('工作流不能引用只有安装地址的 Skill', () => {
  const a = install(), b = self();
  const [r1, r2] = resolveReferences({ references: [{ assetId: a.id, versionId: current(a).id }, { assetId: b.id, versionId: current(b).id }] }, [a, b]);
  assert.equal(r1.status, 'invalid-type');
  assert.equal(r2.status, 'current');
});

test('读 ZIP 略过 Mac 压缩自带的 __MACOSX 与 .DS_Store', () => {
  const bytes = zipSync({
    'weekly/SKILL.md': strToU8('---\nname: weekly\n---\n合成'),
    'weekly/.DS_Store': strToU8('x'),
    '__MACOSX/weekly/._SKILL.md': strToU8('x'),
    '.DS_Store': strToU8('x'),
  });
  const { files } = readSkillZip(bytes);
  assert.deepEqual(files.map((f) => f.path), ['weekly/SKILL.md']);
});

test('新建弹窗只给 Prompt / Design / Skill（#93）；设计图标只留画面本身', () => {
  const source = readFileSync(new URL('../src/Assets.jsx', import.meta.url), 'utf8');
  // 新建只剩三种；编辑已有的工作流、规则、MCP 时只显示它自己的类型。
  assert.match(source, /asset && !\["Prompt", "Design", "Skill"\]\.includes\(asset\.type\) \? \[asset\.type\] : \["Prompt", "Design", "Skill"\]/);
  assert.match(source, /aria-label="Skill 来源"/);
  const pixel = readFileSync(new URL('../src/pixel.jsx', import.meta.url), 'utf8');
  const block = pixel.slice(pixel.indexOf('  Design: {'), pixel.indexOf('  seal: {'));
  const rows = [...block.matchAll(/"([.KNPL]{8,})"/g)].map((m) => m[1]);
  assert.equal(rows.length, 13);
  assert.ok(rows.every((r) => r.length === 15));
  assert.ok(rows[rows.length - 1].includes('K'), '底行是边框，不是空白');
});

test('服务端记录复制：安装地址形态不要交付链接，带包 Skill 仍必须有有效链接', async () => {
  const { mkdtemp, rm } = await import('node:fs/promises');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  const { openRepository } = await import('../server/repository.mjs');
  const { createAssetActivity } = await import('../server/asset-activity.mjs');
  const directory = await mkdtemp(join(tmpdir(), 'skill-install-activity-'));
  let repository;
  try {
    repository = await openRepository(directory);
    const a = install(), b = self();
    await repository.write({ ...seed(), assets: [a, b] }, { initialize: true });
    const activity = createAssetActivity(repository, { list: async () => [] });
    const rev = async () => (await repository.read()).revision;
    const use = async (asset, extra = {}) => ({ expectedRevision: await rev(), id: `use-${asset.id}-${Object.keys(extra).length}`, assetId: asset.id, versionId: current(asset).id,
      kind: 'use', action: 'copy-skill', usedAt: '2026-10-27T00:00:00.000Z', ...extra });
    const saved = await activity.append(await use(a));
    assert.equal(saved.record.action, 'copy-skill');
    await assert.rejects(async () => activity.append(await use(b)), /交付记录身份/);
    await assert.rejects(async () => activity.append(await use(b, { deliveryId: 'missing-link' })), /安装口令链接已失效/);
  } finally {
    await repository?.close();
    await rm(directory, { recursive: true, force: true });
  }
});
