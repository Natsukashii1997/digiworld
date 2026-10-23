import {DatabaseSync} from 'node:sqlite';
import {mkdir,lstat,realpath,chmod} from 'node:fs/promises';
import {join,isAbsolute} from 'node:path';
import {randomUUID,createHash} from 'node:crypto';
import {connectCodex,DESKTOP_CODEX} from './codex-native-transport.mjs';
import {validateAiResult} from '../src/reverse-ai.js';
import {validateNativeReply,nativeRunning} from '../src/reverse-native-protocol.js';

const fail=(message,status=409)=>Object.assign(new Error(message),{status});
const hash=v=>createHash('sha256').update(typeof v==='string'?v:JSON.stringify(v)).digest('hex');
const id=v=>{if(typeof v!=='string'||!/^[A-Za-z0-9_-]{1,100}$/.test(v))throw fail('操作或记录编号无效',400);return v;};
const stamp=()=>new Date().toISOString();
const SETTINGS=['model','modelProvider','reasoningEffort','serviceTier','cwd','approvalPolicy','approvalsReviewer','sandbox','activePermissionProfile','instructionSources','multiAgentMode'];
const project=(v,keys)=>Object.fromEntries(keys.filter(k=>v[k]!==undefined).map(k=>[k,v[k]]));
const supportedRequests=new Set(['item/commandExecution/requestApproval','item/fileChange/requestApproval','item/permissions/requestApproval','item/tool/requestUserInput','mcpServer/elicitation/request','applyPatchApproval','execCommandApproval']);

