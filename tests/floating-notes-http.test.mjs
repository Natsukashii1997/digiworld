import test from 'node:test';
import assert from 'node:assert/strict';
import { fixture } from './fixture.mjs';
import { seed } from '../src/store.js';
const AT='2026-10-15T08:00:00.000Z';
async function setup(){
 const app=await fixture(); await app.repository.write({...seed(),notes:[]},{initialize:true});
 const {token}=await (await fetch(app.url+'/api/session',{headers:{'X-Workbench-Client':'1'}})).json();
 const api=async(path,data,method=data===undefined?'GET':'PUT')=>{
  const r=await fetch(app.url+'/api'+path,{method,headers:{'X-Workbench-Token':token,...(data===undefined?{}:{'Content-Type':'application/json'})},...(data===undefined?{}:{body:JSON.stringify(data)})});
  return {status:r.status,value:await r.json()};
 };return {...app,api};
}
test('单条便签创建后可查询；同ID同内容重放不会新增或推进版本',async()=>{
 const app=await setup();try{
  const input={id:'note-one',text:'第一条合成便签',at:AT,format:'md1',base:null};
  const created=await app.api('/notes/note-one',input);assert.equal(created.status,200);
  assert.equal(created.value.note.text,input.text);
  const replay=await app.api('/notes/note-one',input);assert.equal(replay.status,200);
  assert.equal(replay.value.revision,created.value.revision);
  const list=await app.api('/notes');assert.equal(list.value.notes.length,1);
  assert.deepEqual((await app.api('/notes/note-one')).value.note,created.value.note);
 }finally{await app.close();}
});
test('同条不同正文及过期编辑起点冲突，当前版本回传且主库不变',async()=>{
 const app=await setup();try{
  const input={id:'same',text:'起点',at:AT,format:'md1',base:null};await app.api('/notes/same',input);
  const conflict=await app.api('/notes/same',{...input,text:'另一个创建'});assert.equal(conflict.status,409);assert.equal(conflict.value.currentNote.text,'起点');
  const edit=await app.api('/notes/same',{...input,text:'别处改过',base:{text:'起点',format:'md1'}});assert.equal(edit.status,200);
  const stale=await app.api('/notes/same',{...input,text:'我的旧草稿',base:{text:'起点',format:'md1'}});assert.equal(stale.status,409);assert.equal(stale.value.currentNote.text,'别处改过');
  assert.equal((await app.api('/notes/same')).value.note.text,'别处改过');
  const replay=await app.api('/notes/same',{...input,text:'别处改过',base:{text:'起点',format:'md1'}});assert.equal(replay.status,200);assert.equal(replay.value.revision,edit.value.revision);
 }finally{await app.close();}
});
test('单条更新保留at与refined、不影响别条；删除必须携带原内容',async()=>{
 const app=await setup();try{
  const state=await app.repository.read();state.notes=[{id:'one',at:AT,text:'原内容',format:'md1',refined:{scrollId:'s',entryId:'e',at:AT}},{id:'two',at:AT,text:'另一条'}];await app.repository.write(state);
  const result=await app.api('/notes/one',{id:'one',text:'修改',format:'md1',at:'2026-10-16T00:00:00Z',base:{text:'原内容',format:'md1'}});assert.equal(result.status,200);assert.equal(result.value.note.at,AT);assert.deepEqual(result.value.note.refined,{scrollId:'s',entryId:'e',at:AT});
  assert.equal((await app.api('/notes/two')).value.note.text,'另一条');
  assert.equal((await app.api('/notes/one',undefined,'DELETE')).status,400);
 }finally{await app.close();}
});
test('空白、上限、控制字符、未知字段、错误ID和格式拒绝；不存在的编辑不变成新建',async()=>{
 const app=await setup();try{
  const input={id:'valid',text:'文字',at:AT,format:'md1',base:null};
  for(const value of [null,false,0,''])assert.equal((await app.api('/notes/valid',value)).status,400);
  for(const patch of [{text:'   '},{text:'字'.repeat(20001)},{text:'x\u0001'},{format:'html'},{refined:{}},{base:{}},{id:'other'}])assert.equal((await app.api('/notes/valid',{...input,...patch})).status,400,JSON.stringify(patch).slice(0,80));
  assert.equal((await app.api('/notes/%25',{...input,id:'%'})).status,400);
  assert.equal((await app.api('/notes/valid',{...input,base:{text:'deleted',format:'md1'}})).status,409);
  assert.equal((await app.api('/notes')).value.notes.length,0);
  assert.equal((await app.api('/notes/valid',{...input,text:'字'.repeat(20000)})).status,200);
 }finally{await app.close();}
});
test('并发相同新建只落一条，不放宽同源和会话鉴权',async()=>{
 const app=await setup();try{
  const input={id:'parallel',text:'合成并发',at:AT,format:'md1',base:null};
  const results=await Promise.all([app.api('/notes/parallel',input),app.api('/notes/parallel',input)]);assert.ok(results.every(r=>r.status===200));assert.equal(results[0].value.revision,results[1].value.revision);
  assert.equal((await app.api('/notes')).value.notes.length,1);
  assert.equal((await fetch(app.url+'/api/notes')).status,403);
  assert.equal((await fetch(app.url+'/api/notes',{headers:{Origin:'https://example.test'}})).status,403);
 }finally{await app.close();}
});

 test('条件删除只删除相同版本，重复回读不推进revision，过期起点不误删',async()=>{
 const app=await setup();try{
  const state=await app.repository.read();state.notes=[{id:'remove',at:AT,text:'起点',type:'todo',title:'标题',format:'md1'},{id:'keep',at:AT,text:'保留'}];await app.repository.write(state);
  const stale=await app.api('/notes/remove',{base:{text:'起点',type:'todo',title:'旧标题',format:'md1'}},'DELETE');assert.equal(stale.status,409);
  assert.equal((await app.api('/notes')).value.notes.length,2);
  const result=await app.api('/notes/remove',{base:{text:'起点',type:'todo',title:'标题',format:'md1'}},'DELETE');assert.equal(result.status,200);assert.equal(result.value.note,null);
  assert.equal((await app.api('/notes/keep')).value.note.text,'保留');
  const again=await app.api('/notes/remove',{base:{text:'起点'}},'DELETE');assert.equal(again.value.revision,result.value.revision);
 }finally{await app.close();}
 });
