// 派单183：只读提交时间。仅扫描调用；默认禁用Git锁、配置及宿主交互。
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { dirname, resolve } from 'node:path';
const exec = promisify(execFile);
export const updateDate = value => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(value) && Number.isFinite(Date.parse(value)) ? new Date(value).toISOString() : null;
export async function readGitUpdate(path, { run = exec, checkedAt = new Date().toISOString() } = {}) {
 const unknown = reason => ({state:'unknown',source:'Git',checkedAt,reason});
 const env = Object.fromEntries(Object.entries(process.env).filter(([k])=>!k.startsWith('GIT_')));
 const options={timeout:2500,maxBuffer:1024,env:{...env,GIT_OPTIONAL_LOCKS:'0',GIT_CONFIG_NOSYSTEM:'1',GIT_CONFIG_GLOBAL:'/dev/null',GIT_TERMINAL_PROMPT:'0',GIT_CEILING_DIRECTORIES:dirname(resolve(path))}};
 const args=['-c','core.fsmonitor=false','-C',path];
 try {
  const root=(await run('/usr/bin/git',[...args,'rev-parse','--show-toplevel'],options)).stdout.trim();
  if(resolve(root)!==resolve(path))return unknown('Git根目录与登记目录不同');
  const value=(await run('/usr/bin/git',[...args,'log','-1','--no-show-signature','--no-patch','--format=%cI'],options)).stdout.trim();
  const at=updateDate(value);return at?{state:'ok',source:'Git',checkedAt,at}:unknown('没有可核实的提交时间');
 }catch(e){return unknown(e.killed||e.code==='ERR_CHILD_PROCESS_STDIO_MAXBUFFER'?'Git时间查询超时或输出超限':/does not have any commits|bad default revision/.test(String(e.stderr))?'Git尚无提交':'Git时间不可读');}
}
export function scanProjectUpdate(project, locals, remotes, {at,remoteComplete=true}={}) {
 const checkedAt=at||new Date().toISOString(),source=project.localPaths.length?'Git':'GitHub';
 const unknown=reason=>({state:'unknown',source,checkedAt,reason});
 if(project.identityConflict)return unknown("项目身份待确认");
 if(project.localPaths.length){
  if(project.identityConflict||project.locations.some(l=>l.status==='changed'||l.observedIdentity))return unknown('项目身份待确认');
  const values=project.localPaths.map(path=>project.locations.find(l=>l.path===path)?.status==='present'?locals.find(p=>p.localPaths.includes(path))?.recentUpdate:null);
  const known=values.filter(v=>v?.at&&v.state==='ok').sort((a,b)=>Date.parse(b.at)-Date.parse(a.at));
  if(!known.length)return unknown(values.find(v=>v?.reason)?.reason||'本次未核实提交时间');
  const partial=values.some(v=>v?.state!=='ok');
  return {...known[0],checkedAt,state:partial?'partial':'ok',...(partial?{reason:'部分本地位置未核实；展示已核实位置的最近提交'}:{})};
 }
 const remote=remotes.find(p=>p.repoKey===project.repoKey),value=updateDate(remote?.githubPushedAt);
 return value?{state:remoteComplete?'ok':'partial',source,checkedAt,at:value,...(!remoteComplete?{reason:'远端扫描不完整'}:{})}:unknown('本次未取得GitHub最后推送时间');
}
