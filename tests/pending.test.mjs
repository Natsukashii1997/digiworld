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

test("知识任务、随手记和未设置目标的已检测 Agent 如实计数", () => {
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
  const byId = Object.fromEntries(pendingItems(s).map((i) => [i.id, i]));
  assert.match(byId["knowledge-tasks"].title, /^1 个知识整理任务/);
  assert.match(byId["notes-local"].title, /^2 条随手记/);
  assert.equal(byId["agents-untargeted"].title, "Hermes 已检测到，尚未设置管理目标");
});
