// 探针 3：D-R5 的挂起定位。复刻 tests/rule-templates.test.mjs:503 的步骤，加诊断输出，
// 并在 await renaming 外面套一个 5 秒观察窗，打印当时仍存活的句柄。
// 用法：node docs/agents/handoffs/cloud-env-diff-probes/probe-d-r5-hang.mjs
import fs from "node:fs/promises";
import { join } from "node:path";
import { openRepository } from "../../../../server/repository.mjs";
import { createRuleTemplates } from "../../../../server/rule-templates.mjs";
import { contextFixture } from "../../../../tests/context-fixture.mjs";
import { makeAsset } from "../../../../src/store.js";

const t0 = Date.now();
const log = (...a) => console.log(`[+${String(Date.now() - t0).padStart(5)}ms]`, ...a);
log("platform", process.platform, "uid", process.getuid());

const app = await contextFixture();
const state = (await app.call("/workspace")).body;
const asset = makeAsset({ title: "项目协同协议", type: "Rule", description: "x", content: "## 协同协议\n先读 CURRENT.md。\n", tags: [] });
const saved = await app.call("/workspace", { state: { ...state, assets: [...state.assets, asset] } }, "PUT");
const revision = saved.body.revision;
await app.stop();
log("fixture 已停 HTTP 服务；打开仓库");
const repository = await openRepository(join(app.dir, "data"));
let reached = false, reachedResolve, release;
const gate = new Promise((r) => (release = r));
const renaming = new Promise((r) => (reachedResolve = r));
const seen = [];
const filesystem = {
  ...fs,
  open: async (p, ...rest) => { seen.push("open " + String(p).split("/").pop()); return fs.open(p, ...rest); },
  rename: async (from, to) => {
    seen.push("rename");
    if (from.includes(".guiji-config-")) { reached = true; reachedResolve(); await gate; }
    return fs.rename(from, to);
  },
};
const rules = createRuleTemplates(repository, { filesystem });
const target = { projectId: app.input.projectId, root: app.input.root, file: "AGENTS.md", assetId: asset.id, versionId: asset.versions.at(-1).id, overwriteDrift: false };
const preview = await rules.preview({ ...target, revision });
log("preview ok, token", preview.token.slice(0, 8));
const applying = rules.apply({ token: preview.token, revision }).then((r) => { log(`apply 已 resolve：status=${r.status} completedAt=${r.completedAt} notice=${r.notice}`); return r; });
const winner = await Promise.race([
  renaming.then(() => "renaming"),
  new Promise((r) => setTimeout(() => r("5s 观察窗到期"), 5000)),
]);
log("race 结果:", winner, "| rename 钩子是否触发:", reached);
log("文件系统调用序列:", seen.join(" | "));
log("此刻存活资源(getActiveResourcesInfo):", JSON.stringify(process.getActiveResourcesInfo()));
if (winner !== "renaming")
  log("结论：D-R5 的 `await renaming` 永远不会 resolve —— rename 从未被调用；测试体停在这里，finally 里的 release()/app.close() 都不会执行");
release();
await applying;
await repository.close();
await app.close();
log("探针清理完毕；此后存活资源:", JSON.stringify(process.getActiveResourcesInfo()));
