import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { chromium } from "playwright";
import { fixture189, routes189 } from "./savepoints-v16-fixture.mjs";
import {pendingItems} from "../src/pending.js";
import { geometry, axe, motion } from "./ui-v14-checks.mjs";
const out = process.env.GUIJI_TEST_RESULTS || "test-results/savepoints189";
await mkdir(out, { recursive: true });
const browser = await chromium.launch(),
  errors = [], contexts = new Set();
async function closeApp(app) {
  // 断言/导航失败也先关闭浏览器连接，避免夹具服务等待泄漏的context。
  await Promise.all([...contexts].map(context => context.close()));
  await app.close();
}
async function pageFor(app, width = 1440, mode = "main", options = {}) {
  const context = await browser.newContext({
      viewport: { width, height: 1000 },
      timezoneId: "Asia/Shanghai",
      reducedMotion: "reduce",
      permissions: ["clipboard-read", "clipboard-write"],
    });
  contexts.add(context);
  context.on("close", () => contexts.delete(context));
  try {
  const page = await context.newPage();
  page.on("pageerror", (e) => errors.push(e.message));
  await page.clock.setFixedTime(new Date("2026-10-05T05:20:00Z"));
  await page.route("**/*", (r) => {
    assert.equal(new URL(r.request().url()).origin, new URL(app.url).origin);
    return r.continue();
  });
  await routes189(page, app, options);
  await page.goto(app.url + "/#history");
  await page.getByRole("heading", { name: "存档点", exact: true }).waitFor();
  if (["nogit", "cloud", "empty"].includes(mode)) {
    const name = { nogit: "菜谱盒子", cloud: "resume-site", empty: "dotfiles" }[
      mode
    ];
    await page.getByRole("tab", { name: new RegExp(name) }).click();
  }
  await page
    .locator(
      mode === "nogit"
        ? ".sp-pending.nogit"
        : mode === "cloud"
          ? ".sp-cloudonly"
          : ".sp-pending",
    )
    .waitFor();
  return { context, page };
  } catch (error) { await context.close(); throw error; }
}
try {
  const thresholdApp=await fixture189();
  try {
    await thresholdApp.repository.updateConnections(c=>({...c,projectSavepointWarnDays:2,projectSavepointDangerDays:5,projects:c.projects.map(p=>({...p,recentUpdate:{...p.recentUpdate,at:"2026-10-01T05:20:00.000Z"}}))}));
    thresholdApp.data.report.ageDays=thresholdApp.data.report.days=4;
    const {context,page:p}=await pageFor(thresholdApp);
    assert(await p.locator('.sp-pending.warn').count(),'四天应为黄');
    assert(await p.locator('.sp-tab[aria-selected=true] .sp-dot.warn').count(),'页签同步黄阈值');
    const state=await thresholdApp.repository.read();assert(!pendingItems(state,undefined,undefined,undefined,undefined,undefined,{now:Date.parse("2026-10-05T05:20:00Z")}).some(x=>x.id==='project-unsaved-save-project-0'),'四天未超过红5不进待处理');
    assert(pendingItems(state,undefined,undefined,undefined,undefined,undefined,{now:Date.parse("2026-10-07T05:20:00Z")}).some(x=>x.id==='project-unsaved-save-project-0'),'六天超过红5进待处理');await context.close();
  } finally {await closeApp(thresholdApp);}
  for (const mode of ["main", "commit", "nogit", "cloud", "empty"]) {
    const app = await fixture189(mode);
    try {
      for (const width of [1440, 1024, 430, 393, 390, 375, 320]) {
        console.log('CHECK savepoints',mode,width);
        const { context, page: p } = await pageFor(app, width, mode);
        try {
        await geometry(p, "#savepoint-project", mode + width);
        await geometry(p, ".page-heading", "页头" + width);
        const tabs = p.getByRole("tab");
        for (const tab of await tabs.all()) {
          await tab.scrollIntoViewIfNeeded();
          const box = await tab.boundingBox();
          assert.ok(box.width >= 44 && box.height >= 44);
          assert.ok(box.x >= -1 && box.x + box.width <= width + 1);
        }
        await tabs.first().scrollIntoViewIfNeeded();
        if (mode === "commit") {
          await p
            .getByRole("button", { name: "创建存档点", exact: true })
            .click();
          const d = p.getByRole("dialog", { name: "创建存档点", exact: true });
          await d.waitFor();
          assert.equal(
            await d
              .getByRole("checkbox", { name: ".env.local", exact: true })
              .isChecked(),
            false,
          );
          await d
            .locator(".sp-pick section")
            .filter({ has: p.locator("h4").filter({ hasText: /^docs\// }) })
            .getByRole("button", { name: /展开/ })
            .click();
          assert.equal(
            await d
              .getByRole("checkbox", {
                name: "docs/raw-capture.mov",
                exact: true,
              })
              .isChecked(),
            false,
          );
          await geometry(p, "[role=dialog]", "预览" + width);
          await axe(p, "预览" + width);
          await p.screenshot({
            path: join(out, `commit-preview-${width}.png`),
          });
          await p.keyboard.press("Escape");
          assert.equal(await d.count(), 0);
          await p.waitForFunction(
            () =>
              document.activeElement ===
              document.querySelector(".sp-pending .sp-save"),
          );
          assert.equal(
            await p
              .getByRole("button", { name: "创建存档点", exact: true })
              .evaluate((e) => document.activeElement === e),
            true,
          );
        }
        await axe(p, mode + width);
        await p.screenshot({
          path: join(out, `${mode}-${width}.png`),
          fullPage: true,
        });
        } finally { await context.close(); }
      }
    } finally {
      await closeApp(app);
    }
  }
  const app = await fixture189();
  try {
    const { context, page: p } = await pageFor(app);
    await p.getByRole("button", { name: /^项目空间/ }).click();
    await p
      .getByRole("article", { name: "项目状态卡：个人 AI 工作台", exact: true })
      .getByRole("button", { name: "未存档 1 天", exact: true })
      .click();
    await p.getByRole("tab", { name: /个人 AI 工作台/ }).waitFor();
    assert.equal(
      await p
        .getByRole("tab", { name: /个人 AI 工作台/ })
        .getAttribute("aria-selected"),
      "true",
    );
    assert.equal(
      app.data.calls.filter((c) => c.action === "inspect").at(-1).body
        .projectId,
      "save-project-0",
    );
    const tabs = p.getByRole("tab");
    await tabs.first().press("End");
    assert.equal(await tabs.last().getAttribute("aria-selected"), "true");
    await tabs.last().press("Home");
    assert.equal(await tabs.first().getAttribute("aria-selected"), "true");
    await p.locator(".sp-pending").waitFor();
    app.data.comparison={text:"diff --git a/src/a.jsx b/src/a.jsx\n-old\n+new",files:[{path:"src/a.jsx",added:2,deleted:1},{path:"server/api.mjs",added:4,deleted:0},{path:"assets/binary.png",added:null,deleted:null}],untracked:2,truncated:true};
    await p.getByRole("button", { name: "与现在对比", exact: true }).click();
    await p
      .getByRole("dialog", { name: "与现在对比", exact: true })
      .getByText(/diff --git/)
      .waitFor();
    const compared=p.getByRole("dialog",{name:"与现在对比",exact:true});
    await compared.getByText(/已跟踪文件中有 3 个发生变化/).waitFor();
    assert.match(await compared.getByRole("status").innerText(),/已截断.*2 个未跟踪/);
    await compared.getByText("页面与样式 · 1 个",{exact:true}).waitFor();
    await compared.getByText("服务与数据 · 1 个",{exact:true}).waitFor();
    await geometry(p,'[role=dialog]','差异摘要');await axe(p,'差异摘要');
    await p.keyboard.press("Escape");
    await p.getByRole("button", { name: "生成回退口令", exact: true }).click();
    const copied = await p.evaluate(() => navigator.clipboard.readText());
    assert.match(copied, /a41c9e2/);
    assert.match(copied, /先创建存档点/);
    assert.match(copied, /\/synthetic\/Projects\/workbench/);
    assert.equal(
      app.data.calls.filter((x) => x.action === "confirm").length,
      0,
    );
    await p
      .getByRole("button", { name: "WB-20261003-123 · 交接", exact: true })
      .click();
    await p
      .getByRole("dialog", { name: "WB-20261003-123 · 交接", exact: true })
      .waitFor();
    await p.keyboard.press("Escape");
    await p.getByRole("button", { name: "创建存档点", exact: true }).click();
    const d = p.getByRole("dialog", { name: "创建存档点", exact: true });
    await d
      .getByRole("checkbox", { name: "src/AgentsV16.jsx", exact: true })
      .uncheck();
    await d.getByLabel("存档说明").fill("合成：选择存档");
    await d.getByRole("button", { name: "创建存档点", exact: true }).click();
    await p.getByText("已存档 · ffffffffffff", { exact: true }).waitFor();
    const call = app.data.calls.find((x) => x.action === "confirm");
    assert.equal(call.body.message, "合成：选择存档");
    assert.ok(!call.body.files.includes("src/AgentsV16.jsx"));
    assert.ok(!call.body.files.includes(".env.local"));
    assert.equal(await d.count(), 0);
    await motion(p, "#savepoint-project");
    await p.getByRole("button", { name: /^项目空间/ }).click();
    await p
      .getByRole("article", { name: "项目状态卡：个人 AI 工作台", exact: true })
      .waitFor();
    assert.equal(
      await p.locator(".pj-savepoint-hint").count(),
      0,
      "成功后的跨页提示采用新读取，不能沿用旧扫描日期",
    );
    await context.close();
  } finally {
    await closeApp(app);
  }
  // Strict elapsed thresholds: 25h is yellow and 73h red although whole days are 1/3.
  for(const [hours,tone] of [[24,'ok'],[25,'warn'],[72,'warn'],[73,'bad']]) {
    const age=await fixture189();
    try {
      age.data.report.days=Math.floor(hours/24);age.data.report.ageDays=hours/24;
      const {context,page:p}=await pageFor(age,390);
      assert.equal(await p.locator('.sp-pending').evaluate((e,t)=>e.classList.contains(t),tone),true);
      assert.equal(await p.getByRole('tab',{name:/个人 AI 工作台/}).locator('.sp-dot').evaluate((e,t)=>e.classList.contains(t),tone),true);
      await context.close();
    } finally {await closeApp(age);}
  }
  const init=await fixture189('nogit');
  try {
    const {context,page:p}=await pageFor(init,390,'nogit');
    await p.getByRole('button',{name:'开启存档',exact:true}).click();
    const d=p.getByRole('dialog');await d.getByLabel('存档说明').waitFor();
    assert.equal(await d.getByRole('checkbox',{name:'.gitignore',exact:true}).isChecked(),true);
    assert.equal(await d.getByRole('checkbox',{name:'.gitignore',exact:true}).isDisabled(),true,'初始化缺失ignore必须选入');
    await geometry(p,'[role=dialog]','初始化预览');await axe(p,'初始化预览');
    await p.keyboard.press('Escape');assert.equal(init.data.calls.filter(c=>c.action==='confirm').length,0,'取消预览不初始化');
    await context.close();
  } finally {await closeApp(init);}
  // Unknown request reached no server: query establishes not_started, allowing a fresh preview.
  const lost = await fixture189();
  try {
    const { context, page: p } = await pageFor(lost, 390, "main", {
      confirm: (r) => r.abort(),
      query: (r) => r.fulfill({ json: { state: "not_started" } }),
    });
    await p.getByRole("button", { name: "创建存档点", exact: true }).click();
    const d = p.getByRole("dialog", { name: "创建存档点", exact: true });
    await d.getByLabel("存档说明").fill("保留说明草稿");
    await d.getByRole("button", { name: "创建存档点", exact: true }).click();
    await d.getByRole("button", { name: "查询结果", exact: true }).waitFor();
    assert.equal(
      await d.getByLabel("存档说明").isDisabled(),
      true,
      "结果未知不能改说明重放",
    );
    await p.keyboard.press("Escape");
    assert.equal(await d.count(), 1, "未知操作保留查询入口");
    await d.getByRole("button", { name: "查询结果", exact: true }).click();
    await d.waitFor({ state: "detached" });
    await p.getByRole("button", { name: "创建存档点", exact: true }).click();
    assert.equal(
      await p.getByRole("dialog").getByLabel("存档说明").inputValue(),
      "保留说明草稿",
    );
    await p.keyboard.press("Escape");
    await context.close();
  } finally {
    await closeApp(lost);
  }
  // Historical archived assets remain in storage but no longer appear in the warehouse.
  const archived = await fixture189();
  try {
    let s = await archived.repository.read();
    const id = s.assets[0].id,
      title = s.assets[0].versions.at(-1).title;
    await archived.repository.write({
      ...s,
      assets: s.assets.map((a) => (a.id === id ? { ...a, archived: true } : a)),
    });
    const { context, page: p } = await pageFor(archived);
    await p.getByRole("button", { name: /^资产仓库/ }).click();
    await p.getByRole("group", { name: "资产类型" }).waitFor();
    assert.equal(await p.getByRole("group", { name: "资产类型" }).getByRole("button", { name: /^已归档/ }).count(), 0);
    assert.equal(await p.getByRole("button", { name: "查看 " + title, exact: true }).count(), 0);
    assert.equal(
      (await archived.repository.read()).assets.find((a) => a.id === id)
        .archived,
      true,
    );
    await context.close();
  } finally {
    await closeApp(archived);
  }
  assert.deepEqual(errors, []);
  console.log(
    "PASS 五态×七宽、44px/逐元素/横滑、axe/Esc/焦点、选文件确认、凭据默认不选、对比/交接、回退仅复制、未知not_started恢复、历史归档资产保留但仓库隐藏、运行中reduce、外连0。",
  );
} finally {
  await browser.close();
}
