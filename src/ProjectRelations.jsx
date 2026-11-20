// 项目空间「项目关系」页签（#79）：上面关系轨道（三圈同心 + 信息卡），下面支撑流桑基（底座 → 产品 → 当前状态），两图联动。
// 只读：数据来自 GET /api/projects-space/relations（#78）；关系以数字分身名册为准，另从各项目 AGENTS.md 和技能调用统计自动读出。
// 视觉照定稿 docs/design/projects-space-v3/项目关系-定稿.html；配色在 project-relations-palette.js，样式层只用令牌。
// 动效：圆环画出、连线依次描出、节点弹出、流带淡入；高亮连线上光点流动、桑基高亮流带上细光移动、选中节点呼吸。减少动态效果时全部不做，直接显示终态。
import React, { forwardRef, useCallback, useEffect, useImperativeHandle, useLayoutEffect, useMemo, useRef, useState } from "react";
import { sankey as d3sankey, sankeyLinkHorizontal } from "d3-sankey";
import { SourceReadError } from "./components.jsx";
import { request } from "./api.js";
import { useReducedMotion } from "./v14.jsx";
import { INFERRED, KIND, NONE_BASE, STATUS, SWEEP, TYPE, baseHue, statusOf, typeOf } from "./project-relations-palette.js";
import "./project-relations.css";

