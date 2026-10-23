// 视觉稿截图：1440×900 首屏 + 390×844 全页，录入抽屉 1440 全长；三份分镜（资产卡复制→进化、基地投递、录入预览联动）；
// 自检：横向溢出、减少动态效果。页面经 serve.mjs 打开（收藏封面同源转发 5178，只读）；需要 5178 正式服务在运行。
import { chromium } from "../../../../node_modules/playwright/index.mjs";
import path from "node:path";
import { serve } from "./serve.mjs";

const dir = path.resolve(import.meta.dirname, "..");
const shots = path.join(dir, "shots");
const pages = ["基地-B", "资产仓库-B", "资产仓库-B-新建设计"];
const server = await serve(0);
const base = `http://127.0.0.1:${server.address().port}/docs/design/ui-v18/`;
const browser = await chromium.launch();
const png = async (page, clip) => "data:image/png;base64," + (await page.screenshot({ clip })).toString("base64");
const pad = (b, n = 14) => ({ x: b.x - n, y: b.y - n, width: b.width + n * 2, height: b.height + n * 2 });

async function open(ctx, name, { fakeClock = false } = {}) {
  const page = await ctx.newPage();
  if (fakeClock) await page.clock.install();
  await page.goto(base + encodeURIComponent(name) + ".html");
  await page.waitForLoadState("networkidle");
  if (fakeClock) await page.clock.runFor(1500);
  else await page.waitForTimeout(500);
  return page;
}

// 分镜拼版：按给定顺序排，wide 的帧独占一行，burst 是连拍三帧
async function sheet(ctx, file, title, intro, items, cols = 4) {
  const cell = (f) =>
    `<figure class="${f.wide || f.burst ? "wide" : ""}">${f.burst ? `<div class="burst">${f.burst.map((src) => `<img src="${src}">`).join("")}</div>` : `<img src="${f.src}">`}<figcaption><b>${f.t}</b>${f.caption}</figcaption></figure>`;
  const page = await ctx.newPage();
  await page.setContent(`<!doctype html><meta charset="utf-8"><style>
body{margin:0;padding:40px;background:#070b16;color:#e9eeff;font:14px/1.5 -apple-system,"PingFang SC",sans-serif}
h1{margin:0 0 6px;font-size:22px}p{margin:0 0 24px;color:#8b98b8}
.grid{display:grid;grid-template-columns:repeat(${cols},1fr);gap:20px;align-items:start}
figure{margin:0;padding:12px;border-radius:14px;background:#0f1729;border:1px solid rgba(140,178,255,.14)}
figure.wide{grid-column:1/-1}img{display:block;width:100%;height:auto;border-radius:8px}.burst{display:grid;grid-template-columns:repeat(3,1fr);gap:16px}
figcaption{margin-top:10px;color:#b4bfda;font-size:13px}figcaption b{display:inline-block;min-width:44px;margin-right:8px;color:#4de3ff;font:700 12px ui-monospace,Menlo,monospace}
</style><h1>${title}</h1><p>${intro}</p><div class="grid">${items.map(cell).join("")}</div>`);
  await page.screenshot({ path: path.join(shots, file), fullPage: true });
  await page.close();
}
const pauseAll = (page) => page.evaluate(() => document.getAnimations().forEach((a) => a.pause()));
const seekAll = (page, t) => page.evaluate((t) => document.getAnimations().forEach((a) => (a.currentTime = t)), t);

// ---------- 静态稿 ----------
for (const [w, h, tag, full] of [[1440, 900, "1440", false], [390, 844, "390", true]]) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 2 });
  for (const p of pages) {
    const page = await open(ctx, p);
    // 全页截图会把贴底的保存栏截在原视口底部、压住中间内容；截全页时让它回到页尾（真机上它贴底常驻）
    if (full) await page.addStyleTag({ content: ".dr-foot{position:static}" });
    await page.screenshot({ path: path.join(shots, `${p}-${tag}.png`), fullPage: full });
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
    console.log(p, tag, overflow > 0 ? `横向溢出 ${overflow}px` : "无横向溢出");
    if (p === "资产仓库-B-新建设计" && tag === "1440") {
      // 抽屉全长：临时取消抽屉的固定高度与内部滚动，整块截下
      await page.addStyleTag({ content: "body.has-drawer{overflow:visible}.b-drawer{position:absolute;bottom:auto}.dr-form,.dr-preview{overflow:visible}" });
      await page.locator(".b-drawer").screenshot({ path: path.join(shots, `${p}-1440-全长.png`) });
    }
  }
  await ctx.close();
}

