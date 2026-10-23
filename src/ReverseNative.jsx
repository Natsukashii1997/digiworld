import React,{useEffect,useRef,useState} from 'react';
import {createPortal} from 'react-dom';
import {Button,Dialog} from './components.jsx';
import {request} from './api.js';
import {ReverseExecutor} from './ReverseExecutor.jsx';
import {approvalOptions,approvalLabel,nativeRunning,persistenceOptions} from './reverse-native-protocol.js';
import './reverse-native.css';

const post=(action,value)=>request('/reverse/native/'+action,value,'POST',false);
const states={starting:'准备中',connecting:'连接中',idle:'可继续',running:'分析中',disconnected:'已断开'};
const initialQuestion=record=>`使用 REA 分析以下我拥有或获准分析的目标。\n目标：${record.material.target.path||record.material.target.url}\n${record.material.target.cdpEndpoint?'浏览器调试端点：'+record.material.target.cdpEndpoint+'\n':''}想弄懂：${record.material.target.feature}\n${record.material.target.clues?.length?'已知线索：'+record.material.target.clues.join('、'):''}`.trim();
const show=value=>typeof value==='object'?JSON.stringify(value):value;
const labels={model:'模型',reasoningEffort:'推理强度',serviceTier:'服务等级',cwd:'规则目录',approvalPolicy:'审批',sandbox:'文件与网络权限',approvalsReviewer:'审批处理方'};
function FormField({name,schema,value,onChange,required}){
 const title=schema.title||name;
 if(schema.type==='object')return Object.keys(schema.properties||{}).length?<fieldset><legend>{title}</legend>{Object.entries(schema.properties||{}).map(([k,v])=><FormField key={k} name={k} schema={v} value={value?.[k]} required={schema.required?.includes(k)} onChange={x=>onChange({...value,[k]:x})}/>)}</fieldset>:null;
 const options=schema.enum||schema.oneOf?.filter(v=>v.const!==undefined).map(v=>v.const);
 if(schema.type==='array'){
  const opts=schema.items?.enum||schema.items?.anyOf?.map(v=>v.const);
  if(!opts)return <p role="alert">此表单字段需要原生客户端处理：{title}</p>;
  return <fieldset><legend>{title}</legend>{opts.map(v=><label key={v}><input type="checkbox" checked={value?.includes(v)||false} onChange={e=>onChange(e.target.checked?[...(value||[]),v]:(value||[]).filter(x=>x!==v))}/>{v}</label>)}</fieldset>;
 }
 return <label>{title}{schema.description&&<small>{schema.description}</small>}{options?<select required={required} value={value??''} onChange={e=>onChange(options.find(v=>String(v)===e.target.value))}><option value="">请选择</option>{options.map(v=><option key={v} value={String(v)}>{String(v)}</option>)}</select>:schema.type==='boolean'?<select value={value===undefined?'':String(value)} required={required} onChange={e=>onChange(e.target.value===''?undefined:e.target.value==='true')}><option value="">请选择</option><option value="true">是</option><option value="false">否</option></select>:<input required={required} type={['number','integer'].includes(schema.type)?'number':'text'} step={schema.type==='integer'?1:'any'} min={schema.minimum} max={schema.maximum} minLength={schema.minLength} maxLength={schema.maxLength} value={value??''} onChange={e=>onChange(e.target.value===''?undefined:['number','integer'].includes(schema.type)?Number(e.target.value):e.target.value)}/>}</label>;
}
function NativeRequest({value,busy,onReply}){
 const [answers,setAnswers]=useState({}),[content,setContent]=useState({}),[scope,setScope]=useState('turn'),[persist,setPersist]=useState('');
 const p=value.params,m=value.method,isQuestion=m==='item/tool/requestUserInput',elicitation=m==='mcpServer/elicitation/request',permissions=m==='item/permissions/requestApproval';
 return <section className="native-request asset-form" aria-label="Codex 原生请求">
  {value.submitted&&<p role="status">答复已提交，等待 Codex 确认。</p>}<h4>{isQuestion?'Codex 需要你的补充':elicitation?'工具需要你的确认':'Codex 请求授权'}</h4>
  <p>{p.reason||p.message||''}</p>
  {p.command&&<pre>{p.command}</pre>}{p.cwd&&<p className="hint">目录：{p.cwd}</p>}
  {p.grantRoot&&<p>申请访问的目录：{p.grantRoot}</p>}
  {p._meta?.tool_title&&<p>工具：{p._meta.tool_title}</p>}
  {Array.isArray(p._meta?.tool_params_display)?p._meta.tool_params_display.map((param,i)=><p key={i}>{param.display_name||param.name}：{typeof param.value==='string'?param.value:JSON.stringify(param.value)}</p>):p._meta?.tool_params_display&&<pre>{JSON.stringify(p._meta.tool_params_display,null,2)}</pre>}
  {(p.additionalPermissions||p.networkApprovalContext)&&<pre>{JSON.stringify({...(p.additionalPermissions?{申请权限:p.additionalPermissions}:{}),...(p.networkApprovalContext?{网络请求:p.networkApprovalContext}:{})},null,2)}</pre>}
  {isQuestion?<form onSubmit={e=>{e.preventDefault();onReply({answers:Object.fromEntries(p.questions.map(q=>[q.id,{answers:[answers[q.id]||'']}]))});}}>
   {p.questions.map(q=><label key={q.id}>{q.question}{q.options?.length>0&&<select value={answers[q.id]||''} onChange={e=>setAnswers({...answers,[q.id]:e.target.value})}><option value="">选择或在下方补充</option>{q.options.map(o=><option key={o.label} value={o.label}>{o.label} · {o.description}</option>)}</select>}<input required type={q.isSecret?'password':'text'} value={answers[q.id]||''} onChange={e=>setAnswers({...answers,[q.id]:e.target.value})}/></label>)}
   <Button type="submit" disabled={busy}>提交回答</Button>{p.isBlocking===false&&<Button secondary type="button" disabled={busy} onClick={()=>onReply({answers:{}})}>暂不回答</Button>}
  </form>:permissions?<><pre>{JSON.stringify(p.permissions,null,2)}</pre><label>授权范围<select value={scope} onChange={e=>setScope(e.target.value)}><option value="turn">当前轮</option><option value="session">当前会话</option></select></label><Button disabled={busy} onClick={()=>onReply({permissions:p.permissions,scope})}>授予所列权限</Button><Button secondary disabled={busy} onClick={()=>onReply({permissions:{},scope:'turn'})}>拒绝</Button></>:elicitation?<form onSubmit={e=>{e.preventDefault();onReply({action:'accept',content:p.mode==='url'?null:content,...(persist?{_meta:{persist}}:{})});}}>
   {p.mode==='url'?<a href={/^https?:\/\//.test(p.url)?p.url:undefined} target="_blank" rel="noreferrer">打开工具提供的验证页面</a>:<FormField name="确认内容" schema={p.requestedSchema} value={content} onChange={setContent}/>}
   {persistenceOptions(value).length>0&&<label>授权记忆<select value={persist} onChange={e=>setPersist(e.target.value)}><option value="">仅允许这一次</option>{persistenceOptions(value).map(v=><option key={v} value={v}>{v==='session'?'本会话允许':'始终允许（保存到 Codex）'}</option>)}</select></label>}
   <div className="native-actions"><Button type="submit" disabled={busy}>{p.mode==='url'?'我已完成验证':'提交'}</Button><Button secondary disabled={busy} type="button" onClick={()=>onReply({action:'decline',content:null})}>拒绝</Button><Button secondary disabled={busy} type="button" onClick={()=>onReply({action:'cancel',content:null})}>取消</Button></div>
  </form>:<div className="native-actions">{approvalOptions(value).map((decision,i)=><Button key={i} secondary disabled={busy} onClick={()=>onReply({decision})}>{approvalLabel(decision)}</Button>)}</div>}
 </section>;
}
function Item({item,onArchive,busy}){
 if(item.type==='agentMessage')return <article className="native-message"><b>Codex</b><pre>{item.text}</pre>{item._completed&&<button className="text-btn" disabled={busy} onClick={()=>onArchive(item)}>保存这条回复为任务包</button>}</article>;
 if(item.type==='userMessage')return <article className="native-message native-user"><b>你</b><pre>{item.content?.map(c=>c.text||c.path||'').join('\n')}</pre></article>;
 const name=item.type==='mcpToolCall'?`${item.server} / ${item.tool}`:item.type==='commandExecution'?item.command:item.type==='fileChange'?'文件变更':item.type==='reasoning'?'分析过程':item.type;
 return <details className="native-tool"><summary>{name} {item.status||''}</summary><pre>{JSON.stringify(item,null,2)}</pre></details>;
}
export function ReverseNative({record,state,adoptState,notify,onBusy,onExecutor}){
 const [view,setView]=useState(null),[sessionId,setSessionId]=useState(''),[cwd,setCwd]=useState(''),[catalog,setCatalog]=useState(null),[options,setOptions]=useState({}),[text,setText]=useState(()=>initialQuestion(record)),[error,setError]=useState(''),[busy,setBusy]=useState(false),[preview,setPreview]=useState(null),[configure,setConfigure]=useState(false),[older,setOlder]=useState([]);
 const lock=useRef(false),pending=useRef(null),draft=useRef(text);
 const s=view?.session,running=nativeRunning(s),waiting=!!s?.pending?.some(p=>p.method!=='item/tool/requestUserInput'||p.params.isBlocking);
 useEffect(()=>{draft.current=text;},[text]);
 async function read(){
  const data=await request('/reverse/native/query?recordId='+encodeURIComponent(record.id)+(sessionId?'&sessionId='+encodeURIComponent(sessionId):''));
  setView(data);return data;
 }
 useEffect(()=>{let active=true,timer;async function poll(){try{const data=await request('/reverse/native/query?recordId='+encodeURIComponent(record.id)+(sessionId?'&sessionId='+encodeURIComponent(sessionId):''));if(active)setView(data);}catch(e){if(active)setError(e.message);}if(active)timer=setTimeout(poll,900);}poll();return()=>{active=false;clearTimeout(timer);};},[record.id,sessionId]);
 useEffect(()=>{onBusy(running||waiting);return()=>onBusy(false);},[running,waiting]);
 const action=async fn=>{if(lock.current)return;lock.current=true;setBusy(true);setError('');try{await fn();}catch(e){setError(e.message);}finally{lock.current=false;setBusy(false);}};
 const mutate=async(name,args)=>{
  if(pending.current)throw Error('上次操作尚未确认，请先查询结果。');
  const input={...args,operationId:crypto.randomUUID()};
  pending.current={name,input};
  try{const r=await post(name,input);pending.current=null;return r;}catch(e){
   // Validation before execution can be corrected. A lost response remains pending.
   if(e.status&&e.status<500&&!e.unknownResult)pending.current=null;throw e;
  }
 };
 async function inspect(){setCatalog(await post('catalog',{cwd}));}
 async function submit(){
  let current=s;
  if(!current||configure){
   if(!catalog||catalog.cwd!==cwd)throw Error('请先读取这个目录的 Codex 设置');
   const latest=await request('/workspace');adoptState(latest);
   const made=await mutate('start',{recordId:record.id,expectedRevision:latest.revision,cwd,options});
   current=made.session;setView(made);setSessionId(current.id);setConfigure(false);setOlder([]);
  }
  const result=await mutate('turn',{recordId:record.id,sessionId:current.id,text});
  setView(result);setText('');
 }
 const setting=(key,value)=>setOptions(previous=>{const next={...previous};if(value)next[key]=value;else delete next[key];return next;});
 return <section className="term native-session" aria-label="Codex 原生逆向">
  <div className="term-bar"><span className="en">CODEX · 原生分析</span><span className={'term-state '+(running?'run':'')}>{waiting?'等待你的答复':states[s?.status]||'待开始'}</span><div className="term-actions"><ReverseExecutor value="codex" disabled={busy||running||waiting} onChange={value=>action(async()=>{if(s&&s.status!=='disconnected')await post('disconnect',{recordId:record.id,sessionId:s.id});await onExecutor(value);})}/>{running&&<button disabled={busy} onClick={()=>action(async()=>{await mutate('interrupt',{recordId:record.id,sessionId:s.id});await read();})}>停止当前轮</button>}</div></div>
  <div className="native-content">
   {!s||configure?<div className="asset-form native-settings">
    <label>规则目录（填写与 Codex 聊天相同的工作目录）<input value={cwd} onChange={e=>{setCwd(e.target.value);setCatalog(null);}} placeholder="/Users/…/你的项目"/></label>
    <Button secondary disabled={busy||!cwd} onClick={()=>action(inspect)}>读取 Codex 设置</Button>
    {catalog&&<><p className="hint">{catalog.identity} · {catalog.skill?'已发现 REA Skill':'未发现已启用的 REA Skill'}</p><div className="native-settings-grid">
     <label>模型<select value={options.model||''} onChange={e=>{setting('model',e.target.value);setting('effort','');}}><option value="">继承：{catalog.defaults.model||'原生默认'}</option>{catalog.models.map(m=><option key={m.model} value={m.model}>{m.displayName||m.model}</option>)}</select></label>
     <label>推理强度<select value={options.effort||''} onChange={e=>setting('effort',e.target.value)}><option value="">继承：{catalog.defaults.model_reasoning_effort||'原生默认'}</option>{catalog.models.find(m=>m.model===(options.model||catalog.defaults.model))?.supportedReasoningEfforts?.map(e=><option key={e.reasoningEffort}>{e.reasoningEffort}</option>)}</select></label>
     <label>服务等级<select value={options.serviceTier||''} onChange={e=>setting('serviceTier',e.target.value)}><option value="">继承：{catalog.defaults.service_tier||'原生默认'}</option>{(catalog.models.find(m=>m.model===(options.model||catalog.defaults.model))?.serviceTiers||[]).map(t=><option key={t.serviceTier||t.id||t} value={t.serviceTier||t.id||t}>{t.displayName||t.name||t.serviceTier||t.id||t}</option>)}</select></label>
     <label>审批策略<select value={options.approvalPolicy||''} onChange={e=>setting('approvalPolicy',e.target.value)}><option value="">{typeof catalog.defaults.approval_policy==='object'?'继承：细分审批策略':'继承：'+(catalog.defaults.approval_policy||'原生默认')}</option>{['on-request','untrusted','never'].map(v=><option key={v}>{v}</option>)}</select><small>当前继承值：{show(catalog.defaults.approval_policy)||'原生默认'}</small></label>
     <label>文件与网络权限<select value={options.sandbox||''} onChange={e=>setting('sandbox',e.target.value)}><option value="">继承：{catalog.defaults.sandbox_mode||'原生默认'}</option><option value="read-only">只读</option><option value="workspace-write">工作区写入</option><option value="danger-full-access">完整访问</option></select></label>
    </div><p className="hint">与 Codex 使用相同目录和设置。权限由 Codex 执行；选择完整访问会允许它按原生规则读写和运行工具。</p></>}
    {configure&&s&&<button className="text-btn" onClick={()=>setConfigure(false)}>返回现有会话</button>}
   </div>:<>
    <details className="native-runtime"><summary>{s.settings?.model||'模型待确认'} · {s.settings?.reasoningEffort||s.options?.effort||'默认强度'} · REA {s.capabilities?.toolNames?.length??'待核对'} 个工具</summary>
     <p>{s.identity}</p>{Object.entries(labels).map(([key,label])=><p key={key}>{label}：{typeof s.settings?.[key]==='object'?JSON.stringify(s.settings[key]):s.settings?.[key]??'原生默认'}</p>)}
     <p>已加载规则：{s.settings?.instructionSources?.join('、')||'未返回来源'}</p><p>REA Skill：{s.skill?.path}</p><details><summary>完整 REA 工具列表</summary><pre>{s.capabilities?.toolNames?.join('\n')}</pre></details>
    </details>
    <div className="native-actions">
     {view.sessions.length>1&&<label>分析会话<select disabled={busy||running||waiting} value={s.id} onChange={e=>{setSessionId(e.target.value);setOlder([]);}}>{view.sessions.map(v=><option key={v.id} value={v.id}>{new Date(v.createdAt).toLocaleString('zh-CN')}</option>)}</select></label>}
     {(s.status==='disconnected'||s.status==='unknown'||s.children?.some(c=>c.status==='unknown'))?<Button secondary disabled={busy} onClick={()=>action(async()=>{setView(await post('reconnect',{recordId:record.id,sessionId:s.id}));})}>重新连接并核对</Button>:!running&&!waiting&&<button className="text-btn" disabled={busy} onClick={()=>action(async()=>setView(await post('disconnect',{recordId:record.id,sessionId:s.id})))}>断开连接</button>}
     <button className="text-btn" disabled={busy||running||waiting} onClick={()=>{setCwd(s.cwd);setCatalog(null);setConfigure(true);setText(initialQuestion(record));}}>新建分析会话</button>
    </div>
   </>}
   {view?.hasOlder&&<button className="text-btn" disabled={busy} onClick={()=>action(async()=>{const data=await request('/reverse/native/query?recordId='+record.id+'&sessionId='+s.id+'&before='+(older[0]?._seq||view.items[0]?._seq));setOlder(p=>[...data.items,...p]);if(!data.hasOlder)setView(v=>({...v,hasOlder:false}));})}>加载更早过程</button>}
   <div className="native-transcript" role="region" aria-label="原生分析过程">{[...older,...(view?.items||[])].map(item=><Item key={item.id} item={item} busy={busy} onArchive={setPreview}/>)}</div>
   {record.reaRuns?.some(r=>r.executor==='codex')&&<details className="native-tool"><summary>历史 Codex 取证记录</summary>{record.reaRuns.filter(r=>r.executor==='codex').map(run=><div key={run.id}><p>{new Date(run.startedAt).toLocaleString('zh-CN')} · {run.status}</p><pre>{run.log.map(l=>l.text).join('\n')}</pre></div>)}</details>}
   {s?.error&&<p role="status" className="term-error">{s.error}</p>}
   {s?.pendingOperation&&<div className="native-request"><p>上次输入是否执行尚未确认。先回读原生历史，原问题不会自动重发。</p><div className="native-actions"><Button secondary disabled={busy} onClick={()=>action(async()=>setView(await post('reconnect',{recordId:record.id,sessionId:s.id})))}>核对原生历史</Button><Button secondary disabled={busy} onClick={()=>action(async()=>{setView(await post('acknowledge',{recordId:record.id,sessionId:s.id,operationId:s.pendingOperation.id}));pending.current=null;setText('');})}>已核对，不重发原问题</Button></div></div>}
   {s?.pending?.map(value=><NativeRequest key={value.generation+':'+value.id} value={value} busy={busy||value.submitted} onReply={result=>action(async()=>{await mutate('respond',{recordId:record.id,sessionId:s.id,requestId:value.id,generation:value.generation,result});await read();})}/>)}
   <form className="asset-form native-compose" onSubmit={e=>{e.preventDefault();action(submit);}}>
    <label>{running?'补充分析要求':'分析要求 / 继续追问'}<textarea rows={4} value={text} maxLength={200000} onChange={e=>setText(e.target.value)} required/></label>
    <Button type="submit" disabled={busy||!text.trim()||waiting||!!s?.pendingOperation||(!configure&&s?.status==='disconnected')||(!s&&!catalog?.skill)}>{busy?'正在处理…':running?'补充到当前轮':s&&!configure?'发送':'开始分析'}</Button>
    <small>使用 Codex 额度。原生分析可持续追问；选定回复后再保存为任务包。</small>
   </form>
   {error&&<p role="alert" className="inline-error">{error}</p>}
   {pending.current&&<Button secondary disabled={busy} onClick={()=>action(async()=>{const old=pending.current;const data=await request('/reverse/native/query?recordId='+record.id+'&operationId='+old.input.operationId);setView(data);if(['done','submitted'].includes(data.operation?.status)){pending.current=null;if(old.name==='turn'&&draft.current===old.input.text)setText('');if(old.name==='archive'){adoptState(await request('/workspace'));setPreview(null);}if(old.name==='start'&&data.session){setSessionId(data.session.id);setConfigure(false);}setError('操作已回读；不会重复提交。');}else if(data.operation?.status==='rejected'){pending.current=null;setError('原生操作已明确拒绝，可调整输入后重试。');}else setError('操作结果仍未知。请重新连接核对过程，不会重发原问题。');})}>查询上次操作结果</Button>}
  </div>
  {preview&&createPortal(<div className="v14 native-session"><Dialog title="保存为固定任务包" drawer recoverFocus onClose={()=>!busy&&setPreview(null)}><p>保存选定的 Codex 回复原文，保留来源会话。未经复刻验证。</p><pre className="reverse-skill-preview">{preview.text}</pre>{error&&<p role="alert">{error}</p>}<Button disabled={busy} onClick={()=>action(async()=>{const latest=await request('/workspace');const result=await mutate('archive',{recordId:record.id,sessionId:s.id,itemId:preview.id,expectedRevision:latest.revision});adoptState(result.state);setPreview(null);notify('固定任务包已保存并回读');})}>确认保存任务包</Button></Dialog></div>,document.body)}
 </section>;
}
