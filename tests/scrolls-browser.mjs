// 路线 v3 切片 1.3 / 1.3b：焚决是资产仓库的第五种类型（用户 2026-09-30 纠正），全部操作经由资产仓库——
// 建卷、条目增删改移、标签筛选、复制计次、回收区恢复、卷置顶；“焚决”类型标签与计数、“全部”中的焚决卡、
// 新建资产对话框六个类型、#scrolls 旧链接落到资产仓库焚决标签。
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
const initial = seed();
await app.repository.write(initial, { initialize: true });
const assetCount = initial.assets.filter((a) => !a.archived).length;
await mkdir("test-results", { recursive: true });
const browser = await chromium.launch();
const errors = [];
const ok = (s) => console.log("PASS", s);

async function open(width, height = 1000, hash = "assets") {
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
const button = (scope, name) => scope.getByRole("button", { name, exact: true }).or(scope.getByRole("radio", { name, exact: true }));
async function assertMinSize(locator, name, minimum = 44) {
  const box = await locator.boundingBox();
  assert.ok(box, `${name} 不可见`);
  assert.ok(
    box.width >= minimum && box.height >= minimum,
    `${name} 点击区域 ${box.width}x${box.height}，应至少 ${minimum}px`,
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
const types = (page) => page.getByRole("group", { name: "资产类型" });
// 类型标签：按钮文字是“名称 + 计数”。
const typeTab = (page, name) =>
  types(page).getByRole("button", { name: new RegExp(`^${name}\\s*\\d+$`) });
const tabCount = async (page, name) =>
  Number(await typeTab(page, name).locator("span").innerText());
const scrollCards = (page) => page.locator(".asset-grid .asset-card:has(.card-open.type-Scroll)");
const scrollNames = (page) => scrollCards(page).locator('.card-open.type-Scroll').evaluateAll(nodes => nodes.map(node => node.getAttribute('aria-label').slice('打开卷 '.length)));
const drawer = (page) => page.getByRole("dialog", { name: "焚决详情" });
const entryTexts = (page) =>
  drawer(page).locator(".scroll-entry .entry-text").allInnerTexts();
const openScroll = async (page, name) => {
  await button(page, `打开卷 ${name}`).click();
  await drawer(page).getByRole("heading", { name, level: 2 }).waitFor();
};
const closeDrawer = async (page) => {
  await button(drawer(page), "关闭").click();
  await drawer(page).waitFor({ state: "detached" });
};
const createDialog = (page) => page.getByRole("dialog", { name: "新建资产" });

try {
  // #scrolls 旧链接：落到资产仓库，自动选中“焚决”标签；焚决不单独占导航。
  const page = await open(1440, 1000, "scrolls");
  await page.getByRole("heading", { name: "资产仓库", level: 1 }).waitFor();
  assert.equal(new URL(page.url()).hash, "#assets");
  assert.equal(await typeTab(page, "焚决").getAttribute("aria-pressed"), "true");
  assert.equal(
    await page.getByRole("navigation", { name: "主导航" }).getByRole("button", { name: /焚决/ }).count(),
    0,
  );
  await page.getByText("还没有卷").waitFor();
  ok("#scrolls 旧链接落到资产仓库焚决标签；焚决不单独占导航；空库显示空状态");

  // 类型标签：全部、Skills、Prompts、工作流、规则、焚决。
  assert.deepEqual(
    await types(page).locator("button").evaluateAll((els) =>
      els.map((el) => el.firstChild.textContent.trim()),
    ),
    ["全部", "Prompts", "Skills", "工作流", "规则", "焚决"],
  );
  assert.equal(await tabCount(page, "焚决"), 0);
  ok("资产类型标签只保留常用类型与焚决，空库计数 0");

  // 新建资产对话框：六个类型在 1440 宽同一行；在焚决标签下打开时默认选中焚决，只需填卷名。
  await button(page, "新建").first().click();
  const dialog = createDialog(page);
  await dialog.waitFor();
  const picker = dialog.locator(".type-picker button");
  assert.deepEqual(await picker.allInnerTexts(), ["Prompt", "Skill", "工作流", "规则", "MCP", "焚决"]);
  const tops = await picker.evaluateAll((els) => els.map((el) => Math.round(el.getBoundingClientRect().top)));
  assert.equal(new Set(tops).size, 1, `六个类型应在同一行：${tops}`);
  assert.ok(await dialog.locator(".type-picker button.active", { hasText: "焚决" }).count());
  assert.equal(await dialog.getByLabel("一句话说明").count(), 0, "焚决只需卷名");
  await page.screenshot({ path: "test-results/scrolls-create-1440.png", fullPage: false });
  const nameInput = dialog.getByLabel("卷名", { exact: true });
  await nameInput.fill("   ");
  assert.equal(await button(dialog, "新建卷").isDisabled(), true);
  await nameInput.fill("心法");
  await button(dialog, "新建卷").click();
  await dialog.waitFor({ state: "detached" });
  await drawer(page).getByRole("heading", { name: "心法", level: 2 }).waitFor();
  await until(async () => !!(await scrollNamed("心法")), "建卷 心法");
  ok("新建资产六个类型同一行；选焚决只填卷名即可创建，空名称不能提交，创建后直接打开该卷");

  // 从“全部”标签新建第二卷：手动切到焚决类型，回车提交。
  await closeDrawer(page);
  await typeTab(page, "全部").click();
  await button(page, "新建").first().click();
  await createDialog(page).waitFor();
  await button(createDialog(page), "焚决").click();
  await createDialog(page).getByLabel("卷名", { exact: true }).fill("prompt 碎片");
  await createDialog(page).getByLabel("卷名", { exact: true }).press("Enter");
  await createDialog(page).waitFor({ state: "detached" });
  await drawer(page).getByRole("heading", { name: "prompt 碎片", level: 2 }).waitFor();
  await until(async () => !!(await scrollNamed("prompt 碎片")), "建卷 prompt 碎片");
  await closeDrawer(page);
  ok("在“全部”标签下选焚决类型建卷，回车提交");

  // “全部”同时显示资产卡与焚决卡，计数包含焚决。
  assert.equal(await tabCount(page, "焚决"), 2);
  assert.equal(await tabCount(page, "全部"), assetCount + 2);
  assert.equal(await scrollCards(page).count(), 2);
  assert.equal(
    await page.locator(".asset-grid .asset-card").count(),
    assetCount + 2,
    "全部应同时列出资产卡和焚决卡",
  );
  const card = scrollCards(page).filter({ hasText: "心法" });
  assert.equal(await card.locator("h3").innerText(), "焚决 · 心法");
  assert.equal(await card.locator(".scroll-preview-entry").count(), 0);
  assert.match(await card.locator(".scroll-preview-empty").innerText(), /这一卷还是空的/);
  ok("焚决标签计数 2；全部同时显示资产卡与精简焚决卡");

  // 焚决标签：默认“最近更新”，新卷在前。
  await typeTab(page, "焚决").click();
  assert.deepEqual(await scrollNames(page), ["prompt 碎片", "心法"]);
  assert.equal(await page.getByRole("combobox", {name:"按标签筛选"}).count(), 0, "焚决类型页无标签筛选");
  assert.equal(await page.locator(".asset-grid .asset-card").count(), 2, "焚决标签只列焚决卡");

  // 条目：名称与提示词全文，顺序即列表顺序。
  await openScroll(page, "心法");
  assert.match(await drawer(page).locator(".cover-code").innerText(), /^FJ\.01$/);
  const body = drawer(page).getByLabel("新条目提示词全文");
  const title = drawer(page).getByLabel("新条目名称");
  assert.equal(await drawer(page).getByLabel("新条目标签").count(), 0);
  const add = async (text) => {
    await title.fill(text);
    await body.fill(text);
    await button(drawer(page), "加入此卷").click();
    await drawer(page).locator(".scroll-entry", { hasText: text }).waitFor();
  };
  await add("先定义问题，再给答案");
  await add("证据不足时保留假设");
  await add("小步可逆");
  assert.deepEqual(await entryTexts(page), [
    "先定义问题，再给答案",
    "证据不足时保留假设",
    "小步可逆",
  ]);
  const first = drawer(page).locator(".scroll-entry").first();
  assert.equal(await first.locator(".entry-tag").count(), 0);
  let s = await scrollNamed("心法");
  assert.deepEqual(s.entries.map((e) => e.tags), [[], [], []]);
  assert.deepEqual(s.entries.map(e => e.name), ["先定义问题，再给答案", "证据不足时保留假设", "小步可逆"]);
  ok("抽屉新增三条，独立名称/正文持久化，标签入口已移除");

  // 编辑。
  await button(drawer(page), "编辑条目：证据不足时保留假设").click();
  await drawer(page).getByLabel("编辑条目提示词全文").fill("证据不足时，保留假设和验证顺序");
  await drawer(page).getByLabel("编辑条目名称").fill("证据校准");
  await button(drawer(page), "保存条目").click();
  await drawer(page).locator(".scroll-entry", { hasText: "证据不足时，保留假设和验证顺序" }).waitFor();
  s = await scrollNamed("心法");
  assert.equal(s.entries[1].text, "证据不足时，保留假设和验证顺序");
  assert.deepEqual(s.entries[1].tags, []);
  assert.equal(s.entries[1].name, "证据校准");
  assert.equal(s.entries.length, 3, "条目不做版本：编辑是原地修改");
  ok("条目原地编辑名称与正文");

  // 上下移动；第一条不能上移、最后一条不能下移。
  assert.equal(await button(drawer(page), "上移条目：先定义问题，再给答案").isDisabled(), true);
  assert.equal(await button(drawer(page), "下移条目：小步可逆").isDisabled(), true);
  await button(drawer(page), "上移条目：小步可逆").click();
  await until(async () => (await entryTexts(page))[1] === "小步可逆", "上移");
  await button(drawer(page), "下移条目：先定义问题，再给答案").click();
  await until(async () => (await entryTexts(page))[0] === "小步可逆", "下移");
  const order = ["小步可逆", "先定义问题，再给答案", "证据不足时，保留假设和验证顺序"];
  assert.deepEqual(await entryTexts(page), order);
  await until(
    async () =>
      JSON.stringify((await scrollNamed("心法")).entries.map((e) => e.text)) === JSON.stringify(order),
    "移动已保存",
  );
  await page.reload();
  await openScroll(page, "心法");
  assert.deepEqual(await entryTexts(page), order);
  ok("条目上移、下移，刷新后顺序一致");

  assert.equal(await drawer(page).getByRole("group", {name:"按标签筛选"}).count(), 0);
  assert.equal(await page.getByRole("combobox", {name:"按标签筛选"}).count(), 1, "刷新后的全部页保留普通资产标签筛选");
  assert.equal((await entryTexts(page)).length, 3);
  ok("焚决标签展示与筛选已移除");

  // 复制计次：复制成功才计一次；卡片封面次数 = 卷内条目复制次数之和。
  const copyFirst = button(drawer(page), "复制条目：先定义问题，再给答案");
  const usesOf = (text) =>
    drawer(page).locator(".scroll-entry", { hasText: text }).locator(".entry-uses-count").innerText();
  assert.equal(await usesOf("先定义问题，再给答案"), "0");
  await copyFirst.click();
  await until(async () => (await usesOf("先定义问题，再给答案")) === "1", "计次 1");
  assert.equal(await page.evaluate(() => navigator.clipboard.readText()), "先定义问题，再给答案");
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
    await drawer(page).locator(".scroll-entry", { hasText: "先定义问题，再给答案" }).innerText(),
    /已复制 2 次/,
  );
  await page.reload();
  const xinCard = scrollCards(page).filter({ hasText: "心法" });
  await xinCard.waitFor();
  assert.equal(await xinCard.locator(".scroll-preview-entry").count(), 3);
  const copiedRow = xinCard.locator('.scroll-preview-entry').filter({hasText:'先定义问题，再给答案'});
  assert.equal(await copiedRow.locator('.scroll-preview-uses').innerText(), '已复制 2 次');
  assert.equal(await copiedRow.locator('.scroll-preview-tags').count(), 0);
  ok("复制成功计次2次，剪贴板失败不计次；卡面直接呈现3条名称/正文及各自次数");

  // 删除条目进回收区；回收区在“焚决”标签下方，恢复后回到原位置。
  await typeTab(page, "焚决").click();
  await openScroll(page, "心法");
  await button(drawer(page), "删除条目：先定义问题，再给答案").click();
  await until(async () => (await entryTexts(page)).length === 2, "删除条目");
  await closeDrawer(page);
  const recycle = page.getByRole("button", { name: /^回收区/ });
  assert.match(await recycle.innerText(), /1/);
  const [toolbarBox, recycleBox] = await Promise.all([
    types(page).boundingBox(),
    recycle.boundingBox(),
  ]);
  assert.ok(recycleBox.y > toolbarBox.y, "回收区应在类型标签下方");
  await recycle.click();
  assert.equal(await recycle.getAttribute("aria-expanded"), "true");
  await button(page, "恢复条目：先定义问题，再给答案").click();
  await until(
    async () => (await scrollNamed("心法")).entries.every((e) => !e.deletedAt),
    "恢复条目",
  );
  await openScroll(page, "心法");
  assert.deepEqual(await entryTexts(page), order);
  s = await scrollNamed("心法");
  assert.equal(s.entries.find((e) => e.text === "先定义问题，再给答案").deletedAt, undefined);
  assert.equal(s.entries.find((e) => e.text === "先定义问题，再给答案").uses, 2);
  await closeDrawer(page);
  ok("删除条目进回收区（焚决标签下方），恢复后位置与计次不变");

  // 卷置顶：按钮与资产卡一致；置顶优先于任何排序，刷新后保持；“全部”中也排最前。
  await page.getByLabel("排序方式").selectOption("most");
  assert.deepEqual(await scrollNames(page), ["心法", "prompt 碎片"]);
  const pinButton = button(page, "置顶 prompt 碎片");
  await assertMinSize(pinButton, "卷置顶按钮", 32); // 用户389要求卡片三操作缩小。
  await pinButton.click();
  await button(page, "取消置顶 prompt 碎片").waitFor();
  assert.deepEqual(await scrollNames(page), ["prompt 碎片", "心法"]);
  await until(async () => (await scrollNamed("prompt 碎片")).pinned === true, "置顶保存");
  await page.reload();
  await typeTab(page, "全部").waitFor();
  assert.equal(
    await page.locator(".asset-grid .asset-card h3").first().innerText(),
    "焚决 · prompt 碎片",
    "“全部”中置顶的卷排最前",
  );
  await typeTab(page, "焚决").click();
  assert.deepEqual(await scrollNames(page), ["prompt 碎片", "心法"]);
  assert.equal(await button(page, "取消置顶 prompt 碎片").getAttribute("aria-pressed"), "true");
  ok("卷置顶排第一（优先于“最常用”排序），刷新后保持，“全部”中也排最前");

  // 页内搜索：按卷名、条目正文、独立名称筛到焚决卡。
  await typeTab(page, "全部").click();
  const search = page.getByLabel("在资产中搜索");
  await search.fill("碎片");
  await until(async () => (await scrollNames(page)).join() === "prompt 碎片", "按卷名搜索");
  await search.fill("小步可逆");
  await until(async () => (await scrollNames(page)).join() === "心法", "按条目正文搜索");
  await search.fill("证据校准");
  await until(async () => (await scrollNames(page)).join() === "心法", "按名称搜索");
  await search.fill("");
  ok("页内搜索按卷名、条目正文、独立名称筛到焚决卡");

  // 改名、删除卷进回收区、恢复。
  await typeTab(page, "焚决").click();
  await openScroll(page, "心法");
  await button(drawer(page), "重命名卷").click();
  await drawer(page).getByLabel("卷名称", { exact: true }).fill("心法与准则");
  await button(drawer(page), "保存卷名").click();
  await until(async () => !!(await scrollNamed("心法与准则")), "改名");
  await drawer(page).getByRole("heading", { name: "心法与准则", level: 2 }).waitFor();
  await button(drawer(page), "删除卷").click();
  await drawer(page).waitFor({ state: "detached" });
  await until(async () => (await scrollNames(page)).length === 1, "删除卷");
  assert.equal(await tabCount(page, "焚决"), 1, "计数只算未删除的卷");
  assert.equal((await stored()).find((x) => x.name === "心法与准则").deletedAt !== undefined, true);
  await page.getByRole("button", { name: /^回收区/ }).click();
  await button(page, "恢复卷 心法与准则").click();
  await until(async () => (await scrollNames(page)).length === 2, "恢复卷");
  await openScroll(page, "心法与准则");
  assert.deepEqual(await entryTexts(page), order);
  ok("卷改名、删除进回收区并恢复，条目完整");

  // 键盘：Tab 从名称到全文到“加入此卷”，回车提交。
  await title.focus();
  await page.keyboard.type("键盘新增条目");
  await page.keyboard.press("Tab");
  assert.equal(await page.evaluate(() => document.activeElement.getAttribute("aria-label")), "新条目提示词全文");
  await page.keyboard.type("键盘新增条目");
  await page.keyboard.press("Tab");
  assert.equal(await page.evaluate(() => document.activeElement.textContent.trim()), "加入此卷");
  await page.keyboard.press("Enter");
  await drawer(page).locator(".scroll-entry", { hasText: "键盘新增条目" }).waitFor();
  const focusVisible = await page.evaluate(() => {
    const el = document.querySelector(".scroll-entry button");
    el.focus();
    const style = getComputedStyle(el);
    return style.outlineStyle !== "none" || style.boxShadow !== "none";
  });
  assert.ok(focusVisible, "条目按钮获得焦点时应有可见焦点样式");
  ok("键盘可完成新增条目，按钮有可见焦点");

  // 44px：条目操作按钮与卷操作。
  for (const name of [
    "复制条目：小步可逆",
    "上移条目：先定义问题，再给答案",
    "下移条目：小步可逆",
    "编辑条目：小步可逆",
    "删除条目：小步可逆",
    "加入此卷",
    "重命名卷",
    "删除卷",
  ])
    await assertMinSize(button(drawer(page), name), name);
  ok("焚决控件点击区域不小于 44px");
  await axe(page, "scroll-drawer-1440");
  await page.screenshot({ path: "test-results/scrolls-drawer-1440.png", fullPage: false });
  await closeDrawer(page);
  // 截图前关掉提示条，免得遮住卡片。
  if (await button(page, "关闭提示").count()) await button(page, "关闭提示").click();
  await assertMinSize(button(page, "打开卷 心法与准则"), "焚决卡");
  await axe(page, "scrolls-tab-1440");
  await page.screenshot({ path: "test-results/scrolls-tab-1440.png", fullPage: false });
  await typeTab(page, "全部").click();
  await page.getByLabel("排序方式").selectOption("recent");
  await page.screenshot({ path: "test-results/scrolls-all-1440.png", fullPage: false });
  ok("axe 1440 无违规（抽屉、焚决标签）");

  // 第二版首页取消资产行；资产仓库入口与焚决数据仍须保留。
  await page.goto(`${app.url}/#home`);
  await page.locator('.hx').waitFor();
  await page.getByRole('button', {name:'新建'}).waitFor();
  assert.equal((await app.repository.read()).scrolls.filter(s=>!s.deletedAt).length,2);
  ok("首页新建资产入口保留，焚决 2 卷仍存于主库和资产仓库");

  // 390 宽：新建资产六个类型自动换行；焚决抽屉无横向溢出，axe 无违规。
  const narrow = await open(390, 844);
  await button(narrow, "新建").first().click();
  await createDialog(narrow).waitFor();
  const narrowTops = await createDialog(narrow)
    .locator(".type-picker button")
    .evaluateAll((els) => els.map((el) => Math.round(el.getBoundingClientRect().top)));
  assert.ok(new Set(narrowTops).size > 1, "窄屏六个类型应换行");
  assert.ok(
    (await narrow.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)) <= 0,
    "390 新建对话框横向溢出",
  );
  await button(createDialog(narrow), "取消").click();
  await typeTab(narrow, "焚决").click();
  await openScroll(narrow, "心法与准则");
  await drawer(narrow).locator(".scroll-entry").first().waitFor();
  const overflow = await narrow.evaluate(
    () => document.documentElement.scrollWidth - window.innerWidth,
  );
  assert.ok(overflow <= 0, `390 宽横向溢出 ${overflow}px`);
  await assertMinSize(button(drawer(narrow), "复制条目：小步可逆"), "390 复制按钮");
  await axe(narrow, "scrolls-390");
  await narrow.screenshot({ path: "test-results/scrolls-390.png", fullPage: false });
  ok("390 宽：新建类型换行，抽屉无横向溢出，axe 无违规");

  assert.deepEqual(errors, []);
  console.log("scrolls-browser: all passed");
} finally {
  await browser.close();
  await app.close();
}
