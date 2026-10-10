import React, { useEffect, useRef, useState } from "react";
import { Button, Badge } from "./components.jsx";
import { request } from "./api.js";
import "./agent-config.css";

const valueLabel = (value) =>
  value === null ? "未设置" : value ? "开启" : "关闭";
const date = (value) => new Date(value).toLocaleString("zh-CN");
const statusLabel = {
  matches_after: "符合修改后内容",
  matches_before: "符合修改前内容",
  changed: "文件已有变动",
  unknown: "无法核验",
};

export function AgentConfig({ target, revision, adoptState }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="agent-config">
      <Button secondary aria-expanded={open} onClick={() => setOpen(!open)}>
        {open ? "收起配置" : "配置管理"}
      </Button>
      {open && (
        <ConfigPanel
          key={JSON.stringify([
            target.id,
            target.bindingId,
            target.home,
            target.program,
          ])}
          target={target}
          revision={revision}
          adoptState={adoptState}
        />
      )}
    </div>
  );
}

function ConfigPanel({ target, revision, adoptState }) {
  const pendingKey = `guiji:agent-config-pending:${target.id}`;
  const [gate,setGate]=useState(null);
  useEffect(()=>{let live=true;request('/capabilities/settings/status',undefined,'GET',false).then(v=>live&&setGate(v.enabled.agent)).catch(()=>live&&setGate(false));return()=>{live=false;};},[]);
  const [view, setView] = useState(null),
    [draft, setDraft] = useState({});
  const [preview, setPreview] = useState(null),
    [confirmed, setConfirmed] = useState(false),
    [expired, setExpired] = useState(false);
  const [busy, setBusy] = useState(""),
    [error, setError] = useState(""),
    [result, setResult] = useState(null),
    [pending, setPending] = useState(() => {
      try {
        const value = sessionStorage.getItem(pendingKey);
        return /^[0-9a-f-]{36}$/.test(value || "") ? value : null;
      } catch {
        return null;
      }
    });
  const [history, setHistory] = useState(null),
    [historyError, setHistoryError] = useState(""),
    [limit, setLimit] = useState(20);
  const sequence = useRef(0),
    pendingRef = useRef(pending),
    lock = useRef(false),
    previewRef = useRef(null),
    resultRef = useRef(null);
  useEffect(
    () => () => {
      sequence.current++;
      lock.current = false;
    },
    [],
  );
  useEffect(() => {
    if (!preview) return;
    setExpired(Date.parse(preview.expiresAt) <= Date.now());
    const timeout = setTimeout(
      () => setExpired(true),
      Math.max(0, Date.parse(preview.expiresAt) - Date.now()),
    );
    previewRef.current?.focus({ preventScroll: true });
    previewRef.current?.scrollIntoView({ block: "start", behavior: "instant" });
    return () => clearTimeout(timeout);
  }, [preview?.token]);
  useEffect(() => {
    if (result) {
      resultRef.current?.focus({ preventScroll: true });
      resultRef.current?.scrollIntoView({
        block: "start",
        behavior: "instant",
      });
    }
  }, [result]);
  const stale = view && (view.invalid || view.revision !== revision);
  const previewStale = preview && (preview.revision !== revision || expired);
  const supported =
    ["codex", "hermes"].includes(target.agentId) &&
    target.program.kind === "CLI";
  function trackPending(id) {
    if (id) sessionStorage.setItem(pendingKey, id);
    else sessionStorage.removeItem(pendingKey);
    pendingRef.current = id;
    setPending(id);
  }
  async function run(action, data, onSuccess) {
    if (
      lock.current ||
      (pendingRef.current &&
        ["inspect", "preview", "restore-preview", "apply"].includes(action))
    )
      return;
    lock.current = true;
    const ticket = ++sequence.current;
    setBusy(action);
    setError("");
    if (action === "history") setHistoryError("");
    try {
      if (action === "apply") {
        try {
          trackPending(data.token);
        } catch {
          throw Object.assign(
            new Error("无法保留操作标识，未启动写入；请检查浏览器存储。"),
            { operationNotStarted: true },
          );
        }
      }
      const value = await request("/agent-config/" + action, data,'POST',false);
      if (action === "inspect") {
        const latest = await request("/workspace");
        if (ticket !== sequence.current) return;
        adoptState(latest);
        if (latest.revision !== value.revision)
          throw new Error("读取期间主库已变化，请重新读取配置。");
      }
      if (ticket !== sequence.current) return;
      onSuccess(value);
    } catch (e) {
      if (ticket === sequence.current) {
        if (action === "apply" && e.operationNotStarted === true) {
          try {
            trackPending(null);
          } catch {
            /* Keep the pending lock if browser storage cannot clear it. */
          }
          setPreview(null);
          setView((previous) =>
            previous ? { ...previous, invalid: true } : null,
          );
        }
        if (action === "history") setHistoryError(e.message);
        else setError(e.message);
      }
    } finally {
      if (ticket === sequence.current) {
        setBusy("");
        lock.current = false;
      }
    }
  }
  function showPreview(value) {
    setPreview(value);
    setConfirmed(false);
    setResult(null);
  }
  function showResult(value) {
    setResult(value);
    if (pendingRef.current === value.id && value.status !== "unknown")
      trackPending(null);
    setPreview(null);
    setView(null);
    setHistory(null);
  }
  function inspect() {
    setView((previous) => (previous ? { ...previous, invalid: true } : null));
    run("inspect", { targetId: target.id }, (value) => {
      setView(value);
      setDraft(
        Object.fromEntries(
          value.fields.map((f) => [
            f.key,
            f.value === null ? "" : String(f.value),
          ]),
        ),
      );
      setPreview(null);
      setResult(null);
      setConfirmed(false);
    });
  }
  return (
    <section
      className="config-panel"
      aria-label={`${target.label} 的配置`}
      aria-busy={!!busy}
    >
      <div className="config-heading">
        <h4>终端显示</h4>
        <Badge tone="muted">仅限本机 · Home 层</Badge>
      </div>
      {!supported ? (
        <p className="detail-footnote">此程序入口暂不支持配置管理。</p>
      ) : (
        <>
          <div className="heading-actions">
            <Button secondary disabled={!!busy || !!pending} onClick={inspect}>
              {busy === "inspect"
                ? "读取中…"
                : view
                  ? "重新读取配置"
                  : "读取配置"}
            </Button>
            <Button
              secondary
              disabled={!!busy}
              onClick={() =>
                run("history", { targetId: target.id }, (value) => {
                  setHistory(value.items);
                  setLimit(20);
                })
              }
            >
              {busy === "history" ? "读取记录中…" : "变更记录"}
            </Button>
          </div>
          <p className="detail-footnote">
            仅编辑下列显示选项；项目、Profile 或启动参数可能覆盖此文件。
          </p>
          {error && (
            <p role="alert" className="inline-error">
              {error}
            </p>
          )}
          {pending && (
            <div className="config-block" role="status">
              <p>本次结果待核对，不会自动再次写入。</p>
              <code>{pending}</code>
              <Button
                secondary
                disabled={!!busy}
                onClick={() => run("check", { id: pending }, showResult)}
              >
                核对本次操作
              </Button>
            </div>
          )}
          {view && !preview && (
            <>
              <div className="config-source">
                <code>{view.path}</code>
                <small>读取于 {date(view.at)} · 运行采用未验证</small>
              </div>
              {stale && (
                <p className="inline-error" role="status">
                  上次读数已失效，请重新读取配置。
                </p>
              )}
              {view.fields.map((field) => (
                <form
                  className="config-field"
                  key={field.key}
                  onSubmit={(event) => {
                    event.preventDefault();
                    run(
                      "preview",
                      {
                        targetId: target.id,
                        key: field.key,
                        value: draft[field.key] === "true",
                        revision: view.revision,
                      },
                      showPreview,
                    );
                  }}
                >
                  <label>
                    <span>{field.label}</span>
                    <code>{field.key}</code>
                    <select
                      aria-label={field.label}
                      value={draft[field.key]}
                      disabled={
                        !!busy ||
                        !!pending ||
                        !!stale ||
                        field.status === "unsupported"
                      }
                      onChange={(e) =>
                        setDraft({ ...draft, [field.key]: e.target.value })
                      }
                    >
                      <option value="" disabled>
                        {field.status === "unsupported"
                          ? "格式不支持"
                          : "未设置"}
                      </option>
                      <option value="true">开启</option>
                      <option value="false">关闭</option>
                    </select>
                  </label>
                  <Button
                    secondary
                    aria-label={`预览 ${field.label}`}
                    disabled={
                      !!busy ||
                      !!pending ||
                      !!stale ||
                      field.status === "unsupported" ||
                      draft[field.key] === "" ||
                      draft[field.key] === String(field.value)
                    }
                  >
                    预览修改
                  </Button>
                </form>
              ))}
            </>
          )}
          {preview && (
            <section
              ref={previewRef}
              tabIndex={-1}
              className="config-block"
              aria-label="配置差异"
            >
              <div className="config-heading">
                <h4>{preview.kind === "restore" ? "恢复差异" : "修改差异"}</h4>
                <Badge tone="muted">
                  {pending ? "写入结果待核对" : "尚未写入"}
                </Badge>
              </div>
              <strong>{preview.label}</strong>
              <code>{preview.path}</code>
              <code>{preview.key}</code>
              <div className="config-diff">
                <span>
                  <small>当前</small>
                  {valueLabel(preview.beforeValue)}
                </span>
                <span aria-hidden="true">→</span>
                <span>
                  <small>
                    {preview.kind === "restore" ? "恢复为" : "修改为"}
                  </small>
                  {valueLabel(preview.afterValue)}
                </span>
              </div>
              <p className="detail-footnote">
                预览有效至 {date(preview.expiresAt)}
                。请勿同时在其他应用编辑此文件。
              </p>
              {gate!==true&&<p role="status">Agent 配置写入默认关闭或授权尚未核验；请在设置开启后重新打开。</p>}
              {previewStale && (
                <p className="inline-error" role="status">
                  预览已失效，请返回后重新读取并预览。
                </p>
              )}
              <label className="config-confirm">
                <input
                  type="checkbox"
                  checked={confirmed}
                  disabled={!!busy || !!pending || !!previewStale}
                  onChange={(e) => setConfirmed(e.target.checked)}
                />
                <span>确认修改此文件；不会自动重启 Agent</span>
              </label>
              <div className="heading-actions">
                <Button
                  secondary
                  disabled={!!busy}
                  onClick={() => {
                    setPreview(null);
                    setConfirmed(false);
                  }}
                >
                  返回配置
                </Button>
                <Button
                  disabled={!!busy || !confirmed || !!pending || !!previewStale || gate!==true}
                  onClick={() =>
                    run(
                      "apply",
                      { token: preview.token, revision: preview.revision },
                      showResult,
                    )
                  }
                >
                  {busy === "apply"
                    ? "正在写入并核对…"
                    : preview.kind === "restore"
                      ? "确认恢复"
                      : "确认应用"}
                </Button>
              </div>
            </section>
          )}
          {result && (
            <section
              ref={resultRef}
              tabIndex={-1}
              className="config-block"
              aria-label="配置操作结果"
            >
              <div className="config-heading">
                <h4>
                  {result.kind === "restore" &&
                  result.status === "matches_after"
                    ? "符合恢复后内容"
                    : statusLabel[result.status] || "待核对"}
                </h4>
                <Badge tone="muted">采用未验证</Badge>
              </div>
              {result.path && <code>{result.path}</code>}
              <code>{result.key}</code>
              {["matches_before", "matches_after"].includes(result.status) && (
                <p>
                  当前值：
                  {valueLabel(
                    result.status === "matches_after"
                      ? result.afterValue
                      : result.beforeValue,
                  )}
                </p>
              )}
              <p role="status">
                {result.kind === "restore" && result.status === "matches_after"
                  ? "当前文件符合恢复后内容；运行采用未验证"
                  : result.message}
              </p>
              {result.notice && <p className="inline-error">{result.notice}</p>}
              <small>核对于 {date(result.checkedAt)}</small>
              <Button
                secondary
                disabled={!!busy}
                onClick={() => run("check", { id: result.id }, showResult)}
              >
                再次核对文件
              </Button>
            </section>
          )}
          {historyError && (
            <p className="inline-error" role="alert">
              记录读取失败：{historyError}。已有列表可能不是最新。
            </p>
          )}
          {history && (
            <section className="config-history" aria-label="配置变更记录">
              <div className="config-heading">
                <h4>变更记录 · {history.length}</h4>
                <Badge tone="muted">本机记录</Badge>
              </div>
              {!history.length && (
                <p className="detail-footnote">尚无配置变更记录。</p>
              )}
              {history.slice(0, limit).map((row) => (
                <article
                  className="config-block"
                  key={row.id}
                  aria-label={`${row.kind === "restore" ? "恢复" : "修改"} ${row.key}`}
                >
                  <div className="config-heading">
                    <strong>{row.kind === "restore" ? "恢复" : "修改"}</strong>
                    <small>{date(row.at)}</small>
                  </div>
                  <code>{row.key}</code>
                  <p>
                    {valueLabel(row.beforeValue)} → {valueLabel(row.afterValue)}
                  </p>
                  <small>
                    {row.completedAt ? "当次写后回读完成" : "当次完成未确认"} ·
                    当前文件待核对 · 采用未验证
                  </small>
                  <div className="heading-actions">
                    <Button
                      secondary
                      disabled={!!busy}
                      onClick={() => run("check", { id: row.id }, showResult)}
                    >
                      核对文件
                    </Button>
                    {row.kind === "apply" && (
                      <Button
                        secondary
                        disabled={!!busy || !!pending}
                        onClick={() =>
                          run(
                            "restore-preview",
                            { id: row.id, revision },
                            showPreview,
                          )
                        }
                      >
                        预览恢复
                      </Button>
                    )}
                  </div>
                </article>
              ))}
              {history.length > limit && (
                <Button secondary onClick={() => setLimit(limit + 20)}>
                  显示更多记录
                </Button>
              )}
            </section>
          )}
        </>
      )}
    </section>
  );
}
