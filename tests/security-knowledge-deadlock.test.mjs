import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { spawnSync } from "node:child_process";
import { createKnowledgeFiles } from "../server/knowledge-files.mjs";
import { createPolicyKnowledgeFiles } from "../server/knowledge-access-policy.mjs";
import { createKnowledgeConnections } from "../server/knowledge-connections.mjs";
import { createKnowledgeCompilation } from "../server/knowledge-compilation.mjs";
import { createKnowledgeWriteback } from "../server/knowledge-writeback.mjs";
import { createKnowledgeWriteFiles } from "../server/knowledge-write-files.mjs";
import { createKnowledgeWriteJournal } from "../server/knowledge-write-journal.mjs";
import { openRepository } from "../server/repository.mjs";
import { seed } from "../src/store.js";

const fixtureRoot = process.env.SECURITY_KNOWLEDGE_TEST_ROOT || tmpdir();
const scenario = process.env.KNOWLEDGE_DEADLOCK_SCENARIO;

async function exercise(stage) {
  await fs.mkdir(fixtureRoot, { recursive: true });
  const canonicalRoot = await fs.realpath(fixtureRoot);
  const base = await fs.mkdtemp(join(canonicalRoot, "knowledge-deadlock-"));
  let repository;
  let canClose = true;
  try {
    const root = join(base, "synthetic-source");
    const targetRoot = join(base, "synthetic-target");
    await fs.mkdir(root);
    await fs.mkdir(join(targetRoot, "00 待整理/生活"), { recursive: true });
    await fs.writeFile(join(root, "source.md"), "Synthetic source");
    repository = await openRepository(join(base, "data"));
    await repository.write(seed(), { initialize: true });
    const raw = createKnowledgeFiles();
    const files = createPolicyKnowledgeFiles(repository, raw);
    const connections = createKnowledgeConnections(repository, { files });
    for (const [name, path] of [
      ["source", root],
      ["target", targetRoot],
    ]) {
      await connections.connect({
        name,
        root: path,
        kind: "obsidian",
        confirmed: true,
        expectedRevision: (await repository.read()).revision,
      });
    }
    const [source, target] = (await repository.read()).connections
      .knowledgeSources;
    await repository.updateKnowledgeAccess((state) => ({
      connections: {
        ...state.connections,
        knowledgeSources: state.connections.knowledgeSources.map((s) => ({
          ...s,
          agentSharing: true,
        })),
      },
    }));
    const scan = await connections.scan({ sourceId: source.id });
    const selection = {
      sourceId: source.id,
      scanId: scan.scanId,
      path: "source.md",
    };
    const document = await connections.read(selection);
    const compilation = createKnowledgeCompilation(repository, {
      files,
      knowledge: connections,
    });
    const created = await compilation.create({
      question: "Synthetic question",
      selections: [{ ...selection, expectedSha256: document.sha256 }],
      confirmed: true,
      requestId: "deadlock-fixture",
      expectedRevision: (await repository.read()).revision,
    });
    const task = created.state.knowledgeTasks[0];
    const received = await compilation.receive({
      taskId: task.id,
      expectedRevision: created.state.revision,
      candidate: {
        schema: 1,
        taskId: task.id,
        manifestHash: task.manifestHash,
        title: "Synthetic candidate",
        summary: "Synthetic summary",
        claims: [
          {
            id: "claim",
            text: "Synthetic claim",
            kind: "hypothesis",
            evidenceIds: [task.evidence[0].id],
          },
        ],
        conflicts: [],
        unknowns: [],
        relations: [],
      },
    });
    let generation = 1;
    let now = Date.now();
    const clock = () => now;
    const settings = {
      assertEnabled: async () => ({
        generation,
        options: { sourceId: target.id },
      }),
    };
    const writer = createKnowledgeWriteFiles();
    const journal = createKnowledgeWriteJournal(repository.directory);
    async function destabilize() {
      await fs.rename(root, root + "-old");
      await fs.mkdir(root);
    }
    let armed = false;
    const evidenceFiles = {
      ...files,
      async read(...args) {
        const document = await files.read(...args);
        if (armed && ["preview-revision", "confirm-revision"].includes(stage)) {
          armed = false;
          await repository.updateNotes((notes) => [
            ...notes,
            {
              id: "synthetic-concurrent-note",
              text: "Synthetic concurrent edit",
              at: new Date().toISOString(),
            },
          ]);
        }
        if (armed && stage === "preview-authorization") {
          armed = false;
          generation++;
        }
        return document;
      },
    };
    const service = createKnowledgeWriteback(repository, {
      files: evidenceFiles,
      settings,
      clock,
      journal,
      writer: {
        ...writer,
        async create(...args) {
          const result = await writer.create(...args);
          if (stage === "post-write") await destabilize();
          return result;
        },
      },
    });
    const input = {
      taskId: task.id,
      versionId: received.state.knowledgeTasks[0].candidates[0].id,
      targetSourceId: target.id,
      domain: "生活",
      filename: "candidate.md",
    };
    let plan;
    const previewAction = [
      "preview",
      "preview-revision",
      "preview-authorization",
    ].includes(stage);
    if (!previewAction) plan = await service.preview(input);
    armed = true;
    if (["preview", "confirm"].includes(stage)) await destabilize();
    if (stage === "authorization") generation++;
    if (stage === "expiry") now += 300001;
    let timer;
    canClose = false;
    const outcome = await Promise.race([
      (previewAction
        ? service.preview(input)
        : service.apply({ previewId: plan.previewId, confirmed: true })
      ).then(
        (value) => ({ kind: "resolved", value }),
        (error) => ({
          kind: "rejected",
          status: error.status,
          message: error.message,
        }),
      ),
      new Promise((resolve) => {
        timer = setTimeout(() => resolve({ kind: "timeout" }), 1500);
      }),
    ]);
    clearTimeout(timer);
    let queueTimer;
    const queue = await Promise.race([
      repository.updateNotes((notes) => notes).then(() => "available"),
      new Promise((resolve) => {
        queueTimer = setTimeout(() => resolve("blocked"), 500);
      }),
    ]);
    clearTimeout(queueTimer);
    canClose = queue === "available";
    const state = await repository.read();
    const records = await journal.list();
    const result = {
      stage,
      outcome,
      queue,
      revoked:
        state.connections.knowledgeSources.find((s) => s.id === source.id)
          .agentSharing === false,
      health: state.connections.knowledgeSourceHealth?.find(
        (h) => h.sourceId === source.id,
      )?.status,
      prepared: records.length,
      applied: records.filter((r) => r.applied).length,
      targetExists: await fs
        .stat(join(targetRoot, "00 待整理/生活/candidate.md"))
        .then(
          () => true,
          () => false,
        ),
    };
    return result;
  } finally {
    try {
      if (repository && canClose) await repository.close();
    } finally {
      // A deadlocked child exits immediately after reporting, releasing its SQLite handle.
      await fs.rm(base, { recursive: true, force: true });
    }
  }
}

