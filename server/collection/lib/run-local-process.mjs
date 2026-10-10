import {spawn} from 'node:child_process';
export function runLocalProcess(executable,args,{timeout=120000,maxBuffer=8*1024*1024,deadline=Infinity,...options}={}) {
  return new Promise((resolve,reject)=>{
    const remaining=Math.min(timeout,deadline-Date.now());
    if(remaining<=0)return reject(new Error('本次收藏分析已达到时间上限'));
    const child=spawn(executable,args,{...options,detached:true,stdio:['ignore','pipe','pipe']});
    let stdout='',stderr='',size=0,failed;
    const stop=error=>{failed||=error;try{process.kill(-child.pid,'SIGKILL');}catch{child.kill('SIGKILL');}};
    const timer=setTimeout(()=>stop(new Error('本地分析超时，已停止')),remaining);
    child.stdout.on('data',chunk=>{size+=chunk.length;if(size>maxBuffer)stop(new Error('本地分析输出超限'));else stdout+=chunk;});
    child.stderr.on('data',chunk=>{if(stderr.length<4096)stderr+=chunk;});
    child.on('error',error=>{clearTimeout(timer);reject(error);});
    child.on('close',code=>{clearTimeout(timer);if(failed)reject(failed);else if(code!==0)reject(new Error(`本地分析退出 ${code}: ${stderr.slice(0,400)}`));else resolve({stdout,stderr});});
  });
}
