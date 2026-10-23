// 项目桌（阶段 2 主线串联）：投递到项目、撤回、装备资产固定版本、卸下、手填下一步。
// 每个操作都是“让状态成为 X”：已是目标状态时原样返回、不推进版本。结果未知时先查询，再按需用同一请求重发也不会多写。
// 只存引用；条目和资产是否存在在写入时核对，之后被删除的引用保留，由界面显示“原条目已删除”。
import { failure } from "./repository.mjs";
import { PROJECT_DESK_LIMITS, INBOX_KINDS } from "./project-desk-schema.mjs";

const ID = /^[a-zA-Z0-9_-]{1,100}$/;
const CONTROL = /[\x00-\x1f\x7f]/;
function exact(input, allowed) {
  if (!input || typeof input !== "object" || Array.isArray(input) || Object.keys(input).some((k) => !allowed.includes(k)))
    throw failure("请求包含不支持的字段");
}
function identifier(value, label) {
  if (typeof value !== "string" || !ID.test(value)) throw failure(`${label}无效`);
}
function projectOf(state, projectId) {
  const project = state.connections?.projects?.find((p) => p.id === projectId);
  if (!project) throw failure("项目已不存在，请重新扫描", 404);
  return project;
}
const entryOf = (desk, projectId) => desk.find((e) => e.projectId === projectId);
const empty = (entry) => !entry.inbox.length && !entry.loadout.length && entry.next === undefined;
function ensure(desk, projectId) {
  let entry = entryOf(desk, projectId);
  if (!entry) {
    if (desk.length >= PROJECT_DESK_LIMITS.projects) throw failure("项目桌已满", 409);
    entry = { projectId, inbox: [], loadout: [] };
    desk.push(entry);
  }
  return entry;
}
const prune = (desk) => desk.filter((e) => !empty(e));

export function createProjectDesk(repository, { collection, clock = Date.now } = {}) {
  const at = () => new Date(clock()).toISOString();
  const result = (state) => ({ state });
  return {
    async read() {
      const state = await repository.read();
      return { projectDesk: state?.projectDesk || [], revision: state?.revision || 0 };
    },
    async deliver(input) {
      exact(input, ["projectId", "kind", "id"]);
      identifier(input.projectId, "项目");
      if (!INBOX_KINDS.includes(input.kind)) throw failure("收件来源无效");
      identifier(input.id, "条目");
      // 收藏在独立存储，先读一次核对存在；主库里的随手记在写入队列内核对。
      if (input.kind === "collection" && !(await collection.read()).notes.some((n) => n.id === input.id))
        throw failure("收藏不存在或已删除", 404);
      return result(await repository.updateProjectDesk((desk, stored) => {
        if (projectOf(stored, input.projectId).active !== true) throw failure("只能投递到存档槽里在推进的项目", 409);
        if (input.kind === "note" && !stored.notes.some((n) => n.id === input.id)) throw failure("随手记不存在或已删除", 404);
        const entry = ensure(desk, input.projectId);
        if (entry.inbox.some((item) => item.kind === input.kind && item.id === input.id)) return desk;
        if (entry.inbox.length >= PROJECT_DESK_LIMITS.inbox) throw failure("收件已满（100 条），请先移出已交代的", 409);
        entry.inbox.push({ kind: input.kind, id: input.id, at: at() });
        return desk;
      }));
    },
    async withdraw(input) {
      exact(input, ["projectId", "kind", "id"]);
      identifier(input.projectId, "项目");
      if (!INBOX_KINDS.includes(input.kind)) throw failure("收件来源无效");
      identifier(input.id, "条目");
      return result(await repository.updateProjectDesk((desk) => {
        const entry = entryOf(desk, input.projectId);
        if (entry) entry.inbox = entry.inbox.filter((item) => !(item.kind === input.kind && item.id === input.id));
        return prune(desk);
      }));
    },
    async equip(input) {
      exact(input, ["projectId", "assetId", "versionId"]);
      identifier(input.projectId, "项目");
      identifier(input.assetId, "资产");
      identifier(input.versionId, "版本");
      return result(await repository.updateProjectDesk((desk, stored) => {
        projectOf(stored, input.projectId);
        const asset = stored.assets.find((a) => a.id === input.assetId);
        if (!asset || asset.archived) throw failure("资产不存在或已归档", 404);
        if (!asset.versions.some((v) => v.id === input.versionId)) throw failure("资产版本不存在", 404);
        const entry = ensure(desk, input.projectId);
        const index = entry.loadout.findIndex((item) => item.assetId === input.assetId);
        if (index >= 0 && entry.loadout[index].versionId === input.versionId) return desk;
        const item = { assetId: input.assetId, versionId: input.versionId, at: at() };
        if (index >= 0) entry.loadout[index] = item;
        else {
          if (entry.loadout.length >= PROJECT_DESK_LIMITS.loadout) throw failure("装备已满（30 份）", 409);
          entry.loadout.push(item);
        }
        return desk;
      }));
    },
    async unequip(input) {
      exact(input, ["projectId", "assetId"]);
      identifier(input.projectId, "项目");
      identifier(input.assetId, "资产");
      return result(await repository.updateProjectDesk((desk) => {
        const entry = entryOf(desk, input.projectId);
        if (entry) entry.loadout = entry.loadout.filter((item) => item.assetId !== input.assetId);
        return prune(desk);
      }));
    },
    // 没有协作表格的项目，下一步由用户手填；base 是修改前看到的文字，别处改过则拒绝覆盖。
    async next(input) {
      exact(input, ["projectId", "text", "base"]);
      identifier(input.projectId, "项目");
      if (typeof input.text !== "string" || typeof input.base !== "string") throw failure("下一步内容无效");
      const text = input.text.trim();
      if (text.length > PROJECT_DESK_LIMITS.next || CONTROL.test(text)) throw failure("下一步最多 500 字，且不能换行或含控制字符");
      return result(await repository.updateProjectDesk((desk, stored) => {
        projectOf(stored, input.projectId);
        const entry = entryOf(desk, input.projectId), current = entry?.next?.text || "";
        if (current === text) return desk;
        if (current !== input.base.trim())
          throw failure("下一步已在别处修改，请重读后再保存", 409);
        const target = ensure(desk, input.projectId);
        if (text) target.next = { text, at: at() };
        else delete target.next;
        return prune(desk);
      }));
    },
  };
}
