// 项目空间第二版（电路卡带 7E，issue #10）：上面一排电路卡带（名册里每个项目一盘），下面一块档案屏。
// 只读为主：数据来自 GET /api/projects-space；唯一的写入是置顶（POST /api/projects-space/pin，带版本检查并回读）。
// 接力口令、收件、装备从这页撤下，代码保留在 ProjectsV16；页脚「复制接手口令」复用旧组件，核对与留痕不变。
// 动效全部按帧：卡带压下、走线流光一次、扫描线、液晶滚动、逐字、像素格；减少动态效果时直接到位。
import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { RefreshCw, Settings2 } from "lucide-react";
import { Dialog, SourceReadError } from "./components.jsx";
import { request } from "./api.js";
import { LcdText, useCountUp, useReducedMotion } from "./v14.jsx";
import { CurrentBlock, SafetyBlock } from "./ProjectStatus.jsx";
import { ProjectLocations } from "./ProjectLocations.jsx";
import { ProjectContext } from "./ProjectContext.jsx";
import { ProjectRules } from "./RuleInstall.jsx";
import { ProjectLaunch } from "./ProjectsV16.jsx";
import { projectHue } from "./project-hues.js";
import "./projects-space.css";

const pad2 = (n) => String(n).padStart(2, "0");
const STEP = { easing: "steps(1, end)" };
const FOLD = 10, CELLS = 15;
const md = (d) => (d ? `${+d.slice(5, 7)}/${+d.slice(8, 10)}` : "");
const isMonday = (d) => new Date(d + "T00:00:00").getDay() === 1;
// 走线画两层：底层常显（选中时发光），上层是选中那一刻跑一遍的电流（pathLength=100 方便按帧推进）
const TRACES = ["M0 18H34l10 10H86l8-8h46", "M0 46h12l6 6v54l6 6h34", "M140 52h-22l-8 8v52", "M58 0v14", "M88 0v20", "M112 120V96l8-8h20", "M0 118h70l6-6h26"];
const VIAS = [[34, 18], [94, 20], [18, 52], [110, 60], [76, 112], [112, 96]];

// 液晶数：滚动到位（useCountUp 按帧跳），始终补足两位。
function Count({ value, run, px = 3 }) {
  const shown = useCountUp(String(value), run);
  return <LcdText text={pad2(shown)} px={px} label={String(value)} boot />;
}

function Mono({ code }) {
  return <LcdText text={code} px={2} label={null} />;
}

function Trace() {
  return (
    <svg className="trace" viewBox="0 0 140 120" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
      <g className="lines" fill="none" stroke="currentColor" strokeWidth="1.2">{TRACES.map((d) => <path key={d} d={d} />)}</g>
      <g className="flow" fill="none" strokeWidth="1.8" strokeLinecap="round">{TRACES.map((d) => <path key={d} d={d} pathLength="100" />)}</g>
      <g className="vias" fill="currentColor">{VIAS.map(([cx, cy]) => <circle key={cx + "-" + cy} cx={cx} cy={cy} r="2.2" />)}</g>
    </svg>
  );
}

function Cart({ item, index, on, pressed, skillsOn, onSelect, onKeyDown }) {
  const hue = projectHue(item);
  const issues = item.github?.state === "ok" ? pad2(item.github.issues.open) : item.github?.state === "none" ? "—" : "?";
  const skills = skillsOn && item.skills ? pad2(item.skills.skills.length) : "—";
  return (
    <button type="button" role="tab" id={`ps-tab-${item.id}`} aria-controls="ps-screen" aria-selected={on} tabIndex={on ? 0 : -1}
      className={`g5-cart cart-x pcb${pressed ? " press" : ""}`} data-ps-cart={item.id} style={{ "--hue": hue.hue }}
      aria-label={`${item.name}：${item.attention.text}`} onClick={() => onSelect(item.id)} onKeyDown={onKeyDown}>
      <span className="board">
        <Trace />
        <span className="chip"><span className="g5-mono"><Mono code={hue.code} /></span></span>
        <span className="tx">
          <span className="nm"><b title={item.name}>{item.name}</b>{item.pinned && <i className="pin" data-ps-pin title="已置顶" />}</span>
          <span className="sub">{hue.sub || item.path}</span>
        </span>
        <span className="no">{pad2(index + 1)}</span>
      </span>
      <span className="cshell">
        <i className={`led pwr${item.lit ? " on" : ""}`} title={item.lit ? "近 7 天有提交" : "近 7 天没有提交"} />
        <span className="flag"><span className={item.attention.warn ? "warn" : ""}>{item.attention.text}</span></span>
        <span className="reads"><span>ISSUE <b>{issues}</b></span><span className="sk">技能 <b>{skills}</b></span></span>
      </span>
      <span className="pins" aria-hidden="true" />
    </button>
  );
}

