import React, { useEffect, useLayoutEffect, useRef, useState } from "react";
import {useWebDraft} from './useWebDraft.js';
import {registerPageGuard} from './navigation-guard.js';
import { ArrowUpRight, Check, RotateCw } from "lucide-react";
import { request } from "./api.js";
import { ymd } from "./calendar.js";
import { CrestRing, DigiviceArt, partnerOf } from "./pixel.jsx";
import { PartnerScreen } from "./PartnerScreen.jsx";
import { LcdText } from "./v14.jsx";
import { NOTE_MAX } from "./rich-note.js";
import { now, uid } from "./store.js";
import { AssetsScreen, CollectionScreen } from "./HomeOverviewContent.jsx";
import "./home-v16.css";

const pad = n => String(n).padStart(2, "0");
const clockText = date => pad(date.getHours()) + ":" + pad(date.getMinutes());
const hourPart = date => date.getHours() < 11 ? "早上" : date.getHours() < 18 ? "下午" : "晚上";
const weekEnglish = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
export function homeGreeting(date) {
  return hourPart(date) + "好，被选召的孩子";
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
      const specs = [["a", "c", -8], ["b", "b", 8]];
      const next = specs.flatMap(([name, key, offset]) => {
        const card = cardRefs.current[name];
        const target = keyRefs.current[key];
        if (!card || !target) return [];
        const a = card.getBoundingClientRect(), b = target.getBoundingClientRect();
        const left = name === "a";
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
      <div className="hx-module-body">{children}</div>
    </section>
  );
}

export function HomeV16({
  state, navigate, openCreate, save, adoptState, notify,
}) {
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
  const partner = partnerOf(state);
  const stageScreen = useRef();
  const [lit, setLit] = useState(false);
  const panelRef = useRef(null), cardRefs = useRef({}), keyRefs = useRef({});
  const lines = useTraces(panelRef, cardRefs, keyRefs);
  const [activePort, setActivePort] = useState("");
  const [noteText, setNoteText] = useState(""), [noteBusy, setNoteBusy] = useState(false);
  const [noteAttempt, setNoteAttempt] = useState(null), [noteStatus, setNoteStatus] = useState("");
  const recovery=useWebDraft('home',v=>!!v&&typeof v.text==='string'&&v.text.length<=NOTE_MAX&&(!v.attempt||typeof v.attempt.id==='string'&&typeof v.attempt.text==='string'));
  const hydrated=useRef(false),liveNote=useRef(true),composingNote=useRef(false),noteLock=useRef(false),activeAttempt=useRef(null);
  useEffect(()=>{liveNote.current=true;return()=>{liveNote.current=false;};},[]);
  useEffect(()=>registerPageGuard(()=>composingNote.current?'中文输入尚未完成，请先确认输入。':''),[]);
  useLayoutEffect(()=>{if(!recovery.ready||hydrated.current)return;hydrated.current=true;const value=recovery.value;if(value){setNoteText(value.text);setNoteAttempt(value.attempt||null);if(value.attempt){activeAttempt.current=value.attempt;noteLock.current=true;setNoteBusy(true);checkNote(value.attempt,false).finally(()=>{noteLock.current=false;if(liveNote.current)setNoteBusy(false);});}}},[recovery.ready]);
  const stateRef = useRef(state);
  stateRef.current = state;
  const poke = () => stageScreen.current?.poke();
  const finishNote = (actual,attempt) => {
    if(!liveNote.current||activeAttempt.current?.id!==attempt.id)return;
    recovery.save({text:'',attempt:null});activeAttempt.current=null;
    if (actual) adoptState?.(actual);
    setNoteText(""); setNoteAttempt(null); setNoteStatus("");
    notify?.("已保存本地随手记");
  };
  async function checkNote(attempt, replay) {
    try {
      const actual = await request("/workspace");
      const found = actual.notes?.find(note => note.id === attempt.id);
      if (found) {
        if (found.text === attempt.text) { finishNote(actual,attempt); return; }
        setNoteStatus("同一记录已变化，先到随手记核对；输入仍保留。");
        return;
      }
      adoptState?.(actual);
      if (!replay) { setNoteStatus("没有查到这条记录，输入已保留；可核对并重试。"); return; }
      const ok = await save({ ...actual, notes: [attempt, ...(actual.notes || [])] }, { base: actual });
      const recheck = await request("/workspace");
      const after = recheck.notes?.find(note => note.id === attempt.id);
      if (after?.text === attempt.text) finishNote(recheck,attempt);
      else setNoteStatus("保存仍未确认，输入已保留；请核对后再试。");
    } catch (error) {
      setNoteStatus("保存结果暂时无法核实，输入已保留；请稍后核对并重试。");
    }
  }
  async function submitNote(event) {
    event?.preventDefault?.();
    if (noteLock.current || noteBusy || !recovery.ready || composingNote.current) return;
    const text = noteText.trim();
    if (!text) return;
    if (text.length > NOTE_MAX) { setNoteStatus("单条随手记最多 20000 字。"); return; }
    const attempt = noteAttempt || { id: uid(), at: now(), text };
    try{recovery.save({text:noteText,attempt});}catch{return;}
    activeAttempt.current=attempt;noteLock.current=true;
    setNoteAttempt(attempt);
    setNoteBusy(true);
    setNoteStatus("");
    try {
      if (noteAttempt) await checkNote(attempt, true);
      else {
        const base = stateRef.current;
        const ok = await save({ ...base, notes: [attempt, ...(base.notes || [])] }, { base });
        if (ok) {
          const actual = await request("/workspace");
          if (actual.notes?.some(note => note.id === attempt.id && note.text === attempt.text)) finishNote(actual,attempt);
          else setNoteStatus("保存结果暂时无法核实，输入已保留；请核对并重试。");
        } else await checkNote(attempt, false);
      }
    } catch {
      setNoteStatus("保存结果暂时无法核实，输入已保留；请稍后核对并重试。");
    } finally { noteLock.current=false;if(liveNote.current)setNoteBusy(false); }
  }
  const greeting = homeGreeting(displayDate);
  return <div className="hx" ref={panelRef}>
    <h1 className="sr-only">世界总览</h1>
    <div className="hx-floor" aria-hidden="true" />
    <svg className="hx-traces" viewBox={"0 0 " + (panelRef.current?.clientWidth || 1) + " " + (panelRef.current?.clientHeight || 1)}
      preserveAspectRatio="none" aria-hidden="true">
      {lines.map(line => <g key={line.name} data-trace={line.name} className={activePort === line.name ? "active" : ""}>
        <path className="hx-tr" d={line.d} />
        <circle className="hx-pin" cx={line.sx} cy={line.sy} r="4" />
        <circle className="hx-pin end" cx={line.tx} cy={line.ty} r="3" />
      </g>)}
    </svg>
    <div className="hx-col-l">
      <Module id="a" code="1" english="ASSETS" title="资产仓库" destination="全部" navigate={() => navigate("assets", { filter: "all" })}
        cardRefs={cardRefs} setActive={setActivePort}>
        <AssetsScreen state={state} />
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
            </DigiviceArt>
            <button type="button" className="digivice-poke" aria-label={"戳一下" + partner.name} onClick={poke} />
            <button ref={el => { keyRefs.current.a = el; }} type="button" className="dv-key a" data-key="A"
              aria-label="A 键：打开资产仓库" onClick={() => navigate("assets")} />
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
          value={noteText} readOnly={!recovery.ready || !!noteAttempt || noteBusy}
          onCompositionStart={()=>{composingNote.current=true;}} onCompositionEnd={()=>{composingNote.current=false;}}
          onChange={event => {const text=event.target.value;setNoteText(text);try{recovery.save({text,attempt:noteAttempt});}catch{}}}
          onKeyDown={event => { if ((event.metaKey || event.ctrlKey) && event.key === "Enter") submitNote(event); }} />
        <kbd className="hx-key mono">⌘↵</kbd>
        <button type="submit" aria-label={noteAttempt ? "核对并重试随手记" : "保存随手记"} disabled={!recovery.ready || noteBusy || !noteText.trim()}>
          {noteAttempt ? <RotateCw size={16} /> : <Check size={16} />}
        </button>
      </form>
      {(recovery.error||noteStatus) && <p className="hx-note-status" role="alert">{recovery.error||noteStatus}</p>}
      <div className="hx-quick">
        <button type="button" onClick={() => openCreate?.("Skill")}>新建资产</button>
      </div>
    </div>
    <div className="hx-col-r">
      <Module id="b" code="2" english="COLLECTION" title="收藏" destination="全部" navigate={() => navigate("learning")}
        cardRefs={cardRefs} setActive={setActivePort}>
        <CollectionScreen />
      </Module>
    </div>
  </div>;
}
