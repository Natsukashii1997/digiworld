// 路线 v3 切片 1.3 / 1.4：焚决（scrolls）顶层集合与随手记富文本字段的主库校验、备份导入与往返。
import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { openRepository } from "../server/repository.mjs";
import { validateState } from "../server/schema.mjs";
import { mergeBackup } from "../server/merge.mjs";
import { seed } from "../src/store.js";
import { addEntry, editEntry, entryName, scrollHit } from "../src/scrolls.js";

const AT = "2026-09-30T08:00:00.000Z";
const entry = (id, text, extra = {}) => ({
  id,
  text,
  tags: [],
  uses: 0,
  createdAt: AT,
  ...extra,
});
const scroll = (id, name, entries = [], extra = {}) => ({
  id,
  name,
  pinned: false,
  createdAt: AT,
  entries,
  ...extra,
});
const withScrolls = (scrolls) => ({ ...seed(), scrolls });
const rejects = (state, pattern) =>
  assert.throws(() => validateState(state), pattern);

async function withRepository(fn) {
  const dir = await mkdtemp(join(tmpdir(), "guiji-scrolls-"));
  let r;
  try {
    r = await openRepository(dir);
    await fn(r);
  } finally {
    await r?.close();
    await rm(dir, { recursive: true, force: true });
  }
}

test("焚决：旧库缺少 scrolls 按空处理，不写迁移", () => {
  const old = seed();
  assert.equal("scrolls" in old, false);
  assert.doesNotThrow(() => validateState(old));
  assert.equal("scrolls" in validateState(old), false);
});

test("焚决：合法的卷、有序条目、标签、计次、置顶与回收区字段通过校验", () => {
  const state = withScrolls([
    scroll(
      "s1",
      "心法",
      [
        entry("e1", "先定义问题，再给答案", {
          tags: ["判断", "核心"],
          uses: 3,
          lastUsedAt: AT,
          updatedAt: AT,
        }),
        entry("e2", "已删的条目", { deletedAt: AT }),
      ],
      { pinned: true, updatedAt: AT },
    ),
    scroll("s2", "回收的卷", [], { deletedAt: AT }),
  ]);
  assert.doesNotThrow(() => validateState(state));
});

test("焚决：严格校验字段、类型与长度上限", () => {
  const base = () =>
    withScrolls([scroll("s1", "心法", [entry("e1", "正文", { tags: ["a"] })])]);
  const cases = [
    [(s) => (s.scrolls = {}), /焚决/],
    [(s) => (s.scrolls[0].extra = 1), /不支持的字段/],
    [(s) => (s.scrolls[0].entries[0].html = "<b>x</b>"), /不支持的字段/],
    [(s) => (s.scrolls[0].entries[0].name = ""), /焚决名称/],
    [(s) => (s.scrolls[0].entries[0].name = "   "), /焚决名称/],
    [(s) => (s.scrolls[0].entries[0].name = "名".repeat(61)), /焚决名称/],
    [(s) => (s.scrolls[0].entries[0].name = "a\nb"), /焚决名称/],
    [(s) => (s.scrolls[0].entries[0].name = "a\tb"), /焚决名称/],
    [(s) => (s.scrolls[0].entries[0].name = 1), /焚决名称/],
    [(s) => (s.scrolls[0].name = ""), /卷名/],
    [(s) => (s.scrolls[0].name = "   "), /卷名/],
    [(s) => (s.scrolls[0].name = "名".repeat(61)), /卷名/],
    [(s) => (s.scrolls[0].name = "a\u0000b"), /卷名/],
    [(s) => (s.scrolls[0].pinned = "true"), /置顶/],
    [(s) => delete s.scrolls[0].pinned, /置顶/],
    [(s) => (s.scrolls[0].createdAt = "昨天"), /时间/],
    [(s) => (s.scrolls[0].deletedAt = "not-a-date"), /时间/],
    [(s) => (s.scrolls[0].entries = "x"), /条目/],
    [(s) => (s.scrolls[0].entries[0].text = ""), /条目正文/],
    [(s) => (s.scrolls[0].entries[0].text = "字".repeat(20001)), /条目正文/],
    [(s) => (s.scrolls[0].entries[0].uses = -1), /计次/],
    [(s) => (s.scrolls[0].entries[0].uses = 1.5), /计次/],
    [(s) => (s.scrolls[0].entries[0].uses = "2"), /计次/],
    [(s) => (s.scrolls[0].entries[0].tags = "a"), /标签/],
    [(s) => (s.scrolls[0].entries[0].tags = [""]), /标签/],
    [(s) => (s.scrolls[0].entries[0].tags = ["有 空格"]), /标签/],
    [(s) => (s.scrolls[0].entries[0].tags = ["a", "a"]), /标签重复/],
    [(s) => (s.scrolls[0].entries[0].tags = ["长".repeat(25)]), /标签/],
    [
      (s) =>
        (s.scrolls[0].entries[0].tags = Array.from({ length: 13 }, (_, i) => `t${i}`)),
      /标签/,
    ],
    [(s) => (s.scrolls[0].entries[0].id = "../x"), /记录 ID/],
    [(s) => s.scrolls.push(scroll("s1", "重复")), /卷 ID重复/],
    [
      (s) => s.scrolls.push(scroll("s2", "另一卷", [entry("e1", "同 ID")])),
      /条目 ID重复/,
    ],
    [
      (s) =>
        (s.scrolls = Array.from({ length: 201 }, (_, i) => scroll(`s${i}`, `卷${i}`))),
      /焚决/,
    ],
    [
      (s) =>
        (s.scrolls[0].entries = Array.from({ length: 2001 }, (_, i) =>
          entry(`e${i}`, "x"),
        )),
      /条目/,
    ],
  ];
  for (const [mutate, pattern] of cases) {
    const s = base();
    mutate(s);
    rejects(s, pattern);
  }
});

