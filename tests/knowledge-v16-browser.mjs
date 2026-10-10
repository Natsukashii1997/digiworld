import assert from "node:assert/strict";
import { chromium } from "playwright";
import AxeBuilder from "@axe-core/playwright";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { knowledge193Fixture, profile193 } from "./knowledge-v16-fixture.mjs";
const output = process.env.GUIJI_TEST_RESULTS || "test-results/knowledge-v16";
await mkdir(output, { recursive: true });
const app = await knowledge193Fixture();
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({
  viewport: { width: 1440, height: 1000 },
  reducedMotion: "reduce",
  permissions: ["clipboard-read", "clipboard-write"],
});
const page = await context.newPage();
page.setDefaultTimeout(6000);
const report = { flows: [], axe: [], errors: [], searches: [] };
page.on("request", (r) => {
  if (new URL(r.url()).pathname === "/api/knowledge/search-all")
    report.searches.push(r.postDataJSON());
});
page.on("response", (r) => {
  if (new URL(r.url()).pathname === "/api/knowledge/search-all")
    (report.searchResponses ||= []).push({ sw: r.fromServiceWorker() });
});
page.on("pageerror", (e) => report.errors.push(e.message));
const b = (name) => page.getByRole("button", { name, exact: true });
async function close() {
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "关闭", exact: true })
    .click();
}
async function axe(label) {
  const v = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
    .analyze();
  report.axe.push({ label, violations: v.violations });
  assert.deepEqual(v.violations, []);
}
async function mcp(name, args) {
  const r = await fetch(app.mcpUrl, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "tools/call",
      params: { name, arguments: args },
    }),
  });
  return (await r.json()).result;
}
try {
  await page.goto(app.url + "/#knowledge");
  await page.getByRole("region", { name: "数据中枢" }).waitFor();
  assert.equal(
    await page
      .locator(".knowledge-compilation,.knowledge-zones,.kn-locked")
      .count(),
    0,
  );
  assert.equal(await b("加入整理").count(), 0);
  await page
    .getByRole("searchbox", { name: "跨库检索", exact: true })
    .fill("接力");
  await page
    .getByRole("searchbox", { name: "跨库检索", exact: true })
    .press("Enter");
  await page.getByText(/3 个库中 3 个已查/).waitFor();
  assert.equal(await page.locator(".kh-results li").count(), 4);
  for (const width of [320, 375, 390, 393, 430, 768, 1024, 1440]) {
    await page.setViewportSize({ width, height: 1000 });
    assert.ok(
      (await page
        .locator(".kh-res-n")
        .evaluate((e) => parseFloat(getComputedStyle(e).fontSize))) >= 12,
      "中文覆盖12px " + width,
    );
    assert.equal(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
      true,
      "search" + width,
    );
    for (const box of await page
      .locator(".kh-res,.kh-filter button")
      .evaluateAll((els) =>
        els.map((e) => ({
          w: e.getBoundingClientRect().width,
          h: e.getBoundingClientRect().height,
        })),
      ))
      assert.ok(box.w >= 44 && box.h >= 44, "search44 " + width);
    if ([390, 1440].includes(width)) await axe("检索结果" + width);
    if ([390, 1440].includes(width))
      await page.screenshot({ path: join(output, `search-${width}.png`), fullPage: true });
  }
  await page.setViewportSize({ width: 1440, height: 1000 });
  assert.equal(
    await page.locator(".kh-results script,.kh-results img").count(),
    0,
  );
  await page
    .locator(".kh-filter button")
    .filter({ hasText: "我的 Vault" })
    .click();
  assert.equal(await page.locator(".kh-results li").count(), 2);
  await page.locator(".kh-results .kh-res").first().click();
  await page.locator(".knowledge-original").waitFor();
  assert.equal(await page.evaluate(() => window.knowledgeExecuted), undefined);
  assert.equal(await page.locator(".knowledge-original script").count(), 0);
  await close();
  await b("清空").click();
  assert.equal(await page.locator(".kh-results").count(), 0);
  const keyword = page.getByRole("searchbox", {
    name: "跨库检索",
    exact: true,
  });
  await keyword.fill("接力");
  let release, entered, finished;
  const gate = new Promise((r) => (release = r)),
    started = new Promise((r) => (entered = r)),
    fulfilled = new Promise((r) => (finished = r));
  await page.route(
    "**/api/knowledge/search-all",
    async (route) => {
      const response = await route.fetch();
      entered();
      await gate;
      await route.fulfill({ response });
      finished();
    },
    { times: 1 },
  );
  await keyword.press("Enter");
  await started;
  await keyword.fill("换词");
  release();
  await fulfilled;
  await page.unroute("**/api/knowledge/search-all");
  await page.waitForLoadState("networkidle");
  assert.equal(await page.locator(".kh-results").count(), 0);
  await page.route(
    "**/api/knowledge/search-all",
    async (route) => {
      const response = await route.fetch();
      const body = await response.json();
      assert.equal(route.request().postDataJSON().query, "不存在的短语");
      report.partialProbe = body.coverage;
      await route.fulfill({
        response,
        json: {
          ...body,
          status: "partial",
          coverage: body.coverage.map((c, i) =>
            i === 0 ? { ...c, status: "partial" } : c,
          ),
        },
      });
    },
    { times: 1 },
  );
  await keyword.fill("不存在的短语");
  await keyword.press("Enter");
  await page.getByText(/3 个库中 3 个已查/).waitFor();
  await page
    .getByText("已查范围未命中；其余范围仍未知。", { exact: true })
    .waitFor();
  await b("清空").click();
  await page.clock.install({ time: new Date() });
  await keyword.fill("接力");
  await keyword.press("Enter");
  await page.getByText(/3 个库中 3 个已查/).waitFor();
  await page.clock.fastForward(610001);
  await page.getByRole("alert").filter({ hasText: "检索已过期" }).waitFor();
  assert.equal(await page.locator(".kh-results").count(), 0);
  await page.clock.setSystemTime(new Date());
  await page.clock.resume();
  await b("清空").click();
  let firstSummarySeen,
    releaseFirstSummary,
    summaryRequests = 0;
  const initialSummarySeen = new Promise((r) => (firstSummarySeen = r)),
    firstSummaryHold = new Promise((r) => (releaseFirstSummary = r));
  await page.route("**/api/knowledge/zones/summary", async (route) => {
    if (++summaryRequests !== 1) return route.continue();
    firstSummarySeen();
    await firstSummaryHold;
    await route.fulfill({ status: 503, json: { error: "合成迟到摘要失败" } });
  });
  await page.reload();
  await initialSummarySeen;
  await b("我的 Vault").click();
  await b("刷新连接核对").click();
  await page.locator(".kh-mcp").filter({ hasText: "MCP 运行中" }).waitFor();
  const lateResponse = page.waitForResponse(
    (r) =>
      new URL(r.url()).pathname === "/api/knowledge/zones/summary" &&
      r.status() === 503,
  );
  releaseFirstSummary();
  await (await lateResponse).finished();
  await page.evaluate(
    () =>
      new Promise((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(resolve)),
      ),
  );
  assert.match(
    await page.locator(".kh-mcp").textContent(),
    /MCP 运行中/,
    "较旧摘要不能覆盖新刷新",
  );
  await page.unroute("**/api/knowledge/zones/summary");
  await close();
  await page.route(
    "**/api/knowledge/zones/summary",
    (route) =>
      route.fulfill({ status: 503, json: { error: "合成摘要读取失败" } }),
    { times: 1 },
  );
  await page.reload();
  await page
    .locator(".kh-mcp")
    .getByText("MCP 状态未知", { exact: true })
    .waitFor();
  assert.equal(
    await page.locator(".kh-chip.down,.kh-lines path.broken").count(),
    0,
  );
  await b("重新核验 MCP 状态").click();
  await page.locator(".kh-mcp").filter({ hasText: "MCP 运行中" }).waitFor();
  assert.equal(await b("重新核验 MCP 状态").count(), 0);
  let failedName;
  await page.route(
    "**/api/knowledge/search-all",
    async (route) => {
      const response = await route.fetch(),
        body = await response.json(),
        failed = body.coverage[0];
      failedName = failed.sourceName;
      await route.fulfill({
        response,
        json: {
          ...body,
          status: "partial",
          searchedSources: body.searchedSources - 1,
          results: body.results.filter((r) => r.sourceId !== failed.sourceId),
          coverage: body.coverage.map((c, i) =>
            i === 0
              ? { ...c, status: "failed", message: "合成目录身份失效" }
              : c,
          ),
        },
      });
    },
    { times: 1 },
  );
  await page
    .getByRole("searchbox", { name: "跨库检索", exact: true })
    .fill("接力");
  await page
    .getByRole("searchbox", { name: "跨库检索", exact: true })
    .press("Enter");
  await page.getByText(/3 个库中 2 个已查/).waitFor();
  await page
    .getByRole("button", { name: failedName, exact: true })
    .getByText("读取失败 · 核对目录或权限", { exact: true })
    .waitFor();
  assert.equal(await page.locator(".kh-lines path.broken").count(), 1);
  await b("清空").click();
  report.flows.push(
    "三源合并/源筛选/纯文本原文/清空恢复；迟到摘要不能覆盖新核验，MCP失败未知可恢复，源失败节点断线；无加工与三区入口",
  );
  await b("个人说明与 MCP").click();
  await b("预览个人说明").click();
  await page.getByRole("region", { name: "个人说明正文" }).waitFor();
  assert.equal(
    await page
      .getByRole("region", { name: "个人说明正文" })
      .locator("pre")
      .textContent(),
    profile193,
  );
  const chapters = page.getByRole("navigation", { name: "个人说明章节" });
  assert.equal(await chapters.getByRole("button").count(), 3);
  await chapters.getByRole("button", { name: "沟通", exact: true }).click();
  const target = page
    .locator('[id^="kh-profile-0-"]')
    .filter({ hasText: "## 沟通" });
  assert.equal(await target.isVisible(), true);
  assert.equal(new URL(page.url()).hash, "#knowledge");
  assert.equal((await mcp("read_profile", {})).isError, true);
  await page
    .getByLabel("我确认允许本机 Agent 通过 MCP 读取“个人上下文”正文")
    .check();
  await b("开启 MCP 读取").click();
  await b("关闭 MCP 读取").waitFor();
  assert.equal(
    (await mcp("read_profile", {})).structuredContent.files[0].content,
    profile193,
  );
  assert.equal(
    (await mcp("read_profile", { path: "方法/接力提示词.md" })).isError,
    true,
  );
  await b("复制 MCP 接入配置").click();
  assert.match(
    await page.evaluate(() => navigator.clipboard.readText()),
    /\[mcp_servers.workbench-profile\]/,
  );
  assert.equal(
    (await page.evaluate(() => navigator.clipboard.readText())).includes(
      app.mcpUrl,
    ),
    true,
  );
  const proposal = await mcp("propose_profile_change", {
    path: "个人上下文/关于我.md",
    original: "结论先行。",
    proposed: "先结论，再依据。",
    reason: "合成验证",
    proposer: "Codex",
  });
  assert.equal(proposal.isError, false);
  assert.equal(
    (
      await mcp("propose_profile_change", {
        path: "个人上下文/关于我.md",
        original: "合成测试角色。",
        proposed: "拒绝测试角色。",
        reason: "合成拒绝",
        proposer: "Codex",
      })
    ).isError,
    false,
  );
  await close();
  await page.reload();
  await b("个人说明与 MCP").click();
  await b("关闭 MCP 读取").click();
  await b("开启 MCP 读取").waitFor();
  assert.equal((await mcp("read_profile", {})).isError, true);
  await b("预览个人说明").click();
  await page.getByRole("region", { name: "个人说明正文" }).waitFor();
  await axe("芯片抽屉");
  await close();
  await page
    .getByRole("button", { name: "个人说明与 MCP", exact: true })
    .getByText("已预览 3 章 · " + profile193.length + " 字", { exact: true })
    .waitFor();
  await page
    .getByRole("button", { name: "个人说明与 MCP", exact: true })
    .getByText(/预览最近修改/)
    .waitFor();
  report.flows.push(
    "个人说明本机预览/章节跳转/芯片事实回填独立于Agent授权；确认开启/关闭/真实MCP/配置复制/建议只入待处理",
  );
  await b("我的 Vault").click();
  for (const width of [320, 390, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    for (const box of await page
      .locator(".kh-policy .confirm-line,.kh-policy textarea,.kh-policy button")
      .evaluateAll((els) =>
        els.map((e) => ({
          w: e.getBoundingClientRect().width,
          h: e.getBoundingClientRect().height,
        })),
      ))
      assert.ok(box.w >= 44 && box.h >= 44, "知识权限控件44px " + width);
    assert.equal(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
      true,
    );
  }
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page
    .getByLabel("排除文件夹（每行一个相对目录）", { exact: true })
    .fill(" 排除 ");
  await page.getByLabel("我已核对知识开放与排除范围", { exact: true }).check();
  await b("保存知识范围").click();
  await page
    .getByRole("dialog")
    .getByRole("alert")
    .filter({ hasText: "排除目录应是可见的来源内相对文件夹" })
    .waitFor();
  assert.equal(
    await page.locator(".kh-policy textarea").inputValue(),
    " 排除 ",
  );
  await page.getByLabel("开放知识给 Agent", { exact: true }).check();
  await page
    .getByLabel("排除文件夹（每行一个相对目录）", { exact: true })
    .fill("排除");
  await page.getByLabel("我已核对知识开放与排除范围", { exact: true }).check();
  await b("保存知识范围").click();
  await page
    .locator(".toast")
    .getByText("知识范围已保存，请重新查询", { exact: true })
    .waitFor();
  const knowledge = await mcp("search_knowledge", { query: "接力" });
  assert.equal(knowledge.isError, false);
  assert.equal(knowledge.structuredContent.results.length, 1);
  const row = knowledge.structuredContent.results[0];
  assert.equal(
    (
      await mcp("read_note", {
        sourceId: row.sourceId,
        path: row.path,
        expectedSha256: row.sha256,
      })
    ).isError,
    false,
  );
  assert.equal((await mcp("read_profile", {})).isError, true);
  await axe("来源权限抽屉");
  await close();
  report.flows.push(
    "知识默认关闭，经确认开放及排除；真实MCP跨库查询/原文，个人说明仍独立关闭",
  );
  await page.goto(app.url + "/#inbox");
  const proposals = page.getByRole("region", { name: "个人说明修改建议" });
  await page.waitForFunction(n=>document.querySelectorAll(".ib-proposals .ib-card").length===n,2);
  await proposals
    .locator(".ib-card")
    .filter({ hasText: "合成验证" })
    .getByRole("button", { name: /查看/, exact: false })
    .click();
  await page
    .getByLabel("我已核对差异，确认采纳这条建议", { exact: true })
    .check();
  await b("采纳").click();
  await page.waitForFunction(n=>document.querySelectorAll(".ib-proposals .ib-card").length===n,1);
  await proposals
    .locator(".ib-card")
    .filter({ hasText: "合成拒绝" })
    .getByRole("button", { name: /查看/ })
    .click();
  await proposals.getByRole("button", { name: "拒绝", exact: true }).click();
  await b("确认拒绝").click();
  await page.waitForFunction(n=>document.querySelectorAll(".ib-proposals .ib-card").length===n,0);
  assert.equal(await app.original(), profile193);
  await page.goto(app.url + "/#knowledge");
  await page.getByRole("region", { name: "数据中枢" }).waitFor();
  report.flows.push("新版入口提交的两条建议经当前待处理采纳/拒绝，原文未改");
  for (const width of [320, 375, 390, 393, 430, 768, 1024, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    assert.equal(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
      true,
      String(width),
    );
    for (const target of [".kh-src", ".kh-chip", ".kh-agent", ".kh-more-item"])
      for (const box of await page.locator(target).evaluateAll((els) =>
        els.map((e) => ({
          w: e.getBoundingClientRect().width,
          h: e.getBoundingClientRect().height,
        })),
      ))
        assert.ok(box.w >= 44 && box.h >= 44, target + width);
    await axe("主界面" + width);
    if (await b("关闭提示").count()) await b("关闭提示").click();
    await page.screenshot({
      path: join(output, "main-" + width + ".png"),
      fullPage: true,
    });
  }
  await page.emulateMedia({ reducedMotion: "no-preference" });
  assert.equal(
    await page
      .locator(".kh-lines .flow")
      .first()
      .evaluate((e) => getComputedStyle(e).animationName),
    "kh-flow",
  );
  await page.emulateMedia({ reducedMotion: "reduce" });
  assert.equal(
    await page
      .locator(".kh-lines .flow")
      .first()
      .evaluate((e) => getComputedStyle(e).animationName),
    "none",
  );
  const chip = b("个人说明与 MCP");
  await chip.focus();
  await page.keyboard.press("Enter");
  const keyboardDialog = page.getByRole("dialog", {name:"个人说明与 MCP"});
  await keyboardDialog.waitFor();
  await page.waitForFunction(()=>document.querySelector('[role="dialog"]')===document.activeElement);
  await page.keyboard.press("Escape");
  await keyboardDialog.waitFor({state:"detached"});
  assert.equal(await chip.evaluate((e) => document.activeElement === e), true);
  assert.equal(await app.original(), profile193);
  assert.deepEqual(report.errors, []);
  report.flows.push(
    "八宽44px/axe/无溢出/运行时reduce/键盘Esc与焦点回归/原文不变",
  );
} catch (e) {
  report.failure = e.stack;
  report.failureDialog = await page.getByRole("dialog").allTextContents();
  await page.screenshot({ path: join(output, "failure.png"), fullPage: true });
  throw e;
} finally {
  await writeFile(join(output, "report.json"), JSON.stringify(report, null, 2));
  await context.close();
  await browser.close();
  await app.close();
}
console.log(
  "knowledge-v16-browser PASS",
  report.flows.length,
  report.axe.length,
);
