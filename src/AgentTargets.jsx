import { Reading, ReadReveal } from './ScanMotion.jsx';
import { flyData } from './data-flight.js';
import React, { useEffect, useRef, useState } from "react";
import { Plus, RefreshCw } from "lucide-react";
import { Badge, Button } from "./components.jsx";
import { request } from "./api.js";
import { AgentConfig } from "./AgentConfig.jsx";

const statusLabel = {
  available: "路径可用",
  program_missing: "程序已缺失",
  home_missing: "目录已缺失",
  blocked: "读取受阻",
  unknown: "待核对",
};
export function AgentTargets({
  agentId,
  state,
  adoptState,
  notify,
  onEvidence,
  onSelect,
}) {
  const [options, setOptions] = useState(null);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [stale, setStale] = useState(false);
  const [draft, setDraft] = useState(null);
  const [removing, setRemoving] = useState(null);
  const lock = useRef(false),
    sequence = useRef(0);
  const editor = useRef(null);
  useEffect(
    () => () => {
      sequence.current++;
    },
    [agentId],
  );
  useEffect(() => {
    if (draft) editor.current?.focus();
  }, [draft?.id, !!draft]);
  const targets = (state.connections?.agentTargets || []).filter(
    (t) => t.agentId === agentId,
  );
  const usable = options && !stale && !options.errors.length && !busy;
  async function refresh() {
    if (lock.current) return;
    lock.current = true;
    const ticket = ++sequence.current;
    setBusy("check");
    setError("");
    onEvidence((previous) => (previous ? { ...previous, stale: true } : null));
    try {
      const value = await request("/agent-targets/options", { agentId });
      const latest = await request("/workspace");
      if (sequence.current !== ticket) return;
      adoptState(latest);
      if (value.errors.length) {
        setStale(true);
        setError(value.errors.join("；"));
        if (!options) setOptions(value);
      } else {
        setOptions(value);
        setStale(false);
        onEvidence({ programs: value.programs, stale: false });
      }
    } catch (e) {
      if (sequence.current === ticket) {
        setError(e.message);
        setStale(true);
      }
    } finally {
      if (sequence.current === ticket) {
        setBusy("");
        lock.current = false;
      }
    }
  }
  function edit(target) {
    setError("");
    setRemoving(null);
    setDraft(
      target
        ? {
            id: target.id,
            label: target.label,
            programId:
              options.programs.find(
                (p) =>
                  p.path === target.program.path &&
                  p.kind === target.program.kind,
              )?.id || "",
            homeId:
              options.homes.find(
                (h) => h.id === target.home.id && h.path === target.home.path,
              )?.id || "",
          }
        : { label: "", programId: "", homeId: "" },
    );
  }
  async function mutate(action, data) {
    if (lock.current) return;
    lock.current = true;
    const ticket = ++sequence.current;
    setBusy(action);
    setError("");
    try {
      const next = await request("/agent-targets/" + action, {
        ...data,
        revision: state.revision,
      });
      // A completed write updates the common state even if this drawer closed meanwhile.
      adoptState(next);
      if (action === "save") flyData();
      if (sequence.current !== ticket) return;
      setDraft(null);
      setRemoving(null);
      notify(
        action === "save"
          ? "已保存管理目标；未修改 Agent 配置"
          : "已解除关联；未卸载程序或删除目录",
      );
    } catch (e) {
      if (sequence.current === ticket) {
        setError(e.message);
        setStale(true);
        onEvidence((previous) =>
          previous ? { ...previous, stale: true } : null,
        );
      }
    } finally {
      if (sequence.current === ticket) {
        setBusy("");
        lock.current = false;
      }
    }
  }
  return (
    <section
      className="agent-inventory-section"
      aria-label="管理目标"
      aria-busy={!!busy}
    >
      <div className="workflow-reference-heading">
        <ReadReveal pending={busy==="check"} ready={!error}/>
        <h3>
          管理目标 <small>{targets.length}</small>
        </h3>
        <Button secondary disabled={!!busy} onClick={refresh}>
          {busy === "check" ? <Reading mini label="检查版本与目标"/> : <RefreshCw size={15}/>}
          {busy === "check" ? null : "检查版本与目标"}
        </Button>
      </div>
      <p className="detail-footnote" role="status">
        {stale
          ? "检查未成功 · 上次结果不可用于新绑定"
          : options
            ? `检查于 ${new Date(options.at).toLocaleString("zh-CN")}`
            : "尚未检查版本与目标"}
      </p>
      {error && (
        <p className="inline-error" role="alert">
          {error} · 请检查版本与目标后重试。
        </p>
      )}
      {targets.map((target) => (
        <section
          className="agent-home"
          aria-label={target.label}
          key={target.id}
        >
          <div className="workflow-reference-heading">
            <strong>{target.label}</strong>
            <Badge tone="muted">
              {statusLabel[
                !stale && options?.revision === state.revision
                  ? options.targets.find((t) => t.id === target.id)?.status
                  : "unknown"
              ] || "待核对"}
            </Badge>
          </div>
          <div className="agent-target-path">
            <span>{target.program.kind}</span>
            <code>{target.program.path}</code>
          </div>
          <div className="agent-target-path">
            <span>{target.home.label}</span>
            <code>{target.home.path}</code>
          </div>
          <p className="detail-footnote">用户关联 · 未验证运行</p>
          <AgentConfig
            target={target}
            revision={state.revision}
            adoptState={adoptState}
          />
          {(state.connections?.skillCopies || []).some(
            (c) => c.targetId === target.id,
          ) && (
            <section
              className="agent-target-copies"
              aria-label={`${target.label} 的关联资产`}
            >
              <h4>关联 Skill</h4>
              {(state.connections.skillCopies || [])
                .filter((c) => c.targetId === target.id)
                .map((c) => {
                  const a = state.assets.find((a) => a.id === c.assetId);
                  const version = a?.versions.findIndex(
                    (v) => v.id === c.versionId,
                  );
                  return (
                    <div key={c.id}>
                      {a && !a.archived && version >= 0 ? (
                        <button
                          className="text-button"
                          onClick={() => onSelect?.(a.id)}
                        >
                          {a.versions.at(-1).title} · v{version + 1}.0
                        </button>
                      ) : (
                        <span>资产或版本不可用</span>
                      )}
                      <code>{c.location}</code>
                      <small>固定版本关联 · 待核对</small>
                    </div>
                  );
                })}
            </section>
          )}
          <div className="heading-actions">
            <Button secondary disabled={!usable} onClick={() => edit(target)}>
              编辑目标
            </Button>
            <Button
              secondary
              disabled={!!busy}
              onClick={() => {
                setRemoving(target.id);
                setDraft(null);
                setError("");
              }}
            >
              解除关联
            </Button>
          </div>
          {removing === target.id && (
            <div
              className="agent-target-confirm"
              role="group"
              aria-label="解除目标确认"
            >
              <p>仅解除工作台关联，不卸载程序、不删除目录。</p>
              <div className="heading-actions">
                <Button
                  secondary
                  disabled={!!busy}
                  onClick={() => setRemoving(null)}
                >
                  取消解除
                </Button>
                <Button
                  disabled={!!busy}
                  onClick={() => mutate("remove", { id: target.id })}
                >
                  {busy === "remove" ? "解除中…" : "确认解除"}
                </Button>
              </div>
            </div>
          )}
        </section>
      ))}
      {!targets.length && (
        <p className="detail-footnote">
          尚无管理目标。检查后选择程序与 Home / Profile。
        </p>
      )}
      {!draft && (
        <div className="heading-actions">
          <Button
            secondary
            disabled={
              !usable ||
              !options.programs.some((p) => p.status === "present") ||
              !options.homes.some((h) => h.status === "present")
            }
            onClick={() => edit(null)}
          >
            <Plus size={15} />
            添加目标
          </Button>
        </div>
      )}
      {draft && (
        <form
          className="agent-home"
          aria-label="目标编辑"
          onSubmit={(e) => {
            e.preventDefault();
            if (usable) mutate("save", { ...draft, token: options.token });
          }}
        >
          <label>
            目标名称
            <input
              ref={editor}
              value={draft.label}
              maxLength={100}
              required
              disabled={!!busy}
              onChange={(e) => setDraft({ ...draft, label: e.target.value })}
            />
          </label>
          <label>
            程序入口
            <select
              aria-label="程序入口"
              value={draft.programId}
              required
              disabled={!usable}
              onChange={(e) =>
                setDraft({ ...draft, programId: e.target.value })
              }
            >
              <option value="">选择程序入口</option>
              {options?.programs.map((p) => (
                <option
                  key={p.id}
                  value={p.id}
                  disabled={p.status !== "present"}
                >
                  {p.path.split("/").pop()} · {p.kind} · {p.path}
                </option>
              ))}
            </select>
            {draft.programId && (
              <code>
                {options?.programs.find((p) => p.id === draft.programId)?.path}
              </code>
            )}
          </label>
          <label>
            Home / Profile
            <select
              aria-label="Home / Profile"
              value={draft.homeId}
              required
              disabled={!usable}
              onChange={(e) => setDraft({ ...draft, homeId: e.target.value })}
            >
              <option value="">选择 Home / Profile</option>
              {options?.homes.map((h) => (
                <option
                  key={h.id}
                  value={h.id}
                  disabled={h.status !== "present"}
                >
                  {h.label} · {h.path}
                </option>
              ))}
            </select>
            {draft.homeId && (
              <code>
                {options?.homes.find((h) => h.id === draft.homeId)?.path}
              </code>
            )}
          </label>
          <p className="detail-footnote">
            仅限本机 · 记录管理范围，不切换 Agent 配置。
          </p>
          <div className="heading-actions">
            <Button
              type="button"
              secondary
              disabled={!!busy}
              onClick={() => setDraft(null)}
            >
              取消编辑
            </Button>
            <Button
              disabled={
                !usable ||
                !draft.label.trim() ||
                !draft.programId ||
                !draft.homeId
              }
            >
              {busy === "save" ? "保存中…" : "保存目标"}
            </Button>
          </div>
        </form>
      )}
    </section>
  );
}
