import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,symlink,rm,readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createReaProcess,registeredVersion} from '../server/reverse-process.mjs';

async function installation(){
 const directory=await mkdtemp(join(tmpdir(),'rea launch ')),bin=join(directory,'runtime bin');await mkdir(bin);
 await symlink(process.execPath,join(bin,'node'));
 await writeFile(join(bin,'npx'),'#!/usr/bin/env node\nimport('+JSON.stringify(new URL('./fake-rea.mjs',import.meta.url).href)+');\n',{mode:0o700});
 return {directory,bin,options:{home:directory,nodePath:join(bin,'node'),standardDirectories:[]},environment:{PATH:'/usr/bin:/bin',HOME:directory},close:()=>rm(directory,{recursive:true,force:true})};
}
test('launchd精简PATH通过Node同目录npx执行大doctor，支持空格路径和Node符号链接且不修改环境',async()=>{
 const app=await installation();try{
  const before={...app.environment},execute=createReaProcess({executableOptions:app.options});
  const body=await execute('6.4.0',['doctor'],join(app.directory,'doctor.json'),{offline:true,environment:app.environment});
  assert.equal(registeredVersion(body).version,'6.4.0');assert.deepEqual(app.environment,before);
 }finally{await app.close();}
});

import {createMcpProbe} from '../server/rea-compat.mjs';
import {fixture} from './fixture.mjs';
import {seed} from '../src/store.js';
import {createSpecimen} from '../src/reverse-recipe.js';
import {randomUUID} from 'node:crypto';
test('MCP预演探针也在精简PATH经匹配Node启动npx，只读取工具清单',async()=>{
 const app=await installation();try{
  const output=join(app.directory,'mcp-calls.json');
  await writeFile(join(app.bin,'npx'),'#!/usr/bin/env node\nprocess.argv=[process.argv[0],process.argv[1],'+JSON.stringify(output)+'];import('+JSON.stringify(new URL('./fake-rea-mcp.mjs',import.meta.url).href)+');\n',{mode:0o700});
  const tools=await createMcpProbe({executableOptions:app.options})('6.5.0',{environment:app.environment,signal:AbortSignal.timeout(3000)});
  assert.equal(tools.length,5);assert.deepEqual(JSON.parse(await readFile(output,'utf8')).methods,['initialize','notifications/initialized','tools/list']);
 }finally{await app.close();}
});
test('缺少可执行文件时版本/更新API返回可读503；开始接口已下线回410（#111）；不联网或创建运行记录',async()=>{
 const missing=createReaProcess({command:'/synthetic-no-such-tool/npx'});let network=0;
 const app=await fixture({reverse:{execute:missing},reaUpdate:{execute:missing,fetchImpl:async()=>{network++;throw Error('禁止网络');}}});
 try{
  const target=join(app.directory,'fixture.asar');await writeFile(target,'synthetic');const state=seed();
  const record=createSpecimen({type:'FN',target:{kind:'electron',path:target,feature:'copy',clues:['copy'],authorized:true}});state.reverseRecords=[record];await app.repository.write(state,{initialize:true});
  const {token}=await (await fetch(app.url+'/api/session',{headers:{'x-workbench-client':'1'}})).json();
  const headers={'x-workbench-token':token,'content-type':'application/json'};
  const post=(path,input={})=>fetch(app.url+'/api/reverse/'+path,{method:'POST',headers,body:JSON.stringify(input)});
  const checked=await (await post('target/check',{path:target})).json();
  const revision=(await app.repository.read()).revision;
  assert.equal((await post('runs/start',{recordId:record.id,requestId:randomUUID(),expectedRevision:revision,checkId:checked.checkId})).status,410);
  for(const response of [await fetch(app.url+'/api/reverse/status',{headers}),await post('update/check')]){
   assert.equal(response.status,503);assert.match((await response.json()).error,/npx.*未找到/);
  }
  const after=await app.repository.read();assert.equal(after.revision,revision);assert.ok(!after.reverseRecords[0].reaRuns?.length);assert.equal(network,0);
 }finally{await app.close();}
});

import {rename,chmod} from 'node:fs/promises';
test('常驻独立Node没有npm时仅枚举nvm版本入口，选最新版本并支持npx符号链接',async()=>{
 const app=await installation();try{
  const nvmBin=join(app.directory,'.nvm/versions/node/v24.16.0/bin'),older=join(app.directory,'.nvm/versions/node/v22.1.0/bin');await mkdir(nvmBin,{recursive:true});await mkdir(older,{recursive:true});
  await rename(join(app.bin,'npx'),join(nvmBin,'npx-cli.mjs'));await symlink('npx-cli.mjs',join(nvmBin,'npx'));await symlink(process.execPath,join(nvmBin,'node'));
  await writeFile(join(older,'npx'),'#!/usr/bin/env node\nprocess.exit(99);\n',{mode:0o700});
  const lines=[],execute=createReaProcess({executableOptions:app.options});const body=await execute('6.4.0',['doctor'],join(app.directory,'doctor-nvm.json'),{offline:true,environment:app.environment,onLine:l=>lines.push(l)});
  assert.equal(registeredVersion(body).version,'6.4.0');assert.ok(lines.some(l=>l.includes('v24.16.0/bin/npx-cli.mjs')));
 }finally{await app.close();}
});
test('不可执行文件和目录不冒充可用程序；不执行登录shell或回退到真实REA',async()=>{
 const app=await installation();try{
  await chmod(join(app.bin,'npx'),0o600);
  await assert.rejects(createReaProcess({command:join(app.bin,'npx')})('6.4.0',['doctor'],join(app.directory,'denied.json')),(e)=>e.kind==='launch'&&e.status===503&&e.code==='EACCES');
  await assert.rejects(createMcpProbe({command:app.bin})('6.5.0',{}),(e)=>e.kind==='launch'&&e.status===503);
 }finally{await app.close();}
});
test('显式绝对可执行路径不枚举无关home安装目录',async()=>{
 const app=await installation();try{
  await symlink('.nvm',join(app.directory,'.nvm'));
  const execute=createReaProcess({command:join(app.bin,'npx'),executableOptions:app.options});
  const body=await execute('6.4.0',['doctor'],join(app.directory,'absolute.json'),{environment:app.environment});
  assert.equal(registeredVersion(body).version,'6.4.0');
 }finally{await app.close();}
});
