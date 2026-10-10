// 智能体角色卡、选角与四个档案标签页（派单168）。
// 角色卡可编辑，编辑后存主库 agentRoles；常驻项目只从已登记项目的“下一步”交接字段推断，推断不了留空。
import React, { useEffect, useLayoutEffect, useRef, useState } from "react";
import { PenLine } from "lucide-react";
import { Button, Dialog, Badge } from "./components.jsx";
import { AgentSprite, Corners, LcdCount, ResultChip, useFlash, useReducedMotion } from "./v14.jsx";
import { characterOf } from "./characters.js";
import { CONTENT_AGENT_IDS } from "./AgentContents.jsx";
import {
  COST_LABEL,
  TIER_LABEL,
  rolesOf,
  saveRole,
  inferProjects,
  parseList,
  parseProjects,
  NOTE_MAX,
} from "./agent-roles.js";
import "./silver-agents.css";

function RoleEditor({ state, role, inferred, save, notify, onClose }) {
  const [strengths, setStrengths] = useState(role.strengths.join("，")),
    [cost, setCost] = useState(role.cost),
    [projects, setProjects] = useState((role.edited ? role.projects : inferred).join("，")),
    [note, setNote] = useState(role.note),
    [busy, setBusy] = useState(false);
  async function submit(e) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    try {
      const ok = await save({
        ...state,
        agentRoles: saveRole(state, role.agentId, {
          strengths: parseList(strengths),
          cost,
          projects: parseProjects(projects),
          note,
        }),
      });
      if (ok) {
        onClose();
        notify(`已保存 ${role.name} 的角色卡`);
      }
    } finally {
      setBusy(false);
    }
  }
  return (
    <Dialog title={`编辑角色卡：${role.name}`} onClose={onClose}>
      <form className="asset-form" onSubmit={submit}>
        <label>
          擅长关键词（用逗号或空格分隔）
          <input value={strengths} onChange={(e) => setStrengths(e.target.value)} placeholder="例如：重构，测试，界面" />
        </label>
        <label>
          成本
          <select value={cost} onChange={(e) => setCost(e.target.value)}>
            {Object.entries(COST_LABEL).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <label>
          常驻项目（用逗号分隔）
          <input value={projects} onChange={(e) => setProjects(e.target.value)} />
        </label>
        <label>
          备注
          <textarea rows={3} maxLength={NOTE_MAX} value={note} onChange={(e) => setNote(e.target.value)} />
        </label>
        <p className="helper">角色卡内容由你维护；常驻项目为空时仅按已登记项目的交接字段推断。</p>
        <div className="form-actions">
          <Button disabled={busy}>保存角色卡</Button>
        </div>
      </form>
    </Dialog>
  );
}

