// 筛选标签样稿截图（issue #24）：合成数据起正式页面，注入 filter-tabs.css，按 1440 / 390 拍改前和 A / B / C。
// 每张查页面横向溢出、筛选行是否藏了项、控件小于 44px、筛选区 axe。只用 tests/ 的合成夹具，不碰真实数据。
// 用法（项目根目录，先 npx vite build）：node docs/design/ui-v19/build/shoot-filter-tabs.mjs
// 落代码后（选定 A）：FT_AFTER=1 只拍「改后」，不注入样稿样式。
import { join } from "node:path";
import { readFile } from "node:fs/promises";
import { chromium } from "playwright";
import { AxeBuilder } from "@axe-core/playwright";
import { collectionFixture, syntheticNote } from "../../../../tests/collection-fixture.mjs";
import { makeAsset } from "../../../../src/store.js";
import { createScroll } from "../../../../src/scrolls.js";

const out = join(import.meta.dirname, "../shots");
const css = join(import.meta.dirname, "filter-tabs.css");
const image = await readFile("tests/collection-assets/upstream-reference.jpg");
const app = await collectionFixture({ fetchImpl: async () => new Response(image, { headers: { "content-type": "image/jpeg" } }) });

// 资产：5 Prompt、1 规则、1 设计，加 1 卷焚决
const asset = (type, title) => makeAsset({ type, title, content: "合成正文", source: "合成作者" });
const assets = [1, 2, 3, 4, 5].map((i) => asset("Prompt", `合成提示词 ${i}`)).concat(asset("Rule", "合成规则"), makeAsset({ type: "Design", title: "合成设计", content: "合成生图提示词", source: "合成作者", design: { kind: "prompt" } }));
const { scrolls } = createScroll([], "合成焚决");
// 随手记：17 条，带几条已投递
const notes = Array.from({ length: 17 }, (_, i) => ({ id: `ft-note-${i}`, at: `2026-10-${String(10 + i).padStart(2, "0")}T00:00:00Z`, text: `合成便签 ${i + 1}` }));
await app.repository.write({ ...(await app.repository.read()), assets, scrolls, notes });
// 收藏：8 条，分进 5 个分组
for (let i = 1; i <= 8; i++) await app.importNote(syntheticNote(i));
const names = ["摄影", "调酒", "AI 学习", "做菜", "设计参考"];
const desk = await app.api("/desk-workspace");
const groups = names.map((name, i) => ({ id: `custom:ft-${i}`, kind: "custom", name }));
const ids = (await app.api("/notes")).notes.map((n) => n.id);
await app.api("/desk-workspace", { workspace: { ...desk, groups: [...desk.groups, ...groups], noteGroupMap: Object.fromEntries(ids.map((id, i) => [id, i < 6 ? groups[[2, 2, 2, 1, 2, 2][i]].id : "loose"])) }, expectedRevision: desk.revision }, "PUT");

const PAGES = [
  { id: "assets", label: "资产仓库", row: ".asset-toolbar > :is(.segmented, .filter-tabs)" },
  { id: "learning", label: "个人收藏", row: ":is(.collection-chips, .collection-filter)" },
  { id: "notes", label: "随手记", row: ".notes-v16 :is(.sn-filter, .filter-tabs)" },
];
const VARIANTS = process.env.FT_AFTER ? { after: "改后" } : { before: "改前", a: "A分段底板", b: "B独立按键", c: "C下划线" };
const browser = await chromium.launch();
const problems = [], report = [];
for (const width of [1440, 390]) {
  const mobile = width < 641;
  const ctx = await browser.newContext({ viewport: { width, height: 1000 }, deviceScaleFactor: 2, isMobile: mobile, hasTouch: mobile, reducedMotion: "reduce" });
  for (const p of PAGES) {
    for (const [v, vname] of Object.entries(VARIANTS)) {
      const page = await ctx.newPage();
      page.on("pageerror", (e) => problems.push(`${width} ${p.id} ${v}: ${e.message}`));
      await page.route("**/*", (route) => (new URL(route.request().url()).origin === app.url ? route.continue() : route.abort()));
      await page.goto(`${app.url}/#${p.id}`);
      await page.locator(p.row).waitFor();
      if (!["before", "after"].includes(v)) {
        await page.addStyleTag({ path: css });
        await page.evaluate((x) => (document.documentElement.dataset.ft = x), v);
      }
      await page.waitForTimeout(400);
      const m = await page.evaluate((sel) => {
        const row = document.querySelector(sel), r = (el) => el.getBoundingClientRect();
        const items = [...row.querySelectorAll(":scope > button, :scope > .filter-tabs-row > button")];
        const heading = r(document.querySelector(".page-heading")), main = r(document.querySelector("#main-content"));
        const box = r(row.closest(".collection-toolbar, .asset-toolbar, .sn-page") || row);
        return {
          overflow: document.documentElement.scrollWidth - innerWidth,
          hidden: row.scrollWidth - row.clientWidth > 1 ? items.filter((b) => r(b).right > r(row).right + 1 || r(b).left < r(row).left - 1).length : 0,
          small: items.filter((b) => r(b).width < 44 || r(b).height < 44).map((b) => b.textContent.trim()),
          heights: [...new Set(items.map((b) => Math.round(r(b).height)))],
          rows: new Set(items.map((b) => Math.round(r(b).top))).size,
          clip: { x: Math.max(0, main.left), y: Math.max(0, heading.top - 8), width: Math.min(innerWidth, main.right) - Math.max(0, main.left), height: Math.min(r(row).bottom, box.bottom) + 28 - Math.max(0, heading.top - 8) },
        };
      }, p.row);
      const axe = (await new AxeBuilder({ page }).include(p.row).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze()).violations.map((x) => x.id);
      const line = `${width} ${p.label} ${vname}：页面溢出 ${m.overflow}，行内藏起 ${m.hidden} 项，${m.rows} 行，高 ${m.heights.join("/")}px，小于44：${m.small.join("、") || "无"}，axe：${axe.join("、") || "无"}`;
      console.log(line); report.push(line);
      if (v !== "before" && (m.overflow > 0 || m.small.length || axe.length)) problems.push(line);
      await page.screenshot({ path: join(out, `筛选标签-${p.label}-${vname}-${width}.png`), clip: m.clip });
      await page.close();
    }
  }
  await ctx.close();
}
await browser.close();
await app.close?.();
if (problems.length) { console.error("\n未达标：\n" + problems.join("\n")); process.exitCode = 1; }
process.exit();
