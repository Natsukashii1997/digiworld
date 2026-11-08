// #79 项目总览前后逐像素对比（合成环境，不读真实名册与 data/）。
// 用法：PLAYWRIGHT_CHROMIUM=<headless shell> BEFORE_DIST=<main 构建的 dist> node evidence/79-relations-page/overview-diff.mjs
//
// 做法：只起一份 spaceFixture（同一份合成数据、同样的临时路径），浏览器用路由把静态文件分别换成「改前」「改后」两份构建；
// 1440 宽、选中同一项目，等字体与动画结束后截图。判定：
//   1. 页头（.bar）逐像素一致；
//   2. 页签以下（.g5-stage 顶到页面底）：在改前页面的页签位置塞同高空白块（两边内容绝对位置相同）后逐像素一致。
//      单纯下移时渐变与半透明会随绝对位置有几级抖动，只作记录（bodyShifted），不作判定。
// 横向只截 .projects-space 的范围（左侧栏是 sticky 的，不随内容下移）。
// 两次截图读到的 /api/projects-space 读数必须相同（git 读取有 5 秒超时，机器忙时偶发「读不到」），不同就重拍。
import { createRequire } from "node:module";
import { mkdir, writeFile, stat } from "node:fs/promises";
import { join } from "node:path";
import { spaceFixture } from "../../tests/projects-space-fixture.mjs";

const { chromium } = createRequire(import.meta.url)(
  process.env.PLAYWRIGHT_MODULE || "/Users/nat/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright",
);
const out = join(import.meta.dirname, "overview-diff");
await mkdir(out, { recursive: true });
const DIST = { before: process.env.BEFORE_DIST, after: join(import.meta.dirname, "../../dist") };
// 实战（技能调用统计）关掉：它在后台异步扫描，扫完页面会换内容，两次截图之间不确定。两边都是「未开启」。
const app = await spaceFixture({ staticRoot: DIST.after, skillUsage: { enabled: async () => false } });
// 本机 Playwright 要的浏览器版本可能没下载：用 PLAYWRIGHT_CHROMIUM 指向缓存里已有的 headless shell（同 reverse-flow-browser.mjs）。
const browser = await chromium.launch(process.env.PLAYWRIGHT_CHROMIUM ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM } : {});
const exists = async (p) => { try { return (await stat(p)).isFile(); } catch { return false; } };
const settle = async (page) => {
  await page.evaluate(() => document.fonts.ready);
  await page.waitForFunction(() => !document.querySelector(".ps-loading") && document.getAnimations().every((a) => a.playState !== "running" || a.effect?.getTiming().iterations === Infinity));
  await page.waitForTimeout(1500);
};

async function shoot(which, label, pick, spacer = 0) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, deviceScaleFactor: 1 });
  await context.route("**/*", async (route) => {
    const url = new URL(route.request().url());
    if (url.origin !== new URL(app.url).origin || url.pathname.startsWith("/api")) return route.continue();
    const file = join(DIST[which], decodeURIComponent(url.pathname));
    return route.fulfill({ path: url.pathname !== "/" && await exists(file) ? file : join(DIST[which], "index.html") });
  });
  const page = await context.newPage();
  let reads = "";
  page.on("response", async (r) => { if (new URL(r.url()).pathname === "/api/projects-space" && !new URL(r.url()).search) { const v = await r.json().catch(() => null); if (v) { delete v.at; reads = JSON.stringify(v); } } });
  await page.goto(app.url + "/#projects");
  await page.locator("[data-ps-cart]").first().waitFor();
  await page.locator("#ps-screen").waitFor();
  if (pick) { await page.locator(`[data-ps-cart="${pick}"]`).click(); await page.locator("#ps-screen h2", { hasText: "无协议项目" }).waitFor(); }
  if (spacer) await page.evaluate((h) => document.querySelector(".g5 .bar").insertAdjacentHTML("afterend", `<div style="height:${h}px"></div>`), spacer);
  await settle(page);
  const box = await page.evaluate(() => {
    const r = (s) => document.querySelector(s).getBoundingClientRect();
    const space = r(".projects-space"), bar = r(".g5 .bar"), stage = r(".g5-stage");
    return { x: Math.round(space.left), w: Math.round(space.width), barBottom: Math.ceil(bar.bottom) + 1, stageTop: Math.round(stage.top + scrollY), total: document.documentElement.scrollHeight };
  });
  const head = await page.screenshot({ clip: { x: box.x, y: 0, width: box.w, height: box.barBottom } });
  const body = await page.screenshot({ fullPage: true, clip: { x: box.x, y: box.stageTop, width: box.w, height: box.total - box.stageTop } });
  await writeFile(join(out, `${label}-head.png`), head);
  await writeFile(join(out, `${label}-body.png`), body);
  await page.screenshot({ path: join(out, `${label}-full.png`), fullPage: true });
  await context.close();
  return { box, head, body, reads };
}

