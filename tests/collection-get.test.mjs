import test from 'node:test';
import assert from 'node:assert/strict';
import {collectionFixture, syntheticNote} from './collection-fixture.mjs';
import {noteMatchesQuery, noteSearchEvidence} from '../src/collection/scripts/lib/note-search.mjs';

const end='仅在GET结尾出现的独有知识';
const source=syntheticNote(920);
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function saved(app,note,mode='get',operationId=crypto.randomUUID()) {
 await app.api('/notes/import',{note,mode,operationId});
 for(let i=0;i<200;i++){const op=await app.api('/operations/'+operationId);if(op.status!=='processing')return op;await sleep(10);}
 throw new Error('import timed out');
}
async function analysis(app,check) {
 for(let i=0;i<200;i++){const note=(await app.api('/notes')).notes.find(n=>n.id===source.id);if(check(note?.getAnalysis))return note;await sleep(10);}
 assert.fail('GET result did not reach expected status');
}
function fakeClient(overrides={}) {
 const calls=[];
 const session={binding:'fixture-account',create:async input=>{calls.push(input);return {taskId:'fixture-task'};},progress:async()=>({status:'success',noteId:'1924043523523615136'}),detail:async()=>({title:'GET整理标题',content:'# 整理\n\n'+end,sourceUrl:source.sourceUrl}),...overrides};
 return {calls,session:async()=>session};
}
test('收藏后GET回填同卡完整内容，普通重新收藏保留，末段可搜索',async()=>{
 const client=fakeClient(),app=await collectionFixture({getClient:client,getPollMs:5});
 try{
  const pair=await app.api('/extension/pair',{});const capabilities=await app.api('/clip/capabilities',undefined,'GET',{'X-Collection-Token':pair.token});assert.equal(capabilities.getAnalysis,true);
  assert.equal((await saved(app,source,'direct')).status,'complete');assert.equal(client.calls.length,0);
  const op=crypto.randomUUID();assert.equal((await saved(app,source,'get',op)).status,'complete');
  const note=await analysis(app,g=>g?.status==='ready');
  assert.equal(note.getAnalysis.content,'# 整理\n\n'+end);assert.equal(note.getAnalysis.noteId,'1924043523523615136');
  assert.equal(note.getAnalysis.noteUrl,'https://www.biji.com/note/1924043523523615136');
  assert.equal(client.calls.length,1);assert.equal(client.calls[0].sourceUrl,source.sourceUrl);
  await saved(app,source,'get',op);await saved(app,{...source,title:'更新原帖'},'direct');
  assert.equal((await app.api('/notes')).notes[0].getAnalysis.content,note.getAnalysis.content);assert.equal(client.calls.length,1);
  assert.ok(noteMatchesQuery(note,end));assert.equal(noteSearchEvidence(note,end).match.field,'get_analysis');
  const {spawn}=await import('node:child_process');const {join}=await import('node:path');
  const child=spawn(process.execPath,['server/collection-mcp.mjs'],{env:{...process.env,COLLECTION_DATA_DIRECTORY:join(app.directory,'collection')}});let output='';child.stdout.on('data',c=>output+=c);
  child.stdin.end([{jsonrpc:'2.0',id:1,method:'tools/call',params:{name:'search_saved_notes',arguments:{query:end}}},{jsonrpc:'2.0',id:2,method:'tools/call',params:{name:'read_saved_note',arguments:{note_id:source.id}}}].map(x=>JSON.stringify(x)).join('\n')+'\n');
  await new Promise((res,rej)=>{child.on('close',res);child.on('error',rej);});const result=output.trim().split('\n').map(x=>JSON.parse(x).result.structuredContent);
  assert.equal(result[0].notes[0].match.field,'get_analysis');assert.equal(result[1].note.getAnalysis.content,note.getAnalysis.content);assert.equal(result[1].note.getAnalysis.provider,'GET');

 }finally{await app.close();}
});

