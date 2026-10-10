import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,symlink,mkdir,rm,readdir} from 'node:fs/promises';
import {join} from 'node:path';
import {spawn} from 'node:child_process';
import {collectionFixture,syntheticNote} from './collection-fixture.mjs';
import {boundedResponseBytes} from '../server/collection/lib/bounded-response.mjs';
import {extractNoteIdFromUrl} from '../server/collection/lib/note-import.mjs';
test('收藏异步保存、OCR本地媒体、幂等、重导入保留分类、分组CAS、删除与旧记录清除',async()=>{
  const app=await collectionFixture();try {
    const id=crypto.randomUUID(),note=syntheticNote(1),result=await app.importNote(note,id);assert.equal(result.status,'complete');
    const first=(await app.api('/notes')).notes[0];assert.equal(first.ocrText,'图片识别：独有关键词像素收藏');assert.equal(first.origin,'xiaohongshu');assert.equal(first.mediaStatus,'ready');assert.ok(first.coverUrl.startsWith('/collection-media/'));assert.ok(!JSON.stringify(first).includes('private-fixture'));
    const media=await fetch(app.url+first.coverUrl);assert.equal(media.status,200);assert.ok((await media.arrayBuffer()).byteLength>0);
    assert.equal((await app.importNote(note,id)).created,true);assert.equal((await app.api('/notes')).notes.length,1);
    await assert.rejects(app.api('/notes/import',{note:{...note,title:'different'},operationId:id}),{status:409});
    const desk=await app.api('/desk-workspace');const changed={...desk,groups:[...desk.groups,{id:'custom:test',kind:'custom',name:'我的分组'}],noteGroupMap:{...desk.noteGroupMap,[note.id]:'custom:test'}};
    await app.api('/desk-workspace',{workspace:changed,expectedRevision:desk.revision},'PUT');assert.equal((await app.api('/notes')).notes[0].category,'我的分组');await assert.rejects(app.api('/desk-workspace',{workspace:desk,expectedRevision:desk.revision},'PUT'),{status:409});
    await app.importNote({...note,title:'更新收藏'});const second=(await app.api('/notes')).notes[0];assert.equal(second.category,'我的分组');assert.notEqual(second.mediaVersion,first.mediaVersion);assert.ok(await readFile(join(app.directory,'collection/versions',first.mediaVersion,'media',first.id,'01.png')));
    await app.api('/notes/'+note.id,undefined,'DELETE');assert.equal((await app.api('/notes')).notes.length,0);assert.equal((await fetch(app.url+second.coverUrl)).status,404);
    const workspace=await app.repository.read();await app.api('/legacy/clear',{expectedRevision:workspace.revision});assert.deepEqual((await app.repository.read()).learning,{folders:[],books:[],links:[]});
  }finally{await app.close();}
});
test('配对剪藏只授权导入与状态，撤销生效、来源拒绝',async()=>{
  const app=await collectionFixture();try {
    const token=(await app.api('/extension/pair',{})).token,operationId=crypto.randomUUID();
    const clip=(headers={})=>fetch(app.url+'/api/collection/clip',{method:'POST',headers:{'Content-Type':'application/json','X-Collection-Token':token,...headers},body:JSON.stringify({operationId,note:syntheticNote(2)})});
    assert.equal((await clip({Origin:'https://evil.example'})).status,403);assert.equal((await clip({'X-Collection-Token':'0'.repeat(64)})).status,403);
    const response=await clip({Origin:'chrome-extension://'+'a'.repeat(32)});assert.equal(response.status,200);assert.equal(response.headers.get('access-control-allow-origin'),'chrome-extension://'+'a'.repeat(32));const result=await response.json();assert.ok(!('owner'in result));
    await app.api('/extension/revoke',{});assert.equal((await clip()).status,403);
  }finally{await app.close();}
});
test('失败与隐私边界：错误脱敏、不同业务query不合并、坏输入不留processing、symlink阻断',async()=>{
  const app=await collectionFixture({fetchImpl:async()=>{throw new Error('失败 https://image.xhscdn.com/a?signature=SHOULD_NOT_LEAK');}});try {
    await app.api('/notes/manual',{url:'https://example.com/article?id=A',title:'A'});await app.api('/notes/manual',{url:'https://example.com/article?id=B',title:'B'});assert.equal((await app.api('/notes')).notes.length,2);
    assert.equal((await app.importNote(syntheticNote(3))).status,'complete');const partial=(await app.api('/notes')).notes[0];assert.equal(partial.mediaStatus,'partial');assert.equal(partial.coverUrl,'');assert.ok(!JSON.stringify(await app.readCollection()).includes('SHOULD_NOT_LEAK'));
    const failed=await app.importNote({...syntheticNote(4),sourceUrl:'https://evil.example/123'});assert.equal(failed.status,'failed');
    await assert.rejects(app.api('/notes/manual',{url:'https://u:p@example.com'}),{status:400});assert.throws(()=>extractNoteIdFromUrl('https://u:p@www.xiaohongshu.com/explore/'+'1'.repeat(24)));
    const outside=join(app.directory,'outside');await mkdir(outside);await rm(join(app.directory,'collection/models'),{recursive:true});await symlink(outside,join(app.directory,'collection/models'));assert.equal((await app.importNote(syntheticNote(7))).status,'failed');assert.deepEqual(await readdir(outside),[]);assert.equal(extractNoteIdFromUrl('https://www.xiaohongshu.com/album/detail?note_id='+'2'.repeat(24)),'2'.repeat(24));
  }finally{await app.close();}
});
test('响应限额提前取消流，不把全部响应放进内存',async()=>{let canceled=false;const response=new Response(new ReadableStream({start(controller){controller.enqueue(new Uint8Array(8));controller.enqueue(new Uint8Array(8));},cancel(){canceled=true;}}));await assert.rejects(boundedResponseBytes(response,10,'超限'),/超限/);assert.equal(canceled,true);});
test('视频处理、Range、转写失败保留本地视频，并发读写不误判文件身份',async()=>{
  const video=Buffer.from('synthetic mp4 bytes for Range, not a decodable video');let analyzed=0;
  const app=await collectionFixture({fetchImpl:async url=>String(url).includes('video')?new Response(video,{headers:{'content-type':'video/mp4'}}):new Response(Buffer.from('synthetic image'),{headers:{'content-type':'image/png'}}),analyzer:async()=>{if(++analyzed===2)throw new Error('合成转写失败');return {duration:6,transcriptSegments:[{start:2,duration:2,text:'视频时间定位'}]};}});
  try {
    assert.equal((await app.importNote(syntheticNote(8,{type:'video',videoUrl:'https://video.xhscdn.com/fixture.mp4'}))).status,'complete');
    const note=(await app.api('/notes')).notes[0];assert.equal(analyzed,1);assert.equal(note.videoStatus,'ready');assert.equal(note.transcriptSegments[0].start,2);
    const range=await fetch(app.url+note.videoUrl,{headers:{Range:'bytes=3-9'}});assert.equal(range.status,206);assert.equal(range.headers.get('content-range'),`bytes 3-9/${video.length}`);assert.deepEqual(Buffer.from(await range.arrayBuffer()),video.subarray(3,10));assert.equal((await fetch(app.url+note.videoUrl,{headers:{Range:'bytes=999-'}})).status,416);
    await app.importNote(syntheticNote(9,{type:'video',videoUrl:'https://video.xhscdn.com/fixture.mp4'}));const partial=(await app.api('/notes')).notes[0];assert.equal(partial.videoStatus,'partial');assert.match(partial.videoError,/转写失败/);assert.equal((await fetch(app.url+partial.videoUrl)).status,200);
    const reads=Array.from({length:40},()=>app.api('/notes'));const writes=Array.from({length:20},(_,i)=>app.api('/notes/manual',{url:`https://fixture.invalid/${i}`,title:'并发写入'}));await Promise.all([...reads,...writes]);assert.equal((await app.api('/notes')).notes.length,22);
  } finally {await app.close();}
});
test('MCP只读工具搜索OCR并读取完整收藏，禁止写方法',async()=>{const app=await collectionFixture();try{await app.importNote(syntheticNote(6));const child=spawn(process.execPath,['server/collection-mcp.mjs'],{cwd:process.cwd(),env:{...process.env,COLLECTION_DATA_DIRECTORY:join(app.directory,'collection')}});let output='';child.stdout.on('data',chunk=>output+=chunk);child.stdin.end(JSON.stringify({jsonrpc:'2.0',id:1,method:'tools/call',params:{name:'search_saved_notes',arguments:{query:'像素收藏'}}})+'\n'+JSON.stringify({jsonrpc:'2.0',id:2,method:'tools/call',params:{name:'delete_note'}})+'\n');await new Promise((resolve,reject)=>{child.on('close',resolve);child.on('error',reject);});const lines=output.trim().split('\n').map(JSON.parse);assert.equal(lines[0].result.structuredContent.count,1);assert.ok(lines[1].error);}finally{await app.close();}});
