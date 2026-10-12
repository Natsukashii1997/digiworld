import { flyData } from './data-flight.js';
import { Reading, ReadReveal } from './ScanMotion.jsx';
import React, { useEffect, useRef, useState } from "react";
import { RefreshCw } from "lucide-react";
import { Badge, Button } from "./components.jsx";
import { request } from "./api.js";

const date = (value) => new Date(value).toLocaleString("zh-CN");
const status = {
  unchanged: "与创建时一致",
  changed: "来源已变",
  revoked: "授权已失效",
  unavailable: "无法核验",
};
const receipt = { saved: "曾保存", withdrawn: "已撤回", pending: "结果待核对" };

export function KnowledgeImpact({ revision, scope, blocked, count, onOpen }) {
  const [report, setReport] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const sequence = useRef(0),
    lock = useRef(false);
  const identity = `${scope}:${revision}`;
  const identityRef = useRef(identity);
  identityRef.current = identity;
  useEffect(() => {
    sequence.current++;
    lock.current = false;
    setBusy(false);
    setReport(null);
    setError("");
  }, [identity]);
  useEffect(
    () => () => {
      sequence.current++;
    },
    [],
  );
  async function check(more = false) {
    if (lock.current || blocked) return;
    lock.current = true;
    const ticket = ++sequence.current,
      started = identity;
    const current = () =>
      ticket === sequence.current && started === identityRef.current;
    setBusy(true);
    setError("");
    const previous = more ? report : null;
    if (!more) setReport(null);
    try {
      const result = await request(
        "/knowledge/maintenance/impact",
        {
          offset: previous?.nextOffset || 0,
          expectedRevision: revision,
        },
        "POST",
        false,
      );
      if (current())
        setReport({
          ...result,
          items: [...(previous?.items || []), ...result.items],
        });
    } catch (failure) {
      if (current()) {
        setReport(null);
        setError(`${failure.message}。请刷新整理任务后重新检查。`);
      }
    } finally {
      if (current()) {
        lock.current = false;
        setBusy(false);
      }
    }
  }
  const affected =
    report?.items.filter((item) => item.status !== "unchanged") || [];
  return (
    <section
      id="k-maintain"
      className="knowledge-basket knowledge-impact"
      aria-label="来源变化影响"
    >
      <div className="knowledge-compilation-heading">
        <h3>来源变化</h3>
        <Button
          secondary
          disabled={blocked || busy || !count}
          onClick={() => check()}
        >
          <RefreshCw size={16} />
          {busy ? "检查中…" : "检查来源变化"}
        </Button>
      </div>
      {error && (
        <p className="inline-error" role="alert">
          {error}
        </p>
      )}
      {!report && !error && (
        <p className="detail-footnote">
          {count
            ? "检查已选资料，定位需要复核的整理结果。"
            : "创建整理任务后可检查来源变化。"}
        </p>
      )}
      {report && (
        <>
          <p role="status" className="knowledge-impact-summary">
            已检查 {report.items.length} / {report.total} 个任务 · 需复核{" "}
            {affected.length}
          </p>
          <p className="detail-footnote">
            {date(report.checkedAt)} ·
            分批读取，仅代表各次读取时的来源状态，不判断结论正误。
          </p>
          {report.items.some((item) => item.saved.status === "unavailable") && (
            <p className="inline-error" role="alert">
              {
                report.items.filter(
                  (item) => item.saved.status === "unavailable",
                ).length
              }{" "}
              个任务的保存记录无法核验，不代表没有保存。
            </p>
          )}
          {affected.map((item) => (
            <article className="knowledge-impact-card" key={item.taskId}>
              <div className="knowledge-compilation-heading">
                <strong>{item.question}</strong>
                <Badge tone="muted">
                  {status[item.status]}
                  {item.archived ? " · 已归档" : ""}
                </Badge>
              </div>
              {item.items
                .filter((source) => source.status !== "unchanged")
                .map((source) => (
                  <p className="detail-footnote" key={source.evidenceId}>
                    {source.sourceName} / {source.path} ·{" "}
                    {status[source.status]}
                  </p>
                ))}
              <details>
                <summary>
                  复核范围 · {item.candidates.length} 个候选版本
                </summary>
                {item.candidates.map((candidate, index) => (
                  <div className="knowledge-impact-version" key={candidate.id}>
                    <strong>
                      v{index + 1} · {candidate.title}
                    </strong>
                    {!!candidate.claims.length && (
                      <ul>
                        {candidate.claims.map((claim) => (
                          <li key={claim.id}>{claim.text}</li>
                        ))}
                      </ul>
                    )}
                    {!candidate.claims.length && (
                      <p className="detail-footnote">
                        未直接引用变化资料的主张；仍需复核综合结论。
                      </p>
                    )}
                    <p className="detail-footnote">
                      另有关联冲突 {candidate.conflicts.length} 条、关系{" "}
                      {candidate.relations.length} 条。
                    </p>
                    {!!candidate.conflicts.length && (
                      <ul aria-label="需复核的冲突">
                        {candidate.conflicts.map((entry, i) => (
                          <li key={i}>{entry.text}</li>
                        ))}
                      </ul>
                    )}
                    {!!candidate.relations.length && (
                      <ul aria-label="需复核的关系">
                        {candidate.relations.map((entry, i) => (
                          <li key={i}>{entry.text}</li>
                        ))}
                      </ul>
                    )}
                  </div>
                ))}
                {!item.candidates.length && (
                  <p className="detail-footnote">
                    尚无候选，重新整理前请核对来源。
                  </p>
                )}
                <h4>保存历史</h4>
                {item.saved.status === "unavailable" ? (
                  <p className="inline-error">
                    保存记录无法核验，不代表没有保存。
                  </p>
                ) : (
                  <>
                    {!item.saved.items.length && (
                      <p className="detail-footnote">
                        没有本工作台的保存记录。
                      </p>
                    )}
                    {item.saved.items.map((saved) => {
                      const version = item.candidates.findIndex(
                        (candidate) => candidate.id === saved.versionId,
                      );
                      return (
                        <p className="detail-footnote" key={saved.operationId}>
                          {version >= 0
                            ? `v${version + 1}`
                            : `历史版本 ${saved.versionId}`}{" "}
                          · {receipt[saved.receipt]} · {saved.root}/{saved.path}{" "}
                          · {date(saved.createdAt)}
                        </p>
                      );
                    })}
                  </>
                )}
                <p className="detail-footnote">
                  历史记录不代表文件当前存在或内容未变；本次不读取或修改已保存文件。
                </p>
              </details>
              <Button
                secondary
                disabled={blocked || busy}
                onClick={() => onOpen(item.taskId)}
              >
                打开任务
              </Button>
            </article>
          ))}
          {!!report.items.filter((item) => item.status === "unchanged")
            .length && (
            <details>
              <summary>
                与创建时一致 · {report.items.length - affected.length} 个任务
              </summary>
              <ul>
                {report.items
                  .filter((item) => item.status === "unchanged")
                  .map((item) => (
                    <li key={item.taskId}>
                      {item.question}
                      {item.archived ? " · 已归档" : ""}
                    </li>
                  ))}
              </ul>
            </details>
          )}
          {report.nextOffset !== null && (
            <Button
              secondary
              disabled={blocked || busy}
              onClick={() => check(true)}
            >
              继续检查
            </Button>
          )}
        </>
      )}
    </section>
  );
}

