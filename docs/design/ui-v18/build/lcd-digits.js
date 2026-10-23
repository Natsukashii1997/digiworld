// 可翻页的 5×7 点阵字：资产卡出战数、基地待孵化数、时钟共用。字模与 src/v14.jsx 的 LcdText 相同（只取 0–9 和冒号）。
// 生成纯 SVG 字符串，构建时（make.jsx）和运行时（*-motion.js）共用。
// 每格 1 个用户单位，亮点 0.75 见方：按 4px 显示时是 3px 亮点 + 1px 缝，正好落在卡屏点阵上。
export const GLYPHS = {
  0: "01110100011001110101110011000101110", 1: "00100011000010000100001000010001110", 2: "01110100010000100010001000100011111",
  3: "11111000100010000010000011000101110", 4: "00010001100101010010111110001000010", 5: "11111100001111000001000011000101110",
  6: "00110010001000011110100011000101110", 7: "11111000010001000100010000100001000", 8: "01110100011000101110100011000101110",
  9: "01110100011000101111000010001001100", ":": "00000011000110000000011000110000000",
};
const DOT = 0.75;

// 一个字的亮点；y0 是起始行（卷轴里新字排在旧字下面一行空隙之后）
export function digitDots(ch, y0 = 0) {
  let out = "";
  const g = GLYPHS[ch];
  for (let y = 0; y < 7; y++)
    for (let x = 0; x < 5; x++) if (g[y * 5 + x] === "1") out += `<rect x="${x}" y="${y + y0}" width="${DOT}" height="${DOT}"/>`;
  return out;
}

export function lcdSvg(text, label) {
  const w = text.length * 6 - 1;
  let off = "", cells = "";
  [...text].forEach((ch, i) => {
    for (let y = 0; y < 7; y++) for (let x = 0; x < 5; x++) off += `<rect x="${i * 6 + x}" y="${y}" width="${DOT}" height="${DOT}"/>`;
    cells += `<svg class="cell" x="${i * 6}" y="0" width="5" height="7" viewBox="0 0 5 7" overflow="hidden"><g class="reel" data-d="${ch}">${digitDots(ch)}</g></svg>`;
  });
  return `<svg class="lcd-count" viewBox="0 0 ${w} 7" role="img" aria-label="${label}"><g class="off">${off}</g>${cells}</svg>`;
}
export const countSvg = (n, label) => lcdSvg(String(n).padStart(2, "0"), label);

// 翻到新值：变了的字整条卷轴按行上移 8 格（steps 逐行跳），右边的字先停、左边的晚 90ms。
// 最终状态立即写进 DOM，动画只演过程（fill: backwards），分镜可暂停后拨到任意时刻。
export function rollTo(svg, text, { at = 0, reduced = false, label } = {}) {
  if (label) svg.setAttribute("aria-label", label);
  const reels = [...svg.querySelectorAll(".reel")];
  let k = 0;
  for (let i = reels.length - 1; i >= 0; i--) {
    const reel = reels[i], from = reel.dataset.d, to = text[i];
    reel.getAnimations().forEach((x) => x.cancel());
    reel.dataset.d = to;
    if (from === to || reduced) {
      reel.innerHTML = digitDots(to);
      reel.style.transform = "";
      continue;
    }
    reel.innerHTML = digitDots(from) + digitDots(to, 8);
    reel.style.transform = "translateY(-8px)";
    reel.animate([{ transform: "translateY(0)" }, { transform: "translateY(-8px)" }], {
      duration: 240 + k * 90, delay: at, easing: "steps(8, end)", fill: "backwards",
    });
    k++;
  }
}
