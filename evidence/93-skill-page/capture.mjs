// #93 第二批实测截图：对 preview-server.mjs（合成 my-skills）截 1440 宽、2 倍清晰度的 Skill 页。
// 等字体加载完、动画停下再截；交互用真实点击。
// 用法：PLAYWRIGHT_CHROMIUM=… node --import ../93-asset-library/pw-exec.mjs capture.mjs http://127.0.0.1:5194
import { chromium } from "playwright";
import { join } from "node:path";

const url = process.argv[2] || "http://127.0.0.1:5194";
const out = join(import.meta.dirname, "shots");
const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2, reducedMotion: "reduce", permissions: ["clipboard-read", "clipboard-write"] });
const page = await context.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
const settle = async () => { await page.evaluate(() => document.fonts.ready); await page.waitForTimeout(700); };
const shot = async (name, opts = {}) => { await settle(); await page.screenshot({ path: join(out, name), ...opts }); console.log("截图", name); };

await page.goto(`${url}/#assets`);
await page.locator(".ac2").first().waitFor();
await page.getByRole("group", { name: "资产类型" }).getByRole("button", { name: /^Skill/ }).click();
await page.locator(".ac2-skill").first().waitFor();
await shot("1440-Skill-全部.png");
await shot("1440-Skill-整页.png", { fullPage: true });
await page.locator(".ac2-skill").first().screenshot({ path: join(out, "1440-Skill-单卡.png") });

await page.locator(".ac2-chips").getByRole("button", { name: /^思考决策/ }).click();
await shot("1440-Skill-思考决策.png");
await page.locator(".ac2-chips").getByRole("button", { name: /^全部/ }).click();

await page.getByLabel("misc-helper 的分类").selectOption({ label: "本机运维" });
await page.waitForTimeout(800);
await page.getByRole("button", { name: "置顶 weekly-retro", exact: true }).click();
await page.waitForTimeout(800);
await shot("1440-Skill-改分类与置顶后.png");

await page.getByRole("button", { name: "复制调用名 decision-review", exact: true }).click();
console.log("剪贴板：", await page.evaluate(() => navigator.clipboard.readText()));
await shot("1440-Skill-复制提示.png");

await page.getByRole("button", { name: "这页怎么用" }).click();
await shot("1440-帮助.png");

console.log(errors.length ? "页面错误：" + errors.join(" | ") : "无页面错误");
await browser.close();
