// 动效语言的 JS 一份（#127）：数值与 src/tokens.css 的 --t-* / --ease* 一致，
// 供 Web Animations 与 framer-motion 使用。改这里必须同时改 tokens.css（tests/motion-tokens.test.mjs 核对）。
export const T = { instant: 80, fast: 160, mid: 240, slow: 420 };
export const EASE = {
  out: "cubic-bezier(0.2, 0.8, 0.2, 1)",
  move: "cubic-bezier(0.4, 0, 0.2, 1)",
  in: "cubic-bezier(0.4, 0, 1, 1)",
  back: "cubic-bezier(0.34, 1.56, 0.64, 1)",
};
// framer-motion 用秒和贝塞尔数组。
export const FM = {
  fast: T.fast / 1000,
  mid: T.mid / 1000,
  slow: T.slow / 1000,
  out: [0.2, 0.8, 0.2, 1],
  move: [0.4, 0, 0.2, 1],
  in: [0.4, 0, 1, 1],
};

// 已定的专属时长（扫描线方案 A，2026-10-10 常浩定）：不并入四档，保持原值；改它们要先问常浩。
export const SCAN = { route: 440, panelFlight: 300, panelScan: 380, hover: 520, read: 420, ease: "cubic-bezier(.4,0,.6,1)" };
