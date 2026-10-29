// 孵蛋 3C 页面（#28）的合成隔离库：照正式库三条记录的形状造（网址换成 example.test），不读 data/。
// 炉子：网站，两轮旧取证 + 样稿那样的 2½ 格（用途、结构填上，数据半格）；社区页：网站，一轮失败；验收样本：本机文件，没有轮次。
import { createHash } from "node:crypto";
import { fixture } from "./fixture.mjs";
import { seed } from "../src/store.js";
import { createSpecimen } from "../src/reverse-recipe.js";
import { initialHatch } from "../src/reverse-hatch.js";

const ev = (c) => "ev_" + c.repeat(64);
const sha = (s) => createHash("sha256").update(s).digest("hex");
const web = (url, feature) => ({ kind: "web", url, feature, clues: ["migration", "handoff"], authorized: true });
function result(obs, infer, unknowns) {
  const pack = `# 复刻任务包 · 观察 ${obs} · 推断 ${infer}\n参照物：app.example.test\n（合成）`;
  return {
    conclusions: [...Array(obs).fill("观察"), ...Array(infer).fill("推断")].map((mark, i) => ({ text: `合成结论 ${i + 1}：/agents/migration 与 /agents/work-handoff 两支`, mark, evidence: [ev("a")] })),
    unknowns: unknowns.map((text, i) => ({ id: "u" + (i + 1), text })), pack,
  };
}
function aiRound(id, at, target, res) {
  return {
    version: { id, at, executor: "codex", target, result: res, packHash: sha(res.pack) },
    run: { id, status: "completed", startedAt: at, finishedAt: at, version: "6.4.0", target, log: [], sequence: 0, truncated: false, executor: "codex", packVersionId: id },
  };
}

export function furnace({ hatch = true } = {}) {
  const r = { ...createSpecimen({ type: "FN", title: "Agent迁移和上下文接力功能", target: web("https://app.example.test/agents", "Agent迁移和上下文接力功能") }), id: "rv-furnace", createdAt: "2026-10-15T02:00:00.000Z" };
  const a = aiRound("pv-1015", "2026-10-15T03:00:00.000Z", web("https://app.example.test/community", "Agent迁移和上下文接力功能"), result(2, 1, ["/community 有没有打开、是否被重定向", "迁移的对象、源端与目标端", "接力包含哪些信息", "相关模块与接口"]));
  const b = aiRound("pv-1016", "2026-10-16T03:00:00.000Z", structuredClone(r.material.target), result(7, 1, ["迁移入口在界面上的位置", "包的字段格式", "失败时的边界", "接口协议", "谁先发起", "导入后的状态", "回滚方式", "权限范围", "怎么验收"]));
  r.packVersions = [a.version, b.version]; r.reaRuns = [a.run, b.run]; r.activePackVersionId = "pv-1016";
  if (hatch) {
    const h = initialHatch(r, "2026-10-16T04:00:00.000Z");
    h.slots.shape = { known: "分两支：Agent 迁移（/agents/migration、/migration/:taskId）与工作交接（/agents/work-handoff）", miss: "", at: "2026-10-16T04:00:00.000Z" };
    h.slots.data = { known: "产物：migration-packages、context-packs、snapshots", miss: "包的格式、字段和接口协议", at: "2026-10-16T04:00:00.000Z" };
    h.slots.flow.miss = "谁先发起迁移？导入后状态怎么变？";
    h.slots.ui.miss = "迁移入口在界面上的哪里？";
    h.slots.edge.miss = "失败、半途中断时怎么处理？";
    h.slots.write.miss = "写入后怎么回滚？";
    h.slots.check.miss = "怎么验收迁移完成？";
    r.hatch = h;
  }
  return r;
}
export function community() {
  const r = { ...createSpecimen({ type: "FN", title: "全部", target: web("https://app.example.test/community", "全部") }), id: "rv-community", createdAt: "2026-10-15T00:30:00.000Z" };
  r.reaRuns = [{ id: "run-1015", status: "failed", startedAt: "2026-10-15T01:00:00.000Z", finishedAt: "2026-10-15T01:02:00.000Z", version: "6.3.0", target: structuredClone(r.material.target), log: [], sequence: 0, truncated: false, error: { kind: "result", code: "REA_EXIT", message: "取证失败" } }];
  return r;
}
export function fixtureBin() {
  return { ...createSpecimen({ type: "FN", title: "验收 · 原生 REA 全能力 · 自建样本", target: { kind: "local", path: "/fixture/reverse-native572/fixture-bin", feature: "只读确认 Mach-O 架构、文件 SHA256 和 add_demo 符号", authorized: true } }), id: "rv-fixture", createdAt: "2026-10-20T00:00:00.000Z" };
}

export async function reverseHatchFixture({ empty = false, records } = {}) {
  const app = await fixture();
  try {
    const state = seed();
    state.reverseRecords = empty ? [] : records || [furnace(), community(), fixtureBin()];
    await app.repository.write(state, { initialize: true });
    return app;
  } catch (error) {
    await app.close();
    throw error;
  }
}
