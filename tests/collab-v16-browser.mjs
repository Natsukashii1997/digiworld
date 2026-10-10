import assert from "node:assert/strict";
import { chromium } from "playwright";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { collabV16Fixture, CURRENT_V16 } from "./collab-v16-fixture.mjs";
import {
  openCollab,
  ready,
  button,
  preview,
  copyPrompt,
  copied,
  axe,
  geometry,
} from "./collab-v16-helpers.mjs";
const out = process.env.GUIJI_TEST_RESULTS || "test-results/collab-v16";
await mkdir(out, { recursive: true });
const app = await collabV16Fixture(),
  browser = await chromium.launch(),
  errors = [];
try {
  for (const width of [320, 390, 1440]) {
    const p = await openCollab(browser, app, width);
    p.on("pageerror", (e) => errors.push(e.message));
    await ready(p);
    assert.equal(await p.getByRole("tab").count(), 3);
    assert.equal(await p.locator(".tm-s").count(), 8);
    assert.equal(await p.locator(".tm-s[aria-current]").count(), 1);
    if (width < 760)
      assert.ok(
        (await p.locator(".tm-scroll").evaluate((e) => e.scrollLeft)) > 400,
      );
    await geometry(p, `${width} full`);
    await axe(p);
    await p.screenshot({
      path: join(out, `full-${width}.png`),
      fullPage: true,
    });
    if (width < 760) {
      const railGap = await p.locator(".tm-st.cur").evaluate((e) => {
        const rail = document.querySelector(".tm-rail").getBoundingClientRect();
        return e.getBoundingClientRect().left - rail.right;
      });
      assert.ok(railGap >= 18, `current station clears fixed lane rail: ${railGap}`);
      const priorGap = await p.locator(".tm-s[aria-current]").evaluate((e) => {
        const prior = e.previousElementSibling?.querySelector(".tm-st");
        const rail = document.querySelector(".tm-rail").getBoundingClientRect();
        return prior ? prior.getBoundingClientRect().left - rail.right : null;
      });
      if (priorGap != null) assert.ok(priorGap >= 16, `previous station remains visible beside fixed lane rail: ${priorGap}`);
      const pinnedLane = async () => p.locator(".tm-lane-inner").first().evaluate((e) => {
        const label = e.getBoundingClientRect();
        const viewport = e.closest(".tm-scroll").getBoundingClientRect();
        return { offset: label.left - viewport.left, visible: label.right > viewport.left };
      });
      const before = await pinnedLane();
      assert.ok(before.visible && before.offset >= (width <= 360 ? 2 : 8) && before.offset <= 24, `lane remains pinned after auto scroll: ${JSON.stringify(before)}`);
      await p.locator(".tm-scroll").evaluate(e => { e.scrollLeft = e.scrollWidth; });
      const after = await pinnedLane();
      assert.ok(after.visible && Math.abs(after.offset - before.offset) <= 1, `lane remains pinned after manual scroll: ${JSON.stringify(after)}`);
    }
    await p.locator(".tm-s").first().focus();
    await p.keyboard.press("Enter");
    const d = p.getByRole("dialog", { name: "阶段详情" });
    await d.getByRole("heading", { name: "方向梳理" }).waitFor();
    assert.match(await d.innerText(), /grill-me|你确认|briefs\/05-notes.md/);
    await axe(p);
    await p.screenshot({
      path: join(out, `node-${width}.png`),
      fullPage: true,
    });
    await p.keyboard.press("Escape");
    await d.waitFor({ state: "detached" });
    assert.equal(
      await p
        .locator(".tm-s")
        .first()
        .evaluate((e) => e === document.activeElement),
      true,
    );
    await p.getByRole("button", { name: /活动记录/ }).click();
    const log = p.getByRole("dialog", { name: "活动记录" });
    assert.equal(await log.locator(".tm-log li").count(), 7);
    assert.match(await log.innerText(), /390 展开按钮偏差/);
    assert.doesNotMatch(await log.innerText(), /BODY-MARKER/);
    await axe(p);
    await p.screenshot({ path: join(out, `log-${width}.png`), fullPage: true });
    await p.keyboard.press("Escape");
    await p.getByRole("tab", { name: /逆向工程/ }).click();
    assert.equal(
      await p.locator(".tm-s[aria-current]").getAttribute("aria-label"),
      "4 认领与实现：当前阶段",
    );
    assert.equal(await button(p, "只复制口令").isDisabled(), true);
    await p.getByRole("tab", { name: /随手记页/ }).click();
    await ready(p);
    const prompt = await preview(p);
    const text = await prompt.getByLabel("提示词", { exact: true }).inputValue();
    assert.match(text, /下一棒：Claude Code/);
    assert.match(text, /核对交接、叠图/);
    await prompt.getByRole("button", { name: /PROMPT/ }).click();
    if (!(await p.getByLabel("下一棒 Agent").isVisible()))
      await button(p, "下一棒口令").click();
    await p.getByLabel("下一棒 Agent").selectOption("claude-code");
    assert.equal(await p.getByRole("option", { name: "Claude 桌面版", exact: true }).count(), 1);
    assert.equal(await p.locator(".launch-meta").count(), 0);
    assert.equal(await p.locator(".cx-launch button").count(), 3);
    assert.match(await p.locator(".cx-launch .go").innerText(), /带到.*CLAUDE.*继续/s);
    assert.equal(await p.locator(".cx-launch .relay-target-name").evaluate(e=>getComputedStyle(e).fontWeight), "800");
    const help = await button(p, "协同使用说明").evaluate(e=>({hit:e.getBoundingClientRect().width,inset:getComputedStyle(e,"::before").left}));
    assert.deepEqual(help,{hit:44,inset:"8px"});
    await geometry(p, `${width} desktop launch`);
    await axe(p);
    await p.screenshot({ path: join(out, `desktop-launch-${width}.png`), fullPage: true });
    if (width === 1440) {
      let opened = 0;
      await p.route("**/api/relay-sessions/open", async route => {
        assert.equal(route.request().postDataJSON().agentId, "claude-code", "保留历史协作角色ID");
        assert.match(await p.evaluate(() => navigator.clipboard.readText()), /下一棒：Claude Code/, "复制成功后才打开桌面版");
        opened++;
        await route.fulfill({ json: { opened: true } });
      });
      await p.locator(".cx-launch").getByRole("button", { name: /带到.*继续/ }).click();
      await copied(p);
      for (let i=0; i<50 && !opened; i++) await p.waitForTimeout(20);
      assert.equal(await p.getByRole("dialog").count(), 0);
      assert.equal(opened, 1);
    }
    await p.context().close();
  }
  console.log(
    "PASS 五态基础/运行切换/站点键盘与焦点回归/活动正文隔离/390当前站自动定位/三宽44px边界与axe",
  );
  await app.mode("alert");
  const p = await openCollab(browser, app, 390);
  await ready(p);
  await p
    .getByText(/写入者冲突/)
    .first()
    .waitFor();
  assert.equal(await p.getByRole("button", { name: /^带到/ }).count(), 0);
  await p.getByText("先暂停双方写入，由当前负责人核对 CURRENT，确认唯一写入者并释放另一方认领；随后刷新看板。", { exact: true }).waitFor();
  await geometry(p, "alert");
  await axe(p);
  await p.screenshot({ path: join(out, "alert-390.png"), fullPage: true });
  await button(p, "查看冲突与下一步").click();
  await p
    .getByRole("dialog", { name: "CURRENT 与协议依据" })
    .getByText("Claude Code / Codex", { exact: true })
    .waitFor();
  await p.keyboard.press("Escape");
  await p.locator('[aria-label*="待处理"]').first().click();
  await p.getByRole("dialog", { name: "待处理" }).waitFor();
  await p
    .getByRole("dialog", { name: "待处理" })
    .getByText(/写入者冲突/)
    .waitFor();
  await p.keyboard.press("Escape");
  await p.context().close();
  await app.mode("empty");
  const q = await openCollab(browser, app, 390);
  await q.getByText("还没有运行中的协同", { exact: true }).waitFor();
  await axe(q);
  await geometry(q, "empty");
  await q.screenshot({ path: join(out, "empty-390.png"), fullPage: true });
  await q.context().close();
  console.log("PASS 冲突/待处理同源、CURRENT依据、无运行空态");
  await app.mode("full");
  const blockedPage = await openCollab(browser, app, 390);
  await ready(blockedPage);
  await button(blockedPage, "协同使用说明").click();
  await blockedPage.getByRole("dialog", { name: "协同使用说明" }).waitFor();
  await axe(blockedPage);
  await blockedPage.keyboard.press("Escape");
  const frozenPrompt = await preview(blockedPage);
  await writeFile(
    join(app.paths.collab, "CURRENT.md"),
    CURRENT_V16.replace("2026-10-07-notes-5.md", "missing.md"),
  );
  await copyPrompt(blockedPage);
  await blockedPage
    .getByText(/项目协议已变化/)
    .first()
    .waitFor();
  assert.equal(await blockedPage.getByRole("dialog").count(), 0);
  await ready(blockedPage);
  assert.equal(await button(blockedPage, "只复制口令").isDisabled(), true);
  await blockedPage.context().close();
  console.log("PASS 使用说明/复制前重读发现持续缺失交接即阻断");
  await app.mode("full");
  // Empty edits and clipboard rejection never record or open an application.
  const failure = await openCollab(browser, app, 1440);
  await ready(failure);
  const launch = await preview(failure);
  const editor = launch.getByLabel("提示词", { exact: true });
  const originalText = await editor.inputValue();
  const logBefore = (await app.workspace()).collabLog.length;
  let opens = 0;
  await failure.route("**/api/relay-sessions/open", async route=>{opens++;await route.fulfill({json:{opened:true}});});
  await editor.fill("   ");
  assert.equal(await button(launch,"只复制提示词").isDisabled(), true);
  assert.equal(await launch.getByRole("button",{name:/带到.*继续/}).isDisabled(), true);
  await button(failure,"只复制口令").click();
  await failure.getByText("请先填写提示词",{exact:true}).waitFor();
  assert.equal((await app.workspace()).collabLog.length,logBefore);
  assert.equal(opens,0);
  await editor.fill(originalText+"\n手动编辑");
  await failure.evaluate(()=>{navigator.clipboard.writeText=()=>Promise.reject(new Error("拒绝复制"));});
  await launch.getByRole("button",{name:/带到.*继续/}).click();
  await failure.getByRole("alert").filter({hasText:/复制失败/}).waitFor();
  assert.equal((await app.workspace()).collabLog.length,logBefore);
  assert.equal(opens,0);
  await failure.context().close();

  // Leaving while checking must cause zero copy/log/open. Leaving after copying
  // may finish that original fact's record, but must never open an app late.
  for (const phase of ["protocol","record"]) {
    const race = await openCollab(browser,app,1440); await ready(race);
    const region = await preview(race);
    let copies=0,lateOpens=0,release,arrived;
    const gate=new Promise(resolve=>release=resolve), seen=new Promise(resolve=>arrived=resolve);
    await race.exposeFunction("didCopy",()=>copies++);
    await race.evaluate(()=>{navigator.clipboard.writeText=async()=>window.didCopy();});
    await race.route("**/api/relay-sessions/open",async route=>{lateOpens++;await route.fulfill({json:{opened:true}});});
    await race.route("**/api/collab/"+phase,async route=>{arrived();await gate;await route.fallback();},{times:1});
    const before=(await app.workspace()).collabLog.length;
    await region.getByRole("button",{name:/带到.*继续/}).click(); await seen;
    assert.equal(await race.getByLabel("下一棒 Agent").isDisabled(),true);
    for (const tab of await race.getByRole("tab").all()) assert.equal(await tab.isDisabled(),true);
    await race.evaluate(()=>{location.hash="#projects";});
    await race.locator(".collab-v16").waitFor({state:"detached"});
    const done=race.waitForResponse(r=>r.url().endsWith("/api/collab/"+phase));
    release();await done;
    if (phase==="record") for(let i=0;i<100&&(await app.workspace()).collabLog.length===before;i++) await race.waitForTimeout(20);
    await race.waitForTimeout(150);
    assert.equal(copies,phase==="protocol"?0:1);
    assert.equal((await app.workspace()).collabLog.length,before+(phase==="record"?1:0));
    assert.equal(lateOpens,0);
    await race.context().close();
  }
  console.log("PASS 空编辑/复制拒绝零留痕零打开；重读在途锁目标、离页零复制；复制后离页只完成原留痕不迟到打开");
  await app.mode("full");
  await writeFile(join(app.paths.collab, "CURRENT.md"),
    "# 合成协同项目\n## 协作状态\n" +
    "| state_id | WB-258 |\n| 当前写入者 | Codex |\n" +
    "| 当前任务 | [Codex 认领258](docs/agents/handoffs/claim-258.md)：修复六张截图中的布局问题 |\n" +
    "| 唯一下一步 | Codex 完成本轮返修 |\n");
  for (const width of [320, 390, 393, 400, 1440]) {
    const legacy = await openCollab(browser, app, width);
    await ready(legacy);
    const summary = legacy.locator(".cx-sum");
    assert.match(await summary.locator("h2").innerText(), /当前协作/);
    assert.match(await summary.locator(".cx-task-summary").innerText(), /Codex 认领258：修复六张截图中的布局问题/);
    assert.doesNotMatch(await summary.innerText(), /\]\(|claim-258\.md/);
    assert.match(await summary.locator(".cx-sum-missing").innerText(), /运行编号、推进节奏、开始时间未登记/);
    assert.equal(await legacy.getByRole("tab", { name: /当前协作/ }).count(), 1);
    if ([390, 393, 400].includes(width)) {
      const line = await legacy.locator(".tm-head").evaluate((head) => {
        const label = head.querySelector(":scope > .en");
        const action = head.querySelector(".tm-logbtn");
        const lineHeight = parseFloat(getComputedStyle(label).lineHeight) ||
          parseFloat(getComputedStyle(label).fontSize) * 1.4;
        return { labelHeight: label.getBoundingClientRect().height,
          lineHeight, labelBottom: label.getBoundingClientRect().bottom,
          actionTop: action.getBoundingClientRect().top };
      });
      if (width < 400)
        assert.ok(line.labelBottom <= line.actionTop + 1, `${width}px 线路图说明与活动记录分行`);
      assert.ok(line.labelHeight <= line.lineHeight + 1, `${width}px 线路图说明不得出现孤字折行`);
    }
    await geometry(legacy, `${width} legacy CURRENT`);
    await axe(legacy);
    await legacy.screenshot({ path: join(out, `legacy-current-${width}.png`), fullPage: true });
    await legacy.context().close();
  }
  console.log("PASS 旧 CURRENT 链接状态句只作次级摘要；运行标题、未知元数据与两宽布局正确");
  assert.deepEqual(errors, []);
} finally {
  await browser.close();
  await app.close();
}
