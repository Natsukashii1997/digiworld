import assert from "node:assert/strict";
import { chromium } from "playwright";
import { knowledge193Fixture } from "./knowledge-v16-fixture.mjs";
import { geometry, axe } from "./ui-v14-checks.mjs";
import { openSettingsDrawer } from "./settings-entry.mjs";
const app = await knowledge193Fixture(),
  browser = await chromium.launch(),
  errors = [],
  c = await browser.newContext({
    viewport: { width: 390, height: 1000 },
    reducedMotion: "reduce",
  }),
  p = await c.newPage();
p.setDefaultTimeout(10000);
p.on("pageerror", (e) => errors.push(e.message));
await p.route("**/*", (r) => {
  assert.equal(new URL(r.request().url()).origin, app.url);
  return r.continue();
});
try {
  await p.goto(app.url + "/#settings");
  await openSettingsDrawer(p, "知识与 MCP");
  await p
    .getByRole("button", { name: "管理知识源 我的 Vault", exact: true })
    .click();
  let d = p.getByRole("dialog");
  await d
    .getByLabel("排除文件夹（每行一个相对目录）", { exact: true })
    .fill("排除");
  await d
    .getByRole("checkbox", { name: "开放知识给 Agent", exact: true })
    .check();
  await d
    .getByRole("checkbox", { name: "我已核对知识开放与排除范围", exact: true })
    .check();
  let writes = 0;
  await p.route("**/api/knowledge/policy", async (route) => {
    writes++;
    await route.abort("failed");
  });
  await d.getByRole("button", { name: "保存知识范围", exact: true }).click();
  await d
    .getByRole("button", { name: "重新读取知识范围", exact: true })
    .waitFor();
  assert.equal(writes, 1);
  assert(
    await d
      .getByRole("button", { name: "保存知识范围", exact: true })
      .isDisabled(),
  );
  assert.equal(
    await d
      .getByLabel("排除文件夹（每行一个相对目录）", { exact: true })
      .inputValue(),
    "排除",
    "失败保留草稿",
  );
  await p.keyboard.press("Escape");
  // v19：知识源与个人说明都在「知识开放」抽屉里，关掉后从自检行重新打开
  await openSettingsDrawer(p, "知识与 MCP");
  await p.getByRole("button", { name: "接入与授权", exact: true }).click();
  d = p.getByRole("dialog");
  await d.getByRole("checkbox", { name: /我确认允许本机 Agent/ }).check();
  assert(
    await d
      .getByRole("button", { name: "开启 MCP 读取", exact: true })
      .isDisabled(),
    "未知结果不能通过MCP快捷入口绕过",
  );
  await d
    .getByRole("button", { name: "重新读取知识范围", exact: true })
    .waitFor();
  await p.route("**/api/workspace", (r) =>
    r.fulfill({ status: 503, json: { error: "合成回读失败" } }),
  );
  await d
    .getByRole("button", { name: "重新读取知识范围", exact: true })
    .click();
  await d.getByRole("alert").filter({ hasText: "合成回读失败" }).waitFor();
  assert(
    await d
      .getByRole("button", { name: "开启 MCP 读取", exact: true })
      .isDisabled(),
  );
  await p.unroute("**/api/workspace");
  await p.keyboard.press("Escape");
  await openSettingsDrawer(p, "知识与 MCP");
  await p
    .getByRole("button", { name: "管理知识源 我的 Vault", exact: true })
    .click();
  d = p.getByRole("dialog");
  await p.unroute("**/api/knowledge/policy");
  await d
    .getByRole("button", { name: "重新读取知识范围", exact: true })
    .click();
  await d
    .getByRole("button", { name: "重新读取知识范围", exact: true })
    .waitFor({ state: "detached" });
  await d
    .getByRole("checkbox", { name: "开放知识给 Agent", exact: true })
    .check();
  await d
    .getByLabel("排除文件夹（每行一个相对目录）", { exact: true })
    .fill("排除");
  await d
    .getByRole("checkbox", { name: "我已核对知识开放与排除范围", exact: true })
    .check();
  await d.getByRole("button", { name: "保存知识范围", exact: true }).click();
  await p.getByText("知识范围已保存", { exact: true }).waitFor();
  await geometry(p, ".drawer", "知识权限快捷入口");
  await axe(p, "知识权限快捷入口");
  await p.keyboard.press("Escape");
  await p.reload();
  await openSettingsDrawer(p, "知识与 MCP");
  await p
    .getByRole("button", { name: "管理知识源 我的 Vault", exact: true })
    .click();
  d = p.getByRole("dialog");
  assert(
    await d
      .getByRole("checkbox", { name: "开放知识给 Agent", exact: true })
      .isChecked(),
  );
  assert.equal(
    await d
      .getByLabel("排除文件夹（每行一个相对目录）", { exact: true })
      .inputValue(),
    "排除",
  );
  assert.deepEqual(errors, []);
  console.log(
    "PASS 设置知识权限：未知锁定/显式回读/草稿保留/同源持久化/44px/axe",
  );
} finally {
  await browser.close();
  await app.close();
}
