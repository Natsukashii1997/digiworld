// 夜巡 v2 · 芯片插槽 + 翻面（用户 2026-10-06 选定）。四个状态：睡前 / 编辑芯片 / 早上翻面 / 学习报告。数据全部合成。用法：node night2.mjs
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

const dir = "/Users/nat/Documents/ChatGPT/个人/work/personal-ai-workbench/docs/design/ui-v16";
const SPR = JSON.parse(await readFile(join(dir, "sprites/sprites.json"), "utf8"));
const css = await readFile(join(dir, "build/night2.css"), "utf8");
const shell = await readFile(join(dir, "pages/calendar.html"), "utf8");
const head = shell.slice(0, shell.indexOf("<main"))
  .replace(/<title>[^<]*<\/title>/, "<title>v16 · 夜巡</title>")
  .replace(/class="nav-item\s+active" aria-current="page"/, 'class="nav-item "')
  .replace(/<button class="nav-item ">((?:(?!<\/button>).)*?<span>夜巡<\/span>)/s, '<button class="nav-item active" aria-current="page">$1')
  .replace(/<span class="crumb-code">[^<]*<\/span><strong>[^<]*<\/strong>/, '<span class="crumb-code">06</span><strong>夜巡</strong>')
  .replace("</head>", `<style>${css}</style></head>`);
const tail = shell.slice(shell.indexOf("</main>"));
const page = (body, cls, extra = "") => `${head}<main id="main-content" class="main-content page-night v14 v16 ${cls}">${body}</main>${extra}${tail.slice(7)}`;

// ---------- 小件 ----------
function sprite(key, h) {
  const s = SPR[key], w = s.size[0], hh = s.size[1];
  let r = "";
  s.rows.forEach((row, y) => { let x = 0; while (x < row.length) { const ch = row[x]; let n = 1; while (x + n < row.length && row[x + n] === ch) n++; if (ch !== ".") r += `<rect x="${x}" y="${y}" width="${n + 0.02}" height="1.02" fill="${s.palette[ch]}"/>`; x += n; } });
  return `<svg class="sprite" viewBox="0 0 ${w} ${hh}" style="height:${h}px;width:${Math.round((h * w) / hh)}px" shape-rendering="crispEdges" role="img" aria-label="${s.name}">${r}</svg>`;
}
const P = {
  check: '<path d="M20 6 9 17l-5-5"/>', x: '<path d="M18 6 6 18M6 6l12 12"/>', plus: '<path d="M12 5v14M5 12h14"/>', edit: '<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"/>',
  merge: '<circle cx="18" cy="18" r="3"/><circle cx="6" cy="6" r="3"/><path d="M6 21V9a9 9 0 0 0 9 9"/>', send: '<path d="m22 2-7 20-4-9-9-4Z"/><path d="M22 2 11 13"/>',
  moon: '<path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"/>', sliders: '<path d="M4 21v-7M4 10V3M12 21v-9M12 8V3M20 21v-5M20 12V3M1 14h6M9 8h6M17 16h6"/>',
  history: '<path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5M12 7v5l3 2"/>', book: '<path d="M2 4h7a3 3 0 0 1 3 3v13a2 2 0 0 0-2-2H2Z"/><path d="M22 4h-7a3 3 0 0 0-3 3v13a2 2 0 0 1 2-2h8Z"/>',
  arrowL: '<path d="M19 12H5M11 6l-6 6 6 6"/>', arrow: '<path d="M5 12h14M13 6l6 6-6 6"/>', lock: '<rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>',
  globe: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18"/>', note: '<path d="M4 4h16v12l-4 4H4Z"/><path d="M16 20v-4h4"/>', inbox: '<path d="M22 12h-6l-2 3h-4l-2-3H2"/><path d="M5.5 5h13L22 12v6a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2v-6Z"/>',
  flip: '<path d="M17 2l4 4-4 4"/><path d="M3 11V9a3 3 0 0 1 3-3h15M7 22l-4-4 4-4"/><path d="M21 13v2a3 3 0 0 1-3 3H3"/>', link: '<path d="M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.7 1.7"/><path d="M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.7-1.7"/>',
  grip: '<circle cx="9" cy="6" r="1"/><circle cx="15" cy="6" r="1"/><circle cx="9" cy="12" r="1"/><circle cx="15" cy="12" r="1"/><circle cx="9" cy="18" r="1"/><circle cx="15" cy="18" r="1"/>', more: '<circle cx="5" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/>',
};
const ic = (k, s = 16) => `<svg width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${P[k]}</svg>`;
// 芯片图符（10 格像素）：每种任务一个有含义的形状
const G = {
  learn: [".##....##.", "#..#..#..#", "#.##..##.#", "#..#..#..#", "#.##..##.#", "#..#..#..#", "#..####..#", "##########"],
  push: ["#.........", "#######...", "#########.", "#######...", "#.........", "#.........", "#.........", "###......."],
  test: ["..######..", "....##....", "....##....", "...#..#...", "..#....#..", ".#.####.#.", "#.######.#", "##########"],
  review: ["..####....", ".#....#...", "#......#..", "#......#..", ".#....#...", "..#####...", "......##..", ".......##."],
  deps: ["##########", "#........#", "#..####..#", "#..#..#..#", "#..####..#", ".#......#.", "..#....#..", "...####..."],
  brief: ["....##....", ".#..##..#.", "...####...", "##.####.##", "...####...", ".#..##..#.", "....##....", ".........."],
  custom: ["....##....", "....##....", "....##....", "##########", "##########", "....##....", "....##....", "....##...."],
};
const glyph = (k, s) => `<svg class="glyph" viewBox="0 0 10 8" width="${s}" height="${(s * 0.8).toFixed(0)}" shape-rendering="crispEdges" aria-hidden="true">${G[k].map((row, y) => [...row].map((c, x) => (c === "#" ? `<rect x="${x}" y="${y}" width="1.02" height="1.02"/>` : "")).join("")).join("")}</svg>`;
const WHO = { codex: ["machinedramon", "Codex"], claude: ["metalgreymon", "Claude"] };

