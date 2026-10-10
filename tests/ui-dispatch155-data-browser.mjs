// 派单155 C05/C10：全部来源为合成主库与本次fixture，原生宿主适配器隔离。
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {fixture} from './fixture.mjs';
import {seed,revise,current,makeAsset} from '../src/store.js';
import {diffLineCounts} from '../src/version-diff.js';
import {geometry,axe,motion} from './ui-v14-checks.mjs';
import {installCapabilityRequestGuard} from './ui-capability-browser-guards.mjs';
const {chromium}=createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE||'/Users/nat/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const stamp='2026-10-04T02:00:00.000Z',state=seed();
state.notes=[];state.connections={roots:[],agents:[],projects:[],errors:[],truncated:false,agentScannedAt:stamp,projectScannedAt:stamp,github:{status:'not_connected',login:'',message:'合成未连接',at:stamp}};
state.model={...state.model,provider:'openai',model:'synthetic'};
state.connections.roots=['/synthetic'];
state.connections.projects=[0,1].map(i=>({id:'synthetic-project-'+i,name:'合成项目'+i,kind:'Git',repoKey:'',localPaths:['/synthetic/project'+i],branch:'main',active:true}));
let asset=state.assets.find(a=>a.type==='Prompt');
asset={...asset,versions:[{...current(asset),content:'甲'.repeat(100001)}]};
asset=revise(asset,{...current(asset),title:'合成长正文版本',content:'乙'.repeat(100001)});
state.assets=state.assets.map(a=>a.id===asset.id?asset:a);
let packaged=makeAsset({type:'Skill',title:'合成长包文件版本',files:[{path:'SKILL.md',text:true,data:'甲'.repeat(100001),mode:0o644}]});packaged=revise(packaged,{...current(packaged),files:[{path:'SKILL.md',text:true,data:'乙'.repeat(150001),mode:0o644}]});state.assets.push(packaged);
const app=await fixture(),browser=await chromium.launch(),errors=[];let collabCount=0;
const connections=state.connections;await app.repository.write({...state,connections:undefined},{initialize:true});await app.repository.updateConnections(()=>connections);
try {
 for(const width of [320,390,1440])for(const route of ['home','history','projects','inbox','settings']){
  const context=await browser.newContext({viewport:{width,height:1000},reducedMotion:'reduce'}),p=await context.newPage();p.setDefaultTimeout(10000);
  p.on('pageerror',e=>errors.push(e.message));const guard=await installCapabilityRequestGuard(p,app.url);
  await p.route('**/api/project-status/inspect',r=>r.fulfill({json:{at:stamp,stallDays:7,activeCount:2,softLimit:7,items:['implement','unknown'].map((id,i)=>({projectId:'synthetic-project-'+i,name:'合成项目'+i,root:'/synthetic/project'+i,current:{state:'ok',path:'CURRENT.md',fields:{stateId:'P-20261004-155',writer:i?'无':'Codex 开发',next:'合成下一步',handoff:{text:'合成交接',href:'docs/synthetic.md'}}},stage:{id,label:i?'未知':'实现',basis:i?'':'当前写入者',keyword:i?'':'开发'},activity:{state:'active',idleDays:0},safety:{issues:[],checks:{git:{state:'repo'},remote:{state:'none'},dirty:{state:'ok',count:0},sensitive:{state:'ok',total:0,files:[]},visibility:{state:'private'}}}}))}}));
  await p.route('**/api/project-status/activity',r=>r.fulfill({json:{at:stamp,items:[]}}));
  await p.route('**/api/project-github/panel',r=>r.fulfill({json:{at:stamp,items:[]}}));
  await p.goto(app.url+'/#'+(route==='history'?'assets':route));await p.locator('main h1').waitFor();
  if(route==='home'){
   await p.locator('.hx').waitFor();
   assert.equal(await p.locator('.hx-mod').count(),4);
   if(!collabCount){await app.repository.updateCollab(rows=>[...rows,{schema:1,id:'synthetic-copy-155',kind:'dispatch',projectId:'synthetic-project-0',projectName:'合成项目0',agent:'codex',stage:'implement',stateId:'P-20261004-155',promptSha256:'a'.repeat(64),at:stamp}]);collabCount=1;await p.reload();await p.locator('.hx').waitFor();}
   assert.equal((await app.repository.read()).collabLog.length,1,'首页迁移不删除既有协同留痕');
   assert.doesNotMatch(await p.locator('main').innerText(),/体检、夜间结果等来源尚未接入/);
  }
  if(route==='history'){
   await p.getByRole('button',{name:'查看 合成长正文版本',exact:true}).click();
   let d=p.getByRole('dialog',{name:'资产详情',exact:true});
   await d.getByRole('button',{name:/^历史 \d+$/}).click();
   assert.deepEqual(diffLineCounts(asset.versions[0].content,asset.versions[1].content),{available:true,added:1,removed:1,reason:""});
   const row=d.locator('.version-comparison');
   await row.getByText('比较起点全文',{exact:true}).click();await row.getByText('比较终点全文',{exact:true}).click();
   const full=row.locator('.text-difference pre.history-text');assert.equal(await full.count(),2);
   assert.equal(await full.nth(0).textContent(),asset.versions[0].content,'前全文没有截断');
   assert.equal(await full.nth(1).textContent(),asset.versions[1].content,'后全文没有截断');
   assert.deepEqual(diffLineCounts(await full.nth(0).textContent(),await full.nth(1).textContent()),{available:true,added:1,removed:1,reason:""},'同份DOM全文仍精确计算行数；默认UI没有摘要');
   await geometry(p,'[role=dialog]','长正文全文'+width);await axe(p,'长正文全文'+width);
   await p.keyboard.press('Escape');
   await p.getByRole('button',{name:'查看 合成长包文件版本',exact:true}).click();
   d=p.getByRole('dialog',{name:'资产详情',exact:true});await d.getByRole('button',{name:/^历史 \d+$/}).click();
   assert.deepEqual(diffLineCounts('甲'.repeat(100001),'乙'.repeat(150001)),{available:true,added:1,removed:1,reason:""});
   const fileRow=d.locator('.version-comparison .file-change');
   await fileRow.locator('summary').click();
   await fileRow.getByText('比较起点全文',{exact:true}).click();await fileRow.getByText('比较终点全文',{exact:true}).click();
   const fileFull=fileRow.locator('pre.history-text');
   assert.equal(await fileFull.nth(0).textContent(),'甲'.repeat(100001));
   assert.equal(await fileFull.nth(1).textContent(),'乙'.repeat(150001));
   assert.deepEqual(diffLineCounts(await fileFull.nth(0).textContent(),await fileFull.nth(1).textContent()),{available:true,added:1,removed:1,reason:""});
   await geometry(p,'[role=dialog]','长包文件全文'+width);await axe(p,'长包文件全文'+width);
   await p.keyboard.press('Escape');
  }
  if(route==='inbox'){assert.equal(await p.getByLabel('来源记录范围说明').count(),0);assert.equal(await p.getByRole('dialog',{name:'待处理',exact:true}).count(),1);assert.equal(await p.getByLabel('尚未接入的来源').count(),0);}
  if(route==='settings'){await p.getByRole('radio',{name:'授权与安全',exact:true}).click();await p.getByRole('button',{name:'配置模型连接',exact:true}).click();const d=p.getByRole('dialog',{name:'配置模型连接',exact:true});await d.waitFor();assert.equal(await d.getByText('模型连接意向草稿',{exact:true}).count(),0);assert.equal(await d.getByRole('region',{name:'真实模型连接'}).count(),1);assert.doesNotMatch(await d.innerText(),/未连接/);await geometry(p,'[role=dialog]','settings draft'+width);await axe(p,'settings draft'+width);await d.press('Escape');await d.waitFor({state:'detached'});}
  if(route==='projects'){
   await p.locator('.pj-stages').first().waitFor();
   assert.equal(await p.getByLabel('接力阶段：实现',{exact:true}).getAttribute('title'),'当前写入者');
   assert.equal(await p.locator('.pj-stages [aria-current="step"]').count(),1);
   assert.equal(await p.locator('.pj-stages [aria-current="step"]').innerText(),'实现');
   assert.equal(await p.getByLabel('接力阶段：未知',{exact:true}).getAttribute('title'),'当前记录不足以推断');assert.equal(await p.locator('.pj-stages').nth(1).locator('[aria-current]').count(),0);
  }
  await geometry(p,'main',route+' '+width);await axe(p,route+' '+width);await motion(p,'main');
  guard.assertNoExternal(['/api/workspace']);await context.close();
 }
 assert.deepEqual(errors,[]);assert.deepEqual(app.calls,{projects:0,agents:0});
 console.log('PASS 派单155本机缺口：Home/History/Projects/Inbox/Settings×320/390/1440，准确长文本行数和无损全文，已知阶段与未知边界，44/逐元素/axe/动态reduce/精确origin。');
}finally{await browser.close();await app.close();}
