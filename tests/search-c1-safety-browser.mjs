import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {collectionFixture,syntheticNote} from './collection-fixture.mjs';
const app=await collectionFixture(),browser=await chromium.launch(),context=await browser.newContext({reducedMotion:'reduce'}),page=await context.newPage();page.setDefaultTimeout(10000);
const errors=[];page.on('pageerror',e=>errors.push(e.message));
try{
 await app.importNote(syntheticNote(622,{title:'安全定位622'}));
 // A slow collection read cannot overlap with the next polling read.
 let release,started=false,count=0;const gate=new Promise(resolve=>release=resolve);
 await page.route('**/api/collection/notes',async r=>{count++;if(count===1){started=true;await gate;}try{await r.continue();}catch{};});
 await page.goto(app.url+'/#learning');while(!started)await page.waitForTimeout(20);
 await page.waitForTimeout(2300);assert.equal(count,1,'one in-flight reader request');await page.locator('.collection-paper').waitFor({timeout:11000});assert.ok(count>=2,'timeout releases flight and polling recovers');release();await page.unroute('**/api/collection/notes');console.log('PASS collection poll single-flight/timeout/recovery');
 // A delayed result after close cannot reopen the palette or navigate.
 let releaseQuery,queryStarted=false;const queryGate=new Promise(resolve=>releaseQuery=resolve);
 await page.route('**/api/collection/search?*',async r=>{queryStarted=true;await queryGate;try{await r.continue();}catch{}});
 await page.keyboard.press('Meta+k');await page.getByLabel('全局搜索').fill('安全定位622');while(!queryStarted)await page.waitForTimeout(20);await page.keyboard.press('Escape');releaseQuery();await page.waitForTimeout(200);assert.equal(await page.getByRole('dialog',{name:'搜索工作台'}).count(),0);assert.equal(await page.locator('.collection-reader').count(),0);await page.unroute('**/api/collection/search?*');console.log('PASS closed palette ignores late response');
 // Even an auth re-handshake that ignores fetch cancellation cannot lock the reader.
 let pauseSession=false,releasedSession;const sessionGate=new Promise(resolve=>releasedSession=resolve);let challenged=false;
 await page.route('**/api/session',async r=>{if(pauseSession)await sessionGate;try{await r.continue();}catch{}});
 await page.route('**/api/collection/notes/version',async r=>{if(!challenged){challenged=true;pauseSession=true;return r.fulfill({status:403,json:{error:'合成重新认证'}});}await r.continue();});
 await page.goto(app.url+'/#learning');await page.locator('.collection-load-error').filter({hasText:'读取超时'}).waitFor({timeout:11000});releasedSession();await page.locator('.collection-paper').waitFor();await page.unroute('**/api/session');await page.unroute('**/api/collection/notes/version');console.log('PASS auth handshake timeout/recovery');
 // Composition guard still blocks search navigation while keeping both editor and palette.
 await page.goto(app.url+'/#notes');await page.getByRole('button',{name:'记一条新念头',exact:true}).click();
 const editor=page.getByRole('textbox',{name:'随手记内容',exact:true});await editor.fill('保留的草稿');await editor.dispatchEvent('compositionstart',{data:'未完成'});
 await page.getByRole('button',{name:'搜索',exact:true}).click();await page.getByLabel('全局搜索').fill('安全定位622');await page.locator('.search-results[aria-busy="false"]').waitFor();await page.getByRole('dialog',{name:'搜索工作台'}).getByRole('button').filter({hasText:'安全定位622'}).click();
 assert.match(page.url(),/#notes$/);assert.equal(await page.getByRole('dialog',{name:'搜索工作台'}).count(),1);assert.match(await editor.innerText(),/保留的草稿/);await editor.dispatchEvent('compositionend',{data:'未完成'});await page.keyboard.press('Escape');
 assert.deepEqual(errors,[]);console.log('PASS input guard and draft preserved');
}finally{await browser.close();await app.close();}
