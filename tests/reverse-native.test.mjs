import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {createReverseNative} from '../server/reverse-native.mjs';

async function fixture(t) {
 const directory=await mkdtemp(join(tmpdir(),'reverse-native-'));t.after(()=>rm(directory,{recursive:true,force:true}));
 let state={revision:1,reverseRecords:[{id:'r1',type:'FN',title:'合成目标',material:{target:{kind:'electron',path:directory,feature:'分析',authorized:true,clues:[]}}}]};
 const repository={directory,read:async()=>structuredClone(state),updateReverse:async(fn)=>{state={...state,revision:state.revision+1,reverseRecords:await fn(structuredClone(state.reverseRecords))};return structuredClone(state);}};
 let channel;const channels=[],calls=[];let failTurn=false,failConnect=false,failTools=false,earlyCompletion=false,readEvent,history;
 const connect=async options=>{if(failConnect){failConnect=false;throw Error('handshake failed');}channel=options;channels.push(options);return {
  identity:{userAgent:'Codex Desktop/test'},connected:true,
  request:async(method,params)=>{
   calls.push({method,params});
   if(method==='config/read')return {config:{model:'same-model',model_reasoning_effort:'ultra',approval_policy:'on-request',sandbox_mode:'workspace-write',secret:'NEVER_EXPOSE'}};
   if(method==='model/list')return {data:[{model:'same-model',supportedReasoningEfforts:[{reasoningEffort:'ultra'}]}]};
   if(method==='skills/list')return {data:[{skills:[{name:'reverse-engineer-anything',path:'/skill/SKILL.md',enabled:true}]}]};
   if(method==='mcpServerStatus/list'){if(failTools){failTools=false;throw Error('tool query lost');}return {data:[{name:'rea',tools:{open_binary:{inputSchema:{type:'object'}},decompile_function:{inputSchema:{type:'object'}}}}]};}
   if(method==='thread/start'||method==='thread/resume')return {thread:{id:'thread-1',turns:[]},model:'same-model',reasoningEffort:'ultra',cwd:directory,approvalPolicy:'on-request',sandbox:{type:'workspaceWrite'},instructionSources:['/rules/AGENTS.md']};
   if(method==='thread/read'){const response=readEvent?.(params);return response||{thread:{id:params.threadId,turns:[{id:'old-turn',status:'completed',items:[]}]}};}
   if(method==='thread/turns/list'||method==='thread/items/list')return history?history(method,params):{data:[{id:'old-turn',status:'completed',items:[]}]};
   if(method==='turn/start'){if(failTurn)throw Error('connection lost');if(earlyCompletion)channel.onMessage({method:'turn/completed',params:{threadId:'thread-1',turn:{id:'turn-1',status:'completed',items:[]}}});return {turn:{id:'turn-1',status:'inProgress',items:[]}};}
   if(method==='turn/interrupt')return {};
  },respond:(id,result)=>calls.push({id,result}),reject:(id,message)=>calls.push({id,error:message}),close:async()=>{},
 }};
 const make=()=>createReverseNative({repository,connect,defaultCwd:directory});
 return {directory,repository,calls,channels,make,emit:m=>channel.onMessage(m),disconnect:()=>channel.onDisconnect(Error('lost')),failTurn:()=>{failTurn=true;},failConnect:()=>{failConnect=true;},failTools:()=>{failTools=true;},earlyCompletion:()=>{earlyCompletion=true;},duringRead:fn=>{readEvent=fn;},history:fn=>{history=fn;}};
}

test('native session inherits original settings, invokes REA skill with unrestricted tools, resumes and archives selected Markdown',async t=>{
 const f=await fixture(t),service=await f.make();t.after(()=>service.close());
 const s=await service.start({recordId:'r1',operationId:'start-1',expectedRevision:1,cwd:f.directory});
 assert.equal(s.session.settings.model,'same-model');
 assert.equal(s.session.capabilities.toolNames.includes('open_binary'),true);
 assert.equal(JSON.stringify(s).includes('NEVER_EXPOSE'),false);
 const start=f.calls.find(c=>c.method==='thread/start').params;
 assert.equal(start.baseInstructions,undefined);assert.equal(start.config,undefined);assert.equal(start.sandbox,undefined);
 await service.turn({recordId:'r1',sessionId:s.session.id,operationId:'ask-1',text:'分析这个本机程序'});
 const turn=f.calls.find(c=>c.method==='turn/start').params;
 assert.equal(turn.outputSchema,undefined);assert.equal(turn.input[1].type,'skill');
 f.emit({method:'item/completed',params:{threadId:'thread-1',turnId:'turn-1',item:{id:'answer-1',type:'agentMessage',text:'# 分析\n普通 Markdown，不是 JSON。'}}});
 f.emit({method:'turn/completed',params:{threadId:'thread-1',turn:{id:'turn-1',status:'completed',items:[{id:'answer-1',type:'agentMessage',text:'# 分析\n普通 Markdown，不是 JSON。'}]}}});
 const q=await service.query({recordId:'r1'});
 assert.equal(q.session.status,'idle');assert.match(q.items.at(-1).text,/普通 Markdown/);
 await service.archive({recordId:'r1',sessionId:s.session.id,operationId:'pack-1',itemId:'answer-1',expectedRevision:1});
 const state=await f.repository.read();assert.equal(state.reverseRecords[0].packVersions[0].nativeSource.threadId,'thread-1');
 assert.equal(state.reverseRecords[0].packVersions[0].result.pack,'# 分析\n普通 Markdown，不是 JSON。');
});

