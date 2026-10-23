import { createPortal } from 'react-dom';
import React, { useEffect, useRef, useState } from 'react';
import { request } from './api.js';
import { Button,Dialog } from './components.jsx';
const needsQuery=s=>['writing','unknown','mismatch','write_failed'].includes(s);
const titles={idle:'本机已注册',available:'发现新版本',current:'已是最新',syncing:'发布同步中',network_failed:'检查未完成',preview:'预演已就绪',preview_failed:'预演未完成',adaptation_failed:'适配未通过',writing:'正在更新',unknown:'结果待核对',write_failed:'写入待核对',mismatch:'回读不一致',succeeded:'已更新并回读'};
export function ReaUpdate() {
 const [local,setLocal]=useState(null),[state,setState]=useState({state:'idle'}),[busy,setBusy]=useState(false),[error,setError]=useState(''),[open,setOpen]=useState(false);const lock=useRef(false);
 async function readLocal(){try{setLocal(await request('/reverse/status'));}catch(e){setError(e.message);}}
 useEffect(()=>{readLocal();request('/reverse/update').then(v=>{setState(v);if(needsQuery(v.state))setOpen(true);}).catch(e=>setError(e.message));},[]);
 useEffect(()=>{if(state.state!=='writing')return;const timer=setInterval(()=>request('/reverse/update').then(v=>{setState(v);if(v.state==='succeeded')readLocal();}).catch(()=>{}),1000);return()=>clearInterval(timer);},[state.state]);
 async function act(action){if(lock.current)return;lock.current=true;setBusy(true);setError('');try{
  if(action==='confirm')setState(v=>({...v,state:'writing'}));
  const result=await request('/reverse/update/'+action,action==='confirm'?{planId:state.planId}:{});setState(result);
  if(action!=='check'||!['current','available'].includes(result.state))setOpen(true);
  if(result.current)setLocal(result.current);if(result.state==='succeeded')await readLocal();
 }catch(e){setError(e.message);if(action==='confirm'){setState(v=>({...v,state:'unknown',message:'确认请求结果未明，请查询结果；不重复更新'}));setOpen(true);}}finally{lock.current=false;setBusy(false);}}
 const updateReady=['available','preview','preview_failed','adaptation_failed'].includes(state.state);
 const caption=busy?'正在核对…':needsQuery(state.state)?'查询结果':updateReady?'一键更新':'检查更新';
 const current=local?.version||'—';
 return <>
  <div className="gear" role="group" aria-label="REA取证工具"><span className="gear-scr"><span className="en">REA</span><b>{current}</b></span><span className="gear-txt"><span className={'gear-state '+(updateReady?'new':state.state==='current'||state.state==='succeeded'?'ok':'')}>{titles[state.state]||'版本待核对'}</span><small>{state.checkedAt?'正式发布 · '+new Date(state.checkedAt).toLocaleTimeString('zh-CN',{hour:'2-digit',minute:'2-digit'}):'本机版本 · 未联网检查'}</small></span><button className={'gear-btn '+(updateReady?'on':'')} disabled={busy} onClick={()=>needsQuery(state.state)?(setOpen(true),act('query')):updateReady?(setOpen(true),act('preview')):act('check')}>{caption}</button></div>
  {open&&createPortal(<div className="v14 v16 page-references rea-update-layer"><Dialog title="REA 更新预演" drawer recoverFocus onClose={()=>!busy&&setOpen(false)}><div className="rea-update">
   <div className="upd-head"><span className="en">REA · UPDATE PLAN</span><h2>{state.version?'更新到 '+state.version:'检查 REA 更新'}</h2><span className="bench-meta">GitHub 正式发布 {state.releaseUrl&&<>· <a href={state.releaseUrl} target="_blank" rel="noreferrer">更新说明</a></>}</span></div>
   <ol className="upd-steps">{['检查版本','预演','写入','回读'].map((label,i)=><li key={label} className={state.state==='succeeded'||state.plan&&i===0?'done':state.state==='preview'&&i===1||state.state==='writing'&&i===2||needsQuery(state.state)&&i===3?'now':''}><i>{i+1}</i>{label}</li>)}</ol>
   <p role="status">{busy?'正在执行本次操作，请稍候。':state.message||'点检查更新才会联网。'}</p>
   {error&&<p className="inline-error" role="alert">{error}</p>}
   {state.plan&&<section><h3><span className="en">WILL CHANGE</span>预演改动 {state.plan.actions.length} 处</h3><ul className="upd-list">{state.plan.actions.map(a=><li key={a.id}><b>{a.kind==='install_skill'?'REA Skill':a.id.endsWith('codex')?'Codex':'Claude Code'}</b><span className="mono">{a.target}</span><span className="diff">{a.kind==='install_skill'?'Skill v'+state.plan.skillVersion:current+' → '+state.plan.version}</span><span className="mono upd-backup">备份：{a.backupPath||'预演未提供（新文件或无独立备份）'}</span></li>)}</ul><p className="upd-note">Skill 版本：{state.plan.skillVersion}。已有 .rea.backup 可能来自更早安装；这里只显示 REA 提供的备份位置。</p></section>}
   {state.compatibility&&<section><h3><span className="en">FIT CHECK</span>适配检查</h3><ul className="fit">{state.compatibility.ok?<><li><i>✓</i>{state.compatibility.cli.length} 个 CLI 命令及输入兼容</li><li><i>✓</i>{state.compatibility.mcp.length} 个 MCP 工具及输入兼容</li></>:state.compatibility.missing.map(v=><li key={v}>未通过：{v}</li>)}</ul></section>}
   <div className="upd-bar"><span className="hint">确认后仅更新所示版本的 REA 注册与 Skill；完成后重启 Claude Code 和 Codex。</span><button className="ghost" disabled={busy} onClick={()=>setOpen(false)}>关闭预演</button>
    {state.state==='preview'&&<Button disabled={busy} onClick={()=>act('confirm')}>确认更新</Button>}
    {needsQuery(state.state)&&<Button disabled={busy} onClick={()=>act('query')}>查询结果</Button>}
    {['preview_failed','adaptation_failed'].includes(state.state)&&<Button disabled={busy} onClick={()=>act('preview')}>重新预演</Button>}
    {['network_failed','syncing','idle'].includes(state.state)&&<Button disabled={busy} onClick={()=>act('check')}>重新检查</Button>}
   </div>
  </div></Dialog></div>,document.body)}
  {!open&&error&&<span className="rea-read-error" role="status">{error}</span>}
 </>;
}
