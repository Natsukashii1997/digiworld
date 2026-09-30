import test from "node:test";
import assert from "node:assert/strict";
import { compareSkillCopy } from "../src/skill-copy-diff.js";
import { buildSkillZip, readSkillZip } from "../src/skill-package.js";

const skill = (path = "SKILL.md", mode = 0o644) => ({
  path,
  text: true,
  data: "---\nname: demo\n---\nUse the complete package.\n",
  ...(mode === undefined ? {} : { mode }),
});

test("仅剥除各自 SKILL.md 外包装目录及祖先，内部目录仍纳入比较", () => {
  const expected = [
    { path: "archive", directory: true, text: false, data: [], mode: 0o700 },
    {
      path: "archive/demo",
      directory: true,
      text: false,
      data: [],
      mode: 0o700,
    },
    skill("archive/demo/SKILL.md"),
  ];
  const actual = [skill()];
  assert.deepEqual(compareSkillCopy(expected, actual), {
    status: "identical",
    permissionsKnown: true,
    counts: { expected: 1, actual: 1 },
    files: [],
  });
});

test("同一完整 Skill 的已知字节和权限一致", () => {
  const expected = [skill()];
  const actual = [skill()];
  assert.deepEqual(compareSkillCopy(expected, actual), {
    status: "identical",
    permissionsKnown: true,
    counts: { expected: 1, actual: 1 },
    files: [],
  });
});

test("非空父目录可由子文件推导，但省略的目录权限保持未知", () => {
  const expected = [
    skill(),
    { path: "scripts/run.js", text: true, data: "run();", mode: 0o755 },
  ];
  const actual = [
    skill("demo/SKILL.md"),
    { path: "demo/scripts", directory: true, data: [], mode: 0o755 },
    { path: "demo/scripts/run.js", text: true, data: "run();", mode: 0o755 },
  ];
  assert.deepEqual(compareSkillCopy(expected, actual), {
    status: "unverified",
    permissionsKnown: false,
    counts: { expected: 3, actual: 3 },
    files: [
      {
        path: "scripts",
        status: "unverified",
        changes: ["mode_unknown"],
        expected: { bytes: 0, mode: null, directory: true },
        actual: { bytes: 0, mode: 0o755, directory: true },
      },
    ],
  });
});

test("对原字节比较，不按文本标记或排列顺序比较；保留二进制差异", () => {
  const expected = [
    skill(),
    { path: "image.bin", text: false, data: [0, 255, 128, 1], mode: 0o644 },
  ];
  const actual = [
    {
      path: "image.bin",
      text: false,
      data: new Uint8Array([0, 255, 128, 2]),
      mode: 0o644,
    },
    {
      path: "SKILL.md",
      text: false,
      data: new TextEncoder().encode(skill().data),
      mode: 0o644,
    },
  ];
  assert.deepEqual(compareSkillCopy(expected, actual), {
    status: "different",
    permissionsKnown: true,
    counts: { expected: 2, actual: 2 },
    files: [
      {
        path: "image.bin",
        status: "modified",
        changes: ["content"],
        expected: { bytes: 4, mode: 0o644, directory: false },
        actual: { bytes: 4, mode: 0o644, directory: false },
      },
    ],
  });
  actual[0].data[3] = 1;
  assert.equal(compareSkillCopy(expected, actual).status, "identical");
});

test("普通权限和文件类型分别核对；权限未知不掩盖已确认的差异", () => {
  const expected = [
    skill(),
    { path: "empty", text: false, data: [], mode: 0o644 },
  ];
  const actual = [
    skill(),
    { path: "empty", directory: true, data: [], mode: 0o755 },
  ];
  const different = compareSkillCopy(expected, actual);
  assert.equal(different.status, "different");
  assert.deepEqual(different.files[0], {
    path: "empty",
    status: "modified",
    changes: ["mode", "type"],
    expected: { bytes: 0, mode: 0o644, directory: false },
    actual: { bytes: 0, mode: 0o755, directory: true },
  });
  delete actual[1].mode;
  const unknownMode = compareSkillCopy(expected, actual);
  assert.equal(unknownMode.status, "different");
  assert.equal(unknownMode.permissionsKnown, false);
  assert.deepEqual(unknownMode.files[0].changes, ["type", "mode_unknown"]);
  delete actual[1].directory;
  const unverified = compareSkillCopy(expected, actual);
  assert.equal(unverified.status, "unverified");
  assert.deepEqual(unverified.files[0].changes, ["mode_unknown"]);
});

test("新增、缺失文件和内部空目录都属于集合差异，并稳定按路径输出", () => {
  const expected = [
    skill(),
    { path: "removed.txt", text: true, data: "old", mode: 0o644 },
    { path: "empty/nested", directory: true, data: [], mode: 0o700 },
  ];
  const actual = [
    skill(),
    { path: "added.txt", text: true, data: "new", mode: 0o644 },
  ];
  const result = compareSkillCopy(expected, actual);
  assert.equal(result.status, "different");
  assert.equal(result.permissionsKnown, false);
  assert.deepEqual(result.counts, { expected: 4, actual: 2 });
  assert.deepEqual(result.files, [
    {
      path: "added.txt",
      status: "added",
      changes: [],
      expected: null,
      actual: { bytes: 3, mode: 0o644, directory: false },
    },
    {
      path: "empty",
      status: "removed",
      changes: ["mode_unknown"],
      expected: { bytes: 0, mode: null, directory: true },
      actual: null,
    },
    {
      path: "empty/nested",
      status: "removed",
      changes: [],
      expected: { bytes: 0, mode: 0o700, directory: true },
      actual: null,
    },
    {
      path: "removed.txt",
      status: "removed",
      changes: [],
      expected: { bytes: 3, mode: 0o644, directory: false },
      actual: null,
    },
  ]);
});

