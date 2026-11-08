// 项目关系页（#79）的合成样本：照定稿 docs/design/projects-space-v3/项目关系-定稿.html 的 16 个项目与关系，
// 用 #78 的 buildRelations 生成和 GET /api/projects-space/relations 同形的数据（不读真实名册、项目、Vault）。
// 浏览器回归与验收截图用 Playwright 路由把这份数据当作接口返回。
import { buildRelations } from "../server/project-relations.mjs";

// [id, 名称, 类型, 近 30 天提交, 状态（attention.kind）, 状态文字]
const P = [
  ["personal-ai-workbench", "数码世界", "product", 131, "agent", "待 Agent 4 张"],
  ["digital-twin", "数字分身", "product", 158, "agent", "待 Agent 2 张"],
  ["postpane", "驿窗", "product", 239, "pr", "PR 待合并 1 个"],
  ["github-center", "GitHub 中心", "product", 111, "human", "待人工验收 1 张"],
  ["chatgpt-clipper", "回答收藏器", "product", 23, "last", "最近提交 11/6"],
  ["work-desk", "牛马之家", "product", 299, "last", "最近提交 11/8"],
  ["trainee-hub", "管培生工作台", "product", 7, "human", "待人工验收 2 张"],
  ["carvomoto", "CarvoMOTO", "product", 95, "nogh", "没有 GitHub 远端"],
  ["disk-slim", "磁盘瘦身", "product", 3, "last", "最近提交 10/30"],
  ["little-steps", "Little Steps", "product", 12, "last", "最近提交 11/2"],
  ["my-skills", "自建技能库", "capability", 38, "last", "最近提交 11/8"],
  ["multi-agent", "多 Agent 协同", "capability", 6, "last", "最近提交 11/1"],
  ["ui-system", "UI 设计体系", "capability", 2, "last", "最近提交 10/20"],
  ["obsidian-kb", "Obsidian 知识库", "infrastructure", 1, "last", "最近提交 10/28"],
  ["get-index", "GET 索引", "infrastructure", 0, "last", "还没有提交"],
  ["agent-kit", "agent-kit", "infrastructure", 31, "last", "最近提交 11/8"],
];

// 名册手写关系：[从, 到, 类型, 说明, 出处, 推断?]
const R = [
  ["digital-twin", "personal-ai-workbench", "data", "名册 projects.json 是项目空间的唯一来源", "产品定义 v2.0"],
  ["my-skills", "personal-ai-workbench", "data", "自建 Skill 只读展示", "产品定义 v2.0"],
  ["personal-ai-workbench", "my-skills", "data", "逆向产出的 Skill 进 my-skills 候选站", "D-B"],
  ["obsidian-kb", "personal-ai-workbench", "data", "项目卡、个人说明经 Vault 只读接入", "数码世界 AGENTS.md"],
  ["obsidian-kb", "digital-twin", "data", "Vault 是「常浩」唯一真源，Hermes vault 技能在知识库仓库", "数字分身项目卡"],
  ["chatgpt-clipper", "obsidian-kb", "data", "回答存进 Obsidian", "名册备注"],
  ["digital-twin", "postpane", "data", "Hermes 的状态、提问与回复汇总进驿窗", "驿窗 README"],
  ["digital-twin", "github-center", "data", "每日榜单由 Hermes 发飞书日报", "GitHub 中心项目卡"],
  ["github-center", "my-skills", "data", "发现的 Skill 决定要不要装进自己的 AI", "GitHub 中心项目卡", true],
  ["multi-agent", "digital-twin", "contract", "Hermes 控制面与 Multica 实施引用模式契约", "multi-agent 边界"],
  ["multi-agent", "postpane", "contract", "接力的界面、传信、回执归驿窗", "multi-agent 边界"],
  ["multi-agent", "my-skills", "contract", "thinking-review 等可执行方法归 my-skills", "multi-agent 边界"],
  ["ui-system", "my-skills", "contract", "ui-styles、excel-aura 正式版在 my-skills，只引用", "ui-system 边界"],
  ["get-index", "obsidian-kb", "part", "知识库 KB-04 的索引维护工具", "名册备注"],
  ["disk-slim", "postpane", "part", "已挂进驿窗侧栏", "名册备注"],
  ["work-desk", "personal-ai-workbench", "apart", "完全独立，不共享数据", "牛马之家项目卡"],
  ["work-desk", "carvomoto", "apart", "不放进牛马之家，不用工作账号", "两边项目卡"],
];

// AGENTS.md 引用 agent-kit 的项目（自动读出「引用底座」边）；会话里调用过自建 skill 的项目（自动连上自建技能库）。
const USES_AGENT_KIT = ["work-desk", "personal-ai-workbench", "trainee-hub", "github-center", "digital-twin", "postpane", "chatgpt-clipper", "disk-slim", "little-steps"];
const SKILL_CALLS = { "trainee-hub": "ai-landing-method", postpane: "thinking-review" };

export function relationsSample({ at = "2026-11-08T02:30:00.000Z", agentsError = [] } = {}) {
  const relationsOf = (id) => R.filter((r) => r[0] === id).map(([, to, kind, note, source, inferred]) => ({ to, kind, note, source, ...(inferred ? { inferred: true } : {}) }));
  const projects = P.map(([id, name, type]) => ({ id, name, type, path: `/合成/${id}`, relations: relationsOf(id) }));
  const items = P.map(([id, , , total, kind, text]) => ({
    id,
    commits: { state: "ok", total },
    attention: { kind, text },
    skills: SKILL_CALLS[id] ? { skills: [{ name: SKILL_CALLS[id], src: "自建", n: 3 }] } : null,
  }));
  const agents = Object.fromEntries(P.map(([id]) => [id,
    agentsError.includes(id) ? { state: "error", reason: "AGENTS.md 读不到" }
      : { state: "ok", text: USES_AGENT_KIT.includes(id) ? "开工前读 agent-kit 的《工程流程》，坑见全局 LESSONS。\n" : "本项目协作规则。\n" }]));
  return {
    at,
    roster: { state: "ok", path: "合成名册/projects.json", version: "v1.6", skipped: [] },
    skillUsage: { state: "ok" },
    ...buildRelations({ projects, items, agents }),
  };
}
