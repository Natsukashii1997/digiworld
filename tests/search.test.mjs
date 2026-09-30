import test from "node:test";
import assert from "node:assert/strict";
import { seed, makeAsset, revise, current } from "../src/store.js";
import {
  terms,
  assetHit,
  searchAssets,
  searchWorkspace,
  tagCounts,
} from "../src/search.js";

function workspace() {
  const s = seed();
  const prompt = makeAsset({
    type: "Prompt",
    title: "周报整理",
    description: "把零散记录整理成周报",
    content: "开头先列出三件最重要的事。然后写下风险与求助事项，最后附上下周计划。",
    tags: ["写作", "复盘"],
  });
  const skill = makeAsset({
    type: "Skill",
    title: "合成技能",
    content: "",
    files: [
      { path: "SKILL.md", text: true, data: "# 合成技能\n用于校验表格公式。" },
      { path: "scripts/check.py", text: true, data: "print('lint-marker')" },
      { path: "assets/logo.bin", text: false, data: new Uint8Array([1, 2]) },
    ],
    tags: ["写作"],
  });
  const archived = {
    ...makeAsset({ type: "Prompt", title: "旧周报模板", content: "周报 已停用" }),
    archived: true,
  };
  s.assets = [prompt, skill, archived];
  s.notes = [{ id: "n1", text: "明天把周报流程改成两段式", at: "2026-09-29T00:00:00.000Z" }];
  s.references = [
    { id: "r1", title: "写作手册", url: "https://example.com/guide", note: "关于周报结构的建议" },
  ];
  s.projects = [
    { id: "p1", name: "季度复盘", goal: "汇总周报", next: "", location: "", status: "进行中" },
  ];
  s.connections = {
    roots: [], projects: [{ id: "d1", name: "report-site", repoKey: "me/report-site", localPaths: ["/fixture/report-site"], description: "周报网站" }],
    agents: [], github: { status: "", login: "", message: "", at: "" }, errors: [], truncated: false,
  };
  return { s, prompt, skill, archived };
}

test("关键词按空白拆分、忽略大小写，所有词须出现", () => {
  assert.deepEqual(terms("  Weekly   周报 "), ["weekly", "周报"]);
  assert.deepEqual(terms("   "), []);
  const { prompt } = workspace();
  assert.ok(assetHit(prompt, terms("风险 计划")));
  assert.equal(assetHit(prompt, terms("风险 不存在")), null);
  assert.equal(assetHit(prompt, []), null);
});

test("资产命中标题、说明、标签、正文和文本文件，并给出位置与摘录", () => {
  const { prompt, skill } = workspace();
  assert.equal(assetHit(prompt, ["周报整理"]).where, "标题");
  assert.equal(assetHit(prompt, ["零散"]).where, "说明");
  assert.equal(assetHit(prompt, ["复盘"]).where, "标签");
  const body = assetHit(prompt, ["求助"]);
  assert.equal(body.where, "正文");
  assert.match(body.snippet, /求助/);
  assert.equal(assetHit(skill, ["表格公式"]).where, "文件 SKILL.md");
  assert.equal(assetHit(skill, terms("LINT-MARKER")).where, "文件 scripts/check.py");
  assert.equal(assetHit(skill, ["check.py"]).where, "文件路径");
  // 二进制文件内容不参与搜索。
  assert.equal(assetHit(skill, ["\u0001"]), null);
});

test("摘录截取关键词前后片段并用省略号标出截断", () => {
  const long = makeAsset({ type: "Prompt", title: "长文", content: "甲".repeat(200) + "目标词" + "乙".repeat(200) });
  const hit = assetHit(long, ["目标词"]);
  assert.ok(hit.snippet.startsWith("…") && hit.snippet.endsWith("…"));
  assert.ok(hit.snippet.length < 100);
});

test("只搜当前版本：历史版本内容不命中", () => {
  const a = makeAsset({ type: "Prompt", title: "版本测试", content: "旧内容专有词" });
  const b = revise(a, { ...current(a), content: "新内容" });
  assert.equal(assetHit(b, ["旧内容专有词"]), null);
  assert.ok(assetHit(b, ["新内容"]));
});

test("已归档资产只计数，不列入结果", () => {
  const { s, archived } = workspace();
  const { hits, archived: count } = searchAssets(s.assets, ["周报"]);
  assert.equal(count, 1);
  assert.ok(!hits.some((h) => h.asset.id === archived.id));
});

test("全局搜索覆盖随手记、参考、手动与扫描项目", () => {
  const { s } = workspace();
  const r = searchWorkspace(s, "周报");
  assert.equal(r.assets.length, 1);
  assert.equal(r.archived, 1);
  assert.equal(r.notes.length, 1);
  assert.equal(r.notes[0].where, "正文");
  assert.equal(r.references.length, 1);
  assert.equal(r.references[0].where, "笔记");
  assert.deepEqual(r.projects.map((p) => p.item.id), ["p1", "d1"]);
  assert.equal(searchWorkspace(s, "example.com").references[0].where, "链接");
  assert.equal(searchWorkspace(s, "  "), null);
  const none = searchWorkspace(s, "完全不存在的词");
  assert.equal(none.assets.length + none.notes.length + none.references.length + none.projects.length, 0);
});

test("缺少扫描连接的旧主库也能搜索", () => {
  const { s } = workspace();
  delete s.connections;
  assert.equal(searchWorkspace(s, "周报").projects.length, 1);
});

test("标签统计只算未归档资产当前版本，按数量再按名称排序", () => {
  const { s } = workspace();
  s.assets[2] = { ...s.assets[2], versions: [{ ...current(s.assets[2]), tags: ["归档专用"] }] };
  assert.deepEqual(tagCounts(s.assets), [["写作", 2], ["复盘", 1]]);
});

test("按版本对象缓存，重复搜索结果稳定", () => {
  const { prompt } = workspace();
  const first = assetHit(prompt, ["风险"]);
  assert.deepEqual(assetHit(prompt, ["风险"]), first);
});

test("多词跨字段命中时，摘录不受关键词顺序影响，并列出全部命中位置", () => {
  const a = makeAsset({ type: "Prompt", title: "周报整理", content: "这是合成正文，只有正文包含求助事项。" });
  for (const query of ["周报 求助", "求助 周报"]) {
    const hit = assetHit(a, terms(query));
    assert.equal(hit.where, "标题、正文", query);
    assert.match(hit.snippet, /求助事项/, query);
  }
  // 只命中短字段时不附摘录。
  assert.deepEqual(assetHit(a, terms("周报")), { where: "标题" });
});
