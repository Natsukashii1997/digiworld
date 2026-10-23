// Review 358: fixed synthetic inputs for stale pending items and read-error/empty-slot geometry.
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import AxeBuilder from '@axe-core/playwright';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fixture183, routes183 } from './projects-v16-fixture.mjs';
import { collabV16Fixture } from './collab-v16-fixture.mjs';

const capture = process.argv.includes('--before');
const out = process.env.GUIJI_TEST_RESULTS || 'test-results/ui-refine358';
await mkdir(out, { recursive: true });
const browser = await chromium.launch(), records = [], failures = [], errors = [];
const stamp = '2026-10-08T14:30:00+08:00';
const events = [{ id:'repair-event', title:'合成当前安排', calendar:'工作台', workbench:true,
  start:'2026-10-08T13:30:00+08:00', end:'2026-10-08T15:00:00+08:00', allDay:false }];
const reminders = [{ id:'repair-todo', title:'合成交接待核对', completed:false, due:stamp, dueHasTime:true, modified:stamp }];
const readError = '本地服务连接中断。操作结果未确认，请保留当前内容，重新连接后核对。';
const check = (condition, message) => { if (!condition) failures.push(message); };
async function open(app, width, failed = {}) {
  const context = await browser.newContext({ viewport:{ width, height:900 }, timezoneId:'Asia/Shanghai', reducedMotion:'reduce' });
  const page = await context.newPage(); page.setDefaultTimeout(12000);
  page.on('pageerror', error => errors.push(error.message));
  await page.addInitScript(time => { const BaseDate=Date; globalThis.Date=class extends BaseDate {
    constructor(...args){super(...(args.length?args:[time]));} static now(){return new BaseDate(time).getTime();}
  }; }, stamp);
  await page.route('**/api/calendar/status', r => r.fulfill({json:{available:true,supported:true,access:{calendar:'authorized',reminders:'authorized'}}}));
  for (const [path, json] of [['week',{available:true,events}],['todos',{available:true,reminders}]]) {
    await page.route('**/api/calendar/'+path, r => r.fulfill(failed[path]
      ? {status:503,json:{error:failed[path]===true?readError:failed[path]}} : {json}));
  }
  return page;
}
const focus = page => page.evaluate(() => window.dispatchEvent(new Event('focus')));
async function screenshot(page, name) {
  await page.screenshot({path:join(out,`${name}-${page.viewportSize().width}.png`),fullPage:true});
}
async function errorState(page, name, retained, selector='.hx-mod-a') {
  await page.locator(selector+' .source-read-error').first().waitFor();
  await page.waitForTimeout(200);
  const alerts = await page.locator(selector+' .source-read-error').evaluateAll(nodes => nodes.map(e => {
    const span=e.querySelector('span'),range=document.createRange();range.selectNodeContents(span);
    return {text:e.innerText,lines:new Set([...range.getClientRects()].filter(r=>r.width&&r.height).map(r=>Math.round(r.top))).size};
  }));
  const cards = await page.locator('.hx-mod').evaluateAll(nodes => nodes.map(card => {
    const body=card.querySelector('.hx-module-body'), box=body.getBoundingClientRect(), spans=[];
    const walker=document.createTreeWalker(body,NodeFilter.SHOW_TEXT);
    while(walker.nextNode()) {
      const node=walker.currentNode,parent=node.parentElement;
      if(!node.textContent.trim()||parent.closest('svg,.sr-only')||!parent.checkVisibility({checkOpacity:true}))continue;
      const range=document.createRange();range.selectNodeContents(node);
      for(const r of range.getClientRects())if(r.width&&r.height)spans.push([r.top,r.bottom]);
    }
    for(const e of body.querySelectorAll('.hx-tl-bar,.hx-mini-line')){const r=e.getBoundingClientRect();spans.push([r.top,r.bottom]);}
    spans.sort((a,b)=>a[0]-b[0]);let bottom=box.top,gap=0;
    for(const [top,end] of spans){gap=Math.max(gap,top-bottom);bottom=Math.max(bottom,end);}
    return {id:card.className,height:card.getBoundingClientRect().height,maxBlank:gap,headGap:(spans[0]?.[0] ?? box.top)-card.querySelector("header").getBoundingClientRect().bottom};
  }));
  const axe = await new AxeBuilder({page}).include(selector+' .source-read-error').analyze();
  const pageAxe = await new AxeBuilder({page}).include(selector).analyze();
  records.push({name,width:page.viewportSize().width,retained,alerts,cards,
    axe:axe.violations.map(v=>({id:v.id,nodes:v.nodes.map(n=>({target:n.target,summary:n.failureSummary}))})),
    pageAxe:pageAxe.violations.map(v=>({id:v.id,nodes:v.nodes.map(n=>({target:n.target,summary:n.failureSummary}))}))});
  check(alerts.every(a=>!a.text.includes('操作结果未确认')&&!a.text.includes('请保留当前内容')),name+' uses read-specific copy');
  check(alerts.every(a=>retained?a.text.includes('下面是上次内容'):!a.text.includes('上次')),name+' truthful retained-content copy');
  check(axe.violations.length===0,name+' accessible error state');
  // The unchanged project library's h4 skips a heading level in this 3-project fixture,
  // reproduced on the 358 baseline. Keep that evidence and reject any other page finding.
  check(pageAxe.violations.every(v=>v.id==='heading-order'&&v.nodes.every(n=>
    n.target.length===1&&n.target[0]==='.pj-rack:nth-child(3) > h4')),name+' no new page accessibility findings');
  if(page.viewportSize().width===1440&&cards.length) {
    check(alerts.every(a=>a.lines<=2),name+' alert <=2 lines');
    check(cards.every(c=>c.maxBlank<=120 && c.headGap<=32),name+' home blank <=120px');
  }
  await screenshot(page,name);
}
try {
  const projects=await fixture183();
  try {
    for(const width of [1440,390]) {
      for(const mode of ['initial','retained','distinct']) {
        const failed=mode==='initial'?{week:true,todos:true}:{};
        const p=await open(projects,width,failed);await routes183(p,projects);
        await p.goto(projects.url+'/#home');await p.locator('.hx-proj-list li').first().waitFor();
        if(mode!=='initial') {
          await p.locator('.hx-todo li').waitFor();
          await p.locator('.hx-blk').waitFor(); // retained means the calendar snapshot was actually rendered
          failed.week=true;failed.todos=mode==='distinct'?'合成提醒事项读取中断':true;
          await focus(p);
        }
        await errorState(p,'R3-home-'+mode,mode!=='initial');
        check(await p.locator('.hx-mod-a .source-read-error').count()===1,mode+' source errors stated once');
        check(await p.locator('.hx-todo li').count()===(mode==='initial'?0:1),mode+' reminder snapshot visibility');
        check(await p.locator('.hx-blk').count()===(mode==='initial'?0:1),mode+' calendar snapshot visibility');
        failed.week=false;failed.todos=false;
        await p.locator('.hx-mod-a .source-read-error').getByRole('button',{name:'重试',exact:true}).first().click();
        await p.waitForFunction(()=>!document.querySelector('.hx-mod-a .source-read-error'));
        check(await p.locator('.hx-todo li').count()===1,mode+' retry restores current data');
        await p.locator('.hx-blk').waitFor();
        check(await p.locator('.hx-blk').count()===1,mode+' retry restores calendar data');
        await p.context().close();
      }
      const p=await open(projects,width);await routes183(p,projects);
      await p.goto(projects.url+'/#home');await p.locator('.hx-proj-list li').first().waitFor();
      await p.locator('.hx-todo li').waitFor();await p.waitForTimeout(200);
      const badgeBefore=Number(await p.locator('.ib-badge .odometer').textContent());
      const failure=r=>r.fulfill({status:503,json:{error:readError}});
      await p.route('**/api/project-status/inspect',failure);
      await p.goto(projects.url+'/#projects');
      await p.locator('.projects-v16').getByRole('button',{name:'刷新',exact:true}).click();
      await p.locator('.projects-v16 .source-read-error').waitFor();
      await p.goto(projects.url+'/#home');
      await errorState(p,'R1-home-project-failed',true,'.hx-mod-d');
      await p.locator('.topbar-inbox').click();
      // Read the drawer and background counters in one DOM snapshot while independent
      // sources finish; separate locator awaits can straddle different React updates.
      const {ids,badgeAfter,total,counts,drawerCounts}=await p.evaluate(()=>({
        ids:[...document.querySelectorAll('[data-item-id]')].map(e=>e.dataset.itemId),
        badgeAfter:Number(document.querySelector('.ib-badge .odometer')?.textContent||0),
        total:Number(document.querySelector('.topbar-inbox').getAttribute('aria-label').match(/待处理 (\d+) 项/)[1]),
        counts:[...document.querySelectorAll('.hx-qcount b')].map(e=>Number(e.textContent)),
        drawerCounts:[...document.querySelectorAll('.ib-count b')].map(e=>Number(e.textContent)),
      }));
      const projectIds=ids.filter(id=>/^project-(safety-|stall-|status-error$)/.test(id)).sort();
      records.push({name:'R1-pending-failed',width,projectIds,badgeBefore,badgeAfter,total,counts,drawerCounts});
      check(JSON.stringify(projectIds)===JSON.stringify(['project-status-error']),'R1 only source failure in pending at '+width);
      check(total===counts.reduce((sum,count)=>sum+count,0)&&JSON.stringify(counts)===JSON.stringify(drawerCounts),
        'R1 pending total and drawer counts agree at '+width);
      check(badgeAfter===(counts[0]+counts[1]||counts[2]),'R1 badge preserves existing priority-count rule at '+width);
      await screenshot(p,'R1-pending-failed');
      await p.keyboard.press('Escape');
      await p.goto(projects.url+'/#projects');await p.locator('.pj-save-title h3').first().waitFor();
      await errorState(p,'R3-projects-retained',true,'.projects-v16');
      await p.unroute('**/api/project-status/inspect',failure);
      await p.locator('.projects-v16 .source-read-error').getByRole('button',{name:'重试',exact:true}).click();
      await p.locator('.projects-v16 .source-read-error').waitFor({state:'detached'});
      let absentRead=0;
      const absent=r=>r.fulfill({json:{at:new Date(Date.parse(stamp)+absentRead++*1000).toISOString(),
        items:projects.data.items.map(item=>({...item,current:{state:'absent'}}))}});
      await p.route('**/api/project-status/inspect',absent);
      await p.locator('.projects-v16').getByRole('button',{name:'刷新',exact:true}).click();
      await p.waitForFunction(()=>document.querySelectorAll('.pj-save .pj-heat i.l-1').length===90);
      const activityFailure=r=>r.fulfill({status:503,json:{error:readError}});
      await p.route('**/api/project-status/activity',activityFailure);
      await p.locator('.projects-v16').getByRole('button',{name:'刷新',exact:true}).click();
      await errorState(p,'R3-daily-hidden',false,'.projects-v16');
      check(await p.locator('.pj-save .pj-heat i:not(.l-1)').count()===0,'unreadable CURRENT hides activity snapshot');
      await p.unroute('**/api/project-status/activity',activityFailure);
      await p.locator('.projects-v16 .source-read-error').getByRole('button',{name:'重试',exact:true}).click();
      await p.locator('.projects-v16 .source-read-error').waitFor({state:'detached'});
      await p.context().close();
    }
  } finally {await projects.close();}
  const app=await collabV16Fixture();
  try {
    for(const width of [1440,390]) {
      const p=await open(app,width);
      await p.goto(app.url+'/#collab');await p.locator('.cx-runs').first().waitFor();
      const failure=r=>r.fulfill({status:503,json:{error:readError}});
      await p.route('**/api/collab/protocol',failure);
      await p.getByRole('button',{name:'刷新看板'}).click();
      await errorState(p,'R3-collab-retained',true,'.collab-v16');
      check(await p.locator('.cx-runs').count()>0,'collab snapshot still visible');
      await p.unroute('**/api/collab/protocol',failure);
      await p.locator('.collab-v16 .source-read-error').getByRole('button',{name:'重试',exact:true}).click();
      await p.locator('.collab-v16 .source-read-error').waitFor({state:'detached'});
      await p.goto(app.url+'/#night');await p.locator('[data-testid="night-library"] h2').waitFor();
      for(const measuredWidth of (width===390?[390,320,375,393,430]:[1440])) {
        await p.setViewportSize({width:measuredWidth,height:900});await p.waitForTimeout(100);
        const wells=await p.locator('.nt-slot.vacant .nv-slot-well').evaluateAll(nodes=>nodes.map(e=>{
          const r=e.getBoundingClientRect(),hint=e.querySelector('.nv-slot-hint'),h=hint.getBoundingClientRect();
          const icon=hint.querySelector('svg')?.getBoundingClientRect();
          return {x:r.x,top:r.top,height:r.height,hintTop:h.top,hintHeight:h.height,
            icon:icon?{width:icon.width,height:icon.height}:null,text:e.innerText};
        }));
        const labels=await p.locator('.nv-slot-mouth').allTextContents();
        const libraryTop=await p.locator('[data-testid="night-library"] h2').evaluate(e=>e.getBoundingClientRect().top);
        records.push({name:'R2-empty-slots',width:measuredWidth,wells,labels,libraryTop});
        check(wells.length===4,'R2 four empty wells at '+measuredWidth);
        for(const well of wells)check(Math.abs(well.height-wells[0].height)<1,'R2 equal well height at '+measuredWidth);
        if(measuredWidth===1440) {
          check(wells.every(w=>Math.abs(w.top-wells[0].top)<1&&Math.abs(w.hintTop-wells[0].hintTop)<1),'R2 aligned well tops');
          check(libraryTop<900,'R2 chip library in first fold');
        } else {
          check(Math.abs(wells[0].top-wells[1].top)<1&&Math.abs(wells[2].top-wells[3].top)<1
            &&Math.abs(wells[0].hintTop-wells[1].hintTop)<1&&Math.abs(wells[2].hintTop-wells[3].hintTop)<1,
            'R2 aligned mobile rows at '+measuredWidth);
        }
        check(wells[0]?.icon?.width===18&&wells[0]?.icon?.height===18,'R2 original plus icon stays square at '+measuredWidth);
        check(wells.every(w=>!w.text.includes('SLOT')),'R2 labels only on socket bases');
        check(labels.every((text,i)=>text.includes('SLOT '+(i+1))),'R2 base labels retained');
        if([1440,390].includes(measuredWidth))await screenshot(p,'R2-night-empty');
      }
      await p.context().close();
    }
  } finally {await app.close();}
} finally {
  await browser.close();
  await writeFile(join(out,'records.json'),JSON.stringify({stamp,events,reminders,capture,records,failures,errors},null,2));
}
assert.deepEqual(errors,[],'no browser exceptions');
if(!capture)assert.deepEqual(failures,[],'review 358 repairs');
console.log(JSON.stringify({capture,records:records.length,failures},null,2));
