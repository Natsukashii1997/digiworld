// 支线 B2 逆向工程第一层：任务包生成、回复解析、候选入库（焚决条目 / Prompt）、逆向记录 schema、备份合并。
import test from "node:test";
import assert from "node:assert/strict";
import { validateState } from "../server/schema.mjs";
import { mergeBackup } from "../server/merge.mjs";
import { seed, current } from "../src/store.js";
import { createScroll } from "../src/scrolls.js";
import {
  MARKS,
  REVERSE_LIMITS,
  createRecord,
  buildPack,
  parseReply,
  saveReply,
  importCandidates,
  deleteRecord,
  restoreRecord,
  recordStatus,
  liveRecords,
} from "../src/reverse.js";

const AT = "2026-09-30T08:00:00.000Z";
const fence = (value) => "```json\n" + JSON.stringify(value, null, 2) + "\n```";
const goodReply = () => ({
  report: {
    summary: "开头用反常识的一句话抓住注意力",
    structure: [{ mark: "原文观察", text: "第一段只有一句话：“别再背单词了”。" }],
    techniques: [
      { mark: "推断", text: "作者先否定读者的习惯，再给替代方案，制造反差。" },
    ],
    reusable: [{ mark: "已验证", text: "“别再 X 了，试试 Y”，我用三个主题试写过都成立。" }],
  },
  candidates: [
    { type: "scroll", text: "别再 X 了，试试 Y", tags: ["开头", "反差"], mark: "已验证" },
    {
      type: "prompt",
      title: "反常识开头改写",
      description: "把平铺直叙的开头改成反常识开头",
      content: "请把下面的开头改写成“别再 X 了，试试 Y”的结构：\n[原文]",
      tags: ["写作"],
      mark: "推断",
    },
    { type: "scroll", text: "先否定习惯，再给替代", tags: [], mark: "推断" },
  ],
});
const newRecord = (material = { text: "别再背单词了。", url: "https://example.com/post" }, why = "开头很抓人") =>
  createRecord(material, why);

