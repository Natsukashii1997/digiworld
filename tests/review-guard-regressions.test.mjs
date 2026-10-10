// 正式 tests 候选：全部 mkdtemp 合成目录、纯内存或元数据桩；零真实能力/网络/私人数据。
// 可直接复制为 tests/review-guard-regressions.test.mjs；不改变旧断言，不增加超时。
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {constants} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {createHash,randomUUID} from 'node:crypto';
import {createScopedTextOperations} from '../server/scoped-text-operations.mjs';
import {createScopedTextFiles} from '../server/scoped-text-files.mjs';
import {readConfigFile,atomicReplaceConfig} from '../server/config-file.mjs';
import {createKnowledgeFiles} from '../server/knowledge-files.mjs';
import {createKnowledgeWriteFiles} from '../server/knowledge-write-files.mjs';
import {createAgentWrite} from '../server/agent-write.mjs';
import {createCapabilitySettings} from '../server/capability-settings.mjs';
import {createCapabilitiesHttp} from '../server/capabilities-http.mjs';
import {pendingItems} from '../src/pending.js';
import {seed,makeAsset,current} from '../src/store.js';
const sha=v=>createHash('sha256').update(v).digest('hex');
async function temp(t){const base=await fs.realpath(await fs.mkdtemp(join(tmpdir(),'guiji-guard-regression-')));t.after(()=>fs.rm(base,{recursive:true,force:true}));return base;}
async function settle(fn){try{return {value:await fn()};}catch(error){return {error};}}

function memoryOperation(){
 const configuration={enabled:true,generation:randomUUID(),options:{}},records=new Map(),receipts=new Map(),undo=new Map();
 const target={identity:sha('合成目标'),parentIdentity:sha('合成父目录'),displayPath:'合成/记事.md'};
 let file=null,afterPrepare=async()=>{},afterResolve=async()=>{},afterRollbackStarted=async()=>{},creates=0,removes=0,applied=0,rolledBack=0;
 const journal={read:async id=>records.get(id)||null,prepare:async r=>{records.set(r.id,r);await afterPrepare();},applied:async(id,r)=>{applied++;receipts.set(id,r);},appliedReceipt:async id=>receipts.get(id),rolledBackReceipt:async id=>undo.get(id),rollbackStarted:async()=>afterRollbackStarted(),rolledBack:async(id,r)=>{rolledBack++;undo.set(id,r);},unresolvedForTarget:async()=>[]};
 const service=createScopedTextOperations({resolveTarget:async()=>{await afterResolve();return target;},inspect:async()=>file,create:async(_target,text)=>{creates++;file={content:text,sha256:sha(text),fingerprint:sha('合成文件身份'),parentIdentity:target.parentIdentity};},replace:async()=>{throw Error('本例不应走替换');},remove:async()=>{removes++;file=null;},journal,assertEnabled:async()=>{if(!configuration.enabled)throw Object.assign(Error('合成授权已撤销'),{code:'CAPABILITY_DISABLED'});return {...configuration};},revision:async()=>1,clock:()=>0});
 return{service,configuration,journal,afterPrepare:fn=>afterPrepare=fn,afterResolve:fn=>afterResolve=fn,afterRollbackStarted:fn=>afterRollbackStarted=fn,stats:()=>({creates,removes,applied,rolledBack})};
}
const preview=f=>f.service.preview({capability:'vault',targetRef:'synthetic',mode:'create',text:'合成正文'});

