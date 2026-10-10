// W6/N3: all paths, clocks, projects and executor responses are synthetic.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, realpath } from "node:fs/promises";
import { join } from "node:path";
import { addSlot, nightV2Of } from "../src/night-v2-model.js";
import { nightV2Fixture } from "./night-v2-fixture.mjs";

export const N3_NIGHT_DATE = "2026-10-06";

const defaultDrafts = [
  { chipId: "learn", goal: "比较 Agent loop 停止条件", topic: "Agent loop 停止条件", acceptance: ["交叉核对两份合成来源"] },
  { chipId: "push", projectId: "demo-project", goal: "完成合成首页状态卡", acceptance: ["合成构建与测试通过"] },
  { chipId: "test", projectId: "demo-project", goal: "检查合成日历拖动", acceptance: ["列出合成测试结果"] },
];

const sourceOne = { id: "s-1", title: "合成 Agent loop 设计笔记", url: "https://example.com/synthetic-agent-loop" };
const sourceTwo = { id: "s-2", title: "合成停止条件说明", url: "https://example.com/synthetic-stop-rules" };

export const validMorningOutputs = {
  learn: {
    kind: "learning-report", summary: "交叉核对停止条件，整理了可验证建议。",
    content: {
      topic: "Agent loop 停止条件", whyLearn: "为夜巡小步执行确定何时停下。",
      steps: [
        { tag: "起点", sourceIds: ["s-1"], learned: "先界定轮次与验收反馈。", correction: "待与第二来源交叉核对。" },
        { tag: "修正", sourceIds: ["s-1", "s-2"], learned: "轮次上限只是兜底。", correction: "将验收回执纳入停止条件。" },
        { tag: "印证", sourceIds: ["s-2"], learned: "失败与无变化均需刹车。", correction: "保留首败证据。" },
        { tag: "新增", sourceIds: ["s-1", "s-2"], learned: "区分任务完成与预算耗尽。", correction: "补足状态来源。" },
        { tag: "结论", sourceIds: ["s-1", "s-2"], learned: "验收证据比轮次数更关键。", correction: "写入可验证建议。" },
      ],
      insights: [{ text: "以验收证据作为完成信号。", sourceIds: ["s-1", "s-2"], verification: "crosschecked" }],
      suggestions: { learning: ["继续比较失败恢复案例。"], project: ["按验收条目显示夜巡结果。"], cognition: ["把做了多久与做成什么分开。"] },
      sources: [sourceOne, sourceTwo],
    },
  },
  push: ({ worktree }) => ({
    kind: "branch-delivery", summary: "首页状态卡有合成分支交付。",
    content: {
      branch: worktree.branch,
      changedFiles: [
        { path: "src/Home.jsx", added: 24, deleted: 4 },
        { path: "src/home.css", added: 18, deleted: 2 },
        { path: "tests/home.spec.mjs", added: 12, deleted: 0 },
      ],
      rounds: [{ round: 1, executor: "codex", reviewer: "claude", result: "accepted", evidence: "合成构建与测试均通过" }],
      mainConflict: { status: "clean", evidence: "合成 main 对比无冲突" },
    },
  }),
  test: {
    kind: "test-report", summary: "日历拖动发现两项跨日期缺陷。",
    content: {
      cases: [
        { id: "T-1", name: "同日拖动", status: "passed", expected: "保留同日", actual: "保留同日", evidence: "合成用例 T-1" },
        { id: "T-2", name: "跨午夜拖动", status: "failed", expected: "落到次日", actual: "仍在前一日", evidence: "合成用例 T-2" },
        { id: "T-3", name: "撤销提醒", status: "failed", expected: "移除旧提醒", actual: "旧提醒仍在", evidence: "合成用例 T-3" },
      ],
      defects: [
        { id: "D-1", reproduction: "拖动跨过午夜", expected: "结束时间落次日", actual: "日期未进位", evidence: "合成用例 T-2", possibleCause: "日期边界处理待查" },
        { id: "D-2", reproduction: "改期后撤销提醒", expected: "旧提醒移除", actual: "仍有旧提醒", evidence: "合成用例 T-3", possibleCause: "旧提醒清理待查" },
      ],
      newTests: [
        { path: "tests/calendar-drag.spec.mjs", result: "passed", evidence: "合成回归 T-1" },
        { path: "tests/calendar-boundary.spec.mjs", result: "failed", evidence: "合成复现 T-2" },
      ],
    },
  },
};

export function morningPlan(initial, drafts = defaultDrafts) {
  return drafts.reduce((state, draft, index) =>
    addSlot(state, draft, { id: `n3-slot-${index + 1}` }), initial);
}

