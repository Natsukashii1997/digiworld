// 项目空间「项目关系」页签（#79）的浏览器回归：合成 fixture，不读真实名册、Vault、data/。
// 关系接口的数据用 tests/project-relations-sample.mjs（照定稿的 16 个项目，经 #78 的 buildRelations 生成；标签避让另用真实规模样本）由路由返回；
// 「在项目总览打开」一节走真实接口（合成名册写上 type / relations）。
// 跑法：npm run build 后 node tests/project-relations-browser.mjs；本机 Playwright 缺对应浏览器时设 PLAYWRIGHT_CHROMIUM。
import { createRequire } from "node:module";
import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import AxeBuilder from "@axe-core/playwright";
import { spaceFixture } from "./projects-space-fixture.mjs";
import { relationsSample, relationsSampleReal } from "./project-relations-sample.mjs";

const { chromium } = createRequire(import.meta.url)(
  process.env.PLAYWRIGHT_MODULE ||
    "/Users/nat/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright",
);
const output = process.env.GUIJI_TEST_RESULTS || "test-results";
await mkdir(output, { recursive: true });
const app = await spaceFixture({ staticRoot: process.env.WORKBENCH_TEST_STATIC_ROOT || join(import.meta.dirname, "../dist"), skillUsage: { enabled: async () => false } });
const browser = await chromium.launch(process.env.PLAYWRIGHT_CHROMIUM ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM } : {});
const errors = [];
const ok = (s) => console.log("PASS", s);
const sample = relationsSample();

async function open(width, { reduced = false, height = 1000, body = sample, mock = true } = {}) {
  const context = await browser.newContext({ viewport: { width, height }, reducedMotion: reduced ? "reduce" : "no-preference" });
  if (mock) await context.route("**/api/projects-space/relations*", (r) => r.fulfill({ contentType: "application/json", body: JSON.stringify(body) }));
  const page = await context.newPage();
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
  await page.goto(app.url + "/#projects");
  await page.locator("[data-ps-cart]").first().waitFor();
  return { page, context };
}
const pages = (page) => page.getByRole("tablist", { name: "项目空间页签" });
async function toRelations(page) {
  await pages(page).getByRole("tab", { name: /项目关系/ }).click();
  await page.locator("#pr-panel").waitFor();
}
const node = (page, id) => page.locator(`.pr-orbit .nd[data-id="${id}"]`);
const infoTitle = (page) => page.locator(".pr-info h3").textContent();
const hotFlows = (page) => page.locator(".pr-flow .flow.hot").count();
const linksOf = (id) => sample.sankey.links.filter((l) => l.project === id).length + 1; // 底座 → 产品若干条 + 产品 → 状态 1 条

