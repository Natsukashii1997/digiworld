import React, { useCallback, useEffect, useRef, useState } from "react";
import { Play } from "lucide-react";
import { Reading, ReadReveal } from "./ScanMotion.jsx";
import { SourceReadError } from "./components.jsx";
import { request } from "./api.js";
import { current } from "./store.js";
import { AssetCopyButton } from "./Assets.jsx";
import { usageByAsset, usageTime } from "./asset-usage.js";
import { parseStoredNote } from "./note-document.js";
import { notePaper } from "./note-paper.js";
import { hasNoteContent, noteTitle } from "./note-types.js";
import { deskRows } from "./ProjectDesk.jsx";
import { readableCurrent } from "./projects-v16.js";
import { linkText } from "./collab.js";

const TYPES = [["Prompt", "Prompt"], ["Skill", "Skill"], ["Workflow", "工作流"], ["Rule", "规则"], ["MCP", "MCP"], ["Scroll", "焚决"], ["Design", "设计"]];
const sameDay = (value, now) => Number.isFinite(Date.parse(value)) && new Date(value).toDateString() === new Date(now).toDateString();
// 最近动静用相对时间：刚刚 / N 分钟前 / N 小时前 / 昨天 / N 天前，超过一周写日期。
export function ago(value, now = Date.now()) {
  const at = Date.parse(value);
  if (!Number.isFinite(at)) return "时间未知";
  const minutes = Math.max(0, Math.floor((now - at) / 60000));
  if (minutes < 1) return "刚刚";
  if (minutes < 60) return minutes + " 分钟前";
  if (sameDay(value, now)) return Math.floor(minutes / 60) + " 小时前";
  const days = Math.round((new Date(now).setHours(0, 0, 0, 0) - new Date(at).setHours(0, 0, 0, 0)) / 864e5);
  return days === 1 ? "昨天" : days < 7 ? days + " 天前" : stamp(value).slice(0, 5);
}
const stamp = value => Number.isFinite(Date.parse(value))
  ? new Date(value).toLocaleString("zh-CN", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }) : "时间未知";

// 两个摘要只读原有本机来源；焦点刷新失败时保留上次成功快照。
export const useCollectionSummary = () => useSummary("/collection/notes");
function useSummary(path) {
  const [result, setResult] = useState({ data: null, busy: true, error: "" });
  const active = useRef(false), serial = useRef(0);
  const reload = useCallback(async () => {
    const id = ++serial.current;
    setResult(previous => ({ ...previous, busy: true }));
    try {
      const data = await request(path);
      if (path === "/collection/notes" ? !Array.isArray(data?.notes) : !data?.settings || !data?.cache?.sections)
        throw new Error("读取结果不完整，请重试");
      if (active.current && id === serial.current) setResult({ data, busy: false, error: "" });
    } catch (error) {
      if (active.current && id === serial.current)
        setResult(previous => ({ ...previous, busy: false, error: error.message || "读取失败" }));
    }
  }, [path]);
  useEffect(() => {
    active.current = true;
    const onFocus = () => { if (document.visibilityState === "visible") reload(); };
    reload();
    window.addEventListener("focus", onFocus);
    return () => { active.current = false; serial.current++; window.removeEventListener("focus", onFocus); };
  }, [reload]);
  return { ...result, reload };
}

