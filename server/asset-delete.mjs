import { failure } from "./repository.mjs";
import { publishedAssetReferences } from "./agent-write.mjs";

const titleOf = asset => asset?.versions?.at(-1)?.title || "未命名资产";

// 只列结构化引用的名称和版本，不把正文、路径或私有会话带到删除提示里。
export function assetDeleteBlockers(state, assetId, ruleInstallItems = [], publishedItems = []) {
  const blockers = [];
  const add = (kind, label, ownerId, fixed = false) => blockers.push({ kind, label, ownerId, fixed });
  const projectName = id => `${state.connections?.projects?.find(project => project.id === id)?.name || "项目"}（${id}）`;

  for (const asset of state.assets || []) {
    if (asset.id === assetId) continue;
    if (asset.origin?.kind === "derived" && asset.origin.assetId === assetId)
      add("derived", `派生 Skill：${titleOf(asset)}`, asset.id, true);
    if (asset.type === "Workflow") for (const [index, version] of asset.versions.entries()) {
      if (version.references?.some(reference => reference.assetId === assetId))
        add("workflow", `工作流：${version.title || titleOf(asset)} · v${index + 1}`, asset.id, true);
    }
  }
  for (const setting of state.collabRunSettings || []) {
    if (setting.templateAssetId === assetId)
      add("collab", `项目协同：${projectName(setting.projectId)} · ${setting.round} · ${setting.runId}`, setting.runId);
  }
  for (const install of ruleInstallItems) {
    if (install.assetId === assetId || install.pending?.assetId === assetId) {
      const file = install.file === "CLAUDE.md" ? "CLAUDE.md" : "AGENTS.md";
      const status = install.pending?.assetId === assetId ? "待确认装入记录" : "存在装入记录（当前文件未核验）";
      add("rule", `项目规则：${projectName(install.projectId)} · ${file} · ${status}`, install.id || install.pending?.id || "");
    }
  }
  for (const record of state.reverseRecords || []) {
    if (record.forge?.assetId === assetId || record.imports?.some(item => item.assetId === assetId))
      add("reverse", `逆向记录：${record.title}`, record.id, true);
  }
  for (const candidate of state.revisionCandidates || []) {
    if (candidate.assetId === assetId)
      add("candidate", `改版候选：${candidate.id}`, candidate.id, true);
  }
  for (const adoption of state.skillSourceAdoptions || []) {
    if (adoption.assetId === assetId || adoption.sourceAssetId === assetId)
      add("adoption", `Skill 来源采用记录：${adoption.id}`, adoption.id, true);
  }
  for (const copy of state.connections?.skillCopies || []) {
    if (copy.assetId === assetId)
      add("copy", `目标副本关联：${copy.id}`, copy.id);
  }
  for (const item of publishedItems) {
    if (item.assetId === assetId)
      add("published", `Agent 发布记录：${item.name} · ${item.targetId}`, item.id, true);
  }
  return blockers;
}

export function createAssetDeletion(repository, ruleTemplates) {
  return {
    async remove(input) {
      if (!input || Array.isArray(input) || Object.keys(input).some(key => !["assetId", "expectedRevision"].includes(key)) ||
          typeof input.assetId !== "string" || !/^[a-zA-Z0-9_-]{1,100}$/.test(input.assetId) ||
          !Number.isSafeInteger(input.expectedRevision) || input.expectedRevision < 0)
        throw failure("资产删除请求无效", 400);
      let blockers = [];
      const state = await repository.updateAssets(async (assets, stored) => {
        const asset = assets.find(item => item.id === input.assetId);
        if (!asset) throw failure("资产不存在或已被移除", 404);
        if (asset.archived) return assets;
        // 与主库 revision 核对处于同一串行写入队列；检查失败时不写入。
        const installs = await ruleTemplates.installs({});
        const published = await publishedAssetReferences(repository.directory, input.assetId);
        blockers = assetDeleteBlockers(stored, input.assetId, installs.items, published);
        if (blockers.length) return assets;
        return assets.map(item => item.id === input.assetId ? { ...item, archived: true } : item);
      }, { expectedRevision: input.expectedRevision, allowAssetDelete: true, restrictAssetDeletion: true });
      return { deleted: blockers.length === 0, blockers, state };
    },
  };
}
