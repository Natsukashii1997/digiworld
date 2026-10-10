import {openLegacyInput,openReferenceTools} from './reverse-v16-helpers.mjs';
// 支线 B2 逆向工程第一层：投素材 → 生成并复制拆解任务包 → 粘贴 Agent 回复（失败如实提示、恶意 HTML 当文字）→
// 预览报告与候选 → 勾选入库到焚决卷与 Prompt → 逆向记录删除进回收区与恢复；44px、axe、390 无横溢。
import { createRequire } from "node:module";
import assert from "node:assert/strict";
import AxeBuilder from "@axe-core/playwright";
import { mkdir } from "node:fs/promises";
import { fixture } from "./fixture.mjs";
import { seed, current } from "../src/store.js";
const { chromium } = createRequire(import.meta.url)(
  process.env.PLAYWRIGHT_MODULE ||
    "/Users/nat/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright",
);
const AT = "2026-09-30T08:00:00.000Z";
const app = await fixture();
const initial = seed();
initial.scrolls = [
  { id: "scroll-write", name: "写作心法", pinned: false, createdAt: AT, entries: [] },
  { id: "scroll-other", name: "灵感", pinned: false, createdAt: "2026-09-30T09:00:00.000Z", entries: [] },
];
await app.repository.write(initial, { initialize: true });
await mkdir("test-results", { recursive: true });
const browser = await chromium.launch();
const errors = [];
const ok = (s) => console.log("PASS", s);

async function open(width, height = 1000, hash = "references") {
  const context = await browser.newContext({
    viewport: { width, height },
    reducedMotion: "reduce",
    permissions: ["clipboard-read", "clipboard-write"],
  });
  const page = await context.newPage();
  page.setDefaultTimeout(10000);
  page.on("pageerror", (e) => errors.push(`${width} ${e.message}`));
  await page.goto(`${app.url}/#${hash}`);
  await page.locator(".page-heading").waitFor();
  return page;
}
const button = (scope, name) => scope.getByRole("button", { name, exact: true });
async function atLeast44(locator, name) {
  const box = await locator.boundingBox();
  assert.ok(box, `${name} 不可见`);
  assert.ok(
    box.width >= 44 && box.height >= 44,
    `${name} 点击区域 ${box.width}x${box.height}，应至少 44px`,
  );
}
async function axe(page, label) {
  const result = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
    .analyze();
  assert.deepEqual(
    result.violations.map(
      (v) => `${label}: ${v.id} ${v.nodes.map((n) => n.target).join(" ")}`,
    ),
    [],
  );
}
async function until(check, label) {
  for (let i = 0; i < 50; i++) {
    if (await check()) return;
    await new Promise((r) => setTimeout(r, 100));
  }
  assert.fail(`等待超时：${label}`);
}
async function noOverflow(page, label) {
  const { scroll, client } = await page.evaluate(() => ({
    scroll: document.documentElement.scrollWidth,
    client: document.documentElement.clientWidth,
  }));
  assert.ok(scroll <= client, `${label}：页面横向溢出 ${scroll} > ${client}`);
}
const records = async () => (await app.repository.read()).reverseRecords || [];
const fence = (value) => "```json\n" + JSON.stringify(value, null, 2) + "\n```";
const EVIL = '<img src=x onerror="window.__xss=1"><script>window.__xss=2</script>';
const reply = {
  report: {
    summary: `开头反常识 ${EVIL}`,
    structure: [{ mark: "原文观察", text: "第一段只有一句话：“别再背单词了”。" }],
    techniques: [{ mark: "推断", text: "先否定习惯，再给替代方案。" }],
    reusable: [{ mark: "已验证", text: "“别再 X 了，试试 Y”，试写三个主题都成立。" }],
  },
  candidates: [
    { type: "scroll", text: "别再 X 了，试试 Y", tags: ["开头", "反差"], mark: "已验证" },
    {
      type: "prompt",
      title: "反常识开头改写",
      description: "把平铺直叙的开头改成反常识开头",
      content: `请把下面的开头改写成“别再 X 了，试试 Y”的结构：\n[原文]\n${EVIL}`,
      tags: ["写作"],
      mark: "推断",
    },
    { type: "scroll", text: "先否定习惯，再给替代", tags: [], mark: "推断" },
    { type: "skill", title: "不支持", content: "x", mark: "推断" },
  ],
};
const workbench = (page) => page.getByRole("region", { name: "逆向工程工作区" });
const candidates = (page) => workbench(page).getByRole("group", { name: "候选资产" });
const checkbox = (page, n) => candidates(page).getByRole("checkbox", { name: new RegExp(`^候选 ${n}：`) });
// 勾选的点击区域是整行 label。
const pick = (page, n) => checkbox(page, n).locator("xpath=ancestor::label[1]");

