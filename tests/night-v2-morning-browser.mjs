// W6/N3: isolated morning projection and four report surfaces. The fixture
// supplies every executor artifact; no host CLI, project, network or Vault data.
import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { chromium } from "playwright";
import AxeBuilder from "@axe-core/playwright";
import { morningFixture, N3_NIGHT_DATE, validMorningOutputs } from "./night-v2-morning-fixture.mjs";
import { batch3Routes } from "./ui-v14-batch3-fixture.mjs";

const output = process.env.GUIJI_TEST_RESULTS || "test-results/night-v2-morning-browser";
await mkdir(output, { recursive: true });
const browser = await chromium.launch();
const pageErrors = [];
const forbiddenRequests = [];
const screenshots = [];
const tokens = new WeakMap();
const sizes = {
  morning: { 1440: 1238, 390: 2035 },
  report: { 1440: 2291, 390: 3216 },
  "test-report": { 1440: 1525, 390: 2125 },
  delivery: { 1440: 1360, 390: 1593 },
  partial: { 1440: 1238, 390: 2035 },
};

async function browserPage(app, width, state) {
  const context = await browser.newContext({
    viewport: { width, height: sizes[state][width] },
    timezoneId: "Asia/Shanghai", reducedMotion: "reduce",
  });
  const page = await context.newPage();
  page.setDefaultTimeout(12000);
  page.on("pageerror", error => pageErrors.push(error.message));
  page.on("request", request => {
    const url = new URL(request.url());
    if (!["127.0.0.1", "localhost"].includes(url.hostname) && url.protocol !== "data:")
      forbiddenRequests.push(url.href);
    if (/\/api\/capabilities\/night\/(run|tick|confirm|register-confirm|save-tasks)/.test(url.pathname))
      forbiddenRequests.push(url.href);
  });
  await page.route("**/*", route => {
    const url = new URL(route.request().url());
    if (["127.0.0.1", "localhost"].includes(url.hostname) || url.protocol === "data:")
      return route.continue();
    forbiddenRequests.push(url.href);
    return route.abort("blockedbyclient");
  });
  await batch3Routes(page);
  await page.route("**/api/capabilities/night/**", route => {
    const pathname = new URL(route.request().url()).pathname;
    if (pathname.endsWith("/morning-reports"))
      return route.fulfill({ json: { items: [] } });
    if (pathname.endsWith("/status"))
      return route.fulfill({ json: { enabled: false, generation: "synthetic", running: [],
        draft: { time: "23:00", end: "07:00", tasks: [] }, approvedDraftSha256: "a".repeat(64) } });
    forbiddenRequests.push(pathname);
    return route.fulfill({ status: 403, json: { error: "N3 fixture denied v1 night action" } });
  });
  await page.route("**/api/knowledge/zones/summary", route =>
    route.fulfill({ json: { zones: [], warnings: [], at: "2026-10-07T00:00:00.000Z" } }));
  return page;
}

async function screenshot(page, state, width) {
  const path = join(output, `night-${state}-${width}.png`);
  await page.locator(".toast").waitFor({ state: "hidden" });
  await page.evaluate(() => {
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
    window.scrollTo(0, 0);
  });
  await page.screenshot({ path, fullPage: false });
  screenshots.push(path);
}

