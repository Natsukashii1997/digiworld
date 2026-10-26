import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import AxeBuilder from '@axe-core/playwright';
import { mkdir, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { fixture } from './fixture.mjs';
import { seed } from '../src/store.js';
import { createScroll, deleteScroll } from '../src/scrolls.js';
import { validateState } from '../server/schema.mjs';
import { aihot202Data } from './aihot-v16-fixture.mjs';
import { syntheticNote } from './collection-fixture.mjs';

const out=resolve(process.env.GUIJI_TEST_RESULTS || 'test-results/home-overview');
await mkdir(out,{recursive:true});
const browser=await chromium.launch();
const checks=[],errors=[];
// 用户 2026-10-26：侧栏顺序为世界总览 / 资产仓库 / 个人收藏 / 随手记 / 项目空间 / 逆向工程，首页改叫“世界总览”。
const expectedNav=['世界总览','资产仓库','个人收藏','随手记','项目空间','逆向工程','设置'];
const sharedState=seed();
sharedState.assets.forEach((a,i)=>a.versions.forEach(v=>v.at=`2026-10-16T0${i}:00:00.000Z`));
sharedState.assets[0].archived=true;
const firstScroll=createScroll([], '合成判断方法');
const secondScroll=createScroll(firstScroll.scrolls, '已删除不应出现');
sharedState.scrolls=deleteScroll(secondScroll.scrolls,secondScroll.scroll.id);
validateState(sharedState);
// 收藏 3 配本机封面且是视频，收藏 2 配外链封面（首页不得加载外链），收藏 1 无封面。
const covers={3:{coverUrl:'/collection-media/v1/media/n3/01.webp',type:'video'},2:{coverUrl:'https://example.com/outside.webp'}};
const notes=[3,1,2].map(i=>({...syntheticNote(i),savedAt:`2026-10-1${i}T08:00:00.000Z`,category:'工作方法',...(covers[i]||{})}));
let apps=[];
async function launch(staticRoot) {
  process.env.WORKBENCH_TEST_STATIC_ROOT=staticRoot;
  const app=await fixture();apps.push(app);await app.repository.write(sharedState,{initialize:true});return app;
}
async function open(app,width=1440,mode='full') {
 const context=await browser.newContext({viewport:{width,height:1000},timezoneId:'Asia/Shanghai',reducedMotion:'reduce',permissions:['clipboard-read','clipboard-write']});
 const page=await context.newPage();page.setDefaultTimeout(12000);
 page.on('pageerror',e=>errors.push(e.message));
 let fail=false,requests=[],delay=false;
 const data=aihot202Data(mode==='empty'?'empty':mode==='disabled'?'disabled':mode==='cached-error'?'failed':'full',mode==='long');
 if(mode==='corrupt') {data.cache.status='never';data.cache.error='缓存读取失败';data.cache.sections={selected:{items:[]},hot:{items:[]}};}
 const items=mode==='empty'?[]:notes.map(n=>({...n,title:mode==='long'?'长标题EnglishWithoutSpaces'.repeat(20):n.title}));
 await page.route('**/api/collection/notes',async route=>{
  requests.push(route.request().method()+' collection');
  if(delay)await new Promise(r=>setTimeout(r,500));
  if(mode==='error'||fail)return route.fulfill({status:503,json:{error:'合成收藏读取失败'}});
  return route.fulfill({json:{notes:items,revision:1,lastImportedAt:items[0]?.savedAt||''}});
 });
 await page.route('**/api/aihot',async route=>{
  requests.push(route.request().method()+' aihot');
  if(mode==='error'||fail)return route.fulfill({status:503,json:{error:'合成缓存读取失败'}});
  return route.fulfill({json:data});
 });
 await page.route('**/api/calendar/status',r=>r.fulfill({json:{available:true,supported:true,access:{calendar:'authorized',reminders:'authorized'}}}));
 await page.route('**/api/calendar/todos',r=>r.fulfill({json:{available:true,reminders:[{id:'home-due',title:'核对首页调整',completed:false,due:'2020-01-01T00:00:00.000Z',dueHasTime:true}]}}));
 await page.goto(app.url+'/#home');await page.locator('.hx-mod').first().waitFor();
 return {context,page,requests,setFail:v=>{fail=v;},setDelay:v=>{delay=v;}};
}
async function geometry(page,width) {
 const g=await page.evaluate(()=>({
  overflow:document.documentElement.scrollWidth-innerWidth,
  cards:[...document.querySelectorAll('.hx-mod')].map(el=>{const r=el.getBoundingClientRect();return {id:el.className,x:r.x,y:r.y,w:r.width,h:r.height,right:r.right,bottom:r.bottom};}),
  controls:[...document.querySelectorAll('.hx button,.hx a')].filter(el=>el.getBoundingClientRect().width).map(el=>({label:el.getAttribute('aria-label')||el.textContent,height:el.getBoundingClientRect().height})),
 }));
 assert.equal(g.overflow,0,`${width} overflow`);
 for(const c of g.cards)assert(c.w>0&&c.x>=-1&&c.right<=width+1,JSON.stringify(c));
 for(const c of g.controls)assert(c.height>=43.5,`${width} small control ${JSON.stringify(c)}`);
 // 用户 2026-10-26 四块：DOM 顺序为收藏、资产、随手记、项目，宽屏时收藏与随手记同行、资产与项目同行。
 if(width>760)for(const [l,r] of [[0,2],[1,3]])assert(Math.abs(g.cards[l].y-g.cards[r].y)<1&&Math.abs(g.cards[l].bottom-g.cards[r].bottom)<1,`${width} unequal cards`);
 else for(let i=1;i<4;i++)assert(g.cards[i].y>=g.cards[i-1].bottom,`${width} order`);
 return g;
}
try {
 const base=process.env.HOME_BASELINE_DIST;
 if(base){const app=await launch(base);for(const width of [1680,1440,390]){const {page,context}=await open(app,width);await page.screenshot({path:join(out,`before-${width}.png`),fullPage:true});await context.close();}await app.close();apps=apps.filter(a=>a!==app);}
 const app=await launch(resolve(process.env.HOME_CANDIDATE_DIST || 'work/home529/candidate-dist'));
 for(const width of [1680,1440,1280,430,393,390,375,320]){
  const {page,context,requests}=await open(app,width);
  try{
   await page.locator('.hx-mod-b .hx-count').waitFor();
   assert.deepEqual(await page.locator('.hx-mod h2').allTextContents(),['COLLECTION个人收藏','ASSETS资产仓库','NOTES随手记','PROJECTS项目空间']);
   assert.deepEqual(await page.locator('.hx-port').allTextContents(),['1','2','3','4']);
   assert.deepEqual(await page.locator('.nav-item > span').allTextContents(),expectedNav);
   // 侧栏不分区、不加分组标题（用户 2026-10-26）；.nav-group 只用来把设置沉底。
   assert.equal(await page.locator('.nav-zone-title,.nav-divider,.nav-zone,.sidebar .nav-heading').count(),0);
   assert.equal(await page.locator('.hx-mod-a .hx-count b').innerText(),'6');assert.equal(await page.locator('.nav-item').filter({hasText:'资产仓库'}).locator('small').innerText(),'6');
   assert.equal(await page.locator('.hx-mod-b .hx-count b').innerText(),'3');
   assert.deepEqual(await page.locator('.hx-mod-b .hx-pick b').allTextContents(),['合成收藏 3','合成收藏 2','合成收藏 1']);
   assert.equal(await page.locator('.hx-mod-a').getByText('已删除不应出现',{exact:true}).count(),0);
   await page.screenshot({path:join(out,`after-${width}.png`),fullPage:true});
   checks.push({kind:'layout',width,geometry:await geometry(page,width)});
   if(width===1440){
    for(const id of ['a','b','c','d'])await page.locator('.hx-mod-'+id).screenshot({path:join(out,`card-${id}-1440.png`)});
    // 用户 2026-10-26 做减法：首页不再环绕八枚徽章。
    assert.equal(await page.locator('.hx-crest-stage .crest').count(),0);
    assert.match(await page.locator('.hx-date').getAttribute('datetime'),/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/);
    await page.getByRole('button',{name:'A 键：打开资产仓库'}).click();assert.equal(new URL(page.url()).hash,'#assets');
    await page.locator('.brand').click();await page.locator('.hx-mod-b .hx-count').waitFor();
    await page.getByRole('button',{name:'B 键：背光'}).click();assert.equal(await page.locator('.dv-key.b').getAttribute('aria-pressed'),'true');
    for(const [id,route]of [['b','learning'],['a','assets'],['c','notes'],['d','projects']]){
     await page.locator('.hx-mod-'+id+' .hx-page-link').click();assert.equal(new URL(page.url()).hash,'#'+route);
     await page.locator('.brand').click();await page.locator('.hx-mod-b .hx-count').waitFor();
    }
    // 收藏封面：只用本机 /collection-media/，视频带播放标；外链封面不加载。
    assert.deepEqual(await page.locator('.hx-mod-b .hx-cover img').evaluateAll(els=>els.map(e=>e.getAttribute('src'))),['/collection-media/v1/media/n3/01.webp']);
    assert.equal(await page.locator('.hx-mod-b li.has-cover .hx-cover i').count(),1);
    assert.equal(await page.locator('.hx-mod-b .hx-cover').getAttribute('aria-hidden'),'true');
    // 条目可点开：收藏定位到那一条，资产打开详情抽屉。
    await page.getByRole('button',{name:'打开收藏：合成收藏 2',exact:true}).click();assert.equal(new URL(page.url()).hash,'#learning');
    await page.locator('.collection-overlay').waitFor();await page.keyboard.press('Escape');await page.locator('.collection-overlay').waitFor({state:'detached'});await page.locator('.brand').click();await page.locator('.hx-mod-b .hx-count').waitFor();
    const firstAsset=page.locator('.hx-mod-a .hx-pick').first(),assetLabel=await firstAsset.getAttribute('aria-label');
    await firstAsset.click();assert.equal(new URL(page.url()).hash,'#assets');await page.getByRole('dialog').waitFor();
    await page.keyboard.press('Escape');await page.locator('.brand').click();await page.locator('.hx-mod-b .hx-count').waitFor();
    // 首页一键复制：剪贴板拿到全文，主库追加一次使用记录，这一条显示“用过 1 次”。
    const before=(await app.repository.read()).assetActivity?.length||0;
    const row=page.locator('.hx-mod-a .hx-pick-list li').filter({has:page.locator(`[aria-label="${assetLabel}"]`)});
    await row.locator('.asset-copy').click();await row.getByText(/用过 1 次/).waitFor();
    assert.equal((await app.repository.read()).assetActivity.length,before+1);
    assert.ok((await page.evaluate(()=>navigator.clipboard.readText())).length>0);
    assert.equal(await page.locator('.topbar-inbox').count(),0);
    const a11y=await new AxeBuilder({page}).include('.hx').include('.nav').withTags(['wcag2a','wcag2aa']).analyze();
    assert.deepEqual(a11y.violations.map(v=>({id:v.id,nodes:v.nodes.map(n=>n.target)})),[]);
    await page.locator('.hx-mod-a .hx-page-link').focus();assert.equal(await page.locator('.hx-mod-a .hx-page-link').evaluate(el=>el===document.activeElement),true);
    await page.emulateMedia({reducedMotion:'no-preference'});assert.equal(await page.locator('.hx-sig').first().evaluate(el=>getComputedStyle(el).animationName),'hx-flow');
   }
   assert(requests.every(r=>r==='GET collection'),'only retained summary is requested');
  }finally{await context.close();}
 }
 for(const mode of ['empty','error','long']){
  const {page,context,setFail,setDelay}=await open(app,390,mode);
  try{
   if(mode==='error') {await page.locator('.hx-mod-b .source-read-error').waitFor();assert.equal(await page.locator('.hx-mod-b .hx-count').count(),0);assert.equal(await page.getByText('还没有收藏，收录后会显示在这里').count(),0);}
   else if(mode==='empty') await page.getByText('还没有收藏，收录后会显示在这里').waitFor();
   else await page.locator('.hx-mod-b .hx-pick-list').waitFor();
   await geometry(page,390);await page.screenshot({path:join(out,mode+'-390.png'),fullPage:true});checks.push({kind:'state',mode});
  }finally{await context.close();}
 }
 const retained=await open(app,1440);
 try{
  await retained.page.locator('.hx-mod-b .hx-count').waitFor();retained.setFail(true);
  await retained.page.evaluate(()=>window.dispatchEvent(new Event('focus')));
  await retained.page.locator('.hx-mod-b .source-read-error').waitFor();
  assert.equal(await retained.page.locator('.hx-mod-b .hx-pick-list li').count(),3);
  retained.setFail(false);await retained.page.locator('.hx-mod-b .source-read-error button').click();await retained.page.waitForFunction(()=>!document.querySelector('.hx-mod-b .source-read-error'));
  checks.push({kind:'retained-and-retry',pass:true});
 }finally{await retained.context.close();}
 // 保留原首页快速随手记未知写入/读回失败的同 ID 恢复覆盖。
 for(const failure of ['readback','write-unknown']){
  const {page,context}=await open(app);
  try{
   let puts=0,failRead=false,failWrite=false;
   await page.route('**/api/workspace',async route=>{
    if(route.request().method()==='PUT'){puts++;const response=await route.fetch();assert.equal(response.status(),200);failRead=true;if(failWrite){failWrite=false;await route.abort();return;}await route.fulfill({response});return;}
    if(route.request().method()==='GET'&&failRead){failRead=false;await route.abort();return;}await route.continue();
   });
   const input=page.getByRole('textbox',{name:'记一笔'}),text='合成首页随手记 '+failure;
   await input.fill(text);if(failure==='write-unknown')failWrite=true;
   await page.getByRole('button',{name:'保存随手记'}).click();await page.getByRole('alert').filter({hasText:'保存结果暂时无法核实'}).waitFor();
   assert.equal(await input.inputValue(),text);assert.equal(puts,1);
   await page.getByRole('button',{name:'核对并重试随手记'}).click();await page.waitForFunction(()=>document.querySelector('input[aria-label="记一笔"]')?.value==='');
   assert.equal(puts,1);assert.equal((await app.repository.read()).notes.filter(n=>n.text===text).length,1);checks.push({kind:'note-recovery',failure,pass:true});
  }finally{await context.close();}
 }
 assert.deepEqual(errors,[]);
 await writeFile(join(out,'results.json'),JSON.stringify({checks,errors},null,2));console.log(`PASS ${checks.length} scenarios`);
}catch(error){await writeFile(join(out,'failure.json'),JSON.stringify({error:error.stack,checks,errors},null,2));throw error;}
finally{for(const app of apps)await app.close();await browser.close();}
