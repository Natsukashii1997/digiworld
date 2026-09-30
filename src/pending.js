// 待处理线索：只从已加载的本机主库读出真实事项，不编造、不执行动作。
// 体检、夜间结果、改版候选等来源会随对应功能上线再接入（产品定义 v1.1 §4.6）。
import { current } from "./store.js";
import { usageOf } from "./asset-usage.js";

// 规则模板装入记录是否读完：没读完时不能对“有没有待处理”下结论（D-R3）。
export function rulePendingReady(ruleInstalls) {
  return !!ruleInstalls?.loaded && !ruleInstalls?.error;
}
// ruleInstalls 来自规则模板的本机操作记录（不在主库里），由 App 读取后传入：
// { items, error }。读取失败单列一条，不当作“没有可升级”。
// agentHealth 来自智能体群的内容清单体检（只在本次打开页面后明确读取过的 Agent 才有），
// { [agentId]: { name, health: { brokenLinks, drift, unreadable } } }。未体检不下结论。
export function pendingItems(
  state,
  ruleInstalls = { items: [], error: "" },
  agentHealth = {},
) {
  const items = [];
  const c = state.connections || {};
  if (ruleInstalls.error)
    items.push({
      id: "rule-installs-error",
      kind: "资产",
      title: "规则模板装入记录读取失败",
      detail: "升级提示暂时不可用；在任意规则详情里可以重新读取。",
      to: "assets",
    });
  for (const asset of state.assets) {
    if (asset.archived || asset.type !== "Rule") continue;
    const behind = ruleInstalls.items.filter(
      (i) => i.assetId === asset.id && i.versionId !== current(asset).id,
    );
    if (behind.length)
      items.push({
        id: `rule-upgrade-${asset.id}`,
        kind: "资产",
        title: `规则「${current(asset).title}」有 ${behind.length} 个项目可升级`,
        detail: "模板已有新版本；在规则详情里逐个预览差异，确认后升级。",
        to: "assets",
        assetId: asset.id,
      });
  }
  for (const asset of state.assets) {
    if (asset.archived) continue;
    if (usageOf(asset, state.assetActivity).feedback?.rating === "improve")
      items.push({
        id: `improve-${asset.id}`,
        kind: "资产",
        title: `「${current(asset).title}」被标记为需改进`,
        detail: "当前版本的最新反馈是“需改进”，可以修改后保存为新版本。",
        to: "assets",
        assetId: asset.id,
      });
  }
  const tasks = (state.knowledgeTasks || []).filter((t) => !t.archived);
  if (tasks.length)
    items.push({
      id: "knowledge-tasks",
      kind: "知识",
      title: `${tasks.length} 个知识整理任务进行中`,
      detail: "候选需要你核对，确认后才会写入“00 待整理”。",
      to: "knowledge",
    });
  if (state.notes.length)
    items.push({
      id: "notes-local",
      kind: "知识",
      title: `${state.notes.length} 条随手记仍只在本机`,
      detail: "尚未写入 Obsidian，可以整理后手动归位。",
      to: "notes",
    });
  const targeted = new Set((c.agentTargets || []).map((t) => t.agentId));
  const untargeted = (c.agents || []).filter(
    (a) => a.status === "detected" && !targeted.has(a.id),
  );
  if (untargeted.length)
    items.push({
      id: "agents-untargeted",
      kind: "目标",
      title: `${untargeted.map((a) => a.name).join("、")} 已检测到，尚未设置管理目标`,
      detail: "设置管理目标后，才能查看目录、关联 Skill 和受控修改配置。",
      to: "agents",
    });
  for (const [agentId, entry] of Object.entries(agentHealth || {})) {
    const h = entry?.health;
    if (!h) continue;
    const parts = [
      h.brokenLinks && `${h.brokenLinks} 条失效链接`,
      h.drift && `${h.drift} 个副本与仓库版本不一致`,
      h.unreadable && `${h.unreadable} 项无法读取`,
    ].filter(Boolean);
    if (parts.length)
      items.push({
        id: `agent-health-${agentId}`,
        kind: "智能体",
        title: `${entry.name}：${parts.join("、")}`,
        detail: "体检只读；清理、重建或同步需要你在本机单独授权后执行。",
        to: "agents",
      });
  }
  return items;
}
