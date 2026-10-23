// UI v18 第二轮视觉稿生成器：用真实组件（暴龙机、像素图、液晶字、进化阶段）和 data.json 的真实数据，
// 渲染 B 版静态稿（用户 2026-10-23 选定 B）。左下角伙伴屏由 page.js 用原引擎挂载；运行方式见 build/run.sh。
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import fs from "node:fs";
import path from "node:path";
import { DigiviceArt, Pixel, StageBar, CrestIcon, SPRITES } from "../../../../src/pixel.jsx";
import { LcdText, AgentSprite } from "../../../../src/v14.jsx";
import { countSvg, lcdSvg } from "./lcd-digits.js";
import { WRAP, previewLines, previewMeta } from "./design-preview.js";
import {
  Sun, PenLine, Bookmark, Layers, Folder, Settings2, Search, Plus, Copy, Check, ArrowRight,
  Send, Flame, Archive, Play, ChevronDown, Inbox, Swords, Menu, NotebookPen, X,
} from "lucide-react";

const [, , dataPath, outDir] = process.argv;
const d = JSON.parse(fs.readFileSync(dataPath, "utf8"));
const pad2 = (n) => String(n).padStart(2, "0");
const TYPE = { Prompt: "Prompt", Rule: "规则", Design: "设计", Scroll: "焚决", Workflow: "工作流", Skill: "Skill" };
const HOLDER = { claude: { sprite: "metalgreymon16", name: "机械暴龙兽" }, codex: { sprite: "machinedramon16", name: "机械邪龙兽" } };
const notes = d.eggs.filter((e) => e.kind === "note").length;
const saved = d.eggs.length - notes;
// 示意卡「像素风 Dashboard」（从收藏帖孵化的设计资产）计入数量，README 写明
const demo = { ...d.designExample, glyph: "Design", demo: true };
const assetCount = d.assets.length + 2;
const top = d.assets.filter((a) => a.uses > 0).slice(0, 4);

// 设计类型新像素图 B4（调色板，带拇指孔）。源码 pixel.jsx 留到阶段 3 再改，稿里运行时注册。
SPRITES.DesignV2 = {
  palette: { K: "currentColor", N: "var(--px-glyph-fill)", O: "#ff8a24", C: "#2bb8d6", G: "#6fae3a", Y: "#f2b53a", W: "#ffffff" },
  frames: [[
    "................", ".....KKKKKK.....", "...KKNNNNNNKK...", "..KNOONNNNCCNK..",
    ".KNOWOONNNCWCNK.", ".KNNOONNNNNCCNK.", "KNNNNNNNNNNNNNNK", "KNNKKNNNNNNYYNNK",
    "KNK..KNNNNYWYYNK", "KNK..KNNNNNYYNNK", "KNNKKNNGGNNNNNNK", ".KNNNNGWGGNNNNK.",
    ".KNNNNNGGNNNNNK.", "..KKNNNNNNNNKK..", "....KKKKKKKK....", "................",
  ]],
};
const glyphOf = (a) => (a.glyph === "Design" ? "DesignV2" : a.glyph);

