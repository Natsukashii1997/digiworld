import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import {
  knowledgeQueryFixture,
  queryText,
} from "./knowledge-query-fixture.mjs";

async function prepare(t) {
  const f = await knowledgeQueryFixture();
  t.after(() => f.close());
  let state = await f.workspace();
  state = (
    await f.call("/knowledge/connect", {
      name: "合成整理来源",
      kind: "markdown",
      root: f.root,
      confirmed: true,
      expectedRevision: state.revision,
    })
  ).body;
  const sourceId = state.connections.knowledgeSources[0].id;
  const scan = (await f.call("/knowledge/scan", { sourceId })).body;
  const selections = [];
  for (const path of ["专题/判断原则.md", "长文.md"]) {
    const document = (
      await f.call("/knowledge/read", { sourceId, scanId: scan.scanId, path })
    ).body;
    selections.push({
      sourceId,
      scanId: scan.scanId,
      path,
      expectedSha256: document.sha256,
    });
  }
  const input = {
    question: "这些资料支持怎样的判断？保留证据不足和边界。",
    selections,
    confirmed: true,
    requestId: randomUUID(),
    expectedRevision: state.revision,
  };
  return { ...f, sourceId, input };
}

export function candidateFor(task) {
  const [first, second] = task.evidence.map((entry) => entry.id);
  return {
    schema: 1,
    taskId: task.id,
    manifestHash: task.manifestHash,
    title: "合成候选：判断证据与范围",
    summary: "两份资料没有证明因果关系；仅保留来源陈述和待核验的问题。",
    claims: [
      {
        id: "claim-1",
        kind: "analysis",
        text: "<script>window.candidateExecuted=true</script> 不能由资料数量推断独立支持。",
        evidenceIds: [first, second],
      },
    ],
    conflicts: [
      {
        text: "两份材料是否针对相同条件仍需确认。",
        evidenceIds: [first, second],
      },
    ],
    unknowns: ["缺乏真实效果证据。"],
    relations: [
      {
        text: "这些资料可以围绕同一个判断问题关联。",
        evidenceIds: [first, second],
      },
    ],
  };
}

test("整理HTTP：创建→原生任务包→候选导入→检查→备份→归档，仅存候选不改源", async (t) => {
  const f = await prepare(t);
  const created = await f.call("/knowledge/tasks/create", f.input);
  assert.equal(created.status, 200, created.body.error);
  let state = created.body.state;
  const task = state.knowledgeTasks.find((v) => v.id === created.body.taskId);
  assert.equal(task.evidence.length, 2);
  assert.equal(JSON.stringify(state).includes("正文独有"), false);
  const repeated = await f.call("/knowledge/tasks/create", f.input);
  assert.equal(repeated.status, 200, repeated.body.error);
  assert.equal(repeated.body.taskId, task.id);
  assert.equal(repeated.body.state.revision, state.revision);
  const packet = await f.call("/knowledge/tasks/packet", {
    taskId: task.id,
    confirmed: true,
  });
  assert.equal(packet.status, 200, packet.body.error);
  assert.ok(packet.body.text.includes(task.manifestHash));
  assert.match(packet.body.text, /Codex/);
  assert.equal(packet.body.text.includes("正文独有"), false);
  const received = await f.call("/knowledge/tasks/receive", {
    taskId: task.id,
    candidate: candidateFor(task),
    expectedRevision: state.revision,
  });
  assert.equal(received.status, 200, received.body.error);
  state = received.body.state;
  assert.equal(state.knowledgeTasks[0].candidates.length, 1);
  const checked = await f.call("/knowledge/tasks/check", { taskId: task.id });
  assert.equal(checked.status, 200, checked.body.error);
  assert.equal(checked.body.status, "unchanged");
  assert.equal(checked.body.items.length, 2);
  f.advance(11 * 60 * 1000);
  assert.equal(
    (await f.call("/knowledge/tasks/check", { taskId: task.id })).body.status,
    "unchanged",
  );
  const backup = await f.call("/backup");
  assert.equal(backup.body.state.knowledgeTasks.length, 1);
  assert.equal(JSON.stringify(backup.body).includes("正文独有"), false);
  assert.equal(await f.original(), queryText);
  const archived = await f.call("/knowledge/tasks/archive", {
    taskId: task.id,
    expectedRevision: state.revision,
  });
  assert.equal(archived.status, 200, archived.body.error);
  assert.equal(archived.body.state.knowledgeTasks[0].archived, true);
});

test("整理HTTP：伪造与未知字段不写入，旧revision不覆盖，变化与撤权不返回可交付包", async (t) => {
  const f = await prepare(t);
  assert.equal(
    (await f.call("/knowledge/tasks/create", { ...f.input, root: f.root }))
      .status,
    400,
  );
  const created = await f.call("/knowledge/tasks/create", f.input);
  assert.equal(created.status, 200, created.body.error);
  const task = created.body.state.knowledgeTasks[0];
  const valid = candidateFor(task);
  for (const candidate of [
    { ...valid, approved: true },
    { ...valid, manifestHash: "0".repeat(64) },
    { ...valid, claims: [{ ...valid.claims[0], evidenceIds: ["forged"] }] },
  ])
    assert.equal(
      (
        await f.call("/knowledge/tasks/receive", {
          taskId: task.id,
          candidate,
          expectedRevision: created.body.state.revision,
        })
      ).status,
      400,
    );
  assert.equal(
    (
      await f.call("/knowledge/tasks/receive", {
        taskId: task.id,
        candidate: valid,
        expectedRevision: 0,
      })
    ).status,
    409,
  );
  await f.changeFile("专题/判断原则.md", "# 来源已经更正\n不能再使用旧证据。");
  const changed = await f.call("/knowledge/tasks/check", { taskId: task.id });
  assert.equal(changed.body.status, "changed");
  assert.equal(
    (
      await f.call("/knowledge/tasks/packet", {
        taskId: task.id,
        confirmed: true,
      })
    ).status,
    409,
  );
  const before = await f.workspace();
  await f.call("/knowledge/remove", {
    sourceId: f.sourceId,
    confirmed: true,
    expectedRevision: before.revision,
  });
  assert.equal(
    (await f.call("/knowledge/tasks/check", { taskId: task.id })).body.status,
    "revoked",
  );
  assert.notEqual(
    (
      await f.call("/knowledge/tasks/receive", {
        taskId: task.id,
        candidate: valid,
        expectedRevision: (await f.workspace()).revision,
      })
    ).status,
    200,
  );
});

test("整理HTTP：所有新动作继承同源/会话门禁且不泄露资料", async (t) => {
  const f = await prepare(t);
  const session = await (
    await fetch(f.url + "/api/session", {
      headers: { "X-Workbench-Client": "1" },
    })
  ).json();
  for (const action of ["create", "packet", "receive", "check", "archive"]) {
    for (const extra of [
      {},
      { "X-Workbench-Token": session.token, Origin: "https://example.com" },
    ]) {
      const result = await fetch(f.url + "/api/knowledge/tasks/" + action, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...extra },
        body: "{}",
      });
      assert.equal(result.status, 403);
      assert.ok(!(await result.text()).includes(f.root));
    }
  }
});
