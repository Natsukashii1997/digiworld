// 路线 v3 切片 2.3（协同看板 + 模板 #1 + 操作留痕 v1）与 2.4（一键派发 / 一键开工）。
// 阶段推断只按 CURRENT 的写入者与状态标题关键词；推断不了就是“未知”，不猜。
// 口令只由白名单字段生成；复制成功才写入主库的操作留痕（严格 schema、只增不改）。
import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, mkdir, writeFile, readFile, readdir, rm, lstat, symlink, utimes } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  STAGES,
  inferStage,
  penHolder,
  parseStateHeadings,
  latestHeading,
  readStateHeadings,
  readHandoffIndex,
  HEADINGS_READ_LIMIT,
} from "../server/collab-board.mjs";
import { validateState, validateHistory } from "../server/schema.mjs";
import { mergeBackup } from "../server/merge.mjs";
import {
  COLLAB_AGENTS,
  dispatchPrompt,
  startPrompt,
  redactSecrets,
  timelineOf,
  sha256Hex,
} from "../src/collab.js";
import { seed } from "../src/store.js";
import {
  BOARD_CURRENT,
  HANDOFF_FILES,
  collabBoardFixture,
} from "./collab-board-fixture.mjs";

const sha = (text) => createHash("sha256").update(text).digest("hex");

// ---------- 阶段推断 ----------

test("模板 #1 的五个阶段按真实流程排列", () => {
  assert.deepEqual(
    STAGES.map((s) => s.label),
    ["认领", "实现", "复核", "返修", "验收"],
  );
});

test("阶段推断：写入者里的关键词优先", () => {
  const r = inferStage({
    writer: "Codex（认领12：状态卡复核）",
    heading: "Claude 返修（P-1）",
    handoff: "Claude 返修 11",
  });
  assert.equal(r.id, "review");
  assert.equal(r.label, "复核");
  assert.equal(r.basis, "当前写入者");
  // 本项目真实写法：写入者只写了“认领”，就是认领阶段。
  assert.equal(
    inferStage({ writer: "**Claude（认领104：合入云端 D3 使用次数滚动）**" }).id,
    "claim",
  );
  assert.equal(inferStage({ writer: "Claude（实现切片 2.3）" }).id, "implement");
});

test("阶段推断：写入者为“无”或没有关键词时，看最新状态标题，再看最新交接", () => {
  const byHeading = inferStage({ writer: "无", heading: "Claude 2.3 返修认领（WB-20260929-73）" });
  assert.equal(byHeading.id, "rework");
  assert.equal(byHeading.basis, "最新状态标题");
  assert.equal(
    inferStage({ writer: "无", heading: "Codex 2.3 返修复核认领（WB-20260929-75）" }).id,
    "review",
  );
  assert.equal(
    inferStage({ writer: "用户", heading: "1.E 第一阶段整体验收（WB-20260929-66，用户 + Claude 记录）" }).id,
    "accept",
  );
  // “复核项修复”是返修，不是复核。
  assert.equal(inferStage({ writer: "无", heading: "1.3 复核项修复（WB-20260929-39，Claude）" }).id, "rework");
  const byHandoff = inferStage({ writer: "无", heading: "", handoff: "Codex 独立复核" });
  assert.equal(byHandoff.id, "review");
  assert.equal(byHandoff.basis, "最新交接");
  assert.equal(inferStage({ writer: "Claude", heading: "Claude review of slice" }).id, "review");
});

test("阶段推断：没有关键词、没有字段，都判为未知，不猜", () => {
  for (const input of [
    { writer: "Claude", heading: "UI v12（WB-20260929-56，Claude）", handoff: "Claude 更正" },
    { writer: "无" },
    {},
    { writer: undefined, heading: undefined, handoff: undefined },
  ]) {
    const r = inferStage(input);
    assert.equal(r.id, "unknown", JSON.stringify(input));
    assert.equal(r.label, "未知");
    assert.equal(r.basis, "");
  }
});

test("笔在谁手上：从当前写入者读出 Agent；“无”为空闲；缺字段为未知", () => {
  assert.deepEqual(penHolder("**Codex（认领12：状态卡复核）**"), {
    state: "held",
    agent: "Codex",
    text: "Codex（认领12：状态卡复核）",
  });
  assert.equal(penHolder("Claude（认领104：合入云端，随后 Codex 复核）").agent, "Claude");
  assert.equal(penHolder("hermes 夜巡").agent, "Hermes");
  assert.equal(penHolder("用户（验收）").agent, "用户");
  for (const idle of ["无", "无人", "—", "-", "none", "（无）"])
    assert.equal(penHolder(idle).state, "idle", idle);
  const other = penHolder("小王");
  assert.equal(other.state, "held");
  assert.equal(other.agent, "");
  assert.equal(other.text, "小王");
  assert.equal(penHolder(undefined).state, "unknown");
  assert.equal(penHolder("").state, "unknown");
});

