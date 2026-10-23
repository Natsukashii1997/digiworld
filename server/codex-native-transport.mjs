import { spawn } from 'node:child_process';
import { access } from 'node:fs/promises';
import { constants } from 'node:fs';

// Use the app's runtime. Never silently fall back to a different PATH CLI.
export const DESKTOP_CODEX = '/Applications/ChatGPT.app/Contents/Resources/codex-cli/CodexCLI.app/Contents/MacOS/codex';
const error = message => Object.assign(new Error(message), {status:503});

export async function connectCodex({binary=DESKTOP_CODEX,args=['app-server','--listen','stdio://'],cwd,onMessage=()=>{},onDisconnect=()=>{},timeoutMs=45000}={}) {
  await access(binary, constants.X_OK).catch(()=>{throw error('找不到桌面 Codex 运行程序；请检查 Codex 安装，不会改用其他版本。');});
  const child=spawn(binary,args,{cwd,env:process.env,stdio:['pipe','pipe','pipe']});
  let sequence=0, buffer='', ended=false, closing=false;
  const pending=new Map();
  function finish(reason) {
    if(ended)return;
    ended=true;
    for(const call of pending.values()){clearTimeout(call.timer);call.reject(reason);}
    pending.clear();
    if(!closing)onDisconnect(reason);
  }
  function send(message) {
    if(ended||!child.stdin.writable)throw error('原生连接已断开；执行结果需重新连接核对。');
    child.stdin.write(JSON.stringify(message)+'\n');
  }
  child.on('error',()=>finish(error('无法启动桌面 Codex 运行程序。')));
  child.on('exit',()=>finish(error('Codex 连接已结束；未自动重新执行。')));
  child.stdin.on('error',()=>finish(error('Codex 输入连接中断；结果未知。')));
  // Stderr can contain account diagnostics. Do not reflect it into page or logs.
  child.stderr.resume();
  child.stdout.setEncoding('utf8');
  child.stdout.on('data',chunk=>{
    buffer+=chunk;
    // A protocol frame limit is a transport failure, never silent truncation.
    if(buffer.length>64*1024*1024){finish(error('Codex 协议消息超过传输容量；结果保留在原生历史。'));child.kill();return;}
    let newline;
    while((newline=buffer.indexOf('\n'))>=0){
      const line=buffer.slice(0,newline);buffer=buffer.slice(newline+1);
      if(!line.trim())continue;
      let message;
      try{message=JSON.parse(line);}catch{finish(error('Codex 返回无法识别的协议；请核对桌面版本。'));child.kill();return;}
      if(message.method){onMessage(message);continue;}
      const call=pending.get(message.id);if(!call)continue;
      clearTimeout(call.timer);pending.delete(message.id);
      if(message.error)call.reject(Object.assign(error(message.error.message||'原生请求失败'),{rpcCode:message.error.code,definite:true}));
      else call.resolve(message.result);
    }
  });
  const client={
    request(method,params={}){
      return new Promise((resolve,reject)=>{
        const id=++sequence;
        const timer=setTimeout(()=>{pending.delete(id);reject(error('Codex 响应超时；结果未知，请查询，不会自动重发。'));},timeoutMs);
        pending.set(id,{resolve,reject,timer});
        try{send({id,method,params});}catch(e){clearTimeout(timer);pending.delete(id);reject(e);}
      });
    },
    respond(id,result){send({id,result});},
    reject(id,message='当前客户端不支持此原生请求'){send({id,error:{code:-32601,message}});},
    async close(){
      if(closing)return;closing=true;
      child.stdin.end();
      if(child.exitCode!==null||child.signalCode!==null)return;
      await new Promise(resolve=>{
        const timer=setTimeout(()=>child.kill('SIGTERM'),2000);
        const killTimer=setTimeout(()=>child.kill('SIGKILL'),5000);
        timer.unref();killTimer.unref();
        child.once('exit',()=>{clearTimeout(timer);clearTimeout(killTimer);resolve();});
      });
    },
    get connected(){return !ended;},
  };
  try{
    client.identity=await client.request('initialize',{clientInfo:{name:'personal_ai_workbench',version:'572'},capabilities:{experimentalApi:true}});
    send({method:'initialized',params:{}});
    return client;
  }catch(e){await client.close();throw e;}
}
