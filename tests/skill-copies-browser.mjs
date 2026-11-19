import {openAgentInventory} from "./agents-v16-helpers.mjs";
import { createRequire } from "node:module";
import assert from "node:assert/strict";
import { mkdir, rename, symlink, unlink } from "node:fs/promises";
import { join } from "node:path";
import AxeBuilder from "@axe-core/playwright";
import { revise } from "../src/store.js";
import { copyFixture } from "./copy-fixture.mjs";
import { openSettingsDrawer } from "./settings-entry.mjs";
const require = createRequire(import.meta.url);
const { chromium } = require(
  process.env.PLAYWRIGHT_MODULE ||
    "/Users/nat/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright",
);
const app = await copyFixture();
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({
  viewport: { width: 1440, height: 1000 },
  reducedMotion: "reduce",
});
const page = await context.newPage();
page.setDefaultTimeout(5000);
const calls = [];
page.on("request", (r) => {
  if (new URL(r.url()).pathname.startsWith("/api/skill-copies/"))
    calls.push(new URL(r.url()).pathname);
});
const panel = page.getByRole("region", { name: "目标副本", exact: true });
const audit = async (label) =>
  assert.deepEqual(
    (
      await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
        .analyze()
    ).violations,
    [],
    `axe ${label}`,
  );
// #93 资产仓库默认停在 Prompt 页，Skill 卡要先切到 Skill 页签才会显示。
const skillTab = () =>
  page
    .getByRole("group", { name: "资产类型" })
    .getByRole("button", { name: /^Skill/ })
    .click();
