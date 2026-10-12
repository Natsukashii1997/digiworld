import { copyText } from './data-flight.js';
import React, {useEffect,useRef,useState} from "react";
import {Copy} from "lucide-react";
import {Button,Dialog} from "./components.jsx";
import {request} from "./api.js";
import {COLLAB_AGENTS,sha256Hex} from "./collab.js";
import {desktopAgentLabel} from "./desktop-agents.js";
import "./collab.css";
const STATE_ID = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/;
// 复制成功之后才写留痕；写入失败时保留同一 ID，可补记而不必再复制（服务端按 ID 去重）。
export function usePromptCopy({ adoptState, notify, onRecorded, successMessage = "口令已复制，已计入操作留痕" }) {
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
        await copyText(text);
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
        if (live.current) notify(successMessage);
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

export function AgentPicker({ id, label, value, onChange, desktop = false, disabled = false }) {
  return (
    <label className="agent-picker" htmlFor={id}>
      <span>{label}</span>
      <select id={id} disabled={disabled} value={value} onChange={(e) => onChange(e.target.value)}>
        {COLLAB_AGENTS.map((a) => (
          <option key={a.id} value={a.id}>
            {desktop ? desktopAgentLabel(a.id, a.label) : a.label}
          </option>
        ))}
      </select>
    </label>
  );
}

export function staleNote(prompt, stateId, stage) {
  if (!prompt) return "";
  if ((prompt.stateId || "") === (stateId || "") && (stage === undefined || prompt.stage === stage)) return "";
  return `看板已刷新到 ${stateId || "未知状态"}，这份口令基于 ${prompt.stateId || "未知状态"}，已过期。请关闭后重新生成。`;
}


export {CollabV16 as Collab} from "./CollabV16.jsx";
