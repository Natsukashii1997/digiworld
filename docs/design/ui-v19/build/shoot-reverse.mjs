// UI v19 · 逆向工程三版的截图：1440 首屏、关键分镜与 390。node docs/design/ui-v19/build/shoot-reverse.mjs
import { join } from "node:path";
import { chromium } from "playwright";
import { serve } from "../../ui-v18/build/serve.mjs";
const server = await serve(0);
const base = `http://127.0.0.1:${server.address().port}/docs/design/ui-v19/`;
const browser = await chromium.launch();
const out = (name) => join(import.meta.dirname, "../shots", `${name}.png`);
const log = [];
async function open(file, w = 1440, h = 900) {
  const page = await browser.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: 2, timezoneId: "Asia/Shanghai" });
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("request", (r) => { if (r.method() !== "GET") errors.push(`非 GET 请求：${r.method()} ${r.url()}`); });
  await page.goto(base + encodeURIComponent(file));
  await page.waitForTimeout(900);
  return { page, errors };
}
const shot = async (page, name, full = false) => { await page.screenshot({ path: out(name), fullPage: full }); log.push(name); };
const overflow = (page) => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);

for (const [file, key, steps] of [
  ["逆向工程-1-工单台.html", "1-工单台", async (p) => {
    await p.click('[data-rv-save]'); await p.waitForTimeout(200); await shot(p, "逆向工程-1-工单台-存成预览");
    await p.click("[data-rv-confirm]"); await p.waitForTimeout(1600); await shot(p, "逆向工程-1-工单台-已收成");
    await p.click('[data-rv-pick="r3"]'); await p.waitForTimeout(500); await shot(p, "逆向工程-1-工单台-待交出");
  }],
  ["逆向工程-2-孵化流水.html", "2-孵化流水", async (p) => {
    await p.click('[data-rv-open="r2"]'); await p.waitForTimeout(500); await shot(p, "逆向工程-2-孵化流水-抽屉");
    await p.click('[data-rv-close]'); await p.waitForTimeout(300);
    await p.click('.rv-card[data-rv-id="r3"] [data-rv-copy]'); await p.waitForTimeout(900); await shot(p, "逆向工程-2-孵化流水-交出后");
  }],
  ["逆向工程-3-解剖屏.html", "3-解剖屏", async (p) => {
    await p.click('[data-rv-pick="r1"]'); await p.waitForTimeout(500); await shot(p, "逆向工程-3-解剖屏-待交出");
  }],
]) {
  const { page, errors } = await open(file);
  await shot(page, `逆向工程-${key}-1440`);
  await steps(page);
  log.push(`  ${key} 1440 横向溢出 ${await overflow(page)}px ${errors.join(" ") || "无脚本错误"}`);
  await page.close();
  const m = await open(file, 390, 844);
  await shot(m.page, `逆向工程-${key}-390`, true);
  if (key.startsWith("1")) { await m.page.click('[data-rv-pick="r2"]'); await m.page.waitForTimeout(500); await shot(m.page, `逆向工程-${key}-390-详情`, true); }
  log.push(`  ${key} 390 横向溢出 ${await overflow(m.page)}px ${m.errors.join(" ") || "无脚本错误"}`);
  await m.page.close();
}
await browser.close();
server.close();
console.log(log.join("\n"));
