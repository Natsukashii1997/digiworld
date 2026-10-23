import test from 'node:test';
import assert from 'node:assert/strict';
import {collectionFixture, syntheticNote} from './collection-fixture.mjs';
import {matchCocktailNote} from '../server/collection/lib/cocktail-grouping.mjs';
import {cocktailCases} from './collection-cocktail-cases.mjs';

const cocktailGroup = {id:'custom:cocktail', kind:'custom', name:'调酒'};
async function addGroup(app, group=cocktailGroup) {
  const desk=await app.api('/desk-workspace');
  return app.api('/desk-workspace',{workspace:{...desk,groups:[...desk.groups,group]},expectedRevision:desk.revision},'PUT');
}
const cocktailNote = (index, extra={}) => syntheticNote(index, {
  title:'莫吉托调酒教程', tags:['调酒','鸡尾酒'], content:'朗姆酒45ml，青柠汁20ml。加入薄荷与冰块，搅拌后倒入苏打水。', ...extra,
});

test('保守规则样本：制作教程可入组，易混主题与缺乏证据的内容全部放弃匹配',()=>{
  const results=cocktailCases.map(input=>({title:input.title,expected:input.expected,actual:Boolean(matchCocktailNote(input))}));
  assert.deepEqual(results.filter(item=>item.expected!==item.actual),[]);
});

test('人工移动后拒绝旧凭据撤销，刷新、重新导入和重新转写不改变人工归属',async()=>{
  const app=await collectionFixture({fetchImpl:async url=>new Response(Buffer.from('synthetic local media'),{headers:{'content-type':String(url).includes('/fixture.mp4')?'video/mp4':'image/png'}})});
  try {
    await addGroup(app);
    await addGroup(app,{id:'custom:manual',kind:'custom',name:'我的配方'});
    const input=cocktailNote(38303,{type:'video',videoUrl:'https://video.xhscdn.com/fixture.mp4'});
    await app.importNote(input);
    const saved=(await app.api('/notes')).notes[0];
    assert.equal(saved.videoStatus,'ready');
    const desk=await app.api('/desk-workspace');
    await app.api('/desk-workspace',{workspace:{...desk,noteGroupMap:{...desk.noteGroupMap,[input.id]:'custom:manual'}},expectedRevision:desk.revision},'PUT');
    assert.equal((await app.api(`/notes/${input.id}/auto-group/${saved.autoGroup.assignmentId}`)).status,'overridden');
    await assert.rejects(app.api(`/notes/${input.id}/auto-group/undo`,{assignmentId:saved.autoGroup.assignmentId}),{status:409});
    await app.importNote(input);
    await app.api(`/notes/${input.id}/reanalyze`,{});
    assert.equal((await app.api('/desk-workspace')).noteGroupMap[input.id],'custom:manual');
    assert.equal((await app.api('/notes')).notes[0].category,'我的配方');
    assert.equal((await app.api('/notes')).notes[0].autoGroup,undefined);
  } finally {await app.close();}
});

test('新收藏在唯一调酒组下明确匹配时直接进组，并返回持久撤销凭据',async()=>{
  const app=await collectionFixture();
  try {
    await addGroup(app);
    const input=cocktailNote(38301);
    assert.equal((await app.importNote(input)).status,'complete');
    const desk=await app.api('/desk-workspace');
    assert.equal(desk.noteGroupMap[input.id],cocktailGroup.id);
    const saved=(await app.api('/notes')).notes.find(note=>note.id===input.id);
    assert.equal(saved.category,'调酒');
    assert.equal(saved.autoGroup.groupId,cocktailGroup.id);
    assert.match(saved.autoGroup.assignmentId,/^[a-f0-9-]{36}$/);
    assert.ok(saved.autoGroup.reason);
    assert.equal((await app.api('/notes')).notes[0].autoGroup.assignmentId,saved.autoGroup.assignmentId);
  } finally {await app.close();}
});

test('撤销回到散卡并可按凭据查询和幂等重试，重新导入不会再次进组',async()=>{
  const app=await collectionFixture();
  try {
    await addGroup(app);
    const input=cocktailNote(38302);
    await app.importNote(input);
    const saved=(await app.api('/notes')).notes[0];
    const path=`/notes/${input.id}/auto-group`;
    const undone=await app.api(path+'/undo',{assignmentId:saved.autoGroup.assignmentId});
    assert.equal(undone.status,'undone');
    assert.equal(undone.workspace.noteGroupMap[input.id],'loose');
    assert.equal(undone.notes[0].category,'方法论');
    assert.equal(undone.notes[0].autoGroup,undefined);
    const status=await app.api(path+'/'+saved.autoGroup.assignmentId);
    assert.equal(status.status,'undone');
    const repeated=await app.api(path+'/undo',{assignmentId:saved.autoGroup.assignmentId});
    assert.equal(repeated.revision,undone.revision);
    await app.importNote({...input,title:'莫吉托鸡尾酒配方教程'});
    assert.equal((await app.api('/desk-workspace')).noteGroupMap[input.id],'loose');
    assert.equal((await app.api('/notes')).notes[0].autoGroup,undefined);
    assert.equal((await app.api('/notes')).notes[0].category,'方法论');
  } finally {await app.close();}
});

