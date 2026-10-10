import { createRequire } from "node:module";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import assert from "node:assert/strict";
import AxeBuilder from "@axe-core/playwright";
import { knowledgeFixture, knowledgeText } from "./knowledge-fixture.mjs";
const require = createRequire(import.meta.url);
const { chromium } = require(
  process.env.PLAYWRIGHT_MODULE ||
    "/Users/nat/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright",
);
const output = process.env.GUIJI_TEST_RESULTS || "test-results/knowledge";
await mkdir(output, { recursive: true });
const app = await knowledgeFixture();
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({
  viewport: { width: 1440, height: 1000 },
  permissions: ["clipboard-read", "clipboard-write"],
  reducedMotion: "reduce",
});
const page = await context.newPage();
page.setDefaultTimeout(6000);
const report = { flows: [], axe: [], errors: [], failure: null };
let partial;
const requests = [];
page.on("request", (request) => {
  if (request.url().includes("/api/knowledge/"))
    requests.push(request.url().split("/").at(-1));
});
page.on("pageerror", (error) => report.errors.push(error.message));
async function axe(state) {
  const result = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
    .analyze();
  report.axe.push({ state, violations: result.violations });
  assert.deepEqual(result.violations, []);
}
const button = (name) => name === "连接知识源" ? {click: async () => {await closeSource();await page.getByRole("button",{name:"接入知识库",exact:true}).first().click();}} : page.getByRole("button", { name, exact: true });
async function closeSource(){ const close=page.getByRole('dialog').getByRole('button',{name:'关闭',exact:true});if(await page.getByRole('dialog').locator('.knowledge-workspace').count())await close.click(); }
async function activateSource(name){ await closeSource();await page.locator('.kh-srcs .kh-src').filter({hasText:name}).click();await page.getByRole('dialog',{name,exact:true}).waitFor(); }

