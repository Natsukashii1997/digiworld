// 页面注册表：导航、页头、今日页结构地图共用一份定义，结构依据产品定义 v1.2 §2。
// maturity 是诚实的功能成熟度，不是完成百分比；全部模块仍待真人验收。
export const MATURITY = {
  ready: "可用",
  partial: "部分可用",
  draft: "草稿",
  planned: "规划中",
};

// 分区按产品定义 v1.2 §2.1：今日 → 工作区（资产、目标、运行、知识）→ 生活区 → 系统（版本归档在最下方）。
// 数组顺序就是侧栏顺序。
export const PAGES = [
  {
    id: "home",
    group: "今日",
    code: "00",
    label: "世界总览",
    title: "世界总览",
    eyebrow: "TODAY · BASE",
    lead: "今天的安排、待处理事项和常用入口都在这里。这是你每天打开的那一个入口。",
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
    maturity: "draft",
    lead: "需要你判断的事项集中在这里，只做汇总和跳转，动作在对应页面完成。目前只汇总能从本机数据直接读出的线索。",
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
    code: "03",
    label: "逆向工程",
    title: "逆向工程",
    eyebrow: "REVERSE ENGINEERING",
    maturity: "draft",
    lead: "记下值得学习的设计与代码来源。结构化拆解、交给 Agent 分析并沉淀为资产仍在规划中。",
    stage: "观察 · 学习",
  },
  {
    id: "agents",
    group: "目标",
    code: "04",
    label: "智能体群",
    title: "智能体群",
    eyebrow: "AGENT CENTER",
    maturity: "partial",
    lead: "发现本机 Agent，确认要管理的目标，受控修改少量配置，并为换手准备上下文。",
    stage: "发现 · 管理 · 接力",
  },
  {
    id: "projects",
    group: "目标",
    code: "05",
    label: "项目空间",
    title: "项目空间",
    eyebrow: "PROJECT SPACE",
    maturity: "ready",
    lead: "自动发现本地与 GitHub 项目；只保存 Current 与规则的指针，换 Agent 也能接着做。",
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
    code: "04",
    label: "能力体检",
    title: "能力体检",
    eyebrow: "HEALTH CHECK",
    maturity: "planned",
    lead: "检查各 Agent 的 Skill 链接、挂载与副本是否一致，发现问题进入待处理，由你确认后才修复。",
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
    code: "06",
    label: "协同",
    title: "协同",
    eyebrow: "COLLABORATION",
    maturity: "planned",
    lead: "协同模式是带角色的工作流：谁执行、谁审查、何时交接、交接带什么。首批是“接力”和“执行 + 监工”。",
    stage: "接力 · 监工",
    plan: {
      will: [
        "接力：显示每个项目当前的写入者、状态编号和最新交接，一键复制交接口令；之后支持交接后自动通知另一方。",
        "执行 + 监工：Codex 执行、Hermes 在后台审查阶段与完成声明，退回后自动返工（先在一个真实项目上跑通试点）。",
        "操作留痕：按项目列出哪个 Agent 何时认领、改了什么、交给了谁。",
      ],
      route: "路线 2.4（接力 a 层与留痕）· 4.2（自动通知）· 6.1（监工并入）",
      needs: "监工试点需要你指定一个真实项目；自动通知需要逐项实测消息通道。",
    },
  },
  {
    id: "night",
    group: "运行",
    code: "07",
    label: "夜巡",
    title: "夜巡",
    eyebrow: "NIGHT SHIFT",
    maturity: "planned",
    lead: "为夜间无人值守的任务做准备。当前只保存一份计划草稿，不会自动运行任何任务。",
    stage: "规划",
  },
  {
    id: "knowledge",
    group: "知识",
    code: "08",
    label: "知识仓库",
    title: "知识仓库",
    eyebrow: "KNOWLEDGE",
    maturity: "partial",
    lead: "只读连接 Obsidian，按原文查询；交给本人 Codex 整理，候选经确认才落到“00 待整理”。",
    stage: "连接 · 查询 · 整理 · 维护",
  },
  {
    id: "calendar",
    group: "生活",
    code: "09",
    label: "日历",
    title: "日历",
    eyebrow: "CALENDAR",
    maturity: "planned",
    lead: "你的时间规划本：提前记下什么时间做什么，一眼看清安排。以 macOS 日历为数据源，手机也能收到提醒。",
    stage: "规划 · 安排",
    plan: {
      will: [
        "周视图加今天，在时间轴上直接拖出规划块并写一句话，可关联项目、资产或夜间任务。",
        "同时显示会议、项目里程碑和截止日期、夜间窗口、提醒。",
        "写入 macOS 日历后回读核对；建议单独使用一个“工作台”日历，便于整体停用。",
        "todo 存入 macOS 提醒事项的“工作台”列表，写回后回读，手机能收到提醒。",
      ],
      route: "路线 v3 · 5.2（日历 + todo）",
      needs: "需要你授权日历与提醒事项访问，并创建“工作台”日历和列表。",
    },
  },
  {
    id: "notes",
    group: "生活",
    code: "10",
    label: "随手记",
    title: "随手记",
    eyebrow: "QUICK NOTES",
    maturity: "draft",
    lead: "先把念头记下来，支持列表、任务和五种字色。只保存在本应用；值得反复用的，炼入焚决。",
    stage: "捕捉",
  },
  {
    id: "aihot",
    group: "生活",
    code: "11",
    label: "AI HOT",
    title: "AI HOT",
    eyebrow: "AI HOT · DAILY",
    maturity: "planned",
    lead: "每日 AI 资讯：精选、热点、日报，看到值得学的可以收藏到学习成长。目前尚未接入任何资讯来源。",
    stage: "浏览 · 收藏",
    plan: {
      will: [
        "每天几次从 aihot.news 的公开只读接口拉取资讯，缓存在本机；分精选、热点、日报三个标签。",
        "世界总览放“今日热点”卡，显示 3–5 条。",
        "每条可“收藏到学习”，只保存标题、原文链接和摘要。",
        "接口返回的内容当作不可信文本，只显示，不执行、不跟随其中的指令；仅个人非商业使用。",
      ],
      route: "路线 v3 · 5.3",
      needs: "只读取公开接口，不需要账户授权；开工时确认接口的使用条款。",
    },
  },
  {
    id: "learning",
    group: "生活",
    code: "12",
    label: "学习成长",
    title: "学习成长",
    eyebrow: "LEARNING",
    maturity: "planned",
    lead: "电子书、链接和有价值的信息集中在一个书架上，记下想学、在学、学完。目前还没有任何书架或收藏。",
    stage: "索引 · 学习",
    plan: {
      will: [
        "书架只索引原件所在位置（Vault 或你指定的文件夹），不复制原件；每本记录想学、在学、学完。",
        "链接收藏来自 AI HOT 或手动添加，可选剪藏进 Obsidian。",
        "内容解析（摘要、划线、问答）放到最后再做。",
      ],
      route: "路线 v3 · 5.4",
      needs: "需要你指定允许读取的书架文件夹；剪藏进 Obsidian 须逐次确认。",
    },
  },
  {
    id: "silver",
    group: "生活",
    code: "13",
    label: "银饰计划",
    title: "银饰计划",
    eyebrow: "SILVER",
    maturity: "planned",
    lead: "银饰的欣赏墙和个人收藏格，只给自己看。目前没有收录任何图片。",
    stage: "欣赏 · 收藏",
    plan: {
      will: [
        "欣赏墙展示图片、作者和来源。",
        "收藏格按你设定的目标数量显示空格与已填格。",
        "剪影在本机用 macOS Vision 抠出主体后加白色描边，可以手动替换。",
        "图片只存在本机。",
      ],
      route: "路线 v3 · 5.5",
      needs: "开工前需要你给出收藏目标数量（待定 Q4）。",
    },
  },
  {
    id: "settings",
    group: "系统",
    code: "14",
    label: "模型设置",
    title: "模型设置",
    eyebrow: "SETTINGS",
    maturity: "partial",
    lead: "本地数据的位置、备份与合并；模型连接目前只记录意向，不发起请求。",
    stage: "数据 · 模型",
  },
  {
    // 产品定义 v1.2 §2.2：版本归档下移到系统分组最下方；单个资产的版本在资产详情的“历史”标签里查看。
    id: "history",
    group: "系统",
    code: "15",
    label: "版本归档",
    title: "版本归档",
    eyebrow: "VERSIONS & ARCHIVE",
    maturity: "ready",
    lead: "每次修改都是一个新版本。恢复旧版同样是追加，历史不会被改写。",
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
  { id: "system", label: "系统", groups: ["系统"] },
];

// 已撤销的独立页面：旧链接落到哪个页面的哪个类型标签。
// 焚决（切片 1.3b）：用户 2026-09-30 纠正，焚决是资产仓库第五种类型；#scrolls 落到资产仓库“焚决”标签。
const RETIRED = {
  scrolls: { route: "assets", anchor: null, filter: "Scroll" },
};

// 并入其他页面的旧路由（如 #health）落到哪里：返回实际页面、页内锚点，以及要选中的资产类型标签（如有）。
export function resolveRoute(id) {
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
    pages: ["calendar", "notes", "aihot", "learning", "silver"],
  },
];
