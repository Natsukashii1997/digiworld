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
const md = (d) => (d ? `${+d.slice(5, 7)}/${+d.slice(8, 10)}` : "");
// 走线画两层：底层常显（选中时发光），上层是选中那一刻跑一遍的电流（pathLength=100 方便按帧推进）
const TRACES = ["M0 18H34l10 10H86l8-8h46", "M0 46h12l6 6v54l6 6h34", "M140 52h-22l-8 8v52", "M58 0v14", "M88 0v20", "M112 120V96l8-8h20", "M0 118h70l6-6h26"];
const VIAS = [[34, 18], [94, 20], [18, 52], [110, 60], [76, 112], [112, 96]];

// 液晶数：滚动到位（useCountUp 按帧跳），始终补足两位。点阵按原尺寸画（px 取整数），不用 CSS 缩放，像素才不会忽粗忽细。
// 不用逐格渐亮（boot）：Safari 里新点亮的格子动画结束后不重绘，会停在半透明。
function Count({ value, run, px = 3 }) {
  const shown = useCountUp(String(value), run);
  return <LcdText text={pad2(shown)} px={px} label={String(value)} />;
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

function Cart({ item, on, pressed, skillsOn, onSelect, onKeyDown }) {
  const hue = projectHue(item), wait = item.pending;
  const issues = wait ? "··" : item.github?.state === "ok" ? pad2(item.github.issues.open) : item.github?.state === "none" ? "—" : "?";
  const skills = wait ? "··" : skillsOn && item.skills ? pad2(item.skills.skills.length) : "—";
  const flag = wait ? { text: "读取中…" } : item.attention;
  return (
    <button type="button" role="tab" id={`ps-tab-${item.id}`} aria-controls="ps-screen" aria-selected={on} tabIndex={on ? 0 : -1}
      className={`g5-cart cart-x pcb${pressed ? " press" : ""}${wait ? " wait" : ""}`} data-ps-cart={item.id} style={{ "--hue": hue.hue }}
      aria-label={`${item.name}：${flag.text}`} onClick={() => onSelect(item.id)} onKeyDown={onKeyDown}>
      <span className="board">
        <Trace />
        <span className="chip"><span className="g5-mono"><Mono code={hue.code} /></span></span>
        <span className="tx">
          <span className="nm"><b title={item.name}>{item.name}</b>{item.pinned && <i className="pin" data-ps-pin title="已置顶" />}</span>
          <span className="sub">{hue.sub || item.path}</span>
        </span>
        <span className="no">{pad2(item.no)}</span>
      </span>
      <span className="cshell">
        <i className={`led pwr${item.lit ? " on" : ""}`} title={item.lit ? "近 7 天有提交" : "近 7 天没有提交"} />
        <span className="flag"><span className={flag.warn ? "warn" : ""}>{flag.text}</span></span>
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
      {value == null ? <b className="dash">—</b> : <span className={`lcd ${tone}`}><Count value={(value)} run={run} px={4} /></span>}
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

// 分节标题（样稿 7F）：序号芯片 + 中文标题 + 英文小字 + 细线；k 取每节的代表色。
function SecH({ no, title, en, k, children }) {
  return (
    <h3 className={`ps-sec-h k-${k}`}>
      <i className="idx" aria-hidden="true">{no}</i><b>{title}</b><span className="en" aria-hidden="true">{en}</span>
      <span className="rule" aria-hidden="true" />{children}
    </h3>
  );
}

function Now({ item, run, reduced }) {
  const now = item.now, next = item.next;
  const meta = !now ? "" : now.src === "CURRENT" ? [md(now.date), now.by, "取自 CURRENT 顶节"].filter(Boolean).join(" · ") : `${md(now.date)} · 最近提交（${now.why || "没有 CURRENT"}）`;
  const gh = item.github, iss = gh.state === "ok" ? gh.issues : null;
  // 下一步下面的小清单：三项读数，0 的置灰；读不到的写“—”。
  const todo = [
    ["未推送提交", item.unpushed, "warn"],
    ["待合并 PR", gh.state === "ok" ? gh.prs : null, ""],
    ["开着的 issue（含待分流）", iss ? iss.open : null, ""],
  ];
  const explicit = ["agent", "human", "top", "table"].includes(next.src);
  return (
    <div className="ps-nn">
      <div>
        <SecH no="01" title="现在" en="NOW" k="now" />
        {now ? (
          <>
            <p className="ps-now-ttl">{now.title}</p>
            <p className="ps-meta">{meta}</p>
            {!!now.facts?.length && (
              <dl className="ps-facts">
                {now.facts.map((f) => <React.Fragment key={f.k}><dt>{f.k}</dt><dd>{f.v}</dd></React.Fragment>)}
              </dl>
            )}
            {!!now.earlier?.length && (
              <ul className="ps-earlier" aria-label="之前几节">
                {now.earlier.map((e) => <li key={e.title + e.date}><time>{md(e.date) || "—"}</time>{e.title}</li>)}
              </ul>
            )}
          </>
        ) : <p className="ps-now-ttl none">{item.dir === "missing" ? "本机找不到目录" : "读不到 CURRENT 与提交"}</p>}
      </div>
      <div className={next.stale ? "warn" : ""}>
        <SecH no="02" title="下一步" en="NEXT" k="next">{next.stale && <span className="tag">可能过期</span>}</SecH>
        <p className={`ps-next${next.src === "none" ? " none" : ""}`} data-ps-next>
          {next.url ? <a href={next.url} target="_blank" rel="noreferrer"><Typed text={next.text} run={run} reduced={reduced} /></a> : <Typed text={next.text} run={run} reduced={reduced} />}
        </p>
        {next.from && <p className="ps-meta">{next.from}{next.stale && next.date ? ` · 停在 ${md(next.date)}` : ""}</p>}
        <ul className="ps-todo">
          {todo.map(([label, n, tone]) => (
            <li key={label} className={n ? tone : "mute"}><i className="dot" />{label}<span className="n">{n ?? "—"}</span></li>
          ))}
        </ul>
        {!explicit && <p className="ps-hint">在 CURRENT 顶节写一行「下一步：…」，这里会优先显示它。</p>}
      </div>
    </div>
  );
}

// 近 30 天提交（样稿 7F）：横向热力条，一格一天；深浅按当期最多那天分四档。下方四个读数 + 图例。
function heatLevel(n, max) {
  if (!n) return "";
  const r = n / max;
  return r <= 0.25 ? "l1" : r <= 0.5 ? "l2" : r <= 0.75 ? "l3" : "l4";
}
function commitStats(xs, days) {
  let best = { n: 0, from: -1, to: -1 }, run = 0;
  xs.forEach((n, k) => {
    run = n ? run + 1 : 0;
    if (run > best.n) best = { n: run, from: k - run + 1, to: k };
  });
  const today = new Date(days[days.length - 1] + "T00:00:00");
  const since = (today.getDay() + 6) % 7; // 本周已过几天（周一 = 0）
  const sum = (a, b) => xs.slice(Math.max(0, a), Math.max(0, b)).reduce((t, n) => t + n, 0);
  const end = xs.length;
  return { streak: best, week: sum(end - 1 - since, end), lastWeek: sum(end - 8 - since, end - 1 - since) };
}
const WEEKDAY = "日一二三四五六";
function Chart({ item, days }) {
  const c = item.commits;
  if (c.state !== "ok")
    return <section className="g7-sec g7-chart"><SecH no="03" title="近 30 天提交" en="COMMITS" k="git"><span className="sum">{c.state === "none" ? "不是 Git 仓库" : c.message || "读不到"}</span></SecH></section>;
  const xs = c.days, max = Math.max(1, ...xs), peak = c.peak?.n ? days.indexOf(c.peak.date) : -1;
  const st = commitStats(xs, days), last = xs.length - 1;
  const dow = (k) => new Date(days[k] + "T00:00:00").getDay();
  return (
    <section className="g7-sec g7-chart">
      <SecH no="03" title="近 30 天提交" en="COMMITS" k="git">
        <span className="sum">{c.total ? <><b>{c.total}</b> 次 · <b>{c.activeDays}</b> 天有提交</> : "没有提交"}</span>
      </SecH>
      <div className="ps-heat" role="img" aria-label={`近 30 天每日提交热力图，共 ${c.total} 次`}>
        {xs.map((n, k) => (
          <i key={days[k]} title={`${md(days[k])}：${n} 次提交`} data-n={k === peak ? n : undefined}
            className={[heatLevel(n, max) || ([0, 6].includes(dow(k)) ? "we" : ""), k === last ? "today" : "", k === peak ? "peak" : ""].filter(Boolean).join(" ") || undefined} />
        ))}
      </div>
      <div className="ps-heat-axis" aria-hidden="true">
        {xs.map((_, k) => <span key={days[k]} className={k === last ? "td" : undefined}>{k === last ? "今天" : dow(k) === 1 && k < last - 1 ? md(days[k]) : ""}</span>)}
      </div>
      <div className="ps-heat-foot">
        <div><small>最多的一天</small><strong>{c.peak?.n || 0}<span>次</span></strong><em>{c.peak?.n ? `${md(c.peak.date)} 周${WEEKDAY[dow(peak)]}` : "—"}</em></div>
        <div><small>最长连续</small><strong>{st.streak.n}<span>天</span></strong><em>{st.streak.n ? `${md(days[st.streak.from])} – ${md(days[st.streak.to])}` : "—"}</em></div>
        <div><small>本周</small><strong>{st.week}<span>次</span></strong><em>上周 {st.lastWeek} 次</em></div>
        <div><small>有提交的日子平均</small><strong>{c.activeDays ? Math.round(c.total / c.activeDays) : 0}<span>次 / 天</span></strong><em>30 天里 {c.activeDays} 天有提交</em></div>
        <div className="legend" aria-hidden="true">少<i className="l0" /><i className="l1" /><i className="l2" /><i className="l3" /><i className="l4" />多<i className="tk" />今天</div>
      </div>
    </section>
  );
}

// 实战排行榜的奖牌（样稿 7F）：第 1 名像素皇冠，第 2、3 名带 V 形绶带的奖牌，数字挖空。
const MEDAL_DIGITS = { 2: [".##.", "#..#", "...#", "..#.", ".#..", "####"], 3: ["###.", "...#", ".##.", "...#", "...#", "###."] };
const MEDAL_ROWS = { 4: [3, 8], 5: [2, 9], 12: [2, 9], 13: [3, 8] };
function Medal({ rank }) {
  if (rank === 1)
    return (
      <svg width="30" height="24" viewBox="0 0 10 8" fill="currentColor" shapeRendering="crispEdges" aria-hidden="true">
        {[[0, 1, 1, 1], [9, 1, 1, 1], [4, 0, 2, 1], [0, 2, 1, 4], [9, 2, 1, 4], [1, 3, 1, 3], [8, 3, 1, 3], [2, 4, 1, 2], [7, 4, 1, 2], [4, 1, 2, 5], [3, 3, 1, 3], [6, 3, 1, 3], [0, 6, 10, 2]]
          .map(([x, y, w, h]) => <rect key={`${x}-${y}`} x={x} y={y} width={w} height={h} />)}
        <rect x="4" y="6" width="2" height="1" fill="var(--bg)" />
      </svg>
    );
  const cells = [];
  for (let y = 0; y < 4; y++) cells.push(<rect key={`l${y}`} x={1 + y} y={y} width="2" height="1" opacity=".55" />, <rect key={`r${y}`} x={9 - y} y={y} width="2" height="1" opacity=".55" />);
  for (let y = 4; y < 14; y++) { const [a, b] = MEDAL_ROWS[y] || [1, 10]; cells.push(<rect key={`c${y}`} x={a} y={y} width={b - a + 1} height="1" />); }
  MEDAL_DIGITS[rank].forEach((row, dy) => [...row].forEach((ch, dx) => ch === "#" && cells.push(<rect key={`d${dx}-${dy}`} x={4 + dx} y={6 + dy} width="1" height="1" fill="var(--bg)" />)));
  return <svg width="30" height="35" viewBox="0 0 12 14" fill="currentColor" shapeRendering="crispEdges" aria-hidden="true">{cells}</svg>;
}

const BOARD = 7; // 右侧榜单行数（第 4–10 名）
function Field({ item, usage, scanning, open, onToggle, onSettings }) {
  const s = item.skills;
  const head = (sum) => <SecH no="04" title="实战" en="SKILLS" k="skill"><span className="sum">{sum}</span></SecH>;
  if (usage !== "ok")
    return (
      <section className="g7-sec g7-field">
        <SecH no="04" title="实战" en="SKILLS" k="skill">
          <span className="sum">读取会话里的技能使用：{usage === "empty" ? (scanning ? "统计中…（会话记录较多，统计完自动换上）" : "还没有统计") : usage === "error" ? "读取失败 · 点刷新重试" : "未开启"}</span>
          {usage === "off" && <button type="button" className="g5-link" onClick={onSettings}>去设置</button>}
        </SecH>
      </section>
    );
  const codex = !!s?.codex?.length && <p className="g7-codex"><b>Codex 点名</b>{s.codex.map((c) => `${c.name} ×${c.n}`).join(" · ")}<span>仅参考</span></p>;
  if (!s?.skills.length)
    return <section className="g7-sec g7-field">{head("近 30 天没有调用技能的会话")}{codex && <div className="ps-board-foot">{codex}</div>}</section>;
  const top = s.skills.slice(0, 3), rest = s.skills.slice(3), more = rest.length - BOARD;
  const rows = open ? rest : rest.slice(0, BOARD), maxN = s.skills[0].n;
  return (
    <section className="g7-sec g7-field">
      {head(<><b>{s.skills.length}</b> 个技能 · <b className="v">{s.calls}</b> 次调用 · <b>{s.sessions}</b> 个会话 · 近 30 天</>)}
      <div className={`ps-board${rest.length ? "" : " solo"}`}>
        <ol className="ps-podium" aria-label="调用最多的前三个技能">
          {top.map((x, k) => (
            <li key={x.name} className={`r${k + 1}`}>
              {k === 0 && <span className="mvp" aria-hidden="true">MVP</span>}
              <span className="medal" aria-label={`第 ${k + 1} 名`} role="img"><Medal rank={k + 1} /></span>
              <span className="nm" title={x.name}>{x.name}</span>
              <span className="cnt">{x.n}<small>次{x.last ? ` · ${x.last.slice(5)}` : ""}</small></span>
              <span className="src">{x.src}</span>
              <span className="bar" aria-hidden="true"><i style={{ width: `${Math.round((x.n / maxN) * 100)}%` }} /></span>
            </li>
          ))}
        </ol>
        {!!rest.length && (
          <ol className={`ps-rank${rows.length >= BOARD ? " fill" : ""}`} start={4} style={{ "--rows": rows.length }}>
            {rows.map((x, k) => (
              <li key={x.name}>
                <span className="no">{String(k + 4).padStart(2, "0")}</span>
                <span className="nm" title={x.name}>{x.name}<small>{x.src}</small></span>
                <span className="pips" aria-hidden="true">{Array.from({ length: 10 }, (_, i) => <i key={i} className={i < Math.ceil((x.n / maxN) * 10) ? "on" : ""} />)}</span>
                <span className="n">{x.n}<small> 次</small></span>
                <span className="d">{x.last.slice(5)}</span>
              </li>
            ))}
          </ol>
        )}
      </div>
      {(codex || more > 0) && (
        <div className="ps-board-foot">
          {codex || <span />}
          {more > 0 && <button type="button" className="g5-more" aria-expanded={open} onClick={onToggle}>{open ? "收起" : `其余 ${more} 个 ▾`}</button>}
        </div>
      )}
    </section>
  );
}

function Head({ item, pinBusy, onPin, onDetail }) {
  const hue = projectHue(item), doc = item.doc || {};
  return (
    <div className="g7-head">
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
  const screen = useRef(null), live = useRef(true), full = useRef(false);
  useEffect(() => () => { live.current = false; }, []);

  const load = useCallback(async (refresh = false) => {
    setLoading(true);
    try {
      // 第一次进来先只读名册把卡带画出来，完整读数到了再替换。
      if (!full.current && !refresh)
        void request("/projects-space?roster=1").then((v) => { if (live.current && !full.current) setData(v); }, () => {});
      const value = await request(refresh ? "/projects-space?refresh=1" : "/projects-space");
      if (!live.current) return null;
      full.current = true;
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
  // 实战在后台统计时，隔几秒看一眼统计有没有更新，更新了重读一次（最多看 5 分钟）。
  const scanning = !!data?.skillUsage?.scanning, scannedAt = data?.skillUsage?.at;
  useEffect(() => {
    if (!scanning) return;
    let n = 0;
    const id = setInterval(async () => {
      if (++n > 75) return clearInterval(id);
      try {
        const u = await request("/projects-space/skill-usage");
        if (u.state === "ok" && u.at !== scannedAt) { clearInterval(id); if (live.current) void load(); }
      } catch {}
    }, 4000);
    return () => clearInterval(id);
  }, [scanning, scannedAt, load]);

  // 世界总览点项目跳过来时，选中对应的那盘。
  useEffect(() => {
    if (!projectJump?.id || !items.length) return;
    const hit = items.find((i) => i.projectId === projectJump.id);
    if (hit) setCurrent(hit.id);
  }, [projectJump?.key, projectJump?.id, items.length, data?.pending]);

  // 档案屏扫描线：换卡带时自上而下刷一遍（按帧），之后藏起来。
  useLayoutEffect(() => {
    const el = screen.current, bar = el?.querySelector(".scan");
    if (!run || reduced || !bar) return;
    const h = el.offsetHeight;
    bar.animate([...Array.from({ length: 11 }, (_, i) => ({ offset: i / 11, opacity: 1, transform: `translateY(${(i / 10) * h}px)`, ...STEP })), { opacity: 0, transform: `translateY(${h}px)` }], { duration: 440 });
    el.querySelectorAll(".ps-rank .pips").forEach((row, k) =>
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
      // 用页面读数时的主库版本：其间主库变了就由服务端拒绝，不拿新版本盖过去。
      const r = await request("/projects-space/pin", { id: item.id, pinned: want, revision: data.revision });
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
      if (!live.current) return;
      setReceipt(e.status === 409 ? `${e.message}（已重新读取，请核对后再点）` : e.message);
      if (e.status === 409) void load();
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
          <span className="cnt"><span className="lcd cyan">{totals ? <Count value={(totals.issues)} run={data?.at} px={3} /> : <b className="dash">—</b>}</span><small>{totals?.issuesPartial ? "开着的 issue · 有项目读不到" : "开着的 issue"}</small></span>
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
              {items.map((p) => <Cart key={p.id} item={p} on={p.id === item?.id} pressed={pressed === p.id}
                skillsOn={skillsOn} onSelect={select} onKeyDown={onCartKey} />)}
            </div>
            {(data?.pending || (!data && loading)) && <p className="ps-loading" role="status">{data ? "读取各项目读数中…" : "读取名册中…"}</p>}
          </section>
          {item && !item.pending && (
            <section className="g5-screen" id="ps-screen" ref={screen} role="tabpanel" aria-labelledby={`ps-tab-${item.id}`} aria-live="polite">
              <span className="scan" aria-hidden="true" />
              <Head item={item} pinBusy={pinBusy} onPin={pin} onDetail={() => setDetail(true)} />
              <Reads item={item} skillsOn={skillsOn} run={`${item.id}-${run}`} />
              <Now item={item} run={run} reduced={reduced} />
              <Chart item={item} days={data.days} />
              <Field item={item} usage={data.skillUsage?.state} scanning={!!data.skillUsage?.scanning} open={open} onToggle={() => setOpen((v) => !v)} onSettings={goSettings} />
            </section>
          )}
        </div>
      )}

      <footer className="g5-foot">
        <button type="button" className="g5-link" disabled={!item || item.pending} onClick={openLaunch}>复制接手口令</button>
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
