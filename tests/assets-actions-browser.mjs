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
// #93：资产仓库只剩 Prompt / Design / Skill 三页，补一份 Design 让三页各有一张卡；规则、工作流、MCP、焚决只保留数据，用来断言它们不在资产仓库出现。
const design = makeAsset({ type: 'Design', title: '复制设计稿', content: '16 色像素风封面', design: { kind: 'prompt' } });
let { scrolls, scroll } = createScroll([], '复制焚决卷');
const first = addEntry(scrolls, scroll.id, '第一条全文\n换行保留'); scrolls = first.scrolls;
const second = addEntry(scrolls, scroll.id, '第二条全文'); scrolls = second.scrolls;
const deleted = addEntry(scrolls, scroll.id, '已经删除，不应复制');
scrolls = deleteEntry(deleted.scrolls, scroll.id, deleted.entry.id);
const empty = createScroll(scrolls, '空卷'); scrolls = empty.scrolls;
await app.repository.write({ ...seed(), assets: [prompt, rule, flow, skill, mcp, design], scrolls }, { initialize: true });
const browser = await chromium.launch();
const errors = [], results = [];
const button = (page, name) => page.getByRole('button', { name, exact: true });
const assetCard = (page, name) => page.locator('.asset-card').filter({ has: button(page, name) });
// #93：每张卡先切到所在页签；原来的规则、工作流、MCP、焚决卡已从资产仓库去掉，改列入 hiddenCards 断言不出现。
// #93 第二批：Skill 页改为只读 my-skills（fixture 下为空），Skill 资产「复制完整技能」不再有卡片，从 namedCards 移到 hiddenCards；
// 它的复制口令、计次、双击、剪贴板拒绝改在详情抽屉里验（从全局搜索打开）。卡片上的置顶 / 删除 / 常驻三操作对它已不适用，去掉。
const namedCards = [['查看 复制提示词', 'Prompt', '复制全文'], ['查看 复制设计稿', 'Design', '复制全文']];
const hiddenCards = ['查看 复制完整技能', '查看 复制规则', '查看 复制工作流', '查看 copy_test', '打开卷 复制焚决卷', '打开卷 空卷'];
const ALL_TABS = ['Prompt', 'Design', 'Skill'];
const typeTab = (page, name) => page.getByRole('group', { name: '资产类型', exact: true }).getByRole('button', { name: new RegExp('^' + name) });
const skillDetail = page => page.getByRole('dialog', { name: '资产详情', exact: true });
// #93 第二批：Skill 资产只能从全局搜索打开详情。
async function openSkillDetail(page) {
  await page.keyboard.press('Meta+k');
  await page.getByLabel('全局搜索').fill('复制完整技能');
  await page.locator('.search-results[aria-busy="false"]').waitFor();
  await page.getByRole('dialog', { name: '搜索工作台' }).getByRole('button', { name: /复制完整技能/ }).click();
  await skillDetail(page).getByRole('region', { name: '使用记录与反馈' }).waitFor();
}
async function closeSkillDetail(page) {
  await skillDetail(page).getByRole('button', { name: '关闭', exact: true }).click();
  await skillDetail(page).waitFor({ state: 'hidden' });
}
const detailUses = (page, n) => page.waitForFunction(n => new RegExp('^已使用' + n + '次').test(document.querySelector('[data-testid="usage-count"]')?.innerText.replace(/\s/g, '') || ''), n);
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
    await button(page, namedCards[0][0]).waitFor();
    const layout = '网格';
    assert.equal(await page.getByRole('group', { name: '视图模式', exact: true }).count(), 0, '资产仓库只保留网格');
    assert.equal(await page.locator('.asset-grid.list-layout').count(), 0, '不进入列表布局');
    // #93：页签只剩三个，默认选中 Prompt。
    assert.deepEqual((await page.getByRole('group', { name: '资产类型', exact: true }).getByRole('button').allInnerTexts()).map(t => t.replace(/\s+\d+$/, '').trim()), ['Prompt', 'Design', 'Skill'], width + '只剩三页');
    assert.equal(await typeTab(page, 'Prompt').getAttribute('aria-pressed'), 'true', width + '默认 Prompt');
    await page.locator('.page-heading h1').click();
    for (const [name, tab, copyLabel] of namedCards) {
      await typeTab(page, tab).click();
      const card = assetCard(page, name);
      await card.scrollIntoViewIfNeeded();
      await page.mouse.move(0, 0);
      // #93：卡片操作改为右上置顶、删除（30×30）+ 底部带字复制，三项常驻，不再悬停才出现。
      const controls = card.locator('.pin-button,.asset-delete,.asset-copy-labeled');
      if (!captureOnly) {
        assert.equal(await controls.count(), 3, name + '提供三个操作');
        assert.equal(await card.locator('.asset-copy').count(), 0, name + '旧的图标式复制按钮已去掉');
        const styles = await controls.evaluateAll(els => els.map(el => ({ cls: el.className.split(' ')[0], width: el.offsetWidth, height: el.offsetHeight, opacity: getComputedStyle(el).opacity, icon: el.querySelector('svg').getBoundingClientRect().width })));
        assert.deepEqual(styles.map(({ width, ...rest }) => rest.cls === 'asset-copy-labeled' ? rest : { ...rest, width }), [
          { cls: 'pin-button', width: 30, height: 30, opacity: '1', icon: 14 },
          { cls: 'asset-delete', width: 30, height: 30, opacity: '1', icon: 14 },
          { cls: 'asset-copy-labeled', height: 36, opacity: '1', icon: 14 },
        ], name + '默认常驻显示');
        assert.equal(await card.locator('.asset-copy-labeled').innerText(), copyLabel, name + '复制按钮带字');
        await card.hover();
        assert.deepEqual(await controls.evaluateAll(els => els.map(el => getComputedStyle(el).opacity)), ['1', '1', '1'], name + '悬停显示全部操作');
        // #93：编号 .cover-code 已去掉；改查置顶与删除并排（间距 6px），三项不越界、不互相重叠，也不遮住状态标识、使用次数、分类标签和标题。
        const geometry = await card.evaluate(el => {
          const rect = e => { const r = e.getBoundingClientRect(); return { left: r.left, right: r.right, top: r.top, bottom: r.bottom }; };
          const pin = rect(el.querySelector('.pin-button')), remove = rect(el.querySelector('.asset-delete'));
          const actions = Array.from(el.querySelectorAll('.pin-button,.asset-delete,.asset-copy-labeled')).map(rect);
          const marks = Array.from(el.querySelectorAll('.ac2-badge,.ac2-uses,.ac2-cat,h3')).map(rect);
          const overlaps = (a,b) => Math.min(a.right,b.right) > Math.max(a.left,b.left) && Math.min(a.bottom,b.bottom) > Math.max(a.top,b.top);
          return { adjacent: Math.abs(pin.top - remove.top) < 1 && Math.abs(remove.left - pin.right - 6) < 1, overflow: document.documentElement.scrollWidth > innerWidth, outside: actions.some(r => r.left < 0 || r.right > innerWidth), overlaps: actions.some((r,i) => actions.slice(i+1).some(s => overlaps(r,s))), codeBlocked: actions.some(r => marks.some(m => overlaps(r,m))) };
        });
        assert.deepEqual(geometry, { adjacent: true, overflow: false, outside: false, overlaps: false, codeBlocked: false }, width + layout + name);
        await page.mouse.move(0, 0);
        await card.locator('.asset-copy-labeled').focus();
        assert.deepEqual(await controls.evaluateAll(els => els.map(el => getComputedStyle(el).opacity)), ['1', '1', '1'], '键盘聚焦显示三项操作');
        await page.locator('.page-heading h1').click();
      }
    }
    // #93：规则、工作流、MCP、焚决不在任何一页出现；#93 第二批：Skill 资产也不在任何一页（含 Skill 页）出现。
    if (!captureOnly) for (const tab of ALL_TABS) {
      await typeTab(page, tab).click();
      for (const name of hiddenCards) assert.equal(await button(page, name).count(), 0, width + tab + '页不应出现' + name);
    }
    await typeTab(page, 'Prompt').click();
    await page.locator('.page-heading h1').click();
    await page.mouse.move(0, 0);
    await page.screenshot({ path: join(output, `default-grid-${width}.png`), fullPage: true });
    await assetCard(page, namedCards[0][0]).hover();
    await page.screenshot({ path: join(output, `hover-grid-${width}.png`), fullPage: true });
    if (!captureOnly) await axe(page, width + layout + '三操作');
    await context.close(); results.push({ width, layouts: 1, cards: namedCards.length }); // #93 第二批：Prompt / Design 各一张卡，Skill 页无资产卡
  }
  if (!captureOnly) {
    const touchContext = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, reducedMotion: 'reduce' });
    const touch = await touchContext.newPage();
    await touch.goto(app.url + '/#assets'); await button(touch, namedCards[0][0]).waitFor();
    assert.equal(await touch.evaluate(() => matchMedia('(hover: none)').matches), true);
    // #93：复制按钮改为 .asset-copy-labeled
    assert.deepEqual(await assetCard(touch, namedCards[0][0]).locator('.asset-copy-labeled,.asset-delete,.pin-button').evaluateAll(els => els.map(el => getComputedStyle(el).opacity)), ['1','1','1'], '触屏无需悬停即可操作');
    await touchContext.close();

    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, reducedMotion: 'reduce', permissions: ['clipboard-read', 'clipboard-write'] });
    const page = await context.newPage(); page.on('pageerror', e => errors.push(e.message));
    await page.goto(app.url + '/#assets'); await button(page, namedCards[0][0]).waitFor();
    // #93：MCP 卡已不在资产仓库，原「复制配置定义」改为断言它不出现；数据仍在（不登记目标的断言保留）。
    assert.equal(await button(page, '复制配置定义 copy_test').count(), 0, 'MCP 不在资产仓库提供复制');
    assert.equal(((await api(page, '/workspace')).connections?.agentTargets || []).length, 0, '不自行登记或选择目标');
    // #93：Design 卡直接复制并计次（替代原 MCP 直接复制路径，保留「各类型卡片直接复制、无需弹窗」的意图）。
    // #93 第三批：设计 Prompt 改为「复制全文」原样复制；设计卡按定稿不显示次数，改查读屏文字「使用 N 次」。
    await typeTab(page, 'Design').click();
    await button(page, '复制全文 复制设计稿').click();
    await assetCard(page, '查看 复制设计稿').locator('.sr-only').filter({ hasText: '使用 1 次' }).waitFor();
    assert.equal(await page.evaluate(() => navigator.clipboard.readText()), '16 色像素风封面');
    assert.equal(await page.getByRole('dialog').count(), 0, 'Design直接复制，无需选目标');
    // #93 第二批：原在 Skill 卡上双击「复制安装口令」并读卡片次数，改为先断言 Skill 页没有它，再从全局搜索打开详情，
    // 双击详情里的「复制本机安装口令」，读详情「使用记录与反馈」的次数。
    // 详情的复制按钮同样忽略双击里的第二下（#93 第二批补上，与卡片一致），所以双击只生成一个交付、计一次。
    await typeTab(page, 'Skill').click();
    assert.equal(await button(page, '查看 复制完整技能').count(), 0, 'Skill 资产不在 Skill 页');
    await openSkillDetail(page);
    await skillDetail(page).getByRole('button', { name: '复制本机安装口令', exact: true }).dblclick();
    await detailUses(page, 1);
    await skillDetail(page).getByRole('button', { name: '复制本机安装口令', exact: true }).waitFor();
    await page.waitForFunction(() => !Array.from(document.querySelectorAll('[role=dialog] button')).find(el => el.textContent.trim() === '复制本机安装口令')?.disabled);
    const instruction = await page.evaluate(() => navigator.clipboard.readText());
    const links = await api(page, '/deliveries?assetId=' + skill.id);
    assert.equal(links.length, 1, '双击只创建一个Skill交付');
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
    // #93 第二批：复制在详情抽屉里完成，除详情外不弹出其他对话框（不选目标）。
    assert.equal(await page.getByRole('dialog').count(), 1, 'Skill直接复制口令');
    await closeSkillDetail(page);
    // #93：焚决卷不在资产仓库，原「复制卷全文 / 空卷 / 卷计次」三段改为断言卷的复制入口不出现、卷数据不被动过。
    for (const tab of ['Prompt', 'Design', 'Skill']) {
      await typeTab(page, tab).click();
      for (const label of ['复制卷全文 复制焚决卷', '复制卷全文 空卷']) assert.equal(await button(page, label).count(), 0, tab + '页不应出现' + label);
    }
    await typeTab(page, 'Skill').click();
    let stored = await api(page, '/workspace');
    assert.deepEqual(stored.scrolls.find(s => s.id === scroll.id).entries.map(e => e.uses), [0,0,0], '焚决卷计次不被改动');
    assert.equal(stored.assetActivity.length, 2, 'Skill和Design沿用固定版本记录');
    assert.ok(stored.assetActivity.some(r => r.assetId === skill.id && r.deliveryId === links[0].id && r.action === 'copy-skill'));
    assert.ok(stored.assetActivity.some(r => r.assetId === design.id && r.action === 'copy-design'));
    const revision = stored.revision;
    await page.evaluate(() => { navigator.clipboard.writeText = async () => { throw new DOMException('denied', 'NotAllowedError'); }; });
    // #93：剪贴板拒绝改用三页的复制按钮验证（原为 MCP / Skill / 焚决卷）。
    for (const [tab, label] of [['Prompt', '复制全文 复制提示词'], ['Design', '复制全文 复制设计稿']]) {
      await typeTab(page, tab).click();
      await button(page, label).click();
      await page.locator('.toast').filter({ hasText: '无法访问剪贴板' }).last().waitFor();
    }
    // #93 第二批：Skill 的剪贴板拒绝改在详情里验，详情给出「复制失败」提示（不是卡片的 toast）。
    await openSkillDetail(page);
    await skillDetail(page).getByRole('button', { name: '复制本机安装口令', exact: true }).click();
    await skillDetail(page).getByRole('alert').filter({ hasText: '复制失败' }).waitFor();
    await closeSkillDetail(page);
    stored = await api(page, '/workspace');
    assert.equal(stored.revision, revision, '剪贴板拒绝不修改次数');
    // #93：刷新后保留计次，原查焚决卷条目，改查 Design 卡上的 .ac2-uses；#93 第二批：Skill 改查详情里的次数。
    await page.reload(); await button(page, namedCards[0][0]).waitFor();
    await openSkillDetail(page);
    assert.match((await skillDetail(page).getByTestId('usage-count').innerText()).replace(/\s/g, ''), /^已使用1次/, '刷新保留 Skill 计次');
    await closeSkillDetail(page);
    await typeTab(page, 'Design').click();
    assert.equal((await assetCard(page, '查看 复制设计稿').locator('.sr-only').textContent()).replace(/\s/g, ''), '使用1次', '刷新保留 Design 计次');
    results.push({ path: 'three-tabs/hidden-types/always-on/focus/touch/Skill-full-package/Design-prompt/no-target/clipboard-denied/single-click-detail/reload', status: 'PASS' }); // #93（第二批：Skill 路径改在详情里）
    await context.close();
  }
  assert.deepEqual(errors, []);
  console.log(captureOnly ? 'CAPTURE ONLY assets-actions before images' : 'PASS assets-actions: three tabs (Prompt/Design/Skill), hidden types and Skill assets absent, always-on actions, direct delivery (Skill via search detail), failure, six widths');
} finally {
  await writeFile(join(output, 'results.json'), JSON.stringify({ captureOnly, results, errors }, null, 2));
  await browser.close(); await app.close();
}
