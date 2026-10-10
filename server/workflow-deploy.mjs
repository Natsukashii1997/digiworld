// Workflow B, bounded target delivery. A deployment is an inert sidecar folder
// in a registered project workspace. It never installs a discoverable Skill,
// changes Agent configuration, starts an Agent, or certifies native adoption.
import fs from 'node:fs/promises';
import {constants} from 'node:fs';
import {createHash, randomUUID} from 'node:crypto';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {dirname, isAbsolute, join, relative, resolve, sep} from 'node:path';
import {unzipSync, strFromU8} from 'fflate';
import {buildWorkflowDeploymentBundle} from '../src/workflow-references.js';
import {safePath} from '../src/store.js';
import {skillMediaReader} from './skill-version-media.mjs';
import {denyAgentCredentialPaths} from './agent-write.mjs';
import {createConfigJournal} from './config-journal.mjs';
import {readConfigFile} from './config-file.mjs';
import {guardCapabilityFilesystem} from './guarded-capability-filesystem.mjs';
import {digest, failure} from './repository.mjs';

const UUID=/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/;
const SHA=/^[a-f0-9]{64}$/;
const ID=/^[A-Za-z0-9_-]{1,100}$/;
const PREVIEW_MS=300000, MAX_BUNDLE_BYTES=5*1024*1024;
const exact=(v,keys)=>v&&typeof v==='object'&&!Array.isArray(v)&&Object.keys(v).length===keys.length&&keys.every(k=>Object.hasOwn(v,k));
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const reject=(message,status=409)=>{throw failure(message,status);};
const identity=s=>JSON.stringify([s.dev,s.ino,s.birthtimeMs,s.uid]);
const within=(root,path)=>path===root||path.startsWith(root+sep);
const safeAbsolute=p=>typeof p==='string'&&isAbsolute(p)&&resolve(p)===p&&p.length<=4000&&!/[\x00-\x1f\x7f]/.test(p);
const rowFields=['schema','id','assetId','versionId','targetId','projectId','workspacePath','destination','sourceSha256','targetSignature','homeSignature','programSignature','workspaceSignature','dataRootSignature','at'];
function validateBase(row){
  if(!row||row.schema!==1||!UUID.test(row.id)||![row.assetId,row.versionId,row.targetId,row.projectId].every(v=>typeof v==='string'&&ID.test(v))||
    !safeAbsolute(row.workspacePath)||!safeAbsolute(row.destination)||dirname(row.destination)!==row.workspacePath||
    ![row.sourceSha256,row.targetSignature,row.homeSignature,row.programSignature,row.workspaceSignature,row.dataRootSignature].every(v=>typeof v==='string'&&SHA.test(v))||
    typeof row.at!=='string'||!/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(row.at)||!Number.isFinite(Date.parse(row.at)))
    reject('工作流部署记录无效，停止写入',503);
}
function validateAuthorization(row){
  if(!exact(row,rowFields))reject('工作流部署授权记录无效',503);
  validateBase(row);return row;
}
function validateDeployment(row){
  if(!exact(row,[...rowFields,'captureId','files','dirs'])||!UUID.test(row.captureId)||!Array.isArray(row.files)||row.files.length<3||row.files.length>100||!Array.isArray(row.dirs)||row.dirs.length>100)
    reject('工作流部署记录无效',503);
  validateBase(row);
  const seen=new Set();
  for(const file of row.files){
    if(!exact(file,['path','size','sha256'])||!safeRelative(file.path)||!Number.isSafeInteger(file.size)||file.size<0||file.size>25*1024*1024||!SHA.test(file.sha256)||seen.has(file.path))
      reject('工作流部署文件清单无效',503);
    seen.add(file.path);
  }
  if(!seen.has('workflow.md')||!seen.has('manifest.json')||!seen.has('README.md'))reject('工作流部署核心文件缺失',503);
  const dirSeen=new Set();
  for(const dir of row.dirs){if(!safeRelative(dir)||dirSeen.has(dir)||seen.has(dir))reject('工作流部署目录清单无效',503);dirSeen.add(dir);}
  for(const file of row.files){const parts=file.path.split('/');for(let n=1;n<parts.length;n++)if(!dirSeen.has(parts.slice(0,n).join('/')))reject('工作流部署目录清单不完整',503);}
  return row;
}
function validateOwnership(row){
  if(!exact(row,['schema','id','operationId','directoryIdentity','at'])||row.schema!==1||!UUID.test(row.id)||!UUID.test(row.operationId)||
    typeof row.directoryIdentity!=='string'||row.directoryIdentity.length>200||!/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(row.at)||!Number.isFinite(Date.parse(row.at)))
    reject('工作流部署目录所有权记录无效',503);
  return row;
}
function validateClosure(row){
  if(!exact(row,['schema','id','assetId','versionId','at'])||row.schema!==1||!UUID.test(row.id)||
    !ID.test(row.assetId)||!ID.test(row.versionId)||typeof row.at!=='string'||!Number.isFinite(Date.parse(row.at)))
    reject('工作流部署封闭记录无效',503);
  return row;
}
function safeRelative(path){
  return safePath(path)&&path.length<=1024&&path.split('/').every(part=>part!=='.'&&part.length<=255)&&
    !/[\x00-\x1f\x7f:]/.test(path);
}
// Same macOS ACL/xattr refusal as agent-write's directory guard. Synthetic
// filesystems may inject the equivalent metadata check explicitly.
async function defaultMetadataCheck(path){
  if(process.platform!=='darwin')reject('当前平台不能可靠核验目标 ACL/扩展属性，未部署',503);
  const run=promisify(execFile),options={encoding:'utf8',timeout:2000,maxBuffer:32768};
  try{
    const {stdout:permissions}=await run('/bin/ls',['-lde',path],options);
    const {stdout:attrs}=await run('/usr/bin/xattr',[path],options);
    if(!/^[d-][rwxstST-]{9}[ @]?\s/.test(permissions)||/^[d-][rwxstST-]{9}\+/.test(permissions)||/^\s*\d+:/m.test(permissions)||attrs.trim())throw Error('metadata');
  }catch{reject('目标包含 ACL、扩展属性或无法核验，未部署',503);}
}
function publicPlan(plan,authorized=false){
  return {token:plan.token,operationId:plan.id,revision:plan.revision,assetId:plan.assetId,versionId:plan.versionId,
    targetId:plan.targetId,projectId:plan.projectId,target:plan.targetLabel,workspace:plan.workspacePath,
    path:plan.destination,sourceSha256:plan.sourceSha256,expiresAt:new Date(plan.expires).toISOString(),
    authorized,adoption:'unverified',scope:'只写所选项目工作区中的独立副本；不安装Skill、不修改Agent配置、不启动Agent',
    dependencies:plan.dependencies,changes:plan.files.map(f=>({path:join(plan.destination,f.path),beforeHash:null,afterHash:f.sha256,size:f.size,mode:'0600'}))};
}

