// 智能体群 · 内容清单与体检摘要（产品定义 v1.2 §4.3；G3）。
// 每个已检测、支持清单的 Agent 一张卡：展开时才只读读取，按 Skill / 配置文件 / 插件 / MCP 分组。
// 单项开关只预览“将要做什么”，不执行；“存入资产仓库”交给现有“收录本机 Skill”流程（预览 → 确认 → 回读）。
// 角色卡（F4，silver-agents 分支）挂在每张卡的 .agent-contents-top 右侧，本文件不实现。
import React, { useRef, useState } from "react";
import { ChevronDown, PackagePlus, RefreshCw, ToggleRight } from "lucide-react";
import { Badge, Button, Dialog } from "./components.jsx";
import { request } from "./api.js";
import "./agent-contents.css";

export const CONTENT_AGENT_IDS = ["codex", "claude-code", "hermes", "openclaw"];
const SOURCE = {
  pool: "共享池链接",
  copy: "独立副本",
  broken: "失效链接",
  link: "外部链接",
  unreadable: "无法读取",
};
const GROUP_STATUS = {
  missing: "未发现",
  unreadable: "无法读取",
  blocked: "无法读取",
  not_read: "未读取",
};
const sourceLabel = (item) =>
  item.native ? "共享池（Codex 原生读取）" : SOURCE[item.source] || "未知";
function matchText(match) {
  switch (match?.status) {
    case "same":
      return `与资产仓库「${match.assetTitle}」当前版本同内容`;
    case "older":
      return `与仓库「${match.assetTitle}」第 ${match.versionNumber} 版同内容，落后于第 ${match.currentNumber} 版`;
    case "drift":
      return `与仓库「${match.assetTitle}」有来源关系，但内容不一致`;
    case "none":
      return "资产仓库未收录同内容";
    default:
      return "未比对内容";
  }
}
const time = (value) => new Date(value).toLocaleString("zh-CN");

export function HealthSummary({ result }) {
  if (!result)
    return (
      <p className="agent-contents-health" role="status">
        尚未体检 · 展开清单时只读读取
      </p>
    );
  const h = result.health;
  return (
    <p className="agent-contents-health" role="status">
      <Badge tone={h.brokenLinks ? "danger" : "muted"}>
        失效链接 {h.brokenLinks}
      </Badge>
      <Badge tone={h.drift ? "warning" : "muted"}>与仓库不一致 {h.drift}</Badge>
      <Badge tone={h.unreadable ? "warning" : "muted"}>
        无法读取 {h.unreadable}
      </Badge>
      <small>检查于 {time(result.at)}</small>
    </p>
  );
}

function GroupState({ group }) {
  if (group.status === "ok") return null;
  return (
    <p
      className={`agent-contents-state ${group.status === "not_read" ? "" : "warn"}`}
    >
      {GROUP_STATUS[group.status] || "无法读取"}
      {group.reason ? ` · ${group.reason}` : ""}
    </p>
  );
}

function SkillRow({ item, onToggle, onStore }) {
  const store = item.store && item.match?.status !== "same";
  return (
    <li className="agent-content-item">
      <div className="agent-content-main">
        <strong>{item.name}</strong>
        <Badge
          tone={
            item.source === "broken"
              ? "danger"
              : item.source === "unreadable"
                ? "warning"
                : "muted"
          }
        >
          {sourceLabel(item)}
        </Badge>
      </div>
      <span
        className={`agent-content-match ${["older", "drift"].includes(item.match?.status) ? "warn" : ""}`}
      >
        {matchText(item.match)}
      </span>
      <code>
        {item.path}
        {item.target ? ` → ${item.target}` : ""}
      </code>
      {(item.reason || item.readError) && (
        <small className="detail-footnote">{item.readError || item.reason}</small>
      )}
      <div className="agent-content-actions">
        <Button
          secondary
          aria-label={`开关预览：${item.name}`}
          onClick={() => onToggle(item)}
        >
          <ToggleRight size={15} />
          开关预览
        </Button>
        {store && (
          <Button
            secondary
            aria-label={`存入资产仓库：${item.name}`}
            onClick={() => onStore(item.store)}
          >
            <PackagePlus size={15} />
            存入资产仓库
          </Button>
        )}
      </div>
    </li>
  );
}

