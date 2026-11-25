// 资产卡标题加大后逐页量：每页所有标题的计算字号、字重（去重列出）和折成多行的标题；有标题不是 20px / 800，或 1440 及以上宽度有标题折行，就以非零退出。
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
  // 窄视口下顶栏会盖住页签、刚进页时有过渡层，坐标点击会落空；直接触发按钮的 click。
  const tab = p.locator(".page-assets button", { hasText: new RegExp(`^${t}`) }).first();
  const want = Number((await tab.textContent()).replace(/\D/g, ""));
  await tab.evaluate((b) => b.click());
  // 等页签选中、卡片数等于页签上的数字，不靠固定等待。
  await p.waitForFunction(([t, want]) => {
    const on = [...document.querySelectorAll(".page-assets button[aria-pressed='true']")].some((b) => b.textContent.trim().startsWith(t));
    return on && document.querySelectorAll(".page-assets .ac2-body h3").length === want;
  }, [t, want], { timeout: 20000 });
  const r = await p.$$eval(".page-assets .ac2-body h3", (h) => ({
    n: h.length,
    fs: [...new Set(h.map((e) => getComputedStyle(e).fontSize))],
    fw: [...new Set(h.map((e) => getComputedStyle(e).fontWeight))],
    multi: h.filter((e) => e.getBoundingClientRect().height > parseFloat(getComputedStyle(e).lineHeight) * 1.5).map((e) => e.textContent),
  }));
  if (r.fs.join() !== "20px" || r.fw.join() !== "800") bad++;
  if (width >= 1440 && r.multi.length) bad++; // 1440 及以上不允许折行；1280 允许长名在连字符处折行
  console.log(t, JSON.stringify(r));
}
if (process.argv[2]) await p.screenshot({ path: process.argv[2], clip: { x: 0, y: 150, width, height: 600 } });
await b.close();
process.exit(bad ? 1 : 0);
