import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {collectionFixture,syntheticNote} from './collection-fixture.mjs';
const app=await collectionFixture(),browser=await chromium.launch(),page=await browser.newPage({reducedMotion:'reduce'});page.setDefaultTimeout(8000);
let posts=0,failRead=false;const ids=[],errors=[];page.on('pageerror',e=>errors.push(e.message));
await page.route('**/api/collection/notes/import',async route=>{posts++;ids.push(route.request().postDataJSON().operationId);await route.fetch();failRead=true;await route.fulfill({status:503,json:{error:'合成丢回包'}});});
await page.route('**/api/collection/desk-workspace',route=>failRead?route.fulfill({status:503,json:{error:'合成回读中断'}}):route.continue());
try{
 await page.goto(app.url+'/#learning');await page.getByText('暂无收藏',{exact:true}).waitFor();await page.waitForTimeout(150);
 const transfer=await page.evaluateHandle(note=>{const t=new DataTransfer();t.setData('application/x-kankan-note','KANKAN_NOTE:'+JSON.stringify(note));return t;},syntheticNote(602));
 await page.locator('.collection-desk').dispatchEvent('drop',{dataTransfer:transfer});await page.getByText('收藏已保存，内容回读尚未完成。请恢复连接后核对上次收藏。',{exact:false}).waitFor();
 assert.equal(posts,1);assert.equal((await app.readCollection()).notes.length,1);assert.ok(!await page.evaluate(()=>Object.entries(localStorage).filter(([k])=>k.includes('collection-import')).some(([,v])=>v.includes('signature='))));
 await page.reload();await page.getByRole('button',{name:'核对上次收藏',exact:true}).waitFor();failRead=false;
 const reloadGroup=page.getByRole('button',{name:'重新读取分组',exact:true});if(await reloadGroup.count())await reloadGroup.click();
 await page.getByRole('button',{name:'核对上次收藏',exact:true}).click();await page.getByRole('button',{name:'核对上次收藏',exact:true}).waitFor({state:'detached'});await page.locator(`[data-note-id="${syntheticNote(602).id}"]`).waitFor();
 assert.equal(posts,1);assert.deepEqual(errors,[]);console.log('PASS F05 lost response/saved readback failure/reload same operation/no replay');
}finally{await browser.close();await app.close();}
