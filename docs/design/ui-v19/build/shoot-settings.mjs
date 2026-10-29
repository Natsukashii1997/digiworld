// UI v19 · 设置三版的截图：1440 首屏、整页与关键分镜。node docs/design/ui-v19/build/shoot-settings.mjs
import { join } from "node:path";
import { chromium } from "playwright";
import { serve } from "../../ui-v18/build/serve.mjs";
const server = await serve(0);
const base = `http://127.0.0.1:${server.address().port}/docs/design/ui-v19/`;
const browser = await chromium.launch();
const out = (name) => join(import.meta.dirname, "../shots", `${name}.png`);
async function open(file, w = 1440, h = 900) {
  const page = await browser.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: 2, timezoneId: "Asia/Shanghai" });
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("request", (r) => { if (r.method() !== "GET") errors.push(`非 GET 请求：${r.method()} ${r.url()}`); });
  await page.goto(base + encodeURIComponent(file));
  return { page, errors };
}
const log = [];
const shot = async (page, name, full = false) => { await page.screenshot({ path: out(name), fullPage: full }); log.push(name); };

// 一 · 开关表
{
  const { page, errors } = await open("设置-1-开关表.html");
  await page.waitForTimeout(1200);
  await shot(page, "设置-1-开关表-1440");
  log.push(`  一 页高 ${await page.evaluate(() => document.documentElement.scrollHeight)} ${errors.join(" ") || "无脚本错误"}`);
  await page.close();
}
// 二 · 后盖面板
{
  const { page, errors } = await open("设置-2-后盖面板.html");
  await page.waitForTimeout(1200);
  await shot(page, "设置-2-后盖面板-1440");
  await shot(page, "设置-2-后盖面板-整页", true);
  await page.click('[data-st-switch="vault"]'); await page.waitForTimeout(400);
  await shot(page, "设置-2-后盖面板-预览开启");
  await page.click('[data-st-confirm="vault"]'); await page.waitForTimeout(260);
  await shot(page, "设置-2-后盖面板-拨过去");
  await page.waitForTimeout(800);
  await page.locator("#card").scrollIntoViewIfNeeded();
  await page.click("[data-st-download]"); await page.waitForTimeout(260);
  await shot(page, "设置-2-后盖面板-下载-扫描");
  await page.waitForTimeout(900);
  await shot(page, "设置-2-后盖面板-下载-完成");
  await page.click("[data-st-danger]"); await page.waitForTimeout(120);
  await shot(page, "设置-2-后盖面板-危险区-落下");
  await page.waitForTimeout(500);
  await page.locator("#danger").scrollIntoViewIfNeeded();
  await shot(page, "设置-2-后盖面板-危险区");
  log.push(`  二 页高 ${await page.evaluate(() => document.documentElement.scrollHeight)} ${errors.join(" ") || "无脚本错误"}`);
  await page.close();
}
// 三 · 开机自检
{
  const { page, errors } = await open("设置-3-开机自检.html");
  await page.waitForTimeout(700);
  await shot(page, "设置-3-开机自检-自检中");
  await page.waitForTimeout(1600);
  await shot(page, "设置-3-开机自检-1440");
  await page.click('[data-line="backup"] .pl-h'); await page.waitForTimeout(500);
  await shot(page, "设置-3-开机自检-展开备份");
  await page.click("[data-st-download]"); await page.waitForTimeout(1300);
  await page.locator(".post-foot").scrollIntoViewIfNeeded();
  await shot(page, "设置-3-开机自检-备份翻成勾");
  await page.click('[data-line="daemon"] .pl-h'); await page.waitForTimeout(400);
  await page.evaluate(() => scrollTo(0, 0));
  await shot(page, "设置-3-开机自检-展开常驻服务");
  log.push(`  三 页高 ${await page.evaluate(() => document.documentElement.scrollHeight)} ${errors.join(" ") || "无脚本错误"}`);
  await page.close();
}
// 对比页
{
  const { page } = await open("设置-三版对比.html");
  await page.waitForTimeout(1800);
  await shot(page, "设置-三版对比");
  await page.close();
}
console.log(log.join("\n"));
await browser.close(); server.close();
