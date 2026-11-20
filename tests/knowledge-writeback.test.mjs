import {authorizeCapability} from './capability-fixture.mjs';
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { join } from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { knowledgeFixture } from "./knowledge-fixture.mjs";
import { existsSync } from "node:fs";

// wiki-local 是仓库外的同级目录（或用 GUIJI_WIKI_HELPER 指定），CI 检出里没有，找不到就跳过（#65）。
const wikiHelper =
  process.env.GUIJI_WIKI_HELPER || join(import.meta.dirname, "../../wiki-local/wiki.py");

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
    await authorizeCapability(f,'vault',{sourceId:source.id,notesFolder:'00 待整理',profileFolders:[]});
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

test("保存的候选能被既有 wiki-local 解析，但不能绕过有效性门禁成为当前知识", { skip: !existsSync(wikiHelper) && `需要仓库外的 ${wikiHelper}` }, () =>
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
      wikiHelper,
      f.root,
      preview.path,
    ]);
    const value = JSON.parse(result.stdout);
    assert.deepEqual(value.errors, []);
    assert.equal(value.read.status, "blocked");
    assert.equal(Object.hasOwn(value.read, "content"), false);
  }));
