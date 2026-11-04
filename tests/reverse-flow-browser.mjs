// 逆向工程 v5 页面 v6-C（#53）浏览器回归：先 npm run build 再单独跑（不在 npm test 里）。
// 新建 → 复制开场话术、待过目预览并采纳、退回、手动粘贴回执、搁置与恢复、1440/390/320 无溢出、控件 44px、axe。仅合成隔离库，不读 data/。
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import { fixture } from "./fixture.mjs";
import { furnace, community, fixtureBin } from "./reverse-hatch-fixture.mjs";
import { seed } from "../src/store.js";
import { createSpecimen } from "../src/reverse-recipe.js";
import { appendHatchRound, hatchOf } from "../src/reverse-hatch.js";
import { adoptReport } from "../src/reverse-flow.js";
import { createReverseReports } from "../server/reverse-report.mjs";
import { axe, settle } from "./ui-v14-checks.mjs";
const { chromium } = createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE || "/Users/nat/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright");
// 本机缓存的浏览器版本和 playwright 对不上时，用 PLAYWRIGHT_CHROMIUM 指定一个已有的 chromium / headless shell。
const browser = await chromium.launch(process.env.PLAYWRIGHT_CHROMIUM ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM } : {}), errors = [];
const button = (p, name) => p.getByRole("button", { name, exact: true });
const sha = (s) => createHash("sha256").update(s).digest("hex");
const rec = async (app, id) => (await app.repository.read()).reverseRecords.find((r) => r.id === id);
await fs.mkdir("test-results", { recursive: true });

const reportText = (record, n, verdict) => [
  `## 回执 · ${record.title} · 第 ${n} 轮 · 任务编号 ${record.id}`,
  `一句话结论：${verdict}`,
  "## 能力清单",
  "- Agent 迁移：已知 入口 /agents/migration；数据走 migration-packages 接口 ｜证据 E3, E4 ｜缺 迁移包的字段和大小限制",
  "- 工作交接：已知 入口 /agents/work-handoff ｜证据 E3 ｜缺 接力是文本、文件还是运行状态",
  "## 用途", "已知：把会话、文件、Skill 迁到另一个 Agent", "缺：无",
  "## 结构", "已知：迁移 / 交接两支，各一组路由和接口", "缺：无",
  "## 证据",
  "- E3：主脚本 index-8f2.js · 路由 /agents/migration、/agents/work-handoff",
  "- E4：se.post 调用候选 migration-packages、context-packs",
  "## 下一轮建议问", "1. 迁移包有哪些字段？",
].join("\n");
const round = (r, kind, at, by = "codex") => ({ ...r, hatch: appendHatchRound(r, { by, kind, asked: [], packHash: sha(kind + at), at }) });

// 炉子：第 1 轮开场已采纳（有结论、能力、证据），第 2 轮追问在问，AI 交回了第 2 轮回执待过目。
// 飞书：第 1 轮开场在问（等回执，用来手动粘贴）。社区页：搁置。验收样本：计划中。
function records() {
  let f = round(furnace(), "start", "2026-10-15T05:00:00.000Z");
  f = { ...f, hatch: adoptReport(f, reportText(f, 1, "分出「Agent 迁移」「工作交接」两支"), 1, { at: "2026-10-15T08:00:00.000Z" }).hatch };
  f = round(f, "ask", "2026-10-16T05:00:00.000Z");
  const feishu = round({ ...createSpecimen({ type: "FN", title: "飞书多维表格", target: { kind: "web", url: "https://base.example.test/", feature: "公式字段怎么做到实时校验", clues: [], authorized: true } }), id: "rv-feishu", createdAt: "2026-10-30T02:00:00.000Z" }, "start", "2026-10-30T03:00:00.000Z", "claude");
  return [f, feishu, { ...community(), heldAt: "2026-10-16T00:00:00.000Z" }, fixtureBin()];
}
async function flowFixture({ empty = false } = {}) {
  const app = await fixture();
  try {
    const state = seed(), rs = empty ? [] : records();
    state.reverseRecords = rs;
    await app.repository.write(state, { initialize: true });
    // 待过目回执只能走提交通道（和 MCP reverse_report 同一个服务）
    if (!empty) await createReverseReports(app.repository).propose({ taskId: "rv-furnace", round: 2, kind: "report", text: reportText(rs[0], 2, "两支各有入口路由和数据接口"), proposer: "Codex" });
    return app;
  } catch (error) { await app.close(); throw error; }
}