// ---------- 芯片库 ----------
const TY = {
  learn: { code: "C-01", en: "LEARN", name: "深度学习", out: "学习报告", est: "≤45m", hue: "168,145,255", net: true, exe: "claude" },
  push: { code: "C-02", en: "PUSH", name: "继续跑项目", out: "分支交付", est: "≤3h", hue: "255,138,36", exe: "codex", rev: "claude" },
  test: { code: "C-03", en: "TEST", name: "测试白天功能", out: "测试报告", est: "≤45m", hue: "77,227,255", exe: "codex" },
  review: { code: "C-04", en: "REVIEW", name: "代码审查", out: "风险清单", est: "≤45m", hue: "255,143,184", exe: "claude", rev: "codex" },
  deps: { code: "C-05", en: "DEPS", name: "依赖巡检", out: "通告清单", est: "≤20m", hue: "255,209,102", exe: "codex" },
  brief: { code: "C-06", en: "BRIEF", name: "明日简报", out: "一页简报", est: "≤10m", hue: "143,227,196", exe: "claude" },
  custom: { code: "C-07", en: "CUSTOM", name: "自定义芯片", out: "你来定", est: "—", hue: "139,152,184", custom: true },
};
const ORDER = ["learn", "push", "test", "review", "deps", "brief", "custom"];
const pins = `<span class="pins" aria-hidden="true">${"<i></i>".repeat(9)}</span>`;
function chip(k, { slot = 0, sub = "", inserted = 0, focus = false } = {}) {
  const t = TY[k];
  return `<button class="chip${t.custom ? " custom" : ""}${inserted ? " used" : ""}${focus ? " focus" : ""}${slot ? " in-slot" : ""}" style="--h:${t.hue}" aria-label="${t.name}芯片${inserted ? `，已插入第 ${inserted} 槽` : ""}">
  <span class="chip-top"><span class="mono">${t.code}</span><span class="mono en">${t.en}</span></span>
  <span class="chip-face">${glyph(k, slot ? 34 : 46)}</span>
  <span class="chip-name">${t.name}</span>
  ${sub ? `<span class="chip-sub">${sub}</span>` : `<span class="chip-out">产出 · ${t.out}</span>`}
  ${slot ? "" : `<span class="chip-meta mono">${t.est}${t.net ? ` · ${ic("globe", 11)}` : ""}</span>`}
  ${inserted ? `<span class="chip-used mono">#${inserted}</span>` : ""}${pins}</button>`;
}

