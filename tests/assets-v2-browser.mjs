// #93 资产仓库改版第一批（用户 2026-11-19 定稿）：
// 只留 Prompt / Design / Skill 三页；工作流、规则、焚决、MCP 不在界面出现，但数据原样保留；
// Prompt 与 Skill 共用分类芯片（含待归类），卡片右下角改分类并落库；NEW / HOT / UPD / IDLE 按数据点亮；
// 置顶 / 删除常驻、「复制全文」常驻；编辑器里可选分类；#scrolls 旧链接落到 Prompt。只验电脑宽度。
// #93 第二批（用户 2026-11-19）：Skill 页改为只读 my-skills（fixture 下为空、计数 0），原 Skill 资产不在 Skill 页出现、
// 数据保留并可从全局搜索打开详情；新建只给 Prompt / 设计。my-skills 卡片的分类芯片另见 assets-skill-browser。
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { chromium } from "playwright";
import { fixture } from "./fixture.mjs";
import { seed, makeAsset, current } from "../src/store.js";
import { createScroll, addEntry } from "../src/scrolls.js";
import { axe } from "./ui-v14-checks.mjs";

const app = await fixture();
const DAY = 864e5;
const iso = (daysAgo) => new Date(Date.now() - daysAgo * DAY).toISOString();
function asset(type, title, daysAgo, extra = {}) {
  const a = makeAsset({
    type, title, description: extra.description || "", content: extra.content ?? "合成正文", tags: [], source: "合成作者", files: [],
    ...(type === "Skill" ? { installUrl: "https://github.com/example/skills/tree/main/demo" } : {}),
    ...(type === "Design" ? { design: { kind: "prompt" } } : {}),
    ...(type === "MCP" ? { content: "", source: "个人创建", mcpConfig: { schema: 1, transport: "streamable-http", serverId: title, origin: "https://example.com", path: "/mcp", credentialEnvVar: null } } : {}),
  });
  a.createdAt = a.versions[0].at = iso(daysAgo);
  if (extra.category) a.category = extra.category;
  return a;
}
const think = asset("Prompt", "第一性原理拆问题", 40);
const dev = asset("Prompt", "代码交接", 2);
const loose = asset("Prompt", "随便写写", 50);
const pinned = asset("Prompt", "业务访谈", 20, { category: "biz" });
pinned.pinned = true;
const skill = asset("Skill", "追问计划", 10, { category: "think" });
const design = asset("Design", "像素封面", 3, { content: "16 色像素风" });
const hidden = [asset("Workflow", "隐藏的工作流", 5), asset("Rule", "隐藏的规则", 5), asset("MCP", "hidden_mcp", 5)];
const made = createScroll([], "隐藏的焚决");
const scrolls = addEntry(made.scrolls, made.scroll.id, "一条心法", []).scrolls;
let state = await app.repository.write({ ...seed(), assets: [think, dev, loose, pinned, skill, design, ...hidden], scrolls }, { initialize: true });

// HOT：近 30 天复制 ≥ 5 次，只能经专用接口追加使用记录。
const { token } = await (await fetch(app.url + "/api/session", { headers: { "x-workbench-client": "1" } })).json();
for (let i = 0; i < 5; i++) {
  const res = await fetch(app.url + "/api/asset-activity", {
    method: "POST", headers: { "x-workbench-token": token, "content-type": "application/json" },
    body: JSON.stringify({ id: randomUUID(), assetId: pinned.id, versionId: current(pinned).id, kind: "use", action: "copy-prompt", usedAt: iso(i + 1), expectedRevision: state.revision }),
  });
  assert.equal(res.status, 200);
  state = (await res.json()).state;
}

const browser = await chromium.launch();
const errors = [];
const ok = (s) => console.log("PASS", s);
const card = (page, title) => page.locator(".ac2", { has: page.getByRole("button", { name: `查看 ${title}`, exact: true }) });
const titles = (page) => page.locator(".ac2 h3").allInnerTexts();
const chip = (page, name) => page.locator(".ac2-chips").getByRole("button", { name: new RegExp(`^${name}`) });
const saved = async () => app.repository.read();

