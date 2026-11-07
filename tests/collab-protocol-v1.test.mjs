import { test } from "node:test";
import assert from "node:assert/strict";
import { writeFile, unlink } from "node:fs/promises";
import { join } from "node:path";
import {
  parseProtocolHead,
  projectProtocolRuns,
  summarizeProtocolIssues,
  runPrompt,
} from "../src/collab-protocol.js";
import { DESIGN_IMPLEMENTATION_V1 } from "../src/workflow-template.js";
import { makeAsset } from "../src/store.js";
import { collabV16Fixture } from "./collab-v16-fixture.mjs";
import { macOnly, VOLUME_UUID } from "./mac-only.mjs";

const at = (day) => `2026-10-${String(day).padStart(2, "0")}T10:00:00+08:00`;
const doc = (eventId, phase, status, issueId = "", day = 6) =>
  parseProtocolHead(
    `# 合成交接\n| run_id | one |\n| event_id | ${eventId} |\n| phase | ${phase} |\n| actor | Codex |\n| status | ${status} |\n| at | ${at(day)} |\n${issueId ? `| issue_id | ${issueId} |\n` : ""}## 正文\n未返回正文`,
    { path: `docs/agents/handoffs/${eventId}.md` },
  );
const asset = () => ({
  id: "workflow1",
  type: "Workflow",
  versions: [
    { id: "locked1", title: "设计实现流 v1", workflowTemplate: DESIGN_IMPLEMENTATION_V1 },
    { id: "newer2", title: "新版", workflowTemplate: {
      ...DESIGN_IMPLEMENTATION_V1,
      stages: DESIGN_IMPLEMENTATION_V1.stages.map((stage) =>
        stage.number === 9 ? { ...stage, label: "新版存档" } : stage),
    } },
  ],
});
const setting = (overrides = {}) => ({
  projectId: "project1",
  runId: "one",
  round: "UI v16",
  issuesPath: "docs/issues.md",
  templateAssetId: "workflow1",
  templateVersionId: "locked1",
  pace: "continuous",
  functionOnly: false,
  actorOverrides: [{ phase: 4, actor: "hermes" }],
  ...overrides,
});
const project = (options = {}) => projectProtocolRuns({
  projectId: "project1",
  name: "合成项目",
  current: {
    fields: { runId: "one", title: "功能单", phase: 9, writer: "无", stateId: "WB-9" },
    conflicts: [],
  },
  assets: [asset()],
  runSettings: [setting()],
  issuesByPath: { "docs/issues.md": summarizeProtocolIssues(
    "| # | 问题 | 结论 |\n|---|---|---|\n| 1 | 合成问题 | |",
    "docs/issues.md",
  ) },
  documents: [],
  now: Date.parse(at(6)),
  ...options,
})[0];

test("阶段 9 属于新版协议；无绑定的旧运行仍是八站，第七终验、第八存档", () => {
  assert.equal(doc("archive", 9, "working").phase, 9);
  assert.ok(parseProtocolHead("# 交接\n| run_id | one |\n| phase | 21 |").conflicts.length);
  const legacy = project({ runSettings: [], documents: [doc("archive", 9, "working")] });
  assert.equal(legacy.stations.length, 8);
  assert.equal(legacy.stations[6].label, "终验");
  assert.equal(legacy.stations[7].label, "存档");
  assert.equal(legacy.phase.number, null);
  assert.equal(legacy.copyBlocked, true);
});