test("状态链：只取标题里带 state_id 的节，按编号取最新；与表头编号一致者优先", () => {
  const list = parseStateHeadings(BOARD_CURRENT);
  assert.deepEqual(
    list.map((h) => h.stateId),
    ["P-20260929-11", "P-20260929-12", "P-20260930-13", "P-20260930-14"],
  );
  assert.deepEqual(list.map((h) => h.stage), ["claim", "implement", "review", "rework"]);
  assert.deepEqual(list.map((h) => h.agent), ["Claude", "Claude", "Codex", "Claude"]);
  assert.equal(list[2].date, "2026-09-30");
  assert.equal(list[3].title, "Claude 返修（P-20260930-14）");
  assert.equal(latestHeading(list, "P-20260930-14").stateId, "P-20260930-14");
  // 表头编号没有对应标题时，取编号最大的一节（不按文件顺序）。
  const shuffled = [list[3], list[0], list[2], list[1]];
  assert.equal(latestHeading(shuffled, "X-1").stateId, "P-20260930-14");
  assert.equal(latestHeading([], "P-1"), null);
  // 正文、表格与没有编号的标题都不算。
  assert.deepEqual(
    parseStateHeadings("# 标题\n| state_id | WB-20260930-1 |\n正文 WB-20260930-2\n## 当前事实\n### 深层 WB-20260930-3 认领\n"),
    [{ stateId: "WB-20260930-3", title: "深层 WB-20260930-3 认领", date: "2026-09-30", seq: 3, agent: "", stage: "claim" }],
  );
  // 超长标题截断。
  const long = parseStateHeadings(`## ${"长".repeat(900)}（WB-20260930-9）\n`);
  assert.ok(long[0].title.length <= 301);
});

