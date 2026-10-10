import test from "node:test";
import assert from "node:assert/strict";
import * as fs from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createHash } from "node:crypto";
import { openRepository, failure } from "../server/repository.mjs";
import { createKnowledgeFiles } from "../server/knowledge-files.mjs";
import { createKnowledgeConnections } from "../server/knowledge-connections.mjs";
import { createKnowledgeProfile } from "../server/knowledge-profile.mjs";
import { createKnowledgeAccess } from "../server/knowledge-access.mjs";
import {
  createPolicyKnowledgeFiles,
  policyKey,
} from "../server/knowledge-access-policy.mjs";
import { handleMcp, startProfileMcp } from "../server/profile-mcp.mjs";
import { seed } from "../src/store.js";
import { pendingItems } from "../src/pending.js";
const hash = (s) => createHash("sha256").update(s).digest("hex");
const reject = (p, status) => assert.rejects(p, (e) => e.status === status);

test("知识根目录稳定身份变化进入专用待处理，撤权并在本人重确认后留回执", async (t) => {
  const f = await fixture(t);
  await f.policy(f.one, true);
  await f.share(true);
  const previous = (await f.repo.read()).connections.knowledgeSources.find((s) => s.id === f.one.id);
  await fs.rename(f.roots[0], `${f.roots[0]}-old`);
  await fs.mkdir(f.roots[0]);
  await fs.writeFile(join(f.roots[0], "replacement.md"), "合成替换目录");
  await assert.rejects(f.connections.scan({ sourceId:f.one.id }), (e) => e.code === "KNOWLEDGE_ROOT_IDENTITY_CHANGED" && e.status === 409);
  let state = await f.repo.read();
  const health = state.connections.knowledgeSourceHealth.find((h) => h.sourceId === f.one.id);
  assert.equal(health.status, "needs_reconfirmation");
  assert.equal(health.beforeIdentity, previous.identity);
  assert.equal(state.connections.knowledgeSources.find((s) => s.id === f.one.id).agentSharing, false);
  assert.equal(state.knowledgeZones.profileSharing, false);
  const pending = pendingItems(state).find((item) => item.id === `knowledge-source-reconfirm-${f.one.id}`);
  assert.equal(pending.triage, "等你确认");
  assert.equal(pending.sourceId, f.one.id);
  await assert.rejects(f.policy(f.one, true), /需重新确认/);
  const confirmed = await f.connections.reconfirm({ sourceId:f.one.id, confirmed:true, expectedRevision:state.revision });
  state = await f.repo.read();
  const receipt = state.connections.knowledgeSourceHealth.find((h) => h.sourceId === f.one.id);
  assert.equal(receipt.status, "confirmed");
  assert.equal(receipt.afterIdentity, confirmed.connections.knowledgeSources.find((s) => s.id === f.one.id).identity);
  assert.ok(receipt.confirmedAt);
  assert.equal(pendingItems(state).some((item) => item.id === pending.id), false);
  assert.equal((await f.connections.scan({ sourceId:f.one.id })).status, "complete");
});