// ---------- 主机（插槽） ----------
const SLOTS = [
  { k: "learn", sub: "Loop 工程的停止条件", extra: true },
  { k: "push", sub: "数码世界 · 首页 W3" },
  { k: "test", sub: "日历 · 拖拽与改期" },
  null,
];
const crew = (t, small = false) => `<span class="crew">${sprite(WHO[t.exe][0], small ? 18 : 22)}<span>${WHO[t.exe][1]}</span>${t.rev ? `<i>${ic("arrow", 11)}</i>${sprite(WHO[t.rev][0], small ? 18 : 22)}<span>复核</span>` : ""}</span>`;
function slotEve(s, i) {
  if (!s) return `<div class="slot vacant"><div class="slot-well"><span class="slot-hint">${ic("plus", 18)}<b>拖入芯片</b><small>还能放 1 枚</small></span></div><div class="slot-mouth"><span class="led off"></span><span class="mono">SLOT ${i + 1}</span></div><div class="slot-foot dim">空</div></div>`;
  const t = TY[s.k];
  return `<div class="slot" style="--h:${t.hue}"><span class="slot-grip" aria-label="拖动换序">${ic("grip", 14)}</span><div class="slot-well">${chip(s.k, { slot: 1, sub: s.sub })}</div><div class="slot-mouth"><span class="led ok"></span><span class="mono">SLOT ${i + 1}</span><span class="mono est">${t.est}</span></div>
  <div class="slot-foot">${crew(t, true)}${s.extra ? `<span class="supp">${ic("edit", 12)}今晚补充</span>` : ""}</div></div>`;
}
const BACK = {
  learn: { title: "Loop 工程的停止条件", kind: "学习报告", stats: [["过程", "6 步"], ["洞见", "4"], ["建议", "5"], ["来源", "7"]], quote: "“轮次上限只是兜底；真正早发现跑偏的，是‘验收条目数连续不变’。”", acts: [["book", "阅读报告", "pri"]] },
  push: { title: "数码世界 · 首页 W3", kind: "分支交付", stats: [["验收", "6/6"], ["改动", "+214 −38"], ["测试", "951/951"]], line: "night/1007-home-w3 · 7 轮 · 2h14m", acts: [["merge", "合并", "pri"], ["send", "派白天"]] },
  test: { title: "日历 · 拖拽与改期", kind: "测试报告", stats: [["用例", "12"], ["通过", "10"], ["缺陷", "2", "warn"]], line: "拖到 23:30 后结束时间越过午夜", acts: [["send", "派白天"], ["arrow", "查看报告"]], warn: true },
};
function slotMorning(s, i) {
  if (!s) return `<div class="slot vacant"><div class="slot-well"><span class="slot-hint"><small>昨夜未使用</small></span></div><div class="slot-mouth"><span class="led off"></span><span class="mono">SLOT ${i + 1}</span></div><div class="slot-foot dim">—</div></div>`;
  const t = TY[s.k], b = BACK[s.k];
  return `<div class="slot back" style="--h:${t.hue}"><div class="slot-well"><article class="card-back${b.warn ? " warn" : ""}">
    <header><span class="cb-glyph">${glyph(s.k, 18)}</span><span class="mono">${t.code} · ${b.kind}</span><span class="cb-flip" title="已翻面">${ic("flip", 12)}</span></header>
    <h3>${b.title}</h3>
    <dl>${b.stats.map(([k, v, w]) => `<div><dt>${k}</dt><dd class="mono${w ? " " + w : ""}">${v}</dd></div>`).join("")}</dl>
    ${b.quote ? `<p class="cb-quote">${b.quote}</p>` : `<p class="cb-line${b.warn ? " warn" : ""}">${b.warn ? "缺陷 · " : ""}${b.line}</p>`}
    <footer>${b.acts.map(([i2, l, k]) => `<button class="nbtn ${k || ""}">${ic(i2, 14)}${l}</button>`).join("")}<button class="nbtn icon" aria-label="更多：今晚续跑 / 丢弃">${ic("more", 15)}</button></footer>
  </article></div><div class="slot-mouth"><span class="led ${b.warn ? "warn" : "done"}"></span><span class="mono">SLOT ${i + 1}</span><span class="mono est">${s.k === "learn" ? "03:42–04:27" : s.k === "push" ? "23:00–01:14" : "02:33–03:14"}</span></div>
  <div class="slot-foot">${crew(t, true)}</div></div>`;
}
const stars = `<div class="stars" aria-hidden="true">${Array.from({ length: 30 }, (_, i) => `<i style="left:${((i * 37.3) % 100).toFixed(1)}%;top:${((i * 23.7) % 70).toFixed(1)}%;--d:${(i % 5) * 0.8}s"></i>`).join("")}</div>`;
const meters = (used, time, quota) => `<div class="meters"><div><span>插槽</span><b class="mono">${used}<small>/4</small></b></div><div><span>时长</span><span class="bar"><i style="width:${time[0]}%"></i></span><b class="mono">${time[1]}</b></div><div><span>本周额度</span><span class="bar q"><i style="width:${quota[0]}%"></i></span><b class="mono">${quota[1]}</b></div></div>`;
function bayEvening(slots = SLOTS) {
  return `<section class="bay" aria-label="今晚插槽">${stars}
  <header class="bay-top"><div><span class="mono dim">TONIGHT · 23:00 → 07:00</span><h2>今晚插了 <b class="mono">3</b> 枚芯片</h2></div>${meters(3, [60, "≈4h30 / 7h30"], [45, "≈9% / 20%"])}</header>
  <div class="slots">${slots.map(slotEve).join("")}</div>
  <footer class="bay-foot"><span>${ic("moon", 14)}按槽位顺序执行，拖动可换序</span><span class="mono">22:00 预告 · 22:55 开工检查 · 07:05 翻面</span></footer></section>`;
}
function bayMorning() {
  return `<section class="bay morning" aria-label="昨夜芯片">${stars}
  <header class="bay-top"><div><span class="mono dim">LAST NIGHT · 10/06 → 10/07 · 04:36 收工</span><h2>3 枚芯片都翻面了</h2></div>
  <div class="tally"><span class="t-done"><b class="mono">2</b>交付</span><span class="t-warn"><b class="mono">1</b>有发现</span><span class="t-q mono">额度 ≈13%</span></div></header>
  <div class="slots">${SLOTS.map(slotMorning).join("")}</div>
  <footer class="bay-foot"><span>${ic("check", 14)}开工检查 6/6 · 无中断 · 无红线触碰</span><button class="nbtn ghost">${ic("history", 14)}昨夜运行记录</button></footer></section>`;
}
const library = (focusK = "", fresh = false) => `<section class="lib" aria-label="芯片库"><header class="sec"><h2>芯片库</h2><span class="mono dim">7 种 · 点开看 prompt 与产出</span></header>
  <div class="lib-row">${ORDER.map((k) => chip(k, { inserted: fresh ? 0 : SLOTS.findIndex((s) => s && s.k === k) + 1, focus: k === focusK })).join("")}</div></section>`;
const heading = (lead, morning = false) => `<header class="page-heading"><div class="page-heading-main"><div class="page-eyebrow"><span class="page-code">06</span><span class="en-eb">NIGHT SHIFT</span><span class="maturity planned"><i aria-hidden="true"></i>规划</span></div><div class="title-row"><h1>夜巡</h1><button class="page-help" aria-label="这页怎么用">?</button></div><p class="page-lead">${lead}</p></div>
  <div class="page-heading-action"><button class="icon-btn" aria-label="历史晨报">${ic("history", 18)}</button><button class="icon-btn" aria-label="刹车与额度">${ic("sliders", 18)}</button>${morning ? `<button class="nbtn pri lg">${ic("moon", 16)}排今晚</button>` : ""}</div></header>
  <ul class="page-bounds" aria-label="边界"><li>只在本机跑</li><li>不合并、不推送</li><li>每周额度 ≤ 20%</li></ul>`;

