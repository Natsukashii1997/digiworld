import test from "node:test";
import assert from "node:assert/strict";
import { compareVersions, diffText } from "../src/version-diff.js";

const version = (values = {}) => ({
  title: "研究助手",
  description: "保留来源",
  source: "个人创建",
  tags: ["中文", "研究"],
  content: "# 研究\n",
  files: [],
  ...values,
});

test("比较资产展示字段，标签保留顺序，身份与时间不影响内容相同判定", () => {
  const before = version({ id: "v1", at: "昨天" });
  const after = version({
    id: "v2",
    at: "今天",
    title: "研究助手二版",
    description: "核对来源",
    source: "https://example.com/研究",
    tags: ["研究", "中文"],
  });
  assert.deepEqual(compareVersions(before, after), {
    fields: [
      {
        key: "title",
        label: "名称",
        before: "研究助手",
        after: "研究助手二版",
      },
      {
        key: "description",
        label: "描述",
        before: "保留来源",
        after: "核对来源",
      },
      {
        key: "source",
        label: "来源",
        before: "个人创建",
        after: "https://example.com/研究",
      },
      {
        key: "tags",
        label: "标签",
        before: '["中文","研究"]',
        after: '["研究","中文"]',
      },
    ],
    files: [],
    contentChanged: false,
    identical: false,
  });
  assert.equal(
    compareVersions(before, version({ id: "v3", restoredFrom: "v1" }))
      .identical,
    true,
  );
});

test("Skill 比较完整路径集合、二进制字节、权限与文件类型，保留空目录", () => {
  const before = version({
    files: [
      {
        path: "z.bin",
        data: new Uint8Array([0, 255, 128]),
        text: false,
        mode: 0o644,
      },
      { path: "removed.md", data: "旧文件", text: true },
      { path: "scripts/run", data: "", text: true, mode: 0o644 },
      { path: "was-file", data: "", text: true },
    ],
  });
  const after = version({
    files: [
      {
        path: "was-file",
        directory: true,
        data: new Uint8Array(),
        text: false,
      },
      {
        path: "empty-dir",
        directory: true,
        data: new Uint8Array(),
        text: false,
      },
      { path: "scripts/run", data: "", text: true, mode: 0o755 },
      {
        path: "z.bin",
        data: new Uint8Array([0, 255, 129]),
        text: false,
        mode: 0o755,
      },
    ],
  });
  const result = compareVersions(before, after);
  assert.deepEqual(
    result.files.map(({ path, status, changes }) => ({
      path,
      status,
      changes,
    })),
    [
      { path: "empty-dir", status: "added", changes: [] },
      { path: "removed.md", status: "removed", changes: [] },
      { path: "scripts/run", status: "modified", changes: ["mode"] },
      { path: "was-file", status: "modified", changes: ["type"] },
      { path: "z.bin", status: "modified", changes: ["content", "mode"] },
    ],
  );
  assert.equal(result.files[0].before, null);
  assert.equal(result.files[0].after, after.files[1]);
  assert.equal(result.files[1].before, before.files[1]);
  assert.equal(result.files[1].after, null);
  assert.equal(result.contentChanged, false);
  assert.equal(result.identical, false);
});

test("逐行比较保留中文，显示插入与删除，可无损还原两版正文", () => {
  assert.deepEqual(diffText("标题\n旧步骤\n结尾", "标题\n新步骤\n结尾"), {
    mode: "lines",
    rows: [
      { type: "same", text: "标题\n" },
      { type: "removed", text: "旧步骤\n" },
      { type: "added", text: "新步骤\n" },
      { type: "same", text: "结尾" },
    ],
    formatOnly: false,
  });
});

test("换行风格变化单独标记，末尾换行与空行不被抹除", () => {
  const result = diffText("中文\r\n第二行\r", "中文\n第二行\n");
  assert.equal(result.formatOnly, true);
  assert.deepEqual(result.rows, [
    { type: "removed", text: "中文\r\n" },
    { type: "removed", text: "第二行\r" },
    { type: "added", text: "中文\n" },
    { type: "added", text: "第二行\n" },
  ]);
  assert.deepEqual(diffText("末尾", "末尾\n"), {
    mode: "lines",
    rows: [
      { type: "removed", text: "末尾" },
      { type: "added", text: "末尾\n" },
    ],
    formatOnly: false,
  });
  assert.deepEqual(diffText("\n", "\n\n").rows, [
    { type: "same", text: "\n" },
    { type: "added", text: "\n" },
  ]);
});

