import {openManualRelay} from "./agents-v16-helpers.mjs";
import { createRequire } from "node:module";
import { writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
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
const context = await browser.newContext({
  viewport: { width: 1440, height: 1000 },
  permissions: ["clipboard-read", "clipboard-write"],
  reducedMotion: "reduce",
});
const page = await context.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
page.setDefaultTimeout(5000);
try {
  await page.goto(app.url + "/#projects");
  await page.getByRole("button", { name: "项目：作品集", exact:true }).click();
  await page.getByLabel("共同规则文件（可选）").fill("AGENTS.md");
  await page.getByRole("button", { name: "预览文件", exact: true }).click();
  await page.getByText("已读取 2 份来源", { exact: true }).waitFor();
  await page.getByRole("button", { name: "保存连接", exact: true }).click();
  await page.getByText("已连接 · 仅保存来源位置", { exact: true }).waitFor();
  await page
    .getByRole("button", { name: "复制项目交接包", exact: true })
    .click();
  await page.getByText("已复制 · 未发送给 Agent", { exact: true }).waitFor();
  const copied = await page.evaluate(() => navigator.clipboard.readText());
  assert.match(copied, /CURRENT.md/);
  assert.match(copied, /SHA-256/);
  assert.equal(copied.includes("上线作品集"), false);
  await mkdir("test-results", { recursive: true });
  await page.screenshot({ path: "test-results/context-desktop.png" });
  await page
    .locator(".project-context")
    .screenshot({ path: "test-results/context-component.png" });
  assert.deepEqual(
    (
      await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
        .analyze()
    ).violations,
    [],
  );
  console.log("PASS 预览→连接→真实复制；正文不进入交接包；axe");

  await page.reload();
  await page.getByRole("button", { name: "项目：作品集", exact:true }).click();
  assert.equal(
    await page.getByLabel("共同规则文件（可选）").inputValue(),
    "AGENTS.md",
  );
  assert.equal(
    await page
      .getByRole("button", { name: "复制项目交接包", exact: true })
      .isDisabled(),
    true,
  );
  await page.getByRole("button", { name: "预览文件", exact: true }).click();
  await page.getByText("已读取 2 份来源", { exact: true }).waitFor();
  await writeFile(
    join(app.root, "CURRENT.md"),
    "# 最新状态\n新的纠正：不部署\n",
  );
  await page
    .getByRole("button", { name: "复制项目交接包", exact: true })
    .click();
  await page
    .getByRole("alert")
    .filter({ hasText: /已变化/ })
    .waitFor();
  assert.equal(
    await page
      .getByRole("button", { name: "复制项目交接包", exact: true })
      .isDisabled(),
    true,
  );
  assert.equal(
    await page.evaluate(() => navigator.clipboard.readText()),
    copied,
  );
  await page.getByRole("button", { name: "预览文件", exact: true }).click();
  await page.getByText("已读取 2 份来源", { exact: true }).waitFor();
  console.log("PASS 重开保留来源；源文件变化阻断旧包且不改剪贴板");
  await page.evaluate(() =>
    Object.defineProperty(navigator.clipboard, "writeText", {
      configurable: true,
      value: async () => {
        throw new Error("denied");
      },
    }),
  );
  await page
    .getByRole("button", { name: "复制项目交接包", exact: true })
    .click();
  await page
    .getByRole("alert")
    .filter({ hasText: /复制失败/ })
    .waitFor();
  assert.match(
    await page.getByLabel("项目交接包文本").inputValue(),
    /本机项目交接包/,
  );
  assert.equal(
    await page.getByText("已复制 · 未发送给 Agent", { exact: true }).count(),
    0,
  );
  assert.deepEqual(
    (
      await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
        .analyze()
    ).violations,
    [],
  );
  for (const width of [320, 375, 393, 430]) {
    await page.setViewportSize({ width, height: 900 });await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
    assert.equal(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
      true,
    );
    const panel = page.locator(".project-context");
    assert.equal(
      await panel.evaluate((el) => el.scrollWidth <= el.clientWidth + 1),
      true,
    );
    assert.ok(
      (
        await page
          .getByRole("button", { name: "复制项目交接包", exact: true })
          .boundingBox()
      ).height >= 44,
    );
    await page.getByLabel("项目交接包文本").scrollIntoViewIfNeeded();
    await page.screenshot({ path: `test-results/context-${width}.png` });
  }
  console.log("PASS 剪贴板失败文本回退；axe；四档窄屏无溢出");
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.getByLabel("当前状态文件").fill("missing.md");
  assert.equal(await page.getByLabel("项目交接包文本").count(), 0);
  assert.equal(
    await page
      .getByRole("button", { name: "保存连接", exact: true })
      .isDisabled(),
    true,
  );
  await page.getByRole("button", { name: "预览文件", exact: true }).click();
  await page
    .getByRole("alert")
    .filter({ hasText: /不存在/ })
    .waitFor();
  assert.equal(
    await page.getByLabel("当前状态文件").inputValue(),
    "missing.md",
  );
  await page.getByLabel("当前状态文件").fill("CURRENT.md");
  await page.getByLabel("共同规则文件（可选）").fill("");
  await page.getByRole("button", { name: "预览文件", exact: true }).click();
  await page.getByText("已读取 1 份来源", { exact: true }).waitFor();
  await page.route("**/api/project-context/bind", (route) =>
    route.fulfill({
      status: 503,
      contentType: "application/json",
      body: JSON.stringify({ error: "模拟保存失败" }),
    }),
  );
  await page.getByRole("button", { name: "保存连接", exact: true }).click();
  await page
    .getByRole("alert")
    .filter({ hasText: /模拟保存失败/ })
    .waitFor();
  assert.equal(
    await page
      .getByRole("button", { name: "复制项目交接包", exact: true })
      .isDisabled(),
    true,
  );
  assert.equal(
    await page.getByLabel("当前状态文件").inputValue(),
    "CURRENT.md",
  );
  await page.unroute("**/api/project-context/bind");
  console.log("PASS 缺失与保存失败保留输入，不沿用旧包");
  await page.goto(app.url + "/#agents");
  await openManualRelay(page);
  await page
    .getByRole("button", { name: "从项目来源生成", exact: true })
    .click();
  await page.getByLabel("选择已发现项目").selectOption("project-context");
  assert.equal(
    await page.getByLabel("共同规则文件（可选）").inputValue(),
    "AGENTS.md",
  );
  await page.getByRole("button", { name: "预览文件", exact: true }).click();
  await page.getByText("已读取 2 份来源", { exact: true }).waitFor();
  await page.getByRole("button", { name: "断开连接", exact: true }).click();
  await page
    .getByText("选择已有状态文件，原文件保持不变。", { exact: true })
    .waitFor();
  await page.reload();
  await page.goto(app.url + "/#projects");
  await page.getByRole("button", { name: "项目：作品集", exact:true }).click();
  assert.equal(await page.getByLabel("共同规则文件（可选）").inputValue(), "");
  assert.equal(
    (await app.call("/workspace")).body.connections.contextBindings.length,
    0,
  );
  console.log("PASS Agent 接力复用同一连接；解绑跨入口刷新生效");
} finally {
  await browser.close();
  await app.close();
}
assert.deepEqual(errors, []);