test("父子重叠知识源中子源待确认时，父源不能重新开放或绕道读取", async (t) => {
  const f = await fixture(t);
  const nested = join(f.roots[0], "嵌套来源");
  await fs.mkdir(nested);
  await fs.writeFile(join(nested, "旧.md"), "合成旧内容");
  const child = await f.connect(nested, "子来源");
  await f.policy(f.one, true);
  await f.share(true);
  await fs.rename(nested, `${nested}-old`);
  await fs.mkdir(nested);
  await fs.writeFile(join(nested, "新.md"), "合成新内容");
  await assert.rejects(f.connections.scan({ sourceId:child.id }), (e) => e.code === "KNOWLEDGE_ROOT_IDENTITY_CHANGED");
  assert.equal((await f.repo.read()).knowledgeZones.profileSharing, false);
  await assert.rejects(f.policy(f.one, true), /需重新确认/);
  await assert.rejects(f.share(true), /需重新确认/);
  await assert.rejects(f.connections.scan({ sourceId:f.one.id }), /需重新确认/);
  const result = await f.connections.reconfirm({ sourceId:child.id, confirmed:true, expectedRevision:(await f.repo.read()).revision });
  assert.equal(result.connections.knowledgeSourceHealth.find((h) => h.sourceId === child.id).status, "confirmed");
  await f.policy(f.one, true);
});
async function fixture(
  t,
  {
    virtual = false,
    count = 3,
    limits = {},
    body = "接力 合成正文",
    bytes = 40,
    scanStatus = "complete",
    clock = Date.now,
  } = {},
) {
  const base = await fs.realpath(
      await fs.mkdtemp(join(tmpdir(), "guiji-knowledge-access-")),
    ),
    repo = await openRepository(join(base, "data"));
  await repo.write(seed(), { initialize: true });
  t.after(async () => {
    await repo.close();
    await fs.rm(base, { recursive: true, force: true });
  });
  const roots = [join(base, "Workspace/Vault"), join(base, "Independent")];
  let io = [],
    reads = [],
    readHook,
    scanHook;
  for (const root of roots) await fs.mkdir(root, { recursive: true });
  if (!virtual)
    for (const [path, content] of Object.entries({
      "公共/普通.md": body,
      "个人上下文/关于我.md": "# 关于我\n合成角色。",
      "排除资料/不能读.md": "接力 SYNTHETIC_PRIVATE",
      "排除资料副本/可以读.md": body,
    })) {
      await fs.mkdir(join(roots[0], path, ".."), { recursive: true });
      await fs.writeFile(join(roots[0], path), content);
    }
  let active = 0,
    maxActive = 0;
  const raw = virtual
    ? {
        inspectRoot: async (root) => ({ root, identity: hash(root) }),
        scan: async (s) => {
          if (scanHook) await scanHook(s);
          return {
            status: scanStatus,
            files: Array.from({ length: count }, (_, i) => ({
              path: String(i).padStart(3, "0") + ".md",
              bytes,
              modifiedAt: new Date(clock()).toISOString(),
              fingerprint: "b".repeat(64),
            })),
            issues: scanStatus === "complete" ? [] : [{ message: "合成部分" }],
          };
        },
        read: async (s, e) => {
          reads.push({ sourceId: s.id, path: e.path, bytes: e.bytes });
          active++;
          maxActive = Math.max(maxActive, active);
          try {
            if (readHook) await readHook(s, e);
            return {
              path: e.path,
              content: body,
              bytes: e.bytes,
              sha256: hash(body),
              modifiedAt: new Date(clock()).toISOString(),
            };
          } finally {
            active--;
          }
        },
      }
    : createKnowledgeFiles({
        fs: {
          ...fs,
          opendir: async (p, o) => {
            io.push(["opendir", p]);
            return fs.opendir(p, o);
          },
          open: async (p, ...a) => {
            io.push(["open", p]);
            return fs.open(p, ...a);
          },
        },
      });
  if (virtual)
    raw.current = async (s, path) => ({
      document: await raw.read(s, { path, bytes }),
    });
  const files = createPolicyKnowledgeFiles(repo, raw),
    connections = createKnowledgeConnections(repo, { files, clock }),
    profile = createKnowledgeProfile(repo, { files, clock }),
    access = createKnowledgeAccess(repo, { files, clock, limits });
  const connect = async (root, name, kind = "markdown") =>
    (
      await connections.connect({
        root,
        name,
        kind,
        confirmed: true,
        expectedRevision: (await repo.read()).revision,
      })
    ).connections.knowledgeSources.at(-1);
  const policy = async (source, sharing, excludedFolders = []) =>
    await access.setPolicy({
      sourceId: source.id,
      agentSharing: sharing,
      excludedFolders,
      confirmed: true,
      expectedRevision: (await repo.read()).revision,
    });
  const share = async (enabled) =>
    profile.setSharing({
      enabled,
      confirmed: true,
      expectedRevision: (await repo.read()).revision,
    });
  const one = await connect(roots[0], "Vault", "obsidian"),
    two = await connect(roots[1], "Independent");
  return {
    base,
    repo,
    roots,
    files,
    raw,
    connections,
    profile,
    access,
    one,
    two,
    connect,
    policy,
    share,
    io,
    reads,
    clearIo: () => io.splice(0),
    hookRead: (f) => (readHook = f),
    hookScan: (f) => (scanHook = f),
    max: () => maxActive,
  };
}
const gate = () => {
  let release;
  const done = new Promise((r) => (release = r));
  let enter;
  const entered = new Promise((r) => (enter = r));
  return { done, release, enter, entered };
};
test("旧与新源默认关；本人检索可读；知识/个人说明四种开关独立且正文不入主库", async (t) => {
  const f = await fixture(t);
  let result = await f.access.searchAll({ query: "接力" });
  assert.equal(result.totalSources, 0);
  assert.deepEqual(result.results, []);
  await reject(f.profile.readProfile({}), 403);
  assert.equal(
    (await f.access.searchAll({ query: "接力" }, { audience: "user" })).results
      .length,
    3,
  );
  await f.policy(f.one, true);
  assert.equal((await f.access.searchAll({ query: "接力" })).results.length, 3);
  await reject(f.profile.readProfile({}), 403);
  await f.share(true);
  assert.equal((await f.profile.readProfile({})).files.length, 1);
  await reject(
    f.access.readNote({
      sourceId: f.one.id,
      path: "个人上下文/关于我.md",
      expectedSha256: hash("# 关于我\n合成角色。"),
    }),
    403,
  );
  await f.policy(f.one, false);
  assert.equal((await f.access.searchAll({ query: "接力" })).totalSources, 0);
  assert.equal((await f.profile.readProfile({})).files.length, 1);
  await f.share(false);
  await reject(f.profile.readProfile({}), 403);
  assert.equal((await f.profile.readPreview({})).files.length, 1);
  assert.equal(
    JSON.stringify(await f.repo.read()).includes("SYNTHETIC_PRIVATE"),
    false,
  );
});
test("父/子物理源不能绕过排除与个人说明；排除子树无枚举或正文open；删除保护源同事务撤销重叠授权", async (t) => {
  const f = await fixture(t),
    parent = await f.connect(join(f.base, "Workspace"), "Parent"),
    child = await f.connect(join(f.roots[0], "排除资料"), "Child"),
    pchild = await f.connect(join(f.roots[0], "个人上下文"), "ProfileChild");
  await f.profile.saveRules({
    sourceId: f.one.id,
    rules: [{ pattern: "个人上下文/**", zone: "profile" }],
    expectedRevision: (await f.repo.read()).revision,
  });
  await f.policy(f.one, false, ["排除资料"]);
  await f.policy(parent, true);
  await f.policy(child, true);
  await f.policy(pchild, true);
  await f.policy(parent, true);
  await f.policy(f.two, true);
  f.clearIo();
  const result = await f.access.searchAll({ query: "接力" });
  assert.equal(JSON.stringify(result).includes("SYNTHETIC_PRIVATE"), false);
  assert.ok(result.results.some((r) => r.path.includes("排除资料副本")));
  assert.equal(
    f.io.some(
      ([m, p]) =>
        p === join(f.roots[0], "排除资料") ||
        (m === "open" && p.startsWith(join(f.roots[0], "排除资料") + "/")),
    ),
    false,
  );
  for (const [s, path] of [
    [parent, "Vault/排除资料/不能读.md"],
    [child, "不能读.md"],
    [parent, "Vault/个人上下文/关于我.md"],
    [pchild, "关于我.md"],
  ])
    await reject(
      f.access.readNote({
        sourceId: s.id,
        path,
        expectedSha256: "a".repeat(64),
      }),
      403,
    );
  const prior = await f.repo.read();
  const removed = await f.connections.remove({
    sourceId: f.one.id,
    confirmed: true,
    expectedRevision: prior.revision,
  });
  for (const s of removed.connections.knowledgeSources.filter(
    (s) => s.id !== f.two.id,
  )) {
    assert.equal(s.agentSharing, false);
    assert.notEqual(
      s.generation,
      prior.connections.knowledgeSources.find((p) => p.id === s.id).generation,
    );
  }
  assert.equal(
    removed.connections.knowledgeSources.find((s) => s.id === f.two.id)
      .generation,
    prior.connections.knowledgeSources.find((s) => s.id === f.two.id)
      .generation,
  );
});
test("源规则改变关闭共享与重叠授权；通用PUT不能伪造知识权限", async (t) => {
  const f = await fixture(t);
  await f.policy(f.one, true);
  await f.share(true);
  const before = await f.repo.read();
  await reject(
    f.repo.write({
      ...before,
      connections: {
        ...before.connections,
        knowledgeSources: before.connections.knowledgeSources.map((s) => ({
          ...s,
          agentSharing: true,
        })),
      },
    }),
    400,
  );
  const after = await f.profile.saveRules({
    sourceId: f.one.id,
    rules: [{ pattern: "公共/**", zone: "profile" }],
    expectedRevision: before.revision,
  });
  assert.equal(after.knowledgeZones.profileSharing, false);
  assert.equal(
    after.connections.knowledgeSources.find((s) => s.id === f.one.id)
      .agentSharing,
    false,
  );
});
test("统一两槽真正并发；共享文件预算与稳定显式分页无重复遗漏", async (t) => {
  const f = await fixture(t, { virtual: true, count: 3 });
  await f.policy(f.one, true);
  await f.policy(f.two, true);
  const g = gate();
  let entered = 0;
  f.hookRead(async () => {
    if (++entered === 2) g.enter();
    await g.done;
  });
  const pending = f.access.searchAll({ query: "接力" });
  await g.entered;
  assert.equal(f.max(), 2);
  assert.equal(new Set(f.reads.slice(0, 2).map((r) => r.sourceId)).size, 2);
  await reject(f.access.searchAll({ query: "接力" }), 429);
  g.release();
  assert.equal((await pending).results.length, 6);
  f.hookRead(null);
  const all = [];
  let cursor;
  do {
    const page = await f.access.searchAll({
      query: "接力",
      limit: 1,
      ...(cursor ? { cursor } : {}),
    });
    assert.ok(page.results.length <= 1);
    all.push(...page.results.map((r) => r.sourceId + ":" + r.path));
    cursor = page.nextCursor;
  } while (cursor);
  assert.equal(all.length, 6);
  assert.equal(new Set(all).size, 6);
  assert.deepEqual(all, [...all].sort());
  const small = createKnowledgeAccess(f.repo, {
      files: f.files,
      limits: { maxFiles: 2 },
    }),
    start = f.reads.length;
  const partial = await small.searchAll({ query: "接力" });
  assert.equal(f.reads.length - start, 2);
  assert.equal(partial.status, "partial");
  assert.equal(partial.budget.attempted, 2);
  assert.ok(partial.nextCursor);
});
test("读取中撤权可先完成，不长占仓库队列；最终返回撤回已读结果", async (t) => {
  const f = await fixture(t, { virtual: true });
  await f.policy(f.one, true);
  await f.policy(f.two, true);
  const g = gate();
  f.hookRead(async () => {
    g.enter();
    await g.done;
  });
  const pending = f.access.searchAll({ query: "接力" });
  await g.entered;
  await f.policy(f.one, false);
  g.release();
  await reject(pending, 409);
});
test("游标到期、改词、跨audience与generation变化均在正文IO前拒绝", async (t) => {
  let now = Date.now();
  const f = await fixture(t, { virtual: true, clock: () => now });
  await f.policy(f.one, true);
  const page = await f.access.searchAll({ query: "接力", limit: 1 });
  let count = f.reads.length;
  for (const input of [
    { query: "换词", cursor: page.nextCursor },
    { query: "接力", cursor: page.nextCursor },
  ])
    await reject(
      f.access.searchAll(input, {
        audience: input.query === "换词" ? "agent" : "user",
      }),
      409,
    );
  assert.equal(f.reads.length, count);
  now += 600001;
  await reject(
    f.access.searchAll({ query: "接力", cursor: page.nextCursor }),
    409,
  );
  assert.equal(f.reads.length, count);
  const another = await f.access.searchAll({ query: "接力", limit: 1 });
  await f.policy(f.one, false);
  count = f.reads.length;
  await reject(
    f.access.searchAll({ query: "接力", cursor: another.nextCursor }),
    409,
  );
  assert.equal(f.reads.length, count);
});
test("单源失败撤回该源结果；metadata partial零命中仍未知", async (t) => {
  const f = await fixture(t, { virtual: true });
  await f.policy(f.one, true);
  await f.policy(f.two, true);
  f.hookRead(async (s, e) => {
    if (s.id === f.one.id && e.path === "001.md")
      throw failure("synthetic unsafe", 409);
  });
  const result = await f.access.searchAll({ query: "接力" });
  assert.equal(result.status, "partial");
  assert.equal(
    result.results.some((r) => r.sourceId === f.one.id),
    false,
  );
  assert.equal(result.results.filter((r) => r.sourceId === f.two.id).length, 3);
  assert.equal(
    result.coverage.find((c) => c.sourceId === f.one.id).status,
    "failed",
  );
  const g = await fixture(t, {
    virtual: true,
    body: "无目标词",
    scanStatus: "partial",
  });
  await g.policy(g.one, true);
  const partial = await g.access.searchAll({ query: "接力" });
  assert.deepEqual(partial.results, []);
  assert.equal(partial.status, "partial");
});
test("路径/参数/SHA与字符超限经新gateway拒绝；四工具显式分发与实际JSON上限", async (t) => {
  const f = await fixture(t, { virtual: true, body: "接力".repeat(9000) });
  await f.policy(f.one, true);
  const count = f.reads.length;
  for (const query of ["", "a\nb", "a".repeat(101)])
    await reject(f.access.searchAll({ query }), 400);
  await reject(f.access.searchAll({ query: "接力", audience: "user" }), 400);
  await reject(
    f.access.readNote({
      sourceId: f.one.id,
      path: "../x.md",
      expectedSha256: "a".repeat(64),
    }),
    400,
  );
  assert.equal(f.reads.length, count);
  await reject(
    f.access.readNote({
      sourceId: f.one.id,
      path: "000.md",
      expectedSha256: "a".repeat(64),
    }),
    409,
  );
  await reject(
    f.access.readNote({
      sourceId: f.one.id,
      path: "000.md",
      expectedSha256: hash("接力".repeat(9000)),
    }),
    413,
  );
  let propose = 0;
  const stub = {
    readProfile: async () => ({ files: [], omitted: [] }),
    propose: async () => {
      propose++;
      return { id: "p" };
    },
  };
  const call = async (name, args) =>
    handleMcp(
      stub,
      {
        jsonrpc: "2.0",
        id: 1,
        method: "tools/call",
        params: { name, arguments: args },
      },
      f.access,
    );
  const list = await handleMcp(
    stub,
    { jsonrpc: "2.0", id: 1, method: "tools/list" },
    f.access,
  );
  assert.deepEqual(
    list.result.tools.map((t) => t.name),
    ["read_profile", "propose_profile_change", "search_knowledge", "read_note"],
  );
  const result = await call("search_knowledge", { query: "接力" });
  assert.equal(result.result.isError, false);
  assert.ok(Buffer.byteLength(JSON.stringify(result)) <= 256 * 1024);
  assert.equal(propose, 0);
  assert.equal(
    (
      await call("read_note", {
        sourceId: f.one.id,
        path: "000.md",
        expectedSha256: hash("接力".repeat(9000)),
      })
    ).result.isError,
    true,
  );
  assert.equal(propose, 0);
});
test("个人说明读取和建议入队前撤权，不能返回正文或创建建议", async (t) => {
  const f = await fixture(t);
  await f.share(true);
  const g = gate();
  const gated = {
    ...f.files,
    current: async (...a) => {
      const value = await f.files.current(...a);
      g.enter();
      await g.done;
      return value;
    },
  };
  const profile = createKnowledgeProfile(f.repo, { files: gated }),
    pending = profile.readProfile({});
  await g.entered;
  await f.share(false);
  g.release();
  await reject(pending, 409);
  await f.share(true);
  const commit = gate();
  const proxy = {
    ...f.repo,
    updateProfile: async (...a) => {
      commit.enter();
      await commit.done;
      return f.repo.updateProfile(...a);
    },
  };
  const proposing = createKnowledgeProfile(proxy, { files: f.files }).propose({
    path: "个人上下文/关于我.md",
    original: "合成角色。",
    proposed: "修订角色。",
    reason: "合成测试",
    proposer: "Codex",
  });
  await commit.entered;
  await f.share(false);
  commit.release();
  await reject(proposing, 409);
  assert.equal((await f.repo.read()).profileProposals?.length || 0, 0);
});
test("一槽撤权失败后等另一在途槽settle，忙锁阻止新批叠加任务", async (t) => {
  const f = await fixture(t, { virtual: true });
  await f.policy(f.one, true);
  await f.policy(f.two, true);
  const first = gate(),
    second = gate(),
    finished = gate();
  let seen = 0;
  f.hookRead(async () => {
    const g = ++seen === 1 ? first : second;
    g.enter();
    await g.done;
    if (g === first) finished.enter();
  });
  t.after(() => {
    first.release();
    second.release();
  });
  const pending = f.access.searchAll({ query: "接力" });
  pending.catch(() => {});
  await first.entered;
  await second.entered;
  await f.policy(f.one, false);
  first.release();
  await finished.entered;
  await new Promise((r) => setImmediate(r));
  await reject(f.access.searchAll({ query: "接力" }), 429);
  second.release();
  await reject(pending, 409);
  assert.equal((await f.access.searchAll({ query: "接力" })).totalSources, 1);
});
test("默认个人说明从Markdown切到新Obsidian时，旧源知识授权原子关闭", async (t) => {
  const f = await fixture(t);
  await f.repo.updateConnections((c) => ({
    ...c,
    knowledgeSources: c.knowledgeSources.map((s) => ({
      ...s,
      kind: "markdown",
    })),
  }));
  await f.policy(f.one, true);
  const old = await f.repo.read(),
    newRoot = join(f.base, "NewVault");
  await fs.mkdir(newRoot);
  await reject(
    f.access.readNote({
      sourceId: f.one.id,
      path: "个人上下文/关于我.md",
      expectedSha256: hash("# 关于我\n合成角色。"),
    }),
    403,
  );
  await f.connect(newRoot, "NewVault", "obsidian");
  const current = (await f.repo.read()).connections.knowledgeSources.find(
    (s) => s.id === f.one.id,
  );
  assert.equal(current.agentSharing, false);
  assert.notEqual(
    current.generation,
    old.connections.knowledgeSources.find((s) => s.id === f.one.id).generation,
  );
  await reject(
    f.access.readNote({
      sourceId: f.one.id,
      path: "个人上下文/关于我.md",
      expectedSha256: hash("# 关于我\n合成角色。"),
    }),
    403,
  );
});
test("最后目录身份变化撤回整批旧授权；重确认后本人长原文完整，Agent仍限字", async (t) => {
  const f = await fixture(t, { virtual: true, body: "接力".repeat(9000) });
  await f.policy(f.one, true);
  await f.policy(f.two, true);
  const originalInspect = f.raw.inspectRoot;
  let changed = false;
  f.raw.inspectRoot = async (root) =>
    root === f.one.root && changed
      ? { root, identity: "e".repeat(64) }
      : originalInspect(root);
  f.hookRead(async (s) => {
    if (s.id === f.two.id) changed = true;
  });
  await reject(f.access.searchAll({ query: "接力" }), 409);
  assert.equal((await f.repo.read()).connections.knowledgeSourceHealth.find((h) => h.sourceId === f.one.id).status, "needs_reconfirmation");
  changed = false;
  const refreshed = await f.connections.reconfirm({ sourceId:f.one.id, confirmed:true, expectedRevision:(await f.repo.read()).revision });
  await f.policy(refreshed.connections.knowledgeSources.find((s) => s.id === f.one.id), true);
  const input = {
    sourceId: f.one.id,
    path: "000.md",
    expectedSha256: hash("接力".repeat(9000)),
  };
  await reject(f.access.readNote(input), 413);
  assert.equal(
    (await f.access.readNote(input, { audience: "user" })).content,
    "接力".repeat(9000),
  );
});
test("整批字节与失败尝试预算共用；limit1未查源不会算已查", async (t) => {
  const f = await fixture(t, { virtual: true, count: 60, bytes: 100000 });
  await f.policy(f.one, true);
  await f.policy(f.two, true);
  f.hookRead(async (s, e) => {
    if (e.path === "001.md") throw failure("编码不可读", 400);
  });
  const result = await f.access.searchAll({ query: "接力" });
  assert.equal(f.reads.length, 41);
  assert.ok(f.reads.reduce((n, r) => n + r.bytes, 0) <= 4 * 1024 * 1024);
  assert.equal(result.budget.attempted, 41);
  assert.equal(result.status, "partial");
  f.hookRead(null);
  const page = await f.access.searchAll({ query: "接力", limit: 1 });
  assert.equal(page.searchedSources, 1);
  assert.equal(
    page.coverage.filter((c) => c.status === "unsearched").length,
    1,
  );
});
test("排除大小写与Unicode目录别名保守拒绝，原目录零枚举/正文open", async (t) => {
  const f = await fixture(t),
    folder = "CaseDocs",
    unicode = "Cafe\u0301";
  for (const name of [folder, unicode]) {
    await fs.mkdir(join(f.roots[0], name));
    await fs.writeFile(join(f.roots[0], name, "别名.md"), "接力 ALIAS_PRIVATE");
  }
  await f.policy(f.one, true, ["casedocs", "Café"]);
  f.clearIo();
  const result = await f.access.searchAll({ query: "接力" });
  assert.equal(JSON.stringify(result).includes("ALIAS_PRIVATE"), false);
  assert.equal(
    f.io.some(
      ([m, p]) =>
        p === join(f.roots[0], folder) || p === join(f.roots[0], unicode),
    ),
    false,
  );
  for (const name of [folder, unicode])
    await reject(
      f.access.readNote({
        sourceId: f.one.id,
        path: name + "/别名.md",
        expectedSha256: hash("接力 ALIAS_PRIVATE"),
      }),
      403,
    );
});
test("真实文件扫描共享metadata上限；未扫描/部分范围不会伪报完整", async (t) => {
  const f = await fixture(t);
  await fs.writeFile(join(f.roots[1], "独立.md"), "接力");
  await f.policy(f.one, true);
  await f.policy(f.two, true);
  const access = createKnowledgeAccess(f.repo, {
    files: f.files,
    limits: { maxMetadataFiles: 2, maxEntries: 3 },
  });
  const result = await access.searchAll({ query: "接力" });
  assert.ok(result.coverage.reduce((n, c) => n + c.scanned, 0) <= 2);
  assert.equal(result.status, "partial");
  assert.ok(
    result.coverage.some(
      (c) => c.status === "partial" || c.status === "unsearched",
    ),
  );
});
test("保留个人说明64k中文的旧MCP响应能力，不套新知识输出预算", async (t) => {
  const f = await fixture(t);
  for (let i = 0; i < 4; i++)
    await fs.writeFile(
      join(f.roots[0], "个人上下文/长" + i + ".md"),
      "中".repeat(16000),
    );
  await f.share(true);
  const response = await handleMcp(
    f.profile,
    {
      jsonrpc: "2.0",
      id: 1,
      method: "tools/call",
      params: { name: "read_profile", arguments: {} },
    },
    f.access,
  );
  assert.equal(response.result.isError, false);
  assert.equal(
    response.result.structuredContent.files.reduce(
      (n, d) => n + d.content.length,
      0,
    ),
    64000,
  );
  assert.ok(Buffer.byteLength(JSON.stringify(response)) > 256 * 1024);
  assert.equal(response.result.structuredContent.partial, true);
  const service = await startProfileMcp({
    profile: f.profile,
    knowledge: f.access,
    port: 0,
  });
  try {
    const httpResponse = await fetch(service.url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 2,
        method: "tools/call",
        params: { name: "read_profile", arguments: {} },
      }),
    });
    assert.equal(httpResponse.status, 200);
    const text = await httpResponse.text(),
      actual = JSON.parse(text);
    assert.equal(actual.result.isError, false);
    assert.equal(
      actual.result.structuredContent.files.reduce(
        (n, d) => n + d.content.length,
        0,
      ),
      64000,
    );
    assert.ok(Buffer.byteLength(text) > 256 * 1024);
  } finally {
    await service.close();
  }
});

