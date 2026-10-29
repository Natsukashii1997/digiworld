// 逆向工程孵蛋 3C 页面（#28）：切标本、勾格子、复制写轮次、放回结论预览与确认、手改不被覆盖、旧结论未分格、
// 投入 / 存 Skill / 删除恢复照旧、REA 入口仍在、1440/390/320 无溢出、控件 44px、axe。仅合成隔离库，不读 data/。
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import { reverseHatchFixture } from "./reverse-hatch-fixture.mjs";
import { axe, settle } from "./ui-v14-checks.mjs";
const { chromium } = createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE || "/Users/nat/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright");
const browser = await chromium.launch(), errors = [];
const button = (p, name) => p.getByRole("button", { name, exact: true });
const sha = (s) => createHash("sha256").update(s).digest("hex");
const rec = async (app, id) => (await app.repository.read()).reverseRecords.find((r) => r.id === id);
await fs.mkdir("test-results", { recursive: true });

async function open(app, width) {
  const c = await browser.newContext({ viewport: { width, height: 1000 }, timezoneId: "Asia/Shanghai", reducedMotion: "reduce" }), p = await c.newPage();
  p.setDefaultTimeout(10000);
  p.on("pageerror", (e) => errors.push(e.message));
  p.on("console", (m) => m.type() === "error" && errors.push(m.text()));
  await p.addInitScript(() => {
    window.syntheticCopies = [];
    Object.defineProperty(navigator, "clipboard", { value: { writeText: async (s) => { if (window.syntheticCopyFail) throw Error("合成剪贴板失败"); window.syntheticCopies.push(s); } } });
  });
  await p.route("**/*", (r) => { assert.equal(new URL(r.request().url()).origin, new URL(app.url).origin, "禁止任何外部请求"); return r.continue(); });
  await p.goto(app.url + "/#references");
  await p.locator(".rh").waitFor();
  return p;
}
const copies = (p) => p.evaluate(() => window.syntheticCopies);
async function checks(p, label) {
  await settle(p);
  assert.equal(await p.evaluate(() => document.documentElement.scrollWidth - innerWidth), 0, label + " 横向溢出");
  for (const control of await p.locator(".rh").locator("button,a,input,select,textarea,summary").all()) {
    if (!(await control.isVisible())) continue;
    const box = await control.evaluate((e) => { const r = (["checkbox", "radio"].includes(e.getAttribute("type")) ? e.closest("label") : e).getBoundingClientRect(); return { w: r.width, h: r.height, name: e.textContent.trim().slice(0, 20) }; });
    assert(box.w >= 44 && box.h >= 44, `${label} 44px ${JSON.stringify(box)}`);
  }
  await axe(p, label);
}
const slotState = (p, id) => p.locator(`.rh-slot[data-slot="${id}"]`).getAttribute("class");

