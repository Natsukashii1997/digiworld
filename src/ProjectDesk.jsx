// 存档槽的收件与装备（阶段 2 D 批）：收件是投递来的随手记/收藏引用，装备是资产的固定版本。
// 写入走项目桌专用接口与公共写入能力（先查询、不自动重放）；「继续」口令里只带还没交代的收件。
import React, { useRef, useState } from "react";
import { X } from "lucide-react";
import { Button, Dialog } from "./components.jsx";
import { request } from "./api.js";
import { settleAttempt } from "./write-attempt.js";
import { relayOf } from "./capture-routes.js";
import { typeLabel } from "./components.jsx";

const day = (value) => {
  const d = new Date(value);
  return Number.isFinite(d.getTime()) ? `${d.getMonth() + 1}/${d.getDate()}` : "";
};
const firstLine = (text = "") => text.split("\n").map((l) => l.replace(/^[-*]\s+|^\d+\.\s+|^\[[ x]\]\s+/, "").trim()).find(Boolean) || "";

// 卡片上展示用：全部收件（含已交代）与装备，带标题、来源、是否已交代、是否有新版。
// collectionNotes 为 null 表示收藏还没读到：收藏条目标 unknown，不当成已删除。
export function deskRows(state, projectId, collectionNotes = []) {
  const entry = (state.projectDesk || []).find((e) => e.projectId === projectId);
  const inbox = (entry?.inbox || []).map((item) => {
    const unknown = item.kind === "collection" && !collectionNotes;
    const note = item.kind === "note" ? state.notes.find((n) => n.id === item.id) : collectionNotes?.find((n) => n.id === item.id);
    const title = note ? (item.kind === "note" ? note.title?.trim() || firstLine(note.text) : note.title?.trim()) || "未命名" : "";
    return { ...item, title, source: item.kind === "note" ? "随手记" : "收藏", missing: !note && !unknown, unknown, relayed: !!relayOf(state.collabLog, projectId, item) };
  }).sort((a, b) => Number(a.relayed) - Number(b.relayed));
  const loadout = (entry?.loadout || []).map((item) => {
    const asset = state.assets.find((a) => a.id === item.assetId && !a.archived);
    const index = asset ? asset.versions.findIndex((v) => v.id === item.versionId) : -1;
    return { ...item, missing: index < 0, title: index >= 0 ? asset.versions[index].title : "资产已删除", number: index + 1, newer: index >= 0 && index < asset.versions.length - 1 };
  });
  return { inbox, loadout };
}

// 项目桌写入：先查询是否已是目标状态，没有才发送，再回读核对。
export async function deskWrite(path, body, reached, adoptState) {
  const result = await settleAttempt("retry", {
    send: () => request(path, body),
    check: async () => {
      const state = await request("/workspace");
      const entry = (state.projectDesk || []).find((e) => e.projectId === body.projectId);
      return { state: reached(entry) ? "done" : "absent", value: state };
    },
  });
  if (result.outcome === "done") adoptState(result.value);
  return result.outcome;
}
const label = (item) => (item.missing ? "原条目已删除" : item.unknown ? "收藏未读到" : item.title);
const NOT_DONE = { absent: "没有查到这次修改，可以再点一次；会先核对，不会重复写。", conflict: "已在别处变化，请刷新后核对。", unconfirmed: "结果暂时无法核实，请稍后再看。", unknown: "结果暂时无法核实，请稍后再看。" };