test('全部标注样本通过实际导入接口，只有明确制作入组且无付费服务请求',async()=>{
  const urls=[];
  const app=await collectionFixture({fetchImpl:async url=>{urls.push(String(url));assert.ok(String(url).startsWith('https://image.xhscdn.com/'));return new Response(Buffer.from('synthetic image'),{headers:{'content-type':'image/png'}});}});
  try {
    await addGroup(app);
    for(const [index,example] of cocktailCases.entries()) {
      const input=syntheticNote(38400+index,{...example,content:example.content || '',rawContent:example.content || ''});
      assert.equal((await app.importNote(input)).status,'complete');
      assert.equal((await app.api('/desk-workspace')).noteGroupMap[input.id],example.expected?cocktailGroup.id:'loose',example.title);
      assert.equal(Boolean((await app.api('/notes')).notes.find(note=>note.id===input.id).autoGroup),example.expected,example.title);
    }
    assert.equal(urls.length,cocktailCases.length);
  } finally {await app.close();}
});

test('旧收藏不追溯进组，缺少或重名调酒组的新增内容留散卡',async()=>{
  const app=await collectionFixture();
  try {
    const old=cocktailNote(38304);
    await app.importNote(old);
    assert.equal((await app.api('/desk-workspace')).noteGroupMap[old.id],'loose');
    await addGroup(app);
    assert.equal((await app.api('/desk-workspace')).noteGroupMap[old.id],'loose');
    await app.importNote(old);
    assert.equal((await app.api('/desk-workspace')).noteGroupMap[old.id],'loose');
    await addGroup(app,{...cocktailGroup,id:'custom:duplicate'});
    const newer=cocktailNote(38305);await app.importNote(newer);
    assert.equal((await app.api('/desk-workspace')).noteGroupMap[newer.id],'loose');
    assert.equal((await app.api('/notes')).notes.find(note=>note.id===newer.id).autoGroup,undefined);
  } finally {await app.close();}
});

test('人工移出到散卡、分类改动与回收恢复都使旧自动撤销失效',async()=>{
  const app=await collectionFixture();
  try {
    await addGroup(app);
    for(const [index,action] of ['loose','category','recycle'].entries()) {
      const input=cocktailNote(38306+index);await app.importNote(input);
      const saved=(await app.api('/notes')).notes.find(note=>note.id===input.id);
      if(action==='loose') {
        const desk=await app.api('/desk-workspace');
        await app.api('/desk-workspace',{workspace:{...desk,noteGroupMap:{...desk.noteGroupMap,[input.id]:'loose'}},expectedRevision:desk.revision},'PUT');
      } else if(action==='category') {
        await app.api('/notes/categories',{updates:{[input.id]:'我的配方'}},'PATCH');
      } else {
        await app.api('/notes/'+input.id,undefined,'DELETE');
        const recycle=(await app.api('/recycle')).items.find(item=>item.noteId===input.id);
        await app.api('/recycle/'+recycle.recycleId+'/restore',{});
      }
      assert.equal((await app.api(`/notes/${input.id}/auto-group/${saved.autoGroup.assignmentId}`)).status,'overridden');
      await assert.rejects(app.api(`/notes/${input.id}/auto-group/undo`,{assignmentId:saved.autoGroup.assignmentId}),{status:409});
      const before=(await app.api('/desk-workspace')).noteGroupMap[input.id];
      await app.importNote(input);
      assert.equal((await app.api('/desk-workspace')).noteGroupMap[input.id],before);
      assert.equal((await app.api('/notes')).notes.find(note=>note.id===input.id).autoGroup,undefined);
    }
  } finally {await app.close();}
});

