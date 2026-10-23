import { mkdir,lstat,readFile,open,rename,unlink } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join,isAbsolute } from 'node:path';
import { createHash,randomUUID } from 'node:crypto';
import { createReaProcess,REA_METADATA_BYTES,REA_BOOTSTRAP_VERSION,registeredVersion,validVersion,reaError,safeLine,readRegisteredDoctor } from './reverse-process.mjs';
import { createMcpProbe,checkCompatibility } from './rea-compat.mjs';
import { readDataRootIdentity } from './data-root-identity.mjs';
const REGISTRY='https://registry.npmjs.org';
const setupArgs=['setup','--client','claude_code','--client','codex'];
const unresolved=s=>['writing','unknown','mismatch','write_failed'].includes(s);
const unwritten=s=>['idle','current','available','syncing','network_failed','preview','adaptation_failed','preview_failed'].includes(s);
const digest=v=>createHash('sha256').update(JSON.stringify(v)).digest('hex');
const path=p=>typeof p==='string'&&isAbsolute(p)&&p.length<4096&&!/[\x00-\x1f\x7f]/.test(p)&&!p.split('/').some(v=>v==='.'||v==='..');
function destinations(home,env) {return {
 'configure_client:claude_code':join(env.CLAUDE_CONFIG_DIR||home,'.claude.json'),
 'configure_client:codex':join(env.CODEX_HOME||join(home,'.codex'),'config.toml'),
 'install_skill:claude_code':join(env.CLAUDE_CONFIG_DIR||join(home,'.claude'),'skills/reverse-engineer-anything'),
 install_skill:join(home,'.agents/skills/reverse-engineer-anything'),
};}
export function projectPlan(raw,version,candidateDoctor,allowedPaths=destinations(homedir(),process.env)) {
 if(raw?.status!=='planned'||!Array.isArray(raw.plannedActions)||raw.plannedActions.length>4)throw reaError('adaptation','更新预演状态或客户端不符合范围');
 const skillVersion=candidateDoctor?.identity?.expected_skill_version;
 if(!['string','number'].includes(typeof skillVersion)||!/^\d+(?:\.\d+)*$/.test(String(skillVersion)))throw reaError('adaptation','预演未给出可核对的Skill版本');
 const ids=new Set(),actions=raw.plannedActions.map(a=>{
  const allowed={ 'configure_client:claude_code':['configure_client','create','update'],'configure_client:codex':['configure_client','create','update'],'install_skill:claude_code':['install_skill','install'],'install_skill':['install_skill','install'] }[a.id];
  if(!allowed||a.kind!==allowed[0]||!allowed.slice(1).includes(a.operation)||a.external!==false||!path(a.target)||a.backupPath!==undefined&&!path(a.backupPath)||ids.has(a.id))throw reaError('adaptation','预演含未允许的动作、路径或外部安装');
  ids.add(a.id);
  if(a.kind==='configure_client'&&candidateDoctor.identity.registrations?.find(r=>r.client===a.id.split(':')[1])?.config_path!==a.target)throw reaError('adaptation','预演与doctor配置位置不一致');
  if(a.target!==allowedPaths[a.id])throw reaError('adaptation','预演目标不属于当前两个客户端的REA目录');
  return {id:a.id,kind:a.kind,operation:a.operation,target:a.target,backupPath:a.backupPath||null};
 }).sort((a,b)=>a.id.localeCompare(b.id));
 return {version,clients:['claude_code','codex'],skillVersion:String(skillVersion),actions};
}
async function privateDir(p){await mkdir(p,{mode:0o700}).catch(e=>{if(e.code!=='EEXIST')throw e;});const s=await lstat(p);if(!s.isDirectory()||s.isSymbolicLink()||s.uid!==process.getuid?.()||s.mode&0o022)throw reaError('disk','更新记录目录身份无效');}
export async function createReaUpdater({directory,execute=createReaProcess(),probe=createMcpProbe(),fetchImpl=fetch,clock=Date.now,externalBusy=()=>false,timeoutMs=300000,home=homedir(),environment={...process.env}}={}) {
 const root=join(directory,'reverse-evidence'),folder=join(root,'updates'),ledger=join(directory,'rea-updates'),file=join(ledger,'state.json');
 const allowedPaths=destinations(home,environment);
 await privateDir(root);await privateDir(folder);await privateDir(ledger);
 const identity=await readDataRootIdentity(directory);
 let journal=null,busy=false,closed=false,controller,settled;
 try{const s=await lstat(file);if(!s.isFile()||s.isSymbolicLink()||s.size>1024*1024)throw Error('更新记录文件无效');journal=JSON.parse(await readFile(file,'utf8'));}catch(e){if(e.code!=='ENOENT')throw e;}
 if(journal?.state==='writing')journal={...journal,state:'unknown',message:'服务曾中断更新；先查询结果，不重复写入'};
 if(journal&&journal.identity!==identity){
  // Invalidate only checks/previews that never reached a write. Keep the ledger
  // untouched until an explicit check, and never carry a foreign plan forward.
  journal=typeof journal.identity==='string'&&journal.identity&&unwritten(journal.state)&&!journal.persistencePending
   ?{identity,state:'idle',message:'旧目录中的检查或预演已失效，请重新检查更新。'}
   :{...journal,state:'unknown',message:'数据目录身份变化；旧预演不可确认，请核对原机器的更新结果'};
 }
 async function persist(next){
  const temp=join(ledger,randomUUID()+'.tmp');const f=await open(temp,'wx',0o600);
  try{await f.writeFile(JSON.stringify(next));await f.sync();}finally{await f.close();}
  await rename(temp,file);const dir=await open(ledger,'r');try{await dir.sync();}finally{await dir.close();}journal=next;
 }
 const view=()=>journal?structuredClone(journal):{state:'idle'};
 async function operation(fn){
  if(closed||busy||externalBusy())throw reaError('busy','已有REA取证或更新操作，请稍后再试');
  busy=true;controller=new AbortController();let done;settled=new Promise(r=>done=r);const timer=setTimeout(()=>controller.abort(reaError('timeout','REA更新操作超时，请核对结果')),timeoutMs);
  try{return await fn(controller.signal);}finally{clearTimeout(timer);busy=false;done();}
 }
 async function json(version,args,signal,{offline=false}={}) {
  const output=join(folder,randomUUID()+'.json');
  try{const returned=await execute(version,args,output,{signal,offline,registry:REGISTRY,environment});const s=await lstat(output);if(s.size>REA_METADATA_BYTES)throw reaError('adaptation','REA元数据超过读取上限');return returned||JSON.parse(await readFile(output,'utf8'));}
  finally{await unlink(output).catch(()=>{});}
 }
 async function remote(url,signal){
  const response=await fetchImpl(url,{signal,redirect:'error',headers:{Accept:'application/json','User-Agent':'personal-ai-workbench'}});
  if(response.status===404)return null;if(!response.ok)throw reaError('network','发布服务暂不可用：HTTP '+response.status);
  let text='',size=0;for await(const chunk of response.body){size+=chunk.length;if(size>1024*1024)throw reaError('network','发布信息过大');text+=Buffer.from(chunk).toString('utf8');}
  return JSON.parse(text);
 }
 async function doctor(version,signal){return json(version,['doctor'],signal,{offline:true});}
 function aligned(raw,plan){const read=registeredVersion(raw);return read.version===plan.version&&raw.identity?.skill?.state==='aligned'&&String(read.skillVersion)===plan.skillVersion;}
 function assertClear(){if(unresolved(journal?.state))throw reaError('unknown','上次更新尚未确认，请先查询结果；不重放写入');}
 async function ensureIdentity(){if(identity!==await readDataRootIdentity(directory)||journal&&journal.identity!==identity)throw reaError('identity','数据目录身份变化，旧预演不可继续');}
 const localVersion=()=>validVersion(journal?.current?.version)?journal.current.version:validVersion(journal?.plan?.version)?journal.plan.version:REA_BOOTSTRAP_VERSION;
 return {
  get busy(){return busy;},get unresolved(){return unresolved(journal?.state);},versionForDoctor:localVersion,
  read:()=>({...view(),busy}),
  check:()=>operation(async signal=>{
   assertClear();await ensureIdentity();
   try{
    const currentDoctor=await readRegisteredDoctor(v=>doctor(v,signal),localVersion()),current=registeredVersion(currentDoctor);
    const release=await remote('https://api.github.com/repos/morluto/rea/releases/latest',signal);
    const version=release?.tag_name?.replace(/^v/,'');
    if(!validVersion(version)||release.draft!==false||release.prerelease!==false||release.html_url!==`https://github.com/morluto/rea/releases/tag/${release.tag_name}`)throw reaError('network','未取得可信的GitHub正式发布版');
    const npm=await remote(`${REGISTRY}/rea-agents/${version}`,signal);
    const state=!npm?'syncing':npm.name!=='rea-agents'||npm.version!==version?'syncing':current.version===version&&currentDoctor.identity?.skill?.state==='aligned'&&String(current.skillVersion)===String(current.expectedSkillVersion)?'current':'available';
    const next={identity,state,checkedAt:new Date(clock()).toISOString(),version,current,releaseUrl:release.html_url,message:state==='syncing'?'发布同步中：npm尚无同版本':state==='current'?'已是最新正式版':current.version===version?'本机Skill需修复；先预演再确认':'发现正式新版本；先预演再确认'};
    await persist(next);return view();
   }catch(e){if(e.kind==='launch')throw e;await persist({identity,state:'network_failed',message:safeLine(e.message),checkedAt:new Date(clock()).toISOString()});return view();}
  }),
  preview:()=>operation(async signal=>{
   assertClear();await ensureIdentity();if(!['available','preview','adaptation_failed','preview_failed'].includes(journal?.state)||!validVersion(journal.version))throw reaError('input','请先检查正式发布版');
   const version=journal.version;
   try{
    const raw=await json(version,[...setupArgs,'--dry-run'],signal),plan=projectPlan(raw,version,await json(version,['doctor'],signal),allowedPaths);
    const inventory=await json(version,['--llms-full'],signal),tools=await probe(version,{signal,environment}),compatibility=checkCompatibility(inventory,tools);
    const next={...journal,plan,compatibility,state:compatibility.ok?'preview':'adaptation_failed',planId:randomUUID(),planHash:digest(plan),expiresAt:clock()+300000,message:compatibility.ok?'预演完成，尚未写入Agent配置':'适配检查未通过；禁止更新'};
    await persist(next);return view();
   }catch(e){await persist({...journal,state:'preview_failed',message:safeLine(e.message)});return view();}
  }),
  confirm:({planId}={})=>operation(async signal=>{
   await ensureIdentity();
   if(journal?.state==='succeeded'&&journal.planId===planId)return view();
   if(unresolved(journal?.state))return {...view(),message:'结果待核对；请点查询结果，不重复写入'};
   if(journal?.state!=='preview'||journal.planId!==planId||clock()>journal.expiresAt)throw reaError('input','预演失效，请重新预演');
   try{
    const again=projectPlan(await json(journal.plan.version,[...setupArgs,'--dry-run'],signal),journal.plan.version,await json(journal.plan.version,['doctor'],signal),allowedPaths);
    if(digest(again)!==journal.planHash||clock()>journal.expiresAt)throw reaError('changed','配置计划已变化，请重新预演');
    const compatible=checkCompatibility(await json(again.version,['--llms-full'],signal),await probe(again.version,{signal,environment}));
    if(!compatible.ok)throw reaError('adaptation','确认前适配复核失败：'+compatible.missing.join('、'));
    signal.throwIfAborted();await ensureIdentity();
    if(clock()>journal.expiresAt)throw reaError('changed','适配检查后预演已过期，请重新预演');
    await persist({...journal,state:'writing',message:'正在写入；断线后请查询结果'});
    const result=await json(again.version,[...setupArgs,'--yes'],signal);
    const raw=await doctor(again.version,signal),ok=result.status==='ready'&&aligned(raw,again);
    await persist({...journal,state:ok?'succeeded':'mismatch',current:registeredVersion(raw),message:ok?'两客户端及Skill版本已对齐。请重启Claude Code和Codex。':'回读不一致：先核对备份与两个客户端，勿重复更新'});return view();
   }catch(e){
    const next={...journal,state:unresolved(journal?.state)?'write_failed':'preview_failed',message:unresolved(journal?.state)?'写入结果待核对：'+safeLine(e.message):safeLine(e.message)};
    try{await persist(next);}catch{journal={...next,state:'unknown',persistencePending:true,message:'更新回执写盘失败；先查询本机注册，不重复更新'};}
    return view();
   }
  }),
  query:()=>operation(async signal=>{
   await ensureIdentity();if(!journal?.plan)return view();
   try{const raw=await doctor(journal.plan.version,signal);const ok=aligned(raw,journal.plan);
    // Only reconcile a previously attempted write; a read never grants approval.
    if(unresolved(journal.state)||journal.state==='succeeded')await persist({...journal,state:ok?'succeeded':'mismatch',current:registeredVersion(raw),persistencePending:false,message:ok?'注册与Skill回读一致。请重启Claude Code和Codex。':'回读不一致；更新可能只完成一部分，请按备份位置人工核对后再查询'});
    return view();
   }catch(e){return {...view(),message:'查询失败：'+safeLine(e.message)+'；未重放更新'};}
  }),
  async close(){closed=true;if(busy){controller.abort(reaError('interrupted','服务关闭，更新结果需查询'));await settled;}}
 };
}
