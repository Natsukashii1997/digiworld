import React,{useEffect,useRef,useState} from 'react';
import {Button,Dialog} from './components.jsx';
import {PageChoices} from './PageChoices.jsx';
import {request} from './api.js';
import {OperationReview,CapabilityResult,CapabilityHistory,useCapabilityAction,useCapabilityBusy} from './capability-ui-core.jsx';
import './capability-ui-core.css';
import './model-capability-ui.css';
import {ModelUsageSummary} from './ModelUsageSummary.jsx';
const ROUTE='/capabilities/model';
const call=(path,input)=>request(ROUTE+path,input,input===undefined?'GET':'POST',false);
const ACTIONS=[['summary','摘要'],['highlights','精华'],['question','追问']];
const money=value=>Number.isSafeInteger(value)?`$${(value/1e6).toFixed(6)} USD`:'待接入数据：成本未知';
function ModelUsage({result}){return result&&<div className="capability-usage"><p>本机成本回执：{money(result.costMicrosUsd)} · 账单：未知，未核验</p>{result.usage&&<pre aria-label="本次模型用量">{JSON.stringify(result.usage,null,2)}</pre>}{result.costSource&&<p>价格来源：{result.costSource}</p>}{result.priceSource&&<p>价格来源：{result.priceSource}</p>}</div>;}
// 首次只读本机授权和连接意向。钥匙串、书正文及网络均需显式预览/确认。
function ModelPanel({book,initialAction='summary',navigate,onBusyChange,adoptState}){
 const busyFlag=useCapabilityBusy(onBusyChange);const a=useCapabilityAction(),lock=useRef(false),composition=useRef(false);
 const [status,setStatus]=useState(null),[loading,setLoading]=useState(true),[provider,setProvider]=useState('anthropic'),[model,setModel]=useState(''),[key,setKey]=useState('');
 const [action,setAction]=useState(initialAction),[question,setQuestion]=useState(''),[plan,setPlan]=useState(null),[planKind,setPlanKind]=useState(''),[result,setResult]=useState(null),[unresolved,setUnresolved]=useState(false),[rows,setRows]=useState(null),[output,setOutput]=useState(null);
 useEffect(()=>{let live=true;call('/status').then(v=>{if(live){setStatus(v);setProvider(v.provider||'anthropic');setModel(v.model||'');}}).catch(e=>live&&a.setError(e.message)).finally(()=>live&&setLoading(false));return()=>{live=false;};},[]);
 async function run(fn){if(lock.current)return null;lock.current=true;busyFlag('main',true);try{return await a.run(fn);}finally{lock.current=false;busyFlag('main',false);}}
 async function preview(kind,event){event?.preventDefault();if(lock.current||composition.current||unresolved||!status?.enabled)return;
  const input=kind==='credentials'?{provider,model,key}:kind==='book'?{bookId:book.id,action,...(action==='question'?{question}: {})}:{};
  const value=await run(()=>call(kind==='credentials'?'/preview-credentials':kind==='book'?'/preview-book':'/preview-test',input));
  if(value){setPlan(value);setPlanKind(kind);setResult(null);setOutput(null);}
 }
 async function adoptIntent(){if(!adoptState)return;try{adoptState(await request('/workspace',undefined,'GET',false));}catch(e){a.setError('凭据写入已回读，但工作台状态未刷新：'+e.message);}}
 async function apply(){if(!plan||unresolved||lock.current)return;const id=plan.operationId,kind=planKind;if(kind==='credentials')setKey('');
  const value=await run(async()=>{const v=await call(kind==='credentials'?'/apply-credentials':kind==='book'?'/confirm-book':'/confirm-test',{token:plan.token,operationId:id,confirmed:true});if(kind==='credentials'&&v.status==='verified')await adoptIntent();return v;});
  if(value){setResult({...value,operationId:value.operationId||id});setUnresolved(['unknown','running'].includes(value.status));setPlan(null);}
  else if(a.lastError.current&&!a.lastError.current.operationNotStarted){setResult({operationId:id,status:'unknown',reason:a.lastError.current.message});setUnresolved(true);setPlan(null);}
 }
 async function check(){if(!result?.operationId)return;const value=await run(async()=>{const v=await call('/check',{operationId:result.operationId});if(planKind==='credentials'&&v.status==='verified')await adoptIntent();return v;});if(value){setResult({...value,operationId:value.operationId||result.operationId});setUnresolved(['unknown','running'].includes(value.status));}}
 async function read(){if(result?.status!=='verified'||!result?.outputArtifactRef)return;const value=await run(()=>call('/read',{operationId:result.operationId}));if(value)setOutput(value);}
 async function history(){const value=await run(()=>call('/history'));if(value)setRows(Array.isArray(value)?value:value.items);}
 async function readHistory(row){if(row.status!=='verified'||!row.outputArtifactRef)return;const value=await run(()=>call('/read',{operationId:row.operationId}));if(value)setOutput(value);}
 function enter(e){if(e.key!=='Enter')return;if(e.currentTarget.tagName==='TEXTAREA'){if(e.nativeEvent.isComposing||e.nativeEvent.keyCode===229||composition.current)e.preventDefault();return;}e.preventDefault();if(e.nativeEvent.isComposing||e.nativeEvent.keyCode===229||composition.current||lock.current||unresolved)return;e.currentTarget.form?.requestSubmit();}
 const ime={onCompositionStart:()=>{composition.current=true;},onCompositionEnd:()=>{composition.current=false;},onKeyDown:enter};
 return <section className="capability-console model-capability-console" aria-label={book?'单书模型操作':'真实模型连接'}>
  <h2>{book?'单书模型操作':'真实模型连接'}</h2><p>默认关闭。仅支持固定官方 OpenAI / Anthropic 地址；凭据只保存在系统钥匙串。每次真实请求先展示内容与费用；不会替其他 Agent 切换模型。</p>
  {loading&&<p role="status">正在读取本机模型授权…</p>}{!loading&&!status&&<p>本机模型授权未知，真实连接保持关闭。</p>}
  {status&&!status.enabled&&<><p>模型/API 能力默认关闭，请先在设置的能力授权中启用。</p>{book&&<Button type="button" secondary onClick={()=>navigate?.('settings')}>去设置模型授权</Button>}</>}
  {status?.enabled&&<>
   <p>连接意向：{status.provider||'待配置'} · {status.model||'待配置'}</p><p>{status.credentialStatus||'凭据状态待用户点击核验'}</p>
   {!plan&&!book&&<form aria-label="真实模型凭据预览" className="capability-form" onSubmit={e=>preview('credentials',e)}>
    <PageChoices label="真实模型提供方" choices={[['anthropic','Anthropic'],['openai','OpenAI']]} value={provider} onChange={setProvider}/>
    <label>真实模型 ID<input required maxLength={128} autoComplete="off" value={model} onChange={e=>setModel(e.target.value)} {...ime}/></label>
    <label>API Key（仅钥匙串）<input required type="password" minLength={8} maxLength={4096} autoComplete="off" value={key} onChange={e=>setKey(e.target.value)} {...ime}/></label>
    <p>输入只发送给本机受控接口生成凭据预览；预览响应与历史不含 Key。开始保存后清空输入。</p>
    <Button type="submit" disabled={a.busy||unresolved}>预览保存到钥匙串</Button>
   </form>}
   {!plan&&!book&&<Button secondary type="button" disabled={a.busy||unresolved} onClick={()=>preview('test')}>预览一次连接测试</Button>}
   {!plan&&book&&<form aria-label="单书请求预览" className="capability-form" onSubmit={e=>preview('book',e)}>
    <p>书籍：{book.name}。仅用已登记书籍 ID；点击生成预览才读取这一册的有界正文。</p>
    <PageChoices label={`单书操作：${book.id}`} choices={ACTIONS} value={action} onChange={setAction}/>
    {action==='question'&&<label>本次追问<textarea aria-label="本次追问" required maxLength={2048} rows={4} value={question} onChange={e=>setQuestion(e.target.value)} {...ime}/></label>}
    <Button type="submit" disabled={a.busy||unresolved}>生成单书请求预览</Button>
   </form>}
   {plan&&<><OperationReview plan={plan} onCancel={()=>setPlan(null)} onConfirm={apply} busy={a.busy} error={a.error} label={planKind==='credentials'?'确认保存这次模型凭据':planKind==='book'?'确认发送这次单书请求':'确认执行这次连接测试'}/>{plan.sourceSha256&&<small>本次书源 SHA256：{plan.sourceSha256}</small>}{plan.priceSource&&<p>费用预估来源：{plan.priceSource}</p>}</>}
   {unresolved&&<p role="status">本次操作结果未知或仍在执行。已停止新预览和再次确认；请只查询原操作。</p>}
   {result?.operationId&&<Button secondary type="button" disabled={a.busy} onClick={check}>查询本次模型操作结果</Button>}
   <CapabilityResult result={result}/><ModelUsage result={result}/>
   {result?.models&&<details open><summary>本次模型清单（只读响应）</summary><pre>{result.models.join('\n')}</pre></details>}
   {result?.status==='verified'&&result.outputArtifactRef&&<Button secondary type="button" disabled={a.busy} onClick={read}>读取本次模型结果</Button>}
   {output&&<section aria-label="本次模型正文"><h3>本次模型结果</h3><small>回读 SHA256：{output.sha256}</small><pre>{output.text}</pre></section>}
   <Button secondary type="button" disabled={a.busy} onClick={history}>读取本机模型操作与用量记录</Button>
   {rows&&<><ModelUsageSummary rows={rows}/><section aria-label="模型逐次用量"><h3>模型逐次用量</h3><p>以下是本机回执；账单未知，不代表提供方实际扣款。</p><ul>{rows.map(r=><li key={r.operationId}><strong>{r.at||'时间未知'} · {r.provider||'提供方未知'} · {r.model||'模型未知'}</strong><small>{r.operationId}</small><ModelUsage result={r}/>{r.status==='verified'&&r.outputArtifactRef&&<Button type="button" secondary disabled={a.busy} aria-label={`读取历史模型结果 ${r.operationId}`} onClick={()=>readHistory(r)}>读取这次模型结果</Button>}</li>)}</ul></section>{!unresolved&&<CapabilityHistory route={ROUTE} label="模型操作记录" rows={rows} onChanged={async()=>{await adoptIntent();await history();}} onBusyChange={v=>busyFlag('history',v)}/>}</>}
  </>}
  {!plan&&a.error&&<p role="alert" className="inline-error">{a.error}</p>}
 </section>;
}
export function ModelCapabilityUI({onBusyChange,adoptState}){return <ModelPanel onBusyChange={onBusyChange} adoptState={adoptState}/>;}
export function BookModelActions({book,navigate}){
 const [mode,setMode]=useState(''),busy=useRef(false);
 return <><div className="form-actions book-model-actions">{ACTIONS.map(([id,label])=><Button key={id} secondary type="button" aria-label={`${label}：${book.name}（${book.id}）`} onClick={()=>setMode(id)}>{label}</Button>)}</div>
  {mode&&<Dialog drawer recoverFocus title={`单书${ACTIONS.find(([id])=>id===mode)?.[1]||'模型操作'}`} onClose={()=>!busy.current&&setMode('')}><ModelPanel book={book} initialAction={mode} navigate={page=>{if(!busy.current){setMode('');navigate?.(page);}}} onBusyChange={value=>{busy.current=value;}}/></Dialog>}</>;
}
