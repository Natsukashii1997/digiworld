import { fixture } from "./fixture.mjs";
const app = await fixture();
import { createRequire } from "node:module";
import { mkdir, writeFile } from "node:fs/promises";
import AxeBuilder from "@axe-core/playwright";
const require = createRequire(import.meta.url);
const { chromium } = require(
  process.env.PLAYWRIGHT_MODULE ||
    "/Users/nat/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright",
);
const browser = await chromium.launch();
const context = await browser.newContext({
  viewport: { width: 1440, height: 1000 },
  reducedMotion: "reduce",
});
const page = await context.newPage();
const reports = [];
async function scan(name) {
  const result = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
    .analyze();
  reports.push({
    name,
    violations: result.violations.map((v) => ({
      id: v.id,
      impact: v.impact,
      nodes: v.nodes.map((n) => ({
        target: n.target,
        summary: n.failureSummary,
      })),
    })),
  });
  console.log(name, JSON.stringify(reports.at(-1).violations));
}
try {
  for (const route of [
    "assets",
    "agents",
    "projects",
    "knowledge",
    "notes",
    "night",
    "references",
    "history",
    "settings",
    "inbox",
    "health",
    "collab",
    "calendar",
    "aihot",
    "learning",
    "silver",
  ]) {
    await page.goto(app.url + "/#" + route);
    if(route==="inbox")await page.getByRole("dialog",{name:"待处理",exact:true}).waitFor();
    else await page.locator(".page-heading").waitFor();
    await scan(route);
  }
  // 今日页没有标准页头，单独等待首屏后检查。
  await page.goto(app.url + "/#home");
  await page.locator(".hx").waitFor();
  await scan("home");
  await page.goto(app.url + "/#assets");
  await page.getByRole("button", { name: "新建资产", exact: true }).click();
  await scan("create-dialog");
  await page.keyboard.press("Escape");
  await page
    .getByRole("button", { name: "查看 设计的最后一公里", exact: true })
    .click();
  await scan("asset-drawer");
  await page.keyboard.press("Escape");
  await page.keyboard.press("Meta+k");
  await scan("search-dialog");
  await mkdir("test-results", { recursive: true });
  await writeFile(
    "test-results/accessibility-report.json",
    JSON.stringify(reports, null, 2),
  );
  if (reports.some((r) => r.violations.length)) process.exitCode = 1;
} finally {
  await browser.close();
  await app.close();
}
