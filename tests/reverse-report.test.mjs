// 逆向 v5 第 1 批（#47）：回执通道。Agent 经 MCP reverse_report 交回 → 待过目 → 预览 → 采纳 / 退回。
// 只用合成记录和临时目录里的仓库，不读 data/。
import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { seed } from "../src/store.js";
import { createSpecimen } from "../src/reverse-recipe.js";
import { appendHatchRound, editSlot } from "../src/reverse-hatch.js";
import { parse, stringify } from "../src/serialization.js";
import { createReverseReports } from "../server/reverse-report.mjs";
import { createReverseSkillV4 } from "../server/reverse-skill-v4.mjs";
import { openRepository } from "../server/repository.mjs";
import { handleMcp } from "../server/profile-mcp.mjs";
import { startServer } from "../server/http.mjs";

const HASH = "a".repeat(64);
// 一件已发出 rounds 轮追问的合成参照物。
const specimen = (rounds = 1) => {
  const r = createSpecimen({ type: "FN", title: "接力", target: { kind: "web", url: "https://app.example.test/agents", feature: "Agent 接力", clues: ["handoff"], authorized: true } });
  for (let i = 0; i < rounds; i++) r.hatch = appendHatchRound(r, { by: "claude", packHash: HASH, at: `2026-10-31T0${i}:00:00.000Z` });
  return r;
};
const REPORT = "## 用途\n已知：把一个 Agent 的进度交给下一个\n缺：无\n\n## 结构\n已知：左列清单、右列详情\n缺：详情的分区顺序？\n\n## 其他\n顺带看到一个导出按钮。";
const propose = (svc, r, extra = {}) => svc.propose({ taskId: r.id, round: 1, kind: "report", text: REPORT, proposer: "Claude Code", ...extra });
async function repo(records, fn, clock) {
  const dir = await mkdtemp(join(tmpdir(), "reverse-report-")), repository = await openRepository(dir);
  try {
    const input = seed();
    input.reverseRecords = records;
    await repository.write(input, { initialize: true });
    const skills = createReverseSkillV4({ repository, ...(clock ? { clock } : {}) });
    await fn(repository, createReverseReports(repository, { ...(clock ? { clock } : {}), skills }), skills);
  } finally {
    await repository.close();
    await rm(dir, { recursive: true, force: true });
  }
}

test("提交 → 预览 → 采纳 → 回读：八格按回执写入，这一轮改成已交回，回执标为已采纳", async () => {
  const r = specimen();
  await repo([r], async (repository, svc) => {
    const sent = await propose(svc, r);
    assert.equal(sent.status, "pending");
    assert.equal(sent.duplicate, false);
    let state = await repository.read();
    assert.equal(state.reverseReports.length, 1);
    assert.equal(state.reverseRecords[0].hatch.slots.use.known, r.hatch.slots.use.known, "提交不改档案");
    const p = await svc.preview({ id: sent.id });
    assert.equal((await repository.read()).revision, state.revision, "预览不写入");
    assert.deepEqual(p.changes.map((c) => c.id), ["use", "shape"]);
    assert.deepEqual(p.unplaced.map((u) => u.label), ["其他"]);
    assert.equal(p.missing.length, 6);
    state = await svc.adopt({ previewId: p.previewId, expectedRevision: p.revision });
    const after = await repository.read();
    assert.equal(after.revision, state.revision);
    const record = after.reverseRecords[0];
    assert.equal(record.hatch.slots.use.known, "把一个 Agent 的进度交给下一个");
    assert.equal(record.hatch.slots.shape.miss, "详情的分区顺序？");
    assert.equal(record.hatch.rounds[0].status, "back");
    assert.equal(record.hatch.rounds[0].cells, "fheeeeee");
    assert.equal(record.hatch.unplaced.items[0].label, "其他");
    assert.equal(after.reverseReports[0].status, "adopted");
    assert.ok(after.reverseReports[0].decidedAt);
    await assert.rejects(svc.adopt({ previewId: p.previewId, expectedRevision: after.revision }), /预览已过期或不存在/, "同一预览不能采纳两次");
  });
});

