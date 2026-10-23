(() => {
  // src/partner-lcd.js
  var SEASONS = [
    { id: "spring", label: "\u6625 \xB7 \u82B1\u5F00" },
    { id: "summer", label: "\u590F \xB7 \u9AA4\u96E8" },
    { id: "autumn", label: "\u79CB \xB7 \u843D\u53F6" },
    { id: "winter", label: "\u51AC \xB7 \u521D\u96EA" }
  ];
  var SEASON_STEPS = 15 * 20;
  var EGG_ROWS = [
    "....XXXX....",
    "..XXOOOOXX..",
    ".XOHOOOOOOX.",
    ".XHOOSSOOOX.",
    "XOOOSSSSOOOX",
    "XOOOOSSOOOOX",
    "XOSOOOOOOSOX",
    "XOSSOOOOSSOX",
    "XOOOOOOOOOOX",
    "XOOOSSSOOOOX",
    ".XOOSSSSOOX.",
    ".XOOOOOOOOX.",
    "..XXOOOOXX..",
    "....XXXX...."
  ];
  var EGG_W = EGG_ROWS[0].length;
  var EGG_H = EGG_ROWS.length;
  var eggAt = (col, row) => row >= 0 && row < EGG_H && col >= 0 && col < EGG_W ? EGG_ROWS[row][col] : ".";
  function rasterEgg(angle, { sx = 1, sy = 1 } = {}) {
    const cos = Math.cos(-angle), sin = Math.sin(-angle);
    const sample = (x, y) => {
      const px = x + 0.5, py = y + 0.5;
      const u = (px * cos - py * sin) / sx + EGG_W / 2, v = (px * sin + py * cos) / sy + EGG_H / 2;
      return eggAt(Math.floor(u), Math.floor(v));
    };
    const inside = /* @__PURE__ */ new Map();
    const R = 10;
    for (let y = -R; y <= R; y++)
      for (let x = -R; x <= R; x++) {
        const ch = sample(x, y);
        if (ch !== ".") inside.set(`${x},${y}`, ch);
      }
    const cells = /* @__PURE__ */ new Map();
    let bottom = -Infinity, top = Infinity;
    for (const [key, ch] of inside) {
      const [x, y] = key.split(",").map(Number);
      bottom = Math.max(bottom, y);
      top = Math.min(top, y);
      const edge = [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1]
      ].some(([dx, dy]) => !inside.has(`${x + dx},${y + dy}`));
      cells.set(key, edge ? 3 : ch === "S" ? 6 : ch === "H" ? 16 : 5);
    }
    return { cells, bottom, top };
  }
  var INK = "28, 38, 22";
  var C = { grass: 7, cloudDark: 8, rain: 9, leafDark: 10, leaf: 11, pink: 12, sun: 13, cloud: 14, snow: 15 };
  var SHADE = [0, 0.26, 0.55, 0.92, 0, 1, 1, 0.95, 0.55, 0.9, 1, 1, 1, 1, 0.95, 1, 1];
  var COLOR = {
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
    16: "255, 255, 255"
  };
  var ease = (t) => t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2;
  function prng(seed) {
    let s = seed;
    return () => (s = (s * 9301 + 49297) % 233280) / 233280;
  }
  function createPartnerLcd(canvas, { mode = "roam", cols: fixedCols, rows: fixedRows, dot: fixedDot, onSeason, reduced: reduced2 = false, startStep = 0 } = {}) {
    const ctx = canvas.getContext("2d");
    const rnd = prng(11);
    const box = canvas.parentElement;
    const cols = fixedCols ?? Math.max(24, Math.floor((box?.clientWidth || 180) / (fixedDot || 3)));
    const rows = fixedRows ?? Math.max(16, Math.floor((box?.clientHeight || 78) / (fixedDot || 3)));
    const ground = rows - 3;
    const glow = new Float32Array(cols * rows);
    let target = new Uint8Array(cols * rows);
    const tint = new Uint8Array(cols * rows);
    let step = startStep, raf = 0, last = 0, acc = 0, running = false;
    let action = null, view = "egg", number = 0, pokes = 0, catching = null, lightning = 0, seasonIndex = -1, snowOnEgg = 0;
    let dot = 3;
    function fit() {
      const w = box?.clientWidth || cols * 3, h = box?.clientHeight || rows * 3;
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
    const petals = Array.from({ length: 10 }, () => ({ x: rnd() * cols, y: rnd() * ground, p: rnd() * 6 }));
    const rain = Array.from({ length: 22 }, () => ({ x: rnd() * (cols + 12), y: rnd() * ground }));
    const splashes = [];
    const leaves = Array.from({ length: 10 }, () => ({ x: rnd() * cols, y: rnd() * ground, p: rnd() * 6, dark: rnd() > 0.5 }));
    const gusts = Array.from({ length: 4 }, () => ({ x: -rnd() * 60, y: 2 + rnd() * (ground - 6), l: 4 + Math.floor(rnd() * 5) }));
    const snow = Array.from({ length: 20 }, () => ({ x: rnd() * cols, y: rnd() * ground, p: rnd() * 6, big: rnd() > 0.72 }));
    const at = (f) => Math.round(cols * f);
    const clouds = [
      { x: at(0.07), y: 1, w: Math.max(6, at(0.18)) },
      { x: at(0.55), y: 0, w: Math.max(5, at(0.13)) },
      { x: at(0.83), y: 2, w: Math.max(4, at(0.11)) }
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
          const ring = open ? [[-1, 0], [1, 0], [0, -1], [0, 1], [-1, -1], [1, -1], [-1, 1], [1, 1]] : [[-1, 0], [1, 0], [0, -1]];
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
        const depth = Math.min(1, t % SEASON_STEPS / SEASON_STEPS * 1.6);
        for (let x = 0; x < cols; x++) {
          if (x * 7 % 10 < depth * 10) P(x, ground - 1, C.snow);
          if (depth > 0.7 && x * 3 % 7 === 0) P(x, ground - 2, C.snow);
        }
      }
    }
    const STOPS = mode === "roam" ? [Math.round(cols / 2), Math.round(cols * 0.76), Math.round(cols / 2), Math.round(cols * 0.24)] : [];
    const SEG = 50;
    const R = 5.3;
    function eggPose(t) {
      if (mode !== "roam") {
        const phase = t % 80;
        let angle = 0, hop2 = 0, sy = 1, sx = 1;
        if (phase >= 44 && phase < 62) angle = Math.sin((phase - 44) / 18 * Math.PI * 3) * 0.28 * (1 - (phase - 44) / 18);
        if (phase >= 62 && phase < 70) hop2 = Math.sin((phase - 62) / 8 * Math.PI) * 2.2;
        if (phase >= 70 && phase < 73) [sx, sy] = [1.1, 0.88];
        return { x: cols / 2, angle, hop: hop2, sx, sy, resting: phase < 44 };
      }
      const seg = Math.floor(t / SEG) % 4, f = t % SEG / SEG;
      const to = STOPS[seg], from = STOPS[(seg + 3) % 4], dir = Math.sign(to - from);
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
      let hop2 = pose.hop, angle = pose.angle, sx = pose.sx, sy = pose.sy;
      if (action) {
        const k = action.k / action.len;
        if (action.type === "hop") {
          hop2 += Math.sin(Math.min(1, k / 0.8) * Math.PI) * 6;
          if (k > 0.8) [sx, sy] = [1.15, 0.82];
        } else if (action.type === "spin") {
          angle += ease(k) * Math.PI * 2;
          hop2 += Math.sin(k * Math.PI) * 2.5;
        } else if (action.type === "wiggle") {
          angle += Math.sin(k * Math.PI * 8) * 0.42 * (1 - k);
        } else if (action.type === "bounce") {
          hop2 += Math.abs(Math.sin(k * Math.PI * 2)) * 3.5 * (1 - k * 0.4);
          if (Math.abs(Math.sin(k * Math.PI * 2)) < 0.15) [sx, sy] = [1.12, 0.86];
        }
      }
      const egg = rasterEgg(angle, { sx, sy });
      const baseY = (mode === "roam" ? ground - 1 : rows - 1) - egg.bottom;
      const ox = Math.round(pose.x), oy = Math.max(-egg.top, Math.round(baseY - hop2));
      for (const [key, shade] of egg.cells) {
        const [x, y] = key.split(",").map(Number);
        force(ox + x, oy + y, shade);
      }
      if (mode === "roam" && SEASONS[seasonIndex]?.id === "winter" && pose.resting) snowOnEgg = Math.min(4, snowOnEgg + 0.03);
      else if (!pose.resting) snowOnEgg = 0;
      for (let i = 0; i < Math.floor(snowOnEgg); i++) force(ox - 1 + i, oy + egg.top - 1, C.snow);
      return { x: ox, y: oy + egg.top };
    }
    const SEGMENTS = { 0: "abcdef", 1: "bc", 2: "abged", 3: "abgcd", 4: "fgbc", 5: "afgcd", 6: "afgedc", 7: "abc", 8: "abcdefg", 9: "abfgcd" };
    function drawNumber() {
      const text = String(Math.min(99, Math.max(0, number)));
      const width = 6, gap = 2, total = text.length * width + (text.length - 1) * gap;
      const left = Math.floor((cols - total) / 2), topY = Math.max(0, Math.floor((rows - 14) / 2) - 1);
      [...text].forEach((ch, k) => {
        const ox = left + k * (width + gap), segs = SEGMENTS[ch];
        const H = (y) => {
          for (let x = 1; x <= 4; x++) for (let d = 0; d < 2; d++) force(ox + x, topY + y + d, 3);
        };
        const V = (x, y0) => {
          for (let y = y0; y < y0 + 4; y++) for (let d = 0; d < 2; d++) force(ox + x + d, topY + y, 3);
        };
        if (segs.includes("a")) H(0);
        if (segs.includes("g")) H(6);
        if (segs.includes("d")) H(12);
        if (segs.includes("f")) V(0, 2);
        if (segs.includes("b")) V(4, 2);
        if (segs.includes("e")) V(0, 8);
        if (segs.includes("c")) V(4, 8);
      });
    }
    function tick2() {
      target = new Uint8Array(cols * rows);
      const t = step;
      if (view === "number") {
        drawNumber();
        step++;
        return;
      }
      if (mode === "roam") {
        const index = Math.floor(t / SEASON_STEPS) % 4, into = t % SEASON_STEPS;
        if (index !== seasonIndex) {
          seasonIndex = index;
          canvas.dataset.season = SEASONS[index].id;
          onSeason?.(SEASONS[index]);
        }
        const wipe = into < 16 ? into / 16 * cols : cols + 1;
        drawSeason(SEASONS[index].id, t, (x) => x < wipe);
        if (wipe <= cols) {
          drawSeason(SEASONS[(index + 3) % 4].id, t, (x) => x >= wipe);
          for (let y = 0; y < rows; y++) put(wipe, y, 1);
        }
        if (SEASONS[index].id === "summer" && lightning <= 0 && rnd() < 4e-3) lightning = 3;
      } else if (t % 80 >= 70 && t % 80 < 76) {
        put(cols / 2 - 7, 4, C.sun);
        put(cols / 2 + 6, 6, C.sun);
      }
      const head = drawEgg(t);
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
      const w = cols * dot, h = rows * dot, size = mode === "stage" ? dot : dot - (dot > 2 ? 1 : 0);
      ctx.clearRect(0, 0, w, h);
      const flash = lightning > 0;
      if (flash) lightning--;
      for (let i = 0; i < glow.length; i++) {
        const code = target[i], want = SHADE[code];
        if (code) tint[i] = code;
        glow[i] = code ? want : glow[i] * 0.52;
        const x = i % cols * dot, y = Math.floor(i / cols) * dot;
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
        tick2();
        acc -= 50;
        changed = true;
      }
      if (changed) render();
      raf = requestAnimationFrame(frame);
    }
    function start() {
      if (running || reduced2) return;
      running = true;
      last = 0;
      raf = requestAnimationFrame(frame);
    }
    function stop() {
      running = false;
      cancelAnimationFrame(raf);
    }
    function redraw() {
      tick2();
      if (reduced2) glow.fill(0);
      render();
    }
    const visibility = () => document.hidden ? stop() : start();
    const resize = () => {
      fit();
      render();
    };
    document.addEventListener("visibilitychange", visibility);
    window.addEventListener("resize", resize);
    fit();
    canvas.dataset.motion = reduced2 ? "static" : "live";
    if (reduced2) {
      step = mode === "roam" ? 40 : 0;
      tick2();
      glow.fill(0);
      render();
    } else {
      tick2();
      render();
      start();
    }
    return {
      // 戳一下：跳高 → 原地转一圈 → 左右扭 → 连弹两下，依次轮换
      poke() {
        if (reduced2) return;
        const types = [
          ["hop", 18],
          ["spin", 20],
          ["wiggle", 18],
          ["bounce", 22]
        ];
        const [type, len] = types[pokes++ % types.length];
        action = { type, k: 0, len };
      },
      catchData() {
        if (!reduced2) catching = { k: 0 };
      },
      // 首页暴龙机 A 键：在数码蛋与待处理条数之间切换
      showNumber(n) {
        view = "number";
        number = n;
        canvas.dataset.view = "number";
        redraw();
      },
      showEgg() {
        view = "egg";
        canvas.dataset.view = "egg";
        redraw();
      },
      get running() {
        return running;
      },
      destroy() {
        stop();
        document.removeEventListener("visibilitychange", visibility);
        window.removeEventListener("resize", resize);
      }
    };
  }

  // src/scan-motion.js
  var active = /* @__PURE__ */ new Set();
  var scans = /* @__PURE__ */ new Map();
  var priority = { hover: 0, read: 1, route: 2, panel: 3, success: 4 };
  var query;
  var lastTrigger = null;
  var routeAt = 0;
  var inputAt = -1;
  var SCAN_EASE = "cubic-bezier(.4,0,.6,1)";
  function reducedMotion() {
    try {
      return matchMedia("(prefers-reduced-motion: reduce)").matches;
    } catch {
      return true;
    }
  }
  function trackDecoration(cancel) {
    try {
      if (!query) {
        query = matchMedia("(prefers-reduced-motion: reduce)");
        query.addEventListener("change", () => {
          if (query.matches) for (const stop of [...active]) {
            try {
              stop();
            } catch {
            }
          }
        });
      }
    } catch {
    }
    active.add(cancel);
    return () => active.delete(cancel);
  }
  function noteInput() {
    inputAt = performance.now();
  }
  function motionOrigin() {
    try {
      return lastTrigger?.isConnected ? lastTrigger : document.activeElement;
    } catch {
      return null;
    }
  }
  function visible(rect) {
    return rect?.width > 0 && rect.height > 0 && rect.bottom > 0 && rect.top < innerHeight && rect.right > 0 && rect.left < innerWidth;
  }
  function overlaps(a, b) {
    return Math.max(0, a.left, b.left) < Math.min(innerWidth, a.right, b.right) && Math.max(0, a.top, b.top) < Math.min(innerHeight, a.bottom, b.bottom);
  }
  function scanReveal(target, { duration = 440, delay = 0, kind = "route", reveal = true, success = false } = {}) {
    let overlay, release, animations = [], finished = false;
    const stop = () => {
      if (finished) return;
      finished = true;
      animations.forEach((a) => {
        try {
          a.cancel();
        } catch {
        }
      });
      overlay?.remove();
      release?.();
      if (scans.get(target)?.stop === stop) scans.delete(target);
    };
    try {
      if (!target?.isConnected || reducedMotion() || typeof target.animate !== "function") return stop;
      if (kind === "read" && inputAt < routeAt) return stop;
      const rect = target.getBoundingClientRect();
      if (!visible(rect)) return stop;
      for (const [el, scan] of scans) if (!el.isConnected) scan.stop();
      const related = [...scans].filter(([el, scan]) => el === target || el.contains?.(target) || target.contains?.(el) || overlaps(rect, scan.rect));
      if (related.some(([el, scan]) => priority[scan.kind] > priority[kind] || scan.kind === kind && el.contains?.(target) && (el !== target || kind === "read"))) return stop;
      for (const [, scan] of related) scan.stop();
      overlay = document.createElement("div");
      overlay.className = "scan-surface" + (kind === "hover" ? " scan-hover" : "") + (success ? " scan-success" : "");
      overlay.dataset.scanKind = kind;
      overlay.setAttribute("aria-hidden", "true");
      const h = kind === "route" ? innerHeight - rect.top : Math.min(rect.height, innerHeight - rect.top);
      Object.assign(overlay.style, { left: rect.left + "px", top: rect.top + "px", width: rect.width + "px", height: h + "px", borderRadius: getComputedStyle(target).borderRadius });
      const tail = document.createElement("i"), line = document.createElement("i");
      tail.className = "scan-tail";
      line.className = "scan-line";
      overlay.append(tail, line);
      document.body.append(overlay);
      const options = { duration, delay, easing: SCAN_EASE, fill: "backwards" };
      if (reveal) animations.push(target.animate([{ clipPath: "polygon(0 0,100% 0,100% 0px,0 0px)" }, { clipPath: `polygon(0 0,100% 0,100% ${h}px,0 ${h}px)` }], options));
      for (const node of [tail, line]) animations.push(node.animate([{ transform: "translateY(0)" }, { transform: `translateY(${h}px)` }], options));
      scans.set(target, { stop, kind, rect });
      release = trackDecoration(stop);
      Promise.all(animations.map((a) => a.finished)).then(stop, stop);
    } catch {
      stop();
    }
    return stop;
  }
  function installScreenMotion() {
    const selector = ".cover.lcd,.m-screen,.m-screen-2,.rec .art,[data-partner-screen]", hovered = /* @__PURE__ */ new WeakSet();
    const remember = (e) => {
      noteInput();
      lastTrigger = e.target?.closest?.('button,a,[role="button"],[tabindex]') || e.target;
    };
    const enter = (e) => {
      const el = e.target?.closest?.(selector);
      if (!el || el.contains(e.relatedTarget) || hovered.has(el)) return;
      hovered.add(el);
      scanReveal(el, { duration: 520, delay: 60, kind: "hover", reveal: false });
    };
    const leave = (e) => {
      const el = e.target?.closest?.(selector);
      if (el && !el.contains(e.relatedTarget)) hovered.delete(el);
    };
    document.addEventListener("pointerdown", remember, true);
    document.addEventListener("keydown", remember, true);
    document.addEventListener("pointerover", enter);
    document.addEventListener("pointerout", leave);
    return () => {
      document.removeEventListener("pointerdown", remember, true);
      document.removeEventListener("keydown", remember, true);
      document.removeEventListener("pointerover", enter);
      document.removeEventListener("pointerout", leave);
      for (const stop of [...active]) stop();
      lastTrigger = null;
    };
  }

  // src/data-flight.js
  var DATA_CAUGHT = "guiji:data-caught";
  function flyData(from = motionOrigin()) {
    const bits = [], animations = [];
    let done = false, release;
    const caught = () => {
      try {
        window.dispatchEvent(new CustomEvent(DATA_CAUGHT));
        scanReveal(document.querySelector("[data-partner-screen]"), {
          duration: 260,
          kind: "success",
          reveal: false,
          success: true
        });
      } catch {
      }
    };
    const stop = () => {
      if (done) return;
      done = true;
      for (const animation of animations) {
        try {
          animation.cancel();
        } catch {
        }
      }
      bits.forEach((bit) => bit.remove());
      release?.();
      caught();
    };
    try {
      const a = from?.getBoundingClientRect?.();
      const b = document.querySelector("[data-partner-screen]")?.getBoundingClientRect();
      const visible2 = (r) => r?.width && r.right > 0 && r.left < innerWidth && r.bottom > 0 && r.top < innerHeight;
      if (reducedMotion() || !visible2(a) || !visible2(b) || typeof document.body.animate !== "function") {
        stop();
        return;
      }
      release = trackDecoration(stop);
      for (let i = 0; i < 6; i++) {
        const bit = document.createElement("i");
        bit.className = `data-bit${i % 2 ? " alt" : ""}`;
        bit.setAttribute("aria-hidden", "true");
        document.body.append(bit);
        bits.push(bit);
        const x0 = a.left + a.width / 2 + (i - 3) * 6, y0 = a.top + 8;
        const x1 = b.left + b.width / 2, y1 = b.top + 6;
        const mx = (x0 + x1) / 2 + (i - 3) * 14, my = Math.min(y0, y1) - 80 - i * 6;
        animations.push(bit.animate([
          { transform: `translate(${x0}px, ${y0}px) scale(1)` },
          { transform: `translate(${mx}px, ${my}px) scale(1.3)`, offset: 0.45 },
          { transform: `translate(${x1}px, ${y1}px) scale(.6)` }
        ], { duration: 620 + i * 45, delay: i * 35, easing: "cubic-bezier(.3,.1,.3,1)" }));
      }
      Promise.all(animations.map((animation) => animation.finished)).then(stop, stop);
    } catch {
      stop();
    }
  }

  // docs/design/ui-v18/build/partner-mount.js
  var roamDot = (height) => height >= 80 ? 4 : 3;
  var reduced = () => {
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
        ...mode === "roam" ? { dot: roamDot(box.clientHeight) } : { cols: 14, rows: 15 },
        onSeason: (season) => {
          canvas.closest(".partner-screen")?.setAttribute("data-season", season.id);
          const label = document.querySelector("[data-season-label]");
          if (label && mode === "roam") label.textContent = `${season.label} \xB7 \u6570\u7801\u86CB`;
        }
      });
      canvas.__lcd = lcd;
      addEventListener(DATA_CAUGHT, () => lcd.catchData());
    }
  }
  if (document.readyState === "loading") addEventListener("DOMContentLoaded", mount);
  else mount();

  // docs/design/ui-v18/build/lcd-digits.js
  var GLYPHS = {
    0: "01110100011001110101110011000101110",
    1: "00100011000010000100001000010001110",
    2: "01110100010000100010001000100011111",
    3: "11111000100010000010000011000101110",
    4: "00010001100101010010111110001000010",
    5: "11111100001111000001000011000101110",
    6: "00110010001000011110100011000101110",
    7: "11111000010001000100010000100001000",
    8: "01110100011000101110100011000101110",
    9: "01110100011000101111000010001001100",
    ":": "00000011000110000000011000110000000"
  };
  var DOT = 0.75;
  function digitDots(ch, y0 = 0) {
    let out = "";
    const g = GLYPHS[ch];
    for (let y = 0; y < 7; y++)
      for (let x = 0; x < 5; x++) if (g[y * 5 + x] === "1") out += `<rect x="${x}" y="${y + y0}" width="${DOT}" height="${DOT}"/>`;
    return out;
  }
  function rollTo(svg, text, { at = 0, reduced: reduced2 = false, label } = {}) {
    if (label) svg.setAttribute("aria-label", label);
    const reels = [...svg.querySelectorAll(".reel")];
    let k = 0;
    for (let i = reels.length - 1; i >= 0; i--) {
      const reel = reels[i], from = reel.dataset.d, to = text[i];
      reel.getAnimations().forEach((x) => x.cancel());
      reel.dataset.d = to;
      if (from === to || reduced2) {
        reel.innerHTML = digitDots(to);
        reel.style.transform = "";
        continue;
      }
      reel.innerHTML = digitDots(from) + digitDots(to, 8);
      reel.style.transform = "translateY(-8px)";
      reel.animate([{ transform: "translateY(0)" }, { transform: "translateY(-8px)" }], {
        duration: 240 + k * 90,
        delay: at,
        easing: "steps(8, end)",
        fill: "backwards"
      });
      k++;
    }
  }

  // docs/design/ui-v18/build/card-motion.js
  var STAGES = ["\u5E7C\u5E74\u671F", "\u6210\u957F\u671F", "\u6210\u719F\u671F", "\u5B8C\u5168\u4F53", "\u7A76\u6781\u4F53"];
  var STEP = { easing: "steps(1, end)" };
  var HOP = [[0, 4], [80, -8], [160, -12], [300, -4], [380, 0]];
  var HOP_MS = 460;
  var ROLL_AT = 120;
  var EVOLVE_AT = 480;
  var CELL_OFF = "rgba(140, 178, 255, 0.15)";
  var hopFrames = (extra = {}) => [
    ...HOP.map(([t, y]) => ({ offset: t / HOP_MS, transform: `translateY(${y}px)`, ...STEP, ...extra })),
    { offset: 1, transform: "translateY(0)", ...extra }
  ];
  function hop(scr) {
    scr.querySelectorAll(".b-ghost").forEach((n) => n.remove());
    const icon = scr.querySelector(".b-icon");
    if (!icon) {
      scr.animate([{ filter: "brightness(1.25)", ...STEP }, { offset: 0.5, filter: "none", ...STEP }, { filter: "none" }], { duration: 240 });
      return;
    }
    [[70, 0.32], [140, 0.14]].forEach(([delay, opacity]) => {
      const ghost = icon.cloneNode(true);
      ghost.className = "b-icon b-ghost";
      icon.before(ghost);
      ghost.animate(hopFrames({ opacity }), { duration: HOP_MS, delay });
    });
    icon.animate(hopFrames(), { duration: HOP_MS });
  }
  function evolve(card, scr, to, reduced2) {
    const cell = card.querySelectorAll(".stage-cells i")[to];
    cell.classList.add("on");
    const name = card.querySelector("[data-stage-name]");
    name.innerHTML = `<span class="was">${STAGES[to - 1]}</span><span class="now">${STAGES[to]}</span>`;
    card.dataset.stage = to;
    if (reduced2) return;
    const target = scr.querySelector(".b-icon:not(.b-ghost), .b-cover");
    const lit = getComputedStyle(target).filter;
    const white = "brightness(0) invert(1) drop-shadow(0 0 4px #fff)";
    target.animate([{ filter: white, ...STEP }, { offset: 1 / 3, filter: lit, ...STEP }, { offset: 2 / 3, filter: white, ...STEP }, { filter: lit }], { duration: 240, delay: EVOLVE_AT });
    const sweep = document.createElement("i");
    sweep.className = "b-sweep";
    sweep.setAttribute("aria-hidden", "true");
    scr.append(sweep);
    const w = scr.clientWidth;
    sweep.animate([{ transform: "translateX(0)", opacity: 1 }, { transform: `translateX(${w + 40}px)`, opacity: 1 }], {
      duration: 480,
      delay: EVOLVE_AT + 260,
      easing: `steps(${Math.round((w + 40) / 8)}, end)`
    });
    const at = EVOLVE_AT + 740, total = at + 550;
    cell.animate([
      { offset: 0, background: CELL_OFF, boxShadow: "none", transform: "scaleY(1)", ...STEP },
      { offset: at / total, background: "#fff", boxShadow: "0 0 8px #fff", transform: "scaleY(0.2)" },
      { offset: (at + 330) / total, transform: "scaleY(1.6)" },
      { offset: 1, background: "#ff8a24", boxShadow: "0 0 5px rgba(255, 138, 36, 0.55)", transform: "scaleY(1)" }
    ], { duration: total });
    name.querySelector(".was").animate([{ visibility: "visible" }, { visibility: "visible" }], { duration: at });
    name.querySelector(".now").animate([
      { offset: 0, visibility: "hidden", ...STEP },
      { offset: at / (at + 160), visibility: "visible", ...STEP },
      { offset: (at + 80) / (at + 160), visibility: "hidden", ...STEP },
      { offset: 1, visibility: "visible" }
    ], { duration: at + 160 });
  }
  function flashButton(btn, ms) {
    const lbl = btn.querySelector(".lbl"), done = btn.querySelector(".done");
    if (!lbl || !done) return;
    [lbl, done].forEach((n) => n.getAnimations().forEach((x) => x.cancel()));
    lbl.animate([{ visibility: "hidden" }, { visibility: "hidden" }], { duration: ms });
    done.animate([{ visibility: "visible" }, { visibility: "visible" }], { duration: ms });
  }
  function copyFeedback(card, btn) {
    const reduced2 = reducedMotion();
    const scr = card.querySelector(".b-scr");
    const uses = Number(card.dataset.uses), stage2 = Number(card.dataset.stage);
    const evolveTo = stage2 === 1 && uses === 0 ? 2 : null;
    card.dataset.uses = uses + 1;
    flashButton(btn, evolveTo ? 2e3 : 1600);
    const entry = btn.dataset.entry != null && btn.querySelector("small");
    if (entry) entry.textContent = `\xD7${Number(entry.textContent.slice(1)) + 1}`;
    if (!reduced2) hop(scr);
    rollTo(card.querySelector(".lcd-count"), String(uses + 1).padStart(2, "0"), { at: ROLL_AT, reduced: reduced2, label: `\u51FA\u6218 ${uses + 1} \u6B21` });
    if (evolveTo) evolve(card, scr, evolveTo, reduced2);
    flyData(btn);
  }
  document.addEventListener("click", (e) => {
    const btn = e.target.closest?.("[data-copy]");
    if (btn) copyFeedback(btn.closest("[data-card]"), btn);
  });
  installScreenMotion();

  // docs/design/ui-v18/build/hub-motion.js
  var NS = "http://www.w3.org/2000/svg";
  var STEP2 = { easing: "steps(1, end)" };
  var FRAME = 16;
  var ORANGE = "#ff8a24";
  var CYAN = "#4de3ff";
  var pad2 = (n) => String(n).padStart(2, "0");
  var stage = () => document.querySelector('canvas[data-partner="stage"]')?.__lcd;
  function stream(name, { at = 0, reverse = false, color }) {
    const svg = document.querySelector(".b-traces");
    const path = svg?.querySelector(`[data-trace="${name}"]`);
    if (!path || getComputedStyle(svg).display === "none" || reducedMotion()) return 0;
    const L = path.getTotalLength(), pts = [];
    for (let l = 0; l < L; l += 8) pts.push(path.getPointAtLength(l));
    pts.push(path.getPointAtLength(L));
    if (reverse) pts.reverse();
    const travel = pts.length * FRAME;
    const frames = pts.map((p, i) => ({ offset: i / (pts.length - 1), transform: `translate(${p.x}px, ${p.y}px)`, opacity: 1, ...STEP2 }));
    for (let i = 0; i < 4; i++) {
      const size = i < 2 ? 5 : 3;
      const bit = document.createElementNS(NS, "rect");
      bit.setAttribute("class", "tr-bit");
      Object.entries({ x: -size / 2, y: -size / 2, width: size, height: size, fill: i % 2 ? "#ffffff" : color }).forEach(([k, v]) => bit.setAttribute(k, v));
      svg.append(bit);
      bit.animate(frames, { duration: travel, delay: at + i * 3 * FRAME }).finished.then(() => bit.remove(), () => {
      });
    }
    const lit = { stroke: color, filter: `drop-shadow(0 0 4px ${color})` };
    path.animate([{ ...lit, ...STEP2 }, lit], { duration: travel + 9 * FRAME + 160, delay: at });
    return travel + 9 * FRAME;
  }
  function flashKey(key, at) {
    if (reducedMotion()) return;
    document.querySelector(`.b-dvkey.${key}`)?.animate(
      [{ color: "#fff", textShadow: "0 0 8px #fff", ...STEP2 }, { offset: 0.5, color: CYAN, textShadow: "none", ...STEP2 }, { offset: 0.75, color: "#fff", textShadow: "0 0 8px #fff", ...STEP2 }, { color: CYAN }],
      { duration: 240, delay: at }
    );
  }
  function bumpInbox(slot, at, reduced2) {
    const chip = slot.querySelector(".b-inbox"), n = Number(chip.dataset.inbox) + 1;
    chip.dataset.inbox = n;
    chip.classList.add("hot");
    chip.querySelector("span").innerHTML = `<i class="was">${n - 1}</i><i class="now">${n}</i>`;
    if (reduced2) return;
    const total = at + 360;
    chip.animate([
      { offset: 0, background: "rgba(140, 178, 255, 0.07)", color: "#b4bfda", ...STEP2 },
      { offset: at / total, background: ORANGE, color: "#1f0f00", ...STEP2 },
      { offset: (at + 120) / total, background: "rgba(255, 138, 36, 0.14)", color: "#ffb35c", ...STEP2 },
      { offset: (at + 240) / total, background: ORANGE, color: "#1f0f00", ...STEP2 },
      { offset: 1, background: "rgba(255, 138, 36, 0.14)", color: "#ffb35c" }
    ], { duration: total });
    chip.querySelector(".was").animate([{ visibility: "visible" }, { visibility: "visible" }], { duration: at });
    chip.querySelector(".now").animate([{ visibility: "hidden" }, { visibility: "hidden" }], { duration: at });
    ringFlash(slot, at + 120, CYAN);
  }
  function ringFlash(el, at, color) {
    const on = { boxShadow: `inset 0 0 0 1px ${color}, 0 0 16px -4px ${color}` };
    el.animate([{ ...on, ...STEP2 }, { offset: 0.34, boxShadow: "none", ...STEP2 }, { offset: 0.67, ...on, ...STEP2 }, { boxShadow: "none" }], { duration: 240, delay: at });
  }
  function handleEgg(btn) {
    const reduced2 = reducedMotion();
    const li = btn.closest("li"), port = li.closest(".b-port-a"), kind = btn.dataset.act;
    if (li.dataset.gone) return;
    li.dataset.gone = "1";
    const spare = port.querySelector("li.b-spare");
    const h = li.offsetHeight;
    li.style.overflow = "hidden";
    const leave = [0, 1, 2, 3].map((k) => ({ offset: k * 60 / 400, opacity: 1 - k / 4, transform: `translateX(${k * 4}px)`, height: `${h}px`, ...STEP2 }));
    const fold = [0, 1, 2, 3].map((k) => ({ offset: (240 + k * 40) / 400, opacity: 0, transform: "translateX(16px)", height: `${Math.round(h * (4 - k) / 4)}px`, minHeight: "0px", paddingTop: "0px", paddingBottom: "0px", ...STEP2 }));
    if (reduced2) li.hidden = true;
    else li.animate([...leave, ...fold, { offset: 1, opacity: 0, height: "0px", minHeight: "0px", paddingTop: "0px", paddingBottom: "0px" }], { duration: 400, fill: "forwards" });
    if (spare) {
      spare.classList.remove("b-spare");
      const sh = spare.offsetHeight;
      if (!reduced2)
        spare.animate([
          { height: "0px", minHeight: "0px", opacity: 0, overflow: "hidden", ...STEP2 },
          { offset: 0.5, height: `${sh / 2}px`, minHeight: "0px", opacity: 0.5, overflow: "hidden", ...STEP2 },
          { height: `${sh}px`, minHeight: "0px", opacity: 1, overflow: "hidden" }
        ], { duration: 160, delay: 400, fill: "backwards" });
    }
    const count = port.querySelector(".b-big .lcd-count");
    const n = Number([...count.querySelectorAll(".reel")].map((r) => r.dataset.d).join("")) - 1;
    rollTo(count, pad2(n), { at: 160, reduced: reduced2, label: `\u5F85\u5B75\u5316 ${n}` });
    document.querySelectorAll("[data-egg-count]").forEach((el) => el.textContent = n);
    const ta = stream("a", { at: 120, color: ORANGE });
    const arrive = 120 + ta;
    flashKey("a", arrive);
    setTimeout(() => stage()?.catchData(), arrive);
    if (kind !== "deliver") return { arrive };
    const out = arrive + 360;
    flashKey("b", out);
    const tb = stream("b", { at: out, reverse: true, color: CYAN });
    bumpInbox(document.querySelector('[data-slot="01"]'), out + tb, reduced2);
    return { arrive, out, land: out + tb };
  }
  function resumeSlot(btn) {
    const slot = btn.closest("[data-slot]");
    stage()?.poke();
    flashKey("b", 160);
    const tb = stream("b", { at: 160, reverse: true, color: CYAN });
    if (!reducedMotion()) ringFlash(slot, 160 + tb, CYAN);
  }
  function copyLoadout(chip) {
    const n = Number(chip.dataset.loadout) + 1;
    chip.dataset.loadout = n;
    chip.querySelector("b").textContent = `\xD7${n}`;
    if (!reducedMotion()) ringFlash(chip, 0, getComputedStyle(chip).getPropertyValue("--tc").trim() || CYAN);
    flyData(chip);
  }
  var clock = null;
  function tick() {
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
  if (document.querySelector(".b-clock")) setInterval(tick, 6e4);
  window.__hub = { tick, handleEgg };

  // docs/design/ui-v18/build/design-preview.js
  var WRAP = {
    agent: {
      label: "\u7F16\u7A0B Agent \u505A\u754C\u9762",
      head: "\u8BF7\u6309\u4EE5\u4E0B\u8BBE\u8BA1\u89C4\u8303\u5B9E\u73B0\u754C\u9762\uFF1A\u98CE\u683C\u5E95\u5EA7\u5168\u7A0B\u9075\u5B88\uFF0C\u62DB\u5F0F\u53EA\u7528\u5728\u5408\u9002\u7684\u4F4D\u7F6E\uFF0C\u4E0D\u8981\u4E3A\u4E86\u7528\u800C\u7528\u3002",
      tail: "\u5B8C\u6210\u540E\u7ED9\u6211\u6BCF\u4E2A\u6539\u52A8\u9875\u9762\u7684\u622A\u56FE\u6838\u5BF9\u3002"
    },
    image: {
      label: "ChatGPT \u751F\u56FE",
      head: "\u8BF7\u4F7F\u7528 ChatGPT \u9ED8\u8BA4\u7684\u751F\u56FE\u80FD\u529B\uFF0C\u6309\u4EE5\u4E0B\u8981\u6C42\u76F4\u63A5\u751F\u6210\u56FE\u7247\u3002",
      tail: "\u8BF7\u4EA4\u4ED8\u751F\u6210\u7684\u56FE\u7247\u3002\u82E5\u5F53\u524D\u5BF9\u8BDD\u65E0\u6CD5\u751F\u6210\u56FE\u7247\uFF0C\u8BF7\u5982\u5B9E\u8BF4\u660E\u3002"
    }
  };
  function previewLines({ base, moves }, checked, target) {
    const w = WRAP[target];
    return [
      { key: "head", text: w.head, wrap: true },
      { key: "base-h", text: "\u3010\u98CE\u683C\u5E95\u5EA7\u3011", label: true },
      ...base.map((b, i) => ({ key: `base-${i}`, text: `${i + 1}. ${b}` })),
      { key: "moves-h", text: "\u3010\u62DB\u5F0F\u3011", label: true },
      ...moves.flatMap((m, i) => checked[i] ? [{ key: `move-${i}`, text: `\xB7 ${m.name}\uFF1A${m.prompt}` }] : []),
      { key: "tail", text: w.tail, wrap: true }
    ];
  }
  function previewMeta(lines, target) {
    const chars = lines.reduce((n, l) => n + l.text.length, 0);
    return `${WRAP[target].label}\u7248 \xB7 ${chars} \u5B57`;
  }

  // docs/design/ui-v18/build/drawer-motion.js
  var STEP3 = { easing: "steps(1, end)" };
  var FLASH = "rgba(255, 143, 184, 0.24)";
  var drawer = document.querySelector("[data-drawer]");
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
    const reduced2 = reducedMotion();
    const { data, checked, target } = state();
    const i = Number(box.dataset.move), key = `move-${i}`;
    const lines = previewLines(data, checked, target);
    const preview = drawer.querySelector("[data-preview]");
    refreshMeta(lines, target, checked);
    if (!reduced2)
      box.nextElementSibling.animate(
        box.checked ? [{ clipPath: "inset(0 100% 0 0)", ...STEP3 }, { offset: 1 / 3, clipPath: "inset(0 55% 0 0)", ...STEP3 }, { offset: 2 / 3, clipPath: "inset(0 25% 0 0)", ...STEP3 }, { clipPath: "inset(0 0 0 0)" }] : [{ opacity: 0.4, ...STEP3 }, { opacity: 1 }],
        { duration: 120, pseudoElement: "::after" }
      );
    const old = preview.querySelector(`[data-line="${key}"]`);
    if (!box.checked) {
      if (!old) return;
      if (reduced2) return old.remove();
      const h2 = old.offsetHeight;
      old.style.overflow = "hidden";
      old.animate([0, 1, 2].map((k) => ({ offset: k / 3, height: `${Math.round(h2 * (3 - k) / 3)}px`, opacity: 1 - k / 3, ...STEP3 })).concat({ height: "0px", opacity: 0, marginTop: "0px" }), { duration: 120, fill: "forwards" }).finished.then(() => old.remove(), () => {
      });
      return;
    }
    const at = lines.findIndex((l) => l.key === key);
    const line = document.createElement("p");
    line.dataset.line = key;
    line.textContent = lines[at].text;
    preview.querySelector(`[data-line="${lines[at - 1].key}"]`).after(line);
    line.scrollIntoView({ block: "nearest" });
    if (reduced2) return;
    const h = line.offsetHeight;
    line.animate([
      { height: "0px", opacity: 0, overflow: "hidden", ...STEP3 },
      { offset: 0.2, height: `${Math.round(h / 3)}px`, opacity: 1, overflow: "hidden", background: FLASH, ...STEP3 },
      { offset: 0.4, height: `${Math.round(h * 2 / 3)}px`, overflow: "hidden", background: FLASH, ...STEP3 },
      { offset: 0.6, height: `${h}px`, background: "transparent", ...STEP3 },
      { offset: 0.8, height: `${h}px`, background: FLASH, ...STEP3 },
      { height: `${h}px`, background: "transparent" }
    ], { duration: 300 });
  }
  function switchTarget(btn) {
    const reduced2 = reducedMotion();
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
      if (reduced2) continue;
      const wipe = (from, to) => [0, 1, 2, 3].map((k) => ({ offset: k / 4, clipPath: `inset(0 ${from + (to - from) * k / 4}% 0 0)`, ...STEP3 })).concat({ clipPath: `inset(0 ${to}% 0 0)` });
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
})();
