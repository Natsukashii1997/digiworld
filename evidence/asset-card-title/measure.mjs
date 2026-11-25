// 资产卡标题加大后在 1440 宽下逐页量折行：输出各页标题字号和折成多行的标题。用法：node measure.mjs
import { chromium } from "playwright";
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 1440, height: 900 } });
await p.goto("http://127.0.0.1:5191/#assets");
await p.waitForSelector(".page-assets .ac2-body h3");
await p.evaluate(() => document.fonts.ready);
for (const t of ["Prompt", "Design", "Skill"]) {
  await p.locator(".page-assets button", { hasText: new RegExp(`^${t}`) }).first().click();
  await p.waitForTimeout(800);
  console.log(t, JSON.stringify(await p.$$eval(".page-assets .ac2-body h3", (h) => ({ n: h.length, fs: h[0] && getComputedStyle(h[0]).fontSize, multi: h.filter((e) => e.getBoundingClientRect().height > parseFloat(getComputedStyle(e).lineHeight) * 1.5).map((e) => e.textContent) }))));
}
if (process.argv[2]) await p.screenshot({ path: process.argv[2], clip: { x: 0, y: 150, width: 1440, height: 600 } });
await b.close();
