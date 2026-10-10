import React, { useEffect, useRef, useState, useId } from "react";
import { createPortal } from "react-dom";
import { ArrowRight, Copy, List, RefreshCw, UserRound } from "lucide-react";
import { PageHeading, Button, Dialog, Scanning } from "./components.jsx";
import { AgentSprite, prefersReduced, useReducedMotion } from "./v14.jsx";
import { COLLAB_AGENTS, timelineOf } from "./collab.js";
import {
  RUN_PHASES,
  runPrompt,
  actorId,
  idleWriter,
  collabAlertGuidance,
} from "./collab-protocol.js";
import { usePromptCopy, AgentPicker } from "./Collab.jsx";
import { RelayLaunch } from "./RelayLaunch.jsx";
import { ControlledExecutionDrawer } from "./ControlledExecutionDrawer.jsx";
import { request } from "./api.js";
import { groupedRuns, workflowVersions } from "./collab-run-settings.js";
import { CollabRunSettings } from "./CollabRunSettings.jsx";
import "./collab-v16.css";
const NAMES = {
  "claude-code": "机械暴龙兽",
  codex: "机械邪龙兽",
  hermes: "亚古兽",
  user: "你",
  unknown: "执行者未知",
};
const launchName = (agent) => ({ codex: "CODEX", "claude-code": "CLAUDE", hermes: "HERMES" })[agent] || agent.toUpperCase();
const HUE = {
  "claude-code": "var(--orange)",
  codex: "var(--cyan)",
  user: "var(--yellow)",
  hermes: "var(--orange)",
  unknown: "var(--muted)",
};
const PACE = { "per-run": "逐单停等", continuous: "连续推进，最后一次验收" };
const ACTORS = [
  ["claude-code", "机械暴龙兽 · Claude"],
  ["codex", "机械邪龙兽 · Codex"],
  ["hermes", "亚古兽 · Hermes"],
  ["user", "你"],
];
const shortDate = (v) =>
  v
    ? new Date(v).toLocaleDateString("zh-CN", {
        month: "2-digit",
        day: "2-digit",
      })
    : "未知";
const time = (v) =>
  v
    ? new Date(v).toLocaleString("zh-CN", {
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
      })
    : "时间未知";
