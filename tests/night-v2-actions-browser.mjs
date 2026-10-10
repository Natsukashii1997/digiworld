// W6/N4 isolated browser and HTTP acceptance: every overnight result, branch,
// workspace write and clock comes from disposable synthetic fixtures.
import assert from "node:assert/strict";
import { mkdir, stat } from "node:fs/promises";
import { join } from "node:path";
import { chromium } from "playwright";
import AxeBuilder from "@axe-core/playwright";
import { nightV2Of, removeSlot } from "../src/night-v2-model.js";
import { actionsFixture, N4_PUSH_SLOT, N4_LEARN_SLOT, N4_DRAFTS } from "./night-v2-actions-fixture.mjs";
import { validMorningOutputs } from "./night-v2-morning-fixture.mjs";
import { batch3Routes } from "./ui-v14-batch3-fixture.mjs";

const output = process.env.GUIJI_TEST_RESULTS || "test-results/night-v2-actions-browser";
await mkdir(output, { recursive: true });
const tokens = new WeakMap();
const pageErrors = [];
const forbiddenRequests = [];
const shots = [];
const actionStatus = { merge: "merged", day: "dispatched", continue: "queued", discard: "discarded" };

async function tokenFor(app) {
  if (!tokens.has(app)) tokens.set(app, fetch(app.url + "/api/session", {
    headers: { "x-workbench-client": "1" },
  }).then(async response => {
    assert.equal(response.status, 200, "isolated N4 session");
    return (await response.json()).token;
  }));
  return tokens.get(app);
}

async function api(app, method, path, body) {
  const response = await fetch(app.url + path, {
    method, headers: { "x-workbench-token": await tokenFor(app),
      ...(method === "POST" ? { "content-type": "application/json" } : {}) },
    ...(method === "POST" ? { body: JSON.stringify(body) } : {}),
  });
  return { status: response.status, body: await response.json() };
}

async function get(app, path) {
  const response = await api(app, "GET", path);
  assert.equal(response.status, 200, path);
  return response.body;
}

async function post(app, path, body) {
  const response = await api(app, "POST", path, body);
  assert.equal(response.status, 200, `${path}: ${response.body.error || ""}`);
  return response.body;
}

const decisionPath = runId => `/api/night-v2/actions/decisions?runId=${encodeURIComponent(runId)}`;
const queryPath = operationId => `/api/night-v2/actions/query?operationId=${encodeURIComponent(operationId)}`;
const suggestionQueryPath = operationId => `/api/night-v2/actions/suggestion-query?operationId=${encodeURIComponent(operationId)}`;

async function preview(app, run, action, slotId = N4_PUSH_SLOT) {
  return post(app, "/api/night-v2/actions/preview", { runId: run.runId, slotId,
    action, expectedReportRevision: run.report.revision });
}

async function confirm(app, item) {
  return post(app, "/api/night-v2/actions/confirm", { operationId: item.operationId,
    token: item.token, confirmed: true });
}

