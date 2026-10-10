import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { chromium } from "playwright";
import { projectStatusFixture } from "./project-status-fixture.mjs";
import { manualProjectId } from "../server/project-catalog.mjs";

const app = await projectStatusFixture();
const browser = await chromium.launch();
const errors = [];
try {
  const before = await app.workspace();
  const projects = before.connections.projects;
  const collab = projects.find((project) => project.name === "协同项目");
  const bare = projects.find((project) => project.name === "无协议项目");
  const leaky = projects.find((project) => project.name === "泄露项目");
  const docs = projects.find((project) => project.name === "文档项目");
  const manualPath = join(app.paths.projects, "无标记独立项目");
  await mkdir(manualPath);
  const applied = await app.call("/project-catalog/apply", {
    revision: before.revision,
    manualProjects: [{ path: manualPath, name: "无标记独立项目" }],
    exclusions: [`id:${bare.id}`],
    items: [
      { projectId: collab.id, displayName: "协同业务系统", section: "business", view: "main" },
      { projectId: manualProjectId(manualPath), displayName: "手工项目", section: "personal", view: "main" },
      { projectId: leaky.id, displayName: "辅助工具", section: "tools", view: "asset" },
      { projectId: docs.id, displayName: "一次性报告", section: "completed", view: "task" },
    ],
  });
  assert.equal(applied.status, 200, JSON.stringify(applied.body));
  let currentName = "协同业务系统";
  for (const width of [1440, 390]) {
    const context = await browser.newContext({ viewport: { width, height: 950 }, reducedMotion: "reduce" });
    const page = await context.newPage();
    page.setDefaultTimeout(10000);
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto(`${app.url}/#projects`);
    await page.getByRole("button", { name: `项目：${currentName}` }).waitFor();
    assert.equal(await page.locator(".pj-rack .pj-cs").count(), 2);
    assert.deepEqual(await page.locator(".pj-rack h4 > .en:first-child").allInnerTexts(), ["ZONE 01", "ZONE 02"]);
    assert.match(await page.locator(".pj-rack").first().innerText(), /个人产品/);
    assert.match(await page.locator(".pj-rack").nth(1).innerText(), /业务系统/);
    assert.equal(await page.getByText("无协议项目", { exact: true }).count(), 0);
    await page.getByText(/知识与工具资产/).click();
    await page.getByRole("button", { name: /辅助工具/ }).waitFor();
    await page.getByText(/任务与阶段成果/).click();
    await page.getByRole("button", { name: /一次性报告/ }).waitFor();
    if (width === 1440) {
      await page.getByRole("button", { name: /辅助工具/ }).click();
      const assetDialog = page.getByRole("dialog", { name: "辅助工具" });
      await assetDialog.getByText(/先改为「独立项目」/).waitFor();
      assert.equal(await assetDialog.getByRole("button", { name: "标为在推进" }).count(), 0);
      await page.keyboard.press("Escape");
      await page.getByRole("button", { name: "项目：协同业务系统" }).click();
      const dialog = page.getByRole("dialog", { name: "协同业务系统" });
      await dialog.getByLabel("展示名").fill("协同业务平台");
      await dialog.getByRole("button", { name: "保存展示信息" }).click();
      await page.getByText("项目展示信息已保存", { exact: true }).waitFor();
      assert.equal((await app.workspace()).connections.projectCatalog.find((item) => item.projectId === collab.id).displayName, "协同业务平台");
      currentName = "协同业务平台";
      await page.keyboard.press("Escape");
    }
    const horizontalOverflow = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
    assert.ok(horizontalOverflow <= 2, `${width}px horizontal overflow ${horizontalOverflow}`);
    await context.close();
  }
  assert.deepEqual(errors, []);
  console.log("PASS 项目与资产/任务分层、资产不可直接标在推进、删除项消失、展示名编辑、1440/390 无横向溢出。");
} finally {
  await browser.close();
  await app.close();
}
