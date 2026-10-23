// 路线 v3 切片 1.1：置顶、封面计次、“最常用”排序、顶栏 ⌘K 搜索、新建对话框类型一行、规则图标。
import { createRequire } from "node:module";
import assert from "node:assert/strict";
import AxeBuilder from "@axe-core/playwright";
import { fixture } from "./fixture.mjs";
import { seed, current, makeAsset } from "../src/store.js";
const { chromium } = createRequire(import.meta.url)(
  process.env.PLAYWRIGHT_MODULE ||
    "/Users/nat/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright",
);
const app = await fixture();
const state = seed();
// 演示资产里没有规则，补一份合成规则用于图标与置顶检查。
state.assets.push(
  makeAsset({
    type: "Rule",
    title: "合成协同规则",
    description: "测试用规则模板",
    content: "## 入口\n先读 CURRENT.md。",
    tags: ["协同"],
  }),
);
const initial = await app.repository.write(state, { initialize: true });
const browser = await chromium.launch();
const errors = [];
const passed = [];
const ok = (s) => {
  passed.push(s);
  console.log("PASS", s);
};
const byTitle = (title) =>
  initial.assets.find((a) => current(a).title === title);
const workflow = byTitle("把经验，留在知识里");
const prompt = initial.assets.find((a) => a.type === "Prompt" && !a.favorite);
const rule = byTitle("合成协同规则");
const favored = initial.assets.filter((a) => a.favorite);
assert.ok(favored.length > 0, "演示资产应有默认 favorite=true 的项目");

async function open(width, height = 1000) {
  const context = await browser.newContext({
    viewport: { width, height },
    reducedMotion: "reduce",
    permissions: ["clipboard-read", "clipboard-write"],
  });
  const page = await context.newPage();
  page.setDefaultTimeout(10000);
  page.on("pageerror", (e) => errors.push(`${width} ${e.message}`));
  await page.goto(app.url + "/#assets");
  await page.locator(".asset-card").first().waitFor();
  return page;
}
const button = (page, name) => page.getByRole("button", { name, exact: true });
const firstTitle = (page) => page.locator(".asset-card h3").first().innerText();
const titles = (page) => page.locator(".asset-card h3").allInnerTexts();
const size = async (locator) => {
  const box = await locator.boundingBox();
  assert.ok(box, "控件不可见");
  return box;
};
async function assertMinSize(locator, name, minimum = 44) {
  const { width, height } = await size(locator);
  assert.ok(width >= minimum && height >= minimum, `${name} 点击区域 ${width}x${height}，应至少 ${minimum}px`);
}
const coverUses = (page, a) =>
  page
    .locator(".asset-card", { has: button(page, `查看 ${current(a).title}`) })
    .locator(".cover-uses")
    .innerText();
async function axe(page, label) {
  const result = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
    .analyze();
  assert.deepEqual(
    result.violations.map((v) => `${label}: ${v.id} ${v.nodes.map((n) => n.target).join(" ")}`),
    [],
  );
}

