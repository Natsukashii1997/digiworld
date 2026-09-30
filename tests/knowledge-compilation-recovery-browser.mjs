import { createRequire } from "node:module";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import assert from "node:assert/strict";
import { compilationFixture, makeCandidate } from "./compilation-fixture.mjs";

const { chromium } = createRequire(import.meta.url)(
  process.env.PLAYWRIGHT_MODULE ||
    "/Users/nat/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright",
);
const output =
  process.env.GUIJI_TEST_RESULTS ||
  "test-results/knowledge-compilation-recovery";
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ headless: true });
const report = { cases: [], errors: [], failure: null };

async function prepare(app) {
  const selections = [];
  for (const [index, root] of app.roots.entries()) {
    const connected = await app.call("/knowledge/connect", {
      name: `恢复测试来源 ${index + 1}`,
      kind: "markdown",
      root,
      confirmed: true,
      expectedRevision: (await app.workspace()).revision,
    });
    assert.equal(connected.status, 200);
    const sourceId = connected.body.connections.knowledgeSources.at(-1).id;
    const scan = (await app.call("/knowledge/scan", { sourceId })).body;
    const path = index === 0 ? "专题/判断原则.md" : "复盘.md";
    const document = (
      await app.call("/knowledge/read", { sourceId, scanId: scan.scanId, path })
    ).body;
    selections.push({
      sourceId,
      scanId: scan.scanId,
      path,
      expectedSha256: document.sha256,
    });
  }
  return selections;
}

