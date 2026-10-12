// 页面注册表：导航、页头、今日页结构地图共用一份定义，结构依据产品定义 v1.2 §2。
// maturity 是诚实的功能成熟度，不是完成百分比；全部模块仍待真人验收。
export const MATURITY = {
  ready: "可用",
  partial: "部分可用",
  draft: "草稿",
  planned: "规划中",
};

// 分区按产品定义 v1.2 §2.1：今日 → 工作区（资产、目标、运行、知识）→ 生活区 → 系统（存档点在最下方）。
// 数组顺序就是侧栏顺序。
// lead 只写一句；只读 / 本机 / 需授权等边界放 bounds，由 PageHeading 渲染成页头下方的小标签（“!”开头为授权门禁）。
export const PAGES = [
  {
    id: "home",
    group: "今日",
    code: "00",
    label: "世界总览",
    title: "世界总览",
    eyebrow: "TODAY · BASE",
    maturity: "ready",
    lead: "今天的安排、待处理和常用入口，每天从这里开始。",
  },
  {
    id: "inbox",
    group: "今日",
    // 入口在顶栏与今日页；侧栏不重复，给伙伴屏留出空间。
    navHidden: true,
    code: "IN",
    label: "待处理",
    title: "待处理",
    eyebrow: "INBOX",
    maturity: "ready",
    lead: "需要你判断的事项汇总在这里，到对应页面处理。",
    bounds: ["只汇总与跳转", "仅本机可读线索"],
    stage: "汇总 · 跳转",
    plan: {
      will: [
        "汇总能力体检结果、知识整理候选、改版候选、回收发现、夜间结果、协同退回。",
        "每条事项附带来源、建议动作和影响，点击跳到对应页面处理。",
      ],
      route: "路线 2.2（第一版）· 3.4（扩展）",
      needs: "随各功能上线逐类接入；本身不执行任何动作。",
    },
  },
  {
    id: "assets",
    group: "资产",
    code: "01",
    label: "资产仓库",
    title: "资产仓库",
    eyebrow: "ASSET LIBRARY",
    maturity: "ready",
    lead: "Skill、Prompt、工作流、规则模板与焚决在这里收录与迭代，复制后交给任意 Agent，规则还能装进项目。",
    stage: "收集 · 迭代 · 交付",
  },
  {
    id: "references",
    group: "资产",
    code: "02",
    label: "逆向工程",
    title: "逆向工程",
    eyebrow: "REVERSE ENGINEERING",
    maturity: "ready",
    lead: "把参照物逆推成配方，验证能 1:1 复刻，再举一反三。",
    bounds: ["只逆向你提供或公开的材料", "配方经复刻验证才算数"],
    stage: "投入 · 逆推配方 · 复刻验证 · 举一反三 · 炼成 Skill",
  },
  {
    id: "agents",
    group: "目标",
    code: "03",
    label: "智能体群",
    title: "智能体群",
    eyebrow: "SELECT AGENT",
    maturity: "partial",
    lead: "选一位伙伴，接着做没做完的事。",
    bounds: ["会话只在本机读取", "复制前先预览"],
    stage: "发现 · 管理 · 接力",
  },
  {
    id: "projects",
    group: "目标",
    code: "04",
    label: "项目空间",
    title: "项目空间",
    eyebrow: "PROJECTS",
    maturity: "ready",
    lead: "挑一个存档接着干，或从库里开新档。",
    bounds: ["本地与 GitHub 自动发现", "只读 CURRENT 与 Git"],
    stage: "识别 · 对齐 · 交接",
  },
  {
    // 产品定义 v1.2 §2.2：能力体检不再是独立页面，并入智能体群的“能力体检”分区。
    // 保留注册项只为旧链接 #health 与站内搜索能落到该分区（mergedInto + anchor），侧栏不显示。
    id: "health",
    group: "目标",
    navHidden: true,
    mergedInto: "agents",
    anchor: "agent-health",
    code: "03",
    label: "能力体检",
    title: "能力体检",
    eyebrow: "HEALTH CHECK",
    maturity: "partial",
    lead: "检查各 Agent 的 Skill 链接、挂载与副本。",
    bounds: ["问题进入待处理", "!修复需你确认"],
    stage: "检查 · 报告 · 修复",
    plan: {
      will: [
        "只读检查：Skill 链接是否失效、挂载与发布记录是否一致、副本是否落后、Agent 配置是否可读、Hermes gateway 是否在线。",
        "结果进入待处理，附建议动作、影响和恢复方法；修复需要你确认后执行，并复验。",
        "首批修复只做两类低风险动作：清理失效链接、按发布记录重建挂载。",
      ],
      route: "路线 2.2（只读体检）· 4.3（修复）",
      needs: "修复属于真实系统写入，需要你单独授权。",
    },
  },
  {
    id: "collab",
    group: "运行",
    code: "05",
    label: "协同",
    title: "协同",
    eyebrow: "WORKFLOW RUNS",
    maturity: "partial",
    lead: "多 Agent 工作流的全过程：谁做了什么、交给了谁、过没过关。",
    bounds: ["以项目协议文件为准", "口令由你发送"],
    stage: "看板 · 派发",
    plan: {
      will: [
        "已可用：看板按项目 CURRENT.md 推断模板 #1 阶段与持笔者，操作留痕列出状态链、交接文档与复制记录，一键派发生成下一棒口令。",
        "可验证任务自动派发：回归、稳定性矩阵、独立复核派到云端或后台，结果以分支或报告回收进待处理。",
        "执行 + 监工：Codex 执行、Hermes 在后台审查阶段与完成声明（先在一个真实项目上跑通试点）。",
      ],
      route: "路线 2.3（看板与留痕）· 2.4（一键派发）已开发 · 2.5（可验证任务派往云端）· 模板 #2 待试点",
      needs: "监工试点需要你指定一个真实项目；自动通知需要逐项实测消息通道。",
    },
  },
  {
    id: "night",
    group: "运行",
    code: "06",
    label: "夜巡",
    title: "夜巡",
    eyebrow: "NIGHT SHIFT",
    maturity: "planned",
    lead: "登记、预览并批准夜巡任务，在指定窗口接力。",
    bounds: ["默认关闭", "!授权后服务可在指定窗口自动执行", "人民币草稿与 USD 计划分开"],
    stage: "规划",
  },
  {
    id: "knowledge",
    group: "知识",
    code: "07",
    label: "知识仓库",
    title: "知识仓库",
    eyebrow: "KNOWLEDGE",
    maturity: "partial",
    lead: "所有知识库与个人说明的统一源头。",
    bounds: ["只读", "开放给 Agent 需授权"],
    stage: "接入 · 检索 · MCP 授权",
  },
  {
    // 路线 v3 切片 5.2：周视图 + 今天、拖出规划块写入“工作台”日历、todo 读写“工作台”提醒事项；
    // 依赖本机小助手（EventKit），非 macOS 或未授权时页面如实显示，标“部分可用”。
    id: "calendar",
    group: "生活",
    code: "08",
    label: "日历",
    title: "日历",
    eyebrow: "CALENDAR",
    maturity: "partial",
    lead: "在时间轴上拖出规划，旁边别忘了 TodoList。",
    stage: "规划 · 安排",
  },
  {
    id: "notes",
    group: "生活",
    code: "09",
    label: "随手记",
    title: "随手记",
    eyebrow: "QUICK NOTES",
    maturity: "ready",
    lead: "先把念头记下来；值得反复用的，炼入焚决。",
    bounds: ["只存本机"],
    stage: "捕捉",
  },
  {
    // 路线 v3 切片 5.3：公开只读接口 + 本机缓存。接口字段映射尚未在本机对真实接口实测，标“部分可用”。
    id: "aihot",
    group: "生活",
    code: "10",
    label: "AI HOT",
    title: "AI HOT",
    eyebrow: "AI HOT · DAILY",
    maturity: "partial",
    lead: "今天 AI 圈的精选与热点，细节去原站看。",
    bounds: ["aihot.news 公开接口"],
    stage: "浏览 · 收藏",
  },
  {
    // 收藏画布沿用旧地址；旧书架已按用户要求撤下。
    id: "learning",
    group: "生活",
    code: "11",
    label: "收藏",
    title: "收藏",
    eyebrow: "COLLECTION",
    maturity: "partial",
    lead: "把刷到的好帖子摊在桌上，随手分组。",
    bounds: ["收藏保存在本机"],
    stage: "收录 · 整理",
  },
  {
    id: "settings",
    group: "系统",
    code: "13",
    label: "设置",
    title: "设置",
    eyebrow: "SETTINGS",
    maturity: "partial",
    lead: "所有设置与授权都在这里；开启前先预览。",
    bounds: ["默认关闭", "开启前预览"],
    stage: "数据 · 模型",
  },
  {
    // 产品定义 v1.2 §2.2：存档点下移到系统分组最下方；单个资产的版本在资产详情的“历史”标签里查看。
    id: "history",
    group: "系统",
    code: "14",
    label: "存档点",
    title: "存档点",
    eyebrow: "SAVE POINTS",
    maturity: "ready",
    lead: "每个项目的存档点：改来改去也能找回。",
    bounds: ["只提交，不推送", "回退交给 Agent"],
    stage: "追溯 · 恢复",
  },
];