export function SlotDesk({ rows, projectId, projectName, adoptState, notify, onLoadout }) {
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);
  const shown = rows.inbox.slice(0, 3), pending = rows.inbox.filter((i) => !i.relayed && !i.missing).length;
  async function withdraw(item) {
    if (lock.current) return;
    lock.current = true; setBusy(true);
    try {
      const outcome = await deskWrite("/project-desk/withdraw", { projectId, kind: item.kind, id: item.id },
        (entry) => !entry?.inbox.some((i) => i.kind === item.kind && i.id === item.id), adoptState);
      notify(outcome === "done" ? `已从「${projectName}」的收件移出` : NOT_DONE[outcome], outcome === "done" ? undefined : "warning");
    } finally { lock.current = false; setBusy(false); }
  }
  return (
    <div className="pj-desk">
      <section aria-label={`收件 ${rows.inbox.length} 条，未交代 ${pending} 条`}>
        <span className="en">INBOX · 收件 {rows.inbox.length}</span>
        {shown.length ? (
          <ul>
            {shown.map((item) => (
              <li key={`${item.kind}:${item.id}`} className={item.relayed ? "relayed" : ""}>
                <span className="pj-desk-title">{label(item)}</span>
                <small>{item.source} · {day(item.at)}{item.relayed ? " · 已交代" : ""}</small>
                <button type="button" className="icon-btn" disabled={busy} aria-label={`移出收件：${label(item)}`} onClick={() => withdraw(item)}>
                  <X size={14} />
                </button>
              </li>
            ))}
          </ul>
        ) : <p className="pj-desk-empty">暂无。在随手记、收藏里点“孵化”投递过来。</p>}
        {rows.inbox.length > shown.length && <small className="pj-desk-more">还有 {rows.inbox.length - shown.length} 条</small>}
      </section>
      <section aria-label={`装备 ${rows.loadout.length} 份`}>
        <span className="en">LOADOUT · 装备 {rows.loadout.length}</span>
        <div className="pj-desk-gear">
          {rows.loadout.length ? rows.loadout.map((item) => (
            <span key={item.assetId} className={`pj-gear${item.missing ? " missing" : ""}`}>
              {item.title}{!item.missing && <b>v{item.number}</b>}{item.newer && <i>有新版</i>}
            </span>
          )) : <span className="pj-desk-empty">未选</span>}
          <button type="button" className="text-btn" onClick={onLoadout}>调整装备</button>
        </div>
      </section>
    </div>
  );
}

export function LoadoutDialog({ state, projectId, projectName, adoptState, notify, onClose }) {
  const [query, setQuery] = useState(""), [busy, setBusy] = useState(""), [status, setStatus] = useState("");
  const lock = useRef(false);
  const entry = (state.projectDesk || []).find((e) => e.projectId === projectId);
  const equipped = new Map((entry?.loadout || []).map((i) => [i.assetId, i.versionId]));
  const words = query.trim().toLowerCase();
  const assets = state.assets.filter((a) => !a.archived && (!words || a.versions.at(-1).title.toLowerCase().includes(words)))
    .sort((a, b) => Number(equipped.has(b.id)) - Number(equipped.has(a.id)) || a.versions.at(-1).title.localeCompare(b.versions.at(-1).title, "zh"));
  async function act(asset, versionId) {
    if (lock.current) return;
    lock.current = true; setBusy(asset.id); setStatus("");
    try {
      const outcome = versionId
        ? await deskWrite("/project-desk/equip", { projectId, assetId: asset.id, versionId }, (e) => e?.loadout.some((i) => i.assetId === asset.id && i.versionId === versionId), adoptState)
        : await deskWrite("/project-desk/unequip", { projectId, assetId: asset.id }, (e) => !e?.loadout.some((i) => i.assetId === asset.id), adoptState);
      if (outcome === "done") notify(versionId ? `已装备「${asset.versions.at(-1).title}」` : "已卸下");
      else setStatus(NOT_DONE[outcome]);
    } finally { lock.current = false; setBusy(""); }
  }
  return (
    <Dialog title={`调整装备 · ${projectName}`} onClose={() => { if (!lock.current) onClose(); }}>
      <div className="pj-loadout">
        <p className="body-copy">装备会以固定版本写进「继续」口令；资产之后再改，口令仍用这里选定的版本，直到你换版本。</p>
        <label className="pj-loadout-search">
          搜索资产
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="按名称搜索" />
        </label>
        <ul>
          {assets.map((asset) => {
            const pinned = equipped.get(asset.id), index = pinned ? asset.versions.findIndex((v) => v.id === pinned) : -1;
            const latest = asset.versions.at(-1), name = latest.title;
            return (
              <li key={asset.id}>
                <span className="pj-loadout-name"><b>{name}</b><small>{typeLabel[asset.type] || asset.type} · 当前 v{asset.versions.length}{pinned ? ` · 已装备 v${index + 1}` : ""}</small></span>
                <span className="pj-loadout-act">
                  {pinned && pinned !== latest.id && <Button secondary disabled={!!busy} onClick={() => act(asset, latest.id)}>换到 v{asset.versions.length}</Button>}
                  {pinned
                    ? <Button secondary disabled={!!busy} onClick={() => act(asset, null)}>卸下</Button>
                    : <Button secondary disabled={!!busy} onClick={() => act(asset, latest.id)}>装备 v{asset.versions.length}</Button>}
                </span>
              </li>
            );
          })}
        </ul>
        {!assets.length && <p className="pj-desk-empty">没有匹配的资产。</p>}
        {status && <p className="hatch-status" role="status">{status}</p>}
      </div>
    </Dialog>
  );
}