test("同一记录、同一轮、同一正文重复交回不重复写入；换了正文才算新回执", async () => {
  const r = specimen();
  await repo([r], async (repository, svc) => {
    const first = await propose(svc, r);
    const { revision } = await repository.read();
    const again = await propose(svc, r, { text: REPORT.replace(/\n/g, "\r\n"), proposer: "Codex" });
    assert.equal(again.id, first.id);
    assert.equal(again.duplicate, true);
    assert.equal((await repository.read()).revision, revision, "重复提交不写主库");
    const other = await propose(svc, r, { text: REPORT + "\n补一句。" });
    assert.notEqual(other.id, first.id);
    assert.equal((await repository.read()).reverseReports.length, 2);
  });
});

test("任务编号或轮次对不上、类型不支持、正文为空：拒绝且不写入", async () => {
  const r = specimen(), gone = { ...specimen(), id: "gone-1", deletedAt: "2026-10-31T00:00:00.000Z" };
  await repo([r, gone], async (repository, svc) => {
    const { revision } = await repository.read();
    await assert.rejects(propose(svc, r, { taskId: "nope" }), (e) => e.status === 404 && /任务编号对不上/.test(e.message));
    await assert.rejects(propose(svc, gone, {}), (e) => e.status === 404);
    await assert.rejects(propose(svc, r, { round: 2 }), (e) => e.status === 404 && /没有这一轮/.test(e.message));
    await assert.rejects(propose(svc, r, { kind: "nope" }), /回执类型只能是/);
    await assert.rejects(propose(svc, r, { kind: "replica" }), /没认出复刻对照行/, "复刻对照一行都认不出时不进待过目");
    await assert.rejects(propose(svc, r, { text: " \n " }), /回执为空/);
    await assert.rejects(propose(svc, r, { text: "x".repeat(50001) }), /超过 50000 字/);
    await assert.rejects(propose(svc, r, { proposer: "a\nb" }), /提交者/);
    await assert.rejects(svc.propose({ taskId: r.id, round: 1, kind: "report", text: REPORT, proposer: "x", extra: 1 }), /请求字段无效/);
    assert.equal((await repository.read()).revision, revision);
  });
});

test("密钥一类内容存之前隐去", async () => {
  const r = specimen();
  await repo([r], async (repository, svc) => {
    await propose(svc, r, { text: REPORT + "\n\n-----BEGIN RSA PRIVATE KEY-----\nabc\n-----END RSA PRIVATE KEY-----" });
    const stored = (await repository.read()).reverseReports[0].text;
    assert.doesNotMatch(stored, /BEGIN RSA PRIVATE KEY/);
    assert.match(stored, /\[已隐去\]/);
  });
});

test("预览过期、预览后主库变化（revision 冲突）：采纳拒绝，什么都不写", async () => {
  const r = specimen();
  let now = Date.parse("2026-10-31T00:00:00.000Z");
  await repo([r], async (repository, svc) => {
    const { id } = await propose(svc, r);
    const old = await svc.preview({ id });
    now += 5 * 60 * 1000 + 1;
    await assert.rejects(svc.adopt({ previewId: old.previewId, expectedRevision: old.revision }), /预览已过期/);
    const p = await svc.preview({ id });
    await assert.rejects(svc.adopt({ previewId: p.previewId, expectedRevision: p.revision - 1 }), /预览后记录已变化/);
    const state = await repository.read();
    state.reverseRecords[0].why = "改了一句";
    await repository.write(state);
    await assert.rejects(svc.adopt({ previewId: p.previewId, expectedRevision: p.revision }), (e) => e.status === 409);
    const after = await repository.read();
    assert.equal(after.reverseReports[0].status, "pending");
    assert.equal(after.reverseRecords[0].hatch.rounds[0].status, "sent");
    assert.equal(after.revision, state.revision + 1, "只有那次手改写入");
  }, () => now);
});

