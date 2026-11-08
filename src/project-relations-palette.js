// 项目关系页（#79）的数据配色：项目类型、关系类型、当前状态、底座。照 project-hues.js 的先例放在 JS，
// 以 SVG 属性或 --c 变量用到页面上；样式层（project-relations.css）只用令牌。颜色取自定稿。
export const TYPE = {
  infrastructure: { label: "基础设施", color: "#7fe0a0" },
  capability: { label: "能力", color: "#a891ff" },
  product: { label: "产品", color: "#ffb35c" },
  unknown: { label: "未分类", color: "#9aa6c8" },
};
export const typeOf = (t) => TYPE[t] || TYPE.unknown;

export const KIND = {
  support: { label: "引用底座", color: "#8fa3ff" },
  data: { label: "数据流", color: "#4de3ff" },
  contract: { label: "契约 → 实施", color: "#c08bff" },
  part: { label: "组成 · 挂载", color: "#ffb35c" },
  apart: { label: "明确独立", color: "#ff7b7b" },
};
export const INFERRED = "#9aa6c8";

// 当前状态：键与项目总览「要注意的事」（attentionOf().kind）一致；桑基右栏按这里的顺序排。
export const STATUS = {
  agent: { label: "待 Agent 处理", color: "#4de3ff" },
  human: { label: "待人工验收", color: "#ffd166" },
  pr: { label: "PR 待合并", color: "#c08bff" },
  stale: { label: "下一步可能过期", color: "#ff9f5a" },
  unpushed: { label: "未推送", color: "#ff8fb8" },
  last: { label: "正常推进", color: "#7fe0a0" },
  nogh: { label: "没有远端", color: "#ff7b7b" },
  unregistered: { label: "没有本机登记", color: "#8a93b0" },
  missing: { label: "本机找不到", color: "#6b7590" },
  unknown: { label: "读不到", color: "#6b7590" },
};
export const statusOf = (k) => STATUS[k] || STATUS.unknown;

// 底座颜色：定稿里出现过的按 id 固定；名册新增的底座按类型取色。
const BASE_HUE = { "agent-kit": "#7fe0a0", "my-skills": "#c8b6ff", "obsidian-kb": "#5fd0c0", "multi-agent": "#a891ff", "ui-system": "#b39dff", "get-index": "#9be7c4" };
export const NONE_BASE = { name: "未接底座", color: "#6b7590" };
export const baseHue = (id, type) => (id === "none" ? NONE_BASE.color : BASE_HUE[id] || typeOf(type).color);

// 桑基流带上扫过的柔光（定稿 H 的质感），以 SVG 渐变色用到页面上。
export const SWEEP = "#ffffff";
