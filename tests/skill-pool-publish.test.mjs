import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,dirname} from 'node:path';
import {randomUUID} from 'node:crypto';
import {createSkillPoolPublish} from '../server/skill-pool-publish.mjs';
import {createSkillPoolPermissions} from '../server/skill-pool-permissions.mjs';
import {readLocalSkill} from '../server/skill-files.mjs';
import {agentPendingKey,readAgentPending,writeAgentPending} from '../src/useAgentPending.js';

const ROOT=await fs.realpath(await fs.mkdtemp(join(tmpdir(),'guiji-skill-pool-test-')));
test.after(()=>fs.rm(ROOT,{recursive:true,force:true}));
async function fixture(t,{enabled=true}={}){
 const base=join(ROOT,randomUUID()),home=join(base,'user'),data=join(base,'data'),codex=join(home,'.codex'),pool=join(home,'.agents','skills');
 await fs.mkdir(codex,{recursive:true,mode:0o700});await fs.mkdir(pool,{recursive:true,mode:0o700});await fs.mkdir(data,{mode:0o700});
 const program=join(base,'codex-synthetic-cli');await fs.writeFile(program,'SYNTHETIC NEVER EXECUTE',{mode:0o600});
 const target={id:'target-codex',bindingId:'binding-1',agentId:'codex',label:'合成Codex',program:{path:program,kind:'CLI'},home:{id:'home-codex',path:codex}};
 const version={id:'version-1',files:[{path:'wrapper/SKILL.md',text:true,data:'---\nname: pool-example\n---\n# Synthetic\n',mode:0o600},{path:'wrapper/data.txt',text:true,data:'synthetic',mode:0o600}]};
 const asset={id:'asset-1',type:'Skill',archived:false,versions:[version]};
 const state={revision:1,assets:[asset],connections:{agentTargets:[target]}};
 let queue=Promise.resolve();
 const repository={directory:data,read:async()=>state,withSnapshot:(_options,fn)=>{
  const next=queue.then(()=>fn(state));queue=next.catch(()=>{});return next;
 }};
 const setting={enabled,generation:1},settings={get:async cap=>{assert.equal(cap,'agent');return {...setting};},assertEnabled:async cap=>{assert.equal(cap,'agent');if(!setting.enabled)throw Object.assign(Error('off'),{status:409});return {...setting};}};
 const receiptId=randomUUID();
 const adapters={inspectAgentInventory:async()=>({errors:[],truncated:false,homes:[{id:'home-codex',path:codex,status:'present',source:'合成独立目录',identity:'home-identity',errors:[]}]}),inspectAgentPrograms:async()=>[{path:program,kind:'CLI',status:'present',identity:'program-identity'}],inspectSkillAdmission:async input=>({...input,status:'approved',receiptId}),assertSkillAdmission:async input=>({...input,status:'approved'})};
 const manager=createSkillPoolPublish(repository,{permissions:settings,adapters,userHome:home,checkMetadata:async()=>{}});
 t.after(async()=>fs.rm(base,{recursive:true,force:true}));
 return{base,home,pool,data,target,asset,version,state,setting,settings,adapters,repository,manager};
}
const confirm=p=>({token:p.token,revision:p.revision,packageHash:p.packageHash,admissionReceiptId:p.admissionReceiptId,scopeConfirmed:true,reviewConfirmed:true});

test('默认关：可预览精确版本，未授权不写入',async t=>{
 const f=await fixture(t,{enabled:false}),p=await f.manager.preview({targetId:f.target.id,assetId:f.asset.id,versionId:f.version.id,revision:1});
 assert.equal(p.kind,'pool-publish');assert.equal(p.adoption,'unverified');assert.equal(p.files.length,2);
 await assert.rejects(f.manager.apply(confirm(p)),e=>e.operationNotStarted===true);
 await assert.rejects(fs.lstat(join(f.pool,'pool-example')),{code:'ENOENT'});
});

