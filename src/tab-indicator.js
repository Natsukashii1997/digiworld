// 页签指示条跟着选中项滑过去（#127：切页签是位置变化，交代「从 A 到了 B」）。
// 容器加 data-ind 后，单个按钮自己的下划线隐藏，改由容器的一条指示条 translateX + scaleX 移动；只动 transform。
// 第一次定位不播动画；减少动效由全局兜底压成瞬间。
import { useLayoutEffect } from "react";

export function useTabIndicator(ref, inset = 10) {
  useLayoutEffect(() => {
    const box = ref.current, btn = box?.querySelector("button.active");
    if (!box) return;
    if (!btn) { box.removeAttribute("data-ind"); return; }
    box.style.setProperty("--ind-x", `${btn.offsetLeft + inset}px`);
    box.style.setProperty("--ind-s", String(Math.max(0, btn.offsetWidth - inset * 2) / 100));
    if (!box.hasAttribute("data-ind")) {
      box.setAttribute("data-ind", "");
      // 下一帧再打开过渡，避免第一次从 0 滑进来。
      requestAnimationFrame(() => box.setAttribute("data-ind", "on"));
    }
  });
}
