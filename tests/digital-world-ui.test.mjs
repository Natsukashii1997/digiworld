import test from "node:test";
import assert from "node:assert/strict";
import { readFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { build } from "esbuild";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { seed, revise, current } from "../src/store.js";
import { fixture } from "./fixture.mjs";

// 组件与 HTTP 检查；不能替代浏览器里的视觉与交互验收。
const root = join(import.meta.dirname, "..");
const output = join(root, "test-results/digital-world-ui-render");
await mkdir(output, { recursive: true });
async function bundle(entry, name) {
  await build({
    absWorkingDir: root,
    entryPoints: [entry],
    bundle: true,
    platform: "node",
    jsx: 'automatic',
    format: "esm",
    outfile: join(output, name),
    packages: "external",
    logLevel: "silent",
  });
  return import(pathToFileURL(join(output, name)));
}
const { Assets, AssetDetail } = await bundle("src/Assets.jsx", "Assets.mjs");
const { Home } = await bundle("src/Home.jsx", "Home.mjs");
const { HomeHot } = await bundle("src/LifePages.jsx", "LifePages.mjs");
const {Collection}=await bundle('src/Collection.jsx','Collection.mjs');
const pixel = await bundle("src/pixel.jsx", "pixel.mjs");
const { PageHeading } = await bundle("src/components.jsx", "components.mjs");
const { PAGES, MATURITY, NAV } = await import("../src/pages.js");
const common = {
  save() {},
  adoptState() {},
  notify() {},
  openCreate() {},
  select() {},
  onFilter() {},
  onSelect() {},
  onClose() {},
  onEdit() {},
  navigate() {},
};
const render = (Component, props = {}) =>
  renderToStaticMarkup(
    React.createElement(Component, { ...common, state: seed(), ...props }),
  );

test("资产卡片、编号、版本与迭代阶段都由真实资产数据派生", () => {
  // 用户取消页头提示标签；保留每页一句介绍，权限逻辑仍由各业务流程测试守护。
  assert.match(PAGES.find(p=>p.id==='notes').lead,/值得反复用的，炼入焚决/);
  for (const page of PAGES) {
    const heading = render(PageHeading, {page:page.id});
    assert.doesNotMatch(heading, /page-bounds|aria-label="边界"/);
    assert.ok(heading.includes(page.lead), `${page.id} 保留一句介绍`);
  }
  for (const p of PAGES) {
    // 派单215已批准协同导语：用精确文案断言保留门禁，其他页面仍遵循原长度约束。
    if (p.id === 'collab') assert.equal(p.lead, '多 Agent 工作流的全过程：谁做了什么、交给了谁、过没过关。');
    else assert.ok([...p.lead].length <= 30 || p.id === 'assets' || p.id === 'calendar', `${p.id} 导语不超过 30 字`);
  }
  // #93（用户 2026-11-19）：只留 Prompt / Design / Skill 三页，默认 Prompt；卡片去掉编号与进化阶段。
  const html = render(Assets);
  assert.equal((html.match(/class="asset-card ac2"/g) || []).length, 2, "默认 Prompt 页 = 2 份演示 Prompt");
  assert.match(html, /class="asset-grid ac2-grid"/);
  assert.doesNotMatch(html, /aria-label="(?:网格视图|列表视图|视图模式)"|list-layout/);
  for (const code of ["SKL.01", "PRM.01", "WFL.02"]) assert.ok(!html.includes(code), `不再显示编号 ${code}`);
  assert.doesNotMatch(html, /class="stage-bar"/);
  assert.match(html, />新建<\/button>/);
  assert.doesNotMatch(html, /收录本机 Skill|MCP 配置|已归档/);
  assert.equal((html.match(/class="asset-delete"/g) || []).length, 2);
  assert.equal((html.match(/class="asset-copy-labeled"/g) || []).length, 2);
  assert.doesNotMatch(html, /class="cover-version"/);
  const SKILLS = /设计的最后一公里|有依据的深度研究/, PROMPTS = /把模糊想法，变成清晰问题|一次真正有用的复盘/;
  for (const [filter, want, not] of [["Prompt", PROMPTS, SKILLS], ["Workflow", PROMPTS, SKILLS]]) {
    const tab = render(Assets, { filter });
    assert.equal((tab.match(/class="asset-card ac2"/g) || []).length, 2, filter);
    assert.match(tab, want, `${filter} 页的卡片`);
    assert.doesNotMatch(tab, not, `${filter} 页不混入别的类型`);
  }
  // #93 第二批：Skill 页只读 my-skills（打开后才读），数码世界里的 Skill 资产不在这里显示。
  const skillTab = render(Assets, { filter: "Skill" });
  assert.equal((skillTab.match(/class="asset-card ac2/g) || []).length, 0);
  assert.doesNotMatch(skillTab, SKILLS);
  assert.match(skillTab, /正在读取 my-skills/);
  assert.doesNotMatch(render(Assets, { filter: "Workflow" }), /从灵感到上线|把经验，留在知识里/, "工作流不在资产仓库显示");
  const empty = render(Assets, { state: { ...seed(), assets: [] } });
  assert.match(empty, /还没有符合条件的资产/);
  assert.match(empty, />新建<\/button>/);
});

test("详情抽屉保留 Skill 本机交付与边界说明", () => {
  const state = seed();
  const html = render(AssetDetail, {
    state,
    asset: state.assets.find((asset) => asset.type === "Skill"),
  });
  assert.match(html, /role="dialog"/);
  assert.match(html, /aria-modal="true"/);
  assert.match(html, /class="drawer"/);
  assert.match(html, /复制本机安装口令/);
  assert.match(html, /仅限本机/);
});

test("没有使用证据时版本迭代不升级，伙伴只随自己的资产成长", () => {
  const state = seed();
  let asset = state.assets[0];
  const stages = [];
  for (let n = 1; n <= 8; n++) {
    stages.push(pixel.stageOf(asset));
    asset = revise(asset, { ...current(asset), title: `v${n + 1}` });
  }
  assert.deepEqual(stages, [1, 1, 1, 1, 1, 1, 1, 1]);
  // 用户 2026-09-29：伙伴固定为数码蛋，不再按资产数量进化；own 只统计自己的、未归档的资产。
  assert.equal(pixel.partnerOf(state).sprite, "egg");
  assert.equal(pixel.partnerOf(state).own, 0);
  const own = (n, extra = {}) =>
    Array.from({ length: n }, (_, i) => ({
      ...state.assets[i % 6],
      id: `own-${i}`,
      demo: false,
      ...extra,
    }));
  for (const n of [1, 3, 10]) {
    const partner = pixel.partnerOf({ ...state, assets: own(n) });
    assert.equal(partner.sprite, "egg");
    assert.equal(partner.own, n);
  }
  assert.equal(pixel.partnerOf({ ...state, assets: own(10, { archived: true }) }).own, 0);
  assert.equal(pixel.PARTNER_LINE, undefined);
  // 数码蛋改回最初的对称椭圆（用户 2026-09-30）：轮廓上下、左右都对称
  const egg = pixel.SPRITES.egg.frames[0];
  const outline = (row) => row.replace(/[^.]/g, "X");
  egg.forEach((row, y) => {
    assert.equal(outline(row), outline(egg[egg.length - 1 - y]), `第 ${y} 行上下对称`);
    assert.equal(outline(row), [...outline(row)].reverse().join(""), `第 ${y} 行左右对称`);
  });
});

test("首页中枢只展示已读事实，未读来源保持待核实", () => {
  const html = render(Home);
  for (const screen of ["ASSETS", "COLLECTION"]) assert.match(html, new RegExp(screen));
  assert.doesNotMatch(html, /待处理|AIHOT|接力|查知识/);
  assert.match(html, /正在读取个人收藏/);
  assert.match(html, /数码蛋/);
  assert.match(html, /被选召的孩子/);
  assert.doesNotMatch(html, /成长进度待定/);
  assert.doesNotMatch(html, /再完成 .* 次.*孵化/);
  const ids = PAGES.map((p) => p.id);
  assert.equal(new Set(ids).size, ids.length);
  for (const p of PAGES.filter((p) => p.id !== "home")) {
    assert.ok((p.id==='learning'||p.lead) && p.title && p.code, p.id);
    assert.ok(p.maturity in MATURITY, p.id);
  }
});

test("品牌改为数码世界，入口与样式没有残留旧主题", async () => {
  const html = await readFile(join(root, "index.html"), "utf8");
  const css = await readFile(join(root, "src/styles.css"), "utf8");
  assert.match(html, /数码世界 · 个人 AI 工作台/);
  assert.match(await readFile(join(root, "src/tokens.css"), "utf8"), /--orange: #ff8a24/);
  assert.match(css, /prefers-reduced-motion: reduce/);
  // 关键视觉模块的样式必须仍在（曾因大段替换误删暴龙机样式，视觉脚本未能发现）。
  for (const selector of [
    ".digivice-lcd",
    ".dv-lines",
    ".crest-ring",
    ".partner-line",
    ".partner-screen",
    ".brand-en",
    ".nav-count",
    ".home-row",
    ".empty-screen",
  ])
    assert.ok(css.includes(selector + " {") || css.includes(selector + ",") , selector);
  // UI v13.1（用户 2026-09-29）：进化线已按决定移除，伙伴液晶屏样式成为关键模块。
  const lcdCss = await readFile(join(root, "src/partner-lcd.css"), "utf8");
  for (const selector of [".lcd-screen", ".digivice-poke", ".data-bit", '.partner-screen[data-season="autumn"]'])
    assert.ok(lcdCss.includes(selector), selector);
  assert.match(lcdCss, /prefers-reduced-motion: reduce/);
  for (const file of ["index.html", "src/App.jsx", "src/components.jsx"])
    assert.ok(
      !/归集|DigimonArt|\/theme\/digievolution/.test(
        await readFile(join(root, file), "utf8"),
      ),
      file,
    );
});

test("本地 HTTP 供应当前构建的入口与资源", async () => {
  // The isolation runner explicitly selects GUIJI_TEST_DIST; verify that same build.
  const expectedBuild = process.env.GUIJI_TEST_DIST || join(root,"dist");
  const app = await fixture();
  try {
    const response = await fetch(app.url);
    assert.equal(response.status, 200);
    const html = await response.text();
    assert.equal(html, await readFile(join(expectedBuild, "index.html"), "utf8"));
    assert.match(html, /数码世界 · 个人 AI 工作台/);
    const paths = [...html.matchAll(/(?:src|href)="(\/assets\/[^"]+)"/g)].map(
      (match) => match[1],
    );
    assert.ok(paths.some((path) => path.endsWith(".js")));
    assert.ok(paths.some((path) => path.endsWith(".css")));
    for (const path of paths) {
      const result = await fetch(app.url + path);
      assert.equal(result.status, 200);
      assert.deepEqual(
        Buffer.from(await result.arrayBuffer()),
        await readFile(join(expectedBuild, path.slice(1))),
      );
    }
  } finally {
    await app.close();
  }
});

test("切片 1.2：兼容分组元数据保持有效，规划中页面如实标注", async () => {
  const { GROUPS, LAYERS } = await import("../src/pages.js");
  assert.deepEqual(GROUPS, ["今日", "资产", "目标", "生活", "系统"]);
  for (const p of PAGES) assert.ok(GROUPS.includes(p.group), p.id);
  // 结构地图覆盖除今日、待处理、系统之外的全部页面，各一次；并入其他页面的旧页（能力体检）与属于资产仓库的焚决不单列。
  const mapped = LAYERS.flatMap((l) => l.pages);
  assert.deepEqual(
    [...mapped].sort(),
    PAGES.filter((p) => !["今日", "系统"].includes(p.group) && !p.mergedInto && !p.partOf).map((p) => p.id).sort(),
  );
  for (const id of ["collab","calendar","health"]) assert.equal(PAGES.some(p=>p.id===id),false);
});

test("#93：焚决不再出现在资产仓库，#scrolls 旧链接落到 Prompt 页；卷数据不受影响", async () => {
  const { resolveRoute } = await import("../src/pages.js");
  // 用户 2026-09-30 纠正：焚决不再是独立页面；2026-11-19（#93）资产仓库只留 Prompt / Design / Skill，焚决页签去掉，数据保留。
  assert.equal(PAGES.some((p) => p.id === "scrolls"), false);
  assert.deepEqual(resolveRoute("scrolls"), { route: "assets", anchor: null, filter: "Prompt" });
  const entry = (id, text) => ({ id, text, tags: [], uses: 3, createdAt: "2026-09-30T00:00:00.000Z" });
  const state = {
    ...seed(),
    scrolls: [{ id: "s1", name: "心法", pinned: false, createdAt: "2026-09-30T00:00:00.000Z", entries: [entry("e1", "先定义问题")] }],
  };
  for (const filter of [undefined, "Scroll"]) {
    const html = render(Assets, filter ? { state, filter } : { state });
    assert.equal((html.match(/class="asset-card(?:\s[^"]*)?"/g) || []).length, 2, "只有 2 份演示 Prompt");
    assert.doesNotMatch(html, /焚决|心法|打开卷|data-scroll-entry-id|回收区/);
  }
});


test("UI v16：侧栏名称与首页中枢轻入口按用户决定", () => {
  // 用户 2026-09-29：夜间值守改名“夜巡”，搜索只在右上角。用户 2026-10-26：首页改叫“世界总览”。
  assert.equal(PAGES.find((p) => p.id === "home").label, "世界总览");
  assert.equal(PAGES.some(p => p.id === "night"), false);
  const html = render(Home);
  assert.doesNotMatch(html, /搜索 ⌘K/);
  assert.match(html, /记一笔/);
  // 用户 2026-10-26：首页删掉「新建资产」按钮，新建只在资产仓库里。
  assert.doesNotMatch(html, /新建资产/);
});

test("世界总览四块：收藏、资产、随手记、项目，每条可点开，资产按使用次数排并可直接复制", () => {
  // 用户 2026-10-26：恢复四块；资产去掉类型计数格，按使用次数排、带复制按钮；焚决不进常用列表；项目有提醒的排前面。
  const s = seed();
  const live = s.assets.filter(a => !a.archived);
  const [low, high] = [live[0], live[1]];
  const use = (asset, n) => Array.from({ length: n }, (_, i) => ({ schema: 1, id: asset.id + "-u" + i, assetId: asset.id, versionId: asset.versions.at(-1).id, at: "2026-10-2" + i + "T00:00:00.000Z", kind: "use", action: "copy-prompt" }));
  s.assetActivity = [...use(low, 1), ...use(high, 3)];
  s.notes = [
    { id: "n1", text: "旧的一条", at: "2026-10-20T00:00:00.000Z" },
    { id: "n2", text: "**新的一条**\n第二行", at: "2026-10-25T00:00:00.000Z" },
  ];
  s.connections = { ...(s.connections || {}), projects: [
    { id: "p1", name: "顺利项目", active: true, localPaths: ["/fixture/p1"] },
    { id: "p2", name: "停滞项目", active: true, localPaths: ["/fixture/p2"] },
    { id: "p3", name: "未启用项目", active: false, localPaths: ["/fixture/p3"] },
  ] };
  const projectStatus = { loaded: true, error: "", items: [
    { projectId: "p1", name: "顺利项目", current: { state: "ok", fields: { next: "写[交接](x.md)" } }, activity: { state: "active", latestAt: "2026-10-26T00:00:00.000Z" } },
    { projectId: "p2", name: "停滞项目", current: { state: "ok", fields: { next: "补测试" } }, activity: { state: "stalled", idleDays: 9, latestAt: "2026-10-10T00:00:00.000Z" } },
  ] };
  const html = render(Home, { state: s, projectStatus, refreshProjectStatus() {} });
  const titles = [...html.matchAll(/<h2 id="hx-title-([a-d])"><span class="en">([A-Z]+)<\/span>([^<]+)<\/h2>/g)].map(m => m[3]);
  assert.deepEqual(titles, ["个人收藏", "资产仓库", "随手记", "项目空间"]);
  assert.doesNotMatch(html, /资产类型统计|hx-type-grid/);
  // 资产：用过 3 次的排在用过 1 次的前面，每条都有打开按钮和复制按钮。
  const picks = [...html.matchAll(/aria-label="打开资产：([^"]+)"/g)].map(m => m[1]);
  assert.equal(picks.length, Math.min(5, live.filter(a => a.type !== "Scroll").length));
  assert.ok(picks.indexOf(current(high).title) < picks.indexOf(current(low).title));
  assert.match(html, /用过 <em class="mono">3<\/em> 次/);
  // 总数写在标题行（用户 2026-10-26：数字用模块色调）。
  assert.match(html, /<span class="hx-count" aria-label="2 个"><b class="mono">2<\/b><small>个<\/small><\/span>/);
  assert.equal((html.match(/class="asset-copy"/g) || []).length, picks.length);
  // 随手记：新的在前，标题去掉 Markdown 记号。
  assert.ok(html.indexOf('aria-label="打开随手记：新的一条"') < html.indexOf('aria-label="打开随手记：旧的一条"'));
  // 项目：只列在推进的，停滞的排前面，下一步去掉链接语法。
  assert.ok(html.indexOf("打开项目：停滞项目") < html.indexOf("打开项目：顺利项目"));
  assert.doesNotMatch(html, /未启用项目/);
  assert.match(html, /停滞 9 天/);
  assert.match(html, /下一步：写交接/);
  assert.doesNotMatch(html, /搜索 ⌘K|夜间窗口 23:00–07:00|个人说明修改建议|在待处理打开/);
  // 用户 2026-10-26 三块同水准：热度灯按列表最多那份折算 5 格；标题下「今天 +N」；随手记便签胶带；项目状态灯与最近动静。
  assert.match(html, /aria-label="使用热度 5\/5"/);
  assert.match(html, /aria-label="使用热度 2\/5"/);
  assert.equal((html.match(/class="hx-today/g) || []).length, 3, "收藏未读到时不写今天计数，其余三块都有");
  assert.match(html, /<li class="tone-(red|blue|green|yellow|gray)"><i class="hx-tape"/);
  assert.match(html, /class="hx-lamp stalled"/);
  assert.match(html, /class="hx-lamp active"/);
});

test("世界总览相对时间：刚刚、分钟、小时、昨天、天数，超过一周写日期", async () => {
  const { ago } = await bundle("src/HomeOverviewContent.jsx", "HomeOverviewContent.mjs");
  const now = Date.parse("2026-10-26T12:00:00+08:00");
  assert.equal(ago("2026-10-26T11:59:40+08:00", now), "刚刚");
  assert.equal(ago("2026-10-26T11:30:00+08:00", now), "30 分钟前");
  assert.equal(ago("2026-10-26T08:00:00+08:00", now), "4 小时前");
  assert.equal(ago("2026-10-25T23:00:00+08:00", now), "昨天");
  assert.equal(ago("2026-10-23T09:00:00+08:00", now), "3 天前");
  assert.match(ago("2026-10-10T09:00:00+08:00", now), /^10\/10$/);
  assert.equal(ago("坏时间", now), "时间未知");
});

test("个人收藏保留learning路由，侧栏不分区且不恢复旧书架", () => {
  // 用户 2026-10-26：侧栏去掉“捕获”“炼化与出战”分组标题，个人收藏排在资产仓库后、随手记前；编号按此顺序连续。
  const page=PAGES.find(page=>page.id==='learning');assert.equal(page.group,'资产');assert.equal(page.label,'个人收藏');assert.equal(PAGES[PAGES.findIndex(p=>p.id==='assets')+1].id,'learning');assert.equal(PAGES[PAGES.findIndex(p=>p.id==='learning')+1].id,'notes');assert.equal(page.plan,undefined);
  // 常浩 2026-11-07（#74）：侧栏改为「体系·只读」「我的素材·可写」两组，设置沉底不加标题。
  assert.deepEqual(NAV.map(s=>s.heading||null),['体系·只读','我的素材·可写',null]);
  assert.deepEqual(NAV.flatMap(s=>s.items),PAGES.map(p=>p.id));
  assert.deepEqual(PAGES.map(p=>p.code),PAGES.map((_,i)=>String(i).padStart(2,'0')));
  const html=render(Collection);assert.match(html,/<h1[^>]*>个人收藏<\/h1>/);assert.match(html,/aria-label="收藏分组"/);assert.match(html,/aria-label="搜索收藏"/);assert.doesNotMatch(html,/<h2[^>]*>收藏画布<\/h2>/);assert.doesNotMatch(html,/书架|学习状态|链接收藏|回收区/);
  // 世界总览热点卡：首屏渲染时还没有读到缓存，如实写“正在读取”，不放假数据。
  const hot = renderToStaticMarkup(React.createElement(HomeHot, { navigate() {} }));
  assert.match(hot, /今日热点/);
  assert.match(hot, /正在读取本机缓存/);
  assert.doesNotMatch(hot, /<a /);
});
