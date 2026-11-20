// #79 桑基标签避让：改前 / 改后截图、标签碰撞检查、逐像素对比（合成数据，不读真实名册与 data/）。
// 用法：npm run build 后
//   PLAYWRIGHT_CHROMIUM=<headless shell> BEFORE_DIST=<改前构建的 dist> node evidence/79-labels/label-shots.mjs
// 两份样本：real＝真实规模（19 个项目 / 26 条关系，提交数照 11-20 的 5178 读数）；h16＝定稿 H 用的 16 个项目样本。
// 每份样本各拍改前、改后：
//   1. 1440×1800 整页（正常动效，等进场动画结束）——给人看；
//   2. 减少动态效果下只截桑基 svg ——逐像素对比用（柔光扫过一直在动，正常动效下两次截图本来就不同）。
// 标签碰撞：每列取各节点文字的包围盒（svg 坐标，含 1.5 的描边），相邻两项相交就记一条。
// 判定：改后 real、h16 两份样本各列都没有碰撞；桑基像素差异全部落在标签包围盒（改前 ∪ 改后）里。
import { createRequire } from "node:module";
import { mkdir, writeFile, stat } from "node:fs/promises";
import { join } from "node:path";
import { spaceFixture } from "../../tests/projects-space-fixture.mjs";
import { relationsSample, relationsSampleReal } from "../../tests/project-relations-sample.mjs";

const { chromium } = createRequire(import.meta.url)(
  process.env.PLAYWRIGHT_MODULE || "/Users/nat/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright",
);
const out = import.meta.dirname;
const DIST = { before: process.env.BEFORE_DIST, after: join(import.meta.dirname, "../../dist") };
if (!DIST.before) throw new Error("要设 BEFORE_DIST（改前构建的 dist 目录）");
const SAMPLES = { real: relationsSampleReal(), h16: relationsSample() };
const app = await spaceFixture({ staticRoot: DIST.after, skillUsage: { enabled: async () => false } });
const browser = await chromium.launch(process.env.PLAYWRIGHT_CHROMIUM ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM } : {});
const exists = async (p) => { try { return (await stat(p)).isFile(); } catch { return false; } };

async function open(which, sample, reduced) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1800 }, deviceScaleFactor: 1, reducedMotion: reduced ? "reduce" : "no-preference" });
  await context.route("**/*", async (route) => {
    const url = new URL(route.request().url());
    if (url.origin !== new URL(app.url).origin) return route.continue();
    if (url.pathname.startsWith("/api/projects-space/relations")) return route.fulfill({ contentType: "application/json", body: JSON.stringify(SAMPLES[sample]) });
    if (url.pathname.startsWith("/api")) return route.continue();
    const file = join(DIST[which], decodeURIComponent(url.pathname));
    return route.fulfill({ path: url.pathname !== "/" && await exists(file) ? file : join(DIST[which], "index.html") });
  });
  const page = await context.newPage();
  await page.goto(app.url + "/#projects");
  await page.locator("[data-ps-cart]").first().waitFor();
  await page.getByRole("tablist", { name: "项目空间页签" }).getByRole("tab", { name: /项目关系/ }).click();
  await page.locator(".pr-flow .nd").first().waitFor();
  await page.waitForFunction(() => document.fonts.status === "loaded" && !document.querySelector(".pr-orbit .lk.draw, .pr-orbit .nd.in, .pr-orbit .ring.spin, .pr-flow .flow.grow"), null, { timeout: 10000 });
  await page.mouse.move(2, 2);
  await page.waitForTimeout(600);
  return { page, context };
}