try {
  const page = await open(1440);
  await page.getByRole("heading", { name: "逆向工程", level: 1 }).waitFor();
  await openLegacyInput(page);
  const wb = workbench(page);
  await wb.waitFor();
  // 1. 投入素材：原文、链接（只记录）、好在哪里。两者都空不能生成。
  await button(wb, "生成拆解任务包").click();
  await wb.getByRole("alert").filter({ hasText: "粘贴素材原文或填写链接" }).waitFor();
  assert.equal((await records()).length, 0);
  await wb.getByLabel("素材链接").fill("javascript:alert(1)");
  await button(wb, "生成拆解任务包").click();
  await wb.getByRole("alert").filter({ hasText: "http 或 https" }).waitFor();
  assert.equal((await records()).length, 0);
  await wb.getByText("只记录链接，工作台不会联网抓取正文").waitFor();
  await wb.getByLabel("素材原文").fill("别再背单词了。\n试试每天读一篇短文。");
  await wb.getByLabel("素材链接").fill("https://example.com/post");
  await wb.getByLabel("我觉得好在哪里（可选）").fill("开头很抓人");
  await button(wb, "生成拆解任务包").click();
  const packBox = wb.getByLabel("拆解任务包", { exact: true });
  await packBox.waitFor();
  await until(async () => (await records()).length === 1, "逆向记录写入主库");
  const [record] = await records();
  assert.equal(record.material.text, "别再背单词了。\n试试每天读一篇短文。");
  assert.equal(record.material.url, "https://example.com/post");
  assert.equal(record.why, "开头很抓人");
  const pack = await packBox.inputValue();
  assert.equal(pack, record.pack);
  for (const piece of ["别再背单词了。", "https://example.com/post", "开头很抓人", "```json", "“原文观察”", "“推断”", "“已验证”", "## 禁止事项"])
    assert.ok(pack.includes(piece), piece);
  assert.equal(await packBox.getAttribute("readonly"), "");
  ok("投入素材（原文 + 链接只记录 + 好在哪里）生成任务包并写入主库；空素材与非 http 链接如实拒绝");

  // 2. 明确选择 Agent，复制并写实际成功回执。
  await wb.getByRole("radiogroup", {name:/^任务包接收 Agent：/}).getByRole("radio",{name:"Codex",exact:true}).click();
  await button(wb, "复制任务包").click();
  await until(
    async () => (await page.evaluate(() => navigator.clipboard.readText())) === pack,
    "剪贴板内容为完整任务包",
  );
  await until(async()=> (await app.repository.read()).reverseRecords[0].copies?.at(-1)?.agentId === "codex", "复制成功回执已持久保存");
  assert.equal((await app.repository.read()).reverseRecords[0].copies.at(-1).agentId, "codex");
  ok("选择Agent后复制完整任务包，保存成功时间回执，不称派发");

  // 3. 粘贴回复：解析失败如实提示，不猜。
  const replyBox = wb.getByLabel("Agent 回复");
  await replyBox.fill("我拆完了，结构很好。");
  await button(wb, "解析回复").click();
  await wb.getByRole("alert").filter({ hasText: "没有找到 JSON" }).waitFor();
  assert.equal(await candidates(page).count(), 0);
  const missing = structuredClone(reply);
  delete missing.report.techniques;
  await replyBox.fill(fence(missing));
  await button(wb, "解析回复").click();
  await wb.getByRole("alert").filter({ hasText: "report.techniques" }).waitFor();
  assert.equal(await candidates(page).count(), 0);
  ok("回复不是 JSON、缺段时如实提示原因，不显示候选");

  // 4. 正常回复（含恶意 HTML / 脚本）：报告与候选预览，恶意内容只作文字显示。
  await replyBox.fill(`这是结果：\n${fence(reply)}`);
  await button(wb, "解析回复").click();
  await candidates(page).waitFor();
  await until(async () => (await records())[0].reply?.includes("反常识开头改写"), "回复写入逆向记录");
  const report = wb.getByRole("region", { name: "拆解报告" });
  await report.getByText(EVIL, { exact: false }).first().waitFor();
  for (const label of ["结构", "手法", "可复用"]) await report.getByRole("heading", { name: label }).waitFor();
  for (const mark of ["原文观察", "推断", "已验证"]) assert.ok(await report.getByText(mark, { exact: true }).count());
  assert.equal(await page.evaluate(() => window.__xss), undefined, "脚本不得执行");
  assert.equal(await page.locator('main img[src="x"], main script').count(), 0, "不得插入 HTML 元素");
  await wb.getByRole("note").filter({ hasText: "第 4 条候选：类型 skill 不支持" }).waitFor();
  assert.equal(await candidates(page).getByRole("checkbox").count(), 3);
  for (let n = 1; n <= 3; n++) assert.equal(await checkbox(page, n).isChecked(), false, "候选默认不勾选");
  const confirm = wb.getByRole("button", { name: /^确认入库/ });
  assert.equal(await confirm.isDisabled(), true);
  ok("报告三段与三类标注可见；不支持的候选逐条说明；恶意 HTML 只当文字；候选默认不勾选");

  await page.screenshot({ path: "test-results/reverse-preview-1440.png", fullPage: true });

  // 5. 勾选入库：候选 1（焚决条目）写入“写作心法”，候选 2（Prompt）新建资产；候选 3 不勾选。
  await checkbox(page, 1).check();
  await checkbox(page, 2).check();
  await wb.getByLabel("焚决条目写入卷").selectOption({ label: "写作心法" });
  await atLeast44(confirm, "确认入库");
  await confirm.click();
  await wb.getByRole("region", { name: "入库结果" }).waitFor();
  const state = await app.repository.read();
  const scroll = state.scrolls.find((s) => s.id === "scroll-write");
  assert.equal(scroll.entries.length, 1);
  assert.equal(scroll.entries[0].text, "别再 X 了，试试 Y");
  assert.equal(scroll.entries[0].uses, 0);
  assert.deepEqual(scroll.entries[0].source, { reverseId: record.id, url: "https://example.com/post" });
  assert.equal(state.scrolls.find((s) => s.id === "scroll-other").entries.length, 0);
  const prompt = state.assets.find((a) => current(a).title === "反常识开头改写");
  assert.ok(prompt, "Prompt 已入库");
  assert.equal(prompt.type, "Prompt");
  assert.equal(prompt.versions.length, 1);
  assert.ok(current(prompt).source.includes(record.id));
  assert.ok(current(prompt).content.includes(EVIL));
  assert.equal(
    state.scrolls.flatMap((s) => s.entries).some((e) => e.text === "先否定习惯，再给替代"),
    false,
    "未勾选的候选不写入",
  );
  const saved = state.reverseRecords[0];
  assert.deepEqual(saved.imports.map((i) => [i.index, i.kind]), [[0, "scroll"], [1, "prompt"]]);
  assert.equal(await checkbox(page, 1).isDisabled(), true);
  assert.equal(await checkbox(page, 2).isDisabled(), true);
  assert.equal(await checkbox(page, 3).isDisabled(), false);
  assert.equal(await replyBox.getAttribute("readonly"), "", "入库后回复锁定");
  ok("勾选的焚决条目写入所选卷（计次 0、保留来源），Prompt 生成第一个版本；未勾选不写；已入库候选不能重复勾选");

  // 6. 记录列表：状态、删除进回收区、恢复。
  const list = page.getByRole("complementary", { name: "标本架" });
  await page.getByText('回收回复与产物',{exact:true}).click();
  await atLeast44(button(page, '移入回收区'), "删除记录");
  await button(page, '移入回收区').click();
  await until(async () => !!(await records())[0].deletedAt, "记录删除写入 deletedAt");
  assert.equal(await list.getByRole("radio",{name:`打开逆向记录 ${record.title}`,exact:true}).count(), 0);
  assert.equal(await workbench(page).getByLabel("拆解任务包", { exact: true }).count(), 0, "删除后关闭该记录");
  await openReferenceTools(page);
  await button(list, `${record.title} · 恢复`).click();
  await until(async () => !(await records())[0].deletedAt, "记录恢复");
  await list.getByRole("radio", { name: `打开逆向记录 ${record.title}`, exact: true }).click();
  await workbench(page).getByLabel("Agent 回复").waitFor();
  assert.equal(await checkbox(page, 1).isDisabled(), true, "重开后仍显示已入库");
  ok("逆向记录显示状态；删除进回收区，可恢复并重新打开");

  // 7. 入库结果在资产仓库可见：Prompt 卡、焚决卷里的条目。
  await page.goto(`${app.url}/#assets`);
  await page.getByRole("heading", { name: "资产仓库", level: 1 }).waitFor();
  await page.locator(".asset-card h3", { hasText: "反常识开头改写" }).waitFor();
  await page.getByRole("group", { name: "资产类型" }).getByRole("button", { name: /^焚决\s*\d+$/ }).click();
  await button(page, "打开卷 写作心法").click();
  await page.getByRole("dialog", { name: "焚决详情" }).locator(".scroll-entry", { hasText: "别再 X 了，试试 Y" }).waitFor();
  ok("资产仓库里可见入库的 Prompt 与焚决条目");

  // 8. 44px、axe（1440）。先关抽屉；只改 hash 的 goto 不会重载页面。
  await page.keyboard.press("Escape");
  await page.getByRole("dialog", { name: "焚决详情" }).waitFor({ state: "detached" });
  await page.goto(`${app.url}/#references`);
  await workbench(page).waitFor();
  await atLeast44(button(page,"投入参照物"),"投入参照物");
  await page.getByRole("complementary", { name: "标本架" }).getByRole("radio", { name: `打开逆向记录 ${record.title}`, exact: true }).click();
  await workbench(page).getByLabel("Agent 回复").waitFor();
  for (const name of ["复制任务包", "解析回复"]) await atLeast44(button(workbench(page), name), name);
  await atLeast44(pick(page, 3), "候选勾选");
  await atLeast44(workbench(page).getByLabel("焚决条目写入卷"), "卷选择");
  await axe(page, "1440");
  ok("1440：控件至少 44px，axe 无违规");
  await page.context().close();

  // 9. 390 宽：无横溢，axe、44px。
  const narrow = await open(390, 844);
  await workbench(narrow).waitFor();
  await noOverflow(narrow, "390 空表单");
  await narrow.getByRole("complementary", { name: "标本架" }).getByRole("radio", { name: `打开逆向记录 ${record.title}`, exact: true }).click();
  await candidates(narrow).waitFor();
  await noOverflow(narrow, "390 报告与候选");
  await atLeast44(button(workbench(narrow), "复制任务包"), "390 复制任务包");
  await atLeast44(pick(narrow, 3), "390 候选勾选");
  await narrow.screenshot({ path: "test-results/reverse-390.png", fullPage: true });
  await axe(narrow, "390");
  ok("390：无横向溢出，控件至少 44px，axe 无违规");
  await narrow.context().close();

  assert.deepEqual(errors, []);
  ok("全程无浏览器 JavaScript 异常");
} finally {
  await browser.close();
  await app.close();
}
