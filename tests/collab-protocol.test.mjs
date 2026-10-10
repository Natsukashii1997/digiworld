import { test } from "node:test";
import assert from "node:assert/strict";
import {
  parseProtocolHead,
  projectProtocolRuns,
  inferRunPhase,
  writerConflict,
  protocolPath,
  runPrompt,
} from "../src/collab-protocol.js";
import { pendingItems } from "../src/pending.js";
import { seed } from "../src/store.js";
import { collabV16Fixture, CURRENT_V16 } from "./collab-v16-fixture.mjs";
import { writeFile, readFile, symlink, link } from "node:fs/promises";
import { join } from "node:path";
const head = (fields, path = "docs/agents/handoffs/one.md") =>
  parseProtocolHead(
    "# 交接\n" +
      Object.entries(fields)
        .map(([k, v]) => `| ${k} | ${v} |`)
        .join("\n") +
      "\n## 正文\n| status | passed |",
    { path },
  );
const current = (fields) => ({
  fields: {
    stateId: "WB-1",
    runId: "one",
    title: "事项",
    writer: "无",
    phase: 6,
    ...fields,
  },
  conflicts: [],
});
const project = (
  f = {},
  docs = [],
  now = Date.parse("2026-10-06T12:00:00+08:00"),
) =>
  projectProtocolRuns({
    projectId: "p",
    name: "项目",
    current: current(f),
    documents: docs,
    now,
  });
const event = (f = {}) =>
  head({
    run_id: "one",
    event_id: "e1",
    phase: 6,
    actor: "Claude Code",
    status: "working",
    at: "2026-10-06T10:00:00+08:00",
    ...f,
  });
