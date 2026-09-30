// 路线 v3 切片 3.2：知识仓库三区视图的划分规则与统计（纯函数），以及主库中三区规则、
// 个人说明修改建议的 schema 与历史约束。只用内存数据，不读任何目录。
import test from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_ZONE_RULES,
  validateZoneRules,
  zoneOf,
  zoneStats,
  weekStart,
  profileFolders,
} from "../src/knowledge-zones.js";
import { validateState, validateHistory } from "../server/schema.mjs";
import { seed } from "../src/store.js";
import { mergeBackup } from "../server/merge.mjs";

test("默认规则：GET NOTES/** 为输入区，个人上下文/** 为个人说明，其余为我的知识", () => {
  assert.deepEqual(DEFAULT_ZONE_RULES, [
    { pattern: "GET NOTES/**", zone: "input" },
    { pattern: "个人上下文/**", zone: "profile" },
  ]);
  const rules = DEFAULT_ZONE_RULES;
  assert.equal(zoneOf("GET NOTES/订阅.md", rules), "input");
  assert.equal(zoneOf("GET NOTES/子目录/订阅.md", rules), "input");
  assert.equal(zoneOf("个人上下文/关于我.md", rules), "profile");
  assert.equal(zoneOf("决定/方法.md", rules), "mine");
  assert.equal(zoneOf("根目录笔记.md", rules), "mine");
  // 前缀按整段文件夹匹配，不按字符串前缀误判。
  assert.equal(zoneOf("个人上下文副本/草稿.md", rules), "mine");
  assert.equal(zoneOf("GET NOTESX/订阅.md", rules), "mine");
  assert.deepEqual(profileFolders(rules), ["个人上下文"]);
});

test("规则按顺序匹配，第一条命中生效；允许把输入区的子文件夹划回我的知识", () => {
  const rules = validateZoneRules([
    { pattern: "GET NOTES/精选/**", zone: "mine" },
    { pattern: "GET NOTES/**", zone: "input" },
    { pattern: "个人上下文/**", zone: "profile" },
  ]);
  assert.equal(zoneOf("GET NOTES/精选/好文.md", rules), "mine");
  assert.equal(zoneOf("GET NOTES/其他/订阅.md", rules), "input");
});

test("规则校验拒绝越界、通配符滥用、重复、未知字段与超量", () => {
  const bad = [
    null,
    "GET NOTES/**",
    [{ pattern: "../外部/**", zone: "input" }],
    [{ pattern: "/Users/me/Vault/**", zone: "input" }],
    [{ pattern: "a/../b/**", zone: "input" }],
    [{ pattern: "a/./b/**", zone: "input" }],
    [{ pattern: "GET NOTES/*", zone: "input" }],
    [{ pattern: "GET NOTES", zone: "input" }],
    [{ pattern: "/**", zone: "input" }],
    [{ pattern: "**", zone: "input" }],
    [{ pattern: "a/*/b/**", zone: "input" }],
    [{ pattern: "a\\b/**", zone: "input" }],
    [{ pattern: "a\u0000/**", zone: "input" }],
    [{ pattern: "a//b/**", zone: "input" }],
    [{ pattern: " GET NOTES/**", zone: "input" }],
    [{ pattern: "x".repeat(201) + "/**", zone: "input" }],
    [{ pattern: "GET NOTES/**", zone: "unknown" }],
    [{ pattern: "GET NOTES/**", zone: "input", extra: true }],
    [
      { pattern: "GET NOTES/**", zone: "input" },
      { pattern: "GET NOTES/**", zone: "mine" },
    ],
    Array.from({ length: 21 }, (_, i) => ({ pattern: `f${i}/**`, zone: "input" })),
  ];
  for (const rules of bad)
    assert.throws(
      () => validateZoneRules(rules),
      (error) => error.status === 400,
      JSON.stringify(rules),
    );
  assert.deepEqual(validateZoneRules([]), []);
});

test("本周从周一 00:00（本机时区）开始", () => {
  const wednesday = new Date(2026, 8, 30, 15, 20).getTime();
  assert.equal(weekStart(wednesday), new Date(2026, 8, 28).getTime());
  const sunday = new Date(2026, 9, 4, 23, 59).getTime();
  assert.equal(weekStart(sunday), new Date(2026, 8, 28).getTime());
  const monday = new Date(2026, 8, 28, 0, 0).getTime();
  assert.equal(weekStart(monday), monday);
});

test("统计各区笔记数与本周新增或更新数（按修改时间）", () => {
  const now = new Date(2026, 8, 30, 12).getTime();
  const thisWeek = new Date(2026, 8, 29, 9).toISOString();
  const lastWeek = new Date(2026, 8, 27, 23, 59).toISOString();
  const files = [
    { path: "GET NOTES/a.md", modifiedAt: thisWeek },
    { path: "GET NOTES/b.md", modifiedAt: lastWeek },
    { path: "个人上下文/关于我.md", modifiedAt: lastWeek },
    { path: "决定/方法.md", modifiedAt: thisWeek },
    { path: "项目/经验.md", modifiedAt: thisWeek },
    { path: "项目/旧经验.md", modifiedAt: lastWeek },
  ];
  const stats = zoneStats(files, DEFAULT_ZONE_RULES, now);
  assert.equal(stats.weekStart, new Date(2026, 8, 28).toISOString());
  assert.deepEqual(stats.zones, {
    input: { total: 2, changedThisWeek: 1 },
    mine: { total: 3, changedThisWeek: 2 },
    profile: { total: 1, changedThisWeek: 0 },
  });
  assert.deepEqual(
    stats.files.map((f) => [f.path, f.zone, f.changedThisWeek]),
    [
      ["GET NOTES/a.md", "input", true],
      ["GET NOTES/b.md", "input", false],
      ["个人上下文/关于我.md", "profile", false],
      ["决定/方法.md", "mine", true],
      ["项目/经验.md", "mine", true],
      ["项目/旧经验.md", "mine", false],
    ],
  );
  // 修改时间异常的文件不计入本周，也不导致统计失败。
  const odd = zoneStats([{ path: "x.md", modifiedAt: "bad" }], DEFAULT_ZONE_RULES, now);
  assert.deepEqual(odd.zones.mine, { total: 1, changedThisWeek: 0 });
});