test('GET失败/响应未知不影响本机收藏，重复GET收藏不会重提，明确失败允许单独重试',async()=>{
 const {GetError}=await import('../server/collection/get-client.mjs');
 for(const kind of ['rejected','unknown']) {
  const client=fakeClient({create:async input=>{client.calls.push(input);throw new GetError('合成失败',kind);}}),app=await collectionFixture({getClient:client,getPollMs:5});
  try {
   const op=crypto.randomUUID();assert.equal((await saved(app,source,'get',op)).status,'complete');
   const note=await analysis(app,g=>g?.status===(kind==='rejected'?'failed':'unknown'));
   await assert.rejects(()=>saved(app,source,'direct',op),/操作编号/);
   await saved(app,source,'get');assert.equal(client.calls.length,1);
   if(kind==='unknown')await assert.rejects(()=>app.api('/notes/'+source.id+'/get-analysis/retry',{jobId:note.getAnalysis.jobId}),/未知/);
   else {await app.api('/notes/'+source.id+'/get-analysis/retry',{jobId:note.getAnalysis.jobId});await analysis(app,g=>g?.status==='failed');assert.equal(client.calls.length,2);assert.notEqual(client.calls[0].requestId,client.calls[1].requestId);}
   assert.equal((await app.api('/notes')).notes.length,1);
  }finally{await app.close();}
 }
});

test('删除后旧GET回调不能落到同作品的新收藏，分组更新不被回填覆盖',async()=>{
 let release;const client=fakeClient({detail:()=>new Promise(resolve=>release=()=>resolve({title:'GET结果',content:end,sourceUrl:source.sourceUrl}))});
 const app=await collectionFixture({getClient:client,getPollMs:5});
 try {
  await saved(app,source);await analysis(app,g=>g?.status==='fetching');while(!release)await sleep(5);
  await app.api('/notes/'+source.id,undefined,'DELETE');
  await saved(app,source,'direct');release();await sleep(30);
  assert.equal((await app.api('/notes')).notes[0].getAnalysis,undefined);
  assert.equal((await app.readCollection()).trash[0].getAnalysis.status,'cancelled');
  await saved(app,source);await analysis(app,g=>g?.status==='fetching');
  await app.api('/notes/categories',{updates:{[source.id]:'人工分类'}},'PATCH');release();
  assert.equal((await analysis(app,g=>g?.status==='ready')).category,'人工分类');
 }finally{release?.();await app.close();}
});

test('官方GET客户端保留字符串ID、读取完整正文，固定无重定向请求且不回显秘密错误',async()=>{
 const {createGetClient}=await import('../server/collection/get-client.mjs');const requests=[];
 const client=createGetClient({readCredentials:async()=>({clientId:'cli_fixture',key:'SYNTHETIC_SECRET'}),fetchImpl:async(url,options)=>{
  requests.push({url,options});const data=url.endsWith('/save')?{tasks:[{task_id:'task-1'}]}:url.endsWith('/progress')?{status:'success',note_id:'1924043523523615136'}:{note:{note_id:'1924043523523615136',title:'整理',content:end,web_page:{url:source.sourceUrl,excerpt:'不是正文',content:'原始文稿'}}};return new Response(JSON.stringify({success:true,data}));
 }});
 const session=await client.session();assert.equal((await session.create({sourceUrl:source.sourceUrl,requestId:'request-fixture'})).taskId,'task-1');assert.equal((await session.progress('task-1')).noteId,'1924043523523615136');assert.equal((await session.detail('1924043523523615136')).content,end);
 assert.equal(JSON.parse(requests[0].options.body).client_request_id,'request-fixture');assert.ok(requests.every(r=>r.options.redirect==='error' && r.url.startsWith('https://openapi.biji.com/open/api/v1/')));
 const broken=createGetClient({readCredentials:async()=>({clientId:'cli_fixture',key:'SYNTHETIC_SECRET'}),fetchImpl:async()=>new Response(JSON.stringify({success:false,error:{code:'10004',message:'SYNTHETIC_SECRET'}}),{status:401})});
 await assert.rejects(()=>(async()=>{await (await broken.session()).create({});})(),e=>e.kind==='rejected' && !e.message.includes('SYNTHETIC_SECRET'));
});