if (scenario) {
  try {
    console.log(JSON.stringify(await exercise(scenario)));
    process.exit(0);
  } catch (error) {
    console.error(error.stack);
    process.exit(1);
  }
} else {
  const scenarios = {
    preview: "预览时来源身份变化，拒绝后队列可用且撤权落库",
    confirm: "确认时来源身份变化，拒绝后队列可用且撤权落库",
    "post-write": "写后来源身份变化，保留未决记录且队列可用、撤权落库",
    authorization: "确认时授权代次变化，拒绝写入",
    expiry: "确认时预览过期，拒绝写入",
    "preview-revision": "预览核验期间主库版本变化，拒绝旧快照",
    "confirm-revision": "确认核验期间主库版本变化，拒绝旧快照",
    "preview-authorization": "预览核验期间授权变化，拒绝旧授权",
    success: "正常预览确认仍完成串行写入和成功回执",
  };
  for (const [stage, title] of Object.entries(scenarios)) {
    test(title, () => {
      const child = spawnSync(process.execPath, [import.meta.filename], {
        env: { ...process.env, KNOWLEDGE_DEADLOCK_SCENARIO: stage },
        encoding: "utf8",
        timeout: 15000,
      });
      assert.equal(child.status, 0, child.stderr || String(child.error));
      const result = JSON.parse(child.stdout.trim());
      assert.equal(result.queue, "available", JSON.stringify(result));
      if (stage === "success") {
        assert.equal(result.outcome.kind, "resolved", JSON.stringify(result));
        assert.equal(
          result.outcome.value.status,
          "applied",
          JSON.stringify(result),
        );
        assert.equal(result.applied, 1);
        assert.equal(result.prepared, 1);
        assert.equal(result.targetExists, true);
        return;
      }
      assert.equal(result.outcome.kind, "rejected", JSON.stringify(result));
      if (["preview", "confirm", "post-write"].includes(stage)) {
        assert.equal(result.revoked, true, JSON.stringify(result));
        assert.equal(
          result.health,
          "needs_reconfirmation",
          JSON.stringify(result),
        );
      }
      assert.equal(result.applied, 0, JSON.stringify(result));
      assert.equal(
        result.targetExists,
        stage === "post-write",
        JSON.stringify(result),
      );
      assert.equal(
        result.prepared,
        stage === "post-write" ? 1 : 0,
        JSON.stringify(result),
      );
      assert.equal(
        result.outcome.status,
        stage === "post-write" ? 503 : 409,
        JSON.stringify(result),
      );
    });
  }
}
