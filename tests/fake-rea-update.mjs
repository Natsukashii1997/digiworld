import {writeFile} from 'node:fs/promises';
import { CLI_CALLS,MCP_CALLS } from '../server/rea-compat.mjs';
const schema=value=>Array.isArray(value)?{type:'array',items:schema(value[0])}:value&&typeof value==='object'?{type:'object',properties:Object.fromEntries(Object.entries(value).map(([k,v])=>[k,schema(v)])),required:Object.keys(value)}:{type:typeof value};
export const fakeInventory=()=>({version:'incur.v1',commands:Object.entries(CLI_CALLS).map(([name,call])=>({name,schema:{args:schema(call.args),options:{...schema(call.options),required:[]}}}))});
export const fakeTools=()=>Object.entries(MCP_CALLS).map(([name,call])=>({name,inputSchema:schema(call)}));
export function fakeUpdate(){
 const calls=[],control={installed:'6.4.0',mode:'ok',yes:0,network:0,planChange:false};
 const doctor=version=>({identity:{cli_package_version:version,expected_skill_version:'43',skill:{state:control.skillMissing?'missing':'aligned',installed_version:control.installed==='6.5.0'?'43':'41'},registrations:['claude_code','codex'].map(client=>({client,state:control.installed===version?'aligned':'mismatch',command:['npx','-y','rea-agents@'+control.installed],config_path:client==='codex'?'/synthetic/.codex/config.toml':'/synthetic/.claude.json'}))}});
 const plan=version=>({status:'planned',clients:{},doctor:{identity:{registrations:doctor(version).identity.registrations,skill:{}}},plannedActions:[{id:'configure_client:codex',kind:'configure_client',operation:'update',target:'/synthetic/.codex/config.toml',backupPath:'/synthetic/.codex/config.toml'+(control.planChange?'.changed':'.rea.backup'),external:false,detail:'PRIVATE_SETUP_DETAIL'}, {id:'configure_client:claude_code',kind:'configure_client',operation:'update',target:'/synthetic/.claude.json',backupPath:'/synthetic/.claude.json.rea.backup',external:false},{id:'install_skill',kind:'install_skill',operation:'install',target:'/synthetic/.agents/skills/reverse-engineer-anything',external:false}]});
 const execute=async(version,args,output,options)=>{
  calls.push({version,args,registry:options.registry});let result;
  if(args[0]==='doctor')result=doctor(version);
  else if(args[0]==='--llms-full')result=fakeInventory();
  else if(args.includes('--dry-run')){if(control.mode==='preview-fail')throw Error('合成预演失败');result=plan(version);}
  else if(args.includes('--yes')){control.yes++;control.onYes?.();if(control.mode==='hang')await new Promise((resolve,reject)=>{options.signal.addEventListener('abort',()=>reject(options.signal.reason),{once:true});});if(control.mode==='write-fail')throw Error('合成部分写入失败');if(control.mode!=='mismatch')control.installed=version;result={status:'ready'};}
  else throw Error('unexpected fake command');
  await writeFile(output,JSON.stringify(result));return null;
 };
 const fetchImpl=async url=>{control.network++;if(control.mode==='network')throw Error('合成网络不可达');return new Response(JSON.stringify(url.includes('github')?{tag_name:'v6.5.0',draft:false,prerelease:false,html_url:'https://github.com/morluto/rea/releases/tag/v6.5.0'}:{name:'rea-agents',version:'6.5.0'}),{status:control.mode==='syncing'&&!url.includes('github')?404:200});};
 const probe=async()=>{const tools=fakeTools();if(control.mode==='adaptation')tools[0].inputSchema.properties.detail={const:'complete'};return tools;};
 return {execute,fetchImpl,probe,control,calls,doctor,plan,home:'/synthetic',environment:{}};
}
