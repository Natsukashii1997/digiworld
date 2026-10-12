import { flyDataOnce } from './data-flight.js';
import { Reading, ReadReveal } from './ScanMotion.jsx';
import React, { useEffect, useRef, useState } from "react";
import { FolderOpen } from "lucide-react";
import { request } from "./api.js";
import { Button, Badge } from "./components.jsx";
import { current } from "./store.js";
import { TextDifference } from "./AssetHistory.jsx";
import "./agent-config.css";
import "./rule-install.css";

const FILES = ["AGENTS.md", "CLAUDE.md"];
const STATUS = {
  matches_after: "已写入，回读一致",
  matches_before: "文件仍是写入前的内容",
  changed: "文件之后有其他改动",
  unknown: "结果未知，请核对",
};
const when = (v) => (v ? new Date(v).toLocaleString("zh-CN") : "");
// 写入结果未知的操作 ID 存在会话里：关闭抽屉、刷新页面后仍只能先核对（D-R2）。
const PENDING_KEY = "guiji:rule-pending";
function readPending() {
  try {
    return sessionStorage.getItem(PENDING_KEY) || "";
  } catch {
    return "";
  }
}
function writePending(id) {
  try {
    if (id) sessionStorage.setItem(PENDING_KEY, id);
    else sessionStorage.removeItem(PENDING_KEY);
  } catch {
    /* 会话存储不可用时仍保留当前面板内的锁 */
  }
}
const versionLabel = (asset, id) => {
  const n = asset ? asset.versions.findIndex((x) => x.id === id) + 1 : 0;
  return n ? `v${n}.0` : "其他版本";
};

