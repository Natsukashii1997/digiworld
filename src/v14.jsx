// UI v14e 公共层（docs/design/ui-v14/README.md）：液晶点阵字、一次局部反馈、Agent 形象、
// 背景微尘与全站手感（涟漪、微光、倾斜、阶梯浮现）。只管呈现，不碰业务数据。
// 系统“减少动态效果”时所有动画都停，且运行中切换也立即生效。
import React, { useEffect, useRef, useState } from "react";
import { Pixel, SPRITES } from "./pixel.jsx";
import { CHARACTERS, castOf } from "./characters.js";

const REDUCE = "(prefers-reduced-motion: reduce)";
export function prefersReduced() {
  try {
    return matchMedia(REDUCE).matches;
  } catch {
    return false;
  }
}
export function useReducedMotion() {
  const [reduced, setReduced] = useState(prefersReduced);
  useEffect(() => {
    let query;
    try {
      query = matchMedia(REDUCE);
    } catch {
      return;
    }
    const sync = () => setReduced(query.matches);
    query.addEventListener?.("change", sync);
    // 初次渲染与 effect 订阅之间可能已经切换偏好，不能依赖补发 change。
    sync();
    return () => query.removeEventListener?.("change", sync);
  }, []);
  return reduced;
}

// ---------- 5×7 液晶点阵字 ----------
const G = {
  0: "01110100011001110101110011000101110", 1: "00100011000010000100001000010001110", 2: "01110100010000100010001000100011111",
  3: "11111000100010000010000011000101110", 4: "00010001100101010010111110001000010", 5: "11111100001111000001000011000101110",
  6: "00110010001000011110100011000101110", 7: "11111000010001000100010000100001000", 8: "01110100011000101110100011000101110",
  9: "01110100011000101111000010001001100", " ": "00000000000000000000000000000000000", "-": "00000000000000011111000000000000000",
  A: "01110100011000111111100011000110001", B: "11110100011000111110100011000111110", C: "01110100011000010000100001000101110",
  D: "11100100101000110001100011001011100", E: "11111100001000011110100001000011111", F: "11111100001000011110100001000010000",
  G: "01110100011000010111100011000101111", H: "10001100011000111111100011000110001", I: "01110001000010000100001000010001110",
  J: "00111000100001000010000101001001100", K: "10001100101010011000101001001010001", L: "10000100001000010000100001000011111",
  M: "10001110111010110101100011000110001", N: "10001110011010110011100011000110001", O: "01110100011000110001100011000101110",
  P: "11110100011000111110100001000010000", Q: "01110100011000110001101011001001101", R: "11110100011000111110101001001010001",
  S: "01111100001000001110000010000111110", T: "11111001000010000100001000010000100", U: "10001100011000110001100011000101110",
  V: "10001100011000110001100010101000100", W: "10001100011000110101101011010101010", X: "10001100010101000100010101000110001",
  Y: "10001100010101000100001000010000100", Z: "11111000010001000100010001000011111", ".": "00000000000000000000000000110001100",
  "·": "00000000000000001100011000000000000", ":": "00000011000110000000011000110000000", "/": "00001000100001000100010000100010000",
  "+": "00000001000010011111001000010000000", "?": "01110100010000100010001000000000100", "!": "00100001000010000100001000000000100",
  "#": "01010010101111101010111110101001010", "%": "11000110010001000100010001001100011", "(": "00010001000100001000010000010000010",
  ")": "01000001000001000010000100010001000", "&": "01100100101010001000101011001001101",
};
// text：显示内容；px：每个点阵格的像素；pad：左侧补空格到固定字数；boot：开机式逐列扫亮。
export function LcdText({ text, px = 3, pad = 0, boot = false, label, className = "", style }) {
  const value = String(text ?? "").toUpperCase().padStart(pad, " ");
  const gap = px >= 5 ? 1 : px >= 3 ? 0.6 : 0.35;
  const w = Math.max(1, value.length * 6 - 1) * px,
    h = 7 * px;
  const on = [],
    off = [];
  [...value].forEach((ch, i) => {
    const g = G[ch] || G[" "];
    for (let y = 0; y < 7; y++)
      for (let x = 0; x < 5; x++) {
        const col = i * 6 + x;
        (g[y * 5 + x] === "1" ? on : off).push(
          <rect key={`${col}-${y}`} x={col * px} y={y * px} width={px - gap} height={px - gap} style={{ "--c": col }} />,
        );
      }
  });
  const named = label !== null;
  return (
    <span className={`lcd-num ${className}`} style={style}>
      <svg
        width={w}
        height={h}
        viewBox={`0 0 ${w} ${h}`}
        role={named ? "img" : undefined}
        aria-label={named ? label || String(text ?? "").trim() : undefined}
        aria-hidden={named ? undefined : "true"}
      >
        <g fill="currentColor" opacity=".1">
          {off}
        </g>
        <g className={boot ? "on" : undefined} fill="currentColor">
          {on}
        </g>
      </svg>
    </span>
  );
}
// 读数开机：从 0 跳到目标值（约 0.6s）；非数字、小于 4 或减少动态效果时直接显示。
// key 变化时重播（例如重新统计）。
export function useCountUp(target, key) {
  const reduced = useReducedMotion();
  const text = String(target ?? "");
  const counts = (value) => /^\d+$/.test(value) && Number(value) >= 4;
  // 首次挂载就从 0 开始，避免先闪一下终值。
  const [shown, setShown] = useState(() => (!prefersReduced() && counts(text) ? "0".padStart(text.length, "0") : text));
  useEffect(() => {
    const n = Number(text);
    if (reduced || !counts(text)) {
      setShown(text);
      return;
    }
    let k = 0;
    setShown("0".padStart(text.length, "0"));
    let timer = setTimeout(function tick() {
      k++;
      setShown(String(Math.round((n * k) / 9)));
      if (k < 9) timer = setTimeout(tick, 45);
    }, 260);
    return () => clearTimeout(timer);
  }, [text, key, reduced]);
  return reduced ? text : shown;
}
export function LcdCount({ value, run, ...rest }) {
  const shown = useCountUp(value, run);
  return <LcdText text={shown} label={String(value ?? "")} boot {...rest} />;
}

