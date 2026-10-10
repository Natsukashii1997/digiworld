// Candidate T02: add-only publication of one reviewed, fixed Skill version.
// No host filesystem access occurs at factory construction. This module does
// not activate Agent processes, create links, or replace an existing Skill.
import fs from 'node:fs/promises';
import {constants} from 'node:fs';
import {homedir} from 'node:os';
import {join, dirname, basename, resolve, isAbsolute} from 'node:path';
import {randomUUID} from 'node:crypto';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {guardCapabilityFilesystem} from './guarded-capability-filesystem.mjs';
import {createConfigJournal} from './config-journal.mjs';
import {readConfigFile} from './config-file.mjs';
import {digest, failure as repositoryFailure} from './repository.mjs';
import {materializeSkillVersion} from '../src/skill-version.js';
import {skillMediaReader} from './skill-version-media.mjs';
import {fileBytes} from '../src/skill-package.js';
import {readLocalSkill} from './skill-files.mjs';
import {normaliseFiles} from './agent-write.mjs';

const UUID=/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/;
const HASH=/^[a-f0-9]{64}$/;
const NAME=/^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const exact=(v,keys)=>v&&typeof v==='object'&&!Array.isArray(v)&&Object.keys(v).length===keys.length&&keys.every(k=>Object.hasOwn(v,k));
const TRUSTED=Symbol('skill-pool-safe-error');
const fail=(message,status=409)=>Object.assign(repositoryFailure(message,status),{[TRUSTED]:true});
const directoryId=s=>JSON.stringify([s.dev,s.ino,s.birthtimeMs,s.uid]);
const targetSignature=t=>digest(JSON.stringify([t.agentId,t.program.path,t.program.kind,t.home.id,t.home.path,t.bindingId||null]));
const safeAbsolute=p=>typeof p==='string'&&isAbsolute(p)&&resolve(p)===p&&!/[\x00-\x1f\x7f]/.test(p)&&p.length<=4000;
const generation=v=>typeof v==='string'&&(v==='initial'||UUID.test(v))||Number.isSafeInteger(v)&&v>=0;
const instant=v=>typeof v==='string'&&/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(v)&&Number.isFinite(Date.parse(v));

function shape(input,keys){if(!exact(input,keys))throw fail('共享池请求字段无效',400);}
function validateRow(row){
 const fields=['schema','id','kind','restores','targetId','targetSignature','homeSignature','programSignature','poolRoot','poolIdentity','name','to','afterHash','directoryIdentity','assetId','versionId','admissionReceiptId','generation','captureId','at'];
 if(!exact(row,fields)||row.schema!==1||!UUID.test(row.id)||!['publish','ownership','rollback'].includes(row.kind)||row.restores!==null&&!UUID.test(row.restores)||!/^[-\w]{1,100}$/.test(row.targetId)||![row.targetSignature,row.homeSignature,row.programSignature,row.afterHash].every(v=>HASH.test(v))||!safeAbsolute(row.poolRoot)||!safeAbsolute(row.to)||typeof row.poolIdentity!=='string'||!NAME.test(row.name)||row.name.length>64||row.directoryIdentity!==null&&typeof row.directoryIdentity!=='string'||!/^[-\w]{1,100}$/.test(row.assetId)||!/^[-\w]{1,100}$/.test(row.versionId)||!UUID.test(row.admissionReceiptId)||!generation(row.generation)||row.captureId!==null&&!UUID.test(row.captureId)||!instant(row.at))throw fail('共享池操作记录无效',503);
 if(row.kind==='publish'&&(row.restores!==null||!row.captureId||row.directoryIdentity!==null)||row.kind==='ownership'&&(row.restores===null||row.captureId!==null||row.directoryIdentity===null)||row.kind==='rollback'&&(row.restores===null||row.captureId!==null||row.directoryIdentity===null))throw fail('共享池操作关系无效',503);
 return row;
}
function validateClosure(row){
 if(!exact(row,['schema','id','at'])||row.schema!==1||!UUID.test(row.id)||!instant(row.at))throw fail('共享池封闭编号无效',503);
 return row;
}