test("退回后不能再预览或采纳；退回带过期 revision 也拒绝", async () => {
  const r = specimen();
  await repo([r], async (repository, svc) => {
    const { id } = await propose(svc, r);
    const p = await svc.preview({ id });
    const { revision } = await repository.read();
    await assert.rejects(svc.reject({ id, expectedRevision: revision - 1 }), /记录已变化/);
    const state = await svc.reject({ id, expectedRevision: revision });
    assert.equal(state.reverseReports[0].status, "rejected");
    assert.equal(state.reverseRecords[0].hatch.rounds[0].status, "sent", "退回不改档案");
    await assert.rejects(svc.preview({ id }), /已处理/);
    await assert.rejects(svc.adopt({ previewId: p.previewId, expectedRevision: state.revision }), /预览后记录已变化/);
    await assert.rejects(svc.adopt({ previewId: p.previewId, expectedRevision: p.revision }), /记录已变化/);
    await assert.rejects(svc.reject({ id, expectedRevision: state.revision }), /已处理/);
  });
});

test("晚到的第 1 轮回执：只把第 1 轮改成已交回，第 2 轮仍是已发出；手改过的格子默认不覆盖，勾上才覆盖", async () => {
  const r = specimen(2);
  r.hatch = editSlot(r, "use", { known: "我手改的用途" });
  await repo([r], async (repository, svc) => {
    const { id } = await propose(svc, r);
    const keep = await svc.preview({ id });
    assert.deepEqual(keep.kept.map((k) => k.id), ["use"]);
    const over = await svc.preview({ id, overwrite: ["use"] });
    assert.deepEqual(over.kept, []);
    await assert.rejects(svc.preview({ id, overwrite: ["nope"] }), /覆盖的格子无效/);
    await svc.adopt({ previewId: keep.previewId, expectedRevision: keep.revision });
    const record = (await repository.read()).reverseRecords[0];
    assert.equal(record.hatch.slots.use.known, "我手改的用途");
    assert.deepEqual(record.hatch.rounds.map((x) => x.status), ["back", "sent"]);
  });
});

test("v5 回执（#49）：采纳时结论、能力清单、证据、下一轮建议问写进 hatch.report；晚到的旧轮次不覆盖新一轮", async () => {
  const r = specimen(2);
  const v5 = (n, verdict) => `## 回执 · 接力 · 第 ${n} 轮 · 任务编号 ${r.id}\n一句话结论：${verdict}\n## 能力清单\n- 生成摘要：已知 自动 ｜证据 E1 ｜缺 无\n## 用途\n已知：交接\n缺：无\n## 证据\n- E1：app.js · handoff()\n## 下一轮建议问\n1. 上限多少？`;
  await repo([r], async (repository, svc) => {
    const adopt = async (round, verdict) => {
      const { id } = await propose(svc, r, { round, text: v5(round, verdict) });
      const p = await svc.preview({ id });
      assert.equal(p.report.verdict, verdict);
      assert.deepEqual(p.unplaced, [], "新小节不再算分不进格");
      await svc.adopt({ previewId: p.previewId, expectedRevision: p.revision });
      return { p, record: (await repository.read()).reverseRecords[0] };
    };
    let { record } = await adopt(2, "第二轮结论");
    assert.deepEqual(record.hatch.report, { round: 2, verdict: "第二轮结论", caps: [{ name: "生成摘要", known: "自动", miss: "", ev: ["E1"] }], evidence: [{ id: "E1", where: "app.js · handoff()" }], nextAsk: ["上限多少？"] });
    const late = await adopt(1, "第一轮结论");
    assert.equal(late.p.latest, false);
    assert.equal(late.record.hatch.report.verdict, "第二轮结论");
    assert.deepEqual(late.record.hatch.rounds.map((x) => x.status), ["back", "back"]);
  });
});

// 第 4 批（#55）：复刻对照交回 → 预览 → 采纳写进 hatch.replica，对应轮次改成已交回，八格不动。
const REPLICA = (n = 1) => `## 复刻对照 · 接力 · 第 ${n} 轮 · 任务编号 x\n复刻位置：~/Sandbox/2026-11-04-接力/\n- 交接清单：一致\n- 详情分区：有差异 ｜ 顺序反了\n- 导出：未验证 ｜ 需要登录\n顺带一句闲话`;
const replicaRound = (rounds = 1) => {
  const r = specimen(rounds);
  r.hatch = appendHatchRound(r, { by: "codex", packHash: HASH, kind: "replica", at: "2026-11-04T00:00:00.000Z" });
  return r;
};

