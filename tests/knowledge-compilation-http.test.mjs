import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { knowledgeQueryFixture } from "./knowledge-query-fixture.mjs";

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