async function directFourActions() {
  for (const action of ["merge", "day", "continue", "discard"]) {
    const app = await actionsFixture();
    try {
      const run = await app.finishMorning();
      const before = await app.repository.read();
      const item = await preview(app, run, action);
      assert.equal(item.schema, "night-v2-action-preview");
      assert.equal(item.action, action);
      assert.equal(item.runId, run.runId);
      assert.equal(item.slotId, N4_PUSH_SLOT);
      assert.equal(item.canConfirm, true, `clean ${action} preview is confirmable`);
      assert.equal(item.files.length, 3, "branch preview lists exact files");
      assert.equal(app.actionControls.calls.merge.length, 0, "preview never merges");
      assert.equal(app.actionControls.calls.removeWorktree.length, 0, "preview never removes worktree");
      assert.deepEqual(await app.repository.read(), before, "preview never changes workspace");
      const denied = await api(app, "POST", "/api/night-v2/actions/confirm", {
        operationId: item.operationId, token: item.token, confirmed: false,
      });
      assert.equal(denied.status, 409, "confirmation requires an explicit true");
      const first = await confirm(app, item);
      assert.equal(first.status, actionStatus[action]);
      const queried = await get(app, queryPath(item.operationId));
      assert.deepEqual(queried, first, "query returns the same authoritative operation receipt");
      const duplicate = await confirm(app, item);
      assert.deepEqual(duplicate, first, "repeat confirmation does not replay an action");
      const decisions = await get(app, decisionPath(run.runId));
      assert.equal(decisions.schema, "night-v2-decisions");
      assert.equal(decisions.items.filter(row => row.operationId === item.operationId).length, 1);
      assert.equal(decisions.items.find(row => row.operationId === item.operationId).status,
        actionStatus[action]);
      const list = await get(app, "/api/night-v2/morning-reports");
      assert.equal(list.items.find(row => row.runId === run.runId).decisionPending, true,
        "the learning worktree is a separate branch still awaiting a human decision");
      const learning = await preview(app, run, "day", N4_LEARN_SLOT);
      assert.equal(learning.canConfirm, true);
      assert.equal((await confirm(app, learning)).status, "dispatched");
      const settled = await get(app, "/api/night-v2/morning-reports");
      assert.equal(settled.items.find(row => row.runId === run.runId).decisionPending, false,
        "morning pending closes only after every branch receives a decision");
      if (action === "merge") {
        assert.equal(app.actionControls.calls.merge.length, 1);
        assert.equal(first.mergeSha, app.actionControls.mergeSha);
      }
      if (action === "day") {
        assert.equal(decisions.backlog.find(row => row.projectId === "demo-project").count, 1,
          "day handoff still counts as an unresolved branch");
      }
      if (action === "continue") {
        const resume = nightV2Of(await app.repository.read()).slots.find(slot =>
          slot.continueFrom?.operationId === item.operationId);
        assert.ok(resume, "continuation is actually written into the isolated workspace");
        assert.equal(resume.continueFrom.branch, item.branch);
        assert.equal(resume.continueFrom.lastGreenSha, item.lastGreenSha);
        assert.equal(resume.continueFrom.runId, run.runId);
        assert.equal(resume.id, first.targetId);
        const latest = await app.repository.read();
        await app.repository.write(removeSlot(latest, resume.id,
          { expectedRevision: nightV2Of(latest).revision }));
        const reopened = await get(app, "/api/night-v2/morning-reports");
        assert.equal(reopened.items.find(row => row.runId === run.runId).decisionPending, true,
          "deleting the continuation reopens the unresolved morning branch decision");
        assert.equal((await get(app, queryPath(item.operationId))).status, "queued",
          "removing the plan card does not falsify the original action receipt");
      }
      if (action === "discard") {
        assert.equal(app.actionControls.calls.removeWorktree.length, 1);
        assert.equal(Date.parse(first.retainUntil) - Date.parse(first.at), 7 * 86400_000,
          "branch retention is exactly seven days after confirmed discard");
        await assert.rejects(stat(app.actionControls.calls.removeWorktree[0].path), { code: "ENOENT" });
        assert.equal(app.actionControls.branchReceipts.get(item.operationId).branchExists, true,
          "discard removes only synthetic worktree; branch stays for retention");
      }
    } finally {
      assert.deepEqual(app.forbidden, [], `no host adapter for ${action}`);
      await app.close();
    }
  }
}

async function directConflictAndUnknown() {
  const conflict = await actionsFixture({ branchMode: "conflict" });
  try {
    const run = await conflict.finishMorning();
    const item = await preview(conflict, run, "merge");
    assert.equal(item.conflict, "conflict");
    assert.equal(item.canConfirm, false);
    assert.match(item.reason, /冲突/);
    const denied = await api(conflict, "POST", "/api/night-v2/actions/confirm", {
      operationId: item.operationId, token: item.token, confirmed: true,
    });
    assert.equal(denied.status, 409);
    assert.equal(conflict.actionControls.calls.merge.length, 0, "conflict creates no half merge");
    const day = await preview(conflict, run, "day");
    assert.equal(day.canConfirm, true, "conflict can be handed to daytime Codex work");
  } finally { assert.deepEqual(conflict.forbidden, []); await conflict.close(); }

  const unknown = await actionsFixture({ mergeMode: "throw-after-apply", queryMode: "unknown" });
  try {
    const run = await unknown.finishMorning();
    const item = await preview(unknown, run, "merge");
    const result = await confirm(unknown, item);
    assert.equal(result.status, "unknown", "lost response never appears as success");
    assert.equal(unknown.actionControls.calls.merge.length, 1);
    const duplicate = await confirm(unknown, item);
    assert.equal(duplicate.status, "unknown");
    assert.equal(unknown.actionControls.calls.merge.length, 1, "unknown result is never replayed");
    unknown.actionControls.setQueryMode("recorded");
    const recovered = await get(unknown, queryPath(item.operationId));
    assert.equal(recovered.status, "merged", "authoritative query recovers actual local merge");
    assert.equal(unknown.actionControls.calls.merge.length, 1);
  } finally { assert.deepEqual(unknown.forbidden, []); await unknown.close(); }
}

