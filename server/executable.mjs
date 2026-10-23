import {access,stat,realpath,readdir} from 'node:fs/promises';
import {constants} from 'node:fs';
import {dirname,join,isAbsolute,delimiter,basename} from 'node:path';
import {homedir} from 'node:os';

export function launchError(command,code='ENOENT') {
 const name=basename(command),label=/^[a-zA-Z0-9._-]{1,80}$/.test(name)?name:'命令行工具';
 return Object.assign(new Error(`本地服务无法启动 ${label}（${code==='EACCES'?'无执行权限':'未找到可用程序'}）；请检查本机安装位置与执行权限，修复后重启工作台。`),{kind:'launch',code,status:503});
}
// Resolve only executable locations; never source shell profiles or inspect AI configuration.
export async function resolveExecutable(command,{environment=process.env,nodePath=process.execPath,home=homedir(),standardDirectories=['/opt/homebrew/bin','/usr/local/bin','/usr/bin','/bin']}={}) {
 const directories=[dirname(nodePath)];
 if(!isAbsolute(command)){
 const nvm=join(home,'.nvm/versions/node');
 try {
  const versions=(await readdir(nvm,{withFileTypes:true})).filter(v=>v.isDirectory()&&/^v\d+\.\d+\.\d+$/.test(v.name)).map(v=>v.name)
   .sort((a,b)=>b.slice(1).localeCompare(a.slice(1),'en',{numeric:true})).slice(0,32);
  directories.push(...versions.map(v=>join(nvm,v,'bin')));
 }catch(e){if(!['ENOENT','EACCES','ENOTDIR'].includes(e.code))throw e;}
 directories.push(join(home,'.local/bin'),...standardDirectories);
 }
 directories.push(...(environment.PATH||'').split(delimiter));
 const usable=[...new Set(directories.filter(p=>isAbsolute(p)&&!/[\x00-\x1f\x7f]/.test(p)))];
 const candidates=isAbsolute(command)?[command]:/^[a-zA-Z0-9._-]+$/.test(command)?usable.map(p=>join(p,command)):[];
 let code='ENOENT';
 for(const candidate of candidates){
  try {
   await access(candidate,constants.X_OK);if(!(await stat(candidate)).isFile())continue;
   const executable=await realpath(candidate);
   // Entry directory comes first so npm's env-node shebang uses its matching Node.
   const env={...environment,PATH:[...new Set([dirname(candidate),dirname(nodePath),...usable])].join(delimiter)};
   return {command:executable,environment:env};
  }catch(e){if(e.code==='EACCES')code=e.code;else if(!['ENOENT','ENOTDIR','ELOOP'].includes(e.code))throw e;}
 }
 throw launchError(command,code);
}
