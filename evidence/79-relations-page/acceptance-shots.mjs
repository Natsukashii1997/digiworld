// #79 验收截图（合成数据，照定稿的 16 个项目；不读真实名册与 data/）。
// 用法：npm run build 后 PLAYWRIGHT_CHROMIUM=<headless shell> node evidence/79-relations-page/acceptance-shots.mjs
// 四张：1440 默认态、1440 选中「驿窗」、1440 悬停桑基「agent-kit」、390 默认态；另截定稿 1440 作对照。
// 1440 用 1800 高的视口，整页不用滚动（悬停时页面不动，整页截图不拼接）。等字体与进场动效结束再截；交互用真实鼠标 / 键盘事件。
import { createRequire } from "node:module";
import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { spaceFixture } from "../../tests/projects-space-fixture.mjs";
import { relationsSample } from "../../tests/project-relations-sample.mjs";

const root = join(import.meta.dirname, "../..");
const out = join(import.meta.dirname, "final");
await mkdir(out, { recursive: true });
const { chromium } = createRequire(import.meta.url)(
  process.env.PLAYWRIGHT_MODULE || "/Users/nat/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright",
);
const app = await spaceFixture({ staticRoot: join(root, "dist"), skillUsage: { enabled: async () => false } });
const browser = await chromium.launch(process.env.PLAYWRIGHT_CHROMIUM ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM } : {});
const settled = (page) => page.waitForFunction(() => document.fonts.status === "loaded" && !document.querySelector(".pr-orbit .lk.draw, .pr-orbit .nd.in, .pr-orbit .ring.spin, .pr-flow .flow.grow"), null, { timeout: 8000 });

async function open(width, height) {
  const context = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 1 });
  await context.route("**/api/projects-space/relations*", (r) => r.fulfill({ contentType: "application/json", body: JSON.stringify(relationsSample()) }));
  const page = await context.newPage();
  await page.goto(app.url + "/#projects");
  await page.locator("[data-ps-cart]").first().waitFor();
  await page.getByRole("tablist", { name: "项目空间页签" }).getByRole("tab", { name: /项目关系/ }).click();
  await page.locator(".pr-orbit .nd").first().waitFor();
  await settled(page);
  await page.mouse.move(2, 2);
  return { page, context };
}

try {
  {
    const { page, context } = await open(1440, 1800);
    await page.waitForTimeout(400);
    await page.screenshot({ path: join(out, "1-默认-1440.png"), fullPage: true });
    const box = await page.locator('.pr-orbit .nd[data-id="postpane"] .pill').boundingBox();
    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.move(2, 2);
    await page.waitForTimeout(900); // 光点流动、呼吸进入稳定段
    await page.screenshot({ path: join(out, "2-选中驿窗-1440.png"), fullPage: true });
    await page.mouse.click(30 + (await page.locator(".pr-orbit .pr-bg").boundingBox()).x, 30 + (await page.locator(".pr-orbit .pr-bg").boundingBox()).y);
    const base = await page.locator('.pr-flow .nd[data-node="b:agent-kit"] rect').boundingBox();
    await page.mouse.move(base.x + base.width / 2, base.y + base.height / 2);
    await page.waitForTimeout(900);
    await page.screenshot({ path: join(out, "3-悬停agent-kit-1440.png"), fullPage: true });
    await context.close();
  }
  {
    const { page, context } = await open(390, 844);
    await page.waitForTimeout(400);
    await page.screenshot({ path: join(out, "4-默认-390.png"), fullPage: true });
    await context.close();
  }
  {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1800 }, deviceScaleFactor: 1 });
    await page.goto("file://" + join(root, "docs/design/projects-space-v3/项目关系-定稿.html"));
    await page.waitForFunction(() => document.querySelector("#s .nd"), null, { timeout: 15000 });
    await page.evaluate(() => document.fonts.ready);
    await page.waitForTimeout(3500);
    await page.screenshot({ path: join(out, "0-定稿-1440.png"), fullPage: true });
    await page.close();
  }
  console.log("截图完成：", out);
} finally {
  await browser.close();
  await app.close();
}
