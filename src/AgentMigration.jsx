import React, { useEffect, useRef, useState } from "react";
import { Button, Dialog } from "./components.jsx";
import { PageChoices } from "./PageChoices.jsx";
import {
  CapabilityPreview,
  CapabilityResult,
  useCapabilityAction,
} from "./capability-ui-core.jsx";
import { request } from "./api.js";
import { copyText } from "./data-flight.js";
import { agentTargetTuple, useAgentPending } from "./useAgentPending.js";
import "./agent-write-ui.css";
import "./agent-migration-use.css";
const call = (action, input) =>
  request("/capabilities/agent/" + action, input, "POST", false);
const labels = {
  personality: "指令与个性",
  memory: "记忆参考",
  capability: "Skills",
  connection: "连接草稿",
};
const status = {
  running: "正在执行，请稍后查询",
  matches_after: "文件回读一致",
  matches_before: "尚未写入或已恢复",
  skipped: "已跳过",
  changed: "目标已变化",
  unknown: "结果未知",
  not_started: "尚未执行",
  not_started_or_unknown: "未确认执行，需要核对",
};
const configurationStatus = {
  enabled: "配置已启用，实际读取仍待确认",
  disabled: "配置明确停用，请先在目标中确认启用",
  unset: "未设置明确启用值",
  unknown: "原生配置尚未确认",
  not_applicable: "此项不适用原生启用配置",
};
function AdoptionReview({
  value,
  busy,
  notice,
  onCopy,
  onRefresh,
  headingRef,
}) {
  const ready = value.items?.some((item) => item.ready),
    canCopy = ready && value.materialStatus !== "unavailable" && !!value.prompt;
  return (
    <section className="migration-adoption" aria-label="开始使用迁移内容">
      <h3 ref={headingRef} tabIndex={-1}>
        开始使用
      </h3>
      <p role="status">
        {value.materialStatus === "ready"
          ? "本次材料文件已就绪；原生 Agent 的读取和调用尚待确认。"
          : value.materialStatus === "partial"
            ? "部分材料文件已就绪；接手提示只包含下方可用项，其余未纳入。"
            : "当前没有可使用的材料。请先核对迁移或撤回结果。"}
      </p>
      <dl className="migration-target-details">
        <dt>目标 Agent</dt>
        <dd>
          {value.target.label} · {value.target.agentId}
        </dd>
        <dt>目标程序</dt>
        <dd>{value.target.programPath}</dd>
        <dt>目标 Home</dt>
        <dd>{value.target.homePath}</dd>
        <dt>本次迁移</dt>
        <dd>{value.id}</dd>
      </dl>
      <p>
        最近核对：{value.checkedAt || "时间未提供"}
        。文件状态来自本次回读；未检测原生 Agent 实际采用。
      </p>
      <ul className="migration-use-items">
        {value.items?.map((item, index) => (
          <li key={item.id || index}>
            <strong>{item.name}</strong>
            {item.skillName && <p>Skill 名称：{item.skillName}</p>}
            <p>文件：{item.path || item.file || "未提供可用文件位置"}</p>
            <p>
              文件状态：
              {item.fileStatus === "available"
                ? "文件回读一致"
                : item.fileStatus === "changed"
                  ? "文件已有变化"
                  : "文件未就绪"}{" "}
              · {item.ready ? "已纳入接手提示" : "未纳入接手提示"}
            </p>
            <p>
              {configurationStatus[item.configurationStatus] ||
                "原生配置尚未确认"}
            </p>
            {item.reason && <p>{item.reason}</p>}
          </li>
        ))}
      </ul>
      {value.notice && <p>{value.notice}</p>}
      {canCopy && (
        <>
          <p>
            把下面的接手提示交给上述目标 Agent。请先确认它使用的是这里登记的
            Home；按提示检查材料、缺项和下一步，涉及配置修改时再确认。
          </p>
          <label>
            复制给目标 AI 的接手提示
            <textarea
              className="agent-relay-text migration-use-prompt"
              aria-label="迁移接手提示全文"
              readOnly
              value={value.prompt}
              rows={12}
            />
          </label>
          <div className="heading-actions">
            <Button
              type="button"
              disabled={busy}
              onClick={() => onCopy(value.prompt, "prompt")}
            >
              复制接手提示
            </Button>
          </div>
          {value.startCommand && (
            <details>
              <summary>需要打开所选目标时</summary>
              <p>
                以下命令指定登记的程序与 Home，页面不会执行。Hermes
                若已有使用同一 Home 的会话，请在现有会话中继续。
              </p>
              <pre className="agent-relay-text" aria-label="目标启动命令">
                {value.startCommand}
              </pre>
              <Button
                secondary
                type="button"
                disabled={busy}
                onClick={() => onCopy(value.startCommand, "command")}
              >
                复制目标启动命令
              </Button>
            </details>
          )}
        </>
      )}
      {notice && (
        <p
          role={notice.error ? "alert" : "status"}
          className={notice.error ? "inline-error" : undefined}
        >
          {notice.text}
        </p>
      )}
      <Button secondary type="button" disabled={busy} onClick={onRefresh}>
        重新核对可用材料
      </Button>
    </section>
  );
}
export function AgentMigration({ state, onClose, onConfigure }) {
  const targets = (state.connections?.agentTargets || []).filter(
    (t) => ["codex", "hermes"].includes(t.agentId) && t.program.kind === "CLI",
  );
  const a = useCapabilityAction(),
    alive = useRef(true),
    stage = useRef(null),
    adoptionHeading = useRef(null),
    [source, setSource] = useState(""),
    [target, setTarget] = useState(""),
    [capture, setCapture] = useState(null),
    [selected, setSelected] = useState({}),
    [plan, setPlan] = useState(null),
    [result, setResult] = useState(null),
    [rows, setRows] = useState(null),
    [unresolved, setUnresolved] = useState(false),
    [adoption, setAdoption] = useState(null),
    [useNotice, setUseNotice] = useState("");
  const targetTuple = agentTargetTuple(
      targets.find((item) => item.id === target),
    ),
    migrationPending = useAgentPending({
      scope: "migration-batch",
      targetTuple,
    }),
    recoveryPending = useAgentPending({
      scope: "migration-recovery",
      targetTuple,
    }),
    pendingIds = [
      ...new Set([migrationPending.id, recoveryPending.id].filter(Boolean)),
    ],
    pendingReady = migrationPending.ready && recoveryPending.ready;
  function clearAdoption() {
    setAdoption(null);
    setUseNotice("");
  }
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  useEffect(() => {
    if (plan || result) stage.current?.focus();
  }, [plan, result]);
  useEffect(() => {
    if (adoption) adoptionHeading.current?.focus();
  }, [adoption]);
  function reset() {
    setCapture(null);
    setSelected({});
    setPlan(null);
    setResult(null);
    setRows(null);
    setUnresolved(false);
    clearAdoption();
  }
  async function read() {
    clearAdoption();
    const v = await a.run(() =>
      call("migration-capture", { sourceTargetId: source }),
    );
    if (v && alive.current) {
      setCapture(v);
      setSelected({});
      setPlan(null);
      setResult(null);
    }
  }
  async function preview() {
    clearAdoption();
    const v = await a.run(() =>
      call("migration-batch-preview", {
        sourceTargetId: source,
        targetId: target,
        revision: capture.revision,
        items: Object.entries(selected).map(([id, conflict]) => ({
          id,
          conflict,
        })),
      }),
    );
    if (v && alive.current) {
      setPlan(v);
      setResult(null);
    }
  }
  async function apply() {
    if (a.isBusy() || !plan) return;
    const p = plan,
      queue = p.recovery ? recoveryPending : migrationPending;
    if (!queue.ready || queue.id || !queue.setId(p.token, "")) {
      a.setError("待查编号未能保存，尚未提交。请先核对已有记录。");
      return;
    }
    clearAdoption();
    const v = await a.run(() =>
      call("migration-batch-apply", {
        token: p.token,
        revision: p.revision,
      }),
    );
    if (!alive.current) return;
    if (v) {
      const value = {
          ...v,
          id: v.operationId || v.id || p.token,
          recovery: !!p.recovery,
        },
        unknown = v.unresolved ?? v.status !== "verified";
      setResult(value);
      setPlan(null);
      setUnresolved(unknown);
      if (!unknown && !queue.setId("", p.token))
        a.setError(
          "服务端已返回结果，本机待查编号未能清除；请保留编号重新核对。",
        );
    } else if (!a.lastError.current?.operationNotStarted) {
      const value = {
        id: p.token,
        status: "unknown",
        items: [],
        recovery: !!p.recovery,
      };
      setResult(value);
      setPlan(null);
      setUnresolved(true);
    } else {
      queue.setId("", p.token);
    }
  }
  async function check(id = result?.id, kind) {
    if (!id || a.isBusy()) return;
    clearAdoption();
    const recovery =
        kind === "restore" ||
        id === recoveryPending.id ||
        (id === result?.id && result.recovery),
      v = await a.run(() => call("migration-batch-check", { id }));
    if (v && alive.current) {
      const unknown = v.unresolved ?? v.status !== "verified";
      setResult({
        ...v,
        id: v.id || id,
        recovery,
      });
      setPlan(null);
      setUnresolved(unknown);
      for (const queue of [migrationPending, recoveryPending])
        if (id === queue.id && !unknown && !queue.setId("", id))
          a.setError("结果已核对，本机待查编号仍保留；请再次核对后再操作。");
      if (unknown) {
        const queue = recovery ? recoveryPending : migrationPending;
        if (queue.ready && !queue.id) queue.setId(id, "");
      }
    }
  }
  async function restore(item) {
    clearAdoption();
    const v = await a.run(() =>
      call("migration-batch-rollback-preview", {
        id: item.id,
        revision: state.revision,
      }),
    );
    if (v && alive.current) setPlan({ ...v, recovery: true });
  }
  async function startUsing(id) {
    if (!id || a.isBusy()) return;
    clearAdoption();
    const value = await a.run(() => call("migration-batch-adoption", { id }));
    if (value && alive.current) {
      setPlan(null);
      setAdoption(value);
    }
  }
  async function copyForTarget(text, kind) {
    setUseNotice("");
    const value = await a.run(async () => {
      let checked = false;
      try {
        const fresh = await call("migration-batch-adoption", { id: adoption.id });
        if (!alive.current) return false;
        const signature = v => JSON.stringify(v.items.map(i => [i.id, i.ready, i.fileStatus, i.configurationStatus, i.path, i.skillName]));
        if (fresh.materialStatus === "unavailable" || signature(fresh) !== signature(adoption) || (kind === "command" ? fresh.startCommand : fresh.prompt) !== text) {
          setAdoption(fresh);
          setUseNotice({text:"材料或配置状态已变化，已重新核对；请检查当前内容后再复制。",error:true});
          return false;
        }
        checked = true;
        await copyText(text);
        return true;
      } catch {
        if (alive.current) {
          if (!checked) setAdoption(old => ({...old, materialStatus:"unavailable", prompt:"", startCommand:null, items:old.items.map(i => ({...i,ready:false,fileStatus:"unavailable",reason:"复制前核对未完成，请重新查询"}))}));
          setUseNotice({
            text: checked ? "复制失败，请在当前页面选中完整文本手动复制。" : "材料核对未完成，已停用旧接手提示；请重新核对后再复制。",
            error: true,
          });
        }
        return false;
      }
    });
    if (value && alive.current)
      setUseNotice({
        text:
          kind === "command"
            ? "已复制目标启动命令，尚未执行。"
            : "已复制接手提示。请交给上方目标 AI；尚未发送，也未确认它已读取。",
        error: false,
      });
  }
  const locked =
    a.busy ||
    unresolved ||
    pendingIds.length > 0 ||
    (!!target && !pendingReady);
  return (
    <Dialog
      title="Agent 迁移"
      drawer
      recoverFocus
      onClose={() => !a.isBusy() && onClose()}
    >
      <div className="capability-console agent-write-console agent-migration">
        <p>
          把已有积累带到另一个已登记目标。源文件保留；先选内容、检查变化，再确认写入。
        </p>
        <p>
          当前支持已登记的 Codex / Hermes CLI
          Home。指令会转换作用域，需检查；记忆和连接保存为独立参考文件，不改原生记忆库，不启用连接。Skill
          复制后需确认目标已加载。完成后点「开始使用」，核对文件并取得带有精确位置的接手提示。
        </p>
        {!targets.length && (
          <p role="status">
            还没有可迁移的管理目标。先在伙伴「配置」中登记程序和 Home。
          </p>
        )}
        <Button secondary onClick={onConfigure} disabled={a.busy}>
          去登记管理目标
        </Button>
        <fieldset className="agent-write-choices" disabled={locked}>
          <legend>迁移来源</legend>
          <PageChoices
            label="迁移来源"
            value={source}
            onChange={(id) => {
              setSource(id);
              if (id === target) setTarget("");
              reset();
            }}
            choices={targets.map((t) => [t.id, t.label + " · " + t.agentId])}
          />
        </fieldset>
        <fieldset className="agent-write-choices" disabled={locked}>
          <legend>迁移目标</legend>
          <PageChoices
            label="迁移目标"
            value={target}
            onChange={(id) => {
              setTarget(id);
              setPlan(null);
              setResult(null);
              setRows(null);
              setUnresolved(false);
              clearAdoption();
            }}
            choices={targets
              .filter((t) => t.id !== source)
              .map((t) => [t.id, t.label + " · " + t.agentId])}
          />
        </fieldset>
        {target && (migrationPending.error || recoveryPending.error) && (
          <p role="alert" className="inline-error">
            {migrationPending.error || recoveryPending.error}
            仍可读取历史记录核对。
          </p>
        )}
        <Button secondary disabled={!source || locked} onClick={read}>
          {a.busy ? "正在核对…" : "读取来源内容"}
        </Button>
        {!capture && (
          <p>
            尚未读取；点击后只读取所选 Home 的指令、参考记忆、独立 Skill
            与公开连接定义。
          </p>
        )}
        {capture && !plan && !result && (
          <>
            <p>
              已选 {Object.keys(selected).length} 项，最多 16 项。
              {capture.skillError}
            </p>
            {Object.entries(labels).map(([type, label]) => (
              <section key={type} aria-label={label}>
                <h3>{label}</h3>
                {!capture.items.some((i) => i.type === type) && (
                  <p>本次读取未发现这一类内容。</p>
                )}
                {capture.items
                  .filter((i) => i.type === type)
                  .map((i) => (
                    <div className="migration-item" key={i.id}>
                      <label>
                        <input
                          type="checkbox"
                          aria-label={`迁移 ${i.name}`}
                          checked={!!selected[i.id]}
                          disabled={
                            locked ||
                            !i.actionable ||
                            (!selected[i.id] &&
                              Object.keys(selected).length >= 16)
                          }
                          onChange={(e) => {
                            setSelected((s) => {
                              const n = { ...s };
                              if (e.target.checked) n[i.id] = "skip";
                              else delete n[i.id];
                              return n;
                            });
                            setPlan(null);
                          }}
                        />
                        <strong>{i.name}</strong>
                      </label>
                      {i.preview && <p>{i.preview}</p>}
                      {i.reason && <p>{i.reason}</p>}
                      {selected[i.id] && type !== "capability" && (
                        <label>
                          已导入时{" "}
                          <select
                            aria-label={`${i.name} 冲突处理`}
                            value={selected[i.id]}
                            disabled={locked}
                            onChange={(e) => {
                              setSelected((s) => ({
                                ...s,
                                [i.id]: e.target.value,
                              }));
                              setPlan(null);
                            }}
                          >
                            <option value="skip">保留目标，跳过</option>
                            <option value="replace">仅更新本来源托管区</option>
                          </select>
                        </label>
                      )}
                      {type === "capability" && (
                        <small>同名目标保留；共享池和链接不复制。</small>
                      )}
                    </div>
                  ))}
              </section>
            ))}
            <Button
              disabled={locked || !target || !Object.keys(selected).length}
              onClick={preview}
            >
              预览迁移计划
            </Button>
          </>
        )}
        {plan && (
          <section aria-label="迁移计划">
            <h3 ref={stage} tabIndex={-1}>
              确认本次变化
            </h3>
            <p>
              {plan.recovery ? "恢复目标：" : `${plan.source} → `}
              {plan.target}
              。逐项执行并回读，任一结果不明会停止后续项。
            </p>
            <dl className="migration-target-details">
              <dt>目标程序</dt>
              <dd>
                {targets.find((item) => item.id === target)?.program.path}
              </dd>
              <dt>目标 Home</dt>
              <dd>{targets.find((item) => item.id === target)?.home.path}</dd>
            </dl>
            {plan.items.map((i, n) => (
              <div key={i.id || n}>
                {i.changes?.filter(c => c.action === "create_skill_root").map((c,n) => <p key={`root-${n}`}>目标还没有技能目录。本次确认后会在所选 Home 下创建 skills 文件夹，再复制技能。</p>)}
                {i.kind === "skipped" ? (
                  <p>
                    {i.name} · 跳过：{i.reason}
                  </p>
                ) : plan.recovery && !i.file ? (
                  <div className="capability-preview">
                    <strong>{i.name}</strong>
                    <p>将本次复制的独立 Skill 移入停用目录；来源副本保留。</p>
                    <details>
                      <summary>查看位置变化</summary>
                      {i.changes?.map((c, n) => (
                        <p key={n}>
                          {c.before} → {c.after}
                        </p>
                      ))}
                    </details>
                  </div>
                ) : (
                  <CapabilityPreview
                    plan={{
                      action: i.name,
                      target: i.file || plan.target,
                      changes: i.changes,
                      before: i.before,
                      after: i.after,
                    }}
                  />
                )}
                {i.file === "SOUL.md" && !plan.recovery && (
                  <p>
                    将来源规则追加为 Hermes
                    全局个性参考，作用域可能不同，请逐条确认适用性。
                  </p>
                )}
                {i.setupRequired && (
                  <p>
                    写入后点「开始使用」，取得交给目标 Agent
                    的接手提示；此处不会自动加载或连接。
                  </p>
                )}
                {i.reason && <p>{i.reason}</p>}
              </div>
            ))}
            {!plan.enabled && (
              <div role="status">
                <p>Agent 写入当前关闭。可先审阅，去设置开启后重新生成预览。</p>
                <Button
                  secondary
                  onClick={() => {
                    onClose();
                    location.hash = "settings";
                  }}
                >
                  去设置 Agent 写入
                </Button>
              </div>
            )}
            <div className="form-actions">
              <Button secondary disabled={a.busy} onClick={() => setPlan(null)}>
                取消迁移预览
              </Button>
              <Button
                disabled={
                  a.busy ||
                  !plan.enabled ||
                  !pendingReady ||
                  (plan.recovery
                    ? !!recoveryPending.id
                    : unresolved || pendingIds.length > 0)
                }
                onClick={apply}
              >
                {plan.recovery ? "确认撤回本次迁移内容" : "确认本次迁移"}
              </Button>
            </div>
          </section>
        )}
        {a.error && (
          <p role="alert" className="inline-error">
            {a.error}
          </p>
        )}
        {result && (
          <section aria-label="迁移结果">
            <h3 ref={stage} tabIndex={-1}>
              {result.recovery ? "撤回结果" : "迁移结果"}
            </h3>
            <CapabilityResult
              result={{
                ...result,
                operationId: result.id,
                status:
                  result.status === "running"
                    ? "正在执行，请稍后查询"
                    : result.status === "partial"
                      ? "部分项未完成或已变化，请核对"
                      : result.status,
              }}
            />
            <ul>
              {result.items?.map((i, n) => (
                <li key={i.id || n}>
                  <strong>{i.name}</strong> · {status[i.status] || i.status}
                  {i.reason && <p>{i.reason}</p>}
                  {i.id && i.status === "matches_after" && !result.recovery && (
                    <Button
                      secondary
                      disabled={
                        a.busy ||
                        result.running ||
                        !pendingReady ||
                        !!recoveryPending.id
                      }
                      onClick={() => restore(i)}
                    >
                      预览撤回 {i.name}
                    </Button>
                  )}
                </li>
              ))}
            </ul>
            <Button secondary disabled={a.busy} onClick={() => check()}>
              {result.recovery ? "重新核对本次撤回结果" : "查询本次迁移结果"}
            </Button>
            {!result.recovery && (
              <Button
                type="button"
                disabled={a.busy || result.running}
                onClick={() => startUsing(result.id)}
                aria-label="开始使用本次迁移内容"
              >
                开始使用
              </Button>
            )}
            {!locked && result.status === "partial" && (
              <Button
                secondary
                onClick={() => {
                  setResult(null);
                  setPlan(null);
                  clearAdoption();
                }}
              >
                返回选择，重新预览未完成项
              </Button>
            )}
            {unresolved && (
              <p>
                本次结果尚未全部确认，已停止新的写入。保留原编号查询；不会重复执行。
              </p>
            )}
          </section>
        )}
        {adoption && (
          <AdoptionReview
            value={adoption}
            busy={a.busy}
            notice={useNotice}
            onCopy={copyForTarget}
            onRefresh={() => startUsing(adoption.id)}
            headingRef={adoptionHeading}
          />
        )}
        {pendingIds.map((id) => (
          <section
            aria-label={id === recoveryPending.id ? "未决撤回" : "未决迁移"}
            key={id}
          >
            <p>
              {id === recoveryPending.id ? "撤回" : "原迁移批次"}
              仍需核对，编号：{id}
              。关闭后重新选择此目标，仍可继续核对；不会重复执行。
            </p>
            <Button
              secondary
              disabled={a.busy}
              onClick={() =>
                check(id, id === recoveryPending.id ? "restore" : "migration")
              }
            >
              {id === recoveryPending.id
                ? "重新核对未决撤回"
                : "查询原未决迁移"}
            </Button>
          </section>
        ))}
        {target && (
          <section aria-label="迁移记录">
            <Button
              secondary
              disabled={a.busy}
              onClick={async () => {
                const v = await a.run(() =>
                  call("migration-batch-history", { targetId: target }),
                );
                if (v) setRows(v.items);
              }}
            >
              读取目标迁移记录
            </Button>
            {rows?.length === 0 && <p>还没有迁移记录。</p>}
            {rows?.map((r) => (
              <div key={r.id}>
                <p>
                  {r.kind === "restore" ? "撤回记录" : "迁移记录"} · {r.at} ·{" "}
                  {r.items.length} 项
                </p>
                <p>编号：{r.id}。历史记录尚未核对当前文件。</p>
                <div className="heading-actions">
                  <Button
                    secondary
                    disabled={a.busy}
                    onClick={() => check(r.id, r.kind)}
                  >
                    {r.kind === "restore" ? "重新核对撤回" : "查询迁移"} {r.id}
                  </Button>
                  {r.kind !== "restore" && (
                    <Button
                      type="button"
                      disabled={a.busy}
                      onClick={() => startUsing(r.id)}
                      aria-label={`开始使用历史迁移 ${r.id}`}
                    >
                      开始使用
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </section>
        )}
      </div>
    </Dialog>
  );
}
