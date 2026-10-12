// W6/N1: browser verification on a temporary workspace only. Real CLI,
// launchd, Vault, network sources, and the live 5178 service are out of scope.
import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { chromium } from "playwright";
import AxeBuilder from "@axe-core/playwright";
import { nightV2Fixture } from "./night-v2-fixture.mjs";
import { batch3Routes } from "./ui-v14-batch3-fixture.mjs";
import { NIGHT_V2_PRESETS, addSlot, archiveSupplement, nightV2Of, reviseChip } from "../src/night-v2-model.js";

const output = process.env.GUIJI_TEST_RESULTS || "test-results/night-v2-browser";
await mkdir(output, { recursive: true });
const browser = await chromium.launch();
const pageErrors = [];
const forbiddenRequests = [];
const screenshots = [];

function withThreeSlots(initial) {
  let state = initial;
  for (const [index, chip] of NIGHT_V2_PRESETS.slice(0, 3).entries()) {
    state = addSlot(state, {
      chipId: chip.id,
      projectId: index ? "demo-project" : "",
      goal: ["比较 Agent loop 停止条件", "完成首页状态卡", "检查日历拖动"][index],
      topic: index === 0 ? "Agent loop 停止条件" : "",
      ...(index ? { acceptance: [`合成验收 ${index + 1}`] } : {}),
      tonightSupplement: index === 0 ? "今晚优先核对两份一手来源" : "",
    }, { id: `synthetic-slot-${index + 1}` });
  }
  return state;
}

async function openNight(app, width, {
  homeFirst = false, workspaceRoute, beforeNight, touch = false,
  legacyDraft = { time: "23:00", end: "07:00", tasks: [] },
} = {}) {
  const context = await browser.newContext({
    viewport: { width, height: width === 1440 ? 1172 : width === 390 ? 1734 : 1000 },
    timezoneId: "Asia/Shanghai",
    reducedMotion: "reduce",
    hasTouch: touch,
    isMobile: touch,
  });
  const page = await context.newPage();
  page.setDefaultTimeout(12000);
  page.on("pageerror", (error) => pageErrors.push(error.message));
  page.on("request", (request) => {
    const url = new URL(request.url());
    if (!["127.0.0.1", "localhost"].includes(url.hostname) && url.protocol !== "data:")
      forbiddenRequests.push(url.href);
    if (/\/api\/capabilities\/night\/(run|tick|confirm|register-confirm|save-tasks)/.test(url.pathname))
      forbiddenRequests.push(url.href);
  });
  await page.route("**/*", (route) => {
    const url = new URL(route.request().url());
    if (["127.0.0.1", "localhost"].includes(url.hostname) || url.protocol === "data:")
      return route.continue();
    forbiddenRequests.push(url.href);
    return route.abort("blockedbyclient");
  });
  await batch3Routes(page);
  await page.route("**/api/capabilities/night/**", async (route) => {
    const pathname = new URL(route.request().url()).pathname;
    if (pathname.endsWith("/morning-reports"))
      return route.fulfill({ json: { items: [] } });
    if (pathname.endsWith("/status"))
      return route.fulfill({ json: {
        enabled: false, generation: "synthetic", running: [], draft: legacyDraft,
        approvedDraftSha256: "a".repeat(64),
      } });
    forbiddenRequests.push(pathname);
    return route.fulfill({ status: 403, json: { error: "N1 fixture denied old night action" } });
  });
  if (workspaceRoute) await page.route("**/api/workspace", workspaceRoute);
  await page.goto(app.url + (homeFirst ? "/#home" : "/#night"));
  if (homeFirst) {
    await page.locator("main").waitFor();
    if (beforeNight) await beforeNight(page);
    await page.evaluate(() => { location.hash = "#night"; });
  }
  return page;
}

async function ready(page) {
  await page.locator('[data-testid="night-v2"]').waitFor();
  await page.locator('[data-testid="night-loading"]').waitFor({ state: "hidden" });
}

