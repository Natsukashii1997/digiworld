import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {collectionFixture} from './collection-fixture.mjs';
const app=await collectionFixture(),browser=await chromium.launch(),page=await browser.newPage();page.setDefaultTimeout(6000);
let offline=false,healthy=0;
await page.route('**/api/collection/notes/version',async route=>{if(offline)return route.fulfill({status:503,json:{error:'合成读取断连'}});healthy++;await route.continue();});
try{
 await page.goto(app.url+'/#learning');await page.getByText('暂无收藏',{exact:true}).waitFor();
 offline=true;await page.locator('.collection-load-error').filter({hasText:'合成读取断连'}).waitFor();
 offline=false;await page.locator('.collection-load-error').waitFor({state:'detached'});
 assert.ok(healthy>=2);console.log('PASS collection same-version reconnect clears only read error');
}finally{await browser.close();await app.close();}
