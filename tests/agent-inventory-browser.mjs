import {openAgentInventory,agentInventoryEntry} from "./agents-v16-helpers.mjs";
import { createRequire } from "node:module";
import {
  mkdtemp,
  mkdir,
  readFile,
  realpath,
  rename,
  rm,
  symlink,
  unlink,
  writeFile,
} from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import assert from "node:assert/strict";
import AxeBuilder from "@axe-core/playwright";
import { startServer } from "../server/http.mjs";
import { inspectAgentInventory as inspectRealInventory } from "../server/agent-inventory.mjs";
import { seed } from "../src/store.js";
import { parse, stringify } from "../src/serialization.js";

const require = createRequire(import.meta.url);
const { chromium } = require(
  process.env.PLAYWRIGHT_MODULE ||
    "/Users/nat/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright",
);
const temporary = await mkdtemp(join(tmpdir(), "guiji-inventory-browser-"));
const home = join(temporary, "codex-home");
const skills = join(home, "skills");
const skill = join(skills, "agent-sample");
const sentinel = "合成配置哨兵：不能修改\n";
const sourceContent =
  "---\nname: agent-sample\ndescription: Agent 来源入口验收\n---\n# 来源保持不变\n";
let app;
let browser;
let inventoryMode = "success";
let resolveInventory;
let onInventoryPending;
let inspectorHome;
const calls = { inventory: [], scans: 0, requests: [] };
function inventory(agentId) {
  return {
    agentId,
    at: new Date().toISOString(),
    homes: [
      {
        id: `${agentId}-primary`,
        label: agentId === "hermes" ? "Hermes Home" : "默认 Home",
        path: home,
        source: "默认目录",
        status: "present",
        skills: [
          {
            path: skills,
            label: "个人 Skill 目录",
            status: "present",
            scope: "home",
          },
        ],
        errors: [],
      },
      {
        id: `${agentId}-missing`,
        label: "备用 Home",
        path: join(temporary, "missing-home"),
        source: "服务进程环境变量",
        status: "missing",
        skills: [],
        errors: [],
      },
      {
        id: `${agentId}-blocked`,
        label: "受阻 Home",
        path: join(temporary, "blocked-home"),
        source: "目录候选",
        status: "blocked",
        skills: [],
        errors: [
          { path: join(temporary, "blocked-home"), message: "目录链接未跟随" },
        ],
      },
    ],
    errors: [],
    truncated: false,
  };
}
try {
  inspectorHome = await realpath(temporary);
  await mkdir(join(inspectorHome, ".hermes", "profiles", "work", "skills"), {
    recursive: true,
  });
  await mkdir(join(skill, "assets"), { recursive: true });
  await writeFile(join(home, "config.toml"), sentinel);
  await writeFile(join(skill, "SKILL.md"), sourceContent);
  await writeFile(
    join(skill, "assets", "raw.bin"),
    new Uint8Array([0, 128, 255]),
  );
  app = await startServer({
    directory: join(temporary, "database"),
    port: 0,
    staticRoot: process.env.WORKBENCH_TEST_STATIC_ROOT || join(import.meta.dirname, "../dist"),
    discovery: {
      defaultRoots: () => [join(temporary, "projects")],
      detectAgents: async () => ({
        at: new Date().toISOString(),
        items: [
          {
            id: "codex",
            name: "Codex",
            kind: "开发 Agent",
            status: "detected",
            programs: [{ path: join(temporary, "bin", "codex"), kind: "CLI" }],
            configFound: true,
          },
          {
            id: "hermes",
            name: "Hermes",
            kind: "通用 Agent",
            status: "detected",
            programs: [{ path: join(temporary, "bin", "hermes"), kind: "CLI" }],
            configFound: true,
          },
        ],
      }),
      inspectAgentInventory: async (agentId) => {
        calls.inventory.push(agentId);
        if (inventoryMode === "actual-inspector")
          return inspectRealInventory(agentId, {
            home: inspectorHome,
            environment: {},
          });
        if (inventoryMode === "failure")
          throw Object.assign(new Error("合成目录服务不可用"), { status: 503 });
        if (inventoryMode === "pending")
          await new Promise((resolve) => {
            resolveInventory = resolve;
            onInventoryPending?.();
          });
        const result = inventory(agentId);
        if (["partial-error", "partial-truncated"].includes(inventoryMode)) {
          result.homes = result.homes.slice(0, 1);
          result.errors =
            inventoryMode === "partial-error"
              ? [
                  {
                    path: join(home, "profiles"),
                    message: "无 Profile 枚举权限",
                  },
                ]
              : [];
          result.truncated = inventoryMode === "partial-truncated";
        }
        if (inventoryMode === "success-updated")
          result.homes[1].label = "刷新后的 Home";
        return result;
      },
    },
  });
  const session = await (
    await fetch(app.url + "/api/session", {
      headers: { "x-workbench-client": "1" },
    })
  ).json();
  const headers = {
    "x-workbench-token": session.token,
    "content-type": "application/json",
  };
  const getState = async () =>
    parse(await (await fetch(app.url + "/api/workspace", { headers })).text());
  const initialized = await fetch(app.url + "/api/workspace", {
    method: "PUT",
    headers,
    body: stringify({ state: { ...seed(), assets: [] } }),
  });
  assert.equal(initialized.status, 200);
  browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
    reducedMotion: "reduce",
  });
  const page = await context.newPage();
  page.setDefaultTimeout(5000);
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("request", (request) => {
    const pathname = new URL(request.url()).pathname;
    calls.requests.push({ method: request.method(), pathname });
    if (pathname === "/api/skill-sources/discover") calls.scans++;
  });
  await page.goto(app.url + "/#agents");
  await agentInventoryEntry(page);
  const beforeInventory = await getState();
  await openAgentInventory(page);
  const dialog = page.getByRole("dialog", { name: "Codex", exact: true });
  await dialog.getByText("目录与资产", { exact: true }).waitFor();
  await dialog.getByText("默认 Home", { exact: true }).waitFor();
  assert.match(await dialog.innerText(), /发现目录/);
  assert.match(await dialog.innerText(), /未发现/);
  assert.match(await dialog.innerText(), /读取受阻/);
  assert.deepEqual(calls.inventory, ["codex"]);
  assert.equal(calls.scans, 0);
  assert.equal((await getState()).assets.length, 0);
  assert.deepEqual(await getState(), beforeInventory);
  assert.equal(await readFile(join(home, "config.toml"), "utf8"), sentinel);
  assert.deepEqual(errors, []);
  console.log(
    "PASS Agent 卡片打开目录元数据，存在/缺失/受阻可区分；不自动扫描 Skill 或修改配置",
  );
  await mkdir("test-results", { recursive: true });
  await page.locator(".toast").waitFor({ state: "hidden", timeout: 6000 });
  await page.screenshot({ path: "test-results/agent-inventory-desktop.png" });
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
      `inventory body overflow at ${width}`,
    );
    assert.equal(
      await page
        .locator(".drawer")
        .evaluate((el) => el.scrollWidth > el.clientWidth),
      false,
      `inventory drawer overflow at ${width}`,
    );
    if (width === 320)
      await page.screenshot({ path: "test-results/agent-inventory-320.png" });
  }
  await page.setViewportSize({ width: 1440, height: 1000 });
  const viewSkills = () =>
    page.getByRole("button", {
      name: "查看 Skill：默认 Home · 个人 Skill 目录",
      exact: true,
    });
  assert.equal(await viewSkills().count(), 0);
  assert.match(await dialog.getByRole("region", { name: "默认 Home" }).innerText(), /个人 Skill 目录/);
  assert.equal(calls.scans, 0);
  assert.equal((await getState()).assets.length, 0);
  assert.equal(await readFile(join(home, "config.toml"), "utf8"), sentinel);
  assert.equal(await readFile(join(skill, "SKILL.md"), "utf8"), sourceContent);
  await page.getByRole("button", { name: "关闭", exact: true }).click();
  await openAgentInventory(page);
  await dialog.getByText("默认 Home", { exact: true }).waitFor();
  assert.equal(await page.getByRole("dialog").count(), 1);
  assert.deepEqual(calls.inventory, ["codex", "codex"]);
  assert.equal(calls.scans, 0);
  assert.equal(await viewSkills().count(), 0);
  console.log(
    "PASS Agent 目录仅展示 Skill 路径；无本机 Skill 收录入口；重开仍只读",
  );
  await dialog.getByText("默认 Home", { exact: true }).waitFor();
  const beforeFailedRefresh = await getState();
  const countBeforeRefresh = calls.inventory.length;
  inventoryMode = "failure";
  await page.getByRole("button", { name: "刷新目录", exact: true }).click();
  await page
    .getByRole("status")
    .filter({ hasText: "上次结果 · 刷新未成功" })
    .waitFor();
  assert.equal(calls.inventory.length, countBeforeRefresh + 1);
  assert.match(await dialog.innerText(), /合成目录服务不可用/);
  assert.match(await dialog.innerText(), /默认 Home/);
  assert.match(await dialog.innerText(), /备用 Home/);
  assert.equal(await viewSkills().count(), 0);
  assert.deepEqual(await getState(), beforeFailedRefresh);
  await page.locator(".toast").waitFor({ state: "hidden", timeout: 6000 });
  await page.setViewportSize({ width: 320, height: 900 });
  await dialog
    .getByRole("heading", { name: "目录与资产", exact: true })
    .scrollIntoViewIfNeeded();
  await page.screenshot({
    path: "test-results/agent-inventory-failure-320.png",
  });
  assert.deepEqual(
    (
      await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
        .analyze()
    ).violations,
    [],
  );
  assert.equal(
    await page
      .locator(".drawer")
      .evaluate((el) => el.scrollWidth > el.clientWidth),
    false,
  );
  inventoryMode = "success";
  await page.getByRole("button", { name: "刷新目录", exact: true }).click();
  await dialog
    .getByRole("region", { name: "目录与资产", exact: true })
    .locator("[role=status]")
    .filter({ hasText: "检查于" })
    .waitFor();
  assert.equal(await viewSkills().count(), 0);
  assert.equal(
    await page.getByText("上次结果 · 刷新未成功", { exact: true }).count(),
    0,
  );
  assert.deepEqual(await getState(), beforeFailedRefresh);
  assert.equal(calls.scans, 0);
  console.log(
    "PASS 刷新失败保留并标记旧目录；重试恢复可用且始终无导入入口，主库无额外写入，三状态 axe 与四档布局通过",
  );
  for (const partialMode of ["partial-error", "partial-truncated"]) {
    inventoryMode = partialMode;
    const partialResponse = page.waitForResponse((response) =>
      response.url().endsWith("/api/agent-inventory"),
    );
    await page.getByRole("button", { name: "刷新目录", exact: true }).click();
    assert.equal((await partialResponse).status(), 200);
    await dialog
      .locator('[aria-label="目录与资产"][aria-busy="false"]')
      .waitFor();
    assert.equal(
      await dialog.getByText("备用 Home", { exact: true }).count(),
      1,
    );
    assert.equal(
      await dialog.getByText("受阻 Home", { exact: true }).count(),
      1,
    );
    await dialog
      .getByRole("status")
      .filter({ hasText: "上次结果 · 目录检查未完成" })
      .waitFor();
    if (partialMode === "partial-error")
      assert.match(await dialog.innerText(), /无 Profile 枚举权限/);
    else assert.match(await dialog.innerText(), /目录较多，检查未完成/);
    assert.equal(await viewSkills().count(), 0);
    if (partialMode === "partial-error") {
      await dialog
        .getByRole("heading", { name: "目录与资产", exact: true })
        .scrollIntoViewIfNeeded();
      await page.screenshot({
        path: "test-results/agent-inventory-partial-320.png",
      });
      assert.deepEqual(
        (
          await new AxeBuilder({ page })
            .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
            .analyze()
        ).violations,
        [],
      );
      assert.equal(
        await page
          .locator(".drawer")
          .evaluate((el) => el.scrollWidth > el.clientWidth),
        false,
      );
    }
    inventoryMode = "success-updated";
    await page.getByRole("button", { name: "刷新目录", exact: true }).click();
    await dialog.getByText("刷新后的 Home", { exact: true }).waitFor();
    assert.equal(
      await dialog.getByText("备用 Home", { exact: true }).count(),
      0,
    );
    assert.equal(await viewSkills().count(), 0);
    assert.equal(
      await dialog
        .getByText("上次结果 · 目录检查未完成", { exact: true })
        .count(),
      0,
    );
    inventoryMode = "success";
    await page.getByRole("button", { name: "刷新目录", exact: true }).click();
    await dialog.getByText("备用 Home", { exact: true }).waitFor();
  }
  console.log(
    "PASS HTTP200 部分错误或截断不覆盖上次目录，展示本次问题且无导入入口；完整刷新接纳新状态",
  );
  for (const partialMode of ["partial-error", "partial-truncated"]) {
    await page.getByRole("button", { name: "关闭", exact: true }).click();
    inventoryMode = partialMode;
    await openAgentInventory(page);
    await dialog
      .getByRole("status")
      .filter({ hasText: "检查未完成 · 仅显示部分结果" })
      .waitFor();
    assert.equal(
      await dialog.getByText("默认 Home", { exact: true }).count(),
      1,
    );
    assert.equal(
      await dialog.getByText("备用 Home", { exact: true }).count(),
      0,
    );
    assert.equal(await viewSkills().count(), 0);
    if (partialMode === "partial-error")
      assert.match(await dialog.innerText(), /无 Profile 枚举权限/);
    else assert.match(await dialog.innerText(), /目录较多，检查未完成/);
    inventoryMode = "success";
    await page.getByRole("button", { name: "刷新目录", exact: true }).click();
    await dialog.getByText("备用 Home", { exact: true }).waitFor();
    assert.equal(await viewSkills().count(), 0);
  }
  console.log(
    "PASS 首次目录响应有顶层错误或截断时展示部分结果；单项受阻不误伤完整响应",
  );
  await page.getByRole("button", { name: "关闭", exact: true }).click();
  inventoryMode = "actual-inspector";
  const actualFullResponse = page.waitForResponse((response) =>
    response.url().endsWith("/api/agent-inventory"),
  );
  await openAgentInventory(page,"hermes","Hermes");
  const actualFull = await (await actualFullResponse).json();
  assert.deepEqual(actualFull.errors, []);
  assert.equal(actualFull.truncated, false);
  assert.ok(actualFull.homes.some((item) => item.label === "Profile · work"));
  const actualHermesDialog = page.getByRole("dialog", {
    name: "Hermes",
    exact: true,
  });
  await actualHermesDialog
    .getByText("Profile · work", { exact: true })
    .waitFor();
  const profileSkills = actualHermesDialog.getByRole("button", {
    name: "查看 Skill：Profile · work · Skills",
    exact: true,
  });
  assert.equal(await profileSkills.count(), 0);
  const profileRoot = join(inspectorHome, ".hermes", "profiles");
  const preservedProfiles = join(inspectorHome, ".hermes", "profiles-complete");
  await rename(profileRoot, preservedProfiles);
  await symlink(preservedProfiles, profileRoot);
  const actualPartialResponse = page.waitForResponse((response) =>
    response.url().endsWith("/api/agent-inventory"),
  );
  await page.getByRole("button", { name: "刷新目录", exact: true }).click();
  const actualPartialResult = await actualPartialResponse;
  assert.equal(actualPartialResult.status(), 200);
  const actualPartial = await actualPartialResult.json();
  assert.ok(actualPartial.errors.some((item) => /符号链接/.test(item.message)));
  assert.equal(
    actualPartial.homes.some((item) => item.label === "Profile · work"),
    false,
  );
  await actualHermesDialog
    .getByRole("status")
    .filter({ hasText: "上次结果 · 目录检查未完成" })
    .waitFor();
  assert.equal(
    await actualHermesDialog
      .getByText("Profile · work", { exact: true })
      .count(),
    1,
  );
  assert.equal(await profileSkills.count(), 0);
  await unlink(profileRoot);
  await rename(preservedProfiles, profileRoot);
  await page.getByRole("button", { name: "刷新目录", exact: true }).click();
  await actualHermesDialog
    .getByRole("status")
    .filter({ hasText: "检查于" })
    .waitFor();
  assert.equal(await profileSkills.count(), 0);
  assert.deepEqual(await getState(), beforeFailedRefresh);
  console.log(
    "PASS 实际 inspector 读取临时 Hermes Profiles，链接受阻产生 HTTP200 部分结果，UI 保留旧 Profile 并在目录恢复后更新",
  );
  await page.getByRole("button", { name: "关闭", exact: true }).click();
  inventoryMode = "pending";
  const pendingStarted = new Promise((resolve) => {
    onInventoryPending = resolve;
  });
  await openAgentInventory(page);
  await pendingStarted;
  await dialog
    .getByRole("status")
    .filter({ hasText: "正在读取目录元数据" })
    .waitFor();
  await page.keyboard.press("Escape");
  assert.equal(await page.getByRole("dialog").count(), 0);
  inventoryMode = "success";
  await openAgentInventory(page,"hermes","Hermes");
  const hermesDialog = page.getByRole("dialog", {
    name: "Hermes",
    exact: true,
  });
  await hermesDialog.getByText("Hermes Home", { exact: true }).waitFor();
  const pendingResponse = page.waitForResponse(
    (response) =>
      response.url().endsWith("/api/agent-inventory") &&
      response.request().postDataJSON()?.agentId === "codex",
  );
  resolveInventory();
  resolveInventory = undefined;
  await (await pendingResponse).finished();
  await page.evaluate(
    () =>
      new Promise((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(resolve)),
      ),
  );
  assert.equal(await page.getByRole("dialog").count(), 1);
  assert.equal(await dialog.count(), 0);
  assert.equal(
    await hermesDialog.getByText("Hermes Home", { exact: true }).count(),
    1,
  );
  assert.equal(
    await hermesDialog.getByText("默认 Home", { exact: true }).count(),
    0,
  );
  assert.deepEqual(calls.inventory.slice(-2), ["codex", "hermes"]);
  const lastButton = hermesDialog.getByRole("button").last();
  await lastButton.focus();
  await page.keyboard.press("Tab");
  assert.equal(
    await hermesDialog
      .getByRole("button", { name: "关闭", exact: true })
      .evaluate((element) => element === document.activeElement),
    true,
  );
  await page.keyboard.press("Shift+Tab");
  assert.equal(
    await lastButton.evaluate((element) => element === document.activeElement),
    true,
  );
  await page.keyboard.press("Escape");
  assert.equal(await page.getByRole("dialog").count(), 0);
  assert.equal(
    await page
      .locator(".agent-discovery-card").filter({has:page.locator("strong",{hasText:/^Hermes$/})})
      .evaluate((element) => element === document.activeElement),
    true,
  );
  assert.deepEqual(await getState(), beforeFailedRefresh);
  assert.equal(calls.scans, 0);
  assert.equal(await readFile(join(home, "config.toml"), "utf8"), sentinel);
  assert.deepEqual(errors, []);
  console.log(
    "PASS 关闭中的旧请求不复活或覆盖新 Agent；Tab/Shift+Tab 焦点环、Esc 返回卡片；无额外扫描、配置写入或 JS 异常",
  );
} finally {
  resolveInventory?.();
  await browser?.close();
  await app?.close();
  await rm(temporary, { recursive: true, force: true });
}