test("readStateHeadings：读完整标题链（上限内），不因 64 KiB 截断丢失末尾新节；符号链接不读", async () => {
  const dir = await mkdtemp(join(tmpdir(), "guiji-heads-"));
  try {
    assert.equal((await readStateHeadings(dir, "CURRENT.md")).state, "absent");
    // 本项目的 CURRENT 超过 64 KiB，最新一节在末尾。
    await writeFile(
      join(dir, "CURRENT.md"),
      BOARD_CURRENT + "\n" + "填充正文。\n".repeat(12000) + "\n## Codex 复核（P-20260930-15）\n",
    );
    const r = await readStateHeadings(dir, "CURRENT.md");
    assert.equal(r.state, "read");
    assert.equal(r.truncated, false);
    assert.equal(r.headings.at(-1).stateId, "P-20260930-15");
    // 超过上限只读开头，并标明。
    await writeFile(join(dir, "BIG.md"), "## A（P-20260930-1）\n" + "x".repeat(HEADINGS_READ_LIMIT + 10));
    const big = await readStateHeadings(dir, "BIG.md");
    assert.equal(big.truncated, true);
    assert.equal(big.headings.length, 1);
    await symlink(join(dir, "CURRENT.md"), join(dir, "LINK.md"));
    assert.equal((await readStateHeadings(dir, "LINK.md")).state, "error");
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("readHandoffIndex：只列 docs/agents/handoffs 下的 .md 文件名与修改时间，不读正文，不跟随符号链接", async () => {
  const dir = await mkdtemp(join(tmpdir(), "guiji-handoffs-"));
  try {
    assert.equal((await readHandoffIndex(dir)).state, "absent");
    const handoffs = join(dir, "docs", "agents", "handoffs");
    await mkdir(handoffs, { recursive: true });
    for (const name of HANDOFF_FILES) await writeFile(join(handoffs, name), "BODY-MARKER\n");
    await utimes(join(handoffs, HANDOFF_FILES[0]), new Date("2026-09-29T01:00:00Z"), new Date("2026-09-29T01:00:00Z"));
    await writeFile(join(handoffs, "notes.txt"), "x");
    await writeFile(join(handoffs, ".hidden.md"), "x");
    await mkdir(join(handoffs, "cloud-x-logs.md"));
    await symlink(join(dir, "outside.md"), join(handoffs, "2026-09-30-link.md"));
    const r = await readHandoffIndex(dir);
    assert.equal(r.state, "ok");
    assert.deepEqual(
      r.files.map((f) => f.name).sort(),
      [...HANDOFF_FILES].sort(),
    );
    const first = r.files.find((f) => f.name === HANDOFF_FILES[0]);
    assert.equal(first.date, "2026-09-29");
    assert.equal(first.agent, "Claude");
    assert.equal(first.modifiedAt, "2026-09-29T01:00:00.000Z");
    assert.equal(r.files.find((f) => f.name.includes("codex")).agent, "Codex");
    assert.doesNotMatch(JSON.stringify(r), /BODY-MARKER/);
    // 交接目录本身是符号链接时不读。
    const other = await mkdtemp(join(tmpdir(), "guiji-handoffs-link-"));
    await mkdir(join(other, "docs", "agents"), { recursive: true });
    await symlink(handoffs, join(other, "docs", "agents", "handoffs"));
    assert.equal((await readHandoffIndex(other)).state, "error");
    await rm(other, { recursive: true, force: true });
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

// ---------- 口令生成 ----------

const boardItem = {
  projectId: "p1",
  name: "协同项目",
  root: "/Users/tester/work/协同项目",
  entryFiles: ["AGENTS.md", "CURRENT.md", "COLLABORATION.md"],
  current: {
    state: "ok",
    path: "CURRENT.md",
    fields: {
      stateId: "P-20260930-14",
      writer: "无",
      next: "Codex 读回 14，独立复核状态卡返修",
      handoff: { text: "Claude 返修 14", href: "docs/agents/handoffs/2026-09-30-claude-14.md" },
    },
    missing: [],
  },
  stage: { id: "rework", label: "返修", basis: "最新状态标题" },
  pen: { state: "idle", agent: "", text: "无" },
};

test("派发口令：字段齐全（项目路径、先读、输入状态、唯一下一步、验收标准、禁止事项、要回交的证据）", () => {
  const text = dispatchPrompt(boardItem, "codex");
  for (const part of [
    "下一棒：Codex",
    "项目：协同项目",
    "项目路径：/Users/tester/work/协同项目",
    "先读",
    "1. AGENTS.md",
    "2. CURRENT.md",
    "3. COLLABORATION.md",
    "docs/agents/handoffs/2026-09-30-claude-14.md",
    "输入状态",
    "state_id P-20260930-14",
    "当前写入者：无",
    "流程阶段：返修",
    "唯一下一步：Codex 读回 14，独立复核状态卡返修",
    "验收标准",
    "禁止事项",
    "要回交的证据",
    "模板 #1",
  ])
    assert.ok(text.includes(part), `缺少：${part}\n${text}`);
  // 返修之后，模板建议的下一阶段是复核。
  assert.match(text, /建议下一阶段：复核/);
  assert.match(dispatchPrompt(boardItem, "claude-code"), /下一棒：Claude Code/);
  assert.match(dispatchPrompt(boardItem, "hermes"), /下一棒：Hermes/);
  assert.throws(() => dispatchPrompt(boardItem, "cursor"), /Agent/);
});

test("派发口令：CURRENT 读不到时如实写未知，不编造状态", () => {
  const text = dispatchPrompt(
    {
      ...boardItem,
      entryFiles: ["CURRENT.md"],
      current: { state: "absent", path: "CURRENT.md" },
      stage: { id: "unknown", label: "未知", basis: "" },
      pen: { state: "unknown", agent: "", text: "" },
    },
    "codex",
  );
  assert.match(text, /输入状态：未知/);
  assert.match(text, /唯一下一步：未知/);
  assert.match(text, /流程阶段：未知/);
  assert.doesNotMatch(text, /P-20260930-14/);
  assert.doesNotMatch(text, /AGENTS\.md/);
});

test("开工口令：项目路径、先读 AGENTS.md 与 CURRENT.md、唯一下一步", () => {
  const text = startPrompt(boardItem, "claude-code");
  for (const part of [
    "开工：Claude Code",
    "项目路径：/Users/tester/work/协同项目",
    "AGENTS.md",
    "CURRENT.md",
    "唯一下一步：Codex 读回 14，独立复核状态卡返修",
  ])
    assert.ok(text.includes(part), `缺少：${part}\n${text}`);
  assert.match(startPrompt({ ...boardItem, current: { state: "unparsed", path: "CURRENT.md" } }, "codex"), /唯一下一步：未知/);
});

test("口令不含凭据、主库内容或私人会话：只用白名单字段，疑似凭据整段替换", () => {
  const leaky = {
    ...boardItem,
    // 以下字段不属于口令白名单，不能出现在口令里。
    state: { assets: [{ title: "主库资产正文 ASSET-SECRET" }] },
    session: "私人会话 SESSION-SECRET",
    token: "WORKBENCH-TOKEN-SECRET",
    current: {
      ...boardItem.current,
      fields: {
        ...boardItem.current.fields,
        next: "用 token: ghp_abcdefghijklmnopqrstuvwxyz0123 推送",
        writer: "Claude（api_key=sk-live-123456）",
        handoff: { text: "交接", href: "docs/x.md?password=hunter2" },
      },
    },
  };
  for (const text of [dispatchPrompt(leaky, "codex"), startPrompt(leaky, "codex")]) {
    for (const secret of [
      "ASSET-SECRET",
      "SESSION-SECRET",
      "WORKBENCH-TOKEN-SECRET",
      "ghp_abcdefghijklmnopqrstuvwxyz0123",
      "sk-live-123456",
      "hunter2",
    ])
      assert.ok(!text.includes(secret), `口令泄露 ${secret}`);
    assert.match(text, /疑似凭据，已省略/);
  }
  assert.equal(redactSecrets("普通文字 4/5"), "普通文字 4/5");
  assert.match(redactSecrets("-----BEGIN OPENSSH PRIVATE KEY-----"), /疑似凭据/);
  assert.match(redactSecrets("密码：abc123"), /疑似凭据/);
});

test("口令的项目路径必须是登记过的绝对路径", () => {
  for (const root of ["", "relative/path", "/a/\u0000b", undefined])
    assert.throws(() => dispatchPrompt({ ...boardItem, root }, "codex"), /项目路径/);
  assert.throws(() => startPrompt({ ...boardItem, root: "../up" }, "codex"), /项目路径/);
});

test("sha256Hex 与 Node 一致", async () => {
  assert.equal(await sha256Hex("口令"), sha("口令"));
});

test("COLLAB_AGENTS 只有三个主力 Agent", () => {
  assert.deepEqual(
    COLLAB_AGENTS.map((a) => a.id),
    ["codex", "claude-code", "hermes"],
  );
});

// ---------- 操作留痕时间线 ----------

test("时间线：状态链、交接文档与工作台派发记录合并，按日期倒序", () => {
  const events = timelineOf({
    states: parseStateHeadings(BOARD_CURRENT),
    handoffs: {
      state: "ok",
      files: [
        { name: "2026-09-29-claude-11.md", date: "2026-09-29", agent: "Claude", modifiedAt: "2026-09-29T02:00:00.000Z" },
        { name: "notes-without-date.md", date: "", agent: "", modifiedAt: "2026-09-28T02:00:00.000Z" },
      ],
    },
    records: [
      { id: "r1", kind: "dispatch", agent: "codex", stateId: "P-20260930-14", at: "2026-09-30T10:00:00.000Z" },
      { id: "r2", kind: "start", agent: "claude-code", at: "2026-09-30T11:00:00.000Z" },
    ],
  });
  assert.deepEqual(
    events.map((e) => [e.kind, e.date]),
    [
      ["start", "2026-09-30"],
      ["dispatch", "2026-09-30"],
      ["state", "2026-09-30"],
      ["state", "2026-09-30"],
      ["state", "2026-09-29"],
      ["state", "2026-09-29"],
      ["handoff", "2026-09-29"],
      ["handoff", "2026-09-28"],
    ],
  );
  assert.equal(events[0].title, "复制开工口令给 Claude Code");
  assert.equal(events[1].title, "复制派发口令给 Codex（输入状态 P-20260930-14）");
  assert.equal(events[2].title, "Claude 返修（P-20260930-14）");
  assert.equal(events[6].title, "2026-09-29-claude-11.md");
});

// ---------- 留痕 schema ----------

const record = (over = {}) => ({
  schema: 1,
  id: "collab-1",
  kind: "dispatch",
  projectId: "p1",
  projectName: "协同项目",
  agent: "codex",
  stateId: "P-20260930-14",
  stage: "rework",
  promptSha256: sha("口令"),
  at: "2026-09-30T10:00:00.000Z",
  ...over,
});

test("留痕 schema：旧库缺失按空；合法记录通过", () => {
  const state = seed();
  assert.equal(state.collabLog, undefined);
  validateState(state);
  validateState({ ...state, collabLog: [] });
  validateState({ ...state, collabLog: [record(), record({ id: "collab-2", kind: "start", stateId: undefined, stage: undefined })] });
});

test("留痕 schema：字段严格，多余字段、错误类型、重复 ID 都拒绝", () => {
  const state = seed();
  const bad = [
    record({ note: "多余字段" }),
    record({ prompt: "口令正文不入库" }),
    record({ schema: 2 }),
    record({ kind: "auto" }),
    record({ agent: "cursor" }),
    record({ promptSha256: "abc" }),
    record({ at: "昨天" }),
    record({ id: "有 空格" }),
    record({ projectId: "../x" }),
    record({ projectName: "a\u0000b" }),
    record({ projectName: "长".repeat(201) }),
    record({ stateId: "P 1" }),
    record({ stage: "done" }),
  ];
  for (const r of bad)
    assert.throws(() => validateState({ ...state, collabLog: [r] }), /数据校验失败/, JSON.stringify(r));
  assert.throws(() => validateState({ ...state, collabLog: {} }), /数据校验失败/);
  assert.throws(
    () => validateState({ ...state, collabLog: [record(), record()] }),
    /数据校验失败/,
  );
});

test("留痕只能经专用接口追加：普通保存不能新增、改写或删除", () => {
  const before = { ...seed(), revision: 3, collabLog: [record()] };
  assert.throws(
    () => validateHistory(before, { ...before, collabLog: [] }),
    /操作留痕/,
  );
  assert.throws(
    () => validateHistory(before, { ...before, collabLog: [record(), record({ id: "collab-2" })] }),
    /操作留痕/,
  );
  // 专用追加：只能在末尾加，旧记录不变。
  validateHistory(before, { ...before, collabLog: [record(), record({ id: "collab-2" })] }, { allowCollab: true });
  assert.throws(
    () => validateHistory(before, { ...before, collabLog: [record({ agent: "hermes" })] }, { allowCollab: true }),
    /操作留痕/,
  );
  // 旧库没有这个集合，保存时同样缺失，不算改动。
  const legacy = { ...seed(), revision: 1 };
  validateHistory(legacy, { ...legacy });
});

test("备份合并：留痕按 ID 并集；同 ID 内容不同则整次拒绝；从空库恢复保留留痕", () => {
  const current = validateState({ ...seed(), revision: 2, collabLog: [record()] });
  const backup = { ...seed(), collabLog: [record(), record({ id: "collab-2", agent: "hermes" })] };
  const { state, summary } = mergeBackup(current, backup);
  assert.deepEqual(state.collabLog.map((r) => r.id), ["collab-1", "collab-2"]);
  assert.equal(summary.collabAdded, 1);
  assert.throws(
    () => mergeBackup(current, { ...seed(), collabLog: [record({ agent: "hermes" })] }),
    /操作留痕/,
  );
  assert.deepEqual(mergeBackup(null, backup).state.collabLog.length, 2);
  // 旧备份没有这个集合：当前留痕保持不变。
  assert.deepEqual(mergeBackup(current, seed()).state.collabLog, current.collabLog);
});

// ---------- HTTP：看板与留痕 ----------

async function tree(dir) {
  const out = {};
  async function walk(d) {
    for (const e of await readdir(d, { withFileTypes: true })) {
      const p = join(d, e.name);
      const info = await lstat(p);
      if (e.isDirectory()) {
        out[p] = `dir ${info.mtimeMs}`;
        await walk(p);
      } else if (e.isSymbolicLink()) out[p] = `link ${info.mtimeMs}`;
      else out[p] = `${info.mtimeMs} ${sha(await readFile(p))}`;
    }
  }
  await walk(dir);
  return out;
}

test("看板接口：只列在推进项目；阶段、笔、状态链与交接文档来自项目文件；不读交接正文；只读", async () => {
  const app = await collabBoardFixture();
  try {
    const before = await tree(app.paths.projects);
    const empty = await app.call("/collab/board", {});
    assert.equal(empty.status, 200);
    assert.deepEqual(empty.body.items, []);
    await app.mark("协同项目");
    await app.mark("无协议项目");
    await app.mark("文档项目");
    const revision = (await app.workspace()).revision;
    const r = await app.call("/collab/board", {});
    assert.equal(r.status, 200, JSON.stringify(r.body));
    const byName = Object.fromEntries(r.body.items.map((i) => [i.name, i]));
    const collab = byName["协同项目"];
    assert.equal(collab.root, app.paths.collab);
    assert.deepEqual(collab.entryFiles, ["AGENTS.md", "CURRENT.md", "COLLABORATION.md"]);
    assert.equal(collab.current.state, "ok");
    assert.equal(collab.current.fields.stateId, "P-20260930-14");
    assert.deepEqual(collab.stage, { id: "rework", label: "返修", basis: "最新状态标题", keyword: "返修" });
    assert.equal(collab.pen.state, "idle");
    assert.equal(collab.latestHeading.stateId, "P-20260930-14");
    assert.equal(collab.states.length, 4);
    assert.deepEqual(
      collab.handoffs.files.map((f) => f.name).sort(),
      [...HANDOFF_FILES].sort(),
    );
    assert.deepEqual(collab.records, []);
    assert.doesNotMatch(JSON.stringify(r.body), /BODY-MARKER/);

    const bare = byName["无协议项目"];
    assert.equal(bare.current.state, "absent");
    assert.equal(bare.stage.id, "unknown");
    assert.equal(bare.pen.state, "unknown");
    assert.equal(bare.handoffs.state, "absent");
    assert.deepEqual(bare.entryFiles, []);
    assert.equal(byName["文档项目"].stage.id, "unknown");

    // 只读：主库版本不变，项目文件（含 .git）逐字节不变。
    assert.equal((await app.workspace()).revision, revision);
    assert.deepEqual(await tree(app.paths.projects), before);
    // 不接受任何路径参数。
    assert.equal((await app.call("/collab/board", { root: "/etc" })).status, 400);
  } finally {
    await app.close();
  }
});

test("留痕接口：复制成功后追加一条；同 ID 重放不重复；字段严格；项目必须已登记", async () => {
  const app = await collabBoardFixture();
  try {
    await app.mark("协同项目");
    const projectId = await app.projectId("协同项目");
    const input = {
      id: "collab-abc",
      kind: "dispatch",
      projectId,
      agent: "codex",
      stateId: "P-20260930-14",
      stage: "rework",
      promptSha256: sha("口令"),
    };
    const before = (await app.workspace()).revision;
    const r = await app.call("/collab/record", input);
    assert.equal(r.status, 200, JSON.stringify(r.body));
    assert.equal(r.body.state.revision, before + 1);
    const saved = r.body.record;
    assert.equal(saved.schema, 1);
    assert.equal(saved.projectName, "协同项目");
    assert.match(saved.at, /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/);
    // 重放同一请求：不新增、不改版本。
    const again = await app.call("/collab/record", input);
    assert.equal(again.status, 200);
    assert.equal(again.body.state.revision, before + 1);
    assert.equal((await app.workspace()).collabLog.length, 1);
    // 同 ID 不同内容：冲突。
    assert.equal((await app.call("/collab/record", { ...input, agent: "hermes" })).status, 409);
    // 字段严格：时间与 schema 由服务端生成；不收口令正文；未知 Agent、未登记项目拒绝。
    for (const bad of [
      { ...input, id: "x1", at: "2026-01-01T00:00:00.000Z" },
      { ...input, id: "x2", prompt: "口令正文" },
      { ...input, id: "x3", agent: "cursor" },
      { ...input, id: "x4", promptSha256: "0" },
      { ...input, id: "x5", kind: "auto" },
    ])
      assert.equal((await app.call("/collab/record", bad)).status, 400, JSON.stringify(bad));
    assert.equal((await app.call("/collab/record", { ...input, id: "x6", projectId: "missing" })).status, 404);
    // 开工记录可以不带状态编号（项目没有 CURRENT 时）。
    const start = await app.call("/collab/record", {
      id: "collab-start",
      kind: "start",
      projectId,
      agent: "claude-code",
      promptSha256: sha("开工"),
    });
    assert.equal(start.status, 200, JSON.stringify(start.body));
    // 看板读回本项目的留痕。
    const board = await app.call("/collab/board", {});
    assert.deepEqual(board.body.items[0].records.map((x) => x.id), ["collab-abc", "collab-start"]);
    // 普通保存不能删掉留痕。
    const ws = await app.workspace();
    const put = await app.call("/workspace", { state: { ...ws, collabLog: [] } }, "PUT");
    assert.equal(put.status, 400);
    assert.match(put.body.error, /操作留痕/);
  } finally {
    await app.close();
  }
});
