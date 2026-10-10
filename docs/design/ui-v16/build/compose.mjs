// UI v16 视觉稿生成器：真实组件（服务端渲染）+ 当前编译样式 + v16 样式层 → 每个状态一个 HTML。
// 数据全部合成；不读任何真实数据，不连接任何服务。用法：node compose.mjs
import { build } from "esbuild";
import { readFile, writeFile, mkdir, copyFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const root = "/Users/nat/Documents/ChatGPT/个人/work/personal-ai-workbench";
const dir = join(root, "docs/design/ui-v16");
const bdir = join(dir, "build");
await build({ absWorkingDir: root, entryPoints: [join(bdir, "kit-entry.jsx")], bundle: true, platform: "node", format: "esm", outfile: join(bdir, "kit.bundle.mjs"), packages: "external", logLevel: "warning", jsx: "automatic", loader: { ".js": "jsx" } });
const { r } = await import(pathToFileURL(join(bdir, "kit.bundle.mjs")) + "?t=" + Date.now());
// 外壳沿用 v15 采集的真实侧栏与顶栏；样式取当前 dist 的编译结果。
const live = JSON.parse(await readFile(join(root, "docs/design/ui-v15/build/live.json"), "utf8"));
const css = (await readdir(join(root, "dist/assets"))).find((f) => f.endsWith(".css"));
// ONLY=前缀 时只写出该前缀的页面，且不刷新 app.css（避免改动已交给 Codex 冻结的其他页参照）。
const ONLY = process.env.ONLY || "";
if (!ONLY) await copyFile(join(root, "dist/assets", css), join(dir, "app.css"));
const emit = (file, html) => (!ONLY || file.startsWith(ONLY) ? writeFile(join(dir, "pages", file), html) : null);
const SPR = JSON.parse(await readFile(join(dir, "sprites/sprites.json"), "utf8"));
await mkdir(join(dir, "pages"), { recursive: true });

// ---------- 外壳 ----------
function sidebar(label) {
  let s = live.home.sidebar.replace(/ active"/g, '"').replace(/ aria-current="page"/g, "");
  s = s.replace(new RegExp(`<button class="nav-item ([^"]*)"([^>]*)>((?:(?!</button>).)*?<span>${label}</span>)`), (m, c, a, inner) => `<button class="nav-item ${c} active" aria-current="page"${a}>${inner}`);
  return s.replace(/(<span class="partner-screen"[^>]*>)([\s\S]*?)(<\/span>)/, (m, o, inner, c) => `${o}<span style="display:grid;place-items:center;height:100%">${r.pixel("egg", 44)}</span>${c}`);
}
const topbar = (code, title) => live.home.topbar.replace(/<span class="crumb-code">[^<]*<\/span><strong>[^<]*<\/strong>/, `<span class="crumb-code">${code}</span><strong>${title}</strong>`);
const page = (route, code, label, title, body) =>
  `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>v16 · ${title}</title><link rel="stylesheet" href="../app.css"><link rel="stylesheet" href="../v16.css"><style>body{margin:0}</style></head><body><div class="app-shell">${sidebar(label)}<div class="workspace">${topbar(code, label)}<main id="main-content" class="main-content page-${route} v14 v16">${body}</main></div></div></body></html>`;

// ---------- 像素精灵（由用户图纸生成，见 sprites.py） ----------
function sprite(key, height, cls = "") {
  const s = SPR[key], w = s.size[0], hgt = s.size[1];
  let rects = "";
  s.rows.forEach((row, y) => {
    let x = 0;
    while (x < row.length) {
      const ch = row[x];
      let n = 1;
      while (x + n < row.length && row[x + n] === ch) n++;
      if (ch !== ".") rects += `<rect x="${x}" y="${y}" width="${n + 0.02}" height="1.02" fill="${s.palette[ch]}"/>`;
      x += n;
    }
  });
  return `<svg class="sprite ${cls}" viewBox="0 0 ${w} ${hgt}" style="height:${height}px;width:${Math.round((height * w) / hgt)}px" shape-rendering="crispEdges" role="img" aria-label="${s.name}">${rects}</svg>`;
}
// 成长期（亚古兽、加布兽）比完全体 / 究极体矮一截：用户 2026-10-05 要求亚古兽与加布兽一样大。
const CAST = [
  { id: "claude", name: "Claude Code", ch: "metalgreymon", hue: "255,138,36", big: true },
  { id: "codex", name: "Codex", ch: "machinedramon", hue: "77,227,255", big: true },
  { id: "hermes", name: "Hermes", ch: "agumon", hue: "168,145,255", big: false },
  { id: "openclaw", name: "OpenClaw", ch: "gabumon", hue: "255,143,184", big: false },
];
const ic = r.ic;

// ---------- 智能体群 ----------
function heading() {
  let h = r.heading("agents", { description: "选一位伙伴，接着做没做完的事。" });
  h = h.replace(/<h1>([^<]*)<\/h1>/, `<div class="title-row"><h1>$1</h1><button class="page-help" aria-label="这页怎么用">?</button></div>`);
  h = h.replace(/<\/header>$/, `<div class="page-heading-action"><button class="icon-btn" aria-label="重新检测本机入口">${ic("RefreshCw", 18)}</button></div></header>`);
  return h + `<ul class="page-bounds" aria-label="边界"><li>会话只在本机读取</li><li>复制前先预览</li></ul>`;
}
function relay(empty) {
  if (empty)
    return `<section class="relay m-screen is-empty" aria-labelledby="relay-title">
  <div class="relay-top"><span class="en">CONTINUE · 接着哪段会话</span><span class="relay-tools"><button class="text-btn">${ic("History", 15)}找更早的</button></span></div>
  <h2 id="relay-title" class="relay-title muted">没找到最近 7 天的会话</h2>
  <p class="relay-quote">四位伙伴的本机会话里，最近 7 天没有新记录。可以找更早的，或者手动写一段交接。</p>
  <div class="relay-actions"><button class="button secondary">${ic("PenLine", 16)}手动写一段</button></div>
</section>`;
  return `<section class="relay m-screen" aria-labelledby="relay-title">
  <div class="relay-top"><span class="en">CONTINUE · 接着哪段会话</span><span class="relay-tools"><button class="text-btn">换一段 <b>15</b>${ic("ChevronDown", 15)}</button><button class="text-btn">${ic("History", 15)}找更早的</button></span></div>
  <h2 id="relay-title" class="relay-title">UI v16 · 智能体群页面简报</h2>
  <div class="relay-meta">
    <span class="from" style="--hue:${CAST[0].hue}"><span class="mini">${sprite("metalgreymon", 22)}</span>CLAUDE CODE</span>
    <span>${ic("FolderGit2", 14)}~/work/personal-ai-workbench</span>
    <span>${ic("Clock3", 14)}10/05 04:12</span>
    <span>${ic("MessagesSquare", 14)}42 轮</span>
  </div>
  <p class="relay-quote">“确认，开始出 1440 和 390 视觉稿；亚古兽缩小到和加布兽一样大。”</p>
</section>`;
}
function card(c, { on = false, source = false } = {}) {
  return `<button class="rc m-panel${on ? " on" : ""}" role="radio" aria-checked="${on}" style="--hue:${c.hue}">
  ${source ? `<span class="rc-source">来源</span>` : ""}
  <span class="rc-stage${c.big ? "" : " rookie"}">${sprite(c.ch, c.big ? 148 : 96)}</span>
  <span class="rc-label"><b>${SPR[c.ch].name}</b><span class="en">${c.name.toUpperCase()}</span></span>
</button>`;
}
function select() {
  return `<section class="select" aria-labelledby="select-title">
  <div class="sec-head"><h2 id="select-title" class="en-head"><span class="en">SELECT</span>带到哪里继续</h2><span class="sec-meta">4 位主力 · 1 位伙伴</span></div>
  <div class="cast" role="radiogroup" aria-label="接力目标">
    ${card(CAST[0], { source: true })}${card(CAST[1], { on: true })}${card(CAST[2])}${card(CAST[3])}
  </div>
  <div class="others"><span class="en">MORE</span><button class="oc" role="radio" aria-checked="false"><span class="oc-icon">豆</span>豆包工作</button></div>
</section>`;
}
function launch(open) {
  const prompt = `# 上下文接力 · UI v16 · 智能体群页面简报

来源：Claude Code · ~/work/personal-ai-workbench · 10/05 04:12
项目唯一下一步：Claude 出智能体群 1440 + 390 视觉稿

## 最后 8 轮（原话）
用户：1. 就这四个，2. 横向滑动的一排
Claude：已确认会话来源为四位伙伴；390 宽角色卡横向滑动……
用户：亚古兽太大了，让他小一点和加布兽一样大……
……

请先核对项目 CURRENT.md 与最新交接，再继续。`;
  return `<section class="launch m-panel${open ? " open" : ""}" aria-label="发车">
  <div class="launch-main">
    <button class="prompt-toggle" aria-expanded="${open}">${ic(open ? "ChevronUp" : "ChevronDown", 16)}<span class="en">PROMPT</span>预览提示词</button>
    <span class="launch-meta"><b>1,240</b> 字 · 打开 Codex 后粘贴发送</span>
    <span class="launch-actions"><button class="button secondary">${ic("Copy", 16)}只复制提示词</button><button class="button go">带到 <b class="flip">机械邪龙兽</b> 继续${ic("ArrowRight", 17)}</button></span>
  </div>
  ${open ? `<pre class="prompt">${prompt}</pre>` : ""}
</section>`;
}
function archive() {
  const c = CAST[1];
  return `<section class="archive" aria-labelledby="archive-title" style="--hue:${c.hue}">
  <div class="stage m-screen">${r.corners()}<span class="stage-floor"></span>${sprite(c.ch, 250, "hero")}
    <div class="stage-plate"><h2 id="archive-title">${SPR[c.ch].name}</h2><span class="en">CODEX · 主力</span></div>
  </div>
  <div class="dossier">
    <div class="tabs" role="tablist" aria-label="档案">
      <button role="tab" aria-selected="true" class="on">档案</button>
      <button role="tab" aria-selected="false">内容<span class="tab-n">128</span></button>
      <button role="tab" aria-selected="false">体检<span class="tab-n warn">2</span></button>
      <button role="tab" aria-selected="false">配置</button>
    </div>
    <dl class="facts">
      <div><dt><span class="en">STRENGTHS</span>擅长</dt><dd class="tags"><span>代码实现</span><span>重构</span><span>测试</span><span>修复</span><span>审查</span><span>命令行</span></dd></div>
      <div><dt><span class="en">COST</span>成本</dt><dd class="cost"><i class="on"></i><i class="on"></i><i class="on"></i><i></i><i></i><b>中</b></dd></div>
      <div><dt><span class="en">PROJECTS</span>常驻项目</dt><dd class="mono">personal-ai-workbench<br>ai-ui-users</dd></div>
      <div><dt><span class="en">NOTE</span>备注</dt><dd>大量开发与全量回归；交接写进 handoffs。</dd></div>
    </dl>
    <button class="text-btn edit">${ic("PenLine", 15)}编辑角色卡</button>
  </div>
</section>`;
}
const agents = (opts = {}) =>
  page("agents", "03", "智能体群", "智能体群", `${heading()}${relay(opts.empty)}${select()}${opts.empty ? "" : launch(opts.open)}${archive()}`);

await emit("agents.html", agents());
await emit("agents-preview.html", agents({ open: true }));
await emit("agents-empty.html", agents({ empty: true }));
console.log("pages: agents, agents-preview, agents-empty");


// ---------- 逆向工程（简报 02 第二版）：参照物 → 配方 → 复刻验证 → 举一反三 → 炼成 Skill ----------
// 作品与截图全部是这里用 SVG 画的合成图，不使用任何真实素材。
function poster({ title = "SUMMER", sub = "NOISE", info = "09.12—09.14 · 上海西岸", circle = "#f2542d", r = 118, cx = 196, cy = 210, shift = 0 } = {}) {
  return `<svg class="art" viewBox="0 0 300 400" role="img" aria-label="海报 ${title} ${sub}">
  <rect width="300" height="400" fill="#ece6da"/>
  ${[1, 2, 3, 4, 5].map((k) => `<line x1="${k * 50}" y1="0" x2="${k * 50}" y2="400" stroke="#cfc8ba" stroke-width="0.6"/>`).join("")}
  <circle cx="${cx}" cy="${cy}" r="${r}" fill="${circle}"/>
  <rect x="-20" y="${262 + shift}" width="360" height="22" fill="#141414" transform="rotate(-12 150 270)"/>
  <text x="${18 + shift}" y="92" font-family="Helvetica Neue,Arial,sans-serif" font-weight="900" font-size="54" letter-spacing="-2.5" fill="#141414">${title}</text>
  <text x="${18 + shift}" y="140" font-family="Helvetica Neue,Arial,sans-serif" font-weight="900" font-size="54" letter-spacing="-2.5" fill="#141414">${sub}</text>
  <text x="18" y="372" font-family="Menlo,monospace" font-size="11" fill="#141414">${info}</text>
  <text x="282" y="372" text-anchor="end" font-family="Menlo,monospace" font-size="11" fill="#141414">VOL.07</text>
</svg>`;
}
function webshot(ghost = false) {
  return `<svg class="art web" viewBox="0 0 480 300" role="img" aria-label="网页截图">
  <rect width="480" height="300" fill="${ghost ? "none" : "#0f1013"}"/>
  ${ghost ? "" : `<rect x="0" y="0" width="480" height="34" fill="#16171b"/><circle cx="18" cy="17" r="5" fill="#5e6ad2"/><rect x="34" y="12" width="60" height="10" rx="3" fill="#2a2c33"/>
  <rect x="400" y="11" width="62" height="13" rx="6" fill="#5e6ad2"/>
  <text x="40" y="78" font-family="Inter,Helvetica,sans-serif" font-weight="600" font-size="22" fill="#f7f8f8">Changelog</text>
  <text x="40" y="98" font-family="Inter,Helvetica,sans-serif" font-size="10" fill="#8a8f98">New updates and improvements</text>
  ${[0, 1, 2].map((k) => `<text x="40" y="${138 + k * 52}" font-family="Menlo,monospace" font-size="8" fill="#8a8f98">OCT ${4 - k}, 2026</text><rect x="130" y="${128 + k * 52}" width="${220 - k * 30}" height="10" rx="3" fill="#e6e7ea"/><rect x="130" y="${144 + k * 52}" width="300" height="6" rx="3" fill="#2a2c33"/><rect x="130" y="${155 + k * 52}" width="${250 - k * 40}" height="6" rx="3" fill="#2a2c33"/>`).join("")}`}
</svg>`;
}
const PICK_ORDER = [CAST[1], CAST[0], CAST[2], CAST[3]]; // Codex 排第一（用户 2026-10-05）
const TYPES = { TXT: ["FileText", "文字"], IMG: ["Image", "图片"], WEB: ["AppWindow", "网页"], FN: ["Workflow", "功能"] };
const SPECS = [
  ["IMG", "SUMMER NOISE 音乐节海报", "behance.net", "10/04", "verify"],
  ["WEB", "Linear 更新日志页", "linear.app", "10/03", "reverse"],
  ["FN", "炉子 · 上下文接力", "本机截图 ×3", "10/05", "verify"],
  ["TXT", "产品发布帖的节奏", "x.com", "10/02", "todo"],
  ["IMG", "野口勇展览海报", "本机截图", "09/30", "done"],
  ["TXT", "先给结论，再给理由", "mp.weixin.qq.com", "09/28", "done"],
];
const ST = { todo: "待逆推", reverse: "待复刻", verify: "待判定", done: "已炼成" };
function rail2(active, empty) {
  const n = (k) => SPECS.filter((x) => x[4] === k).length;
  const chips = ["todo", "reverse", "verify", "done"].map((k) => `<button role="radio" aria-checked="false">${ST[k]}<span>${empty ? 0 : n(k)}</span></button>`).join("");
  const types = Object.entries(TYPES).map(([k, [icon, label]]) => `<button aria-pressed="false" aria-label="只看${label}" title="${label}">${ic(icon, 15)}<span class="en">${k}</span></button>`).join("");
  const list = empty ? `<p class="rail-empty">还没有参照物</p>` :
    SPECS.map(([t, title, src, day, s], i) => `<button class="rec${i === active ? " on" : ""}" role="radio" aria-checked="${i === active}"><span class="rec-type">${ic(TYPES[t][0], 14)}<span class="en">${t}</span></span><b>${title}</b><span class="en-meta">${src} · ${day}</span><span class="dot ${s}">${ST[s]}</span></button>`).join("");
  return `<aside class="rail" aria-label="标本架">
  <div class="rail-filter" role="radiogroup" aria-label="按状态筛选"><button role="radio" aria-checked="true">全部<span>${empty ? 0 : SPECS.length}</span></button>${chips}</div>
  <div class="rail-types" aria-label="按类型筛选">${types}</div>
  <div class="rail-list" role="radiogroup" aria-label="参照物">${list}</div>
</aside>`;
}
function steps2(cur) {
  return `<ol class="rsteps">${["投入", "逆推配方", "复刻验证", "举一反三", "炼成 Skill"].map((s, i) => `<li class="${i < cur ? "done" : i === cur ? "now" : ""}${i === 3 ? " opt" : ""}"><i>${i < cur ? ic("Check", 13) : i + 1}</i>${s}${i === 3 ? `<small>可选</small>` : ""}</li>`).join("")}</ol>`;
}
function head2(type, title, meta, cur) {
  return `<div class="bench-head"><span class="en">SPECIMEN · ${type}</span><h2>${title}</h2><span class="bench-meta">${meta}</span>${steps2(cur)}</div>`;
}
const MARK = { obs: "观察", inf: "推断", ver: "已验证" };
const M = (m) => `<span class="mk ${m}">${MARK[m]}</span>`;
function launch2(task, files) {
  return `<div class="re-launch">
  <div class="pick" role="radiogroup" aria-label="交给谁">${PICK_ORDER.map((c, i) => `<button class="pk${i === 0 ? " on" : ""}" role="radio" aria-checked="${i === 0}" style="--hue:${c.hue}"><span class="pk-av">${sprite(c.ch, c.big ? 40 : 30)}</span><span>${SPR[c.ch].name}</span></button>`).join("")}<button class="pk" role="radio" aria-checked="false"><span class="pk-av txt">豆</span><span>豆包工作</span></button></div>
  <details class="pack"><summary>${ic("FileText", 15)}${task}任务包 <b>${files.chars}</b> 字 · 附 <b>${files.n}</b> 个本机文件路径</summary></details>
  <div class="bench-bar"><span class="hint">会复制任务包；到 Codex 里粘贴发送，它能直接打开附带的文件</span><button class="button go">${ic("Copy", 16)}把${task}任务交给 <b>机械邪龙兽</b>${ic("ArrowRight", 16)}</button></div>
</div>`;
}
// 对照台：分项打分（用户 2026-10-05：判定改为打分；达标线暂定 90%，实践中再调）
function scoreBoard(scores, { auto = null, threshold = 90, confirmed = false } = {}) {
  const vals = scores.map((x) => x[1]).filter((v) => v != null);
  const parts = [...vals.map((v) => v * 20), ...(auto ? [auto[1]] : [])];
  const total = parts.length ? Math.round(parts.reduce((a, b) => a + b, 0) / parts.length) : null;
  const pass = total != null && total >= threshold;
  const rows = scores.map(([dim, v]) => `<div class="srow"><span class="sdim">${dim}</span><span class="segs" role="radiogroup" aria-label="${dim} 打分">${[1, 2, 3, 4, 5].map((k) => `<button role="radio" aria-checked="${v === k}" aria-label="${dim} ${k} 分" class="${v != null && k <= v ? "on" : ""}"></button>`).join("")}</span><b class="sval">${v ?? "—"}</b></div>`).join("");
  const autoRow = auto ? `<div class="srow auto"><span class="sdim">${auto[0]}</span><span class="sbar"><i style="width:${auto[1]}%"></i></span><b class="sval">${auto[1]}%</b></div>` : "";
  return `<div class="score">
  <div class="srows">${autoRow}${rows}</div>
  <div class="stotal ${pass ? "pass" : "fail"}"><span class="en">SCORE</span><b>${total ?? "—"}<small>%</small></b><span class="sline">达标线 ${threshold}%</span>
    ${confirmed ? `<span class="verdict-chip ${pass ? "pass" : "fail"}">${ic(pass ? "BadgeCheck" : "CircleX", 16)}${pass ? "达标" : "未达标"}</span>` : `<button class="button${pass ? "" : " secondary"}">${ic(pass ? "BadgeCheck" : "CircleX", 16)}确认：${pass ? "达标" : "未达标"}</button>`}</div>
</div>`;
}
function compare({ left, right, scores = null, auto = null, confirmed = false, note = "", waiting = false }) {
  return `<section class="judge" aria-label="对照台">
  <div class="judge-top"><span class="en">COMPARE · 原件 ↔ 复刻</span>${waiting ? "" : `<span class="judge-hint">逐项给复刻打分，总分到达标线才算 1:1</span>`}</div>
  <div class="pair"><figure><figcaption><span class="en">ORIGINAL</span>原件</figcaption>${left}</figure><span class="slider" aria-hidden="true">${ic("ChevronsLeftRight", 18)}</span><figure><figcaption><span class="en">REPLICA</span>复刻 · 只凭配方</figcaption>${right}</figure></div>
  ${scores ? scoreBoard(scores, { auto, confirmed }) : ""}
  ${note ? `<p class="judge-note">${note}</p>` : ""}
</section>`;
}
function geneImg(verified) {
  const v = (m) => (verified ? "ver" : m);
  return `<section class="recipe" aria-labelledby="recipe-title">
  <div class="sec-head"><h2 id="recipe-title" class="en-head"><span class="en">RECIPE</span>配方</h2><span class="sec-meta">6 项${verified ? " · 5 项经复刻证实" : ""}</span></div>
  <div class="genes">
    <div class="gene"><h3>色板 ${M(v("obs"))}</h3><div class="swatches">${[["#ece6da", "纸底"], ["#141414", "墨黑"], ["#f2542d", "朱橙"], ["#cfc8ba", "网格灰"]].map(([c, n]) => `<span><i style="background:${c}"></i><b>${c}</b>${n}</span>`).join("")}</div></div>
    <div class="gene"><h3>字体 ${M(v("inf"))}</h3><p class="type-sample">SUMMER</p><p class="mono">Helvetica Neue · 900 · 字距 −4.5% · 两行齐左</p></div>
    <div class="gene"><h3>构图 ${M(v("obs"))}</h3><div class="comp"><svg viewBox="0 0 60 80"><rect width="60" height="80" fill="none" stroke="currentColor" stroke-width=".6"/><circle cx="39" cy="42" r="23" fill="none" stroke="currentColor"/><path d="M0 58 L60 46" stroke="currentColor" stroke-width="3"/><path d="M4 8h30M4 20h30" stroke="currentColor" stroke-width="3"/></svg><p>六栏网格；大圆偏右下占 60%；黑色斜条 −12°；标题压左上两行；信息条贴底</p></div></div>
    <div class="gene"><h3>质感与光影 ${M("inf")}</h3><p>平涂无光影；纸底轻微颗粒；无描边无阴影</p></div>
    <div class="gene wide"><h3>生图提示词 ${M(v("inf"))}</h3><pre class="code">Swiss style event poster, off-white paper #ECE6DA, large flat <em>{主色}</em> circle lower-right,
black diagonal band −12°, huge bold grotesk headline "<em>{标题}</em>" two lines top-left,
6-column hairline grid, small mono info line "<em>{信息}</em>", flat, no gradient, no shadow</pre><p class="mono neg">反向提示词：photo, 3d, gradient, glow, serif, clutter</p></div>
  </div>
</section>`;
}
function variants() {
  return `<section class="variants" aria-labelledby="var-title">
  <div class="sec-head"><h2 id="var-title" class="en-head"><span class="en">VARIATIONS</span>举一反三</h2><span class="sec-meta">2 件 · 将作为 Skill 示例</span></div>
  <div class="var-row">
    <figure>${poster({ title: "WINTER", sub: "TYPE", info: "12.20—12.22 · 北京", circle: "#2d6cf2", cx: 190, cy: 200, r: 110 })}<figcaption>“同风格，冬季字体展，主色换钴蓝”</figcaption></figure>
    <figure>${poster({ title: "NIGHT", sub: "RUN", info: "每周四 21:00 · 滨江", circle: "#1f9e6a", cx: 205, cy: 220, r: 100 })}<figcaption>“同风格，城市夜跑活动”</figcaption></figure>
  </div>
</section>`;
}
function forge2(done) {
  const files = ["SKILL.md", "palette.json", "prompt.txt", "negative.txt", "reference.png", "examples/winter-type.png", "examples/night-run.png"];
  return `<section class="forge2${done ? " done" : ""}" aria-labelledby="forge-title">
  <div class="egg">${r.pixel("egg", 52)}</div>
  <div class="forge-info"><span class="en">FORGE · SKILL</span><h2 id="forge-title">瑞士海报风格</h2><p class="files">${files.map((f) => `<span>${f}</span>`).join("")}</p></div>
  ${done ? `<span class="forge-done"><span class="seal big">已炼成</span><button class="text-btn">${ic("ArrowUpRight", 15)}在资产仓库查看</button></span>` : `<button class="button go">${ic("Flame", 16)}炼成 Skill</button>`}
</section>`;
}
function geneWeb() {
  return `<section class="recipe" aria-labelledby="recipe-title">
  <div class="sec-head"><h2 id="recipe-title" class="en-head"><span class="en">RECIPE</span>配方</h2><span class="sec-meta">5 项 · 待复刻验证</span></div>
  <div class="genes">
    <div class="gene"><h3>颜色令牌 ${M("obs")}</h3><div class="swatches">${[["#0f1013", "bg"], ["#16171b", "surface"], ["#f7f8f8", "text"], ["#8a8f98", "muted"], ["#5e6ad2", "accent"]].map(([c, n]) => `<span><i style="background:${c}"></i><b>${c}</b>${n}</span>`).join("")}</div></div>
    <div class="gene"><h3>字号与字重 ${M("obs")}</h3><p class="mono">Inter · 22/600 标题 · 13/400 正文 · 11 等宽日期 · 行高 1.5</p></div>
    <div class="gene"><h3>间距与圆角 ${M("inf")}</h3><p class="mono">4 的倍数；区块 52；圆角 6 / 胶囊 999；描边 1px #2a2c33</p></div>
    <div class="gene"><h3>版式 ${M("obs")}</h3><p>日期栏 90px 左对齐 + 内容栏 300px；顶栏 34px；条目间距 52</p></div>
    <div class="gene wide"><h3>复刻页 ${M("inf")}</h3><pre class="code">replica/index.html · 3.2 KB · 用上面的令牌写成，可直接在浏览器打开</pre></div>
  </div>
</section>`;
}
function testsFn() {
  const T = [["点“上下文接力”后自动找出最近一段会话", 1], ["可换一段，显示总段数", 1], ["可找更早的会话", 1], ["选择接力目标，提示能否直接填入", 1], ["“只复制提示词”只写剪贴板", 1], ["“带到 X 继续”复制并打开应用", 1], ["会话只在本机，页脚说明不上传", 1], ["不可读目录给出红色提示条", 0], ["目标按钮名随选择变化", 1]];
  return `<section class="recipe" aria-labelledby="recipe-title">
  <div class="sec-head"><h2 id="recipe-title" class="en-head"><span class="en">RECIPE</span>配方 · 验收用例</h2><span class="sec-meta">8 / 9 通过</span></div>
  <ol class="cases">${T.map(([t, ok], i) => `<li class="${ok ? "ok" : "no"}">${ic(ok ? "CircleCheck" : "CircleX", 16)}<span class="mono">AC-${String(i + 1).padStart(2, "0")}</span>${t}</li>`).join("")}</ol>
  <div class="genes" style="margin-top:var(--s-4)">
    <div class="gene"><h3>流程 ${M("obs")}</h3><p>返回 Agent → 接着哪段会话 → 换一段 / 找更早 → 带到哪里继续 → 复制并打开</p></div>
    <div class="gene"><h3>边界 ${M("inf")}</h3><p>目录不可读：红色提示条“Agent 会话目录不可读取”；不阻塞复制</p></div>
  </div>
</section>`;
}
function reverseHeading2() {
  let h = r.heading("references", { description: "把参照物逆推成配方，验证能 1:1 复刻，再举一反三。" });
  h = h.replace(/<h1>([^<]*)<\/h1>/, `<div class="title-row"><h1>$1</h1><button class="page-help" aria-label="这页怎么用">?</button></div>`);
  h = h.replace(/<\/header>$/, `<div class="page-heading-action"><button class="button">${ic("Plus", 16)}投入参照物</button></div></header>`);
  return h + `<ul class="page-bounds" aria-label="边界"><li>只逆向你提供或公开的材料</li><li>配方经复刻验证才算数</li></ul>`;
}
function bench2(mode) {
  if (mode === "img")
    return `<div class="bench m-screen">${head2("IMG", "SUMMER NOISE 音乐节海报", "BEHANCE.NET · 10/04 · RE-0415", 2)}
  ${compare({ left: poster(), right: poster({ r: 112, cx: 192, cy: 214, shift: 2 }), scores: [["构图", 5], ["色彩", 5], ["字体", 4], ["质感", 4]], note: "复刻由 机械邪龙兽（Codex）只凭配方完成；左右拖动中间的手柄对照" })}</div>${geneImg(false)}`;
  if (mode === "web")
    return `<div class="bench m-screen">${head2("WEB", "Linear 更新日志页", "LINEAR.APP · 10/03 · RE-0414", 2)}
  ${compare({ left: webshot(), right: `<div class="await">${webshot(true)}<span>${ic("Hourglass", 18)}等待复刻</span></div>`, waiting: true })}
  ${launch2("复刻", { chars: "3,410", n: 2 })}</div>${geneWeb()}`;
  if (mode === "fn")
    return `<div class="bench m-screen">${head2("FN", "炉子 · 上下文接力", "本机截图 ×3 · 10/05 · RE-0416", 2)}
  ${compare({ left: `<div class="frames">${[1, 2, 3].map((k) => `<span class="frame"><i>${k}</i></span>`).join("")}</div>`, right: `<div class="frames rep">${[1, 2, 3].map((k) => `<span class="frame"><i>${k}</i></span>`).join("")}</div>`, auto: ["验收用例 8 / 9", 89], scores: [["交互细节", 3], ["文案", 4]], confirmed: true, note: "AC-08 未通过：复刻没有在目录不可读时显示提示条。把这一条写进配方后再复刻一次。" })}</div>${testsFn()}`;
  if (mode === "done")
    return `<div class="bench m-screen">${head2("IMG", "野口勇展览海报", "本机截图 · 09/30 · RE-0408", 5)}
  ${compare({ left: poster({ title: "ISAMU", sub: "NOGUCHI", info: "09.01—11.30 · 美术馆", circle: "#c8372d" }), right: poster({ title: "ISAMU", sub: "NOGUCHI", info: "09.01—11.30 · 美术馆", circle: "#c8372d", r: 114, shift: 1 }), scores: [["构图", 5], ["色彩", 5], ["字体", 5], ["质感", 4]], confirmed: true, note: "你在 10/01 打分 95%：纸底颗粒略弱，其余一致" })}</div>${variants()}${forge2(true)}`;
  if (mode === "handoff")
    return `<div class="bench m-screen">${head2("TXT", "产品发布帖的节奏", "X.COM · 10/02 · RE-0412", 1)}
  <div class="specimen-txt"><span class="en">ORIGINAL · 原文 · 1,120 字</span><p>今天发布 v2。三句话说清：它更快、它更稳、它终于支持离线。</p><p>为什么花了半年？因为我们重写了同步引擎……</p></div>
  ${launch2("逆推", { chars: "2,860", n: 0 })}</div>`;
  return `<div class="bench m-screen bench-empty"><span class="en">SPECIMEN</span><h2>还没有参照物</h2><p>海报、网页、功能或一段好文字，投进来，逆推成能复刻的配方。</p><button class="button go">${ic("Plus", 16)}投入第一件</button></div>`;
}
const reverse2 = (mode) => {
  const active = { img: 0, web: 1, fn: 2, handoff: 3, done: 4 }[mode] ?? -1;
  return page("references", "02", "逆向工程", "逆向工程", reverseHeading2() + `<div class="re-layout">${rail2(active, mode === "empty")}<div class="re-main">${bench2(mode)}</div></div>`);
};
for (const [file, mode] of [["reverse", "img"], ["reverse-web", "web"], ["reverse-fn", "fn"], ["reverse-done", "done"], ["reverse-handoff", "handoff"], ["reverse-empty", "empty"]])
  await emit(`${file}.html`, reverse2(mode));
console.log("pages: reverse v2 ×6");

// ---------- 银饰计划（简报 04）：图鉴为主（有序的格子），灵感墙在下（略散的品牌堆） ----------
// 图片一律用黑块示意（用户会上传真实图片）；剪影为简单的白色描边示意；品牌名为虚构。
const SIL = {
  pendant: `<circle cx="30" cy="40" r="15"/><circle cx="30" cy="40" r="9"/><path d="M30 25 V10 M18 6 Q30 14 42 6"/>`,
  cross: `<path d="M30 12 V58 M18 26 H42"/><circle cx="30" cy="8" r="4"/>`,
  ring: `<ellipse cx="30" cy="40" rx="16" ry="12"/><rect x="24" y="18" width="12" height="10" rx="2"/>`,
  bangle: `<ellipse cx="30" cy="36" rx="22" ry="16"/><ellipse cx="30" cy="36" rx="17" ry="11"/>`,
  chain: `${[0, 1, 2, 3, 4].map((k) => `<ellipse cx="${10 + k * 10}" cy="36" rx="6" ry="4"/>`).join("")}`,
  skull: `<path d="M18 30 Q18 12 30 12 Q42 12 42 30 Q42 38 36 40 V46 H24 V40 Q18 38 18 30Z"/><circle cx="25" cy="29" r="3"/><circle cx="35" cy="29" r="3"/>`,
};
const silImg = (k, wish = false) => `<img class="sil${wish ? " wish" : ""}" src="../sprites/sil-${k}.png" alt="" aria-hidden="true">`;
const sil = (k, dashed = false) => `<svg class="sil${dashed ? " wish" : ""}" viewBox="0 0 60 64" aria-hidden="true"><g fill="none" stroke="currentColor" stroke-width="${dashed ? 1.6 : 2}" ${dashed ? 'stroke-dasharray="3 3"' : ""} stroke-linecap="round" stroke-linejoin="round">${SIL[k]}</g></svg>`;
// 剪影为用户 2026-10-05 提供的四张银饰图生成的白色描边剪影（sprites/sil-*.png，见 silhouettes.py）。
const CATS = [
  ["戒指", "RING", 3, [["filled", "ring", "獠牙心戒"], ["filled", "ring", "素圈"], ["wish", "ring", "OLD MOON WORKS"]]],
  ["项链", "NECKLACE", 4, [["filled", "necklace", "粗 O 字链"], ["filled", "necklace", "蛇扣长链"], ["empty"], ["empty"]]],
  ["手镯", "BANGLE", 3, [["filled", "bangle", "骷髅开口镯"], ["wish", "bangle", "IRON ROSE"], ["empty"]]],
  ["吊坠", "PENDANT", 3, [["filled", "pendant", "缠蛇十字"], ["empty"], ["empty"]]],
];
const filledN = (c) => c[3].filter((x) => x[0] === "filled").length;
const BRANDS = [
  ["OLD MOON WORKS", 6, 3, 4],
  ["IRON ROSE", 4, 22, 13],
  ["ARGENT LAB", 9, 42, 2],
  ["NORTH SMITH", 3, 11, 55],
  ["LITTLE SKULL", 5, 33, 57],
];
const divider = `<div class="rule" aria-hidden="true"><i></i><span class="gem"></span><i></i></div>`;
const photo = (seed, cls = "") => `<span class="ph ${cls}" style="--s:${seed}"><i></i></span>`; // 黑块示意
function silverHeading(empty) {
  let h = r.heading("silver", { description: "只给自己看的银饰图鉴。" });
  h = h.replace(/<h1>([^<]*)<\/h1>/, `<div class="title-row"><h1>$1</h1><button class="page-help" aria-label="这页怎么用">?</button></div>`);
  h = h.replace(/<\/header>$/, `<div class="page-heading-action"><button class="button secondary">${ic("Images", 16)}加灵感</button><button class="button">${ic("Plus", 16)}收录一件</button></div></header>`);
  return h + `<ul class="page-bounds" aria-label="边界"><li>图片只存本机</li><li>不进备份，也不上传</li></ul>`;
}
function overview(empty) {
  const got = empty ? 0 : CATS.reduce((a, c) => a + filledN(c), 0), goal = empty ? 0 : CATS.reduce((a, c) => a + c[2], 0);
  return `<section class="ov" aria-label="图鉴进度">
  <div class="ov-num"><b>${String(got).padStart(2, "0")}<small>/ ${String(goal).padStart(2, "0")}</small></b><span class="ov-cap">已收录 / 目标</span></div>
  <div class="ov-cats">${empty ? `<span class="ov-empty">还没有设定品类</span>` : CATS.map((c) => `<span class="pill"><b>${c[0]}</b><span class="pips">${Array.from({ length: c[2] }, (_, i) => `<i class="${i < filledN(c) ? "on" : c[3][i]?.[0] === "wish" ? "wish" : ""}"></i>`).join("")}</span><span class="mono">${filledN(c)}/${c[2]}</span></span>`).join("")}</div>
</section>`;
}
// 收藏格（用户 2026-10-05 第三版）：未上传 = 该品类的默认剪影（暗）；上传了自己的收藏 = 那件实物的白边剪影（亮）；
// 心愿 = 默认剪影的青色虚影；格子里不放任何文字。四个品类两列两行排布，压缩高度。
// 视觉稿没有真实收藏，“已收录”暂用默认剪影的明亮版示意；落地后显示用户上传实物的自动抠图白边剪影。
function dex(empty) {
  const got = empty ? 0 : CATS.reduce((a, c) => a + filledN(c), 0), goal = CATS.reduce((a, c) => a + c[2], 0);
  return `<section class="dex case" aria-label="收藏格">
  <div class="case-head"><b class="mono-big">${String(got).padStart(2, "0")}<small>/ ${String(goal).padStart(2, "0")}</small></b><span class="cap">已收录</span></div>
  <div class="cats">${CATS.map((c) => `<div class="cat">
    <div class="cat-label"><b>${c[0]}</b><span class="mono">${empty ? 0 : filledN(c)}/${c[2]}</span></div>
    <div class="slots">${c[3].map(([st, k, name]) => {
      const state = empty ? "default" : st === "filled" ? "filled" : st === "wish" ? "wish" : "default";
      const label = state === "filled" ? `${c[0]}：${name}` : state === "wish" ? `${c[0]} 心愿：${name} 同款` : `${c[0]}：待收录，点击上传`;
      return `<button class="slot ${state}" aria-label="${label}"><img class="sil" src="../sprites/sil-${CATS_SIL[c[0]]}.png" alt=""></button>`; }).join("")}</div>
  </div>`).join("")}</div>
</section>`;
}
const CATS_SIL = { 戒指: "ring", 项链: "necklace", 手镯: "bangle", 吊坠: "pendant" };
function pile([brand, count, x, y], i, { fan = false } = {}) {
  const cards = Array.from({ length: Math.min(count, 4) }, (_, k) => `<button class="pc" style="--k:${k};--r:${[-5, 4, -2, 6][k]}deg" aria-label="${brand} 第 ${k + 1} 张">${photo(i * 4 + k)}<span class="pc-cap mono">SILVER / ${String(k + 1).padStart(3, "0")}</span></button>`).reverse().join("");
  return `<div class="pile${fan ? " fan" : ""}" style="--x:${x}%;--y:${y}%" data-pile>
  <div class="pile-cards">${cards}</div>
  <span class="pile-cap"><b class="mono">${brand}</b><span class="mono">× ${count}</span></span>
</div>`;
}
function wall(empty, { fan = -1 } = {}) {
  const headline = "";
  if (empty)
    return `<section class="wall" aria-label="灵感墙">${headline}<div class="canvas empty"><div class="pile ghost" style="--x:40%;--y:20%"><div class="pile-cards"><span class="pc ghost"></span><span class="pc ghost" style="--k:1;--r:5deg"></span></div></div><p class="canvas-empty">看到喜欢的银饰，拖进来；同一个品牌会自动叠成一堆。</p></div></section>`;
  return `<section class="wall" aria-label="灵感墙">${headline}
  <div class="canvas">
    ${BRANDS.map((b, i) => pile(b, i, { fan: i === fan })).join("")}
    <div class="hero-card" style="--x:66%;--y:9%"><span class="no-tag"><span class="en">No.</span>006</span><button class="pc big" aria-label="OLD MOON WORKS · 月相硬币吊坠">${photo(99)}<span class="pc-cap mono">OLD MOON WORKS / 006</span></button><button class="bubble">${ic("Heart", 15)}想要同款<span class="mono">→ 项链</span></button></div>
  </div>
</section>`;
}
function detail() {
  return `<div class="sheet-scrim"></div><section class="sheet" role="dialog" aria-label="灵感详情">
  <button class="icon-btn close" aria-label="关闭">${ic("X", 18)}</button>
  <div class="sheet-photo">${photo(99, "tall")}</div>
  <div class="sheet-info">
    <span class="en">INSPIRATION · OLD MOON WORKS · No.006</span>
    <h2>月相硬币吊坠</h2>
    <dl><div><dt>收进来</dt><dd class="mono">2026/10/02</dd></div><div><dt>来源</dt><dd>小红书 · <a href="#">打开链接</a></dd></div><div><dt>备注</dt><dd>边缘做旧的手感，链子要再细一号。</dd></div></dl>
    <div class="sheet-act"><button class="button">${ic("Heart", 16)}想要同款 → 项链</button><button class="button secondary">${ic("PenLine", 16)}编辑</button><button class="text-btn">${ic("Trash2", 15)}移到回收区</button></div>
    <div class="sheet-more"><span class="en">SAME BRAND · 同一堆</span><div class="mini">${[1, 2, 3, 4, 5].map((k) => photo(k)).join("")}</div></div>
  </div>
</section>`;
}
const SILVER_JS = `<script>
// 视觉稿演示：悬停散开（CSS）、点击品牌堆展开成扇、点击卡片从原位放大成详情。
document.addEventListener("click", (e) => {
  const card = e.target.closest(".pc"), pile = e.target.closest("[data-pile]");
  if (pile && !pile.classList.contains("fan") && !e.target.closest(".pile.fan")) { document.querySelectorAll(".pile.fan").forEach((p) => p.classList.remove("fan")); pile.classList.add("fan"); return; }
  if (card && !matchMedia("(prefers-reduced-motion: reduce)").matches) {
    const r0 = card.getBoundingClientRect(), ghost = card.cloneNode(true);
    Object.assign(ghost.style, { position: "fixed", left: r0.left + "px", top: r0.top + "px", width: r0.width + "px", height: r0.height + "px", margin: 0, zIndex: 60, transform: "none" });
    document.body.appendChild(ghost);
    const w = Math.min(420, innerWidth * 0.8), h = w * 4 / 3;
    ghost.animate([{ transform: "none" }, { transform: \`translate(\${innerWidth / 2 - w / 2 - r0.left}px, \${innerHeight / 2 - h / 2 - r0.top}px) scale(\${w / r0.width}, \${h / r0.height})\` }], { duration: 420, easing: "cubic-bezier(.2,.8,.2,1)", fill: "forwards" }).finished.then(() => { ghost.remove(); location.href = "silver-detail.html"; });
  } else if (card) location.href = "silver-detail.html";
});
</script>`;
const silver = (mode) => {
  const empty = mode === "empty";
  const body = silverHeading(empty) + wall(empty, { fan: mode === "fan" ? 0 : -1 }) + divider + dex(empty) + (empty ? "" : `<details class="recycle"><summary>${ic("Archive", 15)}回收区 <span class="mono">2</span></summary></details>`) + (mode === "detail" ? detail() : "") + SILVER_JS;
  return page("silver", "12", "银饰计划", "银饰计划", body).replace('class="main-content page-silver v14 v16"', 'class="main-content page-silver v16"');
};
for (const [file, mode] of [["silver", "default"], ["silver-fan", "fan"], ["silver-detail", "detail"], ["silver-empty", "empty"]])
  await emit(`${file}.html`, silver(mode));
console.log("pages: silver ×4");

// ---------- 随手记（简报 05）：屏幕便签墙；所见即所得；存储仍是 md1，这里用真实解析器渲染合成正文 ----------
const RN = await import(pathToFileURL(join(root, "src/rich-note.js")));
const NOTES = [
  { id: "n8", at: "10/05 21:12", text: "[首页第一眼应该回答“今天要做什么”。]{yellow}\n数字放大、可点；装饰退后。" },
  { id: "n7", at: "10/05 18:40", text: "[验收清单要非技术]{red}\n- [ ] 改写终验清单：点哪里、看到什么算过\n- [x] 复跑全部浏览器脚本\n- [ ] 截图换成合成数据" },
  { id: "n6", at: "10/05 15:02", text: "[逆向工程打分项]{blue}\n1. 构图\n2. 色板\n3. 字体与字重\n4. 质感" },
  { id: "n5", at: "10/04 23:30", text: "[好的空状态保持页面形态]{green}，不用大框。\n协同没数据时，两台暴龙机变暗就够了。" },
  { id: "n4", at: "10/04 11:05", text: "夜巡先想清楚：跑什么、怎么跑、价值在哪。预算不是停止条件。", refined: "夜巡原则" },
  { id: "n3", at: "10/03 22:10", text: "周末\n- [ ] 给银饰拍白底图\n- [x] 更新日历提醒\n- [x] 整理 refs 文件夹" },
  { id: "n2", at: "10/03 09:00", text: "[学习成长、银饰最后再做。]{gray}" },
  { id: "n1", at: "10/02 20:16", text: "为什么资产仓库好看：形态来自内容本质。逐条记录，所以一屏一屏地陈列；Skill 是数码蛋，用了会成长；Prompt 是对话框。层级手艺在粗细、大小、中英文和动效，几乎没有解释文字。其他页要先回答这页做什么、主角是谁、为什么这样排，再谈样式。v15 只当素材，不当起点；每页同等认真。", long: true },
];
const TILT = [-0.8, 0.7, -0.4, 0.9, -1, 0.5, -0.6, 0.8, -0.3];
const esc = (t) => t.replace(/&/g, "&amp;").replace(/</g, "&lt;");
const spans = (t) => RN.inline(t).map((p) => (p.ink ? `<span class="ink-${p.ink}">${esc(p.text)}</span>` : esc(p.text))).join("");
const box = (on) => `<span class="sn-box${on ? " on" : ""}" aria-hidden="true">${on ? ic("Check", 13) : ""}</span>`;
function noteBody(text) {
  return RN.parseNote(text).map((b) => {
    if (b.type === "ul") return `<ul class="sn-ul">${b.items.map((i) => `<li>${spans(i.text)}</li>`).join("")}</ul>`;
    if (b.type === "ol") return `<ol class="sn-ol" start="${b.start}">${b.items.map((i) => `<li>${spans(i.text)}</li>`).join("")}</ol>`;
    if (b.type === "tasks") return `<ul class="sn-tasks">${b.items.map((i) => `<li class="${i.checked ? "done" : ""}"><label>${box(i.checked)}<input type="checkbox"${i.checked ? " checked" : ""} aria-label="${esc(RN.plainText(i.text))}"><span>${spans(i.text)}</span></label></li>`).join("")}</ul>`;
    return `<p>${b.items.map((i) => spans(i.text)).join("<br>")}</p>`;
  }).join("");
}
const toneOf = (text) => RN.inline(text).find((p) => p.ink)?.ink || "plain";
function sticky(n, i, { hover = false, failed = false } = {}) {
  return `<article class="sn tone-${toneOf(n.text)}${hover ? " is-hover" : ""}${n.long ? " is-long" : ""}${failed ? " is-failed" : ""}" style="--tilt:${TILT[i % TILT.length]}deg">
  <i class="sn-tape" aria-hidden="true"></i>
  <header><time class="sn-time">${n.at}</time>${n.refined ? `<span class="sn-seal">${ic("Flame", 13)}<b>${n.refined}</b></span>` : ""}</header>
  <div class="sn-body">${noteBody(n.text)}</div>
  ${n.long ? `<button class="sn-more">展开全文</button>` : ""}
  <footer class="sn-act"><button class="sn-ico" aria-label="复制">${ic("Copy", 16)}</button>${n.refined ? "" : `<button class="sn-ico fire" aria-label="炼入焚决">${ic("Flame", 16)}</button>`}</footer>
</article>`;
}
const INKS = [["red", "红"], ["blue", "蓝"], ["green", "绿"], ["yellow", "黄"], ["gray", "灰"]];
function pad(editing) {
  if (!editing)
    return `<button class="sn-pad" aria-label="记一条新念头"><span class="sn-pad-hint">${ic("Plus", 18)}一个念头、一个问题……</span><span class="sn-pad-key">⌘↵ 贴上</span></button>`;
  const draft = "[重排日历]{red}：日历格不再和 todo 挤一行\n- [x] 先画 1440 视觉稿\n- [ ] 390 下 todo 放到日历下面\n周二前给到 Codex";
  return `<div class="sn-pad editing" role="group" aria-label="新念头">
  <div class="sn-edit" contenteditable="true" aria-label="随手记内容">${noteBody(draft)}<span class="sn-caret"></span></div>
  <div class="sn-tools" role="toolbar" aria-label="格式">
    <button class="sn-ico" aria-label="无序列表">${ic("List", 17)}</button><button class="sn-ico" aria-label="有序列表">${ic("ListOrdered", 17)}</button><button class="sn-ico on" aria-label="待办">${ic("ListChecks", 17)}</button>
    <i class="sn-sep" aria-hidden="true"></i>
    ${INKS.map(([k, l]) => `<button class="sn-ico sn-ink ink-${k}${k === "red" ? " on" : ""}" aria-label="${l}色"><b>A</b></button>`).join("")}
    <button class="sn-ico sn-ink-pick ink-red" aria-label="字色：红（点开选色）" aria-haspopup="true"><b>A</b>${ic("ChevronDown", 12)}</button>
    <span class="sn-tools-end"><span class="sn-key">⌘↵</span><button class="sn-post">贴上 ${ic("ArrowUpRight", 16)}</button></span>
  </div>
</div>`;
}
function notesHeading() {
  let h = r.heading("notes", { description: "先把念头记下来；值得反复用的，炼入焚决。" });
  h = h.replace(/<h1>([^<]*)<\/h1>/, `<div class="title-row"><h1>$1</h1><button class="page-help" aria-label="这页怎么用">?</button></div>`);
  return h + `<ul class="page-bounds" aria-label="边界"><li>只存本机</li></ul>`;
}
function notesFilter(empty) {
  const c = empty ? [0, 0, 0] : [NOTES.length, NOTES.filter((n) => /^- \[[ xX]\] /m.test(n.text)).length, NOTES.filter((n) => n.refined).length];
  return `<div class="sn-filter" role="radiogroup" aria-label="随手记筛选">${["全部", "待办", "已炼"].map((l, i) => `<button role="radio" aria-checked="${i === 0}" class="${i === 0 ? "on" : ""}">${l}<b>${c[i]}</b></button>`).join("")}</div>`;
}
// 瀑布流：视觉稿按三列手排（实现用真正的瀑布流）；编辑中空白便签横跨两列。
function wallOf(mode) {
  if (mode === "empty") return `<div class="sn-wall"><div class="sn-col">${pad(false)}</div><div class="sn-col"></div><div class="sn-col"></div></div><div class="sn-list">${pad(false)}</div>`;
  const fail = mode === "error";
  const cols = [[], [], []];
  const order = mode === "editing" ? NOTES : [null, ...NOTES];
  order.forEach((n, i) => cols[i % 3].push(n ? sticky(n, i, { hover: mode === "default" && n.id === "n6", failed: fail && n.id === "n5" }) : pad(false)));
  const top = mode === "editing" ? `<div class="sn-top">${pad(true)}</div>` : "";
  // 390 单列按时间顺序（另一份 DOM 只为视觉稿方便；实现用同一份瀑布流在窄屏变一列）。
  const list = `<div class="sn-list">${order.map((n, i) => (n ? sticky(n, i, { failed: fail && n.id === "n5" }) : pad(false))).join("")}</div>`;
  return `${top}<div class="sn-wall">${cols.map((c) => `<div class="sn-col">${c.join("")}</div>`).join("")}</div>${list}`;
}
const toast = `<div class="sn-toast" role="alert">${ic("RotateCcw", 16)}<span>没保存上，已退回原文</span><button class="text-btn">重试</button></div>`;
const notes = (mode) => page("notes", "09", "随手记", "随手记", `${notesHeading()}<div class="sn-page">${notesFilter(mode === "empty")}${wallOf(mode)}${mode === "error" ? toast : ""}</div>`);
for (const [file, mode] of [["notes", "default"], ["notes-editing", "editing"], ["notes-empty", "empty"], ["notes-error", "error"]])
  await emit(`${file}.html`, notes(mode));
console.log("pages: notes ×4");

// ---------- 项目空间（简报 06）：读档画面。存档槽 = 在推进项目；最近 3 个 = 卡带 / 徽章（两版）；其余紧凑列表 ----------
const PJ_STAGES = ["认领", "实现", "复核", "返修", "验收"];
const HUE = { orange: "255,138,36", cyan: "77,227,255", violet: "168,145,255", pink: "255,143,184", lime: "166,227,110", yellow: "255,209,102" };
const SAVES = [
  { name: "个人 AI 工作台", path: "~/Documents/…/personal-ai-workbench", writer: 1, next: "认领派单173：逆向工程按 UI v16 落地，开工先冻结视觉稿参照", stage: 1, at: "今天 13:20", heat: 0.85, safety: 0 },
  { name: "银饰作品集", path: "~/Projects/silver", writer: -1, next: "补齐收藏格四类剪影，回读后交接", stage: 4, at: "10/03", heat: 0.4, safety: 1 },
  { name: "旧博客", path: "~/Projects/blog", writer: 0, next: "迁移到 Astro 后核对 RSS 与旧链接跳转", stage: 2, at: "09/14", heat: 0.08, safety: 0, stalled: 21 },
];
// 全部项目：每个扫描目录一个卡带架，架内按最近更新排序（最近在上）；在推进的项目也在架上，标出存档槽号。
const RACKS = [
  ["~/Projects", "LOCAL", [["dotfiles", "~/Projects/dotfiles", "10/04"], ["银饰作品集", "~/Projects/silver", "10/03", "slot:02"], ["菜谱盒子", "~/Projects/recipe-box", "09/30"], ["photo-sorter", "~/Projects/photo-sorter", "09/22"], ["旧博客", "~/Projects/blog", "09/14", "slot:03"], ["travel-notes", "~/Projects/travel-notes", "09/11"], ["old-api", "~/Projects/old-api", "08/30", "身份待确认"]]],
  ["~/Documents", "LOCAL", [["个人 AI 工作台", "~/Documents/…/personal-ai-workbench", "今天", "slot:01"], ["论文笔记", "~/Documents/thesis-notes", "08/02"]]],
  ["GitHub", "GIT", [["ai-ui-users", "github.com/nat/ai-ui-users", "10/02"], ["digimon-sprites", "github.com/nat/digimon-sprites", "07/18", "本次未检出"], ["resume-site", "github.com/nat/resume-site", "未知"]]],
];
// 确定性的 30 天活动（视觉稿用，按项目序号与热度生成）
const heatCells = (seed, k) => Array.from({ length: 30 }, (_, i) => { const v = (Math.sin(seed * 7.3 + i * 1.9) + 1) / 2; return v < 1 - k ? 0 : Math.min(4, 1 + Math.floor((v - (1 - k)) / (k / 4 + 0.001))); });
const floppy = `<svg class="pj-floppy" viewBox="0 0 10 10" shape-rendering="crispEdges" aria-hidden="true"><path d="M1 1h7l1 1v7H1z" fill="currentColor" opacity=".9"/><path d="M3 1h4v3H3z" fill="var(--bg)"/><path d="M5 1.5h1v2H5z" fill="currentColor"/><path d="M2.5 6h5v2.5h-5z" fill="var(--bg)" opacity=".75"/></svg>`;
function holder(w) {
  if (w < 0) return `<span class="pj-holder none">${sprite("agumon", 64, "ghost")}<span class="pj-holder-name">无人持笔</span></span>`;
  const c = CAST[w];
  return `<span class="pj-holder" style="--hue:${c.hue}">${sprite(c.ch, c.big ? 84 : 58)}<span class="pj-holder-name">${SPR[c.ch].name}<span class="en">${c.name}</span></span></span>`;
}
function saveCard(s, i, { unreadable = false } = {}) {
  const stalled = !!s.stalled;
  return `<article class="pj-save${stalled ? " stalled" : ""}" aria-label="存档 ${i + 1}：${s.name}">
  <header class="pj-save-head">
    <span class="pj-slot">${floppy}<span class="en">SLOT ${String(i + 1).padStart(2, "0")}</span></span>
    ${s.safety ? `<span class="pj-alert" title="安全体检：${s.safety} 个问题">${s.safety}</span>` : ""}
    ${stalled ? `<span class="pj-zzz" aria-label="停滞 ${s.stalled} 天"><i>z</i><i>z</i><i>Z</i></span>` : ""}
  </header>
  <div class="pj-save-title"><h3>${s.name}</h3><span class="pj-path">${s.path}</span></div>
  <div class="pj-save-main">
    ${holder(s.writer)}
    <div class="pj-next">
      <span class="en">NEXT · 下一步</span>
      ${unreadable ? `<p class="pj-unread">${ic("FileWarning", 16)}读不到 CURRENT<small>CURRENT.md 不存在</small></p>` : `<p>${s.next}</p>`}
    </div>
  </div>
  <ol class="pj-stages" aria-label="接力阶段">${PJ_STAGES.map((l, k) => `<li class="${unreadable ? "" : k < s.stage ? "done" : k === s.stage ? "on" : ""}"${!unreadable && k === s.stage ? ' aria-current="step"' : ""}>${l}</li>`).join("")}</ol>
  <div class="pj-heat" aria-label="近 30 天活动">${(unreadable ? Array(30).fill(-1) : heatCells(i + 1, s.heat)).map((v) => `<i class="l${v}"></i>`).join("")}<span class="en">${unreadable ? "未知" : stalled ? `停滞 ${s.stalled} 天` : s.at}</span></div>
  <footer class="pj-save-act"><button class="button pj-go">${ic("Play", 15)}继续</button><button class="text-btn">详情 ${ic("ChevronRight", 15)}</button></footer>
</article>`;
}
const emptySlot = (i, hint = "从下面挑一盘开新档") => `<button class="pj-save pj-vacant" aria-label="空存档 ${i + 1}"><span class="pj-slot">${floppy}<span class="en">SLOT ${String(i + 1).padStart(2, "0")}</span></span><span class="pj-empty-hint">空存档<small>${hint}</small></span></button>`;
function pjLaunch() {
  const pick = [CAST[1], CAST[0], CAST[2], CAST[3]];
  return `<section class="pj-launch" aria-label="继续：个人 AI 工作台">
  <div class="pj-launch-row">
    <div class="pj-picks" role="radiogroup" aria-label="交给谁">${pick.map((c, k) => `<button role="radio" aria-checked="${k === 0}" class="pj-pick${k === 0 ? " on" : ""}" style="--hue:${c.hue}" aria-label="${SPR[c.ch].name}">${sprite(c.ch, c.big ? 40 : 30)}</button>`).join("")}</div>
    <button class="prompt-toggle pj-toggle" aria-expanded="false">${ic("ChevronDown", 16)}<span class="en">PROMPT</span>预览口令</button>
    <span class="pj-meta"><b>486</b> 字 · 打开 Codex 后粘贴</span>
    <span class="pj-launch-act"><button class="button secondary">${ic("Copy", 16)}只复制</button><button class="button pj-go-big">带到 <b>机械邪龙兽</b> 继续${ic("ArrowRight", 17)}</button></span>
    <button class="icon-btn pj-close" aria-label="收起">${ic("X", 16)}</button>
  </div>
</section>`;
}
// 卡槽行：插在架上的一盘卡带，只露出顶端标签条（像素阶梯切角、发光描边、扫描线）。
function slotRow([name, path, at, flag = ""], src, { hover = false } = {}) {
  const slot = flag.startsWith("slot:") ? flag.slice(5) : "";
  return `<li class="pj-cs ${src === "GIT" ? "git" : "local"}${hover ? " is-hover" : ""}${slot ? " in-save" : ""}"><button class="pj-cs-tab" aria-label="${name}：打开详情">
  <span class="pj-cs-code en">${src}</span>
  <span class="pj-cs-name"><b>${name}</b><span class="pj-path">${path}</span></span>
  ${slot ? `<span class="pj-cs-save">${floppy}<span class="en">SLOT ${slot}</span></span>` : flag ? `<span class="pj-flag">${flag}</span>` : "<span></span>"}
  <span class="en pj-row-at">${at}</span>
</button>${slot ? "" : `<button class="pj-cs-new" aria-label="开新档：${name}">开新档 ${ic("ArrowRight", 14)}</button>`}</li>`;
}
function library(mode) {
  if (mode === "empty") return `<div class="pj-none">${r.pixel("koromon", 72)}<p>没找到项目</p><button class="button secondary">${ic("RefreshCw", 16)}重新扫描</button></div>`;
  const scanning = mode === "states";
  const filters = `<div class="pj-filter" role="radiogroup" aria-label="项目筛选">${[["全部", 12], ["本地", 9], ["GitHub", 5], ["已关联", 2]].map(([l, n], k) => `<button role="radio" aria-checked="${k === 0}" class="${k === 0 ? "on" : ""}">${l}<b>${n}</b></button>`).join("")}</div><label class="pj-search">${ic("Search", 16)}<input placeholder="搜索名称、路径" aria-label="搜索项目"></label>`;
  if (scanning) return `<div class="pj-lib-tools">${filters}</div><div class="pj-skel" aria-label="扫描中">${Array(4).fill('<i></i>').join("")}</div>`;
  return `<div class="pj-lib-tools">${filters}</div>${RACKS.map(([g, src, rows], k) => `<section class="pj-rack"><h4><span class="en">RACK ${String(k + 1).padStart(2, "0")}</span><b>${g}</b><span class="en pj-rack-n">${rows.length}</span></h4><ul>${rows.map((row, i) => slotRow(row, src, { hover: k === 0 && i === 0 })).join("")}</ul></section>`).join("")}`;
}
function projectsHeading(scanning) {
  let h = r.heading("projects", { description: "挑一个存档接着干，或从库里开新档。" });
  h = h.replace(/<h1>([^<]*)<\/h1>/, `<div class="title-row"><h1>$1</h1><button class="page-help" aria-label="这页怎么用">?</button></div>`);
  h = h.replace(/<\/header>$/, `<div class="page-heading-action pj-head-act"><button class="icon-btn" aria-label="设置：扫描目录与停滞阈值">${ic("Settings2", 18)}</button><button class="icon-btn${scanning ? " spinning-btn" : ""}" aria-label="重新扫描">${ic("RefreshCw", 18)}</button></div></header>`);
  return h + `<ul class="page-bounds" aria-label="边界"><li>本地与 GitHub 自动发现</li><li>只读 CURRENT 与 Git</li></ul>`;
}
const projects = (mode) => {
  const noactive = mode === "noactive" || mode === "empty";
  const saves = noactive ? [0, 1, 2].map((i) => emptySlot(i, mode === "empty" ? "先扫描出项目" : undefined)).join("") : SAVES.map((s, i) => saveCard(s, i, { unreadable: mode === "states" && i === 1 })).join("") + (mode === "launch" ? pjLaunch() : "");
  const body = `${projectsHeading(mode === "states")}
<section class="pj-saves-sec" aria-labelledby="pj-saves-t"><div class="sec-head"><h2 id="pj-saves-t" class="en-head"><span class="en">SAVE DATA</span>在推进 · ${noactive ? 0 : 3}</h2>${noactive ? "" : `<button class="text-btn">${ic("RefreshCw", 15)}刷新</button>`}</div><div class="pj-saves${mode === "launch" ? " launching" : ""}">${saves}</div></section>
<section class="pj-lib" aria-labelledby="pj-lib-t"><div class="sec-head"><h2 id="pj-lib-t" class="en-head"><span class="en">LIBRARY</span>全部项目${mode === "empty" ? "" : " · 12"}</h2></div>${library(mode)}</section>`;
  return page("projects", "04", "项目空间", "项目空间", body);
};
for (const [file, mode] of [["projects", "default"], ["projects-launch", "launch"], ["projects-noactive", "noactive"], ["projects-empty", "empty"], ["projects-states", "states"]])
  await emit(`${file}.html`, projects(mode));
console.log("pages: projects ×5");

// ---------- 知识仓库（简报 07）：数据中枢。左：知识源 → 中：个人说明芯片（MCP）→ 右：Agent ----------
const KH_H = 420;
const KH_SOURCES = [
  { icon: "Gem", kind: "OBSIDIAN", name: "我的 Vault", count: "1,284", week: "+12", state: "ok", open: true, hue: "168,145,255" },
  { icon: "Cloud", kind: "FEISHU", name: "飞书 · 团队知识库", count: "86", week: "+1", state: "ok", open: false, hue: "111,176,255" },
  { icon: "FolderOpen", kind: "MARKDOWN", name: "~/Documents/notes", count: "312", week: "+3", state: "ok", open: false, hue: "77,227,255" },
];
const KH_AGENTS = [[0, true], [1, true], [2, false], [3, false]];
const khCenters = (n, h) => Array.from({ length: n }, (_, i) => (n === 1 ? KH_H / 2 : h / 2 + i * ((KH_H - h) / (n - 1))));
function khLines(ys, side, states, broken = false) {
  const yc = KH_H / 2;
  return `<svg class="kh-lines ${side}" viewBox="0 0 100 ${KH_H}" preserveAspectRatio="none" style="height:${KH_H}px" aria-hidden="true">${ys.map((y, i) => {
    const [a, b] = side === "in" ? [y, yc] : [yc, y];
    const st = states[i];
    return `<path class="${st ? "on" : "off"}${broken && st ? " broken" : ""}" d="M0 ${a} C50 ${a}, 50 ${b}, 100 ${b}" vector-effect="non-scaling-stroke"/>${st && !broken ? `<path class="flow" d="M0 ${a} C50 ${a}, 50 ${b}, 100 ${b}" vector-effect="non-scaling-stroke"/>` : ""}`;
  }).join("")}</svg>`;
}
function khSource(s) {
  const st = { ok: "", auth: "需授权", recheck: "需重新确认目录" }[s.state];
  return `<button class="kh-src${s.state !== "ok" ? " warn" : ""}" style="--hue:${s.hue}" aria-label="${s.name}">
  <span class="kh-src-ic">${ic(s.icon, 18)}</span>
  <span class="kh-src-main"><span class="en">${s.kind}</span><b>${s.name}</b><span class="kh-src-meta">${st ? `<em>${st}</em>` : `<span class="mono">${s.count}</span> 篇 · 本周 <span class="mono">${s.week}</span>`}</span></span>
  <span class="kh-lock${s.open ? " open" : ""}" title="${s.open ? "已开放给 Agent" : "未开放给 Agent"}">${ic(s.open ? "LockOpen" : "Lock", 14)}</span>
</button>`;
}
const khAdd = (first) => `<button class="kh-src kh-add">${ic("Plus", 18)}<b>${first ? "接入第一个知识库" : "接入知识库"}</b></button>`;
function khAgent([k, on], mcpDown) {
  const c = CAST[k];
  return `<button class="kh-agent${on ? " on" : ""}${mcpDown && on ? " down" : ""}" style="--hue:${c.hue}" aria-label="${SPR[c.ch].name}">
  <span class="kh-agent-av">${sprite(c.ch, c.big ? 44 : 32)}</span>
  <span class="kh-agent-main"><b>${SPR[c.ch].name}</b><span class="kh-agent-st">${on ? (mcpDown ? "连不上 MCP" : "已接入") : `未接入 · 复制配置`}</span></span>
</button>`;
}
function khChip(mode) {
  const empty = mode === "empty", down = mode === "error";
  return `<button class="kh-chip${empty ? " dim" : ""}${down ? " down" : ""}" aria-label="个人说明与 MCP">
  <span class="kh-chip-pins" aria-hidden="true"></span>
  <span class="kh-chip-core">
    <span class="en">PROFILE · MCP</span>
    <b>个人说明</b>
    ${empty ? `<span class="kh-chip-line">未找到 · 先接入含个人说明的知识库</span>` : `<span class="kh-chip-line"><span class="mono">6</span> 节 · <span class="mono">2,140</span> 字 · 改于 <span class="mono">10/03</span></span>`}
    <span class="kh-mcp ${down ? "bad" : empty ? "idle" : "ok"}"><i></i>${down ? "MCP 未运行" : empty ? "MCP 待命" : "MCP 运行中 · 127.0.0.1:7788"}</span>
  </span>
  ${!empty && !down ? `<span class="kh-badge" title="待采纳建议">2</span>` : ""}
</button>`;
}
function khHub(mode) {
  const empty = mode === "empty", down = mode === "error";
  const srcs = empty ? [] : KH_SOURCES.map((s) => (down && s.kind === "FEISHU" ? { ...s, state: "auth" } : s));
  const nodes = srcs.length + 1;
  const ys = khCenters(nodes, 72);
  const srcStates = [...srcs.map((s) => s.state === "ok"), false];
  const ays = khCenters(KH_AGENTS.length, 64);
  const agStates = KH_AGENTS.map(([, on]) => on && !empty);
  return `<section class="kh-hub" aria-label="数据中枢">
  <div class="kh-col kh-srcs" style="height:${KH_H}px">${srcs.map(khSource).join("")}${khAdd(empty)}</div>
  ${khLines(ys, "in", srcStates)}
  <div class="kh-center">${khChip(mode)}</div>
  ${khLines(ays, "out", agStates, down)}
  <div class="kh-col kh-agents" style="height:${KH_H}px">${KH_AGENTS.map((a) => khAgent([a[0], a[1] && !empty], down)).join("")}</div>
  <div class="kh-more"><span class="en">MORE</span><span class="kh-more-item">豆 豆包工作 · 未接入</span></div>
</section>`;
}
const KH_RESULTS = [
  ["OBSIDIAN", "168,145,255", "接力提示词的最小模板", "我的 Vault/方法/接力提示词.md", "交给下一位 Agent 时，<mark>提示词</mark>只带三样：项目唯一下一步、最后几轮原话、核对 CURRENT 的指引。<mark>接力</mark>不是复述全部历史……"],
  ["OBSIDIAN", "168,145,255", "UI v16 方法共识", "我的 Vault/项目/数码世界/UI v16.md", "每页先写页面简报，确认后出视觉稿……智能体群选角即<mark>接力</mark>，发车条预览<mark>提示词</mark>后只复制或带到伙伴继续。"],
  ["MARKDOWN", "77,227,255", "2026-09 周记", "~/Documents/notes/weekly/2026-09-28.md", "本周把<mark>接力</mark>流程跑顺了：Codex 交付后 Claude 验收，<mark>提示词</mark>里固定写“先读 CURRENT”。"],
  ["OBSIDIAN", "168,145,255", "Codex 使用笔记", "我的 Vault/工具/Codex.md", "长任务开工前给一段<mark>接力</mark>说明，避免它从头摸索；<mark>提示词</mark>里写清不能做的事。"],
];
function khSearch(mode) {
  const on = mode === "search";
  return `<section class="kh-search-sec" aria-label="跨库检索">
  <label class="kh-search">${ic("Search", 20)}<input value="${on ? "接力 提示词" : ""}" placeholder="在所有知识库里找……" aria-label="跨库检索">${on ? `<button class="icon-btn kh-clear" aria-label="清空">${ic("X", 16)}</button>` : `<span class="kh-scope en">${mode === "empty" ? "0 个库" : "3 个库"}</span>`}</label>
  ${on ? `<div class="kh-res-head"><div class="kh-filter" role="radiogroup" aria-label="按源筛选">${[["全部", 4], ["OBSIDIAN", 3], ["MARKDOWN", 1]].map(([l, n], k) => `<button role="radio" aria-checked="${k === 0}" class="${k === 0 ? "on" : ""}">${l === "全部" ? l : `<span class="en">${l}</span>`}<b>${n}</b></button>`).join("")}</div><span class="en kh-res-n">4 RESULTS · 0.12s</span></div>
  <ol class="kh-results">${KH_RESULTS.map(([k, hue, t, p, ex], i) => `<li><button class="kh-res${i === 0 ? " is-hover" : ""}" style="--hue:${hue}"><span class="kh-res-tag en">${k}</span><span class="kh-res-main"><b>${t}</b><span class="pj-path">${p}</span><span class="kh-ex">${ex}</span></span>${ic("ChevronRight", 16)}</button></li>`).join("")}</ol>` : ""}
</section>`;
}
function knowledgeHeading() {
  let h = r.heading("knowledge", { description: "所有知识库与个人说明的统一源头。" });
  h = h.replace(/<h1>([^<]*)<\/h1>/, `<div class="title-row"><h1>$1</h1><button class="page-help" aria-label="这页怎么用">?</button></div>`);
  h = h.replace(/<\/header>$/, `<div class="page-heading-action"><button class="button">${ic("Plus", 16)}接入知识库</button></div></header>`);
  return h + `<ul class="page-bounds" aria-label="边界"><li>只读</li><li>开放给 Agent 需授权</li></ul>`;
}
const knowledge = (mode) => {
  const body = `${knowledgeHeading()}${khSearch(mode)}<div class="sec-head kh-hub-head"><h2 class="en-head"><span class="en">HUB</span>数据中枢</h2><span class="sec-meta">${mode === "empty" ? "0 个库 · 0 位接入" : (mode === "error" ? "2 个库可读 · MCP 未运行" : "3 个库 · 2 位接入")}</span></div>${khHub(mode)}`;
  return page("knowledge", "07", "知识仓库", "知识仓库", body);
};
for (const [file, mode] of [["knowledge", "default"], ["knowledge-search", "search"], ["knowledge-empty", "empty"], ["knowledge-error", "error"]])
  await emit(`${file}.html`, knowledge(mode));
console.log("pages: knowledge ×4");

// ---------- 存档点（简报 08，原“版本归档”）：项目的 Git 版本。未存档进度为主角，存档点时间线在下 ----------
const SP_TABS = [
  ["个人 AI 工作台", "warn", true], ["银饰作品集", "ok", true], ["旧博客", "ok", true], ["dotfiles", "ok"], ["菜谱盒子", "nogit"], ["resume-site", "cloud"],
];
const SP_POINTS = [
  { h: "a41c9e2", msg: "UI v14e 第 1 步：公共层 + 知识仓库", wb: "WB-20261003-123", at: "10/03 21:48", files: 46, add: "1,820", del: "640", local: true },
  { h: "7be0d13", msg: "认领 UI v14e 落地（逐页交用户确认）", wb: "WB-20261003-122", at: "10/03 20:10", files: 2, add: "18", del: "6", local: true },
  { h: "c93f5a0", msg: "归档 UI v14e 设计定稿（预览 + 说明）", wb: "WB-20261003-121", at: "10/03 19:02", files: 31, add: "2,904", del: "112", tag: "v0.14" },
  { h: "52d8e7b", msg: "复核三项返修完成", wb: "WB-20261003-117", at: "10/03 11:40", files: 18, add: "406", del: "233" },
  { h: "e07a4c1", msg: "1.4 来源维护收口", wb: "WB-20260929-48", at: "09/29 22:15", files: 27, add: "1,130", del: "498", tag: "v0.13" },
];
function spTabs(active) {
  return `<div class="sp-tabs" role="tablist" aria-label="项目">${SP_TABS.map(([n, st, act], i) => `<button role="tab" aria-selected="${i === active}" class="sp-tab${i === active ? " on" : ""}"><i class="sp-dot ${st}" aria-hidden="true">${st === "cloud" ? ic("Cloud", 11) : ""}</i>${n}${act ? `<span class="en">ACTIVE</span>` : ""}</button>`).join("")}</div>`;
}
function spPending({ empty = false } = {}) {
  const dirs = empty ? [["zsh/", 14, 38], ["git/", 9, 24], ["nvim/", 11, 30], ["bin/", 3, 8]] : [["src/", 128, 46], ["docs/", 72, 26], ["tests/", 61, 21], ["server/", 23, 7]];
  const st = empty ? ["0", "37", "+2,140", "−0"] : ["104", "180", "+12,480", "−3,210"];
  return `<section class="sp-pending ${empty ? "new" : "warn"}" aria-label="未存档进度">
  <div class="sp-pend-main">
    <span class="en">UNSAVED PROGRESS · 未存档进度</span>
    <h2>${empty ? "还没有任何存档点" : `已经 <b>2 天</b>没存档了`}</h2>
    <p class="sp-pend-since">${empty ? "<span class=\"mono\">~/Projects/dotfiles</span> 刚开启存档，还没提交过；先存第一个存档点" : `上次存档 <span class="mono">10/03 21:48</span> · <span class="mono">WB-20261003-123</span> · 之后经历 <b class="mono">52</b> 次状态更新`}</p>
    <div class="sp-pend-stats">
      <span><b class="mono">${st[0]}</b><small>修改</small></span><span><b class="mono">${st[1]}</b><small>新增</small></span><span><b class="mono add">${st[2]}</b><small>行</small></span><span><b class="mono del">${st[3]}</b><small>行</small></span>
    </div>
    <div class="sp-dirs" aria-label="主要改动目录">${dirs.map(([d, n, w]) => `<span class="sp-dir" style="--w:${w}%"><i></i><span class="mono">${d}</span><b class="mono">${n}</b></span>`).join("")}</div>
  </div>
  <div class="sp-pend-act"><button class="button sp-save">${floppy}创建存档点</button><span class="sp-pend-note en">ONLY COMMIT · 不推送</span></div>
</section>`;
}
function spTimeline({ cloud = false, empty = false } = {}) {
  if (empty) return `<section class="sp-line-sec"><div class="sec-head"><h2 class="en-head"><span class="en">SAVE POINTS</span>存档点 · 0</h2></div><div class="sp-none">${floppy}<p>还没有存档点</p><small>创建第一个存档点后，会从这里开始排起</small></div></section>`;
  const pts = cloud ? [{ h: "9f02b1d", msg: "Add projects section", at: "08/21 10:02", files: 4, add: "88", del: "12" }, { h: "41ce7a9", msg: "Update resume 2026", at: "07/18 22:40", files: 2, add: "36", del: "30", tag: "v2" }, { h: "0b77e5f", msg: "Initial site", at: "05/02 09:15", files: 23, add: "1,204", del: "0" }] : SP_POINTS;
  return `<section class="sp-line-sec" aria-label="存档点时间线"><div class="sec-head"><h2 class="en-head"><span class="en">SAVE POINTS</span>存档点 · ${cloud ? 3 : 94}</h2>${cloud ? `<span class="sec-meta">仅云端 · 只读</span>` : `<span class="sp-cloud">${ic("CloudOff", 15)}<b class="mono">2</b> 个存档点还没推送到 GitHub</span>`}</div>
  <ol class="sp-line">${pts.map((p, i) => `<li class="sp-pt${p.tag ? " mile" : ""}${i === 0 && !cloud ? " open" : ""}">
    <span class="sp-node" aria-hidden="true">${floppy}</span>
    <div class="sp-card">
      <div class="sp-card-head">${p.tag ? `<span class="sp-tag en">${p.tag}</span>` : ""}<b>${p.msg}</b>${p.local ? `<span class="sp-local en">未上云</span>` : ""}<span class="en sp-at">${p.at}</span></div>
      <div class="sp-card-meta"><span class="mono">${p.h}</span>${p.wb ? `<a class="sp-wb mono" href="#">${p.wb} · 交接</a>` : ""}<span><b class="mono">${p.files}</b> 个文件</span><span class="mono add">+${p.add}</span><span class="mono del">−${p.del}</span></div>
      ${i === 0 && !cloud ? `<ul class="sp-files">${[["M", "src/Knowledge.jsx", "+212 −480"], ["M", "src/knowledge.css", "+96 −210"], ["A", "src/KnowledgeZones.jsx", "+527"], ["M", "server/schema.mjs", "+40 −8"]].map(([t, f, n]) => `<li><span class="sp-ft ${t}">${t}</span><span class="mono">${f}</span><span class="mono sp-fn">${n}</span></li>`).join("")}<li class="sp-files-more">还有 42 个文件</li></ul><div class="sp-card-act"><button class="button secondary">${ic("GitCompare", 15)}与现在对比</button><button class="text-btn">${ic("Undo2", 15)}生成回退口令</button></div>` : ""}
    </div>
  </li>`).join("")}</ol></section>`;
}
function spCommit() {
  const groups = [["src/", [["M", "src/AgentsV16.jsx", true], ["A", "src/agents-v16.css", true], ["A", "src/relay-prompt.js", true], ["M", "src/WorkspacePages.jsx", true]], 128], ["docs/", [["A", "docs/design/ui-v16/briefs/08-savepoints.md", true], ["M", "CURRENT.md", true]], 72], ["其他", [["A", ".env.local", false, "疑似凭据"], ["A", "docs/design/ui-v16/refs/raw-capture.mov", false, "超大文件 · 214 MB"]], 2]];
  return `<div class="sp-scrim"></div><section class="sp-sheet" role="dialog" aria-label="创建存档点">
  <header class="sp-sheet-head"><span class="en">NEW SAVE POINT · 个人 AI 工作台</span><h2>创建存档点</h2><button class="icon-btn" aria-label="关闭">${ic("X", 18)}</button></header>
  <label class="sp-msg"><span class="en">MESSAGE · 存档说明</span><textarea rows="2">WB-20261005-175 · UI v16 设计：智能体群验收、派单 173 / 175、随手记 / 项目空间 / 知识仓库 / 存档点简报与视觉稿</textarea></label>
  <div class="sp-warn">${ic("ShieldAlert", 16)}<span>2 个文件默认不存：<b>.env.local</b> 疑似凭据；<b>raw-capture.mov</b> 超过 50 MB</span></div>
  <div class="sp-pick">${groups.map(([g, fs, n]) => `<section><h4><span class="mono">${g}</span><b class="mono">${n}</b></h4><ul>${fs.map(([t, f, on, w]) => `<li class="${on ? "" : "off"}"><label><span class="sn-box${on ? " on" : ""}" aria-hidden="true">${on ? ic("Check", 12) : ""}</span><input type="checkbox"${on ? " checked" : ""} aria-label="${f}"><span class="sp-ft ${t}">${t}</span><span class="mono">${f}</span>${w ? `<em>${w}</em>` : ""}</label></li>`).join("")}${n > fs.length ? `<li class="sp-files-more">还有 ${n - fs.length} 个</li>` : ""}</ul></section>`).join("")}</div>
  <footer class="sp-sheet-foot"><span class="mono">282 / 284 个文件 · +12,480 −3,210</span><button class="button secondary">取消</button><button class="button sp-save">${floppy}创建存档点</button></footer>
</section>`;
}
function spNoGit() {
  return `<section class="sp-pending nogit" aria-label="未开启存档"><div class="sp-pend-main"><span class="en">NO SAVE DATA · 未开启存档</span><h2>菜谱盒子还没开启存档</h2><p class="sp-pend-since"><span class="mono">~/Projects/recipe-box</span> 不是 Git 项目；开启后会初始化 Git、写入默认忽略规则，并存下第一个存档点</p>
  <div class="sp-ignore"><span class="en">.GITIGNORE · 默认忽略</span>${["node_modules/", ".env*", "dist/", ".DS_Store", "*.log"].map((x) => `<code>${x}</code>`).join("")}</div></div>
  <div class="sp-pend-act"><button class="button sp-save">${ic("Power", 16)}开启存档</button><span class="sp-pend-note en">PREVIEW FIRST · 先预览</span></div></section>`;
}
function savepointsHeading() {
  let h = r.heading("history", { eyebrow: "SAVE POINTS", title: "存档点", description: "每个项目的存档点：改来改去也能找回。" });
  h = h.replace(/<h1>([^<]*)<\/h1>/, `<div class="title-row"><h1>$1</h1><button class="page-help" aria-label="这页怎么用">?</button></div>`);
  return h + `<ul class="page-bounds" aria-label="边界"><li>只提交，不推送</li><li>回退交给 Agent</li></ul>`;
}
const savepoints = (mode) => {
  const tab = { nogit: 4, cloud: 5, empty: 3 }[mode] ?? 0;
  const main = mode === "nogit" ? spNoGit() : mode === "cloud" ? `<div class="sp-cloudonly">${ic("Cloud", 18)}<span><b>resume-site</b> 只在 GitHub 上 · 本机没有副本，只能查看存档点</span></div>${spTimeline({ cloud: true })}` : mode === "empty" ? spPending({ empty: true }) + spTimeline({ empty: true }) : spPending() + spTimeline();
  return page("history", "14", "存档点", "存档点", `${savepointsHeading()}${spTabs(tab)}${main}${mode === "commit" ? spCommit() : ""}`).replace(/<strong>版本归档<\/strong>/, "<strong>存档点</strong>");
};
for (const [file, mode] of [["savepoints", "default"], ["savepoints-commit", "commit"], ["savepoints-nogit", "nogit"], ["savepoints-cloud", "cloud"], ["savepoints-empty", "empty"]])
  await emit(`${file}.html`, savepoints(mode));
console.log("pages: savepoints ×5");

// ---------- 待处理（简报 09）：顶栏收件箱拉出的右侧抽屉；任务告示板（主线 / 支线 / 情报） ----------
const IB_MAIN = [
  { src: "save", title: "个人 AI 工作台 已 4 天没存档", detail: "104 个修改、180 个新文件未存档", at: "今天 09:00", to: "存档点" },
  { src: "chip", title: "个人说明 MCP 没在运行", detail: "Agent 读不到个人说明；需要启动服务", at: "今天 08:41", to: "知识仓库" },
];
const IB_SIDE = [
  { src: "metalgreymon", title: "机械暴龙兽 建议修改个人说明", detail: "「工作偏好」一节：补充“推送前先告诉我”", at: "昨天 22:10", to: "", proposal: true },
  { src: "chip", title: "飞书 · 团队知识库 需要授权", detail: "授权过期，检索与 MCP 暂时读不到这个库", at: "昨天 18:02", to: "知识仓库" },
  { src: "egg", title: "规则模板落后 2 个版本", detail: "Codex · 项目接力规则 v3 → v5", at: "10/03", to: "资产仓库" },
];
const IB_INTEL = [
  { src: "moon", title: "夜巡晨报 · 10/05", detail: "3 项检查通过，1 项提示", at: "今天 07:00", to: "夜巡" },
  { src: "save", title: "旧博客 停滞 21 天", detail: "上次活动 09/14", at: "10/05", to: "项目空间" },
];
function ibCard(c, { open = false } = {}) {
  return `<li class="ib-card${open ? " open" : ""}">
  <button class="ib-card-btn"><span class="ib-card-main"><b>${c.title}</b><small>${c.detail}</small></span><span class="ib-card-side"><span class="en">${c.at}</span><span class="ib-go">${c.proposal ? (open ? "收起" : "查看") : "前往"} ${ic(c.proposal ? (open ? "ChevronUp" : "ChevronDown") : "ArrowRight", 13)}</span></span></button>
  ${open ? `<div class="ib-diff"><div class="ib-diff-head"><span class="en">PROFILE · 工作偏好</span><span>机械暴龙兽 · Claude Code 提出</span></div><pre><span class="ctx">- 先确认，再动手</span><span class="del">- 测试和截图用合成数据</span><span class="add">- 测试、截图一律用合成数据和隔离运行器</span><span class="add">- 推送到 GitHub 前先告诉我，等我确认</span></pre><div class="ib-diff-act"><button class="button">${ic("Check", 15)}采纳</button><button class="button secondary">${ic("X", 15)}拒绝</button></div></div>` : ""}
</li>`;
}
function ibSection(cls, en, zh, items, { collapsed = false, open = -1 } = {}) {
  return `<section class="ib-sec ${cls}"><h3><i></i><span class="en">${en}</span>${zh}<b class="mono">${items.length}</b>${collapsed ? `<span class="ib-fold">${ic("ChevronDown", 14)}展开</span>` : ""}</h3>${collapsed ? "" : `<ul>${items.map((c, k) => ibCard(c, { open: k === open })).join("")}</ul>`}</section>`;
}
function ibDrawer(mode) {
  const empty = mode === "empty";
  const body = empty ? `<div class="ib-empty">${r.pixel("koromon", 64)}<span class="ib-zzz en">z z Z</span><p>没有要你处理的事</p></div>` :
    ibSection("main", "MAIN QUEST", "主线任务", IB_MAIN) + ibSection("side", "SIDE QUEST", "支线任务", IB_SIDE, { open: mode === "proposal" ? 0 : -1 }) + ibSection("intel", "INTEL", "情报", IB_INTEL, { collapsed: true });
  return `<div class="ib-scrim"></div><aside class="ib-drawer" role="dialog" aria-label="待处理">
  <header class="ib-head"><div><span class="en">INBOX · QUEST BOARD</span><h2>待处理</h2></div><button class="icon-btn" aria-label="关闭">${ic("X", 18)}</button></header>
  ${empty ? "" : `<div class="ib-count"><span class="m"><b class="mono">2</b>主线</span><span class="s"><b class="mono">3</b>支线</span><span class="i"><b class="mono">2</b>情报</span></div>`}
  <div class="ib-body">${body}</div>
</aside>`;
}
const ibBadge = (html, n, tone) => html.replace(/<small class="nav-count">[\s\S]*?<\/small><\/button>/, n ? `<small class="nav-count ib-badge ${tone}"><span class="odometer"><span class="odo-digit">${n}</span></span></small></button>` : `</button>`).replace('class="icon-button topbar-inbox"', 'class="icon-button topbar-inbox ib-open"');
for (const [file, mode] of [["inbox", "default"], ["inbox-proposal", "proposal"], ["inbox-empty", "empty"]]) {
  let html = projects("default").replace("</main>", `${ibDrawer(mode)}</main>`).replace('class="main-content page-projects v14 v16"', 'class="main-content page-projects v14 v16 ib-host"');
  html = ibBadge(html, mode === "empty" ? 0 : 5, "red");
  await emit(`${file}.html`, html);
}
// 顶栏图标三种提醒状态（单独一张小稿）
const ibStates = [["red", 5, "有主线：红色 + 呼吸光"], ["yellow", 3, "只有支线：黄色"], ["cyan", 2, "只有情报：青色（情报数）"], ["", 0, "没有任何事：不显示角标"]];
await emit("inbox-badges.html", `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>v16 · 待处理图标</title><link rel="stylesheet" href="../app.css"><link rel="stylesheet" href="../v16.css"><style>body{margin:0;background:var(--bg)}</style></head><body><main class="main-content v14 v16 ib-badges-sheet"><span class="en">TOPBAR · INBOX BADGE</span><div class="ib-badges">${ibStates.map(([tone, n, label]) => `<figure><button class="icon-button topbar-inbox ib-open" aria-label="待处理 ${n} 项">${ic("Inbox", 16)}${n ? `<small class="nav-count ib-badge ${tone}"><span class="odometer"><span class="odo-digit">${n}</span></span></small>` : ""}</button><figcaption>${label}</figcaption></figure>`).join("")}</div></main></body></html>`);
console.log("pages: inbox ×3 + badges");

// ---------- AI HOT（简报 10）：今日情报屏。精选 10 条拼贴卡墙 + 热点 5 条窄榜；只搬运标题与摘要 ----------
const AH_PICKS = [
  ["Agent 多步调用的错误累积，比想象中更快", "每一步 95% 的成功率，十步之后只剩六成。作者给出三条工程做法：缩短调用链、在关键节点加检查点、失败时回到最近的检查点而不是从头重来；并用一组对照实验说明，换更强的模型不如先把链路拆短。", "合成来源 · 研究", "09:12", true],
  ["本地优先软件的同步取舍", "离线可用与冲突合并之间没有免费午餐：先确定谁是权威，再谈同步策略。", "合成来源 · 工程", "08:40"],
  ["长上下文的真实成本", "上下文翻倍，延迟和费用并不线性增长；缓存命中率才是关键变量。", "合成来源 · 模型", "08:05", true],
  ["开源模型评测基准之争", "同一模型在三个榜单上排名差出十位，问题出在题目泄露与提示格式。", "合成来源 · 评测", "07:58"],
  ["代码助手的上下文窗口策略", "检索片段、最近编辑与项目规则三者怎么分配额度。", "合成来源 · 工具", "07:30"],
  ["小模型在端侧的三个用法", "分类、改写和意图识别，延迟低于 50ms。", "合成来源 · 端侧", "07:12"],
  ["把评审意见写成可执行清单", "每条意见写成“在哪里、看到什么、改成什么”。", "合成来源 · 方法", "06:55"],
  ["RAG 评测的十个坑", "召回率高不等于答案对；先评“找没找到”，再评“答没答对”。", "合成来源 · 工程", "06:40"],
  ["多 Agent 协作的交接协议", "共享状态文件 + 单一写入者，比消息队列更好排错。", "合成来源 · 实践", "06:21"],
  ["语音交互的打断与回合", "允许用户随时打断，比更快的首字延迟更影响体验。", "合成来源 · 产品", "06:02"],
];
const AH_HOT = [
  ["新一代编程模型发布，长任务成功率大幅提升", "社区热议上下文与工具调用的稳定性"],
  ["某开源 Agent 框架一周新增三万星", "主打本地运行与插件生态"],
  ["多家厂商下调推理价格", "缓存命中部分降价最多"],
  ["端侧大模型芯片路线之争", "存算一体与传统 NPU 的取舍"],
  ["AI 生成内容标识新规征求意见", "涉及水印与平台责任"],
  ["浏览器内置模型接口进入预览", "网页可直接调用本机小模型"],
  ["开源语音模型刷新中文识别纪录", "方言与噪声场景提升明显"],
  ["企业 Agent 落地调查报告发布", "七成团队卡在权限与审计"],
  ["多模态模型看懂长视频", "一小时视频的问答准确率翻倍"],
  ["代码评审机器人引发争议", "误报率与开发者信任成焦点"],
];
const star = (on) => `<button class="ah-star${on ? " on" : ""}" aria-label="${on ? "已收藏" : "收藏到学习成长"}">${ic("Star", 16)}</button>`;
const AH_TAG = { 研究: "violet", 工程: "cyan", 模型: "orange", 评测: "yellow", 工具: "lime", 端侧: "pink", 方法: "cyan", 实践: "lime", 产品: "pink" };
const ahTag = (src) => { const t = src.split(" · ")[1]; return `<span class="ah-tag ${AH_TAG[t] || "cyan"}">${t}</span>`; };
function ahCard([t, sum, src, at, fav], i) {
  const size = i === 0 ? "xl" : "md";
  return `<article class="ah-card ${size}">${i === 0 ? `<span class="ah-ghost mono" aria-hidden="true">01</span>` : ""}<header><span class="ah-no mono">${String(i + 1).padStart(2, "0")}</span>${ahTag(src)}${star(fav)}</header><h3>${t}</h3><p>${sum}</p><footer class="mono">${src.split(" · ")[0]} · ${at}</footer></article>`;
}
function ahMore(items) {
  return `<section class="ah-more" aria-label="更多精选"><h4 class="en">MORE PICKS · 更多精选</h4><ol>${items.map(([t, sum, src, at, fav], k) => `<li><span class="ah-no mono">${String(k + 4).padStart(2, "0")}</span><span class="ah-more-main"><span class="ah-more-top">${ahTag(src)}<b>${t}</b></span><small>${sum}</small></span>${star(fav)}</li>`).join("")}</ol></section>`;
}
function ahDateRow(mode) {
  const failed = mode === "failed";
  return `<div class="ah-date"><h2><b class="mono">10</b>月<b class="mono">5</b>日<span>今日精选</span></h2><span class="ah-upd${failed ? " bad" : ""}">${failed ? `<i></i>更新失败，显示的是 <span class="mono">10/05 06:00</span> 的内容` : `更新于 <span class="mono">09:30</span> · 每 3 小时`}</span><a class="ah-fav" href="#">${ic("Star", 14)}已收藏 <b class="mono">2</b> · 去学习成长看 →</a></div>`;
}
function aihotHeading() {
  let h = r.heading("aihot", { description: "今天 AI 圈的精选与热点，细节去原站看。" });
  h = h.replace(/<h1>([^<]*)<\/h1>/, `<div class="title-row"><h1>$1</h1><button class="page-help" aria-label="这页怎么用">?</button></div>`);
  h = h.replace(/<\/header>$/, `<div class="page-heading-action ah-head-act"><button class="icon-btn" aria-label="立即刷新">${ic("RefreshCw", 18)}</button><a class="button" href="#">去 aihot.news ${ic("ArrowUpRight", 16)}</a></div></header>`);
  return h + `<ul class="page-bounds" aria-label="边界"><li>aihot.news 公开接口</li><li>每 3 小时更新</li></ul>`;
}
const aihot = (mode) => {
  let main;
  if (mode === "first") main = `<div class="ah-screen-empty">${ic("Radio", 28)}<p>第一次使用需要你确认</p><small>点“开始拉取”后才会访问 aihot.news 公开接口，之后每 3 小时自动更新，结果缓存在本机</small><button class="button">${ic("Globe", 16)}开始拉取</button></div>`;
  else if (mode === "empty") main = `<div class="ah-screen-empty">${ic("RadioTower", 28)}<p>还没拉取过</p><small>点右上角刷新拉取一次</small></div>`;
  else main = `${ahDateRow(mode)}<div class="ah-board"><div class="ah-wall">${AH_PICKS.slice(0, 3).map(ahCard).join("")}${ahMore(AH_PICKS.slice(3))}</div><aside class="ah-hot" aria-label="热点榜"><h3 class="en-head"><span class="en">HOT</span>热点</h3><ol>${AH_HOT.map(([t, s], i) => `<li class="${i < 3 ? "top" : ""}"><span class="ah-rank mono">${i + 1}</span><span><b>${t}</b><small>${s}</small></span></li>`).join("")}</ol></aside></div>`;
  return page("aihot", "10", "AI HOT", "AI HOT", `${aihotHeading()}${main}`);
};
for (const [file, mode] of [["aihot", "default"], ["aihot-first", "first"], ["aihot-failed", "failed"], ["aihot-empty", "empty"]])
  await emit(`${file}.html`, aihot(mode));
console.log("pages: aihot ×4");

// ---------- 日历（简报 11）：调度屏。TodoList 横带在上，全宽周视图时间轴在下 ----------
const CL_DAYS = [["周一", 28, "9/28"], ["周二", 29, "9/29"], ["周三", 30, "9/30"], ["周四", 1, "10/1"], ["周五", 2, "10/2"], ["周六", 3, "10/3"], ["周日", 4, "10/4"]];
const CL_START = 8, CL_END = 20, CL_ROW = 48;
// [列, 开始小时, 结束小时, 类型, 标题, 备注]
const CL_EVENTS = [
  [0, 9, 10, "block", "写交接与回归", "工作台"], [1, 9, 10, "meet", "周会", "公司"], [2, 9, 10, "block", "写交接与回归", "工作台"],
  [3, 10, 11, "meet", "设计评审", "公司"], [4, 9, 10, "block", "写交接与回归", "工作台"], [5, 9, 10.5, "meet", "读书会", "个人"],
  [6, 9, 10, "block", "验收 155", "工作台"], [2, 12, 14, "block", "深度工作：v16 页面简报", "工作台"], [1, 14, 15, "meet", "1:1", "公司"],
  [6, 14, 14.75, "meet", "写交接与回归", "公司"], [4, 13, 16, "block", "随手记视觉稿", "工作台"], [0, 15, 16.5, "block", "派单 168 验收", "工作台"],
  [3, 15.5, 16.5, "meet", "牙医", "个人"], [5, 19, 20, "night", "夜巡窗口", "草稿"], [6, 19, 20, "night", "夜巡窗口", "草稿"],
];
const CL_TODOS = [["回复读书会时间", "今天 17:00", "due"], ["整理 refs 文件夹", "10/5 09:00", ""], ["给银饰拍白底图", "周六", ""], ["续费域名", "", "done"]];
const clTime = (h) => `${String(Math.floor(h)).padStart(2, "0")}:${h % 1 ? String(Math.round((h % 1) * 60)).padStart(2, "0") : "00"}`;
function clTodo(mode) {
  return `<section class="cl-todo" aria-labelledby="cl-todo-t"><h2 id="cl-todo-t" class="en-head"><span class="en">TODO</span>TodoList<b class="mono">3</b></h2>
  <ul>${CL_TODOS.map(([t, at, st]) => `<li class="cl-td${st ? " " + st : ""}"><label><span class="sn-box${st === "done" ? " on" : ""}" aria-hidden="true">${st === "done" ? ic("Check", 12) : ""}</span><input type="checkbox"${st === "done" ? " checked" : ""} aria-label="${t}"><span class="cl-td-main"><b>${t}</b>${at ? `<small>${st === "due" ? `<i></i>已到点 · ` : ""}${ic("Bell", 11)}<span class="mono">${at}</span></small>` : ""}</span></label></li>`).join("")}</ul>
  <label class="cl-add"><input placeholder="别忘了的一件事……" aria-label="新增 todo"><button class="icon-btn" aria-label="添加">${ic("Plus", 16)}</button></label></section>`;
}
function clGrid(mode) {
  const day = mode === "day";
  const cols = day ? [6] : [0, 1, 2, 3, 4, 5, 6];
  const hours = Array.from({ length: CL_END - CL_START }, (_, i) => CL_START + i);
  const nowTop = (14.5 - CL_START) * CL_ROW;
  const head = `<div class="cl-head-row"><span></span>${cols.map((c) => `<span class="cl-dh${c === 6 ? " today" : ""}"><small>${CL_DAYS[c][0]}</small><b class="mono">${CL_DAYS[c][1]}</b></span>`).join("")}</div>`;
  const allday = `<div class="cl-allday"><span class="cl-ah">全天</span>${cols.map((c) => `<span>${c === 6 ? `<em class="cl-ev meet sm">写交接 · 全天</em>` : ""}</span>`).join("")}</div>`;
  const body = `<div class="cl-body" style="--rows:${hours.length};--row:${CL_ROW}px"><div class="cl-hours">${hours.map((h) => `<span class="mono">${clTime(h)}</span>`).join("")}</div>${cols.map((c) => `<div class="cl-col${c === 6 ? " today" : ""}">${CL_EVENTS.filter((e) => e[0] === c).map(([, s, e, k, t, n], i) => `<button class="cl-ev ${k}${mode === "edit" && c === 6 && s === 9 ? " sel" : ""}" style="top:${(s - CL_START) * CL_ROW + 2}px;height:${(e - s) * CL_ROW - 4}px"><b>${t}</b><small class="mono">${clTime(s)}–${clTime(e)}${k === "meet" ? ` · ${n}` : ""}</small></button>`).join("")}${c === 6 ? `<i class="cl-now" style="top:${nowTop}px"><span class="cl-now-arrow"></span></i>` : ""}${mode === "edit" && c === 6 ? clPop() : ""}</div>`).join("")}</div>`;
  return `<section class="cl-screen${day ? " day" : ""}" aria-label="${day ? "今天" : "周视图"}">${head}${allday}${body}</section>`;
}
function clPop() {
  return `<div class="cl-pop" role="dialog" aria-label="规划块"><span class="en">PLAN BLOCK · 工作台</span><input class="cl-pop-title" value="验收 155" aria-label="标题"><div class="cl-pop-row"><span class="mono">10/4 周日</span><span class="mono">09:00 – 10:00</span></div><textarea rows="2" aria-label="备注">看交接、叠图和关键 diff，给通过或返修清单</textarea><div class="cl-pop-act"><button class="text-btn">${ic("Trash2", 15)}删除</button><button class="button secondary">取消</button><button class="button">保存</button></div></div>`;
}
function calendarHeading(mode) {
  let h = r.heading("calendar", { description: "在时间轴上拖出规划，旁边别忘了 TodoList。" });
  h = h.replace(/<h1>([^<]*)<\/h1>/, `<div class="title-row"><h1>$1</h1><button class="page-help" aria-label="这页怎么用">?</button></div>`);
  return h;
}
function clBar(mode) {
  const day = mode === "day";
  return `<div class="cl-bar"><div class="cl-mast"><span class="en">WEEK 40 · ${day ? "10/4 周日" : "9/28 – 10/4"}</span><h2><b class="mono">2026</b> 年 <b class="mono">10</b> 月</h2></div><div class="cl-tools"><div class="cl-seg" role="radiogroup" aria-label="视图"><button class="${day ? "" : "on"}">周</button><button class="${day ? "on" : ""}">今天</button></div><div class="cl-nav"><button class="icon-btn" aria-label="上一${day ? "天" : "周"}">${ic("ChevronLeft", 16)}</button><button class="icon-btn" aria-label="下一${day ? "天" : "周"}">${ic("ChevronRight", 16)}</button></div><button class="icon-btn" aria-label="刷新">${ic("RefreshCw", 16)}</button><button class="button">${ic("CalendarPlus", 16)}新建规划块</button></div></div>`;
}
const calendar = (mode) => {
  const perm = mode === "perm";
  const main = perm ? `<div class="cl-perm">${ic("CalendarClock", 30)}<p>需要日历与提醒事项权限</p><small>规划块写入 macOS“工作台”日历；TodoList 存在提醒事项“工作台”列表。只读取你授权的内容，其他日历只读显示。</small><button class="button">${ic("ShieldCheck", 16)}去授权</button></div>` : `${clTodo(mode)}${clGrid(mode)}`;
  return page("calendar", "08", "日历", "日历", `${calendarHeading(mode)}${perm ? "" : clBar(mode)}${main}`);
};
for (const [file, mode] of [["calendar", "default"], ["calendar-edit", "edit"], ["calendar-perm", "perm"], ["calendar-day", "day"]])
  await emit(`${file}.html`, calendar(mode));
console.log("pages: calendar ×4");

// ---------- 协同（简报 12）：多 Agent 工作流的泳道流水线。横轴阶段、纵轴参与者；交接连线；验收闸门 ----------
// 第三版（最终）：一条阶段线讲清整件事 + 活动记录；颜色只表达状态。
const CX_WHO = { claude: { name: "机械暴龙兽", ch: "metalgreymon", h: 30 }, codex: { name: "机械邪龙兽", ch: "machinedramon", h: 30 }, user: { name: "你" } };
const CX_STEPS = [
  ["方向梳理", "claude", "页面简报", "05-notes", "ok", "你确认 · 10/05"],
  ["视觉稿", "claude", "视觉稿", "notes ×4", "ok", "你确认 · 10/05"],
  ["派单", "claude", "派单", "175", "ok", "已登记"],
  ["认领与实现", "codex", "实现", "第 2 轮", "ok", "回归全绿"],
  ["交付交接", "codex", "交接", "176", "ok", "已回读"],
  ["逐区验收", "claude", "验收", "", "cur", "进行中 · 3 小时"],
  ["终验", "user", "终验", "", "todo", ""],
  ["存档", "user", "存档点", "", "todo", ""],
];
const CX_LOG = [
  ["今天 11:02", "claude", "开始", "逐区验收", ""],
  ["10/07 14:20", "codex", "交付", "交接 176", ""],
  ["10/07 09:40", "codex", "完成第 2 轮实现", "回归 808/808", ""],
  ["10/06 18:15", "claude", "退回返修", "390 展开按钮偏差", "rework"],
  ["10/06 10:30", "codex", "交付", "交接 172", ""],
  ["10/05 20:05", "claude", "登记", "派单 175", ""],
  ["10/05 16:40", "user", "确认", "视觉稿", "ok"],
  ["10/05 15:20", "user", "确认", "页面简报", "ok"],
];
const cxAv = (k, h) => (CX_WHO[k].ch ? `<span class="cx-av">${sprite(CX_WHO[k].ch, h || CX_WHO[k].h)}</span>` : `<span class="cx-av cx-you">${ic("UserRound", Math.round((h || 30) * 0.6))}</span>`);
function cxRuns(alert) {
  const runs = [["数码世界 · 随手记页", "6/8"], ["数码世界 · 逆向工程", "4/8"], ["银饰作品集 · 剪影", "7/8"]];
  const on = alert ? 1 : 0;
  return `<nav class="cx-runs" role="tablist" aria-label="运行">${runs.map(([n, p], i) => `<button role="tab" aria-selected="${i === on}" class="${i === on ? "on" : ""}${alert && i === 1 ? " bad" : ""}">${n}<span class="mono">${p}</span></button>`).join("")}</nav>`;
}
function cxSummary(alert) {
  return `<section class="cx-sum${alert ? " bad" : ""}">
  <div class="cx-sum-main"><h2>${alert ? "数码世界 · 逆向工程" : "数码世界 · 随手记页"}</h2><p><span>设计实现流 v1</span><span>开始 <b class="mono">10/05</b></span><span>已进行 <b class="mono">${alert ? "6 天" : "2 天"}</b></span><span>返修 <b class="mono">${alert ? 0 : 1}</b> 次</span></p></div>
  ${alert ? `<div class="cx-sum-now"><span class="cx-state bad"><i></i>卡住 4 天 · 写入者冲突</span><button class="button secondary">打开 CURRENT</button></div>` :
  `<div class="cx-sum-now">${cxAv("claude", 40)}<span class="cx-now-t"><b>机械暴龙兽</b><small>正在逐区验收 · 3 小时</small></span><button class="button secondary" aria-label="只复制口令">${ic("Copy", 15)}</button><button class="button">带到 机械暴龙兽 继续 ${ic("ArrowRight", 16)}</button></div>`}
</section>`;
}
// 第四版：地铁线路图。每位参与者一条线路；站点 = 交付物；换乘 = 交接；菱形 = 你的闸门；折返 = 返修。
const TM = { W: 1120, H: 400, X: (i) => 200 + i * 126, Y: { claude: 128, codex: 238, user: 338 } };
const TM_HUE = { claude: "255,138,36", codex: "77,227,255", user: "255,209,102" };
function tmMap(alert) {
  const { W, H, X, Y } = TM;
  const st = alert
    ? [["claude", "页面简报", "05-notes", "你确认 · 10/05"], ["claude", "视觉稿", "notes ×4", "你确认 · 10/05"], ["claude", "派单", "173", "已登记"], ["codex", "实现", "", "卡住 4 天", "bad"], ["codex", "交接", "", "", "todo"], ["claude", "逐区验收", "", "", "todo"], ["user", "终验", "", "", "todo"], ["user", "存档点", "", "", "todo"]]
    : [["claude", "页面简报", "05-notes", "你确认 · 10/05"], ["claude", "视觉稿", "notes ×4", "你确认 · 10/05"], ["claude", "派单", "175", "已登记"], ["codex", "实现", "第 2 轮", "回归全绿"], ["codex", "交接", "176", "已回读"], ["claude", "逐区验收", "", "验收中 · 3 小时", "cur"], ["user", "终验", "", "", "todo"], ["user", "存档点", "", "", "todo"]];
  const names = ["方向梳理", "视觉稿", "派单", "认领与实现", "交付交接", "逐区验收", "终验", "存档"];
  const cur = alert ? 3 : 5;
  const grid = names.map((n, i) => `<line class="tm-guide" x1="${X(i)}" y1="56" x2="${X(i)}" y2="${H - 24}"/><text class="tm-axis${i === cur ? " on" : ""}${alert && i === cur ? " bad" : ""}" x="${X(i)}" y="34"><tspan class="tm-axis-n">${String(i + 1).padStart(2, "0")}</tspan> ${n}</text>`).join("");
  const tracks = Object.entries(Y).map(([k, y]) => `<line class="tm-track" x1="${X(0) - 26}" y1="${y}" x2="${W - 30}" y2="${y}" style="--hue:${TM_HUE[k]}"/>`).join("");
  const defs = `<defs><linearGradient id="g-oc" x1="0" x2="1"><stop offset="0" stop-color="rgb(${TM_HUE.claude})"/><stop offset="1" stop-color="rgb(${TM_HUE.codex})"/></linearGradient><linearGradient id="g-co" x1="0" x2="1"><stop offset="0" stop-color="rgb(${TM_HUE.codex})"/><stop offset="1" stop-color="rgb(${TM_HUE.claude})"/></linearGradient><filter id="glow" x="-20%" y="-50%" width="140%" height="200%"><feGaussianBlur stdDeviation="3.2" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter></defs>`;
  const seg = (d, c, cls = "") => `<path class="tm-route ${cls}" d="${d}" stroke="${c}"/>`;
  const yc = Y.claude, yx = Y.codex, yu = Y.user;
  let route = seg(`M${X(0) - 26} ${yc} H${X(2) + 20}`, `rgb(${TM_HUE.claude})`) + seg(`M${X(2) + 20} ${yc} C${X(2) + 65} ${yc} ${X(3) - 45} ${yx} ${X(3) - 20} ${yx}`, "url(#g-oc)");
  if (alert) route += seg(`M${X(3) - 20} ${yx} H${X(3)}`, `rgb(${TM_HUE.codex})`) + `<path class="tm-future" d="M${X(3) + 10} ${yx} H${X(4) + 20} C${X(4) + 65} ${yx} ${X(5) - 45} ${yc} ${X(5) - 20} ${yc} H${X(5) + 20} C${X(5) + 65} ${yc} ${X(6) - 45} ${yu} ${X(6) - 20} ${yu} H${X(7)}"/>`;
  else route += seg(`M${X(3) - 20} ${yx} H${X(4) + 20}`, `rgb(${TM_HUE.codex})`) + seg(`M${X(4) + 20} ${yx} C${X(4) + 65} ${yx} ${X(5) - 45} ${yc} ${X(5) - 20} ${yc}`, "url(#g-co)") + seg(`M${X(5) - 20} ${yc} H${X(5)}`, `rgb(${TM_HUE.claude})`) + `<path class="tm-flow" d="M${X(4) + 20} ${yx} C${X(4) + 65} ${yx} ${X(5) - 45} ${yc} ${X(5) - 20} ${yc} H${X(5)}"/>` + `<path class="tm-future" d="M${X(5) + 14} ${yc} H${X(5) + 20} C${X(5) + 65} ${yc} ${X(6) - 45} ${yu} ${X(6) - 20} ${yu} H${X(7)}"/>`;
  const rework = alert ? "" : `<path class="tm-rework" d="M${X(5)} ${yc - 16} C${X(5)} ${yc - 74} ${X(3)} ${yc - 74} ${X(3)} ${yc - 10} V${yx - 14}"/><text class="tm-rework-t" x="${(X(3) + X(5)) / 2}" y="${yc - 60}">返修 1 次 · 10/06</text>`;
  const gates = [0, 1].map((i) => `<line class="tm-tie" x1="${X(i)}" y1="${yc + 10}" x2="${X(i)}" y2="${yu - 12}"/><rect class="tm-gate" x="${X(i) - 7}" y="${yu - 7}" width="14" height="14" transform="rotate(45 ${X(i)} ${yu})"/><text class="tm-gate-t" x="${X(i)}" y="${yu + 30}">你确认</text><text class="tm-gate-d" x="${X(i)}" y="${yu + 45}">10/05</text>`).join("");
  const stations = st.map(([who, name, id, gate, s = "ok"], i) => {
    const x = X(i), y = Y[who], above = who === "claude";
    const ring = s === "cur" ? `<circle class="tm-pulse" cx="${x}" cy="${y}" r="17"/><circle class="tm-st cur" cx="${x}" cy="${y}" r="11" style="--hue:${TM_HUE[who]}"/>` : s === "bad" ? `<circle class="tm-pulse bad" cx="${x}" cy="${y}" r="17"/><circle class="tm-st bad" cx="${x}" cy="${y}" r="11"/>` : s === "todo" ? `<circle class="tm-st todo" cx="${x}" cy="${y}" r="8"/>` : `<circle class="tm-st" cx="${x}" cy="${y}" r="8" style="--hue:${TM_HUE[who]}"/>`;
    const ny = above ? y - 34 : y + 34, iy = above ? y - 50 : y + 50, gy = above ? y + 30 : y + 66;
    const gx = s === "cur" || s === "bad" ? x + 22 : x, ga = s === "cur" || s === "bad" ? "start" : "middle", gyy = s === "cur" || s === "bad" ? y + 4 : gy;
    return `<g class="tm-s ${s}" tabindex="0">${ring}<text class="tm-name" x="${x}" y="${ny}">${name}</text>${id ? `<text class="tm-id" x="${x}" y="${iy}">${id}</text>` : ""}${gate ? `<text class="tm-res ${s}" x="${gx}" y="${gyy}" text-anchor="${ga}">${s === "ok" ? "✓ " : ""}${gate}</text>` : ""}</g>`;
  }).join("");
  const lanes = [["claude", "metalgreymon", "机械暴龙兽", "CLAUDE CODE"], ["codex", "machinedramon", "机械邪龙兽", "CODEX"], ["user", "", "你", "USER"]].map(([k, ch, n, en]) => `<span class="tm-lane" style="top:${Y[k] - 26}px;--hue:${TM_HUE[k]}">${ch ? `<span class="tm-lane-av">${sprite(ch, ch === "metalgreymon" || ch === "machinedramon" ? 44 : 34)}</span>` : `<span class="tm-lane-av tm-you">${ic("UserRound", 20)}</span>`}<span><b>${n}</b><span class="en">${en}</span></span></span>`).join("");
  return `<div class="tm-scroll"><div class="tm-map" style="width:${W}px;height:${H}px">${lanes}<svg viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" aria-label="线路图">${defs}${grid}${tracks}${rework}${gates}<g filter="url(#glow)">${route}</g>${stations}</svg></div></div>`;
}
function cxRail(alert) {
  return `<section class="tm-frame" aria-label="线路图"><header class="tm-head"><span class="en">LINE MAP · 设计实现流 v1</span><button class="text-btn tm-logbtn">${ic("History", 15)}活动记录 <b class="mono">24</b></button></header>${tmMap(alert)}</section>`;
}
function cxLog(alert) {
  const log = alert ? [["今天 09:00", "codex", "4 天没有新交接", "认领与实现", "bad"], ["10/06 21:30", "claude", "写入者冲突", "交接 175 与 CURRENT 同时声明写入", "bad"], ...CX_LOG.slice(5)] : CX_LOG;
  return `<div class="cx-scrim"></div><aside class="cx-drawer tm-logd" role="dialog" aria-label="活动记录"><header><div><span class="en">ACTIVITY</span><h2>活动记录</h2></div><button class="icon-btn" aria-label="关闭">${ic("X", 18)}</button></header><ol class="tm-log">${log.map(([t, who, verb, obj, k]) => `<li class="${k}"><time class="mono">${t}</time>${cxAv(who, 22)}<span><b>${CX_WHO[who].name}</b> ${verb} <em>${obj}</em></span></li>`).join("")}</ol><span class="cx-more">依据项目 CURRENT 与交接文件 · 共 24 条</span></aside>`;
}
function cwDrawer() {
  return `<div class="cx-scrim"></div><aside class="cx-drawer" role="dialog" aria-label="阶段详情"><header><div><span class="mono">01</span><h2>方向梳理</h2></div><button class="icon-btn" aria-label="关闭">${ic("X", 18)}</button></header>
  <dl><div><dt>执行者</dt><dd>${cxAv("claude", 26)}机械暴龙兽 · Claude Code</dd></div>
  <div><dt>方法</dt><dd><b>grill-me</b> — 逐轮提问，每题给推荐答案，等你回答再进入下一轮</dd></div>
  <div><dt>交付物</dt><dd><a href="#">briefs/05-notes.md</a> · 页面简报（8 栏）</dd></div>
  <div><dt>过关</dt><dd class="ok">${ic("Check", 13)}你确认 · 10/05 15:20</dd></div>
  <div><dt>依据</dt><dd>交接 <a href="#">174</a> · 简报文首“状态”</dd></div></dl>
  <a class="cx-tpl" href="#">查看模板中这一阶段的定义 →</a></aside>`;
}
function collabHeading() {
  let h = r.heading("collab", { eyebrow: "WORKFLOW RUNS", description: "多 Agent 工作流的全过程：谁做了什么、交给了谁、过没过关。" });
  h = h.replace(/<h1>([^<]*)<\/h1>/, `<div class="title-row"><h1>$1</h1><button class="page-help" aria-label="这页怎么用">?</button></div>`);
  return h + `<ul class="page-bounds" aria-label="边界"><li>以项目协议文件为准</li><li>口令由你发送</li></ul>`;
}
const collab = (mode) => {
  const alert = mode === "alert";
  const body = mode === "empty" ? `${collabHeading()}<div class="cx-empty"><p>还没有运行中的协同</p><small>项目里有按协同模板写的 CURRENT 与交接文件后，这里会自动出现。</small><a class="cx-tpl" href="#">去资产仓库看工作流模板 →</a></div>` :
    `${collabHeading()}${cxRuns(alert)}${cxSummary(alert)}${cxRail(alert)}${mode === "node" ? cwDrawer() : ""}${mode === "log" ? cxLog(false) : ""}`;
  return page("collab", "05", "协同", "协同", body);
};
for (const [file, mode] of [["collab", "default"], ["collab-node", "node"], ["collab-log", "log"], ["collab-alert", "alert"], ["collab-empty", "empty"]])
  await emit(`${file}.html`, collab(mode));
console.log("pages: collab ×4");

// ---------- 设置（简报 13）：系统偏好式一站式总控。左侧分类，右侧分组列表；权限表为安全总览 ----------
const ST_CATS = [["auth", "ShieldCheck", "授权与安全", "4 项已开启"], ["data", "Database", "数据与备份", "备份于 10/04"], ["project", "FolderGit2", "项目与存档", "2 个扫描目录"], ["knowledge", "Cpu", "知识与 MCP", "MCP 运行中"], ["calendar", "CalendarDays", "日历与提醒", "已授权"], ["news", "Radio", "资讯", "每 3 小时"], ["shelf", "LibraryBig", "学习书架", "1 个文件夹"]];
const ST_AUTH = [
  ["写入 Obsidian Vault", "只写你指定的子目录；个人说明采纳后写回", "on", "10/03 21:40", "撤销"],
  ["知识开放给 Agent", "MCP 只搜、只读；排除文件夹永不可读 · 1 / 3 个库", "on", "今天 09:12", "管理"],
  ["存档点写入", "只做 Git 提交与初始化，不推送、不回退", "on", "10/03 21:48", "撤销"],
  ["日历与提醒事项", "规划块写“工作台”日历；todo 写“工作台”列表，不设闹钟", "on", "今天 08:30", "撤销"],
  ["写真实 Agent 配置", "开关 Skill / 插件、发布挂载；逐文件备份、回读、可回滚", "off", "从未使用", "预览开启"],
  ["模型 / API 连接", "Key 只存钥匙串；每次调用先预览发送内容与费用上限", "off", "从未使用", "预览开启"],
  ["常驻服务", "以 LaunchAgent 常驻 5178，可重载到最新版本", "off", "—", "预览开启"],
  ["夜巡真实执行", "夜巡方案讨论后开放", "hold", "—", ""],
];
function stNav(cur) {
  return `<nav class="st-nav" role="tablist" aria-label="设置分类">${ST_CATS.map(([id, icon, n, sub]) => `<button role="tab" aria-selected="${id === cur}" class="${id === cur ? "on" : ""}">${ic(icon, 18)}<span><b>${n}</b><small>${sub}</small></span></button>`).join("")}</nav>`;
}
const stDot = (st) => `<span class="st-dot ${st}">${{ on: "已开启", off: "关闭", hold: "暂缓" }[st]}</span>`;
function stAuth() {
  return `<h2 class="st-h">授权与安全<small>工作台现在被允许做的事</small></h2>
  <div class="st-group st-table" role="table" aria-label="权限表"><div class="st-tr st-th" role="row"><span>能力</span><span>状态</span><span>最近一次</span><span></span></div>
  ${ST_AUTH.map(([n, d, st, last, act]) => `<div class="st-tr ${st}" role="row"><span class="st-cap"><b>${n}</b><small>${d}</small></span><span>${stDot(st)}</span><span class="mono st-last">${last}</span><span class="st-act">${act ? `<button class="${act === "预览开启" ? "button secondary" : "text-btn"}">${act === "预览开启" ? ic("Eye", 15) : ""}${act}</button>` : ""}</span></div>`).join("")}</div>
  <p class="st-foot">${ic("Info", 14)}开启任何一项都会先预览影响范围、备份旧设置，确认后才生效；撤销同样可回读。</p>`;
}
function stData() {
  return `<h2 class="st-h">数据与备份<small>所有记录都只在这台电脑上</small></h2>
  <div class="st-group">
    <div class="st-row"><span class="st-cap"><b>主库</b><small class="mono">~/Library/Application Support/数码世界/data</small></span><span class="st-val mono">2.4 MB · REV 182</span></div>
    <div class="st-row"><span class="st-cap"><b>最近完整备份</b><small>包含主库、设置与本机图片；不含凭据</small></span><span class="st-val"><span class="mono">10/04 22:10</span><button class="button secondary">${ic("Archive", 15)}立即备份</button></span></div>
    <div class="st-row"><span class="st-cap"><b>恢复</b><small>从备份恢复会先预览差异；恢复后所有授权重新关闭</small></span><span class="st-val"><button class="text-btn">选择备份…</button></span></div>
    <div class="st-row"><span class="st-cap"><b>合并导入</b><small>从另一份数据合并进来，冲突逐条确认</small></span><span class="st-val"><button class="text-btn">选择文件…</button></span></div>
    <div class="st-row"><span class="st-cap"><b>导出</b><small>导出为 JSON，可在另一台电脑合并</small></span><span class="st-val"><button class="text-btn">导出…</button></span></div>
  </div>
  <div class="st-group"><div class="st-row"><span class="st-cap"><b>移除演示资产</b><small>只移除标记为示例的 3 份资产，保留你的其他记录</small></span><span class="st-val"><button class="text-btn st-danger">移除示例</button></span></div></div>`;
}
function stProject() {
  return `<h2 class="st-h">项目与存档<small>项目空间与存档点使用；在项目空间的设置抽屉里改是同一份</small></h2>
  <div class="st-group">
    <div class="st-row top"><span class="st-cap"><b>扫描目录</b><small>只读取项目标记与 Git 远端；不读源码，不跟随符号链接</small></span><span class="st-val st-paths"><code>~/Projects</code><code>~/Documents/work</code><button class="text-btn">${ic("Plus", 14)}添加目录</button></span></div>
    <div class="st-row"><span class="st-cap"><b>停滞阈值</b><small>在推进项目超过这个天数没有活动，存档卡会“睡着”</small></span><span class="st-val"><span class="st-step"><button aria-label="减少">−</button><b class="mono">7</b><button aria-label="增加">+</button></span>天</span></div>
    <div class="st-row"><span class="st-cap"><b>未存档提醒</b><small>超过这些时间没存档，面板变色；超过红色阈值进待处理</small></span><span class="st-val st-thr"><span class="st-chip yellow">黄 · <b class="mono">1</b> 天</span><span class="st-chip red">红 · <b class="mono">3</b> 天</span></span></div>
  </div>`;
}
function settingsHeading() {
  let h = r.heading("settings", { description: "所有设置与授权都在这里；开启前先预览。" });
  h = h.replace(/<h1>([^<]*)<\/h1>/, `<div class="title-row"><h1>$1</h1><button class="page-help" aria-label="这页怎么用">?</button></div>`);
  return h + `<ul class="page-bounds" aria-label="边界"><li>默认关闭</li><li>开启前预览</li></ul>`;
}
const settings = (cat) => page("settings", "13", "设置", "设置", `${settingsHeading()}<div class="st-layout">${stNav(cat)}<section class="st-body">${cat === "data" ? stData() : cat === "project" ? stProject() : stAuth()}</section></div>`);
for (const [file, cat] of [["settings", "auth"], ["settings-data", "data"], ["settings-project", "project"]])
  await emit(`${file}.html`, settings(cat));
console.log("pages: settings ×3");

// ---------- 首页 · 世界总览（简报 14 第二版）：暴龙机中枢。暴龙机居中驱动四块屏，走线上的信号脉冲 = 需要你注意 ----------
const HM_DAY = [[9, 10, "block", "验收 155"], [10.5, 11.5, "meet", "周会"], [13, 15, "block", "随手记视觉稿"], [15.5, 16, "meet", "1:1"], [19, 20, "night", "夜巡窗口"]];
function hmToday(empty) {
  const x = (h) => ((h - 8) / 12) * 100;
  return `<section class="hx-mod hx-today" style="--hue:77,227,255" aria-labelledby="hx-t1"><header><span class="hx-port mono">A</span><h2 id="hx-t1"><span class="en">TODAY</span>今日</h2><a href="#">日历 →</a></header>
  <div class="hx-tl"><div class="hx-tl-axis">${[8, 12, 16, 20].map((h) => `<span class="mono" style="left:${x(h)}%">${h}</span>`).join("")}</div><div class="hx-tl-bar">${empty ? "" : HM_DAY.map(([a, b, k]) => `<span class="hx-blk ${k}" style="left:${x(a)}%;width:${x(b) - x(a)}%"></span>`).join("")}<i class="hx-now" style="left:${x(14.5)}%"></i></div></div>
  ${empty ? `<p class="hx-empty">今天没有安排</p>` : `<p class="hx-nowline"><span class="mono">14:30</span>正在 <b class="o">随手记视觉稿</b> · 下一个 <span class="mono">15:30</span> 1:1</p>
  <ul class="hx-todo">${[["回复读书会时间", "已到点", "due"], ["整理 refs 文件夹", "明天 09:00", ""]].map(([t, s, k]) => `<li class="${k}"><span class="hx-box"></span><b>${t}</b><small>${s}</small></li>`).join("")}</ul>`}
</section>`;
}
function hmPending(empty) {
  const items = [["main", "个人说明 MCP 没在运行"], ["main", "个人 AI 工作台 已 4 天没存档"], ["side", "机械暴龙兽 建议修改个人说明"]];
  return `<section class="hx-mod hx-pend" style="--hue:255,107,107" aria-labelledby="hx-t2"><header><span class="hx-port mono">B</span><h2 id="hx-t2"><span class="en">QUESTS</span>待处理</h2><a href="#">全部 →</a></header>
  ${empty ? `<p class="hx-empty">没有要你处理的事</p>` : `<div class="hx-qcount"><span><b class="mono r">2</b>主线</span><span><b class="mono y">3</b>支线</span><span><b class="mono c">2</b>情报</span></div><ul class="hx-q">${items.map(([k, t]) => `<li class="${k}"><b>${t}</b><span>→</span></li>`).join("")}</ul>`}
</section>`;
}
function hmCollab(empty) {
  if (empty) return `<section class="hx-mod hx-col" style="--hue:255,138,36" aria-labelledby="hx-t3"><header><span class="hx-port mono">C</span><h2 id="hx-t3"><span class="en">WORKFLOW</span>协同</h2><a href="#">协同 →</a></header><p class="hx-empty">还没有运行中的协同</p></section>`;
  const st = ["claude", "claude", "claude", "codex", "codex", "claude", "user", "user"];
  const col = { claude: "#ff8a24", codex: "#4de3ff", user: "#ffd166" };
  const W = 300, X = (i) => 10 + i * ((W - 20) / 7);
  const seg = st.slice(0, 6).map((k, i) => i ? `<line x1="${X(i - 1)}" y1="14" x2="${X(i)}" y2="14" stroke="${i === 3 ? "url(#hx-g3)" : i === 5 ? "url(#hx-g5)" : col[k]}"/>` : "").join("");
  const dots = st.map((k, i) => i < 5 ? `<circle cx="${X(i)}" cy="14" r="4.5" fill="#0b172a" stroke="${col[k]}" stroke-width="2.5"/>` : i === 5 ? `<circle cx="${X(i)}" cy="14" r="10" fill="rgba(255,138,36,.2)"/><circle cx="${X(i)}" cy="14" r="5.5" fill="#fff" stroke="${col[k]}" stroke-width="3"/>` : `<circle cx="${X(i)}" cy="14" r="4" fill="none" stroke="rgba(140,178,255,.45)" stroke-width="1.5" stroke-dasharray="2 2"/>`).join("");
  return `<section class="hx-mod hx-col" style="--hue:255,138,36" aria-labelledby="hx-t3"><header><span class="hx-port mono">C</span><h2 id="hx-t3"><span class="en">WORKFLOW</span>协同</h2><a href="#">线路图 →</a></header>
  <p class="hx-run">数码世界 · 随手记页 <span class="mono">6/8</span></p>
  <svg class="hx-line" viewBox="0 0 ${W} 28"><defs><linearGradient id="hx-g3" gradientUnits="userSpaceOnUse" x1="${X(2)}" x2="${X(3)}"><stop offset="0" stop-color="#ff8a24"/><stop offset="1" stop-color="#4de3ff"/></linearGradient><linearGradient id="hx-g5" gradientUnits="userSpaceOnUse" x1="${X(4)}" x2="${X(5)}"><stop offset="0" stop-color="#4de3ff"/><stop offset="1" stop-color="#ff8a24"/></linearGradient></defs><g stroke-width="3.5" stroke-linecap="round">${seg}</g><line x1="${X(5) + 8}" y1="14" x2="${X(7)}" y2="14" stroke="rgba(140,178,255,.35)" stroke-width="2" stroke-dasharray="1 6" stroke-linecap="round"/>${dots}</svg>
  <div class="hx-next"><span class="hx-next-av">${sprite("metalgreymon", 30)}</span><span><b>轮到 机械暴龙兽</b><small>逐区验收 · 3 小时</small></span><button class="hx-go" aria-label="带到 机械暴龙兽 继续">继续 ${ic("ArrowRight", 14)}</button></div>
</section>`;
}
function hmProjects(empty) {
  if (empty) return `<section class="hx-mod hx-proj" style="--hue:166,227,110" aria-labelledby="hx-t4"><header><span class="hx-port mono">D</span><h2 id="hx-t4"><span class="en">SAVE DATA</span>在推进</h2><a href="#">项目空间 →</a></header><p class="hx-empty">还没有在推进的项目</p></section>`;
  const ps = [["个人 AI 工作台", "machinedramon", "未存档 4 天", "warn"], ["银饰作品集", "", "", ""], ["旧博客", "metalgreymon", "停滞 21 天", "sleep"]];
  return `<section class="hx-mod hx-proj" style="--hue:166,227,110" aria-labelledby="hx-t4"><header><span class="hx-port mono">D</span><h2 id="hx-t4"><span class="en">SAVE DATA</span>在推进</h2><a href="#">项目空间 →</a></header>
  <ol>${ps.map(([n, ch, flag, k], i) => `<li class="${k}"><span class="hx-slot mono">${String(i + 1).padStart(2, "0")}</span><b>${n}</b>${flag ? `<span class="hx-flag ${k}">${flag}</span>` : "<span></span>"}<span class="hx-av">${ch ? sprite(ch, 26) : `<i class="hx-ghost"></i>`}</span></li>`).join("")}</ol>
</section>`;
}
function hmCore(empty) {
  return `<div class="hx-core">
  <div class="hx-date" aria-label="10 月 5 日 星期日">${r.lcd("10·05", 7)}<span class="hx-dow"><b>星期日</b><span class="en">SUN · WEEK 40</span></span></div>
  <p class="hx-greet">${empty ? "早上好。今天还很安静。" : `早上好。<b class="r">2 件事</b>等你决定，<b class="o">机械暴龙兽</b>正在验收。`}</p>
  <figure class="hx-device"><span class="hx-halo"></span>${r.digivice(236, "egg")}<figcaption><span class="en">PARTNER · 数码蛋</span><span class="hx-grow">${Array.from({ length: 10 }, (_, i) => `<i class="${i < 7 ? "on" : ""}"></i>`).join("")}</span><small>再完成 3 次协同就会孵化</small></figcaption></figure>
  <label class="hx-cmd"><span class="hx-prompt mono">&gt;</span><input placeholder="记一笔：一个念头、一个问题……" aria-label="记一笔"><span class="mono hx-key">⌘↵</span></label>
  <div class="hx-quick"><a href="#">接力</a><i></i><a href="#">查知识</a><i></i><a href="#">新建资产</a></div>
</div>`;
}
// 走线：从四块屏的内侧边连到暴龙机两侧；有需要注意的事时，线上有信号脉冲流向暴龙机。
function hmTraces(empty) {
  // 坐标按实测：走线层 1078×600；暴龙机 x 421–657、y 103–339；左键约 (437, 228)，右键约 (617, 205) 与 (617, 251)。
  const W = 1078, H = 600;
  const route = ([x1, y1], [x2, y2]) => { const dir = x1 < x2 ? 1 : -1, mx = x1 + dir * 36, d = Math.sign(y2 - y1) || 1, r0 = 12; return `M${x1} ${y1} H${mx - dir * r0} Q${mx} ${y1} ${mx} ${y1 + d * r0} V${y2 - d * r0} Q${mx} ${y2} ${mx + dir * r0} ${y2} H${x2}`; };
  const t = [["a", [330, 118], [429, 216], ""], ["b", [330, 452], [429, 240], empty ? "" : "r"], ["c", [748, 118], [625, 205], empty ? "" : "o"], ["d", [748, 452], [625, 251], empty ? "" : "y"]];
  return `<svg class="hx-traces" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" aria-hidden="true">${t.map(([id, a, b, sig]) => { const d = route(a, b); return `<path class="hx-tr" d="${d}"/>${sig ? `<path class="hx-sig ${sig}" d="${d}"/>` : ""}<circle class="hx-pin" cx="${a[0]}" cy="${a[1]}" r="3.5"/><circle class="hx-pin end" cx="${b[0]}" cy="${b[1]}" r="3"/>`; }).join("")}</svg>`;
}
const home = (mode) => {
  const empty = mode === "empty";
  return page("home", "00", "世界总览", "世界总览", `<section class="hx" aria-label="世界总览"><span class="hx-floor" aria-hidden="true"></span>${hmTraces(empty)}<div class="hx-col-l">${hmToday(empty)}${hmPending(empty)}</div>${hmCore(empty)}<div class="hx-col-r">${hmCollab(empty)}${hmProjects(empty)}</div></section>`);
};
for (const [file, mode] of [["home", "default"], ["home-empty", "empty"]])
  await emit(`${file}.html`, home(mode));
console.log("pages: home ×2");
