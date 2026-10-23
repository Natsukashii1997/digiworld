// 视觉稿里原样挂载左下角伙伴屏与首页暴龙机屏：直接调用 src/partner-lcd.js 的同一绘制引擎，
// 参数与 PartnerScreen.jsx 一致（侧栏 roam：按容器铺满，高 ≥80 每点 4px；暴龙机 stage：14×15）。
// data-start 只用于把截图定在某一季（与引擎测试用 startStep 相同）。
import { createPartnerLcd } from "../../../../src/partner-lcd.js";
import { DATA_CAUGHT } from "../../../../src/data-flight.js";

const roamDot = (height) => (height >= 80 ? 4 : 3);
const reduced = () => {
  try {
    return matchMedia("(prefers-reduced-motion: reduce)").matches;
  } catch {
    return false;
  }
};
function mount() {
  for (const canvas of document.querySelectorAll("canvas[data-partner]")) {
    const mode = canvas.dataset.partner;
    const box = canvas.parentElement;
    const lcd = createPartnerLcd(canvas, {
      mode,
      reduced: reduced(),
      startStep: Number(canvas.dataset.start || 0),
      ...(mode === "roam" ? { dot: roamDot(box.clientHeight) } : { cols: 14, rows: 15 }),
      onSeason: (season) => {
        canvas.closest(".partner-screen")?.setAttribute("data-season", season.id);
        const label = document.querySelector("[data-season-label]");
        if (label && mode === "roam") label.textContent = `${season.label} · 数码蛋`;
      },
    });
    canvas.__lcd = lcd; // 基地的联动动效要直接让暴龙机里的蛋接住、跳一下
    // 与 PartnerScreen.jsx 相同：复制成功的“数据飞入”到达后由蛋接住
    addEventListener(DATA_CAUGHT, () => lcd.catchData());
  }
}
if (document.readyState === "loading") addEventListener("DOMContentLoaded", mount);
else mount();
