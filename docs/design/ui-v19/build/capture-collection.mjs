// UI v19 · 只读抓取正式 5178 个人收藏页的渲染标记（一 · 现版原样 的来源）：拦截所有非 GET 请求，不写任何数据。
// 用法（项目根目录）：node docs/design/ui-v19/build/capture-collection.mjs → 写 build/collection-main.html 与 collection-info.json
import { chromium } from "playwright";
const out = import.meta.dirname;
const fs = await import("node:fs/promises");
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1, timezoneId: "Asia/Shanghai" });
const blocked = [];
await page.route("**/*", (route) => { const r = route.request(); if (r.method() !== "GET") { blocked.push(r.method() + " " + r.url()); return route.abort(); } route.continue(); });
await page.goto("http://127.0.0.1:5178/#learning");
await page.waitForSelector(".collection-module .collection-paper", { timeout: 15000 });
await page.waitForTimeout(2500);
const html = await page.evaluate(() => document.querySelector("main")?.outerHTML || document.body.innerHTML);
await fs.writeFile(out + "/collection-main.html", html);
const info = await page.evaluate(() => ({
  papers: [...document.querySelectorAll(".collection-card-position")].map((el) => ({ style: el.getAttribute("style"), title: el.querySelector(".collection-card-title")?.textContent, inner: el.firstElementChild?.getAttribute("style"), cls: el.firstElementChild?.className })),
  groups: [...document.querySelectorAll(".collection-group")].map((el) => el.textContent),
  chips: [...document.querySelectorAll(".collection-chip")].map((el) => el.textContent),
  desk: document.querySelector(".collection-desk")?.getAttribute("style"), canvas: document.querySelector(".collection-canvas")?.getAttribute("style"),
  pageH: document.documentElement.scrollHeight,
}));
await fs.writeFile(out + "/collection-info.json", JSON.stringify(info, null, 1));
console.log("卡片", info.papers.length, "分组", info.groups, "片", info.chips, "页高", info.pageH, "\n拦截的非 GET：", blocked.length ? blocked.join("\n") : "无");
await browser.close();
