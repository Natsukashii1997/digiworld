// 用户六图返修：只用临时工作台与静态减少动态效果，检查可见布局和静止蛋原像素。
import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { chromium } from "playwright";
import { fixture } from "./fixture.mjs";
import { rasterEgg } from "../src/partner-lcd.js";

const out = process.env.GUIJI_TEST_RESULTS || "test-results/ui-user-258";
await mkdir(out, { recursive: true });
const app = await fixture();
const browser = await chromium.launch();
const errors = [];

async function helpRing(page, selector, dialogName) {
  const button = page.locator(selector);
  const ring = await button.evaluate((element) => {
    const rect = element.getBoundingClientRect();
    const pseudo = getComputedStyle(element, "::before");
    return { width: rect.width, height: rect.height, inset: pseudo.left, border: pseudo.borderTopWidth };
  });
  assert.deepEqual(ring, { width: 44, height: 44, inset: "8px", border: "1px" });
  await button.click();
  await page.getByRole("dialog", { name: dialogName }).waitFor();
  await page.getByRole("button", { name: /关闭/ }).last().click();
  await page.getByRole("dialog", { name: dialogName }).waitFor({ state: "detached" });
}

async function staticEgg(page) {
  const actual = await page.locator(".hx-device .lcd-stage canvas").evaluate((canvas) => {
    const ctx = canvas.getContext("2d");
    const cells = [];
    for (let row = 0; row < 15; row++) for (let col = 0; col < 14; col++) {
      const x = Math.floor((col + 0.5) * canvas.width / 14);
      const y = Math.floor((row + 0.5) * canvas.height / 15);
      const pixel = ctx.getImageData(x, y, 1, 1).data;
      if (pixel[0] > 150 && pixel[1] > 80 && pixel[3] > 100)
        cells.push(`${col},${row}`);
    }
    return cells.sort();
  });
  const egg = rasterEgg(0);
  const originY = 14 - egg.bottom;
  const expected = [...egg.cells]
    .filter(([, shade]) => shade >= 5)
    .map(([key]) => {
      const [x, y] = key.split(",").map(Number);
      return `${7 + x},${originY + y}`;
    }).sort();
  assert.deepEqual(actual, expected, "首页静止蛋应使用获确认的 12×14 原轮廓");
}

try {
  for (const width of [1440, 1024, 390, 320]) {
    const context = await browser.newContext({ viewport: { width, height: 900 }, reducedMotion: "reduce" });
    const page = await context.newPage();
    page.setDefaultTimeout(12000);
    page.on("pageerror", (error) => errors.push(`${width}: ${error.message}`));
    await page.goto(`${app.url}/#assets`);
    await page.locator(".asset-toolbar").waitFor();
    const geometry = await page.evaluate(() => {
      const rect = (selector) => {
        const r = document.querySelector(selector).getBoundingClientRect();
        return { top: r.top, bottom: r.bottom, left: r.left, right: r.right, cy: (r.top + r.bottom) / 2 };
      };
      return {
        types: rect(".asset-toolbar > .segmented"),
        search: rect(".asset-heading-actions .inline-search"),
        create: rect(".asset-heading-actions button"),
        options: rect(".asset-toolbar > .toolbar-right"),
        result: rect(".collection-meta"),
        overflow: document.documentElement.scrollWidth - innerWidth,
      };
    });
    assert.ok(Math.abs(geometry.search.cy - geometry.create.cy) < 24, `${width} 搜索与新建同排`);
    if (width >= 1180)
      assert.ok(Math.abs(geometry.types.cy - geometry.options.cy) < 24, `${width} 类型与控制项同排`);
    assert.ok(geometry.result.top >= Math.max(geometry.types.bottom, geometry.options.bottom) + 8, `${width} 结果数不得压到工具条`);
    assert.ok(geometry.overflow <= 0, `${width} 页面横向溢出 ${geometry.overflow}px`);
    assert.match(await page.locator(".collection-meta").innerText(), /当前结果/);
    await helpRing(page, ".page-assets .page-help", "资产仓库 · 这页怎么用");
    await page.locator(".asset-toolbar .segmented button").filter({ hasText: "Skills" }).click();
    assert.equal(await page.locator(".asset-toolbar .segmented button[aria-pressed=true]").innerText().then(text => text.includes("Skills")), true);
    await page.getByLabel("排序方式").selectOption("name");
    assert.equal(await page.locator(".asset-grid").count(), 1);
    assert.equal(await page.getByRole("group", { name: "视图模式" }).count(), 0);
    assert.equal(await page.getByRole("button", { name: /^(网格视图|列表视图)$/ }).count(), 0);
    assert.equal(await page.locator(".asset-grid.list-layout").count(), 0);
    await page.getByLabel("在资产中搜索").fill("不存在的合成关键词");
    assert.match(await page.locator(".collection-meta").innerText(), /当前结果\s*·\s*0/);
    await page.getByLabel("在资产中搜索").fill("");
    await page.screenshot({ path: join(out, `assets-${width}.png`), fullPage: true });

    await page.goto(`${app.url}/#settings`);
    await page.locator(".settings-v16 .page-help").waitFor();
    await helpRing(page, ".settings-v16 .page-help", "设置 · 这页怎么用");
    await page.screenshot({ path: join(out, `settings-${width}.png`), fullPage: true });

    await page.goto(`${app.url}/#night`);
    await page.locator(".night-v16 .nv-help").waitFor();
    await helpRing(page, ".night-v16 .nv-help", "夜巡说明");
    await page.screenshot({ path: join(out, `night-${width}.png`), fullPage: true });

    await page.goto(`${app.url}/#home`);
    await page.locator(".hx-device .lcd-stage canvas").waitFor();
    await staticEgg(page);
    if (width === 320) {
      const compact = await page.evaluate(() => {
        const week = document.querySelector(".hx-dow .en");
        const title = document.querySelector(".hx-mod-d h2");
        const lineHeight = parseFloat(getComputedStyle(week).lineHeight) ||
          parseFloat(getComputedStyle(week).fontSize) * 1.4;
        return { weekHeight: week.getBoundingClientRect().height, lineHeight,
          titleWidth: title.clientWidth, titleScrollWidth: title.scrollWidth };
      });
      assert.ok(compact.weekHeight <= compact.lineHeight + 1, "320px 周数应保持一行");
      assert.ok(compact.titleScrollWidth <= compact.titleWidth + 1, "320px D 卡标题不得侵入项目入口");
    }
    await page.screenshot({ path: join(out, `home-${width}.png`), fullPage: true });
    await context.close();
  }
  assert.deepEqual(errors, []);
  console.log("PASS 用户六图专项：四宽资产控件/结果/筛选排序视图、三页帮助圈、首页静态蛋原像素");
} finally {
  await browser.close();
  await app.close();
}
