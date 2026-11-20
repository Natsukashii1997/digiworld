import { flyDataOnce } from './data-flight.js';
import React,{useEffect,useState} from 'react';
import {Button} from './components.jsx';import {request} from './api.js';
import {useCapabilityAction,OperationReview,CapabilityResult,CapabilityHistory,useCapabilityBusy} from './capability-ui-core.jsx';
import './capability-ui-core.css';
// 只剩「工作台常驻」一个可授权能力：模型请求、Agent 配置写入、Vault 写入的写接口已下线（#111）。
const CAP='daemon',LABEL='工作台常驻';
export function CapabilitySettings({onChanged,onBusyChange}){
 const busyFlag=useCapabilityBusy(onBusyChange);const a=useCapabilityAction(v=>busyFlag('main',v)),[settings,setSettings]=useState(null),[enabled,setEnabled]=useState(false),[plan,setPlan]=useState(null),[result,setResult]=useState(null),[rows,setRows]=useState([]),[unknown,setUnknown]=useState('');
 async function load(){const value=await a.run(()=>request('/capabilities/settings/status'));if(value)setSettings(value);const h=await a.run(()=>request('/capabilities/settings/history'));if(h)setRows(h.items);}
 useEffect(()=>{load();},[]);
 useEffect(()=>{if(!settings)return;setEnabled(settings.enabled[CAP]);setPlan(null);},[settings]);
 async function preview(){if(unknown)return;const value=await a.run(()=>request('/capabilities/settings/preview',{capability:CAP,enabled,options:{}},'POST',false));if(value)setPlan(value);}
 async function apply(){const value=await a.run(()=>request('/capabilities/settings/apply',{token:plan.token,operationId:plan.operationId,confirmed:true},'POST',false));if(value){if(value.status==='verified')flyDataOnce(`capability-setting:${value.operationId||plan.operationId}`);setResult(value);setPlan(null);await load();onChanged?.();}else if(a.lastError.current&&!a.lastError.current.operationNotStarted){setResult({operationId:plan.operationId,status:'unknown'});setUnknown(plan.operationId);setPlan(null);await load();}}
 async function check(){const value=await a.run(()=>request('/capabilities/settings/check',{operationId:unknown},'POST',false));if(value){if(unknown&&value.status==='verified')flyDataOnce(`capability-setting:${value.operationId||unknown}`);setResult(value);if(!['unknown','running','unchecked'].includes(value.status)){setUnknown('');await load();}}}
 return <div className="capability-console" role="region" aria-label="产品能力授权"><p>「工作台常驻」默认关闭。开启后，每次安装、重载或卸载常驻服务仍先预览、再确认。</p>
  <Button type="button" secondary aria-pressed={enabled} onClick={()=>{setEnabled(!enabled);setPlan(null);}} disabled={!settings||a.busy}>{enabled?'将允许':'将关闭'}{LABEL}</Button>
  {settings?.reauthorizationRequired&&<p>此数据目录由备份恢复或目录身份已变化，旧授权全部关闭。请重新预览确认需要的能力。</p>}<p>当前：{settings?settings.enabled[CAP]?'已开启':'关闭':'授权状态读取中；尚不可操作'}</p>
  <Button secondary type="button" disabled={!settings||a.busy||!!unknown} onClick={preview}>预览{LABEL}授权</Button>
  {a.error&&<p role="alert">{a.error}</p>}{plan&&<OperationReview plan={plan} busy={a.busy} error={a.error} onCancel={()=>setPlan(null)} onConfirm={apply} label="确认本次授权设置"/>}<CapabilityResult result={result}/>{unknown&&<Button secondary type="button" disabled={a.busy} onClick={check}>查询未确认的授权设置</Button>}
  <CapabilityHistory route="/capabilities/settings" label="授权设置记录" rows={rows} onChanged={load} onBusyChange={v=>busyFlag('history',v)}/>
 </div>;
}
