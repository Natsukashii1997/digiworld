// 阶段 2 主线串联 E 批：没有协作状态表的 CURRENT 取最上面一节作“最近进展”，可继续；口令写最近进展与手填下一步。全部合成数据。
import test from "node:test";
import assert from "node:assert/strict";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { projectStatusFixture } from "./project-status-fixture.mjs";
import { parseCurrentOutline, parseCurrentStatus, withOutline } from "../server/project-status.mjs";
import { startPrompt } from "../src/collab.js";
import { continuableCurrent, projectRelayPrompt, readableCurrent } from "../src/projects-v16.js";
import { projectLaunchSignature } from "../src/project-freshness.js";

// 牛马之家格式：一级标题 + 说明，新节写在最上面；标题很长，节里先有表格再有正文。
const LONG = "规矩改成工具：样式检查、发布回读脚本、LESSONS.md（2026-10-23，Claude，用户同意 3 批计划与 3 项推荐做法；三批均经用户确认后提交：`7c85fbf` / `b5c212d`，第 3 批见本节所在提交，另附很长的补充说明以超过标题上限）";
const NIUMA = `# 当前状态

更新：2026-10-23。工作区 main；进入顺序见 [HANDOFF.md](HANDOFF.md)。

\`\`\`
## 代码块里的标题不算
\`\`\`

## ${LONG}

| 批 | 提交 |
|---|---|
| 唯一下一步 | 不该被当成状态表字段之外的正文 |

来由：用户收集的开发分享《长出来的 **Skill**》。本轮只做 [其中两件](docs/x.md)：
规矩写成检查，踩过的坑回写仓库。

- 第 1 批 \`7c85fbf\`

## 带教「培养路径」横向拉长（2026-10-23）

旧节正文。
`;

test("最近进展：取第一个二级标题与它下面第一段正文；跳过代码块、表格，去掉链接与强调，超长截断", () => {
  const outline = parseCurrentOutline(NIUMA);
  assert.ok(outline.title.startsWith("规矩改成工具：样式检查"));
  assert.ok(outline.title.endsWith("…"));
  assert.equal(outline.title.length, 121);
  assert.ok(!outline.title.includes("`"));
  assert.equal(outline.summary, "来由：用户收集的开发分享《长出来的 Skill》。本轮只做 其中两件： 规矩写成检查，踩过的坑回写仓库。");
  const long = parseCurrentOutline(`## 节\n\n${"很长的首段。".repeat(80)}`);
  assert.equal(long.summary.length, 301);
  assert.equal(parseCurrentOutline("## 只有标题").summary, "");
  assert.equal(parseCurrentOutline("- 列表首段\n## 标题\n- 第一条\n- 第二条\n\n第二段").summary, "第一条 第二条");
});

test("只在状态表解析不出时才用最近进展；没有二级标题仍是无法解析", () => {
  const withTable = "## 协作状态\n\n| 字段 | 当前值 |\n|---|---|\n| state_id | P-1 |\n| 唯一下一步 | 合入 |\n";
  assert.equal(withOutline(parseCurrentStatus(withTable), withTable).state, "partial");
  // 表格里有“唯一下一步”行时按状态表读（partial），不改成 outline。
  assert.equal(withOutline(parseCurrentStatus(NIUMA), NIUMA).state, "partial");
  const noTable = NIUMA.replace("| 唯一下一步 | 不该被当成状态表字段之外的正文 |", "| 1 | 7c85fbf |");
  const parsed = withOutline(parseCurrentStatus(noTable), noTable);
  assert.equal(parsed.state, "outline");
  assert.deepEqual(parsed.fields, {});
  for (const text of ["# 当前状态\n目标：上线\n下一步：检查\n", "", "### 三级标题\n正文", "```\n## 代码块\n```"])
    assert.equal(withOutline(parseCurrentStatus(text), text).state, "unparsed", text);
});

const item = (current) => ({ projectId: "p1", name: "牛马之家", root: "/synthetic/work-desk", current });
const outlineItem = item({ state: "outline", path: "CURRENT.md", fields: {}, missing: [], outline: { title: "知识库加宽", summary: "来由：书架太短。" } });

