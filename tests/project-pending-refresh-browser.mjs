import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {fixture183,routes183} from './projects-v16-fixture.mjs';
const app=await fixture183(),b=await chromium.launch(),p=await b.newPage({viewport:{width:430,height:1000},permissions:['clipboard-read','clipboard-write'],reducedMotion:'reduce'});p.setDefaultTimeout(7000);await routes183(p,app);const ids=[];
await p.route('**/api/collab/record',async r=>{ids.push(r.request().postDataJSON().id);const response=await r.fetch();return r.fulfill(ids.length===1?{status:503,json:{error:'合成回执丢失'}}:{response});});
try{
 await p.goto(app.url+'/#projects');await p.getByRole('tab',{name:/个人 AI 工作台/}).click();const bar=p.getByRole('article',{name:'项目状态卡：个人 AI 工作台',exact:true});await bar.getByLabel('复制后打开',{exact:false}).uncheck();await p.evaluate(()=>{window.writes=0;navigator.clipboard.writeText=async()=>{window.writes++;};});await bar.locator('.pj-give').click();await p.getByRole('button',{name:'补记留痕',exact:true}).waitFor();
 app.data.items[1].activity.latestAt='2099-01-01T00:00:00Z';await p.evaluate(()=>window.dispatchEvent(new Event('focus')));await p.waitForTimeout(200);await p.getByRole('button',{name:'补记留痕',exact:true}).click();await p.getByRole('button',{name:'补记留痕',exact:true}).waitFor({state:'detached'});
 assert.equal(ids.length,2);assert.equal(ids[0],ids[1]);assert.equal(await p.evaluate(()=>window.writes),1);assert.equal((await app.repository.read()).collabLog.length,1);console.log('PASS focus reorder preserves pending receipt, same ID, one copy');
}finally{await b.close();await app.close();}
