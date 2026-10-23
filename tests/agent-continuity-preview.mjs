// 真HTTP与真实文件读写链路的隔离演示；全部资源来自本文件创建的合成Home。
import fs from 'node:fs/promises';import {join} from 'node:path';import {tmpdir} from 'node:os';
import {agentsV16Fixture} from './agents-v16-fixture.mjs';
import {createCapabilitySettings} from '../server/capability-settings.mjs';
const root=await fs.realpath(await fs.mkdtemp(join(tmpdir(),'workbench-migration533-'))),targets=[];
for(const agentId of ['codex','hermes']){
 const home=join(root,agentId);await fs.mkdir(join(home,'skills'),{recursive:true,mode:0o700});await fs.mkdir(join(home,'memories'),{mode:0o700});
 const program=join(root,agentId+'-synthetic-cli');await fs.writeFile(program,'SYNTHETIC, NEVER EXECUTE',{mode:0o600});
 targets.push({schema:1,id:'target-'+agentId,bindingId:'synthetic-'+agentId,agentId,label:'合成 '+agentId,program:{path:program,kind:'CLI'},home:{id:'home-'+agentId,path:home,label:'合成Home'},createdAt:'2026-10-16T00:00:00.000Z',updatedAt:'2026-10-16T00:00:00.000Z'});
 await fs.writeFile(join(home,agentId==='codex'?'config.toml':'config.yaml'),agentId==='codex'?'[mcp_servers.example]\ncommand="npx"\nargs=["example-mcp"]\n[mcp_servers.example.env]\nAPI_KEY="SYNTHETIC_NEVER_COPY"\n':'display:\n  show_reasoning: true\n',{mode:0o600});
}
const source=targets[0].home.path;
await fs.writeFile(join(source,'AGENTS.md'),'# 合成工作约定\n先确认本次目标；完成后提供证据和唯一下一步。\n',{mode:0o600});
await fs.writeFile(join(source,'memories/MEMORY.md'),'# 合成参考记忆\n交付使用中文，优先清楚说明事实与待确认项。\n',{mode:0o600});
await fs.mkdir(join(source,'skills','synthetic-review'),{mode:0o700});await fs.writeFile(join(source,'skills','synthetic-review','SKILL.md'),'---\nname: synthetic-review\ndescription: 合成演示，整理核对清单\n---\n只整理用户提供的材料。\n',{mode:0o600});
const identity=s=>[s.dev,s.ino,s.birthtimeMs,s.uid].join(':');
const app=await agentsV16Fixture({workHandoff:true,connections:{agentTargets:targets},discovery:{
 inspectAgentInventory:async agentId=>({errors:[],truncated:false,homes:[{...targets.find(t=>t.agentId===agentId).home,source:'合成独立目录',status:'present',errors:[],identity:identity(await fs.lstat(targets.find(t=>t.agentId===agentId).home.path))}]}),
 inspectAgentPrograms:async agentId=>[{...targets.find(t=>t.agentId===agentId).program,status:'present',identity:identity(await fs.lstat(targets.find(t=>t.agentId===agentId).program.path))}],
 checkAgentWriteMetadata:async()=>{},checkConfigMetadata:async()=>null,
}});
const settings=createCapabilitySettings(app.repository),p=await settings.preview({capability:'agent',enabled:true,options:{}});await settings.apply({token:p.token,operationId:p.operationId,confirmed:true});
await fs.writeFile('work/agents533/preview.json',JSON.stringify({url:app.url+'/#agents',root,directory:app.directory||app.repository.directory,synthetic:true},null,2));console.log(JSON.stringify({url:app.url+'/#agents',synthetic:true}));
let stopping=false;async function stop(){if(stopping)return;stopping=true;await app.close();await fs.rm(root,{recursive:true,force:true});process.exit();}process.on('SIGTERM',stop);process.on('SIGINT',stop);