function Side({ active }) {
  const Item = ({ id, icon: Icon, label, count, egg }) => (
    <a className={active === id ? "on" : ""} href="#">
      <Icon />
      {label}
      {count != null && <i className={egg ? "egg" : ""}>{count}</i>}
    </a>
  );
  return (
    <aside className="side">
      <div className="brand">
        <span className="mark"><CrestIcon size={26} /></span>
        <div><b>数码世界</b><small><LcdText text="DIGITAL·WORLD" px={1.6} /></small></div>
      </div>
      <nav className="nav">
        <Item id="home" icon={Sun} label="基地" />
        <p className="grp">捕获</p>
        <Item id="notes" icon={PenLine} label="随手记" count={notes} egg />
        <Item id="saved" icon={Bookmark} label="个人收藏" count={saved} egg />
        <p className="grp">炼化与出战</p>
        <Item id="assets" icon={Layers} label="资产仓库" count={assetCount} />
        <Item id="projects" icon={Folder} label="项目空间" count={d.slots.length} />
      </nav>
      <div className="spacer" />
      <nav className="nav"><Item id="settings" icon={Settings2} label="设置" /></nav>
      {/* 伙伴屏：结构与 src/App.jsx 原样一致，画面由 page.js 调 partner-lcd.js 原引擎绘制（定格在秋季） */}
      <button className="partner" aria-label="伙伴 数码蛋，孵化前；前往世界总览">
        <span className="partner-screen" data-partner-screen aria-hidden="true">
          <span className="lcd-screen lcd-roam"><canvas data-partner="roam" data-start="720" /></span>
        </span>
        <span className="partner-line" aria-hidden="true"><span className="partner-season" data-season-label>秋 · 落叶 · 数码蛋</span></span>
      </button>
      <p className="saved">已保存到本机</p>
    </aside>
  );
}

function MobileTop({ title }) {
  return (
    <header className="mobile-top">
      <Menu size={20} />
      <b>{title}</b>
    </header>
  );
}

function Page({ title, file, css, children, script, bodyClass = "" }) {
  const body = renderToStaticMarkup(children);
  const doc = `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title><link rel="stylesheet" href="common.css"><link rel="stylesheet" href="../../../src/partner-lcd.css"><link rel="stylesheet" href="../../../src/scan-motion.css"><link rel="stylesheet" href="${css}"></head><body${bodyClass ? ` class="${bodyClass}"` : ""}>${body}<script src="page.js"></script>${script ? `<script>${script}</script>` : ""}</body></html>`;
  fs.writeFileSync(path.join(outDir, file), doc);
}

const EggIcon = ({ e, size = 36 }) =>
  e.kind === "note" ? (
    <span className="egg-ico note" style={{ width: size, height: size }}><NotebookPen size={16} /></span>
  ) : (
    <span className="egg-ico cover" style={{ width: size, height: size, backgroundImage: `url(${e.cover})` }} />
  );
const HATCH = [
  [Send, "投递到项目"],
  [Layers, "孵成资产"],
  [Flame, "收入焚决"],
  [Archive, "归档"],
];

function sortedCards() {
  const list = [...d.assets];
  const at = list.findIndex((a) => a.uses < d.scroll.uses);
  list.splice(at < 0 ? list.length : at, 0, { ...d.scroll, scroll: true });
  list.splice(list.findIndex((a) => a.type === "Design") + 1, 0, demo);
  return list;
}
function tabs() {
  const count = (t) => d.assets.filter((a) => a.type === t).length;
  return [["全部", assetCount], ["Prompt", count("Prompt")], ["焚决", 1], ["规则", count("Rule")], ["设计", count("Design") + 1]];
}

// ======================= B · 世界感版 =======================
function TopB({ code, title }) {
  return (
    <div className="b-top">
      <span className="b-crumb">数码世界 <i>/</i> <span className="b-code-s">{code}</span> {title}</span>
      <label className="search b-search"><Search />搜索工作台<kbd>⌘K</kbd></label>
    </div>
  );
}

