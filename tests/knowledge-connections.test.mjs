import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, readFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { openRepository } from "../server/repository.mjs";
import { createKnowledgeConnections } from "../server/knowledge-connections.mjs";
import { seed } from "../src/store.js";
import { mergeBackup } from "../server/merge.mjs";
import { validateState } from "../server/schema.mjs";

async function fixture(run) {
  const base = await mkdtemp(join(tmpdir(), "guiji-knowledge-manager-"));
  const repository = await openRepository(base);
  let now = Date.parse("2026-09-26T14:00:00Z"),
    identity = "a".repeat(64);
  let scanError,
    readCount = 0,
    inspectCount = 0,
    scanCount = 0;
  const files = {
    async inspectRoot(root) {
      inspectCount++;
      return { root, identity };
    },
    async scan(source) {
      scanCount++;
      if (source.identity !== identity)
        throw Object.assign(new Error("目录已更换，请重新确认"), {
          status: 409,
        });
      if (scanError) throw scanError;
      return {
        status: "complete",
        files: [
          {
            path: "原则.md",
            bytes: 12,
            modifiedAt: new Date(now).toISOString(),
            fingerprint: "b".repeat(64),
          },
        ],
        issues: [],
        skipped: 0,
        visited: 1,
      };
    },
    async read(source, selected) {
      readCount++;
      if (source.identity !== identity)
        throw Object.assign(new Error("目录已更换"), { status: 409 });
      return {
        path: selected.path,
        absolutePath: source.root + "/" + selected.path,
        content: "SYNTHETIC_BODY_NOT_STORED",
        bytes: 25,
        sha256: "c".repeat(64),
        modifiedAt: new Date(now).toISOString(),
      };
    },
  };
  const manager = createKnowledgeConnections(repository, {
    files,
    clock: () => now,
  });
  const input = {
    name: "合成知识库",
    kind: "obsidian",
    root: "/synthetic/knowledge",
    confirmed: true,
  };
  const connect = async (extra = {}) =>
    manager.connect({
      ...input,
      expectedRevision: (await repository.read()).revision,
      ...extra,
    });
  try {
    await repository.write(seed(), { initialize: true });
    await run({
      manager,
      repository,
      base,
      connect,
      input,
      files,
      advance: (ms) => (now += ms),
      replace: () => (identity = "d".repeat(64)),
      failScan: () => (scanError = new Error("扫描不可访问")),
      counts: () => ({ readCount, inspectCount, scanCount }),
    });
  } finally {
    await repository.close();
    await rm(base, { recursive: true, force: true });
  }
}

test("知识连接只保存来源指针，显式扫描后才能读选中的原文", () =>
  fixture(async (f) => {
    const connected = await f.connect(),
      source = connected.connections.knowledgeSources[0];
    assert.equal(source.kind, "obsidian");
    assert.deepEqual(f.counts(), {
      inspectCount: 1,
      scanCount: 0,
      readCount: 0,
    });
    await assert.rejects(
      f.manager.read({ sourceId: source.id, scanId: "fake", path: "原则.md" }),
      /重新扫描/,
    );
    const index = await f.manager.scan({ sourceId: source.id });
    assert.equal(index.status, "complete");
    assert.equal(index.files.length, 1);
    const preview = await f.manager.read({
      sourceId: source.id,
      scanId: index.scanId,
      path: "原则.md",
    });
    assert.equal(preview.content, "SYNTHETIC_BODY_NOT_STORED");
    assert.equal(preview.sourceName, "合成知识库");
    const current = JSON.parse(
      await readFile(join(f.base, "CURRENT.json"), "utf8"),
    );
    const bytes = await readFile(
      join(f.base, "snapshots", current.file),
      "utf8",
    );
    assert.ok(!bytes.includes("SYNTHETIC_BODY_NOT_STORED"));
    assert.ok(!bytes.includes("原则.md"));
    assert.equal((await f.repository.read()).revision, connected.revision);
  }));

