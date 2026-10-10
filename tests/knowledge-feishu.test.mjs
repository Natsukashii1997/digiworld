import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { openRepository } from "../server/repository.mjs";
import { createKnowledgeFiles } from "../server/knowledge-files.mjs";
import { createFeishuKnowledgeFiles, createKnowledgeFileDispatch, feishuPrincipalIdentity, principalFromWhoami, wikiTokenFromInput } from "../server/knowledge-feishu.mjs";
import { createFeishuConnections } from "../server/knowledge-feishu-connections.mjs";
import { createPolicyKnowledgeFiles } from "../server/knowledge-access-policy.mjs";
import { createKnowledgeAccess } from "../server/knowledge-access.mjs";
import { createKnowledgeProfile, vaultSource } from "../server/knowledge-profile.mjs";
import { seed } from "../src/store.js";
import { DEFAULT_ZONE_RULES } from "../src/knowledge-zones.js";

const space = "7160145948494381236";
const ROOT = "wikcnRoot12345", A = "wikcnChildA12345", B = "wikcnChildB12345";
const APP = "cli_aacf58ab61b85beb";
test("飞书身份绑定只接受预期应用与本人用户，保存哈希不保存 openId", () => {
  const who = { profile:"codex", appId:APP, identity:"user", available:true,
    onBehalfOf:{ openId:"ou_synthetic_user_A" } };
  assert.equal(principalFromWhoami(who), feishuPrincipalIdentity(APP, who.onBehalfOf.openId));
  for (const changed of [
    { ...who, appId:"cli_other" },
    { ...who, profile:"other" },
    { ...who, identity:"bot" },
  ]) assert.throws(() => principalFromWhoami(changed), (error) => error.code === "FEISHU_WRONG_IDENTITY");
  assert.throws(() => principalFromWhoami({ ...who, available:false, tokenStatus:"missing" }),
    (error) => error.code === "FEISHU_AUTH_REQUIRED");
  assert.throws(() => principalFromWhoami({ ...who, available:false, tokenStatus:"error" }),
    (error) => error.code === "FEISHU_UNAVAILABLE");
  assert.throws(() => principalFromWhoami({ ...who, onBehalfOf:{} }),
    (error) => error.code === "FEISHU_INCOMPLETE");
});
test("只接受飞书 Wiki HTTPS 链接或显式节点 token，任意网页不能伪装来源", () => {
  assert.equal(wikiTokenFromInput(`https://tenant.feishu.cn/wiki/${ROOT}`), ROOT);
  assert.equal(wikiTokenFromInput(`https://tenant.larksuite.com/wiki/${ROOT}`), ROOT);
  assert.equal(wikiTokenFromInput(ROOT), ROOT);
  for (const input of [
    `https://feishu.cn.evil.test/wiki/${ROOT}`,
    `http://tenant.feishu.cn/wiki/${ROOT}`,
    `https://tenant.feishu.cn/docx/${ROOT}`,
    `https://person@tenant.feishu.cn/wiki/${ROOT}`,
  ]) assert.throws(() => wikiTokenFromInput(input), (error) => error.code === "FEISHU_INVALID_SCOPE");
});
function fake() {
  const nodes = new Map([
    [ROOT, { space_id:space, node_token:ROOT, obj_token:"docxRoot12345", obj_type:"docx", node_type:"origin", parent_node_token:"", title:"根文档", has_child:true, obj_edit_time:"1700000000" }],
    [A, { space_id:space, node_token:A, obj_token:"docxChildA12345", obj_type:"docx", node_type:"origin", parent_node_token:ROOT, title:"同名文档", has_child:false, obj_edit_time:"1700000001" }],
    [B, { space_id:space, node_token:B, obj_token:"docxChildB12345", obj_type:"docx", node_type:"origin", parent_node_token:ROOT, title:"同名文档", has_child:false, obj_edit_time:"1700000002" }],
    ["wikcnOutside12345", { space_id:space, node_token:"wikcnOutside12345", obj_token:"docxOutside12345", obj_type:"docx", node_type:"origin", parent_node_token:"", title:"范围外", has_child:false }],
  ]);
  const content = new Map([
    ["docxRoot12345", "根文档 合成接力"],
    ["docxChildA12345", "同名 A 合成接力"],
    ["docxChildB12345", "同名 B 合成接力"],
  ]);
  const calls = [];
  let error = null, gate = null, onFetch = null, onNodeGet = null, pageHook = null;
  let principalHash = feishuPrincipalIdentity(APP, "ou_synthetic_user_A");
  async function cli(args) {
    calls.push(args);
    if (error) throw error;
    if (args[0] === "wiki" && args[1] === "+node-get") {
      const node = nodes.get(args[args.indexOf("--node-token") + 1]);
      if (!node) throw Object.assign(new Error("合成节点不存在"), { status:404, code:"FEISHU_SCOPE_MISSING" });
      if (onNodeGet) onNodeGet(args, node);
      return { ...node };
    }
    if (args[0] === "wiki" && args[1] === "+node-list") {
      const parent = args[args.indexOf("--parent-node-token") + 1];
      if (pageHook) return pageHook(parent);
      return { nodes:[...nodes.values()].filter((node) => node.parent_node_token === parent).map((node) => ({ ...node })), has_more:false, page_token:"" };
    }
    if (args[0] === "docs" && args[1] === "+fetch") {
      if (onFetch) onFetch();
      if (gate) await gate;
      const text = content.get(args[args.indexOf("--doc") + 1]);
      return { document:{ content:text } };
    }
    throw new Error("unexpected synthetic command");
  }
  return { cli, nodes, content, calls, principal:async () => principalHash,
    setPrincipal(value) { principalHash = value; }, setError(value) { error = value; },
    setGate(value, entered) { gate = value; onFetch = entered; }, setPageHook(value) { pageHook = value; },
    setNodeHook(value) { onNodeGet = value; } };
}

