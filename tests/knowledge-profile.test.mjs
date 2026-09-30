// 路线 v3 切片 3.2/3.3：三区统计服务、个人说明读取与修改建议、本机 MCP 服务。
// 全部使用临时合成 Vault，不读取任何真实用户目录；每个用例核对 Vault 文件字节未被改写。
import test from "node:test";
import assert from "node:assert/strict";
import {
  mkdtemp,
  mkdir,
  writeFile,
  readFile,
  readdir,
  rm,
  utimes,
} from "node:fs/promises";
import { createHash } from "node:crypto";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { openRepository } from "../server/repository.mjs";
import { createKnowledgeFiles } from "../server/knowledge-files.mjs";
import { createKnowledgeConnections } from "../server/knowledge-connections.mjs";
import { createKnowledgeProfile } from "../server/knowledge-profile.mjs";
import {
  PROFILE_TOOLS,
  handleMcp,
  startProfileMcp,
} from "../server/profile-mcp.mjs";
import { startServer } from "../server/http.mjs";
import { seed } from "../src/store.js";
import { parse, stringify } from "../src/serialization.js";

export const PROFILE_ABOUT =
  "# 关于我\n\n## 工作\n我在合成公司负责 AI 流程。\n\n## 偏好\n结论先行。\n";
const OLD = new Date(Date.now() - 30 * 86400000);

async function syntheticVault(base) {
  const root = join(base, "合成Vault");
  const put = async (path, text, old = false) => {
    await mkdir(join(root, path, ".."), { recursive: true });
    await writeFile(join(root, path), text);
    if (old) await utimes(join(root, path), OLD, OLD);
  };
  await put("GET NOTES/订阅一.md", "# 订阅一\n");
  await put("GET NOTES/子/订阅二.md", "# 订阅二\n", true);
  await put("个人上下文/关于我.md", PROFILE_ABOUT, true);
  await put("个人上下文/沟通.md", "# 沟通\n先给结论。\n", true);
  await put("决定/方法A.md", "# 方法A\n");
  await put("项目/经验.md", "# 经验\n", true);
  await put("个人上下文副本/草稿.md", "# 不是个人说明\n");
  return root;
}
async function vaultDigest(root) {
  const out = [];
  async function walk(dir) {
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) await walk(path);
      else
        out.push(
          path.slice(root.length) +
            ":" +
            createHash("sha256").update(await readFile(path)).digest("hex"),
        );
    }
  }
  await walk(root);
  return out.sort().join("\n");
}

async function fixture(t) {
  const base = await mkdtemp(join(tmpdir(), "guiji-profile-"));
  const root = await syntheticVault(base);
  const repository = await openRepository(join(base, "data"));
  await repository.write(seed(), { initialize: true });
  const files = createKnowledgeFiles();
  const knowledge = createKnowledgeConnections(repository, { files });
  const connected = await knowledge.connect({
    name: "合成 Vault",
    kind: "obsidian",
    root,
    confirmed: true,
    expectedRevision: 1,
  });
  const sourceId = connected.connections.knowledgeSources[0].id;
  const profile = createKnowledgeProfile(repository, { files });
  const before = await vaultDigest(root);
  t.after(async () => {
    await repository.close();
    await rm(base, { recursive: true, force: true });
  });
  const revision = async () => (await repository.read()).revision;
  const share = async () =>
    profile.setSharing({
      enabled: true,
      confirmed: true,
      expectedRevision: await revision(),
    });
  return {
    base,
    root,
    repository,
    files,
    profile,
    sourceId,
    revision,
    share,
    unchanged: async () => assert.equal(await vaultDigest(root), before),
  };
}
const change = (over = {}) => ({
  path: "个人上下文/关于我.md",
  original: "结论先行。",
  proposed: "结论先行，零寒暄。",
  reason: "多次会话中用户要求去掉寒暄",
  proposer: "Claude Code",
  ...over,
});
const rejects = async (promise, status, pattern) => {
  await assert.rejects(promise, (error) => {
    assert.equal(error.status, status, error.message);
    if (pattern) assert.match(error.message, pattern);
    return true;
  });
};