const DETECT = {
  detected: (a) => `已检测 · ${a.programs?.length || 0} 个程序入口`,
  config_only: () => "仅发现配置痕迹",
  not_detected: () => "未检测到",
  unknown: () => "检测受阻",
};
const COST_CELLS = { low: 1, medium: 2, high: 3, unknown: 0 };
const HUES = { codex: "77,227,255", "claude-code": "255,138,36", hermes: "168,145,255", openclaw: "255,143,184" };
const hueOf = (id) => HUES[id] || "140,178,255";
// 名册上的检查摘要：有结果才下结论，未检查不等于失败。
function checkChip(role, result) {
  if (!CONTENT_AGENT_IDS.includes(role.agentId)) return ["仅安装检测", "muted"];
  if (!result) return ["未检查", "muted"];
  if (result.health.brokenLinks) return [`失效 ${result.health.brokenLinks}`, "danger"];
  return ["未发现失效", "ok"];
}
function CheckCell({ k, value, run, mark }) {
  return (
    <span className="role-cell" aria-hidden="true">
      <span className="zk">
        <span>{k}</span>
        {mark && <span className="mk" />}
      </span>
      <span className="num">
        <LcdCount key={run} value={value} px={4} pad={3} label={null} />
      </span>
    </span>
  );
}
// 档案里的内容检查：液晶读数条，数字来自内容清单的最近一次只读结果；没有结果显示横线，不显示 0。
export function ContentCheck({ role, result }) {
  const flash = useFlash();
  const reduced = useReducedMotion();
  const at = result?.at;
  useEffect(() => {
    if (!at) return;
    const timer = setTimeout(flash.fire, reduced ? 0 : 720);
    return () => clearTimeout(timer);
  }, [at]);
  if (!CONTENT_AGENT_IDS.includes(role.agentId))
    return (
      <div className="role-check">
        <div className="role-check-head">
          <b>内容检查</b>
          <Badge tone="muted">不支持</Badge>
        </div>
        <p className="role-check-scope">{role.name}暂只做安装检测，不读取 Skill 与插件目录。</p>
      </div>
    );
  const h = result?.health;
  const g = result?.groups;
  const cells = [
    ["SKILL", g ? g.skills.items.length : "---"],
    ["PLUGIN", g ? g.plugins.items.length : "---"],
    ["BROKEN", h ? h.brokenLinks : "---", !!h?.brokenLinks],
    ["UNREAD", h ? h.unreadable : "---"],
  ];
  return (
    <div className="role-check">
      <div className="role-check-head">
        <b>内容检查</b>
        {h ? <Badge tone={h.brokenLinks ? "danger" : "success"}>{h.brokenLinks ? "有失效链接" : "未发现失效"}</Badge> : <Badge tone="muted">未检查</Badge>}
        <span className="role-check-when">{at ? `检查于 ${new Date(at).toLocaleString("zh-CN", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" })} · 只读` : "未检查不等于失败"}</span>
      </div>
      <div className="role-check-band" ref={flash.ref}>
        <span className="sr-only">
          {h
            ? `Skill ${g.skills.items.length}，插件 ${g.plugins.items.length}，失效链接 ${h.brokenLinks}，无法读取 ${h.unreadable}`
            : "尚未检查"}
        </span>
        {cells.map(([k, v, mark]) => (
          <CheckCell key={k} k={k} value={v} run={at || "none"} mark={mark} />
        ))}
      </div>
      {h ? (
        <>
          <p className="role-check-legend">
            {h.brokenLinks ? (
              <span className="danger">■ 失效链接 {h.brokenLinks}：链接指向的 Skill 已不存在</span>
            ) : (
              <span className="ok">■ 未发现失效链接</span>
            )}
            {!!h.unreadable && <span className="warn">■ 无法读取 {h.unreadable}：读不到的目录或文件，不代表 Agent 不能工作</span>}
            {!!h.drift && <span className="warn">■ 与仓库不一致 {h.drift}</span>}
          </p>
          <p className="role-check-scope">
            范围：{g.skills.root || "Skill 目录"}
            {g.plugins.root ? ` 与插件目录` : ""}
            {result.truncated ? "（条目较多，只列出前一部分）" : ""}
          </p>
        </>
      ) : (
        <p className="role-check-scope">还没有做过只读检查。展开清单时只读读取 Skill 与插件目录。</p>
      )}
      <ResultChip flash={flash}>已读取</ResultChip>
    </div>
  );
}


