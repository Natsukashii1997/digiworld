// 仅在 canonical mkdtemp 下操作；元数据工具注入空桩，零真实Vault/配置/凭据/外网。
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {createHash,randomUUID} from 'node:crypto';
import {createVaultWrite} from '../server/vault-write.mjs';
import {knowledgeRootIdentity} from '../server/knowledge-files.mjs';
const sha=v=>createHash('sha256').update(v).digest('hex');
async function fixture(t,extra={}){
 const raw=await fs.mkdtemp(join(tmpdir(),'guiji-vault-write-')),root=await fs.realpath(raw),vault=join(root,'synthetic-vault'),data=join(root,'synthetic-data');
 await fs.mkdir(vault);await fs.mkdir(data);await fs.mkdir(join(vault,'随手记'));await fs.mkdir(join(vault,'个人上下文'));
 const stat=await fs.lstat(vault),source={id:'source-synthetic',name:'合成知识源',kind:'obsidian',root:vault,identity:knowledgeRootIdentity(vault,stat),generation:'source-gen-1'};
 const note={id:'note-1',text:'## 合成随手记\n\n保留原文字节 English🙂\n',at:'2026-10-04T00:00:00.000Z',format:'md1'};
 const state={revision:1,notes:[note],connections:{knowledgeSources:[source]},profileProposals:[],knowledgeZones:{rules:[{pattern:'个人上下文/**',zone:'profile'}]}};
 let configuration={enabled:false,generation:'initial',options:{sourceId:source.id,notesFolder:'随手记',profileFolders:['个人上下文']}};
 const settings={get:async name=>{assert.equal(name,'vault');return structuredClone(configuration);},assertEnabled:async name=>{assert.equal(name,'vault');if(!configuration.enabled)throw Object.assign(new Error('默认关闭'),{code:'CAPABILITY_DISABLED'});return structuredClone(configuration);}};
 const repo={directory:data,read:async()=>structuredClone(state),withSnapshot:async(_options,op)=>op(structuredClone(state))};
 const actions=[];
 const adapters={checkMetadata:async()=>{actions.push('metadata-stub');return {acl:false,xattrs:[]};},...extra};
 const service=createVaultWrite(repo,{settings,adapters,clock:()=>Date.parse('2026-10-04T02:00:00.000Z')});
 t.after(()=>fs.rm(root,{recursive:true,force:true}));
 return {root,vault,data,state,source,note,service,actions,enable:()=>configuration={...configuration,enabled:true,generation:randomUUID()},changeOptions:options=>configuration={...configuration,options,generation:randomUUID()}};
}
const apply=(service,plan)=>service.apply({token:plan.token,operationId:plan.operationId,confirmed:true});
async function profile(f,{text='前文\n\n唯一原段落\n\n后文',original='唯一原段落',proposed='合成新段落'}={}){
 const after=text.replace(original,()=>proposed),p={schema:1,id:randomUUID(),sourceId:f.source.id,path:'个人上下文/说明.md',original,proposed,reason:'合成建议',proposer:'Synthetic',baseSha256:sha(text),createdAt:'2026-10-04T00:00:00.000Z',status:'confirmed',decidedAt:'2026-10-04T01:00:00.000Z',confirmation:{baseSha256:sha(text),resultSha256:sha(after),confirmedAt:'2026-10-04T01:00:00.000Z',write:'awaiting_local'}};
 await fs.writeFile(join(f.vault,p.path),text);f.state.profileProposals=[p];return {p,text,after};
}
test('Vault默认关；status/history零目标读取；不接受客户端正文/路径/任意noteID',async t=>{
 const f=await fixture(t,{filesystem:new Proxy(fs,{get(target,key){if(['lstat','realpath','open','readFile'].includes(key))return async(...args)=>{if(String(args[0]).includes('synthetic-vault'))throw new Error('禁止自动目标读取');return target[key](...args);};return target[key];}})});
 assert.equal((await f.service.status()).enabled,false);assert.deepEqual((await f.service.history()).items,[]);
 await assert.rejects(f.service.previewNote({noteId:'note-1',filename:'合成.md'}),e=>e.code==='CAPABILITY_DISABLED');
 f.enable();await assert.rejects(f.service.previewNote({noteId:'note-1',filename:'合成.md',text:'任意正文'}),e=>e.code==='INVALID_REQUEST');
 await assert.rejects(f.service.previewNote({noteId:'note-1',filename:'/absolute.md'}),e=>e.code==='INVALID_REQUEST');
 await assert.rejects(f.service.previewNote({noteId:'missing',filename:'合成.md'}),e=>e.code==='NOTE_MISSING');
 assert.deepEqual(f.actions,[]);
});
test('Vault新建→精确回读/留痕→冲突改名→回滚仅本次文件；正文不进history',async t=>{
 const f=await fixture(t);f.enable();const plan=await f.service.previewNote({noteId:f.note.id,filename:'第一.md'});
 assert.equal(plan.before,'');assert.equal(plan.after,f.note.text);assert.equal(plan.target,'随手记/第一.md');assert.match(plan.backup,/不存在状态/);
 assert.equal((await apply(f.service,plan)).status,'verified');assert.equal(await fs.readFile(join(f.vault,plan.target),'utf8'),f.note.text);
 assert.equal((await apply(f.service,plan)).status,'verified','重复操作ID只核对');
 await assert.rejects(f.service.previewNote({noteId:f.note.id,filename:'第一.md'}),e=>e.code==='NAME_CONFLICT');
 const renamed=await f.service.previewNote({noteId:f.note.id,filename:'第二.md'});assert.equal((await apply(f.service,renamed)).status,'verified');
 const history=await f.service.history();assert.equal(history.items.length,2);assert(!JSON.stringify(history).includes(f.note.text));assert(!JSON.stringify(history).includes(f.vault));
 const rollback=await f.service.rollbackPreview({operationId:plan.operationId});assert.equal((await f.service.rollback({token:rollback.token,operationId:rollback.operationId,confirmed:true})).status,'rolled_back');
 await assert.rejects(fs.stat(join(f.vault,plan.target)),e=>e.code==='ENOENT');assert.equal(await fs.readFile(join(f.vault,renamed.target),'utf8'),f.note.text);
 assert.equal((await f.service.check({operationId:plan.operationId})).status,'rolled_back');
});
test('Vault个人说明只按既有已确认proposal唯一段落改写；原文备份回滚；主库不可变',async t=>{
 const f=await fixture(t);f.enable();const {p,text,after}=await profile(f),baseline=structuredClone(f.state.profileProposals);
 const plan=await f.service.previewProfile({proposalId:p.id});assert.equal(plan.before,text);assert.equal(plan.after,after);
 assert.equal((await apply(f.service,plan)).status,'verified');assert.equal(await fs.readFile(join(f.vault,p.path),'utf8'),after);assert.deepEqual(f.state.profileProposals,baseline);
 const rollback=await f.service.rollbackPreview({operationId:plan.operationId});assert.equal((await f.service.rollback({token:rollback.token,operationId:rollback.operationId,confirmed:true})).status,'rolled_back');
 assert.equal(await fs.readFile(join(f.vault,p.path),'utf8'),text);assert.deepEqual(f.state.profileProposals,baseline);assert(f.actions.length>0);
});
test('Vault个人说明拒绝pending、源错误、非唯一段落与确认后原文漂移',async t=>{
 const f=await fixture(t);f.enable();let x=await profile(f);x.p.status='pending';await assert.rejects(f.service.previewProfile({proposalId:x.p.id}),e=>e.code==='PROPOSAL_NOT_CONFIRMED');
 x=await profile(f,{text:'原段落 / 原段落',original:'原段落'});await assert.rejects(f.service.previewProfile({proposalId:x.p.id}),e=>e.code==='AMBIGUOUS_SEGMENT');
 x=await profile(f);await fs.appendFile(join(f.vault,x.p.path),'外部改动');await assert.rejects(f.service.previewProfile({proposalId:x.p.id}),e=>e.code==='TARGET_CHANGED');
 x=await profile(f);x.p.sourceId='other-source';await assert.rejects(f.service.previewProfile({proposalId:x.p.id}),e=>e.code==='SCOPE_CHANGED');
 x=await profile(f);x.p.confirmation.resultSha256='a'.repeat(64);await assert.rejects(f.service.previewProfile({proposalId:x.p.id}),e=>e.code==='CONFIRMATION_CHANGED');
});
test('Vault拒越界/凭据/隐藏与symlink/hardlink，不创建目录、不覆盖已有文件',async t=>{
 const f=await fixture(t);f.enable();
 for(const name of ['../越界.md','secrets.md','tokens.md','.hidden.md','a/b.md','private-key.md'])await assert.rejects(f.service.previewNote({noteId:f.note.id,filename:name}),e=>e.code==='INVALID_REQUEST');
 f.changeOptions({sourceId:f.source.id,notesFolder:'../越界',profileFolders:['个人上下文']});await assert.rejects(f.service.previewNote({noteId:f.note.id,filename:'安全.md'}),e=>e.code==='INVALID_SCOPE');
 f.changeOptions({sourceId:f.source.id,notesFolder:'不存在',profileFolders:['个人上下文']});await assert.rejects(f.service.previewNote({noteId:f.note.id,filename:'安全.md'}));await assert.rejects(fs.stat(join(f.vault,'不存在')),e=>e.code==='ENOENT');
 f.changeOptions({sourceId:f.source.id,notesFolder:'随手记',profileFolders:['个人上下文']});
 await fs.writeFile(join(f.root,'outside.md'),'合成外部');await fs.symlink(join(f.root,'outside.md'),join(f.vault,'随手记/链接.md'));await assert.rejects(f.service.previewNote({noteId:f.note.id,filename:'链接.md'}));assert.equal(await fs.readFile(join(f.root,'outside.md'),'utf8'),'合成外部');
 await fs.link(join(f.root,'outside.md'),join(f.vault,'随手记/硬链.md'));await assert.rejects(f.service.previewNote({noteId:f.note.id,filename:'硬链.md'}));
 const x=await profile(f);x.p.path='随手记/说明.md';await assert.rejects(f.service.previewProfile({proposalId:x.p.id}),e=>e.code==='OUTSIDE_PROFILE');
 await fs.rename(join(f.vault,'随手记'),join(f.vault,'原目录'));await fs.symlink(join(f.vault,'原目录'),join(f.vault,'随手记'));await assert.rejects(f.service.previewNote({noteId:f.note.id,filename:'安全.md'}));
});
test('Vault主库/授权/源登记漂移使预览失效；写后改变不能自动回滚',async t=>{
 const f=await fixture(t);f.enable();let plan=await f.service.previewNote({noteId:f.note.id,filename:'漂移.md'});f.state.revision++;await assert.rejects(apply(f.service,plan),e=>e.code==='PLAN_CHANGED');
 plan=await f.service.previewNote({noteId:f.note.id,filename:'漂移.md'});f.enable();await assert.rejects(apply(f.service,plan),e=>e.code==='PLAN_CHANGED');
 plan=await f.service.previewNote({noteId:f.note.id,filename:'漂移.md'});f.source.generation='source-gen-2';await assert.rejects(apply(f.service,plan),e=>e.code==='SCOPE_CHANGED');
 plan=await f.service.previewNote({noteId:f.note.id,filename:'漂移.md'});assert.equal((await apply(f.service,plan)).status,'verified');await fs.appendFile(join(f.vault,plan.target),'外部修改');
 assert.equal((await f.service.check({operationId:plan.operationId})).status,'unknown');await assert.rejects(f.service.rollbackPreview({operationId:plan.operationId}),e=>e.code==='UNKNOWN_RESULT');
});
test('Vault回读同字节inode交换仍未知并拒回滚',async t=>{
 const f=await fixture(t);f.enable();const plan=await f.service.previewNote({noteId:f.note.id,filename:'身份.md'});assert.equal((await apply(f.service,plan)).status,'verified');
 const path=join(f.vault,plan.target);await fs.rename(path,path+'.old');await fs.writeFile(path,f.note.text);
 assert.equal((await f.service.check({operationId:plan.operationId})).status,'unknown');await assert.rejects(f.service.rollbackPreview({operationId:plan.operationId}),e=>e.code==='UNKNOWN_RESULT');
});
test('Vault回执失败返回unknown；同操作ID核对不重放，同物理目标换noteId也阻断',async t=>{
 const f=await fixture(t);f.enable();
 const real=fs.open.bind(fs),generation=randomUUID();const filesystem=new Proxy(fs,{get(target,key){if(key==='open')return async(path,...rest)=>{if(String(path).includes('scoped-text-applied')&&(typeof rest[0]==='number'&&(rest[0]&1)||typeof rest[0]==='string'&&rest[0].includes('w')))throw Object.assign(new Error('合成回执失败'),{code:'EACCES'});return real(path,...rest);};return target[key];}});
 const service=createVaultWrite({directory:f.data,read:async()=>structuredClone(f.state),withSnapshot:async(_o,op)=>op(structuredClone(f.state))},{settings:{get:async()=>({enabled:true,generation,options:{sourceId:f.source.id,notesFolder:'随手记',profileFolders:['个人上下文']}}),assertEnabled:async()=>({generation})},adapters:{filesystem,checkMetadata:async()=>({acl:false,xattrs:[]})},clock:()=>Date.parse('2026-10-04T02:00:00.000Z')});
 const plan=await service.previewNote({noteId:f.note.id,filename:'未知.md'});assert.equal((await apply(service,plan)).status,'unknown');const stat=await fs.stat(join(f.vault,plan.target));
 assert.equal((await apply(service,plan)).status,'unknown');assert.equal((await fs.stat(join(f.vault,plan.target))).ino,stat.ino,'重复apply不重写');
 f.state.notes.push({...f.note,id:'note-2'});await assert.rejects(service.previewNote({noteId:'note-2',filename:'未知.md'}),e=>e.code==='UNKNOWN_RESULT');
});
