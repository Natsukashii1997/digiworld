import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,realpath,readFile,rm,writeFile,mkdir,symlink,link,stat} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {setTimeout as delay} from 'node:timers/promises';
import {fileURLToPath} from 'node:url';
import {createAiProcess,aiArguments,aiPrompt} from '../server/reverse-ai-process.mjs';
import {REA_READ_TOOLS} from '../src/reverse-ai.js';
import {terminated,waitTerminated,processIdentity,killIdentified} from './process-terminated.mjs';
const fake=fileURLToPath(new URL('./fake-ai.mjs',import.meta.url));
const execute=createAiProcess({commands:Object.fromEntries(['codex','claude'].map(x=>[x,{command:process.execPath,prefix:[fake,x]}])),killGraceMs:40});
test('两个AI真实合成子进程：只读工具参数、流式日志、结构化结果、原始文件',async()=>{
 const root=await realpath(await mkdtemp(join(tmpdir(),'ai-process-')));
 try{for(const executor of ['codex','claude']){
  const folder=join(root,executor),logs=[];
  const result=await execute(executor,{folder,prompt:'success',onLine:t=>logs.push(t)});
  assert.equal(result.conclusions[0].evidence[0],'ev_'+'a'.repeat(64));assert.ok(logs.some(t=>t.includes('analyze_javascript_application')));
  assert.match(await readFile(join(folder,'events.jsonl'),'utf8'),/ev_/);
  const args=aiArguments(executor,folder).join(' ');assert.match(args,/read-only|dontAsk/);assert.ok(!args.includes('mcp__rea__*'));
 }}finally{await rm(root,{recursive:true,force:true});}
});

test('Codex 在 -a never 下只预先批准白名单内的 REA 读工具',()=>{
 const args=aiArguments('codex','/tmp/run');
 const approved=args.filter(a=>/^mcp_servers\.rea\.tools\..+\.approval_mode=/.test(a));
 assert.deepEqual(approved,REA_READ_TOOLS.map(t=>`mcp_servers.rea.tools.${t}.approval_mode="approve"`));
 assert.ok(approved.some(a=>a.includes('list_browser_targets')));
 assert.equal(args[args.indexOf('-a')+1],'never');
 assert.ok(args.indexOf(approved.at(-1))<args.indexOf('exec'));
});

test('真实进程中文逐字节分块不损坏，认证/额度/权限/REA/格式分开失败',async()=>{
 const root=await realpath(await mkdtemp(join(tmpdir(),'ai-errors-')));
 try{
  const split=await execute('claude',{folder:join(root,'split'),prompt:'split'});assert.equal(split.conclusions[0].text,'找到复制入口');
  for(const [prompt,kind] of [['invalid','result'],['bad-id','result'],['uncited','result'],['auth','auth'],['quota','quota'],['missing','mcp'],['typed:authentication_failed','auth'],['typed:billing_error','quota'],['typed:permission denied','permission'],['pending-fail','ai']])await assert.rejects(execute('claude',{folder:join(root,prompt.replace(/[^a-z]/g,'_')),prompt}),e=>e.kind===kind,prompt);
  const missing=createAiProcess({commands:{codex:{command:join(root,'not-installed')}}});await assert.rejects(missing('codex',{folder:join(root,'absent'),prompt:'success'}),e=>e.kind==='launch'&&e.status===503);
 }finally{await rm(root,{recursive:true,force:true});}
});
test('真实OS写入隔离拒绝目标改写',async()=>{
 const root=await realpath(await mkdtemp(join(tmpdir(),'ai-readonly-'))),target=join(root,'project.txt');await writeFile(target,'unchanged');
 try{
  await execute('codex',{folder:join(root,'probe'),prompt:'write:'+target,signal:AbortSignal.timeout(30000)});assert.equal(await readFile(target,'utf8'),'unchanged');assert.equal(JSON.parse(await readFile(join(root,'probe/cwd/write-probe.json'),'utf8')).denied,true);
 }finally{await rm(root,{recursive:true,force:true});}
});
// 整套并发时假AI与孙进程启动可能远超1秒；等待按截止时间而非固定次数。无论断言成败，finally 都会停止本次运行并强杀孙进程，失败也不留进程卡住整套测试。
// 单条超时防止停止逻辑回退时整套卡住：超时时 node 中止 t.signal。兜底不依赖被测的停止逻辑：按记下的身份直接强杀假AI leader 与孙进程
// （否则它们占着管道，测试文件仍不退出），并删临时目录。用例正常结束时 t.signal 也会中止，所以 finally 收尾完才摘掉监听；卡在 finally 的 await 里超时仍会清理。
test('停止清理忽略TERM的孙进程',{timeout:60000},async(t)=>{
 const root=await realpath(await mkdtemp(join(tmpdir(),'ai-tree-'))),folder=join(root,'tree'),controller=new AbortController(),stop=()=>controller.abort(new Error('synthetic stop'));
 const running=execute('codex',{folder,prompt:'tree',signal:controller.signal}),outcome=running.then(()=>null,e=>e);let pid,settled=false;outcome.then(()=>{settled=true;});
 const owned=[];const onTimeout=()=>{stop();owned.forEach(killIdentified);rm(root,{recursive:true,force:true,maxRetries:5}).catch(()=>{});};t.signal.addEventListener('abort',onTimeout,{once:true});
 try{
  // 孙进程装好忽略TERM的处理器后才写pid（见 fake-ai.mjs），读到即可停止。
  for(const deadline=Date.now()+30000;!pid&&!settled&&Date.now()<deadline;){pid=Number(await readFile(join(folder,'cwd/child.pid'),'utf8').catch(()=>''))||undefined;if(!pid)await delay(20);}
  // leader 在起孙进程之前已写好 pid，读到孙进程 pid 时 leader 的必然已在。
  for(const p of [Number(await readFile(join(folder,'cwd/leader.pid'),'utf8').catch(()=>''))||undefined,pid])if(p){const id=processIdentity(p);if(id)owned.push(id);}
  assert.ok(pid,settled?'假AI提前结束：'+(await outcome)?.message:'30秒内未读到孙进程pid');assert.equal(terminated(pid),false);
  stop();assert.match(String((await outcome)?.message),/synthetic stop/);
  // SIGKILL 已在 execute 返回前发出；孙进程被收养后才由 launchd 回收，负载下回收前短暂是僵尸，按截止时间等待（见 process-terminated.mjs）。
  assert.equal(await waitTerminated(pid),true,'停止后孙进程仍在运行');
 }finally{
  stop();await outcome;if(pid)try{process.kill(pid,'SIGKILL');}catch{}
  t.signal.removeEventListener('abort',onTimeout);
  await rm(root,{recursive:true,force:true});
 }
});

