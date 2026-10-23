import {packDirectory} from '../server/full-backup.mjs';
import {openRepository} from '../server/repository.mjs';
import {seed} from '../src/store.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm,readFile,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createReaProcess} from '../server/reverse-process.mjs';
import {createReaUpdater,projectPlan} from '../server/rea-update.mjs';
import {accepts,checkCompatibility,createMcpProbe} from '../server/rea-compat.mjs';
import {fakeUpdate,fakeInventory,fakeTools} from './fake-rea-update.mjs';
async function fixture(fn,options={}){const directory=await mkdtemp(join(tmpdir(),'rea-updater-')),fake=fakeUpdate();let service;try{service=await createReaUpdater({directory,...fake,...options});await fn({service,fake,directory});}finally{await service?.close();await rm(directory,{recursive:true,force:true});}}
test('明确点击才联网；固定GitHub/npm同版，投影预演不泄原detail，确认同版且双端/Skill回读',async()=>fixture(async({service,fake,directory})=>{
 assert.equal(fake.control.network,0);assert.equal(service.read().state,'idle');
 assert.equal((await service.check()).state,'available');const preview=await service.preview();assert.equal(preview.state,'preview');assert.equal(fake.control.yes,0);assert.ok(!JSON.stringify(preview).includes('PRIVATE_SETUP_DETAIL'));assert.equal(preview.plan.skillVersion,'43');
 assert.equal((await service.confirm({planId:preview.planId})).state,'succeeded');assert.equal((await service.confirm({planId:preview.planId})).state,'succeeded');assert.equal(fake.control.yes,1);assert.equal(service.versionForDoctor(),'6.5.0');
 assert.equal((await service.check()).state,'current');assert.equal(service.versionForDoctor(),'6.5.0');
 assert.ok(fake.calls.every(c=>c.registry==='https://registry.npmjs.org'));assert.ok(!await readFile(join(directory,'rea-updates/state.json'),'utf8').then(s=>s.includes('PRIVATE_SETUP_DETAIL')));
}));
test('网络/发布同步中/适配失败各自阻断写入',async()=>{
 for(const [mode,state]of [['network','network_failed'],['syncing','syncing'],['adaptation','adaptation_failed']])await fixture(async({service,fake})=>{fake.control.mode=mode;const checked=await service.check();const result=mode==='adaptation'?await service.preview():checked;assert.equal(result.state,state);await assert.rejects(service.confirm({planId:result.planId}));assert.equal(fake.control.yes,0);});
});
test('预演过期/新计划漂移/额外动作禁止确认，固定计划ID不接受任意版本',async()=>{
 let time=1;await fixture(async({service,fake})=>{await service.check();let p=await service.preview();time=300002;await assert.rejects(service.confirm({planId:p.planId}),/失效/);time=2;p=await service.preview();fake.control.planChange=true;assert.equal((await service.confirm({planId:p.planId})).state,'preview_failed');assert.equal(fake.control.yes,0);const bad=fake.plan('6.5.0');bad.plannedActions.unshift({id:'install_hopper'});assert.throws(()=>projectPlan(bad,'6.5.0',fake.doctor('6.5.0')),/未允许/);},{clock:()=>time});
});
test('部分写失败或回读不一致：只查询、禁止新检查预演与重放；修复后的doctor可收口',async()=>{
 for(const mode of ['write-fail','mismatch'])await fixture(async({service,fake})=>{await service.check();const p=await service.preview();fake.control.mode=mode;const result=await service.confirm({planId:p.planId});assert.equal(result.state,mode==='write-fail'?'write_failed':'mismatch');assert.ok(result.plan.actions.some(a=>a.backupPath));await assert.rejects(service.check(),/查询/);await assert.rejects(service.preview(),/查询/);await service.confirm({planId:p.planId});assert.equal(fake.control.yes,1);assert.equal((await service.query()).state,'mismatch');fake.control.installed='6.5.0';assert.equal((await service.query()).state,'succeeded');assert.equal(fake.control.yes,1);});
});
test('重启writing转unknown不自动操作；恢复身份漂移阻止历史批准',async()=>fixture(async({service,fake,directory})=>{
 await service.check();const p=await service.preview();await service.close();const file=join(directory,'rea-updates/state.json');await writeFile(file,JSON.stringify({...p,state:'writing'}));let restored=await createReaUpdater({directory,...fake});assert.equal(restored.read().state,'unknown');assert.equal(fake.control.yes,0);await assert.rejects(restored.preview(),/查询/);await restored.close();await writeFile(file,JSON.stringify({...p,identity:'different'}));restored=await createReaUpdater({directory,...fake});assert.equal(restored.read().state,'idle');await assert.rejects(restored.confirm({planId:p.planId}),/失效/);assert.equal(fake.control.yes,0);await restored.close();
}));
test('runner占用与并发更新在await之前阻止另一操作',async()=>{
 await fixture(async({service,fake})=>{await assert.rejects(service.check(),/正在|已有/);assert.equal(fake.control.network,0);},{externalBusy:()=>true});
 await fixture(async({service})=>{const a=service.check();await assert.rejects(service.check(),/已有/);await a;});
});
test('适配同时检查CLI/MCP，拒缺字段/新增必需参数，允许本地ref和union指定分支',()=>{
 assert.equal(checkCompatibility(fakeInventory(),fakeTools()).ok,true);
 const forbidden=fakeTools();forbidden[0].inputSchema.not={required:['detail']};assert.equal(checkCompatibility(fakeInventory(),forbidden).ok,false);
 const cli=fakeInventory();delete cli.commands[0].schema.options.properties.integrityPolicy;assert.equal(checkCompatibility(cli,fakeTools()).ok,false);
 const tools=fakeTools();tools[0].inputSchema.required.push('new_required');assert.equal(checkCompatibility(fakeInventory(),tools).ok,false);
 const root={$defs:{x:{type:'string',enum:['summary']}},type:'object',properties:{detail:{$ref:'#/$defs/x'}},required:['detail']};assert.equal(accepts(root,{detail:'summary'}),true);assert.equal(accepts(root,{detail:'complete'}),false);root.properties.detail.enum=['complete'];assert.equal(accepts(root,{detail:'summary'}),false);delete root.properties.detail.enum;assert.equal(accepts({anyOf:[root,{type:'string'}]},{detail:'summary'}),false); // ref must resolve within its actual document
 assert.equal(accepts({anyOf:[{type:'object',properties:{kind:{const:'summary'}},required:['kind']},{type:'string'}]},{kind:'summary'}),true);
});
test('MCP适配探针只initialize/tools-list，固定候选/清空目标环境，不执行工具',async()=>{
 const directory=await mkdtemp(join(tmpdir(),'rea-mcp-probe-')),output=join(directory,'calls.json');
 const probe=createMcpProbe({command:process.execPath,prefix:[fileURLToPath(new URL('./fake-rea-mcp.mjs',import.meta.url)),output]});
 try{process.env.HOPPER_TARGET_PATH='/never-open';const result=await probe('6.5.0',{signal:AbortSignal.timeout(5000)});assert.equal(result.length,5);const read=JSON.parse(await readFile(output,'utf8'));assert.deepEqual(read.methods,['initialize','notifications/initialized','tools/list']);assert.equal(read.target,null);assert.equal(read.profile,'full');}finally{delete process.env.HOPPER_TARGET_PATH;await rm(directory,{recursive:true,force:true});}
});