function ReadCell({ label, value, tone = "", note, run }) {
  return (
    <div className={tone}>
      <small>{label}</small>
      {value == null ? <b className="dash">—</b> : <span className={`lcd ${tone}`}><Count value={(value)} run={run} px={3} /></span>}
      <em>{note}</em>
    </div>
  );
}

function Reads({ item, skillsOn, run }) {
  const gh = item.github, i = gh.state === "ok" ? gh.issues : null;
  const split = i?.open ? [["待 Agent", i.agent], ["待人工", i.human], ["待分流", i.triage]].filter(([, n]) => n).map(([k, n]) => `${k} ${n}`).join(" · ") : "";
  const ghNote = gh.state === "none" ? "没有 GitHub 远端" : gh.state === "error" ? "读取失败 · 点刷新重试" : "";
  const c = item.commits.state === "ok" ? item.commits : null;
  const s = skillsOn ? item.skills : null;
  return (
    <div className="g7-reads">
      <ReadCell label="开着的 issue" value={i ? i.open : null} note={i ? split : ghNote} run={run} />
      <ReadCell label="待合并 PR" value={gh.state === "ok" ? gh.prs : null} note={gh.state === "ok" ? "" : ghNote} run={run} />
      <ReadCell label="未推送提交" value={item.unpushed} tone={item.unpushed > 10 ? "warn" : ""}
        note={item.unpushed == null ? "没有上游分支" : item.unpushed > 10 ? "该推了" : ""} run={run} />
      <ReadCell label="近 30 天提交" value={c ? c.total : null} tone="cyan" note={c ? `${c.activeDays} 天有提交` : item.commits.state === "none" ? "不是 Git 仓库" : "读不到"} run={run} />
      <ReadCell label="近 30 天技能调用" value={s ? s.calls : null} tone="violet"
        note={!skillsOn ? "未开启" : s?.skills.length ? `${s.skills.length} 个技能 · ${s.sessions} 个会话` : "没有调用"} run={run} />
    </div>
  );
}

// 逐字打出下一步；减少动态效果或不需要动效时直接显示。
function Typed({ text, run, reduced }) {
  const [shown, setShown] = useState(text);
  useEffect(() => {
    if (reduced || !run) { setShown(text); return; }
    let k = 0;
    setShown("");
    const id = setInterval(() => {
      k = Math.min(text.length, k + 2);
      setShown(text.slice(0, k));
      if (k >= text.length) clearInterval(id);
    }, 22);
    return () => clearInterval(id);
  }, [text, run, reduced]);
  return <>{shown}{shown.length < text.length && <i className="caret" />}</>;
}

function Now({ item, run, reduced }) {
  const now = item.now, next = item.next;
  const src = !now ? "" : now.src === "CURRENT" ? [now.date, now.by].filter(Boolean).join(" · ") : `${now.date} · 最近提交（没有 CURRENT）`;
  return (
    <div className="g7-now">
      <div>
        <h3>现在</h3>
        {now ? <><p className="ttl">{now.title}</p>{src && <p className="src">{src}</p>}</> : <p className="ttl none">{item.dir === "missing" ? "本机找不到目录" : "读不到 CURRENT 与提交"}</p>}
      </div>
      <div className={`nx${next.stale ? " warn" : ""}`}>
        <h3>下一步{next.stale && <span className="tag">可能过期</span>}</h3>
        <p className={next.src === "none" ? "none" : ""} data-ps-next>
          {next.url ? <a href={next.url} target="_blank" rel="noreferrer"><Typed text={next.text} run={run} reduced={reduced} /></a> : <Typed text={next.text} run={run} reduced={reduced} />}
        </p>
        {next.from && <p className="src">{next.from}{next.stale && next.date ? ` · 停在 ${md(next.date)}` : ""}</p>}
      </div>
    </div>
  );
}

