// Dispatch 351 batch 1: fixed synthetic inputs, source failures, readable type and scroll cues.
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import AxeBuilder from '@axe-core/playwright';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { collabV16Fixture } from './collab-v16-fixture.mjs';
import { collectionFixture, syntheticNote } from './collection-fixture.mjs';
import { aihot202Data } from './aihot-v16-fixture.mjs';
import { fixture183, routes183 } from './projects-v16-fixture.mjs';
import { makeAsset } from '../src/store.js';
import { freshDesignImplementationV1 } from '../src/workflow-template.js';

const capture = process.argv.includes('--before');
const out = process.env.GUIJI_TEST_RESULTS || 'test-results/ui-refine351';
await mkdir(out, { recursive: true });
const browser = await chromium.launch(), records = [], errors = [];
const stamp = '2026-10-08T14:30:00+08:00';
const events = [
  { id:'refine-event-current', title:'合成当前规划', workbench:true, calendar:'工作台', start:'2026-10-08T13:30:00+08:00', end:'2026-10-08T15:00:00+08:00', allDay:false },
  { id:'refine-event-next', title:'合成后续安排', workbench:false, calendar:'合成团队', start:'2026-10-08T15:30:00+08:00', end:'2026-10-08T16:30:00+08:00', allDay:false },
];
const reminders = Array.from({ length: 7 }, (_, i) => ({ id: 'refine-todo-' + i, title: '核对合成项目交接 ' + (i + 1), completed: false, due: stamp, dueHasTime: true, modified: stamp }));
async function open(app, width) {
  const context = await browser.newContext({ viewport: { width, height: 900 }, timezoneId: 'Asia/Shanghai', reducedMotion: 'reduce' });
  const page = await context.newPage(); page.setDefaultTimeout(12000);
  page.on('pageerror', e => errors.push(e.message));
  await page.addInitScript(time => { const BaseDate = Date; globalThis.Date = class extends BaseDate { constructor(...args) { super(...(args.length ? args : [time])); } static now() { return new BaseDate(time).getTime(); } }; }, stamp);
  await page.route('**/api/aihot', r => r.fulfill({ json: aihot202Data() }));
  await page.route('**/api/calendar/status', r => r.fulfill({ json: { available: true, supported: true, access: { calendar: 'authorized', reminders: 'authorized' } } }));
  await page.route('**/api/calendar/week', r => r.fulfill({ json: { available: true, events } }));
  await page.route('**/api/calendar/todos', r => r.fulfill({ json: { available: true, reminders } }));
  return page;
}
async function shot(page, name, fullPage = true) {
  await page.screenshot({ path: join(out, `${name}-${page.viewportSize().width}.png`), fullPage });
  if (page.viewportSize().width === 1440 && ['home', 'P1-todos-error', 'P6-home-multiple'].includes(name)) {
    for (const card of ['a', 'b', 'c', 'd']) await page.locator('.hx-mod-' + card).screenshot({ path:join(out, `${name}-card-${card}-1440.png`) });
  }
}
async function metrics(page, name) {
  const result = await page.evaluate(() => {
    const sizes = new Map(), tiny = [];
    for (const e of document.querySelectorAll('main *,header *,nav *,aside *')) {
      const b = e.getBoundingClientRect();
      if (!b.width || !b.height || e.closest('svg,.sr-only') || !e.checkVisibility({ checkOpacity: true })) continue;
      if (![...e.childNodes].some(n => n.nodeType === 3 && n.textContent.trim())) continue;
      const size = getComputedStyle(e).fontSize;
      // A zero-size text node beside an icon has no rendered glyphs; audit the actual text range.
      if (parseFloat(size) === 0) continue;
      sizes.set(size, (sizes.get(size) || 0) + 1);
      if (parseFloat(size) < 11) tiny.push({ tag: e.tagName, class: e.className, text: e.textContent.trim().slice(0, 70), size });
    }
    const primary = [...document.querySelectorAll('main .button:not(.secondary),main .collection-primary,main .nv-nbtn.pri,main .hx-go')].filter(e => e.checkVisibility({ checkOpacity: true })).map(e => {
      const s = getComputedStyle(e);
      return { label: e.textContent.trim(), background: s.backgroundColor, image: s.backgroundImage, shadow: s.boxShadow, disabled: e.disabled };
    });
    return { width: innerWidth, overflow: document.documentElement.scrollWidth - innerWidth, sizes: [...sizes].sort((a, b) => parseFloat(a[0]) - parseFloat(b[0])), tiny, primary };
  });
  records.push({ name, ...result });
  if (!capture) {
    assert.equal(result.overflow, 0, name + ' page overflow');
    assert.deepEqual(result.tiny, [], name + ' text below 11px');
    const orange = value => /rgb\(255, (?:1[2-9]\d|2[0-4]\d), (?:\d{1,2}|1[0-2]\d)\)/.test(value);
    assert.ok(result.primary.filter(p => orange(p.image + p.background)).length <= 1, name + ' at most one orange primary');
    for (const p of result.primary.filter(p => !p.disabled)) {
      assert.ok(orange(p.image + p.background), name + ' primary color: ' + p.label);
      assert.notEqual(p.shadow, 'none', name + ' primary orange glow: ' + p.label);
    }
  }
}
async function homeSpace(page, name) {
  const cards = await page.locator('.hx-mod').evaluateAll(nodes => nodes.map(card => {
    const body = card.querySelector('.hx-module-body') || card, box = body.getBoundingClientRect(), spans = [];
    const walker = document.createTreeWalker(body, NodeFilter.SHOW_TEXT);
    while (walker.nextNode()) {
      const node = walker.currentNode, parent = node.parentElement;
      if (!node.textContent.trim() || parent.closest('svg,.sr-only') || !parent.checkVisibility({ checkOpacity:true })) continue;
      const range = document.createRange(); range.selectNodeContents(node);
      for (const r of range.getClientRects()) if (r.height && r.width) spans.push([r.top, r.bottom]);
    }
    for (const e of body.querySelectorAll('.hx-tl-bar,.hx-mini-line')) { const r=e.getBoundingClientRect(); spans.push([r.top,r.bottom]); }
    spans.sort((a,b)=>a[0]-b[0]);
    let bottom = box.top, gap = 0;
    for (const [top,end] of spans) { gap=Math.max(gap,top-bottom); bottom=Math.max(bottom,end); }
    const headGap=(spans[0]?.[0] ?? box.top)-card.querySelector("header").getBoundingClientRect().bottom;
    return { id:card.className, height:card.getBoundingClientRect().height, maxBlank:gap, headGap };
  }));
  records.push({ name, width:page.viewportSize().width, cards });
  if (!capture && page.viewportSize().width === 1440) {
    assert.ok(Math.abs(cards[0].height-cards[2].height)<1 && Math.abs(cards[1].height-cards[3].height)<1, 'home paired card heights');
    assert.ok(cards.every(c=>c.maxBlank<=120 && c.headGap<=32), name+' home blank >120px: '+JSON.stringify(cards));
  }
}
async function fade(page, selector, name) {
  const result = await page.locator(selector).evaluate(row => {
    const wrapper = row.closest('.scroll-fade');
    return { overflow: row.scrollWidth > row.clientWidth + 1, fade: wrapper?.dataset.right, after: wrapper && getComputedStyle(wrapper, '::after').backgroundImage, pointerEvents: wrapper && getComputedStyle(wrapper, '::after').pointerEvents };
  });
  records.push({ name, width: page.viewportSize().width, ...result });
  if (!capture) { assert.ok(result.overflow, name + ' synthetic row must overflow'); assert.equal(result.fade, 'true', name); assert.match(result.after, /linear-gradient/); assert.equal(result.pointerEvents, 'none'); }
  await shot(page, name);
  if (!capture) {
    await page.locator(selector).evaluate(row => row.scrollLeft = row.scrollWidth);
    await page.waitForFunction(sel => document.querySelector(sel)?.closest('.scroll-fade')?.dataset.right === 'false', selector);
    assert.equal(await page.locator(selector).evaluate(row => row.closest('.scroll-fade').dataset.left), 'true');
    await page.locator(selector).locator('button').last().focus();
    assert.equal(await page.locator(selector).locator('button').last().evaluate(e => e === document.activeElement), true);
  }
}
async function sourceFailure(page, path, refresh, name, selector, retained) {
  const failure = r => r.fulfill({ status: 503, json: { error: '本地服务连接中断。操作结果未确认，请保留当前内容，重新连接后核对。' } });
  await page.route('**/api/' + path, failure);
  await refresh();
  await page.waitForTimeout(400);
  await shot(page, name);
  records.push({ name, width: page.viewportSize().width, alerts: await page.locator('[role="alert"]').allTextContents(), retained: retained ? await retained() : null });
  if (!capture) {
    assert.equal(await page.locator(selector + ' .source-read-error').count(), 1, name + ' once');
    assert.equal((await page.locator('main').innerText()).includes('。。'), false);
    if (name === 'P1-todos-error') assert.equal((await page.locator('main').innerText()).split('提醒事项暂时读不到').length - 1, 1, 'reminder failure is stated once across home cards');
    if (retained) assert.ok(await retained(), name + ' previous shape/data retained');
    const retry = page.locator(selector + ' .source-read-error').getByRole('button', { name: '重试', exact: true });
    await page.unroute('**/api/' + path, failure);
    await retry.click();
    await page.locator(selector + ' .source-read-error').waitFor({ state: 'detached' });
  } else {
    await page.unroute('**/api/' + path, failure);
    await refresh();
    await page.waitForTimeout(400);
  }
}
async function settingsFailure(page, app) {
  const entry = page.locator('.cx-foot > button').first();
  await page.waitForFunction(()=>document.querySelector('.cx-foot > button')?.disabled===false);
  await entry.click();
  const dialog = page.getByRole('dialog', { name:'运行设置与模板版本',exact:true });
  await dialog.waitFor(); await dialog.getByLabel('轮次',{exact:true}).fill('合成保留草稿');
  await dialog.getByLabel('轮次待议清单（项目 docs 内）').fill('docs/agents/handoffs/v16-open-issues.md');
  assert.equal(await dialog.locator('button[type="submit"]').isDisabled(),false,'valid settings can be submitted before the source fails');
  const previous = await app.workspace();
  const failure = r=>r.fulfill({status:503,json:{error:'合成协议读取中断'}});
  await page.route('**/api/collab/protocol',failure);
  await page.evaluate(()=>window.dispatchEvent(new Event('focus'))); await page.waitForTimeout(400);
  await shot(page,'P1-collab-settings-guard');
  if (!capture) {
    assert.equal(await dialog.getByLabel('轮次',{exact:true}).inputValue(),'合成保留草稿');
    assert.equal(await dialog.locator('button[type="submit"]').isDisabled(),true);
    assert.equal(await entry.isDisabled(),true);
    await dialog.locator('form').evaluate(form=>form.requestSubmit());
    await page.waitForTimeout(150);
    assert.deepEqual((await app.workspace()).collabRunSettings,previous.collabRunSettings,'failed protocol cannot persist old run settings');
  }
  await page.unroute('**/api/collab/protocol',failure);
  await page.evaluate(()=>window.dispatchEvent(new Event('focus'))); await page.waitForTimeout(400);
  if (await dialog.count()) await dialog.locator('.dialog-close').click();
}
try {
  const app = await collabV16Fixture();
  try {
    const workflow = makeAsset({ title:'合成设计实现流',type:'Workflow',description:'固定夹具中的有效模板',content:'仅供批1读取失败保存保护验证',workflowTemplate:freshDesignImplementationV1() });
    workflow.id='refine-workflow'; workflow.createdAt=stamp;
    workflow.versions[0].id='refine-workflow-v1'; workflow.versions[0].at=stamp;
    const initial = await app.workspace();
    const seeded = await app.call('/workspace',{state:{...initial,assets:[...initial.assets,workflow]}},'PUT');
    assert.equal(seeded.status,200,'isolated template fixture ready');
    for (const width of [1440, 390]) {
      const p = await open(app, width);
      for (const route of ['home', 'inbox', 'assets', 'agents', 'projects', 'knowledge', 'notes', 'history', 'references', 'night', 'settings', 'collab', 'calendar', 'aihot']) {
        await p.goto(app.url + '/#' + route); await p.locator('main h1').first().waitFor(); await p.waitForTimeout(350);
        await metrics(p, route); await shot(p, route);
        if (route === 'home') {
          await homeSpace(p, 'P6-home-space');
          if (!capture) assert.equal(await p.locator('.hx-activity li').count(), 2, 'two recent collab activities');
          await sourceFailure(p, 'calendar/week', () => p.evaluate(() => window.dispatchEvent(new Event('focus'))), 'P1-today-error', '.hx-mod-a', async () =>
            await p.locator('.hx-blk').count() === 2 && (await p.locator('.hx-nowline').innerText()).includes('上次读取：') && !(await p.locator('.hx-nowline').innerText()).includes('正在 合成当前规划'));
          await sourceFailure(p, 'calendar/todos', () => p.evaluate(() => window.dispatchEvent(new Event('focus'))), 'P1-todos-error', '.hx-mod-a', async () =>
            await p.locator('.hx-todo li').count() === 2 && Number(await p.locator('.hx-todo').evaluate(e=>getComputedStyle(e).opacity)) < 1);
          const permission = r => r.fulfill({ json: { available: true, supported: true, access: { calendar: 'notDetermined', reminders: 'authorized' } } });
          await p.route('**/api/calendar/status', permission);
          await p.evaluate(() => window.dispatchEvent(new Event('focus'))); await p.waitForTimeout(250); await shot(p, 'P6-today-permission');
          if (!capture) assert.equal(await p.locator('.hx-mod-a').getByRole('button', { name: '授权日历' }).count(), 1);
          await p.unroute('**/api/calendar/status', permission);
        }
        if (route === 'collab') {
          await p.locator('.cx-runs').first().waitFor();
          await sourceFailure(p, 'collab/protocol', () => p.getByRole('button', { name: '刷新看板' }).click(), 'P1-collab-error', '.collab-v16', async () =>
            await p.locator('.cx-runs').count() > 0 && Number(await p.locator('.tm-frame').evaluate(e=>getComputedStyle(e).opacity)) < 1);
          await settingsFailure(p,app);
        }
        if (route === 'night') {
          const top = await p.locator('[data-testid="night-library"] h2').evaluate(e => e.getBoundingClientRect().top);
          records.push({ name: 'P2-night-library', width, top });
          if (!capture && width === 1440) assert.ok(top < 900, 'night library in first fold: ' + top);
        }
        if (width === 390 && route === 'calendar') await fade(p, '.todo-list', 'P5-calendar');
        if (width === 390 && route === 'references') await fade(p, '.rail-filter', 'P5-references');
        if (width === 390 && route === 'settings') await fade(p, '.st-nav', 'P5-settings');
        if (route === 'aihot' && width === 1440) {
          await p.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
          const box = await p.locator('.ah-hot').boundingBox(); records.push({ name: 'P6-hot-sticky', width, box });
          if (!capture) assert.ok(box.y >= 55 && box.y < 100 && box.y + box.height <= 900, 'hot list still in viewport ' + JSON.stringify(box));
          await shot(p, 'P6-hot-sticky', false);
        }
      }
      await p.route('**/api/aihot', r=>r.fulfill({json:aihot202Data('first')}));
      await p.goto(app.url+'/#aihot'); await p.reload(); await p.getByRole('button',{name:'开始拉取',exact:true}).waitFor();
      await metrics(p,'P7-aihot-first'); await shot(p,'P7-aihot-first');
      await p.route('**/api/calendar/status',r=>r.fulfill({json:{available:true,supported:true,access:{calendar:'authorized',reminders:'notDetermined'}}}));
      await p.goto(app.url+'/#calendar'); await p.getByRole('button',{name:'授权日历与提醒事项',exact:true}).waitFor();
      await metrics(p,'P7-calendar-partial'); await shot(p,'P7-calendar-partial');
      await p.context().close();
    }
  } finally { await app.close(); }
  const projects = await fixture183();
  try {
    for (const width of [1440, 390]) {
      const p = await open(projects, width); await routes183(p, projects); await p.goto(projects.url + '/#projects'); await p.locator('.pj-save').first().waitFor();
      await shot(p, 'P2-projects-full');
      const heights = await p.locator('.pj-save').evaluateAll(nodes => nodes.map(n => ({ empty: n.classList.contains('pj-vacant'), height: n.getBoundingClientRect().height })));
      records.push({ name: 'P2-projects-heights', width, heights });
      await sourceFailure(p, 'project-status/inspect', () => p.getByRole('button', { name: '刷新', exact: true }).click(), 'P1-projects-error', '.pj-saves-sec', async () => await p.locator('.pj-save-title h3').count() === 3);
      if (!capture) assert.equal(await p.locator('.pj-go:enabled').count(), 3);
      await metrics(p, 'projects-multiple');
      await p.goto(projects.url + '/#home'); await p.locator('.hx-proj-list li').first().waitFor(); await p.waitForTimeout(350);
      await homeSpace(p, 'P6-home-multiple'); await shot(p, 'P6-home-multiple');
      if (!capture) assert.equal(await p.locator('.hx-proj-list li').count(), 3, 'multiple active projects');
      await p.context().close();
    }
  } finally { await projects.close(); }
  const emptyProjects = await fixture183({ noactive: true });
  try {
    for (const width of [1440, 390]) {
      const p = await open(emptyProjects, width); await routes183(p, emptyProjects); await p.goto(emptyProjects.url + '/#projects'); await p.locator('.pj-vacant').first().waitFor();
      await shot(p, 'P2-projects-empty');
      const height = await p.locator('.pj-vacant:visible').first().evaluate(e => e.getBoundingClientRect().height);
      records.push({ name: 'P2-projects-empty-height', width, height });
      if (!capture) {
        const normal = records.find(r => r.name === 'P2-projects-heights' && r.width === width).heights.filter(r => !r.empty);
        assert.ok(height <= Math.min(...normal.map(r => r.height)) / 2, 'empty slot <= half occupied height');
        assert.equal(await p.locator('.pj-empty-hint').count(), await p.locator('.pj-vacant').count(), 'each empty slot has guidance');
      }
      await p.context().close();
    }
  } finally { await emptyProjects.close(); }
  const collection = await collectionFixture();
  try {
    for (let i = 1; i <= 5; i++) await collection.importNote(syntheticNote(i, { category: '合成分组 ' + i }));
    for (const width of [1440, 390]) {
      const p = await open(collection, width); await p.goto(collection.url + '/#learning'); await p.locator('.collection-canvas').waitFor(); await p.waitForTimeout(300);
      await metrics(p, 'learning'); await shot(p, 'learning');
      if (width === 390) await fade(p, '.collection-chips', 'P5-collection');
      await p.context().close();
    }
  } finally { await collection.close(); }
  if (!capture) {
    // Additional phone widths and current accessibility, with authorized synthetic calendar input.
    const app = await collabV16Fixture();
    try {
      for (const width of [320, 375, 393, 430]) {
        const p = await open(app, width);
        for (const route of ['home', 'night', 'projects', 'settings', 'calendar', 'collab', 'aihot']) {
          await p.goto(app.url + '/#' + route); await p.locator('main h1').first().waitFor(); await p.waitForTimeout(300); await metrics(p, route);
          const axe = await new AxeBuilder({ page: p }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
          assert.deepEqual(axe.violations.map(v => ({ id: v.id, targets: v.nodes.map(n => n.target) })), [], `${route}@${width} axe`);
        }
        await p.context().close();
      }
    } finally { await app.close(); }
  }
  assert.deepEqual(errors, []);
  console.log(capture ? '351 baseline captured' : '351 batch1 PASS');
} finally { await writeFile(join(out, 'metrics.json'), JSON.stringify({ capture, records, errors }, null, 2)); await browser.close(); }