test("连接输入确认与版本严格校验，重复路径不产生第二份授权", () =>
  fixture(async (f) => {
    for (const extra of [
      { confirmed: false },
      { expectedRevision: undefined },
      { name: "" },
      { kind: "feishu" },
      { body: "not allowed" },
    ])
      await assert.rejects(f.connect(extra));
    assert.equal(f.counts().inspectCount, 0);
    const state = await f.connect();
    await assert.rejects(f.connect(), /已经连接/);
    await assert.rejects(
      f.manager.connect({ ...f.input, expectedRevision: state.revision - 1 }),
      /刷新/,
    );
    assert.equal(
      (await f.repository.read()).connections.knowledgeSources.length,
      1,
    );
  }));

test("未扫描、无权路径、跨来源、超时凭证及服务重启不能读取正文", () =>
  fixture(async (f) => {
    const a = (await f.connect()).connections.knowledgeSources[0];
    const b = (await f.connect({ root: "/synthetic/other" })).connections
      .knowledgeSources[1];
    const scan = await f.manager.scan({ sourceId: a.id });
    await assert.rejects(
      f.manager.read({
        sourceId: a.id,
        scanId: scan.scanId,
        path: "../outside.md",
      }),
    );
    await assert.rejects(
      f.manager.read({ sourceId: b.id, scanId: scan.scanId, path: "原则.md" }),
    );
    const restarted = createKnowledgeConnections(f.repository, {
      files: f.files,
    });
    await assert.rejects(
      restarted.read({ sourceId: a.id, scanId: scan.scanId, path: "原则.md" }),
      /重新扫描/,
    );
    f.advance(600001);
    await assert.rejects(
      f.manager.read({ sourceId: a.id, scanId: scan.scanId, path: "原则.md" }),
      /重新扫描/,
    );
    assert.equal(f.counts().readCount, 0);
  }));

test("重新扫描失败使旧索引失效，不误用陈旧结果", () =>
  fixture(async (f) => {
    const source = (await f.connect()).connections.knowledgeSources[0];
    const scan = await f.manager.scan({ sourceId: source.id });
    f.failScan();
    await assert.rejects(f.manager.scan({ sourceId: source.id }), /不可访问/);
    await assert.rejects(
      f.manager.read({
        sourceId: source.id,
        scanId: scan.scanId,
        path: "原则.md",
      }),
      /重新扫描/,
    );
    assert.equal(f.counts().readCount, 0);
  }));

test("读取期间凭证过期不返回正文，必须重新扫描", () =>
  fixture(async (f) => {
    const source = (await f.connect()).connections.knowledgeSources[0];
    const index = await f.manager.scan({ sourceId: source.id });
    const original = f.files.read;
    f.files.read = async (...args) => {
      const document = await original(...args);
      f.advance(2);
      return document;
    };
    f.advance(599999);
    await assert.rejects(
      f.manager.read({
        sourceId: source.id,
        scanId: index.scanId,
        path: "原则.md",
      }),
      /重新扫描/,
    );
  }));

test("重新确认更新身份代次，旧索引无效；断开不再允许读取", () =>
  fixture(async (f) => {
    const source = (await f.connect()).connections.knowledgeSources[0];
    const scan = await f.manager.scan({ sourceId: source.id });
    f.replace();
    await assert.rejects(
      f.manager.read({
        sourceId: source.id,
        scanId: scan.scanId,
        path: "原则.md",
      }),
      /目录已更换/,
    );
    const revision = (await f.repository.read()).revision;
    const renewed = await f.manager.reconfirm({
      sourceId: source.id,
      confirmed: true,
      expectedRevision: revision,
    });
    const updated = renewed.connections.knowledgeSources[0];
    assert.equal(updated.id, source.id);
    assert.notEqual(updated.generation, source.generation);
    await assert.rejects(
      f.manager.read({
        sourceId: source.id,
        scanId: scan.scanId,
        path: "原则.md",
      }),
      /重新扫描/,
    );
    const fresh = await f.manager.scan({ sourceId: source.id });
    const removed = await f.manager.remove({
      sourceId: source.id,
      confirmed: true,
      expectedRevision: renewed.revision,
    });
    assert.equal(removed.connections.knowledgeSources.length, 0);
    await assert.rejects(
      f.manager.read({
        sourceId: source.id,
        scanId: fresh.scanId,
        path: "原则.md",
      }),
      /连接/,
    );
  }));