// ---------- 编辑抽屉（深度学习芯片） ----------
const tok = (t) => `<span class="var">${t}</span>`;
const drawer = `<div class="nt-scrim" aria-hidden="true"></div><aside class="nt-drawer page-night" role="dialog" aria-label="编辑芯片：深度学习" style="--h:${TY.learn.hue}">
  <header class="dw-head"><span class="dw-chip">${glyph("learn", 26)}</span><div><span class="mono dim">C-01 · LEARN · 插在 SLOT 1</span><h2>深度学习</h2></div><button class="icon-btn" aria-label="关闭">${ic("x", 18)}</button></header>
  <div class="dw-body"><div class="dw-main">
    <section class="fld"><h3>今晚的主题</h3><div class="topics" role="radiogroup">
      <button class="topic on" role="radio" aria-checked="true"><b>Loop 工程的停止条件</b><small>来自 · 夜巡设计</small></button>
      <button class="topic" role="radio" aria-checked="false"><b>worktree 并行开发的坑</b><small>来自 · 项目空间</small></button>
      <button class="topic" role="radio" aria-checked="false"><b>Agent 记忆的分层</b><small>来自 · AI HOT</small></button>
      <button class="topic own" role="radio" aria-checked="false">${ic("edit", 14)}<b>自己写</b></button></div></section>
    <section class="fld"><div class="fld-h"><h3>Prompt</h3><span class="mono dim">变量 ${tok("{主题}")} ${tok("{项目}")} 运行时填入</span></div>
      <div class="prompt">
        <div class="seg tpl"><div class="seg-h"><span>${ic("lock", 12)}模板 · 长期生效</span><button class="nbtn ghost sm">${ic("edit", 12)}改模板</button></div>
          <p>你是我的夜间研究伙伴。围绕 ${tok("{主题}")} 做一次深度学习：</p>
          <ol><li>先写下你对它的现有理解，和 3 个待验证的问题。</li><li>至少读 5 个高质量来源（官方文档、论文、一线工程博客优先），按阅读顺序记录：读了什么、得到了什么、修正了哪条先前的理解。</li><li>提炼 3–5 条关键洞见；每条至少 2 个来源交叉印证，否则标为“待证”。</li><li>结合 ${tok("{项目}")} 与我近期的随手记，分别给出对学习、对项目、对认知的建议。</li></ol>
          <p class="red">红线：只读网页，不登录、不提交表单；不读 Vault。</p></div>
        <div class="seg tonight"><div class="seg-h"><span>${ic("moon", 12)}今晚补充 · 只用这一次</span><span class="mono dim">86 / 600</span></div>
          <p class="ed" contenteditable="true">重点看 Anthropic 与 OpenAI 关于 agent loop 的一手资料；对比“轮次上限”和“进展判定”两类停止条件，给夜巡的卡死判定提一条改进。<span class="caret"></span></p></div>
      </div></section>
    <section class="fld two"><div><h3>谁来做</h3><div class="pick">${sprite("metalgreymon", 26)}<b>Claude</b><small>执行</small><span class="chev">▾</span></div><div class="pick dim">${ic("x", 14)}<b>不复核</b><small>复核</small><span class="chev">▾</span></div></div>
      <div><h3>刹车</h3><ul class="brakes"><li><span>时长</span><b class="mono">≤ 45m</b></li><li><span>轮次</span><b class="mono">≤ 4</b></li><li><span>联网</span><b>只读 ${ic("globe", 12)}</b></li></ul></div></section>
    <section class="fld"><h3>验收标准 <small class="dim">（明早按这几条判定完成）</small></h3><ul class="accept"><li>${ic("check", 13)}来源 ≥ 5，且每条都有链接</li><li>${ic("check", 13)}每条洞见 ≥ 2 个来源印证，否则标“待证”</li><li>${ic("check", 13)}三栏建议各至少 1 条</li><li class="add">${ic("plus", 13)}加一条</li></ul></section>
  </div>
  <aside class="dw-side" aria-label="明早你会拿到"><h3>明早你会拿到</h3>
    <div class="paper"><span class="mono dim">学习报告 · 样张</span><b class="p-title">Loop 工程的停止条件</b>
      <div class="p-sec"><i>1</i>主题与为什么学<span class="ln w80"></span></div>
      <div class="p-sec"><i>2</i>学习过程<span class="steps"><s></s><s></s><s></s><s></s><s></s></span></div>
      <div class="p-sec"><i>3</i>关键洞见 3–5<span class="ln w90"></span><span class="ln w70"></span></div>
      <div class="p-sec"><i>4</i>对你的建议<span class="cols"><s>学习</s><s>项目</s><s>认知</s></span></div>
      <div class="p-sec"><i>5</i>来源<span class="ln w60"></span></div></div>
    <p class="dim small">翻面后在“阅读报告”里全屏看；建议可一键转随手记或待处理。</p></aside></div>
  <footer class="dw-foot"><span class="dim small">${ic("check", 13)}已保存草稿 22:14</span><button class="nbtn">取消</button><button class="nbtn pri">${ic("check", 15)}保存到 SLOT 1</button></footer></aside>`;

