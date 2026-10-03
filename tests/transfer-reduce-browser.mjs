// R87-F1（Codex 复核 115）：传送演出途中开启“减少动态效果”，同一次演出要立即响应：
// 停止打字与火花，保持清楚的静态成功反馈（对勾与完整 TRANSFER OK），正常收尾，复制照常计次。
// 两个时点：光带阶段（液晶屏出现前）与打字阶段。依据 PRD“系统开启减少动态效果时全部关闭”。
import { createRequire } from "node:module";
import assert from "node:assert/strict";
import { contextFixture } from "./context-fixture.mjs";
const { chromium } = createRequire(import.meta.url)(
  process.env.PLAYWRIGHT_MODULE ||
    "/Users/nat/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright",
);
const app = await contextFixture();
const browser = await chromium.launch({ headless: true });
const errors = [];
const ok = (s) => console.log("PASS", s);
const ASSET = /查看 把模糊想法/;
const LABEL = "复制全文";

// 画布当前帧的指纹，以及末尾 K 所在列（点阵第 70–74 列）是否有实心像素。
const frame = (page) =>
  page.locator(".transfer-lcd canvas").evaluate((canvas) => {
    const ctx = canvas.getContext("2d");
    const { width, height } = canvas;
    const data = ctx.getImageData(0, 0, width, height).data;
    const dot = width / (7 + 3 + 11 * 6 + 4);
    let k = 0;
    for (let y = 0; y < height; y++)
      for (let x = Math.floor(70 * dot); x < Math.ceil(75 * dot); x++) if (data[(y * width + x) * 4 + 3] > 200) k++;
    let hash = 0;
    for (let i = 3; i < data.length; i += 4) hash = (hash * 31 + data[i]) >>> 0;
    return { hash, k };
  });
const runningSparks = (page) =>
  page.evaluate(() =>
    [...document.querySelectorAll(".transfer-spark")].filter((s) =>
      s.getAnimations().some((a) => a.playState === "running"),
    ).length,
  );

async function scenario(name, beforeSwitch) {
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
    permissions: ["clipboard-read", "clipboard-write"],
    reducedMotion: "no-preference",
  });
  const page = await context.newPage();
  page.setDefaultTimeout(5000);
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(app.url + "/#assets");
  await page.getByRole("button", { name: ASSET }).click();
  const count = page.getByTestId("usage-count");
  const before = Number((await count.innerText()).match(/已使用 (\d+) 次/)?.[1] || 0);
  const button = page.getByRole("button", { name: LABEL, exact: true });
  await button.click();
  await beforeSwitch(page, button);
  await page.emulateMedia({ reducedMotion: "reduce" });
  // 偏好变化后最多一帧内响应：液晶屏出现、无运行中的火花、画面不再变化、末尾 K 已画出。
  await page.locator(".transfer-lcd canvas").waitFor({ state: "attached", timeout: 300 });
  await page.waitForTimeout(80);
  const a = await frame(page);
  await page.waitForTimeout(200);
  const b = await frame(page);
  assert.equal(await runningSparks(page), 0, `${name}：火花应停止`);
  assert.equal(a.hash, b.hash, `${name}：静态画面不应再变化`);
  assert.ok(b.k > 0, `${name}：TRANSFER OK 应完整显示（末尾 K 有像素）`);
  assert.equal(await button.evaluate((el) => el.classList.contains("is-transferring")), false, `${name}：光带应结束`);
  await page.locator(".transfer-lcd").waitFor({ state: "detached", timeout: 3000 });
  assert.equal(await button.evaluate((el) => el.matches(".is-transferring, .is-transferred")), false, `${name}：状态类应收尾`);
  assert.ok((await page.evaluate(() => navigator.clipboard.readText())).length > 0, `${name}：复制成功`);
  await count.getByText(new RegExp(`已使用 ${before + 1} 次`)).waitFor();
  // 收尾后可再次演出（减少动态效果下直接静态显示）。
  await button.click();
  await page.locator(".transfer-lcd canvas").waitFor({ state: "attached" });
  await page.locator(".transfer-lcd").waitFor({ state: "detached", timeout: 3000 });
  await context.close();
  ok(`${name}：开启减少动态效果后立即停止打字与火花，静态显示完整结果，正常收尾并计次`);
}

try {
  await scenario("光带阶段", async (page, button) => {
    await page.locator("button.is-transferring").waitFor({ timeout: 400 });
    assert.equal(await page.locator(".transfer-lcd").count(), 0);
  });
  await scenario("打字阶段", async (page) => {
    await page.locator(".transfer-lcd canvas").waitFor({ state: "attached" });
    await page.waitForTimeout(90);
    assert.ok((await runningSparks(page)) > 0, "打字阶段应有火花在运行");
  });
  assert.deepEqual(errors, []);
  ok("无页面脚本错误");
} finally {
  await browser.close();
  await app.close();
}
