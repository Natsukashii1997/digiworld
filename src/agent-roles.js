// 智能体角色卡与派活推荐（路线 v3 4.3；产品定义 v1.2 §4.3；基线 D26、D28）的纯函数。
// 只推荐，不指派、不执行：推荐只在前端按擅长关键词做子串匹配，不发任何请求。
// 默认擅长与成本是草拟值，未经用户确认；用户编辑后整张卡存入主库 agentRoles。
import { now } from "./store.js";

// 主力 3 个 + 附属 2 个；顺序即显示顺序。aliases 用于从项目交接字段推断常驻项目。
export const ROLE_AGENTS = [
  { id: "codex", name: "Codex", tier: "main", aliases: ["codex"] },
  { id: "claude-code", name: "Claude Code", tier: "main", aliases: ["claude code", "claude-code", "claude"] },
  { id: "hermes", name: "Hermes", tier: "main", aliases: ["hermes"] },
  { id: "openclaw", name: "OpenClaw", tier: "aux", aliases: ["openclaw"] },
  { id: "doubao", name: "豆包工作", tier: "aux", aliases: ["豆包"] },
];
export const TIER_LABEL = { main: "主力", aux: "附属" };
export const COST_LABEL = { low: "低", medium: "中", high: "高", unknown: "未知" };
const COST_RANK = { low: 0, medium: 1, high: 2, unknown: 3 };
export const STRENGTH_MAX = 20;
export const STRENGTHS_PER_CARD = 30;
export const PROJECT_MAX = 100;
export const PROJECTS_PER_CARD = 20;
export const NOTE_MAX = 1000;

// 草拟默认（云端开发时的推测，界面标注“草拟默认”，以用户编辑为准）。
const DEFAULTS = {
  codex: { strengths: ["代码实现", "重构", "测试", "修复", "审查", "命令行"], cost: "medium" },
  "claude-code": { strengths: ["代码实现", "界面", "文档", "交接", "规划", "审查"], cost: "high" },
  hermes: { strengths: ["定时任务", "夜巡", "监工", "后台"], cost: "unknown" },
  openclaw: { strengths: ["消息", "自动化", "浏览器"], cost: "unknown" },
  doubao: { strengths: ["中文写作", "资料检索", "总结", "翻译"], cost: "low" },
};

export function parseList(input, max = STRENGTH_MAX, limit = STRENGTHS_PER_CARD) {
  const list = [];
  for (const raw of String(input).split(/[\s,，、;；]+/)) {
    const item = raw.replace(/[\x00-\x1f\x7f]/g, "").slice(0, max);
    if (item && !list.includes(item)) list.push(item);
  }
  return list.slice(0, limit);
}
// 常驻项目按逗号、顿号、分号或换行拆分（项目名里可以有空格）。
export function parseProjects(input) {
  const list = [];
  for (const raw of String(input).split(/[,，、;；\n]+/)) {
    const item = raw.replace(/[\x00-\x1f\x7f]/g, "").trim().slice(0, PROJECT_MAX);
    if (item && !list.includes(item)) list.push(item);
  }
  return list.slice(0, PROJECTS_PER_CARD);
}

export function rolesOf(state) {
  const stored = state.agentRoles || [];
  return ROLE_AGENTS.map((agent) => {
    const saved = stored.find((r) => r.agentId === agent.id);
    return saved
      ? { ...agent, ...saved, edited: true }
      : {
          ...agent,
          agentId: agent.id,
          ...DEFAULTS[agent.id],
          projects: [],
          note: "",
          edited: false,
        };
  });
}

export function saveRole(state, agentId, { strengths, cost, projects, note }) {
  const role = {
    agentId,
    strengths,
    cost,
    projects,
    note: note.replace(/[\x00-\x08\x0b-\x1f\x7f]/g, "").slice(0, NOTE_MAX),
    updatedAt: now(),
  };
  const others = (state.agentRoles || []).filter((r) => r.agentId !== agentId);
  // 保持与卡片相同的顺序，便于比对备份。
  const order = ROLE_AGENTS.map((a) => a.id);
  return [...others, role].sort((a, b) => order.indexOf(a.agentId) - order.indexOf(b.agentId));
}

// 常驻项目推断：只看已登记项目（主库 projects）的“下一步”交接字段里是否点名该 Agent；
// 已完成的项目不算常驻。推断不了返回空数组，界面留空。
export function inferProjects(state, agentId) {
  const agent = ROLE_AGENTS.find((a) => a.id === agentId);
  if (!agent) return [];
  return (state.projects || [])
    .filter((p) => p.status !== "已完成")
    .filter((p) => {
      const text = String(p.next || "").toLowerCase();
      return agent.aliases.some((alias) => text.includes(alias));
    })
    .map((p) => p.name);
}

// 派活推荐：擅长关键词在任务描述中出现（英文不区分大小写）即命中，按命中数排序，
// 同分按成本从低到高，再按卡片顺序；最多 2 个，无命中不推荐。
export function recommendAgents(description, cards, limit = 2) {
  const text = String(description || "").toLowerCase();
  if (!text.trim()) return [];
  return cards
    .map((card, order) => {
      const matched = card.strengths.filter((s) => text.includes(s.toLowerCase()));
      return {
        agentId: card.agentId,
        name: card.name,
        tier: card.tier,
        cost: card.cost,
        matched,
        score: matched.length,
        order,
        reason: `命中擅长：${matched.join("、")}；成本${COST_LABEL[card.cost] || "未知"}`,
      };
    })
    .filter((r) => r.score > 0)
    .sort(
      (a, b) =>
        b.score - a.score ||
        (COST_RANK[a.cost] ?? 3) - (COST_RANK[b.cost] ?? 3) ||
        a.order - b.order,
    )
    .slice(0, limit)
    .map(({ order, ...rest }) => rest);
}
