import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {collectionFixture,syntheticNote} from './collection-fixture.mjs';
import {createMediaWorker} from '../server/collection/media-worker.mjs';

const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const gate=()=>{let open;const opened=new Promise(resolve=>{open=resolve;});return {opened,open};};
const media=url=>new Response(Buffer.from('synthetic media'),{headers:{'content-type':String(url).endsWith('.mp4')?'video/mp4':'image/png'}});
const videoNote=(index,extra={})=>syntheticNote(index,{type:'video',videoUrl:`https://video.xhscdn.com/v${index}.mp4`,...extra});
async function until(read,check,label) {
  for(let i=0;i<300;i++){const value=await read();if(check(value))return value;await sleep(10);}
  assert.fail(label);
}
const noteOf=(app,id)=>async()=>(await app.api('/notes')).notes.find(n=>n.id===id);

test('收藏视频不等转写：下载完即返回 pending、本地视频可播；后台补完变 ready',async()=>{
  const release=gate();let analyzed=0;
  const app=await collectionFixture({fetchImpl:async url=>media(url),analyzer:async()=>{analyzed++;await release.opened;return {duration:4,transcriptSegments:[{start:0,duration:4,text:'后台转写：独有文稿'}]};}});
  try {
    const input=videoNote(401);
    const operation=await app.importNote(input,crypto.randomUUID(),{waitBackground:false});
    assert.equal(operation.status,'complete','转写未放行时收藏也应完成');
    assert.equal(operation.videoStatus,'pending');
    let note=await noteOf(app,input.id)();
    assert.equal(note.videoStatus,'pending');assert.equal(note.transcriptText,'');
    assert.ok(note.videoUrl.startsWith('/collection-media/'));
    assert.equal((await fetch(app.url+note.videoUrl)).status,200,'下载完的本地视频立刻能播');
    await until(async()=>analyzed,count=>count===1,'后台应开始转写');
    release.open();
    note=await until(noteOf(app,input.id),n=>n.videoStatus!=='pending','后台转写应补完');
    assert.equal(note.videoStatus,'ready');assert.equal(note.transcriptText,'后台转写：独有文稿');assert.equal(note.videoDuration,4);
  }finally{release.open();await app.close();}
});

test('后台转写失败：记 partial 和原因，本地视频保留',async()=>{
  const app=await collectionFixture({fetchImpl:async url=>media(url),analyzer:async()=>{throw new Error('本地视频分析组件未安装');}});
  try {
    const input=videoNote(402);
    const operation=await app.importNote(input);
    assert.equal(operation.videoStatus,'partial');
    const note=await noteOf(app,input.id)();
    assert.equal(note.videoStatus,'partial');assert.equal(note.videoError,'本地视频分析组件未安装');assert.ok(note.videoUrl.startsWith('/collection-media/'));
  }finally{await app.close();}
});

test('后台转写期间：重新分析返回正在分析；删除后不复活',async()=>{
  const release=gate();let analyzed=0;
  const app=await collectionFixture({fetchImpl:async url=>media(url),analyzer:async()=>{analyzed++;await release.opened;return {duration:1,transcriptSegments:[{start:0,duration:1,text:'旧文稿'}]};}});
  try {
    const input=videoNote(403);
    await app.importNote(input,crypto.randomUUID(),{waitBackground:false});
    await until(async()=>analyzed,count=>count===1,'后台应开始转写');
    await assert.rejects(app.api('/notes/'+input.id+'/reanalyze',{}),{status:409,message:'视频正在分析中'});
    await app.api('/notes/'+input.id,undefined,'DELETE');
    release.open();
    await sleep(100);
    assert.equal((await app.api('/notes')).notes.length,0);
    assert.equal(analyzed,1);
  }finally{release.open();await app.close();}
});

test('长视频转写不挡图片文字识别',async()=>{
  const release=gate();
  const app=await collectionFixture({fetchImpl:async url=>media(url),analyzer:async()=>{await release.opened;return {duration:1,transcriptSegments:[{start:0,duration:1,text:'视频文稿'}]};},ocrRunner:async paths=>paths.map(path=>({path,text:'图片文字'}))});
  try {
    const video=videoNote(404,{imageUrls:[]}),image=syntheticNote(405);
    await app.importNote(video,crypto.randomUUID(),{waitBackground:false});
    await app.importNote(image,crypto.randomUUID(),{waitBackground:false});
    const done=await until(noteOf(app,image.id),n=>n?.mediaStatus!=='pending','图片识别不应等视频');
    assert.equal(done.ocrText,'图片文字');
    assert.equal((await noteOf(app,video.id)()).videoStatus,'pending');
  }finally{release.open();await app.close();}
});

test('服务重启：启动时接着转写上次没转完的视频，只认同一媒体版本',async()=>{
  const root=await mkdtemp(join(tmpdir(),'video-worker-'));
  try {
    const version='c'.repeat(32),id='3'.repeat(24),dir=join(root,'versions',version,'media',id);
    await mkdir(dir,{recursive:true});await writeFile(join(dir,'video.mp4'),'v');
    let state={revision:1,notes:[
      {id,type:'video',mediaVersion:version,mediaStatus:'none',videoStatus:'pending',videoUrl:`/collection-media/${version}/media/${id}/video.mp4`,transcriptText:'',transcriptSegments:[],videoError:''},
    ]};
    let queue=Promise.resolve();const serialized=op=>{const r=queue.then(op);queue=r.catch(()=>{});return r;};
    const seen=[],busyVersions=new Set();
    const worker=createMediaWorker({root,read:async()=>state,write:async value=>{state={...value,revision:value.revision+1};return state;},serialized,guard:async()=>{},publicNote:note=>note,busyVersions,analyzer:async path=>{seen.push(path);assert.ok(busyVersions.has(version),'转写期间占用媒体版本');return {duration:2,transcriptSegments:[{start:0,duration:2,text:'重启后补上'}]};}});
    worker.start();
    for(let i=0;i<200 && state.notes[0].videoStatus==='pending';i++)await sleep(10);
    await worker.close();
    assert.deepEqual(seen,[join(dir,'video.mp4')]);
    assert.equal(state.notes[0].videoStatus,'ready');assert.equal(state.notes[0].transcriptText,'重启后补上');
    assert.equal(busyVersions.size,0,'转写结束释放媒体版本');
  }finally{await rm(root,{recursive:true,force:true});}
});
