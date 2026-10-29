// 逆向工程第二轮三版样稿的共用数据与小工具（方案 docs/product/2026-10-29-逆向工程定位与重构方案.md）。
// 数据：正式库 revision 1022 只读摘录。「Agent迁移和上下文接力功能」真实问过两轮（10/15 被挡在目标不匹配，10/16 拿到 8 条结论、9 个未知）。
// 三版共用一个洞察：每一轮回来的「未知」，就是下一轮该问的问题；懂得够多了，就收成一份 Skill。
window.RV = (() => {
  const reduced = (() => { try { return matchMedia("(prefers-reduced-motion: reduce)").matches; } catch { return true; } })();
  const STEP = { easing: "steps(1, end)" };
  const pad2 = (n) => String(n).padStart(2, "0");
  const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];

  // 第 2 轮的结论，按「拆出来的部件」整理（文字取自原结论，只做缩写）
  const KNOWN = [
    { id: "k-route-m", area: "迁移", kind: "路由", name: "/agents/migration", mark: "观察", ev: 3, text: "主脚本里有 /agents/migration 路由属性，迁移入口有静态证据。" },
    { id: "k-route-t", area: "迁移", kind: "路由", name: "/agents/migration/:taskId", mark: "观察", ev: 3, text: "带 taskId 的迁移路径有静态证据，页面之间的实际跳转关系还不明确。" },
    { id: "k-route-h", area: "交接", kind: "路由", name: "/agents/work-handoff", mark: "观察", ev: 3, text: "主脚本里有 /agents/work-handoff 路由属性。" },
    { id: "k-api-mp", area: "迁移", kind: "接口", name: "migration-packages", mark: "观察", ev: 4, text: "se.post 调用候选 /agent-mirror/migration-packages；只看到调用位置和字符串，没有请求字段和响应结构。" },
    { id: "k-api-cp", area: "交接", kind: "接口", name: "context-packs", mark: "观察", ev: 4, text: "se.post 调用候选 /agent-mirror/context-packs。" },
    { id: "k-api-sn", area: "未归属", kind: "接口", name: "snapshots", mark: "观察", ev: 4, text: "se.post 调用候选 /agent-mirror/snapshots；不能从命名推断有回滚能力。" },
    { id: "k-api-cf", area: "未归属", kind: "接口", name: "context-files", mark: "观察", ev: 5, text: "/asset-imports/local-agent/context-files 调用候选，和迁移包、上下文包的关系没建立。" },
    { id: "k-api-sd", area: "未归属", kind: "接口", name: "skill-directories", mark: "观察", ev: 5, text: "/asset-imports/local-agent/skill-directories 调用候选，关系同样没建立。" },
    { id: "k-br-m", area: "迁移", kind: "分支", name: "Agent 迁移", mark: "推断", ev: 6, text: "按路由和接口命名，可以分出「Agent 迁移」一支，migration-packages 是它的候选数据产物。" },
    { id: "k-br-h", area: "交接", kind: "分支", name: "工作交接", mark: "推断", ev: 6, text: "另一支是「工作交接」，context-packs 是它的候选数据产物。" },
  ];
  const UNKNOWN = [
    { id: "u1", area: "界面", q: "迁移与交接页面的实际控件、步骤、表单字段和提示文案是什么？", short: "界面与步骤" },
    { id: "u2", area: "接口", q: "接口的完整地址、请求和响应 schema、鉴权、错误码，以及和页面事件怎么绑定？", short: "接口协议" },
    { id: "u3", area: "范围", q: "支持哪些源 Agent、目标 Agent？迁移是否涉及配置、技能、记忆、会话或项目文件？", short: "迁移范围" },
    { id: "u4", area: "数据", q: "迁移包、上下文包、快照的格式、字段、版本、大小限制和相互引用？", short: "包的格式" },
    { id: "u5", area: "交接", q: "上下文接力是生成文本、生成文件、复制提示词、导入会话，还是恢复运行状态？", short: "接力方式" },
    { id: "u6", area: "任务", q: "taskId 从哪来？任务生命周期、进度、失败恢复、重复提交和取消怎么处理？", short: "任务生命周期" },
    { id: "u7", area: "写入", q: "目标端怎么写入？权限确认、冲突处理、回滚和写后回读有没有？", short: "写入与回滚" },
    { id: "u8", area: "源码", q: "能否拿到 source map、组件实现或服务端代码，做事件处理器级检索？", short: "源码与事件" },
    { id: "u9", area: "效果", q: "实际交互效果、迁移成功率、上下文保真度和目标 Agent 能否接着干活？", short: "实际效果" },
  ];
  const ROUNDS = [
    { n: 1, at: "10/15", by: "Codex", asked: "想弄懂「Agent迁移和上下文接力功能」；目标 app.luzi.top/community", status: "阻断", statusText: "取证被挡：调试窗口里没有 /community 页（TARGET_URL_MISMATCH）",
      obs: 2, infer: 1, unknown: 4, unknownList: ["/community 有没有打开、是否被重定向", "Agent 迁移的对象、源端与目标端、入口和完成状态", "上下文接力包含哪些信息，怎么选择、传递、恢复", "相关模块、接口、数据结构、权限和存储"] },
    { n: 2, at: "10/16", by: "Codex", asked: "改投 app.luzi.top/agents，带 8 个线索词：migration、handoff、context、session……", status: "部分", statusText: "拿到 2 个脚本的静态证据；source map 取不到，完整性 partial",
      obs: 7, infer: 1, unknown: 9 },
  ];
  const R = [
    { id: "r2", title: "Agent迁移和上下文接力功能", nick: "炉子", kind: "web", src: "app.luzi.top/agents", full: "https://app.luzi.top/agents", at: "10/15",
      want: "Agent迁移和上下文接力功能", clues: ["/agents/migration", "/agents/work-handoff", "migration", "handoff", "context", "session", "export", "import"], rounds: ROUNDS, known: KNOWN, unknown: UNKNOWN },
    { id: "r3", title: "全部", nick: "社区页", kind: "web", src: "app.luzi.top/community", full: "https://app.luzi.top/community", at: "10/15", want: "全部", clues: [],
      rounds: [{ n: 1, at: "10/15", by: "REA", asked: "想弄懂「全部」", status: "失败", statusText: "旧版本机取证失败，没有结论", obs: 0, infer: 0, unknown: 0 }], known: [], unknown: [] },
    { id: "r1", title: "验收 · 原生 REA 全能力 · 自建样本", nick: "验收样本", kind: "local", src: "fixture-bin", full: "…/work/reverse-native572/fixture-bin", at: "10/20",
      want: "只读确认 Mach-O 架构、文件 SHA256 和 add_demo 符号", clues: [], rounds: [], known: [], unknown: [] },
  ];

  function pack(r, questions, extra) {
    const n = (r.rounds.length || 0) + 1;
    return [
      `# 拆解任务 · 第 ${n} 轮：${r.title}`,
      `参照物：${r.full}`,
      `想弄懂：${r.want}`,
      r.rounds.length ? `上一轮（${r.rounds.at(-1).at}）已经知道：${r.known.filter((k) => k.mark === "观察").map((k) => k.name).join("、") || "（无）"}` : null,
      questions.length ? "这一轮只回答下面这些问题：" : "这一轮先做一次完整取证。",
      ...questions.map((q, i) => `${i + 1}. ${q}`),
      extra ? `另外：${extra}` : null,
      "做法：用你本机已注册的 rea MCP 取证；结论分观察 / 推断 / 未知，每条写证据；只分析，不修改任何项目。",
      "最后用一个 Markdown 块写「可复用做法」，我会存成 Skill。",
    ].filter(Boolean).join("\n");
  }

  const G = {
    0: "01110100011001110101110011000101110", 1: "00100011000010000100001000010001110", 2: "01110100010000100010001000100011111",
    3: "11111000100010000010000011000101110", 4: "00010001100101010010111110001000010", 5: "11111100001111000001000011000101110",
    6: "00110010001000011110100011000101110", 7: "11111000010001000100010000100001000", 8: "01110100011000101110100011000101110",
    9: "01110100011000101111000010001001100", "/": "00001000010001000100010001000010000",
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
    el.dataset.text = text;
    if (roll && !reduced) el.firstElementChild.animate([3, 2, 1, 0].map((k, i) => ({ offset: i / 3, clipPath: `inset(0 0 ${k * 33}% 0)`, ...STEP })).concat({ clipPath: "inset(0 0 0 0)" }), { duration: 160 });
  }
  const lcds = (root = document, roll) => { for (const el of $$("[data-lcd]", root)) if (el.dataset.text !== el.dataset.lcd || roll) lcd(el, el.dataset.lcd, roll); };
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
  function toast(text) {
    const t = $("[data-rv-toast]"); if (!t) return;
    t.textContent = text; t.hidden = false; clearTimeout(toast.id); toast.id = setTimeout(() => (t.hidden = true), 2400);
  }
  async function copy(btn, text, to = "Codex") {
    try { await navigator.clipboard?.writeText(text); } catch {}
    await fly(btn, partner());
    dispatchEvent(new Event("guiji:data-caught"));
    toast(`已复制，去 ${to} 里粘贴。只复制，不自动发送。`);
  }

  // 标本切换（三版共用的页头一行）
  function switcher(cur, onPick) {
    const el = $("[data-rv-switch]");
    const draw = () => {
      el.innerHTML = R.map((r) => `<button class="rv2-sw${r.id === cur() ? " on" : ""}" data-pick="${r.id}" aria-pressed="${r.id === cur()}"><b>${esc(r.nick)}</b><small>${esc(r.title === r.nick ? r.src : r.title)}</small></button>`).join("") +
        `<button class="rv2-sw add" data-rv-new><b>＋ 投入参照物</b><small>链接、截图或本机路径</small></button>`;
    };
    el.addEventListener("click", (e) => {
      const b = e.target.closest("[data-pick]"); if (b) { onPick(b.dataset.pick); draw(); }
      if (e.target.closest("[data-rv-new]")) toast("样稿：这里会弹出「投入参照物」（参照物 + 想弄懂什么）。");
    });
    draw();
  }
  document.addEventListener("click", (e) => {
    if (e.target.closest("[data-pj-navopen]")) { document.body.classList.toggle("pj-nav"); return; }
    if (document.body.classList.contains("pj-nav") && !e.target.closest(".side")) document.body.classList.remove("pj-nav");
  });

  return { R, KNOWN, UNKNOWN, ROUNDS, pack, lcd, lcds, fly, partner, toast, copy, switcher, reduced, STEP, pad2, esc, $, $$ };
})();
