// R87-B1～B5 返修回归：Codex 复核 87 的五组失败场景（docs/agents/handoffs/2026-09-30-codex-review-87.md）。
import { createRequire } from "node:module";
import assert from "node:assert/strict";
import AxeBuilder from "@axe-core/playwright";
import { contextFixture } from "./context-fixture.mjs";
const require = createRequire(import.meta.url);
const { chromium } = require(
  process.env.PLAYWRIGHT_MODULE ||
    "/Users/nat/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright",
);
const app = await contextFixture();
const browser = await chromium.launch({ headless: true });
const errors = [];
const open = (options = {}) =>
  browser.newContext({
    viewport: { width: 1440, height: 1000 },
    permissions: ["clipboard-read", "clipboard-write"],
    ...options,
  });
const watch = (page) => {
  page.on("pageerror", (e) => errors.push(e.message));
  page.setDefaultTimeout(5000);
  return page;
};
const COPY = [
  [/查看 把模糊想法/, "复制全文"],
  [/查看 从灵感到上线/, "复制流程说明"],
  [/查看 设计的最后一公里/, "复制本机安装口令"],
];
const lcdFits = (page) =>
  page.locator(".transfer-lcd canvas").evaluate((canvas) => {
    const b = canvas.closest("button").getBoundingClientRect(),
      r = canvas.getBoundingClientRect();
    return {
      inside: r.left >= b.left - 0.5 && r.right <= b.right + 0.5 && r.top >= b.top - 0.5 && r.bottom <= b.bottom + 0.5,
      canvas: Math.round(r.width),
      button: Math.round(b.width),
    };
  });

const failures = [];
async function check(name, fn) {
  try {
    await fn();
    console.log("PASS", name);
  } catch (e) {
    failures.push(name);
    console.log("FAIL", name, "—", e.message.split("\n")[0]);
  }
}