// ---------- 学习报告阅读视图 ----------
const STEPS = [
  ["先写下的理解", "停止条件 = 轮次上限 + 超时。", "—", "起点"],
  ["Anthropic · Building effective agents", "强调“环境反馈”是 loop 的地面真值，停止应看反馈是否在改善。", "轮次只是兜底，不是主刹车", "修正"],
  ["OpenAI · Agents SDK 文档", "max_turns 用于防失控；业务完成判定由 guardrail / 输出校验负责。", "两类刹车应分开：失控 vs 完成", "印证"],
  ["一线工程博客 · 长任务 agent 复盘", "多数“白跑”发生在第 3–5 轮之后，diff 在变但验收条目不变。", "“diff 变化”不等于进展", "修正"],
  ["SWE-bench 相关论文", "带测试反馈的 agent 成功率显著更高；无测试任务更易漂移。", "无可靠反馈的任务应缩短刹车", "新增"],
  ["回到夜巡设计", "把卡死判定从“2 轮 diff 不变”扩为“验收条目数 2 轮不变”。", "形成建议", "结论"],
];
const INS = [
  ["进展要按“验收条目”计，而不是按 diff", "diff 在变不代表离目标更近；连续 2 轮验收条目数不变就该停。", 3],
  ["刹车分两类：防失控与判完成", "轮次 / 时长防失控；验收与测试判完成。混在一起会两头不准。", 2],
  ["反馈越弱，刹车越短", "学习、审查类没有测试兜底，单任务轮次应比推进项目更低。", 2],
  ["先写“现有理解”再去读，收获可被看见", "报告里“修正了哪条理解”是最有价值的一栏。", 2],
];
const SUG = {
  学习: ["读 SWE-bench 原论文第 4 节，补上“测试反馈”这块认知"],
  项目: ["夜巡卡死判定改为“验收条目数 2 轮不变”", "学习类芯片轮次上限从 4 降到 3"],
  认知: ["“动了”和“近了”是两回事：看结果指标，不看活动量", "先写下预期，再看证据"],
};
const report = page(`<div class="rd">
  <nav class="rd-toc" aria-label="目录"><a class="back" href="#">${ic("arrowL", 14)}夜巡 · 10/07 晨报</a>
    <ol><li class="on"><a href="#">主题与为什么学</a></li><li><a href="#">学习过程 <span class="mono">6</span></a></li><li><a href="#">关键洞见 <span class="mono">4</span></a></li><li><a href="#">对你的建议 <span class="mono">5</span></a></li><li><a href="#">来源 <span class="mono">7</span></a></li></ol>
    <div class="rd-who">${sprite("metalgreymon", 30)}<div><b>Claude</b><small class="mono">03:42–04:27 · 4 轮</small></div></div>
    <div class="rd-acc"><span class="dim small">验收</span><span class="cells"><i class="on"></i><i class="on"></i><i class="on"></i></span><b class="mono">3/3</b></div></nav>
  <article class="rd-main" style="--h:${TY.learn.hue}">
    <header class="rd-head"><span class="mono dim">C-01 · LEARN · 学习报告</span><h1>Loop 工程的停止条件</h1>
      <p class="rd-why"><b>为什么学</b>今天刚定下夜巡的刹车规则，其中“卡死判定”是凭经验定的；想知道一手资料怎么说，有没有更早发现跑偏的办法。</p></header>
    <section><h2><span class="mono">01</span>学习过程</h2><ol class="path">${STEPS.map(([src, got, fix, tag], i) => `<li class="st-${tag}"><span class="node mono">${i + 1}</span><div><b class="src">${src}</b><p>${got}</p>${fix !== "—" ? `<p class="fix"><span class="tag">${tag}</span>${fix}</p>` : `<p class="fix"><span class="tag">${tag}</span></p>`}</div></li>`).join("")}</ol></section>
    <section><h2><span class="mono">02</span>关键洞见</h2><div class="ins">${INS.map(([t, b, n], i) => `<article><span class="mono n">${String(i + 1).padStart(2, "0")}</span><h3>${t}</h3><p>${b}</p><span class="mono src">${ic("link", 11)}${n} 个来源</span></article>`).join("")}</div></section>
    <section><h2><span class="mono">03</span>对你的建议</h2><div class="sug">${Object.entries(SUG).map(([k, v]) => `<div><h3>对${k}</h3><ul>${v.map((s) => `<li><p>${s}</p><span class="sug-acts"><button class="nbtn sm">${ic("note", 12)}转随手记</button><button class="nbtn sm">${ic("inbox", 12)}转待处理</button></span></li>`).join("")}</ul></div>`).join("")}</div></section>
    <section><h2><span class="mono">04</span>来源</h2><ol class="srcs"><li>Anthropic · Building effective agents</li><li>OpenAI · Agents SDK · Running agents</li><li>长任务 agent 实战复盘（工程博客）</li><li>SWE-bench: Can Language Models Resolve Real-World GitHub Issues?</li><li>… 另 3 条</li></ol></section>
    <footer class="rd-foot"><span class="dim small">均为建议，不会自动改任何东西</span><button class="nbtn">${ic("moon", 14)}今晚接着学</button><button class="nbtn pri">${ic("book", 14)}存进知识仓库</button></footer>
  </article></div>`, "rd-page");

// ---------- 输出 ----------
await writeFile(join(dir, "pages/night-evening.html"), page(`${heading("挑几枚芯片插进今晚，明早翻面看结果。")}${bayEvening()}${library()}`, "eve"));
await writeFile(join(dir, "pages/night-edit.html"), page(`${heading("挑几枚芯片插进今晚，明早翻面看结果。")}${bayEvening()}${library("learn")}`, "eve", drawer));
await writeFile(join(dir, "pages/night-morning.html"), page(`${heading("昨夜的芯片都翻面了，逐个看看交回了什么。", true)}${bayMorning()}${library("", true)}`, "mor"));
await writeFile(join(dir, "pages/night-report.html"), report);
console.log("ok");

