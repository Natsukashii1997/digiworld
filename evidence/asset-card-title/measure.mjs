// 资产卡标题加大后逐页量：每页所有标题的计算字号、字重（去重列出）和折成多行的标题；有标题不是 20px / 800 就以非零退出。
// 用法：node measure.mjs [截图.png]；环境变量 URL（默认 http://127.0.0.1:5191）、W（视口宽，默认 1440）。
import { chromium } from "playwright";
const url = process.env.URL || "http://127.0.0.1:5191";
const width = Number(process.env.W || 1440);
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width, height: 900 } });
await p.goto(`${url}/#assets`);
await p.waitForSelector(".page-assets .ac2-body h3");
await p.evaluate(() => document.fonts.ready);
let bad = 0;
for (const t of ["Prompt", "Design", "Skill"]) {
  // 窄视口下顶栏会盖住页签，用 force 点击。
  await p.locator(".page-assets button", { hasText: new RegExp(`^${t}`) }).first().click({ force: true });
  await p.waitForTimeout(800);
  const r = await p.$$eval(".page-assets .ac2-body h3", (h) => ({
    n: h.length,
    fs: [...new Set(h.map((e) => getComputedStyle(e).fontSize))],
    fw: [...new Set(h.map((e) => getComputedStyle(e).fontWeight))],
    multi: h.filter((e) => e.getBoundingClientRect().height > parseFloat(getComputedStyle(e).lineHeight) * 1.5).map((e) => e.textContent),
  }));
  if (r.fs.join() !== "20px" || r.fw.join() !== "800") bad++;
  console.log(t, JSON.stringify(r));
}
if (process.argv[2]) await p.screenshot({ path: process.argv[2], clip: { x: 0, y: 150, width, height: 600 } });
await b.close();
process.exit(bad ? 1 : 0);