async function macMetadata(path){
 if(process.platform!=='darwin')throw fail('当前平台不能可靠核验目录 ACL/扩展属性，未写入');
 const run=promisify(execFile),opts={encoding:'utf8',timeout:2000,maxBuffer:32768};
 try{const {stdout:permissions}=await run('/bin/ls',['-lde',path],opts),{stdout:attrs}=await run('/usr/bin/xattr',[path],opts);if(!/^[d-][rwxstST-]{9}[ @]?\s/.test(permissions)||/^[d-][rwxstST-]{9}\+/.test(permissions)||/^\s*\d+:/m.test(permissions)||attrs.trim())throw Error();}
 catch{throw fail('目标包含 ACL、扩展属性或无法核验，未写入');}
}

export function createSkillPoolPublish(repository,{permissions,adapters={},clock=Date.now,filesystem=fs,checkMetadata=macMetadata,userHome=homedir()}={}){
 if(!safeAbsolute(userHome))throw fail('用户 Home 不是固定绝对路径',503);
 const customFilesystem=filesystem!==fs;
 if(customFilesystem&&(typeof adapters.readPoolSkill!=='function'||checkMetadata===macMetadata))throw fail('隔离文件系统须同时注入 Skill 包读取与元数据核验适配器',503);
 // A separate pool-only permission is mandatory. The old Agent content gate
 // cannot authorize a shared-pool write. There is no startup hook.
 const poolRoot=join(userHome,'.agents','skills');
 const disabledRoot=join(userHome,'.agents','skills.disabled');
 const journal=createConfigJournal(repository.directory,{filesystem,folder:'skill-pool-operations',validate:validateRow,label:'Skill共享池',readLimit:32*1024});
 const closures=createConfigJournal(repository.directory,{filesystem,folder:'skill-pool-closed',validate:validateClosure,label:'共享池封闭编号'});
 const previews=new Map(),TTL=300000;
 const now=()=>new Date(clock()).toISOString();
 const maybe=async path=>{try{return await filesystem.lstat(path);}catch(e){if(e.code==='ENOENT')return null;throw e;}};
 async function directory(path){
  if(!safeAbsolute(path))throw fail('目标路径不是固定绝对路径');
  let at='/';for(const part of path.split('/').slice(1)){at=join(at,part);const s=await filesystem.lstat(at);if(!s.isDirectory()||s.isSymbolicLink())throw fail('目标路径经过链接或非目录');}
  const s=await filesystem.lstat(path);if(s.uid!==process.getuid()||s.mode&0o7022)throw fail('目标目录所有者或权限不受支持');await checkMetadata(path);return{id:directoryId(s),mode:s.mode&0o777};
 }
 async function gate(expected){
  if(!permissions?.assertEnabled)throw fail('共享池独立授权未接入，默认关闭',503);
  const value=await permissions.assertEnabled('agent');
  if(!value.enabled||expected!==undefined&&value.generation!==expected)throw fail('共享池独立授权关闭或代次变化');
  return value;
 }
 async function scope(state,targetId,expected){
  const t=state?.connections?.agentTargets?.find(x=>x.id===targetId);
  if(!t||t.agentId!=='codex'||t.program.kind!=='CLI'||t.home.path!==join(userHome,'.codex'))throw fail('仅支持本机标准 Codex CLI 目标');
  if(typeof adapters.inspectAgentInventory!=='function'||typeof adapters.inspectAgentPrograms!=='function')throw fail('Agent 身份适配器未接入',503);
  let inventory,programs;try{inventory=await adapters.inspectAgentInventory('codex');programs=await adapters.inspectAgentPrograms('codex',[t.program]);}catch{throw fail('目标身份核验失败',503);}
  if(inventory.errors.length||inventory.truncated)throw fail('目标目录核验未完成');
  const h=inventory.homes.find(x=>x.id===t.home.id&&x.path===t.home.path&&x.status==='present'&&!x.source.includes('用户共享')&&x.identity&&!x.errors.length);
  const p=programs.find(x=>x.path===t.program.path&&x.kind==='CLI'&&x.status==='present'&&x.identity);
  if(!h||!p)throw fail('目标程序或 Home 身份不可用');
  const result={target:t,targetSignature:targetSignature(t),homeSignature:digest(h.identity),programSignature:digest(p.identity),poolIdentity:(await directory(poolRoot)).id};
  await directory(t.home.path);await directory(dirname(poolRoot));
  if(expected&&['targetSignature','homeSignature','programSignature','poolIdentity'].some(k=>expected[k]!==result[k]))throw fail('目标或共享池身份已变化');
  return result;
 }
 async function knownLinks(name,to){
  const links=[];
  for(const agent of ['.claude','.hermes']){
   const root=join(userHome,agent,'skills'),info=await maybe(root);if(!info)continue;
   if(!info.isDirectory()||info.isSymbolicLink())throw fail('Agent 链接目录身份不明，未发布');
   await directory(root);
   const names=await filesystem.readdir(root);if(names.length>1000)throw fail('Agent 链接目录超出核验上限，未发布');
   for(const entry of names){const at=join(root,entry),s=await filesystem.lstat(at);if(!s.isSymbolicLink())continue;let target;try{target=resolve(root,await filesystem.readlink(at));}catch{throw fail('Agent 链接目标无法核验，未发布');}
    if(target===to){links.push({agent,link:at});continue;}
    if(basename(target)===name){let parent;try{parent=await filesystem.realpath(dirname(target));}catch{throw fail('同名失效链接的父目录无法核验，未发布');}if(parent===poolRoot)links.push({agent,link:at});}
   }
  }
  return links;
 }
 async function source(state,assetId,versionId){
  const asset=state.assets.find(a=>a.id===assetId&&a.type==='Skill'&&!a.archived),version=asset?.versions.find(v=>v.id===versionId);
  if(!version)throw fail('固定 Skill 版本不可用');
  if(customFilesystem&&version.mediaManifest?.length&&!adapters.readReverseMedia)throw fail('隔离文件系统缺少媒体读取适配器');
  const material=await materializeSkillVersion(version,{readMedia:adapters.readReverseMedia||skillMediaReader(repository)}),pkg=normaliseFiles(material.files);
  if(!pkg.name||!NAME.test(pkg.name)||pkg.name.length>64)throw fail('SKILL.md 需要有效 name；请先保存新版');
  return{asset,version,pkg};
 }
 async function readPackage(path){
  if(customFilesystem&&!adapters.readPoolSkill)throw fail('隔离文件系统缺少 Skill 包读取适配器',503);
  const before=await directory(path),value=await (adapters.readPoolSkill||readLocalSkill)([dirname(path)],path);
  for(const f of value.files){const at=join(path,f.path),s=await filesystem.lstat(at);if(s.isSymbolicLink()||!s.isDirectory()&&!s.isFile()||s.isFile()&&s.nlink!==1||s.uid!==process.getuid()||s.mode&0o7022)throw fail('共享池文件身份或权限不受支持');await checkMetadata(at);}
  if((await directory(path)).id!==before.id)throw fail('Skill 读取期间目录身份变化');
  return{fingerprint:value.fingerprint,directoryIdentity:before.id};
 }
 function prove(row){
  if(row.poolRoot!==poolRoot)throw fail('操作不属于当前共享池',503);
  const canonical=join(poolRoot,row.name);
  if(row.kind==='publish'||row.kind==='ownership'){if(row.to!==canonical)throw fail('记录目标不属于共享池',503);}
  else if(row.to!==join(disabledRoot,'.workbench-'+row.id,row.name))throw fail('回滚位置不属于私有保留区',503);
 }
 async function ownership(row){
  const own=await journal.get(row.captureId);if(!own||own.kind!=='ownership'||own.restores!==row.id)throw fail('发布所有权回执缺失',503);
  prove(row);prove(own);
  const same=['targetId','targetSignature','homeSignature','programSignature','poolRoot','poolIdentity','name','to','afterHash','assetId','versionId','admissionReceiptId','generation'];
  if(same.some(key=>own[key]!==row[key]))throw fail('发布所有权回执不匹配',503);
  return own;
 }
 async function checkedRow(row,state){
  prove(row);await scope(state,row.targetId,row);
  if(!row.completedAt)return{status:'unknown',message:'原操作完成回执缺失；即使文件存在也不推进完成结论'};
  if(row.kind==='publish'){
   const own=await ownership(row);
   const present=await maybe(row.to);if(!present)return{status:'unknown',message:'发布记录已准备，但目录不在目标位置；不要重放'};
   const value=await readPackage(row.to);return{status:value.fingerprint===row.afterHash&&value.directoryIdentity===own.directoryIdentity?'matches_after':'changed',message:'仅文件回读；Agent 采用未验证'};
  }
  if(row.kind==='rollback'){
   const original=await journal.get(row.restores);if(!original||original.kind!=='publish'||original.targetId!==row.targetId||original.name!==row.name)throw fail('回滚原操作不匹配',503);
   const own=await ownership(original);
   if(['targetSignature','homeSignature','programSignature','poolRoot','poolIdentity','name','afterHash','assetId','versionId','admissionReceiptId'].some(key=>row[key]!==original[key])||row.directoryIdentity!==own.directoryIdentity)throw fail('回滚记录与原发布不匹配',503);
   prove(original);const from=join(poolRoot,row.name),left=await maybe(from),right=await maybe(row.to);
   if(left||!right)return{status:'unknown',message:'回滚位置仍未确认；不要重放'};
   const value=await readPackage(row.to);return{status:value.fingerprint===row.afterHash&&value.directoryIdentity===row.directoryIdentity?'matches_after':'changed',message:'原文件已移至私有保留区；Agent 采用未验证'};
  }
  throw fail('不能查询所有权内部记录',404);
 }
 const result=(row,check,extra={})=>({operationId:row.id,kind:row.kind,status:check.status,message:check.message,completedAt:row.completedAt||null,assetId:row.assetId,versionId:row.versionId,packageHash:row.afterHash,adoption:'unverified',...extra});
 const closedResult=id=>({operationId:id,status:'not_started',closed:true,message:'当前数据目录的原编号已持久封闭，迟到请求不会在此目录执行；若曾切换数据目录，须到原目录核对',adoption:'unverified'});
 async function checkById(id,state,{sealAbsent=false}={}){
  const row=await journal.get(id),closed=await closures.get(id);
  if(row&&closed)throw fail('共享池编号同时存在操作与封闭记录，结果未知',503);
  if(!row){
   if(!sealAbsent){if(closed)return closedResult(id);throw fail('没有此共享池操作',404);}
   if(!closed){try{await closures.prepare({schema:1,id,at:now()});if(!await closures.get(id))throw fail('封闭回读失败',503);}catch{throw fail('共享池结果仍未知；保留原编号继续核对',503);}}
   return closedResult(id);
  }
  if(row.kind==='ownership')throw fail('内部所有权记录不可作用户操作查询',404);
  const current=state||await repository.read();
  const target=current.connections?.agentTargets?.find(t=>t.id===row.targetId);
  if(!target||targetSignature(target)!==row.targetSignature)return{operationId:id,status:'binding_changed',adoption:'unverified',message:'原操作属于旧目标绑定；未带出旧版本和文件信息'};
  let place;
  try{place=await scope(current,row.targetId);}catch{return{operationId:id,status:'unknown',adoption:'unverified',message:'目标身份暂不可核验；仅保留原编号，不暴露旧绑定记录'};}
  if(['targetSignature','homeSignature','programSignature','poolIdentity'].some(key=>place[key]!==row[key]))return{operationId:id,status:'binding_changed',adoption:'unverified',message:'原操作属于旧目标或池身份；未带出旧版本和文件信息'};
  try{return result(row,await checkedRow(row,current));}catch{return result(row,{status:'unknown',message:'共享池结果未知；请核查原操作，不要重试'});}
 }
 async function sync(path,writer){const h=await writer.open(path,constants.O_RDONLY|constants.O_DIRECTORY|constants.O_NOFOLLOW);try{await h.sync();}finally{await h.close();}}
 async function writeNew(p,row,writer,verify){
  await verify();if(await maybe(row.to))throw fail('同名共享池 Skill 已存在，拒绝覆盖');
  await writer.mkdir(row.to,{mode:0o700});const owned=await directory(row.to);
  await journal.prepare({...row,id:row.captureId,kind:'ownership',restores:row.id,captureId:null,directoryIdentity:owned.id},{guard:verify});
  await sync(poolRoot,writer);
  const created=new Map([[row.to,owned.id]]);
  const guard=async parent=>{await verify();for(const [at,id] of created)if((await directory(at)).id!==id)throw fail('新目录身份已变化');await directory(parent);};
  const dirs=p.files.filter(f=>f.directory).sort((a,b)=>a.path.split('/').length-b.path.split('/').length);
  for(const f of dirs){const at=join(row.to,f.path);await guard(dirname(at));await writer.mkdir(at,{mode:0o700});created.set(at,(await directory(at)).id);}
  const regular=p.files.filter(f=>!f.directory).sort((a,b)=>(a.path==='SKILL.md'?1:0)-(b.path==='SKILL.md'?1:0));
  for(const f of regular){const at=join(row.to,f.path);await guard(dirname(at));if(f.path==='SKILL.md'&&(await knownLinks(row.name,row.to)).length)throw fail('发布前发现既有 Agent 链接，停止继续写入');const h=await writer.open(at,constants.O_WRONLY|constants.O_CREAT|constants.O_EXCL|constants.O_NOFOLLOW,0o600);try{const before=await h.stat();await h.writeFile(fileBytes(f));await h.chmod(f.mode);await h.sync();const after=await h.stat();if(before.dev!==after.dev||before.ino!==after.ino||after.nlink!==1)throw fail('新文件身份变化');}finally{await h.close();}await guard(dirname(at));const read=await readConfigFile(at,{filesystem,limit:25*1024*1024});if(read.hash!==digest(fileBytes(f))||read.mode!==f.mode)throw fail('Skill 文件回读不一致');}
  for(const f of [...dirs].reverse()){await guard(row.to);await writer.chmod(join(row.to,f.path),f.mode);await sync(join(row.to,f.path),writer);}
  await writer.chmod(row.to,0o700);await sync(row.to,writer);await sync(poolRoot,writer);
 }
 async function moveToKeep(row,writer,verify){
  const sourcePath=join(poolRoot,row.name),original=await readPackage(sourcePath);if(original.fingerprint!==row.afterHash||original.directoryIdentity!==row.directoryIdentity)throw fail('共享池内容或身份已变化');
  if(await maybe(row.to))throw fail('私有保留位置已有内容');
  if(!await maybe(disabledRoot)){await writer.mkdir(disabledRoot,{mode:0o700});await sync(dirname(disabledRoot),writer);}
  await directory(disabledRoot);const container=dirname(row.to);await writer.mkdir(container,{mode:0o700});await directory(container);
  await writer.mkdir(row.to,{mode:0o700});const reserved=await directory(row.to);await verify();if((await directory(row.to)).id!==reserved.id||(await filesystem.readdir(row.to)).length)throw fail('保留位置变化');
  await writer.rename(sourcePath,row.to);await sync(poolRoot,writer);await sync(container,writer);
 }
 const api={
  async preview(input){try{shape(input,['targetId','assetId','versionId','revision']);const state=await repository.read();if(state.revision!==input.revision)throw fail('主库版本已变化');const place=await scope(state,input.targetId),{pkg}=await source(state,input.assetId,input.versionId),to=join(poolRoot,pkg.name);
   if(await maybe(to))throw fail('同名共享池 Skill 已存在；本版不替换');const links=await knownLinks(pkg.name,to);if(links.length)throw fail('现有 Claude/Hermes 链接将被此发布激活；本版不代替挂载授权');
   let admissionReceiptId=null;
   if(typeof adapters.inspectSkillAdmission==='function'){
    try{const a=await adapters.inspectSkillAdmission({assetId:input.assetId,versionId:input.versionId,packageHash:pkg.hash,scope:'skill-pool-publish'});if(a?.status==='approved'&&a.assetId===input.assetId&&a.versionId===input.versionId&&a.packageHash===pkg.hash&&a.scope==='skill-pool-publish'&&UUID.test(a.receiptId))admissionReceiptId=a.receiptId;}catch{/* 未知准入状态按未批准处理。 */}
   }
   const g=permissions?.get?await permissions.get('agent'):{enabled:false,generation:'initial'};for(const [id,p]of previews)if(p.expires<=clock())previews.delete(id);if(previews.size>=20)throw fail('共享池预览过多');
   const token=randomUUID(),expires=clock()+TTL;previews.set(token,{...place,token,expires,revision:state.revision,generation:g.generation,assetId:input.assetId,versionId:input.versionId,name:pkg.name,to,packageHash:pkg.hash,files:pkg.files,admissionReceiptId});
   return{token,operationId:token,revision:state.revision,expiresAt:new Date(expires).toISOString(),kind:'pool-publish',assetId:input.assetId,versionId:input.versionId,packageHash:pkg.hash,admissionReceiptId,to,bytes:pkg.bytes,files:pkg.files.map(f=>({path:f.path,directory:!!f.directory,mode:f.mode,sha256:f.directory?null:digest(fileBytes(f))})),knownLinks:[],scope:'本机 Codex 原生共享池；其他未知读取者也可能发现',reviewRequired:true,admission:admissionReceiptId?'approved':'requires-fixed-version-approval',adoption:'unverified'};
  }catch(e){if(e[TRUSTED])throw e;throw fail('共享池预览安全核验失败',503);}
  },
  async apply(input){shape(input,['token','revision','packageHash','admissionReceiptId','scopeConfirmed','reviewConfirmed']);if(!UUID.test(input.token)||input.scopeConfirmed!==true||input.reviewConfirmed!==true||!HASH.test(input.packageHash)||!UUID.test(input.admissionReceiptId))throw fail('请明确审阅固定版本和共享池影响范围',400);
   return repository.withSnapshot({},async state=>{
    if(await closures.get(input.token))return closedResult(input.token);
    const old=await journal.get(input.token);if(old&&old.kind!=='ownership')return checkById(input.token,state);
    const p=previews.get(input.token);if(!p)throw Object.assign(fail('预览已失效，请重新预览'),{operationNotStarted:true});
    if(input.revision!==p.revision||state.revision!==p.revision||p.expires<=clock()||input.packageHash!==p.packageHash||input.admissionReceiptId!==p.admissionReceiptId)throw Object.assign(fail('预览已过期或审阅版本不符'),{operationNotStarted:true});
    let started=false,row;const verify=async()=>{if(p.expires<=clock()||state.revision!==p.revision)throw fail('预览过期');await gate(p.generation);await scope(state,p.target.id,p);};
    const writer=guardCapabilityFilesystem(filesystem,verify);
    try{
     await verify();if(await maybe(p.to))throw fail('同名共享池 Skill 已存在');const latest=await source(state,p.assetId,p.versionId);if(latest.pkg.hash!==p.packageHash||latest.pkg.name!==p.name)throw fail('固定版本内容已变化');if((await knownLinks(p.name,p.to)).length)throw fail('现有 Agent 链接会被意外激活');
     // User confirmation is not itself a safety audit. The admission adapter
     // must attest this exact version and normalized full-package fingerprint.
     if(typeof adapters.assertSkillAdmission!=='function')throw fail('固定版本安全准入尚未接入；共享池发布保持关闭');
     const admission=await adapters.assertSkillAdmission({receiptId:p.admissionReceiptId,operationId:p.token,assetId:p.assetId,versionId:p.versionId,packageHash:p.packageHash,scope:'skill-pool-publish'});
     if(!admission||admission.status!=='approved'||admission.receiptId!==p.admissionReceiptId||admission.operationId!==p.token||admission.assetId!==p.assetId||admission.versionId!==p.versionId||admission.packageHash!==p.packageHash||admission.scope!=='skill-pool-publish')throw fail('此固定版本没有匹配的单次安全准入回执');
     row={schema:1,id:p.token,kind:'publish',restores:null,targetId:p.target.id,targetSignature:p.targetSignature,homeSignature:p.homeSignature,programSignature:p.programSignature,poolRoot,poolIdentity:p.poolIdentity,name:p.name,to:p.to,afterHash:p.packageHash,directoryIdentity:null,assetId:p.assetId,versionId:p.versionId,admissionReceiptId:p.admissionReceiptId,generation:p.generation,captureId:randomUUID(),at:now()};
     await journal.prepare(row,{guard:verify});previews.delete(p.token);started=true;await writeNew({...p,files:latest.pkg.files},row,writer,verify);await journal.complete(row.id,now(),{guard:verify});return{...await checkById(row.id,state),newlyStarted:true};
    }catch(e){if(!started){let persisted;try{persisted=await journal.get(input.token);}catch{throw Object.assign(fail('共享池日志状态未知；按原操作号核查，勿重试',503),{unknownResult:true});}if(!persisted)throw Object.assign(fail(e[TRUSTED]?e.message:'共享池执行前安全核验失败',e[TRUSTED]?e.status:503),{operationNotStarted:true});}
     return{...await checkById(input.token,state),newlyStarted:true,notice:'写入或回执未确认；按原 operationId 核查，不要重复提交'};}
   });
  },
  async check(input){shape(input,['operationId']);if(!UUID.test(input.operationId))throw fail('操作编号无效',400);return repository.withSnapshot({},state=>checkById(input.operationId,state,{sealAbsent:true}));},
  async history(input){shape(input,['targetId']);const state=await repository.read(),place=await scope(state,input.targetId);return{items:(await journal.list()).filter(r=>r.kind!=='ownership'&&r.targetId===input.targetId&&['targetSignature','homeSignature','programSignature','poolIdentity'].every(k=>r[k]===place[k])).map(r=>({operationId:r.id,kind:r.kind,name:r.name,assetId:r.assetId,versionId:r.versionId,at:r.at,status:'unchecked',adoption:'unverified'}))};},
  async rollbackPreview(input){try{shape(input,['operationId','revision']);const state=await repository.read();if(state.revision!==input.revision)throw fail('主库版本已变化');const original=await journal.get(input.operationId);if(!original||original.kind!=='publish')throw fail('仅可回滚原始发布');const checked=await checkedRow(original,state);if(checked.status!=='matches_after')throw fail('发布结果已变化或未知，拒绝回滚');const own=await ownership(original),g=permissions?.get?await permissions.get('agent'):{enabled:false,generation:'initial'},id=randomUUID();
   const plan={id,kind:'rollback',original,revision:state.revision,generation:g.generation,expires:clock()+TTL,directoryIdentity:own.directoryIdentity,to:join(disabledRoot,'.workbench-'+id,original.name)};previews.set(id,plan);
   return{token:id,operationId:id,revision:state.revision,expiresAt:new Date(plan.expires).toISOString(),kind:'pool-rollback',from:original.to,to:plan.to,packageHash:original.afterHash,scope:'仅移走本工作台发布且未被外部改动的目录；原文件保留',adoption:'unverified'};
  }catch(e){if(e[TRUSTED])throw e;throw fail('共享池撤回预览安全核验失败',503);}
  },
  async rollback(input){shape(input,['token','revision','scopeConfirmed']);if(!UUID.test(input.token)||input.scopeConfirmed!==true)throw fail('请确认本次共享池撤回',400);
   return repository.withSnapshot({},async state=>{
    if(await closures.get(input.token))return closedResult(input.token);
    const old=await journal.get(input.token);if(old&&old.kind==='rollback')return checkById(input.token,state);const p=previews.get(input.token);if(!p||p.kind!=='rollback')throw Object.assign(fail('回滚预览失效'),{operationNotStarted:true});
    if(p.expires<=clock()||p.revision!==input.revision||p.revision!==state.revision)throw Object.assign(fail('回滚预览已变化'),{operationNotStarted:true});
    let started=false,row;const verify=async()=>{await gate(p.generation);await scope(state,p.original.targetId,p.original);if(p.expires<=clock())throw fail('回滚预览过期');};const writer=guardCapabilityFilesystem(filesystem,verify);
    try{await verify();if((await checkedRow(p.original,state)).status!=='matches_after')throw fail('发布目录已变化，拒绝回滚');
     const {completedAt:_receipt,...base}=p.original;
     row={...base,id:p.id,kind:'rollback',restores:p.original.id,to:p.to,directoryIdentity:p.directoryIdentity,captureId:null,at:now(),generation:p.generation};prove(row);await journal.prepare(row,{guard:verify});previews.delete(p.id);started=true;await moveToKeep(row,writer,verify);await journal.complete(row.id,now(),{guard:verify});return{...await checkById(row.id,state),newlyStarted:true};
    }catch(e){if(!started){let persisted;try{persisted=await journal.get(input.token);}catch{throw Object.assign(fail('共享池回滚日志状态未知；按原操作号核查，勿重试',503),{unknownResult:true});}if(!persisted)throw Object.assign(fail(e[TRUSTED]?e.message:'共享池回滚前安全核验失败',e[TRUSTED]?e.status:503),{operationNotStarted:true});}
     return{...await checkById(input.token,state),newlyStarted:true,notice:'回滚结果未知；按原 operationId 核查，不要重复提交'};}
   });
  },
 };
 return api;
}
