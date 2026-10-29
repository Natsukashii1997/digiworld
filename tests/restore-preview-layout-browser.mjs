// Real ZIP upload -> restore preview. Check clipping, not just DOM visibility.
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import AxeBuilder from '@axe-core/playwright';
import { mkdir, mkdtemp, writeFile, readFile, rm, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { fixture } from './fixture.mjs';
import { openSettingsDrawer } from './settings-entry.mjs';
import { seed } from '../src/store.js';
import { packDirectory } from '../server/full-backup.mjs';

const app = await fixture();
const source = await mkdtemp(join(tmpdir(), 'restore-layout-source-'));
const out = process.env.GUIJI_TEST_RESULTS || 'test-results/restore-preview-layout';
await mkdir(out, { recursive: true });
await app.repository.write(seed(), { initialize: true });
await writeFile(join(source, 'synthetic.txt'), 'Synthetic restore preview only.');
const { bytes } = await packDirectory(source);
const browser = await chromium.launch();
const errors = [];
const reports = [];
async function checkPreview(page, dialog, label) {
  const summary = dialog.locator('.backup-summary');
  const geometry = await summary.evaluate(summary => {
    const rect = element => {
      const r = element.getBoundingClientRect();
      return { top: r.top, bottom: r.bottom, left: r.left, right: r.right, height: r.height };
    };
    return {
      summary: rect(summary), clientHeight: summary.clientHeight, scrollHeight: summary.scrollHeight,
      rows: [...summary.children].map(row => ({ ...rect(row), label: row.textContent,
        content: [...row.children].map(rect) })),
    };
  });
  reports.push({ label, ...geometry });
  await writeFile(join(out, 'geometry.json'), JSON.stringify(reports, null, 2));
  await page.screenshot({ path: join(out, `${label}.png`) });
  assert.equal(geometry.rows.length, 4);
  assert.ok(geometry.scrollHeight <= geometry.clientHeight + 1,
    `${label} 统计框裁切：内容 ${geometry.scrollHeight}px，容器 ${geometry.clientHeight}px`);
  for (const row of geometry.rows) {
    assert.ok(row.top >= geometry.summary.top - 1 && row.bottom <= geometry.summary.bottom + 1,
      `${label} 统计行被裁切：${row.label}`);
    for (const content of row.content) assert.ok(content.top >= row.top - 1 && content.bottom <= row.bottom + 1 &&
      content.left >= row.left - 1 && content.right <= row.right + 1, `${label} 统计文字溢出：${row.label}`);
  }
  const body = dialog.locator('.full-backup-restore-body');
  for (const row of await summary.locator(':scope > div').all()) {
    await row.scrollIntoViewIfNeeded();
    const visible = await row.evaluate(element => {
      const r = element.getBoundingClientRect(), b = element.closest('.full-backup-restore-body').getBoundingClientRect();
      return r.top >= b.top - 1 && r.bottom <= b.bottom + 1;
    });
    assert.ok(visible, `${label} 滚动后统计行仍被正文边界遮挡`);
  }
  await body.locator(':scope > p').last().scrollIntoViewIfNeeded();
  const bounds = await body.evaluate(b => ({ client: b.clientHeight, scroll: b.scrollHeight, top: b.scrollTop }));
  assert.ok(bounds.scroll <= bounds.client + 1 || bounds.top > 0, `${label} 正文不能滚动到底部`);
  for (const name of ['取消', '恢复到新目录']) {
    const box = await dialog.getByRole('button', { name, exact: true }).boundingBox();
    const d = await dialog.boundingBox();
    assert.ok(box.width >= 44 && box.height >= 44 && box.y >= d.y && box.y + box.height <= d.y + d.height + 1 &&
      box.y + box.height <= page.viewportSize().height + 1, `${label} ${name}不可达`);
  }
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${label} 横向溢出`);
  await dialog.getByRole('button', { name: '取消', exact: true }).focus();
  await page.keyboard.press('Tab');
  assert.ok(await dialog.getByRole('button', { name: '恢复到新目录', exact: true }).evaluate(e => e === document.activeElement), `${label} 键盘焦点路径`);
  await body.evaluate(b => b.scrollTop = 0);
  console.log('PASS', label, 'four readable rows, body scroll, actions and keyboard');
}
try {
  const context = await browser.newContext({ viewport: { width: 1440, height: 800 }, reducedMotion: 'reduce' });
  const page = await context.newPage();
  page.on('pageerror', e => errors.push(e.message));
  await page.route('**/*', route => {
    assert.equal(new URL(route.request().url()).origin, app.url, 'isolated fixture only');
    return route.continue();
  });
  await page.goto(app.url + '/#settings');
  await openSettingsDrawer(page, '数据与备份');
  await page.getByLabel('选择完整备份文件').setInputFiles({ name: 'synthetic.zip', mimeType: 'application/zip', buffer: Buffer.from(bytes) });
  const dialog = page.getByRole('dialog', { name: '完整备份恢复预览' });
  await dialog.waitFor();
  await checkPreview(page, dialog, 'short-1440x800');
  const firstTarget = await dialog.locator('code.storage-path').innerText();
  await dialog.getByRole('button', { name: '取消', exact: true }).click();
  assert.equal(await dialog.count(), 0);
  await assert.rejects(stat(firstTarget), { code: 'ENOENT' });

  // All four categories, long Chinese/English paths and expanded details.
  for (const [name, content] of [['same.txt', 'same'], ['conflict.txt', 'old']]) await writeFile(join(source, name), content);
  await writeFile(join(app.directory, 'same.txt'), 'same');
  await writeFile(join(app.directory, 'conflict.txt'), 'changed');
  const longName = '这是用于检验恢复预览换行的合成目录名称';
  await mkdir(join(source, longName));
  await mkdir(join(app.directory, longName));
  for (let i = 0; i < 18; i++) {
    await writeFile(join(source, longName, `added-${i}-long-english-path-without-spaces.txt`), 'synthetic');
    await writeFile(join(app.directory, longName, `missing-${i}-合成缺失文件.txt`), 'synthetic');
  }
  const longZip = await packDirectory(source);
  const before = await readFile(join(app.directory, 'CURRENT.json'), 'utf8');
  await page.getByLabel('选择完整备份文件').setInputFiles({ name: 'long-synthetic.zip', mimeType: 'application/zip', buffer: Buffer.from(longZip.bytes) });
  await dialog.waitFor();
  for (const row of await dialog.locator('.backup-summary strong').all()) assert.ok(Number(await row.innerText()) > 0);
  const sizes = [[1440,1000],[1440,800],[1440,700],[1024,600],[320,568],[375,667],[393,852],[430,932]];
  for (const [width,height] of sizes) {
    await page.setViewportSize({width,height});
    await checkPreview(page, dialog, `long-${width}x${height}`);
  }
  for (const summary of await dialog.locator('details > summary').all()) await summary.click();
  await checkPreview(page, dialog, 'expanded-430x932');
  await page.setViewportSize({width:320,height:568});
  await checkPreview(page, dialog, 'expanded-320x568');
  await page.setViewportSize({width:1440,height:800});
  await checkPreview(page, dialog, 'expanded-back-to-desktop');
  for (const summary of await dialog.locator('details > summary').all()) await summary.click();
  await checkPreview(page, dialog, 'collapsed-back-to-desktop');
  const axe = await new AxeBuilder({page}).withTags(['wcag2a','wcag2aa','wcag21a','wcag21aa']).analyze();
  assert.deepEqual(axe.violations.map(v => v.id), []);
  const finalTarget = await dialog.locator('code.storage-path').innerText();
  await page.keyboard.press('Escape');
  assert.equal(await dialog.count(), 0);
  await assert.rejects(stat(finalTarget), { code: 'ENOENT' });
  assert.equal(await readFile(join(app.directory, 'CURRENT.json'), 'utf8'), before);
  assert.deepEqual(errors, []);
  await context.close();
  console.log('PASS: restore preview layout, four categories, cancel/reopen/Escape, no restoration or state change');
} finally {
  await browser.close();
  await app.close();
  await rm(source, { recursive: true, force: true });
}
