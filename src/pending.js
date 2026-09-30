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
export function pendingItems(state, ruleInstalls = { items: [], error: "" }) {
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
  // 个人说明修改建议（切片 3.3）：Agent 通过本机 MCP 提交，在待处理页预览采纳或拒绝。
  for (const p of state.profileProposals || []) {
    if (p.status !== "pending") continue;
    items.push({
      id: `profile-${p.id}`,
      kind: "知识",
      title: `个人说明修改建议 · ${p.path}`,
      detail: `来自 ${p.proposer}：${p.reason.length > 60 ? p.reason.slice(0, 60) + "…" : p.reason}`,
      to: "inbox",
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
  return items;
}
