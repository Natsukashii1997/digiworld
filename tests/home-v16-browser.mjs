import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { collabV16Fixture } from './collab-v16-fixture.mjs';
import { fixture } from './fixture.mjs';
import { seed } from '../src/store.js';

const out = process.env.GUIJI_TEST_RESULTS || 'test-results/home-v16';
await mkdir(out, { recursive: true });
const browser = await chromium.launch();
const now = '2026-10-08T14:30:00+08:00';
const iso = time => new Date(`2026-10-08T${time}:00+08:00`).toISOString();
const events = [
  {id:'home-plan',title:'实现首页中枢',calendar:'工作台',workbench:true,start:iso('10:00'),end:iso('12:00'),allDay:false,modified:iso('09:00')},
  {id:'home-meet',title:'验收讨论',calendar:'合成团队',workbench:false,start:iso('15:00'),end:iso('16:00'),allDay:false,modified:iso('09:00')},
];
const reminders = [
  {id:'home-due',title:'核对页面交接',completed:false,due:iso('14:00'),dueHasTime:true,modified:iso('09:00')},
  {id:'home-future',title:'整理项目存档',completed:false,due:iso('17:00'),dueHasTime:true,modified:iso('09:00')},
];
async function open(app, width=1440, mode='full', motion='reduce') {
  const context = await browser.newContext({viewport:{width,height:900},timezoneId:'Asia/Shanghai',reducedMotion:motion});
  const page = await context.newPage();
  const errors=[];
  page.on('pageerror', error=>errors.push(error.message));
  await page.addInitScript(({time})=>{const BaseDate=Date;globalThis.Date=class extends BaseDate{constructor(...args){super(...(args.length?args:[time]));}static now(){return new BaseDate(time).getTime();}};},{time:now});
  await page.route('**/api/calendar/status', route=>route.fulfill({json:{available:true,supported:true,access:{calendar:'authorized',reminders:'authorized'}}}));
  await page.route('**/api/calendar/week', route=>route.fulfill({json:{available:true,events:mode==='full'?events:[]}}));
  await page.route('**/api/calendar/todos', route=>route.fulfill({json:{available:true,reminders:mode==='full'?reminders:[]}}));
  await page.goto(app.url+'/#home');
  await page.locator('.hx').waitFor();
  await page.locator('.hx-mod-a').getByText(mode==='full'?'核对页面交接':'今天没有已读取的安排').waitFor();
  return {page,context,errors};
}
async function watchLaunchScroll(page) {
  await page.evaluate(() => {
    window.__launchScroll = [];
    const original = Element.prototype.scrollIntoView;
    Element.prototype.scrollIntoView = function (options) {
      if (this.classList.contains('cx-launch')) window.__launchScroll.push(options?.behavior);
      return original.call(this, options);
    };
  });
}
try {
  const app=await collabV16Fixture();
  try {
    const {page,context,errors}=await open(app);
    try {
      await page.locator('time.hx-date').waitFor();
      assert.match(await page.locator('.hx-date').getAttribute('datetime'),/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/);
      assert.match(await page.locator('.hx-date').getAttribute('aria-label'),/\d{2}:\d{2} \d{1,2}月\d{1,2}日 [A-Z][a-z]+/);
      assert.match(await page.locator('.hx-greet').innerText(),/好，被选召的孩子$/);
      await page.locator('.hx-next-av').waitFor();
      assert.equal(await page.locator('.hx-next-av .agent-sprite').count(),1);
      assert.equal(await page.locator('.hx-mod').count(),4);
      assert.equal(await page.locator('.hx-brief-entry').count(),0);
      assert.equal(await page.locator('.hx-crest-stage .crest').count(),8);
      assert.equal(await page.locator('.hx-crest-stage .hero-orbit.a').evaluate(el=>getComputedStyle(el,'::after').content),'none');
      const layout=await page.evaluate(()=>Object.fromEntries(['a','b','c','d'].map(id=>{
        const box=document.querySelector('.hx-mod-'+id).getBoundingClientRect();
        return [id,{top:box.top,bottom:box.bottom,height:box.height}];
      })));
      for (const [left,right] of [['a','c'],['b','d']]) {
        assert.ok(Math.abs(layout[left].top-layout[right].top)<=1,`${left}/${right} 上边线未对齐：${JSON.stringify(layout)}`);
        assert.ok(Math.abs(layout[left].bottom-layout[right].bottom)<=1,`${left}/${right} 下边线未对齐：${JSON.stringify(layout)}`);
      }
      assert.equal(await page.locator('.hx-crest-stage .crest-ring').evaluate(el=>getComputedStyle(el).animationName),'none');
      await page.locator('.hx-mini-line').waitFor();
      assert.equal(await page.locator('.hx-mini-line circle').count(),9); // 8 nodes + current halo
      await page.locator('.hx-mod-b .hx-q li').first().waitFor();
      assert.equal(await page.locator('.hx-mod-b .hx-q li').count(),3);
      const geometry=await page.evaluate(()=>{
        const panel=document.querySelector('.hx').getBoundingClientRect();
        return [...document.querySelectorAll('[data-trace]')].map(g=>{
          const p=g.querySelector('path').getAttribute('d');
          const start=g.querySelector('circle').getBoundingClientRect();
          return {name:g.dataset.trace,path:p,panelWidth:panel.width,startWidth:start.width};
        });
      });
      assert.deepEqual(geometry.map(x=>x.name),['a','b','c','d']);
      assert.ok(geometry.every(x=>/^M [\d.]+ [\d.]+ H /.test(x.path) && x.panelWidth>1000));
      await page.screenshot({path:join(out,'home-full-1440.png'),fullPage:true});
      await page.getByRole('button',{name:'在待处理打开：核对页面交接'}).click();
      const drawer=page.getByRole('dialog',{name:'待处理'});
      await drawer.waitFor();
      assert.equal(await drawer.locator('[data-item-id="todo-due-home-due"] .ib-card-btn').evaluate(el=>el===document.activeElement),true);
      await drawer.getByRole('button',{name:'关闭待处理'}).click();
      await watchLaunchScroll(page);
      await page.locator('.hx-mod-c .hx-go').click();
      await page.locator('.cx-launch').waitFor();
      await page.waitForFunction(() => window.__launchScroll?.length);
      assert.equal(await page.evaluate(() => window.__launchScroll.at(-1)), 'instant');
      assert.match(await page.locator('.cx-runs [aria-selected="true"]').innerText(),/随手记页/);
      assert.equal(await page.locator('.cx-launch .go').count(),1);
      assert.equal((await app.workspace()).collabLog?.length || 0,0);
      assert.deepEqual(errors,[]);
    } finally {await context.close();}
    const natural=await open(app,1440,'full','no-preference');
    try {
      const durations=await natural.page.evaluate(() => ({
        module: getComputedStyle(document.querySelector('.hx-mod')).transitionDuration,
        trace: getComputedStyle(document.querySelector('.hx-tr')).transitionDuration,
        crests: getComputedStyle(document.querySelector('.hx-crest-stage .crest-ring')).animationName,
        upright: getComputedStyle(document.querySelector('.hx-crest-stage .crest svg')).animationName,
      }));
      assert.ok(durations.module.split(',').every(value => parseFloat(value) >= .24), JSON.stringify(durations));
      assert.ok(parseFloat(durations.trace) >= .24, JSON.stringify(durations));
      assert.equal(durations.crests,'hx-crest-revolve');
      assert.equal(durations.upright,'hx-crest-upright');
      await natural.page.emulateMedia({reducedMotion:'reduce'});
      assert.equal(await natural.page.locator('.hx-crest-stage .crest-ring').evaluate(el=>getComputedStyle(el).animationName),'none');
      await natural.page.emulateMedia({reducedMotion:'no-preference'});
      await watchLaunchScroll(natural.page);
      await natural.page.locator('.hx-mod-c .hx-go').click();
      await natural.page.locator('.cx-launch').waitFor();
      await natural.page.waitForFunction(() => window.__launchScroll?.length);
      assert.equal(await natural.page.evaluate(() => window.__launchScroll.at(-1)), 'smooth');
      assert.deepEqual(natural.errors,[]);
    } finally {await natural.context.close();}
    const mid=await open(app,1280);
    try {
      const layout=await mid.page.evaluate(()=>{
        const bounds=id=>{const box=document.querySelector('.hx-mod-'+id).getBoundingClientRect();return {top:box.top,bottom:box.bottom};};
        const stage=document.querySelector('.hx-crest-stage').getBoundingClientRect();
        const panel=document.querySelector('.hx').getBoundingClientRect();
        return {a:bounds('a'),b:bounds('b'),c:bounds('c'),d:bounds('d'),stage:{left:stage.left,right:stage.right},panel:{left:panel.left,right:panel.right}};
      });
      for(const [left,right] of [['a','c'],['b','d']]) {
        assert.ok(Math.abs(layout[left].top-layout[right].top)<=1,JSON.stringify(layout));
        assert.ok(Math.abs(layout[left].bottom-layout[right].bottom)<=1,JSON.stringify(layout));
      }
      assert.ok(layout.stage.left>=layout.panel.left&&layout.stage.right<=layout.panel.right,JSON.stringify(layout));
      assert.equal(await mid.page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth),true);
      await mid.page.screenshot({path:join(out,'home-full-1280.png'),fullPage:true});
      assert.deepEqual(mid.errors,[]);
    } finally {await mid.context.close();}
    const mobile=await open(app,390);
    try {
      assert.equal(await mobile.page.locator('.hx-traces').evaluate(el=>getComputedStyle(el).display),'none');
      assert.equal(await mobile.page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth),true);
      await mobile.page.screenshot({path:join(out,'home-full-390.png'),fullPage:true});
      assert.deepEqual(mobile.errors,[]);
    } finally {await mobile.context.close();}
    const narrow=await open(app,320);
    try {
      const bounds=await narrow.page.evaluate(()=>{
        const panel=document.querySelector('.hx').getBoundingClientRect();
        return {panel:{left:panel.left,right:panel.right},crests:[...document.querySelectorAll('.hx-crest-stage .crest')].map(el=>{
          const box=el.getBoundingClientRect();return {left:box.left,right:box.right};
        })};
      });
      assert.ok(bounds.crests.every(box=>box.left>=bounds.panel.left-1&&box.right<=bounds.panel.right+1),JSON.stringify(bounds));
      assert.equal(await narrow.page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth),true);
      await narrow.page.screenshot({path:join(out,'home-full-320.png'),fullPage:true});
      assert.deepEqual(narrow.errors,[]);
    } finally {await narrow.context.close();}
    const project=await open(app);
    try {
      await project.page.getByRole('button',{name:'今日项目简报'}).click();
      await project.page.getByRole('dialog',{name:'今日项目简报'}).waitFor();
      await project.page.keyboard.press('Escape');
      await project.page.getByRole('button',{name:'打开项目：协同项目'}).click();
      await project.page.getByRole('dialog',{name:'协同项目'}).waitFor();
      assert.deepEqual(project.errors,[]);
    } finally {await project.context.close();}
  } finally {await app.close();}

  // 问候固定为被选召的孩子；主线与支线计数仍由待处理列表显示。
  for (const scenario of ['side', 'empty']) {
    const app = await fixture();
    try {
      await app.repository.write(seed(), {initialize:true});
      if (scenario === 'side') await app.repository.updateConnections(() => ({roots:[],projects:[],agents:[{id:'codex',name:'Codex',kind:'开发 Agent',status:'detected',programs:[],configFound:true}],github:{status:'not_connected',login:'',message:'',at:''},projectScannedAt:'',agentScannedAt:now,errors:[],truncated:false}));
      const {page,context,errors} = await open(app,390,'empty');
      try {
        const expected = '下午好，被选召的孩子';
        await page.locator('.hx-greet').filter({hasText:expected}).waitFor();
        assert.equal(await page.locator('.hx-qcount .main b').innerText(),'0');
        assert.equal(await page.locator('.hx-qcount .side b').innerText(), scenario === 'side' ? '1' : '0');
        assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth),true);
        await page.screenshot({path:join(out,`home-${scenario}-390.png`),fullPage:true});
        assert.deepEqual(errors,[]);
      } finally {await context.close();}
    } finally {await app.close();}
  }

  for (const failure of ['readback','write-unknown']) {
    const app=await fixture();
    try {
      await app.repository.write(seed(),{initialize:true});
      const {page,context,errors}=await open(app,1440,'empty');
      try {
        let puts=0,failRead=false,failWrite=false;
        await page.route('**/api/workspace',async route=>{
          const method=route.request().method();
          if(method==='PUT') {
            puts++;
            if(failWrite) { failWrite=false; const response=await route.fetch(); assert.equal(response.status(),200); await route.abort(); return; }
          }
          if(method==='GET' && failRead) {failRead=false; await route.abort(); return;}
          await route.continue();
        });
        const input=page.getByRole('textbox',{name:'记一笔'});
        await input.fill('合成首页随手记 '+failure);
        if(failure==='readback') failRead=true;
        else {failWrite=true;failRead=true;}
        await page.getByRole('button',{name:'保存随手记'}).click();
        await page.getByRole('alert').filter({hasText:'保存结果暂时无法核实'}).waitFor();
        assert.equal(await input.inputValue(),'合成首页随手记 '+failure);
        assert.equal(puts,1);
        await page.getByRole('button',{name:'核对并重试随手记'}).click();
        await page.waitForFunction(() => document.querySelector('input[aria-label="记一笔"]')?.value === '');
        assert.equal(await input.inputValue(),'');
        assert.equal(puts,1,'已写入的同一 ID 不重放');
        assert.equal((await app.repository.read()).notes.filter(n=>n.text==='合成首页随手记 '+failure).length,1);
        assert.deepEqual(errors,[]);
      } finally {await context.close();}
    } finally {await app.close();}
  }
  console.log('home-v16-browser PASS: A-D, geometry, responsive, B/C/D navigation, readback faults');
} finally {await browser.close();}
