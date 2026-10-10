import test from "node:test";
import assert from "node:assert/strict";
import {
  workflowVersions, templateDifference, runSettingDraft,
  validateRunSettingDraft, groupedRuns,
} from "../src/collab-run-settings.js";
import { freshDesignImplementationV1 } from "../src/workflow-template.js";

const template = freshDesignImplementationV1();
const asset = {
  id: "asset_one", type: "Workflow", archived: false,
  versions: [
    { id: "version_one", title: "设计实现流", workflowTemplate: template },
    { id: "version_two", title: "设计实现流", workflowTemplate: {
      ...template, stages: template.stages.map((stage) =>
        stage.number === 4 ? { ...stage, method: "隔离开发并回归" } : stage),
    } },
  ],
};

test("workflow versions retain archived locked history for truthful upgrade comparison", () => {
  const versions = workflowVersions([asset, { ...asset, id: "archived", archived: true }]);
  assert.deepEqual(versions.map((version) => version.versionId), ["version_one", "version_two", "version_one", "version_two"]);
  assert.equal(versions[0].latest, false);
  assert.equal(versions[1].latest, true);
  assert.equal(versions[2].archived, true);
});

test("run setting draft locks the existing version and upgrade preview names changed station", () => {
  const versions = workflowVersions([asset]);
  const existing = {
    projectId: "project_one", runId: "run-1", round: "UI v16", issuesPath: "docs/issues.md",
    templateAssetId: "asset_one", templateVersionId: "version_one", pace: "continuous",
    functionOnly: true, actorOverrides: [{ phase: 4, actor: "hermes" }],
  };
  const draft = runSettingDraft(existing, versions, { projectId: "project_one", name: "项目" }, { id: "run-1" });
  assert.equal(draft.templateVersionId, "version_one");
  assert.equal(draft.pace, "continuous");
  assert.equal(draft.functionOnly, true);
  assert.deepEqual(validateRunSettingDraft(draft, versions), existing);
  assert.match(templateDifference(versions[0].template, versions[1].template).join("\n"), /第 4 站方法/);
});

test("setting rejects paths outside project docs and invalid round", () => {
  const versions = workflowVersions([asset]);
  const draft = runSettingDraft(null, versions, { projectId: "project_one", name: "项目" }, { id: "run-1" });
  assert.throws(() => validateRunSettingDraft({ ...draft, issuesPath: "../secrets.md" }, versions), /项目 docs/);
  assert.throws(() => validateRunSettingDraft({ ...draft, round: "\n" }, versions), /轮次名称/);
});

test("runs group by project and round without merging other projects", () => {
  const pairs = [
    { item: { projectId: "p1", name: "甲" }, run: { round: "UI v16", issues: { state: "ok", count: 2 } } },
    { item: { projectId: "p1", name: "甲" }, run: { round: "UI v16", issues: { state: "ok", count: 2 } } },
    { item: { projectId: "p2", name: "乙" }, run: { round: "UI v16", issues: { state: "unknown" } } },
  ];
  const groups = groupedRuns(pairs);
  assert.equal(groups.length, 2);
  assert.equal(groups[0].pairs.length, 2);
  assert.equal(groups[1].pairs.length, 1);
});
