import {readFile,writeFile,rename,unlink,link,appendFile,truncate} from 'node:fs/promises';
import {spawn,spawnSync} from 'node:child_process';
import {join} from 'node:path';
const executor=process.argv[2],prompt=await new Promise(resolve=>{let s='';process.stdin.on('data',c=>s+=c);process.stdin.on('end',()=>resolve(s));});
const events=[];const emit=v=>events.push(v);
const ev='ev_'+'a'.repeat(64),tool='analyze_javascript_application';
// 孙进程先装好忽略TERM的处理器，再原子写出自己的pid；测试读到pid即可确定它已在忽略TERM，不靠固定等待猜时机。
// leader 也先原子写出自己的pid，测试超时兜底时可不依赖被测的停止逻辑直接清理它。
if(prompt==='tree'){await writeFile('leader.pid.tmp',String(process.pid));await rename('leader.pid.tmp','leader.pid');spawn(process.execPath,['-e',"const fs=require('fs');process.on('SIGTERM',()=>{});fs.writeFileSync('child.pid.tmp',String(process.pid));fs.renameSync('child.pid.tmp','child.pid');setInterval(()=>{},1000)"],{stdio:'ignore'});setInterval(()=>{},1000);await new Promise(()=>{});}
if(prompt==='ps-probe'){
 const r=spawnSync('ps',['-p',String(process.pid),'-o','pid=,ppid=,pgid=,uid=,stat=,command='],{encoding:'utf8'});let denied=false;
 try{await writeFile(join(process.cwd(),'../bin/ps'),'bad');}catch(e){denied=['EACCES','EPERM'].includes(e.code);}
 await writeFile(join(process.cwd(),'ps-probe.json'),JSON.stringify({status:r.status,signal:r.signal,error:r.error?.message,stdout:r.stdout,self:process.pid,uid:process.getuid(),denied}));if(r.status!==0)process.exit(9);
}
if(prompt==='swift-temp'){
 const source=join(process.cwd(),'probe.swift');await writeFile(source,'print("synthetic swift")');const env={...process.env};delete env.CLANG_MODULE_CACHE_PATH;
 const result=spawnSync('/usr/bin/xcrun',['swiftc',source,'-o',join(process.cwd(),'probe')],{env,encoding:'utf8',timeout:60000});
 await writeFile(join(process.cwd(),'swift-probe.json'),JSON.stringify({status:result.status,signal:result.signal,stderr:result.stderr,tmp:process.env.TMPDIR}));if(result.status!==0)process.exit(9);
}
if(prompt.startsWith('sandbox:')){const outcomes=[];for(const op of JSON.parse(prompt.slice(8))){try{if(op.kind==='link')await link(op.from,op.path);else if(op.kind==='append')await appendFile(op.path,'append');else if(op.kind==='truncate')await truncate(op.path,0);else if(op.kind==='rename')await rename(op.from,op.path);else if(op.kind==='unlink')await unlink(op.path);else await writeFile(op.path,'probe');outcomes.push({label:op.label,allowed:true});}catch(e){outcomes.push({label:op.label,allowed:false,code:e.code});}}await writeFile(join(process.cwd(),'sandbox-probe.json'),JSON.stringify(outcomes));}
if(prompt.startsWith('write:')){let denied=false;try{await writeFile(prompt.slice(6),'bad');}catch(e){denied=e.code==='EPERM'||e.code==='EACCES';}await writeFile(join(process.cwd(),'write-probe.json'),JSON.stringify({denied}));if(!denied)process.exit(9);}
if(prompt.startsWith('typed:')){emit({type:'assistant',error:prompt.slice(6),message:{content:[]}});emit({type:'result',is_error:true,result:'Request failed'});for(const e of events)process.stdout.write(JSON.stringify(e)+'\n');process.exit(1);}
if(prompt==='auth'||prompt==='quota'||prompt==='missing'){process.stderr.write({auth:'not logged in',quota:'quota exceeded',missing:'mcp rea not found'}[prompt]);process.exit(1);}
const result={conclusions:[{text:'找到复制入口',mark:'观察',evidence:[ev]}],unknowns:[{id:'U1',text:'真实剪贴板未验证'}],pack:'# 合成复刻任务包 · '+executor+'\n按照证据实现复制。'};
if(prompt==='bad-id')result.conclusions[0].evidence=['ev_short'];if(prompt==='uncited')result.conclusions[0].evidence=['ev_'+'b'.repeat(64)];
if(prompt==='empty')result.unknowns=[];
if(prompt==='clues'){result.clues=['copy','migrate','handoff'];emit(executor==='codex'?{type:'item.completed',item:{type:'agent_message',text:'线索词：copy、migrate、handoff'}}:{type:'assistant',message:{content:[{type:'text',text:'线索词：copy、migrate、handoff'}]}});}
const final=prompt==='invalid'?'not json':'```json\n'+JSON.stringify(result)+'\n```';
if(executor==='codex'){
 emit({type:'item.started',item:{type:'mcp_tool_call',server:'rea',tool,status:'in_progress'}});
 emit({type:'item.completed',item:{type:'mcp_tool_call',server:'rea',tool,status:'completed',result:{evidence_id:ev}}});
 emit({type:'item.completed',item:{type:'agent_message',text:final}});emit({type:'turn.completed',usage:{input_tokens:42,output_tokens:25}});
}else{
 emit({type:'system',subtype:'init',...(prompt==='pending-fail'?{mcp_servers:[{name:'rea',status:'pending'}]}:{})});emit({type:'assistant',message:{content:[{type:'tool_use',id:'t1',name:'mcp__rea__'+tool}]}});
 emit({type:'user',message:{content:[{type:'tool_result',tool_use_id:'t1',content:JSON.stringify({evidence_id:ev})}]}});
 emit({type:'result',is_error:prompt==='pending-fail',result:prompt==='pending-fail'?'Request failed':final});
}

for(const event of events){const data=Buffer.from(JSON.stringify(event)+'\n');if(prompt==='split')for(const byte of data){process.stdout.write(Buffer.from([byte]));await new Promise(r=>setTimeout(r,1));}else process.stdout.write(data);}
