// 设置 3-1 一行一控件 · 390 截图：390×844 拍首屏、整页与操作分镜，查脚本错误、非 GET 请求、横向溢出与小于 44px 的控件。
// 用法（项目根目录）：node docs/design/ui-v19/build/shoot-settings-390.mjs
import { join } from "node:path";
import { chromium } from "playwright";
import { serve } from "../../ui-v18/build/serve.mjs";

const out = join(import.meta.dirname, "../shots");
const server = await serve(0);
const url = `http://127.0.0.1:${server.address().port}/docs/design/ui-v19/${encodeURIComponent("设置-3-1-一行一控件.html")}`;
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true, timezoneId: "Asia/Shanghai" });
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
page.on("console", (m) => m.type() === "error" && errors.push(`console: ${m.text()}`));
page.on("request", (r) => { if (r.method() !== "GET") errors.push(`非 GET 请求：${r.method()} ${r.url()}`); });
const shot = (name, opts = {}) => page.screenshot({ path: join(out, `设置-3-1-一行一控件-390-${name}.png`), ...opts });
await page.goto(url);
await page.waitForTimeout(2400);
await shot("首屏");
await shot("整页", { fullPage: true });
const m = await page.evaluate(() => ({
  sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth, h: document.documentElement.scrollHeight,
  small: [...document.querySelectorAll("main button")].filter((b) => b.getClientRects().length).map((b) => b.getBoundingClientRect()).filter((r) => r.height < 44 || r.width < 44).length,
}));
if (m.sw > m.cw) errors.push(`横向溢出 ${m.sw}/${m.cw}`);
if (m.small) errors.push(`${m.small} 个控件小于 44px`);
console.log(`页高 ${m.h}`);
await page.click('[data-line="daemon"] [data-st-switch]'); await page.waitForTimeout(400); await shot("预览开启");
await page.click("[data-st-confirm]"); await page.waitForTimeout(900); await shot("开启后");
await page.click("[data-st-scan-sheet]"); await page.waitForTimeout(400); await shot("调整扫描");
await page.click("[data-st-sheet-done]"); await page.waitForTimeout(400);
await page.click("[data-st-navopen]"); await page.waitForTimeout(200); await shot("导航");
await browser.close();
server.close();
console.log(errors.length ? errors.join("\n") : "无脚本错误、无非 GET 请求、无横向溢出、控件都不小于 44px");
