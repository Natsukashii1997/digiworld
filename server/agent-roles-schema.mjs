// 智能体角色卡的主库校验。只保存用户编辑过的卡；默认卡由前端显示。
function invalid(message) {
  throw Object.assign(new Error(`数据校验失败：${message}`), { status: 400 });
}
const isObject = value => value && typeof value === "object" && !Array.isArray(value) && !(value instanceof Uint8Array);
const keys = (value, allowed) => {
  if (!isObject(value)) invalid("对象");
  if (Object.keys(value).some(key => !allowed.includes(key))) invalid("包含不支持的字段");
};
const array = (value, label, max) => {
  if (!Array.isArray(value) || value.length > max) invalid(label);
};
const unique = (values, label) => {
  if (new Set(values).size !== values.length) invalid(`${label}重复`);
};
const line = (value, label, max, required = false) => {
  if (typeof value !== "string" || value.length > max || /[\x00-\x1f\x7f]/.test(value)) invalid(label);
  if (required && !value.trim()) invalid(label);
};
const multiline = (value, label, max) => {
  if (typeof value !== "string" || value.length > max || /[\x00-\x08\x0b-\x1f\x7f]/.test(value)) invalid(label);
};
const date = value => {
  if (typeof value !== "string" || value.length > 40 || !Number.isFinite(Date.parse(value))) invalid("时间格式");
};

export const ROLE_AGENT_IDS = ["codex", "claude-code", "hermes", "openclaw", "doubao"];
export const ROLE_COSTS = ["low", "medium", "high", "unknown"];
export const ROLE_LIMITS = { strengths: 30, strength: 20, projects: 20, project: 100, note: 1000 };

export function validateAgentRoles(roles) {
  array(roles, "角色卡数量", ROLE_AGENT_IDS.length);
  unique(roles.map(role => role?.agentId), "角色卡");
  for (const role of roles) {
    keys(role, ["agentId", "strengths", "cost", "projects", "note", "updatedAt"]);
    if (!ROLE_AGENT_IDS.includes(role.agentId)) invalid("角色卡 Agent");
    array(role.strengths, "擅长关键词", ROLE_LIMITS.strengths);
    for (const strength of role.strengths)
      if (typeof strength !== "string" || !strength || strength.length > ROLE_LIMITS.strength || /[\s,，、;；\x00-\x1f\x7f]/.test(strength)) invalid("擅长关键词");
    unique(role.strengths, "擅长关键词");
    if (!ROLE_COSTS.includes(role.cost)) invalid("成本");
    array(role.projects, "常驻项目", ROLE_LIMITS.projects);
    for (const project of role.projects) line(project, "常驻项目", ROLE_LIMITS.project, true);
    unique(role.projects, "常驻项目");
    multiline(role.note, "角色卡备注", ROLE_LIMITS.note);
    date(role.updatedAt);
  }
}
