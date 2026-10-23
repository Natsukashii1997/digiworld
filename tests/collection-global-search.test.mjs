import {readFile,writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import test from 'node:test';
import assert from 'node:assert/strict';
import {collectionFixture,syntheticNote} from './collection-fixture.mjs';

test('收藏统一搜索在鉴权后只读检索本地正文和OCR，返回有限命中信息且排除删除项',async()=>{
 const app=await collectionFixture();
 try{
  const note=syntheticNote(620,{title:'用户访谈材料',content:'预算审批是关键条件'});
  await app.importNote(note);
  const before=await app.readCollection();
  const hit=await app.api('/search?q='+encodeURIComponent('访谈 预算'));
  assert.equal(hit.total,1);assert.equal(hit.hits[0].id,note.id);assert.match(hit.hits[0].where,/标题.*正文/);assert.match(hit.hits[0].snippet,/预算/);
  assert.deepEqual(Object.keys(hit.hits[0]).sort(),['groupName','id','savedAt','snippet','source','title','where'].sort());
  assert.doesNotMatch(JSON.stringify(hit),/signature=|imageUrls|extensionHash|mediaVersion/);
  const ocr=await app.api('/search?q='+encodeURIComponent('像素收藏'));assert.equal(ocr.total,1);assert.match(ocr.hits[0].where,/OCR/);
  assert.equal((await app.readCollection()).revision,before.revision);
  assert.equal((await app.api('/search?q=')).total,0);
  await assert.rejects(app.api('/search?q='+'a'.repeat(301)),{status:400});
  const unauth=await fetch(app.url+'/api/collection/search?q=访谈');assert.equal(unauth.status,403);
  await app.api('/notes/'+note.id,undefined,'DELETE');assert.equal((await app.api('/search?q='+encodeURIComponent('访谈'))).total,0);
 }finally{await app.close();}
});


test('收藏索引读取损坏时明确失败且不修写文件，恢复后可重新查询',async()=>{
 const app=await collectionFixture();
 try{
  await app.importNote(syntheticNote(621));
  const file=join(app.directory,'collection/state.json'),saved=await readFile(file,'utf8'),broken='invalid-fixture';
  await writeFile(file,broken);
  await assert.rejects(app.api('/search?q=合成'));
  assert.equal(await readFile(file,'utf8'),broken);
  await writeFile(file,saved);
  assert.equal((await app.api('/search?q=合成')).total,1);
 }finally{await app.close();}
});
