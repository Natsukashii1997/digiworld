// UI v14e 智能体群与首页（docs/design/ui-v14 · 03 / 00）：名册选角色 + 档案（像素载入、扫描光带、倒影、
// 内容检查液晶读数，未检查显示横线）、派活推荐一条栏；首页不设“今日”区、待处理液晶、世界地图、存档槽、
// 热点跑马灯。控件至少 44px；320/390/1440 逐元素无横向溢出与裁切；axe；减少动态效果（含运行中切换）。
// 合成 fixture（发现与清单读取均为桩），不读真实 Agent 目录。
import { createRequire } from "node:module";
import assert from "node:assert/strict";
import AxeBuilder from "@axe-core/playwright";
import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { fixture } from "./fixture.mjs";
const { chromium } = createRequire(import.meta.url)(
  process.env.PLAYWRIGHT_MODULE ||
    "/Users/nat/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright",
);
const output = process.env.GUIJI_TEST_RESULTS || "test-results/ui-v14-agents-home";
await mkdir(output, { recursive: true });

const app = await fixture();
const browser = await chromium.launch();
const errors = [];
const ok = (s) => console.log("PASS", s);
async function open(width, hash, reducedMotion = "no-preference") {
  const context = await browser.newContext({ viewport: { width, height: 900 }, reducedMotion });
  const page = await context.newPage();
  page.setDefaultTimeout(10000);
  page.on("pageerror", (e) => errors.push(`${width} ${e.message}`));
  await page.goto(`${app.url}/#${hash}`);
  await page.locator("main h1").first().waitFor();
  return page;
}
const button = (scope, name) => scope.getByRole("button", { name, exact: true });
const running = (page) =>
  page.evaluate(() =>
    document
      .getAnimations()
      .filter((a) => a.playState === "running")
      .map((a) => a.animationName || a.constructor.name),
  );
// 有限时长的入场动画播完（常驻循环动画不计）；axe 前使用，避免量到淡入中途的颜色。
const settled = (page) =>
  page.waitForFunction(() =>
    document.getAnimations().every((a) => a.playState !== "running" || a.effect?.getComputedTiming().iterations === Infinity),
  );
// 逐元素：不得超出视口（横向滚动容器内除外）；overflow 隐藏的元素内部不得被裁切。
// 例外：首页热点跑马灯是对读屏隐藏的装饰，滚动的标题完整显示在下方卡片里。
const offenders = (page) =>
  page.evaluate(() => {
    const W = document.documentElement.clientWidth;
    const bad = [];
    const name = (el) => `${el.tagName.toLowerCase()}.${[...el.classList].join(".")}`;
    for (const el of document.querySelectorAll("main *, .topbar *")) {
      const cs = getComputedStyle(el);
      if (cs.display === "none" || cs.visibility === "hidden" || el.closest(".sr-only, .hot-ticker")) continue;
      const r = el.getBoundingClientRect();
      if (!r.width && !r.height) continue;
      let scroller = false;
      for (let p = el.parentElement; p; p = p.parentElement) {
        const o = getComputedStyle(p).overflowX;
        if (o === "auto" || o === "scroll") {
          scroller = true;
          break;
        }
      }
      if (!scroller && (r.right > W + 0.5 || r.left < -0.5)) bad.push(`${name(el)} [${Math.round(r.left)}, ${Math.round(r.right)}]`);
      if ((cs.overflowX === "hidden" || cs.overflowX === "clip") && cs.textOverflow !== "ellipsis" && el.scrollWidth > el.clientWidth + 1)
        bad.push(`裁切 ${name(el)} ${el.scrollWidth}>${el.clientWidth}`);
    }
    return { page: document.documentElement.scrollWidth - innerWidth, bad };
  });
