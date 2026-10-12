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
const { PlannedPage } = await bundle("src/PlannedPage.jsx", "PlannedPage.mjs");
const { InboxDrawer: Inbox } = await bundle("src/InboxDrawer.jsx", "InboxDrawer.mjs");
const { HomeHot } = await bundle("src/LifePages.jsx", "LifePages.mjs");
const {Collection}=await bundle('src/Collection.jsx','Collection.mjs');
const pixel = await bundle("src/pixel.jsx", "pixel.mjs");
const { PAGES, MATURITY } = await import("../src/pages.js");
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
  // UI v15 页头减负（Claude 165）：导语只写一句，边界说明移到 bounds 标签；断言改在“导语 + 标签”整体上，语义不变。
  const said = (id) => { const p = PAGES.find((x) => x.id === id); return [p.lead, ...(p.bounds || [])].join("｜").replace(/!/g, ""); };
  assert.match(said('night'),/默认关闭.*授权后服务可在指定窗口自动执行/);
  assert.doesNotMatch(said('night'),/不会自动运行任何任务/);
  assert.match(said('settings'),/默认关闭.*开启前预览/);
  assert.match(PAGES.find(p=>p.id==='notes').lead,/值得反复用的，炼入焚决/);
  assert.deepEqual(PAGES.find(p=>p.id==='notes').bounds,['只存本机']);
  for (const p of PAGES) {
    // 派单215已批准协同导语：用精确文案断言保留门禁，其他页面仍遵循原长度约束。
    if (p.id === 'collab') assert.equal(p.lead, '多 Agent 工作流的全过程：谁做了什么、交给了谁、过没过关。');
    else assert.ok([...p.lead].length <= 30 || p.id === 'assets' || p.id === 'calendar', `${p.id} 导语不超过 30 字`);
  }
  const html = render(Assets);
  assert.equal((html.match(/class="asset-card"/g) || []).length, 6);
  assert.match(html, /aria-label="网格视图" aria-pressed="true"/);
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
  for (const screen of ["TODAY", "QUESTS", "WORKFLOW", "SAVE DATA"]) assert.match(html, new RegExp(screen));
  assert.match(html, /提醒事项未读取，Todo 待核实/);
  assert.match(html, /协同协议待核实|正在读取协同协议/);
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
  assert.match(css, /--orange: #ff8a24/);
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

test("切片 1.2：导航按今日、资产、目标、运行、知识、生活、系统分组，规划中页面如实标注", async () => {
  const { GROUPS, LAYERS } = await import("../src/pages.js");
  assert.deepEqual(GROUPS, ["今日", "资产", "目标", "运行", "知识", "生活", "系统"]);
  for (const p of PAGES) assert.ok(GROUPS.includes(p.group), p.id);
  // 结构地图覆盖除今日、待处理、系统之外的全部页面，各一次；并入其他页面的旧页（能力体检）与属于资产仓库的焚决不单列。
  const mapped = LAYERS.flatMap((l) => l.pages);
  assert.deepEqual(
    [...mapped].sort(),
    PAGES.filter((p) => !["今日", "系统"].includes(p.group) && !p.mergedInto && !p.partOf).map((p) => p.id).sort(),
  );
  // 协同页自路线 v3 切片 2.3/2.4 起可用（看板、留痕、一键派发），不再是规划页；成熟度如实标“部分可用”。
  assert.equal(PAGES.find((x) => x.id === "collab").maturity, "partial");
  // 路线 v3 切片 5.3、5.4：AI HOT 与学习成长已开发，不再是规划中页面（见下方单独的用例）。
  // 路线 v3 切片 5.2（分支 backup-calendar）：日历已开发，标“部分可用”，由 calendar-todo-browser.mjs 覆盖。
  assert.equal(PAGES.find((x) => x.id === "calendar").maturity, "partial");
  assert.equal(PAGES.find((x) => x.id === "calendar").plan, undefined);
  // 派单148：能力体检已并入智能体群；未覆盖的运行状态保持未知。
  const health = PAGES.find(p=>p.id==="health");
  assert.equal(health.maturity,"partial");
  assert.equal(health.mergedInto,"agents");
  assert.equal(health.anchor,"agent-health");
  const {HealthAudit}=await bundle("src/HealthAudit.jsx", "HealthAudit.mjs");
  const html=renderToStaticMarkup(React.createElement(HealthAudit,{}));
  assert.match(html,/尚未体检/);
  assert.match(html,/检查全部支持体检的已登记 Agent/);
  assert.match(html,/MCP正文、凭据或会话/);
  assert.match(html,/gateway在线情况待接入数据/);
  assert.equal((html.match(/<button/g)||[]).length,1);
  assert.doesNotMatch(html,/尚未开发，这个页面不会执行任何动作/);
  const inbox = renderToStaticMarkup(
    // 规则装入记录已读完时才能给出“没有事项”的结论（WB-20260930-83）
    React.createElement(Inbox, { ...common, state: seed(), items: [], ruleInstalls: { items: [], error: "", loaded: true } }),
  );
  assert.match(inbox, /没有要你处理的事/);
  assert.doesNotMatch(inbox, /来源记录范围说明|待处理来源/);
  const loading = renderToStaticMarkup(React.createElement(Inbox,{...common,state:seed(),items:[],ruleInstalls:{loaded:false,items:[]}}));
  assert.match(loading,/读完前不能确定待处理是否完整/);
  assert.doesNotMatch(loading,/没有要你处理的事/);
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
  assert.equal((all.match(/class="asset-card"/g) || []).length, 7, "全部 = 6 份资产 + 1 张焚决卡");
  assert.match(all, /FJ\.01/);
  assert.match(all, /2 条/);
  assert.match(all, /打开卷 心法/);
  assert.doesNotMatch(all, /已删卷/);
  const tab = render(Assets, { state, filter: "Scroll" });
  assert.equal((tab.match(/class="asset-card"/g) || []).length, 1);
  assert.match(tab, /使用 4 次/);
  assert.match(tab, /回收区/);
});

test("UI v16：侧栏名称与首页中枢轻入口按用户决定", () => {
  // 用户 2026-09-29：首页在侧栏叫“世界总览”，夜间值守改名“夜巡”，搜索只在右上角。
  assert.equal(PAGES.find((p) => p.id === "home").label, "世界总览");
  assert.equal(PAGES.find((p) => p.id === "night").label, "夜巡");
  const html = render(Home);
  assert.doesNotMatch(html, /搜索 ⌘K/);
  for (const action of ["记一笔", "新建资产", "接力", "查知识"]) assert.match(html, new RegExp(action));
});

test("首页 A 今日与 B 待处理读取真实数据，未授权日历不假装为空", () => {
  const s = seed();
  s.notes = [{ id: "n1", text: "合成随手记", at: "2026-09-29T00:00:00.000Z" }];
  s.profileProposals=[{id:"home-proposal",status:"pending",path:"个人上下文/合成.md",reason:"合成需要核对",proposer:"Codex",createdAt:"2026-09-29T00:00:00.000Z"}];
  const html = render(Home, { state: s, vaultReceipts:{loaded:true,noteIds:[]} });
  // 用户 2026-10-05 第二版已批准 A 今日只读呈现日历，并保留加载态。
  assert.match(html, /正在读取日历…/);
  assert.match(html, /今日 8 点至 20 点时间轴/);
  assert.doesNotMatch(html, /夜间窗口 23:00–07:00/);
  assert.match(html, /个人说明修改建议 · 个人上下文\/合成.md/);
  assert.doesNotMatch(html,/随手记尚无当前正文匹配的 Vault 写入回执/);
  assert.match(html, /在待处理打开：个人说明修改建议/);
});

test("收藏接替学习成长：保留生活区路由，不渲染旧书架与旧链接", () => {
  const page=PAGES.find(page=>page.id==='learning');assert.equal(page.group,'生活');assert.equal(page.title,'收藏');assert.equal(page.plan,undefined);
  const html=renderToStaticMarkup(React.createElement(Collection));assert.match(html,/<h1[^>]*>收藏<\/h1>/);assert.match(html,/aria-label="收藏分组"/);assert.match(html,/aria-label="搜索收藏"/);assert.doesNotMatch(html,/<h2[^>]*>收藏画布<\/h2>/);assert.doesNotMatch(html,/书架|学习状态|链接收藏|回收区/);
  // 世界总览热点卡：首屏渲染时还没有读到缓存，如实写“正在读取”，不放假数据。
  const hot = renderToStaticMarkup(React.createElement(HomeHot, { navigate() {} }));
  assert.match(hot, /今日热点/);
  assert.match(hot, /正在读取本机缓存/);
  assert.doesNotMatch(hot, /<a /);
});