async function open(app, width) {
  const c = await browser.newContext({ viewport: { width, height: 1000 }, timezoneId: "Asia/Shanghai", reducedMotion: "reduce" }), p = await c.newPage();
  p.setDefaultTimeout(10000);
  p.on("pageerror", (e) => errors.push(e.message));
  p.on("console", (m) => m.type() === "error" && errors.push(m.text()));
  await p.addInitScript(() => {
    window.syntheticCopies = [];
    Object.defineProperty(navigator, "clipboard", { value: { writeText: async (s) => { window.syntheticCopies.push(s); } } });
  });
  await p.route("**/*", (r) => { assert.equal(new URL(r.request().url()).origin, new URL(app.url).origin, "禁止任何外部请求"); return r.continue(); });
  await p.goto(app.url + "/#references");
  await p.locator(".rv6").waitFor();
  return p;
}
const copies = (p) => p.evaluate(() => window.syntheticCopies);
async function checks(p, label) {
  await settle(p);
  assert.equal(await p.evaluate(() => document.documentElement.scrollWidth - innerWidth), 0, label + " 横向溢出");
  for (const control of await p.locator(".rv6").locator("button,a,input,select,textarea,summary").all()) {
    if (!(await control.isVisible())) continue;
    const box = await control.evaluate((e) => { const r = e.getBoundingClientRect(); return { w: r.width, h: r.height, name: e.textContent.trim().slice(0, 20) }; });
    assert(box.w >= 44 && box.h >= 44, `${label} 44px ${JSON.stringify(box)}`);
  }
  await axe(p, label);
}
const pick = (p, title) => p.locator(".li6").filter({ hasText: title }).getByRole("button").click();

// 1440：轨道件数、清单顺序、档案读数；待过目采纳；手动粘贴；搁置与恢复
{
  const app = await flowFixture(), p = await open(app, 1440);
  try {
    // 轨道：搁置落第 0 步，飞书在取证（2），炉子回执待过目（3）；未派出 1，已收成 0
    assert.deepEqual(await p.locator(".rail .n").evaluateAll((ns) => ns.map((n) => n.getAttribute("aria-label"))), ["1 件", "0 件", "1 件", "1 件", "0 件", "0 件"]);
    assert.deepEqual(await p.locator(".li6 .nm").allTextContents(), ["Agent迁移和上下文接力功能", "飞书多维表格", "验收 · 原生 REA 全能力 · 自建样本", "全部"]);
    const dos = p.locator(".dos");
    await dos.getByText("AI 交回了第 2 轮回执").waitFor();
    await dos.locator(".nn").getByText("分出「Agent 迁移」「工作交接」两支").waitFor();
    assert.equal(await dos.locator(".caps li").count(), 2);
    assert.equal(await dos.locator(".evl li").first().textContent(), "E3主脚本 index-8f2.js · 路由 /agents/migration、/agents/work-handoff");
    await checks(p, "1440 首屏");
    await p.screenshot({ path: "test-results/reverse-flow-1440.png", fullPage: true });

    // 待过目：预览并采纳 → 第 2 轮已交回，结论换成第 2 轮，回执标为已采纳
    await dos.getByRole("button", { name: "预览并采纳" }).click();
    const rv = p.getByRole("dialog", { name: "过目第 2 轮回执" });
    await rv.locator(".rf-preview").getByText("两支各有入口路由和数据接口", { exact: false }).waitFor();
    await button(rv, "采纳写入").click();
    await rv.waitFor({ state: "hidden" });
    let f = await rec(app, "rv-furnace");
    assert.equal(f.hatch.rounds.at(-1).status, "back");
    assert.equal(f.hatch.report.round, 2);
    assert.equal((await app.repository.read()).reverseReports[0].status, "adopted");
    await dos.locator(".nn").getByText("两支各有入口路由和数据接口").waitFor();
    assert.equal(await dos.locator(".pend").count(), 0);

    // 下一步：复制「追问下一轮」→ 只问没填满的格子，记一轮 ask
    await dos.getByRole("button", { name: "复制「追问下一轮」" }).click();
    const ask = p.getByRole("dialog", { name: "Agent迁移和上下文接力功能 · 追问下一轮" });
    await button(ask, "复制给 Claude Code").click();
    await ask.waitFor({ state: "hidden" });
    assert.match((await copies(p)).at(-1), /任务编号：rv-furnace　轮次：3/);
    f = await rec(app, "rv-furnace");
    assert.deepEqual([f.hatch.rounds.at(-1).kind, f.hatch.rounds.at(-1).by, f.hatch.rounds.at(-1).status], ["ask", "claude", "sent"]);

    // 手动粘贴：飞书第 1 轮在问，粘贴后写进第 1 轮
    await pick(p, "飞书多维表格");
    await dos.getByRole("heading", { name: "飞书多维表格" }).waitFor();
    await dos.getByRole("button", { name: "粘贴回执" }).click();
    const paste = p.getByRole("dialog", { name: "粘贴回执" });
    const feishu = await rec(app, "rv-feishu");
    await paste.getByLabel("回执原文").fill(reportText(feishu, 1, "公式字段在提交前做一次本地校验"));
    await button(paste, "预览").click();
    await paste.getByText("写进第 1 轮。").waitFor();
    await button(paste, "确认写入").click();
    await paste.waitFor({ state: "hidden" });
    const fs1 = await rec(app, "rv-feishu");
    assert.equal(fs1.hatch.rounds[0].status, "back");
    assert.equal(fs1.hatch.report.verdict, "公式字段在提交前做一次本地校验");

    // 搁置与恢复
    await pick(p, "验收 · 原生 REA 全能力 · 自建样本");
    await button(dos, "搁置").click();
    await dos.getByRole("button", { name: "恢复" }).waitFor();
    assert.ok((await app.repository.read()).reverseRecords.find((r) => r.title.startsWith("验收")).heldAt);
    await button(dos, "恢复").click();
    await dos.getByRole("button", { name: "搁置" }).waitFor();
    assert.equal((await app.repository.read()).reverseRecords.find((r) => r.title.startsWith("验收")).heldAt, undefined);
    await checks(p, "1440 操作后");
  } finally { await p.context().close(); await app.close(); }
}