async function atLeast44(locator, label) {
  const box = await locator.boundingBox();
  assert.ok(box, `${label} 不可见`);
  assert.ok(box.width >= 44 && box.height >= 44, `${label} ${box.width}x${box.height}，应至少 44px`);
}
async function axe(page, label) {
  await settled(page);
  const result = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
  assert.deepEqual(result.violations.map((v) => `${label}: ${v.id} ${v.nodes.map((n) => n.target).join(" ")}`), []);
}

try {
  // 1. 智能体群：名册 5 个，选中有标记；档案随选择切换并重播像素载入与扫描光带；未检查显示横线，不显示 0。
  const page = await open(1440, "agents");
  const roles = page.getByRole("region", { name: "角色卡" });
  const roster = roles.getByRole("radiogroup", { name: "接力目标" });
  assert.equal(await roster.getByRole("radio").count(), 5);
  assert.equal(await roster.getByRole("radio", { checked: true }).count(), 1);
  for (const b of await roster.getByRole("radio").all()) await atLeast44(b, "名册按钮");
  // 名册不能用 button 角色：发现卡片等入口按 /Codex/ 查找按钮，名册不得与之重名。
  assert.equal(await page.locator(".cast [role=radio]").count(),4,"四位主力同一选角排");
  // 方向键切换：从选中项按右键到下一个。
  await roster.getByRole("radio", { checked: true }).focus();
  const first = await roster.getByRole("radio", { checked: true }).innerText();
  await page.keyboard.press("ArrowRight");
  assert.notEqual(await roster.getByRole("radio", { checked: true }).innerText(), first);
  assert.equal(await page.evaluate(() => document.activeElement?.getAttribute("aria-checked")), "true");
  await roster.getByRole("radio", { name: /^Hermes/ }).click();
  const dossier = roles.locator(".archive");
  await dossier.getByRole("heading", { name: "亚古兽", exact: true }).waitFor();
  assert.equal(await roster.getByRole("radio", { checked: true }).getAttribute("aria-label"), "Hermes · 亚古兽");
  await dossier.locator(".v16-hero svg").waitFor();
  assert.equal(await dossier.locator(".agent-letter").count(),0);
  // 悬停位移的有限 transition 会让边界框产生浮点尾差；等待动画结束后仍按精确尺寸断言。
  await settled(page);
  await page.waitForFunction(()=>[...document.querySelectorAll('.rc-stage.rookie svg')].every(e=>e.getBoundingClientRect().height===96)&&[...document.querySelectorAll('.rc-stage:not(.rookie) svg')].every(e=>e.getBoundingClientRect().height===148));
  const rookieHeights=await page.locator(".rc-stage.rookie svg").evaluateAll(es=>es.map(e=>e.getBoundingClientRect().height));
  assert.deepEqual(rookieHeights,[96,96]);
  assert.deepEqual(await page.locator(".rc-stage:not(.rookie) svg").evaluateAll(es=>es.map(e=>e.getBoundingClientRect().height)),[148,148]);
  await page.getByRole("tab",{name:/^内容/}).click();
  await dossier.getByText("未检查不等于失败").waitFor();
  assert.equal(await dossier.locator(".sr-only", { hasText: "尚未检查" }).count(), 1);
  assert.equal(await dossier.locator(".role-check-band svg").count(), 4);
  assert.equal(await dossier.locator(".role-check-band .lcd-num").evaluateAll((els) => els.every((e) => e.querySelector("svg").getAttribute("width") > 0)), true);
  await roster.getByRole("radio",{name:/^Claude Code/}).click();
  await dossier.getByRole("heading",{name:"机械暴龙兽",exact:true}).waitFor();
  assert.equal(await dossier.locator(".agent-letter").count(),0,"新精灵已到，不再显示占位");
  await page.getByRole("tab",{name:"档案",exact:true}).click();
  await atLeast44(button(dossier, "编辑角色卡"), "编辑角色卡");
  assert.equal(await button(roles,"推荐人选").count(),0,"派活推荐已取消");
  await axe(page, "agents-1440");
  await page.screenshot({ path: join(output, "agents-1440.png"), fullPage: true });
  ok("智能体群：名册 5 个且只有一个选中；档案按所选伙伴切换；四位新像素精灵及等高成长期；未检查显示横线；44px；axe");

  // 2. 档案“查看内容清单”：滚到对应清单卡并展开只读读取，读取成功后档案读数窗翻转一次、出现“已读取”。
  await roster.getByRole("radio", { name: /^Codex/ }).click();
  await dossier.getByRole("heading", { name: "机械邪龙兽", exact: true }).waitFor();
  await page.getByRole("tab",{name:/^内容/}).click();
  await button(page.locator(".agent-contents-card"),"展开清单").click();
  const codexCard = page.locator('.agent-contents-card[data-agent="codex"]');
  await button(codexCard, "收起清单").waitFor();
  await dossier.locator(".role-check .v14-result", { hasText: "已读取" }).waitFor();
  assert.doesNotMatch(await dossier.innerText(), /未检查不等于失败/);
  ok("档案“查看内容清单”展开对应清单卡并只读读取；读到结果后档案出现一次“已读取”");

  // 3. 运行中开启减少动态效果：切换角色不再播放载入动画，页面无运行中的动画。
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.waitForTimeout(150);
  await roster.getByRole("radio", { name: /^OpenClaw/ }).click();
  await dossier.getByRole("heading", { name: "加布兽", exact: true }).waitFor();
  assert.equal(await dossier.locator(".role-fig.in, .role-scan.go").count(), 0);
  assert.deepEqual(await running(page), [], "减少动态效果后不应有运行中的动画");
  await page.context().close();
  ok("运行中开启减少动态效果：角色切换不再播放载入与扫描，页面无运行中的动画");

  // 4. 第二版首页：四区中枢、待处理同源计数、稳定入口与真实空态。
  const home = await open(1440, "home");
  await home.locator('.hx').waitFor();
  assert.equal(await home.locator('.hx-mod').count(), 4);
  const pending = home.locator('.hx-mod-b');
  await pending.locator('.hx-qcount').waitFor();
  assert.deepEqual(await pending.locator('.hx-qcount b').allInnerTexts(), ['0','1','0']);
  for (const link of await home.locator('.hx-page-link').all()) await atLeast44(link, '四区入口');
  await home.locator('.nav-item', {hasText:'夜巡'}).waitFor();
  assert.equal(await home.locator('.structure-map, section.home-hot').count(), 0);
  await axe(home, "home-1440");
  await home.screenshot({ path: join(output, "home-1440.png"), fullPage: true });
  ok("首页四区、待处理分诊同源计数、44px 入口、侧栏夜巡与 axe");

  // 5. 320 / 390：智能体群与首页逐元素无溢出、axe 通过。
  for (const width of [320, 390]) {
    for (const hash of ["agents", "home"]) {
      const narrow = await open(width, hash);
      await narrow.waitForTimeout(700);
      const result = await offenders(narrow);
      assert.equal(result.page, 0, `${width} ${hash} 整页横向溢出`);
      assert.deepEqual(result.bad, [], `${width} ${hash} 逐元素溢出`);
      if (hash === "home") {
        assert.equal(await narrow.locator('.hx-mod').count(), 4);
        await atLeast44(narrow.locator('.hx-cmd button'), '窄屏记一笔');
      } else {
        for (const b of await narrow.getByRole("radiogroup", { name: "接力目标" }).getByRole("radio").all()) await atLeast44(b, `${width} 名册`);
      }
      await axe(narrow, `${hash}-${width}`);
      await narrow.screenshot({ path: join(output, `${hash}-${width}.png`), fullPage: true });
      await narrow.context().close();
    }
  }
  ok("320/390：智能体群与首页逐元素无横向溢出与裁切，控件 44px，axe 通过");

  assert.deepEqual(errors, []);
  console.log("ui-v14-agents-home-browser 全部通过");
} finally {
  await browser.close();
  await app.close();
}
