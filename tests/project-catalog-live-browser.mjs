import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { chromium } from "playwright";

const base = "http://127.0.0.1:5178";
const output = "/Users/nat/Documents/Codex/2026-10-09/wo-m/outputs";
await mkdir(output, { recursive: true });
const browser = await chromium.launch();
const errors = [];
try {
  for (const [width, height, label] of [[1440, 900, "桌面"], [390, 844, "手机"]]) {
    const context = await browser.newContext({ viewport: { width, height }, reducedMotion: "reduce" });
    const page = await context.newPage();
    page.on("pageerror", (error) => errors.push(error.message));
    const response = await page.goto(`${base}/#projects`);
    assert.equal(response.status(), 200);
    await page.getByRole("button", { name: "项目：数码世界｜个人 AI 工作台" }).waitFor();
    const racks = page.locator(".pj-rack");
    assert.deepEqual(await racks.locator("h4 > .en:first-child").allInnerTexts(),
      ["ZONE 01", "ZONE 02"]);
    assert.deepEqual(await racks.locator("h4 b").allInnerTexts(),
      ["个人产品", "业务系统"]);
    assert.equal(await page.locator(".pj-rack .pj-cs").count(), 6);
    assert.equal(await page.getByText(/知识与工具资产 · 6/).count(), 1);
    assert.equal(await page.getByText(/任务与阶段成果 · 4/).count(), 1);
    assert.equal(await page.getByText(/待归类与待判定 · 11/).count(), 1);
    assert.equal(await page.getByText(/隐藏来源 · 7/).count(), 1);
    assert.equal(await page.locator(".pj-rack .pj-cs").filter({ hasText: "T1 售前双报告设计" }).count(), 0);
    assert.equal(await page.locator(".pj-rack .pj-cs").filter({ hasText: "Claude 数据迁移" }).count(), 0);
    assert.equal(await page.getByText("TraineeOS", { exact: true }).count(), 0);
    assert.equal(await page.getByText("银饰工作台", { exact: true }).count(), 0);
    assert.equal(await page.getByText("银作间", { exact: true }).count(), 0);
    assert.equal(await page.getByText("绘术星图 MuseMap", { exact: true }).count(), 0);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
    assert.ok(overflow <= 2, `${label} horizontal overflow: ${overflow}`);
    await page.screenshot({ path: join(output, `数码世界-项目空间-${label}-2026-10-09.png`), fullPage: true });
    if (width === 1440) {
      await page.getByRole("button", { name: "项目：数码世界｜个人 AI 工作台" }).click();
      await page.getByText("数码世界｜GitHub 远端", { exact: true }).waitFor();
      await page.keyboard.press("Escape");
      await page.getByText(/知识与工具资产 · 6/).click();
      await page.getByRole("button", { name: /Obsidian 知识底座/ }).click();
      const dialog = page.getByRole("dialog", { name: "Obsidian 知识底座" });
      await dialog.getByText(/仅作目录入口展示/).waitFor();
      assert.equal(await dialog.getByRole("button", { name: "标为在推进" }).count(), 0);
      await page.keyboard.press("Escape");
      await page.getByText(/任务与阶段成果 · 4/).click();
      await page.getByRole("button", { name: /Claude 数据迁移/ }).click();
      const taskDialog = page.getByRole("dialog", { name: "Claude 数据迁移" });
      await taskDialog.getByText(/业务验证与跨 AI 串联未完成/).waitFor();
      assert.equal(await taskDialog.getByRole("button", { name: "标为在推进" }).count(), 0);
    }
    await context.close();
  }
  assert.deepEqual(errors, []);
  console.log("PASS 原 5178 项目页：6 个主项目、任务与资产分层、候选与隐藏来源、已删项目缺席、附属远端、仅展示门禁、桌面与 390px 无溢出，页面错误 0。");
} finally { await browser.close(); }