async function inspectMobileLibrary(page) {
  const library = page.getByTestId("night-library");
  assert.equal(await library.getAttribute("data-locked"), "true",
    "morning library remains read only");
  const chips = library.locator(".nt-chip[data-chip-id]");
  assert.deepEqual(await chips.evaluateAll(nodes => nodes.map(node => node.dataset.chipId)),
    ["learn", "push", "test", "review", "deps", "brief", "custom"],
    "all seven approved library entries remain available below the morning report");
  await page.evaluate(() => {
    const library = document.querySelector('[data-testid="night-library"]');
    window.scrollTo({ top: library.getBoundingClientRect().top + window.scrollY - 80,
      behavior: "instant" });
  });
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  const visible = await chips.evaluateAll(nodes => nodes.map(node => {
    const rect = node.getBoundingClientRect();
    return { id: node.dataset.chipId, inViewport: rect.top >= 0 && rect.bottom <= innerHeight,
      withinWidth: rect.left >= 0 && rect.right <= innerWidth + 1,
      enabled: !node.disabled, draggable: node.draggable };
  }));
  assert.ok(visible.every(chip => chip.inViewport && chip.withinWidth),
    `seven library chips fit in the scrolled mobile viewport: ${JSON.stringify(visible)}`);
  assert.ok(visible.slice(0, 6).every(chip => chip.enabled && !chip.draggable),
    "six installed chip templates are operable for read-only viewing and not draggable");
  assert.equal(visible[6].enabled, false, "custom creation stays locked in morning mode");
  assert.ok(await library.isVisible());
  await page.locator(".toast").waitFor({ state: "hidden" });
  const path = join(output, "night-morning-library-390.png");
  await page.screenshot({ path, fullPage: false });
  await library.locator('[data-chip-id="learn"]').click();
  await page.getByTestId("night-readonly-drawer").waitFor();
  assert.match(await page.getByTestId("night-readonly-drawer").innerText(), /Prompt/);
  await page.getByRole("button", { name: "关闭只读芯片" }).click();
  await page.getByTestId("night-readonly-drawer").waitFor({ state: "hidden" });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), true,
    "scrolling to the full library does not overflow at 390px");
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: "instant" }));
  return path;
}

async function checkPage(page, rootId, label) {
  const problems = await page.evaluate(id => {
    const root = document.querySelector(`[data-testid="${id}"]`);
    const issues = [];
    if (!root) return [`missing ${id}`];
    if (document.documentElement.scrollWidth > innerWidth + 1)
      issues.push(`page width ${document.documentElement.scrollWidth} > ${innerWidth}`);
    for (const element of root.querySelectorAll("button,a,input,select,textarea,[tabindex]")) {
      if (!element.checkVisibility({ checkOpacity: true })) continue;
      const rect = (["checkbox", "radio"].includes(element.type)
        ? element.closest("label") || element : element).getBoundingClientRect();
      if (rect.width < 44 || rect.height < 44)
        issues.push(`${element.getAttribute("aria-label") || element.textContent?.trim().slice(0, 25)} ${Math.round(rect.width)}x${Math.round(rect.height)}`);
    }
    return issues;
  }, rootId);
  assert.deepEqual(problems, [], `${label}: no overflow or sub-44px controls`);
  const a11y = (await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
    .analyze()).violations.map(item => `${item.id}: ${item.nodes.map(node => node.target.join(" ")).join(" | ")}`);
  assert.deepEqual(a11y, [], `${label}: axe`);
  const animations = await page.evaluate(id => document.getAnimations()
    .filter(animation => animation.playState === "running"
      && animation.effect?.target?.closest?.(`[data-testid="${id}"]`))
    .map(animation => animation.effect.target.className), rootId);
  assert.deepEqual(animations, [], `${label}: reduced motion`);
}

async function getJson(app, path) {
  const response = await fetch(app.url + path, {
    headers: { "x-workbench-token": await tokenFor(app) },
  });
  assert.equal(response.status, 200, path);
  return response.json();
}

async function tokenFor(app) {
  if (!tokens.has(app)) tokens.set(app, fetch(app.url + "/api/session", {
    headers: { "x-workbench-client": "1" },
  }).then(async response => {
    assert.equal(response.status, 200, "isolated test workspace session");
    return (await response.json()).token;
  }));
  return tokens.get(app);
}

async function reconcile(app, runId) {
  const response = await fetch(app.url + "/api/night-v2/morning/reconcile", {
    method: "POST", headers: {
      "content-type": "application/json", "x-workbench-token": await tokenFor(app),
    },
    body: JSON.stringify({ runId }),
  });
  assert.equal(response.status, 200, "synthetic morning reconcile route");
  return response.json();
}