async function setup(t) {
  const directory = await mkdtemp(join(tmpdir(), "guiji-feishu-"));
  const repo = await openRepository(directory);
  await repo.write(seed(), { initialize:true });
  t.after(async () => { await repo.close(); await rm(directory, { recursive:true, force:true }); });
  const remote = fake();
  const provider = createFeishuKnowledgeFiles({ cli:remote.cli, principal:remote.principal });
  const files = createPolicyKnowledgeFiles(repo, createKnowledgeFileDispatch(createKnowledgeFiles(), provider));
  const connections = createFeishuConnections(repo, { provider });
  const access = createKnowledgeAccess(repo, { files });
  const profile = createKnowledgeProfile(repo, { files });
  const connect = async () => {
    const state = await connections.connect({ name:"合成飞书", wikiUrl:`https://feishu.cn/wiki/${ROOT}`,
      confirmed:true, expectedRevision:(await repo.read()).revision });
    return state.connections.knowledgeSources.find((source) => source.kind === "feishu");
  };
  const verify = async (source) => connections.verify({ sourceId:source.id, confirmed:true, expectedRevision:(await repo.read()).revision });
  return { repo, remote, provider, files, connections, access, profile, connect, verify };
}

test("飞书先登记指针再核验；未核验和默认关闭的 Agent 不读取账号或正文", async (t) => {
  const f = await setup(t);
  const source = await f.connect();
  assert.equal(f.remote.calls.length, 0);
  assert.equal(source.feishuSpaceId, null);
  assert.equal(source.feishuPrincipalHash, null);
  assert.equal(source.agentSharing, false);
  assert.equal(vaultSource(await f.repo.read()), null);
  await assert.rejects(f.profile.saveRules({ rules:DEFAULT_ZONE_RULES,
    sourceId:source.id, expectedRevision:(await f.repo.read()).revision }), /本机知识源/);
  let found = await f.access.searchAll({ query:"接力" }, { audience:"user" });
  assert.equal(found.status, "partial");
  assert.equal(found.coverage[0].code, "FEISHU_NEEDS_VERIFICATION");
  assert.equal(found.results.length, 0);
  assert.equal(f.remote.calls.length, 0);
  found = await f.access.searchAll({ query:"接力" }, { audience:"agent" });
  assert.equal(found.totalSources, 0);
  assert.equal(f.remote.calls.length, 0);
  const stored = JSON.stringify(await f.repo.read());
  assert.ok(!stored.includes("合成接力"));
  assert.ok(!stored.includes("docxRoot12345"));
  await f.verify(source);
  const verified = (await f.repo.read()).connections.knowledgeSources.find((item) => item.id === source.id);
  assert.equal(verified.feishuSpaceId, space);
  assert.equal(verified.feishuPrincipalHash, feishuPrincipalIdentity(APP, "ou_synthetic_user_A"));
  assert.equal(verified.agentSharing, false);
  assert.ok(verified.feishuVerifiedAt);
  assert.ok(!JSON.stringify(await f.repo.read()).includes("ou_synthetic_user_A"));
});

