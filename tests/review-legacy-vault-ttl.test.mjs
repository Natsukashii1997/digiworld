// 从正式boundary专项复用相同初始化与严格断言；仅新增实际unlink前guard期间过期注入。
import {createKnowledgeWriteFiles} from '../server/knowledge-write-files.mjs';
import {createCapabilitySettings} from '../server/capability-settings.mjs';
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { openRepository } from "../server/repository.mjs";
import { createKnowledgeFiles } from "../server/knowledge-files.mjs";
import { createKnowledgeConnections } from "../server/knowledge-connections.mjs";
import { createKnowledgeCompilation } from "../server/knowledge-compilation.mjs";
import { createKnowledgeWriteback } from "../server/knowledge-writeback.mjs";
import { createKnowledgeWriteJournal } from "../server/knowledge-write-journal.mjs";
import { seed } from "../src/store.js";

// Keep the real journal and filesystem. Inject only a change at the durable
// receipt boundary, where expiry and directory identity can become stale.
for (const scenario of [
  "expiry-at-unlink-guard",
]) {
  test(`撤回持久化边界重新核验：${scenario}`, async () => {
    const base = await fs.realpath(
      await fs.mkdtemp(join(tmpdir(), "guiji-write-boundary-")),
    );
    const root = join(base, "vault");
    const parent = join(root, "00 待整理/工作/个人");
    await fs.mkdir(parent, { recursive: true });
    await fs.writeFile(join(root, "source.md"), "# Synthetic source");
    const repository = await openRepository(join(base, "database"));
    let now = Date.now();
    const clock = () => now;
    try {
      await repository.write(seed(), { initialize: true });
      const files = createKnowledgeFiles();
      const connections = createKnowledgeConnections(repository, {
        files,
        clock,
      });
      const state = await connections.connect({
        name: "Synthetic vault",
        root,
        kind: "obsidian",
        confirmed: true,
        expectedRevision: (await repository.read()).revision,
      });
      const source = state.connections.knowledgeSources[0];
      const scan = await connections.scan({ sourceId: source.id });
      const selection = {
        sourceId: source.id,
        scanId: scan.scanId,
        path: "source.md",
      };
      const doc = await connections.read(selection);
      const compilation = createKnowledgeCompilation(repository, {
        knowledge: connections,
        files,
        clock,
      });
      const created = await compilation.create({
        question: "Synthetic question",
        selections: [{ ...selection, expectedSha256: doc.sha256 }],
        confirmed: true,
        requestId: "boundary-request",
        expectedRevision: state.revision,
      });
      const task = created.state.knowledgeTasks[0];
      const received = await compilation.receive({
        taskId: task.id,
        candidate: {
          schema: 1,
          taskId: task.id,
          manifestHash: task.manifestHash,
          title: "Synthetic candidate",
          summary: "Candidate only",
          claims: [
            {
              id: "c1",
              text: "Source claim",
              kind: "source_statement",
              evidenceIds: [task.evidence[0].id],
            },
          ],
          conflicts: [],
          unknowns: [],
          relations: [],
        },
        expectedRevision: created.state.revision,
      });
      const version = received.state.knowledgeTasks[0].candidates[0];
      const journal = createKnowledgeWriteJournal(repository.directory);
      const settings=createCapabilitySettings(repository,{clock});const authorization=await settings.preview({capability:'vault',enabled:true,options:{sourceId:source.id,notesFolder:'00 待整理',profileFolders:[]}});await settings.apply({token:authorization.token,operationId:authorization.operationId,confirmed:true});
      const baseWriter=createKnowledgeWriteFiles();
      const service = createKnowledgeWriteback(repository, {
        writer:{...baseWriter,async remove(source,expected,options={}){return baseWriter.remove(source,expected,{guard:async()=>{now+=300001;await options.guard();}});}},
        settings,
        files,
        clock,
        journal: {
          ...journal,
          async receipt(id, kind, at, fingerprint) {
            await journal.receipt(id, kind, at, fingerprint);
            if (kind !== "rollback-started") return;
            if (scenario === "expiry-after-receipt") now += 300001;
            else if (scenario === "parent-replaced-after-receipt") {
              await fs.rename(parent, join(root, "preserved-original-parent"));
              await fs.mkdir(parent);
            }
          },
        },
      });
      const preview = await service.preview({
        taskId: task.id,
        versionId: version.id,
        targetSourceId: source.id,
        domain: "工作/个人",
        filename: "candidate.md",
      });
      const applied = await service.apply({
        previewId: preview.previewId,
        confirmed: true,
      });
      const withdrawal = await service["rollback-preview"]({
        operationId: applied.id,
      });
      await assert.rejects(
        service.rollback({ previewId: withdrawal.previewId, confirmed: true }),
        { status: 409 },
      );
      const check = await service.check({ operationId: applied.id });
      assert.equal(
        check.status,
        scenario !== "parent-replaced-after-receipt" ? "applied" : "changed",
      );
      const preservedPath =
        scenario !== "parent-replaced-after-receipt"
          ? join(parent, "candidate.md")
          : join(root, "preserved-original-parent/candidate.md");
      assert.equal(await fs.readFile(preservedPath, "utf8"), preview.content);
      assert.equal(
        (await service.history({ taskId: task.id })).items[0].status,
        check.status,
      );
    } finally {
      await repository.close();
      await fs.rm(base, { recursive: true, force: true });
    }
  });
}
