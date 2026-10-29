// 逆向工程三版样稿（方案 docs/product/2026-10-29-逆向工程定位与重构方案.md）。三版共用数据与操作，只在版式上不同：
// 一 · 工单台（body[data-v=a]）：左列表 + 右拆解单，三段竖轨。
// 二 · 孵化流水（data-v=b）：待交出 / 已交出 / 已收成三列，点卡片右侧抽屉看全。
// 三 · 解剖屏（data-v=c）：上排标本条，下面一块屏左右三栏：参照物 → 任务包 → 收成。
// 只在界面上变，不写数据。动效按帧（steps）；减少动态效果时直接到位。
(() => {
  const V = document.body.dataset.v;
  const reduced = (() => { try { return matchMedia("(prefers-reduced-motion: reduce)").matches; } catch { return true; } })();
  const STEP = { easing: "steps(1, end)" };
  const pad2 = (n) => String(n).padStart(2, "0");
  const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];

  // ---- 正式库只读摘录（revision 1022，10-29）。「好在哪里」三条都没填过。 ----
  const R = [
    {
      id: "r2", title: "Agent迁移和上下文接力功能", kind: "web", src: "app.luzi.top/agents", full: "https://app.luzi.top/agents", at: "10/15",
      want: "Agent迁移和上下文接力功能", why: "",
      clues: ["/agents/migration", "/agents/work-handoff", "migration", "handoff", "context", "session", "export", "import"],
      state: "back", outAt: "10/16", by: "Codex",
      result: {
        obs: 7, infer: 1, unknown: 9,
        lines: [
          ["观察", "主脚本中有 /agents/migration、/agents/migration/:taskId 和 /agents/work-handoff 路由，迁移入口与带 taskId 的路径都有静态证据。"],
          ["观察", "有 /agent-mirror/migration-packages、/agent-mirror/context-packs、/agent-mirror/snapshots 三个 post 调用候选。"],
          ["推断", "可以分成「Agent 迁移」和「工作交接」两个分支，迁移包、上下文包分别是它们的数据产物。"],
          ["未知", "迁移与交接页面的实际控件、步骤、表单字段和提示文案；本次没有导航、点击或提交。"],
        ],
      },
      legacy: "旧记录 · 2 次 REA 取证（10/15、10/16）· 2 个 Codex 结论包",
    },
    {
      id: "r3", title: "全部", kind: "web", src: "app.luzi.top/community", full: "https://app.luzi.top/community", at: "10/15",
      want: "全部", why: "", clues: [], state: "todo", note: "上次取证失败",
      legacy: "旧记录 · 1 次 REA 取证（10/15，失败）",
    },
    {
      id: "r1", title: "验收 · 原生 REA 全能力 · 自建样本", kind: "local", src: "fixture-bin",
      full: "/Users/nat/Documents/ChatGPT/个人/work/personal-ai-workbench/work/reverse-native572/fixture-bin", at: "10/20",
      want: "只读确认 Mach-O 架构、文件 SHA256 和 add_demo 符号。不要运行样本、修改文件、安装工具或访问其他目标。", why: "", clues: [], state: "todo",
      legacy: "旧记录 · 验收样本，未取证",
    },
  ];
  const SAMPLE = JSON.parse(JSON.stringify(R[0].result)); // 「放回结论」在样稿里用这份真实结论
  const KIND = { web: "网站", local: "本机文件", img: "截图", txt: "文字" };
  const STATE = { todo: "待交出", out: "已交出", back: "已交出", done: "已收成" };
  const group = (r) => (r.state === "back" ? "out" : r.state);
  let cur = R[0].id, filter = "all", seq = 0;
  const rec = (id = cur) => R.find((r) => r.id === id);

  // ---- 液晶数字（与 v19.js 同一字模） ----
  const G = {
    0: "01110100011001110101110011000101110", 1: "00100011000010000100001000010001110", 2: "01110100010000100010001000100011111",
    3: "11111000100010000010000011000101110", 4: "00010001100101010010111110001000010", 5: "11111100001111000001000011000101110",
    6: "00110010001000011110100011000101110", 7: "11111000010001000100010000100001000", 8: "01110100011000101110100011000101110",
    9: "01110100011000101111000010001001100",
  };
  function lcd(el, text, roll) {
    let off = "", on = "";
    [...text].forEach((ch, i) => {
      for (let y = 0; y < 7; y++) for (let x = 0; x < 5; x++) {
        const r = `<rect x="${i * 6 + x}" y="${y}" width=".75" height=".75"/>`;
        off += r; if ((G[ch] || "")[y * 5 + x] === "1") on += r;
      }
    });
    el.innerHTML = `<svg viewBox="0 0 ${text.length * 6 - 1} 7" role="img" aria-label="${text}"><g class="off">${off}</g><g class="on">${on}</g></svg>`;
    if (roll && !reduced) el.firstElementChild.animate([3, 2, 1, 0].map((k, i) => ({ offset: i / 3, clipPath: `inset(0 0 ${k * 33}% 0)`, ...STEP })).concat({ clipPath: "inset(0 0 0 0)" }), { duration: 160 });
  }
  function counts(roll) {
    for (const el of $$("[data-rv-count]")) {
      const k = el.dataset.rvCount, n = R.filter((r) => group(r) === k).length, t = pad2(n);
      if (el.dataset.text !== t) { el.dataset.text = t; lcd(el, t, roll); }
    }
    for (const el of $$("[data-rv-n]")) el.textContent = el.dataset.rvN === "all" ? R.length : R.filter((r) => group(r) === el.dataset.rvN).length;
  }

  // ---- 动效 ----
  function fly(from, to, color = "#4de3ff") {
    return new Promise((done) => {
      if (reduced || !from || !to) return done();
      const a = from.getBoundingClientRect(), b = to.getBoundingClientRect();
      const bit = document.createElement("i");
      bit.className = "v19-bit"; bit.style.background = color; document.body.appendChild(bit);
      const x0 = a.left + a.width / 2, y0 = a.top + a.height / 2, x1 = b.left + b.width / 2, y1 = b.top + b.height / 2, N = 16, frames = [];
      for (let i = 0; i <= N; i++) { const t = i / N; frames.push({ offset: t, transform: `translate(${x0 + (x1 - x0) * t}px, ${y0 + (y1 - y0) * t - Math.sin(t * Math.PI) * 48}px)`, ...STEP }); }
      bit.animate(frames, { duration: N * 36 }).onfinish = () => { bit.remove(); done(); };
    });
  }
  const partner = () => $("[data-partner-screen]") || $(".stage");
  function blink(el, times = 2) {
    if (!el || reduced) return;
    el.animate([{ opacity: 1, ...STEP }, { offset: 0.25, opacity: 0.25, ...STEP }, { offset: 0.5, opacity: 1, ...STEP }, { offset: 0.75, opacity: 0.25, ...STEP }, { opacity: 1 }], { duration: 110 * 2 * times });
  }
  function scan(el) {
    if (!el || reduced) return;
    const s = document.createElement("i"); s.className = "rv-scan"; el.appendChild(s);
    s.animate([0, 1, 2, 3, 4, 5, 6, 7, 8].map((k) => ({ offset: k / 8, top: `${k * 12.5}%`, opacity: k < 8 ? 1 : 0, ...STEP })), { duration: 420 }).onfinish = () => s.remove();
  }
  function toast(text) {
    const t = $("[data-rv-toast]"); if (!t) return;
    t.textContent = text; t.hidden = false; clearTimeout(toast.id); toast.id = setTimeout(() => (t.hidden = true), 2200);
  }

  // ---- 共用片段 ----
  const ICON = {
    web: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18"/></svg>',
    local: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M14 3H6a1 1 0 0 0-1 1v16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V8z"/><path d="M14 3v5h5M9 13h6M9 17h4"/></svg>',
    copy: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="9" y="9" width="12" height="12" rx="2"/><path d="M5 15V5a2 2 0 0 1 2-2h10"/></svg>',
    arrow: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6"/></svg>',
    back: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M19 12H5M11 18l-6-6 6-6"/></svg>',
    close: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18"/></svg>',
    chev: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m9 6 6 6-6 6"/></svg>',
  };
  // 像素蛋：整蛋 = 待交出；裂缝 = 已交出；破壳 = 已收成。只用在第二版的列头。
  const EGG = {
    todo: ["..XXXX..", ".XooooX.", "XooOoooX", "XoooooOX", "XoOooooX", "XooooOoX", ".XooooX.", "..XXXX.."],
    out: ["..XXXX..", ".XooooX.", "XooKoooX", "XooKKooX", "XoooKKoX", "XooooKoX", ".XooooX.", "..XXXX.."],
    done: ["........", ".X.XX.X.", "X.X..X.X", "XooooooX", "XoOoooOX", "XooooooX", ".XooooX.", "..XXXX.."],
  };
  function egg(k, size = 22) {
    const rows = EGG[k]; let s = "";
    rows.forEach((row, y) => [...row].forEach((c, x) => {
      const f = c === "X" ? "var(--px-ink)" : c === "o" ? "var(--px-egg)" : c === "O" ? "var(--px-egg-spot)" : c === "K" ? "var(--px-ink)" : "";
      if (f) s += `<rect x="${x}" y="${y}" width="1" height="1" fill="${f}"/>`;
    }));
    return `<svg class="rv-egg" viewBox="0 0 8 8" width="${size}" height="${size}" shape-rendering="crispEdges" aria-hidden="true">${s}</svg>`;
  }
  const led = (r) => `<i class="rv-led ${group(r)}" aria-hidden="true"></i>`;
  const stateText = (r) => r.state === "back" ? "结论已回 · 待收成" : r.state === "out" ? `已交出 · ${r.outAt}` : r.state === "done" ? "已收成" : r.note ? `待交出 · ${r.note}` : "待交出";

  function pack(r) {
    const lines = [
      `# 拆解任务：${r.title}`,
      `参照物：${r.full}（${KIND[r.kind]}）`,
      `想弄懂：${r.want}`,
      r.why ? `好在哪里：${r.why}` : null,
      r.clues.length ? `线索：${r.clues.join("，")}` : null,
      "做法：",
      r.kind === "web" ? "1. 先用独立资料目录开 Chrome 调试窗口打开参照物，再用你本机已注册的 rea MCP 取证。" : "1. 用你本机已注册的 rea MCP 取证；不运行目标，不修改文件。",
      "2. 结论分观察 / 推断 / 未知，每条写出证据。",
      "3. 先列验收用例，再写可复用的做法。",
      "4. 只分析，不修改任何项目。",
      "最后用一个 Markdown 块写「可复用做法」，我会存成 Skill。",
    ].filter(Boolean);
    return lines.join("\n");
  }
  const packHtml = (r, n = 99) => pack(r).split("\n").slice(0, n).map((l) => `<span>${esc(l)}</span>`).join("");
  const skillName = (r) => r.id === "r2" ? "Agent 迁移与工作交接 · 拆解" : `${r.title.slice(0, 14)} · 拆解`;

  function srcLine(r) {
    return `<span class="rv-src" title="${esc(r.full)}">${ICON[r.kind] || ""}<span>${esc(r.src)}</span></span>`;
  }
  function inputBlock(r, big) {
    return `<div class="rv-want${big ? " big" : ""}"><small>想弄懂</small><p>${esc(r.want)}</p></div>` +
      `<div class="rv-why"><small>好在哪里</small>${r.why ? `<p>${esc(r.why)}</p>` : `<button class="rv-add" data-rv-why>＋ 写一句（选填）</button>`}</div>` +
      (r.clues.length ? `<div class="rv-clues"><small>线索</small><div>${r.clues.map((c) => `<code>${esc(c)}</code>`).join("")}</div></div>` : "");
  }
  function sendBlock(r, rows) {
    const sent = r.state !== "todo";
    return `<pre class="rv-pack" data-rv-pack>${packHtml(r, rows)}</pre>` +
      `<div class="rv-acts"><button class="rv-btn pri" data-rv-copy="Codex">${ICON.copy}<span>复制给 Codex</span></button>` +
      `<button class="rv-btn" data-rv-copy="Claude Code">${ICON.copy}<span>复制给 Claude Code</span></button>` +
      `<span class="rv-receipt">${sent ? `${r.outAt || "今天"} 交给 ${esc(r.by || "Codex")}` : "只复制，不自动发送"}</span></div>`;
  }
  function harvestBlock(r) {
    if (r.state === "done") {
      return `<div class="rv-asset" data-rv-asset><span class="rv-chip">SKILL</span><b>${esc(r.skill)}</b><small>固定版本 v1 · 今天 · 未经复刻验证</small>` +
        `<a href="#" class="rv-link">在资产仓库打开 ${ICON.arrow}</a></div>`;
    }
    if (r.state === "back") {
      const x = r.result;
      return `<div class="rv-tally"><span><span class="lcd" data-rv-lcd="${pad2(x.obs)}"></span><small>观察</small></span>` +
        `<span><span class="lcd violet" data-rv-lcd="${pad2(x.infer)}"></span><small>推断</small></span>` +
        `<span><span class="lcd dim" data-rv-lcd="${pad2(x.unknown)}"></span><small>未知</small></span><em>${esc(r.by)} · ${r.outAt}</em></div>` +
        `<ul class="rv-lines">${x.lines.map(([m, t]) => `<li><i class="m ${m === "观察" ? "o" : m === "推断" ? "i" : "u"}">${m}</i>${esc(t)}</li>`).join("")}</ul>` +
        `<div class="rv-acts"><button class="rv-btn pri" data-rv-save>存成 Skill</button><button class="rv-btn ghost" data-rv-paste>换一份结论</button></div>`;
    }
    if (r.state === "out") {
      return `<label class="rv-paste"><small>Agent 拆完后，把结论贴回来</small><textarea rows="4" placeholder="粘贴 Agent 的结论（观察 / 推断 / 未知 + 可复用做法）" data-rv-text></textarea></label>` +
        `<div class="rv-acts"><button class="rv-btn pri" data-rv-back>放回结论</button><span class="rv-receipt">样稿里会用 10/16 那份真实结论</span></div>`;
    }
    return `<p class="rv-empty">${egg("todo", 18)}先把任务包交出去，结论回来后在这里存成 Skill。</p>`;
  }
  const legacy = (r) => r.legacy ? `<details class="rv-legacy"><summary>${ICON.chev}<b>历史取证</b><small>${esc(r.legacy)} · 只读</small></summary><p>旧版在工作台里跑的 REA 取证、证据和结论包都还在，这里只读显示；新的拆解交给原生 Agent。</p></details>` : "";

  // ---- 一 · 工单台 ----
  function renderA() {
    const list = $("[data-rv-list]"), r = rec();
    const rows = R.filter((x) => filter === "all" || group(x) === filter);
    list.innerHTML = rows.map((x) => `<button class="rv-row${x.id === cur ? " on" : ""}" data-rv-pick="${x.id}" aria-pressed="${x.id === cur}">` +
      `<span class="t">${esc(x.title)}</span>${srcLine(x)}<span class="s">${led(x)}${stateText(x)}<em>${x.at}</em></span></button>`).join("") ||
      `<p class="rv-none">这一栏还没有拆解单。</p>`;
    const step = r.state === "todo" ? 1 : r.state === "done" ? 4 : r.state === "back" ? 3 : 2;
    $("[data-rv-detail]").innerHTML =
      `<button class="rv-backbtn" data-rv-list-back>${ICON.back}全部拆解单</button>` +
      `<header class="rv-head"><span class="rv-kind">${KIND[r.kind]}</span><h2>${esc(r.title)}</h2><div class="meta">${srcLine(r)}<span>${r.at} 投入</span></div></header>` +
      `<ol class="rv-track">` +
      `<li class="${step > 1 ? "lit" : "now"}"><i class="n">01</i><h3>投入</h3><div class="body">${inputBlock(r, true)}</div></li>` +
      `<li class="${step > 2 ? "lit" : step === 2 || step === 1 ? "now" : ""}"><i class="n">02</i><h3>交出</h3><div class="body">${sendBlock(r, 7)}</div></li>` +
      `<li class="${step > 3 ? "lit" : step === 3 ? "now" : ""}"><i class="n">03</i><h3>收成</h3><div class="body" data-rv-harvest>${harvestBlock(r)}</div></li>` +
      `</ol>${legacy(r)}`;
  }

  // ---- 二 · 孵化流水 ----
  function renderB() {
    const lanes = [["todo", "待交出", "投进来的参照物，任务包还没交出去"], ["out", "已交出", "在 Agent 那里拆，结论回来就能收成"], ["done", "已收成", "已经存成 Skill，进了资产仓库"]];
    $("[data-rv-lanes]").innerHTML = lanes.map(([k, name, hint], i) => {
      const items = R.filter((x) => group(x) === k);
      return `<section class="rv-lane ${k}" data-lane="${k}"><header>${egg(k, 40)}<div><h3>${name} <b data-rv-n="${k}">${items.length}</b></h3><small>${hint}</small></div></header>` +
        `<div class="cards">${items.map(cardB).join("") || `<div class="rv-slot">${k === "done" ? `${egg("done", 32)}还没有收成过<small>存成的 Skill 会落在这里</small>` : "空"}</div>`}</div>` +
        (i < 2 ? `<i class="rv-belt" aria-hidden="true">${ICON.arrow}</i>` : "") + `</section>`;
    }).join("");
  }
  function cardB(x) {
    const act = x.state === "todo" ? `<button class="rv-btn sm pri" data-rv-copy="Codex" data-rv-id="${x.id}">${ICON.copy}<span>复制任务包</span></button>`
      : x.state === "back" ? `<button class="rv-btn sm pri" data-rv-save data-rv-id="${x.id}">存成 Skill</button><span class="rv-mini">观察 ${x.result.obs} · 推断 ${x.result.infer} · 未知 ${x.result.unknown}</span>`
      : x.state === "out" ? `<span class="rv-mini">${x.outAt} 交给 ${esc(x.by)} · 等结论</span>`
      : `<span class="rv-chip">SKILL</span><span class="rv-mini">${esc(x.skill)}</span>`;
    return `<article class="rv-card${x.id === cur && $(".rv-drawer.open") ? " on" : ""}" data-rv-id="${x.id}"><button class="hit" data-rv-open="${x.id}" aria-label="打开 ${esc(x.title)}"></button>` +
      `<span class="rv-kind">${KIND[x.kind]}</span><b>${esc(x.title)}</b>${srcLine(x)}<p>${esc(x.want)}</p><div class="foot">${act}</div>` +
      `${x.note && x.state === "todo" ? `<span class="rv-warn">${esc(x.note)}</span>` : ""}<em class="at">${x.at}</em></article>`;
  }
  function drawerB() {
    const r = rec(), d = $("[data-rv-drawer]");
    d.innerHTML = `<header><span class="rv-kind">${KIND[r.kind]}</span><span class="grow"></span><button class="ibtn" data-rv-close aria-label="关闭">${ICON.close}</button></header>` +
      `<h2>${esc(r.title)}</h2><div class="meta">${srcLine(r)}<span>${r.at} 投入</span><span>${led(r)}${stateText(r)}</span></div>` +
      `<section><h3>投入</h3>${inputBlock(r)}</section><section><h3>交出</h3>${sendBlock(r, 99)}</section>` +
      `<section><h3>收成</h3><div data-rv-harvest>${harvestBlock(r)}</div></section>${legacy(r)}`;
    for (const el of $$("[data-rv-lcd]", d)) lcd(el, el.dataset.rvLcd);
  }

  // ---- 三 · 解剖屏 ----
  function renderC() {
    $("[data-rv-strip]").innerHTML = R.map((x) => `<button class="rv-spec${x.id === cur ? " on" : ""}" data-rv-pick="${x.id}" aria-pressed="${x.id === cur}">` +
      `<span class="g">${ICON[x.kind]}</span><span class="t">${esc(x.title)}</span><span class="s">${led(x)}${STATE[x.state]}</span></button>`).join("") +
      `<button class="rv-spec add" data-rv-new><span class="g">＋</span><span class="t">投入参照物</span><span class="s">链接、截图或本机路径</span></button>`;
    const r = rec();
    const stage = r.state === "todo" ? 1 : r.state === "done" ? 3 : 2;
    $("[data-rv-screen]").innerHTML =
      `<header class="rv-shead"><span class="rv-kind">${KIND[r.kind]}</span><h2>${esc(r.title)}</h2><span class="grow"></span><span class="rv-stateline">${led(r)}${stateText(r)}</span></header>` +
      `<div class="rv-cols">` +
      `<section class="col in"><h3><i>01</i>参照物</h3><div class="rv-ref">${srcLine(r)}<small>${r.at} 投入</small></div>${inputBlock(r, true)}</section>` +
      `<i class="rv-pipe${stage >= 2 ? " lit" : ""}" aria-hidden="true">${ICON.arrow}<small>交出</small></i>` +
      `<section class="col out"><h3><i>02</i>任务包 <span class="lcd-tag">PACK · v1</span></h3>${sendBlock(r, 99)}</section>` +
      `<i class="rv-pipe${stage >= 3 ? " lit" : ""}" aria-hidden="true">${ICON.arrow}<small>收成</small></i>` +
      `<section class="col got"><h3><i>03</i>收成</h3><div class="rv-bay${r.state === "done" ? " full" : ""}" data-rv-harvest>${harvestBlock(r)}</div></section>` +
      `</div>${legacy(r)}`;
  }

  function render(roll) {
    if (V === "a") renderA();
    if (V === "b") { renderB(); if ($(".rv-drawer.open")) drawerB(); }
    if (V === "c") renderC();
    for (const el of $$("[data-rv-lcd]")) lcd(el, el.dataset.rvLcd, roll);
    counts(roll);
  }

  // ---- 操作 ----
  async function copy(btn, id) {
    const r = rec(id);
    try { await navigator.clipboard?.writeText(pack(r)); } catch {}
    const label = btn.querySelector("span"); if (label) label.textContent = "已复制";
    await fly(btn, partner());
    dispatchEvent(new Event("guiji:data-caught"));
    if (r.state === "todo") { r.state = "out"; r.outAt = "今天"; r.by = btn.dataset.rvCopy; r.note = ""; }
    else r.by = btn.dataset.rvCopy;
    cur = r.id; render(true);
    toast(`任务包已复制，去 ${btn.dataset.rvCopy} 里粘贴。只复制，不自动发送。`);
    blink($(V === "b" ? `.rv-card[data-rv-id="${r.id}"]` : ".rv-led.out"));
  }
  function back(id) {
    const r = rec(id);
    if (!r.result) r.result = JSON.parse(JSON.stringify(SAMPLE));
    r.by = r.by || "Codex"; r.state = "back"; render(true); scan($("[data-rv-harvest]"));
  }
  function sheetSave(id) {
    const r = rec(id), s = $("[data-rv-sheet]");
    s.innerHTML = `<div class="rv-sheet-in" role="dialog" aria-label="存成 Skill"><header><h3>存成 Skill · 预览</h3><button class="ibtn" data-rv-sheet-x aria-label="关闭">${ICON.close}</button></header>` +
      `<label>名字<input value="${esc(skillName(r))}" data-rv-name></label>` +
      `<dl><dt>来源</dt><dd>逆向工程 · ${esc(r.title)}</dd><dt>内容</dt><dd>任务包 + ${esc(r.by || "Agent")} 结论（观察 ${r.result.obs} · 推断 ${r.result.infer} · 未知 ${r.result.unknown}）</dd>` +
      `<dt>版本</dt><dd>固定版本 v1 · 写入后回读核对</dd><dt>验证</dt><dd class="warn">未经复刻验证</dd></dl>` +
      `<p class="hint">不安装到 Agent。以后在资产仓库里复制给 Agent 用；被用上时会出现在项目空间的「实战」里。</p>` +
      `<div class="rv-acts"><button class="rv-btn pri" data-rv-confirm="${r.id}">确认存入</button><button class="rv-btn ghost" data-rv-sheet-x>取消</button></div></div>`;
    s.hidden = false; $("[data-rv-name]", s)?.focus();
  }
  async function confirmSave(id, btn) {
    const r = rec(id), name = $("[data-rv-name]")?.value || skillName(r);
    await fly(btn, partner(), "#a891ff");
    dispatchEvent(new Event("guiji:data-caught"));
    $("[data-rv-sheet]").hidden = true;
    r.state = "done"; r.skill = name; cur = r.id; render(true);
    blink($("[data-rv-asset]"));
    toast(`已存成 Skill「${name}」。样稿只在界面上变，不写数据。`);
  }
  function newSheet() {
    const s = $("[data-rv-sheet]");
    s.innerHTML = `<div class="rv-sheet-in" role="dialog" aria-label="投入参照物"><header><h3>投入参照物</h3><button class="ibtn" data-rv-sheet-x aria-label="关闭">${ICON.close}</button></header>` +
      `<label>参照物<input placeholder="网址、本机路径，或拖入截图" data-rv-f-src></label>` +
      `<label>想弄懂什么<textarea rows="3" placeholder="例如：它的空状态文案怎么写的" data-rv-f-want></textarea></label>` +
      `<label>好在哪里 <small>选填</small><input placeholder="一句话就行" data-rv-f-why></label>` +
      `<label class="chk"><input type="checkbox" checked> 我拥有或获准分析这个参照物</label>` +
      `<div class="rv-acts"><button class="rv-btn pri" data-rv-create>开一张拆解单</button><button class="rv-btn ghost" data-rv-sheet-x>取消</button></div></div>`;
    s.hidden = false; $("[data-rv-f-src]", s).focus();
  }
  function create() {
    const src = $("[data-rv-f-src]").value.trim() || "example.com/landing", want = $("[data-rv-f-want]").value.trim() || "它的首屏怎么安排的";
    const web = !src.startsWith("/");
    const r = { id: `n${++seq}`, title: want.slice(0, 18), kind: web ? "web" : "local", src: web ? src.replace(/^https?:\/\//, "") : src.split("/").pop(), full: src,
      at: "今天", want, why: $("[data-rv-f-why]").value.trim(), clues: [], state: "todo" };
    R.unshift(r); cur = r.id; $("[data-rv-sheet]").hidden = true; filter = "all";
    for (const b of $$("[data-rv-filter]")) b.setAttribute("aria-pressed", b.dataset.rvFilter === "all");
    render(true);
    if (V === "b") { $("[data-rv-drawer]").classList.add("open"); drawerB(); }
    toast("新拆解单已开，只在样稿里。");
  }

  document.addEventListener("click", (e) => {
    const t = e.target;
    const pick = t.closest("[data-rv-pick]");
    if (pick) { cur = pick.dataset.rvPick; document.body.classList.add("rv-detail-on"); render(); scan($(V === "c" ? "[data-rv-screen]" : "[data-rv-detail]")); return; }
    if (t.closest("[data-rv-list-back]")) { document.body.classList.remove("rv-detail-on"); return; }
    const f = t.closest("[data-rv-filter]");
    if (f) { filter = f.dataset.rvFilter; for (const b of $$("[data-rv-filter]")) b.setAttribute("aria-pressed", b === f); render(); return; }
    const open = t.closest("[data-rv-open]");
    if (open) { cur = open.dataset.rvOpen; $("[data-rv-drawer]").classList.add("open"); drawerB(); renderB(); scan($("[data-rv-drawer]")); return; }
    if (t.closest("[data-rv-close]")) { $("[data-rv-drawer]").classList.remove("open"); renderB(); return; }
    const c = t.closest("[data-rv-copy]");
    if (c) return copy(c, c.dataset.rvId || cur);
    const b = t.closest("[data-rv-back]");
    if (b) return back(cur);
    if (t.closest("[data-rv-paste]")) { rec().state = "out"; render(); return; }
    const sv = t.closest("[data-rv-save]");
    if (sv) { if (sv.dataset.rvId) cur = sv.dataset.rvId; return sheetSave(cur); }
    const cf = t.closest("[data-rv-confirm]");
    if (cf) return confirmSave(cf.dataset.rvConfirm, cf);
    if (t.closest("[data-rv-sheet-x]") || t.matches("[data-rv-sheet]")) { $("[data-rv-sheet]").hidden = true; return; }
    if (t.closest("[data-rv-new]")) return newSheet();
    if (t.closest("[data-rv-create]")) return create();
    if (t.closest("[data-rv-why]")) { const w = t.closest(".rv-why"); w.innerHTML = `<small>好在哪里</small><input class="rv-inline" placeholder="一句话就行，回车保存" data-rv-why-in>`; $("[data-rv-why-in]", w).focus(); return; }
    if (t.closest("[data-pj-navopen]")) { document.body.classList.toggle("pj-nav"); return; }
    if (document.body.classList.contains("pj-nav") && !t.closest(".side")) document.body.classList.remove("pj-nav");
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") { const s = $("[data-rv-sheet]"); if (s && !s.hidden) s.hidden = true; else $("[data-rv-drawer]")?.classList.remove("open"); }
    if (e.key === "Enter" && e.target.matches("[data-rv-why-in]")) { rec().why = e.target.value.trim(); render(); }
  });

  render(true);
})();
