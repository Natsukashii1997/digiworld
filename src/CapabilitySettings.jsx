import React,{useEffect,useState} from 'react';
import {Button} from './components.jsx';import {PageChoices} from './PageChoices.jsx';import {request} from './api.js';
import {useCapabilityAction,OperationReview,CapabilityResult,CapabilityHistory,useCapabilityBusy} from './capability-ui-core.jsx';
import './capability-ui-core.css';
const usdMicros=v=>/^\d{1,3}(?:\.\d{1,6})?$/.test(v)?Number(v.split('.')[0])*1e6+Number((v.split('.')[1]||'').padEnd(6,'0')):null;
const labels={model:'模型请求',agent:'Agent 配置写入',vault:'Vault 写入',daemon:'工作台常驻'};
export function CapabilitySettings({state,onChanged,onBusyChange,initialCapability="model"}){
 const busyFlag=useCapabilityBusy(onBusyChange);const a=useCapabilityAction(v=>busyFlag('main',v)),[settings,setSettings]=useState(null),[cap,setCap]=useState(Object.hasOwn(labels,initialCapability)?initialCapability:'model'),[enabled,setEnabled]=useState(false),[plan,setPlan]=useState(null),[result,setResult]=useState(null),[rows,setRows]=useState([]),[unknown,setUnknown]=useState('');
 const [usd,setUsd]=useState('0.02'),[source,setSource]=useState(''),[notes,setNotes]=useState('工作台随手记'),[profiles,setProfiles]=useState('个人上下文');
 const sources=state.connections?.knowledgeSources?.filter(s=>s.kind==='obsidian')||[];
 async function load(){const value=await a.run(()=>request('/capabilities/settings/status'));if(value)setSettings(value);const h=await a.run(()=>request('/capabilities/settings/history'));if(h)setRows(h.items);}
 useEffect(()=>{load();},[]);
 useEffect(()=>{if(!settings)return;setEnabled(settings.enabled[cap]);const o=settings.options[cap];setUsd(String((o.budgetMicrosUsd||20000)/1e6));setSource(o.sourceId||sources[0]?.id||'');setNotes(o.notesFolder||'工作台随手记');setProfiles(o.profileFolders?.join('\n')||'个人上下文');setPlan(null);},[cap,settings]);
 async function preview(){if(unknown)return;let options={};if(cap==='model')options={budgetMicrosUsd:usdMicros(usd)};if(cap==='vault')options={sourceId:source,notesFolder:notes,profileFolders:profiles.split('\n').map(s=>s.trim()).filter(Boolean)};const value=await a.run(()=>request('/capabilities/settings/preview',{capability:cap,enabled,options:enabled?options:{}},'POST',false));if(value)setPlan(value);}
 async function apply(){const value=await a.run(()=>request('/capabilities/settings/apply',{token:plan.token,operationId:plan.operationId,confirmed:true},'POST',false));if(value){setResult(value);setPlan(null);await load();onChanged?.();}else if(a.lastError.current&&!a.lastError.current.operationNotStarted){setResult({operationId:plan.operationId,status:'unknown'});setUnknown(plan.operationId);setPlan(null);await load();}}
 async function check(){const value=await a.run(()=>request('/capabilities/settings/check',{operationId:unknown},'POST',false));if(value){setResult(value);if(!['unknown','running','unchecked'].includes(value.status)){setUnknown('');await load();}}}
 return <div className="capability-console" role="region" aria-label="产品能力授权"><p>四个可配置开关默认关闭。开启只授予所选能力；每次外部写入或发送仍先预览、再确认。</p>
  <PageChoices label="授权能力类型" choices={Object.entries(labels)} value={cap} onChange={setCap}/>
  <Button type="button" secondary aria-pressed={enabled} onClick={()=>{setEnabled(!enabled);setPlan(null);}} disabled={!settings||a.busy}>{enabled?'将允许':'将关闭'}{labels[cap]}</Button>
  {cap==='model'&&<label>单次模型美元费用上限<input type="number" min="0.000001" max="100" step="0.000001" value={usd} onChange={e=>setUsd(e.target.value)}/></label>}
  {cap==='vault'&&<><PageChoices label="已连接 Obsidian 来源" choices={sources.map(s=>[s.id,s.name])} value={source} onChange={setSource}/>{!sources.length&&<p>尚未连接 Obsidian 来源；Vault 授权不可开启。</p>}<label>随手记允许子目录<input value={notes} onChange={e=>setNotes(e.target.value)}/></label><label>个人说明允许子目录（每行一个，可留空）<textarea aria-label="个人说明允许子目录（每行一个，可留空）" value={profiles} onChange={e=>setProfiles(e.target.value)}/></label><p>本次 Vault 授权也允许旧知识候选入口在所选来源的 00 待整理/生活、00 待整理/工作/个人、00 待整理/工作/团队 新建文件；每次仍单独预览确认。目录必须已存在；空配置不授权整个 Vault。凭据、隐藏文件、符号链接和越界路径均拒绝。</p></>}
  {settings?.reauthorizationRequired&&<p>此数据目录由备份恢复或目录身份已变化，旧授权全部关闭。请重新预览确认需要的能力。</p>}<p>当前：{settings?settings.enabled[cap]?'已开启':'关闭':'授权状态读取中；尚不可操作'}</p>
  <Button secondary type="button" disabled={!settings||a.busy||!!unknown} onClick={preview}>预览{labels[cap]}授权</Button>
  {a.error&&<p role="alert">{a.error}</p>}{plan&&<OperationReview plan={plan} busy={a.busy} error={a.error} onCancel={()=>setPlan(null)} onConfirm={apply} label="确认本次授权设置"/>}<CapabilityResult result={result}/>{unknown&&<Button secondary type="button" disabled={a.busy} onClick={check}>查询未确认的授权设置</Button>}
  <CapabilityHistory route="/capabilities/settings" label="授权设置记录" rows={rows} onChanged={load} onBusyChange={v=>busyFlag('history',v)}/>
 </div>;
}