export function createWorkflowDeploy(repository,{adapters={},clock=Date.now,filesystem=fs}={}){
  const checkMetadata=adapters.checkWorkflowDeployMetadata||defaultMetadataCheck;
  const auth=createConfigJournal(repository.directory,{filesystem,folder:'workflow-deploy-authorizations',validate:validateAuthorization,label:'工作流单次部署授权',readLimit:256*1024});
  const deployments=createConfigJournal(repository.directory,{filesystem,folder:'workflow-deploy-operations',validate:validateDeployment,label:'工作流独立副本',readLimit:512*1024});
  const owners=createConfigJournal(repository.directory,{filesystem,folder:'workflow-deploy-ownership',validate:validateOwnership,label:'工作流目录所有权',readLimit:256*1024});
  const closures=createConfigJournal(repository.directory,{filesystem,folder:'workflow-deploy-closed',validate:validateClosure,label:'工作流封闭编号'});
  const previews=new Map();
  const at=()=>new Date(clock()).toISOString();
  const cancelled=id=>({operationId:id,status:'cancelled',closed:true,adoption:'unverified',message:'未开始落地的单次授权已封闭；迟到授权与部署确认不会执行'});

  async function directory(path){
    if(!safeAbsolute(path))reject('工作区或目标路径不是固定绝对路径');
    let part='/';
    for(const segment of path.split('/').slice(1)){
      part=join(part,segment);
      const s=await filesystem.lstat(part);
      if(!s.isDirectory()||s.isSymbolicLink())reject('工作区路径经过链接或不是普通目录');
    }
    const s=await filesystem.lstat(path);
    if(s.uid!==process.getuid?.()||(s.mode&0o7022))reject('工作区目录所有者或权限不受支持');
    await checkMetadata(path);
    return identity(s);
  }
  async function dataRootSignature(){
    const path=resolve(repository.directory),real=await filesystem.realpath(path),id=await directory(path);
    if(real!==path)reject('数据目录身份不可核验',503);
    return digest(JSON.stringify([real,id]));
  }
  async function scope(state,{targetId,projectId,workspacePath},expected){
    const target=state.connections?.agentTargets?.find(t=>t.id===targetId);
    if(!target||!['codex','hermes'].includes(target.agentId)||target.program.kind!=='CLI')reject('仅支持已登记的 Codex/Hermes CLI 目标');
    if(typeof adapters.inspectAgentInventory!=='function'||typeof adapters.inspectAgentPrograms!=='function')reject('Agent 目标发现能力未接入',503);
    let inventory,programs;
    try{[inventory,programs]=await Promise.all([adapters.inspectAgentInventory(target.agentId),adapters.inspectAgentPrograms(target.agentId,[target.program])]);}
    catch{reject('Agent 目标身份读取失败，停止部署',503);}
    if(inventory.errors?.length||inventory.truncated)reject('Agent 目标目录核验不完整');
    const home=inventory.homes?.find(h=>h.id===target.home.id&&h.path===target.home.path&&h.status==='present'&&h.identity&&!h.source?.includes('用户共享')&&!h.errors?.length);
    const program=programs?.find(p=>p.path===target.program.path&&p.kind==='CLI'&&p.status==='present'&&p.identity);
    if(!home||!program)reject('CLI 程序或独立 Home 身份不可用');
    await directory(target.home.path);
    const project=state.connections?.projects?.find(p=>p.id===projectId);
    if(!project||project.identityConflict===true||!project.localPaths?.includes(workspacePath))reject('项目工作区未登记或身份有冲突');
    if(!safeAbsolute(workspacePath)||within(target.home.path,workspacePath)||within(resolve(repository.directory),workspacePath))
      reject('工作区不能位于 Agent Home 或工作台数据目录内');
    const workspaceId=await directory(workspacePath),rootSignature=await dataRootSignature();
    const targetSignature=digest(JSON.stringify([target.id,target.agentId,target.program.path,target.program.kind,target.home.id,target.home.path,target.bindingId||null]));
    const value={target,project,targetSignature,homeSignature:digest(home.identity),programSignature:digest(program.identity),
      workspaceSignature:digest(JSON.stringify([project.id,workspacePath,workspaceId])),dataRootSignature:rootSignature,workspaceId};
    if(expected&&['targetSignature','homeSignature','programSignature','workspaceSignature','dataRootSignature'].some(k=>value[k]!==expected[k]))
      reject('目标、项目工作区或数据目录身份已变化，请重新预览');
    return value;
  }
  function destination(workspacePath,targetId,assetId,versionId){
    const suffix=digest(JSON.stringify([targetId,assetId,versionId])).slice(0,24);
    return join(workspacePath,`.guiji-workflow-${suffix}`);
  }
  async function missing(path){
    try{await filesystem.lstat(path);return false;}catch(e){if(e.code==='ENOENT')return true;throw e;}
  }
  async function bundle(state,assetId,versionId){
    const asset=state.assets.find(a=>a.id===assetId&&a.type==='Workflow'&&!a.archived),version=asset?.versions.find(v=>v.id===versionId);
    if(!version)reject('固定工作流版本缺失或已归档');
    let zip;
    try{zip=await buildWorkflowDeploymentBundle(asset,version,state.assets,{readMedia:adapters.readReverseMedia||skillMediaReader(repository)});}
    catch(e){reject(`固定引用包不可部署：${e.message}`);}
    if(zip.length>MAX_BUNDLE_BYTES)reject('固定引用包超过本入口 5 MiB 上限');
    const sourceSha256=hash(zip),entries=unzipSync(zip),root=`workflow-${assetId}-${versionId}`;
    let manifest;
    try{manifest=JSON.parse(strFromU8(entries[`${root}/manifest.json`]));}catch{reject('部署包清单不可读取',503);}
    if(manifest?.kind!=='workflow-deployment'||manifest.root!==root||manifest.workflow?.assetId!==assetId||manifest.workflow?.versionId!==versionId||!Array.isArray(manifest.files)||!Array.isArray(manifest.references))
      reject('部署包来源与清单不匹配',503);
    const expected=new Set([`${root}/manifest.json`]),seen=new Set(),files=[],dirs=new Set(),data=new Map();
    for(const f of manifest.files){
      if(!safeRelative(f.path)||seen.has(f.path.normalize('NFC').toLowerCase())||typeof f.directory!=='boolean'||!Number.isSafeInteger(f.size)||f.size<0)
        reject('部署包路径或文件清单无效',503);
      seen.add(f.path.normalize('NFC').toLowerCase());
      const entry=`${root}/${f.path}${f.directory?'/':''}`,bytes=entries[entry];
      if(!bytes||bytes.length!==f.size||(f.directory?f.sha256!==null:hash(bytes)!==f.sha256))reject('部署包文件哈希或大小不一致',503);
      expected.add(entry);
      if(f.directory)dirs.add(f.path);
      else {files.push({path:f.path,size:f.size,sha256:f.sha256});data.set(f.path,bytes);}
      const parts=f.path.split('/');for(let i=1;i<parts.length;i++)dirs.add(parts.slice(0,i).join('/'));
    }
    if(Object.keys(entries).length!==expected.size||Object.keys(entries).some(k=>!expected.has(k)))reject('部署包含清单以外的文件',503);
    const manifestBytes=entries[`${root}/manifest.json`];
    files.push({path:'manifest.json',size:manifestBytes.length,sha256:hash(manifestBytes)});data.set('manifest.json',manifestBytes);
    if(files.length>100||!files.some(f=>f.path==='workflow.md')||!files.some(f=>f.path==='README.md'))reject('部署包文件范围不受支持',503);
    const dependencies=[];
    for(const ref of manifest.references){
      if(!exact(ref,['type','assetId','versionId','number','title','path'])||!['Skill','Prompt'].includes(ref.type)||!ID.test(ref.assetId)||!ID.test(ref.versionId)||!safeRelative(ref.path))
        reject('部署依赖映射不明确：仅支持固定 Skill/Prompt 引用');
      const related=files.filter(f=>f.path===ref.path||f.path.startsWith(ref.path+'/'));
      if(!related.length)reject('部署依赖缺失，停止预览');
      if(ref.type==='Skill'){
        denyAgentCredentialPaths(related);
        const skillSha256=digest(JSON.stringify(related.map(f=>[f.path,f.sha256,f.size])));
        const proof=await adapters.skillAdmission?.({assetId:ref.assetId,versionId:ref.versionId,sha256:skillSha256});
        if(proof?.approved!==true||proof.sha256!==skillSha256)
          reject('Skill 固定版缺少同字节准入审核；本次不复制该 Skill');
        dependencies.push({type:'Skill',assetId:ref.assetId,versionId:ref.versionId,sha256:skillSha256,status:'已核对准入；仅作为非激活副本'});
      }else dependencies.push({type:'Prompt',assetId:ref.assetId,versionId:ref.versionId,status:'固定文件随包复制'});
    }
    return {sourceSha256,files,dirs:[...dirs].sort((a,b)=>a.split('/').length-b.split('/').length||a.localeCompare(b)),data,dependencies};
  }
  async function plan(state,input,id=randomUUID()){
    const place=await scope(state,input),dest=destination(input.workspacePath,input.targetId,input.assetId,input.versionId);
    if(!await missing(dest))reject('此目标工作区已有同版独立副本；不覆盖或合并');
    const value=await bundle(state,input.assetId,input.versionId);
    for(const [key,p] of previews)if(p.expires<=clock())previews.delete(key);
    if(previews.size>=4)reject('待确认的工作流部署预览过多');
    const token=randomUUID(),candidate={token,id,revision:state.revision,assetId:input.assetId,versionId:input.versionId,
      targetId:input.targetId,projectId:input.projectId,workspacePath:input.workspacePath,destination:dest,targetLabel:place.target.label,
      sourceSha256:value.sourceSha256,targetSignature:place.targetSignature,homeSignature:place.homeSignature,
      programSignature:place.programSignature,workspaceSignature:place.workspaceSignature,dataRootSignature:place.dataRootSignature,
      files:value.files,dirs:value.dirs,data:value.data,dependencies:value.dependencies,expires:clock()+PREVIEW_MS};
    previews.set(token,candidate);return candidate;
  }
  function record(p){return Object.fromEntries(rowFields.map(k=>[k,k==='schema'?1:k==='at'?at():k==='id'?p.id:p[k]]));}
  function same(p,row){return rowFields.filter(k=>!['schema','at'].includes(k)).every(k=>p[k]===row[k]);}
  async function fresh(p,state){
    if(p.expires<=clock()||state.revision!==p.revision)reject('部署预览已过期或主库版本已变化，请重新预览');
    await scope(state,p,p);
    if(!await missing(p.destination))reject('目标目录已出现其它内容，拒绝覆盖');
    const updated=await bundle(state,p.assetId,p.versionId);
    if(updated.sourceSha256!==p.sourceSha256)reject('固定版或引用媒体已变化，请重新预览');
    return updated;
  }
  async function inspectFiles(row,owner,state){
    try{
      await scope(state,row,row);
      const root=await filesystem.lstat(row.destination);
      if(!root.isDirectory()||root.isSymbolicLink()||root.uid!==process.getuid?.()||(root.mode&0o777)!==0o700||!owner||owner.operationId!==row.id||owner.directoryIdentity!==identity(root))return 'unknown';
      await checkMetadata(row.destination);
      const expected=new Map(row.files.map(f=>[f.path,f])),expectedDirs=new Set(row.dirs);
      const observed=new Set(),observedDirs=new Map();
      async function walk(dir,rel=''){
        for(const name of await filesystem.readdir(dir)){
          const path=join(dir,name),r=rel?rel+'/'+name:name,s=await filesystem.lstat(path);
          if(s.isSymbolicLink()||s.uid!==process.getuid?.()||(s.mode&0o7022))return false;
          if(s.isDirectory()){await checkMetadata(path);if(!expectedDirs.has(r)||(s.mode&0o777)!==0o700)return false;observedDirs.set(path,identity(s));if(!await walk(path,r))return false;}
          else if(s.isFile()){
            await checkMetadata(path);
            const f=expected.get(r);if(!f||s.nlink!==1||(s.mode&0o777)!==0o600||s.size!==f.size)return false;
            const read=await readConfigFile(path,{filesystem,limit:MAX_BUNDLE_BYTES});
            if(read.hash!==f.sha256||read.identity!==JSON.stringify([s.dev,s.ino,s.size,s.mtimeMs,s.ctimeMs,s.mode,s.nlink,s.uid,s.gid]))return false;
            observed.add(r);
          }else return false;
        }
        return true;
      }
      if(!await walk(row.destination)||observed.size!==expected.size||observedDirs.size!==expectedDirs.size)return 'changed';
      if(identity(await filesystem.lstat(row.destination))!==owner.directoryIdentity)return 'unknown';
      for(const [path,id] of observedDirs)if(identity(await filesystem.lstat(path))!==id)return 'unknown';
      return 'matches_after';
    }catch{return 'unknown';}
  }
  async function checked(row,state){
    const owner=await owners.get(row.captureId),status=await inspectFiles(row,owner,state);
    if(status==='matches_after'&&!row.completedAt){
      try{await deployments.complete(row.id,at());}
      catch{return {operationId:row.id,status:'files_match_receipt_unknown',adoption:'unverified',message:'文件字节一致，但本机完成回执未确认；仍只查询原编号。'};}
    }
    return {operationId:row.id,status,adoption:'unverified',message:status==='matches_after'?'独立副本字节与目标绑定已回读；Agent原生加载与执行未验证':status==='changed'?'目标内容与本次操作不一致；不覆盖、不重放':'结果或身份无法确认；保留目录和原编号，停止重放'};
  }
  async function writeCopy(p,built,state,ownerIdentity){
    const identities=new Map([[p.destination,ownerIdentity]]);
    const guard=async()=>{
      await scope(state,p,p);
      for(const [path,expected] of identities){
        const s=await filesystem.lstat(path);
        if(!s.isDirectory()||s.isSymbolicLink()||identity(s)!==expected||(s.mode&0o777)!==0o700)reject('部署目录身份已变化');
        await checkMetadata(path);
      }
    };
    const guarded=guardCapabilityFilesystem(filesystem,guard);
    for(const rel of built.dirs){
      await guard();const path=join(p.destination,rel);await guarded.mkdir(path,{mode:0o700});
      const s=await filesystem.lstat(path);if(!s.isDirectory()||s.isSymbolicLink()||s.uid!==process.getuid?.()||(s.mode&0o777)!==0o700)reject('部署子目录身份不可核验');
      await checkMetadata(path);
      identities.set(path,identity(s));
    }
    for(const file of p.files){
      await guard();const path=join(p.destination,file.path),bytes=built.data.get(file.path);
      if(!bytes||hash(bytes)!==file.sha256)reject('部署来源字节已变化',503);
      const handle=await guarded.open(path,constants.O_WRONLY|constants.O_CREAT|constants.O_EXCL|constants.O_NOFOLLOW,0o600);
      try{await handle.writeFile(bytes);await handle.sync();}finally{await handle.close();}
    }
    for(const rel of [...built.dirs].reverse()){
      const handle=await filesystem.open(join(p.destination,rel),constants.O_RDONLY|constants.O_DIRECTORY|constants.O_NOFOLLOW);
      try{await handle.sync();}finally{await handle.close();}
    }
    const root=await filesystem.open(p.destination,constants.O_RDONLY|constants.O_DIRECTORY|constants.O_NOFOLLOW);
    try{await root.sync();}finally{await root.close();}
    const parent=await filesystem.open(p.workspacePath,constants.O_RDONLY|constants.O_DIRECTORY|constants.O_NOFOLLOW);
    try{await parent.sync();}finally{await parent.close();}
  }
  const api={
    async preview(input){
      if(!exact(input,['assetId','versionId','targetId','projectId','workspacePath','revision'])||
        ![input.assetId,input.versionId,input.targetId,input.projectId].every(v=>typeof v==='string'&&ID.test(v))||
        !Number.isSafeInteger(input.revision)||!safeAbsolute(input.workspacePath))reject('工作流部署预览请求无效',400);
      const state=await repository.read();if(state.revision!==input.revision)reject('主库已变化，请刷新');
      return publicPlan(await plan(state,input));
    },
    async authorize(input){
      if(!exact(input,['token','operationId','confirmed'])||!UUID.test(input.operationId)||input.confirmed!==true)reject('请明确确认本次独立部署授权',400);
      const p=previews.get(input.token);if(!p||p.id!==input.operationId)reject('授权预览不存在，请重新预览');
      return repository.withSnapshot({},async state=>{
        if(await closures.get(p.id))reject('本次部署编号已封闭；迟到授权不执行');
        const existing=await auth.get(p.id);
        if(existing){if(!same(p,existing))reject('原编号属于另一份授权');return {operationId:p.id,status:existing.completedAt?'authorized':'unknown'};}
        await fresh(p,state);
        try{await auth.prepare(record(p));await auth.complete(p.id,at());return {operationId:p.id,status:'authorized',scope:'只授权该固定版本、目标和工作区一次部署'};}
        catch{throw Object.assign(failure('授权结果未确认；请查询原编号',503),{unknownResult:true});}
      });
    },
    async apply(input){
      if(!exact(input,['token','operationId','confirmed'])||!UUID.test(input.operationId)||input.confirmed!==true)reject('请确认本次独立副本落地',400);
      const p=previews.get(input.token);if(!p||p.id!==input.operationId)reject('部署预览不存在，请查询原编号');
      return repository.withSnapshot({},async state=>{
        if(await closures.get(p.id))reject('本次部署编号已封闭；迟到确认不执行');
        const existing=await deployments.get(p.id);
        if(existing){if(!same(p,existing))reject('原编号属于另一份部署');return checked(existing,state);}
        const grant=await auth.get(p.id);
        if(!grant?.completedAt||!same(p,grant))reject('缺少本次独立授权或授权结果未知；停止部署');
        const built=await fresh(p,state),captureId=randomUUID();
        const row={...record(p),captureId,files:p.files,dirs:p.dirs};
        try{
          await deployments.prepare(row);
          await scope(state,p,p);if(!await missing(p.destination))reject('目标目录已被占用');
          await filesystem.mkdir(p.destination,{mode:0o700});
          const owned=await filesystem.lstat(p.destination);
          await owners.prepare({schema:1,id:captureId,operationId:p.id,directoryIdentity:identity(owned),at:at()});
          await writeCopy(p,built,state,identity(owned));
          const result=await checked(await deployments.get(p.id),state);
          previews.delete(p.token);return result;
        }catch{
          return {operationId:p.id,status:'unknown',adoption:'unverified',message:'部署或回读结果未确认；只查询原编号，不重复落地。'};
        }
      });
    },
    async check(input){
      if(!exact(input,['operationId','assetId','versionId'])||!UUID.test(input.operationId)||!ID.test(input.assetId)||!ID.test(input.versionId))reject('部署查询编号无效',400);
      return repository.withSnapshot({},async state=>{
        const row=await deployments.get(input.operationId),grant=await auth.get(input.operationId),closed=await closures.get(input.operationId);
        if(closed){
          if(row)reject('已部署编号同时存在封闭记录，结果未知',503);
          if(closed.assetId!==input.assetId||closed.versionId!==input.versionId||
            grant&&(grant.assetId!==input.assetId||grant.versionId!==input.versionId))reject('原编号不属于这份固定工作流');
          return grant?cancelled(input.operationId):{operationId:input.operationId,status:'not_started',closed:true,adoption:'unverified',message:'原编号已持久封闭，迟到授权与确认不会执行'};
        }
        const original=row||grant;
        if(original&&(original.assetId!==input.assetId||original.versionId!==input.versionId))
          reject('原编号不属于这份固定工作流');
        if(row)return checked(row,state);
        if(!grant){
          try{await closures.prepare({schema:1,id:input.operationId,assetId:input.assetId,versionId:input.versionId,at:at()});if(!await closures.get(input.operationId))reject('封闭记录回读失败',503);}
          catch{reject('部署结果仍未知；保留原编号，不重放',503);}
          return {operationId:input.operationId,status:'not_started',closed:true,adoption:'unverified',message:'原编号已持久封闭，迟到授权与确认不会执行'};
        }
        try{await scope(state,grant,grant);}catch{return {operationId:input.operationId,status:'binding_changed',adoption:'unverified'};}
        if(!grant.completedAt){try{await auth.complete(grant.id,at());}catch{return {operationId:grant.id,status:'unknown'};}}
        return {operationId:grant.id,status:'authorized',adoption:'unverified',targetId:grant.targetId,projectId:grant.projectId,workspacePath:grant.workspacePath,message:'单次授权已回读，目标尚未部署；可恢复本次预览后确认。'};
      });
    },
    async cancel(input){
      if(!exact(input,['operationId','assetId','versionId','confirmed'])||!UUID.test(input.operationId)||
        !ID.test(input.assetId)||!ID.test(input.versionId)||input.confirmed!==true)reject('请明确确认取消本次未落地授权',400);
      // The same repository queue serializes authorize, apply, check and cancel.
      // A prepared deployment is never cancelable, even if no files were written.
      return repository.withSnapshot({},async()=>{
        const row=await deployments.get(input.operationId),grant=await auth.get(input.operationId),closed=await closures.get(input.operationId);
        if(row)reject('部署已开始或结果未知；不能取消授权，只能查询原编号');
        if(!grant)reject('原编号没有可取消的授权；请先查询原编号');
        if(grant.assetId!==input.assetId||grant.versionId!==input.versionId||
          closed&&(closed.assetId!==input.assetId||closed.versionId!==input.versionId))reject('原编号不属于这份固定工作流');
        if(!closed){
          try{
            await closures.prepare({schema:1,id:input.operationId,assetId:input.assetId,versionId:input.versionId,at:at()});
            if(!await closures.get(input.operationId))reject('取消封闭回读未确认',503);
          }catch{reject('取消结果未知；保留原编号，只查询原操作，不再确认部署',503);}
        }
        for(const [token,p] of previews)if(p.id===input.operationId)previews.delete(token);
        return cancelled(input.operationId);
      });
    },
    async resume(input){
      if(!exact(input,['operationId','assetId','versionId'])||!UUID.test(input.operationId)||!ID.test(input.assetId)||!ID.test(input.versionId))reject('恢复预览编号无效',400);
      const grant=await auth.get(input.operationId);
      if(await closures.get(input.operationId))reject('原编号已封闭，不再恢复部署预览');
      if(!grant?.completedAt||grant.assetId!==input.assetId||grant.versionId!==input.versionId||await deployments.get(grant.id))reject('原操作不能恢复部署预览；请查询原结果');
      const state=await repository.read();
      const p=await plan(state,grant,grant.id);
      if(!same(p,grant)){previews.delete(p.token);reject('目标或固定包已变化，旧授权不可使用');}
      return publicPlan(p,true);
    },
  };
  return api;
}