test('固定版本空位新增、回读、重复确认只查原操作、非破坏回滚',async t=>{
 const f=await fixture(t),p=await f.manager.preview({targetId:f.target.id,assetId:f.asset.id,versionId:f.version.id,revision:1});
 await assert.rejects(f.manager.apply({...confirm(p),reviewConfirmed:false}),/审阅/);
 const result=await f.manager.apply(confirm(p));assert.equal(result.status,'matches_after');assert.equal(result.adoption,'unverified');
 assert.equal(await fs.readFile(join(f.pool,'pool-example','data.txt'),'utf8'),'synthetic');
 assert.equal((await f.manager.check({operationId:p.operationId})).status,'matches_after');
 assert.equal((await f.manager.apply(confirm(p))).status,'matches_after');
 await assert.rejects(f.manager.preview({targetId:f.target.id,assetId:f.asset.id,versionId:f.version.id,revision:1}),/同名/);
 const undo=await f.manager.rollbackPreview({operationId:p.operationId,revision:1});
 const restored=await f.manager.rollback({token:undo.token,revision:undo.revision,scopeConfirmed:true});
 assert.equal(restored.status,'matches_after');
 assert.equal(await fs.readFile(join(dirname(f.pool),'skills.disabled','.workbench-'+undo.operationId,'pool-example','data.txt'),'utf8'),'synthetic');
 await assert.rejects(fs.lstat(join(f.pool,'pool-example')),{code:'ENOENT'});
});

test('现有失效链接会因发布激活：预览阻断',async t=>{
 const f=await fixture(t),links=join(f.home,'.claude','skills');await fs.mkdir(links,{recursive:true,mode:0o700});
 await fs.symlink(join(f.pool,'pool-example'),join(links,'old-link'));
 await assert.rejects(f.manager.preview({targetId:f.target.id,assetId:f.asset.id,versionId:f.version.id,revision:1}),/链接/);
});

test('无独立固定版本安全准入时，即使 Agent 开关已开且用户确认也拒写',async t=>{
 const f=await fixture(t),p=await f.manager.preview({targetId:f.target.id,assetId:f.asset.id,versionId:f.version.id,revision:1});
 f.adapters.assertSkillAdmission=undefined;
 await assert.rejects(f.manager.apply(confirm(p)),e=>e.operationNotStarted===true&&/准入/.test(e.message));
 f.adapters.assertSkillAdmission=async()=>({status:'approved',assetId:f.asset.id,versionId:f.version.id,packageHash:'0'.repeat(64),scope:'skill-pool-publish'});
 await assert.rejects(f.manager.apply(confirm(p)),e=>e.operationNotStarted===true&&/准入/.test(e.message));
 await assert.rejects(fs.lstat(join(f.pool,'pool-example')),{code:'ENOENT'});
});

test('预览后开关代次或池目录身份变化，旧确认拒写',async t=>{
 const f=await fixture(t),p=await f.manager.preview({targetId:f.target.id,assetId:f.asset.id,versionId:f.version.id,revision:1});
 f.setting.generation++;
 await assert.rejects(f.manager.apply(confirm(p)),e=>e.operationNotStarted===true);
 f.setting.generation--;
 const next=await f.manager.preview({targetId:f.target.id,assetId:f.asset.id,versionId:f.version.id,revision:1});
 const moved=f.pool+'-old';await fs.rename(f.pool,moved);await fs.mkdir(f.pool,{mode:0o700});
 await assert.rejects(f.manager.apply(confirm(next)),e=>e.operationNotStarted===true);
 await assert.rejects(fs.lstat(join(f.pool,'pool-example')),{code:'ENOENT'});
});

test('写后外部改动不能借旧操作回滚',async t=>{
 const f=await fixture(t),p=await f.manager.preview({targetId:f.target.id,assetId:f.asset.id,versionId:f.version.id,revision:1});
 assert.equal((await f.manager.apply(confirm(p))).status,'matches_after');
 await fs.appendFile(join(f.pool,'pool-example','SKILL.md'),'external');
 assert.equal((await f.manager.check({operationId:p.operationId})).status,'changed');
 await assert.rejects(f.manager.rollbackPreview({operationId:p.operationId,revision:1}),/变化|未知/);
});

test('prepared 后目标写入失败保留原编号和未知结果，不谎称未开始',async t=>{
 const f=await fixture(t),to=join(f.pool,'pool-example');
 const filesystem=new Proxy(fs,{get(target,key){if(key==='mkdir')return async(path,options)=>{if(path===to)throw Error('SYNTHETIC_WRITE_FAULT');return target.mkdir(path,options);};return target[key];}});
 const manager=createSkillPoolPublish(f.repository,{permissions:f.settings,adapters:{...f.adapters,readPoolSkill:readLocalSkill},userHome:f.home,filesystem,checkMetadata:async()=>{}});
 const p=await manager.preview({targetId:f.target.id,assetId:f.asset.id,versionId:f.version.id,revision:1});
 const result=await manager.apply(confirm(p));assert.equal(result.operationId,p.operationId);assert.equal(result.status,'unknown');assert.equal(result.newlyStarted,true);
 assert.equal((await manager.check({operationId:p.operationId})).status,'unknown');
 await assert.rejects(fs.lstat(to),{code:'ENOENT'});
});

