// v14e 项目空间：以现有合成仓库与 gh 桩验证呈现、交互、异常与窄屏。
// 本轮统一通过隔离 runner 注入未显式设置的本机集成适配器，见交接125。
import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { chromium } from "playwright";
import AxeBuilder from "@axe-core/playwright";
import { projectBriefFixture } from "./project-brief-fixture.mjs";

const output = process.env.GUIJI_TEST_RESULTS || "test-results/ui-v14-projects";
await mkdir(output, { recursive: true });
const app = await projectBriefFixture();
const browser = await chromium.launch();
const errors = [];
const card = (page, name = "协同项目") => page.getByRole("article", { name: `项目状态卡：${name}`, exact: true });
const button = (scope, name) => scope.getByRole("button", { name, exact: true });
const settled = page => page.waitForFunction(() => document.getAnimations().every(a => a.playState !== "running" || a.effect?.getComputedTiming().iterations === Infinity));
async function open(width, motion = "reduce") {
  const context = await browser.newContext({ viewport: { width, height: 1000 }, reducedMotion: motion });
  const page = await context.newPage();
  page.setDefaultTimeout(10000);
  page.on("pageerror", e => errors.push(e.message));
  await page.goto(`${app.url}/#projects`);
  await page.locator("main h1").waitFor();
  return page;
}
async function axe(page, label) {
  await settled(page);
  const result = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
  assert.deepEqual(result.violations.map(v => `${label}: ${v.id} ${v.nodes.map(n => n.target).join(" ")}`), []);
}
async function layout(page, label) {
  // 新增30天读屏说明采用既有sr-only约定，单独严格核验其1px隐藏语义；真实可见内容不允许裁切。
  for(const el of await page.locator('.pj-lanes .sr-only').all()) {
    const v=await el.evaluate(e=>({width:e.getBoundingClientRect().width,height:e.getBoundingClientRect().height,clip:getComputedStyle(e).clip,hidden:e.getAttribute('aria-hidden'),text:e.textContent}));
    assert.equal(v.width,1,label);assert.equal(v.height,1,label);assert.equal(v.clip,'rect(0px, 0px, 0px, 0px)');assert.notEqual(v.hidden,'true');assert.ok(/Git .*CURRENT/.test(v.text)||v.text==='阶段和每日活动未知，不代表没有活动');
  }
  const bad = await page.evaluate(() => {
    const result = [];
    if (document.documentElement.scrollWidth > innerWidth) result.push("整页横向溢出");
    for (const el of document.querySelectorAll(".project-space *, [role=dialog] *")) {
      if (!el.getClientRects().length) continue;
      const css = getComputedStyle(el), r = el.getBoundingClientRect();
      if (css.visibility === "hidden" || css.position === "fixed" || el.closest("[aria-hidden='true'], .pj-lanes .sr-only") || el.parentElement?.closest(".pj-slots, .pj-lscroll")) continue;
      if (r.width && (r.left < -1 || r.right > innerWidth + 1)) result.push(`${el.tagName}.${el.className}: 越界 ${r.left}/${r.right}`);
      if (["hidden", "clip"].includes(css.overflowX) && css.textOverflow !== "ellipsis" && el.scrollWidth > el.clientWidth + 1)
        result.push(`${el.tagName}.${el.className}: 裁切 ${el.scrollWidth}/${el.clientWidth}`);
    }
    return result;
  });
  assert.deepEqual(bad, [], label);
  for (const el of await page.locator(".pj-screen button:visible, .pj-slots button:visible, .pj-screen label.pj-openapp:visible").all()) {
    const box = await el.boundingBox();
    assert.ok(box.width >= 44 && box.height >= 44, `${label} ${await el.innerText()} ${box.width}x${box.height}`);
  }
}