test("文档 token 即使被飞书解析成 Wiki 节点，也不能升格为已核验范围", async (t) => {
  const f = await setup(t);
  const alias = "docxAlias12345";
  f.remote.nodes.set(alias, { ...f.remote.nodes.get(ROOT) });
  const state = await f.connections.connect({ name:"错误文档 token", wikiUrl:alias,
    confirmed:true, expectedRevision:(await f.repo.read()).revision });
  const source = state.connections.knowledgeSources.find((item) => item.kind === "feishu");
  await assert.rejects(f.verify(source), (error) => error.code === "FEISHU_INVALID_SCOPE");
  const stored = (await f.repo.read()).connections.knowledgeSources.find((item) => item.id === source.id);
  assert.equal(stored.feishuSpaceId, null);
  assert.equal(stored.agentSharing, false);
});

test("已核验飞书 Docx 与本机共用跨源结构，同名用节点指针区分，MCP 独立开放", async (t) => {
  const f = await setup(t);
  const source = await f.connect();
  await f.verify(source);
  let found = await f.access.searchAll({ query:"合成接力" }, { audience:"user" });
  assert.equal(found.status, "complete");
  assert.equal(found.results.length, 3);
  assert.equal(new Set(found.results.map((row) => row.path)).size, 3);
  assert.equal(found.results.filter((row) => row.title === "同名文档").length, 2);
  const row = found.results.find((item) => item.path === `${A}.md`);
  assert.equal(row.sourceKind, "feishu");
  assert.equal(row.displayPath, "根文档 / 同名文档");
  const read = await f.access.readNote({ sourceId:source.id, path:row.path, expectedSha256:row.sha256 }, { audience:"user" });
  assert.equal(read.content, "同名 A 合成接力");
  assert.equal((await f.access.searchAll({ query:"合成接力" }, { audience:"agent" })).totalSources, 0);
  let state = await f.repo.read();
  await f.access.setPolicy({ sourceId:source.id, agentSharing:true, excludedFolders:[], confirmed:true, expectedRevision:state.revision });
  found = await f.access.searchAll({ query:"合成接力" }, { audience:"agent" });
  assert.equal(found.results.length, 3);
  assert.ok(!JSON.stringify(found).includes("feishu://wiki"));
  state = await f.repo.read();
  assert.ok(!JSON.stringify(state).includes("合成接力"));
  assert.ok(!JSON.stringify(state).includes("docxChildA12345"));
  await assert.rejects(f.access.setPolicy({ sourceId:source.id, agentSharing:true,
    excludedFolders:["folder"], confirmed:true, expectedRevision:state.revision }), /更小的 Wiki 节点范围/);
});

