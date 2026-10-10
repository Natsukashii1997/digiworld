// W6/N4: isolated morning decisions. Every branch, artifact and downstream
// receipt belongs to the disposable N3 fixture; no host Git or Vault adapter.
import assert from "node:assert/strict";
import { mkdir, realpath, rm } from "node:fs/promises";
import { join } from "node:path";
import { morningFixture, validMorningOutputs } from "./night-v2-morning-fixture.mjs";

export const N4_PUSH_SLOT = "n3-slot-1";
export const N4_LEARN_SLOT = "n3-slot-2";
export const N4_DRAFTS = [
  { chipId: "push", projectId: "demo-project", goal: "完成合成首页状态卡",
    acceptance: ["合成构建与测试通过"] },
  { chipId: "learn", goal: "比较 Agent loop 停止条件", topic: "Agent loop 停止条件",
    acceptance: ["交叉核对两份合成来源"] },
];

export async function actionsFixture({ drafts = N4_DRAFTS, outputs = validMorningOutputs,
  branchMode = "clean", queryMode = "recorded", mergeMode = "normal",
  discardMode = "normal", injectWriters = false } = {}) {
  const controls = {
    directory: null,
    branchMode, queryMode, mergeMode, discardMode,
    mainSha: "a".repeat(40), branchSha: "a".repeat(40), mergeSha: "c".repeat(40),
    calls: { inspect: [], merge: [], removeWorktree: [], branchQuery: [],
      continuation: [], suggestion: [], identity: [], prepare: [], checkpoint: [] },
    branchReceipts: new Map(), continuationReceipts: new Map(), suggestionReceipts: new Map(),
    worktrees: new Map(),
    setBranchMode(mode) { this.branchMode = mode; },
    setQueryMode(mode) { this.queryMode = mode; },
    setMergeMode(mode) { this.mergeMode = mode; },
    setDiscardMode(mode) { this.discardMode = mode; },
  };
  const branchAdapter = {
    inspect: async ({ runId, slotId, projectId, branch, lastGreenSha }) => {
      controls.calls.inspect.push({ runId, slotId, projectId, branch, lastGreenSha });
      assert.ok(controls.directory && projectId === "demo-project" && branch.startsWith("night/"));
      assert.equal(lastGreenSha, controls.mainSha, "synthetic branch contains the locked last green commit");
      const path = controls.worktrees.get(`${runId}:${slotId}`)?.path;
      assert.ok(path, "branch inspection uses an actual prepared synthetic worktree");
      const mainPath = join(controls.directory, "n3-main", slotId);
      await mkdir(mainPath, { recursive: true });
      return { mainSha: controls.mainSha, branchSha: controls.branchSha,
        containsGreen: true,
        changedFiles: [
          { path: "src/Home.jsx", status: "modified", added: 24, deleted: 4 },
          { path: "src/home.css", status: "modified", added: 18, deleted: 2 },
          { path: "tests/home.spec.mjs", status: "added", added: 12, deleted: 0 },
        ],
        conflict: controls.branchMode,
        mainPath: await realpath(mainPath), worktreePath: await realpath(path), projectId, branch };
    },
    merge: async ({ operationId, branch, expectedMainSha, expectedBranchSha }) => {
      controls.calls.merge.push({ operationId, branch, expectedMainSha, expectedBranchSha });
      assert.equal(expectedMainSha, controls.mainSha);
      assert.equal(expectedBranchSha, controls.branchSha);
      controls.branchReceipts.set(operationId, {
        status: "merged", mergeSha: controls.mergeSha, branchExists: true, worktreeExists: true,
      });
      if (controls.mergeMode === "throw-after-apply") throw new Error("synthetic merge response lost");
      return { mergeSha: controls.mergeSha };
    },
    removeWorktree: async ({ operationId, branch, path }) => {
      controls.calls.removeWorktree.push({ operationId, branch, path });
      assert.ok(path.startsWith(controls.directory + "/"), "only isolated worktree may be removed");
      await rm(path, { recursive: true, force: true });
      controls.branchReceipts.set(operationId, {
        status: "discarded", worktreeExists: false, branchExists: true,
      });
      if (controls.discardMode === "throw-after-apply") throw new Error("synthetic discard response lost");
      return { removed: true };
    },
    query: async ({ operationId, action, branch }) => {
      controls.calls.branchQuery.push({ operationId, action, branch });
      if (controls.queryMode === "unknown") return { status: "unknown" };
      return controls.branchReceipts.get(operationId) || { status: "not_started",
        worktreeExists: true, branchExists: true };
    },
  };
  const writeContinuation = async ({ phase, operationId, source }) => {
    controls.calls.continuation.push({ phase, operationId, source });
    if (phase === "apply") controls.continuationReceipts.set(operationId,
      { status: "queued", targetId: `n4-continue-${operationId}` });
    return controls.continuationReceipts.get(operationId) || { status: "not_started" };
  };
  const writeSuggestion = async ({ phase, operationId, source, target }) => {
    controls.calls.suggestion.push({ phase, operationId, source, target });
    if (phase === "apply") controls.suggestionReceipts.set(operationId,
      { status: "saved", targetId: `n4-suggestion-${operationId}` });
    return controls.suggestionReceipts.get(operationId) || { status: "not_started" };
  };
  const worktrees = {
    identity: async ({ slot }) => {
      assert.ok(controls.directory);
      controls.calls.identity.push({ slotId: slot.id, projectId: slot.projectId || null });
      const path = join(controls.directory, "n3-main", slot.id);
      await mkdir(path, { recursive: true });
      return { projectId: slot.projectId || null, realpath: await realpath(path),
        mainSha: controls.mainSha, appOwned: !slot.projectId };
    },
    prepare: async ({ runId, slot, branch }) => {
      assert.ok(controls.directory);
      controls.calls.prepare.push({ runId, slotId: slot.id, branch,
        continueFrom: slot.continueFrom || null });
      const path = join(controls.directory, "n4-worktrees", runId, slot.id);
      await mkdir(path, { recursive: true });
      const actual = await realpath(path);
      controls.worktrees.set(`${runId}:${slot.id}`, { path: actual, branch });
      return { path: actual, branch, appOwned: !slot.projectId,
        ...(slot.continueFrom ? { baseSha: slot.continueFrom.lastGreenSha } : {}) };
    },
    checkpoint: async ({ kind, slot, round }) => {
      controls.calls.checkpoint.push({ kind, slotId: slot.id, round });
      return { sha: controls.mainSha };
    },
    restore: async () => ({ restored: true }),
  };
  const app = await morningFixture({ drafts, outputs,
    adapters: { worktrees, branchAdapter,
      ...(injectWriters ? { writeContinuation, writeSuggestion } : {}) } });
  controls.directory = app.directory;
  return {
    ...app, actionControls: controls,
    async finishMorning() {
      const run = await app.approveAndComplete();
      app.controls.setNow("2026-10-07T07:05:00+08:00");
      const result = await app.nightV2Morning.reconcile({ runId: run.runId });
      assert.equal(result.status, "ready");
      const report = await app.nightV2Morning.read({ runId: run.runId });
      return { runId: run.runId, report, result };
    },
    async finishNextMorning(nightDate) {
      assert.match(nightDate, /^\d{4}-\d{2}-\d{2}$/);
      app.controls.setNow(`${nightDate}T23:00:00+08:00`);
      await app.nightV2Harness.checkStart({ nightDate });
      for (let attempt = 0; attempt <= drafts.length; attempt++) {
        const status = await app.nightV2Harness.tick();
        if (status.status === "completed") break;
      }
      const run = await app.nightV2Harness.status();
      assert.equal(run.status, "completed");
      const morningDate = new Date(`${nightDate}T00:00:00Z`);
      morningDate.setUTCDate(morningDate.getUTCDate() + 1);
      app.controls.setNow(`${morningDate.toISOString().slice(0, 10)}T07:05:00+08:00`);
      const result = await app.nightV2Morning.reconcile({ runId: run.runId });
      assert.equal(result.status, "ready");
      const report = await app.nightV2Morning.read({ runId: run.runId });
      return { runId: run.runId, report, result };
    },
  };
}
