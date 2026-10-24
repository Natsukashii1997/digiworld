// UI v19 · 给单个预览页截图：node docs/design/ui-v19/build/shoot-one.mjs <ui-v19 下的文件名> <截图名> [宽 高]
import { join } from "node:path";
import { chromium } from "playwright";
import { serve } from "../../ui-v18/build/serve.mjs";
const [file, name, w = "1440", h = "900"] = process.argv.slice(2);
const server = await serve(0);
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: Number(w), height: Number(h) }, deviceScaleFactor: 2, timezoneId: "Asia/Shanghai" });
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
await page.goto(`http://127.0.0.1:${server.address().port}/docs/design/ui-v19/${encodeURIComponent(file)}`);
await page.waitForTimeout(1500);
await page.screenshot({ path: join(import.meta.dirname, "../shots", `${name}.png`), fullPage: true });
console.log(`${name}: 页高`, await page.evaluate(() => document.documentElement.scrollHeight), errors.length ? "\n脚本错误：" + errors.join("\n") : "无脚本错误");
await browser.close(); server.close();
