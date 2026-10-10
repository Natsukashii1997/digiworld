import { validateWorkflowTemplate } from "./workflow-template.js";

export function workflowVersions(assets = []) {
  return assets.flatMap((asset) => asset.type === "Workflow"
    ? asset.versions.flatMap((version, index) => {
        if (!version.workflowTemplate) return [];
        try {
          return [{
            assetId: asset.id,
            versionId: version.id,
            title: version.title,
            number: index + 1,
            template: validateWorkflowTemplate(version.workflowTemplate),
            latest: index === asset.versions.length - 1,
            archived: !!asset.archived,
          }];
        } catch { return []; }
      })
    : []);
}

export function templateDifference(before, after) {
  if (!before) return ["首次绑定模板：" + after.stages.length + " 站"];
  const lines = [];
  const fields = [
    ["label", "阶段"], ["defaultActor", "执行者"], ["method", "方法"],
    ["artifact", "交付物"], ["gate", "过关条件"], ["skippable", "可跳过"],
  ];
  const count = Math.max(before.stages.length, after.stages.length);
  for (let i = 0; i < count; i++) {
    const left = before.stages[i], right = after.stages[i];
    if (!left) { lines.push(`新增第 ${i + 1} 站：${right.label}`); continue; }
    if (!right) { lines.push(`移除第 ${i + 1} 站：${left.label}`); continue; }
    for (const [key, label] of fields) {
      if (left[key] !== right[key]) lines.push(`第 ${i + 1} 站${label}：${String(left[key])} → ${String(right[key])}`);
    }
  }
  if (before.defaultPace !== after.defaultPace)
    lines.push(`默认节奏：${before.defaultPace} → ${after.defaultPace}`);
  if (before.escalationAfter !== after.escalationAfter)
    lines.push(`返修升级阈值：${before.escalationAfter} → ${after.escalationAfter}`);
  return lines.length ? lines : ["模板内容没有变化；只更新版本引用。"];
}

export function runSettingDraft(existing, versions, item, run) {
  const bound = versions.find((v) => v.assetId === existing?.templateAssetId &&
    v.versionId === existing?.templateVersionId);
  const first = bound || versions.filter((v) => v.latest && !v.archived)[0] ||
    versions.find((v) => !v.archived);
  return {
    projectId: item.projectId,
    runId: run.id,
    round: existing?.round || item.name || "当前轮次",
    issuesPath: existing?.issuesPath || "",
    templateAssetId: first?.assetId || "",
    templateVersionId: first?.versionId || "",
    pace: existing?.pace || first?.template.defaultPace || "per-run",
    functionOnly: existing?.functionOnly || false,
    actorOverrides: existing?.actorOverrides || [],
  };
}

export function validateRunSettingDraft(draft, versions) {
  const version = versions.find((v) => v.assetId === draft.templateAssetId &&
    v.versionId === draft.templateVersionId);
  if (!version) throw new Error("请选择已有的结构化工作流模板版本");
  const round = String(draft.round || "").trim();
  if (!round || round.length > 100 || /[\x00-\x1f\x7f]/.test(round))
    throw new Error("轮次名称须为 1–100 字，且不能包含换行或控制字符");
  const issuesPath = String(draft.issuesPath || "").trim();
  if (issuesPath && (!/^docs\/(?!\/)[^\s?#:\\]+(?:\/[^\s?#:\\]+)*\.md$/.test(issuesPath) ||
      issuesPath.split("/").some((part) => part === "." || part === ".." || part.startsWith("."))))
    throw new Error("待议清单须为项目 docs 下的 Markdown 相对路径");
  if (!["per-run", "continuous"].includes(draft.pace)) throw new Error("请选择推进节奏");
  const actorOverrides = (draft.actorOverrides || []).filter((item) =>
    version.template.stages.some((stage) => stage.number === item.phase &&
      stage.defaultActor !== item.actor));
  if (actorOverrides.some((item) => !version.template.stages.some((stage) => stage.number === item.phase) ||
      !["claude-code", "codex", "hermes", "user"].includes(item.actor)))
    throw new Error("替换执行者无效");
  return {
    projectId: draft.projectId, runId: draft.runId, round, issuesPath,
    templateAssetId: version.assetId, templateVersionId: version.versionId,
    pace: draft.pace, functionOnly: !!draft.functionOnly, actorOverrides,
  };
}

export function groupedRuns(pairs) {
  const groups = [];
  for (const pair of pairs) {
    const round = pair.run.round || "未设置轮次";
    let group = groups.find((item) => item.projectId === pair.item.projectId && item.round === round);
    if (!group) {
      group = { projectId: pair.item.projectId, projectName: pair.item.name, round, pairs: [], issues: pair.run.issues };
      groups.push(group);
    }
    group.pairs.push(pair);
    if (group.issues?.state !== "ok" && pair.run.issues?.state === "ok") group.issues = pair.run.issues;
  }
  return groups;
}
