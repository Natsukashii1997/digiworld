// W6/N2: synthetic running and blocked browser paths. No real CLI, host data,
// production scheduler, external network, or live 5178 service is used.
import assert from "node:assert/strict";
import { mkdir, realpath } from "node:fs/promises";
import { join } from "node:path";
import { chromium } from "playwright";
import AxeBuilder from "@axe-core/playwright";
import { nightV2Fixture } from "./night-v2-fixture.mjs";
import { batch3Routes } from "./ui-v14-batch3-fixture.mjs";
import { addSlot, nightV2Of } from "../src/night-v2-model.js";

const output = process.env.GUIJI_TEST_RESULTS || "test-results/night-v2-harness-browser";
await mkdir(output, { recursive: true });
const browser = await chromium.launch();
const pageErrors = [];
const forbiddenRequests = [];
const screenshots = [];
const NIGHT_DATE = "2026-10-06";

function withThreeSlots(initial) {
  let state = initial;
  const drafts = [
    { chipId: "learn", goal: "比较 Agent loop 停止条件", topic: "Agent loop 停止条件", acceptance: ["交叉核对两份合成来源"] },
    { chipId: "push", projectId: "demo-project", goal: "完成合成首页状态卡", acceptance: ["合成构建与测试通过"] },
    { chipId: "test", projectId: "demo-project", goal: "检查合成日历拖动", acceptance: ["列出合成测试结果"] },
  ];
  for (const [index, draft] of drafts.entries())
    state = addSlot(state, draft, { id: `synthetic-slot-${index + 1}` });
  return state;
}

function syntheticAdapters({ at, failedPower = false, quotaPercent = 6, pauseOnFirstRound = false } = {}) {
  const controls = {
    now: Date.parse(at || "2026-10-06T23:00:00+08:00"),
    powerPassed: !failedPower,
    directory: null,
    calls: { preflight: [], identity: [], prepare: [], checkpoint: [], restore: [], rounds: [] },
  };
  const sha = "a".repeat(40);
  return {
    controls,
    nightV2: {
      executionMode: "synthetic",
      clock: () => controls.now,
      preflight: async ({ id, scope, slot, nightDate }) => {
        controls.calls.preflight.push({ id, scope, slotId: slot?.id || null, nightDate });
        if (id === "power" && !controls.powerPassed)
          return { status: "failed", reason: "电源未接通（电池 38%）" };
        return { status: "passed", ...(id === "executor" ? { identity: "synthetic-executor" } : {}) };
      },
      quota: async () => ({ estimatePercent: quotaPercent, rateLimitUntil: null }),
      worktrees: {
        identity: async ({ slot }) => {
          controls.calls.identity.push(slot.id);
          assert.ok(controls.directory, "synthetic paths are scoped to the isolated fixture");
          const path = join(controls.directory, "synthetic-main", slot.id);
          await mkdir(path, { recursive: true });
          return { projectId: slot.projectId || null, realpath: await realpath(path), mainSha: sha, appOwned: !slot.projectId };
        },
        prepare: async ({ runId, nightDate, slot, branch }) => {
          controls.calls.prepare.push({ runId, nightDate, slotId: slot.id, branch });
          assert.ok(controls.directory, "synthetic paths are scoped to the isolated fixture");
          const path = join(controls.directory, "synthetic-worktrees", slot.id);
          await mkdir(path, { recursive: true });
          return { path: await realpath(path), branch, appOwned: !slot.projectId };
        },
        checkpoint: async ({ kind, runId, slot, round }) => {
          controls.calls.checkpoint.push({ kind, runId, slotId: slot.id, round });
          return { sha };
        },
        restore: async ({ runId, slot, sha: restoreSha }) => {
          controls.calls.restore.push({ runId, slotId: slot.id, sha: restoreSha });
          return { restored: true };
        },
      },
      executeRound: async ({ runId, slot, round }) => {
        controls.calls.rounds.push({ runId, slotId: slot.id, round });
        if (pauseOnFirstRound && controls.calls.rounds.length === 1)
          return { status: "rate_limited", rateLimitUntil: "2026-10-06T23:20:00+08:00", reason: "合成限流", minutes: 1 };
        return {
          status: "verified", diffSha256: String(round).padStart(64, "a"),
          testSha256: String(round).padStart(64, "b"),
          acceptanceMet: slot.chipId === "learn", minutes: 1,
        };
      },
    },
  };
}

