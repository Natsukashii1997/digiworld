import {openAgentInventory,agentInventoryEntry} from "./agents-v16-helpers.mjs";
import { createRequire } from "node:module";
import { mkdir } from "node:fs/promises";
import assert from "node:assert/strict";
import AxeBuilder from "@axe-core/playwright";
import { targetFixture } from "./target-fixture.mjs";

const require = createRequire(import.meta.url);
const { chromium } = require(
  process.env.PLAYWRIGHT_MODULE ||
    "/Users/nat/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright",
);
const app = await targetFixture();
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({
  viewport: { width: 1440, height: 1000 },
  reducedMotion: "reduce",
});
const page = await context.newPage();
page.setDefaultTimeout(5000);
const errors = [];
page.on("pageerror", (error) => errors.push(error.message));
const panel = page.getByRole("region", { name: "管理目标", exact: true });
const inspect = () =>
  panel.getByRole("button", { name: "检查版本与目标", exact: true }).click();
const target = (name) => panel.getByRole("region", { name, exact: true });
const programSelect = () => panel.getByRole("combobox", { name: /^程序入口/ });
const homeSelect = () =>
  panel.getByRole("combobox", { name: /^Home \/ Profile/ });
const save = () =>
  panel.getByRole("button", { name: "保存目标", exact: true }).click();
