// 派单168主路径及失败/迟到/开关；全部输入和副作用均为合成fixture。
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { mkdir } from "node:fs/promises";
import { agentsV16Fixture } from "./agents-v16-fixture.mjs";
import { selectAgentTab, openManualRelay } from "./agents-v16-helpers.mjs";
import { axe, settle } from "./ui-v14-checks.mjs";
const { chromium } = createRequire(import.meta.url)(
  process.env.PLAYWRIGHT_MODULE ||
    "/Users/nat/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright",
);
const app = await agentsV16Fixture({ workHandoff: true }),
  browser = await chromium.launch(),
  errors = [],
  requests = [];
const btn = (p, name) => p.getByRole("button", { name, exact: true });
async function open(width) {
  const c = await browser.newContext({
      viewport: { width, height: 1000 },
      timezoneId: "Asia/Shanghai",
      reducedMotion: "reduce",
    }),
    p = await c.newPage();
  p.setDefaultTimeout(10000);
  await p.addInitScript(() => {
    window.copied = [];
    window.copyFail = false;
    Object.defineProperty(navigator, "clipboard", {
      value: {
        writeText: async (s) => {
          if (window.copyFail) throw new Error("合成复制失败");
          window.copied.push(s);
        },
      },
    });
  });
  await c.route("**/*", async (r) => {
    if (new URL(r.request().url()).origin !== new URL(app.url).origin) {
      errors.push("禁止外部请求");
      await r.abort();
      return;
    }
    await r.continue();
  });
  p.on("pageerror", (e) => errors.push(e.message));
  p.on("request", (r) => requests.push(r.url()));
  await p.goto(app.url + "/#agents");
  await btn(p, "上下文接力").waitFor();
  return p;
}
async function geometry(p, label) {
  await settle(p);
  assert.deepEqual(
    await p.evaluate(() => {
      const bad = [];
      if (document.documentElement.scrollWidth > innerWidth)
        bad.push("整页溢出");
      for (const e of document.querySelectorAll("main,main *")) {
        if (
          e.closest("svg,.sr-only") ||
          !e.checkVisibility({ checkOpacity: true })
        )
          continue;
        const r = e.getBoundingClientRect(),
          s = getComputedStyle(e);
        if (!r.width && !r.height) continue;
        if (
          !e.closest(".page-agents.v16 .cast") &&
          (r.left < -0.5 || r.right > innerWidth + 0.5)
        )
          bad.push(e.tagName + "." + e.className + "越界");
        if (
          ["hidden", "clip"].includes(s.overflowX) &&
          e.scrollWidth > e.clientWidth + 1
        )
          bad.push(e.tagName + "." + e.className + "横裁切");
        if (
          ["hidden", "clip"].includes(s.overflowY) &&
          e.scrollHeight > e.clientHeight + 1
        )
          bad.push(e.tagName + "." + e.className + "纵裁切");
      }
      return bad;
    }),
    [],
    label,
  );
  for (const e of await p
    .locator("main")
    .locator("button,a,input,select,textarea")
    .all()) {
    if (!(await e.isVisible())) continue;
    const r = await e.evaluate((e) => e.getBoundingClientRect().toJSON());
    assert(
      r.width >= 44 && r.height >= 44,
      label +
        " 44px " +
        (await e.getAttribute("aria-label")) +
        " " +
        JSON.stringify(r),
    );
  }
}
async function roleFrame(p) {
  return p.locator("#agent-roles .archive").evaluate((card) => {
    const box = (element) => {
      const r = element.getBoundingClientRect();
      return {
        x: r.x + scrollX,
        y: r.y + scrollY,
        width: r.width,
        height: r.height,
      };
    };
    const stage = card.querySelector(".stage");
    const dossier = card.querySelector(".dossier");
    const tabs = card.querySelector(".tabs");
    const panel = card.querySelector('[role="tabpanel"]');
    return {
      card: box(card),
      stage: box(stage),
      dossier: box(dossier),
      tabs: box(tabs),
      panel: box(panel),
      panelOverflow: getComputedStyle(panel).overflowY,
    };
  });
}
function sameFrame(actual, expected, label) {
  for (const part of ["card", "stage", "dossier", "tabs", "panel"])
    for (const field of ["x", "y", "width", "height"])
      assert.ok(
        Math.abs(actual[part][field] - expected[part][field]) <= 1,
        `${label}: ${part}.${field} changed ${expected[part][field]} → ${actual[part][field]}`,
      );
  assert.equal(actual.panelOverflow, "auto", label + " panel scrolls internally");
}
async function stableRoleCard(p, width) {
  const ids = ["claude-code", "codex", "hermes", "openclaw", "doubao"];
  const tabs = ["档案", "内容", "体检", "配置"];
  await selectAgentTab(p, ids[0], tabs[0]);
  const baseline = await roleFrame(p);
  assert.equal(Math.round(baseline.card.height), width <= 640 ? 680 : 560);
  if (width <= 640) {
    assert.ok(baseline.stage.y < baseline.dossier.y, "窄屏同框上下布局");
  } else {
    assert.ok(baseline.stage.x < baseline.dossier.x, "桌面同框左右布局");
  }
  for (const id of ids) {
    for (const tab of tabs) {
      await selectAgentTab(p, id, tab);
      sameFrame(await roleFrame(p), baseline, `${width} ${id} ${tab}`);
      if (tab === "档案" && id === "doubao") {
        assert.equal(await p.locator(".stage .role-status-screen").count(), 1, "其他伙伴也使用状态屏");
        assert.equal(await p.locator(".stage .role-placeholder,.stage .hero").count(), 0, "档案取消重复形象");
      }
      if (tab === "档案" && id === "hermes") {
        assert.equal(await p.locator(".stage .hero").count(), 0, `${width} 档案没有重复立绘`);
        assert.equal(await p.locator(".role-status-grid > div").count(), 3, `${width} Skill、插件、体检三项状态读数`);
        if ([1440,390].includes(width)) await p.locator("#agent-roles .archive").screenshot({path:`test-results/agents-role-card/${width}-亚古兽档案.png`});
      }
      if (tab === "档案" && id === "codex" && [760,390,320].includes(width)) {
        const profile=await p.locator("#agent-roles .dossier").evaluate(d=>{const panel=d.querySelector('[role="tabpanel"]').getBoundingClientRect(),button=d.querySelector('.edit').getBoundingClientRect();return {panelTop:panel.top,panelBottom:panel.bottom,buttonTop:button.top,buttonBottom:button.bottom};});
        assert.ok(profile.buttonTop>=profile.panelTop && profile.buttonBottom<=profile.panelBottom,`${width} 编辑角色卡始终可见`);
        if ([760,390].includes(width)) await p.locator("#agent-roles .archive").screenshot({path:`test-results/agents-role-card/${width}-Codex档案.png`});
      }
      if (tab === "配置" && id === "doubao") {
        assert.equal(await p.locator("#agent-roles .segmented").count(),0,"单伙伴配置不显示全局筛选");
        assert.equal(await p.locator("#agent-roles .empty").count(),0,"单伙伴配置不显示通用空态");
      }
      if (id === "claude-code" && [1440, 390, 320].includes(width)) {
        await p.locator("#agent-roles .archive").screenshot({
          path: `test-results/agents-role-card/${width}-${tab}.png`,
        });
      }
    }
  }
  await selectAgentTab(p, "codex", "内容");
  const card = p.locator(".agent-contents-card").first();
  await card.getByRole("button", { name: "展开清单", exact: true }).click();
  await card.getByRole("button", { name: "收起清单", exact: true }).waitFor();
  await card.getByText("合成Skill127", { exact: true }).waitFor();
  sameFrame(await roleFrame(p), baseline, `${width} 128 Skill 展开`);
  assert.equal(await card.locator('.compact-row').count(),128,`${width} 紧凑 Skill 条目完整`);
  const rowHeight=await card.locator('.compact-row').first().evaluate(e=>e.getBoundingClientRect().height);
  assert.ok(rowHeight<=48,`${width} 紧凑行高度 ${rowHeight}`);
  assert.match(await card.locator('.compact-row').first().innerText(),/失效链接/,`${width} 失效链接置顶`);
  await card.locator('.compact-row summary').first().click();
  assert.equal(await card.locator('.compact-row details').first().getAttribute('open'),'',`${width} 明细可展开`);
  assert.match(await card.locator('.compact-row-details').first().textContent(),/未比对内容|资产仓库未收录/,`${width} 保留原匹配信息`);
  await card.locator('.compact-row summary').first().click();
  const groups=card.getByRole('group',{name:'内容分组'});
  for(const name of ['配置','插件','MCP']){
    await groups.getByRole('button',{name:new RegExp(`^${name}`)}).click();
    assert.equal(await groups.getByRole('button',{name:new RegExp(`^${name}`)}).getAttribute('aria-pressed'),'true');
  }
  assert.match(await card.locator('section[aria-label="Codex · MCP"]').textContent(),/未读取/,`${width} MCP 状态直达`);
  await groups.getByRole('button',{name:/^Skill/}).click();
  assert.equal((await p.getByRole('tab',{name:/^体检/}).innerText()).trim(),'体检',`${width} 内容检查不进入体检计数`);
  const panel = p.locator('#agent-roles .archive [role="tabpanel"]');
  if([1440,390].includes(width)) await panel.screenshot({path:`test-results/agents-role-card/${width}-128Skill顶部.png`});
  await panel.evaluate(e=>{e.scrollTop=e.scrollHeight/2;});
  const sticky=await panel.evaluate(panel=>{const toolbar=panel.querySelector('.role-contents-toolbar');return {panelTop:panel.getBoundingClientRect().top,toolbarTop:toolbar.getBoundingClientRect().top,scrollTop:panel.scrollTop,scrollHeight:panel.scrollHeight,cardTop:toolbar.parentElement.getBoundingClientRect().top};});
  assert.ok(Math.abs(sticky.toolbarTop-sticky.panelTop)<2,`${width} 分组标题/操作吸顶 ${JSON.stringify(sticky)}`);
  if([1440,390].includes(width)) await panel.screenshot({path:`test-results/agents-role-card/${width}-128Skill中段.png`});
  const scroll = await p.locator('#agent-roles .archive [role="tabpanel"]').evaluate((panel) => {
    const before = panel.scrollTop;
    panel.scrollTop = panel.scrollHeight;
    return {
      before,
      after: panel.scrollTop,
      remaining: panel.scrollHeight - panel.clientHeight - panel.scrollTop,
      overflow: panel.scrollHeight - panel.clientHeight,
    };
  });
  assert.ok(scroll.overflow > 100, `${width} 长清单应在右侧滚动`);
  assert.ok(scroll.after > scroll.before, `${width} 长清单可往下读`);
  assert.ok(scroll.remaining <= 1, `${width} 可滚到清单末尾`);
  await p.waitForFunction(()=>!document.querySelector('#agent-roles .dossier')?.classList.contains('has-more'));
  await p.locator('#agent-roles .archive').evaluate(e=>e.scrollIntoView({block:'center'}));
  await p.waitForTimeout(100);
  const endSticky=await panel.evaluate(e=>({panelTop:e.getBoundingClientRect().top,toolbarTop:e.querySelector('.role-contents-toolbar').getBoundingClientRect().top}));
  assert.ok(Math.abs(endSticky.toolbarTop-endSticky.panelTop)<2,`${width} 清单末尾操作仍吸顶 ${JSON.stringify(endSticky)}`);
  if([1440,390].includes(width)) await panel.screenshot({path:`test-results/agents-role-card/${width}-128Skill末尾.png`});
  await panel.evaluate((e) => { e.scrollTop = 0; });
  await panel.focus();
  await p.keyboard.press("End");
  await p.waitForFunction(() => document.querySelector('#agent-roles .archive [role="tabpanel"]')?.scrollTop > 0, null, { timeout: 1500 });
  await selectAgentTab(p, "codex", "档案");
  assert.equal(await p.locator('#agent-roles .archive [role="tabpanel"]').evaluate((e) => e.scrollTop), 0, `${width} 换标签回到顶部`);
  sameFrame(await roleFrame(p), baseline, `${width} 长清单返回档案`);
  await geometry(p, "角色卡 " + width);
  await axe(p, "角色卡 " + width);
}
try {
  await mkdir("test-results/agents-role-card", { recursive: true });
  for (const width of [1440, 1100, 760, 390, 320]) {
    const offset = {
        ...app.relayCalls,
        openLength: app.relayCalls.open.length,
      },
      p = await open(width);
    assert.equal(app.relayCalls.list, offset.list, "进入页面不读取会话");
    assert.equal(app.relayCalls.prepare, offset.prepare);
    assert.equal(
      await p.getByRole("button", { name: /Codex/ }).count(),
      0,
      "档案默认态无重名按钮",
    );
    await selectAgentTab(p, "codex", "配置");
    assert.equal(await p.getByRole("button", { name: /管理受控内容与配置/ }).count(), 1, "配置页管理入口唯一");
    await selectAgentTab(p, "codex");
    await stableRoleCard(p, width);
    offset.contents = app.relayCalls.contents;
    await selectAgentTab(p, "codex");
    await geometry(p, "初始 " + width);
    await axe(p, "初始 " + width);
    await btn(p, "上下文接力").click();
    await p.locator(".relay-title").getByText("UI v16", { exact: false }).waitFor();
    assert.equal(app.relayCalls.list, offset.list + 1);
    assert.equal(app.relayCalls.prepare, offset.prepare, "列表读取返回摘要，尚未生成接手材料");
    await p.getByText("来源 AI", { exact: true }).first().waitFor();
    await p.getByText("最近更新", { exact: true }).first().waitFor();
    const roster = p.getByRole("radiogroup", { name: "接力目标" }),
      codex = roster.locator("[data-agent=codex]");
    await codex.focus();
    await p.keyboard.press("ArrowRight");
    assert.equal(
      await roster.locator("[data-agent=hermes]").getAttribute("aria-checked"),
      "true",
    );
    assert.match(await btn(p, "带到 亚古兽 继续").innerText(), /亚古兽/);
    await p.keyboard.press("Home");
    assert.equal(
      await roster
        .locator("[data-agent=claude-code]")
        .getAttribute("aria-checked"),
      "true",
    );
    await p.keyboard.press("ArrowRight");
    const heights = await p
      .locator(".rc-stage .sprite")
      .evaluateAll((es) => es.map((e) => e.getBoundingClientRect().height));
    assert.deepEqual(heights, [148, 148, 96, 96]);
    await p.locator(".prompt-toggle").click();
    await p.locator("textarea.prompt").waitFor();
    assert.equal(app.relayCalls.prepare, offset.prepare + 1, "预览才生成接手材料");
    assert.deepEqual(
      await p.evaluate(() => copied),
      [],
      "未预览只展开，不复制",
    );
    assert.equal(app.relayCalls.open.length, offset.openLength);
    const preview = await p.locator("textarea.prompt").inputValue();
    assert.equal(preview, app.prompt);
    await (
      width <= 760
        ? p.locator(".mobile-copy")
        : p
            .locator(".launch-actions")
            .getByRole("button", { name: "只复制提示词", exact: true })
    ).click();
    await p.waitForFunction(() => window.copied.length === 1);
    assert.deepEqual(await p.evaluate(() => copied), [preview]);
    assert.equal(app.relayCalls.open.length, offset.openLength, "只复制不打开");
    await btn(p, "带到 机械邪龙兽 继续").click();
    await p
      .getByText("应用已打开，待粘贴发送", { exact: true })
      .waitFor();
    assert.deepEqual(await p.evaluate(() => copied), [preview, preview]);
    assert.equal(app.relayCalls.open.at(-1), "codex");
    await p.evaluate(() => (window.copyFail = true));
    const opened = app.relayCalls.open.length;
    await btn(p, "带到 机械邪龙兽 继续").click();
    await p
      .getByRole("alert")
      .getByText(/复制失败/)
      .waitFor();
    assert.equal(app.relayCalls.open.length, opened, "复制失败不打开");
    await p.evaluate(() => (window.copyFail = false));
    await selectAgentTab(p, "hermes");
    await btn(p, "带到 亚古兽 继续").click();
    await p
      .locator(".relay-receipt")
      .getByText("没找到 hermes 的应用，提示词已复制", { exact: true })
      .waitFor();
    assert.equal(
      (await p.evaluate(() => copied)).at(-1),
      preview,
      "换目标不改复制正文",
    );
    const tabs = p.getByRole("tablist", { name: "档案" });
    await tabs.getByRole("tab", { name: "档案", exact: true }).focus();
    await p.keyboard.press("ArrowRight");
    assert.equal(
      await tabs
        .getByRole("tab", { name: /^内容/ })
        .getAttribute("aria-selected"),
      "true",
    );
    assert.equal(app.relayCalls.contents, offset.contents, "切内容不自动读");
    await p.keyboard.press("End");
    assert.equal(
      await tabs
        .getByRole("tab", { name: "配置", exact: true })
        .getAttribute("aria-selected"),
      "true",
    );
    await p.keyboard.press("Home");
    await geometry(p, "预览 " + width);
    await axe(p, "预览 " + width);
    await p.emulateMedia({ reducedMotion: "no-preference" });
    await p.waitForFunction(() =>
      document.getAnimations().some((a) => a.playState === "running"),
    );
    await p.emulateMedia({ reducedMotion: "reduce" });
    await p.waitForFunction(() =>
      document.getAnimations().every((a) => a.playState !== "running"),
    );
    await geometry(p, "动态开关 " + width);
    await btn(p, "这页怎么用").click();
    await p
      .getByRole("dialog")
      .getByText("仅本机内存使用", { exact: false })
      .waitFor();
    assert.match(await p.getByRole("dialog").innerText(), /点击页首「上下文接力」后，读取/);
    await axe(p, "帮助 " + width);
    await p.keyboard.press("Escape");
    await btn(p, "搜索 / 换一段 15").click();
    await p.getByRole("dialog", { name: "换一段会话" }).waitFor();
    await p
      .getByRole("dialog")
      .locator(".relay-choice")
      .filter({ hasText: "Claude Code" })
      .first()
      .click();
    assert.equal(app.relayCalls.prepare, offset.prepare + 1, "切换会话不自动生成接手材料");
    await p.locator(".prompt-toggle").click();
    await p.locator(".relay-quote").waitFor();
    assert.equal(app.relayCalls.prepare, offset.prepare + 2);
    app.model.empty = true;
    await btn(p, "找更早的").click();
    await p.getByRole("heading", { name: "没找到最近 7 天的会话" }).waitFor();
    assert.equal(await p.locator(".launch").count(), 0);
    await geometry(p, "空 " + width);
    await axe(p, "空 " + width);
    await btn(p, "手动写一段").click();
    const manual = p.getByRole("dialog", {
      name: "准备上下文接力",
      exact: true,
    });
    await manual.waitFor();
    await manual.getByLabel("当前目标", { exact: true }).fill("合成目标");
    await manual
      .getByLabel("已确认事实与成果指针", { exact: true })
      .fill("password=合成秘密");
    await manual.getByLabel("唯一下一步", { exact: true }).fill("合成下一步");
    const handPreview = await manual.locator("pre").textContent();
    assert(!handPreview.includes("合成秘密"));
    assert(handPreview.includes("[已隐去]"));
    await manual
      .getByRole("button", { name: "复制接力包", exact: true })
      .click();
    assert.equal(
      (await p.evaluate(() => copied)).at(-1),
      handPreview,
      "手填全文也先过滤并逐字复制",
    );
    assert.equal(
      await manual.locator("pre").textContent(),
      handPreview,
      "复制后通知重渲染不改变全文",
    );
    await p.keyboard.press("Escape");
    app.model.empty = false;
    const cleared = p.waitForResponse((r) =>
      r.url().endsWith("/api/relay-sessions/clear"),
    );
    await p.evaluate(() => (location.hash = "#home"));
    await p.locator("main.page-home").waitFor();
    await cleared;
    assert(app.relayCalls.clear > offset.clear, "离页clear已回读");
    await p.context().close();
  }
  for (const width of [1100, 760]) {
    const p = await open(width);
    await stableRoleCard(p, width);
    await p.context().close();
  }
  const p = await open(390);
  const count = app.relayCalls.list,
    prep = app.relayCalls.prepare;
  assert.equal(await p.locator(".relay").count(), 0, "未点击时接力区不显示");
  assert.equal(app.relayCalls.list, count, "进入页面不读取列表");
  await p.evaluate(() => (location.hash = "#home"));
  await p.locator("main.page-home").waitFor();
  assert.equal(app.relayCalls.list, count, "其他页面不读");
  await p.evaluate(() => (location.hash = "#agents"));
  await btn(p, "上下文接力").waitFor();
  assert.equal(app.relayCalls.list, count, "返回页面不自动读取");
  await btn(p, "上下文接力").click();
  await p
    .locator(".relay-title")
    .getByText("UI v16", { exact: false })
    .waitFor();
  assert.equal(app.relayCalls.list, count + 1, "点击后读取列表");
  assert.equal(app.relayCalls.prepare, prep, "列表阶段不生成接手材料");
  await p.locator(".prompt-toggle").click();
  await p.locator("textarea.prompt").waitFor();
  assert.equal(app.relayCalls.prepare, prep + 1, "预览时重新核验并生成接手材料");
  assert.equal(await p.locator("textarea.prompt").inputValue(), app.prompt);
  await p.context().close();
  const q = await open(1440);
  app.model.fail = true;
  await btn(q, "上下文接力").click();
  await q.getByRole("alert").getByText("合成目录不可读").waitFor();
  assert.equal(await btn(q, "重新查找会话").isEnabled(), true);
  app.model.fail = false;
  let release;
  app.model.delayList = new Promise((r) => (release = r));
  const before = app.relayCalls.list;
  const late = q.waitForResponse((r) =>
    r.url().endsWith("/api/relay-sessions/list"),
  );
  await btn(q, "重新查找会话").click();
  await btn(q, "读取中…").waitFor();
  await btn(q, "读取中…").evaluate((e) => e.click());
  assert.equal(app.relayCalls.list, before + 1, "busy禁止并发");
  await q.evaluate(() => (location.hash = "#home"));
  await q.locator("main.page-home").waitFor();
  release();
  await (await late).finished();
  await q.evaluate(
    () =>
      new Promise((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(resolve)),
      ),
  );
  app.model.delayList = null;
  await q.locator("main.page-home").waitFor();
  assert.equal(await q.locator("textarea.prompt").count(), 0, "离页迟到不显示正文");
  app.model.empty = true;
  app.model.partial = true;
  await q.evaluate(() => (location.hash = "#agents"));
  await btn(q, "上下文接力").waitFor();
  await btn(q, "上下文接力").click();
  await q.getByRole("heading", { name: "暂未找到可读取的最近会话" }).waitFor();
  assert.equal(
    await q
      .getByRole("heading", { name: "没找到最近 7 天的会话", exact: true })
      .count(),
    0,
    "未支持范围不报完整空",
  );
  await btn(q, "这页怎么用").click();
  assert.match(
    await q.getByRole("dialog").innerText(),
    /Hermes · 暂不支持读取/,
  );
  await q.keyboard.press("Escape");
  app.model.empty = false;
  app.model.partial = false;
  const readsBeforeRestore = app.relayCalls.list,
    cleared = q.waitForResponse((r) =>
      r.url().endsWith("/api/relay-sessions/clear"),
    );
  await q.evaluate(() =>
    dispatchEvent(new PageTransitionEvent("pagehide", { persisted: true })),
  );
  await cleared;
  await q.evaluate(() =>
    dispatchEvent(new PageTransitionEvent("pageshow", { persisted: true })),
  );
  await btn(q, "上下文接力").waitFor();
  assert.equal(app.relayCalls.list, readsBeforeRestore, "BFCache返回默认零读");
  await btn(q, "上下文接力").click();
  await q.locator(".relay-title").getByText("UI v16", { exact: false }).waitFor();
  assert.equal(
    app.relayCalls.list,
    readsBeforeRestore + 1,
    "恢复后可读取且解除忙碌",
  );
  assert.equal(await q.locator(".prompt-toggle").isEnabled(), true);
  await q.context().close();
  app.model.empty = false;
  app.model.partial = false;
  const healthPage=await open(1440);
  await selectAgentTab(healthPage,"codex","内容");
  await healthPage.locator('.agent-contents-card').getByRole('button',{name:'展开清单'}).click();
  await healthPage.locator('.agent-contents-card').getByRole('button',{name:'收起清单'}).waitFor();
  assert.equal((await healthPage.getByRole('tab',{name:/^体检/}).innerText()).trim(),'体检','只有内容检查结果不显示体检数字');
  app.model.healthBrokenLinks=7;
  await selectAgentTab(healthPage,"codex","体检");
  const healthResponse=healthPage.waitForResponse(r=>r.url().endsWith('/api/agent-health/inspect'));
  await healthPage.getByRole('button',{name:'检查全部支持体检的已登记 Agent'}).click();
  const inspected=await (await healthResponse).json();
  assert.equal(inspected.items.find(x=>x.agentId==='codex')?.health?.brokenLinks,7,'合成能力体检回执使用新读数');
  await healthPage.getByRole('tab',{name:/^体检\s*7$/}).waitFor();
  assert.equal((await healthPage.getByRole('tab',{name:/^内容/}).innerText()).replace(/\s/g,''),'内容128','体检回执不覆盖内容读数');
  await healthPage.context().close();
  assert.deepEqual(errors, []);
  assert(
    requests.every((u) => new URL(u).origin === new URL(app.url).origin),
    "零外部请求",
  );
  console.log(
    "PASS 智能体群：320/390/760/1100/1440 的五伙伴×四标签固定角色卡、128 Skill 内滚到底、44px/axe；接力手动读取、预览、复制、失败与迟到原行为保留。",
  );
} finally {
  await browser.close();
  await app.close();
}