test("复刻对照：提交 → 预览 → 采纳 → 回读；重复提交不重复写；八格不动", async () => {
  const r = replicaRound();
  await repo([r], async (repository, svc) => {
    const sent = await propose(svc, r, { round: 2, kind: "replica", text: REPLICA(2) });
    assert.equal((await propose(svc, r, { round: 2, kind: "replica", text: REPLICA(2) })).duplicate, true);
    const { revision } = await repository.read();
    const p = await svc.preview({ id: sent.id });
    assert.equal((await repository.read()).revision, revision, "预览不写入");
    assert.equal(p.kind, "replica");
    assert.equal(p.replica.where, "~/Sandbox/2026-11-04-接力/");
    assert.deepEqual(p.replica.rows.map((x) => x.result), ["ok", "diff", "no"]);
    assert.deepEqual(p.unplaced.map((u) => u.text), ["顺带一句闲话"]);
    assert.equal(p.changes, undefined, "复刻对照没有八格变化");
    await svc.adopt({ previewId: p.previewId, expectedRevision: p.revision });
    const after = await repository.read(), record = after.reverseRecords[0];
    assert.deepEqual(record.hatch.replica, { round: 2, at: record.hatch.replica.at, where: "~/Sandbox/2026-11-04-接力/", rows: p.replica.rows });
    assert.deepEqual(record.hatch.rounds.map((x) => x.status), ["sent", "back"]);
    assert.deepEqual(record.hatch.slots, r.hatch.slots, "八格不动");
    assert.equal(after.reverseReports[0].status, "adopted");
  });
});

test("复刻对照：预览过期、revision 冲突拒绝；退回不改档案；晚到的旧轮次不覆盖新一轮", async () => {
  const r = replicaRound();
  r.hatch = appendHatchRound(r, { by: "claude", packHash: HASH, kind: "replica", at: "2026-11-04T01:00:00.000Z" });
  let now = Date.parse("2026-11-04T02:00:00.000Z");
  await repo([r], async (repository, svc) => {
    const late = await propose(svc, r, { round: 2, kind: "replica", text: REPLICA(2) });
    const fresh = await propose(svc, r, { round: 3, kind: "replica", text: REPLICA(3).replace("顺序反了", "已对齐").replace("有差异", "一致") });
    const old = await svc.preview({ id: fresh.id });
    now += 5 * 60 * 1000 + 1;
    await assert.rejects(svc.adopt({ previewId: old.previewId, expectedRevision: old.revision }), /预览已过期/);
    const p = await svc.preview({ id: fresh.id });
    await assert.rejects(svc.adopt({ previewId: p.previewId, expectedRevision: p.revision - 1 }), /预览后记录已变化/);
    assert.equal((await repository.read()).reverseRecords[0].hatch.replica, undefined, "拒绝时什么都不写");
    await svc.adopt({ previewId: p.previewId, expectedRevision: p.revision });
    const q = await svc.preview({ id: late.id });
    assert.equal(q.latest, false);
    await svc.adopt({ previewId: q.previewId, expectedRevision: q.revision });
    const record = (await repository.read()).reverseRecords[0];
    assert.equal(record.hatch.replica.round, 3, "晚到的第 2 轮不覆盖第 3 轮");
    assert.deepEqual(record.hatch.rounds.map((x) => x.status), ["sent", "back", "back"]);
    const third = await propose(svc, r, { round: 3, kind: "replica", text: REPLICA(3) });
    const { revision } = await repository.read();
    const state = await svc.reject({ id: third.id, expectedRevision: revision });
    assert.equal(state.reverseRecords[0].hatch.replica.round, 3);
    assert.equal(state.reverseReports.find((x) => x.id === third.id).status, "rejected");
  }, () => now);
});