try {
  const page = await open(1440);
  await page.getByRole("img", { name: "在推进 0", exact: true }).waitFor();
  assert.equal(await page.locator(".pj-screen").count(), 0);
  const currentPath = join(app.paths.collab, "CURRENT.md");
  const original = await readFile(currentPath, "utf8");
  const longState = "P-" + "LONG-STATE-".repeat(12);
  const longNext = "核对中英文长项目标识与完整路径，不省略下一步：" + "personal-ai-workbench/".repeat(9);
  await writeFile(currentPath, original.replace(/\| state_id \|[^\n]+/, `| state_id | ${longState} |`).replace("| 当前写入者 | 无 |", "| 当前写入者 | Codex（复核中） |").replace(/\| 唯一下一步 \|[^\n]+/, `| 唯一下一步 | ${longNext} |`));
  for (const name of ["协同项目", "无协议项目", "泄露项目"]) await app.mark(name);
  await page.reload();
  const pick = name => page.getByRole("tab", { name: new RegExp(name) }).click();
  await pick("协同项目");
  const active = card(page);
  await button(active,"详情").click(); const firstDetail=page.getByRole("dialog",{name:"协同项目",exact:true});await firstDetail.getByText(longState,{exact:true}).waitFor();await page.keyboard.press("Escape");
  await active.getByText(longNext, { exact: true }).waitFor();
  assert.equal(await active.getByLabel("接力阶段：复核",{exact:true}).getAttribute("title"),"当前写入者");
  assert.equal(await active.locator(".seg5 i.on").count(), 3);
  await active.locator(".pj-stats").getByText("复核 3/5", { exact: true }).waitFor();
  await button(page,"项目空间怎么用").click();await page.getByRole("dialog",{name:"项目空间 · 这页怎么用",exact:true}).getByText("当前 HEAD 可达提交；CURRENT 只计最后一次修改，不能还原过去修改次数。",{exact:true}).waitFor();await page.keyboard.press("Escape");
  assert.equal(await active.locator('.c30 i').count(),60);
  assert.equal(await active.locator('.c30 i[style]').count(),0);
  assert.equal((await active.locator('.pj-lanes .sr-only').innerText()).match(/Git (\d+|未知)，CURRENT (\d+|未知)/g).length,30);
  await pick("无协议项目");const unread=card(page,"无协议项目"); await unread.getByText("读不到 CURRENT",{exact:false}).first().waitFor(); assert.equal(await unread.locator(".pj-give").count(),0);assert.doesNotMatch(await unread.getAttribute("class"),/stalled/);await pick("协同项目");await active.waitFor();
  assert.equal(await page.locator(".pj-zzz").count(), 0);
  console.log("PASS 空态、长字段、缺协议、停滞及缺数据表达");

  const summary=button(active,"详情");await summary.focus();await page.keyboard.press("Enter");
  const detail=page.getByRole("dialog",{name:"协同项目",exact:true});await detail.getByText("Claude 实现 21",{exact:true}).waitFor();await page.keyboard.press("Escape");assert.equal(await summary.evaluate(e=>document.activeElement===e),true);
  await summary.focus();await page.keyboard.press("Space");await detail.waitFor();await page.keyboard.press("Escape");await detail.waitFor({state:"detached"});
  const launch=active;const picker=launch.getByRole("radiogroup",{name:"交给谁",exact:true});const claude=picker.getByRole("radio",{name:"Claude Code",exact:true});
  await launch.locator(".pj-give:not([disabled])").waitFor();await claude.focus();await page.keyboard.press("Enter");assert.equal(await claude.getAttribute("aria-checked"),"true");assert.equal(await picker.locator('[aria-checked="true"]').count(),1);
  await launch.getByRole("button",{name:/口令全文/}).click();assert.match(await launch.getByLabel("口令全文").innerText(),/开工：Claude Code/);
  assert.equal(await page.locator(".pj-handoff").count(),1);assert.equal(await page.locator("body > .overlay").count(),0,"交接条为唯一内联条");await axe(page,"1440 交接条");
  console.log("PASS 键盘详情开关、头像选人、口令全文框内展开");

  for (const width of [1440, 1024, 430, 393, 390, 375, 320]) {
    await page.setViewportSize({ width, height: 1000 });await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
    await layout(page, `${width} 收起`);
    await axe(page, `${width} 收起`);
    await summary.click();await detail.waitFor();
    await layout(page, `${width} 展开`);
    await axe(page, `${width} 展开`);
    await page.keyboard.press("Escape");await detail.waitFor({state:"detached"});
    await page.screenshot({ path: join(output, `projects-long-${width}.png`), fullPage: true });
  }
  console.log("PASS 7种宽度长内容：逐元素无溢出/裁切、44px、展开/收起 axe");

  // 读不到、部分字段和未知 Git 状态使用临时项目文件及合成 API 返回；不触及实际项目。
  await page.setViewportSize({ width: 320, height: 1000 });
  await writeFile(currentPath, "# 合成缺项\n\n| 字段 | 当前值 |\n|---|---|\n| state_id | P-PARTIAL |\n");
  await button(page, "刷新").click();
  await page.waitForFunction(()=>document.querySelector('.pj-stats [aria-label^="接力阶段"]')?.getAttribute("aria-label")==="接力阶段：未知"); assert.equal(await active.getByLabel("接力阶段：未知").getAttribute("title"),"当前记录不足以推断");
  assert.equal(await active.locator(".seg5 i.on").count(), 0);
  await active.locator(".nx").getByText("缺少此项", { exact: true }).waitFor();
  await active.locator(".pj-plate").getByText("缺少此项", { exact: true }).waitFor();
  await summary.click();
  await detail.getByText("P-PARTIAL",{exact:true}).waitFor();await detail.getByText(/状态表缺少/).waitFor();
  await layout(page, "320 缺项");
  await axe(page, "320 缺项");
  await page.keyboard.press("Escape");
  await page.route("**/api/project-status/inspect", async route => {
    const response = await route.fetch();
    const body = await response.json();
    if (Array.isArray(body.items)) body.items = body.items.map(item => item.projectId === activeId ? { ...item, current: { state: "error", message: "合成读取失败，不读取主机内容" }, activity: { state: "unknown" } } : item);
    await route.fulfill({ response, json: body });
  });
  const activeId = await app.projectId("协同项目");
  await button(page, "刷新").click();
  await active.getByText("读不到 CURRENT", { exact: false }).first().waitFor();await active.getByText("合成读取失败，不读取主机内容",{exact:true}).waitFor();
  assert.equal(await active.locator(".pj-give").count(), 0);
  await layout(page, "320 读取失败");
  await page.unroute("**/api/project-status/inspect");
  await writeFile(currentPath, original);
  console.log("PASS 部分字段与读取失败保持真实提示，错误项目禁止生成口令");

  const motion = await open(1440, "no-preference");
  await motion.getByRole("tab", { name: /协同项目/ }).click();
  await card(motion).waitFor();
  const motionStart = button(card(motion), "详情");
  await motionStart.scrollIntoViewIfNeeded();
  // 模拟卡片仍在 transform 入场帧时立即启动；原固定遮罩会被祖先限制。
  await card(motion).evaluate(el => { el.style.transform = "translateY(14px)"; });
  await motionStart.evaluate(el => el.click());
  await motion.getByRole("dialog", { name: "协同项目" }).waitFor();
  assert.equal(await motion.locator(".drawer-overlay").evaluate(e=>e.closest(".pj-screen,[style*=translateY]")),null);
  const overlay = await motion.locator(".drawer-overlay").boundingBox();
  assert.deepEqual({ x: overlay.x, y: overlay.y, width: overlay.width, height: overlay.height }, { x: 0, y: 0, width: 1440, height: 1000 });
  await motion.keyboard.press("Escape");
  await card(motion).evaluate(el => { el.style.transform = ""; });
  await motion.emulateMedia({ reducedMotion: "reduce" });
  await motion.waitForFunction(() => document.getAnimations().every(a => a.playState !== "running"));
  await axe(motion, "减少动态效果");
  console.log("PASS 入场帧弹窗覆盖整个视口、运行中减少动态效果停止全部动画");
  assert.deepEqual(errors, []);
  console.log("ui-v14-projects-browser 全部通过");
} finally {
  await browser.close();
  await app.close();
}
