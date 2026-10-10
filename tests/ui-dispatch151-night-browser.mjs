// 旧入口回归：合成旧草稿仍在隔离状态里，页面只显示夜巡 v2。
import assert from "node:assert/strict";
import { chromium } from "playwright";
import AxeBuilder from "@axe-core/playwright";
import { nightV2Fixture } from "./night-v2-fixture.mjs";
import { nightV2Of } from "../src/night-v2-model.js";

const legacyTask = "合成旧版夜巡草稿不应出现在页面";
const browser = await chromium.launch();
const errors = [];
const oldApiRequests = [];
const externalRequests = [];

try {
  for (const width of [320, 390]) {
    const app = await nightV2Fixture({
      prepareState(state) {
        state.night = {
          enabled: false,
          time: "23:00",
          end: "07:00",
          budget: "20",
          task: legacyTask,
        };
        return state;
      },
    });
    try {
      const context = await browser.newContext({
        viewport: { width, height: 1000 },
        timezoneId: "Asia/Shanghai",
        reducedMotion: "reduce",
      });
      const page = await context.newPage();
      page.setDefaultTimeout(12000);
      page.on("pageerror", error => errors.push(error.message));
      page.on("request", request => {
        const url = new URL(request.url());
        if (url.pathname.startsWith("/api/capabilities/night/"))
          oldApiRequests.push(`${request.method()} ${url.pathname}`);
        if (!["127.0.0.1", "localhost"].includes(url.hostname) && url.protocol !== "data:")
          externalRequests.push(url.href);
      });
      await page.route("**/*", route => {
        const url = new URL(route.request().url());
        if (["127.0.0.1", "localhost"].includes(url.hostname) || url.protocol === "data:")
          return route.continue();
        return route.abort("blockedbyclient");
      });
      await page.goto(`${app.url}/#night`);
      await page.locator('[data-testid="night-v2"]').waitFor();
      await page.locator('[data-testid="night-loading"]').waitFor({ state: "hidden" });
      assert.equal(await page.locator('[data-testid="night-library"] [data-chip-id]').count(), 7);
      assert.equal(await page.locator('[data-testid^="night-slot-"]').count(), 4);
      assert.equal(await page.locator(".night-v1-legacy, .night-v14, .nv-legacy, .night-dial").count(), 0);
      assert.equal(await page.getByRole("button", { name: "编辑夜巡草稿", exact: true }).count(), 0);
      assert.equal(await page.getByRole("button", { name: "配置夜巡执行与成本用量", exact: true }).count(), 0);
      assert.doesNotMatch(await page.locator("main").innerText(), new RegExp(legacyTask));
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
      assert.equal((await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
        .analyze()).violations.length, 0);
      const after = await app.repository.read();
      assert.equal(after.night.task, legacyTask, "旧草稿未被自动迁移或改写");
      assert.equal(nightV2Of(after).slots.length, 0, "无旧草稿自动生成的 v2 槽位");
      await context.close();
    } finally {
      await app.close();
    }
  }
  assert.deepEqual(errors, []);
  assert.deepEqual(oldApiRequests, [], "新版页面不再请求旧夜巡 API");
  assert.deepEqual(externalRequests, []);
  console.log("PASS 夜巡旧入口清理：320/390 新版七徽章与四槽、旧版不可见且无旧 API、旧草稿不自动迁移、无横溢与 axe 问题");
} finally {
  await browser.close();
}
