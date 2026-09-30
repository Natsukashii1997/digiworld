import React, { useEffect, useRef, useState } from "react";
import { Badge, Button } from "./components.jsx";
import { request } from "./api.js";

const labels = {
  applied: "已保存并核验",
  rolled_back: "已撤回",
  not_applied: "未发现文件 · 操作未决",
  missing: "文件已缺失",
  changed: "文件已变化",
  matching_unverified: "正文一致 · 文件归属待核对",
  unavailable: "无法核验",
  unknown: "结果未知",
};
const defaultFilename = (title) =>
  `${
    title
      .replace(/[./\\:\x00-\x1f\x7f<>?*|"#\[\]]/g, "-")
      .trim()
      .slice(0, 70) || "整理候选"
  }.md`;

export function KnowledgeWriteback({
  task,
  version,
  sources,
  scope,
  blocked,
  onBusy,
  notify,
}) {
  const [sourceId, setSourceId] = useState("");
  const [domain, setDomain] = useState("工作/个人");
  const [filename, setFilename] = useState(() =>
    defaultFilename(version.candidate.title),
  );
  const [plan, setPlan] = useState(null);
  const [confirmed, setConfirmed] = useState(false);
  const [history, setHistory] = useState(null);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState("");
  const lock = useRef(false),
    sequence = useRef(0),
    panel = useRef(null),
    activeScope = useRef(scope),
    busyCallback = useRef(onBusy);
  activeScope.current = scope;
  busyCallback.current = onBusy;
  useEffect(() => {
    sequence.current++;
    setPlan(null);
    setConfirmed(false);
    setHistory(null);
    setMessage("");
    if (lock.current) setPending(true);
  }, [scope]);
  useEffect(
    () => () => {
      sequence.current++;
      busyCallback.current(false);
    },
    [],
  );
  function reset(change) {
    change();
    setPlan(null);
    setConfirmed(false);
    setMessage("");
    setError("");
  }
  async function run(action, operationId) {
    if (lock.current || blocked || (pending && action !== "history")) return;
    if ((action === "apply" || action === "rollback") && !confirmed) return;
    lock.current = true;
    busyCallback.current(true);
    setBusy(action);
    setError("");
    setMessage("");
    const ticket = ++sequence.current,
      startedScope = scope;
    const current = () =>
      sequence.current === ticket && activeScope.current === startedScope;
    const writing = action === "apply" || action === "rollback";
    try {
      const input =
        action === "preview"
          ? {
              taskId: task.id,
              versionId: version.id,
              targetSourceId: sourceId,
              domain,
              filename,
            }
          : writing
            ? { previewId: plan.previewId, confirmed: true }
            : action === "history"
              ? { taskId: task.id }
              : { operationId };
      const result = await request(
        `/knowledge/writes/${action}`,
        input,
        "POST",
        false,
      );
      if (!current()) return;
      if (action === "history") {
        setHistory(result.items);
        setPending(false);
        setPlan(null);
        setConfirmed(false);
        setMessage("已重新核对本机保存记录");
      } else if (action === "preview" || action === "rollback-preview") {
        setPlan({
          ...result,
          action: action === "preview" ? "apply" : "rollback",
        });
        setConfirmed(false);
        requestAnimationFrame(() => {
          panel.current?.scrollIntoView({ block: "start", behavior: "auto" });
          panel.current?.focus({ preventScroll: true });
        });
      } else {
        setHistory((rows) => [
          result,
          ...(rows || []).filter((item) => item.id !== result.id),
        ]);
        setPlan(null);
        setConfirmed(false);
        const feedback =
          result.status === "rolled_back"
            ? "已撤回候选文件，恢复全文保留在本机记录"
            : "候选已保存并回读，仍为待整理";
        setMessage(feedback);
        notify(feedback);
      }
    } catch (failure) {
      if (current()) {
        setError(failure.message);
        setPlan(null);
        setConfirmed(false);
        if (
          writing &&
          (!failure.status || failure.status === 409 || failure.status >= 500)
        )
          setPending(true);
      }
    } finally {
      lock.current = false;
      busyCallback.current(false);
      setBusy("");
    }
  }
  const unavailable = blocked || !!busy;
  const disabled = unavailable || pending;
  const unresolved = history?.some((item) =>
    ["not_applied", "matching_unverified", "unavailable", "unknown"].includes(
      item.status,
    ),
  );
  const obsidian = sources.filter((source) => source.kind === "obsidian");
  return (
    <section
      className="knowledge-task-section asset-form"
      aria-label="候选保存与撤回"
    >
      <div className="knowledge-compilation-heading">
        <h3>保存到知识库</h3>
        <Badge tone="muted">待整理 · 仅本人</Badge>
      </div>
      {error && (
        <p role="alert" className="inline-error">
          {error}
        </p>
      )}
      {pending && (
        <p role="status" className="inline-error">
          操作结果待核对。请先核对保存记录，不要重复保存或撤回。
        </p>
      )}
      {message && (
        <p role="status" className="detail-footnote">
          {message}
        </p>
      )}
      <div className="heading-actions">
        <Button secondary disabled={unavailable} onClick={() => run("history")}>
          {busy === "history" ? "核对中…" : "核对保存记录"}
        </Button>
      </div>
      {history === null ? (
        <p className="detail-footnote">先核对本机记录，再预览本次保存。</p>
      ) : (
        <>
          {history.length === 0 && (
            <p className="detail-footnote">本任务尚无保存记录。</p>
          )}
          {history.map((item) => (
            <article className="knowledge-evidence" key={item.id}>
              <strong>{item.path}</strong>
              <small>{item.root}</small>
              <Badge tone="muted">{labels[item.status] || "结果未知"}</Badge>
              <small>
                {new Date(item.createdAt).toLocaleString("zh-CN")} ·{" "}
                {item.versionId === version.id
                  ? "当前候选版本"
                  : "其他候选版本"}
              </small>
              <details>
                <summary>本机恢复全文</summary>
                <textarea
                  aria-label={`恢复全文 ${item.id}`}
                  className="knowledge-packet"
                  rows={8}
                  readOnly
                  value={item.content}
                />
              </details>
              {item.canRollback && (
                <div className="heading-actions">
                  <Button
                    secondary
                    disabled={disabled}
                    onClick={() => run("rollback-preview", item.id)}
                  >
                    预览撤回
                  </Button>
                </div>
              )}
            </article>
          ))}
        </>
      )}
      {!task.archived && (
        <>
          {!obsidian.length && (
            <p className="detail-footnote">请先在知识来源中连接 Obsidian。</p>
          )}
          <label>
            保存到哪个知识库
            <select
              aria-label="保存目标知识库"
              value={sourceId}
              disabled={disabled}
              onChange={(event) => reset(() => setSourceId(event.target.value))}
            >
              <option value="">请选择 Obsidian 知识库</option>
              {obsidian.map((source) => (
                <option key={source.id} value={source.id}>
                  {source.name} · {source.root}
                </option>
              ))}
            </select>
          </label>
          <label>
            领域
            <select
              aria-label="候选领域"
              value={domain}
              disabled={disabled}
              onChange={(event) => reset(() => setDomain(event.target.value))}
            >
              {["生活", "工作/个人", "工作/团队"].map((value) => (
                <option key={value} value={value}>
                  {value}
                </option>
              ))}
            </select>
          </label>
          <label>
            文件名
            <input
              aria-label="候选文件名"
              value={filename}
              maxLength={120}
              disabled={disabled}
              onChange={(event) => reset(() => setFilename(event.target.value))}
            />
          </label>
          <p className="detail-footnote">
            仅新建到已有的「00 待整理/{domain}」目录，不覆盖文件，不启用检索。
          </p>
          {unresolved && (
            <p className="inline-error">
              存在未决记录，请先核对文件及本机记录；当前禁止新保存。
            </p>
          )}
          <div className="heading-actions">
            <Button
              secondary
              disabled={
                disabled ||
                !sourceId ||
                !filename.trim() ||
                history === null ||
                unresolved
              }
              onClick={() => run("preview")}
            >
              {busy === "preview" ? "核验并预览中…" : "预览保存"}
            </Button>
          </div>
        </>
      )}
      {plan && (
        <div
          ref={panel}
          tabIndex={-1}
          className="knowledge-task-section knowledge-write-preview"
          aria-label="确认候选文件变更"
        >
          <h3>{plan.action === "apply" ? "新建文件预览" : "撤回文件预览"}</h3>
          <p className="detail-footnote">
            {plan.root}/{plan.path}
          </p>
          <label>
            {plan.action === "apply" ? "将新增的全文" : "将撤回的全文"}
            <textarea
              aria-label="候选变更全文"
              className="knowledge-packet"
              rows={10}
              readOnly
              value={plan.content}
            />
          </label>
          <p className="detail-footnote">
            {plan.action === "apply"
              ? "原状态：文件不存在。保存后仍为待整理候选，不是正式知识。"
              : "仅移除这次新建且未修改的文件。恢复全文保留在本机操作记录，不删除原始资料。"}
          </p>
          {plan.crossSource && (
            <p className="detail-footnote">
              包含其他来源的整理内容，将复制到此知识库；仍仅限本人使用。
            </p>
          )}
          <label className="knowledge-confirm">
            <input
              type="checkbox"
              checked={confirmed}
              disabled={disabled}
              onChange={(event) => setConfirmed(event.target.checked)}
            />
            <span>
              {plan.action === "apply"
                ? "我已审阅全文、来源与位置，确认仅将这一版保存为本人待整理候选"
                : "我确认撤回这一个文件，并保留本机恢复记录"}
            </span>
          </label>
          <div className="heading-actions">
            <Button
              secondary
              disabled={unavailable}
              onClick={() => {
                setPlan(null);
                setConfirmed(false);
              }}
            >
              取消变更
            </Button>
            <Button
              disabled={disabled || !confirmed}
              onClick={() => run(plan.action)}
            >
              {busy === plan.action
                ? "处理中…"
                : plan.action === "apply"
                  ? "确认保存候选"
                  : "确认撤回候选"}
            </Button>
          </div>
        </div>
      )}
    </section>
  );
}
