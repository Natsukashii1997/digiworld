import React, { useEffect, useRef, useState } from "react";

// 数字滚动（UI v13.2）：数值变化时，变化的那几位像里程表一样翻到新值（约 0.45 秒）。
// 静止时只渲染当前值；from 可让首次显示从旧值翻到新值（用于“保存新版本”）。
// 系统“减少动态效果”时不翻动，直接只显示当前值（PRD §10.5）。
function prefersReduced() {
  try {
    return matchMedia("(prefers-reduced-motion: reduce)").matches;
  } catch {
    return true;
  }
}

export function Odometer({ value, from, className = "" }) {
  const text = String(value);
  const shown = useRef(from === undefined || prefersReduced() ? text : String(from));
  const [old, setOld] = useState(null);
  useEffect(() => {
    if (shown.current === text) return undefined;
    if (prefersReduced()) {
      shown.current = text;
      setOld(null);
      return undefined;
    }
    setOld(shown.current);
    shown.current = text;
    const timer = setTimeout(() => setOld(null), 460);
    return () => clearTimeout(timer);
  }, [text]);
  const width = Math.max(text.length, old?.length || 0);
  const pad = (s) => s.padStart(width, " ");
  const now = pad(text),
    before = old === null ? null : pad(old);
  return (
    <span className={`odometer ${old !== null ? "is-rolling" : ""} ${className}`}>
      {[...now].map((digit, i) =>
        before !== null && before[i] !== digit ? (
          <span className="odo-digit roll" key={`${i}-${digit}`}>
            <span className="odo-old" aria-hidden="true">
              {before[i].trim()}
            </span>
            <span className="odo-new">{digit.trim()}</span>
          </span>
        ) : (
          <span className="odo-digit" key={i}>
            {digit.trim()}
          </span>
        ),
      )}
    </span>
  );
}
