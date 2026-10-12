// Regression for actual result roots replacing a loading branch and decoration failure isolation.
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {chromium} from 'playwright';
import {morningFixture,validMorningOutputs} from './night-v2-morning-fixture.mjs';
import {batch3Routes} from './ui-v14-batch3-fixture.mjs';
const out=process.env.GUIJI_TEST_RESULTS||'test-results/continuous362-read-errors';await mkdir(out,{recursive:true});
const app=await morningFixture({outputs:validMorningOutputs}),browser=await chromium.launch(),errors=[],records=[];
let context;
try {
 const run=await app.approveAndComplete();app.controls.setNow('2026-10-07T07:05:00+08:00');
 const session=await (await fetch(app.url+'/api/session',{headers:{'x-workbench-client':'1'}})).json();
 const res=await fetch(app.url+'/api/night-v2/morning/reconcile',{method:'POST',headers:{'content-type':'application/json','x-workbench-token':session.token},body:JSON.stringify({runId:run.runId})});assert.equal(res.status,200);
 for(const fails of [false,true]) {
  context=await browser.newContext({viewport:{width:1440,height:1000},reducedMotion:'no-preference'});const page=await context.newPage();page.setDefaultTimeout(10000);page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/*',r=>{assert.equal(new URL(r.request().url()).origin,new URL(app.url).origin);return r.continue();});await batch3Routes(page);
  await page.addInitScript(()=>{window.readScans=[];new MutationObserver(records=>{for(const record of records)for(const el of record.addedNodes)if(el.nodeType===1&&el.dataset.scanKind==='read')window.readScans.push(el.getBoundingClientRect().toJSON());}).observe(document,{subtree:true,childList:true});});
  let release;const gate=new Promise(done=>release=done);
  await page.route('**/api/night-v2/output?**',async route=>{await gate;if(fails)await route.fulfill({status:503,json:{error:'合成产出读取失败'}});else await route.continue();});
  await page.goto(app.url+'/#night/report/'+run.runId+'/n3-slot-1');await page.getByTestId('night-output-loading').waitFor();await page.waitForTimeout(1000);assert.equal(await page.locator('.reading-dot').count(),200);await page.evaluate(()=>{readScans=[];});release();
  if(fails){await page.getByTestId('night-output-error').waitFor();await page.waitForTimeout(150);assert.equal(await page.evaluate(()=>readScans.length),0,'失败分支不报读取成功');assert.equal(await page.getByTestId('night-output-error').evaluate(el=>getComputedStyle(el).clipPath),'none','错误完整可见');}
  else {await page.locator('.nv-report-shell').waitFor();await page.waitForTimeout(150);assert.equal(await page.evaluate(()=>readScans.length),0,'进入页面后页面自己读完只显示内容，不补第二道线（常浩378）');assert.equal(await page.getByTestId('night-output-loading').count(),0);assert.equal(await page.locator('.nv-report-shell').count(),1,'新内容已在DOM中');await page.waitForTimeout(550);}
  await page.screenshot({path:join(out,fails?'failed.png':'ready.png'),fullPage:true});records.push({fails,scans:await page.evaluate(()=>readScans.length)});
  await page.evaluate(()=>{document.querySelector('.main-content').getAnimations=()=>{throw Error('合成动画API故障');};});
  await page.getByRole('button',{name:/^项目空间/}).first().click();await page.getByRole('heading',{name:'项目空间',exact:true}).waitFor();
  await context.close();context=null;
 }
 assert.deepEqual(errors,[]);await writeFile(join(out,'report.json'),JSON.stringify({records,errors},null,2));console.log('continuous362-read-errors-browser: all passed');
}finally {await context?.close();await browser.close();await app.close();}
