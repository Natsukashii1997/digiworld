import {resolveExecutable,launchError} from './executable.mjs';
import { spawn } from 'node:child_process';
import { reaError,validVersion } from './reverse-process.mjs';

// Check concrete calls against locally supplied JSON Schema; never resolve remote refs.
export function accepts(schema,value,root=schema,depth=0) {
  if(depth>60||!schema||typeof schema!=='object')return false;
  const supported=new Set(['$ref','$defs','definitions','$schema','$id','title','description','default','examples','deprecated','readOnly','writeOnly','type','const','enum','anyOf','oneOf','allOf','properties','required','additionalProperties','items','minItems','maxItems','minLength','maxLength','pattern','minimum','maximum','exclusiveMinimum','exclusiveMaximum']);
  if(Object.keys(schema).some(k=>!supported.has(k)))return false;
  if(!['$ref','type','const','enum','anyOf','oneOf','allOf'].some(k=>Object.hasOwn(schema,k)))return false;
  if(schema.$ref){if(Object.keys(schema).some(k=>!['$ref','$defs','definitions','$schema','$id','title','description','default','examples','deprecated','readOnly','writeOnly'].includes(k)))return false;if(!schema.$ref.startsWith('#/'))return false;const ref=schema.$ref.slice(2).split('/').reduce((v,k)=>v?.[k.replace(/~1/g,'/').replace(/~0/g,'~')],root);return accepts(ref,value,root,depth+1);}
  if(schema.anyOf&&!schema.anyOf.some(s=>accepts(s,value,root,depth+1)))return false;
  if(schema.oneOf&&schema.oneOf.filter(s=>accepts(s,value,root,depth+1)).length!==1)return false;
  if(schema.allOf&&!schema.allOf.every(s=>accepts(s,value,root,depth+1)))return false;
  if(Object.hasOwn(schema,'const')&&JSON.stringify(schema.const)!==JSON.stringify(value))return false;
  if(schema.enum&&!schema.enum.some(v=>JSON.stringify(v)===JSON.stringify(value)))return false;
  const type=Array.isArray(value)?'array':value===null?'null':typeof value;
  if(schema.type&&!([schema.type].flat().includes(type)||type==='number'&&schema.type==='integer'&&Number.isInteger(value)))return false;
  if(type==='string'){
    if(schema.minLength>value.length||schema.maxLength<value.length)return false;
    if(schema.pattern){if(schema.pattern.length>500)return false;try{if(!new RegExp(schema.pattern).test(value))return false;}catch{return false;}}
  }
  if(type==='number'&&(schema.minimum>value||schema.maximum<value||schema.exclusiveMinimum>=value||schema.exclusiveMaximum<=value))return false;
  if(type==='array')return !(schema.minItems>value.length||schema.maxItems<value.length)&&!!schema.items&&value.every(v=>accepts(schema.items,v,root,depth+1));
  if(type==='object'){
    if(schema.required?.some(k=>!Object.hasOwn(value,k)))return false;
    // Union-only wrappers delegate member checks to their branches.
    if(!schema.properties)return !!(schema.anyOf||schema.oneOf||schema.allOf);
    return Object.entries(value).every(([k,v])=>schema.properties[k]&&accepts(schema.properties[k],v,root,depth+1));
  }
  return true;
}
const retained={kind:'retained-evidence',evidence_id:'ev_'+'a'.repeat(64)};
export const CLI_CALLS={
 'analyze-javascript-application':{args:{path:'/fixture/app.asar'},options:{integrityPolicy:'record-and-continue'}},
 'inspect-analysis-view':{args:{inputJson:'/fixture/input.json'},options:{}},
 'trace-application-feature':{args:{inputJson:'/fixture/input.json'},options:{}},
 'list-browser-targets':{args:{endpoint:'http://127.0.0.1:9222'},options:{allowedOrigins:['https://example.test']}},
 'analyze-web-bundle':{args:{endpoint:'http://127.0.0.1:9222',targetId:'page-one'},options:{allowedOrigins:['https://example.test']}},
 setup:{args:{},options:{client:['claude_code','codex'],dryRun:true,yes:true}},doctor:{args:{},options:{}},
};
export const MCP_CALLS={
 analyze_javascript_application:{input_path:'/fixture/app.asar',integrity_policy:'record-and-continue',detail:'summary'},
 inspect_analysis_view:{source:retained,view:{kind:'summary'}},
 trace_application_feature:{application:retained,seed:{kind:'string',value:'copy',match:'contains',case_sensitive:false},direction:'both'},
 list_browser_targets:{cdp_endpoint:'http://127.0.0.1:9222'},
 analyze_web_bundle:{cdp_endpoint:'http://127.0.0.1:9222',target_id:'page-one'},
};
export function checkCompatibility(inventory,tools) {
 const missing=[];
 for(const [name,calls]of Object.entries(CLI_CALLS)){
  const list=inventory?.commands?.filter(c=>c.name===name)||[],schema=list.length===1?list[0].schema:null;
  for(const [kind,value]of Object.entries(calls)){
   if(!schema||(!schema[kind]?Object.keys(value).length>0:!accepts(schema[kind],value)))missing.push(`CLI ${name}.${kind}`);
  }
 }
 for(const [name,call]of Object.entries(MCP_CALLS)){const list=tools?.filter(t=>t.name===name)||[];if(list.length!==1||!accepts(list[0].inputSchema,call))missing.push(`MCP ${name} 输入参数`);}
 return {ok:missing.length===0,missing,cli:Object.keys(CLI_CALLS),mcp:Object.keys(MCP_CALLS)};
}

