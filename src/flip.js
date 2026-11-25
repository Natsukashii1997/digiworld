// 列表重排的位置过渡（#127 动效语言「屏内从 A 到 B」）：筛选、置顶、排序后，留下来的卡片从旧位置滑到新位置，
// 不重新进场；后来新出现的卡片不错峰、快速落定（.flip-quick）；消失的卡片不补退场（避免列表里出现鬼影）。
// 首次渲染的卡片照常按 --i 错峰进场。用法：容器 ref + 子元素带 data-flip="<稳定键>"。只动 transform，减少动效时不动。
import { useLayoutEffect, useRef } from "react";
import { T, EASE } from "./motion-tokens.js";
import { reducedMotion } from "./scan-motion.js";

const moving = new WeakMap();

export function useFlip(ref) {
  const last = useRef(null);
  useLayoutEffect(() => {
    const box = ref.current;
    if (!box) return;
    const els = [...box.querySelectorAll(":scope > [data-flip]")];
    const prev = last.current;
    // 先给新来的卡片去掉错峰，再量位置（量位置会触发样式计算，进场动画随即开始）。
    if (prev) for (const el of els) if (!prev.items.has(el.dataset.flip)) el.classList.add("flip-quick");
    // 用 offsetLeft/offsetTop 量布局位置：不受进场上浮、悬停上浮这些 transform 影响，
    // 进场途中页面重渲染不会被误判成「挪了几像素」。
    const width = box.clientWidth;
    // 上一段位移还没播完又重排（连续筛选）：从卡片此刻在屏上的位置接着走，不跳回去。
    // 批量做：先统一读所有运动中卡片的视觉位置，再统一取消，再统一读一次，只触发两次样式计算（#129 审查 P2-03）。
    const running = els.filter((el) => moving.get(el)?.playState === "running");
    const seen = running.map((el) => el.getBoundingClientRect());
    for (const el of running) moving.get(el).cancel();
    const offset = new Map(running.map((el, i) => { const r = el.getBoundingClientRect(); return [el, [seen[i].left - r.left, seen[i].top - r.top]]; }));
    const now = new Map();
    for (const el of els) {
      const [ox, oy] = offset.get(el) || [0, 0];
      now.set(el.dataset.flip, { el, x: el.offsetLeft, y: el.offsetTop, ox, oy });
    }
    last.current = { width, items: now };
    // 第一次渲染、容器宽度变了（窗口缩放导致的重排不是用户操作）、减少动效：只记位置，不动。
    if (!prev || Math.abs(prev.width - width) > 1 || reducedMotion()) return;
    for (const [key, { el, x, y, ox, oy }] of now) {
      const before = prev.items.get(key);
      if (!before) continue;
      const dx = before.x + ox - x, dy = before.y + oy - y;
      if (Math.abs(dx) < 1 && Math.abs(dy) < 1) continue;
      try {
        // composite:"add" 让位移叠在悬停上浮上；Safari 16 起支持（桌面外壳最低 macOS 14 / Safari 17）。
        // 更老的 WebKit 会忽略这个选项按覆盖处理：换位照常播，只是这 160ms 里悬停上浮被盖住，不会静默失效。
        moving.set(el, el.animate([{ transform: `translate(${dx}px, ${dy}px)` }, { transform: "translate(0, 0)" }], { duration: T.fast, easing: EASE.move, composite: "add" }));
      } catch {}
    }
  });
}
