import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const { chromium } = require("/Users/nat/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright");
const [url, route, w = 1440, h = 900] = process.argv.slice(2);
const b = await chromium.launch({ headless: true, executablePath: process.env.PW_EXE });
const p = await (await b.newContext({ viewport: { width: +w, height: +h } })).newPage();
await p.goto(url + "#" + route); await p.waitForTimeout(2500);
const list = await p.evaluate(() => document.getAnimations().filter(a => a.playState === "running").map(a => { const t = a.effect?.target; const kf = a.effect?.getKeyframes?.() || []; const props = [...new Set(kf.flatMap(k => Object.keys(k).filter(x => !["offset", "easing", "composite", "computedOffset"].includes(x))))]; return { name: a.animationName || "WAAPI", el: t ? (t.tagName + "." + String(t.className?.baseVal ?? t.className).split(" ").slice(0, 2).join(".")) : "?", props: props.join(","), dur: a.effect?.getTiming?.().duration, iter: a.effect?.getTiming?.().iterations }; }));
const g = {}; for (const a of list) { const k = `${a.name} | ${a.el} | ${a.props} | ${a.dur} | ${a.iter}`; g[k] = (g[k] || 0) + 1; }
console.log(Object.entries(g).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${v}× ${k}`).join("\n"));
await b.close();