// 1440：主流程
{
  const app = await reverseHatchFixture();
  const p = await open(app, 1440);
  try {
    assert.deepEqual(await p.locator(".rh-switch .filter-tabs-row > button[aria-pressed]").allTextContents(), ["Agent迁移和上下文接力功能Agent迁移和上下文接力功能", "全部全部", "验收 · 原生 REA 全能力 · 自建样本只读确认 Mach-O 架构、文件 SHA256 和 add_demo 符号"]);
    for (const [id, st] of [["use", "st-full"], ["shape", "st-full"], ["data", "st-half"], ["flow", "st-empty"], ["check", "st-empty"]]) assert.match(await slotState(p, id), new RegExp(st));
    await p.locator(".rh-src").getByText("第 2 轮 · 10/16 · Codex · 部分").waitFor();
    await p.locator(".rh-hist").getByText("第 1 轮 · 10/15 · Codex · 部分 · 目标已改").waitFor();
    await p.locator(".rh-legacy").getByText("旧结论 · 未分格").waitFor();
    await button(p, "检查更新").waitFor();
    await p.screenshot({ path: "test-results/reverse-hatch-1440.png" });
    await checks(p, "1440");

    // 勾格子：默认勾上没填满的 6 格，取消「界面」后剩 5 格
    await p.getByText("把勾上的 6 格写成第 3 轮追问包").waitFor();
    await p.locator('.rh-slot[data-slot="ui"]').getByRole("button", { name: "放进追问" }).click();
    await p.getByText("把勾上的 5 格写成第 3 轮追问包").waitFor();
    const pack = await p.getByTestId("hatch-pack").textContent();
    assert.ok(pack.startsWith("# 拆解任务 · 第 3 轮：Agent迁移和上下文接力功能"));
    assert.ok(pack.includes("1. 数据：包的格式、字段和接口协议") && !pack.includes("界面：迁移入口"));

    // 复制给 Codex：剪贴板与写入的轮次一致
    await button(p, "复制给 Codex").click();
    await p.getByText("第 3 轮追问包已复制。去 Codex 里粘贴，只复制，不自动发送。").waitFor();
    assert.deepEqual(await copies(p), [pack]);
    let r = await rec(app, "rv-furnace");
    assert.deepEqual(r.hatch.rounds.map(({ n, by, asked, status, packHash }) => ({ n, by, asked, status, packHash })), [{ n: 1, by: "codex", asked: ["data", "flow", "edge", "write", "check"], status: "sent", packHash: sha(pack) }]);
    assert.match(await slotState(p, "flow"), /is-sent/);
    await p.locator('.rh-slot[data-slot="flow"]').getByText("第 3 轮在问").waitFor();
    assert.equal(r.packVersions.length, 2, "旧字段不变");

    // 手改「流程」
    await p.locator('.rh-slot[data-slot="flow"]').getByRole("button", { name: "改" }).click();
    const edit = p.getByRole("dialog", { name: "改「流程」" });
    await edit.getByLabel("已知").fill("我自己写的流程：先导出再导入");
    await edit.getByLabel("缺").fill("");
    await button(edit, "保存这一格").click();
    await edit.waitFor({ state: "hidden" });
    r = await rec(app, "rv-furnace");
    assert.equal(r.hatch.slots.flow.edited, true);

    // 放回结论：预览 → 确认；手改的不覆盖，分不进格的不写入
    await button(p, "放回结论").click();
    const back = p.getByRole("dialog", { name: "放回结论" });
    await back.getByLabel("Agent 的回答").fill("## 流程\n已知：Agent 说的流程\n缺：无\n\n## 界面\n已知：入口在 Agent 详情页右上角\n缺：无。\n\n## 其他\n顺带发现：有个隐藏开关");
    await button(back, "拆格预览").click();
    await back.getByText("会变的格子（1）").waitFor();
    await back.getByText("你改过，默认不覆盖").waitFor();
    await back.getByText("分不进格（不会写入）").waitFor();
    await p.screenshot({ path: "test-results/reverse-hatch-1440-放回预览.png" });
    await axe(p, "1440 放回预览");
    await button(back, "确认写入").click();
    await back.waitFor({ state: "hidden" });
    r = await rec(app, "rv-furnace");
    assert.deepEqual(r.hatch.slots.ui, { known: "入口在 Agent 详情页右上角", miss: "", at: r.hatch.slots.ui.at });
    assert.equal(r.hatch.slots.flow.known, "我自己写的流程：先导出再导入");
    assert.equal(r.hatch.rounds[0].status, "back");
    assert.ok(!JSON.stringify(r.hatch).includes("隐藏开关"));
    assert.match(await slotState(p, "ui"), /st-full/);

    // 预览后八格被别处改过：不写入，提示重新预览
    await button(p, "放回结论").click();
    const drift = p.getByRole("dialog", { name: "放回结论" });
    await drift.getByLabel("Agent 的回答").fill("## 边界\n已知：只能迁移自己的 Agent\n缺：无");
    await button(drift, "拆格预览").click();
    const outside = await app.repository.read();
    outside.reverseRecords.find((x) => x.id === "rv-furnace").hatch.slots.check.known = "别处写的验收";
    await app.repository.write(outside, { expectedRevision: outside.revision });
    await button(drift, "确认写入").click();
    await drift.getByRole("alert").getByText("八格刚被别处改过，没有写入。请关掉重新预览。").waitFor();
    assert.equal((await rec(app, "rv-furnace")).hatch.slots.edge.known, "");
    await drift.getByRole("button", { name: "关闭" }).click();

    // 复制后保存失败：说明已复制，不要再复制
    await p.route("**/api/workspace", (route) => (route.request().method() === "PUT" ? route.fulfill({ status: 500, contentType: "application/json", body: JSON.stringify({ error: "合成写入失败" }) }) : route.continue()));
    const roundsBefore = (await rec(app, "rv-furnace")).hatch.rounds.length;
    await p.locator('.rh-slot[data-slot="edge"]').getByRole("button", { name: "放进追问" }).click();
    await button(p, "复制给 Claude Code").click();
    await p.getByRole("alert").getByText(/追问包已复制，但这一轮没记上.*不用再复制/).waitFor();
    assert.equal((await rec(app, "rv-furnace")).hatch.rounds.length, roundsBefore);
    await p.unroute("**/api/workspace");

    // 旧结论按八格整理：只复制
    await button(p, "复制「让 Agent 按八格整理」").click();
    await p.getByText("「按八格整理」任务包已复制。拿回答后点「放回结论」。").waitFor();
    assert.ok((await copies(p)).at(-1).includes("# 按八格整理 · Agent迁移和上下文接力功能"));

    // 切标本：社区页没有 hatch，只有用途一格；一轮失败
    await p.locator(".rh-switch").getByRole("button", { name: /^全部/ }).click();
    await p.locator(".rh-src").getByText("第 1 轮 · 10/15 · REA · 失败").waitFor();
    assert.equal(await p.locator(".rh-slot.st-full").count(), 1);
    assert.ok((await p.getByTestId("hatch-pack").textContent()).includes("先确认目标能打开"), "上一轮失败时追问包先确认目标");
    assert.equal((await rec(app, "rv-community")).hatch, undefined, "只看不写");

    // 剪贴板失败：不写轮次
    await p.locator(".rh-switch").getByRole("button", { name: /^验收/ }).click();
    await p.getByText("把勾上的 7 格写成第 1 轮追问包").waitFor();
    await p.evaluate(() => { window.syntheticCopyFail = true; });
    await button(p, "复制给 Claude Code").click();
    await p.getByRole("alert").getByText("合成剪贴板失败").waitFor();
    assert.equal((await rec(app, "rv-fixture")).hatch, undefined);
  } finally { await p.context().close(); await app.close(); }
}

