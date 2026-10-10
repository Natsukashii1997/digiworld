import React, { useEffect, useMemo, useRef, useState } from "react";
import { Download, RotateCcw } from "lucide-react";
import { Button, Badge } from "./components.jsx";
import { current, restore } from "./store.js";
import { compareVersions, diffText, diffLineCounts } from "./version-diff.js";
import { fileBytes } from "./skill-package.js";
import { WorkflowReferenceList } from "./WorkflowReferences.jsx";
import { WORKFLOW_TEMPLATE_ACTORS } from "./workflow-template.js";

const statuses = { added: "新增", removed: "删除", modified: "修改" };
const changes = { content: "内容", mode: "权限", type: "类型" };
const permission = (f) =>
  !f
    ? "—"
    : f.mode === undefined
      ? "未知"
      : f.mode.toString(8).padStart(3, "0");
function WorkflowTemplateSnapshot({ template }) {
  if (!template) return <p>未设置协同模板</p>;
  return (
    <section className="workflow-template-detail" aria-label="协同模板版本快照">
      <h4>协同模板 · {template.stages.length} 站</h4>
      <p>默认{template.defaultPace === "continuous" ? "连续推进，最后一次验收" : "逐单停等"} · 同一项第 {template.escalationAfter} 次仍不过时交你决定</p>
      <ol>{template.stages.map((stage) => <li key={stage.number}>
        <b>{String(stage.number).padStart(2, "0")} · {stage.label}</b>
        <small>{WORKFLOW_TEMPLATE_ACTORS.find(([id]) => id === stage.defaultActor)?.[1] || stage.defaultActor}{stage.skippable ? " · 可跳过" : ""}</small>
        <span>{stage.method}</span>
        <span>交付：{stage.artifact} · 过关：{stage.gate}</span>
      </li>)}</ol>
    </section>
  );
}
function textFile(file) {
  if (!file || file.directory) return null;
  try {
    const text = new TextDecoder("utf-8", {
      fatal: true,
      ignoreBOM: true,
    }).decode(fileBytes(file));
    return /[\x00-\x08\x0b\x0c\x0e-\x1f]/.test(text) ? null : text;
  } catch {
    return null;
  }
}
export function TextDifference({ before, after, keyboardScroll = false }) {
  const diff = useMemo(() => diffText(before, after), [before, after]);
  return (
    <div className="text-difference">
      <p className="diff-legend">− 比较起点　＋ 比较终点</p>
      {diff.formatOnly && (
        <p className="context-receipt">文字相同，换行格式不同。</p>
      )}
      {before.endsWith("\n") !== after.endsWith("\n") && (
        <p className="context-receipt">末尾换行发生变化。</p>
      )}
      {diff.mode === "full" ? (
        <>
          <p className="context-receipt">
            内容较长，改为两版全文查看，不省略正文。
          </p>
          <details>
            <summary>比较起点全文</summary>
            <pre className="history-text" tabIndex={0}>{before || "（空）"}</pre>
          </details>
          <details>
            <summary>比较终点全文</summary>
            <pre className="history-text" tabIndex={0}>{after || "（空）"}</pre>
          </details>
        </>
      ) : (
        <div className="diff-lines" role="region" tabIndex={0} aria-label="逐行差异">
          {diff.rows.map((row, i) => (
            <div className={`diff-line ${row.type}`} key={i}>
              {/* 带 aria-label 的元素需要角色（axe aria-prohibited-attr）；用 img 角色且不增加 DOM 节点。 */}
              <span
                role="img"
                aria-label={
                  row.type === "added"
                    ? "新增"
                    : row.type === "removed"
                      ? "删除"
                      : "未变"
                }
              >
                {row.type === "added"
                  ? "+"
                  : row.type === "removed"
                    ? "−"
                    : " "}
              </span>
              <pre>{row.text.replace(/\r\n$|[\r\n]$/, "") || " "}</pre>
              {row.type !== "same" && (
                <small className="line-ending">
                  {row.text.endsWith("\r\n")
                    ? "CRLF"
                    : row.text.endsWith("\n")
                      ? "LF"
                      : row.text.endsWith("\r")
                        ? "CR"
                        : "无换行"}
                </small>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function FileDifference({ file, keyboardScroll = false }) {
  const [open, setOpen] = useState(false);
  const left = open ? textFile(file.before) : null;
  const right = open ? textFile(file.after) : null;
  const contentChanged =
    file.status !== "modified" || file.changes.includes("content");
  return (
    <details
      className={`file-change ${file.status}`}
      onToggle={(e) => setOpen(e.currentTarget.open)}
    >
      <summary>
        <Badge tone="muted">{statuses[file.status]}</Badge>
        <span>{file.path}</span>
      </summary>
      {open && (
        <>
          <p className="context-receipt">
            {file.changes.map((c) => changes[c]).join(" / ") ||
              statuses[file.status]}{" "}
            · 权限 {permission(file.before)} → {permission(file.after)}
          </p>
          {contentChanged &&
          (left !== null || right !== null) &&
          (!file.before || left !== null) &&
          (!file.after || right !== null) ? (
            <TextDifference before={left || ""} after={right || ""} keyboardScroll={keyboardScroll} />
          ) : contentChanged &&
            !(file.before?.directory || file.after?.directory) ? (
            <p className="context-receipt">
              二进制内容发生变化，不作为文本显示。可导出对应版本核对。
            </p>
          ) : null}
        </>
      )}
    </details>
  );
}

export function AssetHistory({
  asset,
  state,
  save,
  notify,
  onExport,
  presentation,
}) {
  const latest = current(asset);
  const [selectedId, setSelectedId] = useState(
    asset.versions.at(-2)?.id || latest.id,
  );
  const [compareId, setCompareId] = useState(latest.id);
  const [confirmation, setConfirmation] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const lock = useRef(false);
  const selected = asset.versions.find((v) => v.id === selectedId) || latest;
  const compared = asset.versions.find((v) => v.id === compareId) || latest;
  const number = (version) =>
    asset.versions.findIndex((v) => v.id === version.id) + 1;
  const difference = useMemo(
    () => compareVersions(selected, compared),
    [selected, compared],
  );
  useEffect(() => {
    setConfirmation(null);
    setCompareId(latest.id);
  }, [latest.id]);
  function change(setter, id) {
    setter(id);
    setConfirmation(null);
    setError("");
  }
  async function confirmRestore() {
    if (lock.current || !confirmation) return;
    if (
      confirmation.currentId !== latest.id ||
      confirmation.targetId !== selected.id
    ) {
      setConfirmation(null);
      setError("当前版本已变化，请重新检查后恢复。");
      return;
    }
    lock.current = true;
    setBusy(true);
    setError("");
    try {
      const ok = await save({
        ...state,
        assets: state.assets.map((a) =>
          a.id === asset.id ? restore(a, selected.id) : a,
        ),
      });
      if (!ok) {
        setConfirmation(null);
        setError(
          "恢复未完成，历史和选择仍保留。请查看保存错误，核对主库后重试。",
        );
        return;
      }
      setConfirmation(null);
      notify(`已从 v${number(selected)}.0 恢复为新版本；未同步到 Agent`);
    } catch (e) {
      setConfirmation(null);
      setError(e.message || "恢复失败，请核对后重试。");
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  return (
    <section className="asset-history" aria-label="资产历史">
      {presentation === "timeline" && (
        <VersionTimeline
          asset={asset}
          busy={busy}
          choose={(version) => {
            change(setSelectedId, version.id);
            setCompareId(latest.id);
          }}
          prepare={(version) => {
            setSelectedId(version.id);
            setCompareId(latest.id);
            setError("");
            setConfirmation({ targetId: version.id, currentId: latest.id });
          }}
        />
      )}
      <div className="history-selectors">
        <label>
          查看版本
          <select
            aria-label="查看版本"
            value={selected.id}
            disabled={busy}
            onChange={(e) => change(setSelectedId, e.target.value)}
          >
            {[...asset.versions].reverse().map((version) => (
              <option key={version.id} value={version.id}>
                v{number(version)}.0{version.id === latest.id ? " · 当前" : ""}
              </option>
            ))}
          </select>
        </label>
        <label>
          比较到
          <select
            aria-label="比较到"
            value={compared.id}
            disabled={busy}
            onChange={(e) => change(setCompareId, e.target.value)}
          >
            {[...asset.versions].reverse().map((version) => (
              <option key={version.id} value={version.id}>
                v{number(version)}.0{version.id === latest.id ? " · 当前" : ""}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className="history-stamp">
        <span>{new Date(selected.at).toLocaleString("zh-CN")}</span>
        <Badge tone="muted">
          {selected.id === latest.id ? "当前版本" : "历史快照"}
        </Badge>
      </div>
      {selected.restoredFrom && (
        <p className="context-receipt">
          从 v
          {asset.versions.findIndex((v) => v.id === selected.restoredFrom) + 1}
          .0 恢复
        </p>
      )}
      {selected.candidateId && (
        <p className="context-receipt">
          来自改版候选 {selected.candidateId.slice(0, 8)}
        </p>
      )}
      <details className="version-snapshot" open={presentation !== "timeline"}>
        <summary>v{number(selected)}.0 内容</summary>
        <h3>{selected.title}</h3>
        {selected.description && <p>{selected.description}</p>}
        <dl className="history-fields">
          <div>
            <dt>来源</dt>
            <dd>{selected.source || "未设置"}</dd>
          </div>
          <div>
            <dt>标签</dt>
            <dd>{selected.tags.join(" / ") || "未设置"}</dd>
          </div>
        </dl>
        {asset.type === "MCP" ? (
          <dl className="history-fields" aria-label="MCP 版本结构">
            <div><dt>服务标识</dt><dd>{selected.mcpConfig.serverId}</dd></div>
            <div><dt>公开地址</dt><dd>{selected.mcpConfig.origin + selected.mcpConfig.path}</dd></div>
            <div><dt>Bearer 环境变量名</dt><dd>{selected.mcpConfig.credentialEnvVar || "未设置"}</dd></div>
          </dl>
        ) : <pre className="history-text" tabIndex={0}>
          {selected.content || "（无文本正文）"}
        </pre>}
        {asset.type === "Workflow" && selected.workflowTemplate && (
          <WorkflowTemplateSnapshot template={selected.workflowTemplate} />
        )}
        {asset.type === "Workflow" && (
          <section>
            <h4>固定引用 · {selected.references?.length || 0}</h4>
            <WorkflowReferenceList version={selected} assets={state.assets} />
          </section>
        )}
        {asset.type === "Skill" && (
          <details>
            <summary>完整文件清单 · {selected.files.length} 项</summary>
            <div className="history-files">
              {selected.files.map((file) => (
                <div key={file.path}>
                  <span>
                    {file.path}
                    {file.directory ? "/" : ""}
                  </span>
                  <small>
                    {file.directory ? "目录" : `${fileBytes(file).length} B`} ·{" "}
                    {permission(file)}
                  </small>
                </div>
              ))}
            </div>
          </details>
        )}
      </details>
      <section className="version-comparison" aria-label="版本比较">
        <h3>
          v{number(selected)}.0 → v{number(compared)}.0
        </h3>
        {difference.identical ? (
          <p className="context-receipt">内容、元数据与文件均无变化。</p>
        ) : (
          <>
            {difference.fields.map((field) => (
              <div className="history-field-change" key={field.key}>
                <strong>{field.label}</strong>
                <div>
                  <span>−</span>
                  {field.key === "references" ? (
                    <WorkflowReferenceList
                      version={selected}
                      assets={state.assets}
                    />
                  ) : field.key === "workflowTemplate" ? (
                    <WorkflowTemplateSnapshot template={selected.workflowTemplate} />
                  ) : (
                    <p>{field.before || "（空）"}</p>
                  )}
                </div>
                <div>
                  <span>＋</span>
                  {field.key === "references" ? (
                    <WorkflowReferenceList
                      version={compared}
                      assets={state.assets}
                    />
                  ) : field.key === "workflowTemplate" ? (
                    <WorkflowTemplateSnapshot template={compared.workflowTemplate} />
                  ) : (
                    <p>{field.after || "（空）"}</p>
                  )}
                </div>
              </div>
            ))}
            {difference.contentChanged && (
              <TextDifference
                before={selected.content}
                after={compared.content}
                keyboardScroll={presentation === "timeline"}
              />
            )}
            {difference.files.length > 0 && (
              <div className="history-file-changes">
                <h4>文件变化 · {difference.files.length} 项</h4>
                {difference.files.map((file) => (
                  <FileDifference
                    key={`${selected.id}:${compared.id}:${file.path}`}
                    file={file}
                    keyboardScroll={presentation === "timeline"}
                  />
                ))}
              </div>
            )}
          </>
        )}
      </section>
      {error && (
        <p role="alert" className="inline-error">
          {error}
        </p>
      )}
      {confirmation ? (
        <section className="history-confirm" aria-label="确认恢复">
          <h3>恢复到 v{number(selected)}.0？</h3>
          <p>
            将恢复此版本的名称、描述、正文、来源、标签、完整文件及资产引用，生成
            v{asset.versions.length + 1}.0。原历史保留，不修改任何 Agent。
          </p>
          <div className="heading-actions">
            <Button disabled={busy} onClick={confirmRestore}>
              {busy ? "正在恢复…" : "确认恢复为新版本"}
            </Button>
            <Button
              secondary
              disabled={busy}
              onClick={() => setConfirmation(null)}
            >
              取消恢复
            </Button>
          </div>
        </section>
      ) : (
        <div className="heading-actions">
          {onExport && (
            <Button
              secondary
              disabled={busy}
              onClick={() => onExport(selected, number(selected))}
            >
              <Download size={16} />
              导出此版本
            </Button>
          )}
          {selected.id !== latest.id && (
            <Button
              secondary
              disabled={busy}
              onClick={() => {
                setError("");
                setConfirmation({
                  targetId: selected.id,
                  currentId: latest.id,
                });
              }}
            >
              <RotateCcw size={16} />
              {presentation === "timeline"
                ? `恢复为 v${asset.versions.length + 1}`
                : "恢复此版本"}
            </Button>
          )}
        </div>
      )}
    </section>
  );
}

// 归档页专用呈现；比较与恢复继续使用上面的同一套状态/确认/保存逻辑。
function VersionTimeline({ asset, busy, choose, prepare }) {
  const latest = current(asset);
  return (
    <ol className="archive-timeline">
      {[...asset.versions].reverse().map((version) => {
        const i = asset.versions.findIndex((v) => v.id === version.id),
          previous = asset.versions[i - 1];
        const difference = previous ? compareVersions(previous, version) : null;
        const lines =
          previous && difference.contentChanged
            ? diffText(previous.content || "", version.content || "")
            : null;
        const counts = lines?.mode === "full"
          ? diffLineCounts(previous.content || "", version.content || "")
          : lines ? {available:true, added:lines.rows.filter(r=>r.type==="added").length, removed:lines.rows.filter(r=>r.type==="removed").length} : null;
        return (
          <li
            key={version.id}
            className={`archive-node ${version.id === latest.id ? "current" : ""}`}
          >
            <span className="archive-dot" aria-hidden="true">
              {i + 1}
            </span>
            <article className="archive-version-card">
              <div className="archive-version-head">
                <h3>
                  v{i + 1}
                  {!previous && " · 首次收录"}
                </h3>
                {version.id === latest.id && <Badge tone="success">当前</Badge>}
                <time>{new Date(version.at).toLocaleString("zh-CN")}</time>
              </div>
              <div className="archive-changes">
                {difference ? (
                  <>
                    {difference.fields.map((f) => (
                      <span key={f.key}>{f.label}</span>
                    ))}
                    {difference.contentChanged && (
                      <span>
                        正文{" "}
                        {counts.available ? (
                          <>
                            <em className="added">
                              +
                              {counts.added}
                            </em>{" "}
                            <em className="removed">
                              −
                              {counts.removed}
                            </em>
                          </>
                        ) : (
                          `· 行数待接入数据：${counts.reason}`
                        )}
                      </span>
                    )}
                    {difference.files.map((f) => (
                      <span key={f.path}>
                        {f.path} · {fileLineSummary(f)}
                      </span>
                    ))}
                    {difference.identical && (
                      <span>内容、元数据与文件均无变化</span>
                    )}
                  </>
                ) : (
                  <span>来源：{version.source || "未设置"}</span>
                )}
              </div>
              {previous && (
                <details className="archive-inline-diff">
                  <summary>
                    展开 v{i} → v{i + 1} 差异
                  </summary>
                  {difference.fields.map((f) => (
                    <div className="history-field-change" key={f.key}>
                      <strong>{f.label}</strong>
                      <div>
                        <span>−</span>
                        {f.key === "workflowTemplate"
                          ? <WorkflowTemplateSnapshot template={previous.workflowTemplate} />
                          : <p>{f.before || "（空）"}</p>}
                      </div>
                      <div>
                        <span>＋</span>
                        {f.key === "workflowTemplate"
                          ? <WorkflowTemplateSnapshot template={version.workflowTemplate} />
                          : <p>{f.after || "（空）"}</p>}
                      </div>
                    </div>
                  ))}
                  {difference.contentChanged && (
                    <TextDifference
                      before={previous.content || ""}
                      after={version.content || ""}
                      keyboardScroll
                    />
                  )}
                  {difference.files.map((f) => (
                    <FileDifference key={f.path} file={f} keyboardScroll />
                  ))}
                  {difference.identical && <p>内容、元数据与文件均无变化。</p>}
                </details>
              )}
              {version.restoredFrom && (
                <p className="helper">
                  从 v
                  {asset.versions.findIndex(
                    (v) => v.id === version.restoredFrom,
                  ) + 1}{" "}
                  恢复追加
                </p>
              )}
              {version.id === latest.id ? <p className="helper">当前版本，无需与自身对比。</p> : <div className="heading-actions">
                <Button
                  secondary
                  disabled={busy}
                  aria-label={`与当前对比 v${i + 1}`}
                  onClick={() => choose(version)}
                >
                  与当前对比
                </Button>
                {version.id !== latest.id && (
                  <Button
                    secondary
                    disabled={busy}
                    aria-label={`从 v${i + 1} 恢复为 v${asset.versions.length + 1}`}
                    onClick={() => prepare(version)}
                  >
                    恢复为 v{asset.versions.length + 1}
                  </Button>
                )}
              </div>}
            </article>
          </li>
        );
      })}
    </ol>
  );
}

function fileLineSummary(file) {
  if (file.before?.directory || file.after?.directory)
    return "目录变化（不计文本行）";
  if (file.status === "modified" && !file.changes.includes("content"))
    return file.changes.map((c) => changes[c]).join(" / ") + "变化（正文未变）";
  const left = textFile(file.before),
    right = textFile(file.after);
  if ((file.before && left === null) || (file.after && right === null))
    return "二进制 / 非文本（不计行）";
  const counts = diffLineCounts(left || "", right || "");
  return counts.available
    ? `+${counts.added} −${counts.removed}`
    : `行数待接入数据：${counts.reason}`;
}