// All state/config probes are synthetic; never attempt a write to the user's actual configuration.
test('真实OS允许客户端状态和npx缓存，配置直接写/删除/原子替换及项目写入仍拒绝',async()=>{
 const root=await realpath(await mkdtemp(join(tmpdir(),'ai-state-'))),home=join(root,'home');
 try{
  for(const dir of ['.codex','.npm','.claude','.codex/worktrees/project'])await mkdir(join(home,dir),{recursive:true});
  for(const file of ['.codex/config.toml','.claude/settings.json','.claude.json'])await writeFile(join(home,file),'original');
  const project=join(root,'project.txt'),otherRun=join(root,'evidence/other.txt');await mkdir(join(root,'evidence'));await writeFile(project,'original');await writeFile(otherRun,'original');
  await symlink(project,join(home,'.npm/project-link'));
  const run=createAiProcess({home,commands:Object.fromEntries(['codex','claude'].map(x=>[x,{command:process.execPath,prefix:[fake,x]}]))});
  for(const executor of ['codex','claude']){
   const state=executor==='codex'?'.codex':'.claude',config=join(home,state,executor==='codex'?'config.toml':'settings.json'),folder=join(root,'evidence',executor);
   const allowed=[join(home,state,'state.db'),join(home,'.npm/cache'),...(executor==='claude'?[join(home,'.claude.json')]:[])];
   const denied=[config,project,otherRun,join(home,'.npm/project-link'),join(home,'.codex/worktrees/project/file'),join(home,executor==='codex'?'.claude/settings.json':'.codex/config.toml')];
   const replacement=join(home,state,'replacement');await writeFile(replacement,'replacement');
   const ops=[...allowed.map(path=>({label:path,path,allowed:true})),...denied.map(path=>({label:path,path,allowed:false})),{label:'config append',kind:'append',path:config,allowed:false},{label:'config truncate',kind:'truncate',path:config,allowed:false},{label:'config hardlink',kind:'link',from:config,path:join(home,'.npm','config-alias'),allowed:false},{label:'config unlink',kind:'unlink',path:config,allowed:false},{label:'config rename',kind:'rename',from:replacement,path:config,allowed:false},{label:'state rename',kind:'rename',from:join(home,state),path:join(home,'.npm',state+'-moved'),allowed:false}];
   await run(executor,{folder,prompt:'sandbox:'+JSON.stringify(ops),signal:AbortSignal.timeout(5000)});
   const outcomes=JSON.parse(await readFile(join(folder,'cwd/sandbox-probe.json'),'utf8'));
   assert.deepEqual(outcomes.map(x=>[x.label,x.allowed]),ops.map(x=>[x.label,x.allowed]));
   for(const x of outcomes.filter(x=>!x.allowed))assert.ok(['EPERM','EACCES'].includes(x.code),JSON.stringify(x));
   assert.equal(await readFile(config,'utf8'),'original');
   await rm(config);const absentFolder=join(root,'evidence',executor+'-absent');
   await run(executor,{folder:absentFolder,prompt:'write:'+config,signal:AbortSignal.timeout(5000)});
   assert.equal(JSON.parse(await readFile(join(absentFolder,'cwd/write-probe.json'),'utf8')).denied,true);await writeFile(config,'original');
  }
  assert.equal(await readFile(project,'utf8'),'original');assert.equal(await readFile(otherRun,'utf8'),'original');
 }finally{await rm(root,{recursive:true,force:true});}
});