test("三区统计：按默认规则只读统计各区篇数与本周新增或更新，缓存最近一次供世界总览", async (t) => {
  const f = await fixture(t);
  assert.equal((await f.profile.summary({})).latest, null);
  const stats = await f.profile.stats({ sourceId: f.sourceId });
  assert.deepEqual(stats.zones, {
    input: { total: 2, changedThisWeek: 1 },
    mine: { total: 3, changedThisWeek: 2 },
    profile: { total: 2, changedThisWeek: 0 },
  });
  assert.equal(stats.sourceId, f.sourceId);
  assert.equal(stats.status, "complete");
  assert.ok(stats.files.every((file) => !("content" in file)));
  const { latest } = await f.profile.summary({});
  assert.deepEqual(latest.zones, stats.zones);
  assert.equal(latest.files, undefined, "世界总览摘要不携带文件清单");
  // 统计不写主库、不改 Vault。
  assert.equal(await f.revision(), 2);
  await f.unchanged();
});

test("规则保存到主库；新规则立即影响统计，越界规则与旧版本被拒绝", async (t) => {
  const f = await fixture(t);
  const saved = await f.profile.saveRules({
    rules: [
      { pattern: "项目/**", zone: "input" },
      { pattern: "GET NOTES/**", zone: "input" },
      { pattern: "个人上下文/**", zone: "profile" },
    ],
    sourceId: f.sourceId,
    expectedRevision: 2,
  });
  assert.equal(saved.knowledgeZones.rules.length, 3);
  assert.equal(saved.knowledgeZones.sourceId, f.sourceId);
  assert.equal(saved.knowledgeZones.profileSharing, false);
  const stats = await f.profile.stats({ sourceId: f.sourceId });
  assert.deepEqual(stats.zones.input, { total: 3, changedThisWeek: 1 });
  assert.deepEqual(stats.zones.mine, { total: 2, changedThisWeek: 2 });
  await rejects(
    f.profile.saveRules({ rules: [{ pattern: "../x/**", zone: "input" }], sourceId: null, expectedRevision: 3 }),
    400,
  );
  await rejects(
    f.profile.saveRules({ rules: [], sourceId: null, expectedRevision: 2 }),
    409,
  );
  await rejects(
    f.profile.saveRules({ rules: [], sourceId: "not-a-source", expectedRevision: 3 }),
    404,
  );
  await rejects(
    f.profile.saveRules({ rules: [], sourceId: null, expectedRevision: 3, extra: 1 }),
    400,
  );
  await f.unchanged();
});

test("read_profile：未开启共享时拒绝；开启后返回个人说明各文件正文，带大小上限", async (t) => {
  const f = await fixture(t);
  await rejects(f.profile.readProfile({}), 403, /尚未允许/);
  await rejects(f.profile.setSharing({ enabled: true, confirmed: false, expectedRevision: 2 }), 400);
  await f.share();
  const result = await f.profile.readProfile({});
  assert.deepEqual(
    result.files.map((file) => file.path),
    ["个人上下文/关于我.md", "个人上下文/沟通.md"],
  );
  assert.equal(result.files[0].content, PROFILE_ABOUT);
  assert.match(result.files[0].sha256, /^[a-f0-9]{64}$/);
  assert.equal(result.files[0].truncated, false);
  assert.ok(result.limits.maxFileChars > 0 && result.limits.maxTotalChars > 0);
  const single = await f.profile.readProfile({ path: "个人上下文/沟通.md" });
  assert.deepEqual(single.files.map((file) => file.path), ["个人上下文/沟通.md"]);
  // 超过单篇上限的正文被截断并标注，不整篇返回。
  await writeFile(join(f.root, "个人上下文", "长文.md"), "长".repeat(40000));
  const long = await f.profile.readProfile({ path: "个人上下文/长文.md" });
  assert.equal(long.files[0].truncated, true);
  assert.equal(long.files[0].content.length, long.limits.maxFileChars);
  const all = await f.profile.readProfile({});
  assert.ok(all.files.reduce((n, file) => n + file.content.length, 0) <= all.limits.maxTotalChars);
  await rm(join(f.root, "个人上下文", "长文.md"));
  await f.unchanged();
});