const fill = async (
  label,
  programId = "fixture-cli",
  homeId = "fixture-default",
) => {
  await panel.getByLabel("目标名称", { exact: true }).fill(label);
  await programSelect().selectOption(programId);
  await homeSelect().selectOption(homeId);
};
const audit = async (name) => {
  const violations = (
    await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
      .analyze()
  ).violations;
  assert.deepEqual(violations, [], `axe: ${name}`);
};
const open = async () => {
  await page.goto(app.url + "/#agents");
  await openAgentInventory(page);
  await panel.waitFor();
};
try {
  await open();
  const before = await app.call("/workspace");
  await inspect();
  await panel.getByRole("button", { name: "添加目标", exact: true }).click();
  assert.equal(
    await panel.getByRole("combobox", { name: /^程序入口/ }).inputValue(),
    "",
  );
  assert.equal(
    await panel
      .getByRole("combobox", { name: /^Home \/ Profile/ })
      .inputValue(),
    "",
  );
  await panel.getByLabel("目标名称", { exact: true }).fill("个人 Codex");
  await panel
    .getByRole("combobox", { name: /^程序入口/ })
    .selectOption("fixture-cli");
  await panel
    .getByRole("combobox", { name: /^Home \/ Profile/ })
    .selectOption("fixture-default");
  const selectedProgram = panel
    .getByRole("form", { name: "目标编辑", exact: true })
    .locator("code")
    .filter({ hasText: app.programs[0].path });
  const selectedHome = panel
    .getByRole("form", { name: "目标编辑", exact: true })
    .locator("code")
    .filter({ hasText: app.home });
  assert.equal(
    await selectedProgram.count(),
    1,
    "保存前必须展示完整程序位置，不能只有截断的 option",
  );
  assert.equal(
    await selectedHome.count(),
    1,
    "保存前必须展示完整 Home 位置，不能只有截断的 option",
  );
  assert.equal(await selectedProgram.isVisible(), true);
  assert.equal(await selectedHome.isVisible(), true);
  assert.equal(await selectedProgram.innerText(), app.programs[0].path);
  assert.equal(await selectedHome.innerText(), app.home);
  await panel.getByRole("button", { name: "保存目标", exact: true }).click();
  await target("个人 Codex").waitFor();
  const saved = await app.call("/workspace");
  assert.equal(saved.connections.agentTargets.length, 1);
  assert.equal(
    saved.connections.agentTargets[0].program.path,
    app.programs[0].path,
  );
  assert.equal(saved.connections.agentTargets[0].home.path, app.home);
  assert.deepEqual(saved.assets, before.assets);
  assert.equal(saved.connections.agentTargets[0].running, undefined);
  assert.equal(await app.sourceUnchanged(), true);
  await page.reload();
  await openAgentInventory(page);
  await target("个人 Codex").waitFor();
  assert.match(await target("个人 Codex").innerText(), /待核对/);
  assert.deepEqual(errors, []);
  console.log(
    "PASS 明确选择入口和 Home→保存→重开仍可见；未核对不冒充运行，源配置不变",
  );

  await inspect();
  await target("个人 Codex").getByText("路径可用", { exact: true }).waitFor();
  const programRegion = page.getByRole("region", {
    name: "程序入口",
    exact: true,
  });
  assert.match(await programRegion.innerText(), /安装包 0.154.0/);
  await programRegion.locator("details").nth(0).locator("summary").click();
  assert.match(await programRegion.innerText(), /依据：.*package.json/);
  await programRegion.locator("details").nth(1).locator("summary").click();
  assert.match(await programRegion.innerText(), /无可核验安装元数据/);
  assert.equal((await programRegion.innerText()).includes("运行版本"), false);
  await target("个人 Codex")
    .getByRole("button", { name: "编辑目标", exact: true })
    .click();
  assert.equal(
    await panel
      .getByLabel("目标名称", { exact: true })
      .evaluate((el) => el === document.activeElement),
    true,
  );
  assert.equal(await programSelect().inputValue(), "fixture-cli");
  assert.equal(await homeSelect().inputValue(), "fixture-default");
  assert.equal(
    await homeSelect().locator('option[value="fixture-shared"]').count(),
    0,
  );
  assert.equal(
    await homeSelect()
      .locator('option[value="fixture-missing"]')
      .evaluate((el) => el.disabled),
    true,
  );
  await fill("工作 Codex", "fixture-app", "fixture-profile");
  await save();
  await target("工作 Codex").waitFor();
  const changed = (await app.call("/workspace")).connections.agentTargets[0];
  assert.equal(changed.id, saved.connections.agentTargets[0].id);
  assert.equal(changed.home.path, app.profile);
  assert.equal(changed.program.path, app.programs[1].path);
  await panel.getByRole("button", { name: "添加目标", exact: true }).click();
  await fill("重复目标", "fixture-app", "fixture-profile");
  await save();
  await panel
    .getByRole("alert")
    .filter({ hasText: /另一个目标/ })
    .waitFor();
  assert.equal(
    await panel.getByLabel("目标名称", { exact: true }).inputValue(),
    "重复目标",
  );
  assert.equal(
    (await app.call("/workspace")).connections.agentTargets.length,
    1,
  );
  assert.equal(
    await panel
      .getByRole("button", { name: "保存目标", exact: true })
      .isDisabled(),
    true,
  );
  await panel.getByRole("button", { name: "取消编辑", exact: true }).click();
  await inspect();
  console.log(
    "PASS 安装包版本与未知证据分开；改名/换入口/Profile 保持身份，重复绑定拒绝并保留草稿",
  );

  await target("工作 Codex")
    .getByRole("button", { name: "编辑目标", exact: true })
    .click();
  await panel.getByLabel("目标名称", { exact: true }).fill("等待恢复的草稿");
  const beforeFailure = await app.call("/workspace");
  app.setMode("failure");
  await inspect();
  await panel
    .getByRole("alert")
    .filter({ hasText: /暂不可读/ })
    .waitFor();
  assert.equal(
    await panel.getByLabel("目标名称", { exact: true }).inputValue(),
    "等待恢复的草稿",
  );
  assert.equal(await homeSelect().inputValue(), "fixture-profile");
  assert.equal(await homeSelect().isDisabled(), true);
  assert.equal(
    await panel
      .getByRole("button", { name: "保存目标", exact: true })
      .isDisabled(),
    true,
  );
  assert.match(await target("工作 Codex").innerText(), /待核对/);
  assert.deepEqual(await app.call("/workspace"), beforeFailure);
  await mkdir("test-results", { recursive: true });
  await page.setViewportSize({ width: 320, height: 900 });
  await panel.getByRole("alert").scrollIntoViewIfNeeded();
  await page.locator(".toast").waitFor({ state: "hidden", timeout: 6000 });
  await page.screenshot({ path: "test-results/agent-targets-failure-320.png" });
  await audit("directory failure");
  app.setMode("partial");
  await inspect();
  await panel
    .getByRole("alert")
    .filter({ hasText: /枚举失败/ })
    .waitFor();
  assert.equal(await homeSelect().inputValue(), "fixture-profile");
  assert.equal(
    await homeSelect().locator('option[value="fixture-profile"]').count(),
    1,
  );
  assert.equal(
    await panel
      .getByRole("button", { name: "保存目标", exact: true })
      .isDisabled(),
    true,
  );
  for (const width of [320, 375, 393, 430]) {
    await page.setViewportSize({ width, height: 900 });
    const checkButton = panel.getByRole("button", {
      name: "检查版本与目标",
      exact: true,
    });
    await checkButton.scrollIntoViewIfNeeded();
    const drawerMetrics = await page
      .getByRole("dialog", { name: "Codex", exact: true })
      .evaluate((el) => ({
        clientWidth: el.clientWidth,
        scrollWidth: el.scrollWidth,
        scrollLeft: el.scrollLeft,
        left: el.getBoundingClientRect().left,
        right: el.getBoundingClientRect().right,
      }));
    assert.ok(
      drawerMetrics.scrollWidth <= drawerMetrics.clientWidth,
      `partial-error drawer overflow at ${width}: ${JSON.stringify(drawerMetrics)}`,
    );
    const buttonBox = await checkButton.boundingBox();
    assert.ok(
      buttonBox &&
        buttonBox.x >= -0.5 &&
        buttonBox.x + buttonBox.width <= width + 0.5 &&
        buttonBox.y >= -0.5 &&
        buttonBox.y + buttonBox.height <= 900.5,
      `inspection button outside viewport at ${width}: ${JSON.stringify(buttonBox)}`,
    );
    const errorMetrics = await panel.getByRole("alert").evaluate((el) => ({
      clientWidth: el.clientWidth,
      scrollWidth: el.scrollWidth,
      left: el.getBoundingClientRect().left,
      right: el.getBoundingClientRect().right,
    }));
    assert.ok(
      errorMetrics.scrollWidth <= errorMetrics.clientWidth &&
        errorMetrics.left >= drawerMetrics.left - 0.5 &&
        errorMetrics.right <= drawerMetrics.right + 0.5,
      `partial-error text clipped outside drawer at ${width}: ${JSON.stringify(errorMetrics)}`,
    );
    if (width === 320)
      await page.screenshot({
        path: "test-results/agent-targets-partial-320.png",
      });
  }
  await page.setViewportSize({ width: 320, height: 900 });
  await audit("partial inspection");
  app.setMode("success");
  await inspect();
  await panel.getByRole("button", { name: "保存目标", exact: true }).waitFor();
  await save();
  await target("等待恢复的草稿").waitFor();
  await page.setViewportSize({ width: 1440, height: 1000 });
  console.log(
    "PASS 目录 HTTP 失败与部分读取保留原候选和草稿、禁用保存；完整刷新后恢复，2 态 axe 无违规",
  );

  await target("等待恢复的草稿")
    .getByRole("button", { name: "编辑目标", exact: true })
    .click();
  await panel.getByLabel("目标名称", { exact: true }).fill("过期后恢复");
  app.advance(300001);
  await save();
  await panel.getByRole("alert").filter({ hasText: /过期/ }).waitFor();
  assert.equal(
    await panel.getByLabel("目标名称", { exact: true }).inputValue(),
    "过期后恢复",
  );
  assert.equal(
    (await app.call("/workspace")).connections.agentTargets[0].label,
    "等待恢复的草稿",
  );
  await inspect();
  await save();
  await target("过期后恢复").waitFor();
  await target("过期后恢复")
    .getByRole("button", { name: "编辑目标", exact: true })
    .click();
  await panel.getByLabel("目标名称", { exact: true }).fill("并发后恢复");
  await app.call("/scan/agents", {});
  await save();
  await panel
    .getByRole("alert")
    .filter({ hasText: /更新|版本|刷新/ })
    .waitFor();
  assert.equal(
    await panel.getByLabel("目标名称", { exact: true }).inputValue(),
    "并发后恢复",
  );
  assert.equal(
    (await app.call("/workspace")).connections.agentTargets[0].label,
    "过期后恢复",
  );
  await inspect();
  await save();
  await target("并发后恢复").waitFor();
  console.log(
    "PASS 服务端过期与真实主库并发冲突均拒绝旧提交、保留草稿；检查刷新主库后可恢复",
  );

  await target("并发后恢复")
    .getByRole("button", { name: "编辑目标", exact: true })
    .click();
  await panel.getByLabel("目标名称", { exact: true }).fill("保存失败草稿");
  await page.route(
    "**/api/agent-targets/save",
    (route) =>
      route.fulfill({
        status: 503,
        contentType: "application/json",
        body: JSON.stringify({ error: "合成保存暂不可用" }),
      }),
    { times: 1 },
  );
  await save();
  await panel
    .getByRole("alert")
    .filter({ hasText: /保存暂不可用/ })
    .waitFor();
  assert.equal(
    await panel.getByLabel("目标名称", { exact: true }).inputValue(),
    "保存失败草稿",
  );
  assert.equal(
    (await app.call("/workspace")).connections.agentTargets[0].label,
    "并发后恢复",
  );
  await panel.getByRole("button", { name: "取消编辑", exact: true }).click();
  await inspect();
  await panel.getByRole("button", { name: "添加目标", exact: true }).click();
  await fill("响应丢失的目标");
  await page.route(
    "**/api/agent-targets/save",
    async (route) => {
      const committed = await route.fetch();
      assert.equal(committed.status(), 200);
      await route.abort("failed");
    },
    { times: 1 },
  );
  await save();
  await panel
    .getByRole("alert")
    .filter({ hasText: /操作结果未确认/ })
    .waitFor();
  assert.equal(
    await panel.getByLabel("目标名称", { exact: true }).inputValue(),
    "响应丢失的目标",
  );
  const uncertain = await app.call("/workspace");
  assert.equal(uncertain.connections.agentTargets.length, 2);
  assert.equal(await target("响应丢失的目标").count(), 0);
  await inspect();
  await target("响应丢失的目标").waitFor();
  assert.equal(
    await panel.getByLabel("目标名称", { exact: true }).inputValue(),
    "响应丢失的目标",
  );
  await save();
  await panel
    .getByLabel("目标名称", { exact: true })
    .waitFor({ state: "hidden" });
  const recovered = await app.call("/workspace");
  assert.equal(recovered.connections.agentTargets.length, 2);
  assert.equal(
    recovered.connections.agentTargets[1].id,
    uncertain.connections.agentTargets[1].id,
  );
  console.log(
    "PASS 保存 HTTP 失败保留草稿；真实保存成功但响应丢失后刷新核对，重复确认不生成第二目标",
  );

  await inspect();
  await target("响应丢失的目标")
    .getByText("路径可用", { exact: true })
    .waitFor();
  while (await programRegion.locator("details[open]").count())
    await programRegion
      .locator("details[open]")
      .first()
      .locator("summary")
      .click();
  await panel.scrollIntoViewIfNeeded();
  await page.locator(".toast").waitFor({ state: "hidden", timeout: 6000 });
  await page.screenshot({ path: "test-results/agent-targets-desktop.png" });
  await audit("saved targets");
  await target("响应丢失的目标")
    .getByRole("button", { name: "编辑目标", exact: true })
    .click();
  await fill("窄屏编辑草稿");
  for (const width of [320, 375, 393, 430]) {
    await page.setViewportSize({ width, height: 900 });
    assert.equal(
      await page.evaluate(
        () => document.documentElement.scrollWidth > innerWidth,
      ),
      false,
      `page overflow at ${width}`,
    );
    assert.equal(
      await page
        .getByRole("dialog", { name: "Codex", exact: true })
        .evaluate((el) => el.scrollWidth > el.clientWidth),
      false,
      `drawer overflow at ${width}`,
    );
    await panel
      .getByRole("form", { name: "目标编辑", exact: true })
      .scrollIntoViewIfNeeded();
    const chosenPaths = panel
      .getByRole("form", { name: "目标编辑", exact: true })
      .locator("code");
    assert.equal(await chosenPaths.count(), 2);
    for (const code of await chosenPaths.all()) {
      assert.equal(await code.isVisible(), true);
      assert.equal(
        await code.evaluate((el) => el.scrollWidth > el.clientWidth),
        false,
        `selected path overflow at ${width}`,
      );
    }
    if (width === 320) {
      await page.screenshot({
        path: "test-results/agent-targets-editor-320.png",
      });
      await audit("320 target editor");
    }
  }
  for (let count = 0; count < 32; count++) {
    await page.keyboard.press("Tab");
    assert.equal(
      await page.evaluate(
        () => !!document.activeElement.closest('[role="dialog"]'),
      ),
      true,
      "keyboard focus escaped drawer",
    );
  }
  await page.keyboard.press("Escape");
  await panel.waitFor({ state: "hidden" });
  assert.match(
    await page.evaluate(() => document.activeElement?.getAttribute("aria-label") || ""),
    /Codex/,
  );
  assert.equal(
    (await app.call("/workspace")).connections.agentTargets[1].label,
    "响应丢失的目标",
  );
  await page.setViewportSize({ width: 1440, height: 1000 });
  await openAgentInventory(page);
  await inspect();
  console.log(
    "PASS 320/375/393/430 编辑无横向溢出，键盘焦点不逃逸且 Escape 取消不写；2 态 axe 无违规",
  );

  await target("响应丢失的目标")
    .getByRole("button", { name: "解除关联", exact: true })
    .click();
  assert.match(
    await target("响应丢失的目标").innerText(),
    /不卸载程序、不删除目录/,
  );
  assert.equal(
    (await app.call("/workspace")).connections.agentTargets.length,
    2,
  );
  await target("响应丢失的目标")
    .getByRole("button", { name: "取消解除", exact: true })
    .click();
  assert.equal(
    (await app.call("/workspace")).connections.agentTargets.length,
    2,
  );
  await target("响应丢失的目标")
    .getByRole("button", { name: "解除关联", exact: true })
    .click();
  await target("响应丢失的目标")
    .getByRole("button", { name: "确认解除", exact: true })
    .click();
  await target("响应丢失的目标").waitFor({ state: "hidden" });
  assert.equal(
    (await app.call("/workspace")).connections.agentTargets.length,
    1,
  );
  assert.equal(await app.sourceUnchanged(), true);
  await page.reload();
  await openAgentInventory(page);
  await target("并发后恢复").waitFor();
  assert.equal(await target("响应丢失的目标").count(), 0);
  assert.deepEqual(errors, []);
  console.log(
    "PASS 解除需要二次确认，可取消；确认只删除工作台关系，重开有效，源程序与配置不变",
  );

  const beforeMissing = await app.call("/workspace");
  app.setMode("partial");
  await inspect();
  await panel
    .getByRole("alert")
    .filter({ hasText: /枚举失败/ })
    .waitFor();
  assert.equal(
    await panel
      .getByRole("button", { name: "添加目标", exact: true })
      .isDisabled(),
    true,
  );
  assert.match(await target("并发后恢复").innerText(), /待核对/);
  app.setMode("profile-missing");
  await inspect();
  await target("并发后恢复").getByText("目录已缺失", { exact: true }).waitFor();
  assert.deepEqual(await app.call("/workspace"), beforeMissing);
  app.setMode("success");
  app.programs[1].status = "missing";
  await inspect();
  await target("并发后恢复").getByText("程序已缺失", { exact: true }).waitFor();
  assert.deepEqual(await app.call("/workspace"), beforeMissing);
  app.programs[1].status = "present";
  await inspect();
  await target("并发后恢复").getByText("路径可用", { exact: true }).waitFor();
  await target("并发后恢复")
    .getByRole("button", { name: "编辑目标", exact: true })
    .click();
  await panel.getByLabel("目标名称", { exact: true }).fill("源变化时保留草稿");
  app.setMode("profile-missing");
  await save();
  await panel
    .getByRole("alert")
    .filter({ hasText: /已变化/ })
    .waitFor();
  assert.equal(
    await panel.getByLabel("目标名称", { exact: true }).inputValue(),
    "源变化时保留草稿",
  );
  assert.deepEqual(await app.call("/workspace"), beforeMissing);
  app.setMode("success");
  await panel.getByRole("button", { name: "取消编辑", exact: true }).click();
  console.log(
    "PASS 首次部分检查禁用绑定；程序/Home 缺失不删目标；提交前来源变化拒绝并保留草稿",
  );

  let releaseLate;
  let markLateReady;
  const lateReady = new Promise((resolve) => {
    markLateReady = resolve;
  });
  const lateGate = new Promise((resolve) => {
    releaseLate = resolve;
  });
  let markLateDone;
  const lateDone = new Promise((resolve) => {
    markLateDone = resolve;
  });
  await page.route(
    "**/api/agent-targets/options",
    async (route) => {
      const response = await route.fetch();
      markLateReady();
      await lateGate;
      await route.fulfill({ response });
      markLateDone();
    },
    { times: 1 },
  );
  await inspect();
  await lateReady;
  await page.keyboard.press("Escape");
  await panel.waitFor({ state: "hidden" });
  await openAgentInventory(page);
  await panel.waitFor();
  assert.match(await panel.innerText(), /尚未检查版本与目标/);
  const lateWorkspace = page.waitForResponse(
    (response) => new URL(response.url()).pathname === "/api/workspace",
  );
  releaseLate();
  await lateDone;
  await (await lateWorkspace).finished();
  await page.evaluate(
    () =>
      new Promise((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(resolve)),
      ),
  );
  assert.match(await panel.innerText(), /尚未检查版本与目标/);
  assert.equal(
    await panel
      .getByRole("button", { name: "添加目标", exact: true })
      .isDisabled(),
    true,
  );
  await inspect();
  await target("并发后恢复").getByText("路径可用", { exact: true }).waitFor();
  assert.deepEqual(await app.call("/workspace"), beforeMissing);
  assert.deepEqual(errors, []);
  console.log(
    "PASS 关闭详情后晚到的检查结果不恢复抽屉或污染新会话；重新检查可用，主库不变",
  );
} finally {
  await browser.close();
  await app.close();
}
