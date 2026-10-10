import test from "node:test";
import assert from "node:assert/strict";
import { seed } from "../src/store.js";
import { pendingItems } from "../src/pending.js";

test("two unresolved repair issues create distinct main cards with their issue identity", () => {
  const collabStatus = { loaded: true, error: "", items: [{
    projectId: "project_one", name: "合成项目",
    protocol: { state: "ok", runs: [{
      id: "run-one", title: "页面", phase: { basis: "CURRENT" }, stageAt: "2026-10-06T00:00:00Z",
      alerts: ["A", "B"].map((issueId) => ({ kind: "needs_decision", main: true,
        label: "同项返修两次仍不过", issueId })),
    }] },
  }] };
  const cards = pendingItems(seed(), { items: [], error: "" }, { items: [], error: "" },
    {}, { items: [], loaded: false }, { noteIds: [], loaded: false },
    { collabStatus }).filter((item) => item.id.startsWith("collab-main-"));
  assert.equal(cards.length, 2);
  assert.equal(new Set(cards.map((item) => item.id)).size, 2);
  assert.deepEqual(cards.map((item) => item.detail), ["返修项：A。CURRENT", "返修项：B。CURRENT"]);
  assert.ok(cards.every((item) => item.triage === "需要决定"));
});
