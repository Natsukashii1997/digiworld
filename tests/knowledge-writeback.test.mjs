import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { join } from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { knowledgeFixture } from "./knowledge-fixture.mjs";

async function fixture(run) {
  const f = await knowledgeFixture();
  try {
    await fs.mkdir(join(f.root, "00 待整理/工作/个人"), { recursive: true });
    let state = await f.workspace();
    state = (
      await f.call("/knowledge/connect", {
        name: "合成库",
        root: f.root,
        kind: "obsidian",
        confirmed: true,
        expectedRevision: state.revision,
      })
    ).body;
    const source = state.connections.knowledgeSources[0];
    const scan = (await f.call("/knowledge/scan", { sourceId: source.id }))
      .body;
    const selected = {
      sourceId: source.id,
      scanId: scan.scanId,
      path: "专题/判断原则.md",
    };
    const document = (await f.call("/knowledge/read", selected)).body;
    const created = await f.call("/knowledge/tasks/create", {
      question: "如何判断",
      selections: [{ ...selected, expectedSha256: document.sha256 }],
      confirmed: true,
      requestId: "write-fixture",
      expectedRevision: state.revision,
    });
    assert.equal(created.status, 200);
    const task = created.body.state.knowledgeTasks[0];
    const candidate = {
      schema: 1,
      taskId: task.id,
      manifestHash: task.manifestHash,
      title: "判断候选",
      summary: "先判断，再行动。",
      claims: [
        {
          id: "c1",
          text: "一次案例不能证明普遍规律。",
          kind: "analysis",
          evidenceIds: [task.evidence[0].id],
        },
      ],
      conflicts: [],
      unknowns: ["长期效果未知"],
      relations: [],
    };
    const received = await f.call("/knowledge/tasks/receive", {
      taskId: task.id,
      candidate,
      expectedRevision: created.body.state.revision,
    });
    assert.equal(received.status, 200);
    const version = received.body.state.knowledgeTasks[0].candidates[0];
    const input = {
      taskId: task.id,
      versionId: version.id,
      targetSourceId: source.id,
      domain: "工作/个人",
      filename: "判断候选.md",
    };
    await run({
      ...f,
      source,
      task,
      version,
      input,
      preview: () => f.call("/knowledge/writes/preview", input),
    });
  } finally {
    await f.close();
  }
}

test("固定候选经确认保存到待整理，历史可回读，明确撤回不影响原文或主库", () =>
  fixture(async (f) => {
    const before = await f.workspace();
    const preview = await f.preview();
    assert.equal(preview.status, 200);
    assert.equal(preview.body.path, "00 待整理/工作/个人/判断候选.md");
    assert.match(preview.body.content, /type: knowledge-candidate/);
    assert.match(preview.body.content, /retrieval: 停用/);
    assert.match(preview.body.content, /分析判断/);
    assert.match(preview.body.content, /长期效果未知/);
    const apply = await f.call("/knowledge/writes/apply", {
      previewId: preview.body.previewId,
      confirmed: true,
    });
    assert.equal(apply.status, 200);
    assert.equal(apply.body.status, "applied");
    const check = await f.call("/knowledge/writes/check", {
      operationId: apply.body.id,
    });
    assert.equal(check.body.status, "applied");
    assert.match(
      check.body.content,
      /source_refs:\n  - "\[\[专题\/判断原则.md\]\]"/,
    );
    const history = await f.call("/knowledge/writes/history", {
      taskId: f.task.id,
    });
    assert.equal(history.body.items[0].id, apply.body.id);
    const rollbackPreview = await f.call("/knowledge/writes/rollback-preview", {
      operationId: apply.body.id,
    });
    assert.equal(rollbackPreview.status, 200);
    const rollback = await f.call("/knowledge/writes/rollback", {
      previewId: rollbackPreview.body.previewId,
      confirmed: true,
    });
    assert.equal(rollback.status, 200);
    assert.equal(rollback.body.status, "rolled_back");
    assert.deepEqual(await f.workspace(), before);
    assert.equal(
      (await f.call("/knowledge/writes/check", { operationId: apply.body.id }))
        .body.status,
      "rolled_back",
    );
    await assert.rejects(fs.stat(join(f.root, preview.body.path)), {
      code: "ENOENT",
    });
  }));

test("确认不可省略，预览过期或候选归档时不创建文件", () =>
  fixture(async (f) => {
    let preview = (await f.preview()).body;
    assert.equal(
      (
        await f.call("/knowledge/writes/apply", {
          previewId: preview.previewId,
          confirmed: false,
        })
      ).status,
      400,
    );
    f.advance(300001);
    assert.equal(
      (
        await f.call("/knowledge/writes/apply", {
          previewId: preview.previewId,
          confirmed: true,
        })
      ).status,
      409,
    );
    f.resetClock();
    preview = (await f.preview()).body;
    assert.equal(
      (
        await f.call("/knowledge/tasks/archive", {
          taskId: f.task.id,
          expectedRevision: (await f.workspace()).revision,
        })
      ).status,
      200,
    );
    assert.equal(
      (
        await f.call("/knowledge/writes/apply", {
          previewId: preview.previewId,
          confirmed: true,
        })
      ).status,
      409,
    );
    assert.equal(
      (await f.call("/knowledge/writes/history", { taskId: f.task.id })).body
        .items.length,
      0,
    );
    await assert.rejects(fs.stat(join(f.root, preview.path)), {
      code: "ENOENT",
    });
  }));

