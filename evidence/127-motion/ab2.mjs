// 首页信号线对照：GPU 版 Chrome（headless=new），每种写法跑 3 次、每次静置 4 秒，记平均帧间隔、>20ms 的帧数。
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const { chromium } = require("/Users/nat/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright");
const [url, w, h] = process.argv.slice(2);
const exe = process.env.HOME + "/Library/Caches/ms-playwright/chromium-1248/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing";
const b = await chromium.launch({ executablePath: exe, headless: true, args: ["--headless=new", "--ignore-gpu-blocklist", "--enable-gpu-rasterization", "--use-angle=metal"] });
const variants = {
  "原样": "",
  "去掉信号线滤镜": ".page-home.v16 .hx-traces g .hx-sig{filter:none!important}",
  "双层描边(GPT)": ".page-home.v16 .hx-traces g .hx-sig{filter:none!important;stroke-width:2.5}",
  "信号线不动(下限)": ".page-home.v16 .hx-sig{animation:none!important}",
};
const p0 = await (await b.newContext()).newPage(); await p0.goto("chrome://gpu"); const gpu = (await p0.locator("body").innerText()).match(/Canvas:.*|Rasterization:.*|Compositing:.*/g)?.slice(0, 3); console.log(gpu?.join(" | ")); 
for (const [name, css] of Object.entries(variants)) {
  const res = [];
  for (let k = 0; k < 3; k++) {
    const ctx = await b.newContext({ viewport: { width: +w, height: +h } }); const p = await ctx.newPage();
    await p.goto(url + "#home"); await p.waitForTimeout(1800);
    if (css) await p.addStyleTag({ content: css });
    if (name.startsWith("双层")) await p.evaluate(() => document.querySelectorAll(".hx-traces g").forEach(g => { const s = g.querySelector(".hx-sig"); const halo = s.cloneNode(); halo.setAttribute("class", "hx-sig hx-halo"); halo.style.cssText = "stroke-width:9;opacity:.28;filter:none"; g.insertBefore(halo, s); }));
    await p.waitForTimeout(300);
    const f = await p.evaluate(() => new Promise(r => { const fr = []; let l = performance.now(); const s = l; const loop = t => { fr.push(t - l); l = t; if (t - s < 4000) requestAnimationFrame(loop); else r(fr.slice(2)); }; requestAnimationFrame(loop); }));
    res.push({ avg: f.reduce((a, b) => a + b, 0) / f.length, slow: f.filter(x => x > 20).length, n: f.length });
    await ctx.close();
  }
  console.log(`${w}x${h} ${name.padEnd(12)} avg ${res.map(x => x.avg.toFixed(1)).join("/")}ms  >20ms ${res.map(x => x.slow + "/" + x.n).join(" ")}`);
}
await b.close();
