import React, { useEffect, useRef, useState } from "react";
import { Archive, Copy, FileText, RefreshCw, Upload, X } from "lucide-react";
import { Badge, Button, Dialog, Steps } from "./components.jsx";
import { request } from "./api.js";
import { KnowledgeWriteback } from "./KnowledgeWriteback.jsx";
import { KnowledgeImpact, KnowledgeRenewal } from "./KnowledgeMaintenance.jsx";
import "./knowledge-compilation.css";

const date = (value) => new Date(value).toLocaleString("zh-CN");
const taskStatus = (task) =>
  task.archived ? "已归档" : task.candidates.length ? "候选待审" : "待整理";

export function KnowledgeCompilation({
  state,
  adoptState,
  notify,
  selections,
  setSelections,
  blocked,
  epoch,
}) {
  const sources = state.connections?.knowledgeSources || [];
  const scope = JSON.stringify([
    epoch,
    blocked,
    sources.map(({ id, root, identity, generation }) => [
      id,
      root,
      identity,
      generation,
    ]),
  ]);
  const scopeRef = useRef(scope);
  scopeRef.current = scope;
  const [question, setQuestion] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const [archived, setArchived] = useState(false);
  const [openedId, setOpenedId] = useState("");
  const [refreshEpoch, setRefreshEpoch] = useState(0);
  const lock = useRef(false),
    sequence = useRef(0),
    creation = useRef(null);
  const tasks = state.knowledgeTasks || [];
  const task = tasks.find((entry) => entry.id === openedId);
  useEffect(() => {
    if (lock.current) setPending(true);
    sequence.current++;
    lock.current = false;
    setBusy("");
  }, [scope]);
  useEffect(
    () => () => {
      sequence.current++;
    },
    [],
  );
  const draftKey = JSON.stringify([question.trim(), selections]);
  function clearDraft() {
    setQuestion("");
    setConfirmed(false);
    setSelections([]);
    creation.current = null;
  }
  async function run(mode) {
    if (lock.current || blocked || (pending && mode !== "refresh")) return;
    lock.current = true;
    const ticket = ++sequence.current,
      startedScope = scope;
    const current = () =>
      ticket === sequence.current && startedScope === scopeRef.current;
    setBusy(mode);
    setError("");
    try {
      if (mode === "refresh") {
        const next = await request("/workspace", undefined, "GET", false);
        if (!current()) return;
        const recovered = next.knowledgeTasks?.find(
          (entry) => entry.requestId === creation.current?.requestId,
        );
        adoptState(next);
        setPending(false);
        setRefreshEpoch((value) => value + 1);
        if (recovered) {
          clearDraft();
          setOpenedId(recovered.id);
          setArchived(recovered.archived);
        }
        notify("整理任务已刷新，请核对列表");
      } else {
        if (!confirmed || !question.trim() || !selections.length) return;
        if (creation.current?.key !== draftKey)
          creation.current = { key: draftKey, requestId: crypto.randomUUID() };
        const result = await request(
          "/knowledge/tasks/create",
          {
            question: question.trim(),
            selections,
            confirmed: true,
            requestId: creation.current.requestId,
            expectedRevision: state.revision,
          },
          "POST",
          false,
        );
        if (!current()) return;
        adoptState(result.state);
        clearDraft();
        setOpenedId(result.taskId);
        setArchived(false);
        notify("整理任务已创建，尚未交给 Codex");
      }
    } catch (failure) {
      if (!current()) return;
      setError(failure.message);
      if (
        mode === "create" &&
        (!failure.status || failure.status === 409 || failure.status >= 500)
      )
        setPending(true);
    } finally {
      if (current()) {
        lock.current = false;
        setBusy("");
      }
    }
  }
  const disabled = blocked || !!busy || pending;
  return (
    <section className="knowledge-compilation" aria-label="知识整理">
      <header className="knowledge-compilation-heading">
        <h2>整理</h2>
        <span>仅限本人 Codex</span>
      </header>
      <div className="knowledge-basket">
        <div className="knowledge-compilation-heading">
          <strong>已选择 {selections.length} / 5 份资料</strong>
          {!!selections.length && (
            <Button
              secondary
              disabled={disabled}
              onClick={() => setSelections([])}
            >
              清空选择
            </Button>
          )}
        </div>
        {!selections.length && (
          <p className="detail-footnote">查看原文后，点击「加入整理」。</p>
        )}
        {selections.map((item) => (
          <div
            className="knowledge-selection"
            key={`${item.sourceId}:${item.path}`}
          >
            <span>
              <strong>{item.path}</strong>
              <small>
                {sources.find((source) => source.id === item.sourceId)?.name ||
                  "来源已断开"}
              </small>
            </span>
            <Button
              secondary
              disabled={disabled}
              aria-label={`移除资料：${item.path}`}
              onClick={() =>
                setSelections((current) =>
                  current.filter((entry) => entry !== item),
                )
              }
            >
              <X size={16} />
            </Button>
          </div>
        ))}
        <form
          className="asset-form knowledge-creation"
          onSubmit={(event) => {
            event.preventDefault();
            run("create");
          }}
        >
          <label>
            整理问题
            <textarea
              aria-label="整理问题"
              value={question}
              onChange={(event) => setQuestion(event.target.value)}
              maxLength={500}
              required
              disabled={disabled}
              placeholder="这些资料需要共同回答什么问题？"
            />
          </label>
          <label className="knowledge-confirm">
            <input
              type="checkbox"
              checked={confirmed}
              disabled={disabled}
              onChange={(event) => setConfirmed(event.target.checked)}
            />
            <span>我确认仅交给本人 Codex，任务与候选保存在工作台</span>
          </label>
          {error && (
            <p className="inline-error" role="alert">
              {error}
            </p>
          )}
          {pending && (
            <p className="inline-error" role="status">
              操作结果待核对，请先刷新整理任务。当前问题和资料已保留。
            </p>
          )}
          <div className="heading-actions">
            <Button
              disabled={
                disabled || !confirmed || !question.trim() || !selections.length
              }
              type="submit"
            >
              {busy === "create" ? "创建中…" : "创建整理任务"}
            </Button>
          </div>
        </form>
      </div>
      <KnowledgeImpact
        revision={state.revision}
        scope={`${scope}:${refreshEpoch}`}
        blocked={blocked || !!busy}
        count={tasks.length}
        onOpen={setOpenedId}
      />
      <div className="knowledge-compilation-heading">
        <div className="heading-actions" role="group" aria-label="整理任务状态">
          <Button
            secondary={archived}
            aria-pressed={!archived}
            onClick={() => setArchived(false)}
          >
            进行中
          </Button>
          <Button
            secondary={!archived}
            aria-pressed={archived}
            onClick={() => setArchived(true)}
          >
            已归档
          </Button>
        </div>
        <Button
          secondary
          disabled={blocked || !!busy}
          onClick={() => run("refresh")}
        >
          <RefreshCw size={16} />
          {busy === "refresh" ? "刷新中…" : "刷新整理任务"}
        </Button>
      </div>
      <div className="knowledge-task-list">
        {!tasks.some((entry) => entry.archived === archived) && (
          <p className="knowledge-empty">
            {archived ? "暂无已归档任务" : "暂无进行中的整理任务"}
          </p>
        )}
        {tasks
          .filter((entry) => entry.archived === archived)
          .slice()
          .reverse()
          .map((entry) => (
            <button
              className="knowledge-task-card"
              key={entry.id}
              aria-label={`打开整理任务：${entry.question}${entry.basedOn ? ` · 重新整理 ${entry.id.slice(0, 8)}` : ""}`}
              onClick={() => setOpenedId(entry.id)}
            >
              <FileText size={18} />
              <span>
                <strong>{entry.question}</strong>
                <small>
                  {entry.evidence.length} 份资料 · {date(entry.createdAt)}
                  {entry.basedOn ? " · 重新整理" : ""}
                </small>
              </span>
              <Badge tone="muted">{taskStatus(entry)}</Badge>
            </button>
          ))}
      </div>
      {task && (
        <CompilationDetail
          key={task.id}
          task={task}
          state={state}
          scope={`${scope}:${refreshEpoch}`}
          blocked={blocked || !!busy}
          adoptState={adoptState}
          notify={notify}
          onOpen={setOpenedId}
          onClose={() => setOpenedId("")}
          onArchived={() => {
            setOpenedId("");
            setArchived(true);
          }}
        />
      )}
    </section>
  );
}

