// 项目空间第二版（电路卡带 7E，issue #10）浏览器回归：选卡带、置顶上限、实战未开启、名册读不到、
// 1440 / 390 无横向溢出、控件不小于 44px、axe 无违规、减少动态效果时不跑流光。合成仓库与合成名册（projects-space-fixture.mjs）。
import { createRequire } from "node:module";
import assert from "node:assert/strict";
import { mkdir, rm } from "node:fs/promises";
import { join } from "node:path";
import AxeBuilder from "@axe-core/playwright";
import { spaceFixture } from "./projects-space-fixture.mjs";

const { chromium } = createRequire(import.meta.url)(
  process.env.PLAYWRIGHT_MODULE ||
    "/Users/nat/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright",
);
const output = process.env.GUIJI_TEST_RESULTS || "test-results";
await mkdir(output, { recursive: true });
const app = await spaceFixture({ staticRoot: process.env.WORKBENCH_TEST_STATIC_ROOT || join(import.meta.dirname, "../dist") });
const browser = await chromium.launch();
const errors = [];
const ok = (s) => console.log("PASS", s);

async function open(width, { reduced = false, height = 1000 } = {}) {
  const context = await browser.newContext({ viewport: { width, height }, reducedMotion: reduced ? "reduce" : "no-preference" });
  const page = await context.newPage();
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
  await page.goto(app.url + "/#projects");
  await page.locator("[data-ps-cart]").first().waitFor();
  return { page, context };
}
async function noOverflow(page, label) {
  const over = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  assert.ok(over <= 0, `${label} 横向溢出 ${over}px`);
}
async function bigEnough(page, label) {
  const small = await page.evaluate(() => [...document.querySelectorAll(".projects-space button, .projects-space a.btn")]
    .filter((el) => el.offsetParent && !el.closest("[role=tab]"))
    .map((el) => ({ t: el.textContent.trim() || el.getAttribute("aria-label"), h: el.getBoundingClientRect().height, w: el.getBoundingClientRect().width }))
    .filter((r) => r.h < 44 || r.w < 44));
  assert.deepEqual(small, [], `${label} 有小于 44px 的控件`);
}

try {
  // ---- 1440：卡带按名册、档案屏跟着选中项变 ----
  {
    const { page, context } = await open(1440);
    const carts = page.locator("[data-ps-cart]");
    assert.equal(await carts.count(), 6);
    assert.equal(await page.getByRole("tab", { selected: true }).getAttribute("data-ps-cart"), "collab");
    const screen = page.locator("#ps-screen");
    await screen.getByRole("heading", { name: /协同项目/ }).waitFor();
    assert.match(await screen.locator(".one").textContent(), /合成一句话/);
    assert.match(await screen.locator(".g7-head dl").textContent(), /合成目标.*合成不做/);
    assert.match(await page.locator('[data-ps-cart="collab"] .flag').textContent(), /待人工验收 1 张/);
    assert.match(await screen.locator("[data-ps-next]").textContent(), /#3 修窄屏/, "下一步取 ready-for-agent 编号最小的");
    assert.match(await screen.locator(".g7-field").textContent(), /未开启/);
    assert.equal(await page.locator(".cnt .lcd.violet .dash").textContent(), "—", "实战未开启时页头技能数显示 —");
    ok("卡带按名册排、默认选第一盘；档案头摘要、要注意的事、下一步取数、实战未开启");

    await page.locator('[data-ps-cart="gone"]').click();
    await screen.getByRole("heading", { name: /已删项目/ }).waitFor();
    assert.match(await page.locator('[data-ps-cart="gone"] .flag').textContent(), /本机找不到目录/);
    assert.equal(await screen.getByRole("button", { name: "置顶" }).isDisabled(), true);
    await page.keyboard.press("ArrowLeft");
    await screen.getByRole("heading", { name: /文档项目/ }).waitFor();
    ok("点卡带与方向键都能换档案；找不到目录的项目不能置顶");

    // 置顶：最多 3 个，超出时提示先取消一个；置顶的排到最前
    for (const id of ["bare", "leaky", "docs"]) {
      await page.locator(`[data-ps-cart="${id}"]`).click();
      await screen.getByRole("button", { name: "置顶" }).click();
      await screen.getByRole("button", { name: "已置顶" }).waitFor();
    }
    await page.locator('[data-ps-cart="collab"]').click();
    await screen.getByRole("button", { name: "置顶" }).click();
    await page.locator(".g5-receipt").filter({ hasText: "最多 3 个" }).waitFor();
    const order = await carts.evaluateAll((els) => els.map((e) => e.dataset.psCart));
    assert.deepEqual(order.slice(0, 3).sort(), ["bare", "docs", "leaky"]);
    const ws = (await app.call("/workspace")).body;
    assert.equal(ws.connections.projects.filter((p) => p.active).length, 3);
    ok("置顶写进主库（回读一致）、排到最前；第 4 个提示先取消一个");

    await noOverflow(page, "1440");
    await bigEnough(page, "1440");
    const axe = await new AxeBuilder({ page }).include(".projects-space").analyze();
    assert.deepEqual(axe.violations.map((v) => v.id), []);
    await page.screenshot({ path: join(output, "projects-space-1440.png"), fullPage: true });
    ok("1440 无横向溢出、控件不小于 44px、axe 无违规");
    await context.close();
  }

  // ---- 390：卡带横向滑动、档案屏通栏 ----
  {
    const { page, context } = await open(390, { height: 844 });
    await noOverflow(page, "390");
    await bigEnough(page, "390");
    const rack = await page.locator(".g5-carts").evaluate((el) => ({ scroll: el.scrollWidth > el.clientWidth, w: el.firstElementChild.getBoundingClientRect().width }));
    assert.ok(rack.scroll, "手机上卡带架横向滑动");
    assert.ok(Math.abs(rack.w - 148) <= 1, `卡带宽 148，实际 ${rack.w}`);
    await page.screenshot({ path: join(output, "projects-space-390.png"), fullPage: true });
    ok("390 无横向溢出、卡带架横向滑动、控件不小于 44px");
    await context.close();
  }

  // ---- 减少动态效果：选中直接到位，不显示流光 ----
  {
    const { page, context } = await open(1440, { reduced: true });
    await page.locator('[data-ps-cart="leaky"]').click();
    const flow = await page.locator('[data-ps-cart="leaky"] .flow').evaluate((el) => getComputedStyle(el).display);
    assert.equal(flow, "none");
    assert.equal(await page.locator("#ps-screen .caret").count(), 0, "下一步直接显示，不逐字");
    ok("减少动态效果时没有流光、不逐字");
    await context.close();
  }

  // ---- 名册读不到：卡带架位置只给原因和去设置 ----
  {
    await rm(app.rosterPath);
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await context.newPage();
    await page.goto(app.url + "/#projects");
    await page.locator(".ps-roster-error").waitFor();
    assert.match(await page.locator(".ps-roster-error").textContent(), /名册读不到/);
    assert.equal(await page.locator("#ps-screen").count(), 0);
    ok("名册读不到时只显示原因与去设置，档案屏不出现");
    await context.close();
  }
  assert.deepEqual(errors, []);
} finally {
  await browser.close();
  await app.close();
}
