import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {fixture183,routes183} from './projects-v16-fixture.mjs';
const app=await fixture183(),browser=await chromium.launch(),page=await browser.newPage({permissions:['clipboard-read','clipboard-write'],reducedMotion:'reduce'});
page.setDefaultTimeout(6000);const errors=[];page.on('pageerror',e=>errors.push(e.message));
await routes183(page,app);let calls=0,hold=false,release,held=false;
await page.route('**/api/project-status/inspect',async route=>{calls++;const payload=structuredClone({items:app.data.items});if(hold){hold=false;held=true;await new Promise(r=>release=r);}await route.fulfill({json:payload});});
const card=page.getByRole('article',{name:'项目状态卡：个人 AI 工作台',exact:true});
try{
 await page.goto(app.url+'/#home');await page.locator('.nav').getByRole('button',{name:/^项目空间/}).click();await page.getByRole('tab',{name:/个人 AI 工作台/}).click();await card.locator('.pj-give').waitFor();
 // 换卡带即重读：回到这盘时屏上是新下一步。
 const first=calls;app.data.items[0].current.fields.next='继续之前的新下一步';await page.getByRole('tab',{name:/银饰作品集/}).click();await page.getByRole('tab',{name:/个人 AI 工作台/}).click();await card.getByText('继续之前的新下一步',{exact:true}).waitFor();assert.ok(calls>first);
 await page.evaluate(()=>{window.writes=0;navigator.clipboard.writeText=async()=>{window.writes++;};});await card.getByLabel('复制后打开',{exact:false}).uncheck();
 // 同编号的新决定、CURRENT 路径变化：复制前重读发现不一致，不复制、不留痕。
 app.data.items[0].current.fields.next='同编号的新决定';await card.locator('.pj-give').click();await page.getByText(/项目内容或目录已变化，口令没有复制/).first().waitFor();assert.equal(await page.evaluate(()=>window.writes),0);assert.equal(((await app.repository.read()).collabLog||[]).length,0);await card.getByText('同编号的新决定',{exact:true}).waitFor();
 app.data.items[0].current.path='docs/CURRENT.md';await card.locator('.pj-give').click();await page.getByText(/项目内容或目录已变化，口令没有复制/).first().waitFor();assert.equal(await page.evaluate(()=>window.writes),0);
 app.data.items[0].current.fields.next='窗口重新聚焦的新决定';await page.evaluate(()=>window.dispatchEvent(new Event('focus')));await card.getByText('窗口重新聚焦的新决定',{exact:true}).waitFor();
 hold=true;await page.evaluate(()=>window.dispatchEvent(new Event('focus')));for(let i=0;i<50&&!held;i++)await new Promise(r=>setTimeout(r,20));assert.ok(held);app.data.items[0].current.fields.next='后发新请求';await page.evaluate(()=>window.dispatchEvent(new Event('focus')));await card.getByText('后发新请求',{exact:true}).waitFor();release();await page.waitForTimeout(100);assert.equal(await card.getByText('后发新请求',{exact:true}).count(),1);
 await page.getByRole('button',{name:'世界总览',exact:true}).click();app.data.items[0].current.fields.next='重进项目页的新决定';await page.locator('.nav').getByRole('button',{name:/^项目空间/}).click();await card.getByText('重进项目页的新决定',{exact:true}).waitFor();
 assert.deepEqual(errors,[]);console.log('PASS F06 cart select/copy fresh read, same-stateId next/path drift blocks copy, focus/reentry refresh, late response ignored');
}finally{release?.();await browser.close();await app.close();}
