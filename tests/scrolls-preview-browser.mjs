import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fixture } from './fixture.mjs';
import { seed, makeAsset } from '../src/store.js';
import { createScroll, addEntry, deleteEntry } from '../src/scrolls.js';
import { axe } from './ui-v14-checks.mjs';

const out = process.env.SCROLL_PREVIEW_RESULTS || 'test-results/scrolls-preview';
const before = process.env.SCROLL_PREVIEW_CAPTURE_ONLY === 'before';
await mkdir(out, { recursive: true });
const app = await fixture();
let { scrolls, scroll } = createScroll([], '高价值提示词');
const entries = [];
for (let i = 1; i <= 10; i++) {
  const text = `标题${String(i).padStart(2, '0')}\n先确认问题${i}，再列证据与行动。\n保留换行与完整内容。`;
  const made = addEntry(scrolls, scroll.id, text, ['思考', `标签${i}`], undefined, `独立名称${String(i).padStart(2, '0')}`);
  scrolls = made.scrolls; entries.push(made.entry);
}
const long = addEntry(scrolls, scroll.id, '长内容\n' + '长中文内容'.repeat(80) + '\n' + 'long-word-'.repeat(60), ['长标签'.repeat(8)]);
scrolls = long.scrolls; entries.push(long.entry);
const removed = addEntry(scrolls, scroll.id, '删除条目不得显示', ['已删除']);
scrolls = deleteEntry(removed.scrolls, scroll.id, removed.entry.id);
const empty = createScroll(scrolls, '空卷'); scrolls = empty.scrolls;
await app.repository.write({ ...seed(), assets: [makeAsset({type:'Prompt',title:'普通资产',content:'普通提示词'})], scrolls }, {initialize:true});
const browser = await chromium.launch();
const errors = [], metrics = [];
const cardOf = page => page.locator('.asset-card').filter({has:page.getByRole('button',{name:'打开卷 高价值提示词',exact:true})});
const rowOf = (page, entry) => cardOf(page).locator(`[data-scroll-entry-id="${entry.id}"]`);
const saved = async () => (await app.repository.read()).scrolls.find(s => s.id === scroll.id);
const reenter = async page => {
  await page.getByRole('group', {name:'资产类型'}).getByRole('button', {name:/^Prompt/}).click();
  assert.equal(await cardOf(page).count(), 0);
  await page.getByRole('group', {name:'资产类型'}).getByRole('button', {name:/^全部/}).click();
  await cardOf(page).waitFor();
  assert.equal(await rowOf(page,entries[0]).getByRole('button').isDisabled(), true, '筛选重入保留复制门禁');
  assert.equal(await cardOf(page).getByRole('button',{name:'复制卷全文 高价值提示词',exact:true}).isDisabled(), true);
  await page.evaluate(()=>{location.hash='#home';});
  await cardOf(page).waitFor({state:'detached'});
  await page.evaluate(()=>{location.hash='#assets';});
  await cardOf(page).waitFor();
  assert.equal(await rowOf(page,entries[0]).getByRole('button').isDisabled(), true, '路由重入保留复制门禁');
  assert.equal(await cardOf(page).getByRole('button',{name:'复制卷全文 高价值提示词',exact:true}).isDisabled(), true);
};
try {
  for (const width of before ? [1440,390] : [1440,390,320,375,393,430]) {
    const context = await browser.newContext({viewport:{width,height:1000},reducedMotion:'reduce',permissions:['clipboard-read','clipboard-write']});
    const page = await context.newPage();
    page.on('pageerror',e => errors.push(e.message));
    await page.goto(app.url+'/#assets');
    await page.getByRole('button',{name:'打开卷 高价值提示词',exact:true}).waitFor();
    if (before) {
      await page.screenshot({path:join(out,`assets-${width}.png`),fullPage:true});
      await context.close(); continue;
    }
    assert.equal(await cardOf(page).locator('.scroll-preview').count(),1,'外层必须呈现条目');
    assert.equal(await cardOf(page).locator('h3').innerText(),'焚决 · 高价值提示词');
    assert.equal(await cardOf(page).locator('.cover').count(),1,'保留原火焰封面');
    assert.equal(await cardOf(page).locator('.cover-code').innerText(),'FJ.01');
    assert.equal(await cardOf(page).locator('.card-body p').count(),0,'只移除卷级条数说明');
    assert.equal(await cardOf(page).locator('.card-body h3').count(),1,'仅一个焚决与卷名合并标题');
    assert.equal(await cardOf(page).locator('h3').evaluate(el=>Math.round(el.querySelector('.scroll-card-name').getBoundingClientRect().left-el.querySelector('svg').getBoundingClientRect().right)),8,'名称紧跟火焰图标');
    assert.equal(await cardOf(page).locator('[data-scroll-entry-id]').count(),entries.length);
    assert.equal(await cardOf(page).getByText('删除条目不得显示',{exact:true}).count(),0);
    assert.deepEqual(await cardOf(page).locator('[data-scroll-entry-id]').evaluateAll(nodes => nodes.map(n=>n.dataset.scrollEntryId)),entries.map(e=>e.id));
    assert.equal(await rowOf(page,entries[0]).locator('h4').innerText(),'独立名称01');
    assert.equal(await rowOf(page,entries[0]).locator('.scroll-preview-text').innerText(),entries[0].text);
    assert.equal(await rowOf(page,entries[0]).locator('.scroll-preview-tags').count(),0,'历史标签保留数据但不显示');
    const geometry = await page.evaluate(() => {
      const list = document.querySelector('.scroll-preview[aria-label="高价值提示词 · 焚决内容"]'), scroll=list.closest('.scroll-card'), normal = document.querySelector('.asset-card:not(.scroll-card)');
      const copy=list.querySelector('button'),icon=copy.querySelector('svg');
      return {height:scroll.getBoundingClientRect().height,normal:normal.getBoundingClientRect().height,normalButton:normal.querySelector('.card-open').getBoundingClientRect().height,overflow:document.documentElement.scrollWidth>innerWidth,scrollable:list.scrollHeight>list.clientHeight,entryCopy:copy.getBoundingClientRect().width>=56,entryCopyHeight:copy.getBoundingClientRect().height,entryIcon:icon.getBoundingClientRect().width};
    });
    assert.deepEqual(geometry,{height:728,normal:352,normalButton:352,overflow:false,scrollable:true,entryCopy:true,entryCopyHeight:32,entryIcon:14});
    metrics.push({width,...geometry});
    await cardOf(page).locator('.scroll-preview').evaluate(el=>{el.scrollTop=el.scrollHeight;});
    assert.ok(await rowOf(page,long.entry).evaluate(el=>{const a=el.getBoundingClientRect(),b=el.closest('.scroll-preview').getBoundingClientRect();return a.bottom<=b.bottom+1;}));
    await cardOf(page).locator('.scroll-preview').evaluate(el=>{el.scrollTop=0;});
    await axe(page,`scroll-preview-${width}`);
    await page.screenshot({path:join(out,`assets-${width}.png`),fullPage:true});
    await context.close();
  }
  if (!before) {
    const context = await browser.newContext({viewport:{width:390,height:844},reducedMotion:'reduce',permissions:['clipboard-read','clipboard-write']});
    const page = await context.newPage();
    await page.goto(app.url+'/#assets'); await cardOf(page).waitFor();
    const first = rowOf(page,entries[0]);
    await first.getByRole('button').dblclick({delay:100});
    await first.locator('.scroll-preview-uses').filter({hasText:'1'}).waitFor();
    assert.equal(await page.evaluate(()=>navigator.clipboard.readText()),entries[0].text);
    assert.equal(await page.getByRole('dialog').count(),0);
    assert.deepEqual((await saved()).entries.slice(0,2).map(e=>e.uses),[1,0]);
    assert.ok((await saved()).entries[0].lastUsedAt);
    await page.reload(); await first.locator('.scroll-preview-uses').filter({hasText:'1'}).waitFor();
    const list = cardOf(page).locator('.scroll-preview'); await list.focus();
    await page.keyboard.press('End');
    await page.waitForFunction(() => document.querySelector('.scroll-preview[aria-label="高价值提示词 · 焚决内容"]').scrollTop > 0, null, {timeout:5000});
    assert.ok(await list.evaluate(el=>el.scrollTop>0));
    await rowOf(page,entries[9]).getByRole('button').focus(); await page.keyboard.press('Enter');
    await rowOf(page,entries[9]).locator('.scroll-preview-uses').filter({hasText:'1'}).waitFor();
    assert.equal(await page.evaluate(()=>navigator.clipboard.readText()),entries[9].text);
    await page.getByRole('button',{name:'打开卷 高价值提示词',exact:true}).click();
    const detail = page.getByRole('dialog',{name:'焚决详情'}); await detail.waitFor();
    assert.equal(await detail.getByLabel('新条目提示词全文').count(),1);
    assert.equal(await detail.locator('.scroll-entry .entry-text').first().innerText(),entries[0].text);
    await detail.getByRole('button',{name:'关闭',exact:true}).click();
    const originalRevision = (await app.repository.read()).revision;
    await page.evaluate(()=>{navigator.clipboard.writeText=async()=>{throw new DOMException('denied','NotAllowedError');};});
    await first.getByRole('button').click(); await page.locator('.toast').filter({hasText:'无法访问剪贴板'}).waitFor();
    assert.equal((await app.repository.read()).revision,originalRevision);
    assert.equal(await first.getByRole('button').isEnabled(),true);
    await page.reload(); await cardOf(page).waitFor();
    let puts=0;
    await page.evaluate(()=>{const write=navigator.clipboard.writeText.bind(navigator.clipboard);window.unknownWrites=0;navigator.clipboard.writeText=text=>{window.unknownWrites++;return write(text);};});
    await page.route('**/api/workspace',async route=>{
      if(route.request().method()!=='PUT')return route.continue();
      puts++;return route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({error:'合成结果未知'})});
    });
    await first.getByRole('button').click();
    await cardOf(page).getByRole('status').filter({hasText:'次数未确认'}).waitFor();
    assert.equal(await page.evaluate(()=>navigator.clipboard.readText()),entries[0].text);
    assert.equal(await first.getByRole('button').isDisabled(),true);
    assert.equal(await cardOf(page).getByRole('button',{name:'复制卷全文 高价值提示词',exact:true}).isDisabled(),true);
    assert.equal(puts,1); assert.equal((await app.repository.read()).revision,originalRevision);
    await reenter(page);
    await cardOf(page).getByRole('status').filter({hasText:'次数未确认'}).waitFor();
    assert.equal(puts,1); assert.equal(await page.evaluate(()=>window.unknownWrites),1);
    await page.unroute('**/api/workspace'); await page.reload(); await cardOf(page).waitFor();
    await page.evaluate(()=>{window.previewWrites=0;navigator.clipboard.writeText=async text=>{window.previewWrites++;await new Promise(resolve=>{window.releasePreviewClipboard=resolve;});};});
    await first.getByRole('button').click();
    assert.equal(await rowOf(page,entries[1]).getByRole('button').isDisabled(),true);
    assert.equal(await cardOf(page).getByRole('button',{name:'复制卷全文 高价值提示词',exact:true}).isDisabled(),true);
    await reenter(page);
    assert.equal(await page.evaluate(()=>window.previewWrites),1);
    await page.evaluate(()=>window.releasePreviewClipboard());
    await first.locator('.scroll-preview-uses').filter({hasText:'2'}).waitFor();
    assert.equal(await page.evaluate(()=>window.previewWrites),1);
    await page.reload(); await cardOf(page).waitFor();
    let committedPuts=0;
    await page.route('**/api/workspace',async route=>{
      if(route.request().method()!=='PUT')return route.continue();
      committedPuts++; const response=await route.fetch(); assert.equal(response.status(),200);
      return route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({error:'提交后响应丢失'})});
    });
    await first.getByRole('button').click(); await cardOf(page).getByRole('status').filter({hasText:'次数未确认'}).waitFor();
    assert.equal((await saved()).entries[0].uses,3); assert.equal(committedPuts,1);
    assert.equal(await first.getByRole('button').isDisabled(),true);
    await page.unroute('**/api/workspace'); await page.reload();
    await first.locator('.scroll-preview-uses').filter({hasText:'3'}).waitFor();
    await context.close();
    const longName='很长的焚决分类名称'.repeat(6);
    const snapshot=await app.repository.read();
    await app.repository.write({...snapshot,scrolls:snapshot.scrolls.map(s=>s.id===empty.scroll.id?{...s,name:longName}:s)});
    for (const width of [390,320]) {
      const touchContext = await browser.newContext({viewport:{width,height:844},isMobile:true,hasTouch:true,reducedMotion:'reduce'});
      const touch = await touchContext.newPage();
      await touch.goto(app.url+'/#assets'); await cardOf(touch).waitFor();
      assert.equal(await touch.evaluate(()=>matchMedia('(hover:none)').matches),true,'每个屏宽保留触屏模拟');
      assert.equal(await rowOf(touch,entries[0]).getByRole('button').isVisible(),true);
      const longCard=touch.locator('.scroll-card').filter({has:touch.getByRole('button',{name:`打开卷 ${longName}`,exact:true})});
      assert.deepEqual(await longCard.evaluate(el=>{
        const title=el.querySelector('h3').getBoundingClientRect();
        const actions=[...el.querySelectorAll('.asset-copy,.asset-delete,.pin-button')];
        return {truncated:el.querySelector('.scroll-card-name').scrollWidth>el.querySelector('.scroll-card-name').clientWidth,overflow:document.documentElement.scrollWidth>innerWidth,actionsVisible:actions.every(a=>getComputedStyle(a).opacity==='1'),titleBlocked:actions.some(a=>{const r=a.getBoundingClientRect();return Math.min(r.right,title.right)>Math.max(r.left,title.left)&&Math.min(r.bottom,title.bottom)>Math.max(r.top,title.top);})};
      }),{truncated:true,overflow:false,actionsVisible:true,titleBlocked:false});
      await longCard.scrollIntoViewIfNeeded();
      await touch.screenshot({path:join(out,`long-name-touch-${width}.png`),fullPage:false});
      await touchContext.close();
    }
  }
  assert.deepEqual(errors,[]);
  await writeFile(join(out,'results.json'),JSON.stringify({before,metrics,errors},null,2));
  console.log(before?'BEFORE scroll preview captured':'PASS scroll-preview: six widths, full content, per-entry usage, keyboard, failure, shared copy lock across filter/route reentry, unchanged detail');
} finally {await browser.close();await app.close();}
