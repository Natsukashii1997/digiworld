import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const { chromium } = require("/Users/nat/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright");
const [url] = process.argv.slice(2);
const b = await chromium.launch({ headless: true, executablePath: process.env.PW_EXE });
const out = {};
for (const rm of ["no-preference", "reduce"]) {
  const p = await (await b.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: rm })).newPage();
  await p.goto(url + "#assets"); await p.locator(".asset-card").first().waitFor(); await p.waitForTimeout(800);
  await p.evaluate(() => { const d = document.createElement("details"); d.id = "t"; d.innerHTML = "<summary>测试折叠</summary><p>内容</p>"; document.querySelector(".main-content").prepend(d); });
  const d = p.locator("#t"), s = d.locator("> summary");
  await s.click(); await p.waitForTimeout(30);
  const openAnim = await d.evaluate(e => ({ open: e.open, anim: e.querySelector("p").getAnimations().map(a => a.animationName) }));
  await p.waitForTimeout(300);
  await s.click(); await p.waitForTimeout(40);
  const mid = await d.evaluate(e => ({ open: e.open, closing: e.hasAttribute("data-closing"), anim: e.querySelector("p").getAnimations().map(a => a.animationName) }));
  await s.click(); await p.waitForTimeout(300);
  const interrupted = await d.evaluate(e => ({ open: e.open, closing: e.hasAttribute("data-closing") }));
  await s.click(); await p.waitForTimeout(300);
  const closed = await d.evaluate(e => e.open);
  await s.press("Enter"); await p.waitForTimeout(300); const kbOpen = await d.evaluate(e => e.open);
  await s.press("Enter"); await p.waitForTimeout(300); const kbClosed = await d.evaluate(e => e.open);
  out[rm] = { openAnim, mid, interrupted, closed, kbOpen, kbClosed };
}
console.log(JSON.stringify(out, null, 1)); await b.close();
