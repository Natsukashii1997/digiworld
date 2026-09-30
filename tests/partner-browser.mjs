// UI v13.1 伙伴液晶屏：侧栏滚动 + 四季、首页数码暴龙机、戳一下、复制时数据飞入、减少动态效果。
import { createRequire } from "node:module";
import { mkdir } from "node:fs/promises";
import assert from "node:assert/strict";
import AxeBuilder from "@axe-core/playwright";
import { contextFixture } from "./context-fixture.mjs";
const require = createRequire(import.meta.url);
const { chromium } = require(
  process.env.PLAYWRIGHT_MODULE ||
    "/Users/nat/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright",
);
const app = await contextFixture();
const browser = await chromium.launch({ headless: true });
const errors = [];
const frameOf = (page, selector) =>
  page.evaluate((s) => document.querySelector(s).toDataURL(), selector);
const SIDE = "[data-partner-screen] canvas";
const STAGE = ".digivice-lcd canvas";
try {
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
    permissions: ["clipboard-read", "clipboard-write"],
  });
  const page = await context.newPage();
  page.on("pageerror", (e) => errors.push(e.message));
  page.setDefaultTimeout(5000);
  await page.goto(app.url + "/#assets");

  // 侧栏：动画在跑、从春天开始、说明跟着季节
  const side = page.locator(SIDE);
  await side.waitFor();
  assert.equal(await side.getAttribute("data-motion"), "live");
  assert.equal(await side.getAttribute("data-season"), "spring");
  assert.equal(await page.locator("[data-partner-screen]").getAttribute("data-season"), "spring");
  assert.match(await page.locator(".partner-season").innerText(), /春 · 花开 · 数码蛋/);
  const a = await frameOf(page, SIDE);
  await page.waitForTimeout(400);
  assert.notEqual(await frameOf(page, SIDE), a, "侧栏液晶屏在动");
  // 铺满屏幕：高屏每点 4px，画布与屏幕的差不超过一个点
  const fills = async (dot) => {
    const [c, s] = await page.evaluate((sel) => {
      const el = document.querySelector(sel), r = el.getBoundingClientRect(), p = el.closest("[data-partner-screen]").getBoundingClientRect();
      return [[r.width, r.height], [p.width, p.height]];
    }, SIDE);
    assert.ok(Number.isInteger(c[0] / dot) && Number.isInteger(c[1] / dot), `每点 ${dot}px：${c}`);
    assert.ok(s[0] - c[0] < dot && s[1] - c[1] < dot, `铺满屏幕：画布 ${c}，屏幕 ${s}`);
  };
  await fills(4);
  await page.setViewportSize({ width: 1440, height: 900 }); // 矮屏：侧栏屏压到 60px，每点 3px
  await page.waitForTimeout(300);
  await fills(3);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.waitForTimeout(300);
  await fills(4);
  console.log("PASS 侧栏液晶屏：两种屏高都整数点距铺满、动画运行、春季起始");

  // 复制成功：数据像素飞向伙伴屏，然后移除
  await page.getByRole("button", { name: /查看 把模糊想法/ }).click();
  await page.getByRole("button", { name: "复制全文", exact: true }).click();
  await page.locator(".data-bit").first().waitFor({ state: "attached" });
  assert.ok((await page.locator(".data-bit").count()) >= 1);
  await page.locator(".data-bit").first().waitFor({ state: "detached", timeout: 3000 });
  console.log("PASS 复制成功时数据像素飞向伙伴屏并自动移除");

  // Codex 83 建议①：复制期间焦点被移走，数据像素仍从复制按钮起飞
  const copyButton = page.getByRole("button", { name: "复制全文", exact: true });
  const btn = await copyButton.boundingBox();
  await copyButton.click();
  await page.evaluate(() => document.activeElement?.blur());
  await page.locator(".data-bit").first().waitFor({ state: "attached" });
  const startX = await page.evaluate(() => {
    const frame = document.querySelector(".data-bit").getAnimations()[0].effect.getKeyframes()[0].transform;
    return Number(/translate\(([-\d.]+)px/.exec(frame)[1]);
  });
  assert.ok(Math.abs(startX - (btn.x + btn.width / 2)) < 30, `起点 ${startX}，按钮中心 ${btn.x + btn.width / 2}`);
  await page.locator(".data-bit").first().waitFor({ state: "detached", timeout: 3000 });
  console.log("PASS 焦点移走后仍从复制按钮起飞");

  // Codex 83 建议②：动效中途出错，不留下残余像素节点，蛋照常接住
  await page.evaluate(() => {
    const original = Element.prototype.animate;
    let calls = 0;
    Element.prototype.animate = function (...args) {
      if (this.classList?.contains("data-bit") && ++calls === 3) throw new Error("模拟动效失败");
      return original.apply(this, args);
    };
  });
  await copyButton.click();
  await page.waitForTimeout(1500);
  assert.equal(await page.locator(".data-bit").count(), 0, "出错后不留残余像素");
  console.log("PASS 动效出错时清理干净");
  await page.keyboard.press("Escape");

  // 点侧栏伙伴：去往世界总览
  await page.getByRole("button", { name: /伙伴 数码蛋/ }).click();
  await page.waitForURL(/#home/);
  const stage = page.locator(STAGE);
  await stage.waitFor();
  assert.equal(await stage.getAttribute("data-motion"), "live");
  await mkdir("test-results", { recursive: true });
  await page.locator(".hero-stage").screenshot({ path: "test-results/partner-stage.png" });
  await page.locator("[data-partner-screen]").screenshot({ path: "test-results/partner-side.png" });
  assert.equal(await page.getByText(/进化为/).count(), 0, "首页不再显示进化线");
  await page.getByText(/已收录 \d+ 份你自己的资产/).waitFor();

  // 戳一下：按钮至少 44px，鼠标和键盘都能让蛋动
  const poke = page.getByRole("button", { name: "戳一下数码蛋", exact: true });
  const pokeBox = await poke.boundingBox();
  assert.ok(pokeBox.width >= 44 && pokeBox.height >= 44);
  await page.waitForTimeout(250);
  const before = await frameOf(page, STAGE);
  await poke.focus();
  await page.keyboard.press("Enter");
  await page.waitForTimeout(150);
  assert.notEqual(await frameOf(page, STAGE), before, "键盘戳一下蛋会动");
  assert.deepEqual(
    (await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze()).violations,
    [],
  );
  console.log("PASS 首页数码暴龙机：固定数码蛋、可戳、无进化线、axe");

  // 运行中切换“减少动态效果”立即生效
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.waitForTimeout(200);
  assert.equal(await page.locator(SIDE).getAttribute("data-motion"), "static");
  assert.equal(await page.locator(STAGE).getAttribute("data-motion"), "static");
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.waitForTimeout(200);
  assert.equal(await page.locator(SIDE).getAttribute("data-motion"), "live");
  console.log("PASS 运行中切换减少动态效果，两块屏立即跟随");

  // 伙伴屏被移出视口时（模拟窄屏侧栏收起）不飞数据像素，只让蛋接住
  await page.evaluate(() => { document.querySelector("[data-partner-screen]").style.transform = "translateX(-2000px)"; });
  await page.goto(app.url + "/#assets");
  await page.evaluate(() => { document.querySelector("[data-partner-screen]").style.transform = "translateX(-2000px)"; });
  await page.getByRole("button", { name: /查看 把模糊想法/ }).click();
  await page.getByRole("button", { name: "复制全文", exact: true }).click();
  await page.waitForTimeout(300);
  assert.equal(await page.locator(".data-bit").count(), 0, "屏幕不可见时不飞");
  await page.keyboard.press("Escape");
  console.log("PASS 伙伴屏不在视口时不飞数据像素");
  await context.close();

  // 减少动态效果：画一帧后完全静止，不启动循环
  const calm = await browser.newContext({ viewport: { width: 1440, height: 1000 }, reducedMotion: "reduce" });
  const still = await calm.newPage();
  still.on("pageerror", (e) => errors.push(e.message));
  await still.goto(app.url + "/#home");
  await still.locator(SIDE).waitFor();
  assert.equal(await still.locator(SIDE).getAttribute("data-motion"), "static");
  assert.equal(await still.locator(STAGE).getAttribute("data-motion"), "static");
  const s1 = await frameOf(still, SIDE);
  await still.waitForTimeout(600);
  assert.equal(await frameOf(still, SIDE), s1, "减少动态效果时画面静止");
  await calm.close();
  console.log("PASS 减少动态效果：两块液晶屏都只画一帧");

  assert.deepEqual(errors, []);
} finally {
  await browser.close();
  await app.close();
}