test("随手记：富文本格式与“已炼”标记可选；旧随手记不变；拒绝任意字段与控制字符", () => {
  const s = seed();
  s.notes = [
    { id: "legacy", text: "旧的纯文本", at: AT },
    {
      id: "rich",
      text: "- 无序\n1. 有序\n- [x] 任务\n[红字]{red}",
      at: AT,
      format: "md1",
      refined: { scrollId: "s1", entryId: "e1", at: AT },
    },
  ];
  assert.doesNotThrow(() => validateState(s));
  const cases = [
    [(n) => (n.format = "html"), /随手记格式/],
    [(n) => (n.html = "<b>x</b>"), /不支持的字段/],
    [(n) => (n.text = "a\u0007b"), /随手记/],
    [(n) => (n.text = "字".repeat(20001)), /随手记/],
    [(n) => (n.refined = { scrollId: "s1" }), /不支持的字段|记录 ID|时间/],
    [(n) => (n.refined = { scrollId: "s1", entryId: "e1", at: AT, x: 1 }), /不支持的字段/],
    [(n) => (n.refined = { scrollId: "../", entryId: "e1", at: AT }), /记录 ID/],
  ];
  for (const [mutate, pattern] of cases) {
    const copy = structuredClone(s);
    mutate(copy.notes[1]);
    rejects(copy, pattern);
  }
});

test("备份：没有 scrolls 的旧备份可导入，已有的卷保持不变", () => {
  const current = withScrolls([scroll("s1", "心法", [entry("e1", "条目")])]);
  current.revision = 4;
  const oldBackup = { format: "guiji-backup", schema: 1, state: seed() };
  assert.equal("scrolls" in oldBackup.state, false);
  const { state, summary } = mergeBackup(current, oldBackup);
  assert.equal(summary.added.scrolls, 0);
  assert.deepEqual(state.scrolls, current.scrolls);
  // 空库导入旧备份：不凭空生成 scrolls。
  const fresh = mergeBackup(null, oldBackup);
  assert.equal(fresh.summary.added.scrolls, 0);
  assert.doesNotThrow(() => validateState(fresh.state));
});

test("备份：新增卷与已有卷的新条目被合并，计次取较大值，当前库的编辑保留", () => {
  const current = withScrolls([
    scroll("s1", "心法（当前改名）", [
      entry("e1", "当前编辑过的正文", { uses: 2 }),
    ]),
  ]);
  const incoming = withScrolls([
    scroll("s1", "心法", [
      entry("e1", "备份中的旧正文", { uses: 5 }),
      entry("e2", "备份独有条目", { tags: ["新"] }),
    ]),
    scroll("s2", "备份独有卷", [entry("e3", "x")]),
  ]);
  const { state, summary } = mergeBackup(current, incoming);
  assert.equal(summary.added.scrolls, 1);
  assert.equal(summary.scrollEntriesAdded, 1);
  const s1 = state.scrolls.find((s) => s.id === "s1");
  assert.equal(s1.name, "心法（当前改名）");
  assert.deepEqual(
    s1.entries.map((e) => [e.id, e.text, e.uses]),
    [
      ["e1", "当前编辑过的正文", 5],
      ["e2", "备份独有条目", 0],
    ],
  );
  assert.ok(state.scrolls.some((s) => s.id === "s2"));
  // 同一条目 ID 出现在另一卷里视为冲突，整体不导入。
  const clash = withScrolls([scroll("s9", "别处", [entry("e1", "冲突")])]);
  assert.throws(() => mergeBackup(current, clash), /焚决条目存在冲突/);
});