async function directBacklog() {
  const app = await actionsFixture({ drafts: [N4_DRAFTS[0]],
    outputs: { push: validMorningOutputs.push } });
  try {
    const first = await app.finishMorning();
    const second = await app.finishNextMorning("2026-10-07");
    const third = await app.finishNextMorning("2026-10-08");
    assert.equal(new Set([first.runId, second.runId, third.runId]).size, 3);
    const decisions = await get(app, decisionPath(third.runId));
    assert.deepEqual(decisions.backlog.find(row => row.projectId === "demo-project"),
      { projectId: "demo-project", count: 3, blocked: true });
    const held = await preview(app, third, "continue");
    assert.equal(held.canConfirm, false);
    assert.match(held.reason, /未决分支达到 3 个/);
    const handoff = await preview(app, first, "day");
    await confirm(app, handoff);
    assert.equal((await get(app, decisionPath(third.runId))).backlog[0].count, 3,
      "day handoff does not pretend its branch is resolved");
    const merged = await preview(app, first, "merge");
    await confirm(app, merged);
    assert.equal((await get(app, decisionPath(third.runId))).backlog[0].count, 2);
    assert.equal((await preview(app, third, "continue")).canConfirm, true,
      "project can continue after one branch is resolved");
  } finally { assert.deepEqual(app.forbidden, []); await app.close(); }
}

async function directSuggestions() {
  const app = await actionsFixture();
  try {
    const run = await app.finishMorning();
    for (const target of ["note", "pending", "knowledge"]) {
      const before = await app.repository.read();
      const item = await post(app, "/api/night-v2/actions/suggestion-preview", {
        runId: run.runId, slotId: N4_LEARN_SLOT, target, section: "project", index: 0,
      });
      assert.equal(item.schema, "night-v2-suggestion-preview");
      assert.equal(item.canConfirm, true);
      assert.equal(item.previewOnly, target === "knowledge");
      assert.deepEqual(await app.repository.read(), before, "suggestion preview never writes");
      const result = await post(app, "/api/night-v2/actions/suggestion-confirm", {
        operationId: item.operationId, token: item.token, confirmed: true,
      });
      assert.equal(result.status, target === "knowledge" ? "preview_acknowledged" : "saved");
      assert.deepEqual(await get(app, suggestionQueryPath(item.operationId)), result);
      const after = await app.repository.read();
      if (target === "knowledge") {
        assert.deepEqual(after, before, "Vault preview acknowledgement never writes workspace or Vault");
      } else {
        const note = after.notes.find(row => row.id === result.targetId);
        assert.ok(note, `${target} suggestion is written to isolated workspace`);
        assert.match(note.text, new RegExp(run.runId));
        assert.match(note.text, /n3-slot-2/);
        assert.equal(note.format === "md1", target === "pending");
      }
    }
  } finally { assert.deepEqual(app.forbidden, []); await app.close(); }
}

async function browserPage(browser, app, width) {
  const context = await browser.newContext({
    viewport: { width, height: width === 390 ? 920 : 950 },
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
    if (pathname.endsWith("/morning-reports")) return route.fulfill({ json: { items: [] } });
    if (pathname.endsWith("/status")) return route.fulfill({ json: {
      enabled: false, generation: "synthetic", running: [],
      draft: { time: "23:00", end: "07:00", tasks: [] }, approvedDraftSha256: "a".repeat(64),
    } });
    forbiddenRequests.push(pathname);
    return route.fulfill({ status: 403, json: { error: "N4 denied v1 action" } });
  });
  await page.route("**/api/knowledge/zones/summary", route =>
    route.fulfill({ json: { zones: [], warnings: [], at: "2026-10-07T00:00:00.000Z" } }));
  return page;
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
  const violations = (await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
    .analyze()).violations.map(item => `${item.id}: ${item.nodes.map(node => node.target.join(" ")).join(" | ")}`);
  assert.deepEqual(violations, [], `${label}: axe`);
  const animations = await page.evaluate(id => document.getAnimations()
    .filter(animation => animation.playState === "running"
      && animation.effect?.target?.closest?.(`[data-testid="${id}"]`))
    .map(animation => animation.effect.target.className), rootId);
  assert.deepEqual(animations, [], `${label}: reduced motion`);
}