// 第 4 批（#55）：Skill 草稿交回 → 预览（草稿全文、名字可改）→ 采纳一次写入资产、hatchSkills 指针与回执状态 → 回读。
const DRAFT = (extra = "") => `---\nname: agent-relay\ndescription: 把一个 Agent 的进度交给下一个\n---\n\n# Agent 接力\n\n## 用途\n交接进度。${extra}\n`;
const skillRound = () => {
  const r = replicaRound();
  r.hatch = appendHatchRound(r, { by: "codex", packHash: HASH, kind: "skill", at: "2026-11-04T01:00:00.000Z" });
  return r;
};

test("Skill 草稿：提交 → 预览 → 采纳 → 回读；资产正文是草稿原文，附件是追问包和八格原样；再交一份加一版", async () => {
  const r = skillRound();
  await repo([r], async (repository, svc, skills) => {
    const sent = await propose(svc, r, { round: 3, kind: "skill", text: DRAFT() });
    assert.equal((await propose(svc, r, { round: 3, kind: "skill", text: DRAFT() })).duplicate, true);
    const { revision, assets } = await repository.read();
    const p = await svc.preview({ id: sent.id });
    assert.equal((await repository.read()).revision, revision, "预览不写入");
    assert.equal(p.kind, "skill");
    assert.deepEqual([p.skill.name, p.skill.by, p.skill.title, p.skill.versionNo], ["agent-relay", "codex", "Agent 接力", 1]);
    assert.deepEqual(p.skill.files.map((f) => f.path), ["SKILL.md", "task-pack.md", "source.json"]);
    await svc.adopt({ previewId: p.previewId, expectedRevision: p.revision });
    const after = await repository.read(), record = after.reverseRecords[0], asset = after.assets.at(-1);
    assert.equal(after.assets.length, assets.length + 1);
    assert.equal(asset.type, "Skill");
    assert.equal(asset.versions.at(-1).title, "Agent 接力");
    assert.equal(asset.versions.at(-1).content, DRAFT());
    const files = asset.versions.at(-1).files;
    assert.equal(files.find((f) => f.path === "SKILL.md").data, DRAFT());
    const source = JSON.parse(files.find((f) => f.path === "source.json").data);
    assert.deepEqual([source.draft.round, source.draft.by, source.draft.reportId, source.validation], [3, "codex", sent.id, "未经复刻验证"]);
    assert.deepEqual(record.hatchSkills.map((x) => [x.assetId, x.round]), [[asset.id, 3]]);
    assert.equal(after.reverseReports[0].status, "adopted");
    assert.equal(after.revision, revision + 1, "存资产、指针和回执状态是同一次写入");
    const back = await skills.hatchQuery({ recordId: r.id });
    assert.equal(back.saved.assetId, asset.id, "孵化回读认得这一版");
    const second = await propose(svc, r, { round: 3, kind: "skill", text: DRAFT("补一句。") });
    const q = await svc.preview({ id: second.id });
    assert.equal(q.skill.versionNo, 2);
    await svc.adopt({ previewId: q.previewId, expectedRevision: q.revision });
    const final = await repository.read();
    assert.equal(final.assets.length, assets.length + 1, "同一参照物不另建资产");
    assert.equal(final.assets.at(-1).versions.length, 2);
    assert.equal(final.reverseRecords[0].hatchSkills.length, 2);
  });
});