test('Vault prepared await之后撤权：零实际create且不产生applied',async()=>{
 const f=memoryOperation(),p=await preview(f);f.afterPrepare(async()=>{f.configuration.enabled=false;f.configuration.generation=randomUUID();});
 const outcome=await settle(()=>f.service.apply(p));assert.equal(f.stats().creates,0);assert.equal(f.stats().applied,0);assert.notEqual(outcome.value?.status,'verified');
});
test('Vault resolveTarget await之后撤权：guard返回前再核授权，零create',async()=>{
 const f=memoryOperation(),p=await preview(f);let armed=false;f.afterPrepare(async()=>{armed=true;});f.afterResolve(async()=>{if(armed){armed=false;f.configuration.enabled=false;f.configuration.generation=randomUUID();}});
 const outcome=await settle(()=>f.service.apply(p));assert.equal(f.stats().creates,0);assert.equal(f.stats().applied,0);assert.notEqual(outcome.value?.status,'verified');
});
test('Vault 回滚预览绑定当前授权代次：关开之后不可使用旧预览删除',async()=>{
 const f=memoryOperation(),p=await preview(f);assert.equal((await f.service.apply(p)).status,'verified');const rollback=await f.service.rollbackPreview(p.operationId);f.configuration.generation=randomUUID();
 const outcome=await settle(()=>f.service.rollback(rollback));assert.equal(f.stats().removes,0);assert.equal(f.stats().rolledBack,0);assert.notEqual(outcome.value?.status,'rolled_back');
});
test('Vault rollback-started await期间撤权：零remove且不伪造rolled-back',async()=>{
 const f=memoryOperation(),p=await preview(f);await f.service.apply(p);const rollback=await f.service.rollbackPreview(p.operationId);f.afterRollbackStarted(async()=>{f.configuration.enabled=false;f.configuration.generation=randomUUID();});
 const outcome=await settle(()=>f.service.rollback(rollback));assert.equal(f.stats().removes,0);assert.equal(f.stats().rolledBack,0);assert.notEqual(outcome.value?.status,'rolled_back');
});

async function scopedFilesFixture(t,{filesystem=fs,reader=readConfigFile,onRegistered=async()=>{}}={}){
 const base=await temp(t),root=join(base,'synthetic-vault');await fs.mkdir(join(root,'合成'),{recursive:true,mode:0o700});await fs.chmod(root,0o700);
 const s=await fs.lstat(root),rootIdentity=sha(root+':'+[s.dev,s.ino,s.birthtimeMs,s.uid,s.mode&0o777].join(':'));
 const registeredTarget=async()=>{await onRegistered();return {kind:'note',root,rootIdentity,relativePath:'合成/记事.md',allowedSubdirectory:'合成'};};
 const files=createScopedTextFiles({registeredTarget,filesystem,readConfigFile:reader,atomicReplaceConfig,checkMetadata:async()=>null});
 const target=await files.resolveTarget('synthetic');return{base,root,files,target,path:target.absolutePath};
}
test('Vault 新建handle.stat await期间撤权：真实writeFile零次，文件保持零字节',async t=>{
 let enabled=true,targetPath='',mutated=false,writes=0;
 const filesystem=new Proxy(fs,{get(o,k){if(k==='open')return async(path,...args)=>{const h=await o.open(path,...args);if(path!==targetPath||!(Number(args[0])&(constants.O_WRONLY|constants.O_RDWR)))return h;return new Proxy(h,{get(handle,key){if(key==='stat')return async(...a)=>{const s=await handle.stat(...a);if(!mutated){enabled=false;mutated=true;}return s;};if(key==='writeFile')return async(...a)=>{writes++;return handle.writeFile(...a);};const value=handle[key];return typeof value==='function'?value.bind(handle):value;}});};return o[k];}});
 const f=await scopedFilesFixture(t,{filesystem});targetPath=f.path;const guard=async()=>{if(!enabled)throw Error('合成撤权');};
 await assert.rejects(()=>f.files.create(f.target,'撤权后禁止写入正文',{guard}));assert(mutated,'必须触发句柄stat边界');assert.equal(writes,0);assert.equal((await fs.stat(f.path)).size,0);
});
test('Vault 删除的末次目标回读await期间外部换inode：保留替换文件且零unlink',async t=>{
 let armed=false,reads=0,pendingSwap=false,path='',unlinks=0,swapped=false;
 const filesystem=new Proxy(fs,{get(o,k){if(k==='unlink')return async(...args)=>{unlinks++;return o.unlink(...args);};return o[k];}});
 const reader=async(p,options)=>{const r=await readConfigFile(p,options);if(armed&&p===path&&++reads===2)pendingSwap=true;return r;};
 const f=await scopedFilesFixture(t,{filesystem,reader,onRegistered:async()=>{if(pendingSwap){pendingSwap=false;swapped=true;await fs.rename(path,path+'.owned');await fs.writeFile(path,'外部替换件',{mode:0o600});}}});path=f.path;
 await f.files.create(f.target,'本操作原文件');const expected=await f.files.inspect(f.target);armed=true;
 await assert.rejects(()=>f.files.remove(f.target,expected,{guard:async()=>{}}));assert(swapped,'必须触发回读后的异步目录核验边界');assert.equal(unlinks,0);assert.equal(await fs.readFile(path,'utf8'),'外部替换件');assert.equal(await fs.readFile(path+'.owned','utf8'),'本操作原文件');
});
test('旧知识候选unlink前授权await期间外部替换：零unlink、替换件与原文件均保留',async t=>{
 const root=await temp(t);await fs.mkdir(join(root,'00 待整理/生活'),{recursive:true});const source=await createKnowledgeFiles().inspectRoot(root),path='00 待整理/生活/合成.md',absolute=join(root,path);let unlinks=0;
 const filesystem=new Proxy(fs,{get(o,k){if(k==='unlink')return async(...args)=>{unlinks++;return o.unlink(...args);};return o[k];}}),writer=createKnowledgeWriteFiles({filesystem}),target=await writer.preview(source,path);await writer.create(source,target,'原合成候选');const expected=await writer.inspect(source,path);
 await assert.rejects(()=>writer.remove(source,expected,{guard:async()=>{await fs.rename(absolute,absolute+'.owned');await fs.writeFile(absolute,'外部新文件',{mode:0o600});}}));assert.equal(unlinks,0);assert.equal(await fs.readFile(absolute,'utf8'),'外部新文件');assert.equal(await fs.readFile(absolute+'.owned','utf8'),'原合成候选');
});