test("read_profile 与 propose 拒绝个人说明以外的路径与越界路径", async (t) => {
  const f = await fixture(t);
  await f.share();
  const outside = [
    "决定/方法A.md",
    "个人上下文副本/草稿.md",
    "../合成Vault/个人上下文/关于我.md",
    "个人上下文/../决定/方法A.md",
    "/etc/passwd",
    "个人上下文/关于我.txt",
    "个人上下文/.hidden.md",
    "个人上下文\\关于我.md",
    "",
    42,
  ];
  for (const path of outside) {
    await assert.rejects(f.profile.readProfile({ path }), (e) => [400, 403].includes(e.status), String(path));
    await assert.rejects(f.profile.propose(change({ path })), (e) => [400, 403].includes(e.status), String(path));
  }
  await rejects(f.profile.readProfile({ path: "个人上下文/关于我.md", extra: 1 }), 400);
  assert.deepEqual((await f.repository.read()).profileProposals || [], []);
  await f.unchanged();
});

test("propose_profile_change：输入校验、原段落核对，只写主库待处理队列不写 Vault", async (t) => {
  const f = await fixture(t);
  await rejects(f.profile.propose(change()), 403, /尚未允许/);
  await f.share();
  const invalid = [
    change({ original: "" }),
    change({ proposed: "" }),
    change({ proposed: "结论先行。" }),
    change({ reason: "" }),
    change({ reason: "x".repeat(1001) }),
    change({ proposed: "x".repeat(4001) }),
    change({ proposer: "" }),
    change({ proposer: "多\n行" }),
    change({ extra: true }),
    { path: "个人上下文/关于我.md" },
    null,
  ];
  for (const input of invalid)
    await rejects(f.profile.propose(input), 400, undefined);
  await rejects(f.profile.propose(change({ original: "文件里没有这段" })), 409, /原段落/);
  await rejects(f.profile.propose(change({ path: "个人上下文/不存在.md" })), 404);
  const created = await f.profile.propose(change());
  assert.equal(created.status, "pending");
  const stored = (await f.repository.read()).profileProposals;
  assert.equal(stored.length, 1);
  assert.equal(stored[0].id, created.id);
  assert.equal(stored[0].proposer, "Claude Code");
  assert.equal(stored[0].sourceId, f.sourceId);
  assert.match(stored[0].baseSha256, /^[a-f0-9]{64}$/);
  await f.unchanged();
});

test("采纳：预览差异→确认，只记录确认结果；文件在预览后变化则拒绝；拒绝为单向决定", async (t) => {
  const f = await fixture(t);
  await f.share();
  const first = await f.profile.propose(change());
  const second = await f.profile.propose(
    change({ original: "我在合成公司负责 AI 流程。", proposed: "我负责 AI 流程重构。", proposer: "Codex" }),
  );
  const preview = await f.profile.preview({ id: first.id });
  assert.equal(preview.path, "个人上下文/关于我.md");
  assert.equal(preview.before, PROFILE_ABOUT);
  assert.equal(preview.after, PROFILE_ABOUT.replace("结论先行。", "结论先行，零寒暄。"));
  assert.equal(preview.baseChanged, false);
  assert.match(preview.previewId, /^[a-f0-9-]{36}$/);
  await rejects(f.profile.confirm({ previewId: preview.previewId, confirmed: false, expectedRevision: await f.revision() }), 400);
  await rejects(f.profile.confirm({ previewId: "0".repeat(36), confirmed: true, expectedRevision: await f.revision() }), 409);
  const confirmed = await f.profile.confirm({
    previewId: preview.previewId,
    confirmed: true,
    expectedRevision: await f.revision(),
  });
  const record = confirmed.profileProposals.find((p) => p.id === first.id);
  assert.equal(record.status, "confirmed");
  assert.equal(record.confirmation.write, "awaiting_local");
  assert.equal(record.confirmation.resultSha256, createHash("sha256").update(preview.after).digest("hex"));
  // 同一预览不能重复确认；已决定的建议不能再预览或拒绝。
  await rejects(f.profile.confirm({ previewId: preview.previewId, confirmed: true, expectedRevision: await f.revision() }), 409);
  await rejects(f.profile.preview({ id: first.id }), 409);
  await rejects(f.profile.reject({ id: first.id, expectedRevision: await f.revision() }), 409);
  await f.unchanged();

  // 预览之后文件被改动：确认被拒绝，需要重新预览。
  const again = await f.profile.preview({ id: second.id });
  await writeFile(join(f.root, "个人上下文", "关于我.md"), PROFILE_ABOUT + "\n补充。\n");
  await rejects(
    f.profile.confirm({ previewId: again.previewId, confirmed: true, expectedRevision: await f.revision() }),
    409,
    /重新预览/,
  );
  const fresh = await f.profile.preview({ id: second.id });
  assert.equal(fresh.baseChanged, true, "提出建议后文件已变化要明示");
  const rejected = await f.profile.reject({ id: second.id, expectedRevision: await f.revision() });
  assert.equal(rejected.profileProposals.find((p) => p.id === second.id).status, "rejected");
  await rejects(f.profile.reject({ id: second.id, expectedRevision: await f.revision() }), 409);
});