test('重启后仅续查已有任务/详情；提交中断无编号不自动重提',async()=>{
 const {mkdtemp,writeFile,rm}=await import('node:fs/promises');const {tmpdir}=await import('node:os');const {join}=await import('node:path');const {createHash}=await import('node:crypto');const {createCollection}=await import('../server/collection.mjs');
 for(const status of ['pending','fetching','submitting']) {
  const dir=await mkdtemp(join(tmpdir(),'get-recovery-'));const {mkdir}=await import('node:fs/promises');await mkdir(join(dir,'collection'));
  const calls={create:0,progress:0,detail:0};
  // A valid saved collection snapshot at each interruption boundary.
  const state={schema:1,revision:1,notes:[{...source,getAnalysis:{jobId:crypto.randomUUID(),provider:'GET',sourceUrl:source.sourceUrl,status,binding:'fixture-account',requestedAt:new Date().toISOString(),...(status==='pending'?{taskId:'existing-task'}:status==='fetching'?{noteId:'1924043523523615136'}:{})}}],trash:[],operations:[],categories:{},desk:{groups:[],noteGroupMap:{},knownNoteIds:[]}};
  await writeFile(join(dir,'collection/state.json'),JSON.stringify({sha256:createHash('sha256').update(JSON.stringify(state)).digest('hex'),state}));
  const app=createCollection({directory:dir},{getPollMs:5,getClient:{session:async()=>({binding:'fixture-account',create:async()=>{calls.create++;throw new Error('must not submit');},progress:async task=>{calls.progress++;assert.equal(task,'existing-task');return {status:'success',noteId:'1924043523523615136'};},detail:async id=>{calls.detail++;assert.equal(id,'1924043523523615136');return {title:'恢复后的完整解析',content:end,sourceUrl:source.sourceUrl};}})}});
  try {await app.start();let result;for(let i=0;i<100;i++){result=(await app.notes()).notes[0].getAnalysis;if(['ready','unknown'].includes(result.status))break;await sleep(10);}
   assert.equal(result.status,status==='submitting'?'unknown':'ready');assert.equal(calls.create,0);assert.equal(calls.progress,status==='pending'?1:0);assert.equal(calls.detail,status==='submitting'?0:1);
  }finally{await app.close();await rm(dir,{recursive:true,force:true});}
 }
});

test('同作品不同网页路径重导入不阻断GET回填，GET客户端规范化album链接',async()=>{
 let release;const client=fakeClient({detail:()=>new Promise(resolve=>release=()=>resolve({title:'回填',content:end,sourceUrl:source.sourceUrl}))}),app=await collectionFixture({getClient:client,getPollMs:5});
 try{await saved(app,source);await analysis(app,g=>g?.status==='fetching');while(!release)await sleep(5);await saved(app,{...source,sourceUrl:'https://www.xiaohongshu.com/search_result/'+source.id},'direct');release();assert.equal((await analysis(app,g=>g?.status==='ready')).getAnalysis.content,end);}finally{release?.();await app.close();}
 const {getSourceUrl}=await import('../server/collection/get-client.mjs');assert.equal(getSourceUrl('https://www.xiaohongshu.com/album/detail?note_id='+source.id),source.sourceUrl);assert.equal(getSourceUrl('https://evil.example/'+source.id),'');
});

// 转写已改到后台（#109），导入期间仍要等的是视频下载：在下载时删除。
test('已有卡片在重新收藏的媒体下载期间删除，旧导入不得复活卡片或提交GET',async()=>{
 let release;const client=fakeClient(),app=await collectionFixture({getClient:client,getPollMs:5,fetchImpl:async url=>{if(String(url).endsWith('slow.mp4'))await new Promise(resolve=>release=resolve);return new Response('synthetic',{headers:{'content-type':String(url).endsWith('.mp4')?'video/mp4':'image/png'}});},analyzer:async()=>({duration:1,transcriptSegments:[{start:0,duration:1,text:'原视频'}]})});
 try{
  await saved(app,source,'direct');const operationId=crypto.randomUUID();
  await app.api('/notes/import',{note:{...source,type:'video',videoUrl:'https://video.xhscdn.com/slow.mp4'},mode:'get',operationId});
  while(!release)await sleep(5);await app.api('/notes/'+source.id,undefined,'DELETE');release();
  let result;for(let i=0;i<100;i++){result=await app.api('/operations/'+operationId);if(result.status!=='processing')break;await sleep(10);}
  assert.equal(result.status,'failed');assert.match(result.error,/删除/);assert.equal((await app.api('/notes')).notes.length,0);assert.equal(client.calls.length,0);
 }finally{release?.();await app.close();}
});
