// 路线 v3 切片 1.2：导航两区重排——今日 / 工作区 / 生活区 / 系统；改名；版本归档下移 + 资产详情“历史”标签；
// 能力体检并入智能体群（#health 仍可访问）；生活区 AI HOT、学习成长已开发，银饰计划仍是规划中；390 宽无横溢；键盘可达；axe。
import { createRequire } from "node:module";
import assert from "node:assert/strict";
import AxeBuilder from "@axe-core/playwright";
import { fixture } from "./fixture.mjs";
const { chromium } = createRequire(import.meta.url)(
  process.env.PLAYWRIGHT_MODULE ||
    "/Users/nat/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright",
);
const app = await fixture();
const browser = await chromium.launch();
const errors = [];
const ok = (s) => console.log("PASS", s);

// 产品定义 v1.2 §2.1 的分区、分组与顺序；版本归档在系统分组最下方。
const EXPECTED = [
  ["今日", [["", ["世界总览"]]]],
  [
    "工作区",
    [
      ["资产", ["资产仓库", "逆向工程"]],
      ["目标", ["智能体群", "项目空间"]],
      ["运行", ["协同", "夜巡"]],
      ["知识", ["知识仓库"]],
    ],
  ],
  ["生活区", [["", ["日历", "随手记", "AI HOT", "学习成长", "银饰计划"]]]],
  ["系统", [["", ["模型设置", "版本归档"]]]],
];
const OLD_NAMES = ["知识中枢", "逆向参考", "随手速记"];
// 路线 v3 切片 5.3、5.4：AI HOT 与学习成长已开发；银饰计划自路线 v3 5.5（分支 silver-agents）起为“可用”。
// 集成后生活区这三页都不再是规划页（日历不在本段检查范围内，与基点一致）。
const LIFE_PLANNED = [];
const LIFE_BUILT = [
  ["aihot", "AI HOT"],
  ["learning", "学习成长"],
];

async function open(width, hash = "home", height = 1000) {
  const context = await browser.newContext({
    viewport: { width, height },
    reducedMotion: "reduce",
  });
  const page = await context.newPage();
  page.setDefaultTimeout(10000);
  page.on("pageerror", (e) => errors.push(`${width} ${e.message}`));
  await page.goto(`${app.url}/#${hash}`);
  await page.locator("main h1").first().waitFor();
  return page;
}
const nav = (page) => page.getByRole("navigation", { name: "主导航" });
const navItem = (page, label) =>
  nav(page).locator(".nav-item", { has: page.locator(`span:text-is("${label}")`) });
