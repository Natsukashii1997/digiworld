// 伙伴液晶屏（UI v13.1）：固定点阵、三级墨色、液晶残影、逐帧光栅化的数码蛋。
// 用户 2026-09-29：伙伴固定为数码蛋；滚动有节奏、在中间停下；四季循环轮换；不做蛋壳裂纹。
// 纯画布绘制，不依赖 React；装饰性内容，调用方负责 aria-hidden。
// 设计预览经用户确认（2026-09-29）；startStep 只用于测试时直接定位到某一帧。

export const SEASONS = [
  { id: "spring", label: "春 · 花开" },
  { id: "summer", label: "夏 · 骤雨" },
  { id: "autumn", label: "秋 · 落叶" },
  { id: "winter", label: "冬 · 初雪" },
];
const SEASON_STEPS = 15 * 20; // 每季 15 秒，模拟步长 20 步/秒

// ---------- 蛋：解析形状，按任意角度光栅化到点阵 ----------
// 对称椭圆蛋（用户 2026-09-30：改回最初的对称椭圆）。半宽、半高；逐行宽 3 7 7 9 9 11 11 11 9 9 7 7 3。
const EGG = { a: 5.1, b: 6.3, k: 0, shift: 0 };
// 斑点按最初那颗蛋排：顶部一块、左右各一块、底部一块（局部坐标，y 向下为正）
const SPOTS = [
  [0, -3.1, 1.35],
  [-3.2, 1.2, 1.05],
  [3.2, 1.2, 1.05],
  [0, 3.5, 1.35],
];
// 左上角一点高光
const SHINE = [-2.6, -3.7, 0.95];
function insideEgg(u, v) {
  const a = EGG.a * (1 + (EGG.k * v) / EGG.b);
  return (u * u) / (a * a) + (v * v) / (EGG.b * EGG.b) <= 1;
}
// 返回 { cells: Map("x,y" -> 墨色), bottom, top }，坐标相对旋转中心（点阵格）。
export function rasterEgg(angle, { sx = 1, sy = 1 } = {}) {
  const cos = Math.cos(-angle),
    sin = Math.sin(-angle);
  const toLocal = (x, y) => {
    const u = (x * cos - y * sin) / sx,
      v = (x * sin + y * cos) / sy;
    return [u, v + EGG.shift];
  };
  const inside = new Set();
  const R = 9;
  for (let y = -R; y <= R; y++)
    for (let x = -R; x <= R; x++) {
      const [u, v] = toLocal(x, y);
      if (insideEgg(u, v)) inside.add(`${x},${y}`);
    }
  const cells = new Map();
  let bottom = -Infinity,
    top = Infinity;
  for (const key of inside) {
    const [x, y] = key.split(",").map(Number);
    bottom = Math.max(bottom, y);
    top = Math.min(top, y);
    const edge = [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ].some(([dx, dy]) => !inside.has(`${x + dx},${y + dy}`));
    if (edge) {
      cells.set(key, 3);
      continue;
    }
    const [u, v] = toLocal(x, y);
    const near = ([su, sv, r]) => (u - su) ** 2 + (v - sv) ** 2 <= r * r;
    cells.set(key, near(SHINE) ? 16 : SPOTS.some(near) ? 6 : 5);
  }
  return { cells, bottom, top };
}

// ---------- 引擎 ----------
const INK = "28, 38, 22";
// 墨色三级（液晶）+ 蛋的专属色：3 描边 / 5 奶白壳 / 6 橙斑
// 编码：1–3 液晶墨色三级；5 奶白壳、6 橙斑（蛋）；7 起是四季的颜色。编码越大，同一格上越优先显示。
const C = { grass: 7, cloudDark: 8, rain: 9, leafDark: 10, leaf: 11, pink: 12, sun: 13, cloud: 14, snow: 15 };
const SHADE = [0, 0.26, 0.55, 0.92, 0, 1, 1, 0.95, 0.55, 0.9, 1, 1, 1, 1, 0.95, 1, 1];
const COLOR = {
  5: "246, 242, 228",
  6: "255, 138, 36",
  7: "74, 150, 60",
  8: "120, 132, 150",
  9: "58, 118, 200",
  10: "170, 64, 36",
  11: "226, 124, 36",
  12: "232, 96, 150",
  13: "255, 205, 60",
  14: "250, 252, 255",
  15: "255, 255, 255",
  16: "255, 255, 255",
};
const ease = (t) => (t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2);
function prng(seed) {
  let s = seed;
  return () => (s = (s * 9301 + 49297) % 233280) / 233280;
}