async function screenshot(page, name, width) {
  const path = join(output, `night-action-${name}-${width}.png`);
  await page.locator(".toast").waitFor({ state: "hidden" });
  await page.evaluate(() => {
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
  });
  await page.screenshot({ path, fullPage: false });
  shots.push(path);
}

async function assertStatusInFirstScreen(page, dialogId, statusId, label) {
  const position = await page.evaluate(({ dialogId, statusId }) => {
    const dialog = document.querySelector(`[data-testid="${dialogId}"]`);
    const body = dialog?.querySelector(".nv-action-body");
    const status = dialog?.querySelector(`[data-testid="${statusId}"]`);
    if (!body || !status) return { missing: `${dialogId}/${statusId}` };
    const box = status.getBoundingClientRect();
    const bodyBox = body.getBoundingClientRect();
    const hit = document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2);
    return { visible: status.checkVisibility({ checkOpacity: true }),
      top: box.top, bottom: box.bottom, bodyTop: bodyBox.top, bodyBottom: bodyBox.bottom,
      scrollTop: body.scrollTop, unobscured: hit === status || status.contains(hit) };
  }, { dialogId, statusId });
  assert.ok(!position.missing && position.visible && position.top >= position.bodyTop - 1 &&
    position.bottom <= position.bodyBottom + 1 && position.scrollTop <= 1 && position.unobscured,
  `${label}: authoritative status is fully visible at the top of its scroll region: ${JSON.stringify(position)}`);
}

async function openDetail(page, app, runId, slotId, type) {
  await page.goto(`${app.url}/#night`);
  await page.getByTestId("night-v2").waitFor();
  assert.equal(await page.locator(".night-v1-legacy, .night-v14, .nv-legacy").count(), 0,
    "the v2 page contains no old night panels");
  await page.goto(`${app.url}/#night/report/${encodeURIComponent(runId)}/${encodeURIComponent(slotId)}`);
  await page.getByTestId(type).waitFor();
  await actionButton(page, slotId, "merge").waitFor();
}

function actionButton(page, slotId, action) {
  return page.locator(".nv-report-footer").getByTestId(`night-action-open-${slotId}-${action}`);
}

