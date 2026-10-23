// UI v17 视觉稿截图：合成夹具 + 临时服务（不读真实数据）+ 注入 v17 样式层。用法：node shoot.mjs [assets,settings]
process.chdir("/Users/nat/Documents/ChatGPT/个人/work/personal-ai-workbench");
const ROOT = "/Users/nat/Documents/ChatGPT/个人/work/personal-ai-workbench";
const DIR = ROOT + "/docs/design/ui-v17";
const { chromium } = await import(ROOT + "/node_modules/playwright/index.mjs");
const { settingsFixture, settingsRoutes } = await import(ROOT + "/tests/settings-v16-fixture.mjs");
const { mkdir } = await import("node:fs/promises");
await mkdir(DIR + "/shots", { recursive: true });
const TAG = process.env.BEFORE ? "-before" : process.env.VARIANT ? "-v" + process.env.VARIANT : "";
const PAGES = { assets: { showcase: true, signal: 2 }, settings: { showcase: false, signal: 0 } };
const only = (process.argv[2] || Object.keys(PAGES).join(",")).split(",");
const app = await settingsFixture();
const b = await chromium.launch();
async function open(id, w) {
  const c = await b.newContext({ viewport: { width: w, height: w < 700 ? 844 : 900 }, deviceScaleFactor: w < 700 ? 2 : 1, timezoneId: "Asia/Shanghai", reducedMotion: "reduce" });
  const p = await c.newPage(); await settingsRoutes(p);
  await p.goto(app.url + "/#" + id); await p.waitForTimeout(2200);
  if (process.env.BEFORE) return { c, p };
  await p.evaluate((o) => (window.__v17 = o), { ...PAGES[id], variant: process.env.VARIANT || "" });
  await p.addStyleTag({ path: DIR + "/build/v17-layer.css" });
  if (process.env.VARIANT) await p.addStyleTag({ path: DIR + "/build/v17-variants.css" });
  await p.evaluate(await (await import("node:fs/promises")).readFile(DIR + "/build/v17-shell.js", "utf8"));
  if (process.env.VARIANT) await p.evaluate(await (await import("node:fs/promises")).readFile(DIR + "/build/v17-variants.js", "utf8"));
  await p.waitForTimeout(900);
  return { c, p };
}
for (const id of only) {
  for (const w of [1440, 390]) {
    const { c, p } = await open(id, w);
    const over = await p.evaluate(() => document.documentElement.scrollWidth - innerWidth);
    await p.screenshot({ path: `${DIR}/shots/${id}-${w}${TAG}.png`, fullPage: w < 700 });
    if (process.env.BEFORE) { console.log(id, w, "改版前"); await c.close(); continue; }
    if (w >= 1000) {
      await p.screenshot({ path: `${DIR}/shots/${id}-${w}${TAG}-full.png`, fullPage: true });
      await p.evaluate(() => scrollTo(0, 420)); await p.waitForTimeout(300);
      await p.screenshot({ path: `${DIR}/shots/${id}-${w}${TAG}-scrolled.png` });
    } else {
      await p.evaluate(() => scrollTo(0, 0));
      await p.locator(".mobile-menu").click(); await p.waitForTimeout(500);
      await p.screenshot({ path: `${DIR}/shots/${id}-${w}${TAG}-drawer.png` });
    }
    console.log(id, w, "横向溢出", over);
    await c.close();
  }
}
await b.close(); await app.close(); process.exit(0);