// 基地：暴龙机是中枢。A 区处理一颗蛋、B 区继续一个项目、常用出战复制，暴龙机里的蛋都会有反应，
// 走线平时暗着、只有数据经过时亮（见 hub-motion.js）。第一轮那圈徽记已删。
const ACT = { 投递到项目: "deliver", 孵成资产: "hatch", 收入焚决: "scroll", 归档: "archive" };
function HomeB() {
  return (
    <div className="shell">
      <Side active="home" />
      <div className="b-wrap">
        <MobileTop title="基地" />
        <TopB code="00" title="基地" />
        <main className="b-main">
          <h1 className="sr-only">基地</h1>
          <div className="b-hub">
            <div className="b-floor" />
            <svg className="b-traces" aria-hidden="true" />
            <section className="b-port b-port-a">
              <header>
                <span className="b-key">A</span><span className="b-en">EGGS</span><h2>待孵化</h2>
                <span className="b-big" dangerouslySetInnerHTML={{ __html: countSvg(d.eggCount, `待孵化 ${d.eggCount}`) }} />
              </header>
              <ul>
                {d.eggs.slice(0, 6).map((e, i) => (
                  <li key={e.at} className={i === 0 ? "hover" : i === 5 ? "b-spare" : ""}>
                    <EggIcon e={e} size={32} />
                    <div><b>{e.title}</b><small>{e.source} · {e.time}</small></div>
                    <div className="b-hatch">
                      {HATCH.map(([I, l]) => (
                        <button key={l} className="btn sm" data-act={ACT[l]}><I size={13} />{l.replace("投递到项目", "投递").replace("收入焚决", "焚决")}</button>
                      ))}
                    </div>
                  </li>
                ))}
              </ul>
              <a className="b-more" href="#">随手记 {notes} · 收藏 {saved}<ArrowRight size={14} /></a>
            </section>
            <div className="b-core">
              <div className="b-date">
                <span className="b-clock" dangerouslySetInnerHTML={{ __html: lcdSvg(d.clock, d.clock) }} />
                <span><b>10月23日</b><small>FRIDAY · WK43</small></span>
              </div>
              <p className="b-greet">{d.greeting} · <b data-egg-count>{d.eggCount}</b> 颗蛋待孵化</p>
              <div className="b-stage">
                {/* 暴龙机屏：与 HomeV16.jsx 相同，放 stage 模式的伙伴屏引擎；屏上透明按钮戳一下蛋 */}
                <DigiviceArt size={232}><span className="lcd-screen lcd-stage"><canvas data-partner="stage" /></span></DigiviceArt>
                <button type="button" className="digivice-poke" aria-label="戳一下数码蛋" />
                <span className="b-dvkey a">A</span><span className="b-dvkey b">B</span>
              </div>
              <p className="b-partner">PARTNER · 数码蛋</p>
              <form className="b-cmd"><span>&gt;</span><input placeholder="记一笔：一个念头、一个问题……" /><kbd>⌘↵</kbd><button className="b-cmd-go" aria-label="保存"><ArrowRight size={16} /></button></form>
              <section className="b-strip">
                <header><span className="b-en">LOADOUT</span><h2>常用出战</h2><span className="b-hint">按出战次数</span></header>
                <div className="b-chips">
                  {top.map((a) => (
                    <button key={a.code} className={`b-chip t-${a.type}`} data-loadout={a.uses} aria-label={`复制 ${a.title}`}>
                      <Pixel sprite={glyphOf(a)} scale={2} /><span>{a.title}</span><b>×{a.uses}</b><Copy size={14} />
                    </button>
                  ))}
                </div>
              </section>
            </div>
            <section className="b-port b-port-b">
              <header><span className="b-key">B</span><span className="b-en">SLOTS</span><h2>出战中</h2><span className="b-big"><LcdText text={`${d.slots.length}/3`} px={3} /></span></header>
              {d.slots.map((s) => {
                const h = HOLDER[s.holder];
                return (
                  <article key={s.slot} className="b-slot" data-slot={s.slot}>
                    <div className="b-slot-head"><LcdText text={`SLOT ${s.slot}`} px={1.6} /><span className="b-holder" title={`${h.name}持笔`}><AgentSprite agent={s.holder} /></span></div>
                    <h3>{s.name}</h3>
                    <p>{s.progress}</p>
                    <p className="b-next">{s.nextSet ? <>下一步 · {s.next}</> : <em>下一步未填 · 点击填写</em>}</p>
                    <footer>
                      <span className={`chip b-inbox${s.inbox ? " hot" : ""}`} data-inbox={s.inbox}><Inbox size={13} /><span>{s.inbox}</span></span>
                      <span className="chip"><Swords size={13} />{s.loadout.length}</span>
                      <button className="btn primary sm" data-resume><Play size={14} />继续</button>
                    </footer>
                  </article>
                );
              })}
              <button className="b-slot-empty"><Plus size={15} />SLOT 03 · 空</button>
            </section>
          </div>
        </main>
      </div>
    </div>
  );
}

