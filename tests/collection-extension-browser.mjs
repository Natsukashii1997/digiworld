import assert from 'node:assert/strict';
import {readFile,mkdir} from 'node:fs/promises';
import {chromium} from 'playwright';
const browser=await chromium.launch();
try {
  const page=await browser.newPage({viewport:{width:320,height:700}}),id='1'.repeat(24);
  await page.route('**/*',route=>route.fulfill({contentType:'text/html',body:'<!doctype html><html lang="zh"><body></body></html>'}));
  await page.goto('https://www.xiaohongshu.com/explore/'+id);
  await page.evaluate(id=>{window.__INITIAL_STATE__={note:{noteDetailMap:{[id]:{note:{noteId:id,title:'恢复收藏',desc:'测试',imageList:[]}}}}};window.calls=[];window.replies=[];window.chrome={runtime:{sendMessage(message,reply){window.calls.push(message);reply(window.replies.shift());}}};},id);
  for(const name of ['card-drag-helpers.js','page-data.js','content.js'])await page.addScriptTag({content:await readFile('browser-extension/collection/'+name,'utf8')});
  const button=page.locator('#kankan-note-import-button');
  await button.waitFor({state:'visible'});
  await page.evaluate(()=>{
    for(const node of document.querySelectorAll('#kankan-note-import-actions button')) {
      node.click();
      node.dispatchEvent(new MouseEvent('click',{bubbles:true}));
    }
    window.postMessage({source:'kankan-note-page-data',payload:{id:'1'.repeat(24),ready:true,title:'网页伪造数据',imageUrls:[],type:'normal'}},location.origin);
  });
  await page.waitForTimeout(100);
  assert.deepEqual(await page.evaluate(()=>window.calls),[]);
  assert.equal(await page.locator('#kankan-note-import-actions button:disabled').count(),0);
  await page.evaluate(()=>window.replies.push({ok:false,error:'点插件图标，先填入数码世界的配对码',operationNotStarted:true,statusCode:403},{ok:true,status:'complete',created:true}));
  await button.click();await page.getByRole('status').getByText('点插件图标',{exact:false}).waitFor();await button.click();await button.getByText('已收藏',{exact:true}).waitFor();assert.deepEqual(await page.evaluate(()=>window.calls.map(c=>c.type)),['IMPORT_NOTE','IMPORT_NOTE']);
  await page.evaluate(()=>{window.calls=[];window.replies.push({ok:false,error:'合成连接中断'},{ok:false,error:'没有找到本次收藏操作',statusCode:404},{ok:true,status:'complete',created:false});});
  await button.click();await page.getByRole('status').getByText('合成连接中断',{exact:true}).waitFor();const firstId=await page.evaluate(()=>window.calls[0].operationId);await button.click();await page.getByRole('status').getByText('操作记录不存在',{exact:false}).waitFor();assert.equal(await page.evaluate(()=>window.calls[1].operationId),firstId);await button.click();await button.getByText('已更新',{exact:true}).waitFor();assert.deepEqual(await page.evaluate(()=>window.calls.map(c=>c.type)),['IMPORT_NOTE','GET_IMPORT_STATUS','IMPORT_NOTE']);assert.notEqual(await page.evaluate(()=>window.calls[2].operationId),firstId);
  await page.evaluate(()=>window.replies.push({ok:false,error:'点 Chrome 地址栏右侧的拼图图标 → 数码世界·收藏，填写配对码',operationNotStarted:true,statusCode:403}));await button.click();await page.getByRole('status').getByText('点 Chrome 地址栏右侧的拼图图标',{exact:false}).waitFor();assert.ok(await button.evaluate(node=>node.getBoundingClientRect().left>=0&&node.getBoundingClientRect().right<=innerWidth));assert.ok(await page.getByRole('status').evaluate(node=>{const r=node.getBoundingClientRect();return r.left>=0&&r.right<=innerWidth;}));
  if(process.env.GUIJI_TEST_RESULTS){await mkdir(process.env.GUIJI_TEST_RESULTS,{recursive:true});await page.screenshot({path:process.env.GUIJI_TEST_RESULTS+'/error-320.png'});}
  await page.evaluate(()=>window.replies.push({ok:true,status:'complete',created:true}));
  const get=page.locator('#kankan-note-import-button-get');await get.focus();await page.keyboard.press('Enter');
  await page.getByRole('status').getByText('已收藏，GET状态请到同卡解析页查看',{exact:true}).waitFor();
  assert.equal(await page.evaluate(()=>window.calls.at(-1).mode),'get');
  console.log('PASS script clicks/messages blocked; trusted pointer and keyboard input; unpaired retry, unknown outcome queries same ID, explicit missing-operation retry, narrow error control');
} finally {await browser.close();}
