// #93 资产分类与状态标识：自动归组、分类表校验、状态标识边界、schema 对 category / assetCategories 的约束。
import test from "node:test";
import assert from "node:assert/strict";
import { validateState } from "../server/schema.mjs";
import { seed, makeAsset, current } from "../src/store.js";
import {
  DEFAULT_CATEGORIES, UNSORTED, badgesOf, categoriesOf, categoryColor, categoryOf, hasCategory, validateAssetCategories,
} from "../src/asset-categories.js";

const DAY = 864e5;
const NOW = Date.parse("2026-11-19T12:00:00.000Z");
const ago = (days) => new Date(NOW - days * DAY).toISOString();

function prompt(title, extra = {}) {
  const a = makeAsset({ type: "Prompt", title, description: extra.description || "", content: "正文", tags: extra.tags || [], source: "个人创建", files: [] });
  if (extra.createdDaysAgo !== undefined) a.createdAt = a.versions[0].at = ago(extra.createdDaysAgo);
  return a;
}
const uses = (n, daysAgo) => Array.from({ length: n }, () => ({ kind: "use", at: ago(0), usedAt: ago(daysAgo) }));

test("分类只给 Prompt 与 Skill", () => {
  assert.equal(hasCategory("Prompt"), true);
  assert.equal(hasCategory("Skill"), true);
  for (const t of ["Design", "Workflow", "Rule", "MCP"]) assert.equal(hasCategory(t), false);
});

test("没有分类表时用默认六类；分类表为空数组也回落默认", () => {
  assert.equal(categoriesOf({}), DEFAULT_CATEGORIES);
  assert.equal(categoriesOf({ assetCategories: [] }), DEFAULT_CATEGORIES);
  const custom = [{ id: "a", name: "甲", color: "blue" }];
  assert.equal(categoriesOf({ assetCategories: custom }), custom);
  assert.deepEqual(DEFAULT_CATEGORIES.map((c) => c.name), ["思考决策", "业务落地", "开发工程", "复盘与知识", "设计表达", "本机运维"]);
});

test("手选分类优先；手选的分类已不在表里时回到自动归组", () => {
  const a = prompt("代码交接");
  a.category = "biz";
  assert.deepEqual(categoryOf(a, DEFAULT_CATEGORIES, current(a)), { id: "biz", inferred: false });
  a.category = "gone";
  assert.deepEqual(categoryOf(a, DEFAULT_CATEGORIES, current(a)), { id: "dev", inferred: true });
});

test("按标题、说明、标签里的关键词自动归组，命中多的分类胜出；英文不分大小写", () => {
  const cases = [
    ["第一性原理拆问题", {}, "think"],
    ["随便", { description: "周复盘与知识沉淀" }, "retro"],
    ["随便", { tags: ["海报"] }, "design"],
    ["github 开源检索", {}, "dev"],
    ["定时备份体检", {}, "ops"],
    ["用户增长策略", {}, "biz"],
  ];
  for (const [title, extra, want] of cases) {
    const a = prompt(title, extra);
    assert.deepEqual(categoryOf(a, DEFAULT_CATEGORIES, current(a)), { id: want, inferred: true }, title);
  }
});

test("一个关键词都不中归为待归类；自建分类没有关键词，只能手选", () => {
  const a = prompt("随便写写");
  assert.deepEqual(categoryOf(a, DEFAULT_CATEGORIES, current(a)), { id: UNSORTED, inferred: true });
  const b = prompt("代码交接");
  assert.deepEqual(categoryOf(b, [{ id: "mine", name: "我的", color: "pink" }], current(b)), { id: UNSORTED, inferred: true });
});

test("分类颜色只取固定色板，未知颜色回落中性色", () => {
  assert.equal(categoryColor({ color: "violet" }), "var(--violet)");
  assert.equal(categoryColor({ color: "green" }), "var(--lcd)");
  assert.equal(categoryColor({ color: "#ff0000" }), "var(--muted)");
  assert.equal(categoryColor(undefined), "var(--muted)");
});

test("分类表校验：拒绝非法 ID、保留字、重复、超长名称、色板外颜色与多余字段", () => {
  assert.doesNotThrow(() => validateAssetCategories(DEFAULT_CATEGORIES));
  const bad = [
    "x",
    [{ id: "Bad ID", name: "甲", color: "blue" }],
    [{ id: UNSORTED, name: "甲", color: "blue" }],
    [{ id: "a", name: "甲", color: "blue" }, { id: "a", name: "乙", color: "blue" }],
    [{ id: "a", name: "甲", color: "blue" }, { id: "b", name: " 甲 ", color: "blue" }],
    [{ id: "a", name: "", color: "blue" }],
    [{ id: "a", name: "一".repeat(21), color: "blue" }],
    [{ id: "a", name: "甲", color: "red" }],
    [{ id: "a", name: "甲", color: "blue", icon: "x" }],
    Array.from({ length: 51 }, (_, i) => ({ id: `c${i}`, name: `类${i}`, color: "blue" })),
  ];
  for (const list of bad) assert.throws(() => validateAssetCategories(list), undefined, JSON.stringify(list).slice(0, 60));
});

