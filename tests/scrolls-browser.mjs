// 路线 v3 切片 1.3：焚决——建卷、条目增删改移、标签筛选、复制计次、回收区恢复、卷置顶。
import { createRequire } from "node:module";
import assert from "node:assert/strict";
import AxeBuilder from "@axe-core/playwright";
import { mkdir } from "node:fs/promises";
import { fixture } from "./fixture.mjs";
import { seed } from "../src/store.js";
const { chromium } = createRequire(import.meta.url)(
  process.env.PLAYWRIGHT_MODULE ||
    "/Users/nat/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright",
);
const app = await fixture();
await app.repository.write(seed(), { initialize: true });
await mkdir("test-results", { recursive: true });
const browser = await chromium.launch();
const errors = [];
const ok = (s) => console.log("PASS", s);

async function open(width, height = 1000) {
  const context = await browser.newContext({
    viewport: { width, height },
    reducedMotion: "reduce",
    permissions: ["clipboard-read", "clipboard-write"],
  });
  const page = await context.newPage();
  page.setDefaultTimeout(10000);
  page.on("pageerror", (e) => errors.push(`${width} ${e.message}`));
  await page.goto(app.url + "/#scrolls");
  await page.locator(".page-heading").waitFor();
  return page;
}
const button = (page, name) => page.getByRole("button", { name, exact: true });
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
const stored = async () => (await app.repository.read()).scrolls || [];
const scrollNamed = async (name) =>
  (await stored()).find((s) => s.name === name && !s.deletedAt);
const entryTexts = (page) =>
  page.locator(".scroll-entry .entry-text").allInnerTexts();
const scrollNames = (page) =>
  page.locator(".scroll-list .scroll-name").allInnerTexts();

