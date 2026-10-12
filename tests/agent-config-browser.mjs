import {openAgentInventory,agentInventoryEntry} from "./agents-v16-helpers.mjs";
import { createRequire } from "node:module";
import assert from "node:assert/strict";
import { readFile, mkdir, appendFile } from "node:fs/promises";
import AxeBuilder from "@axe-core/playwright";
import { configFixture, configText } from "./config-fixture.mjs";
const require = createRequire(import.meta.url);
const { chromium } = require(
  process.env.PLAYWRIGHT_MODULE ||
    "/Users/nat/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright",
);
const app = await configFixture();
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({
  viewport: { width: 1440, height: 1000 },
  reducedMotion: "reduce",
});
const page = await context.newPage();
await page.addInitScript(() => {
  window.__successFeedback = 0;
  addEventListener("guiji:data-caught", () => window.__successFeedback++);
});
page.setDefaultTimeout(5000);
const calls = [];
let flows = 0,
  axes = 0;
const audit = async () => {
  assert.deepEqual(
    (
      await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
        .analyze()
    ).violations,
    [],
  );
  axes++;
};
const open = async () => {
  await page.goto(app.url + "/#agents");
  await page.reload();
  await openAgentInventory(page);
  await page.getByRole("button", { name: "配置管理", exact: true }).click();
};
const inspect = async () => {
  await page.getByRole("button", { name: /^(重新)?读取配置$/ }).click();
  await page.getByRole("combobox", { name: "终端动画", exact: true }).waitFor();
  await page
    .getByRole("button", { name: "重新读取配置", exact: true })
    .waitFor();
};
const makePreview = async () => {
  await inspect();
  await page
    .getByRole("combobox", { name: "终端动画", exact: true })
    .selectOption("false");
  await page
    .getByRole("button", { name: "预览 终端动画", exact: true })
    .click();
  await page.getByRole("region", { name: "配置差异", exact: true }).waitFor();
};
const confirm = async () => {
  await page
    .getByRole("checkbox", { name: "确认修改此文件；不会自动重启 Agent" })
    .check();
  await page.getByRole("button", { name: "确认应用", exact: true }).click();
};
page.on("request", (r) => {
  if (r.url().includes("/api/agent-config/"))
    calls.push(new URL(r.url()).pathname);
});
try {
  await page.goto(app.url + "/#agents");
  await openAgentInventory(page);
  await page.getByRole("button", { name: "配置管理", exact: true }).click();
  assert.deepEqual(calls, [], "展开不能自动读取配置");
  await page.getByRole("button", { name: "读取配置", exact: true }).click();
  await page.getByRole("combobox", { name: "终端动画", exact: true }).waitFor();
  assert.ok(
    !(await page.locator("body").innerText()).includes(
      "PRIVATE_CONFIG_SENTINEL",
    ),
  );
  await page
    .getByRole("combobox", { name: "终端动画", exact: true })
    .selectOption("false");
  await page
    .getByRole("button", { name: "预览 终端动画", exact: true })
    .click();
  const preview = page.getByRole("region", { name: "配置差异", exact: true });
  await preview.waitFor();
  assert.equal(await readFile(app.configPath, "utf8"), configText);
  assert.equal(
    await page
      .getByRole("button", { name: "确认应用", exact: true })
      .isDisabled(),
    true,
  );
  await page
    .getByRole("checkbox", { name: "确认修改此文件；不会自动重启 Agent" })
    .check();
  await page.getByRole("button", { name: "确认应用", exact: true }).click();
  await page
    .getByRole("region", { name: "配置操作结果", exact: true })
    .waitFor();
  assert.equal(
    await readFile(app.configPath, "utf8"),
    configText.replace("animations = true", "animations = false"),
  );
  await page.getByRole("button", { name: "变更记录", exact: true }).click();
  await page.getByRole("button", { name: "预览恢复", exact: true }).click();
  await page
    .getByRole("checkbox", { name: "确认修改此文件；不会自动重启 Agent" })
    .check();
  await page.getByRole("button", { name: "确认恢复", exact: true }).click();
  await page
    .getByRole("region", { name: "配置操作结果", exact: true })
    .waitFor();
  assert.equal(await readFile(app.configPath, "utf8"), configText);
  assert.match(
    await page
      .getByRole("region", { name: "配置操作结果", exact: true })
      .innerText(),
    /符合恢复后内容/,
  );
  assert.match(
    await page
      .getByRole("region", { name: "配置操作结果", exact: true })
      .innerText(),
    /tui.animations/,
  );
  flows++;
  await audit();
  await open();
  await inspect();
  await app.newVersion();
  await inspect();
  assert.equal(
    await page
      .getByRole("combobox", { name: "终端动画", exact: true })
      .isDisabled(),
    false,
    "跨客户端主库更新后，重新读取应同步主库版本并恢复可编辑",
  );
  flows++;
  await page.route("**/api/agent-config/inspect", (r) =>
    r.fulfill({
      status: 503,
      contentType: "application/json",
      body: JSON.stringify({ error: "合成读取失败" }),
    }),
  );
  await page.getByRole("button", { name: "重新读取配置", exact: true }).click();
  await page.getByRole("alert").filter({ hasText: "合成读取失败" }).waitFor();
  assert.equal(
    await page
      .getByRole("combobox", { name: "终端动画", exact: true })
      .isDisabled(),
    true,
    "重新读取失败不能把旧读数当成有效配置",
  );
  await page.unroute("**/api/agent-config/inspect");
  flows++;
  await makePreview();
  assert.equal(
    await preview.evaluate((el) => el === document.activeElement),
    true,
  );
  await page.route("**/api/agent-config/apply", async (r) => {
    await r.fetch();
    await r.abort("failed");
  });
  await confirm();
  await page
    .getByRole("button", { name: "核对本次操作", exact: true })
    .waitFor();
  assert.equal(
    await page
      .getByRole("button", { name: "确认应用", exact: true })
      .isDisabled(),
    true,
  );
  assert.ok(
    !(await preview.innerText()).includes("尚未写入"),
    "响应丢失不能宣称尚未写入",
  );
  const attempts = calls.filter((c) => c.endsWith("/apply")).length;
  await page.unroute("**/api/agent-config/apply");
  assert.equal(
    await page
      .getByRole("button", { name: "重新读取配置", exact: true })
      .isDisabled(),
    true,
    "未决操作不能被重新读取或另一预览绕过",
  );
  await page.route("**/api/agent-config/check", (r) =>
    r.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        id: "other-operation",
        status: "unknown",
        kind: "apply",
        key: "tui.animations",
        checkedAt: new Date().toISOString(),
        message: "合成无法核验",
      }),
    }),
  );
  await page.getByRole("button", { name: "核对本次操作", exact: true }).click();
  await page.getByText("合成无法核验", { exact: true }).waitFor();
  assert.equal(
    await page
      .getByRole("button", { name: "读取配置", exact: true })
      .isDisabled(),
    true,
    "unknown或别的操作结果不能清除未决锁",
  );
  await page.unroute("**/api/agent-config/check");
  await page.reload();
  await openAgentInventory(page);
  await page.getByRole("button", { name: "配置管理", exact: true }).click();
  await page
    .getByRole("button", { name: "核对本次操作", exact: true })
    .waitFor();
  assert.equal(
    await page
      .getByRole("button", { name: "读取配置", exact: true })
      .isDisabled(),
    true,
    "重开仍保留未决操作ID与锁",
  );
  await page.getByRole("button", { name: "核对本次操作", exact: true }).click();
  await page
    .getByRole("heading", { name: "符合修改后内容", exact: true })
    .waitFor();
  assert.equal(calls.filter((c) => c.endsWith("/apply")).length, attempts);
  await audit();
  flows++;
  await page.reload();
  await openAgentInventory(page);
  await page.getByRole("button", { name: "配置管理", exact: true }).click();
  await page.getByRole("button", { name: "变更记录", exact: true }).click();
  const history = page.getByRole("region", {
    name: "配置变更记录",
    exact: true,
  });
  await history.waitFor();
  assert.match(await history.innerText(), /当前文件待核对/);
  await history.getByRole("button", { name: "核对文件", exact: true }).first().click();
  await page.getByRole("heading", { name: "符合修改后内容", exact: true }).waitFor();
  assert.equal(await page.evaluate(() => window.__successFeedback), 0, "历史文件核对不播放本次保存成功反馈");
  await page.getByRole("button", { name: "变更记录", exact: true }).click();
  await history.waitFor();
  await history
    .getByRole("button", { name: "预览恢复", exact: true })
    .first()
    .click();
  await page
    .getByRole("checkbox", { name: "确认修改此文件；不会自动重启 Agent" })
    .check();
  await page.getByRole("button", { name: "确认恢复", exact: true }).click();
  await page
    .getByRole("region", { name: "配置操作结果", exact: true })
    .waitFor();
  assert.equal(await readFile(app.configPath, "utf8"), configText);
  flows++;
  await makePreview();
  app.advance(300001);
  await confirm();
  await page.getByRole("alert").filter({ hasText: "过期" }).waitFor();
  assert.equal(await readFile(app.configPath, "utf8"), configText);
  assert.equal(
    await page
      .getByRole("button", { name: "核对本次操作", exact: true })
      .count(),
    0,
    "明确未开始应解锁，不进入check404死循环",
  );
  await inspect();
  assert.equal(
    await page
      .getByRole("combobox", { name: "终端动画", exact: true })
      .isDisabled(),
    false,
  );
  flows++;
  await open();
  await makePreview();
  await appendFile(app.configPath, "# 外部改动\n");
  await confirm();
  await page.getByRole("alert").filter({ hasText: "文件已变化" }).waitFor();
  assert.equal(
    await readFile(app.configPath, "utf8"),
    configText + "# 外部改动\n",
  );
  flows++;
  await open();
  await inspect();
  await audit();
  await mkdir("test-results", { recursive: true });
  await page.screenshot({
    path: "test-results/agent-config-overview-1440.png",
  });
  await makePreview();
  await audit();
  await page.screenshot({ path: "test-results/agent-config-preview-1440.png" });
  await preview.screenshot({
    path: "test-results/agent-config-preview-crop.png",
  });
  for (const width of [320, 375, 393, 430]) {
    await page.setViewportSize({ width, height: 852 });
    await preview.scrollIntoViewIfNeeded();
    assert.equal(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
      true,
    );
    const geometry = await preview.evaluate((el) => ({
      scroll: el.scrollWidth,
      width: el.clientWidth,
      controls: [...el.querySelectorAll("button")].map((n) => {
        const b = n.getBoundingClientRect();
        return { width: b.width, height: b.height };
      }),
    }));
    assert.ok(geometry.scroll <= geometry.width + 1);
    assert.ok(geometry.controls.every((b) => b.width >= 44 && b.height >= 44));
    const confirmation = await preview
      .locator(".config-confirm")
      .evaluate((el) => {
        const input = el.querySelector("input").getBoundingClientRect(),
          label = el.querySelector("span").getBoundingClientRect();
        return {
          aligned: Math.abs(input.y - label.y) <= 5,
          inputWidth: input.width,
        };
      });
    assert.ok(
      confirmation.aligned && confirmation.inputWidth <= 22,
      "确认框应保持独立尺寸并与文本首行对齐",
    );
    await audit();
    await page.screenshot({
      path: `test-results/agent-config-preview-${width}.png`,
    });
    flows++;
  }
  await page.evaluate(() => (document.documentElement.style.fontSize = "150%"));
  assert.equal(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
    true,
  );
  flows++;
  await page.evaluate(() => (document.documentElement.style.fontSize = ""));
  await page.getByRole("button", { name: "返回配置", exact: true }).click();
  let release, handled;
  const gate = new Promise((r) => (release = r));
  const finished = new Promise((r) => (handled = r));
  await page.route("**/api/agent-config/inspect", async (r) => {
    const response = await r.fetch();
    await gate;
    await r.fulfill({ response });
    handled();
  });
  await page.getByRole("button", { name: "重新读取配置", exact: true }).click();
  await page.getByRole("button", { name: "收起配置", exact: true }).click();
  release();
  await finished;
  await page.unroute("**/api/agent-config/inspect");
  await page.getByRole("button", { name: "配置管理", exact: true }).click();
  assert.equal(
    await page.getByRole("combobox", { name: "终端动画", exact: true }).count(),
    0,
  );
  flows++;
  console.log(
    `PASS config browser: ${flows} flows, ${axes} axe scans, explicit inspect/apply/restore, read failure, lost response, reload, expiry, external edits, responsive, large text and closed late response`,
  );
} finally {
  await browser.close();
  await app.close();
}
