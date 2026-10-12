// 路线 v3 切片 1.2：导航两区重排——今日 / 工作区 / 生活区 / 系统；改名；存档点下移 + 资产详情“历史”标签；
// 能力体检并入智能体群（#health 仍可访问）；生活区 AI HOT、收藏已开发；390 宽无横溢；键盘可达；axe。
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

// 产品定义 v1.2 §2.1 的分区、分组与顺序；存档点在系统分组最下方。
const EXPECTED = [
  ["今日", [["", ["世界总览"]]]],
  [
    "工作区",
    [
      // 用户 2026-10-04：侧栏删去“资产/目标/运行/知识”小标题，只保留板块名；分组顺序不变。
      ["", ["资产仓库", "逆向工程"]],
      ["", ["智能体群", "项目空间"]],
      ["", ["协同", "夜巡"]],
      ["", ["知识仓库"]],
    ],
  ],
  ["生活区", [["", ["日历", "随手记", "AI HOT", "收藏"]]]],
  ["系统", [["", ["设置", "存档点"]]]],
];
const OLD_NAMES = ["知识中枢", "逆向参考", "随手速记"];
// 路线 v3 切片 5.3、5.4：AI HOT 与收藏已开发。
const LIFE_PLANNED = [];
const LIFE_BUILT = [
  ["aihot", "AI HOT"],
  ["learning", "收藏"],
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


// 派单155 C02：每项真正命中区44px，1000px视口滚动后中心点仍可命中；不得只量offscreen节点。
async function navigationHits(page, label) {
  for (const item of await nav(page).locator('.nav-item').all()) {
    await item.scrollIntoViewIfNeeded();
    const size = await item.evaluate(e => {
      const r=e.getBoundingClientRect(),clip=e.closest('.sidebar').getBoundingClientRect();
      const x=r.left+r.width/2,y=r.top+r.height/2;
      return {width:r.width,height:r.height,centerVisible:y>=Math.max(clip.top,0)&&y<=Math.min(clip.bottom,innerHeight),hit:document.elementFromPoint(x,y)?.closest('.nav-item')===e};
    });
    assert(size.width>=44&&size.height>=44,`${label} ${await item.innerText()} ${JSON.stringify(size)}`);
    assert(size.centerVisible&&size.hit,`${label} 条目滚入后中心点可命中 ${await item.innerText()}`);
  }
  if (await page.evaluate(()=>innerWidth>960)) {
    assert(await nav(page).evaluate(e=>e.scrollTop>0),'1000px视口导航滚到底部');
    await nav(page).evaluate(e=>{e.scrollTop=0;});
    assert.equal(await nav(page).evaluate(e=>e.scrollTop),0,'截图前导航复位');
    const first=navItem(page,'世界总览');
    assert(await first.evaluate(e=>{const r=e.getBoundingClientRect(),n=e.closest('nav').getBoundingClientRect();return r.top>=n.top&&r.bottom<=n.bottom;}),'复位后世界总览全文在导航窗口内');
  }
}

try {
  const page = await open(1440);
  await navigationHits(page, "1440×1000");

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
    "存档点",
    "存档点应在导航最下方",
  );
  for (const hidden of ["能力体检", "NAS 照片", ...OLD_NAMES])
    assert.equal(await navItem(page, hidden).count(), 0, `导航不应有 ${hidden}`);
  ok("侧栏四段：今日 / 工作区（资产、目标、运行、知识）/ 生活区 / 系统，顺序正确，存档点在最下");

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

  // 3. 存档点页仍可达；资产详情抽屉有“历史”标签并复用 AssetHistory
  await navItem(page, "存档点").click();
  await page.locator("main h1", { hasText: "存档点" }).waitFor();
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
  ok("存档点页可达；资产详情“历史”标签显示版本查看与比较");

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
  assert.doesNotMatch(await health.innerText(), /规划中/);
  assert.match(await health.innerText(), /尚未体检/);
  assert.equal(await health.getByRole("button",{name:"检查全部支持体检的已登记 Agent",exact:true}).count(),1);
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
  // 分区里没有无效按钮：已实现的检查入口
  assert.equal(
    await health.locator("button").count(),
    1,
  );
  await axe(page, "agents#health");
  // 站内跳转（搜索浮层“能力体检”）同样落到分区
  await navItem(page, "世界总览").click();
  await page.keyboard.press("Meta+k");
  await page.getByLabel("全局搜索").fill("能力体检");
  await page.getByRole("dialog").getByRole("button", { name: /能力体检/ }).first().click();
  await page.locator("#agent-health").waitFor();
  assert.equal(await page.locator("main h1").first().innerText(), "智能体群");
  ok("#health 与站内跳转都落到智能体群的“能力体检”分区，焦点与视口正确，axe 通过");

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
  ok("生活区 AI HOT、收藏可达且不再标注规划中，axe 通过");

  // 6. 第二版首页以四区中枢承接信息，完整页面导航仍留在侧栏。
  await page.goto(`${app.url}/#home`);
  await page.locator(".hx").waitFor();
  for (const [id, title] of [["a", "今日"], ["b", "待处理"], ["c", "协同"], ["d", "在推进"]])
    assert.equal(await page.locator(`.hx-mod-${id}`).getByRole("heading", { name: new RegExp(title) }).count(), 1);
  assert.equal(await page.locator(".structure-map, section.home-hot").count(), 0);
  for (const name of ["逆向工程", "知识仓库", "随手记", "AI HOT", "收藏", "存档点"])
    await navItem(page, name).waitFor();
  assert.equal(await navItem(page, "银饰计划").count(), 0);
  await axe(page, "home");
  ok("世界总览四区中枢只出现一次；原页面入口保留在侧栏");

  // 7. 键盘可达：从世界总览向下 Tab 到存档点并用回车打开
  await navItem(page, "世界总览").focus();
  let reached = false;
  for (let i = 0; i < 30; i += 1) {
    await page.keyboard.press("Tab");
    const label = await page.evaluate(
      () => document.activeElement?.querySelector("span")?.textContent,
    );
    if (label === "存档点") {
      reached = true;
      break;
    }
  }
  assert.ok(reached, "Tab 应能到达存档点");
  await page.keyboard.press("Enter");
  await page.locator("main h1", { hasText: "存档点" }).waitFor();
  ok("键盘可逐项到达侧栏最底部的存档点");
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
  for (const label of ["世界总览", "随手记", "存档点"]) {
    const box = await navItem(mobile, label).boundingBox();
    assert.ok(box.height >= 44, `${label} 抽屉内高度 ${box.height}`);
  }
  await navigationHits(mobile,"390抽屉");
  await noOverflow(mobile, "390 抽屉");
  await axe(mobile, "390 drawer");
  await navItem(mobile, "收藏").click();
  await mobile.locator("main h1", { hasText: "收藏" }).waitFor();
  assert.ok(
    !(await mobile.locator(".sidebar.mobile-open").count()),
    "选中后抽屉应关闭",
  );
  ok("390 宽：抽屉导航四段可用、条目 44px、无横向溢出、axe 通过");

  // 窄屏最小宽度也逐项验证，不把390结果外推到320。
  const narrow = await open(320, "home", 1000);
  await narrow.getByRole("button", {name:"打开导航",exact:true}).click();
  await navigationHits(narrow,"320抽屉");
  await noOverflow(narrow,"320抽屉");
  await axe(narrow,"320 drawer");
  await narrow.context().close();
  assert.deepEqual(errors, []);
  console.log("nav-zones-browser: all passed");
} finally {
  await browser.close();
  await app.close();
}
