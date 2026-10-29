// UI v19 · 逆向工程第二轮三版的截图。node docs/design/ui-v19/build/shoot-reverse2.mjs [2A|2B|2C]
import { join } from "node:path";
import { chromium } from "playwright";
import { serve } from "../../ui-v18/build/serve.mjs";
const only = process.argv[2];
const server = await serve(0);
const base = `http://127.0.0.1:${server.address().port}/docs/design/ui-v19/`;
const browser = await chromium.launch();
const out = (name) => join(import.meta.dirname, "../shots", `${name}.png`);
const log = [];
async function open(file, w = 1440, h = 900) {
  const page = await browser.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: 2, timezoneId: "Asia/Shanghai" });
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
  page.on("request", (r) => { if (r.method() !== "GET") errors.push(`非 GET 请求：${r.method()} ${r.url()}`); });
  await page.goto(base + encodeURIComponent(file));
  await page.waitForTimeout(1400);
  return { page, errors };
}
const shot = async (page, name, full = false) => { await page.screenshot({ path: out(name), fullPage: full }); log.push(name); };
const overflow = (page) => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
const PAGES = [
  ["2A", "逆向工程-2A-透视图.html", async (p) => {
    await p.click('[data-node="k-api-mp"]'); await p.waitForTimeout(200); await shot(p, "逆向工程-2A-透视图-看证据");
    await p.click('[data-fog="u6"]'); await p.click('[data-fog="u7"]'); await p.waitForTimeout(200);
    await p.click('[data-xa-copy="Codex"]'); await p.waitForTimeout(1200); await shot(p, "逆向工程-2A-透视图-已追问");
    await p.click('[data-pick="r3"]'); await p.waitForTimeout(400); await shot(p, "逆向工程-2A-透视图-空标本");
  }],
  ["2B", "逆向工程-2B-回合.html", async (p) => {
    await p.click('[data-rb-copy="Codex"]'); await p.waitForTimeout(1200); await shot(p, "逆向工程-2B-回合-已发出");
  }],
  ["2C", "逆向工程-2C-孵蛋.html", async (p) => {
    await p.click('[data-rc-hatch]'); await p.waitForTimeout(300); await shot(p, "逆向工程-2C-孵蛋-孵化预览");
    await p.click('[data-rc-confirm]'); await p.waitForTimeout(1800); await shot(p, "逆向工程-2C-孵蛋-已孵化");
  }],
  ["3A", "逆向工程-3A-透视图精修.html", async (p) => {
    await p.waitForTimeout(600); await shot(p, "逆向工程-3A-透视图精修-扫描后");
    await p.click('[data-fog="u6"]'); await p.waitForTimeout(200); await shot(p, "逆向工程-3A-透视图精修-看雾点");
    await p.click('[data-round="1"]'); await p.waitForTimeout(1000); await shot(p, "逆向工程-3A-透视图精修-第1轮");
  }],
  ["3C", "逆向工程-3C-孵蛋精修.html", async (p) => {
    await p.click('[data-rc-hatch]'); await p.waitForTimeout(300); await shot(p, "逆向工程-3C-孵蛋精修-孵化预览");
    await p.click('[data-rc-confirm]'); await p.waitForTimeout(2000); await shot(p, "逆向工程-3C-孵蛋精修-已孵化");
  }],
];
for (const [key, file, steps] of PAGES) {
  if (only && only !== key) continue;
  const { page, errors } = await open(file);
  await shot(page, file.replace(".html", "-1440"));
  try { await steps(page); } catch (e) { errors.push("分镜失败：" + e.message.split("\n")[0]); }
  log.push(`  ${key} 1440 溢出 ${await overflow(page)}px ${errors.join(" ") || "无脚本错误"}`);
  await page.close();
  const m = await open(file, 390, 844);
  await shot(m.page, file.replace(".html", "-390"), true);
  log.push(`  ${key} 390 溢出 ${await overflow(m.page)}px ${m.errors.join(" ") || "无脚本错误"}`);
  await m.page.close();
}
await browser.close();
server.close();
console.log(log.join("\n"));
