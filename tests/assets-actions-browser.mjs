import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { unzipSync, strFromU8 } from 'fflate';
import { mkdir, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { fixture } from './fixture.mjs';
import { seed, makeAsset, current } from '../src/store.js';
import { createScroll, addEntry, deleteEntry } from '../src/scrolls.js';
import { axe } from './ui-v14-checks.mjs';

const output = resolve(process.env.ASSETS_ACTIONS_RESULTS || 'test-results/assets-actions');
const captureOnly = process.env.ASSETS_ACTIONS_CAPTURE_ONLY === '1';
await mkdir(output, { recursive: true });
const app = await fixture();
const prompt = makeAsset({ type: 'Prompt', title: '复制提示词', content: '提示词第一行\n第二行' });
const rule = makeAsset({ type: 'Rule', title: '复制规则', content: '# 规则\n先核对' });
const flow = makeAsset({ type: 'Workflow', title: '复制工作流', content: '# 流程\n执行步骤' });
const skillBody = '---\nname: copy-test\ndescription: 合成完整包\n---\n# 技能\n读取 references/check.md。';
const skill = makeAsset({ type: 'Skill', title: '复制完整技能', content: skillBody, files: [
  { path: 'SKILL.md', data: skillBody, text: true },
  { path: 'references/check.md', data: '# 依赖\n完整保留', text: true },
  { path: 'sample.bin', data: new Uint8Array([1,2,3]), text: false },
] });
const mcp = makeAsset({ type: 'MCP', title: 'copy_test', mcpConfig: { schema: 1, transport: 'streamable-http', serverId: 'copy_test', origin: 'https://example.com', path: '/mcp', credentialEnvVar: 'COPY_TEST_TOKEN' } });
let { scrolls, scroll } = createScroll([], '复制焚决卷');
const first = addEntry(scrolls, scroll.id, '第一条全文\n换行保留'); scrolls = first.scrolls;
const second = addEntry(scrolls, scroll.id, '第二条全文'); scrolls = second.scrolls;
const deleted = addEntry(scrolls, scroll.id, '已经删除，不应复制');
scrolls = deleteEntry(deleted.scrolls, scroll.id, deleted.entry.id);
const empty = createScroll(scrolls, '空卷'); scrolls = empty.scrolls;
await app.repository.write({ ...seed(), assets: [prompt, rule, flow, skill, mcp], scrolls }, { initialize: true });
const browser = await chromium.launch();
const errors = [], results = [];
const button = (page, name) => page.getByRole('button', { name, exact: true });
const assetCard = (page, name) => page.locator('.asset-card').filter({ has: button(page, name) });
const namedCards = ['查看 复制提示词', '查看 复制规则', '查看 复制工作流', '查看 复制完整技能', '查看 copy_test', '打开卷 复制焚决卷', '打开卷 空卷'];
const api = (page, path) => page.evaluate(async path => {
  const { token } = await (await fetch('/api/session', { headers: { 'X-Workbench-Client': '1' } })).json();
  const response = await fetch('/api' + path, { headers: { 'X-Workbench-Token': token } });
  if (!response.ok) throw new Error('合成公开回读失败：' + response.status);
  return response.json();
}, path);

try {
  for (const width of [1440, 390, 320, 375, 393, 430]) {
    const context = await browser.newContext({ viewport: { width, height: 1000 }, reducedMotion: 'reduce', permissions: ['clipboard-read', 'clipboard-write'] });
    const page = await context.newPage();
    page.on('pageerror', e => errors.push(e.message));
    await page.goto(app.url + '/#assets');
    await button(page, namedCards[0]).waitFor();
    const layout = '网格';
    assert.equal(await page.getByRole('group', { name: '视图模式', exact: true }).count(), 0, '资产仓库只保留网格');
    assert.equal(await page.locator('.asset-grid.list-layout').count(), 0, '不进入列表布局');
    await page.locator('.page-heading h1').click();
    for (const name of namedCards) {
      const card = assetCard(page, name);
      await card.scrollIntoViewIfNeeded();
      await page.mouse.move(0, 0);
      const controls = card.locator('.asset-copy,.asset-delete,.pin-button');
      if (!captureOnly) {
        assert.equal(await controls.count(), 3, name + '提供三个操作');
        const styles = await controls.evaluateAll(els => els.map(el => ({ width: el.offsetWidth, height: el.offsetHeight, opacity: getComputedStyle(el).opacity, icon: el.querySelector('svg').getBoundingClientRect().width })));
        assert.deepEqual(styles, Array(3).fill({ width: 32, height: 32, opacity: '0', icon: 14 }), name + '默认隐藏并缩小');
        await card.hover();
        assert.deepEqual(await controls.evaluateAll(els => els.map(el => getComputedStyle(el).opacity)), ['1', '1', '1'], name + '悬停显示全部操作');
        const geometry = await card.evaluate(el => {
          const rect = e => { const r = e.getBoundingClientRect(); return { left: r.left, right: r.right, top: r.top, bottom: r.bottom }; };
          const copy = rect(el.querySelector('.asset-copy')), remove = rect(el.querySelector('.asset-delete'));
          const actions = Array.from(el.querySelectorAll('.asset-copy,.asset-delete,.pin-button')).map(rect);
          const code = rect(el.querySelector('.scroll-card-title') || el.querySelector('.cover-code'));
          const overlaps = (a,b) => Math.min(a.right,b.right) > Math.max(a.left,b.left) && Math.min(a.bottom,b.bottom) > Math.max(a.top,b.top);
          return { adjacent: Math.abs(copy.top - remove.top) < 1 && Math.abs(remove.left - copy.right - 8) < 1, overflow: document.documentElement.scrollWidth > innerWidth, outside: actions.some(r => r.left < 0 || r.right > innerWidth), overlaps: actions.some((r,i) => actions.slice(i+1).some(s => overlaps(r,s))), codeBlocked: actions.some(r => overlaps(r,code)) };
        });
        assert.deepEqual(geometry, { adjacent: true, overflow: false, outside: false, overlaps: false, codeBlocked: false }, width + layout + name);
        await page.mouse.move(0, 0);
        await card.locator('.asset-copy').focus();
        assert.deepEqual(await controls.evaluateAll(els => els.map(el => getComputedStyle(el).opacity)), ['1', '1', '1'], '键盘聚焦显示三项操作');
        await page.locator('.page-heading h1').click();
      }
    }
    await page.locator('.page-heading h1').click();
    await page.mouse.move(0, 0);
    await page.screenshot({ path: join(output, `default-grid-${width}.png`), fullPage: true });
    await assetCard(page, namedCards[0]).hover();
    await page.screenshot({ path: join(output, `hover-grid-${width}.png`), fullPage: true });
    if (!captureOnly) await axe(page, width + layout + '三操作');
    await context.close(); results.push({ width, layouts: 1, cards: 7 });
  }
  if (!captureOnly) {
    const touchContext = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, reducedMotion: 'reduce' });
    const touch = await touchContext.newPage();
    await touch.goto(app.url + '/#assets'); await button(touch, namedCards[0]).waitFor();
    assert.equal(await touch.evaluate(() => matchMedia('(hover: none)').matches), true);
    assert.deepEqual(await assetCard(touch, namedCards[0]).locator('.asset-copy,.asset-delete,.pin-button').evaluateAll(els => els.map(el => getComputedStyle(el).opacity)), ['1','1','1'], '触屏无需悬停即可操作');
    await touchContext.close();

    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, reducedMotion: 'reduce', permissions: ['clipboard-read', 'clipboard-write'] });
    const page = await context.newPage(); page.on('pageerror', e => errors.push(e.message));
    await page.goto(app.url + '/#assets'); await button(page, namedCards[0]).waitFor();
    await button(page, '复制配置定义 copy_test').click();
    await assetCard(page, '查看 copy_test').locator('.cover-uses').filter({ hasText: '1' }).waitFor();
    assert.deepEqual(JSON.parse(await page.evaluate(() => navigator.clipboard.readText())), { schema: 1, transport: 'streamable-http', serverId: 'copy_test', origin: 'https://example.com', path: '/mcp', credentialEnvVar: 'COPY_TEST_TOKEN' });
    assert.equal(await page.getByRole('dialog').count(), 0, 'MCP直接复制定义，无需选目标');
    assert.equal(((await api(page, '/workspace')).connections?.agentTargets || []).length, 0, '不自行登记或选择目标');
    await button(page, '复制安装口令 复制完整技能').dblclick({ delay: 200 });
    await assetCard(page, '查看 复制完整技能').locator('.cover-uses').filter({ hasText: '1' }).waitFor();
    await page.waitForFunction(() => !Array.from(document.querySelectorAll('.asset-copy')).find(el => el.getAttribute('aria-label') === '复制安装口令 复制完整技能')?.disabled);
    const instruction = await page.evaluate(() => navigator.clipboard.readText());
    const links = await api(page, '/deliveries?assetId=' + skill.id);
    assert.equal(links.length, 1, '普通双击只创建一个Skill交付');
    assert.equal(links[0].versionId, current(skill).id);
    assert.equal(links[0].fileCount, 3);
    assert.ok(links[0].copiedAt, '实际复制的链接状态已确认');
    const packageUrl = instruction.match(/http:\/\/127\.0\.0\.1:\d+\/packages\/[a-f0-9]+\.zip/)?.[0];
    assert.ok(packageUrl, '口令包含本机完整包下载链接');
    const response = await fetch(packageUrl);
    assert.equal(response.status, 200);
    const files = unzipSync(new Uint8Array(await response.arrayBuffer()));
    assert.deepEqual(Object.keys(files).sort(), ['SKILL.md', 'references/check.md', 'sample.bin']);
    assert.equal(strFromU8(files['SKILL.md']), skillBody);
    assert.deepEqual(Array.from(files['sample.bin']), [1,2,3]);
    assert.equal(await page.getByRole('dialog').count(), 0, 'Skill直接复制口令');
    await button(page, '复制卷全文 复制焚决卷').dblclick({ delay: 200 });
    await assetCard(page, '打开卷 复制焚决卷').locator(`[data-scroll-entry-id="${first.entry.id}"] .scroll-preview-uses`).filter({ hasText: '复制 1 次' }).waitFor();
    assert.equal(await assetCard(page, '打开卷 复制焚决卷').locator(`[data-scroll-entry-id="${second.entry.id}"] .scroll-preview-uses`).innerText(), '已复制 1 次');
    assert.equal(await page.evaluate(() => navigator.clipboard.readText()), '第一条全文\n换行保留\n\n第二条全文');
    let stored = await api(page, '/workspace');
    const copiedScroll = stored.scrolls.find(s => s.id === scroll.id);
    assert.deepEqual(copiedScroll.entries.map(e => e.uses), [1,1,0], '只对复制的未删除条目计次');
    assert.equal(stored.assetActivity.length, 2, 'Skill和MCP沿用固定版本记录');
    assert.ok(stored.assetActivity.some(r => r.assetId === skill.id && r.deliveryId === links[0].id && r.action === 'copy-skill'));
    assert.ok(stored.assetActivity.some(r => r.assetId === mcp.id && r.action === 'copy-mcp-config'));
    await button(page, '复制卷全文 空卷').click();
    await page.locator('.toast').filter({ hasText: '这卷还没有可复制的内容' }).waitFor();
    assert.equal(await page.evaluate(() => navigator.clipboard.readText()), '第一条全文\n换行保留\n\n第二条全文', '空卷不覆盖剪贴板');
    const revision = stored.revision;
    await page.evaluate(() => { navigator.clipboard.writeText = async () => { throw new DOMException('denied', 'NotAllowedError'); }; });
    for (const label of ['复制配置定义 copy_test', '复制安装口令 复制完整技能', '复制卷全文 复制焚决卷']) {
      await button(page, label).click();
      await page.locator('.toast').filter({ hasText: '无法访问剪贴板' }).waitFor();
    }
    stored = await api(page, '/workspace');
    assert.equal(stored.revision, revision, '剪贴板拒绝不修改次数');
    await page.reload(); await button(page, namedCards[0]).waitFor();
    assert.equal(await assetCard(page, '打开卷 复制焚决卷').locator(`[data-scroll-entry-id="${first.entry.id}"] .scroll-preview-uses`).innerText(), '已复制 1 次', '刷新保留第一条计次');
    assert.equal(await assetCard(page, '打开卷 复制焚决卷').locator(`[data-scroll-entry-id="${second.entry.id}"] .scroll-preview-uses`).innerText(), '已复制 1 次', '刷新保留第二条计次');
    await page.route('**/api/workspace', route => route.request().method() === 'PUT' ? route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: '合成保存状态未知' }) }) : route.continue());
    await button(page, '复制卷全文 复制焚决卷').click();
    await assetCard(page, '打开卷 复制焚决卷').getByRole('status').filter({ hasText: '次数未确认' }).waitFor();
    assert.equal(await page.evaluate(() => navigator.clipboard.readText()), '第一条全文\n换行保留\n\n第二条全文');
    assert.equal((await api(page, '/workspace')).revision, revision, '保存失败不自动重放');
    results.push({ path: 'all-types/hover/focus/touch/Skill-full-package/MCP-definition/no-target/scroll-whole/live-only/empty/failure/double-click/reload', status: 'PASS' });
    await context.close();
  }
  assert.deepEqual(errors, []);
  console.log(captureOnly ? 'CAPTURE ONLY assets-actions before images' : 'PASS assets-actions: all six types, compact hover actions, direct delivery, failure, six widths');
} finally {
  await writeFile(join(output, 'results.json'), JSON.stringify({ captureOnly, results, errors }, null, 2));
  await browser.close(); await app.close();
}
