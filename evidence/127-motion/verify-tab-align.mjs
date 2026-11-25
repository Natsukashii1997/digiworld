// 指示条与选中按钮对齐：首次打开（不再渲染）、切页签后，指示条左右边 = 按钮左右边 ± 内缩 10px。
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const { chromium } = require("/Users/nat/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright");
const [url] = process.argv.slice(2);
const b = await chromium.launch({ headless: true, executablePath: process.env.PW_EXE });
const out = {};
for (const w of [1440, 1280, 2560]) {
  const p = await (await b.newContext({ viewport: { width: w, height: 900 } })).newPage();
  await p.goto(url + "#assets"); await p.locator(".asset-card").first().waitFor(); await p.waitForTimeout(800);
  await p.locator(".asset-card .card-open").first().click(); await p.getByRole("dialog").waitFor(); await p.waitForTimeout(1200);
  const m = () => p.evaluate(() => { const t = document.querySelector(".detail-tabs"), a = t.querySelector("button.active"); const tr = t.getBoundingClientRect(), ar = a.getBoundingClientRect(); const mt = new DOMMatrix(getComputedStyle(t, "::after").transform); const left = tr.left + mt.e, right = left + 100 * mt.a; return { dl: +(left - (ar.left + 10)).toFixed(1), dr: +(right - (ar.right - 10)).toFixed(1), parent: a.offsetParent?.className }; });
  const first = await m();
  await p.getByRole("button", { name: /历史/ }).first().click(); await p.waitForTimeout(400);
  out[w] = { first, afterSwitch: await m() };
}
console.log(JSON.stringify(out)); await b.close();
