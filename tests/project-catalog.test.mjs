import test from "node:test";
import assert from "node:assert/strict";
import { mkdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { projectStatusFixture } from "./project-status-fixture.mjs";
import { manualProjectId } from "../server/project-catalog.mjs";
import { groupPortfolioSections } from "../src/projects-v16.js";

test("项目展示名、手工目录和明确排除跨两次重扫保留，旧快照可读", async () => {
  const app = await projectStatusFixture();
  try {
    const before = await app.workspace();
    assert.equal(before.connections.projectCatalog, undefined);
    const collab = before.connections.projects.find((p) => p.name === "协同项目");
    const bare = before.connections.projects.find((p) => p.name === "无协议项目");
    const leaky = before.connections.projects.find((p) => p.name === "泄露项目");
    const docs = before.connections.projects.find((p) => p.name === "文档项目");
    const manualPath = join(app.paths.projects, "无标记的业务项目");
    await mkdir(manualPath);
    const manualId = manualProjectId(manualPath);
    const items = [
      { projectId: collab.id, displayName: "协同业务系统", section: "business", view: "main" },
      { projectId: manualId, displayName: "手工登记项目", section: "personal", view: "main" },
      { projectId: leaky.id, displayName: "辅助工具", section: "tools", view: "asset" },
      { projectId: docs.id, displayName: "一次性报告", section: "completed", view: "task" },
    ];
    const applied = await app.call("/project-catalog/apply", {
      revision: before.revision,
      manualProjects: [{ path: manualPath, name: "无标记的业务项目" }],
      exclusions: [`id:${bare.id}`, `path:${app.paths.bare}`],
      items,
    });
    assert.equal(applied.status, 200, JSON.stringify(applied.body));
    assert.equal(applied.body.connections.projects.some((p) => p.id === bare.id), false);
    assert.equal(applied.body.connections.projects.find((p) => p.id === manualId)?.manual, true);
    const pointer = await readFile(join(app.dir, "data", "CURRENT.json"), "utf8");
    const stale = await app.call("/project-catalog/apply", {
      revision: before.revision,
      items: [],
    });
    assert.equal(stale.status, 409);
    assert.equal(await readFile(join(app.dir, "data", "CURRENT.json"), "utf8"), pointer);
    for (let i = 0; i < 2; i++) {
      const scan = await app.call("/scan/projects", {});
      assert.equal(scan.status, 200, JSON.stringify(scan.body));
      assert.equal(scan.body.connections.projects.some((p) => p.id === bare.id), false);
      assert.equal(scan.body.connections.projects.filter((p) => p.id === manualId).length, 1);
      assert.deepEqual(scan.body.connections.projectCatalog, items);
    }
    const after = await app.workspace();
    const visible = after.connections.projects.map((p) => ({
      ...p,
      name: after.connections.projectCatalog.find((item) => item.projectId === p.id)?.displayName || p.name,
    }));
    assert.deepEqual(groupPortfolioSections(visible, items).map((group) => [group.label, group.items.map((p) => p.name)]), [
      ["个人产品", ["手工登记项目"]],
      ["业务系统", ["协同业务系统"]],
    ]);
  } finally { await app.close(); }
});

test("明确排除 GitHub 来源后远端扫描不会让项目复活", async () => {
  const app = await projectStatusFixture();
  try {
    const before = await app.workspace();
    const collab = before.connections.projects.find((p) => p.name === "协同项目");
    const marked = await app.call("/project-status/mark", {
      projectId: collab.id, active: true, revision: before.revision,
    });
    assert.equal(marked.status, 200);
    const reclassified = await app.call("/project-catalog/apply", {
      revision: marked.body.revision,
      items: [{ projectId: collab.id, displayName: "协同项目", section: "tools", view: "asset" }],
    });
    assert.equal(reclassified.status, 400);
    const rejected = await app.call("/project-catalog/apply", {
      revision: marked.body.revision,
      exclusions: [`id:${collab.id}`],
      items: [],
    });
    assert.equal(rejected.status, 400);
    assert.equal((await app.workspace()).connections.projects.find((p) => p.id === collab.id).active, true);
    const unmarked = await app.call("/project-status/mark", {
      projectId: collab.id, active: false, revision: marked.body.revision,
    });
    assert.equal(unmarked.status, 200);
    const applied = await app.call("/project-catalog/apply", {
      revision: unmarked.body.revision,
      exclusions: [`id:${collab.id}`, "repo:tester/collab", `path:${app.paths.collab}`],
      items: [],
    });
    assert.equal(applied.status, 200, JSON.stringify(applied.body));
    const scan = await app.call("/scan/projects", {});
    assert.equal(scan.status, 200, JSON.stringify(scan.body));
    assert.equal(scan.body.connections.projects.some((p) => p.repoKey === "tester/collab"), false);
    assert.equal(scan.body.connections.projects.some((p) => p.localPaths.includes(app.paths.collab)), false);
  } finally { await app.close(); }
});