async function screenshot(page, name) {
  const path = join(output, `${name}.png`);
  await page.locator(".toast").waitFor({ state: "hidden" });
  const drawerBody = page.locator('[data-testid="night-edit-drawer"] .nv-dw-body');
  if (await drawerBody.count()) {
    await drawerBody.evaluate(element => { element.scrollTop = 0; });
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => resolve())));
  }
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path, fullPage: false });
  screenshots.push(path);
}

async function checkNightGeometry(page, label) {
  const violations = await page.evaluate(() => {
    const root = document.querySelector('[data-testid="night-v2"]');
    const bad = [];
    if (document.documentElement.scrollWidth > innerWidth + 1)
      bad.push(`document width ${document.documentElement.scrollWidth} > ${innerWidth}`);
    if (!root) return ["missing night-v2"];
    for (const el of root.querySelectorAll("button,a,input,select,textarea,[tabindex]")) {
      if (!el.checkVisibility({ checkOpacity: true })) continue;
      const rect = (["checkbox", "radio"].includes(el.type)
        ? el.closest("label") || el : el).getBoundingClientRect();
      if (rect.width < 44 || rect.height < 44)
        bad.push(`${el.tagName} ${el.getAttribute("aria-label") || el.textContent?.trim().slice(0, 25)} ${Math.round(rect.width)}x${Math.round(rect.height)}`);
    }
    return bad;
  });
  assert.deepEqual(violations, [], `${label}: no horizontal overflow or sub-44px targets`);
}

async function checkAccessibility(page, label) {
  const violations = (await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
    .analyze()).violations.map((entry) =>
      `${entry.id}: ${entry.nodes.map((node) => node.target.join(" ")).join(" | ")}`);
  assert.deepEqual(violations, [], `${label}: axe`);
  const activeNightAnimations = await page.evaluate(() => document.getAnimations()
    .filter((animation) => animation.playState === "running"
      && animation.effect?.target?.closest?.('[data-testid="night-v2"]'))
    .map((animation) => animation.effect.target.className));
  assert.deepEqual(activeNightAnimations, [], `${label}: reduced motion stops Night v2 animations`);
}

async function checkMobileDrawerReachability(editor, label) {
  const layout = await editor.evaluate(element => {
    const body = element.querySelector('.nv-dw-body');
    const footer = element.querySelector('.nv-dw-foot');
    const lastAcceptanceControl = element.querySelector('.nv-add-accept');
    body.scrollTop = body.scrollHeight;
    const drawerBox = element.getBoundingClientRect();
    const bodyBox = body.getBoundingClientRect();
    const footerBox = footer.getBoundingClientRect();
    const acceptanceBox = lastAcceptanceControl.getBoundingClientRect();
    const result = {
      drawerInViewport: drawerBox.top >= -1 && drawerBox.bottom <= innerHeight + 1,
      footerInViewport: footerBox.top >= -1 && footerBox.bottom <= innerHeight + 1,
      bodyScrolls: body.scrollTop > 0,
      acceptanceReachable: acceptanceBox.top >= bodyBox.top - 1 && acceptanceBox.bottom <= bodyBox.bottom + 1,
    };
    body.scrollTop = 0;
    return result;
  });
  assert.deepEqual(layout, {
    drawerInViewport: true, footerInViewport: true,
    bodyScrolls: true, acceptanceReachable: true,
  }, `${label}: the mobile drawer keeps its footer visible and acceptance reachable`);
}