async function prepareApprovedRun(app) {
  assert.ok(app.nightV2Harness, "the isolated server exposes the injected N2 harness");
  const plan = nightV2Of(await app.repository.read());
  assert.equal(plan.approval, null, "workspace data cannot carry N2 execution approval");
  const initialStatus = await app.nightV2Harness.status();
  assert.equal(initialStatus.status, "planning", "v1 approval does not activate an N2 run");
  assert.equal(initialStatus.runId, null);
  const preview = await app.nightV2Harness.preview({ expectedPlanRevision: plan.revision });
  assert.ok(preview.token, "preview returned a one-time synthetic approval token");
  await app.nightV2Harness.confirm({ token: preview.token, confirmed: true });
  assert.equal(nightV2Of(await app.repository.read()).approval, null,
    "N2 approval remains in its independent server ledger");
}

async function openNight(app, width, kind) {
  const heights = kind === "blocked"
    ? { 1440: 1274, 390: 1939 }
    : { 1440: 1189, 390: 1763 };
  const context = await browser.newContext({
    viewport: { width, height: heights[width] },
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
  await page.route("**/api/capabilities/night/**", async route => {
    const pathname = new URL(route.request().url()).pathname;
    if (pathname.endsWith("/morning-reports")) return route.fulfill({ json: { items: [] } });
    if (pathname.endsWith("/status")) return route.fulfill({ json: {
      enabled: false, generation: "synthetic", running: [],
      draft: { time: "23:00", end: "07:00", tasks: [] }, approvedDraftSha256: "a".repeat(64),
    } });
    forbiddenRequests.push(pathname);
    return route.fulfill({ status: 403, json: { error: "N2 fixture denied v1 night action" } });
  });
  await page.goto(app.url + "/#night");
  await page.locator('[data-testid="night-v2"]').waitFor();
  await page.locator('[data-testid="night-loading"]').waitFor({ state: "hidden" });
  return page;
}

async function screenshot(page, name) {
  const path = join(output, `${name}.png`);
  await page.locator(".toast").waitFor({ state: "hidden" });
  const drawerBody = page.locator('[data-testid="night-edit-drawer"] .nv-dw-body');
  if (await drawerBody.count()) {
    await drawerBody.evaluate(element => { element.scrollTop = 0; });
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => resolve())));
  }
  await page.evaluate(() => {
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
    window.scrollTo(0, 0);
  });
  await page.screenshot({ path, fullPage: false });
  screenshots.push(path);
}

async function checkLayoutAndAccess(page, label) {
  const geometry = await page.evaluate(() => {
    const root = document.querySelector('[data-testid="night-v2"]');
    const errors = [];
    if (document.documentElement.scrollWidth > innerWidth + 1)
      errors.push(`page width ${document.documentElement.scrollWidth} > ${innerWidth}`);
    if (!root) return ["missing night-v2"];
    for (const element of root.querySelectorAll("button,a,input,select,textarea,[tabindex]")) {
      if (!element.checkVisibility({ checkOpacity: true })) continue;
      const rect = (["checkbox", "radio"].includes(element.type)
        ? element.closest("label") || element : element).getBoundingClientRect();
      if (rect.width < 44 || rect.height < 44)
        errors.push(`${element.getAttribute("aria-label") || element.textContent?.trim().slice(0, 25)} ${Math.round(rect.width)}x${Math.round(rect.height)}`);
    }
    return errors;
  });
  assert.deepEqual(geometry, [], `${label}: no overflow or sub-44px controls`);
  const a11y = (await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
    .analyze()).violations.map(item => `${item.id}: ${item.nodes.map(node => node.target.join(" ")).join(" | ")}`);
  assert.deepEqual(a11y, [], `${label}: axe`);
  if (await page.getByTestId("night-v2").getAttribute("data-run-status") === "running")
    assert.equal(await page.getByTestId("night-plan-notice").count(), 0, "running does not show the planning warning");
  const runningAnimations = await page.evaluate(() => document.getAnimations()
    .filter(animation => animation.playState === "running"
      && animation.effect?.target?.closest?.('[data-testid="night-v2"]'))
    .map(animation => animation.effect.target.className));
  assert.deepEqual(runningAnimations, [], `${label}: reduced motion`);
}

