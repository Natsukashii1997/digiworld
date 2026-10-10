import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {join} from 'node:path';
import {chromium} from 'playwright';
import {fixture} from './fixture.mjs';
import {seed} from '../src/store.js';
import {selectAgentTab} from './agents-v16-helpers.mjs';
import {geometry,axe} from './ui-v14-checks.mjs';
import {sameEventClickAndEscape} from './ui-capability-browser-guards.mjs';
const out=process.env.GUIJI_TEST_RESULTS||'test-results/agent-snapshots';
await fs.mkdir(out,{recursive:true});
const browser=await chromium.launch();
let home,program,app;
const identity=s=>[s.dev,s.ino,s.birthtimeMs,s.uid].join(':');
try {
 app=await fixture({discovery:{
  checkAgentWriteMetadata:async()=>{},
  inspectAgentInventory:async()=>({errors:[],truncated:false,homes:[{id:'snapshot-home',path:home,source:'合成独立Home',status:'present',errors:[],identity:identity(await fs.lstat(home))}]}),
  inspectAgentPrograms:async()=>[{path:program,kind:'CLI',status:'present',identity:identity(await fs.lstat(program))}],
 }});
 home=join(app.directory,'synthetic-home');program=join(app.directory,'synthetic-cli');
 await fs.mkdir(home,{mode:0o700});await fs.writeFile(program,'NEVER EXECUTE',{mode:0o600});
 const config='api_key="SYNTHETIC_PRIVATE_NOT_TO_EXPORT"\n[tui]\nanimations=true\n';
 await fs.writeFile(join(home,'config.toml'),config,{mode:0o600});
 await app.repository.write(seed(),{initialize:true});
 const stamp='2026-10-07T00:00:00.000Z';
 await app.repository.updateConnections(c=>({...c,roots:[],projects:[],errors:[],truncated:false,projectScannedAt:stamp,agentScannedAt:stamp,github:{status:'not_connected',login:'',message:'',at:''},agents:[{id:'codex',name:'Codex',status:'detected',kind:'开发 Agent',programs:[{path:program,kind:'CLI'}],configFound:true}],agentTargets:[{schema:1,id:'snapshot-target',agentId:'codex',bindingId:'snapshot-binding',label:'合成快照目标',program:{path:program,kind:'CLI'},home:{id:'snapshot-home',path:home,label:'合成Home'},createdAt:stamp,updatedAt:stamp}]}));
 for (const width of [390,320]) {
  const context=await browser.newContext({viewport:{width,height:900},reducedMotion:'reduce'}),errors=[];let page=await context.newPage();
  page.on('pageerror',e=>errors.push(e.message));
  const open=async()=>{await page.goto(app.url+'/#agents');await selectAgentTab(page,'codex','配置');await page.getByRole('button',{name:'管理受控内容与配置：codex',exact:true}).click();const d=page.getByRole('dialog',{name:'Agent 受控内容与配置',exact:true});await d.getByRole('radiogroup',{name:'Agent 受控管理目标',exact:true}).getByRole('radio',{name:'合成快照目标 · codex',exact:true}).click();return d;};
  let d=await open();await d.getByRole('button',{name:'读取白名单配置快照',exact:true}).click();await d.getByText('终端动画 · tui.animations',{exact:true}).waitFor();
  let saves=0,drop=true;
  await page.route('**/api/capabilities/agent/snapshot-save',async route=>{saves++;const response=await route.fetch();assert.equal(response.status(),200);if(drop){drop=false;return route.abort();}return route.fulfill({response});});
  await sameEventClickAndEscape(page,d.getByRole('button',{name:'保存这份白名单快照',exact:true}),'/api/capabilities/agent/snapshot-save');
  await d.getByText('保存结果未确认，请查询原编号；关闭标签后重新打开仍可核对。',{exact:true}).waitFor();assert.equal(saves,1);assert.equal(await d.getByRole('button',{name:'保存这份白名单快照',exact:true}).isDisabled(),true);
  await page.close();page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));d=await open();await d.getByRole('button',{name:'查询这次快照保存结果',exact:true}).click();await d.getByLabel('已存快照详情',{exact:true}).waitFor();assert.equal(saves,1,'查询不重放');
  await d.press('Escape');await d.waitFor({state:'detached'});d=await open();await d.getByRole('button',{name:'读取本机快照历史',exact:true}).click();await d.getByRole('button',{name:/回读快照 /}).first().click();await d.getByLabel('已存快照详情',{exact:true}).waitFor();
  await d.getByRole('button',{name:'读取白名单配置快照',exact:true}).click();
  await page.route('**/api/capabilities/agent/snapshot-save',route=>route.abort());
  await d.getByRole('button',{name:'保存这份白名单快照',exact:true}).click();
  await d.getByText('保存结果未确认，请查询原编号；关闭标签后重新打开仍可核对。',{exact:true}).waitFor();
  await d.getByRole('button',{name:'查询这次快照保存结果',exact:true}).click();
  await d.getByText('已确认未保存，原编号已结束；请重新读取当前配置后再保存。',{exact:true}).waitFor();
  assert(await d.getByRole('button',{name:'保存这份白名单快照',exact:true}).isDisabled(),'closed operation requires a fresh preview');
  await d.getByRole('button',{name:'读取白名单配置快照',exact:true}).click();
  await d.getByText('终端动画 · tui.animations',{exact:true}).waitFor();
  await page.waitForFunction(()=>![...document.querySelectorAll('button')].find(b=>b.textContent==='保存这份白名单快照')?.disabled);
  assert.equal(await d.getByRole('button',{name:'保存这份白名单快照',exact:true}).isDisabled(),false);
  assert.equal((await d.innerText()).includes('SYNTHETIC_PRIVATE'),false);await geometry(page,'[role=dialog]',`${width} 快照历史与恢复`);await axe(page,`${width} 快照历史`);await page.screenshot({path:join(out,`snapshot-history-${width}.png`),fullPage:true});assert.deepEqual(errors,[]);await context.close();
 }
 assert.equal(await fs.readFile(join(home,'config.toml'),'utf8'),config);
 console.log('agent-snapshots-browser PASS: actual isolated API, lost response, no replay, reopen/history, no secrets, 320/390 geometry+axe');
}finally{await app?.close();await browser.close();}
