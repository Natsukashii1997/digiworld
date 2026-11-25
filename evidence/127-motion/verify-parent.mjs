import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const { chromium } = require("/Users/nat/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright");
const [url] = process.argv.slice(2);
const b = await chromium.launch({ headless: true, executablePath: process.env.PW_EXE });
const p = await (await b.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
await p.goto(url + "#assets"); await p.locator(".asset-card").first().waitFor(); await p.waitForTimeout(900);
const newBtn = p.getByRole("button", { name: /^新建/ }).first(); await newBtn.click(); await p.getByRole("dialog").waitFor(); await p.waitForTimeout(800);
const buttons = await p.getByRole("dialog").getByRole("button").allInnerTexts();
const cancel = p.getByRole("dialog").getByRole("button", { name: /取消|放弃/ }).first();
const has = await cancel.count();
if (has) { await cancel.click(); await p.waitForTimeout(30); }
console.log(JSON.stringify({ buttons: buttons.slice(0, 12), cancelFound: has, ghost: await p.locator("[data-leaving]").count(), dialogs: await p.getByRole("dialog").count(), focus: await p.evaluate(() => document.activeElement?.innerText?.slice(0, 20)) }));
await b.close();
