// UI v19 · 逆向工程 v6 三版共用：合成数据 + 板块片段。LCD 数字用 v19-reverse-r2.js 的 RV.lcds 画（工作台原样点阵）。
(() => {
const STEPS = [["确认", ""], ["拆前计划", "⏸"], ["取证", ""], ["交回执", "⏸"], ["复刻验证", "⏸"], ["写 Skill", "⏸"]];
const STAGE = { plan: ["计划中", "m", -1], sent: ["取证中", "c", 2], review: ["回执待过目", "y", 3], copy: ["复刻中", "c", 4], done: ["已收成", "g", 6], hold: ["搁置", "r", 0] };
const ITEMS = [
  { no: "01", id: "luzi", nick: "炉子", kind: "网站", src: "app.luzi.top/agents", want: "Agent 迁移和上下文接力", why: "迁移时连上下文一起带走，接手方不用重读历史", stage: "review", rounds: 2, caps: 4, ev: 3, miss: 5, rep: null, by: "Codex", at: "10/16", next: "过目第 2 轮回执", act: "预览并采纳" },
  { no: "02", id: "codex", nick: "Codex 桌面版", kind: "桌面应用", src: "/Applications/Codex.app", want: "会话怎么交给另一个 Agent", stage: "copy", rounds: 1, caps: 5, ev: 6, miss: 2, rep: "3/5", by: "Claude Code", at: "10/29", next: "等复刻对照交回", act: "复制提醒话术" },
  { no: "03", id: "feishu", nick: "飞书多维表格", kind: "网站", src: "feishu.cn/base", want: "公式字段怎么做到实时校验", stage: "sent", rounds: 1, caps: 3, ev: 0, miss: 0, rep: null, by: "Codex", at: "10/30", next: "等回执", act: "粘贴回执" },
  { no: "04", id: "arc", nick: "Arc 浏览器", kind: "桌面应用", src: "/Applications/Arc.app", want: "侧栏分组的交互", stage: "plan", rounds: 0, caps: 0, ev: 0, miss: 0, rep: null, by: "", at: "10/30", next: "复制开场话术", act: "复制开场话术" },
  { no: "05", id: "linear", nick: "Linear", kind: "网站", src: "linear.app", want: "命令面板", stage: "done", rounds: 2, caps: 4, ev: 7, miss: 0, rep: "4/4", by: "Claude Code", at: "10/12", out: "命令面板 v2", uses: 6, next: "—", act: "" },
  { no: "06", id: "community", nick: "社区页", kind: "网站", src: "app.luzi.top/community", want: "全部", stage: "hold", rounds: 1, caps: 0, ev: 0, miss: 0, rep: null, by: "REA", at: "10/15", next: "目标打不开，先搁置", act: "" },
];
const CAPS = [
  { name: "Agent 迁移", known: "入口 /agents/migration、/migration/:taskId；数据走 migration-packages 接口", miss: "迁移包的字段和大小限制", ev: ["E3", "E4"] },
  { name: "工作交接", known: "入口 /agents/work-handoff；数据走 context-packs 接口", miss: "接力是生成文本、文件，还是恢复运行状态", ev: ["E3", "E4"] },
  { name: "快照与回滚", known: "有 snapshots 接口调用", miss: "回滚路径没看到，不能从命名推断", ev: ["E4"] },
  { name: "本机导入", known: "context-files、skill-directories 两个导入接口", miss: "和迁移包、上下文包的关系", ev: ["E5"] },
];
const SLOTS = [["用途", "把会话、文件、Skill 迁到另一个 Agent", ""], ["结构", "迁移 / 交接两支，各一组路由和接口", ""], ["数据", "", "包的格式、字段、版本"], ["流程", "建任务 → 打包 → 导入", "taskId 的生命周期"],
  ["界面", "", "实际控件、步骤、提示文案"], ["边界", "只有静态证据，source map 取不到", ""], ["写入与回滚", "", "导入失败怎么回滚"], ["验收", "", "没真的走一遍"]];
const EVID = [["E3", "主脚本 index-8f2.js · 路由 /agents/migration、/agents/work-handoff"], ["E4", "se.post 调用候选 migration-packages、context-packs、snapshots"], ["E5", "/asset-imports/local-agent/context-files、skill-directories"]];
const lcd = (v, c = "", h) => `<span class="lcd ${c}" data-lcd="${v}"${h ? ` style="--h:${h}px"` : ""}></span>`;
const tag = (it) => `<span class="tg ${STAGE[it.stage][1]}">${STAGE[it.stage][0]}</span>`;
const B = {
  rail(it, counts) { // it：单件的位置；counts：总览时每步有几件
    const at = it ? STAGE[it.stage][2] : -2;
    return `<div class="rail">${STEPS.map(([n, p], i) => { const cls = it ? (it.stage === "hold" && i === 0 ? "fail" : i < at ? "done" : i === at ? "cur" : "todo") : "todo";
      return `<div class="st ${cls}"><span class="dot">${cls === "done" ? "✓" : cls === "fail" ? "✕" : i}</span><b>${n}</b><em class="${p ? "p" : ""}">${p ? "⏸ 停下等你" : "Agent 自己做"}</em>${counts ? `<span class="n">${lcd(String(counts[i]).padStart(2, "0"), counts[i] ? "o" : "m")}</span>` : ""}</div>`; }).join("")}</div>`;
  },
  stats: (it) => `<div class="stats"><div><span>轮次</span>${lcd("0" + it.rounds, "c")}<small>最近 ${it.at} · ${it.by}</small></div><div><span>能力</span>${lcd("0" + it.caps)}<small>拆前计划列的</small></div><div><span>证据</span>${lcd("0" + it.ev, "c")}<small>E3–E5</small></div><div><span>缺口</span>${lcd("0" + it.miss, "y")}<small class="y">下一轮可以问</small></div><div><span>复刻</span>${lcd("0/4", "m")}<small>回执过目后派</small></div></div>`,
  pend: () => `<div class="pend"><i></i><div><b>AI 交回了第 2 轮回执</b><small>reverse_report · 10/16 23:10 · 采纳前先预览，采纳后写进档案</small></div><button class="btn6 go sm">预览并采纳</button><button class="btn6 sm">退回</button></div>`,
  nn: () => `<div class="nn"><div><span class="l">现在</span><b>分出「Agent 迁移」「工作交接」两支，各有入口路由和数据接口</b><small>第 2 轮结论 · 10/16 · Codex</small></div><div><span class="l o">下一步</span><b>过目回执，再决定：追问缺口，还是派复刻</b><div class="acts"><button class="btn6 cy sm">复制「追问下一轮」</button><button class="btn6 sm">复制「开始复刻」</button></div></div></div>`,
  caps: () => `<div class="sub3">能力清单<small>4 项 · 已知 4 · 缺 4</small></div><ol class="caps">${CAPS.map((c, i) => `<li><span class="i">0${i + 1}</span><b>${c.name}</b><p><span class="k1">已知</span><span>${c.known} ${c.ev.map((e) => `<span class="ev">${e}</span>`).join(" ")}</span></p><p class="ms"><span class="k1">缺</span>${c.miss}</p></li>`).join("")}</ol>`,
  slots: () => `<div class="sub3">八格<small>已知 ${SLOTS.filter((s) => s[1]).length} · 缺 ${SLOTS.filter((s) => s[2]).length}</small></div><div class="slots">${SLOTS.map(([n, k, m]) => { const c = m && !k ? "e" : m ? "h" : "f";
    return `<div class="${c}"><b>${n}<i>${c === "f" ? "已知" : c === "h" ? "半格" : "空"}</i></b>${k ? `<span>${k}</span>` : ""}${m ? `<em>缺：${m}</em>` : ""}</div>`; }).join("")}</div>`,
  evid: () => `<div class="sub3">证据<small>3 条</small></div><ul class="evl">${EVID.map(([k, v]) => `<li><b>${k}</b>${v}</li>`).join("")}</ul>`,
  hist: () => `<div class="sub3">历次<small>2 轮</small></div><ul class="hist"><li><span class="tg r">✕</span>第 1 轮 · 10/15 · Codex · 被挡，没有结论<a>话术</a><a>回执</a></li><li><span class="tg g">✓</span>第 2 轮 · 10/16 · Codex · 4 项能力、3 条证据<a>话术</a><a>回执</a></li></ul>`,
  out: () => `<div class="sub3">产出<small>Skill</small></div><div class="outc"><span class="eg">◇</span><div>还没有 Skill。复刻对上之后写，写好交回这里存进资产仓库。</div></div>`,
};
window.RV6 = { STEPS, STAGE, ITEMS, B, lcd, tag };
})();