test("协议文首白名单与正文隔离", () => {
  const x = event();
  assert.equal(x.fields.status, "working");
  assert.equal(x.phase, 6);
  assert.deepEqual(x.conflicts, []);
});
test("CURRENT字段不会读到后续历史", () => {
  const x = parseProtocolHead(
    CURRENT_V16 + "\n## 历史\n| 当前写入者 | Codex |",
    { current: true },
  );
  assert.equal(x.fields.writer, "Claude Code");
  assert.equal(x.fields.runId, "notes");
});
test("旧 CURRENT 的交接链接与状态句不冒充运行标题，原文仍保留", () => {
  const legacy = parseProtocolHead(
    "# 合成项目\n## 协作状态\n" +
    "| state_id | WB-258 |\n" +
    "| 当前写入者 | Codex |\n" +
    "| 当前任务 | [Codex 认领258](docs/agents/handoffs/claim-258.md)：修复六张截图的问题 |\n" +
    "| 唯一下一步 | Codex 完成本轮返修 |\n",
    { current: true },
  );
  const [run] = projectProtocolRuns({ projectId: "p", name: "合成项目", current: legacy });
  assert.equal(run.title, "当前协作");
  assert.equal(run.taskSummary, "Codex 认领258：修复六张截图的问题");
  assert.match(run.taskRaw, /\]\(docs\/agents\/handoffs\/claim-258\.md\)/);
  assert.equal(run.stableId, false);
  assert.equal(run.startedAt, "");
  assert.equal(run.pace, null);
  const explicit = project({ title: "明确登记的事项", task: legacy.fields.task })[0];
  assert.equal(explicit.title, "明确登记的事项");
  assert.equal(explicit.taskSummary, "");
});
test("重复冲突、缺字段、阶段和日期格式错误保持未知", () => {
  assert.ok(
    parseProtocolHead(
      "# x\n| run_id | r |\n| phase | 21 |\n| at | tomorrow |\n| phase | 3 |",
    ).conflicts.length >= 3,
  );
  assert.equal(parseProtocolHead("no fields").phase, null);
  assert.equal(inferRunPhase({}).number, null);
});
test("凭据字段不返回原值，危险路径不成为链接", () => {
  assert.equal(
    event({ method: "token=secret-value" }).fields.method,
    "[已隐去]",
  );
  for (const s of [
    "../x",
    "/x",
    ".env",
    "a/.git/config",
    "https://x",
    "x?token=1",
  ])
    assert.equal(protocolPath(s), "");
  assert.equal(protocolPath("[资料](docs/a.md)"), "docs/a.md");
});
test("Claude逐区与真人终验区分；已知阶段优先", () => {
  assert.equal(inferRunPhase({ writer: "Claude逐区验收" }).number, 6);
  assert.equal(inferRunPhase({ next: "停等用户确认" }).number, 7);
  assert.equal(inferRunPhase({ phase: 4, next: "之后用户终验" }).number, 4);
});
test("写入者冲突不掩盖，无后释放不误判", () => {
  assert.equal(writerConflict("Codex / Claude"), true);
  assert.equal(writerConflict("无；Claude交接后释放"), false);
  assert.equal(writerConflict("无法读取"), false);
});
test("不同事项绝不拼接，未记录前序站不默认通过", () => {
  const rows = project({}, [
    event(),
    event({ run_id: "two", event_id: "e2", phase: 8, status: "passed" }),
  ]);
  assert.equal(rows.length, 2);
  assert.equal(rows[0].stations[0].status, "unknown");
  assert.equal(rows[0].stations[6].status, "unknown");
  assert.equal(rows[1].events.length, 1);
});
test("老稿只有明确CURRENT引用才归属，标题不伪造完成", () => {
  const old = head({ status: "passed" }, "docs/agents/handoffs/legacy.md");
  const rows = project(
    { runId: undefined, handoff: "[旧](docs/agents/handoffs/legacy.md)" },
    [old],
  );
  assert.equal(rows[0].events.length, 0);
  assert.ok(rows[0].partial);
});
test("唯一事件去重与内容冲突", () => {
  assert.equal(project({}, [event(), event()])[0].events.length, 1);
  assert.ok(project({}, [event(), event({ status: "failed" })])[0].conflict);
});
test("返修按事件计数；最新进展解除旧失败，不删除返修事实", () => {
  const r = project({}, [
    event({
      event_id: "failed",
      status: "failed",
      at: "2026-10-05T12:00:00+08:00",
    }),
    event(),
  ])[0];
  assert.equal(r.reworks, 1);
  assert.equal(
    r.alerts.some((a) => a.kind === "failed"),
    false,
  );
});
test("同阶段先后无法确定显示冲突不显示通过", () => {
  assert.ok(
    project({}, [event(), event({ event_id: "other", status: "passed" })])[0]
      .conflict,
  );
});
test("停滞严格超过3天，未知/无关提交不刷新阶段时钟", () => {
  const at = "2026-10-03T12:00:00+08:00";
  assert.equal(
    project({ stageStartedAt: at })[0].alerts.some((a) => a.kind === "stalled"),
    false,
  );
  assert.equal(
    project(
      { stageStartedAt: at },
      [],
      Date.parse("2026-10-06T12:00:00+08:00") + 1,
    )[0].alerts.some((a) => a.kind === "stalled"),
    true,
  );
  assert.equal(project()[0].idleDays, null);
});
test("用户闸门须明确确认；Agent通过不等于闸门", () => {
  const r = project({}, [event({ phase: 1, status: "passed" })])[0];
  assert.equal(r.stations[0].event.gate, false);
});
test("异常进主线，等确认进支线，读取失败不是零", () => {
  const r = project({
    phase: 7,
    writer: "Codex/Claude",
    next: "等用户确认",
  })[0];
  const items = pendingItems(
    seed(),
    { items: [], loaded: true },
    { items: [] },
    {},
    undefined,
    undefined,
    {
      collabStatus: {
        loaded: true,
        items: [
          {
            projectId: "p",
            name: "项目",
            protocol: { state: "ok", runs: [r] },
          },
        ],
      },
    },
  );
  assert.ok(
    items.some(
      (i) => i.id.startsWith("collab-main-") && i.triage === "需要决定",
    ),
  );
  assert.ok(
    items.some(
      (i) => i.id.startsWith("collab-wait-") && i.triage === "等你确认",
    ),
  );
});
test("口令保留原权限规则并附当前事项方法，不含凭据", () => {
  const text = runPrompt(
    {
      root: "/fixture/project",
      name: "项目",
      current: {
        state: "ok",
        path: "CURRENT.md",
        fields: { stateId: "WB-1", writer: "无", next: "继续" },
      },
      entryFiles: ["AGENTS.md", "CURRENT.md"],
    },
    project()[0],
    "codex",
  );
  assert.match(text, /冻结批准参照|核对交接/);
  assert.match(text, /不替另一方声称已读/);
  assert.match(text, /未记载的过关/);
});
test("真实隔离HTTP读协议、指纹、Git佐证，无正文回传/主库写入", async () => {
  const app = await collabV16Fixture();
  try {
    const before = await app.workspace(),
      p = join(app.paths.collab, "CURRENT.md"),
      source = await readFile(p, "utf8");
    const r = await app.call("/collab/protocol", {});
    assert.equal(r.status, 200);
    const i = r.body.items[0];
    assert.equal(i.protocol.runs.length, 3);
    assert.equal(i.protocol.runs[0].reworks, 1);
    assert.equal(i.protocol.git.state, "ok");
    assert.doesNotMatch(JSON.stringify(r.body), /BODY-MARKER/);
    assert.equal((await app.workspace()).revision, before.revision);
    assert.equal(await readFile(p, "utf8"), source);
    await writeFile(p, source.replace("Claude Code |", "Codex |"));
    const after = await app.call("/collab/protocol", {});
    assert.notEqual(
      after.body.items[0].protocol.fingerprint,
      i.protocol.fingerprint,
    );
    assert.equal(
      (await app.call("/collab/protocol", { root: "/etc" })).status,
      400,
    );
  } finally {
    await app.close();
  }
});

