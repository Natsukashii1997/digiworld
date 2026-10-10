import assert from "node:assert/strict";
import { chromium } from "playwright";
import { settingsFixture, settingsRoutes } from "./settings-v16-fixture.mjs";

const app = await settingsFixture();
const browser = await chromium.launch();
try {
  const page = await browser.newPage({ viewport:{ width:1440, height:1000 }, reducedMotion:"reduce" });
  await settingsRoutes(page);
  let entered;
  const scanStarted = new Promise((resolve) => { entered = resolve; });
  let release;
  const scanGate = new Promise((resolve) => { release = resolve; });
  await page.route("**/api/scan/projects", async (route) => {
    entered();
    await scanGate;
    await route.continue();
  });
  await page.goto(app.url + "/#projects");
  await scanStarted;
  await page.getByRole("button", { name:"项目空间设置", exact:true }).click();
  const drawer = page.getByRole("dialog", { name:"项目空间设置" });
  await drawer.getByLabel("停滞阈值（天）").fill("12");
  const before = (await app.repository.read()).revision;
  release();
  await page.getByRole("button", { name:"重新扫描", exact:true }).waitFor({ state:"visible" });
  await page.waitForFunction(() => !document.querySelector('button[aria-label="重新扫描"]')?.disabled);
  assert.ok((await app.repository.read()).revision > before);
  await drawer.getByRole("button", { name:"保存阈值", exact:true }).click();
  await page.getByText("停滞阈值已保存为 12 天", { exact:true }).waitFor();
  assert.equal((await app.repository.read()).connections.projectStallDays, 12);
  console.log("PASS 项目自动扫描更新版本时，设置抽屉保留草稿并保存阈值");
} finally {
  await browser.close();
  await app.close();
}
