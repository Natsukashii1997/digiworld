// #93 第三批实测截图：对 preview-server.mjs（合成设计资产）截 1440 宽、2 倍清晰度的 Design 页与新建对话框。
// 等字体加载完、动画停下再截；交互用真实点击和真实文件选择。
// 用法：PLAYWRIGHT_CHROMIUM=… node --import ../93-asset-library/pw-exec.mjs capture.mjs http://127.0.0.1:5195
import { chromium } from "playwright";
import { join } from "node:path";
import { readFileSync } from "node:fs";

const url = process.argv[2] || "http://127.0.0.1:5195";
const out = join(import.meta.dirname, "shots");
const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2, reducedMotion: "reduce", permissions: ["clipboard-read", "clipboard-write"] });
const page = await context.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
const settle = async () => { await page.evaluate(() => document.fonts.ready); await page.waitForTimeout(700); };
const shot = async (name, opts = {}) => { await settle(); await page.screenshot({ path: join(out, name), ...opts }); console.log("截图", name); };
const clip = () => page.evaluate(() => navigator.clipboard.readText());

await page.goto(`${url}/#assets`);
await page.getByRole("group", { name: "资产类型" }).waitFor();
await page.getByRole("group", { name: "资产类型" }).getByRole("button", { name: /^Design/ }).click();
await page.locator(".ac2-design").first().waitFor();
await page.locator(".ac2-shot-img").nth(2).waitFor();
await shot("1440-Design-全部.png");
await shot("1440-Design-整页.png", { fullPage: true });
await page.locator(".ac2-design").first().screenshot({ path: join(out, "1440-Design-单卡-Skill.png") });

await page.locator(".ac2-calltpl").screenshot({ path: join(out, "1440-Design-调用指令模板.png") });

await page.getByRole("group", { name: "按形式筛选" }).getByRole("button", { name: /^设计 Prompt/ }).click();
await shot("1440-Design-设计Prompt.png");
await page.getByRole("group", { name: "按形式筛选" }).getByRole("button", { name: /^全部/ }).click();

await page.getByRole("button", { name: "复制调用指令 anti-template-ui", exact: true }).click();
await page.waitForTimeout(600);
console.log("复制调用指令 →\n" + await clip());
await page.getByRole("button", { name: "复制全文 数码世界 · 像素硬件风", exact: true }).click();
await page.waitForTimeout(600);
console.log("复制全文 →\n" + await clip());
await shot("1440-Design-复制后.png");

// 新建设计 Skill：填名字、地址、子目录，上传一张效果图。
await page.getByRole("button", { name: "新建", exact: true }).click();
const form = page.getByRole("dialog");
await form.getByRole("radio", { name: "设计" }).click().catch(() => {});
await form.getByRole("radiogroup", { name: "设计形式" }).getByRole("radio", { name: "设计 Skill" }).click();
await form.getByLabel("Skill 名称").fill("poster-kit");
await form.getByLabel("GitHub 地址").fill("https://github.com/example-org/poster-kit");
await form.getByLabel("仓库子目录（可选）").fill("skills/poster-kit");
await form.getByLabel("风格说明").fill("16 色像素海报：配色、排版与交付尺寸。");
const sample = readFileSync(join(import.meta.dirname, "sample-cover.png"));
await form.getByLabel("选择效果图").setInputFiles({ name: "cover.png", mimeType: "image/png", buffer: sample });
await form.locator(".design-image-preview img").waitFor();
await shot("1440-新建-设计Skill.png");
await form.getByRole("button", { name: /保存/ }).click();
await page.locator(".ac2-design", { hasText: "poster-kit" }).waitFor();
await page.locator(".ac2-design", { hasText: "poster-kit" }).locator(".ac2-shot-img").waitFor();
await shot("1440-Design-新建后.png");

await page.getByRole("button", { name: "新建", exact: true }).click();
await page.getByRole("dialog").getByRole("radiogroup", { name: "设计形式" }).getByRole("radio", { name: "设计 Prompt" }).click();
await shot("1440-新建-设计Prompt.png");
await page.keyboard.press("Escape");

await page.getByRole("button", { name: "这页怎么用" }).click();
await shot("1440-帮助.png");

console.log(errors.length ? "页面错误：" + errors.join(" | ") : "无页面错误");
await browser.close();
