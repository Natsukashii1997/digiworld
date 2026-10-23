// 基地 B 的因果联动（UI v18 第二轮视觉稿）。暴龙机是中枢，界面对你的动作有回应：
// · A 区处理一颗蛋（投递 / 孵成资产 / 焚决 / 归档）：这一行按帧滑出、收起，下一颗补上；待孵化数翻页；
//   一串数据点沿 A 走线流进暴龙机，蛋接住（引擎原有的 catchData）。
// · 投递还会继续：数据点从暴龙机沿 B 走线流到出战槽，该槽收件数 +1 并闪一下。
// · B 区「继续」：蛋跳一下（引擎原有的 poke），数据点从暴龙机流向这个槽。
// · 常用出战复制：沿用现有「数据飞入」飞向左下伙伴屏；次数 +1。
// · 时钟每分钟按帧翻页。走线平时暗着，只有数据经过时亮。
// 动画在动作当刻一次排好（WAAPI + delay），最终状态立即写进 DOM；只有让引擎接住/跳的调用用 setTimeout。
import { flyData } from "../../../../src/data-flight.js";
import { reducedMotion } from "../../../../src/scan-motion.js";
import { rollTo } from "./lcd-digits.js";

const NS = "http://www.w3.org/2000/svg";
const STEP = { easing: "steps(1, end)" };
const FRAME = 16; // 数据点每帧前进 8px
const ORANGE = "#ff8a24", CYAN = "#4de3ff";
const pad2 = (n) => String(n).padStart(2, "0");
const stage = () => document.querySelector('canvas[data-partner="stage"]')?.__lcd;

// 一串数据点沿走线流过；返回从 at 起到最后一个点到站的毫秒数（走线隐藏时返回 0）
function stream(name, { at = 0, reverse = false, color }) {
  const svg = document.querySelector(".b-traces");
  const path = svg?.querySelector(`[data-trace="${name}"]`);
  if (!path || getComputedStyle(svg).display === "none" || reducedMotion()) return 0;
  const L = path.getTotalLength(), pts = [];
  for (let l = 0; l < L; l += 8) pts.push(path.getPointAtLength(l));
  pts.push(path.getPointAtLength(L));
  if (reverse) pts.reverse();
  const travel = pts.length * FRAME;
  const frames = pts.map((p, i) => ({ offset: i / (pts.length - 1), transform: `translate(${p.x}px, ${p.y}px)`, opacity: 1, ...STEP }));
  for (let i = 0; i < 4; i++) {
    const size = i < 2 ? 5 : 3;
    const bit = document.createElementNS(NS, "rect");
    bit.setAttribute("class", "tr-bit");
    Object.entries({ x: -size / 2, y: -size / 2, width: size, height: size, fill: i % 2 ? "#ffffff" : color }).forEach(([k, v]) => bit.setAttribute(k, v));
    svg.append(bit);
    bit.animate(frames, { duration: travel, delay: at + i * 3 * FRAME }).finished.then(() => bit.remove(), () => {});
  }
  const lit = { stroke: color, filter: `drop-shadow(0 0 4px ${color})` };
  path.animate([{ ...lit, ...STEP }, lit], { duration: travel + 9 * FRAME + 160, delay: at });
  return travel + 9 * FRAME;
}

// 暴龙机侧的 A/B 键标签闪两帧，表示数据从这里进出
function flashKey(key, at) {
  if (reducedMotion()) return;
  document.querySelector(`.b-dvkey.${key}`)?.animate(
    [{ color: "#fff", textShadow: "0 0 8px #fff", ...STEP }, { offset: 0.5, color: CYAN, textShadow: "none", ...STEP }, { offset: 0.75, color: "#fff", textShadow: "0 0 8px #fff", ...STEP }, { color: CYAN }],
    { duration: 240, delay: at },
  );
}

// 出战槽收件数 +1：数字换掉，芯片亮一下后停在“有件”状态
function bumpInbox(slot, at, reduced) {
  const chip = slot.querySelector(".b-inbox"), n = Number(chip.dataset.inbox) + 1;
  chip.dataset.inbox = n;
  chip.classList.add("hot");
  chip.querySelector("span").innerHTML = `<i class="was">${n - 1}</i><i class="now">${n}</i>`;
  if (reduced) return;
  const total = at + 360;
  chip.animate([
    { offset: 0, background: "rgba(140, 178, 255, 0.07)", color: "#b4bfda", ...STEP },
    { offset: at / total, background: ORANGE, color: "#1f0f00", ...STEP },
    { offset: (at + 120) / total, background: "rgba(255, 138, 36, 0.14)", color: "#ffb35c", ...STEP },
    { offset: (at + 240) / total, background: ORANGE, color: "#1f0f00", ...STEP },
    { offset: 1, background: "rgba(255, 138, 36, 0.14)", color: "#ffb35c" },
  ], { duration: total });
  chip.querySelector(".was").animate([{ visibility: "visible" }, { visibility: "visible" }], { duration: at });
  chip.querySelector(".now").animate([{ visibility: "hidden" }, { visibility: "hidden" }], { duration: at });
  ringFlash(slot, at + 120, CYAN);
}

