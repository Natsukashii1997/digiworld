// 验证 #127 退场幽灵：开着动效打开资产详情抽屉 → 关闭 → 幽灵在、无 role、无 id、在播退场 → 300ms 后消失；减少动效下不留幽灵。
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const { chromium } = require("/Users/nat/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright");
const [url, shots] = process.argv.slice(2);
const b = await chromium.launch({ headless: true, executablePath: process.env.PW_EXE });
const out = {};
for (const rm of ["no-preference", "reduce"]) {
  const ctx = await b.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: rm });
  const p = await ctx.newPage(); const errs = []; p.on("pageerror", e => errs.push(e.message));
  await p.goto(url + "#assets"); await p.locator(".asset-card").first().waitFor(); await p.waitForTimeout(900);
  await p.locator(".asset-card .card-open").first().click();
  await p.getByRole("dialog").waitFor(); await p.waitForTimeout(900);
  if (rm === "no-preference") await p.screenshot({ path: `${shots}/leave-0-open.png` });
  await p.getByRole("button", { name: "关闭", exact: true }).first().click();
  const at40 = await p.evaluate(() => { const g = document.querySelector("[data-leaving]"); return g ? { cls: g.className, role: g.querySelector("[role=dialog]") ? 1 : 0, ids: g.querySelectorAll("[id]").length, hidden: g.getAttribute("aria-hidden"), inert: g.inert, anims: g.getAnimations({ subtree: true }).map(a => a.animationName), dialogs: document.querySelectorAll("[role=dialog]").length } : null; });
  if (rm === "no-preference") { await p.waitForTimeout(60); await p.screenshot({ path: `${shots}/leave-1-mid.png` }); }
  await p.waitForTimeout(350);
  const after = await p.evaluate(() => document.querySelectorAll("[data-leaving]").length);
  out[rm] = { at40, after, errs };
  await ctx.close();
}
console.log(JSON.stringify(out, null, 1));
await b.close();
