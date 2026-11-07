// 驾驶舱只读页（Agent、规则）共用的小件（#74）。时间一律按本地时区格式化，不截 ISO 字符串（G-02）。
import React, { useCallback, useEffect, useState } from "react";
import { request } from "./api.js";
import { SourceReadError, Scanning } from "./components.jsx";

const pad = (n) => String(n).padStart(2, "0");
export function fmtTime(iso, now = new Date()) {
  const d = new Date(iso || "");
  if (!iso || Number.isNaN(d.getTime())) return "未知";
  const hm = `${pad(d.getHours())}:${pad(d.getMinutes())}`;
  return d.toDateString() === now.toDateString() ? hm : `${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${hm}`;
}
export const fmtDay = (iso) => {
  const d = new Date(iso || "");
  return Number.isNaN(d.getTime()) ? "未知" : `${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

const ST = { ok: "st-ok", warn: "st-warn", unk: "st-unk", stale: "st-warn", missing: "st-unk" };
export const Dot = ({ level }) => <span className={`ck-dot ${ST[level] || "st-unk"}`} aria-hidden="true" />;
export const Pill = ({ level, children }) => (
  <span className={`ck-pill ${ST[level] || "st-unk"}`}><Dot level={level} />{children}</span>
);

// 来源时间：缺失显示「未知」，过期显示「过期」。
export function SourceTime({ at, state }) {
  if (state === "missing" || !at) return <span className="ck-state unk">未知</span>;
  return <>{fmtTime(at)}{state === "stale" && <span className="ck-state warn">过期</span>}</>;
}

export function useCockpit(path) {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const load = useCallback(async (refresh = false) => {
    setBusy(true);
    try {
      setData(await request(`${path}${refresh ? "?refresh=1" : ""}`));
      setError(null);
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  }, [path]);
  useEffect(() => { void load(false); }, [load]);
  return { data, error, busy, reload: () => load(true) };
}

export function ReadOnlyBar({ readAt, busy, onRefresh }) {
  return (
    <div className="ck-headbar">
      <span className="ck-ro">只读</span>
      <span className="ck-read">读取于 {readAt ? fmtTime(readAt) : "—"}</span>
      <button type="button" className="ck-btn" onClick={onRefresh} disabled={busy}>{busy ? "正在读取…" : "重新读取"}</button>
    </div>
  );
}

export function CockpitState({ data, error, reload, label }) {
  if (error && !data) return <SourceReadError title={`${label}读取失败`} error={error.message || String(error)} onRetry={reload} />;
  if (!data) return <Scanning label={`正在读取${label}`} />;
  return null;
}
