// UI v18 视觉稿生成器：用真实组件（暴龙机、像素图、液晶字、进化阶段）和 data.json 的真实数据，
// 渲染四张静态稿：基地 A/B、资产仓库 A/B。运行方式见 build/run.sh。
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import fs from "node:fs";
import path from "node:path";
import { DigiviceArt, Pixel, StageBar, CrestRing, CrestIcon } from "../../../../src/pixel.jsx";
import { LcdText } from "../../../../src/v14.jsx";
import {
  Sun, PenLine, Bookmark, Layers, Folder, Settings2, Search, Plus, Copy, ArrowRight,
  Send, Flame, Archive, Play, ChevronDown, Egg, Inbox, Swords, ScanLine, Menu, NotebookPen,
} from "lucide-react";

const [, , dataPath, outDir] = process.argv;
const d = JSON.parse(fs.readFileSync(dataPath, "utf8"));
const pad2 = (n) => String(n).padStart(2, "0");
const TYPE = { Prompt: "Prompt", Rule: "规则", Design: "设计", Scroll: "焚决", Workflow: "工作流", Skill: "Skill" };
const HOLDER = { claude: { sprite: "metalgreymon16", name: "机械暴龙兽" }, codex: { sprite: "machinedramon16", name: "机械邪龙兽" } };
const notes = d.eggs.filter((e) => e.kind === "note").length;
const saved = d.eggs.length - notes;
const assetCount = d.assets.length + 1;
const top = d.assets.filter((a) => a.uses > 0).slice(0, 4);

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
      <div className="eggscreen lcd-screen">
        <i className="ground" />
        <i className="leaf" style={{ left: 22, top: 14 }} />
        <i className="leaf" style={{ left: 120, top: 44 }} />
        <i className="leaf" style={{ left: 64, top: 52 }} />
        <div className="read"><LcdText text={pad2(d.eggCount)} px={3.2} label={`待孵化 ${d.eggCount}`} /><small>待孵化</small></div>
        <Pixel sprite="egg" size={34} />
      </div>
      <p className="season">秋 · 落叶 · 数码蛋</p>
      <p className="saved">已保存到本机</p>
    </aside>
  );
}

function MobileTop({ title }) {
  return (
    <header className="mobile-top">
      <Menu size={20} />
      <b>{title}</b>
      <span className="egg-mini lcd-screen"><Pixel sprite="egg" size={18} /><span>{d.eggCount}</span></span>
    </header>
  );
}

function Page({ title, file, css, children, script }) {
  const body = renderToStaticMarkup(children);
  const doc = `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title><link rel="stylesheet" href="common.css"><link rel="stylesheet" href="${css}"></head><body>${body}${script ? `<script>${script}</script>` : ""}</body></html>`;
  fs.writeFileSync(path.join(outDir, file), doc);
}

const EggIcon = ({ e, size = 36 }) =>
  e.kind === "note" ? (
    <span className="egg-ico note" style={{ width: size, height: size }}><NotebookPen size={16} /></span>
  ) : (
    <span className="egg-ico cover" style={{ width: size, height: size, backgroundImage: `url(http://127.0.0.1:5178${e.cover})` }} />
  );
const HATCH = [
  [Send, "投递到项目"],
  [Layers, "孵成资产"],
  [Flame, "收入焚决"],
  [Archive, "归档"],
];

// ======================= A · 克制版 =======================
function SlotA({ s }) {
  const h = HOLDER[s.holder];
  return (
    <article className="a-slot">
      <header>
        <span className="a-slot-no"><LcdText text={`SLOT ${s.slot}`} px={1.6} /></span>
        <h3>{s.name}</h3>
        <span className="a-holder" title={`${h.name}持笔`}><Pixel sprite={h.sprite} fit={22} />{h.name}</span>
      </header>
      <dl>
        <div><dt>最近进展</dt><dd>{s.progress}</dd></div>
        <div><dt>下一步</dt><dd>{s.nextSet ? s.next : <em>未填 · 点击填写</em>}</dd></div>
      </dl>
      <footer>
        <span className={`chip${s.inbox ? " hot" : ""}`}><Inbox size={13} />收件 {s.inbox}</span>
        <span className="chip"><Swords size={13} />装备 {s.loadout.length}</span>
        <span className="a-saved">{s.saved}</span>
        <button className="btn primary sm"><Play size={14} />继续</button>
      </footer>
    </article>
  );
}