test("超过字符或5000行上限时明确退回全文，不生成不完整差异", () => {
  for (const [before, after] of [
    ["甲".repeat(100001), "乙"],
    ["", "乙".repeat(100001)],
    ["行\n".repeat(5001), ""],
    ["", "行\n".repeat(5001)],
  ])
    assert.deepEqual(diffText(before, after), {
      mode: "full",
      rows: [],
      formatOnly: false,
    });
  assert.equal(diffText("甲".repeat(100000), "乙").mode, "lines");
  assert.equal(diffText("行\n".repeat(1000), "").mode, "lines");
  assert.equal(diffText("甲\n".repeat(499), "乙\n".repeat(499)).mode, "lines");
  const large = diffText("甲\n".repeat(500), "乙\n".repeat(500));
  assert.equal(large.mode,"lines");
  assert.equal(large.rows.filter(r=>r.type==="removed").length,500);
  assert.equal(large.rows.filter(r=>r.type==="added").length,500);
  assert.deepEqual(diffText("行\r\n".repeat(5001), "行\n".repeat(5001)), {
    mode: "full",
    rows: [],
    formatOnly: true,
  });
});

test("正文与标签变化独立判定，空值明确呈现，不修改传入版本", () => {
  const before = version();
  const after = version({ content: "", description: "", source: "", tags: [] });
  const snapshot = structuredClone([before, after]);
  const result = compareVersions(before, after);
  assert.equal(result.contentChanged, true);
  assert.equal(result.identical, false);
  assert.deepEqual(result.fields, [
    { key: "description", label: "描述", before: "保留来源", after: "" },
    { key: "source", label: "来源", before: "个人创建", after: "" },
    { key: "tags", label: "标签", before: '["中文","研究"]', after: "[]" },
  ]);
  assert.deepEqual([before, after], snapshot);
  assert.equal(
    compareVersions(
      {},
      {
        title: "",
        description: "",
        source: "",
        tags: [],
        files: [],
        content: "",
      },
    ).identical,
    true,
  );
  assert.equal(
    compareVersions(
      version({ tags: ["甲,乙"] }),
      version({ tags: ["甲", "乙"] }),
    ).identical,
    false,
  );
});

test("Skill 相同字节不受文本存储标记与文件顺序影响，未知权限不冒充已知权限", () => {
  const before = version({
    files: [
      { path: "SKILL.md", text: true, data: "中文", mode: 0o644 },
      { path: "empty", text: true, data: "", directory: true },
    ],
  });
  const after = version({
    files: [
      { path: "empty", text: false, data: new Uint8Array(), directory: true },
      {
        path: "SKILL.md",
        text: false,
        data: new Uint8Array([228, 184, 173, 230, 150, 135]),
        mode: 0o644,
      },
    ],
  });
  const snapshot = structuredClone([before, after]);
  assert.equal(compareVersions(before, after).identical, true);
  assert.deepEqual([before, after], snapshot);
  const changed = version({
    files: [{ path: "SKILL.md", text: true, data: "中文" }, before.files[1]],
  });
  assert.deepEqual(compareVersions(before, changed).files[0].changes, ["mode"]);
});

test("空文档、纯插入、纯删除与重复行均保留准确次序", () => {
  assert.deepEqual(diffText("", ""), {
    mode: "lines",
    rows: [],
    formatOnly: false,
  });
  assert.deepEqual(diffText("", "新\n尾").rows, [
    { type: "added", text: "新\n" },
    { type: "added", text: "尾" },
  ]);
  assert.deepEqual(diffText("旧\n尾", "").rows, [
    { type: "removed", text: "旧\n" },
    { type: "removed", text: "尾" },
  ]);
  assert.deepEqual(diffText("重复\n重复\n末尾\n", "重复\n末尾\n重复\n").rows, [
    { type: "same", text: "重复\n" },
    { type: "removed", text: "重复\n" },
    { type: "same", text: "末尾\n" },
    { type: "added", text: "重复\n" },
  ]);
});

test("逐行结果可无损重建中英文与混合换行的两版输入", () => {
  const values = [
    "",
    "\n",
    "\r",
    "\r\n",
    "\r\r\n",
    "中",
    "中\n",
    "中\r\n",
    "😀\n中\r甲",
    "a\na\nb\n",
    "a\nb\na\n",
    "\n\n尾\n\n",
  ];
  for (const before of values)
    for (const after of values) {
      const result = diffText(before, after);
      assert.equal(result.mode, "lines");
      assert.equal(
        result.rows
          .filter((row) => row.type !== "added")
          .map((row) => row.text)
          .join(""),
        before,
      );
      assert.equal(
        result.rows
          .filter((row) => row.type !== "removed")
          .map((row) => row.text)
          .join(""),
        after,
      );
    }
});