test('early completion is not overwritten by a late start response',async t=>{
 const f=await fixture(t),service=await f.make();t.after(()=>service.close());
 const s=await service.start({recordId:'r1',operationId:'start-1',expectedRevision:1,cwd:f.directory});
 f.earlyCompletion();
 const result=await service.turn({recordId:'r1',sessionId:s.session.id,operationId:'ask-1',text:'finish quickly'});
 assert.equal(result.session.status,'idle');
});

test('handshake failure releases runtime and stale callbacks cannot contaminate reconnected approval state',async t=>{
 const f=await fixture(t),service=await f.make();t.after(()=>service.close());
 f.failConnect();await assert.rejects(service.start({recordId:'r1',operationId:'start-1',expectedRevision:1,cwd:f.directory}));
 assert.equal(service.busy,false);
 const s=await service.start({recordId:'r1',operationId:'start-2',expectedRevision:1,cwd:f.directory});
 const old=f.channels.at(-1);f.disconnect();
 await service.reconnect({recordId:'r1',sessionId:s.session.id});
 old.onMessage({id:7,method:'item/fileChange/requestApproval',params:{threadId:'thread-1',itemId:'old'}});
 old.onDisconnect(Error('old'));
 const q=await service.query({recordId:'r1'});
 assert.equal(q.session.status,'idle');assert.deepEqual(q.session.pending,[]);
});

test('changing the target cannot remove the ability to stop an already running turn',async t=>{
 const f=await fixture(t),service=await f.make();t.after(()=>service.close());
 const s=await service.start({recordId:'r1',operationId:'start-1',expectedRevision:1,cwd:f.directory});
 await service.turn({recordId:'r1',sessionId:s.session.id,operationId:'ask-1',text:'analyze'});
 await f.repository.updateReverse(rs=>rs.map(r=>({...r,deletedAt:new Date().toISOString()})));
 await service.interrupt({recordId:'r1',sessionId:s.session.id,operationId:'stop-1'});
 assert.equal(f.calls.filter(c=>c.method==='turn/interrupt').length,1);
});

test('unknown turn is never replayed after duplicate submit or server restart',async t=>{
 const f=await fixture(t);let service=await f.make();
 const s=await service.start({recordId:'r1',operationId:'start-1',expectedRevision:1,cwd:f.directory});
 f.failTurn();const input={recordId:'r1',sessionId:s.session.id,operationId:'ask-1',text:'do once'};
 await assert.rejects(service.turn(input));
 await assert.rejects(service.turn(input),/未知|核对/);
 await service.close();service=await f.make();t.after(()=>service.close());
 await assert.rejects(service.turn(input),/未知|核对/);
 assert.equal(f.calls.filter(c=>c.method==='turn/start').length,1);
});

test('approval is bound to the current connection and only offered decisions; repeated responses are not sent again',async t=>{
 const f=await fixture(t),service=await f.make();t.after(()=>service.close());
 const s=await service.start({recordId:'r1',operationId:'start-1',expectedRevision:1,cwd:f.directory});
 f.emit({id:7,method:'item/commandExecution/requestApproval',params:{threadId:'thread-1',turnId:'turn-1',itemId:'tool-1',command:'read binary',availableDecisions:['decline','cancel']}});
 const input={recordId:'r1',sessionId:s.session.id,operationId:'approve-1',requestId:7,generation:s.session.generation,result:{decision:'accept'}};
 await assert.rejects(service.respond(input),/选项/);
 await service.respond({...input,result:{decision:'decline'}});
 await service.respond({...input,result:{decision:'decline'}});
 assert.equal(f.calls.filter(c=>c.id===7&&c.result).length,1);
 assert.equal((await service.query({recordId:'r1'})).session.pending[0].submitted,true);
 f.emit({method:'serverRequest/resolved',params:{threadId:'thread-1',requestId:7}});
 assert.equal((await service.query({recordId:'r1'})).session.pending.length,0);
 f.disconnect();
 await assert.rejects(service.respond({...input,operationId:'approve-2'}),/连接|失效/);
});

