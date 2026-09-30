// 复制成功 = 传送：几颗数据像素从触发的按钮飞进侧栏伙伴屏，到达后通知液晶屏“接住”。
// 用户 2026-09-29 确认（UI v13.1/13.2 预览）。纯装饰：失败或不可见时只发“接住”事件，不影响复制与记录。
export const DATA_CAUGHT = "guiji:data-caught";

// 任何异常都在这里吞掉：装饰动效绝不能影响复制与使用记录。
export function flyData(from) {
  const created = [];
  try {
    launch(from, created);
  } catch {
    // 装饰失败不影响任何业务结果；已插入的像素节点一并清掉，并让蛋照常接住
    created.forEach((bit) => bit.remove());
    window.dispatchEvent(new CustomEvent(DATA_CAUGHT));
  }
}

function launch(from, created) {
  const caught = () => window.dispatchEvent(new CustomEvent(DATA_CAUGHT));
  const target = document.querySelector("[data-partner-screen]");
  let reduced = false;
  try {
    reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
  } catch {
    reduced = false;
  }
  const a = from?.getBoundingClientRect?.(),
    b = target?.getBoundingClientRect?.();
  // 侧栏收起或被移出视口（窄屏）、按钮已不在页面、或减少动态效果时，不飞，直接接住
  const onScreen = (r) => r?.width && r.right > 0 && r.left < innerWidth && r.bottom > 0 && r.top < innerHeight;
  if (reduced || !onScreen(a) || !onScreen(b) || typeof document.body.animate !== "function") {
    caught();
    return;
  }
  const flights = [];
  for (let i = 0; i < 6; i++) {
    const bit = document.createElement("i");
    bit.className = `data-bit${i % 2 ? " alt" : ""}`;
    bit.setAttribute("aria-hidden", "true");
    document.body.append(bit);
    created.push(bit);
    const x0 = a.left + a.width / 2 + (i - 3) * 6,
      y0 = a.top + 8,
      x1 = b.left + b.width / 2,
      y1 = b.top + 6;
    const mx = (x0 + x1) / 2 + (i - 3) * 14,
      my = Math.min(y0, y1) - 80 - i * 6;
    const flight = bit.animate(
      [
        { transform: `translate(${x0}px, ${y0}px) scale(1)` },
        { transform: `translate(${mx}px, ${my}px) scale(1.3)`, offset: 0.45 },
        { transform: `translate(${x1}px, ${y1}px) scale(0.6)` },
      ],
      { duration: 620 + i * 45, delay: i * 35, easing: "cubic-bezier(.3,.1,.3,1)" },
    );
    flights.push(flight.finished.catch(() => {}).then(() => bit.remove()));
  }
  Promise.all(flights).then(caught);
}
