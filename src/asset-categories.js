// 资产分类与状态标识（#93，用户 2026-11-19 定稿）：前后端共用。
// 分类：Prompt 与 Skill 一条一个主分类，决定图标、分类标签与标题荧光笔的颜色；颜色只能取固定色板。
// 没手动选过分类的，按标题、说明、标签里的关键词自动归组；归不进的算「待归类」。
// 状态标识（NEW / HOT / UPD / IDLE）由数据实时算出，不入库；一张卡最多两个。

export const CATEGORY_COLORS = Object.freeze({
  violet: "var(--violet)",
  orange: "var(--orange)",
  blue: "var(--blue)",
  green: "var(--lcd)",
  pink: "var(--pink)",
  yellow: "var(--yellow)",
});

export const DEFAULT_CATEGORIES = Object.freeze([
  { id: "think", name: "思考决策", color: "violet" },
  { id: "biz", name: "业务落地", color: "orange" },
  { id: "dev", name: "开发工程", color: "blue" },
  { id: "retro", name: "复盘与知识", color: "green" },
  { id: "design", name: "设计表达", color: "pink" },
  { id: "ops", name: "本机运维", color: "yellow" },
]);

// Prompt 与 Skill 共用一套分类（#93）；Design 和其他类型不分类。
export const CATEGORIZED_TYPES = Object.freeze(["Prompt", "Skill"]);
export const hasCategory = (type) => CATEGORIZED_TYPES.includes(type);

export const UNSORTED = "unsorted";
export const UNSORTED_NAME = "待归类";

// 默认分类的自动归组关键词；用户新建的分类没有关键词，只能手选。
const KEYWORDS = {
  think: ["思考", "问题", "假设", "决策", "校准", "推演", "反方", "第一性", "原理", "建模", "判断", "澄清"],
  dev: ["代码", "开发", "工程", "GitHub", "Git", "开源", "前端", "后端", "接口", "交接", "Handoff", "UI", "调试", "测试", "技术"],
  design: ["设计", "视觉", "风格", "配色", "排版", "海报", "插画", "生图"],
  retro: ["复盘", "总结", "知识", "笔记", "沉淀", "回顾", "检索"],
  biz: ["业务", "用户", "策略", "运营", "营销", "销售", "增长", "落地"],
  ops: ["备份", "定时", "服务", "体检", "自动化", "部署", "运维"],
};

const ID = /^[a-z0-9][a-z0-9-]{0,39}$/;

export function categoriesOf(state) {
  return state?.assetCategories?.length ? state.assetCategories : DEFAULT_CATEGORIES;
}

export function categoryColor(category) {
  return CATEGORY_COLORS[category?.color] || "var(--muted)";
}

// 返回 { id, inferred }：id 为分类 ID 或 UNSORTED；inferred 表示是自动归组还没手动确认。
export function categoryOf(asset, categories, version) {
  const known = new Set(categories.map((c) => c.id));
  if (asset.category && known.has(asset.category)) return { id: asset.category, inferred: false };
  const text = [version?.title, version?.description, ...(version?.tags || [])].filter(Boolean).join(" ").toLowerCase();
  let best = null;
  let bestScore = 0;
  for (const c of categories) {
    const words = KEYWORDS[c.id];
    if (!words) continue;
    const score = words.reduce((n, w) => n + (text.includes(w.toLowerCase()) ? 1 : 0), 0);
    if (score > bestScore) { best = c.id; bestScore = score; }
  }
  return best ? { id: best, inferred: true } : { id: UNSORTED, inferred: true };
}

export function validateAssetCategories(list) {
  if (!Array.isArray(list) || list.length > 50) throw new Error("分类表无效");
  const ids = new Set();
  const names = new Set();
  for (const c of list) {
    if (!c || typeof c !== "object" || Array.isArray(c)) throw new Error("分类无效");
    if (Object.keys(c).some((k) => !["id", "name", "color"].includes(k))) throw new Error("分类包含不支持的字段");
    if (typeof c.id !== "string" || !ID.test(c.id) || c.id === UNSORTED) throw new Error("分类 ID 无效");
    if (typeof c.name !== "string" || !c.name.trim() || c.name.length > 20) throw new Error("分类名称需为 1–20 个字");
    if (!Object.hasOwn(CATEGORY_COLORS, c.color)) throw new Error("分类颜色只能取固定色板");
    if (ids.has(c.id) || names.has(c.name.trim())) throw new Error("分类重复");
    ids.add(c.id);
    names.add(c.name.trim());
  }
  return list;
}

// ---------- 状态标识 ----------
export const BADGES = Object.freeze({
  NEW: { label: "NEW", name: "新入库", rule: "入库 7 天内" },
  HOT: { label: "HOT", name: "常用", rule: "近 30 天复制 ≥ 5 次" },
  UPD: { label: "UPD", name: "刚更新", rule: "7 天内改过，且不是新入库" },
  IDLE: { label: "IDLE", name: "沉睡", rule: "入库超过 30 天，一次没用过" },
});

const DAY = 24 * 60 * 60 * 1000;

// uses：该资产的复制记录（assetActivity 里 kind === "use"），每条带 at / usedAt。
export function badgesOf(asset, uses, now = Date.now()) {
  const age = now - Date.parse(asset.createdAt);
  const recent = uses.filter((u) => now - Date.parse(u.usedAt || u.at) <= 30 * DAY).length;
  const lastEdit = Date.parse(asset.versions.at(-1).at);
  const out = [];
  const fresh = age <= 7 * DAY;
  if (fresh) out.push("NEW");
  if (recent >= 5) out.push("HOT");
  if (!fresh && asset.versions.length > 1 && now - lastEdit <= 7 * DAY) out.push("UPD");
  if (age > 30 * DAY && uses.length === 0) out.push("IDLE");
  return out.slice(0, 2);
}
