import React, { useEffect, useRef, useState } from "react";
import { Copy, RefreshCw, Link2 } from "lucide-react";
import { Button, Badge } from "./components.jsx";
import { request } from "./api.js";

export function ProjectContext({ project, state, adoptState, notify }) {
  const binding = state.connections?.contextBindings?.find(
    (b) => b.projectId === project.id,
  );
  const [root, setRoot] = useState(
    binding?.root || project.localPaths[0] || "",
  );
  const [currentPath, setCurrentPath] = useState(
    binding?.currentPath || "CURRENT.md",
  );
  const [rulesPath, setRulesPath] = useState(binding?.rulesPath || "");
  const [preview, setPreview] = useState(null),
    [busy, setBusy] = useState(""),
    [error, setError] = useState("");
  const [pack, setPack] = useState(""),
    [copied, setCopied] = useState(false),
    [fallback, setFallback] = useState(false);
  const scopeKey = JSON.stringify([
    project.id,
    project.relationVersion || "",
    project.repoKey || "",
    project.localPaths,
    (project.locations || []).map((location) => [
      location.path,
      location.status === "changed",
      location.identity || "",
      location.observedIdentity || "",
    ]),
  ]);
  const currentScope = useRef(scopeKey),
    sequence = useRef(0),
    lock = useRef(false);
  currentScope.current = scopeKey;
  useEffect(() => {
    sequence.current++;
    lock.current = false;
    clear();
    setBusy("");
    return () => {
      sequence.current++;
    };
  }, [scopeKey]);
  const location = project.locations?.find((entry) => entry.path === root);
  const directoryChanged =
    location?.status === "changed" ||
    (location?.observedIdentity &&
      location.observedIdentity !== location.identity);
  const connected =
    !!binding &&
    /^[a-f0-9]{64}$/.test(binding.directoryStamp || "") &&
    (binding.relationVersion || "") === (project.relationVersion || "") &&
    !directoryChanged &&
    (!preview || preview.identity.directoryStamp === binding.directoryStamp) &&
    binding.root === root &&
    binding.currentPath === currentPath &&
    binding.rulesPath === rulesPath &&
    binding.repoKey === (project.repoKey || "") &&
    project.localPaths.includes(root);
  const input = { projectId: project.id, root, currentPath, rulesPath };
  function clear() {
    setPreview(null);
    setPack("");
    setCopied(false);
    setFallback(false);
    setError("");
  }
  async function run(action) {
    if (lock.current) return;
    lock.current = true;
    const ticket = ++sequence.current;
    const active = () =>
      ticket === sequence.current && currentScope.current === scopeKey;
    setBusy(action);
    setError("");
    setCopied(false);
    setPack("");
    setFallback(false);
    try {
      if (action === "preview") {
        setPreview(null);
        const result = await request("/project-context/preview", input);
        if (!active()) return;
        setPreview(result);
      } else if (action === "bind") {
        const next = await request("/project-context/bind", {
          ...input,
          revision: state.revision,
          fingerprint: preview.fingerprint,
        });
        if (!active()) return;
        adoptState(next);
        notify("项目来源已连接");
      } else if (action === "unbind") {
        const next = await request("/project-context/unbind", {
          projectId: project.id,
          revision: state.revision,
        });
        if (!active()) return;
        adoptState(next);
        clear();
        notify("已断开连接，原文件未改动");
      } else {
        const result = await request("/project-context/prepare", {
          projectId: project.id,
          fingerprint: preview.fingerprint,
        });
        if (!active()) return;
        setPack(result.text);
        try {
          await navigator.clipboard.writeText(result.text);
          if (!active()) return;
          setCopied(true);
          notify("项目交接包已复制");
        } catch {
          if (!active()) return;
          setFallback(true);
          setError(
            "复制失败，请手动选择下方交接包文本。来源变化后需重新预览。",
          );
        }
      }
    } catch (e) {
      if (active()) {
        setError(e.message);
        setPreview(null);
      }
    } finally {
      if (active()) {
        lock.current = false;
        setBusy("");
      }
    }
  }
  return (
    <section className="project-context" aria-label="项目上下文">
      <div className="section-head">
        <h3>项目上下文</h3>
        <Badge tone="muted">仅限本机</Badge>
      </div>
      {!project.localPaths.length ? (
        <p className="body-copy">
          此项目仅关联
          GitHub。连接本地目录后可读取状态文件；当前不读取远端正文。
        </p>
      ) : (
        <>
          <p className="detail-footnote">
            {connected
              ? "已连接 · 仅保存来源位置"
              : binding
                ? "来源连接待重新确认"
                : "选择已有状态文件，原文件保持不变。"}
          </p>
          <label>
            来源目录
            <select
              value={root}
              disabled={!!busy}
              onChange={(e) => {
                setRoot(e.target.value);
                clear();
              }}
            >
              {!project.localPaths.includes(root) && (
                <option value={root}>原目录已不在项目中，请重新选择</option>
              )}
              {project.localPaths.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
          </label>
          <label>
            当前状态文件
            <input
              value={currentPath}
              disabled={!!busy}
              placeholder="CURRENT.md 或 docs/CURRENT.md"
              onChange={(e) => {
                setCurrentPath(e.target.value);
                clear();
              }}
            />
          </label>
          <label>
            共同规则文件（可选）
            <input
              value={rulesPath}
              disabled={!!busy}
              placeholder="例如 AGENTS.md"
              onChange={(e) => {
                setRulesPath(e.target.value);
                clear();
              }}
            />
          </label>
          <p className="detail-footnote">
            填写项目内相对路径。仅读取所选 Markdown，每份最多 64
            KiB；不读取聊天或凭据。
          </p>
          <div className="heading-actions">
            <Button
              secondary
              disabled={!!busy || !currentPath || !root}
              onClick={() => run("preview")}
            >
              <RefreshCw size={15} />
              {busy === "preview" ? "读取中…" : "预览文件"}
            </Button>
            {!connected && (
              <Button disabled={!!busy || !preview} onClick={() => run("bind")}>
                <Link2 size={15} />
                {busy === "bind" ? "连接中…" : "保存连接"}
              </Button>
            )}
            {!!binding && (
              <Button secondary disabled={!!busy} onClick={() => run("unbind")}>
                断开连接
              </Button>
            )}
          </div>
          {preview && (
            <div className="context-preview">
              <strong>已读取 {preview.documents.length} 份来源</strong>
              <small>
                读取于 {new Date(preview.readAt).toLocaleString("zh-CN")} ·
                内容有效性仍需核对
              </small>
              {preview.documents.map((d) => (
                <details key={d.role}>
                  <summary>
                    {d.role === "current" ? "当前状态" : "共同规则"} · {d.path}
                  </summary>
                  <p className="detail-footnote">
                    文件修改于 {new Date(d.modifiedAt).toLocaleString("zh-CN")}
                  </p>
                  <code className="context-hash">SHA-256 · {d.sha256}</code>
                  <pre className="context-source">{d.content}</pre>
                </details>
              ))}
            </div>
          )}
          <Button
            disabled={!!busy || !preview || !connected}
            onClick={() => run("copy")}
          >
            <Copy size={16} />
            {busy === "copy" ? "核对来源…" : "复制项目交接包"}
          </Button>
          <p className="detail-footnote">
            只复制来源位置与校验信息，不包含正文，不发送给 Agent。
          </p>
          {copied && (
            <p role="status" className="context-receipt">
              已复制 · 未发送给 Agent
            </p>
          )}
          {fallback && pack && (
            <label>
              项目交接包文本
              <textarea
                readOnly
                rows={8}
                value={pack}
                onFocus={(e) => e.target.select()}
              />
            </label>
          )}
        </>
      )}
      {error && (
        <p className="inline-error" role="alert">
          {error}
        </p>
      )}
    </section>
  );
}
