// Actual workbench UI + startServer integration on one temporary guiji-* root.
// Run with a build of the candidate UI: GUIJI_TEST_DIST=/absolute/path/to/dist
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {randomUUID} from 'node:crypto';
import {chromium} from 'playwright';
import {startServer} from '../server/http.mjs';
import {seed,makeAsset,current} from '../src/store.js';
import {readLocalSkill} from '../server/skill-files.mjs';
import {selectAgentTab} from './agents-v16-helpers.mjs';
import {geometry,axe} from './ui-v14-checks.mjs';
import {sameEventClickAndEscape,installCapabilityRequestGuard} from './ui-capability-browser-guards.mjs';

const staticRoot=process.env.GUIJI_TEST_DIST;
assert(staticRoot&&await fs.stat(staticRoot).then(s=>s.isDirectory(),()=>false),'GUIJI_TEST_DIST must name an existing synthetic candidate build');
const out=process.env.GUIJI_TEST_RESULTS||join(tmpdir(),'guiji-known-mount-integration-evidence');
await fs.mkdir(out,{recursive:true});
const base=await fs.realpath(await fs.mkdtemp(join(tmpdir(),'guiji-known-mount-ui-')));
const data=join(base,'database'),home=join(base,'independent-home'),skills=join(home,'skills'),program=join(base,'synthetic-cli');
await fs.mkdir(skills,{recursive:true,mode:0o700});
await fs.writeFile(program,'SYNTHETIC CLI - NEVER EXECUTE',{mode:0o600});
const identity=s=>[s.dev,s.ino,s.birthtimeMs,s.uid].join(':');
const receiptId=randomUUID();
const browser=await chromium.launch();
let app,context,page;const pageErrors=[];
try{
  app=await startServer({directory:data,port:0,staticRoot,enableCapabilityScheduler:false,discovery:{
    readAgentRepairSkill:readLocalSkill,readAgentWriteSkill:readLocalSkill,
    checkAgentWriteMetadata:async()=>{},
    inspectAgentInventory:async()=>({errors:[],truncated:false,homes:[{id:'repair-home',path:home,source:'合成独立Home',status:'present',errors:[],identity:identity(await fs.lstat(home))}]}),
    inspectAgentPrograms:async()=>[{path:program,kind:'CLI',status:'present',identity:identity(await fs.lstat(program))}],
    inspectSkillAdmission:async input=>({...input,status:'approved',receiptId}),
    assertSkillAdmission:async input=>({...input,status:'approved'}),
  }});
  assert.equal(new URL(app.url).hostname,'127.0.0.1');assert.notEqual(new URL(app.url).port,'5178');
  const asset=makeAsset({title:'合成缺失修复 Skill',type:'Skill',files:[{path:'SKILL.md',text:true,data:'---\nname: synthetic-mount-repair\n---\n# Synthetic only\n',mode:0o600}]});
  const initial=seed();initial.assets=[asset];initial.notes=[];initial.projects=[];
  await app.repository.write(initial,{initialize:true});
  const stamp='2026-10-07T00:00:00.000Z',targetId='repair-target';
  await app.repository.updateConnections(c=>({...c,roots:[],projects:[],errors:[],truncated:false,projectScannedAt:stamp,agentScannedAt:stamp,
    github:{status:'not_connected',login:'',message:'',at:''},agents:[{id:'codex',name:'Codex',kind:'开发 Agent',status:'detected',programs:[{path:program,kind:'CLI'}],configFound:true}],
    agentTargets:[{schema:1,id:targetId,agentId:'codex',bindingId:'repair-binding',label:'合成修复目标',program:{path:program,kind:'CLI'},home:{id:'repair-home',path:home,label:'合成Home'},createdAt:stamp,updatedAt:stamp}]}));
  const session=await (await fetch(app.url+'/api/session',{headers:{'X-Workbench-Client':'1'}})).json();
  async function post(path,body){const r=await fetch(app.url+'/api'+path,{method:'POST',headers:{'X-Workbench-Token':session.token,'Content-Type':'application/json'},body:JSON.stringify(body)});const value=await r.json();assert.equal(r.status,200,`${path}: ${value.error||r.status}`);return value;}
  const grant=await post('/capabilities/settings/preview',{capability:'agent',enabled:true,options:{}});
  assert.equal((await post('/capabilities/settings/apply',{token:grant.token,operationId:grant.operationId,confirmed:true})).status,'verified');
  const state=await app.repository.read();
  const published=await post('/capabilities/agent/publish-preview',{targetId,assetId:asset.id,versionId:current(asset).id,revision:state.revision});
  assert.equal((await post('/capabilities/agent/apply',{token:published.token,revision:published.revision})).status,'matches_after');
  const destination=join(skills,'synthetic-mount-repair');
  assert.match(await fs.readFile(join(destination,'SKILL.md'),'utf8'),/Synthetic only/);
  await fs.rm(destination,{recursive:true}); // only the temporary directory just published above
  assert.equal(await fs.access(destination).then(()=>true,()=>false),false);

  context=await browser.newContext({viewport:{width:390,height:950},reducedMotion:'reduce'});
  let sends=0;
  async function open(){
    page=await context.newPage();page.on('pageerror',error=>pageErrors.push(error.message));
    const guard=await installCapabilityRequestGuard(page,app.url);
    await page.goto(app.url+'/#agents');await selectAgentTab(page,'codex','配置');
    await page.getByRole('button',{name:'管理受控内容与配置：codex',exact:true}).click();
    const dialog=page.getByRole('dialog',{name:'Agent 受控内容与配置',exact:true});
    await dialog.getByRole('radiogroup',{name:'Agent 受控管理目标',exact:true}).getByRole('radio',{name:'合成修复目标 · codex',exact:true}).click();
    await dialog.getByRole('button',{name:'读取当前目标 Agent 操作记录',exact:true}).click();
    await dialog.getByRole('button',{name:'预览已知缺失修复',exact:true}).click();
    return{dialog,guard};
  }
  let opened=await open();
  await opened.dialog.getByRole('button',{name:'预览原发布记录与缺失目录',exact:true}).click();
  await opened.dialog.getByRole('region',{name:'修复预览',exact:true}).waitFor();
  await opened.dialog.getByRole('checkbox',{name:/我已核对原发布/}).check();
  await page.route('**/api/capabilities/agent/repair-authorize',async route=>{
    sends++;const response=await route.fetch();assert.equal(response.status(),200);await route.abort();
  });
  await sameEventClickAndEscape(page,opened.dialog.getByRole('button',{name:'单独授权本次修复',exact:true}),'/api/capabilities/agent/repair-authorize');
  await opened.dialog.getByRole('alert').filter({hasText:'本地服务连接中断'}).waitFor();
  assert.equal(sends,1);assert.equal(await opened.dialog.isVisible(),true);
  opened.guard.assertNoExternal(['/api/capabilities/agent/repair-preview','/api/capabilities/agent/repair-authorize']);
  await page.close();
  opened=await open();
  await opened.dialog.getByRole('button',{name:'查询原编号并复验字节',exact:true}).click();
  await opened.dialog.getByRole('button',{name:'恢复本次授权预览',exact:true}).waitFor();
  await opened.dialog.getByRole('button',{name:'恢复本次授权预览',exact:true}).click();
  await opened.dialog.getByRole('region',{name:'修复预览',exact:true}).waitFor();
  for(const width of [390,320]){
    await page.setViewportSize({width,height:950});
    await geometry(page,'[role=dialog]',`已知缺失修复 ${width}`);
    await axe(page,`已知缺失修复 ${width}`);
    await page.screenshot({path:join(out,`known-mount-repair-${width}.png`),fullPage:true});
  }
  opened.guard.assertNoExternal(['/api/capabilities/agent/repair-check','/api/capabilities/agent/repair-resume']);
  assert.equal(sends,1,'new page check and resume must not resend authorization');
  assert.equal(await fs.access(destination).then(()=>true,()=>false),false,'authorization alone does not rebuild the Skill directory');
  assert.deepEqual(pageErrors,[]);
  console.log('known-mount-repair-integrated-browser PASS: actual isolated startServer/project UI, original owned publish receipt, lost authorization response/new page recovery, 320/390 geometry+axe');
}catch(error){if(page&&!page.isClosed()){console.log((await page.locator('body').innerText()).slice(-4500));await page.screenshot({path:join(out,'failure.png'),fullPage:true});}throw error;}
finally{await context?.close();await app?.close();await browser.close();await fs.rm(base,{recursive:true,force:true});}
