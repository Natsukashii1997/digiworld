// UI v19 · 设置「三的三版简化」截图：1440 首屏与关键分镜。node docs/design/ui-v19/build/shoot-settings-lite.mjs
import { join } from "node:path";
import { chromium } from "playwright";
import { serve } from "../../ui-v18/build/serve.mjs";
const server = await serve(0);
const base = `http://127.0.0.1:${server.address().port}/docs/design/ui-v19/`;
const browser = await chromium.launch();
const log = [];
async function open(file) {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2, timezoneId: "Asia/Shanghai" });
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("request", (r) => { if (r.method() !== "GET") errors.push(`非 GET 请求：${r.method()} ${r.url()}`); });
  await page.goto(base + encodeURIComponent(file));
  await page.waitForTimeout(2400); // 自检约 1.7 秒跑完
  return { page, errors };
}
const shot = async (page, name) => { await page.screenshot({ path: join(import.meta.dirname, "../shots", `${name}.png`) }); log.push(name); };
const done = async (page, errors, tag) => { log.push(`  ${tag} 页高 ${await page.evaluate(() => document.documentElement.scrollHeight)} ${errors.join(" ") || "无脚本错误"}`); await page.close(); };

{ // 3-1 一行一控件
  const { page, errors } = await open("设置-3-1-一行一控件.html");
  await shot(page, "设置-3-1-一行一控件-1440");
  await page.click('[data-line="backup"] [data-st-download]'); await page.waitForTimeout(250);
  await shot(page, "设置-3-1-一行一控件-下载-打包");
  await page.waitForTimeout(900);
  await page.click('[data-line="daemon"] [data-st-ack]'); await page.waitForTimeout(400);
  await shot(page, "设置-3-1-一行一控件-翻成勾");
  await page.click('[data-st-scan-sheet]'); await page.waitForTimeout(400);
  await shot(page, "设置-3-1-一行一控件-调整扫描");
  await done(page, errors, "3-1");
}
{ // 3-2 简单展开
  const { page, errors } = await open("设置-3-2-简单展开.html");
  await shot(page, "设置-3-2-简单展开-1440");
  await page.click('[data-line="backup"] .pl-h'); await page.waitForTimeout(400);
  await shot(page, "设置-3-2-简单展开-展开备份");
  await page.click('[data-line="writes"] .pl-h'); await page.waitForTimeout(400);
  await shot(page, "设置-3-2-简单展开-展开写入");
  await page.click('[data-line="scan"] .pl-h'); await page.waitForTimeout(400);
  await shot(page, "设置-3-2-简单展开-展开扫描");
  await done(page, errors, "3-2");
}
{ // 3-3 右侧操作台
  const { page, errors } = await open("设置-3-3-右侧操作台.html");
  await shot(page, "设置-3-3-右侧操作台-1440");
  await page.click('[data-line="knowledge"] .pick'); await page.waitForTimeout(300);
  await shot(page, "设置-3-3-右侧操作台-选知识开放");
  await page.click('[data-st-dock] [data-st-switch]'); await page.waitForTimeout(400);
  await shot(page, "设置-3-3-右侧操作台-预览开启");
  await page.click("[data-st-confirm]"); await page.waitForTimeout(900);
  await shot(page, "设置-3-3-右侧操作台-开启后");
  await page.click('[data-line="scan"] .pick'); await page.waitForTimeout(300);
  await shot(page, "设置-3-3-右侧操作台-选项目扫描");
  await done(page, errors, "3-3");
}
{
  const { page } = await open("设置-三的优化.html");
  await page.waitForTimeout(800);
  await shot(page, "设置-三的优化");
  await page.close();
}
console.log(log.join("\n"));
await browser.close(); server.close();
