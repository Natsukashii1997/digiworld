// 路线 v3 切片 2.3（协同看板 + 模板 #1 + 操作留痕 v1）与 2.4（一键派发）。
// 看板只读项目自己的 CURRENT.md 与交接文件名；阶段推断不了就显示“未知”，不猜。
// 派发只生成口令，用户确认后复制到剪贴板；复制成功才计入留痕。不自动执行、不代替用户发送。
import React, { useCallback, useEffect, useRef, useState } from "react";
import { RefreshCw, Send, Copy, FolderKanban } from "lucide-react";
import { PageHeading, Button, Badge, Dialog, Empty, Scanning } from "./components.jsx";
import { request } from "./api.js";
import {
  STAGES,
  COLLAB_AGENTS,
  dispatchPrompt,
  timelineOf,
  sha256Hex,
  linkText,
} from "./collab.js";
import "./collab.css";

const STATE_ID = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/;
const TIMELINE_PREVIEW = 8;
const KIND = {
  dispatch: ["派发", "warning"],
  start: ["开工", "warning"],
  state: ["状态", "success"],
  handoff: ["交接", "muted"],
};

// 复制成功之后才写留痕；写入失败时保留同一 ID，可补记而不必再复制（服务端按 ID 去重）。
export function usePromptCopy({ adoptState, notify, onRecorded }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [pending, setPending] = useState(null);
  const live = useRef(true);
  useEffect(() => {
    live.current = true;
    return () => {
      live.current = false;
    };
  }, []);
  function reset() {
    setError("");
    setPending(null);
  }
  async function record(payload) {
    const result = await request("/collab/record", payload);
    adoptState(result.state);
    onRecorded?.(result.record);
    return result.record;
  }
  async function copy({ text, kind, projectId, agent, stateId, stage }) {
    setBusy(true);
    setError("");
    try {
      try {
        await navigator.clipboard.writeText(text);
      } catch {
        if (live.current)
          setError("复制失败，口令没有进入剪贴板，也没有计入留痕。可以手动选中上面的口令文本。");
        return false;
      }
      const payload = {
        id: `collab-${crypto.randomUUID()}`,
        kind,
        projectId,
        agent,
        ...(stateId && STATE_ID.test(stateId) ? { stateId } : {}),
        ...(stage ? { stage } : {}),
        promptSha256: await sha256Hex(text),
      };
      try {
        await record(payload);
        notify("口令已复制，已计入操作留痕");
        return true;
      } catch (e) {
        if (live.current) {
          setPending(payload);
          setError(`口令已复制，但留痕没有写入：${e.message}。可以补记，不需要再复制。`);
        }
        return false;
      }
    } finally {
      if (live.current) setBusy(false);
    }
  }
  async function retry() {
    if (!pending) return false;
    setBusy(true);
    try {
      await record(pending);
      if (live.current) {
        setPending(null);
        setError("");
      }
      notify("已补记操作留痕");
      return true;
    } catch (e) {
      if (live.current) setError(`补记仍未成功：${e.message}`);
      return false;
    } finally {
      if (live.current) setBusy(false);
    }
  }
  return { busy, error, pending, copy, retry, reset };
}

// 预览口令 → 用户确认 → 复制。口令只展示，不在这里编辑，保证复制的就是看到的。
// stale：口令生成后看板已刷新到新状态时的说明；此时不能再确认复制，需关闭后重新生成（C5-F2）。
// 已复制、只差补记时不受影响：补记的是当时真实复制的那份口令。
export function PromptDialog({ title, lead, text, onClose, copier, onConfirm, stale = "" }) {
  return (
    <Dialog title={title} onClose={onClose}>
      <div className="prompt-dialog">
        <p className="body-copy">{lead}</p>
        <pre className="prompt-preview" tabIndex={0} aria-label="口令预览">
          {text}
        </pre>
        {copier.error && (
          <p className="inline-error" role="alert">
            {copier.error}
          </p>
        )}
        {stale && !copier.pending && (
          <p className="inline-error" role="alert">
            {stale}
          </p>
        )}
        <div className="prompt-actions">
          <Button secondary onClick={onClose}>
            {copier.pending ? "关闭" : "取消"}
          </Button>
          {copier.pending ? (
            <Button disabled={copier.busy} onClick={copier.retry}>
              补记留痕
            </Button>
          ) : (
            <Button disabled={copier.busy || !!stale} onClick={onConfirm}>
              <Copy size={16} />
              {copier.busy ? "复制中…" : "确认并复制"}
            </Button>
          )}
        </div>
      </div>
    </Dialog>
  );
}

