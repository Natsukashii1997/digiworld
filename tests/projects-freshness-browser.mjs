import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {fixture183,routes183} from './projects-v16-fixture.mjs';
const app=await fixture183(),browser=await chromium.launch(),page=await browser.newPage({permissions:['clipboard-read','clipboard-write'],reducedMotion:'reduce'});
page.setDefaultTimeout(6000);const errors=[];page.on('pageerror',e=>errors.push(e.message));
await routes183(page,app);let calls=0,hold=false,release,held=false;
await page.route('**/api/project-status/inspect',async route=>{calls++;const payload=structuredClone({items:app.data.items});if(hold){hold=false;held=true;await new Promise(r=>release=r);}await route.fulfill({json:payload});});
const card=page.getByRole('article',{name:'项目状态卡：个人 AI 工作台',exact:true}),bar=page.getByRole('region',{name:'发车',exact:true});
try{
 await page.goto(app.url+'/#home');await page.getByRole('button',{name:/^项目空间/}).click();await card.getByRole('button',{name:'继续',exact:true}).waitFor();
 const first=calls;app.data.items[0].current.fields.next='继续之前的新下一步';await card.getByRole('button',{name:'继续',exact:true}).click();await bar.getByRole('button',{name:'预览口令',exact:true}).click();assert.ok(calls>first);assert.match(await bar.getByLabel('口令预览').innerText(),/继续之前的新下一步/);
 await page.evaluate(()=>{window.writes=0;navigator.clipboard.writeText=async()=>{window.writes++;};});
 app.data.items[0].current.fields.next='同编号的新决定';await bar.getByRole('button',{name:'只复制',exact:true}).click();await page.getByText('项目内容或目录已变化，请收起后重新继续并预览。').first().waitFor();assert.equal(await page.evaluate(()=>window.writes),0);assert.equal(((await app.repository.read()).collabLog||[]).length,0);
 await page.keyboard.press('Escape');await card.getByRole('button',{name:'继续',exact:true}).click();await bar.getByRole('button',{name:'预览口令',exact:true}).click();app.data.items[0].current.path='docs/CURRENT.md';await bar.getByRole('button',{name:'只复制',exact:true}).click();await page.getByText('项目内容或目录已变化，请收起后重新继续并预览。').first().waitFor();assert.equal(await page.evaluate(()=>window.writes),0);
 await page.keyboard.press('Escape');app.data.items[0].current.fields.next='窗口重新聚焦的新决定';await page.evaluate(()=>window.dispatchEvent(new Event('focus')));await card.getByText('窗口重新聚焦的新决定',{exact:true}).waitFor();
 hold=true;await page.evaluate(()=>window.dispatchEvent(new Event('focus')));for(let i=0;i<50&&!held;i++)await new Promise(r=>setTimeout(r,20));assert.ok(held);app.data.items[0].current.fields.next='后发新请求';await page.evaluate(()=>window.dispatchEvent(new Event('focus')));await card.getByText('后发新请求',{exact:true}).waitFor();release();await page.waitForTimeout(100);assert.equal(await card.getByText('后发新请求',{exact:true}).count(),1);
 await page.getByRole('button',{name:'基地',exact:true}).click();app.data.items[0].current.fields.next='重进项目页的新决定';await page.getByRole('button',{name:/^项目空间/}).click();await card.getByText('重进项目页的新决定',{exact:true}).waitFor();
 assert.deepEqual(errors,[]);console.log('PASS F06 continue/copy fresh read, same-stateId next/path drift blocks copy, focus/reentry refresh, late response ignored');
}finally{release?.();await browser.close();await app.close();}
