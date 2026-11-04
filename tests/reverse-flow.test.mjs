// 逆向 v5 第 2 批（#49）：开场与各阶段话术、拆解回执与复刻对照的解析、阶段推导、新字段校验。只用合成记录，不读 data/。
import test from "node:test";
import assert from "node:assert/strict";
import { createSpecimen } from "../src/reverse-recipe.js";
import { appendHatchRound, editSlot, initialHatch } from "../src/reverse-hatch.js";
import { buildStartPack, buildAskPack, buildReplicaPack, buildSkillPack, parseReport, parseReplica, adoptReplica, stageOf, STAGES } from "../src/reverse-flow.js";
import { validateReverseRecords } from "../server/schema.mjs";

const HASH = "a".repeat(64);
const AT = "2026-10-31T08:00:00.000Z";
const specimen = () => {
  const r = createSpecimen({ type: "FN", title: "接力", target: { kind: "web", url: "https://app.example.test/agents", feature: "Agent 接力怎么交接上下文", clues: ["handoff"], authorized: true } });
  r.id = "rec_demo";
  r.why = "交接时不丢进度";
  return r;
};
const sent = (r, kind = "start", n = 1) => { for (let i = 0; i < n; i++) r.hatch = appendHatchRound(r, { by: "claude", packHash: HASH, kind, at: AT }); return r; };
const back = (r) => { const rounds = r.hatch.rounds; rounds[rounds.length - 1] = { ...rounds.at(-1), status: "back", backAt: AT, cells: "eeeeeeee" }; return r; };

const START = `# 逆向任务：Agent 接力怎么交接上下文
参照物：https://app.example.test/agents
想弄懂：Agent 接力怎么交接上下文
好在哪里（我为什么想拆它）：交接时不丢进度
任务编号：rec_demo　轮次：1（交回时调用 reverse_report，taskId 填任务编号，round 填轮次）

请按下面六步做，⏸ 处必须停下来等我回复，不要跳步。

0. 先确认参照物能打开、是我说的那个功能。打不开或对不上就停下告诉我原因。
1. 拆前计划：列出要拆的能力（3–7 项），每项一句话写清要弄懂什么。⏸ 把清单发给我，我回「开始」再取证。
2. 取证：用你本机已注册的 rea MCP 只读取证。每条结论标证据编号（E1、E2…），写清证据在哪（文件 / 函数 / 请求 / 截图）。
3. 交回执：按下面「回执格式」写。写完调用工作台 MCP 工具 reverse_report 交回（kind 填 report，text 填整份回执）；调不了就把整份回执贴出来。⏸ 等我回复。
4. 复刻验证（我说「复刻」才做）：在 ~/Sandbox/2026-10-31-接力/ 里照回执做一个最小版，逐项和原版对照：一致 / 有差异（差在哪）/ 未验证（为什么）。⏸ 按「复刻对照格式」交对照表，同样调 reverse_report（kind 填 replica）。
5. 写 Skill（我说「写 Skill」才做）：按 SKILL.md 格式写，包含用途、做法、关键证据、局限。只交回工作台（reverse_report，kind 填 skill），不要装进任何 Agent 配置。⏸

边界：
- 只读分析：不修改目标、不登录、不提交表单、不读我的私人数据和凭据。
- 没把握的写进「缺」，不要猜；推断要标「推断」。
- 复刻只在 Sandbox 目录里做，不改任何项目文件。

## 回执格式（照写，工作台按小标题拆）
小标题都要写，顺序不限；没有的写「无」。证据编号 E1、E2… 在能力清单和八格里引用，在「证据」里写清位置。

## 回执 · 接力 · 第 1 轮 · 任务编号 rec_demo
一句话结论：…
## 能力清单
- {能力}：已知 … ｜证据 E1, E2 ｜缺 …
## 八格
## 用途
已知：…
缺：…

## 结构
已知：…
缺：…

## 数据
已知：…
缺：…

## 流程
已知：…
缺：…

## 界面
已知：…
缺：…

## 边界
已知：…
缺：…

## 写入与回滚
已知：…
缺：…

## 验收
已知：…
缺：…

## 证据
- E1：{位置：文件 / 函数 / 请求 / 截图} · {说明}
## 下一轮建议问
1. …

## 复刻对照格式（照写）
## 复刻对照 · 接力 · 第 1 轮 · 任务编号 rec_demo
复刻位置：~/Sandbox/…
- {能力}：一致
- {能力}：有差异 ｜ 差在哪
- {能力}：未验证 ｜ 为什么
`;

