import assert from 'node:assert/strict';
import {readFile,mkdir} from 'node:fs/promises';
import {chromium} from 'playwright';
import {collectionFixture} from './collection-fixture.mjs';

const app=await collectionFixture({fetchImpl:async url=>new Response(String(url).includes('douyinvod')?Buffer.from('synthetic video bytes'):Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/5m8AAAAASUVORK5CYII=','base64'),{headers:{'content-type':String(url).includes('douyinvod')?'video/mp4':'image/png'}})});
const browser=await chromium.launch();
try {
  const page=await browser.newPage({viewport:{width:390,height:844}}),a='7421234567890123456',b='7421234567890123457';
  await page.route('**/*',route=>route.fulfill({contentType:'text/html',body:'<!doctype html><html lang="zh"><body><div id="root"><h1>合成抖音详情</h1></div></body></html>'}));
  await page.goto(`https://www.douyin.com/user/self?showTab=collection&modal_id=${a}`);
  await page.exposeFunction('importToFixture',async message=>message.type==='GET_IMPORT_STATUS'?app.api('/operations/'+message.operationId):app.importNote(message.note,message.operationId));
  await page.evaluate(id=>{
    window.__ROUTER_DATA__={loaderData:{detail:{aweme_detail:{aweme_id:id,desc:'抖音合成作品 A #食谱',author:{nickname:'合成作者'},video:{cover:{url_list:['https://p3.douyinpic.com/a.png']},play_addr:{url_list:['https://v3.douyinvod.com/a.mp4']}}}}}};
    window.calls=[];window.chrome={runtime:{sendMessage(message,reply){window.calls.push(message);window.importToFixture(message).then(result=>reply({ok:true,...result}));}}};
  },a);
  for(const file of ['card-drag-helpers.js','page-data.js','douyin-data.js','content.js'])await page.addScriptTag({content:await readFile('browser-extension/collection/'+file,'utf8')});
  const button=page.locator('#kankan-note-import-button');await button.click();await button.getByText('已收藏',{exact:true}).waitFor();
  let notes=(await app.api('/notes')).notes;assert.equal(notes[0].id,'douyin-'+a);assert.equal(notes[0].origin,'douyin');assert.equal(notes[0].videoStatus,'ready');
  await button.click();await button.getByText('已更新',{exact:true}).waitFor();assert.equal((await app.api('/notes')).notes.length,1);
  // Route changes before page data. Never import A as B.
  await page.evaluate(id=>history.pushState({},'',`/user/self?showTab=collection&modal_id=${id}`),b);
  await assert.rejects(page.evaluate(()=>captureCurrentNote()),/尚在加载/);
  await page.evaluate(id=>{
    window.__ROUTER_DATA__={};
    const aweme={awemeId:id,desc:'抖音合成图文 B',author:{nickname:'图文作者'},images:[{urlList:['https://p3.douyinpic.com/b.png']}],video:{playAddr:{urlList:['https://v3.douyinvod.com/music.mp4']}}};
    document.querySelector('#root').__reactProps$fixture={children:{props:{aweme}}};
    document.dispatchEvent(new CustomEvent('kankan-note-capture-request'));
  },b);
  await page.waitForFunction(()=>cachedPageData?.ready&&cachedPageData.id.endsWith('457'));
  // Full note drag uses the same import format as existing Xiaohongshu.
  const dragged=await button.evaluate(node=>{const dataTransfer=new DataTransfer();node.dispatchEvent(new DragEvent('dragstart',{bubbles:true,dataTransfer}));return dataTransfer.getData('text/plain');});
  const payload=JSON.parse(dragged.slice('KANKAN_NOTE:'.length));assert.equal(payload.id,'douyin-'+b);assert.equal(payload.type,'normal');assert.equal(payload.videoUrl,'');
  await button.click();await button.getByText('已收藏',{exact:true}).waitFor();
  assert.equal((await app.api('/notes')).notes.length,2);
  await page.evaluate(id=>{window.__ROUTER_DATA__={work:{aweme_id:id,desc:'不能下载的视频',video:{play_addr:{url_list:['blob:unavailable']}}}};delete document.querySelector('#root').__reactProps$fixture;},b);
  await button.click();await page.getByRole('status').getByText('没有读取到视频',{exact:false}).waitFor();assert.equal((await app.api('/notes')).notes.length,2);
  for (const invalidLast of [false,true]) {
    await page.evaluate(({id,invalidLast})=>{window.__ROUTER_DATA__={work:{aweme_id:id,desc:'不能截断的图册',images:Array.from({length:21},(_,i)=>({url_list:[invalidLast&&i===20?'blob:unavailable':`https://p3.douyinpic.com/${i}.png`]}))}};},{id:b,invalidLast});
    await button.click();await page.getByRole('status').getByText('超过20张',{exact:false}).waitFor();assert.equal((await app.api('/notes')).notes.length,2);
  }
  assert.ok(await button.evaluate(node=>{const r=node.getBoundingClientRect();return r.left>=0&&r.right<=innerWidth&&r.height>=44;}));
  const ui=await browser.newPage({viewport:{width:1440,height:950},reducedMotion:'reduce'});
  await ui.route('**/*',route=>route.request().url().startsWith(app.url)?route.continue():route.abort());
  await ui.goto(app.url+'/#learning');await ui.getByText('抖音合成作品 A #食谱',{exact:true}).first().waitFor();
  await ui.getByRole('button',{name:'插件',exact:true}).click();await ui.getByRole('dialog',{name:'浏览器插件'}).getByText('在小红书或抖音点「收藏」',{exact:true}).waitFor();
  const evidence=process.env.GUIJI_TEST_RESULTS||'test-results/collection-douyin';await mkdir(evidence,{recursive:true});await ui.screenshot({path:evidence+'/setup-1440.png',fullPage:true});
  await ui.keyboard.press('Escape');await ui.screenshot({path:evidence+'/collection-1440.png',fullPage:true});
  await ui.setViewportSize({width:390,height:844});await ui.waitForFunction(()=>document.documentElement.scrollWidth<=innerWidth);await ui.screenshot({path:evidence+'/collection-390.png',fullPage:true});
  assert.ok(await ui.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  console.log('PASS Douyin click, update, SPA isolation, album drag, missing video, 390 control, local media and collection UI');
} finally {await browser.close();await app.close();}
