import test from 'node:test';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import { mkdtemp, realpath, writeFile, readFile, rm, stat, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import { openRepository } from '../server/repository.mjs';
import { createReverseRunner, appendLog, LOG_BYTES } from '../server/reverse-runner.mjs';
import { createReaProcess, registeredVersion } from '../server/reverse-process.mjs';
import { visitJson, summarizeEvidence } from '../server/reverse-json.mjs';
import { seed } from '../src/store.js';
import { createSpecimen } from '../src/reverse-recipe.js';
import { packDirectory } from '../server/full-backup.mjs';
import {terminated,waitTerminated,processIdentity,killIdentified} from './process-terminated.mjs';

const execute = createReaProcess({ command: process.execPath, prefix: [fileURLToPath(new URL('./fake-rea.mjs',import.meta.url))], killGraceMs:30 });
async function setup(name='target', options={}) {
  const directory = await realpath(await mkdtemp(join(tmpdir(),'reverse-runner-'))), path=join(directory,name+'.asar');
  await writeFile(path,'synthetic');
  const repository=await openRepository(directory), input=seed();
  const record=createSpecimen({type:'FN',target:{kind:'electron',path,feature:'copy',authorized:true,clues:['clipboard']}});
  input.reverseRecords=[record]; await repository.write(input,{initialize:true});
  let runner=await createReverseRunner({repository,execute,...options});
  return {directory,path,record,repository,get runner(){return runner;},
    async start(){const checked=await runner.check({path});return runner.start({recordId:record.id,requestId:randomUUID(),checkId:checked.checkId,expectedRevision:(await repository.read()).revision});},
    async reopen(){await runner.close();runner=await createReverseRunner({repository,execute,...options});},
    async close(){await runner.close();await repository.close();await rm(directory,{recursive:true,force:true});}};
}
async function done(app){for(let i=0;i<200;i++){const result=await app.runner.query({recordId:app.record.id});if(result.run?.status!=='running'&&(!result.busy||result.persistencePending))return result;await delay(25);}throw Error('synthetic run hung');}

test('REA真实子进程流式8MB、进度、摘要、线索、幂等、刷新回读与备份排除',async()=>{
  const app=await setup();try {
    const {run}=await app.start();
    assert.equal(run.status,'running');
    assert.equal((await app.runner.start({recordId:app.record.id,requestId:run.id})).reused,true);
    const result=await done(app);assert.equal(result.run.status,'completed',JSON.stringify(result));
    assert.equal(result.run.summary.modules,0);assert.equal(result.run.summary.clues[0].hits,2);assert.deepEqual(result.run.summary.clues[0].locations,['/fixture/copy.js','clipboard']);
    assert.equal(result.rawAvailable,true);
    const raw=join(app.directory,'reverse-evidence',app.record.id,run.id,'analysis.json');assert.ok((await stat(raw)).size>8*1024*1024);
    assert.ok(Buffer.byteLength(JSON.stringify(result.run))<LOG_BYTES);assert.ok(result.run.log.some(l=>l.text.includes('合成进度')));
    assert.ok(result.run.log.some(l=>(l.detail||l.text).includes('rea-agents@6.4.0')));
    const state=await app.repository.read();state.reverseRecords[0].reaRuns[0].status='failed';await assert.rejects(app.repository.write(state));
    const {manifest}=await packDirectory(app.directory);assert.ok(!manifest.files.some(f=>f.path.startsWith('reverse-evidence/')));assert.match(manifest.skipped.find(x=>x.path==='reverse-evidence').reason,/原始证据/);
    await app.reopen();assert.equal((await app.runner.query({recordId:app.record.id})).run.status,'completed');
  }finally{await app.close();}
});
test('REA停止进程树、全局单运行、日志长行有界且状态不误报完成',async()=>{
  const app=await setup('slow');try{
    const {run}=await app.start();await delay(120);
    await assert.rejects(app.runner.start({recordId:app.record.id,requestId:randomUUID(),expectedRevision:(await app.repository.read()).revision}),/已有取证/);
    const result=await app.runner.stop({recordId:app.record.id,runId:run.id});assert.equal(result.run.status,'stopped');assert.equal(result.run.summary,undefined);
    assert.ok(result.run.log.every(l=>l.text.length<=2000));assert.equal(app.runner.busy,false);
    const after=JSON.stringify(result.run);await delay(100);assert.equal(JSON.stringify((await app.runner.query({recordId:app.record.id})).run),after);
  }finally{await app.close();}
});
test('REA超时与错误代码区分、目标检查过期/改动均拒绝',async()=>{
  const timed=await setup('slow',{timeoutMs:150});try{await timed.start();const {run}=await done(timed);assert.equal(run.status,'failed');assert.equal(run.error.kind,'timeout');}finally{await timed.close();}
  const failed=await setup('fail');try{await failed.start();const {run}=await done(failed);assert.equal(run.error.code,'SYNTHETIC_BAD_TARGET');assert.equal(run.error.kind,'rea');}finally{await failed.close();}
  const changed=await setup();try{
    const input={recordId:changed.record.id,requestId:randomUUID(),expectedRevision:(await changed.repository.read()).revision};
    await assert.rejects(changed.runner.start(input),/先检查/);
    const {checkId}=await changed.runner.check({path:changed.path});await writeFile(changed.path,'changed');
    await assert.rejects(changed.runner.start({...input,checkId}),/检查后变化/);
  }finally{await changed.close();}
});
test('服务重启将遗留running中断，不执行REA',async()=>{
  const app=await setup();try{
    await app.repository.updateReverse(records=>records.map(r=>({...r,reaRuns:[{id:'crash',status:'running',startedAt:new Date().toISOString(),version:'6.4.0',target:r.material.target,log:[],sequence:0,truncated:false}]})));
    await app.reopen();assert.equal((await app.runner.query({recordId:app.record.id})).run.status,'interrupted');
  }finally{await app.close();}
});
test('网站仅取精确匹配页面、摘要口径为脚本、线索未支持明确披露',async()=>{
  const app=await setup();try{
    const state=await app.repository.read();state.reverseRecords[0].material.target={kind:'web',url:'https://example.test/page',cdpEndpoint:'http://127.0.0.1:9222',feature:'copy',authorized:true,clues:['copy']};await app.repository.write(state);
    await app.runner.start({recordId:app.record.id,requestId:randomUUID(),expectedRevision:(await app.repository.read()).revision});
    const {run}=await done(app);assert.equal(run.status,'completed',JSON.stringify(run.error));assert.equal(run.summary.scriptsAnalyzed,2);assert.equal(run.summary.modules,undefined);assert.match(run.summary.clueLimitation,/不支持/);
  }finally{await app.close();}
});
test('日志同时限制UTF8字节和行数，注册版本必须两端固定且一致',()=>{
  const r={log:[],sequence:0,truncated:false};for(let i=0;i<3000;i++)appendLog(r,'中'.repeat(1500));assert.ok(Buffer.byteLength(JSON.stringify(r.log))<=LOG_BYTES);assert.ok(r.log.length<=2000);assert.equal(r.truncated,true);
  assert.equal(registeredVersion({identity:{cli_package_version:'6.4.0'}}).version,null);
});
test('流式JSON跨块/超大字符串/数组计数，格式损坏不能形成摘要',async()=>{
  const dir=await mkdtemp(join(tmpdir(),'rea-json-'));try{
    const file=join(dir,'input.json');await writeFile(file,JSON.stringify({long:'a'.repeat(200000),list:[{a:[1,2]},3],tail:'中\\n'}));
    const seen=[];await visitJson(file,(path,value,type)=>seen.push([path.join('.'),value,type]));assert.ok(seen.some(x=>x[0]==='list'&&x[1]===2));assert.ok(seen.some(x=>x[0]==='long'&&x[1]===null));
    for(const raw of ['{"x":[1,]}','{"x":"\\uZZZZ"}','{"x":1} trailing','{"x":','{"x":NaN}']){await writeFile(file,raw);await assert.rejects(visitJson(file,()=>{}),undefined,raw);}
    await writeFile(file,'{}');await assert.rejects(summarizeEvidence(file,'electron'),/Evidence/);
  }finally{await rm(dir,{recursive:true,force:true});}
});
test('磁盘写入失败停止子进程并清晰分类',async()=>{
  const dir=await mkdtemp(join(tmpdir(),'rea-disk-'));try{await assert.rejects(execute('6.4.0',['analyze-javascript-application','slow.asar'],join(dir,'absent','out.json')),e=>e.kind==='disk');}finally{await rm(dir,{recursive:true,force:true});}
});

// 单条超时防止停止逻辑回退时 app.close() 无限等待：超时时 node 中止 t.signal。兜底不依赖被测的停止逻辑：按记下的身份直接强杀假REA leader 与孙进程
// （否则它们占着资源，测试文件仍不退出），并删临时目录。用例正常结束时 t.signal 也会中止，所以 app.close() 返回后才摘掉监听；卡在 app.close() 里超时仍会清理。
test('停止后leader已退出仍清理忽略TERM的孙进程',{timeout:60000}, async(t)=>{
 const app=await setup('tree');let pid;const owned=[];const onTimeout=()=>{owned.forEach(killIdentified);rm(app.directory,{recursive:true,force:true,maxRetries:5}).catch(()=>{});};t.signal.addEventListener('abort',onTimeout,{once:true});try{
  // 等 pid 按截止时间而非固定次数；孙进程装好忽略TERM的处理器后才写pid（见 fake-rea.mjs）。
  const {run}=await app.start();
  // leader 一写出 pid 就登记身份，不等孙进程：孙进程起不来或没写 pid 时，超时兜底也能杀掉 leader 所在进程组（含没登记的孙进程）。
  // 读到 pid 与登记成功分开记：ps 某次没取到身份时下一轮照样重试；读到孙进程 pid 后，再给没登记上的最多 2 秒补登记。
  const seen=new Set(),own=async(file,group)=>{const p=Number(await readFile(file,'utf8').catch(()=>''))||undefined;if(p&&!seen.has(file)){const id=processIdentity(p,group);if(id){owned.push(id);seen.add(file);}}return p;};
  const leaderFile=app.path+'.leader.pid',childFile=app.path+'.pid';
  for(const deadline=Date.now()+30000;!pid&&Date.now()<deadline;){await own(leaderFile,true);pid=await own(childFile);if(!pid)await delay(20);}
  for(const deadline=Date.now()+2000;pid&&seen.size<2&&Date.now()<deadline;){await own(leaderFile,true);await own(childFile);if(seen.size<2)await delay(20);}
  assert.ok(pid,'30秒内未读到孙进程pid');assert.equal(terminated(pid),false);
  await app.runner.stop({recordId:app.record.id,runId:run.id});
  assert.equal(await waitTerminated(pid),true,'停止后孙进程仍在运行');
 }finally{await app.close();t.signal.removeEventListener('abort',onTimeout);if(pid)try{process.kill(pid,'SIGKILL');}catch{}}
});
test('关闭覆盖启动doctor等待，关闭后不会异步起跑',async()=>{
 let release;const gate=new Promise(resolve=>{release=resolve;});
 const app=await setup('target',{getVersion:async()=>{await gate;return {version:'6.4.0'};}});
 try{const pending=app.start();await delay(20);const closing=app.runner.close();release();await assert.rejects(pending,/服务关闭/);await closing;assert.equal((await app.runner.query({recordId:app.record.id})).run,null);}finally{await app.close();}
});
test('日志落盘失败转失败，最终失败状态持久化成功后释放锁',async()=>{
 const app=await setup('slow');try{
  const update=app.repository.updateReverse.bind(app.repository);let count=0;
  app.repository.updateReverse=(...args)=>++count===2?Promise.reject(Error('synthetic ENOSPC')):update(...args);
  await app.start();const {run}=await done(app);assert.equal(run.status,'failed');assert.equal(run.error.kind,'disk');assert.equal(app.runner.busy,false);
 }finally{await app.close();}
});
test('取证完成前目标变化时不采用摘要',async()=>{
 const app=await setup('target',{execute:async(version,args,path,opts)=>{await execute(version,args,path,opts);if(args[0]==='trace-application-feature')await writeFile(args[1].replace(/reverse-evidence.*/, 'target.asar'),'changed during run');}});
 try{await app.start();const {run}=await done(app);assert.equal(run.status,'failed');assert.equal(run.error.kind,'target_changed');assert.equal(run.summary,undefined);}finally{await app.close();}
});


test('大于70KiB且exit1的doctor通过取证status和start；1MiB以上也遵守统一边界',async()=>{
 for(const bytes of [72*1024,2*1024*1024]){
  const large=createReaProcess({command:process.execPath,prefix:[fileURLToPath(new URL('./fake-rea.mjs',import.meta.url)),'--doctor-bytes='+bytes]});
  const app=await setup('doctor-large',{execute:large});try{
   assert.equal((await app.runner.status()).version,'6.4.0');
   await app.start();assert.equal((await done(app)).run.status,'completed');
  }finally{await app.close();}
 }
});


test('doctor超8MiB明确拒绝，坏JSON和无identity的exit1不能被放行',async()=>{
 for(const [flag,expected] of [['--doctor-bytes='+8*1024*1024,/超过读取上限/],['--doctor-invalid',/REA 退出 1/],['--doctor-missing-identity',/REA 退出 1/]]){
  const invalid=createReaProcess({command:process.execPath,prefix:[fileURLToPath(new URL('./fake-rea.mjs',import.meta.url)),flag]});
  const app=await setup('doctor-invalid',{execute:invalid});try{await assert.rejects(app.runner.status(),expected);}finally{await app.close();}
 }
});


test('3000条真实格式逐文件进度合并一行，短命令保留完整argv详情及证据，JS计数取摘要',async()=>{
 const app=await setup('progress');try{
  await app.start();const {run}=await done(app);assert.equal(run.status,'completed');
  const progress=run.log.filter(l=>l.text.startsWith('解析源文件 '));assert.equal(progress.length,1);assert.equal(progress[0].text,'解析源文件 3,000 / 3,000');
  assert.equal(run.truncated,false);assert.ok(run.log.length<20);assert.ok(run.sequence>=3000);
  const commands=run.log.filter(l=>l.text.startsWith('$'));assert.equal(commands.length,2);
  assert.match(commands[0].text,/^\$ rea analyze-javascript-application .* integrity=record-and-continue$/);
  assert.equal(commands[1].text,'$ rea trace-application-feature  seed=string:"clipboard"');
  assert.ok(commands.every(l=>l.detail.includes('rea-agents@6.4.0')));assert.ok(!commands[1].text.includes('trace-0-input.json'));assert.ok(commands[1].detail.includes('trace-0-input.json'));
  assert.equal(run.summary.modules,0);assert.equal(run.summary.parsedJavaScriptFiles,3);assert.ok(run.log.some(l=>l.text.includes('模块 0 · JS 文件 3')));
  assert.ok(run.log.some(l=>l.text.includes('ev_'+'a'.repeat(64))));
  await app.reopen();assert.deepEqual((await app.runner.query({recordId:app.record.id})).run.log,run.log);
 }finally{await app.close();}
});


test('进度合并不跨命令或诊断，异常进度与普通stderr保留',async()=>{
 const app=await setup('progress-invalid');try{
  await app.repository.updateReverse(records=>records.map(r=>({...r,material:{...r.material,target:{...r.material.target,clues:['copy','clipboard']}}})));
  await app.start();const {run}=await done(app);assert.equal(run.status,'completed');
  for(const diagnostic of ['bad source (9/3)','plain diagnostic','{broken JSON'])assert.ok(run.log.some(l=>l.text.includes(diagnostic)),diagnostic);
  assert.equal(run.log.filter(l=>l.text.startsWith('解析源文件 ')).length,1);
  assert.equal(run.log.filter(l=>l.text==='trace_application_feature 1/1 Tracing synthetic feature').length,2);
  assert.equal(run.log.filter(l=>l.text.startsWith('$ rea trace-application-feature')).length,2);
 }finally{await app.close();}
});
