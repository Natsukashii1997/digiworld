import test from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { zipSync, strToU8 } from "fflate";
import { readSkillZip, buildSkillZip } from "../src/skill-package.js";

test("完整包往返保留中文、二进制、隐藏文件、空目录和执行权限", () => {
  const bytes = zipSync({
    "sample/SKILL.md": strToU8("---\nname: sample\n---\n示例"),
    "sample/scripts/run.sh": [
      strToU8("#!/bin/sh\nexit 0"),
      { os: 3, attrs: 0o100755 << 16 },
    ],
    "sample/参考/文件.bin": new Uint8Array([0, 255, 128]),
    "sample/.hidden": strToU8("keep"),
    "sample/empty/": [new Uint8Array(), { os: 3, attrs: (0o40755 << 16) | 16 }],
  });
  const first = readSkillZip(bytes);
  assert.equal(first.entry, "sample/SKILL.md");
  assert.equal(first.name, "sample");
  assert.equal(first.files.length, 5);
  assert.equal(first.files.find((f) => f.path.endsWith("run.sh")).mode, 0o755);
  assert.equal(
    first.files.find((f) => f.path.endsWith("empty")).directory,
    true,
  );
  const second = readSkillZip(buildSkillZip(first.files));
  assert.deepEqual(second.files, first.files);
});

test("导入拒绝越界、路径冲突、符号链接、多入口与损坏内容", () => {
  const skill = strToU8("---\nname: valid\n---\n说明");
  for (const entries of [
    { "SKILL.md": skill, "../escape": skill },
    { "SKILL.md": skill, "A.txt": skill, "a.txt": skill },
    { "SKILL.md": skill, "é.txt": skill, "e\u0301.txt": skill },
    { "SKILL.md": skill, dir: skill, "dir/file": skill },
    { "SKILL.md": skill, link: [skill, { os: 3, attrs: 0o120777 << 16 }] },
    { "a/SKILL.md": skill, "b/SKILL.md": skill },
    { "a/SKILL.md": skill, outside: skill },
  ])
    assert.throws(() => readSkillZip(zipSync(entries)));
  const corrupt = zipSync({ "SKILL.md": skill }, { level: 0 });
  corrupt[40] ^= 1;
  assert.throws(() => readSkillZip(corrupt), /校验失败/);
  assert.throws(() => readSkillZip(new Uint8Array()), /格式无效/);
});

test("ZIP 注释中的目录标记不得改变已经核验的解压范围", () => {
  const original = zipSync({ "SKILL.md": strToU8("真实内容") });
  const bytes = new Uint8Array(original.length + 22);
  bytes.set(original);
  const view = new DataView(bytes.buffer);
  view.setUint16(original.length - 2, 22, true);
  view.setUint32(original.length, 0x06054b50, true);
  view.setUint16(bytes.length - 2, 1, true);
  assert.equal(readSkillZip(bytes).content, "真实内容");
});

test("逐项解压跨多个压缩分块仍完整保留二进制", () => {
  const binary = new Uint8Array(randomBytes(50000));
  const bytes = zipSync({ "SKILL.md": strToU8("入口"), "asset.bin": binary });
  assert.deepEqual(
    readSkillZip(bytes).files.find((f) => f.path === "asset.bin").data,
    binary,
  );
});

test("拒绝真实展开长度大于声明的损坏 ZIP，不可静默截断", () => {
  const bytes = zipSync({ "SKILL.md": strToU8("A".repeat(1000)) });
  const view = new DataView(bytes.buffer);
  const end = bytes.length - 22,
    central = view.getUint32(end + 16, true);
  // Inconsistent metadata must never redefine the actual file bytes.
  view.setUint32(14, 0xd3d99e8b, true);
  view.setUint32(22, 1, true);
  view.setUint32(central + 16, 0xd3d99e8b, true);
  view.setUint32(central + 24, 1, true);
  assert.throws(() => readSkillZip(bytes), /长度|校验/);
});
