// UI v14e 公共层与知识仓库（docs/design/ui-v14）：一次局部反馈、ZONE MONITOR、减少动态效果（含运行中切换）、
// 320/390 逐元素无横向溢出、控件至少 44px、axe、银饰页不加 v14 手感。只用临时合成 Vault 与隔离数据目录。
import { createRequire } from "node:module";
import assert from "node:assert/strict";
import AxeBuilder from "@axe-core/playwright";
import { mkdtemp, mkdir, writeFile, rm, realpath } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { startServer } from "../server/http.mjs";
import { seed } from "../src/store.js";
import { parse, stringify } from "../src/serialization.js";
const { chromium } = createRequire(import.meta.url)(
  process.env.PLAYWRIGHT_MODULE ||
    "/Users/nat/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright",
);
const output = process.env.GUIJI_TEST_RESULTS || "test-results/ui-v14";
await mkdir(output, { recursive: true });

const base = await realpath(await mkdtemp(join(tmpdir(), "guiji-v14-ui-")));
const root = join(base, "合成Vault");
async function put(path, text) {
  await mkdir(join(root, path, ".."), { recursive: true });
  await writeFile(join(root, path), text);
}
await put("GET NOTES/订阅一.md", "# 订阅一\n");
await put("个人上下文/关于我.md", "# 关于我\n");
await put("决定/方法A.md", "# 方法A\n");
await put("决定/方法B.md", "# 方法B\n");

const app = await startServer({
  directory: join(base, "data"),
  port: 0,
  mcpPort: 0,
  staticRoot: process.env.GUIJI_TEST_DIST || join(import.meta.dirname, "../dist"),
  discovery: { defaultRoots: () => [join(base, "projects")] },
});
const session = await (await fetch(app.url + "/api/session", { headers: { "X-Workbench-Client": "1" } })).json();
const initial = await app.repository.write(seed(), { initialize: true });
const connect = await fetch(app.url + "/api/knowledge/connect", {
  method: "POST",
  headers: { "Content-Type": "application/json", "X-Workbench-Token": session.token },
  body: stringify({ name: "合成 Vault", kind: "obsidian", root, confirmed: true, expectedRevision: initial.revision }),
});
assert.equal(connect.status, 200, parse(await connect.text()).error);

const browser = await chromium.launch();
const errors = [];
const ok = (s) => console.log("PASS", s);
async function open(width, hash, reducedMotion = "no-preference") {
  const context = await browser.newContext({ viewport: { width, height: 900 }, reducedMotion });
  const page = await context.newPage();
  page.setDefaultTimeout(10000);
  page.on("pageerror", (e) => errors.push(`${width} ${e.message}`));
  await page.goto(`${app.url}/#${hash}`);
  await page.locator("main h1").first().waitFor();
  return page;
}
const button = (scope, name) => scope.getByRole("button", { name, exact: true });
const zones = (page) => page.getByRole("region", { name: "三区视图" });
// 运行中的动画（CSS 与 Web Animations）；减少动态效果时应为 0。
const running = (page) =>
  page.evaluate(() =>
    document
      .getAnimations()
      .filter((a) => a.playState === "running")
      .map((a) => a.animationName || a.constructor.name),
  );
// 背景微尘画布上是否有像素。
const motesInk = (page) =>
  page.evaluate(() => {
    const c = document.querySelector(".v14-motes");
    if (!c || !c.width) return 0;
    const d = c.getContext("2d").getImageData(0, 0, c.width, c.height).data;
    let n = 0;
    for (let i = 3; i < d.length; i += 4) if (d[i]) n++;
    return n;
  });