const REPORT = `## 回执 · 接力 · 第 1 轮 · 任务编号 rec_demo
一句话结论：交接靠一份结构化摘要，接手方先读摘要再拉原文。
## 能力清单
- 生成交接摘要：已知 关掉会话时自动生成 ｜证据 E1, E3 ｜缺 摘要长度上限
- 接手方读取：已知 先读摘要 ｜证据 E2 ｜缺 无
- 断点续传：缺 中断后怎么恢复
## 八格
## 用途
已知：把一个 Agent 的进度交给下一个
缺：无
## 结构
已知：摘要 + 原文链接
缺：摘要分几节？
## 证据
- E1：app.js:handoff() · 关会话时调用
- E2：GET /api/handoff/:id · 接手方先请求这个
- E3：截图 3 · 摘要面板
## 下一轮建议问
1. 摘要长度上限是多少？
2. 中断后怎么恢复？`;

test("开场话术快照：六步、⏸ 停顿点、任务编号与轮次、回执格式与复刻对照格式", () => {
  const r = specimen();
  const pack = buildStartPack(r, { at: AT });
  assert.equal(pack, START);
  assert.equal(pack.match(/⏸/g).length, 5, "开头说明一处，步骤 1、3、4、5 各一处");
  for (const step of ["0.", "1.", "2.", "3.", "4.", "5."]) assert.match(pack, new RegExp(`^${step.replace(".", "\\.")} `, "m"));
});