// 资产卡：卡屏是一块 4px 点阵的暗色 LED 屏，图标按整数像素落在点阵上；屏下只留标题、一句话、一行说明和复制。
// 版本号、标签不上卡面（打开详情再看）。复制反馈见 card-motion.js。
function AssetCardB({ a }) {
  const scroll = a.scroll, recipe = a.moves;
  const stage = <span data-stage-name>{a.stageName}</span>;
  return (
    <article className={`b-card t-${a.type}`} data-card={a.code} data-uses={a.uses} data-stage={a.stage}>
      <div className={`b-scr m-screen${a.cover ? " has-cover" : ""}`}>
        {a.cover ? <img className="b-cover" src={a.cover} alt="" /> : <span className="b-icon"><Pixel sprite={glyphOf(a)} fit={64} /></span>}
        <span className="b-code-tl">{a.code}</span>
        {a.demo && <span className="b-demo">示意</span>}
        <span className="b-uses"><span dangerouslySetInnerHTML={{ __html: countSvg(a.uses, `出战 ${a.uses} 次`) }} /><small>出战</small></span>
        <span className="b-stage-cells"><StageBar stage={a.stage} label={false} /></span>
      </div>
      <div className="b-body">
        <h3>{scroll ? `焚决 · ${a.title}` : a.title}</h3>
        {scroll ? (
          <ul className="b-entries">
            {a.entries.map((e, i) => (
              <li key={e.name}><span>{e.name}</span><button className="b-entry-copy" data-copy data-entry={i} aria-label={`复制 ${e.name}`}><small>×{e.uses}</small><Copy size={14} /></button></li>
            ))}
          </ul>
        ) : (
          <p className={a.desc ? "" : "empty"}>{a.desc || (a.type === "Design" ? "还没有效果图，也还没有一句话说明" : "还没有一句话说明")}</p>
        )}
        <footer>
          <span className="b-cap">
            <b>{TYPE[a.type]}</b> · {scroll ? <>{a.entries.length} 条 · {stage}</> : recipe ? `底座+${recipe.length}招式` : stage}
          </span>
          {!scroll && (
            <button className="btn sm b-copy" data-copy>
              <span className="lbl"><Copy size={14} />{recipe ? "复制组合" : "复制"}</span>
              <span className="done"><Check size={14} />已复制</span>
            </button>
          )}
        </footer>
      </div>
    </article>
  );
}

function AssetsB() {
  return (
    <div className="shell">
      <Side active="assets" />
      <div className="b-wrap">
        <MobileTop title="资产仓库" />
        <TopB code="01" title="资产仓库" />
        <main className="b-main pad">
          <header className="b-head">
            <div>
              <div className="b-eyebrow"><span className="b-code">01</span><span className="b-lcd"><LcdText text="ASSET LIBRARY" px={2.2} /></span><span className="b-mat">可用</span></div>
              <div className="b-title"><h1>资产仓库</h1><span className="b-help">?</span></div>
              <p className="b-lead">收录、迭代你的 Prompt、规则与焚决；拿去出战，越用越进化。</p>
            </div>
            <div className="b-head-act">
              <label className="search"><Search />搜索标题、正文、标签、卷名</label>
              <button className="btn primary glow"><Plus />新建<ChevronDown size={14} /></button>
            </div>
          </header>
          <div className="b-shelf">
            <nav className="b-tabs">{tabs().map(([l, n], i) => <button key={l} className={i === 0 ? "on" : ""}>{l}<b>{n}</b></button>)}</nav>
            <button className="btn ghost">按出战<ChevronDown size={14} /></button>
          </div>
          <div className="b-grid">
            {sortedCards().map((a) => <AssetCardB key={a.code} a={a} />)}
          </div>
        </main>
      </div>
    </div>
  );
}