// ================= 补充状态（用户 2026-10-06 认可方向后补齐） =================
// 夜里运行中：槽 1 已交回、槽 2 正在跑、槽 3 排队
function slotRun(s, i, st) {
  if (!s) return slotEve(s, i).replace("拖入芯片", "夜里不能换芯片").replace("还能放 1 枚", "07:05 之后再排").replace(ic("plus", 18), ic("lock", 16));
  const t = TY[s.k];
  const over = st === "run" ? `<span class="run-over"><span class="run-acc"><span class="mono">R4/12</span>${"<i class=on></i>".repeat(3)}${"<i></i>".repeat(3)}<em class="mono">验收 3/6</em></span><span class="run-bar"><i style="width:50%"></i></span></span>` : st === "done" ? `<span class="run-over done"><span class="mono">已交回 · 07:05 翻面</span></span>` : `<span class="run-over wait"><span class="mono">排队 · 预计 01:20 开始</span></span>`;
  return `<div class="slot st-${st}" style="--h:${t.hue}"><div class="slot-well">${chip(s.k, { slot: 1, sub: s.sub })}${over}</div><div class="slot-mouth"><span class="led ${st === "run" ? "run" : st === "done" ? "done" : "off"}"></span><span class="mono">SLOT ${i + 1}</span><span class="mono est">${st === "done" ? "23:00–23:44" : st === "run" ? "23:46 起 · 1h16m" : t.est}</span></div><div class="slot-foot">${crew(t, true)}${st === "run" ? `<span class="live mono">${ic("moon", 11)}跑测试 948/951</span>` : ""}</div></div>`;
}
const RUNSLOTS = [{ k: "learn", sub: "Loop 工程的停止条件" }, { k: "push", sub: "数码世界 · 首页 W3" }, { k: "test", sub: "日历 · 拖拽与改期" }, null];
const bayRun = `<section class="bay running" aria-label="正在巡逻">${stars}<span class="moon-big" aria-hidden="true">${ic("moon", 28)}</span>
  <header class="bay-top"><div><span class="mono dim">PATROLLING · 01:02 · 窗口剩 5h58m</span><h2>正在巡逻 · 第 <b class="mono">2</b> 枚芯片</h2></div>${meters(3, [28, "已用 2h02m"], [30, "≈6% / 20%"])}</header>
  <div class="slots">${RUNSLOTS.map((s, i) => slotRun(s, i, ["done", "run", "wait", ""][i])).join("")}</div>
  <footer class="bay-foot"><span>${ic("check", 14)}开工检查 6/6 · 无红线触碰 · 限流暂停 0 次</span><button class="nbtn ghost danger">${ic("x", 14)}停止今晚</button></footer></section>`;
const libLocked = library().replace('<section class="lib"', '<section class="lib locked"').replace("7 种 · 点开看 prompt 与产出", "夜里只能看，不能换");
await writeFile(join(dir, "pages/night-running.html"), page(`${heading("夜里自己跑，你去睡。这里只看进度，不用操作。")}${bayRun}${libLocked}`, "run"));

// 空状态：第一次来 / 今晚还没插
const bayEmpty = bayEvening([null, null, null, null]).replace("还能放 1 枚", "从下面拖一枚进来").replaceAll("还能放 1 枚", "")
  .replace(/今晚插了 <b class="mono">3<\/b> 枚芯片/, "今晚还没插芯片").replace(meters(3, [60, "≈4h30 / 7h30"], [45, "≈9% / 20%"]), meters(0, [0, "0 / 7h30"], [0, "0 / 20%"]))
  .replace("按槽位顺序执行，拖动可换序", "不插芯片，今晚就不跑；22:00 也不会提醒");
await writeFile(join(dir, "pages/night-empty.html"), page(`${heading("挑几枚芯片插进今晚，明早翻面看结果。")}${bayEmpty}${library("", true).replace("点开看 prompt 与产出", "先点开一枚，看看它会做什么、明早交回什么")}`, "eve"));

// 加载：骨架
const skel = `<section class="bay loading" aria-label="读取中" aria-busy="true">${stars}<header class="bay-top"><div><span class="sk w30"></span><span class="sk h28 w50"></span></div><span class="sk w40"></span></header><div class="slots">${[0, 1, 2, 3].map(() => `<div class="slot"><div class="slot-well"><span class="sk chipsk"></span></div><div class="slot-mouth"><span class="led off"></span><span class="sk w40"></span></div></div>`).join("")}</div></section><section class="lib"><header class="sec"><h2>芯片库</h2></header><div class="lib-row">${ORDER.map(() => `<span class="sk chipsk lib"></span>`).join("")}</div></section>`;
await writeFile(join(dir, "pages/night-loading.html"), page(`${heading("挑几枚芯片插进今晚，明早翻面看结果。")}${skel}`, "eve"));

// 错误：22:55 开工检查未通过（全局项）
const blocked = bayEvening().replace('<section class="bay"', '<section class="bay blocked"').replace(/<div class="slots">/, `<div class="blk-banner" role="alert">${ic("x", 18)}<div><b>开工检查未通过，今晚不开跑</b><p>电源未接通（电池 38%）· 其余 5 项通过。接上电源后，23:30 前点“重新检查”仍可开跑。</p></div><button class="nbtn pri">${ic("check", 14)}重新检查</button></div><div class="slots">`).replaceAll('class="led ok"', 'class="led err"').replace("今晚插了", "今晚插了").replace("22:00 预告 · 22:55 开工检查 · 07:05 翻面", "22:55 检查 ✕ · 已写入明早晨报");
await writeFile(join(dir, "pages/night-blocked.html"), page(`${heading("挑几枚芯片插进今晚，明早翻面看结果。")}${blocked}${library()}`, "eve"));

