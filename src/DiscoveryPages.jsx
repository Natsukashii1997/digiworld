import React, { useEffect, useRef, useState } from "react";
import {
  Bot,
  Folder,
  Github,
  Monitor,
  Search,
  RefreshCw,
  Settings2,
  ArrowUpRight,
} from "lucide-react";
import {
  Button,
  Badge,
  Empty,
  PageHeading,
  Dialog,
  Scanning,
} from "./components.jsx";
import { scan, request } from "./api.js";
import { Relay } from "./WorkspacePages.jsx";
import { ProjectContext } from "./ProjectContext.jsx";
import { ProjectLocations } from "./ProjectLocations.jsx";
import { ProjectRules } from "./RuleInstall.jsx";
import { AgentInventory } from "./AgentInventory.jsx";
import { SkillSourceImport } from "./SkillSources.jsx";

const time = (value) =>
  value
    ? new Date(value).toLocaleString("zh-CN", {
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
      })
    : "尚未扫描";
function useDiscovery(kind, state, adoptState, notify) {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const started = useRef(false);
  async function run(data = {}) {
    setBusy(true);
    setError("");
    try {
      const next = await scan(kind, data);
      adoptState(next);
      return next;
    } catch (e) {
      setError(e.message);
      notify(e.message, "error");
      return null;
    } finally {
      setBusy(false);
    }
  }
  useEffect(() => {
    if (
      !started.current &&
      !state.connections?.[
        kind === "projects" ? "projectScannedAt" : "agentScannedAt"
      ]
    ) {
      started.current = true;
      run();
    }
  }, []);
  return { busy, error, run };
}
function Filters({ options, value, onChange }) {
  return (
    <div className="segmented">
      {options.map(([id, label]) => (
        <button
          key={id}
          aria-pressed={id === value}
          className={id === value ? "active" : ""}
          onClick={() => onChange(id)}
        >
          {label}
        </button>
      ))}
    </div>
  );
}
function LegacyRecords({ records }) {
  if (!records.length) return null;
  return (
    <details className="legacy-records">
      <summary>旧登记记录 · {records.length}</summary>
      {records.map((r) => (
        <div key={r.id}>
          <strong>{r.name}</strong>
          <p>{r.location || r.path || r.note || "未验证"}</p>
        </div>
      ))}
    </details>
  );
}
export function Projects({ state, adoptState, notify, ruleInstalls, refreshRuleInstalls }) {
  const { busy, error, run } = useDiscovery(
    "projects",
    state,
    adoptState,
    notify,
  );
  const [filter, setFilter] = useState("all"),
    [query, setQuery] = useState(""),
    [selectedId, setSelectedId] = useState(null),
    [roots, setRoots] = useState(null);
  const c = state.connections,
    all = c?.projects || [];
  const selected = all.find((p) => p.id === selectedId);
  const counts = {
    all: all.length,
    local: all.filter((p) => p.localPaths.length).length,
    github: all.filter((p) => p.githubUrl).length,
    linked: all.filter((p) => p.githubUrl && p.localPaths.length).length,
  };
  const bound = new Set((c?.contextBindings || []).map((b) => b.projectId));
  const projects = all.filter(
    (p) =>
      (filter === "all" ||
        (filter === "local" && p.localPaths.length) ||
        (filter === "github" && p.githubUrl) ||
        (filter === "linked" && p.githubUrl && p.localPaths.length)) &&
      [p.name, p.repoKey, ...p.localPaths]
        .join(" ")
        .toLowerCase()
        .includes(query.toLowerCase()),
  );
  async function editRoots() {
    try {
      const settings = await request("/connections");
      setRoots(settings.roots.join("\n"));
    } catch (e) {
      notify(e.message, "error");
    }
  }
  return (
    <>
      <PageHeading
        page="projects"
        action={
          <div className="heading-actions">
            <Button secondary onClick={editRoots}>
              <Settings2 size={16} />
              扫描目录
            </Button>
            <Button disabled={busy} onClick={() => run()}>
              <RefreshCw size={16} className={busy ? "spinning" : ""} />
              {busy ? "扫描中…" : "扫描项目"}
            </Button>
          </div>
        }
      />
      <div className="source-strip">
        <span>
          <Monitor size={16} />
          本地 · {c?.roots.length ?? 2} 个目录
        </span>
        <span>
          <Github size={16} />
          {c?.github.status === "connected" ? c.github.login : "GitHub 未连接"}
        </span>
        <small>更新于 {time(c?.projectScannedAt)}</small>
      </div>
      {error && (
        <p className="inline-error" role="alert">
          {error}
        </p>
      )}
      {c?.github.message && <p className="scan-notice">{c.github.message}</p>}
      {!!c?.errors.length && (
        <details className="scan-notice">
          <summary>{c.errors.length} 条扫描提示</summary>
          {c.errors.map((e, i) => (
            <p key={i}>{e}</p>
          ))}
        </details>
      )}
      {c?.truncated && (
        <p className="scan-notice warning">
          <strong>结果不完整：</strong>
          已达到扫描数量上限，部分项目没有列出。可在“扫描目录”里缩小范围后重新扫描。
        </p>
      )}
      <div className="discovery-toolbar">
        <Filters
          value={filter}
          onChange={setFilter}
          options={[
            ["all", `全部 ${counts.all}`],
            ["local", `本地 ${counts.local}`],
            ["github", `GitHub ${counts.github}`],
            ["linked", `已关联 ${counts.linked}`],
          ]}
        />
        <label className="discovery-search">
          <Search size={17} />
          <input
            aria-label="搜索项目"
            placeholder="搜索名称、路径"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </label>
      </div>
      {busy && <Scanning label="正在读取目录标记与 GitHub 仓库" />}
      <div className="project-groups">
        {groupProjects(projects, c?.roots || []).map((g, gi) => (
          <section className="project-group" key={g.key}>
            <header className="project-group-head">
              <span className="page-code">{String(gi + 1).padStart(2, "0")}</span>
              <h2>{g.label}</h2>
              <small>{g.hint}</small>
              <span className="count">{g.items.length}</span>
            </header>
            <div className="discovery-list">
              {g.items.map(({ p, rel, parent, depth }) => (
                <button
                  className={`project-discovery-row ${parent ? "nested" : ""}`}
                  style={depth ? { "--depth": depth } : undefined}
                  key={p.id}
                  onClick={() => setSelectedId(p.id)}
                >
                  <span className="discovery-icon">
                    {p.localPaths.length ? (
                      <Folder size={19} />
                    ) : (
                      <Github size={19} />
                    )}
                  </span>
                  <span className="project-row-main">
                    <strong>{p.name}</strong>
                    <span title={p.localPaths[0] || p.repoKey}>{rel}</span>
                    {parent && (
                      <em className="project-parent">位于「{parent}」之内</em>
                    )}
                  </span>
                  <span className="project-row-meta">
                    {bound.has(p.id) && (
                      <Badge tone="success">Current 已连接</Badge>
                    )}
                    {p.localPaths.length > 1 && (
                      <Badge tone="muted">本地 {p.localPaths.length}</Badge>
                    )}
                    {p.githubUrl && p.localPaths.length > 0 && (
                      <Badge tone="muted">GitHub</Badge>
                    )}
                    {p.private && <Badge tone="muted">私有</Badge>}
                    {p.identityConflict && (
                      <Badge tone="warning">项目身份待确认</Badge>
                    )}
                    {!p.seenThisScan && (
                      <Badge tone="warning">本次未检出</Badge>
                    )}
                  </span>
                  <ArrowUpRight size={16} />
                </button>
              ))}
            </div>
          </section>
        ))}
      </div>
      {!projects.length && (
        <Empty
          sprite="koromon"
          title={
            busy ? "正在查找项目…" : query ? "没有匹配的项目" : "未发现项目"
          }
        >
          {busy
            ? "正在读取目录标记与 GitHub 仓库。"
            : "调整扫描目录，或检查 GitHub 登录后重新扫描。"}
        </Empty>
      )}
      <LegacyRecords records={state.projects} />
      {selected && (
        <Dialog
          title={selected.name}
          drawer
          onClose={() => setSelectedId(null)}
        >
          <div className="asset-form">
            <div className="section-head">
              <h2>{selected.name}</h2>
              <Badge tone="muted">{selected.kind || "GitHub"}</Badge>
            </div>
            {selected.description && (
              <p className="body-copy">{selected.description}</p>
            )}
            {selected.branch && (
              <p className="body-copy">分支 · {selected.branch}</p>
            )}
            <ProjectLocations
              key={`locations-${selected.id}`}
              project={selected}
              state={state}
              adoptState={adoptState}
              notify={notify}
            />
            {selected.githubUrl && (
              <a
                className="button secondary external-button"
                href={selected.githubUrl}
                target="_blank"
                rel="noreferrer"
              >
                <Github size={16} />
                打开 GitHub <ArrowUpRight size={15} />
              </a>
            )}
            <p className="detail-footnote">
              本地检测 {time(selected.localSeenAt)} · GitHub 检测{" "}
              {time(selected.githubSeenAt)}
            </p>
            <ProjectContext
              key={`context-${selected.id}`}
              project={selected}
              state={state}
              adoptState={adoptState}
              notify={notify}
            />
            <ProjectRules
              project={selected}
              state={state}
              installs={ruleInstalls}
              refresh={refreshRuleInstalls}
            />
          </div>
        </Dialog>
      )}
      {roots !== null && (
        <Dialog title="扫描目录" onClose={() => setRoots(null)}>
          <form
            className="asset-form"
            onSubmit={async (e) => {
              e.preventDefault();
              const result = await run({
                roots: roots
                  .split("\n")
                  .map((s) => s.trim())
                  .filter(Boolean),
              });
              if (result) setRoots(null);
            }}
          >
            <label>
              本地项目目录（每行一个绝对路径）
              <textarea
                rows={6}
                required
                value={roots}
                onChange={(e) => setRoots(e.target.value)}
              />
            </label>
            <p className="body-copy">
              只读取项目标记和 Git
              远端地址；不读取源码内容，不跟随子目录符号链接。
            </p>
            {error && (
              <p className="inline-error" role="alert">
                {error}
              </p>
            )}
            <Button type="submit" disabled={busy}>
              {busy ? "扫描中…" : "保存并扫描"}
            </Button>
          </form>
        </Dialog>
      )}
    </>
  );
}

