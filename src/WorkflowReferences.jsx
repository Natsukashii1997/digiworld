import { copyText } from './data-flight.js';
import React, { useRef, useState } from "react";
import { Plus, X, Copy, Download, PenLine } from "lucide-react";
import { Button, Badge, typeLabel } from "./components.jsx";
import {
  resolveReferences,
  workflowText,
  buildWorkflowBundle,
  buildWorkflowDeploymentBundle,
} from "./workflow-references.js";
import { request } from "./api.js";
import {WorkflowDeployment} from "./WorkflowDeployment.jsx";

const labels = {
  current: "当前版",
  updated: "有新版 · 保持固定",
  archived: "已归档",
  "missing-asset": "资产缺失",
  "missing-version": "版本缺失",
  "invalid-type": "类型不支持",
};
function ReferenceStatus({ item }) {
  return (
    <Badge tone={item.usable ? "muted" : "warning"}>
      {labels[item.status]}
    </Badge>
  );
}
export function WorkflowReferenceList({ version, assets }) {
  const items = resolveReferences(version, assets);
  if (!items.length) return <p className="context-receipt">未引用其他资产</p>;
  return (
    <div className="workflow-reference-list">
      {items.map((item) => (
        <article className="workflow-reference" key={item.assetId}>
          <div className="workflow-reference-heading">
            <strong>
              {item.version?.title ||
                item.asset?.versions.at(-1)?.title ||
                "找不到原资产"}
            </strong>
            <ReferenceStatus item={item} />
          </div>
          <p className="context-receipt">
            {typeLabel[item.asset?.type] || "引用"} ·{" "}
            {item.number ? `v${item.number}.0` : item.versionId}
          </p>
          <details>
            <summary>查看引用内容</summary>
            <p className="reference-identity">
              资产 {item.assetId}
              <br />
              版本 {item.versionId}
            </p>
            {item.version ? (
              <>
                <pre className="history-text">
                  {item.version.content || "（无文本正文）"}
                </pre>
                {item.asset.type === "Skill" && (
                  <ul className="reference-files">
                    {item.version.files.map((file) => (
                      <li key={file.path}>
                        {file.path}
                        {file.directory ? "/" : ""}
                      </li>
                    ))}
                  </ul>
                )}
              </>
            ) : (
              <p className="context-receipt">
                请编辑流程，重新选择可用版本或移除此引用。
              </p>
            )}
          </details>
        </article>
      ))}
    </div>
  );
}
export function WorkflowReferenceEditor({
  references,
  assets,
  onChange,
  disabled,
}) {
  const [assetId, setAssetId] = useState(""),
    [versionId, setVersionId] = useState(""),
    [search, setSearch] = useState("");
  const resolved = resolveReferences({ references }, assets);
  const candidates = assets.filter(
    (a) =>
      ["Prompt", "Skill"].includes(a.type) &&
      !a.archived &&
      !references.some((r) => r.assetId === a.id),
  );
  const visible = candidates.filter((a) =>
    a.versions.at(-1).title.toLowerCase().includes(search.toLowerCase()),
  );
  const selected = visible.find((a) => a.id === assetId);
  const selectedVersion = selected?.versions.find((v) => v.id === versionId);
  function add() {
    if (!selectedVersion || references.length >= 50 || disabled) return;
    onChange([...references, { assetId, versionId }]);
    setAssetId("");
    setVersionId("");
    setSearch("");
  }
  return (
    <fieldset className="workflow-reference-editor" disabled={disabled}>
      <legend>
        引用资产 <span>可选 · {references.length}/50</span>
      </legend>
      <p className="context-receipt">固定到所选版本；资产更新不会自动替换。</p>
      {resolved.map((item, i) => (
        <div className="workflow-reference" key={item.assetId}>
          <div className="workflow-reference-heading">
            <strong>
              {item.version?.title ||
                item.asset?.versions.at(-1)?.title ||
                "资产缺失"}
            </strong>
            <ReferenceStatus item={item} />
          </div>
          <div className="reference-edit-row">
            <label>
              版本
              <select
                aria-label={`引用 ${i + 1} 的版本`}
                value={item.versionId}
                onChange={(e) =>
                  onChange(
                    references.map((r, n) =>
                      n === i ? { ...r, versionId: e.target.value } : r,
                    ),
                  )
                }
              >
                {!item.version && (
                  <option value={item.versionId}>原引用不可用</option>
                )}
                {item.asset?.versions.map((v, n) => (
                  <option key={v.id} value={v.id}>
                    v{n + 1}.0
                    {n === item.asset.versions.length - 1 ? " · 当前" : ""}
                  </option>
                ))}
              </select>
            </label>
            <Button
              type="button"
              secondary
              aria-label={`移除引用 ${i + 1}`}
              onClick={() => onChange(references.filter((_, n) => n !== i))}
            >
              <X size={16} />
              移除
            </Button>
          </div>
        </div>
      ))}
      <label>
        查找资产
        <input
          value={search}
          onChange={(e) => {
            const query = e.target.value;
            setSearch(query);
            if (
              !selected?.versions
                .at(-1)
                .title.toLowerCase()
                .includes(query.toLowerCase())
            ) {
              setAssetId("");
              setVersionId("");
            }
          }}
          placeholder="搜索 Skill 或 Prompt"
        />
      </label>
      <div className="form-row">
        <label>
          引用资产
          <select
            aria-label="引用资产"
            value={selected?.id || ""}
            onChange={(e) => {
              const a = visible.find((a) => a.id === e.target.value);
              setAssetId(a?.id || "");
              setVersionId(a?.versions.at(-1)?.id || "");
            }}
          >
            <option value="">选择 Skill 或 Prompt</option>
            {visible.map((a) => (
              <option value={a.id} key={a.id}>
                {typeLabel[a.type]} · {a.versions.at(-1).title}
              </option>
            ))}
          </select>
        </label>
        <label>
          固定版本
          <select
            aria-label="固定版本"
            value={selectedVersion?.id || ""}
            disabled={!selected || disabled}
            onChange={(e) => setVersionId(e.target.value)}
          >
            <option value="">选择版本</option>
            {selected?.versions.map((v, n) => (
              <option value={v.id} key={v.id}>
                v{n + 1}.0{n === selected.versions.length - 1 ? " · 当前" : ""}
              </option>
            ))}
          </select>
        </label>
      </div>
      {!visible.length && (
        <p className="context-receipt">没有可添加的匹配资产。</p>
      )}
      <Button
        type="button"
        secondary
        disabled={!selectedVersion || references.length >= 50 || disabled}
        onClick={add}
      >
        <Plus size={16} />
        添加引用
      </Button>
    </fieldset>
  );
}
export async function readWorkflow(assetId, versionId) {
  const state = await request("/workspace");
  const asset = state?.assets.find(
    (a) => a.id === assetId && a.type === "Workflow",
  );
  const version = asset?.versions.find((v) => v.id === versionId);
  if (!version || asset.archived)
    throw new Error("流程不存在或已归档，请刷新后核对。");
  return { asset, version, assets: state.assets };
}
export function WorkflowDelivery({
  asset,
  version,
  state,
  onBusy,
  onDownload,
  onUsed,
  onCopyStart,
  onCopyEnd,
  usageBlocked = false,
  onEdit,
  notify,
}) {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [fallback, setFallback] = useState("");
  const locked = useRef(false);
  async function deliver(kind) {
    if (locked.current || usageBlocked || (onCopyStart && !onCopyStart())) return;
    locked.current = true;
    setBusy(true);
    setError("");
    setFallback("");
    try {
      const fresh = await readWorkflow(asset.id, version.id);
      if (kind === "deployment") {
        onDownload(`${version.title}-部署包.zip`, await buildWorkflowDeploymentBundle(fresh.asset, fresh.version, fresh.assets), "application/zip");
        notify("部署文件夹已打包；请解压复制到目标 Agent 工作区，尚未安装或执行");
      } else if (kind === "export") {
        onDownload(
          `${version.title}.zip`,
          await buildWorkflowBundle(fresh.asset, fresh.version, fresh.assets),
          "application/zip",
        );
        notify("流程与引用包已生成；未安装或执行");
      } else {
        const text = workflowText(fresh.version, fresh.assets);
        try {
          await copyText(text);
          notify("已复制流程说明 · 未发送或执行");
        } catch {
          setFallback(text);
          setError("剪贴板不可用，请在下方选中完整文本手动复制。");
          return;
        }
        await onUsed?.("copy-workflow");
      }
    } catch (e) {
      setError(e.message || "交付失败，请检查引用后重试。");
    } finally {
      locked.current = false;
      onCopyEnd?.();
      setBusy(false);
    }
  }
  return (
    <section className="workflow-delivery" aria-label="流程交付">
      <div className="heading-actions">
        <Button disabled={busy || usageBlocked} onClick={() => deliver("copy")}>
          <Copy size={16} />
          {busy ? "正在核对…" : "复制流程说明"}
        </Button>
        {!!version.references?.length && (
          <Button secondary disabled={busy} onClick={() => deliver("export")}>
            <Download size={16} />
            导出流程与引用
          </Button>
        )}
        <Button secondary disabled={busy || usageBlocked} onClick={() => deliver("deployment")}>
          <Download size={16} />导出部署包
        </Button>
        <button
          className="outlined-icon"
          aria-label="编辑资产"
          disabled={busy}
          onClick={onEdit}
        >
          <PenLine size={18} />
        </button>
      </div>
      {state && <WorkflowDeployment asset={asset} version={version} state={state} onBusy={onBusy}/>}
      {!!version.references?.length && (
        <p className="context-receipt">
          含 Skill 时，请将导出的 ZIP 一并附给 Agent。仅复制说明不含文件。
        </p>
      )}
      {error && (
        <p className="inline-error" role="alert">
          {error}
        </p>
      )}
      {fallback && (
        <label className="delivery-fallback">
          完整流程说明
          <textarea
            aria-label="完整流程说明"
            readOnly
            rows={7}
            value={fallback}
          />
        </label>
      )}
    </section>
  );
}
