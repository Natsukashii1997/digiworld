// 只使用聊天/测试目录下本次自建合成路径；launchctl、端口、运行 PID 与环境全部 DI。
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {join,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createDaemonCapability} from '../server/daemon-capability.mjs';
import {readDaemonCodeRevision} from '../server/daemon-code-revision.mjs';
export async function daemonFixture(fn){
 const base=dirname(fileURLToPath(import.meta.url)),root=await fs.mkdtemp(join(base,'fixture-daemon155-'));await fs.chmod(root,0o700);
 try{
  const home=join(root,'home'),project=join(root,'project'),data=join(root,'data'),node=join(root,'synthetic-node');
  for(const p of [join(home,'Library','LaunchAgents'),join(project,'server'),join(project,'src'),join(project,'dist'),data])await fs.mkdir(p,{recursive:true,mode:0o700});
  await fs.writeFile(node,'synthetic never execute',{mode:0o700});await fs.writeFile(join(project,'server','index.mjs'),'// synthetic entry never execute',{mode:0o600});await fs.writeFile(join(project,'server','keychain-helper.swift'),'// synthetic Security helper never execute',{mode:0o600});await fs.writeFile(join(project,'src','App.jsx'),'// synthetic source never execute',{mode:0o600});await fs.writeFile(join(project,'dist','index.html'),'<main>合成当前版本</main>',{mode:0o600});
  const environment={WORKBENCH_MCP_PORT:'off',VISIBLE_CHOICE:'ENV_SELECTED_SYNTHETIC_SENTINEL',UNSELECTED_CHOICE:'ENV_UNSELECTED_SYNTHETIC_SENTINEL'};let secretReads=0;Object.defineProperty(environment,'ANTHROPIC_API_KEY',{enumerable:true,get(){secretReads++;throw new Error('秘密值禁止读取');}});
  let enabled=false,generation='initial',now=Date.parse('2026-10-04T12:00:00Z'),loaded=false,portBusy=true,pid=90051;const counts={commands:[],port:0,host:0};let guardHook=null,portHook=null,printHook=null,filesystem=fs;
  const settings={async get(){return{enabled,generation,options:{}};},async assertEnabled(){if(guardHook)await guardHook();if(!enabled)throw Object.assign(new Error('常驻默认关闭'),{status:409,operationNotStarted:true});return{enabled,generation,options:{}};}};
  let runtimeRevision=await readDaemonCodeRevision(project),adapters={platform:'darwin',daemonHome:home,daemonProjectRoot:project,daemonNodePath:node,daemonEnvironment:environment,daemonCurrentPid:pid,daemonRuntimeCodeRevision:runtimeRevision,daemonMetadataCheck:async()=>({provenance:null}),
   daemonPortOccupied:async p=>{assert.equal(p,5178);counts.port++;if(portHook)await portHook(counts.port);return portBusy;},daemonLaunchctl:async args=>{
    counts.commands.push(args);assert(!args.includes('bootout'),'不允许停止任何服务');
    if(args[0]==='print'){if(printHook)await printHook(counts.commands.filter(a=>a[0]==='print').length);assert.match(args[1],/^gui\/\d+\/cn\.personal-ai-workbench\.server$/);if(!loaded)throw Object.assign(new Error('合成未加载'),{exitCode:113});return'cn.personal-ai-workbench.server\n program = '+node+'\n arguments = {\n'+node+'\n'+join(project,'server','index.mjs')+'\n}\n pid = '+pid+'\n';}
    if(args[0]==='bootstrap'){assert.equal(portBusy,false);assert.equal(args[2],join(home,'Library','LaunchAgents','cn.personal-ai-workbench.server.plist'));loaded=true;return'';}
    if(args[0]==='kickstart'){assert.deepEqual(args,['kickstart','-k','gui/'+process.getuid()+'/cn.personal-ai-workbench.server']);pid++;return'';}
    assert.fail('不允许其他 launchctl 操作');
   }};
  const create=(extra={})=>createDaemonCapability({directory:data},{settings,adapters:{...adapters,capabilityFilesystem:filesystem,...extra},clock:()=>now}),api=create();
  await fn({api,create,root,home,project,data,node,environment,counts,plistPath:join(home,'Library','LaunchAgents','cn.personal-ai-workbench.server.plist'),enable(){enabled=true;generation='authorized';},revoke(){enabled=false;generation='revoked';},reEnable(){enabled=true;generation='authorized-again';},advance(ms){now+=ms;},set(v){if(v.loaded!==undefined)loaded=v.loaded;if(v.portBusy!==undefined)portBusy=v.portBusy;if(v.pid!==undefined)pid=v.pid;},pid:()=>pid,secretReads:()=>secretReads,runtimeRevision:()=>runtimeRevision,async adoptLatest(){runtimeRevision=await readDaemonCodeRevision(project);return create({daemonCurrentPid:pid,daemonRuntimeCodeRevision:runtimeRevision});},guard(fn){guardHook=fn;},onPort(fn){portHook=fn;},onPrint(fn){printHook=fn;},filesystem(v){filesystem=v;},mutations:()=>counts.commands.filter(a=>a[0]!=='print')});
 }finally{await fs.rm(root,{recursive:true,force:true});}
}