export function Agents({ state, adoptState, notify, onSelect }) {
  const { busy, error, run } = useDiscovery(
    "agents",
    state,
    adoptState,
    notify,
  );
  const [filter, setFilter] = useState("detected"),
    [selected, setSelected] = useState(null),
    [importRoot, setImportRoot] = useState(null),
    [relay, setRelay] = useState(false);
  const agents = state.connections?.agents || [];
  const targets = state.connections?.agentTargets || [];
  const selectedAgent = agents.find((agent) => agent.id === selected);
  const labels = {
    detected: "已检测",
    config_only: "配置痕迹",
    not_detected: "未检测",
    unknown: "检测受阻",
  };
  return (
    <>
      <PageHeading
        page="agents"
        action={
          <div className="heading-actions">
            <Button secondary onClick={() => setRelay(true)}>
              上下文接力
            </Button>
            <Button disabled={busy} onClick={() => run()}>
              <RefreshCw size={16} className={busy ? "spinning" : ""} />
              {busy ? "检测中…" : "重新检测"}
            </Button>
          </div>
        }
      />
      <div className="source-strip">
        <span>
          <Monitor size={16} />
          本机应用与命令行入口
        </span>
        <span>覆盖 {agents.length || 11} 种入口 · 检测到不代表已登录或可控制</span>
        <small>更新于 {time(state.connections?.agentScannedAt)}</small>
      </div>
      {error && (
        <p className="inline-error" role="alert">
          {error}
        </p>
      )}
      {busy && <Scanning label="正在检测本机 Agent 程序与配置目录" />}
      <div className="discovery-toolbar">
        <Filters
          value={filter}
          onChange={setFilter}
          options={Object.entries(labels).map(([key, label]) => [
            key,
            `${label} ${agents.filter((a) => a.status === key).length}`,
          ])}
        />
      </div>
      <div className="agent-discovery-grid">
        {agents
          .filter((a) => a.status === filter)
          .map((a) => (
            <button
              className="agent-discovery-card"
              key={a.id}
              onClick={() => setSelected(a.id)}
            >
              <span className="agent-card-top">
                <AgentMark agent={a} />
                <Badge tone={a.status === "unknown" ? "warning" : "muted"}>
                  {labels[a.status]}
                </Badge>
              </span>
              <strong>{a.name}</strong>
              <span className="agent-kind">{a.kind}</span>
              <EvidenceLadder
                agent={a}
                targets={targets.filter((t) => t.agentId === a.id).length}
              />
              <span className="agent-card-foot">
                {a.programs.length
                  ? `${a.programs.length} 个程序入口`
                  : a.configFound
                    ? "仅发现配置目录"
                    : "未发现程序或配置"}
                <ArrowUpRight size={16} />
              </span>
            </button>
          ))}
      </div>
      {!agents.filter((a) => a.status === filter).length && (
        <Empty
          sprite="mecha"
          title={busy ? "正在检测本机 Agent…" : "没有处于这个状态的 Agent"}
        >
          {busy ? "只读取程序与配置目录是否存在，不运行任何 Agent。" : null}
        </Empty>
      )}
      <LegacyRecords records={state.agents} />
      {selectedAgent && !importRoot && (
        <AgentInventory
          key={selectedAgent.id}
          agent={selectedAgent}
          state={state}
          adoptState={adoptState}
          labels={labels}
          notify={notify}
          onClose={() => setSelected(null)}
          onInspectSkills={setImportRoot}
          onSelect={(id) => {
            setSelected(null);
            onSelect(id);
          }}
        />
      )}
      {importRoot && (
        <SkillSourceImport
          state={state}
          adoptState={adoptState}
          notify={notify}
          initialRoots={[importRoot]}
          onClose={() => setImportRoot(null)}
          onSelect={(id) => {
            setSelected(null);
            onSelect(id);
          }}
        />
      )}
      {relay && (
        <Relay
          state={state}
          adoptState={adoptState}
          notify={notify}
          onClose={() => setRelay(false)}
        />
      )}
    </>
  );
}

