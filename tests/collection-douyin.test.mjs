import test from 'node:test';
import assert from 'node:assert/strict';
import {collectionFixture,syntheticNote} from './collection-fixture.mjs';
import {normalizeImportedNote,extractNoteIdFromUrl} from '../server/collection/lib/note-import.mjs';

const aweme='7421234567890123456', id='douyin-'+aweme;
const note={id,sourceUrl:`https://www.douyin.com/user/self?showTab=collection&modal_id=${aweme}`,title:'合成抖音收藏',content:'这是一条合成作品文案。',author:{name:'合成作者'},type:'video',imageUrls:['https://p3-pc-sign.douyinpic.com/fixture.png?signature=private-fixture'],videoUrl:'https://v3.douyinvod.com/fixture.mp4?signature=private-fixture',tags:['测试']};

test('抖音收藏保留平台与规范来源，拒绝来源/ID不匹配和非作品页',()=>{
  const normalized=normalizeImportedNote(note);
  assert.equal(normalized.id,id); assert.equal(normalized.origin,'douyin');
  assert.equal(normalized.sourceUrl,`https://www.douyin.com/video/${aweme}`);
  assert.equal(extractNoteIdFromUrl(`https://www.douyin.com/note/${aweme}`),id);
  assert.throws(()=>normalizeImportedNote({...note,id:'douyin-7421234567890123457'}),/不匹配/);
  assert.throws(()=>normalizeImportedNote({...note,sourceUrl:'https://www.douyin.com/user/self'}),/作品/);
  assert.throws(()=>normalizeImportedNote({...note,sourceUrl:`https://www.douyin.com.evil.example/video/${aweme}`}));
  assert.throws(()=>normalizeImportedNote({...note,imageUrls:Array(21).fill('https://p3.douyinpic.com/fixture.png')}),/超过20张/);
});

test('抖音导入和小红书共存，图片视频本地回读、去重更新保留手动分类',async()=>{
  const requests=[], bytes=Buffer.from('synthetic video bytes');
  const app=await collectionFixture({fetchImpl:async(url,options)=>{
    requests.push({url:String(url),referer:options.headers.Referer});
    assert.ok(/\.(douyinpic|douyinvod|xhscdn)\.com\//.test(String(url)));
    return new Response(bytes,{headers:{'content-type':String(url).includes('.mp4')?'video/mp4':'image/png'}});
  }});
  try {
    assert.equal((await app.importNote(syntheticNote(1))).status,'complete');
    const operationId=crypto.randomUUID();assert.equal((await app.importNote(note,operationId)).status,'complete');
    assert.equal((await app.importNote(note,operationId)).created,true);
    let stored=(await app.api('/notes')).notes.find(n=>n.id===id);
    assert.equal(stored.origin,'douyin');assert.equal(stored.videoStatus,'ready');
    assert.equal((await fetch(app.url+stored.coverUrl)).status,200);
    const range=await fetch(app.url+stored.videoUrl,{headers:{Range:'bytes=0-3'}});assert.equal(range.status,206);
    assert.ok(!JSON.stringify(stored).includes('private-fixture'));
    assert.ok(requests.filter(r=>r.url.includes('douyin')).every(r=>r.referer==='https://www.douyin.com/'));
    await app.api('/notes/categories',{updates:{[id]:'人工分组'}},'PATCH');
    assert.equal((await app.importNote({...note,title:'更新作品'})).created,false);
    stored=(await app.api('/notes')).notes.find(n=>n.id===id);
    assert.equal(stored.category,'人工分组');assert.equal((await app.api('/notes')).notes.length,2);
    assert.equal((await app.api('/notes/'+id+'/reanalyze',{})).notes.find(n=>n.id===id).videoStatus,'ready');
    await app.api('/notes/'+id,undefined,'DELETE');
    assert.equal((await app.api('/notes')).notes.length,1);
    assert.equal((await fetch(app.url+stored.videoUrl)).status,404);
  }finally{await app.close();}
});

test('抖音链接缺正文明确引导插件，越域媒体跳转不得请求，视频失败如实保存部分结果',async()=>{
  const requests=[];
  const app=await collectionFixture({fetchImpl:async url=>{requests.push(String(url));return new Response('',{status:302,headers:{location:'https://127.0.0.1/private'}});}});
  try {
    const operationId=crypto.randomUUID();await app.api('/notes/import',{input:note.sourceUrl,operationId});
    let result;for(let i=0;i<100;i++){result=await app.api('/operations/'+operationId);if(result.status!=='processing')break;await new Promise(r=>setTimeout(r,10));}
    assert.equal(result.status,'failed');assert.match(result.error,/抖音.*插件/);assert.equal(requests.length,0);
    const partial=await app.importNote(note);assert.equal(partial.status,'complete');assert.equal(partial.videoStatus,'partial');
    assert.ok(requests.every(url=>url.includes('douyin')));assert.equal((await app.api('/notes')).notes[0].videoUrl,'');
  }finally{await app.close();}
});
