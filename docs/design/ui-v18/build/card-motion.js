// 资产卡复制反馈（UI v18 第二轮视觉稿）。点「复制」后：
// 1. 卡屏图标按 4px 一格起跳、落地，身后拖两层液晶残影；
// 2. 出战数逐行上滚换成新值（个位先停）；
// 3. 数据像素沿现有的「数据飞入」（src/data-flight.js）飞向左下伙伴屏，由蛋接住；
// 4. 成长期资产第一次被复制（即进入成熟期的“成功复制”）时再演一次进化：
//    图标闪白两下 → 一道扫描线从左到右刷过卡屏 → 进化格点亮 → 说明行换成新阶段。
// 动画在点击当刻一次排好（WAAPI + delay），最终状态立即写进 DOM，动画只演“过程”；
// 因此分镜截图可以暂停后拨到任意时刻。减少动态效果时直接显示结果。
import { flyData } from "../../../../src/data-flight.js";
import { installScreenMotion, reducedMotion } from "../../../../src/scan-motion.js";
import { rollTo } from "./lcd-digits.js";

const STAGES = ["幼年期", "成长期", "成熟期", "完全体", "究极体"];
const STEP = { easing: "steps(1, end)" }; // 关键帧之间不插值：逐帧跳变
const HOP = [[0, 4], [80, -8], [160, -12], [300, -4], [380, 0]]; // [时刻 ms, 位移 px]，都在 4px 点阵上
const HOP_MS = 460;
const ROLL_AT = 120; // 起跳时开始换数
const EVOLVE_AT = 480;
const CELL_OFF = "rgba(140, 178, 255, 0.15)";

const hopFrames = (extra = {}) => [
  ...HOP.map(([t, y]) => ({ offset: t / HOP_MS, transform: `translateY(${y}px)`, ...STEP, ...extra })),
  { offset: 1, transform: "translateY(0)", ...extra },
];

function hop(scr) {
  scr.querySelectorAll(".b-ghost").forEach((n) => n.remove());
  const icon = scr.querySelector(".b-icon");
  if (!icon) {
    // 效果图卡不跳，屏幕像伙伴屏按下背光键一样亮两帧
    scr.animate([{ filter: "brightness(1.25)", ...STEP }, { offset: 0.5, filter: "none", ...STEP }, { filter: "none" }], { duration: 240 });
    return;
  }
  // 液晶残影：两份副本晚 70/140ms 走同一段脚本，亮度依次减弱
  [[70, 0.32], [140, 0.14]].forEach(([delay, opacity]) => {
    const ghost = icon.cloneNode(true);
    ghost.className = "b-icon b-ghost";
    icon.before(ghost);
    ghost.animate(hopFrames({ opacity }), { duration: HOP_MS, delay });
  });
  icon.animate(hopFrames(), { duration: HOP_MS });
}

function evolve(card, scr, to, reduced) {
  const cell = card.querySelectorAll(".stage-cells i")[to];
  cell.classList.add("on");
  const name = card.querySelector("[data-stage-name]");
  name.innerHTML = `<span class="was">${STAGES[to - 1]}</span><span class="now">${STAGES[to]}</span>`;
  card.dataset.stage = to;
  if (reduced) return;
  const target = scr.querySelector(".b-icon:not(.b-ghost), .b-cover");
  const lit = getComputedStyle(target).filter;
  const white = "brightness(0) invert(1) drop-shadow(0 0 4px #fff)";
  target.animate([{ filter: white, ...STEP }, { offset: 1 / 3, filter: lit, ...STEP }, { offset: 2 / 3, filter: white, ...STEP }, { filter: lit }], { duration: 240, delay: EVOLVE_AT });
  // 扫描线：每帧右移 8px（两格点阵），和伙伴屏换季那一道同一种动作
  const sweep = document.createElement("i");
  sweep.className = "b-sweep";
  sweep.setAttribute("aria-hidden", "true");
  scr.append(sweep);
  const w = scr.clientWidth;
  sweep.animate([{ transform: "translateX(0)", opacity: 1 }, { transform: `translateX(${w + 40}px)`, opacity: 1 }], {
    duration: 480, delay: EVOLVE_AT + 260, easing: `steps(${Math.round((w + 40) / 8)}, end)`,
  });
  const at = EVOLVE_AT + 740, total = at + 550;
  cell.animate([
    { offset: 0, background: CELL_OFF, boxShadow: "none", transform: "scaleY(1)", ...STEP },
    { offset: at / total, background: "#fff", boxShadow: "0 0 8px #fff", transform: "scaleY(0.2)" },
    { offset: (at + 330) / total, transform: "scaleY(1.6)" },
    { offset: 1, background: "#ff8a24", boxShadow: "0 0 5px rgba(255, 138, 36, 0.55)", transform: "scaleY(1)" },
  ], { duration: total });
  // 说明行：新阶段字闪两帧后停住
  name.querySelector(".was").animate([{ visibility: "visible" }, { visibility: "visible" }], { duration: at });
  name.querySelector(".now").animate([
    { offset: 0, visibility: "hidden", ...STEP },
    { offset: at / (at + 160), visibility: "visible", ...STEP },
    { offset: (at + 80) / (at + 160), visibility: "hidden", ...STEP },
    { offset: 1, visibility: "visible" },
  ], { duration: at + 160 });
}

function flashButton(btn, ms) {
  const lbl = btn.querySelector(".lbl"), done = btn.querySelector(".done");
  if (!lbl || !done) return;
  [lbl, done].forEach((n) => n.getAnimations().forEach((x) => x.cancel()));
  lbl.animate([{ visibility: "hidden" }, { visibility: "hidden" }], { duration: ms });
  done.animate([{ visibility: "visible" }, { visibility: "visible" }], { duration: ms });
}

export function copyFeedback(card, btn) {
  const reduced = reducedMotion();
  const scr = card.querySelector(".b-scr");
  const uses = Number(card.dataset.uses), stage = Number(card.dataset.stage);
  const evolveTo = stage === 1 && uses === 0 ? 2 : null; // 成长期 → 成熟期的判定就是“成功复制”
  card.dataset.uses = uses + 1;
  flashButton(btn, evolveTo ? 2000 : 1600);
  const entry = btn.dataset.entry != null && btn.querySelector("small");
  if (entry) entry.textContent = `×${Number(entry.textContent.slice(1)) + 1}`;
  if (!reduced) hop(scr);
  rollTo(card.querySelector(".lcd-count"), String(uses + 1).padStart(2, "0"), { at: ROLL_AT, reduced, label: `出战 ${uses + 1} 次` });
  if (evolveTo) evolve(card, scr, evolveTo, reduced);
  flyData(btn);
}

document.addEventListener("click", (e) => {
  const btn = e.target.closest?.("[data-copy]");
  if (btn) copyFeedback(btn.closest("[data-card]"), btn);
});
installScreenMotion();
