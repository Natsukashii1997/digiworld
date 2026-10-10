// 截取视觉稿页面（本地文件，不访问任何服务）。
import { createRequire } from "node:module";
import { mkdir } from "node:fs/promises";
const dir = "/Users/nat/Documents/ChatGPT/个人/work/personal-ai-workbench/docs/design/ui-v15";
const { chromium } = createRequire(import.meta.url)("/Users/nat/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright");
const ids = process.argv[2] ? process.argv[2].split(",") : ["home","inbox","assets","references","agents","projects","collab","knowledge","calendar","notes","aihot","settings","history"];
const widths = (process.argv[3] || "1440").split(",").map(Number);
await mkdir(`${dir}/build/shots`, { recursive: true });
const b = await chromium.launch();
for (const w of widths) { const c = await b.newContext({ viewport: { width: w, height: 1000 }, reducedMotion: "reduce" }); const p = await c.newPage();
  for (const id of ids) { await p.goto(`file://${dir}/pages/${id}.html`); await p.waitForTimeout(300);
    const over = await p.evaluate(() => [...document.querySelectorAll(".main-content *")].filter(e => { const r = e.getBoundingClientRect(); return r.width && (r.right > innerWidth + 1 || r.left < -1); }).map(e=>e.className&&e.className.baseVal!==undefined?e.className.baseVal:e.className).slice(0,3));
    await p.screenshot({ path: `${dir}/build/shots/${id}-${w}.png`, fullPage: true }); console.log(id, w, "overflow", over); }
  await c.close(); }
await b.close();