// 第一次切到「项目关系」才读；之后切回来沿用上次读数，点页头刷新才重读。
export function useRelations(active) {
  const [data, setData] = useState(null), [error, setError] = useState(""), [loading, setLoading] = useState(false);
  const live = useRef(true), asked = useRef(false);
  useEffect(() => () => { live.current = false; }, []);
  const load = useCallback(async (refresh = false) => {
    asked.current = true;
    setLoading(true);
    try {
      const value = await request(refresh ? "/projects-space/relations?refresh=1" : "/projects-space/relations");
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
  useEffect(() => { if (active && !asked.current) void load(); }, [active, load]);
  return { data, error, loading, load };
}

const hhmm = (iso) => { const d = new Date(iso); return Number.isNaN(+d) ? "" : `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`; };
const rosterLabel = (v) => (v ? (/^\d/.test(v) ? `v${v}` : v) : "");
const AUTO = new Set(["agents", "skills"]);

// 页头右侧：项目数、关系数、近 30 天产品提交、名册版本与读取时间。
export function RelationStats({ data }) {
  const nodes = data?.nodes || [], edges = data?.edges || [];
  const products = nodes.filter((n) => n.type === "product" && typeof n.c30 === "number");
  const commits = products.length ? products.reduce((a, n) => a + n.c30, 0) : null;
  const ver = rosterLabel(data?.roster?.version), at = data?.at ? hhmm(data.at) : "";
  return (
    <div className="pr-stats" aria-live="polite">
      <span><b>{data ? nodes.length : "—"}</b>项目</span>
      <span><b>{data ? edges.length : "—"}</b>关系</span>
      <span><b>{commits ?? "—"}</b>近 30 天产品提交</span>
      {(ver || at) && <span className="src">{[ver && `名册 ${ver}`, at && `读取于 ${at}`].filter(Boolean).join(" · ")}</span>}
    </div>
  );
}

// ---------------- 悬停提示（自己管自己的状态，图不跟着重画） ----------------
const Tip = forwardRef(function Tip(_, ref) {
  const [tip, setTip] = useState(null);
  const el = useRef(null);
  useImperativeHandle(ref, () => ({ show: (e, content) => setTip({ x: e.clientX, y: e.clientY, content }), hide: () => setTip(null) }), []);
  useLayoutEffect(() => {
    const box = el.current;
    if (!tip || !box) return;
    box.style.left = `${Math.max(8, Math.min(tip.x + 14, innerWidth - box.offsetWidth - 12))}px`;
    box.style.top = `${Math.max(8, Math.min(tip.y + 14, innerHeight - box.offsetHeight - 12))}px`;
  }, [tip]);
  return <div ref={el} className={`pr-tip${tip ? " on" : ""}`} role="tooltip" aria-hidden={!tip}>{tip?.content}</div>;
});

// ---------------- 关系轨道 ----------------
const W = 900, H = 660, C = { x: 450, y: 330 }; // 左栏画布：轨道居中，信息卡在右侧信息轨
const RING = { infrastructure: 104, capability: 200, product: 296 };
const OFFSET = { product: -Math.PI / 2, capability: -Math.PI / 2 + 0.6, infrastructure: Math.PI / 6 };
const RING_LABEL = { infrastructure: -30, capability: -122, product: -108 };
const ringOf = (type) => (type === "infrastructure" || type === "capability" ? type : "product"); // 未分类放外圈
const pillWidth = (name) => [...name].reduce((a, ch) => a + (ch.charCodeAt(0) > 255 ? 12.5 : 7.2), 0) + 32;

function orbitLayout(nodes) {
  const pos = {};
  for (const ring of ["infrastructure", "capability", "product"]) {
    const list = nodes.filter((n) => ringOf(n.type) === ring);
    list.forEach((n, i) => {
      const a = OFFSET[ring] + (i * 2 * Math.PI) / list.length;
      pos[n.id] = { x: C.x + RING[ring] * Math.cos(a), y: C.y + RING[ring] * Math.sin(a) };
    });
  }
  return pos;
}
// 二次贝塞尔：控制点向圆心收 75%（C + (中点 − C) × 0.25）；长度用于「依次描出」动效。
function curve(s, t) {
  const q = { x: C.x + ((s.x + t.x) / 2 - C.x) * 0.25, y: C.y + ((s.y + t.y) / 2 - C.y) * 0.25 };
  let len = 0, px = s.x, py = s.y;
  for (let k = 1; k <= 24; k++) {
    const u = k / 24, x = (1 - u) ** 2 * s.x + 2 * (1 - u) * u * q.x + u ** 2 * t.x, y = (1 - u) ** 2 * s.y + 2 * (1 - u) * u * q.y + u ** 2 * t.y;
    len += Math.hypot(x - px, y - py); px = x; py = y;
  }
  return { d: `M${s.x},${s.y}Q${q.x},${q.y} ${t.x},${t.y}`, len: Math.ceil(len) };
}

function Orbit({ nodes, edges, kinds, focus, sel, entered, reduced, onHover, onSelect, tip }) {
  const pos = useMemo(() => orbitLayout(nodes), [nodes]);
  const byId = useMemo(() => Object.fromEntries(nodes.map((n) => [n.id, n])), [nodes]);
  const paths = useMemo(() => edges.map((e) => (pos[e.from] && pos[e.to] ? curve(pos[e.from], pos[e.to]) : null)), [edges, pos]);
  const on = edges.filter((e) => kinds.has(e.kind));
  const near = focus ? new Set([focus, ...on.filter((e) => e.from === focus).map((e) => e.to), ...on.filter((e) => e.to === focus).map((e) => e.from)]) : null;
  const linkTip = (e) => <>
    <b>{byId[e.from]?.name} → {byId[e.to]?.name}</b>
    <span className="k">{KIND[e.kind]?.label}{e.inferred ? " · 推断" : ""}{AUTO.has(e.origin) ? " · 自动读取" : ""}</span>
    {e.note && <div>{e.note}</div>}<div className="k">出处：{e.source}</div></>;
  const toggle = (id) => onSelect(sel === id ? null : id);
  return (
    <svg className={`pr-orbit${focus ? " focus" : ""}`} viewBox={`0 0 ${W} ${H}`} role="group" aria-label="关系轨道：内圈基础设施、中圈能力、外圈产品">
      <defs>
        <radialGradient id="pr-core"><stop offset="0" stopColor={TYPE.infrastructure.color} stopOpacity=".16" /><stop offset="1" stopColor={TYPE.infrastructure.color} stopOpacity="0" /></radialGradient>
        <pattern id="pr-grid" width="40" height="40" patternUnits="userSpaceOnUse"><path d="M40 0H0V40" fill="none" stroke="rgba(120,140,190,.04)" /></pattern>
      </defs>
      <rect className="pr-bg" width={W} height={H} fill="url(#pr-grid)" onClick={() => onSelect(null)} />
      <circle cx={C.x} cy={C.y} r="150" fill="url(#pr-core)" pointerEvents="none" />
      {Object.entries(RING).map(([t, r]) => {
        const a = (RING_LABEL[t] * Math.PI) / 180;
        return <g key={t} pointerEvents="none">
          <circle className={`ring${entered ? "" : " spin"}`} cx={C.x} cy={C.y} r={r} />
          <text className="ringlab" x={C.x + r * Math.cos(a)} y={C.y + r * Math.sin(a) + 4} textAnchor="middle">{TYPE[t].label}</text>
        </g>;
      })}
      {edges.map((e, i) => {
        const p = paths[i];
        if (!p) return null;
        const off = !kinds.has(e.kind), hot = !!focus && !off && (e.from === focus || e.to === focus);
        return <path key={i} id={`pr-lk-${i}`} className={`lk${e.inferred || e.kind === "apart" ? " d" : ""}${off ? " off" : ""}${hot ? " hot" : ""}${entered ? "" : " draw"}`}
          style={{ "--len": p.len, animationDelay: `${350 + i * 22}ms` }} stroke={KIND[e.kind]?.color || INFERRED} d={p.d}
          onMouseMove={(ev) => tip.current?.show(ev, linkTip(e))} onMouseLeave={() => tip.current?.hide()} />;
      })}
      <g pointerEvents="none">
        {!reduced && focus && edges.map((e, i) => {
          if (!paths[i] || !kinds.has(e.kind) || (e.from !== focus && e.to !== focus)) return null;
          const c = KIND[e.kind]?.color || INFERRED;
          return [0, 1].map((k) => <circle key={`${i}-${k}`} className="pt" r="3" fill={c} style={{ filter: `drop-shadow(0 0 4px ${c})` }}>
            <animateMotion dur={`${1.8 + k * 0.3}s`} begin={`${k * 0.9}s`} repeatCount="indefinite"><mpath href={`#pr-lk-${i}`} /></animateMotion>
          </circle>);
        })}
      </g>
      {nodes.map((n, i) => {
        const p = pos[n.id], c = typeOf(n.type).color, w = pillWidth(n.name);
        return <g key={n.id} className={`nd${entered ? "" : " in"}${near?.has(n.id) ? " hot" : ""}${sel === n.id ? " sel" : ""}`} data-id={n.id}
          style={{ "--t": `translate(${p.x}px,${p.y}px)`, animationDelay: `${i * 40}ms` }} transform={`translate(${p.x},${p.y})`}
          tabIndex={0} role="button" aria-pressed={sel === n.id} aria-label={`${n.name}（${typeOf(n.type).label}）`}
          onMouseEnter={() => onHover(n.id)} onMouseLeave={() => onHover(null)}
          onClick={(ev) => { ev.stopPropagation(); toggle(n.id); }}
          onKeyDown={(ev) => { if (ev.key === "Enter" || ev.key === " ") { ev.preventDefault(); toggle(n.id); } else if (ev.key === "Escape") onSelect(null); }}>
          <rect className="glow" x={-w / 2 - 4} y="-17" width={w + 8} height="34" rx="17" fill={c} />
          <rect className="pill" x={-w / 2} y="-13" width={w} height="26" rx="13" fill="#141b30" stroke={c} strokeOpacity=".6" />
          <circle cx={-w / 2 + 12} cy="0" r="4" fill={c} />
          <text x={-w / 2 + 21} y="4">{n.name}</text>
        </g>;
      })}
    </svg>
  );
}

// ---------------- 右侧信息轨 ----------------
// 优先级：桑基里悬停的节点 → 轨道里悬停 / 选中的项目（读数、全部关系，再接它的支撑链）→ 全局概览。
const Bar = ({ name, val, w, c }) => <div className="row" style={{ "--c": c }}><b>{name}</b><small>{val}</small>
  <span className="track"><i style={{ width: `${Math.max(2, Math.min(100, w * 100))}%` }} /></span></div>;
const totalOf = (sk) => sk.nodes.filter((x) => x.kind === "proj").reduce((a, x) => a + x.real, 0);
const pctOf = (v, t) => (t ? `${Math.round((v / t) * 100)}%` : "—");

// 桑基节点的明细：产品＝来自哪些底座、流向哪个状态；底座＝支撑的产品；状态＝处在这个状态的产品。head＝false 时只给链路部分（接在项目信息下面）。
function FlowDetail({ n, sk, head = true }) {
  const total = totalOf(sk);
  if (n.kind === "proj") {
    const ins = n.targetLinks, st = n.sourceLinks[0]?.target, bases = ins.filter((l) => l.source.ref !== "none").length;
    return <>
      {head && <><div><h3 style={{ "--c": n.hue }}><i />{n.name}</h3><p className="meta">产品{st ? ` · ${st.name}` : ""}</p></div>
        <div className="nums"><div><small>30 天提交</small><b>{Math.round(n.real)}</b></div><div><small>占全部</small><b>{pctOf(n.real, total)}</b></div><div><small>底座</small><b>{bases}</b></div></div></>}
      <h4>支撑来自</h4>
      <div className="share">{ins.map((l) => <Bar key={l.index} name={l.source.name} val={fmt(l.real)} w={n.real ? l.real / n.real : 1 / ins.length} c={l.source.hue} />)}</div>
      {st && <><h4>去向</h4><ul><li className="none" style={{ "--c": st.hue }}><em>→ 状态</em><b>{st.name}</b><span>{Math.round(n.real)} 次提交全部流向这里</span></li></ul></>}
    </>;
  }
  const kids = (n.kind === "base" ? n.sourceLinks.map((l) => ({ l, o: l.target })) : n.targetLinks.map((l) => ({ l, o: l.source }))).sort((a, b) => b.l.real - a.l.real);
  return <>
    {head && <div><h3 style={{ "--c": n.hue }}><i />{n.name}</h3><p className="meta">{n.kind === "base" ? `底座 · 支撑 ${kids.length} 个产品` : `当前状态 · ${kids.length} 个产品`}</p></div>}
    <div className="big"><b>{Math.round(n.real)}</b><span>次提交 · {pctOf(n.real, total)}</span></div>
    <h4>{n.kind === "base" ? "支撑的产品" : "处在这个状态的产品"}</h4>
    <div className="share">{kids.map(({ l, o }) => <Bar key={l.index} name={o.name} val={fmt(l.real)} w={n.real ? l.real / n.real : 0} c={n.kind === "base" ? o.hue : n.hue} />)}</div>
  </>;
}

// 全局概览：近 30 天提交、底座份额、状态分布、没有产品接入的底座、枢纽前三（点了选中）。
function Overview({ sk, nodes, unused, onSelect }) {
  const products = nodes.filter((n) => n.type === "product").length, top = [...nodes].sort((a, b) => b.degree - a.degree).slice(0, 3);
  const total = sk ? totalOf(sk) : 0, bases = sk ? sk.nodes.filter((x) => x.kind === "base") : [], sts = sk ? sk.nodes.filter((x) => x.kind === "st") : [];
  return <>
    <div><h3 style={{ "--c": "var(--text)" }}><i />全局概览</h3><p className="meta">近 30 天 · {products} 个产品</p></div>
    {sk && <>
      <div className="big"><b>{Math.round(total)}</b><span>次产品提交</span></div>
      <h4>底座份额</h4>
      <div className="share">{bases.map((b) => <Bar key={b.key} name={b.name} val={`${Math.round(b.real)} · ${pctOf(b.real, total)}`} w={total ? b.real / total : 0} c={b.hue} />)}</div>
      <h4>当前状态</h4>
      <div className="stack">{sts.map((s) => <i key={s.key} style={{ "--c": s.hue, flexGrow: Math.max(1, s.real) }} />)}</div>
      <div className="keys">{sts.map((s) => <span key={s.key} style={{ "--c": s.hue }}>{s.name} {s.targetLinks.length} 个</span>)}</div>
    </>}
    <p className="note">{unused.length > 0 && <>{unused.join("、")} 目前没有产品接入。</>}点任一项目看它的关系和支撑链；悬停桑基的底座、产品或状态看明细。</p>
    <h4>枢纽</h4>
    <ul>{top.map((n) => <li key={n.id} style={{ "--c": typeOf(n.type).color }}><button type="button" onClick={() => onSelect(n.id)}>
      <em>{String(n.degree).padStart(2, "0")} 条</em><b>{n.name}</b><span>{typeOf(n.type).label}</span></button></li>)}</ul>
  </>;
}

function Info({ focus, flowNode, sk, nodes, edges, kinds, unused, onSelect, onOpen }) {
  const byId = Object.fromEntries(nodes.map((n) => [n.id, n]));
  const wrap = (body) => <div className="pr-info" role="region" aria-label="项目信息" aria-live="polite">{body}</div>;
  if (flowNode && sk) return wrap(<FlowDetail n={flowNode} sk={sk} />);
  if (!focus || !byId[focus]) return wrap(<Overview sk={sk} nodes={nodes} unused={unused} onSelect={onSelect} />);
  const n = byId[focus], rows = edges.filter((e) => kinds.has(e.kind) && (e.from === focus || e.to === focus));
  const up = rows.filter((e) => e.to === focus && e.kind !== "apart").length, down = rows.filter((e) => e.from === focus && e.kind !== "apart").length;
  const chain = sk?.nodes.find((x) => (x.kind === "proj" || x.kind === "base") && x.ref === focus);
  return <div className="pr-info" role="region" aria-label="项目信息" aria-live="polite">
    <div><h3 style={{ "--c": typeOf(n.type).color }}><i />{n.name}</h3>
      <div className="meta">{typeOf(n.type).label}{n.status ? ` · ${n.status.text}` : ""}</div></div>
    {n.agents?.state === "error" && <p className="warn">AGENTS.md 读不到，这个项目引用了哪些底座没能自动读出。</p>}
    <div className="nums"><div><small>30 天提交</small><b>{n.c30 ?? "—"}</b></div><div><small>上游</small><b>{up}</b></div><div><small>下游</small><b>{down}</b></div></div>
    <h4>关系 · {rows.length}</h4>
    <ul>{rows.length ? rows.map((e, i) => {
      const out = e.from === focus, other = byId[out ? e.to : e.from];
      return <li key={i} style={{ "--c": KIND[e.kind]?.color }}><button type="button" onClick={() => onSelect(other.id)}>
        <em>{e.kind === "apart" ? "↔" : out ? "→" : "←"} {KIND[e.kind]?.label}</em>
        <b>{other.name}{AUTO.has(e.origin) && <span className="tag">自动读取</span>}{e.inferred && <span className="tag">推断</span>}</b>
        <span>{[e.note, e.source].filter(Boolean).join(" · ")}</span></button></li>;
    }) : <li className="none"><em>—</em><b>还没有关系</b><span>名册里补 relations，或它的 AGENTS.md 引用底座后自动连上</span></li>}</ul>
    {chain && <><h4 className="chain">支撑链</h4><FlowDetail n={chain} sk={sk} head={false} /></>}
    <button type="button" className="go" onClick={() => onOpen(focus)}>在项目总览打开 →</button>
  </div>;
}

// ---------------- 支撑流桑基 ----------------
const SW = 1200, SH = 600; // 与定稿 H（即 B 通栏长卷那张）同一几何：按比例缩进左栏，文字随之缩小，字号在画布里放大补偿
function flowLayout(data) {
  const nodes = data.nodes, byId = Object.fromEntries(nodes.map((n) => [n.id, n]));
  const links = data.sankey.links, products = nodes.filter((n) => n.type === "product" && links.some((l) => l.project === n.id));
  if (!products.length) return null;
  // 每个产品的提交数；0 或读不到的给一点最小宽度，免得画不出来（标签照实写）。
  const total = Object.fromEntries(products.map((p) => [p.id, links.filter((l) => l.project === p.id).reduce((a, l) => a + l.value, 0)]));
  const shown = (id) => Math.max(total[id], 2);
  const baseTotal = {};
  links.forEach((l) => { baseTotal[l.base] = (baseTotal[l.base] || 0) + l.value; });
  const bases = Object.keys(baseTotal).sort((a, b) => (a === "none") - (b === "none") || baseTotal[b] - baseTotal[a]);
  const statusOfProject = Object.fromEntries(data.sankey.status.map((s) => [s.project, s.key]));
  const keys = Object.keys(STATUS).filter((k) => products.some((p) => (statusOfProject[p.id] || "unknown") === k));
  const N = [], idx = {};
  const add = (key, x) => { idx[key] = N.length; N.push({ key, ...x }); };
  bases.forEach((b) => add(`b:${b}`, { col: 0, kind: "base", ref: b, name: b === "none" ? NONE_BASE.name : byId[b]?.name || b, hue: baseHue(b, byId[b]?.type), real: baseTotal[b] }));
  products.forEach((p) => add(`p:${p.id}`, { col: 1, kind: "proj", ref: p.id, name: p.name, hue: TYPE.product.color, real: total[p.id] }));
  keys.forEach((k) => add(`s:${k}`, { col: 2, kind: "st", ref: k, name: statusOf(k).label, hue: statusOf(k).color,
    real: products.filter((p) => (statusOfProject[p.id] || "unknown") === k).reduce((a, p) => a + total[p.id], 0) }));
  const L = [];
  products.forEach((p) => {
    const own = links.filter((l) => l.project === p.id);
    own.forEach((l) => L.push({ source: idx[`b:${l.base}`], target: idx[`p:${p.id}`], value: shown(p.id) / own.length, real: l.value, p: p.id }));
    L.push({ source: idx[`p:${p.id}`], target: idx[`s:${statusOfProject[p.id] || "unknown"}`], value: shown(p.id), real: total[p.id], p: p.id });
  });
  const layout = d3sankey().nodeId((d) => d.index).nodeWidth(12).nodePadding(14).nodeAlign((d) => d.col).nodeSort(null).extent([[150, 46], [SW - 140, SH - 20]]);
  return layout({ nodes: N, links: L });
}
// 一条链：产品＝它的整条链；底座＝它支撑的产品及这些产品的去向；状态＝流进它的全部链路。
function chainOf(sk, n) {
  const s = new Set();
  if (n.kind === "proj") sk.links.forEach((l) => { if (l.p === n.ref) s.add(l.index); });
  else if (n.kind === "base") n.sourceLinks.forEach((l) => { s.add(l.index); sk.links.forEach((x) => { if (x.p === l.p && x.source.kind === "proj") s.add(x.index); }); });
  else n.targetLinks.forEach((l) => sk.links.forEach((x) => { if (x.p === l.p) s.add(x.index); }));
  return s;
}
// 标签避让：同一列相邻两个标签的包围盒相交时，从上往下依次挤开；挤出画布底，再从下往上收回。
// 包围盒相对节点中线，量自渲染结果（字形框外加 1.5 描边）：单行 [-13.5, 8.4]，两行 [-21, 20]。
// 没有碰撞的标签不动；挤开的标签只上下错开几个单位，仍贴着自己的节点。
const LAB_BOX = { one: [-13.5, 8.4], two: [-21, 20] }, LAB_GAP = 1;
function labelShift(nodes) {
  const dy = {};
  for (const c of [0, 1, 2]) {
    const col = nodes.filter((n) => n.col === c).map((n) => {
      const mid = (n.y0 + n.y1) / 2, [a, b] = LAB_BOX[n.y1 - n.y0 > 26 ? "two" : "one"];
      return { n, mid, a, b, y: mid };
    }).sort((p, q) => p.mid - q.mid);
    for (let i = 1; i < col.length; i++) col[i].y = Math.max(col[i].y, col[i - 1].y + col[i - 1].b - col[i].a + LAB_GAP);
    for (let i = col.length - 1; i >= 0; i--) {
      const floor = i === col.length - 1 ? SH - 2 : col[i + 1].y + col[i + 1].a - LAB_GAP;
      col[i].y = Math.min(col[i].y, floor - col[i].b);
    }
    col.forEach((q) => { dy[q.n.index] = q.y - q.mid; });
  }
  return dy;
}
const fmt = (v) => (Math.round(v * 10) / 10).toString();

// 节点悬停的明细写在右侧信息轨（onHoverNode），不再弹提示；流带悬停仍弹提示写这一段的提交数。
// 质感：一道柔光从左往右扫过流带（渐变平移，4.2 秒一轮）；减少动态效果时不画。
function Flow({ sk, focus, entered, reduced, onPick, onHoverNode, tip }) {
  const [local, setLocal] = useState(null);
  const hot = useMemo(() => {
    if (local) return local;
    if (!focus) return null;
    const n = sk.nodes.find((x) => (x.kind === "proj" || x.kind === "base") && x.ref === focus);
    return n ? chainOf(sk, n) : new Set();
  }, [local, focus, sk]);
  const lit = new Set();
  if (hot) sk.links.forEach((l) => { if (hot.has(l.index)) { lit.add(l.source.index); lit.add(l.target.index); } });
  const path = sankeyLinkHorizontal(), col = (c) => sk.nodes.find((n) => n.col === c);
  const projNode = (id) => sk.nodes.find((x) => x.kind === "proj" && x.ref === id);
  const shift = useMemo(() => labelShift(sk.nodes), [sk]);
  return (
    <svg className={`pr-flow${hot && hot.size ? " focus" : ""}`} viewBox={`0 0 ${SW} ${SH}`} role="group" aria-label="支撑流：底座 → 产品 → 当前状态">
      <defs>{sk.links.map((l) => <linearGradient key={l.index} id={`pr-sg-${l.index}`} gradientUnits="userSpaceOnUse" x1={l.source.x1} x2={l.target.x0}>
        <stop offset="0" stopColor={l.source.hue} /><stop offset="1" stopColor={l.target.hue} /></linearGradient>)}
        {!reduced && <linearGradient id="pr-sweep" gradientUnits="userSpaceOnUse" x1="0" x2="260" y1="0" y2="0">
          <stop offset="0" stopColor={SWEEP} stopOpacity="0" /><stop offset=".5" stopColor={SWEEP} stopOpacity=".55" /><stop offset="1" stopColor={SWEEP} stopOpacity="0" />
          <animateTransform attributeName="gradientTransform" type="translate" from="-300 0" to={`${SW} 0`} dur="4.2s" repeatCount="indefinite" /></linearGradient>}</defs>
      {col(0) && <text className="colh" x={col(0).x1} y="24" textAnchor="end">BASE 底座</text>}
      {col(1) && <text className="colh" x={(col(1).x0 + col(1).x1) / 2} y="24" textAnchor="middle">PRODUCT 产品</text>}
      {col(2) && <text className="colh" x={col(2).x0} y="24">STATUS 当前状态</text>}
      {sk.links.map((l) => {
        const d = path(l), on = !!hot?.has(l.index);
        const show = (ev) => tip.current?.show(ev, <><b>{l.source.name} → {l.target.name}</b>
          <div><span className="k">{l.source.kind === "base" ? "分到的提交" : "提交"}</span> <span className="n">{fmt(l.real)}</span></div></>);
        return <g key={l.index}>
          <path className={`flow${entered ? "" : " grow"}${on ? " hot" : ""}`} style={{ animationDelay: `${400 + l.index * 20}ms` }} d={d}
            stroke={`url(#pr-sg-${l.index})`} strokeWidth={Math.max(1, l.width)} data-p={l.p}
            onMouseEnter={(ev) => { setLocal(new Set(sk.links.filter((x) => x.p === l.p).map((x) => x.index))); onHoverNode(projNode(l.p)); show(ev); }}
            onMouseMove={show} onMouseLeave={() => { setLocal(null); onHoverNode(null); tip.current?.hide(); }} />
          {!reduced && <path className={`sweep${on ? " hot" : ""}`} d={d} stroke="url(#pr-sweep)" strokeWidth={Math.max(1, l.width)} />}
        </g>;
      })}
      {sk.nodes.map((n) => {
        const left = n.col === 0, mid = (n.y0 + n.y1) / 2 + shift[n.index], x =left ? n.x0 - 10 : n.x1 + 10, anchor = left ? "end" : "start", v = Math.round(n.real);
        return <g key={n.key} className={`nd${lit.has(n.index) ? " hot" : ""}${n.kind === "proj" ? " pick" : ""}`} data-node={n.key}
          onMouseEnter={() => { setLocal(chainOf(sk, n)); onHoverNode(n); }} onMouseLeave={() => { setLocal(null); onHoverNode(null); }}
          onClick={() => n.kind === "proj" && onPick(n.ref)}>
          <rect x={n.x0} y={n.y0} width={n.x1 - n.x0} height={Math.max(2, n.y1 - n.y0)} rx="2" fill={n.hue} style={{ filter: `drop-shadow(0 0 6px ${n.hue}66)` }} />
          {n.y1 - n.y0 > 26
            ? <><text className="nlab" x={x} y={mid - 3.5} textAnchor={anchor}>{n.name}</text><text className="nval" x={x} y={mid + 15.5} textAnchor={anchor}>{v} 次提交</text></>
            : <text className="nlab" x={x} y={mid + 4} textAnchor={anchor}>{n.name}<tspan className="nval" dx="8">{v}</tspan></text>}
        </g>;
      })}
    </svg>
  );
}

// ---------------- 页面 ----------------
export function ProjectRelations({ rel, onSettings, onOpen }) {
  const { data, error, loading, load } = rel;
  const reduced = useReducedMotion();
  const [kinds, setKinds] = useState(() => new Set(Object.keys(KIND)));
  const [sel, setSel] = useState(null), [hov, setHov] = useState(null), [flowHov, setFlowHov] = useState(null);
  const [entered, setEntered] = useState(reduced);
  const tip = useRef(null), orbitCard = useRef(null);
  const ok = data?.roster?.state === "ok";
  const nodes = ok ? data.nodes : [], edges = ok ? data.edges : [];
  const sk = useMemo(() => (ok ? flowLayout(data) : null), [ok, data]);
  const focus = hov || sel;

  // 进场动效结束后去掉动画类（连线描出用的虚线长度会盖住「推断」虚线）。
  useEffect(() => {
    if (!ok || entered) return;
    const ms = Math.max(350 + edges.length * 22 + 1100, nodes.length * 40 + 600, 400 + (sk?.links.length || 0) * 20 + 1000, 1200);
    const id = setTimeout(() => setEntered(true), ms);
    return () => clearTimeout(id);
  }, [ok, entered, edges.length, nodes.length, sk]);
  useEffect(() => { if (reduced) setEntered(true); }, [reduced]);
  // 切换数据（刷新）后选中的项目不在了就取消选中。
  useEffect(() => { if (sel && !nodes.some((n) => n.id === sel)) setSel(null); }, [nodes, sel]);

  const toggleKind = (k) => setKinds((s) => { const next = new Set(s); next.has(k) ? next.delete(k) : next.add(k); return next; });
  const pickFromFlow = (id) => {
    setSel(id);
    orbitCard.current?.scrollIntoView({ behavior: reduced ? "auto" : "smooth", block: "center" });
  };
  const visible = edges.filter((e) => kinds.has(e.kind)).length;
  const unused = ok ? data.sankey.unusedBases.map((id) => nodes.find((n) => n.id === id)?.name || id) : [];
  const statusKeys = sk ? sk.nodes.filter((n) => n.kind === "st").map((n) => n.ref) : [];

  return (
    <div className="pr-page" id="pr-panel" role="tabpanel" aria-labelledby="ps-page-relations">
      <SourceReadError title="项目关系" error={error} retained={!!data} onRetry={() => load()} />
      {!data && loading && <p className="ps-loading" role="status">读取名册、各项目 AGENTS.md 与读数中…</p>}
      {data?.roster?.state === "error" && (
        <p className="ps-roster-error" role="status">名册读不到：{data.roster.message}（{data.roster.path}）
          <button type="button" className="g5-link" onClick={onSettings}>去设置</button></p>
      )}
      {ok && (
        <>
        <div className="pr-duo">
          <div className="pr-charts">
          <section className="pr-card pr-orbit-card" aria-label="项目关系图" ref={orbitCard}>
            <div className="pr-head"><h2>RELATION ORBIT</h2>
              <span className="crumb">项目之间 · {nodes.length} 个项目 · {visible} 条关系</span><span className="grow" />
              <span className="pr-legend">
                {["product", "capability", "infrastructure"].map((t) => <span key={t} className="tg" style={{ "--c": TYPE[t].color }}><span className="pill"><i />{TYPE[t].label}</span></span>)}
                <span className="sep" aria-hidden="true" />
                {Object.entries(KIND).map(([k, v]) => <button key={k} type="button" className="tg" aria-pressed={kinds.has(k)} style={{ "--c": v.color }} onClick={() => toggleKind(k)}
                  title={kinds.has(k) ? `隐藏「${v.label}」` : `显示「${v.label}」`}><span className="pill"><s className={k === "apart" ? "d" : ""} />{v.label}</span></button>)}
                <span className="tg" style={{ "--c": INFERRED }}><span className="pill"><s className="d" />推断</span></span>
              </span>
            </div>
            {!edges.length && <p className="pr-empty">还没有关系：名册里补 relations，或项目 AGENTS.md 引用底座后自动连上。</p>}
            <div className="pr-scroll">
              <Orbit nodes={nodes} edges={edges} kinds={kinds} focus={focus} sel={sel} entered={entered} reduced={reduced}
                onHover={setHov} onSelect={(id) => { setSel(id); setHov(null); }} tip={tip} />
            </div>
            <span className="pr-hint">内圈基础设施 · 中圈能力 · 外圈产品 ｜ 悬停看关系 · 点击固定 · 点空白处还原</span>
          </section>

          <section className="pr-card" aria-label="底座支撑桑基图">
            <div className="pr-head"><h2>SUPPORT FLOW</h2><span className="crumb">底座 → 产品 → 当前状态 · 宽度＝近 30 天提交</span><span className="grow" />
              <span className="pr-legend">{statusKeys.map((k) => <span key={k} className="tg" style={{ "--c": statusOf(k).color }}><span className="pill"><i />{statusOf(k).label}</span></span>)}</span>
            </div>
            {sk ? <div className="pr-scroll"><Flow sk={sk} focus={focus} entered={entered} reduced={reduced} onPick={pickFromFlow} onHoverNode={setFlowHov} tip={tip} /></div>
              : <p className="pr-empty">名册里还没有标为产品（type: product）的项目，支撑流画不出来。</p>}
          </section>
          </div>
          <aside className="pr-rail" aria-label="信息轨">
            <Info focus={focus} flowNode={flowHov} sk={sk} nodes={nodes} edges={edges} kinds={kinds} unused={unused}
              onSelect={(id) => { setSel(id); setHov(null); }} onOpen={onOpen} />
          </aside>
        </div>
          <p className="pr-foot">上：越靠里越是「底座」，连线向圆心弯；节点颜色＝名册类型，连线颜色＝关系类型，实线有原文出处，虚线是推断或「明确独立」。
            下：{data.sankey.rule}；「引用」以各仓库 AGENTS.md、名册关系和技能调用统计为准。右侧信息轨写当前悬停或选中的明细。
            {unused.length > 0 && <> {unused.map((n, i) => <React.Fragment key={n}>{i ? "、" : ""}<b>{n}</b></React.Fragment>)} 目前没有产品接入，所以不在左栏。</>}</p>
        </>
      )}
      <Tip ref={tip} />
    </div>
  );
}
