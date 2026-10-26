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
  const html = render(Assets);
  assert.equal((html.match(/class="asset-card"/g) || []).length, 6);
  assert.match(html, /class="asset-grid"/);
  assert.doesNotMatch(html, /aria-label="(?:网格视图|列表视图|视图模式)"|list-layout/);
  for (const code of ["SKL.01", "SKL.02", "PRM.01", "WFL.02"])
    assert.ok(html.includes(code), code);
  assert.equal((html.match(/class="stage-bar"/g) || []).length, 6);
  assert.match(html, />新建<\/button>/);
  assert.doesNotMatch(html, /收录本机 Skill|MCP 配置|已归档/);
  assert.equal((html.match(/class="asset-delete"/g) || []).length, 6);
  assert.doesNotMatch(html, /class="cover-version"/);
  for (const filter of ["Skill", "Prompt", "Workflow"])
    assert.equal(
      (render(Assets, { filter }).match(/class="asset-card"/g) || []).length,
      2,
    );
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

test("切片 1.3b：焚决是资产仓库第五种类型，#scrolls 旧链接落到资产仓库焚决标签", async () => {
  const { resolveRoute } = await import("../src/pages.js");
  // 用户 2026-09-30 纠正：焚决不再是独立页面。
  assert.equal(PAGES.some((p) => p.id === "scrolls"), false);
  assert.deepEqual(resolveRoute("scrolls"), { route: "assets", anchor: null, filter: "Scroll" });
  const scroll = (id, name, entries, extra = {}) => ({
    id,
    name,
    pinned: false,
    createdAt: "2026-09-30T00:00:00.000Z",
    entries,
    ...extra,
  });
  const entry = (id, text, tags, uses) => ({ id, text, tags, uses, createdAt: "2026-09-30T00:00:00.000Z" });
  const state = {
    ...seed(),
    scrolls: [
      scroll("s1", "心法", [entry("e1", "先定义问题", ["判断", "核心"], 3), entry("e2", "小步可逆", ["判断"], 1)]),
      scroll("s2", "已删卷", [], { deletedAt: "2026-09-30T01:00:00.000Z" }),
    ],
  };
  const all = render(Assets, { state });
  assert.equal((all.match(/class="asset-card(?:\s[^"]*)?"/g) || []).length, 7, "全部 = 6 份资产 + 1 张焚决卡");
  assert.match(all, /title="焚决 · 心法"/);
  assert.match(all, /data-scroll-entry-id="e1"/);
  assert.match(all, /data-scroll-entry-id="e2"/);
  assert.match(all, /打开卷 心法/);
  assert.doesNotMatch(all, /已删卷/);
  const tab = render(Assets, { state, filter: "Scroll" });
  assert.equal((tab.match(/class="asset-card(?:\s[^"]*)?"/g) || []).length, 1);
  assert.match(tab, /复制 3 次/);
  assert.match(tab, /复制 1 次/);
  assert.match(tab, /回收区/);
});

test("UI v16：侧栏名称与首页中枢轻入口按用户决定", () => {
  // 用户 2026-09-29：夜间值守改名“夜巡”，搜索只在右上角。用户 2026-10-26：首页改叫“世界总览”。
  assert.equal(PAGES.find((p) => p.id === "home").label, "世界总览");
  assert.equal(PAGES.some(p => p.id === "night"), false);
  const html = render(Home);
  assert.doesNotMatch(html, /搜索 ⌘K/);
  for (const action of ["记一笔", "新建资产"]) assert.match(html, new RegExp(action));
});

test("首页资产读取现有数据，不再提供已删除板块入口", () => {
  const s = seed();
  s.notes = [{ id: "n1", text: "合成随手记", at: "2026-09-29T00:00:00.000Z" }];
  s.profileProposals=[{id:"home-proposal",status:"pending",path:"个人上下文/合成.md",reason:"合成需要核对",proposer:"Codex",createdAt:"2026-09-29T00:00:00.000Z"}];
  const html = render(Home, { state: s, vaultReceipts:{loaded:true,noteIds:[]} });
  // 用户 2026-10-16 用资产摘要替换日历卡；待处理来源语义保持。
  assert.match(html, /资产类型统计/);
  assert.match(html, /最近更新/);
  assert.doesNotMatch(html, /夜间窗口 23:00–07:00/);
  assert.doesNotMatch(html, /个人说明修改建议/);
  assert.doesNotMatch(html,/随手记尚无当前正文匹配的 Vault 写入回执/);
  assert.doesNotMatch(html, /在待处理打开/);
});

test("个人收藏保留learning路由，侧栏不分区且不恢复旧书架", () => {
  // 用户 2026-10-26：侧栏去掉“捕获”“炼化与出战”分组标题，个人收藏排在资产仓库后、随手记前；编号按此顺序连续。
  const page=PAGES.find(page=>page.id==='learning');assert.equal(page.group,'资产');assert.equal(page.label,'个人收藏');assert.equal(PAGES[PAGES.findIndex(p=>p.id==='assets')+1].id,'learning');assert.equal(PAGES[PAGES.findIndex(p=>p.id==='learning')+1].id,'notes');assert.equal(page.plan,undefined);
  assert.equal(NAV.some(s=>s.heading),false);
  assert.deepEqual(NAV.flatMap(s=>s.items),PAGES.map(p=>p.id));
  assert.deepEqual(PAGES.map(p=>p.code),PAGES.map((_,i)=>String(i).padStart(2,'0')));
  const html=render(Collection);assert.match(html,/<h1[^>]*>个人收藏<\/h1>/);assert.match(html,/aria-label="收藏分组"/);assert.match(html,/aria-label="搜索收藏"/);assert.doesNotMatch(html,/<h2[^>]*>收藏画布<\/h2>/);assert.doesNotMatch(html,/书架|学习状态|链接收藏|回收区/);
  // 世界总览热点卡：首屏渲染时还没有读到缓存，如实写“正在读取”，不放假数据。
  const hot = renderToStaticMarkup(React.createElement(HomeHot, { navigate() {} }));
  assert.match(hot, /今日热点/);
  assert.match(hot, /正在读取本机缓存/);
  assert.doesNotMatch(hot, /<a /);
});
