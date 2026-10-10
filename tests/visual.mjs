import {openAgentInventory,agentInventoryEntry} from "./agents-v16-helpers.mjs";
// 视觉基线：合成数据下逐页、逐宽度截图，并检查横向溢出与页面错误。
// 用法：node tests/visual.mjs <标签>   → test-results/visual/<标签>/
// 需要已构建的 dist/；不属于 npm test，不能替代真人视觉验收。
import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { fixture } from "./fixture.mjs";

const { chromium } = await import(
  process.env.PLAYWRIGHT_MODULE ||
    "/Users/nat/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs"
);
const label = process.argv[2] || "current";
const out = join(import.meta.dirname, "../test-results/visual", label);
await mkdir(out, { recursive: true });
const widths = [2560, 1920, 1440, 1024, 390, 320];
const routes = [
  "home",
  "inbox",
  "assets",
  "agents",
  "projects",
  "knowledge",
  "notes",
  "history",
  "references",
  "night",
  "settings",
  "health",
  "collab",
  "calendar",
  "aihot",
  "learning",
  "silver",
];
const app = await fixture();
const browser = await chromium.launch();
const problems = [];
try {
  for (const width of widths) {
    const page = await browser.newPage({
      viewport: { width, height: 900 },
      reducedMotion: "reduce",
    });
    page.on("pageerror", (e) => problems.push(`${width} pageerror ${e}`));
    const shot = async (name) => {
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - innerWidth,
      );
      if (overflow > 0) problems.push(`${width} ${name} overflow ${overflow}px`);
      await page.screenshot({ path: join(out, `${name}-${width}.png`), fullPage: true });
    };
    for (const route of routes) {
      await page.goto(`${app.url}/#${route}`);
      if(route==="inbox")await page.getByRole("dialog",{name:"待处理",exact:true}).waitFor();
      else await page.locator("main h1").first().waitFor();
      await page.waitForTimeout(route === "agents" || route === "projects" ? 600 : 250);
      // 宽屏：内容区在上限内铺满内容列，超过上限时左右空白相等，不能只剩右侧空档。
      const gap = await page.evaluate(() => {
        const side = document.querySelector(".sidebar");
        const main = document.querySelector(".main-content").getBoundingClientRect();
        if (!side || getComputedStyle(side).position === "fixed") return null;
        const sideRight = side.getBoundingClientRect().right;
        // 读不到令牌时按 1760 兜底，避免检查因 NaN 静默失效。
        const max =
          parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--content-max")) || 1760;
        const expected = Math.max(0, (innerWidth - sideRight - max) / 2);
        return { left: main.left - sideRight, right: innerWidth - main.right, expected };
      });
      if (
        gap &&
        (Math.abs(gap.left - gap.right) > 2 ||
          Math.abs(gap.left - gap.expected) > 2 ||
          Math.abs(gap.right - gap.expected) > 2)
      )
        problems.push(`${width} ${route} content gap left ${Math.round(gap.left)} right ${Math.round(gap.right)} expected ${Math.round(gap.expected)}`);
      if (route === "night" && width <= 390) {
        const chipLayout = await page.evaluate(() => {
          const title = document.querySelector('.night-v16 .nv-library .nv-section-title h2');
          const titleStyle = title && getComputedStyle(title);
          const lineHeight = titleStyle &&
            (parseFloat(titleStyle.lineHeight) || parseFloat(titleStyle.fontSize) * 1.4);
          const titleLines = title && lineHeight
            ? title.getBoundingClientRect().height / lineHeight
            : Infinity;
          const cards = [...document.querySelectorAll('.night-v16 .nv-lib-row .nt-chip')].map(card => {
            const face = card.querySelector('.nv-chip-face')?.getBoundingClientRect();
            const name = card.querySelector('.nv-chip-name')?.getBoundingClientRect();
            const out = card.querySelector('.nv-chip-out')?.getBoundingClientRect();
            return { faceOverName: !!face && !!name && face.bottom > name.top + 1,
              nameOverOut: !!name && !!out && name.bottom > out.top + 1,
              clipped: card.scrollHeight > card.clientHeight + 1 };
          });
          return { titleLines, cards };
        });
        if (chipLayout.titleLines > 1.5) problems.push(`${width} night library title wraps`);
        if (chipLayout.cards.some(card => card.faceOverName || card.nameOverOut || card.clipped))
          problems.push(`${width} night library chip content overlaps or clips`);
      }
      if (route === "silver" && width <= 390) {
        const emptyWall = await page.evaluate(() => {
          const card = document.querySelector('.silver-v16 .canvas.empty .pile.ghost .pile-cards');
          const caption = document.querySelector('.silver-v16 .canvas.empty .canvas-empty');
          if (!card || !caption) return null;
          const a = card.getBoundingClientRect(), b = caption.getBoundingClientRect();
          return { gap: b.top - a.bottom, left: b.left, right: b.right };
        });
        if (!emptyWall || emptyWall.gap < 8 || emptyWall.left < 0 || emptyWall.right > width)
          problems.push(`${width} silver empty caption overlaps or escapes ghost card`);
      }
      if (route === "settings" && width === 1024) {
        const rows = await page.locator(".settings-v16 .st-tr:not(.st-th)").evaluateAll(elements =>
          elements.map(element => ({
            capWidth: element.querySelector(".st-cap")?.getBoundingClientRect().width ?? 0,
            height: element.getBoundingClientRect().height,
          })));
        if (!rows.length || rows.some(row => row.capWidth < 180 || row.height > 180))
          problems.push(`${width} settings capability table collapsed ${JSON.stringify(rows)}`);
      }
      await shot(route);
    }
    await page.goto(`${app.url}/#assets`);
    await page.getByRole("button", { name: "查看 设计的最后一公里", exact: true }).click();
    await page.getByRole("dialog", { name: "资产详情" }).waitFor();
    await page.waitForTimeout(300);
    await shot("state-detail");
    await page.getByRole("button", { name: "编辑资产", exact: true }).first().click();
    await page.getByRole("dialog", { name: /编辑资产/ }).waitFor();
    await shot("state-editor");
    await page.keyboard.press("Escape");
    await page.keyboard.press("Escape");
    await page.getByLabel("在资产中搜索").fill("不存在的关键词");
    await shot("state-empty-search");
    await page.keyboard.press(process.platform === "darwin" ? "Meta+K" : "Control+K");
    await page.getByLabel("全局搜索").fill("研究");
    await shot("state-palette");
    await page.keyboard.press("Escape");
    await page.goto(`${app.url}/#agents`);
    await openAgentInventory(page);
    await page.waitForTimeout(500);
    await shot("state-agent-drawer");
    await page.keyboard.press("Escape");
    await page.goto(`${app.url}/#projects`);
    await page.locator(".project-discovery-row").first().click();
    await page.waitForTimeout(400);
    await shot("state-project-drawer");
    await page.close();
  }
  // 顶栏临界宽度（D-UI1）：标题单行、完整位于顶栏内，不被搜索框和状态挤压。
  for (const width of [640, 641, 700, 768, 960, 961]) {
    const page = await browser.newPage({
      viewport: { width, height: 800 },
      reducedMotion: "reduce",
    });
    await page.goto(`${app.url}/#home`);
    await page.locator(".topbar .crumbs strong").waitFor();
    const m = await page.evaluate(() => {
      const bar = document.querySelector(".topbar").getBoundingClientRect();
      const title = document.querySelector(".topbar .crumbs strong");
      const r = title.getBoundingClientRect();
      const style = getComputedStyle(title);
      const line = parseFloat(style.lineHeight) || parseFloat(style.fontSize) * 1.6;
      return {
        inside: r.top >= bar.top && r.bottom <= bar.bottom,
        oneLine: r.height <= line * 1.5,
        whole: title.scrollWidth <= title.clientWidth + 1,
        text: title.textContent,
      };
    });
    if (!m.inside || !m.oneLine || !m.whole)
      problems.push(`${width} topbar title ${JSON.stringify(m)}`);
    await page.close();
  }
} finally {
  await browser.close();
  await app.close();
}
console.log(JSON.stringify({ out, problems }, null, 2));
if (problems.length) process.exitCode = 1;
