import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { mkdir, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { fixture } from './fixture.mjs';
import { seed, makeAsset, current, revise } from '../src/store.js';
import { axe } from './ui-v14-checks.mjs';

const output = resolve(process.env.ASSETS_COPY_RESULTS || 'test-results/assets-copy');
const captureOnly = process.env.ASSETS_COPY_CAPTURE_ONLY === '1';
await mkdir(output, { recursive: true });
const app = await fixture();
const prompt = makeAsset({ type: 'Prompt', title: '外层复制测试', description: '卡片摘要，不应被复制', content: '旧版本全文' });
const latestPrompt = revise(prompt, { content: '当前完整提示词\n第二行保留换行。\n末行：甲，乙 丙。' });
const rule = makeAsset({ type: 'Rule', title: '复制规则测试', content: '# 规则\n先核对当前事实，再执行。' });
const workflow = makeAsset({ type: 'Workflow', title: '复制流程测试', content: '# 固定流程\n先执行第一步。', references: [{ assetId: prompt.id, versionId: current(prompt).id }] });
await app.repository.write({ ...seed(), assets: [latestPrompt, rule, workflow], scrolls: [] }, { initialize: true });
const browser = await chromium.launch();
const errors = [], results = [];
const byName = (page, name) => page.getByRole('button', { name, exact: true });
const card = (page, title) => page.locator('.asset-card').filter({ has: byName(page, `查看 ${title}`) });
const copyButton = (page, title) => byName(page, `复制全文 ${title}`);
const readWorkspace = page => page.evaluate(async () => {
  const { token } = await (await fetch('/api/session', { headers: { 'X-Workbench-Client': '1' } })).json();
  const response = await fetch('/api/workspace', { headers: { 'X-Workbench-Token': token } });
  if (!response.ok) throw new Error(`合成主库回读失败：${response.status}`);
  return response.json();
});
const counts = async page => (await readWorkspace(page)).assetActivity.filter(r => r.kind === 'use');

try {
  for (const width of [1440, 390, 320, 375, 393, 430]) {
    const context = await browser.newContext({ viewport: { width, height: 1000 }, reducedMotion: 'reduce', permissions: ['clipboard-read', 'clipboard-write'] });
    const page = await context.newPage();
    page.on('pageerror', e => errors.push(e.message));
    await page.goto(app.url + '/#assets');
    await card(page, '外层复制测试').waitFor();
    const layout = '网格';
    assert.equal(await page.getByRole('group', { name: '视图模式', exact: true }).count(), 0, '资产仓库只保留网格');
    assert.equal(await page.locator('.asset-grid.list-layout').count(), 0, '不进入列表布局');
    if (!captureOnly) {
      const button = copyButton(page, '外层复制测试');
      assert.equal(await button.count(), 1, '资产外层提供唯一复制按钮');
      await button.scrollIntoViewIfNeeded();
      await page.mouse.move(0, 0);
      await page.locator('.page-heading h1').click();
      const style = await button.evaluate(e => ({ opacity: getComputedStyle(e).opacity, width: e.offsetWidth, height: e.offsetHeight }));
      assert.deepEqual(style, { opacity: '0', width: 32, height: 32 }, `${width}${layout}默认隐藏且统一32px`);
      await card(page, '外层复制测试').hover();
      assert.equal(await button.evaluate(e => getComputedStyle(e).opacity), '1', '移入卡片显示复制');
      const geometry = await card(page, '外层复制测试').evaluate(el => {
        const rect = e => { const r = e.getBoundingClientRect(); return { left: r.left, right: r.right, top: r.top, bottom: r.bottom }; };
        const buttons = Array.from(el.querySelectorAll('.asset-copy,.pin-button,.asset-delete')).map(rect);
        const code = rect(el.querySelector('.cover-code'));
        const overlaps = (a,b) => Math.min(a.right,b.right) > Math.max(a.left,b.left) && Math.min(a.bottom,b.bottom) > Math.max(a.top,b.top);
        return { overflow: document.documentElement.scrollWidth > innerWidth, outside: buttons.some(r => r.left < 0 || r.right > innerWidth), overlaps: buttons.some((r,i) => buttons.slice(i+1).some(s => overlaps(r,s))), codeBlocked: buttons.some(r => overlaps(r,code)) };
      });
      assert.deepEqual(geometry, { overflow: false, outside: false, overlaps: false, codeBlocked: false }, `${width}${layout}操作及序号无重叠`);
      await axe(page, `${width}${layout}外层复制`);
    }
    await page.screenshot({ path: join(output, `grid-${width}.png`), fullPage: true });
    await context.close();
    results.push({ width, layouts: 1 });
  }
  if (!captureOnly) {
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, reducedMotion: 'reduce', permissions: ['clipboard-read', 'clipboard-write'] });
    const page = await context.newPage();
    await page.goto(app.url + '/#assets');
    await copyButton(page, '外层复制测试').waitFor();
    await copyButton(page, '外层复制测试').click();
    await page.getByText('已复制到剪贴板', { exact: true }).waitFor();
    assert.equal(await page.evaluate(() => navigator.clipboard.readText()), '当前完整提示词\n第二行保留换行。\n末行：甲，乙 丙。');
    assert.equal(await page.getByRole('dialog').count(), 0, '复制不打开详情');
    await card(page, '外层复制测试').locator('.cover-uses').filter({ hasText: '1' }).waitFor();
    let uses = await counts(page);
    assert.equal(uses.length, 1);
    assert.equal(uses[0].action, 'copy-prompt');
    assert.equal(uses[0].versionId, current(latestPrompt).id);
    await page.reload(); await copyButton(page, '外层复制测试').waitFor();
    assert.equal(await card(page, '外层复制测试').locator('.cover-uses').innerText(), '1');
    await copyButton(page, '复制规则测试').focus(); await page.keyboard.press('Enter');
    await card(page, '复制规则测试').locator('.cover-uses').filter({ hasText: '1' }).waitFor();
    assert.equal(await page.evaluate(() => navigator.clipboard.readText()), '# 规则\n先核对当前事实，再执行。');
    assert.ok((await counts(page)).some(r => r.assetId === rule.id && r.action === 'copy-rule'));
    await copyButton(page, '复制流程测试').click();
    await card(page, '复制流程测试').locator('.cover-uses').filter({ hasText: '1' }).waitFor();
    const flowText = await page.evaluate(() => navigator.clipboard.readText());
    assert.match(flowText, /先执行第一步/); assert.match(flowText, /旧版本全文/);
    assert.doesNotMatch(flowText, /当前完整提示词/, '工作流固定引用不被最新版本覆盖');
    const countBeforeDenied = (await counts(page)).length;
    await page.evaluate(() => { navigator.clipboard.writeText = async () => { throw new DOMException('denied', 'NotAllowedError'); }; });
    await copyButton(page, '外层复制测试').click();
    await page.getByText('无法访问剪贴板，请选中文字后手动复制', { exact: true }).waitFor();
    assert.equal((await counts(page)).length, countBeforeDenied, '剪贴板失败不计次');
    assert.equal(await copyButton(page, '外层复制测试').isEnabled(), true, '复制失败可重试');
    await page.reload(); await copyButton(page, '外层复制测试').waitFor();
    await byName(page, '查看 外层复制测试').click();
    const detail = page.getByRole('dialog', { name: '资产详情', exact: true });
    await byName(detail, '复制全文').click();
    await detail.getByText('已使用 2 次', { exact: false }).waitFor();
    assert.equal(await page.evaluate(() => navigator.clipboard.readText()), '当前完整提示词\n第二行保留换行。\n末行：甲，乙 丙。');
    await page.keyboard.press('Escape');
    await page.evaluate(() => {
      const original = navigator.clipboard.writeText.bind(navigator.clipboard);
      window.copyWrites = 0;
      navigator.clipboard.writeText = async text => { window.copyWrites++; return original(text); };
    });
    await copyButton(page, '外层复制测试').evaluate(el => { el.click(); el.click(); });
    await card(page, '外层复制测试').locator('.cover-uses').filter({ hasText: '3' }).waitFor();
    assert.equal(await page.evaluate(() => window.copyWrites), 1, '快速重复点击仅写一次剪贴板');
    assert.equal((await counts(page)).length, 5, '快速重复点击仅计一次');
    await page.route('**/api/asset-activity**', route => route.request().method() === 'POST'
      ? route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: '合成计次失败' }) }) : route.abort('connectionreset'));
    await copyButton(page, '外层复制测试').click();
    await page.locator('.toast').getByText('全文已复制，使用记录待核对', { exact: true }).waitFor();
    assert.equal(await page.evaluate(() => navigator.clipboard.readText()), '当前完整提示词\n第二行保留换行。\n末行：甲，乙 丙。');
    assert.equal(await copyButton(page, '外层复制测试').isEnabled(), false);
    const recovery = card(page, '外层复制测试').locator('.asset-copy-recovery');
    assert.equal(await byName(recovery, '补记记录').count(), 0, '未知状态不盲目补记');
    await page.unroute('**/api/asset-activity**');
    assert.equal((await counts(page)).length, 5, '记录失败无虚假计次');
    await byName(recovery, '查询记录').click();
    await byName(recovery, '补记记录').waitFor();
    await page.waitForFunction(() => !document.querySelector('.transfer-lcd'));
    for (const [width, layout] of [[1440, '网格'], [390, '网格'], [320, '网格']]) {
      await page.setViewportSize({ width, height: 1000 });
      const bounds = await recovery.evaluate(el => ({ outside: el.getBoundingClientRect().right > innerWidth, overflow: document.documentElement.scrollWidth > innerWidth }));
      assert.deepEqual(bounds, { outside: false, overflow: false }, `${width}${layout}待核对恢复区无横溢`);
      await axe(page, `${width}${layout}待核对恢复`);
      await page.screenshot({ path: join(output, `record-failure-grid-${width}.png`), fullPage: true });
    }
    await page.setViewportSize({ width: 1440, height: 1000 });
    await byName(recovery, '补记记录').click();
    await card(page, '外层复制测试').locator('.cover-uses').filter({ hasText: '4' }).waitFor();
    assert.equal(await page.evaluate(() => window.copyWrites), 2, '补记记录不再复制剪贴板');
    assert.equal((await counts(page)).length, 6);
    const fresh = await readWorkspace(page);
    await page.route('**/api/workspace', route => route.request().method() === 'GET'
      ? route.fulfill({ contentType: 'application/json', body: JSON.stringify({ ...fresh, assets: fresh.assets.filter(a => a.id !== prompt.id) }) }) : route.continue());
    await copyButton(page, '复制流程测试').click();
    await page.locator('.toast').filter({ hasText: '引用资产已缺失' }).waitFor();
    await copyButton(page, '复制流程测试').waitFor({ state: 'visible' });
    await page.waitForFunction(() => !Array.from(document.querySelectorAll('.asset-copy')).find(b => b.getAttribute('aria-label') === '复制全文 复制流程测试')?.disabled);
    assert.equal(await page.evaluate(() => window.copyWrites), 2, '引用失效时未写入剪贴板');
    assert.equal((await counts(page)).length, 6, '引用失效未计次');
    await page.unroute('**/api/workspace');
    const failedRecords = [];
    await page.route('**/api/asset-activity**', route => {
      if (route.request().method() === 'POST') {
        failedRecords.push(route.request().postDataJSON().id);
        return route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: '合成跨入口计次失败' }) });
      }
      return route.abort('connectionreset');
    });
    await byName(page, '查看 外层复制测试').click();
    await byName(detail, '复制全文').click();
    await page.locator('.toast').getByText('全文已复制，使用记录待核对', { exact: true }).waitFor();
    await page.keyboard.press('Escape');
    assert.equal(await copyButton(page, '外层复制测试').isEnabled(), false, '详情未知记录保留，卡片不能再次复制覆盖');
    await copyButton(page, '外层复制测试').evaluate(el => el.click());
    assert.equal(failedRecords.length, 1, '切换入口不生成另一个未知记录');
    assert.equal(await page.evaluate(() => window.copyWrites), 3, '切换入口不再次复制');
    await byName(page, '查看 外层复制测试').click();
    assert.equal(await byName(detail, '复制全文').isEnabled(), false, '重新打开详情仍保留待核对门禁');
    await page.keyboard.press('Escape');
    await page.unroute('**/api/asset-activity**');
    const queriedIds = [];
    await page.route('**/api/asset-activity**', route => {
      if (route.request().method() === 'GET') queriedIds.push(new URL(route.request().url()).searchParams.get('id'));
      return route.continue();
    });
    await byName(recovery, '查询记录').click();
    await byName(recovery, '补记记录').waitFor();
    assert.ok(queriedIds.length && queriedIds.every(id => id === failedRecords[0]), '跨入口查询恢复原未知记录ID');
    await byName(recovery, '补记记录').click();
    await card(page, '外层复制测试').locator('.cover-uses').filter({ hasText: '5' }).waitFor();
    assert.equal((await counts(page)).length, 7);
    assert.equal(await page.evaluate(() => window.copyWrites), 3, '跨入口补记无需重新复制');
    await page.unroute('**/api/asset-activity**');
    await copyButton(page, '外层复制测试').dblclick({ delay: 200 });
    await page.waitForFunction(() => !Array.from(document.querySelectorAll('.asset-copy')).find(b => b.getAttribute('aria-label') === '复制全文 外层复制测试')?.disabled);
    assert.equal(await page.evaluate(() => window.copyWrites), 4, '有间隔的正常鼠标双击仅复制一次');
    assert.equal((await counts(page)).length, 8, '正常鼠标双击仅计一次');
    await page.evaluate(() => {
      window.normalCopy = navigator.clipboard.writeText.bind(navigator.clipboard);
      navigator.clipboard.writeText = text => new Promise((resolve, reject) => {
        window.releaseCopy = () => window.normalCopy(text).then(resolve, reject);
      });
    });
    await copyButton(page, '外层复制测试').click();
    await page.waitForFunction(() => typeof window.releaseCopy === 'function');
    await byName(page, '查看 外层复制测试').click();
    assert.equal(await byName(detail, '复制全文').isEnabled(), false, '卡片等待剪贴板时，详情入口共享在途门禁');
    await byName(detail, '复制全文').evaluate(el => el.click());
    assert.equal(await page.evaluate(() => window.copyWrites), 4, '另一入口不能抢先再次复制');
    await page.evaluate(() => { window.releaseCopy(); navigator.clipboard.writeText = window.normalCopy; });
    await detail.getByText('已使用 7 次', { exact: false }).waitFor();
    assert.equal(await byName(detail, '复制全文').isEnabled(), true, '卡片完成后详情入口解除门禁');
    await page.keyboard.press('Escape');
    assert.equal(await page.evaluate(() => window.copyWrites), 5);
    assert.equal((await counts(page)).length, 9);
    results.push({ path: 'current-text/no-detail/fixed-version/usage/reload/keyboard/clipboard-failure/detail-compatibility/synchronous-repeat/real-double-click/unknown-record/cross-entry-recovery/cross-entry-busy/invalid-reference', status: 'PASS' });
    await context.close();
  }
  assert.deepEqual(errors, []);
  console.log(captureOnly ? 'CAPTURE ONLY assets-copy before images; no behavior assertions' : 'PASS assets-copy: direct current全文/clipboard/usage/keyboard/failure/6-width layouts/Axe');
} finally {
  await writeFile(join(output, 'results.json'), JSON.stringify({ captureOnly, results, errors }, null, 2));
  await browser.close(); await app.close();
}
