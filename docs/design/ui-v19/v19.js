// UI v19 · 世界总览二、三的动效。只在状态变化和操作反馈时动，按帧（steps），减少动态效果时直接到位。
// · 液晶读数：时钟每分钟翻页；计数进场从 00 按帧跳到真实数。
// · 记一笔：数据点从命令行飞进随手记面板，面板指示灯闪两下，新的一行按帧展开，计数 +1，暴龙机里的蛋接住。
// · 复制：数据点飞向左下角伙伴屏（沿用全站的"数据飞入"），蛋接住，出战次数 +1。
// · 继续：暴龙机里的蛋跳一下，这一行闪两下。
(() => {
const reduced = (() => { try { return matchMedia("(prefers-reduced-motion: reduce)").matches; } catch { return true; } })();
const STEP = { easing: "steps(1, end)" };
const G = {
  0: "01110100011001110101110011000101110", 1: "00100011000010000100001000010001110", 2: "01110100010000100010001000100011111",
  3: "11111000100010000010000011000101110", 4: "00010001100101010010111110001000010", 5: "11111100001111000001000011000101110",
  6: "00110010001000011110100011000101110", 7: "11111000010001000100010000100001000", 8: "01110100011000101110100011000101110",
  9: "01110100011000101111000010001001100", ":": "00000011000110000000011000110000000", "/": "00001000010001000100010001000010000",
};
const pad2 = (n) => String(n).padStart(2, "0");

function lcdSvg(text) {
  let off = "", on = "";
  [...text].forEach((ch, i) => {
    for (let y = 0; y < 7; y++) for (let x = 0; x < 5; x++) {
      const r = `<rect x="${i * 6 + x}" y="${y}" width=".75" height=".75"/>`;
      off += r;
      if ((G[ch] || "")[y * 5 + x] === "1") on += r;
    }
  });
  return `<svg viewBox="0 0 ${text.length * 6 - 1} 7" role="img" aria-label="${text}"><g class="off">${off}</g><g class="on">${on}</g></svg>`;
}
function render(el, text, roll = false) {
  el.innerHTML = lcdSvg(text);
  el.dataset.text = text;
  if (roll && !reduced)
    el.firstElementChild.animate([3, 2, 1, 0].map((k, i) => ({ offset: i / 3, clipPath: `inset(0 0 ${k * 33}% 0)`, ...STEP })).concat({ clipPath: "inset(0 0 0 0)" }), { duration: 160 });
}
for (const el of document.querySelectorAll("[data-lcd]")) {
  if ("clock" in el.dataset) {
    const now = () => { const d = new Date(); return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`; };
    render(el, now());
    setTimeout(() => { render(el, now(), true); setInterval(() => render(el, now(), true), 60000); }, (60 - new Date().getSeconds()) * 1000);
  } else if (el.dataset.roll != null) {
    const n = Number(el.dataset.roll), steps = Math.min(n, 5);
    if (reduced || !n) render(el, pad2(n));
    else { let k = 0; render(el, "00"); const id = setInterval(() => { k++; render(el, pad2(Math.round(n * k / steps)), true); if (k >= steps) clearInterval(id); }, 70); }
  } else render(el, el.dataset.text || "00");
  el.addEventListener("lcd", (e) => render(el, e.detail, true));
}

const stage = () => document.querySelector('canvas[data-partner="stage"]')?.__lcd;
function fly(from, to, color = "#ff8a24") {
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
function blink(el, times = 2) {
  if (!el) return;
  if (reduced) return el.classList.add("on");
  let k = 0;
  const id = setInterval(() => { el.classList.toggle("on"); if (++k >= times * 2) { clearInterval(id); el.classList.add("on"); } }, 110);
}
function flash(el) {
  if (!el || reduced) return;
  const on = "rgba(255, 138, 36, 0.22)";
  el.animate([{ background: on, ...STEP }, { offset: 0.5, background: "transparent", ...STEP }, { background: on, ...STEP }].concat({ background: "transparent" }), { duration: 360 });
}
function reveal(row) {
  if (reduced) return;
  const h = row.offsetHeight;
  row.animate([0, 1, 2].map((k) => ({ offset: k / 3, height: `${Math.round(h * k / 3)}px`, opacity: k ? 1 : 0, overflow: "hidden", ...STEP })).concat({ height: `${h}px`, opacity: 1 }), { duration: 200 });
}

// 记一笔
for (const form of document.querySelectorAll("form[data-cmd]")) {
  const input = form.querySelector("input");
  input.addEventListener("keydown", (e) => { if ((e.metaKey || e.ctrlKey) && e.key === "Enter") { e.preventDefault(); form.requestSubmit(); } });
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const text = input.value.trim();
    if (!text) return;
    input.value = "";
    const list = document.querySelector("[data-notes-list]"), tpl = list.querySelector("template"), panel = list.closest("[data-panel]");
    const row = tpl.content.firstElementChild.cloneNode(true);
    row.querySelector("b").textContent = text;
    await fly(form.querySelector("button"), panel.querySelector("[data-led]") || panel.querySelector("header, .label"));
    blink(panel.querySelector("[data-led]"));
    tpl.after(row);
    reveal(row);
    const rows = list.querySelectorAll(".row");
    if (rows.length > Number(list.dataset.keep || 4)) rows[rows.length - 1].remove();
    for (const c of document.querySelectorAll("[data-notes-count]")) render(c, pad2(Number(c.dataset.text) + 1), true);
    stage()?.catchData?.();
  });
}

document.addEventListener("click", async (e) => {
  const copy = e.target.closest("[data-copy]");
  if (copy) {
    const row = copy.closest(".row"), label = copy.querySelector("span");
    try { await navigator.clipboard?.writeText(row?.querySelector("b")?.textContent || ""); } catch {}
    copy.classList.add("done");
    if (label) label.textContent = "已复制";
    setTimeout(() => { copy.classList.remove("done"); if (label) label.textContent = "复制"; }, 1600);
    await fly(copy, document.querySelector("[data-partner-screen]"), "#4de3ff");
    dispatchEvent(new Event("guiji:data-caught"));
    const u = row?.querySelector("[data-uses]");
    if (u) render(u, pad2(Number(u.dataset.text) + 1), true);
    return;
  }
  const go = e.target.closest("[data-continue]");
  if (go) { flash(go.closest(".row")); stage()?.poke?.(); }
});

// 进场：随手记今天有新东西，指示灯亮一次
setTimeout(() => blink(document.querySelector('[data-panel="notes"] [data-led]'), 1), 900);
})();

// ---------- 随手记 二 / 三 ----------
(() => {
  const reduced = (() => { try { return matchMedia("(prefers-reduced-motion: reduce)").matches; } catch { return true; } })();
  const STEP = { easing: "steps(1, end)" };
  const pad2 = (n) => String(n).padStart(2, "0");
  const list = document.querySelector("[data-note-list]");
  if (!list || !document.querySelector("[data-compose]")) return;
  const esc = (s) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  // 正文：`1. ` 编号、`- ` 无序，空行分段；和 make.py 的 md_html 同一规则
  function mdHtml(text) {
    const out = []; let para = [], lst = null;
    const closeList = () => { if (lst) { out.push(`</${lst}>`); lst = null; } };
    const closePara = () => { if (para.length) { out.push(`<p>${para.join("<br>")}</p>`); para = []; } };
    for (const raw of text.split("\n")) {
      const line = raw.trim();
      const ol = /^(\d+)[.．、]\s*(.*)$/.exec(line), ul = /^[-•]\s+(.*)$/.exec(line);
      if (ol || ul) { closePara(); const kind = ol ? "ol" : "ul"; if (lst !== kind) { closeList(); lst = kind; out.push(`<${kind}>`); } out.push(`<li>${esc(ol ? ol[2] : ul[1])}</li>`); }
      else if (!line) { closeList(); closePara(); }
      else { closeList(); para.push(esc(line)); }
    }
    closeList(); closePara();
    return out.join("");
  }
  const lcds = (sel) => document.querySelectorAll(sel);
  const renderLcd = (el, n) => { el.dataset.text = pad2(n); el.innerHTML = el.innerHTML; };
  function bump(key, delta) {
    const sel = key === "egg" ? "[data-notes-count]" : `[data-count="${key}"]`;
    for (const el of lcds(sel)) {
      const n = Number(el.dataset.text || el.dataset.roll || 0) + delta;
      if (el.matches("[data-lcd]")) { el.dataset.text = pad2(n); el.dispatchEvent(new CustomEvent("lcd", { detail: pad2(n) })); }
      else el.textContent = n;
    }
    for (const el of lcds(key === "egg" ? "[data-notes-count-plain]" : `[data-count-plain="${key}"]`)) el.textContent = Number(el.textContent) + delta;
  }
  const navLink = (label) => [...document.querySelectorAll(".side .nav a")].find((a) => a.textContent.includes(label));
  function fly(from, to, color = "#ff8a24") {
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
  const flash = (el) => { if (!el || reduced) return; const on = "rgba(255, 138, 36, 0.22)"; el.animate([{ background: on, ...STEP }, { offset: 0.5, background: "transparent", ...STEP }, { background: on, ...STEP }].concat({ background: "transparent" }), { duration: 360 }); };
  const reveal = (el) => { if (reduced) return; const h = el.offsetHeight; el.animate([0, 1, 2].map((k) => ({ offset: k / 3, height: `${Math.round(h * k / 3)}px`, opacity: k ? 1 : 0, overflow: "hidden", ...STEP })).concat({ height: `${h}px`, opacity: 1 }), { duration: 200 }); };
  const collapse = (el) => new Promise((done) => { if (reduced) return done(); const h = el.offsetHeight; el.style.overflow = "hidden"; el.animate([0, 1, 2].map((k) => ({ offset: k / 3, height: `${Math.round(h * (3 - k) / 3)}px`, opacity: 1 - k / 3, ...STEP })).concat({ height: "0px", opacity: 0, marginBottom: "0px" }), { duration: 200, fill: "forwards" }).onfinish = done; });
  const stateText = { egg: "待孵化", delivered: "已投递", hatched: "已孵成", refined: "已炼", archived: "已归档" };
  const stateChip = (item, state, extra) => {
    const chip = item.querySelector("header .chip, :scope > span:last-child");
    if (!chip) return;
    chip.className = "chip" + (state === "delivered" ? " lcd-chip" : "");
    chip.textContent = stateText[state] + (extra ? ` · ${extra}` : "");
  };

  // 二：数据与右侧读页
  const dataEl = document.getElementById("notes-data");
  const notes = dataEl ? JSON.parse(dataEl.textContent) : null;
  const pane = document.querySelector("[data-pane]");
  let currentId = list.querySelector(".row.on")?.dataset.id || null;
  function showPane(id) {
    const n = notes?.[id];
    if (!pane || !n) return;
    currentId = id;
    pane.querySelector("[data-pane-time]").textContent = n.time;
    const chip = pane.querySelector("[data-pane-state]");
    chip.className = "chip" + (n.state === "delivered" ? " lcd-chip" : "");
    chip.textContent = stateText[n.state] + (n.route ? ` · ${n.route}` : "");
    const body = pane.querySelector("[data-pane-body]");
    body.innerHTML = n.html;
    pane.querySelector("[data-pane-lines]").textContent = n.lines;
    if (!reduced) body.animate([{ clipPath: "inset(0 0 100% 0)", ...STEP }, { offset: 0.5, clipPath: "inset(0 0 50% 0)", ...STEP }, { clipPath: "inset(0 0 0 0)" }], { duration: 120 });
  }
  list.addEventListener("click", (e) => {
    const row = e.target.closest(".row[data-id]");
    if (!row || e.target.closest("button")) return;
    list.querySelectorAll(".row.on").forEach((r) => r.classList.remove("on"));
    row.classList.add("on");
    showPane(row.dataset.id);
  });

  // 记一笔 / 贴一张
  for (const form of document.querySelectorAll("form[data-compose]")) {
    const field = form.querySelector("input, textarea");
    field.addEventListener("keydown", (e) => { if ((e.metaKey || e.ctrlKey) && e.key === "Enter") { e.preventDefault(); form.requestSubmit(); } });
    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      const text = field.value.trim();
      if (!text) return;
      field.value = "";
      const tpl = list.querySelector("template"), item = tpl.content.firstElementChild.cloneNode(true);
      const id = "new-" + Date.now();
      item.dataset.id = id;
      const first = text.split("\n").find((l) => l.trim())?.replace(/^\s*(\d+[.．、]|[-•])\s*/, "") || text;
      if (item.querySelector("b")) item.querySelector("b").textContent = first;
      if (item.querySelector(".body")) item.querySelector(".body").innerHTML = mdHtml(text);
      const lines = text.split("\n").filter((l) => l.trim()).length;
      if (item.querySelector("small")) item.querySelector("small").textContent = `刚刚 · ${lines} 行`;
      if (lines > 6 || text.length > 170) { item.classList.add("long"); const more = document.createElement("button"); more.className = "more"; more.dataset.more = ""; more.textContent = "展开"; item.querySelector(".body")?.after(more); }
      if (notes) notes[id] = { time: "刚刚", state: "egg", route: null, lines, html: mdHtml(text), text };
      await fly(form.querySelector("button"), document.querySelector("[data-partner-screen]"), "#a6e36e");
      dispatchEvent(new Event("guiji:data-caught"));
      const anchor = form.closest("[data-note-list]") ? form : tpl;
      anchor.after(item);
      reveal(item);
      bump("egg", 1); bump("all", 1);
      if (pane) { list.querySelectorAll(".row.on").forEach((r) => r.classList.remove("on")); item.classList.add("on"); showPane(id); }
    });
  }

  // 四个去向 + 复制 + 展开
  function currentItem(btn) {
    const inList = btn.closest("[data-id]");
    if (inList) return inList;
    return list.querySelector(`[data-id="${currentId}"]`);
  }
  async function setState(item, state, extra, target, color) {
    const was = item.dataset.state;
    item.dataset.state = state;
    stateChip(item, state, extra);
    if (notes?.[item.dataset.id]) { notes[item.dataset.id].state = state; notes[item.dataset.id].route = extra || null; }
    if (pane && item.dataset.id === currentId) { const chip = pane.querySelector("[data-pane-state]"); chip.className = "chip" + (state === "delivered" ? " lcd-chip" : ""); chip.textContent = stateText[state] + (extra ? ` · ${extra}` : ""); }
    if (was === "egg") bump("egg", -1);
    if (state === "delivered") bump("delivered", 1);
    if (state === "archived") bump("archived", 1);
    if (target) { await fly(item.matches(".row") ? pane?.querySelector(".acts") || item : item.querySelector(".acts") || item, target, color); flash(target); }
  }
  document.addEventListener("click", async (e) => {
    const more = e.target.closest("[data-more]");
    if (more) {
      const card = more.closest(".card"), body = card.querySelector(".body");
      const open = card.classList.toggle("open");
      more.textContent = open ? "收起" : "展开";
      if (!reduced) { const h0 = open ? 168 : body.scrollHeight, h1 = open ? body.scrollHeight : 168; body.animate([0, 1, 2].map((k) => ({ offset: k / 3, maxHeight: `${Math.round(h0 + (h1 - h0) * k / 3)}px`, overflow: "hidden", ...STEP })).concat({ maxHeight: `${h1}px`, overflow: "hidden" }), { duration: 180 }); }
      return;
    }
    const copyBtn = e.target.closest("[data-copy], [data-copy-pane]");
    if (copyBtn) {
      const item = currentItem(copyBtn);
      const text = notes?.[item?.dataset.id]?.text || item?.querySelector(".body")?.innerText || "";
      try { await navigator.clipboard?.writeText(text); } catch {}
      const label = copyBtn.textContent; copyBtn.textContent = "已复制"; copyBtn.classList.add("done");
      setTimeout(() => { copyBtn.textContent = label; copyBtn.classList.remove("done"); }, 1600);
      await fly(copyBtn, document.querySelector("[data-partner-screen]"), "#4de3ff");
      dispatchEvent(new Event("guiji:data-caught"));
      return;
    }
    const proj = e.target.closest("[data-project]");
    if (proj) {
      const menu = proj.closest(".menu"); menu.hidden = true;
      const item = menu.closest("[data-id]") || list.querySelector(`[data-id="${currentId}"]`);
      item?.classList.remove("busy");
      await setState(item, "delivered", proj.dataset.project, navLink("项目空间"), "#ff8a24");
      return;
    }
    const act = e.target.closest("[data-go]");
    if (!act) { document.querySelectorAll(".menu:not([hidden])").forEach((m) => { m.hidden = true; m.closest(".card")?.classList.remove("busy"); }); return; }
    const item = currentItem(act);
    if (!item) return;
    if (act.dataset.go === "deliver") {
      let menu = act.closest(".pane")?.querySelector("[data-deliver-menu]") || item.querySelector(".menu");
      if (!menu) { menu = document.createElement("div"); menu.className = "menu"; menu.innerHTML = '<button data-project="牛马之家">牛马之家 · SLOT 01</button><button data-project="数码世界">数码世界 · SLOT 02</button>'; item.appendChild(menu); item.classList.add("busy"); }
      menu.hidden = !menu.hidden;
      return;
    }
    if (act.dataset.go === "hatch") { const nav = navLink("资产仓库"); await setState(item, "hatched", null, nav, "#ff8a24"); const i = nav?.querySelector("i"); if (i) i.textContent = Number(i.textContent) + 1; return; }
    if (act.dataset.go === "refine") { await setState(item, "refined", "心法", navLink("资产仓库"), "#ff6a3d"); return; }
    if (act.dataset.go === "archive") {
      await setState(item, "archived", null, null);
      if (item.matches(".row")) {
        const next = item.nextElementSibling?.matches("[data-id]") ? item.nextElementSibling : item.previousElementSibling?.matches?.("[data-id]") ? item.previousElementSibling : null;
        await collapse(item); item.setAttribute("data-hide", ""); item.classList.remove("on");
        if (next) { next.classList.add("on"); showPane(next.dataset.id); }
      } else { await collapse(item); item.setAttribute("data-hide", ""); }
      applyFilter();
    }
  });

  // 筛选
  let filter = "all";
  function applyFilter() {
    for (const item of list.querySelectorAll("[data-id]")) {
      const st = item.dataset.state;
      const show = filter === "all" ? st !== "archived" : filter === "egg" ? st === "egg" : st === filter;
      if (show) item.removeAttribute("data-hide"); else item.setAttribute("data-hide", "");
    }
  }
  document.querySelectorAll("[data-filter]").forEach((b) => b.addEventListener("click", () => {
    filter = b.dataset.filter;
    b.closest(".seg").querySelectorAll("button").forEach((x) => x.classList.toggle("on", x === b));
    applyFilter();
  }));
})();

// ---------- 个人收藏 二 / 三 ----------
// · 分组筛选 / 类型筛选 / 搜索：不符合的卡片或行直接隐藏，分组读数按帧翻页。
// · 点开：二在右侧抽屉按帧滑入；三在右栏按帧揭开正文。
// · 孵化：投递 → 选项目后数据点飞向侧栏"项目空间"；孵成资产 / 焚决 → 飞向"资产仓库"（孵成时徽标 +1）；卡片得到状态片。
// · 移入分组：数据点飞向目标分组，两边读数翻页；三里这一行按帧收起、再在目标分组下展开。
// · 复制链接：飞向伙伴屏、蛋接住。本地删除：选几条、按帧收起。Agent / 插件：弹层。
(() => {
  const root = document.querySelector("main[data-collection]");
  if (!root) return;
  const reduced = (() => { try { return matchMedia("(prefers-reduced-motion: reduce)").matches; } catch { return true; } })();
  const STEP = { easing: "steps(1, end)" };
  const pad2 = (n) => String(n).padStart(2, "0");
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const data = JSON.parse(document.getElementById("collection-data").textContent);
  const items = () => [...root.querySelectorAll("[data-id]")];
  const live = () => items().filter((el) => !el.hasAttribute("data-gone"));
  const visible = () => items().filter((el) => !el.hasAttribute("data-hide"));
  const byId = (id) => root.querySelector(`[data-id="${id}"]`);
  const navLink = (label) => [...document.querySelectorAll(".side .nav a")].find((a) => a.textContent.includes(label));
  const lcdSet = (el, n) => { el.dataset.text = pad2(n); el.dispatchEvent(new CustomEvent("lcd", { detail: pad2(n) })); };
  function fly(from, to, color = "#ff8a24") {
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
  const flash = (el) => { if (!el || reduced) return; const on = "rgba(255, 138, 36, 0.22)"; el.animate([{ background: on, ...STEP }, { offset: 0.5, background: "transparent", ...STEP }, { background: on, ...STEP }].concat({ background: "transparent" }), { duration: 360 }); };
  const reveal = (el) => { if (reduced) return; const h = el.offsetHeight; el.animate([0, 1, 2].map((k) => ({ offset: k / 3, height: `${Math.round(h * k / 3)}px`, opacity: k ? 1 : 0, overflow: "hidden", ...STEP })).concat({ height: `${h}px`, opacity: 1 }), { duration: 200 }); };
  const collapse = (el) => new Promise((done) => { if (reduced) return done(); const h = el.offsetHeight; el.animate([0, 1, 2].map((k) => ({ offset: k / 3, height: `${Math.round(h * (3 - k) / 3)}px`, opacity: 1 - k / 3, overflow: "hidden", ...STEP })).concat({ height: "0px", opacity: 0, overflow: "hidden" }), { duration: 200, fill: "forwards" }).onfinish = done; });
  const unfreeze = (el) => el.getAnimations().forEach((a) => a.cancel());
  const slideIn = (el) => { if (reduced) return; el.animate([0, 1, 2].map((k) => ({ offset: k / 3, transform: `translateX(${Math.round(560 * (3 - k) / 3)}px)`, ...STEP })).concat({ transform: "translateX(0)" }), { duration: 180 }); };
  const slideOut = (el) => new Promise((done) => { if (reduced) return done(); el.animate([0, 1, 2].map((k) => ({ offset: k / 3, transform: `translateX(${Math.round(560 * k / 3)}px)`, ...STEP })).concat({ transform: "translateX(560px)" }), { duration: 150, fill: "forwards" }).onfinish = () => { unfreeze(el); done(); }; });

  // 读数：分组栏 / 分组标题 / 顶部三个
  function recount() {
    const all = live();
    for (const el of root.querySelectorAll("[data-gcount]")) { const g = el.dataset.gcount; lcdSet(el, g === "all" ? all.length : all.filter((x) => x.dataset.group === g).length); }
    for (const el of root.querySelectorAll("[data-ccount]")) { const k = el.dataset.ccount; lcdSet(el, k === "all" ? all.length : all.filter((x) => k === "loose" ? x.dataset.group === "散放" : x.dataset.type === "video").length); }
    for (const gh of root.querySelectorAll("[data-gh]")) { const empty = !all.some((x) => x.dataset.group === gh.dataset.gh); gh.classList.toggle("empty", empty); const s = gh.querySelector("small"); if (empty && !s) gh.insertAdjacentHTML("beforeend", "<small>空</small>"); if (!empty && s) s.remove(); }
    const badge = navLink("个人收藏")?.querySelector("i");
    if (badge) badge.textContent = all.length;
  }

  // 筛选 + 搜索
  let group = "all", type = "all", q = "";
  function apply() {
    for (const el of items()) {
      const n = data.notes[el.dataset.id];
      const ok = !el.hasAttribute("data-gone") && (group === "all" || el.dataset.group === group) && (type === "all" || el.dataset.type === type) && (!q || n.search.includes(q));
      el.toggleAttribute("data-hide", !ok);
    }
    for (const gh of root.querySelectorAll("[data-gh]")) gh.toggleAttribute("data-hide", (group !== "all" && gh.dataset.gh !== group) || ((q || type !== "all") && !items().some((x) => x.dataset.group === gh.dataset.gh && !x.hasAttribute("data-hide"))));
    const fc = root.querySelector("[data-find-count]");
    if (fc) { fc.hidden = !q; fc.textContent = `${visible().length} 条`; }
  }
  const segOn = (b) => b.parentElement.querySelectorAll("button").forEach((x) => x.classList.toggle("on", x === b));
  root.querySelectorAll("[data-group-filter]").forEach((b) => b.addEventListener("click", () => { group = b.dataset.groupFilter; segOn(b); apply(); }));
  root.querySelectorAll("[data-type-filter]").forEach((b) => b.addEventListener("click", () => { type = b.dataset.typeFilter; segOn(b); apply(); }));
  const find = root.querySelector("[data-find]");
  find?.addEventListener("input", () => { q = find.value.trim().toLowerCase(); apply(); });

  // 读页：二是抽屉，三是右栏
  const pane = root.querySelector("[data-pane]"), drawer = root.querySelector("[data-drawer]"), reader = pane || drawer;
  let currentId = root.querySelector(".row.on")?.dataset.id || null, tab = "content";
  function render(id, fresh = false) {
    const n = data.notes[id];
    if (!reader || !n) return;
    currentId = id;
    const el = reader, item = byId(id);
    el.querySelector("[data-r-cat]").textContent = n.category;
    const link = el.querySelector("[data-r-link]"); if (link) link.href = n.url || "#";
    el.querySelector("[data-r-img]").src = n.cover;
    const mark = el.querySelector("[data-r-mark]");
    mark.hidden = n.type !== "video"; mark.innerHTML = n.type === "video" ? `<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><polygon points="6 3 20 12 6 21 6 3"/></svg>${n.dur}` : "";
    const pager = el.querySelector("[data-r-pager]"); pager.hidden = n.type === "video" || n.images < 2; pager.textContent = `01 / ${pad2(n.images)}`;
    el.querySelector("[data-r-title]").textContent = n.title;
    el.querySelector("[data-r-meta]").innerHTML = `<span>@${esc(n.author)}</span><span>${n.time}</span><span>${n.type === "video" ? "视频 " + n.dur : "图文 " + n.images + " 张"}</span><span>${esc(n.host)}</span>`;
    const st = el.querySelector("[data-r-state]"), chip = item?.querySelector("[data-state-chip]");
    if (st) { st.hidden = !chip || chip.hidden; st.className = chip ? chip.className : "chip state"; st.textContent = chip?.textContent || ""; }
    if ((tab === "transcript" && !n.transcript) || (tab === "analysis" && !n.analysis)) tab = "content";
    el.querySelectorAll("[data-tab]").forEach((b) => { b.classList.toggle("on", b.dataset.tab === tab); b.hidden = (b.dataset.tab === "transcript" && !n.transcript) || (b.dataset.tab === "analysis" && !n.analysis); });
    const body = el.querySelector("[data-r-body]");
    body.textContent = tab === "content" ? (n.content || "（这条没有正文）") : tab === "transcript" ? n.transcript + (n.transcriptChars > n.transcript.length ? " ……" : "") : "已保存 Get 笔记解析；正式页在这里读解析全文（预览没抓取解析正文）。";
    el.querySelector("[data-r-tags]").innerHTML = n.tags.map((t) => `<span>#${esc(t)}</span>`).join("");
    el.querySelector("[data-r-foot]").textContent = `来源 ${n.host} · 收藏于 ${n.time} · ` + (n.type === "video" ? `文稿 ${n.transcriptChars} 字` : `图片文字 ${n.ocrChars} 字`);
    if (fresh && !reduced) body.animate([{ clipPath: "inset(0 0 100% 0)", ...STEP }, { offset: 0.5, clipPath: "inset(0 0 50% 0)", ...STEP }, { clipPath: "inset(0 0 0 0)" }], { duration: 120 });
  }
  function closeDrawer() {
    if (!drawer || drawer.hidden) return;
    root.querySelectorAll(".card.on").forEach((c) => c.classList.remove("on"));
    slideOut(drawer).then(() => { drawer.hidden = true; });
  }
  if (pane && currentId) render(currentId);
  root.querySelectorAll("[data-tab]").forEach((b) => b.addEventListener("click", () => { tab = b.dataset.tab; if (currentId) render(currentId, true); }));
  addEventListener("keydown", (e) => { if (e.key === "Escape") { closeMenus(); closeDrawer(); const s = root.querySelector(".sheet"); if (s) s.hidden = true; } });

  // 菜单
  function closeMenus() { root.querySelectorAll(".menu.pop").forEach((m) => m.remove()); root.querySelectorAll(".busy").forEach((x) => x.classList.remove("busy")); }
  function popMenu(anchor, html) {
    closeMenus();
    const host = anchor.closest(".card") || anchor.closest(".drawer") || anchor.closest(".pane");
    const m = document.createElement("div");
    m.className = "menu pop"; m.innerHTML = html; host.appendChild(m); host.classList.add("busy");
    return m;
  }
  const target = (btn) => btn.closest("[data-id]") || byId(currentId);
  const stateText = { delivered: "已投递", hatched: "已孵成", refined: "已炼" };
  async function setState(item, state, extra, to, color) {
    if (!item) return;
    const chip = item.querySelector("[data-state-chip]");
    chip.hidden = false; chip.className = "chip state" + (state === "delivered" ? " lcd-chip" : ""); chip.textContent = stateText[state] + (extra ? ` · ${extra}` : "");
    item.dataset.state = state;
    if (reader && item.dataset.id === currentId) { const s = reader.querySelector("[data-r-state]"); if (s) { s.hidden = false; s.className = chip.className; s.textContent = chip.textContent; } }
    const from = reader && !reader.hidden && item.dataset.id === currentId ? reader.querySelector(".reader-head .acts") : item;
    await fly(from, to, color); flash(to);
  }
  function updateSelectKey() {
    const k = root.querySelector("[data-select-toggle]"), n = root.querySelectorAll("[data-id].sel").length;
    k.textContent = root.classList.contains("selecting") ? (n ? `从本机删除 ${n} 条` : "选好后再点一次") : "本地删除";
    k.classList.toggle("danger", n > 0);
  }
  async function remove(list) {
    list = list.filter(Boolean);
    for (const item of list) { item.setAttribute("data-gone", ""); item.classList.remove("sel", "on"); }
    await Promise.all(list.map(collapse));
    list.forEach((item) => item.setAttribute("data-hide", ""));
    recount(); apply();
    if (list.some((i) => i.dataset.id === currentId)) {
      const next = visible()[0];
      if (pane && next) { next.classList.add("on"); render(next.dataset.id, true); } else closeDrawer();
    }
  }
  async function moveTo(item, g) {
    const dest = root.querySelector(`[data-gcount="${g}"]`)?.closest("button, .gh");
    await fly(item.querySelector(".cover, .thumb") || item, dest, "#4de3ff"); flash(dest);
    item.dataset.group = g;
    if (pane) { const gh = root.querySelector(`[data-gh="${g}"]`); await collapse(item); unfreeze(item); gh.after(item); reveal(item); item.scrollIntoView({ block: "nearest" }); }
    recount(); apply();
    if (!reduced && group !== "all" && item.hasAttribute("data-hide")) { /* 筛选着别的分组：它已经走了 */ }
  }
  function openSheet(kind) { const s = root.querySelector(".sheet"); s.hidden = false; s.querySelectorAll("[data-kind]").forEach((d) => { d.hidden = d.dataset.kind !== kind; }); }

  root.addEventListener("click", async (e) => {
    const t = e.target;
    if (t.closest(".menu")) {
      const route = t.closest("[data-route]"), proj = t.closest("[data-proj]"), to = t.closest("[data-to]"), m = t.closest(".menu");
      const item = m.closest("[data-id]") || byId(currentId);
      if (route?.dataset.route === "deliver") { m.innerHTML = '<button data-proj="牛马之家">牛马之家 · SLOT 01</button><button data-proj="数码世界">数码世界 · SLOT 02</button>'; return; }
      closeMenus();
      if (route?.dataset.route === "asset") { const nav = navLink("资产仓库"); await setState(item, "hatched", null, nav, "#ff8a24"); const i = nav?.querySelector("i"); if (i) i.textContent = Number(i.textContent) + 1; }
      else if (route?.dataset.route === "refine") await setState(item, "refined", "心法", navLink("资产仓库"), "#ff6a3d");
      else if (proj) await setState(item, "delivered", proj.dataset.proj, navLink("项目空间"), "#ff8a24");
      else if (to) await moveTo(item, to.dataset.to);
      else if (t.closest("[data-delete-confirm]")) await remove([item]);
      return;
    }
    const sel = t.closest("[data-id]");
    if (root.classList.contains("selecting") && sel && !t.closest("button, a")) { sel.classList.toggle("sel"); updateSelectKey(); return; }
    const hatch = t.closest("[data-hatch]");
    if (hatch) { if (hatch.closest(".busy")) return closeMenus(); popMenu(hatch, '<button data-route="deliver">投递到项目 ▸</button><button data-route="asset">孵成资产</button><button data-route="refine">收入焚决</button>'); return; }
    const regroup = t.closest("[data-regroup]");
    if (regroup) { if (regroup.closest(".busy")) return closeMenus(); const item = target(regroup); popMenu(regroup, data.groups.filter((g) => g !== item?.dataset.group).map((g) => `<button data-to="${esc(g)}">${esc(g)}</button>`).join("")); return; }
    const del = t.closest("[data-delete]");
    if (del) { if (del.closest(".busy")) return closeMenus(); popMenu(del, '<button data-delete-confirm>从本机删除这条</button><button data-menu-cancel>取消</button>'); return; }
    const copy = t.closest("[data-copy-link]");
    if (copy) {
      const n = data.notes[target(copy)?.dataset.id];
      try { await navigator.clipboard?.writeText(n?.url || ""); } catch {}
      const label = copy.textContent; copy.textContent = "已复制"; copy.classList.add("done");
      setTimeout(() => { copy.textContent = label; copy.classList.remove("done"); }, 1600);
      await fly(copy, document.querySelector("[data-partner-screen]"), "#4de3ff");
      dispatchEvent(new Event("guiji:data-caught"));
      return;
    }
    if (t.closest("[data-close]")) return closeDrawer();
    const sheet = t.closest("[data-sheet]");
    if (sheet) return openSheet(sheet.dataset.sheet);
    if (t.closest("[data-sheet-close]") || t.matches(".sheet")) { root.querySelector(".sheet").hidden = true; return; }
    const selKey = t.closest("[data-select-toggle]");
    if (selKey) {
      const picked = [...root.querySelectorAll("[data-id].sel")];
      if (root.classList.contains("selecting") && picked.length) { await remove(picked); root.classList.remove("selecting"); }
      else root.classList.toggle("selecting");
      updateSelectKey(); return;
    }
    if (t.closest("[data-add-group]")) { const b = t.closest("[data-add-group]"); flash(b); return; }
    closeMenus();
    const open = t.closest("[data-open]") || (pane && t.closest(".row[data-id]"));
    if (open && !t.closest("button, a")) {
      const item = open.closest("[data-id]");
      root.querySelectorAll("[data-id].on").forEach((r) => r.classList.remove("on")); item.classList.add("on");
      tab = "content"; render(item.dataset.id, true);
      if (drawer && drawer.hidden) { drawer.hidden = false; slideIn(drawer); }
    }
  });
})();

// ---------- 资产仓库 二 / 三 ----------
// · 复制：数据点飞向伙伴屏、蛋接住；这一件的出战液晶 +1，顶部出战总数 +1；成长期的件复制成功后进成熟期（第三格亮，和正式页的阶段规则一致）。
// · 类型筛选 / 搜索 / 标签 / 排序：直接到位，读数按帧翻页。点名字 → 右侧抽屉按帧滑入，看全文、版本、出战。
// · 新建：类型菜单。置顶：搬到最前并闪一下。删除：确认后按帧收起。
(() => {
  const root = document.querySelector("main[data-assets]");
  if (!root) return;
  const reduced = (() => { try { return matchMedia("(prefers-reduced-motion: reduce)").matches; } catch { return true; } })();
  const STEP = { easing: "steps(1, end)" };
  const pad2 = (n) => String(n).padStart(2, "0");
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const data = JSON.parse(document.getElementById("assets-data").textContent);
  const items = () => [...root.querySelectorAll("[data-id]")];
  const live = () => items().filter((el) => !el.hasAttribute("data-gone"));
  const byId = (id) => root.querySelector(`[data-id="${id}"]`);
  const subOf = (item) => root.querySelector(`[data-sub="${item.dataset.id}"]`);
  const lcdSet = (el, n) => { if (!el) return; el.dataset.text = pad2(n); el.dispatchEvent(new CustomEvent("lcd", { detail: pad2(n) })); };
  const lcdNum = (el) => Number(el?.dataset.text || 0);
  function fly(from, to, color = "#ff8a24") {
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
  const flash = (el) => { if (!el || reduced) return; const on = "rgba(255, 138, 36, 0.22)"; el.animate([{ background: on, ...STEP }, { offset: 0.5, background: "transparent", ...STEP }, { background: on, ...STEP }].concat({ background: "transparent" }), { duration: 360 }); };
  const collapse = (el) => new Promise((done) => { if (!el) return done(); if (reduced) return done(); const h = el.offsetHeight; el.animate([0, 1, 2].map((k) => ({ offset: k / 3, height: `${Math.round(h * (3 - k) / 3)}px`, opacity: 1 - k / 3, overflow: "hidden", ...STEP })).concat({ height: "0px", opacity: 0, overflow: "hidden" }), { duration: 200, fill: "forwards" }).onfinish = done; });
  const slideIn = (el) => { if (reduced) return; el.animate([0, 1, 2].map((k) => ({ offset: k / 3, transform: `translateX(${Math.round(560 * (3 - k) / 3)}px)`, ...STEP })).concat({ transform: "translateX(0)" }), { duration: 180 }); };
  const slideOut = (el) => new Promise((done) => { if (reduced) return done(); el.animate([0, 1, 2].map((k) => ({ offset: k / 3, transform: `translateX(${Math.round(560 * k / 3)}px)`, ...STEP })).concat({ transform: "translateX(560px)" }), { duration: 150, fill: "forwards" }).onfinish = () => { el.getAnimations().forEach((a) => a.cancel()); done(); }; });
  const stageCells = { "成长期": 2, "成熟期": 3, "完全体": 5 };
  function setStage(bar, stage) {
    if (!bar) return;
    bar.querySelectorAll("i").forEach((i, k) => i.classList.toggle("on", k < stageCells[stage]));
    const name = bar.querySelector("small, [data-stage-name]"); if (name) name.textContent = stage;
    if (!reduced) bar.querySelectorAll("i.on").forEach((i, k) => i.animate([{ opacity: 0, ...STEP }, { offset: 0.5, opacity: 1, ...STEP }, { opacity: 0, ...STEP }, { opacity: 1 }], { duration: 300, delay: k * 40 }));
  }
  function recount() {
    const all = live();
    lcdSet(root.querySelector('[data-acount="all"]'), all.length);
    lcdSet(root.querySelector('[data-acount="mature"]'), all.filter((x) => x.dataset.stage !== "成长期").length);
    for (const el of root.querySelectorAll("[data-tcount]")) { const t = el.dataset.tcount; lcdSet(el, t === "all" ? all.length : all.filter((x) => x.dataset.type === t).length); }
    const badge = [...document.querySelectorAll(".side .nav a")].find((a) => a.textContent.includes("资产仓库"))?.querySelector("i");
    if (badge) badge.textContent = all.length;
  }

  // 筛选 / 搜索 / 标签 / 排序
  let type = "all", q = "", tag = "";
  function apply() {
    for (const el of items()) {
      const d = data.items[el.dataset.id] || {};
      const hay = [d.name, d.desc, d.body, ...(d.tags || []), ...((d.entries || []).flatMap((e) => [e.name, e.text]))].join(" ").toLowerCase();
      const ok = !el.hasAttribute("data-gone") && (type === "all" || el.dataset.type === type) && (!q || hay.includes(q)) && (!tag || (d.tags || []).includes(tag));
      el.toggleAttribute("data-hide", !ok);
      const sub = subOf(el); if (sub) sub.toggleAttribute("data-hide", !ok);
    }
    const fc = root.querySelector("[data-find-count]");
    if (fc) { fc.hidden = !q; fc.textContent = `${items().filter((x) => !x.hasAttribute("data-hide")).length} 件`; }
  }
  const segOn = (b) => b.parentElement.querySelectorAll("button").forEach((x) => x.classList.toggle("on", x === b));
  root.querySelectorAll("[data-type-filter]").forEach((b) => b.addEventListener("click", () => { type = b.dataset.typeFilter; segOn(b); apply(); }));
  const find = root.querySelector("[data-find]");
  find?.addEventListener("input", () => { q = find.value.trim().toLowerCase(); apply(); });
  const SORTS = { recent: ["最近更新", (a, b) => (b.dataset.at || "").localeCompare(a.dataset.at || "")], most: ["最常用", (a, b) => Number(b.dataset.uses) - Number(a.dataset.uses)], name: ["名称排序", (a, b) => a.dataset.name.localeCompare(b.dataset.name, "zh")] };
  function sortBy(key) {
    const list = items(); if (!list.length) return;
    const parent = list[0].parentElement, pinned = (a, b) => Number(b.classList.contains("pinned")) - Number(a.classList.contains("pinned"));
    list.sort((a, b) => pinned(a, b) || SORTS[key][1](a, b)).forEach((el) => { parent.appendChild(el); const sub = subOf(el); if (sub) parent.appendChild(sub); });
    root.querySelector("[data-sort]").textContent = `${SORTS[key][0]} ▾`;
    if (!reduced) list.slice(0, 3).forEach(flash);
  }

  // 抽屉
  const drawer = root.querySelector("[data-drawer]");
  let currentId = null;
  function render(id) {
    const d = data.items[id]; if (!d) return;
    currentId = id;
    const item = byId(id);
    drawer.querySelector("[data-r-type]").textContent = d.label; drawer.querySelector("[data-r-type]").className = "chip type t-" + d.type;
    drawer.querySelector("[data-r-code]").textContent = d.code;
    drawer.querySelector("[data-r-ver]").textContent = d.type === "Scroll" ? `${d.entries.length} 条` : `v${d.versions}`;
    drawer.querySelector("[data-r-title]").textContent = d.type === "Scroll" ? `焚决 · ${d.name}` : d.name;
    drawer.querySelector("[data-r-desc]").textContent = d.desc || (d.type === "Scroll" ? "卷里的每条心法都可以单独复制。" : "还没有一句话说明。");
    drawer.querySelector("[data-r-tags]").innerHTML = (d.tags || []).map((t) => `<span class="chip">${esc(t)}</span>`).join("");
    drawer.querySelector("[data-r-facts]").innerHTML = [d.at ? `更新 ${d.at.slice(0, 10)}` : "", d.createdAt ? `收录 ${d.createdAt.slice(0, 10)}` : "", d.type !== "Scroll" ? `${d.versions} 个版本` : "", `${(d.body || "").length || (d.entries || []).reduce((n, e) => n + e.text.length, 0)} 字`].filter(Boolean).map((t) => `<span>${esc(t)}</span>`).join("");
    drawer.querySelector("[data-r-body]").textContent = d.type === "Scroll" ? d.entries.map((e) => `${e.n} ${e.name}\n${e.text}`).join("\n\n") : (d.body || "（还没有正文）");
    lcdSet(drawer.querySelector("[data-r-uses]"), lcdNum(item?.querySelector("[data-uses]")));
    const st = drawer.querySelector("[data-r-stage]"); st.innerHTML = item?.querySelector("[data-stage-bar]")?.innerHTML || "";
    const pin = drawer.querySelector("[data-pin]"); pin.classList.toggle("pinned", !!item?.classList.contains("pinned")); pin.textContent = item?.classList.contains("pinned") ? "已置顶" : "置顶";
  }
  function closeDrawer() { if (drawer.hidden) return; root.querySelectorAll("[data-id].on").forEach((c) => c.classList.remove("on")); slideOut(drawer).then(() => { drawer.hidden = true; }); }
  addEventListener("keydown", (e) => { if (e.key === "Escape") { closeMenus(); closeDrawer(); } });

  // 菜单
  function closeMenus() { root.querySelectorAll(".menu.pop").forEach((m) => m.remove()); }
  function popMenu(anchor, html, host = anchor.parentElement) {
    closeMenus();
    const m = document.createElement("div"); m.className = "menu pop"; m.innerHTML = html;
    host.style.position = host.style.position || "relative"; host.appendChild(m);
    const r = anchor.getBoundingClientRect(), h = host.getBoundingClientRect();
    m.style.left = `${Math.round(r.left - h.left)}px`; m.style.top = `${Math.round(r.bottom - h.top + 6)}px`;
    return m;
  }

  // 复制：这是这页最常做的事
  async function copy(btn) {
    const entry = btn.closest("[data-entry]"), item = btn.closest("[data-id]") || byId(currentId);
    if (!item) return;
    const d = data.items[item.dataset.id];
    const text = entry ? d.entries.find((e) => e.id === entry.dataset.entry)?.text : d.type === "Scroll" ? d.entries.map((e) => e.text).join("\n\n") : d.body;
    try { await navigator.clipboard?.writeText(text || ""); } catch {}
    const label = btn.textContent; btn.textContent = "已复制"; btn.classList.add("done");
    setTimeout(() => { btn.textContent = label; btn.classList.remove("done"); }, 1600);
    await fly(btn, document.querySelector("[data-partner-screen]"), "#4de3ff");
    dispatchEvent(new Event("guiji:data-caught"));
    const bump = (el) => lcdSet(el, lcdNum(el) + 1);
    if (entry) bump(entry.querySelector("[data-uses]"));
    bump(item.querySelector(":scope > .uses [data-uses], :scope > .body > header [data-uses]") || item.querySelector("[data-uses]"));
    item.dataset.uses = Number(item.dataset.uses) + 1;
    bump(root.querySelector('[data-acount="uses"]'));
    if (item.dataset.stage === "成长期") { item.dataset.stage = "成熟期"; setStage(item.querySelector("[data-stage-bar]"), "成熟期"); bump(root.querySelector('[data-acount="mature"]')); }
    if (item.dataset.id === currentId && !drawer.hidden) render(currentId);
  }

  root.addEventListener("click", async (e) => {
    const t = e.target;
    if (t.closest(".menu")) {
      const m = t.closest(".menu");
      const sort = t.closest("[data-sort-key]"), tg = t.closest("[data-tag-pick]"), nt = t.closest("[data-new-type]");
      closeMenus();
      if (sort) sortBy(sort.dataset.sortKey);
      else if (tg) { tag = tg.dataset.tagPick; root.querySelector("[data-tags]").textContent = (tag ? `标签 · ${tag}` : "全部标签") + " ▾"; apply(); }
      else if (nt) { const b = root.querySelector("[data-new]"); flash(b); b.textContent = `+ 新建 · ${nt.dataset.newType}`; setTimeout(() => { b.textContent = "+ 新建"; }, 1600); }
      else if (t.closest("[data-delete-confirm]")) { const item = byId(currentId); item.setAttribute("data-gone", ""); await Promise.all([collapse(item), collapse(subOf(item))]); item.setAttribute("data-hide", ""); subOf(item)?.setAttribute("data-hide", ""); recount(); closeDrawer(); }
      return;
    }
    const cp = t.closest("[data-copy-asset]");
    if (cp) return copy(cp);
    const sort = t.closest("[data-sort]");
    if (sort) { popMenu(sort, Object.entries(SORTS).map(([k, [l]]) => `<button data-sort-key="${k}">${l}</button>`).join("")); return; }
    const tg = t.closest("[data-tags]");
    if (tg) { popMenu(tg, `<button data-tag-pick="">全部标签</button>` + data.tags.slice(0, 10).map(([n, c]) => `<button data-tag-pick="${esc(n)}">${esc(n)} <small>· ${c}</small></button>`).join("")); return; }
    const nw = t.closest("[data-new]");
    if (nw) { popMenu(nw, Object.entries(data.types).map(([k, l]) => `<button data-new-type="${l}">${l}</button>`).join("")); return; }
    if (t.closest("[data-close]")) return closeDrawer();
    if (t.closest("[data-pin]")) { const item = byId(currentId); if (!item) return; const on = item.classList.toggle("pinned"); const parent = item.parentElement; if (on) { parent.prepend(item); const sub = subOf(item); if (sub) item.after(sub); flash(item); } render(currentId); return; }
    if (t.closest("[data-edit]")) { flash(t.closest("[data-edit]")); return; }
    const del = t.closest("[data-delete]");
    if (del) { popMenu(del, '<button data-delete-confirm>从仓库删除这件</button><button data-menu-cancel>取消</button>', drawer); return; }
    closeMenus();
    const open = t.closest("[data-open]");
    if (open && !t.closest("button")) {
      const item = open.closest("[data-id]");
      root.querySelectorAll("[data-id].on").forEach((r) => r.classList.remove("on")); item.classList.add("on");
      render(item.dataset.id);
      if (drawer.hidden) { drawer.hidden = false; slideIn(drawer); }
    }
  });
})();

// ---------- 项目空间 二 · 存档条 / 三 · 卡带槽 + 读档屏 ----------
// 两版共用一份数据（#projects-data，来自现版标记）与同一套动作，只是画法不同：
// · 二：每盘一条横向存档条；继续 → 发车条从这一条下面按帧展开，持笔数码兽往前迈一步。
// · 三：顶上插卡带，选哪盘就启动哪盘 → 读档屏按帧扫描线启动、下一步打字出现；出发区常驻在屏里。
// · 选谁带走：头像跳一下，口令第一行换人并闪；只复制 / 带走 → 数据点飞向伙伴屏、蛋接住。
// · 开新档：库里那一行变成卡带飞进空槽，槽亮起，SLOT 编号与"在推进"计数翻页；三个槽满了其他开新档变灰。
// · 重新检查：活动日历逐格扫描再落定（预览不读真实目录，结论如实写"仍读不到"）。重新扫描：库里各行依次闪过。
// 只在状态变化和操作反馈时动，按帧（steps）；减少动态效果时直接到位。
(() => {
  const root = document.querySelector("main[data-projects]");
  if (!root) return;
  const MODE = root.dataset.projects;
  const reduced = (() => { try { return matchMedia("(prefers-reduced-motion: reduce)").matches; } catch { return true; } })();
  const STEP = { easing: "steps(1, end)" };
  const pad2 = (n) => String(n).padStart(2, "0");
  const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const D = JSON.parse(document.getElementById("projects-data").textContent);
  const STAGES = ["认领", "实现", "复核", "返修", "验收"];
  const SLOTS = 3;
  const saves = D.saves.map((s) => ({ ...s }));
  const picked = {};
  let current = saves[0].id;
  const agentOf = (id) => D.agents.find((a) => a.id === id);
  const short = (p) => p.replace("/Users/nat/", "~/");
  const now = () => { const d = new Date(); return `${pad2(d.getMonth() + 1)}/${pad2(d.getDate())} ${pad2(d.getHours())}:${pad2(d.getMinutes())}`; };
  const partner = () => { const el = document.querySelector("[data-partner-screen]"); return el && el.getClientRects().length && el.getBoundingClientRect().width ? el : document.querySelector("[data-pj-navopen]") || el; };
  const stage = () => document.querySelector('canvas[data-partner="stage"]')?.__lcd;

  // 点阵液晶（与上面各段同一套 5×7 字模，另加 "-"）
  const GL = {
    0: "01110100011001110101110011000101110", 1: "00100011000010000100001000010001110", 2: "01110100010000100010001000100011111",
    3: "11111000100010000010000011000101110", 4: "00010001100101010010111110001000010", 5: "11111100001111000001000011000101110",
    6: "00110010001000011110100011000101110", 7: "11111000010001000100010000100001000", 8: "01110100011000101110100011000101110",
    9: "01110100011000101111000010001001100", ":": "00000011000110000000011000110000000", "/": "00001000010001000100010001000010000",
    "-": "00000000000000011111000000000000000",
  };
  function lcdSvg(text) {
    let off = "", on = "";
    [...text].forEach((ch, i) => {
      for (let y = 0; y < 7; y++) for (let x = 0; x < 5; x++) {
        const r = `<rect x="${i * 6 + x}" y="${y}" width=".75" height=".75"/>`;
        off += r;
        if ((GL[ch] || "")[y * 5 + x] === "1") on += r;
      }
    });
    return `<svg viewBox="0 0 ${text.length * 6 - 1} 7" role="img" aria-label="${text}"><g class="off">${off}</g><g class="on">${on}</g></svg>`;
  }
  const lcd = (text, cls = "") => `<span class="lcd ${cls}" data-pj-lcd="${text}">${lcdSvg(text)}</span>`;
  function setLcd(el, text) {
    if (!el) return;
    if (el.hasAttribute("data-lcd")) { el.dataset.text = text; el.dispatchEvent(new CustomEvent("lcd", { detail: text })); return; }
    el.dataset.pjLcd = text; el.innerHTML = lcdSvg(text);
    if (!reduced) el.firstElementChild.animate([3, 2, 1, 0].map((k, i) => ({ offset: i / 3, clipPath: `inset(0 0 ${k * 33}% 0)`, ...STEP })).concat({ clipPath: "inset(0 0 0 0)" }), { duration: 160 });
  }

  // ---- 动效小件 ----
  function fly(from, to, color = "#ff8a24", size = 8) {
    return new Promise((done) => {
      if (reduced || !from || !to) return done();
      const a = from.getBoundingClientRect(), b = to.getBoundingClientRect();
      const bit = document.createElement("i");
      bit.className = "v19-bit"; bit.style.background = color; bit.style.width = bit.style.height = size + "px"; document.body.appendChild(bit);
      const x0 = a.left + a.width / 2, y0 = a.top + a.height / 2, x1 = b.left + b.width / 2, y1 = b.top + b.height / 2, N = 16, frames = [];
      for (let i = 0; i <= N; i++) { const t = i / N; frames.push({ offset: t, transform: `translate(${x0 + (x1 - x0) * t}px, ${y0 + (y1 - y0) * t - Math.sin(t * Math.PI) * 48}px)`, ...STEP }); }
      bit.animate(frames, { duration: N * 36 }).onfinish = () => { bit.remove(); done(); };
    });
  }
  // 开新档：库里那一行变成一盘卡带（标签上是项目名），按帧飞进空槽
  function flyCart(fromEl, toEl, name) {
    return new Promise((done) => {
      if (reduced || !fromEl || !toEl) return done();
      const a = fromEl.getBoundingClientRect(), b = toEl.getBoundingClientRect();
      const c = document.createElement("div");
      c.className = "pj-flycart"; c.innerHTML = `<i></i><b>${esc(name)}</b>`; document.body.appendChild(c);
      const w = 220, h = 44, N = 12, frames = [];
      for (let i = 0; i <= N; i++) {
        const t = i / N, x = a.left + 16 + (b.left + b.width / 2 - w / 2 - a.left - 16) * t, y = a.top + (b.top + b.height / 2 - h / 2 - a.top) * t - Math.sin(t * Math.PI) * 60;
        frames.push({ offset: t, transform: `translate(${Math.round(x)}px, ${Math.round(y)}px) rotate(${i % 2 ? -2 : 2}deg)`, ...STEP });
      }
      c.animate(frames, { duration: N * 45 }).onfinish = () => { c.remove(); done(); };
    });
  }
  function flash(el, color = "rgba(255, 138, 36, 0.20)") {
    if (!el || reduced) return;
    el.animate([{ background: color, ...STEP }, { offset: 0.5, background: "transparent", ...STEP }, { background: color, ...STEP }].concat({ background: "transparent" }), { duration: 360 });
  }
  function revealH(el, ms = 220) {
    if (reduced || !el) return;
    const h = el.scrollHeight, N = 4;
    el.animate([...Array(N + 1)].map((_, k) => ({ offset: k / N, height: `${Math.round(h * k / N)}px`, overflow: "hidden", ...STEP })).concat({ height: `${h}px` }), { duration: ms });
  }
  function collapseH(el, ms = 160) {
    return new Promise((done) => {
      if (reduced || !el) return done();
      const h = el.offsetHeight, N = 3;
      el.animate([...Array(N + 1)].map((_, k) => ({ offset: k / N, height: `${Math.round(h * (N - k) / N)}px`, overflow: "hidden", ...STEP })), { duration: ms, fill: "forwards" }).onfinish = (e) => { done(); requestAnimationFrame(() => e.target.cancel()); };
    });
  }
  const hop = (el, dy = -6) => { if (!reduced && el) el.animate([{ transform: "translateY(0)", ...STEP }, { offset: 0.33, transform: `translateY(${dy}px)`, ...STEP }, { offset: 0.66, transform: `translateY(${Math.round(dy / 2)}px)`, ...STEP }, { transform: "translateY(0)" }], { duration: 240 }); };
  const stepForward = (el) => { if (!reduced && el) el.animate([0, 3, 6, 6, 3, 0].map((x, i, arr) => ({ offset: i / (arr.length - 1), transform: `translateX(${x}px)`, ...STEP })), { duration: 420 }); };
  function typeText(el, text) {
    if (!el) return;
    if (reduced) { el.textContent = text; return; }
    let k = 0; el.textContent = ""; el.classList.add("typing");
    const per = Math.max(2, Math.ceil(text.length / 45));
    const id = setInterval(() => { k += per; el.textContent = text.slice(0, k); if (k >= text.length) { clearInterval(id); el.classList.remove("typing"); } }, 22);
  }

  // ---- 共用画法 ----
  const stepsHtml = (p, big = false) => {
    const k = p.stage;
    return `<ol class="steps${big ? " big" : ""}${k < 0 ? " unk" : ""}" aria-label="接力阶段：${k < 0 ? "未知" : STAGES[k]}">${STAGES.map((s, i) => `<li class="${i < k ? "past" : ""}${i === k ? " on" : ""}"${i === k ? ' aria-current="step"' : ""}><i></i>${s}</li>`).join("")}</ol>`;
  };
  function heatHtml(p) {
    const days = p.heat;
    const lv = (n) => (n === 0 ? 0 : n < 3 ? 1 : n < 16 ? 2 : 3);
    const lab = `<div class="wk" aria-hidden="true">${"一二三四五六日".split("").map((d) => `<span>${d}</span>`).join("")}</div>`;
    if (!days) {
      const cells = [...Array(35)].map((_, i) => `<i class="${i < 3 || i > 32 ? "out" : "unk"}"></i>`).join("");
      return `<div class="heat unknown" aria-label="近 30 天活动：未知">${lab}<div class="cells" data-pj-cells>${cells}</div></div>`;
    }
    const first = new Date(days[0].d + "T00:00:00"), lead = (first.getDay() + 6) % 7, total = Math.ceil((lead + days.length) / 7) * 7;
    let cells = "";
    for (let i = 0; i < total; i++) {
      const d = days[i - lead];
      if (!d) { cells += '<i class="out"></i>'; continue; }
      const [, m, dd] = d.d.split("-");
      const cls = `g${lv(d.git)} c${lv(d.cur)}${d.git && d.cur ? " both" : ""}${i - lead === days.length - 1 ? " today" : ""}`;
      cells += `<i class="${cls}" title="${Number(m)}/${Number(dd)} · Git ${d.git} · CURRENT ${d.cur}"></i>`;
    }
    const gitDays = days.filter((d) => d.git).length, curDays = days.filter((d) => d.cur).length;
    return `<div class="heat" aria-label="近 30 天活动：Git ${gitDays} 天，CURRENT ${curDays} 天">${lab}<div class="cells" data-pj-cells>${cells}</div></div>`;
  }
  function lastHtml(p) {
    if (p.state === "ok")
      return `<div class="last">${lcd(p.latest.slice(0, 5), "big")}<small>${p.latest.slice(6)} · 最近一次是 <b class="k-${p.latestKind === "CURRENT" ? "cur" : "git"}">${p.latestKind}</b></small><span class="legend"><i class="g3"></i>Git<i class="c3"></i>CURRENT</span></div>`;
    return `<div class="last">${lcd("--/--", "big dim")}<small>${p.state === "new" ? "还没读过" : "活动未知 · 不代表没有活动"}</small><span class="legend">最近提交 ${esc(p.latest)}</span></div>`;
  }
  function holderHtml(p, full = false) {
    const a = p.agent && agentOf(p.agent);
    if (!a) return `<span class="holder ghost${full ? " full" : ""}" aria-label="持笔者未知"><b>?</b></span>`;
    return `<span class="holder${full ? " full" : ""}" style="--hue:${a.hue}" aria-label="持笔者 ${a.character}">${full ? a.full : a.head}</span>`;
  }
  function holderName(p) {
    const a = p.agent && agentOf(p.agent);
    return a ? `<b class="hn">${a.character}</b><small class="en">${a.name.toUpperCase()}</small>` : `<b class="hn dim">${p.state === "new" ? "待认领" : "持笔者未知"}</b><small class="en">${p.state === "new" ? "NEW SAVE" : "UNKNOWN"}</small>`;
  }
  function deskHtml(p) {
    const n = p.inbox.length, g = p.gear.length;
    return `<div class="desk"><button class="tray${n ? " lit" : ""}" data-pj-inbox ${n ? "" : "disabled"} title="${n ? "收件：工作台投递来的需求，点开看" : "没有收件"}"><span class="egg">${D.egg}</span>${lcd(pad2(n))}<small>收件</small></button>`
      + `<span class="tray" title="${g ? "装备：出战的资产" : "还没装备资产"}"><span class="gear" aria-hidden="true"></span>${lcd(pad2(g))}<small>装备</small></span></div>`;
  }
  function factsHtml(p) {
    if (p.state === "ok")
      return `<span class="fact"><i class="led on"></i>state_id ${esc(p.stateId.split("-").pop())} · 写入者 ${esc(p.writer)}</span><span class="fact">CURRENT 更新于 ${esc(p.latest)}</span>${p.savepoint > 7 ? `<span class="fact warn" title="基于最近一次读取或项目扫描">未存档 ${p.savepoint} 天</span>` : ""}`;
    if (p.state === "new") return `<span class="fact">刚开档 · 来自库：${esc(p.zone || "")}</span>`;
    return (p.safety || []).map((t) => `<span class="fact bad">! ${esc(t)}</span>`).join("") + `<span class="fact">最近提交 ${esc(p.latest)}</span>`;
  }
  function nextHtml(p, big = false) {
    if (p.state === "ok")
      return `<div class="next${big ? " big" : ""}"><span class="lab">NEXT · 下一步</span><p data-pj-nexttext>${big ? "" : esc(p.next)}</p>${big ? "" : '<button class="more" data-pj-more aria-expanded="false">展开全文</button>'}</div>`;
    if (p.state === "new")
      return `<div class="next alert fresh${big ? " big" : ""}"><span class="lab">NEW SAVE · 新档</span><p><b>刚开档，还没读状态。</b>读一次 CURRENT，才知道持笔者、阶段和下一步。</p><div class="fix"><button class="act go" data-pj-recheck>读取状态</button></div></div>`;
    return `<div class="next alert${big ? " big" : ""}"><span class="lab">CURRENT · 读不到</span><p><b>读不到 CURRENT</b><span data-pj-reason>${esc(p.reason)}。</span>阶段、下一步、30 天活动都未知，不代表没有活动。</p><div class="fix"><button class="act go" data-pj-recheck>重新检查</button><button class="act" data-pj-detail>看体检</button></div></div>`;
  }
  const promptOf = (p, id) => p.prompt.replace("{AGENT}", agentOf(id).name);
  function launchHtml(p) {
    const cur = picked[p.id] || p.agent || "claude";
    picked[p.id] = cur;
    const cast = D.agents.map((a) => `<button class="pick${a.id === cur ? " on" : ""}" role="radio" aria-checked="${a.id === cur}" data-pj-pick="${a.id}" style="--hue:${a.hue}" title="${a.character} · ${a.name}">${a.head}<span><b>${a.character}</b><small>${a.name}</small></span></button>`).join("");
    const text = promptOf(p, cur);
    return `<div class="pick-col"><span class="lab">CONTINUE · 选谁带走</span><div class="cast" role="radiogroup" aria-label="开工伙伴">${cast}</div></div>`
      + `<div class="prompt-col"><div class="ph"><span class="lab">口令预览</span><span class="grow"></span>${lcd(String(text.length), "n")}<small>字</small></div><pre class="prompt" data-pj-prompt tabindex="0">${esc(text)}</pre></div>`
      + `<div class="go-col"><button class="act go big" data-pj-take>带到 ${esc(agentOf(cur).name)} 继续</button><button class="act" data-pj-copy>只复制口令</button><p class="hint">带过去只打开已检测到的应用，粘贴和发送由你完成。</p><p class="receipt" data-pj-receipt role="status"></p></div>`;
  }
  function blockedLaunch(p) {
    const why = p.state === "new" ? "新档还没读状态，读到 CURRENT 后才能出发。" : "读不到 CURRENT，口令里没有下一步，先重新检查。";
    const inbox = p.inbox.length ? `<span class="lab">等着带走 · 收件 ${p.inbox.length}</span>${p.inbox.map((n) => `<p class="note"><small>${n.kind} · ${n.at} 投递</small>${esc(n.text)}</p>`).join("")}<p class="small">修好后继续，收件会一起写进口令。</p>` : "";
    return `<div class="blocked"><span class="lab">CONTINUE · 出发区</span><p>${why}</p></div>${inbox}<button class="act go big" disabled title="${why}"><svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><polygon points="6 3 20 12 6 21 6 3"/></svg>继续</button>`;
  }


  // ---- 二 · 存档条 ----
  function stripHtml(p) {
    const ok = p.state === "ok";
    return `<article class="strip s-${p.state}" data-pj="${p.id}" aria-label="存档 SLOT ${p.slot}：${esc(p.name)}">`
      + `<div class="spine"><span class="slotno"><small>SLOT</small>${lcd(p.slot)}</span>${holderHtml(p)}${holderName(p)}</div>`
      + `<div class="mid"><header><div class="tt"><h3>${esc(p.name)}</h3><span class="path" title="${esc(p.path)}">${esc(short(p.path))}</span></div><span class="grow"></span>${stepsHtml(p)}</header>${nextHtml(p)}<footer class="facts">${factsHtml(p)}</footer></div>`
      + `<div class="rail"><div class="cal">${heatHtml(p)}${lastHtml(p)}</div><div class="foot">${deskHtml(p)}<span class="grow"></span><button class="act" data-pj-detail>详情</button>`
      + `<button class="act go" data-pj-go aria-expanded="false" ${ok ? "" : `disabled title="${p.state === "new" ? "先读取状态" : "读不到 CURRENT，先重新检查"}"`}><svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><polygon points="6 3 20 12 6 21 6 3"/></svg>继续</button></div></div>`
      + `<div class="launch" data-pj-launch hidden></div></article>`;
  }
  const vacantHtml = (slot) => `<button class="vacant" data-pj-vacant><span class="slotno"><small>SLOT</small>${lcd(pad2(slot))}</span><span class="mouth" aria-hidden="true"></span><span class="t"><b>空槽</b>从下面的库里挑一盘，点“开新档”插进来</span><span class="go-lib">去库里挑 ▾</span></button>`;
  function drawStrips() {
    const box = root.querySelector("[data-pj-strips]");
    box.innerHTML = saves.map(stripHtml).join("") + (saves.length < SLOTS ? vacantHtml(saves.length + 1) : "");
  }

  // ---- 三 · 卡带槽 + 读档屏 ----
  function lampHtml(p) {
    const [cls, t] = p.state === "ok" ? ["ok", "正常"] : p.state === "new" ? ["amber", "未读"] : ["bad", "读不到"];
    return `<span class="lamp ${cls}"><i></i>${t}</span>`;
  }
  function cartHtml(p) {
    if (VAR) return slimCart(p);
    const on = p.id === current, k = p.stage;
    const leds = STAGES.map((_, i) => `<i class="${k >= 0 && i <= k ? "on" : ""}"></i>`).join("");
    const extras = (p.inbox.length ? `<span class="mini egg" title="收件 ${p.inbox.length}">${D.egg}${p.inbox.length}</span>` : "") + ((p.safety || []).length ? `<span class="mini bad" title="${esc(p.safety.join("；"))}">!${p.safety.length}</span>` : "");
    return `<button class="cart s-${p.state}${on ? " on" : ""}" role="tab" aria-selected="${on}" data-pj-cart="${p.id}"><span class="grip" aria-hidden="true"></span>`
      + `<span class="label"><span class="lt"><span class="en">SLOT ${p.slot}</span><span class="grow"></span>${lampHtml(p)}</span>`
      + `<span class="lm">${holderHtml(p)}<span class="nm"><b>${esc(p.name)}</b><small>${p.state === "ok" ? `${esc(agentOf(p.agent).character)} · ${p.latest.slice(0, 5)}` : p.state === "new" ? "新档 · 还没读" : "读不到 CURRENT"}</small></span></span>`
      + `<span class="lb"><span class="leds" aria-hidden="true">${leds}</span><small>${k >= 0 ? STAGES[k] : "阶段未知"}</small><span class="grow"></span>${extras}</span></span></button>`;
  }
  const emptyBay = (slot) => VAR ? `<button class="cart empty slim" data-pj-vacant><span class="plus" aria-hidden="true">+</span><span><span class="en">SLOT ${pad2(slot)} · 空槽</span><small>从库里挑一盘开新档</small></span></button>` : `<button class="cart empty" data-pj-vacant><span class="mouth" aria-hidden="true"></span><span class="en">SLOT ${pad2(slot)}</span><small>空槽 · 从库里挑一盘开新档 ▾</small></button>`;
  function drawSlots() {
    root.querySelector("[data-pj-slots]").innerHTML = saves.map(cartHtml).join("") + (saves.length < SLOTS ? emptyBay(saves.length + 1) : "");
  }
  function checksHtml(p) {
    return `<div class="checks"><span class="lab">体检</span>${p.checks.map(([k, s, v]) => `<span class="ck ${s}"><i>${s === "ok" ? "✓" : s === "bad" ? "!" : "·"}</i><b>${k}</b><small>${esc(v)}</small></span>`).join("")}</div>`;
  }
  function screenHtml(p) {
    const a = p.agent && agentOf(p.agent);
    const party = `<div class="party"><div class="portrait" ${a ? `style="--hue:${a.hue}"` : ""}>${a ? a.full : '<span class="holder ghost full"><b>?</b></span>'}</div>${holderName(p)}`
      + `<div class="team"><span class="lab">队伍</span>${deskHtml(p)}<div class="gearslots" aria-label="装备槽">${[0, 1, 2].map((i) => `<i class="${p.gear[i] ? "on" : ""}" title="${p.gear[i] ? "" : "空装备槽：在资产仓库复制或装备后出现"}"></i>`).join("")}</div></div></div>`;
    const main = `<div class="core">${nextHtml(p, true)}<div class="row2">${stepsHtml(p, true)}</div><div class="row3"><div class="cal">${heatHtml(p)}${lastHtml(p)}</div>${checksHtml(p)}</div><footer class="facts">${factsHtml(p)}</footer></div>`;
    const depart = `<div class="depart">${p.state === "ok" ? launchHtml(p) : blockedLaunch(p)}</div>`;
    return `<header class="sc-head"><span class="en">LOAD · SLOT ${p.slot}</span><h3>${esc(p.name)}</h3><span class="path" title="${esc(p.path)}">${esc(short(p.path))}</span><span class="grow"></span>${lampHtml(p)}<button class="act" data-pj-detail>详情</button></header>`
      + `<div class="sc-body s-${p.state}" data-pj="${p.id}">${party}${main}${depart}</div>`;
  }
  function boot(p, animate = true) {
    const sc = root.querySelector("[data-pj-screen]");
    sc.innerHTML = VAR ? variantScreen(p) : screenHtml(p);
    sc.querySelectorAll("[data-pj-lscroll]").forEach((x) => { x.scrollLeft = x.scrollWidth; });
    const txt = sc.querySelector("[data-pj-nexttext]");
    if (!animate || reduced) { if (txt) txt.textContent = p.next; return; }
    const body = sc.querySelector(".sc-body"), N = 6;
    body.animate([...Array(N + 1)].map((_, k) => ({ offset: k / N, clipPath: `inset(0 0 ${Math.round(100 - (k * 100) / N)}% 0)`, ...STEP })).concat({ clipPath: "inset(0 0 0 0)" }), { duration: 330 });
    const line = document.createElement("i");
    line.className = "scanline"; sc.appendChild(line);
    line.animate([...Array(N + 1)].map((_, k) => ({ offset: k / N, top: `${Math.round((k * 100) / N)}%`, ...STEP })), { duration: 330 }).onfinish = () => { line.remove(); if (txt) typeText(txt, p.next); };
  }
  function select(id) {
    if (id === current) return;
    current = id;
    root.querySelectorAll("[data-pj-cart]").forEach((c) => { const on = c.dataset.pjCart === id; c.classList.toggle("on", on); c.setAttribute("aria-selected", on); if (on && !reduced) c.animate([{ transform: "translateY(-6px)", ...STEP }, { offset: 0.5, transform: "translateY(-2px)", ...STEP }, { transform: "translateY(3px)" }], { duration: 160 }); });
    boot(saves.find((s) => s.id === id));
  }

  // ---- 三的三版优化：3-1 一栏读 / 3-2 主次两栏 / 3-3 剧场 ----
  // 共用：卡带只留 SLOT + 头像 + 名字 + 一盏状态灯；读档屏只突出"下一步"与"继续"，其余收进一行读数、页签或菜单后面。
  const VAR = root.dataset.variant || "";
  const PLAY = '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><polygon points="6 3 20 12 6 21 6 3"/></svg>';
  const curAgent = (p) => (picked[p.id] = picked[p.id] || p.agent || "claude");
  function slimCart(p) {
    const on = p.id === current;
    const [cls, t] = p.state === "ok" ? ["ok", `${STAGES[p.stage]} · ${p.stage + 1}/5`] : p.state === "new" ? ["amber", "新档 · 未读"] : ["bad", "读不到 CURRENT"];
    return `<button class="cart slim s-${p.state}${on ? " on" : ""}" role="tab" aria-selected="${on}" data-pj-cart="${p.id}" ${p.agent ? `style="--hue:${agentOf(p.agent).hue}"` : ""}>`
      + `${holderHtml(p)}<span class="nm"><span class="en">SLOT ${p.slot}</span><b>${esc(p.name)}</b></span><span class="lamp ${cls}"><i></i>${t}</span></button>`;
  }
  function pickerHtml(p, names = false) {
    const cur = curAgent(p);
    return `<div class="picker${names ? " named" : ""}" role="radiogroup" aria-label="选谁带走">${D.agents.map((a) => `<button class="pk${a.id === cur ? " on" : ""}" role="radio" aria-checked="${a.id === cur}" data-pj-pick="${a.id}" style="--hue:${a.hue}" title="${a.character} · ${a.name}">${a.head}${names ? `<span><b>${a.character}</b><small>${a.name}</small></span>` : ""}</button>`).join("")}</div>`;
  }
  const takeBtn = (p, dis = "") => `<button class="act go big" data-pj-take ${dis}>${PLAY}带到 ${esc(agentOf(curAgent(p)).name)} 继续</button>`;
  const promptPre = (p, hidden = false) => `<pre class="prompt" data-pj-prompt tabindex="0"${hidden ? " hidden" : ""}>${esc(promptOf(p, curAgent(p)))}</pre>`;
  const count = (p) => `${lcd(String(promptOf(p, curAgent(p)).length), "n")}<small>字</small>`;
  const portrait = (p) => { const a = p.agent && agentOf(p.agent); return `<div class="portrait" ${a ? `style="--hue:${a.hue}"` : ""}>${a ? a.full : '<span class="holder ghost full"><b>?</b></span>'}</div>`; };
  const notesHtml = (p) => p.inbox.map((n) => `<p class="note"><small>${n.kind} · ${n.at} 投递</small>${esc(n.text)}</p>`).join("");
  const headHtml = (p) => `<header class="sc-head"><span class="en">LOAD · SLOT ${p.slot}</span><h3>${esc(p.name)}</h3><span class="path" title="${esc(p.path)}">${esc(short(p.path))}</span><span class="grow"></span><button class="act" data-pj-detail>详情</button></header>`;
  function readoutsHtml(p) {
    const ok = p.state === "ok", good = p.checks.filter((c) => c[1] === "ok").length, bad = p.checks.filter((c) => c[1] === "bad").length;
    const seg = `<span class="seg5${p.stage < 0 ? " unk" : ""}">${STAGES.map((_, i) => `<i class="${p.stage >= 0 && i <= p.stage ? "on" : ""}"></i>`).join("")}</span>`;
    return `<div class="readouts">`
      + `<div class="ro"><span class="lab">阶段</span>${seg}<b>${p.stage >= 0 ? `${STAGES[p.stage]} · ${p.stage + 1}/5` : "未知"}</b></div>`
      + `<div class="ro"><span class="lab">近 30 天</span>${heatHtml(p)}<b>${ok ? `最近 ${p.latest.slice(0, 5)} · <em class="k-${p.latestKind === "CURRENT" ? "cur" : "git"}">${p.latestKind}</em>` : "活动未知"}</b></div>`
      + `<button class="ro" data-pj-detail><span class="lab">体检</span><span class="dots">${p.checks.map((c) => `<i class="${c[1]}"></i>`).join("")}</span><b class="${bad ? "bad" : ""}">${bad ? `${bad} 项要处理` : `${good} 项正常`}</b></button>`
      + `<button class="ro" data-pj-inbox ${p.inbox.length ? "" : "disabled"}><span class="lab">队伍</span><span class="team"><span class="egg${p.inbox.length ? " lit" : ""}">${D.egg}</span>${lcd(pad2(p.inbox.length))}<span class="gear"></span>${lcd(pad2(p.gear.length))}</span><b>收件 ${p.inbox.length} · 装备 ${p.gear.length}</b></button></div>`;
  }
  const alertHtml = (p) => nextHtml(p, true) + (p.inbox.length ? `<div class="waiting"><span class="lab">等着带走 · 收件 ${p.inbox.length}</span>${notesHtml(p)}</div>` : "");
  // 3-1 一栏读
  function screenRead(p) {
    const ok = p.state === "ok";
    const read = ok
      ? `<div class="read"><span class="lab nx-lab">NEXT · 下一步</span><p class="nx" data-pj-nexttext></p>`
        + `<div class="go-row">${pickerHtml(p)}<span class="grow"></span><button class="act" data-pj-copy>只复制</button>${takeBtn(p)}</div>`
        + `<div class="pv"><button class="pv-t ph" data-pj-pv aria-expanded="false"><span>口令预览</span>${count(p)}<i aria-hidden="true">▾</i></button><p class="receipt" data-pj-receipt role="status"></p></div>${promptPre(p, true)}</div>`
      : `<div class="read">${alertHtml(p)}</div>`;
    return headHtml(p) + `<div class="sc-body s-${p.state}" data-pj="${p.id}" data-pj-host><div class="who">${portrait(p)}${holderName(p)}</div>${read}</div>${readoutsHtml(p)}`;
  }
  // 3-2 主次两栏
  function screenDossier(p) {
    const ok = p.state === "ok", a = p.agent && agentOf(p.agent);
    const who = `<div class="who2">${holderHtml(p)}<div class="wt">${a ? `<b>${a.character}</b><small>${a.name} 持笔 · ${STAGES[p.stage]} ${p.stage + 1}/5</small>` : `<b class="dim">${p.state === "new" ? "待认领" : "持笔者未知"}</b><small>${p.state === "new" ? "新档还没读状态" : "读不到 CURRENT，阶段未知"}</small>`}</div><span class="grow"></span><span class="stamp">${ok ? `最近 ${p.latest} · ${p.latestKind}` : `最近提交 ${esc(p.latest)}`}</span></div>`;
    const main = ok
      ? `<div class="main2">${who}<span class="lab nx-lab">NEXT · 下一步</span><p class="nx" data-pj-nexttext></p><div class="go-row">${pickerHtml(p)}<span class="pk-name" data-pj-pkname>${agentOf(curAgent(p)).character}</span><span class="grow"></span><button class="act" data-pj-copy>只复制</button>${takeBtn(p)}</div><p class="receipt" data-pj-receipt role="status"></p></div>`
      : `<div class="main2">${who}${nextHtml(p, true)}</div>`;
    const tabs = ok ? [["prompt", "口令"], ["heat", "活动"], ["checks", "体检"], ["team", "队伍"]] : [["checks", "体检"], ["team", `收件 ${p.inbox.length}`], ["heat", "活动"]];
    const first = tabs[0][0];
    const panes = {
      prompt: ok ? `<div class="ph"><span class="lab">口令 · 发给所选伙伴</span><span class="grow"></span>${count(p)}</div>${promptPre(p)}` : "",
      heat: `<div class="cal">${heatHtml(p)}${lastHtml(p)}</div>`,
      checks: `${checksHtml(p).replace('<span class="lab">体检</span>', "")}<footer class="facts">${factsHtml(p)}</footer>`,
      team: `${deskHtml(p)}${p.inbox.length ? notesHtml(p) : '<p class="small">没有收件。随手记或收藏投递到这个项目后出现在这里，继续时一起写进口令。</p>'}`,
    };
    const dossier = `<aside class="dossier"><div class="tabs" role="tablist">${tabs.map(([k, l]) => `<button role="tab" class="${k === first ? "on" : ""}" aria-selected="${k === first}" data-pj-tab="${k}">${l}</button>`).join("")}</div>`
      + tabs.map(([k]) => `<div class="tabp" data-tabp="${k}"${k === first ? "" : " hidden"}>${panes[k]}</div>`).join("") + `</aside>`;
    return headHtml(p) + `<div class="sc-body s-${p.state}" data-pj="${p.id}" data-pj-host>${main}${dossier}</div>`;
  }
  // 3-3 剧场
  function screenTheater(p) {
    const ok = p.state === "ok", a = p.agent && agentOf(p.agent), cur = agentOf(curAgent(p));
    const menu = ok
      ? [["take", `${PLAY}<b>继续</b><small data-pj-sub="take">带到 ${cur.name}</small>`], ["pick", `<b>换伙伴</b><small data-pj-sub="pick">现在：${cur.character}</small>`], ["prompt", `<b>看口令</b><small data-pj-sub="prompt">${promptOf(p, cur.id).length} 字</small>`], ["dossier", "<b>档案</b><small>阶段 · 活动 · 体检 · 队伍</small>"], ["copy", "<b>只复制口令</b><small>不打开应用</small>"]]
      : [["recheck", `<b>${p.state === "new" ? "读取状态" : "重新检查"}</b><small>${p.state === "new" ? "读一次 CURRENT" : "再读一次 CURRENT"}</small>`], ["dossier", `<b>档案</b><small>体检 ${p.checks.filter((c) => c[1] === "bad").length} 项要处理</small>`], ...(p.inbox.length ? [["inbox", `<b>收件</b><small>${p.inbox.length} 条等着带走</small>`]] : []), ["none", `${PLAY}<b>继续</b><small>修好 CURRENT 才能出发</small>`]];
    const items = menu.map(([k, h], i) => `<li><button role="menuitem" class="mcmd${i === 0 ? " on" : ""}${k === "take" || k === "recheck" ? " primary" : ""}" data-pj-cmd="${k}" ${k === "none" ? "disabled" : ""}>${h}</button></li>`).join("");
    const box = ok ? `<span class="speaker">${a.character} · NEXT</span><p class="nx" data-pj-nexttext></p>` : `<span class="speaker bad">${p.state === "new" ? "NEW SAVE" : "CURRENT · 读不到"}</span><p class="nx alertline"><b>${p.state === "new" ? "刚开档，还没读状态。" : "读不到 CURRENT。"}</b><span data-pj-reason>${esc(p.reason || "")}${p.reason ? "。" : ""}</span>${p.state === "new" ? "读一次 CURRENT，才知道持笔者、阶段和下一步。" : "阶段、下一步、活动都未知，不代表没有活动。"}</p>`;
    const status = ok ? `<span>${STAGES[p.stage]} · ${p.stage + 1}/5</span><span>最近 ${p.latest} · ${p.latestKind}</span>${p.savepoint > 7 ? `<span class="warn">未存档 ${p.savepoint} 天</span>` : ""}<span>收件 ${p.inbox.length} · 装备 ${p.gear.length}</span>`
      : `${(p.safety || []).map((t) => `<span class="bad">! ${esc(t)}</span>`).join("")}<span>收件 ${p.inbox.length}</span><span>最近提交 ${esc(p.latest)}</span>`;
    return headHtml(p) + `<div class="sc-body s-${p.state}" data-pj="${p.id}" data-pj-host><div class="actor-wrap">${portrait(p)}<div class="plate">${holderName(p)}</div></div>`
      + `<div class="dialog"><div class="box" data-pj-box>${box}</div><p class="receipt" data-pj-receipt role="status"></p></div><ul class="cmdlist" role="menu" aria-label="读档菜单" data-pj-menu>${items}</ul></div><footer class="statusline">${status}</footer>`;
  }
  function variantScreen(p) { return ({ read: screenRead, dossier: screenDossier, theater: screenTheater, hand: screenHand, speak: screenSpeak, party: screenParty })[VAR](p); }
  function swapBox(box, html) {
    box.innerHTML = html;
    if (!reduced) box.animate([0, 1, 2, 3].map((k) => ({ offset: k / 4, clipPath: `inset(0 0 ${100 - k * 25}% 0)`, ...STEP })).concat({ clipPath: "inset(0 0 0 0)" }), { duration: 160 });
  }
  function theaterCmd(b, p) {
    const host = b.closest("[data-pj-host]"), box = host.querySelector("[data-pj-box]"), k = b.dataset.pjCmd;
    host.querySelectorAll("[data-pj-cmd]").forEach((x) => x.classList.toggle("on", x === b));
    const a = p.agent && agentOf(p.agent), back = '<button class="act back" data-pj-cmd="next">‹ 回到下一步</button>';
    if (k === "take") return giveOut(b, p, true);
    if (k === "copy") return giveOut(b, p, false);
    if (k === "recheck") return recheck(b, p);
    if (k === "inbox") return swapBox(box, `<span class="speaker">收件 · ${p.inbox.length} 条等着带走</span>${notesHtml(p)}<p class="small">修好 CURRENT 后继续，收件会一起写进口令。</p>`);
    if (k === "next") { host.querySelectorAll("[data-pj-cmd]").forEach((x, i) => x.classList.toggle("on", i === 0)); return swapBox(box, a ? `<span class="speaker">${a.character} · NEXT</span><p class="nx">${esc(p.next)}</p>` : `<span class="speaker bad">CURRENT · 读不到</span><p class="nx alertline">${esc(p.reason || "")}</p>`); }
    if (k === "pick") return swapBox(box, `<span class="speaker">选谁带走</span>${pickerHtml(p, true)}${back}`);
    if (k === "prompt") return swapBox(box, `<span class="speaker ph">口令预览<span class="grow"></span>${count(p)}</span>${promptPre(p)}${back}`);
    if (k === "dossier") return swapBox(box, `<span class="speaker">档案</span>${readoutsHtml(p)}${back}`);
  }
  function afterPick(host, p, id) {
    const a = agentOf(id), set = (k, v) => { const el = host.querySelector(`[data-pj-sub="${k}"]`); if (el) { el.textContent = v; flash(el.closest("button")); } };
    set("take", `带到 ${a.name}`); set("pick", `现在：${a.character}`); set("prompt", `${promptOf(p, id).length} 字`);
    const nm = host.querySelector("[data-pj-pkname]"); if (nm) nm.textContent = a.character;
    host.querySelectorAll("[data-pj-givename], [data-pj-openname]").forEach((x) => { x.textContent = a.name; });
    const rich = host.querySelector("[data-pj-rich]"); if (rich) { rich.innerHTML = promptRich(p, id); flash(rich.querySelector(".title")); }
    const give = host.querySelector("[data-pj-give]"); if (give) flash(give, "rgba(255, 255, 255, 0.18)");
  }

  // ---- 剧场再优化：4-1 交接条 / 4-2 口令即对白 / 4-3 出发队列 ----
  // 协同的本质：一段口令，选交给谁，复制，结束。继续 / 看口令 / 只复制 / 换伙伴并成一个动作；"复制后打开"是按钮旁的勾选。
  // 活动改成整宽 30 天双轨（Git / CURRENT 各一行，格上直接写次数）。
  function lanesHtml(p) {
    const head = (t) => `<div class="lh"><span class="lab">近 30 天</span>${t}</div>`;
    if (!p.heat) return `<div class="lanes unknown">${head(`<span class="lh-t">活动未知 · 不代表没有活动</span><span class="grow"></span><span class="lh-t">最近提交 ${esc(p.latest)}</span>`)}${["Git", "CURRENT"].map((n) => `<div class="lane"><span class="ln">${n}</span><div class="c30" data-pj-cells>${'<i class="unk"></i>'.repeat(30)}</div></div>`).join("")}</div>`;
    const days = p.heat, lv = (n) => (n === 0 ? 0 : n < 3 ? 1 : n < 16 ? 2 : 3);
    const md = (d) => { const [, m, dd] = d.split("-"); return `${+m}/${+dd}`; };
    const dow = (d) => new Date(d + "T00:00:00").getDay();
    const lane = (k, name, cls) => `<div class="lane ${cls}"><span class="ln">${name}</span><div class="c30" data-pj-cells>${days.map((d, i) => `<i class="l${lv(d[k])}${dow(d.d) % 6 === 0 ? " we" : ""}${i === days.length - 1 ? " today" : ""}" title="${md(d.d)} · ${name} ${d[k]}">${d[k] ? `<b>${d[k]}</b>` : ""}</i>`).join("")}</div></div>`;
    const ticks = days.map((d, i) => `<span>${i === days.length - 1 ? "今天" : dow(d.d) === 1 ? md(d.d) : ""}</span>`).join("");
    const gd = days.filter((d) => d.git).length, gn = days.reduce((t, d) => t + d.git, 0), cd = days.filter((d) => d.cur).length;
    return `<div class="lanes">${head(`<span class="lh-t"><i class="sw g"></i>Git ${gd} 天 · ${gn} 次提交</span><span class="lh-t"><i class="sw c"></i>CURRENT ${cd} 天</span><span class="grow"></span><span class="lh-t">最近一次 <b>${p.latest}</b> · ${p.latestKind}</span>`)}`
      + `<div class="lscroll" data-pj-lscroll>${lane("git", "Git", "git")}${lane("cur", "CURRENT", "cur")}<div class="ticks"><span></span><div>${ticks}</div></div></div></div>`;
  }
  function statsHtml(p) {
    const bad = p.checks.filter((c) => c[1] === "bad").length, good = p.checks.filter((c) => c[1] === "ok").length;
    return `<div class="stats"><div class="st"><span class="lab">阶段</span><span class="seg5${p.stage < 0 ? " unk" : ""}">${STAGES.map((_, i) => `<i class="${p.stage >= 0 && i <= p.stage ? "on" : ""}"></i>`).join("")}</span><b>${p.stage >= 0 ? `${STAGES[p.stage]} ${p.stage + 1}/5` : "未知"}</b></div>`
      + `<button class="st" data-pj-detail><span class="lab">体检</span><span class="dots">${p.checks.map((c) => `<i class="${c[1]}"></i>`).join("")}</span><b class="${bad ? "bad" : ""}">${bad ? `${bad} 项要处理` : `${good} 项正常`}</b></button>`
      + `<button class="st" data-pj-inbox ${p.inbox.length ? "" : "disabled"}><span class="lab">队伍</span><span class="team"><span class="egg${p.inbox.length ? " lit" : ""}">${D.egg}</span>${lcd(pad2(p.inbox.length))}<span class="gear"></span>${lcd(pad2(p.gear.length))}</span><b>收件 ${p.inbox.length} · 装备 ${p.gear.length}</b></button>`
      + `${p.state === "ok" && p.savepoint > 7 ? `<div class="st"><span class="lab">存档</span><span></span><b class="warn">未存档 ${p.savepoint} 天</b></div>` : ""}</div>`;
  }
  const footHtml = (p) => `<div class="sc-foot">${lanesHtml(p)}${statsHtml(p)}</div>`;
  const giveBtn = (p, dis = "") => `<button class="act go big give" data-pj-give ${dis}>复制口令，交给 <span data-pj-givename>${esc(agentOf(curAgent(p)).name)}</span></button>`;
  const openBox = (p) => `<label class="openapp"><input type="checkbox" data-pj-openapp checked>复制后打开 <span data-pj-openname>${esc(agentOf(curAgent(p)).name)}</span></label>`;
  const receipt = '<p class="receipt" data-pj-receipt role="status"></p>';
  const fullPrompt = (p) => `<div class="pv"><button class="pv-t ph" data-pj-pv aria-expanded="false"><span>口令全文</span>${count(p)}<i aria-hidden="true">▾</i></button>${receipt}</div>${promptPre(p, true)}`;
  const alertBox = (p) => `<span class="speaker bad">${p.state === "new" ? "NEW SAVE · 新档" : "CURRENT · 读不到"}</span><p class="nx alertline"><b>${p.state === "new" ? "刚开档，还没读状态。" : "读不到 CURRENT。"}</b><span data-pj-reason>${esc(p.reason || "")}${p.reason ? "。" : ""}</span>${p.state === "new" ? "读一次 CURRENT，才知道持笔者、阶段和下一步。" : "阶段、下一步、活动都未知，不代表没有活动。"}</p>`;
  const blockedBar = (p) => `<div class="handoff"><span class="lab">交给谁</span><span class="muted">${p.state === "new" ? "新档还没读状态，读到 CURRENT 才能交出口令" : "读不到 CURRENT，修好后才能交出口令"}</span><span class="grow"></span><button class="act" data-pj-detail>看体检</button><button class="act go big" data-pj-recheck>${p.state === "new" ? "读取状态" : "重新检查"}</button></div>${p.inbox.length ? `<div class="waiting"><span class="lab">等着带走 · 收件 ${p.inbox.length}</span>${notesHtml(p)}</div>` : ""}`;
  function promptRich(p, id) {
    return promptOf(p, id).split("\n").map((l) => {
      if (!l.trim()) return '<span class="gap"></span>';
      if (l.startsWith("唯一下一步：")) return `<p class="key"><span class="k">唯一下一步</span>${esc(l.slice(6))}</p>`;
      if (l.startsWith("【协同")) return `<p class="title">${esc(l)}</p>`;
      return `<p class="ln">${esc(l)}</p>`;
    }).join("");
  }
  // 4-1 交接条：剧场原样，对话框写下一步，下面一条交接条
  function screenHand(p) {
    const ok = p.state === "ok", a = p.agent && agentOf(p.agent);
    const box = ok ? `<div class="bh"><span class="speaker">${a.character} · NEXT · 下一步</span><span class="grow"></span><button class="pv-t ph" data-pj-pv aria-expanded="false"><span>口令全文</span>${count(p)}<i aria-hidden="true">▾</i></button></div><p class="nx" data-pj-nexttext></p>${promptPre(p, true)}${receipt}` : alertBox(p);
    const bar = ok ? `<div class="handoff"><span class="lab">交给谁</span>${pickerHtml(p)}<span class="pk-name" data-pj-pkname>${agentOf(curAgent(p)).character}</span><span class="grow"></span>${openBox(p)}${giveBtn(p)}</div>` : blockedBar(p);
    return headHtml(p) + `<div class="sc-body s-${p.state}" data-pj="${p.id}" data-pj-host><div class="actor-col">${portrait(p)}<div class="plate">${holderName(p)}</div></div><div class="dialog-col"><div class="box">${box}</div>${bar}</div></div>${footHtml(p)}`;
  }
  // 4-2 口令即对白：对话框就是完整口令，右栏选人 + 一个按钮
  function screenSpeak(p) {
    const ok = p.state === "ok", a = p.agent && agentOf(p.agent);
    const box = ok ? `<span class="speaker ph">${a.character} · 口令<span class="grow"></span>${count(p)}</span><div class="rich" data-pj-rich tabindex="0">${promptRich(p, curAgent(p))}</div>` : alertBox(p);
    const whom = ok ? `<div class="whom"><span class="lab">交给谁</span>${pickerHtml(p, true)}<span class="grow"></span>${openBox(p)}${giveBtn(p)}${receipt}</div>`
      : `<div class="whom"><span class="lab">交给谁</span><p class="muted">${p.state === "new" ? "新档还没读状态，读到 CURRENT 才能交出口令。" : "读不到 CURRENT，口令里没有下一步，修好后才能交出。"}</p>${p.inbox.length ? `<span class="lab">等着带走 · 收件 ${p.inbox.length}</span>${notesHtml(p)}` : ""}<span class="grow"></span><button class="act" data-pj-detail>看体检</button><button class="act go big" data-pj-recheck>${p.state === "new" ? "读取状态" : "重新检查"}</button></div>`;
    return headHtml(p) + `<div class="sc-body s-${p.state}" data-pj="${p.id}" data-pj-host><div class="actor-col">${portrait(p)}<div class="plate">${holderName(p)}</div></div><div class="box">${box}</div>${whom}</div>${footHtml(p)}`;
  }
  // 4-3 出发队列：四只数码兽站成一排，点谁谁往前一步
  function screenParty(p) {
    const ok = p.state === "ok", cur = curAgent(p);
    const top = ok ? `<div class="box nxbox"><span class="speaker">NEXT · 下一步</span><p class="nx" data-pj-nexttext></p></div>` : `<div class="box nxbox">${alertBox(p)}</div>`;
    const mons = D.agents.map((a) => `<button class="mon${ok && a.id === cur ? " on" : ""}" role="radio" aria-checked="${ok && a.id === cur}" data-pj-pick="${a.id}" style="--hue:${a.hue}" ${ok ? "" : "disabled"} title="${a.character} · ${a.name}"><span class="tag">${a.id === p.agent ? "持笔" : ""}</span><span class="spr">${a.full}</span><b>${a.character}</b><small>${a.name}</small></button>`).join("");
    const go = ok ? `<div class="go-col"><span class="lab">交给谁 · 点一只</span>${giveBtn(p)}${openBox(p)}<button class="pv-t ph" data-pj-pv aria-expanded="false"><span>口令全文</span>${count(p)}<i aria-hidden="true">▾</i></button>${receipt}</div>`
      : `<div class="go-col"><span class="lab">交给谁</span><p class="muted">${p.state === "new" ? "新档还没读状态，读到 CURRENT 才能交出口令。" : "读不到 CURRENT，修好后才能交出口令。"}</p><button class="act go big" data-pj-recheck>${p.state === "new" ? "读取状态" : "重新检查"}</button><button class="act" data-pj-detail>看体检</button>${p.inbox.length ? `<span class="lab">等着带走 · 收件 ${p.inbox.length}</span>${notesHtml(p)}` : ""}</div>`;
    return headHtml(p) + `<div class="sc-body s-${p.state}" data-pj="${p.id}" data-pj-host>${top}<div class="lineup${ok ? "" : " off"}" role="radiogroup" aria-label="交给谁">${mons}</div>${go}${ok ? `<div class="pv-row">${promptPre(p, true)}</div>` : ""}</div>${footHtml(p)}`;
  }

  // ---- 库 ----
  const lib = root.querySelector("[data-pj-lib]");
  let src = "all";
  function filterLib() {
    const q = (lib.querySelector("[data-pj-find]").value || "").trim().toLowerCase();
    lib.querySelectorAll("[data-pj-row]").forEach((r) => { r.hidden = !((src === "all" || r.dataset.src === src) && (!q || r.dataset.search.includes(q))); });
    lib.querySelectorAll(".rack").forEach((rk) => { const n = [...rk.querySelectorAll("[data-pj-row]")].filter((r) => !r.hidden).length; rk.classList.toggle("none", !n); setLcd(rk.querySelector("h4 .lcd"), pad2(n)); });
  }
  function syncNewButtons() {
    const full = saves.length >= SLOTS;
    lib.querySelectorAll("[data-pj-new]").forEach((b) => { b.disabled = full; b.title = full ? "三个存档槽都满了，先让一盘存档结束" : ""; });
  }
  function setReadTime() { const s = root.querySelector(".saves .sh .sub"); if (s) s.textContent = `读档 · 上次读取 ${now().slice(6)}`; const r = root.querySelector("[data-pj-readat]"); if (r) { r.textContent = `上次读取 ${now().slice(6)}`; flash(r, "rgba(77, 227, 255, 0.16)"); } }

  // ---- 弹层与抽屉 ----
  function closePops() { root.querySelectorAll(".pj-pop").forEach((x) => x.remove()); }
  function pop(anchor, html) {
    closePops();
    const el = document.createElement("div");
    el.className = "pj-pop"; el.innerHTML = html; root.appendChild(el);
    const a = anchor.getBoundingClientRect(), m = root.getBoundingClientRect();
    el.style.left = `${Math.max(8, Math.min(a.left - m.left, m.width - 360))}px`;
    el.style.top = `${a.bottom - m.top + root.scrollTop + 6}px`;
    if (!reduced) el.animate([{ clipPath: "inset(0 0 66% 0)", ...STEP }, { offset: 0.5, clipPath: "inset(0 0 33% 0)", ...STEP }, { clipPath: "inset(0 0 0 0)" }], { duration: 120 });
  }
  const drawer = root.querySelector("[data-pj-drawer]");
  function openDrawer(p) {
    const a = p.agent && agentOf(p.agent);
    drawer.innerHTML = `<header><span class="en">SLOT ${p.slot} · 详情</span><span class="grow"></span><button class="act" data-pj-close aria-label="关闭">×</button></header>`
      + `<h3>${esc(p.name)}</h3><p class="path">${esc(p.path)}</p>`
      + `<section><h4>展示信息</h4><dl><dt>持笔者</dt><dd>${a ? `${a.character} · ${a.name}` : "未知"}</dd><dt>阶段</dt><dd>${p.stage >= 0 ? STAGES[p.stage] : "未知"}</dd><dt>state_id</dt><dd>${esc(p.stateId || "未知")}</dd><dt>最近一次</dt><dd>${esc(p.latest)} · ${esc(p.latestKind)}</dd></dl></section>`
      + `<section><h4>状态与体检</h4>${checksHtml(p)}${p.state === "unread" ? `<p class="small">CURRENT：${esc(p.reason)}。</p>` : ""}</section>`
      + `<section><h4>收件</h4>${p.inbox.length ? p.inbox.map((n) => `<p class="note"><small>${n.kind} · ${n.at}</small>${esc(n.text)}</p>`).join("") : '<p class="small">没有收件。</p>'}</section>`
      + `<section><h4>位置与规则</h4><p class="small">附属目录、GitHub、连接与规则在正式页的详情里编辑；预览只列出来。</p></section>`;
    drawer.hidden = false;
    if (!reduced) drawer.animate([0, 1, 2].map((k) => ({ offset: k / 3, transform: `translateX(${Math.round(460 * (3 - k) / 3)}px)`, ...STEP })).concat({ transform: "translateX(0)" }), { duration: 180 });
  }
  function closeDrawer() {
    if (drawer.hidden) return;
    if (reduced) { drawer.hidden = true; return; }
    drawer.animate([0, 1, 2].map((k) => ({ offset: k / 3, transform: `translateX(${Math.round(460 * k / 3)}px)`, ...STEP })).concat({ transform: "translateX(460px)" }), { duration: 150 }).onfinish = () => { drawer.hidden = true; };
  }

  // ---- 动作 ----
  const saveOf = (el) => saves.find((s) => s.id === (el.closest("[data-pj]")?.dataset.pj || current));
  async function giveOut(btn, p, take) {
    const text = promptOf(p, picked[p.id]);
    try { await navigator.clipboard?.writeText(text); } catch {}
    const host = btn.closest("[data-pj-host]") || btn.closest(".launch, .depart");
    const receipt = host.querySelector("[data-pj-receipt]");
    btn.classList.add("done");
    await fly(btn, partner(), "#4de3ff");
    dispatchEvent(new Event("guiji:data-caught"));
    stage()?.catchData?.();
    receipt.textContent = btn.hasAttribute("data-pj-give") ? `TRANSFER OK · 口令已复制，交给 ${agentOf(picked[p.id]).name}${take ? "（正在打开，粘贴发送就完成）" : ""}` : take ? `TRANSFER OK · 口令已复制，打开 ${agentOf(picked[p.id]).name} 后粘贴发送` : "TRANSFER OK · 口令已复制";
    flash(receipt, "rgba(77, 227, 255, 0.18)");
    setTimeout(() => btn.classList.remove("done"), 1600);
  }
  async function recheck(btn, p) {
    btn.disabled = true;
    const label = btn.textContent;
    btn.textContent = "检查中…";
    const host = btn.closest("[data-pj]");
    const cells = [...((host?.closest("[data-pj-screen]") || host)?.querySelectorAll("[data-pj-cells] i:not(.out)") || [])];
    if (!reduced) for (let i = 0; i < cells.length; i += 3) { cells.slice(i, i + 3).forEach((c) => c.classList.add("scan")); await new Promise((r) => setTimeout(r, 24)); }
    await new Promise((r) => setTimeout(r, reduced ? 0 : 160));
    cells.forEach((c) => c.classList.remove("scan"));
    btn.disabled = false; btn.textContent = label;
    const t = now();
    if (p.state === "new") { p.state = "unread"; p.reason = `预览没有读真实目录（${t} 试读）`; p.safety = []; rerender(p, true); return; }
    p.reason = `仍读不到：${D.saves.find((s) => s.id === p.id)?.reason || "尚未取得读取结果"}（${t} 重新检查）`;
    const r = root.querySelector("[data-pj-screen] [data-pj-reason], .strip[data-pj=\"" + p.id + "\"] [data-pj-reason]"); if (r) { r.textContent = p.reason + "。"; flash(r.closest("p")); }
  }
  function rerender(p, fresh = false) {
    if (MODE === "strips") {
      const old = root.querySelector(`.strip[data-pj="${p.id}"]`);
      const tmp = document.createElement("div"); tmp.innerHTML = stripHtml(p);
      old.replaceWith(tmp.firstElementChild);
      if (fresh) flash(root.querySelector(`.strip[data-pj="${p.id}"]`));
    } else { drawSlots(); boot(p, fresh); }
  }
  async function newSave(btn) {
    if (saves.length >= SLOTS) return;
    const row = btn.closest("[data-pj-row]");
    const target = root.querySelector("[data-pj-vacant]");
    const zone = row.closest(".rack").querySelector("h4 b").textContent;
    btn.disabled = true;
    target.scrollIntoView?.({ block: "nearest" });
    await new Promise((r) => setTimeout(r, reduced ? 0 : 120));
    await flyCart(row, target, row.dataset.pjRow);
    const p = { id: `n${saves.length + 1}`, slot: pad2(saves.length + 1), name: row.dataset.pjRow, path: row.dataset.path, state: "new", agent: null, stage: -1,
      latest: row.querySelector(".at").textContent, latestKind: "扫描", savepoint: 0, heat: null, inbox: [], gear: [], zone,
      checks: [["Git 仓库", "unk", "还没读"], ["远程备份", "unk", "还没读"], ["未提交改动", "unk", "还没读"], ["敏感文件 / 公开仓库", "unk", "还没读"]] };
    saves.push(p);
    row.classList.add("in-save");
    btn.outerHTML = `<span class="slot-tag"><i class="led on"></i>SLOT ${p.slot}</span>`;
    syncNewButtons();
    setLcd(root.querySelector('[data-pj-count="saves"]'), pad2(saves.length));
    const badge = document.querySelector("aside a.on i"); if (badge) { badge.textContent = String(saves.length); flash(badge); }
    if (MODE === "strips") {
      drawStripsKeep();
      const el = root.querySelector(`.strip[data-pj="${p.id}"]`);
      revealH(el, 260); flash(el);
    } else {
      current = p.id; drawSlots(); boot(p);
      const c = root.querySelector(`[data-pj-cart="${p.id}"]`);
      if (!reduced) c.animate([{ transform: "translateY(-14px)", ...STEP }, { offset: 0.33, transform: "translateY(-6px)", ...STEP }, { offset: 0.66, transform: "translateY(0)", ...STEP }, { transform: "translateY(3px)" }], { duration: 240 });
      flash(c.querySelector(".label"));
    }
  }
  // 存档条：重画时保留已展开的发车条
  function drawStripsKeep() {
    const open = [...root.querySelectorAll(".strip")].filter((s) => !s.querySelector("[data-pj-launch]").hidden).map((s) => s.dataset.pj);
    drawStrips();
    open.forEach((id) => { const s = root.querySelector(`.strip[data-pj="${id}"]`); const l = s.querySelector("[data-pj-launch]"); l.innerHTML = launchHtml(saves.find((x) => x.id === id)); l.hidden = false; const b = s.querySelector("[data-pj-go]"); b.setAttribute("aria-expanded", "true"); b.lastChild.textContent = "收起"; });
  }

  root.addEventListener("click", async (e) => {
    const t = e.target;
    if (!t.closest(".pj-pop") && !t.closest("[data-pj-inbox]") && !t.closest("[data-pj-settings]")) closePops();
    let b;
    if ((b = t.closest("[data-pj-more]"))) {
      const p = b.closest(".next").querySelector("p"), open = b.getAttribute("aria-expanded") === "true";
      p.classList.toggle("open", !open); b.setAttribute("aria-expanded", String(!open)); b.textContent = open ? "展开全文" : "收起";
      if (!open) revealH(p, 180);
      return;
    }
    if ((b = t.closest("[data-pj-go]"))) {
      const s = b.closest(".strip"), l = s.querySelector("[data-pj-launch]"), p = saveOf(b), open = !l.hidden;
      if (open) { await collapseH(l); l.hidden = true; b.setAttribute("aria-expanded", "false"); b.lastChild.textContent = "继续"; return; }
      l.innerHTML = launchHtml(p); l.hidden = false; revealH(l, 240);
      b.setAttribute("aria-expanded", "true"); b.lastChild.textContent = "收起";
      stepForward(s.querySelector(".holder")); stage()?.poke?.();
      l.scrollIntoView?.({ block: "nearest", behavior: reduced ? "auto" : "smooth" });
      return;
    }
    if ((b = t.closest("[data-pj-pick]"))) {
      const p = saveOf(b), id = b.dataset.pjPick, host = b.closest("[data-pj-host]") || b.closest(".launch, .depart");
      if (picked[p.id] === id) return;
      picked[p.id] = id;
      host.querySelectorAll("[data-pj-pick]").forEach((x) => { const on = x === b; x.classList.toggle("on", on); x.setAttribute("aria-checked", on); });
      hop(b.querySelector("svg"));
      const text = promptOf(p, id), pre = host.querySelector("[data-pj-prompt]");
      if (pre) { pre.innerHTML = `<mark>${esc(text.split("\n")[0])}</mark>\n${esc(text.split("\n").slice(1).join("\n"))}`; flash(pre.querySelector("mark")); }
      host.querySelectorAll(".ph .lcd").forEach((l) => setLcd(l, String(text.length)));
      host.querySelectorAll("[data-pj-take]").forEach((t) => { t.innerHTML = (VAR ? PLAY : "") + `带到 ${esc(agentOf(id).name)} 继续`; });
      const rc = host.querySelector("[data-pj-receipt]"); if (rc) rc.textContent = "";
      if (VAR) afterPick(host, p, id);
      return;
    }
    if ((b = t.closest("[data-pj-pv]"))) {
      const pre = b.closest("[data-pj-host]").querySelector("[data-pj-prompt]"), open = b.getAttribute("aria-expanded") === "true";
      b.setAttribute("aria-expanded", String(!open));
      if (open) { await collapseH(pre); pre.hidden = true; } else { pre.hidden = false; revealH(pre, 180); }
      return;
    }
    if ((b = t.closest("[data-pj-tab]"))) {
      const box = b.closest(".dossier"), k = b.dataset.pjTab;
      box.querySelectorAll("[data-pj-tab]").forEach((x) => { const on = x === b; x.classList.toggle("on", on); x.setAttribute("aria-selected", on); });
      box.querySelectorAll("[data-tabp]").forEach((x) => { x.hidden = x.dataset.tabp !== k; if (!x.hidden && !reduced) x.animate([{ clipPath: "inset(0 0 66% 0)", ...STEP }, { offset: 0.5, clipPath: "inset(0 0 33% 0)", ...STEP }, { clipPath: "inset(0 0 0 0)" }], { duration: 120 }); });
      return;
    }
    if ((b = t.closest("[data-pj-cmd]"))) return theaterCmd(b, saveOf(b));
    if ((b = t.closest("[data-pj-give]"))) return giveOut(b, saveOf(b), !!b.closest("[data-pj-host]").querySelector("[data-pj-openapp]")?.checked);
    if ((b = t.closest("[data-pj-copy]"))) return giveOut(b, saveOf(b), false);
    if ((b = t.closest("[data-pj-take]"))) return giveOut(b, saveOf(b), true);
    if ((b = t.closest("[data-pj-recheck]"))) return recheck(b, saveOf(b));
    if ((b = t.closest("[data-pj-detail]"))) return openDrawer(saveOf(b));
    if ((b = t.closest("[data-pj-close]"))) return closeDrawer();
    if ((b = t.closest("[data-pj-inbox]"))) {
      const p = saveOf(b);
      if (root.querySelector(".pj-pop")) return closePops();
      pop(b, `<span class="lab">收件 · ${p.inbox.length} 条待交代</span>${p.inbox.map((n) => `<p class="note"><small>${n.kind} · ${n.at} 投递</small>${esc(n.text)}</p>`).join("")}<p class="small">继续时会一起写进口令；工作台只记“已交代”，不代表已完成。</p>`);
      return;
    }
    if ((b = t.closest("[data-pj-settings]"))) {
      if (root.querySelector(".pj-pop")) return closePops();
      pop(b, '<span class="lab">项目空间设置</span><p class="small">扫描范围、目录深度、隐藏来源与默认伙伴在这里改（预览只有说明）。</p>');
      return;
    }
    if ((b = t.closest("[data-pj-cart]"))) return select(b.dataset.pjCart);
    if ((b = t.closest("[data-pj-vacant]"))) {
      lib.scrollIntoView?.({ block: "start", behavior: reduced ? "auto" : "smooth" });
      setTimeout(() => lib.querySelectorAll("[data-pj-new]:not(:disabled)").forEach((x, i) => setTimeout(() => flash(x), i * 90)), reduced ? 0 : 380);
      return;
    }
    if ((b = t.closest("[data-pj-new]"))) return newSave(b);
    if ((b = t.closest("[data-pj-src]"))) {
      src = b.dataset.pjSrc;
      lib.querySelectorAll("[data-pj-src]").forEach((x) => x.classList.toggle("on", x === b));
      return filterLib();
    }
    if ((b = t.closest("[data-pj-fold]"))) {
      const panel = lib.querySelector("[data-pj-foldpanel]"), i = Number(b.dataset.pjFold), was = b.getAttribute("aria-expanded") === "true";
      lib.querySelectorAll("[data-pj-fold]").forEach((x) => x.setAttribute("aria-expanded", "false"));
      if (was) { await collapseH(panel); panel.hidden = true; return; }
      const f = D.folds[i];
      b.setAttribute("aria-expanded", "true");
      panel.innerHTML = `<div class="fh"><b>${esc(f.name)}</b><small>${esc(f.desc)}</small></div><ul>${f.items.map((x) => `<li><b>${esc(x.name)}</b><small title="${esc(x.path)}">${esc(short(x.path))}</small></li>`).join("")}</ul>`;
      panel.hidden = false; revealH(panel, 200);
      return;
    }
    if ((b = t.closest("[data-pj-rescan]"))) {
      const line = lib.querySelector("[data-pj-scanline]"), txt = lib.querySelector("[data-pj-scantext]"), old = txt.textContent;
      b.disabled = true; txt.textContent = "扫描中…"; line.classList.add("busy");
      const rows = [...lib.querySelectorAll("[data-pj-row]:not([hidden])")];
      for (const r of rows) { flash(r, "rgba(77, 227, 255, 0.14)"); await new Promise((res) => setTimeout(res, reduced ? 0 : 70)); }
      line.classList.remove("busy"); b.disabled = false;
      txt.textContent = old.replace(/扫描于 [^·]+/, `刚刚重新扫描 ${now().slice(6)} `).replace(/$/, "（预览沿用 10/22 的结果）");
      const sh = lib.querySelector("[data-pj-scanshort]"); if (sh) sh.textContent = `刚刚重新扫描 · ${now().slice(6)}`;
      return;
    }
    if ((b = t.closest("[data-pj-refresh]"))) {
      setReadTime();
      root.querySelectorAll(".strip, .cart:not(.empty)").forEach((s, i) => setTimeout(() => flash(s, "rgba(77, 227, 255, 0.10)"), i * 80));
      return;
    }
  });
  lib.querySelector("[data-pj-find]").addEventListener("input", filterLib);
  root.addEventListener("keydown", (e) => {
    if (e.key === "Escape") { closePops(); closeDrawer(); }
    const m = e.target.closest?.("[data-pj-cmd]");
    if (m && ["ArrowDown", "ArrowUp"].includes(e.key)) {
      e.preventDefault();
      const all = [...m.closest("[data-pj-menu]").querySelectorAll("[data-pj-cmd]:not(:disabled)")], i = all.indexOf(m);
      const n = all[(i + (e.key === "ArrowDown" ? 1 : all.length - 1)) % all.length];
      n.focus(); all.forEach((x) => x.classList.toggle("on", x === n));
      return;
    }
    const c = e.target.closest?.("[data-pj-cart]");
    if (c && ["ArrowRight", "ArrowLeft"].includes(e.key)) {
      const carts = [...root.querySelectorAll("[data-pj-cart]")], i = carts.indexOf(c), n = carts[(i + (e.key === "ArrowRight" ? 1 : carts.length - 1)) % carts.length];
      n.focus(); select(n.dataset.pjCart);
    }
  });

  document.addEventListener("click", (e) => {
    if (e.target.closest("[data-pj-navopen]")) { document.body.classList.toggle("pj-nav"); return; }
    if (document.body.classList.contains("pj-nav") && (e.target.closest(".side a") || !e.target.closest(".side"))) document.body.classList.remove("pj-nav");
  });
  if (MODE === "strips") drawStrips();
  else { drawSlots(); boot(saves[0], true); }
  syncNewButtons();
})();