async function diff(a, b) {
  const page = await browser.newPage();
  const result = await page.evaluate(async ([x, y]) => {
    const load = (b64) => new Promise((ok) => { const i = new Image(); i.onload = () => ok(i); i.src = "data:image/png;base64," + b64; });
    const [ia, ib] = await Promise.all([load(x), load(y)]);
    if (ia.width !== ib.width || ia.height !== ib.height) return { size: [ia.width, ia.height, ib.width, ib.height], diff: -1 };
    const data = (img) => { const c = document.createElement("canvas"); c.width = img.width; c.height = img.height; const g = c.getContext("2d"); g.drawImage(img, 0, 0); return g.getImageData(0, 0, img.width, img.height).data; };
    const da = data(ia), db = data(ib);
    let n = 0, max = 0, minY = Infinity, maxY = -1;
    for (let i = 0; i < da.length; i += 4) {
      const d = Math.max(Math.abs(da[i] - db[i]), Math.abs(da[i + 1] - db[i + 1]), Math.abs(da[i + 2] - db[i + 2]));
      if (d) { n++; max = Math.max(max, d); const yy = Math.floor(i / 4 / ia.width); minY = Math.min(minY, yy); maxY = Math.max(maxY, yy); }
    }
    return { size: [ia.width, ia.height], diff: n, maxDelta: max, rows: n ? [minY, maxY] : null };
  }, [a.toString("base64"), b.toString("base64")]);
  await page.close();
  return result;
}

const report = [];
try {
  for (const pick of [null, "bare"]) {
    const tag = pick || "collab";
    let row = null;
    for (let attempt = 1; attempt <= 3 && !row; attempt++) {
      const b = await shoot("before", `before-${tag}`, pick), a = await shoot("after", `after-${tag}`, pick);
      const shift = a.box.stageTop - b.box.stageTop;
      const c = await shoot("before", `before-spacer-${tag}`, pick, shift);
      if (!(b.reads && b.reads === a.reads && a.reads === c.reads)) { console.log(`选中 ${tag}：第 ${attempt} 次三次读数不一致（git 偶发超时），重拍`); continue; }
      row = { state: `选中 ${tag}`, attempt, shift, head: await diff(b.head, a.head), bodySamePosition: await diff(c.body, a.body), bodyShifted: await diff(b.body, a.body) };
    }
    if (!row) row = { state: `选中 ${tag}`, error: "三次都没拍到读数一致的一组" };
    report.push(row);
    console.log(JSON.stringify(row));
  }
} finally {
  await browser.close();
  await app.close();
}
await writeFile(join(out, "result.json"), JSON.stringify(report, null, 2));
const pass = report.every((r) => r.head?.diff === 0 && r.bodySamePosition?.diff === 0);
console.log(pass ? "PASS 项目总览前后逐像素一致（页头一致；页签以下同位置一致）" : "FAIL 有像素差异，见 result.json");
process.exit(pass ? 0 : 1);
