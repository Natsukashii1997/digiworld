import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {randomUUID} from 'node:crypto';
import {createKnownMountRepair} from '../server/known-mount-repair.mjs';
import {createConfigJournal} from '../server/config-journal.mjs';
import {digest} from '../server/repository.mjs';
import {normaliseFiles,createAgentWrite} from '../server/agent-write.mjs';
import {readLocalSkill} from '../server/skill-files.mjs';
import {makeAsset,current} from '../src/store.js';

const id=s=>JSON.stringify([s.dev,s.ino,s.birthtimeMs,s.uid]);
const programId=s=>[s.dev,s.ino,s.birthtimeMs,s.uid,s.size,s.mtimeMs].join(':');
const targetSignature=t=>digest(JSON.stringify([t.agentId,t.program.path,t.program.kind,t.home.id,t.home.path,t.bindingId||null]));
const stamp='2026-10-07T10:00:00.000Z';
async function fixture(t,{filesystem=fs,ownership=true,admission=true,record=true,named=true}={}){
  const base=await fs.realpath(await fs.mkdtemp(join(tmpdir(),'guiji-repair-synthetic-'))),data=join(base,'database'),home=join(base,'independent-home'),skills=join(home,'skills'),program=join(base,'synthetic-cli');
  for(const path of [data,home,skills])await fs.mkdir(path,{mode:0o700});await fs.writeFile(program,'SYNTHETIC CLI',{mode:0o600});
  const asset=makeAsset({type:'Skill',title:'合成固定 Skill',files:[{path:'SKILL.md',text:true,data:named?'---\nname: synthetic-repair\n---\n# 固定版本\n':'# 固定版本，无 frontmatter\n',mode:0o600},{path:'assets/raw.bin',text:false,data:new Uint8Array([0,128,255]),mode:0o600}]});
  const pkg=normaliseFiles(current(asset).files),to=join(skills,pkg.name||'asset-'+digest(asset.id).slice(0,24));
  const target={id:'target-codex',agentId:'codex',bindingId:'binding-one',label:'合成 Codex',program:{path:program,kind:'CLI'},home:{id:'synthetic-home',path:home,label:'合成 Home'}};
  const homeIdentity=id(await fs.lstat(home)),programIdentity=programId(await fs.lstat(program));
  const originalId=randomUUID(),captureId=randomUUID();
  await fs.mkdir(to,{mode:0o700});const directoryIdentity=id(await fs.lstat(to));await fs.rmdir(to);
  const original={schema:1,id:originalId,kind:'publish',targetId:target.id,targetSignature:targetSignature(target),homeSignature:digest(homeIdentity),programSignature:digest(programIdentity),name:pkg.name||'asset-'+digest(asset.id).slice(0,24),from:null,to,beforeHash:null,afterHash:pkg.hash,directoryIdentity:null,mode:0o700,at:stamp,restores:null,assetId:asset.id,versionId:current(asset).id,sourceTargetId:null,sourceSignature:null,sourceHash:null,generation:1,captureId};
  const journal=createConfigJournal(data,{filesystem,folder:'agent-write-operations',validate:v=>v,label:'合成原发布'});
  if(record){await journal.prepare(original);await journal.complete(originalId,stamp);}
  if(record&&ownership)await journal.prepare({...original,id:captureId,kind:'ownership',restores:null,directoryIdentity,captureId:null});
  const state={revision:1,assets:[asset],connections:{agentTargets:[target]}};
  let queue=Promise.resolve();
  const repository={directory:data,read:async()=>structuredClone(state),withSnapshot(_o,fn){
    const next=queue.then(()=>fn(structuredClone(state)));queue=next.catch(()=>{});return next;
  }};
  const settings={get:async()=>({enabled:true,generation:1}),assertEnabled:async()=>({enabled:true,generation:1})};
  const receiptId=randomUUID();
  const adapters={readAgentRepairSkill:readLocalSkill,inspectAgentInventory:async()=>({errors:[],truncated:false,homes:[{id:target.home.id,path:home,source:'合成独立目录',status:'present',identity:id(await fs.lstat(home)),errors:[]}]}),inspectAgentPrograms:async()=>[{path:program,kind:'CLI',status:'present',identity:programId(await fs.lstat(program))}],inspectSkillAdmission:async q=>admission?{...q,status:'approved',receiptId}:null,assertSkillAdmission:async q=>admission?{...q,status:'approved'}:null};
  const manager=()=>createKnownMountRepair(repository,{settings,adapters,filesystem,checkMetadata:async()=>{}});
  t.after(async()=>fs.rm(base,{recursive:true,force:true}));
  return{base,data,home,skills,to,program,asset,pkg,target,state,repository,settings,adapters,original,originalId,captureId,journal,manager,receiptId};
}

