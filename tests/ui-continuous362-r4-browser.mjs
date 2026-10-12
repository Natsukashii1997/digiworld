import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fixture183, routes183 } from './projects-v16-fixture.mjs';

const before = process.argv.includes('--before');
const out = process.env.GUIJI_TEST_RESULTS || 'test-results/continuous362-r4';
await mkdir(out, { recursive: true });
const stamp = '2026-10-08T14:30:00+08:00', records = [], errors = [];
const app = await fixture183(), browser = await chromium.launch();
try {
  for (const width of [1440, 390]) {
    const context = await browser.newContext({ viewport: { width, height: 900 }, timezoneId: 'Asia/Shanghai', reducedMotion: 'reduce' });
    const page = await context.newPage();
    page.on('pageerror', error => errors.push(error.message));
    await page.addInitScript(time => { const BaseDate = Date; globalThis.Date = class extends BaseDate {
      constructor(...args) { super(...(args.length ? args : [time])); }
      static now() { return new BaseDate(time).getTime(); }
    }; }, stamp);
    await routes183(page, app);
    await page.route('**/api/calendar/status', r => r.fulfill({ json: { available: true, supported: true, access: { calendar: 'authorized', reminders: 'authorized' } } }));
    let failed = false;
    await page.route('**/api/calendar/week', r => r.fulfill(failed ? { status: 503, json: { error: '合成读取失败' } } : { json: { available: true, events: [{ id: 'r4-event', title: '合成当前安排', calendar: '工作台', workbench: true, start: '2026-10-08T13:30:00+08:00', end: '2026-10-08T15:00:00+08:00', allDay: false }] } }));
    await page.route('**/api/calendar/todos', r => r.fulfill({ json: { available: true, reminders: [] } }));
    await page.goto(app.url + '/#home');
    await page.locator('.hx-nowline').waitFor();
    for (const mode of ['normal', 'retained']) {
      if (mode === 'retained') { failed = true; await page.evaluate(() => window.dispatchEvent(new Event('focus'))); await page.locator('.hx-mod-a .source-read-error').waitFor(); }
      await page.waitForTimeout(150);
      const geometry = await page.evaluate(() => {
        const marker = document.querySelector('.hx-now').getBoundingClientRect();
        const line = document.querySelector('.hx-nowline').getBoundingClientRect();
        return { markerBottom: marker.bottom, textTop: line.top, clearance: line.top - marker.bottom };
      });
      records.push({ width, mode, ...geometry });
      await page.screenshot({ path: join(out, `${mode}-${width}.png`), fullPage: true });
      await page.locator('.hx-mod-a').screenshot({ path: join(out, `${mode}-${width}-detail.png`) });
    }
    await context.close();
  }
} finally {
  await app.close(); await browser.close();
  await writeFile(join(out, 'records.json'), JSON.stringify({ before, records, errors }, null, 2));
}
assert.deepEqual(errors, []);
if (!before) assert.ok(records.every(r => r.clearance >= 6), '现在竖线和当前安排文字至少相隔6px');
console.log(JSON.stringify({ before, records }));