function Chart({ item, days }) {
  const c = item.commits;
  if (c.state !== "ok")
    return <section className="g7-sec g7-chart"><h3>近 30 天提交<span className="sum">{c.state === "none" ? "不是 Git 仓库" : c.message || "读不到"}</span></h3></section>;
  const xs = c.days, max = Math.max(1, ...xs), peak = c.peak?.n ? days.indexOf(c.peak.date) : -1;
  return (
    <section className="g7-sec g7-chart">
      <h3>近 30 天提交<span className="sum">{c.total ? <><b>{c.total}</b> 次 · {c.activeDays} 天 · 最多 {md(c.peak.date)} {c.peak.n} 次</> : "没有提交"}</span></h3>
      <div className="plot" role="img" aria-label={`近 30 天每日提交数，共 ${c.total} 次`}>
        {xs.map((n, k) => (
          <i key={days[k]} className={`${n ? "on" : ""}${isMonday(days[k]) ? " wk" : ""}${k === xs.length - 1 ? " today" : ""}`}
            style={{ "--h": `${n ? Math.max(6, Math.round((n / max) * 100)) : 0}%` }} title={`${md(days[k])}：${n} 次提交`}>
            {k === peak && <b>{n}</b>}
          </i>
        ))}
      </div>
      <div className="axis" aria-hidden="true">
        {xs.map((_, k) => <span key={days[k]}>{k === xs.length - 1 ? "今天" : k === 0 || isMonday(days[k]) ? md(days[k]) : ""}</span>)}
      </div>
    </section>
  );
}

function Field({ item, usage, open, onToggle, onSettings }) {
  if (usage !== "ok")
    return (
      <section className="g7-sec g7-field">
        <h3>实战<span className="sum">读取会话里的技能使用：{usage === "empty" ? "还没有统计" : usage === "error" ? "读取失败" : "未开启"}</span>
          <span className="grow" /><button type="button" className="g5-link" onClick={onSettings}>去设置</button></h3>
      </section>
    );
  const s = item.skills;
  if (!s?.skills.length)
    return <section className="g7-sec g7-field"><h3>实战<span className="sum">近 30 天没有调用技能的会话</span></h3></section>;
  const rows = open ? s.skills : s.skills.slice(0, FOLD);
  return (
    <section className="g7-sec g7-field">
      <h3>实战<span className="sum"><b>{s.skills.length}</b> 个技能 · <b className="v">{s.calls}</b> 次调用 · <b>{s.sessions}</b> 个会话 · 近 30 天</span></h3>
      <ul className="g5-skills g7-skills">
        {rows.map((x) => (
          <li key={x.name}>
            <span className="nm"><b>{x.name}</b><small>{x.src}</small></span>
            <span className="pips" aria-hidden="true">
              {Array.from({ length: CELLS }, (_, k) => <i key={k} className={k < x.n ? "on" : ""} />)}
              {x.n > CELLS && <em>+{x.n - CELLS}</em>}
            </span>
            <span className="n">{x.n}<small> 次</small></span>
            <span className="st"><span className="last">{x.last.slice(5)}</span></span>
          </li>
        ))}
      </ul>
      {s.skills.length > FOLD && <button type="button" className="g5-more" aria-expanded={open} onClick={onToggle}>{open ? "收起" : `其余 ${s.skills.length - FOLD} 个 ▾`}</button>}
      {!!s.codex?.length && <p className="g7-codex"><b>Codex 点名</b>{s.codex.map((c) => `${c.name} ×${c.n}`).join(" · ")}<span>仅参考</span></p>}
    </section>
  );
}