async function agentFixture(t,filesystem){
 const base=await temp(t),directory=join(base,'synthetic-data'),home=join(base,'synthetic-home'),program=join(base,'synthetic-cli');await fs.mkdir(directory,{mode:0o700});await fs.mkdir(join(home,'skills'),{recursive:true,mode:0o700});await fs.chmod(home,0o700);await fs.writeFile(program,'SYNTHETIC NEVER EXECUTE',{mode:0o600});
 const asset=makeAsset({type:'Skill',title:'合成固定版本',files:[{path:'SKILL.md',text:true,data:'---\nname: published-example\n---\n# 合成固定版本\n',mode:0o644},{path:'binary.bin',text:false,data:new Uint8Array([1,254,0]),mode:0o644}]}),target={schema:1,id:'synthetic-target',bindingId:'synthetic-binding',agentId:'codex',label:'合成Codex',program:{path:program,kind:'CLI'},home:{id:'synthetic-home',path:home,label:'合成Home'},createdAt:'2026-10-04T00:00:00.000Z',updatedAt:'2026-10-04T00:00:00.000Z'};
 const state={...seed(),revision:1,assets:[asset],connections:{...seed().connections,agentTargets:[target]}},repository={directory,read:async()=>structuredClone(state),withSnapshot:async(_o,fn)=>fn(structuredClone(state))},configuration={enabled:true,generation:randomUUID(),options:{}};
 const settings={get:async()=>({...configuration}),assertEnabled:async()=>{if(!configuration.enabled)throw Object.assign(Error('合成撤权'),{status:409});return {...configuration};}};
 const identity=s=>[s.dev,s.ino,s.birthtimeMs,s.uid,s.size,s.mtimeMs].join(':'),homeIdentity=s=>[s.dev,s.ino,s.birthtimeMs,s.uid].join(':');
 const service=createAgentWrite(repository,{settings,filesystem,checkMetadata:async()=>{},adapters:{checkConfigMetadata:async()=>null,inspectAgentInventory:async()=>({errors:[],truncated:false,homes:[{id:target.home.id,path:home,source:'合成独立Home',status:'present',errors:[],identity:homeIdentity(await fs.lstat(home))}]}),inspectAgentPrograms:async()=>[{...target.program,status:'present',identity:identity(await fs.lstat(program))}]}});
 return{home,configuration,service,publish:()=>service.publishPreview({targetId:target.id,assetId:asset.id,versionId:current(asset).id,revision:1})};
}
test('Agent发布handle.stat await期间撤权：真实writeFile零次，保留半包且不认定完成',async t=>{
 let configuration=null,mutated=false,writes=0,path='';const filesystem=new Proxy(fs,{get(o,k){if(k==='open')return async(p,...args)=>{const h=await o.open(p,...args);if(!String(p).includes('/skills/published-example/')||!(Number(args[0])&(constants.O_WRONLY|constants.O_RDWR)))return h;return new Proxy(h,{get(handle,key){if(key==='stat')return async(...a)=>{const s=await handle.stat(...a);if(configuration&&!mutated){configuration.enabled=false;configuration.generation=randomUUID();mutated=true;path=p;}return s;};if(key==='writeFile')return async(...a)=>{writes++;return handle.writeFile(...a);};const value=handle[key];return typeof value==='function'?value.bind(handle):value;}});};return o[k];}});
 const f=await agentFixture(t,filesystem);configuration=f.configuration;const plan=await f.publish(),outcome=await settle(()=>f.service.apply({token:plan.token,revision:plan.revision}));assert(mutated,'必须触发实际文件handle.stat边界');assert.equal(writes,0);assert.equal((await fs.stat(path)).size,0);assert.notEqual(outcome.value?.status,'matches_after');assert.equal(outcome.value?.completedAt??null,null);
});

