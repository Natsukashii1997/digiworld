import "./health-audit.css";
import React,{useRef,useState} from 'react';
import {Button} from './components.jsx';
import {request} from './api.js';
import {CONTENT_AGENT_IDS} from './AgentContents.jsx';
export function HealthAudit({healthAudit={items:[]},onResult,notify,agentId}) {
 const lock=useRef(false);
 const [busy,setBusy]=useState(false),[error,setError]=useState('');
 async function inspect(){if(lock.current)return;lock.current=true;setBusy(true);setError('');try{onResult(await request('/agent-health/inspect',{}));notify('能力体检回执已保存');}catch(e){setError(e.message);}finally{lock.current=false;setBusy(false);}}
 return <section className="agent-audit" id="agent-health" tabIndex={-1} aria-label="能力体检">
  <div className="v14-sh"><h2>能力体检</h2><Button secondary disabled={busy} onClick={inspect}>{busy?'体检中…':'检查全部支持体检的已登记 Agent'}</Button></div>
  <p>只读检查入口、链接、版本与不可读目录；不读取MCP正文、凭据或会话。未检查不判为正常，gateway在线情况待接入数据，运行采用待验证。</p>
  {(error||healthAudit.error)&&<p role="alert">{error||healthAudit.error}；记录未知，未当作没有异常。</p>}
  {!healthAudit.loaded&&<p>尚未体检；检查后保存本机回执并汇总到待处理。</p>}
  {healthAudit.loaded&&!healthAudit.items.length&&<p>没有已登记且支持内容检查的Agent；其余能力待接入数据。</p>}
  {healthAudit.loaded&&agentId&&!healthAudit.items.some(x=>x.agentId===agentId)&&<p>{CONTENT_AGENT_IDS.includes(agentId)?'尚无该伙伴的体检回执；不将其判为正常。':'该伙伴暂不支持能力体检；仅保留安装检测。'}</p>}
  <ul>{healthAudit.items.filter(x=>!agentId||x.agentId===agentId).map(x=><li key={x.agentId}><strong>{x.name} · {x.status==='unknown'?'结果未知':`失效 ${x.health.brokenLinks} · 差异 ${x.health.drift} · 不可读 ${x.health.unreadable}`}</strong><small>检查于 {new Date(x.at).toLocaleString('zh-CN')}；{x.truncated?'范围不完整；':''}未读：{x.unread.join('、')}</small></li>)}</ul>
 </section>;
}