function Head({ item, pinBusy, onPin, onDetail }) {
  const hue = projectHue(item), doc = item.doc || {};
  return (
    <div className="g7-head">
      <span className="g5-mono" style={{ "--hue": hue.hue }}><Mono code={hue.code} /></span>
      <div className="id">
        <h2>{item.name}<small>{hue.sub}</small></h2>
        <p className="one">{doc.state === "ok" && doc.one ? doc.one : item.path}</p>
      </div>
      <div className="acts">
        <button type="button" className="btn" aria-pressed={item.pinned} disabled={pinBusy || !item.projectId}
          title={item.projectId ? "" : "还没在设置里扫描登记，不能置顶"} onClick={onPin}>{item.pinned ? "已置顶" : "置顶"}</button>
        {doc.url ? <a className="btn" href={doc.url} title={`Vault · ${item.card}`}>项目卡 ↗</a>
          : <span className="btn off" title={doc.message || "Vault 读取未开启"}>项目卡 ↗</span>}
        <button type="button" className="btn" disabled={!item.projectId} title={item.path} onClick={onDetail}>详情</button>
      </div>
      {doc.state === "ok" ? (
        <dl><div><dt>目标</dt><dd>{doc.goal || "项目卡没写"}</dd></div><div><dt>不做</dt><dd>{doc.not || "项目卡没写"}</dd></div></dl>
      ) : (
        <p className="g7-docnote">{doc.state === "off" ? "项目卡：Vault 读取未开启，只显示本机路径" : doc.message || "项目卡读不到"}</p>
      )}
    </div>
  );
}