export const page = (id) => PAGES.find((p) => p.id === id);
export const GROUPS = ["今日", "资产", "目标", "运行", "知识", "生活", "系统"];

// 侧栏四段（产品定义 v1.2 §2.2）：工作区与生活区之间有分隔线和区名。
export const ZONES = [
  { id: "today", label: "今日", groups: ["今日"] },
  { id: "work", label: "工作区", en: "WORK", groups: ["资产", "目标", "运行", "知识"] },
  { id: "life", label: "生活区", en: "LIFE", groups: ["生活"] },
  { id: "system", label: "系统", en: "SYSTEM", groups: ["系统"] },
];

// 已撤销的独立页面：旧链接落到哪个页面的哪个类型标签。
// 焚决（切片 1.3b）：用户 2026-09-30 纠正，焚决是资产仓库第五种类型；#scrolls 落到资产仓库“焚决”标签。
const RETIRED = {
  scrolls: { route: "assets", anchor: null, filter: "Scroll" },
  silver: { route: "home", anchor: null },
};

// 并入其他页面的旧路由（如 #health）落到哪里：返回实际页面、页内锚点，以及要选中的资产类型标签（如有）。
export function resolveRoute(id) {
  const nightMorning = /^night\/morning\/([^/]+)$/.exec(id || "");
  if (nightMorning) {
    try { return { route: "night", anchor: null, nightRunId: decodeURIComponent(nightMorning[1]) }; }
    catch { return { route: "night", anchor: null }; }
  }
  const nightReport = /^night\/report\/([^/]+)\/([^/]+)$/.exec(id || "");
  if (nightReport) {
    try { return { route: "night", anchor: null,
      reportTarget: { runId: decodeURIComponent(nightReport[1]), slotId: decodeURIComponent(nightReport[2]) } }; }
    catch { return { route: "night", anchor: null }; }
  }
  if (Object.hasOwn(RETIRED, id)) return { ...RETIRED[id] };
  const p = page(id);
  if (!p) return { route: "home", anchor: null };
  return p.mergedInto
    ? { route: p.mergedInto, anchor: p.anchor || null }
    : { route: p.id, anchor: null };
}

// 结构地图（产品定义 v1.2 §2.1），供今日页使用：工作区四组 + 生活区；今日与系统不在地图内。
export const LAYERS = [
  { id: "资产", zone: "work", en: "ASSETS", question: "我有什么", pages: ["assets", "references"] },
  { id: "目标", zone: "work", en: "TARGETS", question: "交给谁、在哪里", pages: ["agents", "projects"] },
  { id: "运行", zone: "work", en: "RUNTIME", question: "怎么跑起来", pages: ["collab", "night"] },
  { id: "知识", zone: "work", en: "KNOWLEDGE", question: "我知道什么", pages: ["knowledge"] },
  {
    id: "生活",
    zone: "life",
    en: "LIFE",
    question: "我的日子",
    pages: ["calendar", "notes", "aihot", "learning"],
  },
];
