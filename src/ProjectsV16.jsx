import { projectScanNotice } from "./project-scan-status.js";
import {projectLaunchSignature} from './project-freshness.js';
import { Reading, ReadReveal } from './ScanMotion.jsx';
import { ProjectSettings } from "./ProjectSettings.jsx";
import { savepointThresholds } from "./settings-v16.js";
import { projectSavepointAge as savepointAge } from "./pending.js";
import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import {
  ArrowRight,
  ArrowUpRight,
  ChevronRight,
  RefreshCw,
  Settings2,
  Search,
  Save,
  Play,
  X,
  AlertCircle,
  Github,
} from "lucide-react";
import { Button, Dialog, PageHeading, Badge, SourceReadError } from "./components.jsx";
import { request, scan } from "./api.js";
import { Pixel } from "./pixel.jsx";
import { AgentSprite, useReducedMotion } from "./v14.jsx";
import { castOf, characterOf, AGENT_CAST } from "./characters.js";
import { ActiveToggle, CurrentBlock, SafetyBlock } from "./ProjectStatus.jsx";
import { ProjectLocations } from "./ProjectLocations.jsx";
import { ProjectCatalogEditor } from "./ProjectCatalog.jsx";
import { ProjectContext } from "./ProjectContext.jsx";
import { ProjectRules } from "./RuleInstall.jsx";
import { GithubBlock, useGithubPanel } from "./ProjectGithub.jsx";
import { STAGES, linkText } from "./collab.js";
import { usePromptCopy, staleNote } from "./Collab.jsx";
import { RelayLaunch } from "./RelayLaunch.jsx";
import {
  sortSaveItems,
  groupProjectRacks,
  groupPortfolioSections,
  readableCurrent,
  projectRelayPrompt,
} from "./projects-v16.js";
import "./projects-v16.css";
export function Floppy() {
  return (
    <svg
      className="pj-floppy"
      viewBox="0 0 10 10"
      shapeRendering="crispEdges"
      aria-hidden="true"
    >
      <path d="M1 1h7l1 1v7H1z" fill="currentColor" opacity=".9" />
      <path d="M3 1h4v3H3z" fill="var(--bg)" />
      <path d="M5 1.5h1v2H5z" fill="currentColor" />
      <path d="M2.5 6h5v2.5h-5z" fill="var(--bg)" opacity=".75" />
    </svg>
  );
}
// 可见路径按实测宽度裁为字符串，完整路径保留title与读屏；不靠overflow隐藏超长DOM。
function PathLabel({ value }) {
  const ref = useRef(null),
    [text, setText] = useState("");
  useLayoutEffect(() => {
    let alive = true;
    const el = ref.current,
      canvas = document.createElement("canvas"),
      ctx = canvas.getContext("2d");
    const fit = () => {
      if (!alive) return;
      ctx.font = getComputedStyle(el).font;
      const width = el.clientWidth;
      let t = value || "";
      if (ctx.measureText(t).width > width) {
        const chars = [...t];
        while (
          chars.length &&
          ctx.measureText(chars.join("") + "…").width > width
        )
          chars.pop();
        t = chars.length ? chars.join("") + "…" : "";
      }
      setText(t);
    };
    fit();
    const observer = new ResizeObserver(fit);
    observer.observe(el);
    document.fonts.ready.then(fit);
    return () => {
      alive = false;
      observer.disconnect();
    };
  }, [value]);
  return (
    <span className="pj-path" ref={ref} title={value} aria-label={value}>
      {text}
    </span>
  );
}
const date = (value) =>
  value
    ? new Date(value).toLocaleString("zh-CN", {
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
      })
    : "未知";
function recent(p) {
  return p.recentUpdate?.at
    ? new Date(p.recentUpdate.at).toLocaleDateString("zh-CN", {
        month: "2-digit",
        day: "2-digit",
      }) + (p.recentUpdate.state === "partial" ? " · 部分" : "")
    : "未知";
}
const projectSource = (project) => project.githubUrl ? "github" : "local";
const unavailable = (item) =>
  item.current?.state === "absent"
    ? "文件不存在"
    : item.current?.state === "unparsed"
      ? "格式不对"
      : item.current?.message || "尚未取得读取结果";