export async function createReverseNative({repository,connect=connectCodex,defaultCwd='',externalBusy=()=>false}={}) {
 const root=join(repository.directory,'reverse-evidence','native');
 for(const path of [join(repository.directory,'reverse-evidence'),root]){
  await mkdir(path,{recursive:true,mode:0o700});
  if((await lstat(path)).isSymbolicLink())throw fail('原生记录目录不能是符号链接',503);
 }
 const path=join(root,'sessions.sqlite');
 try{if((await lstat(path)).isSymbolicLink())throw fail('原生记录文件不能是符号链接',503);}catch(e){if(e.code!=='ENOENT')throw e;}
 const db=new DatabaseSync(path);await chmod(path,0o600);
 db.exec(`PRAGMA journal_mode=DELETE; PRAGMA synchronous=FULL;
 CREATE TABLE IF NOT EXISTS sessions(id TEXT PRIMARY KEY, record_id TEXT NOT NULL, data TEXT NOT NULL);
 CREATE TABLE IF NOT EXISTS operations(id TEXT PRIMARY KEY, signature TEXT NOT NULL, status TEXT NOT NULL, result TEXT);
 CREATE TABLE IF NOT EXISTS items(seq INTEGER PRIMARY KEY AUTOINCREMENT, session_id TEXT NOT NULL, item_id TEXT NOT NULL, turn_id TEXT, data TEXT NOT NULL, UNIQUE(session_id,item_id));
 `);
 let runtime=null,queue=Promise.resolve(),closed=false;
 const serial=fn=>{const next=queue.then(()=>{if(closed)throw fail('服务已关闭',503);return fn();});queue=next.catch(()=>{});return next;};
 const load=sid=>{const row=db.prepare('SELECT data FROM sessions WHERE id=?').get(id(sid));if(!row)throw fail('会话关联不存在',404);return JSON.parse(row.data);};
 const store=s=>{s.updatedAt=stamp();db.prepare('INSERT INTO sessions VALUES(?,?,?) ON CONFLICT(id) DO UPDATE SET data=excluded.data').run(s.id,s.recordId,JSON.stringify(s));};
 for(const row of db.prepare('SELECT data FROM sessions').all()){
  const s=JSON.parse(row.data);s.status='disconnected';s.pending=[];store(s);
 }
 function putItem(sid,tid,item,threadId){
  if(!item?.id)return;
  if(item.type==='userMessage'&&item.clientId){
   const s=load(sid);
   if(s.pendingOperation?.id===item.clientId){
    db.prepare('UPDATE operations SET status=?,result=? WHERE id=?').run('done',JSON.stringify({accepted:true,turnId:tid}),item.clientId);
    delete s.pendingOperation;store(s);
   }
  }
  if(threadId){const original=item.id;item={...item,id:threadId+':'+original,_nativeId:original,_threadId:threadId};}
  db.prepare('INSERT INTO items(session_id,item_id,turn_id,data) VALUES(?,?,?,?) ON CONFLICT(session_id,item_id) DO UPDATE SET data=excluded.data,turn_id=excluded.turn_id')
   .run(sid,item.id,tid||'',JSON.stringify(item));
 }
 const itemSnapshot=sid=>new Map(db.prepare('SELECT item_id,data FROM items WHERE session_id=?').all(sid).map(r=>[r.item_id,r.data]));
 function hydrate(sid,thread,baseline,childId){
  for(const turn of thread.turns||[]){
   if(turn.itemsView&&turn.itemsView!=='full')continue;
   for(const item of turn.items||[]){
    const key=childId?childId+':'+item.id:item.id;
    const current=db.prepare('SELECT data FROM items WHERE session_id=? AND item_id=?').get(sid,key)?.data;
    // A notification received during this RPC is newer than its history snapshot.
    if(current===baseline.get(key))putItem(sid,turn.id,{...item,_completed:turn.status!=='inProgress'},childId);
   }
  }
 }
 function applyThreadStatus(target,thread){
  const turn=thread.turns?.at(-1);if(turn)target.turnId=turn.id;
  target.status=thread.status?.type==='active'?'running':thread.status?.type==='notLoaded'?'disconnected':thread.status?.type==='systemError'?'unknown':thread.status?.type==='idle'?'idle':turn?.status==='inProgress'?'running':'idle';
 }
 async function fullHistory(client,thread){
  const pages=async(method,params)=>{
   const rows=[],seen=new Set();let cursor;
   do{
    const page=await client.request(method,{...params,sortDirection:'asc',limit:100,...(cursor?{cursor}:{})});
    if(!Array.isArray(page.data)||page.nextCursor!=null&&typeof page.nextCursor!=='string')throw fail('原生历史分页无效，恢复尚未完成',503);
    rows.push(...page.data);cursor=page.nextCursor;
    if(cursor&&seen.has(cursor))throw fail('原生历史游标重复，恢复尚未完成',503);
    if(cursor)seen.add(cursor);
   }while(cursor);
   return rows;
  };
  const turns=await pages('thread/turns/list',{threadId:thread.id,itemsView:'full'});
  for(const turn of turns)if(turn.itemsView&&turn.itemsView!=='full'){
   const entries=await pages('thread/items/list',{threadId:thread.id,turnId:turn.id});
   turn.items=entries.map(e=>e.item);turn.itemsView='full';
  }
  return {...thread,turns};
 }
 function message(sid,m){
  if(closed)return;
  try {
   const s=load(sid),p=m.params||{};s.eventSequence=(s.eventSequence||0)+1;
   if(m.method==='thread/started'&&p.thread?.parentThreadId&&(p.thread.parentThreadId===s.threadId||s.children?.some(c=>c.id===p.thread.parentThreadId))){
    s.children=[...(s.children||[]).filter(c=>c.id!==p.thread.id),{id:p.thread.id,parentThreadId:p.thread.parentThreadId,status:'idle'}];store(s);return;
   }
   const child=p.threadId&&s.children?.find(c=>c.id===p.threadId);
   if(p.threadId&&s.threadId&&p.threadId!==s.threadId&&!child){
    if(m.id!==undefined)runtime?.client?.reject(m.id,'请求线程不属于当前逆向任务');return;
   }
   if(['turn/started','turn/completed','thread/status/changed'].includes(m.method)){
    if(child)child.eventSequence=(child.eventSequence||0)+1;
    else s.threadSequence=(s.threadSequence||0)+1;
   }
   if(m.id!==undefined){
    if(!supportedRequests.has(m.method)||p.mode==='openai/userVerification'){
     runtime?.client?.reject(m.id,'工作台未实现此宿主能力，请在原生客户端处理。');
     s.error='原生请求 '+m.method+(p.mode?' / '+p.mode:'')+' 需要当前未接入的宿主能力。';store(s);return;
    }
    s.pending=[...(s.pending||[]).filter(r=>r.id!==m.id),{id:m.id,method:m.method,params:p,generation:s.generation}];
   }else if(m.method==='serverRequest/resolved'){
    const resolved=s.pending?.find(r=>r.id===p.requestId);
    if(resolved?.operationId)db.prepare('UPDATE operations SET status=?,result=? WHERE id=?').run('done',JSON.stringify({resolved:true}),resolved.operationId);
    s.pending=(s.pending||[]).filter(r=>r.id!==p.requestId);
   }else if(m.method==='turn/started'){
    if(child){child.turnId=p.turn.id;child.status='running';}else{s.turnId=p.turn.id;s.status='running';}
   }else if(m.method==='thread/status/changed'){
    applyThreadStatus(child||s,{status:p.status});
   }
   else if(m.method==='turn/completed'){
    if(child){child.status='idle';}else{s.turnId=p.turn.id;s.completedTurnId=p.turn.id;s.status='idle';s.lastTurnStatus=p.turn.status;s.error=p.turn.error?.message||null;}
    // Requests, including nonblocking questions, live until serverRequest/resolved.
    for(const item of p.turn.items||[])putItem(sid,p.turn.id,{...item,_completed:true},child?.id);
   }else if(m.method==='item/started'||m.method==='item/completed'){
    putItem(sid,p.turnId,{...p.item,_completed:m.method==='item/completed'},child?.id);
   }else if(m.method==='item/agentMessage/delta'||m.method==='item/commandExecution/outputDelta'){
    const row=db.prepare('SELECT data FROM items WHERE session_id=? AND item_id=?').get(sid,child?child.id+':'+p.itemId:p.itemId);
    const item=row?JSON.parse(row.data):{id:p.itemId,type:m.method.includes('agentMessage')?'agentMessage':'commandExecution'};
    const key=item.type==='agentMessage'?'text':'aggregatedOutput';item[key]=(item[key]||'')+(p.delta||'');putItem(sid,p.turnId,item,row?undefined:child?.id);
   }else if(m.method==='error'){s.error=p.error?.message||'原生执行报错';}
   const current=load(sid);
   if(!current.pendingOperation)delete s.pendingOperation;
   store(s);
  } catch(e) {
   // Stop the transport on persistence failure. Never claim events were saved.
   if(runtime?.sid===sid){runtime.fault=e;runtime.client?.close();}
  }
 }
 async function record(recordId,expectedRevision){
  id(recordId);const state=await repository.read();
  if(expectedRevision!==undefined&&state?.revision!==expectedRevision)throw fail('记录已变化，请刷新后重试');
  const r=state?.reverseRecords?.find(r=>r.id===recordId&&!r.deletedAt);
  if(!r?.material?.target||r.material.target.authorized!==true)throw fail('找不到已授权的逆向参照物',404);
  return r;
 }
 async function bound(input,controlOnly=false){
  const s=load(input.sessionId);
  if(s.recordId!==id(input.recordId))throw fail('会话不属于当前参照物',403);
  if(!controlOnly){const r=await record(input.recordId);if(hash(r.material.target)!==s.targetHash)throw fail('参照物已变化，请建立新会话；旧历史保留。');}
  return s;
 }
 async function operation(kind,input,fn) {
  id(input.operationId);
  const signature=hash({kind,...input}),old=db.prepare('SELECT * FROM operations WHERE id=?').get(input.operationId);
  if(old){
   if(old.signature!==signature)throw fail('同一操作编号不能改用其他输入',400);
   if(old.status==='done'||old.status==='submitted')return JSON.parse(old.result);
   if(old.status==='rejected')throw fail('原生操作已明确拒绝，请调整输入后重试',400);
   throw Object.assign(fail('上次操作结果未知，请重新连接核对；不会重复执行。'),{unknownResult:true});
  }
  db.prepare('INSERT INTO operations VALUES(?,?,?,NULL)').run(input.operationId,signature,'pending');
  try{
   const result=await fn();
   db.prepare('UPDATE operations SET status=?,result=? WHERE id=?').run(result.awaitingResolution?'submitted':'done',JSON.stringify(result),input.operationId);return result;
  }catch(e){
   // Only a pre-dispatch or definite RPC rejection can be retried with new input.
   if(db.prepare('SELECT status FROM operations WHERE id=?').get(input.operationId)?.status!=='done')
    db.prepare('UPDATE operations SET status=? WHERE id=?').run(e.definite?'rejected':'unknown',input.operationId);
   throw e;
  }
 }
 async function directory(value){
  if(typeof value!=='string'||!isAbsolute(value)||/[\0\r\n]/.test(value))throw fail('请选择与 Codex 相同的本机工作目录',400);
  const cwd=await realpath(value);if(!(await lstat(cwd)).isDirectory())throw fail('工作目录不存在',400);return cwd;
 }
 async function catalogFor(client,cwd){
  const config=(await client.request('config/read',{cwd,includeLayers:false})).config||{};
  const models=[];let cursor;
  do{const page=await client.request('model/list',{limit:100,...(cursor?{cursor}:{})});models.push(...page.data);cursor=page.nextCursor;}while(cursor);
  const skills=await client.request('skills/list',{cwds:[cwd],forceReload:true});
  const skill=skills.data?.flatMap(d=>d.skills||[]).find(s=>s.name==='reverse-engineer-anything'&&s.enabled);
  return {defaults:project(config,['model','model_reasoning_effort','service_tier','approval_policy','approvals_reviewer','sandbox_mode']),models:models.map(m=>project(m,['model','displayName','supportedReasoningEfforts','serviceTiers','defaultServiceTier'])),skill:skill?project(skill,['name','path','enabled']):null};
 }
 async function toolsFor(client,threadId){
  const servers=[];let cursor;
  do{const page=await client.request('mcpServerStatus/list',{threadId,serverName:'rea',detail:'toolsAndAuthOnly',limit:100,...(cursor?{cursor}:{})});servers.push(...page.data);cursor=page.nextCursor;}while(cursor);
  const rea=servers.find(s=>s.name==='rea');
  const tools=rea?.tools||{},toolNames=Object.keys(tools).sort();
  return {server:'rea',toolNames,toolSchemaHash:hash(tools),runtimeStatus:rea?.runtimeStatus??null,toolsError:rea?.toolsError??null,serverInfo:rea?.serverInfo??null};
 }
 async function attach(s,resume=false) {
  if(runtime?.sid===s.id&&runtime.client?.connected&&s.status!=='disconnected')return runtime.client;
  if(externalBusy())throw fail('REA 更新或旧任务正在运行，请结束后再连接');
  if(runtime){
   const previous=load(runtime.sid);
   if(previous.status!=='disconnected'&&(nativeRunning(previous)||previous.pending?.length))throw fail('另一个原生分析仍在运行，请先停止或完成它');
   await runtime.client?.close();previous.status='disconnected';previous.pending=[];store(previous);runtime=null;
  }
  const generation=randomUUID();s.generation=generation;s.pending=[];s.status='connecting';store(s);
  const holder={sid:s.id,client:null};runtime=holder;
  let client;
  try{
   client=await connect({cwd:s.cwd,onMessage:m=>{if(runtime===holder)message(s.id,m);},onDisconnect:e=>{
    if(closed||runtime!==holder)return;const latest=load(s.id);latest.status='disconnected';latest.pending=[];latest.error=e.message;store(latest);
   }});
   holder.client=client;
   const catalog=await catalogFor(client,s.cwd);
   if(!catalog.skill)throw fail('当前工作目录未发现已启用的 REA Skill，请在 Codex 中检查配置',503);
   const options=s.options||{};
   if(options.model&&!catalog.models.some(m=>m.model===options.model))throw fail('所选模型已不可用，请重新选择',400);
   if(options.effort&&!catalog.models.find(m=>m.model===(options.model||catalog.defaults.model))?.supportedReasoningEfforts?.some(e=>e.reasoningEffort===options.effort))throw fail('所选模型不支持该推理强度',400);
   const baseline=itemSnapshot(s.id),sequence=load(s.id).threadSequence;
   const started=await client.request(resume?'thread/resume':'thread/start',resume?{threadId:s.threadId,excludeTurns:true}:{cwd:s.cwd,...project(options,['model','serviceTier','approvalPolicy','sandbox']),...(options.effort?{config:{model_reasoning_effort:options.effort}}:{})});
   if(resume)started.thread=await fullHistory(client,started.thread);
   // Runtime events can arrive during RPCs: refresh before checkpointing.
   hydrate(s.id,started.thread,baseline);
   s={...load(s.id),threadId:started.thread.id,settings:project(started,SETTINGS),identity:client.identity.userAgent,skill:catalog.skill,catalog,error:null};
   if(s.threadSequence===sequence||s.status==='connecting')applyThreadStatus(s,started.thread);
   const current=load(s.id);if(!current.pendingOperation)delete s.pendingOperation;store(s);
   const capabilities=await toolsFor(client,s.threadId);s={...load(s.id),capabilities};
   if(!s.capabilities.toolNames.length||s.capabilities.toolsError)throw fail('原生 REA 工具尚未就绪；请检查 Codex 中的 REA 连接',503);
   store(s);if(resume)await refreshChildren(client,s.id);return client;
  }catch(e){s=load(s.id);s.error=e.message;s.status='disconnected';store(s);runtime=null;await client?.close();throw e;}
 }
 async function refreshChildren(client,sid){
  for(const child of load(sid).children||[]){
   const baseline=itemSnapshot(sid),sequence=child.eventSequence;
   try{
    const read=await client.request('thread/read',{threadId:child.id,includeTurns:false});
    const thread=await fullHistory(client,read.thread);
    hydrate(sid,thread,baseline,child.id);
    const latest=load(sid),current=latest.children.find(c=>c.id===child.id);
    if(current.eventSequence===sequence)applyThreadStatus(current,thread);
    store(latest);
   }catch(e){
    const latest=load(sid);latest.children.find(c=>c.id===child.id).status='unknown';latest.error='子任务状态未核实，请重新连接核对：'+e.message;store(latest);
   }
  }
 }
 async function query({recordId,sessionId,before,operationId}={}) {
  id(recordId);
  const sessions=db.prepare('SELECT data FROM sessions WHERE record_id=? ORDER BY rowid DESC').all(recordId).map(r=>JSON.parse(r.data));
  const s=sessionId?sessions.find(s=>s.id===sessionId):sessions[0];
  if(sessionId&&!s)throw fail('会话不属于当前参照物',404);
  const rows=s?db.prepare('SELECT seq,data,turn_id FROM items WHERE session_id=? AND seq<? ORDER BY seq DESC LIMIT 101').all(s.id,before?Number(before):Number.MAX_SAFE_INTEGER):[];
  const items=rows.slice(0,100).reverse().map(r=>({...JSON.parse(r.data),_seq:r.seq,_turnId:r.turn_id}));
  const op=operationId?db.prepare('SELECT status FROM operations WHERE id=?').get(id(operationId)):undefined;
  if(op&&['unknown','pending'].includes(op.status)){
   const started=sessions.find(s=>s.startOperationId===operationId&&s.threadId&&s.capabilities?.toolNames?.length&&['idle','running'].includes(s.status));
   if(started){
    const result=await query({recordId,sessionId:started.id});
    db.prepare('UPDATE operations SET status=?,result=? WHERE id=?').run('done',JSON.stringify(result),operationId);op.status='done';
   }
   const state=await repository.read();
   const version=state.reverseRecords?.find(r=>r.id===recordId)?.packVersions?.find(v=>v.id===operationId&&v.nativeSource&&sessions.some(s=>s.id===v.nativeSource.sessionId));
   if(version){db.prepare('UPDATE operations SET status=?,result=? WHERE id=?').run('done',JSON.stringify({state,versionId:version.id}),operationId);op.status='done';}
  }
  return {session:s||null,sessions:sessions.map(s=>project(s,['id','createdAt','status','threadId'])),items,hasOlder:rows.length>100,...(op?{operation:op}:{})};
 }
 return {
  get busy(){return !!runtime;}, // Updating REA while its MCP process is alive is unsafe.
  query,
  catalog:async({cwd=defaultCwd}={})=>serial(async()=>{
   cwd=await directory(cwd);const client=await connect({cwd});
   try{return {cwd,binary:DESKTOP_CODEX,identity:client.identity.userAgent,...await catalogFor(client,cwd)};}finally{await client.close();}
  }),
  start:input=>serial(async()=>{
   if(!Number.isSafeInteger(input.expectedRevision))throw fail('开始前需要当前记录版本',400);
   const r=await record(input.recordId,input.expectedRevision),cwd=await directory(input.cwd||defaultCwd);
   const options=input.options||{};
   if(Object.keys(options).some(k=>!['model','effort','serviceTier','approvalPolicy','sandbox'].includes(k)))throw fail('不支持的运行设置',400);
   if(options.approvalPolicy&&!['untrusted','on-request','never'].includes(options.approvalPolicy))throw fail('审批策略无效',400);
   if(options.sandbox&&!['read-only','workspace-write','danger-full-access'].includes(options.sandbox))throw fail('权限设置无效',400);
   return operation('start',input,async()=>{
    const s={id:randomUUID(),startOperationId:input.operationId,recordId:r.id,cwd,options,target:structuredClone(r.material.target),targetHash:hash(r.material.target),createdAt:stamp(),pending:[],status:'starting'};
    store(s);await attach(s);return query({recordId:r.id,sessionId:s.id});
   });
  }),
  reconnect:input=>serial(async()=>{
   const s=await bound(input,true);if(!s.threadId)throw fail('创建结果未知，未取得原生线程编号；请核对原生历史，不能自动重建');
   if(runtime?.sid===s.id&&runtime.client?.connected&&s.status!=='disconnected'){
    const baseline=itemSnapshot(s.id);
    const read=await runtime.client.request('thread/read',{threadId:s.threadId,includeTurns:false});
    const thread=await fullHistory(runtime.client,read.thread);
    hydrate(s.id,thread,baseline);
    const latest=load(s.id);
    if(latest.threadSequence===s.threadSequence)applyThreadStatus(latest,thread);
    if(!load(s.id).pendingOperation)delete latest.pendingOperation;
    store(latest);await refreshChildren(runtime.client,s.id);
   }else await attach(s,true);
   return query(input);
  }),
  turn:input=>serial(async()=>{
   const s=await bound(input);
   if(typeof input.text!=='string'||!input.text.trim()||input.text.length>200000)throw fail('请输入有效问题（最多 20 万字）',400);
   return operation('turn',input,async()=>{
    if(s.pendingOperation)throw Object.assign(fail('上次输入结果未知，请先重新连接核对'),{definite:true});
    if(!runtime||runtime.sid!==s.id||!runtime.client.connected)throw Object.assign(fail('连接已断开，请先重新连接'),{definite:true});
    const text={type:'text',text:input.text};
    s.pendingOperation={id:input.operationId,kind:'turn',at:stamp()};store(s);
    let result;
    try{result=await runtime.client.request(s.status==='running'?'turn/steer':'turn/start',s.status==='running'
     ?{threadId:s.threadId,expectedTurnId:s.turnId,input:[text]}
     :{threadId:s.threadId,clientUserMessageId:input.operationId,input:[text,{type:'skill',name:s.skill.name,path:s.skill.path}],...(s.options.effort?{effort:s.options.effort}:{})});
    }catch(e){
     const latest=load(s.id);if(e.definite)delete latest.pendingOperation;
     latest.error=e.definite?e.message:'上次输入结果未知，请重新连接核对；未自动重发。';store(latest);throw e;
    }
    const latest=load(s.id);latest.turnId=result.turn?.id||latest.turnId;
    delete latest.pendingOperation;
    if(latest.completedTurnId!==latest.turnId){latest.status='running';latest.error=null;}
    store(latest);
    return query(input);
   });
  }),
  acknowledge:input=>serial(async()=>{
   const s=await bound(input,true);
   if(s.pendingOperation?.id===input.operationId){
    db.prepare('UPDATE operations SET status=? WHERE id=?').run('abandoned',input.operationId);
    delete s.pendingOperation;s.error='已由用户核对历史，原输入不再重发。';store(s);
   }
   return query(input);
  }),
  interrupt:input=>serial(async()=>{const s=await bound(input,true);return operation('interrupt',input,async()=>{
   if(runtime?.sid!==s.id||!runtime.client.connected)throw Object.assign(fail('连接失效，请重新连接后核对'),{definite:true});
   const targets=[...(s.status==='running'?[{id:s.threadId,turnId:s.turnId}]:[]),...(s.children||[]).filter(c=>c.status==='running')];
   const results=await Promise.allSettled(targets.map(t=>runtime.client.request('turn/interrupt',{threadId:t.id,turnId:t.turnId})));
   if(results.some(r=>r.status==='rejected'))throw fail('部分停止请求未确认，请回读仍在运行的任务',503);
   return {requested:true};
  });}),
  respond:input=>serial(async()=>{
   const s=await bound(input),request=s.pending?.find(p=>p.id===input.requestId&&p.generation===input.generation);
   // Completed duplicate responses may be queried even after the request was removed.
   const prior=db.prepare('SELECT status,signature,result FROM operations WHERE id=?').get(id(input.operationId));
   if(['done','submitted'].includes(prior?.status)&&prior.signature===hash({kind:'respond',...input}))return JSON.parse(prior.result);
   if(runtime?.sid!==s.id||!runtime.client.connected||!request)throw fail('审批或提问已失效，请回读当前连接');
   if(request.operationId)throw fail('答复已提交，正在等待原生确认；不会重复答复');
   validateNativeReply(request,input.result);
   return operation('respond',input,async()=>{
    request.operationId=input.operationId;request.submitted=true;store(s);
    runtime.client.respond(request.id,input.result);
    return {submitted:true,awaitingResolution:true};
   });
  }),
  disconnect:input=>serial(async()=>{const s=await bound(input,true);if(nativeRunning(s)||s.pending?.length)throw fail('请先停止当前轮再断开');if(runtime?.sid===s.id){await runtime.client.close();runtime=null;}s.status='disconnected';s.pending=[];store(s);return query(input);}),
  archive:input=>serial(async()=>{
   if(!Number.isSafeInteger(input.expectedRevision))throw fail('保存前需要当前记录版本',400);
   const s=await bound(input);
   return operation('archive',input,async()=>{
    const row=db.prepare('SELECT data,turn_id FROM items WHERE session_id=? AND item_id=?').get(s.id,input.itemId);
    const item=row&&JSON.parse(row.data);
    if(item?.type!=='agentMessage'||!item._completed)throw Object.assign(fail('只能保存已完成的 Codex 回复'),{definite:true});
    const result={conclusions:[],unknowns:[],pack:item.text};validateAiResult(result);
    const version={id:input.operationId,at:stamp(),executor:'codex',target:s.target,result,packHash:hash(item.text),nativeSource:{sessionId:s.id,threadId:item._threadId||s.threadId,turnId:row.turn_id,itemId:item._nativeId||item.id}};
    const state=await repository.updateReverse(records=>records.map(r=>{
     if(r.id!==s.recordId)return r;
     if(r.deletedAt||hash(r.material.target)!==s.targetHash)throw fail('参照物变化，未保存任务包');
     if(r.packVersions?.some(v=>v.id===version.id))return r;
     const versions=[...(r.packVersions||[]),version];
     while(versions.length>8){const at=versions.findIndex(v=>v.id!==r.activePackVersionId&&v.id!==version.id);versions.splice(at,1);}
     return {...r,packVersions:versions,activePackVersionId:version.id,reaRuns:r.reaRuns?.filter(run=>!run.executor||run.executor==='rea'||run.status!=='completed'||versions.some(v=>v.id===run.packVersionId))};
    }),{expectedRevision:input.expectedRevision});
    return {state,versionId:version.id};
   });
  }),
  async close(){if(closed)return;await queue;if(closed)return;closed=true;await runtime?.client?.close();runtime=null;db.close();},
 };
}