// 设计录入：在资产仓库上盖一层右侧抽屉。左栏五个区块（效果图、基本信息、风格底座、招式、高级），
// 右栏是常驻的复制预览——左边每勾一个招式、每换一次「交给谁」，右边当场跟着变（见 drawer-motion.js）。
// 内容是示意：从收藏帖「6种像素风高级交互」孵化的「像素风 Dashboard」。
const PICKED = [true, true, false, false, true, true];
function DesignDrawer() {
  const de = d.designExample;
  const lines = previewLines(de, PICKED, "agent");
  const Sec = ({ no, title, hint, children, className = "" }) => (
    <section className={`dr-sec ${className}`}>
      <h3><i>{no}</i>{title}{hint && <small>{hint}</small>}</h3>
      {children}
    </section>
  );
  return (
    <>
      <div className="b-scrim" aria-hidden="true" />
      <aside className="b-drawer t-Design" role="dialog" aria-label="新建设计资产" data-drawer data-target="agent">
        <script type="application/json" data-design dangerouslySetInnerHTML={{ __html: JSON.stringify({ base: de.base, moves: de.moves }) }} />
        <header className="dr-head">
          <span className="dr-glyph"><Pixel sprite="DesignV2" scale={2} /></span>
          <div>
            <h2>新建 · 设计</h2>
            <p className="dr-src"><Bookmark size={13} />从收藏孵化：{de.source.title} · {de.source.time.slice(0, 5)}</p>
          </div>
          <button className="dr-close" aria-label="关闭"><X size={18} /></button>
        </header>
        <div className="dr-body">
          <div className="dr-form">
            <Sec no="01" title="效果图" hint="最多 6 张 · 第一张作卡面">
              <div className="dr-shots">
                <figure className="dr-shot"><img src={de.cover} alt="效果图 1" /><figcaption>卡面</figcaption></figure>
                <button className="dr-add"><Plus size={18} />添加</button>
              </div>
            </Sec>
            <Sec no="02" title="基本信息">
              <label className="dr-field"><span>名称</span><input defaultValue={de.title} /></label>
              <label className="dr-field"><span>一句话</span><input defaultValue={de.desc} /></label>
              <div className="dr-field">
                <span>交给谁</span>
                <div className="dr-seg" role="radiogroup" aria-label="交给谁">
                  {Object.entries(WRAP).map(([k, w]) => (
                    <button key={k} role="radio" aria-checked={k === "agent"} data-target={k} className={k === "agent" ? "on" : ""}><Check size={14} />{w.label}</button>
                  ))}
                </div>
                <small>决定复制时外面套哪段话</small>
              </div>
              <div className="dr-field">
                <span>标签</span>
                <div className="dr-tags">{de.tags.map((t) => <span key={t} className="chip">{t}</span>)}<button className="chip dr-tag-add"><Plus size={12} />标签</button></div>
              </div>
            </Sec>
            <Sec no="03" title="风格底座" hint="每次复制都放在最前面">
              <ol className="dr-base">{de.base.map((b, i) => <li key={i}><i>{pad2(i + 1)}</i><span>{b}</span></li>)}</ol>
              <button className="dr-more"><Plus size={14} />添加一条</button>
            </Sec>
            <Sec no="04" title="招式" hint={<>勾选的默认一起复制 · 已选 <b data-picked>{PICKED.filter(Boolean).length}</b>/{de.moves.length}</>}>
              <ul className="dr-moves">
                {de.moves.map((m, i) => (
                  <li key={i}>
                    <label>
                      <input type="checkbox" defaultChecked={PICKED[i]} data-move={i} />
                      <span className="dr-check" aria-hidden="true" />
                      <span className="dr-move"><b>{m.name}</b><small>{m.prompt}</small></span>
                    </label>
                  </li>
                ))}
              </ul>
              <button className="dr-more"><Plus size={14} />添加招式</button>
            </Sec>
            <section className="dr-sec dr-adv">
              <button className="dr-fold" aria-expanded="false"><i>05</i>高级<small>附设计 Skill 包（可选）</small><ChevronDown size={16} /></button>
            </section>
          </div>
          <Sec no="06" title="复制预览" hint={<span data-preview-meta>{previewMeta(lines, "agent")}</span>} className="dr-pv">
            <div className="dr-preview" data-preview>
              {lines.map((l) => <p key={l.key} data-line={l.key} className={l.wrap ? "wrap" : l.label ? "label" : ""}>{l.text}</p>)}
            </div>
          </Sec>
        </div>
        <footer className="dr-foot">
          <span className="dr-note">右边就是复制出去的内容，核对后再保存</span>
          <button className="btn ghost">取消</button>
          <button className="btn primary"><Check size={16} />保存为设计资产</button>
        </footer>
      </aside>
    </>
  );
}

