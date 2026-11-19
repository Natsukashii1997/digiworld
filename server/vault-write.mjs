// Vault用户动作服务；无启动扫描/隐式外部读取，目标和正文仅从已登记来源与主库派生。
import nativeFs from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {createScopedTextFiles} from './scoped-text-files.mjs';
import {createScopedTextOperations} from './scoped-text-operations.mjs';
import {createScopedTextJournal} from './scoped-text-journal.mjs';
import {readConfigFile,atomicReplaceConfig} from './config-file.mjs';
import {createConfigJournal} from './config-journal.mjs';
import {createKnowledgeFiles,knowledgeRootIdentity} from './knowledge-files.mjs';
import {zoneOf,DEFAULT_ZONE_RULES} from '../src/knowledge-zones.js';
const sha=v=>createHash('sha256').update(v).digest('hex');
const fail=(code,message,status=409)=>{throw Object.assign(new Error(message),{code,status});};
const exact=(value,keys)=>value&&typeof value==='object'&&!Array.isArray(value)&&Object.keys(value).length===keys.length&&keys.every(k=>Object.hasOwn(value,k));
const identifier=v=>typeof v==='string'&&/^[a-zA-Z0-9_-]{1,100}$/.test(v);
const secret=/^(?:keychains?|secrets?|credentials?|tokens?|passwords?|private[-_]?keys?|auth|sessions?)(?:[._-]|$)/i;
const part=v=>typeof v==='string'&&!!v&&v===v.trim()&&!v.startsWith('.')&&!secret.test(v)&&!/[\/\\:\x00-\x1f\x7f<>?*|"#\[\]]/.test(v);
const relative=v=>typeof v==='string'&&v.length<=1000&&v.split('/').every(part);
const folder=v=>relative(v)&&!v.toLowerCase().endsWith('.md');
const filename=v=>part(v)&&v.length<=120&&v.endsWith('.md');
const under=(path,directory)=>path.startsWith(directory+'/');
const optionsHash=options=>sha(JSON.stringify({sourceId:options.sourceId,notesFolder:options.notesFolder,profileFolders:options.profileFolders}));
function validateOptions(o){
 if(!exact(o,['sourceId','notesFolder','profileFolders'])||!identifier(o.sourceId)||!folder(o.notesFolder)||!Array.isArray(o.profileFolders)||o.profileFolders.length>10||!o.profileFolders.every(folder)||new Set(o.profileFolders).size!==o.profileFolders.length)
  fail('INVALID_SCOPE','请在设置中选择已登记Vault和安全、既存的相对子目录');
 return o;
}
const parseRef=ref=>{try{const a=JSON.parse(ref);if(!Array.isArray(a)||a.length!==7||a[0]!=='vault'||!['note','profile'].includes(a[1])||!identifier(a[2])||!identifier(a[3])||typeof a[4]!=='string'||typeof a[5]!=='string'||!/^[a-f0-9]{64}$/.test(a[6]))throw 0;return a;}catch{fail('INVALID_TARGET','受控Vault目标无效');}};
export function createVaultWrite(repository,{settings,adapters={},clock=Date.now}){
 const filesystem=adapters.filesystem||nativeFs;
 const knowledge=createKnowledgeFiles({fs:filesystem});
 let journalBinding=null;
 async function localJournal(){
  if(adapters.journal)return adapters.journal;
  const root=repository.directory,before=await filesystem.lstat(root),canonical=await filesystem.realpath(root),identity=[before.dev,before.ino,before.birthtimeMs].join(':');
  if(!before.isDirectory()||before.isSymbolicLink()||journalBinding&&(journalBinding.identity!==identity||journalBinding.path!==canonical))fail('JOURNAL_UNSAFE','工作台操作日志目录身份已变化',503);
  const after=await filesystem.lstat(root);if(after.isSymbolicLink()||[after.dev,after.ino,after.birthtimeMs].join(':')!==identity)fail('JOURNAL_UNSAFE','日志目录核验期间变化',503);
  if(!journalBinding)journalBinding={identity,path:canonical,journal:createScopedTextJournal(canonical,{createConfigJournal:adapters.createConfigJournal||createConfigJournal,filesystem})};
  return journalBinding.journal;
 }
 const journal=Object.fromEntries(['prepare','read','applied','appliedReceipt','rollbackStarted','rolledBack','rolledBackReceipt','unresolvedForTarget','history'].map(k=>[k,async(...args)=>(await localJournal())[k](...args)]));
 async function stored(){const state=await repository.read();if(!state)fail('WORKSPACE_MISSING','请先初始化工作台');return state;}
 async function scope(state,expectedSourceId){
  const configuration=await settings.get('vault'),options=validateOptions(configuration.options);
  if(expectedSourceId&&options.sourceId!==expectedSourceId)fail('SCOPE_CHANGED','所选Vault已变化');
  const source=state.connections?.knowledgeSources?.find(s=>s.id===options.sourceId&&s.kind==='obsidian');
  if(!source||typeof source.root!=='string'||!/^[a-f0-9]{64}$/.test(source.identity)||typeof source.generation!=='string')fail('SOURCE_MISSING','所选Obsidian源未登记或已断开');
  return {configuration,options,source};
 }
 async function rootIdentity(source){
  // existing知识源identity先校验；scoped底座另绑定owner/mode，不能将重新登记当成旧预览。
  const registered=await knowledge.inspectRoot(source.root);
  if(registered.root!==source.root||registered.identity!==source.identity)fail('SOURCE_CHANGED','已登记Vault根目录身份已变化');
  const before=await filesystem.lstat(source.root),real=await filesystem.realpath(source.root),after=await filesystem.lstat(source.root);
  const id=s=>knowledgeRootIdentity(source.root,s);
  if(!before.isDirectory()||before.isSymbolicLink()||!after.isDirectory()||after.isSymbolicLink()||real!==source.root||id(before)!==source.identity||id(after)!==source.identity||before.dev!==after.dev)
   fail('SOURCE_CHANGED','已登记Vault根目录身份已变化');
  return sha(source.root+':'+[before.dev,before.ino,before.birthtimeMs,before.uid,before.mode&0o777].join(':'));
 }
 async function registeredTarget(ref){
  const [,kind,sourceId,id,name,generation,configurationHash]=parseRef(ref),state=await stored(),{options,source}=await scope(state,sourceId);
  if(source.generation!==generation||optionsHash(options)!==configurationHash)fail('SCOPE_CHANGED','来源登记或设置范围已变化');
  let relativePath,allowedSubdirectory;
  if(kind==='note'){
   if(!state.notes?.some(n=>n.id===id)||!filename(name))fail('NOTE_MISSING','随手记已删除或文件名无效');
   relativePath=options.notesFolder+'/'+name;allowedSubdirectory=options.notesFolder;
  }else{
   const proposal=state.profileProposals?.find(p=>p.id===id);
   if(!proposal||proposal.status!=='confirmed'||proposal.sourceId!==sourceId||name!==proposal.path||!relative(name)||!name.endsWith('.md'))fail('PROPOSAL_MISSING','仅可写入已采纳、仍登记的个人说明建议');
   if(zoneOf(name,state.knowledgeZones?.rules||DEFAULT_ZONE_RULES)!=='profile')fail('OUTSIDE_PROFILE','建议不属于当前个人说明区');
   allowedSubdirectory=options.profileFolders.find(d=>under(name,d));if(!allowedSubdirectory)fail('OUTSIDE_SCOPE','建议超出设置允许的个人说明目录');
   relativePath=name;
  }
  return {kind,root:source.root,rootIdentity:await rootIdentity(source),relativePath,allowedSubdirectory};
 }
 const files=createScopedTextFiles({registeredTarget,filesystem,readConfigFile:adapters.readConfigFile||readConfigFile,atomicReplaceConfig:adapters.atomicReplaceConfig||atomicReplaceConfig,...(adapters.checkMetadata?{checkMetadata:adapters.checkMetadata}:{})});
 const operations=createScopedTextOperations({...files,journal,assertEnabled:type=>settings.assertEnabled(type),revision:async()=>(await stored()).revision,clock});
 const ref=(kind,source,id,name,options)=>JSON.stringify(['vault',kind,source.id,id,name,source.generation,optionsHash(options)]);
 const snapshot=operation=>repository.withSnapshot({},operation);
 async function noUnknownTarget(targetRef,options){
  const wanted=parseRef(targetRef);
  for(const row of await journal.history()){
   if(row.capability!=='vault')continue;const old=parseRef(row.targetRef);
   // 同一物理相对目标不能靠改note/proposal ID越过未明结果；姓名冲突只允许用户改文件名。
   const relativeOf=a=>a[1]==='note'?options.notesFolder+'/'+a[4]:a[4];
   if(old[2]!==wanted[2]||relativeOf(old)!==relativeOf(wanted)||old[5]!==wanted[5]||old[6]!==wanted[6])continue;
   const result=await operations.check(row.operationId);
   if(result.status==='unknown')fail('UNKNOWN_RESULT','同一目标有未明的旧操作，请先核对，不能换记录ID绕过');
  }
 }
 async function owned(id){if(!identifier(id))fail('INVALID_ID','操作ID无效',400);const record=await journal.read(id);if(record&&record.capability!=='vault')fail('NOT_VAULT_OPERATION','不是Vault写入记录',404);if(record)parseRef(record.targetRef);return record;}
 function writeInput(input){if(!exact(input,['token','operationId','confirmed'])||input.confirmed!==true||typeof input.token!=='string'||!identifier(input.operationId))fail('CONFIRMATION_REQUIRED','请审阅差异并确认本次操作',400);return {token:input.token,operationId:input.operationId};}
 function operationInput(input){if(!exact(input,['operationId'])||!identifier(input.operationId))fail('INVALID_REQUEST','操作请求无效',400);return input.operationId;}
 return {
  async status(){const configuration=await settings.get('vault'),state=await stored();return {enabled:configuration.enabled,generation:configuration.generation,options:configuration.options,
   sources:(state.connections?.knowledgeSources||[]).filter(s=>s.kind==='obsidian').map(s=>({id:s.id,name:s.name})),contract:'仅用户动作核验指定目标；不自动读Vault。'};},
  async previewNote(input){
   if(!exact(input,['noteId','filename'])||!identifier(input.noteId)||!filename(input.filename))fail('INVALID_REQUEST','请选择已保存的随手记与安全Markdown文件名；不接受正文或绝对路径',400);
   return snapshot(async state=>{await settings.assertEnabled('vault');const {options,source}=await scope(state),note=state.notes?.find(n=>n.id===input.noteId);
    if(!note||typeof note.text!=='string'||!note.text.trim())fail('NOTE_MISSING','随手记不存在或为空');
    const targetRef=ref('note',source,note.id,input.filename,options);await noUnknownTarget(targetRef,options);
    const result=await operations.preview({capability:'vault',targetRef,mode:'create',text:note.text});
    return {...result,kind:'note',noteId:note.id,sourceId:source.id};
   });
  },
  async previewProfile(input){
   if(!exact(input,['proposalId'])||!identifier(input.proposalId))fail('INVALID_REQUEST','请选择已有个人说明建议；不接受正文或路径',400);
   return snapshot(async state=>{await settings.assertEnabled('vault');const proposal=state.profileProposals?.find(p=>p.id===input.proposalId);
    if(!proposal||proposal.status!=='confirmed'||proposal.confirmation?.write!=='awaiting_local')fail('PROPOSAL_NOT_CONFIRMED','请先完成既有差异预览与采纳确认');
    const {options,source}=await scope(state,proposal.sourceId),targetRef=ref('profile',source,proposal.id,proposal.path,options),current=await files.inspect(await files.resolveTarget(targetRef));
    await noUnknownTarget(targetRef,options);
    if(!current||current.sha256!==proposal.confirmation.baseSha256)fail('TARGET_CHANGED','文件已变化，请重新提出并采纳个人说明建议');
    const result=await operations.preview({capability:'vault',targetRef,mode:'exact-segment',beforeSegment:proposal.original,replacement:proposal.proposed});
    if(result.afterSha256!==proposal.confirmation.resultSha256)fail('CONFIRMATION_CHANGED','写入差异与已采纳建议不一致');
    return {...result,kind:'profile',proposalId:proposal.id,sourceId:source.id};
   });
  },
  async apply(input){const value=writeInput(input);return snapshot(async()=>{await owned(value.operationId);return operations.apply(value);});},
  async check(input){const id=operationInput(input);return snapshot(async()=>{await owned(id);return operations.check(id);});},
  async rollbackPreview(input){const id=operationInput(input);return snapshot(async()=>{if(!await owned(id))fail('OPERATION_MISSING','操作不存在',404);return operations.rollbackPreview(id);});},
  async rollback(input){const value=writeInput(input);return snapshot(async()=>{if(!await owned(value.operationId))fail('OPERATION_MISSING','操作不存在',404);return operations.rollback(value);});},
  async pendingNotes(){const state=await stored(),rows=await journal.history(),matching=new Set();for(const row of rows){if(row.capability!=='vault')continue;const [,kind,sourceId,id,,generation]=parseRef(row.targetRef);if(kind!=='note')continue;const source=state.connections?.knowledgeSources?.find(s=>s.id===sourceId),note=state.notes?.find(n=>n.id===id);if(!source||source.generation!==generation||!note||row.afterSha256!==sha(note.text)||await journal.rolledBackReceipt(row.operationId))continue;const applied=await journal.appliedReceipt(row.operationId);if(applied?.sha256===row.afterSha256)matching.add(id);}return{loaded:true,noteIds:[...matching],basis:'仅本机当前正文匹配的写入回执；未重新读取Vault，不代表目标未被外部修改'};},
  async history(){const rows=(await journal.history()).filter(r=>r.capability==='vault');return {items:rows.map(row=>{const [,kind,sourceId,id,path]=parseRef(row.targetRef);return {operationId:row.operationId,kind,sourceId,recordId:id,path,beforeSha256:row.beforeSha256,afterSha256:row.afterSha256,at:row.at};})};},
 };
}
