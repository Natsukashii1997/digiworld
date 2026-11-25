// P2-05：① 用户关（X/Esc）焦点回到触发按钮；② 父组件关（保存类业务完成后直接卸载）也留残影、焦点归还；③ 关后立刻重开，新弹窗在残影之上、可交互；④ SVG 内部 id 保留；⑤ 折叠 Space 键。
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const { chromium } = require("/Users/nat/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright");
const [url, shots] = process.argv.slice(2);
const b = await chromium.launch({ headless: true, executablePath: process.env.PW_EXE });
const p = await (await b.newContext({ viewport: { width: 1440, height: 900 } })).newPage(); const errs = []; p.on("pageerror", e => errs.push(e.message));
const r = {};
await p.goto(url + "#assets"); await p.locator(".asset-card").first().waitFor(); await p.waitForTimeout(900);
const opener = p.locator(".asset-card .card-open").first();
// ① Esc 关闭
await opener.click(); await p.getByRole("dialog").waitFor(); await p.waitForTimeout(800);
await p.keyboard.press("Escape"); await p.waitForTimeout(30);
r.escGhost = await p.locator("[data-leaving]").count();
r.escFocusBack = await p.evaluate(() => document.activeElement?.classList.contains("card-open"));
await p.waitForTimeout(300);
// ③ 关后立刻重开
await opener.click(); await p.getByRole("dialog").waitFor(); await p.waitForTimeout(800);
await p.getByRole("button", { name: "关闭", exact: true }).first().click();
await opener.click(); await p.waitForTimeout(20);
r.reopen = await p.evaluate(() => { const g = document.querySelector("[data-leaving]"), n = document.querySelector(".overlay:not([data-leaving])"); return { ghost: !!g, real: !!n, ghostZ: g && getComputedStyle(g).zIndex, realZ: n && getComputedStyle(n).zIndex, dialogs: document.querySelectorAll("[role=dialog]").length }; });
await p.waitForTimeout(100); await p.screenshot({ path: `${shots}/p205-reopen.png` });
// 新弹窗可交互：点关闭能关
await p.waitForTimeout(800); await p.getByRole("button", { name: "关闭", exact: true }).first().click(); await p.waitForTimeout(300);
r.reopenClosable = await p.getByRole("dialog").count(); console.log("after reopen-close", JSON.stringify(r), await p.evaluate(()=>[...document.querySelectorAll(".overlay")].map(o=>o.className)));
// ② 父组件关：打开新建表单 → 直接切路由（父组件卸载）
await opener.click(); await p.getByRole("dialog").waitFor(); await p.waitForTimeout(800);
await p.evaluate(() => { location.hash = "notes"; }); await p.waitForTimeout(30);
r.parentClose = { ghost: await p.locator("[data-leaving]").count(), dialogs: await p.getByRole("dialog").count() };
// ④ SVG id：在弹窗里放一个带渐变的 svg，关闭时看残影里 id 是否保留
console.log("parentClose", JSON.stringify(r.parentClose));
await p.evaluate(() => { location.hash = "assets"; }); await p.locator(".asset-card").first().waitFor(); await p.waitForTimeout(900);
if (await p.getByRole("dialog").count()) { await p.keyboard.press("Escape"); await p.waitForTimeout(400); }
await p.locator(".asset-card .card-open").first().click(); await p.getByRole("dialog").waitFor(); await p.waitForTimeout(800);
await p.evaluate(() => { const s = document.querySelector("[role=dialog]"); s.insertAdjacentHTML("beforeend", '<div id="html-id"><svg width="10" height="10"><defs><linearGradient id="g-test"><stop offset="0" stop-color="red"/></linearGradient></defs><rect width="10" height="10" fill="url(#g-test)"/></svg></div>'); });
await p.keyboard.press("Escape"); await p.waitForTimeout(30);
r.svgIds = await p.evaluate(() => { const g = document.querySelector("[data-leaving]"); return g ? { svgIdKept: !!g.querySelector("#g-test"), htmlIdRemoved: !g.querySelector("#html-id"), dupGradient: document.querySelectorAll("#g-test").length } : null; });
await p.waitForTimeout(300);
// ⑤ Space 键折叠
await p.evaluate(() => { const d = document.createElement("details"); d.id = "t"; d.innerHTML = "<summary>测试折叠</summary><p>内容</p>"; document.querySelector(".main-content").prepend(d); });
const s = p.locator("#t > summary"); await s.focus();
await p.keyboard.press("Space"); await p.waitForTimeout(300); const o = await p.locator("#t").evaluate(e => e.open);
await p.keyboard.press("Space"); await p.waitForTimeout(40); const mid = await p.locator("#t").evaluate(e => ({ open: e.open, closing: e.hasAttribute("data-closing") }));
await p.waitForTimeout(300); const c = await p.locator("#t").evaluate(e => e.open);
r.space = { opened: o, mid, closed: !c };
r.errs = errs; console.log(JSON.stringify(r, null, 1)); await b.close();
