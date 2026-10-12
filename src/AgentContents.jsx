import { Reading, ReadReveal } from './ScanMotion.jsx';
// 智能体群 · 内容清单与体检摘要（产品定义 v1.2 §4.3；G3）。
// 每个已检测、支持清单的 Agent 一张卡：展开时才只读读取，按 Skill / 配置文件 / 插件 / MCP 分组。
// Codex/Hermes 单项开关进入已登记目标的受控入口，默认关闭，预览后人工确认；其他 Agent 仍只预览。
// 角色卡（F4）挂在每张卡的 .agent-contents-top 右侧，本文件不实现。
import React, { useEffect, useRef, useState } from "react";
import { ChevronDown, RefreshCw, ToggleRight } from "lucide-react";
import { Badge, Button, Dialog } from "./components.jsx";
import { request } from "./api.js";
import "./agent-contents.css";
import { AgentContentDrawer, AgentWriteLaunch } from "./AgentWriteUI.jsx";

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

function CompactRow({ name, badge, tone = "muted", path, details, onToggle }) {
  return <li className="agent-content-item compact-row">
    <details>
      <summary title={`查看 ${name} 的详情`}>
        <strong title={name}>{name}</strong>
        <Badge tone={tone}>{badge}</Badge>
        <code title={path}>{path}</code>
      </summary>
      <div className="compact-row-details">{details}</div>
    </details>
    {onToggle && <button type="button" className="compact-toggle" aria-label={`开关预览：${name}`} title="开关预览" onClick={onToggle}><ToggleRight size={18}/></button>}
  </li>;
}

