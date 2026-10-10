import React, { useEffect, useMemo, useRef, useState } from "react";
import { ArrowRight, ArrowUpRight, Check, RotateCw } from "lucide-react";
import { Dialog } from "./components.jsx";
import { request } from "./api.js";
import { addDays, dueText, eventsOfDay, startOfDay, todoIsDue, ymd } from "./calendar.js";
import { useCalendarData } from "./Calendar.jsx";
import { HomeBrief } from "./ProjectBrief.jsx";
import { mergeAgentHealth, pendingItems, inboxSummary, rulePendingReady, projectSavepointAge } from "./pending.js";
import { RUN_PHASES } from "./collab-protocol.js";
import { sortSaveItems, readableCurrent } from "./projects-v16.js";
import { savepointThresholds } from "./settings-v16.js";
import { CrestRing, DigiviceArt, partnerOf } from "./pixel.jsx";
import { PartnerScreen } from "./PartnerScreen.jsx";
import { AgentSprite, LcdText } from "./v14.jsx";
import { NOTE_MAX } from "./rich-note.js";
import { now, uid } from "./store.js";
import "./home-v16.css";

const ACTOR = {
  "claude-code": "机械暴龙兽",
  codex: "机械邪龙兽",
  hermes: "亚古兽",
  openclaw: "加布兽",
  user: "你",
};
const pad = n => String(n).padStart(2, "0");
const clockText = date => pad(date.getHours()) + ":" + pad(date.getMinutes());
const hourPart = date => date.getHours() < 11 ? "早上" : date.getHours() < 18 ? "下午" : "晚上";
const minute = date => date.getHours() * 60 + date.getMinutes();
const weekEnglish = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const stageColor = actor => actor === "codex" ? "var(--cyan)" : actor === "claude-code" ? "var(--orange)" : actor === "user" ? "var(--yellow)" : "var(--muted)";

export function currentHomeRun(board) {
  if (!board?.loaded || board.error) return null;
  for (const item of board.items || []) {
    const run = item.protocol?.runs?.find(r => r.isCurrent);
    if (run) return { item, run };
  }
  return null;
}

export function homeGreeting(date) {
  return hourPart(date) + "好，被选召的孩子";
}

export function homeProjectRows(state, projectStatus, savepointReads, timestamp) {
  const active = (state.connections?.projects || []).filter(p => p.active);
  const warnDays = savepointThresholds(state.connections).warn;
  const rows = active.map(project => {
    const read = projectStatus?.items?.find(item => item.projectId === project.id);
    const item = read || {
      projectId: project.id,
      name: project.name,
      root: project.localPaths?.[0] || "",
      current: { state: projectStatus?.error ? "error" : "loading" },
      activity: { state: "unknown" },
      stage: { id: "unknown" },
    };
    const reliable = !!projectStatus?.loaded && !projectStatus?.error && readableCurrent(item);
    const age = reliable ? projectSavepointAge(project, savepointReads?.[project.id], timestamp) : null;
    return {
      ...item,
      name: item.name || project.name,
      reliable,
      savepointDays: age,
      unsaved: age !== null && age > warnDays,
      stalled: reliable && item.activity?.state === "stalled",
    };
  });
  return sortSaveItems(rows).slice(0, 3);
}

export function homeSignalState({ dueTodos, mainCount, current, rows }) {
  return {
    a: !!dueTodos?.length,
    b: mainCount > 0,
    c: !!current?.run?.alerts?.some(alert => alert.kind === "waiting" && !alert.main),
    d: !!rows?.some(row => row.unsaved),
  };
}