test("NEW：入库 7 天内；第 8 天熄灭", () => {
  assert.deepEqual(badgesOf(prompt("a", { createdDaysAgo: 7 }), [], NOW), ["NEW"]);
  assert.deepEqual(badgesOf(prompt("a", { createdDaysAgo: 8 }), [], NOW), []);
});

test("HOT：近 30 天复制 ≥ 5 次；更早的复制不算", () => {
  const a = prompt("a", { createdDaysAgo: 60 });
  assert.deepEqual(badgesOf(a, uses(5, 30), NOW), ["HOT"]);
  assert.deepEqual(badgesOf(a, uses(4, 3), NOW), []);
  assert.deepEqual(badgesOf(a, [...uses(4, 3), ...uses(3, 31)], NOW), []);
});

test("UPD：7 天内改过且不是新入库；只有一个版本不算", () => {
  const a = prompt("a", { createdDaysAgo: 20 });
  assert.deepEqual(badgesOf(a, uses(1, 1), NOW), []);
  a.versions.push({ ...a.versions[0], id: "v2", at: ago(6) });
  assert.deepEqual(badgesOf(a, uses(1, 1), NOW), ["UPD"]);
  const fresh = prompt("b", { createdDaysAgo: 3 });
  fresh.versions.push({ ...fresh.versions[0], id: "v2", at: ago(1) });
  assert.deepEqual(badgesOf(fresh, [], NOW), ["NEW"]);
});

test("IDLE：入库超过 30 天且一次没用过；用过一次就熄灭", () => {
  const a = prompt("a", { createdDaysAgo: 31 });
  assert.deepEqual(badgesOf(a, [], NOW), ["IDLE"]);
  assert.deepEqual(badgesOf(a, uses(1, 25), NOW), []);
  assert.deepEqual(badgesOf(prompt("b", { createdDaysAgo: 30 }), [], NOW), []);
});

test("一张卡最多两个标识，按 NEW / HOT / UPD / IDLE 顺序取前两个", () => {
  const a = prompt("a", { createdDaysAgo: 2 });
  assert.deepEqual(badgesOf(a, uses(6, 1), NOW), ["NEW", "HOT"]);
  const b = prompt("b", { createdDaysAgo: 20 });
  b.versions.push({ ...b.versions[0], id: "v2", at: ago(1) });
  assert.deepEqual(badgesOf(b, uses(5, 2), NOW), ["HOT", "UPD"]);
});

const invalid = (state, pattern) => assert.throws(() => validateState(state), pattern);

test("schema：Prompt 与 Skill 可带存在的分类；Design 等其他类型带分类被拒", () => {
  const p = prompt("a");
  p.category = "think";
  const s = makeAsset({ type: "Skill", title: "s", description: "", content: "", tags: [], source: "个人创建", files: [], installUrl: "https://github.com/example/skills/tree/main/s" });
  s.category = "dev";
  assert.doesNotThrow(() => validateState({ ...seed(), assets: [p, s] }));
  const d = makeAsset({ type: "Design", title: "d", description: "", content: "画面", tags: [], source: "个人创建", files: [], design: { kind: "prompt" } });
  d.category = "design";
  invalid({ ...seed(), assets: [d] }, /只有 Prompt 与 Skill 可设置分类/);
});

test("schema：分类不在分类表里、或不是字符串被拒；自定义分类表生效", () => {
  const p = prompt("a");
  p.category = "nope";
  invalid({ ...seed(), assets: [p] }, /分类不存在/);
  p.category = 1;
  invalid({ ...seed(), assets: [p] }, /分类不存在/);
  p.category = "mine";
  assert.doesNotThrow(() => validateState({ ...seed(), assetCategories: [{ id: "mine", name: "我的", color: "pink" }], assets: [p] }));
  p.category = "think";
  invalid({ ...seed(), assetCategories: [{ id: "mine", name: "我的", color: "pink" }], assets: [p] }, /分类不存在/);
});

test("schema：分类表本身非法时整份数据被拒；不带分类字段的旧数据照常通过", () => {
  invalid({ ...seed(), assetCategories: [{ id: "a", name: "甲", color: "red" }] }, /分类颜色只能取固定色板/);
  const state = { ...seed(), assets: [prompt("旧")] };
  assert.doesNotThrow(() => validateState(state));
  assert.equal("assetCategories" in validateState(state), false);
});
