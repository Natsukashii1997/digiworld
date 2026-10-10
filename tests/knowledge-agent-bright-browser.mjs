// Synthetic browser regression for KnowledgeV16 MCP client readiness.
import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { chromium } from "playwright";
import { knowledge193Fixture } from "./knowledge-v16-fixture.mjs";

const output = process.env.GUIJI_TEST_RESULTS || "test-results/knowledge-agent-bright";
const staticRoot = process.env.GUIJI_STATIC_ROOT;
const ids = ["claude", "codex", "hermes", "openclaw"];
const checkedAt = new Date().toISOString();
const app = await knowledge193Fixture(staticRoot ? { staticRoot } : {});
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({
  viewport: { width: 1440, height: 1000 },
  reducedMotion: "reduce",
});
page.setDefaultTimeout(6000);
await mkdir(output, { recursive: true });

let unknownId = null;
let recentUse = false;
const errors = [];
const report = { scenarios: [], widths: [], errors };
page.on("pageerror", (error) => errors.push(error.message));
await page.route("**/api/knowledge/mcp-clients", (route) =>
  route.fulfill({
    status: 200,
    json: {
      checkedAt,
      agents: Object.fromEntries(
        ids.map((id) => [id, { state: id === unknownId ? "unknown" : "ready" }]),
      ),
    },
  }),
);
await page.route("**/api/capability-usage", (route) =>
  route.fulfill({
    status: 200,
    json: {
      capabilities: {},
      agents: Object.fromEntries(ids.map((id) => [id, {
        state: recentUse ? "connected" : "unknown",
        at: recentUse ? checkedAt : null,
      }])),
    },
  }),
);

const cards = page.locator(".kh-agents .kh-agent");
const rightLines = page.locator(".kh-hub > .kh-lines").nth(1);

async function waitForState(readyCount, useCount) {
  await page.getByRole("region", { name: "数据中枢" }).waitFor();
  await page.waitForFunction(({ readyCount, useCount }) => {
    const header = document.querySelector(".kh-hub-head .sec-meta")?.textContent || "";
    const lines = document.querySelectorAll(".kh-hub > .kh-lines")[1];
    const cards = [...document.querySelectorAll(".kh-agents .kh-agent")];
    const fullUsage = useCount === 4 ? "调用：近 7 天有调用" : "调用：未见可归属调用";
    const mobileUsage = useCount === 4 ? "近期调用" : "未见记录";
    return cards.length === 4 &&
      document.querySelectorAll(".kh-agents .kh-agent.on").length === readyCount &&
      lines?.querySelectorAll("path.on").length === readyCount &&
      header.includes(`${readyCount}/4 位已核实就绪`) &&
      cards.every((card) => card.querySelector(".kh-agent-st-full .kh-agent-use")?.textContent === fullUsage &&
        card.querySelector(".kh-agent-st-mobile .kh-agent-use")?.textContent === mobileUsage);
  }, { readyCount, useCount });
}

async function checkWidths(scenario) {
  for (const width of [1440, 390, 320]) {
    await page.setViewportSize({ width, height: 1000 });
    const geometry = await page.evaluate(() => ({
      viewport: innerWidth,
      document: document.documentElement.scrollWidth,
      cards: [...document.querySelectorAll(".kh-agents .kh-agent")].map((card) => {
        const rect = card.getBoundingClientRect();
        const name = card.querySelector(".kh-agent-main b")?.getBoundingClientRect();
        const status = [...card.querySelectorAll(".kh-agent-st-full,.kh-agent-st-mobile")]
          .find((node) => getComputedStyle(node).display !== "none")?.getBoundingClientRect();
        return {
          left: rect.left, right: rect.right, width: rect.width, height: rect.height,
          nameRight: name?.right, statusRight: status?.right,
        };
      }),
    }));
    assert.ok(geometry.document <= geometry.viewport, `${scenario} ${width} 页面水平溢出: ${JSON.stringify(geometry)}`);
    assert.equal(geometry.cards.length, 4, `${scenario} ${width} 四位伙伴仍在页面上`);
    for (const card of geometry.cards) {
      assert.ok(card.width >= 44 && card.height >= 44, `${scenario} ${width} 卡片触控尺寸`);
      assert.ok(card.left >= -1 && card.right <= width + 1, `${scenario} ${width} 卡片越过视口`);
      assert.ok(card.nameRight <= card.right + 1 && card.statusRight <= card.right + 1,
        `${scenario} ${width} 名称或状态越过卡片`);
    }
    await page.screenshot({ path: join(output, `${scenario}-${width}.png`), fullPage: true });
    report.widths.push(`${scenario}-${width}`);
  }
}

try {
  await page.goto(`${app.url}/#knowledge`);
  await waitForState(4, 0);
  assert.equal(await cards.count(), 4);
  assert.equal(await page.locator(".kh-agents .kh-agent.on").count(), 4);
  assert.ok((await cards.evaluateAll((elements) => elements.map((element) => element.getAttribute("aria-label"))))
    .every((label) => label?.includes("接入就绪 · 调用：未见可归属调用")));
  assert.equal(await rightLines.locator("path.on").count(), 4);
  assert.equal(await rightLines.locator("path.flow").count(), 4);
  assert.equal(await rightLines.locator("path.broken").count(), 0);
  report.scenarios.push("四端 ready，近 7 天无可归属调用：四卡和右侧四条线仍亮");
  await checkWidths("all-ready-no-use");

  unknownId = "openclaw";
  recentUse = true;
  await page.reload();
  await waitForState(3, 4);
  const unknownCard = cards.nth(ids.indexOf(unknownId));
  assert.equal(await unknownCard.evaluate((element) => element.classList.contains("on")), false);
  assert.match(await unknownCard.getAttribute("aria-label"), /接入待核实 · 调用：近 7 天有调用/);
  assert.equal(await unknownCard.locator(".kh-agent-st-full .kh-agent-ready").textContent(), "接入待核实 · 复制配置");
  assert.equal(await unknownCard.locator(".kh-agent-st-full .kh-agent-use").textContent(), "调用：近 7 天有调用");
  assert.equal(await rightLines.locator("g").nth(ids.indexOf(unknownId)).locator("path.on,path.flow").count(), 0);
  assert.equal(await rightLines.locator("g").nth(ids.indexOf(unknownId)).locator("path.off").count(), 1);
  assert.equal(await rightLines.locator("path.broken").count(), 0);
  report.scenarios.push("OpenClaw unknown，四端近 7 天有调用：未知卡与右线不亮，调用留痕仍展示");
  await checkWidths("one-unknown-used");

  assert.deepEqual(errors, []);
} catch (error) {
  report.failure = error.stack;
  await page.screenshot({ path: join(output, "failure.png"), fullPage: true });
  throw error;
} finally {
  await writeFile(join(output, "report.json"), JSON.stringify(report, null, 2));
  await page.close();
  await browser.close();
  await app.close();
}
console.log("knowledge-agent-bright-browser PASS", report.scenarios.length, report.widths.length);
