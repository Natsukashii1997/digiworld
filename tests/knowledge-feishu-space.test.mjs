import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { openRepository } from "../server/repository.mjs";
import { createKnowledgeFiles } from "../server/knowledge-files.mjs";
import { createPolicyKnowledgeFiles } from "../server/knowledge-access-policy.mjs";
import { createKnowledgeAccess } from "../server/knowledge-access.mjs";
import {
  createFeishuKnowledgeFiles, createKnowledgeFileDispatch, feishuPrincipalIdentity,
  feishuSpaceIdentity, feishuSpaceRoot,
} from "../server/knowledge-feishu.mjs";
import { createFeishuConnections } from "../server/knowledge-feishu-connections.mjs";
import { seed } from "../src/store.js";

const SPACE = "7160145948494381236", OTHER = "7160145948494381237";
const A = "wikcnSpaceRootA12345", B = "wikcnSpaceRootB12345";
const CHILD = "wikcnSpaceChild12345", SHORTCUT = "wikcnSpaceShortcut12345";
const FILE = "wikcnSpaceFile12345";
const principalA = feishuPrincipalIdentity("cli_aacf58ab61b85beb", "ou_synthetic_space_A");
const principalB = feishuPrincipalIdentity("cli_aacf58ab61b85beb", "ou_synthetic_space_B");

async function fixture(t) {
  const directory = await mkdtemp(join(tmpdir(), "guiji-feishu-space-"));
  const repository = await openRepository(directory);
  await repository.write(seed(), { initialize:true });
  t.after(async () => { await repository.close(); await rm(directory, { recursive:true, force:true }); });
  const nodes = new Map([
    [A, { space_id:SPACE, node_token:A, obj_token:"docxSpaceA12345", obj_type:"docx", node_type:"origin", parent_node_token:"", title:"合成顶层 A", has_child:true }],
    [B, { space_id:SPACE, node_token:B, obj_token:"docxSpaceB12345", obj_type:"docx", node_type:"origin", parent_node_token:"", title:"合成顶层 B", has_child:false }],
    [CHILD, { space_id:SPACE, node_token:CHILD, obj_token:"docxSpaceChild12345", obj_type:"docx", node_type:"origin", parent_node_token:A, title:"合成子文档", has_child:false }],
    [SHORTCUT, { space_id:SPACE, node_token:SHORTCUT, obj_token:"docxSpaceOutside12345", obj_type:"docx", node_type:"shortcut", parent_node_token:A, title:"合成快捷方式", has_child:false }],
    [FILE, { space_id:SPACE, node_token:FILE, obj_token:"fileSpace12345", obj_type:"file", node_type:"origin", parent_node_token:A, title:"合成附件", has_child:false }],
  ]);
  const content = new Map([
    ["docxSpaceA12345", "合成空间 A 接力"],
    ["docxSpaceB12345", "合成空间 B 接力"],
    ["docxSpaceChild12345", "合成子文档 接力"],
  ]);
  const calls = [];
  let principalHash = principalA, listOverride = null, spaceOverride = null, afterCall = null;
  const cli = async (args) => {
    calls.push(args);
    let result;
    if (args[0] === "wiki" && args[1] === "spaces" && args[2] === "get")
      result = { space:spaceOverride || { space_id:args[args.indexOf("--space-id") + 1], name:"合成知识空间" } };
    else if (args[0] === "wiki" && args[1] === "+space-list")
      result = { spaces:[{ space_id:SPACE, name:"合成知识空间" }], has_more:false, page_token:"" };
    else if (args[0] === "wiki" && args[1] === "+node-get")
      result = { ...nodes.get(args[args.indexOf("--node-token") + 1]) };
    else if (args[0] === "wiki" && args[1] === "+node-list") {
      const parentAt = args.indexOf("--parent-node-token");
      const parent = parentAt < 0 ? "" : args[parentAt + 1];
      result = listOverride?.(parent) || { nodes:[...nodes.values()].filter((n) => n.parent_node_token === parent).map((n) => ({ ...n })), has_more:false, page_token:"" };
    } else if (args[0] === "docs" && args[1] === "+fetch")
      result = { document:{ content:content.get(args[args.indexOf("--doc") + 1]) } };
    else throw new Error("unexpected synthetic command");
    afterCall?.(args);
    return result;
  };
  const provider = createFeishuKnowledgeFiles({ cli, principal:async () => principalHash });
  const files = createPolicyKnowledgeFiles(repository,
    createKnowledgeFileDispatch(createKnowledgeFiles(), provider));
  const connections = createFeishuConnections(repository, { provider });
  const access = createKnowledgeAccess(repository, { files });
  const register = async () => {
    const state = await connections.connectSpace({ name:"合成知识空间", spaceId:SPACE,
      confirmed:true, expectedRevision:(await repository.read()).revision });
    return state.connections.knowledgeSources.find((s) => s.root === feishuSpaceRoot(SPACE));
  };
  const verify = async (source) => connections.verify({ sourceId:source.id,
    confirmed:true, expectedRevision:(await repository.read()).revision });
  return { repository, nodes, calls, provider, files, connections, access, register, verify,
    setPrincipal(v) { principalHash = v; }, setListOverride(v) { listOverride = v; },
    setSpaceOverride(v) { spaceOverride = v; },
    setAfterCall(v) { afterCall = v; } };
}