test("MCP 工具：initialize、tools/list 与两个工具的 schema，未知工具与非法参数", async (t) => {
  const f = await fixture(t);
  assert.deepEqual(PROFILE_TOOLS.map((tool) => tool.name), ["read_profile", "propose_profile_change"]);
  const propose = PROFILE_TOOLS[1];
  assert.deepEqual(propose.inputSchema.required, ["path", "original", "proposed", "reason", "proposer"]);
  assert.equal(propose.inputSchema.additionalProperties, false);
  const init = await handleMcp(f.profile, {
    jsonrpc: "2.0",
    id: 1,
    method: "initialize",
    params: { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "测试", version: "0" } },
  });
  assert.equal(init.result.protocolVersion, "2025-06-18");
  assert.ok(init.result.capabilities.tools);
  assert.equal(init.result.serverInfo.name, "workbench-profile");
  assert.equal(await handleMcp(f.profile, { jsonrpc: "2.0", method: "notifications/initialized" }), null);
  const list = await handleMcp(f.profile, { jsonrpc: "2.0", id: 2, method: "tools/list" });
  assert.deepEqual(list.result.tools.map((tool) => tool.name), ["read_profile", "propose_profile_change"]);
  const unknown = await handleMcp(f.profile, {
    jsonrpc: "2.0",
    id: 3,
    method: "tools/call",
    params: { name: "write_vault", arguments: {} },
  });
  assert.equal(unknown.error.code, -32602);
  const method = await handleMcp(f.profile, { jsonrpc: "2.0", id: 4, method: "resources/list" });
  assert.equal(method.error.code, -32601);
  const denied = await handleMcp(f.profile, {
    jsonrpc: "2.0",
    id: 5,
    method: "tools/call",
    params: { name: "read_profile", arguments: {} },
  });
  assert.equal(denied.result.isError, true);
  assert.match(denied.result.content[0].text, /尚未允许/);
  await f.share();
  const read = await handleMcp(f.profile, {
    jsonrpc: "2.0",
    id: 6,
    method: "tools/call",
    params: { name: "read_profile", arguments: {} },
  });
  assert.equal(read.result.isError, false);
  assert.match(read.result.content[0].text, /关于我/);
  assert.equal(read.result.structuredContent.files.length, 2);
  const outside = await handleMcp(f.profile, {
    jsonrpc: "2.0",
    id: 7,
    method: "tools/call",
    params: { name: "propose_profile_change", arguments: change({ path: "决定/方法A.md" }) },
  });
  assert.equal(outside.result.isError, true);
  const proposed = await handleMcp(f.profile, {
    jsonrpc: "2.0",
    id: 8,
    method: "tools/call",
    params: { name: "propose_profile_change", arguments: change() },
  });
  assert.equal(proposed.result.isError, false);
  assert.match(proposed.result.content[0].text, /待处理/);
  assert.equal((await f.repository.read()).profileProposals.length, 1);
  const bad = await handleMcp(f.profile, { jsonrpc: "1.0", id: 9, method: "tools/list" });
  assert.equal(bad.error.code, -32600);
  await f.unchanged();
});

