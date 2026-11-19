// #93 第三批：Design 页两种形式（设计 Prompt 原样复制 / 设计 Skill 登记名字与 GitHub 地址生成调用指令）与效果图。
import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, readdir, stat, realpath } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { makeAsset, revise, current, seed } from "../src/store.js";
import { validateState } from "../server/schema.mjs";
import { designCallText, designCopyText, designKindLabel, hasSkillPackage, isLinkedDesignSkill, normalizeDesignRepo, normalizeRepoPath } from "../src/design-asset.js";
import { createNoteImages } from "../server/note-images.mjs";
import { compareVersions } from "../src/version-diff.js";

const IMG = `${"a".repeat(64)}.png`;
const linked = (design = {}) => ({ type: "Design", title: "taste-skill", description: "防模板化的前端设计。", content: "", files: [],
  design: { kind: "skill", skillName: "taste-skill", repo: "https://github.com/Leonxlnx/taste-skill", path: "skills/taste-skill", ...design } });
const prompt = (design = {}) => ({ type: "Design", title: "像素硬件风", description: "深墨蓝底、像素图标。", content: "请用像素硬件风生成页面。\n不要渐变大标题。", files: [],
  design: { kind: "prompt", ...design } });

test("设计 Skill 只登记名字与 GitHub 地址，复制时按定稿模板生成调用指令", () => {
  const asset = makeAsset(linked());
  validateState({ ...seed(), assets: [asset] });
  const v = current(asset);
  assert.equal(isLinkedDesignSkill(v), true);
  assert.equal(hasSkillPackage(asset, v), false, "登记地址的设计 Skill 没有包，不走交付");
  assert.equal(designKindLabel(v), "设计 Skill");
  const text = designCallText(v);
  assert.equal(designCopyText(v), text);
  assert.match(text, /^请用设计 skill「taste-skill」帮我生成，按这三步做：\n1\. 先检查你当前的环境里有没有装 taste-skill。/);
  assert.match(text, /2\. 没装：从 https:\/\/github\.com\/Leonxlnx\/taste-skill 安装（在仓库的 skills\/taste-skill 目录），装好后告诉我装在哪。如果你的环境不能装 skill，就直接读这个仓库里 taste-skill 的 SKILL\.md，照它的规则做。/);
  assert.match(text, /3\. 已经装了或装好以后：调用 taste-skill，按我下面的需求生成。\n\n我的需求：$/);
  const noPath = makeAsset(linked({ path: undefined }));
  assert.doesNotMatch(designCallText(current(noPath)), /在仓库的/);
});

test("设计 Prompt 复制原样给出正文，不再包「ChatGPT 生图」那层", () => {
  const asset = makeAsset(prompt());
  const v = current(asset);
  assert.equal(designCopyText(v), "请用像素硬件风生成页面。\n不要渐变大标题。");
  assert.equal(designKindLabel(v), "设计 Prompt");
  assert.throws(() => designCallText(v), /只有登记了 GitHub 地址的设计 Skill/);
});

test("旧版 ZIP 设计 Skill 仍可读、仍走交付，标为旧版", () => {
  const files = [{ path: "poster/SKILL.md", text: true, mode: 0o644, data: "---\nname: poster-studio\n---\n# Poster" }];
  const asset = makeAsset({ type: "Design", title: "旧海报", content: "", files, design: { kind: "skill" } });
  validateState({ ...seed(), assets: [asset] });
  assert.equal(hasSkillPackage(asset, current(asset)), true);
  assert.equal(designKindLabel(current(asset)), "设计 Skill · ZIP 包（旧版）");
});

test("效果图按内容寻址 ID 挂在 design.image；改版保留，非法引用被拒", () => {
  const asset = makeAsset(linked({ image: IMG }));
  validateState({ ...seed(), assets: [asset] });
  const next = revise(asset, { ...linked({ image: IMG }), description: "改了说明" });
  assert.equal(current(next).design.image, IMG);
  for (const image of ["x.png", `${"a".repeat(64)}.gif`, "../a.png", 1])
    assert.throws(() => makeAsset(linked({ image })), /效果图引用无效/, String(image));
  const diff = compareVersions(current(asset), current(makeAsset(prompt({ image: `${"b".repeat(64)}.jpg` }))));
  assert.ok(diff.fields.some((f) => f.key === "design.image"), "版本对比显示效果图变化");
  assert.ok(diff.fields.some((f) => f.key === "design.kind" && f.before === "设计 Skill" && f.after === "设计 Prompt"));
});