const source = (name) => { const locator=page.locator('.kh-srcs .kh-src').filter({hasText:name});const click=locator.click.bind(locator);locator.click=async()=>{await closeSource();await click();};return locator;};
async function fillConnection(name, path) {
  await button("连接知识源").click();
  await page.getByLabel("来源名称", { exact: true }).fill(name);
  await page.getByLabel("目录绝对路径", { exact: true }).fill(path);
  await page.getByLabel("我确认仅只读访问此目录", { exact: true }).check();
}
async function connect(name, path) {
  await fillConnection(name, path);
  await button("确认连接").click();
  await activateSource(name);
}
async function scan() {
  await page
    .getByRole("button", { name: /^(扫描文件|重新扫描)$/, exact: true })
    .click();
  await page.getByText(/^(扫描完成|部分扫描)$/, { exact: true }).waitFor();
}
async function screenshot(name) {
  const dismiss = button("关闭提示");
  if (await dismiss.count()) await dismiss.click();
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: join(output, name + ".png"), fullPage: true });
}
try {
  await page.clock.install({ time: new Date() });
  await page.goto(app.url + "/#knowledge");
  await button("连接知识源").click();
  await page.getByLabel("来源名称", { exact: true }).fill("合成知识库");
  await page.getByLabel("目录绝对路径", { exact: true }).fill(app.root);
  await page.getByLabel("我确认仅只读访问此目录", { exact: true }).check();
  await page.getByRole("button", { name: "确认连接", exact: true }).click();
  await activateSource("合成知识库");
  await page.getByRole("button", { name: "扫描文件", exact: true }).click();
  await page
    .getByRole("button", { name: "专题/判断原则.md", exact: true })
    .click();
  await page.getByRole("heading", { name: "原文预览", exact: true }).waitFor();
  assert.equal(
    await page.locator(".knowledge-original").textContent(),
    knowledgeText,
  );
  assert.equal(await page.evaluate(() => window.knowledgeExecuted), undefined);
  assert.equal(await page.locator(".knowledge-original img").count(), 0);
  await page.getByRole("button", { name: "复制来源指针", exact: true }).click();
  await page.getByText("来源指针已复制 · 不含正文", { exact: true }).waitFor();
  const copied = await page.evaluate(() => navigator.clipboard.readText());
  assert.match(copied, /专题\/判断原则\.md/);
  assert.match(copied, /SHA-256/);
  assert.equal(copied.includes("仅供浏览器测试"), false);
  assert.equal(await app.original(), knowledgeText);
  assert.equal(
    JSON.stringify(await app.workspace()).includes("仅供浏览器测试"),
    false,
  );
  report.flows.push(
    "显式连接→元数据扫描→选中文件纯文本预览→复制来源指针；原文不执行、不入库、不改动",
  );
  await screenshot("knowledge-preview-1440");
  await page
    .locator(".knowledge-preview")
    .screenshot({ path: join(output, "knowledge-preview-crop.png") });
  await axe("原文预览");

  await page.getByLabel("按文件名或路径筛选", { exact: true }).fill("专题/");
  assert.equal(await page.locator(".knowledge-file").count(), 1);
  await page.getByLabel("按文件名或路径筛选", { exact: true }).fill("并不存在");
  await page.getByText("没有匹配的文件名或路径", { exact: true }).waitFor();
  await page.getByLabel("按文件名或路径筛选", { exact: true }).fill("");
  assert.equal(await page.locator(".knowledge-file").count(), 2);
  await page.reload();
  await activateSource("合成知识库");
  await page
    .getByText("尚未扫描 · 点击扫描文件后查询。", { exact: true })
    .waitFor();
  assert.equal(await page.locator(".knowledge-original").count(), 0);
  await app.restart();
  await page.goto(app.url + "/#knowledge");
  await activateSource("合成知识库");
  assert.equal(await source("合成知识库").count(), 1);
  report.flows.push(
    "仅按文件名/路径筛选与零命中；浏览器刷新和服务重启保留连接但不保留索引或正文",
  );

  await scan();
  await button("专题/判断原则.md").click();
  await button("复制来源指针").waitFor();
  await app.changeFile();
  await button("复制来源指针").click();
  await page
    .getByRole("alert")
    .filter({ hasText: /变化|重新扫描/ })
    .waitFor();
  assert.equal(await page.locator(".knowledge-original").count(), 0);
  assert.equal(
    await page.evaluate(() => navigator.clipboard.readText()),
    copied,
  );
  await scan();
  await button("专题/判断原则.md").click();
  await page.getByText("# 更新后的合成原文", { exact: true }).waitFor();
  app.advance(600001);
  await button("复制来源指针").click();
  await page
    .getByRole("alert")
    .filter({ hasText: /失效|重新扫描/ })
    .waitFor();
  assert.equal(await page.locator(".knowledge-original").count(), 0);
  app.resetClock();
  report.flows.push(
    "原文变化及服务端10分钟过期阻断复制、清除旧内容且不覆盖剪贴板",
  );

  await scan();
  await button("专题/判断原则.md").click();
  await button("复制来源指针").waitFor();
  await page.clock.fastForward(600001);
  await page.getByText("扫描已过期", { exact: true }).waitFor();
  assert.equal(await page.locator(".knowledge-original").count(), 0);
  assert.equal(await button("复制来源指针").count(), 0);
  await page.clock.setSystemTime(new Date());
  report.flows.push(
    "客户端扫描到期主动清空原文并禁用旧清单，而非等待下一次错误",
  );

  await scan();
  await page.route(
    "**/api/knowledge/scan",
    (route) =>
      route.fulfill({
        status: 503,
        contentType: "application/json",
        body: JSON.stringify({ error: "合成扫描失败，请重试" }),
      }),
    { times: 1 },
  );
  await button("重新扫描").click();
  await page.getByRole("alert").filter({ hasText: "合成扫描失败" }).waitFor();
  assert.equal(await page.locator(".knowledge-file").count(), 0);
  await scan();
  await connect("空知识库", app.emptyRoot + "/");
  await scan();
  await page
    .getByText("此目录未发现可读取的 Markdown", { exact: true })
    .waitFor();
  await axe("空扫描");
  await screenshot("knowledge-empty-1440");
  report.flows.push("刷新扫描失败清除旧结果；完整扫描0文件与失败/未扫描分开");

  await source("合成知识库").click();
  await scan();
  let release, sawRead;
  const held = new Promise((resolve) => {
    release = resolve;
  });
  const started = new Promise((resolve) => {
    sawRead = resolve;
  });
  await page.route(
    "**/api/knowledge/read",
    async (route) => {
      const response = await route.fetch();
      sawRead();
      await held;
      await route.fulfill({ response });
    },
    { times: 1 },
  );
  await button("专题/判断原则.md").click();
  await started;
  await source("空知识库").click();
  release();
  await page.getByRole("heading", { name: "空知识库", exact: true }).waitFor();
  await page.waitForLoadState("networkidle");
  assert.equal(await page.locator(".knowledge-original").count(), 0);
  await source("合成知识库").click();
  assert.equal(await page.locator(".knowledge-original").count(), 0);
  report.flows.push("切换知识源使晚到原文失效，切回也不保留旧正文");

  await scan();
  await button("长文.md").click();
  await button("复制来源指针").waitFor();
  await page.evaluate(() => {
    Object.defineProperty(navigator.clipboard, "writeText", {
      configurable: true,
      value: async () => {
        throw new Error("synthetic denied");
      },
    });
  });
  await button("复制来源指针").click();
  await page
    .getByRole("alert")
    .filter({ hasText: /复制失败/ })
    .waitFor();
  assert.match(await page.getByLabel("来源指针文本").inputValue(), /长文.md/);
  assert.equal(
    (await page.getByLabel("来源指针文本").inputValue()).includes(
      "LongEvidence",
    ),
    false,
  );
  report.flows.push("剪贴板拒绝显示可手选来源指针，不把正文混入回退文本");
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
      ".knowledge-preview",
      ".knowledge-original",
      ".kh-srcs",
    ])
      assert.equal(
        await page
          .locator(target)
          .evaluate(
            (element) => element.scrollWidth <= element.clientWidth + 1,
          ),
        true,
        target + " " + width,
      );
    for (const name of ["复制来源指针", "重新扫描", "断开连接"])
      assert.ok((await button(name).boundingBox()).height >= 44, name);
    await page.locator(".knowledge-preview").scrollIntoViewIfNeeded();
    await screenshot("knowledge-long-" + width);
    await axe("长原文 " + width);
    report.flows.push(
      `${width}px 长路径/长中英文原文无溢出，主要操作44px，axe`,
    );
  }
  await page.setViewportSize({ width: 1440, height: 1000 });

  await button("连接知识源").click();
  await page.getByLabel("来源名称", { exact: true }).fill("失败输入保留");
  await page
    .getByLabel("目录绝对路径", { exact: true })
    .fill("/definitely-missing-k01-source");
  const check = page.getByLabel("我确认仅只读访问此目录", { exact: true });
  await check.focus();
  await page.keyboard.press("Space");
  assert.equal(await check.isChecked(), true);
  await page.keyboard.press("Tab");
  assert.equal(
    await button("取消").evaluate(
      (element) => element === document.activeElement,
    ),
    true,
  );
  await page.keyboard.press("Tab");
  assert.equal(
    await button("确认连接").evaluate(
      (element) =>
        element === document.activeElement &&
        getComputedStyle(element).outlineStyle !== "none",
    ),
    true,
  );
  await page.keyboard.press("Enter");
  await page.getByRole("dialog").getByRole("alert").waitFor();
  assert.equal(
    await page.getByLabel("来源名称", { exact: true }).inputValue(),
    "失败输入保留",
  );
  assert.equal(
    await page.getByLabel("目录绝对路径", { exact: true }).inputValue(),
    "/definitely-missing-k01-source",
  );
  await axe("连接校验失败");
  await screenshot("knowledge-connect-error-1440");
  await button("取消").click();
  report.flows.push("连接失败保留输入；键盘勾选/Tab/提交和可见focus");

  const lostRoot = await app.addSource("丢响应知识源");
  await fillConnection("丢响应知识源", lostRoot);
  const beforeWrites = requests.filter((action) => action === "connect").length;
  let releaseConnect, connectStarted;
  const connectHeld = new Promise((resolve) => {
    releaseConnect = resolve;
  });
  const connectObserved = new Promise((resolve) => {
    connectStarted = resolve;
  });
  await page.route(
    "**/api/knowledge/connect",
    async (route) => {
      const response = await route.fetch();
      assert.equal(response.status(), 200);
      connectStarted();
      await connectHeld;
      await route.abort("failed");
    },
    { times: 1 },
  );
  await button("确认连接").evaluate((element) => {
    element.click();
    element.click();
  });
  await connectObserved;
  try {
    assert.equal(await button("取消").isDisabled(), true);
    await page.keyboard.press("Escape");
    assert.equal(await page.getByRole("dialog").count(), 1);
    assert.equal(
      await page.getByLabel("来源名称", { exact: true }).inputValue(),
      "丢响应知识源",
    );
    report.flows.push("写入中Escape不关闭连接表单，取消禁用，输入保持");
  } finally {
    releaseConnect();
  }
  await page.getByRole("dialog").getByRole("alert").waitFor();
  await page
    .getByRole("dialog")
    .getByText("操作结果待核对，请先刷新连接核对。", { exact: true })
    .waitFor();
  assert.equal(await button("确认连接").count(), 0);
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "刷新连接核对", exact: true })
    .click();
  await source("丢响应知识源").waitFor();
  assert.equal(await page.getByRole("dialog").count(), 0);
  assert.equal(
    requests.filter((action) => action === "connect").length - beforeWrites,
    1,
  );
  assert.equal(
    (await app.workspace()).connections.knowledgeSources.filter(
      (entry) => entry.root === lostRoot,
    ).length,
    1,
  );
  report.flows.push("双点击仅一次写入；连接已提交但响应丢失→刷新核对不重放");

  const revisionRoot = await app.addSource("版本冲突后重试");
  await fillConnection("版本冲突后重试", revisionRoot);
  const live = await app.workspace();
  assert.equal(
    (
      await app.call("/knowledge/reconfirm", {
        sourceId: live.connections.knowledgeSources[0].id,
        confirmed: true,
        expectedRevision: live.revision,
      })
    ).status,
    200,
  );
  await button("确认连接").click();
  await page.getByRole("dialog").getByRole("alert").waitFor();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "刷新连接核对", exact: true })
    .click();
  await button("确认连接").waitFor();
  assert.equal(
    await page.getByLabel("来源名称", { exact: true }).inputValue(),
    "版本冲突后重试",
  );
  assert.equal(
    await page.getByLabel("目录绝对路径", { exact: true }).inputValue(),
    revisionRoot,
  );
  await button("确认连接").click();
  await activateSource("版本冲突后重试");
  report.flows.push("跨客户端版本冲突禁止旧写入，刷新保留草稿后显式重试");

  await source("合成知识库").click();
  await scan();
  const parked = await app.replaceRoot();
  await button("重新扫描").click();
  await page.locator(".kh-srcs .kh-src").filter({ hasText: "合成知识库" })
    .getByText("需重新确认目录 · 读取暂停", { exact: true }).waitFor();
  assert.equal(await page.locator(".knowledge-file").count(), 0);
  await source("合成知识库").click();
  await button("重新确认目录").click();
  await page.getByLabel("我确认仅只读访问此目录", { exact: true }).check();
  await button("确认重新连接").click();
  await button("扫描文件").waitFor();
  await scan();
  await button("新来源.md").click();
  await page.getByText("# 重新确认后的合成来源", { exact: true }).waitFor();
  await screenshot("knowledge-reconfirmed-1440");
  await axe("目录重新确认");
  await button("断开连接").click();
  await page
    .getByLabel("我确认仅断开连接，不删除源文件", { exact: true })
    .check();
  await button("取消").click();
  assert.equal(await source("合成知识库").count(), 1);
  await button("断开连接").click();
  await page
    .getByLabel("我确认仅断开连接，不删除源文件", { exact: true })
    .check();
  await button("确认断开").click();
  await source("合成知识库").waitFor({ state: "detached" });
  assert.equal(
    (await app.workspace()).connections.knowledgeSources.some(
      (entry) => entry.root === app.root,
    ),
    false,
  );
  assert.equal(await page.locator(".knowledge-original").count(), 0);
  const { readFile } = await import("node:fs/promises");
  assert.match(
    await readFile(join(app.root, "新来源.md"), "utf8"),
    /重新确认后的合成来源/,
  );
  assert.match(
    await readFile(join(parked, "专题", "判断原则.md"), "utf8"),
    /更新后的合成原文/,
  );
  report.flows.push(
    "目录换身份拒绝旧扫描→本人重新确认换代；取消断开保留连接，确认断开仅移除指针",
  );

  partial = await knowledgeFixture({ limits: { maxFiles: 1 } });
  await page.goto(partial.url + "/#knowledge");
  await connect("部分扫描来源", partial.root);
  await scan();
  await page.getByText("部分扫描", { exact: true }).waitFor();
  await page
    .getByText("结果不完整，未列出的文件不代表不存在。", { exact: true })
    .waitFor();
  assert.equal(await page.locator(".knowledge-file").count(), 1);
  await axe("部分扫描");
  await screenshot("knowledge-partial-1440");
  report.flows.push("真实限额扫描呈现partial而非完整/空结果");
  assert.deepEqual(report.errors, []);
} catch (error) {
  report.failure = error.stack;
  await page
    .screenshot({ path: join(output, "knowledge-failure.png"), fullPage: true })
    .catch(() => {});
  process.exitCode = 1;
} finally {
  await writeFile(
    join(output, "knowledge-report.json"),
    JSON.stringify(report, null, 2),
  );
  console.log(JSON.stringify(report, null, 2));
  await browser.close();
  await partial?.close();
  await app.close();
}