// 投入作品 → 存成 Skill → 移入回收区 → 恢复（保留功能，改指新页面）
{
  const app = await reverseHatchFixture({ empty: true });
  const p = await open(app, 1440);
  try {
    await p.locator(".rh-empty").getByText("投入第一件参照物").waitFor();
    await checks(p, "空库");
    await p.locator(".rh-empty").getByRole("button", { name: "投入参照物" }).click();
    const art = p.getByRole("dialog");
    await art.getByRole("radio", { name: "作品", exact: true }).check();
    await art.getByLabel("标题", { exact: true }).fill("作品文字原件");
    await art.getByLabel("贴文字", { exact: true }).fill("先给结论，再给理由。\n这是合成原件。");
    await button(art, "投入参照物").click();
    await art.waitFor({ state: "hidden" });
    await p.locator(".rh-src h2").getByText("作品文字原件").waitFor();
    await p.locator('.rh-slot[data-slot="use"]').getByText("作品文字原件").waitFor();
    const assetsBefore = (await app.repository.read()).assets.length;
    await button(p, "存成 Skill").click();
    await p.getByRole("dialog", { name: "存成 Skill · 预览" }).waitFor();
    await button(p, "确认保存").click();
    await p.getByRole("dialog", { name: "已存 Skill", exact: true }).waitFor();
    await button(p.getByRole("dialog"), "关闭").click();
    assert.equal((await app.repository.read()).assets.length, assetsBefore + 1);
    await p.getByRole("button", { name: /移入回收区/ }).click();
    await p.locator(".rh-empty").waitFor();
    await p.locator("details.rh-more summary", { hasText: "参考与回收" }).click();
    await p.locator("details.rh-more").getByRole("button", { name: "恢复" }).click();
    await p.locator(".rh-src h2").getByText("作品文字原件").waitFor();
    assert.equal((await app.repository.read()).reverseRecords[0].deletedAt, undefined);
    // 保存参考（原 browser.mjs 的逆向段走这里）
    await button(p, "保存参考").click();
    const ref = p.getByRole("dialog", { name: "保存参考" });
    await ref.getByLabel("标题", { exact: true }).fill("Apple 设计参考");
    await ref.getByRole("textbox", { name: /^来源链接/ }).fill("https://www.example.test/design");
    await ref.getByLabel("好在哪里（选填）").fill("留白与排版层级");
    await button(ref, "保存参考").click();
    await ref.waitFor({ state: "hidden" });
    await p.locator("details.rh-more").getByRole("link", { name: "Apple 设计参考" }).waitFor();
    assert.equal((await app.repository.read()).references[0].note, "留白与排版层级");
    await checks(p, "参考与回收");
  } finally { await p.context().close(); await app.close(); }
}

// 窄屏
for (const width of [390, 320]) {
  const app = await reverseHatchFixture();
  const p = await open(app, width);
  try {
    await p.screenshot({ path: `test-results/reverse-hatch-${width}.png`, fullPage: true });
    await checks(p, String(width));
  } finally { await p.context().close(); await app.close(); }
}

await browser.close();
// 合成的写入失败（500）是有意制造的，只剔除这一条
assert.deepEqual(errors.filter((e) => !e.includes("status of 500")), []);
console.log("reverse-hatch 1440/390/320：切标本、勾格子、复制写轮次、手改、放回预览与确认、预览后被改不写入、复制后保存失败提示、按八格整理、剪贴板失败、投入/存 Skill/回收恢复、REA 入口、无溢出、44px、axe 通过；仅合成数据");