const proposal = (over = {}) => ({
  schema: 1,
  id: "p-1",
  sourceId: "src-1",
  path: "个人上下文/关于我.md",
  original: "结论先行。",
  proposed: "结论先行，零寒暄。",
  reason: "多次会话中用户要求去掉寒暄",
  proposer: "Claude Code",
  baseSha256: "a".repeat(64),
  createdAt: "2026-09-30T08:00:00.000Z",
  status: "pending",
  ...over,
});
const zones = (over = {}) => ({
  schema: 1,
  rules: DEFAULT_ZONE_RULES,
  sourceId: null,
  profileSharing: false,
  updatedAt: "2026-09-30T08:00:00.000Z",
  ...over,
});

test("主库接受三区规则与个人说明建议；旧库缺字段合法", () => {
  const base = seed();
  validateState(base);
  validateState({ ...base, knowledgeZones: zones(), profileProposals: [proposal()] });
  validateState({
    ...base,
    profileProposals: [
      proposal({
        status: "confirmed",
        decidedAt: "2026-09-30T09:00:00.000Z",
        confirmation: {
          baseSha256: "b".repeat(64),
          resultSha256: "c".repeat(64),
          confirmedAt: "2026-09-30T09:00:00.000Z",
          write: "awaiting_local",
        },
      }),
      proposal({ id: "p-2", status: "rejected", decidedAt: "2026-09-30T09:00:00.000Z" }),
    ],
  });
});

test("建议 schema 拒绝未知字段、越界路径、超长文本与非法状态", () => {
  const base = seed();
  const bad = [
    proposal({ extra: 1 }),
    proposal({ status: "approved" }),
    proposal({ path: "../外部.md" }),
    proposal({ path: "/etc/passwd.md" }),
    proposal({ path: "个人上下文/关于我.txt" }),
    proposal({ original: "" }),
    proposal({ proposed: "x".repeat(4001) }),
    proposal({ reason: "" }),
    proposal({ reason: "x".repeat(1001) }),
    proposal({ proposer: "多\n行" }),
    proposal({ proposer: "x".repeat(61) }),
    proposal({ baseSha256: "nothex" }),
    proposal({ original: "相同", proposed: "相同" }),
    proposal({ status: "rejected" }),
  ];
  for (const item of bad)
    assert.throws(
      () => validateState({ ...base, profileProposals: [item] }),
      (error) => error.status === 400,
      JSON.stringify(item),
    );
  assert.throws(() =>
    validateState({ ...base, profileProposals: [proposal(), proposal()] }),
  );
  assert.throws(() =>
    validateState({ ...base, knowledgeZones: zones({ rules: [{ pattern: "../x/**", zone: "input" }] }) }),
  );
  assert.throws(() =>
    validateState({ ...base, knowledgeZones: zones({ profileSharing: "yes" }) }),
  );
  assert.throws(() =>
    validateState({ ...base, knowledgeZones: zones({ extra: 1 }) }),
  );
});

test("通用保存不能改三区规则或建议；专用操作只能追加建议并单向决定", () => {
  const base = { ...seed(), revision: 1 };
  const withZones = { ...base, knowledgeZones: zones() };
  assert.throws(() => validateHistory(base, withZones), /专用操作/);
  assert.throws(
    () => validateHistory(base, { ...base, profileProposals: [proposal()] }),
    /专用操作/,
  );
  const allow = { allowProfile: true };
  const pending = { ...base, profileProposals: [proposal()] };
  validateHistory(base, pending, allow);
  const rejected = {
    ...base,
    profileProposals: [proposal({ status: "rejected", decidedAt: "2026-09-30T09:00:00.000Z" })],
  };
  validateHistory(pending, rejected, allow);
  // 待处理建议不能被删除，内容不能被改写，已决定的不能回到待处理。
  assert.throws(() => validateHistory(pending, { ...base, profileProposals: [] }, allow));
  assert.throws(() =>
    validateHistory(pending, { ...base, profileProposals: [proposal({ proposed: "改写" })] }, allow),
  );
  assert.throws(() => validateHistory(rejected, pending, allow));
  // 已决定的建议可以在容量清理时移除。
  validateHistory(rejected, { ...base, profileProposals: [] }, allow);
});

test("备份导入不恢复个人说明共享授权；已有主库时保留当前规则与建议", () => {
  const backup = {
    ...seed(),
    knowledgeZones: zones({ profileSharing: true }),
    profileProposals: [proposal()],
  };
  const fresh = mergeBackup(null, backup).state;
  assert.equal(fresh.knowledgeZones.profileSharing, false);
  assert.deepEqual(fresh.knowledgeZones.rules, DEFAULT_ZONE_RULES);
  const current = { ...seed(), revision: 3, knowledgeZones: zones({ rules: [] }) };
  const merged = mergeBackup(current, backup).state;
  assert.deepEqual(merged.knowledgeZones, current.knowledgeZones);
  assert.equal(merged.profileProposals, undefined);
});
