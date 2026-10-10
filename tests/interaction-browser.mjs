// UI v13.2 操作手感：实体按键、复制传送、轻量新版本、数字滚动、液晶提示条、暴龙机 A/B 键。
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
const axe = async (page) =>
  assert.deepEqual(
    (await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze()).violations,
    [],
  );
try {
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
    permissions: ["clipboard-read", "clipboard-write"],
  });
  const page = await context.newPage();
  page.on("pageerror", (e) => errors.push(e.message));
  page.setDefaultTimeout(5000);
  await page.goto(app.url + "/#assets");
  await mkdir("test-results", { recursive: true });

  // 1. 实体按键：有底边厚度，按下沉 3px
  const create = page.getByRole("button", { name: "新建", exact: true });
  assert.match(await create.evaluate((el) => getComputedStyle(el).boxShadow), /0px 3px 0px/);
  const box = await create.boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.waitForTimeout(150);
  assert.match(await create.evaluate((el) => getComputedStyle(el).transform), /matrix\(1, 0, 0, 1, 0, 3\)/);
  await page.mouse.up();
  await page.keyboard.press("Escape");
  console.log("PASS 实体按键：底边厚度、按下沉 3px");

  // 2. 复制 = 传送：光带 → 液晶屏 TRANSFER OK → 火花，约 1.8 秒后复原
  await page.getByRole("button", { name: /查看 把模糊想法/ }).click();
  const copy = page.getByRole("button", { name: "复制全文", exact: true });
  await copy.click();
  await page.waitForFunction(() => document.querySelector("button.is-transferring, button.is-transferred"));
  await page.locator(".transfer-lcd canvas").waitFor({ state: "attached" });
  assert.ok((await page.locator(".transfer-spark").count()) > 0, "有火花");
  await page.locator("button.is-transferred").screenshot({ path: "test-results/transfer-ok.png" });
  await page.locator(".transfer-lcd").waitFor({ state: "detached", timeout: 4000 });
  assert.equal(await page.locator("button.is-transferring, button.is-transferred").count(), 0);
  assert.equal(await copy.innerText(), "复制全文", "按钮文字不受影响");
  console.log("PASS 复制传送：光带、TRANSFER OK、火花，结束后复原");

  // 5. 液晶提示条：成功提示带点阵对勾
  await page.locator(".toast.tone-success .pixel-check").waitFor({ state: "attached" });
  await page.locator(".toast.tone-success").screenshot({ path: "test-results/toast-lcd.png" });
  console.log("PASS 液晶提示条：成功提示为液晶样式与点阵对勾");
  await page.keyboard.press("Escape");

  // 3. 轻量新版本：新收录仍有全屏演出；保存新版本不弹全屏，详情里翻页并冒 NEW VERSION
  const revBefore = (await app.repository.read()).revision;
  const navCount = page.locator(".nav-item", { hasText: "资产仓库" }).locator(".nav-count");
  const countBefore = Number(await navCount.innerText());
  await page.getByRole("button", { name: "新建", exact: true }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Prompt", exact: true }).click();
  await page.getByLabel("名称", { exact: true }).fill("手感验收");
  await page.getByLabel("提示词全文").fill("第一版");
  await page.getByRole("button", { name: "保存资产", exact: true }).click();
  await page.locator(".evolution").waitFor();
  console.log("PASS 新收录仍播放全屏诞生演出");
  // 4. 数字滚动：侧栏计数更新；版本序号不再占用界面。
  await page.waitForTimeout(600); // 等数字滚动结束（约 0.45 秒）
  assert.equal(Number(await navCount.innerText()), countBefore + 1, "资产计数滚到新值");
  assert.ok((await app.repository.read()).revision > revBefore, "保存版本增加");
  assert.doesNotMatch(await page.locator('.save-state').innerText(), /REV|\d+/, '左下角只显示有用的保存状态');
  console.log("PASS 资产计数滚动，保存状态保留且隐藏技术序号");
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "查看 手感验收", exact: true }).click();
  await page.getByRole("button", { name: "编辑资产", exact: true }).click();
  await page.getByLabel("提示词全文").fill("第二版");
  await page.getByRole("button", { name: "保存新版本", exact: true }).click();
  await page.locator(".cover .version-tag", { hasText: "NEW VERSION" }).waitFor();
  assert.equal(await page.locator(".evolution").count(), 0, "保存新版本不弹全屏");
  await page.waitForTimeout(600);
  assert.equal((await page.locator(".detail-version").innerText()).replace(/\s/g, ""), "v2.0");
  console.log("PASS 轻量新版本：不弹全屏，封面 NEW VERSION，版本号翻到 v2.0");
  await page.keyboard.press("Escape");

  // 6. 暴龙机 A/B 键
  await page.goto(`${app.url}/?t=${Date.now()}#home`);
  const a = page.getByRole("button", { name: /^A 键/ });
  const b = page.getByRole("button", { name: /^B 键/ });
  for (const key of [a, b]) {
    const k = await key.boundingBox();
    assert.ok(k.width >= 44 && k.height >= 44);
  }
  await a.click();
  assert.equal(await a.getAttribute("aria-pressed"), "true");
  assert.equal(await page.locator(".digivice-lcd canvas").getAttribute("data-view"), "number");
  await page.locator(".dv-label", { hasText: "待处理" }).waitFor();
  await b.click();
  assert.equal(await b.getAttribute("aria-pressed"), "true");
  assert.equal(await page.locator(".digivice-art.lit").count(), 1);
  await page.locator(".dv-wrap").screenshot({ path: "test-results/digivice-keys.png" });
  await axe(page);
  await a.focus();
  await page.keyboard.press("Enter");
  assert.equal(await page.locator(".digivice-lcd canvas").getAttribute("data-view"), "egg");
  assert.equal(await page.locator(".dv-label").count(), 0);
  console.log("PASS 暴龙机 A 键切换待处理条数、B 键背光、键盘可用、44px、axe");
  await context.close();

  // 减少动态效果：传送只静态显示结果，不跑光带、不迸火花
  const calm = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
    reducedMotion: "reduce",
    permissions: ["clipboard-read", "clipboard-write"],
  });
  const still = await calm.newPage();
  still.on("pageerror", (e) => errors.push(e.message));
  await still.goto(app.url + "/#assets");
  await still.getByRole("button", { name: /查看 把模糊想法/ }).click();
  await still.getByRole("button", { name: "复制全文", exact: true }).click();
  await still.locator(".transfer-lcd").waitFor({ state: "attached" });
  assert.equal(await still.locator("button.is-transferring").count(), 0);
  assert.equal(await still.locator(".transfer-spark").count(), 0);
  await calm.close();
  console.log("PASS 减少动态效果：传送只静态显示结果");

  assert.deepEqual(errors, []);
} finally {
  await browser.close();
  await app.close();
}
