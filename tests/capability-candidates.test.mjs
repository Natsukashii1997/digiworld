// 全合成：spawn、进程组kill、网络listen/connect、HTTP、keychain、文件写均为桩。
import test from "node:test";
import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import fs from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { supportsClaudeNight, createClaudeNightPlan, spawnBoundedClaude as boundedRunner, createAnthropicConnectProxy } from "../server/claude-night-adapter.mjs";
import { previewModelRequest, createModelHttpAdapter } from "../server/model-http.mjs";
import { createKeychainAdapter } from "../server/keychain-adapter.mjs";
import { createScopedTextOperations } from "../server/scoped-text-operations.mjs";
import { planCodexContentBoolean, createUserRelayPackage } from "../server/agent-content-plans.mjs";
import { createScopedTextFiles } from "../server/scoped-text-files.mjs";
import { createScopedTextJournal } from "../server/scoped-text-journal.mjs";
import { createLaunchAgentPlan, execLaunchctl, createLaunchAgentAdapter } from "../server/launch-agent.mjs";
const require = createRequire(new URL("../package.json", import.meta.url));
const { parseTOML } = require("toml-eslint-parser"); // 已有纯解析依赖，只解析下方合成文本。
const hash = value => createHash("sha256").update(value).digest("hex");
// 每次合成runner也替换kill(0)的组存活探针，不能发任何真实信号。
const spawnBoundedClaude = (plan, key, options) => boundedRunner(plan, key, { groupExists: () => false, ...options });
const fakeKey = "fixture_api_key_only_123456";
const counts = { spawn: 0, kill: 0, listen: 0, connect: 0, http: 0, keychain: 0, write: 0 };
const input = () => ({
  verifiedBinding: { agent: "claude-code", platform: "darwin", version: "2.1.286",
    identity: "a".repeat(64), executable: "/fixture/program/claude", runtimeReadRoots: ["/fixture/program"],
    projectRoot: "/fixture/project", readFiles: ["/fixture/project/src/a.js", "/fixture/project/README.md"] },
  task: { instruction: "总结选中文件", budgetMicrosUsd: 150_000, timeoutMs: 1000, maxTurns: 3 },
  proxyPort: 43129, scratchDirectory: "/fixture/runtime/run-1", sessionId: "12345678-1234-4234-8234-123456789abc",
});
function commandStub(payload, action) {
  const child = new EventEmitter(); child.pid = 90001; child.stdout = new EventEmitter(); child.stderr = new EventEmitter(); child.stdin = new EventEmitter();
  child.stdin.end = () => queueMicrotask(() => {
    action?.(child);
    if (payload !== undefined) child.stdout.emit("data", Buffer.from(typeof payload === "string" ? payload : JSON.stringify(payload)));
    child.emit("close", 0, null);
  });
  return child;
}
const successfulResult = { result: "合成夜巡报告", total_cost_usd: 0.05, usage: { input_tokens: 9, output_tokens: 8, bogus: fakeKey } };

