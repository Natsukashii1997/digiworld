// 探针 6：interaction-browser 第 38 行“按下 150ms 后位移 3px”的时序拆解。
// 在页面里记录 rAF 帧间隔，并在 mouse.down 之后每 ~10ms 采样 transform，给出 :active 过渡何时开始、何时到 3px。
// 用法：PLAYWRIGHT_MODULE=playwright node docs/agents/handoffs/cloud-env-diff-probes/probe-press-timing.mjs [轮数]
import { createRequire } from "node:module";
import { contextFixture } from "../../../../tests/context-fixture.mjs";
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || "playwright");
const rounds = Number(process.argv[2] || 5);
const app = await contextFixture();
const browser = await chromium.launch({ headless: true });
try {
  const page = await (await browser.newContext({ viewport: { width: 1440, height: 1000 } })).newPage();
  await page.goto(app.url + "/#assets");
  const create = page.getByRole("button", { name: "新建资产", exact: true });
  await create.waitFor();
  // 帧间隔：2 秒内 rAF 的回调间隔分布
  const frames = await page.evaluate(() => new Promise((resolve) => {
    const d = []; let last = performance.now(); const end = last + 2000;
    const tick = (t) => { d.push(t - last); last = t; if (t < end) requestAnimationFrame(tick); else resolve(d); };
    requestAnimationFrame(tick);
  }));
  frames.sort((a, b) => a - b);
  const pct = (p) => frames[Math.min(frames.length - 1, Math.floor(frames.length * p))].toFixed(1);
  console.log(`rAF 帧数(2s)=${frames.length} 间隔 p50=${pct(0.5)}ms p90=${pct(0.9)}ms max=${frames.at(-1).toFixed(1)}ms`);
  const results = [];
  for (let i = 0; i < rounds; i++) {
    const box = await create.boundingBox();
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.evaluate(() => {
      const el = [...document.querySelectorAll("button")].find((b) => b.textContent.trim() === "新建资产");
      window.__samples = []; const t0 = performance.now();
      const sample = () => { window.__samples.push([performance.now() - t0, getComputedStyle(el).transform]); if (performance.now() - t0 < 400) setTimeout(sample, 5); };
      sample();
    });
    const tDown = Date.now();
    await page.mouse.down();
    await page.waitForTimeout(150);
    const at150 = await create.evaluate((el) => getComputedStyle(el).transform);
    const wall = Date.now() - tDown;
    await page.waitForTimeout(300);
    const samples = await page.evaluate(() => window.__samples);
    await page.mouse.up();
    await page.keyboard.press("Escape");
    const y = (m) => (m === "none" ? 0 : Number(m.match(/matrix\(1, 0, 0, 1, 0, ([-\d.e]+)\)/)?.[1] ?? NaN));
    const firstMove = samples.find(([, m]) => y(m) > 0);
    const full = samples.find(([, m]) => y(m) >= 3);
    results.push({ round: i + 1, at150, wallMsToEvaluate: wall, firstMoveMs: firstMove?.[0]?.toFixed(0), reach3Ms: full?.[0]?.toFixed(0) });
    await page.waitForTimeout(300);
  }
  console.table(results);
  console.log("说明：firstMoveMs/reach3Ms 以页面内采样起点为 0（采样起点早于 mouse.down 一个 CDP 往返）。过渡时长 0.08s（src/interaction.css:11）。");
} finally {
  await browser.close();
  await app.close();
}
