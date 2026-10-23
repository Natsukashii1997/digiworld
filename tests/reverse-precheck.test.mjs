import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {randomUUID} from 'node:crypto';
import {openRepository} from '../server/repository.mjs';
import {createReverseRunner} from '../server/reverse-runner.mjs';
import {createSpecimen} from '../src/reverse-recipe.js';
import {seed} from '../src/store.js';
const page=(url,id='page-one',title='炉子')=>({target_id:id,type:'page',url,title});
async function setup(options={}){
 const directory=await mkdtemp(join(tmpdir(),'reverse-precheck-')),repository=await openRepository(directory),state=seed();
 const record=createSpecimen({type:'FN',target:{kind:'web',url:'https://example.test/community',feature:'迁移与交接',authorized:true,clues:[]}});state.reverseRecords=[record];await repository.write(state,{initialize:true});
 let aiCalls=0,targets=[page('https://example.test/agents')],calls=[];
 const runner=await createReverseRunner({repository,getVersion:async()=>({version:'6.4.0'}),execute:async(v,args,out)=>{calls.push(args);await writeFile(out,JSON.stringify({normalized_result:{targets}}));},executeAi:async()=>{aiCalls++;return {conclusions:[],unknowns:[],pack:'synthetic'};},...options});
 return {repository,record,runner,calls,get aiCalls(){return aiCalls;},set targets(v){targets=v;},async input(){return {recordId:record.id,requestId:randomUUID(),expectedRevision:(await repository.read()).revision,executor:'codex'};},async close(){await runner.close();await repository.close();await rm(directory,{recursive:true,force:true});}};
}
test('网站不匹配在启动任何AI之前拦截，返回同源候选且不写运行或revision',async()=>{
 const app=await setup();try{const before=await app.repository.read(),r=await app.runner.start(await app.input());assert.equal(r.precheck?.status,'mismatch');assert.equal(r.run,null);assert.equal(r.precheck.candidates[0].url,'https://example.test/agents');assert.equal(app.aiCalls,0);assert.deepEqual(await app.repository.read(),before);}finally{await app.close();}
});

test('免费预检唯一/重复/无同源/连接不可用，匹配计数在10条展示截断前',async()=>{
 const app=await setup();try{
  const before=await app.repository.read();const check=()=>app.runner.precheck({recordId:app.record.id,expectedRevision:before.revision});
  app.targets=[page('https://example.test/community')];assert.equal((await check()).status,'ready');
  app.targets=[page('https://example.test/community','a'),page('https://example.test/community','b')];assert.equal((await check()).status,'multiple');
  app.targets=[page('https://other.test/community')];assert.equal((await check()).status,'unavailable');
  app.targets=Array.from({length:10},(_,i)=>page('https://example.test/p'+i,'p'+i)).concat(page('https://example.test/community','match'));const last=await check();assert.equal(last.status,'ready');assert.equal(last.targetId,'match');assert.equal(last.candidates.length,10);
  app.targets=[page('https://example.test/community','first'),...Array.from({length:10},(_,i)=>page('https://example.test/p'+i,'p'+i)),page('https://example.test/community','last')];assert.equal((await check()).status,'multiple');
  assert.equal(app.aiCalls,0);assert.deepEqual(await app.repository.read(),before);
 }finally{await app.close();}
 const failed=await setup({execute:async()=>{throw Error('connect ECONNREFUSED 127.0.0.1:9222');}});try{const r=await failed.runner.start(await failed.input());assert.equal(r.precheck.status,'unavailable');assert.equal(failed.aiCalls,0);}finally{await failed.close();}
});
test('同源精确匹配不忽略尾斜杠/查询/hash；标题与URL凭据不进入响应',async()=>{
 const app=await setup();try{
  app.targets=[page('https://example.test/community/','slash'),page('https://example.test/community?x=1','query'),page('https://example.test/community#x','hash'),page('https://example.test.evil.test/community','evil'),page('https://user:pass@example.test/private','userinfo'),page('https://example.test/private?token=synthetic-secret','secret'),page('https://example.test/ok','ok','炉子\napi_key=synthetic-secret')];
  const result=await app.runner.start(await app.input());assert.equal(result.precheck.status,'mismatch');assert.equal(result.precheck.candidates.length,4);assert.doesNotMatch(JSON.stringify(result),/synthetic-secret|user:pass|evil\.test/);assert.equal(app.aiCalls,0);
 }finally{await app.close();}
});
test('三执行器共同预检，唯一匹配才启动，预检失败不形成付费记录',async()=>{
 const app=await setup();try{
  for(const executor of ['rea','codex','claude']){const r=await app.runner.start({...await app.input(),executor});assert.equal(r.precheck.status,'mismatch');assert.equal(app.aiCalls,0);}
  app.targets=[page('https://example.test/community')];const r=await app.runner.start(await app.input());assert.equal(r.run.status,'running');assert.equal(app.aiCalls,1);
 }finally{await app.close();}
});
test('预检15秒预算覆盖版本检查，关闭与并发互斥且释放锁',async()=>{
 const app=await setup({precheckTimeoutMs:25,getVersion:({signal})=>new Promise((resolve,reject)=>signal.addEventListener('abort',()=>reject(signal.reason),{once:true}))});
 try{const pending=app.runner.start(await app.input());await new Promise(r=>setTimeout(r,5));await assert.rejects(app.runner.precheck({recordId:app.record.id,expectedRevision:(await app.repository.read()).revision}),/已有取证/);const result=await pending;assert.equal(result.precheck.status,'unavailable');assert.match(result.precheck.message,/15秒/);assert.equal(app.runner.busy,false);assert.equal(app.aiCalls,0);}finally{await app.close();}
 const closing=await setup({getVersion:({signal})=>new Promise((resolve,reject)=>signal.addEventListener('abort',()=>reject(signal.reason),{once:true}))});try{const pending=closing.runner.start(await closing.input());await new Promise(r=>setTimeout(r,5));const rejected=assert.rejects(pending,/服务关闭/);await closing.runner.close();await rejected;assert.equal(closing.aiCalls,0);}finally{await closing.close();}
});
test('预检期间revision变化不能启动AI',async()=>{
 let app;app=await setup({execute:async(v,args,out)=>{const state=await app.repository.read();state.reverseRecords[0].material.target.url='https://example.test/other';await app.repository.write(state);await writeFile(out,JSON.stringify({normalized_result:{targets:[page('https://example.test/community')]}}));}});
 try{await assert.rejects(app.runner.start(await app.input()),/预检期间变化/);assert.equal(app.aiCalls,0);assert.equal(app.runner.busy,false);}finally{await app.close();}
});

test('创建目录后revision冲突不遗留死请求，同ID安全重试且AI只调用一次',async()=>{
 const app=await setup();try{
  app.targets=[page('https://example.test/community')];const input=await app.input(),update=app.repository.updateReverse.bind(app.repository);let first=true;
  app.repository.updateReverse=async(...args)=>{if(first){first=false;const state=await app.repository.read();state.reverseRecords[0].why='合成并发更新';await app.repository.write(state);}return update(...args);};
  await assert.rejects(app.runner.start(input),/变化/);assert.equal((await app.runner.query({recordId:app.record.id,runId:input.requestId})).run,null);assert.equal(app.aiCalls,0);
  const retry=await app.runner.start({...input,expectedRevision:(await app.repository.read()).revision});assert.equal(retry.run.id,input.requestId);assert.equal(app.aiCalls,1);assert.equal((await app.runner.start(input)).reused,true);assert.equal(app.aiCalls,1);
 }finally{await app.close();}
});
