import { createRequire } from "node:module";
import { mkdir } from "node:fs/promises";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { fixture } from "./fixture.mjs";
import AxeBuilder from "@axe-core/playwright";
const require = createRequire(import.meta.url);
const { chromium } = require(
  process.env.PLAYWRIGHT_MODULE ||
    "/Users/nat/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright",
);
const app = await fixture();
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({
  viewport: { width: 1440, height: 1000 },
  reducedMotion: "reduce",
  permissions: ["clipboard-read", "clipboard-write"],
});
const page = await context.newPage(),
  errors = [];
page.on("pageerror", (e) => errors.push(e.message));
try {
  await page.goto(app.url + "/#assets");
  await page.locator(".asset-card").first().waitFor();
  // #93 资产仓库默认停在 Prompt 页；「设计的最后一公里」是 Skill，先切到 Skill 页签。
  const skillTab = () =>
    page
      .getByRole("group", { name: "资产类型" })
      .getByRole("button", { name: /^Skill/ })
      .click();
  await skillTab();
  await page
    .getByRole("button", { name: "查看 设计的最后一公里", exact: true })
    .click();
  await page
    .getByRole("button", { name: "复制本机安装口令", exact: true })
    .click();
  await page.getByText("口令已复制 · 未验证安装", { exact: true }).waitFor();
  const text = await page.evaluate(() => navigator.clipboard.readText());
  const url = text.match(
    /http:\/\/127\.0\.0\.1:\d+\/packages\/[a-f0-9]{64}\.zip/,
  )[0];
  const result = await fetch(url),
    bytes = new Uint8Array(await result.arrayBuffer());
  assert.equal(result.status, 200);
  assert.ok(text.includes(createHash("sha256").update(bytes).digest("hex")));
  await page.getByText(/本机有效链接/).click();
  await page.getByRole("button", { name: "刷新链接状态", exact: true }).click();
  await page.getByText(/下载请求 1 次/).waitFor();
  await mkdir("test-results", { recursive: true });
  await page.screenshot({
    path: "test-results/delivery-desktop.png",
  });
  await page
    .locator(".skill-delivery")
    .screenshot({ path: "test-results/delivery-component.png" });
  assert.deepEqual(
    (
      await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
        .analyze()
    ).violations,
    [],
  );
  await page.reload();
  await skillTab(); // #93 刷新后回到默认 Prompt 页，先切到 Skill 页签
  await page
    .getByRole("button", { name: "查看 设计的最后一公里", exact: true })
    .click();
  await page.getByText(/本机有效链接/).click();
  await page.getByRole("button", { name: "撤销链接", exact: true }).click();
  assert.equal((await fetch(url)).status, 410);
  console.log("PASS 复制→取回同版 ZIP→刷新管理→撤销");
  await page.route("**/api/deliveries/copied", async (route) => {
    const input = JSON.parse(route.request().postData());
    const response = await fetch(app.url + "/api/deliveries/revoke", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-workbench-token": route.request().headers()["x-workbench-token"],
      },
      body: JSON.stringify({ id: input.id }),
    });
    assert.equal(response.status, 200);
    await route.fulfill({
      status: 410,
      contentType: "application/json",
      body: JSON.stringify({ error: "链接已失效" }),
    });
  });
  await page
    .getByRole("button", { name: "复制本机安装口令", exact: true })
    .click();
  await page
    .getByText("链接已失效，请重新复制", { exact: true })
    .waitFor({ timeout: 3000 });
  await page.unroute("**/api/deliveries/copied");
  console.log("PASS 新链接被并行撤销后回读纠正状态");
  await page.evaluate(() =>
    Object.defineProperty(navigator.clipboard, "writeText", {
      configurable: true,
      value: async () => {
        throw new Error("denied");
      },
    }),
  );
  await page
    .getByRole("button", { name: "复制本机安装口令", exact: true })
    .click();
  await page
    .getByRole("alert")
    .getByText(/复制失败/)
    .waitFor();
  assert.match(await page.getByLabel("安装口令文本").inputValue(), /packages/);
  assert.equal(
    await page.getByText("口令已复制 · 未验证安装", { exact: true }).count(),
    0,
  );
  console.log("PASS 剪贴板拒绝保留可选文本，不伪报复制");
  assert.deepEqual(
    (
      await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
        .analyze()
    ).violations,
    [],
  );
  for (const width of [320, 375, 393, 430]) {
    await page.setViewportSize({ width, height: 900 });
    assert.equal(
      await page.evaluate(
        () => document.documentElement.scrollWidth > innerWidth,
      ),
      false,
    );
    const button = await page
      .getByRole("button", { name: "复制本机安装口令", exact: true })
      .boundingBox();
    assert.ok(
      button.height >= 44 && button.x >= 0 && button.x + button.width <= width,
    );
    await page.screenshot({
      path: `test-results/delivery-${width}.png`,
    });
  }
  console.log("PASS 四种窄屏，复制失败文本可操作");
  await page.route("**/api/deliveries", (route) =>
    route.fulfill({
      status: 503,
      contentType: "application/json",
      body: JSON.stringify({ error: "测试生成失败" }),
    }),
  );
  await page
    .getByRole("button", { name: "复制本机安装口令", exact: true })
    .click();
  await page
    .getByRole("alert")
    .getByText(/测试生成失败/)
    .waitFor();
  assert.equal(await page.getByLabel("安装口令文本").count(), 0);
  await page
    .getByRole("button", { name: "导出完整 Skill 包", exact: true })
    .waitFor();
  console.log("PASS 生成失败不复制旧链接，保留独立 ZIP 出口");
  assert.deepEqual(errors, []);
} finally {
  await browser.close();
  await app.close();
}
