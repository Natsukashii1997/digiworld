import assert from 'node:assert/strict';
import {readFile,mkdir} from 'node:fs/promises';
import {chromium} from 'playwright';
import {collectionFixture} from './collection-fixture.mjs';
const out=process.env.GUIJI_TEST_RESULTS||'work/collection-get-extension';await mkdir(out,{recursive:true});
let calls=0,url;
const app=await collectionFixture({getPollMs:10,getClient:{session:async()=>({binding:'synthetic-account',create:async input=>{calls++;url=input.sourceUrl;return {taskId:'get-ui-task'};},progress:async()=>({status:'success',noteId:'1924043523523615136'}),detail:async()=>({title:'GET整理',content:'回填完整解析内容',sourceUrl:url})})}}),browser=await chromium.launch();
try {
 const page=await browser.newPage({viewport:{width:390,height:844}}),id='9'.repeat(24),next='8'.repeat(24);
 await page.route('**/*',r=>r.fulfill({contentType:'text/html',body:'<!doctype html><html lang="zh"><head><meta charset="UTF-8"></head><body><h1>合成小红书作品</h1></body></html>'}));
 await page.goto('https://www.xiaohongshu.com/explore/'+id);
 await page.exposeFunction('localCollection',async message=>message.type==='GET_IMPORT_STATUS'?app.api('/operations/'+message.operationId):app.api('/notes/import',{note:message.note,operationId:message.operationId,mode:message.mode}));
 await page.evaluate(id=>{window.__INITIAL_STATE__={note:{noteDetailMap:{[id]:{note:{noteId:id,title:'双动作测试',desc:'原始正文',imageList:[]}}}}};window.sent=[];window.chrome={runtime:{sendMessage(message,reply){window.sent.push(message);window.localCollection(message).then(result=>reply({ok:true,...result})).catch(e=>reply({ok:false,error:e.message}));}}};},id);
 for(const file of ['card-drag-helpers.js','page-data.js','content.js'])await page.addScriptTag({content:await readFile('browser-extension/collection/'+file,'utf8')});
 const direct=page.locator('#kankan-note-import-button'),get=page.locator('#kankan-note-import-button-get');
 for(const width of [1440,390,320]){await page.setViewportSize({width,height:844});for(const button of [direct,get])assert.ok(await button.evaluate(e=>{const b=e.getBoundingClientRect();return b.width>=44&&b.height>=44&&b.left>=0&&b.right<=innerWidth;}));const a=await direct.boundingBox(),b=await get.boundingBox();assert.equal(a.y,b.y);assert.ok(a.x+a.width<b.x);assert.ok(a.width<=72&&b.width<=72);assert.notEqual(await direct.evaluate(e=>getComputedStyle(e).backgroundColor),await get.evaluate(e=>getComputedStyle(e).backgroundColor));assert.equal(await direct.innerText(),'收藏');assert.equal(await get.innerText(),'GET+');await page.screenshot({path:out+'/buttons-'+width+'.png'});if(width===390)await page.screenshot({path:out+'/buttons-detail.png',clip:{x:a.x-12,y:a.y-12,width:b.x+b.width-a.x+24,height:a.height+24}});}
 await direct.click();await direct.getByText('已收藏',{exact:true}).waitFor();assert.equal(calls,0);
 await get.click();await page.getByRole('status').getByText('已收藏，GET状态请到同卡解析页查看',{exact:true}).waitFor();await page.screenshot({path:out+'/get-success-320.png'});
 let notes;for(let i=0;i<100;i++){notes=(await app.api('/notes')).notes;if(notes[0].getAnalysis?.status==='ready')break;await new Promise(r=>setTimeout(r,20));}
 assert.equal(calls,1);assert.equal(notes.length,1);assert.equal(notes[0].getAnalysis.content,'回填完整解析内容');
 await get.click();await page.waitForFunction(()=>window.sent.filter(x=>x.type==='IMPORT_NOTE').length===3);await page.getByRole('status').getByText('已收藏，GET状态请到同卡解析页查看',{exact:true}).waitFor();assert.equal(calls,1);
 assert.deepEqual(await page.evaluate(()=>window.sent.filter(x=>x.type==='IMPORT_NOTE').map(x=>x.mode)),['direct','get','get']);
 await page.evaluate(next=>{history.pushState({},'', '/explore/'+next);window.__INITIAL_STATE__={note:{noteDetailMap:{[next]:{note:{noteId:next,title:'切换后的作品',desc:'新作品正文',imageList:[]}}}}};},next);
 await page.waitForFunction(()=>document.querySelector('#kankan-note-import-button')?.textContent==='收藏');assert.equal(await page.locator('#kankan-note-import-actions button').count(),2);assert.equal(await page.locator('#kankan-note-import-actions').count(),1);
 await page.evaluate(()=>history.pushState({},'','/'));await page.waitForFunction(()=>!document.querySelector('#kankan-note-import-actions'));
 console.log('PASS two actions → local API → same-card GET; repeat no extra GET; SPA cleanup; 1440/390/320 controls');
}finally{await browser.close();await app.close();}
