import {createHash} from 'node:crypto';
const blocked=/KEY|TOKEN|SECRET|PASSWORD|CREDENTIAL|AUTH|COOKIE|SESSION|PRIVATE|SIGNATURE|PASSWD/i;
const name=/^[A-Za-z_][A-Za-z0-9_]{0,127}$/;
const fixed=new Set(['PORT','WORKBENCH_DATA_DIR']);
const fail=m=>{throw Object.assign(new Error(m),{code:'DAEMON_ENVIRONMENT_INVALID',status:400,operationNotStarted:true});};
export const isDaemonCredentialValue=v=>/(?:^|[^A-Za-z0-9_])(?:sk[-_]|gh[pousr]_|github_pat_|xox[baprs]-|AKIA[A-Z0-9]{12}|Bearer\s)/i.test(v)||/-----BEGIN (?:[A-Z]+ )?PRIVATE KEY-----/.test(v)||/[?&](?:api[_-]?key|access[_-]?token|token|secret|password|credential)=[^&#\s]+/i.test(v)||/(?:^|[\s"'(])[a-z][a-z0-9+.-]*:\/\/[^/\s:@]+:[^/\s@]+@/i.test(v)||/(?:^|[\s"'{,])(?:--)?(?:api[_-]?key|access[_-]?token|token|secret|password|credential)["']?\s*(?:[=:]|\s)\s*["']?[^\s"',}]+/i.test(v);
export function daemonEnvironmentNames(environment){
 if(!environment||typeof environment!=='object'||Array.isArray(environment))fail('当前服务环境名称无法核验');
 const names=Object.keys(environment).sort();if(names.length>500)fail('当前服务环境名称超过核验上限');
 return names.filter(n=>name.test(n)).map(n=>({name:n,selected:false,blocked:blocked.test(n)||fixed.has(n),reason:blocked.test(n)?'凭据变量禁止带入，请使用钥匙串':fixed.has(n)?'由工作台固定绑定，不接受覆盖':''}));
}
export function selectedDaemonEnvironment(environment,names=[]){
 if(!Array.isArray(names)||names.length>100||new Set(names).size!==names.length||!names.every(n=>typeof n==='string'&&name.test(n)))fail('请只勾选本次列表中的环境变量名称');
 const values=Object.create(null);for(const n of [...names].sort()){
  if(blocked.test(n))fail('凭据变量禁止写入常驻配置，请使用钥匙串');
  if(fixed.has(n)||!Object.hasOwn(environment,n))fail('环境变量名称不在本次可选清单');
  const v=environment[n];if(typeof v!=='string'||Buffer.byteLength(v)>8192||/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/.test(v))fail('所选环境变量值无法安全带入');
  if(isDaemonCredentialValue(v))fail('所选变量可能含凭据，禁止写入常驻配置，请使用钥匙串');
  if(n==='WORKBENCH_MCP_PORT'&&v!=='off'&&(!/^[1-9]\d{0,4}$/.test(v)||Number(v)>65535||Number(v)===5178))fail('工作台 MCP 端口须为 off 或有效独立端口');
  values[n]=v;
 }
 return{values,names:Object.keys(values),sha256:createHash('sha256').update(JSON.stringify(values)).digest('hex')};
}
export function redactedDaemonPlist(text,names=[]){
 const block=text.match(/<key>EnvironmentVariables<\/key>\s*<dict>([\s\S]*?)<\/dict>/)?.[1]||'';
 names=[...new Set([...names,...[...block.matchAll(/<key>([A-Za-z_][A-Za-z0-9_]*)<\/key>/g)].map(m=>m[1]).filter(n=>!fixed.has(n))])];
 if(!names.length)return text;
 const escaped=n=>n.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
 let redacted=text;for(const n of names)redacted=redacted.replace(new RegExp('(<key>'+escaped(n)+'</key>)\\s*<string>[\\s\\S]*?</string>','g'),'$1<string>值已绑定，仅写入 XML 常驻配置，不在此回显</string>');
 return redacted;
}