async function runCase(mode, status) {
  const app = await compilationFixture();
  const context = await browser.newContext({
    viewport: { width: 1280, height: 900 },
    reducedMotion: "reduce",
  });
  const page = await context.newPage();
  page.setDefaultTimeout(5000);
  page.on("pageerror", (error) => report.errors.push(error.message));
  const result = { mode, status, passed: false, failure: null };
  const button = (name) => page.getByRole("button", { name, exact: true });
  const dialog = () =>
    page.getByRole("dialog", { name: "整理任务", exact: true });
  const question = `合成 ${mode} 提交后 ${status} 的恢复验证`;
  let calls = 0;
  let input;
  try {
    const originals = await app.originals();
    const selections = await prepare(app);
    let task;
    if (mode !== "create") {
      const created = await app.call("/knowledge/tasks/create", {
        question,
        selections,
        confirmed: true,
        requestId: randomUUID(),
        expectedRevision: (await app.workspace()).revision,
      });
      assert.equal(created.status, 200);
      task = created.body.state.knowledgeTasks[0];
    }
    await page.goto(app.url + "/#knowledge");
    if (mode === "create") {
      for (const [index, path] of ["专题/判断原则.md", "复盘.md"].entries()) {
        await page
          .getByRole("navigation", { name: "知识源", exact: true })
          .getByRole("button")
          .filter({ hasText: `恢复测试来源 ${index + 1}` })
          .click();
        await button("扫描文件").click();
        await button(path).click();
        await button("加入整理").click();
      }
      await page.getByLabel("整理问题", { exact: true }).fill(question);
      await page
        .getByLabel("我确认仅交给本人 Codex，任务与候选保存在工作台", {
          exact: true,
        })
        .check();
    } else {
      await button("打开整理任务：" + question).click();
      if (mode === "receive") {
        await page.getByLabel("候选 JSON 文件", { exact: true }).setInputFiles({
          name: "recovery-candidate.json",
          mimeType: "application/json",
          buffer: Buffer.from(JSON.stringify(makeCandidate(task))),
        });
      } else await button("归档任务").click();
    }
    page.on("request", (request) => {
      if (request.url().endsWith(`/api/knowledge/tasks/${mode}`)) calls++;
    });
    await page.route(
      `**/api/knowledge/tasks/${mode}`,
      async (route) => {
        input = route.request().postDataJSON();
        const response = await route.fetch();
        assert.equal(response.status(), 200, "服务端必须先完成真实合成写入");
        await route.fulfill({
          status,
          contentType: "application/json",
          body: JSON.stringify({ error: `合成：写入后返回 ${status}` }),
        });
      },
      { times: 1 },
    );
    const action = {
      create: "创建整理任务",
      receive: "导入候选",
      archive: "确认归档",
    }[mode];
    await button(action).click();
    await page
      .getByRole("alert")
      .filter({ hasText: `写入后返回 ${status}` })
      .waitFor();
    assert.equal(
      await button(action).isDisabled(),
      true,
      `${mode} ${status} 后必须冻结重复提交`,
    );
    assert.equal(await page.getByText(/操作结果待核对/).count(), 1);
    assert.equal(calls, 1, "5xx 不得自动重试写入");
    let stored = await app.workspace();
    assert.equal(stored.knowledgeTasks.length, 1);
    task = stored.knowledgeTasks[0];
    if (mode === "create") {
      assert.equal(
        await page.getByLabel("整理问题", { exact: true }).inputValue(),
        question,
      );
      assert.equal(
        await page.getByText("已选择 2 / 5 份资料", { exact: true }).count(),
        1,
      );
      assert.equal(
        await page
          .getByLabel("我确认仅交给本人 Codex，任务与候选保存在工作台", {
            exact: true,
          })
          .isChecked(),
        true,
      );
      await button("刷新整理任务").click();
      await dialog()
        .getByRole("heading", { name: question, exact: true })
        .waitFor();
      assert.equal(
        await page.getByLabel("整理问题", { exact: true }).inputValue(),
        "",
      );
      const repeated = await app.call("/knowledge/tasks/create", input);
      assert.equal(repeated.status, 200);
      assert.equal(repeated.body.taskId, task.id);
      assert.equal(repeated.body.state.revision, stored.revision);
    } else if (mode === "receive") {
      const file = page.getByLabel("候选 JSON 文件", { exact: true });
      assert.equal(await file.evaluate((el) => el.files.length), 1);
      assert.equal(stored.knowledgeTasks[0].candidates.length, 1);
      await dialog()
        .getByRole("button", { name: "刷新整理任务", exact: true })
        .click();
      await dialog()
        .getByRole("heading", { name: makeCandidate(task).title, exact: true })
        .waitFor();
      assert.equal(
        await file.evaluate((el) => el.files.length),
        1,
        "回读核对前不丢失失败文件",
      );
      assert.equal(calls, 1, "刷新只读回状态，不重放导入");
      await button("导入候选").click();
      await page.waitForFunction(
        () => document.querySelector('input[type="file"]')?.files.length === 0,
      );
      stored = await app.workspace();
      assert.equal(stored.knowledgeTasks[0].candidates.length, 1);
      assert.equal(calls, 2, "只有用户显式重试才再次导入，且不增加重复版本");
    } else {
      assert.equal(task.archived, true);
      await dialog()
        .getByRole("button", { name: "刷新整理任务", exact: true })
        .click();
      await dialog().getByText("已归档", { exact: true }).waitFor();
      assert.equal(
        await dialog()
          .getByRole("button", { name: "确认归档", exact: true })
          .count(),
        0,
      );
      const repeated = await app.call("/knowledge/tasks/archive", {
        taskId: task.id,
        expectedRevision: stored.revision,
      });
      assert.equal(repeated.status, 200);
      assert.equal(repeated.body.state.revision, stored.revision);
      assert.equal(calls, 1, "刷新归档状态不自动重试归档");
    }
    assert.equal(await page.getByText(/操作结果待核对/).count(), 0);
    assert.equal((await app.workspace()).knowledgeTasks.length, 1);
    assert.deepEqual(await app.originals(), originals);
    result.passed = true;
  } catch (error) {
    result.failure = error.stack;
    await page
      .screenshot({ path: join(output, `${mode}-${status}-failure.png`) })
      .catch(() => {});
  } finally {
    report.cases.push(result);
    await context.close();
    await app.close();
  }
}

try {
  for (const mode of ["create", "receive", "archive"])
    for (const status of [500, 503]) await runCase(mode, status);
  assert.deepEqual(report.errors, []);
  assert.ok(
    report.cases.every((result) => result.passed),
    "已提交写入的 5xx 恢复用例未全部通过",
  );
} catch (error) {
  report.failure = error.message;
  process.exitCode = 1;
} finally {
  await writeFile(join(output, "report.json"), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report));
  await browser.close();
}
