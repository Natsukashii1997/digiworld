import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createHash } from "node:crypto";
import { openRepository } from "../server/repository.mjs";
import { createKnowledgeConnections } from "../server/knowledge-connections.mjs";
import { seed } from "../src/store.js";

const hash = (value) => createHash("sha256").update(value).digest("hex");
async function setup(t, { partial = false, queryLimits } = {}) {
  const base = await mkdtemp(join(tmpdir(), "guiji-search-manager-"));
  const repository = await openRepository(base);
  t.after(async () => {
    await repository.close();
    await rm(base, { recursive: true, force: true });
  });
  let now = Date.parse("2026-09-26T15:00:00Z");
  let identity = "a".repeat(64),
    beforeRead = async () => {};
  const documents = new Map([
    ["例子.md", "首行\n项目判断必须有证据\n最后一行"],
    ["另一篇.md", "知识库里有新的项目判断"],
  ]);
  const calls = { inspect: 0, scan: 0, read: 0 };
  const files = {
    async inspectRoot(root) {
      calls.inspect++;
      return { root, identity };
    },
    async scan() {
      calls.scan++;
      return {
        status: partial ? "partial" : "complete",
        files: [...documents].map(([path, content]) => ({
          path,
          bytes: Buffer.byteLength(content),
          modifiedAt: new Date(now).toISOString(),
          fingerprint: hash(path),
        })),
        issues: partial ? [{ path: "未读目录", message: "目录无法读取" }] : [],
        skipped: 0,
        visited: documents.size,
      };
    },
    async read(source, selected) {
      calls.read++;
      await beforeRead();
      const content = documents.get(selected.path);
      return {
        path: selected.path,
        absolutePath: source.root + "/" + selected.path,
        content,
        bytes: Buffer.byteLength(content),
        sha256: hash(content),
        modifiedAt: selected.modifiedAt,
      };
    },
  };
  const manager = createKnowledgeConnections(repository, {
    files,
    clock: () => now,
    queryLimits,
  });
  await repository.write(seed(), { initialize: true });
  const connected = await manager.connect({
    name: "合成正文库",
    kind: "markdown",
    root: "/synthetic/knowledge",
    confirmed: true,
    expectedRevision: 1,
  });
  const source = connected.connections.knowledgeSources[0];
  const scan = await manager.scan({ sourceId: source.id });
  const input = {
    sourceId: source.id,
    scanId: scan.scanId,
    query: "项目判断",
    offset: 0,
  };
  return {
    manager,
    repository,
    calls,
    source,
    scan,
    input,
    advance: (value) => {
      now += value;
    },
    beforeRead: (value) => {
      beforeRead = value;
    },
    replaceRoot: () => {
      identity = "b".repeat(64);
    },
  };
}

test("正文查询能找到文件名没有的词，返回行号/来源版本而不写入主库", async (t) => {
  const f = await setup(t);
  const before = await f.repository.read();
  const result = await f.manager.search(f.input);
  assert.equal(result.total, 2);
  assert.equal(result.results.length, 2);
  const row = result.results.find((item) => item.path === "例子.md");
  assert.equal(row.snippets[0].line, 2);
  assert.equal(row.snippets[0].text, "项目判断必须有证据");
  assert.equal(row.sha256, hash("首行\n项目判断必须有证据\n最后一行"));
  assert.equal(result.sourceId, f.source.id);
  assert.equal(result.generation, f.source.generation);
  assert.equal(result.scanId, f.scan.scanId);
  assert.equal(result.scanStatus, "complete");
  assert.equal(result.expiresAt, f.scan.expiresAt);
  assert.deepEqual(await f.repository.read(), before);
});

test("正文短语长度按去掉两端空白后计算，100字符边界可以查询", async (t) => {
  const f = await setup(t);
  const query = "项目判断".repeat(25);
  const result = await f.manager.search({ ...f.input, query: `  ${query}  ` });
  assert.equal(result.query, query);
  assert.equal(result.attempted, 2);
});