test('仅按原发布和所有权回执重建缺失独立 Skill；双确认后字节回读，不宣称原生采用',async t=>{
  const f=await fixture(t),api=f.manager(),p=await api.preview({originalId:f.originalId,revision:1});
  assert.equal(p.admission,'approved');assert.equal(p.destination,f.to);assert.equal(p.files.length,3);
  await assert.rejects(api.apply({token:p.token,confirmed:true}),/授权/);
  assert.equal((await api.authorize({token:p.token,confirmed:true})).status,'authorized');
  const result=await api.apply({token:p.token,confirmed:true});assert.equal(result.status,'matches_after');assert.equal(result.adoption,'unverified');
  assert.equal((await f.manager().check({operationId:p.operationId})).status,'matches_after');
  assert.equal(await fs.readFile(join(f.to,'SKILL.md'),'utf8'),'---\nname: synthetic-repair\n---\n# 固定版本\n');
  assert.deepEqual([...await fs.readFile(join(f.to,'assets/raw.bin'))],[0,128,255]);
  assert.equal((await fs.lstat(f.to)).isSymbolicLink(),false);
});

test('无原所有权回执、同名后续操作或路径为断链均拒绝，不触碰外部内容',async t=>{
  const missing=await fixture(t,{ownership:false});
  await assert.rejects(missing.manager().preview({originalId:missing.originalId,revision:1}),/所有权/);
  const later=await fixture(t);const row={...later.original,id:randomUUID(),kind:'disable',from:later.to,to:join(later.home,'skills.disabled','synthetic-repair'),beforeHash:later.pkg.hash,captureId:null,at:'2026-10-07T11:00:00.000Z'};await later.journal.prepare(row);
  await assert.rejects(later.manager().preview({originalId:later.originalId,revision:1}),/同名操作/);
  const linked=await fixture(t),outside=join(linked.base,'outside');await fs.mkdir(outside,{mode:0o700});await fs.symlink(outside,linked.to);
  await assert.rejects(linked.manager().preview({originalId:linked.originalId,revision:1}),/链接/);assert.deepEqual(await fs.readdir(outside),[]);
});

test('缺新 Skill 准入、固定版漂移、目标绑定变化都在写入前拒绝',async t=>{
  const noAudit=await fixture(t,{admission:false}),noAuditApi=noAudit.manager(),p=await noAuditApi.preview({originalId:noAudit.originalId,revision:1});
  assert.equal(p.admission,'requires-fixed-version-approval');await assert.rejects(noAuditApi.authorize({token:p.token,confirmed:true}),/准入/);
  const drift=await fixture(t),api=drift.manager(),a=await api.preview({originalId:drift.originalId,revision:1});
  drift.state.assets[0].versions[0].files[0].data='---\nname: synthetic-repair\n---\n# changed';
  await assert.rejects(api.authorize({token:a.token,confirmed:true}),/固定版|回执|变化/);
  const binding=await fixture(t),bApi=binding.manager(),b=await bApi.preview({originalId:binding.originalId,revision:1});
  binding.target.bindingId='changed';
  await assert.rejects(bApi.authorize({token:b.token,confirmed:true}),/身份已变化|目标|回执/);
  assert.equal(await fs.access(binding.to).then(()=>true,()=>false),false);
});

test('查无记录封闭修复编号，迟到授权和落地不得重放',async t=>{
  const f=await fixture(t),api=f.manager(),p=await api.preview({originalId:f.originalId,revision:1});
  const q=await api.check({operationId:p.operationId});assert.equal(q.status,'not_started');assert.equal(q.closed,true);
  await assert.rejects(api.authorize({token:p.token,confirmed:true}),/封闭/);
  await assert.rejects(api.apply({token:p.token,confirmed:true}),/封闭/);
  assert.equal(await fs.access(f.to).then(()=>true,()=>false),false);
});

test('修复目录创建后故障保持未知；重启按原编号复验，不重复写入',async t=>{
  let fail=false,watched='';
  const filesystem=new Proxy(fs,{get(o,k){if(k==='mkdir')return async(path,...args)=>{
    const value=await o.mkdir(path,...args);if(fail&&path===watched){fail=false;throw Error('SYNTHETIC_LOST_RESULT');}return value;
  };return o[k];}});
  const f=await fixture(t,{filesystem}),api=f.manager(),p=await api.preview({originalId:f.originalId,revision:1});
  await api.authorize({token:p.token,confirmed:true});watched=f.to;fail=true;
  assert.equal((await api.apply({token:p.token,confirmed:true})).status,'unknown');
  assert.equal((await f.manager().check({operationId:p.operationId})).status,'unknown');
  assert.equal((await api.apply({token:p.token,confirmed:true})).status,'unknown');
  assert.deepEqual(await fs.readdir(f.to),[]);
});