test("设计 Skill 字段校验：名字、GitHub 仓库地址、子目录；不能带包；Prompt 不能带地址", () => {
  assert.equal(normalizeDesignRepo(" https://github.com/a/b "), "https://github.com/a/b");
  assert.equal(normalizeDesignRepo("https://github.com/a/b/tree/main/skills/x"), "https://github.com/a/b/tree/main/skills/x");
  for (const bad of ["http://github.com/a/b", "https://gitlab.com/a/b", "https://github.com/a", "https://github.com/a/b?x=1", "https://u:p@github.com/a/b", "github.com/a/b"])
    assert.throws(() => normalizeDesignRepo(bad), /GitHub 地址/, bad);
  assert.equal(normalizeRepoPath(" /skills/x/ "), "skills/x");
  assert.equal(normalizeRepoPath(""), "");
  for (const bad of ["../x", "a/../b", "a//b", "a b", "a\\b", "a?b"]) assert.throws(() => normalizeRepoPath(bad), /相对路径/, bad);
  assert.throws(() => makeAsset(linked({ skillName: undefined })), /设计 Skill 的名称/);
  assert.throws(() => makeAsset(linked({ skillName: "Taste Skill" })), /有效 Skill 名称/);
  assert.throws(() => makeAsset(linked({ repo: "HTTPS://github.com/a/b" })), /规范链接/);
  assert.throws(() => makeAsset(linked({ path: "../x" })), /相对路径/);
  assert.throws(() => makeAsset({ ...linked(), files: [{ path: "x/SKILL.md", text: true, mode: 0o644, data: "---\nname: x\n---" }] }), /不带 ZIP 包/);
  assert.throws(() => makeAsset(prompt({ repo: "https://github.com/a/b" })), /设计 Prompt 不填 GitHub 地址/);
  assert.throws(() => makeAsset(prompt({ path: "x" })), /设计 Prompt 不填 GitHub 地址/);
  assert.throws(() => makeAsset({ ...prompt(), content: "  " }), /设计 Prompt 的提示词正文/);
  assert.throws(() => makeAsset({ type: "Design", title: "x", content: "", files: [], design: { kind: "skill", path: "x", skillName: "x" } }), /只用于登记 GitHub 地址/);
  assert.throws(() => validateState({ ...seed(), assets: [{ ...makeAsset(linked()), versions: [{ ...current(makeAsset(linked())), design: { ...linked().design, extra: 1 } }] }] }), /设计形式/);
});

test("效果图存储复用便签图片的写法，单独放 design-images 目录", async () => {
  const dir = await realpath(await mkdtemp(join(tmpdir(), "design-images-")));
  try {
    const images = createNoteImages(dir, { folder: "design-images", label: "效果图" });
    const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 73, 72, 68, 82, 0, 0, 0, 1, 0, 0, 0, 1, 8, 6, 0, 0, 0]);
    const saved = await images.store({ data: png });
    assert.match(saved.id, /^[a-f0-9]{64}\.png$/);
    assert.deepEqual(await readdir(dir), ["design-images"]);
    assert.equal((await stat(join(dir, "design-images"))).mode & 0o777, 0o700);
    assert.deepEqual((await images.read(saved.id)).data, png);
    await assert.rejects(images.store({ data: new Uint8Array([1, 2, 3]) }), /只支持 PNG、JPG、WebP/);
    await assert.rejects(images.read(`${"c".repeat(64)}.png`), /本机效果图不存在/);
    await assert.rejects(images.read("../x.png"), /效果图编号无效/);
  } finally { await rm(dir, { recursive: true, force: true }); }
});
