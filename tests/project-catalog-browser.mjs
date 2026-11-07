// #71 项目名册只读：旧版项目页（?projects-v16）照旧按已有展示目录分区展示，但不再有目录编辑、重新扫描与手工登记，改为只读说明。
// 旧目录数据直接写进隔离主库（不经已下线的整理接口），只用合成目录。
import assert from "node:assert/strict";
import { chromium } from "playwright";
import { projectStatusFixture } from "./project-status-fixture.mjs";

const app = await projectStatusFixture();
const browser = await chromium.launch();
const errors = [];
try {
  const before = await app.workspace();
  const projects = before.connections.projects;
  const collab = projects.find((project) => project.name === "协同项目");
  const leaky = projects.find((project) => project.name === "泄露项目");
  const docs = projects.find((project) => project.name === "文档项目");
  const bare = projects.find((project) => project.name === "无协议项目");
  const catalog = [
    { projectId: collab.id, displayName: "协同业务系统", section: "business", view: "main" },
    { projectId: bare.id, displayName: "无协议个人项目", section: "personal", view: "main" },
    { projectId: leaky.id, displayName: "辅助工具", section: "tools", view: "asset" },
    { projectId: docs.id, displayName: "一次性报告", section: "completed", view: "task" },
  ];
  await app.repository.updateConnections((c) => ({ ...c, projectCatalog: catalog }));
  const saved = structuredClone((await app.repository.read()).connections);
  for (const width of [1440, 390]) {
    const context = await browser.newContext({ viewport: { width, height: 950 }, reducedMotion: "reduce" });
    const page = await context.newPage();
    page.setDefaultTimeout(10000);
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto(`${app.url}/?projects-v16#projects`);
    await page.getByRole("button", { name: "项目：协同业务系统" }).waitFor();
    assert.equal(await page.locator(".pj-rack .pj-cs").count(), 2);
    assert.match(await page.locator(".pj-rack").first().innerText(), /个人产品/);
    assert.match(await page.locator(".pj-rack").nth(1).innerText(), /业务系统/);
    await page.getByText(/项目名册以 digital-twin\/projects\.json 为准，在数码世界只读/).first().waitFor();
    assert.equal(await page.getByRole("button", { name: "重新扫描" }).count(), 0);
    await page.getByText(/知识与工具资产/).click();
    await page.getByRole("button", { name: /辅助工具/ }).waitFor();
    if (width === 1440) {
      await page.getByRole("button", { name: "项目：协同业务系统" }).click();
      const dialog = page.getByRole("dialog", { name: "协同业务系统" });
      await dialog.getByText(/项目名册以 digital-twin\/projects\.json 为准/).first().waitFor();
      assert.equal(await dialog.getByLabel("展示名").count(), 0);
      assert.equal(await dialog.getByRole("button", { name: "保存展示信息" }).count(), 0);
      assert.equal(await dialog.getByRole("button", { name: /关联已发现目录/ }).count(), 0);
      assert.equal(await dialog.getByRole("button", { name: "重新确认目录" }).count(), 0);
      await dialog.getByRole("button", { name: "复制路径" }).first().waitFor();
      await page.keyboard.press("Escape");
      await page.getByRole("button", { name: "项目空间设置", exact: true }).click();
      const drawer = page.getByRole("dialog", { name: "项目空间设置" });
      await drawer.getByText(/项目名册以 digital-twin\/projects\.json 为准/).waitFor();
      assert.equal(await drawer.getByRole("button", { name: "保存并扫描" }).count(), 0);
      assert.equal(await drawer.getByRole("button", { name: "登记目录" }).count(), 0);
      await drawer.getByLabel("停滞阈值（天）").waitFor();
      await page.keyboard.press("Escape");
    }
    const horizontalOverflow = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
    assert.ok(horizontalOverflow <= 2, `${width}px horizontal overflow ${horizontalOverflow}`);
    await context.close();
  }
  assert.deepEqual((await app.repository.read()).connections, saved, "只读浏览不改主库连接");
  assert.deepEqual(errors, []);
  console.log("PASS 旧版项目页按旧目录分区只读展示；详情、设置抽屉无目录编辑、扫描、手工登记与目录关联；1440/390 无横向溢出。");
} finally {
  await browser.close();
  await app.close();
}