test("Skill 草稿：缺 YAML 当场退回；认不出名字先补名字再采纳；名字不合规拒绝", async () => {
  const r = skillRound();
  await repo([r], async (repository, svc) => {
    await assert.rejects(propose(svc, r, { round: 3, kind: "skill", text: "# 只有正文" }), /开头要有 YAML/);
    await assert.rejects(propose(svc, r, { round: 3, kind: "skill", text: "---\nname: x\n---\n正文" }), /缺 description/);
    assert.equal(((await repository.read()).reverseReports || []).length, 0);
    const sent = await propose(svc, r, { round: 3, kind: "skill", text: DRAFT().replace("agent-relay", "Agent 接力") });
    const p = await svc.preview({ id: sent.id });
    assert.equal(p.skill.name, "");
    await assert.rejects(svc.adopt({ previewId: p.previewId, expectedRevision: p.revision }), /先给 Skill 起个名字/);
    await assert.rejects(svc.preview({ id: sent.id, name: "Agent Relay" }), /只能用小写字母/);
    const named = await svc.preview({ id: sent.id, name: "agent-relay" });
    assert.match(named.skill.content, /^---\nname: agent-relay\n/);
    await svc.adopt({ previewId: named.previewId, expectedRevision: named.revision });
    assert.match((await repository.read()).assets.at(-1).versions.at(-1).content, /^---\nname: agent-relay\n/);
  });
});

test("Skill 草稿：预览过期、revision 冲突拒绝且什么都不写；退回不存资产", async () => {
  const r = skillRound();
  let now = Date.parse("2026-11-04T02:00:00.000Z");
  await repo([r], async (repository, svc) => {
    const { id } = await propose(svc, r, { round: 3, kind: "skill", text: DRAFT() });
    const old = await svc.preview({ id });
    now += 5 * 60 * 1000 + 1;
    await assert.rejects(svc.adopt({ previewId: old.previewId, expectedRevision: old.revision }), /预览已过期/);
    const p = await svc.preview({ id });
    const state = await repository.read();
    state.reverseRecords[0].why = "改了一句";
    await repository.write(state);
    await assert.rejects(svc.adopt({ previewId: p.previewId, expectedRevision: p.revision }), (e) => e.status === 409 && /记录已变化/.test(e.message));
    let after = await repository.read();
    assert.equal(after.assets.length, state.assets.length);
    assert.equal(after.reverseReports[0].status, "pending");
    assert.equal(after.reverseRecords[0].hatchSkills, undefined);
    after = await svc.reject({ id, expectedRevision: after.revision });
    assert.equal(after.reverseReports[0].status, "rejected");
    assert.equal(after.assets.length, state.assets.length, "退回不存资产");
  }, () => now);
});

test("待过目到上限 20 份拒绝新回执", async () => {
  const r = specimen();
  await repo([r], async (repository, svc) => {
    for (let i = 0; i < 20; i++) await propose(svc, r, { text: `${REPORT}\n第 ${i} 份` });
    await assert.rejects(propose(svc, r, { text: REPORT + "\n多一份" }), (e) => e.status === 429);
  });
});

test("历史守卫：通用保存不能伪造、改写或删除回执", async () => {
  const r = specimen();
  await repo([r], async (repository, svc) => {
    const forged = await repository.read();
    forged.reverseReports = [{ id: "fake", recordId: r.id, round: 1, kind: "report", text: "x", proposer: "我", createdAt: "2026-10-31T00:00:00.000Z", status: "pending" }];
    await assert.rejects(repository.write(forged), /逆向回执只能通过专用操作更新/);
    await propose(svc, r);
    const state = await repository.read();
    await assert.rejects(repository.write({ ...state, reverseReports: [] }), /逆向回执只能通过专用操作更新/);
    await assert.rejects(repository.updateReverseReports(() => ({ reverseReports: [] })), /待过目的逆向回执不能被删除/);
    await assert.rejects(repository.updateReverseReports((s) => ({ reverseReports: s.reverseReports.map((x) => ({ ...x, text: "改过" })) })), /内容不可改写/);
    await assert.rejects(repository.updateReverseReports((s) => ({ reverseReports: s.reverseReports.map((x) => ({ ...x, recordId: "nope" })) })), /所属记录/);
    await assert.rejects(repository.updateReverseReports(() => ({ assets: [] })), /更新字段无效/);
  });
});