function outputPath(runId, slotId) {
  return `/api/night-v2/output?runId=${encodeURIComponent(runId)}&slotId=${encodeURIComponent(slotId)}`;
}

async function openMorning(page, app) {
  await page.goto(app.url + "/#night");
  await page.getByTestId("night-morning").waitFor();
  await page.getByTestId("night-loading").waitFor({ state: "hidden" });
}

async function openDetail(page, slotId, state, width, runId, reloadAfterReturn = false) {
  await page.setViewportSize({ width, height: sizes[state][width] });
  await page.getByTestId(`night-open-output-${slotId}`).click();
  await page.getByTestId(`night-${state}`).waitFor();
  assert.match(new URL(page.url()).hash, new RegExp(`/report/[^/]+/${slotId}$`));
  await checkPage(page, `night-${state}`, `${state} ${width}`);
  await screenshot(page, state, width);
  await page.getByTestId("night-back-morning").click();
  try { await page.getByTestId("night-morning").waitFor(); }
  catch (cause) {
    const detail = await page.evaluate(() => ({
      hash: location.hash,
      ids: [...document.querySelectorAll("[data-testid]")].map(node => node.getAttribute("data-testid"))
        .filter(id => id?.startsWith("night-")),
      text: document.querySelector("[data-testid=night-v2]")?.innerText.slice(0, 500),
    }));
    console.error("N3_RETURN_DEBUG", JSON.stringify(detail));
    throw cause;
  }
  await page.setViewportSize({ width, height: sizes.morning[width] });
  const morningHash = `#night/morning/${encodeURIComponent(runId)}`;
  assert.equal(new URL(page.url()).hash, morningHash,
    "report return keeps the run-specific morning address");
  if (reloadAfterReturn) {
    await page.reload();
    await page.getByTestId("night-morning").waitFor();
    await page.getByTestId("night-loading").waitFor({ state: "hidden" });
    assert.equal(new URL(page.url()).hash, morningHash,
      "refresh preserves the run-specific morning address");
    for (let index = 1; index <= 3; index++)
      await page.getByTestId(`night-result-card-n3-slot-${index}`).waitFor();
  }
}