test('授权设置onBeforeApply await期间预览过期：不落授权prepared且仍全部关闭',async t=>{
 const directory=await temp(t);let now=0;const repository={directory,withSnapshot:async(_o,fn)=>fn({})},settings=createCapabilitySettings(repository,{clock:()=>now,onBeforeApply:async()=>{now+=300001;}}),p=await settings.preview({capability:'agent',enabled:true,options:{}});
 await assert.rejects(()=>settings.apply({token:p.token,operationId:p.operationId,confirmed:true}));assert.equal((await settings.get('agent')).enabled,false);assert.equal((await settings.history()).items.length,0);
});
test('统一HTTP白名单拒绝继承constructor与未开放能力，不接触宿主',async()=>{
 const service=createCapabilitiesHttp({directory:'/synthetic-unused'});for(const method of ['POST','GET'])for(const path of ['/api/capabilities/constructor/keys','/api/capabilities/unrecognized/status'])await assert.rejects(()=>service.dispatch(path,method,{synthetic:'value'}),e=>e.status===404);
});

function pendingState(){return{...seed(),assets:[],notes:[{id:'already-written',text:'合成旧记',at:'2026-10-01T00:00:00.000Z'},{id:'new-pending',text:'合成新记',at:'2026-10-04T00:00:00.000Z'}],knowledgeTasks:[],revisionCandidates:[],profileProposals:[]};}
const pending=(receipts,nightV2Reports={loaded:true,items:[]})=>pendingItems(pendingState(),{items:[],loaded:true},{items:[],loaded:true},{},undefined,receipts,{nightV2Reports});
for(const scenario of ['尚未读取','读取失败'])test(`批准取消随手记回执${scenario}的待处理来源，原记录仍保留`,()=>{
 const items=pending({loaded:false,noteIds:[],...(scenario==='读取失败'?{error:'合成读取失败'}:{})});assert(!items.some(i=>i.id==='notes-local'||i.id==='notes-receipts-unknown'));assert.equal(pendingState().notes.length,2);
});
test('批准取消已成功读取回执的随手记待处理来源，成功回执不制造任务',()=>{
 assert(!pending({loaded:true,noteIds:['already-written']}).some(i=>i.id==='notes-local'));
});
test('v2 晨报编号匹配分诊规则：在共享 pendingItems 里可见并归需要决定',()=>{
 const item=pending({loaded:true,noteIds:['already-written','new-pending']},{loaded:true,items:[{runId:'synthetic-morning',nightDate:'2026-10-04',readyAt:'2026-10-04T08:00:00.000Z',decisionPending:true}]}).find(i=>i.kind==='夜巡');assert(item);assert.equal(item.id,'night-v2-morning-synthetic-morning');assert.equal(item.triage,'需要决定');assert.equal(item.to,'night');assert.equal(item.foundAt,'2026-10-04T08:00:00.000Z');
});