test("开场话术：没写好在哪里就不出这一行；素材型参照物不提 rea，附素材原文；凭据隐去", () => {
  const r = specimen();
  r.why = "";
  assert.doesNotMatch(buildStartPack(r, { at: AT }), /好在哪里/);
  const m = createSpecimen({ type: "FN", title: "截图", target: { kind: "web", url: "https://app.example.test/x", feature: "看截图", clues: [], authorized: true } });
  delete m.material.target;
  m.type = undefined;
  m.material = { text: "一段素材\napi_key: sk-test-123456", url: "" };
  m.title = "截图";
  const pack = buildStartPack(m, { at: AT });
  assert.doesNotMatch(pack, /rea MCP/);
  assert.match(pack, /## 素材\n一段素材/);
  assert.doesNotMatch(pack, /sk-test-123456/);
  assert.match(pack, /\[已隐去\]/);
});

test("轮次号随已有轮次往下数：两轮之后追问包是第 3 轮", () => {
  const r = back(sent(specimen(), "start", 2));
  const pack = buildAskPack(r, { asked: ["shape"] });
  assert.match(pack, /^# 逆向追问 · 第 3 轮：接力$/m);
  assert.match(pack, /任务编号：rec_demo　轮次：3/);
  assert.match(pack, /## 回执 · 接力 · 第 3 轮 · 任务编号 rec_demo/);
});

test("追问包：上一轮结论、已经知道、只问勾上的格子；没勾就完整取证", () => {
  const r = back(sent(specimen()));
  r.hatch = editSlot(r, "shape", { known: "摘要 + 原文链接", miss: "摘要分几节？" }, AT);
  r.hatch.report = { round: 1, verdict: "交接靠结构化摘要。", caps: [], evidence: [], nextAsk: [] };
  const pack = buildAskPack(r, { asked: ["shape", "flow"] });
  assert.match(pack, /## 上一轮结论\n交接靠结构化摘要。/);
  assert.match(pack, /- 结构：摘要 \+ 原文链接/);
  assert.match(pack, /## 这一轮只回答这些格子\n1\. 结构：摘要分几节？\n2\. 流程：这一格还空着，请说明。/);
  assert.match(pack, /⏸ 等我回复/);
  assert.match(buildAskPack(r), /先做一次完整取证，八格都要回答。/);
});

test("复刻话术：列出最近回执的能力清单、Sandbox 位置、kind=replica；写 Skill 话术带结论、证据号、复刻对照，没复刻时注明局限", () => {
  const r = back(sent(specimen()));
  r.hatch.report = { round: 1, verdict: "交接靠结构化摘要。", caps: [{ name: "生成交接摘要", known: "关会话时生成", miss: "", ev: ["E1", "E3"] }], evidence: [], nextAsk: [] };
  const replica = buildReplicaPack(r, { at: AT });
  assert.match(replica, /## 要对照的能力（第 1 轮回执）\n- 生成交接摘要：关会话时生成/);
  assert.match(replica, /~\/Sandbox\/2026-10-31-接力\//);
  assert.match(replica, /kind 填 replica/);
  assert.match(replica, /## 复刻对照 · 接力 · 第 2 轮 · 任务编号 rec_demo/);
  let skill = buildSkillPack(r);
  assert.match(skill, /一句话结论：交接靠结构化摘要。/);
  assert.match(skill, /- 生成交接摘要：关会话时生成（证据 E1, E3）/);
  assert.match(skill, /还没做复刻对照：在「局限」里写明未经复刻验证。/);
  assert.match(skill, /kind 填 skill/);
  assert.match(skill, /不要装进任何 Agent 配置/);
  r.hatch.replica = { round: 1, at: AT, where: "~/Sandbox/2026-10-31-接力/", rows: [{ name: "生成交接摘要", result: "diff", note: "少了时间戳" }] };
  skill = buildSkillPack(r);
  assert.match(skill, /## 复刻对照（~\/Sandbox\/2026-10-31-接力\/）\n- 生成交接摘要：有差异 ｜ 少了时间戳/);
});

test("拆解回执：结论、能力清单、八格、证据、下一轮建议问各归其位，小标题带回任务编号与轮次", () => {
  const p = parseReport(REPORT);
  assert.equal(p.report.verdict, "交接靠一份结构化摘要，接手方先读摘要再拉原文。");
  assert.deepEqual(p.report.caps, [
    { name: "生成交接摘要", known: "关掉会话时自动生成", miss: "摘要长度上限", ev: ["E1", "E3"] },
    { name: "接手方读取", known: "先读摘要", miss: "", ev: ["E2"] },
    { name: "断点续传", known: "", miss: "中断后怎么恢复", ev: [] },
  ]);
  assert.deepEqual(p.report.evidence.map((e) => e.id), ["E1", "E2", "E3"]);
  assert.equal(p.report.evidence[1].where, "GET /api/handoff/:id · 接手方先请求这个");
  assert.deepEqual(p.report.nextAsk, ["摘要长度上限是多少？", "中断后怎么恢复？"]);
  assert.equal(p.slots.use.known, "把一个 Agent 的进度交给下一个");
  assert.equal(p.slots.shape.miss, "摘要分几节？");
  assert.equal(p.missing.length, 6);
  assert.deepEqual(p.header, { taskId: "rec_demo", round: 1 });
  assert.deepEqual(p.unplaced, []);
});

test("拆解回执的各种写法：乱序、缺小节、只有八格、包在代码块里、附加段落、重复小节、认不出的行", () => {
  const shuffled = REPORT.split("\n## ");
  const reordered = [shuffled[0], ...shuffled.slice(1).reverse()].join("\n## ");
  assert.deepEqual(parseReport(reordered).report, parseReport(REPORT).report, "乱序结果相同");
  const onlySlots = parseReport("## 用途\n已知：交接\n缺：无");
  assert.deepEqual(onlySlots.report, { verdict: "", caps: [], evidence: [], nextAsk: [] });
  assert.deepEqual(onlySlots.header, {});
  assert.equal(onlySlots.slots.use.known, "交接");
  const fenced = parseReport("```text\n" + REPORT + "\n```");
  assert.equal(fenced.report.caps.length, 3);
  const noHeader = parseReport("一句话结论：开头就写了结论\n## 能力清单\n1. 生成摘要：已知 自动\n这行不是条目\n## 下一轮建议问\n无\n## 备注\n顺带看到导出按钮\n## 能力清单\n- 重复的：已知 x");
  assert.equal(noHeader.report.verdict, "开头就写了结论");
  assert.deepEqual(noHeader.report.caps, [{ name: "生成摘要", known: "自动", miss: "", ev: [] }]);
  assert.deepEqual(noHeader.report.nextAsk, []);
  assert.deepEqual(noHeader.unplaced.map((u) => u.label), ["「能力清单」里认不出的行", "备注", "能力清单"]);
  assert.equal(noHeader.unplaced[0].text, "这行不是条目");
  const loose = parseReport("## 能力清单\n- 读取：先读摘要 ｜证据 见截图\n## 证据\n- E1：a\n- E1：重复的编号\n- 没有编号");
  assert.deepEqual(loose.report.caps, [{ name: "读取", known: "先读摘要；证据 见截图", miss: "", ev: [] }]);
  assert.deepEqual(loose.report.evidence, [{ id: "E1", where: "a" }]);
  assert.equal(loose.unplaced[0].text, "- E1：重复的编号\n- 没有编号");
});

test("拆解回执：超长的能力行留在分不进格里，不截断丢字；超过 20 项的能力也不丢", () => {
  const long = parseReport(`## 能力清单\n- 长：已知 ${"字".repeat(2001)}`);
  assert.deepEqual(long.report.caps, []);
  assert.equal(long.unplaced[0].text.length, 2001 + "- 长：已知 ".length);
  const many = parseReport("## 能力清单\n" + Array.from({ length: 22 }, (_, i) => `- 能力${i + 1}：已知 x`).join("\n"));
  assert.equal(many.report.caps.length, 20);
  assert.equal(many.unplaced[0].text, "- 能力21：已知 x\n- 能力22：已知 x");
});

test("复刻对照：位置、一致 / 有差异 / 未验证三种结果、括号或竖线写说明、认不出的行留下", () => {
  const p = parseReplica(`## 复刻对照 · 接力 · 第 2 轮 · 任务编号 rec_demo
复刻位置：~/Sandbox/2026-10-31-接力/
- 生成交接摘要：一致
- 接手方读取：有差异 ｜ 少了时间戳
- 断点续传：未验证（原版要登录）
- 导出：差异，按钮位置不同
这一行说不清楚`);
  assert.equal(p.where, "~/Sandbox/2026-10-31-接力/");
  assert.deepEqual(p.header, { taskId: "rec_demo", round: 2 });
  assert.deepEqual(p.rows, [
    { name: "生成交接摘要", result: "ok", note: "" },
    { name: "接手方读取", result: "diff", note: "少了时间戳" },
    { name: "断点续传", result: "no", note: "原版要登录" },
    { name: "导出", result: "diff", note: "按钮位置不同" },
  ]);
  assert.deepEqual(p.unplaced, [{ label: "认不出的行", text: "这一行说不清楚" }]);
  const bare = parseReplica("```\n- 读取：一致\n```");
  assert.equal(bare.where, "");
  assert.equal(bare.rows.length, 1);
  assert.throws(() => parseReplica(5), /复刻对照需为文本/);
});

test("复刻对照写回（#55，采纳与手动粘贴共用）：写进 hatch.replica、这一轮改已交回、八格不动、过校验；认不出行或轮次不在时拒绝", () => {
  const r = sent(back(sent(specimen())), "replica");
  const text = "复刻位置：~/Sandbox/x/\n- 交接清单：一致\n- 导出：未验证 ｜ 要登录";
  const out = adoptReplica(r, text, 2, { at: AT });
  assert.deepEqual(out.hatch.replica, { round: 2, at: AT, where: "~/Sandbox/x/", rows: [{ name: "交接清单", result: "ok", note: "" }, { name: "导出", result: "no", note: "要登录" }] });
  assert.deepEqual(out.hatch.rounds.map((x) => x.status), ["back", "back"]);
  assert.deepEqual(out.hatch.slots, r.hatch.slots);
  validateReverseRecords([{ ...r, hatch: out.hatch }]);
  assert.deepEqual([stageOf({ ...r, hatch: out.hatch }).stage, stageOf({ ...r, hatch: out.hatch }).next], ["replica", "skill"]);
  assert.throws(() => adoptReplica(r, "随便写写", 2, { at: AT }), /没认出复刻对照行/);
  assert.throws(() => adoptReplica(r, text, 9, { at: AT }), (e) => e.status === 409);
});

test("阶段推导：计划中、已派出（等交回 / 该追问或复刻）、回执待过目、复刻中、已收成、搁置", () => {
  const of = (r, reports) => stageOf(r, reports);
  const planned = specimen();
  assert.deepEqual([of(planned).stage, of(planned).next], ["planned", "start"]);
  const out = sent(specimen());
  assert.deepEqual([of(out).stage, of(out).next], ["sent", "wait"]);
  const pending = [{ recordId: "rec_demo", status: "pending" }, { recordId: "other", status: "pending" }, { recordId: "rec_demo", status: "rejected" }];
  assert.deepEqual([of(out, pending).stage, of(out, pending).pending], ["review", 1]);
  const decided = back(sent(specimen()));
  assert.deepEqual([of(decided).stage, of(decided).next], ["sent", "decide"]);
  const replicating = sent(back(sent(specimen())), "replica");
  assert.deepEqual([of(replicating).stage, of(replicating).next], ["replica", "wait"]);
  decided.hatch.replica = { round: 1, at: AT, where: "x", rows: [] };
  assert.deepEqual([of(decided).stage, of(decided).next], ["replica", "skill"]);
  const harvested = back(sent(specimen()));
  harvested.hatchSkills = [{ assetId: "a1", versionId: "v1", at: AT, slotsHash: HASH }];
  assert.deepEqual([of(harvested).stage, of(harvested).next], ["harvested", "done"]);
  const held = sent(specimen());
  held.heldAt = AT;
  assert.deepEqual([of(held).stage, of(held).next], ["held", "resume"]);
  assert.equal(of(held, pending).stage, "review", "搁置中交回的回执也要看到");
  assert.equal(of(held).label, STAGES.held);
  const legacy = specimen();
  legacy.hatch = initialHatch(legacy, AT);
  assert.equal(of(legacy).stage, "planned", "旧记录没有新轮次按计划中");
});

test("校验：hatch.report、hatch.replica、轮次类型、heldAt；回执轮次必须存在", () => {
  const ok = back(sent(specimen()));
  ok.heldAt = AT;
  ok.hatch.report = { round: 1, ...parseReport(REPORT).report };
  ok.hatch.replica = { round: 1, at: AT, where: "~/Sandbox/x/", rows: [{ name: "读取", result: "ok", note: "" }] };
  validateReverseRecords([ok]);
  const bad = (mutate, message) => { const r = structuredClone(ok); mutate(r); assert.throws(() => validateReverseRecords([r]), message); };
  bad((r) => { r.hatch.rounds[0].kind = "other"; }, /轮次类型无效/);
  bad((r) => { r.hatch.report.round = 2; }, /回执轮次不存在/);
  bad((r) => { r.hatch.report.extra = 1; }, /逆向字段无效/);
  bad((r) => { r.hatch.report.caps[0].ev = ["X1"]; }, /能力证据编号无效/);
  bad((r) => { r.hatch.report.caps[0].name = " "; }, /能力名称为空/);
  bad((r) => { r.hatch.report.evidence.push({ id: "E1", where: "重复" }); }, /证据编号重复/);
  bad((r) => { r.hatch.report.nextAsk = [""]; }, /下一轮建议问为空/);
  bad((r) => { r.hatch.report.caps = Array(21).fill(r.hatch.report.caps[0]); }, /能力清单无效或过多/);
  bad((r) => { r.hatch.replica.rows[0].result = "maybe"; }, /复刻对照结果无效/);
  bad((r) => { r.hatch.replica.round = 9; }, /回执轮次不存在/);
  bad((r) => { r.heldAt = "昨天"; }, /时间/);
});