test('native child approvals are routed without changing parent state; foreign requests get an explicit rejection',async t=>{
 const f=await fixture(t),service=await f.make();t.after(()=>service.close());
 const s=await service.start({recordId:'r1',operationId:'start-1',expectedRevision:1,cwd:f.directory});
 await service.turn({recordId:'r1',sessionId:s.session.id,operationId:'ask-1',text:'analyze'});
 f.emit({method:'thread/started',params:{thread:{id:'child-1',parentThreadId:'thread-1'}}});
 f.emit({method:'turn/started',params:{threadId:'child-1',turn:{id:'child-turn'}}});
 f.emit({id:42,method:'item/fileChange/requestApproval',params:{threadId:'child-1',turnId:'child-turn',itemId:'child-file'}});
 const q=await service.query({recordId:'r1'});assert.equal(q.session.pending[0].params.threadId,'child-1');assert.equal(q.session.turnId,'turn-1');
 await service.respond({recordId:'r1',sessionId:s.session.id,operationId:'child-answer',requestId:42,generation:q.session.generation,result:{decision:'decline'}});
 assert.equal(f.calls.find(c=>c.id===42).result.decision,'decline');
 f.emit({id:43,method:'item/fileChange/requestApproval',params:{threadId:'foreign',turnId:'other'}});
 assert.ok(f.calls.find(c=>c.id===43).error);
 await service.interrupt({recordId:'r1',sessionId:s.session.id,operationId:'stop-tree'});
 assert.deepEqual(f.calls.filter(c=>c.method==='turn/interrupt').map(c=>c.params.threadId),['thread-1','child-1']);
});

test('reconnect preserves newer approvals and running notifications received during history read',async t=>{
 const f=await fixture(t),service=await f.make();t.after(()=>service.close());
 const s=await service.start({recordId:'r1',operationId:'start-1',expectedRevision:1,cwd:f.directory});
 f.duringRead(()=>{
  f.emit({method:'turn/started',params:{threadId:'thread-1',turn:{id:'new-turn'}}});
  f.emit({id:99,method:'item/fileChange/requestApproval',params:{threadId:'thread-1',turnId:'new-turn',grantRoot:'/synthetic/output'}});
 });
 const q=await service.reconnect({recordId:'r1',sessionId:s.session.id});
 assert.equal(q.session.turnId,'new-turn');assert.equal(q.session.status,'running');assert.equal(q.session.pending[0].id,99);
});

test('a completed parent still protects and stops its active children, and reconnect refreshes their history',async t=>{
 const f=await fixture(t),service=await f.make();t.after(()=>service.close());
 const s=await service.start({recordId:'r1',operationId:'start-1',expectedRevision:1,cwd:f.directory});
 f.emit({method:'thread/started',params:{thread:{id:'child-1',parentThreadId:'thread-1'}}});
 f.emit({method:'turn/started',params:{threadId:'child-1',turn:{id:'child-turn'}}});
 await assert.rejects(service.disconnect({recordId:'r1',sessionId:s.session.id}),/停止/);
 await service.interrupt({recordId:'r1',sessionId:s.session.id,operationId:'stop-child'});
 assert.deepEqual(f.calls.filter(c=>c.method==='turn/interrupt').map(c=>c.params.threadId),['child-1']);
 f.disconnect();
 const q=await service.reconnect({recordId:'r1',sessionId:s.session.id});
 assert.equal(q.session.children[0].status,'idle');
 await service.disconnect({recordId:'r1',sessionId:s.session.id});
});

test('nonblocking questions survive turn completion until the native request resolves',async t=>{
 const f=await fixture(t),service=await f.make();t.after(()=>service.close());
 await service.start({recordId:'r1',operationId:'start-1',expectedRevision:1,cwd:f.directory});
 f.emit({id:98,method:'item/tool/requestUserInput',params:{threadId:'thread-1',turnId:'turn-1',isBlocking:false,questions:[]}});
 f.emit({method:'turn/completed',params:{threadId:'thread-1',turn:{id:'turn-1',status:'completed',items:[]}}});
 assert.equal((await service.query({recordId:'r1'})).session.pending[0].id,98);
 f.emit({method:'serverRequest/resolved',params:{threadId:'thread-1',requestId:98}});
 assert.equal((await service.query({recordId:'r1'})).session.pending.length,0);
});

