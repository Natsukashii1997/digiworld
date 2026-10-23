import test from 'node:test';
import assert from 'node:assert/strict';
import {createFullBackupRecovery} from '../src/full-backup-recovery.js';
const id='11111111-1111-4111-8111-111111111111';
function setup(call,{storage,root='a'.repeat(64)}={}){const map=new Map();storage ||= {getItem:k=>map.get(k)??null,setItem:(k,v)=>map.set(k,v)};const locks={request:async(_,__,fn)=>fn({})};return {storage,client:createFullBackupRecovery({call,identity:async()=>({dataRootIdentity:root}),storage,locks})};}
test('丢响应后重开只查询原恢复编号，未知不能再提交',async()=>{
 const calls=[];const call=async(path)=>{calls.push(path);if(path.endsWith('/restore'))throw Error('lost');return {operationId:id,status:'unknown'};};
 const a=setup(call);assert.equal((await a.client.begin({operationId:id,token:'preview'})).status,'unknown');
 const b=setup(call,{storage:a.storage});await b.client.resume();await assert.rejects(b.client.begin({operationId:id,token:'again'}),/核对/);assert.equal(calls.filter(p=>p.endsWith('/restore')).length,1);
 const c=setup(async()=>({operationId:id,status:'complete',target:'/fixture/restored',verified:2}),{storage:a.storage});assert.equal((await c.client.resume()).status,'complete');await c.client.acknowledge(id);assert.equal(await c.client.resume(),null);
});
test('本机记录失败不发恢复；明确未开始可解除待核对',async()=>{
 let writes=0;const bad=setup(async()=>{writes++;},{storage:{getItem:()=>null,setItem:()=>{throw Error('quota');}}});await assert.rejects(bad.client.begin({operationId:id,token:'preview'}),/本机/);assert.equal(writes,0);
 const a=setup(async()=>{throw Object.assign(Error('expired'),{operationNotStarted:true});});await assert.rejects(a.client.begin({operationId:id,token:'preview'}),/expired/);assert.equal(await a.client.resume(),null);
});
test('不同数据目录不能认领旧恢复；运行中不能清理记录',async()=>{
 const a=setup(async()=>({operationId:id,status:'processing'}));await a.client.begin({operationId:id,token:'preview'});await assert.rejects(a.client.acknowledge(id),/核对/);
 const b=setup(async()=>{throw Error('should not query');},{storage:a.storage,root:'b'.repeat(64)});assert.equal(await b.client.resume(),null);
});
test('初始化锁竞争后可重新只读查询，不放行新恢复',async()=>{
 let blocked=true,writes=0;const storage={getItem:()=>null,setItem:()=>{}};const client=createFullBackupRecovery({identity:async()=>({dataRootIdentity:'a'.repeat(64)}),storage,locks:{request:async(_,__,fn)=>fn(blocked?null:{})},call:async()=>{writes++;}});
 await assert.rejects(client.resume(),/核对/);blocked=false;assert.equal(await client.resume(),null);assert.equal(writes,0);
});