test('授权后关闭页面可按原编号恢复；目标变化使旧授权失效',async t=>{
  const f=await fixture(t),api=f.manager(),p=await api.preview({originalId:f.originalId,revision:1});
  await api.authorize({token:p.token,confirmed:true});
  const reopened=f.manager(),same=await reopened.resume({operationId:p.operationId});
  assert.equal(same.authorized,true);assert.equal(same.operationId,p.operationId);
  assert.equal((await reopened.apply({token:same.token,confirmed:true})).status,'matches_after');
  await assert.rejects(f.manager().resume({operationId:p.operationId}),/不可恢复/);
  const another=await fixture(t),later=another.manager(),q=await later.preview({originalId:another.originalId,revision:1});
  await later.authorize({token:q.token,confirmed:true});another.target.bindingId='new-binding';
  await assert.rejects(another.manager().resume({operationId:q.operationId}),/身份已变化|目标/);
});

test('授权结果丢失后新页面按原编号恢复；主库漂移时可取消未写入授权并封闭迟到请求',async t=>{
  const f=await fixture(t),api=f.manager(),p=await api.preview({originalId:f.originalId,revision:1});
  await api.authorize({token:p.token,confirmed:true}); // simulate a lost HTTP response
  const reopened=f.manager(),checked=await reopened.check({operationId:p.operationId});
  assert.equal(checked.status,'authorized');assert.equal(checked.cancelable,true);
  const resumed=await reopened.resume({operationId:p.operationId});
  assert.equal(resumed.authorized,true);assert.equal(resumed.operationId,p.operationId);
  f.state.revision++;
  await assert.rejects(reopened.resume({operationId:p.operationId}),/主库版本已变化/);
  const canceled=await reopened.cancel({operationId:p.operationId,confirmed:true});
  assert.equal(canceled.status,'not_started');assert.equal(canceled.closed,true);assert.equal(canceled.canceled,true);
  assert.deepEqual(await f.manager().check({operationId:p.operationId}),canceled);
  await assert.rejects(api.apply({token:p.token,confirmed:true}),/封闭/);
  await assert.rejects(api.authorize({token:p.token,confirmed:true}),/封闭/);
  assert.equal(await fs.access(f.to).then(()=>true,()=>false),false);
});

test('只要修复写入记录已存在，取消即拒绝；原编号仍可查询，不重放写入',async t=>{
  const f=await fixture(t),api=f.manager(),p=await api.preview({originalId:f.originalId,revision:1});
  await api.authorize({token:p.token,confirmed:true});
  const applied=await api.apply({token:p.token,confirmed:true});
  assert.equal(applied.status,'matches_after');
  await assert.rejects(api.cancel({operationId:p.operationId,confirmed:true}),/写入已有记录/);
  assert.equal((await f.manager().check({operationId:p.operationId})).status,'matches_after');
});

test('同一主库锁内先取消再落地时迟到落地拒绝；先落地则取消拒绝',async t=>{
  const a=await fixture(t),first=a.manager(),pa=await first.preview({originalId:a.originalId,revision:1});
  await first.authorize({token:pa.token,confirmed:true});
  const [canceled,late]=await Promise.allSettled([first.cancel({operationId:pa.operationId,confirmed:true}),first.apply({token:pa.token,confirmed:true})]);
  assert.equal(canceled.status,'fulfilled');assert.equal(canceled.value.closed,true);
  assert.equal(late.status,'rejected');assert.match(late.reason.message,/封闭/);
  assert.equal(await fs.access(a.to).then(()=>true,()=>false),false);
  const b=await fixture(t),second=b.manager(),pb=await second.preview({originalId:b.originalId,revision:1});
  await second.authorize({token:pb.token,confirmed:true});
  const [applied,tooLate]=await Promise.allSettled([second.apply({token:pb.token,confirmed:true}),second.cancel({operationId:pb.operationId,confirmed:true})]);
  assert.equal(applied.status,'fulfilled');assert.equal(applied.value.status,'matches_after');
  assert.equal(tooLate.status,'rejected');assert.match(tooLate.reason.message,/写入已有记录/);
});

test('repair consumes the real publisher ownership receipt and unnamed Skill fallback path',async t=>{
 const f=await fixture(t,{record:false,named:false});
 const publisher=createAgentWrite(f.repository,{settings:f.settings,adapters:{...f.adapters,readAgentWriteSkill:readLocalSkill},checkMetadata:async()=>{}});
 const plan=await publisher.publishPreview({targetId:f.target.id,assetId:f.asset.id,versionId:current(f.asset).id,revision:1});
 assert.equal((await publisher.apply({token:plan.token,revision:plan.revision})).status,'matches_after');
 assert.match(plan.to,/asset-[a-f0-9]{24}$/);
 await fs.rm(plan.to,{recursive:true});
 const repair=await f.manager().preview({originalId:plan.operationId,revision:1});
 assert.equal(repair.destination,plan.to);assert.equal(repair.admission,'approved');
});