try {
  for (const width of [1440, 390]) {
    const app = await morningFixture({ outputs: validMorningOutputs });
    try {
      const run = await app.approveAndComplete();
      const runId = run.runId;
      assert.ok(runId);
      app.controls.setNow("2026-10-07T07:04:59+08:00");
      const early = await reconcile(app, runId);
      assert.equal(early.status, "not_due", "07:05 boundary does not flip early");
      assert.equal((await getJson(app, "/api/night-v2/morning-reports")).items.length, 0);
      app.controls.setNow("2026-10-07T07:05:00+08:00");
      const first = await reconcile(app, runId);
      assert.equal(first.status, "ready", "07:05 boundary creates the report");
      const again = await reconcile(app, runId);
      assert.equal(again.revision, first.revision, "reconcile is idempotent for the same run");
      const list = await getJson(app, "/api/night-v2/morning-reports");
      assert.equal(list.items.length, 1, "one pending morning item per run");
      assert.equal(list.items[0].reportId, `night-v2-morning-${runId}`);
      assert.equal(list.items[0].decisionPending, true);
      const report = await getJson(app, `/api/night-v2/morning-report?runId=${encodeURIComponent(runId)}`);
      assert.equal(report.schema, "night-v2-morning");
      assert.equal(report.nightDate, N3_NIGHT_DATE);
      assert.equal(report.slots.length, 3);
      assert.deepEqual(report.slots.map(slot => slot.status), ["completed", "completed", "completed"]);
      for (const [index, kind] of ["learning-report", "branch-delivery", "test-report"].entries()) {
        const detail = await getJson(app, outputPath(runId, `n3-slot-${index + 1}`));
        assert.equal(detail.validation.status, "valid", `valid ${kind} stays verified`);
        assert.equal(detail.output.kind, kind);
      }
      const page = await browserPage(app, width, "morning");
      await openMorning(page, app);
      assert.equal(await page.locator(".night-v1-legacy, .night-v14, .nv-legacy").count(), 0,
        "the v2 morning page contains no old night panels");
      for (let index = 1; index <= 3; index++)
        await page.getByTestId(`night-result-card-n3-slot-${index}`).waitFor();
      await checkPage(page, "night-morning", `morning ${width}`);
      await screenshot(page, "morning", width);
      if (width === 390) await inspectMobileLibrary(page);
      await page.locator(".topbar-inbox").click();
      const pending = page.locator(`[data-item-id="night-v2-morning-${runId}"]`);
      await pending.waitFor();
      assert.equal(await pending.count(), 1, "one visible morning decision item");
      assert.match(await pending.innerText(), /晨报待决策/);
      await page.getByRole("button", { name: "关闭待处理" }).click();
      await openDetail(page, "n3-slot-1", "report", width, runId, true);
      await openDetail(page, "n3-slot-3", "test-report", width, runId);
      await openDetail(page, "n3-slot-2", "delivery", width, runId);
      assert.equal((await getJson(app, "/api/night-v2/morning-reports")).items.length, 1,
        "reading every report does not duplicate pending work");
      await page.context().close();
    } finally {
      assert.deepEqual(app.forbidden, [], "N3 does not use v1 or host adapters");
      await app.close();
    }

    const invalid = await morningFixture({
      drafts: [{ chipId: "learn", goal: "核对无效合成产物", topic: "无效产物", acceptance: ["写明来源"] }],
      outputs: { learn: { kind: "learning-report", summary: "缺项的合成学习报告",
        content: { topic: "无效产物", whyLearn: "检验结构失败路径", steps: [], insights: [],
          suggestions: { learning: [], project: [], cognition: [] }, sources: [] } } },
    });
    try {
      const run = await invalid.approveAndComplete();
      invalid.controls.setNow("2026-10-07T07:05:00+08:00");
      await reconcile(invalid, run.runId);
      const report = await getJson(invalid, `/api/night-v2/morning-report?runId=${encodeURIComponent(run.runId)}`);
      assert.equal(report.slots[0].status, "partial", "invalid schema cannot become completed");
      assert.equal(report.slots[0].validation.status, "invalid");
      assert.ok(report.slots[0].validation.issues.length > 0);
      const detail = await getJson(invalid, outputPath(run.runId, "n3-slot-1"));
      assert.equal(detail.output, null, "invalid raw output is not presented as verified");
      const page = await browserPage(invalid, width, "partial");
      await openMorning(page, invalid);
      assert.match(await page.getByTestId("night-result-card-n3-slot-1").innerText(), /部分完成/);
      await checkPage(page, "night-morning", `partial ${width}`);
      await page.getByTestId("night-open-output-n3-slot-1").click();
      await page.getByTestId("night-output-partial").waitFor();
      assert.equal(await page.getByTestId("night-report").count(), 1,
        "invalid learning output opens a report shell without verified body");
      await checkPage(page, "night-report", `partial detail ${width}`);
      await screenshot(page, "partial", width);
      await page.context().close();
    } finally {
      assert.deepEqual(invalid.forbidden, [], "invalid N3 output does not use host adapters");
      await invalid.close();
    }
  }
  assert.deepEqual(pageErrors, [], "no browser exceptions");
  assert.deepEqual(forbiddenRequests, [], "no external or v1 mutation requests");
  assert.equal(screenshots.length, 10);
  console.log(`PASS W6/N3 synthetic morning browser: ${screenshots.length} screenshots`);
} finally {
  await browser.close();
}
