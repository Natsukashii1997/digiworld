// 用户 2026-10-27：新建弹窗删掉 MCP、设计图标摆正；Skill 分「安装地址」与「自建 · ZIP」两种来源，自建 Skill 封面是全息构建、带「自」字印章。
// 用法：先 npx vite build --outDir <目录>，再 WORKBENCH_TEST_STATIC_ROOT=<目录> node tests/skill-install-browser.mjs
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { mkdir } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { fixture } from './fixture.mjs';
import { seed, makeAsset } from '../src/store.js';

const out = resolve(process.env.GUIJI_TEST_RESULTS || 'test-results/skill-install');
await mkdir(out, { recursive: true });
const URL_ = 'https://github.com/morluto/rea/tree/main/skills/reverse-engineer-anything';
// #93 第二批（用户 2026-11-19）：新建入口不再给 Skill，Skill 页改为只读 my-skills，原有 Skill 资产只能从全局搜索打开详情。
// 原来经新建表单生成的两种 Skill（安装地址 / 自建 · ZIP），改为预先写进合成主库，再从全局搜索打开详情去验复制、计次和自建标识。
const SKILL_MD = '---\nname: weekly\ndescription: 合成周报口径\n---\n# 周报口径\n合成正文';
const installSkill = makeAsset({ type: 'Skill', title: '逆向一切', description: '按证据解释程序行为', installUrl: URL_ });
const selfSkill = makeAsset({ type: 'Skill', title: 'weekly', description: '合成周报口径', content: SKILL_MD, files: [{ path: 'SKILL.md', data: SKILL_MD, text: true }] });
const app = await fixture();
const initial = seed();
await app.repository.write({ ...initial, assets: [...initial.assets, installSkill, selfSkill] }, { initialize: true });
const browser = await chromium.launch();
const errors = [];
try {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, timezoneId: 'Asia/Shanghai', permissions: ['clipboard-read', 'clipboard-write'] });
  const page = await context.newPage();
  page.setDefaultTimeout(12000);
  page.on('pageerror', (e) => errors.push(e.message));
  if (process.env.DEBUG_NET) page.on('response', async (r) => { if (r.request().method() !== 'GET') console.log(r.request().method(), r.url(), r.status(), (await r.text().catch(() => '')).slice(0, 300)); });
  await page.goto(app.url + '/#assets');
  await page.getByRole('button', { name: '新建', exact: true }).click();
  const form = page.locator('.asset-form');
  const types = form.getByRole('radiogroup', { name: '资产类型' }).getByRole('radio');
  // #93 第二批：新建只给 Prompt / 设计，Skill 已去掉（原「安装地址 / 自建 · ZIP」两种新建表单随之不再可达，这两段表单断言删去）。
  assert.deepEqual(await types.allInnerTexts(), ['Prompt', '设计']);
  assert.equal(await form.getByRole('radio', { name: 'Skill' }).count(), 0, '新建对话框不再有 Skill');
  const tops = await types.evaluateAll((els) => els.map((el) => Math.round(el.getBoundingClientRect().top)));
  assert.equal(new Set(tops).size, 1, `类型应在同一行：${tops}`);
  // 设计图标在按钮里上下居中
  const icon = await form.getByRole('radio', { name: '设计' }).evaluate((b) => {
    const r = b.getBoundingClientRect(), i = b.querySelector('svg').getBoundingClientRect();
    return { top: i.top - r.top, bottom: r.bottom - i.bottom };
  });
  assert.ok(Math.abs(icon.top - icon.bottom) <= 1, `设计图标应上下居中：${JSON.stringify(icon)}`);
  await page.waitForTimeout(1500);
  await page.screenshot({ path: join(out, '1-新建-只剩两类.png') });
  await form.getByRole('button', { name: '取消' }).click();
  await form.waitFor({ state: 'detached' });

  // #93 第二批：两个 Skill 资产都不在 Skill 页网格里（Skill 页只读 my-skills）。
  await page.getByRole('group', { name: '资产类型', exact: true }).getByRole('button', { name: /^Skill/ }).click();
  for (const title of ['逆向一切', 'weekly']) {
    assert.equal(await page.getByRole('button', { name: `查看 ${title}`, exact: true }).count(), 0, `${title} 不应出现在 Skill 页`);
    assert.equal(await page.locator('.asset-grid').getByText(title).count(), 0, `${title} 不应出现在 Skill 页网格`);
  }
  const detail = page.getByRole('dialog', { name: '资产详情', exact: true });
  const openViaSearch = async (title) => {
    await page.keyboard.press('Meta+k');
    await page.getByLabel('全局搜索').fill(title);
    await page.locator('.search-results[aria-busy="false"]').waitFor();
    const hits = page.getByRole('dialog', { name: '搜索工作台' }).getByRole('button', { name: new RegExp(title) });
    assert.equal(await hits.count(), 1, `${title} 搜索恰好命中一条`);
    await hits.click();
    await detail.getByRole('heading', { name: title }).waitFor();
  };

  // 安装地址形态：原在卡片上复制安装话术并读卡片次数，#93 第二批改在详情里复制、读详情的使用记录。
  await openViaSearch('逆向一切');
  // 原卡片断言「安装地址形态没有自建标识与全息蛋」改在详情里核对。
  assert.equal(await detail.locator('.self-tag').count(), 0);
  assert.equal(await detail.locator('.holo-scene').count(), 0);
  await detail.getByText('它按安装地址里的文档装好并试用一次').waitFor();
  await detail.getByRole('button', { name: '复制安装话术' }).click();
  await detail.getByRole('status').filter({ hasText: '使用记录已保存' }).waitFor();
  const text = await page.evaluate(() => navigator.clipboard.readText());
  assert.match(text, /把 Skill「逆向一切」装进你自己/);
  assert.ok(text.includes(`安装地址：${URL_}`));
  // 详情计次用滚轮数字，滚动中会同时露出新旧两位，等滚完再读。
  await page.waitForFunction(() => /^已使用1次/.test(document.querySelector('[data-testid="usage-count"]')?.innerText.replace(/\s/g, '') || ''));
  assert.equal((await app.repository.read()).assetActivity.filter((r) => r.assetId === installSkill.id && r.kind === 'use').length, 1);
  // 详情：安装地址形态不出现 ZIP 交付、文件与副本
  await page.waitForTimeout(1500);
  assert.equal(await detail.getByRole('link', { name: URL_ }).count(), 1);
  assert.equal(await detail.getByRole('tab', { name: '文件' }).count(), 0);
  assert.equal(await detail.getByRole('button', { name: '复制安装话术' }).count(), 1);
  await page.screenshot({ path: join(out, '6-详情-安装地址.png') });
  await detail.getByRole('button', { name: '关闭' }).click();
  await detail.waitFor({ state: 'hidden' });

  // 自建 · ZIP 形态：详情保留「自建」字样、全息蛋、封面印章与类型图标印章。
  // #93 第二批：Skill 页不再有这类卡片，原「卡片保留全息蛋、去掉印章」断言与卡片平时 / 悬停截图（3～5）删去。
  await openViaSearch('weekly');
  assert.equal(await detail.locator('.self-tag').innerText(), '自建');
  assert.equal(await detail.locator('.holo-scene').count(), 1);
  assert.equal(await detail.locator('.cover-seal').count(), 1);
  assert.equal(await detail.locator('.type-icon-seal').count(), 1);
  await page.waitForTimeout(1500);
  await page.screenshot({ path: join(out, '2-详情-自建.png') });
  await detail.getByRole('button', { name: '关闭' }).click();
  await detail.waitFor({ state: 'hidden' });
  assert.deepEqual(errors, []);
  console.log('skill-install-browser: 全部通过，截图在', out);
} finally {
  await browser.close();
  await app.close?.();
}
