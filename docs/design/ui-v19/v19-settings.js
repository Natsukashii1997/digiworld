// UI v19 · 设置 二（后盖面板）/ 三（开机自检）。数据是 10-24 只读读到的正式读数（build/settings-live.json）；
// 开关、下载、恢复、旋钮都只在界面上变，不发请求、不写数据。动效按帧（steps），减少动态效果时直接到位。
// · 开关：点它先出「预览」抽屉（按帧滑入），确认后拨片按帧滑过去、指示灯闪两下、顶部授权读数翻页。
// · 二 · 下载恢复包：记忆卡块格逐格扫过，备份灯由红转黄再转绿；危险区展开时警示条纹按帧落下。
// · 三 · 开机自检：开页逐行跑出结果（点点点 → 结果）；处理完一项，这一行的标记按帧翻成 ✓，计数减一。
(() => {
  const root = document.querySelector("main[data-settings]");
  if (!root) return;
  const reduced = (() => { try { return matchMedia("(prefers-reduced-motion: reduce)").matches; } catch { return true; } })();
  const STEP = { easing: "steps(1, end)" };
  const pad2 = (n) => String(n).padStart(2, "0");
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const wait = (ms) => new Promise((r) => setTimeout(r, reduced ? 0 : ms));
  const D = JSON.parse(document.getElementById("settings-data").textContent);
  const caps = Object.fromEntries(D.caps.map((c) => [c.id, { ...c }]));
  const kind = root.dataset.settings, box = root.querySelector("[data-st-root]");
  const mb = (b) => `${(b / 1e6).toFixed(1)} MB`;
  const CELLS = 40, LIT = Math.round(D.bytes / D.limitBytes * CELLS);
  const state = { backup: false, stall: D.stallDays, warn: D.warnDays, danger: D.dangerDays, roots: [...D.roots], target: "Codex" };

  // ---------- 公共：读数、提示、闪一下 ----------
  // 液晶：5×7 点阵，与 v19.js 同一套字模；翻页分三帧从下往上露出
  const G = {
    0: "01110100011001110101110011000101110", 1: "00100011000010000100001000010001110", 2: "01110100010000100010001000100011111",
    3: "11111000100010000010000011000101110", 4: "00010001100101010010111110001000010", 5: "11111100001111000001000011000101110",
    6: "00110010001000011110100011000101110", 7: "11111000010001000100010000100001000", 8: "01110100011000101110100011000101110",
    9: "01110100011000101111000010001001100", "/": "00001000010001000100010001000010000",
  };
  function lcdSvg(text) {
    let off = "", on = "";
    [...text].forEach((ch, i) => { for (let y = 0; y < 7; y++) for (let x = 0; x < 5; x++) { const r = `<rect x="${i * 6 + x}" y="${y}" width=".75" height=".75"/>`; off += r; if ((G[ch] || "")[y * 5 + x] === "1") on += r; } });
    return `<svg viewBox="0 0 ${text.length * 6 - 1} 7" role="img" aria-label="${text}"><g class="off">${off}</g><g class="on">${on}</g></svg>`;
  }
  function lcd(el, text, roll = true) {
    if (!el || el.dataset.text === text && el.firstElementChild) return;
    el.innerHTML = lcdSvg(text); el.dataset.text = text;
    if (roll && !reduced) el.firstElementChild.animate([3, 2, 1, 0].map((k, i) => ({ offset: i / 3, clipPath: `inset(0 0 ${k * 33}% 0)`, ...STEP })).concat({ clipPath: "inset(0 0 0 0)" }), { duration: 160 });
  }
  const lcdAll = (scope) => { for (const el of scope.querySelectorAll("[data-st-lcd]")) lcd(el, el.dataset.text || "00", false); };
  const onCount = () => Object.values(caps).filter((c) => c.on).length;
  function syncCount() { for (const el of document.querySelectorAll("[data-st-count]")) lcd(el, `${pad2(onCount())}/${pad2(D.caps.length)}`); }
  let toastTimer;
  function toast(msg) {
    const t = document.querySelector("[data-st-toast]");
    t.textContent = msg; t.hidden = false;
    clearTimeout(toastTimer); toastTimer = setTimeout(() => (t.hidden = true), 2600);
  }
  const flash = (el) => { if (!el || reduced) return; const on = "rgba(255, 138, 36, 0.18)"; el.animate([{ background: on, ...STEP }, { offset: 0.5, background: "transparent", ...STEP }, { background: on, ...STEP }].concat({ background: "transparent" }), { duration: 360 }); };
  function blink(led, times = 2) {
    if (!led) return;
    const final = led.classList.contains("on");
    if (reduced) return;
    let k = 0;
    const id = setInterval(() => { led.classList.toggle("on"); if (++k >= times * 2) { clearInterval(id); led.classList.toggle("on", final); } }, 110);
  }
  function drop(el) { // 按帧揭开（高度分三帧）
    if (reduced) return;
    const h = el.scrollHeight;
    el.animate([0, 1, 2].map((k) => ({ offset: k / 3, height: `${Math.round(h * k / 3)}px`, overflow: "hidden", ...STEP })).concat({ height: `${h}px`, overflow: "hidden" }), { duration: 180 });
  }

  // ---------- 开关 ----------
  function switchHtml(c) {
    const tone = c.tone ? ` ${c.tone}` : "";
    const parts = c.parts ? `<ul class="parts">${c.parts.map(([a, b]) => `<li><b>${esc(a)}</b>${esc(b)}</li>`).join("")}</ul>` : "";
    return `<div class="sw-row" data-cap="${c.id}">
      <button class="sw${c.on ? " on" : ""}" role="switch" aria-checked="${c.on}" aria-label="${esc(c.title)}：${c.on ? "已开启" : "关闭"}，点了先预览" data-st-switch="${c.id}"><span class="track"><span class="knob"></span></span></button>
      <div class="sw-text"><b>${esc(c.title)}</b><small>${esc(c.scope)}</small>${parts}</div>
      <div class="sw-state"><span class="st-word"><i class="led${c.on ? " on" : ""}"></i><span data-st-word>${c.system ? (c.on ? "已授权" : "未授权") : c.on ? "已开启" : "关闭"}</span></span><small class="last${tone}" data-st-last>${esc(c.last)}</small></div>
    </div>`;
  }
  function slide(sw, on) {
    sw.classList.toggle("on", on);
    sw.setAttribute("aria-checked", on);
    if (reduced) return;
    const knob = sw.querySelector(".knob"), dx = 24;
    knob.animate([0, 1, 2, 3].map((k) => ({ offset: k / 4, transform: `translateX(${Math.round((on ? -dx : dx) * (3 - k) / 3)}px)`, ...STEP })).concat({ transform: "translateX(0)" }), { duration: 200 });
  }
  function applyCap(id, on) {
    const c = caps[id];
    c.on = on;
    for (const row of document.querySelectorAll(`[data-cap="${id}"]`)) {
      const sw = row.querySelector(".sw");
      if (sw) { slide(sw, on); sw.setAttribute("aria-label", `${c.title}：${on ? "已开启" : "关闭"}，点了先预览`); }
      const word = row.querySelector("[data-st-word]"); if (word) word.textContent = on ? "已开启" : "关闭";
      const led = row.querySelector(".led"); if (led) { led.classList.toggle("on", on); blink(led); }
      const last = row.querySelector("[data-st-last]"); if (last) { last.textContent = "刚刚 · 预览稿未写入"; last.className = "last fresh"; }
      flash(row);
    }
    syncCount();
    afterCap(id);
  }

  // ---------- 预览抽屉 ----------
  const SHEET = {
    vault: () => ({ lead: "只授予「Vault 写入」：个人说明采纳后写回 Obsidian Vault。每次写入仍单独预览、再确认。",
      body: `<label>随手记允许子目录<input value="工作台随手记"></label><label>个人说明允许子目录（每行一个，可留空）<textarea rows="2">个人上下文</textarea></label>
             <p class="fine">目录必须已存在；空配置不授权整个 Vault。凭据、隐藏文件、符号链接和越界路径一律拒绝。</p>` }),
    agent: () => ({ lead: "只写明确管理的目标与受控字段。", body: `<p class="fine">现在管理目标 0 个（Codex / Hermes 都没有），在「资产交付目标」里添加后才有可写的地方。每次写入仍单独预览、再确认。</p>` }),
    model: () => ({ lead: "用本机钥匙串里的凭据，按次请求模型 / API。", body: `<p class="fine">凭据只存在本机钥匙串；每次请求仍先预览。</p>` }),
    daemon: () => ({ lead: "把工作台装成本机用户服务；运行状态单独核验。", body: `<p class="fine warn">上一次：10/8 16:36 申请开启，记录为未生效（not_applied），使用结果未知。</p>` }),
    knowledge: () => ({ lead: "把知识源与个人说明只读开放给 Agent（经本机 127.0.0.1:5179 的 MCP）。", body: `<ul class="parts">${caps.knowledge.parts.map(([a, b]) => `<li><b>${esc(a)}</b>${esc(b)}</li>`).join("")}</ul><p class="fine warn">最近一次：10/23 23:38 Claude 读取，结果失败。</p>` }),
    aihot: () => ({ lead: caps.aihot.on ? "关闭后停止每 3 小时一次的 AI HOT 网络访问。" : "开启后每 3 小时访问一次 AI HOT。", body: "" }),
    calendar: () => ({ system: true, lead: "日历和提醒事项的权限由 macOS 系统设置管理，这里只能查看。", body: `<ul class="parts">${caps.calendar.parts.map(([a, b]) => `<li><b>${esc(a)}</b>${esc(b)}</li>`).join("")}</ul>` }),
  };
  const sheet = document.querySelector("[data-st-sheet]");
  let sheetBack = null;
  function showSheet(tag, title, body, foot, back) {
    sheetBack = back;
    sheet.innerHTML = `<header><small>${tag}</small><b>${esc(title)}</b><button class="x" data-st-close aria-label="关闭">×</button></header>
      <div class="sheet-body">${body}</div><footer><button class="act" data-st-close>取消</button>${foot}</footer>`;
    lcdAll(sheet);
    sheet.hidden = false;
    if (!reduced) sheet.animate([0, 1, 2].map((k) => ({ offset: k / 3, transform: `translateX(${Math.round(440 * (3 - k) / 3)}px)`, ...STEP })).concat({ transform: "translateX(0)" }), { duration: 180 });
    (sheet.querySelector("footer .go, footer .red") || sheet.querySelector(".x")).focus();
  }
  function openSheet(id, back) {
    const c = caps[id], s = SHEET[id](), next = !c.on, verb = next ? "开启" : "关闭";
    showSheet(s.system ? "系统权限" : `预览${verb}`, c.title,
      `<p class="lead">${esc(s.lead)}</p>${s.body}<p class="now">当前：<b>${c.system ? (c.on ? "已授权" : "未授权") : c.on ? "已开启" : "关闭"}</b> · 最近一次使用：${esc(c.last)}</p>`,
      s.system ? `<button class="act go" data-st-system>打开系统设置</button>` : `<button class="act go" data-st-confirm="${id}">确认${verb}</button>`, back);
  }
  function closeSheet() {
    if (sheet.hidden) return Promise.resolve();
    return new Promise((done) => {
      const end = () => { sheet.hidden = true; sheetBack?.focus(); done(); };
      if (reduced) return end();
      sheet.animate([0, 1, 2].map((k) => ({ offset: k / 3, transform: `translateX(${Math.round(440 * k / 3)}px)`, ...STEP })).concat({ transform: "translateX(440px)" }), { duration: 150 }).onfinish = end;
    });
  }
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") closeSheet(); });

  // ---------- 旋钮（两版共用） ----------
  const stepper = (key, unit, label) => `<span class="stepper" data-st-step="${key}"><button class="act" data-d="-1" aria-label="${label}减一">−</button><span class="lcd" data-st-lcd data-text="${pad2(state[key])}"></span><small>${unit}</small><button class="act" data-d="1" aria-label="${label}加一">+</button></span>`;
  const rootsHtml = () => state.roots.map((r, i) => `<span class="path-chip"><code>${esc(r)}</code><button class="rm" data-st-rm="${i}" aria-label="移除 ${esc(r)}">×</button></span>`).join("");
  const knob = {
    roots: () => `<div class="knob-box" data-knob="roots"><h4>扫描目录<small>本地项目的发现范围</small></h4>
      <div class="paths" data-st-roots>${rootsHtml()}</div>
      <div class="add-root" hidden><input placeholder="/Users/nat/…" aria-label="新目录"><button class="act" data-st-addroot>加入</button></div>
      <div class="knob-act"><button class="act" data-st-editroots>编辑目录</button><button class="act go" data-st-save hidden>保存</button></div></div>`,
    stall: () => `<div class="knob-box" data-knob="stall"><h4>停滞阈值<small>超过阈值的项目标为停滞</small></h4>${stepper("stall", "天", "停滞阈值")}<div class="knob-act"><button class="act go" data-st-save hidden>保存</button></div></div>`,
    remind: () => `<div class="knob-box" data-knob="remind"><h4>未存档提醒<small>供项目空间状态提示使用</small></h4>
      <div class="pair"><span class="tag-y">黄</span>${stepper("warn", "天", "黄色提醒")}<span class="tag-r">红</span>${stepper("danger", "天", "红色提醒")}</div><div class="knob-act"><button class="act go" data-st-save hidden>保存</button></div></div>`,
    deliver: () => `<div class="knob-box" data-knob="deliver"><h4>资产交付目标<small>程序入口与 Home 绑定</small></h4>
      <div class="seg" role="tablist">${Object.keys(D.targets).map((t) => `<button role="tab" aria-selected="${t === state.target}" data-st-target="${t}">${t}</button>`).join("")}</div>
      <p class="fine" data-st-tgt>管理目标 ${D.targets[state.target]} · 尚未检查版本与目标</p>
      <div class="knob-act"><button class="act" data-st-check>检查版本与目标</button><button class="act" data-st-addtarget>＋ 添加目标</button></div></div>`,
  };
  function dirty(box) { const b = box.querySelector("[data-st-save]"); if (b) b.hidden = false; }

  // ---------- 存档卡 / 危险区（两版共用） ----------
  const cells = () => Array.from({ length: CELLS }, (_, i) => `<i class="${i < LIT ? "used" : ""}"></i>`).join("");
  const cardHtml = (mini = false) => `<div class="mcard${mini ? " mini" : ""}" data-st-card>
      <div class="mc-top"><span>MAIN · DATA</span><span>REV ${D.revision}</span></div>
      <div class="mc-cells" aria-label="数据目录占恢复包上限 ${Math.round(D.bytes / D.limitBytes * 100)}%">${cells()}</div>
      <div class="mc-foot"><b>${mb(D.bytes)}</b><span>/ 1 GiB 恢复包上限 · ${D.files.toLocaleString("en-US")} 个文件</span></div>
      <div class="mc-pins">${"<i></i>".repeat(9)}</div></div>`;
  const backupHtml = () => `<div class="bk">
      <div class="lamp-row"><i class="lamp red" data-st-lamp></i><div><b data-st-bk-title>最近完整备份：尚无成功记录</b><small data-st-bk-sub>还没有从这台机器下载过一次完整恢复包</small></div></div>
      <button class="act go big" data-st-download>下载恢复包 ZIP</button>
      <ul class="fine-list"><li>含工作台数据与记录；历史快照保持原样；已撤销页面的记录不会导入当前主库。</li><li>REA 原始证据不随备份，摘要和日志会保留；原件请单独复制 data/reverse-evidence。</li><li>服务端生成记录不证明文件已存到你的磁盘。</li></ul>
      <div class="minor"><button class="act" data-st-toast-msg="稿件：不打开访达">在访达中显示数据目录</button><button class="act" data-st-toast-msg="稿件：不导出">导出可合并数据 JSON</button><button class="act" data-st-toast-msg="稿件：不打开文件选择">导入备份</button><button class="act" data-st-toast-msg="稿件：不查找旧版浏览器数据">旧版浏览器数据 · 检查并导入</button></div>
      <p class="path">主库 <code title="${esc(D.directory)}">${esc(D.directory)}</code></p></div>`;
  const dangerHtml = () => `<section class="danger" id="danger">
      <button class="danger-h" data-st-danger aria-expanded="false"><span class="stripes" aria-hidden="true"></span><b>危险区</b><small>从完整备份恢复 · 查询上次恢复结果</small><span class="chev">展开</span></button>
      <div class="danger-body" hidden><div class="stripes drop" aria-hidden="true"></div>
        <div class="danger-in"><p>从完整备份恢复会把整个工作台换成备份里的样子。恢复包解到新目录，<b>从不覆盖当前数据目录</b>；切换到恢复出的目录要你停止工作台后手动完成。</p>
        <div class="danger-act"><button class="act" data-st-toast-msg="稿件：不查询（正式页在这里显示上次恢复结果）">查询上次恢复结果</button><button class="act red" data-st-restore>从完整备份恢复…</button></div>
        <p class="fine" data-st-restore-step hidden>下一步会让你选一个恢复包 ZIP，并逐项预览将恢复的内容；稿件到这里为止。</p></div></div></section>`;
  async function download(btn) {
    btn.disabled = true;
    const card = document.querySelector("[data-st-card]");
    const used = card ? [...card.querySelectorAll(".mc-cells i.used")] : [], lamp = document.querySelector("[data-st-lamp]");
    btn.textContent = "正在打包…";
    if (used.length) for (let i = 0; i < used.length; i += 3) { used.slice(i, i + 3).forEach((c) => c.classList.add("scan")); await wait(45); }
    else for (let k = 1; k <= 4; k++) { btn.textContent = `打包中 ${"▮".repeat(k)}${"▯".repeat(4 - k)}`; await wait(120); } // 没有记忆卡时，按钮里的进度格按帧填满
    if (lamp) { lamp.className = "lamp yellow"; await wait(160); }
    used.forEach((c) => c.classList.replace("scan", "done"));
    if (lamp) { lamp.className = "lamp green"; blink(lamp); }
    const bt = document.querySelector("[data-st-bk-title]"), bs = document.querySelector("[data-st-bk-sub]");
    if (bt) bt.textContent = "最近完整备份：刚刚";
    if (bs) bs.textContent = "恢复包已生成 · 请确认文件已存到你的磁盘";
    btn.textContent = "再下载一次"; btn.disabled = false;
    state.backup = true;
    const read = document.querySelector("[data-st-backup-read]");
    if (read) { read.classList.remove("bad"); read.classList.add("good"); read.querySelector("[data-st-backup-text]").textContent = "刚刚"; flash(read); }
    toast("稿件：只演示打包过程，没有生成或下载文件");
    afterBackup();
  }

  // ---------- 二 · 后盖面板 ----------
  let afterCap = () => {}, afterBackup = () => {}, refreshScan = () => {};
  if (kind === "panel") {
    const live = D.caps.filter((c) => c.group === "live"), legacy = D.caps.filter((c) => c.group === "legacy");
    box.innerHTML = `
      <section class="bay" id="gate"><header class="bay-h"><span class="tag">GATE · 01</span><h2>授权闸</h2><small>开关只表示状态；点它先预览，确认后才拨过去</small></header>
        <div class="gate"><div class="col"><h3>在用的板块<small>${live.length} 个开关 · 默认关闭</small></h3>${live.map(switchHtml).join("")}</div>
        <div class="col"><h3>已撤下板块留下的<small>原页面已撤下，授权不会自动撤销</small></h3>${legacy.map(switchHtml).join("")}</div></div></section>
      <section class="bay" id="card"><header class="bay-h"><span class="tag">CARD · 02</span><h2>存档卡</h2><small>主库、完整备份与导入导出；只存本机</small></header>
        <div class="card-wrap">${cardHtml()}${backupHtml()}</div></section>
      <section class="bay" id="knobs"><header class="bay-h"><span class="tag">KNOBS · 03</span><h2>旋钮</h2><small>偶尔调一次；原地改，改完点保存</small></header>
        <div class="knobs">${knob.roots()}${knob.stall()}${knob.remind()}${knob.deliver()}</div></section>
      ${dangerHtml()}`;
    document.addEventListener("click", (e) => {
      const j = e.target.closest("[data-jump]");
      if (j) { const t = document.getElementById(j.dataset.jump); t.scrollIntoView({ behavior: reduced ? "auto" : "smooth", block: "start" }); flash(t); }
    });
  }

  // ---------- 三 · 开机自检（原稿 post）与三的简化（lite：3-1 一行一控件 / 3-2 简单展开 / 3-3 右侧操作台） ----------
  const fileN = D.files.toLocaleString("en-US");
  const resBackup = () => state.backup ? "刚刚下载过恢复包 · 请确认已存到磁盘" : `从未成功 · 主库 ${mb(D.bytes)} / 1 GiB 上限 · ${fileN} 个文件`;
  const resScan = () => `${state.roots.length} 个目录 · 停滞 ${state.stall} 天 · 未存档 黄 ${state.warn} / 红 ${state.danger} 天`;
  const resWrites = () => { const on = ["vault", "agent", "model"].filter((k) => caps[k].on).map((k) => caps[k].title); return on.length ? `${on.join("、")} 已开启` : "Vault 写入 · Agent 配置 · 模型 / API 都关闭"; };
  const LINES = [
    { id: "backup", mark: "bad", label: "完整备份", res: resBackup },
    { id: "daemon", mark: "warn", label: "常驻服务", caps: ["daemon"], res: () => caps.daemon.on ? "已开启（预览稿未写入）" : "关闭 · 10/8 16:36 申请未生效，结果未知" },
    { id: "knowledge", mark: "warn", label: "知识开放", caps: ["knowledge"], res: () => caps.knowledge.on ? "已开放给 Agent（预览稿未写入）" : "关闭 · 10/23 23:38 Claude 读取失败" },
    { id: "aihot", mark: "net", label: "网络访问", caps: ["aihot"], res: () => caps.aihot.on ? "AI HOT 已开启 · 每 3 小时更新" : "AI HOT 已关闭" },
    { id: "calendar", mark: "net", label: "日历与提醒", res: () => "已授权 · 写入“工作台”日历和“工作台”列表" },
    { id: "writes", mark: "ok", label: "写入与连接", caps: ["vault", "agent", "model"], res: resWrites },
    { id: "scan", mark: "ok", label: "项目扫描", res: resScan },
    { id: "deliver", mark: "idle", label: "资产交付", res: () => "0 个目标 · 尚未检查版本与目标" },
  ];
  const GLYPH = { bad: "✗", warn: "!", net: "●", ok: "✓", idle: "·" };
  const head = (l, tail) => `<span class="mk" data-mk>[${GLYPH[l.mark]}]</span><b>${l.label}</b><span class="dots" aria-hidden="true"></span><span class="res" data-res-of="${l.id}">${esc(l.res())}</span>${tail}`;
  let lines = null;
  if (kind === "post") {
    const body = {
      backup: () => `<div class="pl-grid">${cardHtml(true)}${backupHtml()}</div>${dangerHtml()}`,
      daemon: () => `${switchHtml(caps.daemon)}<div class="pl-act"><button class="act" data-st-ack>知道了</button></div>`,
      knowledge: () => `${switchHtml(caps.knowledge)}<div class="pl-act"><button class="act" data-st-ack>知道了</button></div>`,
      aihot: () => switchHtml(caps.aihot),
      calendar: () => switchHtml(caps.calendar),
      writes: () => ["vault", "agent", "model"].map((k) => switchHtml(caps[k])).join(""),
      scan: () => `<div class="knobs three">${knob.roots()}${knob.stall()}${knob.remind()}</div>`,
      deliver: () => `<div class="knobs one">${knob.deliver()}</div>`,
    };
    lines = LINES.map((l) => ({ ...l }));
    box.innerHTML = lines.map((l) => `<li class="pl ${l.mark}" data-line="${l.id}">
      <button class="pl-h" aria-expanded="false" aria-controls="pl-${l.id}">${head(l, '<span class="chev">展开</span>')}</button>
      <div class="pl-body" id="pl-${l.id}" hidden>${body[l.id]()}</div></li>`).join("");
  }
  if (kind === "lite") {
    const variant = root.dataset.variant;
    const swBtn = (id) => { const c = caps[id]; return `<span class="mini-sw" data-cap="${id}"><button class="sw${c.on ? " on" : ""}" role="switch" aria-checked="${c.on}" aria-label="${esc(c.title)}：${c.on ? "已开启" : "关闭"}，点了先预览" data-st-switch="${id}"><span class="track"><span class="knob"></span></span></button></span>`; };
    const lsw = (id, label) => `<span class="lsw"><span>${label}</span>${swBtn(id)}</span>`;
    const ack = '<button class="act" data-st-ack>知道了</button>';
    const restore = '<button class="act red" data-st-restore-sheet>从完整备份恢复…</button>';
    // 3-2 / 3-3：每项只有一句话 + 一两个按钮
    const brief = {
      backup: () => `<p class="say">下载一次完整恢复包：主库 ${mb(D.bytes)} · ${fileN} 个文件，上限 1 GiB。REA 原始证据不随备份。</p>
        <div class="row-act"><button class="act go" data-st-download>下载恢复包 ZIP</button><button class="act" data-st-toast-msg="稿件：不导出">导出 JSON</button><button class="act" data-st-toast-msg="稿件：不打开文件选择">导入备份</button><span class="grow"></span>${restore}</div>`,
      daemon: () => `<p class="say">10/8 16:36 申请开启过一次，记录为未生效，结果未知。</p><div class="row-act">${lsw("daemon", "常驻服务")}${ack}</div>`,
      knowledge: () => `<p class="say">10/23 23:38 Claude 读取失败过一次。开放范围：Obsidian知识库、常浩的知识库、个人说明 MCP，只读。</p><div class="row-act">${lsw("knowledge", "开放给 Agent")}${ack}</div>`,
      aihot: () => `<p class="say">每 3 小时访问一次 AI HOT。</p><div class="row-act">${lsw("aihot", "AI HOT 网络访问")}</div>`,
      calendar: () => `<p class="say">日历、提醒事项都已授权，由 macOS 系统设置管理。</p><div class="row-act"><button class="act" data-st-system-now>打开系统设置</button></div>`,
      writes: () => `<p class="say">默认关闭；开启前先预览，每次写入仍单独确认。</p><div class="row-act">${lsw("vault", "Vault 写入")}${lsw("agent", "Agent 配置")}${lsw("model", "模型 / API")}</div>`,
      scan: () => `<p class="say">${state.roots.map(esc).join("、")}</p>
        <div class="row-act"><span class="kv"><span class="lbl">停滞</span>${stepper("stall", "天", "停滞阈值")}</span><span class="kv"><span class="lbl">未存档 黄</span>${stepper("warn", "天", "黄色提醒")}</span><span class="kv"><span class="lbl">红</span>${stepper("danger", "天", "红色提醒")}</span></div>
        <div class="row-act"><button class="act" data-st-roots-sheet>编辑目录</button><button class="act go" data-st-save hidden>保存</button></div>`,
      deliver: () => `<p class="say">Codex、Hermes 都还没有交付目标。</p><div class="row-act"><button class="act" data-st-check>检查版本与目标</button><button class="act" data-st-addtarget>＋ 添加目标</button></div>`,
    };
    if (variant === "flat") {
      // 3-1：不展开，每行右端就是它的操作；写入与连接拆成三行，各自一个开关
      const ctl = {
        backup: () => '<button class="act go" data-st-download>下载恢复包</button>',
        daemon: () => ack + swBtn("daemon"), knowledge: () => ack + swBtn("knowledge"), aihot: () => swBtn("aihot"),
        calendar: () => '<button class="act" data-st-system-now>系统设置</button>',
        vault: () => swBtn("vault"), agent: () => swBtn("agent"), model: () => swBtn("model"),
        scan: () => '<button class="act" data-st-scan-sheet>调整</button>', deliver: () => '<button class="act" data-st-addtarget>添加目标</button>',
      };
      const one = (id, label) => ({ id, mark: "ok", label, caps: [id], res: () => caps[id].on ? "已开启（预览稿未写入）" : `关闭 · ${caps[id].last}` });
      lines = LINES.filter((l) => l.id !== "writes").flatMap((l) => l.id === "scan" ? [one("vault", "Vault 写入"), one("agent", "Agent 配置"), one("model", "模型 / API"), { ...l }] : [{ ...l }]);
      box.innerHTML = lines.map((l) => `<li class="pl ${l.mark}" data-line="${l.id}"><div class="pl-h flat">${head(l, `<span class="ctl">${ctl[l.id]()}</span>`)}</div></li>`).join("");
      box.insertAdjacentHTML("afterend", `<div class="post-extra"><span class="lbl">数据</span><button class="act" data-st-toast-msg="稿件：不导出">导出可合并数据 JSON</button><button class="act" data-st-toast-msg="稿件：不打开文件选择">导入备份</button><button class="act" data-st-toast-msg="稿件：不打开访达">在访达中显示</button><span class="grow"></span>${restore}</div>`);
    } else if (variant === "brief") {
      lines = LINES.map((l) => ({ ...l }));
      box.innerHTML = lines.map((l) => `<li class="pl ${l.mark}" data-line="${l.id}">
        <button class="pl-h" aria-expanded="false" aria-controls="pl-${l.id}">${head(l, '<span class="chev">展开</span>')}</button>
        <div class="pl-body brief" id="pl-${l.id}" data-ctl hidden>${brief[l.id]()}</div></li>`).join("");
    } else {
      // 3-3：左边清单只负责选，右边操作台常驻；默认选第一项有问题的
      lines = LINES.map((l) => ({ ...l }));
      box.innerHTML = lines.map((l) => `<li class="pl ${l.mark}" data-line="${l.id}"><button class="pl-h pick" aria-selected="false">${head(l, '<span class="chev" aria-hidden="true">›</span>')}</button></li>`).join("");
      const dock = document.querySelector("[data-st-dock]");
      dock.hidden = false;
      const pick = (id, animate = true) => {
        const l = lines.find((x) => x.id === id);
        for (const b of box.querySelectorAll(".pick")) b.setAttribute("aria-selected", b.closest("[data-line]").dataset.line === id);
        dock.dataset.line = id;
        dock.innerHTML = `<header class="dock-h"><span class="mk ${l.mark}" data-mk-of="${id}">[${GLYPH[l.mark]}]</span><b>${l.label}</b></header>
          <p class="dock-res" data-res-of="${id}">${esc(l.res())}</p><div class="dock-body" data-ctl>${brief[id]()}</div>`;
        lcdAll(dock);
        if (animate && !reduced) dock.animate([0, 1, 2].map((k) => ({ offset: k / 3, clipPath: `inset(0 0 ${100 - k * 33}% 0)`, ...STEP })).concat({ clipPath: "inset(0 0 0 0)" }), { duration: 150 });
      };
      box.addEventListener("click", (e) => { const b = e.target.closest(".pick"); if (b && !b.closest(".pl").classList.contains("pending")) pick(b.closest("[data-line]").dataset.line); });
      root.addEventListener("st-booted", () => pick((lines.find((l) => l.mark === "bad") || lines[0]).id, false));
    }
  }
  if (lines) {
    const tally = () => {
      const n = { bad: 0, warn: 0, ok: 0 };
      for (const l of lines) n[l.mark === "bad" ? "bad" : l.mark === "warn" ? "warn" : "ok"]++;
      for (const k in n) lcd(document.querySelector(`[data-st-tally="${k}"]`), pad2(n[k]));
      document.querySelector("[data-st-foot]").className = `post-foot${n.bad ? " has-bad" : n.warn ? " has-warn" : " clear"}`;
      document.querySelector("[data-st-verdict]").textContent = n.bad ? `还有 ${n.bad} 项要处理${n.warn ? `，${n.warn} 项要看一眼` : ""}` : n.warn ? `没有要处理的，${n.warn} 项要看一眼` : "全部正常";
    };
    const setRes = (id) => { const l = lines.find((x) => x.id === id); if (l) for (const el of document.querySelectorAll(`[data-res-of="${id}"]`)) el.textContent = l.res(); };
    refreshScan = () => setRes("scan");
    async function flip(id, to) { // 标记按帧翻：原标记 → ▒ → ░ → 新标记
      const l = lines.find((x) => x.id === id), li = root.querySelector(`[data-line="${id}"]`);
      const mks = [li.querySelector("[data-mk]"), document.querySelector(`[data-mk-of="${id}"]`)].filter(Boolean);
      if (l.mark === to) return setRes(id);
      if (!reduced) for (const g of ["▒", "░"]) { mks.forEach((m) => (m.textContent = `[${g}]`)); await wait(90); }
      li.classList.replace(l.mark, to); mks.slice(1).forEach((m) => m.classList.replace(l.mark, to));
      l.mark = to; mks.forEach((m) => (m.textContent = `[${GLYPH[to]}]`));
      setRes(id); flash(li.querySelector(".pl-h")); tally();
    }
    afterBackup = () => flip("backup", "ok");
    afterCap = (id) => {
      const l = lines.find((x) => x.caps?.includes(id));
      if (l) flip(l.id, l.caps.some((k) => caps[k].on) ? "net" : l.mark === "bad" || l.mark === "idle" ? l.mark : "ok");
    };
    root.addEventListener("click", (e) => {
      const a = e.target.closest("[data-st-ack]");
      if (a) { flip(a.closest("[data-line]")?.dataset.line || document.querySelector("[data-st-dock]").dataset.line, "ok"); a.disabled = true; a.textContent = "已看过"; return; }
      const h = e.target.closest(".pl-h[aria-expanded]");
      if (!h || h.closest(".pl").classList.contains("pending")) return;
      const li = h.closest(".pl"), open = h.getAttribute("aria-expanded") !== "true";
      for (const other of root.querySelectorAll('.pl-h[aria-expanded="true"]')) if (other !== h) { other.setAttribute("aria-expanded", "false"); other.closest(".pl").querySelector(".pl-body").hidden = true; other.querySelector(".chev").textContent = "展开"; other.closest(".pl").classList.remove("open"); }
      h.setAttribute("aria-expanded", open); h.querySelector(".chev").textContent = open ? "收起" : "展开"; li.classList.toggle("open", open);
      const b = li.querySelector(".pl-body"); b.hidden = !open; if (open) { lcdAll(b); drop(b); }
    });
    async function boot() {
      const prog = document.querySelector("[data-st-progress]");
      document.querySelector("[data-st-verdict]").textContent = "";
      for (const k of ["bad", "warn", "ok"]) lcd(document.querySelector(`[data-st-tally="${k}"]`), "00");
      const items = [...box.querySelectorAll(".pl")];
      items.forEach((li) => {
        li.classList.add("pending"); li.classList.remove("open");
        const b = li.querySelector(".pl-body"), h = li.querySelector(".pl-h[aria-expanded]");
        if (b) b.hidden = true;
        if (h) { h.setAttribute("aria-expanded", "false"); h.querySelector(".chev").textContent = "展开"; }
      });
      for (const [i, li] of items.entries()) {
        prog.textContent = `自检中… ${i + 1} / ${items.length}`;
        li.classList.add("typing"); li.classList.remove("pending");
        const dots = li.querySelector(".dots");
        for (const d of [" .", " . .", " . . ."]) { dots.textContent = d; await wait(70); }
        li.classList.remove("typing"); dots.textContent = "";
      }
      prog.textContent = `自检完成 · ${items.length} 项 · ${new Date().toTimeString().slice(0, 5)}`;
      tally();
      root.dispatchEvent(new Event("st-booted"));
    }
    document.querySelector("[data-st-rerun]").addEventListener("click", boot);
    boot();
  }

  // ---------- 事件（两版共用） ----------
  document.addEventListener("click", async (e) => {
    const t = e.target;
    const sw = t.closest("[data-st-switch]");
    if (sw) return openSheet(sw.dataset.stSwitch, sw);
    if (t.closest("[data-st-close]")) return closeSheet();
    const ok = t.closest("[data-st-confirm]");
    if (ok) { const id = ok.dataset.stConfirm; await closeSheet(); applyCap(id, !caps[id].on); return toast("稿件：只在界面上拨过去，没有写入授权"); }
    if (t.closest("[data-st-system]")) { await closeSheet(); return toast("稿件：不打开系统设置"); }
    const msg = t.closest("[data-st-toast-msg]");
    if (msg) return toast(msg.dataset.stToastMsg);
    const dl = t.closest("[data-st-download]");
    if (dl) return download(dl);
    const dz = t.closest("[data-st-danger]");
    if (dz) {
      const body = dz.nextElementSibling, open = dz.getAttribute("aria-expanded") !== "true";
      dz.setAttribute("aria-expanded", open); dz.querySelector(".chev").textContent = open ? "收起" : "展开"; body.hidden = !open;
      if (open && !reduced) { // 警示条纹按帧落下，再揭开内容
        const s = body.querySelector(".stripes.drop");
        s.animate([0, 1, 2, 3].map((k) => ({ offset: k / 4, transform: `translateY(${-100 + k * 33}%)`, ...STEP })).concat({ transform: "translateY(0)" }), { duration: 240 });
        drop(body);
      }
      return;
    }
    if (t.closest("[data-st-restore-sheet]")) return showSheet("危险操作", "从完整备份恢复", `<p class="lead">会把整个工作台换成备份里的样子。</p>
      <p class="fine">恢复包解到新目录，<b>从不覆盖当前数据目录</b>；切换到恢复出的目录要你停止工作台后手动完成。下一步选一个恢复包 ZIP，并逐项预览将恢复的内容。</p>
      <div class="row-act"><button class="act" data-st-toast-msg="稿件：不查询（正式页在这里显示上次恢复结果）">查询上次恢复结果</button></div>`, '<button class="act red" data-st-restore-pick>选择恢复包…</button>', t.closest("button"));
    if (t.closest("[data-st-restore-pick]")) { await closeSheet(); return toast("稿件：不打开文件选择，到这里为止"); }
    if (t.closest("[data-st-system-now]")) return toast("稿件：不打开系统设置");
    if (t.closest("[data-st-navopen]")) return document.body.classList.toggle("st-nav");
    if (document.body.classList.contains("st-nav") && !t.closest(".side")) document.body.classList.remove("st-nav");
    const ks = t.closest("[data-st-scan-sheet], [data-st-roots-sheet]");
    if (ks) return showSheet("项目扫描", ks.matches("[data-st-roots-sheet]") ? "扫描目录" : "项目扫描设置", `<div class="knobs one">${knob.roots()}${ks.matches("[data-st-roots-sheet]") ? "" : knob.stall() + knob.remind()}</div>`, '<button class="act go" data-st-sheet-done>完成</button>', ks);
    if (t.closest("[data-st-sheet-done]")) { await closeSheet(); refreshScan(); return toast("稿件：只在界面上改，没有写入设置"); }
    if (t.closest("[data-st-restore]")) { const s = t.closest(".danger").querySelector("[data-st-restore-step]"); s.hidden = false; flash(s); return; }
    const step = t.closest("[data-st-step] [data-d]");
    if (step) {
      const box = step.closest("[data-st-step]"), key = box.dataset.stStep, d = Number(step.dataset.d);
      const lo = key === "danger" ? state.warn + 1 : 1, hi = key === "warn" ? state.danger - 1 : 60;
      const v = Math.min(hi, Math.max(lo, state[key] + d));
      if (v === state[key]) return toast(key === "warn" ? "黄色提醒要早于红色" : key === "danger" ? "红色提醒要晚于黄色" : "超出范围");
      state[key] = v;
      for (const el of document.querySelectorAll(`[data-st-step="${key}"] .lcd`)) lcd(el, pad2(v));
      refreshScan();
      return dirty(step.closest(".knob-box, [data-ctl]"));
    }
    const save = t.closest("[data-st-save]");
    if (save) { save.hidden = true; flash(save.closest(".knob-box, [data-ctl]")); refreshScan(); return toast("稿件：只在界面上改，没有写入设置"); }
    if (t.closest("[data-st-editroots]")) { const box = t.closest(".knob-box"); box.classList.add("editing"); const a = box.querySelector(".add-root"); a.hidden = false; drop(a); a.querySelector("input").focus(); return; }
    const rm = t.closest("[data-st-rm]");
    if (rm) { const box = rm.closest(".knob-box"); state.roots.splice(Number(rm.dataset.stRm), 1); box.querySelector("[data-st-roots]").innerHTML = rootsHtml(); refreshScan(); return dirty(box); }
    const add = t.closest("[data-st-addroot]");
    if (add) { const box = add.closest(".knob-box"), inp = box.querySelector(".add-root input"), v = inp.value.trim(); if (!v) return inp.focus(); state.roots.push(v); inp.value = ""; box.querySelector("[data-st-roots]").innerHTML = rootsHtml(); refreshScan(); return dirty(box); }
    const tg = t.closest("[data-st-target]");
    if (tg) { state.target = tg.dataset.stTarget; for (const b of tg.parentElement.children) b.setAttribute("aria-selected", b === tg); const p = tg.closest(".knob-box").querySelector("[data-st-tgt]"); p.textContent = `管理目标 ${D.targets[state.target]} · 尚未检查版本与目标`; flash(p); return; }
    if (t.closest("[data-st-check]")) return toast("稿件：不检查版本与目标");
    if (t.closest("[data-st-addtarget]")) return toast("稿件：不添加目标（正式页在这里选程序与 Home / Profile）");
  });
  lcdAll(document);
  syncCount();
})();
