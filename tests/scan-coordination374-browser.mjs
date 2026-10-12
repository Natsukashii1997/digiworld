// Real application components with synthetic APIs; measure every animation frame.
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {chromium} from 'playwright';
import {PAGES} from '../src/pages.js';
import {fixture189,routes189} from './savepoints-v16-fixture.mjs';
import {aihot202Data} from './aihot-v16-fixture.mjs';

const out=process.env.GUIJI_TEST_RESULTS||'test-results/scan-coordination374';
await mkdir(out,{recursive:true});
const pages=PAGES.filter(p=>!p.navHidden&&!p.mergedInto),widths=[390,768,1024,1280,1440,1920];
assert.equal(pages.length,14);
const app=await fixture189('empty'),browser=await chromium.launch(),records=[],errors=[],blocked=[];
const pause=ms=>new Promise(done=>setTimeout(done,ms));

function monitor(){
 window.scanAudit={events:[],frames:0,max:0,overlaps:[]};
 const frame=()=>{
  const a=window.scanAudit;
  const surfaces=[...document.querySelectorAll('.scan-surface')].filter(el=>el.dataset.scanKind!=='success').map(el=>({kind:el.dataset.scanKind,left:parseFloat(el.style.left),top:parseFloat(el.style.top),right:parseFloat(el.style.left)+parseFloat(el.style.width),bottom:parseFloat(el.style.top)+parseFloat(el.style.height)}));
  a.frames++;a.max=Math.max(a.max,surfaces.length);
  for(let i=0;i<surfaces.length;i++)for(let j=i+1;j<surfaces.length;j++){
   const x=surfaces[i],y=surfaces[j];
   if(Math.max(0,x.left,y.left)<Math.min(innerWidth,x.right,y.right)&&Math.max(0,x.top,y.top)<Math.min(innerHeight,x.bottom,y.bottom)&&a.overlaps.length<5)a.overlaps.push({at:Math.round(performance.now()),surfaces:[x,y]});
  }
  requestAnimationFrame(frame);
 };
 requestAnimationFrame(frame);
 new MutationObserver(records=>{for(const r of records)for(const el of r.addedNodes)if(el.nodeType===1&&el.dataset.scanKind)scanAudit.events.push({kind:el.dataset.scanKind,at:Math.round(performance.now())});}).observe(document,{childList:true,subtree:true});
}
async function open(width,profile,reduced=false){
 const context=await browser.newContext({viewport:{width,height:1000},reducedMotion:reduced?'reduce':'no-preference'}),page=await context.newPage();
 const pending=new Set();
 page.on('request',r=>{if(new URL(r.url()).pathname.startsWith('/api/'))pending.add(r);});
 page.on('requestfinished',r=>pending.delete(r));page.on('requestfailed',r=>pending.delete(r));
 page.setDefaultTimeout(10000);page.on('pageerror',e=>errors.push(e.message));
 await page.addInitScript(monitor);
 await page.route('**/*',r=>{if(new URL(r.request().url()).origin!==new URL(app.url).origin){blocked.push(r.request().url());return r.abort();}return r.continue();});
 const delay=profile==='slow'?900:profile==='error'?650:120;
 await page.route('**/api/**',async r=>{
  const path=new URL(r.request().url()).pathname;
  if(path==='/api/session')return r.continue();
  await pause(path==='/api/workspace'?200:delay);
  if(profile==='error'&&path!=='/api/workspace')return r.fulfill({status:503,json:{error:'合成读取失败'}});
  return r.continue();
 });
 await page.route('**/api/aihot',async r=>{await pause(delay);return r.fulfill(profile==='error'?{status:503,json:{error:'合成读取失败'}}:{json:aihot202Data()});});
 await routes189(page,app,{inspect:async(r,body,data)=>{await pause(delay);return r.fulfill(profile==='error'?{status:503,json:{error:'合成读取失败'}}:{json:{...data.report,projectId:body.projectId,offset:body.offset||0}});}});
 return {context,page,pending};
}
async function settle(page,pending){
 let idleSince=0;const deadline=Date.now()+10000;
 while(Date.now()<deadline){
  if(pending.size===0&&await page.locator('.scan-surface').count()===0){if(!idleSince)idleSince=Date.now();if(Date.now()-idleSince>=300)return;}
  else idleSince=0;
  await page.waitForTimeout(50);
 }
 throw Error('Synthetic reads and scans did not settle within 10 seconds');
}
async function capture(page,name,extra={}){
 const data=await page.evaluate(()=>({heading:document.querySelector('main h1')?.textContent,remaining:document.querySelectorAll('.scan-surface').length,...scanAudit}));
 records.push({name,...extra,...data});
 if(data.overlaps.length)await page.screenshot({path:join(out,name+'-overlap.png')});
 return data;
}
async function runCase(job){
 const {context,page,pending}=await open(job.width,job.profile,job.reduced);
 const name=[job.mode,job.profile,job.reduced?'reduce':'motion',job.width,job.route.id].join('-');
 try{
  await page.goto(app.url+'/#'+(job.mode==='navigate'?'assets':job.route.id));
  await page.locator('main h1').waitFor();
  if(job.mode==='navigate'){
   await page.waitForTimeout(2600);
   if(job.route.id==='assets'){await page.getByRole('button',{name:/^世界总览/}).first().click();await page.waitForTimeout(1600);}
   await page.evaluate(()=>{scanAudit={events:[],frames:0,max:0,overlaps:[]};});
   await page.getByRole('button',{name:new RegExp('^'+job.route.label)}).first().click();
  }
  await page.waitForTimeout(job.profile==='slow'?3300:2000);
  await settle(page,pending);
  const data=await capture(page,name,{mode:job.mode,profile:job.profile,width:job.width,route:job.route.id,reduced:!!job.reduced});
  assert.equal(data.heading,job.route.title,name+' renders its registered page');
  assert.equal(data.overlaps.length,0,name+' cannot overlay cyan scan regions');
  assert.equal(data.remaining,0,name+' releases all scan surfaces');
  assert(data.frames>20,name+' was observed across animation frames');
  if(job.reduced)assert.equal(data.events.length,0,name+' disables decoration');
  else assert.equal(data.events.filter(e=>e.kind==='route').length,1,name+' keeps one route scan');
  if(job.mode==='direct'&&job.profile==='fast'&&!job.reduced)await page.screenshot({path:join(out,name+'.png'),fullPage:true});
 }catch(e){records.push({name,error:e.message});}finally{await context.close();}
}
try{
 const jobs=[];
 for(const width of widths)for(const route of pages)jobs.push({mode:'direct',profile:'fast',width,route});
 for(const profile of ['slow','error'])for(const route of pages)jobs.push({mode:'direct',profile,width:1440,route});
 for(const profile of ['fast','slow'])for(const route of pages)jobs.push({mode:'navigate',profile,width:1440,route});
 for(const width of [390,1440])for(const route of pages)jobs.push({mode:'direct',profile:'fast',width,route,reduced:true});
 let next=0;await Promise.all(Array.from({length:3},async()=>{while(next<jobs.length)await runCase(jobs[next++]);}));
 console.log('page matrix complete: '+jobs.length+' scenarios');
 // Keep route/reading cleanups correct when every page is left before its scan finishes.
 const rapid=await open(1440,'slow');
 try{
  await rapid.page.goto(app.url+'/#assets');await rapid.page.locator('main h1').waitFor();await rapid.page.waitForTimeout(3300);
  await rapid.page.evaluate(()=>{scanAudit={events:[],frames:0,max:0,overlaps:[]};});
  for(const route of pages){await rapid.page.getByRole('button',{name:new RegExp('^'+route.label)}).first().click();await rapid.page.waitForTimeout(35);}
  await rapid.page.waitForTimeout(3300);await settle(rapid.page,rapid.pending);const data=await capture(rapid.page,'rapid-all-14');
  assert.equal(data.overlaps.length,0);assert.equal(data.remaining,0);
 }finally{await rapid.context.close();}
 // A subsequent manual result read is still animated after initial entry completes.
 const refresh=await open(1440,'slow');
 try{
  await refresh.page.goto(app.url+'/#history');await refresh.page.locator('.sp-pending').waitFor();await refresh.page.waitForTimeout(1500);
  await refresh.page.evaluate(()=>{scanAudit={events:[],frames:0,max:0,overlaps:[]};});
  await refresh.page.getByRole('button',{name:'刷新存档点',exact:true}).click();await refresh.page.waitForTimeout(2600);
  await settle(refresh.page,refresh.pending);const data=await capture(refresh.page,'history-manual-refresh');assert.equal(data.overlaps.length,0);assert.equal(data.events.filter(e=>e.kind==='read').length,1);
 }finally{await refresh.context.close();}
 // Independently mounted panels can visually overlap the main region during entry.
 for(const panel of ['search','inbox']){
  const early=await open(1440,'slow');
  try{
   await early.page.goto(app.url+'/#assets');await early.page.locator('main h1').waitFor();
   assert.equal(await early.page.locator('.scan-surface[data-scan-kind="route"]').count(),1,'panel opens during an active route scan');
   await early.page.locator('.topbar-'+panel).click();await early.page.getByRole('dialog').waitFor();
   await early.page.waitForTimeout(2000);await settle(early.page,early.pending);
   const data=await capture(early.page,'early-'+panel+'-panel');
   assert.equal(data.overlaps.length,0);assert.equal(data.remaining,0);
   assert.equal(data.events.filter(e=>e.kind==='panel').length,1);
   await early.page.keyboard.press('Escape');
  }finally{await early.context.close();}
 }
 assert.deepEqual(errors,[]);assert.deepEqual(blocked,[]);
 assert.deepEqual(records.filter(r=>r.error),[]);
 console.log('scan-coordination374-browser: all passed');
}finally{
 await writeFile(join(out,'report.json'),JSON.stringify({pages:pages.map(p=>({id:p.id,title:p.title})),widths,records,errors,blocked},null,2));
 await browser.close();await app.close();
}
