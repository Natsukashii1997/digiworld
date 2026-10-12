// 成功反馈是纯装饰；剪贴板、保存与记录都不依赖动画完成。
import { motionOrigin, reducedMotion, scanReveal, trackDecoration } from './scan-motion.js';
export const DATA_CAUGHT = 'guiji:data-caught';
const confirmedOperations = new Set();
// 原未决操作回读为成功时只反馈一次；历史列表读取不调用此入口。
export function flyDataOnce(operationId, from = motionOrigin()) {
  try { if (confirmedOperations.has(operationId)) return; confirmedOperations.add(operationId); flyData(from); } catch {}
}

export async function copyText(text, from = motionOrigin()) {
  await navigator.clipboard.writeText(text);
  flyData(from);
}

export function flyData(from = motionOrigin()) {
  const bits = [], animations = [];
  let done = false, release;
  const caught = () => {
    try {
      window.dispatchEvent(new CustomEvent(DATA_CAUGHT));
      scanReveal(document.querySelector('[data-partner-screen]'), {
        duration: 260, kind: 'success', reveal: false, success: true,
      });
    } catch { /* 装饰失败不影响已完成的业务动作。 */ }
  };
  const stop = () => {
    if (done) return;
    done = true;
    for (const animation of animations) { try { animation.cancel(); } catch {} }
    bits.forEach(bit => bit.remove());
    release?.();
    caught();
  };
  try {
    const a = from?.getBoundingClientRect?.();
    const b = document.querySelector('[data-partner-screen]')?.getBoundingClientRect();
    const visible = r => r?.width && r.right > 0 && r.left < innerWidth && r.bottom > 0 && r.top < innerHeight;
    if (reducedMotion() || !visible(a) || !visible(b) || typeof document.body.animate !== 'function') {
      stop(); return;
    }
    release = trackDecoration(stop);
    for (let i = 0; i < 6; i++) {
      const bit = document.createElement('i');
      bit.className = `data-bit${i % 2 ? ' alt' : ''}`;
      bit.setAttribute('aria-hidden', 'true');
      document.body.append(bit); bits.push(bit);
      const x0 = a.left + a.width / 2 + (i - 3) * 6, y0 = a.top + 8;
      const x1 = b.left + b.width / 2, y1 = b.top + 6;
      const mx = (x0 + x1) / 2 + (i - 3) * 14, my = Math.min(y0, y1) - 80 - i * 6;
      animations.push(bit.animate([
        { transform: `translate(${x0}px, ${y0}px) scale(1)` },
        { transform: `translate(${mx}px, ${my}px) scale(1.3)`, offset: .45 },
        { transform: `translate(${x1}px, ${y1}px) scale(.6)` },
      ], { duration: 620 + i * 45, delay: i * 35, easing: 'cubic-bezier(.3,.1,.3,1)' }));
    }
    Promise.all(animations.map(animation => animation.finished)).then(stop, stop);
  } catch { stop(); }
}