test("断开不等待整批查询，读取中撤权后整批片段作废且不继续读下一篇", async (t) => {
  const f = await setup(t);
  let entered, release, timer;
  const started = new Promise((resolve) => {
    entered = resolve;
  });
  const blocked = new Promise((resolve) => {
    release = resolve;
  });
  f.beforeRead(async () => {
    entered();
    await blocked;
  });
  const querying = f.manager.search(f.input);
  const rejected = assert.rejects(querying, /断开|不存在|变化|失效/);
  await started;
  try {
    const removing = f.manager.remove({
      sourceId: f.source.id,
      confirmed: true,
      expectedRevision: 2,
    });
    const removed = await Promise.race([
      removing,
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error("查询阻塞了断开")), 1500);
      }),
    ]);
    assert.equal(removed.connections.knowledgeSources.length, 0);
  } finally {
    clearTimeout(timer);
    release();
  }
  await rejected;
  assert.equal(f.calls.read, 1);
});

test("无效请求、越界位置与失效扫描在来源探测前拒绝", async (t) => {
  const f = await setup(t);
  const before = { ...f.calls };
  for (const change of [
    { query: " " },
    { query: "a".repeat(101) },
    { query: "a\nb" },
    { offset: -1 },
    { offset: 0.5 },
    { offset: 3 },
    { root: "/outside" },
    { scanId: "unknown" },
    { sourceId: "unknown" },
  ])
    await assert.rejects(f.manager.search({ ...f.input, ...change }));
  assert.deepEqual(f.calls, before);
  await assert.rejects(
    f.manager.search({ ...f.input, offset: -1 }),
    /查询位置/,
  );
  f.advance(600001);
  await assert.rejects(f.manager.search(f.input), /失效/);
  assert.deepEqual(f.calls, before);
});

test("分批查询无重复遗漏，扫描本就不完整时不能升级为全库查询完成", async (t) => {
  const f = await setup(t, { partial: true, queryLimits: { maxFiles: 1 } });
  const first = await f.manager.search(f.input);
  assert.equal(first.nextOffset, 1);
  assert.equal(first.attempted, 1);
  assert.equal(first.scanStatus, "partial");
  const last = await f.manager.search({ ...f.input, offset: first.nextOffset });
  assert.equal(last.nextOffset, null);
  assert.equal(last.scanStatus, "partial");
  assert.deepEqual(
    [...first.results, ...last.results].map((item) => item.path).sort(),
    ["例子.md", "另一篇.md"].sort(),
  );
  assert.equal(first.read + last.read, 2);
});

for (const event of ["重扫", "重确认", "到期", "根更换"]) {
  test(`读取中${event}使本批结果失效`, async (t) => {
    const f = await setup(t);
    let once = false;
    f.beforeRead(async () => {
      if (once) return;
      once = true;
      if (event === "重扫") await f.manager.scan({ sourceId: f.source.id });
      if (event === "重确认")
        await f.manager.reconfirm({
          sourceId: f.source.id,
          confirmed: true,
          expectedRevision: 2,
        });
      if (event === "到期") f.advance(600001);
      if (event === "根更换") f.replaceRoot();
    });
    await assert.rejects(f.manager.search(f.input), /变化|失效|更换|重新/);
    if (event !== "根更换") assert.equal(f.calls.read, 1);
  });
}

test("无关主库更新不撤销知识权限，另一来源的扫描凭证不能混用", async (t) => {
  const f = await setup(t);
  let once = false;
  f.beforeRead(async () => {
    if (once) return;
    once = true;
    const state = await f.repository.read();
    await f.repository.write(state, { expectedRevision: state.revision });
  });
  assert.equal((await f.manager.search(f.input)).results.length, 2);
  assert.equal((await f.repository.read()).revision, 3);
  const state = await f.manager.connect({
    name: "第二个合成来源",
    kind: "markdown",
    root: "/synthetic/second",
    confirmed: true,
    expectedRevision: 3,
  });
  const second = state.connections.knowledgeSources[1];
  const scanned = await f.manager.scan({ sourceId: second.id });
  const before = { ...f.calls };
  await assert.rejects(
    f.manager.search({ ...f.input, scanId: scanned.scanId }),
    /失效/,
  );
  await assert.rejects(
    f.manager.search({ ...f.input, sourceId: second.id }),
    /失效/,
  );
  assert.deepEqual(f.calls, before);
});
