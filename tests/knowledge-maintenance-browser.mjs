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
const output =
  process.env.GUIJI_TEST_RESULTS || "test-results/v017-maintenance";
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
const heldResponses = [];
async function holdResponse(path) {
  let resume, arrived;
  const held = new Promise((resolve) => {
    resume = resolve;
  });
  const ready = new Promise((resolve) => {
    arrived = resolve;
  });
  heldResponses.push(resume);
  const pattern = `**/api${path}`;
  const handler = async (route) => {
    const response = await route.fetch();
    arrived();
    await held;
    await route.fulfill({ response });
  };
  await page.route(pattern, handler);
  return {
    ready,
    async release() {
      // Subscribe before releasing: a fast local response must not be missed.
      const completed = page.waitForResponse((r) => r.url().endsWith(path));
      resume();
      const response = await completed;
      assert.equal(response.status(), 200);
      await response.finished();
    },
    remove: () => page.unroute(pattern, handler),
  };
}
async function tabTo(target) {
  for (let step = 0; step < 40; step++) {
    if (
      await target.evaluate((element) => element === document.activeElement)
    ) {
      const outline = await target.evaluate((element) => ({
        style: getComputedStyle(element).outlineStyle,
        width: getComputedStyle(element).outlineWidth,
      }));
      assert.notEqual(outline.style, "none");
      assert.ok(parseFloat(outline.width) > 0);
      return;
    }
    await page.keyboard.press("Tab");
  }
  assert.fail("键盘无法到达维护控件");
}
async function capture(name) {
  if (await button("关闭提示").count()) await button("关闭提示").click();
  await page.screenshot({ path: join(output, `${name}.png`) });
  const result = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
    .analyze();
  report.axe.push({ state: name, violations: result.violations });
  assert.deepEqual(result.violations, []);
}
try {
  let state = (
    await app.call("/knowledge/connect", {
      name: "合成资料库",
      kind: "obsidian",
      root: app.root,
      confirmed: true,
      expectedRevision: (await app.workspace()).revision,
    })
  ).body;
  const source = state.connections.knowledgeSources[0];
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
      question: "来源更新后如何复核判断",
      selections: [{ ...selected, expectedSha256: original.sha256 }],
      confirmed: true,
      requestId: "ui-maintenance",
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
      title: "原有判断",
      summary: "综合认识仍需要重新核实",
      claims: [
        {
          id: "c1",
          text: "一次案例不能证明普遍规律",
          kind: "analysis",
          evidenceIds: [task.evidence[0].id],
        },
      ],
      conflicts: [],
      unknowns: ["其他情境未知"],
      relations: [],
    },
  });
  await page.goto(app.url + "/#knowledge");
  await fs.mkdir(join(app.directory, "knowledge-writes"), { recursive: true });
  await fs.writeFile(
    join(app.directory, "knowledge-writes", "broken.json"),
    "broken",
  );
  await button("检查来源变化").click();
  await page
    .getByText("1 个任务的保存记录无法核验，不代表没有保存。", { exact: true })
    .waitFor();
  await capture("00-unavailable-records");
  await fs.unlink(join(app.directory, "knowledge-writes", "broken.json"));
  report.flows.push(
    "unavailable history stays visible even when source is unchanged",
  );
  await app.changeFile();
  await button("检查来源变化").click();
  await page
    .getByText("已检查 1 / 1 个任务 · 需复核 1", { exact: true })
    .waitFor();
  await page.getByText("复核范围 · 1 个候选版本", { exact: true }).click();
  await page.getByText("一次案例不能证明普遍规律", { exact: true }).waitFor();
  await capture("01-impact-desktop");
  report.flows.push("changed evidence reveals candidate claims");
  await button("打开任务").click();
  await button("预览重新整理").click();
  await page.getByLabel("当前原文 1", { exact: true }).waitFor();
  assert.equal(
    await page.getByLabel("当前原文 1", { exact: true }).inputValue(),
    "# 更新后的合成原文\n",
  );
  assert.equal(await button("创建新整理任务").isDisabled(), true);
  await page.waitForFunction(
    () => document.activeElement?.getAttribute("aria-label") === "当前资料预览",
  );
  const preview = await page
    .getByRole("heading", { name: "当前资料 · 1 份", exact: true })
    .boundingBox();
  const chrome = await page.locator(".dialog-top").boundingBox();
  assert.ok(
    preview.y >= chrome.y + chrome.height,
    "预览标题不得被固定标题栏遮挡",
  );
  await capture("02-preview-desktop");
  await button("取消预览").click();
  assert.equal((await app.workspace()).knowledgeTasks.length, 1);
  const beforeMissing = await app.workspace();
  const sourcePath = join(app.root, "专题/判断原则.md");
  await fs.rename(sourcePath, sourcePath + ".parked");
  const missingPreview = page.waitForResponse((r) =>
    r.url().endsWith("/knowledge/maintenance/preview"),
  );
  await button("预览重新整理").click();
  assert.equal((await missingPreview).status(), 404);
  await page.locator('[aria-label="重新整理"] [role="alert"]').waitFor();
  assert.equal(await page.getByLabel("当前原文 1", { exact: true }).count(), 0);
  assert.deepEqual(await app.workspace(), beforeMissing);
  await capture("02-missing-preview");
  await fs.rename(sourcePath + ".parked", sourcePath);
  const confirmation = page.getByLabel(
    "我已核对当前资料，确认新建任务并保留旧历史",
    { exact: true },
  );
  // The missing-file error is recoverable; complete cancel and create by keyboard.
  for (const action of ["取消预览", "创建新整理任务"]) {
    await page.keyboard.press("Tab");
    await tabTo(button("预览重新整理"));
    await page.keyboard.press("Enter");
    await page.getByLabel("当前原文 1", { exact: true }).waitFor();
    await tabTo(confirmation);
    if (action === "取消预览")
      await page.screenshot({ path: join(output, "02-keyboard-confirm.png") });
    await page.keyboard.press("Space");
    assert.equal(await confirmation.isChecked(), true);
    await tabTo(button(action));
    await page.keyboard.press("Enter");
    if (action === "取消预览") {
      assert.deepEqual(await app.workspace(), beforeMissing);
      assert.equal(
        await page.getByLabel("当前原文 1", { exact: true }).count(),
        0,
      );
    }
  }
  report.flows.push(
    "missing preview recovers without writes; keyboard preview confirm cancel and create",
  );
  await button("查看原任务").waitFor();
  state = await app.workspace();
  assert.equal(state.knowledgeTasks.length, 2);
  const next = state.knowledgeTasks.find(
    (item) => item.basedOn?.taskId === task.id,
  );
  assert.ok(next);
  assert.equal(next.candidates.length, 0);
  assert.equal(
    state.knowledgeTasks.find((item) => item.id === task.id).candidates.length,
    1,
  );
  await capture("03-renewed-desktop");
  await button("查看原任务").click();
  await page.getByText("原有判断", { exact: true }).waitFor();
  await page.getByRole("button", { name: /^查看后续任务/ }).click();
  await button("查看原任务").waitFor();
  report.flows.push(
    "preview cancel confirmation creates fresh related task and navigates history",
  );
  await page.reload();
  await page.getByRole("button", { name: /打开整理任务：.*重新整理/ }).click();
  await button("查看原任务").waitFor();
  report.flows.push("reload preserves lineage");
  const longText =
    "# 当前合成原文\n" +
    "LongEvidence中文条件与例外_".repeat(1000) +
    "\n<script>window.knowledgeExecuted=true</script>\n![外部图片](https://example.invalid/private.png)";
  await fs.writeFile(join(app.root, "专题/判断原则.md"), longText);
  await button("预览重新整理").click();
  await page.getByLabel("当前原文 1", { exact: true }).waitFor();
  assert.equal(
    await page.getByLabel("当前原文 1", { exact: true }).inputValue(),
    longText,
  );
  for (const width of [320, 375, 393, 430, 1280]) {
    await page.setViewportSize({ width, height: 900 });
    await page
      .getByRole("heading", { name: "当前资料 · 1 份", exact: true })
      .scrollIntoViewIfNeeded();
    const geometry = await page
      .locator('[role="dialog"]')
      .evaluate((element) => ({
        width: innerWidth,
        overflow: element.scrollWidth > element.clientWidth + 1,
        pageOverflow: document.documentElement.scrollWidth > innerWidth + 1,
        smallButtons: [...element.querySelectorAll("button")]
          .filter((item) => {
            const rect = item.getBoundingClientRect();
            return rect.width > 0 && (rect.width < 44 || rect.height < 44);
          })
          .map((item) => item.textContent),
      }));
    report.geometry.push(geometry);
    assert.equal(geometry.overflow, false);
    assert.equal(geometry.pageOverflow, false);
    assert.deepEqual(geometry.smallButtons, []);
    await capture(`04-long-preview-${width}`);
  }
  assert.equal(await page.evaluate(() => window.knowledgeExecuted), undefined);
  assert.equal(await page.locator('img[src*="example.invalid"]').count(), 0);
  await page
    .getByLabel("我已核对当前资料，确认新建任务并保留旧历史", { exact: true })
    .check();
  // Hold a real committed response to verify busy/close guards before losing it.
  let release, committed;
  const hold = new Promise((resolve) => {
    release = resolve;
  });
  const reached = new Promise((resolve) => {
    committed = resolve;
  });
  let creates = 0;
  await page.route("**/api/knowledge/maintenance/create", async (route) => {
    creates++;
    const response = await route.fetch();
    assert.equal(response.status(), 200);
    committed();
    await hold;
    await route.fulfill({
      status: 503,
      contentType: "application/json",
      body: JSON.stringify({ error: "合成响应丢失" }),
    });
  });
  await button("创建新整理任务").click();
  await reached;
  await page.keyboard.press("Escape");
  assert.equal(await page.getByRole("dialog").count(), 1);
  assert.equal(await button("创建中…").isDisabled(), true);
  assert.equal(await button("取消预览").isDisabled(), true);
  await capture("05-creating");
  release();
  await page
    .getByText("创建结果待核对。请先刷新确认，不要重复提交。", { exact: true })
    .waitFor();
  assert.equal(await button("预览重新整理").isDisabled(), true);
  await capture("06-unknown");
  await page.route("**/api/knowledge/maintenance/recover", (route) =>
    route.fulfill({
      status: 503,
      contentType: "application/json",
      body: JSON.stringify({ error: "合成恢复查询暂时失败" }),
    }),
  );
  await button("刷新确认新任务").click();
  await page.getByText("合成恢复查询暂时失败", { exact: true }).waitFor();
  assert.equal(await button("预览重新整理").isDisabled(), true);
  assert.equal(await button("创建新整理任务").count(), 0);
  assert.equal(creates, 1);
  await capture("06-recovery-unavailable");
  await page.unroute("**/api/knowledge/maintenance/recover");
  await button("刷新确认新任务").click();
  await page.getByText("已找回新整理任务", { exact: true }).waitFor();
  assert.equal(creates, 1);
  assert.equal((await app.workspace()).knowledgeTasks.length, 3);
  await page.unroute("**/api/knowledge/maintenance/create");
  report.flows.push(
    "long text five widths literal content busy Escape guard and postcommit503 recovery including failed lookup",
  );
  await button("预览重新整理").click();
  await page
    .getByLabel("我已核对当前资料，确认新建任务并保留旧历史", { exact: true })
    .check();
  app.advance(300001);
  await button("创建新整理任务").click();
  await page
    .getByText("创建结果待核对。请先刷新确认，不要重复提交。", { exact: true })
    .waitFor();
  await button("刷新确认新任务").click();
  await page
    .getByText("未找到新任务，请重新预览后再创建。", { exact: true })
    .waitFor();
  assert.equal((await app.workspace()).knowledgeTasks.length, 3);
  await capture("07-expired-recovered");
  report.flows.push("expired confirmation refreshes before a fresh preview");
  const currentScan = (
    await app.call("/knowledge/scan", { sourceId: source.id })
  ).body;
  const currentSelection = {
    sourceId: source.id,
    scanId: currentScan.scanId,
    path: selected.path,
  };
  const currentDocument = (await app.call("/knowledge/read", currentSelection))
    .body;
  for (let index = 0; index < 5; index++) {
    const result = await app.call("/knowledge/tasks/create", {
      question:
        `长任务 ${index}：` + "LongQuestion中文判断与适用范围_".repeat(20),
      selections: [
        { ...currentSelection, expectedSha256: currentDocument.sha256 },
      ],
      confirmed: true,
      requestId: `maintenance-more-${index}`,
      expectedRevision: (await app.workspace()).revision,
    });
    assert.equal(result.status, 200);
  }
  await page.reload();
  await button("检查来源变化").click();
  await page.getByText(/已检查 5 \/ 8 个任务/).waitFor();
  await button("继续检查").click();
  await page.getByText(/已检查 8 \/ 8 个任务/).waitFor();
  assert.equal(await button("继续检查").count(), 0);
  for (const width of [320, 375, 393, 430, 1280]) {
    await page.setViewportSize({ width, height: 900 });
    await page
      .getByRole("heading", { name: "来源变化", exact: true })
      .scrollIntoViewIfNeeded();
    assert.equal(
      await page.evaluate(
        () => document.documentElement.scrollWidth > innerWidth + 1,
      ),
      false,
    );
    assert.equal(
      await page
        .locator(".knowledge-impact")
        .evaluate((element) => element.scrollWidth > element.clientWidth + 1),
      false,
    );
    await capture(`08-impact-${width}`);
  }
  report.flows.push("paged checks include historical tasks and long questions");
  await button("检查来源变化").click();
  await page.getByText(/已检查 5 \/ 8 个任务/).waitFor();
  await app.call("/knowledge/tasks/archive", {
    taskId: task.id,
    expectedRevision: (await app.workspace()).revision,
  });
  await button("继续检查").click();
  await page.getByText(/请刷新整理任务后重新检查/).waitFor();
  assert.equal(await page.getByText(/已检查 \d+ \/ \d+ 个任务/).count(), 0);
  assert.equal(await button("继续检查").count(), 0);
  await capture("09-stale-page");
  const firstRefresh = page.waitForResponse((r) =>
    r.url().endsWith("/workspace"),
  );
  await button("刷新整理任务").click();
  assert.equal((await firstRefresh).status(), 200);
  await button("刷新整理任务").waitFor();
  report.flows.push("revision change clears the complete previous report");
  // Keep the previous toast present. Only this refresh's response and the
  // restored button establish completion; the identical toast cannot do so.
  for (const order of ["impact-first", "refresh-first"]) {
    const impact = await holdResponse("/knowledge/maintenance/impact");
    await button("检查来源变化").click();
    await impact.ready;
    const workspace = await holdResponse("/workspace");
    await button("刷新整理任务").click();
    await workspace.ready;
    assert.equal(await button("刷新中…").isDisabled(), true);
    if (order === "impact-first") {
      await impact.release();
      await page.getByText(/已检查 5 \/ 8 个任务/).waitFor();
      assert.equal(await button("继续检查").isDisabled(), true);
    }
    await workspace.release();
    await button("刷新整理任务").waitFor();
    await page
      .getByText(/已检查 \d+ \/ \d+ 个任务/)
      .waitFor({ state: "hidden" });
    if (order === "refresh-first") await impact.release();
    // Flush response handling and a render, without a timing-based sleep.
    await page.evaluate(
      () =>
        new Promise((resolve) =>
          requestAnimationFrame(() => requestAnimationFrame(resolve)),
        ),
    );
    assert.equal(await page.getByText(/已检查 \d+ \/ \d+ 个任务/).count(), 0);
    await workspace.remove();
    await impact.remove();
    report.flows.push(`refresh invalidates impact response: ${order}`);
  }
  await button("检查来源变化").click();
  await page.getByText(/已检查 5 \/ 8 个任务/).waitFor();
  const beforeFailedRefresh = await app.workspace();
  await page.route("**/api/workspace", (route) =>
    route.fulfill({
      status: 503,
      contentType: "application/json",
      body: JSON.stringify({ error: "合成任务刷新失败" }),
    }),
  );
  await button("刷新整理任务").click();
  await page.getByText("合成任务刷新失败", { exact: true }).waitFor();
  assert.equal(await button("刷新整理任务").isDisabled(), false);
  assert.equal(await page.getByText(/已检查 5 \/ 8 个任务/).count(), 1);
  assert.deepEqual(await app.workspace(), beforeFailedRefresh);
  await page.unroute("**/api/workspace");
  const retried = page.waitForResponse((r) => r.url().endsWith("/workspace"));
  await button("刷新整理任务").click();
  assert.equal((await retried).status(), 200);
  await button("刷新整理任务").waitFor();
  await page.getByText(/已检查 \d+ \/ \d+ 个任务/).waitFor({ state: "hidden" });
  report.flows.push(
    "failed workspace refresh retains dated report until a successful retry",
  );
  assert.deepEqual(report.errors, []);
} catch (error) {
  report.failure = error.stack;
  await page.screenshot({ path: join(output, "failure.png") }).catch(() => {});
  throw error;
} finally {
  heldResponses.forEach((release) => release());
  await fs.writeFile(
    join(output, "report.json"),
    JSON.stringify(report, null, 2),
  );
  await browser.close();
  await app.close();
  console.log(
    JSON.stringify({
      flows: report.flows.length,
      axe: report.axe.length,
      failure: report.failure?.split("\n")[0] || null,
    }),
  );
}
