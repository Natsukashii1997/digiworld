import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { mkdir, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { fixture } from './fixture.mjs';
import { seed, makeAsset, current } from '../src/store.js';
import { createScroll, deleteScroll } from '../src/scrolls.js';
import { geometry, axe } from './ui-v14-checks.mjs';

const captureOnly = process.env.ASSETS_CAPTURE_ONLY === '1';
const checkBaseline = process.env.ASSETS_CHECK_BASELINE === '1';
const output = resolve(process.env.ASSETS_TEST_RESULTS || 'test-results/assets-warehouse');
await mkdir(output, { recursive: true });
const app = await fixture({ discovery: { skillSourceReader: () => assert.fail('本专项禁止读取真实Skill来源') } });
const browser = await chromium.launch();
const errors = [], results = [];
const button = (root, name) => root.getByRole('button', { name, exact: true }).or(root.getByRole('radio', { name, exact: true }));
const code = async (page, title) => button(page, `${title === '保留的焚决' ? '打开卷' : '查看'} ${title}`).locator('.cover-code').textContent();
function asset(type, title, day, archived = false) {
  const value = makeAsset({ type, title, content: '合成正文', source: '合成历史作者',
    files: type === 'Skill' ? [{ path: 'SKILL.md', data: '# synthetic\n合成技能', text: true }] : [],
    ...(type === 'MCP' ? { content: '', source: '个人创建', mcpConfig: { schema: 1, transport: 'streamable-http', serverId: title, origin: 'https://example.com', path: '/mcp', credentialEnvVar: null } } : {}) });
  value.archived = archived;
  value.createdAt = value.versions[0].at = `2026-10-${String(day).padStart(2, '0')}T00:00:00.000Z`;
  return value;
}
const prompt = asset('Prompt', '保留的提示词', 6);
prompt.versions[0].tags = ['已有多词 tag'];
const assets = Array.from({ length: 5 }, (_, i) => asset('Prompt', `已删除提示词${i + 1}`, i + 1, true));
assets.push(prompt);
for (const [type, name] of [['Skill', '保留的技能'], ['Workflow', '保留的工作流'], ['Rule', '保留的规则'], ['MCP', 'kept_mcp']]) {
  assets.push(asset(type, type === 'MCP' ? 'deleted_mcp' : `已删除${type}`, 1, true), asset(type, name, 7));
}
let { scrolls } = createScroll([], '已删除的焚决');
scrolls = deleteScroll(scrolls, scrolls[0].id);
scrolls = createScroll(scrolls, '保留的焚决').scrolls;
await app.repository.write({ ...seed(), assets, scrolls }, { initialize: true });
try {
  for (const width of [1440, 390, 320, 375, 393, 430]) {
    const context = await browser.newContext({ viewport: { width, height: 1000 }, reducedMotion: 'reduce' });
    const page = await context.newPage(); page.setDefaultTimeout(15000);
    page.on('pageerror', e => errors.push(e.message));
    try {
      await page.goto(app.url + '/#assets');
      await button(page, '查看 保留的提示词').waitFor();
      await page.screenshot({ path: join(output, `grid-${width}.png`), fullPage: true });
      if (!captureOnly) {
        assert.equal((await code(page, '保留的提示词')).trim(), 'PRM.01', '已删除5条后，第6条应从PRM.01开始');
        for (const [title, expected] of [['保留的技能', 'SKL.01'], ['保留的工作流', 'WFL.01'], ['保留的规则', 'RUL.01'], ['kept_mcp', 'MCP.01']]) {
          assert.equal((await code(page, title)).trim(), expected, `${title}不计删除项`);
        }
        await button(page, '打开卷 保留的焚决').click();
        const scrollDetail = page.getByRole('dialog', {name:'焚决详情',exact:true});
        assert.equal((await scrollDetail.locator('.cover-code').innerText()).trim(), 'FJ.01', '焚决详情编号不计删除项');
        await button(scrollDetail, '关闭').click();
      }
      await button(page, '新建').click();
      const dialog = page.getByRole('dialog', { name: '新建资产', exact: true });
      if (!captureOnly) {
        assert.equal(await button(dialog, 'Prompt').getAttribute('aria-checked'), 'true', '全部页默认新建Prompt');
        const picker = dialog.getByRole('radiogroup', { name: '资产类型', exact: true });
        assert.equal(await picker.getByRole('radio').count(), 7);
        assert.equal(await picker.locator('[tabindex="0"]').count(), 1);
        await button(dialog, 'Prompt').press('End');
        assert.equal(await button(dialog, '设计').getAttribute('aria-checked'), 'true');
        await button(dialog, '设计').press('Home');
        assert.equal(await button(dialog, 'Prompt').getAttribute('aria-checked'), 'true');
        assert.deepEqual(await dialog.locator('.type-picker button').allTextContents(), ['Prompt', 'Skill', '工作流', '规则', 'MCP', '焚决', '设计']);
        assert.equal(await dialog.locator('.form-intro').count(), 0, '删除通用提示及空容器');
        assert.equal(await dialog.getByRole('textbox', { name: '来源', exact: true }).count(), 0, '新建移除来源输入');
        assert.equal(await dialog.getByRole('textbox', { name: '标签', exact: true }).getAttribute('placeholder'), '用逗号或空格分隔');
        await geometry(page, '[role=dialog]', `${width}新建Prompt`);
        await axe(page, `${width}新建Prompt`);
      }
      await button(dialog, 'Prompt').click();
      await page.screenshot({ path: join(output, `new-prompt-${width}.png`), fullPage: true });
      await button(dialog, 'Skill').click();
      if (!captureOnly) {
        await geometry(page, '[role=dialog]', `${width}新建Skill`);
        await axe(page, `${width}新建Skill`);
      }
      await page.screenshot({ path: join(output, `new-skill-${width}.png`), fullPage: true });
      await page.keyboard.press('Escape'); await dialog.waitFor({ state: 'detached' });
      await button(page, '查看 保留的提示词').click();
      await button(page.getByRole('dialog', { name: '资产详情', exact: true }), '编辑资产').click();
      const editor = page.getByRole('dialog', { name: '编辑资产 · 保存为新版本', exact: true });
      await editor.waitFor();
      if (!captureOnly) {
        assert.equal(await editor.getByRole('textbox', { name: '来源', exact: true }).count(), 0, '编辑移除来源输入');
        assert.match(await editor.locator('.form-intro').textContent(), /保存后成为 v2.0/);
        await geometry(page, '[role=dialog]', `${width}编辑Prompt`);
        await axe(page, `${width}编辑Prompt`);
      }
      await page.screenshot({ path: join(output, `edit-prompt-${width}.png`), fullPage: true });
      await page.keyboard.press('Escape'); await editor.waitFor({ state: 'detached' });
      await page.keyboard.press('Escape');
      assert.equal(await page.getByRole('group', { name: '视图模式', exact: true }).count(), 0, '固定网格，移除视图切换');
      assert.equal(await page.locator('.asset-grid.list-layout').count(), 0);
      await page.screenshot({ path: join(output, `grid-after-dialog-${width}.png`), fullPage: true });
      if (checkBaseline && width === 390) await geometry(page, '.page-assets', '相同前版390资产网格');
      if (!captureOnly) {
        await geometry(page, '.asset-toolbar', `${width}资产网格控制栏`);
        await geometry(page, '.asset-heading-actions', `${width}资产搜索/新建`);
        for (const cover of await page.locator('.asset-grid .cover-code').all()) {
          const box = await cover.boundingBox();
          assert.ok(box.x >= 0 && box.x + box.width <= width, `${width}编号无裁切/溢出`);
        }
        await axe(page, `${width}资产网格`);
      }
      results.push({ width, screenshots: 5, mode: captureOnly ? 'before' : 'verified' });
    } finally { await context.close(); }
  }
  if (!captureOnly) {
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, reducedMotion: 'reduce' });
    const page = await context.newPage(); page.setDefaultTimeout(15000);
    page.on('pageerror', e => errors.push(e.message));
    const openNew = async () => {
      await button(page, '新建').click();
      const dialog = page.getByRole('dialog', { name: '新建资产', exact: true });
      await dialog.waitFor(); return dialog;
    };
    const closeDetail = async () => {
      const detail = page.getByRole('dialog', { name: '资产详情', exact: true });
      if (await detail.count()) { await page.keyboard.press('Escape'); await detail.waitFor({ state: 'detached' }); }
    };
    const savePrompt = async (title, tags = '') => {
      const dialog = await openNew();
      await dialog.getByRole('textbox', { name: '名称', exact: true }).fill(title);
      await dialog.getByRole('textbox', { name: '提示词全文', exact: true }).fill('合成新正文');
      await dialog.getByRole('textbox', { name: '标签', exact: true }).fill(tags);
      await button(dialog, '保存资产').click(); await dialog.waitFor({ state: 'detached' });
      await closeDetail(); await button(page, `查看 ${title}`).waitFor();
    };
    try {
      await page.goto(app.url + '/#assets'); await button(page, '查看 保留的提示词').waitFor();
      await savePrompt('第二条提示词', ' ,甲 乙,丙，丁　甲  乙 ， ');
      let state = await app.repository.read();
      const created = state.assets.find(a => current(a).title === '第二条提示词');
      assert.deepEqual(current(created).tags, ['甲', '乙', '丙', '丁']);
      assert.equal(current(created).source, '个人创建');
      assert.equal((await code(page, '第二条提示词')).trim(), 'PRM.02');
      for (const order of ['name', 'most', 'used', 'recent']) {
        await page.getByRole('combobox', { name: '排序方式' }).selectOption(order);
        assert.equal((await code(page, '第二条提示词')).trim(), 'PRM.02');
      }
      await page.getByRole('textbox', { name: '在资产中搜索' }).fill('第二条提示词');
      assert.equal((await code(page, '第二条提示词')).trim(), 'PRM.02', '搜索不重编号');
      await page.getByRole('textbox', { name: '在资产中搜索' }).fill('');
      await page.getByRole('combobox', { name: '按标签筛选' }).selectOption('乙');
      assert.equal((await code(page, '第二条提示词')).trim(), 'PRM.02', '标签筛选不重编号');
      await page.getByRole('combobox', { name: '按标签筛选' }).selectOption('');
      await button(page, '置顶 第二条提示词').click();
      await page.reload(); await button(page, '查看 第二条提示词').waitFor();
      assert.equal((await code(page, '第二条提示词')).trim(), 'PRM.02', '置顶/刷新不重编号');

      await button(page, '查看 保留的提示词').click();
      await button(page.getByRole('dialog', { name: '资产详情', exact: true }), '编辑资产').click();
      let editor = page.getByRole('dialog', { name: '编辑资产 · 保存为新版本', exact: true });
      await editor.getByRole('textbox', { name: '一句话说明', exact: true }).fill('只改说明');
      await button(editor, '保存新版本').click(); await editor.waitFor({ state: 'detached' }); await closeDetail();
      state = await app.repository.read();
      let revised = state.assets.find(a => a.id === prompt.id);
      assert.equal(revised.versions.length, 2);
      assert.deepEqual(revised.versions[0], prompt.versions[0], '旧版本逐字段保留');
      assert.equal(current(revised).source, '合成历史作者', '移除输入不清空历史来源');
      assert.deepEqual(current(revised).tags, ['已有多词 tag'], '未修改标签不改变原有多词标签');

      await button(page, '查看 保留的提示词').click();
      await button(page.getByRole('dialog', { name: '资产详情', exact: true }), '编辑资产').click();
      editor = page.getByRole('dialog', { name: '编辑资产 · 保存为新版本', exact: true });
      await editor.getByRole('textbox', { name: '标签', exact: true }).fill('壹 贰，壹,叁　肆');
      await button(editor, '保存新版本').click(); await editor.waitFor({ state: 'detached' }); await closeDetail();
      await page.reload(); await button(page, '查看 保留的提示词').waitFor();
      revised = (await app.repository.read()).assets.find(a => a.id === prompt.id);
      assert.deepEqual(current(revised).tags, ['壹', '贰', '叁', '肆']);
      assert.equal(current(revised).source, '合成历史作者');
      assert.equal(revised.versions.length, 3);
      await button(page, '查看 保留的提示词').click();
      assert.equal((await page.getByRole('dialog', { name: '资产详情', exact: true }).locator('.cover-code').textContent()).trim(), 'PRM.01', '详情与列表同口径');
      await closeDetail();
      await button(page, '删除 保留的提示词').click();
      await button(page, '查看 保留的提示词').waitFor({ state: 'detached' });
      assert.equal((await code(page, '第二条提示词')).trim(), 'PRM.01', '删除首项后连续编号');
      await button(page, '删除 第二条提示词').click(); await button(page, '查看 第二条提示词').waitFor({ state: 'detached' });
      await savePrompt('清空后新建提示词', '   ，,　');
      assert.equal((await code(page, '清空后新建提示词')).trim(), 'PRM.01', '全部删除再新建从01开始');
      assert.deepEqual(current((await app.repository.read()).assets.find(a => current(a).title === '清空后新建提示词')).tags, []);

      const beforeFailure = await app.repository.read();
      const draft = await openNew();
      await draft.getByRole('textbox', { name: '名称', exact: true }).fill('失败保留草稿');
      await draft.getByRole('textbox', { name: '提示词全文', exact: true }).fill('合成失败正文');
      await draft.getByRole('textbox', { name: '标签', exact: true }).fill('甲 乙，丙');
      await page.route('**/api/workspace', route => route.request().method() === 'PUT'
        ? route.fulfill({ status: 503, json: { error: '合成保存失败' } }) : route.continue());
      await button(draft, '保存资产').click();
      await draft.getByRole('alert').waitFor();
      assert.equal(await draft.getByRole('textbox', { name: '标签', exact: true }).inputValue(), '甲 乙，丙');
      assert.deepEqual(await app.repository.read(), beforeFailure, '保存失败不写主库');
      await page.unroute('**/api/workspace');
      await page.keyboard.press('Escape'); await draft.waitFor({ state: 'detached' });
      const last = await app.repository.read();
      await app.repository.write({ ...last, assets: last.assets.map(a => ({ ...a, archived: true })),
        scrolls: last.scrolls.map(s => ({ ...s, deletedAt: '2026-10-12T00:00:00.000Z' })) });
      await page.reload();
      await page.getByText('还没有符合条件的资产', { exact: true }).waitFor();
      await button(page.locator('.empty'), '新建').click();
      const emptyForm = page.getByRole('dialog', { name: '新建资产', exact: true });
      assert.equal(await button(emptyForm, 'Prompt').getAttribute('aria-checked'), 'true', '全空状态的新建入口默认Prompt');
      await page.keyboard.press('Escape'); await emptyForm.waitFor({ state: 'detached' });
      results.push({ path: 'CRUD/reload/search/sort/pin/metadata/failure', status: 'PASS' });
    } finally { await context.close(); }
  }
  assert.deepEqual(errors, []);
  console.log(captureOnly ? 'CAPTURE ONLY: six-width before screenshots; no behavior assertions'
    : 'PASS assets-warehouse: numbering/create/edit/reload/tags/source/history/failure/6-width geometry/Axe');
} finally {
  await writeFile(join(output, 'results.json'), JSON.stringify({ captureOnly, results, errors }, null, 2));
  await browser.close(); await app.close();
}