// ---------- 结果反馈：真实成功时液晶窗翻转一次 + 旁边出现一次“已更新” ----------
// 失败与未知不走这里，由页面用稳定提示显示。
export function useFlash() {
  const ref = useRef(null);
  const [count, setCount] = useState(0);
  const fire = () => {
    const el = ref.current;
    // 减少动态效果时只出现静态的“已更新”，不加翻转类（免得之后关掉偏好时补播一次）。
    if (el && !prefersReduced()) {
      el.classList.remove("flash");
      void el.offsetWidth;
      el.classList.add("flash");
    }
    setCount((n) => n + 1);
  };
  const reset = () => setCount(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const done = (e) => e.animationName === "v14-flash" && el.classList.remove("flash");
    el.addEventListener("animationend", done);
    return () => el.removeEventListener("animationend", done);
  });
  return { ref, count, fire, reset };
}
export function ResultChip({ flash, children }) {
  if (!flash.count) return null;
  return (
    <span key={flash.count} className="v14-result" role="status">
      ✓ {children}
    </span>
  );
}

// ---------- 掌机外壳、像素角标 ----------
export function Corners() {
  return (
    <>
      <span className="corner tl" aria-hidden="true" />
      <span className="corner tr" aria-hidden="true" />
      <span className="corner bl" aria-hidden="true" />
      <span className="corner br" aria-hidden="true" />
    </>
  );
}
export function DeviceShell({ plate, className = "", children, ...rest }) {
  return (
    <div className={`v14-shell ${className}`} {...rest}>
      <span className="screw tl" aria-hidden="true" />
      <span className="screw tr" aria-hidden="true" />
      <span className="screw bl" aria-hidden="true" />
      <span className="screw br" aria-hidden="true" />
      {plate && (
        <span className="plate" aria-hidden="true">
          {plate}
        </span>
      )}
      <div className="v14-zscreen">{children}</div>
    </div>
  );
}

// ---------- Agent 形象：头像 = 头部裁切 1×，名册 = 全身 1×，档案 = 全身 3× ----------
function headCrop(rows) {
  const W = Math.max(...rows.map((r) => r.length)),
    H = rows.length,
    c = Math.min(40, W, H);
  if (W <= 40 && H <= 40) return [0, 0, W, H];
  let sx = 0,
    n = 0;
  for (let y = 0; y < c; y++)
    [...rows[y]].forEach((ch, x) => {
      if (ch !== ".") {
        sx += x;
        n++;
      }
    });
  return [Math.max(0, Math.min(W - c, Math.round(sx / Math.max(n, 1) - c / 2))), 0, c, c];
}
const LETTER = { head: 36, body: 60, dossier: 120 };
export function AgentSprite({ agent, mode = "head", className = "", fit }) {
  const cast = castOf(agent);
  const character = cast && CHARACTERS[cast.character];
  const art = character?.sprite && SPRITES[character.sprite];
  if (!art) {
    const size = LETTER[mode] || 36;
    return (
      <span
        className={`agent-letter ${className}`}
        aria-hidden="true"
        style={{ width: size, height: size, fontSize: Math.round(size / 3), color: cast ? `rgb(${cast.hue})` : "var(--muted)" }}
      >
        {cast?.initials || String(agent || "?").slice(0, 2).toUpperCase()}
      </span>
    );
  }
  const crop = mode === "head" ? character.head || headCrop(art.frames[0]) : undefined;
  return <Pixel sprite={character.sprite} crop={crop} scale={fit ? undefined : mode === "dossier" ? 3 : 1} fit={fit} className={`agent-sprite ${className}`} />;
}

