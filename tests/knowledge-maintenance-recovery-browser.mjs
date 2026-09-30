import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { join } from "node:path";
import { createRequire } from "node:module";
import { knowledgeFixture } from "./knowledge-fixture.mjs";
const require = createRequire(import.meta.url);
const { chromium } = require(
  process.env.PLAYWRIGHT_MODULE ||
    "/Users/nat/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright",
);
const browser = await chromium.launch({ headless: true });
const output = process.env.GUIJI_TEST_RESULTS || "test-results/v017-recovery";
await fs.mkdir(output, { recursive: true });
const report = { flows: [], failure: null };
try {
  for (const mode of [
    "inflight-refresh",
    "close-reopen",
    "reload-after-commit",
  ]) {
    let beforeOpen = async () => {},
      release,
      reached,
      creating;
    const held = new Promise((resolve) => {
      release = resolve;
    });
    const ready = new Promise((resolve) => {
      reached = resolve;
    });
    const app = await knowledgeFixture({
      filesystem: {
        ...fs,
        async open(...args) {
          await beforeOpen();
          return fs.open(...args);
        },
      },
    });
    const page = await browser.newPage();
    page.setDefaultTimeout(5000);
    const button = (name) => page.getByRole("button", { name, exact: true });
    try {
      const connected = (
        await app.call("/knowledge/connect", {
          name: "合成恢复库",
          kind: "markdown",
          root: app.root,
          confirmed: true,
          expectedRevision: (await app.workspace()).revision,
        })
      ).body;
      const source = connected.connections.knowledgeSources[0];
      const scan = (await app.call("/knowledge/scan", { sourceId: source.id }))
        .body;
      const selection = {
        sourceId: source.id,
        scanId: scan.scanId,
        path: "专题/判断原则.md",
      };
      const document = (await app.call("/knowledge/read", selection)).body;
      await app.call("/knowledge/tasks/create", {
        question: "恢复中的任务",
        selections: [{ ...selection, expectedSha256: document.sha256 }],
        confirmed: true,
        requestId: "recovery-ui",
        expectedRevision: connected.revision,
      });
      await page.goto(app.url + "/#knowledge");
      await button("打开整理任务：恢复中的任务").click();
      await button("预览重新整理").click();
      await page
        .getByLabel("我已核对当前资料，确认新建任务并保留旧历史", {
          exact: true,
        })
        .check();
      await page.route("**/api/knowledge/maintenance/create", async (route) => {
        beforeOpen = async () => {
          beforeOpen = async () => {};
          reached();
          await held;
        };
        creating = app.call(
          "/knowledge/maintenance/create",
          route.request().postDataJSON(),
        );
        await ready;
        await route.fulfill({
          status: 503,
          contentType: "application/json",
          body: JSON.stringify({ error: "合成响应丢失，原请求仍在处理" }),
        });
      });
      await button("创建新整理任务").click();
      await button("刷新确认新任务").waitFor();
      if (mode === "close-reopen") {
        await page.keyboard.press("Escape");
        await button("打开整理任务：恢复中的任务").click();
        await button("预览重新整理").click();
      } else if (mode === "inflight-refresh") {
        await button("刷新确认新任务").click();
      }
      if (mode !== "reload-after-commit") {
        await page
          .getByText("原创建请求仍在处理，请稍后再次核对。", { exact: true })
          .waitFor();
        assert.equal(await button("预览重新整理").isDisabled(), true);
        assert.equal((await app.workspace()).knowledgeTasks.length, 1);
      }
      release();
      assert.equal((await creating).status, 200);
      await page.unroute("**/api/knowledge/maintenance/create");
      if (mode === "reload-after-commit") {
        // Lose all component-local pending IDs, then recover via persisted lineage.
        await page.reload();
        await button("打开整理任务：恢复中的任务").click();
        assert.equal(
          await page.getByLabel("当前原文 1", { exact: true }).count(),
          0,
        );
        await page.getByRole("button", { name: /^查看后续任务/ }).click();
      } else {
        await button("刷新确认新任务").click();
      }
      await button("查看原任务").waitFor();
      assert.equal((await app.workspace()).knowledgeTasks.length, 2);
      await page.screenshot({ path: join(output, mode + ".png") });
      report.flows.push(mode);
    } finally {
      release();
      await creating?.catch(() => {});
      await page.close();
      await app.close();
    }
  }
} catch (error) {
  report.failure = error.stack;
  throw error;
} finally {
  await browser.close();
  await fs.writeFile(
    join(output, "report.json"),
    JSON.stringify(report, null, 2),
  );
  console.log(JSON.stringify(report));
}