// UI v16：选择、接力目标和四个档案标签共用同一个受控picked状态。
export function AgentRoles({ state, save, notify, agents = [], results = {}, healthAudit = { items: [] }, picked = "codex", onPick = () => {}, sourceId, launch, renderContents, renderHealth, renderConfiguration, tab="档案", onTab=()=>{} }) {
  const base=rolesOf(state);
  const order=["claude-code","codex","hermes","openclaw"];
  const mains=order.map(id=>base.find(r=>r.agentId===id));
  const extra=[...base.filter(r=>!order.includes(r.agentId)),...agents.filter(a=>!base.some(r=>r.agentId===a.id)).map(a=>({agentId:a.id,name:a.name,tier:"aux",strengths:[],cost:"unknown",projects:[],note:"仅安装检测，角色卡尚未登记",edited:false}))];
  const roles=[...mains,...extra];
  const role=roles.find(r=>r.agentId===picked)||base[0];
  const [editing,setEditing]=useState(null),[more,setMore]=useState(false),[canScroll,setCanScroll]=useState(false);
  const panelRef=useRef(null);
  const editingRole=base.find(r=>r.agentId===editing);
  const character=order.includes(role.agentId)?characterOf(role.agentId):null;
  const inferred=inferProjects(state,role.agentId);
  const projects=role.edited&&role.projects.length?role.projects:inferred;
  const g=results[role.agentId]?.groups;
  const inspected=healthAudit.items?.find(x=>x.agentId===role.agentId&&x.status==='checked')?.health;
  const inspectionIssues=inspected ? inspected.brokenLinks+inspected.drift+inspected.unreadable : null;
  const steps={low:1,medium:3,high:5,unknown:0}[role.cost]||0;
  const pick=r=>{onPick(r.agentId);};
  useLayoutEffect(()=>{
    const panel=panelRef.current;
    if(!panel)return;
    panel.scrollTop=0;
    const frame=requestAnimationFrame(()=>{panel.scrollTop=0;});
    return()=>cancelAnimationFrame(frame);
  },[tab,role.agentId]);
  useEffect(()=>{
    const panel=panelRef.current;
    if(!panel)return;
    const update=()=>setCanScroll(panel.scrollTop+panel.clientHeight<panel.scrollHeight-2);
    const resize=new ResizeObserver(update);
    const mutation=new MutationObserver(update);
    resize.observe(panel);
    mutation.observe(panel,{childList:true,subtree:true,characterData:true,attributes:true,attributeFilter:['hidden','open']});
    panel.addEventListener('scroll',update,{passive:true});
    update();
    return()=>{resize.disconnect();mutation.disconnect();panel.removeEventListener('scroll',update);};
  },[tab,role.agentId]);
  function keys(e){if(!e.target.closest('[role="radio"]'))return;const step={ArrowRight:1,ArrowDown:1,ArrowLeft:-1,ArrowUp:-1}[e.key];if(!step&&e.key!=="Home"&&e.key!=="End")return;e.preventDefault();const visible=[...mains,...extra.filter((r,i)=>more||i===0||r.agentId===picked)];const at=visible.findIndex(r=>r.agentId===role.agentId);const next=e.key==='Home'?0:e.key==='End'?visible.length-1:(at+step+visible.length)%visible.length;pick(visible[next]);const target=e.currentTarget.querySelector(`[data-agent="${visible[next].agentId}"]`);target?.focus({preventScroll:true});target?.scrollIntoView({block:"nearest",inline:"start",behavior:"instant"});}
  const tabs=["档案","内容","体检","配置"];
  return <section id="agent-roles" aria-label="角色卡">
    <section className="select" aria-labelledby="select-title">
      <div className="sec-head"><h2 id="select-title" className="en-head"><span className="en">SELECT</span>带到哪里继续</h2><span className="sec-meta">4 位主力 · {extra.length} 位伙伴</span></div>
      <p className="agent-scroll-cue">左右滑动选伙伴 · {order.includes(role.agentId) ? `${order.indexOf(role.agentId)+1} / ${mains.length}` : "已选其他伙伴"}</p>
      <div role="radiogroup" aria-label="接力目标" onKeyDown={keys}>
        <div className="cast">{mains.map(r=><button type="button" key={r.agentId} data-agent={r.agentId} role="radio" aria-label={`${r.name} · ${characterOf(r.agentId).name}`} aria-checked={r.agentId===role.agentId} tabIndex={r.agentId===role.agentId?0:-1} className={`rc m-panel${r.agentId===role.agentId?' on':''}`} style={{'--hue':hueOf(r.agentId)}} onClick={()=>pick(r)}>
          {sourceId===r.agentId&&<span className="rc-source">来源</span>}
          <span className={`rc-stage${['hermes','openclaw'].includes(r.agentId)?' rookie':''}`}><AgentSprite agent={r.agentId} mode="body" className="sprite" /></span>
          <span className="rc-label"><b>{characterOf(r.agentId).name}</b><span className="en">{r.name}</span></span>
        </button>)}</div>
        <div className="others"><span className="en">MORE</span>{extra.filter((r,i)=>more||i===0||r.agentId===picked).map(r=><button type="button" role="radio" aria-label={r.name} key={r.agentId} data-agent={r.agentId} aria-checked={r.agentId===role.agentId} tabIndex={r.agentId===role.agentId?0:-1} className={`oc${r.agentId===role.agentId?' on':''}`} onClick={()=>pick(r)}><span className="oc-icon">{r.name.slice(0,1)}</span>{r.name}</button>)}{extra.length>1&&<button type="button" className="text-btn more-toggle" aria-expanded={more} onClick={()=>setMore(!more)}>{more?'收起伙伴':'更多伙伴'}</button>}</div>
      </div>
    </section>
    {launch}
    <section className="archive" aria-labelledby="archive-title" style={{'--hue':hueOf(role.agentId)}}>
      <div className="stage m-screen"><Corners/><span className="stage-floor"/><span className={`v16-hero${character?'':' placeholder'}`} key={role.agentId}>{character?<AgentSprite agent={role.agentId} mode="dossier" className={`sprite hero${['hermes','openclaw'].includes(role.agentId)?' rookie':''}`}/>:<span className="role-placeholder" aria-hidden="true">{role.name.slice(0,2)}</span>}</span><div className="stage-plate"><h2 id="archive-title">{character?.name||role.name}</h2><span id={`role-name-${role.agentId}`} className="en">{role.name} · {order.includes(role.agentId)?'主力':'伙伴'}</span></div></div>
      <div className={`dossier${canScroll?' has-more':''}`}>
        <div className="tabs" role="tablist" aria-label="档案" onKeyDown={e=>{const n=tabs.indexOf(tab),step={ArrowRight:1,ArrowLeft:-1}[e.key];if(!step&&e.key!=='Home'&&e.key!=='End')return;e.preventDefault();const i=e.key==='Home'?0:e.key==='End'?3:(n+step+4)%4;onTab(tabs[i]);e.currentTarget.querySelectorAll('[role="tab"]')[i].focus();}}>{tabs.map((t,i)=><button type="button" key={t} role="tab" id={`agent-tab-${i}`} aria-controls={`agent-panel-${i}`} aria-selected={t===tab} tabIndex={t===tab?0:-1} className={t===tab?'on':''} onClick={()=>onTab(t)}>{t}{t==='内容'&&g&&<span className="tab-n">{g.skills.items.length+g.plugins.items.length}</span>}{t==='体检'&&inspected&&<span className={`tab-n${inspectionIssues?' warn':''}`}>{inspectionIssues}</span>}</button>)}</div>
        <div role="tabpanel" ref={panelRef} className={tab==='档案'?'role-panel-profile':undefined} id={`agent-panel-${tabs.indexOf(tab)}`} aria-labelledby={`agent-tab-${tabs.indexOf(tab)}`} tabIndex={0}>
          {tab==='档案'&&<><div className="role-profile-head">{!role.edited&&<small className="role-draft">草拟默认，未经你确认</small>}{base.some(r=>r.agentId===role.agentId)&&<button type="button" className="text-btn edit" aria-describedby={`role-name-${role.agentId}`} onClick={()=>setEditing(role.agentId)}><PenLine size={15}/>编辑角色卡</button>}</div><dl className="facts"><div><dt><span className="en">STRENGTHS</span>擅长</dt><dd className={role.strengths.length?'tags':'role-empty'}>{role.strengths.length?role.strengths.map(x=><span key={x}>{x}</span>):'—'}</dd></div><div><dt><span className="en">COST</span>成本</dt><dd className="cost">{[0,1,2,3,4].map(i=><i key={i} className={i<steps?'on':''} aria-hidden="true"/>)}<b>{COST_LABEL[role.cost]}</b></dd></div><div><dt><span className="en">PROJECTS</span>常驻项目</dt><dd className={projects.length?'mono':'role-empty'}>{projects.length?projects.map((x,i)=><React.Fragment key={x}>{i>0&&<br/>}{x}</React.Fragment>):'—'}{(!role.edited||!role.projects.length)&&inferred.length>0&&'（推断）'}</dd></div><div><dt><span className="en">NOTE</span>备注</dt><dd className={role.note?'':'role-empty'}>{role.note||'—'}</dd></div></dl></>}
          {tab==='内容'&&<><ContentCheck role={role} result={results[role.agentId]}/>{renderContents?.(role.agentId)}</>}
          {tab==='体检'&&renderHealth?.(role.agentId)}
          {tab==='配置'&&renderConfiguration?.(role.agentId)}
        </div>
      </div>
    </section>
    {editingRole&&<RoleEditor state={state} role={editingRole} inferred={inferProjects(state,editingRole.agentId)} save={save} notify={notify} onClose={()=>setEditing(null)}/>}
  </section>;
}