// mode: "roam"（侧栏：滚动 + 四季）或 "stage"（首页暴龙机：蛋居中，定时晃动）
// dot 给定时按容器大小铺满（点数 = 容器尺寸 ÷ 点距，向下取整）；否则按固定 cols×rows 取最大整数点距。
export function createPartnerLcd(canvas, { mode = "roam", cols: fixedCols, rows: fixedRows, dot: fixedDot, onSeason, reduced = false, startStep = 0 } = {}) {
  const ctx = canvas.getContext("2d");
  const rnd = prng(11);
  const box = canvas.parentElement;
  const cols = fixedCols ?? Math.max(24, Math.floor((box?.clientWidth || 180) / (fixedDot || 3)));
  const rows = fixedRows ?? Math.max(16, Math.floor((box?.clientHeight || 78) / (fixedDot || 3)));
  const ground = rows - 3;
  const glow = new Float32Array(cols * rows);
  let target = new Uint8Array(cols * rows);
  const tint = new Uint8Array(cols * rows);
  let step = startStep,
    raf = 0,
    last = 0,
    acc = 0,
    running = false;
  let action = null,
    pokes = 0,
    catching = null,
    lightning = 0,
    seasonIndex = -1,
    snowOnEgg = 0;
  let dot = 3;

  // 按外层容器可用空间取整数点距（画布自身尺寸由这里设定，不能拿来反算）
  function fit() {
    const w = box?.clientWidth || cols * 3,
      h = box?.clientHeight || rows * 3;
    dot = fixedDot || Math.max(2, Math.floor(Math.min(w / cols, h / rows)));
    const ratio = window.devicePixelRatio || 1;
    canvas.width = cols * dot * ratio;
    canvas.height = rows * dot * ratio;
    canvas.style.width = `${cols * dot}px`;
    canvas.style.height = `${rows * dot}px`;
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
  }
  const put = (x, y, shade) => {
    x = Math.round(x);
    y = Math.round(y);
    if (x < 0 || y < 0 || x >= cols || y >= rows) return;
    const i = y * cols + x;
    if (shade > target[i]) target[i] = shade;
  };

  const force = (x, y, code) => {
    x = Math.round(x);
    y = Math.round(y);
    if (x < 0 || y < 0 || x >= cols || y >= rows) return;
    target[y * cols + x] = code;
  };

  // ---- 四季（点阵坐标）：用颜色和整屏底色让季节一眼可辨 ----
  const petals = Array.from({ length: 10 }, () => ({ x: rnd() * cols, y: rnd() * ground, p: rnd() * 6 }));
  const rain = Array.from({ length: 22 }, () => ({ x: rnd() * (cols + 12), y: rnd() * ground }));
  const splashes = [];
  const leaves = Array.from({ length: 10 }, () => ({ x: rnd() * cols, y: rnd() * ground, p: rnd() * 6, dark: rnd() > 0.5 }));
  const gusts = Array.from({ length: 4 }, () => ({ x: -rnd() * 60, y: 2 + rnd() * (ground - 6), l: 4 + Math.floor(rnd() * 5) }));
  const snow = Array.from({ length: 20 }, () => ({ x: rnd() * cols, y: rnd() * ground, p: rnd() * 6, big: rnd() > 0.72 }));
  // 花草云的位置按屏幕宽度比例排，屏幕多宽都铺得开
  const at = (f) => Math.round(cols * f);
  const clouds = [
    { x: at(0.07), y: 1, w: Math.max(6, at(0.18)) },
    { x: at(0.55), y: 0, w: Math.max(5, at(0.13)) },
    { x: at(0.83), y: 2, w: Math.max(4, at(0.11)) },
  ];
  const grassCols = Array.from({ length: Math.floor(cols / 5) }, (_, i) => 2 + i * 5);
  const flowerCols = [0.13, 0.32, 0.68, 0.87].map(at);
  const piles = [[0.1, 4], [0.38, 3], [0.74, 5], [0.92, 3]].map(([f, w]) => [at(f), w]);

  function drawSeason(id, t, clip) {
    const P = (x, y, s) => clip(x) && put(x, y, s);
    const groundColor = { spring: C.grass, summer: C.grass, autumn: C.leaf, winter: C.snow }[id];
    for (let x = 0; x < cols; x++) {
      P(x, ground, groundColor);
      if (x % 2 === 0) P(x, ground + 1, 2);
    }
    if (id === "spring" || id === "summer") {
      grassCols.forEach((gx, i) => {
        const lean = (Math.floor(t / 8) + i) % 2;
        P(gx, ground - 1, C.grass);
        P(gx + lean, ground - 2, C.grass);
        P(gx + 2, ground - 1, C.grass);
        if (i % 3 === 0) P(gx + 1 + lean, ground - 3, C.grass);
      });
    }
    if (id === "spring") {
      flowerCols.forEach((fx, i) => {
        const open = Math.sin(t / 20 + i * 1.7) > -0.4;
        for (let y = 1; y <= 3; y++) P(fx, ground - y, C.grass);
        P(fx + 1, ground - 2, C.grass);
        P(fx, ground - 5, C.sun);
        const ring = open
          ? [[-1, 0], [1, 0], [0, -1], [0, 1], [-1, -1], [1, -1], [-1, 1], [1, 1]]
          : [[-1, 0], [1, 0], [0, -1]];
        ring.forEach(([dx, dy]) => P(fx + dx, ground - 5 + dy, C.pink));
      });
      petals.forEach((p) => {
        p.x += 0.34;
        p.y += 0.22 + Math.sin(t / 7 + p.p) * 0.14;
        if (p.x > cols || p.y > ground - 1) Object.assign(p, { x: -rnd() * 10, y: rnd() * 10 });
        P(p.x, p.y, C.pink);
        if (p.p > 3) P(p.x + 1, p.y, C.pink);
      });
    }
    if (id === "summer") {
      clouds.forEach((c) => {
        c.x += 0.06;
        if (c.x > cols + 2) c.x = -c.w - 2;
        for (let i = 0; i < c.w; i++) {
          P(c.x + i, c.y + 1, C.cloud);
          P(c.x + i, c.y + 2, C.cloudDark);
          if (i > 1 && i < c.w - 2) P(c.x + i, c.y, C.cloud);
        }
      });
      rain.forEach((r) => {
        r.x -= 0.5;
        r.y += 1.6;
        if (r.y >= ground - 1) {
          splashes.push({ x: r.x, life: 3 });
          Object.assign(r, { x: rnd() * (cols + 12), y: 3 + rnd() * 3 });
        }
        P(r.x, r.y, C.rain);
        P(r.x + 0.3, r.y - 1, C.rain);
      });
      for (let i = splashes.length - 1; i >= 0; i--) {
        const s = splashes[i];
        P(s.x - 1, ground - 1, C.rain);
        P(s.x + 1, ground - 1, C.rain);
        if (s.life === 3) P(s.x, ground - 2, C.rain);
        if (--s.life <= 0) splashes.splice(i, 1);
      }
    }
    if (id === "autumn") {
      gusts.forEach((g) => {
        g.x += 2.4;
        if (g.x > cols + 10) Object.assign(g, { x: -10 - rnd() * 50, y: 2 + rnd() * (ground - 6), l: 4 + Math.floor(rnd() * 5) });
        for (let i = 0; i < g.l; i++) P(g.x - i, g.y, i === 0 ? 2 : 1);
      });
      leaves.forEach((l, i) => {
        l.x += 0.42 + Math.sin(t / 9 + l.p) * 0.32;
        l.y += 0.24;
        if (l.x > cols || l.y > ground - 1) Object.assign(l, { x: -rnd() * 12, y: rnd() * 6 });
        const code = l.dark ? C.leafDark : C.leaf;
        const flip = Math.floor(t / 3 + i) % 2;
        P(l.x, l.y, code);
        P(l.x + 1, l.y, code);
        P(l.x + (flip ? 1 : 0), l.y + 1, code);
      });
      piles.forEach(([px, w], i) => {
        for (let k = 0; k < w; k++) P(px + k, ground - 1, i % 2 ? C.leafDark : C.leaf);
        P(px + 1, ground - 2, C.leaf);
      });
    }
    if (id === "winter") {
      snow.forEach((f) => {
        f.y += f.big ? 0.14 : 0.2;
        f.x += Math.sin(t / 10 + f.p) * 0.18;
        if (f.y > ground - 1) Object.assign(f, { x: rnd() * cols, y: -rnd() * 4 });
        P(f.x, f.y, C.snow);
        if (f.big) [[-1, 0], [1, 0], [0, -1], [0, 1]].forEach(([dx, dy]) => P(f.x + dx, f.y + dy, C.snow));
      });
      const depth = Math.min(1, ((t % SEASON_STEPS) / SEASON_STEPS) * 1.6);
      for (let x = 0; x < cols; x++) {
        if ((x * 7) % 10 < depth * 10) P(x, ground - 1, C.snow);
        if (depth > 0.7 && (x * 3) % 7 === 0) P(x, ground - 2, C.snow);
      }
    }
  }

  // ---- 蛋的动作脚本（每 2.5 秒一段：滚半圈 → 刹住回摆 → 跳起翻正 → 落地微压 → 停） ----
  const STOPS = mode === "roam" ? [Math.round(cols / 2), Math.round(cols * 0.76), Math.round(cols / 2), Math.round(cols * 0.24)] : [];
  const SEG = 50; // 2.5 秒
  const R = 5.3; // 滚动半径（点）
  function eggPose(t) {
    if (mode !== "roam") {
      // 首页：居中静置，每 4 秒左右晃三下再轻跳
      const phase = t % 80;
      let angle = 0,
        hop = 0,
        sy = 1,
        sx = 1;
      if (phase >= 44 && phase < 62) angle = Math.sin(((phase - 44) / 18) * Math.PI * 3) * 0.28 * (1 - (phase - 44) / 18);
      if (phase >= 62 && phase < 70) hop = Math.sin(((phase - 62) / 8) * Math.PI) * 2.2;
      if (phase >= 70 && phase < 73) [sx, sy] = [1.1, 0.88];
      return { x: cols / 2, angle, hop, sx, sy, resting: phase < 44 };
    }
    const seg = Math.floor(t / SEG) % 4,
      f = (t % SEG) / SEG;
    const to = STOPS[seg],
      from = STOPS[(seg + 3) % 4],
      dir = Math.sign(to - from);
    const roll = Math.abs(to - from) / R;
    if (f < 0.4) {
      const e = ease(f / 0.4);
      return { x: from + (to - from) * e, angle: dir * roll * e, hop: 0, sx: 1, sy: 1, resting: false };
    }
    if (f < 0.5) {
      const k = (f - 0.4) / 0.1;
      return { x: to, angle: dir * (roll + Math.sin(k * Math.PI * 2) * 0.22 * (1 - k)), hop: 0, sx: 1, sy: 1, resting: false };
    }
    const upright = dir * Math.PI * 2 * Math.ceil(roll / (Math.PI * 2) + 0.01);
    if (f < 0.62) {
      const k = (f - 0.5) / 0.12;
      return { x: to, angle: dir * roll + (upright - dir * roll) * ease(k), hop: Math.sin(k * Math.PI) * 3.2, sx: 1, sy: 1, resting: false };
    }
    if (f < 0.68) return { x: to, angle: upright, hop: 0, sx: 1.12, sy: 0.86, resting: false };
    return { x: to, angle: upright, hop: 0, sx: 1, sy: 1, resting: true };
  }

  function drawEgg(t) {
    const pose = eggPose(t);
    let hop = pose.hop,
      angle = pose.angle,
      sx = pose.sx,
      sy = pose.sy;
    // 戳一下：四种动作轮流出现，叠加在当前姿态上
    if (action) {
      const k = action.k / action.len;
      if (action.type === "hop") {
        hop += Math.sin(Math.min(1, k / 0.8) * Math.PI) * 6;
        if (k > 0.8) [sx, sy] = [1.15, 0.82];
      } else if (action.type === "spin") {
        angle += ease(k) * Math.PI * 2;
        hop += Math.sin(k * Math.PI) * 2.5;
      } else if (action.type === "wiggle") {
        angle += Math.sin(k * Math.PI * 8) * 0.42 * (1 - k);
      } else if (action.type === "bounce") {
        hop += Math.abs(Math.sin(k * Math.PI * 2)) * 3.5 * (1 - k * 0.4);
        if (Math.abs(Math.sin(k * Math.PI * 2)) < 0.15) [sx, sy] = [1.12, 0.86];
      }
    }
    const egg = rasterEgg(angle, { sx, sy });
    const baseY = (mode === "roam" ? ground - 1 : rows - 1) - egg.bottom;
    const ox = Math.round(pose.x),
      oy = Math.round(baseY - hop);
    for (const [key, shade] of egg.cells) {
      const [x, y] = key.split(",").map(Number);
      force(ox + x, oy + y, shade);
    }
    // 冬天停着时，蛋顶慢慢积雪；一滚就抖掉
    if (mode === "roam" && SEASONS[seasonIndex]?.id === "winter" && pose.resting) snowOnEgg = Math.min(4, snowOnEgg + 0.03);
    else if (!pose.resting) snowOnEgg = 0;
    for (let i = 0; i < Math.floor(snowOnEgg); i++) force(ox - 1 + i, oy + egg.top - 1, C.snow);
    return { x: ox, y: oy + egg.top };
  }

  function tick() {
    target = new Uint8Array(cols * rows);
    const t = step;
    if (mode === "roam") {
      const index = Math.floor(t / SEASON_STEPS) % 4,
        into = t % SEASON_STEPS;
      if (index !== seasonIndex) {
        seasonIndex = index;
        canvas.dataset.season = SEASONS[index].id;
        onSeason?.(SEASONS[index]);
      }
      // 换季：一条扫描线从左到右刷过（0.8 秒）
      const wipe = into < 16 ? (into / 16) * cols : cols + 1;
      drawSeason(SEASONS[index].id, t, (x) => x < wipe);
      if (wipe <= cols) {
        drawSeason(SEASONS[(index + 3) % 4].id, t, (x) => x >= wipe);
        for (let y = 0; y < rows; y++) put(wipe, y, 1);
      }
      if (SEASONS[index].id === "summer" && lightning <= 0 && rnd() < 0.004) lightning = 3;
    } else if (t % 80 >= 70 && t % 80 < 76) {
      // 首页：跳起落地时闪两点光
      put(cols / 2 - 7, 4, C.sun);
      put(cols / 2 + 6, 6, C.sun);
    }
    const head = drawEgg(t);
    // 接住数据：一串点从顶上落进蛋里
    if (catching) {
      catching.k++;
      for (let i = 0; i < 4; i++) {
        const y = catching.k * 1.4 - i * 2;
        if (y < head.y) put(head.x + (i % 2 ? 1 : -1), y, 3 - (i > 1 ? 1 : 0));
      }
      if (catching.k * 1.4 - 6 >= head.y) {
        catching = null;
        action = { type: "hop", k: 0, len: 18 };
      }
    }
    if (action && ++action.k >= action.len) action = null;
    step++;
  }

  function render() {
    const w = cols * dot,
      h = rows * dot,
      size = dot - (dot > 2 ? 1 : 0);
    ctx.clearRect(0, 0, w, h);
    const flash = lightning > 0;
    if (flash) lightning--;
    for (let i = 0; i < glow.length; i++) {
      const code = target[i],
        want = SHADE[code];
      if (code) tint[i] = code;
      // 液晶残影：亮起立刻到位，熄灭慢慢褪去（保留最后的颜色）
      glow[i] = code ? want : glow[i] * 0.52;
      const x = (i % cols) * dot,
        y = Math.floor(i / cols) * dot;
      const color = COLOR[tint[i]];
      if (color && glow[i] > 0.08) {
        ctx.fillStyle = `rgba(${INK}, 0.06)`;
        ctx.fillRect(x, y, size, size);
        ctx.fillStyle = `rgba(${color}, ${flash ? glow[i] * 0.6 : glow[i]})`;
        ctx.fillRect(x, y, size, size);
        continue;
      }
      const alpha = flash ? Math.max(0.3, glow[i] * 0.4) : glow[i];
      ctx.fillStyle = `rgba(${INK}, ${Math.max(alpha, 0.06)})`;
      ctx.fillRect(x, y, size, size);
    }
  }

  function frame(now) {
    if (!running) return;
    acc += Math.min(200, now - (last || now));
    last = now;
    let changed = false;
    while (acc >= 50) {
      tick();
      acc -= 50;
      changed = true;
    }
    if (changed) render();
    raf = requestAnimationFrame(frame);
  }
  function start() {
    if (running || reduced) return;
    running = true;
    last = 0;
    raf = requestAnimationFrame(frame);
  }
  function stop() {
    running = false;
    cancelAnimationFrame(raf);
  }
  const visibility = () => (document.hidden ? stop() : start());
  const resize = () => {
    fit();
    render();
  };
  document.addEventListener("visibilitychange", visibility);
  window.addEventListener("resize", resize);

  fit();
  canvas.dataset.motion = reduced ? "static" : "live";
  if (reduced) {
    // 减少动态效果：画一帧静止画面（春景、蛋居中），不启动循环
    step = mode === "roam" ? 40 : 0;
    tick();
    glow.fill(0);
    render();
  } else {
    tick();
    render();
    start();
  }

  return {
    // 戳一下：跳高 → 原地转一圈 → 左右扭 → 连弹两下，依次轮换
    poke() {
      if (reduced) return;
      const types = [
        ["hop", 18],
        ["spin", 20],
        ["wiggle", 18],
        ["bounce", 22],
      ];
      const [type, len] = types[pokes++ % types.length];
      action = { type, k: 0, len };
    },
    catchData() {
      if (!reduced) catching = { k: 0 };
    },
    get running() {
      return running;
    },
    destroy() {
      stop();
      document.removeEventListener("visibilitychange", visibility);
      window.removeEventListener("resize", resize);
    },
  };
}
