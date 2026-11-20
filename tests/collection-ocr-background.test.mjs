import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {collectionFixture,syntheticNote} from './collection-fixture.mjs';
import {recognizeImages,finishNoteOcr} from '../server/collection/lib/media-import.mjs';
import {createOcrWorker} from '../server/collection/ocr-worker.mjs';
import {noteMatchesQuery} from '../src/collection/scripts/lib/note-search.mjs';

const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const timeoutError=()=>Object.assign(new Error('Command failed: /usr/bin/osascript -l JavaScript /very/long/path.js'),{killed:true,signal:'SIGTERM'});
const gate=()=>{let open;const opened=new Promise(resolve=>{open=resolve;});return {opened,open};};

test('逐张识别：一张超时只影响这一张，其余结果保留，报错写清张号和超时',async()=>{
  const calls=[];
  const runner=async paths=>{calls.push(paths);if(paths[0].endsWith('02.webp'))throw timeoutError();return paths.map(path=>({path,text:` ${path.slice(-7)}文字 `}));};
  const images=['01','02','03'].map(n=>({filePath:`/m/${n}.webp`,imageUrl:`/collection-media/v/media/x/${n}.webp`}));
  const imageOcr=await recognizeImages(images,runner);
  assert.deepEqual(calls,[['/m/01.webp'],['/m/02.webp'],['/m/03.webp']]);
  assert.deepEqual(imageOcr.map(item=>item.text),['01.webp文字','','03.webp文字']);
  assert.equal(imageOcr[1].error,'本地文字识别超时');
  const summary=finishNoteOcr({sourceImageUrls:['a','b','c'],imageUrls:images.map(i=>i.imageUrl),mediaError:''},imageOcr);
  assert.equal(summary.mediaStatus,'partial');
  assert.equal(summary.mediaError,'图片2：本地文字识别超时');
  assert.equal(summary.ocrText,'01.webp文字\n\n03.webp文字');
  assert.ok(!summary.mediaError.includes('osascript'));
});

test('收藏不等OCR：图片存好就返回 pending，后台补完变 ready 且可搜到图片文字',async()=>{
  const release=gate();let started=0;
  const app=await collectionFixture({ocrRunner:async paths=>{started++;await release.opened;return paths.map(path=>({path,text:'后台识别：独有关键词'}));}});
  try {
    const operationId=crypto.randomUUID();
    await app.api('/notes/import',{note:syntheticNote(301),operationId});
    let operation;
    for(let i=0;i<200;i++){operation=await app.api('/operations/'+operationId);if(operation.status!=='processing')break;await sleep(10);}
    assert.equal(operation.status,'complete','OCR 未放行时收藏也应完成');
    assert.equal(operation.mediaStatus,'pending');
    let note=(await app.api('/notes')).notes[0];
    assert.equal(note.mediaStatus,'pending');assert.equal(note.ocrText,'');assert.ok(note.coverUrl.startsWith('/collection-media/'));
    for(let i=0;i<200 && !started;i++)await sleep(10);
    assert.equal(started,1);
    release.open();
    for(let i=0;i<200;i++){note=(await app.api('/notes')).notes[0];if(note.mediaStatus!=='pending')break;await sleep(10);}
    assert.equal(note.mediaStatus,'ready');assert.equal(note.ocrText,'后台识别：独有关键词');assert.equal(note.imageOcr[0].text,'后台识别：独有关键词');
    assert.ok(noteMatchesQuery(note,'独有关键词'));
  }finally{release.open();await app.close();}
});

test('OCR期间删除或重新收藏：旧识别结果不写回、不复活',async()=>{
  const release=gate();
  const app=await collectionFixture({ocrRunner:async paths=>{await release.opened;return paths.map(path=>({path,text:'旧版本文字'}));}});
  try {
    const first=syntheticNote(302),second=syntheticNote(303);
    assert.equal((await app.importNote(first,crypto.randomUUID(),{waitOcr:false})).mediaStatus,'pending');
    assert.equal((await app.importNote(second,crypto.randomUUID(),{waitOcr:false})).mediaStatus,'pending');
    await app.api('/notes/'+first.id,undefined,'DELETE');
    release.open();
    let notes;
    for(let i=0;i<200;i++){notes=(await app.api('/notes')).notes;if(notes.every(n=>n.mediaStatus!=='pending'))break;await sleep(10);}
    assert.deepEqual(notes.map(n=>n.id),[second.id]);
    assert.equal(notes[0].ocrText,'旧版本文字');
  }finally{release.open();await app.close();}
});

test('服务重启：启动时接着识别上次没识别完的收藏，只认同一媒体版本',async()=>{
  const root=await mkdtemp(join(tmpdir(),'ocr-worker-'));
  try {
    const version='a'.repeat(32),id='1'.repeat(24),media=join(root,'versions',version,'media',id);
    await mkdir(media,{recursive:true});await writeFile(join(media,'01.png'),'x');await writeFile(join(media,'02.png'),'y');
    const url=file=>`/collection-media/${version}/media/${id}/${file}`;
    let state={revision:1,notes:[
      {id,mediaVersion:version,mediaStatus:'pending',sourceImageUrls:['s1','s2','s3'],imageUrls:[url('01.png'),url('02.png')],imageOcr:[{imageUrl:url('01.png'),text:'',error:''},{imageUrl:url('02.png'),text:'',error:''}],ocrText:'',mediaError:'1 张图片保存失败；图片3：下载失败'},
      {id:'2'.repeat(24),mediaVersion:'b'.repeat(32),mediaStatus:'ready',imageOcr:[],ocrText:'不动'},
    ]};
    const seen=[];
    let queue=Promise.resolve();const serialized=op=>{const r=queue.then(op);queue=r.catch(()=>{});return r;};
    const worker=createOcrWorker({root,read:async()=>state,write:async value=>{state={...value,revision:value.revision+1};return state;},serialized,guard:async()=>{},publicNote:note=>note,ocrRunner:async paths=>{seen.push(...paths);return paths.map(path=>({path,text:path.endsWith('01.png')?'第一张':'第二张'}));}});
    worker.start();
    for(let i=0;i<200 && state.notes[0].mediaStatus==='pending';i++)await sleep(10);
    await worker.close();
    assert.deepEqual(seen,[join(media,'01.png'),join(media,'02.png')]);
    assert.equal(state.notes[0].mediaStatus,'partial','有一张下载失败仍是 partial');
    assert.equal(state.notes[0].ocrText,'第一张\n\n第二张');
    assert.equal(state.notes[0].mediaError,'1 张图片保存失败；图片3：下载失败');
    assert.equal(state.notes[1].ocrText,'不动');
  }finally{await rm(root,{recursive:true,force:true});}
});

test('图片地址不属于这条收藏的媒体目录时不读文件，记为失败',async()=>{
  const runner=async paths=>paths.map(path=>({path,text:'不应调用'}));
  const imageOcr=await recognizeImages([{filePath:'',imageUrl:'/collection-media/x/../../etc/passwd'}],runner);
  assert.equal(imageOcr[0].text,'');assert.equal(imageOcr[0].error,'图片文件缺失');
});
