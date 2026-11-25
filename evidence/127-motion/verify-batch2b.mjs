import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const { chromium } = require("/Users/nat/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright");
const [url] = process.argv.slice(2);
const b = await chromium.launch({ headless: true, executablePath: process.env.PW_EXE });
const p = await (await b.newContext({ viewport: { width: 1440, height: 900 } })).newPage(); const errs = []; p.on("pageerror", e => errs.push(e.message));
const r = {};
await p.goto(url + "#assets"); await p.locator(".asset-card").first().waitFor(); await p.waitForTimeout(1200);
r.before = await p.locator(".asset-card h3").allInnerTexts();
r.chips = await p.locator(".page-assets .ac2-chip").allInnerTexts();
await p.locator(".page-assets .ac2-chip").nth(2).click(); await p.waitForTimeout(40);
r.mid = await p.evaluate(() => [...document.querySelectorAll(".asset-grid > [data-flip]")].map(el => ({ t: el.querySelector("h3")?.innerText, flipAnims: el.getAnimations().filter(a => !a.animationName).length, quick: el.classList.contains("flip-quick"), x: Math.round(el.getBoundingClientRect().left) })));
await p.waitForTimeout(300);
r.end = await p.evaluate(() => [...document.querySelectorAll(".asset-grid > [data-flip]")].map(el => ({ t: el.querySelector("h3")?.innerText, x: Math.round(el.getBoundingClientRect().left) })));
await p.locator(".page-assets .ac2-chip").nth(0).click(); await p.waitForTimeout(40);
r.back = await p.evaluate(() => [...document.querySelectorAll(".asset-grid > [data-flip]")].map(el => ({ t: el.querySelector("h3")?.innerText, flipAnims: el.getAnimations().filter(a => !a.animationName).length, quick: el.classList.contains("flip-quick"), x: Math.round(el.getBoundingClientRect().left) })));
// 折叠
await p.goto(url + "#agents"); await p.locator(".main-content").waitFor(); await p.waitForTimeout(2500);
r.detailsCount = await p.locator("details > summary").count();
if (r.detailsCount) {
  const d = p.locator("details").first(); await d.scrollIntoViewIfNeeded();
  await d.locator("> summary").click(); await p.waitForTimeout(400);
  const opened = await d.evaluate(e => e.open);
  await d.locator("> summary").click(); await p.waitForTimeout(40);
  const mid = await d.evaluate(e => ({ open: e.open, closing: e.hasAttribute("data-closing"), anim: [...e.children].flatMap(c => c.getAnimations().map(a => a.animationName)) }));
  await d.locator("> summary").click(); await p.waitForTimeout(300);
  const interrupted = await d.evaluate(e => ({ open: e.open, closing: e.hasAttribute("data-closing") }));
  await d.locator("> summary").click(); await p.waitForTimeout(300);
  r.details = { opened, mid, interrupted, closedAfter: await d.evaluate(e => e.open) };
}
r.errs = errs; console.log(JSON.stringify(r));
await b.close();
