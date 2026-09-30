import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { openRepository } from "../server/repository.mjs";
import { createKnowledgeFiles } from "../server/knowledge-files.mjs";
import { createKnowledgeConnections } from "../server/knowledge-connections.mjs";
import { createKnowledgeCompilation } from "../server/knowledge-compilation.mjs";
import { seed } from "../src/store.js";
import {
  compilationHash,
  manifestHash,
} from "../server/knowledge-compilation-schema.mjs";

async function fixture(run) {
  const base = await mkdtemp(join(tmpdir(), "guiji-compile-store-"));
  const repositories = [];
  async function open(name) {
    const repository = await openRepository(join(base, name));
    repositories.push(repository);
    return repository;
  }
  try {
    const repository = await open("data");
    await repository.write(seed(), { initialize: true });
    const root = join(base, "source");
    await mkdir(root);
    await writeFile(join(root, "source.md"), "ONLY_ORIGINAL_BODY");
    const files = createKnowledgeFiles();
    const knowledge = createKnowledgeConnections(repository, { files });
    const connected = await knowledge.connect({
      name: "合成资料",
      kind: "markdown",
      root,
      confirmed: true,
      expectedRevision: 1,
    });
    const sourceId = connected.connections.knowledgeSources[0].id;
    const scan = await knowledge.scan({ sourceId });
    const document = await knowledge.read({
      sourceId,
      scanId: scan.scanId,
      path: "source.md",
    });
    const compiler = createKnowledgeCompilation(repository, {
      knowledge,
      files,
    });
    const created = await compiler.create({
      question: "整理合成资料",
      selections: [
        {
          sourceId,
          scanId: scan.scanId,
          path: "source.md",
          expectedSha256: document.sha256,
        },
      ],
      confirmed: true,
      requestId: "store-request",
      expectedRevision: connected.revision,
    });
    const task = created.state.knowledgeTasks[0];
    const candidate = {
      schema: 1,
      taskId: task.id,
      manifestHash: task.manifestHash,
      title: "候选",
      summary: "仅候选",
      claims: [
        {
          id: "claim-1",
          text: "合成观点",
          kind: "analysis",
          evidenceIds: [task.evidence[0].id],
        },
      ],
      conflicts: [],
      unknowns: [],
      relations: [],
    };
    const received = await compiler.receive({
      taskId: task.id,
      candidate,
      expectedRevision: created.state.revision,
    });
    await run({
      base,
      repository,
      compiler,
      received: received.state,
      task,
      candidate,
      open,
      files,
    });
  } finally {
    for (const repository of repositories) await repository.close();
    await rm(base, { recursive: true, force: true });
  }
}

test("知识任务和候选重启后可读；恢复到空主库保留历史但不恢复连接授权", () =>
  fixture(async (f) => {
    await f.repository.close();
    const reopened = await f.open("data");
    assert.deepEqual(
      (await reopened.read()).knowledgeTasks,
      f.received.knowledgeTasks,
    );
    const restored = await f.open("restored");
    const preview = await restored.previewImport(f.received);
    assert.equal(preview.summary.added.knowledgeTasks, 1);
    const state = await restored.importBackup(f.received, preview.token);
    assert.deepEqual(state.knowledgeTasks, f.received.knowledgeTasks);
    assert.equal(state.connections, undefined);
    assert.ok(!JSON.stringify(state).includes("ONLY_ORIGINAL_BODY"));
    const compiler = createKnowledgeCompilation(restored, { files: f.files });
    assert.equal(
      (await compiler.check({ taskId: f.task.id })).status,
      "revoked",
    );
    await assert.rejects(
      compiler.receive({
        taskId: f.task.id,
        candidate: f.candidate,
        expectedRevision: state.revision,
      }),
      { status: 409 },
    );
  }));