test("锁定版本渲染九站、执行者替换与节奏；不自动采用最新版", () => {
  const run = project();
  assert.equal(run.templateState, "bound");
  assert.equal(run.templateVersionId, "locked1");
  assert.equal(run.stations.length, 9);
  assert.equal(run.stations[8].label, "存档");
  assert.equal(run.stations[3].actor, "hermes");
  assert.equal(run.stations[3].actorOverridden, true);
  assert.equal(run.stations[6].label, "运行采用");
  assert.equal(run.terminalFrom, 8);
  assert.equal(run.pace, "continuous");
  assert.equal(run.round, "UI v16");
  assert.equal(run.issues.count, 1);
  assert.equal(run.copyBlocked, true);
  assert.equal(project({ documents: [doc("named", "存档", "working")] }).events[0].phase, 9);
  assert.equal(project({ documents: [doc("runtime", "运行采用", "working")] }).events[0].phase, 7);
  const missing = project({ assets: [{ ...asset(), versions: [asset().versions[1]] }] });
  assert.equal(missing.templateState, "unknown");
  assert.deepEqual(missing.stations, []);
  assert.equal(missing.phase.number, null);
  assert.equal(missing.copyBlocked, true);
});

test("纯功能只跳可跳过的首两站，跳过不伪造过关或用户确认", () => {
  const run = project({
    current: { fields: { runId: "one", phase: 3, writer: "无", stateId: "WB-3" }, conflicts: [] },
    runSettings: [setting({ functionOnly: true })],
  });
  assert.deepEqual(run.stations.slice(0, 3).map((stage) => stage.status),
    ["skipped", "skipped", "unknown"]);
  assert.equal(run.stations[0].event, null);
  assert.equal(run.stations[0].current, false);
  assert.equal(run.copyBlocked, false);
  const invalidSkip = project({ documents: [doc("badskip", 3, "skipped")] });
  assert.equal(invalidSkip.stations[2].status, "unknown");
  assert.equal(invalidSkip.conflict, true);
  const sourceStillAtSkippedStation = project({
    current: { fields: { runId: "one", phase: 1, writer: "无", stateId: "WB-1" }, conflicts: [] },
    runSettings: [setting({ functionOnly: true })],
  });
  assert.equal(sourceStillAtSkippedStation.conflict, true);
  assert.equal(sourceStillAtSkippedStation.copyBlocked, true);
  assert.match(sourceStillAtSkippedStation.conflicts.join("；"), /已跳过/);
});

test("同项返修达到阈值才请求决定；无标识或不同项不累计升级，后续通过解除", () => {
  assert.equal(parseProtocolHead(
    `# 交接\n| run_id | one |\n| event_id | cn |\n| phase | 6 |\n| actor | Claude |\n| status | failed |\n| at | ${at(6)} |\n| 返修项 | 组件A |`,
  ).fields.issueId, "组件A");
  const common = { current: {
    fields: { runId: "one", phase: 6, writer: "Claude", stateId: "WB-6" },
    conflicts: [],
  } };
  const same = project({ ...common, documents: [
    doc("f1", 6, "failed", "UI-1", 3), doc("f2", 6, "failed", "UI-1", 4),
  ] });
  assert.equal(same.reworks, 2);
  assert.equal(same.repairIssues[0].needsDecision, true);
  assert.ok(same.alerts.some((alert) => alert.kind === "needs_decision" && alert.main));
  assert.equal(same.stations[3].decisionRequired, true);
  assert.equal(same.stations[5].decisionRequired, true);
  const different = project({ ...common, documents: [
    doc("f1", 6, "failed", "UI-1", 3), doc("f2", 6, "failed", "UI-2", 4),
  ] });
  assert.equal(different.alerts.some((alert) => alert.kind === "needs_decision"), false);
  const unnamed = project({ ...common, documents: [
    doc("f1", 6, "failed", "", 3), doc("f2", 6, "failed", "", 4),
  ] });
  assert.equal(unnamed.reworks, 2);
  assert.equal(unnamed.alerts.some((alert) => alert.kind === "needs_decision"), false);
  const resolved = project({ ...common, documents: [
    doc("f1", 6, "failed", "UI-1", 3), doc("f2", 6, "failed", "UI-1", 4),
    doc("p1", 6, "passed", "UI-1", 5),
  ] });
  assert.equal(resolved.repairIssues[0].needsDecision, false);
  assert.equal(resolved.alerts.some((alert) => alert.kind === "needs_decision"), false);
});

