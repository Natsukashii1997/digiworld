// R87-S1：使用次数数字滚动（设计 13.2 第 4 节“数字会滚动”）。
// 复制成功、次数 +1 时，资产卡片封面左下角与详情“使用记录与反馈”里的次数都用 Odometer 滚到新值；
// 系统“减少动态效果”时直接显示新值：全程不出现旧数字（.odo-old）或滚动态（.is-rolling）。
import { createRequire } from "node:module";
import assert from "node:assert/strict";
import AxeBuilder from "@axe-core/playwright";
import { fixture } from "./fixture.mjs";
import { seed, current } from "../src/store.js";
const { chromium } = createRequire(import.meta.url)(
  process.env.PLAYWRIGHT_MODULE ||
    "/Users/nat/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright",
);
const app = await fixture();
const initial = await app.repository.write(seed(), { initialize: true });
const browser = await chromium.launch();
const errors = [];
const passed = [];
const ok = (s) => {
  passed.push(s);
  console.log("PASS", s);
};
// 两种模式各用一份从未用过的 Prompt，保证起点是 0。
const prompts = initial.assets.filter((a) => a.type === "Prompt");
assert.ok(prompts.length >= 2, "演示资产至少需要 2 份 Prompt");

async function open(reducedMotion) {
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
    reducedMotion,
    permissions: ["clipboard-read", "clipboard-write"],
  });
  const page = await context.newPage();
  page.setDefaultTimeout(10000);
  page.on("pageerror", (e) => errors.push(`${reducedMotion} ${e.message}`));
  await page.goto(app.url + "/#assets");
  await page.locator(".asset-card").first().waitFor();
  return { context, page };
}
const button = (page, name) => page.getByRole("button", { name, exact: true });
const card = (page, a) =>
  page.locator(".asset-card", { has: button(page, `查看 ${current(a).title}`) });
const coverUses = async (page, a) =>
  (await card(page, a).locator(".cover-uses").innerText()).replace(/\s/g, "");
const detailCount = (page) => page.getByTestId("usage-count").innerText();

// 从复制前开始记录：封面数字与详情次数是否进入过滚动态，页面上是否出现过旧数字。
async function watchRolling(page, a) {
  await card(page, a).locator(".cover-uses").evaluate((cover) => {
    const seen = (window.__seen = { cover: false, detail: false, old: false, rolling: false });
    const scan = () => {
      if (cover.querySelector(".is-rolling")) seen.cover = true;
      if (document.querySelector('[data-testid="usage-count"] .is-rolling')) seen.detail = true;
      if (document.querySelector(".odo-old")) seen.old = true;
      if (document.querySelector(".is-rolling")) seen.rolling = true;
    };
    new MutationObserver(scan).observe(document.body, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: ["class"],
    });
  });
}
async function copyOnce(page) {
  await button(page, "复制全文").click();
  await page.getByText("使用记录已保存", { exact: true }).waitFor();
  await page.waitForFunction(() => !document.querySelector(".asset-usage button:disabled"));
  // 滚动约 0.45 秒；等到它结束后再读终值。
  await page.waitForTimeout(700);
  return page.evaluate(() => window.__seen);
}
async function axe(page, label) {
  const result = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
    .analyze();
  assert.deepEqual(
    result.violations.map((v) => `${label}: ${v.id} ${v.nodes.map((n) => n.target).join(" ")}`),
    [],
  );
}

try {
  // 正常动效：第一次使用（0→1，详情从“从未使用”换成计数）与第二次使用（1→2）都要滚动。
  {
    const a = prompts[0];
    const { context, page } = await open("no-preference");
    assert.equal(await coverUses(page, a), "0");
    await button(page, `查看 ${current(a).title}`).click();
    assert.equal(await detailCount(page), "从未使用");
    for (const n of [1, 2]) {
      await watchRolling(page, a);
      const seen = await copyOnce(page);
      assert.equal(await coverUses(page, a), String(n), `第 ${n} 次：封面数字`);
      assert.match(await detailCount(page), new RegExp(`^已使用 ${n} 次 · 最近 `), `第 ${n} 次：详情次数`);
      assert.ok(seen.cover, `第 ${n} 次：封面数字没有滚动（未出现 .is-rolling）`);
      assert.ok(seen.detail, `第 ${n} 次：详情次数没有滚动（未出现 .is-rolling）`);
      // 滚完后只剩当前值。
      assert.equal(await page.locator(".cover-uses .odo-old, [data-testid='usage-count'] .odo-old").count(), 0);
      // 等传送演出复原再复制下一次。
      await page.locator(".transfer-lcd").waitFor({ state: "detached", timeout: 4000 });
    }
    await axe(page, "正常动效·详情");
    await button(page, "关闭").click();
    await page.getByRole("dialog", { name: "资产详情" }).waitFor({ state: "hidden" });
    assert.equal(await coverUses(page, a), "2");
    assert.equal(await card(page, a).getByText("使用 2 次", { exact: true }).count(), 1);
    await axe(page, "正常动效·资产库");
    ok("正常动效：复制后封面与详情数字滚到新值（0→1、1→2），出现 .is-rolling，axe 无违规");
    await context.close();
  }

  // 减少动态效果：直接显示新值，全程不出现旧数字或滚动态。
  {
    const a = prompts[1];
    const { context, page } = await open("reduce");
    assert.equal(await coverUses(page, a), "0");
    await button(page, `查看 ${current(a).title}`).click();
    for (const n of [1, 2]) {
      await watchRolling(page, a);
      const seen = await copyOnce(page);
      assert.equal(await coverUses(page, a), String(n), `减动画第 ${n} 次：封面数字`);
      assert.match(await detailCount(page), new RegExp(`^已使用 ${n} 次 · 最近 `), `减动画第 ${n} 次：详情次数`);
      assert.equal(seen.old, false, `减动画第 ${n} 次：出现了旧数字 .odo-old`);
      assert.equal(seen.rolling, false, `减动画第 ${n} 次：出现了滚动态 .is-rolling`);
      await page.locator(".transfer-lcd").waitFor({ state: "detached", timeout: 4000 });
    }
    // 静止时封面与详情各只渲染一份当前值。
    assert.equal(await card(page, a).locator(".cover-uses .odo-digit").count(), 1);
    assert.equal(await page.locator("[data-testid='usage-count'] .odo-digit").count(), 1);
    await axe(page, "减动画·详情");
    ok("减少动态效果：封面与详情直接显示新值，全程无 .odo-old / .is-rolling，axe 无违规");
    await context.close();
  }

  assert.deepEqual(errors, []);
  console.log(`usage-odometer-browser: ${passed.length} passed`);
} finally {
  await browser.close();
  await app.close();
}