function TogglePreview({ agentName, item, onClose }) {
  const plan = item.toggle;
  return (
    <Dialog title="开关预览" onClose={onClose}>
      <div className="asset-form agent-toggle-preview">
        <h2>
          {agentName} · {item.name}
        </h2>
        <p className="detail-footnote">
          当前在 {agentName} 的发现目录中；是否被 Agent 实际加载未验证。
        </p>
        {plan.action === "move" ? (
          <dl className="agent-toggle-plan">
            <dt>停用将移动</dt>
            <dd>
              <code>{plan.from}</code>
            </dd>
            <dt>移动到</dt>
            <dd>
              <code>{plan.to}</code>
            </dd>
          </dl>
        ) : (
          <p className="agent-contents-state warn">
            {plan.action === "blocked" ? "不在单个 Agent 开关里处理" : "没有可执行的停用动作"}
          </p>
        )}
        <p>{plan.effect}</p>
        {plan.restore && <p className="detail-footnote">恢复：{plan.restore}</p>}
        <p className="agent-toggle-authorization" role="note">
          {plan.authorization}
        </p>
        <div className="heading-actions">
          <Button secondary onClick={onClose}>
            关闭预览
          </Button>
        </div>
      </div>
    </Dialog>
  );
}

function ContentsCard({ agent, result, onResult, onStore }) {
  const [open, setOpen] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [toggle, setToggle] = useState(null),
    // 展开时发起的重读返回前，不把上一次结果当作当前清单显示（读取失败时再退回上次结果）。
    [stale, setStale] = useState(false);
  const lock = useRef(false);
  const bodyId = `agent-contents-${agent.id}`;
  async function load() {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setError("");
    try {
      onResult(await request("/agent-contents", { agentId: agent.id }));
    } catch (e) {
      setError(e.message || "读取失败");
    } finally {
      lock.current = false;
      setBusy(false);
      setStale(false);
    }
  }
  const groups = result?.groups;
  return (
    <article
      className="agent-contents-card"
      aria-labelledby={`${bodyId}-title`}
      aria-busy={busy}
    >
      <div className="agent-contents-top">
        <h3 id={`${bodyId}-title`}>{agent.name}</h3>
        <HealthSummary result={result} />
      </div>
      <div className="heading-actions">
        <Button
          secondary
          aria-expanded={open}
          aria-controls={bodyId}
          onClick={() => {
            setOpen(!open);
            // 每次展开都重新只读读取，避免把收录、清理之前的旧结果当成当前事实。
            if (!open) {
              setStale(true);
              load();
            }
          }}
        >
          <ChevronDown size={15} className={open ? "flip" : ""} />
          {open ? "收起清单" : "展开清单"}
        </Button>
        {open && (
          <Button secondary disabled={busy} onClick={load}>
            <RefreshCw size={15} className={busy ? "spinning" : ""} />
            {busy ? "读取中…" : "重新读取"}
          </Button>
        )}
      </div>
      {error && (
        <p className="inline-error" role="alert">
          {error}
          {result ? " · 下方为上次结果" : ""}
        </p>
      )}
      {open && (
        <div id={bodyId} className="agent-contents-body">
          {(!result || stale) && busy && (
            <p className="detail-footnote">正在只读读取…</p>
          )}
          {groups && !stale && (
            <>
              <section aria-label={`${agent.name} · Skill`}>
                <h4>
                  Skill <small>{groups.skills.items.length}</small>
                </h4>
                <GroupState group={groups.skills} />
                {groups.skills.errors
                  ?.filter((e) => e.path !== groups.skills.root)
                  .map((e) => (
                    <p className="agent-contents-state warn" key={e.path}>
                      {GROUP_STATUS[e.status] || "无法读取"} · {e.path} · {e.reason}
                    </p>
                  ))}
                <ul className="agent-content-list">
                  {groups.skills.items.map((item) => (
                    <SkillRow
                      key={item.id}
                      item={item}
                      onToggle={setToggle}
                      onStore={onStore}
                    />
                  ))}
                </ul>
              </section>
              <section aria-label={`${agent.name} · 配置文件`}>
                <h4>
                  配置文件 <small>{groups.configs.items.length}</small>
                </h4>
                <GroupState group={groups.configs} />
                <ul className="agent-content-list compact">
                  {groups.configs.items.map((item) => (
                    <li className="agent-content-item" key={item.path}>
                      <div className="agent-content-main">
                        <strong>{item.name}</strong>
                        <Badge tone={item.status === "present" ? "muted" : "warning"}>
                          {item.status === "present"
                            ? `${item.bytes} 字节`
                            : item.status === "missing"
                              ? "未发现"
                              : "无法读取"}
                        </Badge>
                      </div>
                      <code>{item.path}</code>
                    </li>
                  ))}
                </ul>
                <p className="detail-footnote">只读文件元数据，不读取配置正文；配置文件不提供开关。</p>
              </section>
              <section aria-label={`${agent.name} · 插件`}>
                <h4>
                  插件 <small>{groups.plugins.items.length}</small>
                </h4>
                <GroupState group={groups.plugins} />
                <ul className="agent-content-list">
                  {groups.plugins.items.map((item) => (
                    <li className="agent-content-item" key={item.id}>
                      <div className="agent-content-main">
                        <strong>{item.name}</strong>
                        <Badge tone="muted">
                          {{ directory: "目录", file: "文件", link: "链接" }[item.kind] || "未知"}
                        </Badge>
                      </div>
                      <code>{item.path}</code>
                      <div className="agent-content-actions">
                        <Button
                          secondary
                          aria-label={`开关预览：${item.name}`}
                          onClick={() => setToggle(item)}
                        >
                          <ToggleRight size={15} />
                          开关预览
                        </Button>
                      </div>
                    </li>
                  ))}
                </ul>
              </section>
              <section aria-label={`${agent.name} · MCP`}>
                <h4>MCP</h4>
                <GroupState group={groups.mcp} />
              </section>
              {result.truncated && (
                <p className="scan-notice" role="alert">
                  条目较多，本次只列出前一部分；不将其视为完整清单。
                </p>
              )}
            </>
          )}
        </div>
      )}
      {toggle && (
        <TogglePreview
          agentName={agent.name}
          item={toggle}
          onClose={() => setToggle(null)}
        />
      )}
    </article>
  );
}

export function AgentContents({ agents, results, onResult, onStore }) {
  const shown = agents.filter(
    (a) => a.status === "detected" && CONTENT_AGENT_IDS.includes(a.id),
  );
  return (
    <section
      id="agent-contents"
      className="agent-contents"
      aria-labelledby="agent-contents-title"
    >
      <div className="section-title">
        <span className="section-index">清</span>
        <h2 id="agent-contents-title">内容清单</h2>
        <p>
          Skill、配置文件、插件、MCP 分组列出，并做只读体检；开关只预览，不写入。
        </p>
      </div>
      <div className="agent-contents-grid">
        {shown.map((agent) => (
          <ContentsCard
            key={agent.id}
            agent={agent}
            result={results[agent.id]}
            onResult={(value) => onResult(agent.id, value)}
            onStore={onStore}
          />
        ))}
      </div>
      {!shown.length && (
        <p className="detail-footnote">
          还没有检测到支持内容清单的 Agent（Codex、Claude Code、Hermes、OpenClaw）。
        </p>
      )}
      <p className="detail-footnote">
        豆包工作等其他 Agent 暂只做安装检测。清单只在本机读取，不读取凭据、会话或配置正文。
      </p>
    </section>
  );
}