function useTraces(panelRef, cardRefs, keyRefs) {
  const [lines, setLines] = useState([]);
  useEffect(() => {
    const panel = panelRef.current;
    if (!panel || typeof ResizeObserver === "undefined") return;
    let frame = 0;
    const calculate = () => {
      const box = panel.getBoundingClientRect();
      if (!box.width || !box.height) return;
      const specs = [["a", "c", -8], ["b", "c", 8], ["c", "a", 0], ["d", "b", 0]];
      const next = specs.flatMap(([name, key, offset]) => {
        const card = cardRefs.current[name];
        const target = keyRefs.current[key];
        if (!card || !target) return [];
        const a = card.getBoundingClientRect(), b = target.getBoundingClientRect();
        const left = name === "a" || name === "b";
        const sx = (left ? a.right : a.left) - box.left;
        const sy = a.top + a.height / 2 - box.top;
        const tx = (left ? b.left : b.right) - box.left;
        const ty = b.top + b.height / 2 - box.top + offset;
        const dx = Math.sign(tx - sx) || 1;
        const dy = Math.sign(ty - sy) || 1;
        const middle = (sx + tx) / 2;
        const radius = Math.min(10, Math.abs(ty - sy) / 2, Math.abs(tx - sx) / 4);
        const d = radius < 1
          ? "M " + sx + " " + sy + " H " + tx
          : "M " + sx + " " + sy + " H " + (middle - dx * radius) +
            " Q " + middle + " " + sy + " " + middle + " " + (sy + dy * radius) +
            " V " + (ty - dy * radius) + " Q " + middle + " " + ty + " " + (middle + dx * radius) + " " + ty +
            " H " + tx;
        return [{ name, d, sx, sy, tx, ty }];
      });
      setLines(next);
    };
    const schedule = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(calculate);
    };
    const observer = new ResizeObserver(schedule);
    [panel, ...Object.values(cardRefs.current), ...Object.values(keyRefs.current)].filter(Boolean).forEach(el => observer.observe(el));
    window.addEventListener("resize", schedule);
    document.fonts?.ready?.then(schedule);
    schedule();
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      window.removeEventListener("resize", schedule);
    };
  }, [panelRef, cardRefs, keyRefs]);
  return lines;
}

function Module({ id, code, english, title, navigate, destination, className = "", cardRefs, setActive, children }) {
  const label = title + " · 前往" + destination;
  return (
    <section
      ref={el => { cardRefs.current[id] = el; }}
      className={"hx-mod hx-mod-" + id + " " + className}
      aria-labelledby={"hx-title-" + id}
      onMouseEnter={() => setActive(id)}
      onMouseLeave={() => setActive("")}
      onFocusCapture={() => setActive(id)}
      onBlurCapture={event => { if (!event.currentTarget.contains(event.relatedTarget)) setActive(""); }}
    >
      <header>
        <span className="hx-port mono" aria-hidden="true">{code}</span>
        <h2 id={"hx-title-" + id}><span className="en">{english}</span>{title}</h2>
        <button type="button" className="hx-page-link" aria-label={label} onClick={navigate}>
          {destination} <ArrowUpRight size={13} aria-hidden="true" />
        </button>
      </header>
      {children}
    </section>
  );
}