export function AgentPicker({ id, label, value, onChange }) {
  return (
    <label className="agent-picker" htmlFor={id}>
      <span>{label}</span>
      <select id={id} value={value} onChange={(e) => onChange(e.target.value)}>
        {COLLAB_AGENTS.map((a) => (
          <option key={a.id} value={a.id}>
            {a.label}
          </option>
        ))}
      </select>
    </label>
  );
}

function StageBar({ stage }) {
  const index = STAGES.findIndex((s) => s.id === stage.id);
  return (
    <ol className="collab-stages" aria-label="模板 #1 流程阶段">
      {STAGES.map((s, i) => (
        <li
          key={s.id}
          className={i === index ? "now" : index > i ? "past" : ""}
          aria-current={i === index ? "step" : undefined}
        >
          <span className="collab-stage-dot" aria-hidden="true">
            {i + 1}
          </span>
          <span>{s.label}</span>
        </li>
      ))}
    </ol>
  );
}

function penText(pen) {
  if (pen.state === "idle") return ["无人持笔（写入者为“无”）", "muted"];
  if (pen.state === "held")
    return [pen.agent ? `${pen.agent} · ${pen.text}` : pen.text, "warning"];
  return ["未知（读不到当前写入者）", "muted"];
}

function stageReason(item) {
  if (item.stage.id !== "unknown")
    return `依据${item.stage.basis}中的“${item.stage.keyword}”`;
  if (item.current.state === "absent") return `项目里没有 ${item.current.path}`;
  if (item.current.state === "unparsed") return `${item.current.path} 没有协作状态表`;
  if (item.current.state === "error") return item.current.message || "状态文件无法读取";
  return "写入者、最新状态标题与最新交接里都没有可识别的阶段关键词";
}

function Timeline({ item }) {
  const [all, setAll] = useState(false);
  const events = timelineOf({
    states: item.states,
    handoffs: item.handoffs,
    records: item.records,
  });
  const shown = all ? events : events.slice(0, TIMELINE_PREVIEW);
  return (
    <section className="collab-timeline" aria-label={`操作留痕：${item.name}`}>
      <h3>操作留痕 · {events.length}</h3>
      <small className="status-note">
        来源：{item.current.path} 中带 state_id 的节标题、docs/agents/handoffs 的文件名与修改时间（不读正文）、工作台的复制记录。
      </small>
      {item.statesTruncated && (
        <small className="status-note">CURRENT 超过 1 MiB，只读取了开头的标题。</small>
      )}
      {item.handoffs.state === "error" && (
        <small className="status-note">交接文档：{item.handoffs.message}</small>
      )}
      {item.handoffs.truncated && (
        <small className="status-note">交接文档超过 1000 份，只列出文件名最新的 1000 份。</small>
      )}
      {events.length ? (
        <ol>
          {shown.map((e) => (
            <li key={`${e.kind}-${e.id}`}>
              <time>{e.date || "日期未知"}</time>
              <Badge tone={KIND[e.kind][1]}>{KIND[e.kind][0]}</Badge>
              <span className="collab-event-title">{e.title}</span>
              {e.agent && <small>{e.agent}</small>}
            </li>
          ))}
        </ol>
      ) : (
        <p className="status-note">还没有可追溯的认领、交接或派发记录。</p>
      )}
      {events.length > TIMELINE_PREVIEW && (
        <Button secondary onClick={() => setAll(!all)} aria-expanded={all}>
          {all ? "收起" : `展开全部 ${events.length} 条`}
        </Button>
      )}
    </section>
  );
}

// 口令生成后，看板读到的状态编号或阶段变了：这份口令已过期。
export function staleNote(prompt, stateId, stage) {
  if (!prompt) return "";
  if ((prompt.stateId || "") === (stateId || "") && (stage === undefined || prompt.stage === stage)) return "";
  return `看板已刷新到 ${stateId || "未知状态"}，这份口令基于 ${prompt.stateId || "未知状态"}，已过期。请关闭后重新生成。`;
}