export function createMcpProbe({command='npx',prefix=[],spawnProcess=spawn,executableOptions={}}={}) {
 return async function probe(version,{signal,environment=process.env}={}) {
  if(!validVersion(version))throw reaError('adaptation','候选版本无效');
  signal?.throwIfAborted();
  const env={...environment,REA_MCP_INPUT_SCHEMA_PROFILE:'full'};
  for(const key of ['HOPPER_TARGET_PATH','HOPPER_TARGET_KIND','HOPPER_LOADER_ARGS_JSON'])delete env[key];
  const resolved=await resolveExecutable(command,{...executableOptions,environment:env});
  signal?.throwIfAborted();
  const child=spawnProcess(resolved.command,[...prefix,'--registry=https://registry.npmjs.org','-y',`rea-agents@${version}`,'mcp'],{shell:false,detached:true,stdio:['pipe','pipe','pipe'],env:resolved.environment});
  let pending='',bytes=0,id=0,failed,killTimer;const requests=new Map();
  const closed=new Promise(resolve=>{child.on('error',e=>{fail(launchError(command,e.code));resolve();});child.on('close',()=>{fail(reaError('adaptation','MCP探针已结束'));resolve();});});
  const kill=()=>{try{process.kill(-child.pid,'SIGTERM');}catch{child.kill();}if(!killTimer)killTimer=setTimeout(()=>{try{process.kill(-child.pid,'SIGKILL');}catch{child.kill('SIGKILL');}},500);};
  function fail(e){failed=e;for(const r of requests.values())r.reject(e);requests.clear();}
  const abort=()=>{fail(signal.reason);kill();};signal?.addEventListener('abort',abort,{once:true});
  child.stdin.on('error',e=>fail(reaError('adaptation','MCP输入已关闭：'+e.code)));child.stderr.resume();
  child.stdout.setEncoding('utf8');child.stdout.on('data',chunk=>{
   bytes+=Buffer.byteLength(chunk);pending+=chunk;
   if(bytes>32*1024*1024||pending.length>8*1024*1024){fail(reaError('adaptation','MCP目录超过安全读取上限'));kill();return;}
   let nl;while((nl=pending.indexOf('\n'))>=0){const line=pending.slice(0,nl);pending=pending.slice(nl+1);if(!line.trim())continue;
    try{const value=JSON.parse(line);if(value.jsonrpc!=='2.0')throw Error();if(value.id!==undefined&&value.method)throw Error();const wait=requests.get(value.id);if(wait){requests.delete(value.id);value.error?wait.reject(reaError('adaptation','MCP目录请求失败')):wait.resolve(value.result);}}
    catch{fail(reaError('adaptation','MCP返回非预期协议'));kill();}
   }
  });
  const send=(method,params)=>{if(failed)return Promise.reject(failed);const key=++id;return new Promise((resolve,reject)=>{requests.set(key,{resolve,reject});child.stdin.write(JSON.stringify({jsonrpc:'2.0',id:key,method,params})+'\n');});};
  try{
   const init=await send('initialize',{protocolVersion:'2025-11-25',capabilities:{},clientInfo:{name:'workbench-rea-compat',version:'1'}});
   if(init?.serverInfo?.name!=='rea'||init.serverInfo.version!==version||!init.capabilities?.tools||!['2025-11-25','2025-06-18','2024-11-05'].includes(init.protocolVersion))throw reaError('adaptation','MCP身份或协议不一致');
   child.stdin.write(JSON.stringify({jsonrpc:'2.0',method:'notifications/initialized'})+'\n');
   const result=[],cursors=new Set();let cursor;
   for(let page=0;page<20;page++){
    const next=await send('tools/list',cursor?{cursor}:{});if(!Array.isArray(next?.tools))throw reaError('adaptation','MCP工具目录无效');
    result.push(...next.tools);if(result.length>1000)throw reaError('adaptation','MCP工具过多');
    if(!next.nextCursor)return result;
    if(typeof next.nextCursor!=='string'||cursors.has(next.nextCursor))throw reaError('adaptation','MCP目录游标重复');cursor=next.nextCursor;cursors.add(cursor);
   }
   throw reaError('adaptation','MCP工具目录读取不完整');
  }finally{signal?.removeEventListener('abort',abort);child.stdin.end();kill();await closed;await new Promise(resolve=>setTimeout(resolve,510));clearTimeout(killTimer);}
 };
}