async function uiAction(browser, action, width) {
  const fourOldSlots = [N4_DRAFTS[0], N4_DRAFTS[1],
    { ...N4_DRAFTS[1], goal: "合成恢复边界 A" },
    { ...N4_DRAFTS[1], goal: "合成恢复边界 B" }];
  const app = await actionsFixture(action === "continue" ? { drafts: fourOldSlots } : {});
  let page;
  try {
    const run = await app.finishMorning();
    page = await browserPage(browser, app, width);
    await openDetail(page, app, run.runId, N4_PUSH_SLOT, "night-delivery");
    const button = actionButton(page, N4_PUSH_SLOT, action);
    await button.waitFor();
    await page.waitForFunction(id => !document.querySelector(`[data-testid="${id}"]`)?.disabled,
      `night-action-open-${N4_PUSH_SLOT}-${action}`);
    await button.click();
    await page.getByTestId("night-action-preview").waitFor();
    const previewText = await page.getByTestId("night-action-preview").innerText();
    assert.ok(previewText.includes(run.report.slots[0].branch), "preview names the locked branch");
    assert.ok(previewText.includes(run.report.slots[0].lastGreenSha), "preview names the last green SHA");
    if (action === "merge") assert.match(previewText, /src\/Home\.jsx/,
      "merge preview lists the files proposed for main");
    await checkPage(page, "night-action-dialog", `${action} preview ${width}`);
    await screenshot(page, `${action}-preview`, width);
    await page.getByTestId("night-action-confirm").click();
    await page.getByTestId("night-action-result").waitFor();
    assert.match(await page.getByTestId("night-action-result").innerText(),
      action === "merge" ? /已本地合并/ : action === "day" ? /已生成白天派单/ :
        action === "continue" ? /已排入今晚候选/ : /worktree 已丢弃/);
    if (action === "discard") {
      const receipt = page.getByTestId("night-action-result").getByTestId("night-branch-retention");
      await receipt.waitFor();
      assert.match(await receipt.innerText(), /分支保留至 2026-/);
    }
    await checkPage(page, "night-action-dialog", `${action} result ${width}`);
    await screenshot(page, `${action}-result`, width);
    if (width === 390) await assertStatusInFirstScreen(page, "night-action-dialog",
      "night-action-result", `${action} result 390`);
    await page.getByRole("button", { name: "关闭预览" }).click();
    await page.reload();
    await page.getByTestId("night-delivery").waitFor();
    await page.getByTestId(`night-decision-${N4_PUSH_SLOT}`).waitFor();
    const decisions = await get(app, decisionPath(run.runId));
    assert.equal(decisions.items.find(row => row.slotId === N4_PUSH_SLOT).status,
      actionStatus[action]);
    if (action === "continue") {
      const workspace = await get(app, "/api/workspace");
      const plan = nightV2Of(workspace);
      assert.equal(plan.slots.length, 1, "four untouched old slots are archived before a continuation is added");
      const resume = plan.slots.find(slot =>
        slot.continueFrom?.runId === run.runId);
      assert.equal(resume?.continueFrom.branch, run.report.slots[0].branch);
      assert.equal(resume?.continueFrom.lastGreenSha, run.report.slots[0].lastGreenSha);
      await page.goto(`${app.url}/#night`);
      await page.getByTestId("night-morning").waitFor();
      const library = page.getByTestId("night-library");
      assert.equal(await library.getAttribute("data-locked"), "true",
        "the chip library stays read-only while the previous night's report is open");
      const planning = page.getByRole("button", { name: "规划今晚" });
      await planning.waitFor();
      await planning.click();
      await page.waitForFunction(() => document.querySelector('[data-testid="night-library"]')
        ?.getAttribute("data-locked") === "false");
      assert.equal(await library.getAttribute("data-locked"), "false",
        "the chip library unlocks only after switching to tonight's plan");
      await page.getByTestId("night-slot-1").waitFor();
      assert.ok((await page.getByTestId("night-slot-1").innerText()).includes(resume.goal),
        "continued task is visible in tonight's plan after refresh and view switch");
      assert.equal(await page.locator("[data-testid^='night-slot-'].nt-slot:not(.vacant)").count(), 1,
        "old four-slot plan is not silently restored in the UI");
    }
  } finally {
    if (page) await page.context().close();
    assert.deepEqual(app.forbidden, [], `UI ${action} has no host adapter`);
    await app.close();
  }
}

async function uiConflictAndUnknown(browser, width) {
  for (const mode of ["conflict", "unknown"]) {
    const app = mode === "conflict" ? await actionsFixture({ branchMode: "conflict" }) :
      await actionsFixture({ mergeMode: "throw-after-apply", queryMode: "unknown" });
    let page;
    try {
      const run = await app.finishMorning();
      page = await browserPage(browser, app, width);
      await openDetail(page, app, run.runId, N4_PUSH_SLOT, "night-delivery");
      await actionButton(page, N4_PUSH_SLOT, "merge").click();
      await page.getByTestId("night-action-preview").waitFor();
      if (mode === "conflict") {
        await page.getByTestId("night-action-conflict").waitFor();
        assert.equal(await page.getByTestId("night-action-confirm").count(), 0);
        assert.equal(app.actionControls.calls.merge.length, 0);
        await checkPage(page, "night-action-dialog", `conflict ${width}`);
        await screenshot(page, "conflict", width);
      } else {
        await page.getByTestId("night-action-confirm").click();
        await page.getByTestId("night-action-unknown").waitFor();
        assert.equal(app.actionControls.calls.merge.length, 1);
        await checkPage(page, "night-action-dialog", `unknown ${width}`);
        await screenshot(page, "unknown", width);
        if (width === 390) await assertStatusInFirstScreen(page, "night-action-dialog",
          "night-action-unknown", "unknown 390");
        app.actionControls.setQueryMode("recorded");
        await page.getByTestId("night-action-query").click();
        await page.getByTestId("night-action-result").waitFor();
        assert.equal(app.actionControls.calls.merge.length, 1, "query does not replay merge");
        await screenshot(page, "unknown-recovered", width);
        await checkPage(page, "night-action-dialog", `unknown recovered ${width}`);
        if (width === 390) await assertStatusInFirstScreen(page, "night-action-dialog",
          "night-action-result", "unknown recovered 390");
      }
    } finally {
      if (page) await page.context().close();
      assert.deepEqual(app.forbidden, []);
      await app.close();
    }
  }
}