export async function morningFixture({ drafts = defaultDrafts, outputs = {}, roundResult, adapters = {} } = {}) {
  const controls = {
    now: Date.parse("2026-10-06T23:00:00+08:00"),
    directory: null,
    artifacts: new Map(),
    calls: { preflight: [], identity: [], prepare: [], checkpoint: [], rounds: [], readArtifact: [] },
    setNow(value) { this.now = Date.parse(value); assert.ok(Number.isFinite(this.now)); },
  };
  const sha = "a".repeat(40);
  const nightV2 = {
    executionMode: "synthetic",
    clock: () => controls.now,
    preflight: async ({ id, scope, slot }) => {
      controls.calls.preflight.push({ id, scope, slotId: slot?.id || null });
      return { status: "passed", ...(id === "executor" ? { identity: "n3-synthetic-executor" } : {}) };
    },
    quota: async () => ({ estimatePercent: 6, rateLimitUntil: null }),
    worktrees: {
      identity: async ({ slot }) => {
        assert.ok(controls.directory, "N3 identity stays inside the isolated fixture");
        controls.calls.identity.push(slot.id);
        const path = join(controls.directory, "n3-main", slot.id);
        await mkdir(path, { recursive: true });
        return { projectId: slot.projectId || null, realpath: await realpath(path), mainSha: sha, appOwned: !slot.projectId };
      },
      prepare: async ({ slot, branch }) => {
        assert.ok(controls.directory, "N3 worktree stays inside the isolated fixture");
        controls.calls.prepare.push({ slotId: slot.id, branch });
        const path = join(controls.directory, "n3-worktrees", slot.id);
        await mkdir(path, { recursive: true });
        return { path: await realpath(path), branch, appOwned: !slot.projectId };
      },
      checkpoint: async ({ kind, slot, round }) => {
        controls.calls.checkpoint.push({ kind, slotId: slot.id, round });
        return { sha };
      },
      restore: async () => ({ restored: true }),
    },
    executeRound: async (input) => {
      controls.calls.rounds.push({ slotId: input.slot.id, round: input.round });
      const base = {
        status: "verified", diffSha256: "a".repeat(64), testSha256: "b".repeat(64),
        acceptanceMet: true, minutes: 1,
      };
      const result = roundResult ? { ...base, ...(await roundResult(input)) } : base;
      const source = outputs[input.slot.id] ?? outputs[input.slot.chipId];
      const declared = typeof source === "function" ? await source(input, controls) : source;
      if (declared !== undefined) {
        const artifactRef = `night-v2-artifact:${input.slot.id}-${input.runId.slice(0, 8)}`;
        const envelope = {
          schema: "night-v2-output", version: 1,
          kind: declared.kind, runId: input.runId, slotId: input.slot.id,
          summary: declared.summary ?? `${input.slot.chipId} 合成产物`,
          acceptance: declared.acceptance ?? input.slot.acceptance.map(criterion => ({
            criterion, status: "met", evidence: `合成回执：${criterion}`,
          })),
          content: declared.content,
        };
        const bytes = Buffer.from(JSON.stringify(envelope));
        controls.artifacts.set(artifactRef, bytes);
        result.outputReceipt = {
          artifactRef, sha256: createHash("sha256").update(bytes).digest("hex"),
        };
      }
      return result;
    },
    readArtifact: async ({ artifactRef, runId, slotId }) => {
      controls.calls.readArtifact.push({ artifactRef, runId, slotId });
      const bytes = controls.artifacts.get(artifactRef);
      assert.ok(bytes, `synthetic artifact exists: ${artifactRef}`);
      return bytes;
    },
    ...adapters,
  };
  const app = await nightV2Fixture({
    prepareState: initial => morningPlan(initial, drafts),
    nightV2,
  });
  controls.directory = app.directory;
  return {
    ...app,
    controls,
    async approveAndComplete() {
      const plan = nightV2Of(await app.repository.read());
      assert.equal(plan.approval, null, "legacy approval never authorizes N3");
      const preview = await app.nightV2Harness.preview({ expectedPlanRevision: plan.revision });
      await app.nightV2Harness.confirm({ token: preview.token, confirmed: true });
      await app.nightV2Harness.checkStart({ nightDate: N3_NIGHT_DATE });
      for (let attempt = 0; attempt <= drafts.length; attempt++) {
        const status = await app.nightV2Harness.tick();
        if (status.status === "completed") break;
      }
      const status = await app.nightV2Harness.status();
      assert.equal(status.status, "completed", "synthetic overnight rounds finish before morning projection");
      assert.equal(controls.calls.rounds.length, drafts.length);
      return status;
    },
  };
}
