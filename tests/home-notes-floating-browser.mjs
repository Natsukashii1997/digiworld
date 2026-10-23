import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { fixture } from './fixture.mjs';
import { seed } from '../src/store.js';

const app=await fixture(),browser=await chromium.launch();
const state=seed();state.notes=[];await app.repository.write(state,{initialize:true});
const page=await browser.newPage();page.setDefaultTimeout(5000);
try {
 await page.goto(app.url+'/');
 const input=page.getByRole('textbox',{name:'记一笔'});
 await input.fill('合成首页待重试内容');
 let rejected=false;
 await page.route('**/api/workspace',async route=>{
  if(route.request().method()==='PUT'&&!rejected){rejected=true;await route.fulfill({status:400,contentType:'application/json',body:JSON.stringify({error:'合成首次拒绝，尚未提交'})});return;}
  await route.continue();
 });
 await page.getByRole('button',{name:'保存随手记'}).click();
 await page.getByText('没有查到这条记录，输入已保留；可核对并重试。',{exact:true}).waitFor();
 const {token}=await(await fetch(app.url+'/api/session',{headers:{'X-Workbench-Client':'1'}})).json();
 const response=await fetch(app.url+'/api/notes/float-concurrent-note',{method:'PUT',headers:{'X-Workbench-Token':token,'Content-Type':'application/json'},body:JSON.stringify({id:'float-concurrent-note',at:new Date().toISOString(),text:'合成悬浮球并发便签',base:null})});
 assert.equal(response.status,200);
 await page.getByRole('button',{name:'核对并重试随手记'}).click();
 await page.waitForFunction(()=>document.querySelector('input[aria-label="记一笔"]')?.value==='',{},{timeout:5000});
 const stored=await app.repository.read();
 assert.equal(stored.notes.filter(n=>n.text==='合成首页待重试内容').length,1);
 assert.equal(stored.notes.filter(n=>n.text==='合成悬浮球并发便签').length,1);
 console.log('PASS home same-ID retry after floating window commit preserves both notes');
} finally { await browser.close();await app.close(); }