try {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: "reduce", permissions: ["clipboard-read", "clipboard-write"] });
  const page = await context.newPage();
  page.setDefaultTimeout(10000);
  page.on("pageerror", (e) => errors.push(e.message));

  // #scrolls 旧链接落到资产仓库 Prompt 页；页签只剩三个。
  await page.goto(app.url + "/#scrolls");
  await page.locator(".ac2").first().waitFor();
  const tabs = page.getByRole("group", { name: "资产类型" }).getByRole("button");
  assert.deepEqual((await tabs.allInnerTexts()).map((t) => t.replace(/\s+\d+$/, "").trim()), ["Prompt", "Design", "Skill"]);
  assert.equal(await page.getByRole("button", { name: /^Prompt/ }).first().getAttribute("aria-pressed"), "true");
  for (const gone of ["全部", "工作流", "规则", "焚决", "MCP"])
    assert.equal(await tabs.filter({ hasText: gone }).count(), 0, `页签 ${gone} 应已去掉`);
  assert.equal(await page.getByRole("navigation", { name: "主导航" }).getByRole("button", { name: /资产仓库/ }).innerText().then((t) => t.match(/\d+/)?.[0]), "5", "导航计数只算三类（#93 第二批：Prompt 4 + Design 1 + my-skills 0，原 Skill 资产不计入）");
  for (const t of ["隐藏的工作流", "隐藏的规则", "hidden_mcp", "隐藏的焚决"]) assert.equal(await page.getByText(t).count(), 0, `${t} 不应出现在资产仓库`);
  ok("三页、旧链接落到 Prompt、其余类型不在界面出现");

  // 置顶排最前；分类芯片：全部 + 有内容的分类 + 待归类，计数正确。
  assert.deepEqual(await titles(page), ["业务访谈", "代码交接", "第一性原理拆问题", "随便写写"]);
  assert.deepEqual(
    (await page.locator(".ac2-chips button").allInnerTexts()).map((t) => t.replace(/\s+/g, "")),
    ["全部4", "思考决策1", "业务落地1", "开发工程1", "待归类1"],
  );
  await chip(page, "思考决策").click();
  assert.deepEqual(await titles(page), ["第一性原理拆问题"]);
  await chip(page, "待归类").click();
  assert.deepEqual(await titles(page), ["随便写写"]);
  ok("分类芯片筛选与待归类");

  // 卡片右下角改分类：落库为 category，不产生新版本；再改回自动归组时删掉字段。
  await page.getByLabel("随便写写 的分类").selectOption({ label: "复盘与知识" });
  await page.waitForFunction(() => !document.querySelector(".ac2-chips button.wait:not([disabled])"));
  let after = (await saved()).assets.find((a) => a.id === loose.id);
  assert.equal(after.category, "retro");
  assert.equal(after.versions.length, 1);
  await chip(page, "全部").click();
  assert.equal(await card(page, "随便写写").locator(".ac2-cat span").innerText(), "复盘与知识");
  await page.getByLabel("随便写写 的分类").selectOption({ value: "" });
  await page.locator(".ac2-chips button.wait:not([disabled])").waitFor();
  after = (await saved()).assets.find((a) => a.id === loose.id);
  assert.equal("category" in after, false);
  ok("卡片改分类落库、改回自动归组");

  // 状态标识：NEW（2 天）、HOT（5 次）、IDLE（40 天未用）；颜色固定。
  const badges = async (title) => card(page, title).locator(".ac2-badge").allInnerTexts();
  assert.deepEqual(await badges("代码交接"), ["NEW"]);
  assert.deepEqual(await badges("业务访谈"), ["HOT"]);
  assert.deepEqual(await badges("第一性原理拆问题"), ["IDLE"]);
  assert.equal(await card(page, "业务访谈").locator(".ac2-uses").innerText().then((t) => t.replace(/\s+/g, "")), "5次");
  const bg = (title) => card(page, title).locator(".ac2-badge").evaluate((el) => getComputedStyle(el).backgroundColor);
  assert.equal(await bg("代码交接"), "rgb(77, 227, 255)");
  assert.equal(await bg("业务访谈"), "rgb(255, 107, 107)");
  ok("状态标识按数据点亮、颜色固定");

  // 置顶 / 删除 / 复制全文常驻（不悬停也可见）；分类色只用在图标、标签、荧光笔。
  await page.mouse.move(0, 0);
  const c = card(page, "代码交接");
  for (const name of ["置顶 代码交接", "删除 代码交接", "复制全文 代码交接"]) {
    const control = page.getByRole("button", { name, exact: true });
    assert.equal(await control.evaluate((el) => getComputedStyle(el).opacity), "1", `${name} 应常驻`);
    assert.ok(await control.isVisible());
  }
  assert.equal(await c.locator(".asset-copy-labeled").innerText(), "复制全文");
  const colors = await c.evaluate((el) => ({
    tc: getComputedStyle(el).getPropertyValue("--tc").trim(),
    inner: getComputedStyle(el.querySelector(".card-open")).getPropertyValue("--tc").trim(),
    copy: getComputedStyle(el.querySelector(".asset-copy-labeled")).color,
  }));
  assert.equal(colors.tc, "#6fb0ff", "开发工程 = --blue");
  assert.equal(colors.inner, colors.tc, "卡内 --tc 不应被旧的 .type-Prompt 类型色覆盖");
  ok("三项操作常驻、分类色不被类型色覆盖");

  // 复制全文：写剪贴板并计一次使用。
  await page.getByRole("button", { name: "复制全文 代码交接", exact: true }).click();
  await page.waitForFunction(() => navigator.clipboard.readText().then((t) => t === "合成正文"));
  await c.locator(".ac2-uses").filter({ hasText: "1" }).waitFor();
  ok("复制全文并计次");

  // #93 第二批：Skill 页只读 my-skills（fixture 下为空，页签计数 0），原 Skill 资产「追问计划」不再出现；
  // 「Skill 共用分类」改由 assets-skill-browser 用合成 my-skills 验，这里验旧 Skill 资产不在 Skill 页、详情仍能从全局搜索打开且分类数据保留。
  await page.getByRole("button", { name: /^Skill/ }).first().click();
  assert.equal(await page.getByRole("group", { name: "资产类型" }).getByRole("button", { name: /^Skill/ }).innerText().then((t) => t.match(/\d+/)?.[0]), "0", "Skill 页签计数只算 my-skills");
  assert.deepEqual(await titles(page), []);
  assert.equal(await card(page, "追问计划").count(), 0, "原 Skill 资产不在 Skill 页");
  await page.getByText("读不到 my-skills").first().waitFor();
  await page.keyboard.press("Meta+k");
  await page.getByLabel("全局搜索").fill("追问计划");
  await page.locator('.search-results[aria-busy="false"]').waitFor();
  await page.getByRole("dialog", { name: "搜索工作台" }).getByRole("button", { name: /追问计划/ }).click();
  const skillDetail = page.getByRole("dialog", { name: "资产详情", exact: true });
  await skillDetail.getByRole("heading", { name: "追问计划" }).waitFor();
  await skillDetail.press("Escape");
  await skillDetail.waitFor({ state: "detached" });
  assert.equal((await saved()).assets.find((a) => a.id === skill.id).category, "think", "原 Skill 资产分类数据保留");
  await page.getByRole("button", { name: /^Design/ }).first().click();
  assert.deepEqual(await titles(page), ["像素封面"]);
  assert.equal(await page.locator(".ac2-chips").count(), 0);
  assert.equal(await page.getByLabel("像素封面 的分类").count(), 0);
  ok("原 Skill 资产不在 Skill 页、可从搜索打开；Design 不分类");

  // 编辑器：新建只给 Prompt / 设计（#93 第二批去掉 Skill）；Prompt 可选分类并落库。
  await page.getByRole("button", { name: /^Prompt/ }).first().click();
  await page.getByRole("button", { name: "新建" }).first().click();
  const dialog = page.getByRole("dialog");
  assert.deepEqual(await dialog.getByRole("radiogroup", { name: "资产类型" }).getByRole("radio").allInnerTexts(), ["Prompt", "设计"]);
  await dialog.getByLabel("名称").fill("新建的提示词");
  await dialog.getByLabel("提示词全文").fill("新正文");
  await dialog.getByLabel("分类").selectOption({ label: "设计表达" });
  await dialog.getByRole("button", { name: "保存资产" }).click();
  await dialog.waitFor({ state: "detached" });
  const created = (await saved()).assets.find((a) => current(a).title === "新建的提示词");
  assert.equal(created.category, "design");
  ok("编辑器新建只给 Prompt / 设计、可选分类");

  await axe(page, "资产仓库 1440");

  // 其余类型的数据原样保留（#93 第二批：原 Skill 资产也一并核对）。
  const final = await saved();
  for (const h of [...hidden, skill]) assert.deepEqual(final.assets.find((a) => a.id === h.id), state.assets.find((a) => a.id === h.id));
  assert.deepEqual(final.scrolls, state.scrolls);
  ok("工作流、规则、MCP、焚决、原 Skill 资产数据原样保留");

  assert.deepEqual(errors, []);
  await context.close();
} finally {
  await browser.close();
  await app.close();
}
console.log("PASS assets-v2: 三页、分类、状态标识、常驻操作、隐藏类型数据保留");