const TRACES = `
function ortho(p,r){let s='M'+p[0][0]+' '+p[0][1];for(let i=1;i<p.length-1;i++){const[a,b]=p[i-1],[x,y]=p[i],[c,e]=p[i+1];const d1=Math.hypot(x-a,y-b)||1,d2=Math.hypot(c-x,e-y)||1,q=Math.min(r,d1/2,d2/2);s+=' L'+(x-(x-a)/d1*q)+' '+(y-(y-b)/d1*q)+' Q'+x+' '+y+' '+(x+(c-x)/d2*q)+' '+(y+(e-y)/d2*q);}const l=p[p.length-1];return s+' L'+l[0]+' '+l[1];}
function draw(){const hub=document.querySelector('.b-hub');if(!hub)return;const svg=hub.querySelector('.b-traces');const H=hub.getBoundingClientRect();
if(getComputedStyle(svg).display==='none')return;
const R=(el)=>{const b=hub.querySelector(el).getBoundingClientRect();return{l:b.left-H.left,r:b.right-H.left,t:b.top-H.top,b:b.bottom-H.top,cx:b.left-H.left+b.width/2,cy:b.top-H.top+b.height/2};};
const A=R('.b-port-a'),B=R('.b-port-b'),ka=R('.b-dvkey.a'),kb=R('.b-dvkey.b');
const ay=A.t+86,by=B.t+86,mxa=(A.r+ka.l)/2,mxb=(B.l+kb.r)/2;
const paths=[['a',ortho([[A.r,ay],[mxa,ay],[mxa,ka.cy],[ka.l,ka.cy]],14)],['b',ortho([[B.l,by],[mxb,by],[mxb,kb.cy],[kb.r,kb.cy]],14)]];
svg.setAttribute('viewBox','0 0 '+H.width+' '+H.height);svg.setAttribute('width',H.width);svg.setAttribute('height',H.height);
svg.innerHTML=paths.map(([n,p])=>'<path class="tr" data-trace="'+n+'" d="'+p+'"/>').join('');}
addEventListener('load',draw);addEventListener('resize',draw);`;

Page({ title: "基地 · B", file: "基地-B.html", css: "b.css", children: <HomeB />, script: TRACES });
Page({ title: "资产仓库 · B", file: "资产仓库-B.html", css: "b.css", children: <AssetsB /> });
Page({ title: "资产仓库 · B · 新建设计", file: "资产仓库-B-新建设计.html", css: "b.css", bodyClass: "has-drawer", children: <><AssetsB /><DesignDrawer /></> });
console.log("written", fs.readdirSync(outDir).filter((f) => f.endsWith(".html")).join(", "));
