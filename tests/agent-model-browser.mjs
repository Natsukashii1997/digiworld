import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {join} from 'node:path';
import {chromium} from 'playwright';
import {fixture} from './fixture.mjs';
import {seed} from '../src/store.js';
import {selectAgentTab} from './agents-v16-helpers.mjs';
import {geometry,axe} from './ui-v14-checks.mjs';
import {sameEventClickAndEscape} from './ui-capability-browser-guards.mjs';
const out=process.env.GUIJI_TEST_RESULTS||'test-results/agent-model';
await fs.mkdir(out,{recursive:true});
const browser=await chromium.launch(),errors=[];
const identity=s=>[s.dev,s.ino,s.birthtimeMs,s.uid].join(':');
const button=(scope,name)=>scope.getByRole('button',{name,exact:true});
let app,home,program;
try {
 app=await fixture({discovery:{checkAgentWriteMetadata:async()=>{},checkModelConfigMetadata:async()=>({provenance:null}),
  inspectAgentInventory:async()=>({errors:[],truncated:false,homes:[{id:'model-home',path:home,source:'合成独立Home',status:'present',errors:[],identity:identity(await fs.lstat(home))}]}),
  inspectAgentPrograms:async()=>[{path:program,kind:'CLI',status:'present',identity:identity(await fs.lstat(program))}],
 }});
 home=join(app.directory,'synthetic-home');program=join(app.directory,'synthetic-cli');
 await fs.mkdir(home,{mode:0o700});await fs.writeFile(program,'NEVER EXECUTE',{mode:0o600});
 const config='# SYNTHETIC_PRIVATE_DO_NOT_EXPORT\nmodel="old-model" # preserve\n[tui]\nanimations=true\n';
 const configPath=join(home,'config.toml');await fs.writeFile(configPath,config,{mode:0o600});
 await app.repository.write(seed(),{initialize:true});const stamp='2026-10-07T00:00:00.000Z';
 await app.repository.updateConnections(c=>({...c,roots:[],projects:[],errors:[],truncated:false,projectScannedAt:stamp,agentScannedAt:stamp,github:{status:'not_connected',login:'',message:'',at:''},agents:[{id:'codex',name:'Codex',status:'detected',kind:'开发 Agent',programs:[{path:program,kind:'CLI'}],configFound:true}],agentTargets:[{schema:1,id:'model-target',agentId:'codex',bindingId:'model-binding',label:'合成模型目标',program:{path:program,kind:'CLI'},home:{id:'model-home',path:home,label:'合成Home'},createdAt:stamp,updatedAt:stamp}]}));
 const session=await (await fetch(app.url+'/api/session',{headers:{'X-Workbench-Client':'1'}})).json();
 async function post(path,body){const r=await fetch(app.url+'/api'+path,{method:'POST',headers:{'X-Workbench-Token':session.token,'Content-Type':'application/json'},body:JSON.stringify(body)});const v=await r.json();assert.equal(r.status,200,v.error);return v;}
 async function setGate(enabled){const p=await post('/capabilities/settings/preview',{capability:'agent',enabled,options:{}});await post('/capabilities/settings/apply',{token:p.token,operationId:p.operationId,confirmed:true});}
 for (const width of [390,320]) {
  const context=await browser.newContext({viewport:{width,height:950},reducedMotion:'reduce'});
  let page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
  const open=async()=>{await page.goto(app.url+'/#agents');await selectAgentTab(page,'codex','配置');await button(page,'管理受控内容与配置：codex').click();const d=page.getByRole('dialog',{name:'Agent 受控内容与配置',exact:true});await d.getByRole('radiogroup',{name:'Agent 受控管理目标',exact:true}).getByRole('radio',{name:'合成模型目标 · codex',exact:true}).click();await button(d,'读取当前用户默认模型').waitFor();return d;};
  let d=await open();const section=()=>d.getByRole('region',{name:'Codex 用户默认模型',exact:true});
  await button(d,'读取当前用户默认模型').click();await d.getByText('old-model',{exact:true}).waitFor();await d.getByLabel('目标模型 ID',{exact:true}).fill('new-model');await button(d,'预览默认模型修改').click();
  await d.getByRole('region',{name:'Codex 模型变更预览',exact:true}).waitFor();assert(await button(d,'确认修改用户默认模型').isDisabled());assert.equal(await fs.readFile(configPath,'utf8'),config);await button(d,'取消本次预览').click();
  await setGate(true);await button(d,'读取 Agent 写入授权').click();await d.getByText(/Agent 写入已开启/).waitFor();await button(d,'预览默认模型修改').click();assert(await button(d,'确认修改用户默认模型').isDisabled(),'old Agent write grant cannot authorize model writes');await button(d,'取消本次预览').click();
  await button(d,'读取模型配置授权').click();await button(d,'预览开启模型配置写入').click();
  await page.route('**/api/capabilities/agent/model-permission-apply',async route=>{const response=await route.fetch();assert.equal(response.status(),200);await route.abort();});
  await sameEventClickAndEscape(page,button(d,'确认模型配置授权'),'/api/capabilities/agent/model-permission-apply');
  await d.getByText('授权结果未确认，请查询原授权编号；暂不提交新的设置。',{exact:true}).waitFor();await button(d,'查询原模型授权结果').click();await d.getByText('模型配置授权已回读；请重新预览模型修改。',{exact:true}).waitFor();
  await page.unroute('**/api/capabilities/agent/model-permission-apply');await button(d,'预览默认模型修改').click();
  let applies=0;
  await page.route('**/api/capabilities/agent/model-apply',async route=>{applies++;const response=await route.fetch();assert.equal(response.status(),200);await route.abort();});
  await sameEventClickAndEscape(page,button(d,'确认修改用户默认模型'),'/api/capabilities/agent/model-apply');
  await d.getByText(/结果未知；已保留原编号/).waitFor();assert.equal(applies,1);await d.press('Escape');assert.equal(await d.isVisible(),true,'unknown drawer is retained');
  assert.equal(await fs.readFile(configPath,'utf8'),config.replace('old-model','new-model'));
  await page.close();page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));d=await open();assert.equal(await d.getByRole('region',{name:'Codex 用户默认模型',exact:true}).count(),1,'model panel is not duplicated during parent updates');
  const peer=await context.newPage();await peer.goto(app.url+'/#home');await peer.evaluate(()=>{for(const key of Object.keys(localStorage))if(key.startsWith('workbench:agent-pending:v2:')&&key.includes(':agent-model:'))localStorage.removeItem(key);});await peer.close();
  await button(d,'查询原操作结果').waitFor();await button(d,'查询原操作结果').click();await d.getByText('用户默认配置已写入并回读',{exact:true}).waitFor();assert.equal(applies,1,'new-tab check never replays');
  await button(d,'读取模型配置授权').click();await button(d,'读取当前绑定的模型操作历史').click();await button(d,'预览恢复此操作').first().click();await button(d,'确认恢复原默认模型').click();await d.getByText('用户默认配置已写入并回读',{exact:true}).waitFor();assert.equal(await fs.readFile(configPath,'utf8'),config);
  await button(d,'读取当前用户默认模型').click();await d.getByLabel('目标模型 ID',{exact:true}).fill('never-started-model');await button(d,'预览默认模型修改').click();let requestBody;
  await page.route('**/api/capabilities/agent/model-apply',async route=>{requestBody=route.request().postDataJSON();await route.abort();});await button(d,'确认修改用户默认模型').click();await button(d,'查询原操作结果').click();
  await d.getByText('原操作已封闭，确认未执行',{exact:true}).waitFor();assert.equal(await fs.readFile(configPath,'utf8'),config);
  const late=await fetch(app.url+'/api/capabilities/agent/model-apply',{method:'POST',headers:{'X-Workbench-Token':session.token,'Content-Type':'application/json'},body:JSON.stringify(requestBody)});assert.equal(late.status,200);assert.equal((await late.json()).closed,true,'sealed ID refuses late confirm');
  assert.equal((await d.innerText()).includes('SYNTHETIC_PRIVATE'),false);await geometry(page,'[role=dialog]',`${width} 模型变更/恢复`);await axe(page,`${width} 默认模型`);await page.screenshot({path:join(out,`model-${width}.png`),fullPage:true});const revoke=await post('/capabilities/agent/model-permission-preview',{enabled:false});await post('/capabilities/agent/model-permission-apply',{token:revoke.token,operationId:revoke.operationId,confirmed:true});await context.close();await setGate(false);
 }
 assert.deepEqual(errors,[]);console.log('agent-model-browser PASS: isolated real API; default off, scoped preview/apply, same-event double click+Escape, lost response/new tab check, rollback preserves bytes, closed unknown rejects delayed apply, 320/390 geometry+axe');
}finally{await app?.close();await browser.close();}
