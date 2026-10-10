// 仅随机端口+本次 owned temp root；钥匙串/Swift/API/launchctl/CLI 全部桩。
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {startServer} from '../server/http.mjs';
import {seed} from '../src/store.js';
import {createSwiftKeychainRunner} from '../server/keychain-runner.mjs';
import {createKeychainAdapter} from '../server/keychain-adapter.mjs';
const key='C06_SYNTHETIC_KEY_ONLY_123456789',privateError='C06_PRIVATE_ADAPTER_ERROR_NEVER_RETURN';
const confirm=p=>({token:p.token,operationId:p.operationId,confirmed:true});
async function setup(t,{helper,transport}={}){
 const counts={keychain:0,http:0,host:0},deny=async()=>{counts.host++;throw new Error('不允许真实宿主调用');};
 const syntheticKeychain=createKeychainAdapter({runHelper:async p=>{counts.keychain++;return helper(p);}});
 const directory=await fs.mkdtemp(join(await fs.realpath(tmpdir()),'guiji-keychain155-'));await fs.chmod(directory,0o700);
 const app=await startServer({directory,port:0,discovery:{modelKeychain:syntheticKeychain,daemonEnvironment:()=>({}),daemonCurrentPid:90071,daemonRuntimeCodeRevision:'0'.repeat(64),modelTransport:async(...a)=>{counts.http++;return transport?transport(...a):deny();},runKeychainHelper:async p=>{counts.keychain++;return helper(p);},resolveBookInput:deny,nightRunProcess:deny,nightProxyFactory:deny,nightInspectStoppedProcess:deny,daemonLaunchctl:deny,daemonPortOccupied:deny}});t.after(async()=>{await app.close();await fs.rm(directory,{recursive:true,force:true});});await app.repository.write(seed(),{initialize:true});
 const session=await(await fetch(app.url+'/api/session',{headers:{'x-workbench-client':'1'}})).json();
 async function call(s,input){const r=await fetch(app.url+'/api'+s,{method:input===undefined?'GET':'POST',headers:{'x-workbench-token':session.token,'content-type':'application/json'},...input===undefined?{}:{body:JSON.stringify(input)}});return{status:r.status,body:await r.json()};}
 return{...app,call,counts,async authorize(){const p=await call('/capabilities/settings/preview',{capability:'model',enabled:true,options:{budgetMicrosUsd:100000}});assert.equal(p.status,200);assert.equal((await call('/capabilities/settings/apply',confirm(p.body))).body.status,'verified');return p.body;}};
}
async function allFiles(folder){const out=[];for(const name of await fs.readdir(folder)){const path=join(folder,name);if((await fs.lstat(path)).isDirectory())out.push(...await allFiles(path));else out.push(await fs.readFile(path,'utf8'));}return out;}
test('HTTP钥匙串锁定明确503原因；首次失败的同一预览重复确认410，零明文/零API/零宿主；check原ID仍可查',async t=>{
 const a=await setup(t,{helper:async()=>{throw Object.assign(new Error(privateError),{code:'KEYCHAIN_UNAVAILABLE',reasonCode:'LOCKED'});}});
 assert.equal((await a.call('/capabilities/model/preview-credentials',{provider:'anthropic',model:'fixture',key})).status,409);assert.equal(a.counts.keychain,0);await a.authorize();
 const p=await a.call('/capabilities/model/preview-credentials',{provider:'anthropic',model:'fixture',key});assert.equal(p.status,200);assert.equal(JSON.stringify(p.body).includes(key),false);const first=await a.call('/capabilities/model/apply-credentials',confirm(p.body));assert.equal(first.status,503);assert.match(first.body.error,/钥匙串不可用.*锁定.*未保存到明文/);assert.equal(first.body.operationNotStarted,true);assert.equal(JSON.stringify(first.body).includes(privateError),false);assert.equal(a.counts.keychain,1);
 const second=await a.call('/capabilities/model/apply-credentials',confirm(p.body));assert.equal(second.status,410);assert.equal(second.body.error,'预览已失效，请重新预览');assert.equal(second.body.operationNotStarted,true);assert.equal(a.counts.keychain,1);assert.equal((await a.call('/capabilities/model/check',{operationId:p.body.operationId})).body.status,'not_started');assert.equal(a.counts.http,0);assert.equal(a.counts.host,0);for(const text of await allFiles(a.repository.directory)){assert.equal(text.includes(key),false);assert.equal(text.includes(privateError),false);}
});
test('HTTP授权已确认预览重复410，原ID查询verified且授权历史恰一条',async t=>{const a=await setup(t,{helper:async()=>{assert.fail('不能访问钥匙串');}}),p=await a.authorize();const second=await a.call('/capabilities/settings/apply',confirm(p));assert.equal(second.status,410);assert.equal(second.body.error,'预览已失效，请重新预览');assert.equal((await a.call('/capabilities/settings/check',{operationId:p.operationId})).body.status,'verified');assert.equal((await a.call('/capabilities/settings/history')).body.items.length,1);assert.equal(a.counts.keychain,0);assert.equal(a.counts.http,0);assert.equal(a.counts.host,0);});
test('HTTP成功连接/模型清单确认再次410；原ID可查，Key写入/只读API次数不增加，全部响应与普通文件零Key',async t=>{
 const map=new Map(),writes=[];const a=await setup(t,{helper:async({action,account,secret})=>{if(action==='has')return{ok:true,exists:map.has(account)};if(action==='get')return map.has(account)?{ok:true,secret:map.get(account)}:{ok:false,code:'CREDENTIAL_MISSING'};if(action==='set'||action==='create'){writes.push(account);map.set(account,secret);return{ok:true};}assert.fail('未授权钥匙串动作');},transport:async()=>new Response(JSON.stringify({data:[{id:'fixture'}]}),{status:200})});await a.authorize();
 const p=await a.call('/capabilities/model/preview-credentials',{provider:'anthropic',model:'fixture',key});const saved=await a.call('/capabilities/model/apply-credentials',confirm(p.body));assert.equal(saved.body.status,'verified',JSON.stringify(saved));const writeCount=writes.length,helperCount=a.counts.keychain;const duplicate=await a.call('/capabilities/model/apply-credentials',confirm(p.body));assert.equal(duplicate.status,410);assert.equal(writes.length,writeCount);assert.equal(a.counts.keychain,helperCount);assert.equal((await a.call('/capabilities/model/check',{operationId:p.body.operationId})).body.status,'verified');
 const testPlan=await a.call('/capabilities/model/preview-test',{});assert.equal(testPlan.status,200);assert.equal((await a.call('/capabilities/model/confirm-test',confirm(testPlan.body))).body.status,'verified');assert.equal(a.counts.http,1);assert.equal((await a.call('/capabilities/model/confirm-test',confirm(testPlan.body))).status,410);assert.equal(a.counts.http,1);assert.equal((await a.call('/capabilities/model/check',{operationId:testPlan.body.operationId})).body.status,'verified');assert.equal(writes.length,writeCount);assert.equal(a.counts.host,0);for(const text of await allFiles(a.repository.directory))assert.equal(text.includes(key),false);
});
test('钥匙串结果 reasonCode 仅白名单，原始错误和未知 reason 不回显；缺系统能力不执行真实helper',async()=>{
 const adapter=createKeychainAdapter({runHelper:async()=>({ok:false,code:'KEYCHAIN_UNAVAILABLE',reasonCode:privateError})});await assert.rejects(adapter.has('anthropic/main'),e=>e.code==='KEYCHAIN_UNAVAILABLE'&&/操作未确认/.test(e.message)&&!e.message.includes(privateError));
 let spawnCalls=0,filesystemCalls=0;const forbidden=()=>{spawnCalls++;assert.fail('不能实际启动Swift');};const absentFS={async lstat(){filesystemCalls++;throw new Error('unavailable');}};
 await assert.rejects(createSwiftKeychainRunner({platform:'linux',filesystem:absentFS,spawn:forbidden})({action:'has',account:'anthropic/main'}),e=>e.reasonCode==='PLATFORM_UNSUPPORTED');assert.equal(filesystemCalls,0);await assert.rejects(createSwiftKeychainRunner({platform:'darwin',filesystem:absentFS,spawn:forbidden})({action:'has',account:'anthropic/main'}),e=>e.reasonCode==='HELPER_UNAVAILABLE');assert.equal(spawnCalls,0);
 const helperFS={async lstat(){return{isFile:()=>true,isSymbolicLink:()=>false,nlink:1,mode:0o600,size:100};},async access(){throw new Error(privateError);}};await assert.rejects(createSwiftKeychainRunner({platform:'darwin',filesystem:helperFS,spawn:forbidden})({action:'has',account:'anthropic/main'}),e=>e.reasonCode==='SWIFT_UNAVAILABLE'&&!e.message.includes(privateError));assert.equal(spawnCalls,0);
});
