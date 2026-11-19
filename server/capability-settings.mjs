// 四类能力和常驻的本机授权设置；导入与创建无宿主访问。仅保存非凭据白名单字段。
import fs from 'node:fs/promises';
import {randomUUID,createHash} from 'node:crypto';
import {resolve,dirname} from 'node:path';
import {createConfigJournal} from './config-journal.mjs';
import {failure} from './repository.mjs';
const CAPS=['night','model','agent','vault','daemon'], UUID=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/, SHA=/^[a-f0-9]{64}$/;
const hash=v=>createHash('sha256').update(JSON.stringify(v)).digest('hex');
const exact=(v,keys)=>v&&typeof v==='object'&&!Array.isArray(v)&&Object.keys(v).length===keys.length&&keys.every(k=>Object.hasOwn(v,k));
const reject=m=>{throw failure(m,409);};
const expired=()=>{throw Object.assign(failure('预览已失效，请重新预览',410),{code:'PREVIEW_EXPIRED',operationNotStarted:true});};
const folder=p=>typeof p==='string'&&p.length>0&&p.length<=300&&!/[\\:\x00-\x1f\x7f]/.test(p)&&p.split('/').every(x=>x&&x!=='.'&&x!=='..'&&x===x.trim()&&!x.startsWith('.'));
const int=(n,a,b)=>Number.isSafeInteger(n)&&n>=a&&n<=b;
function optionsOf(cap,o){
 if(!o||typeof o!=='object'||Array.isArray(o))reject('能力设置无效');
 if(cap==='vault'){
  if(!exact(o,['sourceId','notesFolder','profileFolders'])||typeof o.sourceId!=='string'||!/^[\w-]{1,100}$/.test(o.sourceId)||!folder(o.notesFolder)||!Array.isArray(o.profileFolders)||o.profileFolders.length>10||!o.profileFolders.every(folder)||new Set(o.profileFolders).size!==o.profileFolders.length)reject('Vault 设置须选已连接来源与明确子目录');
 } else if(cap==='night'){
  if(!exact(o,['budgetMicrosUsd','timeoutSeconds','maxTurns'])||!int(o.budgetMicrosUsd,1,100000000)||(!int(o.timeoutSeconds,1,3600)||!int(o.maxTurns,1,20)))reject('夜巡须设置美元停止阈值与单任务超时');
 } else if(cap==='model'){
  if(!exact(o,['budgetMicrosUsd'])||!int(o.budgetMicrosUsd,1,100000000))reject('模型须设置单次美元费用上限');
 } else if(Object.keys(o).length)reject('该能力没有可写选项');
 return structuredClone(o);
}
function tree(v){
 if(!exact(v,['enabled','options'])||!exact(v.enabled,CAPS)||!exact(v.options,CAPS)||!CAPS.every(c=>typeof v.enabled[c]==='boolean'))reject('能力授权记录无效');
 for(const cap of CAPS){const o=v.options[cap];if(!o||typeof o!=='object'||Array.isArray(o))reject('能力设置无效');if(v.enabled[cap]||Object.keys(o).length)optionsOf(cap,o);else if(!exact(o,[]))reject('空能力设置无效');}
 return v;
}
const initial=()=>({enabled:Object.fromEntries(CAPS.map(c=>[c,false])),options:Object.fromEntries(CAPS.map(c=>[c,{}]))});
function validate(row){
 if(!exact(row,['schema','id','kind','restores','sequence','dataRootIdentity','capability','before','after','beforeSha256','afterSha256','at'])||row.schema!==2||!SHA.test(row.dataRootIdentity)||!UUID.test(row.id)||!['apply','restore'].includes(row.kind)||(row.kind==='apply'?row.restores!==null:!UUID.test(row.restores))||!int(row.sequence,1,100000)||!CAPS.includes(row.capability)||!SHA.test(row.beforeSha256)||!SHA.test(row.afterSha256)||!/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(row.at)||!Number.isFinite(Date.parse(row.at)))reject('能力设置日志无效');
 tree(row.before);tree(row.after);if(hash(row.before)!==row.beforeSha256||hash(row.after)!==row.afterSha256)reject('能力设置日志指纹错误');
 for(const cap of CAPS)if(cap!==row.capability&&(row.before.enabled[cap]!==row.after.enabled[cap]||JSON.stringify(row.before.options[cap])!==JSON.stringify(row.after.options[cap])))reject('设置记录越过所选能力');
 return row;
}
export function createCapabilitySettings(repository,{clock=Date.now,filesystem=fs,onBeforeApply=async()=>{},journalFolder='capability-settings'}={}){
 if(!['capability-settings','agent-model-permissions','skill-pool-permissions'].includes(journalFolder))reject('能力授权日志目录无效');
 const previews=new Map(),attemptedPreviews=new Set();let store=null,identity=null,canonical=null,queue=Promise.resolve();const root=resolve(repository.directory);
 const serial=fn=>{const next=queue.then(fn,fn);queue=next.catch(()=>{});return next;};
 // 祖先链只记跨重启稳定、且关乎安全的字段：dev 每次开机可能变；「/」随系统更新换代；收紧权限（如 chmod 700 家目录）不算变化，放宽到组或其他人可写才算（docs/LESSONS.md L-08）。
 async function journal(){const info=await filesystem.lstat(root),real=await filesystem.realpath(root),after=await filesystem.lstat(root);if(!info.isDirectory()||info.isSymbolicLink()||!after.isDirectory()||after.isSymbolicLink()||info.uid!==process.getuid?.()||info.dev!==after.dev||info.ino!==after.ino||info.birthtimeMs!==after.birthtimeMs)reject('能力设置目录身份已变化');const chain=[];for(let p=real;;p=dirname(p)){const a=await filesystem.lstat(p);if(!a.isDirectory()||a.isSymbolicLink())reject('授权目录祖先不可核验');if(dirname(p)===p)break;chain.push([p,a.ino,a.birthtimeMs,a.uid,a.mode&0o022]);}const key=hash(chain);if(identity&&(identity!==key||canonical!==real))reject('能力设置目录身份已变化');if(!store){identity=key;canonical=real;store=createConfigJournal(real,{filesystem,folder:journalFolder,validate,label:'能力授权'});}return store;}

 async function state({allowPending=false}={}){const rows=await(await journal()).list(),sorted=rows.sort((a,b)=>a.sequence-b.sequence),seen=new Set(),rootIdentity=hash([canonical,identity]);let current=initial(),generation='initial',rowScope=null;for(const row of sorted){if(row.sequence!==seen.size+1||seen.has(row.sequence))reject('能力设置序号冲突或不连续');seen.add(row.sequence);if(rowScope!==row.dataRootIdentity){current=initial();generation='initial';rowScope=row.dataRootIdentity;}if(!row.completedAt&&!allowPending&&row.dataRootIdentity===rootIdentity)reject('能力设置结果尚未明确，请先查询');if(hash(current)!==row.beforeSha256)reject('能力设置历史不连续');current=row.after;generation=row.id;}const activeScope=rowScope===null||rowScope===rootIdentity;if(!activeScope){current=initial();generation='initial';}return{...structuredClone(current),generation,rootIdentity,activeScope,reauthorizationRequired:!activeScope,sequence:sorted.at(-1)?.sequence||0};}

 function keep(plan){for(const [id,p]of previews)if(p.expires<clock())previews.delete(id);if(previews.size>=20)reject('请先处理已有授权预览');const token=randomUUID(),operationId=randomUUID(),expires=clock()+300000;previews.set(token,{...plan,operationId,expires});return{token,operationId,expiresAt:new Date(expires).toISOString(),capability:plan.capability,before:plan.before,after:plan.after,beforeSha256:hash(plan.before),afterSha256:hash(plan.after),backup:'本机授权日志保存原设置；不包含凭据'};}
 const api={
  async read(){const{sequence,rootIdentity,...v}=await state();return v;},
  async get(cap){if(!CAPS.includes(cap))reject('未知能力');const s=await state();return{enabled:s.enabled[cap],generation:s.generation,options:s.options[cap]};},
  async assertEnabled(cap){const gate=await api.get(cap);if(!gate.enabled)reject('此能力默认关闭，请先在设置明确开启');return gate;},
  async preview(input){if(!exact(input,['capability','enabled','options'])||!CAPS.includes(input.capability)||typeof input.enabled!=='boolean')reject('能力授权请求无效');const s=await state(),before={enabled:s.enabled,options:s.options},after=structuredClone(before);after.enabled[input.capability]=input.enabled;after.options[input.capability]=Object.keys(input.options||{}).length?optionsOf(input.capability,input.options):input.enabled?optionsOf(input.capability,input.options):{};if(hash(before)===hash(after))reject('授权设置没有变化');return keep({capability:input.capability,before,after,generation:s.generation,kind:'apply',restores:null});},
  async apply(input){if(!exact(input,['token','operationId','confirmed'])||input.confirmed!==true||!UUID.test(input.operationId))reject('请确认本次能力授权预览');return serial(async()=>repository.withSnapshot({},async()=>{const p=previews.get(input.token);if(!p||p.operationId!==input.operationId||p.expires<=clock()||attemptedPreviews.has(input.token))expired();attemptedPreviews.add(input.token);const prior=await(await journal()).get(input.operationId);if(prior)expired();const s=await state();if(s.generation!==p.generation||hash({enabled:s.enabled,options:s.options})!==hash(p.before))reject('授权已变化，请重新预览');await onBeforeApply({capability:p.capability,before:p.before,after:p.after,operationId:p.operationId});const latest=await state();if(p.expires<=clock()||latest.rootIdentity!==s.rootIdentity||latest.generation!==p.generation||hash({enabled:latest.enabled,options:latest.options})!==hash(p.before))reject('授权预览过期或授权范围已变化');const row={schema:2,dataRootIdentity:s.rootIdentity,id:p.operationId,kind:p.kind,restores:p.restores,sequence:s.sequence+1,capability:p.capability,before:p.before,after:p.after,beforeSha256:hash(p.before),afterSha256:hash(p.after),at:new Date(clock()).toISOString()};const j=await journal();await j.prepare(row);try{await j.complete(row.id,row.at);const read=await state();if(read.generation!==row.id||hash({enabled:read.enabled,options:read.options})!==row.afterSha256)reject('授权回读不一致');previews.delete(input.token);return{operationId:row.id,status:'verified',settings:await api.read()};}catch{throw Object.assign(failure('授权结果未知，请先查询本次记录',503),{unknownResult:true,operationId:row.id});}}));},
  async check(id){if(!UUID.test(id))reject('操作编号无效');const j=await journal(),r=await j.get(id);if(!r)return{operationId:id,status:'not_started'};if(r.dataRootIdentity!==hash([canonical,identity]))return{operationId:id,status:'not_applied',reason:'此授权来自其他数据目录；当前全部关闭，需重新预览开启'};if(!r.completedAt){const current=await state({allowPending:true});if(current.generation!==r.id)return{operationId:id,status:'unknown'};await j.complete(id,new Date(clock()).toISOString());}return{operationId:id,status:'verified',beforeSha256:r.beforeSha256,afterSha256:r.afterSha256};},
  async history(){return{items:(await(await journal()).list()).map(r=>({operationId:r.id,capability:r.capability,kind:r.kind,at:r.at,status:r.dataRootIdentity===hash([canonical,identity])?(r.completedAt?'verified':'unknown'):'not_applied',beforeSha256:r.beforeSha256,afterSha256:r.afterSha256}))};},
  async rollbackPreview(id){const r=await(await journal()).get(id),s=await state();if(!r?.completedAt||r.dataRootIdentity!==s.rootIdentity||s.generation!==r.id||hash({enabled:s.enabled,options:s.options})!==r.afterSha256)reject('仅可回滚仍为当前版本的已核验授权');return keep({capability:r.capability,before:r.after,after:r.before,generation:s.generation,kind:'restore',restores:r.id});},
  async rollback(input){return api.apply(input);},
 };return api;
}