test("无关来源接入保留单源扫描/捕获及在途读取，统一游标仍校验全部来源", async (t) => {
  const f = await fixture(t, { virtual: true });
  await f.policy(f.one, true);
  const scan = await f.connections.scan({ sourceId: f.one.id });
  const input = { sourceId: f.one.id, scanId: scan.scanId, path: "000.md" };
  const global = await f.access.searchAll({ query: "接力", limit: 1 });
  const held = gate();
  f.hookRead(async () => {
    held.enter();
    await held.done;
  });
  const reading = f.connections.read(input);
  await held.entered;
  const thirdRoot = join(f.base, "Disjoint");
  await fs.mkdir(thirdRoot);
  await f.connect(thirdRoot, "无关资料");
  held.release();
  assert.equal((await reading).content, "接力 合成正文");
  f.hookRead(null);
  assert.equal(
    (
      await f.connections.capture({
        ...input,
        expectedSha256: hash("接力 合成正文"),
      })
    ).sha256,
    hash("接力 合成正文"),
  );
  const before = f.reads.length;
  await reject(
    f.access.searchAll({ query: "接力", limit: 1, cursor: global.nextCursor }),
    409,
  );
  assert.equal(f.reads.length, before);
  await f.policy(f.one, false, ["排除"]);
  await reject(f.connections.read(input), 409);
  await reject(
    f.connections.capture({ ...input, expectedSha256: hash("接力 合成正文") }),
    409,
  );
});
test("重叠物理排除使既有扫描在正文IO前失效", async (t) => {
  const f = await fixture(t);
  const scan = await f.connections.scan({ sourceId: f.one.id });
  const input = {
    sourceId: f.one.id,
    scanId: scan.scanId,
    path: "公共/普通.md",
  };
  const parentRoot = join(f.base, "Workspace");
  const parent = await f.connect(parentRoot, "父范围");
  const scan2 = await f.connections.scan({ sourceId: f.one.id });
  await f.policy(parent, false, ["Vault/公共"]);
  f.clearIo();
  await reject(f.connections.read({ ...input, scanId: scan2.scanId }), 409);
  assert.deepEqual(f.io, []);
});