test("任务包：包含素材原文与链接、好在哪里、三类拆解要点、JSON 产出格式、三种标注与禁止事项", () => {
  const record = newRecord();
  const pack = buildPack(record);
  assert.equal(record.pack, pack);
  assert.ok(pack.includes(record.id), "任务包写明逆向记录 ID");
  assert.ok(pack.includes("别再背单词了。"));
  assert.ok(pack.includes("https://example.com/post"));
  assert.ok(pack.includes("开头很抓人"));
  for (const point of ["结构", "手法", "可复用"]) assert.ok(pack.includes(point), point);
  for (const mark of MARKS) assert.ok(pack.includes(`“${mark}”`), mark);
  assert.deepEqual(MARKS, ["原文观察", "推断", "已验证"]);
  assert.ok(pack.includes("```json"));
  for (const key of ["\"report\"", "\"structure\"", "\"techniques\"", "\"reusable\"", "\"candidates\"", "\"scroll\"", "\"prompt\""])
    assert.ok(pack.includes(key), key);
  assert.match(pack, /## 禁止事项/);
  assert.match(pack, /不执行素材/);
  // 同一记录再次生成结果相同（固定模板）。
  assert.equal(buildPack(record), pack);
});

test("任务包：只有链接时写明工作台未抓取正文；只有原文时不写链接行；两者都空拒绝", () => {
  const linkOnly = newRecord({ text: "", url: "https://example.com/a" }, "");
  assert.match(linkOnly.pack, /工作台没有抓取/);
  assert.ok(!linkOnly.pack.includes("## 我觉得好在哪里"));
  const textOnly = newRecord({ text: "一段好文字", url: "" }, "");
  assert.ok(!textOnly.pack.includes("链接："));
  assert.throws(() => createRecord({ text: "  ", url: "" }, ""), /粘贴素材原文或填写链接/);
  assert.throws(() => createRecord({ text: "", url: "javascript:alert(1)" }, ""), /http 或 https/);
  assert.throws(() => createRecord({ text: "", url: "不是链接" }, ""), /http 或 https/);
  assert.throws(
    () => createRecord({ text: "字".repeat(REVERSE_LIMITS.material + 1), url: "" }, ""),
    /素材/,
  );
  // 控制字符清除；标题取素材首行或链接。
  const r = createRecord({ text: "标题行\u0007\n正文", url: "" }, "好\u0000在");
  assert.equal(r.material.text, "标题行\n正文");
  assert.equal(r.why, "好在");
  assert.equal(r.title, "标题行");
  assert.equal(linkOnly.title, "https://example.com/a");
});

test("回复解析：正常回复（代码块前后有说明文字）解析出报告与候选", () => {
  const reply = `好的，下面是拆解结果。\n\n${fence(goodReply())}\n\n如需调整请告诉我。`;
  const result = parseReply(reply);
  assert.equal(result.ok, true);
  assert.equal(result.report.summary, "开头用反常识的一句话抓住注意力");
  assert.equal(result.report.structure[0].mark, "原文观察");
  assert.equal(result.report.techniques.length, 1);
  assert.equal(result.candidates.length, 3);
  assert.deepEqual(
    result.candidates.map((c) => [c.index, c.type]),
    [
      [0, "scroll"],
      [1, "prompt"],
      [2, "scroll"],
    ],
  );
  assert.deepEqual(result.candidates[0].tags, ["开头", "反差"]);
  assert.deepEqual(result.issues, []);
  // 纯 JSON（没有代码块）也接受。
  assert.equal(parseReply(JSON.stringify(goodReply())).ok, true);
});

test("回复解析：缺段、格式错误如实提示，不猜", () => {
  const cases = [
    ["", /回复为空/],
    ["我拆完了，结构很好。", /没有找到 JSON/],
    ["```json\n{\"report\": \n```", /JSON 格式错误/],
    [`${fence(goodReply())}\n${fence(goodReply())}`, /多个 JSON 代码块/],
    [fence([1, 2]), /最外层必须是对象/],
  ];
  for (const [reply, pattern] of cases) {
    const r = parseReply(reply);
    assert.equal(r.ok, false, String(reply).slice(0, 30));
    assert.match(r.error, pattern);
  }
  const missing = goodReply();
  delete missing.report.techniques;
  delete missing.candidates;
  const r = parseReply(fence(missing));
  assert.equal(r.ok, false);
  assert.match(r.error, /report\.techniques/);
  assert.match(r.error, /candidates/);
  const noReport = goodReply();
  delete noReport.report;
  assert.match(parseReply(fence(noReport)).error, /缺少.*report/);
  const badMark = goodReply();
  badMark.report.structure[0].mark = "观察";
  assert.match(parseReply(fence(badMark)).error, /report\.structure 第 1 条.*标注/);
  const emptyText = goodReply();
  emptyText.report.reusable[0].text = "  ";
  assert.match(parseReply(fence(emptyText)).error, /report\.reusable 第 1 条.*内容为空/);
});

test("回复解析：不支持的候选类型与缺字段的候选逐条列出并排除，其余候选保留", () => {
  const value = goodReply();
  value.candidates.push({ type: "skill", title: "x", content: "y", mark: "推断" });
  value.candidates.push({ type: "prompt", title: "", content: "y", mark: "推断" });
  value.candidates.push({ type: "scroll", text: "缺标注" });
  const r = parseReply(fence(value));
  assert.equal(r.ok, true);
  assert.equal(r.candidates.length, 3);
  assert.equal(r.issues.length, 3);
  assert.match(r.issues[0], /第 4 条候选.*类型 skill 不支持/);
  assert.match(r.issues[1], /第 5 条候选.*标题/);
  assert.match(r.issues[2], /第 6 条候选.*标注/);
});

test("回复解析：恶意 HTML / 脚本按原样文字保留，不做任何解释", () => {
  const evil = '<img src=x onerror="alert(1)"><script>alert(2)</script>';
  const value = goodReply();
  value.report.summary = evil;
  value.candidates[0].text = evil;
  value.candidates[1].content = `${evil}\n</code></pre><b>粗体</b>`;
  const r = parseReply(`<div onclick="x()">${fence(value)}</div>`);
  assert.equal(r.ok, true);
  assert.equal(r.report.summary, evil);
  assert.equal(r.candidates[0].text, evil);
  assert.equal(r.candidates[1].content, `${evil}\n</code></pre><b>粗体</b>`);
});

function stateWithRecord() {
  const base = seed();
  const { scrolls, scroll } = createScroll([], "写作心法");
  const record = newRecord();
  const state = { ...base, scrolls, reverseRecords: [record] };
  return { state, record, scroll };
}

test("入库：勾选的焚决条目写入所选卷（计次 0、保留来源链接与记录 ID），Prompt 生成第一个版本，未勾选不写", () => {
  let { state, record, scroll } = stateWithRecord();
  const reply = fence(goodReply());
  state = saveReply(state, record.id, reply);
  assert.equal(state.reverseRecords[0].reply, reply);
  const parsed = parseReply(reply);
  const { state: next, results } = importCandidates(state, record.id, {
    picks: [0, 1],
    scrollId: scroll.id,
    candidates: parsed.candidates,
  });
  assert.doesNotThrow(() => validateState(next));
  const entries = next.scrolls[0].entries;
  assert.equal(entries.length, 1, "第 3 条未勾选，不写");
  assert.equal(entries[0].text, "别再 X 了，试试 Y");
  assert.equal(entries[0].uses, 0);
  assert.deepEqual(entries[0].tags, ["开头", "反差"]);
  assert.deepEqual(entries[0].source, {
    reverseId: record.id,
    url: "https://example.com/post",
  });
  assert.equal(next.assets.length, state.assets.length + 1);
  const prompt = next.assets[0];
  assert.equal(prompt.type, "Prompt");
  assert.equal(prompt.versions.length, 1);
  assert.equal(current(prompt).title, "反常识开头改写");
  assert.equal(current(prompt).content, goodReply().candidates[1].content);
  assert.match(current(prompt).source, new RegExp(`逆向工程记录 ${record.id}`));
  assert.match(current(prompt).source, /https:\/\/example\.com\/post/);
  const saved = next.reverseRecords[0];
  assert.deepEqual(
    saved.imports.map((i) => [i.index, i.kind]),
    [
      [0, "scroll"],
      [1, "prompt"],
    ],
  );
  assert.equal(saved.imports[0].scrollId, scroll.id);
  assert.equal(saved.imports[0].entryId, entries[0].id);
  assert.equal(saved.imports[1].assetId, prompt.id);
  assert.equal(saved.imports[1].versionId, prompt.versions[0].id);
  assert.equal(results.length, 2);
  assert.equal(recordStatus(saved), "已入库 2 项");
  // 已入库的候选不能再次写入；入库后回复锁定。
  assert.throws(
    () =>
      importCandidates(next, record.id, {
        picks: [0],
        scrollId: scroll.id,
        candidates: parsed.candidates,
      }),
    /已入库/,
  );
  assert.throws(() => saveReply(next, record.id, "新的回复"), /已入库/);
  // 剩下的第 3 条之后仍可入库。
  const again = importCandidates(next, record.id, {
    picks: [2],
    scrollId: scroll.id,
    candidates: parsed.candidates,
  });
  assert.equal(again.state.scrolls[0].entries.length, 2);
  assert.equal(recordStatus(again.state.reverseRecords[0]), "已入库 3 项");
});

test("入库：没有勾选、卷不存在或已删除、只有链接素材时的来源", () => {
  let { state, record, scroll } = stateWithRecord();
  state = saveReply(state, record.id, fence(goodReply()));
  const { candidates } = parseReply(fence(goodReply()));
  assert.throws(
    () => importCandidates(state, record.id, { picks: [], scrollId: scroll.id, candidates }),
    /至少勾选/,
  );
  assert.throws(
    () => importCandidates(state, record.id, { picks: [0], scrollId: "", candidates }),
    /选择要写入的卷/,
  );
  const gone = { ...state, scrolls: state.scrolls.map((s) => ({ ...s, deletedAt: AT })) };
  assert.throws(
    () => importCandidates(gone, record.id, { picks: [0], scrollId: scroll.id, candidates }),
    /选择要写入的卷/,
  );
  // 只勾选 Prompt 时不需要卷。
  const onlyPrompt = importCandidates(state, record.id, { picks: [1], scrollId: "", candidates });
  assert.equal(onlyPrompt.state.scrolls[0].entries.length, 0);
  // 只有原文、没有链接时，焚决条目的来源只记记录 ID。
  const textOnly = createRecord({ text: "原文", url: "" }, "");
  const s2 = saveReply({ ...state, reverseRecords: [textOnly] }, textOnly.id, fence(goodReply()));
  const r2 = importCandidates(s2, textOnly.id, { picks: [0], scrollId: scroll.id, candidates });
  assert.deepEqual(r2.state.scrolls[0].entries[0].source, { reverseId: textOnly.id });
  assert.doesNotThrow(() => validateState(r2.state));
});

test("逆向记录：状态、删除进回收区与恢复", () => {
  let { state, record } = stateWithRecord();
  assert.equal(recordStatus(record), "待回收");
  state = saveReply(state, record.id, "随便一段回复");
  assert.equal(recordStatus(state.reverseRecords[0]), "待入库");
  const deleted = deleteRecord(state.reverseRecords, record.id);
  assert.ok(deleted[0].deletedAt);
  assert.equal(liveRecords(deleted).length, 0);
  const restored = restoreRecord(deleted, record.id);
  assert.equal("deletedAt" in restored[0], false);
  assert.equal(liveRecords(restored).length, 1);
  assert.doesNotThrow(() => validateState({ ...state, reverseRecords: deleted }));
});

const validRecord = (extra = {}) => ({
  id: "r1",
  title: "好帖子",
  createdAt: AT,
  material: { text: "原文", url: "https://example.com" },
  why: "",
  pack: "任务包",
  ...extra,
});
const withRecords = (records) => ({ ...seed(), reverseRecords: records });

test("schema：旧库缺少 reverseRecords 按空处理，不写迁移；合法记录通过", () => {
  const old = seed();
  assert.equal("reverseRecords" in old, false);
  assert.equal("reverseRecords" in validateState(old), false);
  assert.doesNotThrow(() =>
    validateState(
      withRecords([
        validRecord({
          reply: "回复",
          updatedAt: AT,
          imports: [
            { index: 0, kind: "scroll", scrollId: "s1", entryId: "e1", at: AT },
            { index: 1, kind: "prompt", assetId: "a1", versionId: "v1", at: AT },
          ],
        }),
        validRecord({ id: "r2", material: { text: "", url: "https://x.org" }, deletedAt: AT }),
      ]),
    ),
  );
});

test("schema：严格校验字段、类型与长度", () => {
  const cases = [
    [(s) => (s.reverseRecords = {}), /逆向记录/],
    [(s) => (s.reverseRecords[0].html = "<b>"), /不支持的字段/],
    [(s) => (s.reverseRecords[0].material.extra = 1), /不支持的字段/],
    [(s) => (s.reverseRecords[0].id = "../x"), /记录 ID/],
    [(s) => s.reverseRecords.push(validRecord()), /逆向记录 ID重复/],
    [(s) => (s.reverseRecords[0].title = ""), /逆向标题/],
    [(s) => (s.reverseRecords[0].title = "a\u0000"), /逆向标题/],
    [(s) => (s.reverseRecords[0].title = "长".repeat(REVERSE_LIMITS.title + 1)), /逆向标题/],
    [(s) => (s.reverseRecords[0].material = { text: "", url: "" }), /素材/],
    [(s) => (s.reverseRecords[0].material.url = "javascript:alert(1)"), /链接/],
    [(s) => (s.reverseRecords[0].material.text = "a\u0007"), /素材/],
    [(s) => (s.reverseRecords[0].material.text = "字".repeat(REVERSE_LIMITS.material + 1)), /素材/],
    [(s) => (s.reverseRecords[0].why = "字".repeat(REVERSE_LIMITS.why + 1)), /好在哪里/],
    [(s) => (s.reverseRecords[0].pack = ""), /任务包/],
    [(s) => (s.reverseRecords[0].reply = 3), /回复/],
    [(s) => (s.reverseRecords[0].reply = "字".repeat(REVERSE_LIMITS.reply + 1)), /回复/],
    [(s) => (s.reverseRecords[0].createdAt = "昨天"), /时间/],
    [(s) => (s.reverseRecords[0].imports = [{ index: 0, kind: "skill", at: AT }]), /入库类型/],
    [
      (s) =>
        (s.reverseRecords[0].imports = [
          { index: 0, kind: "scroll", scrollId: "s1", entryId: "e1", at: AT, extra: 1 },
        ]),
      /不支持的字段/,
    ],
    [
      (s) =>
        (s.reverseRecords[0].imports = [
          { index: -1, kind: "prompt", assetId: "a1", versionId: "v1", at: AT },
        ]),
      /候选序号/,
    ],
    [
      (s) =>
        (s.reverseRecords[0].imports = [
          { index: 0, kind: "prompt", assetId: "a1", versionId: "v1", at: AT },
          { index: 0, kind: "prompt", assetId: "a2", versionId: "v2", at: AT },
        ]),
      /候选序号重复/,
    ],
    [(s) => (s.reverseRecords[0].imports = [{ index: 0, kind: "scroll", scrollId: "s1", at: AT }]), /记录 ID|入库/],
    [
      (s) =>
        (s.reverseRecords = Array.from({ length: REVERSE_LIMITS.records + 1 }, (_, i) =>
          validRecord({ id: `r${i}` }),
        )),
      /逆向记录/,
    ],
  ];
  for (const [mutate, pattern] of cases) {
    const s = withRecords([validRecord()]);
    mutate(s);
    assert.throws(() => validateState(s), pattern);
  }
});

test("schema：焚决条目的逆向来源字段可选且严格", () => {
  const entry = (source) => ({
    ...seed(),
    scrolls: [
      {
        id: "s1",
        name: "卷",
        pinned: false,
        createdAt: AT,
        entries: [{ id: "e1", text: "x", tags: [], uses: 0, createdAt: AT, ...(source ? { source } : {}) }],
      },
    ],
  });
  assert.doesNotThrow(() => validateState(entry()));
  assert.doesNotThrow(() => validateState(entry({ reverseId: "r1" })));
  assert.doesNotThrow(() => validateState(entry({ reverseId: "r1", url: "https://a.b/c" })));
  assert.throws(() => validateState(entry({ reverseId: "../" })), /记录 ID/);
  assert.throws(() => validateState(entry({ reverseId: "r1", url: "file:///etc" })), /链接/);
  assert.throws(() => validateState(entry({ reverseId: "r1", html: "x" })), /不支持的字段/);
  assert.throws(() => validateState(entry({ url: "https://a.b" })), /记录 ID/);
});

test("备份：没有 reverseRecords 的旧备份可导入；新记录追加，同 ID 保留当前库", () => {
  const currentState = withRecords([validRecord({ reply: "当前回复" })]);
  currentState.revision = 3;
  const oldBackup = { format: "guiji-backup", schema: 1, state: seed() };
  const kept = mergeBackup(currentState, oldBackup);
  assert.equal(kept.summary.added.reverseRecords, 0);
  assert.deepEqual(kept.state.reverseRecords, currentState.reverseRecords);
  const fresh = mergeBackup(null, oldBackup);
  assert.equal(fresh.summary.added.reverseRecords, 0);
  assert.equal("reverseRecords" in fresh.state, false);
  const incoming = withRecords([
    validRecord({ reply: "备份里的旧回复" }),
    validRecord({ id: "r2", title: "备份独有" }),
  ]);
  const merged = mergeBackup(currentState, incoming);
  assert.equal(merged.summary.added.reverseRecords, 1);
  assert.equal(merged.state.reverseRecords.length, 2);
  assert.equal(merged.state.reverseRecords[0].reply, "当前回复");
  // 空库导入含记录的备份：计数一致。
  assert.equal(mergeBackup(null, incoming).summary.added.reverseRecords, 2);
});
