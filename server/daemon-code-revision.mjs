// 只读产品代码，生产入口在加载 HTTP 模块前后核同一指纹并固定为本进程采用证据。
import fs from 'node:fs/promises';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {readConfigFile} from './config-file.mjs';
export async function readDaemonCodeRevision(project,{filesystem=fs}={}){
 const entries=[];let count=0,total=0;
 async function walk(folder,relative,all=false){
  let names;try{names=await filesystem.readdir(folder);}catch(e){if(e.code==='ENOENT'&&relative==='dist')return;throw e;}
  if(names.length>1000)throw new Error('工作台代码目录超过核验上限');
  for(const name of [...names].sort()){
   if(!name||name==='.'||name==='..'||/[\\\x00-\x1f\x7f]/.test(name)||name.startsWith('.'))throw new Error('工作台代码目录名称无法核验');
   const path=join(folder,name),r=relative+'/'+name,s=await filesystem.lstat(path);
   if(s.isSymbolicLink())throw new Error('工作台代码不能包含链接');
   if(s.isDirectory()){await walk(path,r,all);continue;}
   if(!all&&!/\.(?:mjs|js|jsx|css|swift|py|sh)$/.test(name))continue;
   if(++count>1000||!s.isFile()||s.nlink!==1||s.mode&0o022)throw new Error('工作台代码身份无法核验');
   const file=await readConfigFile(path,{filesystem,limit:16*1024*1024});total+=file.bytes.length;if(total>64*1024*1024)throw new Error('工作台代码超过核验上限');
   entries.push([r,file.hash,file.identity]);
  }
 }
 await walk(join(project,'server'),'server');await walk(join(project,'src'),'src').catch(e=>{if(e.code!=='ENOENT')throw e;});await walk(join(project,'dist'),'dist',true);
 if(!entries.some(([p])=>p==='server/index.mjs'))throw new Error('工作台生产入口不存在');
 return createHash('sha256').update(JSON.stringify(entries)).digest('hex');
}