// 每列的标签包围盒：svg 坐标（碰撞判定）和相对 svg 截图的像素坐标（差异归属）。
const labels = (page) => page.locator(".pr-flow").evaluate((svg) => {
  const k = svg.getBoundingClientRect().width / svg.viewBox.baseVal.width, top = svg.getBoundingClientRect();
  return [...svg.querySelectorAll(".nd")].map((g) => {
    const boxes = [...g.querySelectorAll(":scope > text")].map((t) => t.getBBox());
    const x0 = Math.min(...boxes.map((b) => b.x)) - 1.5, x1 = Math.max(...boxes.map((b) => b.x + b.width)) + 1.5;
    const y0 = Math.min(...boxes.map((b) => b.y)) - 1.5, y1 = Math.max(...boxes.map((b) => b.y + b.height)) + 1.5;
    const r = [...g.querySelectorAll(":scope > text")].map((t) => t.getBoundingClientRect());
    const px = { x0: Math.min(...r.map((b) => b.left)) - top.left - 3, x1: Math.max(...r.map((b) => b.right)) - top.left + 3,
      y0: Math.min(...r.map((b) => b.top)) - top.top - 3, y1: Math.max(...r.map((b) => b.bottom)) - top.top + 3 };
    return { node: g.dataset.node, text: g.textContent, box: { x0, x1, y0, y1 }, px, k };
  });
});
const collisions = (ls) => {
  const hits = [];
  for (const col of ["b:", "p:", "s:"]) {
    const c = ls.filter((l) => l.node.startsWith(col)).sort((a, b) => a.box.y0 - b.box.y0);
    for (let i = 1; i < c.length; i++) {
      const a = c[i - 1].box, b = c[i].box;
      if (b.y0 < a.y1 && b.x0 < a.x1 && a.x0 < b.x1) hits.push({ a: c[i - 1].text, b: c[i].text, overlap: +(a.y1 - b.y0).toFixed(1) });
    }
  }
  return hits;
};

async function diff(a, b, boxes) {
  const page = await browser.newPage();
  const result = await page.evaluate(async ([x, y, boxes]) => {
    const load = (s) => new Promise((ok) => { const i = new Image(); i.onload = () => ok(i); i.src = "data:image/png;base64," + s; });
    const [ia, ib] = await Promise.all([load(x), load(y)]);
    if (ia.width !== ib.width || ia.height !== ib.height) return { size: [ia.width, ia.height, ib.width, ib.height], diff: -1 };
    const data = (img) => { const c = document.createElement("canvas"); c.width = img.width; c.height = img.height; const g = c.getContext("2d"); g.drawImage(img, 0, 0); return g.getImageData(0, 0, img.width, img.height).data; };
    const da = data(ia), db = data(ib), inLabel = (px, py) => boxes.some((r) => px >= r.x0 && px <= r.x1 && py >= r.y0 && py <= r.y1);
    let n = 0, outside = 0;
    for (let i = 0; i < da.length; i += 4) {
      if (da[i] !== db[i] || da[i + 1] !== db[i + 1] || da[i + 2] !== db[i + 2]) { n++; const p = i / 4; if (!inLabel(p % ia.width, Math.floor(p / ia.width))) outside++; }
    }
    return { size: [ia.width, ia.height], diff: n, outsideLabels: outside };
  }, [a.toString("base64"), b.toString("base64"), boxes]);
  await page.close();
  return result;
}

const report = {};
try {
  for (const sample of Object.keys(SAMPLES)) {
    const row = {};
    const flows = {}, ls = {};
    for (const which of ["before", "after"]) {
      const dir = join(out, which);
      await mkdir(dir, { recursive: true });
      { const { page, context } = await open(which, sample, false);
        await page.screenshot({ path: join(dir, `${sample}-1440.png`), fullPage: true });
        await page.locator(".pr-flow").screenshot({ path: join(dir, `${sample}-flow.png`) });
        await context.close(); }
      { const { page, context } = await open(which, sample, true);
        flows[which] = await page.locator(".pr-flow").screenshot({ path: join(dir, `${sample}-flow-reduced.png`) });
        ls[which] = await labels(page);
        await context.close(); }
      row[which] = { collisions: collisions(ls[which]) };
    }
    row.flowDiff = await diff(flows.before, flows.after, [...ls.before, ...ls.after].map((l) => l.px));
    row.moved = ls.after.map((l) => ({ text: l.text, dy: +(l.box.y0 - ls.before.find((b) => b.node === l.node).box.y0).toFixed(1) })).filter((m) => m.dy);
    report[sample] = row;
    console.log(sample, JSON.stringify(row));
  }
} finally {
  await browser.close();
  await app.close();
}
await writeFile(join(out, "result.json"), JSON.stringify(report, null, 2));
const pass = Object.values(report).every((r) => r.after.collisions.length === 0 && r.flowDiff.outsideLabels === 0);
console.log(pass ? "PASS 改后各列标签无碰撞；桑基像素差异只在标签区域" : "FAIL 见 result.json");
process.exit(pass ? 0 : 1);