// 退回：回执标为已退回，档案不变
{
  const app = await flowFixture(), p = await open(app, 1440);
  try {
    const before = (await rec(app, "rv-furnace")).hatch;
    await p.locator(".pend").getByRole("button", { name: "退回" }).click();
    await p.locator(".pend").waitFor({ state: "detached" });
    assert.equal((await app.repository.read()).reverseReports[0].status, "rejected");
    assert.deepEqual((await rec(app, "rv-furnace")).hatch, before);
  } finally { await p.context().close(); await app.close(); }
}

// 新建 → 开场话术 → 复制给 Codex：≤ 3 步（点＋、填表提交、点复制）
{
  const app = await flowFixture({ empty: true }), p = await open(app, 1440);
  try {
    await checks(p, "1440 空页");
    await p.locator(".rf-empty").getByRole("button", { name: "拆一件新东西" }).click();
    const form = p.getByRole("dialog", { name: "投入参照物" });
    await form.getByRole("radio", { name: "作品", exact: true }).check();
    await form.getByLabel("标题", { exact: true }).fill("作品文字原件");
    await form.getByLabel("贴文字", { exact: true }).fill("先给结论，再给理由。\n这是合成原件。");
    await button(form, "投入参照物").click();
    const start = p.getByRole("dialog", { name: "作品文字原件 · 开场话术" });
    await button(start, "复制给 Codex").click();
    await start.waitFor({ state: "hidden" });
    const text = (await copies(p)).at(-1), r = (await app.repository.read()).reverseRecords[0];
    assert.match(text, new RegExp(`任务编号：${r.id}　轮次：1`));
    assert.match(text, /⏸/);
    assert.deepEqual([r.hatch.rounds[0].kind, r.hatch.rounds[0].by, r.hatch.rounds[0].status], ["start", "codex", "sent"]);
    assert.equal(r.hatch.rounds[0].packHash, sha(text));
    assert.equal(hatchOf(r).rounds.length, 1);
  } finally { await p.context().close(); await app.close(); }
}

// 窄屏：390 / 320 无横向溢出、控件 44px、axe
for (const width of [390, 320]) {
  const app = await flowFixture(), p = await open(app, width);
  try {
    await checks(p, `${width}`);
    if (width === 390) await p.screenshot({ path: "test-results/reverse-flow-390.png", fullPage: true });
  } finally { await p.context().close(); await app.close(); }
}

await browser.close();
assert.deepEqual(errors, []);
console.log("reverse-flow-browser: 通过");