test("口令：最近进展模式写最上面一节与手填下一步，不写唯一下一步与写入者规则", () => {
  const text = startPrompt(outlineItem, "codex", { next: "先把书架筛选做完" });
  assert.match(text, /2\. CURRENT\.md（当前状态；没有协作状态表，先读最上面一节）/);
  assert.match(text, /最近进展（CURRENT\.md 最上面一节）：知识库加宽\n来由：书架太短。\n下一步（用户在工作台手填）：先把书架筛选做完/);
  assert.match(text, /开工规则：按项目自己的 AGENTS\.md 约定认领与交接/);
  assert.doesNotMatch(text, /唯一下一步|当前写入者不是/);
  assert.match(startPrompt(outlineItem, "codex"), /下一步：未填写（读完最近进展后先向用户确认）/);
  // 有状态表的项目照旧，手填下一步不进口令。
  const table = item({ state: "ok", path: "CURRENT.md", fields: { stateId: "P-1", writer: "无", next: "合入" } });
  const prompt = projectRelayPrompt(table, "codex", { inbox: [], loadout: [], next: { text: "手填的不该出现", at: "2026-10-23T00:00:00.000Z" } }).prompt;
  assert.match(prompt, /唯一下一步：合入/);
  assert.doesNotMatch(prompt, /手填的不该出现|最近进展/);
  assert.match(projectRelayPrompt(outlineItem, "claude", { inbox: [], loadout: [], next: { text: "先把书架筛选做完", at: "2026-10-23T00:00:00.000Z" } }).prompt, /下一步（用户在工作台手填）：先把书架筛选做完/);
});

test("最近进展可继续但不算可读：不推断写入者、阶段、停滞；内容变化让发车条过期", () => {
  assert.equal(continuableCurrent(outlineItem), true);
  assert.equal(readableCurrent(outlineItem), false);
  assert.equal(continuableCurrent(item({ state: "unparsed", path: "CURRENT.md" })), false);
  const changed = { ...outlineItem, current: { ...outlineItem.current, outline: { title: "换了一节", summary: "" } } };
  assert.notEqual(projectLaunchSignature(outlineItem), projectLaunchSignature(changed));
});

test("HTTP：没有状态表的合成项目，状态卡与协作板都给出最近进展，阶段与持笔者未知；手填下一步防覆盖", async () => {
  const app = await projectStatusFixture();
  try {
    const noTable = NIUMA.replace("| 唯一下一步 | 不该被当成状态表字段之外的正文 |", "| 1 | 7c85fbf |");
    await writeFile(join(app.paths.bare, "CURRENT.md"), noTable);
    const ws = await app.workspace();
    const id = await app.projectId("无协议项目");
    assert.equal((await app.call("/project-status/mark", { projectId: id, active: true, revision: ws.revision })).status, 200);
    const status = await app.call("/project-status/inspect", {});
    assert.equal(status.status, 200, JSON.stringify(status.body));
    const card = status.body.items.find((i) => i.projectId === id);
    assert.equal(card.current.state, "outline");
    assert.ok(card.current.outline.title.startsWith("规矩改成工具"));
    assert.match(card.current.outline.summary, /^来由：/);
    assert.equal(card.stage.id, "unknown");
    const board = await app.call("/collab/board", {});
    assert.equal(board.status, 200, JSON.stringify(board.body));
    const entry = board.body.items.find((i) => i.projectId === id);
    assert.equal(entry.current.state, "outline");
    assert.equal(entry.current.outline.title, card.current.outline.title);
    assert.equal(entry.pen.state, "unknown");
    // 手填下一步：base 不符拒绝覆盖，回读一致。
    assert.equal((await app.call("/project-desk/next", { projectId: id, text: "先把书架筛选做完", base: "" })).status, 200);
    assert.equal((await app.call("/project-desk/next", { projectId: id, text: "别处的旧稿", base: "" })).status, 409);
    const desk = (await app.workspace()).projectDesk.find((e) => e.projectId === id);
    assert.equal(desk.next.text, "先把书架筛选做完");
  } finally {
    await app.close();
  }
});