test('a committed pack with lost return is recovered by readback without a second write',async t=>{
 const f=await fixture(t),service=await f.make();t.after(()=>service.close());
 const s=await service.start({recordId:'r1',operationId:'start-1',expectedRevision:1,cwd:f.directory});
 f.emit({method:'item/completed',params:{threadId:'thread-1',turnId:'turn-1',item:{id:'answer-1',type:'agentMessage',text:'固定回复'}}});
 const update=f.repository.updateReverse;let writes=0;
 f.repository.updateReverse=async(...args)=>{writes++;await update(...args);throw Error('response lost after commit');};
 const input={recordId:'r1',sessionId:s.session.id,operationId:'pack-lost',itemId:'answer-1',expectedRevision:1};
 await assert.rejects(service.archive(input));
 const q=await service.query({recordId:'r1',operationId:'pack-lost'});
 assert.equal(q.operation.status,'done');assert.equal(writes,1);
 assert.equal((await f.repository.read()).reverseRecords[0].packVersions.length,1);
});

test('history pagination hydrates full items and cannot overwrite newer completed output',async t=>{
 const f=await fixture(t),service=await f.make();t.after(()=>service.close());
 const s=await service.start({recordId:'r1',operationId:'start-1',expectedRevision:1,cwd:f.directory});
 const answer={id:'answer-1',type:'agentMessage',text:'old'};
 f.emit({method:'item/started',params:{threadId:'thread-1',turnId:'turn-1',item:answer}});
 f.duringRead(()=>f.emit({method:'item/completed',params:{threadId:'thread-1',turnId:'turn-1',item:{...answer,text:'new complete'}}}));
 f.history((method,params)=>{
  if(method==='thread/turns/list')return params.cursor?{data:[{id:'turn-2',status:'completed',itemsView:'notLoaded',items:[]}]}:{data:[{id:'turn-1',status:'inProgress',items:[answer]}],nextCursor:'next-turn'};
  return params.cursor?{data:[{turnId:'turn-2',item:{id:'answer-3',type:'agentMessage',text:'page two'}}]}:{data:[{turnId:'turn-2',item:{id:'answer-2',type:'agentMessage',text:'page one'}}],nextCursor:'next-item'};
 });
 const q=await service.reconnect({recordId:'r1',sessionId:s.session.id});
 assert.equal(q.items[0].text,'new complete');assert.equal(q.items[0]._completed,true);
 assert.deepEqual(q.items.slice(1).map(i=>i.text),['page one','page two']);
 assert.equal(f.calls.filter(c=>c.method==='thread/items/list').length,2);
 await service.close();await service.close();
});

test('recovering a created native thread confirms its lost start operation without creating another thread',async t=>{
 const f=await fixture(t),service=await f.make();t.after(()=>service.close());
 f.failTools();
 await assert.rejects(service.start({recordId:'r1',operationId:'start-lost',expectedRevision:1,cwd:f.directory}));
 const lost=await service.query({recordId:'r1',operationId:'start-lost'});
 assert.equal(lost.operation.status,'unknown');assert.equal(lost.session.threadId,'thread-1');
 await service.reconnect({recordId:'r1',sessionId:lost.session.id});
 assert.equal((await service.query({recordId:'r1',operationId:'start-lost'})).operation.status,'done');
 await service.turn({recordId:'r1',sessionId:lost.session.id,operationId:'continue',text:'继续'});
 assert.equal(f.calls.filter(c=>c.method==='thread/start').length,1);
});

test('parent or child output during child recovery cannot suppress its active status or stop target',async t=>{
 const f=await fixture(t),service=await f.make();t.after(()=>service.close());
 const s=await service.start({recordId:'r1',operationId:'start-1',expectedRevision:1,cwd:f.directory});
 f.emit({method:'thread/started',params:{thread:{id:'child-1',parentThreadId:'thread-1'}}});
 f.duringRead(params=>{
  if(params.threadId!=='child-1')return;
  f.emit({method:'item/agentMessage/delta',params:{threadId:'thread-1',turnId:'turn-1',itemId:'parent-output',delta:'progress'}});
  f.emit({method:'item/agentMessage/delta',params:{threadId:'child-1',turnId:'old-turn',itemId:'child-output',delta:'progress'}});
  return {thread:{id:'child-1',status:{type:'active',activeFlags:[]},turns:[]}};
 });
 const q=await service.reconnect({recordId:'r1',sessionId:s.session.id});
 assert.equal(q.session.children[0].status,'running');
 await service.interrupt({recordId:'r1',sessionId:s.session.id,operationId:'stop-child'});
 assert.equal(f.calls.filter(c=>c.method==='turn/interrupt').at(-1).params.threadId,'child-1');
});