// 测试报告详情
const DEF = [
  ["拖到 23:30 后，结束时间越过午夜", "在周视图把“写周报”块从 22:30 拖到 23:30（时长 1h）", "结束 00:30 落到次日，或被夹紧到 23:59", "结束时间显示 24:30，保存后回读为 00:30 同日", "calendar-drag.spec.mjs › 跨午夜拖拽", "src/calendar.js 的 clampEnd 未处理跨日"],
  ["改期后旧提醒未撤销", "给 15:00 会议设 10 分钟提醒，拖到 16:00", "只在 15:50 提醒一次", "14:50 与 15:50 各提醒一次", "calendar-alarm.spec.mjs › 改期撤销", "改期写入新提醒，但旧提醒 ID 未清除"],
];
const CASES = [["新建块并回读", 1], ["拖拽改期（同日）", 1], ["拖拽改期（跨午夜）", 0], ["改期撤销旧提醒", 0], ["全天事件不可拖", 1], ["冲突提示", 1], ["键盘改期", 1], ["撤销 ⌘Z", 1], ["390 拖拽", 1], ["减少动态", 1], ["权限撤销后只读", 1], ["未知结果先查询", 1]];
const testReport = page(`<div class="rd">
  <nav class="rd-toc" aria-label="目录"><a class="back" href="#">${ic("arrowL", 14)}夜巡 · 10/07 晨报</a><ol><li class="on"><a href="#">缺陷 <span class="mono">2</span></a></li><li><a href="#">用例 <span class="mono">12</span></a></li><li><a href="#">新增测试 <span class="mono">6</span></a></li></ol>
    <div class="rd-who">${sprite("machinedramon", 30)}<div><b>Codex</b><small class="mono">02:33–03:14 · 3 轮</small></div></div></nav>
  <article class="rd-main" style="--h:${TY.test.hue}">
    <header class="rd-head"><span class="mono dim">C-03 · TEST · 测试报告</span><h1>日历 · 拖拽与改期</h1>
      <div class="kpis"><div><b class="mono">12</b><span>用例</span></div><div class="ok"><b class="mono">10</b><span>通过</span></div><div class="bad"><b class="mono">2</b><span>缺陷</span></div><div><b class="mono">6</b><span>新增测试</span></div></div></header>
    <section><h2><span class="mono">01</span>缺陷</h2>${DEF.map(([t, step, exp, act, spec, cause], i) => `<article class="defect"><header><span class="mono sev">D-${i + 1}</span><h3>${t}</h3></header><dl><div><dt>复现</dt><dd>${step}</dd></div><div><dt>期望</dt><dd>${exp}</dd></div><div><dt>实际</dt><dd class="bad">${act}</dd></div><div><dt>证据</dt><dd class="mono">${spec}</dd></div><div><dt>可能原因</dt><dd>${cause}</dd></div></dl><footer><button class="nbtn sm pri">${ic("send", 12)}派给 Codex 白天修</button><button class="nbtn sm">${ic("inbox", 12)}转待处理</button></footer></article>`).join("")}</section>
    <section><h2><span class="mono">02</span>用例</h2><ul class="cases">${CASES.map(([n, ok]) => `<li class="${ok ? "ok" : "bad"}">${ic(ok ? "check" : "x", 13)}${n}</li>`).join("")}</ul></section>
    <section><h2><span class="mono">03</span>新增测试</h2><p class="mono files">tests/calendar-drag.spec.mjs <i>+4</i><br>tests/calendar-alarm.spec.mjs <i>+2</i></p><p class="dim small">在分支 night/1007-cal-test，未合入；派白天时一起带过去。</p></section>
    <footer class="rd-foot"><span class="dim small">只加测试、未改业务代码</span><button class="nbtn">${ic("moon", 14)}今晚续测</button><button class="nbtn ghost">丢弃</button></footer>
  </article></div>`, "rd-page");
await writeFile(join(dir, "pages/night-test-report.html"), testReport);