// 用户 2026-10-26：首页四块（个人收藏 / 资产仓库 / 随手记 / 项目空间），每一条都能点开；资产按使用次数排，可在首页直接复制。
const COPYABLE = ["Prompt", "Skill", "Workflow", "Rule", "MCP", "Design"];
const typeLabel = type => TYPES.find(([key]) => key === type)?.[1] || type;
const noteLines = (text = "") => text.split("\n")
  .map(line => line.replace(/^(#{1,6}\s+|- ?\[[ xX]\]\s*|[-*]\s+|\d+\.\s+|>\s*)/, "").replace(/\*\*/g, "").trim()).filter(Boolean);

// 四块的总数写在模块标题行，由 HomeV16 用这些函数取。
export const assetTotal = state => (state.assets || []).filter(asset => !asset.archived).length
  + (state.scrolls || []).filter(scroll => !scroll.deletedAt).length;
export const noteTotal = state => (state.notes || []).filter(hasNoteContent).length;
export const liveCollection = read => read.data?.notes?.filter(note => !note.deletedAt);
// 标题下的「今天 +N」：收藏今天新收、资产今天复制次数、随手记今天新记、项目今天有动静的个数（用户 2026-10-26）。
export const collectionToday = (read, now = Date.now()) => liveCollection(read)?.filter(note => sameDay(note.savedAt, now)).length;
export const assetUsesToday = (state, now = Date.now()) => (state.assetActivity || []).filter(r => r.kind === "use" && sameDay(usageTime(r), now)).length;
export const notesToday = (state, now = Date.now()) => (state.notes || []).filter(note => hasNoteContent(note) && sameDay(note.at, now)).length;
export const projectsToday = (rows, now = Date.now()) => rows.filter(row => row.latestAt && sameDay(row.latestAt, now)).length;
// 收藏封面只用本机收藏库已下载的图（/collection-media/），不在首页加载外链。
const localCover = url => typeof url === "string" && /^\/collection-media\/[\w./-]+$/.test(url) ? url : "";

// 焚决要先选条目才能复制，不进常用列表，只计入总数。
export function AssetsScreen({ state, adoptState, notify, onOpen }) {
  const copyable = (state.assets || []).filter(asset => !asset.archived && COPYABLE.includes(asset.type));
  const usage = usageByAsset(copyable, state.assetActivity);
  const top = copyable.map(asset => ({ asset, use: usage.get(asset.id) }))
    .sort((a, b) => b.use.count - a.use.count || b.use.lastAt.localeCompare(a.use.lastAt)
      || (current(b.asset).at || "").localeCompare(current(a.asset).at || ""))
    .slice(0, 5);
  const most = Math.max(1, ...top.map(item => item.use.count));
  return <>
    {top.length ? <ul className="hx-pick-list">{top.map(({ asset, use }) => {
      const title = current(asset).title;
      // 热度灯：按列表里用得最多的那份折算 0–5 格（用户 2026-10-26）。
      const lit = use.count ? Math.max(1, Math.round(use.count / most * 5)) : 0;
      return <li key={asset.id} className="hx-asset-row">
        <button type="button" className="hx-pick" aria-label={"打开资产：" + title} onClick={() => onOpen(asset.id)}>
          <b>{title}</b><small>{typeLabel(asset.type)} · {use.count ? <>用过 <em className="mono">{use.count}</em> 次</> : "还没用过"}</small>
        </button>
        <span className="hx-heat" role="img" aria-label={`使用热度 ${lit}/5`}>{[0, 1, 2, 3, 4].map(i => <i key={i} className={i < lit ? "on" : undefined} />)}</span>
        <AssetCopyButton asset={asset} state={state} adoptState={adoptState} notify={notify} />
      </li>;
    })}</ul> : <p className="hx-empty">还没有资产，从资产仓库收录第一份</p>}
  </>;
}

export function CollectionScreen({ read, onOpen }) {
  const notes = liveCollection(read);
  const recent = notes?.slice().sort((a, b) => (b.savedAt || "").localeCompare(a.savedAt || "")).slice(0, 5) || [];
  return <>
    <ReadReveal pending={read.busy && !read.data} ready={!!read.data && !read.error} />
    {read.busy && read.data && <p className="hx-cache-state" role="status">正在核对上次读取的收藏…</p>}
    <SourceReadError title="个人收藏" error={read.error} retained={!!read.data} onRetry={read.reload} />
    {!read.data && !read.error && <p className="hx-state" role="status"><Reading mini label="正在读取个人收藏" /></p>}
    {read.data && <>
      {recent.length ? <ul className={`hx-pick-list${read.error ? " read-failed" : ""}`}>{recent.map(note => {
        const title = note.title || "未命名收藏", cover = localCover(note.coverUrl);
        // 用户 2026-10-26 选 B：封面垫在文字下、向左渐隐，文字下压暗；视频带小播放标。
        return <li key={note.id} className={cover ? "has-cover" : undefined}>
          {cover && <span className="hx-cover" aria-hidden="true">
            <img src={cover} alt="" decoding="async" />
            {note.type === "video" && <i><Play size={9} fill="currentColor" /></i>}
          </span>}
          <button type="button" className="hx-pick" aria-label={"打开收藏：" + title} onClick={() => onOpen(note.id)}>
            <b>{title}</b><small>{note.category || note.author?.name || "个人收藏"} · <time className="mono">{stamp(note.savedAt)}</time></small>
          </button>
        </li>;
      })}</ul>
        : !read.error && <p className="hx-empty">还没有收藏，收录后会显示在这里</p>}
    </>}
  </>;
}

export function NotesScreen({ state, onOpen }) {
  const notes = (state.notes || []).filter(hasNoteContent);
  const recent = notes.slice().sort((a, b) => (b.at || "").localeCompare(a.at || "")).slice(0, 5);
  return <>
    {recent.length ? <ul className="hx-pick-list hx-note-list">{recent.map(note => {
      // 左侧胶带用随手记页同一张便签的纸色；第二行是正文的下一句（用户 2026-10-26）。
      const lines = noteLines(note.text), title = note.title?.trim() || lines[0] || noteTitle(note);
      const rest = note.title?.trim() ? lines[0] : lines[1];
      let tone = "gray";
      try { tone = notePaper(note.id, parseStoredNote(note)); } catch { /* 便签解析失败只影响色条，不影响列表 */ }
      return <li key={note.id} className={"tone-" + tone}>
        <i className="hx-tape" aria-hidden="true" />
        <button type="button" className="hx-pick" aria-label={"打开随手记：" + title} onClick={() => onOpen(note.id)}>
          <span className="hx-note-head"><b>{title}</b><time className="mono" dateTime={note.at}>{ago(note.at)}</time></span>
          <small>{rest || <time className="mono" dateTime={note.at}>{stamp(note.at)}</time>}</small>
        </button>
      </li>;
    })}</ul> : <p className="hx-empty">还没有随手记，在中间输入框记一笔</p>}
  </>;
}

// 有提醒（停滞、收件待交代）的项目排前面，其余按最近动态。收藏没读到时收件只按未交代计，不当成已删除。
export function projectRows(state, projectStatus) {
  return (state.connections?.projects || []).filter(project => project.active).map(project => {
    const item = projectStatus?.items?.find(i => i.projectId === project.id);
    const readable = readableCurrent(item);
    const desk = deskRows(state, project.id, null);
    const waiting = desk.inbox.filter(entry => !entry.relayed && !entry.missing).length;
    const stalled = readable && item.activity?.state === "stalled";
    const flags = [stalled && `停滞 ${item.activity.idleDays} 天`, waiting && `收件待交代 ${waiting}`].filter(Boolean);
    const next = desk.next?.text || (readable && item.current.fields?.next ? linkText(item.current.fields.next) : "");
    const latestAt = readable && Number.isFinite(Date.parse(item.activity?.latestAt)) ? item.activity.latestAt : "";
    return { id: project.id, name: project.name, flags, next, stalled, readable, latestAt, source: latestAt ? item.activity.source || "" : "",
      lamp: stalled ? "stalled" : readable && item.activity?.state === "active" ? "active" : "unknown" };
  }).sort((a, b) => Number(b.flags.length > 0) - Number(a.flags.length > 0) || (Date.parse(b.latestAt) || 0) - (Date.parse(a.latestAt) || 0) || a.name.localeCompare(b.name));
}

export function ProjectsScreen({ state, projectStatus, onOpen, onRetry }) {
  const rows = projectRows(state, projectStatus);
  if (!rows.length) return <p className="hx-empty">还没有在推进的项目，到项目空间开新档</p>;
  const loaded = !!projectStatus?.loaded, error = projectStatus?.error;
  return <>
    <ReadReveal pending={!loaded} ready={loaded && !error} />
    <SourceReadError title="项目状态" error={error} retained={rows.some(row => row.readable)} onRetry={onRetry} />
    <ol className={`hx-proj-list${error ? " read-failed" : ""}`}>{rows.slice(0, 4).map((row, index) =>
      <li key={row.id} className={row.stalled ? "sleep" : ""}>
        <button type="button" aria-label={"打开项目：" + row.name} onClick={() => onOpen(row.id)}>
          {/* 状态灯：推进中绿灯慢闪、停滞黄灯、待核实灰灯；第二行写最近一次动静与下一步（用户 2026-10-26）。 */}
          <span className="hx-slot mono"><i className={"hx-lamp " + row.lamp} aria-hidden="true" />{String(index + 1).padStart(2, "0")}</span>
          <b>{row.name}</b>
          <span className={"hx-flag" + (row.flags.length ? " warn" : "")}>
            {row.flags.length ? row.flags.join(" · ") : row.readable ? "在推进" : loaded ? "状态待核实" : "读取中"}
          </span>
          {(row.latestAt || row.next) && <small className="hx-proj-next">
            {row.latestAt && <span className="hx-proj-when">{row.source ? row.source + " · " : ""}{ago(row.latestAt)}</span>}
            {row.latestAt && row.next && " · "}{row.next && "下一步：" + row.next}
          </small>}
        </button>
      </li>)}</ol>
  </>;
}

export function HotScreen() {
  const read = useSummary("/aihot");
  const cache = read.data?.cache, settings = read.data?.settings;
  const section = cache?.sections.hot?.items?.length ? cache.sections.hot : cache?.sections.selected;
  const items = (section?.items || []).slice(0, 3);
  const updatedAt = section?.fetchedAt || cache?.lastSuccessAt;
  const safeUrl = value => { try { const url = new URL(value); return ["http:", "https:"].includes(url.protocol) ? url.href : null; } catch { return null; } };
  return <>
    <ReadReveal pending={read.busy && !read.data} ready={!!read.data && !read.error && !cache?.error} />
    {read.busy && read.data && <p className="hx-cache-state" role="status">正在核对上次读取的缓存…</p>}
    <SourceReadError title="AIHOT 缓存" error={read.error || cache?.error} retained={items.length > 0} onRetry={read.reload} />
    {!read.data && !read.error && <p className="hx-state" role="status"><Reading mini label="正在读取 AIHOT 缓存" /></p>}
    {read.data && <>
      {items.length > 0 && <>
        <p className="hx-cache-state">{(cache.status === "failed" || cache.error) ? "更新失败 · " : read.error ? "上次读取 · " : ""}缓存于 {stamp(updatedAt)}</p>
        <ul className={`hx-summary-list${read.error ? " read-failed" : ""}`}>{items.map((item, index) => {
          const url = safeUrl(item.url);
          return <li key={(item.url || item.title) + index}>{url
            ? <a href={url} target="_blank" rel="noreferrer"><span>{item.title}</span></a>
            : <b>{item.title}</b>}<small>{item.source || "AIHOT"}</small></li>;
        })}</ul>
      </>}
      {!settings.acknowledged ? <p className="hx-state">尚未启用资讯读取，到 AI HOT 确认后开启</p>
        : !settings.enabled ? <p className="hx-state">资讯更新已暂停{items.length ? "，保留本机缓存" : ""}</p>
        : !items.length && !read.error && !cache.error ? <p className="hx-empty">{cache.status === "failed" ? "更新失败，本机暂无可用缓存" : "本机暂无资讯，到 AI HOT 更新后查看"}</p> : null}
    </>}
  </>;
}