test("MCP：有逆向服务时列出 reverse_report；交回成功、重复、出错分别如实回复", async () => {
  const r = specimen();
  await repo([r], async (repository, svc) => {
    const rpc = (name, args) => handleMcp({}, { jsonrpc: "2.0", id: 1, method: "tools/call", params: { name, arguments: args } }, undefined, svc);
    const list = await handleMcp({}, { jsonrpc: "2.0", id: 1, method: "tools/list" }, undefined, svc);
    assert.deepEqual(list.result.tools.map((t) => t.name), ["read_profile", "propose_profile_change", "reverse_report"]);
    const init = await handleMcp({}, { jsonrpc: "2.0", id: 1, method: "initialize", params: {} }, undefined, svc);
    assert.match(init.result.instructions, /reverse_report/);
    const args = { taskId: r.id, round: 1, kind: "report", text: REPORT, proposer: "Codex" };
    const ok = await rpc("reverse_report", args);
    assert.equal(ok.result.isError, false);
    assert.match(ok.result.content[0].text, /已交回工作台待过目/);
    assert.equal(ok.result.structuredContent.status, "pending");
    const dup = await rpc("reverse_report", args);
    assert.match(dup.result.content[0].text, /之前已交过.*待过目/);
    const bad = await rpc("reverse_report", { ...args, round: 9 });
    assert.equal(bad.result.isError, true);
    assert.match(bad.result.content[0].text, /没有这一轮/);
    assert.equal((await repository.read()).reverseReports.length, 1);
    const without = await handleMcp({}, { jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: "reverse_report", arguments: args } });
    assert.equal(without.error.code, -32602, "没接逆向服务时不认这个工具");
  });
});

test("工作台 HTTP：MCP 交回 → /api/reverse/reports 预览、采纳、退回，继承会话门禁", async (t) => {
  const base = await mkdtemp(join(tmpdir(), "reverse-report-http-"));
  const app = await startServer({ directory: join(base, "data"), port: 0, mcpPort: 0, discovery: { defaultRoots: () => [join(base, "projects")] } });
  t.after(async () => {
    await app.close();
    await rm(base, { recursive: true, force: true });
  });
  const session = await (await fetch(app.url + "/api/session", { headers: { "X-Workbench-Client": "1" } })).json();
  const headers = { "Content-Type": "application/json", "X-Workbench-Token": session.token };
  const call = async (path, data, custom = headers) => {
    const response = await fetch(app.url + "/api/" + path, { method: "POST", headers: custom, body: stringify(data) });
    return { status: response.status, body: parse(await response.text()) };
  };
  const r = specimen(2), input = seed();
  input.reverseRecords = [r];
  await app.repository.write(input, { initialize: true });
  const { mcp } = (await call("knowledge/zones/summary", {})).body;
  const rpc = async (args) =>
    (await (await fetch(mcp.url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: "reverse_report", arguments: args } }) })).json()).result;
  const first = (await rpc({ taskId: r.id, round: 1, kind: "report", text: REPORT, proposer: "Claude Code" })).structuredContent;
  const second = (await rpc({ taskId: r.id, round: 2, kind: "report", text: REPORT + "\n第二轮", proposer: "Codex" })).structuredContent;
  assert.equal((await call("reverse/reports/preview", { id: first.id }, { "Content-Type": "application/json" })).status, 403, "没有会话令牌拒绝");
  const preview = await call("reverse/reports/preview", { id: first.id });
  assert.equal(preview.status, 200);
  const adopted = await call("reverse/reports/adopt", { previewId: preview.body.previewId, expectedRevision: preview.body.revision });
  assert.equal(adopted.status, 200);
  assert.equal(adopted.body.reverseRecords[0].hatch.rounds[0].status, "back");
  const rejected = await call("reverse/reports/reject", { id: second.id, expectedRevision: adopted.body.revision });
  assert.equal(rejected.status, 200);
  const read = await (await fetch(app.url + "/api/workspace", { headers })).text();
  assert.deepEqual(parse(read).reverseReports.map((x) => x.status), ["adopted", "rejected"]);
  // 通用保存带着改过的回执被拒绝。
  const state = parse(read);
  const forged = await fetch(app.url + "/api/workspace", { method: "PUT", headers, body: stringify({ state: { ...state, reverseReports: [] } }) });
  assert.equal(forged.status, 400);
  assert.equal((await call("reverse/reports/nope", {})).status, 404);
});