test("待议清单只解析完整表，空结论计数；正文与损坏表不冒充零项", () => {
  const result = summarizeProtocolIssues(
    "# 待议\n| # | 问题 | 结论 |\n|---|---|---|\n| 1 | 问题A | 已定 |\n| 2 | 问题B | |\n\n## 私人正文\nSECRET-BODY",
    "docs/issues.md",
  );
  assert.equal(result.state, "ok");
  assert.equal(result.total, 2);
  assert.equal(result.count, 1);
  assert.doesNotMatch(JSON.stringify(result), /SECRET-BODY/);
  const missing = summarizeProtocolIssues("# 待议\n没有表", "docs/issues.md");
  assert.equal(missing.state, "unknown");
  assert.equal(missing.count, null);
  assert.deepEqual(missing.items, []);
  assert.equal(summarizeProtocolIssues(
    "| # | 问题 | 结论 |\n|---|---|---|\n| 1 | A | |\n| 1 | B | |",
    "docs/issues.md",
  ).state, "unknown");
});

test("锁定阶段口令使用第九站，缺版本不生成伪阶段", () => {
  const item = {
    root: "/synthetic/project", name: "合成项目",
    current: { state: "ok", path: "CURRENT.md",
      fields: { stateId: "WB-9", writer: "无", next: "核对存档" } },
    entryFiles: ["AGENTS.md", "CURRENT.md"],
  };
  const run = project();
  assert.match(runPrompt(item, run, "codex"), /当前展示阶段：存档/);
  assert.match(runPrompt(item, run, "codex"), /轮次：UI v16/);
  assert.match(runPrompt(item, run, "codex"), /版本 locked1/);
  assert.match(runPrompt(item, run, "codex"), /本阶段过关条件：你确认/);
  const missing = project({ assets: [] });
  assert.equal(missing.copyBlocked, true);
  assert.match(runPrompt(item, missing, "codex"), /当前展示阶段：未知/);
});

test("HTTP 只读待议表、版本与运行设置纳入指纹；缺清单计数未知", macOnly(VOLUME_UUID), async () => {
  const app = await collabV16Fixture();
  try {
    const projectId = await app.projectId("协同项目");
    const workflow = makeAsset({ title: "设计实现流", type: "Workflow",
      content: "合成模板", workflowTemplate: DESIGN_IMPLEMENTATION_V1 });
    const versionId = workflow.versions[0].id;
    const runSetting = { ...setting(), projectId, runId: "notes",
      templateAssetId: workflow.id, templateVersionId: versionId };
    await writeFile(join(app.paths.collab, "docs/issues.md"),
      "| # | 问题 | 结论 |\n|---|---|---|\n| 1 | 合成问题 | |\n");
    const before = await app.workspace();
    const write = await app.call("/workspace", {
      state: { ...before, assets: [...before.assets, workflow],
        collabRunSettings: [runSetting] },
    }, "PUT");
    assert.equal(write.status, 200, JSON.stringify(write.body));
    const first = (await app.call("/collab/protocol", {})).body.items[0].protocol;
    assert.equal(first.runs[0].stations.length, 9);
    assert.equal(first.runs[0].issues.count, 1);
    assert.doesNotMatch(JSON.stringify(first), /SECRET-BODY/);
    const state = await app.workspace();
    const changed = await app.call("/workspace", { state: {
      ...state, collabRunSettings: [{ ...runSetting, pace: "per-run" }],
    } }, "PUT");
    assert.equal(changed.status, 200, JSON.stringify(changed.body));
    const second = (await app.call("/collab/protocol", {})).body.items[0].protocol;
    assert.notEqual(second.fingerprint, first.fingerprint);
    await unlink(join(app.paths.collab, "docs/issues.md"));
    const third = (await app.call("/collab/protocol", {})).body.items[0].protocol;
    assert.equal(third.runs[0].issues.state, "unknown");
    assert.equal(third.runs[0].issues.count, null);
    assert.notEqual(third.fingerprint, second.fingerprint);
  } finally {
    await app.close();
  }
});