test("备份合并追加新任务与兼容候选；旧备份不回退版本或归档", () =>
  fixture(async (f) => {
    const target = await f.open("target");
    await target.write(seed(), { initialize: true });
    const firstPreview = await target.previewImport(f.received);
    assert.equal(firstPreview.summary.added.knowledgeTasks, 1);
    const first = await target.importBackup(f.received, firstPreview.token);
    assert.deepEqual(first.knowledgeTasks, f.received.knowledgeTasks);
    const second = await f.compiler.receive({
      taskId: f.task.id,
      candidate: { ...f.candidate, summary: "第二版" },
      expectedRevision: f.received.revision,
    });
    const archived = await f.compiler.archive({
      taskId: f.task.id,
      expectedRevision: second.state.revision,
    });
    const preview = await target.previewImport(archived.state);
    assert.equal(preview.summary.knowledgeVersions, 1);
    const merged = await target.importBackup(archived.state, preview.token);
    assert.deepEqual(merged.knowledgeTasks, archived.state.knowledgeTasks);
    const oldPreview = await target.previewImport(f.received);
    const older = await target.importBackup(f.received, oldPreview.token);
    assert.deepEqual(older.knowledgeTasks, merged.knowledgeTasks);
    assert.equal(older.connections, undefined);
    const legacy = seed();
    const legacyPreview = await target.previewImport(legacy);
    const compatible = await target.importBackup(legacy, legacyPreview.token);
    assert.deepEqual(compatible.knowledgeTasks, merged.knowledgeTasks);
  }));

test("备份拒绝同任务身份变更、候选分叉和请求身份分叉，失败不写入", () =>
  fixture(async (f) => {
    const before = await f.repository.read();
    for (const change of [
      (task) => {
        task.question = "冒充另一项整理";
      },
      (task) => {
        task.id = "another-id-for-same-request";
      },
      (task) => {
        task.candidates[0].candidate.summary = "覆盖旧结论";
      },
      (task) => {
        task.candidates[0].receivedAt = "2026-01-01T00:00:00.000Z";
      },
    ]) {
      const backup = structuredClone(before),
        task = backup.knowledgeTasks[0];
      change(task);
      task.manifestHash = manifestHash(task);
      for (const version of task.candidates) {
        version.candidate.taskId = task.id;
        version.candidate.manifestHash = task.manifestHash;
        version.sha256 = compilationHash(version.candidate);
      }
      await assert.rejects(f.repository.previewImport(backup), { status: 409 });
      assert.deepEqual(await f.repository.read(), before);
    }
  }));

test("通用保存不能创建、删除、篡改或归档整理历史，专用事务也不能回退历史", () =>
  fixture(async (f) => {
    const before = await f.repository.read();
    const empty = await f.open("generic-initial");
    const initial = await empty.write(seed(), { initialize: true });
    await assert.rejects(
      empty.write({ ...initial, knowledgeTasks: before.knowledgeTasks }),
      /专用操作/,
    );
    assert.deepEqual(await empty.read(), initial);
    for (const change of [
      (state) => {
        delete state.knowledgeTasks;
      },
      (state) => {
        state.knowledgeTasks = [];
      },
      (state) => {
        state.knowledgeTasks[0].archived = true;
      },
      (state) => {
        state.knowledgeTasks[0].candidates = [];
      },
    ]) {
      const changed = structuredClone(before);
      change(changed);
      await assert.rejects(f.repository.write(changed), /专用操作/);
      assert.deepEqual(await f.repository.read(), before);
    }
    await assert.rejects(
      f.repository.updateKnowledge(() => [], {
        expectedRevision: before.revision,
      }),
      { status: 400 },
    );
    await assert.rejects(
      f.repository.updateKnowledge(
        (tasks) => tasks.map((task) => ({ ...task, candidates: [] })),
        { expectedRevision: before.revision },
      ),
      { status: 400 },
    );
    assert.deepEqual(await f.repository.read(), before);
    const archived = await f.compiler.archive({
      taskId: f.task.id,
      expectedRevision: before.revision,
    });
    await assert.rejects(
      f.repository.updateKnowledge(
        (tasks) => tasks.map((task) => ({ ...task, archived: false })),
        { expectedRevision: archived.state.revision },
      ),
      { status: 400 },
    );
    assert.deepEqual(await f.repository.read(), archived.state);
  }));

test("缺 knowledgeTasks 的旧版快照仍合法，导入不替换当前知识连接", () =>
  fixture(async (f) => {
    const before = await f.repository.read();
    const backup = structuredClone(before);
    backup.connections.knowledgeSources[0].generation = "old-generation";
    const preview = await f.repository.previewImport(backup);
    const merged = await f.repository.importBackup(backup, preview.token);
    assert.deepEqual(merged.connections, before.connections);
    assert.equal(
      (await f.compiler.check({ taskId: f.task.id })).status,
      "unchanged",
    );
    const empty = await f.open("old-backup");
    const legacy = seed();
    delete legacy.knowledgeTasks;
    const legacyPreview = await empty.previewImport(legacy);
    const legacyState = await empty.importBackup(legacy, legacyPreview.token);
    assert.equal(legacyState.knowledgeTasks, undefined);
  }));