test("飞书分页未尽、快捷方式与未支持类型仅报部分覆盖；撤权或移出子树不泄露原文", async (t) => {
  const f = await setup(t);
  const source = await f.connect();
  await f.verify(source);
  const row = (await f.access.searchAll({ query:"接力" }, { audience:"user" })).results.find((item) => item.path === `${A}.md`);
  f.remote.nodes.set("wikcnShortcut12345", { space_id:space, node_token:"wikcnShortcut12345", obj_token:"docxOutside12345", obj_type:"docx", node_type:"shortcut", parent_node_token:ROOT, title:"外部快捷方式", has_child:false });
  f.remote.nodes.set("wikcnSheet12345", { space_id:space, node_token:"wikcnSheet12345", obj_token:"sheet123456789", obj_type:"sheet", node_type:"origin", parent_node_token:ROOT, title:"未支持表格", has_child:false });
  let partial = await f.access.searchAll({ query:"接力" }, { audience:"user" });
  assert.equal(partial.status, "partial");
  assert.equal(partial.coverage[0].scanStatus, "partial");
  assert.equal(partial.results.length, 3);
  f.remote.setPageHook((parent) => parent === ROOT
    ? { nodes:[{ ...f.remote.nodes.get(A) }], has_more:true, page_token:"" }
    : { nodes:[], has_more:false, page_token:"" });
  partial = await f.access.searchAll({ query:"接力" }, { audience:"user" });
  assert.equal(partial.status, "partial");
  assert.equal(partial.coverage[0].scanStatus, "partial");
  f.remote.setPageHook(null);
  f.remote.nodes.get(A).parent_node_token = "wikcnOutside12345";
  await assert.rejects(f.access.readNote({ sourceId:source.id, path:row.path, expectedSha256:row.sha256 }, { audience:"user" }),
    (error) => error.status === 403 && error.code === "FEISHU_OUT_OF_SCOPE");
  f.remote.nodes.get(A).parent_node_token = ROOT;
  f.remote.setError(Object.assign(new Error("synthetic deny"), { status:403, code:"FEISHU_PERMISSION_DENIED" }));
  await assert.rejects(f.access.searchAll({ query:"接力" }, { audience:"user" }),
    (error) => error.status === 409);
  assert.equal((await f.repo.read()).connections.knowledgeSources.find((item) => item.id === source.id).agentSharing, false);
});

test("节点元数据返回前换人，首次核验不得保存混合身份", async (t) => {
  const f = await setup(t);
  const source = await f.connect();
  f.remote.setNodeHook(() => f.remote.setPrincipal(feishuPrincipalIdentity(APP, "ou_synthetic_user_B")));
  await assert.rejects(f.verify(source), (error) => error.code === "FEISHU_WRONG_IDENTITY");
  const stored = (await f.repo.read()).connections.knowledgeSources.find((item) => item.id === source.id);
  assert.equal(stored.feishuSpaceId, null);
  assert.equal(stored.feishuPrincipalHash, null);
});

test("返回前根节点同名但用户身份变化，移除旧检索结果并撤销 Agent 授权", async (t) => {
  const f = await setup(t);
  const source = await f.connect();
  await f.verify(source);
  let state = await f.repo.read();
  await f.access.setPolicy({ sourceId:source.id, agentSharing:true, excludedFolders:[], confirmed:true,
    expectedRevision:state.revision });
  const original = f.provider.inspectRoot;
  const switched = createPolicyKnowledgeFiles(f.repo, createKnowledgeFileDispatch(createKnowledgeFiles(), {
    ...f.provider,
    inspectRoot:async (root) => ({ ...await original(root), principalHash:feishuPrincipalIdentity(APP, "ou_synthetic_user_B") }),
  }));
  const active = (await f.repo.read()).connections.knowledgeSources.find((item) => item.id === source.id);
  await assert.rejects(switched.verifyRoot(active), (error) => error.code === "KNOWLEDGE_ROOT_IDENTITY_CHANGED");
  state = await f.repo.read();
  assert.equal(state.connections.knowledgeSources.find((item) => item.id === source.id).agentSharing, false);
  assert.equal(state.connections.knowledgeSourceHealth.find((item) => item.sourceId === source.id).status, "needs_reconfirmation");
});