export function KnowledgeRenewal({
  task,
  revision,
  scope,
  blocked,
  adoptState,
  notify,
  onOpen,
  onBusy,
}) {
  const [preview, setPreview] = useState(null),
    [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(""),
    [pending, setPending] = useState(false),
    [error, setError] = useState("");
  const sequence = useRef(0),
    lock = useRef(false),
    creating = useRef(false),
    recovery = useRef("");
  const scopeRef = useRef(scope),
    busyCallback = useRef(onBusy),
    previewElement = useRef(null);
  scopeRef.current = scope;
  busyCallback.current = onBusy;
  useEffect(() => {
    if (creating.current) setPending(true);
    sequence.current++;
    lock.current = false;
    creating.current = false;
    busyCallback.current(false);
    setBusy("");
    setPreview(null);
    setConfirmed(false);
  }, [scope]);
  useEffect(
    () => () => {
      sequence.current++;
      busyCallback.current(false);
    },
    [],
  );
  useEffect(() => {
    if (preview) previewElement.current?.focus();
  }, [preview]);
  async function run(mode) {
    if (lock.current || blocked || (pending && mode !== "refresh")) return;
    if (mode === "create" && (!preview || !confirmed)) return;
    lock.current = true;
    busyCallback.current(true);
    const ticket = ++sequence.current,
      started = scope;
    const current = () =>
      ticket === sequence.current && started === scopeRef.current;
    setBusy(mode);
    setError("");
    try {
      if (mode === "refresh" || mode === "preview") {
        const result = await request(
          "/knowledge/maintenance/recover",
          { taskId: task.id },
          "POST",
          false,
        );
        if (!current()) return;
        const next = result.state;
        if (result.pending) {
          setPending(true);
          setError("原创建请求仍在处理，请稍后再次核对。");
          return;
        }
        if (mode === "preview") {
          setPreview(null);
          setConfirmed(false);
          if (next.revision !== revision) {
            adoptState(next);
            setError("整理记录已更新，请核对关联任务后再次预览。");
            return;
          }
          const prepared = await request(
            "/knowledge/maintenance/preview",
            { taskId: task.id },
            "POST",
            false,
          );
          if (current()) setPreview(prepared);
          return;
        }
        const found = next.knowledgeTasks?.find(
          (item) => item.id === (recovery.current || result.latestTaskId),
        );
        setPending(false);
        setPreview(null);
        setConfirmed(false);
        creating.current = false;
        adoptState(next);
        if (found) {
          onOpen(found.id);
          notify(recovery.current ? "已找回新整理任务" : "已读取关联整理任务");
        } else {
          recovery.current = "";
          setError("未找到新任务，请重新预览后再创建。");
        }
      } else {
        creating.current = true;
        recovery.current = preview.taskId;
        const result = await request(
          "/knowledge/maintenance/create",
          { previewId: preview.previewId, confirmed: true },
          "POST",
          false,
        );
        if (!current()) return;
        creating.current = false;
        setPreview(null);
        setConfirmed(false);
        adoptState(result.state);
        onOpen(result.taskId);
        flyData();
        notify("新整理任务已创建，旧记录保留；尚未启动 Codex");
      }
    } catch (failure) {
      if (!current()) return;
      setError(failure.message);
      if (mode === "preview" && failure.status === 409) setPending(true);
      if (mode === "create") {
        setPreview(null);
        setConfirmed(false);
        if (!failure.status || failure.status === 409 || failure.status >= 500)
          setPending(true);
      }
    } finally {
      if (current()) {
        lock.current = false;
        creating.current = false;
        setBusy("");
        busyCallback.current(false);
      }
    }
  }
  const disabled = blocked || !!busy || pending;
  return (
    <section className="knowledge-task-section" aria-label="重新整理">
      <ReadReveal pending={busy==="preview"} ready={!!preview&&!error}/>
      <div className="knowledge-compilation-heading">
        <h3>重新整理</h3>
        <Button secondary disabled={disabled} onClick={() => run("preview")}>
          {busy === "preview" ? <Reading mini label="读取整理预览"/> : "预览重新整理"}
        </Button>
      </div>
      <p className="detail-footnote">
        读取相同路径的当前资料版本，只创建关联新任务，不覆盖旧候选或已保存文件。
      </p>
      {error && (
        <p className="inline-error" role="alert">
          {error}
        </p>
      )}
      {pending && (
        <>
          <p className="inline-error" role="status">
            创建结果待核对。请先刷新确认，不要重复提交。
          </p>
          <Button
            secondary
            disabled={blocked || !!busy}
            onClick={() => run("refresh")}
          >
            {busy === "refresh" ? "刷新中…" : "刷新确认新任务"}
          </Button>
        </>
      )}
      {preview && (
        <div
          className="knowledge-renewal-preview"
          ref={previewElement}
          tabIndex={-1}
          aria-label="当前资料预览"
        >
          <h4>当前资料 · {preview.documents.length} 份</h4>
          <p className="detail-footnote">
            预览有效至 {date(preview.expiresAt)}
          </p>
          {preview.documents.map((document, index) => (
            <div
              className="knowledge-evidence"
              key={`${document.root}:${document.path}`}
            >
              <strong>
                {document.sourceName} / {document.path}
              </strong>
              <Badge tone="muted">
                {document.sha256 === document.oldSha256
                  ? "内容未变"
                  : "内容已更新"}
              </Badge>
              <details>
                <summary>对比版本标识</summary>
                <code>原 SHA-256 · {document.oldSha256}</code>
                <code>现 SHA-256 · {document.sha256}</code>
              </details>
              <label className="knowledge-version-label">
                当前原文
                <textarea
                  className="knowledge-packet"
                  aria-label={`当前原文 ${index + 1}`}
                  value={document.content}
                  readOnly
                  rows={8}
                />
              </label>
            </div>
          ))}
          <label className="knowledge-confirm">
            <input
              type="checkbox"
              checked={confirmed}
              disabled={disabled}
              onChange={(event) => setConfirmed(event.target.checked)}
            />
            <span>我已核对当前资料，确认新建任务并保留旧历史</span>
          </label>
          <div className="heading-actions">
            <Button
              disabled={disabled || !confirmed}
              onClick={() => run("create")}
            >
              {busy === "create" ? "创建中…" : "创建新整理任务"}
            </Button>
            <Button
              secondary
              disabled={disabled}
              onClick={() => {
                setPreview(null);
                setConfirmed(false);
              }}
            >
              取消预览
            </Button>
          </div>
        </div>
      )}
    </section>
  );
}
