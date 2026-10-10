import { DiffSummary } from "./DiffSummary.jsx";
import { savepointThresholds } from "./settings-v16.js";
import React, { useEffect, useLayoutEffect, useRef, useState } from "react";
import {
  Cloud,
  CloudOff,
  Power,
  ShieldAlert,
  GitCompare,
  Undo2,
  Check,
  RefreshCw,
  ChevronDown,
} from "lucide-react";
import { PageHeading, Button, Dialog, Empty } from "./components.jsx";
import { request } from "./api.js";
import { Floppy } from "./ProjectsV16.jsx";
import "./savepoints-v16.css";
const date = (v) =>
  v
    ? new Date(v).toLocaleString("zh-CN", {
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
      })
    : "未知";
const count = (v) => (v == null ? "未知" : v.toLocaleString("zh-CN"));
export function savepointRollbackText(project, commit, dirty, root) {
  return `请在项目“${project.name}”（${root || project.repoKey || project.githubUrl || "位置未知"}）中核对存档点 ${commit.hash}（${commit.message}）。\n${dirty ? "当前有未存档改动，建议先创建存档点并核对所选文件，再评估回退。" : "当前未存档状态以重新读取为准。"}\n先读取项目入口与当前状态，向我说明回退影响、需要保留的改动和可恢复办法，得到明确授权后再执行回退。此口令本身不执行 Git。`;
}
function Label({ value, className = "" }) {
  const ref = useRef(),
    [text, setText] = useState(value);
  useLayoutEffect(() => {
    let alive = true;
    const el = ref.current,
      ctx = document.createElement("canvas").getContext("2d");
    const fit = () => {
      if (!alive) return;
      ctx.font = getComputedStyle(el).font;
      let chars = [...String(value)],
        w = el.clientWidth;
      if (ctx.measureText(chars.join("")).width > w) {
        while (chars.length && ctx.measureText(chars.join("") + "…").width > w)
          chars.pop();
        setText(chars.join("") + "…");
      } else setText(String(value));
    };
    fit();
    const obs = new ResizeObserver(fit);
    obs.observe(el);
    document.fonts.ready.then(fit);
    return () => {
      alive = false;
      obs.disconnect();
    };
  }, [value]);
  return (
    <span ref={ref} className={className} title={value} aria-label={value}>
      {text}
    </span>
  );
}
function FileList({
  files,
  preview = false,
  selected = [],
  onToggle = () => {},
  disabled = false,
}) {
  const [shown, setShown] = useState(new Set()),
    [all, setAll] = useState(false);
  const row = (f) => (
    <li
      className={preview && !selected.includes(f.path) ? "off" : ""}
      key={f.path}
    >
      {preview ? (
        <label>
          <input
            type="checkbox"
            aria-label={f.path}
            disabled={disabled || !!f.blocked || !!f.generated}
            checked={selected.includes(f.path)}
            onChange={() => onToggle(f.path)}
          />
          <span
            className={`sn-box${selected.includes(f.path) ? " on" : ""}`}
            aria-hidden="true"
          >
            {selected.includes(f.path) && <Check size={12} />}
          </span>
          <span className={"sp-ft " + f.kind}>{f.kind}</span>
          <Label className="mono sp-file-name" value={f.path} />
          {(f.warning || f.blocked) && <em>{f.blocked || f.warning}</em>}
        </label>
      ) : (
        <>
          <span className={"sp-ft " + (f.kind || "M")}>{f.kind || "M"}</span>
          <Label className="mono sp-file-name" value={f.path} />
          <span className="mono sp-fn">
            +{count(f.added)} −{count(f.deleted)}
          </span>
        </>
      )}
    </li>
  );
  if (!preview)
    return (
      <ul className="sp-files">
        {(all ? files : files.slice(0, 4)).map(row)}
        {files.length > 4 && (
          <li className="sp-files-more">
            <button
              type="button"
              className="text-btn"
              onClick={() => setAll(!all)}
            >
              {all ? "收起文件清单" : `还有 ${files.length - 4} 个文件 · 展开`}
            </button>
          </li>
        )}
      </ul>
    );
  const groups = new Map();
  for (const f of files) {
    const name = f.path.includes("/") ? f.path.split("/")[0] + "/" : "根目录";
    if (!groups.has(name)) groups.set(name, []);
    groups.get(name).push(f);
  }
  return (
    <div className="sp-pick">
      {[...groups].map(([name, rows]) => (
        <section key={name}>
          <h4>
            <span className="mono">{name}</span>
            <b className="mono">{rows.length}</b>
          </h4>
          <ul>
            {(shown.has(name) ? rows : rows.slice(0, 4)).map(row)}
            {rows.length > 4 && (
              <li className="sp-files-more">
                <button
                  type="button"
                  className="text-btn"
                  disabled={disabled}
                  onClick={() =>
                    setShown((t) =>
                      t.has(name)
                        ? new Set([...t].filter((n) => n !== name))
                        : new Set([...t, name]),
                    )
                  }
                >
                  {shown.has(name)
                    ? "收起"
                    : `还有 ${rows.length - 4} 个 · 展开`}
                </button>
              </li>
            )}
          </ul>
        </section>
      ))}
    </div>
  );
}
export function HistoryArchive({
  state,
  notify,
  navigate,
  projectId: targetProject,
  onSavepointRead = () => {},
}) {
  const projects = [...(state.connections?.projects || [])].sort(
    (a, b) =>
      Number(b.active) - Number(a.active) ||
      (a.active && b.active
        ? 0
        : (Date.parse(b.recentUpdate?.at) || 0) -
          (Date.parse(a.recentUpdate?.at) || 0)) ||
      a.id.localeCompare(b.id),
  );
  const [picked, setPicked] = useState(targetProject || projects[0]?.id),
    [root, setRoot] = useState(""),
    [data, setData] = useState(null),
    [error, setError] = useState(""),
    [loading, setLoading] = useState(false),
    [preview, setPreview] = useState(null),
    [selected, setSelected] = useState([]),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false),
    [pending, setPending] = useState([]),
    [expanded, setExpanded] = useState(new Set()),
    [details, setDetails] = useState({}),
    [textView, setTextView] = useState(null),
    [help, setHelp] = useState(false),
    [receipt, setReceipt] = useState("");
  const draftRef = useRef("");
  const project = projects.find((p) => p.id === picked),
    generation = useRef(0),
    writeLock = useRef(false),
    alive = useRef(true),
    commitTrigger = useRef(null);
  const input = () => ({ projectId: picked, ...(root ? { root } : {}) });
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      generation.current++;
    };
  }, []);
  useLayoutEffect(() => {
    generation.current++;
    setData(null);
    setPending([]);
    setPreview(null);
    setTextView(null);
    setDetails({});
    setExpanded(new Set());
  }, [picked, root, state.revision]);
  useEffect(() => {
    if (targetProject) setPicked(targetProject);
  }, [targetProject]);
  useEffect(() => {
    if (!projects.some((p) => p.id === picked)) setPicked(projects[0]?.id);
  }, [state.revision]);
  useEffect(() => {
    setRoot(project?.localPaths.length === 1 ? project.localPaths[0] : "");
    setData(null);
    setError("");
    setReceipt("");
    setExpanded(new Set());
    setDetails({});
  }, [picked]);
  async function load(more = false) {
    if (!project) return;
    const n = ++generation.current;
    setLoading(true);
    setError("");
    try {
      const r = await request("/savepoints/inspect", {
        ...input(),
        ...(more ? { offset: data.offset + 20 } : {}),
      });
      if (!alive.current || n !== generation.current) return;
      if (more && r.head !== data.head) {
        setError("分页期间HEAD已变化，请刷新后重新读取");
        return;
      }
      if (!more)
        onSavepointRead({
          projectId: picked,
          root: root || project.localPaths[0] || null,
          lastAt: r.last?.at || null,
          locations: JSON.stringify(project.locations || project.localPaths),
        });
      setData(
        more
          ? {
              ...data,
              commits: [
                ...new Map(
                  [...data.commits, ...r.commits].map((c) => [c.hash, c]),
                ).values(),
              ],
              offset: r.offset,
              hasMore: r.hasMore,
            }
          : r,
      );
      if (!more && r.commits.length && r.state === "main") {
        setExpanded(new Set([r.commits[0].hash]));
        setDetails({
          [r.commits[0].hash]: { files: r.commits[0].files || [] },
        });
      }
      try {
        const p = await request("/savepoints/pending", { projectId: picked });
        if (alive.current && n === generation.current) setPending(p.items);
      } catch (e) {
        if (alive.current && n === generation.current)
          setError("未完成操作查询失败：" + e.message);
      }
    } catch (e) {
      if (alive.current && n === generation.current) {
        if (!more) setData(null);
        setError(e.message);
      }
    } finally {
      if (alive.current && n === generation.current) setLoading(false);
    }
  }
  useEffect(() => {
    if (project && (project.localPaths.length <= 1 || root)) load();
  }, [picked, root, state.revision]);
  async function prepare(mode, event) {
    if (writeLock.current || pending.length) return;
    writeLock.current = true;
    setBusy(true);
    setError("");
    commitTrigger.current = event.currentTarget;
    const n = generation.current;
    try {
      const p = await request("/savepoints/preview", { ...input(), mode });
      if (!alive.current || n !== generation.current) return;
      setPreview({
        ...p,
        projectName: project.name,
        root: root || project.localPaths[0],
      });
      setSelected(
        p.files.filter((f) => f.selected && !f.blocked).map((f) => f.path),
      );
      setMessage(draftRef.current || p.message);
      draftRef.current = "";
    } catch (e) {
      if (alive.current && n === generation.current) setError(e.message);
    } finally {
      writeLock.current = false;
      if (alive.current) setBusy(false);
    }
  }
  function closePreview() {
    if (busy || pending.length) return;
    setPreview(null);
    requestAnimationFrame(() => {
      if (commitTrigger.current?.isConnected) commitTrigger.current.focus();
    });
  }
  async function confirm() {
    const n = generation.current;
    if (writeLock.current || !preview) return;
    writeLock.current = true;
    setBusy(true);
    setError("");
    try {
      const r = await request(
        "/savepoints/confirm",
        { id: preview.id, files: selected, message, confirmed: true },
        "POST",
        false,
      );
      if (!alive.current || n !== generation.current) return;
      if (r.state === "verified") {
        setPreview(null);
        setReceipt("已存档 · " + r.hash.slice(0, 12));
        notify("已创建存档点并回读");
        await load();
      } else {
        setPending([{ id: preview.id }]);
        setError(r.reason || "结果未知，请先查询");
      }
    } catch (e) {
      if (alive.current) {
        setError(e.message);
        if (!e.status || e.status >= 500) setPending([{ id: preview.id }]);
      }
    } finally {
      writeLock.current = false;
      if (alive.current) setBusy(false);
    }
  }
  async function query(id) {
    const n = generation.current;
    if (writeLock.current) return;
    writeLock.current = true;
    setBusy(true);
    try {
      const r = await request("/savepoints/query", { id });
      if (!alive.current || n !== generation.current) return;
      if (r.state === "verified") {
        setPreview(null);
        setReceipt("已核实存档 · " + r.hash.slice(0, 12));
        notify("原操作已查回，没有重复提交");
        await load();
      } else if (r.state === "not_started") {
        draftRef.current = message;
        setPending((v) => v.filter((p) => p.id !== id));
        setPreview(null);
        setError("操作尚未开始，说明草稿已保留；请重新预览");
      } else setError(r.reason || "结果未知，请继续核对原操作");
    } catch (e) {
      if (alive.current && n === generation.current) setError(e.message);
    } finally {
      writeLock.current = false;
      if (alive.current) setBusy(false);
    }
  }
  async function expand(commit) {
    if (expanded.has(commit.hash)) {
      setExpanded(new Set([...expanded].filter((h) => h !== commit.hash)));
      return;
    }
    setExpanded(new Set([...expanded, commit.hash]));
    const n = generation.current;
    try {
      const r = await request("/savepoints/detail", {
        ...input(),
        hash: commit.hash,
      });
      if (alive.current && n === generation.current)
        setDetails((d) => ({ ...d, [commit.hash]: r }));
    } catch (e) {
      if (alive.current && n === generation.current) setError(e.message);
    }
  }
  async function view(action, commit) {
    const n = generation.current;
    try {
      const r = await request("/savepoints/" + action, {
        ...input(),
        ...(action === "handoff"
          ? { stateId: commit.stateId }
          : { hash: commit.hash }),
      });
      if (alive.current && n === generation.current)
        setTextView({
          title:
            action === "handoff" ? commit.stateId + " · 交接" : "与现在对比",
          text: r.text,
          note: [r.truncated ? "结果已截断，不代表完整对比" : "", r.untracked ? `另有 ${r.untracked} 个未跟踪文件，不在Git diff正文里` : ""].filter(Boolean).join("；"),
          comparison: action === "compare" ? {...r,baseHash:commit.hash,observedAt:new Date().toISOString()} : null,
        });
    } catch (e) {
      if (alive.current && n === generation.current) setError(e.message);
    }
  }
  const thresholds = savepointThresholds(state.connections),
    dirty = (data?.files?.length || 0) > 0,
    risk = (data?.ageDays ?? data?.days) > thresholds.danger ? "bad" : (data?.ageDays ?? data?.days) > thresholds.warn ? "warn" : "ok",
    warnings = preview?.files.filter((f) => f.warning || f.blocked) || [],
    stat = data?.stats;
  return (
    <div className="sp-v16">
      <PageHeading
        page="history"
        help={
          <button
            className="page-help"
            aria-label="存档点怎么用"
            onClick={() => setHelp(true)}
          >
            ?
          </button>
        }
      />
      {!!projects.length && (
        <div className="sp-tabs" role="tablist" aria-label="项目">
          {projects.map((p, i) => {
            const days =
                p.id === picked && data
                  ? (data.ageDays ?? data.days)
                  : !p.identityConflict &&
                      p.recentUpdate?.state === "ok" &&
                      p.recentUpdate?.source === "Git" &&
                      p.recentUpdate.at
                    ? Math.max(0, (Date.now() - Date.parse(p.recentUpdate.at)) / 86400000)
                    : null,
              dot = !p.localPaths.length
                ? "cloud"
                : p.kind !== "Git"
                  ? "nogit"
                  : days == null
                    ? "unknown"
                    : days > thresholds.danger
                      ? "bad"
                      : days > thresholds.warn
                        ? "warn"
                        : "ok";
            return (
              <button
                type="button"
                role="tab"
                aria-selected={picked === p.id}
                aria-controls="savepoint-project"
                tabIndex={picked === p.id ? 0 : -1}
                className={"sp-tab" + (picked === p.id ? " on" : "")}
                key={p.id}
                disabled={busy}
                onClick={() => setPicked(p.id)}
                onKeyDown={(e) => {
                  const j =
                    e.key === "Home"
                      ? 0
                      : e.key === "End"
                        ? projects.length - 1
                        : ["ArrowRight", "ArrowDown"].includes(e.key)
                          ? (i + 1) % projects.length
                          : ["ArrowLeft", "ArrowUp"].includes(e.key)
                            ? (i + projects.length - 1) % projects.length
                            : null;
                  if (j == null) return;
                  e.preventDefault();
                  setPicked(projects[j].id);
                  e.currentTarget.parentElement.children[j].focus();
                }}
              >
                <i className={"sp-dot " + dot} aria-hidden="true">
                  {dot === "cloud" && <Cloud size={11} />}
                </i>
                {p.name}
                {p.active && <span className="en">ACTIVE</span>}
              </button>
            );
          })}
        </div>
      )}
      <div
        id="savepoint-project"
        role="tabpanel"
        aria-label={project?.name || "项目存档点"}
      >
        {project?.localPaths.length > 1 && (
          <label className="sp-location">
            本机位置
            <select
              value={root}
              aria-label="选择存档位置"
              disabled={busy}
              onChange={(e) => setRoot(e.target.value)}
            >
              <option value="">请选择已登记的位置</option>
              {project.localPaths.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
          </label>
        )}
        {loading && !data && (
          <p role="status" className="sp-loading">
            正在读取存档点…
          </p>
        )}
        {error && (
          <p className="inline-error" role="alert">
            {error}
          </p>
        )}
        {receipt && (
          <p role="status" className="sp-receipt">
            {receipt}
          </p>
        )}
        {pending.map((p) => (
          <Button
            secondary
            key={p.id}
            disabled={busy}
            onClick={() => query(p.id)}
          >
            查询结果
          </Button>
        ))}
        {data?.reason && data.state !== "cloud" && (
          <p className="subtle-notice" role="status">
            {data.reason}
          </p>
        )}
        {data?.state === "nogit" ? (
          <section className="sp-pending nogit" aria-label="未开启存档">
            <div className="sp-pend-main">
              <span className="en">NO SAVE DATA · 未开启存档</span>
              <h2>{project.name}还没开启存档</h2>
              <p className="sp-pend-since">
                <span className="mono">{data.root}</span> 不是 Git
                项目；开启后会初始化
                Git、保留已有忽略规则或写入默认规则，并存下第一个存档点
              </p>
              <div className="sp-ignore">
                <span className="en">.GITIGNORE · 默认忽略</span>
                {["node_modules/", ".env*", "dist/", ".DS_Store", "*.log"].map(
                  (x) => (
                    <code key={x}>{x}</code>
                  ),
                )}
              </div>
            </div>
            <div className="sp-pend-act">
              <Button
                className="sp-save"
                disabled={busy || data.readOnly || !!pending.length}
                onClick={(e) => prepare("init", e)}
              >
                <Power size={16} />
                开启存档
              </Button>
              <span className="sp-pend-note en">PREVIEW FIRST · 先预览</span>
            </div>
          </section>
        ) : data?.state === "cloud" ? (
          <div className="sp-cloudonly">
            <Cloud size={18} />
            <span>
              <b>{project.name}</b> 只在 GitHub 上 ·
              本机没有副本，只能查看存档点
            </span>
          </div>
        ) : (
          data && (
            <section
              className={
                "sp-pending " + (data.state === "empty" ? "new" : risk)
              }
              aria-label="未存档进度"
            >
              <div className="sp-pend-main">
                <span className="en">UNSAVED PROGRESS · 未存档进度</span>
                <h2>
                  {data.state === "empty" ? (
                    "还没有任何存档点"
                  ) : data.days == null ? (
                    "未存档时长未知"
                  ) : data.days === 0 ? (
                    "今天已经存档"
                  ) : (
                    <>
                      已经 <b>{data.days} 天</b>没存档了
                    </>
                  )}
                </h2>
                <p className="sp-pend-since">
                  {data.last ? (
                    <>
                      上次存档{" "}
                      <span className="mono">{date(data.last.at)}</span>
                      {data.last.stateId && (
                        <>
                          {" "}
                          · <span className="mono">{data.last.stateId}</span>
                        </>
                      )}
                    </>
                  ) : data.state === "empty" ? (
                    <>
                      <span className="mono">{data.root}</span>{" "}
                      刚开启存档，还没提交过；先存第一个存档点
                    </>
                  ) : (
                    "状态读取未完成，不能判为没有存档点"
                  )}
                </p>
                <div className="sp-pend-stats">
                  <span>
                    <b className="mono">{count(stat?.modified)}</b>
                    <small>修改</small>
                  </span>
                  <span>
                    <b className="mono">{count(stat?.added)}</b>
                    <small>
                      新增{stat?.deleted ? " · 删除 " + stat.deleted : ""}
                    </small>
                  </span>
                  <span>
                    <b className="mono add">+{count(stat?.insertions)}</b>
                    <small>行</small>
                  </span>
                  <span>
                    <b className="mono del">−{count(stat?.deletions)}</b>
                    <small>
                      行{stat?.binary ? " · 二进制 " + stat.binary : ""}
                    </small>
                  </span>
                </div>
                <div className="sp-dirs" aria-label="主要改动目录">
                  {data.directories.map((d) => (
                    <span
                      className="sp-dir"
                      key={d.name}
                      style={{
                        "--w": `${(d.count / (data.files.length || 1)) * 100}%`,
                      }}
                    >
                      <i />
                      <Label className="mono" value={d.name} />
                      <b className="mono">{d.count}</b>
                    </span>
                  ))}
                </div>
              </div>
              <div className="sp-pend-act">
                <Button
                  className="sp-save"
                  disabled={busy || data.readOnly || !dirty || !!pending.length}
                  onClick={(e) => prepare("commit", e)}
                >
                  <Floppy />
                  创建存档点
                </Button>
                <span className="sp-pend-note en">ONLY COMMIT · 不推送</span>
              </div>
            </section>
          )
        )}
        {data && data.state !== "nogit" && (
          <section className="sp-line-sec" aria-label="存档点时间线">
            <div className="sec-head">
              <h2 className="en-head">
                <span className="en">SAVE POINTS</span>存档点 ·{" "}
                {count(data.total)}
              </h2>
              {data.state === "cloud" ? (
                <span className="sec-meta">
                  仅云端 · 只读{data.tagPartial ? " · 标签仅前100项" : ""}
                </span>
              ) : (
                <span className="sp-cloud">
                  <CloudOff size={15} />
                  <b className="mono">{count(data.ahead)}</b> 个存档点还没推送到
                  GitHub
                </span>
              )}
            </div>
            {data.commits.length ? (
              <ol className="sp-line">
                {data.commits.map((c) => (
                  <li
                    className={`sp-pt${c.tags.length ? " mile" : ""}${expanded.has(c.hash) ? " open" : ""}`}
                    key={c.hash}
                  >
                    <span className="sp-node" aria-hidden="true">
                      <Floppy />
                    </span>
                    <div className="sp-card">
                      <div className="sp-card-head">
                        {c.tags.map((t) => (
                          <span className="sp-tag en" key={t}>
                            {t}
                          </span>
                        ))}
                        <button
                          className="sp-expand"
                          aria-expanded={expanded.has(c.hash)}
                          aria-label={`展开存档点 ${c.hash.slice(0, 7)}`}
                          onClick={() => expand(c)}
                        >
                          <b>{c.message}</b>
                          <ChevronDown size={15} />
                        </button>
                        {c.localOnly && (
                          <span className="sp-local en">未上云</span>
                        )}
                        <span className="en sp-at">{date(c.at)}</span>
                      </div>
                      <div className="sp-card-meta">
                        <span className="mono">{c.hash.slice(0, 7)}</span>
                        {c.stateId &&
                          (c.handoff ? (
                            <button
                              className="sp-wb mono"
                              onClick={() => view("handoff", c)}
                            >
                              {c.stateId} · 交接
                            </button>
                          ) : (
                            <span className="sp-wb mono">{c.stateId}</span>
                          ))}
                        <span>
                          <b className="mono">
                            {count(
                              details[c.hash]?.files?.length ?? c.fileCount,
                            )}
                          </b>{" "}
                          个文件
                        </span>
                        <span className="mono add">
                          +
                          {count(
                            details[c.hash]?.files?.reduce(
                              (n, f) => n + (f.added || 0),
                              0,
                            ) ?? c.insertions,
                          )}
                        </span>
                        <span className="mono del">
                          −
                          {count(
                            details[c.hash]?.files?.reduce(
                              (n, f) => n + (f.deleted || 0),
                              0,
                            ) ?? c.deletions,
                          )}
                        </span>
                      </div>
                      {expanded.has(c.hash) && (
                        <>
                          <FileList files={details[c.hash]?.files || []} />
                          {details[c.hash]?.partial && (
                            <p role="status">云端文件清单不完整</p>
                          )}
                          <div className="sp-card-act">
                            {data.state !== "cloud" && (
                              <Button
                                secondary
                                onClick={() => view("compare", c)}
                              >
                                <GitCompare size={15} />
                                与现在对比
                              </Button>
                            )}
                            <button
                              type="button"
                              className="text-btn"
                              onClick={async () => {
                                try {
                                  await navigator.clipboard.writeText(
                                    savepointRollbackText(
                                      project,
                                      c,
                                      dirty,
                                      data.root,
                                    ),
                                  );
                                  notify("已复制回退口令，未执行Git");
                                } catch {
                                  notify("复制未确认，请重试", "error");
                                }
                              }}
                            >
                              <Undo2 size={15} />
                              生成回退口令
                            </button>
                          </div>
                        </>
                      )}
                    </div>
                  </li>
                ))}
              </ol>
            ) : (
              <div className="sp-none">
                <Floppy />
                <p>{data.readOnly ? "存档点读取未知" : "还没有存档点"}</p>
                <small>
                  {data.readOnly
                    ? "先处理读取原因，再重新读取"
                    : "创建第一个存档点后，会从这里开始排起"}
                </small>
              </div>
            )}
            <div className="sp-line-actions">
              {data.hasMore && <Button secondary disabled={loading} onClick={()=>load(true)}>更多存档点</Button>}
              <Button secondary className="sp-refresh" disabled={loading||busy} onClick={()=>load()}><RefreshCw size={14}/>刷新存档点</Button>
            </div>
          </section>
        )}
        {!projects.length && (
          <Empty title="还没有项目">
            <Button secondary onClick={() => navigate("projects")}>
              到项目空间扫描
            </Button>
          </Empty>
        )}
        {project && (!data || data.state === "nogit") && (
          <button
            type="button"
            className="text-btn sp-refresh"
            disabled={loading || busy}
            onClick={() => load()}
          >
            <RefreshCw size={14} />
            刷新存档点
          </button>
        )}
      </div>
      {preview && (
        <Dialog
          title={preview.mode === "init" ? "开启存档预览" : "创建存档点"}
          drawer
          recoverFocus
          onClose={closePreview}
        >
          <div className="sp-sheet-body">
            <header className="sp-sheet-head">
              <span className="en">NEW SAVE POINT · {preview.projectName}</span>
              <h2>{preview.mode === "init" ? "开启存档" : "创建存档点"}</h2>
            </header>
            <label className="sp-msg">
              <span className="en">MESSAGE · 存档说明</span>
              <textarea
                aria-label="存档说明"
                rows={2}
                maxLength={300}
                disabled={busy || !!pending.length}
                value={message}
                onChange={(e) => setMessage(e.target.value)}
              />
            </label>
            <div>
              {warnings.length > 0 && (
                <div className="sp-warn">
                  <ShieldAlert size={16} />
                  <span>
                    {warnings.length} 个文件默认不存：
                    {warnings.map((f) => (
                      <span key={f.path}>
                        <b>{f.path}</b> {f.blocked || f.warning}；
                      </span>
                    ))}
                  </span>
                </div>
              )}
              {preview.defaultIgnore && (
                <details className="sp-ignore-preview">
                  <summary>默认忽略规则（已有文件保留）</summary>
                  <pre>{preview.defaultIgnore}</pre>
                </details>
              )}
              {error && (
                <p className="inline-error" role="alert">
                  {error}
                </p>
              )}
            </div>
            <FileList
              files={preview.files}
              preview
              disabled={busy || !!pending.length}
              selected={selected}
              onToggle={(path) => {
                if (!busy && !pending.length)
                  setSelected((s) =>
                    s.includes(path)
                      ? s.filter((p) => p !== path)
                      : [...s, path],
                  );
              }}
            />
            <footer className="sp-sheet-foot">
              <span className="mono">
                {selected.length} / {preview.files.length} 个文件 · +
                {count(
                  preview.files
                    .filter((f) => selected.includes(f.path))
                    .reduce((n, f) => n + (f.added || 0), 0),
                )}{" "}
                −
                {count(
                  preview.files
                    .filter((f) => selected.includes(f.path))
                    .reduce((n, f) => n + (f.deleted || 0), 0),
                )}
              </span>
              <Button
                secondary
                disabled={busy || !!pending.length}
                onClick={closePreview}
              >
                取消
              </Button>
              {pending.length ? (
                <Button disabled={busy} onClick={() => query(pending[0].id)}>
                  查询结果
                </Button>
              ) : (
                <Button
                  className="sp-save"
                  disabled={busy || !selected.length || !message.trim()}
                  onClick={confirm}
                >
                  <Floppy />
                  {busy
                    ? "存档中…"
                    : preview.mode === "init"
                      ? "确认开启并存档"
                      : "创建存档点"}
                </Button>
              )}
            </footer>
          </div>
        </Dialog>
      )}
      {textView && (
        <Dialog title={textView.title} drawer onClose={() => setTextView(null)}>
          <div className="sp-text-view">
            {textView.note && <p role="status">{textView.note}</p>}
            {textView.comparison && <DiffSummary comparison={textView.comparison}/>}
            <pre tabIndex={0}>{textView.text || "没有已跟踪的正文差异"}</pre>
          </div>
        </Dialog>
      )}
      {help && (
        <Dialog title="存档点 · 这页怎么用" onClose={() => setHelp(false)}>
          <div className="asset-form">
            <p>
              选项目 → 预览文件与存档说明 → 确认创建 →
              核对新提交哈希。页面只提交、不推送；回退口令只复制给Agent。
            </p>
            <p>
              警告文件默认不选，正文疑似凭据、特殊文件与超限文件不能选。结果未知先查询原操作，不重复提交。目录身份变化返回项目空间确认。
            </p>
            <p>
              未上云只比较本机已有远端跟踪记录，无跟踪或读取失败显示未知；二进制不编行数，状态更新次数不推断。
            </p>
          </div>
        </Dialog>
      )}
    </div>
  );
}
