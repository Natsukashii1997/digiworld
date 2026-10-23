import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, mkdir, writeFile, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { openRepository, digest } from "../server/repository.mjs";
import { validateState } from "../server/schema.mjs";
import { mergeBackup } from "../server/merge.mjs";
import { seed } from "../src/store.js";
import { stringify } from "../src/serialization.js";

const AT = "2026-09-30T08:00:00.000Z";
const role = (agentId, extra = {}) => ({
  agentId, strengths: ["重构", "测试"], cost: "medium", projects: [], note: "", updatedAt: AT, ...extra,
});

test("角色卡保留五个已批准 Agent 的字段与严格校验", () => {
  assert.doesNotThrow(() => validateState({ ...seed(), agentRoles: [role("codex"), role("doubao", { cost: "unknown" })] }));
  for (const bad of [
    [role("cursor")], [role("codex"), role("codex")], [role("codex", { cost: "free" })],
    [role("codex", { strengths: ["有 空格"] })], [role("codex", { projects: ["x".repeat(101)] })],
    [role("codex", { note: "x".repeat(1001) })], [role("codex", { weight: 2 })],
  ]) assert.throws(() => validateState({ ...seed(), agentRoles: bad }), /数据校验失败/);
});

test("旧备份导入忽略银饰记录，并保留角色卡当前编辑", () => {
  const current = { ...seed(), agentRoles: [role("codex", { note: "当前备注" })] };
  const incoming = { ...seed(), silver: { wall: [{ id: "retired" }] }, agentRoles: [role("codex", { note: "旧备注" }), role("hermes")] };
  const { state, summary } = mergeBackup(current, incoming);
  assert.equal(Object.hasOwn(state, "silver"), false);
  assert.equal(state.agentRoles.find(value => value.agentId === "codex").note, "当前备注");
  assert.ok(state.agentRoles.some(value => value.agentId === "hermes"));
  assert.equal(summary.agentRolesAdded, 1);
  assert.equal(Object.hasOwn(mergeBackup(null, incoming).state, "silver"), false);
});

test("旧客户端的银饰字段不会回到当前主库", async t => {
  const directory = await mkdtemp(join(tmpdir(), "workbench-agent-roles-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const repository = await openRepository(directory);
  t.after(() => repository.close());
  const first = await repository.write({ ...seed(), silver: { wall: ["旧值"] }, agentRoles: [role("hermes")] }, { initialize: true });
  assert.equal(Object.hasOwn(first, "silver"), false);
  const second = await repository.write({ ...first, silver: { wall: ["旧值"] }, notes: [...first.notes] });
  assert.equal(second.revision, first.revision + 1);
  assert.equal(Object.hasOwn(second, "silver"), false);
  assert.deepEqual(second.agentRoles, [role("hermes")]);
});

test("旧快照读取时忽略银饰字段，并保留原快照字节", async t => {
  const directory = await mkdtemp(join(tmpdir(), "workbench-legacy-snapshot-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  await mkdir(join(directory, "snapshots"));
  const legacy = stringify({ ...seed(), revision: 7, silver: { wall: ["历史记录"] } });
  const file = "7-00000000-0000-0000-0000-000000000000.json";
  await writeFile(join(directory, "snapshots", file), legacy);
  await writeFile(join(directory, "CURRENT.json"), JSON.stringify({ file, revision: 7, sha256: digest(legacy) }));
  const repository = await openRepository(directory);
  t.after(() => repository.close());
  const active = await repository.read();
  assert.equal(active.revision, 7);
  assert.equal(Object.hasOwn(active, "silver"), false);
  assert.equal(await readFile(join(directory, "snapshots", file), "utf8"), legacy);
});
