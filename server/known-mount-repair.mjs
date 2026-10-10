// T03 bounded case: recreate an ABSENT independent Skill directory that this
// workbench previously published. Existing paths, including dangling links,
// are never removed or replaced. This does not repair unowned symlinks.
import fs from 'node:fs/promises';
import {constants} from 'node:fs';
import {join,dirname,isAbsolute,resolve} from 'node:path';
import {randomUUID} from 'node:crypto';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {createConfigJournal} from './config-journal.mjs';
import {guardCapabilityFilesystem} from './guarded-capability-filesystem.mjs';
import {digest,failure} from './repository.mjs';
import {materializeSkillVersion} from '../src/skill-version.js';
import {skillMediaReader} from './skill-version-media.mjs';
import {normaliseFiles} from './agent-write.mjs';
import {fileBytes} from '../src/skill-package.js';
import {readLocalSkill} from './skill-files.mjs';

const UUID=/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/;
const ID=/^[a-zA-Z0-9_-]{1,100}$/;
const HASH=/^[a-f0-9]{64}$/;
const NAME=/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,63}$/;
const TTL=300000,MAX_BYTES=5*1024*1024;
const exact=(v,keys)=>v&&typeof v==='object'&&!Array.isArray(v)&&Object.keys(v).length===keys.length&&keys.every(k=>Object.hasOwn(v,k));
const fail=(message,status=409)=>{throw failure(message,status);};
const pathOK=v=>typeof v==='string'&&isAbsolute(v)&&resolve(v)===v&&v.length<=4000&&!/[\x00-\x1f\x7f]/.test(v);
const identity=s=>JSON.stringify([s.dev,s.ino,s.birthtimeMs,s.uid]);
const targetSignature=t=>digest(JSON.stringify([t.agentId,t.program.path,t.program.kind,t.home.id,t.home.path,t.bindingId||null]));
const oldFields=['schema','id','kind','targetId','targetSignature','homeSignature','programSignature','name','from','to','beforeHash','afterHash','directoryIdentity','mode','at','restores','assetId','versionId','sourceTargetId','sourceSignature','sourceHash','generation','captureId'];
const repairFields=['schema','id','originalId','targetId','assetId','versionId','destination','packageHash','targetSignature','homeSignature','programSignature','skillsIdentity','admissionReceiptId','revision','generation','at'];
function oldRow(row){
  if(!exact(row,oldFields)||row.schema!==1||!UUID.test(row.id)||!['publish','ownership','disable','enable','rollback'].includes(row.kind)||
    !ID.test(row.targetId)||!NAME.test(row.name)||![row.targetSignature,row.homeSignature,row.programSignature,row.afterHash].every(v=>typeof v==='string'&&HASH.test(v))||
    !pathOK(row.to)||row.from!==null&&!pathOK(row.from)||row.assetId!==null&&!ID.test(row.assetId)||row.versionId!==null&&!ID.test(row.versionId)||
    row.captureId!==null&&!UUID.test(row.captureId)||row.restores!==null&&!UUID.test(row.restores)||
    row.directoryIdentity!==null&&(typeof row.directoryIdentity!=='string'||row.directoryIdentity.length>200)||
    row.beforeHash!==null&&!HASH.test(row.beforeHash)||!Number.isInteger(row.mode)||row.mode<0||row.mode>0o777||
    row.sourceTargetId!==null&&!ID.test(row.sourceTargetId)||[row.sourceSignature,row.sourceHash].some(v=>v!==null&&!HASH.test(v))||
    !(row.generation==='initial'||typeof row.generation==='string'&&UUID.test(row.generation)||Number.isSafeInteger(row.generation)&&row.generation>=0)||
    typeof row.at!=='string'||!Number.isFinite(Date.parse(row.at)))fail('原 Agent 操作记录无效，拒绝修复',503);
  return row;
}
function repairRow(row){
  if(!exact(row,[...repairFields,'captureId'])||row.schema!==1||!UUID.test(row.id)||!UUID.test(row.originalId)||!UUID.test(row.captureId)||
    ![row.targetId,row.assetId,row.versionId].every(v=>ID.test(v))||!pathOK(row.destination)||
    ![row.packageHash,row.targetSignature,row.homeSignature,row.programSignature,row.skillsIdentity].every(v=>typeof v==='string'&&HASH.test(v))||
    !UUID.test(row.admissionReceiptId)||!Number.isSafeInteger(row.revision)||row.revision<0||
    !(row.generation==='initial'||typeof row.generation==='string'&&UUID.test(row.generation)||Number.isSafeInteger(row.generation)&&row.generation>=0)||
    typeof row.at!=='string'||!Number.isFinite(Date.parse(row.at)))fail('修复操作记录无效',503);
  return row;
}
function authRow(row){if(!exact(row,repairFields))fail('修复授权记录无效',503);repairRow({...row,captureId:randomUUID()});return row;}
function ownerRow(row){if(!exact(row,['schema','id','operationId','directoryIdentity','at'])||row.schema!==1||!UUID.test(row.id)||!UUID.test(row.operationId)||typeof row.directoryIdentity!=='string'||row.directoryIdentity.length>200||!Number.isFinite(Date.parse(row.at)))fail('修复所有权记录无效',503);return row;}
function closeRow(row){if(!exact(row,['schema','id','at'])||row.schema!==1||!UUID.test(row.id)||!Number.isFinite(Date.parse(row.at)))fail('修复封闭记录无效',503);return row;}
async function macMetadata(path){
  if(process.platform!=='darwin')fail('当前平台不能可靠核验 Agent 目标 ACL/扩展属性',503);
  const run=promisify(execFile),opts={encoding:'utf8',timeout:2000,maxBuffer:32768};
  try{const {stdout:permissions}=await run('/bin/ls',['-lde',path],opts),{stdout:attrs}=await run('/usr/bin/xattr',[path],opts);if(!/^[d-][rwxstST-]{9}[ @]?\s/.test(permissions)||/^[d-][rwxstST-]{9}\+/.test(permissions)||/^\s*\d+:/m.test(permissions)||attrs.trim())throw Error('metadata');}
  catch{fail('目标含 ACL、扩展属性或无法核验，拒绝修复',503);}
}

