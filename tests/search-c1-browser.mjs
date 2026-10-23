import {createRequire} from 'node:module';
import {mkdir,writeFile} from 'node:fs/promises';
import AxeBuilder from '@axe-core/playwright';
import assert from 'node:assert/strict';
import {collectionFixture,syntheticNote} from './collection-fixture.mjs';
import {seed} from '../src/store.js';
import {createScroll,addEntry} from '../src/scrolls.js';
import {createSpecimen} from '../src/reverse-recipe.js';
const {chromium}=createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE||'/Users/nat/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const out=process.env.C1_OUTPUT||'work/search620/ui';await mkdir(out,{recursive:true});
const app=await collectionFixture(),browser=await chromium.launch();
const context=await browser.newContext({viewport:{width:1440,height:1000},reducedMotion:'reduce'}),page=await context.newPage();
page.setDefaultTimeout(10000);const errors=[];page.on('pageerror',e=>errors.push(e.message));
const s=await app.repository.read(),made=createScroll([],'访谈方法卷');let entries=addEntry(made.scrolls,made.scroll.id,'第一条基准内容',[],undefined,'同名条目');const wanted=addEntry(entries.scrolls,made.scroll.id,'预算提问定位620',[],undefined,'同名条目');s.scrolls=wanted.scrolls;
s.reverseRecords=[createSpecimen({title:'同名参照',text:'第一件基准原文'}),createSpecimen({title:'同名参照',text:'逆向定位620完整任务内容'})];
const remote=[];page.on('request',r=>{if(!r.url().startsWith(app.url)&&!r.url().startsWith('data:')&&!r.url().startsWith('blob:'))remote.push(r.url());});
const note=syntheticNote(620,{title:'收藏定位620',content:'预算材料完整正文'});
const palette=()=>page.getByRole('dialog',{name:'搜索工作台'});
async function search(q){if(!await palette().count())await page.keyboard.press('Meta+k');await page.getByLabel('全局搜索').fill(q);await page.locator('.search-results[aria-busy="false"]').waitFor();}
try{
 await app.repository.write(s);await app.importNote(note);
 await page.goto(app.url+'/#assets');await page.getByRole('button',{name:'搜索',exact:true}).waitFor();
 await search('预算提问定位620');await palette().getByText('焚决 · 1',{exact:true}).waitFor();
 await palette().getByRole('button').filter({hasText:'同名条目'}).click();
 await page.getByRole('dialog',{name:'焚决详情'}).waitFor();
 assert.equal(await page.locator('.scroll-entry:focus').getAttribute('data-entry-id'),wanted.entry.id);
 await page.keyboard.press('Escape');
 await search('逆向定位620');await palette().getByText('逆向任务包 · 1',{exact:true}).waitFor();await palette().getByRole('button').filter({hasText:'同名参照'}).click();
 await page.locator('[data-testid="replica-pack"].expanded').waitFor();assert.match(await page.getByTestId('replica-pack').innerText(),/逆向定位620/);
 await search('收藏定位620');await palette().getByText('收藏 · 1',{exact:true}).waitFor();await palette().getByRole('button').filter({hasText:'收藏定位620'}).click();
 await page.locator('.collection-reader').waitFor();
 await page.screenshot({path:out+'/collection.png',fullPage:true});console.log('PASS three exact targets');
 await page.getByRole('dialog',{name:note.title,exact:true}).getByRole('button',{name:'关闭',exact:true}).click();
 await page.waitForTimeout(2200);assert.equal(await page.locator('.collection-reader').count(),0,'poll does not reopen reader');
 await search('收藏定位620');await palette().getByRole('button').filter({hasText:'收藏定位620'}).click();await page.locator('.collection-reader').waitFor();await page.keyboard.press('Escape');console.log('PASS same-page repeat and close');
 // Partial-source failure stays distinct from empty and can recover.
 await page.route('**/api/collection/search?*',r=>r.fulfill({status:503,json:{error:'合成离线'}}));
 await search('不存在620');await palette().getByRole('alert').filter({hasText:'收藏读取失败'}).waitFor();assert.equal(await palette().locator('.search-empty').count(),0);
 await page.unroute('**/api/collection/search?*');await palette().getByRole('button',{name:'重新读取搜索内容'}).click();await page.locator('.search-results[aria-busy="false"]').waitFor();await palette().locator('.search-empty').waitFor();console.log('PASS failure/retry/empty');
 // A delayed previous query never replaces the current result.
 let release;const gate=new Promise(resolve=>release=resolve);let started=false;
 await page.route('**/api/collection/search?*',async r=>{if(new URL(r.request().url()).searchParams.get('q')==='旧查询620'){started=true;await gate;try{await r.fulfill({json:{total:1,hits:[{id:'stale',title:'过期结果620',source:'旧',groupName:'旧',where:'标题'}]}});}catch{}return;}await r.continue();});
 await page.getByLabel('全局搜索').fill('旧查询620');await page.waitForFunction(()=>true);while(!started)await page.waitForTimeout(20);
 await search('收藏定位620');release();await page.waitForTimeout(200);assert.equal(await palette().getByText('过期结果620').count(),0);await palette().getByRole('button').filter({hasText:note.title}).waitFor();await page.unroute('**/api/collection/search?*');console.log('PASS late query response ignored');
 // A stalled click is bounded; its late answer cannot navigate after cancellation.
 await search('预算提问定位620');let releaseOpen;const openGate=new Promise(resolve=>releaseOpen=resolve);
 await page.route('**/api/workspace',async r=>{await openGate;try{await r.continue();}catch{}});
 await palette().getByRole('button').filter({hasText:'同名条目'}).click();await palette().getByRole('alert').filter({hasText:'打开前读取超时'}).waitFor({timeout:10000});
 assert.equal(await palette().getByRole('button').filter({hasText:'同名条目'}).isEnabled(),true);releaseOpen();await page.unroute('**/api/workspace');await page.waitForTimeout(150);assert.equal(await page.getByRole('dialog',{name:'焚决详情'}).count(),0);
 await palette().getByRole('button').filter({hasText:'同名条目'}).click();await page.getByRole('dialog',{name:'焚决详情'}).waitFor();await page.keyboard.press('Escape');console.log('PASS click timeout/retry');
 // Keyboard and narrow-width results reuse current styles with no horizontal clipping.
 for(const width of [1440,768,390]){
   await page.setViewportSize({width,height:1000});await search('620');
   for(const label of ['收藏 · 1','焚决 · 1','逆向任务包 · 1'])await palette().getByText(label,{exact:true}).waitFor();
   const sizes=await palette().evaluate(el=>({width:el.clientWidth,scroll:el.scrollWidth,doc:document.documentElement.scrollWidth,view:innerWidth}));assert.ok(sizes.scroll<=sizes.width+1&&sizes.doc<=sizes.view+1,JSON.stringify(sizes));
   const axe=await new AxeBuilder({page}).include('[role="dialog"]').withTags(['wcag2a','wcag2aa','wcag21aa']).analyze();assert.deepEqual(axe.violations,[]);
   await page.screenshot({path:out+'/search-'+width+'.png',fullPage:true});
 }
 const target=palette().getByRole('button').filter({hasText:'同名条目'});await target.focus();await page.keyboard.press('Enter');await page.getByRole('dialog',{name:'焚决详情'}).waitFor();assert.equal(await page.locator('.scroll-entry:focus').getAttribute('data-entry-id'),wanted.entry.id);await page.keyboard.press('Escape');console.log('PASS widths/axe/keyboard');
 // Fresh lookup rejects targets removed after the result list was built.
 await search('预算提问定位620');let latest=await app.repository.read();latest.scrolls[0].entries.find(e=>e.id===wanted.entry.id).deletedAt=new Date().toISOString();await app.repository.write(latest);
 await palette().getByRole('button').filter({hasText:'同名条目'}).click();await palette().getByRole('alert').filter({hasText:'已删除'}).waitFor();assert.equal(await page.getByRole('dialog',{name:'焚决详情'}).count(),0);await page.keyboard.press('Escape');
 await search('逆向定位620');latest=await app.repository.read();latest.reverseRecords[1].deletedAt=new Date().toISOString();await app.repository.write(latest);await palette().getByRole('button').filter({hasText:'同名参照'}).click();await palette().getByRole('alert').filter({hasText:'已删除'}).waitFor();await page.keyboard.press('Escape');
 await search('收藏定位620');await app.api('/notes/'+note.id,undefined,'DELETE');await palette().getByRole('button').filter({hasText:note.title}).click();await palette().getByRole('alert').filter({hasText:'已删除'}).waitFor();assert.equal(await page.locator('.collection-reader').count(),0);console.log('PASS deleted targets rejected');
 assert.equal(app.calls.projects,0,'search does not scan');assert.equal(app.calls.agents,0,'search does not scan agents');assert.deepEqual(remote,[]);assert.deepEqual(errors,[]);
 await writeFile(out+'/checks.json',JSON.stringify({status:'PASS',widths:[1440,768,390],pageErrors:errors,externalRequests:remote,scanCalls:app.calls},null,2));console.log('C1 browser PASS');
}catch(e){await page.screenshot({path:out+'/failure.png',fullPage:true});throw e;}finally{await browser.close();await app.close();}