// 规则模板装入项目：预览差异 → 勾选确认 → 写入 → 回读。只维护文件里的托管区块。
export function RuleInstall({ asset, state, installs, refresh, notify }) {
  const v = current(asset);
  const projects = (state.connections?.projects || []).filter(
    (p) => p.localPaths?.length,
  );
  const [projectId, setProjectId] = useState(projects[0]?.id || ""),
    [root, setRoot] = useState(projects[0]?.localPaths[0] || ""),
    [file, setFile] = useState(FILES[0]),
    [overwrite, setOverwrite] = useState(false),
    [preview, setPreview] = useState(null),
    [confirmed, setConfirmed] = useState(false),
    [result, setResult] = useState(null),
    [unconfirmed, setUnconfirmedState] = useState(readPending),
    [busy, setBusy] = useState(""),
    [error, setError] = useState("");
  const previewRef = useRef(),
    resultRef = useRef();
  const setUnconfirmed = (id) => {
    writePending(id);
    setUnconfirmedState(id);
  };
  useEffect(() => previewRef.current?.focus(), [preview]);
  useEffect(() => resultRef.current?.focus(), [result]);
  const project = projects.find((p) => p.id === projectId);
  const nameOf = (id) => projects.find((p) => p.id === id)?.name || id;
  const versionOf = (id) => versionLabel(asset, id);
  const loadError = installs?.error || "";
  const loading = !loadError && !installs?.loaded;
  const mine = (installs?.items || []).filter(
    (i) => i.assetId === asset.id || i.pending?.assetId === asset.id,
  );
  const locked = !!busy || !!unconfirmed;

  async function run(label, action) {
    setBusy(label);
    setError("");
    try {
      return await action();
    } catch (e) {
      setError(e.message || "本地服务处理失败");
      return null;
    } finally {
      setBusy("");
    }
  }
  // 覆盖手改内容的勾选只对当前这一次预览有效；换目标、返回、重新预览都会清掉（D-R1）。
  function reset() {
    setPreview(null);
    setConfirmed(false);
    setOverwrite(false);
  }
  async function showPreview(target = { projectId, root, file }, force = false) {
    setResult(null);
    reset();
    const value = await run("preview", () =>
      request("/rule-templates/preview", {
        ...target,
        assetId: asset.id,
        versionId: v.id,
        overwriteDrift: force,
        revision: state.revision,
      }),
    );
    if (value) setPreview(value);
  }
  async function showRevert(id) {
    setResult(null);
    reset();
    const value = await run("preview", () =>
      request("/rule-templates/revert-preview", {
        id,
        revision: state.revision,
      }),
    );
    if (value) setPreview(value);
  }
  async function apply() {
    const token = preview.token;
    setBusy("apply");
    setError("");
    // 发请求前先登记：若响应还没回来就刷新或关闭，重开后仍只能先核对（D-R2）
    setUnconfirmed(token);
    try {
      const value = await request("/rule-templates/apply", {
        token,
        revision: preview.revision,
      });
      reset();
      setResult(value);
      if (value.completedAt) setUnconfirmed("");
      else setUnconfirmed(token);
      if (value.status === "matches_after") {
        flyDataOnce(`rule-install:${value.id||token}`);
        notify(value.kind === "restore" ? "已撤回并回读核对" : "规则已写入并回读核对");
      }
    } catch (e) {
      setError(e.message || "写入失败");
      // 服务端明确“未开始”才解除；其余情况写入可能已经开始，保留操作 ID，只允许核对。
      if (e.operationNotStarted) {
        setUnconfirmed("");
        reset();
      }
    } finally {
      setBusy("");
      refresh();
    }
  }
  async function check(id) {
    const isPendingWrite = unconfirmed === id;
    const value = await run("check", () =>
      request("/rule-templates/check", { id }),
    );
    if (value) {
      setResult(value);
      if (isPendingWrite && value.status === "matches_after")
        flyDataOnce(`rule-install:${id}`);
      if (value.completedAt || value.status !== "unknown") setUnconfirmed("");
      refresh();
    }
  }

  return (
    <section className="config-panel rule-install" aria-label="装入项目">
      <ReadReveal pending={busy === "preview"} ready={!!preview && !error} target={() => previewRef.current} />
      <div className="config-heading">
        <h3>装入项目</h3>
        <Badge tone="muted">只维护托管区块</Badge>
      </div>
      <p>
        写入项目根目录的 AGENTS.md 或 CLAUDE.md，文件里只有标记之间的内容由工作台维护，其余内容不改动。每次写入前先预览。
      </p>
      {projects.length === 0 ? (
        <p className="rule-empty">还没有发现本机项目，先到“项目”页扫描。</p>
      ) : (
        <form
          className="rule-target"
          onSubmit={(e) => {
            e.preventDefault();
            showPreview();
          }}
        >
          <label>
            项目
            <select
              aria-label="项目"
              value={projectId}
              disabled={locked}
              onChange={(e) => {
                const next = projects.find((p) => p.id === e.target.value);
                setProjectId(e.target.value);
                setRoot(next?.localPaths[0] || "");
                reset();
              }}
            >
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </label>
          {project?.localPaths.length > 1 && (
            <label>
              本地目录
              <select
                aria-label="本地目录"
                value={root}
                disabled={locked}
                onChange={(e) => {
                  setRoot(e.target.value);
                  reset();
                }}
              >
                {project.localPaths.map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </select>
            </label>
          )}
          <label>
            文件
            <select
              aria-label="文件"
              value={file}
              disabled={locked}
              onChange={(e) => {
                setFile(e.target.value);
                reset();
              }}
            >
              {FILES.map((f) => (
                <option key={f} value={f}>
                  {f}
                </option>
              ))}
            </select>
          </label>
          <Button secondary type="submit" disabled={locked || !root}>
            <FolderOpen size={16} />
            {busy === "preview" ? <Reading mini label="读取装入预览"/> : `预览装入 v${asset.versions.length}.0`}
          </Button>
        </form>
      )}
      {error && (
        <p className="inline-error" role="alert">
          {error}
        </p>
      )}
      {preview && (
        <section
          ref={previewRef}
          tabIndex={-1}
          className="config-block"
          aria-label="装入预览"
        >
          <div className="config-heading">
            <h4>
              {
                {
                  create: "将新建文件",
                  append: "追加到文件末尾",
                  upgrade: `升级：${versionOf(preview.previous?.versionId)} → ${versionOf(preview.versionId)}`,
                  same: "已是这个版本",
                  drift: "区块内容被手动改过",
                  restore: "撤回本次写入",
                }[preview.action]
              }
            </h4>
            <Badge tone="muted">{preview.token ? "尚未写入" : "无需写入"}</Badge>
          </div>
          <strong>{nameOf(preview.projectId)}</strong>
          <code>{preview.path}</code>
          {preview.action === "same" && (
            <p>这个文件里的托管区块已是 {versionOf(preview.versionId)}，内容未被改动，不需要写入。</p>
          )}
          {preview.action === "restore" && (
            <p>文件将恢复到本次写入前的字节；之后如果文件被改过，写入会被拒绝。</p>
          )}
          {preview.action === "create" && (
            <p>项目里还没有这个文件。确认后新建，文件只包含托管区块。</p>
          )}
          {["append", "upgrade"].includes(preview.action) && (
            <p>区块外的 {preview.outsideBytes} 字节保持不变。</p>
          )}
          {preview.action === "drift" && (
            <p className="inline-error" role="status">
              文件里的区块和装入时不一致，有人或 Agent 改过它。默认不覆盖；如果这些改动不需要保留，可以勾选下面的选项后重新预览。旧内容会留在恢复记录里，可以撤回。
            </p>
          )}
          {["create", "append", "upgrade", "drift"].includes(preview.action) && (
            <TextDifference before={preview.blockBefore} after={preview.blockAfter} />
          )}
          {preview.action === "drift" && (
            <>
              <label className="config-confirm">
                <input
                  type="checkbox"
                  checked={overwrite}
                  disabled={locked}
                  onChange={(e) => setOverwrite(e.target.checked)}
                />
                <span>覆盖区块内的改动</span>
              </label>
              <Button
                secondary
                disabled={locked || !overwrite}
                onClick={() =>
                  showPreview(
                    { projectId: preview.projectId, root: preview.root, file: preview.file },
                    true,
                  )
                }
              >
                重新预览
              </Button>
            </>
          )}
          {preview.token && (
            <>
              <p className="detail-footnote">
                预览有效至 {when(preview.expiresAt)}。请勿同时在其他应用编辑此文件。
              </p>
              <label className="config-confirm">
                <input
                  type="checkbox"
                  checked={confirmed}
                  disabled={locked}
                  onChange={(e) => setConfirmed(e.target.checked)}
                />
                <span>
                  {preview.action === "restore"
                    ? "确认撤回此文件的本次写入"
                    : "确认写入此项目文件"}
                </span>
              </label>
            </>
          )}
          <div className="heading-actions">
            <Button secondary disabled={!!busy} onClick={reset}>
              返回
            </Button>
            {preview.token && (
              <Button disabled={locked || !confirmed} onClick={apply}>
                {busy === "apply"
                  ? "正在写入并核对…"
                  : preview.action === "restore"
                    ? "确认撤回"
                    : "确认写入"}
              </Button>
            )}
          </div>
        </section>
      )}
      {(result || (unconfirmed && busy !== "apply")) && (
        <section
          ref={resultRef}
          tabIndex={-1}
          className="config-block"
          aria-label="写入结果"
        >
          <div className="config-heading">
            <h4>{result ? STATUS[result.status] || "待核对" : "结果未知，请核对"}</h4>
            <Badge tone="muted">Agent 是否读到新规则未验证</Badge>
          </div>
          {result?.path && <code>{result.path}</code>}
          {result?.message && <p>{result.message}</p>}
          {result?.notice && (
            <p className="inline-error" role="status">
              {result.notice}
            </p>
          )}
          {unconfirmed && (
            <Button secondary disabled={!!busy} onClick={() => check(unconfirmed)}>
              {busy === "check" ? "正在核对…" : "核对写入结果"}
            </Button>
          )}
        </section>
      )}
      <div className="rule-installed">
        <ReadReveal pending={loading} ready={!loadError}/>
        <h4>已装入 · {loadError || loading ? "…" : mine.length}</h4>
        {loading ? (
          <p className="rule-empty" role="status"><Reading label="正在读取装入记录"/></p>
        ) : loadError ? (
          <div className="inline-error rule-load-error" role="alert">
            <span>装入记录读取失败：{loadError}。升级提示暂不可用，这不代表没有装入。</span>
            <Button secondary disabled={!!busy} onClick={refresh}>
              重新读取装入记录
            </Button>
          </div>
        ) : mine.length === 0 ? (
          <p className="rule-empty">还没有装入任何项目。</p>
        ) : (
          <ul>
            {mine.map((i) => (
              <li key={`${i.projectId}:${i.root}:${i.file}`}>
                <span className="rule-installed-main">
                  <strong>{nameOf(i.projectId)}</strong>
                  <small>
                    {i.file} · {i.versionId ? versionOf(i.versionId) : "尚无已完成的写入"}
                    {i.drift ? " · 曾覆盖手改内容" : ""}
                    {i.completedAt ? ` · ${when(i.completedAt)}` : ""}
                    {i.pending ? ` · ${versionOf(i.pending.versionId)} 的写入未确认完成` : ""}
                  </small>
                </span>
                {i.versionId && i.versionId !== v.id && <Badge>可升级</Badge>}
                <span className="rule-installed-actions">
                  {i.versionId && i.versionId !== v.id && (
                    <Button
                      secondary
                      disabled={locked}
                      onClick={() => {
                        setProjectId(i.projectId);
                        setRoot(i.root);
                        setFile(i.file);
                        showPreview({ projectId: i.projectId, root: i.root, file: i.file }, false);
                      }}
                    >
                      预览升级
                    </Button>
                  )}
                  {i.id && i.kind === "apply" && i.action !== "create" && (
                    <Button secondary disabled={locked} onClick={() => showRevert(i.id)}>
                      撤回这次写入
                    </Button>
                  )}
                  <Button secondary disabled={locked} onClick={() => check(i.pending?.id || i.id)}>
                    核对
                  </Button>
                </span>
              </li>
            ))}
          </ul>
        )}
        {mine.some((i) => i.action === "create" && i.kind === "apply") && (
          <p className="detail-footnote">新建的文件不提供撤回；如需撤回请手动删除该文件。</p>
        )}
      </div>
    </section>
  );
}

// 项目详情里的“已装入的规则模板”：只读汇总，版本名取自对应规则资产（D-R7）。
export function ProjectRules({ project, state, installs, refresh }) {
  const loadError = installs?.error || "";
  const loading = !loadError && !installs?.loaded;
  const rows = (installs?.items || []).filter((i) => i.projectId === project.id);
  const assetOf = (id) => state.assets.find((a) => a.id === id);
  return (
    <section className="config-panel rule-install project-rules" aria-label="已装入的规则模板">
      <div className="config-heading">
        <h3>规则模板</h3>
        <Badge tone="muted">只读 · 来自本机写入记录</Badge>
      </div>
      <ReadReveal pending={loading} ready={!loadError}/>
      {loading ? (
        <p className="rule-empty" role="status"><Reading label="正在读取装入记录"/></p>
      ) : loadError ? (
        <div className="inline-error rule-load-error" role="alert">
          <span>装入记录读取失败：{loadError}。这不代表项目没有装入规则。</span>
          {refresh && (
            <Button secondary onClick={refresh}>
              重新读取装入记录
            </Button>
          )}
        </div>
      ) : rows.length === 0 ? (
        <p className="rule-empty">这个项目还没有通过工作台装入规则模板。</p>
      ) : (
        <ul className="rule-installed">
          {rows.map((i) => {
            const asset = assetOf(i.assetId || i.pending?.assetId);
            const latest = asset && current(asset).id;
            return (
              <li key={`${i.root}:${i.file}`}>
                <span className="rule-installed-main">
                  <strong>{asset ? current(asset).title : "已删除的规则"}</strong>
                  <small>
                    {i.file} · {i.versionId ? versionLabel(asset, i.versionId) : "尚无已完成的写入"}
                    {i.completedAt ? ` · ${when(i.completedAt)}` : ""}
                    {i.pending ? ` · ${versionLabel(asset, i.pending.versionId)} 的写入未确认完成` : ""}
                  </small>
                </span>
                {i.versionId && latest && i.versionId !== latest && <Badge>可升级</Badge>}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