try {
  const page = await open(1440);
  // 收藏入口已去掉；默认 favorite=true 的演示资产不会被当成置顶。
  assert.equal(await page.getByRole("button", { name: "只看收藏" }).count(), 0);
  assert.equal(await page.getByText("从未使用", { exact: true }).count(), 0);
  for (const a of favored)
    assert.equal(
      await button(page, `置顶 ${current(a).title}`).getAttribute("aria-pressed"),
      "false",
    );
  assert.match(await page.locator(".collection-meta").innerText(), /当前结果 · 7/);
  assert.doesNotMatch(await page.locator(".collection-meta").innerText(), /置顶/);
  ok("去掉收藏；favorite=true 不等于置顶");

  // 排序菜单顺序。
  assert.deepEqual(
    await page.getByLabel("排序方式").locator("option").allInnerTexts(),
    ["最近更新", "最常用", "最近使用", "名称排序"],
  );
  ok("排序菜单：最近更新、最常用、最近使用、名称排序");

  // 置顶一个工作流：在全部与工作流标签、所有排序下都排第一，刷新后保持。
  const pin = button(page, `置顶 ${current(workflow).title}`);
  await assertMinSize(pin, "置顶按钮", 32); // 用户389要求缩小卡片操作，其他控件仍44px。
  await pin.click();
  const unpin = button(page, `取消置顶 ${current(workflow).title}`);
  await unpin.waitFor();
  assert.equal(await unpin.getAttribute("aria-pressed"), "true");
  const pinnedOf = async (a) =>
    (await app.repository.read()).assets.find((x) => x.id === a.id).pinned;
  for (let i = 0; i < 50 && (await pinnedOf(workflow)) !== true; i++)
    await page.waitForTimeout(100);
  assert.equal(await pinnedOf(workflow), true);
  assert.match(await page.locator(".collection-meta").innerText(), /当前结果 · 7 · 置顶 1/);
  for (const sort of ["recent", "most", "used", "name"]) {
    await page.getByLabel("排序方式").selectOption(sort);
    assert.equal(await firstTitle(page), current(workflow).title, `全部 · ${sort}`);
  }
  await button(page, "工作流 2").click();
  for (const sort of ["recent", "most", "used", "name"]) {
    await page.getByLabel("排序方式").selectOption(sort);
    assert.equal(await firstTitle(page), current(workflow).title, `工作流 · ${sort}`);
  }
  await page.reload();
  await page.locator(".asset-card").first().waitFor();
  assert.equal(await firstTitle(page), current(workflow).title);
  await button(page, "全部 7").click();
  assert.equal(await firstTitle(page), current(workflow).title);
  assert.equal(
    await button(page, `取消置顶 ${current(workflow).title}`).getAttribute("aria-pressed"),
    "true",
  );
  ok("置顶后在全部与类型标签、所有排序下都排第一，刷新后保持");

  // 封面计次：复制一次后 +1，读屏文字同步。
  assert.equal(await coverUses(page, prompt), "0");
  await button(page, `查看 ${current(prompt).title}`).click();
  await button(page, "复制全文").click();
  await page.getByText("使用记录已保存", { exact: true }).waitFor();
  await page.waitForFunction(
    () => !document.querySelector(".asset-usage button:disabled"),
  );
  await button(page, "关闭").click();
  await page.getByRole("dialog", { name: "资产详情" }).waitFor({ state: "hidden" });
  assert.equal(await coverUses(page, prompt), "1");
  assert.equal(
    await page
      .locator(".asset-card", { has: button(page, `查看 ${current(prompt).title}`) })
      .getByText("使用 1 次", { exact: true })
      .count(),
    1,
  );
  ok("复制一次后封面数字 +1");

  // 置顶项之间按使用次数降序：再置顶已用过一次的 Prompt，它排到工作流前面。
  await button(page, `置顶 ${current(prompt).title}`).click();
  await button(page, `取消置顶 ${current(prompt).title}`).waitFor();
  assert.deepEqual((await titles(page)).slice(0, 2), [
    current(prompt).title,
    current(workflow).title,
  ]);
  assert.match(await page.locator(".collection-meta").innerText(), /置顶 2/);
  ok("置顶项之间按使用次数降序");

  // 最常用：取消全部置顶后，按次数降序。
  await button(page, `取消置顶 ${current(prompt).title}`).click();
  await button(page, `置顶 ${current(prompt).title}`).waitFor();
  await button(page, `取消置顶 ${current(workflow).title}`).click();
  await button(page, `置顶 ${current(workflow).title}`).waitFor();
  await page.getByLabel("排序方式").selectOption("most");
  assert.equal(await firstTitle(page), current(prompt).title);
  ok("最常用排序");

  // 规则图标：卡片封面是像素图，小角标也换成像素版。
  const ruleCard = page.locator(".asset-card", {
    has: button(page, `查看 ${current(rule).title}`),
  });
  assert.equal(await ruleCard.locator(".cover svg.pixel").count(), 1);
  assert.equal(await ruleCard.locator(".card-type svg.pixel").count(), 1);
  ok("规则卡片封面与小角标均为像素图标");

  // 顶栏搜索：展开为可读搜索入口，至少 44px，位于待处理按钮旁。
  const search = page.locator(".topbar").getByRole("button", { name: "搜索", exact: true });
  await assertMinSize(search, "顶栏搜索按钮");
  assert.match(await search.innerText(), /搜索工作台/);
  assert.match(await search.innerText(), /⌘K/);
  assert.equal(
    await search.evaluate((el) => el.nextElementSibling?.classList.contains("topbar-inbox")),
    true,
  );
  await search.click();
  await page.getByRole("dialog", { name: "搜索工作台" }).waitFor();
  await page.keyboard.press("Escape");
  await page.getByRole("dialog", { name: "搜索工作台" }).waitFor({ state: "hidden" });
  await page.keyboard.press("Meta+k");
  await page.getByRole("dialog", { name: "搜索工作台" }).waitFor();
  await page.keyboard.press("Escape");
  await page.getByRole("dialog", { name: "搜索工作台" }).waitFor({ state: "hidden" });
  ok("顶栏搜索：完整提示 + ⌘K，至少 44px，点击与 ⌘K 都能打开浮层");

  // 带置顶卡片时的无障碍扫描。
  await button(page, `置顶 ${current(rule).title}`).click();
  await button(page, `取消置顶 ${current(rule).title}`).waitFor();
  await axe(page, "assets");

  // 新建资产：六个类型同一行（切片 1.3b 加入焚决，用户 2026-09-30 纠正）。
  await button(page, "新建").click();
  const types = page.locator(".type-picker button");
  assert.equal(await types.count(), 6);
  const tops = [];
  for (let i = 0; i < 6; i++) tops.push(Math.round((await size(types.nth(i))).y));
  assert.equal(new Set(tops).size, 1, `类型按钮不在同一行：${tops.join(",")}`);
  await axe(page, "create-dialog");
  await page.keyboard.press("Escape");
  ok("1440 宽时六个类型按钮同一行；axe 无违规");

  // 390 宽：无横向溢出，控件仍至少 44px。
  const narrow = await open(390, 844);
  assert.equal(
    await narrow.evaluate(() => document.documentElement.scrollWidth - innerWidth),
    0,
  );
  await assertMinSize(
    narrow.locator(".topbar").getByRole("button", { name: "搜索", exact: true }),
    "窄屏搜索按钮",
  );
  await assertMinSize(button(narrow, `取消置顶 ${current(rule).title}`), "窄屏置顶按钮", 32);
  await button(narrow, "新建").click();
  assert.equal(
    await narrow.evaluate(() => document.documentElement.scrollWidth - innerWidth),
    0,
  );
  await axe(narrow, "narrow");
  ok("390 宽无横向溢出");

  assert.deepEqual(errors, []);
  console.log(`assets-pin-browser: ${passed.length} passed`);
} finally {
  await browser.close();
  await app.close();
}