// 逐元素：可见元素不得超出视口左右边界（横向滚动容器内除外）；overflow 隐藏的元素内部也不得被裁切。
const offenders = (page) =>
  page.evaluate(() => {
    const W = document.documentElement.clientWidth;
    const bad = [];
    const name = (el) => `${el.tagName.toLowerCase()}.${[...el.classList].join(".")}`;
    for (const el of document.querySelectorAll("main *, .topbar *")) {
      const cs = getComputedStyle(el);
      if (cs.display === "none" || cs.visibility === "hidden" || el.closest(".sr-only")) continue;
      const r = el.getBoundingClientRect();
      if (!r.width && !r.height) continue;
      if (r.right > W + 0.5 || r.left < -0.5) {
        let p = el.parentElement,
          scroller = false;
        for (; p; p = p.parentElement) {
          const o = getComputedStyle(p).overflowX;
          if (o === "auto" || o === "scroll") {
            scroller = true;
            break;
          }
        }
        if (!scroller) bad.push(`${name(el)} [${Math.round(r.left)}, ${Math.round(r.right)}]`);
      }
      if ((cs.overflowX === "hidden" || cs.overflowX === "clip") && cs.textOverflow !== "ellipsis" && el.scrollWidth > el.clientWidth + 1)
        bad.push(`裁切 ${name(el)} ${el.scrollWidth}>${el.clientWidth}`);
    }
    return { page: document.documentElement.scrollWidth - innerWidth, bad };
  });
// 等所有有限时长的入场动画（遮罩淡入、抽屉擦入等）播完；常驻循环动画不计。
const settled = (page) =>
  page.waitForFunction(() =>
    document.getAnimations().every((a) => a.playState !== "running" || a.effect?.getComputedTiming().iterations === Infinity),
  );
async function atLeast44(locator, label) {
  const box = await locator.boundingBox();
  assert.ok(box, `${label} 不可见`);
  assert.ok(box.width >= 44 && box.height >= 44, `${label} ${box.width}x${box.height}，应至少 44px`);
}
async function axe(page, label) {
  const result = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
  assert.deepEqual(result.violations.map((v) => `${label}: ${v.id} ${v.nodes.map((n) => n.target).join(" ")}`), []);
}

