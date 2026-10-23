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
  if (key === "items?mode=selected&window=7d&limit=10") return json({ data: { items: SELECTED } });
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
const radio = (scope, name) => scope.getByRole("radio", { name, exact: true });
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
const stored = async () => {const token=(await (await fetch(app.url+'/api/session',{headers:{'X-Workbench-Client':'1'}})).json()).token;return (await (await fetch(app.url+'/api/collection/notes',{headers:{'X-Workbench-Token':token}})).json()).notes;};
const tabs = (page) => page.getByRole("radiogroup", { name: "AI HOT 分类" });
const tab = (page, name) => tabs(page).getByRole("radio", { name: new RegExp(`^${name}\\s*\\d+$`) });
const listTitles = (page) => page.locator(".ah-card h3,.ah-more-top b").allInnerTexts();

try {
  // 1. 第二版首页取消热点卡；AI HOT 页仍先说明将访问的公开接口，不自动访问。
  const page = await open(1440, "home");
  await page.locator(".hx").waitFor();
  assert.equal(await page.locator("section.home-hot").count(), 0);
  await page.locator(".nav-item", { hasText: "AI HOT" }).waitFor();
  await page.goto(`${app.url}/#aihot`);
  await page.getByRole("heading", { name: "AI HOT", level: 1 }).waitFor();
  assert.equal(await page.locator(".nav-item", { hasText: "AI HOT" }).locator(".nav-flag.planned").count(), 0);
  await button(page,"这页怎么用").click();
  const notice = page.getByRole("note", { name: "访问说明" });
  assert.match(await notice.innerText(), /将访问 aihot\.news 公开接口/);
  await page.getByRole("dialog").getByRole("button",{name:"关闭",exact:true}).click();
  await page.getByText("第一次使用需要你确认",{exact:true}).waitFor();
  assert.equal(calls.length, 0, "未点击前不应访问接口");
  await new Promise((r) => setTimeout(r, 300));
  assert.equal(calls.length, 0, "未点击前不应访问接口");
  ok("首次拉取前：首页不再渲染热点卡；AI HOT 页说明将访问 aihot.news 公开接口，未发出任何请求");

  // 2. 批准202：同屏精选/热点，不设分类或原文入口；后台日报四GET不丢。
  const start = button(page, "开始拉取");
  await atLeast44(start, "开始拉取");await start.click();
  await until(async () => /更新于/.test(await page.locator(".ah-upd").innerText()), "拉取完成");
  assert.equal(calls.length,4);assert.equal(await page.getByRole("radiogroup",{name:"AI HOT 分类"}).count(),0);
  assert.deepEqual(await listTitles(page), SELECTED.map(i=>i.title));
  assert.deepEqual(await page.locator(".ah-hot li b").allInnerTexts(),HOT.map(i=>i.title));
  const first=page.locator(".ah-card").first();assert.equal(await first.locator("a").count(),0);
  assert.match(await first.innerText(),/合成来源/);assert.match(await first.innerText(),/精选一：新模型发布 的摘要/);
  assert.ok(await first.locator("time").count());
  const evil=page.locator(".ah-card",{hasText:"精选三：恶意链接"});assert.equal(await evil.locator("a").count(),0);
  assert.equal(await evil.getByRole("button").isDisabled(),true);assert.equal(await page.locator('a[href^="javascript"], [onclick]').count(),0);
  const station=page.getByRole("link",{name:/去 aihot.news/});assert.equal(await station.getAttribute("href"),"https://aihot.news/");assert.equal(await station.getAttribute("target"),"_blank");assert.deepEqual((await station.getAttribute("rel")).split(/\s+/).sort(),["noopener","noreferrer"]);
  await axe(page,"aihot 1440");ok("同屏精选/热点、无原文链接、恶意URL禁用收藏、原站安全新窗口、后台4GET保留");

  // User authorized replacement of the legacy shelf on 2026-10-09.
  const collect=button(page,'收藏：精选一：新模型发布');await atLeast44(collect,'收藏');await collect.click();await toast(page,/已收藏到收藏画布/);await until(async()=>(await stored()).length===1,'收藏保存');const saved=(await stored())[0];assert.equal(saved.origin,'aihot');assert.equal(saved.sourceUrl,'https://news.example.com/s1');assert.equal(saved.content,'精选一：新模型发布 的摘要');await collect.click();await toast(page,/已收藏/);assert.equal((await stored()).length,1);assert.equal(await button(page,'收藏：精选三：恶意链接').isDisabled(),true);
  // 4. 第二版首页不再重复显示热点，已拉取内容仍保存在 AI HOT 页。
  await page.goto(`${app.url}/#home`);
  await page.locator('.hx').waitFor();
  assert.equal(await page.locator('section.home-hot').count(),0);
  await page.locator('.nav-item',{hasText:'AI HOT'}).waitFor();
  await axe(page, "home 1440");
  ok("首页热点卡按第二版下线，AI HOT 独立入口保留");

  // 5. 拉取失败：保留上次内容并标注。
  failing = true;
  await page.goto(`${app.url}/#aihot`);
  await page.getByRole("heading", { name: "AI HOT", level: 1 }).waitFor();
  await button(page, "立即刷新").click();
  await until(async () => /更新失败/.test(await page.locator(".ah-upd").innerText()), "失败标注");
  assert.match(await page.locator(".ah-upd").innerText(), /的内容/);
  await button(page,"这页怎么用").click();assert.match(await page.getByRole("dialog").innerText(),/最近全部成功/);await page.getByRole("dialog").getByRole("button",{name:"关闭",exact:true}).click();
  assert.deepEqual(await listTitles(page), SELECTED.map((i) => i.title));
  failing = false;
  ok("拉取失败：保留上次缓存，标注“拉取失败”与上次成功时间");

  // Legacy bookshelf workflows intentionally retired; collection-browser covers the replacement.
  await page.goto(app.url+'/#settings');assert.equal(await page.getByRole('radio',{name:'学习书架',exact:true}).count(),0);await page.goto(app.url+'/#learning');await page.getByRole('heading',{name:'收藏',level:1}).waitFor();await page.locator('.collection-paper').first().waitFor();await axe(page,'collection 1440');
  // 8. 关闭网络访问后：不再拉取，页面如实说明。
  await page.goto(`${app.url}/#settings`);
  await page.getByRole("radiogroup",{name:"设置分类"}).getByRole("radio",{name:"资讯",exact:true}).click();
  await button(page,"配置网络访问").click();
  const allow = page.getByRole("button",{name:"允许访问 aihot.news 公开接口",exact:true});
  assert.equal(await allow.getAttribute("aria-pressed"),"true");
  await allow.click();
  assert.equal(await allow.getAttribute("aria-pressed"),"false");
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
  await page.getByRole("radiogroup",{name:"设置分类"}).getByRole("radio",{name:"资讯",exact:true}).click();
  await button(page,"配置网络访问").click();
  const enable=page.getByRole("button",{name:"允许访问 aihot.news 公开接口",exact:true});
  assert.equal(await enable.getAttribute("aria-pressed"),"false");
  await enable.click();
  assert.equal(await enable.getAttribute("aria-pressed"),"true");
  await button(page, "保存 AI HOT 设置").click();
  await toast(page, /已保存 AI HOT 设置/);
  ok("关闭网络访问后不再拉取，页面说明“网络访问已关闭”，仍显示本机缓存");
  await page.context().close();

  // 9. 390 宽：无横向溢出、44px、axe。
  const mobile = await open(390, "aihot", 844);
  await mobile.locator(".ah-card").first().waitFor();
  await noOverflow(mobile,"390 aihot 精选/热点");
  await atLeast44(mobile.locator(".ah-star").first(),"390 收藏按钮");
  await axe(mobile, "aihot 390");
  await mobile.screenshot({ path: "test-results/aihot-390.png", fullPage: true });
  for (const hash of ["home", "learning", "settings"]) {
    await mobile.goto(`${app.url}/#${hash}`);
    await mobile.locator("main h1").first().waitFor();
    if(hash==='learning'){await mobile.locator('.collection-paper').first().waitFor();await axe(mobile,'collection 390');}
    await noOverflow(mobile, `390 ${hash}`);
  }
  await mobile.goto(`${app.url}/#home`);
  await mobile.locator(".hx").waitFor();
  assert.equal(await mobile.locator("section.home-hot").count(), 0);
  await noOverflow(mobile, "390 home");
  await mobile.screenshot({ path: "test-results/home-v16-390.png" });
  ok("390 宽：AI HOT 同屏两栏、学习成长、世界总览、设置均无横向溢出；按钮 44px；axe 通过");

  assert.deepEqual(errors, []);
  console.log("aihot-learning-browser: all passed");
} finally {
  await browser.close();
  await app.close();
  await rm(shelfDir, { recursive: true, force: true });
}