test("双方均省略父目录或普通文件缺少 mode 时都保持未核验", () => {
  const nested = [
    skill(),
    { path: "a/b/file", text: true, data: "same", mode: 0o644 },
  ];
  const result = compareSkillCopy(nested, structuredClone(nested));
  assert.equal(result.status, "unverified");
  assert.deepEqual(result.counts, { expected: 4, actual: 4 });
  assert.deepEqual(
    result.files.map((file) => [file.path, file.changes]),
    [
      ["a", ["mode_unknown"]],
      ["a/b", ["mode_unknown"]],
    ],
  );
  const unknown = skill();
  delete unknown.mode;
  const file = compareSkillCopy([unknown], [skill()]).files[0];
  assert.equal(file.status, "unverified");
  assert.equal(file.expected.mode, null);
  assert.equal(
    compareSkillCopy([skill("SKILL.md", 0)], [skill("SKILL.md", 0)]).status,
    "identical",
  );
});

test("真实 ZIP 包往返保持完整比较，外包装未知权限不污染内部结论", () => {
  const expected = [
    { path: "download", directory: true, text: false, data: [] },
    { path: "download/demo", directory: true, text: false, data: [] },
    skill("download/demo/SKILL.md"),
    {
      path: "download/demo/参考",
      directory: true,
      text: false,
      data: [],
      mode: 0o755,
    },
    {
      path: "download/demo/参考/文件.bin",
      text: false,
      data: [0, 128, 255],
      mode: 0o600,
    },
    { path: "download/demo/.hidden", text: true, data: "keep", mode: 0o600 },
    {
      path: "download/demo/empty",
      directory: true,
      text: false,
      data: [],
      mode: 0o755,
    },
  ];
  const zipped = readSkillZip(buildSkillZip(expected)).files;
  const actual = zipped
    .filter((file) => file.path.startsWith("download/demo/"))
    .map((file) => ({
      ...file,
      path: file.path.slice("download/demo/".length),
    }))
    .reverse();
  const before = structuredClone([expected, actual]);
  const result = compareSkillCopy(expected, actual);
  assert.equal(result.status, "identical");
  assert.equal(result.permissionsKnown, true);
  assert.deepEqual(result.counts, { expected: 5, actual: 5 });
  assert.deepEqual([expected, actual], before);
});

test("换行、大小写路径与长度变化不被文本归一化，返回只含差异元数据", () => {
  const expected = [
    skill(),
    {
      path: "Note.txt",
      text: true,
      data: "PRIVATE_EXPECTED_CONTENT\n",
      mode: 0o644,
    },
  ];
  const actual = [
    { ...skill(), data: skill().data.replaceAll("\n", "\r\n") },
    {
      path: "note.txt",
      text: true,
      data: "PRIVATE_ACTUAL_CONTENT\n",
      mode: 0o644,
    },
  ];
  const result = compareSkillCopy(expected, actual);
  assert.equal(result.status, "different");
  assert.deepEqual(
    result.files.map((file) => [file.path, file.status]),
    [
      ["Note.txt", "removed"],
      ["SKILL.md", "modified"],
      ["note.txt", "added"],
    ],
  );
  assert.deepEqual(result.files[1].changes, ["content"]);
  assert.notEqual(result.files[1].expected.bytes, result.files[1].actual.bytes);
  const serialized = JSON.stringify(result);
  assert.equal(serialized.includes("PRIVATE_EXPECTED_CONTENT"), false);
  assert.equal(serialized.includes("PRIVATE_ACTUAL_CONTENT"), false);
  assert.equal(serialized.includes('"data"'), false);
});

test("无入口、多入口、越界、冲突、危险权限和错误目录包均抛错", () => {
  const invalid = [
    [],
    [{ path: "readme.md", text: true, data: "missing entry" }],
    [skill("first/SKILL.md"), skill("second/SKILL.md")],
    [skill(), { path: "../outside", text: true, data: "" }],
    [skill("demo/SKILL.md"), { path: "outside", text: true, data: "" }],
    [skill(), { ...skill(), path: "skill.md" }],
    [
      skill(),
      { path: "a", text: true, data: "file" },
      { path: "a/child", text: true, data: "child" },
    ],
    [skill("SKILL.md", 0o4755)],
    [
      skill(),
      { path: "directory", directory: true, text: true, data: "not empty" },
    ],
  ];
  for (const files of invalid) {
    assert.throws(() => compareSkillCopy(files, [skill()]));
    assert.throws(() => compareSkillCopy([skill()], files));
  }
});
