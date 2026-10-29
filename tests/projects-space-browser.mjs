// 项目空间第二版（电路卡带 7E，issue #10）浏览器回归：选卡带、置顶上限、实战未开启、名册读不到、
// 编号按名册、置顶冲突自动重读、读取中先画卡带、只有 Codex 点名、1440 / 390 无横向溢出、控件不小于 44px、axe 无违规、减少动态效果时不跑流光、档案头只留文字、卡带文字在走线淡出带里。合成仓库与合成名册（projects-space-fixture.mjs）。
import { createRequire } from "node:module";
import assert from "node:assert/strict";
import { mkdir, rm } from "node:fs/promises";
import { join } from "node:path";
import AxeBuilder from "@axe-core/playwright";
import { spaceFixture } from "./projects-space-fixture.mjs";

const { chromium } = createRequire(import.meta.url)(
  process.env.PLAYWRIGHT_MODULE ||
    "/Users/nat/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright",
);
const output = process.env.GUIJI_TEST_RESULTS || "test-results";
await mkdir(output, { recursive: true });
const app = await spaceFixture({ staticRoot: process.env.WORKBENCH_TEST_STATIC_ROOT || join(import.meta.dirname, "../dist") });
const browser = await chromium.launch();
const errors = [];
const ok = (s) => console.log("PASS", s);

async function open(width, { reduced = false, height = 1000 } = {}) {
  const context = await browser.newContext({ viewport: { width, height }, reducedMotion: reduced ? "reduce" : "no-preference" });
  const page = await context.newPage();
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
  await page.goto(app.url + "/#projects");
  await page.locator("[data-ps-cart]").first().waitFor();
  return { page, context };
}
async function noOverflow(page, label) {
  const over = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  assert.ok(over <= 0, `${label} 横向溢出 ${over}px`);
}
async function bigEnough(page, label) {
  const small = await page.evaluate(() => [...document.querySelectorAll(".projects-space button, .projects-space a.btn")]
    .filter((el) => el.offsetParent && !el.closest("[role=tab]"))
    .map((el) => ({ t: el.textContent.trim() || el.getAttribute("aria-label"), h: el.getBoundingClientRect().height, w: el.getBoundingClientRect().width }))
    .filter((r) => r.h < 44 || r.w < 44));
  assert.deepEqual(small, [], `${label} 有小于 44px 的控件`);
}

