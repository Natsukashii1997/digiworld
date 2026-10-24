import { projectScanNotice } from "./project-scan-status.js";
import {projectLaunchSignature} from './project-freshness.js';
import { Reading, ReadReveal } from './ScanMotion.jsx';
import { ProjectSettings } from "./ProjectSettings.jsx";
import { savepointThresholds } from "./settings-v16.js";
import { projectSavepointAge as savepointAge } from "./pending.js";
import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import {
  ArrowUpRight,
  RefreshCw,
  Settings2,
  Search,
  AlertCircle,
  Github,
} from "lucide-react";
import { Button, Dialog, Badge, SourceReadError } from "./components.jsx";
import { request, scan } from "./api.js";
import { Pixel } from "./pixel.jsx";
import { AgentSprite, LcdText, useReducedMotion } from "./v14.jsx";
import { castOf, characterOf, AGENT_CAST } from "./characters.js";
import { ActiveToggle, CurrentBlock, SafetyBlock, CHECK_LABELS, checkText } from "./ProjectStatus.jsx";
import { ProjectLocations } from "./ProjectLocations.jsx";
import { ProjectCatalogEditor } from "./ProjectCatalog.jsx";
import { ProjectContext } from "./ProjectContext.jsx";
import { ProjectRules } from "./RuleInstall.jsx";
import { GithubBlock, useGithubPanel } from "./ProjectGithub.jsx";
import { STAGES, linkText } from "./collab.js";
import { usePromptCopy } from "./Collab.jsx";
import { SlotDesk, LoadoutDialog, ManualNext, deskRows } from "./ProjectDesk.jsx";
import { relayDesk, relayDeskSection } from "./relay-desk.js";
import {
  sortSaveItems,
  groupProjectRacks,
  groupPortfolioSections,
  readableCurrent,
  continuableCurrent,
  projectRelayPrompt,
} from "./projects-v16.js";
import "./projects-v16.css";
export function Floppy() {
  return (
    <svg
      className="pj-floppy"
      viewBox="0 0 10 10"
      shapeRendering="crispEdges"
      aria-hidden="true"
    >
      <path d="M1 1h7l1 1v7H1z" fill="currentColor" opacity=".9" />
      <path d="M3 1h4v3H3z" fill="var(--bg)" />
      <path d="M5 1.5h1v2H5z" fill="currentColor" />
      <path d="M2.5 6h5v2.5h-5z" fill="var(--bg)" opacity=".75" />
    </svg>
  );
}
// 可见路径按实测宽度裁为字符串，完整路径保留title与读屏；不靠overflow隐藏超长DOM。
function PathLabel({ value }) {
  const ref = useRef(null),
    [text, setText] = useState("");
  useLayoutEffect(() => {
    let alive = true;
    const el = ref.current,
      canvas = document.createElement("canvas"),
      ctx = canvas.getContext("2d");
    const fit = () => {
      if (!alive) return;
      ctx.font = getComputedStyle(el).font;
      const width = el.clientWidth;
      let t = value || "";
      if (ctx.measureText(t).width > width) {
        const chars = [...t];
        while (
          chars.length &&
          ctx.measureText(chars.join("") + "…").width > width
        )
          chars.pop();
        t = chars.length ? chars.join("") + "…" : "";
      }
      setText(t);
    };
    fit();
    const observer = new ResizeObserver(fit);
    observer.observe(el);
    document.fonts.ready.then(fit);
    return () => {
      alive = false;
      observer.disconnect();
    };
  }, [value]);
  return (
    <span className="pj-path" ref={ref} title={value} aria-label={value}>
      {text}
    </span>
  );
}
const date = (value) =>
  value
    ? new Date(value).toLocaleString("zh-CN", {
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
      })
    : "未知";
function recent(p) {
  return p.recentUpdate?.at
    ? new Date(p.recentUpdate.at).toLocaleDateString("zh-CN", {
        month: "2-digit",
        day: "2-digit",
      }) + (p.recentUpdate.state === "partial" ? " · 部分" : "")
    : "未知";
}
const projectSource = (project) => project.githubUrl ? "github" : "local";
// 库里只显示短路径：家目录写成 ~；完整路径在悬停提示里。
const shortPath = (value) => String(value || "").replace(/^\/Users\/[^/]+/, "~");
const unavailable = (item) =>
  item.current?.state === "absent"
    ? "文件不存在"
    : item.current?.state === "unparsed"
      ? "格式不对"
      : item.current?.message || "尚未取得读取结果";
const pad2 = (n) => String(n).padStart(2, "0");
const hhmm = (value) =>
  value ? new Date(value).toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit", hour12: false }) : "";
