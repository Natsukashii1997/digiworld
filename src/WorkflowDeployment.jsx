import React,{useRef,useState} from 'react';
import {Button} from './components.jsx';
import {request} from './api.js';
import {useAgentPending} from './useAgentPending.js';

const call=(action,input)=>request('/capabilities/workflow/'+action,input,'POST',false);
const unresolved=new Set(['unknown','changed','binding_changed','files_match_receipt_unknown']);
const label={authorized:'本次授权已核对，尚未落地',cancelled:'未落地授权已取消且原编号已封闭',matches_after:'独立副本字节与目标绑定已回读',changed:'目标内容与记录不一致，停止重放',unknown:'结果未知，停止重放',binding_changed:'目标绑定已变化，停止重放',files_match_receipt_unknown:'文件一致，但完成回执未知',not_started:'原编号尚无授权或部署记录'};

export function WorkflowDeployment({asset,version,state,onBusy}){
  const targets=(state.connections?.agentTargets||[]).filter(t=>['codex','hermes'].includes(t.agentId)&&t.program?.kind==='CLI');
  const projects=(state.connections?.projects||[]).filter(p=>!p.identityConflict&&p.localPaths?.length);
  const [open,setOpen]=useState(false),[targetId,setTargetId]=useState(''),[projectId,setProjectId]=useState(''),[workspacePath,setWorkspacePath]=useState('');
  const [plan,setPlan]=useState(null),[authorized,setAuthorized]=useState(false),[result,setResult]=useState(null),[busy,setBusy]=useState(false),[error,setError]=useState(''),[confirmed,setConfirmed]=useState(false),[cancelConfirmed,setCancelConfirmed]=useState(false);
  const busyRef=useRef(false);
  const pending=useAgentPending({scope:'workflow-deploy',targetTuple:JSON.stringify([asset.id,version.id])});
  const project=projects.find(p=>p.id===projectId),blocked=!!pending.id||!pending.ready||!!pending.error;
  const query={operationId:pending.id,assetId:asset.id,versionId:version.id};
  function reset(){setPlan(null);setAuthorized(false);setResult(null);setConfirmed(false);setCancelConfirmed(false);setError('');}
  async function run(task){if(busyRef.current)return;busyRef.current=true;setBusy(true);onBusy?.(true);setError('');try{await task();}catch(e){setError(e.message||'操作失败；请保留原编号查询。');}finally{busyRef.current=false;setBusy(false);onBusy?.(false);}}
  function selectProject(id){setProjectId(id);setWorkspacePath(projects.find(p=>p.id===id)?.localPaths?.[0]||'');reset();}
  async function preview(){await run(async()=>{const p=await call('preview',{assetId:asset.id,versionId:version.id,targetId,projectId,workspacePath,revision:state.revision});setPlan(p);setAuthorized(false);setResult(null);setConfirmed(false);});}
  async function authorize(){if(!plan||!confirmed)return;await run(async()=>{
    if(!pending.setId(plan.operationId,'')){setError('本机待查编号无法保存，未发出授权；请修复本机存储后重试。');return;}
    try{const value=await call('authorize',{token:plan.token,operationId:plan.operationId,confirmed:true});setAuthorized(value.status==='authorized');setResult(value);setConfirmed(false);}
    catch(e){setResult({operationId:plan.operationId,status:'unknown'});throw e;}
  });}
  async function apply(){if(!plan||!authorized||pending.id!==plan.operationId||!confirmed)return;await run(async()=>{
    try{const value=await call('apply',{token:plan.token,operationId:plan.operationId,confirmed:true});setResult(value);setPlan(null);setAuthorized(false);setConfirmed(false);if(value.status==='matches_after'&&!pending.setId('',plan.operationId))setError('部署已回读，但本机待查编号清理失败；请查询原编号。');}
    catch(e){setResult({operationId:plan.operationId,status:'unknown'});setPlan(null);setAuthorized(false);throw e;}
  });}
  async function check(){if(!pending.id)return;await run(async()=>{const value=await call('check',query);setResult(value);setPlan(null);setAuthorized(value.status==='authorized');setConfirmed(false);setCancelConfirmed(false);if((value.status==='matches_after'||['not_started','cancelled'].includes(value.status)&&value.closed===true)&&!pending.setId('',query.operationId))setError('原编号已查询，但本机待查记录未能清理。');});}
  async function cancel(){if(!pending.id||!cancelConfirmed||!['authorized','binding_changed'].includes(result?.status))return;const id=pending.id;await run(async()=>{const value=await call('cancel',{operationId:id,assetId:asset.id,versionId:version.id,confirmed:true});setResult(value);setPlan(null);setAuthorized(false);setConfirmed(false);setCancelConfirmed(false);if(value.status==='cancelled'&&value.closed===true&&!pending.setId('',id))setError('授权已取消，但本机待查编号清理失败；请查询原编号。');});}
  async function resume(){if(!pending.id||result?.status!=='authorized')return;await run(async()=>{const p=await call('resume',query);setPlan(p);setAuthorized(true);setConfirmed(false);});}
  return <section className="workflow-deployment" aria-label="部署固定工作流到项目工作区">
    <Button secondary type="button" aria-expanded={open} onClick={()=>setOpen(!open)}>{open?'收起工作区部署':'部署固定版到项目工作区'}</Button>
    {open&&<div className="capability-console">
      <h3>部署这份固定流程</h3><p>仅将独立副本放入所选项目工作区。不会安装 Skill、修改 Agent 配置或启动 Agent；目标 Agent 是否加载与执行，仍需在原生环境核验。</p>
      {!targets.length&&<p role="status">尚无已登记的 Codex/Hermes CLI 目标。</p>}{!projects.length&&<p role="status">尚无已登记的本地项目工作区。</p>}
      <label>CLI 目标<select aria-label="CLI 目标" value={targetId} disabled={busy||blocked} onChange={e=>{setTargetId(e.target.value);reset();}}><option value="">选择目标</option>{targets.map(t=><option key={t.id} value={t.id}>{t.label} · {t.agentId}</option>)}</select></label>
      <label>项目<select aria-label="项目" value={projectId} disabled={busy||blocked} onChange={e=>selectProject(e.target.value)}><option value="">选择项目</option>{projects.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</select></label>
      <label>项目工作区<select aria-label="项目工作区" value={workspacePath} disabled={busy||blocked||!project} onChange={e=>{setWorkspacePath(e.target.value);reset();}}><option value="">选择工作区</option>{(project?.localPaths||[]).map(path=><option key={path} value={path}>{path}</option>)}</select></label>
      {!plan&&!pending.id&&<Button type="button" disabled={busy||blocked||!targetId||!projectId||!workspacePath} onClick={preview}>预览目标变化与依赖</Button>}
      {plan&&<div className="capability-operation" role="region" aria-label="固定工作流部署预览"><p><strong>目标：</strong>{plan.target} · {plan.workspace}</p><p><strong>只新增：</strong>{plan.path}</p><details><summary>核验固定版本</summary><p><strong>固定包 SHA256：</strong><code>{plan.sourceSha256}</code></p></details><p>{plan.changes.length} 个文件，全部以 0600 权限新建，原文件不覆盖。</p><details><summary>查看逐文件路径与 SHA256</summary><ul>{plan.changes.map(c=><li key={c.path}><code>{c.path}</code> · {c.size} 字节 · {c.afterHash}</li>)}</ul></details><p>依赖：{plan.dependencies.length?plan.dependencies.map(d=>`${d.type} ${d.assetId} ${d.versionId}（${d.status}）`).join('；'):'无外部引用'}。</p><p>预览有效至 {new Date(plan.expiresAt).toLocaleString()}。确认前将重新核对固定版本、目标与工作区身份。</p>
        <label><input type="checkbox" checked={confirmed} disabled={busy} onChange={e=>setConfirmed(e.target.checked)}/>我已核对目标工作区、变更清单和本次固定版本</label>
        {!authorized?<Button type="button" disabled={busy||!confirmed||!!pending.id||(!pending.ready)||!!pending.error} onClick={authorize}>单独授权本次部署</Button>:<><p role="status">本次授权已回读；尚未写入工作区。</p><Button type="button" disabled={busy||!confirmed||pending.id!==plan.operationId} onClick={apply}>确认只落地独立副本</Button></>}
      </div>}
      {pending.id&&<p role="status">待查原编号：<code>{pending.id}</code>。查询结果前不发起另一部署。</p>}
      {pending.id&&<Button secondary type="button" disabled={busy} onClick={check}>查询原编号与目标字节</Button>}
      {pending.id&&result?.status==='authorized'&&!plan&&<Button secondary type="button" disabled={busy} onClick={resume}>恢复本次授权预览</Button>}
      {pending.id&&['authorized','binding_changed'].includes(result?.status)&&<div className="capability-operation"><p>如固定包或目标已变化，且本次尚未落地，可取消这份单次授权。服务端会先核对没有部署记录并封闭原编号。</p><label><input type="checkbox" checked={cancelConfirmed} disabled={busy} onChange={e=>setCancelConfirmed(e.target.checked)}/>我确认放弃本次未落地授权</label><Button secondary type="button" disabled={busy||!cancelConfirmed} onClick={cancel}>取消本次授权并封闭编号</Button></div>}
      {result&&<p role="status">{result.message||label[result.status]||'结果仍需核对，请查询原操作。'}</p>}
      {unresolved.has(result?.status)&&<p role="alert">保留目标现状与原编号；当前入口不覆盖、不重放，也不宣称部署成功。</p>}
      {(error||pending.error)&&<p className="inline-error" role="alert">{error||pending.error}</p>}
    </div>}
  </section>;
}
