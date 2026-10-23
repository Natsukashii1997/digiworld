import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,readdir,mkdtemp,mkdir,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {createCoverRepair} from '../server/collection/cover-repair.mjs';
import {collectionFixture,syntheticNote} from './collection-fixture.mjs';

const picture=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC0lEQVR42mP8/x8AAwMCAO+/5m8AAAAASUVORK5CYII=','base64');
test('图片失败保留具体HTTP原因且不泄露签名',async()=>{
  const app=await collectionFixture({fetchImpl:async()=>new Response('',{status:403})});
  try {await app.importNote(syntheticNote(41));const n=(await app.api('/notes')).notes[0];assert.match(n.mediaError,/403/);assert.ok(!n.mediaError.includes('private-fixture'));}
  finally {await app.close();}
});

for (const mode of ['committed','uncommitted','unknown','trashed']) test(`封面提交异常恢复：${mode}`,async()=>{
  const root=await mkdtemp(join(tmpdir(),'cover-recovery-')),id='4'.repeat(24),version='a'.repeat(32);
  const directory=join(root,'versions',version,'media',id);await mkdir(directory,{recursive:true});
  let state={revision:1,notes:[{id,mediaVersion:version,type:'video',videoStatus:'ready',videoUrl:'/existing/video.mp4',imageUrls:[],sourceImageUrls:['https://image.xhscdn.com/old.jpg']}]},uncertain=false;
  const busyVersions=new Set();
  const repair=createCoverRepair({root,busyVersions,guard:async()=>{},serialized:fn=>fn(),publicNote:n=>n,
    read:async()=>{if(uncertain)throw new Error('read unavailable');return state;},
    write:async value=>{if(mode!=='uncommitted')state={...value,revision:2};if(mode==='unknown')uncertain=true;if(mode==='trashed')state={...state,notes:[],trash:[{...state.notes[0],deletedAt:'synthetic'}]};throw new Error('commit acknowledgement lost');},
    fetchImpl:async()=>new Response(picture,{headers:{'content-type':'image/png'}}),ocrRunner:async paths=>paths.map(path=>({path,text:''}))});
  try {
    const task=repair(id,{expectedMediaVersion:version,imageUrl:'https://image.xhscdn.com/fresh.png'});
    if(mode==='committed')assert.equal((await task).note.mediaStatus,'ready');
    else await assert.rejects(task,mode==='unknown'?/结果待核对/:/acknowledgement lost/);
    assert.equal((await readdir(directory)).length,mode==='uncommitted'?0:1);
    assert.equal(busyVersions.size,0);assert.equal((await readdir(root)).filter(x=>x.startsWith('.cover-')).length,0);
  } finally {await rm(root,{recursive:true,force:true});}
});

test('只修单个缺失封面，保持视频、文稿、分组和其他笔记；失败与冲突不写入',async()=>{
  let imageWorks=false,analyzed=0,videoDownloads=0;
  const app=await collectionFixture({fetchImpl:async url=>{
    if(String(url).includes('video.')) {videoDownloads++;return new Response(Buffer.from('unchanged-video'),{headers:{'content-type':'video/mp4'}});}
    return imageWorks?new Response(picture,{headers:{'content-type':'image/png'}}):new Response('',{status:403});
  },analyzer:async()=>{analyzed++;return {duration:39,transcriptSegments:[{start:0,duration:39,text:'不可重做或覆盖的文稿'}]};}});
  try {
    const input=syntheticNote(42,{type:'video',videoUrl:'https://video.xhscdn.com/original.mp4'});
    await app.importNote(input);await app.api('/notes/manual',{url:'https://fixture.invalid/untouched',title:'其他收藏'});
    const before=await app.readCollection(),note=before.notes.find(n=>n.id===input.id);
    const data={expectedMediaVersion:note.mediaVersion,imageUrl:'https://image.xhscdn.com/fresh.png?signature=FRESH_SECRET'};
    const videoPath=join(app.directory,'collection/versions',note.mediaVersion,'media',note.id,'video.mp4');
    const videoBefore=await readFile(videoPath),statePath=join(app.directory,'collection/state.json');
    const stateBefore=await readFile(statePath,'utf8');
    await assert.rejects(app.api('/notes/'+note.id+'/repair-cover',data),{status:502});
    assert.equal(await readFile(statePath,'utf8'),stateBefore);
    imageWorks=true;
    await assert.rejects(app.api('/notes/'+note.id+'/repair-cover',{...data,expectedMediaVersion:'0'.repeat(32)}),{status:409});
    await assert.rejects(app.api('/notes/'+note.id+'/repair-cover',{...data,imageUrl:'https://evil.invalid/a.jpg'}),{status:400});
    const repaired=(await app.api('/notes/'+note.id+'/repair-cover',data)).note;
    assert.equal(repaired.mediaStatus,'ready');assert.equal(repaired.mediaError,'');assert.ok(repaired.coverUrl);
    const imageFields=new Set(['coverUrl','imageUrls','sourceImageUrls','imageOcr','ocrText','mediaStatus','mediaError']);
    const rest=n=>Object.fromEntries(Object.entries(n).filter(([key])=>!imageFields.has(key)));
    const after=await app.readCollection(),stored=after.notes.find(n=>n.id===note.id);
    assert.deepEqual(rest(stored),rest(note));assert.deepEqual(after.desk,before.desk);
    assert.deepEqual(after.notes.filter(n=>n.id!==note.id),before.notes.filter(n=>n.id!==note.id));
    assert.deepEqual(await readFile(videoPath),videoBefore);assert.equal(analyzed,1);assert.equal(videoDownloads,1);
    assert.equal((await fetch(app.url+repaired.coverUrl)).status,200);
    assert.ok(!JSON.stringify(after).includes('FRESH_SECRET'));
    await assert.rejects(app.api('/notes/'+note.id+'/repair-cover',data),{status:409});
    assert.equal((await readdir(join(app.directory,'collection'))).filter(x=>x.startsWith('.cover-')).length,0);
  } finally {await app.close();}
});