// ---------- 背景数据微尘：46 颗像素慢慢上浮；减少动态效果或页面隐藏时不画 ----------
export function Motes() {
  const ref = useRef(null);
  const reduced = useReducedMotion();
  useEffect(() => {
    const canvas = ref.current;
    const g = canvas?.getContext?.("2d");
    if (!g) return;
    if (reduced) {
      g.clearRect(0, 0, canvas.width, canvas.height);
      return;
    }
    const colors = ["77,227,255", "255,138,36", "166,227,110"];
    const dots = Array.from({ length: 46 }, () => ({
      x: Math.random(),
      y: Math.random(),
      s: Math.random() < 0.3 ? 3 : 2,
      v: 0.00006 + Math.random() * 0.00014,
      p: Math.random() * 6.28,
      c: colors[Math.floor(Math.random() * 3)],
    }));
    let W = 0,
      H = 0,
      last = 0,
      raf = 0;
    const size = () => {
      W = canvas.width = innerWidth;
      H = canvas.height = innerHeight;
    };
    size();
    addEventListener("resize", size);
    const frame = (t) => {
      if (t - last > 33 && !document.hidden) {
        last = t;
        g.clearRect(0, 0, W, H);
        for (const d of dots) {
          d.y -= d.v * 16;
          if (d.y < -0.02) {
            d.y = 1.02;
            d.x = Math.random();
          }
          g.fillStyle = `rgba(${d.c},${0.12 + 0.14 * Math.sin(t / 900 + d.p)})`;
          g.fillRect(Math.round(d.x * W), Math.round(d.y * H), d.s, d.s);
        }
      }
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => {
      cancelAnimationFrame(raf);
      removeEventListener("resize", size);
      g.clearRect(0, 0, W, H);
    };
  }, [reduced]);
  return <canvas ref={ref} className="v14-motes" aria-hidden="true" />;
}

// ---------- 全站手感：按钮像素涟漪、卡片微光与倾斜、卡片阶梯浮现 ----------
// 只作用于 .v14 区域内；每次事件时读取偏好，运行中开启“减少动态效果”立即停止。
export function useV14Interactions(root, route) {
  useEffect(() => {
    const scope = (el) => el?.closest?.(".v14");
    const click = (e) => {
      const btn = e.target.closest?.(".button, .icon-button");
      if (!btn || !scope(btn) || prefersReduced() || btn.disabled) return;
      const r = btn.getBoundingClientRect();
      const i = document.createElement("i");
      i.className = "v14-ripple";
      i.setAttribute("aria-hidden", "true");
      i.style.left = `${e.clientX - r.left}px`;
      i.style.top = `${e.clientY - r.top}px`;
      btn.append(i);
      setTimeout(() => i.remove(), 500);
    };
    const move = (e) => {
      if (prefersReduced()) return;
      const s = e.target.closest?.(".sheen");
      if (s && scope(s)) {
        const r = s.getBoundingClientRect();
        s.style.setProperty("--mx", `${e.clientX - r.left}px`);
        s.style.setProperty("--my", `${e.clientY - r.top}px`);
      }
      const t = e.target.closest?.("[data-tilt]");
      if (t && scope(t)) {
        const r = t.getBoundingClientRect(),
          x = (e.clientX - r.left) / r.width - 0.5,
          y = (e.clientY - r.top) / r.height - 0.5;
        t.style.transform = `perspective(700px) rotateX(${-y * 5}deg) rotateY(${x * 5}deg) translateY(-3px)`;
      }
    };
    const leave = (e) => {
      const t = e.target.closest?.("[data-tilt]");
      if (t && !t.contains(e.relatedTarget)) t.style.transform = "";
    };
    document.addEventListener("click", click);
    document.addEventListener("pointermove", move);
    document.addEventListener("pointerout", leave);
    // 运行中开启减少动态效果：撤掉倾斜。
    let query;
    const calm = () => {
      if (query?.matches) document.querySelectorAll(".v14 [data-tilt]").forEach((t) => (t.style.transform = ""));
    };
    try {
      query = matchMedia(REDUCE);
      query.addEventListener?.("change", calm);
    } catch {}
    return () => {
      document.removeEventListener("click", click);
      document.removeEventListener("pointermove", move);
      document.removeEventListener("pointerout", leave);
      query?.removeEventListener?.("change", calm);
    };
  }, []);
  // 卡片进入视口时阶梯浮现；后续渲染出的卡片也会被观察到。换页时（主区重建）重新挂接。
  useEffect(() => {
    const host = root.current;
    if (!host || typeof IntersectionObserver === "undefined") return;
    const watched = new WeakSet();
    const io = new IntersectionObserver(
      (entries) =>
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add("in");
            io.unobserve(entry.target);
          }
        }),
      { threshold: 0, rootMargin: "0px 0px -6% 0px" },
    );
    const scan = () =>
      host.querySelectorAll(".reveal:not(.in)").forEach((el) => {
        if (watched.has(el)) return;
        watched.add(el);
        io.observe(el);
      });
    scan();
    const mo = new MutationObserver(scan);
    mo.observe(host, { childList: true, subtree: true });
    return () => {
      io.disconnect();
      mo.disconnect();
    };
  }, [route]);
}