async function checkLibraryCrests(page) {
  const crests = await page.locator('[data-testid="night-library"] [data-chip-id]').evaluateAll(chips =>
    chips.map(chip => {
      const svg = chip.querySelector('svg[data-crest-id]');
      const box = svg?.getBBox();
      const viewBox = svg?.viewBox?.baseVal;
      const face = chip.querySelector('.nv-chip-face')?.getBoundingClientRect();
      const icon = svg?.getBoundingClientRect();
      return {
        chipId: chip.getAttribute('data-chip-id'), crestId: svg?.getAttribute('data-crest-id'),
        viewWidth: viewBox?.width || 0, viewHeight: viewBox?.height || 0,
        shapeWidth: box?.width || 0, shapeHeight: box?.height || 0,
        shapeParts: svg?.querySelectorAll('path,rect,polygon,polyline,use').length || 0,
        path: svg?.querySelector('path')?.getAttribute('d') || '',
        rects: svg?.querySelectorAll('rect').length || 0,
        strokeWidth: svg && getComputedStyle(svg).strokeWidth,
        iconWidth: svg && Number(svg.getAttribute('width')),
        faceTop: face?.top || 0, faceOffset: face ? face.top - chip.getBoundingClientRect().top : 0, faceHeight: face?.height || 0,
        contained: Boolean(face && icon && icon.left >= face.left - 1 && icon.right <= face.right + 1 && icon.top >= face.top - 1 && icon.bottom <= face.bottom + 1),
      };
    }));
  assert.deepEqual(crests.map(item => item.chipId),
    ["learn", "push", "test", "review", "deps", "brief", "custom"],
    "six built-in chips and the custom entry are present in order");
  for (const crest of crests) {
    assert.equal(crest.crestId, crest.chipId, `${crest.chipId} renders its own crest`);
    assert.ok(crest.viewWidth > 10 && crest.viewHeight > 8,
      `${crest.chipId} crest uses a larger canvas than the old 10×8 glyph`);
    assert.ok(crest.shapeWidth > 10 && crest.shapeHeight > 8 && crest.shapeParts > 0,
      `${crest.chipId} has a substantial rendered silhouette`);
    assert.ok(crest.path && crest.rects === 0 && crest.strokeWidth === '1.7px' && crest.contained,
      `${crest.chipId} uses the home crest line art centered within its own face: ${JSON.stringify(crest)}`);
    assert.equal(crest.iconWidth, 54, `${crest.chipId} library crest uses the adjusted size`);
  }
  if (page.viewportSize().width >= 761) {
    const brief = crests.find(item => item.chipId === 'brief');
    const custom = crests.find(item => item.chipId === 'custom');
    assert.ok(Math.abs(brief.faceOffset - custom.faceOffset) <= 1 && Math.abs(brief.faceHeight - custom.faceHeight) <= 1,
      `custom and standard chip faces align within their cards across library rows: ${JSON.stringify({brief, custom})}`);
  }
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  const moving = await page.locator('[data-testid="night-library"] .nv-glyph').evaluateAll(icons =>
    icons.map(icon => icon.getAnimations().some(animation => animation.playState === 'running')));
  assert.deepEqual(moving, Array(7).fill(true), 'every library crest animates');
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const still = await page.locator('[data-testid="night-library"] .nv-glyph').evaluateAll(icons =>
    icons.every(icon => icon.getAnimations().every(animation => animation.playState !== 'running')));
  assert.equal(still, true, 'reduced motion disables each crest animation');
  assert.equal(new Set(crests.map(crest => crest.path)).size, 7, 'seven chips use distinct home crests');
  assert.equal(await page.locator('[data-testid="night-v2"] svg[viewBox="0 0 10 8"]').count(), 0,
    "no old 10×8 glyph remains in the Night v2 UI");
}