test('注入文件系统但未注入包读取适配器时，工厂直接拒绝以免宿主读取混用',async t=>{
 const f=await fixture(t),filesystem=new Proxy(fs,{get(target,key){return target[key];}});
 assert.throws(()=>createSkillPoolPublish(f.repository,{permissions:f.settings,adapters:f.adapters,userHome:f.home,filesystem,checkMetadata:async()=>{}}),/包读取/);
});

test('所有权回执关系被串改时不宣称匹配，也不开放撤回',async t=>{
 const f=await fixture(t),p=await f.manager.preview({targetId:f.target.id,assetId:f.asset.id,versionId:f.version.id,revision:1});
 assert.equal((await f.manager.apply(confirm(p))).status,'matches_after');
 const folder=join(f.data,'skill-pool-operations'),done=join(folder,p.operationId+'.receipt.json'),completion=await fs.readFile(done);
 await fs.unlink(done);assert.equal((await f.manager.check({operationId:p.operationId})).status,'unknown');
 await fs.writeFile(done,completion,{mode:0o600});
 const original=JSON.parse(await fs.readFile(join(folder,p.operationId+'.json'),'utf8'));
 const receiptPath=join(folder,original.captureId+'.json'),receipt=JSON.parse(await fs.readFile(receiptPath,'utf8'));
 receipt.homeSignature='0'.repeat(64);await fs.writeFile(receiptPath,JSON.stringify(receipt),{mode:0o600});
 assert.equal((await f.manager.check({operationId:p.operationId})).status,'unknown');
 await assert.rejects(f.manager.rollbackPreview({operationId:p.operationId,revision:1}),/回执/);
});

test('外部适配器错误消息不透出私密内容',async t=>{
 const f=await fixture(t),p=await f.manager.preview({targetId:f.target.id,assetId:f.asset.id,versionId:f.version.id,revision:1});
 f.adapters.assertSkillAdmission=async()=>{throw Error('PRIVATE_ADMISSION_SENTINEL');};
 await assert.rejects(f.manager.apply(confirm(p)),e=>e.operationNotStarted===true&&!e.message.includes('PRIVATE_ADMISSION_SENTINEL'));
});

test('缺失原编号查询先持久封闭；迟到发布及重启后均不得写入',async t=>{
 const f=await fixture(t),p=await f.manager.preview({targetId:f.target.id,assetId:f.asset.id,versionId:f.version.id,revision:1});
 const checked=await f.manager.check({operationId:p.operationId});
 assert.equal(checked.status,'not_started');assert.equal(checked.closed,true);
 const late=await f.manager.apply(confirm(p));assert.equal(late.closed,true);
 const restarted=createSkillPoolPublish(f.repository,{permissions:f.settings,adapters:f.adapters,userHome:f.home,checkMetadata:async()=>{}});
 assert.equal((await restarted.check({operationId:p.operationId})).closed,true);
 await assert.rejects(fs.lstat(join(f.pool,'pool-example')),{code:'ENOENT'});
});

test('发布先赢同一 repository 队列时，丢响应后只查询原编号；不重写',async t=>{
 const f=await fixture(t),p=await f.manager.preview({targetId:f.target.id,assetId:f.asset.id,versionId:f.version.id,revision:1});
 const apply=f.manager.apply(confirm(p));
 const check=f.manager.check({operationId:p.operationId});
 assert.equal((await apply).status,'matches_after');
 assert.equal((await check).status,'matches_after');
 assert.equal((await f.manager.apply(confirm(p))).newlyStarted,undefined);
 assert.equal(await fs.readFile(join(f.pool,'pool-example','data.txt'),'utf8'),'synthetic');
});

test('撤回缺失编号先封闭，迟到撤回不移动原目录',async t=>{
 const f=await fixture(t),p=await f.manager.preview({targetId:f.target.id,assetId:f.asset.id,versionId:f.version.id,revision:1});
 assert.equal((await f.manager.apply(confirm(p))).status,'matches_after');
 const undo=await f.manager.rollbackPreview({operationId:p.operationId,revision:1});
 assert.equal((await f.manager.check({operationId:undo.operationId})).closed,true);
 assert.equal((await f.manager.rollback({token:undo.token,revision:undo.revision,scopeConfirmed:true})).closed,true);
 assert.equal(await fs.readFile(join(f.pool,'pool-example','data.txt'),'utf8'),'synthetic');
});

