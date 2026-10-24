import { Reading, ReadReveal } from './ScanMotion.jsx';
// 路线 v3 切片 2.1/2.2：在推进项目的状态卡、停滞雷达与安全体检。
// 全部只读：状态来自项目自己的 CURRENT.md 与 Git，工作台不另存第二份 Current，不修改项目文件。
import React, { useState } from "react";
import { createPortal } from "react-dom";
import { Flag, Play } from "lucide-react";
import { Button, Badge } from "./components.jsx";
import { request } from "./api.js";
import { startPrompt, linkText, COLLAB_AGENTS } from "./collab.js";
import { usePromptCopy, PromptDialog, AgentPicker, staleNote } from "./Collab.jsx";
import { AgentSprite } from "./v14.jsx";
import "./project-status.css";

const SOFT_LIMIT = 7;
// 项目详情里的“在推进”开关。写入走专用接口并带当前 revision，冲突时如实提示。
export function ActiveToggle({ project, state, adoptState, notify, launch=false, onPrepare, onMarked }) {
  const [busy, setBusy] = useState(false);
  const active = project.active === true;
  const count = (state.connections?.projects || []).filter((p) => p.active).length;
  async function toggle(event) {
    if(busy)return;
    onPrepare?.(event);
    setBusy(true);
    try {
      const next = await request("/project-status/mark", {
        projectId: project.id,
        active: !active,
        revision: state.revision,
      });
      adoptState(next);
      if(!active)onMarked?.();
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
  if(launch)return <button type="button" className="pj-cs-new" aria-label={`开新档：${project.name}`} disabled={busy} onClick={toggle}>{busy?"保存中…":"开新档"}<Play size={15}/></button>;
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

export function CurrentBlock(props) {
  return <><ReadReveal pending={!props.current||props.current.state==="loading"} ready={!!props.current&&!["loading","error","unparsed","partial","outline"].includes(props.current.state)}/><CurrentBody {...props}/></>;
}
function CurrentBody({ current, omitSummary = false }) {
  if (!current || current.state === "loading") return <p role="status"><Reading mini label="CURRENT 读取中"/></p>;
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
  if (current.state === "outline")
    return (
      <div className="status-empty">
        <strong>没有协作状态表 · 最近进展</strong>
        <small>
          {current.outline.title}
          {current.outline.summary ? `：${current.outline.summary}` : ""}
        </small>
        <small>
          按 {current.path} 最上面一节读取，不推断写入者与阶段；下一步可在存档卡上手填。
        </small>
      </div>
    );
  const f = current.fields;
  const rows = [
    ["stateId", "状态编号", f.stateId],
    ["writer", "当前写入者", f.writer],
    ["next", "唯一下一步", f.next && linkText(f.next)],
    [
      "handoff", "最新交接",
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
        {rows.filter(([key]) => !omitSummary || key === "handoff").map(([key, label, value]) => (
          <div key={key}>
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

export const CHECK_LABELS = [
  ["remote", "远程备份"],
  ["dirty", "未提交改动"],
  ["sensitive", "敏感文件"],
  ["visibility", "远程可见性"],
];
export function checkText(key, check) {
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

export function SafetyBlock({ safety }) {
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
export function StartWork({ item, adoptState, notify, label = "生成开工口令", variant = "default" }) {
  const [agent, setAgent] = useState("codex");
  const [prompt, setPrompt] = useState(null);
  const copier = usePromptCopy({ adoptState, notify });
  const blocked = !item.root || item.current.state === "error";
  function open() {
    try {
      copier.reset();
      // 口令与留痕字段在生成时一起定下（C5-F2）。
      setPrompt({
        text: startPrompt(item, agent),
        agent,
        projectId: item.projectId,
        stateId: item.current.fields?.stateId,
      });
    } catch (e) {
      notify(e.message, "error");
    }
  }
  const dialog = prompt && (
        <PromptDialog
          title={`开工口令：${item.name}`}
          stale={staleNote(prompt, item.current.fields?.stateId)}
          lead="确认后复制到剪贴板，并计入这个项目的协同留痕；把口令粘贴给所选 Agent 即可开工，工作台不会替你打开或执行。"
          text={prompt.text}
          copier={copier}
          onClose={() => setPrompt(null)}
          onConfirm={async () => {
            const done = await copier.copy({
              text: prompt.text,
              kind: "start",
              projectId: prompt.projectId,
              agent: prompt.agent,
              stateId: prompt.stateId,
            });
            if (done) setPrompt(null);
          }}
        />
      );
  return (
    <div className={`status-start ${variant === "save" ? "project-save-start" : ""}`} aria-label="一键开工" role="group">
      {variant === "save" ? (
        <div className="project-save-picker">
          <span>开工 Agent · {COLLAB_AGENTS.find((a) => a.id === agent)?.label}</span>
          <div role="group" aria-label="开工 Agent">
            {COLLAB_AGENTS.map((choice) => (
              <button key={choice.id} type="button" aria-label={choice.label} title={choice.label}
                aria-pressed={agent === choice.id} onClick={() => setAgent(choice.id)}>
                <span aria-hidden="true"><AgentSprite agent={choice.id} /></span>
              </button>
            ))}
          </div>
        </div>
      ) : (
        <AgentPicker id={`start-${item.projectId}`} label="开工 Agent" value={agent} onChange={setAgent} />
      )}
      <Button secondary disabled={blocked} onClick={open}>
        <Play size={16} />
        {label}
      </Button>
      {variant === "save" && dialog ? createPortal(dialog, document.body) : dialog}
    </div>
  );
}

