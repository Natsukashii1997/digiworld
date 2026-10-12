import test from "node:test";
import assert from "node:assert/strict";
import { seed, current } from "../src/store.js";
import { pendingItems } from "../src/pending.js";

const feedback = (asset, rating, extra = {}) => ({
  schema: 1,
  id: `f-${asset.id}-${rating}`,
  assetId: asset.id,
  versionId: current(asset).id,
  at: "2026-09-29T00:00:00.000Z",
  kind: "feedback",
  rating,
  note: "",
  ...extra,
});

test("示例主库没有任何待处理线索", () => {
  assert.deepEqual(pendingItems(seed()), []);
});

test("项目刷新失败保留前像时，待处理仅列读取失败；恢复后重新列当前项目问题", () => {
  const state = seed();
  const snapshot = [{ projectId: "repair-project", name: "合成项目",
    safety: { issues: [{ text: "合成安全问题" }] },
    activity: { state: "stalled", idleDays: 30 } }];
  const ids = status => pendingItems(state, undefined, status).map(item => item.id).sort();
  const currentIds = ["project-safety-repair-project", "project-stall-repair-project"];
  assert.deepEqual(ids({ loaded: true, error: "", items: snapshot }), currentIds);
  assert.deepEqual(ids({ loaded: true, error: "服务中断", items: snapshot }), ["project-status-error"]);
  assert.deepEqual(ids({ loaded: false, error: "", items: snapshot }), currentIds, "刷新中保持上一次成功的项目问题与计数");
  assert.deepEqual(ids({ loaded: true, error: "", items: snapshot }), currentIds);
  assert.equal(snapshot[0].safety.issues.length, 1, "读取失败不删除供项目页参考的前像");
});

test("只把当前版本最新反馈为需改进的未归档资产列为线索", () => {
  const s = seed();
  const [a, b, c] = s.assets;
  s.assets[2] = { ...c, archived: true };
  s.assetActivity = [
    feedback(a, "improve"),
    feedback(b, "good"),
    feedback(c, "improve"),
  ];
  const items = pendingItems(s);
  assert.deepEqual(
    items.map((i) => i.assetId),
    [a.id],
  );
  assert.match(items[0].title, new RegExp(current(a).title));
  // 之后又给了好评：不再列出。
  s.assetActivity.push(
    feedback(a, "good", { id: "later", at: "2026-09-29T01:00:00.000Z" }),
  );
  assert.equal(pendingItems(s).length, 0);
});

test("批准取消知识任务与随手记来源，仍精确统计未设置目标 Agent", () => {
  const s = seed();
  s.notes = [
    { id: "n1", text: "一", at: "2026-09-29T00:00:00.000Z" },
    { id: "n2", text: "二", at: "2026-09-29T00:00:00.000Z" },
  ];
  s.knowledgeTasks = [{ archived: false }, { archived: true }];
  s.connections = {
    agents: [
      { id: "codex", name: "Codex", status: "detected" },
      { id: "hermes", name: "Hermes", status: "detected" },
      { id: "other", name: "Other", status: "missing" },
    ],
    agentTargets: [{ agentId: "codex" }],
  };
  const byId = Object.fromEntries(pendingItems(s,undefined,undefined,undefined,undefined,{loaded:true,noteIds:[]}).map((i) => [i.id, i]));
  assert.equal(byId["knowledge-tasks"], undefined);
  assert.equal(byId["notes-local"], undefined);
  assert.equal(byId["notes-receipts-unknown"], undefined);
  assert.equal(byId["agents-untargeted"].title, "Hermes 已检测到，尚未设置管理目标");
});

test("v2 晨报待决策按 runId 只列一次，旧 v1 晨报不再进入待处理；读取失败保持未知", () => {
  const state = seed();
  const v1 = { items: [{ operationId: "legacy-1", nightDate: "2026-10-06" }], loaded: true };
  const v2 = { items: [{ runId: "run-1", nightDate: "2026-10-06", readyAt: "2026-10-06T23:05:00.000Z",
    decisionPending: true, counts: { completed: 1, partial: 1, failed: 0, notStarted: 0, unknown: 0 } }], loaded: true };
  const items = pendingItems(state, undefined, undefined, undefined, v1, undefined, { nightV2Reports: v2 });
  assert.deepEqual(items.filter(item => item.kind === "夜巡").map(item => item.id).sort(),
    ["night-v2-morning-run-1"]);
  assert.equal(items.find(item => item.nightRunId === "run-1")?.to, "night");
  assert.equal(items.find(item => item.nightRunId === "run-1")?.triage, "需要决定");
  assert.match(items.find(item => item.nightRunId === "run-1")?.detail || "", /完成1、部分1/);
  const failed = pendingItems(state, undefined, undefined, undefined, v1, undefined,
    { nightV2Reports: { items: [], error: "read failed", loaded: false } });
  assert.equal(failed.some(item => item.id === "night-v2-error"), true);
});

test("今晚续跑槽移除后白天派单重新进入待处理", () => {
  const state = seed();
  const runId = "run-queued", slotId = "slot-1", operationId = "continue-1";
  const reports = { items: [{ runId, nightDate: "2026-10-06", decisionPending: true }],
    decisions: [
      { runId, slotId, action: "day", status: "dispatched", at: "2026-10-07T00:00:00.000Z" },
      { runId, slotId, action: "continue", status: "queued", operationId },
    ] };
  state.nightV2 = { slots: [{ continueFrom: { operationId } }] };
  let items = pendingItems(state, undefined, undefined, undefined, undefined, undefined,
    { nightV2Reports: reports });
  assert.equal(items.some(item => item.id === `night-v2-day-${runId}-${slotId}`), false);
  state.nightV2.slots = [];
  items = pendingItems(state, undefined, undefined, undefined, undefined, undefined,
    { nightV2Reports: reports });
  assert.equal(items.some(item => item.id === `night-v2-day-${runId}-${slotId}`), true);
});
