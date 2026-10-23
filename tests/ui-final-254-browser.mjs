// Focused synthetic regression for the final v16 mobile layout pass.
import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { chromium } from "playwright";
import { fixture } from "./fixture.mjs";
import { nightV2Fixture } from "./night-v2-fixture.mjs";
import { addSlot, createCustomChip } from "../src/night-v2-model.js";

const output = process.env.GUIJI_TEST_RESULTS || "test-results/ui-final-254-browser";
await mkdir(output, { recursive: true });
const browser = await chromium.launch();
const errors = [];
const routes = ["home", "inbox", "assets", "agents", "projects", "knowledge", "notes",
  "history", "references", "night", "settings", "health", "collab", "calendar",
  "aihot", "learning"];

function newPage(width) {
  return browser.newPage({ viewport: { width, height: 900 }, reducedMotion: "reduce" });
}

try {
  const app = await fixture();
  try {
    for (const width of [320, 390]) {
      const page = await newPage(width);
      page.on("pageerror", error => errors.push(error.message));
      try {
        for (const route of routes) {
          await page.goto(`${app.url}/#${route}`);
          await page.locator(".topbar .crumbs strong").waitFor();
          const topbar = await page.evaluate(() => {
            const title = document.querySelector(".topbar .crumbs strong");
            const search = document.querySelector(".topbar-search").getBoundingClientRect();
            const range = document.createRange();
            range.selectNodeContents(title);
            const text = range.getBoundingClientRect();
            return {
              gap: search.left - text.right,
              clipped: title.scrollWidth > title.clientWidth + 1,
              overflow: document.documentElement.scrollWidth - innerWidth,
            };
          });
          assert.ok(topbar.gap >= 0 && !topbar.clipped && topbar.overflow <= 0,
            `${width} ${route} topbar ${JSON.stringify(topbar)}`);
        }
        if (width === 320) {
          await page.goto(`${app.url}/#assets`);
          await page.locator(".asset-grid").waitFor();
          assert.equal(await page.getByRole("group", { name: "视图模式" }).count(), 0);
          assert.equal(await page.getByRole("button", { name: /^(网格视图|列表视图)$/ }).count(), 0);
          assert.equal(await page.locator(".asset-grid.list-layout").count(), 0);
          const controls = await page.evaluate(() => {
            const toolbar = document.querySelector(".asset-toolbar > .toolbar-right").getBoundingClientRect();
            const sort = document.querySelector("select[aria-label='排序方式']").getBoundingClientRect();
            return { inside: sort.left >= toolbar.left - 1 && sort.right <= toolbar.right + 1,
              overflow: document.documentElement.scrollWidth > innerWidth };
          });
          assert.deepEqual(controls, { inside: true, overflow: false });
          await page.screenshot({ path: join(output, "assets-controls-320.png") });
        }
        if (width === 390) {
          await page.goto(`${app.url}/#knowledge`);
          await page.locator(".kh-agents .kh-agent").first().waitFor();
          const columns = await page.locator(".kh-agents").evaluate(element =>
            getComputedStyle(element).gridTemplateColumns.split(" ").length);
          assert.equal(columns, 4, "390px knowledge agents retain the approved single row");
          const agents = await page.locator(".kh-agents .kh-agent").evaluateAll(elements =>
            elements.map(element => {
              const card = element.getBoundingClientRect();
              const name = element.querySelector("b")?.getBoundingClientRect();
              const status = element.querySelector(".kh-agent-st-mobile")?.getBoundingClientRect();
              return { top: card.top, right: card.right, bottom: card.bottom,
                nameRight: name?.right, statusRight: status?.right };
            }));
          assert.equal(agents.length, 4);
          assert.ok(agents.every(agent => Math.abs(agent.top - agents[0].top) <= 1));
          assert.ok(agents.every(agent => agent.right <= 390 &&
            agent.nameRight <= agent.right + 1 && agent.statusRight <= agent.right + 1));
          await page.locator(".kh-agents").scrollIntoViewIfNeeded();
          await page.screenshot({ path: join(output, "knowledge-agents-390.png") });
        }
      } finally {
        await page.close();
      }
    }
  } finally {
    await app.close();
  }

  const name = "L".repeat(48);
  const nightApp = await nightV2Fixture({ prepareState: initial => {
    const withChip = createCustomChip(initial, {
      name, templatePrompt: "合成长期模板", acceptance: ["合成验收"],
      color: "violet", icon: "brief", output: "report",
    }, { id: "synthetic-48" });
    return addSlot(withChip, { chipId: "synthetic-48", goal: "合成目标" },
      { id: "synthetic-slot-48" });
  } });
  try {
    for (const width of [320, 390]) {
      const page = await newPage(width);
      page.on("pageerror", error => errors.push(error.message));
      try {
        await page.goto(`${nightApp.url}/#night`);
        const library = page.locator('[data-testid="night-library"] [data-chip-id="synthetic-48"]');
        await library.waitFor();
        await page.locator('.nt-slot [data-chip-id="synthetic-48"] .nv-reverse-name').waitFor();
        assert.ok((await library.getAttribute("aria-label"))?.includes(name),
          `${width} long chip retains its full accessible name`);
        const geometry = await page.evaluate(() => {
          const measure = (selector, nameSelector, subSelector) => {
            const chip = document.querySelector(selector);
            const c = chip.getBoundingClientRect();
            const n = chip.querySelector(nameSelector).getBoundingClientRect();
            const sub = chip.querySelector(subSelector)?.getBoundingClientRect();
            return { nameOutside: n.right > c.right + 1,
              nameBelow: !!sub && n.bottom > sub.top + 1,
              clipped: chip.scrollWidth > chip.clientWidth + 1 };
          };
          return { library: measure('[data-testid="night-library"] [data-chip-id="synthetic-48"]', '.nv-chip-name', '.nv-chip-sub'),
            slot: measure('.nt-slot [data-chip-id="synthetic-48"]', '.nv-reverse-name', '.nv-reverse-purpose'),
            overflow: document.documentElement.scrollWidth - innerWidth };
        });
        assert.ok(geometry.overflow <= 0, `${width} night overflow ${geometry.overflow}`);
        for (const key of ["library", "slot"])
          assert.deepEqual(geometry[key], { nameOutside: false, nameBelow: false, clipped: false },
            `${width} ${key} long chip`);
        await library.scrollIntoViewIfNeeded();
        await page.screenshot({ path: join(output, `night-long-card-${width}.png`) });
        await library.click();
        const drawer = page.locator('[data-testid="night-edit-drawer"]');
        await drawer.waitFor();
        assert.equal(await drawer.locator(".nv-dw-head h2").innerText(), name);
        const heading = await drawer.evaluate(element => {
          const title = element.querySelector(".nv-dw-head h2");
          const close = element.querySelector(".nv-dw-head button").getBoundingClientRect();
          const range = document.createRange();
          range.selectNodeContents(title);
          return { gap: close.left - range.getBoundingClientRect().right,
            overflow: document.documentElement.scrollWidth - innerWidth,
            clipped: title.scrollWidth > title.clientWidth + 1 };
        });
        assert.ok(heading.gap >= 0 && heading.overflow <= 0 && !heading.clipped,
          `${width} drawer long heading ${JSON.stringify(heading)}`);
        await page.screenshot({ path: join(output, `night-long-drawer-${width}.png`) });
      } finally {
        await page.close();
      }
    }
  } finally {
    await nightApp.close();
  }
  assert.deepEqual(errors, []);
  console.log("ui-final-254-browser: 320/390 topbar, assets, knowledge and long night chip PASS");
} finally {
  await browser.close();
}
