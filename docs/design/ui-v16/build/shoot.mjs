// 截取 v16 视觉稿（本地文件，不访问任何服务）。用法：node shoot.mjs 页面1,页面2 1440,390
import { createRequire } from "node:module";
import { mkdir } from "node:fs/promises";
const dir = "/Users/nat/Documents/ChatGPT/个人/work/personal-ai-workbench/docs/design/ui-v16";
const { chromium } = createRequire(import.meta.url)("/Users/nat/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright");
const ids = process.argv[2].split(","), widths = (process.argv[3] || "1440,390").split(",").map(Number);
await mkdir(`${dir}/shots`, { recursive: true });
const b = await chromium.launch();
for (const w of widths) {
  const c = await b.newContext({ viewport: { width: w, height: 1000 }, reducedMotion: "reduce" });
  const p = await c.newPage();
  for (const id of ids) {
    await p.goto(`file://${dir}/pages/${id}.html`); await p.waitForTimeout(400);
    const over = await p.evaluate(() => [...document.querySelectorAll(".main-content *")].filter((e) => { if (e.closest(".cast,.tabs,.prompt,.rail-list,.rail-filter,.canvas,.slots,.ov-cats,.sheet,.sp-tabs,.cl-todo ul,.cx-runs,.tm-scroll,.st-nav,.hx-floor")) return false; if (e.ownerSVGElement) return false; /* SVG 内部图形由 SVG 自身裁切，只量 SVG 本身 */ const r = e.getBoundingClientRect(); return r.width && (r.right > innerWidth + 1 || r.left < -1); }).map((e) => (e.className && e.className.baseVal !== undefined ? e.className.baseVal : e.className)).slice(0, 4));
    // 长图里关掉底部吸附（否则吸附条会被算到错误位置）；窄屏另截一张首屏看吸附效果。
    if (w < 760) { await p.evaluate(() => scrollTo(0, 560)); await p.screenshot({ path: `${dir}/shots/${id}-${w}-viewport.png` }); await p.evaluate(() => scrollTo(0, 0)); }
    await p.addStyleTag({ content: ".launch,.forge-bar{position:static!important}" });
    await p.screenshot({ path: `${dir}/shots/${id}-${w}.png`, fullPage: true });
    console.log(id, w, "越界", JSON.stringify(over));
  }
  await c.close();
}
await b.close();