function TodayScreen({ calendar, day, calendarTodos, calendarNow, navigate }) {
  const access = calendar.status?.access?.calendar;
  const verified = !calendar.error && calendar.status?.available && access === "authorized" &&
    calendar.week?.available && Array.isArray(calendar.week?.events);
  const segments = verified ? eventsOfDay(calendar.week.events, day).timed : [];
  const visible = segments.filter(item => item.bottom > 8 * 60 && item.top < 20 * 60);
  const currentMinute = minute(day);
  const active = segments.find(item => item.top <= currentMinute && item.bottom > currentMinute);
  const next = segments.find(item => item.top > currentMinute);
  const todos = calendarTodos?.loaded && !calendarTodos.error
    ? (calendarTodos.reminders || []).filter(item => !item.completed).slice().sort((a, b) =>
        (a.due || "9999").localeCompare(b.due || "9999") || a.title.localeCompare(b.title)).slice(0, 2)
    : [];
  const marker = Math.min(100, Math.max(0, (currentMinute - 480) / 720 * 100));
  let calendarMessage = "";
  if (calendar.error) calendarMessage = "日历读取失败，今天的安排待核实";
  else if (!calendar.status) calendarMessage = "正在读取日历…";
  else if (!calendar.status.available) calendarMessage = calendar.status.reason || "本机日历未接入";
  else if (access !== "authorized") calendarMessage = "日历尚未授权，今天的安排待核实";
  else if (!calendar.week) calendarMessage = "正在读取今天的安排…";
  else if (!verified) calendarMessage = calendar.week.reason || "今天的安排读取不完整";
  else if (!segments.length) calendarMessage = "今天没有已读取的安排";
  let todoMessage = "";
  if (calendarTodos?.error) todoMessage = "提醒事项读取失败，Todo 待核实";
  else if (!calendarTodos?.loaded) todoMessage = "提醒事项未读取，Todo 待核实";
  else if (!todos.length) todoMessage = "没有未完成的 Todo";
  return (
    <>
      <div className="hx-tl" role="group" aria-label="今日 8 点至 20 点时间轴">
        <div className="hx-tl-axis" aria-hidden="true"><span>8</span><span>12</span><span>16</span><span>20</span></div>
        <div className="hx-tl-bar" aria-hidden="true">
          {visible.map(item => {
            const left = Math.max(0, (item.top - 480) / 720 * 100);
            const right = Math.min(100, (item.bottom - 480) / 720 * 100);
            return <span key={item.event.id} className={"hx-blk " + (item.event.workbench ? "block" : "meet")}
              style={{ left: left + "%", width: Math.max(0.7, right - left) + "%" }} />;
          })}
          <span className="hx-now" style={{ left: marker + "%" }} />
        </div>
      </div>
      {verified && (active || next) &&
        <p className="hx-nowline"><b className="mono">{clockText(day)}</b>
          {active ? "正在 " + active.event.title : "现在没有进行中的安排"}
          {next ? " · 下一个 " + clockText(new Date(next.event.start)) + " " + next.event.title : ""}
        </p>}
      {calendarMessage && <p className="hx-state" role={calendar.error ? "alert" : "status"}>{calendarMessage}</p>}
      {calendarTodos?.loaded && !calendarTodos.error && !!todos.length &&
        <ul className="hx-todo">{todos.map(item =>
          <li key={item.id} className={todoIsDue(item, calendarNow) ? "due" : ""}>
            <span className="hx-box" aria-hidden="true" />
            <b>{item.title}</b>
            <small>{item.due ? dueText(item.due) : "未设时间"}</small>
          </li>)}</ul>}
      {todoMessage && <p className="hx-state" role={calendarTodos?.error ? "alert" : "status"}>{todoMessage}</p>}
    </>
  );
}

function InboxScreen({ pending, unresolved, navigate }) {
  const groups = inboxSummary(pending);
  const ordered = groups.flatMap(group =>
    pending.filter(item => group.key === "intel"
      ? !item.triage || item.triage === group.triage
      : item.triage === group.triage));
  return <>
    <div className="hx-qcount" aria-label="待处理计数">
      {groups.map(group => <span key={group.key} className={group.key}>
        <b className="mono">{group.count}</b>{group.short}
      </span>)}
    </div>
    {unresolved && <p className="hx-state" role="status">部分来源仍在读取，待处理可能不完整</p>}
    {ordered.length > 0
      ? <ul className="hx-q">{ordered.slice(0, 3).map(item =>
          <li key={item.id} className={item.triage === "需要决定" ? "main" : item.triage === "等你确认" ? "side" : "intel"}>
            <button type="button" onClick={() => navigate("inbox", { itemId: item.id })}
              aria-label={"在待处理打开：" + item.title}>
              <b>{item.title}</b><ArrowRight size={14} aria-hidden="true" />
            </button>
          </li>)}</ul>
      : !unresolved && <p className="hx-empty">已读取的来源里没有要你处理的事</p>}
  </>;
}

