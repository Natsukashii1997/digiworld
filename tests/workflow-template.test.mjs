import { test } from "node:test";
import assert from "node:assert/strict";
import {
  DESIGN_IMPLEMENTATION_V1,
  freshDesignImplementationV1,
  validateWorkflowTemplate,
} from "../src/workflow-template.js";
import { makeAsset, revise, restore, current, seed } from "../src/store.js";
import { compareVersions } from "../src/version-diff.js";

test("定稿预置是独立的九站版本，运行采用位于终验之前", () => {
  const first = freshDesignImplementationV1();
  const second = freshDesignImplementationV1();
  assert.equal(first.stages.length, 9);
  assert.equal(first.stages[6].label, "运行采用");
  assert.equal(first.stages[7].label, "终验");
  assert.equal(first.stages[8].label, "存档");
  assert.deepEqual(first.stages.slice(0, 2).map((s) => s.skippable), [true, true]);
  assert.equal(first.defaultPace, "per-run");
  assert.equal(first.escalationAfter, 2);
  first.stages[0].label = "修改稿";
  assert.equal(second.stages[0].label, "方向梳理");
  assert.equal(DESIGN_IMPLEMENTATION_V1.stages[0].label, "方向梳理");
});

test("协同模板拒绝缺字段、额外字段、阶段断号和越界值", () => {
  const base = freshDesignImplementationV1();
  const invalid = (update, pattern) => assert.throws(
    () => validateWorkflowTemplate(update), pattern,
  );
  invalid({ ...base, schema: 2 }, /版本格式/);
  invalid({ ...base, extra: true }, /不支持的字段/);
  invalid({ ...base, stages: [] }, /1–20/);
  invalid({ ...base, stages: [{ ...base.stages[0], number: 2 }] }, /编号/);
  invalid({ ...base, stages: [{ ...base.stages[0], defaultActor: "unknown" }] }, /执行者/);
  invalid({ ...base, stages: [{ ...base.stages[0], method: " " }] }, /方法/);
  invalid({ ...base, stages: [{ ...base.stages[0], skippable: "yes" }] }, /跳过设置/);
  invalid({ ...base, defaultPace: "unknown" }, /推进节奏/);
  invalid({ ...base, escalationAfter: 11 }, /1–10/);
  invalid({ ...base, escalationAfter: 1.5 }, /1–10/);
  const custom = validateWorkflowTemplate({ ...base, escalationAfter: 3, defaultPace: "continuous" });
  assert.equal(custom.escalationAfter, 3);
  assert.equal(custom.defaultPace, "continuous");
});

test("普通工作流兼容，结构模板的版本更新、恢复与移除不改历史", () => {
  const plain = makeAsset({ type: "Workflow", title: "普通流程", content: "步骤" });
  assert.equal(current(plain).workflowTemplate, undefined);
  const v1 = revise(plain, { workflowTemplate: freshDesignImplementationV1() });
  assert.equal(plain.versions.length, 1);
  assert.equal(v1.versions.length, 2);
  assert.equal(current(v1).workflowTemplate.stages.length, 9);
  const changed = freshDesignImplementationV1();
  changed.stages[0].label = "前置梳理";
  const v2 = revise(v1, { workflowTemplate: changed });
  assert.equal(v2.versions[1].workflowTemplate.stages[0].label, "方向梳理");
  assert.equal(current(v2).workflowTemplate.stages[0].label, "前置梳理");
  const templateDiff = compareVersions(v2.versions[1], current(v2));
  assert.equal(templateDiff.identical, false);
  assert.ok(templateDiff.fields.some((field) => field.key === "workflowTemplate"));
  assert.equal(compareVersions(plain.versions[0], plain.versions[0]).identical, true);
  const restored = restore(v2, v1.versions[1].id);
  assert.equal(current(restored).workflowTemplate.stages[0].label, "方向梳理");
  const removed = revise(restored, { workflowTemplate: null });
  assert.equal(current(removed).workflowTemplate, undefined);
  assert.equal(removed.versions[1].workflowTemplate.stages.length, 9);
  assert.throws(() => makeAsset({ type: "Prompt", title: "x", workflowTemplate: freshDesignImplementationV1() }), /只有工作流/);
  assert.ok(Array.isArray(seed().collabRunSettings));
});
