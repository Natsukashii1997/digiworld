import { flyData } from './data-flight.js';
import React, { useEffect, useRef, useState } from "react";
import { Copy, Link2, RefreshCw } from "lucide-react";
import { Button, Badge } from "./components.jsx";
import { copy } from "./Assets.jsx";
import { request } from "./api.js";
import "./project-locations.css";

const statuses = {
  present: "已发现",
  missing: "目录缺失",
  unknown: "未核实",
  out_of_scope: "扫描范围外",
  unrecognized: "未识别为项目",
  changed: "目录已更换 · 待确认",
};
const date = (value) =>
  value ? new Date(value).toLocaleString("zh-CN") : "尚未查验";
const identityText = (value) =>
  value === undefined
    ? "未记录"
    : typeof value === "string"
      ? value
      : JSON.stringify(value);

function PathList({ title, paths }) {
  return (
    <div className="project-location-paths">
      <strong>{title}</strong>
      {paths.length ? (
        <ul>
          {paths.map((path) => (
            <li key={path}>
              <code>{path}</code>
            </li>
          ))}
        </ul>
      ) : (
        <span className="detail-footnote">无本地目录</span>
      )}
    </div>
  );
}

export function ProjectLocations({ project, state, adoptState, notify, identityIssueRoot = '' }) {
  const [editor, setEditor] = useState(null),
    [candidateId, setCandidateId] = useState(""),
    [replacePath, setReplacePath] = useState("");
  const [preview, setPreview] = useState(null),
    [confirmed, setConfirmed] = useState(false),
    [expired, setExpired] = useState(false);
  const [busy, setBusy] = useState(""),
    [error, setError] = useState(""),
    [pending, setPending] = useState(false),
    [result, setResult] = useState(null);
  const generation = useRef(0),
    lock = useRef(false),
    latest = useRef(null),
    previewRef = useRef(null),
    resultRef = useRef(null);
  latest.current = { revision: state.revision, project };
  const projects = state.connections?.projects || [];
  const candidates = projects.filter(
    (p) => p.id !== project.id && p.localPaths.length,
  );
  const candidate = candidates.find((p) => p.id === candidateId);
  const locations = project.localPaths.map(
    (path) => project.locations?.find((l) => l.path === path) || { path },
  );
  const missing = locations.filter((l) => l.status === "missing");
  const previewStale =
    !!preview && (preview.revision !== state.revision || expired);

  useEffect(
    () => () => {
      generation.current++;
      lock.current = false;
    },
    [],
  );
  useEffect(() => {
    if (!preview) return;
    const until = Date.parse(preview.expiresAt);
    setExpired(!Number.isFinite(until) || until <= Date.now());
    const timer = setTimeout(
      () => setExpired(true),
      Math.max(0, until - Date.now()),
    );
    previewRef.current?.focus({ preventScroll: true });
    previewRef.current?.scrollIntoView({ block: "start", behavior: "instant" });
    return () => clearTimeout(timer);
  }, [preview?.token]);
  useEffect(() => {
    if (preview && preview.revision !== state.revision) setConfirmed(false);
  }, [state.revision, preview?.revision]);
  useEffect(() => {
    if (!result) return;
    resultRef.current?.focus({ preventScroll: true });
    resultRef.current?.scrollIntoView({ block: "start", behavior: "instant" });
  }, [result]);

  function clearPreview() {
    generation.current++;
    lock.current = false;
    setBusy("");
    setPreview(null);
    setConfirmed(false);
    setExpired(false);
    setError("");
    setResult(null);
  }

  async function run(action, input) {
    if (lock.current || (pending && action !== "refresh")) return;
    lock.current = true;
    const ticket = ++generation.current;
    const revision = state.revision;
    const relationVersion = project.relationVersion;
    setBusy(action);
    setError("");
    setResult(null);
    if (action === "preview") {
      setPreview(null);
      setConfirmed(false);
    }
    const active = () => ticket === generation.current;
    try {
      if (action === "refresh") {
        const next = await request("/workspace");
        if (!active()) return;
        adoptState(next);
        setPending(false);
        setPreview(null);
        setConfirmed(false);
        setResult({ message: "已刷新关联，请核对目录列表。" });
        return;
      }
      if (action === "confirm") {
        if (
          !preview ||
          !confirmed ||
          preview.revision !== revision ||
          Date.parse(preview.expiresAt) <= Date.now()
        )
          throw new Error("预览已失效，请重新预览并确认。");
        setPending(true);
        const next = await request(
          "/project-identity/confirm",
          { token: preview.token, revision: preview.revision },
          "POST",
          false,
        );
        if (!active()) return;
        if (latest.current.revision !== revision) {
          setPreview(null);
          setConfirmed(false);
          throw new Error("主库已变化，本次结果请刷新核对关联。");
        }
        const needsReview = preview.contextNeedsReview;
        adoptState(next);
        flyData();
        setPending(false);
        setPreview(null);
        setConfirmed(false);
        setEditor(null);
        setResult({
          message: "项目关联已更新，原文件未改动。",
          needsReview,
        });
        notify("项目关联已更新");
        return;
      }
      const value = await request("/project-identity/preview", {
        ...input,
        projectId: project.id,
        revision,
      });
      if (!active()) return;
      const next = await request("/workspace");
      if (!active()) return;
      if (
        latest.current.revision !== revision ||
        latest.current.project.relationVersion !== relationVersion
      )
        throw new Error("项目或主库已变化，请重新预览关联。");
      adoptState(next);
      if (next.revision !== value.revision)
        throw new Error("预览期间主库已变化，请重新预览关联。");
      setPreview(value);
      setConfirmed(false);
    } catch (e) {
      if (!active()) return;
      setError(e.message);
      setPreview(null);
      setConfirmed(false);
    } finally {
      if (active()) {
        lock.current = false;
        setBusy("");
      }
    }
  }

  return (
    <section className="project-locations" aria-label="项目目录与身份">
      <div className="project-location-heading">
        <h3>项目身份</h3>
        {project.identityConflict && <Badge tone="muted">项目身份待确认</Badge>}
      </div>
      <div className="project-location-id">
        <code>{project.id}</code>
        <Button secondary onClick={() => copy(project.id, notify)}>
          <Copy size={15} />
          复制项目 ID
        </Button>
      </div>
      {!!project.aliases?.length && (
        <details className="project-location-details">
          <summary>历史项目 ID · {project.aliases.length}</summary>
          {project.aliases.map((id) => (
            <code key={id}>{id}</code>
          ))}
        </details>
      )}
      {project.identityConflict && (
        <p className="detail-footnote">
          存在共享远端或来源连接冲突，已保留各项目；不会自动选择 Current。
        </p>
      )}
      <div className="project-location-heading">
        <h3>本地目录 · {locations.length}</h3>
        <Button secondary disabled={!!busy} onClick={() => run("refresh")}>
          <RefreshCw size={15} />
          {busy === "refresh" ? "刷新中…" : "刷新核对关联"}
        </Button>
      </div>
      {locations.map((location, index) => (
        <div className="path-entry project-location-row" key={location.path}>
          <div className="project-location-heading">
            <Badge tone="muted">{statuses[location.status] || "待扫描"}</Badge>
            <small>
              {location.checkedAt
                ? `查验于 ${date(location.checkedAt)}`
                : "尚未查验"}
            </small>
          </div>
          <code>{location.path}</code>
          {location.message && (
            <p className="detail-footnote">{location.message}</p>
          )}
          <div className="heading-actions">
            <Button secondary onClick={() => copy(location.path, notify)}>
              <Copy size={15} />
              复制路径
            </Button>
            <Button
              secondary
              disabled={!!busy || location.status === "missing"}
              onClick={async () => {
                try {
                  await request("/reveal", {
                    kind: "project",
                    id: project.id,
                    index,
                  });
                } catch (e) {
                  notify(e.message, "error");
                }
              }}
            >
              在 Finder 中显示
            </Button>
            {(identityIssueRoot === location.path || location.status === "changed" ||
              (location.observedIdentity &&
                location.observedIdentity !== location.identity)) && (
              <Button
                secondary
                disabled={!!busy || pending}
                onClick={() => {
                  clearPreview();
                  setEditor({ mode: "accept", path: location.path });
                  run("preview", { mode: "accept", path: location.path });
                }}
              >
                重新确认目录
              </Button>
            )}
          </div>
        </div>
      ))}
      {!locations.length && (
        <p className="detail-footnote">尚未关联本地目录。</p>
      )}
      {!editor && (
        <Button
          secondary
          disabled={!!busy || pending}
          onClick={() => {
            clearPreview();
            setEditor({ mode: "merge" });
          }}
        >
          <Link2 size={15} />
          关联已发现目录
        </Button>
      )}
      {editor && !preview && (
        <form
          className="project-location-editor"
          aria-label="关联已发现目录"
          onSubmit={(event) => {
            event.preventDefault();
            run(
              "preview",
              editor.mode === "merge"
                ? { mode: "merge", candidateId, replacePath }
                : editor,
            );
          }}
        >
          {editor.mode === "merge" ? (
            <>
              <label>
                已发现的项目目录
                <select
                  value={candidateId}
                  disabled={!!busy || pending}
                  onChange={(e) => {
                    clearPreview();
                    setCandidateId(e.target.value);
                  }}
                >
                  <option value="">选择项目</option>
                  {candidateId && !candidate && (
                    <option value={candidateId}>候选已变化，请重新选择</option>
                  )}
                  {candidates.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name} · {p.localPaths.join(" · ")}
                    </option>
                  ))}
                </select>
              </label>
              {candidate && (
                <PathList title="候选目录" paths={candidate.localPaths} />
              )}
              {!candidates.length && (
                <p className="detail-footnote">
                  没有其他已发现目录，请先扫描项目。
                </p>
              )}
              <label>
                替换缺失目录（可选）
                <select
                  value={replacePath}
                  disabled={!!busy || pending}
                  onChange={(e) => {
                    clearPreview();
                    setReplacePath(e.target.value);
                  }}
                >
                  <option value="">不替换，保留多个目录</option>
                  {replacePath &&
                    !missing.some((l) => l.path === replacePath) && (
                      <option value={replacePath}>
                        原选择已变化，请重新选择
                      </option>
                    )}
                  {missing.map((l) => (
                    <option key={l.path} value={l.path}>
                      {l.path}
                    </option>
                  ))}
                </select>
              </label>
            </>
          ) : (
            <PathList title="重新确认目录" paths={[editor.path]} />
          )}
          <div className="heading-actions">
            <Button
              secondary
              disabled={busy === "confirm"}
              onClick={() => {
                clearPreview();
                setEditor(null);
              }}
              type="button"
            >
              取消
            </Button>
            <Button
              disabled={
                !!busy ||
                pending ||
                (editor.mode === "merge" &&
                  (!candidate ||
                    (replacePath &&
                      !missing.some((l) => l.path === replacePath))))
              }
            >
              {busy === "preview" ? "预览中…" : "预览关联"}
            </Button>
          </div>
        </form>
      )}
      {preview && (
        <section
          className="project-location-preview"
          aria-label="项目关联预览"
          tabIndex={-1}
          ref={previewRef}
        >
          <div className="project-location-heading">
            <h4>{preview.mode === "accept" ? "重新确认目录" : "关联变化"}</h4>
            <Badge tone="muted">尚未确认</Badge>
          </div>
          <div className="project-location-paths">
            <strong>保留项目 · {preview.project.name}</strong>
            <code>{preview.project.id}</code>
            {preview.candidate && (
              <>
                <span>合入项目 · {preview.candidate.name}</span>
                <code>{preview.candidate.id}</code>
              </>
            )}
          </div>
          <PathList title="当前目录" paths={preview.oldPaths} />
          <PathList title="确认后目录" paths={preview.newPaths} />
          {preview.removedPath && (
            <PathList
              title="解除关联（不删除文件）"
              paths={[preview.removedPath]}
            />
          )}
          <p className="detail-footnote">
            GitHub 关联：
            {preview.oldRepoKey !== preview.repoKey
              ? `${preview.oldRepoKey || "未关联"} → ${preview.repoKey || "未关联"}`
              : preview.repoKey || "未关联"}
          </p>
          {preview.mode === "accept" && (
            <details className="project-location-details">
              <summary>目录身份变化</summary>
              <span>原身份</span>
              <code>
                {identityText(
                  locations.find((l) => l.path === editor?.path)?.identity,
                )}
              </code>
              <span>本次查验</span>
              <code>
                {identityText(
                  preview.evidence.find((l) => l.path === editor?.path)
                    ?.identity,
                )}
              </code>
            </details>
          )}
          {preview.contextNeedsReview && (
            <p className="detail-footnote">
              Current 来源选择保留；确认后需重新预览并保存连接。
            </p>
          )}
          <p className="detail-footnote">
            预览有效至 {date(preview.expiresAt)}
          </p>
          {previewStale && (
            <p className="inline-error" role="status">
              预览已失效，请返回并重新预览。
            </p>
          )}
          <label className="project-location-confirm">
            <input
              type="checkbox"
              checked={confirmed}
              disabled={!!busy || pending || previewStale}
              onChange={(e) => setConfirmed(e.target.checked)}
            />
            <span>只修改工作台关联，不搬移或删除文件</span>
          </label>
          <div className="heading-actions">
            <Button secondary disabled={!!busy} onClick={clearPreview}>
              返回选择
            </Button>
            <Button
              disabled={!!busy || pending || previewStale || !confirmed}
              onClick={() => run("confirm")}
            >
              {busy === "confirm" ? "确认中…" : "确认关联"}
            </Button>
          </div>
        </section>
      )}
      {error && (
        <p className="inline-error" role="alert">
          {error}
        </p>
      )}
      {pending && (
        <p className="detail-footnote" role="status">
          关联结果待核对，请使用“刷新核对关联”；不会自动再次提交。
        </p>
      )}
      {result && (
        <section
          className="project-location-result"
          aria-label="项目关联结果"
          ref={resultRef}
          tabIndex={-1}
        >
          <p role="status">{result.message}</p>
          {result.needsReview && (
            <p className="detail-footnote">Current 需重新预览并保存连接。</p>
          )}
        </section>
      )}
    </section>
  );
}
