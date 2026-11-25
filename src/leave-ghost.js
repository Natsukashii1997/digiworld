// 退场幽灵（#127 动效语言「有来有去」）。
// 弹窗、抽屉、提示条卸载时，React 照常立即移除真节点：状态、焦点、读屏和测试都按「已关闭」处理；
// 这里在原位置补一份不可交互的克隆，播完退场（加 .is-leaving，样式里定义）再删，交代「它到哪里去了」。
// 减少动效、页面在后台时不留；节点其实没被移除（StrictMode 开发期的模拟卸载）也不留。
import { useLayoutEffect } from "react";
import { T } from "./motion-tokens.js";
import { reducedMotion } from "./scan-motion.js";

export function leaveGhost(node, duration = T.fast) {
  try {
    if (!node?.isConnected || reducedMotion() || document.hidden) return;
    const parent = node.parentNode, next = node.nextSibling;
    // 克隆要在真节点还在时做：滚动位置只有这时读得到。
    const ghost = node.cloneNode(true);
    const scrolled = [node, ...node.querySelectorAll("*")].map((el, i) => [i, el.scrollTop, el.scrollLeft]).filter(([, t, l]) => t || l);
    ghost.classList.add("is-leaving");
    ghost.dataset.leaving = "";
    ghost.setAttribute("aria-hidden", "true");
    ghost.inert = true;
    for (const el of [ghost, ...ghost.querySelectorAll("[id]")]) el.removeAttribute("id");
    // 幽灵不再是对话框或状态播报：按选择器找对话框、读屏播报的地方都不会把它当成还开着。
    for (const el of [ghost, ...ghost.querySelectorAll("[role=dialog],[role=alertdialog],[role=status],[role=alert],[aria-modal],[aria-live]")]) {
      if (/^(dialog|alertdialog|status|alert)$/.test(el.getAttribute("role") || "")) el.removeAttribute("role");
      el.removeAttribute("aria-modal");
      el.removeAttribute("aria-live");
    }
    queueMicrotask(() => {
      if (node.isConnected || !parent?.isConnected) return;
      parent.insertBefore(ghost, next?.parentNode === parent ? next : null);
      // cloneNode 不带 canvas 画面：逐个画回去，退场时像素画不会变成空白块。
      const from = node.querySelectorAll("canvas"), to = ghost.querySelectorAll("canvas");
      from.forEach((c, i) => { try { if (c.width && c.height) to[i]?.getContext("2d")?.drawImage(c, 0, 0); } catch {} });
      if (scrolled.length) {
        const all = [ghost, ...ghost.querySelectorAll("*")];
        for (const [i, t, l] of scrolled) if (all[i]) { all[i].scrollTop = t; all[i].scrollLeft = l; }
      }
      setTimeout(() => ghost.remove(), duration + 60);
    });
  } catch {}
}

// 组件卸载时给 ref 指向的节点留退场幽灵。
export function useLeaveGhost(ref, duration) {
  useLayoutEffect(() => () => leaveGhost(ref.current, duration), [ref, duration]);
}
