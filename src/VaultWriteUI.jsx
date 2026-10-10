import React,{useEffect,useRef,useState} from 'react';
import {Button,Dialog} from './components.jsx';
import {request} from './api.js';
import {TextDifference} from './AssetHistory.jsx';
import {OperationReview,CapabilityResult,CapabilityHistory,useCapabilityAction} from './capability-ui-core.jsx';
import './capability-ui-core.css';
import './vault-write-ui.css';
const ROUTE='/capabilities/vault';
const call=(path,input)=>request(ROUTE+path,input,input===undefined?'GET':'POST',false);
// 只在用户打开入口后读取本机授权；初始不读Vault、不自动预览/写入/回读历史目标。
export function VaultWriteEntry({noteId,proposalId,navigate}){
 const [open,setOpen]=useState(false),profile=!!proposalId,label=profile?'预览写回个人说明':'写入 Obsidian',id=proposalId||noteId;
 return <><span className="vault-write-entry"><Button type="button" secondary aria-label={`${label}：${id}`} onClick={()=>setOpen(true)}>{label}</Button></span>
  {open&&<VaultWriteDialog noteId={noteId} proposalId={proposalId} navigate={navigate} onClose={()=>setOpen(false)}/>}</>;
}
export function VaultWriteDialog({noteId,proposalId,onClose,navigate}){
 const profile=!!proposalId,a=useCapabilityAction(),composing=useRef(false),lock=useRef(false),historyBusy=useRef(false);
 const [configuration,setConfiguration]=useState(null),[loading,setLoading]=useState(true),[filename,setFilename]=useState(`随手记-${noteId?.slice(0,8)||'新记录'}.md`);
 const [plan,setPlan]=useState(null),[result,setResult]=useState(null),[unresolved,setUnresolved]=useState(false),[rows,setRows]=useState(null),[historyError,setHistoryError]=useState('');
 useEffect(()=>{let live=true;call('/status').then(value=>live&&setConfiguration(value)).catch(e=>live&&a.setError(e.message)).finally(()=>live&&setLoading(false));return()=>{live=false;};},[]);
 async function run(fn){if(lock.current)return null;lock.current=true;try{return await a.run(fn);}finally{lock.current=false;}}
 async function preview(event){event?.preventDefault();if(a.busy||composing.current||unresolved||!configuration?.enabled)return;
  const value=await run(()=>call(profile?'/preview-profile':'/preview-note',profile?{proposalId}:{noteId,filename}));
  if(value){setPlan({...value,action:profile?'个人说明精确段落写回':'新建随手记文件'});setResult(null);}
 }
 async function loadHistory(){setHistoryError('');try{setRows((await call('/history')).items);}catch(e){setHistoryError(e.message);}}
 async function apply(){if(!plan||unresolved)return;const operationId=plan.operationId;
  const value=await run(()=>call('/apply',{token:plan.token,operationId,confirmed:true}));
  if(value){setResult({...value,operationId:value.operationId||operationId});setUnresolved(value.status==='unknown');setPlan(null);}
  else if(a.lastError.current&&!a.lastError.current.operationNotStarted){setResult({status:'unknown',operationId,reason:a.lastError.current.message});setUnresolved(true);setPlan(null);}
 }
 async function check(){if(!result?.operationId)return;const value=await run(()=>call('/check',{operationId:result.operationId}));if(value){setResult({...value,operationId:value.operationId||result.operationId});setUnresolved(value.status==='unknown');}}
 function enter(e){if(e.key!=='Enter')return;e.preventDefault();if(e.nativeEvent.isComposing||e.nativeEvent.keyCode===229||composing.current||lock.current||unresolved)return;e.currentTarget.form.requestSubmit();}
 return <Dialog recoverFocus title={profile?'写回个人说明':'随手记写入 Obsidian'} onClose={()=>!lock.current&&!historyBusy.current&&onClose()}>
  <div className="capability-console vault-write-console">
   <p>{profile?'只使用已采纳的建议，在设置允许的个人说明目录里替换唯一原段落。':'只使用这条已保存随手记的正文，在设置允许的子目录独占新建 Markdown 文件。'}预览后确认，先备份，写后回读；结果未知时先查询。</p>
   {loading&&<p role="status">正在读取本机 Vault 写入授权…</p>}
   {!loading&&!configuration&&<p role="status">本机授权无法确认，写入保持关闭。</p>}
   {configuration&&!configuration.enabled&&<div className="vault-write-off"><p>Vault 写入默认关闭。先到设置选择已登记的知识源与相对子目录，并审阅授权预览。</p>
    <Button type="button" secondary onClick={()=>{onClose();if(navigate)navigate('settings');else location.hash='settings';}}>去设置 Vault 写入</Button></div>}
   {configuration?.enabled&&<>
    <p>允许范围：{profile?(configuration.options?.profileFolders||[]).join('、'):configuration.options?.notesFolder||'尚未指定'}</p>
    {!plan&&<form className="capability-form" aria-label={profile?'个人说明写回预览':'随手记新文件预览'} onSubmit={preview}>
     {!profile&&<label>新文件名（.md）<textarea aria-label="新文件名（.md）" rows={2} required maxLength={120} value={filename} onChange={e=>setFilename(e.target.value)} onCompositionStart={()=>{composing.current=true;}} onCompositionEnd={()=>{composing.current=false;}} onKeyDown={enter} autoComplete="off"/></label>}
     <p>{profile?'已采纳建议以服务端保存的 proposal 为准，不接受其他正文。':'同名文件不会覆盖。若提示冲突，请改名后重新预览。'}</p>
     <Button type="submit" disabled={a.busy||unresolved}>{a.busy?'正在生成 Vault 写入预览':profile?'生成个人说明写回预览':'预览新建文件'}</Button>
    </form>}
    {plan&&<>{profile&&<TextDifference before={plan.before} after={plan.after}/>}<OperationReview plan={profile?{...plan,before:undefined,after:undefined}:plan} busy={a.busy} error={a.error} onCancel={()=>setPlan(null)} onConfirm={apply} label={profile?'确认写回这条个人说明建议':'确认新建这条随手记文件'}/></>}
    {unresolved&&<p role="status">本次结果未知。已停止再次写入；请查询本次结果，再决定下一步。</p>}
    {result?.operationId&&<Button type="button" secondary disabled={a.busy} onClick={check}>查询本次 Vault 写入结果</Button>}
    <CapabilityResult result={result}/>
    <Button type="button" secondary disabled={a.busy} onClick={()=>run(loadHistory)}>读取本机 Vault 写入记录</Button>
    {historyError&&<p role="alert">{historyError}；记录未知，未当作没有记录。</p>}
    {rows&&!unresolved&&<CapabilityHistory route={ROUTE} label="Vault 写入记录" rows={rows} onChanged={loadHistory} onBusyChange={v=>{historyBusy.current=v;}}/>}
   </>}
   {!plan&&a.error&&<p className="inline-error" role="alert">{a.error}</p>}
  </div>
 </Dialog>;
}
