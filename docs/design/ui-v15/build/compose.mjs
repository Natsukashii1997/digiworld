// UI v15 高保真视觉稿生成器：真实组件（服务端渲染）+ 真实编译样式 + v15 样式层 → 每页一个 HTML，外加查看器。
// 数据全部合成；不读任何真实数据，不连接任何服务。
import { build } from "esbuild";
import { readFile, writeFile, mkdir, copyFile } from "node:fs/promises";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const root = "/Users/nat/Documents/ChatGPT/个人/work/personal-ai-workbench";
const dir = join(root, "docs/design/ui-v15");
const bdir = join(dir, "build");
await build({ absWorkingDir: root, entryPoints: [join(bdir, "kit-entry.jsx")], bundle: true, platform: "node", format: "esm", outfile: join(bdir, "kit.bundle.mjs"), packages: "external", logLevel: "warning", jsx: "automatic", loader: { ".js": "jsx" } });
const { r } = await import(pathToFileURL(join(bdir, "kit.bundle.mjs")) + "?t=" + Date.now());
const live = JSON.parse(await readFile(join(bdir, "live.json"), "utf8"));
await copyFile(join(bdir, "app.css"), join(dir, "app.css"));
await mkdir(join(dir, "pages"), { recursive: true });

// ---------- 外壳 ----------
const NAV_LABEL = { home: "世界总览", inbox: null, assets: "资产仓库", references: "逆向工程", agents: "智能体群", projects: "项目空间", collab: "协同", knowledge: "知识仓库", calendar: "日历", notes: "随手记", aihot: "AI HOT", settings: "设置", history: "版本归档" };
const CODE = { home: "00", inbox: "IN", assets: "01", references: "02", agents: "03", projects: "04", collab: "05", knowledge: "07", calendar: "08", notes: "09", aihot: "10", settings: "13", history: "14" };
function sidebar(route) {
  let s = live.home.sidebar.replace(/ active"/g, '"').replace(/ aria-current="page"/g, "");
  const label = NAV_LABEL[route];
  if (label) s = s.replace(new RegExp(`<button class="nav-item ([^"]*)"([^>]*)>((?:(?!</button>).)*?<span>${label.replace(/ /g, " ")}</span>)`), (m, c, a, inner) => `<button class="nav-item ${c} active" aria-current="page"${a}>${inner}`);
  s = s.replace(/(<span class="partner-screen"[^>]*>)([\s\S]*?)(<\/span>)/, (m, o, inner, c) => `${o}<span style="display:grid;place-items:center;height:100%">${r.pixel("egg", 44)}</span>${c}`);
  return s;
}
function topbar(route, title) {
  return live.home.topbar.replace(/<span class="crumb-code">[^<]*<\/span><strong>[^<]*<\/strong>/, `<span class="crumb-code">${CODE[route]}</span><strong>${title}</strong>`);
}
const LIFE = ["calendar", "notes", "aihot"];
function page(route, title, body) {
  const life = LIFE.includes(route) ? " life" : "";
  return `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>v15 · ${title}</title><link rel="stylesheet" href="../app.css"><link rel="stylesheet" href="../v15.css"><style>body{margin:0}</style></head><body><div class="app-shell">${sidebar(route)}<div class="workspace">${topbar(route, title)}<main id="main-content" class="main-content page-${route} v14 v15${life}">${body}</main></div></div></body></html>`;
}
const B = (label, icon, cls = "") => `<button class="button ${cls}">${icon ? r.ic(icon) : ""}${label}</button>`;
const B2 = (label, icon, cls = "") => B(label, icon, `secondary ${cls}`);
const GH = (label, icon) => B(label, icon, "secondary ghost");
function heading(id, lede, actions = "", eyebrow) {
  let h = r.heading(id, { description: lede, ...(eyebrow ? { eyebrow } : {}) });
  if (actions) h = h.replace(/<\/header>$/, `<div class="page-heading-action">${actions}</div></header>`);
  return h;
}
const bounds = (items) => `<div class="bounds">${items.map((t) => (t.startsWith("!") ? `<span class="bnd-lock">${t.slice(1)}</span>` : `<span>${t}</span>`)).join("")}</div>`;
const mini = (type, sprite) => r.cover({ type, sprite, serial: 1, version: null });
const lights = (done, cur, total = 5) => `<span class="lights">${Array.from({ length: total }, (_, i) => `<i class="${i < done ? "d" : i === cur ? "c" : ""}"></i>`).join("")}</span>`;
const lcd = (t, px = 3) => r.lcd(t, px);

// ---------- 00 世界总览 ----------
const home = page("home", "世界总览", `
<section class="home-hero m-panel sweep">${r.corners()}
  <div class="hero-copy" style="position:relative;z-index:1">
    <div class="page-eyebrow"><span class="page-code">00</span>${lcd("TODAY", 2)}</div>
    <h1>10月4日<small>星期日</small></h1>
    <p class="greet">早上好。今天有 <b>3 件事</b>等你判断，<b>2 个项目</b>在推进。</p>
    <div class="kpis">
      <button class="kpi"><span class="m-lcd">${lcd(3, 4)}</span><b>待处理</b><span>1 件需要决定</span></button>
      <button class="kpi"><span class="m-lcd">${lcd(2, 4)}</span><b>在推进</b><span>工作台 · 复核</span></button>
      <button class="kpi"><span class="m-lcd">${lcd(4, 4)}</span><b>本周新资产</b><span>3 Prompt · 1 Skill</span></button>
    </div>
    <div class="hero-acts">${B("记一笔", "PenLine")}${B2("新建资产", "Plus")}${GH("上下文接力", "Bot")}</div>
  </div>
  <div class="hero-dev">${r.crest()}${r.digivice("egg", 250, 60)}<div class="partner-tag"><b>数码蛋 · 孵化前</b><small>已收录 6 份资产 · 再复用 3 次进入幼年期</small></div></div>
</section>
<div class="rail" style="margin-top:var(--s-6)">
  <section>
    <div class="sec-h"><h2>现在要处理</h2><span class="sub">待处理前三条 + 在推进项目的下一步</span><span class="end">${GH("全部待处理", "ArrowUpRight")}</span></div>
    <div class="feed m-screen">
      <div class="feed-row" style="--c:var(--red)"><span class="feed-ico">${r.agent("hermes", "head")}</span><div><h3>Hermes 有 2 项内容无法读取</h3><p>智能体群 · 需要决定</p></div><time>10/4 09:12</time>${B2("去处理", "", "sm")}</div>
      <div class="feed-row" style="--c:var(--yellow)"><span class="feed-ico">${r.pixel("Rule", 30)}</span><div><h3>规则模板 #1 有新版本 v1.1</h3><p>资产仓库 · 等你确认</p></div><time>10/3 21:40</time>${B2("去处理", "", "sm")}</div>
      <div class="feed-row" style="--c:var(--yellow)"><span class="feed-ico">${r.ic("PenLine", 20)}</span><div><h3>5 条随手记还没归位到 Obsidian</h3><p>随手记 · 等你确认</p></div><time>10/3 16:00</time>${B2("去处理", "", "sm")}</div>
      <div class="feed-row" style="--c:var(--orange)"><span class="feed-ico">${r.agent("claude", "head")}</span><div><h3>个人 AI 工作台</h3><p>${lights(3, 3)} 复核 · 下一步：交用户终验</p></div><time>WB-161</time>${B2("去协同", "", "sm")}</div>
      <div class="feed-row" style="--c:var(--orange)"><span class="feed-ico">${r.agent("codex", "head")}</span><div><h3>银饰作品集</h3><p>${lights(2, 2)} 开发 · 下一步：补齐收藏格目标</p></div><time>SV-12</time>${B2("去协同", "", "sm")}</div>
    </div>
  </section>
  <aside>
    <div class="m-screen scr"><div class="scr-h">${lcd("AI HOT", 2)}<span class="end">本机缓存 08:00</span></div>
      <div class="hot-list" style="position:relative;z-index:1">
        <article><span class="no">01</span><div><h4>如何把设计落到最后一公里</h4><small>合成来源 · 10/3</small></div></article>
        <article><span class="no">02</span><div><h4>Agent 多步调用中的错误累积</h4><small>合成来源 · 10/3</small></div></article>
        <article><span class="no">03</span><div><h4>本地优先软件的同步取舍</h4><small>合成来源 · 10/3</small></div></article>
      </div></div>
    <div class="m-panel scr"><div class="scr-h">${lcd("SAVE SLOT", 2)}<span class="end">最近迭代</span></div>
      <div class="slots" style="position:relative;z-index:1">
        <div class="slot">${mini("Skill")}<div><b>设计的最后一公里</b><small>Skill · v3.0 · 10/4</small></div>${r.stage(2)}</div>
        <div class="slot">${mini("Prompt")}<div><b>把模糊想法变清晰</b><small>Prompt · v1.2 · 10/4</small></div>${r.stage(1)}</div>
        <div class="slot">${mini("Workflow")}<div><b>从灵感到上线</b><small>工作流 · v1.0 · 10/3</small></div>${r.stage(0)}</div>
      </div></div>
  </aside>
</div>
<section style="margin-top:var(--s-6)">
  <div class="sec-h"><h2>世界地图</h2><span class="sub">每块是一个区 · 迷雾是尚未开放的地标</span></div>
  <div class="worldmap">
    <div class="wz" style="--c:var(--orange)"><span class="en">ASSETS</span><b>资产</b><span class="fact">6 份 · 本周 +4</span><div class="land"><span>资产仓库</span><span>逆向工程</span></div><span class="mon">${r.pixel("egg3", 40)}</span></div>
    <div class="wz" style="--c:var(--cyan)"><span class="en">TARGETS</span><b>目标</b><span class="fact">5 Agent · 2 在推进</span><div class="land"><span>智能体群</span><span>项目空间</span></div><span class="mon">${r.pixel("agumon", 40)}</span></div>
    <div class="wz" style="--c:var(--violet)"><span class="en">RUNTIME</span><b>运行</b><span class="fact">1 条口令待复制</span><div class="land"><span>协同</span><span class="fog">夜巡</span></div><span class="mon">${r.pixel("mecha", 40)}</span></div>
    <div class="wz" style="--c:var(--lcd)"><span class="en">KNOWLEDGE</span><b>知识</b><span class="fact">我的知识 本周 +3</span><div class="land"><span>知识仓库</span></div><span class="mon">${r.pixel("koromon", 40)}</span></div>
    <div class="wz" style="--c:var(--pink)"><span class="en">LIFE</span><b>生活</b><span class="fact">今日 3 个规划块</span><div class="land"><span>日历</span><span>随手记</span><span>AI HOT</span></div><span class="mon">${r.pixel("numemon", 40)}</span></div>
  </div>
</section>`);

// ---------- IN 待处理 ----------
const inbox = page("inbox", "待处理", `
${heading("inbox", "需要你判断的事集中在这里；动作在对应页面完成。", GH("重新汇总", "RefreshCw"))}
${bounds(["只汇总 · 不代办", "本机数据", "!未接入的来源不计为 0"])}
<div class="triage">
  <button class="tile on" style="--c:var(--text-2)"><span class="m-lcd">${lcd(4, 4)}</span><b>全部</b><span>按级别与时间排序</span></button>
  <button class="tile" style="--c:var(--red)"><span class="m-lcd">${lcd(1, 4)}</span><b>需要决定</b><span>异常、改版候选</span></button>
  <button class="tile" style="--c:var(--yellow)"><span class="m-lcd">${lcd(2, 4)}</span><b>等你确认</b><span>规则升级、未归位</span></button>
  <button class="tile" style="--c:var(--cyan)"><span class="m-lcd">${lcd(1, 4)}</span><b>顺手看看</b><span>建议、晨报</span></button>
</div>
<div class="rail">
  <section>
    <div class="tabs"><button class="on">全部 <span class="n">4</span></button><button>资产仓库 <span class="n">1</span></button><button>智能体群 <span class="n">1</span></button><button>随手记 <span class="n">1</span></button><button>个人说明 <span class="n">1</span></button><button>夜巡晨报 <span class="n">0</span></button></div>
    <div class="feed m-screen">
      <div class="feed-grp" style="--c:var(--red)">需要决定 <b>1</b></div>
      <div class="feed-row" style="--c:var(--red)"><span class="feed-ico">${r.agent("hermes", "head")}</span><div><h3>Hermes 有 2 项内容无法读取</h3><p>智能体群 · 内容清单 · skills/legacy-*</p></div><time>10/4 09:12</time>${B2("去处理", "ArrowUpRight", "sm")}</div>
      <div class="feed-grp" style="--c:var(--yellow)">等你确认 <b>2</b></div>
      <div class="feed-row" style="--c:var(--yellow)"><span class="feed-ico">${r.pixel("Rule", 30)}</span><div><h3>规则模板 #1 有新版本 v1.1</h3><p>资产仓库 · 规则升级 · 3 个项目已安装</p></div><time>10/3 21:40</time>${B2("去处理", "ArrowUpRight", "sm")}</div>
      <div class="feed-row" style="--c:var(--yellow)"><span class="feed-ico">${r.ic("PenLine", 20)}</span><div><h3>5 条随手记还没归位到 Obsidian</h3><p>随手记 · 没有当前正文匹配的 Vault 写入回执</p></div><time>10/3 16:00</time>${B2("去处理", "ArrowUpRight", "sm")}</div>
      <div class="feed-grp" style="--c:var(--cyan)">顺手看看 <b>1</b></div>
      <div class="feed-row" style="--c:var(--cyan)"><span class="feed-ico">${r.ic("UserRound", 20)}</span><div><h3>个人说明有 1 条修改建议</h3><p>个人说明 · Hermes 经本机 MCP 提交</p></div><time>10/3 11:05</time>${B2("预览差异", "ArrowUpRight", "sm")}</div>
    </div>
  </section>
  <aside>
    <div class="m-screen scr srcmon"><div class="scr-h">${lcd("SOURCE", 2)}<span class="end">来源覆盖</span></div>
      <div class="row"><span class="led"></span><span>资产仓库</span><small>已接入</small></div>
      <div class="row"><span class="led"></span><span>项目空间</span><small>已接入</small></div>
      <div class="row"><span class="led"></span><span>能力体检</span><small>10/4 09:12</small></div>
      <div class="row"><span class="led"></span><span>随手记 · Vault 回执</span><small>已读取</small></div>
      <div class="row"><span class="led off"></span><span class="muted">夜巡晨报</span><small>尚未运行</small></div>
    </div>
    <div class="m-panel scr"><div class="scr-h"><b style="font-size:15px">个人说明修改建议</b></div><p class="muted" style="margin:0 0 14px;font-size:13px;position:relative;z-index:1">Agent 通过本机 MCP 提交；你预览差异后采纳或拒绝。</p><div style="position:relative;z-index:1">${B2("读回最新建议", "RefreshCw", "sm")}</div></div>
  </aside>
</div>`);

// ---------- 01 资产仓库（标杆：真实页面原样） ----------
const assets = page("assets", "资产仓库", r.assets());

// ---------- 02 逆向工程 ----------
const references = page("references", "逆向工程", `
${heading("references", "把好内容拆给 Agent，回收报告，确认后沉淀为焚决或 Prompt。", B("投入素材", "Plus"))}
${bounds(["只分析你提供的或公开材料", "报告分 原文观察 / 推断 / 已验证", "!复制 ≠ 已派发"])}
<div class="board">
  <div class="lane m-panel"><div class="lane-h">素材 <span class="n">1</span></div><button class="rec">${mini("Prompt")}<span><small>RE-0004 · 草稿</small><b>好产品文案的三秒法则</b></span></button><button class="add">＋ 投入素材</button></div>
  <div class="lane m-panel"><div class="lane-h">交给 Agent <span class="n">1</span></div><button class="rec">${mini("Skill")}<span><small>RE-0002 · 已复制给 Codex</small><b>别人的代码评审 prompt</b></span></button></div>
  <div class="lane m-panel"><div class="lane-h" style="color:var(--orange-2)">报告待确认 <span class="n">1</span></div><button class="rec sel">${mini("Scroll")}<span><small>RE-0003 · 待入库</small><b>一个爆款开头的拆解</b></span></button></div>
  <div class="lane m-panel"><div class="lane-h">已入库 <span class="n">3</span></div><button class="rec">${mini("Prompt")}<span><small>RE-0001 · 1 项</small><b>先给结论再给理由</b></span></button><button class="rec">${mini("Scroll")}<span><small>RE-0000 · 2 项</small><b>评审意见的语气</b></span></button></div>
</div>
<section class="bench m-screen">${r.corners()}
  <div class="bench-h" style="position:relative;z-index:1"><span class="label">WORKBENCH</span><h2>一个爆款开头的拆解</h2><span class="mono muted" style="font-size:12px">RE-0003 · 10/03</span><span style="margin-left:auto">${GH("删除", "Trash2")}</span></div>
  <div class="stepper" style="position:relative;z-index:1">
    <div><span class="dot">✓</span><b>投入素材</b><small>10/03 17:40 已保存</small></div>
    <div><span class="dot">✓</span><b>交给 Agent</b><small>已复制给 Codex · 17:42</small></div>
    <div><span class="dot">✓</span><b>粘贴回复</b><small>已解析 · 3 段报告</small></div>
    <div class="cur"><span class="dot">04</span><b>确认入库</b><small>勾选候选后入库</small></div>
  </div>
  <div class="clip" style="position:relative;z-index:1">
    <div class="paper"><div class="from">素材原文 · 2026-10-03 · 只在本机</div><h3>一个爆款开头的拆解</h3>
      <p><span class="hl a">你花三个月做的功能，用户三秒就划走了。<sup>①</sup></span>不是功能不好，<span class="hl b">是你从第一句话就在讲自己，而不是讲他。<sup>②</sup></span></p>
      <p>换个开头：<span class="hl c">先说他正在经历的那一刻，再说你能帮他省下什么。<sup>③</sup></span>这样他才会读第二句。</p></div>
    <div class="annos">
      <div class="anno" style="--c:var(--orange)"><b>① 钩子：反差</b><span>投入与反馈的强烈落差，三秒内制造痛点</span><em>原文观察</em></div>
      <div class="anno" style="--c:var(--cyan)"><b>② 结构：先破后立</b><span>否定常见归因，引出真正原因</span><em>推断</em></div>
      <div class="anno" style="--c:var(--lcd)"><b>③ 可复用句式</b><span>“先说他正在经历的那一刻，再说你能帮他省下什么”</span><em>已验证</em></div>
    </div>
  </div>
  <div class="m-panel" style="position:relative;z-index:1"><div class="cand"><span class="box">✓</span>${mini("Prompt")}<div><b style="font-size:15px">三问拆需求</b><div class="muted" style="font-size:12.5px">发生了什么？为什么值得解决？怎样验证？ · 候选 Prompt · 推断</div></div>${B("确认入库（1）", "Check")}</div></div>
  <div class="m-panel" style="position:relative;z-index:1">
    <div class="done-row"><span class="ok">✓</span><div><b>任务包</b><small>已复制给 Codex · 10/03 17:42 · 1.2 KB</small></div>${GH("查看 / 再复制", "Copy")}</div>
    <div class="done-row"><span class="ok">✓</span><div><b>Agent 回复</b><small>JSON 已解析 · 结构 1 · 手法 1 · 可复用 1</small></div>${GH("查看原文", "FileText")}</div>
  </div>
</section>`);

// ---------- 03 智能体群 ----------
const agents = page("agents", "智能体群", `
${heading("agents", "你的队伍：每个 Agent 的擅长、成本、内容与健康。", GH("上下文接力", "Bot") + B("重新检测", "RefreshCw"))}
${bounds(["检测到 ≠ 已登录或可控制", "!改真实配置需授权并预览"])}
<div class="roster" role="radiogroup" aria-label="角色">
  <button class="rcard m-panel on"><span class="av m-screen">${r.agent("codex", "head")}</span><b>Codex</b><small><span class="led" style="--c:var(--red)"></span>主力 · 2 失效</small></button>
  <button class="rcard m-panel"><span class="av m-screen">${r.agent("claude", "head")}</span><b>Claude Code</b><small><span class="led"></span>主力 · 正常</small></button>
  <button class="rcard m-panel"><span class="av m-screen">${r.agent("hermes", "head")}</span><b>Hermes</b><small><span class="led" style="--c:var(--yellow)"></span>主力 · 2 无法读取</small></button>
  <button class="rcard m-panel"><span class="av m-screen">${r.agent("openclaw", "head")}</span><b>OpenClaw</b><small><span class="led off"></span>附属 · 未检查</small></button>
  <button class="rcard m-panel"><span class="av m-screen"><span class="agent-letter" style="width:48px;height:48px;font-size:14px;color:var(--muted)">豆包</span></span><b>豆包工作</b><small><span class="led off"></span>仅安装检测</small></button>
</div>
<section class="dossier m-panel">
  <div class="stage-box m-screen sweep">${r.corners()}${r.agent("codex", "dossier")}</div>
  <div class="dz">
    <div class="dz-h"><span class="label">DOSSIER</span><h2>Codex</h2><span class="maturity ready"><i></i>主力</span><span class="muted" style="font-size:13px">机械邪龙兽 · 本机已检测</span><span style="margin-left:auto">${GH("编辑角色卡", "Pencil")}</span></div>
    <div class="facts">
      <div><span class="label">擅长</span><div class="chips"><span>代码实现</span><span>重构</span><span>测试</span><span>命令行</span></div></div>
      <div><span class="label">成本</span><span class="energy"><i class="f"></i><i class="f"></i><i></i></span></div>
      <div><span class="label">常驻项目</span><span>个人 AI 工作台</span></div>
      <div><span class="label">上次检查</span><span class="mono" style="font-size:13px">10/04 09:12</span></div>
    </div>
    <div class="m-lcd quad">
      <div class="readout"><span class="k">SKILL</span>${lcd(14, 4)}</div>
      <div class="readout"><span class="k">PLUGIN</span>${lcd(3, 4)}</div>
      <div class="readout"><span class="k">BROKEN</span>${lcd(2, 4)}</div>
      <div class="readout"><span class="k">UNREAD</span>${lcd(0, 4)}</div>
    </div>
    <div class="dispatch"><span class="label" style="color:var(--orange-2)">派活</span><input aria-label="描述任务" placeholder="描述任务，例如：重构登录模块并补测试">${B2("推荐人选", "Sparkles", "sm")}</div>
  </div>
</section>
<div class="tabs"><button class="on">内容清单 <span class="n">17</span></button><button>能力体检 <span class="n bad">2 异常</span></button><button>本机入口 <span class="n">11</span></button><button>写入与迁移 <span class="n">需授权</span></button></div>
<div class="m-screen" style="padding:6px 6px 0">
<table class="tbl" style="position:relative;z-index:1"><thead><tr><th>名称</th><th>状态</th><th>类型</th><th>来源</th><th></th></tr></thead><tbody>
  <tr><td><span class="ico" style="--c:var(--orange)">${r.pixel("Skill", 20)}</span>design-last-mile<small>~/.codex/skills/design-last-mile</small></td><td><span class="st ok">启用</span></td><td>Skill</td><td>资产仓库 v3.0</td><td style="text-align:right">${GH("预览停用", "ToggleRight")}</td></tr>
  <tr><td><span class="ico" style="--c:var(--red)">${r.pixel("Skill", 20)}</span>legacy-review<small>链接指向已删除目录</small></td><td><span class="st bad">失效</span></td><td>Skill</td><td>未知</td><td style="text-align:right">${GH("查看原因", "Info")}</td></tr>
  <tr><td><span class="ico" style="--c:var(--cyan)">${r.ic("Puzzle", 18)}</span>browser-tools<small>browser-tools@official</small></td><td><span class="st ok">启用</span></td><td>插件</td><td>官方市场</td><td style="text-align:right">${GH("预览停用", "ToggleRight")}</td></tr>
  <tr><td><span class="ico" style="--c:var(--orange)">${r.pixel("Skill", 20)}</span>handoff-writer<small>~/.codex/skills/handoff-writer</small></td><td><span class="st warn">与仓库版本不一致</span></td><td>Skill</td><td>资产仓库 v1.0</td><td style="text-align:right">${GH("存入资产", "PackagePlus")}</td></tr>
</tbody></table></div>`);

// ---------- 04 项目空间 ----------
const heat = (s) => `<div class="heat">${s.split("").map((c) => `<i class="${c === "2" ? "b" : c === "1" ? "a" : ""}"></i>`).join("")}</div>`;
const projects = page("projects", "项目空间", `
${heading("projects", "每个在推进的项目一张存档卡：阶段、接力、下一步。", GH("扫描目录", "FolderSearch") + B("登记项目", "Plus"))}
${bounds(["只读 Git 元信息与 CURRENT", "!不读项目正文"])}
<div class="strip m-screen">
  <span class="it"><span class="lcd2">${lcd(2, 3)}</span>在推进</span>
  <span class="it"><span class="lcd2">${lcd(9, 3)}</span>全部项目</span>
  <span class="it"><span class="lcd2">${lcd(1, 3)}</span>停滞超过 7 天</span>
  <span class="it"><span class="led off"></span>GitHub 未连接</span>
  <span class="end">扫描于 10/04 10:00</span>
</div>
<div class="sec-h"><h2>在推进</h2><span class="sub">存档卡 · 按最近活动</span></div>
<div class="saves">
  <article class="save m-panel"><div class="slotlcd m-lcd"><span class="k">SLOT</span>${lcd("01", 4)}</div><div>
    <div style="display:flex;gap:10px;align-items:baseline;flex-wrap:wrap"><h3>个人 AI 工作台</h3><span class="mono muted" style="font-size:11.5px">WB-20261004-161</span></div>
    <div class="who">${r.agent("claude", "head")}<span>写入者 Claude</span><span style="margin-left:auto">${lights(3, 3)}</span><span class="mono" style="font-size:12px;color:var(--orange-2)">复核</span></div>
    <div class="bubble"><span class="k">下一步</span>用户审阅 UI v15 视觉稿，确认后逐页落地</div>
    ${heat("001012001221010012210122122222")}
    <div class="acts">${B2("去协同", "Handshake", "sm")}${GH("详情", "ChevronRight")}</div></div></article>
  <article class="save m-panel"><div class="slotlcd m-lcd"><span class="k">SLOT</span>${lcd("02", 4)}</div><div>
    <div style="display:flex;gap:10px;align-items:baseline;flex-wrap:wrap"><h3>银饰作品集</h3><span class="mono muted" style="font-size:11.5px">SV-12</span></div>
    <div class="who">${r.agent("codex", "head")}<span>写入者 Codex</span><span style="margin-left:auto">${lights(2, 2)}</span><span class="mono" style="font-size:12px;color:var(--orange-2)">开发</span></div>
    <div class="bubble"><span class="k">下一步</span>补齐收藏格目标数量，回读后交接</div>
    ${heat("000000000100000000000100000010")}
    <div class="acts">${B2("去协同", "Handshake", "sm")}${GH("详情", "ChevronRight")}</div></div></article>
</div>
<div class="sec-h"><h2>全部项目</h2><span class="sub">9</span><span class="end"><span class="seg"><button class="on">全部</button><button>本地</button><button>GitHub</button><button>已归档</button></span></span></div>
<div class="m-screen" style="padding:6px 6px 0"><table class="tbl" style="position:relative;z-index:1"><thead><tr><th>项目</th><th>状态</th><th>最近活动</th><th>30 天</th><th></th></tr></thead><tbody>
  <tr><td><span class="ico" style="--c:var(--orange)">${r.ic("Folder", 18)}</span>个人 AI 工作台<small>~/Documents/…/personal-ai-workbench</small></td><td><span class="st ok">在推进</span></td><td class="mono" style="font-size:12.5px">今天</td><td>42 次提交</td><td style="text-align:right">${GH("详情", "ChevronRight")}</td></tr>
  <tr><td><span class="ico" style="--c:var(--orange)">${r.ic("Folder", 18)}</span>银饰作品集<small>~/Projects/silver</small></td><td><span class="st ok">在推进</span></td><td class="mono" style="font-size:12.5px">10/02</td><td>3 次提交</td><td style="text-align:right">${GH("详情", "ChevronRight")}</td></tr>
  <tr><td><span class="ico" style="--c:var(--muted)">${r.ic("Folder", 18)}</span>旧博客<small>~/Projects/blog</small></td><td><span class="st warn">停滞 21 天</span></td><td class="mono" style="font-size:12.5px">09/13</td><td>0 次</td><td style="text-align:right">${B2("标为在推进", "Flag", "sm")}</td></tr>
  <tr><td><span class="ico" style="--c:var(--muted)">${r.ic("Folder", 18)}</span>dotfiles<small>~/dotfiles</small></td><td><span class="st off">未标记</span></td><td class="mono" style="font-size:12.5px">09/28</td><td>5 次</td><td style="text-align:right">${B2("标为在推进", "Flag", "sm")}</td></tr>
</tbody></table></div>`);

// ---------- 05 协同 ----------
const collab = page("collab", "协同", `
${heading("collab", "两台暴龙机对接：左边持笔者，右边下一棒。", `<span class="seg"><button class="on">个人 AI 工作台</button><button>银饰作品集</button></span>`)}
${bounds(["口令只复制，不自动发送", "以项目 CURRENT 为准"])}
<section class="link m-panel sweep">${r.corners()}
  <div class="dev" style="--c:var(--orange)">${r.digiviceLcd("CC", 220)}<div><span class="role">HOLDER</span><b>Claude</b><small>持笔者 · 认领 160 → 161</small></div></div>
  <div class="wire">
    <div class="capsule"><b>UI v15 视觉稿</b><small>WB-20261004-161 · 写入者 无</small></div>
    <div class="track"><div class="d"><i></i>契约</div><div class="d"><i></i>实现</div><div class="d"><i></i>回归</div><div class="c"><i></i>复核</div><div><i></i>终验</div></div>
    ${B("生成下一棒口令", "Send")}
  </div>
  <div class="dev" style="--c:var(--cyan)">${r.digivice("egg", 220, 56)}<div><span class="role">NEXT</span><b>用户</b><small>下一棒 · 审阅视觉稿</small></div></div>
</section>
<div class="trio">
  <div class="m-screen scr"><div class="scr-h">${lcd("STATE", 2)}</div><b>WB-20261004-161</b><p>写入者 无 · 唯一下一步：用户审阅 UI v15 视觉稿</p></div>
  <div class="m-screen scr"><div class="scr-h">${lcd("PROMPT", 2)}<span class="end">绑定 161</span></div><b>下一棒口令</b><p>请实际读取 CURRENT（应为 161）……审阅 docs/design/ui-v15 视觉稿，逐页给出意见。</p>${B2("预览并复制", "Copy", "sm")}</div>
  <div class="m-screen scr"><div class="scr-h">${lcd("LOG", 2)}<span class="end">本机留痕</span></div>
    <div class="logline"><time>21:40</time><span>复制口令 · Claude</span></div>
    <div class="logline"><time>19:10</time><span>认领 158 · 复验通过</span></div>
    <div class="logline"><time>16:05</time><span>Codex 交接 157</span></div></div>
</div>`);

// ---------- 07 知识仓库 ----------
const bars = (arr) => `<div class="bars">${arr.map((v) => (v < 0 ? `<i class="u"></i>` : `<i style="height:${6 + v * 9}px"></i>`)).join("")}</div><div class="bars-x"><span>28</span><span>29</span><span>30</span><span>01</span><span>02</span><span>03</span><span>04</span></div>`;
const knowledge = page("knowledge", "知识仓库", `
${heading("knowledge", "连接 Obsidian，按原文查询；交给 Codex 整理，确认后落到“00 待整理”。", GH("规则与 MCP", "SlidersHorizontal") + B("新建整理任务", "Plus"))}
${bounds(["只读连接", "!候选确认后才写入 Vault"])}
<div class="qbar">${r.ic("Search", 18)}<input aria-label="查询原文" placeholder="按文件名或正文短语查询原文…"><span class="src">合成知识源 ▾</span>${B2("查询", "", "sm")}</div>
<div class="sec-h"><h2>三区</h2><span class="sub">统计于 10/4 10:00 · 本周自 9/28</span><span class="end">${GH("统计三区", "BarChart3")}${GH("划分规则", "SlidersHorizontal")}</span></div>
<div class="zones">
  <div class="zone m-screen" style="--c:var(--cyan)"><div class="zone-h"><span class="en">INPUT</span><b>输入区</b></div><div class="zone-num"><span class="m-lcd">${lcd(2, 4)}</span><span>本周 +1</span></div>${bars([-1, -1, -1, 0, 1, 1, 1])}<span class="desc">订阅、剪藏、导入资料；可检索，不当作权威</span></div>
  <div class="zone main m-screen" style="--c:var(--orange)"><div class="zone-h"><span class="en">MINE</span><b>我的知识</b><span class="tag">主要指标</span></div><div class="zone-num"><span class="m-lcd">${lcd(3, 4)}</span><span>本周 +3</span></div>${bars([-1, -1, -1, 0, 1, 2, 2])}<span class="desc">决定、方法、项目经验；优先引用</span></div>
  <div class="zone m-screen" style="--c:var(--lcd)"><div class="zone-h"><span class="en">PROFILE</span><b>个人说明</b></div><div class="zone-num"><span class="m-lcd">${lcd(1, 4)}</span><span>本周 +1</span></div>${bars([-1, -1, -1, 0, 1, 1, 1])}<span class="desc">“个人上下文”文件夹；每次会话的背景</span></div>
</div>
<div class="share"><i style="flex:2;background:var(--cyan);color:var(--cyan)"></i><i style="flex:3;background:var(--orange);color:var(--orange)"></i><i style="flex:1;background:var(--lcd);color:var(--lcd)"></i></div>
<div class="legend"><span style="color:var(--cyan)"><i></i><b style="color:var(--text-2);font-weight:500">输入区 2 篇 · 33%</b></span><span style="color:var(--orange)"><i></i><b style="color:var(--text-2);font-weight:500">我的知识 3 篇 · 50%</b></span><span style="color:var(--lcd)"><i></i><b style="color:var(--text-2);font-weight:500">个人说明 1 篇 · 17%</b></span><span class="muted">虚线柱 = 本机留存记录开始之前</span></div>
<div class="rail" style="margin-top:var(--s-6)">
  <section><div class="sec-h"><h2>整理任务</h2><span class="sub">仅限本人 Codex</span><span class="end"><span class="seg"><button class="on">进行中 1</button><button>已归档 4</button></span></span></div>
    <div class="m-panel">
      <div class="task"><div class="task-h">${r.pixel("Scroll", 22)}<b>如何保留事实、判断与人工门禁？</b><span class="st warn">候选待审</span><span class="end">3 份资料 · 10/01</span></div>
        <div class="prog"><div class="d"><i></i>选资料</div><div class="d"><i></i>交给 Codex</div><div class="c"><i></i>确认候选</div><div><i></i>落到 00 待整理</div></div><div>${B2("审阅候选", "ClipboardCheck", "sm")}</div></div>
      <div class="task"><div class="task-h">${r.pixel("Scroll", 22)}<b>项目交接的最小模板</b><span class="st ok">已落地</span><span class="end">2 份资料 · 09/30</span></div>
        <div class="prog"><div class="d"><i></i>选资料</div><div class="d"><i></i>交给 Codex</div><div class="d"><i></i>确认候选</div><div class="d"><i></i>落到 00 待整理</div></div></div>
    </div></section>
  <aside><div class="m-screen scr"><div class="scr-h">${lcd("LINK", 2)}<span class="end">连接状态</span></div>
    <div class="conn"><span class="ico">${r.ic("BookOpen", 18)}</span><span><b>合成知识源</b><small>Obsidian · 只读 · /synthetic/vault</small></span><span class="st ok">已连接</span></div>
    <div class="conn"><span class="ico">${r.ic("UserRound", 18)}</span><span><b>个人说明 MCP</b><small>本机 · 读取授权未开</small></span><span class="st off">未启动</span></div>
    <div class="conn"><span class="ico">${r.ic("Lock", 18)}</span><span><b class="muted">飞书知识库</b><small>第六阶段 · 需单独授权</small></span><span class="st off">未解锁</span></div>
    <div style="margin-top:12px;position:relative;z-index:1">${B2("连接知识源", "Plus", "sm")}</div></div></aside>
</div>`);

// ---------- 08 日历 ----------
const ev = (cls, top, h, t, s, extra = "") => `<div class="ev ${cls}" style="top:${top}px;height:${h}px;${extra}">${t}${s ? `<small>${s}</small>` : ""}</div>`;
const H = 57;
const calendar = page("calendar", "日历", `
<div class="page-heading" style="margin-bottom:var(--s-4)"><div class="page-heading-main"><div class="page-eyebrow"><span class="page-code">08</span>${lcd("CALENDAR", 2)}${r.maturity("partial")}</div></div></div>
<div class="calbar"><div class="date"><small>WEEK 40 · 9/28 – 10/4</small><b>2026 年 10 月</b></div>
  <span class="seg"><button class="on">周</button><button>今天</button></span>
  <span class="seg"><button aria-label="上一周">‹</button><button aria-label="下一周">›</button></span>
  ${GH("刷新", "RefreshCw")}${B("新建规划块", "CalendarPlus")}</div>
<div class="legend2"><span><i style="background:var(--orange)"></i>规划块 · 工作台日历，可改</span><span><i style="background:var(--cyan)"></i>其他日历 · 只读</span><span><i style="background:var(--violet)"></i>夜巡窗口 · 草稿</span><span class="muted">数据在 macOS 日历与提醒事项</span></div>
<div class="rail">
  <div class="week m-screen">
    <div class="wrow whead"><div></div><div>周一<b>28</b></div><div>周二<b>29</b></div><div>周三<b>30</b></div><div>周四<b>1</b></div><div>周五<b>2</b></div><div>周六<b>3</b></div><div class="today">周日<b>4</b></div></div>
    <div class="wrow wall-day"><div class="lab">全天</div><div></div><div></div><div></div><div></div><div></div><div></div><div class="today"><div class="alld">写交接 · 全天</div></div></div>
    <div class="wrow wgrid"><div class="hrs"><span>08:00</span><span>09:00</span><span>10:00</span><span>11:00</span><span>12:00</span><span>13:00</span><span>14:00</span><span>15:00</span></div>
      <div class="col">${ev("mine", H, H - 2, "写交接与回归", "09–10")}</div>
      <div class="col">${ev("ro", H, H - 2, "周会", "09–10 · 公司")}${ev("ro", H * 6, H * 0.75, "1:1", "")}</div>
      <div class="col">${ev("mine", H, H - 2, "写交接与回归", "09–10")}${ev("mine", H * 4, H * 2 - 2, "深度工作：v15 页面落地", "12–14")}</div>
      <div class="col">${ev("ro", H * 2, H - 2, "设计评审", "10–11 · 公司")}</div>
      <div class="col">${ev("mine", H, H - 2, "写交接与回归", "09–10")}</div>
      <div class="col">${ev("ro", H, H * 1.5 - 2, "读书会", "09–10:30")}</div>
      <div class="col today">${ev("mine sel", H, H - 2, "验收 155", "09–10")}${ev("ro", H * 6, H * 0.75, "", "", "right:52%")}${ev("mine", H * 6, H * 0.75, "", "", "left:50%")}<div class="now" style="top:${H * 2 + 2}px"></div></div>
    </div>
  </div>
  <aside>
    <div class="m-screen scr"><div class="scr-h"><b style="font-size:16px">周日 10/4</b><span class="end">选中的一天</span></div>
      <div class="day-it"><i style="background:var(--cyan)"></i><span><b>写交接</b><small>全天 · 公司 · 只读</small></span><span></span></div>
      <div class="day-it"><i style="background:var(--orange)"></i><span><b>验收 155</b><small>09:00–10:00 · 工作台</small></span>${GH("编辑", "Pencil")}</div>
      <div class="day-it"><i style="background:var(--cyan)"></i><span><b>重叠 1 写交接与回归</b><small>14:00–14:45 · 公司 · 只读</small></span><span></span></div>
      <div class="day-it"><i style="background:var(--orange)"></i><span><b>重叠 2 写交接与回归</b><small>14:00–14:45 · 工作台</small></span>${GH("编辑", "Pencil")}</div>
    </div>
    <div class="m-panel scr"><div class="scr-h"><b style="font-size:16px">todo</b><span class="end">提醒事项 · 工作台</span></div>
      <div class="todo-it"><span class="bx"></span><span>写交接与回归<small>提醒 10/4 17:00</small></span></div>
      <div class="todo-it"><span class="bx"></span><span>回复读书会时间<small>提醒 10/5 09:00</small></span></div>
      <div class="todo-it"><span class="bx"></span><span>整理随手记</span></div>
      <div class="addline"><input aria-label="新 todo" placeholder="防止遗忘的一件事">${B2("添加", "Plus", "sm")}</div></div>
  </aside>
</div>`);

// ---------- 09 随手记 ----------
const sticky = (c, time, body, state, extra = "") => `<article class="sticky" style="--c:${c}"><time>${time}</time>${body}${extra}<div class="ft"><span class="state ${state.startsWith("已炼") ? "burnt" : ""}">${state}</span><button class="iconbtn" aria-label="编辑">${r.ic("Pencil", 16)}</button><button class="iconbtn" aria-label="复制">${r.ic("Copy", 16)}</button><button class="iconbtn" aria-label="更多">${r.ic("MoreHorizontal", 18)}</button></div></article>`;
const notes = page("notes", "随手记", `
${heading("notes", "先把念头记下来；值得反复用的，炼入焚决。")}
${bounds(["只存本机", "!写入 Obsidian 需授权并预览"])}
<section class="composer m-panel"><div class="ttl">${r.ic("PenLine", 16)}此刻在想什么？</div><div class="inp">今天验收时发现：说明文字比数据还显眼</div>
  <div class="tools"><button class="tool" aria-label="列表">${r.ic("List", 18)}</button><button class="tool" aria-label="编号">${r.ic("ListOrdered", 18)}</button><button class="tool" aria-label="任务">${r.ic("ListChecks", 18)}</button><span class="sep"></span>
  <button class="tool" style="color:var(--red)">A</button><button class="tool" style="color:#6aa8ff">A</button><button class="tool" style="color:var(--lcd)">A</button><button class="tool" style="color:var(--yellow)">A</button><button class="tool" style="color:var(--muted)">A</button><span class="hint">聚焦时出现 · ⌘↵ 留下</span>${B("留下这个想法", "ArrowUpRight")}</div></section>
<div class="filters"><button class="on">全部 5</button><button>未炼 4</button><button>已炼 1</button><button>有任务 2</button><span class="end">按时间倒序</span></div>
<div class="stickies">
  ${sticky("var(--yellow)", "10/04 21:12", `<p class="ink">首页第一眼应该回答“今天要做什么”。</p><p>数字放大、可点；装饰退后。</p>`, "未炼")}
  ${sticky("var(--red)", "10/04 18:40", `<p class="ink">验收清单要非技术</p>`, "未炼", `<div class="ck"><i></i>改写终验清单：点哪里、看到什么算过</div><div class="ck done"><i></i>复跑全部浏览器脚本</div>`)}
  ${sticky("#6aa8ff", "10/04 11:05", `<p>夜巡先想清楚：跑什么、怎么跑、价值在哪。预算不是停止条件。</p>`, "已炼 · 焚决《夜巡原则》")}
  ${sticky("var(--lcd)", "10/03 22:30", `<p>好的空状态保持页面形态，不用大框。</p><p class="muted" style="font-size:13px">协同没数据时，两台暴龙机变暗就够了。</p>`, "未炼")}
  ${sticky("var(--muted)", "10/03 09:00", `<p>学习成长、银饰最后再做。</p>`, "未炼")}
</div>`);

// ---------- 10 AI HOT ----------
const aihot = page("aihot", "AI HOT", `
${heading("aihot", "每日 AI 资讯：精选、热点、日报；看到值得学的，收藏到学习成长。", GH("立即刷新", "RefreshCw"))}
${bounds(["aihot.news 公开接口", "只读 · 本机缓存", "!内容只当文本，不执行"])}
<header class="masthead"><h2>AI 日报</h2><span class="motto">DAILY · PERSONAL EDITION</span><div class="iss">日报日期 <b>2026/10/3</b><br>本机缓存 10/4 08:00 · 来源 aihot.news</div></header>
<div class="tabs" style="margin-top:10px"><button class="on">精选 <span class="n">10</span></button><button>热点 <span class="n">8</span></button><button>日报 <span class="n">12</span></button></div>
<div class="paper-grid">
  <article class="lead-story"><span class="kick">01 · 头条</span><h3>如何把设计落到最后一公里</h3><p>多数设计在交付时走样，不是因为工程能力，而是验收标准停留在“看起来差不多”。作者给出三条可执行的做法：把设计稿拆成可测量的约束；对照截图逐元素检查；把每一处偏离写进交接，而不是留在口头。</p><div class="meta"><span>合成来源 · 10/3 16:00</span>${B2("收藏到学习", "Star", "sm")}</div></article>
  <div class="seconds">
    <article><span class="no">02</span><h4>Agent 多步调用中的错误累积</h4><p>每一步 95% 的成功率，十步之后只剩六成；拆短链、加检查点比换模型更有效。</p><div class="row"><span>合成来源 · 10/3</span><span class="star on" aria-label="已收藏">★</span></div></article>
    <article><span class="no">03</span><h4>本地优先软件的同步取舍</h4><p>离线可用与冲突合并之间没有免费午餐；先定权威，再谈同步。</p><div class="row"><span>合成来源 · 10/3</span><span class="star" aria-label="收藏">☆</span></div></article>
  </div>
</div>
<div class="briefs">
  <div><span class="no">04</span><span><b>开源模型的评测基准之争</b><small>合成来源 · 10/3</small></span><span class="star">☆</span></div>
  <div><span class="no">05</span><span><b>长上下文的真实成本</b><small>合成来源 · 10/3</small></span><span class="star">☆</span></div>
  <div><span class="no">06</span><span><b>RAG 评测的十个坑</b><small>合成来源 · 10/3</small></span><span class="star on">★</span></div>
  <div><span class="no">07</span><span><b>代码助手的上下文窗口策略</b><small>合成来源 · 10/3</small></span><span class="star">☆</span></div>
  <div><span class="no">08</span><span><b>把评审意见写成可执行清单</b><small>合成来源 · 10/3</small></span><span class="star">☆</span></div>
  <div><span class="no">09</span><span><b>小模型在端侧的三个用法</b><small>合成来源 · 10/3</small></span><span class="star">☆</span></div>
</div>`);

// ---------- 13 设置 ----------
const cap = (type, sprite, title, desc, extra = "", dim = false) => `<div class="cap${dim ? " dim" : ""}">${r.cover({ type, sprite, serial: 1, version: null })}<div><b>${title}</b><p>${desc}</p></div><span class="switch"><i></i>关闭</span>${extra}</div>`;
const settings = page("settings", "设置", `
${heading("settings", "数据、授权与连接。所有真实写入都先预览，再由你确认。")}
<div class="setx">
  <nav class="cats m-panel" aria-label="设置分类">
    <button class="cat"><span class="ci">${r.ic("HardDrive", 16)}</span><b>数据与备份</b><small>上次完整备份 10/4</small><span class="led"></span></button>
    <button class="cat on"><span class="ci">${r.ic("ShieldCheck", 16)}</span><b>授权能力</b><small>5 项 · 已开启 0</small><span class="led off"></span></button>
    <button class="cat"><span class="ci">${r.ic("Server", 16)}</span><b>常驻服务</b><small>未安装 · 手动 5178</small><span class="led off"></span></button>
    <button class="cat"><span class="ci">${r.ic("Globe", 16)}</span><b>网络访问</b><small>AI HOT 允许 · 每 3 小时</small><span class="led"></span></button>
    <button class="cat"><span class="ci">${r.ic("Cpu", 16)}</span><b>模型连接</b><small>未验证</small><span class="led" style="--c:var(--yellow)"></span></button>
    <button class="cat"><span class="ci">${r.ic("Library", 16)}</span><b>学习书架</b><small>1 个文件夹</small><span class="led"></span></button>
  </nav>
  <section>
    <div class="sec-h"><h2>授权能力</h2><span class="sub">默认全部关闭；开启前先预览影响范围，随时可撤回</span></div>
    <div class="cap-panel m-screen">
      <div class="cap-sum"><span class="m-lcd">${lcd(0, 4)}<span>已开启</span></span><span class="m-lcd">${lcd(4, 4)}<span>可开启</span></span><span class="m-lcd">${lcd(1, 4)}<span>暂缓</span></span></div>
      ${cap("Skill", "mark_agent", "写真实 Agent 配置", "开关 Skill / 插件、发布挂载、跨 Agent 迁移；逐文件备份、回读、可回滚", B2("预览开启", "Eye", "sm"))}
      ${cap("Rule", "mark_book", "写入 Obsidian Vault", "随手记归位、个人说明采纳写回；只写你指定的子目录，不覆盖", B2("预览开启", "Eye", "sm"))}
      ${cap("Prompt", "mark_scan", "模型 / API 连接", "Key 只存钥匙串；每次调用先预览发送内容与费用上限", B2("预览开启", "Eye", "sm"))}
      ${cap("Workflow", "mark_gear", "常驻服务", "以 LaunchAgent 常驻并可重载到最新版本；环境变量逐项勾选", B2("预览开启", "Eye", "sm"))}
      ${cap("Scroll", "mark_moon", "夜巡真实执行", "等夜巡方案讨论后开放", `<span class="st off">暂缓</span>`, true)}
    </div>
  </section>
</div>`);

// ---------- 14 版本归档 ----------
const history = page("history", "版本归档", `
${heading("history", "每次修改都是一个新版本；恢复旧版同样是追加，历史不会被改写。")}
<div class="histx">
  <nav class="alist m-panel" aria-label="资产">
    <div class="search">${r.ic("Search", 16)}搜索资产</div>
    <button class="aitem on">${mini("Prompt")}<span><b>设计的最后一公里</b><small>Prompt · 3 个版本</small></span><span class="v">v3</span></button>
    <button class="aitem">${mini("Skill")}<span><b>把模糊想法变清晰</b><small>Skill · 2 个版本</small></span><span class="v">v2</span></button>
    <button class="aitem">${mini("Workflow")}<span><b>从灵感到上线</b><small>工作流 · 4 个版本</small></span><span class="v">v4</span></button>
    <button class="aitem archived">${mini("Prompt")}<span><b>旧版周报模板</b><small>Prompt · 已归档</small></span><span class="v">v1</span></button>
  </nav>
  <section>
    <div class="ahead">${r.cover({ type: "Prompt", serial: 2, version: 3, large: true, stage: 2 })}<div><span class="card-type">${r.icon("Prompt")} Prompt · PRM.02</span><h2>设计的最后一公里</h2><p class="muted" style="margin:0 0 12px">逐项核对设计稿，并在 390 与 320 检查溢出。</p>${GH("打开资产详情", "ArrowUpRight")}</div></div>
    <div class="timeline">
      <article class="ver cur m-panel"><span class="node">3</span><div class="ver-h"><b>v3</b><span class="maturity ready"><i></i>当前</span><span class="chg">名称</span><span class="chg">正文 <span class="p">+2</span> <span class="m">−1</span></span><time>2026/10/3 18:00</time></div><p class="muted" style="margin:0;font-size:13px">当前版本，无需与自身对比。</p></article>
      <article class="ver m-panel"><span class="node">2</span><div class="ver-h"><b>v2</b><span class="chg">描述</span><span class="chg">标签</span><span class="chg">正文 <span class="p">+2</span> <span class="m">−1</span></span><time>2026/10/2 18:00</time></div>
        <div class="diff"><div class="h">V2 → V3 · 正文</div><div>## 验收</div><div>逐项核对设计稿，并在 390 与 320 检查溢出</div><div class="m">− 保留来源</div><div class="p">+ 保留来源与版本</div><div class="p">+ 检查减少动态效果</div></div>
        <div class="acts">${B2("收起对比", "ChevronUp", "sm")}${B2("恢复为 v4", "RotateCcw", "sm")}</div></article>
      <article class="ver m-panel"><span class="node">1</span><div class="ver-h"><b>v1 · 首次收录</b><span class="chg">来源：合成资料</span><time>2026/10/1 18:00</time></div><div class="acts">${GH("与当前对比", "GitCompare")}${GH("恢复为 v4", "RotateCcw")}</div></article>
    </div>
  </section>
</div>`);

const PAGES = { home, inbox, assets, references, agents, projects, collab, knowledge, calendar, notes, aihot, settings, history };
for (const [id, html] of Object.entries(PAGES)) await writeFile(join(dir, "pages", `${id}.html`), html);
console.log("pages", Object.keys(PAGES).length, Object.fromEntries(Object.entries(PAGES).map(([k, v]) => [k, Math.round(v.length / 1024) + "KB"])));