test('外部已更新版本通过共同注册再offline核验；同版Skill异常可修复预演',async()=>fixture(async({service,fake})=>{
 fake.control.installed='6.5.0';assert.equal((await service.check()).state,'current');assert.deepEqual(fake.calls.filter(c=>c.args[0]==='doctor').map(c=>c.version),['6.4.0','6.5.0']);
 fake.control.skillMissing=true;assert.equal((await service.check()).state,'available');assert.equal((await service.preview()).state,'preview');assert.equal(fake.control.yes,0);
}));
test('更新超时或服务关闭保留待核对，不重放setup',async()=>{
 await fixture(async({service,fake})=>{await service.check();const p=await service.preview();fake.control.mode='hang';assert.equal((await service.confirm({planId:p.planId})).state,'write_failed');assert.equal(fake.control.yes,1);},{timeoutMs:80});
 await fixture(async({service,fake})=>{await service.check();const p=await service.preview();fake.control.mode='hang';let started;const yes=new Promise(r=>started=r);fake.control.onYes=started;const confirming=service.confirm({planId:p.planId});await yes;await service.close();assert.equal((await confirming).state,'write_failed');assert.equal(fake.control.yes,1);});
});
test('更新账本进入完整备份，原始诊断仍排除',async()=>fixture(async({service,directory})=>{
 const repo=await openRepository(directory);try{await repo.write(seed(),{initialize:true});await service.check();await service.preview();const backup=await packDirectory(directory);assert.ok(backup.manifest.files.some(f=>f.path==='rea-updates/state.json'));assert.ok(!backup.manifest.files.some(f=>f.path.startsWith('reverse-evidence/')));}finally{await repo.close();}
}));

test('确认适配检查耗尽预演有效期时不写入',async()=>{
 let time=0,probes=0;await fixture(async({service,fake})=>{await service.check();const p=await service.preview();assert.equal((await service.confirm({planId:p.planId})).state,'preview_failed');assert.equal(fake.control.yes,0);},{clock:()=>time,probe:async()=>{if(++probes===2)time=300001;return fakeTools();}});
});


test('更新检查经过真实假子进程读取大于70KiB且exit1的doctor，不误报网络失败',async()=>{
 const directory=await mkdtemp(join(tmpdir(),'rea-large-doctor-')),fake=fakeUpdate();
 const processDoctor=createReaProcess({command:process.execPath,prefix:[fileURLToPath(new URL('./fake-rea.mjs',import.meta.url))]});let service;
 try{
  service=await createReaUpdater({directory,...fake,execute:(version,args,output,options)=>args[0]==='doctor'?processDoctor(version,args,output,options):fake.execute(version,args,output,options)});
  const result=await service.check();assert.equal(result.state,'available',result.message);assert.equal(result.current.version,'6.4.0');
  assert.equal(fake.control.yes,0);assert.ok(!JSON.stringify(result).includes('diagnostics'));assert.ok(!(await readFile(join(directory,'rea-updates/state.json'),'utf8')).includes('diagnostics'));
 }finally{await service?.close();await rm(directory,{recursive:true,force:true});}
});