try {
  for (const width of [1440, 390]) {
    const app = await nightV2Fixture({ prepareState: withThreeSlots });
    try {
      const page = await openNight(app, width);
      await ready(page);
      assert.match(await page.getByTestId("night-plan-notice").innerText(), /真实执行未启用，今晚不会自动运行/);
      assert.match(await page.locator(".nv-bay footer").innerText(), /预设流程.*尚未安排/);
      assert.equal(await page.locator('[data-testid="night-library"] [data-chip-id]').count(), 7);
      await checkLibraryCrests(page);
      assert.equal(await page.locator('[data-testid^="night-slot-"]').count(), 4);
      const standaloneZeros = await page.locator('[data-testid^="night-slot-"]').evaluateAll(slots =>
        slots.flatMap(slot => {
          const walker = document.createTreeWalker(slot, NodeFilter.SHOW_TEXT);
          const found = [];
          for (let node = walker.nextNode(); node; node = walker.nextNode())
            if (node.textContent.trim() === "0") found.push(slot.getAttribute("data-testid"));
          return found;
        }));
      assert.deepEqual(standaloneZeros, [], "empty slots do not render a literal zero");
      assert.equal(nightV2Of(await app.repository.read()).slots.length, 3);
      assert.equal(await page.locator('[data-testid="night-loading"]').isVisible(), false);
      assert.equal(await page.locator('[data-testid="night-error"]').isVisible(), false);
      assert.equal(await page.getByRole("button", {
        name: "配置夜巡执行与成本用量", exact: true,
      }).count(), 0, "old v1 night entry is removed from the v2 page");
      assert.equal(await page.locator(".night-v1-legacy, .night-v14, .nv-legacy").count(), 0,
        "old night panels are absent");
      await checkNightGeometry(page, `evening ${width}`);
      await checkAccessibility(page, `evening ${width}`);
      await screenshot(page, `night-evening-${width}`);

      const firstChip = page.locator('[data-testid="night-slot-1"] .nt-chip');
      await firstChip.click();
      let editor = page.locator('[data-testid="night-edit-drawer"]');
      await editor.waitFor();
      assert.match(await editor.getByTestId("night-template-revision").innerText(), /rev 1/);
      assert.equal(await editor.getByTestId("night-tonight-supplement").inputValue(),
        "今晚优先核对两份一手来源");
      assert.equal(await editor.getByRole("radiogroup", { name: "今晚的主题" }).getByRole("radio").count(), 4,
        "three local topic candidates plus write-your-own");
      for (const source of ["项目空间", "AI HOT 收藏", "随手记"])
        assert.match(await editor.innerText(), new RegExp(source));
      await checkNightGeometry(page, `edit ${width}`);
      await checkAccessibility(page, `edit ${width}`);
      await screenshot(page, `night-edit-${width}`);
      if (width === 390) await checkMobileDrawerReachability(editor, "edit 390");
      await editor.getByRole("button", { name: "关闭芯片编辑" }).focus();
      await page.keyboard.press("Shift+Tab");
      assert.equal(await editor.evaluate(element => element.contains(document.activeElement)), true,
        "keyboard focus remains inside the edit drawer");
      const acceptanceInputs = editor.locator('input[aria-label^="验收标准 "]');
      const originalAcceptance = await acceptanceInputs.evaluateAll(inputs => inputs.map(input => input.value));
      const revisionBeforeEmpty = nightV2Of(await app.repository.read()).revision;
      for (let index = 0; index < originalAcceptance.length; index += 1)
        await acceptanceInputs.nth(index).fill("");
      assert.equal(await editor.getByRole("button", { name: "保存到 SLOT 1" }).isDisabled(), true,
        "empty acceptance cannot save an existing slot");
      assert.equal(nightV2Of(await app.repository.read()).revision, revisionBeforeEmpty,
        "an incomplete edit has not changed the saved plan");
      for (let index = 0; index < originalAcceptance.length; index += 1)
        await acceptanceInputs.nth(index).fill(originalAcceptance[index]);
      const supplement = editor.getByTestId("night-tonight-supplement");
      await supplement.fill("合成今晚要求".repeat(101));
      assert.ok((await supplement.inputValue()).length <= 600, "tonight supplement max 600");
      const bounded = "合成今晚要求".repeat(100).slice(0, 600);
      await supplement.fill(bounded);
      await editor.getByRole("button", { name: "保存到 SLOT 1" }).click();
      await editor.waitFor({ state: "detached" });
      assert.equal(nightV2Of(await app.repository.read()).slots[0].tonightSupplement, bounded);
      assert.equal(nightV2Of(await app.repository.read()).supplementArchive.length, 0,
        "saving tonight's text does not falsely claim it has been used");

      const moveButton = page.getByRole("button", { name: "将槽 1 后移" });
      await moveButton.focus();
      await moveButton.press("Enter");
      await page.waitForFunction(() => document.querySelector('[data-testid="night-slot-1"] [data-chip-id]')?.getAttribute('data-chip-id') === 'push');
      assert.equal(nightV2Of(await app.repository.read()).slots[0].chipId, "push",
        "keyboard reorder persists execution order");
      if (width === 1440) {
        await page.locator('[data-testid="night-slot-1"]').dragTo(
          page.locator('[data-testid="night-slot-3"]'));
        await page.waitForFunction(() => document.querySelector('[data-testid="night-slot-3"] [data-chip-id]')?.getAttribute('data-chip-id') === 'push');
        assert.equal(nightV2Of(await app.repository.read()).slots[2].chipId, "push",
          "pointer drag persists execution order");

        await page.locator('[data-testid="night-library"] [data-chip-id="review"]').click();
        editor = page.locator('[data-testid="night-edit-drawer"]');
        await editor.getByLabel("今晚目标").fill("审查合成项目的明确范围");
        await editor.getByRole("button", { name: "插入今晚" }).click();
        await editor.waitFor({ state: "detached" });
        assert.equal(nightV2Of(await app.repository.read()).slots.length, 4,
          "fourth slot can be filled");
        await page.locator('[data-testid="night-library"] [data-chip-id="deps"]').click();
        editor = page.locator('[data-testid="night-edit-drawer"]');
        await editor.getByLabel("今晚目标").fill("第五个任务必须被拒绝");
        await editor.getByRole("button", { name: "插入今晚" }).click();
        await editor.getByRole("alert").getByText(/插槽已满/).waitFor();
        assert.equal(nightV2Of(await app.repository.read()).slots.length, 4,
          "fifth slot cannot enter the queue");
        await editor.getByRole("button", { name: "取消", exact: true }).click();
      }

      await page.locator('[data-testid="night-library"] [data-chip-id="custom"]').click();
      editor = page.locator('[data-testid="night-edit-drawer"]');
      await editor.waitFor();
      assert.equal(await editor.getByRole("radiogroup", { name: "芯片颜色" }).getByRole("radio").count(), 6);
      assert.equal(await editor.getByRole("radiogroup", { name: "芯片图符" }).getByRole("radio").count(), 6);
      assert.equal(await page.locator('[data-testid="night-v2"] svg[viewBox="0 0 10 8"]').count(), 0,
        "custom chip editor has no old 10×8 glyphs");
      assert.equal(await editor.getByRole("radiogroup", { name: "产出形态" }).getByRole("radio").count(), 4);
      assert.equal(await editor.getByRole("button", { name: "保存芯片" }).isDisabled(), true,
        "custom chip without acceptance cannot save");
      await editor.getByLabel("芯片名称").fill("合成周报芯片");
      await editor.getByLabel("自定义芯片 Prompt").fill("读取合成项目的本周交接，只写一页周报，不触碰真实数据。");
      await editor.getByRole("textbox", { name: "验收标准 1", exact: true }).fill("每条结论附合成证据指针");
      await checkNightGeometry(page, `custom ${width}`);
      await checkAccessibility(page, `custom ${width}`);
      await screenshot(page, `night-custom-${width}`);
      if (width === 390) await checkMobileDrawerReachability(editor, "custom 390");
      await editor.getByRole("button", { name: "保存芯片" }).click();
      await editor.waitFor({ state: "detached" });
      assert.equal(nightV2Of(await app.repository.read()).chips.filter(chip => chip.origin === "custom").length, 1);
      assert.equal(await page.locator('[data-testid="night-library"] [data-chip-id]').count(), 8);
      const customId = nightV2Of(await app.repository.read()).chips.find(chip => chip.origin === "custom").id;

      if (width === 390) {
        await page.locator(`[data-testid="night-library"] [data-chip-id="${customId}"]`).click();
        editor = page.locator('[data-testid="night-edit-drawer"]');
        await editor.getByLabel("今晚目标").fill("合成自定义周报");
        await editor.getByRole("button", { name: "插入今晚" }).click();
        await editor.waitFor({ state: "detached" });
        let customSlot = nightV2Of(await app.repository.read()).slots[3];
        assert.equal(customSlot.chipId, customId, "custom chip can enter the fourth slot");
        assert.equal(customSlot.goal, "合成自定义周报");
        assert.equal(customSlot.chipRevision, 1);
        await page.locator('[data-testid="night-slot-4"] .nt-chip').click();
        editor = page.locator('[data-testid="night-edit-drawer"]');
        await editor.getByLabel("今晚目标").fill("合成自定义周报，补充结论索引");
        await editor.getByTestId("night-tonight-supplement").fill("只核查合成材料");
        await editor.getByRole("button", { name: "保存到 SLOT 4" }).click();
        await editor.waitFor({ state: "detached" });
        customSlot = nightV2Of(await app.repository.read()).slots[3];
        assert.equal(customSlot.goal, "合成自定义周报，补充结论索引",
          "custom slot task can be edited after insertion");
        assert.equal(customSlot.tonightSupplement, "只核查合成材料");
        assert.equal(nightV2Of(await app.repository.read()).chips.find(chip => chip.id === customId).templateRevision, 1,
          "editing tonight's custom task does not revise its reusable template");
      }

      if (width === 1440) {
        await page.locator(`[data-testid="night-library"] [data-chip-id="${customId}"]`).click();
        editor = page.locator('[data-testid="night-edit-drawer"]');
        await editor.getByRole("button", { name: "管理自定义芯片模板" }).click();
        await editor.getByRole("button", { name: "复制芯片" }).click();
        await editor.waitFor({ state: "detached" });
        const customChips = nightV2Of(await app.repository.read()).chips.filter(chip => chip.origin === "custom");
        assert.equal(customChips.length, 2, "custom chip can be copied");
        await page.locator(`[data-testid="night-library"] [data-chip-id="${customChips[1].id}"]`).click();
        editor = page.locator('[data-testid="night-edit-drawer"]');
        await editor.getByRole("button", { name: "管理自定义芯片模板" }).click();
        page.once("dialog", (dialog) => dialog.accept());
        await editor.getByRole("button", { name: "删除芯片" }).click();
        await editor.waitFor({ state: "detached" });
        assert.equal(nightV2Of(await app.repository.read()).chips.filter(chip => chip.origin === "custom").length, 1);

        await page.locator('[data-testid="night-library"] [data-chip-id="learn"]').click();
        editor = page.locator('[data-testid="night-edit-drawer"]');
        await editor.getByRole("button", { name: "改模板" }).click();
        await editor.getByLabel("长期模板 Prompt").fill("合成模板 revision 2：只读交叉核对两份来源。");
        await editor.getByRole("button", { name: "保存模板修订" }).click();
        await editor.getByTestId("night-template-revision").getByText(/rev 2/).waitFor();
        const afterRevision = nightV2Of(await app.repository.read());
        assert.equal(afterRevision.chips.find(chip => chip.id === "learn").templateRevision, 2);
        assert.equal(afterRevision.slots.find(slot => slot.chipId === "learn").chipRevision, 1,
          "slot stays pinned to its original template revision");
        await editor.getByRole("button", { name: "修订历史" }).click();
        assert.equal(await editor.getByRole("list", { name: "模板修订历史" }).locator("li").count(), 2);
        await editor.getByRole("button", { name: "取消", exact: true }).click();
        await page.locator('[data-testid^="night-slot-"] [data-chip-id="learn"]').click();
        editor = page.locator('[data-testid="night-edit-drawer"]');
        assert.match(await editor.getByTestId("night-template-revision").innerText(), /rev 1/);
        assert.match(await editor.locator(".nv-template-text").innerText(), /围绕\{主题\}做深度学习/);
        assert.match(await editor.locator(".nv-slot-revision").innerText(), /芯片库当前为 rev 2/);
        assert.equal(await editor.getByRole("textbox", { name: "验收标准 1", exact: true }).inputValue(),
          NIGHT_V2_PRESETS.find(chip => chip.id === "learn").acceptance[0],
          "updating the library template does not rewrite the existing slot");
        await editor.getByRole("button", { name: "取消", exact: true }).click();
        await page.locator('[data-testid="night-library"] [data-chip-id="learn"]').click();
        editor = page.locator('[data-testid="night-edit-drawer"]');
        assert.match(await editor.getByTestId("night-template-revision").innerText(), /rev 2/,
          "new entries use the current library revision");

        // Another page writes a new template while the editor remains open.
        // The stale editor must surface a conflict and preserve that new version.
        const stored = await app.repository.read();
        const external = reviseChip(stored, "learn", {
          templatePrompt: "合成外部 revision 3：保留这份更新。",
          acceptance: ["新版验收只对新插槽生效"],
        }, { expectedRevision: 2, at: "2026-10-06T11:00:00.000Z" });
        await app.repository.write(external);
        await editor.getByRole("button", { name: "改模板" }).click();
        await editor.getByLabel("长期模板 Prompt").fill("合成过期编辑，不能覆盖 revision 3。");
        await editor.getByRole("button", { name: "保存模板修订" }).click();
        await editor.getByRole("alert").getByText(/本次保存未确认/).waitFor();
        assert.equal(nightV2Of(await app.repository.read()).chips.find(chip => chip.id === "learn").templatePrompt,
          "合成外部 revision 3：保留这份更新。");
        await editor.getByRole("button", { name: "取消", exact: true }).click();
        await page.reload();
        await ready(page);
        await page.locator('[data-testid^="night-slot-"] [data-chip-id="learn"]').click();
        editor = page.locator('[data-testid="night-edit-drawer"]');
        await editor.waitFor();
        assert.match(await editor.getByTestId("night-template-revision").innerText(), /rev 1/,
          "existing slot displays its locked template revision");
        assert.match(await editor.locator(".nv-template-text").innerText(), /围绕\{主题\}做深度学习/,
          "existing slot displays its original prompt");
        assert.equal(await editor.getByRole("textbox", { name: "验收标准 1", exact: true }).inputValue(),
          NIGHT_V2_PRESETS.find(chip => chip.id === "learn").acceptance[0],
          "existing slot keeps the original default acceptance");
        await editor.getByRole("button", { name: "取消", exact: true }).click();
      }
      const beforeArchive = await app.repository.read();
      const learnSlot = nightV2Of(beforeArchive).slots.find(slot => slot.chipId === "learn");
      assert.ok(learnSlot, "the learned slot remains in the saved plan");
      await app.repository.write(archiveSupplement(beforeArchive, learnSlot.id,
        { at: "2026-10-07T00:00:00.000Z" }));
      const afterArchive = nightV2Of(await app.repository.read());
      assert.equal(afterArchive.slots.find(slot => slot.id === learnSlot.id).tonightSupplement, "",
        "archiving clears the one-night instruction from the active slot");
      assert.deepEqual(afterArchive.supplementArchive.map(item => item.text), [bounded],
        "the used one-night instruction is retained in the synthetic archive");
      await page.context().close();
    } finally {
      assert.deepEqual(app.forbidden, [], "synthetic fixture did not touch host adapters");
      await app.close();
    }
    const empty = await nightV2Fixture();
    try {
      const oldDraft = { time: "23:00", end: "07:00", tasks: [{
        id: "legacy-synthetic-task", projectId: "demo-project",
        instruction: "合成旧草稿任务，必须人工补验收才可迁入新槽",
      }] };
      const page = await openNight(empty, width, { legacyDraft: oldDraft });
      await ready(page);
      assert.equal(nightV2Of(await empty.repository.read()).slots.length, 0);
      assert.equal(await page.locator('[data-testid^="night-slot-"]').count(), 4);
      assert.equal(await page.locator('[data-testid="night-error"]').isVisible(), false,
        "empty state is not a read error");
      await checkNightGeometry(page, `empty ${width}`);
      await checkAccessibility(page, `empty ${width}`);
      await screenshot(page, `night-empty-${width}`);
      assert.equal(await page.getByRole("button", { name: "查看旧版草稿迁移候选" }).count(), 0,
        "old draft migration entry is removed");
      assert.equal(await page.getByTestId("night-legacy-candidate").count(), 0,
        "old draft migration candidates are not rendered");
      assert.equal(await page.locator(".night-v1-legacy, .night-v14, .nv-legacy").count(), 0,
        "the empty v2 page contains no old night panels");
      assert.deepEqual(nightV2Of(await empty.repository.read()).slots, [],
        "an old synthetic draft does not activate v2 slots");
      assert.equal(nightV2Of(await empty.repository.read()).approval, null);
      assert.equal(oldDraft.tasks[0].instruction, "合成旧草稿任务，必须人工补验收才可迁入新槽");
      await page.context().close();
    } finally {
      assert.deepEqual(empty.forbidden, []);
      await empty.close();
    }
    const gated = await nightV2Fixture();
    try {
      let hold = false;
      let release;
      let fail = false;
      const workspaceRoute = async (route) => {
        if (route.request().method() !== "GET" || !hold) return route.continue();
        if (fail) return route.fulfill({
          status: 503, json: { error: "合成读取失败" },
        });
        await new Promise((resolve) => { release = resolve; });
        return route.continue();
      };
      const page = await openNight(gated, width, {
        homeFirst: true,
        workspaceRoute,
        beforeNight: () => { hold = true; },
      });
      await page.locator('[data-testid="night-loading"]').waitFor();
      assert.equal(await page.locator('[data-testid="night-error"]').isVisible(), false);
      await checkNightGeometry(page, `loading ${width}`);
      await checkAccessibility(page, `loading ${width}`);
      await screenshot(page, `night-loading-${width}`);
      assert.equal(typeof release, "function", "Night v2 made a read-only workspace request");
      release();
      hold = false;
      await ready(page);
      // A subsequent failed read must remain a distinct error with a retry.
      fail = true;
      hold = true;
      await page.evaluate(() => { location.hash = "#home"; });
      await page.locator('[data-testid="night-v2"]').waitFor({ state: "detached" });
      await page.evaluate(() => { location.hash = "#night"; });
      await page.locator('[data-testid="night-error"]').waitFor();
      assert.equal(await page.locator('[data-testid="night-loading"]').isVisible(), false);
      await checkNightGeometry(page, `error ${width}`);
      await checkAccessibility(page, `error ${width}`);
      await screenshot(page, `night-error-${width}`);
      fail = false;
      hold = false;
      await page.getByRole("button", { name: "重试读取" }).click();
      await ready(page);
      await page.context().close();
    } finally {
      assert.deepEqual(gated.forbidden, []);
      await gated.close();
    }
  }
  const narrow = await nightV2Fixture({ prepareState: (initial) => {
    const state = withThreeSlots(initial);
    state.nightV2.slots[0].goal = "合成长中文EnglishWithoutSpaces".repeat(14);
    return state;
  } });
  try {
    const page = await openNight(narrow, 320);
    await ready(page);
    await checkNightGeometry(page, "320 long goal");
    await checkAccessibility(page, "320 long goal");
    await page.context().close();
  } finally {
    assert.deepEqual(narrow.forbidden, []);
    await narrow.close();
  }
  const touchApp = await nightV2Fixture({ prepareState: withThreeSlots });
  try {
    const page = await openNight(touchApp, 390, { touch: true });
    await ready(page);
    assert.equal(await page.evaluate(() => matchMedia('(hover: none)').matches), true,
      "touch fixture has no hover capability");
    const touchControls = await page.locator('[data-testid="night-slot-1"] .nv-slot-tools').evaluate(element => {
      const button = element.querySelector('button[aria-label="将槽 1 后移"]');
      const rect = button.getBoundingClientRect();
      return {
        opacity: Number(getComputedStyle(element).opacity),
        width: rect.width, height: rect.height,
        pointerEvents: getComputedStyle(button).pointerEvents,
      };
    });
    assert.ok(touchControls.opacity >= 0.99, "reorder controls remain visible without hover");
    assert.ok(touchControls.width >= 44 && touchControls.height >= 44,
      "touch reorder target is at least 44 by 44 pixels");
    assert.notEqual(touchControls.pointerEvents, "none");
    const moveButton = page.getByRole("button", { name: "将槽 1 后移" });
    await moveButton.focus();
    await moveButton.press("Enter");
    await page.waitForFunction(() => document.querySelector('[data-testid="night-slot-1"] [data-chip-id]')?.getAttribute('data-chip-id') === 'push');
    assert.equal(nightV2Of(await touchApp.repository.read()).slots[0].chipId, "push",
      "no-hover touch layout retains keyboard reorder");
    await page.context().close();
  } finally {
    assert.deepEqual(touchApp.forbidden, []);
    await touchApp.close();
  }
  assert.deepEqual(pageErrors, []);
  assert.deepEqual(forbiddenRequests, []);
  console.log(`PASS W6/N1 synthetic night browser: ${screenshots.length} screenshots`);
} finally {
  await browser.close();
}
