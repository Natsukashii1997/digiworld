import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
import {syntheticNote} from './collection-fixture.mjs';
test('Chrome扩展只接收当前小红书，Token不返回网页，固定本机地址，异步查询沿用操作ID',async()=>{
  let listener,access,storage={},requests=[];
  const chrome={runtime:{id:'a'.repeat(32),onMessage:{addListener:value=>listener=value}},storage:{local:{setAccessLevel:async value=>access=value.accessLevel,get:async()=>storage,set:async value=>Object.assign(storage,value)}}};
  const context=vm.createContext({chrome,URL,AbortSignal,JSON,Map,Error,fetch:async(url,options)=>{requests.push({url,options});return new Response(JSON.stringify({status:'processing',id:'1'.repeat(8)+'-1111-1111-1111-'+'1'.repeat(12)}));}});
  vm.runInContext(await readFile('browser-extension/collection/background.js','utf8'),context);
  const id=crypto.randomUUID(),message={type:'IMPORT_NOTE',note:syntheticNote(1),operationId:id},sender={id:chrome.runtime.id,tab:{id:1},frameId:0,url:message.note.sourceUrl};
  const send=(m,s=sender)=>new Promise(resolve=>{assert.equal(listener(m,s,resolve),true);});
  assert.equal(access,'TRUSTED_CONTEXTS');const unpaired=await send(message);assert.equal(unpaired.ok,false);assert.equal(unpaired.operationNotStarted,true);assert.equal(unpaired.statusCode,403);assert.equal(requests.length,0);
  storage.collectionToken='b'.repeat(64);assert.equal((await send(message,{...sender,url:'https://evil.example'})).ok,false);assert.equal(requests.length,0);
  const result=await send(message);assert.equal(result.status,'processing');assert.ok(!JSON.stringify(result).includes(storage.collectionToken));assert.equal(requests[0].url,'http://127.0.0.1:5178/api/collection/clip');assert.equal(JSON.parse(requests[0].options.body).operationId,id);assert.equal(requests[0].options.headers['X-Collection-Token'],storage.collectionToken);
  await send({type:'GET_IMPORT_STATUS',operationId:id});assert.equal(requests[1].url,'http://127.0.0.1:5178/api/collection/clip/status/'+id);
  assert.equal((await send({...message,note:{...message.note,id:'f'.repeat(24)}})).ok,false);
});