// 按扫描根目录分组；路径显示为相对根目录，嵌套在其他项目里的目录标出所在项目。
function groupProjects(projects, roots) {
  const trim = (path) => path.replace(/\/$/, "");
  const ordered = [...roots].map(trim).sort((a, b) => b.length - a.length);
  const locals = projects.filter((p) => p.localPaths.length);
  const groups = new Map();
  for (const p of projects) {
    const path = p.localPaths[0];
    const root =
      path && ordered.find((r) => path === r || path.startsWith(r + "/"));
    const key = !path ? "github" : root || "other";
    if (!groups.has(key))
      groups.set(key, {
        key,
        label:
          key === "github"
            ? "仅在 GitHub"
            : key === "other"
              ? "其他位置"
              : root.split("/").filter(Boolean).pop(),
        hint:
          key === "github"
            ? "本机尚未找到对应目录"
            : key === "other"
              ? "不在当前扫描目录内"
              : root,
        items: [],
      });
    // 祖先项目：路径包含本目录的其他项目；扫描目录本身不算父项目。
    const ancestors = path
      ? locals
          .filter(
            (o) =>
              o !== p &&
              trim(o.localPaths[0]) !== root &&
              o.localPaths.some((lp) => path.startsWith(trim(lp) + "/")),
          )
          .sort((a, b) => b.localPaths[0].length - a.localPaths[0].length)
      : [];
    const parent = ancestors[0];
    groups.get(key).items.push({
      p,
      rel: !path
        ? p.repoKey
        : root
          ? path.slice(root.length + 1) || "（扫描目录本身）"
          : path,
      parent: parent?.name,
      depth: Math.min(ancestors.length, 3),
      sort: path || p.repoKey || p.name,
    });
  }
  const rank = (g) =>
    g.key === "github" ? 1e6 : g.key === "other" ? 1e5 : roots.map(trim).indexOf(g.key);
  return [...groups.values()]
    .sort((a, b) => rank(a) - rank(b))
    .map((g) => ({
      ...g,
      items: g.items.sort((a, b) => a.sort.localeCompare(b.sort, "zh")),
    }));
}
// 每个 Agent 一枚像素风标识：名称缩写 + 由 ID 派生的稳定色相。
function AgentMark({ agent }) {
  const words = agent.name.split(/[\s-]+/).filter(Boolean);
  const initials =
    words.length > 1
      ? words.map((w) => w[0]).join("").slice(0, 2)
      : agent.name.slice(0, 2);
  const hue =
    [...agent.id].reduce((h, ch) => (h * 31 + ch.charCodeAt(0)) % 360, 7) || 0;
  return (
    <span className="agent-mark" style={{ "--hue": hue }} aria-hidden="true">
      {initials.toUpperCase()}
    </span>
  );
}
// 证据阶梯：检测到程序 → 已确认管理目标 → 支持受控配置。只按真实数据点亮。
const MANAGED = ["codex", "hermes"];
function EvidenceLadder({ agent, targets }) {
  const steps = [
    [
      agent.programs.length > 0,
      agent.programs.length ? "检测到程序" : agent.configFound ? "仅配置痕迹" : "未检测到",
    ],
    [targets > 0, targets ? `管理目标 ${targets}` : "未设管理目标"],
    [
      MANAGED.includes(agent.id) && targets > 0,
      MANAGED.includes(agent.id)
        ? targets
          ? "可受控配置"
          : "设目标后可受控配置"
        : "暂不支持管理",
    ],
  ];
  return (
    <ol className="evidence-ladder" aria-label="管理证据">
      {steps.map(([on, text], i) => (
        <li key={i} className={on ? "on" : ""}>
          <i aria-hidden="true" />
          {text}
        </li>
      ))}
    </ol>
  );
}