test('撤销凭据拒绝伪造与未授权请求，未知结果可跨服务实例查询且GET不写入',async()=>{
  const app=await collectionFixture();
  try {
    await addGroup(app);const input=cocktailNote(38309);await app.importNote(input);
    const saved=(await app.api('/notes')).notes[0];
    const path=`/notes/${input.id}/auto-group/undo`;
    const response=await fetch(app.url+'/api/collection'+path,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({assignmentId:saved.autoGroup.assignmentId})});
    assert.equal(response.status,403);
    const before=await app.api('/desk-workspace');
    await assert.rejects(app.api(path,{assignmentId:crypto.randomUUID()}),{status:409});
    await assert.rejects(app.api(path,{assignmentId:'invalid'}),{status:400});
    const {createCollection}=await import('../server/collection.mjs');
    const restarted=createCollection(app.repository);
    assert.equal((await restarted.notes()).notes[0].autoGroup.assignmentId,saved.autoGroup.assignmentId);
    assert.equal((await restarted.autoGroupStatus(input.id,saved.autoGroup.assignmentId)).status,'active');
    assert.equal((await app.api('/desk-workspace')).revision,before.revision);
  } finally {await app.close();}
});

test('并发重复导入只生成一个自动凭据，人工改组先于导入提交时保留最新归属',async()=>{
  let entered,release;
  const started=new Promise(resolve=>{entered=resolve;});
  const paused=new Promise(resolve=>{release=resolve;});
  let analyzeCount=0;
  const app=await collectionFixture({fetchImpl:async url=>new Response(Buffer.from('synthetic local media'),{headers:{'content-type':String(url).includes('/fixture.mp4')?'video/mp4':'image/png'}}),analyzer:async()=>{analyzeCount++;if(analyzeCount===2){entered();await paused;}return {duration:3,transcriptSegments:[{start:0,duration:2,text:'45ml朗姆酒，加入冰块搅拌'}]};}});
  try {
    await addGroup(app);await addGroup(app,{id:'custom:manual',kind:'custom',name:'我的配方'});
    const input=cocktailNote(38310,{type:'video',videoUrl:'https://video.xhscdn.com/fixture.mp4'});
    await app.importNote(input);
    const first=(await app.api('/notes')).notes[0].autoGroup;
    const operationId=crypto.randomUUID();
    await app.api('/notes/import',{note:input,operationId});
    await started;
    const desk=await app.api('/desk-workspace');
    await app.api('/desk-workspace',{workspace:{...desk,noteGroupMap:{...desk.noteGroupMap,[input.id]:'custom:manual'}},expectedRevision:desk.revision},'PUT');
    release();
    await app.importNote(input,operationId);
    assert.equal((await app.api('/desk-workspace')).noteGroupMap[input.id],'custom:manual');
    assert.equal((await app.api(`/notes/${input.id}/auto-group/${first.assignmentId}`)).status,'overridden');
    const fresh=cocktailNote(38312);
    await Promise.all([app.importNote(fresh),app.importNote(fresh)]);
    const notes=(await app.api('/notes')).notes.filter(note=>note.id===fresh.id);
    assert.equal(notes.length,1);assert.ok(notes[0].autoGroup);
  } finally {release();await app.close();}
});

test('配对插件导入处理期间撤销不写库，结束后可撤销',async()=>{
  let pause=false,entered,release;
  const started=new Promise(resolve=>{entered=resolve;});
  const paused=new Promise(resolve=>{release=resolve;});
  const app=await collectionFixture({fetchImpl:async()=>{if(pause){entered();await paused;}return new Response(Buffer.from('synthetic image'),{headers:{'content-type':'image/png'}});}});
  try {
    await addGroup(app);const input=cocktailNote(38315);await app.importNote(input);
    const saved=(await app.api('/notes')).notes[0];
    const {token}=await app.api('/extension/pair',{});
    pause=true;
    const response=await fetch(app.url+'/api/collection/clip',{method:'POST',headers:{'Content-Type':'application/json','X-Collection-Token':token,Origin:'chrome-extension://'+'a'.repeat(32)},body:JSON.stringify({note:syntheticNote(38316),operationId:crypto.randomUUID()})});
    assert.equal(response.status,200);
    const operation=await response.json();await started;
    const before=await app.api('/desk-workspace');
    await assert.rejects(app.api(`/notes/${input.id}/auto-group/undo`,{assignmentId:saved.autoGroup.assignmentId}),{status:409});
    assert.equal((await app.api('/desk-workspace')).revision,before.revision);
    release();
    for(let i=0;i<200;i++) {
      const status=await fetch(app.url+'/api/collection/clip/status/'+operation.id,{headers:{'X-Collection-Token':token}}).then(r=>r.json());
      if(status.status==='complete')break;
      if(i===199)throw new Error('合成插件导入超时');
      await new Promise(resolve=>setTimeout(resolve,10));
    }
    assert.equal((await app.api(`/notes/${input.id}/auto-group/undo`,{assignmentId:saved.autoGroup.assignmentId})).status,'undone');
  } finally {release();await app.close();}
});
