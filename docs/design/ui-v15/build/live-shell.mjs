// 从合成 fixture 上运行的真实应用里取侧栏与顶栏 DOM（随机端口、隔离运行器；不访问 5178）。
import { createRequire } from "node:module";
import { writeFile } from "node:fs/promises";
const repo = "/Users/nat/Documents/ChatGPT/个人/work/personal-ai-workbench";
const { fixture } = await import(`file://${repo}/tests/fixture.mjs`);
const { batch1State } = await import(`file://${repo}/tests/ui-v14-batch1-fixture.mjs`);
const { chromium } = createRequire(import.meta.url)("/Users/nat/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright");
const app = await fixture(); await app.repository.write(batch1State(), { initialize: true });
const b = await chromium.launch(); const out = {};
try {
  const p = await (await b.newContext({ viewport: { width: 1440, height: 1000 }, reducedMotion: "reduce" })).newPage();
  for (const route of ["home", "agents", "knowledge", "collab", "projects"]) {
    await p.goto(app.url + "/#" + route); await p.waitForTimeout(1500);
    out[route] = await p.evaluate(() => ({ sidebar: document.querySelector(".sidebar")?.outerHTML, topbar: document.querySelector(".topbar")?.outerHTML, main: document.querySelector(".main-content")?.outerHTML, shell: document.querySelector(".app-shell")?.className, body: document.body.className }));
  }
} finally { await b.close(); await app.close(); }
await writeFile(`${repo}/docs/design/ui-v15/build/live.json`, JSON.stringify(out));
console.log(Object.fromEntries(Object.entries(out).map(([k, v]) => [k, [v.sidebar?.length, v.topbar?.length, v.main?.length, v.shell, v.body]])));