test("整个飞书空间先登记指针，核验后覆盖并列顶层和子树且默认不共享", async (t) => {
  const f = await fixture(t);
  const spaces = await f.provider.listSpaces();
  assert.deepEqual(spaces, { spaces:[{ spaceId:SPACE, name:"合成知识空间" }], partial:false });
  f.calls.length = 0;
  const pending = await f.register();
  assert.equal(f.calls.length, 0, "登记不访问飞书账号");
  assert.equal(pending.feishuSpaceId, null);
  assert.equal(pending.agentSharing, false);
  await f.verify(pending);
  const source = (await f.repository.read()).connections.knowledgeSources.find((s) => s.id === pending.id);
  assert.equal(source.feishuSpaceId, SPACE);
  assert.equal(source.identity, feishuSpaceIdentity(SPACE));
  assert.equal(source.agentSharing, false);
  const scan = await f.files.scan(source);
  assert.equal(scan.visited, 5);
  assert.equal(scan.files.length, 3);
  assert.equal(scan.skipped, 2);
  assert.equal(scan.status, "partial", "不支持类型和快捷方式须标示部分覆盖");
  assert.deepEqual(new Set(scan.files.map((row) => row.path)),
    new Set([`${A}.md`, `${B}.md`, `${A}/${CHILD}.md`]));
  const result = await f.access.searchAll({ query:"接力" }, { audience:"user" });
  assert.equal(result.results.length, 3);
  assert.equal(result.status, "partial");
  const child = result.results.find((row) => row.path === `${A}/${CHILD}.md`);
  assert.equal(child.displayPath, "合成顶层 A / 合成子文档");
  const read = await f.access.readNote({ sourceId:source.id, path:child.path,
    expectedSha256:child.sha256 }, { audience:"user" });
  assert.equal(read.content, "合成子文档 接力");
  assert.equal((await f.access.searchAll({ query:"接力" }, { audience:"agent" })).totalSources, 0);
  assert.ok(!JSON.stringify(await f.repository.read()).includes("合成子文档 接力"));
  assert.ok(!JSON.stringify(await f.repository.read()).includes("ou_synthetic_space_A"));
});

test("空间来源拒绝同空间第二份授权，跨空间/父链变化不交付原文", async (t) => {
  const f = await fixture(t);
  const source = await f.register();
  await f.verify(source);
  const state = await f.connections.connect({ name:"重复节点", wikiUrl:A,
    confirmed:true, expectedRevision:(await f.repository.read()).revision });
  const pending = state.connections.knowledgeSources.find((s) => s.name === "重复节点");
  await assert.rejects(f.verify(pending), (error) => error.status === 409);
  const active = (await f.repository.read()).connections.knowledgeSources.find((s) => s.id === source.id);
  f.nodes.get(CHILD).space_id = OTHER;
  await assert.rejects(f.files.current(active, `${A}/${CHILD}.md`),
    (error) => error.code === "FEISHU_OUT_OF_SCOPE");
  f.nodes.get(CHILD).space_id = SPACE;
  f.nodes.get(CHILD).parent_node_token = "wikcnSpaceOutside12345";
  await assert.rejects(f.files.current(active, `${A}/${CHILD}.md`),
    (error) => error.code === "FEISHU_OUT_OF_SCOPE" || error.code === "FEISHU_INCOMPLETE");
});

test("知识空间元数据返回其他空间时拒绝首次核验和后续扫描", async (t) => {
  const f = await fixture(t);
  const pending = await f.register();
  f.setSpaceOverride({ space_id:OTHER, name:"其他空间" });
  await assert.rejects(f.verify(pending), (error) => error.code === "FEISHU_SCOPE_CHANGED");
  assert.equal((await f.repository.read()).connections.knowledgeSources.find((s) => s.id === pending.id).feishuSpaceId, null);
  f.setSpaceOverride(null);
  await f.verify(pending);
  const active = (await f.repository.read()).connections.knowledgeSources.find((s) => s.id === pending.id);
  f.setSpaceOverride({ space_id:OTHER, name:"其他空间" });
  await assert.rejects(f.files.scan(active), (error) => error.code === "FEISHU_SCOPE_CHANGED");
});

test("空间分页不完整为未知；换人后已开放来源持久撤权", async (t) => {
  const f = await fixture(t);
  const source = await f.register();
  await f.verify(source);
  const active = (await f.repository.read()).connections.knowledgeSources.find((s) => s.id === source.id);
  f.setListOverride((parent) => parent === "" ? { nodes:[{ ...f.nodes.get(A) }], has_more:true, page_token:"" } : null);
  const partial = await f.files.scan(active);
  assert.equal(partial.status, "partial");
  assert.match(partial.issues[0].message, /游标/);
  f.setListOverride(null);
  await f.access.setPolicy({ sourceId:source.id, agentSharing:true, excludedFolders:[],
    confirmed:true, expectedRevision:(await f.repository.read()).revision });
  f.setPrincipal(principalB);
  await assert.rejects(f.access.searchAll({ query:"接力" }, { audience:"agent" }),
    (error) => error.status === 409);
  const stored = (await f.repository.read()).connections.knowledgeSources.find((s) => s.id === source.id);
  assert.equal(stored.agentSharing, false);
  f.setPrincipal(principalA);
  assert.equal((await f.access.searchAll({ query:"接力" }, { audience:"agent" })).totalSources, 0);
});