const mapSummary = (value, limit) => {
  const chars = Array.from(String(value || ""));
  return chars.length > limit ? chars.slice(0, limit - 1).join("") + "…" : String(value || "");
};
function Avatar({ actor }) {
  return actor === "user" ? (
    <UserRound size={20} />
  ) : actor ? (
    <AgentSprite
      agent={actor === "claude-code" ? "Claude Code" : actor}
      mode="body"
    />
  ) : (
    <span>?</span>
  );
}
function LineMap({ run, onNode, onLog }) {
  const scroll = useRef(),
    reduced = useReducedMotion(),
    uid = useId().replace(/:/g, "");
  const lanes = ["claude-code", "codex", "user"];
  if (run.stations.some((s) => s.actor === "hermes") || run.events.some((e) => e.actor === "hermes"))
    lanes.splice(2, 0, "hermes");
  if (run.events.some((e) => !e.actor) || run.stations.some((s) => !s.actor)) lanes.push("unknown");
  const ys = Object.fromEntries(
    lanes.map((a, i) => [
      a,
      i === 0 ? 128 : i === 1 ? 238 : 338 + (i - 2) * 100,
    ]),
  );
  const h = 410 + (lanes.length - 3) * 100;
  // Nine-station v1 remains fully visible in the desktop map; longer custom
  // templates keep the horizontal scroll rather than compressing labels.
  const step = run.stations.length <= 9
    ? Math.min(126, Math.floor(840 / Math.max(1, run.stations.length - 1)))
    : 126;
  const width = Math.max(1120, 280 + (run.stations.length - 1) * step);
  const nodes = run.stations.map((s, i) => ({
    ...s,
    x: 200 + i * step,
    y: ys[s.event ? s.event.actor || "unknown" : s.actor] ?? ys.unknown ?? ys.user,
    who: s.event ? s.event.actor || "unknown" : s.actor || "unknown",
    alert: s.current && run.alerts.some((a) => a.main),
  }));
  useEffect(() => {
    const el = scroll.current;
    if (!el) return;
    const x = nodes.find((n) => n.current)?.x || 200;
    const rail = parseFloat(getComputedStyle(el).getPropertyValue("--tm-lane-rail")) || 0;
    const target = el.clientWidth <= 390
      ? el.clientWidth - 40
      : (el.clientWidth + rail) / 2;
    el.scrollLeft =
      el.clientWidth < 760 ? Math.max(0, x - target) : 0;
  }, [run.id, run.templateVersionId, run.stations.length, run.phase.number]);
  const route = (a, b) =>
    a.y === b.y
      ? `M${a.x} ${a.y} H${b.x}`
      : `M${a.x} ${a.y} H${a.x + 20} C${a.x + 65} ${a.y} ${b.x - 45} ${b.y} ${b.x - 20} ${b.y} H${b.x}`;
  const reworkFrom = nodes.find((n) => /验收/.test(n.label)) || nodes[Math.min(5, nodes.length - 1)];
  const reworkTo = nodes.find((n) => /实现/.test(n.label)) || nodes[Math.min(3, nodes.length - 1)];
  return (
    <section className="tm-frame" aria-label="线路图">
      <header className="tm-head">
        <span className="en">LINE MAP · {run.template} · {PACE[run.pace] || "节奏未设置"}</span>
        <button className="tm-logbtn" onClick={onLog}>
          <List size={15} />
          活动记录 <b className="mono">{run.events.length}</b>
        </button>
      </header>
      <div
        ref={scroll}
        className="tm-scroll"
        tabIndex={0}
        aria-label="协同线路横向滚动"
      >
        <div className="tm-map" style={{ width, height: h }}>
          <span className="tm-rail" style={{ height: h, marginBottom: -h }} aria-hidden="true" />
          {lanes.map((actor) => (
            <span
              key={actor}
              className="tm-lane"
              style={{ top: ys[actor] - 26, "--lane-color": HUE[actor] }}
            >
              <span className="tm-lane-inner" aria-label={`${NAMES[actor]} · ${actor}`}>
                <span
                  className={`tm-lane-av ${actor === "user" ? "tm-you" : ""}`}
                >
                  <Avatar actor={actor} />
                </span>
                <span>
                  <b>{NAMES[actor]}</b>
                  <span className="en">
                    {actor === "claude-code"
                      ? "CLAUDE DESKTOP"
                      : actor === "codex" ? "CODEX DESKTOP" : actor.toUpperCase()}
                  </span>
                  <span className="en tm-lane-short">
                    {actor === "claude-code" ? "CLAUDE" : actor.toUpperCase()}
                  </span>
                </span>
              </span>
            </span>
          ))}
          <svg
            viewBox={`0 0 ${width} ${h}`}
            width={width}
            height={h}
            aria-label={`${nodes.length} 阶段交付线路`}
          >
            <defs>
              {nodes.slice(0, -1).map((a, i) => (
                <linearGradient
                  id={`${uid}-${i}`}
                  key={i}
                  gradientUnits="userSpaceOnUse"
                  x1={a.x}
                  y1={a.y}
                  x2={nodes[i + 1].x}
                  y2={nodes[i + 1].y}
                >
                  <stop offset="0" stopColor={HUE[a.who]} />
                  <stop offset="1" stopColor={HUE[nodes[i + 1].who]} />
                </linearGradient>
              ))}
            </defs>
            {nodes.map((n) => (
              <g key={n.number} aria-hidden="true">
                <line
                  className="tm-guide"
                  x1={n.x}
                  y1="56"
                  x2={n.x}
                  y2={h - 24}
                />
                <text
                  className={`tm-axis ${n.current ? "on" : ""} ${n.alert ? "bad" : ""}`}
                  x={n.x}
                  y="34"
                >
                  <tspan className="tm-axis-n">
                    {String(n.number).padStart(2, "0")}
                  </tspan>{" "}
                  {n.label}
                </text>
              </g>
            ))}
            {lanes.map((a) => (
              <line
                key={a}
                className="tm-track"
                x1="174"
                y1={ys[a]}
                x2={width - 30}
                y2={ys[a]}
                style={{ stroke: HUE[a] }}
                aria-hidden="true"
              />
            ))}
            {nodes.slice(0, -1).map((a, i) => {
              const b = nodes[i + 1],
                known = a.event && b.event;
              return (
                <g key={i} aria-hidden="true">
                  <path
                    className={known ? "tm-route" : "tm-future"}
                    d={route(a, b)}
                    stroke={known ? `url(#${uid}-${i})` : undefined}
                  />
                  {b.current && known && !reduced && (
                    <path className="tm-flow" d={route(a, b)} />
                  )}
                </g>
              );
            })}
            {!!run.reworks && reworkFrom && reworkTo && (
              <g aria-hidden="true">
                <path
                  className="tm-rework"
                  d={`M${reworkFrom.x} ${reworkFrom.y - 10} C${reworkFrom.x} 54 ${reworkTo.x} 54 ${reworkTo.x} ${reworkTo.y - 12}`}
                />
                <text className="tm-rework-t" x={(reworkFrom.x + reworkTo.x) / 2} y="68">
                  返修第 {run.reworks} 次 · {shortDate(run.reworkAt)}
                </text>
              </g>
            )}
            {nodes
              .filter(
                (n) => n.event?.gate && !n.ambiguous && n.status === "passed",
              )
              .map((n) => (
                <g key={n.number} aria-hidden="true">
                  <line
                    className="tm-tie"
                    x1={n.x}
                    y1={n.y + 10}
                    x2={n.x}
                    y2={ys.user - 12}
                  />
                  <rect
                    className="tm-gate"
                    x={n.x - 7}
                    y={ys.user - 7}
                    width="14"
                    height="14"
                    transform={`rotate(45 ${n.x} ${ys.user})`}
                  />
                  <text className="tm-gate-t" x={n.x} y={ys.user + 30}>
                    你确认
                  </text>
                  <text className="tm-gate-d" x={n.x} y={ys.user + 45}>
                    {shortDate(n.event.at)}
                  </text>
                </g>
              ))}
            {nodes.map((n) => {
              const top = n.y === 128,
                nameY = top ? n.y - 34 : n.y + 34,
                idY = top ? n.y - 50 : n.y + 50;
              const result = n.status === "skipped" ? "跳过" : n.decisionRequired ? "待你决定" : n.ambiguous
                ? "结论冲突 · 未知"
                : n.event?.result || (n.current ? "当前阶段" : "未记录");
              return (
                <g
                  key={n.number}
                  role="button"
                  tabIndex={0}
                  aria-label={`${n.number} ${n.label}：${n.status === "unknown" && !n.decisionRequired ? "未记录" : result}`}
                  aria-current={n.current ? "step" : undefined}
                  className={`tm-s ${n.current ? "cur " : ""}${n.status === "skipped" ? "skip" : n.alert ? "bad" : ["passed", "delivered"].includes(n.status) ? "ok" : n.status === "failed" ? "bad" : n.status === "unknown" ? "todo" : "pending"}`}
                  onClick={() => onNode(n)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      onNode(n);
                    }
                  }}
                  style={{ "--lane-color": HUE[n.who] }}
                >
                  <rect
                    className="tm-hit"
                    x={n.x - 58}
                    y={top ? n.y - 58 : n.y - 22}
                    width="116"
                    height="100"
                    rx="4"
                  />
                  {n.current && (
                    <circle
                      className={`tm-pulse ${n.alert ? "bad" : ""}`}
                      cx={n.x}
                      cy={n.y}
                      r="17"
                    />
                  )}
                  <circle
                    className={`tm-st ${n.alert ? "bad" : n.current ? "cur" : n.status === "unknown" ? "todo" : ""}`}
                    cx={n.x}
                    cy={n.y}
                    r={n.current ? 11 : 8}
                  />
                  <text className="tm-name" x={n.x} y={nameY}>
                    {mapSummary(n.artifact, nodes.length >= 9 ? 7 : 14)}
                  </text>
                  <text className="tm-id" x={n.x} y={idY}>
                    {n.event?.number?.slice(0, 16) || ""}
                  </text>
                  <text
                    className="tm-res"
                    x={n.x}
                    y={top ? n.y + 30 : n.y + 66}
                  >
                    {mapSummary(result, nodes.length >= 9 ? 7 : 14)}
                  </text>
                </g>
              );
            })}
          </svg>
        </div>
      </div>
    </section>
  );
}
function CopyPath({ value, label, iconOnly = false, notify }) {
  return (
    <button
      className={`cx-path ${iconOnly ? "icon-only" : ""}`}
      aria-label={iconOnly ? `复制依据路径：${label || value}` : undefined}
      title={iconOnly ? label || value : undefined}
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(value);
          notify("路径已复制");
        } catch {
          notify("路径复制失败", "error");
        }
      }}
    >
      {!iconOnly && (label || value)}
      <Copy size={14} />
    </button>
  );
}
export function CollabV16({
  state,
  save,
  adoptState,
  notify,
  navigate,
  collabStatus: board,
  refreshCollabStatus: refresh,
  collabJump,
}) {
  const [selected, setSelected] = useState(""),
    [node, setNode] = useState(null),
    [log, setLog] = useState(false),
    [info, setInfo] = useState(false),
    [settingsOpen, setSettingsOpen] = useState(false),
    [issuesOpen, setIssuesOpen] = useState(null),
    [help, setHelp] = useState(false),
    [agent, setAgent] = useState("codex"),
    [launch, setLaunch] = useState(false),
    [prompt, setPrompt] = useState(null),
    [promptOpen, setPromptOpen] = useState(false),
    [checking, setChecking] = useState(false),
    [receipt, setReceipt] = useState("");
  const [controlledOpen, setControlledOpen] = useState(false);
  const lock = useRef(false),
    live = useRef(true);
  useEffect(() => {
    live.current = true;
    return () => {
      live.current = false;
    };
  }, []);
  const copier = usePromptCopy({ adoptState, notify, successMessage: "已复制" });
  const pairs = (board?.items || []).flatMap((item) =>
    (item.protocol?.runs || []).map((run) => ({
      item,
      run,
      key: `${item.projectId}:${run.id}`,
    })),
  );
  const groups = groupedRuns(pairs);
  const versions = workflowVersions(state.assets || []);
  const chosen = pairs.find((p) => p.key === selected) || pairs[0],
    run = chosen?.run,
    item = chosen?.item;
  const currentKey = chosen?.key;
  const lastRunKey = useRef(null);
  const manuallyPicked = useRef(false);
  const preferredAgent = run?.holder || run?.stations[(run.phase.number || 4) - 1]?.actor || "codex";
  const suggestedAgent = preferredAgent === "user" ? "codex" : preferredAgent;
  useEffect(() => {
    if (run && currentKey !== lastRunKey.current) {
      lastRunKey.current = currentKey;
      manuallyPicked.current = false;
      setAgent(suggestedAgent);
      setLaunch(false);
      setPrompt(null);
      setPromptOpen(false);
      setNode(null);
      setLog(false);
      setSettingsOpen(false);
      setIssuesOpen(null);
      setReceipt("");
    }
  }, [currentKey]);
  useEffect(() => {
    if (run && currentKey === lastRunKey.current && !manuallyPicked.current &&
        !lock.current && !copier.pending && agent !== suggestedAgent) {
      setAgent(suggestedAgent);
      setPrompt(null);
      setReceipt("");
    }
  }, [currentKey, suggestedAgent]);
  const jumpPair = collabJump && board?.loaded && !board.error
    ? pairs.find(p => p.item.projectId === collabJump.projectId && p.run.id === collabJump.runId)
    : null;
  const safeJumpKey = jumpPair && jumpPair.run.isCurrent && !jumpPair.run.conflict &&
    !jumpPair.item.protocol?.copyBlocked && !jumpPair.run.copyBlocked && jumpPair.item.root &&
    jumpPair.run.phase?.number > 0
    ? jumpPair.key : null;
  const handledJump = useRef("");
  useEffect(() => {
    if (safeJumpKey && currentKey !== safeJumpKey) setSelected(safeJumpKey);
  }, [safeJumpKey, currentKey]);
  useEffect(() => {
    if (!safeJumpKey || currentKey !== safeJumpKey || handledJump.current === collabJump?.key) return;
    handledJump.current = collabJump.key;
    setLaunch(true);
  }, [safeJumpKey, currentKey, collabJump?.key]);
  useEffect(() => {
    if (!launch || !safeJumpKey || currentKey !== safeJumpKey || handledJump.current !== collabJump?.key) return;
    const frame = requestAnimationFrame(() => document.querySelector(".cx-launch")?.scrollIntoView({ block: "center", behavior: prefersReduced() ? "instant" : "smooth" }));
    return () => cancelAnimationFrame(frame);
  }, [launch, safeJumpKey, currentKey, collabJump?.key]);
  const unknown = (board?.items || []).filter(
    (i) =>
      !i.protocol || !["ok", "partial", "absent"].includes(i.protocol.state),
  );
  const stale =
    prompt &&
    (!board.loaded ||
      board.error ||
      chosen?.key !== prompt.key ||
      item?.protocol?.fingerprint !== prompt.fingerprint ||
      run?.conflict ||
      run?.copyBlocked ||
      item?.protocol?.copyBlocked)
      ? "项目协议或运行已变化，请按最新状态重新生成。"
      : "";
  const blocked =
    !board?.loaded ||
    !!board?.error ||
    !run ||
    run.conflict ||
    run.copyBlocked ||
    item?.protocol?.copyBlocked ||
    !item?.root ||
    !run.isCurrent;
  const busy = checking || copier.busy;
  const context = useRef(null);
  context.current = { key: currentKey, agent, fingerprint: item?.protocol?.fingerprint, blocked };
  function generatedPrompt() {
    if (blocked) return null;
    return {
      text: runPrompt(item, run, agent), key: chosen.key,
      fingerprint: item.protocol.fingerprint, projectName: item.name,
      projectId: item.projectId, stateId: item.current.fields?.stateId,
      stage: item.stage.id, agent,
    };
  }
  const draft = prompt || generatedPrompt();
  function preview() {
    if (lock.current || copier.pending) return;
    if (!prompt) setPrompt(generatedPrompt());
    setPromptOpen((v) => !v);
  }
  function regenerate() {
    if (blocked || lock.current || copier.pending) return;
    copier.reset();
    setPrompt(generatedPrompt());
    setReceipt("");
    setPromptOpen(true);
  }
  async function transfer(openApp = false) {
    if (!draft || blocked || lock.current || stale || copier.pending) return;
    // Freeze the edited text and its protocol identity for this one operation.
    const snapshot = { ...draft };
    if (!snapshot.text.trim()) {
      setPromptOpen(true);
      notify("请先填写提示词", "error");
      return;
    }
    setPrompt(snapshot);
    lock.current = true;
    setChecking(true);
    setReceipt("");
    try {
      const fresh = await request("/collab/protocol", {}),
        found = fresh.items.find((i) => i.projectId === snapshot.projectId),
        r = found?.protocol?.runs.find(
          (r) => `${found.projectId}:${r.id}` === snapshot.key,
        );
      if (!live.current) return;
      const current = context.current;
      if (current.key !== snapshot.key || current.agent !== snapshot.agent ||
          current.fingerprint !== snapshot.fingerprint || current.blocked ||
          !r || !r.isCurrent || r.copyBlocked || r.conflict ||
          !found.root || found.protocol.copyBlocked ||
          found.protocol.fingerprint !== snapshot.fingerprint) {
        notify("项目协议已变化，请重新读取后生成口令", "error");
        await refresh();
        return;
      }
      const ok = await copier.copy({ ...snapshot, kind: "dispatch" });
      if (!live.current) return;
      if (!ok) { setLaunch(true); setPromptOpen(true); return; }
      setReceipt("已复制");
      if (openApp) {
        try {
          const result = await request("/relay-sessions/open", { agentId: snapshot.agent });
          if (live.current && !result.opened) notify(result.reason, "warning");
        } catch (e) {
          if (live.current) notify(`提示词已复制；打开应用未确认：${e.message}`, "warning");
        }
      }
    } catch (e) {
      if (live.current) {
        notify(`协议重新核对失败，未复制：${e.message}`, "error");
        await refresh();
      }
    } finally {
      lock.current = false;
      if (live.current) setChecking(false);
    }
  }
  const drawer = (title, children) =>
    createPortal(
      <div
        className={`collab-v16-dialog ${node ? "node-open" : log ? "log-open" : ""}`}
      >
        <Dialog
          drawer
          recoverFocus
          title={title}
          onClose={() => {
            setNode(null);
            setLog(false);
            setInfo(false);
            setHelp(false);
            setSettingsOpen(false);
            setIssuesOpen(null);
          }}
        >
          {children}
        </Dialog>
      </div>,
      document.body,
    );
  return (
    <div className="collab-v16">
      <PageHeading
        page="collab"
        help={
          <button
            type="button"
            className="page-help"
            aria-label="协同使用说明"
            onClick={() => setHelp(true)}
          >
            ?
          </button>
        }
        action={
          <div className="heading-actions">
            <Button secondary onClick={() => setControlledOpen(true)}>受控执行状态</Button>
            <Button secondary disabled={!board?.loaded} onClick={refresh} aria-label="刷新看板">
              <RefreshCw size={16} />
            </Button>
          </div>
        }
      />
      {copier.error && <p role="alert" className="inline-error">
        {copier.error}
        {copier.pending && <Button secondary disabled={busy} onClick={copier.retry}>补记留痕</Button>}
      </p>}
      {stale && !copier.pending && <p role="alert" className="inline-error">
        {stale}
        <Button secondary disabled={blocked || busy} onClick={regenerate}>按最新状态重新生成</Button>
      </p>}
      {board?.error && (
        <p role="alert" className="inline-error">
          协同协议读取失败：{board.error}
        </p>
      )}
      {!board?.loaded && <Scanning label="正在读取协同协议" />}
      {unknown.map((i) => (
        <p key={i.projectId} className="inline-error" role="alert">
          {i.name}：
          {i.protocol?.issues?.join("；") || i.current.message || "协议未读到"}{" "}
          <Button secondary onClick={() => navigate("projects")}>
            去项目空间核对
          </Button>
        </p>
      ))}
      {board?.loaded && !board.error && !pairs.length && !unknown.length && (
        <div className="cx-empty">
          <p>还没有运行中的协同</p>
          <small>
            项目里有按协同模板写的 CURRENT 与交接文件后，这里会自动出现。
          </small>
          <Button secondary onClick={() => navigate("assets")}>
            去资产仓库看工作流模板 →
          </Button>
          <Button secondary onClick={() => navigate("projects")}>
            去项目空间标记
          </Button>
        </div>
      )}
      {!!pairs.length && (
        <>
          <div className="cx-run-groups">
            {groups.map((group) => <section className="cx-round" key={`${group.projectId}:${group.round}`}>
              <header>
                <b>{group.projectName} · {group.round}</b>
                <button type="button" onClick={() => setIssuesOpen(group)}>
                  待议清单 {group.issues?.state === "ok" ? `${group.issues.count} 条` : "待核实"} →
                </button>
              </header>
              <nav className="cx-runs" role="tablist" aria-label={`${group.round}运行`}>
                {group.pairs.map((p) => (
                  <button
                    key={p.key}
                    role="tab"
                    aria-selected={p.key === currentKey}
                    className={`${p.key === currentKey ? "on" : ""} ${p.run.alerts.some((a) => a.main) ? "bad" : ""}`}
                    disabled={busy || !!copier.pending}
                    onClick={() => setSelected(p.key)}
                  >
                    <span className="cx-run-title" title={p.run.title}>{p.run.title}</span>
                    <span className="mono">{p.run.phase.number || "?"}/{p.run.stations.length || "?"}</span>
                  </button>
                ))}
              </nav>
            </section>)}
          </div>
          <section className={`cx-sum ${run.conflict ? "bad" : ""}`}>
            <div className="cx-sum-main">
              <h2>
                {item.name} · {run.title}
              </h2>
              {run.taskSummary && <p className="cx-task-summary"><b>CURRENT 当前任务</b><span>{run.taskSummary}</span></p>}
              <p className="cx-sum-facts">
                <span>{run.template}</span>
                <span>{run.templateState === "bound" ? "锁定模板版本" : run.templateState === "legacy" ? "沿用旧版八站" : "模板待核实"}</span>
                {run.pace && <span>节奏 <b>{PACE[run.pace]}</b></span>}
                {run.startedAt && <span>开始 <b className="mono">{shortDate(run.startedAt)}</b></span>}
                {run.elapsedDays !== null && <span>已进行 <b className="mono">{run.elapsedDays} 天</b></span>}
                <span>
                  返修 <b className="mono">{run.reworks}</b> 次
                </span>
              </p>
              {(!run.stableId || !run.pace || !run.startedAt) && <p className="cx-sum-missing">{[
                !run.stableId && "运行编号",
                !run.pace && "推进节奏",
                !run.startedAt && "开始时间",
              ].filter(Boolean).join("、")}未登记；以 CURRENT 与协议文件为准。</p>}
            </div>
            <div className="cx-sum-now">
              {run.alerts.some((a) => a.main) ? (
                <>
                  <span className="cx-state">
                    {run.alerts
                      .filter((a) => a.main)
                      .map((a) => a.label)
                      .join(" · ")}
                  </span>
                  {collabAlertGuidance(run).map(text => <p key={text} className="cx-sum-guidance">{text}</p>)}
                  <Button secondary onClick={() => setInfo(true)}>
                    查看冲突与下一步
                  </Button>
                </>
              ) : (
                <>
                  <span className="cx-av">
                    <Avatar actor={run.holder} />
                  </span>
                  <span className="cx-now-t">
                    <b>
                      {idleWriter(run.writer)
                        ? "无人持笔"
                        : NAMES[run.holder] || run.writer}
                    </b>
                    <small>
                      {run.phase.inferred ? "推断 · " : ""}
                      {run.phase.number
                        ? run.stations[run.phase.number - 1]?.label || "阶段待核实"
                        : "阶段未知"}
                    </small>
                  </span>
                  <Button
                    secondary
                    aria-label="只复制口令"
                    disabled={blocked || busy || !!stale || !!copier.pending}
                    onClick={() => transfer(false)}
                  >
                    <Copy size={16} />
                  </Button>
                  <Button
                    disabled={blocked || busy || !!stale || !!copier.pending}
                    onClick={() => transfer(true)}
                  >
                    带到 <b className="relay-target-name">{launchName(agent)}</b> 继续 <ArrowRight size={16} />
                  </Button>
                </>
              )}
            </div>
          </section>
          {receipt && (
            <p role="status" className="cx-receipt">
              {receipt}
            </p>
          )}
          {run.stations.length
            ? <LineMap run={run} onNode={setNode} onLog={() => setLog(true)} />
            : <p className="inline-error" role="alert">锁定的模板版本未读到，线路与下一棒口令待核实。</p>}
          <div className="cx-foot">
            <button disabled={!run.stableId} onClick={() => setSettingsOpen(true)}
              title={!run.stableId ? "先在项目 CURRENT 协议登记稳定的 run_id" : undefined}>
              {run.templateState === "bound" ? "运行设置 / 升级模板" : "绑定工作流模板"}
            </button>
            <button onClick={() => setInfo(true)}>
              {run.partial ? "部分读取 · " : ""}
              {run.phase.inferred ? "推断依据" : "协议依据"} ·{" "}
              {item.current.fields?.stateId || "状态未知"}
            </button>
            <button
              onClick={() => {
                setLaunch((v) => !v);
              }}
            >
              下一棒口令
            </button>
          </div>
          {!run.stableId && <p className="cx-config-note" role="status">此事项尚无正式运行编号。请先在项目 CURRENT 协议登记 run_id，再绑定模板版本。</p>}
          {launch && (
            <div className="cx-launch">
              <AgentPicker
                desktop
                disabled={busy || !!copier.pending}
                id="collab-agent"
                label="下一棒 Agent"
                value={agent}
                onChange={(v) => {
                  if (!lock.current && !copier.pending) {
                    manuallyPicked.current = true;
                    setAgent(v); setPrompt(null); setReceipt(""); copier.reset();
                  }
                }}
              />
              <RelayLaunch
                mode="collab"
                open={promptOpen}
                onPreview={preview}
                prepared={draft ? { prompt: draft.text } : null}
                onPromptChange={(text) => {
                  if (!lock.current && !copier.pending) { setPrompt({ ...draft, text }); setReceipt(""); }
                }}
                busy={busy || !!copier.pending}
                blocked={blocked || !!stale || !draft?.text.trim()}
                copied={!!receipt}
                picked={agent}
                targetName={COLLAB_AGENTS.find((a) => a.id === agent)?.label}
                character={launchName(agent)}
                copy={transfer}
              />
            </div>
          )}
        </>
      )}
      {help &&
        drawer(
          "协同使用说明",
          <div className="cx-detail">
            <p>
              先选择事项，再点击阶段站点查看执行者、方法、交付物和协议依据。
            </p>
            <p>
              CURRENT
              与交接文首是协作事实源。标记“推断”的阶段需要核对原文；缺失或冲突的证据保持未知。
            </p>
            <p>
              复制口令后由你粘贴发送。复制记录和 Git 提交都不能证明 Agent
              已接手、Claude 已复核或你已验收。
            </p>
            <p>读取失败或写入者冲突时，先回项目空间核对并刷新，再生成口令。</p>
            <p>工作流资产版本绑定后，此次运行持续使用该版本。手动升级须先看差异；节奏与执行者只影响运行口令和线路预期，不替代协议中的实际完成证据。</p>
          </div>,
        )}
      {settingsOpen && run && drawer(
        "运行设置与模板版本",
        <CollabRunSettings key={currentKey} state={state} save={save} notify={notify}
          refresh={refresh} item={item} run={run} versions={versions}
          onClose={() => setSettingsOpen(false)} />,
      )}
      {issuesOpen && drawer(
        `${issuesOpen.round} · 待议清单`,
        <div className="cx-detail">
          {issuesOpen.issues?.state === "ok" ? <>
            <p>待议 {issuesOpen.issues.count} 条 · 表内共 {issuesOpen.issues.total} 条。这里只读项目清单。</p>
            <ol className="cx-issue-list">{issuesOpen.issues.items.map((entry) =>
              <li key={entry.number}><b>#{entry.number} {entry.title}</b><span>{entry.decision || "待议"}</span></li>)}</ol>
            {issuesOpen.issues.path && <CopyPath value={issuesOpen.pairs[0].item.root + "/" + issuesOpen.issues.path}
              label={issuesOpen.issues.path} notify={notify} />}
          </> : <p role="alert">清单条数待核实：{issuesOpen.issues?.reason || "未设置或读取不完整"}</p>}
        </div>,
      )}
      {node &&
        run &&
        drawer(
          "阶段详情",
          <div className="cx-detail">
            <span className="mono">{String(node.number).padStart(2, "0")}</span>
            <h2>{node.label}</h2>
            <dl>
              <div>
                <dt>执行者</dt>
                <dd>
                  <Avatar
                    actor={
                      node.event ? node.event.actor || "unknown" : node.actor
                    }
                  />
                  {node.event?.actorText ||
                    "未记录（路线预期：" +
                      (NAMES[node.actor] || node.actor) +
                      "）"}
                </dd>
              </div>
              <div>
                <dt>方法</dt>
                <dd>
                  {node.event?.method?.includes(" — ") ? (
                    <>
                      <strong>{node.event.method.split(" — ")[0]}</strong>
                      <span>
                        — {node.event.method.split(" — ").slice(1).join(" — ")}
                      </span>
                    </>
                  ) : (
                    node.event?.method || `模板方法：${node.method}`
                  )}
                </dd>
              </div>
              <div>
                <dt>模板要求</dt>
                <dd>{node.artifact || "未记录"}</dd>
              </div>
              <div>
                <dt>实际记录</dt>
                <dd>
                  {node.event?.artifact ? (
                    <CopyPath
                      value={item.root + "/" + node.event.artifact}
                      label={node.event.artifact}
                      notify={notify}
                    />
                  ) : (
                    "未记录"
                  )}
                </dd>
              </div>
              <div>
                <dt>过关</dt>
                <dd
                  className={
                    node.status === "passed" && !node.ambiguous ? "ok" : ""
                  }
                >
                  {node.ambiguous
                    ? "结论冲突 · 未知"
                    : node.status === "skipped" ? "纯功能任务 · 本站按规则跳过"
                    : node.decisionRequired ? "同一返修项达到升级阈值 · 待你决定"
                    : node.event?.result || "未过关 · 缺依据"}
                </dd>
              </div>
              {node.gateCondition && <div><dt>模板过关条件</dt><dd>{node.gateCondition}</dd></div>}
              <div>
                <dt>存档点</dt>
                <dd>
                  {node.event?.commit &&
                  run.git.commits.some((c) => c.hash === node.event.commit)
                    ? node.event.commit
                    : "尚无匹配的 Git 佐证"}
                </dd>
              </div>
              <div>
                <dt>依据</dt>
                <dd>
                  {node.event?.basis || "该站没有协议记录"}
                  {node.event?.path && (
                    <CopyPath
                      value={item.root + "/" + node.event.path}
                      label={node.event.path.split("/").at(-1)}
                      notify={notify}
                    />
                  )}
                </dd>
              </div>
            </dl>
            <Button secondary onClick={() => navigate("assets")}>
              查看工作流资产 →
            </Button>
          </div>,
        )}
      {log &&
        run &&
        drawer(
          "活动记录",
          <div className="cx-detail">
            <span className="en">ACTIVITY</span>
            <h2>活动记录</h2>
            <ol className="tm-log">
              {[...run.events].reverse().map((e) => (
                <li key={e.id} className={e.status === "failed" ? "bad" : ""}>
                  <time>{time(e.at)}</time>
                  <Avatar actor={e.actor} />
                  <span>
                    <b>{NAMES[e.actor] || e.actorText}</b> ·{" "}
                    {run.stations[e.phase - 1]?.label || RUN_PHASES[e.phase - 1]?.label || "阶段待核实"}
                    <em>{e.result || e.status}</em>
                  </span>
                  <CopyPath
                    value={item.root + "/" + e.path}
                    label={e.path.split("/").at(-1)}
                    iconOnly
                    notify={notify}
                  />
                </li>
              ))}
            </ol>
            <p>依据项目 CURRENT 与交接文首 · 共 {run.events.length} 条</p>
            <details>
              <summary>Git 存档佐证 · {run.git.state}</summary>
              {run.git.commits.map((c) => (
                <p key={c.hash}>
                  {time(c.at)} · {c.hash.slice(0, 8)} · {c.title}
                </p>
              ))}
            </details>
            <details>
              <summary>历史与复制留痕（非交付权威）</summary>
              {timelineOf(item).map((e) => (
                <p key={`${e.kind}-${e.id}`}>
                  {e.date} · {e.title}
                </p>
              ))}
            </details>
          </div>,
        )}
      {info &&
        run &&
        drawer(
          "CURRENT 与协议依据",
          <div className="cx-detail">
            <dl>
              <div>
                <dt>状态</dt>
                <dd>{item.current.fields?.stateId || "未知"}</dd>
              </div>
              <div>
                <dt>持笔者</dt>
                <dd>{run.writer}</dd>
              </div>
              <div>
                <dt>下一步</dt>
                <dd>{run.next || "未知"}</dd>
              </div>
              <div>
                <dt>依据</dt>
                <dd>{run.phase.basis}</dd>
              </div>
            </dl>
            <CopyPath
              value={item.root + "/" + item.current.path}
              label={item.current.path}
              notify={notify}
            />
            {[...run.conflicts, ...(item.protocol.issues || [])].map((s, i) => (
              <p key={i}>{s}</p>
            ))}
            <p>
              只读协议，不把复制记录当派发或交付。未记载的前序阶段保持未知。
            </p>
          </div>,
        )}
      <ControlledExecutionDrawer open={controlledOpen}
        onClose={() => setControlledOpen(false)}
        projectId={item?.projectId || state.connections?.projects?.find(project => project.active)?.id || ''}
        targetId={agent} />
    </div>
  );
}