try {
  for (const width of [1440, 390]) {
    const runningAdapters = syntheticAdapters({ at: "2026-10-06T23:00:00+08:00" });
    const running = await nightV2Fixture({ prepareState: withThreeSlots, nightV2: runningAdapters.nightV2 });
    runningAdapters.controls.directory = running.directory;
    try {
      await prepareApprovedRun(running);
      await running.nightV2Harness.checkStart({ nightDate: NIGHT_DATE });
      await running.nightV2Harness.tick();
      await running.nightV2Harness.tick();
      runningAdapters.controls.now = Date.parse("2026-10-07T01:02:00+08:00");
      const before = await running.nightV2Harness.status();
      assert.equal(before.status, "running", JSON.stringify({ before, calls: runningAdapters.controls.calls }));
      assert.equal(before.currentSlotId, "synthetic-slot-2");
      assert.equal(before.checks.passed, 6);
      assert.equal(before.checks.total, 6);
      assert.equal(before.slots.length, 3);
      const page = await openNight(running, width, "running");
      await page.locator('[data-testid="night-v2"][data-run-status="running"]').waitFor();
      await page.getByTestId("night-running").waitFor();
      assert.match(await page.getByTestId("night-running").innerText(), /停止今晚|正在巡逻/);
      assert.match(await page.getByTestId("night-slots").innerText(), /开工检查 6\/6/);
      const library = page.getByTestId("night-library");
      assert.equal(await library.getAttribute("data-locked"), "true");
      const planRevision = nightV2Of(await running.repository.read()).revision;
      await library.locator('[data-chip-id="learn"]').click();
      const readonlyDrawer = page.getByTestId("night-readonly-drawer");
      await readonlyDrawer.waitFor();
      assert.equal(await page.getByTestId("night-edit-drawer").count(), 0,
        "running chips open read-only details");
      assert.equal(nightV2Of(await running.repository.read()).revision, planRevision,
        "viewing a running chip does not edit the plan");
      await readonlyDrawer.getByRole("button", { name: "关闭", exact: true }).click();
      await checkLayoutAndAccess(page, `running ${width}`);
      await screenshot(page, `night-running-${width}`);
      await page.getByTestId("night-stop").click();
      await page.waitForFunction(() => document.querySelector('[data-testid="night-v2"]')?.getAttribute('data-run-status') !== 'running');
      const stopped = await running.nightV2Harness.status();
      assert.ok(stopped.stopRequestedAt, "stop request is persisted");
      assert.equal(stopped.status, "stopped", "idle synthetic runner confirms its stop result");
      const callsAtStop = runningAdapters.controls.calls.rounds.length;
      await page.reload();
      await page.locator('[data-testid="night-v2"][data-run-status="stopped"]').waitFor();
      assert.equal((await running.nightV2Harness.status()).stopRequestedAt, stopped.stopRequestedAt,
        "stop state survives a fresh UI read");
      assert.equal(runningAdapters.controls.calls.rounds.length, callsAtStop,
        "stop does not replay executor rounds");
      await page.context().close();
    } finally {
      assert.deepEqual(running.forbidden, [], "v1 and host adapters were not called");
      await running.close();
    }

    const blockedAdapters = syntheticAdapters({
      at: "2026-10-06T22:55:00+08:00", failedPower: true, quotaPercent: 9,
    });
    const blocked = await nightV2Fixture({ prepareState: withThreeSlots, nightV2: blockedAdapters.nightV2 });
    blockedAdapters.controls.directory = blocked.directory;
    try {
      await prepareApprovedRun(blocked);
      await blocked.nightV2Harness.checkStart({ nightDate: NIGHT_DATE });
      const before = await blocked.nightV2Harness.status();
      assert.equal(before.status, "blocked");
      assert.equal(before.checks.passed, 5);
      assert.equal(before.checks.total, 6);
      assert.equal(before.checks.items.find(item => item.id === "power")?.status, "failed");
      assert.equal(blockedAdapters.controls.calls.prepare.length, 0,
        "failed global preflight prevents worktree creation");
      assert.equal(blockedAdapters.controls.calls.rounds.length, 0,
        "failed global preflight prevents execution");
      const page = await openNight(blocked, width, "blocked");
      await page.locator('[data-testid="night-v2"][data-run-status="blocked"]').waitFor();
      const banner = page.getByTestId("night-blocked");
      await banner.waitFor();
      assert.match(await banner.innerText(), /电源未接通/);
      assert.match(await banner.innerText(), /5\/6/);
      const checkList = page.getByTestId("night-check-list");
      await checkList.waitFor();
      await checkList.locator("summary").click();
      assert.equal(await checkList.locator("li").count(), 12,
        "six aggregated preflights preserve all per-slot detail probes");
      await checkList.locator("summary").click();
      assert.equal(await page.getByTestId("night-recheck").isEnabled(), true);
      await checkLayoutAndAccess(page, `blocked ${width}`);
      await screenshot(page, `night-blocked-${width}`);
      blockedAdapters.controls.powerPassed = true;
      blockedAdapters.controls.now = Date.parse("2026-10-06T23:20:00+08:00");
      await page.getByTestId("night-recheck").click();
      await page.waitForFunction(() => document.querySelector('[data-testid="night-v2"]')?.getAttribute('data-run-status') !== 'blocked');
      const checked = await blocked.nightV2Harness.status();
      assert.equal(checked.checks.passed, 6);
      assert.equal(checked.status, "ready", "recheck passes but does not launch a round");
      await page.reload();
      await page.locator('[data-testid="night-v2"][data-run-status="ready"]').waitFor();
      assert.equal((await blocked.nightV2Harness.status()).checks.passed, 6,
        "successful recheck survives a fresh UI read");
      await page.context().close();
    } finally {
      assert.deepEqual(blocked.forbidden, [], "v1 and host adapters were not called");
      await blocked.close();
    }

    const pausedAdapters = syntheticAdapters({
      at: "2026-10-06T23:00:00+08:00", pauseOnFirstRound: true,
    });
    const paused = await nightV2Fixture({ prepareState: withThreeSlots, nightV2: pausedAdapters.nightV2 });
    pausedAdapters.controls.directory = paused.directory;
    try {
      await prepareApprovedRun(paused);
      await paused.nightV2Harness.checkStart({ nightDate: NIGHT_DATE });
      await paused.nightV2Harness.tick();
      const before = await paused.nightV2Harness.status();
      assert.equal(before.status, "paused", "a synthetic rate limit pauses the run");
      assert.equal(before.currentSlotId, "synthetic-slot-1");
      assert.equal(pausedAdapters.controls.calls.rounds.length, 1);
      const page = await openNight(paused, width, "paused");
      await page.locator('[data-testid="night-v2"][data-run-status="paused"]').waitFor();
      assert.equal(await page.getByTestId("night-library").getAttribute("data-locked"), "true");
      const stopButton = page.getByTestId("night-stop");
      await stopButton.waitFor();
      assert.equal(await stopButton.isEnabled(), true, "pause does not disable the stop action");
      await checkLayoutAndAccess(page, `paused ${width}`);
      await screenshot(page, `night-paused-${width}`);
      await stopButton.click();
      await page.locator('[data-testid="night-v2"][data-run-status="stopped"]').waitFor();
      const stopped = await paused.nightV2Harness.status();
      assert.equal(stopped.status, "stopped");
      assert.ok(stopped.stopRequestedAt, "paused stop is persisted");
      await page.reload();
      await page.locator('[data-testid="night-v2"][data-run-status="stopped"]').waitFor();
      assert.equal((await paused.nightV2Harness.status()).stopRequestedAt, stopped.stopRequestedAt,
        "paused stop survives a fresh UI read");
      assert.equal(pausedAdapters.controls.calls.rounds.length, 1,
        "stop while rate limited does not resume the executor");
      await page.context().close();
    } finally {
      assert.deepEqual(paused.forbidden, [], "v1 and host adapters were not called");
      await paused.close();
    }
  }
  assert.deepEqual(pageErrors, [], "no browser exceptions");
  assert.deepEqual(forbiddenRequests, [], "no external or v1 mutation requests");
  assert.equal(screenshots.length, 6);
  console.log(`PASS W6/N2 synthetic night harness browser: ${screenshots.length} screenshots`);
} finally {
  await browser.close();
}
