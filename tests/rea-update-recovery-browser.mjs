import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { chromium } from 'playwright';
import { fakeUpdate } from './fake-rea-update.mjs';
import { seed } from '../src/store.js';
import { axe, settle } from './ui-v14-checks.mjs';

const serverRoot = resolve(process.env.WORKBENCH_TEST_SERVER_ROOT || '.');
const { startServer } = await import(pathToFileURL(join(serverRoot, 'server/http.mjs')));
const out = process.env.WORKBENCH_TEST_OUTPUT || 'work/rea624/ui';
await fs.mkdir(out, { recursive: true });
const browser = await chromium.launch(), errors = [], results = [];
const button = (p, name) => p.getByRole('button', { name, exact: true });
async function fixture(state) {
  const directory = await fs.realpath(await fs.mkdtemp(join(tmpdir(), 'rea-recovery-ui-')));
  const fake = fakeUpdate(), file = join(directory, 'rea-updates/state.json');
  const original = JSON.stringify({ identity: 'old-directory', state, checkedAt: '2026-10-18T14:54:05.584Z', message: '合成旧网络失败' });
  await fs.mkdir(join(directory, 'rea-updates'), { mode: 0o700 });
  await fs.writeFile(file, original, { mode: 0o600 });
  let app;
  try {
    app = await startServer({ directory, port: 0, staticRoot: process.env.WORKBENCH_TEST_STATIC_ROOT || join(serverRoot, 'dist'),
      reaUpdate: fake,
      reverse: { execute: fake.execute, executeAi: async () => { throw Error('禁止真实AI'); } },
      reverseNative: { connect: async () => { throw Error('禁止真实Agent'); } },
      discovery: { defaultRoots: () => ['/synthetic/projects'], detectAgents: async () => { throw Error('禁止探测'); }, inspectAgentInventory: async () => ({ homes: [], errors: [], truncated: false }), calendarHelper: { platform: 'linux', run: async () => { throw Error('禁止日历'); } } },
    });
    const data = seed(); data.reverseRecords = []; data.assets = []; data.notes = [];
    await app.repository.write(data, { initialize: true });
    const baseline = JSON.stringify(await app.repository.read());
    return { ...app, fake, file, original, baseline, async close() { await app.close(); await fs.rm(directory, { recursive: true, force: true }); } };
  } catch (e) { await app?.close(); await fs.rm(directory, { recursive: true, force: true }); throw e; }
}
async function request(app, path) {
  const session = await fetch(app.url + '/api/session', { headers: { 'X-Workbench-Client': '1' } }).then(r => r.json());
  const response = await fetch(app.url + '/api' + path, { headers: { 'X-Workbench-Token': session.token } });
  assert.equal(response.ok, true); return response.json();
}
async function shot(p, name) {
  await settle(p); await p.screenshot({ path: join(out, name + '.png') });
  assert.equal(await p.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
  await axe(p, 'rea-recovery');
}
async function navigate(p, name) {
  if (await button(p, '打开导航').isVisible()) await button(p, '打开导航').click();
  await button(p, name).click();
  await settle(p);
}
try {
  for (const width of [1440, 390, 320]) {
    const app = await fixture('network_failed'); let context;
    try {
      context = await browser.newContext({ viewport: { width, height: 1000 }, reducedMotion: 'reduce' });
      const p = await context.newPage(); p.setDefaultTimeout(8000); p.on('pageerror', e => errors.push(e.message));
      await p.route('**/*', r => { assert.equal(new URL(r.request().url()).origin, new URL(app.url).origin); return r.continue(); });
      await p.goto(app.url + '/#settings');
      await p.getByRole('group', { name: 'REA取证工具' }).waitFor();
      assert.equal((await request(app, '/reverse/update')).state, 'idle', '旧网络失败不能恢复成结果未知');
      await button(p, '检查更新').waitFor();
      assert.equal(await p.getByRole('dialog', { name: 'REA 更新预演' }).count(), 0);
      await shot(p, 'recovered-' + width);
      await p.reload(); await button(p, '检查更新').waitFor();
      assert.equal(await p.getByRole('dialog', { name: 'REA 更新预演' }).count(), 0);
      await navigate(p, '世界总览'); await navigate(p, '设置');
      await button(p, '检查更新').waitFor();
      assert.equal(await p.getByRole('dialog', { name: 'REA 更新预演' }).count(), 0);
      assert.equal(await fs.readFile(app.file, 'utf8'), app.original);
      assert.equal(app.fake.control.network, 0); assert.equal(app.fake.control.yes, 0);
      app.fake.control.mode = 'network'; await button(p, '检查更新').click();
      await p.getByText('合成网络不可达', { exact: true }).waitFor();
      app.fake.control.mode = 'ok'; await button(p, '重新检查').click();
      await p.getByText('发现正式新版本；先预演再确认', { exact: true }).waitFor();
      await button(p, '关闭预演').click(); await button(p, '一键更新').click();
      await button(p, '确认更新').waitFor(); assert.equal(app.fake.control.yes, 0);
      await shot(p, 'new-preview-' + width);
      await button(p, '确认更新').scrollIntoViewIfNeeded();
      assert.equal(await button(p, '确认更新').evaluate(e => {
        const r = e.getBoundingClientRect();
        return r.width >= 43.5 && r.height >= 43.5 && e.contains(document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2));
      }), true);
      await shot(p, 'new-preview-bottom-' + width);
      await button(p, '确认更新').click();
      await p.getByText('两客户端及Skill版本已对齐。请重启Claude Code和Codex。', { exact: true }).waitFor();
      assert.equal(app.fake.control.yes, 1);
      assert.equal(JSON.stringify(await app.repository.read()), app.baseline);
      results.push({ width, recoveredWithoutPopup: true, reloadAndReentry: true, noAutomaticCheckOrWrite: true, explicitRetryPreviewConfirm: true, businessDataUnchanged: true });
    } finally { await context?.close(); await app.close(); }
  }
  const app = await fixture('writing'); let context;
  try {
    context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, reducedMotion: 'reduce' });
    const p = await context.newPage(); p.setDefaultTimeout(8000); p.on('pageerror', e => errors.push(e.message));
    await p.route('**/*', r => { assert.equal(new URL(r.request().url()).origin, new URL(app.url).origin); return r.continue(); });
    await p.goto(app.url + '/#settings'); const dialog = p.getByRole('dialog', { name: 'REA 更新预演' }); await dialog.waitFor();
    assert.equal((await request(app, '/reverse/update')).state, 'unknown');
    const queryResponse = p.waitForResponse(r => r.url().endsWith('/api/reverse/update/query') && r.request().method() === 'POST');
    await button(dialog, '查询结果').click();
    const response = await queryResponse;
    assert.equal(response.ok(), false);
    const error = (await response.json()).error;
    assert.equal(error, '本地服务处理失败，数据未被静默重置。');
    await p.getByRole('alert').waitFor();
    assert.equal(await p.getByRole('alert').textContent(), error);
    assert.equal((await request(app, '/reverse/update')).state, 'unknown');
    assert.equal(await button(p, '确认更新').count(), 0); assert.equal(app.fake.control.yes, 0); assert.equal(app.fake.control.network, 0);
    assert.equal(await fs.readFile(app.file, 'utf8'), app.original);
    await shot(p, 'unresolved-protected');
    results.push({ realUnresolvedStillVisible: true, foreignWriteNotReplayed: true });
  } finally { await context?.close(); await app.close(); }
  assert.deepEqual(errors, []);
  await fs.writeFile(join(out, 'results.json'), JSON.stringify({ results, errors }, null, 2));
  console.log('REA recovery: three widths, initial/reload/reentry, explicit retry-preview-confirm, unresolved guard, business data and axe passed; synthetic only');
} finally { await browser.close(); }
