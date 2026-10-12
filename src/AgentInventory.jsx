import { Reading, ReadReveal } from './ScanMotion.jsx';
import React, { useEffect, useRef, useState } from "react";
import { Copy, RefreshCw } from "lucide-react";
import { Badge, Button, Dialog } from "./components.jsx";
import { request } from "./api.js";
import { copy } from "./Assets.jsx";
import { AgentTargets } from "./AgentTargets.jsx";

const directoryLabel = {
  present: "发现目录",
  missing: "未发现",
  blocked: "读取受阻",
};
function Errors({ items }) {
  return (
    items?.length > 0 && (
      <div className="scan-notice" role="alert">
        {items.map((item, index) => (
          <p key={index}>
            {item.path} · {item.message}
          </p>
        ))}
      </div>
    )
  );
}

export function AgentInventory({
  agent,
  labels,
  notify,
  onClose,
  state,
  adoptState,
  onSelect,
}) {
  const supported = ["codex", "hermes"].includes(agent.id);
  const [result, setResult] = useState(null);
  const [busy, setBusy] = useState(supported);
  const [error, setError] = useState("");
  const [incomplete, setIncomplete] = useState(null);
  const [programEvidence, setProgramEvidence] = useState(null);
  const programs = programEvidence?.programs || agent.programs;
  const sequence = useRef(0);
  const lock = useRef(false);
  async function refresh() {
    if (lock.current) return;
    lock.current = true;
    const ticket = ++sequence.current;
    setBusy(true);
    setError("");
    try {
      const value = await request("/agent-inventory", { agentId: agent.id });
      if (sequence.current === ticket) {
        if (value.errors.length || value.truncated) {
          setIncomplete({ ...value, stale: !!result });
          if (!result) setResult(value);
        } else {
          setIncomplete(null);
          setResult(value);
        }
      }
    } catch (e) {
      if (sequence.current === ticket) {
        setError(e.message);
        setIncomplete(null);
      }
    } finally {
      if (sequence.current === ticket) {
        setBusy(false);
        lock.current = false;
      }
    }
  }
  useEffect(() => {
    if (supported) refresh();
    return () => {
      sequence.current++;
      lock.current = false;
    };
  }, [agent.id]);
  return (
    <Dialog title={agent.name} drawer onClose={onClose}>
      <div className="asset-form agent-inventory">
        <ReadReveal pending={busy} ready={!!result&&!error&&!incomplete}/>
        <div className="agent-inventory-title">
          <h2>{agent.name}</h2>
          <Badge tone="muted">{labels[agent.status]}</Badge>
        </div>
        <div className="agent-evidence-strip">
          <span>
            运行 <strong>未验证</strong>
          </span>
          <span>
            连接 <strong>未验证</strong>
          </span>
          <span>
            Skill 启用 <strong>未验证</strong>
          </span>
        </div>
        {!!agent.errors?.length && (
          <div className="scan-notice" role="alert">
            {agent.errors.map((message, index) => (
              <p key={index}>{message}</p>
            ))}
            <p>入口检测受阻，保留上次已知位置。</p>
          </div>
        )}
        <section className="agent-inventory-section" aria-label="程序入口">
          <h3>
            程序入口 <small>{programs.length}</small>
          </h3>
          {programs.map((program) => {
            const index = agent.programs.findIndex(
              (p) => p.path === program.path && p.kind === program.kind,
            );
            const evidence = programEvidence?.programs.find(
              (p) => p.path === program.path && p.kind === program.kind,
            );
            const version = evidence?.version;
            return (
              <details className="agent-program" key={program.path}>
                <summary>
                  {program.kind} ·{" "}
                  {program.path.split("/").filter(Boolean).at(-1)}
                  {program.status === "missing"
                    ? " · 入口缺失"
                    : program.status === "blocked"
                      ? " · 读取受阻"
                      : ""}
                  <span>
                    {programEvidence?.stale
                      ? "上次版本 · 未更新"
                      : version?.status === "known"
                        ? `${version.source} ${version.value}`
                        : programEvidence && !evidence
                          ? "此次未发现入口"
                          : "版本未核验"}
                  </span>
                </summary>
                <code>{program.path}</code>
                {version && (
                  <div className="agent-version-evidence">
                    {version.message && (
                      <p className="detail-footnote">{version.message}</p>
                    )}
                    {version.evidencePath && (
                      <code>依据：{version.evidencePath}</code>
                    )}
                    {evidence.containerVersion?.status === "known" && (
                      <p className="detail-footnote">
                        所属 App {evidence.containerVersion.value} · 不代表 CLI
                        版本
                      </p>
                    )}
                  </div>
                )}
                <div className="heading-actions">
                  <Button secondary onClick={() => copy(program.path, notify)}>
                    复制路径
                  </Button>
                  {index >= 0 && (
                    <Button
                      secondary
                      onClick={async () => {
                        try {
                          await request("/reveal", {
                            kind: "agent",
                            id: agent.id,
                            index,
                          });
                        } catch (e) {
                          notify(e.message, "error");
                        }
                      }}
                    >
                      在 Finder 中显示
                    </Button>
                  )}
                </div>
              </details>
            );
          })}
          {!programs.length && (
            <p className="detail-footnote">
              {agent.configFound
                ? "仅发现配置痕迹，未检测到程序。"
                : "支持的安装位置未发现程序。"}
            </p>
          )}
        </section>
        {supported && (
          <AgentTargets
            agentId={agent.id}
            state={state}
            adoptState={adoptState}
            notify={notify}
            onEvidence={setProgramEvidence}
            onSelect={onSelect}
          />
        )}
        <section
          className="agent-inventory-section"
          aria-label="目录与资产"
          aria-busy={busy}
        >
          <div className="workflow-reference-heading">
            <h3>目录与资产</h3>
            {supported && (
              <Button secondary disabled={busy} onClick={refresh}>
                <RefreshCw size={15}  />
                {busy ? <Reading mini label="读取目录"/> : "刷新目录"}
              </Button>
            )}
          </div>
          {!supported ? (
            <p className="detail-footnote">此 Agent 暂仅支持入口检测。</p>
          ) : (
            <>
              <p className="detail-footnote" role="status">
                {busy
                  ? <Reading label="正在读取目录元数据"/>
                  : error && result
                    ? "上次结果 · 刷新未成功"
                    : incomplete
                      ? incomplete.stale
                        ? "上次结果 · 目录检查未完成"
                        : "检查未完成 · 仅显示部分结果"
                      : result
                        ? `检查于 ${new Date(result.at).toLocaleString("zh-CN")}`
                        : "尚未取得目录信息"}
              </p>
              {error && (
                <p className="inline-error" role="alert">
                  {error} · 请重试刷新目录。
                </p>
              )}
              {result && (
                <>
                  <Errors items={(incomplete || result).errors} />
                  {(incomplete || result).truncated && (
                    <p className="scan-notice" role="alert">
                      本次目录较多，检查未完成；请刷新重试，不将现有结果视为当前完整清单。
                    </p>
                  )}
                  {result.homes.map((home) => (
                    <section
                      className="agent-home"
                      key={home.id}
                      aria-label={home.label}
                    >
                      <div className="workflow-reference-heading">
                        <strong>{home.label}</strong>
                        <Badge tone="muted">
                          {directoryLabel[home.status] || "未知"}
                        </Badge>
                      </div>
                      <small className="detail-footnote">{home.source}</small>
                      <div className="agent-home-path">
                        <code>{home.path}</code>
                        <button
                          className="icon-button"
                          aria-label={`复制 ${home.label} 路径`}
                          onClick={() => copy(home.path, notify)}
                        >
                          <Copy size={15} />
                        </button>
                      </div>
                      <Errors items={home.errors} />
                      {home.skills.map((skill) => (
                        <div className="agent-skill-root" key={skill.path}>
                          <div>
                            <strong>{skill.label}</strong>
                            <span>
                              {skill.scope} ·{" "}
                              {directoryLabel[skill.status] || "未知"}
                            </span>
                          </div>
                          <code>{skill.path}</code>
                        </div>
                      ))}
                    </section>
                  ))}
                  {!result.homes.length &&
                    !result.errors.length &&
                    !incomplete && (
                      <p className="detail-footnote">
                        此次检查没有可展示的目录。
                      </p>
                    )}
                </>
              )}
              <p className="detail-footnote">
                仅限本机 · 目录发现不代表活动实例；未读取配置、凭据或会话。
              </p>
            </>
          )}
        </section>
      </div>
    </Dialog>
  );
}