try {
  // B1：三类复制按钮在桌面和窄屏上，TRANSFER OK 画布都完整落在按钮内
  await check("B1 三类复制按钮在 1440/390 宽度下 TRANSFER OK 都完整显示", async () => {
    for (const width of [1440, 390]) {
      const context = await open({ viewport: { width, height: 900 } });
      const page = watch(await context.newPage());
      await page.goto(app.url + "/#assets");
      for (const [asset, label] of COPY) {
        await page.getByRole("button", { name: asset }).click();
        await page.getByRole("button", { name: label, exact: true }).click();
        await page.locator(".transfer-lcd canvas").waitFor({ state: "attached" });
        const fit = await lcdFits(page);
        assert.ok(fit.inside, `${width}px「${label}」画布 ${fit.canvas}px 超出按钮 ${fit.button}px`);
        await page.locator(".transfer-lcd").waitFor({ state: "detached", timeout: 4000 });
        await page.keyboard.press("Escape");
      }
      await context.close();
    }
  });

  // B2：液晶画布拿不到绘图上下文时，两种动效模式都要收尾复原，恢复后还能再次演出
  await check("B2 装饰失败后覆盖层、状态类与运行锁全部收尾，下一次复制可再演出", async () => {
    for (const reducedMotion of ["no-preference", "reduce"]) {
      const context = await open({ reducedMotion });
      const page = watch(await context.newPage());
      await page.addInitScript(() => {
        const original = HTMLCanvasElement.prototype.getContext;
        window.__breakLcd = true;
        HTMLCanvasElement.prototype.getContext = function (...args) {
          return window.__breakLcd && this.closest?.(".transfer-lcd") ? null : original.apply(this, args);
        };
      });
      await page.goto(app.url + "/#assets");
      await page.getByRole("button", { name: /查看 把模糊想法/ }).click();
      const copy = page.getByRole("button", {
        name: "复制全文",
        exact: true,
      });
      await copy.click();
      await page.waitForTimeout(2300);
      assert.equal(await page.locator(".transfer-lcd").count(), 0, `${reducedMotion}：残留液晶覆盖层`);
      assert.equal(await page.locator("button.is-transferring, button.is-transferred").count(), 0);
      assert.equal(await copy.innerText(), "复制全文");
      await page.evaluate(() => (window.__breakLcd = false));
      await copy.click();
      await page.locator(".transfer-lcd canvas").waitFor({ state: "attached" });
      await page.locator(".transfer-lcd").waitFor({ state: "detached", timeout: 4000 });
      await context.close();
    }
  });

  // B3：减少动态效果时，数字直接显示新值：不出现旧数字，也不触发滚动与轻弹
  await check("B3 减少动态效果：计数、REV、版本号直接显示新值，无旧数、无轻弹", async () => {
    const context = await open({ reducedMotion: "reduce" });
    const page = watch(await context.newPage());
    await page.goto(app.url + "/#assets");
    await page.evaluate(() => {
      window.__rolled = 0;
      new MutationObserver(() => {
        if (document.querySelector(".odo-old, .is-rolling")) window.__rolled++;
      }).observe(document.body, {
        subtree: true,
        childList: true,
        attributes: true,
        attributeFilter: ["class"],
      });
    });
    const navCount = page.locator(".nav-item", { hasText: "资产仓库" }).locator(".nav-count");
    const before = Number(await navCount.innerText());
    await page.getByRole("button", { name: "新建", exact: true }).click();
    await page.getByRole("dialog").getByRole("button", { name: "Prompt", exact: true }).click();
    await page.getByLabel("名称", { exact: true }).fill("减动画计数");
    await page.getByLabel("提示词全文").fill("第一版");
    await page.getByRole("button", { name: "保存资产", exact: true }).click();
    await page.waitForTimeout(700);
    assert.equal(Number(await navCount.innerText()), before + 1);
    await page.keyboard.press("Escape");
    await page.getByRole("button", { name: "查看 减动画计数", exact: true }).click();
    await page.getByRole("button", { name: "编辑资产", exact: true }).click();
    await page.getByLabel("提示词全文").fill("第二版");
    await page.getByRole("button", { name: "保存新版本", exact: true }).click();
    await page.waitForTimeout(700);
    assert.equal((await page.locator(".detail-version").innerText()).replace(/\s/g, ""), "v2.0");
    assert.equal(await page.evaluate(() => window.__rolled), 0, "减少动态效果时出现了旧数字或滚动");
    await context.close();
  });

  // B4：数字屏随待处理条数更新；减少动态效果下切换后没有旧蛋残影
  await check("B4 数字屏随待处理条数更新；减少动态效果下切换画面干净", async () => {
    const context = await open({ reducedMotion: "reduce" });
    const page = watch(await context.newPage());
    let release;
    await page.route("**/api/rule-templates/installs", async (route) => {
      await new Promise((resolve) => (release = resolve));
      await route.fulfill({
        status: 500,
        contentType: "application/json",
        body: '{"error":"synthetic"}',
      });
    });
    await page.goto(app.url + "/#home");
    const lcd = page.locator(".digivice-lcd canvas");
    const count = async () => (await page.locator('.hx-qcount b').allInnerTexts()).reduce((n, text) => n + Number(text), 0);
    const a = page.getByRole("button", { name: /^A 键/ });
    await a.click();
    assert.equal(await lcd.getAttribute("data-view"), "number");
    const eggPixels = await lcd.evaluate((el) => {
      const data = el.getContext("2d").getImageData(0, 0, el.width, el.height).data;
      let orange = 0;
      for (let i = 0; i < data.length; i += 4)
        if (data[i] > 200 && data[i + 1] > 70 && data[i + 1] < 170 && data[i + 2] < 90 && data[i + 3] > 20) orange++;
      return orange;
    });
    assert.equal(eggPixels, 0, `切到数字后残留 ${eggPixels} 个蛋像素`);
    const first = await count();
    const frame0 = await lcd.evaluate((el) => el.toDataURL());
    release();
    await page.waitForFunction((n) => {
      const counts = [...document.querySelectorAll('.hx-qcount b')].map(el => Number(el.textContent));
      return counts.length === 3 && counts.reduce((sum, value) => sum + value, 0) !== n;
    }, first);
    await page.waitForTimeout(200);
    const frame1 = await lcd.evaluate((el) => el.toDataURL());
    assert.notEqual(frame1, frame0, "待处理条数变化后数字屏没有更新");
    await a.click();
    await a.click();
    assert.equal(await lcd.evaluate((el) => el.toDataURL()), frame1, "数字屏与重新切换后的画面不一致");
    await context.close();
  });

  // B5：C 机身键在左侧圆键位置，真实按钮、44px、键盘可用，复用戳一下
  await check("B5 C 机身键可点、可键盘操作、44px，保留直接点屏幕", async () => {
    const context = await open();
    const page = watch(await context.newPage());
    await page.goto(app.url + "/#home");
    const c = page.getByRole("button", { name: /^C 键/ });
    const box = await c.boundingBox();
    const screen = await page.locator(".digivice-lcd").boundingBox();
    assert.ok(box.width >= 44 && box.height >= 44, "C 键至少 44px");
    assert.ok(box.x + box.width / 2 < screen.x, "C 键在屏幕左侧");
    await page.getByRole("button", { name: /^A 键/ }).click();
    assert.equal(await page.locator(".digivice-lcd canvas").getAttribute("data-view"), "number");
    await c.focus();
    await page.keyboard.press("Enter");
    assert.equal(await page.locator(".digivice-lcd canvas").getAttribute("data-view"), "egg", "C 键戳蛋时切回蛋");
    assert.ok(await page.getByRole("button", { name: /^戳一下/ }).count(), "直接点屏幕的入口保留");
    assert.deepEqual(
      (await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze()).violations,
      [],
    );
    await context.close();
  });

  assert.deepEqual(failures, [], `失败：${failures.join("、")}`);
  assert.deepEqual(errors, []);
} finally {
  await browser.close();
  await app.close();
}