function SkillRow({ item, onToggle, compact = false }) {
  const path = item.path + (item.target ? ` → ${item.target}` : "");
  const tone = item.source === "broken" ? "danger" : item.source === "unreadable" ? "warning" : "muted";
  if (compact) return <CompactRow name={item.name} badge={sourceLabel(item)} tone={tone} path={path} onToggle={() => onToggle(item)} details={<><span className="agent-content-match">{matchText(item.match)}</span>{(item.reason || item.readError) && <small>{item.readError || item.reason}</small>}<code>{path}</code></>}/>;
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

function ContentsCard({ agent, state, result, onResult, focus = 0, roleCard = false }) {
  const [open, setOpen] = useState(false),
    [group, setGroup] = useState("skills"),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [toggle, setToggle] = useState(null),
    // 展开时发起的重读返回前，不把上一次结果当作当前清单显示（读取失败时再退回上次结果）。
    [stale, setStale] = useState(false);
  const [write, setWrite] = useState(null);
  const previewToggle = (item) => ["codex", "hermes"].includes(agent.id) ? setWrite(item) : setToggle(item);
  const lock = useRef(false);
  const card = useRef(null);
  const bodyId = `agent-contents-${agent.id}`;
  // 档案里点“查看内容清单”：滚到这张卡，未展开时展开并只读读取（与点“展开清单”相同）。
  useEffect(() => {
    if (!focus) return;
    card.current?.scrollIntoView({ block: "start" });
    card.current?.querySelector("button")?.focus({ preventScroll: true });
    if (!open) {
      setOpen(true);
      setStale(true);
      load();
    }
  }, [focus]);
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
  const sortedSkills = groups ? [...groups.skills.items].sort((a,b)=>Number(b.source==="broken")-Number(a.source==="broken")) : [];
  const groupNames = { skills: "Skill", configs: "配置", plugins: "插件", mcp: "MCP" };
  return (
    <article
      ref={card}
      data-agent={agent.id}
      className={`agent-contents-card${roleCard ? " role-contents-card" : " m-panel"}`}
      aria-labelledby={`${bodyId}-title`}
      aria-busy={busy}
    >
      <ReadReveal pending={busy} ready={!!result&&!error&&!stale}/>
      <div className={roleCard ? "role-contents-toolbar" : undefined}>
      <div className="agent-contents-top">
        <h3 id={`${bodyId}-title`}>{roleCard ? "内容清单" : agent.name}</h3>
        {!roleCard && <HealthSummary result={result} />}
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
          {roleCard && open ? <span className="sr-only">收起清单</span> : open ? "收起清单" : "展开清单"}
        </Button>
        {open && (
          <Button secondary disabled={busy} onClick={load}>
            {busy ? <Reading mini label="读取目录"/> : <RefreshCw size={15}/>}
            {roleCard ? <span className="sr-only">{busy ? "读取中…" : "重新读取"}</span> : busy ? null : "重新读取"}
          </Button>
        )}
        {!roleCard && ["codex", "hermes"].includes(agent.id) && <AgentWriteLaunch state={state} agentId={agent.id} />}
      </div>
      {roleCard && open && groups && !stale && <>
        <div className="role-content-groups" role="group" aria-label="内容分组">
          {Object.entries(groupNames).map(([key,label])=><button key={key} type="button" aria-pressed={group===key} onClick={()=>setGroup(key)}>{label}<span>{key==="mcp" ? (groups.mcp.status==="ok" ? "已读" : "未读") : groups[key].items.length}</span></button>)}
        </div>
        <h4 className="role-content-group-title">{groupNames[group]}{group!=="mcp" && <small>{groups[group].items.length}</small>}</h4>
      </>}
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
            <p className="detail-footnote"><Reading label="正在只读读取内容清单"/></p>
          )}
          {groups && !stale && (
            <>
              <section aria-label={`${agent.name} · Skill`} hidden={roleCard && group!=="skills"}>
                {!roleCard && <h4>
                  Skill <small>{groups.skills.items.length}</small>
                </h4>}
                <GroupState group={groups.skills} />
                {groups.skills.errors
                  ?.filter((e) => e.path !== groups.skills.root)
                  .map((e) => (
                    <p className="agent-contents-state warn" key={e.path}>
                      {GROUP_STATUS[e.status] || "无法读取"} · {e.path} · {e.reason}
                    </p>
                  ))}
                <ul className="agent-content-list">
                  {(roleCard ? sortedSkills : groups.skills.items).map((item) => (
                    <SkillRow
                      key={item.id}
                      item={item}
                      onToggle={previewToggle}
                      compact={roleCard}
                    />
                  ))}
                </ul>
              </section>
              <section aria-label={`${agent.name} · 配置文件`} hidden={roleCard && group!=="configs"}>
                {!roleCard && <h4>
                  配置文件 <small>{groups.configs.items.length}</small>
                </h4>}
                <GroupState group={groups.configs} />
                <ul className="agent-content-list compact">
                  {groups.configs.items.map((item) => (
                    roleCard ? <CompactRow key={item.path} name={item.name} badge={item.status === "present" ? `${item.bytes} 字节` : item.status === "missing" ? "未发现" : "无法读取"} tone={item.status === "present" ? "muted" : "warning"} path={item.path} details={<code>{item.path}</code>}/> : <li className="agent-content-item" key={item.path}>
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
              <section aria-label={`${agent.name} · 插件`} hidden={roleCard && group!=="plugins"}>
                {!roleCard && <h4>
                  插件 <small>{groups.plugins.items.length}</small>
                </h4>}
                <GroupState group={groups.plugins} />
                <ul className="agent-content-list">
                  {groups.plugins.items.map((item) => (
                    roleCard ? <CompactRow key={item.id} name={item.name} badge={{ directory: "目录", file: "文件", link: "链接" }[item.kind] || "未知"} path={item.path} details={<code>{item.path}</code>} onToggle={()=>previewToggle(item)}/> : <li className="agent-content-item" key={item.id}>
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
                          onClick={() => previewToggle(item)}
                        >
                          <ToggleRight size={15} />
                          开关预览
                        </Button>
                      </div>
                    </li>
                  ))}
                </ul>
              </section>
              <section aria-label={`${agent.name} · MCP`} hidden={roleCard && group!=="mcp"}>
                {!roleCard && <h4>MCP</h4>}
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
      {write && <AgentContentDrawer state={state} agentId={agent.id} initialName={write.name} onClose={() => setWrite(null)} />}
      {roleCard && <p className="detail-footnote">豆包工作等其他 Agent 暂只做安装检测。原清单只读元数据；受控入口按明确选定目标处理白名单配置与独立 Skill 副本，不自动读取私人会话。</p>}
    </article>
  );
}

export function AgentContents({ state, agents, results, onResult, focus = {}, roleCard = false }) {
  const shown = agents.filter(
    (a) => a.status === "detected" && CONTENT_AGENT_IDS.includes(a.id),
  );
  return (
    <section
      id="agent-contents"
      className={`agent-contents${roleCard ? " in-role-card" : ""}`}
      aria-labelledby={roleCard ? undefined : "agent-contents-title"}
      aria-label={roleCard ? "内容清单" : undefined}
    >
      {!roleCard && <div className="v14-sh">
        <h2 id="agent-contents-title">内容清单</h2>
        <span className="v14-sub">原内容清单只读；已登记目标可从受控入口预览、备份、确认、回读与回滚。</span>
      </div>}
      <div className="agent-contents-grid">
        {shown.map((agent) => (
          <ContentsCard
            key={agent.id}
            agent={agent}
            state={state}
            result={results[agent.id]}
            onResult={(value) => onResult(agent.id, value)}
            focus={focus.id === agent.id ? focus.n : 0}
            roleCard={roleCard}
          />
        ))}
      </div>
      {!shown.length && (
        <p className="detail-footnote">
          还没有检测到支持内容清单的 Agent（Codex、Claude Code、Hermes、OpenClaw）。
        </p>
      )}
      {(!roleCard || !shown.length) && <p className="detail-footnote">
        豆包工作等其他 Agent 暂只做安装检测。原清单只读元数据；受控入口按明确选定目标处理白名单配置与独立 Skill 副本，不自动读取私人会话。
      </p>}
    </section>
  );
}
