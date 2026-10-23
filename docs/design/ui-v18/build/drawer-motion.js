// 设计录入抽屉（UI v18 第二轮视觉稿）：右栏的复制预览跟着左边的选择实时变，变化看得见——
// · 勾上一个招式：勾号分三帧画出，这一段按帧“插进”预览的招式区，背景闪两帧；取消勾选则按帧收起。
// · 切换「交给谁」：预览的首尾两句被逐格擦掉、换成另一套话术。
// 动画在操作当刻一次排好，最终状态立即写进 DOM，分镜可暂停后拨到任意时刻；减少动态效果时直接换。
import { reducedMotion } from "../../../../src/scan-motion.js";
import { previewLines, previewMeta, WRAP } from "./design-preview.js";

const STEP = { easing: "steps(1, end)" };
const FLASH = "rgba(255, 143, 184, 0.24)"; // 设计类型色（粉）
const drawer = document.querySelector("[data-drawer]");

function state() {
  const data = JSON.parse(drawer.querySelector("[data-design]").textContent);
  const checked = [...drawer.querySelectorAll("[data-move]")].map((box) => box.checked);
  return { data, checked, target: drawer.dataset.target };
}

function refreshMeta(lines, target, checked) {
  drawer.querySelector("[data-preview-meta]").textContent = previewMeta(lines, target);
  drawer.querySelector("[data-picked]").textContent = checked.filter(Boolean).length;
}

function toggleMove(box) {
  const reduced = reducedMotion();
  const { data, checked, target } = state();
  const i = Number(box.dataset.move), key = `move-${i}`;
  const lines = previewLines(data, checked, target);
  const preview = drawer.querySelector("[data-preview]");
  refreshMeta(lines, target, checked);
  if (!reduced)
    box.nextElementSibling.animate(
      box.checked
        ? [{ clipPath: "inset(0 100% 0 0)", ...STEP }, { offset: 1 / 3, clipPath: "inset(0 55% 0 0)", ...STEP }, { offset: 2 / 3, clipPath: "inset(0 25% 0 0)", ...STEP }, { clipPath: "inset(0 0 0 0)" }]
        : [{ opacity: 0.4, ...STEP }, { opacity: 1 }],
      { duration: 120, pseudoElement: "::after" },
    );
  const old = preview.querySelector(`[data-line="${key}"]`);
  if (!box.checked) {
    if (!old) return;
    if (reduced) return old.remove();
    const h = old.offsetHeight;
    old.style.overflow = "hidden";
    old.animate([0, 1, 2].map((k) => ({ offset: k / 3, height: `${Math.round((h * (3 - k)) / 3)}px`, opacity: 1 - k / 3, ...STEP })).concat({ height: "0px", opacity: 0, marginTop: "0px" }), { duration: 120, fill: "forwards" }).finished.then(() => old.remove(), () => {});
    return;
  }
  // 插到它在新内容里的位置：紧跟前一行
  const at = lines.findIndex((l) => l.key === key);
  const line = document.createElement("p");
  line.dataset.line = key;
  line.textContent = lines[at].text;
  preview.querySelector(`[data-line="${lines[at - 1].key}"]`).after(line);
  line.scrollIntoView({ block: "nearest" });
  if (reduced) return;
  const h = line.offsetHeight;
  line.animate([
    { height: "0px", opacity: 0, overflow: "hidden", ...STEP },
    { offset: 0.2, height: `${Math.round(h / 3)}px`, opacity: 1, overflow: "hidden", background: FLASH, ...STEP },
    { offset: 0.4, height: `${Math.round((h * 2) / 3)}px`, overflow: "hidden", background: FLASH, ...STEP },
    { offset: 0.6, height: `${h}px`, background: "transparent", ...STEP },
    { offset: 0.8, height: `${h}px`, background: FLASH, ...STEP },
    { height: `${h}px`, background: "transparent" },
  ], { duration: 300 });
}

function switchTarget(btn) {
  const reduced = reducedMotion();
  const target = btn.dataset.target;
  if (target === drawer.dataset.target) return;
  drawer.dataset.target = target;
  drawer.querySelectorAll(".dr-seg [data-target]").forEach((b) => {
    const on = b === btn;
    b.classList.toggle("on", on);
    b.setAttribute("aria-checked", on);
  });
  const { data, checked } = state();
  refreshMeta(previewLines(data, checked, target), target, checked);
  for (const key of ["head", "tail"]) {
    const p = drawer.querySelector(`[data-line="${key}"]`);
    const was = p.querySelector(".now")?.textContent ?? p.textContent;
    p.innerHTML = `<span class="was">${was}</span><span class="now">${WRAP[target][key]}</span>`;
    if (reduced) continue;
    // 旧话术从右往左逐格擦掉，新话术从左往右逐格写出（各 4 帧）
    const wipe = (from, to) => [0, 1, 2, 3].map((k) => ({ offset: k / 4, clipPath: `inset(0 ${from + ((to - from) * k) / 4}% 0 0)`, ...STEP })).concat({ clipPath: `inset(0 ${to}% 0 0)` });
    p.querySelector(".was").animate(wipe(0, 100), { duration: 160, fill: "forwards" });
    p.querySelector(".now").animate(wipe(100, 0), { duration: 160, delay: 160, fill: "backwards" });
  }
}

if (drawer) {
  drawer.addEventListener("change", (e) => e.target.matches("[data-move]") && toggleMove(e.target));
  drawer.addEventListener("click", (e) => {
    const seg = e.target.closest(".dr-seg [data-target]");
    if (seg) switchTarget(seg);
  });
}
