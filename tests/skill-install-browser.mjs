// 用户 2026-10-27：新建弹窗删掉 MCP、设计图标摆正；Skill 分「安装地址」与「自建 · ZIP」两种来源，自建 Skill 封面是全息构建、带「自」字印章。
// 用法：先 npx vite build --outDir <目录>，再 WORKBENCH_TEST_STATIC_ROOT=<目录> node tests/skill-install-browser.mjs
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { mkdir, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { zipSync, strToU8 } from 'fflate';
import { fixture } from './fixture.mjs';
import { seed } from '../src/store.js';

const out = resolve(process.env.GUIJI_TEST_RESULTS || 'test-results/skill-install');
await mkdir(out, { recursive: true });
const zipPath = join(out, 'weekly.zip');
await writeFile(zipPath, zipSync({
  'weekly/SKILL.md': strToU8('---\nname: weekly\ndescription: 合成周报口径\n---\n# 周报口径\n合成正文'),
  'weekly/.DS_Store': strToU8('x'),
  '__MACOSX/weekly/._SKILL.md': strToU8('x'),
}));
const URL_ = 'https://github.com/morluto/rea/tree/main/skills/reverse-engineer-anything';
const app = await fixture();
await app.repository.write(seed(), { initialize: true });
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
  // #93（用户定稿）：新建只给 Prompt / 设计 / Skill 三种，工作流、规则、焚决已去掉。
  assert.deepEqual(await types.allInnerTexts(), ['Prompt', '设计', 'Skill']);
  const tops = await types.evaluateAll((els) => els.map((el) => Math.round(el.getBoundingClientRect().top)));
  assert.equal(new Set(tops).size, 1, `三个类型应在同一行：${tops}`);
  // 设计图标在按钮里上下居中
  const icon = await form.getByRole('radio', { name: '设计' }).evaluate((b) => {
    const r = b.getBoundingClientRect(), i = b.querySelector('svg').getBoundingClientRect();
    return { top: i.top - r.top, bottom: r.bottom - i.bottom };
  });
  assert.ok(Math.abs(icon.top - icon.bottom) <= 1, `设计图标应上下居中：${JSON.stringify(icon)}`);

  // 安装地址形态
  await form.getByRole('radio', { name: 'Skill' }).click();
  const modes = form.getByRole('radiogroup', { name: 'Skill 来源' });
  assert.equal(await modes.getByRole('radio', { name: /安装地址/ }).getAttribute('aria-checked'), 'true');
  assert.equal(await form.getByLabel('选择 Skill ZIP 文件').count(), 0);
  await form.getByLabel('名称').fill('逆向一切');
  await form.getByLabel('一句话说明').fill('按证据解释程序行为');
  await form.getByLabel('安装地址').fill(URL_);
  await page.waitForTimeout(1500);
  await page.screenshot({ path: join(out, '1-新建-安装地址.png') });
  await form.getByRole('button', { name: '保存资产' }).click();
  // #93：默认停在 Prompt 页，Skill 卡要切到 Skill 页才看得到。
  await page.getByRole('group', { name: '资产类型', exact: true }).getByRole('button', { name: /^Skill/ }).click();
  const installCard = page.locator('.asset-card').filter({ hasText: '逆向一切' });
  await installCard.waitFor();
  assert.equal(await installCard.locator('.self-tag').count(), 0);
  assert.equal(await installCard.locator('.holo-scene').count(), 0);
  await installCard.getByRole('button', { name: '复制安装话术 逆向一切' }).click();
  await page.waitForTimeout(400);
  const text = await page.evaluate(() => navigator.clipboard.readText());
  assert.match(text, /把 Skill「逆向一切」装进你自己/);
  assert.ok(text.includes(`安装地址：${URL_}`));
  await page.waitForTimeout(1500);
  assert.equal(await installCard.locator('.asset-copy-recovery').count(), 0, '复制后使用记录应已保存');
  // #93：使用次数从 .cover-uses 改为显示屏里的 .ac2-uses（形如「1次」）。
  assert.equal((await installCard.locator('.ac2-uses').innerText()).replace(/\s/g, ''), '1次', '复制一次计一次使用');

  // 自建 · ZIP 形态（等上一个的诞生动画放完）
  await page.waitForTimeout(3500);
  await page.getByRole('button', { name: '新建', exact: true }).click();
  await form.getByRole('radio', { name: 'Skill' }).click();
  await modes.getByRole('radio', { name: /自建/ }).click();
  assert.equal(await form.getByLabel('安装地址').count(), 0);
  await form.getByLabel('选择 Skill ZIP 文件').setInputFiles(zipPath);
  await form.getByText('已包含 1 个文件').waitFor();
  await page.waitForTimeout(1500);
  await page.screenshot({ path: join(out, '2-新建-自建.png') });
  await form.getByRole('button', { name: '保存资产' }).click();
  const selfCard = page.locator('.asset-card').filter({ hasText: 'weekly' });
  await selfCard.waitFor();
  // #93：定稿卡片保留全息蛋（卡片上 1 个），去掉「自建」字样、印章与类型图标印章（卡片上 0 个）；详情抽屉仍保留这几处标识。
  assert.equal(await selfCard.locator('.holo-scene').count(), 1, '卡片保留全息蛋');
  for (const mark of ['.self-tag', '.cover-seal', '.type-icon-seal']) assert.equal(await selfCard.locator(mark).count(), 0, `卡片不再显示 ${mark}`);
  await selfCard.getByRole('button', { name: '查看 weekly' }).click();
  const selfDetail = page.getByRole('dialog', { name: '资产详情' });
  assert.equal(await selfDetail.locator('.self-tag').innerText(), '自建');
  assert.equal(await selfDetail.locator('.holo-scene').count(), 1);
  assert.equal(await selfDetail.locator('.cover-seal').count(), 1);
  assert.equal(await selfDetail.locator('.type-icon-seal').count(), 1);
  await selfDetail.getByRole('button', { name: '关闭' }).click();
  await selfDetail.waitFor({ state: 'hidden' });
  await page.mouse.move(0, 0);
  await page.waitForTimeout(3500);
  const row = async (name) => {
    const a = await selfCard.boundingBox(), b = await installCard.boundingBox();
    const x = Math.min(a.x, b.x) - 8, y = Math.min(a.y, b.y) - 8;
    await page.screenshot({ path: join(out, name), clip: { x, y, width: Math.max(a.x + a.width, b.x + b.width) - x + 8, height: Math.max(a.height, b.height) + 16 } });
  };
  await selfCard.scrollIntoViewIfNeeded();
  await row('3-卡片-平时.png');
  await selfCard.hover();
  await page.waitForTimeout(1300);
  await row('4-卡片-悬停打印中.png');
  await page.waitForTimeout(900);
  await row('5-卡片-悬停真身.png');

  // 详情：安装地址形态不出现 ZIP 交付、文件与副本
  await installCard.getByRole('button', { name: '查看 逆向一切' }).click();
  const detail = page.getByRole('dialog', { name: '资产详情' });
  await detail.getByText('它按安装地址里的文档装好并试用一次').waitFor();
  await page.waitForTimeout(1500);
  assert.equal(await detail.getByRole('link', { name: URL_ }).count(), 1);
  assert.equal(await detail.getByRole('tab', { name: '文件' }).count(), 0);
  assert.equal(await detail.getByRole('button', { name: '复制安装话术' }).count(), 1);
  await page.screenshot({ path: join(out, '6-详情-安装地址.png') });
  assert.deepEqual(errors, []);
  console.log('skill-install-browser: 全部通过，截图在', out);
} finally {
  await browser.close();
  await app.close?.();
}
