import React,{useRef,useState} from 'react';
import {Button} from './components.jsx';
import {request} from './api.js';
// 确认页只呈现服务端派生的对象、精确变化与费用；不回显凭据，不盲重试未知操作。
export function useCapabilityAction(onBusyChange){const lock=useRef(false),lastError=useRef(null),[busy,setBusy]=useState(false),[error,setError]=useState('');async function run(fn){if(lock.current)return;lock.current=true;setBusy(true);onBusyChange?.(true);setError('');lastError.current=null;try{return await fn();}catch(e){lastError.current=e;setError(e.message||'操作结果无法确认，请查询记录');return null;}finally{lock.current=false;setBusy(false);onBusyChange?.(false);}}return{run,busy,error,setError,lastError,isBusy:()=>lock.current};}
export function useCapabilityBusy(onBusyChange){const flags=useRef(new Map());return(source,value)=>{flags.current.set(source,value);onBusyChange?.([...flags.current.values()].some(Boolean));};}
const statusLabel={verified:'写后回读一致',matches_after:'文件与本次写后版本一致',matches_before:'仍为写前版本',not_applied:'尚未写入',not_started:'尚未开始',unknown:'结果未知，请先查询',changed:'文件已有外部变化',rolled_back:'回滚已回读',unchecked:'历史回执，尚未核对当前文件',waiting_for_user_restart:'等待本人在终端处理服务'};
export function CapabilityResult({result}){return result&&<div className="capability-result" role="status"><strong>{statusLabel[result.status]||result.status||'已返回本机记录'}</strong>{(result.reason||result.message)&&<p>{result.reason||result.message}</p>}{result.operationId&&<small>操作编号：{result.operationId}</small>}{result.adoption==='unverified'&&<p>文件已写入不代表 Agent 已采用；请在原生 Agent 中确认。</p>}</div>;}
export function CapabilityPreview({plan}){
 if(!plan)return null;
 return <div className="capability-preview" role="region" aria-label="本次操作预览">
  <strong>{plan.action||plan.kind||'本次变更'}</strong>
  {(plan.target||plan.path||plan.endpoint)&&<p>目标：{plan.target||plan.path||plan.endpoint}</p>}
  {plan.provider&&<p>提供方：{plan.provider} · 模型：{plan.model||'模型清单'}</p>}
  {plan.credential&&<p>{plan.credential}</p>}
  {plan.request&&<p>{plan.request}</p>}
  {plan.backup&&<p>{plan.backup}</p>}
  {plan.inputBytes!=null&&<p>预计发送 {plan.inputBytes} 字节 · 输入 tokens 保守上界 {plan.estimatedUpperInputTokens} · 输出最多 {plan.maxOutputTokens}</p>}
  {plan.estimateMicrosUsd!=null&&<p>费用保守预估 ${ (plan.estimateMicrosUsd/1e6).toFixed(6) } USD</p>}
  {plan.costMessage&&<p>{plan.costMessage}</p>}{plan.estimatedCost&&<p>{plan.estimatedCost}</p>}
  {plan.canConfirm===false&&<p role="alert">费用或授权无法核验；待接入数据，本次不能执行。</p>}
  {plan.fee&&<p>{plan.fee}</p>}
  {plan.changes&&<ul>{plan.changes.map((c,i)=><li key={c.path||i}><strong>{c.path}</strong><small>原 {c.beforeHash||'不存在'} → 新 {c.afterHash||'不存在'} · {c.size||0} 字节</small>{typeof c.before==='string'&&<pre aria-label='变更前片段'>{c.before||'不存在'}</pre>}{typeof c.after==='string'&&<pre aria-label='变更后片段'>{c.after}</pre>}</li>)}</ul>}
  {plan.transmittedText&&<details><summary>查看本次完整发送文本</summary><pre>{plan.transmittedText}</pre></details>}
  {typeof plan.before==='string'&&<details open><summary>原文</summary><pre>{plan.before||'不存在'}</pre></details>}
  {typeof plan.after==='string'&&<details open><summary>写入全文</summary><pre>{plan.after}</pre></details>}
  {plan.plist&&<details open><summary>常驻配置全文</summary><pre>{plan.plist}</pre></details>}
  {plan.before&&typeof plan.before==='object'&&<details open><summary>原设置</summary><pre>{JSON.stringify(plan.before,null,2)}</pre></details>}
  {plan.after&&typeof plan.after==='object'&&<details open><summary>新设置</summary><pre>{JSON.stringify(plan.after,null,2)}</pre></details>}
  {plan.beforeSha256&&<small>写前 SHA256：{plan.beforeSha256}</small>}{plan.afterSha256&&<small>写后 SHA256：{plan.afterSha256}</small>}
 </div>;
}
export function OperationReview({plan,onCancel,onConfirm,busy,error,label='确认执行本次操作'}){return <div className="capability-operation"><CapabilityPreview plan={plan}/>{error&&<p role="alert" className="inline-error">{error}</p>}<div className="form-actions"><Button type="button" secondary disabled={busy} onClick={onCancel}>取消本次预览</Button><Button type="button" disabled={busy||plan.canConfirm===false} onClick={onConfirm}>{busy?'正在执行并回读':label}</Button></div></div>;}
export function CapabilityHistory({route,label,rows,onChanged,checkField='operationId',onBusyChange}){
 const a=useCapabilityAction(onBusyChange),[plan,setPlan]=useState(null),[result,setResult]=useState(null),[unresolvedId,setUnresolvedId]=useState(null);
 const id=r=>r.operationId||r.id;
 async function check(r){const value=await a.run(()=>request(route+'/check',{[checkField]:id(r)},'POST',false));if(value){if(!unresolvedId||id(r)===unresolvedId){setResult(value);if(!['unknown','running','unchecked'].includes(value.status))setUnresolvedId(null);}if(!['unknown','running','unchecked'].includes(value.status))await onChanged?.();}}
 async function preview(r){if(unresolvedId)return;const value=await a.run(()=>request(route+'/rollback-preview',{[checkField]:id(r)},'POST',false));if(value)setPlan(value);}
 async function apply(){const value=await a.run(()=>request(route+'/rollback',{token:plan.token,operationId:plan.operationId,confirmed:true},'POST',false));if(value){setResult(value);setPlan(null);if(['unknown','running'].includes(value.status))setUnresolvedId(plan.operationId);else await onChanged?.();}else if(a.lastError.current&&!a.lastError.current.operationNotStarted){setResult({operationId:plan.operationId,status:'unknown'});setUnresolvedId(plan.operationId);setPlan(null);}}
 return <section className="capability-history" aria-label={label}><h3>{label}</h3>{!rows?.length&&<p>尚无操作记录。</p>}<ul>{rows?.map(r=><li key={id(r)}><strong>{r.action||r.kind||'操作'} · {r.at||r.completedAt||'时间未知'}</strong><small>{id(r)} · {statusLabel[r.status]||r.status||'历史回执'}</small><div className="heading-actions"><Button secondary type="button" disabled={a.busy} onClick={()=>check(r)} aria-label={`查询${label} ${id(r)}`}>查询本次结果</Button><Button secondary type="button" disabled={a.busy||!!unresolvedId} onClick={()=>preview(r)} aria-label={`预览回滚${label} ${id(r)}`}>预览回滚</Button></div></li>)}</ul>{unresolvedId&&<><p role="status">回滚结果未知，只查询原操作编号，不再次写入。</p><Button secondary type="button" disabled={a.busy} onClick={()=>check({operationId:unresolvedId})}>查询未确认的回滚操作</Button></>}{a.error&&<p role="alert">{a.error}</p>}<CapabilityResult result={result}/>{plan&&<OperationReview plan={plan} onCancel={()=>setPlan(null)} onConfirm={apply} busy={a.busy} error={a.error} label="确认回滚本次操作"/>}</section>;
}