function ringFlash(el, at, color) {
  const on = { boxShadow: `inset 0 0 0 1px ${color}, 0 0 16px -4px ${color}` };
  el.animate([{ ...on, ...STEP }, { offset: 0.34, boxShadow: "none", ...STEP }, { offset: 0.67, ...on, ...STEP }, { boxShadow: "none" }], { duration: 240, delay: at });
}

// A 区处理一颗蛋
export function handleEgg(btn) {
  const reduced = reducedMotion();
  const li = btn.closest("li"), port = li.closest(".b-port-a"), kind = btn.dataset.act;
  if (li.dataset.gone) return;
  li.dataset.gone = "1";
  const spare = port.querySelector("li.b-spare");
  const h = li.offsetHeight;
  // 1. 这一行向走线方向滑出（每帧 4px、亮度减一档），再分四帧收起
  li.style.overflow = "hidden";
  const leave = [0, 1, 2, 3].map((k) => ({ offset: (k * 60) / 400, opacity: 1 - k / 4, transform: `translateX(${k * 4}px)`, height: `${h}px`, ...STEP }));
  const fold = [0, 1, 2, 3].map((k) => ({ offset: (240 + k * 40) / 400, opacity: 0, transform: "translateX(16px)", height: `${Math.round((h * (4 - k)) / 4)}px`, minHeight: "0px", paddingTop: "0px", paddingBottom: "0px", ...STEP }));
  if (reduced) li.hidden = true;
  else li.animate([...leave, ...fold, { offset: 1, opacity: 0, height: "0px", minHeight: "0px", paddingTop: "0px", paddingBottom: "0px" }], { duration: 400, fill: "forwards" });
  if (spare) {
    spare.classList.remove("b-spare");
    const sh = spare.offsetHeight;
    if (!reduced)
      spare.animate([
        { height: "0px", minHeight: "0px", opacity: 0, overflow: "hidden", ...STEP },
        { offset: 0.5, height: `${sh / 2}px`, minHeight: "0px", opacity: 0.5, overflow: "hidden", ...STEP },
        { height: `${sh}px`, minHeight: "0px", opacity: 1, overflow: "hidden" },
      ], { duration: 160, delay: 400, fill: "backwards" });
  }
  // 2. 待孵化数翻页
  const count = port.querySelector(".b-big .lcd-count");
  const n = Number([...count.querySelectorAll(".reel")].map((r) => r.dataset.d).join("")) - 1;
  rollTo(count, pad2(n), { at: 160, reduced, label: `待孵化 ${n}` });
  document.querySelectorAll("[data-egg-count]").forEach((el) => (el.textContent = n));
  // 3. 数据点沿 A 线流进暴龙机，蛋接住
  const ta = stream("a", { at: 120, color: ORANGE });
  const arrive = 120 + ta;
  flashKey("a", arrive);
  setTimeout(() => stage()?.catchData(), arrive);
  // 4. 投递：继续沿 B 线流到出战槽 01（真实流程里先选项目，这里示意投给第一个槽）
  if (kind !== "deliver") return { arrive };
  const out = arrive + 360;
  flashKey("b", out);
  const tb = stream("b", { at: out, reverse: true, color: CYAN });
  bumpInbox(document.querySelector('[data-slot="01"]'), out + tb, reduced);
  return { arrive, out, land: out + tb }; // 分镜按这几个时刻取帧
}

// B 区「继续」：蛋跳一下，数据点从暴龙机流向这个槽
export function resumeSlot(btn) {
  const slot = btn.closest("[data-slot]");
  stage()?.poke();
  flashKey("b", 160);
  const tb = stream("b", { at: 160, reverse: true, color: CYAN });
  if (!reducedMotion()) ringFlash(slot, 160 + tb, CYAN);
}

// 常用出战复制：沿用现有数据飞入；次数 +1，芯片外圈闪一下
function copyLoadout(chip) {
  const n = Number(chip.dataset.loadout) + 1;
  chip.dataset.loadout = n;
  chip.querySelector("b").textContent = `×${n}`;
  if (!reducedMotion()) ringFlash(chip, 0, getComputedStyle(chip).getPropertyValue("--tc").trim() || CYAN);
  flyData(chip);
}

// 时钟：每分钟按帧翻页（视觉稿从数据里的时刻起走）
let clock = null;
export function tick() {
  const svg = document.querySelector(".b-clock .lcd-count");
  if (!svg) return;
  clock ??= svg.getAttribute("aria-label").split(":").map(Number);
  let [h, m] = clock;
  m += 1;
  if (m === 60) [h, m] = [(h + 1) % 24, 0];
  clock = [h, m];
  const text = `${pad2(h)}:${pad2(m)}`;
  rollTo(svg, text, { reduced: reducedMotion(), label: text });
}

document.addEventListener("click", (e) => {
  const t = e.target.closest?.("[data-act], [data-resume], [data-loadout], .digivice-poke");
  if (!t) return;
  if (t.dataset.act) handleEgg(t);
  else if (t.hasAttribute("data-resume")) resumeSlot(t);
  else if (t.dataset.loadout) copyLoadout(t);
  else stage()?.poke();
});
if (document.querySelector(".b-clock")) setInterval(tick, 60000);
window.__hub = { tick, handleEgg };
