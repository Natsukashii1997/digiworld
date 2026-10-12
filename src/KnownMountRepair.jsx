import { copyText } from './data-flight.js';
import React,{useRef,useState} from 'react';
import {Button} from './components.jsx';
import {request} from './api.js';
import {useAgentPending} from './useAgentPending.js';

const call=(action,input)=>request('/capabilities/agent/repair-'+action,input,'POST',false);
const statusText={authorized:'本次修复授权已回读，尚未重建目录',matches_after:'独立 Skill 目录字节已复验',changed:'目录有外部变化，停止重放',unknown:'结果未知，停止重放',files_match_receipt_unknown:'文件一致但完成回执未知',not_started:'原编号已封闭，未执行修复'};
const short=value=>typeof value==='string'?value.slice(0,8):'未知';

export function KnownMountRepair({originalId,revision,onBusy}){
  const [plan,setPlan]=useState(null),[result,setResult]=useState(null),[busy,setBusy]=useState(false),[error,setError]=useState(''),[copyMessage,setCopyMessage]=useState(''),[confirmed,setConfirmed]=useState(false),[authorized,setAuthorized]=useState(false);
  const busyRef=useRef(false),pending=useAgentPending({scope:'known-mount-repair',targetTuple:originalId});
  async function run(task){if(busyRef.current)return;busyRef.current=true;setBusy(true);onBusy?.(true);setError('');try{await task();}catch(e){setError(e.message||'修复请求失败；保留原编号查询。');}finally{busyRef.current=false;setBusy(false);onBusy?.(false);}}
  async function preview(){await run(async()=>{const value=await call('preview',{originalId,revision});setPlan(value);setResult(null);setConfirmed(false);setAuthorized(false);});}
  async function authorize(){if(!plan||!confirmed||plan.admission!=='approved')return;await run(async()=>{
    if(!pending.setId(plan.operationId,'')){setError('本机待查编号无法保存，未发出授权。');return;}
    try{const value=await call('authorize',{token:plan.token,confirmed:true});setResult(value);setAuthorized(value.status==='authorized');setConfirmed(false);}
    catch(e){setResult({operationId:plan.operationId,status:'unknown'});throw e;}
  });}
  async function apply(){if(!plan||!authorized||pending.id!==plan.operationId||!confirmed)return;await run(async()=>{
    try{const value=await call('apply',{token:plan.token,confirmed:true});setResult(value);setPlan(null);setAuthorized(false);setConfirmed(false);if(value.status==='matches_after'&&!pending.setId('',plan.operationId))setError('已复验，但本机待查编号清理失败；请查询原编号。');}
    catch(e){setResult({operationId:plan.operationId,status:'unknown'});setPlan(null);setAuthorized(false);throw e;}
  });}
  async function check(){if(!pending.id)return;await run(async()=>{const id=pending.id,value=await call('check',{operationId:id});setResult(value);setPlan(null);setAuthorized(value.status==='authorized');setConfirmed(false);if((value.status==='matches_after'||value.status==='not_started'&&value.closed===true)&&!pending.setId('',id))setError('已查询原编号，但本机待查记录清理失败。');});}
  async function resume(){if(!pending.id||result?.status!=='authorized')return;await run(async()=>{const value=await call('resume',{operationId:pending.id});setPlan(value);setAuthorized(true);setConfirmed(false);});}
  async function cancel(){if(!pending.id||result?.cancelable!==true)return;await run(async()=>{
    const id=pending.id,value=await call('cancel',{operationId:id,confirmed:true});
    setResult(value);setPlan(null);setAuthorized(false);setConfirmed(false);
    if(value.closed!==true||value.canceled!==true){setError('取消结果未能确认，请查询原编号。');return;}
    if(!pending.setId('',id))setError('授权已取消并回读，但本机待查编号清理失败；请查询原编号。');
  });}
  async function copyPending(){if(!pending.id)return;try{await copyText(pending.id);setCopyMessage('完整原编号已复制。');}catch{setCopyMessage('复制失败，请展开核验详情手动复制完整编号。');}}
  return <section className="capability-console known-mount-repair" aria-label="已知缺失 Skill 目录修复">
    <h4>工作台发布的独立 Skill 缺失修复</h4><p>仅核验原发布 #{short(originalId)} 及所有权回执；现有目录、断链与未知外部改动一律拒绝覆盖。修复后仍需在 Agent 原生环境核验加载。</p>
    {!plan&&!pending.id&&<Button secondary type="button" disabled={busy||!pending.ready||!!pending.error} onClick={preview}>预览原发布记录与缺失目录</Button>}
    {plan&&<div role="region" aria-label="修复预览"><p><strong>目标：</strong><code>{plan.destination}</code></p><p><strong>固定版本：</strong>已锁定 #{short(plan.versionId)}</p><p><strong>新准入：</strong>{plan.admission==='approved'?'同字节准入回执已匹配':'缺少同字节安全准入；本次禁止修复'}</p><details><summary>核验详情</summary><p>原发布编号：<code>{plan.originalId}</code></p><p>资产与版本：<code>{plan.assetId}</code> · <code>{plan.versionId}</code></p><p>固定包 SHA256：<code>{plan.packageHash}</code></p></details><details><summary>查看拟新建文件</summary><ul>{plan.files.map(f=><li key={f.path}>{f.path}{f.directory?'/':''} · {f.size} 字节 · {f.mode.toString(8)} · {f.sha256||'目录'}</li>)}</ul></details><p>{plan.scope}</p>
      <label><input type="checkbox" checked={confirmed} disabled={busy} onChange={e=>setConfirmed(e.target.checked)}/>我已核对原发布、固定包、目标与新增文件</label>
      {!authorized?<Button type="button" disabled={busy||!confirmed||!!pending.id||plan.admission!=='approved'} onClick={authorize}>单独授权本次修复</Button>:<><p role="status">已授权；目录尚未重建。</p><Button type="button" disabled={busy||!confirmed||pending.id!==plan.operationId} onClick={apply}>确认重建缺失的独立目录</Button></>}
    </div>}
    {pending.id&&<div><p role="status">待查原编号：<code>{short(pending.id)}</code>。查询完成前不发起另一修复。</p><Button secondary type="button" disabled={busy} onClick={copyPending}>复制完整原编号</Button><details><summary>查看完整原编号</summary><code>{pending.id}</code></details></div>}
    {pending.id&&<Button secondary type="button" disabled={busy} onClick={check}>查询原编号并复验字节</Button>}
    {pending.id&&result?.status==='authorized'&&!plan&&<Button secondary type="button" disabled={busy} onClick={resume}>恢复本次授权预览</Button>}
    {pending.id&&result?.cancelable===true&&<Button secondary type="button" disabled={busy} onClick={cancel}>取消尚未执行的本次授权</Button>}
    {result&&<p role="status">{result.canceled?'本次修复授权已取消，未重建目录':statusText[result.status]||result.status}。{result.message||''}</p>}
    {['unknown','changed','files_match_receipt_unknown'].includes(result?.status)&&<p role="alert">保留目录现状与原编号；不自动覆盖或重放。</p>}
    {copyMessage&&<p role={copyMessage.startsWith('复制失败')?'alert':'status'}>{copyMessage}</p>}
    {(error||pending.error)&&<p role="alert" className="inline-error">{error||pending.error}</p>}
  </section>;
}