const monthDay = (key) => { const [, m, d] = String(key || "").split("-"); return m ? `${+m}/${+d}` : ""; };
const level = (n) => (n == null ? "unk" : n === 0 ? "l0" : n < 3 ? "l1" : n < 16 ? "l2" : "l3");
const canonicalAgent = (agent) => (agent === "claude" ? "claude-code" : agent);
// 按帧动效：每一帧都是 steps 硬切，不写 CSS transition；减少动态效果时直接到位。
const STEP = { easing: "steps(1, end)" };
function frames(el, list, duration) {
  try { return el?.animate?.(list.map((f, i) => ({ offset: i / Math.max(1, list.length - 1), ...f, ...STEP })), { duration }); } catch { return null; }
}
// 下一步按字打出来；新文字或换卡带时重打一次。
function useTyped(text, key, reduced) {
  const [shown, setShown] = useState(reduced ? text : "");
  useEffect(() => {
    if (reduced || !text) { setShown(text); return; }
    let i = 0, timer;
    const chars = [...text], step = Math.max(2, Math.ceil(chars.length / 40));
    setShown("");
    const tick = () => { i = Math.min(chars.length, i + step); setShown(chars.slice(0, i).join("")); if (i < chars.length) timer = setTimeout(tick, 24); };
    timer = setTimeout(tick, 200);
    return () => clearTimeout(timer);
  }, [text, key, reduced]);
  return reduced ? text : shown;
}
function healthOf(item, readFailed) {
  const checks = item.safety?.checks || {};
  if (readFailed) return { dots: [], text: "体检未知", tone: "" };
  if (!checks.git) return { dots: [], text: "体检待核实", tone: "" };
  if (checks.git.state === "none") return { dots: ["bad"], text: "不是 Git 仓库", tone: "bad" };
  if (checks.git.state === "unknown") return { dots: [], text: "体检未知", tone: "" };
  const tones = CHECK_LABELS.map(([key]) => checkText(key, checks[key])[0]);
  const bad = tones.filter((t) => t === "danger").length, ok = tones.filter((t) => t === "success").length;
  return {
    dots: tones.map((t) => (t === "success" ? "ok" : t === "danger" ? "bad" : t === "warning" ? "warn" : "")),
    text: bad ? `${bad} 项要处理` : `${ok} 项正常`,
    tone: bad ? "bad" : "",
  };
}
function cartStatus(item, readFailed, reading) {
  const readable = readableCurrent(item);
  if (!readFailed && (reading || item.current?.state === "loading")) return ["", "读取中"];
  if (readable) {
    const i = STAGES.findIndex((s) => s.id === item.stage?.id);
    return ["ok", i >= 0 ? `${STAGES[i].label} · ${i + 1}/5` : "阶段未知"];
  }
  if (item.current?.state === "outline" && !readFailed) return ["ok", "最近进展"];
  return ["bad", readFailed ? "状态待核实" : "读不到 CURRENT"];
}
// 卡带：SLOT + 头像 + 名字 + 一盏灯；点哪盘，下面的读档屏就读哪盘。
function SlotCart({ item, index, on, readFailed, reading, onSelect, onKeyDown }) {
  const holder = readableCurrent(item) ? castOf(item.current?.fields?.writer) : null,
    [tone, text] = cartStatus(item, readFailed, reading),
    stalled = readableCurrent(item) && item.activity?.state === "stalled";
  return (
    <button
      type="button"
      role="tab"
      id={`pj-cart-${item.projectId}`}
      aria-selected={on}
      aria-controls="pj-screen"
      tabIndex={on ? 0 : -1}
      aria-label={`SLOT ${pad2(index + 1)} · ${item.name} · ${text}`}
      className={`pj-cart${on ? " on" : ""}${tone === "bad" ? " s-unread" : ""}${stalled ? " stalled" : ""}`}
      style={holder ? { "--hue": holder.hue } : undefined}
      data-project-id={item.projectId}
      onClick={onSelect}
      onKeyDown={onKeyDown}
    >
      <span className={`pj-holder${holder ? "" : " ghost"}`}>
        {holder ? <AgentSprite agent={holder.id} mode="head" /> : <b>?</b>}
      </span>
      <span className="nm"><span className="en">SLOT {pad2(index + 1)}</span><b>{item.name}</b></span>
      <span className={`pj-lamp ${tone}`}><i />{text}</span>
    </button>
  );
}
// 30 天双轨：Git / CURRENT 各一行，格上直接写次数；读不到时两行斜纹。
function ActivityLanes({ item, readable }) {
  const days = readable ? (item.daily?.days || []).slice(-30) : [],
    stalled = readable && item.activity?.state === "stalled",
    lane = (key, name, cls) => (
      <div className={`pj-lane ${cls}`}>
        <span className="ln">{name}</span>
        <div className="c30">
          {Array.from({ length: 30 }, (_, i) => {
            const d = days[i - (30 - days.length)], n = d ? d[key] : null, dow = d ? new Date(d.date + "T00:00:00").getDay() : 1;
            return (
              <i key={i} className={`${level(n)}${dow % 6 === 0 ? " we" : ""}${i === 29 ? " today" : ""}`} title={d ? `${monthDay(d.date)} · ${name} ${n ?? "未知"}` : "未知"}>
                {n ? <b>{n}</b> : null}
              </i>
            );
          })}
        </div>
      </div>
    );
  const known = days.length > 0,
    gitDays = days.filter((d) => d.git).length,
    gitTotal = days.reduce((t, d) => t + (d.git || 0), 0),
    curDays = days.filter((d) => d.current).length;
  return (
    <div className={`pj-lanes${known ? "" : " unknown"}`} aria-label="近30天活动">
      <div className="lh">
        <span className="lab">近 30 天</span>
        {known ? (
          <>
            <span className="lh-t"><i className="sw g" />Git {gitDays} 天 · {gitTotal} 次提交</span>
            <span className="lh-t"><i className="sw c" />CURRENT {curDays} 天</span>
          </>
        ) : (
          <span className="lh-t">活动未知 · 不代表没有活动</span>
        )}
        <span className="grow" />
        <span className="lh-t">
          {stalled ? `停滞 ${item.activity.idleDays} 天` : <>最近一次 <b>{readable ? date(item.activity?.latestAt) : "未知"}</b></>}
        </span>
      </div>
      <div className="pj-lscroll" data-pj-lscroll tabIndex={0} role="region" aria-label="近 30 天每日 Git 与 CURRENT 次数">
        {lane("git", "Git", "git")}
        {lane("current", "CURRENT", "cur")}
        <div className="pj-ticks" aria-hidden="true">
          <span />
          <div>
            {Array.from({ length: 30 }, (_, i) => {
              const d = days[i - (30 - days.length)];
              return <span key={i}>{i === 29 ? "今天" : d && new Date(d.date + "T00:00:00").getDay() === 1 ? monthDay(d.date) : ""}</span>;
            })}
          </div>
        </div>
      </div>
      <span className="sr-only">
        {known
          ? days.map((p) => `${p.date}：Git ${p.git ?? "未知"}，CURRENT ${p.current ?? "未知"}`).join("；")
          : "阶段和每日活动未知，不代表没有活动"}
      </span>
      {readable && item.daily?.state !== "ok" && (
        <small className="pj-unknown">
          {item.daily?.note || "每日活动未知"}
          {item.daily?.reason && ` · ${item.daily.reason}`}
        </small>
      )}
    </div>
  );
}
// 一列短读数：阶段 / 体检 / 队伍 / 存档（超过阈值才出现）。
function ReadStats({ item, readable, outline, readFailed, desk, savepointDays, savepointWarnDays, onDetails, onTeam }) {
  const i = readable ? STAGES.findIndex((s) => s.id === item.stage?.id) : -1,
    health = healthOf(item, readFailed),
    pending = desk.inbox.filter((n) => !n.relayed && !n.missing).length,
    gear = desk.loadout.filter((n) => !n.missing).length;
  return (
    <div className="pj-stats">
      <div
        className="st"
        aria-label={`接力阶段：${i >= 0 ? STAGES[i].label : "未知"}`}
        title={readable ? item.stage?.basis || "当前记录不足以推断" : outline ? "没有协作状态表，阶段不推断" : "CURRENT不可读，阶段未知"}
      >
        <span className="lab">阶段</span>
        <span className={`seg5${i < 0 ? " unk" : ""}`} aria-hidden="true">
          {STAGES.map((s, k) => <i key={s.id} className={i >= 0 && k <= i ? "on" : ""} />)}
        </span>
        <b>{i >= 0 ? `${STAGES[i].label} ${i + 1}/5` : "未知"}</b>
      </div>
      <button type="button" className="st" onClick={onDetails} aria-label={`体检：${health.text}，打开详情`}>
        <span className="lab">体检</span>
        <span className="dots" aria-hidden="true">{health.dots.map((d, k) => <i key={k} className={d} />)}</span>
        <b className={health.tone}>{health.text}</b>
      </button>
      <button type="button" className="st" onClick={onTeam} aria-label={`队伍：收件 ${pending} · 装备 ${gear}，打开`}>
        <span className="lab">队伍</span>
        <span className="team" aria-hidden="true">
          <Pixel sprite="egg" size={14} className={`egg${pending ? " lit" : ""}`} />
          <LcdText text={pad2(pending)} px={2} label={null} />
          <span className="gear" />
          <LcdText text={pad2(gear)} px={2} label={null} />
        </span>
        <b>收件 {pending} · 装备 {gear}</b>
      </button>
      {savepointDays > savepointWarnDays && (
        <div className="st" title="基于最近一次读取或项目扫描">
          <span className="lab">存档</span>
          <span />
          <b className="warn">未存档 {Math.floor(savepointDays)} 天</b>
        </div>
      )}
    </div>
  );
}
// 交接条与对话框：一段口令 → 选交给谁 → 复制，一个动作完成（用户 2026-10-24）。
// 复制前照旧重读项目状态与工作台核对；不一致不复制，页面换成最新内容后再点一次。
function ProjectLaunch({ item, state, collection, agent, onAgent, openApp, onOpenApp, adoptState, notify, refreshProjectStatus, statusReading, readFailed, sourceKey, speaker, children }) {
  const reduced = useReducedMotion();
  const [open, setOpen] = useState(false),
    [error, setError] = useState(""),
    [receipt, setReceipt] = useState(""),
    [done, setDone] = useState(false),
    [opening, setOpening] = useState(false),
    [checking, setChecking] = useState(false);
  const lock = useRef(false),
    live = useRef(true),
    pre = useRef(null),
    doneTimer = useRef(null),
    // 收件是否已交代按选中这盘卡带时的留痕算：本次复制写下的留痕不会把收件从这次口令里拿掉。
    relayLog = useRef(state.collabLog),
    copier = usePromptCopy({ adoptState, notify }),
    deskOf = (s) => relayDesk({ ...s, collabLog: relayLog.current }, item.projectId, { collectionNotes: collection.notes }),
    desk = deskOf(state),
    // 口令里随项目桌变化的部分：收件装备段与手填下一步。
    deskKeyOf = (d) => JSON.stringify([relayDeskSection(d), d.next?.text || ""]),
    deskKey = deskKeyOf(desk),
    prepared = projectRelayPrompt(item, agent, desk),
    name = castOf(agent)?.name;
  const blocked = readFailed
    ? "项目状态暂时读不到，下面是上次内容；重新读到后才能交出。"
    : desk.inbox.some((i) => i.ref.kind === "collection") && collection.state !== "ok"
      ? collection.state === "error"
        ? "收藏没有读到，收件里的收藏带不进口令；请刷新页面后再交出。"
        : "收藏还在读取，读完才能复制。"
      : "";
  useEffect(() => {
    live.current = true;
    return () => { live.current = false; clearTimeout(doneTimer.current); };
  }, []);
  useLayoutEffect(() => {
    if (open && !reduced) frames(pre.current, [0, 1, 2, 3].map((k) => ({ clipPath: `inset(0 0 ${100 - k * 33}% 0)` })), 160);
  }, [open]);
  const busy = copier.busy || opening || checking || statusReading;
  async function copy() {
    if (lock.current || busy || blocked || copier.pending) return;
    const shown = item, shownKey = deskKey, shownDesk = desk, text = prepared.prompt, at = sourceKey, take = openApp, target = agent;
    lock.current = true;
    setChecking(true);
    setError("");
    setReceipt("");
    try {
      const fresh = await refreshProjectStatus();
      if (!live.current) return;
      const latest = fresh?.items.find((p) => p.projectId === shown.projectId);
      if (!latest || !continuableCurrent(latest)) { setError("当前状态读取未确认，口令没有复制；请重新检查后再交出。"); return; }
      if (fresh.sourceKey !== at || projectLaunchSignature(shown) !== projectLaunchSignature(latest)) {
        setError("项目内容或目录已变化，口令没有复制；已换成最新内容，看过后再点一次交出。");
        return;
      }
      // 复制前重读工作台，核对收件与装备仍是屏上的样子。
      let workspace;
      try { workspace = await request("/workspace"); }
      catch (e) { if (live.current) setError(`收件与装备核对未完成：${e.message}。口令没有复制。`); return; }
      if (!live.current) return;
      if (deskKeyOf(deskOf(workspace)) !== shownKey) {
        adoptState(workspace);
        setError("收件、装备或下一步已变化，口令没有复制；已换成最新内容，看过后再点一次交出。");
        return;
      }
      const ok = await copier.copy({
        text,
        kind: "start",
        projectId: shown.projectId,
        agent: canonicalAgent(target),
        stateId: shown.current?.fields?.stateId,
        inbox: shownDesk.inbox.filter((i) => !i.missing).map((i) => i.ref),
        loadout: shownDesk.loadout.filter((i) => !i.missing).map((i) => i.ref),
      });
      if (!ok || !live.current) return;
      const targetName = castOf(target)?.name;
      setReceipt(`TRANSFER OK · 口令已复制，交给 ${targetName}`);
      setDone(true);
      clearTimeout(doneTimer.current);
      doneTimer.current = setTimeout(() => { if (live.current) setDone(false); }, 1600);
      if (take) {
        setOpening(true);
        try {
          const r = await request("/relay-sessions/open", { agentId: canonicalAgent(target) });
          if (live.current) {
            setReceipt(r.opened ? `TRANSFER OK · 口令已复制，已打开 ${targetName}，粘贴发送就完成` : `TRANSFER OK · 口令已复制；${r.reason}`);
            notify(r.opened ? "已打开应用，请粘贴发送" : r.reason);
          }
        } catch (e) {
          if (live.current) setError("口令已复制；打开应用未确认：" + e.message);
        }
      }
    } finally {
      lock.current = false;
      if (live.current) { setOpening(false); setChecking(false); }
    }
  }
  function pick(id) {
    onAgent(id);
    setReceipt("");
    setError("");
    copier.reset();
  }
  return (
    <div className="pj-dialog-col">
      <div className="pj-box">
        <div className="bh">
          {speaker}
          <span className="grow" />
          <button
            type="button"
            className="pj-pv"
            aria-expanded={open}
            aria-controls={`pj-prompt-${item.projectId}`}
            onClick={() => setOpen(!open)}
          >
            <span>口令全文</span>
            <LcdText text={String(prepared.prompt.length)} px={2} label={null} />
            <small>字</small>
            <i aria-hidden="true">▾</i>
          </button>
        </div>
        {children}
        {open && (
          <pre ref={pre} className="prompt" id={`pj-prompt-${item.projectId}`} aria-label="口令全文" tabIndex={0}>
            {prepared.prompt}
          </pre>
        )}
        {prepared.redactions > 0 && <p className="relay-redactions">已隐去 {prepared.redactions} 段疑似凭据</p>}
        {(error || copier.error || blocked) && (
          <p className="inline-error" role="alert">{error || copier.error || blocked}</p>
        )}
        {copier.pending && (
          <Button secondary disabled={busy} onClick={copier.retry}>补记留痕</Button>
        )}
        {receipt && <p role="status" className="relay-receipt pj-receipt">{receipt}</p>}
      </div>
      <div className="pj-handoff">
        <span className="lab">交给谁</span>
        <div className="pj-picker" role="radiogroup" aria-label="交给谁">
          {AGENT_CAST.map((a, k) => (
            <button
              type="button"
              className={`pj-pk${agent === a.id ? " on" : ""}`}
              key={a.id}
              style={{ "--hue": a.hue }}
              role="radio"
              aria-checked={agent === a.id}
              aria-label={a.name}
              tabIndex={agent === a.id ? 0 : -1}
              disabled={busy || !!copier.pending}
              onClick={(e) => {
                pick(a.id);
                if (!reduced) frames(e.currentTarget.firstElementChild, [{ transform: "translateY(-6px)" }, { transform: "translateY(-2px)" }, { transform: "translateY(0)" }], 160);
              }}
              onKeyDown={(e) => {
                if (!["ArrowRight", "ArrowLeft", "ArrowDown", "ArrowUp"].includes(e.key)) return;
                e.preventDefault();
                const n = (k + (["ArrowRight", "ArrowDown"].includes(e.key) ? 1 : AGENT_CAST.length - 1)) % AGENT_CAST.length;
                pick(AGENT_CAST[n].id);
                e.currentTarget.parentElement.children[n].focus();
              }}
            >
              <span><AgentSprite agent={a.id} mode="head" /></span>
            </button>
          ))}
        </div>
        <span className="pk-name">{characterOf(agent)?.name}</span>
        <span className="grow" />
        <label className="pj-openapp">
          <input type="checkbox" checked={openApp} disabled={busy} onChange={(e) => onOpenApp(e.target.checked)} />
          复制后打开 {name}
        </label>
        <Button className={`pj-give${done ? " done" : ""}`} disabled={busy || !!blocked || !!copier.pending} onClick={copy}>
          复制口令，交给 <b>{name}</b>
        </Button>
      </div>
    </div>
  );
}
// 读档屏：选中的卡带在这里启动——立绘 + 对话框里的下一步 + 交接条，底部 30 天双轨与读数列。
function ReadScreen(props) {
  const { item, index, serial, readFailed, statusReading, desk, state, adoptState, notify, onDetails, onTeam, onRecheck } = props;
  const reduced = useReducedMotion(),
    body = useRef(null),
    line = useRef(null),
    readable = readableCurrent(item),
    outline = item.current?.state === "outline" ? item.current.outline : null,
    continuable = continuableCurrent(item),
    loading = item.current?.state === "loading" && !readFailed,
    f = item.current?.fields,
    holder = readable ? castOf(f?.writer) : null,
    stalled = readable && item.activity?.state === "stalled",
    next = readable ? (f?.next ? linkText(f.next) : "缺少此项") : "",
    typed = useTyped(typeof next === "string" ? next : "", serial, reduced);
  // 读档：扫描线从上往下，按帧切 6 格。
  useLayoutEffect(() => {
    if (reduced) return;
    frames(body.current, [0, 1, 2, 3, 4, 5, 6].map((k) => ({ clipPath: `inset(0 0 ${Math.round(100 - (k * 100) / 6)}% 0)` })), 330);
    frames(line.current, [0, 1, 2, 3, 4, 5, 6].map((k) => ({ top: `${Math.round((k * 100) / 6)}%`, opacity: k === 6 ? 0 : 1 })), 330);
  }, [serial]);
  useEffect(() => {
    document.querySelectorAll("[data-pj-lscroll]").forEach((x) => { x.scrollLeft = x.scrollWidth; });
  }, [serial]);
  const holderLabel = holder
    ? characterOf(holder.id)?.name
    : readable && f?.writer === "无"
      ? "无人持笔"
      : f?.writer || (readable ? "缺少此项" : "持笔者未知");
  return (
    <div id="pj-screen" role="tabpanel" aria-labelledby={`pj-cart-${item.projectId}`}>
    <article className={`pj-screen${stalled ? " stalled" : ""}`} aria-label={`项目状态卡：${item.name}`} data-project-id={item.projectId}>
      <i className="pj-scanline" ref={line} aria-hidden="true" />
      <header className="sc-head">
        <span className="en">LOAD · SLOT {pad2(index + 1)}</span>
        <h3>{item.name}</h3>
        <PathLabel value={item.root || "本地位置未知"} />
        {stalled && (
          <span className="pj-zzz" aria-label={`停滞 ${item.activity.idleDays} 天`}><i>z</i><i>z</i><i>Z</i></span>
        )}
        <span className="grow" />
        <button type="button" className="text-btn pj-detail-btn" onClick={onDetails}>详情</button>
      </header>
      <div className={`sc-body${continuable ? "" : " s-unread"}`} ref={body}>
        <div className="pj-actor-col">
          <div className="pj-portrait" style={holder ? { "--hue": holder.hue } : undefined} data-agent={holder?.id || "none"}>
            {holder ? <AgentSprite agent={holder.id} mode="body" fit={156} className="sprite" /> : <span className="ghost"><b>?</b></span>}
          </div>
          <div className="pj-plate">
            <b className={`hn${holder ? "" : " dim"}`}>{holderLabel}</b>
            <small className="en">{holder ? holder.name.toUpperCase() : "UNKNOWN"}</small>
          </div>
        </div>
        {continuable ? (
          <ProjectLaunch
            key={item.projectId + serial}
            {...props}
            speaker={
              <span className="speaker">
                {readable ? `${holder ? characterOf(holder.id)?.name + " · " : ""}NEXT · 下一步` : "RECENT · 最近进展"}
              </span>
            }
          >
            {readable ? (
              <p className={`nx${!reduced && typed.length < (typeof next === "string" ? next.length : 0) ? " typing" : ""}`}>
                {typeof next === "string" ? typed : next}
              </p>
            ) : (
              <div className="pj-outline">
                <p className="nx">{outline.title}</p>
                {outline.summary && <small>{outline.summary}</small>}
                <ManualNext projectId={item.projectId} projectName={item.name} next={desk.next} adoptState={adoptState} notify={notify} />
              </div>
            )}
          </ProjectLaunch>
        ) : (
          <div className="pj-dialog-col">
            <div className="pj-box">
              {loading ? (
                <Reading label="正在读取 CURRENT" />
              ) : (
                <>
                  <span className="speaker bad">CURRENT · 读不到</span>
                  <p className="nx alertline">
                    <AlertCircle size={18} aria-hidden="true" />
                    <b>读不到 CURRENT</b>
                    <small>{readFailed ? "当前状态待核实" : unavailable(item)}</small>
                    阶段、下一步、活动都未知，不代表没有活动。
                  </p>
                </>
              )}
            </div>
            <div className="pj-handoff">
              <span className="lab">交给谁</span>
              <span className="muted">读不到 CURRENT，修好后才能交出口令</span>
              <span className="grow" />
              <button type="button" className="text-btn" onClick={onDetails}>看体检</button>
              <Button
                secondary
                disabled={statusReading}
                onClick={(e) => {
                  // 重新检查：30 天格子按三格一组扫一遍（纯装饰，不等动画）。
                  if (!reduced)
                    e.currentTarget.closest(".pj-screen")?.querySelectorAll(".c30 i").forEach((cell, k) => {
                      try { cell.animate([{ background: "var(--cyan)", ...STEP }, { background: "var(--cyan)" }], { duration: 120, delay: Math.floor(k % 30 / 3) * 24 }); } catch {}
                    });
                  onRecheck();
                }}
              >
                重新检查
              </Button>
            </div>
            {desk.inbox.length > 0 && (
              <div className="pj-waiting">
                <SlotDesk rows={desk} projectId={item.projectId} projectName={item.name} adoptState={adoptState} notify={notify} onLoadout={props.onLoadout} />
              </div>
            )}
          </div>
        )}
      </div>
      <div className="sc-foot">
        <ActivityLanes item={item} readable={readable && !readFailed} />
        <ReadStats
          item={item}
          readable={readable && !readFailed}
          outline={outline}
          readFailed={readFailed}
          desk={desk}
          savepointDays={props.savepointDays}
          savepointWarnDays={props.savepointWarnDays}
          onDetails={onDetails}
          onTeam={onTeam}
        />
      </div>
    </article>
    </div>
  );
}
export function ProjectsV16({
  state,
  navigate,
  savepointReads = {},
  adoptState,
  notify,
  ruleInstalls,
  refreshRuleInstalls,
  projectStatus = { items: [], error: "", loaded: true },
  refreshProjectStatus = () => {},
  projectJump,
}) {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [filter, setFilter] = useState("all"),
    [query, setQuery] = useState(""),
    [selectedId, setSelectedId] = useState(null),
    [settings, setSettings] = useState(false),
    [help, setHelp] = useState(false),
    [currentId, setCurrentId] = useState(null),
    [serial, setSerial] = useState(0),
    [picked, setPicked] = useState({}),
    [openApp, setOpenApp] = useState(true),
    [teamFor, setTeamFor] = useState(null),
    [fold, setFold] = useState(null),
    [daily, setDaily] = useState({ items: [], error: "" }),
    [flight, setFlight] = useState(null),
    [collection, setCollection] = useState({ notes: [], state: "loading" }),
    [loadoutFor, setLoadoutFor] = useState(null);
  // 收件里的收藏标题与正文来自收藏库；没读到时不把收藏当成已删除，也不让口令漏带。
  useEffect(() => {
    let active = true;
    request("/collection/notes")
      .then((result) => { if (active) setCollection({ notes: Array.isArray(result?.notes) ? result.notes : [], state: Array.isArray(result?.notes) ? "ok" : "error" }); })
      .catch(() => { if (active) setCollection({ notes: [], state: "error" }); });
    return () => { active = false; };
  }, []);
  const settingsBusy = useRef(false);
  const dailyGeneration = useRef(0);
  const started = useRef(false),
    scanLock = useRef(false),
    lib = useRef(null),
    flightTimer = useRef(null),
    flightOrigin = useRef(null),
    reduced = useReducedMotion();
  const c = state.connections || {},
    catalog = new Map((c.projectCatalog || []).map((item) => [item.projectId, item])),
    curated = catalog.size > 0,
    all = (c.projects || []).map((project) => ({
      ...project,
      originalName: project.name,
      name: catalog.get(project.id)?.displayName || project.name,
    })),
    active = all.filter((p) => p.active),
    ids = active.map((p) => p.id).join(","),
    [github, loadGithub] = useGithubPanel(ids),
    selected = all.find((p) => p.id === selectedId);
  useEffect(() => {
    if (projectJump?.id && all.some(p => p.id === projectJump.id)) setSelectedId(projectJump.id);
  }, [projectJump?.key, projectJump?.id]);
  async function run(data = {}) {
    if (scanLock.current) return null;
    scanLock.current = true;
    setBusy(true);
    setError("");
    try {
      const next = await scan("projects", data);
      adoptState(next);
      return next;
    } catch (e) {
      setError(e.message);
      notify(e.message, "error");
      return null;
    } finally {
      scanLock.current = false;
      setBusy(false);
    }
  }
  useEffect(() => {
    if (!started.current && !c.projectScannedAt) {
      started.current = true;
      run();
    }
  }, []);
  const loadDaily = useCallback(async () => {
    const generation = ++dailyGeneration.current;
    if (!ids) { setDaily({ items: [], error: "" }); return; }
    try {
      const result = await request("/project-status/activity", {});
      if (generation === dailyGeneration.current) setDaily({ ...result, error: "" });
    } catch (e) {
      if (generation === dailyGeneration.current) setDaily(previous => ({ ...previous, error: e.message }));
    }
  }, [ids]);
  useEffect(() => {
    loadDaily();
    return () => { dailyGeneration.current++; };
  }, [loadDaily, state.revision, projectStatus.at]);
  useEffect(() => {
    if (reduced) {
      clearTimeout(flightTimer.current);
      setFlight(null);
    }
    return () => clearTimeout(flightTimer.current);
  }, [reduced]);
  const items = sortSaveItems(
    active.map((p) => {
      const item = projectStatus.items.find((i) => i.projectId === p.id) || {
        projectId: p.id,
        name: p.name,
        root: p.localPaths[0],
        current: projectStatus.error
          ? { state: "error", message: "当前状态待核实" }
          : { state: "loading" },
        activity: { state: "unknown" },
        safety: { issues: [], checks: {} },
        stage: { id: "unknown" },
      };
      return {
        ...item,
        name: p.name,
        savepointDays: savepointAge(p, savepointReads[p.id]),
        daily: daily.items.find((d) => d.projectId === p.id),
      };
    }),
  );
  const slots = new Map(items.map((p, i) => [p.projectId, i + 1])),
    shownIndex = Math.max(0, items.findIndex((i) => i.projectId === currentId)),
    shown = items[shownIndex],
    readFailed = !!projectStatus.error,
    deskOf = (projectId) => deskRows(state, projectId, collection.state === "ok" ? collection.notes : null),
    inboxWaiting = items.reduce((t, i) => t + deskOf(i.projectId).inbox.filter((n) => !n.relayed && !n.missing).length, 0);
  // 默认选中第一盘并记住它：后台重读改变排序时，读档屏不跟着跳到别的项目。
  useEffect(() => {
    if (projectStatus.loaded && shown && shown.projectId !== currentId) setCurrentId(shown.projectId);
  }, [projectStatus.loaded, shown?.projectId, currentId]);
  // 手机上卡带横滑：排序变化或换盘后，让选中的卡带回到可见处（不靠吸附跟随）。
  const slotsRef = useRef(null), order = items.map((i) => i.projectId).join(",");
  useLayoutEffect(() => {
    const strip = slotsRef.current, on = strip?.querySelector(".pj-cart.on");
    if (!strip || !on || strip.scrollWidth <= strip.clientWidth) return;
    const left = on.offsetLeft - strip.offsetLeft - parseFloat(getComputedStyle(strip).paddingLeft || "0");
    if (left < strip.scrollLeft || left + on.offsetWidth > strip.scrollLeft + strip.clientWidth) strip.scrollLeft = Math.max(0, left);
    else if (shownIndex === 0) strip.scrollLeft = 0;
  }, [order, shown?.projectId]);
  // 选卡带 = 读档：换到哪盘就重读一次状态，读档屏重新启动。
  function select(id) {
    if (id === shown?.projectId) return;
    setCurrentId(id);
    setSerial((n) => n + 1);
    refreshProjectStatus();
  }
  function cartKey(e, k) {
    if (!["ArrowRight", "ArrowLeft"].includes(e.key) || !items.length) return;
    e.preventDefault();
    const n = (k + (e.key === "ArrowRight" ? 1 : items.length - 1)) % items.length;
    select(items[n].projectId);
    e.currentTarget.parentElement.children[n]?.focus();
  }
  const library = curated
    ? all.filter((p) => catalog.get(p.id)?.view === "main")
    : all;
  const counts = {
    all: library.length,
    local: library.filter((p) => projectSource(p) === "local").length,
    github: library.filter((p) => projectSource(p) === "github").length,
  };
  const matches = (p) =>
    (filter === "all" || projectSource(p) === filter) &&
    [p.name, p.originalName, p.repoKey, ...p.localPaths]
      .join(" ").toLowerCase().includes(query.toLowerCase());
  const projects = library.filter(matches);
  const assets = curated
    ? all.filter((p) => catalog.get(p.id)?.view === "asset").filter(matches)
    : [];
  const tasks = curated
    ? all.filter((p) => catalog.get(p.id)?.view === "task").filter(matches)
    : [];
  const candidates = curated
    ? all.filter((p) => !catalog.has(p.id) || catalog.get(p.id)?.view === "candidate").filter(matches)
    : [];
  const hidden = curated
    ? all.filter((p) => catalog.get(p.id)?.view === "hidden").filter(matches)
    : [];
  const folds = [
    ["知识与工具资产", assets, "可持续使用的知识库、Skill 与工具，不占项目主卡"],
    ["任务与阶段成果", tasks, "有边界的工作和交付，保留入口与未完成状态"],
    ["待归类与待判定", candidates, "扫描发现或尚未确认用途"],
    ["隐藏来源", hidden, "文件容器与历史副本，可在详情重新分类"],
  ].filter(([, list]) => curated && list.length > 0);
  const displayOnly = (project) => project.manual && !project.localPaths.some((path) =>
    (c.roots || []).some((root) => path === root || path.startsWith(`${root}/`)));
  const mainProject = (project) => !curated || catalog.get(project.id)?.view === "main";
  function editSettings() { setSettings(true); }
  function closeSettings() { if(!settingsBusy.current)setSettings(false); }
  function prepareFlight(event) {
    if (reduced) return;
    const row = event.currentTarget.closest(".pj-cs"),
      dest =
        document.querySelector(".pj-vacant") ||
        document.querySelector(".pj-slots");
    flightOrigin.current = {
      from: row.getBoundingClientRect(),
      to: dest.getBoundingClientRect(),
    };
  }
  function fly(project) {
    if (reduced || !flightOrigin.current) return;
    setFlight({ ...flightOrigin.current, name: project.name });
    clearTimeout(flightTimer.current);
    flightTimer.current = setTimeout(() => setFlight(null), 650);
  }
  return (
    <div className="projects-v16 project-space">
      <ReadReveal pending={busy} ready={!error}/>
      <header className="pj-bar">
        <h1>项目空间<span className="en">PROJECTS</span></h1>
        <button className="page-help" aria-label="项目空间怎么用" onClick={() => setHelp(true)}>?</button>
        <div className="pj-counts">
          <span className="cnt"><LcdText text={pad2(active.length)} px={3} label={`在推进 ${active.length}`} /><small>在推进</small></span>
          <span className="cnt"><LcdText text={pad2(library.length)} px={3} label={`项目 ${library.length}`} /><small>项目</small></span>
          <span className="cnt"><LcdText text={pad2(inboxWaiting)} px={3} label={`收件待交代 ${inboxWaiting}`} /><small>收件待交代</small></span>
        </div>
        <span className="grow" />
        {projectStatus.checkedAt && <span className="pj-readat">上次读取 {hhmm(projectStatus.checkedAt)}</span>}
        <button
          type="button"
          className="icon-btn"
          aria-label="刷新"
          title={projectStatus.checkedAt ? `刷新：重新读取在推进的存档与 GitHub（上次读取：${new Date(projectStatus.checkedAt).toLocaleString()}）` : "刷新：重新读取在推进的存档与 GitHub"}
          disabled={!projectStatus.loaded || !github.loaded}
          onClick={() => {
            refreshProjectStatus();
            loadGithub(true);
          }}
        >
          {!projectStatus.loaded ? <Reading mini label="读取状态" /> : <RefreshCw size={18} />}
        </button>
        <button type="button" className="icon-btn" aria-label="项目空间设置" onClick={editSettings}>
          <Settings2 size={18} />
        </button>
      </header>
      <section className={`pj-saves-sec${active.length ? "" : " pj-no-active"}`} aria-label="在推进项目">
        {active.length > 7 && (
          <p className="scan-notice warning">
            已有 {active.length} 个在推进项目，建议收窄；通常同时推进1–3个。
          </p>
        )}
        <div className="pj-slots" ref={slotsRef} data-read-stale={!!projectStatus.error}>
          {items.length > 0 && (
            <div className="pj-tabs" role="tablist" aria-label="存档槽">
              {items.map((item, i) => (
                <SlotCart
                  key={item.projectId}
                  item={item}
                  index={i}
                  on={item.projectId === shown?.projectId}
                  readFailed={readFailed}
                  reading={!projectStatus.loaded}
                  onSelect={() => select(item.projectId)}
                  onKeyDown={(e) => cartKey(e, i)}
                />
              ))}
            </div>
          )}
          {items.length < 3 && (
            <button
              type="button"
              className="pj-cart pj-vacant"
              aria-label={`空存档 ${items.length + 1}，前往项目列表`}
              onClick={() => {
                lib.current.scrollIntoView({ behavior: reduced ? "auto" : "smooth", block: "start" });
                lib.current.focus();
              }}
            >
              <span className="plus" aria-hidden="true">+</span>
              <span className="nm">
                <span className="en">SLOT {pad2(items.length + 1)} · 空槽</span>
                <small>{library.length ? "从库里挑一盘开新档" : "先登记项目"}</small>
              </span>
            </button>
          )}
        </div>
        <SourceReadError title="项目状态与体检" error={projectStatus.error}
          retained={items.some(item => projectStatus.items.some(snapshot => snapshot.projectId === item.projectId))} onRetry={refreshProjectStatus} />
        {daily.error && (
          <SourceReadError title="本机活动" error={daily.error}
            retained={items.some(item => readableCurrent(item) && (item.daily?.days?.length > 0 ||
              item.daily?.state !== "ok" && Boolean(item.daily?.note || item.daily?.reason))) ||
              Boolean(help && daily.items.some(item => item.note))} onRetry={loadDaily} />
        )}
        {github.error && (
          <SourceReadError title="GitHub 面板" error={github.error} onRetry={() => loadGithub(true)} />
        )}
        {shown && (
          <ReadScreen
            item={shown}
            index={shownIndex}
            serial={serial}
            readFailed={readFailed}
            statusReading={!projectStatus.loaded}
            desk={deskOf(shown.projectId)}
            state={state}
            collection={collection}
            agent={picked[shown.projectId] || castOf(shown.current?.fields?.writer)?.id || "codex"}
            onAgent={(id) => setPicked((m) => ({ ...m, [shown.projectId]: id }))}
            openApp={openApp}
            onOpenApp={setOpenApp}
            refreshProjectStatus={refreshProjectStatus}
            sourceKey={projectStatus.sourceKey}
            savepointDays={shown.savepointDays}
            savepointWarnDays={savepointThresholds(c).warn}
            adoptState={adoptState}
            notify={notify}
            onDetails={() => setSelectedId(shown.projectId)}
            onTeam={() => setTeamFor({ id: shown.projectId, name: shown.name })}
            onLoadout={() => setLoadoutFor({ id: shown.projectId, name: shown.name })}
            onRecheck={() => { refreshProjectStatus(); loadDaily(); }}
          />
        )}
      </section>
      <section
        className="pj-library"
        ref={lib}
        tabIndex={-1}
        aria-label="全部项目"
      >
        <div className="v14-sh pj-lib-head">
          <span className="en">LIBRARY</span>
          <h2>全部项目</h2>
          <LcdText text={pad2(library.length)} px={2} label={`${library.length} 个项目`} />
          <span className="grow" />
          <span className={`pj-scan${c.truncated ? " warn" : ""}`} title={c.truncated ? projectScanNotice(c) : undefined}>
            <i className="led" aria-hidden="true" />
            <span>{c.truncated ? "结果不完整 · " : ""}{c.projectScannedAt ? `${date(c.projectScannedAt)} 扫描` : "还没扫描"}</span>
            {c.truncated && <span className="sr-only">{projectScanNotice(c)}</span>}
            <button type="button" className="pj-rescan" aria-label="重新扫描" disabled={busy} onClick={() => run()}>
              {busy ? <Reading mini label="扫描项目" /> : "重新扫描"}
            </button>
          </span>
        </div>
        {error && (
          <p className="inline-error" role="alert">
            {error}
          </p>
        )}
        {c.github?.message && (
          <p className="scan-notice" role="status">
            {c.github.message}
          </p>
        )}
        {!!c.errors?.length && (
          <details className="scan-notice">
            <summary>{c.errors.length} 条扫描提示</summary>
            {c.errors.map((e, i) => (
              <p key={i}>{e}</p>
            ))}
          </details>
        )}
        {(library.length > 0 || assets.length > 0 || tasks.length > 0 || candidates.length > 0) && (
          <div className="pj-lib-tools">
            <div className="pj-filter" role="radiogroup" aria-label="项目来源筛选">
              {[
                ["all", "全部"],
                ["local", "LOCAL"],
                ["github", "GIT"],
              ].map(([id, label]) => (
                <button
                  type="button"
                  role="radio"
                  aria-checked={filter === id}
                  aria-label={`${label} ${counts[id]}`}
                  className={filter === id ? "on" : ""}
                  key={id}
                  onClick={() => setFilter(id)}
                >
                  {label}
                  <LcdText text={pad2(counts[id])} px={2} label={null} />
                </button>
              ))}
            </div>
            <label className="pj-search">
              <Search size={16} />
              <input
                aria-label="搜索项目"
                placeholder="搜索名称、路径"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
            </label>
          </div>
        )}
        {busy && (
          <div className="pj-skel" role="status" aria-label="正在查找项目">
            <Reading label="正在读取目录标记与 GitHub 仓库"/>
          </div>
        )}
        {!busy && (
          <div className="pj-racks">
            {(curated ? groupPortfolioSections(projects, c.projectCatalog) : groupProjectRacks(projects, c.roots || [])).map((g, i) => (
              <div className="pj-rack" key={g.key}>
                <h4>
                  <span className="en">{curated ? "ZONE" : "RACK"} {pad2(i + 1)}</span>
                  <b title={g.label}>{g.label}</b>
                  <LcdText text={pad2(g.items.length)} px={2} label={`${g.items.length} 个`} />
                </h4>
                <ul>
                  {g.items.map((p) => (
                    <li
                      className={`pj-cs${projectSource(p) === "github" ? " git" : ""}${p.active ? " in-save" : ""}`}
                      key={p.id}
                    >
                      <button
                        className="pj-cs-tab project-discovery-row"
                        onClick={() => setSelectedId(p.id)}
                        aria-label={`项目：${p.name}`}
                        title={[p.manual && "手工登记", p.localPaths[0] || p.repoKey].filter(Boolean).join(" · ")}
                      >
                        <span className="pj-cs-code en">{projectSource(p) === "github" ? "GIT" : "LOCAL"}</span>
                        <span className="pj-cs-name">
                          <b>
                            {p.name}
                            {p.identityConflict && <span className="pj-flag">身份待确认</span>}
                            {!p.manual && !p.seenThisScan && <span className="pj-flag">本次未检出</span>}
                          </b>
                          <PathLabel value={shortPath(p.localPaths[0] || p.repoKey)} />
                        </span>
                        <span className="pj-row-at en" title={p.recentUpdate?.reason}>{recent(p)}</span>
                      </button>
                      <span className="pj-cs-tail">
                        {p.active ? (
                          <span className="pj-cs-save"><i className="led" aria-hidden="true" />SLOT {pad2(slots.get(p.id))}</span>
                        ) : displayOnly(p) ? (
                          <span className="pj-cs-only" title="手工登记、仅展示的项目不开档">仅展示</span>
                        ) : (
                          <ActiveToggle
                            project={p}
                            state={state}
                            adoptState={adoptState}
                            notify={notify}
                            launch
                            onPrepare={prepareFlight}
                            onMarked={() => fly(p)}
                          />
                        )}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        )}
        {!busy && !projects.length && !assets.length && !tasks.length && !candidates.length && !hidden.length && (
          <div className="pj-none">
            <Pixel sprite="koromon" size={72} />
            <p>{query ? "没有匹配的项目" : "没找到项目"}</p>
            <Button secondary onClick={() => run()}>
              <RefreshCw size={16} />
              重新扫描
            </Button>
          </div>
        )}
        {folds.length > 0 && (
          <div className="pj-folds">
            {folds.map(([name, list, desc], i) => (
              <button
                type="button"
                key={name}
                className="pj-fold"
                aria-label={`${name} · ${list.length}`}
                aria-expanded={fold === i}
                aria-controls="pj-fold-panel"
                title={desc}
                onClick={() => setFold(fold === i ? null : i)}
              >
                <LcdText text={pad2(list.length)} px={2} label={null} />
                <span><b>{name}</b><small>{desc}</small></span>
                <i aria-hidden="true">▾</i>
              </button>
            ))}
          </div>
        )}
        {folds[fold] && (
          <div className="pj-fold-panel" id="pj-fold-panel" role="region" aria-label={folds[fold][0]}>
            <ul>{folds[fold][1].map((project) => <li key={project.id}>
              <button type="button" onClick={() => setSelectedId(project.id)}>
                <strong>{project.name}</strong>
                <PathLabel value={project.localPaths[0] || project.repoKey} />
              </button>
            </li>)}</ul>
          </div>
        )}
      </section>
      {!!state.projects?.length && (
        <details className="legacy-records">
          <summary>旧登记记录 · {state.projects.length}</summary>
          {state.projects.map((p) => (
            <div key={p.id}>
              <strong>{p.name}</strong>
              <p>{p.location || p.path || p.note || "未验证"}</p>
            </div>
          ))}
        </details>
      )}
      {selected && (
        <Dialog
          title={selected.name}
          drawer
          onClose={() => setSelectedId(null)}
        >
          <div className="asset-form pj-detail">
            <header>
              <h2>{selected.name}</h2>
              {selected.originalName !== selected.name && <p className="detail-footnote">来源名称 · {selected.originalName}</p>}
              {catalog.get(selected.id)?.note && <p className="detail-footnote">{catalog.get(selected.id).note}</p>}
              <Badge tone="muted">
                {selected.localPaths.length ? "LOCAL" : "GITHUB"}
              </Badge>
              <p>最近更新 · {recent(selected)}</p>
              {selected.recentUpdate?.reason && (
                <p role="status">{selected.recentUpdate.reason}</p>
              )}
              {selected.description && (
                <p className="body-copy">{selected.description}</p>
              )}
            </header>
            <ProjectCatalogEditor key={selected.id} project={selected} state={state} adoptState={adoptState} notify={notify} />
            {curated && (c.projectCatalog || []).some((item) => item.parentId === selected.id) && <section aria-label="附属目录与阶段材料">
              <h3>附属目录与阶段材料</h3>
              {(c.projectCatalog || []).filter((item) => item.parentId === selected.id).map((item) => {
                const child = all.find((p) => p.id === item.projectId);
                return child ? <button className="text-btn" key={child.id} onClick={() => setSelectedId(child.id)}>{child.name}</button> : null;
              })}
            </section>}
            <section aria-label="状态">
              <h3>状态</h3>
              {displayOnly(selected)
                ? <p className="detail-footnote">这个手工项目位于当前扫描范围外，仅作目录入口展示；在推进、状态体检、上下文连接和规则操作暂不可用。</p>
                : !selected.active && !mainProject(selected)
                  ? <p className="detail-footnote">此入口属于任务、资产或待核来源。确认有独立目标与项目级状态后，先改为「独立项目」，再标记在推进。</p>
                  : <ActiveToggle
                    project={selected}
                    state={state}
                    adoptState={adoptState}
                    notify={notify}
                  />}
              {selected.branch && <p>分支 · {selected.branch}</p>}
              {(() => {
                const item = items.find((i) => i.projectId === selected.id);
                return item ? (
                  <>
                    {projectStatus.error && <p className="detail-footnote" role="status">上次读取结果，当前状态与体检待核实；关闭详情后可在项目状态提示处重试。</p>}
                    <div className={projectStatus.error ? "read-failed" : ""}><CurrentBlock current={item.current} /></div>
                    <p>
                      最近活动：
                      {date(
                        readableCurrent(item) ? item.activity?.latestAt : null,
                      )}{" "}
                      ·{" "}
                      {readableCurrent(item) &&
                      item.activity?.state === "stalled"
                        ? `停滞 ${item.activity.idleDays} 天`
                        : readableCurrent(item) &&
                            item.activity?.state === "active"
                          ? `${c.projectStallDays || 7} 天内有更新`
                          : "未知，不当作停滞"}
                    </p>
                    <p>
                      当前阶段：{item.stage?.label || "未知"} ·{" "}
                      {item.stage?.basis || "当前记录不足以推断"}
                    </p>
                    {!projectStatus.error && item.safety?.checks?.git ? (
                      <SafetyBlock safety={item.safety} />
                    ) : (
                      <p>
                        {projectStatus.error
                          ? "体检未知，请在项目状态提示处重试"
                          : !projectStatus.loaded ? <Reading mini label="体检读取中"/> : "体检待核实"}
                      </p>
                    )}
                    <GithubBlock
                      github={
                        github.items.find((g) => g.projectId === selected.id)
                          ?.github
                      }
                      loading={!github.loaded}
                    />
                  </>
                ) : (
                  !displayOnly(selected) && <p>标为在推进后读取状态、体检与 GitHub。</p>
                );
              })()}
              {selected.githubUrl && (
                <a
                  className="button secondary external-button"
                  href={selected.githubUrl}
                  target="_blank"
                  rel="noreferrer"
                >
                  <Github size={16} />
                  打开 GitHub
                  <ArrowUpRight size={15} />
                </a>
              )}
              <p className="detail-footnote">
                本地检测 {date(selected.localSeenAt)} · GitHub 检测{" "}
                {date(selected.githubSeenAt)}
              </p>
            </section>
            {!displayOnly(selected) && <section aria-label="位置">
              <h3>位置</h3>
              <ProjectLocations
                key={selected.id}
                project={selected}
                identityIssueRoot={projectStatus.error ? '' : projectStatus.items.find(item => item.projectId === selected.id && item.current?.code === 'DIRECTORY_IDENTITY_CHANGED')?.root || ''}
                state={state}
                adoptState={adoptState}
                notify={notify}
              />
            </section>}
            {!displayOnly(selected) && <section aria-label="连接">
              <h3>连接</h3>
              <ProjectContext
                key={selected.id}
                project={selected}
                state={state}
                adoptState={adoptState}
                notify={notify}
              />
            </section>}
            {!displayOnly(selected) && <section aria-label="规则">
              <h3>规则</h3>
              <ProjectRules
                project={selected}
                state={state}
                installs={ruleInstalls}
                refresh={refreshRuleInstalls}
              />
            </section>}
          </div>
        </Dialog>
      )}
      {teamFor && (
        <Dialog title={`队伍 · ${teamFor.name}`} onClose={() => setTeamFor(null)}>
          <SlotDesk
            rows={deskOf(teamFor.id)}
            projectId={teamFor.id}
            projectName={teamFor.name}
            adoptState={adoptState}
            notify={notify}
            onLoadout={() => { setTeamFor(null); setLoadoutFor(teamFor); }}
          />
        </Dialog>
      )}
      {loadoutFor && (
        <LoadoutDialog
          state={state}
          projectId={loadoutFor.id}
          projectName={loadoutFor.name}
          adoptState={adoptState}
          notify={notify}
          onClose={() => setLoadoutFor(null)}
        />
      )}
      {settings && <Dialog title="项目空间设置" drawer onClose={closeSettings}><ProjectSettings state={state} adoptState={adoptState} notify={notify} onBusyChange={v=>{settingsBusy.current=v;}}/></Dialog>}
      {help && (
        <Dialog title="项目空间 · 这页怎么用" onClose={() => setHelp(false)}>
          <div className="asset-form">
            <p>
              选卡带 → 选交给谁 → 复制口令，一个动作完成；勾上「复制后打开」会顺手打开已检测的应用，粘贴和发送由你完成。复制前会重读状态与工作台核对，有变化就不复制，换成最新内容后再点一次。
            </p>
            <p>
              本地 · {c.roots?.length || 0} 个目录；GitHub ·{" "}
              {c.github?.login || "未连接"}。扫描于 {date(c.projectScannedAt)}。
            </p>
            <p>
              扫描只读项目标记和 Git 时间；状态来自项目自己的 CURRENT、Git 与
              GitHub。未知或不完整不代表没有活动。根目录与停滞阈值在设置抽屉。
            </p>
            {[...new Set(daily.items.map((i) => i.note).filter(Boolean))].map(
              (note) => (
                <p key={note} className="detail-footnote">
                  {note}
                </p>
              ),
            )}
          </div>
        </Dialog>
      )}
      {flight && !reduced && (
        <div
          className="pj-flight"
          aria-hidden="true"
          style={{
            left: flight.from.x,
            top: flight.from.y,
            width: flight.from.width,
            height: flight.from.height,
            "--flight-x": `${flight.to.x - flight.from.x}px`,
            "--flight-y": `${flight.to.y - flight.from.y}px`,
          }}
        >
          {flight.name}
        </div>
      )}
    </div>
  );
}
