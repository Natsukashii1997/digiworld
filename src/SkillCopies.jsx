import React, { useEffect, useRef, useState, useId } from "react";
import { Plus, RefreshCw, FolderSearch } from "lucide-react";
import { Button, Badge } from "./components.jsx";
import { request } from "./api.js";
import "./skill-copies.css";

const statusLabels = {
  identical: "完全一致",
  different: "存在差异",
  unverified: "部分未核验",
  missing: "副本缺失",
  blocked: "读取受阻",
  target_missing: "目标已解除",
  target_changed: "目标已变化",
  asset_unavailable: "资产不可用",
};
const fileLabels = {
  added: "副本新增",
  removed: "副本缺少",
  modified: "已变化",
  unverified: "未核验",
};
const changeLabels = {
  content: "内容变化",
  mode: "权限变化",
  type: "类型变化",
  mode_unknown: "权限未知",
};
const date = (value) => new Date(value).toLocaleString("zh-CN");
const basename = (value) => value.split("/").filter(Boolean).at(-1);
function entryLabel(entry) {
  if (!entry) return "不存在";
  return `${entry.directory ? "目录" : `${entry.bytes} B`} · ${typeof entry.mode === "number" ? `权限 ${entry.mode.toString(8).padStart(3, "0")}` : "权限未知"}`;
}
function Comparison({ value }) {
  const [limit, setLimit] = useState(50);
  return (
    <div className="copy-comparison">
      <div className="copy-heading">
        <Badge tone="muted">{statusLabels[value.status] || "待核对"}</Badge>
        <span className="detail-footnote">
          资产 {value.counts.expected} 项 · 副本 {value.counts.actual} 项
        </span>
      </div>
      {!value.permissionsKnown && (
        <p className="detail-footnote">权限信息不完整，不表示完全一致。</p>
      )}
      {!!value.files.length && (
        <details>
          <summary>差异与未核验 · {value.files.length} 项</summary>
          <ul className="copy-differences">
            {value.files.slice(0, limit).map((file) => (
              <li key={file.path}>
                <div className="copy-heading">
                  <code>{file.path}</code>
                  <Badge tone="muted">
                    {fileLabels[file.status] || "待核对"}
                  </Badge>
                </div>
                <p>
                  {file.changes
                    .map((change) => changeLabels[change] || change)
                    .join(" · ")}
                </p>
                <p className="detail-footnote">
                  资产：{entryLabel(file.expected)}
                  <br />
                  副本：{entryLabel(file.actual)}
                </p>
              </li>
            ))}
          </ul>
          {value.files.length > limit && (
            <Button
              type="button"
              secondary
              onClick={() => setLimit(limit + 50)}
            >
              显示更多差异
            </Button>
          )}
        </details>
      )}
    </div>
  );
}

