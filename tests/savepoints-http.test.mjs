import test from 'node:test';
import assert from 'node:assert/strict';
import {fixture} from './fixture.mjs';
import {seed} from '../src/store.js';
test('savepoint HTTP boundary requires local session and exact POST route',async()=>{
 const calls=[],service=Object.fromEntries(['inspect','detail','compare','handoff','preview','confirm','query','pending'].map(action=>[action,async input=>{calls.push({action,input});return {state:'synthetic',action};}]));
 const app=await fixture({discovery:{savepointsService:service}});try{
  await app.repository.write(seed(),{initialize:true});
  const session=await(await fetch(app.url+'/api/session',{headers:{'x-workbench-client':'1'}})).json();
  const call=(action,{token=session.token,method='POST',origin=app.url,body='{}'}={})=>fetch(app.url+'/api/savepoints/'+action,{method,headers:{'x-workbench-token':token,'content-type':'application/json',origin},...(method==='POST'?{body}:{})});
  assert.equal((await call('confirm',{token:'wrong'})).status,403);
  assert.equal((await call('confirm',{origin:'https://outside.invalid'})).status,403);
  assert.equal((await call('confirm',{method:'GET'})).status,404);
  assert.equal((await call('push')).status,404);
  assert.equal((await call('confirm',{body:'not JSON'})).status,400);
  assert.deepEqual(calls,[]);
  for(const action of ['inspect','detail','compare','handoff','preview','confirm','query','pending'])assert.equal((await call(action)).status,200);
  assert.deepEqual(calls.map(c=>c.action),['inspect','detail','compare','handoff','preview','confirm','query','pending']);
 }finally{await app.close();}
});