test("已开放源在根节点读取期间换人，恢复原用户仍保持撤权", async (t) => {
  const f = await setup(t);
  const source = await f.connect();
  await f.verify(source);
  let state = await f.repo.read();
  await f.access.setPolicy({ sourceId:source.id, agentSharing:true, excludedFolders:[], confirmed:true,
    expectedRevision:state.revision });
  f.remote.setNodeHook(() => f.remote.setPrincipal(feishuPrincipalIdentity(APP, "ou_synthetic_user_B")));
  await assert.rejects(f.access.searchAll({ query:"接力" }, { audience:"agent" }),
    (error) => error.status === 409);
  state = await f.repo.read();
  assert.equal(state.connections.knowledgeSources.find((item) => item.id === source.id).agentSharing, false);
  f.remote.setNodeHook(null);
  f.remote.setPrincipal(feishuPrincipalIdentity(APP, "ou_synthetic_user_A"));
  assert.equal((await f.access.searchAll({ query:"接力" }, { audience:"agent" })).totalSources, 0);
});

test("文档已返回但末次祖先节点回读换人，原文不得交付", async (t) => {
  const f = await setup(t);
  const source = await f.connect();
  await f.verify(source);
  const row = (await f.access.searchAll({ query:"接力" }, { audience:"user" })).results.find((item) => item.path === `${A}.md`);
  const state = await f.repo.read();
  await f.access.setPolicy({ sourceId:source.id, agentSharing:true, excludedFolders:[], confirmed:true,
    expectedRevision:state.revision });
  let afterFetch = false, rootReads = 0;
  f.remote.setGate(null, () => { afterFetch = true; });
  f.remote.setNodeHook((args) => {
    if (!afterFetch || args[args.indexOf("--node-token") + 1] !== ROOT) return;
    if (++rootReads === 2) f.remote.setPrincipal(feishuPrincipalIdentity(APP, "ou_synthetic_user_B"));
  });
  await assert.rejects(f.access.readNote({ sourceId:source.id, path:row.path,
    expectedSha256:row.sha256 }, { audience:"agent" }), (error) => error.code === "FEISHU_WRONG_IDENTITY");
  assert.equal(rootReads, 2);
  assert.equal((await f.repo.read()).connections.knowledgeSources.find((item) => item.id === source.id).agentSharing, false);
  f.remote.setNodeHook(null);
  f.remote.setGate(null, null);
  f.remote.setPrincipal(feishuPrincipalIdentity(APP, "ou_synthetic_user_A"));
  assert.equal((await f.access.searchAll({ query:"接力" }, { audience:"agent" })).totalSources, 0);
});

test("明确撤销授权或资源权限后持久关闭 Agent；瞬时不可用只标未知", async (t) => {
  for (const code of ["FEISHU_AUTH_REQUIRED", "FEISHU_PERMISSION_DENIED", "FEISHU_UNAVAILABLE"]) {
    const f = await setup(t);
    const source = await f.connect();
    await f.verify(source);
    let state = await f.repo.read();
    await f.access.setPolicy({ sourceId:source.id, agentSharing:true, excludedFolders:[], confirmed:true,
      expectedRevision:state.revision });
    f.remote.setError(Object.assign(new Error("synthetic"), { status:code === "FEISHU_PERMISSION_DENIED" ? 403 : 503, code }));
    if (code === "FEISHU_UNAVAILABLE") {
      const result = await f.access.searchAll({ query:"接力" }, { audience:"user" });
      assert.equal(result.status, "partial");
      assert.equal(result.results.length, 0);
    } else {
      await assert.rejects(f.access.searchAll({ query:"接力" }, { audience:"user" }),
        (error) => error.status === 409);
    }
    state = await f.repo.read();
    assert.equal(state.connections.knowledgeSources.find((item) => item.id === source.id).agentSharing,
      code === "FEISHU_UNAVAILABLE");
    f.remote.setError(null);
    assert.equal((await f.access.searchAll({ query:"接力" }, { audience:"agent" })).totalSources,
      code === "FEISHU_UNAVAILABLE" ? 1 : 0);
  }
});

