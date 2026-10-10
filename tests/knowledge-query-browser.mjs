import { createRequire } from "node:module";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import assert from "node:assert/strict";
import AxeBuilder from "@axe-core/playwright";
import {
  knowledgeQueryFixture,
  queryText,
} from "./knowledge-query-fixture.mjs";

const require = createRequire(import.meta.url);
const { chromium } = require(
  process.env.PLAYWRIGHT_MODULE ||
    "/Users/nat/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright",
);
const output = process.env.GUIJI_TEST_RESULTS || "test-results/knowledge-query";
await mkdir(output, { recursive: true });
const app = await knowledgeQueryFixture();
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({
  viewport: { width: 1440, height: 1000 },
  reducedMotion: "reduce",
});
const page = await context.newPage();
page.setDefaultTimeout(6000);
const report = { flows: [], axe: [], errors: [], failure: null };
let paged, partial;
const requests = [];
page.on("request", (request) => {
  if (request.url().includes("/api/knowledge/"))
    requests.push({
      action: request.url().split("/").at(-1),
      body: request.postDataJSON(),
    });
});
page.on("pageerror", (error) => report.errors.push(error.message));
const button = (name) => name === "连接知识源" ? {click: async () => {await closeSource();await page.getByRole("button",{name:"接入知识库",exact:true}).first().click();}} : page.getByRole("button", { name, exact: true });
async function closeSource(){ const close=page.getByRole('dialog').getByRole('button',{name:'关闭',exact:true});if(await page.getByRole('dialog').locator('.knowledge-workspace').count())await close.click(); }
async function activateSource(name){ await closeSource();await page.locator('.kh-srcs .kh-src').filter({hasText:name}).click();await page.getByRole('dialog',{name,exact:true}).waitFor(); }

