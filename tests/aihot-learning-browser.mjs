// 路线 v3 切片 5.3 AI HOT + 5.4 学习成长（浏览器回归，桩数据，不访问外网）：
// 首次拉取前的访问说明；精选 / 热点 / 日报三个标签；原文新标签打开（noopener noreferrer）；不可信链接不渲染；
// 世界总览“今日热点”卡（尚未拉取 → 3–5 条）；收藏到学习与重复提示；拉取失败保留旧内容；关闭网络访问；
// 设置里指定书架文件夹；书架只读索引与三种学习状态；链接收藏手动添加、状态、删除进回收与恢复；44px、axe、390 无横溢。
import { createRequire } from "node:module";
import assert from "node:assert/strict";
import AxeBuilder from "@axe-core/playwright";
import { mkdir, mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fixture } from "./fixture.mjs";
import { seed } from "../src/store.js";
const { chromium } = createRequire(import.meta.url)(
  process.env.PLAYWRIGHT_MODULE ||
    "/Users/nat/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright",
);

const BASE = "https://aihot.news/api/v1/";
const item = (title, n, extra = {}) => ({
  title,
  summary: `${title} 的摘要`,
  url: `https://news.example.com/${n}`,
  source: "合成来源",
  published_at: "2026-09-30T06:00:00Z",
  ...extra,
});
const SELECTED = [
  item("精选一：新模型发布", "s1"),
  item("精选二：开源工具更新", "s2"),
  item("精选三：恶意链接", "s3", { url: "javascript:alert(1)", onclick: "steal()" }),
];
const HOT = Array.from({ length: 6 }, (_, i) => item(`热点${i + 1}`, `h${i + 1}`));
const DAILY = [item("日报一：模型", "d1"), item("日报二：产品", "d2")];
let failing = false;
const calls = [];
const json = (body, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
async function aihotFetch(url, options) {
  calls.push(String(url));
  assert.ok(String(url).startsWith(BASE), `只应访问 aihot.news：${url}`);
  assert.equal(options?.redirect, "error");
  if (failing) throw new TypeError("fetch failed");
  const key = String(url).slice(BASE.length);
  if (key === "items?mode=selected&window=24h") return json({ data: { items: SELECTED } });
  if (key === "hot-topics") return json({ topics: HOT });
  if (key === "dailies?limit=1") return json({ data: [{ date: "2026-09-30" }] });
  if (key === "dailies/2026-09-30") return json({ date: "2026-09-30", sections: [{ items: DAILY }] });
  return json({}, 404);
}
globalThis.fetch = () => {
  throw new Error("测试不得访问外网");
};

const app = await fixture({ discovery: { aihotFetch } });
await app.repository.write(seed(), { initialize: true });
const shelfDir = await mkdtemp(join(tmpdir(), "guiji-shelf-"));
await mkdir(join(shelfDir, "机器学习"));
await writeFile(join(shelfDir, "深度学习入门.pdf"), "%PDF-1.4 synthetic");
await writeFile(join(shelfDir, "机器学习", "统计学习方法.epub"), "epub synthetic");
await writeFile(join(shelfDir, "说明.txt"), "not a book");
await mkdir("test-results", { recursive: true });
const browser = await chromium.launch();
const errors = [];
const ok = (s) => console.log("PASS", s);

async function open(width, hash, height = 1000) {
  const context = await browser.newContext({ viewport: { width, height }, reducedMotion: "reduce" });
  const page = await context.newPage();
  page.setDefaultTimeout(10000);
  page.on("pageerror", (e) => errors.push(`${width} ${e.message}`));
  await page.goto(`${app.url}/#${hash}`);
  await page.locator("main h1").first().waitFor();
  return page;
}
const button = (scope, name) => scope.getByRole("button", { name, exact: true });
async function atLeast44(locator, name) {
  const box = await locator.boundingBox();
  assert.ok(box, `${name} 不可见`);
  assert.ok(box.width >= 44 && box.height >= 44, `${name} 点击区域 ${box.width}x${box.height}，应至少 44px`);
}
async function axe(page, label) {
  const result = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
  assert.deepEqual(
    result.violations.map((v) => `${label}: ${v.id} ${v.nodes.map((n) => n.target).join(" ")}`),
    [],
  );
}
async function noOverflow(page, label) {
  const over = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
  assert.ok(over <= 0, `${label} 横向溢出 ${over}px`);
}
async function until(check, label) {
  for (let i = 0; i < 50; i++) {
    if (await check()) return;
    await new Promise((r) => setTimeout(r, 100));
  }
  assert.fail(`等待超时：${label}`);
}
async function toast(page, pattern) {
  const t = page.locator(".toast").last();
  await t.waitFor();
  assert.match(await t.innerText(), pattern);
  await button(t, "关闭提示").click();
  await t.waitFor({ state: "detached" });
}
const stored = async () => (await app.repository.read()).learning || { folders: [], books: [], links: [] };
const tabs = (page) => page.getByRole("group", { name: "AI HOT 分类" });
const tab = (page, name) => tabs(page).getByRole("button", { name: new RegExp(`^${name}\\s*\\d+$`) });
const listTitles = (page) => page.locator(".hot-list .hot-item h3").allInnerTexts();
const hotCard = (page) => page.locator("section.home-hot");

try {
  // 1. 首次拉取前：世界总览热点卡如实显示“尚未拉取”，AI HOT 页先说明将访问的公开接口，不自动访问。
  const page = await open(1440, "home");
  await hotCard(page).getByRole("heading", { name: "今日热点" }).waitFor();
  await hotCard(page).getByText("尚未拉取").waitFor();
  assert.equal(await hotCard(page).locator("a").count(), 0);
  await page.goto(`${app.url}/#aihot`);
  await page.getByRole("heading", { name: "AI HOT", level: 1 }).waitFor();
  assert.equal(await page.locator(".nav-item", { hasText: "AI HOT" }).locator(".nav-flag.planned").count(), 0);
  const notice = page.getByRole("note", { name: "访问说明" });
  assert.match(await notice.innerText(), /将访问 aihot\.news 公开接口/);
  assert.match(await page.locator(".aihot-status").innerText(), /尚未拉取/);
  assert.equal(calls.length, 0, "未点击前不应访问接口");
  await new Promise((r) => setTimeout(r, 300));
  assert.equal(calls.length, 0, "未点击前不应访问接口");
  ok("首次拉取前：首页热点卡显示“尚未拉取”，AI HOT 页说明将访问 aihot.news 公开接口，未发出任何请求");

  // 2. 开始拉取 → 三个标签。
  const start = button(page, "开始拉取");
  await atLeast44(start, "开始拉取");
  await start.click();
  await until(async () => /更新于/.test(await page.locator(".aihot-status").innerText()), "拉取完成");
  assert.equal(calls.length, 4);
  assert.deepEqual(
    await tabs(page).locator("button").evaluateAll((els) => els.map((el) => el.firstChild.textContent.trim())),
    ["精选", "热点", "日报"],
  );
  assert.equal(await tab(page, "精选").getAttribute("aria-pressed"), "true");
  assert.deepEqual(await listTitles(page), SELECTED.map((i) => i.title));
  const first = page.locator(".hot-item").first();
  const link = first.locator("h3 a");
  assert.equal(await link.getAttribute("href"), "https://news.example.com/s1");
  assert.equal(await link.getAttribute("target"), "_blank");
  assert.deepEqual((await link.getAttribute("rel")).split(/\s+/).sort(), ["noopener", "noreferrer"]);
  assert.match(await first.innerText(), /合成来源/);
  assert.match(await first.innerText(), /精选一：新模型发布 的摘要/);
  assert.ok(await first.locator("time").count(), "应显示时间");
  // 不可信链接：标题照常显示，但不渲染成链接；页面里没有任何 javascript: 链接。
  const evil = page.locator(".hot-item", { hasText: "精选三：恶意链接" });
  assert.equal(await evil.locator("a").count(), 0);
  assert.equal(await page.locator('a[href^="javascript"], [onclick]').count(), 0);
  for (const name of ["精选", "热点", "日报"]) await atLeast44(tab(page, name), `${name} 标签`);
  await tab(page, "热点").click();
  assert.equal(await tab(page, "热点").getAttribute("aria-pressed"), "true");
  assert.deepEqual(await listTitles(page), HOT.map((i) => i.title));
  await tab(page, "日报").click();
  assert.deepEqual(await listTitles(page), DAILY.map((i) => i.title));
  assert.match(await page.locator("main").innerText(), /2026-09-30/);
  await axe(page, "aihot 1440");
  ok("开始拉取后：精选 / 热点 / 日报三个标签切换正确，标题新标签打开原文（noopener noreferrer），不可信链接不渲染");

  // 3. 收藏到学习：写入链接收藏；重复收藏提示已收藏。
  await tab(page, "精选").click();
  const collect = button(page, "收藏到学习：精选一：新模型发布");
  await atLeast44(collect, "收藏到学习");
  await collect.click();
  await toast(page, /已收藏到学习成长/);
  await until(async () => (await stored()).links.length === 1, "收藏写入主库");
  const saved = (await stored()).links[0];
  assert.equal(saved.title, "精选一：新模型发布");
  assert.equal(saved.url, "https://news.example.com/s1");
  assert.equal(saved.summary, "精选一：新模型发布 的摘要");
  assert.equal(saved.source, "合成来源");
  assert.equal(saved.origin, "aihot");
  assert.equal(saved.status, "want");
  assert.ok(Number.isFinite(Date.parse(saved.createdAt)));
  await collect.click();
  await toast(page, /已收藏/);
  assert.equal((await stored()).links.length, 1, "重复收藏不应新增");
  assert.equal(await button(page, "收藏到学习：精选三：恶意链接").count(), 0, "没有有效链接的条目不能收藏");
  await page.screenshot({ path: "test-results/aihot-selected-1440.png" });
  ok("收藏到学习：写入标题、原文链接、摘要、来源、收藏时间；重复收藏提示已收藏");

  // 4. 世界总览“今日热点”卡：3–5 条。
  await page.goto(`${app.url}/#home`);
  await hotCard(page).getByRole("heading", { name: "今日热点" }).waitFor();
  await until(async () => (await hotCard(page).locator("li a").count()) > 0, "首页热点卡");
  const n = await hotCard(page).locator("li a").count();
  assert.ok(n >= 3 && n <= 5, `今日热点应显示 3–5 条，实际 ${n}`);
  assert.deepEqual(await hotCard(page).locator("li a").allInnerTexts(), HOT.slice(0, 5).map((i) => i.title));
  for (const a of await hotCard(page).locator("li a").all()) {
    assert.equal(await a.getAttribute("target"), "_blank");
    assert.match(await a.getAttribute("rel"), /noopener/);
    await atLeast44(a, "热点卡条目");
  }
  await axe(page, "home 1440");
  ok("世界总览“今日热点”卡显示 5 条（3–5 条），新标签打开");

  // 5. 拉取失败：保留上次内容并标注。
  failing = true;
  await page.goto(`${app.url}/#aihot`);
  await page.getByRole("heading", { name: "AI HOT", level: 1 }).waitFor();
  await button(page, "立即刷新").click();
  await until(async () => /拉取失败/.test(await page.locator(".aihot-status").innerText()), "失败标注");
  assert.match(await page.locator(".aihot-status").innerText(), /上次成功/);
  assert.deepEqual(await listTitles(page), SELECTED.map((i) => i.title));
  failing = false;
  ok("拉取失败：保留上次缓存，标注“拉取失败”与上次成功时间");

  // 6. 设置：指定书架文件夹（只读）；关闭 AI HOT 网络访问。
  await page.goto(`${app.url}/#settings`);
  await page.getByRole("heading", { name: "学习成长书架" }).waitFor();
  const pathInput = page.getByLabel("文件夹路径");
  await pathInput.fill("相对路径");
  await button(page, "添加文件夹").click();
  await toast(page, /绝对路径/);
  await pathInput.fill(shelfDir);
  await atLeast44(button(page, "添加文件夹"), "添加文件夹");
  await button(page, "添加文件夹").click();
  await toast(page, /已添加书架文件夹/);
  await until(async () => (await stored()).folders.length === 1, "文件夹写入主库");
  await page.getByText(shelfDir, { exact: false }).first().waitFor();
  await axe(page, "settings 1440");
  ok("设置：书架文件夹只接受绝对路径，添加后写入主库");

  // 7. 学习成长：书架与链接收藏。
  await page.goto(`${app.url}/#learning`);
  await page.getByRole("heading", { name: "学习成长", level: 1 }).waitFor();
  await page.getByRole("heading", { name: "书架" }).waitFor();
  await page.getByRole("heading", { name: "链接收藏" }).waitFor();
  assert.match(await page.locator("main").innerText(), /以后再做/);
  await until(async () => (await page.locator(".shelf-book").count()) === 2, "书架两本");
  assert.deepEqual(
    (await page.locator(".shelf-book h3").allInnerTexts()).sort(),
    ["深度学习入门.pdf", "统计学习方法.epub"].sort(),
  );
  assert.equal(await page.getByText("说明.txt").count(), 0);
  const bookStatus = page.getByRole("group", { name: "学习状态：深度学习入门.pdf" });
  assert.deepEqual(await bookStatus.locator("button").allInnerTexts(), ["想学", "在学", "学完"]);
  for (const b of await bookStatus.locator("button").all()) await atLeast44(b, "书的状态按钮");
  await button(bookStatus, "在学").click();
  await until(async () => (await stored()).books.some((b) => b.name === "深度学习入门.pdf" && b.status === "learning"), "书状态写入");
  assert.equal(await button(bookStatus, "在学").getAttribute("aria-pressed"), "true");
  await page.reload();
  await page.getByRole("heading", { name: "学习成长", level: 1 }).waitFor();
  await until(async () => (await page.locator(".shelf-book").count()) === 2, "刷新后书架");
  assert.equal(
    await button(page.getByRole("group", { name: "学习状态：深度学习入门.pdf" }), "在学").getAttribute("aria-pressed"),
    "true",
  );
  ok("书架：只列 PDF/EPUB，标记“在学”写入主库，刷新后保持");

  const linkRow = page.locator(".learn-link", { hasText: "精选一：新模型发布" });
  assert.match(await linkRow.innerText(), /合成来源/);
  assert.equal(await linkRow.locator("a").getAttribute("rel"), "noopener noreferrer");
  const linkStatus = page.getByRole("group", { name: "学习状态：精选一：新模型发布" });
  assert.equal(await button(linkStatus, "想学").getAttribute("aria-pressed"), "true");
  await button(linkStatus, "学完").click();
  await until(async () => (await stored()).links[0].status === "done", "链接状态写入");
  // 手动添加 + 重复提示。
  await button(page, "添加链接").click();
  const dialog = page.getByRole("dialog", { name: "添加链接" });
  await dialog.getByLabel("标题").fill("一篇好文章");
  await dialog.getByLabel("链接").fill("https://blog.example.com/good");
  await dialog.getByLabel("摘要（可选）").fill("值得反复读");
  await button(dialog, "保存").click();
  await toast(page, /已添加到链接收藏/);
  await page.locator(".learn-link", { hasText: "一篇好文章" }).waitFor();
  const manual = (await stored()).links.find((l) => l.title === "一篇好文章");
  assert.equal(manual.origin, "manual");
  assert.equal(manual.summary, "值得反复读");
  await button(page, "添加链接").click();
  await dialog.getByLabel("标题").fill("同一篇");
  await dialog.getByLabel("链接").fill("https://blog.example.com/good");
  await button(dialog, "保存").click();
  await toast(page, /已收藏/);
  assert.equal((await stored()).links.length, 2);
  await button(dialog, "取消").click();
  await axe(page, "learning 1440");
  // 删除进回收区，再恢复。
  const del = button(page, "删除 一篇好文章");
  await atLeast44(del, "删除链接");
  await del.click();
  await toast(page, /回收区/);
  await until(async () => !!(await stored()).links.find((l) => l.title === "一篇好文章").deletedAt, "删除写入");
  assert.equal(await page.locator(".learn-link", { hasText: "一篇好文章" }).count(), 0);
  const recycle = page.getByRole("button", { name: /^回收区 1$/ });
  await atLeast44(recycle, "回收区");
  await recycle.click();
  await button(page, "恢复 一篇好文章").click();
  await toast(page, /已恢复到链接收藏/);
  await page.locator(".learn-link", { hasText: "一篇好文章" }).waitFor();
  await until(async () => !(await stored()).links.find((l) => l.title === "一篇好文章").deletedAt, "恢复写入");
  await page.screenshot({ path: "test-results/learning-1440.png", fullPage: true });
  ok("链接收藏：来自 AI HOT 与手动添加，三种状态，重复提示，删除进回收区并可恢复；axe 通过");

  // 8. 关闭网络访问后：不再拉取，页面如实说明。
  await page.goto(`${app.url}/#settings`);
  const allow = page.getByLabel("允许访问 aihot.news 公开接口");
  await allow.uncheck();
  await button(page, "保存 AI HOT 设置").click();
  await toast(page, /已保存 AI HOT 设置/);
  await page.goto(`${app.url}/#aihot`);
  await page.getByRole("heading", { name: "AI HOT", level: 1 }).waitFor();
  await page.getByText("网络访问已关闭").first().waitFor();
  assert.equal(await button(page, "立即刷新").count(), 0);
  assert.deepEqual(await listTitles(page), SELECTED.map((i) => i.title), "关闭后仍显示本机缓存");
  const before = calls.length;
  await new Promise((r) => setTimeout(r, 300));
  assert.equal(calls.length, before);
  await page.goto(`${app.url}/#settings`);
  await page.getByLabel("允许访问 aihot.news 公开接口").check();
  await button(page, "保存 AI HOT 设置").click();
  await toast(page, /已保存 AI HOT 设置/);
  ok("关闭网络访问后不再拉取，页面说明“网络访问已关闭”，仍显示本机缓存");
  await page.context().close();

  // 9. 390 宽：无横向溢出、44px、axe。
  const mobile = await open(390, "aihot", 844);
  for (const name of ["精选", "热点", "日报"]) {
    await tab(mobile, name).click();
    await noOverflow(mobile, `390 aihot ${name}`);
    await atLeast44(tab(mobile, name), `390 ${name} 标签`);
  }
  await atLeast44(mobile.locator(".hot-item button").first(), "390 收藏按钮");
  await axe(mobile, "aihot 390");
  await mobile.screenshot({ path: "test-results/aihot-390.png", fullPage: true });
  for (const hash of ["home", "learning", "settings"]) {
    await mobile.goto(`${app.url}/#${hash}`);
    await mobile.locator("main h1").first().waitFor();
    if (hash === "learning") {
      await until(async () => (await mobile.locator(".shelf-book").count()) === 2, "390 书架");
      await atLeast44(button(mobile.getByRole("group", { name: "学习状态：深度学习入门.pdf" }), "学完"), "390 状态按钮");
      await axe(mobile, "learning 390");
    }
    await noOverflow(mobile, `390 ${hash}`);
  }
  await mobile.goto(`${app.url}/#home`);
  await until(async () => (await hotCard(mobile).locator("li a").count()) > 0, "390 首页热点卡");
  await noOverflow(mobile, "390 home");
  await hotCard(mobile).scrollIntoViewIfNeeded();
  await mobile.screenshot({ path: "test-results/home-hot-390.png" });
  ok("390 宽：AI HOT 三个标签、学习成长、世界总览、设置均无横向溢出；按钮 44px；axe 通过");

  assert.deepEqual(errors, []);
  console.log("aihot-learning-browser: all passed");
} finally {
  await browser.close();
  await app.close();
  await rm(shelfDir, { recursive: true, force: true });
}
