// 视觉稿里原样挂载左下角伙伴屏与首页暴龙机屏：直接调用 src/partner-lcd.js 的同一绘制引擎，
// 参数与 PartnerScreen.jsx 一致（侧栏 roam：按容器铺满，高 ≥80 每点 4px；暴龙机 stage：14×15）。
// data-start 只用于把截图定在某一季（与引擎测试用 startStep 相同）。
import { createPartnerLcd } from "../../../../src/partner-lcd.js";

const roamDot = (height) => (height >= 80 ? 4 : 3);
function mount() {
  for (const canvas of document.querySelectorAll("canvas[data-partner]")) {
    const mode = canvas.dataset.partner;
    const box = canvas.parentElement;
    createPartnerLcd(canvas, {
      mode,
      startStep: Number(canvas.dataset.start || 0),
      ...(mode === "roam" ? { dot: roamDot(box.clientHeight) } : { cols: 14, rows: 15 }),
      onSeason: (season) => {
        canvas.closest(".partner-screen")?.setAttribute("data-season", season.id);
        const label = document.querySelector("[data-season-label]");
        if (label && mode === "roam") label.textContent = `${season.label} · 数码蛋`;
      },
    });
  }
}
if (document.readyState === "loading") addEventListener("DOMContentLoaded", mount);
else mount();