test('浏览器仅存 UUID，模拟网络响应丢失后重载可按原编号查证',async t=>{
 const f=await fixture(t),p=await f.manager.preview({targetId:f.target.id,assetId:f.asset.id,versionId:f.version.id,revision:1});
 const entries=new Map(),storage={getItem:key=>entries.has(key)?entries.get(key):null,setItem:(key,value)=>entries.set(key,value),removeItem:key=>entries.delete(key)};
 const key=await agentPendingKey('pool-publish','skill-pool-publish-v1');
 assert.equal(writeAgentPending(storage,key,p.operationId,''),true);
 await f.manager.apply(confirm(p)); // Server finished, simulated HTTP response lost.
 const afterReload=readAgentPending(storage,key);
 assert.equal(afterReload,p.operationId);
 assert.equal((await f.manager.check({operationId:afterReload})).status,'matches_after');
 assert.equal(writeAgentPending(storage,key,'',afterReload),true);
 assert.equal(readAgentPending(storage,key),'');
});

test('旧 Agent 授权不等于独立共享池授权；池授权代次、封闭、恢复目录均独立',async t=>{
 const f=await fixture(t),permissions=createSkillPoolPermissions(f.repository),otherGate={enabled:true};
 assert.equal(otherGate.enabled,true);
 assert.equal((await permissions.status()).enabled,false);
 const isolated=createSkillPoolPublish(f.repository,{permissions,adapters:f.adapters,userHome:f.home,checkMetadata:async()=>{}});
 const p=await isolated.preview({targetId:f.target.id,assetId:f.asset.id,versionId:f.version.id,revision:1});
 await assert.rejects(isolated.apply(confirm(p)),e=>e.operationNotStarted===true);
 const first=await permissions.preview({enabled:true});
 assert.equal((await permissions.check({operationId:first.operationId})).closed,true);
 assert.equal((await permissions.apply({token:first.token,operationId:first.operationId,confirmed:true})).closed,true);
 const grant=await permissions.preview({enabled:true});
 assert.equal((await permissions.apply({token:grant.token,operationId:grant.operationId,confirmed:true})).status,'verified');
 assert.equal((await permissions.status()).enabled,true);
 const fresh=await isolated.preview({targetId:f.target.id,assetId:f.asset.id,versionId:f.version.id,revision:1});
 const revoke=await permissions.preview({enabled:false});
 assert.equal((await permissions.apply({token:revoke.token,operationId:revoke.operationId,confirmed:true})).status,'verified');
 await assert.rejects(isolated.apply(confirm(fresh)),e=>e.operationNotStarted===true);
 const restored=join(f.base,'restored-data');await fs.cp(f.data,restored,{recursive:true});
 const restoredRepository={...f.repository,directory:restored};
 const restoredPermissions=createSkillPoolPermissions(restoredRepository);
 assert.equal((await restoredPermissions.status()).enabled,false);
 assert.equal((await restoredPermissions.status()).reauthorizationRequired,true);
});

test('两个授权实例竞争同一编号：查询先赢即封闭，确认先赢即回读',async t=>{
 const f=await fixture(t),first=createSkillPoolPermissions(f.repository),second=createSkillPoolPermissions(f.repository);
 const a=await first.preview({enabled:true});
 const [closed,late]=await Promise.all([
  second.check({operationId:a.operationId}),
  first.apply({token:a.token,operationId:a.operationId,confirmed:true}),
 ]);
 assert.equal(closed.closed,true);assert.equal(late.closed,true);
 assert.equal((await first.status()).enabled,false);
 const b=await first.preview({enabled:true});
 const [applied,checked]=await Promise.all([
  first.apply({token:b.token,operationId:b.operationId,confirmed:true}),
  second.check({operationId:b.operationId}),
 ]);
 assert.equal(applied.status,checked.status);
 assert.ok(['verified','not_started'].includes(applied.status));
 assert.equal((await first.status()).enabled,applied.status==='verified');
 if(applied.status==='not_started'){
  const c=await first.preview({enabled:true});
  assert.equal((await first.apply({token:c.token,operationId:c.operationId,confirmed:true})).status,'verified');
  assert.equal((await second.check({operationId:c.operationId})).status,'verified');
 }
});

test('目标改绑后历史不带旧记录，原编号查询不带旧资产信息',async t=>{
 const f=await fixture(t),p=await f.manager.preview({targetId:f.target.id,assetId:f.asset.id,versionId:f.version.id,revision:1});
 assert.equal((await f.manager.apply(confirm(p))).status,'matches_after');
 f.target.bindingId='binding-new';
 assert.deepEqual((await f.manager.history({targetId:f.target.id})).items,[]);
 const checked=await f.manager.check({operationId:p.operationId});
 assert.equal(checked.status,'binding_changed');
 assert.equal('assetId' in checked,false);
 assert.equal('packageHash' in checked,false);
});
