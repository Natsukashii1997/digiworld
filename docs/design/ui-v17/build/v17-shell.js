// UI v17 视觉稿：在真实页面上做最小 DOM 搬移，配合 v17-layer.css。仅用于出稿，不进 src。
// 参数 window.__v17 = { showcase: bool, signal: number|0 }
(() => {
  const opt = window.__v17 || {};
  const CODES = { 资产仓库: "01", 逆向工程: "02", 智能体群: "03", 项目空间: "04", 协同: "05", 夜巡: "06", 知识仓库: "07", 日历: "08", 随手记: "09", "AI HOT": "10", 收藏: "11", 银饰计划: "12", 设置: "13", 存档点: "14" };
  const sb = document.querySelector(".sidebar");
  if (!sb || sb.dataset.v17) return;
  sb.dataset.v17 = "1";
  document.documentElement.classList.add("v17");
  const code = (t) => Object.assign(document.createElement("i"), { className: "v17-code", textContent: t });

  // 机身上部：品牌行（= 00 世界总览）+ 伙伴屏
  const brand = sb.querySelector(".brand"), partner = sb.querySelector(".partner"), nav = sb.querySelector(".nav");
  brand.append(code("00"));
  if (location.hash === "#home" || !location.hash) brand.classList.add("v17-here");
  const bezel = Object.assign(document.createElement("div"), { className: "v17-bezel" });
  bezel.append(brand, partner);
  // 电源灯 = 保存状态（绿：已保存，黄闪：保存中，红：保存失败）
  const led = Object.assign(document.createElement("span"), { className: "v17-led", title: "已保存到本机" });
  partner.append(led);
  if (opt.signal) {
    const s = Object.assign(document.createElement("span"), { className: "v17-signal" });
    s.innerHTML = `<b>!${opt.signal}</b><span><small>QUEST</small>待处理 ${opt.signal} 件</span>`;
    partner.append(s);
  }

  // 顶栏三个键并入机身
  const tb = document.querySelector(".topbar");
  const search = tb.querySelector(".topbar-search"), inbox = tb.querySelector(".topbar-inbox");
  const note = [...tb.querySelectorAll(".topbar-actions > .icon-button")].find((b) => b !== inbox);
  const keys = Object.assign(document.createElement("div"), { className: "v17-keys" });
  // 手机顶栏保留搜索与待处理的副本（视觉稿用）
  const actions = tb.querySelector(".topbar-actions");
  [search, inbox].forEach((b) => {
    const c = b.cloneNode(true);
    if (c.classList.contains("topbar-search")) {
      c.className = "icon-button";
      c.innerHTML = search.querySelector("svg").outerHTML;
    }
    c.classList.add("v17-mobile-key");
    c.setAttribute("aria-hidden", "true");
    actions.append(c);
  });
  search.querySelector("span").textContent = "搜索";
  keys.append(search, inbox, note);
  sb.prepend(bezel);
  bezel.after(keys);

  // 卡带脊：编号替代线描图标
  nav.querySelectorAll(".nav-item").forEach((b) => {
    const t = b.querySelector("span").textContent.trim();
    b.prepend(code(CODES[t] || "--"));
  });

  // 系统区（设置、存档点）做成机身底部的两颗系统键
  const sys = nav.querySelector(".nav-zone-system");
  if (sys) {
    const row = Object.assign(document.createElement("div"), { className: "v17-syskeys" });
    sys.querySelectorAll(".nav-item").forEach((b) => row.append(b));
    sys.remove();
    sb.append(row);
  }

  // 页面层
  const main = document.querySelector(".main-content");
  if (opt.showcase) main.classList.add("v17-showcase");
  main.querySelectorAll(".cover-uses").forEach((n) => n.textContent.trim() === "0" && n.classList.add("v17-zero"));
  main.querySelectorAll(".card-body p").forEach((p) => /还没有一句话说明/.test(p.textContent) && p.classList.add("v17-placeholder"));
  window.dispatchEvent(new Event("resize"));
})();