async function noOverflow(page, label) {
  const over = await page.evaluate(
    () => document.documentElement.scrollWidth - innerWidth,
  );
  assert.ok(over <= 0, `${label} 横向溢出 ${over}px`);
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
// 读出侧栏结构：[区名, [[分组标题, [项目名…]]…]]
const readStructure = (page) =>
  nav(page).evaluate((root) =>
    [...root.querySelectorAll(":scope > .nav-zone")].map((zone) => [
      zone.getAttribute("aria-label"),
      [...zone.querySelectorAll(".nav-group")].map((group) => [
        group.querySelector(".nav-heading")?.textContent.trim() || "",
        [...group.querySelectorAll(".nav-item > span:not(.sr-only)")].map((s) =>
          s.textContent.trim(),
        ),
      ]),
    ]),
  );

try {
  const page = await open(1440);

  // 1. 四段分区与顺序
  assert.deepEqual(await readStructure(page), EXPECTED);
  for (const zone of ["工作区", "生活区"]) {
    await nav(page).locator(".nav-zone-title", { hasText: zone }).waitFor();
    assert.ok(
      await nav(page).locator(".nav-zone-title", { hasText: zone }).isVisible(),
      `${zone} 区名应可见`,
    );
  }
  // 工作区与生活区之间有分隔线：分隔线位于工作区最后一项之后、生活区第一项之前。
  const separator = nav(page).locator('[role="separator"]');
  assert.ok((await separator.count()) >= 1, "应有分隔线");
  const [lastWork, firstLife, line] = await Promise.all([
    navItem(page, "知识仓库").boundingBox(),
    navItem(page, "日历").boundingBox(),
    nav(page)
      .locator('.nav-zone[aria-label="生活区"] [role="separator"]')
      .first()
      .boundingBox(),
  ]);
  assert.ok(line, "生活区开头应有分隔线");
  assert.ok(line.height >= 1 && line.width > 20, "分隔线应可见");
  assert.ok(
    line.y >= lastWork.y + lastWork.height && line.y <= firstLife.y,
    "分隔线应在工作区与生活区之间",
  );
  assert.equal(
    await nav(page).locator(".nav-item").last().locator("span").first().innerText(),
    "版本归档",
    "版本归档应在导航最下方",
  );
  for (const hidden of ["能力体检", "NAS 照片", ...OLD_NAMES])
    assert.equal(await navItem(page, hidden).count(), 0, `导航不应有 ${hidden}`);
  ok("侧栏四段：今日 / 工作区（资产、目标、运行、知识）/ 生活区 / 系统，顺序正确，版本归档在最下");

  // 2. 三个改名：导航、页头、面包屑一致
  for (const name of ["知识仓库", "逆向工程", "随手记"]) {
    await navItem(page, name).click();
    await page.locator("main h1", { hasText: name }).waitFor();
    assert.equal(await page.locator("main h1").first().innerText(), name);
    assert.equal(await page.locator(".crumbs strong").innerText(), name);
    const body = await page.locator("body").innerText();
    for (const old of OLD_NAMES) assert.ok(!body.includes(old), `${name} 页仍出现旧名 ${old}`);
  }
  await page.keyboard.press("Meta+k");
  await page.getByRole("dialog", { name: "搜索工作台" }).waitFor();
  const paletteText = await page.getByRole("dialog").innerText();
  for (const old of OLD_NAMES) assert.ok(!paletteText.includes(old), `搜索浮层仍出现旧名 ${old}`);
  await page.keyboard.press("Escape");
  ok("改名：知识仓库、逆向工程、随手记（导航、页头、面包屑、搜索浮层）");

  // 3. 版本归档页仍可达；资产详情抽屉有“历史”标签并复用 AssetHistory
  await navItem(page, "版本归档").click();
  await page.locator("main h1", { hasText: "版本归档" }).waitFor();
  await navItem(page, "资产仓库").click();
  await page.locator(".asset-card").first().waitFor();
  await page.getByRole("button", { name: "查看 设计的最后一公里", exact: true }).click();
  const drawer = page.getByRole("dialog", { name: "资产详情" });
  const historyTab = drawer.getByRole("button", { name: /^历史 \d+$/ });
  await historyTab.click();
  assert.equal(await historyTab.getAttribute("aria-pressed"), "true");
  await drawer.getByLabel("查看版本", { exact: true }).waitFor();
  await drawer.getByLabel("比较到", { exact: true }).waitFor();
  await page.keyboard.press("Escape");
  ok("版本归档页可达；资产详情“历史”标签显示版本查看与比较");

  // 4. #health 不死链：跳到智能体群的能力体检分区
  await page.goto(`${app.url}/#health`);
  await page.locator("main h1", { hasText: "智能体群" }).waitFor();
  const health = page.locator("#agent-health");
  await health.waitFor();
  await page.waitForFunction(() => location.hash === "#agents");
  assert.equal(
    await health.getByRole("heading", { name: "能力体检" }).count(),
    1,
  );
  assert.match(await health.innerText(), /规划中/);
  assert.match(await health.innerText(), /尚未开发，这个页面不会执行任何动作/);
  assert.equal(
    await navItem(page, "智能体群").getAttribute("aria-current"),
    "page",
  );
  await page.waitForFunction(() => {
    const r = document.getElementById("agent-health").getBoundingClientRect();
    return r.top >= 0 && r.top < innerHeight;
  });
  assert.equal(
    await page.evaluate(() => document.activeElement?.id),
    "agent-health",
    "跳转后焦点应落在能力体检分区",
  );
  // 分区里没有无效按钮：只有跳转链接
  assert.equal(
    await health.locator("button").count(),
    await health.locator(".plan-link").count(),
  );
  await axe(page, "agents#health");
  // 站内跳转（搜索浮层“能力体检”）同样落到分区
  await navItem(page, "世界总览").click();
  await page.keyboard.press("Meta+k");
  await page.getByLabel("全局搜索").fill("能力体检");
  await page.getByRole("dialog").getByRole("button", { name: /能力体检/ }).first().click();
  await page.locator("#agent-health").waitFor();
  assert.equal(await page.locator("main h1").first().innerText(), "智能体群");
  ok("#health 与站内跳转都落到智能体群的“能力体检”分区（规划中），焦点与视口正确，axe 通过");

  // 5. 生活区三个规划中页面可达，如实标注，不放无效按钮
  for (const [id, name] of LIFE_PLANNED) {
    await navItem(page, name).click();
    await page.locator("main h1", { hasText: name }).waitFor();
    const main = page.locator("main");
    assert.match(await main.innerText(), /规划中/);
    assert.match(await main.innerText(), /尚未开发，这个页面不会执行任何动作/);
    assert.equal(
      await main.locator("button").count(),
      await main.locator(".plan-link").count(),
      `${name} 不应有无效按钮`,
    );
    assert.equal(await page.evaluate(() => location.hash), `#${id}`);
    await page.goto(`${app.url}/#${id}`);
    await page.locator("main h1", { hasText: name }).waitFor();
  }
  for (const [id, name] of LIFE_BUILT) {
    await navItem(page, name).click();
    await page.locator("main h1", { hasText: name }).waitFor();
    const main = page.locator("main");
    assert.doesNotMatch(await main.innerText(), /尚未开发，这个页面不会执行任何动作/);
    assert.match(await main.innerText(), /部分可用/);
    assert.equal(await page.evaluate(() => location.hash), `#${id}`);
  }
  await axe(page, "learning");
  ok("生活区 AI HOT、学习成长可达且不再标注规划中；银饰计划已可用（由 silver-agents-browser 覆盖），axe 通过");

  // 6. 世界总览结构地图同步为两区
  await page.goto(`${app.url}/#home`);
  await page.locator(".today-hero").waitFor();
  // 首页各区块只出现一次（防止结构地图替换时重复拼接）
  assert.equal(await page.locator("main h2", { hasText: "能力地图" }).count(), 1);
  assert.equal(await page.locator("main h2", { hasText: /^待处理 ·/ }).count(), 1);
  const map = page.locator(".structure-map");
  for (const zone of ["工作区", "生活区"])
    await map.getByRole("heading", { name: zone }).waitFor();
  const mapText = await map.innerText();
  for (const name of ["逆向工程", "知识仓库", "随手记", "AI HOT", "学习成长", "银饰计划", "版本归档"])
    assert.ok(mapText.includes(name), `结构地图应含 ${name}`);
  assert.equal(
    await map.locator(".manage-row strong", { hasText: "能力体检" }).count(),
    0,
    "结构地图不应单列能力体检",
  );
  assert.match(
    await map.locator(".manage-row", { hasText: "智能体群" }).innerText(),
    /含能力体检（规划中）/,
  );
  await axe(page, "home");
  ok("世界总览结构地图按工作区 / 生活区展示");

  // 7. 键盘可达：从世界总览向下 Tab 到版本归档并用回车打开
  await navItem(page, "世界总览").focus();
  let reached = false;
  for (let i = 0; i < 30; i += 1) {
    await page.keyboard.press("Tab");
    const label = await page.evaluate(
      () => document.activeElement?.querySelector("span")?.textContent,
    );
    if (label === "版本归档") {
      reached = true;
      break;
    }
  }
  assert.ok(reached, "Tab 应能到达版本归档");
  await page.keyboard.press("Enter");
  await page.locator("main h1", { hasText: "版本归档" }).waitFor();
  ok("键盘可逐项到达侧栏最底部的版本归档");
  await page.context().close();

  // 8. 390 宽：抽屉导航、44px、无横溢、axe
  const mobile = await open(390, "home", 844);
  for (const hash of ["home", "agents", "health", "aihot", "learning", "silver", "notes", "knowledge", "references", "history"]) {
    await mobile.goto(`${app.url}/#${hash}`);
    await mobile.locator("main h1").first().waitFor();
    await noOverflow(mobile, `390 #${hash}`);
  }
  const toggle = mobile.getByRole("button", { name: "打开导航" });
  const tb = await toggle.boundingBox();
  assert.ok(tb.width >= 44 && tb.height >= 44, `打开导航 ${tb.width}x${tb.height}`);
  await toggle.click();
  await nav(mobile).locator(".nav-zone-title", { hasText: "生活区" }).waitFor();
  assert.deepEqual(await readStructure(mobile), EXPECTED);
  for (const label of ["世界总览", "随手记", "版本归档"]) {
    const box = await navItem(mobile, label).boundingBox();
    assert.ok(box.height >= 44, `${label} 抽屉内高度 ${box.height}`);
  }
  await noOverflow(mobile, "390 抽屉");
  await axe(mobile, "390 drawer");
  await navItem(mobile, "银饰计划").click();
  await mobile.locator("main h1", { hasText: "银饰计划" }).waitFor();
  assert.ok(
    !(await mobile.locator(".sidebar.mobile-open").count()),
    "选中后抽屉应关闭",
  );
  ok("390 宽：抽屉导航四段可用、条目 44px、无横向溢出、axe 通过");

  assert.deepEqual(errors, []);
  console.log("nav-zones-browser: all passed");
} finally {
  await browser.close();
  await app.close();
}