try {
  // ---- 1440：页签切换、默认态 ----
  {
    const { page, context } = await open(1440);
    const tabs = pages(page).getByRole("tab");
    assert.equal(await tabs.count(), 2);
    assert.equal(await pages(page).getByRole("tab", { selected: true }).textContent(), "项目总览OVERVIEW", "默认停在项目总览");
    assert.equal(await page.locator("#pr-panel").count(), 0, "项目总览时不画关系页");
    await toRelations(page);
    assert.equal(await page.locator("[data-ps-cart]").count(), 0, "项目关系时不显示卡带");
    assert.equal(await page.locator(".pr-orbit .nd").count(), 16);
    assert.match(await page.locator(".pr-stats").textContent(), /16项目28关系1078近 30 天产品提交名册 v1\.6 · 读取于 \d\d:\d\d/);
    assert.equal(await page.getByRole("button", { name: "按名册刷新" }).count(), 0, "按名册刷新只在项目总览");
    assert.equal(await infoTitle(page), "全局概览", "信息轨默认是全局概览");
    assert.match(await page.locator(".pr-info .big").textContent(), /1078次产品提交/);
    assert.equal(await page.locator(".pr-info .share .row").count(), new Set(sample.sankey.links.map((l) => l.base)).size, "每个底座一行份额");
    assert.match(await page.locator(".pr-info li").first().textContent(), /09 条agent-kit/);
    assert.match(await page.locator(".pr-flow + *, .pr-page .pr-foot").last().textContent(), /UI 设计体系、GET 索引 目前没有产品接入/);
    // 三圈：基础设施在内圈、能力中圈、产品外圈
    const radius = async (id) => node(page, id).evaluate((g) => { const m = g.transform.baseVal.consolidate().matrix; return Math.round(Math.hypot(m.e - 450, m.f - 330)); });
    assert.deepEqual([await radius("agent-kit"), await radius("my-skills"), await radius("postpane")], [104, 200, 296]);
    ok("页签默认项目总览；切到项目关系后三圈 16 个项目、页头读数、信息轨全局概览、未接入底座说明");
    await pages(page).getByRole("tab", { name: /项目总览/ }).click();
    await page.locator("#ps-screen").waitFor();
    assert.equal(await page.locator("#pr-panel").count(), 0);
    await toRelations(page);
    await page.locator(".pr-orbit .nd").first().waitFor();
    ok("页签来回切换，关系读数沿用不重画空白");

    // ---- 选中 / 取消（鼠标与键盘） ----
    await node(page, "postpane").click();
    assert.equal(await node(page, "postpane").getAttribute("aria-pressed"), "true");
    await page.mouse.move(5, 5);
    assert.equal(await infoTitle(page), "驿窗");
    assert.match(await page.locator(".pr-info .meta").textContent(), /产品 · PR 待合并 1 个/);
    assert.match(await page.locator(".pr-info .nums").textContent(), /30 天提交239上游5下游0/);
    assert.equal(await page.locator(".pr-info li .tag", { hasText: "自动读取" }).count(), 2, "agents / skills 来的关系标「自动读取」");
    assert.equal(await page.locator(".pr-orbit .lk.hot").count(), 5);
    assert.equal(await page.locator(".pr-orbit animateMotion").count(), 10, "每条高亮连线 2 个光点");
    assert.equal(await hotFlows(page), linksOf("postpane"), "轨道选中产品 → 桑基高亮它的整条链");
    assert.equal(await page.locator(".pr-info h4.chain").count(), 1, "选中产品时信息轨接上它的支撑链");
    assert.equal(await page.locator(".pr-info .share .row").count(), linksOf("postpane") - 1, "支撑来自：每个底座一行");
    await node(page, "postpane").click();
    await page.mouse.move(5, 5);
    assert.equal(await infoTitle(page), "全局概览", "再点一次取消");
    await node(page, "digital-twin").click();
    await page.locator(".pr-orbit .pr-bg").click({ position: { x: 30, y: 30 } });
    await page.mouse.move(5, 5);
    assert.equal(await infoTitle(page), "全局概览", "点空白处取消");
    await node(page, "agent-kit").focus();
    await page.keyboard.press("Enter");
    assert.equal(await infoTitle(page), "agent-kit");
    assert.equal(await hotFlows(page), sample.sankey.links.filter((l) => l.base === "agent-kit").length * 2, "轨道选中底座 → 桑基高亮它支撑的产品与去向");
    await page.keyboard.press("Escape");
    assert.equal(await infoTitle(page), "全局概览");
    await node(page, "multi-agent").focus();
    await page.keyboard.press(" ");
    assert.equal(await infoTitle(page), "多 Agent 协同");
    await page.locator(".pr-info li button", { hasText: "驿窗" }).click();
    assert.equal(await infoTitle(page), "驿窗", "信息卡里点对方项目，换成对方");
    ok("选中 / 再点取消 / 点空白取消；Tab 聚焦后 Enter、空格选中，Esc 取消；信息卡读数与「自动读取」；轨道 → 桑基联动");

    // ---- 关系类型开关 ----
    const dataEdges = sample.edges.filter((e) => e.kind === "data").length;
    const dataToggle = page.locator(".pr-legend button.tg", { hasText: "数据流" });
    await dataToggle.click();
    assert.equal(await dataToggle.getAttribute("aria-pressed"), "false");
    assert.match(await page.locator(".pr-orbit-card .crumb").textContent(), new RegExp(`${sample.edges.length - dataEdges} 条关系`));
    assert.equal(await page.locator(".pr-orbit .lk.off").count(), dataEdges);
    assert.equal(await page.locator(".pr-info li em", { hasText: "数据流" }).count(), 0, "关掉的类型不在信息卡里");
    await dataToggle.click();
    assert.equal(await page.locator(".pr-orbit .lk.off").count(), 0);
    ok("关系类型开关：隐藏连线、计数与信息卡同步");

    // ---- 桑基悬停与点击 ----
    await page.locator(".pr-orbit .pr-bg").click({ position: { x: 30, y: 30 } });
    await page.locator('.pr-flow .nd[data-node="b:agent-kit"] rect').hover();
    assert.equal(await hotFlows(page), sample.sankey.links.filter((l) => l.base === "agent-kit").length * 2, "悬停底座：它支撑的产品及去向");
    assert.equal(await infoTitle(page), "agent-kit");
    assert.match(await page.locator(".pr-info .meta").textContent(), new RegExp(`底座 · 支撑 ${sample.sankey.links.filter((l) => l.base === "agent-kit").length} 个产品`));
    await page.locator('.pr-flow .nd[data-node="s:human"] rect').hover();
    const human = sample.sankey.status.filter((s) => s.key === "human").map((s) => s.project);
    assert.equal(await hotFlows(page), human.reduce((a, id) => a + linksOf(id), 0), "悬停状态：流进它的全部链路");
    await page.locator('.pr-flow .nd[data-node="p:work-desk"] rect').hover();
    assert.equal(await hotFlows(page), linksOf("work-desk"), "悬停产品：整条链");
    assert.equal(await infoTitle(page), "牛马之家", "悬停桑基节点：信息轨写它的明细");
    assert.equal(await page.locator(".pr-tip.on").count(), 0, "节点悬停不再弹提示（信息轨已经写了）");
    // 流带悬停仍弹提示：鼠标放到 work-desk 流带路径中点
    const mid = await page.locator('.pr-flow .flow[data-p="work-desk"]').first().evaluate((el) => {
      const pt = el.getPointAtLength(el.getTotalLength() / 2), m = el.getScreenCTM();
      return { x: pt.x * m.a + pt.y * m.c + m.e, y: pt.x * m.b + pt.y * m.d + m.f };
    });
    await page.mouse.move(mid.x, mid.y);
    assert.ok(await page.locator(".pr-tip.on").isVisible(), "流带悬停有提示");
    assert.equal(await infoTitle(page), "牛马之家", "悬停流带：信息轨写这条链的产品");
    await page.mouse.move(5, 5);
    assert.equal(await infoTitle(page), "全局概览", "移开后信息轨回到全局概览");
    await page.locator('.pr-flow .nd[data-node="p:github-center"] rect').click();
    await page.mouse.move(5, 5);
    assert.equal(await node(page, "github-center").getAttribute("aria-pressed"), "true", "点桑基产品 → 轨道选中");
    await page.waitForFunction(() => { const r = document.querySelector(".pr-orbit-card").getBoundingClientRect(); return r.top < innerHeight && r.bottom > 0; });
    ok("桑基悬停底座 / 状态 / 产品各自高亮对应链路并写进信息轨；节点不弹提示、流带弹；点产品节点轨道选中并滚到可见");

    // ---- 动效：进场结束后去掉动画类；高亮流带上有细光 ----
    // 每次切到关系页签都会重放进场动效（约 2 秒），结束后去掉动画类
    await page.waitForFunction(() => !document.querySelector(".pr-orbit .lk.draw, .pr-orbit .nd.in, .pr-orbit .ring.spin, .pr-flow .flow.grow"), null, { timeout: 5000 });
    assert.ok(await page.locator(".pr-flow .sweep.hot").count() > 0, "高亮链路上的柔光照亮");
    assert.equal(await page.locator(".pr-flow #pr-sweep animateTransform").count(), 1, "柔光从左往右扫过流带");
    assert.equal(await node(page, "github-center").locator(".glow").evaluate((el) => getComputedStyle(el).animationName), "pr-pulse", "选中节点呼吸");
    ok("动效：进场后动画类移除；桑基柔光扫过、选中节点呼吸");

    // ---- 44px 与可访问性 ----
    const small = await page.evaluate(() => [...document.querySelectorAll(".ps-pages button, .pr-page button")]
      .filter((el) => el.offsetParent).map((el) => ({ t: el.textContent.trim(), h: Math.round(el.getBoundingClientRect().height), w: Math.round(el.getBoundingClientRect().width) }))
      .filter((r) => r.h < 44 || r.w < 44));
    assert.deepEqual(small, [], "关系页按钮点击区域不小于 44px");
    const axe = await new AxeBuilder({ page }).include(".projects-space").analyze();
    assert.deepEqual(axe.violations.map((v) => v.id), [], JSON.stringify(axe.violations.map((v) => [v.id, v.nodes.slice(0, 3).map((n) => n.target)])));
    ok("按钮 ≥ 44px；axe 无违规");
    await context.close();
  }

  // ---- 减少动态效果：没有进场动画、没有流动光点 ----
  {
    const { page, context } = await open(1440, { reduced: true });
    await toRelations(page);
    await page.locator(".pr-orbit .nd").first().waitFor();
    assert.equal(await page.locator(".pr-orbit .lk.draw, .pr-orbit .nd.in, .pr-orbit .ring.spin, .pr-flow .flow.grow").count(), 0);
    await node(page, "postpane").click();
    assert.equal(await page.locator(".pr-orbit animateMotion").count(), 0, "不放光点");
    assert.equal(await page.locator(".pr-flow animateTransform, .pr-flow .sweep").count(), 0, "不放柔光扫过");
    assert.equal(await page.evaluate(() => document.getAnimations().filter((a) => a.playState === "running" && a.effect?.target?.closest?.(".pr-page")).length), 0, "关系页没有在跑的动画");
    assert.equal(await hotFlows(page), linksOf("postpane"), "高亮照常");
    ok("减少动态效果：直接显示终态，无光点、无动画，高亮照常");
    await context.close();
  }

  // ---- 桑基标签避让：真实规模（19 个项目、10 个产品，小产品挤在中栏底部）与定稿样本，各列标签互不压住 ----
  for (const [tag, body] of [["真实规模", relationsSampleReal()], ["定稿样本", sample]]) {
    const { page, context } = await open(1440, { reduced: true, body });
    await toRelations(page);
    await page.locator(".pr-flow .nd").first().waitFor();
    await page.evaluate(() => document.fonts.ready);
    const hits = await page.locator(".pr-flow").evaluate((svg) => {
      const box = (g) => { const b = [...g.querySelectorAll(":scope > text")].map((t) => t.getBBox()); // 字形框外加 1.5 描边
        return { t: g.textContent, y0: Math.min(...b.map((r) => r.y)) - 1.5, y1: Math.max(...b.map((r) => r.y + r.height)) + 1.5 }; };
      const out = [];
      for (const col of ["b:", "p:", "s:"]) {
        const c = [...svg.querySelectorAll(`.nd[data-node^="${col}"]`)].map(box).sort((a, b) => a.y0 - b.y0);
        c.slice(1).forEach((b, i) => { if (b.y0 < c[i].y1) out.push(`${c[i].t} ↔ ${b.t}`); });
        if (c.length && c.at(-1).y1 > svg.viewBox.baseVal.height) out.push(`${c.at(-1).t} 超出画布底`);
      }
      return out;
    });
    assert.deepEqual(hits, [], `${tag}：桑基标签互相压住`);
    await context.close();
  }
  ok("桑基标签避让：真实规模与定稿样本下，三列标签互不压住、不出画布");

  // ---- 窄屏 390：图在卡片里横向滚动，页面本身不横向滚动 ----
  {
    const { page, context } = await open(390, { height: 844 });
    await toRelations(page);
    await page.locator(".pr-orbit .nd").first().waitFor();
    const over = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    assert.ok(over <= 0, `页面横向溢出 ${over}px`);
    const scrolls = await page.locator(".pr-scroll").evaluateAll((els) => els.map((el) => el.scrollWidth > el.clientWidth && getComputedStyle(el).overflowX === "auto"));
    assert.deepEqual(scrolls, [true, true]);
    assert.equal(await page.locator(".pr-info").evaluate((el) => getComputedStyle(el).position), "static", "信息卡落到图下面");
    await page.screenshot({ path: join(output, "project-relations-390.png"), fullPage: true });
    ok("390 宽：两张图在卡片内横向滚动，页面无横向溢出，信息卡落到图下");
    await context.close();
  }

  // ---- 空态、名册读不到、AGENTS 读不到 ----
  {
    const empty = { ...sample, edges: [], nodes: sample.nodes.map((n) => ({ ...n, degree: 0 })), sankey: { ...sample.sankey, links: sample.sankey.links.map((l) => ({ ...l, base: "none" })), unusedBases: [] } };
    let { page, context } = await open(1440, { body: empty });
    await toRelations(page);
    assert.match(await page.locator(".pr-orbit-card .pr-empty").textContent(), /名册里补 relations，或项目 AGENTS\.md 引用底座后自动连上/);
    await context.close();
    ({ page, context } = await open(1440, { body: { at: sample.at, roster: { state: "error", path: "/合成/projects.json", message: "JSON 解析失败" }, nodes: [], edges: [], sankey: { rule: "", links: [], status: [], unusedBases: [] }, skipped: [] } }));
    await toRelations(page);
    assert.match(await page.locator(".ps-roster-error").textContent(), /名册读不到：JSON 解析失败/);
    await context.close();
    ({ page, context } = await open(1440, { body: relationsSample({ agentsError: ["little-steps"] }) }));
    await toRelations(page);
    await node(page, "little-steps").click();
    assert.match(await page.locator(".pr-info .warn").textContent(), /AGENTS\.md 读不到/);
    await node(page, "postpane").click();
    assert.equal(await page.locator(".pr-info .warn").count(), 0, "其他项目不受影响");
    await context.close();
    ok("没有关系时提示补 relations；名册读不到沿用错误条；单个项目 AGENTS 读不到只在它的信息卡注明");
  }

  // ---- 在项目总览打开（真实接口：合成名册写上 type / relations） ----
  {
    await writeFile(app.rosterPath, JSON.stringify({ version: "测试名册 v1", projects: [
      { id: "collab", name: "协同项目", path: app.paths.collab, card: "10 项目/协同.md", github: "tester/collab", type: "product",
        relations: [{ to: "bare", kind: "data", note: "协同的产出给无协议项目", source: "合成名册" }] },
      { id: "bare", name: "无协议项目", path: app.paths.bare, type: "product" },
      { id: "docs", name: "文档项目", path: app.paths.docs, type: "infrastructure" },
    ] }));
    const { page, context } = await open(1440, { mock: false });
    await toRelations(page);
    await node(page, "bare").waitFor();
    await node(page, "bare").click();
    await page.getByRole("button", { name: "在项目总览打开 →" }).click();
    await page.locator("#ps-screen h2", { hasText: "无协议项目" }).waitFor();
    assert.equal(await pages(page).getByRole("tab", { selected: true }).textContent(), "项目总览OVERVIEW");
    assert.equal(await page.getByRole("tablist", { name: "选择项目" }).getByRole("tab", { selected: true }).getAttribute("data-ps-cart"), "bare");
    ok("「在项目总览打开 →」切回项目总览并选中对应卡带（真实接口）");
    await context.close();
  }

  assert.deepEqual(errors, [], "控制台没有错误");
  ok("控制台没有错误");
} finally {
  await browser.close();
  await app.close();
}
