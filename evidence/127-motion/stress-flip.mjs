// #129-P2-03 压力测试：100 张 Prompt 卡、6 个分类交替，开着动效每 60ms 切一次分类芯片、连切 30 次（每次都打断上一段换位），
// 记 CDP 的样式重算 / 布局次数与耗时、切换期间帧间隔。用法：node stress-flip.mjs <dist 目录> <标签>
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const { chromium } = require("/Users/nat/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright");
const [dist, label] = process.argv.slice(2);
process.env.WORKBENCH_TEST_STATIC_ROOT = dist;
const { fixture } = await import(process.env.HOME + "/Sandbox/2026-11-25-digiworld-motion/wt/tests/fixture.mjs");
const { seed, makeAsset } = await import(process.env.HOME + "/Sandbox/2026-11-25-digiworld-motion/wt/src/store.js");
const app = await fixture(); const state = seed();
const cats = ["think", "biz", "dev", "retro", "design", "ops"];
state.assets = Array.from({ length: 100 }, (_, i) => ({ ...makeAsset({ title: `压力卡 ${String(i).padStart(3, "0")}`, type: "Prompt", content: "合成内容" }), category: cats[i % 6] }));
await app.repository.write(state, { initialize: true });
const exe = process.env.HOME + "/Library/Caches/ms-playwright/chromium-1248/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing";
const b = await chromium.launch({ executablePath: exe, headless: true, args: ["--headless=new", "--ignore-gpu-blocklist", "--enable-gpu-rasterization", "--use-angle=metal"] });
const p = await (await b.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
const cdp = await p.context().newCDPSession(p); await cdp.send("Performance.enable");
await p.goto(app.url + "/#assets"); await p.locator(".asset-card").nth(99).waitFor(); await p.waitForTimeout(1500);
const chips = p.locator(".page-assets .ac2-chip");
const metric = async () => Object.fromEntries((await cdp.send("Performance.getMetrics")).metrics.filter(m => /RecalcStyleCount|RecalcStyleDuration|LayoutCount|LayoutDuration/.test(m.name)).map(m => [m.name, m.value]));
const m0 = await metric();
await p.evaluate(() => { window.__f = []; let l = performance.now(); const loop = t => { window.__f.push(t - l); l = t; if (!window.__stop) requestAnimationFrame(loop); }; requestAnimationFrame(loop); });
const order = [0, 1, 0, 2, 0, 3, 1, 4, 0, 5];
for (let i = 0; i < 30; i++) { await chips.nth(order[i % order.length]).dispatchEvent("click"); await p.waitForTimeout(60); }
await p.waitForTimeout(400);
const f = await p.evaluate(() => { window.__stop = 1; return window.__f.slice(1); });
const m1 = await metric();
const d = Object.fromEntries(Object.keys(m1).map(k => [k, +(m1[k] - m0[k]).toFixed(k.includes("Duration") ? 4 : 0)]));
f.sort((a, b) => a - b);
console.log(label, JSON.stringify({ ...d, frames: f.length, over25: f.filter(x => x > 25).length, p95: +f[Math.floor(f.length * .95)].toFixed(1), worst: +f[f.length - 1].toFixed(1) }));
await b.close(); await app.close();
