// UI v19 · 只读抓取正式 5178 某一页的渲染标记（"一 · 现版原样"的来源）：拦截所有非 GET 请求，不写任何数据。
// 用法（项目根目录）：node docs/design/ui-v19/build/capture-page.mjs <路由> <文件名>  例：assets assets → 写 build/assets-main.html 与 assets-info.json
// 环境变量：BASE 指向别的实例（默认正式 5178）；ALLOW_POST=1 放行非 GET（只对隔离实例用）；SHOT=<png 路径> 另存整页截图。
import { chromium } from "playwright";
import { writeFile } from "node:fs/promises";
const [route, name] = process.argv.slice(2);
const base = process.env.BASE || "http://127.0.0.1:5178", allowPost = process.env.ALLOW_POST === "1";
const out = import.meta.dirname;
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1, timezoneId: "Asia/Shanghai" });
const blocked = [];
await page.route("**/*", (r) => { const q = r.request(); if (q.method() !== "GET" && !allowPost) { blocked.push(q.method() + " " + q.url()); return r.abort(); } r.continue(); });
await page.goto(`${base}/#${route}`);
await page.waitForSelector("main", { timeout: 15000 });
await page.waitForTimeout(allowPost ? 6000 : 3000);
if (process.env.SHOT) await page.screenshot({ path: process.env.SHOT, fullPage: true });
const html = await page.evaluate(() => document.querySelector("main")?.outerHTML || "");
await writeFile(`${out}/${name}-main.html`, html);
const info = await page.evaluate(() => ({ mainClass: document.querySelector("main")?.className, pageH: document.documentElement.scrollHeight, title: document.querySelector("main h1")?.textContent,
  classes: [...new Set([...document.querySelectorAll("main [class]")].flatMap((el) => [...el.classList]))].slice(0, 400) }));
await writeFile(`${out}/${name}-info.json`, JSON.stringify(info, null, 1));
console.log("main:", info.mainClass, "| 页高", info.pageH, "| h1", info.title, "| 标记", html.length, "字\n拦截的非 GET：", blocked.length ? blocked.join("\n") : "无");
await browser.close();