test("通用保存和备份不能新建或扩大知识授权，现有来源不丢失", () =>
  fixture(async (f) => {
    const state = await f.connect();
    const unsafe = structuredClone(state);
    unsafe.connections.knowledgeSources[0].root = "/synthetic/expanded";
    await assert.rejects(f.repository.write(unsafe));
    const merged = mergeBackup(state, unsafe).state;
    assert.deepEqual(merged.connections, state.connections);
    const empty = seed();
    const first = mergeBackup(empty, unsafe).state;
    assert.equal(first.connections, undefined);
  }));

test("断开与重确认必须有明确确认及当前版本，未知字段拒绝", () =>
  fixture(async (f) => {
    const state = await f.connect(),
      source = state.connections.knowledgeSources[0];
    for (const action of ["reconfirm", "remove"]) {
      await assert.rejects(
        f.manager[action]({
          sourceId: source.id,
          confirmed: false,
          expectedRevision: state.revision,
        }),
      );
      await assert.rejects(
        f.manager[action]({
          sourceId: source.id,
          confirmed: true,
          expectedRevision: state.revision - 1,
        }),
      );
      await assert.rejects(
        f.manager[action]({
          sourceId: source.id,
          confirmed: true,
          expectedRevision: state.revision,
          root: "/other",
        }),
      );
    }
    await assert.rejects(
      f.manager.scan({ sourceId: source.id, root: "/other" }),
    );
    assert.equal((await f.repository.read()).revision, state.revision);
  }));

test("刷新扫描与断开先入队后，排队的旧读取不再触及正文", () =>
  fixture(async (f) => {
    const state = await f.connect(),
      source = state.connections.knowledgeSources[0];
    const scan = await f.manager.scan({ sourceId: source.id });
    const original = f.files.scan;
    const gate = Promise.withResolvers(),
      entered = Promise.withResolvers();
    f.files.scan = async (...args) => {
      entered.resolve();
      await gate.promise;
      return original(...args);
    };
    const refreshing = f.manager.scan({ sourceId: source.id });
    await entered.promise;
    const oldRead = assert.rejects(
      f.manager.read({
        sourceId: source.id,
        scanId: scan.scanId,
        path: "原则.md",
      }),
      /重新扫描/,
    );
    gate.resolve();
    const fresh = await refreshing;
    await oldRead;
    const removing = f.manager.remove({
      sourceId: source.id,
      expectedRevision: state.revision,
      confirmed: true,
    });
    const removedRead = assert.rejects(
      f.manager.read({
        sourceId: source.id,
        scanId: fresh.scanId,
        path: "原则.md",
      }),
      /连接/,
    );
    await Promise.all([removing, removedRead]);
    assert.equal(f.counts().readCount, 0);
  }));

test("最多20个知识来源，超限在来源探测前拒绝", () =>
  fixture(async (f) => {
    for (let n = 0; n < 20; n++)
      await f.connect({ root: `/synthetic/source-${n}` });
    const before = f.counts().inspectCount;
    await assert.rejects(f.connect({ root: "/synthetic/overflow" }), /20/);
    assert.equal(f.counts().inspectCount, before);
    assert.equal(
      (await f.repository.read()).connections.knowledgeSources.length,
      20,
    );
  }));

test("知识来源身份必须是哈希字符串，禁止混入正文或额外授权字段", () =>
  fixture(async (f) => {
    const state = await f.connect();
    for (const patch of [
      { identity: ["a".repeat(64)] },
      { content: "never persist" },
      { permissions: "all-agents" },
    ]) {
      const bad = structuredClone(state);
      Object.assign(bad.connections.knowledgeSources[0], patch);
      assert.throws(() => validateState(bad));
    }
    assert.deepEqual(validateState(state), state);
  }));