const keyword = () => page.getByLabel("正文关键词", { exact: true });
async function connect(name, root) {
  await button("连接知识源").click();
  await page.getByLabel("来源名称", { exact: true }).fill(name);
  await page.getByLabel("目录绝对路径", { exact: true }).fill(root);
  await page.getByLabel("我确认仅只读访问此目录", { exact: true }).check();
  await button("确认连接").click();
  await activateSource(name);
}
async function scan() {
  await page
    .getByRole("button", { name: /^(重新扫描|扫描文件)$/, exact: true })
    .click();
  await page.getByText(/^(扫描完成|部分扫描)$/, { exact: true }).waitFor();
}
async function query(value) {
  await keyword().fill(value);
  await button("查询正文").click();
  await page.locator(".knowledge-query-coverage").waitFor();
}
async function axe(name) {
  const result = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
    .analyze();
  report.axe.push({ state: name, violations: result.violations });
  assert.deepEqual(result.violations, []);
}
async function screenshot(name) {
  if (await button("关闭提示").count()) await button("关闭提示").click();
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: join(output, name + ".png"), fullPage: true });
}
async function holdSearch() {
  let release, started, completed;
  const gate = new Promise((resolve) => {
    release = resolve;
  });
  const observed = new Promise((resolve) => {
    started = resolve;
  });
  const finished = new Promise((resolve) => {
    completed = resolve;
  });
  heldSearches.push({ gate, started, completed });
  return {
    release: async () => {
      release();
      await finished;
    },
    observed,
  };
}
const heldSearches = [];
await page.route("**/api/knowledge/search", async (route) => {
  const held = heldSearches.shift();
  if (!held) return route.continue();
  const response = await route.fetch();
  held.started();
  await held.gate;
  try {
    await route.fulfill({ response });
  } catch (error) {
    report.errors.push(error.message);
  } finally {
    held.completed();
  }
});
try {
  await page.clock.install({ time: new Date() });
  await page.goto(app.url + "/#knowledge");
  await button("连接知识源").click();
  await page.getByLabel("来源名称", { exact: true }).fill("正文查询合成来源");
  await page.getByLabel("目录绝对路径", { exact: true }).fill(app.root);
  await page.getByLabel("我确认仅只读访问此目录", { exact: true }).check();
  await button("确认连接").click();
  await activateSource("正文查询合成来源");
  await button("扫描文件").click();
  const beforeMode = requests.length;
  await button("正文查询").click();
  assert.equal(requests.length, beforeMode);
  assert.equal(await button("查询正文").isDisabled(), true);
  await page.getByLabel("正文关键词", { exact: true }).fill("needle");
  await button("查询正文").click();
  await page.getByText("已检查 2 / 2 份文件", { exact: true }).waitFor();
  assert.equal(await page.locator(".knowledge-query-result").count(), 1);
  assert.equal(
    await page.locator(".knowledge-query-result mark").textContent(),
    "Needle",
  );
  await button("查看原文：专题/判断原则.md").click();
  await page.getByRole("heading", { name: "原文预览", exact: true }).waitFor();
  assert.equal(
    await page.locator(".knowledge-original").textContent(),
    queryText,
  );
  report.flows.push(
    "显式正文查询找到仅出现在正文的短语，按原文大小写显示命中并重新核验预览",
  );
  assert.equal(await app.original(), queryText);
  assert.equal(
    JSON.stringify(await app.workspace()).includes("正文独有"),
    false,
  );
  await screenshot("query-preview-1440");
  await axe("查询结果和原文预览");

  await keyword().fill("<script>");
  assert.equal(await page.locator(".knowledge-query-result").count(), 0);
  assert.equal(await page.locator(".knowledge-original").count(), 0);
  await keyword().focus();
  await page.keyboard.press("Enter");
  await page.locator(".knowledge-query-result").waitFor();
  assert.match(
    await page.locator(".knowledge-snippet").textContent(),
    /第 3 行.*<script>/,
  );
  assert.equal(await page.locator(".knowledge-snippet script").count(), 0);
  assert.equal(await page.evaluate(() => window.queryExecuted), undefined);
  await query("中文判断");
  assert.equal(
    await page.locator(".knowledge-query-result mark").textContent(),
    "中文判断",
  );
  await query("完全不存在的合成短语");
  await page.getByText("当前扫描范围内未找到该短语", { exact: true }).waitFor();
  report.flows.push(
    "切换正文模式不读；换词清旧结果和预览；Enter、中文、特殊符号、真实零命中与纯文本片段",
  );

  await keyword().fill("a".repeat(101));
  const invalidBefore = requests.filter(
    (entry) => entry.action === "search",
  ).length;
  await button("查询正文").click();
  await page.getByRole("alert").filter({ hasText: "1–100" }).waitFor();
  assert.equal(
    requests.filter((entry) => entry.action === "search").length,
    invalidBefore,
  );
  report.flows.push("超过100字符保留输入并在发请求前拒绝");

  await query("needle");
  for (const status of [503, 429]) {
    await page.route(
      "**/api/knowledge/search",
      (route) =>
        route.fulfill({
          status,
          contentType: "application/json",
          body: JSON.stringify({
            error:
              status === 429
                ? "另一批查询正在运行，请稍后重试"
                : "合成服务失败",
          }),
        }),
      { times: 1 },
    );
    await button("查询正文").click();
    await page.getByRole("alert").waitFor();
    assert.equal(await keyword().inputValue(), "needle");
    assert.equal(await page.locator(".knowledge-query-result").count(), 0);
    await query("needle");
  }
  report.flows.push("503与429均保留关键词、撤回旧结果，后续显式重试可恢复");

  await keyword().fill("needle");
  const held = await holdSearch();
  const beforeDouble = requests.filter(
    (entry) => entry.action === "search",
  ).length;
  await button("查询正文").evaluate((element) => {
    element.click();
    element.click();
  });
  await held.observed;
  assert.equal(
    requests.filter((entry) => entry.action === "search").length - beforeDouble,
    1,
  );
  await keyword().fill("新词");
  await held.release();
  await page.waitForLoadState("networkidle");
  assert.equal(await page.locator(".knowledge-query-result").count(), 0);
  await page.getByText("尚未查询正文", { exact: true }).waitFor();
  report.flows.push("双击只发一批；请求晚到时不能恢复已换词的旧页");

  await keyword().fill("needle");
  const refreshHeld = await holdSearch();
  await button("查询正文").click();
  await refreshHeld.observed;
  await page.route(
    "**/api/workspace",
    (route) =>
      route.fulfill({
        status: 503,
        contentType: "application/json",
        body: JSON.stringify({ error: "合成连接核对失败" }),
      }),
    { times: 1 },
  );
  await button("刷新连接核对").click();
  await page
    .getByRole("alert")
    .filter({ hasText: "合成连接核对失败" })
    .waitFor();
  await refreshHeld.release();
  await page.waitForLoadState("networkidle");
  assert.equal(await page.locator(".knowledge-query-result").count(), 0);
  await scan();
  report.flows.push("开始刷新连接即失效旧搜索，刷新失败也不恢复迟到片段");

  await query("needle");
  await page.route(
    "**/api/knowledge/read",
    async (route) => {
      const response = await route.fetch();
      const body = await response.json();
      await route.fulfill({
        response,
        json: { ...body, sha256: "f".repeat(64) },
      });
    },
    { times: 1 },
  );
  await button("查看原文：专题/判断原则.md").click();
  await page
    .getByRole("alert")
    .filter({ hasText: "旧查询结果已撤回" })
    .waitFor();
  assert.equal(await page.locator(".knowledge-query-result").count(), 0);
  assert.equal(await page.locator(".knowledge-original").count(), 0);
  await scan();
  await query("needle");
  await app.changeFile("专题/判断原则.md", "# 已变更的合成原文\n");
  await button("查看原文：专题/判断原则.md").click();
  await page
    .getByRole("alert")
    .filter({ hasText: /变化|重新扫描/ })
    .waitFor();
  assert.equal(await page.locator(".knowledge-query-result").count(), 0);
  assert.equal(await page.locator(".knowledge-original").count(), 0);
  await app.changeFile("专题/判断原则.md", queryText);
  report.flows.push(
    "读回SHA不符（HTTP响应故障注入）及真实文件变化均撤回结果，不展示旧片段对应的新原文",
  );

  await scan();
  await query("needle");
  app.advance(600001);
  await button("查询正文").click();
  await page
    .getByRole("alert")
    .filter({ hasText: /失效|重新扫描/ })
    .waitFor();
  assert.equal(await page.locator(".knowledge-query-result").count(), 0);
  app.resetClock();
  await scan();
  await query("needle");
  await page.clock.fastForward(600001);
  await page.getByText("扫描已过期", { exact: true }).waitFor();
  assert.equal(await page.locator(".knowledge-query-result").count(), 0);
  await page.clock.setSystemTime(new Date());
  report.flows.push("服务端过期查询拒绝旧页；客户端到期主动撤回所有查询片段");

  await scan();
  await keyword().fill("needle");
  const expiryHeld = await holdSearch();
  await button("查询正文").click();
  await expiryHeld.observed;
  await page.clock.fastForward(600001);
  await expiryHeld.release();
  await page.waitForLoadState("networkidle");
  assert.equal(await page.locator(".knowledge-query-result").count(), 0);
  await page.clock.setSystemTime(new Date());
  await scan();
  await keyword().fill("needle");
  const rescanHeld = await holdSearch();
  await button("查询正文").click();
  await rescanHeld.observed;
  await button("文件列表").click();
  await scan();
  await rescanHeld.release();
  await page.waitForLoadState("networkidle");
  await button("正文查询").click();
  assert.equal(await page.locator(".knowledge-query-result").count(), 0);
  report.flows.push("到期和切换模式后重扫使迟到搜索响应失效");

  await connect("空知识库", app.emptyRoot);
  await scan();
  await button("正文查询").click();
  await query("needle");
  await page.getByText("已检查 0 / 0 份文件", { exact: true }).waitFor();
  await page.getByText("当前扫描范围内未找到该短语", { exact: true }).waitFor();
  await activateSource("正文查询合成来源");
  await scan();
  await button("正文查询").click();
  await keyword().fill("needle");
  const sourceHeld = await holdSearch();
  await button("查询正文").click();
  await sourceHeld.observed;
  await activateSource("空知识库");
  await sourceHeld.release();
  await page.waitForLoadState("networkidle");
  assert.equal(await page.locator(".knowledge-query-result").count(), 0);
  report.flows.push("空源零检查与未查分开；跨来源晚到响应不串入新来源");

  paged = await knowledgeQueryFixture({ queryLimits: { maxFiles: 1 } });
  await page.goto(paged.url + "/#knowledge");
  await connect("分页来源", paged.root);
  await scan();
  await button("正文查询").click();
  await query("needle");
  await page.getByText("已检查 1 / 2 份文件", { exact: true }).waitFor();
  await button("继续查询").waitFor();
  const beforeContinue = requests.filter(
    (entry) => entry.action === "search",
  ).length;
  await screenshot("query-continue-1440");
  await axe("待继续的查询");
  assert.equal(
    requests.filter((entry) => entry.action === "search").length,
    beforeContinue,
  );
  await button("继续查询").click();
  await page.getByText("已检查 2 / 2 份文件", { exact: true }).waitFor();
  assert.equal(await button("继续查询").count(), 0);
  assert.equal(await page.locator(".knowledge-query-result").count(), 1);
  const batchRequests = requests
    .filter((entry) => entry.action === "search")
    .slice(-2);
  assert.deepEqual(
    batchRequests.map((entry) => entry.body.offset),
    [0, 1],
  );
  report.flows.push(
    "真实每批1文件预算：只显式继续，按nextOffset累积进度/结果，不自动查询剩余正文",
  );

  await paged.changeFile(
    "长文.md",
    "# 长行\n" +
      "Long_中英文".repeat(150) +
      " Needle " +
      "long_无空格".repeat(150),
  );
  await scan();
  await query("needle");
  await button("继续查询").click();
  await page.getByText("已检查 2 / 2 份文件", { exact: true }).waitFor();
  assert.equal(await page.locator(".knowledge-query-result").count(), 2);
  for (const width of [320, 375, 390, 393, 430, 768, 1024, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    assert.equal(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
      true,
    );
    for (const target of [
      ".knowledge-workspace",
      ".knowledge-query-form",
      ".knowledge-query-results",
    ])
      assert.equal(
        await page
          .locator(target)
          .evaluate(
            (element) => element.scrollWidth <= element.clientWidth + 1,
          ),
        true,
        target + width,
      );
    for (const name of [
      "正文查询",
      "文件列表",
      "查询正文",
      "查看原文：长文.md",
    ])
      assert.ok((await button(name).boundingBox()).height >= 44, name + width);
    await screenshot("query-long-" + width);
    await axe("正文长片段 " + width);
    report.flows.push(`${width}px长片段无溢出、44px操作、axe`);
  }
  await page.setViewportSize({ width: 1440, height: 1000 });
  await keyword().focus();
  await page.keyboard.press("Tab");
  assert.equal(
    await button("查询正文").evaluate(
      (element) =>
        element === document.activeElement &&
        getComputedStyle(element).outlineStyle !== "none",
    ),
    true,
  );
  report.flows.push("正文查询键盘Tab焦点可见");

  partial = await knowledgeQueryFixture({ limits: { maxFiles: 1 } });
  await page.goto(partial.url + "/#knowledge");
  await connect("部分扫描来源", partial.root);
  await scan();
  await button("正文查询").click();
  await query("neverpresent");
  await page
    .getByText("仅查询本次部分扫描的文件，不代表整个知识源。", { exact: true })
    .waitFor();
  await page
    .getByText("可查询范围内未命中；仍有文件未覆盖或读取失败", { exact: true })
    .waitFor();
  await screenshot("query-partial-1440");
  await axe("部分扫描下零命中");
  report.flows.push(
    "真实partial扫描覆盖提示传递到搜索，零命中不冒充完整知识源未命中",
  );
  assert.deepEqual(report.errors, []);
} catch (error) {
  report.failure = error.stack;
  await page
    .screenshot({ path: join(output, "query-failure.png"), fullPage: true })
    .catch(() => {});
  process.exitCode = 1;
} finally {
  await writeFile(
    join(output, "knowledge-query-report.json"),
    JSON.stringify(report, null, 2),
  );
  console.log(JSON.stringify(report, null, 2));
  await browser.close();
  await partial?.close();
  await paged?.close();
  await app.close();
}
