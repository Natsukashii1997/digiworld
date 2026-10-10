import React, { useEffect, useRef, useState } from "react";
import { ArrowRight, ChevronDown, ChevronUp, X } from "lucide-react";
import { inboxSummary, rulePendingReady } from "./pending.js";
import { ProfileProposals } from "./ProfileProposals.jsx";
import { Pixel } from "./pixel.jsx";
import { request } from "./api.js";
import "./inbox-v16.css";
import { inboxTime } from "./inbox-time.js";

export function InboxDrawer({ items, state, ruleInstalls, navigate, select, adoptState, notify, onClose, onKnowledgeRead, collabStatus, nightV2Reports = {loaded:true,items:[]}, target }) {
  const ref = useRef(), closeRef = useRef(onClose), busy = useRef(false), restore = useRef(true);
  closeRef.current = onClose;
  const [intelOpen,setIntelOpen] = useState(false);
  const groups = inboxSummary(items);
  const targetedItem = target?.itemId ? items.find(item => item.id === target.itemId) : null;
  useEffect(() => {
    if (!targetedItem) return;
    if ((!targetedItem.triage || targetedItem.triage === "顺手看看") && !intelOpen) { setIntelOpen(true); return; }
    const card = [...(ref.current?.querySelectorAll("[data-item-id]") || [])]
      .find(node => node.dataset.itemId === target.itemId);
    if (!card) return;
    requestAnimationFrame(() => {
      card.scrollIntoView({ block: "center", behavior: "instant" });
      card.querySelector("button")?.focus({ preventScroll: true });
    });
  }, [target?.key, targetedItem?.id, intelOpen]);
  const close = () => { if (!busy.current) closeRef.current(); };
  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    const background = [...document.querySelectorAll(".sidebar,.workspace,.skip-link")].map(el=>[el,el.inert]);
    for (const [el] of background) el.inert = true;
    document.body.style.overflow = "hidden";
    ref.current?.focus();
    const keyboard = event => {
      const topDialog = [...document.querySelectorAll('[role="dialog"]')].at(-1);
      if(topDialog && topDialog !== ref.current)return;
      if(event.key === "Escape") { event.preventDefault(); event.stopPropagation(); if(!busy.current)closeRef.current(); }
      if(event.key !== "Tab")return;
      const controls = [...ref.current.querySelectorAll('button:not(:disabled),a[href],input:not(:disabled),textarea:not(:disabled),select:not(:disabled),summary,[tabindex="0"]')].filter(el=>el.checkVisibility());
      const first=controls[0],last=controls.at(-1),active=document.activeElement;
      if(!controls.length) { event.preventDefault();return; }
      if(!ref.current.contains(active) || active === ref.current || (event.shiftKey && active===first) || (!event.shiftKey && active===last)) {
        event.preventDefault(); (event.shiftKey?last:first).focus();
      }
    };
    document.addEventListener("keydown",keyboard,true);
    return () => {
      document.removeEventListener("keydown",keyboard,true);
      document.body.style.overflow = previousOverflow;
      for(const [el,was] of background)el.inert=was;
      if(restore.current)document.querySelector(".topbar-inbox")?.focus();
    };
  },[]);
  useEffect(()=>{
    let alive=true;
    request("/knowledge/zones/summary",{}).then(value=>alive&&onKnowledgeRead({...value,loaded:true})).catch(error=>alive&&onKnowledgeRead({loaded:true,loadError:error.message}));
    return ()=>{alive=false;};
  },[onKnowledgeRead]);
  function navigateAway(...args) {
    if(busy.current)return;
    restore.current=false;
    onClose();
    navigate(...args);
  }
  function jump(item) {
    if(busy.current)return;
    restore.current=false;
    onClose();
    if(item.assetId)select(item.assetId);
    else navigate(item.to,{...(item.agentId?{agentId:item.agentId,agentTab:item.agentTab}:{}),...(item.projectId?{projectId:item.projectId}:{}),...(item.sourceId?{sourceId:item.sourceId}:{}),...(item.taskId?{taskId:item.taskId}:{}),...(item.nightRunId?{nightRunId:item.nightRunId}:{})});
  }
  const unresolved = (!rulePendingReady(ruleInstalls) && !ruleInstalls?.error) || collabStatus?.loaded === false ||
    (!nightV2Reports?.loaded && !nightV2Reports?.error);
  return <div className="ib-layer">
    <div className="ib-scrim" onMouseDown={event=>{event.preventDefault();close();}} aria-hidden="true" />
    <aside className="ib-drawer" ref={ref} role="dialog" aria-modal="true" aria-label="待处理" tabIndex={-1}>
      <header className="ib-head"><div><span className="en">INBOX · QUEST BOARD</span><h2>待处理</h2></div><button className="icon-button" aria-label="关闭待处理" onClick={close}><X size={18}/></button></header>
      {!!items.length && <div className="ib-count" aria-label="待处理计数">{groups.map(group=><span className={group.key} key={group.key}><b className="mono">{group.count}</b>{group.short}</span>)}</div>}
      <div className="ib-body">
        {unresolved && <p role="status" className="ib-status">{!rulePendingReady(ruleInstalls) && !ruleInstalls?.error ? "规则模板装入记录还在读取，读完前不能确定待处理是否完整。" : collabStatus?.loaded === false ? "协同协议还在读取，读完前不能确定待处理是否完整。" : "夜巡 v2 晨报仍在读取，读完前不能确定待处理是否完整。"}</p>}
        {items.length > 0 ? groups.map(group=>{
          const entries=items.filter(item=>group.key==="intel"?!item.triage || item.triage===group.triage:item.triage===group.triage);
          const cards = <ul>{entries.filter(item=>!state.profileProposals?.some(p=>item.id===`profile-${p.id}`)).map(item=><li className="ib-card" key={item.id} data-item-id={item.id}>
                <button className="ib-card-btn" aria-label={`${item.kind} ${item.title} ${item.detail} 前往`} onClick={()=>jump(item)}><span className="ib-card-main"><b>{item.title}</b><small>{item.detail}</small>{!item.triage&&<span className="ib-unclassified">未归类</span>}</span><span className="ib-card-side"><time className="en" dateTime={item.foundAt||undefined}>{inboxTime(item.foundAt)}</time><span className="ib-go">前往 <ArrowRight size={13}/></span></span></button>
              </li>)}</ul>;
          return <section className={`ib-sec ${group.key}`} key={group.key} aria-label={group.label}>
            <h3><i aria-hidden="true"/><span className="en">{group.en}</span>{group.label}<b className="mono">{group.count}</b>{group.key==="intel"&&group.count>0&&<button className="ib-fold" aria-expanded={intelOpen} aria-controls="ib-intel" onClick={()=>setIntelOpen(v=>!v)}>{intelOpen?<ChevronUp size={14}/>:<ChevronDown size={14}/>} {intelOpen?"收起":"展开"}</button>}</h3>
            {(group.key!=="intel"||group.count>0) && <div id={group.key==="intel"?"ib-intel":undefined} hidden={group.key==="intel"&&!intelOpen}>
              {group.key==="side" ? <ProfileProposals inbox state={state} adoptState={adoptState} notify={notify} navigate={navigateAway} onBusyChange={value=>{busy.current=value;}}>
              {cards}
              </ProfileProposals> : cards}
            </div>}
          </section>;
        }) : !unresolved && <div className="ib-empty"><Pixel sprite="koromon" size={64}/><span className="ib-zzz en" aria-hidden="true">z z Z</span><p>没有要你处理的事</p></div>}
        {!items.length && <ProfileProposals inbox state={state} adoptState={adoptState} notify={notify} navigate={navigateAway} onBusyChange={value=>{busy.current=value;}}/>}
      </div>
    </aside>
  </div>;
}
