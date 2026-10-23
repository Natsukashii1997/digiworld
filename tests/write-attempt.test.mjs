// 阶段 2 B 批：公共写入能力的语义（冲突、结果未知先查询、查不到不自动重放、明确重试才用同一尝试重发）。
import test from "node:test";
import assert from "node:assert/strict";
import { settleAttempt } from "../src/write-attempt.js";

function fake({ sends = [], reads = [] }) {
  const calls = { send: 0, check: 0 };
  return {
    calls,
    send: async () => { const next = sends[calls.send++]; if (next instanceof Error) throw next; return next; },
    check: async () => { const next = reads[calls.check++]; if (next instanceof Error) throw next; return next; },
  };
}

test("首次写入：报成功且回读查到才算完成；报成功但没查到是未确认", async () => {
  let f = fake({ sends: [true], reads: [{ state: "done", value: 7 }] });
  assert.deepEqual(await settleAttempt("first", f), { outcome: "done", value: 7 });
  f = fake({ sends: [true], reads: [{ state: "absent" }] });
  assert.equal((await settleAttempt("first", f)).outcome, "unconfirmed");
  assert.equal(f.calls.send, 1);
});

test("首次写入失败时先查询：已落地即完成，查不到只报告不重放，内容不同即冲突", async () => {
  let f = fake({ sends: [false], reads: [{ state: "done" }] });
  assert.equal((await settleAttempt("first", f)).outcome, "done");
  f = fake({ sends: [false], reads: [{ state: "absent" }] });
  assert.equal((await settleAttempt("first", f)).outcome, "absent");
  assert.equal(f.calls.send, 1, "查不到时不自动重放");
  f = fake({ sends: [false], reads: [{ state: "conflict" }] });
  assert.equal((await settleAttempt("first", f)).outcome, "conflict");
});

test("刷新后恢复只查询不发送", async () => {
  for (const state of ["done", "absent", "conflict"]) {
    const f = fake({ reads: [{ state }] });
    assert.equal((await settleAttempt("recover", f)).outcome, state);
    assert.equal(f.calls.send, 0);
  }
});

test("明确重试：已落地不重发；冲突不覆盖；确实没有才用同一尝试重发一次再回读", async () => {
  let f = fake({ reads: [{ state: "done" }] });
  assert.equal((await settleAttempt("retry", f)).outcome, "done");
  assert.equal(f.calls.send, 0);
  f = fake({ reads: [{ state: "conflict" }] });
  assert.equal((await settleAttempt("retry", f)).outcome, "conflict");
  assert.equal(f.calls.send, 0);
  f = fake({ sends: [true], reads: [{ state: "absent" }, { state: "done", value: 1 }] });
  assert.deepEqual(await settleAttempt("retry", f), { outcome: "done", value: 1 });
  assert.equal(f.calls.send, 1);
  f = fake({ sends: [true], reads: [{ state: "absent" }, { state: "absent" }] });
  assert.deepEqual(await settleAttempt("retry", f), { outcome: "unconfirmed", replayed: true, value: undefined });
  // 重发以刚回读到的状态为起点。
  let base;
  await settleAttempt("retry", { send: async (value) => { base = value; return true; }, check: async () => ({ state: base ? "done" : "absent", value: base ? "after" : "fresh" }) });
  assert.equal(base, "fresh");
});

test("发送中断时先查询；查询也失败即结果未知，不再继续发送", async () => {
  let f = fake({ sends: [new Error("断开")], reads: [{ state: "done" }] });
  assert.equal((await settleAttempt("first", f)).outcome, "done");
  f = fake({ sends: [new Error("断开")], reads: [{ state: "absent" }] });
  assert.equal((await settleAttempt("first", f)).outcome, "absent");
  assert.equal(f.calls.send, 1);
  f = fake({ sends: [new Error("断开")], reads: [{ state: "absent" }, { state: "absent" }] });
  assert.equal((await settleAttempt("retry", f)).outcome, "unconfirmed");
  f = fake({ sends: [true], reads: [new Error("读不到")] });
  assert.deepEqual(await settleAttempt("first", f), { outcome: "unknown" });
  f = fake({ reads: [new Error("读不到")] });
  assert.deepEqual(await settleAttempt("retry", f), { outcome: "unknown" });
  assert.equal(f.calls.send, 0);
  await assert.rejects(settleAttempt("again", f), /写入尝试方式无效/);
});
