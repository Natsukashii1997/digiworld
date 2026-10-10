import React,{useEffect,useState} from 'react';
import {Button} from './components.jsx';
import {request} from './api.js';
import {useCapabilityAction,OperationReview,CapabilityResult,CapabilityHistory,useCapabilityBusy} from './capability-ui-core.jsx';
import './capability-ui-core.css';
import './daemon-environment-ui.css';
const call=(suffix,data)=>request('/capabilities/daemon/'+suffix,data,data===undefined?'GET':'POST',false);
export function DaemonCapabilityUI({onBusyChange}){
 const busyFlag=useCapabilityBusy(onBusyChange);const a=useCapabilityAction(v=>busyFlag('main',v)),[status,setStatus]=useState(null),[checked,setChecked]=useState(null),[plan,setPlan]=useState(null),[result,setResult]=useState(null),[rows,setRows]=useState([]),[unknown,setUnknown]=useState(''),[selectedNames,setSelectedNames]=useState([]);
 useEffect(()=>{a.run(()=>call('status')).then(v=>v&&setStatus(v));},[]);
 async function inspect(){const value=await a.run(()=>call('inspect',{}));if(value)setChecked(value);}
 async function preview(kind){if(unknown)return;const value=await a.run(()=>call('preview',kind==='install'&&selectedNames.length?{kind,selectedEnvironmentNames:selectedNames}:{kind}));if(value)setPlan(value);}
 async function history(){const h=await a.run(()=>call('history'));if(h)setRows(h.items);}
 async function apply(){if(!plan||a.isBusy()||unknown)return;const id=plan.operationId,value=await a.run(()=>call('apply',{token:plan.token,operationId:id,confirmed:true}));if(value){setResult(value);setPlan(null);if(value.status==='unknown')setUnknown(id);await history();}else if(a.lastError.current&&!a.lastError.current.operationNotStarted){setResult({operationId:id,status:'unknown'});setUnknown(id);setPlan(null);}}
 async function check(){const value=await a.run(()=>call('check',{operationId:unknown}));if(value){setResult(value);if(!['unknown','unchecked','running'].includes(value.status))setUnknown('');}}
 const flag=v=>v===null||v===undefined?'未知':v?'是':'否';
 return <div className="capability-console" role="region" aria-label="工作台常驻管理"><p>常驻默认关闭。先预览完整配置，再确认安装；5178 已占用时由你本人在终端处理。</p><p>授权状态：{status?status.enabled?'已开启':'关闭':'尚未读完，不可操作'}</p>
 <Button secondary type="button" disabled={a.busy||!status?.enabled} onClick={inspect}>明确检查常驻状态</Button>
 {checked&&<dl><dt>配置文件已安装</dt><dd>{flag(checked.installed)}</dd><dt>用户服务已加载</dt><dd>{flag(checked.loaded)}</dd><dt>运行健康</dt><dd>{flag(checked.healthy)}</dd>{checked.reason&&<><dt>说明</dt><dd>{checked.reason}</dd></>}</dl>}
 <fieldset className="daemon-environment-select"><legend>带入常驻的环境变量名称</legend><p>这里只显示名称，默认都不带入。勾选 MCP 配置后才带入；凭据变量禁止勾选，请改用钥匙串。</p>{status?.environmentNames?.length?status.environmentNames.map(row=><label key={row.name} className="daemon-environment-option"><input type="checkbox" name="daemon-environment" value={row.name} disabled={a.busy||!!plan||!status.enabled||row.blocked} checked={!row.blocked&&selectedNames.includes(row.name)} onChange={e=>setSelectedNames(names=>e.target.checked?[...names,row.name]:names.filter(n=>n!==row.name))}/><span>{row.name}{row.reason&&<small>{row.reason}</small>}</span></label>):<p>当前服务没有可列出的环境变量名称。</p>}</fieldset>
 <div className="form-actions"><Button secondary type="button" disabled={a.busy||!status?.enabled||!!unknown} onClick={()=>preview('install')}>预览安装常驻</Button><Button secondary type="button" disabled={a.busy||!status?.enabled||!!unknown} onClick={()=>preview('uninstall')}>预览卸载常驻</Button><Button secondary type="button" disabled={a.busy||!status?.enabled||!!unknown} onClick={()=>preview('reload')}>重新加载到最新版本</Button></div>
 {plan&&<dl aria-label="本次常驻对象"><dt>常驻配置路径</dt><dd>{plan.plistPath}</dd><dt>已选环境名称</dt><dd>{plan.environmentNames?.length?plan.environmentNames.join('、'):'未选择环境变量；仅工作台固定绑定'}</dd><dt>待采用代码 SHA256</dt><dd>{plan.codeSha256}</dd></dl>}
 {plan?.terminalChecklist?.length>0&&<div role="region" aria-label="本人终端操作清单"><ol>{plan.terminalChecklist.map((step,i)=><li key={i}>{step}</li>)}</ol></div>}
 {plan&&<OperationReview plan={plan} busy={a.busy} error={a.error} onCancel={()=>setPlan(null)} onConfirm={apply} label="确认本次常驻变更"/>}
 {a.error&&<p role="alert">{a.error}</p>}<CapabilityResult result={result}/>{unknown&&<Button secondary type="button" disabled={a.busy} onClick={check}>查询未确认的常驻变更</Button>}
 <Button secondary type="button" disabled={a.busy} onClick={history}>读取常驻操作记录</Button><CapabilityHistory route="/capabilities/daemon" label="常驻操作记录" rows={rows} onChanged={history} onBusyChange={v=>busyFlag('history',v)}/>
 <p>卸载已加载服务前，请本人在终端停止固定 Label，再手动启动工作台并核验卸载预览。文件已写入、服务已加载和健康状态分别核对。</p></div>;
}
