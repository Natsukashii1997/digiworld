// #93 实测截图：对正在跑的合成数据预览服务（preview-server.mjs）截 1440 宽的图，2 倍清晰度。
// 等字体加载完、动画停下再截；交互用真实点击。用法：node --import ./pw-exec.mjs capture.mjs http://127.0.0.1:5193
import { chromium } from "playwright";
import { join } from "node:path";

const url = process.argv[2] || "http://127.0.0.1:5193";
const out = join(import.meta.dirname, "shots");
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2, reducedMotion: "reduce" });
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
const settle = async () => { await page.evaluate(() => document.fonts.ready); await page.waitForTimeout(600); };
const shot = async (name, opts = {}) => { await settle(); await page.screenshot({ path: join(out, name), ...opts }); console.log("截图", name); };

await page.goto(`${url}/#assets`);
await page.locator(".ac2").first().waitFor();
await shot("1440-Prompt-全部.png");
await shot("1440-Prompt-整页.png", { fullPage: true });
await page.locator(".ac2").first().screenshot({ path: join(out, "1440-Prompt-单卡.png") });

await page.getByRole("button", { name: /思考决策/ }).click();
await shot("1440-Prompt-思考决策.png");
await page.getByRole("button", { name: /待归类/ }).click();
await shot("1440-Prompt-待归类.png");

// 在卡片右下角改分类：自动归组的「随便写写」改成「复盘与知识」
await page.getByLabel("随便写写 的分类").selectOption({ label: "复盘与知识" });
await page.waitForTimeout(800);
await page.getByRole("button", { name: /^全部/ }).click();
await shot("1440-Prompt-改分类后.png");

await page.getByRole("button", { name: /^Skill/ }).click();
await shot("1440-Skill.png");
await page.getByRole("button", { name: /^Design/ }).click();
await shot("1440-Design.png");

await page.getByRole("button", { name: /^Prompt/ }).click();
await page.getByRole("button", { name: "新建" }).first().click();
await shot("1440-新建-Prompt-分类下拉.png");

console.log(errors.length ? "页面错误：" + errors.join(" | ") : "无页面错误");
await browser.close();
