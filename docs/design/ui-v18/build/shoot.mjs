// 视觉稿截图：1440×900 首屏 + 390×844 全页。需要 5178 正式服务在运行（收藏封面从那里读取）。
import { chromium } from "../../../../node_modules/playwright/index.mjs";
import path from "node:path";
const dir = path.resolve(import.meta.dirname, "..");
const pages = ["基地-A", "基地-B", "资产仓库-A", "资产仓库-B"];
const browser = await chromium.launch();
for (const [w, h, tag, full] of [[1440, 900, "1440", false], [390, 844, "390", true]]) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 2 });
  // 收藏封面带 Cross-Origin-Resource-Policy: same-origin，本地文件页读不到；截图时代取并去掉这个头。
  await ctx.route("http://127.0.0.1:5178/collection-media/**", async (route) => {
    const response = await route.fetch();
    const headers = { ...response.headers() };
    delete headers["cross-origin-resource-policy"];
    await route.fulfill({ response, headers });
  });
  const page = await ctx.newPage();
  for (const p of pages) {
    await page.goto("file://" + path.join(dir, p + ".html"));
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(400);
    await page.screenshot({ path: path.join(dir, "shots", `${p}-${tag}.png`), fullPage: full });
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
    console.log(p, tag, overflow > 0 ? `横向溢出 ${overflow}px` : "无横向溢出");
  }
  await ctx.close();
}
await browser.close();
