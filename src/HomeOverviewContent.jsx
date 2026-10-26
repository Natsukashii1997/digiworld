import React, { useCallback, useEffect, useRef, useState } from "react";
import { Reading, ReadReveal } from "./ScanMotion.jsx";
import { SourceReadError } from "./components.jsx";
import { request } from "./api.js";
import { current } from "./store.js";
import { AssetCopyButton } from "./Assets.jsx";
import { usageByAsset } from "./asset-usage.js";
import { hasNoteContent, noteTitle } from "./note-types.js";
import { deskRows } from "./ProjectDesk.jsx";
import { readableCurrent } from "./projects-v16.js";
import { linkText } from "./collab.js";

const TYPES = [["Prompt", "Prompt"], ["Skill", "Skill"], ["Workflow", "工作流"], ["Rule", "规则"], ["MCP", "MCP"], ["Scroll", "焚决"], ["Design", "设计"]];
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
const noteLine = (text = "") => text.split("\n")
  .map(line => line.replace(/^(#{1,6}\s+|- ?\[[ xX]\]\s*|[-*]\s+|\d+\.\s+|>\s*)/, "").replace(/\*\*/g, "").trim()).find(Boolean) || "";

// 四块的总数写在模块标题行，由 HomeV16 用这些函数取。
export const assetTotal = state => (state.assets || []).filter(asset => !asset.archived).length
  + (state.scrolls || []).filter(scroll => !scroll.deletedAt).length;
export const noteTotal = state => (state.notes || []).filter(hasNoteContent).length;
export const liveCollection = read => read.data?.notes?.filter(note => !note.deletedAt);

// 焚决要先选条目才能复制，不进常用列表，只计入总数。
export function AssetsScreen({ state, adoptState, notify, onOpen }) {
  const copyable = (state.assets || []).filter(asset => !asset.archived && COPYABLE.includes(asset.type));
  const usage = usageByAsset(copyable, state.assetActivity);
  const top = copyable.map(asset => ({ asset, use: usage.get(asset.id) }))
    .sort((a, b) => b.use.count - a.use.count || b.use.lastAt.localeCompare(a.use.lastAt)
      || (current(b.asset).at || "").localeCompare(current(a.asset).at || ""))
    .slice(0, 5);
  return <>
    {top.length ? <ul className="hx-pick-list">{top.map(({ asset, use }) => {
      const title = current(asset).title;
      return <li key={asset.id}>
        <button type="button" className="hx-pick" aria-label={"打开资产：" + title} onClick={() => onOpen(asset.id)}>
          <b>{title}</b><small>{typeLabel(asset.type)} · {use.count ? <>用过 <em className="mono">{use.count}</em> 次</> : "还没用过"}</small>
        </button>
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
        const title = note.title || "未命名收藏";
        return <li key={note.id}>
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
    {recent.length ? <ul className="hx-pick-list">{recent.map(note => {
      const title = note.title?.trim() || noteLine(note.text) || noteTitle(note);
      return <li key={note.id}>
        <button type="button" className="hx-pick" aria-label={"打开随手记：" + title} onClick={() => onOpen(note.id)}>
          <b>{title}</b><small><time className="mono">{stamp(note.at)}</time></small>
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
    return { id: project.id, name: project.name, flags, next, stalled, readable,
      latestAt: readable ? Date.parse(item.activity?.latestAt) || 0 : 0 };
  }).sort((a, b) => Number(b.flags.length > 0) - Number(a.flags.length > 0) || b.latestAt - a.latestAt || a.name.localeCompare(b.name));
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
          <span className="hx-slot mono">{String(index + 1).padStart(2, "0")}</span>
          <b>{row.name}</b>
          <span className={"hx-flag" + (row.flags.length ? " warn" : "")}>
            {row.flags.length ? row.flags.join(" · ") : row.readable ? "在推进" : loaded ? "状态待核实" : "读取中"}
          </span>
          {row.next && <small className="hx-proj-next">下一步：{row.next}</small>}
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