test("整数阶段、时区排序与终态停滞边界", () => {
  assert.ok(event({ phase: 1.5 }).conflicts.length);
  const r = project({}, [
    event({
      event_id: "older",
      at: "2026-10-06T09:00:00+08:00",
      status: "failed",
    }),
    event({ event_id: "newer", at: "2026-10-06T02:00:00Z", status: "passed" }),
  ])[0];
  assert.equal(r.stations[5].status, "passed");
  assert.equal(
    project({ phase: 8 }, [
      event({ phase: 8, status: "passed", at: "2026-10-01T00:00:00Z" }),
    ])[0].alerts.some((a) => a.kind === "stalled"),
    false,
  );
  assert.equal(writerConflict("Claude（认领104，随后Codex复核）"), false);
  assert.equal(project({ writer: "无；Claude交接后释放" })[0].holder, "");
});

test("无时间及同事件冲突不得显示通过或确认，writer只解析持笔主体", () => {
  const missing = project({}, [
    event({ at: "", status: "passed", gate: "confirmed" }),
  ])[0];
  assert.equal(missing.stations[5].status, "unknown");
  assert.equal(missing.stations[5].ambiguous, true);
  const duplicate = project({}, [
    event({ status: "passed", gate: "confirmed" }),
    event({ status: "failed" }),
  ])[0];
  assert.equal(duplicate.stations[5].status, "unknown");
  const sameTime = project({}, [
    event({ status: "passed", gate: "confirmed" }),
    event({ event_id: "e2", status: "passed", gate: "" }),
  ])[0];
  assert.equal(sameTime.stations[5].status, "unknown");
  assert.equal(
    project({ writer: "Claude（认领104，随后Codex复核）" })[0].holder,
    "claude-code",
  );
});
test("持续缺失的当前交接保持可诊断且禁止生成口令", async () => {
  const app = await collabV16Fixture();
  try {
    await writeFile(
      join(app.paths.collab, "CURRENT.md"),
      CURRENT_V16.replace("2026-10-07-notes-5.md", "missing.md"),
    );
    for (let i = 0; i < 2; i++) {
      const r = await app.call("/collab/protocol", {}),
        p = r.body.items[0].protocol;
      assert.equal(p.state, "partial");
      assert.equal(p.copyBlocked, true);
      assert.ok(p.readErrors.some((e) => e.includes("missing.md")));
      assert.ok(p.runs.length);
    }
  } finally {
    await app.close();
  }
});

test("冲突文首不得留下同阶段旧通过", () => {
  const run = project({}, [
    event({ status: "passed", gate: "confirmed" }),
    event({ event_id: "bad", at: "bad-date" }),
  ])[0];
  assert.equal(run.stations[5].status, "unknown");
  assert.equal(run.stations[5].ambiguous, true);
});

test("已明确用户确认的第七阶段不重复制造待办，CURRENT新要求仍有效", () => {
  const done = event({ phase: 7, status: "passed", gate: "confirmed" });
  assert.equal(
    project({ phase: 7 }, [done])[0].alerts.some((a) => a.kind === "waiting"),
    false,
  );
  assert.equal(
    project({ phase: 7, next: "等待用户确认新的改动" }, [done])[0].alerts.some(
      (a) => a.kind === "waiting",
    ),
    true,
  );
});


test("conflict guidance routes explicit blocked states to the responsible next action", async () => {
  const {collabAlertGuidance} = await import('../src/collab-protocol.js');
  assert.match(collabAlertGuidance({writer:'Codex / Claude',alerts:[{kind:'conflict',main:true}]})[0],/唯一写入者/);
  assert.match(collabAlertGuidance({writer:'Codex',alerts:[{kind:'conflict',main:true}]})[0],/统一冲突字段/);
  const decision = collabAlertGuidance({alerts:[{kind:'failed',main:true},{kind:'needs_decision',main:true},{kind:'waiting',main:false}]});
  assert.equal(decision.length,1);assert.match(decision[0],/由你决定/);
  assert.match(collabAlertGuidance({alerts:[{kind:'failed',main:true}]})[0],/原实现 Agent/);
  assert.match(collabAlertGuidance({alerts:[{kind:'stalled',main:true}]})[0],/依赖和阻塞原因/);
  assert.deepEqual(collabAlertGuidance({alerts:[{kind:'waiting',main:false}]}),[]);
});
