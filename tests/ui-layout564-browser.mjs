import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {chromium} from 'playwright';
import {fixture183,routes183} from './projects-v16-fixture.mjs';
import {aihot202Data} from './aihot-v16-fixture.mjs';
import {syntheticNote} from './collection-fixture.mjs';
const out=process.env.LAYOUT_OUT;
const verify=process.env.LAYOUT_VERIFY==='1';
const widths=verify?[1440,1280,1024,430,393,390,375,320]:[1440,390];
await mkdir(out,{recursive:true});
const app=await fixture183();
app.data.state.connections.projects.forEach(p=>p.active=p.id==='project183-7');
await app.repository.updateConnections(()=>app.data.state.connections);
app.data.items[0].current.fields.next='核对卡片排布，完成当前任务并保留必要交接。';
const browser=await chromium.launch(),checks=[],errors=[];
try {
 for(const width of widths){
  const context=await browser.newContext({viewport:{width,height:1000},timezoneId:'Asia/Shanghai',reducedMotion:'reduce'});
  const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/*',r=>new URL(r.request().url()).origin===app.url?r.continue():r.abort());
  await routes183(page,app);
  await page.route('**/api/collection/notes',r=>r.fulfill({json:{notes:Array.from({length:7},(_,i)=>({...syntheticNote(i+1),savedAt:'2026-10-19T01:00:00Z',category:'AI学习'})),revision:1}}));
  await page.route('**/api/calendar/status',r=>r.fulfill({json:{available:false,supported:false}}));
  await page.route('**/api/calendar/todos',r=>r.fulfill({json:{available:false,reminders:[]}}));
  let data=aihot202Data();data.cache.sections.selected.items=data.cache.sections.selected.items.slice(0,3);
  await page.route('**/api/aihot',r=>r.fulfill({json:data}));
  for(const route of ['home','projects','aihot','references','agents','notes','night']){
   if(![1440,390].includes(width)&&['references','agents','notes','night'].includes(route))continue;
   await page.goto(app.url+'/#'+route);
   const target={home:'.hx-mod-b .hx-summary-total',projects:'.pj-save',aihot:'.ah-card',references:'.page-heading',agents:'.page-heading',notes:'.page-heading',night:'.page-heading'}[route];
   await page.locator(target).first().waitFor();
   const g=await page.evaluate(route=>{
    const rect=e=>{const r=e.getBoundingClientRect();return {x:r.x,y:r.y,w:r.width,h:r.height,bottom:r.bottom};};
    const header=document.querySelector('.page-heading'),lead=document.querySelector('.page-lead');
    return {route,overflow:document.documentElement.scrollWidth-innerWidth,bounds:document.querySelectorAll('.page-bounds').length,lead:lead?.textContent,header:header&&rect(header),
     cards:[...document.querySelectorAll('.pj-saves>.pj-save')].map(rect),
     emptyHints:[...document.querySelectorAll('.pj-empty-hint')].map(e=>e.textContent),
     home:route==='home'?{header:rect(document.querySelector('.hx-mod-b header')),total:rect(document.querySelector('.hx-mod-b .hx-summary-total'))}:null,
     selected:document.querySelectorAll('.ah-card,.ah-more li').length};
   },route);
   checks.push({width,...g});
   if(verify){
    assert.equal(g.overflow,0,`${width} ${route} overflow`);
    assert.equal(g.bounds,0,`${route} red-box row removed`);
    if(['references','agents','projects','aihot'].includes(route))assert(g.lead,`${route} retains introduction`);
    if(g.home)assert(g.home.total.y-g.home.header.bottom<=25,`collection header gap: ${JSON.stringify(g.home)}`);
    if(route==='projects'){
     assert.equal(g.emptyHints.length,2,'both vacant slots explain their state');
     for(let i=0;i<g.cards.length;i++)for(let j=i+1;j<g.cards.length;j++)if(Math.abs(g.cards[i].y-g.cards[j].y)<1){
      assert(Math.abs(g.cards[i].h-g.cards[j].h)<1,'same-row slots have equal height');
      assert(Math.abs(g.cards[i].w-g.cards[j].w)<1,'same-row slots have equal width');
     }
     await page.locator('.pj-vacant').last().click();
     assert.equal(await page.locator('.pj-library').evaluate(e=>e===document.activeElement),true,'empty slot moves focus to library');
     await page.locator('.pj-saves').scrollIntoViewIfNeeded();
    }
   }
   if([1440,390].includes(width)){
    await page.evaluate(async()=>{if(document.activeElement instanceof HTMLElement)document.activeElement.blur();window.scrollTo(0,0);await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));});
    await page.screenshot({path:join(out,`${route}-${width}.png`),fullPage:true});
    if(route==='home')await page.locator('.hx-mod-b').screenshot({path:join(out,`collection-card-${width}.png`)});
    if(route==='projects')await page.locator('.pj-saves').screenshot({path:join(out,`project-slots-${width}.png`)});
   }
  }
  data=aihot202Data();
  data.cache.sections.selected.items[3].publishedAt='';data.cache.sections.selected.items[3].discoveredAt='2026-10-18T18:05:00Z';
  data.cache.sections.selected.items[4].publishedAt='';
  await page.goto(app.url+'/#aihot');await page.reload();await page.locator('.ah-more li').last().waitFor();
  assert.equal(await page.locator('.ah-card,.ah-more li').count(),10,'ten available items all rendered');
  if(verify){
   assert.match(await page.locator('.ah-date h2').innerText(),/最新精选.*10 条/);
   assert.equal(await page.locator('.ah-wall .ah-meta-time').count(),10,'every selected item has a date or explicit unknown label');
   const dates=await page.locator('.ah-wall .ah-meta-time').allTextContents();
   assert.match(dates[3],/收录于 2026\/10\/19 02:05/);
   assert.match(dates[4],/日期未知/);
   assert(dates.every(t=>/日期未知|2026\/\d\d\/\d\d/.test(t)));
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth-innerWidth),0);
   const outside=await page.locator('.ah-meta-time').evaluateAll(es=>es.filter(e=>{const r=e.getBoundingClientRect();return r.right>innerWidth+.5||r.left<-.5;}).length);
   assert.equal(outside,0,'dates fit narrow screens');
  }
  if([1440,390].includes(width))await page.screenshot({path:join(out,`aihot-ten-${width}.png`),fullPage:true});
  await context.close();
 }
 assert.deepEqual(errors,[]);
 console.log(JSON.stringify({passed:verify,checks:checks.length,errors}));
}finally{
 await writeFile(join(out,'geometry.json'),JSON.stringify({verify,checks,errors},null,2));
 await browser.close();await app.close();
}