test("夜巡只支持官方已证版本和macOS", () => {
  assert.equal(supportsClaudeNight("2.1.285", "darwin").supported, false);
  assert.equal(supportsClaudeNight("2.1.286", "darwin").supported, true);
  assert.equal(supportsClaudeNight("2.1.286-beta", "darwin").supported, false);
  assert.equal(supportsClaudeNight("2.1.286", "linux").supported, false);
});
test("夜巡固定参数、只读文件、禁止5178、不传提示/Key argv", () => {
  const plan = createClaudeNightPlan(input());
  assert.equal(plan.args.includes("--max-budget-usd"), true);
  assert.equal(plan.args[plan.args.indexOf("--max-budget-usd") + 1], "0.150000");
  assert.equal(plan.args[plan.args.indexOf("--tools") + 1], "Read,Glob,Grep");
  for (const v of ["--bare", "--restricted", "--no-session-persistence", "--strict-mcp-config", "--permission-prompts"]) assert.ok(plan.args.includes(v));
  assert.match(plan.profile, /\(deny file-write\* \(subpath "\/fixture\/project"\)\)/);
  assert.match(plan.profile, /localhost:43129/);
  assert.ok(!plan.profile.includes("(allow network*)"));
  assert.doesNotMatch(plan.profile, /\(allow file-read[^\n]*\(subpath "\/fixture\/project"\)/);
  assert.ok(!plan.args.includes("总结选中文件"));
  assert.ok(!JSON.stringify(plan).includes(fakeKey));
});
test("夜巡越界、凭据路径、未知版本、未指定USD、重叠scratch均拒绝", () => {
  for (const mutate of [
    i => { i.verifiedBinding.readFiles = ["/fixture/private/session.json"]; },
    i => { i.verifiedBinding.readFiles = ["/fixture/project/.env"]; },
    i => { i.verifiedBinding.readFiles = ["/fixture/project/.claude/settings.json"]; },
    i => { i.verifiedBinding.version = "unknown"; },
    i => { i.proxyPort = 5178; },
    i => { i.task.budgetMicrosUsd = null; },
    i => { i.scratchDirectory = "/fixture/project/runtime"; },
    i => { i.verifiedBinding.runtimeReadRoots = ["/"]; },
    i => { i.verifiedBinding.runtimeReadRoots = ["/fixture"]; },
  ]) { const i = input(); mutate(i); assert.throws(() => createClaudeNightPlan(i)); }
});
test("夜巡成功回执只保留合法用量，费用为估算", async () => {
  const plan = createClaudeNightPlan(input()); let invocation;
  const result = await spawnBoundedClaude(plan, fakeKey, { spawn(file, args, options) {
    counts.spawn++; invocation = { file, args, options }; return commandStub(successfulResult);
  } });
  assert.equal(result.status, "verified"); assert.equal(result.costMicrosUsd, 50_000);
  assert.equal(result.costSource, "cli-client-estimate"); assert.equal(result.billedCost, null);
  assert.deepEqual(result.usage, { input_tokens: 9, output_tokens: 8 });
  assert.equal(invocation.options.shell, false); assert.equal(invocation.options.detached, true);
  assert.equal(invocation.options.env.ANTHROPIC_API_KEY, fakeKey);
  assert.ok(!JSON.stringify(invocation.args).includes(fakeKey)); assert.ok(!JSON.stringify(result).includes(fakeKey));
});
test("夜巡费用缺失/超预留/JSON损坏不可继续", async () => {
  for (const payload of [{ result: "报告" }, { result: "报告", total_cost_usd: 1 }, "{broken"]) {
    const r = await spawnBoundedClaude(createClaudeNightPlan(input()), fakeKey, { spawn() { counts.spawn++; return commandStub(payload); } });
    assert.equal(r.status, "unknown");
  }
});
test("夜巡Key泄露输出拦截", async () => {
  const r = await spawnBoundedClaude(createClaudeNightPlan(input()), fakeKey, { spawn() { counts.spawn++; return commandStub({ result: fakeKey, total_cost_usd: 0.01 }); } });
  assert.equal(r.status, "unknown"); assert.equal(r.output, ""); assert.ok(!JSON.stringify(r).includes(fakeKey));
});
test("夜巡已停止不启动进程；运行中停止发送组SIGTERM", async () => {
  const before = new AbortController(); before.abort(); let starts = 0;
  const stopped = await spawnBoundedClaude(createClaudeNightPlan(input()), fakeKey, { signal: before.signal, spawn() { starts++; } });
  assert.equal(stopped.status, "not_started"); assert.equal(starts, 0);
  const active = new AbortController(), kills = [];
  const r = await spawnBoundedClaude(createClaudeNightPlan(input()), fakeKey, { signal: active.signal,
    spawn() { counts.spawn++; return commandStub(successfulResult, () => active.abort()); },
    killGroup(pid, sig) { counts.kill++; kills.push([pid, sig]); } });
  assert.deepEqual(kills, [[90001, "SIGTERM"]]); assert.equal(r.status, "failed"); assert.equal(r.reason, "stopped");
});
test("父CLI关闭但进程组仍在，不把树停止说成成功", async () => {
  const kills = [];
  const r = await spawnBoundedClaude(createClaudeNightPlan(input()), fakeKey, {
    spawn() { counts.spawn++; return commandStub(successfulResult); }, groupExists: () => true,
    killGroup(pid, sig) { counts.kill++; kills.push([pid, sig]); },
  });
  assert.equal(r.status, "unknown"); assert.equal(r.stopped, false);
  assert.deepEqual(kills, [[90001, "SIGTERM"], [90001, "SIGKILL"]]);
});
test("代理只准固定Anthropic443；拒绝直接HTTP、其它域、5178和CONNECT早期数据", async () => {
  let handler, server; const connections = [];
  class Socket extends EventEmitter { ended = ""; write() {} pipe() {} destroy() {} end(text) { this.ended = text; } }
  const proxy = await createAnthropicConnectProxy({ serverFactory(fn) { handler = fn; server = new EventEmitter();
    server.listen = (port, host, cb) => { counts.listen++; assert.equal(port, 0); assert.equal(host, "127.0.0.1"); cb(); };
    server.address = () => ({ port: 43129 }); server.close = cb => cb(); return server; },
    connectUpstream(spec) { counts.connect++; connections.push(spec); return new Socket(); } });
  for (const url of ["api.openai.com:443", "api.anthropic.com:5178", "127.0.0.1:5178", "api.anthropic.com:443.evil"]) {
    const s = new Socket(); server.emit("connect", { url }, s, Buffer.alloc(0)); assert.match(s.ended, /403/);
  }
  const early = new Socket(); server.emit("connect", { url: "api.anthropic.com:443" }, early, Buffer.from("x")); assert.match(early.ended, /403/);
  server.emit("connect", { url: "api.anthropic.com:443" }, new Socket(), Buffer.alloc(0));
  assert.deepEqual(connections, [{ host: "api.anthropic.com", port: 443 }]);
  const r = { writeHead(code) { assert.equal(code, 403); }, end() {} }; handler({}, r); await proxy.close();
});

function memoryOperationJournal() {
  const state = new Map([["fixture-operation", { exists: true, phase: "prepared", executionStarted: false }]]);
  return { state, async checkExisting(id) { return state.get(id) || { exists: false }; },
    async started(id) { if (state.get(id)?.executionStarted !== false) return false; state.set(id, { exists: true, phase: "started", executionStarted: true }); return true; },
    async completed(id, receipt) { state.set(id, { exists: true, phase: "completed", executionStarted: true, receipt }); } };
}
test("模型连接一次最小GET，响应无凭据，成功不冒充生成已验证", async () => {
  const j = memoryOperationJournal(); let seen;
  const api = createModelHttpAdapter({ ...j, getCredential: async () => fakeKey, transport: async (url, opts) => {
    counts.http++; seen = { url, opts }; return new Response(JSON.stringify({ data: [{ id: "fixture-model" }] }), { status: 200 });
  } });
  const r = await api.testConnection({ operationId: "fixture-operation", provider: "anthropic" });
  assert.equal(r.status, "verified"); assert.equal(r.generationVerified, false); assert.ok(!JSON.stringify(r).includes(fakeKey));
  assert.equal(seen.url, "https://api.anthropic.com/v1/models"); assert.equal(seen.opts.method, "GET"); assert.equal(seen.opts.redirect, "error"); assert.ok(!seen.opts.body);
  const n = counts.http; await api.testConnection({ operationId: "fixture-operation", provider: "anthropic" }); assert.equal(counts.http, n);
});
test("模型HTTP未知不重放，错误不泄露提供方正文", async () => {
  const j = memoryOperationJournal(), api = createModelHttpAdapter({ ...j, getCredential: async () => fakeKey,
    transport: async () => { counts.http++; throw new Error(fakeKey); } });
  const r = await api.testConnection({ operationId: "fixture-operation", provider: "openai" });
  assert.equal(r.status, "unknown"); assert.ok(!JSON.stringify(r).includes(fakeKey));
  const n = counts.http; await api.testConnection({ operationId: "fixture-operation", provider: "openai" }); assert.equal(counts.http, n);
});
test("单书有界预览不编价格，一次生成并回读用量", async () => {
  const unknown = previewModelRequest({ provider: "anthropic", model: "fixture-model", text: "仅合成书摘", operationId: "fixture-operation", maxOutputTokens: 12 });
  assert.equal(unknown.estimateMicrosUsd, null); assert.ok(unknown.costMessage.includes("待接入数据"));
  const plan = previewModelRequest({ provider: "anthropic", model: "fixture-model", text: "仅合成书摘", operationId: "fixture-operation", maxOutputTokens: 12,
    rate: { currency: "USD", source: "https://fixture.invalid/synthetic-price", asOf: "2026-10-04", inputMicrosPerToken: 1, outputMicrosPerToken: 2 } });
  assert.equal(plan.body.max_tokens, 12);
  const j = memoryOperationJournal(), api = createModelHttpAdapter({ ...j, getCredential: async () => fakeKey, transport: async (_url, opts) => {
    counts.http++; assert.equal(opts.method, "POST"); assert.equal(JSON.parse(opts.body).max_tokens, 12);
    return new Response(JSON.stringify({ id: "fixture_message", content: [{ type: "text", text: "合成摘要" }], usage: { input_tokens: 11, output_tokens: 3 } }));
  } });
  const r = await api.generateSingleBook({ operationId: "fixture-operation", provider: "anthropic", model: "fixture-model", plan });
  assert.equal(r.output, "合成摘要"); assert.deepEqual(r.usage, { input_tokens: 11, output_tokens: 3 }); assert.equal(r.billedCost, null);
});
test("单书费用未知拒绝但不妨碍一次连接测试，已停止也零请求", async () => {
  const plan = previewModelRequest({ provider: "anthropic", model: "fixture", text: "合成", operationId: "fixture-operation" });
  const j = memoryOperationJournal(), api = createModelHttpAdapter({ ...j, getCredential: async () => fakeKey, transport: async () => { throw new Error("不得调用"); } });
  await assert.rejects(api.generateSingleBook({ operationId: "fixture-operation", provider: "anthropic", model: "fixture", plan }), { code: "COST_UNKNOWN" });
  assert.equal((await api.check("fixture-operation")).executionStarted, false);
  const stopped = new AbortController(); stopped.abort();
  const r = await api.testConnection({ operationId: "fixture-operation", provider: "anthropic", signal: stopped.signal });
  assert.equal(r.status, "not_started");
});
test("单书草稿变更与任意端点拒绝，拒绝时不调用HTTP", async () => {
  const plan = previewModelRequest({ provider: "anthropic", model: "fixture", text: "合成", operationId: "fixture-operation" });
  plan.body.messages[0].content = "篡改";
  const j = memoryOperationJournal(), api = createModelHttpAdapter({ ...j, getCredential: async () => fakeKey, transport: async () => { throw new Error("不得执行"); } });
  await assert.rejects(api.generateSingleBook({ operationId: "fixture-operation", provider: "anthropic", model: "fixture", plan }), { code: "PLAN_CHANGED" });
  await assert.rejects(api.testConnection({ operationId: "fixture-operation", provider: "http://localhost:5178" }), { code: "UNSUPPORTED_PROVIDER" });
});
test("钥匙串备份/回读/回滚仅存桩钥匙串，不返secret", async () => {
  const storage = new Map([["anthropic/main", fakeKey]]), api = createKeychainAdapter({ runHelper: async ({ action, account, secret }) => {
    counts.keychain++;
    if (action === "has") return { ok: true, exists: storage.has(account) };
    if (action === "get") return storage.has(account) ? { ok: true, secret: storage.get(account) } : { ok: false, code: "CREDENTIAL_MISSING" };
    if (action === "create" && storage.has(account)) return { ok: false, code: "BACKUP_CONFLICT" };
    if (action === "set" || action === "create") storage.set(account, secret);
    if (action === "delete") storage.delete(account);
    return { ok: true };
  } });
  const b = await api.createBackup("anthropic", "12345678-1234-4234-8234-123456789abc"); assert.ok(!JSON.stringify(b).includes(fakeKey));
  const updated = "fixture_new_key_only_999";
  const expected = await api.prepareExpected("anthropic", "12345678-1234-4234-8234-123456789abc", updated);
  const saved = await api.applyExpected("anthropic", expected.expectedCredentialRef); assert.ok(!JSON.stringify(saved).includes(updated));
  const rollback = await api.rollback("anthropic", b, expected.expectedCredentialRef); assert.equal(rollback.rolledBack, true); assert.equal(await api.get("anthropic/main"), fakeKey);
  await assert.rejects(api.has("../private")); await assert.rejects(api.rollback("anthropic", b, expected.expectedCredentialRef));
});

function textFixture() {
  let file = null, inode = 0, disabled = false, link = false, failApplied = false;
  const records = new Map(), applied = new Map(), undone = new Map();
  const target = { identity: "fixture-root-id", parentIdentity: "fixture-parent-id", displayPath: "Vault/notes/合成.md" };
  const inspect = async () => { if (link) throw new Error("链接拒绝"); return file ? { ...file } : null; };
  const write = text => { counts.write++; file = { content: text, sha256: hash(text), fingerprint: "inode-" + (++inode), parentIdentity: target.parentIdentity }; };
  const api = createScopedTextOperations({
    async resolveTarget(ref) { if (ref !== "fixture-note" || link) throw new Error("越界或链接"); return target; },
    inspect, async create(_t, text) { if (file) throw new Error("冲突"); write(text); }, async replace(_t, expected, text) { if (file?.fingerprint !== expected.fingerprint) throw new Error("身份变化"); write(text); },
    async remove(_t, expected) { if (file?.fingerprint !== expected.fingerprint) throw new Error("身份变化"); counts.write++; file = null; },
    async assertEnabled() { if (disabled) throw new Error("默认关闭"); return { generation: 1 }; }, revision: async () => 1,
    journal: { async read(id) { return records.get(id); }, async prepare(r) { assert.equal(records.has(r.id), false); records.set(r.id, structuredClone(r)); },
      async applied(id, r) { if (failApplied) throw new Error("回执写失败"); applied.set(id, r); }, async appliedReceipt(id) { return applied.get(id); },
      async rollbackStarted() {}, async rolledBack(id, r) { undone.set(id, r); }, async rolledBackReceipt(id) { return undone.get(id); } },
  });
  return { api, mutate: write, setDisabled: value => { disabled = value; }, setLink: value => { link = value; }, setFailApplied: value => { failApplied = value; }, file: () => file };
}
test("Vault新建预览确认备份回读回滚，重复apply不再写", async () => {
  const f = textFixture(), p = await f.api.preview({ capability: "vault", targetRef: "fixture-note", mode: "create", text: "合成随手记" });
  const r = await f.api.apply({ token: p.token, operationId: p.operationId }); assert.equal(r.status, "verified");
  const n = counts.write; await f.api.apply({ token: p.token, operationId: p.operationId }); assert.equal(counts.write, n);
  const u = await f.api.rollbackPreview(p.operationId); const rolled = await f.api.rollback(u); assert.equal(rolled.status, "rolled_back");
  assert.equal(f.file(), null); assert.equal((await f.api.check(p.operationId)).status, "rolled_back");
});
test("Vault关闭、越界、链接、同名冲突拒绝，零写", async () => {
  const f = textFixture(); f.setDisabled(true);
  await assert.rejects(f.api.preview({ capability: "vault", targetRef: "fixture-note", mode: "create", text: "合成" }));
  f.setDisabled(false); await assert.rejects(f.api.preview({ capability: "vault", targetRef: "../real", mode: "create", text: "合成" }));
  f.setLink(true); await assert.rejects(f.api.preview({ capability: "vault", targetRef: "fixture-note", mode: "create", text: "合成" }));
  f.setLink(false); f.mutate("现有合成文本");
  await assert.rejects(f.api.preview({ capability: "vault", targetRef: "fixture-note", mode: "create", text: "合成" }), { code: "NAME_CONFLICT" });
});
test("个人说明只做唯一精确替换，原文备份与恢复", async () => {
  const f = textFixture(); f.mutate("A\n原段落\nB");
  const p = await f.api.preview({ capability: "vault", targetRef: "fixture-note", mode: "exact-segment", beforeSegment: "原段落", replacement: "新段落" });
  assert.equal(p.before, "A\n原段落\nB"); assert.equal(p.after, "A\n新段落\nB");
  assert.equal((await f.api.apply({ token: p.token, operationId: p.operationId })).status, "verified");
  await f.api.rollback(await f.api.rollbackPreview(p.operationId)); assert.equal(f.file().content, "A\n原段落\nB");
  f.mutate("重复重复"); await assert.rejects(f.api.preview({ capability: "vault", targetRef: "fixture-note", mode: "exact-segment", beforeSegment: "重复", replacement: "新" }), { code: "AMBIGUOUS_SEGMENT" });
});
test("写后日志未知先查不能盲写；同字节换inode不可回滚", async () => {
  const f = textFixture(), p = await f.api.preview({ capability: "vault", targetRef: "fixture-note", mode: "create", text: "合成" });
  f.setFailApplied(true); assert.equal((await f.api.apply({ token: p.token, operationId: p.operationId })).status, "unknown");
  const n = counts.write; await f.api.apply({ token: p.token, operationId: p.operationId }); assert.equal(counts.write, n);
  assert.equal((await f.api.check(p.operationId)).status, "unknown"); await assert.rejects(f.api.rollbackPreview(p.operationId));
  const g = textFixture(), q = await g.api.preview({ capability: "vault", targetRef: "fixture-note", mode: "create", text: "合成" });
  await g.api.apply({ token: q.token, operationId: q.operationId }); g.mutate("合成"); await assert.rejects(g.api.rollbackPreview(q.operationId));
});
test("Codex Skill/插件只精确改boolean并保留其它字节，不执行Agent", () => {
  const text = '# 合成\nmodel = "fixture"\n[[skills.config]]\npath = "/fixture/skills/a/SKILL.md"\nenabled = true # 尾注\n[plugins."fixture@local"]\nenabled = false\n';
  const s = planCodexContentBoolean({ text, kind: "skill", ref: "/fixture/skills/a/SKILL.md", enabled: false, parseTOML });
  assert.equal(s.text, text.replace("enabled = true #", "enabled = false #")); assert.deepEqual(s.fieldsChanged, ["enabled"]);
  const p = planCodexContentBoolean({ text, kind: "plugin", ref: "fixture@local", enabled: true, parseTOML });
  assert.equal(p.text, text.replace('enabled = false\n', 'enabled = true\n'));
  assert.ok(p.adoption.includes("重启"));
});
test("Codex Skill/插件可新增正式配置，拒绝非法/重复/不支持映射", () => {
  const p = planCodexContentBoolean({ text: 'model="fixture"\n', kind: "plugin", ref: "x@local", enabled: false, parseTOML });
  assert.ok(p.text.endsWith('[plugins."x@local"]\nenabled = false\n'));
  const s = planCodexContentBoolean({ text: "", kind: "skill", ref: "/fixture/a/SKILL.md", enabled: true, parseTOML });
  assert.ok(s.text.includes("[[skills.config]]"));
  assert.throws(() => planCodexContentBoolean({ text: "", kind: "plugin", ref: "../x", enabled: true, parseTOML }));
  assert.throws(() => planCodexContentBoolean({ text: 'skills = {config=[]}\n', kind: "skill", ref: "/fixture/a/SKILL.md", enabled: true, parseTOML }));
});
test("接力包仅用户给上下文，无私人会话读取", () => {
  const r = createUserRelayPackage({ sourceName: "合成源", targetName: "合成目标", goal: "目标", providedContext: "用户提供", nextStep: "下一步" });
  assert.ok(r.includes("用户提供")); assert.ok(r.includes("没有读取"));
});
test("常驻plist固定Node/Label/5178，参数数组正确转义，不含Key或Shell", () => {
  const p = createLaunchAgentPlan({ verifiedNodePath: "/fixture/node/bin/node", verifiedProjectRoot: "/fixture/项目 & 夹",
    verifiedDataDirectory: "/fixture/数据", verifiedLogDirectory: "/fixture/logs", verifiedHome: "/fixture/home", uid: 501 });
  assert.deepEqual(p.programArguments, ["/fixture/node/bin/node", "/fixture/项目 & 夹/server/index.mjs"]);
  assert.ok(p.plist.includes("项目 &amp; 夹")); assert.ok(p.plist.includes("<string>5178</string>"));
  assert.equal(p.label, "cn.personal-ai-workbench.server"); assert.ok(!p.plist.includes(fakeKey)); assert.ok(!p.plist.includes("/bin/sh"));
  assert.ok(!p.plist.includes("AssociatedBundleIdentifiers"));
});
test("常驻使用固定应用内 Node 时保留日历权限身份", () => {
  const home = "/fixture/home";
  const p = createLaunchAgentPlan({ verifiedNodePath: `${home}/Library/Application Support/PersonalAIWorkbench/WorkbenchServer.app/Contents/MacOS/node`,
    verifiedProjectRoot: "/fixture/project", verifiedDataDirectory: "/fixture/data", verifiedLogDirectory: "/fixture/logs", verifiedHome: home, uid: 501 });
  assert.match(p.plist, /<key>AssociatedBundleIdentifiers<\/key><string>cn\.personal-ai-workbench\.server<\/string>/);
});
test("常驻现有5178不停止不绕过，分开报告已安装/加载/健康", async () => {
  const plan = createLaunchAgentPlan({ verifiedNodePath: "/fixture/node", verifiedProjectRoot: "/fixture/project", verifiedDataDirectory: "/fixture/data",
    verifiedLogDirectory: "/fixture/logs", verifiedHome: "/fixture/home", uid: 501 });
  let file = null, commands = [];
  const a = createLaunchAgentAdapter({ run: async args => { commands.push(args); throw Object.assign(new Error("合成未加载"), { exitCode: 113 }); },
    inspectPlist: async () => file, prepared: async () => {}, writePlist: async () => { file = { sha256: hash(plan.plist) }; },
    recordResult: async () => {}, portOccupied: async () => true, inspectBinding: async () => {}, assertEnabled: async () => {} });
  const r = await a.install({ plan, operationId: "fixture-daemon" });
  assert.equal(r.installed, true); assert.equal(r.loaded, false); assert.equal(r.healthy, null); assert.equal(r.status, "waiting_for_user_restart");
  assert.deepEqual(commands, [["print", "gui/501/cn.personal-ai-workbench.server"]]);
});
test("launchctl执行固定系统程序与argv，不运行真实命令", async () => {
  const r = await execLaunchctl(["print", "gui/501/cn.personal-ai-workbench.server"], { execFile(file, args, opts, callback) {
    assert.equal(file, "/bin/launchctl"); assert.equal(opts.shell, false); assert.deepEqual(args, ["print", "gui/501/cn.personal-ai-workbench.server"]); callback(null, "合成loaded");
  } });
  assert.equal(r, "合成loaded");
});
test("具体文件适配+持久journal仅合成目录：新建/重开/check/恢复/越界/链接", async () => {
  const { readConfigFile, atomicReplaceConfig } = await import("../server/config-file.mjs");
  const { createConfigJournal } = await import("../server/config-journal.mjs");
  const base = await fs.mkdtemp(join(dirname(fileURLToPath(import.meta.url)), "fixture-private-"));
  try {
    const root = join(base, "synthetic-vault"), journalRoot = join(base, "synthetic-journal");
    await fs.mkdir(root, { mode: 0o700 }); await fs.mkdir(join(root, "notes"), { mode: 0o700 });
    await fs.mkdir(journalRoot, { mode: 0o700 });
    const stat = await fs.lstat(root), rootIdentity = hash(root + ":" + [stat.dev, stat.ino, stat.birthtimeMs, stat.uid, stat.mode & 0o777].join(":"));
    let rel = "notes/合成.md", linked = false;
    const fileApi = createScopedTextFiles({
      async registeredTarget(ref) {
        assert.equal(ref, "fixture-note");
        return { kind: "note", root, rootIdentity, relativePath: rel, allowedSubdirectory: "notes" };
      }, readConfigFile, atomicReplaceConfig,
      checkMetadata: async (_path, options) => options?.preserve || { provenance: null },
    });
    const build = () => createScopedTextOperations({ ...fileApi,
      journal: createScopedTextJournal(journalRoot, { createConfigJournal }), assertEnabled: async () => ({ generation: 1 }), revision: async () => 1 });
    const api = build(), p = await api.preview({ capability: "vault", targetRef: "fixture-note", mode: "create", text: "合成持久文本" });
    assert.equal((await api.apply({ token: p.token, operationId: p.operationId })).status, "verified");
    const reopened = build();
    assert.equal((await reopened.check(p.operationId)).status, "verified");
    assert.equal((await reopened.rollback(await reopened.rollbackPreview(p.operationId))).status, "rolled_back");
    assert.equal((await build().check(p.operationId)).status, "rolled_back");
    await fs.writeFile(join(root, "notes/合成.md"), "A\n原段落\nB", { mode: 0o600 });
    const q = await build().preview({ capability: "vault", targetRef: "fixture-note", mode: "exact-segment", beforeSegment: "原段落", replacement: "新段落" });
    await assert.rejects(build().apply({ token: q.token, operationId: q.operationId }), { code: "PREVIEW_EXPIRED" });
    assert.equal((await build().check(q.operationId)).status, "not_started");
    // 预览token不跨进程；旧token禁止写，再查询得not_started。重新预览才可执行。
    const same = build(), s = await same.preview({ capability: "vault", targetRef: "fixture-note", mode: "exact-segment", beforeSegment: "原段落", replacement: "新段落" });
    assert.equal((await same.apply({ token: s.token, operationId: s.operationId })).status, "verified");
    const again = build(); assert.equal((await again.rollback(await again.rollbackPreview(s.operationId))).status, "rolled_back");
    assert.equal(await fs.readFile(join(root, "notes/合成.md"), "utf8"), "A\n原段落\nB");
    rel = "../outside.md"; await assert.rejects(fileApi.resolveTarget("fixture-note"));
    rel = "notes/.env"; await assert.rejects(fileApi.resolveTarget("fixture-note"));
    rel = "notes/linked.md"; await fs.symlink(join(root, "notes/合成.md"), join(root, rel)); linked = true;
    const t = await fileApi.resolveTarget("fixture-note"); await assert.rejects(fileApi.inspect(t));
    assert.equal(linked, true);
    const preparedNames = await fs.readdir(join(journalRoot, "scoped-text-prepared")); assert.ok(preparedNames.length > 0);
    for (const name of preparedNames) assert.equal((await fs.stat(join(journalRoot, "scoped-text-prepared", name))).mode & 0o777, 0o600);
    assert.equal((await fs.stat(join(journalRoot, "scoped-text-prepared"))).mode & 0o777, 0o700);
  } finally { await fs.rm(base, { recursive: true, force: true }); } // 只删本测试新建合成根，绝不扫真实目录。
});
test("外部能力入口全部注入桩；具体文件读写只用聊天目录合成fixture", () => {
  assert.ok(counts.spawn >= 5); assert.ok(counts.http >= 3); assert.equal(counts.listen, 1); assert.equal(counts.connect, 1);
  // 此文件没有调用默认spawn/fetch/createServer/connect；所有外部入口均注入上述桩。
});
