// 动效性能测量：每个路由切换、首页/资产滚动时记录长帧、掉帧与布局偏移（CLS）。
// 用法：node measure.mjs <url> <out.json>
import { createRequire } from "node:module";
import { writeFile } from "node:fs/promises";
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || "/Users/nat/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright");
const [url, out] = process.argv.slice(2);
const routes = ["home", "assets", "projects", "notes", "references", "learning", "agents", "rules", "settings"];
const browser = await chromium.launch({ headless: true, executablePath: process.env.PW_EXE, args: process.env.PW_GPU ? ["--headless=new", "--ignore-gpu-blocklist", "--enable-gpu-rasterization", "--use-angle=metal"] : [] });
const results = {};
for (const vp of [{ w: 1440, h: 900 }, { w: 1280, h: 800 }, { w: 2560, h: 1440 }]) {
  const ctx = await browser.newContext({ viewport: { width: vp.w, height: vp.h } });
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.addInitScript(() => {
    window.__m = { frames: [], cls: 0, shifts: [] };
    let last = performance.now();
    const loop = (t) => { window.__m.frames.push(t - last); last = t; requestAnimationFrame(loop); };
    requestAnimationFrame(loop);
    new PerformanceObserver((l) => { for (const e of l.getEntries()) if (!e.hadRecentInput) { window.__m.cls += e.value; window.__m.shifts.push({ v: +e.value.toFixed(4), src: e.sources?.map((s) => s.node?.className?.toString?.().slice(0, 60)) }); } }).observe({ type: "layout-shift", buffered: true });
  });
  await page.goto(url + "#home");
  await page.locator(".page-heading, .main-content").first().waitFor();
  await page.waitForTimeout(1500);
  const row = {};
  for (const r of routes) {
    await page.evaluate(() => { window.__m.frames = []; window.__m.cls = 0; window.__m.shifts = []; });
    const nav = page.locator(`.nav-item`).filter({ has: page.locator(`[href="#${r}"]`) });
    await page.evaluate((r) => { location.hash = r; }, r);
    await page.waitForTimeout(1200);
    // 滚动一屏半再回来
    await page.mouse.move(vp.w * 0.6, vp.h * 0.5);
    for (let i = 0; i < 6; i++) { await page.mouse.wheel(0, 300); await page.waitForTimeout(60); }
    for (let i = 0; i < 6; i++) { await page.mouse.wheel(0, -300); await page.waitForTimeout(60); }
    await page.waitForTimeout(400);
    const m = await page.evaluate(() => window.__m);
    const f = m.frames.slice(1);
    const long = f.filter((x) => x > 25).length, worst = Math.max(...f);
    const anims = await page.evaluate(() => document.getAnimations().filter(a => a.playState === "running").map(a => a.animationName || a.constructor.name).length);
    row[r] = { frames: f.length, over25ms: long, worstMs: +worst.toFixed(1), p95: +f.sort((a, b) => a - b)[Math.floor(f.length * 0.95)].toFixed(1), cls: +m.cls.toFixed(4), runningAnimationsAfter: anims, shifts: m.shifts.slice(0, 5) };
  }
  results[`${vp.w}x${vp.h}`] = { routes: row, errors };
  await ctx.close();
}
await browser.close();
await writeFile(out, JSON.stringify(results, null, 2));
for (const [vp, v] of Object.entries(results)) { console.log(vp, "errors", v.errors.length); for (const [r, x] of Object.entries(v.routes)) console.log(" ", r.padEnd(11), `long ${x.over25ms}/${x.frames}`, "worst", x.worstMs, "p95", x.p95, "cls", x.cls, "runAnim", x.runningAnimationsAfter); }