function HomeA() {
  return (
    <div className="shell">
      <Side active="home" />
      <div>
        <MobileTop title="基地" />
        <main className="a-main">
          <header className="a-bar">
            <h1>基地</h1>
            <span className="a-sub">{d.now}</span>
            <div className="a-tools">
              <label className="search"><Search />搜索工作台<kbd>⌘K</kbd></label>
              <button className="btn primary"><Plus />记一笔</button>
            </div>
          </header>
          <div className="a-home">
            <div className="a-col">
            <section className="a-sec a-slots">
              <header><h2>出战中</h2><span className="a-n">{d.slots.length}/3</span><a className="a-link" href="#">项目空间<ArrowRight size={14} /></a></header>
              {d.slots.map((s) => <SlotA key={s.slot} s={s} />)}
              <button className="a-slot-empty"><Plus size={16} />SLOT 03 · 从项目库挑一个</button>
            </section>
            <section className="a-sec a-eggs">
              <header><h2>待孵化</h2><span className="a-n">{d.eggCount}</span><span className="a-hint">随手记 {notes} · 收藏 {saved}</span><a className="a-link" href="#">全部<ArrowRight size={14} /></a></header>
              <form className="a-capture"><span>›</span><input placeholder="记一笔：一个念头、一个问题……" /><kbd>⌘↵</kbd></form>
              <ul>
                {d.eggs.slice(0, 5).map((e, i) => (
                  <li key={e.at} className={i === 0 ? "hover" : ""}>
                    <EggIcon e={e} />
                    <div className="a-egg-main"><b>{e.title}</b><small>{e.source} · {e.time}</small></div>
                    {i === 0 ? (
                      <div className="a-hatch">{HATCH.map(([I, l]) => <button key={l} className="btn sm"><I size={14} />{l}</button>)}</div>
                    ) : (
                      <button className="btn sm ghost"><Egg size={14} />孵化<ChevronDown size={13} /></button>
                    )}
                  </li>
                ))}
              </ul>
            </section>
            </div>
            <div className="a-col">
            <aside className="a-sec a-status">
              <div className="a-status-screen">
                <DigiviceArt size={112}><Pixel sprite="egg" size={20} /></DigiviceArt>
                <dl>
                  <div className="egg"><dt>待孵化</dt><dd><LcdText text={pad2(d.eggCount)} px={4} /></dd></div>
                  <div><dt>出战中</dt><dd><LcdText text={pad2(d.slots.length)} px={4} /></dd></div>
                  <div className="dim"><dt>本周出战</dt><dd><LcdText text={pad2(d.weekUses)} px={4} /></dd><small>上次 {d.lastUse}</small></div>
                </dl>
              </div>
            </aside>
            <section className="a-sec a-top">
              <header><h2>常用出战</h2><span className="a-hint">按出战次数</span><a className="a-link" href="#">资产仓库<ArrowRight size={14} /></a></header>
              <ul>
                {top.map((a) => (
                  <li key={a.code} className={`t-${a.type}`}>
                    <span className="a-glyph"><Pixel sprite={a.glyph} fit={22} /></span>
                    <div><b>{a.title}</b><small>{a.stageName} · 出战 {a.uses} 次 · {a.last.slice(0, 5)}</small></div>
                    <button className="btn sm icon" aria-label={`复制 ${a.title}`}><Copy size={15} /></button>
                  </li>
                ))}
              </ul>
            </section>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}

function AssetCardA({ a, scroll }) {
  return (
    <article className={`a-card t-${a.type}`}>
      <div className="a-scr">
        <span className="a-code">{a.code}</span>
        <Pixel sprite={a.glyph} fit={46} />
        <span className="a-ver">{scroll ? `${a.entries.length} 条` : `v${a.versions}`}</span>
      </div>
      <div className="a-body">
        <div className="a-meta"><span className="a-type">{TYPE[a.type]}</span><StageBar stage={a.stage} /></div>
        <h3>{scroll ? `焚决 · ${a.title}` : a.title}</h3>
        {scroll ? (
          <p className="a-entries">{a.entries.map((e) => <span key={e.name}><b>{e.name}</b> 出战 {e.uses}</span>)}</p>
        ) : (
          <p className={a.desc ? "" : "empty"}>{a.desc || "还没有一句话说明"}</p>
        )}
        <div className="a-foot">
          <span>{a.uses ? <>出战 <b>{a.uses}</b> 次 · 最近 {a.last.slice(0, 5)}</> : <em>还没出战</em>}</span>
          <button className="btn sm">{scroll ? <>展开<ChevronDown size={14} /></> : <><Copy size={14} />复制</>}</button>
        </div>
      </div>
    </article>
  );
}

function sortedCards() {
  const list = [...d.assets];
  const at = list.findIndex((a) => a.uses < d.scroll.uses);
  list.splice(at < 0 ? list.length : at, 0, { ...d.scroll, scroll: true });
  return list;
}
function tabs() {
  const count = (t) => d.assets.filter((a) => a.type === t).length;
  return [["全部", assetCount], ["Prompt", count("Prompt")], ["焚决", 1], ["规则", count("Rule")], ["设计", count("Design")]];
}

function AssetsA() {
  return (
    <div className="shell">
      <Side active="assets" />
      <div>
        <MobileTop title="资产仓库" />
        <main className="a-main">
          <header className="a-bar">
            <h1>资产仓库</h1>
            <span className="a-n big">{assetCount}</span>
            <div className="a-tools">
              <label className="search wide"><Search />搜索标题、正文、标签、卷名</label>
              <button className="btn">按出战<ChevronDown size={14} /></button>
              <div className="a-new">
                <button className="btn primary"><Plus />新建<ChevronDown size={14} /></button>
                <div className="a-menu" role="menu">
                  <button><PenLine size={16} /><span><b>手写一份</b><small>Prompt、规则、焚决、设计…</small></span></button>
                  <button><Egg size={16} /><span><b>从捕获孵化</b><small>从随手记、收藏里挑一条</small></span></button>
                  <button><ScanLine size={16} /><span><b>从参照物逆向</b><small>原「逆向工程」，产出固定 Skill</small></span></button>
                </div>
              </div>
            </div>
          </header>
          <nav className="a-tabs">
            {tabs().map(([l, n], i) => <button key={l} className={i === 0 ? "on" : ""}>{l}<b>{n}</b></button>)}
            <button className="more">更多类型<ChevronDown size={13} /></button>
          </nav>
          <div className="a-grid">
            {sortedCards().map((a) => <AssetCardA key={a.code} a={a} scroll={a.scroll} />)}
          </div>
        </main>
      </div>
    </div>
  );
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
              <header><span className="b-key">A</span><span className="b-en">EGGS</span><h2>待孵化</h2><span className="b-big"><LcdText text={pad2(d.eggCount)} px={3} /></span></header>
              <ul>
                {d.eggs.slice(0, 5).map((e, i) => (
                  <li key={e.at} className={i === 0 ? "hover" : ""}>
                    <EggIcon e={e} size={32} />
                    <div><b>{e.title}</b><small>{e.source} · {e.time}</small></div>
                    {i === 0 && <div className="b-hatch">{HATCH.map(([I, l]) => <button key={l} className="btn sm"><I size={13} />{l.replace("投递到项目", "投递").replace("收入焚决", "焚决")}</button>)}</div>}
                  </li>
                ))}
              </ul>
              <a className="b-more" href="#">随手记 {notes} · 收藏 {saved}<ArrowRight size={14} /></a>
            </section>
            <div className="b-core">
              <div className="b-date">
                <LcdText text={d.clock} px={7} />
                <span><b>10月23日</b><small>FRIDAY · WK43</small></span>
              </div>
              <p className="b-greet">{d.greeting} · <b>{d.eggCount}</b> 颗蛋待孵化</p>
              <div className="b-stage">
                <CrestRing />
                <DigiviceArt size={232}><Pixel sprite="egg" size={46} /></DigiviceArt>
                <span className="b-dvkey a">A</span><span className="b-dvkey b">B</span>
              </div>
              <p className="b-partner">PARTNER · 数码蛋 · 待孵化 {d.eggCount}</p>
              <form className="b-cmd"><span>&gt;</span><input placeholder="记一笔：一个念头、一个问题……" /><kbd>⌘↵</kbd><button className="b-cmd-go" aria-label="保存"><ArrowRight size={16} /></button></form>
              <section className="b-strip">
                <header><span className="b-en">LOADOUT</span><h2>常用出战</h2><span className="b-hint">按出战次数</span></header>
                <div className="b-chips">
                  {top.map((a) => (
                    <button key={a.code} className={`b-chip t-${a.type}`}><Pixel sprite={a.glyph} fit={18} /><span>{a.title}</span><b>×{a.uses}</b><Copy size={14} /></button>
                  ))}
                </div>
              </section>
            </div>
            <section className="b-port b-port-b">
              <header><span className="b-key">B</span><span className="b-en">SLOTS</span><h2>出战中</h2><span className="b-big"><LcdText text={`${d.slots.length}/3`} px={3} /></span></header>
              {d.slots.map((s) => {
                const h = HOLDER[s.holder];
                return (
                  <article key={s.slot} className="b-slot">
                    <div className="b-slot-head"><LcdText text={`SLOT ${s.slot}`} px={1.6} /><span className="b-holder"><Pixel sprite={h.sprite} fit={24} /></span></div>
                    <h3>{s.name}</h3>
                    <p>{s.progress}</p>
                    <p className="b-next">{s.nextSet ? <>下一步 · {s.next}</> : <em>下一步未填 · 点击填写</em>}</p>
                    <footer>
                      <span className={`chip${s.inbox ? " hot" : ""}`}><Inbox size={13} />{s.inbox}</span>
                      <span className="chip"><Swords size={13} />{s.loadout.length}</span>
                      <button className="btn primary sm"><Play size={14} />继续</button>
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

function AssetCardB({ a, scroll }) {
  return (
    <article className={`b-card t-${a.type}`}>
      <div className="b-scr">
        <span className="b-code-tl">{a.code}</span>
        <span className="b-code-tr">{scroll ? `${a.entries.length} ENTRIES` : `v${a.versions}.0`}</span>
        <Pixel sprite={a.glyph} fit={58} />
        <span className="b-uses"><LcdText text={pad2(a.uses)} px={3} /><small>出战</small></span>
        <span className="b-stage-cells"><StageBar stage={a.stage} label={false} /></span>
      </div>
      <div className="b-body">
        <div className="b-meta"><span className="b-type">{TYPE[a.type]}</span><span className="b-stage-name">{a.stageName}</span></div>
        <h3>{scroll ? `焚决 · ${a.title}` : a.title}</h3>
        {scroll ? (
          <ul className="b-entries">{a.entries.map((e) => <li key={e.name}><span>{e.name}</span><small>×{e.uses}</small><Copy size={13} /></li>)}</ul>
        ) : (
          <p className={a.desc ? "" : "empty"}>{a.desc || "还没有一句话说明"}</p>
        )}
        <footer>
          <span className="b-tags">{(a.tags || []).map((t) => <span key={t} className="chip">{t}</span>)}</span>
          {!scroll && <button className="btn sm"><Copy size={14} />复制</button>}
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
            {sortedCards().map((a) => <AssetCardB key={a.code} a={a} scroll={a.scroll} />)}
          </div>
        </main>
      </div>
    </div>
  );
}

const TRACES = `
function ortho(p,r){let s='M'+p[0][0]+' '+p[0][1];for(let i=1;i<p.length-1;i++){const[a,b]=p[i-1],[x,y]=p[i],[c,e]=p[i+1];const d1=Math.hypot(x-a,y-b)||1,d2=Math.hypot(c-x,e-y)||1,q=Math.min(r,d1/2,d2/2);s+=' L'+(x-(x-a)/d1*q)+' '+(y-(y-b)/d1*q)+' Q'+x+' '+y+' '+(x+(c-x)/d2*q)+' '+(y+(e-y)/d2*q);}const l=p[p.length-1];return s+' L'+l[0]+' '+l[1];}
function draw(){const hub=document.querySelector('.b-hub');if(!hub)return;const svg=hub.querySelector('.b-traces');const H=hub.getBoundingClientRect();
if(getComputedStyle(svg).display==='none')return;
const R=(el)=>{const b=hub.querySelector(el).getBoundingClientRect();return{l:b.left-H.left,r:b.right-H.left,t:b.top-H.top,b:b.bottom-H.top,cx:b.left-H.left+b.width/2,cy:b.top-H.top+b.height/2};};
const A=R('.b-port-a'),B=R('.b-port-b'),ka=R('.b-dvkey.a'),kb=R('.b-dvkey.b');
const ay=A.t+86,by=B.t+86,mxa=(A.r+ka.l)/2,mxb=(B.l+kb.r)/2;
const paths=[['a',ortho([[A.r,ay],[mxa,ay],[mxa,ka.cy],[ka.l,ka.cy]],14),true],['b',ortho([[B.l,by],[mxb,by],[mxb,kb.cy],[kb.r,kb.cy]],14),false]];
svg.setAttribute('viewBox','0 0 '+H.width+' '+H.height);svg.setAttribute('width',H.width);svg.setAttribute('height',H.height);
svg.innerHTML=paths.map(([n,p,live])=>'<path class="tr '+(live?'live':'')+'" d="'+p+'"/>').join('');
const live=svg.querySelector('.live');if(live){const L=live.getTotalLength();[0.35,0.62].forEach((f,i)=>{const pt=live.getPointAtLength(L*f);svg.insertAdjacentHTML('beforeend','<circle class="pulse" cx="'+pt.x+'" cy="'+pt.y+'" r="'+(i?3:4.5)+'"/>');});}}
addEventListener('load',draw);addEventListener('resize',draw);`;

Page({ title: "基地 · A 克制版", file: "基地-A.html", css: "a.css", children: <HomeA /> });
Page({ title: "基地 · B 世界感版", file: "基地-B.html", css: "b.css", children: <HomeB />, script: TRACES });
Page({ title: "资产仓库 · A 克制版", file: "资产仓库-A.html", css: "a.css", children: <AssetsA /> });
Page({ title: "资产仓库 · B 世界感版", file: "资产仓库-B.html", css: "b.css", children: <AssetsB /> });
console.log("written", fs.readdirSync(outDir).filter((f) => f.endsWith(".html")).join(", "));
