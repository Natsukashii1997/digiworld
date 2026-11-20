import test from 'node:test';
import assert from 'node:assert/strict';
import {fixture} from './fixture.mjs';
import {seed} from '../src/store.js';
test('savepoint HTTP boundary requires local session and exact POST route; preview and confirm are retired (#111)',async()=>{
 const calls=[],service=Object.fromEntries(['inspect','detail','compare','handoff','preview','confirm','query','pending'].map(action=>[action,async input=>{calls.push({action,input});return {state:'synthetic',action};}]));
 const app=await fixture({discovery:{savepointsService:service}});try{
  await app.repository.write(seed(),{initialize:true});
  const session=await(await fetch(app.url+'/api/session',{headers:{'x-workbench-client':'1'}})).json();
  const call=(action,{token=session.token,method='POST',origin=app.url,body='{}'}={})=>fetch(app.url+'/api/savepoints/'+action,{method,headers:{'x-workbench-token':token,'content-type':'application/json',origin},...(method==='POST'?{body}:{})});
  assert.equal((await call('confirm',{token:'wrong'})).status,403);
  assert.equal((await call('confirm',{origin:'https://outside.invalid'})).status,403);
  assert.equal((await call('confirm',{method:'GET'})).status,404);
  assert.equal((await call('push')).status,404);
  assert.equal((await call('inspect',{body:'not JSON'})).status,400);
  assert.deepEqual(calls,[]);
  for(const action of ['inspect','detail','compare','handoff','query','pending'])assert.equal((await call(action)).status,200);
  // 存档点的写入（预览、确认）已下线：回 410，不调用服务。
  for(const action of ['preview','confirm'])assert.equal((await call(action)).status,410);
  assert.deepEqual(calls.map(c=>c.action),['inspect','detail','compare','handoff','query','pending']);
 }finally{await app.close();}
});