function CollabScreen({ board, current, navigate }) {
  if (!board?.loaded) return <p className="hx-state" role="status">正在读取协同协议…</p>;
  if (board.error) return <p className="hx-state" role="alert">协同协议读取失败：{board.error}</p>;
  if (!current) {
    const unknown = (board.items || []).some(item => !item.protocol || !["ok", "partial", "absent"].includes(item.protocol.state));
    return <p className="hx-empty">{unknown ? "协同协议待核实" : "还没有运行中的协同"}</p>;
  }
  const { item, run } = current;
  const phase = run.phase?.number || 0;
  const stages = run.templateState === "unknown" ? [] : run.stations?.length ? run.stations : RUN_PHASES;
  const skipped = stages.filter((stage) => stage.status === "skipped").map((stage) => stage.number);
  const step = stages.length > 1 ? 280 / (stages.length - 1) : 0;
  const at = (index) => 10 + index * step;
  const blocked = run.conflict || run.copyBlocked || item.protocol?.copyBlocked || !run.isCurrent || !phase || !item.root;
  const actor = run.holder || stages[Math.max(0, phase - 1)]?.actor || "unknown";
  return <>
    <p className="hx-run">{item.name} · {run.title} <span className="mono">{phase || "?"}/{stages.length || "?"}</span></p>
    {!stages.length ? <p className="hx-state" role="alert">锁定模板版本待核实，协同线路不可用</p> : <>
    <svg className="hx-mini-line" viewBox="0 0 300 28" preserveAspectRatio="none" role="img"
      aria-label={"协同阶段 " + (phase || "未知") + " / " + stages.length + " · " + (stages[phase - 1]?.label || "阶段未知") + (skipped.length ? ` · 已跳过 ${skipped.join("、")} 站` : "")}>
      <defs>{stages.slice(0, -1).map((stage, index) =>
        <linearGradient key={stage.number} id={"hx-stage-gradient-" + stage.number} gradientUnits="userSpaceOnUse"
          x1={at(index)} x2={at(index + 1)}>
          <stop offset="0" stopColor={stageColor(stage.actor)} />
          <stop offset="1" stopColor={stageColor(stages[index + 1].actor)} />
        </linearGradient>)}</defs>
      {stages.slice(0, -1).map((stage, index) =>
        <line key={stage.number} x1={at(index)} y1="14" x2={at(index + 1)} y2="14"
          className={stage.status === "skipped" || stages[index + 1].status === "skipped" ? "skip" : index + 2 > phase ? "future" : "past"}
          stroke={stage.status === "skipped" || stages[index + 1].status === "skipped" ? "var(--muted)" : index + 2 > phase ? "var(--hw-dim)" : "url(#hx-stage-gradient-" + stage.number + ")"} />)}
      {stages.map((stage, index) => {
        const point = at(index), isCurrent = stage.number === phase, isFuture = stage.number > phase;
        return <g key={stage.number}>
          {isCurrent && <circle cx={point} cy="14" r="10" fill={stageColor(run.holder || stage.actor)} opacity=".22" />}
          <circle cx={point} cy="14" r={isCurrent ? "5.5" : "4.5"}
            fill={stage.status === "skipped" ? "none" : isCurrent ? "var(--text)" : isFuture ? "none" : "var(--hw-deep)"}
            stroke={stage.status === "skipped" ? "var(--muted)" : isFuture ? "var(--hw-dim)" : stageColor(isCurrent ? run.holder || stage.actor : stage.actor)}
            strokeWidth={isCurrent ? "3" : isFuture ? "1.5" : "2.5"}
            strokeDasharray={stage.status === "skipped" || isFuture ? "2 2" : undefined} />
        </g>;
      })}
    </svg>
    <div className="hx-next">
      <span className="hx-next-av"><AgentSprite agent={actor === "claude-code" ? "Claude Code" : actor} mode="body" fit={32} /></span>
      <span><b>轮到{ACTOR[actor] || "谁待核实"}</b><small>{run.alerts?.find(a => a.kind === "waiting")?.label || stages[Math.max(0, phase - 1)]?.label || "阶段未知"}</small></span>
      <button type="button" className="hx-go" disabled={blocked}
        onClick={() => navigate("collab", { projectId: item.projectId, runId: run.id, launch: true })}>
        继续 <ArrowRight size={16} aria-hidden="true" />
      </button>
    </div>
    </>}
    {run.partial && <small className="hx-state">部分协议未核实；继续时仍以协同页最新校验为准</small>}
    {blocked && <small className="hx-state">当前协议需核对；到协同页查看详情</small>}
  </>;
}

