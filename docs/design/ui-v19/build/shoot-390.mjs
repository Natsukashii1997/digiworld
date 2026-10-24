// 项目空间 4-1 · 390 截图：起只读预览服务，390×844 拍首屏、整页与操作分镜，查脚本错误与横向溢出。
// 用法（项目根目录）：node docs/design/ui-v19/build/shoot-390.mjs
import { join } from "node:path";
import { chromium } from "playwright";
import { serve } from "../../ui-v18/build/serve.mjs";

const out = join(import.meta.dirname, "../shots");
const server = await serve(0);
const url = `http://127.0.0.1:${server.address().port}/docs/design/ui-v19/${encodeURIComponent("项目空间-4-1-交接条.html")}`;
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true, timezoneId: "Asia/Shanghai" });
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
page.on("console", (m) => m.type() === "error" && errors.push(`console: ${m.text()}`));
const shot = (name, opts = {}) => page.screenshot({ path: join(out, `项目空间-4-1-交接条-390-${name}.png`), ...opts });
await page.goto(url);
await page.waitForTimeout(2200);
await shot("首屏");
await shot("整页", { fullPage: true });
const m = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth, h: document.documentElement.scrollHeight }));
if (m.sw > m.cw) errors.push(`横向溢出 ${m.sw}/${m.cw}`);
console.log(`页高 ${m.h}`);
await page.click('[data-pj-pick="hermes"]'); await page.click("[data-pj-give]"); await page.waitForTimeout(900); await shot("交出-900");
await page.click("[data-pj-pv]"); await page.waitForTimeout(300); await shot("口令全文");
await page.evaluate(() => scrollTo(0, 0)); await page.click('[data-pj-cart="wd"]'); await page.waitForTimeout(900); await shot("读不到-900");
await page.evaluate(() => scrollTo(0, document.querySelector(".sc-foot").getBoundingClientRect().top + scrollY - 70)); await page.waitForTimeout(200);
await page.click('[data-pj-cart="dw"]').catch(() => {}); await page.waitForTimeout(900);
await page.evaluate(() => scrollTo(0, document.querySelector(".sc-foot").getBoundingClientRect().top + scrollY - 70)); await page.waitForTimeout(200); await shot("活动与读数");
await page.evaluate(() => scrollTo(0, 0)); await page.click("[data-pj-navopen]"); await page.waitForTimeout(200); await shot("导航");
await browser.close();
server.close();
console.log(errors.length ? errors.join("\n") : "无脚本错误、无横向溢出");