test("节点类型或对象类型缺失时保持未知，不读取正文", async (t) => {
  const f = await setup(t);
  const source = await f.connect();
  await f.verify(source);
  for (const missing of ["node_type", "obj_type", "has_child"]) {
    const unsafe = { ...f.remote.nodes.get(A), obj_token:"docxOutside12345" };
    delete unsafe[missing];
    f.remote.setPageHook(() => ({ nodes:[unsafe], has_more:false, page_token:"" }));
    const before = f.remote.calls.filter((args) => args[0] === "docs").length;
    const result = await f.access.searchAll({ query:"接力" }, { audience:"user" });
    assert.equal(result.status, "partial");
    assert.equal(result.coverage[0].status, "failed");
    assert.equal(result.results.length, 0);
    assert.equal(f.remote.calls.filter((args) => args[0] === "docs").length, before);
  }
});

test("Docx 降级提示不冒充完整正文；CLI 换人后永久关闭旧 Agent 授权", async (t) => {
  const f = await setup(t);
  const source = await f.connect();
  await f.verify(source);
  let state = await f.repo.read();
  await f.access.setPolicy({ sourceId:source.id, agentSharing:true, excludedFolders:[],
    confirmed:true, expectedRevision:state.revision });
  f.remote.content.set("docxChildA12345", "正文但降级");
  const originalCli = f.remote.cli;
  const degraded = createFeishuKnowledgeFiles({ principal:f.remote.principal, cli:async (args) =>
    args[0] === "docs" ? { document:{ content:"正文但降级", tips:"合成降级提示" } } : originalCli(args) });
  const guarded = createPolicyKnowledgeFiles(f.repo,
    createKnowledgeFileDispatch(createKnowledgeFiles(), degraded));
  const queried = await createKnowledgeAccess(f.repo, { files:guarded }).searchAll({ query:"正文但降级" }, { audience:"user" });
  assert.equal(queried.status, "partial");
  assert.equal(queried.coverage[0].status, "failed");
  assert.equal(queried.results.length, 0);
  f.remote.setPrincipal(feishuPrincipalIdentity(APP, "ou_synthetic_user_B"));
  await assert.rejects(f.access.searchAll({ query:"接力" }, { audience:"agent" }), (error) => error.status === 409);
  state = await f.repo.read();
  assert.equal(state.connections.knowledgeSources.find((item) => item.id === source.id).agentSharing, false);
  assert.equal(state.connections.knowledgeSourceHealth.find((item) => item.sourceId === source.id).status, "needs_reconfirmation");
  f.remote.setPrincipal(feishuPrincipalIdentity(APP, "ou_synthetic_user_A"));
  assert.equal((await f.access.searchAll({ query:"接力" }, { audience:"agent" })).totalSources, 0);
});

test("飞书在途读取后权限撤销，结果不返回；通用状态写入不增加授权", async (t) => {
  const f = await setup(t);
  const source = await f.connect();
  await f.verify(source);
  const row = (await f.access.searchAll({ query:"接力" }, { audience:"user" })).results[0];
  let state = await f.repo.read();
  await f.access.setPolicy({ sourceId:source.id, agentSharing:true, excludedFolders:[], confirmed:true, expectedRevision:state.revision });
  let entered;
  const started = new Promise((resolve) => { entered = resolve; });
  let release;
  const gate = new Promise((resolve) => { release = resolve; });
  f.remote.setGate(gate, entered);
  const reading = f.access.readNote({ sourceId:source.id, path:row.path, expectedSha256:row.sha256 }, { audience:"agent" });
  await started;
  state = await f.repo.read();
  await f.access.setPolicy({ sourceId:source.id, agentSharing:false, excludedFolders:[], confirmed:true, expectedRevision:state.revision });
  release();
  await assert.rejects(reading, (error) => error.status === 409);
});