// ---------- 分镜 1：资产卡「深度思考伙伴」（成长期、出战 0）第一次被复制 → 进化到成熟期 ----------
{
  const CODE = "PRM.04";
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 });
  const page = await open(ctx, "资产仓库-B");
  const card = page.locator(`[data-card="${CODE}"]`);
  const box = await card.boundingBox();
  const clip = pad(box);
  const frames = [];
  const grab = async (t, caption, region = clip) => frames.push({ t, caption, src: await png(page, region), wide: region !== clip });
  await page.hover(`[data-card="${CODE}"] .b-scr`);
  await page.waitForTimeout(300);
  await grab("悬停", "背光亮起，图标闪光标，扫描带掠过（沿用现有悬停扫描）");
  await page.waitForTimeout(700); // 等悬停扫描走完再点
  await page.evaluate((code) => document.querySelector(`[data-card="${code}"] [data-copy]`).click(), CODE);
  await pauseAll(page);
  const partner = await page.locator(".partner").boundingBox();
  const top = Math.min(partner.y, box.y) - 70;
  for (const [t, caption, region] of [
    [40, "按下：图标下沉一格蓄力，按钮变「已复制」"],
    [180, "起跳：每帧 4px，身后两层液晶残影；出战数开始逐行上滚"],
    [420, "落地：数据像素飞向左下伙伴屏（沿用现有「数据飞入」）", { x: 0, y: top, width: 1440, height: 900 - top }],
    [520, "进化①：成长期第一次被复制 → 图标闪白两下"],
    [880, "进化②：一道扫描线从左到右刷过卡屏"],
    [1240, "进化③：第三格点亮，说明行换成「成熟期」"],
    [2100, "定格：01 出战 · 成熟期，按钮回到「复制」"],
  ]) {
    await seekAll(page, t);
    await grab(`${(t / 1000).toFixed(2)}s`, caption, region);
  }
  // 伙伴屏接住：放开动画、等全部走完，再点一次（已是成熟期，不演进化）；成功扫描线一出现就连拍三帧
  await page.evaluate(() => document.getAnimations().forEach((a) => a.play()));
  await page.waitForTimeout(2500);
  await page.locator(`[data-card="${CODE}"] [data-copy]`).click();
  await page.waitForSelector(".scan-surface.scan-success", { state: "attached" });
  const burst = [];
  for (const wait of [0, 90, 260]) {
    await page.waitForTimeout(wait);
    burst.push(await png(page, pad(partner)));
  }
  frames.push({ t: "接住", caption: "伙伴屏原样接住：数据点从顶上落进蛋里，蛋随后跳一下（实拍连续三帧；0.26 秒的成功扫描线太快，未拍到）", burst });
  const order = [0, 1, 2, 4, 3, 5, 6, 7, 8].map((i) => frames[i]);
  await sheet(ctx, "资产仓库-B-分镜.png", "资产仓库 · 复制反馈分镜", "示例：「深度思考伙伴」成长期、出战 0，第一次被复制即进入成熟期（成熟期的判定就是“成功复制”）。已是成熟期的资产只演前四格，不演进化。", order);
  await ctx.close();
}

// ---------- 分镜 2：基地「投递」一颗蛋（引擎用可控时钟，与暂停的动画同步拨动） ----------
{
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 });
  const page = await open(ctx, "基地-B", { fakeClock: true });
  const hub = pad(await page.locator(".b-hub").boundingBox(), 0);
  const dv = pad(await page.locator(".b-stage").boundingBox(), 0);
  const slot = pad(await page.locator('[data-slot="01"]').boundingBox(), 16);
  const frames = [{ t: "动作前", caption: "走线暗着；第一颗蛋悬停，四个处理按钮", src: await png(page, hub) }];
  const tl = await page.evaluate(() => window.__hub.handleEgg(document.querySelector('.b-port-a li.hover [data-act="deliver"]')));
  await pauseAll(page);
  let now = 0;
  for (const [t, caption, region = hub] of [
    [120, "点「投递」：这一行每帧右移 4px、暗一档，向走线滑出"],
    [Math.round(tl.arrive * 0.6), "A 线亮起，一串数据点按帧流向暴龙机；待孵化 17 → 16 翻页，下一颗蛋补上"],
    [[tl.arrive + 100, tl.arrive + 170, tl.arrive + 250], "（放大连拍）暴龙机里的蛋接住数据：点从屏顶落下，蛋一压一跳（引擎原有动作）", dv],
    [Math.round((tl.out + tl.land) / 2), "数据点从暴龙机出发，沿 B 线流向出战槽 01"],
    [tl.land + 60, "（放大）到站：SLOT 01 收件 0 → 1，芯片亮两下、槽外圈闪一下", slot],
    [tl.land + 900, "定格：待孵化 16，SLOT 01 有 1 件新投递，走线回到暗色"],
  ]) {
    const times = [t].flat(), shots = [];
    for (const at of times) {
      await page.clock.runFor(at - now);
      now = at;
      await seekAll(page, at);
      shots.push(await png(page, region));
    }
    const label = `${(times[0] / 1000).toFixed(2)}s`;
    frames.push(times.length > 1 ? { t: label, caption, burst: shots } : { t: label, caption, src: shots[0] });
  }
  // 时钟翻页：分钟位逐行上滚
  const date = pad(await page.locator(".b-date").boundingBox(), 10);
  await page.evaluate(() => window.__hub.tick());
  await pauseAll(page);
  const clock = [];
  for (const t of [0, 120, 240]) {
    await seekAll(page, t);
    clock.push(await png(page, date));
  }
  frames.push({ t: "时钟", caption: "每分钟按帧翻页：只有变了的那一位逐行上滚（15:20 → 15:21）", burst: clock });
  console.log("基地分镜关键时刻", tl);
  await sheet(ctx, "基地-B-分镜.png", "基地 · 投递联动分镜", "示例：把 A 区第一颗蛋「投递」到项目。真实流程里先选项目、确认后才写入；这里示意投给 SLOT 01，只演写入成功后的反馈。孵成资产 / 焚决 / 归档只演到蛋接住为止。", frames, 2);
  await ctx.close();
}

