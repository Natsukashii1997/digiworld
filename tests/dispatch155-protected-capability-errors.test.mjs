// 派单155：C06错误归一限定授权/模型/常驻；保护Night/Agent/Vault原错误口径。
// 工厂与路由纯合成桩，文件系统/网络/钥匙串/CLI/5178全部拒绝；不创建真实fixture文件。
import test from 'node:test';
import assert from 'node:assert/strict';
import {createCapabilitiesHttp} from '../server/capabilities-http.mjs';

const oldMessage='能力操作被拒绝，请核对授权、来源或原操作记录；未自动重试';
const unavailableMessage='钥匙串不可用：钥匙串锁定或当前会话不能交互；未保存到明文，请先处理钥匙串后重新预览';
function fixture(){
 let hostCalls=0;
 const deny=()=>{hostCalls++;assert.fail('不能访问真实文件系统、网络、CLI、钥匙串或5178');};
 const repository={directory:'/synthetic/workbench/error-scope',read:deny,write:deny,withSnapshot:deny};
 const filesystem=new Proxy({}, {get:()=>deny});
 const adapters={capabilityFilesystem:filesystem,daemonEnvironment:()=>({}),daemonLaunchctl:deny,daemonPortOccupied:deny,
  modelKeychain:{has:deny,get:deny,set:deny,prepareExpected:deny,applyExpected:deny,createBackup:deny,rollback:deny},
  runKeychainHelper:deny,modelTransport:deny,resolveBookInput:deny,inspectNightTask:deny,nightProxyFactory:deny,
  nightRunProcess:deny,nightInspectStoppedProcess:deny,inspectAgentInventory:deny,inspectAgentPrograms:deny,
  checkAgentWriteMetadata:deny,vaultWrite:{filesystem}};
 const api=createCapabilitiesHttp(repository,{adapters,clock:()=>Date.parse('2026-10-04T12:00:00Z')});
 assert.equal(hostCalls,0,'纯构造必须零宿主动作');
 return{api,repository,hostCalls:()=>hostCalls};
}
const injected=code=>Object.assign(new Error('合成原服务错误'),{code,...code==='KEYCHAIN_UNAVAILABLE'?{reasonCode:'LOCKED'}:{}});
const throws=code=>async()=>{throw injected(code);};
function oldError(error){
 assert.equal(error.status,409);assert.equal(error.message,oldMessage);
 assert.equal(Object.hasOwn(error,'operationNotStarted'),false,'受保护能力不能新增失败语义');
 return true;
}
for(const action of ['confirm','rollback'])for(const code of ['PREVIEW_EXPIRED','KEYCHAIN_UNAVAILABLE']){
 test(`Night ${action} ${code}保持原409与精确文案，不加operationNotStarted，宿主0`,async()=>{
  const f=fixture();f.api.night[action]=throws(code);
  await assert.rejects(f.api.dispatch('/api/capabilities/night/'+action,'POST',{token:'synthetic-token',operationId:'synthetic-operation',confirmed:true}),oldError);
  assert.equal(f.hostCalls(),0);
 });
}
for(const capability of ['agent','vault'])for(const code of ['PREVIEW_EXPIRED','KEYCHAIN_UNAVAILABLE']){
 test(`${capability} ${code}仍由旧409白名单处理，宿主0`,async()=>{
  const f=fixture();
  if(capability==='agent')f.repository.read=throws(code);else f.api.settings.get=throws(code);
  await assert.rejects(f.api.dispatch('/api/capabilities/'+capability+'/'+(capability==='agent'?'inspect':'status'),capability==='agent'?'POST':'GET',capability==='agent'?{targetId:'synthetic-target'}:undefined),oldError);
  assert.equal(f.hostCalls(),0);
 });
}
for(const capability of ['settings','model','daemon']){
 test(`${capability} PREVIEW_EXPIRED保留C06的410精确文案与单次确认语义`,async()=>{
  const f=fixture();if(capability==='settings')f.api.settings.read=throws('PREVIEW_EXPIRED');else f.api.settings.get=throws('PREVIEW_EXPIRED');
  await assert.rejects(f.api.dispatch('/api/capabilities/'+capability+'/status','GET'),e=>{
   assert.equal(e.status,410);assert.equal(e.message,'预览已失效，请重新预览');assert.equal(e.operationNotStarted,true);return true;
  });assert.equal(f.hostCalls(),0);
 });
}
test('只有model KEYCHAIN_UNAVAILABLE归一503白名单原因，宿主0',async()=>{
 const f=fixture();f.api.settings.get=throws('KEYCHAIN_UNAVAILABLE');
 await assert.rejects(f.api.dispatch('/api/capabilities/model/status','GET'),e=>{
  assert.equal(e.status,503);assert.equal(e.message,unavailableMessage);assert.equal(e.operationNotStarted,true);return true;
 });assert.equal(f.hostCalls(),0);
});
for(const capability of ['settings','daemon']){
 test(`${capability} KEYCHAIN_UNAVAILABLE不扩大C06范围，保留原409，宿主0`,async()=>{
  const f=fixture();if(capability==='settings')f.api.settings.read=throws('KEYCHAIN_UNAVAILABLE');else f.api.settings.get=throws('KEYCHAIN_UNAVAILABLE');
  await assert.rejects(f.api.dispatch('/api/capabilities/'+capability+'/status','GET'),oldError);assert.equal(f.hostCalls(),0);
 });
}
test('Night已有status的错误保持原状态及文案，宿主0',async()=>{
 const f=fixture();f.api.night.confirm=async()=>{throw Object.assign(injected('PREVIEW_EXPIRED'),{status:422});};
 await assert.rejects(f.api.dispatch('/api/capabilities/night/confirm','POST',{confirmed:true}),e=>{
  assert.equal(e.status,422);assert.equal(e.message,'合成原服务错误');assert.equal(Object.hasOwn(e,'operationNotStarted'),false);return true;
 });assert.equal(f.hostCalls(),0);
});
