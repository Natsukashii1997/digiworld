// 项目桌（阶段 2 主线串联）：顶层集合 projectDesk，按项目 ID 记收件、装备与手填的下一步。
// 只存引用：收件指向随手记或收藏条目，装备指向资产的固定版本；不复制正文，正文在「继续」时才取快照。
// 不挂在 connections.projects 上（扫描会刷新那里的条目）；旧库缺失按空；普通保存不能改，只能经专用接口更新。
import { invalid, equivalent } from "./schema.mjs";

export const PROJECT_DESK_LIMITS = { projects: 500, inbox: 100, loadout: 30, next: 500 };
export const INBOX_KINDS = ["note", "collection"];
const ID = /^[a-zA-Z0-9_-]{1,100}$/;
const AT = /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/;
const CONTROL = /[\x00-\x1f\x7f]/;
const fields = (value, allowed, label) => {
  if (!value || typeof value !== "object" || Array.isArray(value) || Object.keys(value).some((k) => !allowed.includes(k)))
    invalid(label);
};
const identifier = (value, label) => {
  if (typeof value !== "string" || !ID.test(value)) invalid(label);
};
const time = (value, label) => {
  if (typeof value !== "string" || !AT.test(value) || !Number.isFinite(Date.parse(value))) invalid(label);
};

export function validateProjectDesk(state) {
  const desk = state.projectDesk === undefined ? [] : state.projectDesk;
  if (!Array.isArray(desk) || desk.length > PROJECT_DESK_LIMITS.projects) invalid("项目桌容量");
  const projects = new Set();
  for (const entry of desk) {
    fields(entry, ["projectId", "inbox", "loadout", "next"], "项目桌字段");
    identifier(entry.projectId, "项目桌项目");
    if (projects.has(entry.projectId)) invalid("项目桌项目重复");
    projects.add(entry.projectId);
    if (!Array.isArray(entry.inbox) || entry.inbox.length > PROJECT_DESK_LIMITS.inbox) invalid("收件容量");
    const refs = new Set();
    for (const item of entry.inbox) {
      fields(item, ["kind", "id", "at"], "收件字段");
      if (!INBOX_KINDS.includes(item.kind)) invalid("收件来源");
      identifier(item.id, "收件条目");
      time(item.at, "投递时间");
      const key = `${item.kind}:${item.id}`;
      if (refs.has(key)) invalid("收件重复");
      refs.add(key);
    }
    if (!Array.isArray(entry.loadout) || entry.loadout.length > PROJECT_DESK_LIMITS.loadout) invalid("装备容量");
    const assets = new Set();
    for (const item of entry.loadout) {
      fields(item, ["assetId", "versionId", "at"], "装备字段");
      identifier(item.assetId, "装备资产");
      identifier(item.versionId, "装备版本");
      time(item.at, "装备时间");
      if (assets.has(item.assetId)) invalid("装备重复");
      assets.add(item.assetId);
    }
    if (entry.next !== undefined) {
      fields(entry.next, ["text", "at"], "手填下一步");
      if (typeof entry.next.text !== "string" || !entry.next.text.trim() || entry.next.text.length > PROJECT_DESK_LIMITS.next || CONTROL.test(entry.next.text))
        invalid("手填下一步");
      time(entry.next.at, "手填下一步时间");
    }
  }
}

export function validateProjectDeskHistory(before = [], after = [], allow = false) {
  if (!allow && !equivalent(before, after)) invalid("项目桌只能通过投递、装备等专用操作更新");
}
