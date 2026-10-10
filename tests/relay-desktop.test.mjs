import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createRelaySessions } from "../server/relay-sessions.mjs";

async function fixture(run) {
  const home = await fs.realpath(await fs.mkdtemp(join(tmpdir(), "guiji-desktop-")));
  try { await run(home); } finally { await fs.rm(home, { recursive: true, force: true }); }
}
async function app(home, name, bundle) {
  const path = join(home, name);
  await fs.mkdir(join(path, "Contents"), { recursive: true });
  await fs.writeFile(join(path, "Contents/Info.plist"), JSON.stringify({ CFBundleIdentifier: bundle }));
  return path;
}
const record = (id, path) => ({ id, status: "detected", programs: [{ kind: "App", path }] });

test("Claude协作角色打开已检测Claude桌面版，不执行CLI或传提示词", () => fixture(async home => {
  const path = await app(home, "Claude.app", "com.anthropic.claudefordesktop"), calls = [];
  const service = createRelaySessions({ home, getAgents: () => [
    { id: "claude-code", status: "detected", programs: [{ kind: "CLI", path: "/fixture/bin/claude" }] },
    record("claude-app", path),
  ], openApplication: async (...args) => calls.push(args) });
  assert.equal((await service.open({ agentId: "claude-code" })).opened, true);
  assert.deepEqual(calls, [[path]]);
}));

test("Codex桌面版按bundle识别，支持实际名为ChatGPT.app的安装", () => fixture(async home => {
  const path = await app(home, "ChatGPT.app", "com.openai.codex"), calls = [];
  const service = createRelaySessions({ home, getAgents: () => [record("codex", path)], openApplication: async (...args) => calls.push(args) });
  assert.equal((await service.open({ agentId: "codex" })).opened, true);
  assert.deepEqual(calls, [[path]]);
  await fs.writeFile(join(path, "Contents/Info.plist"), JSON.stringify({ CFBundleIdentifier: "com.openai.chat" }));
  await assert.rejects(service.open({ agentId: "codex" }), /应用身份/);
  assert.equal(calls.length, 1);
}));

test("桌面身份缺失、错误或元数据链接都不打开", () => fixture(async home => {
  const path = await app(home, "Claude.app", "com.example.other"), calls = [];
  const service = createRelaySessions({ home, getAgents: () => [record("claude-app", path)], openApplication: async (...args) => calls.push(args) });
  await assert.rejects(service.open({ agentId: "claude-code" }), /应用身份/);
  const meta = join(path, "Contents/Info.plist");
  await fs.rm(meta);
  await assert.rejects(service.open({ agentId: "claude-code" }), /应用身份/);
  const other = join(home, "metadata.json");
  await fs.writeFile(other, JSON.stringify({ CFBundleIdentifier: "com.anthropic.claudefordesktop" }));
  await fs.symlink(other, meta);
  await assert.rejects(service.open({ agentId: "claude-code" }), /应用身份/);
  assert.deepEqual(calls, []);
}));

test("仅有CLI或桌面记录未知时明确缺少桌面版，不尝试执行", () => fixture(async home => {
  const path = await app(home, "Claude.app", "com.anthropic.claudefordesktop"), calls = [];
  const service = createRelaySessions({ home, getAgents: () => [
    { id: "claude-code", status: "detected", programs: [{ kind: "CLI", path: "/fixture/bin/claude" }] },
    { ...record("claude-app", path), status: "unknown" },
  ], openApplication: async (...args) => calls.push(args) });
  const result = await service.open({ agentId: "claude-code" });
  assert.equal(result.opened, false);
  assert.match(result.reason, /Claude 桌面版/);
  assert.deepEqual(calls, []);
}));

test("打开前桌面登记被撤回时拒绝；App路径链接仍拒绝", () => fixture(async home => {
  const path = await app(home, "Claude.app", "com.anthropic.claudefordesktop");
  let reads = 0, opens = 0;
  const service = createRelaySessions({ home, getAgents: () => ++reads === 1 ? [record("claude-app", path)] : [], openApplication: async () => opens++ });
  await assert.rejects(service.open({ agentId: "claude-code" }), /检测入口已变化/);
  const alias = join(home, "Alias.app"); await fs.symlink(path, alias);
  const linked = createRelaySessions({ home, getAgents: () => [record("claude-app", alias)], openApplication: async () => opens++ });
  await assert.rejects(linked.open({ agentId: "claude-code" }), /符号/);
  assert.equal(opens, 0);
}));