try {
  const page = await open(1440);
  // 用户 2026-09-30 纠正：焚决是资产仓库里的一种资产类型，不单独占导航；迁入资产仓库前以 #scrolls 直达。
  assert.equal(
    await page.getByRole("navigation", { name: "主导航" }).getByRole("button", { name: /焚决/ }).count(),
    0,
  );
  await page.getByRole("heading", { name: "焚决", level: 1 }).waitFor();
  await page.getByText("还没有卷").waitFor();
  ok("焚决不单独占导航，#scrolls 可达，空库显示空状态");

  // 建卷：两卷；名称不能为空。
  const newName = page.getByLabel("新卷名称");
  await newName.fill("心法");
  await button(page, "新建卷").click();
  await until(async () => !!(await scrollNamed("心法")), "建卷 心法");
  await newName.fill("prompt 碎片");
  await newName.press("Enter");
  await until(async () => !!(await scrollNamed("prompt 碎片")), "建卷 prompt 碎片");
  assert.deepEqual(await scrollNames(page), ["心法", "prompt 碎片"]);
  await newName.fill("   ");
  assert.equal(await button(page, "新建卷").isDisabled(), true);
  ok("建卷两卷，按创建顺序排列；空名称不能提交");

  // 条目：新增三条（带标签），顺序即列表顺序。
  await button(page, "打开卷 心法").click();
  const body = page.getByLabel("新条目正文");
  const tags = page.getByLabel("新条目标签");
  const add = async (text, tagText) => {
    await body.fill(text);
    await tags.fill(tagText);
    await button(page, "加入此卷").click();
    await page.locator(".scroll-entry", { hasText: text }).waitFor();
  };
  await add("先定义问题，再给答案", "判断 核心");
  await add("证据不足时保留假设", "判断，验证");
  await add("小步可逆", "");
  assert.deepEqual(await entryTexts(page), [
    "先定义问题，再给答案",
    "证据不足时保留假设",
    "小步可逆",
  ]);
  const first = page.locator(".scroll-entry").first();
  assert.deepEqual(await first.locator(".entry-tag").allInnerTexts(), [
    "#判断",
    "#核心",
  ]);
  let s = await scrollNamed("心法");
  assert.deepEqual(s.entries.map((e) => e.tags), [
    ["判断", "核心"],
    ["判断", "验证"],
    [],
  ]);
  ok("条目新增三条，标签按空格或逗号拆分并醒目显示");

  // 编辑。
  await button(page, "编辑条目：证据不足时保留假设").click();
  await page.getByLabel("编辑条目正文").fill("证据不足时，保留假设和验证顺序");
  await page.getByLabel("编辑条目标签").fill("判断 验证 顺序");
  await button(page, "保存条目").click();
  await page
    .locator(".scroll-entry", { hasText: "证据不足时，保留假设和验证顺序" })
    .waitFor();
  s = await scrollNamed("心法");
  assert.equal(s.entries[1].text, "证据不足时，保留假设和验证顺序");
  assert.deepEqual(s.entries[1].tags, ["判断", "验证", "顺序"]);
  assert.equal(s.entries.length, 3, "条目不做版本：编辑是原地修改");
  ok("条目原地编辑正文与标签");

  // 上下移动；第一条不能上移、最后一条不能下移。
  assert.equal(await button(page, "上移条目：先定义问题，再给答案").isDisabled(), true);
  assert.equal(await button(page, "下移条目：小步可逆").isDisabled(), true);
  await button(page, "上移条目：小步可逆").click();
  await until(
    async () => (await entryTexts(page))[1] === "小步可逆",
    "上移",
  );
  await button(page, "下移条目：先定义问题，再给答案").click();
  await until(
    async () => (await entryTexts(page))[0] === "小步可逆",
    "下移",
  );
  const order = ["小步可逆", "先定义问题，再给答案", "证据不足时，保留假设和验证顺序"];
  assert.deepEqual(await entryTexts(page), order);
  await until(
    async () =>
      JSON.stringify((await scrollNamed("心法")).entries.map((e) => e.text)) ===
      JSON.stringify(order),
    "移动已保存",
  );
  await page.reload();
  await button(page, "打开卷 心法").click();
  assert.deepEqual(await entryTexts(page), order);
  ok("条目上移、下移，刷新后顺序一致");

  // 标签筛选。
  const filter = page.getByRole("group", { name: "按标签筛选" });
  await filter.getByRole("button", { name: "#核心", exact: true }).click();
  assert.deepEqual(await entryTexts(page), ["先定义问题，再给答案"]);
  assert.equal(
    await filter.getByRole("button", { name: "#核心", exact: true }).getAttribute("aria-pressed"),
    "true",
  );
  await filter.getByRole("button", { name: "#判断", exact: true }).click();
  assert.deepEqual(await entryTexts(page), [
    "先定义问题，再给答案",
    "证据不足时，保留假设和验证顺序",
  ]);
  await filter.getByRole("button", { name: "全部", exact: true }).click();
  assert.equal((await entryTexts(page)).length, 3);
  ok("按标签筛选，“全部”恢复");

  // 复制计次：复制成功才计一次。
  const copyFirst = button(page, "复制条目：先定义问题，再给答案");
  const usesOf = (text) =>
    page.locator(".scroll-entry", { hasText: text }).locator(".entry-uses-count").innerText();
  assert.equal(await usesOf("先定义问题，再给答案"), "0");
  await copyFirst.click();
  await until(async () => (await usesOf("先定义问题，再给答案")) === "1", "计次 1");
  assert.equal(
    await page.evaluate(() => navigator.clipboard.readText()),
    "先定义问题，再给答案",
  );
  await copyFirst.click();
  await until(async () => (await usesOf("先定义问题，再给答案")) === "2", "计次 2");
  await page.evaluate(() => {
    navigator.clipboard.writeText = () => Promise.reject(new Error("denied"));
  });
  await copyFirst.click();
  await page.getByRole("status").filter({ hasText: "无法访问剪贴板" }).waitFor();
  await page.waitForTimeout(300);
  assert.equal(await usesOf("先定义问题，再给答案"), "2");
  s = await scrollNamed("心法");
  assert.equal(s.entries.find((e) => e.text === "先定义问题，再给答案").uses, 2);
  assert.ok(s.entries.find((e) => e.text === "先定义问题，再给答案").lastUsedAt);
  assert.match(
    await page.locator(".scroll-entry", { hasText: "先定义问题，再给答案" }).innerText(),
    /已复制 2 次/,
  );
  await page.reload();
  await button(page, "打开卷 心法").click();
  ok("复制成功计次（2 次），剪贴板失败不计次");

  // 删除条目进回收区，恢复后回到原位置。
  await button(page, "删除条目：先定义问题，再给答案").click();
  await until(async () => (await entryTexts(page)).length === 2, "删除条目");
  const recycle = page.getByRole("button", { name: /^回收区/ });
  assert.match(await recycle.innerText(), /1/);
  await recycle.click();
  assert.equal(await recycle.getAttribute("aria-expanded"), "true");
  await button(page, "恢复条目：先定义问题，再给答案").click();
  await until(async () => (await entryTexts(page)).length === 3, "恢复条目");
  assert.deepEqual(await entryTexts(page), order);
  s = await scrollNamed("心法");
  assert.equal(s.entries.find((e) => e.text === "先定义问题，再给答案").deletedAt, undefined);
  assert.equal(s.entries.find((e) => e.text === "先定义问题，再给答案").uses, 2);
  ok("删除条目进回收区，恢复后位置与计次不变");

  // 卷置顶：置顶卷排第一，刷新后保持；取消后回到创建顺序。
  await atLeast44(button(page, "置顶卷 prompt 碎片"), "卷置顶按钮");
  await button(page, "置顶卷 prompt 碎片").click();
  await button(page, "取消置顶卷 prompt 碎片").waitFor();
  assert.deepEqual(await scrollNames(page), ["prompt 碎片", "心法"]);
  await until(async () => (await scrollNamed("prompt 碎片")).pinned === true, "置顶保存");
  await page.reload();
  await page.locator(".scroll-list .scroll-name").first().waitFor();
  assert.deepEqual(await scrollNames(page), ["prompt 碎片", "心法"]);
  assert.equal(
    await button(page, "取消置顶卷 prompt 碎片").getAttribute("aria-pressed"),
    "true",
  );
  ok("卷置顶排第一，刷新后保持");

  // 改名、删除卷进回收区、恢复。
  await button(page, "打开卷 心法").click();
  await button(page, "重命名卷").click();
  await page.getByLabel("卷名称", { exact: true }).fill("心法与准则");
  await button(page, "保存卷名").click();
  await until(async () => !!(await scrollNamed("心法与准则")), "改名");
  await button(page, "删除卷").click();
  await until(async () => (await scrollNames(page)).length === 1, "删除卷");
  assert.equal((await stored()).find((x) => x.name === "心法与准则").deletedAt !== undefined, true);
  await page.getByRole("button", { name: /^回收区/ }).click();
  await button(page, "恢复卷 心法与准则").click();
  await until(async () => (await scrollNames(page)).length === 2, "恢复卷");
  await button(page, "打开卷 心法与准则").click();
  assert.deepEqual(await entryTexts(page), order);
  ok("卷改名、删除进回收区并恢复，条目完整");

  // 键盘：Tab 从正文到标签到“加入此卷”，回车提交。
  await body.focus();
  await page.keyboard.type("键盘新增条目");
  await page.keyboard.press("Tab");
  assert.equal(await page.evaluate(() => document.activeElement.getAttribute("aria-label")), "新条目标签");
  await page.keyboard.type("键盘");
  await page.keyboard.press("Tab");
  assert.equal(await page.evaluate(() => document.activeElement.textContent.trim()), "加入此卷");
  await page.keyboard.press("Enter");
  await page.locator(".scroll-entry", { hasText: "键盘新增条目" }).waitFor();
  const focusVisible = await page.evaluate(() => {
    const el = document.querySelector(".scroll-entry button");
    el.focus();
    const style = getComputedStyle(el);
    return style.outlineStyle !== "none" || style.boxShadow !== "none";
  });
  assert.ok(focusVisible, "条目按钮获得焦点时应有可见焦点样式");
  ok("键盘可完成新增条目，按钮有可见焦点");

  // 44px：条目操作按钮。
  for (const name of [
    "复制条目：小步可逆",
    "上移条目：先定义问题，再给答案",
    "下移条目：小步可逆",
    "编辑条目：小步可逆",
    "删除条目：小步可逆",
    "新建卷",
    "加入此卷",
    "打开卷 心法与准则",
  ])
    await atLeast44(button(page, name), name);
  ok("焚决控件点击区域不小于 44px");
  await axe(page, "scrolls-1440");
  ok("axe 1440 无违规");
  await page.screenshot({
    path: "test-results/scrolls-1440.png",
    fullPage: false,
  });

  // 390 宽：无横向溢出，axe 无违规。
  const narrow = await open(390, 844);
  await narrow.locator(".scroll-list .scroll-name").first().waitFor();
  await button(narrow, "打开卷 心法与准则").click();
  await narrow.locator(".scroll-entry").first().waitFor();
  const overflow = await narrow.evaluate(
    () => document.documentElement.scrollWidth - window.innerWidth,
  );
  assert.ok(overflow <= 0, `390 宽横向溢出 ${overflow}px`);
  await atLeast44(button(narrow, "复制条目：小步可逆"), "390 复制按钮");
  await axe(narrow, "scrolls-390");
  await narrow.screenshot({ path: "test-results/scrolls-390.png", fullPage: false });
  ok("390 宽无横向溢出，axe 无违规");

  assert.deepEqual(errors, []);
  console.log("scrolls-browser: all passed");
} finally {
  await browser.close();
  await app.close();
}