test("源文件变化阻断保存，不把旧候选写成当前知识", () =>
  fixture(async (f) => {
    const preview = (await f.preview()).body;
    await f.changeFile();
    assert.equal(
      (
        await f.call("/knowledge/writes/apply", {
          previewId: preview.previewId,
          confirmed: true,
        })
      ).status,
      409,
    );
    await assert.rejects(fs.stat(join(f.root, preview.path)), {
      code: "ENOENT",
    });
  }));

test("断开目标后，旧预览不能写入；历史不读取已撤权的目标文件", () =>
  fixture(async (f) => {
    const preview = (await f.preview()).body;
    assert.equal(
      (
        await f.call("/knowledge/remove", {
          sourceId: f.source.id,
          confirmed: true,
          expectedRevision: (await f.workspace()).revision,
        })
      ).status,
      200,
    );
    assert.equal(
      (
        await f.call("/knowledge/writes/apply", {
          previewId: preview.previewId,
          confirmed: true,
        })
      ).status,
      409,
    );
    await assert.rejects(fs.stat(join(f.root, preview.path)), {
      code: "ENOENT",
    });
  }));

test("服务重开保留成功记录，旧确认不能重放，同字节替换不能撤回", () =>
  fixture(async (f) => {
    const preview = (await f.preview()).body;
    const applied = (
      await f.call("/knowledge/writes/apply", {
        previewId: preview.previewId,
        confirmed: true,
      })
    ).body;
    assert.equal(applied.status, "applied");
    await f.restart();
    const history = await f.call("/knowledge/writes/history", {
      taskId: f.task.id,
    });
    assert.equal(history.body.items[0].status, "applied");
    assert.equal(
      (
        await f.call("/knowledge/writes/apply", {
          previewId: preview.previewId,
          confirmed: true,
        })
      ).status,
      409,
    );
    const path = join(f.root, preview.path);
    const before = await fs.readFile(path);
    await fs.rename(path, join(f.root, "保存的原版本.md"));
    await fs.writeFile(path, before);
    const changed = await f.call("/knowledge/writes/check", {
      operationId: applied.id,
    });
    assert.equal(changed.body.status, "matching_unverified");
    assert.equal(
      (
        await f.call("/knowledge/writes/rollback-preview", {
          operationId: applied.id,
        })
      ).status,
      409,
    );
    assert.deepEqual(await fs.readFile(path), before);
  }));

test("撤回预览后有新编辑时保留编辑，记录不能假称已撤回", () =>
  fixture(async (f) => {
    const preview = (await f.preview()).body;
    const applied = (
      await f.call("/knowledge/writes/apply", {
        previewId: preview.previewId,
        confirmed: true,
      })
    ).body;
    const rollback = (
      await f.call("/knowledge/writes/rollback-preview", {
        operationId: applied.id,
      })
    ).body;
    await fs.appendFile(join(f.root, preview.path), "本人补充");
    assert.equal(
      (
        await f.call("/knowledge/writes/rollback", {
          previewId: rollback.previewId,
          confirmed: true,
        })
      ).status,
      409,
    );
    assert.equal(
      (await f.call("/knowledge/writes/check", { operationId: applied.id }))
        .body.status,
      "changed",
    );
    assert.match(
      await fs.readFile(join(f.root, preview.path), "utf8"),
      /本人补充/,
    );
  }));

test("保存的候选能被既有 wiki-local 解析，但不能绕过有效性门禁成为当前知识", () =>
  fixture(async (f) => {
    const preview = (await f.preview()).body;
    assert.equal(
      (
        await f.call("/knowledge/writes/apply", {
          previewId: preview.previewId,
          confirmed: true,
        })
      ).status,
      200,
    );
    const script =
      "import sys,json,importlib.util; from pathlib import Path; s=importlib.util.spec_from_file_location('wiki',sys.argv[1]); w=importlib.util.module_from_spec(s); s.loader.exec_module(w); docs,audit=w.inspect(Path(sys.argv[2])); _,reviewed=w.inspect(Path(sys.argv[2]),audit); print(json.dumps({'errors':audit['errors'],'read':w.read_current(docs,reviewed,sys.argv[3],'knowledge')},ensure_ascii=False,default=str))";
    const result = await promisify(execFile)("python3", [
      "-B",
      "-c",
      script,
      process.env.GUIJI_WIKI_HELPER ||
        join(import.meta.dirname, "../../wiki-local/wiki.py"),
      f.root,
      preview.path,
    ]);
    const value = JSON.parse(result.stdout);
    assert.deepEqual(value.errors, []);
    assert.equal(value.read.status, "blocked");
    assert.equal(Object.hasOwn(value.read, "content"), false);
  }));
