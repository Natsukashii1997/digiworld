// UI v19 · 三版截图：起只读预览服务（ui-v18/build/serve.mjs），每版拍 1440×900，再拍一组操作分镜，最后拍并排对比页。
// 用法（项目根目录）：node docs/design/ui-v19/build/shoot.mjs [home|notes|collection|assets|projects|projects-opt|projects-t4]
import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { chromium } from "playwright";
import { serve } from "../../ui-v18/build/serve.mjs";

const SETS = {
  home: {
    prefix: "世界总览", index: "世界总览-三版对比.html",
    pages: [["1-中枢", "世界总览-1-中枢.html"], ["2-仪表台", "世界总览-2-仪表台.html"], ["3-状态屏", "世界总览-3-状态屏.html"]],
    async story(page, name, shot) {
      if (name === "1-中枢") return;
      await page.fill("form[data-cmd] input", "世界总览三版预览，明天定方向");
      await page.keyboard.press("Meta+Enter");
      for (const t of [160, 400, 900]) { await page.waitForTimeout(t); await shot(`记一笔-${t}`); }
    },
  },
  notes: {
    prefix: "随手记", index: "随手记-三版对比.html",
    pages: [["1-便签墙", "随手记-1-便签墙.html"], ["2-收件箱", "随手记-2-收件箱.html"], ["3-便签架", "随手记-3-便签架.html"]],
    async story(page, name, shot) {
      if (name === "2-收件箱") {
        await page.click('[data-go="deliver"]'); await page.waitForTimeout(120); await shot("投递-选项目");
        await page.click('[data-project="牛马之家"]');
        for (const t of [160, 400, 900]) { await page.waitForTimeout(t); await shot(`投递-${t}`); }
      }
      if (name === "3-便签架") {
        await page.fill("form[data-compose] textarea", "随手记三版预览\n1. 便签墙\n2. 收件箱\n3. 便签架");
        await page.keyboard.press("Meta+Enter");
        for (const t of [160, 400, 900]) { await page.waitForTimeout(t); await shot(`贴上-${t}`); }
        await page.click('.card[data-id] [data-go="archive"]');
        await page.waitForTimeout(600); await shot("归档-600");
      }
    },
  },
  collection: {
    prefix: "个人收藏", index: "个人收藏-三版对比.html",
    pages: [["1-桌面", "个人收藏-1-桌面.html"], ["2-图鉴", "个人收藏-2-图鉴.html"], ["3-阅读舱", "个人收藏-3-阅读舱.html"]],
    async story(page, name, shot) {
      if (name === "2-图鉴") {
        await page.click(".card[data-id] h3"); await page.waitForTimeout(400); await shot("读页-400");
        await page.click("[data-drawer] [data-hatch]"); await page.waitForTimeout(120); await shot("孵化-菜单");
        await page.click('[data-route="asset"]');
        for (const t of [160, 400, 900]) { await page.waitForTimeout(t); await shot(`孵成-${t}`); }
        await page.click("[data-close]"); await page.waitForTimeout(300);
        await page.click('[data-group-filter="AI学习"]'); await page.waitForTimeout(200); await shot("筛选-AI学习");
      }
      if (name === "3-阅读舱") {
        await page.click(".row[data-id] >> nth=2"); await page.waitForTimeout(300); await shot("换一条-300");
        await page.click("[data-pane] [data-hatch]"); await page.click('[data-route="deliver"]'); await page.waitForTimeout(120); await shot("投递-选项目");
        await page.click('[data-proj="牛马之家"]');
        for (const t of [160, 400, 900]) { await page.waitForTimeout(t); await shot(`投递-${t}`); }
        await page.click("[data-pane] [data-regroup]"); await page.click('[data-to="设计参考"]');
        await page.waitForTimeout(1300); await shot("移入-1300");
      }
    },
  },
  assets: {
    prefix: "资产仓库", index: "资产仓库-三版对比.html",
    pages: [["1-卡片墙", "资产仓库-1-卡片墙.html"], ["2-装备清单", "资产仓库-2-装备清单.html"], ["3-卡带架", "资产仓库-3-卡带架.html"]],
    async story(page, name, shot) {
      if (name === "1-卡片墙") return;
      await page.click("[data-id] [data-copy-asset] >> nth=1");
      for (const t of [160, 400, 900]) { await page.waitForTimeout(t); await shot(`复制-${t}`); }
      await page.click("[data-id] [data-open] >> nth=2"); await page.waitForTimeout(400); await shot("详情-400");
      await page.keyboard.press("Escape"); await page.waitForTimeout(300);
      await page.click('[data-type-filter="Prompt"]'); await page.waitForTimeout(200); await shot("筛选-Prompt");
    },
  },
  projects: {
    prefix: "项目空间", index: "项目空间-三版对比.html",
    pages: [["1-读档画面", "项目空间-1-读档画面.html"], ["2-存档条", "项目空间-2-存档条.html"], ["3-卡带槽", "项目空间-3-卡带槽.html"]],
    async story(page, name, shot) {
      if (name === "2-存档条") {
        await page.click("[data-pj-go] >> nth=0");
        for (const t of [80, 300]) { await page.waitForTimeout(t); await shot(`继续-${t}`); }
        await page.click('[data-pj-pick="codex"]'); await page.waitForTimeout(250); await shot("换人-Codex");
        await page.click("[data-pj-copy]");
        for (const t of [200, 900]) { await page.waitForTimeout(t); await shot(`复制-${t}`); }
        await page.click("[data-pj-go] >> nth=0"); await page.waitForTimeout(400);
        await page.click("[data-pj-recheck]"); await page.waitForTimeout(150); await shot("重新检查-150");
        await page.waitForTimeout(900); await shot("重新检查-1050");
        await page.click("[data-pj-new] >> nth=0");
        for (const t of [250, 1200]) { await page.waitForTimeout(t); await shot(`开新档-${t}`); }
        await page.click('[data-pj-fold="2"]'); await page.waitForTimeout(400); await shot("折叠组-待归类");
      }
      if (name === "3-卡带槽") {
        await page.click('[data-pj-cart="wd"]');
        for (const t of [120, 900]) { await page.waitForTimeout(t); await shot(`换卡带-${t}`); }
        await page.click('[data-pj-cart="dw"]');
        for (const t of [200, 1400]) { await page.waitForTimeout(t); await shot(`启动-${t}`); }
        await page.click('[data-pj-pick="agumon"], [data-pj-pick="hermes"]'); await page.click("[data-pj-copy]");
        await page.waitForTimeout(300); await shot("复制-300");
        await page.click("[data-pj-new] >> nth=0");
        for (const t of [250, 1300]) { await page.waitForTimeout(t); await shot(`开新档-${t}`); }
      }
    },
  },
  "projects-opt": {
    prefix: "项目空间", index: "项目空间-三的优化.html", indexShot: "项目空间-三的优化",
    pages: [["3-1-一栏读", "项目空间-3-1-一栏读.html"], ["3-2-主次两栏", "项目空间-3-2-主次两栏.html"], ["3-3-剧场", "项目空间-3-3-剧场.html"]],
    async story(page, name, shot) {
      const unread = async () => { await page.click('[data-pj-cart="wd"]'); await page.waitForTimeout(900); await shot("读不到-900"); };
      if (name === "3-1-一栏读") {
        await page.click("[data-pj-pv]"); await page.waitForTimeout(300); await shot("口令展开");
        await page.click('[data-pj-pick="codex"]'); await page.waitForTimeout(250); await shot("换人-Codex");
        await page.click("[data-pj-take]"); await page.waitForTimeout(300); await shot("带走-300");
        await unread();
      }
      if (name === "3-2-主次两栏") {
        await page.click('[data-pj-tab="heat"]'); await page.waitForTimeout(250); await shot("页签-活动");
        await page.click('[data-pj-tab="checks"]'); await page.waitForTimeout(250); await shot("页签-体检");
        await page.click('[data-pj-pick="codex"]'); await page.waitForTimeout(250); await shot("换人-Codex");
        await unread();
      }
      if (name === "3-3-剧场") {
        await page.click('[data-pj-cmd="pick"]'); await page.waitForTimeout(250); await shot("换伙伴");
        await page.click('[data-pj-pick="codex"]'); await page.waitForTimeout(300);
        await page.click('[data-pj-cmd="prompt"]'); await page.waitForTimeout(250); await shot("看口令");
        await page.click('[data-pj-cmd="dossier"]'); await page.waitForTimeout(250); await shot("档案");
        await page.click('[data-pj-cmd="take"]'); await page.waitForTimeout(300); await shot("继续-300");
        await unread();
      }
    },
  },
  "projects-t4": {
    prefix: "项目空间", index: "项目空间-剧场再优化.html", indexShot: "项目空间-剧场再优化",
    pages: [["4-1-交接条", "项目空间-4-1-交接条.html"], ["4-2-口令对白", "项目空间-4-2-口令对白.html"], ["4-3-出发队列", "项目空间-4-3-出发队列.html"]],
    async story(page, name, shot) {
      await page.click('[data-pj-pick="hermes"]'); await page.waitForTimeout(300); await shot("换人-亚古兽");
      await page.click("[data-pj-give]");
      for (const t of [200, 900]) { await page.waitForTimeout(t); await shot(`交出-${t}`); }
      if (name !== "4-2-口令对白") { await page.click("[data-pj-pv]"); await page.waitForTimeout(300); await shot("口令全文"); }
      await page.click('[data-pj-cart="wd"]'); await page.waitForTimeout(900); await shot("读不到-900");
    },
  },
};
const set = SETS[process.argv[2] || "home"];
const out = join(import.meta.dirname, "../shots");
await mkdir(out, { recursive: true });
const server = await serve(0);
const base = `http://127.0.0.1:${server.address().port}/docs/design/ui-v19/`;
const browser = await chromium.launch();
const errors = [];
for (const [name, file] of set.pages) {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2, timezoneId: "Asia/Shanghai" });
  page.on("pageerror", (e) => errors.push(`${name}: ${e.message}`));
  page.on("console", (m) => m.type() === "error" && errors.push(`${name} console: ${m.text()}`));
  await page.goto(base + encodeURIComponent(file));
  await page.waitForTimeout(1800);
  const shot = (suffix) => page.screenshot({ path: join(out, `${set.prefix}-${name}-${suffix}.png`) });
  await shot("1440");
  const m = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth, h: document.documentElement.scrollHeight }));
  if (m.sw > m.cw) errors.push(`${name}: 横向溢出 ${m.sw}/${m.cw}`);
  console.log(`${name}: 页高 ${m.h}`);
  await set.story(page, name, shot);
  await page.close();
}
{
  const page = await browser.newPage({ viewport: { width: 1960, height: 720 }, deviceScaleFactor: 2, timezoneId: "Asia/Shanghai" });
  page.on("pageerror", (e) => errors.push(`对比页: ${e.message}`));
  await page.goto(base + encodeURIComponent(set.index));
  await page.waitForTimeout(2600);
  await page.screenshot({ path: join(out, `${set.indexShot || set.prefix + "-三版对比"}.png`) });
  await page.close();
}
await browser.close();
server.close();
console.log(errors.length ? errors.join("\n") : "无脚本错误、无横向溢出");
