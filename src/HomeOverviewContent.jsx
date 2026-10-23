import React, { useCallback, useEffect, useRef, useState } from "react";
import { Reading, ReadReveal } from "./ScanMotion.jsx";
import { SourceReadError } from "./components.jsx";
import { request } from "./api.js";
import { current } from "./store.js";

const TYPES = [["Prompt", "Prompt"], ["Skill", "Skill"], ["Workflow", "工作流"], ["Rule", "规则"], ["MCP", "MCP"], ["Scroll", "焚决"], ["Design", "设计"]];
const stamp = value => Number.isFinite(Date.parse(value))
  ? new Date(value).toLocaleString("zh-CN", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }) : "时间未知";

// 两个摘要只读原有本机来源；焦点刷新失败时保留上次成功快照。
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

export function AssetsScreen({ state }) {
  const assets = (state.assets || []).filter(asset => !asset.archived);
  const scrolls = (state.scrolls || []).filter(scroll => !scroll.deletedAt);
  const recent = [
    ...assets.map(asset => ({ id: asset.id, title: current(asset).title, at: current(asset).at, type: asset.type })),
    ...scrolls.map(scroll => ({ id: scroll.id, title: scroll.name, at: scroll.updatedAt || scroll.createdAt, type: "Scroll" })),
  ].sort((a, b) => (b.at || "").localeCompare(a.at || "")).slice(0, 2);
  return <>
    <p className="hx-summary-total"><b className="mono">{assets.length + scrolls.length}</b>份资产<span>含焚决 {scrolls.length} 卷</span></p>
    <div className="hx-type-grid" aria-label="资产类型统计">
      {TYPES.map(([type, label]) => {
        const count = type === "Scroll" ? scrolls.length : assets.filter(asset => asset.type === type).length;
        return <div key={type} aria-label={`${label}，${count}份`}><span>{label}</span><b className="mono">{count}</b></div>;
      })}
    </div>
    {recent.length ? <><p className="hx-summary-label">最近更新</p><ul className="hx-summary-list">{recent.map(item =>
      <li key={item.type + item.id}><b>{item.title}</b><small>{TYPES.find(([type]) => type === item.type)?.[1]} · {stamp(item.at)}</small></li>)}</ul></>
      : <p className="hx-empty">还没有资产，从资产仓库收录第一份</p>}
  </>;
}

export function CollectionScreen() {
  const read = useSummary("/collection/notes");
  const notes = read.data?.notes;
  const recent = notes?.slice().sort((a, b) => (b.savedAt || "").localeCompare(a.savedAt || "")).slice(0, 3) || [];
  return <>
    <ReadReveal pending={read.busy && !read.data} ready={!!read.data && !read.error} />
    {read.busy && read.data && <p className="hx-cache-state" role="status">正在核对上次读取的收藏…</p>}
    <SourceReadError title="个人收藏" error={read.error} retained={!!read.data} onRetry={read.reload} />
    {!read.data && !read.error && <p className="hx-state" role="status"><Reading mini label="正在读取个人收藏" /></p>}
    {read.data && <>
      <p className="hx-summary-total"><b className="mono">{notes.length}</b>条收藏{read.error && <span>上次读取</span>}</p>
      {recent.length ? <ul className={`hx-summary-list${read.error ? " read-failed" : ""}`}>{recent.map(note =>
        <li key={note.id}><b>{note.title || "未命名收藏"}</b><small>{note.category || note.author?.name || "个人收藏"} · {stamp(note.savedAt)}</small></li>)}</ul>
        : !read.error && <p className="hx-empty">还没有收藏，收录后会显示在这里</p>}
    </>}
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