try {
  // 1. 正常动效：主区挂 v14，点阵眉题、ZONE MONITOR 出现；背景微尘在画；统计成功后读数窗翻转一次、“已重新统计”出现一次。
  const page = await open(1440, "knowledge");
  assert.equal(await page.locator("main.v14").count(), 1);
  await page.locator(".page-heading .lcd-num svg[aria-label='KNOWLEDGE']").waitFor();
  await zones(page).locator(".v14-shell .plate", { hasText: "ZONE MONITOR" }).waitFor();
  await page.waitForTimeout(400);
  assert.ok((await motesInk(page)) > 0, "背景微尘应在画");
  await button(zones(page), "统计三区").click();
  await zones(page).locator(".zone-board.flash").waitFor();
  const chip = zones(page).locator(".v14-result");
  await chip.waitFor();
  assert.equal(await chip.innerText(), "✓ 已重新统计");
  await zones(page).locator(".zone-board.flash").waitFor({ state: "detached" });
  await page.waitForTimeout(800);
  assert.equal(await zones(page).locator(".zone-board.flash").count(), 0, "翻转只发生一次，不循环");
  assert.ok(!(await running(page)).includes("v14-flash"), "翻转动画已结束");
  assert.equal(await chip.count(), 1);
  assert.match(await zones(page).getByRole("group", { name: "知识分区" }).getByRole("button", { name: /^我的知识/ }).innerText(), /2\s*篇[\s\S]*本周 \+2/);
  assert.match(await zones(page).locator(".zone-share").innerText(), /共 4 篇/);
  // 近 7 天按天趋势没有数据来源：只显示“待接入”，不画柱高。
  assert.equal(await zones(page).getByText("近 7 天按天趋势 · 待接入数据").count(), 3);
  await atLeast44(button(zones(page), "统计三区"), "统计三区");
  await atLeast44(button(zones(page), "划分规则"), "划分规则");
  await atLeast44(button(page, "规则与 MCP"), "规则与 MCP");
  await axe(page, "knowledge-1440");
  await page.screenshot({ path: join(output, "knowledge-1440.png"), fullPage: true });
  ok("正常动效：点阵眉题、ZONE MONITOR、背景微尘；统计成功后翻转一次并出现一次“已重新统计”；趋势如实标待接入；44px；axe");

  // 2. 运行中开启“减少动态效果”：CSS 与 JS 动画全部停，背景微尘清空且不再画。
  assert.ok((await running(page)).length > 0, "切换前应有运行中的动画");
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.waitForTimeout(150);
  assert.deepEqual(await running(page), [], "减少动态效果后不应有运行中的动画");
  assert.equal(await motesInk(page), 0, "微尘画布应清空");
  await page.waitForTimeout(300);
  assert.equal(await motesInk(page), 0, "微尘不应继续画");
  await page.mouse.move(700, 600);
  await button(zones(page), "统计三区").click();
  await zones(page).locator(".v14-result").waitFor();
  assert.deepEqual(await running(page), [], "减少动态效果下统计反馈不产生动画");
  ok("运行中开启减少动态效果：所有动画立即停止，微尘清空不再画；反馈改为静态出现");

  // 3. 规则与 MCP 抽屉：页头按钮打开，划分规则与个人说明都在抽屉里；关闭后焦点回到按钮。
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await button(page, "规则与 MCP").click();
  const drawer = page.getByRole("dialog", { name: "规则与 MCP" });
  await drawer.getByRole("form", { name: "划分规则" }).waitFor();
  await drawer.getByRole("region", { name: "个人说明" }).waitFor();
  await settled(page);
  await axe(page, "rules-drawer-1440");
  await button(drawer, "关闭").click();
  await drawer.waitFor({ state: "detached" });
  assert.equal(await page.evaluate(() => document.activeElement?.textContent?.trim()), "规则与 MCP");
  ok("规则与 MCP 抽屉：划分规则与个人说明 MCP 在抽屉内，axe 通过，关闭后焦点归还");

  // 4. 320 / 390：逐元素无横向溢出（含抽屉），控件至少 44px，axe 通过。
  for (const width of [320, 390]) {
    const narrow = await open(width, "knowledge");
    await button(zones(narrow), "统计三区").click();
    await zones(narrow).locator(".v14-result").waitFor();
    await narrow.waitForTimeout(700);
    const result = await offenders(narrow);
    assert.equal(result.page, 0, `${width} 整页横向溢出`);
    assert.deepEqual(result.bad, [], `${width} 逐元素溢出`);
    for (const name of ["统计三区", "划分规则"]) await atLeast44(button(zones(narrow), name), `${width} ${name}`);
    await atLeast44(zones(narrow).getByRole("button", { name: /^输入区/ }), `${width} 分区按钮`);
    await axe(narrow, `knowledge-${width}`);
    await narrow.screenshot({ path: join(output, `knowledge-${width}.png`), fullPage: true });
    await button(narrow, "规则与 MCP").click();
    await narrow.getByRole("dialog", { name: "规则与 MCP" }).waitFor();
    await narrow.waitForTimeout(500);
    const inDrawer = await offenders(narrow);
    assert.equal(inDrawer.page, 0, `${width} 抽屉整页溢出`);
    await narrow.context().close();
  }
  ok("320/390：逐元素无横向溢出（含抽屉打开），控件至少 44px，axe 通过");

  // 5. 银饰页保持原样：主区不挂 v14，不画背景微尘。
  await page.goto(`${app.url}/#silver`);
  await page.locator("main h1").first().waitFor();
  assert.equal(await page.locator("main.v14").count(), 0);
  assert.equal(await page.locator(".v14-motes").count(), 0);
  ok("银饰页不加 v14 手感与背景微尘");

  assert.deepEqual(errors, []);
  console.log("ui-v14-browser 全部通过");
} finally {
  await browser.close();
  await app.close();
  await rm(base, { recursive: true, force: true });
}