export function SkillCopies({ asset, state, adoptState, notify }) {
  const targets = state.connections?.agentTargets || [];
  const copies = (state.connections?.skillCopies || []).filter(
    (copy) => copy.assetId === asset.id,
  );
  const [editor, setEditor] = useState(false),
    [targetId, setTargetId] = useState(""),
    [versionId, setVersionId] = useState(asset.versions.at(-1).id);
  const [scan, setScan] = useState(null),
    [candidateId, setCandidateId] = useState(""),
    [preview, setPreview] = useState(null);
  const [busy, setBusy] = useState(""),
    [error, setError] = useState(""),
    [scanStale, setScanStale] = useState(false),
    [previewStale, setPreviewStale] = useState(false);
  const [checks, setChecks] = useState({}),
    [removing, setRemoving] = useState(null),
    [replaceConfirmed, setReplaceConfirmed] = useState(false);
  const sequence = useRef(0),
    lock = useRef(false),
    editorRef = useRef(null),
    previewRef = useRef(null);
  const radioName = useId();
  useEffect(
    () => () => {
      sequence.current++;
      lock.current = false;
    },
    [asset.id],
  );
  useEffect(() => {
    if (editor) editorRef.current?.focus();
  }, [editor]);
  useEffect(() => {
    if (preview) {
      previewRef.current?.focus({ preventScroll: true });
      previewRef.current?.scrollIntoView({
        block: "start",
        behavior: "instant",
      });
    }
  }, [preview?.token]);
  useEffect(() => {
    setChecks((old) =>
      Object.fromEntries(
        Object.entries(old).map(([id, value]) => [
          id,
          { ...value, stale: true },
        ]),
      ),
    );
    if (preview && preview.revision !== state.revision) setPreviewStale(true);
  }, [state.revision]);
  function invalidate() {
    sequence.current++;
    lock.current = false;
    setBusy("");
    setError("");
    setPreview(null);
    setPreviewStale(false);
    setReplaceConfirmed(false);
  }
  function open(copy) {
    invalidate();
    setEditor(true);
    setRemoving(null);
    setScan(null);
    setScanStale(false);
    setCandidateId("");
    setTargetId(copy?.targetId || "");
    setVersionId(copy?.versionId || asset.versions.at(-1).id);
  }
  function changeSelection(key, value) {
    invalidate();
    setScan(null);
    setCandidateId("");
    setScanStale(false);
    if (key === "target") setTargetId(value);
    else setVersionId(value);
  }
  function begin(action) {
    if (lock.current) return null;
    lock.current = true;
    setBusy(action);
    setError("");
    return ++sequence.current;
  }
  function finish(ticket) {
    if (ticket === sequence.current) {
      lock.current = false;
      setBusy("");
    }
  }
  async function discover() {
    const ticket = begin("discover");
    if (ticket === null) return;
    setPreview(null);
    setReplaceConfirmed(false);
    setScanStale(true);
    try {
      const value = await request("/skill-copies/discover", {
        assetId: asset.id,
        versionId,
        targetId,
      });
      const latest = await request("/workspace");
      if (ticket !== sequence.current) return;
      adoptState(latest);
      setScan(value);
      setScanStale(!!value.errors.length || value.truncated);
      setPreviewStale(false);
      if (!value.items.some((item) => item.id === candidateId))
        setCandidateId("");
    } catch (e) {
      if (ticket === sequence.current) {
        setError(e.message);
        setScanStale(true);
      }
    } finally {
      finish(ticket);
    }
  }
  async function readPreview() {
    const ticket = begin("preview");
    if (ticket === null) return;
    setPreviewStale(true);
    setReplaceConfirmed(false);
    try {
      const value = await request("/skill-copies/preview", {
        token: scan.token,
        candidateId,
      });
      const latest = await request("/workspace");
      if (ticket !== sequence.current) return;
      adoptState(latest);
      setPreview(value);
      setPreviewStale(value.revision !== latest.revision);
    } catch (e) {
      if (ticket === sequence.current) {
        setError(e.message);
        setPreviewStale(true);
      }
    } finally {
      finish(ticket);
    }
  }
  async function bind() {
    const ticket = begin("bind");
    if (ticket === null) return;
    try {
      const next = await request("/skill-copies/bind", {
        token: preview.token,
        revision: preview.revision,
      });
      adoptState(next);
      if (ticket !== sequence.current) return;
      setEditor(false);
      setPreview(null);
      setScan(null);
      notify("已关联目标副本；未安装或启用");
    } catch (e) {
      if (ticket === sequence.current) {
        setError(e.message);
        setPreviewStale(true);
      }
    } finally {
      finish(ticket);
    }
  }
  async function check(copy) {
    const ticket = begin(`check:${copy.id}`);
    if (ticket === null) return;
    setChecks((old) => ({
      ...old,
      [copy.id]: { ...old[copy.id], stale: true, error: "" },
    }));
    try {
      const result = await request("/skill-copies/check", { id: copy.id });
      if (ticket !== sequence.current) return;
      setChecks((old) => ({
        ...old,
        [copy.id]: { result, stale: false, error: "" },
      }));
    } catch (e) {
      if (ticket === sequence.current)
        setChecks((old) => ({
          ...old,
          [copy.id]: { ...old[copy.id], stale: true, error: e.message },
        }));
    } finally {
      finish(ticket);
    }
  }
  async function remove(copy) {
    const ticket = begin(`remove:${copy.id}`);
    if (ticket === null) return;
    try {
      const next = await request("/skill-copies/remove", {
        id: copy.id,
        revision: state.revision,
      });
      adoptState(next);
      if (ticket !== sequence.current) return;
      setRemoving(null);
      notify("已解除副本关联；未删除源目录或资产");
    } catch (e) {
      if (ticket === sequence.current) setError(e.message);
    } finally {
      finish(ticket);
    }
  }
  const selectedTarget = targets.find((target) => target.id === targetId);
  const replacing =
    preview?.existingCopy &&
    (preview.existingCopy.assetId !== asset.id ||
      preview.existingCopy.versionId !== versionId);
  const usableScan = scan && !scanStale && !busy;
  const writeBusy = busy === "bind" || busy.startsWith("remove:");
  return (
    <section className="skill-copies" aria-label="目标副本" aria-busy={!!busy}>
      <div className="copy-heading">
        <h3>
          目标副本 <small>{copies.length}</small>
        </h3>
        {!editor && (
          <Button secondary disabled={!!busy} onClick={() => open()}>
            <Plus size={15} />
            关联已有副本
          </Button>
        )}
      </div>
      <p className="detail-footnote">
        仅限本机 · 记录对应关系，未验证安装、启用或实际使用。
      </p>
      {error && (
        <p className="copy-error" role="alert">
          {error}
        </p>
      )}
      {!copies.length && <p className="detail-footnote">尚未关联目标副本。</p>}
      {copies.map((copy) => {
        const target = targets.find((item) => item.id === copy.targetId),
          versionNumber =
            asset.versions.findIndex((item) => item.id === copy.versionId) + 1;
        const evidence = checks[copy.id],
          result = evidence?.result;
        const status = !target
          ? "target_missing"
          : !versionNumber || asset.archived
            ? "asset_unavailable"
            : evidence && !evidence.stale
              ? result?.status
              : null;
        return (
          <article
            className="copy-card"
            key={copy.id}
            aria-label={`副本 ${target?.label || "已失效目标"} · ${basename(copy.location)}`}
          >
            <div className="copy-heading">
              <strong>{target?.label || "已失效目标"}</strong>
              <Badge tone="muted">{statusLabels[status] || "待核对"}</Badge>
            </div>
            <p className="detail-footnote">
              固定 {versionNumber ? `v${versionNumber}.0` : "版本不可用"}
              {versionNumber > 0 && versionNumber < asset.versions.length
                ? ` · 有新版 v${asset.versions.length}.0`
                : result?.hasNewVersion && !evidence.stale
                  ? " · 有新版"
                  : ""}
            </p>
            <code>{copy.location}</code>
            <p className="detail-footnote">关联于 {date(copy.boundAt)}</p>
            {result && (
              <p className="detail-footnote" role="status">
                {evidence.stale
                  ? "上次结果已过期 · 请重新核对"
                  : `核对于 ${date(result.at)}`}
              </p>
            )}
            {evidence?.error && (
              <p className="copy-error" role="alert">
                {evidence.error} · 当前状态未知，请重新核对。
              </p>
            )}
            {result?.message && !evidence.stale && (
              <p className="detail-footnote">{result.message}</p>
            )}
            {result?.comparison && (
              <details>
                <summary>
                  {evidence.stale ? "上次核对明细（已过期）" : "核对明细"}
                </summary>
                <Comparison key={result.at} value={result.comparison} />
              </details>
            )}
            <div className="heading-actions">
              <Button secondary disabled={!!busy} onClick={() => check(copy)}>
                <RefreshCw size={15} />
                {busy === `check:${copy.id}` ? "核对中…" : "重新核对"}
              </Button>
              <Button secondary disabled={!!busy} onClick={() => open(copy)}>
                调整关联
              </Button>
              <Button
                secondary
                disabled={!!busy}
                onClick={() => {
                  setRemoving(copy.id);
                  setError("");
                }}
              >
                解除副本关联
              </Button>
            </div>
            {removing === copy.id && (
              <div
                className="copy-confirm"
                role="group"
                aria-label="解除副本确认"
              >
                <p>仅解除工作台对应关系，不删除副本目录或资产。</p>
                <div className="heading-actions">
                  <Button
                    secondary
                    disabled={!!busy}
                    onClick={() => setRemoving(null)}
                  >
                    取消解除
                  </Button>
                  <Button disabled={!!busy} onClick={() => remove(copy)}>
                    确认解除副本关联
                  </Button>
                </div>
              </div>
            )}
          </article>
        );
      })}
      {editor && (
        <div className="copy-editor" role="group" aria-label="关联副本">
          <div className="copy-selectors">
            <label>
              管理目标
              <select
                ref={editorRef}
                aria-label="管理目标"
                value={targetId}
                disabled={writeBusy}
                onChange={(e) => changeSelection("target", e.target.value)}
              >
                <option value="">选择管理目标</option>
                {targets.map((target) => (
                  <option key={target.id} value={target.id}>
                    {target.label} · {target.agentId}
                  </option>
                ))}
              </select>
            </label>
            <label>
              固定资产版本
              <select
                aria-label="固定资产版本"
                value={versionId}
                disabled={writeBusy}
                onChange={(e) => changeSelection("version", e.target.value)}
              >
                {asset.versions.map((version, index) => (
                  <option key={version.id} value={version.id}>
                    v{index + 1}.0 · {version.title}
                  </option>
                ))}
              </select>
            </label>
          </div>
          {!targets.length && (
            <p className="detail-footnote">请先在设置的资产交付目标中保存管理目标。</p>
          )}
          {selectedTarget && (
            <div className="copy-target-paths">
              <span className="detail-footnote">程序入口</span>
              <code>{selectedTarget.program.path}</code>
              <span className="detail-footnote">Home / Profile</span>
              <code>{selectedTarget.home.path}</code>
            </div>
          )}
          <div className="heading-actions">
            <Button
              secondary
              disabled={!selectedTarget || !versionId || !!busy}
              onClick={discover}
            >
              <FolderSearch size={15} />
              {busy === "discover" ? "查找中…" : "查找已有副本"}
            </Button>
            <Button
              secondary
              disabled={writeBusy}
              onClick={() => {
                invalidate();
                setEditor(false);
                setScan(null);
              }}
            >
              取消关联
            </Button>
          </div>
          {scan && (
            <div className="copy-scan">
              <p className="detail-footnote" role="status">
                {scanStale
                  ? "查找未完成 · 旧结果不可用于确认"
                  : `查找于 ${date(scan.at)} · ${scan.items.length} 个候选`}
              </p>
              <details>
                <summary>查找范围 · {scan.roots.length}</summary>
                {scan.roots.map((root) => (
                  <code key={root}>{root}</code>
                ))}
              </details>
              {scan.errors.map((item, index) => (
                <p key={index} className="copy-error" role="alert">
                  {item.path} · {item.message}
                </p>
              ))}
              {scan.truncated && (
                <p className="copy-error" role="alert">
                  候选较多，查找未完成，请重试。
                </p>
              )}
              {!scan.items.length && !scanStale && (
                <p className="detail-footnote">受支持目录中未发现候选副本。</p>
              )}
              {!!scan.items.length && (
                <fieldset className="copy-candidates">
                  <legend>选择副本</legend>
                  {scan.items.map((item) => (
                    <label key={item.id}>
                      <input
                        type="radio"
                        name={radioName}
                        checked={candidateId === item.id}
                        disabled={
                          scanStale || item.status !== "candidate" || writeBusy
                        }
                        onChange={() => {
                          invalidate();
                          setCandidateId(item.id);
                        }}
                      />
                      <span>
                        <strong>{item.name}</strong>
                        <code>{item.path}</code>
                        {item.message && <small>{item.message}</small>}
                      </span>
                    </label>
                  ))}
                </fieldset>
              )}
              <Button
                secondary
                disabled={!usableScan || !candidateId}
                onClick={readPreview}
              >
                {busy === "preview" ? "预览中…" : "预览对比"}
              </Button>
            </div>
          )}
          {preview && (
            <section
              className="copy-preview"
              aria-label="副本预览"
              ref={previewRef}
              tabIndex={-1}
            >
              <div className="copy-heading">
                <h4>{preview.targetLabel}</h4>
                <Badge tone="muted">固定 v{preview.versionNumber}.0</Badge>
              </div>
              <code>{preview.location}</code>
              {previewStale && (
                <p className="copy-error" role="alert">
                  预览已失效 · 请重新预览后确认。
                </p>
              )}
              <Comparison key={preview.token} value={preview.comparison} />
              {preview.existingCopy && (
                <div className="copy-confirm">
                  <p>
                    当前关联：{preview.existingCopy.assetName} · v
                    {preview.existingCopy.versionNumber}.0
                  </p>
                  {replacing && (
                    <>
                      <p>
                        此次确认将改为{" "}
                        {asset.versions.find((v) => v.id === versionId)?.title}{" "}
                        · v{preview.versionNumber}.0。
                      </p>
                      <label className="copy-replace">
                        <input
                          type="checkbox"
                          checked={replaceConfirmed}
                          disabled={!!busy}
                          onChange={(e) =>
                            setReplaceConfirmed(e.target.checked)
                          }
                        />
                        确认替换上述关联
                      </label>
                    </>
                  )}
                </div>
              )}
              <p className="detail-footnote">
                仅保存关系，不复制文件、不覆盖任一端。
              </p>
              <Button
                disabled={
                  !!busy || previewStale || (replacing && !replaceConfirmed)
                }
                onClick={bind}
              >
                {busy === "bind" ? "关联中…" : "确认关联"}
              </Button>
            </section>
          )}
        </div>
      )}
    </section>
  );
}