test("MCP HTTP 只监听 127.0.0.1，拒绝跨站来源与错误 Host，只接受 POST JSON", async (t) => {
  const f = await fixture(t);
  const mcp = await startProfileMcp({ profile: f.profile, port: 0 });
  t.after(() => mcp.close());
  assert.equal(mcp.address, "127.0.0.1");
  assert.match(mcp.url, /^http:\/\/127\.0\.0\.1:\d+\/mcp$/);
  const post = (body, headers = {}) =>
    fetch(mcp.url, {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/json, text/event-stream", ...headers },
      body: typeof body === "string" ? body : JSON.stringify(body),
    });
  const ok = await post({ jsonrpc: "2.0", id: 1, method: "tools/list" });
  assert.equal(ok.status, 200);
  assert.equal((await ok.json()).result.tools.length, 2);
  assert.equal((await post({ jsonrpc: "2.0", method: "notifications/initialized" })).status, 202);
  assert.equal((await post({ jsonrpc: "2.0", id: 1, method: "tools/list" }, { origin: "https://evil.example" })).status, 403);
  assert.equal((await fetch(mcp.url, { method: "GET" })).status, 405);
  assert.equal((await post("{bad json")).status, 400);
  assert.equal((await post({ jsonrpc: "2.0", id: 1, method: "tools/list" }, { "content-type": "text/plain" })).status, 415);
  const port = new URL(mcp.url).port;
  const wrongHost = await new Promise((resolve, reject) => {
    import("node:http").then(({ request }) => {
      const req = request(
        { host: "127.0.0.1", port, path: "/mcp", method: "POST", headers: { host: "evil.example", "content-type": "application/json" } },
        (res) => resolve(res.statusCode),
      );
      req.on("error", reject);
      req.end(JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" }));
    });
  });
  assert.equal(wrongHost, 403);
  assert.equal((await fetch(mcp.url.replace("/mcp", "/other"), { method: "POST" })).status, 404);
  await f.unchanged();
});

test("工作台 HTTP：三区与个人说明接口继承会话门禁；通用保存不能开启共享或伪造建议", async (t) => {
  const base = await mkdtemp(join(tmpdir(), "guiji-profile-http-"));
  const root = await syntheticVault(base);
  const app = await startServer({
    directory: join(base, "data"),
    port: 0,
    mcpPort: 0,
    discovery: { defaultRoots: () => [join(base, "projects")] },
  });
  t.after(async () => {
    await app.close();
    await rm(base, { recursive: true, force: true });
  });
  const session = await (
    await fetch(app.url + "/api/session", { headers: { "X-Workbench-Client": "1" } })
  ).json();
  const headers = { "Content-Type": "application/json", "X-Workbench-Token": session.token };
  const call = async (path, data, custom = headers) => {
    const response = await fetch(app.url + "/api/" + path, {
      method: "POST",
      headers: custom,
      body: stringify(data),
    });
    return { status: response.status, body: parse(await response.text()) };
  };
  let state = await app.repository.write(seed(), { initialize: true });
  const connected = await call("knowledge/connect", {
    name: "合成 Vault",
    kind: "obsidian",
    root,
    confirmed: true,
    expectedRevision: state.revision,
  });
  const sourceId = connected.body.connections.knowledgeSources[0].id;
  assert.equal((await call("knowledge/zones/stats", { sourceId }, { "Content-Type": "application/json" })).status, 403);
  const stats = await call("knowledge/zones/stats", { sourceId });
  assert.equal(stats.status, 200);
  assert.equal(stats.body.zones.mine.total, 3);
  const summary = await call("knowledge/zones/summary", {});
  assert.equal(summary.body.latest.zones.mine.changedThisWeek, 2);
  assert.match(summary.body.mcp.url, /^http:\/\/127\.0\.0\.1:\d+\/mcp$/);
  state = (await call("knowledge/profile/sharing", { enabled: true, confirmed: true, expectedRevision: connected.body.revision })).body;
  assert.equal(state.knowledgeZones.profileSharing, true);
  // 通用保存：带着伪造的建议或关闭/开启共享都会被拒绝。
  const forged = await fetch(app.url + "/api/workspace", {
    method: "PUT",
    headers,
    body: stringify({ state: { ...state, knowledgeZones: { ...state.knowledgeZones, profileSharing: false } } }),
  });
  assert.equal(forged.status, 400);
  // 通过 MCP 提交建议，再经工作台预览与确认。
  const rpc = await fetch(summary.body.mcp.url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: "propose_profile_change", arguments: change() } }),
  });
  const proposal = (await rpc.json()).result.structuredContent;
  const preview = await call("knowledge/profile/proposals/preview", { id: proposal.id });
  assert.equal(preview.status, 200);
  const latest = await app.repository.read();
  const confirmed = await call("knowledge/profile/proposals/confirm", {
    previewId: preview.body.previewId,
    confirmed: true,
    expectedRevision: latest.revision,
  });
  assert.equal(confirmed.status, 200);
  assert.equal(confirmed.body.profileProposals[0].status, "confirmed");
  assert.equal(await readFile(join(root, "个人上下文", "关于我.md"), "utf8"), PROFILE_ABOUT);
});