// 分支交付详情
const ROUNDS = [["codex", "实现四屏数据同源", "测试 940/951"], ["codex", "补走线脉冲着色", "测试 945/951"], ["claude", "复核：390 单列溢出 1 处", "退回"], ["codex", "修溢出 + 减少动态", "测试 951/951"], ["claude", "复核：验收 6/6", "通过"]];
const FILES = [["src/Home.jsx", 96, 21], ["src/home.css", 74, 12], ["src/InboxDrawer.jsx", 8, 2], ["tests/home.spec.mjs", 36, 3]];
const delivery = page(`<div class="rd">
  <nav class="rd-toc" aria-label="目录"><a class="back" href="#">${ic("arrowL", 14)}夜巡 · 10/07 晨报</a><ol><li class="on"><a href="#">验收 <span class="mono">6/6</span></a></li><li><a href="#">改动 <span class="mono">4</span></a></li><li><a href="#">轮次 <span class="mono">7</span></a></li></ol>
    <div class="rd-who">${sprite("machinedramon", 30)}<div><b>Codex → Claude</b><small class="mono">23:00–01:14 · 7 轮</small></div></div></nav>
  <article class="rd-main" style="--h:${TY.push.hue}">
    <header class="rd-head"><span class="mono dim">C-02 · PUSH · 分支交付</span><h1>数码世界 · 首页 W3</h1>
      <div class="merge-box"><div><span class="mono br">night/1007-home-w3</span><span class="ok-line">${ic("check", 13)}与 main 无冲突 · 测试 951/951 · 构建通过</span></div><button class="nbtn pri lg">${ic("merge", 16)}合并到 main</button></div>
      <p class="dim small">合并前会再弹一次确认，列出将合入的 4 个文件；不推送。</p></header>
    <section><h2><span class="mono">01</span>验收</h2><ul class="cases two">${["四屏数据同源", "走线脉冲按优先级着色", "记一笔回读", "1180 两列", "390 单列", "减少动态静止"].map((n) => `<li class="ok">${ic("check", 13)}${n}<em class="mono">home.spec › ${n.slice(0, 4)}</em></li>`).join("")}</ul></section>
    <section><h2><span class="mono">02</span>改动 <small class="mono dim">+214 −38</small></h2><ul class="files-diff">${FILES.map(([f, a, d]) => `<li><span class="mono">${f}</span><span class="diffbar"><i class="a" style="width:${a}px"></i><i class="d" style="width:${d}px"></i></span><span class="mono add">+${a}</span><span class="mono del">−${d}</span></li>`).join("")}</ul></section>
    <section><h2><span class="mono">03</span>轮次</h2><ol class="rounds">${ROUNDS.map(([w, what, res], i) => `<li class="${res === "退回" ? "back" : ""}">${sprite(WHO[w][0], 20)}<span class="mono">R${i + 3}</span><b>${what}</b><em>${res}</em></li>`).join("")}</ol><p class="dim small">R1–R2：读取首页契约与冻结输入（无改动）</p></section>
    <footer class="rd-foot"><span class="dim small">未合并前，分支会一直保留在晨报里</span><button class="nbtn">${ic("send", 14)}派白天</button><button class="nbtn">${ic("moon", 14)}今晚续跑</button><button class="nbtn ghost">丢弃</button></footer>
  </article></div>`, "rd-page");
await writeFile(join(dir, "pages/night-delivery.html"), delivery);

// 自定义芯片编辑
const HUES = [["168,145,255"], ["255,138,36"], ["77,227,255"], ["255,143,184"], ["255,209,102"], ["143,227,196"]];
const customDrawer = `<div class="nt-scrim" aria-hidden="true"></div><aside class="nt-drawer page-night" role="dialog" aria-label="新建自定义芯片" style="--h:143,227,196">
  <header class="dw-head"><span class="dw-chip">${glyph("brief", 26)}</span><div><span class="mono dim">C-08 · CUSTOM · 新芯片</span><h2 class="ed-title" contenteditable="true">周报草稿<span class="caret"></span></h2></div><button class="icon-btn" aria-label="关闭">${ic("x", 18)}</button></header>
  <div class="dw-body"><div class="dw-main">
    <section class="fld two"><div><h3>颜色</h3><div class="hues">${HUES.map(([h], i) => `<button class="hue${i === 5 ? " on" : ""}" style="--h:${h}" aria-label="颜色 ${i + 1}"></button>`).join("")}</div></div><div><h3>图符</h3><div class="glyphs">${["learn", "push", "test", "review", "deps", "brief"].map((g, i) => `<button class="gl${i === 5 ? " on" : ""}">${glyph(g, 18)}</button>`).join("")}</div></div></section>
    <section class="fld"><h3>明早交回什么</h3><div class="topics outs">${[["报告", "长文，全屏阅读"], ["清单", "逐条可转待处理"], ["分支", "改代码，需合并"], ["一页简报", "晨报里直接看"]].map(([a, b], i) => `<button class="topic${i === 0 ? " on" : ""}"><b>${a}</b><small>${b}</small></button>`).join("")}</div></section>
    <section class="fld two"><div><h3>能做什么</h3><ul class="brakes"><li><span>改代码</span><b>否 · 只读</b></li><li><span>联网</span><b>只读 ${ic("globe", 12)}</b></li></ul></div><div><h3>刹车</h3><ul class="brakes"><li><span>时长</span><b class="mono">≤ 20m</b></li><li><span>轮次</span><b class="mono">≤ 3</b></li></ul></div></section>
    <section class="fld"><div class="fld-h"><h3>Prompt</h3><span class="mono dim">自定义芯片只有一层，改了就长期生效</span></div><div class="prompt"><div class="seg tonight"><p class="ed" contenteditable="true">读 ${tok("{项目}")} 本周的交接与 CURRENT，写一份周报草稿：完成了什么、卡在哪、下周唯一要推进的事。每条附交接链接。<span class="caret"></span></p></div></div></section>
    <section class="fld"><h3>验收标准 <small class="dim">（必填，至少 1 条）</small></h3><ul class="accept"><li>${ic("check", 13)}每条都附交接链接</li><li class="add">${ic("plus", 13)}加一条</li></ul></section>
  </div>
  <aside class="dw-side"><h3>芯片预览</h3><div class="prev">${chip("brief").replaceAll("明日简报", "周报草稿").replace("C-06", "C-08").replace("BRIEF", "CUSTOM").replace("产出 · 一页简报", "产出 · 报告").replace("≤10m", "≤20m")}</div><p class="dim small">保存后出现在芯片库最后；可复制、可删除。</p></aside></div>
  <footer class="dw-foot"><span class="dim small">验收标准为空时不能保存</span><button class="nbtn">取消</button><button class="nbtn pri">${ic("check", 15)}保存芯片</button></footer></aside>`;
await writeFile(join(dir, "pages/night-custom.html"), page(`${heading("挑几枚芯片插进今晚，明早翻面看结果。")}${bayEvening()}${library("custom")}`, "eve", customDrawer));
console.log("states ok");