export function ProjectsSpace({ state, navigate, adoptState, notify, ruleInstalls, refreshRuleInstalls,
  projectStatus = { items: [], error: "", loaded: true }, refreshProjectStatus = () => {}, projectJump }) {
  const reduced = useReducedMotion();
  const [data, setData] = useState(null), [error, setError] = useState(""), [loading, setLoading] = useState(true);
  const [current, setCurrent] = useState(null), [run, setRun] = useState(0), [pressed, setPressed] = useState(null);
  const [open, setOpen] = useState(false), [receipt, setReceipt] = useState(""), [pinBusy, setPinBusy] = useState(false);
  const [detail, setDetail] = useState(false), [launch, setLaunch] = useState(false);
  const [collection, setCollection] = useState({ notes: [], state: "loading" }), [agent, setAgent] = useState("claude"), [openApp, setOpenApp] = useState(true);
  const screen = useRef(null), live = useRef(true);
  useEffect(() => () => { live.current = false; }, []);

  const load = useCallback(async (refresh = false) => {
    setLoading(true);
    try {
      const value = await request(refresh ? "/projects-space?refresh=1" : "/projects-space");
      if (!live.current) return null;
      setData(value);
      setError("");
      return value;
    } catch (e) {
      if (live.current) setError(e.message);
      return null;
    } finally {
      if (live.current) setLoading(false);
    }
  }, []);
  useEffect(() => { void load(); }, [load]);

  const items = data?.items || [];
  const item = items.find((i) => i.id === current) || items[0] || null;
  const skillsOn = data?.skillUsage?.state === "ok";
  // 世界总览点项目跳过来时，选中对应的那盘。
  useEffect(() => {
    if (!projectJump?.id || !items.length) return;
    const hit = items.find((i) => i.projectId === projectJump.id);
    if (hit) setCurrent(hit.id);
  }, [projectJump?.key, projectJump?.id, items.length]);

  // 档案屏扫描线：换卡带时自上而下刷一遍（按帧），之后藏起来。
  useLayoutEffect(() => {
    const el = screen.current, bar = el?.querySelector(".scan");
    if (!run || reduced || !bar) return;
    const h = el.offsetHeight;
    bar.animate([...Array.from({ length: 11 }, (_, i) => ({ offset: i / 11, opacity: 1, transform: `translateY(${(i / 10) * h}px)`, ...STEP })), { opacity: 0, transform: `translateY(${h}px)` }], { duration: 440 });
    el.querySelectorAll(".g5-skills .pips").forEach((row, k) =>
      row.querySelectorAll("i.on").forEach((cell, i) => cell.animate([{ opacity: 0.12, ...STEP }, { opacity: 1 }], { duration: 1, delay: k * 40 + i * 30, fill: "backwards" })));
  }, [run]);

  function select(id) {
    if (id === item?.id) return;
    setCurrent(id);
    setOpen(false);
    setRun((n) => n + 1);
    if (!reduced) { setPressed(id); setTimeout(() => live.current && setPressed(null), 260); }
    if (matchMedia("(max-width: 760px)").matches) requestAnimationFrame(() => screen.current?.scrollIntoView({ behavior: reduced ? "auto" : "smooth", block: "start" }));
  }
  function onCartKey(e) {
    const k = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[e.key];
    if (!k || !items.length) return;
    e.preventDefault();
    const next = items[(items.findIndex((i) => i.id === item.id) + k + items.length) % items.length];
    select(next.id);
    document.getElementById(`ps-tab-${next.id}`)?.focus();
  }
  function blink(el, times = 2) {
    if (!el || reduced) return;
    const f = [];
    for (let i = 0; i < times; i++) f.push({ opacity: 0.25, ...STEP }, { opacity: 1, ...STEP });
    el.animate(f.map((x, i) => ({ ...x, offset: i / f.length })).concat({ opacity: 1 }), { duration: times * 220 });
  }

  async function pin() {
    if (!item || pinBusy) return;
    const want = !item.pinned;
    if (want && items.filter((i) => i.pinned).length >= (data.pinLimit || 3)) { setReceipt(`置顶最多 ${data.pinLimit || 3} 个：先取消一个再置顶`); return; }
    setPinBusy(true);
    try {
      const workspace = await request("/workspace");
      const r = await request("/projects-space/pin", { id: item.id, pinned: want, revision: workspace.revision });
      adoptState(await request("/workspace"));
      const fresh = await load();
      if (!live.current) return;
      const saved = fresh?.items.find((i) => i.id === item.id);
      setReceipt(saved?.pinned === r.pinned
        ? (r.pinned ? `已置顶 ${item.name}：排到最前，并显示在世界总览` : `已取消置顶 ${item.name}`)
        : "置顶结果待核实，请刷新后再看");
      requestAnimationFrame(() => blink(document.querySelector(`[data-ps-cart="${CSS.escape(item.id)}"] [data-ps-pin]`)));
      void refreshProjectStatus();
    } catch (e) {
      if (live.current) setReceipt(e.message);
    } finally {
      if (live.current) setPinBusy(false);
    }
  }

  async function refresh() {
    const value = await load(true);
    if (!value || reduced) return;
    document.querySelectorAll("[data-ps-cart]").forEach((c, i) => setTimeout(() => blink(c, 1), i * 60));
    setRun((n) => n + 1);
  }

  async function openLaunch() {
    setLaunch(true);
    try {
      const notes = await request("/collection/notes");
      if (live.current) setCollection({ notes: notes.notes || notes.items || [], state: "ok" });
    } catch {
      if (live.current) setCollection({ notes: [], state: "error" });
    }
  }

  const statusItem = item?.projectId ? projectStatus.items?.find((i) => i.projectId === item.projectId) : null;
  const project = item?.projectId ? state.connections?.projects?.find((p) => p.id === item.projectId) : null;
  const totals = data?.totals;
  const goSettings = () => navigate("settings");

  return (
    <div className="g5 projects-space" data-v="b" data-cart="5">
      <header className="bar">
        <h1>项目空间<span className="en">PROJECTS</span></h1>
        <div className="counts">
          <span className="cnt"><span className="lcd"><Count value={(totals?.projects ?? 0)} run={data?.at} px={3} /></span><small>项目</small></span>
          <span className="cnt"><span className="lcd cyan">{totals ? <Count value={(totals.issues)} run={data?.at} px={3} /> : <b className="dash">—</b>}</span><small>开着的 issue</small></span>
          <span className="cnt"><span className="lcd violet">{totals?.skillCalls != null ? <Count value={(totals.skillCalls)} run={data?.at} px={3} /> : <b className="dash">—</b>}</span><small>近 30 天技能调用</small></span>
        </div>
        <span className="grow" />
        <button type="button" className="ibtn" aria-label="刷新" title="重读名册、CURRENT、GitHub 与会话统计" disabled={loading} onClick={refresh}><RefreshCw /></button>
        <button type="button" className="ibtn" aria-label="设置" title="设置：目录与扫描" onClick={goSettings}><Settings2 /></button>
      </header>

      <SourceReadError title="项目空间" error={error} retained={!!data} onRetry={() => load()} />

      {data?.roster?.state === "error" ? (
        <p className="ps-roster-error" role="status">名册读不到：{data.roster.message}（{data.roster.path}）
          <button type="button" className="g5-link" onClick={goSettings}>去设置</button></p>
      ) : (
        <div className="g5-stage">
          <section className="g5-rack" aria-label="项目图鉴">
            <div className="g5-carts" role="tablist" aria-label="选择项目">
              {items.map((p, k) => <Cart key={p.id} item={p} index={k} on={p.id === item?.id} pressed={pressed === p.id}
                skillsOn={skillsOn} onSelect={select} onKeyDown={onCartKey} />)}
              {!data && loading && <p className="ps-loading">读取名册中…</p>}
            </div>
          </section>
          {item && (
            <section className="g5-screen" id="ps-screen" ref={screen} role="tabpanel" aria-labelledby={`ps-tab-${item.id}`} aria-live="polite">
              <span className="scan" aria-hidden="true" />
              <Head item={item} pinBusy={pinBusy} onPin={pin} onDetail={() => setDetail(true)} />
              <Reads item={item} skillsOn={skillsOn} run={`${item.id}-${run}`} />
              <Now item={item} run={run} reduced={reduced} />
              <Chart item={item} days={data.days} />
              <Field item={item} usage={data.skillUsage?.state} open={open} onToggle={() => setOpen((v) => !v)} onSettings={goSettings} />
            </section>
          )}
        </div>
      )}

      <footer className="g5-foot">
        <button type="button" className="g5-link" disabled={!item} onClick={openLaunch}>复制接手口令</button>
        <span className="grow" />
        <span className="g5-receipt" role="status">{receipt}</span>
      </footer>

      {launch && item && (
        <Dialog title={`复制接手口令 · ${item.name}`} onClose={() => setLaunch(false)}>
          {statusItem ? (
            <ProjectLaunch item={statusItem} state={state} collection={collection} agent={agent} onAgent={setAgent}
              openApp={openApp} onOpenApp={setOpenApp} adoptState={adoptState} notify={notify}
              refreshProjectStatus={refreshProjectStatus} statusReading={!projectStatus.loaded}
              readFailed={!!projectStatus.error} sourceKey={projectStatus.sourceKey} speaker={null} />
          ) : (
            <p className="detail-footnote">接手口令只给置顶的项目准备（要先读到它的 CURRENT 与状态）。{item.projectId ? "先置顶这个项目再来复制。" : "这个项目还没在设置里扫描登记。"}</p>
          )}
        </Dialog>
      )}

      {detail && project && (
        <Dialog title={project.name} drawer onClose={() => setDetail(false)}>
          <div className="asset-form pj-detail">
            <header><h2>{item.name}</h2><p className="detail-footnote">{item.path}</p></header>
            {statusItem && <section aria-label="状态"><h3>状态</h3><CurrentBlock current={statusItem.current} />{statusItem.safety?.checks?.git && <SafetyBlock safety={statusItem.safety} />}</section>}
            <section aria-label="位置"><h3>位置</h3><ProjectLocations key={project.id} project={project} state={state} adoptState={adoptState} notify={notify} /></section>
            <section aria-label="连接"><h3>连接</h3><ProjectContext key={project.id} project={project} state={state} adoptState={adoptState} notify={notify} /></section>
            <section aria-label="规则"><h3>规则</h3><ProjectRules project={project} state={state} installs={ruleInstalls} refresh={refreshRuleInstalls} /></section>
          </div>
        </Dialog>
      )}
    </div>
  );
}
