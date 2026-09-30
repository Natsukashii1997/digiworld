import React, { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import { createPartnerLcd } from "./partner-lcd.js";
import { DATA_CAUGHT } from "./data-flight.js";
import "./partner-lcd.css";

const REDUCE = "(prefers-reduced-motion: reduce)";
function prefersReduced() {
  try {
    return matchMedia(REDUCE).matches;
  } catch {
    return false;
  }
}
// 侧栏点阵铺满屏幕：高屏（≥80px）每点 4px，矮屏每点 3px（用户 2026-09-30：铺满、蛋放大）
const roamDot = (height) => (height >= 80 ? 4 : 3);

// 伙伴液晶屏：mode="roam" 侧栏（滚动 + 四季），mode="stage" 首页数码暴龙机（居中晃动）。
// 通过 ref 暴露 poke()；复制成功的“数据飞入”到达后自动接住。纯装饰，对读屏隐藏。
// 容器尺寸或“减少动态效果”偏好变化时重建引擎，点阵始终铺满、动效开关实时生效。
export const PartnerScreen = forwardRef(function PartnerScreen(
  { mode = "roam", cols, rows, onSeason, className = "", ...rest },
  ref,
) {
  const host = useRef(),
    canvas = useRef(),
    engine = useRef(),
    seasonRef = useRef(onSeason),
    shown = useRef(null); // 当前是否在显示数字：引擎重建后恢复同一画面
  seasonRef.current = onSeason;
  const [reduced, setReduced] = useState(prefersReduced);
  const [size, setSize] = useState("");
  useImperativeHandle(
    ref,
    () => ({
      poke: () => engine.current?.poke(),
      showNumber: (n) => {
        shown.current = n;
        engine.current?.showNumber(n);
      },
      showEgg: () => {
        shown.current = null;
        engine.current?.showEgg();
      },
    }),
    [],
  );
  useEffect(() => {
    let media;
    try {
      media = matchMedia(REDUCE);
    } catch {
      return undefined;
    }
    const change = () => setReduced(media.matches);
    media.addEventListener?.("change", change);
    return () => media.removeEventListener?.("change", change);
  }, []);
  useEffect(() => {
    if (mode !== "roam" || typeof ResizeObserver !== "function") return undefined;
    const observer = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      const dot = roamDot(height);
      setSize(`${Math.floor(width / dot)}x${Math.floor(height / dot)}x${dot}`);
    });
    observer.observe(host.current);
    return () => observer.disconnect();
  }, [mode]);
  useEffect(() => {
    const height = host.current?.clientHeight || 0;
    const lcd = createPartnerLcd(canvas.current, {
      mode,
      reduced,
      ...(mode === "roam"
        ? { dot: roamDot(height), cols, rows }
        : { cols: cols ?? 16, rows: rows ?? 18 }),
      onSeason: (season) => {
        // 季节底色画在外层屏幕容器上（侧栏 .partner-screen）
        canvas.current?.closest(".partner-screen")?.setAttribute("data-season", season.id);
        seasonRef.current?.(season);
      },
    });
    engine.current = lcd;
    if (shown.current !== null) lcd.showNumber(shown.current);
    const caught = () => lcd.catchData();
    window.addEventListener(DATA_CAUGHT, caught);
    return () => {
      window.removeEventListener(DATA_CAUGHT, caught);
      lcd.destroy();
    };
  }, [mode, cols, rows, reduced, size]);
  return (
    <span ref={host} className={`lcd-screen lcd-${mode} ${className}`} aria-hidden="true" {...rest}>
      <canvas ref={canvas} />
    </span>
  );
});