test("备份：含焚决与富文本随手记的新备份经 HTTP 同款导出结构往返一致", () =>
  withRepository(async (r) => {
    const initial = withScrolls([
      scroll(
        "s1",
        "心法",
        [
          entry("e1", "先定义问题", { tags: ["判断"], uses: 3, lastUsedAt: AT }),
          entry("e2", "回收中", { deletedAt: AT }),
        ],
        { pinned: true },
      ),
    ]);
    initial.notes = [
      {
        id: "n1",
        text: "- [x] 任务\n[绿字]{green}",
        at: AT,
        format: "md1",
        refined: { scrollId: "s1", entryId: "e1", at: AT },
      },
    ];
    const saved = await r.write(initial, { initialize: true });
    const backup = {
      format: "guiji-backup",
      schema: 1,
      exportedAt: AT,
      state: await r.read(),
    };
    // 导入到另一个空库，得到相同的焚决与随手记。
    await withRepository(async (other) => {
      const preview = await other.previewImport(backup);
      assert.equal(preview.summary.added.scrolls, 1);
      const merged = await other.importBackup(backup, preview.token);
      assert.deepEqual(merged.scrolls, saved.scrolls);
      assert.deepEqual(merged.notes, saved.notes);
    });
    // 导回自身：没有新增，也不改变任何字段。
    const preview = await r.previewImport(backup);
    assert.equal(preview.summary.added.scrolls, 0);
    assert.equal(preview.summary.scrollEntriesAdded, 0);
    const again = await r.importBackup(backup, preview.token);
    assert.deepEqual(again.scrolls, saved.scrolls);
  }));


test("焚决：独立名称与全文保存往返，旧条目不迁移，编辑保留历史标签与来源", async () => {
  const original = entry("e1", "\n旧正文首行\n完整正文  ", {tags:["历史"],uses:3,source:{reverseId:"r1"}});
  const initial = [scroll("s1", "心法", [original])];
  assert.equal(entryName(original), "旧正文首行");
  assert.equal("name" in original, false);
  const made = addEntry(initial, "s1", "  全文与名称不同\n末尾换行\n", [], undefined, "  专用名称  ");
  assert.equal(made.entry.name, "专用名称");
  assert.equal(made.entry.text, "  全文与名称不同\n末尾换行\n");
  assert.equal(scrollHit(made.scrolls[0], ["专用名称"]), true);
  assert.equal(scrollHit(made.scrolls[0], ["历史"]), false);
  const changed = editEntry(made.scrolls, "s1", "e1", "更新正文\n", original.tags, "旧条目补名");
  assert.equal(changed[0].entries[0].name, "旧条目补名");
  assert.equal(changed[0].entries[0].text, "更新正文\n");
  assert.deepEqual(changed[0].entries[0].tags, ["历史"]);
  assert.deepEqual(changed[0].entries[0].source, {reverseId:"r1"});
  assert.equal(changed[0].entries[0].uses, 3);
  assert.equal(initial[0].entries[0], original);
  const legacyImport = addEntry([], "missing", "原逆向正文", ["旧标签"], {reverseId:"r2"}).entry;
  assert.equal("name" in legacyImport, false);
  assert.deepEqual(legacyImport.tags, ["旧标签"]);
  assert.deepEqual(legacyImport.source, {reverseId:"r2"});
  await withRepository(async r => {
    const state = withScrolls(changed);
    // source 的逆向记录校验由专门来源测试覆盖；此往返只验证本轮可选名称。
    delete state.scrolls[0].entries[0].source;
    await r.write(state, {initialize:true});
    const saved = await r.read();
    assert.deepEqual(saved.scrolls, changed);
    const backup = mergeBackup(seed(), saved).state;
    assert.equal(backup.scrolls[0].entries[1].name, "专用名称");
    assert.equal(backup.scrolls[0].entries[1].text, made.entry.text);
  });
});
