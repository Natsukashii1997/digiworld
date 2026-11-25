// 派单362方案A：真实组件，合成API；视频记录五个时刻，业务成功/失败与运行时reduce单独断言。
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {chromium} from 'playwright';
import {contextFixture} from './context-fixture.mjs';
import {aihot202Data} from './aihot-v16-fixture.mjs';
import {enterNew175,replace175,post175} from './notes-editor-helpers175.mjs';
const out=process.env.GUIJI_TEST_RESULTS||'test-results/continuous362-motion';await mkdir(out,{recursive:true});
const app=await contextFixture(),browser=await chromium.launch(),errors=[],report=[];
let context,page;
async function open(name,route='assets',reduced='no-preference',width=1440){
 context=await browser.newContext({viewport:{width,height:900},reducedMotion:reduced,permissions:['clipboard-read','clipboard-write'],recordVideo:{dir:join(out,'raw-video'),size:{width,height:900}}});
 page=await context.newPage();page.setDefaultTimeout(10000);page.on('pageerror',e=>errors.push(e.message));
 await page.addInitScript(()=>{window.scanEvents=[];window.caughtCount=0;addEventListener('guiji:data-caught',()=>window.caughtCount++);new MutationObserver(records=>{for(const record of records)for(const el of record.addedNodes)if(el.nodeType===1&&el.dataset.scanKind)window.scanEvents.push(el.dataset.scanKind);}).observe(document,{childList:true,subtree:true});});
 await page.route('**/*',r=>{assert.equal(new URL(r.request().url()).origin,new URL(app.url).origin,'禁止外连');return r.continue();});
 await page.goto(app.url+'/#'+route);await page.locator('main h1').waitFor();await page.waitForTimeout(700);
 page.videoName=name;return page;
}
async function close(){const video=page.video(),name=page.videoName;await context.close();await video.saveAs(join(out,name+'.webm'));context=null;}
async function waitKind(kind){await page.locator(`[data-scan-kind="${kind}"]`).waitFor({state:'attached'});}
async function metric(kind,duration,delay=0){
 const data=await page.locator(`[data-scan-kind="${kind}"]`).first().evaluate(el=>({height:parseFloat(getComputedStyle(el.querySelector('.scan-line')).height),tail:parseFloat(getComputedStyle(el.querySelector('.scan-tail')).height),glow:getComputedStyle(el.querySelector('.scan-line')).boxShadow,timings:el.getAnimations({subtree:true}).map(a=>({duration:a.effect.getTiming().duration,delay:a.effect.getTiming().delay,easing:a.effect.getTiming().easing,properties:Object.keys(a.effect.getKeyframes()[0]).filter(k=>!['offset','easing','composite','computedOffset'].includes(k))}))}));
 assert(data.timings.every(t=>t.duration===duration&&t.delay===delay&&t.easing==='cubic-bezier(0.4, 0, 0.6, 1)'));
 assert(data.timings.every(t=>t.properties.every(k=>['transform','opacity','clipPath'].includes(k))));
 if(kind!=='hover'){assert.equal(data.height,2);assert.equal(data.tail,60);}
 report.push({kind,duration,delay,...data});
}
try{
 await open('01-route');
 await page.locator('.nav').getByRole('button',{name:/^项目空间/}).first().click();await waitKind('route');await metric('route',440);await page.waitForTimeout(550);
 await page.getByRole('button',{name:/^设置/}).first().click();await page.waitForTimeout(650);
 const routes=await page.evaluate(()=>scanEvents.filter(k=>k==='route').length);await page.getByRole('button',{name:'重新自检',exact:true}).click();await page.waitForTimeout(250);assert.equal(await page.evaluate(()=>scanEvents.filter(k=>k==='route').length),routes,'页内重新自检不触发路由扫描');
 assert.equal(await page.locator('.save-dot').evaluate(el=>getComputedStyle(el).animationName),'none');assert.equal(await page.locator('.topbar-search').evaluate(el=>getComputedStyle(el,'::after').animationName),'none');await close();
 await open('02-hover');const cover=page.locator('.card-open .cover.lcd').first();await cover.hover();await waitKind('hover');await metric('hover',520,60);await page.waitForTimeout(650);const first=await page.evaluate(()=>scanEvents.filter(k=>k==='hover').length);await page.waitForTimeout(700);assert.equal(await page.evaluate(()=>scanEvents.filter(k=>k==='hover').length),first,'停留不重放');await page.mouse.move(1430,50);await cover.hover();await waitKind('hover');await page.waitForTimeout(650);await close();
 await open('03-panel');await page.getByRole('button',{name:/查看 把模糊想法/}).click();await page.locator('.scan-frame').waitFor({state:'attached'});assert.match(await page.getByRole('dialog').innerText(),/把模糊想法/,'飞框时内容已渲染');await waitKind('panel');await metric('panel',380,300);await page.waitForTimeout(760);assert.equal(await page.locator('.scan-frame').count(),0);await page.keyboard.press('Escape');
 await page.locator('.topbar-search').click();await page.getByRole('dialog').waitFor();await page.waitForTimeout(760);await page.keyboard.press('Escape');await page.locator('.topbar-inbox').click();await waitKind('panel');assert.equal(await page.locator('.ib-drawer').evaluate(el=>getComputedStyle(el).animationName),'none');await page.waitForTimeout(760);await page.keyboard.press('Escape');await close();
 await open('04-read');let release;const gate=new Promise(done=>release=done);await page.route('**/api/aihot',async r=>{await gate;await r.fulfill({json:aihot202Data()});});await page.getByRole('button',{name:/^AI HOT/}).first().click();await page.locator('.reading:not(.reading-mini)').waitFor();assert.equal(await page.locator('.reading:not(.reading-mini) .reading-dot').count(),200);assert.equal(await page.locator('.reading-label').innerText(),'READING · 读取中');assert.equal(await page.locator('.reading-col').first().evaluate(el=>getComputedStyle(el).animationDuration),'0.9s');await page.waitForTimeout(1100);release();await page.locator('.ah-card').first().waitFor();await page.waitForTimeout(550);assert.equal(await page.evaluate(()=>scanEvents.filter(k=>k==='read').length),0,'切页后的慢首读只显示内容，不补第二道线（常浩378）');
 const readCount=await page.evaluate(()=>scanEvents.filter(k=>k==='read').length);
 let releaseRefresh;const refreshGate=new Promise(done=>releaseRefresh=done);
 await page.route('**/api/aihot/refresh',async r=>{await refreshGate;await r.fulfill({status:503,json:{error:'合成刷新失败，旧缓存保留'}});});
 await page.getByRole('button',{name:'立即刷新',exact:true}).click();await page.locator('.ah-busy').waitFor();releaseRefresh();await page.locator('.ah-busy').waitFor({state:'hidden'});await page.waitForTimeout(500);
 assert.equal(await page.evaluate(()=>scanEvents.filter(k=>k==='read').length),readCount,'刷新失败保留旧成功缓存，不扫描旧内容');assert(await page.locator('.ah-card').count()>0);
 await page.unroute('**/api/aihot/refresh');await page.route('**/api/aihot/refresh',r=>r.fulfill({json:aihot202Data()}));
 await page.getByRole('button',{name:'立即刷新',exact:true}).click();await waitKind('read');await metric('read',420);await page.waitForTimeout(550);await close();
 await open('05-success');await page.getByRole('button',{name:/查看 把模糊想法/}).click();await page.waitForTimeout(760);await page.getByRole('button',{name:'复制全文',exact:true}).click();await page.locator('.data-bit').first().waitFor({state:'attached'});await waitKind('success');await metric('success',260);assert.equal(await page.locator('.scan-success').evaluate(el=>getComputedStyle(el).getPropertyValue('--scan-color').trim()),'#a6e36e');await page.waitForTimeout(500);await page.keyboard.press('Escape');
 await page.locator('.nav').getByRole('button',{name:/^随手记/}).first().click();await page.waitForTimeout(650);await enterNew175(page);await replace175(page,'合成扫描线保存验证');const caught=await page.evaluate(()=>caughtCount);await post175(page);await page.waitForTimeout(1300);assert.equal(await page.evaluate(()=>caughtCount),caught+1,'一次确认保存只飞一次');assert((await app.repository.read()).notes.some(n=>n.text==='合成扫描线保存验证'));await close();
 await open('06-reduced','assets','reduce',390);await page.getByRole('button',{name:/查看 把模糊想法/}).click();await page.getByRole('button',{name:'复制全文',exact:true}).click();assert.equal(await page.locator('.scan-surface,.scan-frame,.data-bit').count(),0);await page.waitForFunction(()=>caughtCount===1);assert.equal(await page.evaluate(()=>caughtCount),1);await page.screenshot({path:join(out,'reduced-390.png'),fullPage:true});await page.keyboard.press('Escape');await page.setViewportSize({width:1440,height:900});await page.emulateMedia({reducedMotion:'no-preference'});await page.getByRole('button',{name:/查看 把模糊想法/}).click();await page.waitForTimeout(760);await page.getByRole('button',{name:'复制全文',exact:true}).click();await page.locator('.data-bit').first().waitFor({state:'attached'});await page.emulateMedia({reducedMotion:'reduce'});await page.waitForTimeout(80);assert.equal(await page.locator('.scan-surface,.scan-frame,.data-bit').count(),0,'运行时reduce清掉已有装饰');
 const before=await page.evaluate(()=>caughtCount);await page.evaluate(()=>Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:async()=>{throw Error('合成剪贴板拒绝');}}}));await page.getByRole('button',{name:'复制全文',exact:true}).click();await page.waitForTimeout(250);assert.equal(await page.evaluate(()=>caughtCount),before,'复制失败不报成功');await close();
 assert.deepEqual(errors,[]);await writeFile(join(out,'report.json'),JSON.stringify({report,errors},null,2));console.log('continuous362-motion-browser: all passed');
}finally{await context?.close();await browser.close();await app.close();}