test('状态目录符号链接不能扩大到项目写权限',async()=>{
 const root=await realpath(await mkdtemp(join(tmpdir(),'ai-state-link-'))),home=join(root,'home');
 try{await mkdir(home);await mkdir(join(root,'project'));await symlink(join(root,'project'),join(home,'.codex'));
  const run=createAiProcess({home,commands:{codex:{command:process.execPath,prefix:[fake,'codex']}}});
  await assert.rejects(run('codex',{folder:join(root,'run'),prompt:'success'}),e=>e.kind==='permission');
 }finally{await rm(root,{recursive:true,force:true});}
});

test('配置符号链接及既有硬链接不能绕开配置保护',async()=>{
 const root=await realpath(await mkdtemp(join(tmpdir(),'ai-config-link-'))),home=join(root,'home');
 try{await mkdir(home);await mkdir(join(home,'.codex'));const actual=join(home,'.codex/shared.toml'),config=join(home,'.codex/config.toml');await writeFile(actual,'original');
  const run=createAiProcess({home,commands:{codex:{command:process.execPath,prefix:[fake,'codex']}}});
  for(const kind of ['symlink','hardlink']){
   await (kind==='symlink'?symlink:link)(actual,config);
   await assert.rejects(run('codex',{folder:join(root,kind),prompt:'success',signal:AbortSignal.timeout(5000)}),e=>e.kind==='permission');
   assert.equal(await readFile(actual,'utf8'),'original');await rm(config);
  }
 }finally{await rm(root,{recursive:true,force:true});}
});

test('目标落在可写缓存/状态中或包含可写根时，启动前拒绝',async()=>{
 const root=await realpath(await mkdtemp(join(tmpdir(),'ai-target-scope-'))),home=join(root,'home');
 try{for(const dir of ['.codex','.npm'])await mkdir(join(home,dir),{recursive:true});
  for(const dir of ['.codex','.npm'])await writeFile(join(home,dir,'target.asar'),'original');
  const run=createAiProcess({home,commands:{codex:{command:process.execPath,prefix:[fake,'codex']}}});
  for(const [i,targetPath] of [join(home,'.codex/target.asar'),join(home,'.npm/target.asar'),home].entries())
   await assert.rejects(run('codex',{folder:join(root,'run'+i),targetPath,prompt:'success',signal:AbortSignal.timeout(5000)}),e=>e.kind==='permission');
 }finally{await rm(root,{recursive:true,force:true});}
});

test('中文运行路径中的真实Swift编译只使用本次临时目录和缓存，结束移除别名',async()=>{
 const root=await realpath(await mkdtemp(join(tmpdir(),'ai-swift-'))),folder=join(root,'中文 路径/run');
 try{await execute('codex',{folder,prompt:'swift-temp',signal:AbortSignal.timeout(70000)});
  const probe=JSON.parse(await readFile(join(folder,'cwd/swift-probe.json'),'utf8'));assert.equal(probe.status,0,probe.stderr);assert.match(probe.tmp,/^[\x00-\x7f]+$/);
  await assert.rejects(realpath(probe.tmp),{code:'ENOENT'});assert.equal((await readFile(join(folder,'cwd/probe'))).length>0,true);
 }finally{await rm(root,{recursive:true,force:true});}
});

test('REA进程检查使用沙箱内无setuid的只读ps副本，确实读到自身进程',async()=>{
 const root=await realpath(await mkdtemp(join(tmpdir(),'ai-ps-')));
 try{await execute('codex',{folder:root,prompt:'ps-probe',signal:AbortSignal.timeout(15000)});
  const p=JSON.parse(await readFile(join(root,'cwd/ps-probe.json'),'utf8'));assert.equal(p.status,0);assert.equal(p.denied,true);const fields=p.stdout.trim().split(/\s+/);assert.equal(Number(fields[0]),p.self);assert.equal(Number(fields[3]),p.uid);assert.ok(p.stdout.includes('fake-ai.mjs'));
  assert.equal((await stat(join(root,'bin/ps'))).mode&0o6000,0);
 }finally{await rm(root,{recursive:true,force:true});}
});

test('同一次CLI先报告线索再REA，最终可选clues通过校验；无单独AI调用',async()=>{
 const root=await realpath(await mkdtemp(join(tmpdir(),'ai-clues-')));
 try{for(const executor of ['codex','claude']){
  const logs=[],result=await execute(executor,{folder:join(root,executor),prompt:'clues',onLine:t=>logs.push(t)});
  assert.deepEqual(result.clues,['copy','migrate','handoff']);const clueIndex=logs.findIndex(t=>t.startsWith('线索词：'));assert.ok(clueIndex>=0);assert.ok(logs.findIndex(t=>t.startsWith('REA ·'))>clueIndex);
 }const prompt=aiPrompt({title:'合成交接',material:{target:{kind:'web',url:'https://example.test/community',feature:'迁移历史上下文',authorized:true,clues:[]}}});assert.match(prompt,/首次REA调用前/);assert.match(prompt,/同一次逆推中完成/);assert.match(prompt,/"clues"/);
 }finally{await rm(root,{recursive:true,force:true});}
});
