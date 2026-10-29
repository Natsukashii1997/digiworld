// issue #24：资产仓库 / 个人收藏 / 随手记的筛选标签同一套（用户 2026-10-29 选样稿 A 分段底板）。
// 1440 / 390：只排一行（用户 10-29：不能分行），放不下在轨道里横滑并渐隐；页面不横向溢出、控件不小于 44px、三页样式一致、axe 无违规；
// 收藏「＋ 分组」与随手记分组线保留，收藏工具栏不再有 Agent 按钮。
import assert from "node:assert/strict";
import { mkdir, readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { chromium } from "playwright";
import AxeBuilder from "@axe-core/playwright";
import { collectionFixture, syntheticNote } from "./collection-fixture.mjs";
import { makeAsset } from "../src/store.js";
import { createScroll } from "../src/scrolls.js";

const out = resolve(process.env.GUIJI_TEST_RESULTS || "test-results/filter-tabs");
await mkdir(out, { recursive: true });
const image = await readFile("tests/collection-assets/upstream-reference.jpg");
const app = await collectionFixture({ fetchImpl: async () => new Response(image, { headers: { "content-type": "image/jpeg" } }) });
const browser = await chromium.launch();
const errors = [];
try {
  const asset = (type, title, extra = {}) => makeAsset({ type, title, content: "合成正文", source: "合成作者", ...extra });
  const assets = [1, 2, 3, 4, 5].map((i) => asset("Prompt", `合成提示词 ${i}`)).concat(asset("Rule", "合成规则"), asset("Design", "合成设计", { design: { kind: "prompt" } }));
  const notes = Array.from({ length: 17 }, (_, i) => ({ id: `ft-note-${i}`, at: `2026-10-${String(10 + i).padStart(2, "0")}T00:00:00.000Z`, text: `合成便签 ${i + 1}` }));
  await app.repository.write({ ...(await app.repository.read()), assets, scrolls: createScroll([], "合成焚决").scrolls, notes });
  for (let i = 1; i <= 8; i++) assert.equal((await app.importNote(syntheticNote(i))).status, "complete");
  const desk = await app.api("/desk-workspace");
  const groups = ["摄影", "调酒", "很长很长的合成分组名字", "做菜", "设计参考", "旅行"].map((name, i) => ({ id: `custom:ft-${i}`, kind: "custom", name }));
  const ids = (await app.api("/notes")).notes.map((n) => n.id);
  await app.api("/desk-workspace", { workspace: { ...desk, groups: [...desk.groups, ...groups], noteGroupMap: Object.fromEntries(ids.map((id, i) => [id, groups[i % groups.length].id])) }, expectedRevision: desk.revision }, "PUT");

  const PAGES = [["assets", "资产类型", 7], ["learning", "收藏分组", 7], ["notes", "随手记筛选", 10]];
  for (const width of [1440, 390]) {
    const context = await browser.newContext({ viewport: { width, height: 1000 }, reducedMotion: "reduce" });
    const styles = {};
    for (const [route, label, count] of PAGES) {
      const page = await context.newPage();
      page.on("pageerror", (e) => errors.push(`${width} ${route}: ${e.message}`));
      await page.route("**/*", (r) => (new URL(r.request().url()).origin === app.url ? r.continue() : r.abort()));
      await page.goto(`${app.url}/#${route}`);
      const row = page.getByRole("group", { name: label, exact: true });
      await row.waitFor();
      await page.waitForTimeout(300);
      const m = await row.evaluate((el) => {
        const r = (n) => n.getBoundingClientRect(), box = r(el), track = el.parentElement;
        const all = [...el.querySelectorAll(":scope > button")], tabs = all.filter((b) => b.hasAttribute("aria-pressed"));
        const pick = (b) => { const s = getComputedStyle(b); return [s.minHeight, s.fontSize, s.borderRadius, s.backgroundColor, s.boxShadow, s.color, getComputedStyle(b.querySelector("b")).color].join("|"); };
        const sep = el.querySelector(":scope > .filter-tabs-sep"), on = tabs.find((b) => b.getAttribute("aria-pressed") === "true");
        return {
          overflow: document.documentElement.scrollWidth - innerWidth,
          track: track.className, row: el.className,
          tabs: tabs.length,
          tops: new Set(all.map((b) => Math.round(r(b).top))).size,
          scrolls: el.scrollWidth > el.clientWidth + 1,
          scrollable: getComputedStyle(el).overflowX,
          fade: track.dataset.right,
          trackInView: r(track).left >= 0 && r(track).right <= innerWidth,
          onVisible: r(on).left >= box.left - 1 && r(on).right <= box.right + 1,
          small: all.filter((b) => r(b).width < 44 || r(b).height < 44).map((b) => b.textContent),
          on: pick(on),
          off: pick(tabs.find((b) => b.getAttribute("aria-pressed") === "false")),
          sep: sep && { w: Math.round(r(sep).width), h: Math.round(r(sep).height) },
          add: !!el.querySelector(":scope > .filter-tabs-add[aria-label='新建分组']"),
        };
      });
      const tag = `${width} ${route}`;
      assert.match(m.track, /\bfilter-tabs\b/, tag);
      assert.equal(m.row, "filter-tabs-row", tag);
      assert.equal(m.overflow, 0, `${tag} 页面横向溢出`);
      assert.equal(m.tabs, count, tag);
      assert.equal(m.tops, 1, `${tag} 只排一行`);
      assert.equal(m.scrollable, "auto", tag);
      assert.ok(m.trackInView, `${tag} 轨道在视口内`);
      assert.ok(m.onVisible, `${tag} 选中项可见`);
      assert.equal(m.fade, String(m.scrolls), `${tag} 放不下时右缘渐隐`);
      assert.deepEqual(m.small, [], `${tag} 控件小于 44px`);
      styles[route] = { on: m.on, off: m.off };
      if (route === "learning") {
        assert.ok(m.add, "收藏保留「＋ 分组」");
        assert.equal(await page.getByRole("button", { name: "Agent", exact: true }).count(), 0, "收藏工具栏不再有 Agent 按钮");
      }
      if (route === "notes") {
        assert.ok(m.sep, "随手记保留分组线");
        assert.equal(m.sep.w, 1, "分组线竖放");
        if (width === 390) {
          assert.ok(m.scrolls, "窄屏随手记需横滑");
          await row.evaluate((el) => (el.scrollLeft = el.scrollWidth));
          await page.waitForFunction(() => document.querySelector(".notes-v16 .filter-tabs").dataset.right === "false");
          assert.ok(await row.getByRole("button", { name: /已归档/ }).evaluate((b) => b.getBoundingClientRect().right <= b.parentElement.getBoundingClientRect().right + 1), "滑到底能看到最后一项");
        }
      } else assert.equal(m.sep, null, tag);
      const axe = await new AxeBuilder({ page }).include(".filter-tabs").withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
      assert.deepEqual(axe.violations.map((v) => ({ tag, id: v.id, nodes: v.nodes.map((n) => n.target) })), []);
      await page.screenshot({ path: join(out, `${route}-${width}.png`) });
      if (route === "assets" && width === 1440) {
        await row.getByRole("button", { name: /Prompts/ }).click();
        assert.equal(await row.getByRole("button", { name: /Prompts/ }).getAttribute("aria-pressed"), "true");
        assert.equal(await row.locator("button[aria-pressed=true]").count(), 1);
      }
      await page.close();
    }
    for (const route of ["learning", "notes"]) assert.deepEqual(styles[route], styles.assets, `${width} ${route} 与资产仓库同一套样式`);
    await context.close();
  }
  assert.deepEqual(errors, []);
  console.log("filter tabs: 3 pages × 1440/390 same spec, no overflow, ≥44px, axe clean");
} finally {
  await browser.close();
  await app.close();
}
