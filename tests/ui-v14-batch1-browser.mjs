// 批次1：合成数据、窄屏逐元素、44px、axe、运行中reduce；不访问真实宿主。
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import AxeBuilder from "@axe-core/playwright";
import { fixture } from "./fixture.mjs";
import { batch1State } from "./ui-v14-batch1-fixture.mjs";
import { seed } from "../src/store.js";
import { diffText } from "../src/version-diff.js";
const { chromium } = createRequire(import.meta.url)(
  process.env.PLAYWRIGHT_MODULE ||
    "/Users/nat/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright",
);
let app = await fixture();
await initialize(batch1State());
async function initialize(state) {
  const scanned = { ...seed().connections, roots:[], projects:[], agents:[{id:"codex",name:"Codex",kind:"开发 Agent",status:"detected",programs:[],configFound:true}], errors:[], truncated:false, github:{status:"not_connected",login:"",message:"",at:"2026-10-02T08:00:00.000Z"}, agentScannedAt:"2026-10-02T08:00:00.000Z" };
  state.connections = (await app.repository.read())?.connections || seed().connections;
  await app.repository.write(state, { initialize: true });
  await app.repository.updateConnections(() => scanned);
}
const browser = await chromium.launch();
const errors = [];
const roots = {
  inbox: ".ib-drawer",
  history: '[role="dialog"][aria-label="资产详情"]',
  references: ".reverse-v14",
};
const b = (p, n) => p.getByRole("button", { name: n, exact: true });
async function open(width, route, motion = "reduce") {
  const context = await browser.newContext({
    viewport: { width, height: 1000 },
    reducedMotion: motion,
  });
  const p = await context.newPage();
  p.setDefaultTimeout(10000);
  p.on("pageerror", (e) => errors.push(String(e)));
  await p.goto(app.url + "/#" + (route==='history'?'assets':route));
  if(route==='history'){
    const asset=(await app.repository.read()).assets.find(a=>a.id==='batch-history');
    await b(p,'查看 '+asset.versions.at(-1).title).click();
    await p.getByRole('dialog',{name:'资产详情'}).getByRole('button',{name:/^历史 \d+$/}).click();
  }
  await p.locator(roots[route]).waitFor();
  return p;
}
async function settle(p) {
  await p.waitForFunction(() =>
    document
      .getAnimations()
      .every(
        (a) =>
          a.playState !== "running" ||
          a.effect?.getComputedTiming().iterations === Infinity,
      ),
  );
}
async function geometry(p, route, label) {
  assert.deepEqual(
    await p.evaluate((selector) => {
      const root = document.querySelector(selector),
        bad = [];
      if (document.documentElement.scrollWidth > innerWidth)
        bad.push("整页横向越界");
      for (const e of [root, ...root.querySelectorAll("*")]) {
        if (e.closest("svg,.sr-only") || !e.checkVisibility()) continue;
        const r = e.getBoundingClientRect(),
          s = getComputedStyle(e);
        if (!r.width && !r.height) continue;
        const name = e.tagName + "." + [...e.classList].join(".");
        if (r.left < -0.5 || r.right > innerWidth + 0.5)
          bad.push(name + " 边界 " + r.left + ".." + r.right);
        if (
          ["hidden", "clip"].includes(s.overflowX) &&
          e.scrollWidth > e.clientWidth + 1
        )
          bad.push(name + " 横向裁切");
        if (
          ["hidden", "clip"].includes(s.overflowY) &&
          e.scrollHeight > e.clientHeight + 1
        )
          bad.push(name + " 纵向裁切");
      }
      return bad;
    }, roots[route]),
    [],
    label,
  );
  for (const control of await p
    .locator(roots[route])
    .locator("button,a,input,select,textarea,summary")
    .all()) {
    if (!(await control.isVisible())) continue;
    const hit = await control.evaluate((e) => {
      const type = e.getAttribute("type");
      const box = (
        ["checkbox", "radio"].includes(type) ? e.closest("label") : e
      )?.getBoundingClientRect();
      return box ? { width: box.width, height: box.height } : null;
    });
    assert(
      hit && hit.width >= 44 && hit.height >= 44,
      label +
        " 44px " +
        (await control.getAttribute("aria-label")) +
        " " +
        JSON.stringify(hit),
    );
  }
}
async function axe(p, label) {
  await settle(p);
  assert.deepEqual(
    (
      await new AxeBuilder({ page: p })
        .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
        .analyze()
    ).violations.map(
      (v) => label + " " + v.id + " " + v.nodes.map((n) => n.target).join(" "),
    ),
    [],
  );
}
try {
  for (const width of [320, 390, 1440]) {
    let p = await open(width, "inbox");
    await p.locator('.ib-count .side b').filter({hasText:'1'}).waitFor();
    assert.equal(await p.locator('.ib-sec').count(),3);
    assert.deepEqual(await p.locator('.ib-count b').allTextContents(),['1','1','0'],'MCP未启用主线与未设置目标支线均为真实来源');
    assert.equal(await p.locator('.inbox-sources,.triage-sum,.triage-kind').count(),0,'批准取消旧页面大数字、来源筛选与来源图标');
    const row=p.locator('.ib-sec.side .ib-card');assert.equal(await row.count(),1);
    assert.equal(await row.locator('time').innerText(),new Date("2026-10-02T08:00:00.000Z").toLocaleString("zh-CN",{month:"numeric",day:"numeric",hour:"2-digit",minute:"2-digit"}),'时间取原已检测记录');
    await geometry(p,"inbox",width+" drawer");await axe(p,"inbox");
    await p.getByRole('button',{name:'关闭待处理',exact:true}).click();assert(await p.locator('.topbar-inbox').evaluate(e=>e===document.activeElement));
    await p.close();
    p = await open(width, "history");
    const history=p.getByRole('dialog',{name:'资产详情',exact:true});
    const versions=batch1State().assets[0].versions;
    assert.equal(await history.getByRole('combobox',{name:'查看版本',exact:true}).locator('option').count(),3);
    await history.getByRole('combobox',{name:'查看版本',exact:true}).selectOption(versions[2].id);
    assert.equal(await history.getByText('当前版本',{exact:true}).count(),1);
    assert.equal(await history.getByRole('button',{name:'恢复此版本',exact:true}).count(),0,'当前版本不可恢复为自己');
    assert.equal(await history.getByText('内容、元数据与文件均无变化。',{exact:true}).count(),1,'当前版本自比较准确');
    await history.getByRole('combobox',{name:'查看版本',exact:true}).selectOption(versions[1].id);
    const lines=diffText(versions[1].content,versions[2].content);
    assert.equal(await history.locator('.version-comparison .diff-line.added').count(),lines.rows.filter(r=>r.type==='added').length);
    assert.equal(await history.locator('.version-comparison .diff-line.removed').count(),lines.rows.filter(r=>r.type==='removed').length);
    await geometry(p, "history", width + " diff");
    await axe(p, "history");
    await p.getByRole('combobox',{name:'查看版本',exact:true}).selectOption('batch-v1');
    await b(p, '恢复此版本').click();
    await p.getByRole("region", { name: "确认恢复" }).waitFor();
    await geometry(p, "history", width + " confirm");
    await axe(p, "restore");
    await b(p, "取消恢复").click();
    await p.keyboard.press('Escape');
    await p.getByRole('group',{name:'资产类型',exact:true}).getByRole('button',{name:/^全部/}).click();
    assert.equal(await p.getByRole('group',{name:'资产类型',exact:true}).getByRole('button',{name:/^已归档/}).count(),0);
    assert.equal(await p.getByRole('button',{name:'查看 旧版周报模板',exact:true}).count(),0);
    assert.equal((await app.repository.read()).assets.find(a=>a.id==='batch-archive')?.archived,true);
    await p.close();
    p = await open(width, "references");
    assert.equal(await p.locator(".reverse-lane").count(), 0,"取消四列看板");
    assert.equal(
      await p.locator(".rail-list").getByRole("radio").count(),
      3,
    );
    await p
      .getByRole("radio", {
        name: "打开逆向记录 一个爆款开头的拆解",
        exact: true,
      })
      .click();
    assert.equal(await p.locator(".reverse-paper").count(), 1);
    assert.equal(await p.locator(".reverse-mark").count(), 3);
    assert.equal(await b(p,"投入参照物").count(),1);
    assert.equal(await b(p,"为 一个爆款开头的拆解（batch-reverse-0）投入新素材").count(),1,"两个素材动作可访问名独立");
    const annotation=await p.locator(".reverse-report").evaluate(report=>{
      const cards=[...report.querySelectorAll(".reverse-section")];
      return {ratios:[...report.querySelectorAll("li .badge")].map(e=>e.getBoundingClientRect().width/e.closest("li").getBoundingClientRect().width),
        gaps:cards.slice(1).map((e,i)=>e.getBoundingClientRect().top-cards[i].getBoundingClientRect().bottom),
        display:[...report.querySelectorAll("mark")].map(e=>getComputedStyle(e).display)};
    });
    if(width===1440)assert(annotation.ratios.every(x=>x<.4),"小标签宽度小于行宽40%");
    assert(annotation.gaps.every(x=>x<=12),"批注卡间距不大于12px");
    assert(annotation.display.every(x=>x==="inline"),"荧光为行内高亮");
    assert.equal(
      await p.locator(".reverse-paper mark").count(),
      0,
      "无锚点不可伪造原文高亮",
    );
    assert.equal(
      await p
        .locator(".reverse-paper")
        .evaluate((e) => getComputedStyle(e).transform),
      "none",
    );
    await geometry(p, "references", width + " clip");
    await axe(p, "reverse");
    await p
      .getByRole("radio", {
        name: "打开逆向记录 一个爆款开头的拆解",
        exact: true,
      })
      .press("End");
    await p.getByRole("region", { name: "入库结果" }).waitFor();
    await geometry(p, "references", width + " locked");
    await p.close();
  }
  console.log(
    "PASS 三页320/390/1440逐元素无越界/裁切、44px、axe、单选键盘、真实行差/确认/报告",
  );
  // 从运行中的动画切换reduce；点阵SVG属性也必须稳定，不只检查CSS。
  for (const route of Object.keys(roots)) {
    const p = await open(390, route, "no-preference");
    await p.waitForFunction(() =>
      document.getAnimations().some((a) => a.playState === "running"),
    );
    await p.emulateMedia({ reducedMotion: "reduce" });
    await p.waitForFunction(() =>
      document.getAnimations().every((a) => a.playState !== "running"),
    );
    const snapshot = () =>
      p
        .locator(route === "inbox" ? ".ib-drawer svg" : "main svg")
        .evaluateAll((es) => es.map((e) => e.outerHTML).join(""));
    const before = await snapshot();
    await p.waitForTimeout(200);
    assert.equal(await snapshot(), before, route + " reduce SVG停止");
    await geometry(p, route, route + " runtime reduce");
    await axe(p, route);
    await p.close();
  }
  console.log("PASS 三页运行中切换reduce：CSS/点阵SVG停止、布局完整");
  // 复用现有恢复handler：失败保留，成功追加，历史不覆写。
  let p = await open(390, "history");
  const before = (await app.repository.read()).assets[0];
  await p.evaluate(() => {
    window.batchSuccessReceipts = [];
    window.batchReceiptObserver = new MutationObserver((entries) => {
      for (const entry of entries) for (const node of entry.addedNodes) {
        if (node.nodeType === 1 && node.matches(".toast.tone-success"))
          window.batchSuccessReceipts.push(node.textContent);
      }
    });
    window.batchReceiptObserver.observe(document.body, { childList: true, subtree: true });
  });
  await p.getByRole('combobox',{name:'查看版本',exact:true}).selectOption('batch-v1');
    await b(p, '恢复此版本').click();
  await p.route("**/api/workspace", (r) =>
    r.request().method() === "PUT"
      ? r.fulfill({
          status: 503,
          contentType: "application/json",
          body: JSON.stringify({ error: "合成保存失败" }),
        })
      : r.continue(),
  );
  await b(p, "确认恢复为新版本").click();
  await p
    .getByRole("alert")
    .filter({ hasText: /恢复未完成|合成保存失败/ })
    .first()
    .waitFor();
  assert.equal((await app.repository.read()).assets[0].versions.length, 3);
  assert.deepEqual(await p.evaluate(() => window.batchSuccessReceipts), [], "失败无成功反馈");
  assert.equal(await p.locator(roots.history).count(),1,"失败仍保留实际资产详情");
  assert.equal(await p.locator(roots.history).locator(".flash").count(), 0, "失败无闪动");
  await geometry(p, "history", "failure");
  await p.unroute("**/api/workspace");
  await p.getByRole('combobox',{name:'查看版本',exact:true}).selectOption('batch-v1');
    await b(p, '恢复此版本').click();
  await b(p, "确认恢复为新版本").click();
  await p.getByRole('combobox',{name:'查看版本',exact:true}).locator('option').filter({hasText:'v4.0 · 当前'}).waitFor({state:'attached'});
  const after = (await app.repository.read()).assets[0];
  assert.equal(after.versions.length, 4);
  assert.deepEqual(after.versions.slice(0, 3), before.versions);
  assert.equal(after.versions.at(-1).restoredFrom, before.versions[0].id);
  await p.waitForFunction(() => window.batchSuccessReceipts.length > 0);
  const receipts = await p.evaluate(() => window.batchSuccessReceipts);
  assert.equal(receipts.length, 1, "成功反馈只出现一次");
  assert.match(receipts[0], /已从 v1.0 恢复为新版本/);
  await p.evaluate(() => window.batchReceiptObserver.disconnect());
  await p.close();
  console.log("PASS 恢复失败不追加，成功追加v4且原版本逐字节保留");
  const invalid = batch1State();
  invalid.reverseRecords[0].reply = "非JSON回复";
  invalid.reverseRecords[1].reply = JSON.stringify({
    report: { summary: "缺段" },
  });
  await app.close();
  app = await fixture();
  await initialize(invalid);
  p = await open(390, "references");
  assert.equal(await p.locator(".reverse-lane").count(),0);
  assert.equal(await p.locator(".rail-list").getByRole("radio").count(),3);
  assert.equal(await p.locator(".rail-list .dot").filter({hasText:"待逆推"}).count(),2,"无效回复不构成配方");
  assert.equal(
    await p.getByText("回复解析未通过 · 待修正", { exact: true }).count(),
    2,
  );
  await p.close();
  console.log("PASS 无效JSON/缺段回复均不冒充可确认报告");
  // 长字段与超长正文完整模式；单行改动精确+1−1，全文无损，复杂超界仍由专项验证未知。
  const state = batch1State(true);
  state.assets[0].versions[0].content = "长正文".repeat(40000);
  state.assets[0].versions[1].content = "超长正文".repeat(40000);
  await app.close();
  app = await fixture();
  await initialize(state);
  for (const width of [320, 390])
    for (const route of Object.keys(roots)) {
      const q = await open(width, route);
      if (route === "references")
        await q
          .getByRole("radio")
          .filter({ hasText: "长标题" })
          .first()
          .click();
      if (route === "history") {
        await q.getByRole('combobox',{name:'查看版本',exact:true}).selectOption('batch-v1');
        await q.getByRole('combobox',{name:'比较到',exact:true}).selectOption('batch-v2');
        const comp=q.locator('.version-comparison');
        assert.deepEqual(await comp.locator('.history-field-change strong').allTextContents(),['描述','标签']);
        const summary=comp.getByText('比较终点全文',{exact:true});
        await summary.click();
        const full=comp.locator('details').filter({hasText:'比较终点全文'}).locator('.history-text');
        const startFull=comp.locator('details').filter({hasText:'比较起点全文'}).locator('.history-text');
        assert.equal(await full.textContent(),state.assets[0].versions[1].content,'比较终点长正文逐字保留');
        assert.equal(await startFull.textContent(),state.assets[0].versions[0].content,'比较起点长正文逐字保留');
        await summary.focus();
        await q.keyboard.press('Tab');
        assert.equal(await full.evaluate(e=>document.activeElement===e),true,'Tab原生进入全文滚动区');
        await full.press('ArrowDown');
        assert.equal(await full.evaluate(e=>e.matches(':focus-visible')),true,'键盘操作显示焦点');
        assert.equal(await full.evaluate(e=>getComputedStyle(e).outlineWidth),'2px');
        await q.waitForFunction(e=>e.scrollTop>0,await full.elementHandle());

      }
      await geometry(q, route, width + " long " + route);
      await axe(q, "long " + route);
      await q.close();
    }
  console.log("PASS 320/390长中英文/长正文精确+1−1与两版原文无损、无越界或裁切；无页面错误");
  assert.deepEqual(errors, []);
} finally {
  await browser.close();
  await app.close();
}