function SaveCard({
  item,
  index,
  launch,
  onContinue,
  onDetails,
  savepointDays,
  savepointWarnDays,
  readFailed,
}) {
  const readable = readableCurrent(item),
    f = item.current?.fields,
    holder = readable ? castOf(f?.writer) : null,
    stalled = readable && item.activity?.state === "stalled",
    stage = readable ? item.stage?.id : "unknown";
  const points = readable ? item.daily?.days || [] : [];
  return (
    <article
      className={`pj-save${stalled ? " stalled" : ""}${launch ? " is-launching" : ""}${readFailed ? " read-failed" : ""}`}
      aria-label={`项目状态卡：${item.name}`}
      data-project-id={item.projectId}
    >
      <header className="pj-save-head">
        <span className="pj-slot">
          <Floppy />
          <span className="en">SLOT {String(index + 1).padStart(2, "0")}</span>
        </span>
        {item.safety?.issues?.length > 0 && (
          <span
            className="pj-alert"
            aria-label={`${item.safety.issues.length} 项安全问题`}
          >
            {item.safety.issues.length}
          </span>
        )}
        {stalled && (
          <span
            className="pj-zzz"
            aria-label={`停滞 ${item.activity.idleDays} 天`}
          >
            <i>z</i>
            <i>z</i>
            <i>Z</i>
          </span>
        )}
      </header>
      <div className="pj-save-title">
        <h3>{item.name}</h3>
        <span className="pj-path" title={item.root}>
          {item.root || "本地位置未知"}
        </span>
      </div>
      <div className="pj-save-main">
        <div
          className={`pj-holder${holder ? "" : " none"}`}
          data-agent={holder?.id || "none"}
          style={{ "--hue": holder?.hue || "77,227,255" }}
        >
          <AgentSprite
            agent={holder?.id || "hermes"}
            mode="body"
            className={`sprite${holder ? "" : " ghost"}`}
          />
          <span className="pj-holder-name">
            {holder
              ? characterOf(holder.id)?.name
              : readable && f?.writer === "无"
                ? "无人持笔"
                : f?.writer || (readable ? "缺少此项" : "持笔者未知")}
            {holder && <span className="en">{holder.name.toUpperCase()}</span>}
          </span>
        </div>
        <div className="pj-next">
          <span className="en">NEXT · 下一步</span>
          {readable ? (
            <p>{f?.next ? linkText(f.next) : "缺少此项"}</p>
          ) : (
            <p className="pj-unread">
              <AlertCircle size={18} />
              读不到 CURRENT<small>{readFailed ? "当前状态待核实" : unavailable(item)}</small>
            </p>
          )}
        </div>
      </div>
      <ol
        className="pj-stages"
        aria-label={`接力阶段：${readable ? item.stage?.label || "未知" : "未知"}`}
        title={
          readable
            ? item.stage?.basis || "当前记录不足以推断"
            : "CURRENT不可读，阶段未知"
        }
      >
        {STAGES.map((s, i) => (
          <li
            key={s.id}
            className={
              s.id === stage
                ? "on"
                : STAGES.findIndex((t) => t.id === stage) > i
                  ? "done"
                  : ""
            }
            aria-current={s.id === stage ? "step" : undefined}
          >
            {s.label}
          </li>
        ))}
      </ol>
      <div className="pj-heat" aria-label="近30天活动">
        {Array.from({ length: 30 }, (_, i) => {
          const p = points[i],
            total = p?.total;
          return (
            <i
              key={i}
              className={
                total == null
                  ? "l-1"
                  : total > 0
                    ? "l" + Math.min(4, total)
                    : ""
              }
              title={`${p?.date || i + 1}：${total == null ? "未知" : total}`}
              aria-hidden="true"
            />
          );
        })}
        <span className="en">
          {stalled
            ? `停滞 ${item.activity.idleDays} 天`
            : readable
              ? date(item.activity?.latestAt)
              : "未知"}
        </span>
        <span className="sr-only">
          {points.length
            ? points
                .map(
                  (p) =>
                    `${p.date}：Git ${p.git ?? "未知"}，CURRENT ${p.current ?? "未知"}`,
                )
                .join("；")
            : "阶段和每日活动未知，不代表没有活动"}
        </span>
      </div>
      {readable && item.daily?.state !== "ok" && (
        <small className="pj-unknown">
          {item.daily?.note || "每日活动未知"}
          {item.daily?.reason && ` · ${item.daily.reason}`}
        </small>
      )}
      {savepointDays > savepointWarnDays && (
        <span
          className="pj-savepoint-hint"
          title="基于最近一次读取或项目扫描"
        >
          未存档 {Math.floor(savepointDays)} 天
        </span>
      )}
      <div className="pj-save-act">
        <Button
          className="pj-go"
          secondary={index > 0}
          disabled={!item.root || !readable || readFailed}
          onClick={onContinue}
          aria-expanded={launch}
        >
          <Play size={16} />
          继续
        </Button>
        <button type="button" className="text-btn" onClick={onDetails}>
          详情
          <ChevronRight size={16} />
        </button>
      </div>
    </article>
  );
}
function ProjectLaunch({ item, liveItem, adoptState, notify, onClose, refreshProjectStatus, statusReading, sourceKey }) {
  const [agent, setAgent] = useState(
      castOf(item.current?.fields?.writer)?.id || "codex",
    ),
    [open, setOpen] = useState(false),
    [seen, setSeen] = useState(false),
    [error, setError] = useState(""),
    [receipt, setReceipt] = useState(""),
    [opening, setOpening] = useState(false), [checking,setChecking]=useState(false);
  const lock = useRef(false),
    live = useRef(true),
    copier = usePromptCopy({ adoptState, notify }),
    prepared = projectRelayPrompt(item, agent),
    snapshot = { stateId: item.current?.fields?.stateId };
  const stale =
    (item.sourceKey!==sourceKey?"项目来源已变化，请重新继续并预览。":"") ||
    staleNote(snapshot, liveItem?.current?.fields?.stateId) ||
    (projectLaunchSignature(item)!==projectLaunchSignature(liveItem)?"项目内容或目录已变化，请收起后重新继续并预览。":"") ||
    (!readableCurrent(liveItem)
      ? "项目 CURRENT 已不可读，请收起后重新读取。"
      : "");
  useEffect(() => {
    live.current = true;
    const key = (e) => {
      if (e.key === "Escape" && !lock.current) {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener("keydown", key);
    return () => {
      live.current = false;
      window.removeEventListener("keydown", key);
    };
  }, []);
  const busy = copier.busy || opening || checking || statusReading;
  async function copy(openApp) {
    if (lock.current || busy || stale || copier.pending) return;
    if (!seen) {
      setOpen(true);
      setSeen(true);
      notify("请先预览口令，再复制或带过去");
      return;
    }
    lock.current = true;setChecking(true);
    setError("");
    setReceipt("");
    try {
      const fresh=await refreshProjectStatus();
      if(!live.current)return;
      const latest=fresh?.items.find(p=>p.projectId===item.projectId);
      if(!latest||!readableCurrent(latest)){setError('当前状态读取未确认，请重读后再复制。');return;}
      if(fresh.sourceKey!==item.sourceKey||projectLaunchSignature(item)!==projectLaunchSignature(latest)){setError('项目内容或目录已变化，请收起后重新继续并预览。');return;}
      const ok = await copier.copy({
        text: prepared.prompt,
        kind: "start",
        projectId: item.projectId,
        agent: agent === "claude" ? "claude-code" : agent,
        stateId: snapshot.stateId,
      });
      if (!ok || !live.current) return;
      setReceipt("TRANSFER OK · 口令已复制");
      if (openApp) {
        setOpening(true);
        try {
          const r = await request("/relay-sessions/open", {
            agentId: agent === "claude" ? "claude-code" : agent,
          });
          if (live.current) {
            setReceipt(
              r.opened ? "TRANSFER OK · 已打开应用，请粘贴发送" : r.reason,
            );
            notify(r.opened ? "已打开应用，请粘贴发送" : r.reason);
          }
        } catch (e) {
          if (live.current)
            setError("口令已复制；打开应用未确认：" + e.message);
        }
      }
    } finally {
      lock.current = false;
      if (live.current) {setOpening(false);setChecking(false);}
    }
  }
  return (
    <>
      <RelayLaunch
        mode="projects"
        open={open}
        busy={busy}
        blocked={!!stale || !!copier.pending}
        prepared={prepared}
        picked={agent}
        targetName={castOf(agent)?.name}
        character={characterOf(agent)?.name}
        copy={copy}
        onPreview={() => {
          setOpen(!open);
          setSeen(true);
        }}
        extra={
          <button
            type="button"
            className="icon-btn pj-close"
            aria-label="收起发车条"
            disabled={busy}
            onClick={onClose}
          >
            <X size={17} />
          </button>
        }
      >
        <span className="en">CONTINUE</span>
        <div className="pj-picks" role="radiogroup" aria-label="开工 Agent">
          {AGENT_CAST.map((a) => (
            <button
              type="button"
              className={`pj-pick${agent === a.id ? " on" : ""}`}
              key={a.id}
              style={{ "--hue": a.hue }}
              role="radio"
              aria-checked={agent === a.id}
              aria-label={a.name}
              disabled={busy || !!copier.pending}
              onClick={() => {
                setAgent(a.id);
                setSeen(false);
                setReceipt("");
                copier.reset();
              }}
              onKeyDown={(e) => {
                if (
                  ["ArrowRight", "ArrowLeft", "ArrowDown", "ArrowUp"].includes(
                    e.key,
                  )
                ) {
                  e.preventDefault();
                  const n =
                    (AGENT_CAST.indexOf(a) +
                      (["ArrowRight", "ArrowDown"].includes(e.key) ? 1 : 3)) %
                    4;
                  setAgent(AGENT_CAST[n].id);
                  setSeen(false);
                  setReceipt("");
                  copier.reset();
                  e.currentTarget.parentElement.children[n].focus();
                }
              }}
            >
              <AgentSprite agent={a.id} mode="head" />
            </button>
          ))}
        </div>
      </RelayLaunch>
      {(error || copier.error || stale) && (
        <p className="inline-error" role="alert">
          {error || copier.error || stale}
        </p>
      )}
      {copier.pending && (
        <Button secondary disabled={busy} onClick={copier.retry}>
          补记留痕
        </Button>
      )}
      {receipt && (
        <p role="status" className="relay-receipt">
          {receipt}
        </p>
      )}
    </>
  );
}
export function ProjectsV16({
  state,
  navigate,
  savepointReads = {},
  adoptState,
  notify,
  ruleInstalls,
  refreshRuleInstalls,
  projectStatus = { items: [], error: "", loaded: true },
  refreshProjectStatus = () => {},
  projectJump,
}) {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [filter, setFilter] = useState("all"),
    [query, setQuery] = useState(""),
    [selectedId, setSelectedId] = useState(null),
    [settings, setSettings] = useState(false),
    [help, setHelp] = useState(false),
    [launch, setLaunch] = useState(null),
    [daily, setDaily] = useState({ items: [], error: "" }),
    [flight, setFlight] = useState(null);
  const [columns, setColumns] = useState(() =>
    window.innerWidth > 1180 ? 3 : window.innerWidth > 760 ? 2 : 1,
  );
  const continueLock=useRef(false),pageLive=useRef(true);
  useEffect(()=>{pageLive.current=true;return()=>{pageLive.current=false;};},[]);
  const settingsBusy = useRef(false);
  const dailyGeneration = useRef(0);
  const started = useRef(false),
    scanLock = useRef(false),
    lib = useRef(null),
    trigger = useRef(null),
    flightTimer = useRef(null),
    flightOrigin = useRef(null),
    reduced = useReducedMotion();
  const c = state.connections || {},
    catalog = new Map((c.projectCatalog || []).map((item) => [item.projectId, item])),
    curated = catalog.size > 0,
    all = (c.projects || []).map((project) => ({
      ...project,
      originalName: project.name,
      name: catalog.get(project.id)?.displayName || project.name,
    })),
    active = all.filter((p) => p.active),
    ids = active.map((p) => p.id).join(","),
    [github, loadGithub] = useGithubPanel(ids),
    selected = all.find((p) => p.id === selectedId);
  useEffect(() => {
    if (projectJump?.id && all.some(p => p.id === projectJump.id)) setSelectedId(projectJump.id);
  }, [projectJump?.key, projectJump?.id]);
  async function run(data = {}) {
    if (scanLock.current) return null;
    scanLock.current = true;
    setBusy(true);
    setError("");
    try {
      const next = await scan("projects", data);
      adoptState(next);
      return next;
    } catch (e) {
      setError(e.message);
      notify(e.message, "error");
      return null;
    } finally {
      scanLock.current = false;
      setBusy(false);
    }
  }
  useEffect(() => {
    if (!started.current && !c.projectScannedAt) {
      started.current = true;
      run();
    }
  }, []);
  const loadDaily = useCallback(async () => {
    const generation = ++dailyGeneration.current;
    if (!ids) { setDaily({ items: [], error: "" }); return; }
    try {
      const result = await request("/project-status/activity", {});
      if (generation === dailyGeneration.current) setDaily({ ...result, error: "" });
    } catch (e) {
      if (generation === dailyGeneration.current) setDaily(previous => ({ ...previous, error: e.message }));
    }
  }, [ids]);
  useEffect(() => {
    loadDaily();
    return () => { dailyGeneration.current++; };
  }, [loadDaily, state.revision, projectStatus.at]);
  useEffect(() => {
    const resize = () =>
      setColumns(
        window.innerWidth > 1180 ? 3 : window.innerWidth > 760 ? 2 : 1,
      );
    window.addEventListener("resize", resize);
    return () => window.removeEventListener("resize", resize);
  }, []);
  useEffect(() => {
    if (reduced) {
      clearTimeout(flightTimer.current);
      setFlight(null);
    }
    return () => clearTimeout(flightTimer.current);
  }, [reduced]);
  const launchOrder=useRef(null);
  const sortedItems = sortSaveItems(
    active.map((p) => {
      const item = projectStatus.items.find((i) => i.projectId === p.id) || {
        projectId: p.id,
        name: p.name,
        root: p.localPaths[0],
        current: projectStatus.error
          ? { state: "error", message: "当前状态待核实" }
          : { state: "loading" },
        activity: { state: "unknown" },
        safety: { issues: [], checks: {} },
        stage: { id: "unknown" },
      };
      return {
        ...item,
        name: p.name,
        savepointDays: savepointAge(p, savepointReads[p.id]),
        daily: daily.items.find((d) => d.projectId === p.id),
      };
    }),
  );
  // Keep the active preview mounted while a background read changes card priority.
  if(!launch||!launchOrder.current)launchOrder.current=sortedItems.map(item=>item.projectId);
  const items=launch?[...sortedItems].sort((a,b)=>launchOrder.current.indexOf(a.projectId)-launchOrder.current.indexOf(b.projectId)):sortedItems;
  const slots = new Map(items.map((p, i) => [p.projectId, i + 1])),
    liveLaunch = launch && items.find((i) => i.projectId === launch.projectId);
  function closeLaunch() {
    setLaunch(null);
    trigger.current?.focus();
  }
  const library = curated
    ? all.filter((p) => catalog.get(p.id)?.view === "main")
    : all;
  const counts = {
    all: library.length,
    local: library.filter((p) => projectSource(p) === "local").length,
    github: library.filter((p) => projectSource(p) === "github").length,
  };
  const matches = (p) =>
    (filter === "all" || projectSource(p) === filter) &&
    [p.name, p.originalName, p.repoKey, ...p.localPaths]
      .join(" ").toLowerCase().includes(query.toLowerCase());
  const projects = library.filter(matches);
  const assets = curated
    ? all.filter((p) => catalog.get(p.id)?.view === "asset").filter(matches)
    : [];
  const tasks = curated
    ? all.filter((p) => catalog.get(p.id)?.view === "task").filter(matches)
    : [];
  const candidates = curated
    ? all.filter((p) => !catalog.has(p.id) || catalog.get(p.id)?.view === "candidate").filter(matches)
    : [];
  const hidden = curated
    ? all.filter((p) => catalog.get(p.id)?.view === "hidden").filter(matches)
    : [];
  const displayOnly = (project) => project.manual && !project.localPaths.some((path) =>
    (c.roots || []).some((root) => path === root || path.startsWith(`${root}/`)));
  const mainProject = (project) => !curated || catalog.get(project.id)?.view === "main";
  function editSettings() { setSettings(true); }
  function closeSettings() { if(!settingsBusy.current)setSettings(false); }
  function prepareFlight(event) {
    if (reduced) return;
    const row = event.currentTarget.closest(".pj-cs"),
      dest =
        document.querySelector(".pj-vacant") ||
        document.querySelector(".pj-saves");
    flightOrigin.current = {
      from: row.getBoundingClientRect(),
      to: dest.getBoundingClientRect(),
    };
  }
  function fly(project) {
    if (reduced || !flightOrigin.current) return;
    setFlight({ ...flightOrigin.current, name: project.name });
    clearTimeout(flightTimer.current);
    flightTimer.current = setTimeout(() => setFlight(null), 650);
  }
  return (
    <div className="projects-v16 project-space">
      <ReadReveal pending={busy} ready={!error}/>
      <PageHeading
        page="projects"
        help={
          <button
            className="page-help"
            aria-label="项目空间怎么用"
            onClick={() => setHelp(true)}
          >
            ?
          </button>
        }
        action={
          <div className="pj-head-act">
            <button
              type="button"
              className="icon-btn"
              aria-label="项目空间设置"
              onClick={editSettings}
            >
              <Settings2 size={18} />
            </button>
            <button
              type="button"
              className="icon-btn"
              aria-label="重新扫描"
              disabled={busy}
              onClick={() => run()}
            >
              {busy ? <Reading mini label="扫描项目"/> : <RefreshCw size={18}/> }
            </button>
          </div>
        }
      />
      {error && (
        <p className="inline-error" role="alert">
          {error}
        </p>
      )}
      {c.github?.message && (
        <p className="scan-notice" role="status">
          {c.github.message}
        </p>
      )}
      {!!c.errors?.length && (
        <details className="scan-notice">
          <summary>{c.errors.length} 条扫描提示</summary>
          {c.errors.map((e, i) => (
            <p key={i}>{e}</p>
          ))}
        </details>
      )}
      {c.truncated && (
        <p className="scan-notice warning" role="status">
          <strong>结果不完整：</strong>
          {projectScanNotice(c)}
        </p>
      )}
      <section className={`pj-saves-sec${active.length ? "" : " pj-no-active"}`} aria-label="在推进项目">
        <div className="v14-sh">
          <span className="en">SAVE DATA</span>
          <h2>在推进 · {active.length}</h2>
          <button
            type="button"
            className="text-btn"
            title={projectStatus.checkedAt?`上次读取：${new Date(projectStatus.checkedAt).toLocaleString()}`:undefined}
            disabled={!projectStatus.loaded || !github.loaded}
            onClick={() => {
              refreshProjectStatus();
              loadGithub(true);
            }}
          >
            <RefreshCw size={14} />
            刷新
          </button>
        </div>
        {active.length > 7 && (
          <p className="scan-notice warning">
            已有 {active.length} 个在推进项目，建议收窄；通常同时推进1–3个。
          </p>
        )}
        <SourceReadError title="项目状态与体检" error={projectStatus.error}
          retained={items.some(item => projectStatus.items.some(snapshot => snapshot.projectId === item.projectId))} onRetry={refreshProjectStatus} />
        {daily.error && (
          <SourceReadError title="本机活动" error={daily.error}
            retained={items.some(item => readableCurrent(item) && (item.daily?.days?.length > 0 ||
              item.daily?.state !== "ok" && Boolean(item.daily?.note || item.daily?.reason))) ||
              Boolean(help && daily.items.some(item => item.note))} onRetry={loadDaily} />
        )}
        {github.error && (
          <SourceReadError title="GitHub 面板" error={github.error} onRetry={() => loadGithub(true)} />
        )}
        <div className={`pj-saves${launch ? " launching" : ""}`} data-read-stale={!!projectStatus.error}>
          {Array.from(
            { length: Math.ceil(Math.max(3, items.length) / columns) },
            (_, row) => (
              <React.Fragment key={row}>
                {Array.from({ length: columns }, (_, col) => {
                  const i = row * columns + col,
                    item = items[i];
                  return item ? (
                    <SaveCard
                      key={item.projectId}
                      item={item}
                      index={i}
                      savepointDays={item.savepointDays}
                      savepointWarnDays={savepointThresholds(c).warn}
                      readFailed={!!projectStatus.error||!projectStatus.loaded}
                      launch={launch?.projectId === item.projectId}
                      onDetails={() => setSelectedId(item.projectId)}
                      onContinue={async(e) => {
                        if(continueLock.current||!projectStatus.loaded)return;
                        trigger.current=e.currentTarget;continueLock.current=true;
                        try{
                          const fresh=await refreshProjectStatus();
                          if(!pageLive.current)return;
                          const current=fresh?.items.find(p=>p.projectId===item.projectId);
                          if(!current||!readableCurrent(current)){notify('当前状态读取未确认，请重读后再继续。','warning');return;}
                          setLaunch({...current,name:item.name,sourceKey:fresh.sourceKey,launchSerial:crypto.randomUUID()});
                        }finally{continueLock.current=false;}
                      }}
                    />
                  ) : i < Math.max(3, items.length) ? (
                    <button
                      type="button"
                      className="pj-save pj-vacant"
                      aria-label={`空存档 ${i + 1}，前往项目列表`}
                      key={i}
                      onClick={() => {
                        lib.current.scrollIntoView({
                          behavior: reduced ? "auto" : "smooth",
                          block: "start",
                        });
                        lib.current.focus();
                      }}
                    >
                      <span className="pj-slot">
                        <Floppy />
                        <span className="en">
                          SLOT {String(i + 1).padStart(2, "0")}
                        </span>
                      </span>
                      <span className="pj-empty-hint">
                        空存档
                        <small>
                          {library.length ? "从下面挑一盘开新档" : "先登记项目"}
                        </small>
                      </span>
                    </button>
                  ) : null;
                })}
                {launch &&
                  items.findIndex((i) => i.projectId === launch.projectId) >=
                    row * columns &&
                  items.findIndex((i) => i.projectId === launch.projectId) <
                    row * columns + columns && (
                    <ProjectLaunch
                      key={launch.projectId + launch.launchSerial}
                      item={launch}
                      liveItem={liveLaunch}
                      refreshProjectStatus={refreshProjectStatus}
                      statusReading={!projectStatus.loaded}
                      sourceKey={projectStatus.sourceKey}
                      adoptState={adoptState}
                      notify={notify}
                      onClose={closeLaunch}
                    />
                  )}
              </React.Fragment>
            ),
          )}
        </div>
      </section>
      <section
        className="pj-library"
        ref={lib}
        tabIndex={-1}
        aria-label="全部项目"
      >
        <div className="v14-sh">
          <span className="en">LIBRARY</span>
          <h2>全部项目 · {library.length}</h2>
        </div>
        {curated && <p className="pj-project-definition">主项目有独立目标、跨任务阶段和单独的状态与验收；目录、任务和资产不自动算作项目。</p>}
        {(library.length > 0 || assets.length > 0 || tasks.length > 0 || candidates.length > 0) && (
          <div className="pj-lib-tools">
            <div
              className="pj-filter"
              role="radiogroup"
              aria-label="项目来源筛选"
            >
              {[
                ["all", "全部"],
                ["local", "LOCAL"],
                ["github", "GIT"],
              ].map(([id, label]) => (
                <button
                  type="button"
                  role="radio"
                  aria-checked={filter === id}
                  className={filter === id ? "on" : ""}
                  key={id}
                  onClick={() => setFilter(id)}
                >
                  {label}
                  <b>{counts[id]}</b>
                </button>
              ))}
            </div>
            <label className="pj-search">
              <Search size={17} />
              <input
                aria-label="搜索项目"
                placeholder="搜索名称、路径"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
            </label>
          </div>
        )}
        {busy && (
          <div className="pj-skel" role="status" aria-label="正在查找项目">
            <Reading label="正在读取目录标记与 GitHub 仓库"/>
          </div>
        )}
        {!busy &&
          (curated ? groupPortfolioSections(projects, c.projectCatalog) : groupProjectRacks(projects, c.roots || [])).map((g, i) => (
            <div className="pj-rack" key={g.key}>
              <h4>
                <span className="en">
                  {curated ? "ZONE" : "RACK"} {String(i + 1).padStart(2, "0")}
                </span>
                <b title={g.label}>{g.label}</b>
                <span className="pj-rack-n en">{g.items.length}</span>
              </h4>
              <ul>
                {g.items.map((p) => (
                  <li
                    className={`pj-cs${projectSource(p) === "github" ? " git" : ""}${p.active ? " in-save" : ""}`}
                    key={p.id}
                  >
                    <button
                      className="pj-cs-tab project-discovery-row"
                      onClick={() => setSelectedId(p.id)}
                      aria-label={`项目：${p.name}`}
                    >
                      <span className="pj-cs-code en">
                        {projectSource(p) === "github" ? "GIT" : "LOCAL"}
                      </span>
                      <span className="pj-cs-name">
                        <b>{p.name}</b>
                        <PathLabel value={p.localPaths[0] || p.repoKey} />
                      </span>
                      <span className="pj-cs-tags">
                        {p.active && (
                          <span className="pj-cs-save">
                            <Floppy />
                            <span className="en">
                              SLOT {String(slots.get(p.id)).padStart(2, "0")}
                            </span>
                          </span>
                        )}
                        {p.identityConflict && (
                          <span className="pj-flag">身份待确认</span>
                        )}
                        {p.manual ? (
                          <span className="pj-flag">手工登记</span>
                        ) : !p.seenThisScan && (
                          <span className="pj-flag">本次未检出</span>
                        )}
                        {displayOnly(p) && <span className="pj-flag">仅展示</span>}
                      </span>
                      <span
                        className="pj-row-at en"
                        title={p.recentUpdate?.reason}
                      >
                        {recent(p)}
                      </span>
                    </button>
                    {!p.active && !displayOnly(p) && (
                      <ActiveToggle
                        project={p}
                        state={state}
                        adoptState={adoptState}
                        notify={notify}
                        launch
                        onPrepare={prepareFlight}
                        onMarked={() => fly(p)}
                      />
                    )}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        {!busy && !projects.length && !assets.length && !tasks.length && !candidates.length && !hidden.length && (
          <div className="pj-none">
            <Pixel sprite="koromon" size={72} />
            <p>{query ? "没有匹配的项目" : "没找到项目"}</p>
            <Button secondary onClick={() => run()}>
              <RefreshCw size={16} />
              重新扫描
            </Button>
          </div>
        )}
        {curated && assets.length > 0 && <details className="pj-pending">
          <summary>知识与工具资产 · {assets.length}<small>可持续使用的知识库、Skill 与工具，不占项目主卡</small></summary>
          <ul>{assets.map((project) => <li key={project.id}>
            <button type="button" onClick={() => setSelectedId(project.id)}>
              <strong>{project.name}</strong>
              <PathLabel value={project.localPaths[0] || project.repoKey} />
            </button>
          </li>)}</ul>
        </details>}
        {curated && tasks.length > 0 && <details className="pj-pending">
          <summary>任务与阶段成果 · {tasks.length}<small>有边界的工作和交付，保留入口与未完成状态</small></summary>
          <ul>{tasks.map((project) => <li key={project.id}>
            <button type="button" onClick={() => setSelectedId(project.id)}>
              <strong>{project.name}</strong>
              <PathLabel value={project.localPaths[0] || project.repoKey} />
            </button>
          </li>)}</ul>
        </details>}
        {curated && candidates.length > 0 && <details className="pj-pending">
          <summary>待归类与待判定 · {candidates.length}<small>扫描发现或尚未确认用途</small></summary>
          <ul>{candidates.map((project) => <li key={project.id}>
            <button type="button" onClick={() => setSelectedId(project.id)}>
              <strong>{project.name}</strong>
              <PathLabel value={project.localPaths[0] || project.repoKey} />
            </button>
          </li>)}</ul>
        </details>}
        {curated && hidden.length > 0 && <details className="pj-pending">
          <summary>隐藏来源 · {hidden.length}<small>文件容器与历史副本，可在详情重新分类</small></summary>
          <ul>{hidden.map((project) => <li key={project.id}>
            <button type="button" onClick={() => setSelectedId(project.id)}>
              <strong>{project.name}</strong>
              <PathLabel value={project.localPaths[0] || project.repoKey} />
            </button>
          </li>)}</ul>
        </details>}
      </section>
      {!!state.projects?.length && (
        <details className="legacy-records">
          <summary>旧登记记录 · {state.projects.length}</summary>
          {state.projects.map((p) => (
            <div key={p.id}>
              <strong>{p.name}</strong>
              <p>{p.location || p.path || p.note || "未验证"}</p>
            </div>
          ))}
        </details>
      )}
      {selected && (
        <Dialog
          title={selected.name}
          drawer
          onClose={() => setSelectedId(null)}
        >
          <div className="asset-form pj-detail">
            <header>
              <h2>{selected.name}</h2>
              {selected.originalName !== selected.name && <p className="detail-footnote">来源名称 · {selected.originalName}</p>}
              {catalog.get(selected.id)?.note && <p className="detail-footnote">{catalog.get(selected.id).note}</p>}
              <Badge tone="muted">
                {selected.localPaths.length ? "LOCAL" : "GITHUB"}
              </Badge>
              <p>最近更新 · {recent(selected)}</p>
              {selected.recentUpdate?.reason && (
                <p role="status">{selected.recentUpdate.reason}</p>
              )}
              {selected.description && (
                <p className="body-copy">{selected.description}</p>
              )}
            </header>
            <ProjectCatalogEditor key={selected.id} project={selected} state={state} adoptState={adoptState} notify={notify} />
            {curated && (c.projectCatalog || []).some((item) => item.parentId === selected.id) && <section aria-label="附属目录与阶段材料">
              <h3>附属目录与阶段材料</h3>
              {(c.projectCatalog || []).filter((item) => item.parentId === selected.id).map((item) => {
                const child = all.find((p) => p.id === item.projectId);
                return child ? <button className="text-btn" key={child.id} onClick={() => setSelectedId(child.id)}>{child.name}</button> : null;
              })}
            </section>}
            <section aria-label="状态">
              <h3>状态</h3>
              {displayOnly(selected)
                ? <p className="detail-footnote">这个手工项目位于当前扫描范围外，仅作目录入口展示；在推进、状态体检、上下文连接和规则操作暂不可用。</p>
                : !selected.active && !mainProject(selected)
                  ? <p className="detail-footnote">此入口属于任务、资产或待核来源。确认有独立目标与项目级状态后，先改为「独立项目」，再标记在推进。</p>
                  : <ActiveToggle
                    project={selected}
                    state={state}
                    adoptState={adoptState}
                    notify={notify}
                  />}
              {selected.branch && <p>分支 · {selected.branch}</p>}
              {(() => {
                const item = items.find((i) => i.projectId === selected.id);
                return item ? (
                  <>
                    {projectStatus.error && <p className="detail-footnote" role="status">上次读取结果，当前状态与体检待核实；关闭详情后可在项目状态提示处重试。</p>}
                    <div className={projectStatus.error ? "read-failed" : ""}><CurrentBlock current={item.current} /></div>
                    <p>
                      最近活动：
                      {date(
                        readableCurrent(item) ? item.activity?.latestAt : null,
                      )}{" "}
                      ·{" "}
                      {readableCurrent(item) &&
                      item.activity?.state === "stalled"
                        ? `停滞 ${item.activity.idleDays} 天`
                        : readableCurrent(item) &&
                            item.activity?.state === "active"
                          ? `${c.projectStallDays || 7} 天内有更新`
                          : "未知，不当作停滞"}
                    </p>
                    <p>
                      当前阶段：{item.stage?.label || "未知"} ·{" "}
                      {item.stage?.basis || "当前记录不足以推断"}
                    </p>
                    {!projectStatus.error && item.safety?.checks?.git ? (
                      <SafetyBlock safety={item.safety} />
                    ) : (
                      <p>
                        {projectStatus.error
                          ? "体检未知，请在项目状态提示处重试"
                          : !projectStatus.loaded ? <Reading mini label="体检读取中"/> : "体检待核实"}
                      </p>
                    )}
                    <GithubBlock
                      github={
                        github.items.find((g) => g.projectId === selected.id)
                          ?.github
                      }
                      loading={!github.loaded}
                    />
                  </>
                ) : (
                  !displayOnly(selected) && <p>标为在推进后读取状态、体检与 GitHub。</p>
                );
              })()}
              {selected.githubUrl && (
                <a
                  className="button secondary external-button"
                  href={selected.githubUrl}
                  target="_blank"
                  rel="noreferrer"
                >
                  <Github size={16} />
                  打开 GitHub
                  <ArrowUpRight size={15} />
                </a>
              )}
              <p className="detail-footnote">
                本地检测 {date(selected.localSeenAt)} · GitHub 检测{" "}
                {date(selected.githubSeenAt)}
              </p>
            </section>
            {!displayOnly(selected) && <section aria-label="位置">
              <h3>位置</h3>
              <ProjectLocations
                key={selected.id}
                project={selected}
                identityIssueRoot={projectStatus.error ? '' : projectStatus.items.find(item => item.projectId === selected.id && item.current?.code === 'DIRECTORY_IDENTITY_CHANGED')?.root || ''}
                state={state}
                adoptState={adoptState}
                notify={notify}
              />
            </section>}
            {!displayOnly(selected) && <section aria-label="连接">
              <h3>连接</h3>
              <ProjectContext
                key={selected.id}
                project={selected}
                state={state}
                adoptState={adoptState}
                notify={notify}
              />
            </section>}
            {!displayOnly(selected) && <section aria-label="规则">
              <h3>规则</h3>
              <ProjectRules
                project={selected}
                state={state}
                installs={ruleInstalls}
                refresh={refreshRuleInstalls}
              />
            </section>}
          </div>
        </Dialog>
      )}
      {settings && <Dialog title="项目空间设置" drawer onClose={closeSettings}><ProjectSettings state={state} adoptState={adoptState} notify={notify} onBusyChange={v=>{settingsBusy.current=v;}}/></Dialog>}
      {help && (
        <Dialog title="项目空间 · 这页怎么用" onClose={() => setHelp(false)}>
          <div className="asset-form">
            <p>
              挑存档 → 继续 → 选伙伴 → 预览口令 →
              复制。带到伙伴只打开已检测应用，粘贴和发送由你完成。
            </p>
            <p>
              本地 · {c.roots?.length || 0} 个目录；GitHub ·{" "}
              {c.github?.login || "未连接"}。扫描于 {date(c.projectScannedAt)}。
            </p>
            <p>
              扫描只读项目标记和 Git 时间；状态来自项目自己的 CURRENT、Git 与
              GitHub。未知或不完整不代表没有活动。根目录与停滞阈值在设置抽屉。
            </p>
            {[...new Set(daily.items.map((i) => i.note).filter(Boolean))].map(
              (note) => (
                <p key={note} className="detail-footnote">
                  {note}
                </p>
              ),
            )}
          </div>
        </Dialog>
      )}
      {flight && !reduced && (
        <div
          className="pj-flight"
          aria-hidden="true"
          style={{
            left: flight.from.x,
            top: flight.from.y,
            width: flight.from.width,
            height: flight.from.height,
            "--flight-x": `${flight.to.x - flight.from.x}px`,
            "--flight-y": `${flight.to.y - flight.from.y}px`,
          }}
        >
          {flight.name}
        </div>
      )}
    </div>
  );
}
