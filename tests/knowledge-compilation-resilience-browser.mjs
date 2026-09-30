import { createRequire } from "node:module";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import assert from "node:assert/strict";
import AxeBuilder from "@axe-core/playwright";
import {
  compilationFixture,
  makeCandidate,
  principle,
} from "./compilation-fixture.mjs";
const { chromium } = createRequire(import.meta.url)(
  process.env.PLAYWRIGHT_MODULE ||
    "/Users/nat/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright",
);
const output =
  process.env.GUIJI_TEST_RESULTS ||
  "test-results/knowledge-compilation-resilience";
await mkdir(output, { recursive: true });
const app = await compilationFixture();
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({
  viewport: { width: 1280, height: 900 },
  reducedMotion: "reduce",
});
const page = await context.newPage();
page.setDefaultTimeout(7000);
const report = { flows: [], axe: [], errors: [], failure: null };
page.on("pageerror", (e) => report.errors.push(e.message));
const b = (name) => page.getByRole("button", { name, exact: true });
const dialog = () =>
  page.getByRole("dialog", { name: "整理任务", exact: true });
let release;
async function file(candidate) {
  await page.getByLabel("候选 JSON 文件", { exact: true }).setInputFiles({
    name: "candidate.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(candidate)),
  });
}
try {
  const selections = [];
  for (const [i, root] of app.roots.entries()) {
    const c = await app.call("/knowledge/connect", {
      name: "合成耐久来源 " + i,
      kind: "markdown",
      root,
      confirmed: true,
      expectedRevision: (await app.workspace()).revision,
    });
    const sourceId = c.body.connections.knowledgeSources.at(-1).id;
    const scan = (await app.call("/knowledge/scan", { sourceId })).body;
    const path = i === 0 ? "专题/判断原则.md" : "复盘.md";
    const doc = (
      await app.call("/knowledge/read", { sourceId, scanId: scan.scanId, path })
    ).body;
    selections.push({
      sourceId,
      scanId: scan.scanId,
      path,
      expectedSha256: doc.sha256,
    });
  }
  const created = await app.call("/knowledge/tasks/create", {
    question: "合成风险审核与恢复验证",
    selections,
    confirmed: true,
    requestId: randomUUID(),
    expectedRevision: (await app.workspace()).revision,
  });
  assert.equal(created.status, 200, created.body.error);
  const task = created.body.state.knowledgeTasks[0],
    candidate = makeCandidate(task);
  await page.goto(app.url + "/#knowledge");
  await b("打开整理任务：" + task.question).click();
  let observed;
  const begun = new Promise((resolve) => {
    observed = resolve;
  });
  const held = new Promise((resolve) => {
    release = resolve;
  });
  await page.route(
    "**/api/knowledge/tasks/receive",
    async (route) => {
      const response = await route.fetch();
      observed();
      await held;
      await route.fulfill({ response });
    },
    { times: 1 },
  );
  await file(candidate);
  await b("导入候选").click();
  await begun;
  await page.keyboard.press("Escape");
  assert.equal(
    await dialog().count(),
    1,
    "写入已提交但响应未到时，Escape不可丢失回读",
  );
  release();
  release = null;
  await dialog().getByText(candidate.title, { exact: true }).waitFor();
  assert.equal(
    await page
      .getByLabel("候选 JSON 文件", { exact: true })
      .evaluate((el) => el.files.length),
    0,
  );
  report.flows.push(
    "候选写入响应延迟期间Escape保留窗口，回读后清文件并显示新版本",
  );
  const next = {
    ...candidate,
    title: "后续候选：" + "长中文边界与证据 ".repeat(18),
    summary: "long_word_without_spaces_".repeat(140),
  };
  await page.route(
    "**/api/knowledge/tasks/receive",
    async (route) => {
      await route.fetch();
      await route.abort("failed");
    },
    { times: 1 },
  );
  await file(next);
  await b("导入候选").click();
  await dialog()
    .getByText(/操作结果待核对/)
    .waitFor();
  assert.equal(await b("导入候选").isDisabled(), true);
  assert.equal(
    await page
      .getByLabel("候选 JSON 文件", { exact: true })
      .evaluate((el) => el.files.length),
    1,
  );
  assert.equal((await app.workspace()).knowledgeTasks[0].candidates.length, 2);
  await dialog()
    .getByRole("button", { name: "刷新整理任务", exact: true })
    .click();
  await dialog().getByText(next.title, { exact: true }).waitFor();
  assert.equal(await b("导入候选").isEnabled(), true);
  await b("导入候选").click();
  await page.waitForFunction(
    () => document.querySelector('input[type="file"]')?.files.length === 0,
  );
  assert.equal((await app.workspace()).knowledgeTasks[0].candidates.length, 2);
  report.flows.push(
    "响应丢失不自动重放，保留候选文件；刷新找回已提交版本，显式重试仍幂等",
  );
  for (const width of [320, 375, 393, 430, 768, 1280]) {
    await page.setViewportSize({ width, height: 900 });
    const geometry = await page.evaluate(() => ({
      width: innerWidth,
      scroll: document.documentElement.scrollWidth,
      inputs: [
        ...document.querySelectorAll(
          '[role="dialog"] button,[role="dialog"] summary,[role="dialog"] input,[role="dialog"] select',
        ),
      ]
        .filter((el) => el.offsetWidth && el.type !== "checkbox")
        .map((el) => ({
          text: el.textContent?.trim().slice(0, 24),
          w: el.getBoundingClientRect().width,
          h: el.getBoundingClientRect().height,
        })),
    }));
    assert.ok(geometry.scroll <= width, JSON.stringify(geometry));
    assert.ok(
      geometry.inputs.every((el) => el.h >= 44 && el.w >= 44),
      JSON.stringify(geometry.inputs),
    );
    const a = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
      .analyze();
    report.axe.push({ width, violations: a.violations });
    assert.deepEqual(a.violations, []);
    await page.screenshot({ path: join(output, "long-" + width + ".png") });
    if (width === 375)
      await page
        .getByRole("region", { name: "整理候选", exact: true })
        .screenshot({ path: join(output, "candidate-long-375.png") });
  }
  report.flows.push("六宽度长中英文、控件尺寸与axe通过");
  await page.setViewportSize({ width: 1280, height: 900 });
  await page
    .getByLabel("我确认仅将任务文本交给本人 Codex", { exact: true })
    .check();
  await b("准备任务文本").click();
  await page
    .getByRole("textbox", { name: "整理任务文本", exact: true })
    .waitFor();
  await app.changeFile("专题/判断原则.md", principle + "\n更正\n");
  await page.evaluate(() =>
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: {
        writeText: async () => {
          window.copiedCalls = (window.copiedCalls || 0) + 1;
        },
      },
    }),
  );
  await b("复制任务文本").click();
  await dialog().getByRole("alert").waitFor();
  assert.equal(await page.evaluate(() => window.copiedCalls || 0), 0);
  assert.equal(
    await page
      .getByRole("textbox", { name: "整理任务文本", exact: true })
      .count(),
    0,
  );
  report.flows.push(
    "已经准备的任务在复制前重新核验，文件变化后不向剪贴板交付旧包",
  );
  const s = await app.workspace();
  await app.call("/knowledge/remove", {
    sourceId: task.evidence[0].sourceId,
    confirmed: true,
    expectedRevision: s.revision,
  });
  await dialog()
    .getByRole("button", { name: "刷新整理任务", exact: true })
    .click();
  await b("核对来源").click();
  await dialog()
    .getByText(/^本次核对：授权已失效/)
    .waitFor();
  await page.screenshot({ path: join(output, "revoked-1280.png") });
  report.flows.push(
    "另一客户端撤权后刷新与复核显示授权失效，历史候选仍不是有效知识",
  );
  assert.deepEqual(report.errors, []);
} catch (error) {
  report.failure = error.stack;
  await page.screenshot({ path: join(output, "failure.png") }).catch(() => {});
  process.exitCode = 1;
} finally {
  release?.();
  await writeFile(join(output, "report.json"), JSON.stringify(report, null, 2));
  console.log(
    JSON.stringify({
      flows: report.flows.length,
      axe: report.axe.length,
      failure: report.failure,
    }),
  );
  await browser.close();
  await app.close();
}
