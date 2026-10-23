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

test('抖音扩展消息绑定顶层当前作品，来源伪装及跨作品拒绝',async()=>{
  let listener,requests=[];
  const chrome={runtime:{id:'a'.repeat(32),onMessage:{addListener:value=>listener=value}},storage:{local:{setAccessLevel:async()=>{},get:async()=>({collectionToken:'b'.repeat(64)}),set:async()=>{}}}};
  const context=vm.createContext({chrome,URL,AbortSignal,JSON,Map,Error,fetch:async(url,options)=>{requests.push({url,options});return new Response(JSON.stringify({status:'processing'}));}});
  vm.runInContext(await readFile('browser-extension/collection/background.js','utf8'),context);
  const sourceId='7421234567890123456', note={id:'douyin-'+sourceId,sourceUrl:`https://www.douyin.com/video/${sourceId}`,title:'合成抖音'},operationId=crypto.randomUUID();
  const sender={id:chrome.runtime.id,frameId:0,tab:{id:1},url:`https://www.douyin.com/user/self?modal_id=${sourceId}`};
  const send=(n=note,s=sender)=>new Promise(resolve=>listener({type:'IMPORT_NOTE',note:n,operationId},s,resolve));
  assert.equal((await send()).ok,true);assert.equal(requests.length,1);
  for(const url of ['https://www.douyin.com/user/self',`https://www.douyin.com/video/7421234567890123457`,`https://www.douyin.com.evil.example/video/${sourceId}`])assert.equal((await send(note,{...sender,url})).ok,false);
  assert.equal((await send(note,{...sender,frameId:1})).ok,false);
  assert.equal((await send(syntheticNote(1))).ok,false);
  assert.equal((await send({...note,sourceUrl:`https://u:p@www.douyin.com/video/${sourceId}`})).ok,false);
  assert.equal(requests.length,1);
});

test('GET模式跨刷新复用未确认操作，普通模式独立且拒绝未知模式',async()=>{
 let listener;const storage={collectionToken:'b'.repeat(64)},requests=[];
 const chrome={runtime:{id:'a'.repeat(32),onMessage:{addListener:x=>listener=x}},storage:{local:{setAccessLevel:async()=>{},get:async()=>storage,set:async value=>Object.assign(storage,value)}}};
 vm.runInContext(await readFile('browser-extension/collection/background.js','utf8'),vm.createContext({chrome,URL,AbortSignal,JSON,Map,Error,fetch:async(url,options)=>{requests.push({url,options});if(url.endsWith('/capabilities'))return new Response(JSON.stringify({getAnalysis:true}));return new Response(JSON.stringify({status:'processing',id:options.body?JSON.parse(options.body).operationId:url.split('/').pop()}));}}));
 const note=syntheticNote(932),sender={id:chrome.runtime.id,tab:{id:1},frameId:0,url:note.sourceUrl};
 const send=mode=>new Promise(resolve=>listener({type:'IMPORT_NOTE',note,mode,operationId:crypto.randomUUID()},sender,resolve));
 const first=await send('get'),again=await send('get');assert.equal(first.id,again.id);assert.equal(requests.filter(x=>x.options.method==='POST').length,1);assert.equal(JSON.parse(requests.find(x=>x.options.method==='POST').options.body).mode,'get');
 await send('direct');assert.equal(requests.filter(x=>x.options.method==='POST').length,2);
 assert.equal((await send('untrusted')).ok,false);
});

test('旧后端不支持GET时，在本地POST前明确拒绝GET动作',async()=>{
 let listener;const storage={collectionToken:'b'.repeat(64)},requests=[];
 const chrome={runtime:{id:'a'.repeat(32),onMessage:{addListener:x=>listener=x}},storage:{local:{setAccessLevel:async()=>{},get:async()=>storage,set:async value=>Object.assign(storage,value)}}};
 vm.runInContext(await readFile('browser-extension/collection/background.js','utf8'),vm.createContext({chrome,URL,AbortSignal,JSON,Map,Error,fetch:async(url,options)=>{requests.push({url,options});return new Response(JSON.stringify({error:'旧版无此接口'}),{status:404});}}));
 const note=syntheticNote(933),sender={id:chrome.runtime.id,tab:{id:1},frameId:0,url:note.sourceUrl};
 const result=await new Promise(resolve=>listener({type:'IMPORT_NOTE',note,mode:'get',operationId:crypto.randomUUID()},sender,resolve));assert.equal(result.ok,false);assert.equal(result.operationNotStarted,true);assert.match(result.error,/尚未启用/);assert.equal(requests.filter(x=>x.options.method==='POST').length,0);assert.equal(storage.collectionPending,undefined);
});
