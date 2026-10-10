import React, { useState } from "react";
import { Button } from "./components.jsx";
import {
  runSettingDraft, templateDifference, validateRunSettingDraft,
} from "./collab-run-settings.js";

const ACTORS = [
  ["claude-code", "机械暴龙兽 · Claude"],
  ["codex", "机械邪龙兽 · Codex"],
  ["hermes", "亚古兽 · Hermes"],
  ["user", "你"],
];

export function CollabRunSettings({ state, save, notify, refresh, item, run, versions, onClose }) {
  const existing = (state.collabRunSettings || []).find((entry) =>
    entry.projectId === item.projectId && entry.runId === run.id);
  const [draft, setDraft] = useState(() => runSettingDraft(existing, versions, item, run));
  const [acceptedDiff, setAcceptedDiff] = useState(false);
  const [clearedOverrides, setClearedOverrides] = useState([]);
  const [saving, setSaving] = useState(false);
  const chosen = versions.find((v) => v.assetId === draft.templateAssetId && v.versionId === draft.templateVersionId);
  const locked = versions.find((v) => v.assetId === existing?.templateAssetId && v.versionId === existing?.templateVersionId);
  const chosenAllowed = chosen && (!chosen.archived ||
    (chosen.assetId === existing?.templateAssetId && chosen.versionId === existing?.templateVersionId));
  const upgrading = !!existing && (existing.templateAssetId !== draft.templateAssetId ||
    existing.templateVersionId !== draft.templateVersionId);
  const diff = upgrading && chosen ? [
    ...templateDifference(locked?.template, chosen.template),
    ...clearedOverrides.map((label) => `执行者替换已清除：${label}。请按新版站点重新选择。`),
  ] : [];
  const sameRound = (state.collabRunSettings || []).filter((entry) =>
    entry.projectId === item.projectId && entry.runId !== run.id && entry.round === draft.round);

  async function persist(event) {
    event.preventDefault();
    if (saving || (upgrading && !acceptedDiff)) return;
    try {
      const next = validateRunSettingDraft(draft, versions);
      if (sameRound.some((entry) => entry.issuesPath !== next.issuesPath))
        throw new Error("同一轮次的待议清单路径须一致");
      const settings = [...(state.collabRunSettings || []).filter((entry) =>
        !(entry.projectId === item.projectId && entry.runId === run.id)), next];
      setSaving(true);
      if (await save({ ...state, collabRunSettings: settings })) {
        notify(upgrading ? "已升级此运行的锁定模板版本" : "运行设置已保存");
        onClose();
        await refresh();
      }
    } catch (error) { notify(error.message, "error"); }
    finally { setSaving(false); }
  }

  return <form className="cx-run-form" onSubmit={persist}>
    <p>一张派单对应一次运行。这里配置路线与提醒；过关结论仍只读取项目协议文件。</p>
    <label>轮次
      <input value={draft.round} maxLength={100} onChange={(e) => setDraft({ ...draft, round: e.target.value })} />
    </label>
    <label>轮次待议清单（项目 docs 内）
      <input value={draft.issuesPath} placeholder="docs/agents/handoffs/v16-open-issues.md"
        onChange={(e) => setDraft({ ...draft, issuesPath: e.target.value })} />
    </label>
    <label>锁定的工作流资产版本
      <select value={chosen ? `${chosen.assetId}:${chosen.versionId}` : ""}
        onChange={(e) => {
          const next = versions.find((v) => `${v.assetId}:${v.versionId}` === e.target.value);
          if (!next) return;
          const keep = (override) => chosen?.template.stages[override.phase - 1]?.label ===
            next.template.stages[override.phase - 1]?.label;
          setClearedOverrides(draft.actorOverrides.filter((override) => !keep(override))
            .map((override) => `第 ${override.phase} 站 ${chosen?.template.stages[override.phase - 1]?.label || "原站点"}`));
          setDraft({ ...draft, templateAssetId: next.assetId, templateVersionId: next.versionId,
            actorOverrides: draft.actorOverrides.filter(keep) });
          setAcceptedDiff(false);
        }}>
        <option value="">请选择模板</option>
        {versions.map((v) => <option key={`${v.assetId}:${v.versionId}`} value={`${v.assetId}:${v.versionId}`}
          disabled={v.archived && !(v.assetId === existing?.templateAssetId && v.versionId === existing?.templateVersionId)}>
          {v.title} · 版本 {v.number}{v.latest ? " · 最新" : ""}{v.archived ? " · 已归档" : ""}
        </option>)}
      </select>
    </label>
    {!versions.some((v) => !v.archived) && <p role="alert">资产仓库尚无可用的结构化工作流模板。请先新建工作流资产并使用“设计实现流 v1”预置。</p>}
    {upgrading && chosen && <div className="cx-template-diff">
      <h3>升级前先核对差异</h3>
      <ul>{diff.map((line, index) => <li key={index}>{line}</li>)}</ul>
      <label className="cx-check"><input type="checkbox" checked={acceptedDiff}
        onChange={(e) => setAcceptedDiff(e.target.checked)} />我已阅读差异，确认只升级此运行</label>
    </div>}
    <label>推进节奏
      <select value={draft.pace} onChange={(e) => setDraft({ ...draft, pace: e.target.value })}>
        <option value="per-run">逐单停等</option><option value="continuous">连续推进，最后一次验收</option>
      </select>
    </label>
    <label className="cx-check"><input type="checkbox" checked={draft.functionOnly}
      onChange={(e) => setDraft({ ...draft, functionOnly: e.target.checked })} />纯功能任务（跳过模板中可跳过的站）</label>
    {chosen && <fieldset><legend>本次运行的执行者</legend>
      {chosen.template.stages.map((stage) => {
        const actor = draft.actorOverrides.find((override) => override.phase === stage.number)?.actor || stage.defaultActor;
        return <label key={stage.number}>{String(stage.number).padStart(2, "0")} · {stage.label}
          <select value={actor} onChange={(e) => setDraft({ ...draft,
            actorOverrides: [...draft.actorOverrides.filter((override) => override.phase !== stage.number),
              ...(e.target.value === stage.defaultActor ? [] : [{ phase: stage.number, actor: e.target.value }])],
          })}>
            {ACTORS.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
          </select>
        </label>;
      })}
    </fieldset>}
    <div className="cx-form-actions"><Button type="submit" disabled={saving || !chosenAllowed || (upgrading && !acceptedDiff)}>
      {saving ? "正在保存…" : upgrading ? "确认升级版本" : existing ? "保存运行设置" : "绑定并开始运行"}
    </Button></div>
  </form>;
}