export function createKnownMountRepair(repository,{settings,adapters={},clock=Date.now,filesystem=fs,checkMetadata=macMetadata}={}){
  if(filesystem!==fs&&(!adapters.readAgentRepairSkill||checkMetadata===macMetadata))fail('隔离文件系统缺少 Skill 读取或元数据核验适配器',503);
  const originalJournal=createConfigJournal(repository.directory,{filesystem,folder:'agent-write-operations',validate:oldRow,label:'原 Agent 发布',readLimit:512*1024});
  const authorizations=createConfigJournal(repository.directory,{filesystem,folder:'known-mount-repair-authorizations',validate:authRow,label:'独立修复授权'});
  const repairs=createConfigJournal(repository.directory,{filesystem,folder:'known-mount-repair-operations',validate:repairRow,label:'已知挂载修复'});
  const ownership=createConfigJournal(repository.directory,{filesystem,folder:'known-mount-repair-ownership',validate:ownerRow,label:'修复目录所有权'});
  const closures=createConfigJournal(repository.directory,{filesystem,folder:'known-mount-repair-closed',validate:closeRow,label:'修复封闭编号'});
  const previews=new Map();const at=()=>new Date(clock()).toISOString();
  const maybe=async path=>{try{return await filesystem.lstat(path);}catch(e){if(e.code==='ENOENT')return null;throw e;}};
  async function directory(path){
    if(!pathOK(path))fail('Agent 目录路径不是固定绝对路径');let p='/';
    for(const part of path.split('/').slice(1)){p=join(p,part);const s=await filesystem.lstat(p);if(!s.isDirectory()||s.isSymbolicLink())fail('Agent 目录祖先是链接或非普通目录');}
    const s=await filesystem.lstat(path);if(s.uid!==process.getuid?.()||(s.mode&0o7022))fail('Agent 目录所有者或权限不受支持');await checkMetadata(path);return identity(s);
  }
  async function scope(state,targetId,expected){
    const t=state.connections?.agentTargets?.find(x=>x.id===targetId);
    if(!t||!['codex','hermes'].includes(t.agentId)||t.program?.kind!=='CLI')fail('目标绑定不可用');
    if(typeof adapters.inspectAgentInventory!=='function'||typeof adapters.inspectAgentPrograms!=='function')fail('Agent 身份适配器未接入',503);
    let inventory,programs;try{[inventory,programs]=await Promise.all([adapters.inspectAgentInventory(t.agentId),adapters.inspectAgentPrograms(t.agentId,[t.program])]);}catch{fail('Agent 身份读取失败',503);}
    if(!inventory||inventory.errors?.length||inventory.truncated||!Array.isArray(programs))fail('Agent 身份读取不完整');
    const h=inventory.homes?.find(x=>x.id===t.home.id&&x.path===t.home.path&&x.status==='present'&&x.identity&&!x.errors?.length&&typeof x.source==='string'&&!x.source.includes('用户共享'));
    const p=programs.find(x=>x.path===t.program.path&&x.kind==='CLI'&&x.status==='present'&&x.identity);
    if(!h||!p)fail('目标程序或独立 Home 身份不可用');
    const skills=join(t.home.path,'skills'),result={target:t,skills,targetSignature:targetSignature(t),homeSignature:digest(h.identity),programSignature:digest(p.identity),skillsIdentity:digest(await directory(skills))};
    await directory(t.home.path);
    if(expected&&['targetSignature','homeSignature','programSignature','skillsIdentity'].some(k=>expected[k]!==undefined&&expected[k]!==result[k]))fail('目标或发现目录身份已变化');
    return result;
  }
  async function source(state,original){
    const asset=state.assets.find(a=>a.id===original.assetId&&a.type==='Skill'&&!a.archived),version=asset?.versions.find(v=>v.id===original.versionId);
    if(!version)fail('原固定 Skill 版本不可用');
    if(filesystem!==fs&&version.mediaManifest?.length&&!adapters.readReverseMedia)fail('隔离文件系统缺少媒体读取适配器',503);
    let pkg;
    try{pkg=normaliseFiles((await materializeSkillVersion(version,{readMedia:adapters.readReverseMedia||skillMediaReader(repository)})).files);}
    catch{fail('原固定 Skill 包或引用媒体不可核验');}
    if(pkg.bytes>MAX_BYTES||pkg.files.length>100)fail('原 Skill 包超过此修复入口的 5 MiB/100 文件上限');
    if(pkg.hash!==original.afterHash||(pkg.name||'asset-'+digest(asset.id).slice(0,24))!==original.name)fail('原固定版包与发布回执不一致');
    return pkg;
  }
  async function eligibility(state,originalId,{requireMissing=true}={}){
    const original=await originalJournal.get(originalId);
    if(!original||original.kind!=='publish'||!original.completedAt||!original.assetId||!original.versionId||!original.captureId||original.from!==null||original.beforeHash!==null||original.restores!==null)fail('仅支持本工作台完成发布的固定 Skill');
    const owned=await originalJournal.get(original.captureId);
    if(!owned||owned.kind!=='ownership'||owned.id!==original.captureId||owned.restores!==null||owned.captureId!==null||owned.from!==null||owned.beforeHash!==null||owned.mode!==original.mode||owned.generation!==original.generation||!owned.directoryIdentity||owned.to!==original.to||
      ['targetId','targetSignature','homeSignature','programSignature','name','afterHash','assetId','versionId'].some(k=>owned[k]!==original[k]))fail('原发布所有权回执缺失或不匹配');
    const place=await scope(state,original.targetId,original);
    if(original.to!==join(place.skills,original.name)||dirname(original.to)!==place.skills||original.mode!==0o700)fail('原发布落点不属于当前独立目标');
    const rows=await originalJournal.list();
    if(rows.some(r=>r.id!==original.id&&r.id!==original.captureId&&r.targetId===original.targetId&&
      (r.name===original.name||r.from===original.to||r.to===original.to||r.restores===original.id)))fail('原发布之后有同名操作或状态不明，不自动恢复');
    const current=await maybe(original.to);
    if(requireMissing&&current)fail(current.isSymbolicLink()?'目标是链接；无本工作台挂载所有权回执，拒绝修复':'目标路径已有内容，拒绝覆盖');
    const pkg=await source(state,original);
    return{original,owned,place,pkg};
  }
  async function gate(expected){
    if(!settings?.assertEnabled)fail('Agent 写入授权未接入，默认关闭',503);
    const current=await settings.assertEnabled('agent');
    if(!current?.enabled||current.generation!==expected)fail('Agent 写入授权关闭或代次已变化');
  }
  async function admission(p){
    if(typeof adapters.assertSkillAdmission!=='function')fail('固定 Skill 的修复准入未接入，默认拒绝');
    let a;try{a=await adapters.assertSkillAdmission({receiptId:p.admissionReceiptId,operationId:p.id,assetId:p.assetId,versionId:p.versionId,packageHash:p.packageHash,scope:'agent-mount-repair'});}
    catch{fail('固定 Skill 修复准入无法核验');}
    if(a?.status!=='approved'||a.receiptId!==p.admissionReceiptId||a.operationId!==p.id||a.assetId!==p.assetId||a.versionId!==p.versionId||a.packageHash!==p.packageHash||a.scope!=='agent-mount-repair')fail('固定 Skill 缺少匹配的单次修复准入回执');
  }
  function fields(p){return Object.fromEntries(repairFields.map(k=>[k,k==='schema'?1:k==='at'?at():k==='id'?p.id:p[k]]));}
  function matches(p,row){return repairFields.filter(k=>!['schema','at'].includes(k)).every(k=>p[k]===row[k]);}
  function publicPlan(p,pkg,authorized=false){return{token:p.id,operationId:p.id,originalId:p.originalId,targetId:p.targetId,assetId:p.assetId,versionId:p.versionId,destination:p.destination,packageHash:p.packageHash,
    admission:'approved',authorized,files:pkg.files.map(f=>({path:f.path,directory:!!f.directory,size:fileBytes(f).length,mode:f.mode,sha256:f.directory?null:digest(fileBytes(f))})),
    expiresAt:new Date(p.expires).toISOString(),scope:'仅重建本工作台曾发布且当前缺失的独立 Skill 目录；不处理链接或其它内容',adoption:'unverified'};}
  async function status(row,state){
    try{
      const {place,original}=await eligibility(state,row.originalId,{requireMissing:false});
      if(original.to!==row.destination||original.assetId!==row.assetId||original.versionId!==row.versionId||
        ['targetSignature','homeSignature','programSignature','skillsIdentity'].some(k=>place[k]!==row[k]))return{status:'unknown'};
      const own=await ownership.get(row.captureId),s=await maybe(row.destination);
      if(!own||own.operationId!==row.id||!s||!s.isDirectory()||s.isSymbolicLink()||identity(s)!==own.directoryIdentity)return{status:'unknown'};
      await directory(row.destination);
      const pkg=await (adapters.readAgentRepairSkill||readLocalSkill)([place.skills],row.destination);
      if(pkg.fingerprint!==row.packageHash||identity(await filesystem.lstat(row.destination))!==own.directoryIdentity)return{status:'changed'};
      for(const file of pkg.files){const path=join(row.destination,file.path),info=await filesystem.lstat(path);if(info.isSymbolicLink()||info.uid!==process.getuid?.()||(info.mode&0o7022)||info.isFile()&&info.nlink!==1)return{status:'changed'};await checkMetadata(path);}
      if(!row.completedAt){try{await repairs.complete(row.id,at());}catch{return{status:'files_match_receipt_unknown'};}}
      return{status:'matches_after'};
    }catch{return{status:'unknown'};}
  }
  function result(row,check){return{operationId:row.id,originalId:row.originalId,status:check.status,adoption:'unverified',message:check.status==='matches_after'?'工作台独立 Skill 目录字节已复验；Agent 原生加载仍未验证':check.status==='changed'?'目录有外部变化，停止覆盖或重放':'结果或目标身份未知，保留原编号且不重放'};}
  async function write(p,pkg,state,captureId){
    const identities=new Map();
    const guard=async()=>{await gate(p.generation);await scope(state,p.targetId,p);for(const [path,id] of identities)if(await directory(path)!==id)fail('新建目录身份已变化');};
    const writer=guardCapabilityFilesystem(filesystem,guard);
    await guard();if(await maybe(p.destination))fail('目标路径已有内容，不覆盖');
    await writer.mkdir(p.destination,{mode:0o700});
    const ownId=await directory(p.destination);identities.set(p.destination,ownId);
    await ownership.prepare({schema:1,id:captureId,operationId:p.id,directoryIdentity:ownId,at:at()},{guard});
    const dirs=pkg.files.filter(f=>f.directory).sort((a,b)=>a.path.split('/').length-b.path.split('/').length);
    for(const f of dirs){await guard();const path=join(p.destination,f.path);await writer.mkdir(path,{mode:0o700});identities.set(path,await directory(path));}
    const regular=pkg.files.filter(f=>!f.directory).sort((a,b)=>(a.path==='SKILL.md'?1:0)-(b.path==='SKILL.md'?1:0));
    for(const f of regular){
      await guard();const path=join(p.destination,f.path),h=await writer.open(path,constants.O_WRONLY|constants.O_CREAT|constants.O_EXCL|constants.O_NOFOLLOW,0o600);
      try{await h.writeFile(fileBytes(f));await h.chmod(f.mode);await h.sync();}finally{await h.close();}
      await checkMetadata(path);
    }
    for(const f of [...dirs].reverse()){await guard();await writer.chmod(join(p.destination,f.path),f.mode);}
    const root=await filesystem.open(p.destination,constants.O_RDONLY|constants.O_DIRECTORY|constants.O_NOFOLLOW);try{await root.sync();}finally{await root.close();}
    const parent=await filesystem.open(dirname(p.destination),constants.O_RDONLY|constants.O_DIRECTORY|constants.O_NOFOLLOW);try{await parent.sync();}finally{await parent.close();}
  }
  return{
    async preview(input){
      if(!exact(input,['originalId','revision'])||!UUID.test(input.originalId)||!Number.isSafeInteger(input.revision))fail('修复预览请求无效',400);
      const state=await repository.read();if(state.revision!==input.revision)fail('主库版本已变化');
      const {original,place,pkg}=await eligibility(state,input.originalId);
      let receiptId=null;
      if(typeof adapters.inspectSkillAdmission==='function'){
        try{const a=await adapters.inspectSkillAdmission({assetId:original.assetId,versionId:original.versionId,packageHash:pkg.hash,scope:'agent-mount-repair'});
          if(a?.status==='approved'&&a.assetId===original.assetId&&a.versionId===original.versionId&&a.packageHash===pkg.hash&&a.scope==='agent-mount-repair'&&UUID.test(a.receiptId))receiptId=a.receiptId;}catch{}
      }
      for(const [id,p] of previews)if(p.expires<=clock())previews.delete(id);
      if(previews.size>=4)fail('待确认修复预览过多');
      const id=randomUUID(),p={id,originalId:original.id,targetId:original.targetId,assetId:original.assetId,versionId:original.versionId,destination:original.to,packageHash:pkg.hash,
        targetSignature:place.targetSignature,homeSignature:place.homeSignature,programSignature:place.programSignature,skillsIdentity:place.skillsIdentity,
        admissionReceiptId:receiptId,generation:(await settings?.get?.('agent'))?.generation,revision:state.revision,expires:clock()+TTL};
      previews.set(id,p);
      return{...publicPlan(p,pkg),admission:receiptId?'approved':'requires-fixed-version-approval'};
    },
    async authorize(input){
      if(!exact(input,['token','confirmed'])||!UUID.test(input.token)||input.confirmed!==true)fail('请单独确认本次修复授权',400);
      const p=previews.get(input.token);if(!p)fail('修复预览不存在');
      return repository.withSnapshot({},async state=>{
        if(await closures.get(p.id))fail('原编号已封闭，迟到授权不执行');
        const old=await authorizations.get(p.id);if(old)return{operationId:p.id,status:old.completedAt?'authorized':'unknown',cancelable:true};
        if(p.expires<=clock()||state.revision!==p.revision||!p.admissionReceiptId)fail('预览过期、主库变化或 Skill 准入未完成');
        const current=await eligibility(state,p.originalId);
        if(current.pkg.hash!==p.packageHash||['targetSignature','homeSignature','programSignature','skillsIdentity'].some(k=>current.place[k]!==p[k]))fail('固定包或目标已变化');
        await gate(p.generation);
        try{await authorizations.prepare(fields(p));await authorizations.complete(p.id,at());return{operationId:p.id,status:'authorized',cancelable:true};}
        catch{fail('独立修复授权结果未知，按原编号核对',503);}
      });
    },
    async apply(input){
      if(!exact(input,['token','confirmed'])||!UUID.test(input.token)||input.confirmed!==true)fail('请确认重建已知缺失目录',400);
      const p=previews.get(input.token);if(!p)fail('修复预览不存在；请查询原编号');
      return repository.withSnapshot({},async state=>{
        if(await closures.get(p.id))fail('原编号已封闭，迟到修复不执行');
        const old=await repairs.get(p.id);if(old)return result(old,await status(old,state));
        const auth=await authorizations.get(p.id);if(!auth?.completedAt||!matches(p,auth))fail('独立修复授权缺失或目标不匹配');
        if(p.expires<=clock()||state.revision!==p.revision)fail('修复预览已过期');
        const current=await eligibility(state,p.originalId);
        if(current.pkg.hash!==p.packageHash||['targetSignature','homeSignature','programSignature','skillsIdentity'].some(k=>current.place[k]!==p[k]))fail('固定包或目标已变化');
        await gate(p.generation);await admission(p);
        const captureId=randomUUID(),row={...fields(p),captureId};
        try{await repairs.prepare(row);await write(p,current.pkg,state,captureId);return result(await repairs.get(p.id),await status(await repairs.get(p.id),state));}
        catch{return{operationId:p.id,status:'unknown',adoption:'unverified',message:'修复或回读结果未知；保留原编号且不重放'};}
      });
    },
    async check(input){
      if(!exact(input,['operationId'])||!UUID.test(input.operationId))fail('修复查询编号无效',400);
      return repository.withSnapshot({},async state=>{
        const row=await repairs.get(input.operationId),auth=await authorizations.get(input.operationId),closed=await closures.get(input.operationId);
        if(closed&&row)fail('修复编号同时存在封闭与写入记录，结果未知',503);
        if(closed)return{operationId:input.operationId,status:'not_started',closed:true,canceled:!!auth};
        if(row)return result(row,await status(row,state));
        if(auth)return{operationId:input.operationId,status:auth.completedAt?'authorized':'unknown',adoption:'unverified',cancelable:true};
        try{await closures.prepare({schema:1,id:input.operationId,at:at()});if(!await closures.get(input.operationId))fail('封闭回读失败',503);}
        catch{fail('修复结果仍未知，保留原编号',503);}
        return{operationId:input.operationId,status:'not_started',closed:true};
      });
    },
    async cancel(input){
      if(!exact(input,['operationId','confirmed'])||!UUID.test(input.operationId)||input.confirmed!==true)fail('请确认取消尚未执行的修复授权',400);
      return repository.withSnapshot({},async()=>{
        const row=await repairs.get(input.operationId),auth=await authorizations.get(input.operationId),closed=await closures.get(input.operationId);
        if(row)fail('修复写入已有记录，禁止取消；请按原编号查询');
        if(!auth)fail('该编号没有独立修复授权；请先查询原编号');
        if(closed)return{operationId:input.operationId,status:'not_started',closed:true,canceled:true};
        try{await closures.prepare({schema:1,id:input.operationId,at:at()});if(!await closures.get(input.operationId))fail('取消封闭回读失败',503);}
        catch{fail('取消结果未知，保留原编号并查询',503);}
        return{operationId:input.operationId,status:'not_started',closed:true,canceled:true};
      });
    },
    async resume(input){
      if(!exact(input,['operationId'])||!UUID.test(input.operationId))fail('修复恢复编号无效',400);
      const auth=await authorizations.get(input.operationId);
      if(!auth?.completedAt||await closures.get(input.operationId)||await repairs.get(input.operationId))fail('原授权不可恢复，请查询原结果');
      const state=await repository.read();if(state.revision!==auth.revision)fail('主库版本已变化，旧授权不可使用');
      const current=await eligibility(state,auth.originalId);
      if(current.pkg.hash!==auth.packageHash||current.original.to!==auth.destination||
        ['targetSignature','homeSignature','programSignature','skillsIdentity'].some(k=>current.place[k]!==auth[k]))fail('固定包或目标身份已变化，旧授权不可使用');
      const p={...auth,expires:clock()+TTL};previews.set(p.id,p);
      return publicPlan(p,current.pkg,true);
    },
  };
}