async function uiSuggestions(browser, width) {
  const app = await actionsFixture();
  let page;
  try {
    const run = await app.finishMorning();
    page = await browserPage(browser, app, width);
    await page.goto(`${app.url}/#night/report/${encodeURIComponent(run.runId)}/${N4_LEARN_SLOT}`);
    await page.getByTestId("night-report").waitFor();
    for (const target of ["note", "pending", "knowledge"]) {
      await page.getByTestId(`night-suggestion-open-project-0-${target}`).click();
      await page.getByTestId("night-suggestion-preview").waitFor();
      assert.match(await page.getByTestId("night-suggestion-preview").innerText(), /夜巡|按验收条目/);
      await checkPage(page, "night-suggestion-dialog", `${target} suggestion preview ${width}`);
      await screenshot(page, `suggestion-${target}-preview`, width);
      const before = await app.repository.read();
      await page.getByTestId("night-suggestion-confirm").click();
      await page.getByTestId("night-suggestion-result").waitFor();
      const result = await page.getByTestId("night-suggestion-result").innerText();
      assert.match(result, target === "knowledge" ? /尚未写入知识仓库/ : /已保存并回读/);
      if (target === "knowledge") assert.deepEqual(await app.repository.read(), before,
        "knowledge UI acknowledgement writes neither workspace nor Vault");
      await screenshot(page, `suggestion-${target}-result`, width);
      await checkPage(page, "night-suggestion-dialog", `${target} suggestion result ${width}`);
      if (width === 390 && target === "knowledge") await assertStatusInFirstScreen(page,
        "night-suggestion-dialog", "night-suggestion-result", "knowledge result 390");
      await page.getByRole("button", { name: "关闭预览" }).click();
    }
    await page.reload();
    await page.getByTestId("night-report").waitFor();
    const notes = (await app.repository.read()).notes;
    assert.ok(notes.some(item => item.text.includes(`夜巡 ${run.runId}`) && !item.format));
    assert.ok(notes.some(item => item.text.includes(`夜巡 ${run.runId}`) && item.format === "md1"));
  } finally {
    if (page) await page.context().close();
    assert.deepEqual(app.forbidden, []);
    await app.close();
  }
}

async function uiBacklog(browser, width) {
  const app = await actionsFixture({ drafts: [N4_DRAFTS[0]],
    outputs: { push: validMorningOutputs.push } });
  let page;
  try {
    await app.finishMorning();
    await app.finishNextMorning("2026-10-07");
    const third = await app.finishNextMorning("2026-10-08");
    page = await browserPage(browser, app, width);
    await page.goto(`${app.url}/#night/morning/${encodeURIComponent(third.runId)}`);
    await page.getByTestId("night-morning").waitFor();
    await page.getByTestId("night-project-backlog").waitFor();
    assert.match(await page.getByTestId("night-project-backlog").innerText(), /3 个未决分支/);
    await checkPage(page, "night-morning", `backlog ${width}`);
    await screenshot(page, "backlog", width);
    await page.goto(`${app.url}/#night/report/${encodeURIComponent(third.runId)}/${N4_PUSH_SLOT}`);
    await page.getByTestId("night-delivery").waitFor();
    await actionButton(page, N4_PUSH_SLOT, "continue").click();
    await page.getByTestId("night-project-backlog").waitFor();
    assert.equal(await page.getByTestId("night-action-confirm").count(), 0);
    await screenshot(page, "backlog-continue-blocked", width);
    await checkPage(page, "night-action-dialog", `backlog blocked ${width}`);
  } finally {
    if (page) await page.context().close();
    assert.deepEqual(app.forbidden, []);
    await app.close();
  }
}

await directFourActions();
await directConflictAndUnknown();
await directBacklog();
await directSuggestions();
const browser = await chromium.launch();
try {
  for (const width of [1440, 390]) {
    for (const action of ["merge", "day", "continue", "discard"])
      await uiAction(browser, action, width);
    await uiConflictAndUnknown(browser, width);
    await uiSuggestions(browser, width);
    await uiBacklog(browser, width);
  }
} finally { await browser.close(); }
assert.deepEqual(pageErrors, []);
assert.deepEqual(forbiddenRequests, []);
console.log(`PASS W6/N4 synthetic actions browser: ${shots.length} screenshots`);
