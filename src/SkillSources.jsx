import { SkillSourceUpdate } from "./SkillSourceUpdate.jsx";
import React, { useEffect, useRef, useState } from "react";
import { FolderSearch, GitFork, RefreshCw } from "lucide-react";
import { Badge, Button, Dialog, Steps } from "./components.jsx";
import { request } from "./api.js";
import { current } from "./store.js";

const messageOf = (error) => error.message || "本地服务处理失败，请重试。";
const timeLabel = (value) => new Date(value).toLocaleString("zh-CN");

export function SkillSourceImport({
  state,
  adoptState,
  notify,
  onClose,
  onSelect,
  initialRoots,
  initialSearch = "",
}) {
  const [roots, setRoots] = useState(initialRoots?.join("\n") || "");
  // 从智能体群“存入资产仓库”进来时，首次扫描后按该 Skill 名称筛选，仍需逐个预览并确认。
  const pendingSearch = useRef(initialSearch);
  const [result, setResult] = useState(null);
  const [fresh, setFresh] = useState(false);
  const [search, setSearch] = useState("");
  const [preview, setPreview] = useState(null);
  const [title, setTitle] = useState("");
  const [busy, setBusy] = useState("loading");
  const [error, setError] = useState("");
  const [expired, setExpired] = useState(false);
  const lock = useRef(true);
  const alive = useRef(true);

  useEffect(() => {
    alive.current = true;
    if (initialRoots?.length) {
      lock.current = false;
      setBusy("");
      return () => {
        alive.current = false;
      };
    }
    request("/skill-sources")
      .then((value) => {
        if (alive.current) setRoots(value.roots.join("\n"));
      })
      .catch((e) => {
        if (alive.current) setError(messageOf(e));
      })
      .finally(() => {
        if (alive.current) {
          lock.current = false;
          setBusy("");
        }
      });
    return () => {
      alive.current = false;
    };
  }, []);

  useEffect(() => {
    setExpired(false);
    if (!preview) return;
    const remaining = new Date(preview.expiresAt).getTime() - Date.now();
    if (remaining <= 0) {
      setExpired(true);
      return;
    }
    const timer = setTimeout(() => setExpired(true), remaining);
    return () => clearTimeout(timer);
  }, [preview]);

  function close() {
    if (!lock.current) onClose();
  }
  function clearPreview() {
    setPreview(null);
    setTitle("");
    setError("");
  }
  async function discover() {
    if (lock.current || !roots.trim()) return;
    lock.current = true;
    setBusy("scan");
    clearPreview();
    setFresh(false);
    try {
      const value = await request("/skill-sources/discover", {
        roots: [
          ...new Set(
            roots
              .split(/\r?\n/)
              .map((p) => p.trim())
              .filter(Boolean),
          ),
        ],
      });
      if (!alive.current) return;
      setResult(value);
      setFresh(true);
      setSearch(pendingSearch.current);
      pendingSearch.current = "";
    } catch (e) {
      if (alive.current) setError(messageOf(e));
    } finally {
      lock.current = false;
      if (alive.current) setBusy("");
    }
  }
  async function inspect(item, retainTitle = false) {
    if (lock.current || !fresh || item.status !== "candidate") return;
    lock.current = true;
    setBusy(`preview:${item.id}`);
    if (retainTitle) setError("");
    else clearPreview();
    try {
      const value = await request("/skill-sources/preview", {
        candidateId: item.id,
      });
      const latest = await request("/workspace");
      if (!alive.current) return;
      if (!latest) throw new Error("资产库暂不可用，请重试预览。");
      adoptState(latest);
      setPreview({ ...value, candidateId: item.id });
      if (!retainTitle) setTitle(value.name.slice(0, 80));
    } catch (e) {
      if (alive.current)
        setError(`${item.name}：未取得完整包，不能确认收录。${messageOf(e)}`);
    } finally {
      lock.current = false;
      if (alive.current) setBusy("");
    }
  }
  const changed = !!preview && preview.revision !== state.revision;
  const canImport =
    !!preview && fresh && !expired && !changed && !!title.trim();
  async function confirm(e) {
    e.preventDefault();
    if (lock.current || !canImport) return;
    lock.current = true;
    setBusy("import");
    setError("");
    try {
      const value = await request("/skill-sources/import", {
        token: preview.token,
        revision: preview.revision,
        title: title.trim(),
      });
      if (!alive.current) return;
      adoptState(value.state);
      notify(
        value.alreadyImported
          ? "已找到相同来源快照，未重复收录"
          : "Skill 已收录，未安装或执行",
      );
      onClose();
      onSelect(value.assetId);
    } catch (e) {
      if (alive.current) setError(messageOf(e));
    } finally {
      lock.current = false;
      if (alive.current) setBusy("");
    }
  }
  const shown = (result?.items || []).filter((item) =>
    `${item.name} ${item.path}`
      .toLowerCase()
      .includes(search.trim().toLowerCase()),
  );

  return (
    <Dialog title="收录本机 Skill" onClose={close}>
      <form className="asset-form" onSubmit={confirm} aria-busy={!!busy}>
        <div className="import-head">
          <Steps
            items={["扫描目录", "预览完整包", "确认收录"]}
            current={preview ? 2 : result && fresh ? 1 : 0}
          />
          <Badge tone="muted">仅限本机</Badge>
        </div>
        <label>
          扫描目录
          <textarea
            aria-label="扫描目录"
            rows={3}
            value={roots}
            disabled={!!busy}
            placeholder="每行一个具体 Skill 目录"
            onChange={(e) => {
              setRoots(e.target.value);
              setResult(null);
              setFresh(false);
              clearPreview();
            }}
          />
        </label>
        <p className="detail-footnote">
          只扫描这些目录；不安装、激活或执行其中的内容。
        </p>
        <div className="heading-actions">
          <Button
            type="button"
            secondary
            disabled={!!busy || !roots.trim()}
            onClick={discover}
          >
            <FolderSearch size={16} />
            {busy === "loading"
              ? "读取目录…"
              : busy === "scan"
                ? "扫描中…"
                : "扫描目录"}
          </Button>
        </div>
        {result && (
          <section className="skill-source-results" aria-label="扫描结果">
            <p className="context-receipt" role="status">
              {fresh
                ? `发现 ${result.items.length} 项`
                : "上次扫描结果 · 请重新扫描"}
              {result.truncated ? " · 扫描未完成，请缩小目录范围" : ""}
            </p>
            {result.errors.length > 0 && (
              <div className="error" role="alert">
                <p>以下目录未完成扫描：</p>
                {result.errors.map((item, index) => (
                  <p
                    className="reference-identity"
                    key={`${item.path}:${index}`}
                  >
                    {item.path} · {item.message}
                  </p>
                ))}
              </div>
            )}
            <label>
              搜索扫描结果
              <input
                aria-label="搜索扫描结果"
                value={search}
                disabled={!!busy}
                placeholder="名称或路径"
                onChange={(e) => {
                  setSearch(e.target.value);
                  clearPreview();
                }}
              />
            </label>
            {shown.length ? (
              <div
                className="skill-source-list"
                tabIndex={0}
                aria-label="本机 Skill 候选"
              >
                {shown.map((item) => (
                  <div
                    className={`context-preview source-candidate ${item.status === "candidate" ? "" : "blocked"}`}
                    key={item.id}
                  >
                    <div className="workflow-reference-heading">
                      <strong>{item.name}</strong>
                      <Badge tone="muted">
                        {item.status === "candidate"
                          ? "待预览"
                          : "无法完整收录"}
                      </Badge>
                    </div>
                    <p className="reference-identity">{item.path}</p>
                    {item.message && (
                      <p className="detail-footnote">{item.message}</p>
                    )}
                    {item.status === "candidate" && (
                      <div className="heading-actions">
                        <Button
                          type="button"
                          secondary
                          disabled={!!busy || !fresh}
                          aria-label={`预览 ${item.name}`}
                          onClick={() => inspect(item)}
                        >
                          <RefreshCw size={15} />
                          {busy === `preview:${item.id}` ? "读取中…" : "预览"}
                        </Button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <p className="detail-footnote">
                {result.items.length
                  ? "没有匹配项，请修改关键词。"
                  : "未发现 Skill，请调整扫描目录。"}
              </p>
            )}
          </section>
        )}
        {preview && (
          <section
            className="context-preview source-preview"
            aria-label="完整包预览"
          >
            <div className="workflow-reference-heading">
              <strong>{preview.name}</strong>
              <Badge tone="muted">
                {preview.existingAssetId ? "已有相同快照" : "完整包 · 待确认"}
              </Badge>
            </div>
            <p className="reference-identity">{preview.location}</p>
            <p className="detail-footnote">
              {preview.files.length} 项 · {preview.bytes.toLocaleString()} B
            </p>
            <code className="context-hash">
              SHA-256 · {preview.fingerprint}
            </code>
            <small>预览有效期至 {timeLabel(preview.expiresAt)}</small>
            <details>
              <summary>入口全文 · SKILL.md</summary>
              <pre
                className="history-text"
                tabIndex={0}
                aria-label="Skill 入口全文"
              >
                {preview.content}
              </pre>
            </details>
            <details>
              <summary>完整文件清单 · {preview.files.length} 项</summary>
              <div
                className="history-files history-text"
                tabIndex={0}
                aria-label="完整文件清单"
              >
                {preview.files.map((file) => (
                  <div key={file.path}>
                    <strong>
                      {file.path}
                      {file.directory ? "/" : ""}
                    </strong>
                    <small>
                      {file.directory
                        ? "目录"
                        : `${file.bytes.toLocaleString()} B`}{" "}
                      · 权限 {Number(file.mode).toString(8)}
                    </small>
                    {file.sha256 && (
                      <code className="context-hash">
                        SHA-256 · {file.sha256}
                      </code>
                    )}
                  </div>
                ))}
              </div>
            </details>
            <p className="detail-footnote">
              完整包仅表示文件读取完整，不代表安全、已安装或已采用。
            </p>
            {!preview.existingAssetId && (
              <label>
                收录名称
                <input
                  aria-label="收录名称"
                  value={title}
                  required
                  maxLength={80}
                  disabled={!!busy}
                  onChange={(e) => setTitle(e.target.value)}
                />
              </label>
            )}
            {(expired || changed) && (
              <p className="error" role="alert">
                {expired
                  ? "预览已过期，请重新预览后确认。"
                  : "资产库已变化，请重新预览后确认。"}
              </p>
            )}
          </section>
        )}
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        <div className="form-actions">
          <Button type="button" secondary disabled={!!busy} onClick={close}>
            取消
          </Button>
          {preview && (error || expired || changed) && (
            <Button
              type="button"
              secondary
              disabled={!!busy || !fresh}
              onClick={() => {
                const item = result?.items.find(
                  (item) => item.id === preview.candidateId,
                );
                if (item) inspect(item, true);
              }}
            >
              重新预览
            </Button>
          )}
          <Button type="submit" disabled={!!busy || !canImport}>
            {busy === "import"
              ? "正在核对…"
              : preview?.existingAssetId
                ? "查看已收录资产"
                : "确认收录"}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}

export function SkillOrigin({ asset, state, adoptState, notify, onSelect }) {
  const version = current(asset);
  const origin = asset.origin;
  const source =
    origin?.kind === "derived"
      ? state.assets.find((item) => item.id === origin.assetId)
      : null;
  const sourceVersion = source?.versions.find(
    (item) => item.id === origin.versionId,
  );
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(`${version.title.slice(0, 74)} · 个人版`);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const lock = useRef(false);

  async function derive(e) {
    e.preventDefault();
    if (lock.current || !title.trim()) return;
    lock.current = true;
    setBusy(true);
    setError("");
    try {
      const result = await request("/skill-sources/derive", {
        assetId: asset.id,
        versionId: version.id,
        revision: state.revision,
        title: title.trim(),
      });
      adoptState(result.state);
      notify("个人改版已创建，源资产未改动");
      setEditing(false);
      onSelect(result.assetId);
    } catch (e) {
      setError(messageOf(e));
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }

  return (
    <section className="project-context" aria-label="Skill 来源与改版">
      <div className="workflow-reference-heading">
        <strong>来源与改版</strong>
        {origin && <Badge tone="muted">历史来源</Badge>}
      </div>
      {origin?.kind === "local" ? (
        <div className="context-preview">
          <strong>本机初始收录</strong>
          <p className="reference-identity">{origin.location}</p>
          <small>收录于 {timeLabel(origin.capturedAt)}</small>
          <code className="context-hash">初始指纹 · {origin.fingerprint}</code>
          <p className="detail-footnote">
            记录初次收录来源，不代表当前目录内容或安装状态。
          </p>
        </div>
      ) : origin?.kind === "derived" ? (
        <div className="context-preview">
          <strong>
            {sourceVersion
              ? `${sourceVersion.title} · v${source.versions.indexOf(sourceVersion) + 1}.0`
              : "来源资产或版本已缺失"}
          </strong>
          <p className="reference-identity">
            {origin.assetId} / {origin.versionId}
          </p>
          {source?.archived && <Badge tone="muted">来源已归档</Badge>}
          <p className="detail-footnote">
            从此版本独立创建；源资产后续更新不会自动同步。
          </p>
          {source && (
            <div className="heading-actions">
              <Button
                type="button"
                secondary
                disabled={busy}
                onClick={() => onSelect(source.id)}
              >
                查看来源资产
              </Button>
            </div>
          )}
        </div>
      ) : (
        <p className="detail-footnote">此资产没有结构化来源记录。</p>
      )}
      {origin && <SkillSourceUpdate key={`${asset.id}:${version.id}`} asset={asset} adoptState={adoptState} notify={notify} />}
      {editing ? (
        <form className="skill-origin-form" onSubmit={derive} aria-busy={busy}>
          <div className="form-row">
            <label>
              个人改版名称
              <input
                aria-label="个人改版名称"
                required
                maxLength={80}
                value={title}
                disabled={busy}
                onChange={(e) => setTitle(e.target.value)}
              />
            </label>
          </div>
          <p className="detail-footnote">
            复制当前 v{asset.versions.length}.0
            的完整文件，创建独立资产；源资产保持不变。
          </p>
          {error && (
            <p className="error" role="alert">
              {error}
            </p>
          )}
          <div className="form-actions">
            <Button
              type="button"
              secondary
              disabled={busy}
              onClick={() => {
                setEditing(false);
                setError("");
              }}
            >
              取消改版
            </Button>
            <Button type="submit" disabled={busy || !title.trim()}>
              {busy ? "创建中…" : "确认创建"}
            </Button>
          </div>
        </form>
      ) : (
        <Button type="button" secondary onClick={() => setEditing(true)}>
          <GitFork size={16} />
          创建个人改版
        </Button>
      )}
    </section>
  );
}