function BoardCard({ item, adoptState, notify, onRecorded }) {
  const [agent, setAgent] = useState("codex");
  const [prompt, setPrompt] = useState(null);
  const copier = usePromptCopy({ adoptState, notify, onRecorded });
  const [pen, tone] = penText(item.pen);
  const f = item.current.fields || {};
  function open() {
    try {
      copier.reset();
      // 口令与留痕字段在生成时一起定下，确认时不再读刷新后的看板（C5-F2）。
      setPrompt({
        text: dispatchPrompt(item, agent),
        agent,
        projectId: item.projectId,
        stateId: f.stateId,
        stage: item.stage.id,
      });
    } catch (e) {
      notify(e.message, "error");
    }
  }
  return (
    <article className="collab-board" aria-label={`协同看板：${item.name}`}>
      <header>
        <h2>{item.name}</h2>
        <Badge tone={item.stage.id === "unknown" ? "muted" : "success"}>
          当前阶段：{item.stage.label}
        </Badge>
      </header>
      {item.root && <small className="status-root">{item.root}</small>}
      <StageBar stage={item.stage} />
      <dl className="status-fields">
        <div>
          <dt>阶段依据</dt>
          <dd>{stageReason(item)}</dd>
        </div>
        <div>
          <dt>笔在谁手上</dt>
          <dd>
            <Badge tone={tone}>{pen}</Badge>
          </dd>
        </div>
        <div>
          <dt>状态编号</dt>
          <dd>{f.stateId || <span className="status-missing">未知</span>}</dd>
        </div>
        <div>
          <dt>唯一下一步</dt>
          <dd>{f.next ? linkText(f.next) : <span className="status-missing">未知</span>}</dd>
        </div>
      </dl>
      <div className="collab-dispatch">
        <AgentPicker
          id={`dispatch-${item.projectId}`}
          label="下一棒"
          value={agent}
          onChange={setAgent}
        />
        <Button disabled={!item.root} onClick={open}>
          <Send size={16} />
          生成派发口令
        </Button>
      </div>
      <Timeline item={item} />
      {prompt && (
        <PromptDialog
          title={`派发口令：${item.name}`}
          lead="按模板 #1 生成的下一棒口令。确认后复制到剪贴板，并计入本项目的操作留痕；工作台不会替你发送或执行。"
          text={prompt.text}
          copier={copier}
          stale={staleNote(prompt, f.stateId, item.stage.id)}
          onClose={() => setPrompt(null)}
          onConfirm={async () => {
            const done = await copier.copy({
              text: prompt.text,
              kind: "dispatch",
              projectId: prompt.projectId,
              agent: prompt.agent,
              stateId: prompt.stateId,
              stage: prompt.stage,
            });
            if (done) setPrompt(null);
          }}
        />
      )}
    </article>
  );
}

export function Collab({ state, adoptState, notify, navigate }) {
  const [board, setBoard] = useState({ items: [], error: "", loaded: false });
  const run = useRef(0);
  const active = (state.connections?.projects || []).filter((p) => p.active);
  const activeKey = active.map((p) => p.id).join("|");
  const load = useCallback(async () => {
    const mine = ++run.current;
    setBoard((prev) => ({ ...prev, error: "", loaded: false }));
    try {
      const result = await request("/collab/board", {});
      if (mine === run.current) setBoard({ items: result.items, error: "", loaded: true });
    } catch (e) {
      if (mine === run.current) setBoard({ items: [], error: e.message || "读取失败", loaded: true });
    }
  }, []);
  useEffect(() => {
    // 没有在推进项目时不读取任何项目文件。
    if (!activeKey) {
      run.current++;
      setBoard({ items: [], error: "", loaded: true });
    } else load();
  }, [activeKey, load]);
  const recorded = (record) =>
    setBoard((prev) => ({
      ...prev,
      items: prev.items.map((i) =>
        i.projectId === record.projectId && !i.records.some((r) => r.id === record.id)
          ? { ...i, records: [...i.records, record] }
          : i,
      ),
    }));
  return (
    <>
      <PageHeading
        page="collab"
        action={
          active.length > 0 && (
            <Button secondary disabled={!board.loaded} onClick={load}>
              <RefreshCw size={16} className={board.loaded ? "" : "spinning"} />
              刷新看板
            </Button>
          )
        }
      />
      {!active.length ? (
        <Empty
          icon={FolderKanban}
          title="还没有在推进项目"
          action={
            <Button secondary onClick={() => navigate("projects")}>
              去项目空间标记
            </Button>
          }
        >
          协同看板只显示“在推进”的项目。在项目空间的项目详情里“标为在推进”后，这里会按项目 CURRENT.md 显示流程阶段、笔在谁手上和操作留痕。
        </Empty>
      ) : (
        <>
          <p className="detail-footnote">
            只读取项目自己的 CURRENT.md 与交接文件名，不修改项目文件。阶段按模板 #1（认领 → 实现 → 复核 → 返修 → 验收）从写入者和最新状态标题的关键词推断，推断不了显示“未知”。
          </p>
          {board.error && (
            <p className="inline-error" role="alert">
              看板读取失败：{board.error}
            </p>
          )}
          {!board.loaded && !board.items.length && <Scanning label="正在读取在推进项目的协作状态" />}
          <div className="collab-grid">
            {board.items.map((item) => (
              <BoardCard
                key={item.projectId}
                item={item}
                adoptState={adoptState}
                notify={notify}
                onRecorded={recorded}
              />
            ))}
          </div>
        </>
      )}
    </>
  );
}