function ProjectsScreen({ state, rows, projectStatus, navigate }) {
  const active = (state.connections?.projects || []).filter(p => p.active);
  if (!active.length) return <p className="hx-empty">还没有在推进的项目</p>;
  return <>
    {!projectStatus?.loaded && <p className="hx-state" role="status">正在读取项目状态…</p>}
    {projectStatus?.error && <p className="hx-state" role="alert">项目状态读取失败，进度待核实</p>}
    <ol className="hx-proj-list">{rows.map((row, index) =>
      <li key={row.projectId} className={row.stalled ? "sleep" : ""}>
        <button type="button" onClick={() => navigate("projects", { projectId: row.projectId })}
          aria-label={"打开项目：" + row.name}>
          <span className="hx-slot mono">{pad(index + 1)}</span>
          <b>{row.name}</b>
          <span className={"hx-flag " + (row.unsaved ? "warn" : row.stalled ? "sleep" : "")}>
            {row.unsaved ? "未存档 " + Math.floor(row.savepointDays) + " 天"
              : row.stalled ? "停滞 " + row.activity.idleDays + " 天"
              : row.reliable ? "在推进" : "状态待核实"}
          </span>
        </button>
      </li>)}</ol>
  </>;
}

export function HomeV16({
  state, navigate, openCreate, save, adoptState, notify,
  ruleInstalls, projectStatus, agentContents, healthAudit, nightV2Reports,
  vaultReceipts, savepointReads, knowledgeStatus, calendarTodos, calendarNow,
  collabStatus,
}) {
  const date = new Date(calendarNow || Date.now());
  const [clockNow, setClockNow] = useState(Date.now);
  useEffect(() => {
    let timer;
    const refreshClock = () => {
      window.clearTimeout(timer);
      const current = Date.now();
      setClockNow(current);
      timer = window.setTimeout(refreshClock, 60000 - current % 60000 + 30);
    };
    const resumeClock = () => { if (document.visibilityState === "visible") refreshClock(); };
    refreshClock();
    window.addEventListener("focus", refreshClock);
    document.addEventListener("visibilitychange", resumeClock);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("focus", refreshClock);
      document.removeEventListener("visibilitychange", resumeClock);
    };
  }, []);
  const displayDate = new Date(clockNow);
  const dateKey = ymd(date);
  const range = useMemo(() => {
    const first = startOfDay(new Date(dateKey + "T12:00:00"));
    return { from: first.toISOString(), to: addDays(first, 1).toISOString() };
  }, [dateKey]);
  const calendar = useCalendarData(range);
  useEffect(() => {
    const refresh = () => { if (document.visibilityState === "visible") calendar.reload(); };
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, [calendar.reload]);
  const partner = partnerOf(state);
  const stageScreen = useRef();
  const [dvView, setDvView] = useState("egg"), [lit, setLit] = useState(false);
  const pending = pendingItems(
    state, ruleInstalls, projectStatus, mergeAgentHealth(healthAudit, agentContents),
    undefined, vaultReceipts, { savepointReads, knowledgeStatus, calendarTodos, calendarNow, collabStatus, nightV2Reports },
  );
  const groups = inboxSummary(pending);
  const current = currentHomeRun(collabStatus);
  const rows = homeProjectRows(state, projectStatus, savepointReads, calendarNow || Date.now());
  const dueTodos = calendarTodos?.loaded && !calendarTodos.error
    ? (calendarTodos.reminders || []).filter(item => todoIsDue(item, calendarNow))
    : [];
  const signal = homeSignalState({ dueTodos, mainCount: groups[0].count, current, rows });
  const unresolved = (!rulePendingReady(ruleInstalls) && !ruleInstalls?.error) || collabStatus?.loaded === false;
  const panelRef = useRef(null), cardRefs = useRef({}), keyRefs = useRef({});
  const lines = useTraces(panelRef, cardRefs, keyRefs);
  const [activePort, setActivePort] = useState("");
  const [briefOpen, setBriefOpen] = useState(false);
  const [noteText, setNoteText] = useState(""), [noteBusy, setNoteBusy] = useState(false);
  const [noteAttempt, setNoteAttempt] = useState(null), [noteStatus, setNoteStatus] = useState("");
  const stateRef = useRef(state);
  stateRef.current = state;
  useEffect(() => {
    if (dvView === "number") stageScreen.current?.showNumber(pending.length);
  }, [dvView, pending.length]);
  const poke = () => {
    if (dvView !== "egg") { setDvView("egg"); stageScreen.current?.showEgg(); }
    stageScreen.current?.poke();
  };
  const finishNote = actual => {
    if (actual) adoptState?.(actual);
    setNoteText(""); setNoteAttempt(null); setNoteStatus("");
    notify?.("已保存本地随手记");
  };
  async function checkNote(attempt, replay) {
    try {
      const actual = await request("/workspace");
      const found = actual.notes?.find(note => note.id === attempt.id);
      if (found) {
        if (found.text === attempt.text) { finishNote(actual); return; }
        setNoteStatus("同一记录已变化，先到随手记核对；输入仍保留。");
        return;
      }
      adoptState?.(actual);
      if (!replay) { setNoteStatus("没有查到这条记录，输入已保留；可核对并重试。"); return; }
      const ok = await save({ ...actual, notes: [attempt, ...(actual.notes || [])] });
      const recheck = await request("/workspace");
      const after = recheck.notes?.find(note => note.id === attempt.id);
      if (after?.text === attempt.text) finishNote(recheck);
      else setNoteStatus("保存仍未确认，输入已保留；请核对后再试。");
    } catch (error) {
      setNoteStatus("保存结果暂时无法核实，输入已保留；请稍后核对并重试。");
    }
  }
  async function submitNote(event) {
    event?.preventDefault?.();
    if (noteBusy) return;
    const text = noteText.trim();
    if (!text) return;
    if (text.length > NOTE_MAX) { setNoteStatus("单条随手记最多 20000 字。"); return; }
    const attempt = noteAttempt || { id: uid(), at: now(), text };
    setNoteAttempt(attempt);
    setNoteBusy(true);
    setNoteStatus("");
    try {
      if (noteAttempt) await checkNote(attempt, true);
      else {
        const base = stateRef.current;
        const ok = await save({ ...base, notes: [attempt, ...(base.notes || [])] });
        if (ok) {
          const actual = await request("/workspace");
          if (actual.notes?.some(note => note.id === attempt.id && note.text === attempt.text)) finishNote(actual);
          else setNoteStatus("保存结果暂时无法核实，输入已保留；请核对并重试。");
        } else await checkNote(attempt, false);
      }
    } catch {
      setNoteStatus("保存结果暂时无法核实，输入已保留；请稍后核对并重试。");
    } finally { setNoteBusy(false); }
  }
  const greeting = homeGreeting(displayDate);
  return <div className="hx" ref={panelRef}>
    <h1 className="sr-only">世界总览</h1>
    <div className="hx-floor" aria-hidden="true" />
    <svg className="hx-traces" viewBox={"0 0 " + (panelRef.current?.clientWidth || 1) + " " + (panelRef.current?.clientHeight || 1)}
      preserveAspectRatio="none" aria-hidden="true">
      {lines.map(line => <g key={line.name} data-trace={line.name} className={activePort === line.name ? "active" : ""}>
        <path className="hx-tr" d={line.d} />
        {signal[line.name] && <path className={"hx-sig hx-sig-" + line.name} d={line.d} />}
        <circle className="hx-pin" cx={line.sx} cy={line.sy} r="4" />
        <circle className="hx-pin end" cx={line.tx} cy={line.ty} r="3" />
      </g>)}
    </svg>
    <div className="hx-col-l">
      <Module id="a" code="A" english="TODAY" title="今日" destination="日历" navigate={() => navigate("calendar")}
        cardRefs={cardRefs} setActive={setActivePort}>
        <TodayScreen calendar={calendar} day={date} calendarTodos={calendarTodos} calendarNow={calendarNow} navigate={navigate} />
      </Module>
      <Module id="b" code="B" english="QUESTS" title="待处理" destination="全部" navigate={() => navigate("inbox")}
        cardRefs={cardRefs} setActive={setActivePort}>
        <InboxScreen pending={pending} unresolved={unresolved} navigate={navigate} />
      </Module>
    </div>
    <div className="hx-core">
      <time className="hx-date" dateTime={ymd(displayDate) + "T" + clockText(displayDate)} aria-label={clockText(displayDate) + " " + (displayDate.getMonth() + 1) + "月" + displayDate.getDate() + "日 " + weekEnglish[displayDate.getDay()]}>
        <LcdText text={clockText(displayDate)} px={7} />
        <span className="hx-dow"><b>{displayDate.getMonth() + 1}月{displayDate.getDate()}日</b><small className="en">{weekEnglish[displayDate.getDay()]}</small></span>
      </time>
      <p className="hx-greet">{greeting}</p>
      <figure className="hx-device">
        <div className="hx-crest-stage">
          <span className="hero-orbit a" aria-hidden="true" />
          <span className="hero-orbit b" aria-hidden="true" />
          <CrestRing />
          <div className="dv-wrap">
            <DigiviceArt size={290} className={lit ? "lit" : ""}>
              <PartnerScreen ref={stageScreen} mode="stage" cols={14} rows={15} />
              {dvView === "number" && <span className="dv-label" aria-hidden="true">待处理</span>}
            </DigiviceArt>
            <button type="button" className="digivice-poke" aria-label={"戳一下" + partner.name} onClick={poke} />
            <button ref={el => { keyRefs.current.a = el; }} type="button" className="dv-key a" data-key="A"
              aria-label={dvView === "egg" ? "A 键：显示待处理条数（" + pending.length + "）" : "A 键：切回数码蛋"}
              aria-pressed={dvView === "number"}
              onClick={() => { const next = dvView === "egg" ? "number" : "egg"; setDvView(next); if (next === "number") stageScreen.current?.showNumber(pending.length); else stageScreen.current?.showEgg(); }} />
            <button ref={el => { keyRefs.current.b = el; }} type="button" className="dv-key b" data-key="B"
              aria-label="B 键：背光" aria-pressed={lit} onClick={() => setLit(!lit)} />
            <button ref={el => { keyRefs.current.c = el; }} type="button" className="dv-key c" data-key="C"
              aria-label={"C 键：戳一下" + partner.name} onClick={poke} />
          </div>
        </div>
        <figcaption><span className="en">PARTNER · {partner.name}</span></figcaption>
      </figure>
      <form className="hx-cmd" onSubmit={submitNote}>
        <span className="hx-prompt mono" aria-hidden="true">&gt;</span>
        <input aria-label="记一笔" placeholder="记一笔：一个念头、一个问题……"
          value={noteText} readOnly={!!noteAttempt || noteBusy}
          onChange={event => setNoteText(event.target.value)}
          onKeyDown={event => { if ((event.metaKey || event.ctrlKey) && event.key === "Enter") submitNote(event); }} />
        <kbd className="hx-key mono">⌘↵</kbd>
        <button type="submit" aria-label={noteAttempt ? "核对并重试随手记" : "保存随手记"} disabled={noteBusy || !noteText.trim()}>
          {noteAttempt ? <RotateCw size={16} /> : <Check size={16} />}
        </button>
      </form>
      {noteStatus && <p className="hx-note-status" role="alert">{noteStatus}</p>}
      <div className="hx-quick">
        <button type="button" onClick={() => navigate("agents")}>接力</button><i aria-hidden="true" />
        <button type="button" onClick={() => navigate("knowledge", { anchor: "k-sources" })}>查知识</button><i aria-hidden="true" />
        <button type="button" onClick={() => openCreate?.("Skill")}>新建资产</button>
      </div>
    </div>
    <div className="hx-col-r">
      <Module id="c" code="C" english="WORKFLOW" title="协同" destination="线路图" navigate={() => navigate("collab")}
        cardRefs={cardRefs} setActive={setActivePort}>
        <CollabScreen board={collabStatus} current={current} navigate={navigate} />
      </Module>
      <Module id="d" code="D" english="SAVE DATA" title="在推进" destination="项目空间" navigate={() => navigate("projects")}
        cardRefs={cardRefs} setActive={setActivePort}>
        <ProjectsScreen state={state} rows={rows} projectStatus={projectStatus} navigate={navigate} />
        {(state.connections?.projects || []).some(project => project.active) &&
          <button className="hx-brief-link" type="button" onClick={() => setBriefOpen(true)}>
            今日项目简报 <ArrowUpRight size={14} aria-hidden="true" />
          </button>}
      </Module>
    </div>
    {briefOpen && <Dialog title="今日项目简报" drawer recoverFocus onClose={() => setBriefOpen(false)}>
      <HomeBrief state={state} adoptState={adoptState} notify={notify} navigate={navigate} />
    </Dialog>}
  </div>;
}
