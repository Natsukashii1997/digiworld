import test from "node:test";
import assert from "node:assert/strict";
import {
  makeAsset,
  current,
  revise,
  restore,
  safePath,
  seed,
} from "../src/store.js";
test("资产输入校验", () => {
  assert.throws(() => makeAsset({ type: "Prompt", title: "" }));
  assert.throws(() => makeAsset({ type: "Unknown", title: "名称" }));
  assert.throws(() => makeAsset({ type: "Skill", title: "缺包" }));
});
test("编辑版本不可变，ID 稳定，恢复生成新版本", () => {
  const a = makeAsset({ type: "Prompt", title: "开始", content: "第一版" });
  const b = revise(a, { title: "更新", content: "第二版" });
  assert.equal(a.versions.length, 1);
  assert.equal(current(a).content, "第一版");
  assert.equal(a.id, b.id);
  assert.notEqual(current(a).id, current(b).id);
  const c = restore(b, a.versions[0].id);
  assert.equal(c.versions.length, 3);
  assert.equal(current(c).content, "第一版");
  assert.equal(current(c).restoredFrom, a.versions[0].id);
  assert.equal(b.versions.length, 2);
});
test("恢复不存在版本会明确失败", () => {
  assert.throws(() =>
    restore(makeAsset({ type: "Prompt", title: "测试" }), "missing"),
  );
});
test("拒绝危险文件路径", () => {
  for (const p of ["../a", "a/../b", "/a", "C:/test", "a\\b", "a//b", "a\0b"])
    assert.equal(safePath(p), false, p);
  for (const p of ["SKILL.md", "references/知识.md", "scripts/main.js"])
    assert.equal(safePath(p), true, p);
});
test("示例全部可识别且 Skill 包完整", () => {
  const s = seed();
  assert.equal(s.assets.length, 6);
  assert.equal(new Set(s.assets.map((a) => a.id)).size, 6);
  assert.ok(s.assets.every((a) => a.demo));
  assert.ok(
    s.assets
      .filter((a) => a.type === "Skill")
      .every((a) => current(a).files.some((f) => f.path === "SKILL.md")),
  );
  assert.equal(s.night.enabled, false);
});