try {
  // ---- 1440：卡带按名册、档案屏跟着选中项变 ----
  {
    const { page, context } = await open(1440);
    const carts = page.locator("[data-ps-cart]");
    assert.equal(await carts.count(), 6);
    assert.equal(await page.getByRole("tab", { selected: true }).getAttribute("data-ps-cart"), "collab");
    const screen = page.locator("#ps-screen");
    await screen.getByRole("heading", { name: /协同项目/ }).waitFor();
    assert.match(await screen.locator(".one").textContent(), /合成一句话/);
    assert.match(await screen.locator(".g7-head dl").textContent(), /合成目标.*合成不做/);
    // 7G：档案头只留文字、左对齐；卡带文字落在走线淡出的那一带
    const head = screen.locator(".g7-head");
    assert.equal(await head.locator(".g5-mono").count(), 0, "档案头不放代号方块");
    const [headBox, nameBox] = [await head.boundingBox(), await head.locator("h2").boundingBox()];
    assert.ok(Math.abs(nameBox.x - headBox.x) <= 1, "档案头文字左对齐");
    const fade = await page.locator('[data-ps-cart="collab"]').evaluate((c) => {
      const b = c.querySelector(".board").getBoundingClientRect(), t = c.querySelector(".tx").getBoundingClientRect(), s = getComputedStyle(c.querySelector(".trace"));
      return { mask: s.maskImage || s.webkitMaskImage, top: (t.top - b.top) / b.height, bottom: (t.bottom - b.top) / b.height };
    });
    assert.match(fade.mask, /linear-gradient/, "走线有渐隐遮罩");
    assert.ok(fade.top >= 0.4 && fade.bottom <= 0.84, `卡带文字在走线淡出带里（${fade.top.toFixed(2)}–${fade.bottom.toFixed(2)}）`);
    assert.match(await page.locator('[data-ps-cart="collab"] .flag').textContent(), /待人工验收 1 张/);
    assert.match(await screen.locator("[data-ps-next]").textContent(), /#3 修窄屏/, "下一步取 ready-for-agent 编号最小的");
    // 实战默认开启：第一次在后台统计（合成会话目录为空），统计完页面自己换上
    await screen.locator(".g7-field").filter({ hasText: "近 30 天没有调用技能的会话" }).waitFor({ timeout: 15000 });
    assert.equal(await page.locator(".cnt .lcd.violet [role=img]").getAttribute("aria-label"), "0", "实战开启时页头技能数是读数");
    assert.equal(await page.locator(".projects-space .lcd svg > g:first-child").evaluateAll((gs) => gs.filter((g) => getComputedStyle(g).display !== "none").length), 0, "液晶数不画不亮像素的暗格");
    assert.equal(await page.locator(".projects-space .lcd svg g.on").count(), 0, "液晶数不用逐格渐亮（Safari 里会停在半透明）");
    assert.deepEqual(await page.locator(".projects-space .lcd svg").evaluateAll((ss) => [...new Set(ss.map((s) => s.getBoundingClientRect().height))].sort()), [21, 28], "点阵按整数倍原尺寸画，不缩放");
    assert.match(await page.locator(".cnt").nth(1).locator("small").textContent(), /有项目读不到/, "有项目 GitHub 读不到时合计注明");
    ok("卡带按名册排、默认选第一盘；档案头摘要、要注意的事、下一步取数、实战默认开启；液晶数无暗格、不缩放");

    await page.locator('[data-ps-cart="gone"]').click();
    await screen.getByRole("heading", { name: /已删项目/ }).waitFor();
    assert.match(await page.locator('[data-ps-cart="gone"] .flag').textContent(), /本机找不到目录/);
    assert.equal(await screen.getByRole("button", { name: "置顶" }).isDisabled(), true);
    await page.keyboard.press("ArrowLeft");
    await screen.getByRole("heading", { name: /文档项目/ }).waitFor();
    ok("点卡带与方向键都能换档案；找不到目录的项目不能置顶");

    // 置顶：最多 3 个，超出时提示先取消一个；置顶的排到最前
    for (const id of ["bare", "leaky", "docs"]) {
      await page.locator(`[data-ps-cart="${id}"]`).click();
      await screen.getByRole("button", { name: "置顶" }).click();
      await screen.getByRole("button", { name: "已置顶" }).waitFor();
    }
    await page.locator('[data-ps-cart="collab"]').click();
    await screen.getByRole("button", { name: "置顶" }).click();
    await page.locator(".g5-receipt").filter({ hasText: "最多 3 个" }).waitFor();
    const order = await carts.evaluateAll((els) => els.map((e) => e.dataset.psCart));
    assert.deepEqual(order.slice(0, 3).sort(), ["bare", "docs", "leaky"]);
    const ws = (await app.call("/workspace")).body;
    assert.equal(ws.connections.projects.filter((p) => p.active).length, 3);
    assert.deepEqual(await carts.evaluateAll((els) => Object.fromEntries(els.map((e) => [e.dataset.psCart, e.querySelector(".no").textContent]))),
      { collab: "01", bare: "02", leaky: "03", docs: "04", gone: "05", outside: "06" }, "置顶换了顺序，编号仍按名册");
    ok("置顶写进主库（回读一致）、排到最前、编号不变；第 4 个提示先取消一个");

    // 页面读数之后主库被别处改过：按页面那一版提交会被拒绝，并自动重读
    const rev = (await app.call("/workspace")).body.revision;
    assert.equal((await app.call("/projects-space/pin", { id: "bare", pinned: false, revision: rev })).status, 200);
    await page.locator('[data-ps-cart="docs"]').click();
    await screen.getByRole("button", { name: "已置顶" }).click();
    await page.locator(".g5-receipt").filter({ hasText: "已重新读取" }).waitFor();
    await page.locator('[data-ps-cart="bare"] [data-ps-pin]').waitFor({ state: "detached" });
    const after = (await app.call("/workspace")).body.connections.projects.filter((p) => p.active).length;
    assert.equal(after, 2, "冲突的那次没有写进主库");
    const expected = errors.findIndex((e) => /status of 409/.test(e));
    assert.ok(expected >= 0, "浏览器记下了那次 409");
    errors.splice(expected, 1);
    ok("主库在页面读数后变了：置顶被拒绝、自动重读、不覆盖");

    await noOverflow(page, "1440");
    await bigEnough(page, "1440");
    const axe = await new AxeBuilder({ page }).include(".projects-space").analyze();
    assert.deepEqual(axe.violations.map((v) => v.id), []);
    await page.screenshot({ path: join(output, "projects-space-1440.png"), fullPage: true });
    ok("1440 无横向溢出、控件不小于 44px、axe 无违规");
    await context.close();
  }

  // ---- 390：卡带横向滑动、档案屏通栏 ----
  {
    const { page, context } = await open(390, { height: 844 });
    await noOverflow(page, "390");
    await bigEnough(page, "390");
    const rack = await page.locator(".g5-carts").evaluate((el) => ({ scroll: el.scrollWidth > el.clientWidth, w: el.firstElementChild.getBoundingClientRect().width }));
    assert.ok(rack.scroll, "手机上卡带架横向滑动");
    assert.ok(Math.abs(rack.w - 148) <= 1, `卡带宽 148，实际 ${rack.w}`);
    await page.screenshot({ path: join(output, "projects-space-390.png"), fullPage: true });
    ok("390 无横向溢出、卡带架横向滑动、控件不小于 44px");
    await context.close();
  }

  // ---- 减少动态效果：选中直接到位，不显示流光 ----
  {
    const { page, context } = await open(1440, { reduced: true });
    await page.locator('[data-ps-cart="leaky"]').click();
    const flow = await page.locator('[data-ps-cart="leaky"] .flow').evaluate((el) => getComputedStyle(el).display);
    assert.equal(flow, "none");
    assert.equal(await page.locator("#ps-screen .caret").count(), 0, "下一步直接显示，不逐字");
    ok("减少动态效果时没有流光、不逐字");
    await context.close();
  }

  // ---- 读取中：先按名册画出卡带，读数格暗着 ----
  {
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await context.newPage();
    let release;
    const gate = new Promise((r) => { release = r; });
    await page.route((u) => u.pathname === "/api/projects-space" && !u.search.includes("roster"), async (route) => { await gate; await route.continue(); });
    await page.goto(app.url + "/#projects");
    await page.locator("[data-ps-cart].wait").first().waitFor();
    assert.equal(await page.locator("[data-ps-cart].wait").count(), 6);
    assert.match(await page.locator(".ps-loading").textContent(), /读取各项目读数中/);
    assert.equal(await page.locator("#ps-screen").count(), 0, "读数没到时不出档案屏");
    release();
    await page.locator("#ps-screen").waitFor();
    assert.equal(await page.locator("[data-ps-cart].wait").count(), 0);
    ok("读取中先按名册画出卡带、读数格暗着，读数到了再换上");
    await context.close();
  }

  // ---- 实战开着、只有 Codex 点名：「仅参考」那一行照样显示 ----
  {
    const codexOnly = await spaceFixture({
      staticRoot: process.env.WORKBENCH_TEST_STATIC_ROOT || join(import.meta.dirname, "../dist"),
      // 直接给项目空间一份合成统计（不经会话目录）
      space: { skillUsage: {
        read: async () => ({ state: "ok", at: new Date().toISOString(), projects: { collab: { skills: [], calls: 0, sessions: 0, codex: [{ name: "tdd", n: 2 }] } } }),
        refresh: async () => ({ state: "ok" }),
      } },
    });
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await context.newPage();
    await page.goto(codexOnly.url + "/#projects");
    const field = page.locator("#ps-screen .g7-field");
    await field.waitFor();
    assert.match(await field.textContent(), /没有调用技能/);
    assert.match(await field.locator(".g7-codex").textContent(), /tdd ×2.*仅参考/);
    ok("没有技能调用、只有 Codex 点名时，Codex 一行照样显示并标仅参考");
    await context.close();
    await codexOnly.close();
  }

  // ---- 样稿 7F：分节标题、热力条、实战排行榜（前三 + 第 4–10 名对齐 + 其余在右下） ----
  {
    const skills = Array.from({ length: 15 }, (_, i) => ({ name: `skill-${String(i + 1).padStart(2, "0")}`, src: "合成", n: 15 - i, last: "2026-10-27" }));
    const board = await spaceFixture({
      staticRoot: process.env.WORKBENCH_TEST_STATIC_ROOT || join(import.meta.dirname, "../dist"),
      space: { skillUsage: {
        read: async () => ({ state: "ok", at: new Date().toISOString(), projects: { collab: { skills, calls: 120, sessions: 9, codex: [{ name: "tdd", n: 3 }] } } }),
        refresh: async () => ({ state: "ok" }),
      } },
    });
    for (const width of [1440, 390]) {
      const context = await browser.newContext({ viewport: { width, height: 900 } });
      const page = await context.newPage();
      page.on("pageerror", (e) => errors.push(e.message));
      await page.goto(board.url + "/#projects");
      const screen = page.locator("#ps-screen");
      await screen.locator(".ps-podium").waitFor();
      assert.deepEqual(await screen.locator(".ps-sec-h > b").allTextContents(), ["现在", "下一步", "近 30 天提交", "实战"]);
      assert.equal(await screen.locator(".ps-heat i").count(), 30, "热力条一格一天");
      assert.equal(await screen.locator(".ps-heat i.today").count(), 1);
      assert.deepEqual(await screen.locator(".ps-podium .nm").allTextContents(), ["skill-01", "skill-02", "skill-03"]);
      assert.equal(await screen.locator(".ps-podium .r1 .mvp").count(), 1, "第 1 名有 MVP 角标");
      assert.deepEqual(await screen.locator(".ps-rank .no").allTextContents(), ["04", "05", "06", "07", "08", "09", "10"]);
      const more = screen.locator(".ps-board-foot .g5-more");
      assert.equal(await more.textContent(), "其余 5 个 ▾", "其余在通栏分隔线下");
      assert.match(await screen.locator(".ps-board-foot .g7-codex").textContent(), /tdd ×3.*仅参考/);
      if (width === 1440) {
        const [pod, rank] = await Promise.all([screen.locator(".ps-podium").boundingBox(), screen.locator(".ps-rank").boundingBox()]);
        assert.ok(Math.abs(pod.y - rank.y) <= 1 && Math.abs(pod.y + pod.height - (rank.y + rank.height)) <= 1, "右侧 7 行与领奖台上下对齐");
      }
      await more.click();
      assert.equal(await screen.locator(".ps-rank li").count(), 12, "展开后列出其余");
      await noOverflow(page, `排行榜 ${width}`);
      await bigEnough(page, `排行榜 ${width}`);
      if (width === 1440) {
        const axe = await new AxeBuilder({ page }).include(".projects-space").analyze();
        assert.deepEqual(axe.violations.map((v) => v.id), []);
      }
      await context.close();
    }
    await board.close();
    ok("分节标题四节、热力条 30 格、前三领奖台 + 第 4–10 名对齐、其余在右下且能展开；1440 / 390 无溢出、44px、axe 无违规");
  }

  // ---- 名册读不到：卡带架位置只给原因和去设置 ----
  {
    await rm(app.rosterPath);
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await context.newPage();
    await page.goto(app.url + "/#projects");
    await page.locator(".ps-roster-error").waitFor();
    assert.match(await page.locator(".ps-roster-error").textContent(), /名册读不到/);
    assert.equal(await page.locator("#ps-screen").count(), 0);
    ok("名册读不到时只显示原因与去设置，档案屏不出现");
    await context.close();
  }
  assert.deepEqual(errors, []);
} finally {
  await browser.close();
  await app.close();
}
