import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import AxeBuilder from '@axe-core/playwright';
import { mkdir, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { collectionFixture, syntheticNote } from './collection-fixture.mjs';

const out=process.env.GUIJI_TEST_RESULTS || 'test-results/collection-recycle';
await mkdir(out,{recursive:true});
const opened=[], app=await collectionFixture({platform:'darwin',runOpen:async path=>opened.push(path)});
const browser=await chromium.launch(), errors=[];
async function until(check) { for(let i=0;i<100;i++){if(await check())return;await new Promise(resolve=>setTimeout(resolve,50));}throw new Error('本地删除状态未收敛'); }
async function open(width=1440,target=app) {
  const context=await browser.newContext({viewport:{width,height:1000},reducedMotion:'reduce'}),page=await context.newPage();page.setDefaultTimeout(10000);
  page.on('pageerror',issue=>errors.push(issue.message));
  await page.route('**/*',route=>{assert.equal(new URL(route.request().url()).origin,target.url);return route.continue();});
  await page.goto(target.url+'/#learning');await page.locator('.collection-canvas').waitFor();return page;
}
const entry=page=>page.getByRole('button',{name:'本地删除',exact:true});
const status=page=>page.locator('.collection-local-delete-feedback');
const finished=page=>until(async()=>await entry(page).isEnabled()&&await status(page).count()===0);
try {
  await app.importNote(syntheticNote(1));
  await app.api('/notes/'+syntheticNote(1).id,undefined,'DELETE');
  let page=await open();
  await until(async()=>await entry(page).isEnabled());
  await entry(page).click();
  await finished(page);
  assert.equal(await page.getByRole('dialog',{name:'回收整理'}).count(),0);
  assert.equal((await app.api('/recycle')).items[0].status,'organized');
  assert.deepEqual(opened,[join(app.directory,'collection/recycle')]);

  // Empty/all-organized records still open the same directory without creating duplicate archives.
  const before=(await app.api('/recycle')).items;
  await until(async()=>await entry(page).isEnabled());await entry(page).click();
  await finished(page);
  assert.deepEqual((await app.api('/recycle')).items,before);assert.equal(opened.length,2);
  await page.context().close();
  const empty=await collectionFixture({platform:'darwin',runOpen:async path=>opened.push(path)});
  try {page=await open(390,empty);await until(async()=>await entry(page).isEnabled());await entry(page).click();await finished(page);assert.deepEqual((await empty.api('/recycle')).items,[]);assert.equal(opened.at(-1),join(empty.directory,'collection/recycle'));await page.context().close();}finally{await empty.close();}

  // A write may commit before its response is lost. Read back, do not replay, and preserve the next revision.
  await app.importNote(syntheticNote(2));await app.api('/notes/'+syntheticNote(2).id,undefined,'DELETE');await app.importNote(syntheticNote(3));page=await open();
  let submitted,release,mutations=0;
  const committed=new Promise(resolve=>submitted=resolve),held=new Promise(resolve=>release=resolve);
  await page.route('**/api/collection/recycle/organize',async route=>{mutations++;await route.fetch();submitted();await held;await route.abort('failed');});
  await until(async()=>await entry(page).isEnabled());await entry(page).click();await committed;
  assert.equal(await entry(page).isEnabled(),false);assert.equal(await page.locator('.collection-canvas').evaluate(node=>node.inert),true);
  await entry(page).dispatchEvent('click');await page.locator('.collection-create-group').dispatchEvent('click');
  assert.equal(await page.getByLabel('分组名称',{exact:true}).count(),0);
  release();await until(async()=>await status(page).textContent().then(text=>text.includes('整理未确认完成')));
  assert.equal(mutations,1);assert.equal((await app.api('/recycle')).items.find(item=>item.noteId===syntheticNote(2).id).status,'organized');assert.equal(opened.length,3);
  await page.getByRole('button',{name:'新建分组',exact:true}).click();await page.getByLabel('分组名称',{exact:true}).fill('断响应核对后的分组');await page.getByRole('button',{name:'保存分组名称'}).click();
  await until(async()=>(await app.api('/desk-workspace')).groups.some(group=>group.name==='断响应核对后的分组'));
  await page.unroute('**/api/collection/recycle/organize');

  // Local drafts, including recovered drafts after reload, never get overwritten by organization.
  let failSave=true;
  await page.route('**/api/collection/desk-workspace',route=>route.request().method()==='PUT'&&failSave?route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({error:'合成草稿断网'})}):route.continue());
  await page.getByRole('button',{name:'新建分组',exact:true}).click();await page.getByLabel('分组名称',{exact:true}).fill('需要保护的草稿');await page.getByRole('button',{name:'保存分组名称'}).click();await page.getByRole('alert').filter({hasText:'合成草稿断网'}).waitFor();
  assert.equal(await entry(page).isEnabled(),false);const draft=await page.evaluate(()=>localStorage.getItem('digital-world:collection-draft:v2'));
  await entry(page).dispatchEvent('click');assert.equal(await page.evaluate(()=>localStorage.getItem('digital-world:collection-draft:v2')),draft);
  await page.screenshot({path:join(out,'draft-blocked-1440.png')});await page.reload();await page.getByRole('button',{name:'恢复草稿',exact:true}).waitFor();assert.equal(await entry(page).isEnabled(),false);
  failSave=false;await page.getByRole('button',{name:'恢复草稿',exact:true}).click();await until(async()=>(await app.api('/desk-workspace')).groups.some(group=>group.name==='需要保护的草稿'));
  await until(async()=>await entry(page).isEnabled());

  // Opening failure is reported separately, never presented as local permanent deletion.
  await page.route('**/api/collection/recycle/open',route=>route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({error:'合成访达暂不可用'})}));
  await entry(page).click();await until(async()=>await status(page).textContent().then(text=>text.includes('访达未确认打开')));
  assert.equal(opened.length,3);await page.screenshot({path:join(out,'open-error-1440.png')});await page.unroute('**/api/collection/recycle/open');
  await until(async()=>await entry(page).isEnabled());await entry(page).click();await finished(page);assert.equal(opened.length,4);
  const removed=(await app.api('/recycle')).items[0];await rm(removed.path,{recursive:true});await until(async()=>await entry(page).isEnabled());await entry(page).click();
  await finished(page);assert.equal((await app.api('/recycle')).items[0].status,'missing');assert.equal(await page.getByText(/文件已移走或不完整/).count(),0);assert.equal(opened.length,5);
  const incomplete=(await app.api('/recycle')).items.find(item=>item.status==='organized');await rm(join(incomplete.path,'笔记.txt'));
  await entry(page).click();await finished(page);const guarded=(await app.api('/recycle')).items.find(item=>item.recycleId===incomplete.recycleId);
  assert.equal(guarded.status,'incomplete');assert.equal(guarded.canRestore,false);assert.equal(opened.length,6);
  await page.screenshot({path:join(out,'missing-without-feedback-1440.png')});
  await page.context().close();

  // One failed item cannot hide other successfully organized notes or suppress the Finder request.
  let stopOnce=false,partialOpenFails=true;const partialOpened=[];
  const partial=await collectionFixture({platform:'darwin',runOpen:async path=>{if(partialOpenFails)throw new Error('合成部分失败后的访达错误');partialOpened.push(path);},recycleCheckpoint:async point=>{if(stopOnce&&point==='afterPlan'){stopOnce=false;throw new Error('合成整理中断');}}});
  try {
    await partial.importNote(syntheticNote(9));await partial.api('/notes/'+syntheticNote(9).id,undefined,'DELETE');await partial.api('/recycle/organize',{});
    await rm((await partial.api('/recycle')).items[0].path,{recursive:true});stopOnce=true;
    for(const index of [10,11]){await partial.importNote(syntheticNote(index));await partial.api('/notes/'+syntheticNote(index).id,undefined,'DELETE');}
    page=await open(390,partial);await until(async()=>await entry(page).isEnabled());await entry(page).click();
    await until(async()=>await status(page).textContent().then(text=>text.includes('1 条未整理')));
    assert.ok((await status(page).textContent()).includes('访达未确认打开'));assert.equal(await page.getByText(/文件已移走或不完整/).count(),0);assert.equal(partialOpened.length,0);assert.equal((await partial.api('/recycle')).items.filter(item=>item.status==='organized').length,1);
    await page.screenshot({path:join(out,'partial-390.png')});partialOpenFails=false;await until(async()=>await entry(page).isEnabled());await entry(page).click();
    await finished(page);assert.equal((await partial.api('/recycle')).items.filter(item=>item.status==='organized').length,2);assert.equal(partialOpened.length,1);
    await partial.importNote(syntheticNote(12));await partial.api('/notes/'+syntheticNote(12).id,undefined,'DELETE');stopOnce=true;
    await entry(page).click();await until(async()=>await status(page).textContent().then(text=>text.includes('1 条未整理')&&text.includes('已请求在访达打开')));
    assert.equal(partialOpened.length,2);await page.screenshot({path:join(out,'actual-error-retained-390.png')});
    await until(async()=>await entry(page).isEnabled());await entry(page).click();await finished(page);assert.equal(partialOpened.length,3);await page.context().close();
  } finally {await partial.close();}

  for(const width of [320,375,390,430,1024,1440]) {
    page=await open(width);await until(async()=>await entry(page).isEnabled());await entry(page).focus();
    const box=await entry(page).boundingBox();assert.ok(box.width>=44&&box.height>=44);
    assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
    assert.ok(await entry(page).evaluate(node=>getComputedStyle(node).outlineStyle!=='none'));
    const axe=await new AxeBuilder({page}).withTags(['wcag2a','wcag2aa','wcag21aa']).analyze();assert.deepEqual(axe.violations.map(item=>({width,id:item.id})),[]);
    await page.screenshot({path:join(out,'local-delete-'+width+'.png')});await page.context().close();
  }
  assert.deepEqual(errors,[]);
  console.log('PASS local-delete: single click, empty/idempotent, no replay/double click, frozen canvas, revision/draft, partial/resume, Finder errors/missing, six widths/axe/focus/44px');
} finally {await browser.close();await app.close();}
