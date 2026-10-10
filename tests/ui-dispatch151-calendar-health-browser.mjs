import {calendarGeometry as geometry,clickCalendarEvent,calendarTrigger} from "./calendar-v16-helpers.mjs";
import {selectAgentTab} from "./agents-v16-helpers.mjs";
// 仅合成 fixture；项目旧日历/IME/忙碌断言原样保留，本脚本新增全天/跨日及体检未知边界。
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {fixture} from './fixture.mjs';
import {batch3Data,batch3Stub,batch3Routes} from './ui-v14-batch3-fixture.mjs';
import {axe,motion} from './ui-v14-checks.mjs';
const {chromium}=createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE || '/Users/nat/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const browser=await chromium.launch(), errors=[],requests=[],forbidden=[];
const deny=async()=>{forbidden.push('禁止的宿主适配');throw new Error('未授权宿主操作');};
const iso=(date,time='00:00')=>new Date(`${date}T${time}:00+08:00`).toISOString();
const button=(p,name)=>p.getByRole('button',{name,exact:true});
let app;
async function open(width,route){
 const context=await browser.newContext({viewport:{width,height:1000},timezoneId:'Asia/Shanghai',reducedMotion:'reduce'});
 const p=await context.newPage();p.setDefaultTimeout(10000);
 p.on('pageerror',e=>errors.push(e.message));p.on('request',r=>requests.push(r.url()));
 await batch3Routes(p);await p.goto(app.url+'/#'+route);await p.locator('main .page-heading').waitFor();return p;
}
async function setup(stub){
 const data=batch3Data();
 app=await fixture({discovery:{calendarHelper:{platform:'darwin',run:stub.run},
  projectActivity:{resolveRoot:deny,runGit:()=>deny},storageStatus:{platform:'linux',runOpen:deny},
  knowledgeTrends:{journal:{list:async()=>[]}},knowledgeFiles:{inspectRoot:deny,scan:deny,read:deny,current:deny},
  learningMetadataReader:deny,aihotFetch:deny,
 }});
 await app.repository.write(data.state,{initialize:true});
}
async function fields(dialog,{title,startDate,endDate,start,end,allDay}){
 await dialog.getByLabel('一句话').fill(title);
 await dialog.getByRole('radiogroup',{name:'规划块时段类型',exact:true}).getByRole('radio',{name:allDay?'全天':'指定时间',exact:true}).click();
 await dialog.getByLabel('日期',{exact:true}).fill(startDate);
 await dialog.getByLabel('截止日',{exact:true}).fill(endDate);
 if(!allDay){await dialog.getByLabel('开始',{exact:true}).fill(start);await dialog.getByLabel('结束',{exact:true}).fill(end);}
}
async function inspectDialog(p,label){await geometry(p,'[role="dialog"]',label);await axe(p,label);}
async function item(p,id){const trigger=await calendarTrigger(p,id);return {click:()=>clickCalendarEvent(p,id),evaluate:fn=>trigger.evaluate(fn)};}
try{
 for(const width of [320,390,1440]){
  const stub=batch3Stub(batch3Data());await setup(stub);const p=await open(width,'calendar');await p.locator('.cal-grid').waitFor();
  const title='全天合成中文EnglishWithoutSpaces'.repeat(width===1440?3:5);
  await button(p,'新建规划块').click();let dialog=p.getByRole('dialog',{name:'新建规划块',exact:true});
  await fields(dialog,{title,startDate:'2026-10-04',endDate:'2026-10-05',allDay:true});
  assert.equal(await dialog.getByLabel('开始',{exact:true}).count(),0,'全天不显示时钟输入');
  assert.equal(await dialog.getByLabel('结束',{exact:true}).count(),0);
  await inspectDialog(p,`全天创建 ${width}`);
  const input=dialog.getByLabel('一句话');
  assert.equal(await dialog.locator('textarea').count(),2,'一句话与备注各有一个输入');
  assert.equal(await dialog.getByLabel('备注（可留空）',{exact:true}).count(),1,'新增备注有显式标签');
  assert.equal(await input.evaluate(e=>e.closest('label').firstChild.textContent.trim()),'一句话','显式标签不随受控textarea内容变化');
  await input.evaluate(e=>{window.newCalendarSubmits=0;e.form.addEventListener('submit',()=>window.newCalendarSubmits++);});
  for(const options of [{isComposing:true},{isComposing:false,keyCode:229}]){
   await input.dispatchEvent('keydown',{key:'Enter',bubbles:true,...options});
   assert.equal(await p.evaluate(()=>window.newCalendarSubmits),0,'全天输入法Enter不submit');
   assert.equal(stub.writes().length,0,'全天输入法确认不调用助手');
  }
  let release,received,posts=0;const gate=new Promise(r=>release=r),first=new Promise(r=>received=r);
  await p.route('**/api/calendar/blocks/create',async route=>{posts++;received();const response=await route.fetch();await gate;await route.fulfill({response});});
  try{
   await input.press('Enter');await p.waitForFunction(()=>[...document.querySelectorAll('[role="dialog"] button')].some(e=>e.type==='submit'&&e.disabled));await first;
   await input.press('Enter');assert.equal(posts,1,'全天忙碌期间仅一个请求');
   assert.equal(await p.evaluate(()=>window.newCalendarSubmits),1,'全天忙碌Enter没有第二次submit');
   assert.equal(stub.writes().length,1,'全天忙碌Enter没有第二次助手写入');
  }finally{release();}
  await dialog.waitFor({state:'detached'});await p.unroute('**/api/calendar/blocks/create');
  assert.deepEqual(stub.writes()[0].input,{title,start:iso('2026-10-04'),end:iso('2026-10-06'),allDay:true,notes:''},'全天含截止日、结束边界为次日零点');
  const all=stub.store.events.at(-1);assert.equal(all.allDay,true,'回读全天flag保持true');
  const allEntry=await item(p,all.id);await allEntry.click();dialog=p.getByRole('dialog',{name:'修改规划块',exact:true});await dialog.waitFor();
  assert.equal(await dialog.getByLabel('截止日',{exact:true}).inputValue(),'2026-10-05','全天编辑反推包含的截止日');
  assert.equal(await dialog.getByRole('radio',{name:'全天',exact:true}).getAttribute('aria-checked'),'true');
  await p.keyboard.press('Escape');await dialog.waitFor({state:'detached'});
  assert.equal(await allEntry.evaluate(e=>e===document.activeElement),true,'全天Esc回焦原入口');
  await allEntry.click();dialog=p.getByRole('dialog',{name:'修改规划块',exact:true});
  const allModified=all.modified;await dialog.getByLabel('截止日',{exact:true}).fill('2026-10-06');await button(dialog,'保存修改').click();await dialog.waitFor({state:'detached'});
  assert.deepEqual(stub.writes()[1].input,{id:all.id,expectedModified:allModified,title,start:iso('2026-10-04'),end:iso('2026-10-07'),allDay:true,notes:''},'跨日全天编辑保冲突基线和精确flag');
  assert.equal(all.allDay,true);assert.equal(all.end,iso('2026-10-07'));
  await button(p,'新建规划块').click();dialog=p.getByRole('dialog',{name:'新建规划块',exact:true});
  const timedTitle='跨午夜合成中文EnglishWithoutSpaces';
  await fields(dialog,{title:timedTitle,startDate:'2026-10-04',endDate:'2026-10-05',allDay:false,start:'23:30',end:'00:30'});
  await inspectDialog(p,`跨日指定时间 ${width}`);await button(dialog,'写入“工作台”日历').click();await dialog.waitFor({state:'detached'});
  const timed=stub.store.events.at(-1);assert.equal(timed.allDay,false);
  assert.deepEqual(stub.writes()[2].input,{title:timedTitle,start:iso('2026-10-04','23:30'),end:iso('2026-10-05','00:30'),notes:''},'指定时间跨午夜创建保留备注输入');
  const timedEntry=await item(p,timed.id);await timedEntry.click();dialog=p.getByRole('dialog',{name:'修改规划块',exact:true});
  assert.equal(await dialog.getByLabel('截止日',{exact:true}).inputValue(),'2026-10-05');
  const timedModified=timed.modified;await dialog.getByLabel('截止日',{exact:true}).fill('2026-10-06');
  await button(dialog,'保存修改').click();await dialog.waitFor({state:'detached'});
  assert.deepEqual(stub.writes()[3].input,{id:timed.id,expectedModified:timedModified,title:timedTitle,start:iso('2026-10-04','23:30'),end:iso('2026-10-06','00:30'),notes:''},'跨日编辑精确保留真实起止，不缩成同日');
  assert.equal(timed.end,iso('2026-10-06','00:30'));assert.equal(timed.allDay,false);
  await geometry(p,'main',`新增日历 ${width}`);await axe(p,`新增日历 ${width}`);await motion(p,'main',geometry);await axe(p,'日历运行中reduce');
  await p.context().close();await app.close();app=null;
 }
 for(const width of [320,390,1440]){
  const stub=batch3Stub(batch3Data());await setup(stub);
  const context=await browser.newContext({viewport:{width,height:1000},timezoneId:'Asia/Shanghai',reducedMotion:'reduce'}),p=await context.newPage();p.setDefaultTimeout(10000);
  p.on('pageerror',e=>errors.push(e.message));p.on('request',r=>requests.push(r.url()));await batch3Routes(p);
  let mode='error';await p.route('**/api/agent-health/history',r=>r.fulfill({json:{at:null,items:[],loaded:false}}));
  await p.route('**/api/agent-health/inspect',r=>mode==='error'?r.fulfill({status:503,json:{error:'合成体检回执失败EnglishWithoutSpaces'.repeat(8)}}):r.fulfill({json:{at:'2026-10-04T02:00:00.000Z',loaded:true,items:[{agentId:'codex',name:'合成未知中文EnglishWithoutSpaces'.repeat(8),status:'unknown',health:null,at:'2026-10-04T02:00:00.000Z',unread:['所有内容'],error:'合成读取失败'}]}}));
  await p.goto(app.url+'/#agents');await selectAgentTab(p,'codex','体检');const audit=p.getByRole('region',{name:'能力体检',exact:true});await audit.waitFor();
  await audit.getByText('尚未体检；检查后保存本机回执并汇总到待处理。',{exact:true}).waitFor();
  assert.equal(await audit.locator('li').count(),0,'未运行不生成正常/零异常条目');assert(!/失效 0|差异 0|不可读 0/.test(await audit.innerText()));
  await button(audit,'检查全部支持体检的已登记 Agent').click();await audit.getByRole('alert').waitFor();
  assert.match(await audit.getByRole('alert').innerText(),/记录未知，未当作没有异常/);
  assert.equal(await audit.locator('li').count(),0,'检查失败不伪造成功结果');
  assert.equal(await button(audit,'检查全部支持体检的已登记 Agent').isEnabled(),true,'失败解除忙碌');
  await geometry(p,'main',`体检错误 ${width}`);await axe(p,`体检错误 ${width}`);
  mode='unknown';await button(audit,'检查全部支持体检的已登记 Agent').click();await audit.getByText(/结果未知/).waitFor();
  assert.equal(await audit.locator('li').count(),1);assert(!/失效 0|差异 0|不可读 0/.test(await audit.innerText()),'未知不当零');
  assert.equal(await audit.getByRole('alert').count(),0,'成功收到未知回执后解除上次请求错误');
  await geometry(p,'main',`体检未知长文本 ${width}`);await axe(p,`体检未知 ${width}`);await motion(p,'main',geometry);await axe(p,'体检运行中reduce');
  await context.close();await app.close();app=null;
 }
 assert.deepEqual(errors,[]);assert.deepEqual(forbidden,[]);assert(requests.every(u=>/^http:\/\/127\.0\.0\.1:\d+\//.test(u)),'零外部请求');
 console.log('PASS 派单151新增日历全天/跨午夜创建及跨日编辑、IME/busy、Esc回焦；体检未运行/失败/未知；320/390/1440逐元素44px/axe/运行中reduce。');
}finally{await browser.close();await app?.close();}
