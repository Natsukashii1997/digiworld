import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { fixture } from "./fixture.mjs";
import AxeBuilder from "@axe-core/playwright";
import { seed } from "../src/store.js";
import { stringify, parse } from "../src/serialization.js";

const require = createRequire(import.meta.url);
const { chromium } = require(
  process.env.PLAYWRIGHT_MODULE ||
    "/Users/nat/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright",
);
const out = process.env.GUIJI_TEST_RESULTS || "test-results/workflow-template";
await mkdir(out, { recursive: true });
const app = await fixture();
const browser = await chromium.launch({ headless: true });
try {
  const session = await (await fetch(app.url + "/api/session", {
    headers: { "x-workbench-client": "1" },
  })).json();
  const headers = {
    "x-workbench-token": session.token,
    "content-type": "application/json",
  };
  const stored = async () => parse(await (await fetch(app.url + "/api/workspace", { headers })).text());
  const response = await fetch(app.url + "/api/workspace", {
    method: "PUT",
    headers,
    body: stringify({ state: { ...seed(), assets: [] } }),
  });
  assert.equal(response.status, 200);
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  page.setDefaultTimeout(5000);
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto(app.url + "/#assets");
  await page.getByRole("button", { name: "新建", exact: true }).first().click();
  await page.getByRole("button", { name: "工作流", exact: true }).click();
  await page.getByRole("button", { name: "启用九站定稿模板" }).click();
  assert.equal(await page.locator(".workflow-template-stage").count(), 9);
  assert.equal(await page.getByLabel("名称", { exact: true }).inputValue(), "设计实现流 v1");
  await page.locator(".workflow-template-stage").first().locator("summary").click();
  await page.locator(".workflow-template-stage").first().getByLabel("阶段名称").fill("方向确认");
  await page.getByLabel("默认推进节奏").selectOption("continuous");
  await page.getByLabel("同一项返修升级次数").fill("3");
  const editor = page.getByRole("dialog", { name: "新建资产", exact: true });
  await editor.evaluate((element) => Promise.all(element.getAnimations({ subtree: false }).map((animation) => animation.finished)));
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 900 });
    await editor.locator(".workflow-template-editor").evaluate((element) => element.scrollIntoView({ block: "start" }));
    assert.deepEqual((await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze()).violations, []);
    await page.screenshot({ path: join(out, `template-editor-${width}.png`), fullPage: true });
  }
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.getByRole("button", { name: "保存资产", exact: true }).click();
  await page.getByRole("button", { name: "查看 设计实现流 v1", exact: true }).waitFor();
  await page.locator(".evolution").waitFor({ state: "detached" });
  const workflow = (await stored()).assets.find((asset) => asset.versions.at(-1).title === "设计实现流 v1");
  assert.ok(workflow);
  assert.equal(workflow.versions.at(-1).workflowTemplate.stages.length, 9);
  assert.equal(workflow.versions.at(-1).workflowTemplate.stages[0].label, "方向确认");
  assert.equal(workflow.versions.at(-1).workflowTemplate.defaultPace, "continuous");
  assert.equal(workflow.versions.at(-1).workflowTemplate.escalationAfter, 3);
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 900 });
    await page.getByRole("button", { name: "查看 设计实现流 v1", exact: true }).click();
    const detail = page.getByRole("dialog", { name: "资产详情", exact: true });
    const structure = detail.getByRole("region", { name: "协同模板结构" });
    await structure.waitFor();
    await detail.evaluate((element) => Promise.all(element.getAnimations({ subtree: false }).map((animation) => animation.finished)));
    assert.match(await structure.innerText(), /方向确认|运行采用|终验|存档/);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    assert.ok(overflow <= 1, `${width}px 整页横向溢出 ${overflow}px`);
    await structure.evaluate((element) => element.scrollIntoView({ block: "start" }));
    await page.screenshot({ path: join(out, `template-detail-${width}.png`), fullPage: true });
    assert.deepEqual(errors, []);
    await page.keyboard.press("Escape");
    await detail.waitFor({ state: "detached" });
  }
  await context.close();
  console.log("PASS 结构模板表单九站预置、编辑保存、版本字段与 390/1440 详情");
} finally {
  await browser.close();
  await app.close();
}