const open = async () => {
  await page.goto(app.url + "/#assets");
  await skillTab();
  await page
    .getByRole("button", { name: "查看 副本核对测试", exact: true })
    .click();
  await page.getByRole("button", { name: "目标副本", exact: true }).click();
  await panel.waitFor();
};
const findPreview = async () => {
  await panel
    .getByRole("button", { name: "查找已有副本", exact: true })
    .click();
  await panel.getByRole("radio", { name: /copy-sample-with/ }).check();
  await panel.getByRole("button", { name: "预览对比", exact: true }).click();
  await panel.getByRole("region", { name: "副本预览", exact: true }).waitFor();
};
try {
  await open();
  assert.deepEqual(calls, []);
  await panel
    .getByRole("button", { name: "关联已有副本", exact: true })
    .click();
  await panel
    .getByRole("combobox", { name: "管理目标", exact: true })
    .selectOption(app.target.id);
  await panel
    .getByRole("combobox", { name: "固定资产版本", exact: true })
    .selectOption(app.asset.versions[0].id);
  assert.deepEqual(calls, []);
  await panel
    .getByRole("button", { name: "查找已有副本", exact: true })
    .click();
  await panel
    .getByRole("radio", { name: new RegExp("copy-sample-with") })
    .check();
  await panel.getByRole("button", { name: "预览对比", exact: true }).click();
  await panel.getByRole("region", { name: "副本预览", exact: true }).waitFor();
  assert.equal(
    await panel
      .getByRole("region", { name: "副本预览", exact: true })
      .evaluate((el) => el === document.activeElement),
    true,
    "预览完成后应把焦点带到比较结果，不能留在候选列表按钮",
  );
  const previewHeadingBox = await panel
    .getByRole("region", { name: "副本预览", exact: true })
    .getByRole("heading")
    .boundingBox();
  assert.ok(
    previewHeadingBox &&
      previewHeadingBox.y >= 60 &&
      previewHeadingBox.y + previewHeadingBox.height <= 1000,
    "比较标题应出现在视口且不被固定顶栏遮挡",
  );
  assert.match(await panel.innerText(), /完全一致/);
  assert.equal(
    (await app.call("/workspace")).connections.skillCopies?.length || 0,
    0,
  );
  await panel.getByRole("button", { name: "确认关联", exact: true }).click();
  await panel.getByRole("button", { name: "重新核对", exact: true }).waitFor();
  const saved = await app.call("/workspace");
  assert.equal(saved.connections.skillCopies.length, 1);
  assert.equal(saved.connections.skillCopies[0].location, app.location);
  await page.reload();
  await skillTab(); // #93 刷新后回到默认 Prompt 页，先切到 Skill 页签
  await page
    .getByRole("button", { name: "查看 副本核对测试", exact: true })
    .click();
  await page.getByRole("button", { name: "目标副本", exact: true }).click();
  assert.match(await panel.innerText(), /待核对/);
  assert.equal(calls.filter((p) => p.endsWith("/check")).length, 0);
  assert.equal(await app.sourceUnchanged(), true);
  console.log(
    "PASS 显式查找→单包预览→确认关系→重开待核对；不自动读取、不安装、不改源包",
  );
  const row = panel.getByRole("article").first();
  await row.getByRole("button", { name: "重新核对", exact: true }).click();
  await row.getByText("完全一致", { exact: true }).first().waitFor();
  const updated = await app.newVersion();
  await row.getByRole("button", { name: "重新核对", exact: true }).click();
  await row.getByText(/有新版/).waitFor();
  assert.match(await row.innerText(), /固定 v1.0/);
  assert.equal(
    (await app.call("/workspace")).connections.skillCopies[0].versionId,
    app.asset.versions[0].id,
  );
  assert.deepEqual(await app.call("/workspace"), updated);
  await app.changeSource();
  await row.getByRole("button", { name: "重新核对", exact: true }).click();
  await row.getByText("存在差异", { exact: true }).first().waitFor();
  await row.getByText("核对明细", { exact: true }).click();
  await row.getByText(/差异与未核验/).click();
  assert.match(await row.innerText(), /SKILL.md/);
  assert.match(await row.innerText(), /内容变化/);
  await app.restoreSource();
  await row.getByRole("button", { name: "重新核对", exact: true }).click();
  await row.getByText("完全一致", { exact: true }).first().waitFor();
  assert.deepEqual(await app.call("/workspace"), updated);
  console.log(
    "PASS 显式核对固定版本；资产有新版及时提示且不改关联；源包漂移可见、恢复后重新一致",
  );
  const held = app.location + "-temporarily-held";
  await rename(app.location, held);
  await row.getByRole("button", { name: "重新核对", exact: true }).click();
  await row.getByText("副本缺失", { exact: true }).waitFor();
  assert.deepEqual(await app.call("/workspace"), updated);
  await symlink(app.alternate, app.location);
  await row.getByRole("button", { name: "重新核对", exact: true }).click();
  await row.getByText("读取受阻", { exact: true }).waitFor();
  await unlink(app.location);
  await rename(held, app.location);
  await row.getByRole("button", { name: "重新核对", exact: true }).click();
  await row.getByText("完全一致", { exact: true }).first().waitFor();
  await page.route(
    "**/api/skill-copies/check",
    (route) =>
      route.fulfill({
        status: 503,
        contentType: "application/json",
        body: JSON.stringify({
          error: "合成核对失败-" + "LongestUnbrokenReadError".repeat(14),
        }),
      }),
    { times: 1 },
  );
  await row.getByRole("button", { name: "重新核对", exact: true }).click();
  await row
    .getByRole("alert")
    .filter({ hasText: /当前状态未知/ })
    .waitFor();
  assert.match(await row.innerText(), /上次结果已过期/);
  assert.equal(
    await row
      .locator(".copy-heading")
      .first()
      .getByText("待核对", { exact: true })
      .count(),
    1,
  );
  await mkdir("test-results", { recursive: true });
  for (const width of [320, 375, 393, 430]) {
    await page.setViewportSize({ width, height: 900 });
    await row.getByRole("alert").scrollIntoViewIfNeeded();
    assert.equal(
      await page
        .getByRole("dialog")
        .evaluate((el) => el.scrollWidth > el.clientWidth),
      false,
      `copy failure drawer overflow ${width}`,
    );
    assert.equal(
      await row
        .getByRole("alert")
        .evaluate((el) => el.scrollWidth > el.clientWidth),
      false,
      `copy error overflow ${width}`,
    );
    if (width === 320)
      await page.screenshot({
        path: "test-results/skill-copies-error-320.png",
      });
  }
  await audit("failed check retains stale result");
  await page.setViewportSize({ width: 1440, height: 1000 });
  await row.getByRole("button", { name: "重新核对", exact: true }).click();
  await row.getByText("完全一致", { exact: true }).first().waitFor();
  assert.deepEqual(await app.call("/workspace"), updated);
  console.log(
    "PASS 真实目录缺失/符号链接受阻不删关系；读取失败标旧结果过期，四档长错误不溢出且axe通过",
  );
  await page.keyboard.press("Escape");
  await page.goto(app.url + "/#settings");
  await page.reload();
  await openSettingsDrawer(page, "资产交付目标");
  const linkedAssets = page.getByRole("region", {
    name: "隔离 Codex 的关联资产",
    exact: true,
  });
  assert.match(await linkedAssets.innerText(), /待核对|未验证/);
  await linkedAssets
    .getByRole("button", { name: "副本核对测试 · v1.0", exact: true })
    .click();
  await page.getByRole("button", { name: "目标副本", exact: true }).click();
  await panel.waitFor();
  const latestVersion = updated.assets[0].versions.at(-1).id;
  await row.getByRole("button", { name: "调整关联", exact: true }).click();
  await panel
    .getByRole("combobox", { name: "固定资产版本", exact: true })
    .selectOption(latestVersion);
  await panel
    .getByRole("button", { name: "查找已有副本", exact: true })
    .click();
  await panel.getByRole("radio", { name: /copy-sample-with/ }).check();
  await panel.getByRole("button", { name: "预览对比", exact: true }).click();
  const preview = panel.getByRole("region", { name: "副本预览", exact: true });
  await preview.getByText(/当前关联：副本核对测试 · v1.0/).waitFor();
  assert.match(await preview.innerText(), /此次确认将改为.*v2.0/);
  assert.equal(
    await preview
      .getByRole("button", { name: "确认关联", exact: true })
      .isDisabled(),
    true,
  );
  assert.equal(
    (await app.call("/workspace")).connections.skillCopies[0].versionId,
    app.asset.versions[0].id,
  );
  await preview.scrollIntoViewIfNeeded();
  await page.locator(".toast").waitFor({ state: "hidden", timeout: 6000 });
  await page.screenshot({
    path: "test-results/skill-copies-preview-desktop.png",
  });
  await audit("explicit old mapping preview");
  for (const width of [320, 375, 393, 430]) {
    await page.setViewportSize({ width, height: 900 });
    await preview.scrollIntoViewIfNeeded();
    assert.equal(
      await page
        .getByRole("dialog", { name: "资产详情" })
        .evaluate((el) => el.scrollWidth > el.clientWidth),
      false,
      `preview drawer overflow ${width}`,
    );
    for (const code of await preview.locator("code").all())
      assert.equal(
        await code.evaluate((el) => el.scrollWidth > el.clientWidth),
        false,
        `preview path overflow ${width}`,
      );
    if (width === 320)
      await page.screenshot({
        path: "test-results/skill-copies-preview-320.png",
      });
  }
  await audit("narrow copy preview");
  await preview
    .getByRole("checkbox", { name: "确认替换上述关联", exact: true })
    .check();
  await preview.getByRole("button", { name: "确认关联", exact: true }).click();
  await preview.waitFor({ state: "hidden" });
  const rebound = await app.call("/workspace");
  assert.equal(rebound.connections.skillCopies.length, 1);
  assert.equal(
    rebound.connections.skillCopies[0].id,
    saved.connections.skillCopies[0].id,
  );
  assert.equal(rebound.connections.skillCopies[0].versionId, latestVersion);
  await row.getByRole("button", { name: "重新核对", exact: true }).click();
  await row.getByText("存在差异", { exact: true }).first().waitFor();
  await page.setViewportSize({ width: 1440, height: 1000 });
  console.log(
    "PASS Agent关联资产入口可达；固定版本改绑明示旧映射并二次确认、身份不变；预览四档无溢出且2态axe通过",
  );
  await row.getByRole("button", { name: "调整关联", exact: true }).click();
  await panel
    .getByRole("combobox", { name: "固定资产版本", exact: true })
    .selectOption(app.asset.versions[0].id);
  await findPreview();
  await preview
    .getByRole("checkbox", { name: "确认替换上述关联", exact: true })
    .check();
  app.advance(300001);
  await preview.getByRole("button", { name: "确认关联", exact: true }).click();
  await panel.getByRole("alert").filter({ hasText: /过期/ }).waitFor();
  assert.equal(
    await panel
      .getByRole("combobox", { name: "固定资产版本", exact: true })
      .inputValue(),
    app.asset.versions[0].id,
  );
  assert.equal(
    await preview
      .getByRole("button", { name: "确认关联", exact: true })
      .isDisabled(),
    true,
  );
  assert.deepEqual(await app.call("/workspace"), rebound);
  await findPreview();
  await preview
    .getByRole("checkbox", { name: "确认替换上述关联", exact: true })
    .check();
  await app.call("/scan/agents", {});
  await preview.getByRole("button", { name: "确认关联", exact: true }).click();
  await preview
    .getByRole("alert")
    .filter({ hasText: /预览已失效/ })
    .waitFor();
  assert.equal(
    (await app.call("/workspace")).connections.skillCopies[0].versionId,
    latestVersion,
  );
  assert.equal(
    await panel
      .getByRole("combobox", { name: "固定资产版本", exact: true })
      .inputValue(),
    app.asset.versions[0].id,
  );
  await findPreview();
  await preview.getByRole("alert").waitFor({ state: "hidden" });
  await preview
    .getByRole("checkbox", { name: "确认替换上述关联", exact: true })
    .check();
  await page.route(
    "**/api/skill-copies/bind",
    async (route) => {
      const response = await route.fetch();
      assert.equal(response.status(), 200);
      await route.abort("failed");
    },
    { times: 1 },
  );
  await preview.getByRole("button", { name: "确认关联", exact: true }).click();
  await panel
    .getByRole("alert")
    .filter({ hasText: /操作结果未确认/ })
    .waitFor();
  assert.equal(
    await preview
      .getByRole("button", { name: "确认关联", exact: true })
      .isDisabled(),
    true,
  );
  const uncertain = await app.call("/workspace");
  assert.equal(uncertain.connections.skillCopies.length, 1);
  assert.equal(
    uncertain.connections.skillCopies[0].versionId,
    app.asset.versions[0].id,
  );
  await findPreview();
  await preview.getByText(/当前关联：副本核对测试 · v1.0/).waitFor();
  assert.equal(await preview.getByRole("checkbox").count(), 0);
  await preview.getByRole("button", { name: "确认关联", exact: true }).click();
  await preview.waitFor({ state: "hidden" });
  const recovered = await app.call("/workspace");
  assert.equal(recovered.connections.skillCopies.length, 1);
  assert.equal(
    recovered.connections.skillCopies[0].id,
    uncertain.connections.skillCopies[0].id,
  );
  console.log(
    "PASS token过期/主库并发阻断旧确认并保留选择；提交成功但响应丢失后重新预览核对，幂等不增关系",
  );
  await row.getByRole("button", { name: "调整关联", exact: true }).click();
  await findPreview();
  const beforeDiscoverFailure = await app.call("/workspace");
  app.setMode("partial");
  await panel
    .getByRole("button", { name: "查找已有副本", exact: true })
    .click();
  await panel
    .getByRole("alert")
    .filter({ hasText: /目标目录检查不完整/ })
    .waitFor();
  assert.equal(await preview.count(), 0);
  assert.equal(
    await panel.getByRole("radio", { name: /copy-sample-with/ }).isDisabled(),
    true,
  );
  assert.equal(
    await panel.getByRole("radio", { name: /copy-sample-with/ }).isChecked(),
    true,
  );
  assert.equal(
    await panel
      .getByRole("button", { name: "预览对比", exact: true })
      .isDisabled(),
    true,
  );
  assert.match(await panel.innerText(), /旧结果不可用于确认/);
  assert.deepEqual(await app.call("/workspace"), beforeDiscoverFailure);
  await page.setViewportSize({ width: 320, height: 900 });
  await panel.getByRole("alert").scrollIntoViewIfNeeded();
  assert.equal(
    await page
      .getByRole("dialog", { name: "资产详情" })
      .evaluate((el) => el.scrollWidth > el.clientWidth),
    false,
  );
  await page.locator(".toast").waitFor({ state: "hidden", timeout: 6000 });
  await page.screenshot({
    path: "test-results/skill-copies-discovery-error-320.png",
  });
  await audit("partial discovery keeps unusable candidates");
  app.setMode("success");
  await findPreview();
  await panel.getByRole("button", { name: "取消关联", exact: true }).click();
  await page.setViewportSize({ width: 1440, height: 1000 });
  assert.deepEqual(await app.call("/workspace"), beforeDiscoverFailure);
  console.log(
    "PASS 目录检查不完整时保留选择但禁用旧候选/预览，完整重新查找可恢复，不写关系；窄屏axe通过",
  );
  const withoutModes = revise(recovered.assets[0], {
    content: app.content,
    files: app.asset.versions[0].files.map(({ mode, ...file }) => file),
  });
  await app.call(
    "/workspace",
    { state: { ...recovered, assets: [withoutModes] } },
    "PUT",
  );
  await page.reload();
  await open();
  await row.getByRole("button", { name: "调整关联", exact: true }).click();
  await panel
    .getByRole("combobox", { name: "固定资产版本", exact: true })
    .selectOption(withoutModes.versions.at(-1).id);
  await findPreview();
  await preview.getByText("部分未核验", { exact: true }).waitFor();
  assert.match(await preview.innerText(), /权限信息不完整/);
  assert.equal(await preview.getByText("完全一致", { exact: true }).count(), 0);
  await preview.getByText(/差异与未核验/).click();
  assert.match(await preview.innerText(), /权限未知/);
  await page.setViewportSize({ width: 320, height: 900 });
  await preview.scrollIntoViewIfNeeded();
  assert.equal(
    await page
      .getByRole("dialog", { name: "资产详情" })
      .evaluate((el) => el.scrollWidth > el.clientWidth),
    false,
  );
  await page.screenshot({
    path: "test-results/skill-copies-permissions-320.png",
  });
  await audit("unknown permissions not identical");
  assert.equal(
    (await app.call("/workspace")).connections.skillCopies[0].versionId,
    app.asset.versions[0].id,
  );
  await page.setViewportSize({ width: 1440, height: 1000 });
  console.log(
    "PASS 字节相同但权限未知显示未核验而非完全一致；差异明细可展开、未确认不改固定版本；axe通过",
  );

  for (const selection of ["version", "target"]) {
    let release, ready, done;
    const gate = new Promise((resolve) => {
      release = resolve;
    });
    const started = new Promise((resolve) => {
      ready = resolve;
    });
    const completed = new Promise((resolve) => {
      done = resolve;
    });
    await page.route(
      "**/api/skill-copies/preview",
      async (route) => {
        const response = await route.fetch();
        ready();
        await gate;
        await route.fulfill({ response });
        done();
      },
      { times: 1 },
    );
    await panel.getByRole("button", { name: "预览对比", exact: true }).click();
    await started;
    const readback = page.waitForResponse(
      (response) => new URL(response.url()).pathname === "/api/workspace",
    );
    if (selection === "version")
      await panel
        .getByRole("combobox", { name: "固定资产版本", exact: true })
        .selectOption(app.asset.versions[0].id);
    else
      await panel
        .getByRole("combobox", { name: "管理目标", exact: true })
        .selectOption("");
    release();
    await completed;
    await (await readback).finished();
    await page.evaluate(
      () =>
        new Promise((resolve) =>
          requestAnimationFrame(() => requestAnimationFrame(resolve)),
        ),
    );
    assert.equal(await preview.count(), 0, "迟到预览不得覆盖新选择");
    if (selection === "version") await findPreview();
  }
  await panel
    .getByRole("combobox", { name: "管理目标", exact: true })
    .selectOption(app.target.id);
  let releaseScan, readyScan, doneScan;
  const scanGate = new Promise((resolve) => {
    releaseScan = resolve;
  });
  const scanStarted = new Promise((resolve) => {
    readyScan = resolve;
  });
  const scanDone = new Promise((resolve) => {
    doneScan = resolve;
  });
  await page.route(
    "**/api/skill-copies/discover",
    async (route) => {
      const response = await route.fetch();
      readyScan();
      await scanGate;
      await route.fulfill({ response });
      doneScan();
    },
    { times: 1 },
  );
  await panel
    .getByRole("button", { name: "查找已有副本", exact: true })
    .click();
  await scanStarted;
  await panel.getByRole("button", { name: "取消关联", exact: true }).click();
  const lateScanRead = page.waitForResponse(
    (response) => new URL(response.url()).pathname === "/api/workspace",
  );
  releaseScan();
  await scanDone;
  await (await lateScanRead).finished();
  await page.evaluate(
    () =>
      new Promise((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(resolve)),
      ),
  );
  assert.equal(
    await panel.getByRole("group", { name: "关联副本", exact: true }).count(),
    0,
  );
  await panel
    .getByRole("button", { name: "关联已有副本", exact: true })
    .click();
  assert.equal(
    await panel
      .getByRole("combobox", { name: "管理目标", exact: true })
      .evaluate((el) => el === document.activeElement),
    true,
  );
  for (let index = 0; index < 32; index++) {
    await page.keyboard.press("Tab");
    assert.equal(
      await page.evaluate(
        () => !!document.activeElement.closest('[role="dialog"]'),
      ),
      true,
    );
  }
  await page.keyboard.press("Escape");
  await panel.waitFor({ state: "hidden" });
  assert.equal(
    (await app.call("/workspace")).connections.skillCopies.length,
    1,
  );
  console.log(
    "PASS 切换版本/目标与关闭编辑会废弃晚到结果；重新进入焦点明确，键盘不逃逸，Escape不写关系",
  );

  const beforeTargetRemoval = await app.call("/workspace");
  await app.call("/agent-targets/remove", {
    id: app.target.id,
    revision: beforeTargetRemoval.revision,
  });
  await page.reload();
  await open();
  await row.getByText("目标已解除", { exact: true }).waitFor();
  assert.equal(
    (await app.call("/workspace")).connections.skillCopies.length,
    1,
  );
  await row.getByRole("button", { name: "解除副本关联", exact: true }).click();
  assert.match(await row.innerText(), /不删除副本目录或资产/);
  await row.getByRole("button", { name: "取消解除", exact: true }).click();
  assert.equal(
    (await app.call("/workspace")).connections.skillCopies.length,
    1,
  );
  await row.getByRole("button", { name: "解除副本关联", exact: true }).click();
  await row
    .getByRole("button", { name: "确认解除副本关联", exact: true })
    .click();
  await panel.getByText("尚未关联目标副本。", { exact: true }).waitFor();
  const removed = await app.call("/workspace");
  assert.equal(removed.connections.skillCopies.length, 0);
  assert.equal(removed.assets.length, 1);
  assert.equal(await app.sourceUnchanged(), true);
  await page.reload();
  await open();
  assert.equal(await panel.getByRole("article").count(), 0);
  await audit("empty after unlink");
  console.log(
    "PASS 目标解除保留副本关系并标失效；二次确认可取消，解除只删关系且重开有效，源文件与资产保留；axe通过",
  );
} finally {
  await browser.close();
  await app.close();
}