const sourceStatus = {
  unchanged: "与创建时一致",
  changed: "来源已变",
  revoked: "授权已失效",
  unavailable: "无法核验",
};
const claimKind = {
  source_statement: "来源陈述",
  analysis: "分析",
  hypothesis: "假设",
};

function CompilationDetail({
  task,
  state,
  scope,
  blocked,
  adoptState,
  notify,
  onOpen,
  onClose,
  onArchived,
}) {
  const [confirmed, setConfirmed] = useState(false);
  const [packet, setPacket] = useState("");
  const [check, setCheck] = useState(null);
  const [file, setFile] = useState(null);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const [confirmArchive, setConfirmArchive] = useState(false);
  const [versionId, setVersionId] = useState("");
  const [writeBusy, setWriteBusy] = useState(false);
  const writeLock = useRef(false);
  const [renewBusy, setRenewBusy] = useState(false);
  const renewLock = useRef(false);
  const lock = useRef(false),
    sequence = useRef(0),
    writing = useRef(false),
    fileInput = useRef(null);
  const identity = `${scope}:${task.id}:${task.archived}:${task.candidates.at(-1)?.id || ""}`;
  const identityRef = useRef(identity);
  identityRef.current = identity;
  const version =
    task.candidates.find((entry) => entry.id === versionId) ||
    task.candidates.at(-1);
  useEffect(() => {
    if (writing.current) setPending(true);
    sequence.current++;
    lock.current = false;
    writing.current = false;
    setBusy("");
    setPacket("");
    setCheck(null);
  }, [identity]);
  useEffect(
    () => () => {
      sequence.current++;
    },
    [],
  );
  async function run(mode) {
    if (
      lock.current ||
      writeLock.current ||
      renewLock.current ||
      blocked ||
      (pending && mode !== "refresh")
    )
      return;
    if ((mode === "prepare" || mode === "copy") && !confirmed) return;
    lock.current = true;
    const ticket = ++sequence.current,
      startedIdentity = identity;
    const current = () =>
      ticket === sequence.current && startedIdentity === identityRef.current;
    setBusy(mode);
    setError("");
    setCheck(null);
    setPacket("");
    try {
      if (mode === "refresh") {
        const next = await request("/workspace", undefined, "GET", false);
        if (!current()) return;
        const refreshed = next.knowledgeTasks?.find(
          (entry) => entry.id === task.id,
        );
        setVersionId(refreshed?.candidates.at(-1)?.id || "");
        setPending(false);
        adoptState(next);
        notify("整理任务已刷新，请核对候选与状态");
      } else if (mode === "check") {
        const result = await request(
          "/knowledge/tasks/check",
          { taskId: task.id },
          "POST",
          false,
        );
        if (current()) setCheck(result);
      } else if (mode === "prepare" || mode === "copy") {
        // Even an already displayed packet is revalidated by the server before
        // every clipboard delivery. Never copy a cached authorization result.
        const result = await request(
          "/knowledge/tasks/packet",
          { taskId: task.id, confirmed: true },
          "POST",
          false,
        );
        if (!current()) return;
        setPacket(result.text);
        if (mode === "copy") {
          try {
            await navigator.clipboard.writeText(result.text);
            if (current()) notify("任务文本已复制，尚未启动 Codex");
          } catch {
            if (current())
              setError("无法写入剪贴板，请从下方任务文本手动复制。");
          }
        } else notify("任务文本已准备，尚未启动 Codex");
      } else {
        let candidate;
        if (mode === "receive") {
          if (!file) throw new Error("请选择候选 JSON 文件");
          if (file.size > 64 * 1024)
            throw new Error("候选 JSON 文件不能超过 64 KiB");
          let content;
          try {
            content = await file.text();
          } catch {
            throw new Error("无法读取候选文件，请重新选择");
          }
          if (!current()) return;
          try {
            candidate = JSON.parse(content);
          } catch {
            throw new Error(
              "候选 JSON 格式不正确，请保留文件并让 Codex 修正后重新选择",
            );
          }
        }
        writing.current = true;
        const result = await request(
          `/knowledge/tasks/${mode}`,
          {
            taskId: task.id,
            expectedRevision: state.revision,
            ...(mode === "receive" ? { candidate } : {}),
          },
          "POST",
          false,
        );
        if (!current()) return;
        writing.current = false;
        adoptState(result.state);
        if (mode === "archive") {
          notify("整理任务已归档，来源与候选历史保留");
          onArchived();
        } else {
          setFile(null);
          if (fileInput.current) fileInput.current.value = "";
          setVersionId(
            result.state.knowledgeTasks
              .find((entry) => entry.id === task.id)
              .candidates.at(-1).id,
          );
          notify("候选已保存，尚未审阅或写回知识库");
        }
      }
    } catch (failure) {
      if (!current()) return;
      setError(failure.message);
      if (
        writing.current &&
        (!failure.status || failure.status === 409 || failure.status >= 500)
      )
        setPending(true);
    } finally {
      if (current()) {
        lock.current = false;
        writing.current = false;
        setBusy("");
      }
    }
  }
  const disabled = blocked || !!busy || writeBusy || renewBusy || pending;
  return (
    <Dialog
      title="整理任务"
      onClose={() => {
        if (lock.current || writeLock.current || renewLock.current) return;
        sequence.current++;
        onClose();
      }}
    >
      <div className="knowledge-task-detail">
        <header className="knowledge-compilation-heading">
          <Badge tone="muted">{taskStatus(task)}</Badge>
          <small>{date(task.createdAt)}</small>
        </header>
        <h2>{task.question}</h2>
        <Steps
          label="整理流程"
          items={["准备任务文本", "交给本人 Codex", "回传候选", "核对来源", "保存到待整理"]}
          current={task.archived ? 5 : task.candidates.length ? 3 : 0}
        />
        {(task.basedOn ||
          state.knowledgeTasks.some(
            (entry) => entry.basedOn?.taskId === task.id,
          )) && (
          <div className="heading-actions" aria-label="关联整理任务">
            {task.basedOn && (
              <Button
                secondary
                disabled={disabled}
                onClick={() => onOpen(task.basedOn.taskId)}
              >
                查看原任务
              </Button>
            )}
            {state.knowledgeTasks
              .filter((entry) => entry.basedOn?.taskId === task.id)
              .map((entry, index) => (
                <Button
                  secondary
                  disabled={disabled}
                  key={entry.id}
                  onClick={() => onOpen(entry.id)}
                >
                  查看后续任务 {index + 1} · {date(entry.createdAt)}
                </Button>
              ))}
          </div>
        )}
        {error && (
          <p className="inline-error" role="alert">
            {error}
          </p>
        )}
        {pending && (
          <p className="inline-error" role="status">
            操作结果待核对。候选文件已保留，请刷新整理任务后再操作。
          </p>
        )}
        <div className="heading-actions">
          <Button
            secondary
            disabled={blocked || !!busy || writeBusy || renewBusy}
            onClick={() => run("refresh")}
          >
            <RefreshCw size={16} />
            {busy === "refresh" ? "刷新中…" : "刷新整理任务"}
          </Button>
        </div>
        <section className="knowledge-task-section" aria-label="整理依据">
          <div className="knowledge-compilation-heading">
            <h3>整理依据 · {task.evidence.length}</h3>
            <Button secondary disabled={disabled} onClick={() => run("check")}>
              {busy === "check" ? "核对中…" : "核对来源"}
            </Button>
          </div>
          <p className="detail-footnote" role="status">
            {check
              ? `本次核对：${sourceStatus[check.status]} · ${date(check.checkedAt)}`
              : "尚未核对来源"}
          </p>
          {task.evidence.map((item, index) => {
            const result = check?.items.find(
              (entry) => entry.evidenceId === item.id,
            );
            return (
              <div className="knowledge-evidence" key={item.id}>
                <strong>
                  {index + 1}. {item.path}
                </strong>
                <small>{item.sourceName}</small>
                {result && (
                  <p
                    className={
                      result.status === "unchanged"
                        ? "detail-footnote"
                        : "inline-error"
                    }
                  >
                    {sourceStatus[result.status]} · {result.message}
                  </p>
                )}
                <details>
                  <summary>证据标识与版本</summary>
                  <code>{item.id}</code>
                  <code>SHA-256 · {item.sha256}</code>
                  <small>读取于 {date(item.readAt)}</small>
                </details>
              </div>
            );
          })}
          {check?.status === "unchanged" && (
            <p className="detail-footnote">
              仅表示本次读取与创建时一致，不代表候选结论成立。
            </p>
          )}
        </section>
        <KnowledgeRenewal
          task={task}
          revision={state.revision}
          scope={`${identity}:${state.revision}`}
          blocked={blocked || !!busy || writeBusy || pending}
          adoptState={adoptState}
          notify={notify}
          onOpen={onOpen}
          onBusy={(value) => {
            renewLock.current = value;
            setRenewBusy(value);
          }}
        />
        {!task.archived && (
          <>
            <section
              className="knowledge-task-section asset-form"
              aria-label="交给本人 Codex"
            >
              <h3>交给本人 Codex</h3>
              <label className="knowledge-confirm">
                <input
                  type="checkbox"
                  checked={confirmed}
                  disabled={disabled}
                  onChange={(event) => {
                    setConfirmed(event.target.checked);
                    setPacket("");
                  }}
                />
                <span>我确认仅将任务文本交给本人 Codex</span>
              </label>
              <div className="heading-actions">
                <Button
                  secondary
                  disabled={disabled || !confirmed}
                  onClick={() => run("prepare")}
                >
                  {busy === "prepare" ? "准备中…" : "准备任务文本"}
                </Button>
                <Button
                  disabled={disabled || !confirmed}
                  onClick={() => run("copy")}
                >
                  <Copy size={16} />
                  {busy === "copy" ? "核对并复制中…" : "复制任务文本"}
                </Button>
              </div>
              {packet && (
                <label>
                  整理任务文本
                  <textarea
                    aria-label="整理任务文本"
                    className="knowledge-packet"
                    rows={10}
                    value={packet}
                    readOnly
                  />
                </label>
              )}
              <p className="detail-footnote">
                仅准备文本。复制时重新核对来源，不会自动启动 Agent。
              </p>
            </section>
            <section
              className="knowledge-task-section asset-form"
              aria-label="接收整理候选"
            >
              <h3>接收候选</h3>
              <label>
                候选 JSON 文件
                <input
                  ref={fileInput}
                  type="file"
                  accept=".json,application/json"
                  disabled={disabled}
                  onChange={(event) => {
                    setFile(event.target.files?.[0] || null);
                    setError("");
                  }}
                />
              </label>
              {file && (
                <small className="knowledge-filename">
                  已选择：{file.name}
                </small>
              )}
              <div className="heading-actions">
                <Button
                  disabled={disabled || !file}
                  onClick={() => run("receive")}
                >
                  <Upload size={16} />
                  {busy === "receive" ? "导入中…" : "导入候选"}
                </Button>
              </div>
              <p className="detail-footnote">
                最多 64 KiB。只检查结构与引用，保存后仍需审阅，不写回来源。
              </p>
            </section>
          </>
        )}
        <section className="knowledge-task-section" aria-label="整理候选">
          <div className="knowledge-compilation-heading">
            <h3>候选 · {task.candidates.length} 个版本</h3>
            <Badge tone="muted">尚未正式采纳</Badge>
          </div>
          {!version ? (
            <p className="detail-footnote">尚未收到候选。</p>
          ) : (
            <>
              <label className="knowledge-version-label">
                候选版本
                <select
                  value={version.id}
                  disabled={!!busy || writeBusy}
                  onChange={(event) => {
                    setVersionId(event.target.value);
                    setCheck(null);
                    setPacket("");
                  }}
                >
                  {task.candidates.map((entry, index) => (
                    <option key={entry.id} value={entry.id}>
                      版本 {index + 1} · {date(entry.receivedAt)}
                    </option>
                  ))}
                </select>
              </label>
              <CandidateView
                candidate={version.candidate}
                evidence={task.evidence}
              />
            </>
          )}
        </section>
        {version && (
          <KnowledgeWriteback
            key={version.id}
            task={task}
            version={version}
            sources={state.connections?.knowledgeSources || []}
            scope={identity}
            blocked={blocked || !!busy || renewBusy || pending}
            onBusy={(value) => {
              writeLock.current = value;
              setWriteBusy(value);
            }}
            notify={notify}
          />
        )}
        {!task.archived && (
          <div className="knowledge-task-section">
            {!confirmArchive ? (
              <div className="heading-actions">
                <Button
                  secondary
                  disabled={disabled}
                  onClick={() => setConfirmArchive(true)}
                >
                  <Archive size={16} />
                  归档任务
                </Button>
              </div>
            ) : (
              <>
                <p className="detail-footnote">
                  归档后停止本任务整理，来源文件和候选历史保留。
                </p>
                <div className="heading-actions">
                  <Button
                    secondary
                    disabled={!!busy}
                    onClick={() => setConfirmArchive(false)}
                  >
                    取消归档
                  </Button>
                  <Button disabled={disabled} onClick={() => run("archive")}>
                    {busy === "archive" ? "归档中…" : "确认归档"}
                  </Button>
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </Dialog>
  );
}

function EvidenceReferences({ ids, evidence }) {
  return (
    <ul className="knowledge-claim-references" aria-label="引用依据">
      {ids.map((id) => {
        const item = evidence.find((entry) => entry.id === id);
        return (
          <li key={id}>
            {item
              ? `${evidence.indexOf(item) + 1}. ${item.sourceName} · ${item.path}`
              : "引用依据不可用"}
          </li>
        );
      })}
    </ul>
  );
}

function CandidateView({ candidate, evidence }) {
  return (
    <div className="knowledge-candidate">
      <h4>{candidate.title}</h4>
      <p>{candidate.summary}</p>
      <h4>主张与依据</h4>
      {candidate.claims.map((claim) => (
        <div className="knowledge-claim" key={claim.id}>
          <Badge tone="muted">{claimKind[claim.kind]}</Badge>
          <p>{claim.text}</p>
          <EvidenceReferences ids={claim.evidenceIds} evidence={evidence} />
        </div>
      ))}
      <h4>待核对冲突</h4>
      {!candidate.conflicts.length ? (
        <p className="detail-footnote">本候选未提出冲突，不代表没有冲突。</p>
      ) : (
        candidate.conflicts.map((conflict, index) => (
          <div className="knowledge-claim" key={index}>
            <p>{conflict.text}</p>
            <EvidenceReferences
              ids={conflict.evidenceIds}
              evidence={evidence}
            />
          </div>
        ))
      )}
      <h4>未知与待验证</h4>
      {!candidate.unknowns.length ? (
        <p className="detail-footnote">本候选未列出未知项。</p>
      ) : (
        <ul>
          {candidate.unknowns.map((item, index) => (
            <li key={index}>{item}</li>
          ))}
        </ul>
      )}
      <h4>关联建议</h4>
      {!candidate.relations.length ? (
        <p className="detail-footnote">本候选未提出关联建议。</p>
      ) : (
        candidate.relations.map((relation, index) => (
          <div className="knowledge-claim" key={index}>
            <p>{relation.text}</p>
            <EvidenceReferences
              ids={relation.evidenceIds}
              evidence={evidence}
            />
          </div>
        ))
      )}
    </div>
  );
}
