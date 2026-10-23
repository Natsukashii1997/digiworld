// 阶段 2 D 批：「继续」口令的收件与装备段。合成数据。
import test from "node:test";
import assert from "node:assert/strict";
import { seed, makeAsset, revise } from "../src/store.js";
import { relayDesk, relayDeskSection, SNAPSHOT_MAX } from "../src/relay-desk.js";
import { projectRelayPrompt } from "../src/projects-v16.js";

const AT = "2026-10-23T03:00:00.000Z";
function fixture() {
  const prompt = makeAsset({ title: "会话交接 Handoff", type: "Prompt", content: "按五段写交接。" });
  const skill = makeAsset({ title: "UI 诊断优化", type: "Skill", content: "", files: [{ path: "SKILL.md", data: "# x", text: true }] });
  const newer = revise(prompt, { content: "第二版正文" });
  const state = {
    ...seed(),
    assets: [newer, skill],
    notes: [
      { id: "n1", at: AT, title: "知识库太短", text: "- 书架一屏只看到 3 本\n- 要按业务线筛选", format: "md1" },
      { id: "n2", at: AT, text: "已交代过的一条" },
      { id: "n3", at: AT, text: "长".repeat(SNAPSHOT_MAX + 50) },
    ],
    projectDesk: [{ projectId: "p1", inbox: [
      { kind: "note", id: "n1", at: AT }, { kind: "note", id: "n2", at: AT }, { kind: "collection", id: "c1", at: AT },
      { kind: "note", id: "gone", at: AT }, { kind: "note", id: "n3", at: AT },
    ], loadout: [
      { assetId: prompt.id, versionId: prompt.versions[0].id, at: AT }, { assetId: skill.id, versionId: skill.versions[0].id, at: AT },
    ] }],
    collabLog: [{ kind: "start", projectId: "p1", at: "2026-10-23T04:00:00.000Z", inbox: [{ kind: "note", id: "n2" }] }],
  };
  return { state, prompt, newer, skill };
}

test("只带未交代的收件；条目已删除的不带正文；装备记固定版本并提示有新版", () => {
  const { state, prompt } = fixture();
  const desk = relayDesk(state, "p1", { collectionNotes: [{ id: "c1", title: "6 种 dashboard 交互", content: "卡片翻转……", sourceUrl: "https://example.test/d" }] });
  assert.deepEqual(desk.inbox.map((i) => i.ref.id), ["n1", "c1", "gone", "n3"]);
  assert.equal(desk.inbox.find((i) => i.ref.id === "gone").missing, true);
  assert.equal(desk.inbox[0].text, "知识库太短\n- 书架一屏只看到 3 本\n- 要按业务线筛选");
  const pinned = desk.loadout.find((i) => i.ref.assetId === prompt.id);
  assert.equal(pinned.version.content, "按五段写交接。");
  assert.equal(pinned.newer, true);
  assert.equal(pinned.number, 1);
});

test("口令段：收件快照与截断、收藏带链接、Prompt 附正文、Skill 只列名称版本", () => {
  const { state } = fixture();
  const section = relayDeskSection(relayDesk(state, "p1", { collectionNotes: [{ id: "c1", title: "6 种 dashboard 交互", content: "卡片翻转……", sourceUrl: "https://example.test/d" }] }));
  assert.match(section, /先写进本项目自己的 CURRENT\.md 或派单/);
  assert.match(section, /【收件 1 · 随手记 · 10\/23】\n知识库太短\n- 书架一屏只看到 3 本/);
  assert.match(section, /【收件 2 · 收藏 · 10\/23 · 6 种 dashboard 交互 · https:\/\/example\.test\/d】\n6 种 dashboard 交互\n\n卡片翻转……/);
  assert.match(section, /…（已截断：原文共 3050 字，全文在工作台）/);
  assert.doesNotMatch(section, /已交代过的一条/);
  assert.match(section, /- 会话交接 Handoff · Prompt · v1（\d{4}-\d\d-\d\d 版本 [a-f0-9-]{8}）\n按五段写交接。/);
  assert.doesNotMatch(section, /第二版正文/);
  assert.match(section, /- UI 诊断优化 · Skill · v1（.*）：只列名称与版本，Agent 已安装就直接用/);
  assert.equal(relayDeskSection({ inbox: [], loadout: [] }), "");
});

test("继续口令带上收件与装备段，并过滤收件里的凭据；没有收件装备时与原口令一致", () => {
  const { state } = fixture();
  state.notes[0].text = "- 书架一屏只看到 3 本\n- token: sk-synthetic-should-hide";
  const item = { name: "牛马之家", root: "/synthetic/work-desk", current: { state: "ok", path: "CURRENT.md", fields: { stateId: "WD-1", writer: "无", next: "做 T15", handoff: { text: "交接", href: "docs/h.md" } } } };
  const plain = projectRelayPrompt(item, "claude");
  const withDesk = projectRelayPrompt(item, "claude", relayDesk(state, "p1"));
  assert.ok(withDesk.prompt.startsWith(plain.prompt));
  assert.match(withDesk.prompt, /【收件 1 · 随手记/);
  assert.doesNotMatch(withDesk.prompt, /sk-synthetic-should-hide/);
  assert.ok(withDesk.redactions > plain.redactions);
  assert.deepEqual(projectRelayPrompt(item, "claude", { inbox: [], loadout: [] }), plain);
});