// ---------- 分镜 3：设计录入——勾一个招式、换「交给谁」，右栏预览当场跟着变 ----------
{
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 });
  const page = await open(ctx, "资产仓库-B-新建设计");
  await page.evaluate(() => {
    const form = document.querySelector(".dr-form");
    form.scrollTop = document.querySelector(".dr-moves").closest(".dr-sec").offsetTop - 8;
  });
  const body = pad(await page.locator(".dr-body").boundingBox(), 0);
  const frames = [{ t: "勾选前", caption: "左栏招式区已勾 4 个；右栏是复制出去的原文（编程 Agent 版）", src: await png(page, body) }];
  await page.locator('[data-move="2"]').check();
  await pauseAll(page);
  for (const [t, caption] of [
    [70, "勾上「像素溶解转场」：勾号分三帧画出，这一段在右栏按帧撑开"],
    [190, "插进招式区的位置，背景闪两帧；计数 4 → 5、字数同步更新"],
  ]) {
    await seekAll(page, t);
    frames.push({ t: `${(t / 1000).toFixed(2)}s`, caption, src: await png(page, body) });
  }
  await page.evaluate(() => document.getAnimations().forEach((a) => { try { a.finish(); } catch {} }));
  await page.locator('.dr-seg [data-target="image"]').click();
  await pauseAll(page);
  for (const [t, caption] of [
    [80, "改交给「ChatGPT 生图」：首尾两句从右往左逐格擦掉"],
    [260, "换上现行生图话术（与 src/design-asset.js 一字不差），从左往右逐格写出"],
  ]) {
    await seekAll(page, t);
    frames.push({ t: `${(t / 1000).toFixed(2)}s`, caption, src: await png(page, body) });
  }
  await sheet(ctx, "资产仓库-B-新建设计-分镜.png", "设计录入 · 预览联动分镜", "左边每改一处，右边的复制原文当场跟着变：勾选招式 = 这段进出预览；「交给谁」= 外面套的话术。", frames, 2);
  await ctx.close();
}

// ---------- 减少动态效果：结果直接到位，不起动画 ----------
{
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: "reduce" });
  const asset = await open(ctx, "资产仓库-B");
  console.log("减少动态效果 · 资产卡", await asset.evaluate(() => {
    const c = document.querySelector('[data-card="PRM.04"]');
    c.querySelector("[data-copy]").click();
    return { moving: c.querySelector(".b-scr").getAnimations({ subtree: true }).length, uses: c.querySelector(".lcd-count").getAttribute("aria-label"), cells: c.querySelectorAll(".stage-cells i.on").length };
  }));
  const home = await open(ctx, "基地-B");
  console.log("减少动态效果 · 基地", await home.evaluate(() => {
    document.querySelector('.b-port-a li.hover [data-act="deliver"]').click();
    return { moving: document.querySelector(".b-hub").getAnimations({ subtree: true }).length, eggs: document.querySelector(".b-port-a .lcd-count").getAttribute("aria-label"), inbox: document.querySelector('[data-slot="01"] .b-inbox').dataset.inbox };
  }));
  const drawer = await open(ctx, "资产仓库-B-新建设计");
  await drawer.locator('[data-move="2"]').check();
  await drawer.locator('.dr-seg [data-target="image"]').click();
  console.log("减少动态效果 · 录入", await drawer.evaluate(() => ({
    moving: document.querySelector(".b-drawer").getAnimations({ subtree: true }).length,
    picked: document.querySelector("[data-picked]").textContent,
    head: document.querySelector('[data-line="head"] .now').textContent.slice(0, 12),
  })));
  await ctx.close();
}
await browser.close();
server.close();
