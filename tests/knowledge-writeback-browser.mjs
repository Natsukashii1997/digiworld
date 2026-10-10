import {authorizeCapability} from './capability-fixture.mjs';
import { createRequire } from "node:module";
import fs from "node:fs/promises";
import { join } from "node:path";
import assert from "node:assert/strict";
import AxeBuilder from "@axe-core/playwright";
import { knowledgeFixture } from "./knowledge-fixture.mjs";
const require = createRequire(import.meta.url);
const { chromium } = require(
  process.env.PLAYWRIGHT_MODULE ||
    "/Users/nat/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright",
);
const output = process.env.GUIJI_TEST_RESULTS || "test-results/v016-writeback";
await fs.mkdir(output, { recursive: true });
const app = await knowledgeFixture();
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({
  viewport: { width: 1280, height: 720 },
  reducedMotion: "reduce",
});
const page = await context.newPage();
page.setDefaultTimeout(7000);
const report = { flows: [], axe: [], geometry: [], errors: [], failure: null };
page.on("pageerror", (error) => report.errors.push(error.message));
const button = (name) => page.getByRole("button", { name, exact: true });
async function capture(name) {
  if (await button("关闭提示").count()) await button("关闭提示").click();
  await page.screenshot({ path: join(output, name + ".png") });
  const result = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
    .analyze();
  report.axe.push({ state: name, violations: result.violations });
  assert.deepEqual(result.violations, []);
}
try {
  await fs.mkdir(join(app.root, "00 待整理/工作/个人"), { recursive: true });
  let state = await app.workspace();
  state = (
    await app.call("/knowledge/connect", {
      name: "合成 Obsidian",
      root: app.root,
      kind: "obsidian",
      confirmed: true,
      expectedRevision: state.revision,
    })
  ).body;
  const source = state.connections.knowledgeSources[0];
  await authorizeCapability(app,'vault',{sourceId:source.id,notesFolder:'00 待整理',profileFolders:[]});
  const scan = (await app.call("/knowledge/scan", { sourceId: source.id }))
    .body;
  const selected = {
    sourceId: source.id,
    scanId: scan.scanId,
    path: "专题/判断原则.md",
  };
  const original = (await app.call("/knowledge/read", selected)).body;
  const created = (
    await app.call("/knowledge/tasks/create", {
      question: "合成库的判断原则",
      selections: [{ ...selected, expectedSha256: original.sha256 }],
      confirmed: true,
      requestId: "ui-writeback",
      expectedRevision: state.revision,
    })
  ).body;
  const task = created.state.knowledgeTasks[0];
  await app.call("/knowledge/tasks/receive", {
    taskId: task.id,
    expectedRevision: created.state.revision,
    candidate: {
      schema: 1,
      taskId: task.id,
      manifestHash: task.manifestHash,
      title: "判断候选",
      summary: "先核实证据，再作判断。",
      claims: [
        {
          id: "c1",
          text: "一次案例不能证明普遍规律",
          kind: "analysis",
          evidenceIds: [task.evidence[0].id],
        },
      ],
      conflicts: [],
      unknowns: ["长期效果未知"],
      relations: [],
    },
  });
  await page.goto(app.url + "/#knowledge");
  await page.getByRole("button", { name: /合成库的判断原则/ }).click();
  await button("核对保存记录").click();
  await page.getByText("本任务尚无保存记录。", { exact: true }).waitFor();
  await page
    .getByLabel("保存目标知识库", { exact: true })
    .selectOption(source.id);
  await button("预览保存").click();
  await page
    .getByRole("heading", { name: "新建文件预览", exact: true })
    .waitFor();
  assert.equal(await button("确认保存候选").isDisabled(), true);
  assert.match(
    await page.getByLabel("候选变更全文", { exact: true }).inputValue(),
    /retrieval: 停用/,
  );
  await page.waitForFunction(
    () =>
      document.activeElement?.getAttribute("aria-label") === "确认候选文件变更",
  );
  const previewHeading = await page
    .getByRole("heading", { name: "新建文件预览", exact: true })
    .boundingBox();
  const dialogHeader = await page.locator(".dialog-top").boundingBox();
  assert.ok(
    previewHeading.y >= dialogHeader.y + dialogHeader.height,
    "预览标题不能被固定弹窗标题栏遮挡",
  );
  await capture("01-preview-1280");
  report.flows.push("preview exact file and confirm guard");
  for (const width of [320, 375, 393, 430, 768, 1280]) {
    await page.setViewportSize({ width, height: 900 });
    await page
      .getByRole("heading", { name: "新建文件预览", exact: true })
      .scrollIntoViewIfNeeded();
    const geometry = await page
      .locator('[role="dialog"]')
      .evaluate((element) => ({
        width: innerWidth,
        overflow: element.scrollWidth > element.clientWidth + 1,
        pageOverflow: document.documentElement.scrollWidth > innerWidth + 1,
      }));
    report.geometry.push(geometry);
    assert.equal(geometry.overflow, false);
    assert.equal(geometry.pageOverflow, false);
    await capture(`02-preview-${width}`);
  }
  report.flows.push("six responsive widths");
  // The real server commits. Only the response is lost: recovery must query,
  // never repeat the write or pretend it failed before touching the target.
  await page.route("**/api/knowledge/writes/apply", async (route) => {
    await route.fetch();
    await route.fulfill({
      status: 503,
      contentType: "application/json",
      body: JSON.stringify({ error: "合成响应丢失" }),
    });
  });
  await page
    .getByLabel(
      "我已审阅全文、来源与位置，确认仅将这一版保存为本人待整理候选",
      { exact: true },
    )
    .check();
  await button("确认保存候选").click();
  await page
    .getByText("操作结果待核对。请先核对保存记录，不要重复保存或撤回。", {
      exact: true,
    })
    .waitFor();
  assert.equal(await button("预览保存").isDisabled(), true);
  await capture("03-unknown-1280");
  await button("核对保存记录").click();
  await page.getByText("已保存并核验", { exact: true }).waitFor();
  await page.unroute("**/api/knowledge/writes/apply");
  report.flows.push("postcommit503 freezes and history recovers");
  await page.reload();
  await page.getByRole("button", { name: /合成库的判断原则/ }).click();
  await button("核对保存记录").click();
  await page.getByText("已保存并核验", { exact: true }).waitFor();
  report.flows.push("reload preserves durable evidence");
  await button("预览撤回").click();
  await page
    .getByRole("heading", { name: "撤回文件预览", exact: true })
    .waitFor();
  await capture("04-rollback-1280");
  await page
    .getByLabel("我确认撤回这一个文件，并保留本机恢复记录", { exact: true })
    .check();
  await button("确认撤回候选").click();
  await page.getByText("已撤回", { exact: true }).waitFor();
  await assert.rejects(
    fs.stat(join(app.root, "00 待整理/工作/个人/判断候选.md")),
    { code: "ENOENT" },
  );
  await page.getByText("本机恢复全文", { exact: true }).click();
  assert.match(
    await page.getByRole("textbox", { name: /^恢复全文/ }).inputValue(),
    /长期效果未知/,
  );
  await page.setViewportSize({ width: 375, height: 812 });
  await page.getByText("已撤回", { exact: true }).scrollIntoViewIfNeeded();
  await capture("05-rolledback-375");
  report.flows.push("explicit rollback retains full recovery text");
  assert.deepEqual(report.errors, []);
} catch (error) {
  report.failure = { message: error.message, stack: error.stack };
  await page.screenshot({ path: join(output, "failure.png") }).catch(() => {});
  throw error;
} finally {
  await fs.writeFile(
    join(output, "report.json"),
    JSON.stringify(report, null, 2),
  );
  await browser.close();
  await app.close();
}
console.log(
  JSON.stringify({
    flows: report.flows.length,
    axe: report.axe.length,
    output,
  }),
);
