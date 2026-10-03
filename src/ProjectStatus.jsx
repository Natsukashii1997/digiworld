// 路线 v3 切片 2.1/2.2：在推进项目的状态卡、停滞雷达与安全体检。
// 全部只读：状态来自项目自己的 CURRENT.md 与 Git，工作台不另存第二份 Current，不修改项目文件。
import React, { useEffect, useState } from "react";
import { RefreshCw, Flag, Play } from "lucide-react";
import { Button, Badge } from "./components.jsx";
import { request } from "./api.js";
import { startPrompt, linkText } from "./collab.js";
import { usePromptCopy, PromptDialog, AgentPicker } from "./Collab.jsx";
import { GithubBlock, useGithubPanel } from "./ProjectGithub.jsx";
import "./project-status.css";

const SOFT_LIMIT = 7;
const day = (value) =>
  value
    ? new Date(value).toLocaleString("zh-CN", {
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
      })
    : "未知";

// 项目详情里的“在推进”开关。写入走专用接口并带当前 revision，冲突时如实提示。
export function ActiveToggle({ project, state, adoptState, notify }) {
  const [busy, setBusy] = useState(false);
  const active = project.active === true;
  const count = (state.connections?.projects || []).filter((p) => p.active).length;
  async function toggle() {
    setBusy(true);
    try {
      const next = await request("/project-status/mark", {
        projectId: project.id,
        active: !active,
        revision: state.revision,
      });
      adoptState(next);
      const total = next.connections.projects.filter((p) => p.active).length;
      notify(
        !active
          ? total > SOFT_LIMIT
            ? `已标为在推进。现在有 ${total} 个在推进项目，通常同时推进 1–3 个`
            : "已标为在推进"
          : "已取消在推进",
        !active && total > SOFT_LIMIT ? "warning" : "success",
      );
      // 在推进集合变化后，App 会自动重读状态与体检。
    } catch (e) {
      notify(e.message, "error");
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="project-active-toggle" aria-label="在推进">
      <div>
        <h3>在推进</h3>
        <small>
          {active
            ? "这个项目在“在推进”列表里，显示状态卡、停滞与安全体检。"
            : `标记后显示状态卡、停滞与安全体检。当前 ${count} 个在推进。`}
        </small>
      </div>
      <Button
        secondary={active}
        aria-pressed={active}
        disabled={busy}
        onClick={toggle}
      >
        <Flag size={16} />
        {busy ? "保存中…" : active ? "取消在推进" : "标为在推进"}
      </Button>
    </section>
  );
}

function StallBadge({ activity, days }) {
  if (activity?.state === "stalled")
    return <Badge tone="danger">停滞 {activity.idleDays} 天</Badge>;
  if (activity?.state === "active")
    return <Badge tone="success">{days} 天内有更新</Badge>;
  return <Badge tone="muted">活动时间未知</Badge>;
}

function CurrentBlock({ current }) {
  if (current.state === "absent")
    return (
      <div className="status-empty">
        <strong>未装协同协议</strong>
        <small>
          项目根目录没有 {current.path}。可以在项目详情的“规则”里装入“项目协同协议”模板，由项目自己维护状态表。
        </small>
      </div>
    );
  if (current.state === "error")
    return (
      <div className="status-empty">
        <strong>无法读取</strong>
        <small>{current.message}</small>
      </div>
    );
  if (current.state === "unparsed")
    return (
      <div className="status-empty">
        <strong>无法解析</strong>
        <small>
          {current.path} 开头没有“字段 | 值”形式的协作状态表
          {current.truncated ? "（只读取了文件开头 64 KiB）" : ""}
          。可以按规则模板的状态表格式整理后再看。
        </small>
      </div>
    );
  const f = current.fields;
  const rows = [
    ["状态编号", f.stateId],
    ["当前写入者", f.writer],
    ["唯一下一步", f.next && linkText(f.next)],
    [
      "最新交接",
      f.handoff && (
        <>
          <span>{f.handoff.text}</span>
          {f.handoff.href && <code>{f.handoff.href}</code>}
        </>
      ),
    ],
  ];
  return (
    <>
      <dl className="status-fields">
        {rows.map(([label, value]) => (
          <div key={label}>
            <dt>{label}</dt>
            <dd>{value || <span className="status-missing">缺少此项</span>}</dd>
          </div>
        ))}
      </dl>
      {current.state === "partial" && (
        <small className="status-note">
          状态表缺少 {current.missing.join("、")}，按原文如实显示，不补造。
        </small>
      )}
    </>
  );
}

const CHECK_LABELS = [
  ["remote", "远程备份"],
  ["dirty", "未提交改动"],
  ["sensitive", "敏感文件"],
  ["visibility", "远程可见性"],
];
function checkText(key, check) {
  if (!check || check.state === "unknown")
    return ["muted", check?.message ? `未知 · ${check.message}` : "未知"];
  if (check.state === "n/a") return ["muted", "不适用"];
  if (key === "remote")
    return check.state === "present"
      ? ["success", `有（${check.names.join("、")}）`]
      : ["danger", "没有远程"];
  if (key === "dirty")
    return check.count ? ["warning", `${check.count} 个`] : ["success", "没有"];
  if (key === "sensitive")
    return check.total
      ? ["danger", `${check.total} 个被跟踪：${check.files.join("、")}`]
      : ["success", "没有被跟踪"];
  if (key === "visibility")
    return check.state === "private"
      ? ["success", check.source === "scan" ? `私有（${check.message}）` : "私有"]
      : ["danger", check.source === "scan" ? `公开（${check.message}）` : "公开"];
  return ["muted", "未知"];
}

function SafetyBlock({ safety }) {
  const { checks, issues } = safety;
  return (
    <div className="status-safety" aria-label="安全体检">
      <h4>
        安全体检
        {issues.length ? (
          <Badge tone="danger">{issues.length} 项问题</Badge>
        ) : (
          <Badge tone="muted">未发现问题</Badge>
        )}
      </h4>
      {checks.git.state === "none" ? (
        <p className="status-check danger">项目目录不是 Git 仓库，没有版本记录与远程备份</p>
      ) : checks.git.state === "unknown" ? (
        <p className="status-check muted">
          Git 状态未知{checks.git.message ? ` · ${checks.git.message}` : ""}
        </p>
      ) : (
        <ul>
          {CHECK_LABELS.map(([key, label]) => {
            const [tone, text] = checkText(key, checks[key]);
            return (
              <li key={key} className={`status-check ${tone}`}>
                <span>{label}</span>
                <span>{text}</span>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

// 路线 v3 切片 2.4 一键开工：选 Agent，生成开工口令（项目路径、先读 AGENTS.md 与 CURRENT.md、唯一下一步），
// 确认后复制；复制成功计入协同留痕。项目路径只用服务端校验过的登记目录，不自动打开或执行 Agent。
export function StartWork({ item, adoptState, notify, label = "生成开工口令" }) {
  const [agent, setAgent] = useState("codex");
  const [prompt, setPrompt] = useState(null);
  const copier = usePromptCopy({ adoptState, notify });
  const blocked = !item.root || item.current.state === "error";
  function open() {
    try {
      copier.reset();
      setPrompt({ text: startPrompt(item, agent), agent });
    } catch (e) {
      notify(e.message, "error");
    }
  }
  return (
    <div className="status-start" aria-label="一键开工" role="group">
      <AgentPicker
        id={`start-${item.projectId}`}
        label="开工 Agent"
        value={agent}
        onChange={setAgent}
      />
      <Button secondary disabled={blocked} onClick={open}>
        <Play size={16} />
        {label}
      </Button>
      {prompt && (
        <PromptDialog
          title={`开工口令：${item.name}`}
          lead="确认后复制到剪贴板，并计入这个项目的协同留痕；把口令粘贴给所选 Agent 即可开工，工作台不会替你打开或执行。"
          text={prompt.text}
          copier={copier}
          onClose={() => setPrompt(null)}
          onConfirm={async () => {
            const done = await copier.copy({
              text: prompt.text,
              kind: "start",
              projectId: item.projectId,
              agent: prompt.agent,
              stateId: item.current.fields?.stateId,
            });
            if (done) setPrompt(null);
          }}
        />
      )}
    </div>
  );
}

function StatusCard({ item, days, adoptState, notify, github, githubLoading }) {
  const stalled = item.activity.state === "stalled";
  return (
    <article
      className={`project-status-card ${stalled ? "stalled" : ""}`}
      aria-label={`项目状态卡：${item.name}`}
    >
      <header>
        <h3>{item.name}</h3>
        <StallBadge activity={item.activity} days={days} />
      </header>
      {item.root && <small className="status-root">{item.root}</small>}
      <CurrentBlock current={item.current} />
      <small className="status-note">
        最近活动：
        {item.activity.latestAt
          ? `${day(item.activity.latestAt)}（${item.activity.source === "Git" ? "Git 提交" : "CURRENT 修改"}）`
          : "未知，不当作停滞"}
      </small>
      <SafetyBlock safety={item.safety} />
      <GithubBlock github={github} loading={githubLoading} />
      <StartWork item={item} adoptState={adoptState} notify={notify} />
    </article>
  );
}

// 项目空间顶部的“在推进”区：状态卡、停滞阈值与重新体检。
export function ActiveProjects({ state, adoptState, notify, status, refresh }) {
  const active = (state.connections?.projects || []).filter((p) => p.active);
  const saved = state.connections?.projectStallDays || 7;
  const [days, setDays] = useState(String(saved));
  const [busy, setBusy] = useState(false);
  useEffect(() => setDays(String(saved)), [saved]);
  // 项目空间第二批：GitHub 面板只查在推进项目；集合为空时不发请求。
  const activeIds = active.length ? active.map((p) => p.id).join(",") : "";
  const [github, loadGithub] = useGithubPanel(activeIds);
  const githubOf = (id) => github.items.find((g) => g.projectId === id)?.github;
  if (!active.length)
    return (
      <section className="active-projects" aria-label="在推进项目">
        <div className="active-projects-head">
          <h2>在推进 · 0</h2>
          <small>在项目详情里“标为在推进”，这里会显示状态卡、停滞与安全体检。</small>
        </div>
      </section>
    );
  async function saveDays(e) {
    e.preventDefault();
    const value = Number(days);
    setBusy(true);
    try {
      const next = await request("/project-status/settings", {
        stallDays: value,
        revision: state.revision,
      });
      adoptState(next);
      notify(`停滞阈值已保存为 ${value} 天`);
    } catch (err) {
      notify(err.message, "error");
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="active-projects" aria-label="在推进项目">
      <div className="active-projects-head">
        <h2>在推进 · {active.length}</h2>
        <small>只读取项目自己的 CURRENT.md 与 Git；不修改项目文件。</small>
        <div className="active-projects-tools">
          <form className="stall-form" onSubmit={saveDays}>
            <label>
              停滞阈值（天）
              <input
                type="number"
                min={1}
                max={365}
                step={1}
                required
                value={days}
                onChange={(e) => setDays(e.target.value)}
              />
            </label>
            <Button secondary type="submit" disabled={busy || Number(days) === saved}>
              保存阈值
            </Button>
          </form>
          <Button secondary disabled={!status.loaded} onClick={refresh}>
            <RefreshCw size={16} className={status.loaded ? "" : "spinning"} />
            重新体检
          </Button>
          <Button secondary disabled={!github.loaded} onClick={() => loadGithub(true)}>
            <RefreshCw size={16} className={github.loaded ? "" : "spinning"} />
            刷新 GitHub
          </Button>
        </div>
      </div>
      {active.length > SOFT_LIMIT && (
        <p className="scan-notice warning" role="status">
          已有 {active.length} 个在推进项目。通常同时推进 1–3 个；超过 {SOFT_LIMIT} 个时，停滞和体检提示会变多，建议收窄。
        </p>
      )}
      {status.error && (
        <p className="inline-error" role="alert">
          状态与体检读取失败：{status.error}
        </p>
      )}
      {github.error && (
        <p className="detail-footnote" role="status">
          GitHub 面板读取失败：{github.error}。GitHub 情况按未知处理。
        </p>
      )}
      {!status.loaded && !status.items.length && (
        <p className="detail-footnote" role="status">
          正在读取在推进项目的状态与体检…
        </p>
      )}
      <div className="project-status-grid">
        {status.items.map((item) => (
          <StatusCard
            key={item.projectId}
            item={item}
            days={status.stallDays || saved}
            adoptState={adoptState}
            notify={notify}
            github={githubOf(item.projectId)}
            githubLoading={!github.loaded}
          />
        ))}
      </div>
    </section>
  );
}
