import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {randomUUID} from 'node:crypto';
import {chromium} from 'playwright';
import {startServer} from '../server/http.mjs';
import {seed,makeAsset} from '../src/store.js';
import {readLocalSkill} from '../server/skill-files.mjs';
import {geometry,axe} from './ui-v14-checks.mjs';
import {sameEventClickAndEscape} from './ui-capability-browser-guards.mjs';
const out=process.env.GUIJI_TEST_RESULTS||'test-results/skill-pool';await fs.mkdir(out,{recursive:true});
const base=await fs.realpath(await fs.mkdtemp(join(tmpdir(),'guiji-pool-browser-'))),home=join(base,'user'),codex=join(home,'.codex'),pool=join(home,'.agents','skills'),program=join(base,'never-execute');
await fs.mkdir(codex,{recursive:true,mode:0o700});await fs.mkdir(pool,{recursive:true,mode:0o700});await fs.writeFile(program,'SYNTHETIC NEVER EXECUTE',{mode:0o600});
const browser=await chromium.launch(),errors=[];let app,page;
try{
 const receiptId=randomUUID();let admission=true;
 app=await startServer({directory:join(base,'database'),port:0,staticRoot:process.env.GUIJI_TEST_DIST,discovery:{skillPoolUserHome:home,readPoolSkill:readLocalSkill,checkSkillPoolMetadata:async()=>{},inspectAgentInventory:async()=>({errors:[],truncated:false,homes:[{id:'pool-home',path:codex,status:'present',source:'合成独立Home',identity:'pool-home-identity',errors:[]}]}),inspectAgentPrograms:async()=>[{path:program,kind:'CLI',status:'present',identity:'pool-program-identity'}],inspectSkillAdmission:async input=>admission?{...input,status:'approved',receiptId}:null,assertSkillAdmission:async input=>({...input,status:'approved'})}});
 const initial=seed(),asset=makeAsset({title:'合成共享池 Skill',type:'Skill',files:[{path:'SKILL.md',text:true,data:'---\nname: synthetic-pool\n---\n# Synthetic only\n',mode:0o600}]});initial.assets=[asset];initial.notes=[];initial.projects=[];await app.repository.write(initial,{initialize:true});const stamp='2026-10-07T00:00:00.000Z';await app.repository.updateConnections(c=>({...c,roots:[],projects:[],errors:[],truncated:false,projectScannedAt:stamp,agentScannedAt:stamp,agents:[],github:{status:'not_connected',login:'',message:'',at:''},agentTargets:[{schema:1,id:'pool-target',agentId:'codex',bindingId:'pool-binding',label:'合成共享目标',program:{path:program,kind:'CLI'},home:{id:'pool-home',path:codex,label:'合成Home'},createdAt:stamp,updatedAt:stamp}]}));
 const b=name=>page.getByRole('button',{name,exact:true});
 const context=await browser.newContext({viewport:{width:390,height:950},reducedMotion:'reduce'});
 const open=async()=>{page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));await page.goto(app.url+'/#assets');await b('查看 合成共享池 Skill').click();await b('预览发布到共享池').click();await b('预览开启共享池授权').waitFor();return page.getByRole('region',{name:'Skill 共享池发布',exact:true});};
 let panel=await open();await b('预览开启共享池授权').click();await b('确认共享池独立授权').click();await panel.getByText(/独立共享池授权：已开启/).waitFor();
 await panel.getByLabel('Codex 管理目标').selectOption('pool-target');admission=false;await b('预览精确版本与共享范围').click();await panel.getByText(/尚未通过或尚未接入；发布保持关闭/).waitFor();await panel.getByLabel('我已在资产详情阅读此固定版本完整内容，并核对包摘要').check();await panel.getByLabel('我理解其他读取共享池的程序也可能发现此 Skill').check();assert(await b('确认发布到共享池').isDisabled());await b('取消预览').click();admission=true;
 await b('预览精确版本与共享范围').click();await panel.getByLabel('我已在资产详情阅读此固定版本完整内容，并核对包摘要').check();await panel.getByLabel('我理解其他读取共享池的程序也可能发现此 Skill').check();let sends=0;
 await page.route('**/api/capabilities/agent/pool-publish-apply',async route=>{sends++;const response=await route.fetch();assert.equal(response.status(),200);await route.abort();});await sameEventClickAndEscape(page,b('确认发布到共享池'),'/api/capabilities/agent/pool-publish-apply');await panel.getByText(/共享池结果未知；已保留原编号/).waitFor();assert.equal(sends,1);assert.match(await fs.readFile(join(pool,'synthetic-pool','SKILL.md'),'utf8'),/Synthetic only/);
 await page.close();panel=await open();await b('查询原发布或撤回结果').click();await b('预览非破坏撤回').waitFor();assert.equal(sends,1);await b('预览非破坏撤回').click();const responseWait=page.waitForResponse(r=>new URL(r.url()).pathname==='/api/capabilities/agent/pool-publish-rollback');await b('确认撤回并回读').click();const undo=await (await responseWait).json();assert.equal(undo.status,'matches_after');await panel.getByText(/原文件已移至私有保留区/).waitFor();await assert.rejects(fs.stat(join(pool,'synthetic-pool')),{code:'ENOENT'});
 for(const width of [390,320]){await page.setViewportSize({width,height:950});await geometry(page,'[role=dialog]',`${width}共享池`);await axe(page,`${width}共享池`);await page.screenshot({path:join(out,`pool-${width}.png`),fullPage:true});}
 assert.equal((await app.repository.read()).assetActivity?.length||0,0,'publish does not invent asset use or native adoption');assert.deepEqual(errors,[]);await context.close();console.log('skill-pool-browser PASS: explicit fixed-version admission, separate permission, double-click/lost response/new tab query, non-destructive rollback, 320/390 geometry+axe');
}catch(error){if(page&&!page.isClosed()){console.log((await page.locator('body').innerText()).slice(-4500));await page.screenshot({path:join(out,'failure.png'),fullPage:true});}throw error;}finally{await app?.close();await browser.close();await fs.rm(base,{recursive:true,force:true});}
