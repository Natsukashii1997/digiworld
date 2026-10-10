import {calendarGeometry as geometry,clickCalendarEvent} from "./calendar-v16-helpers.mjs";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { fixture } from "./fixture.mjs";
import { batch3Data, batch3Stub, batch3Routes } from "./ui-v14-batch3-fixture.mjs";
import {  axe, motion } from "./ui-v14-checks.mjs";
const { chromium } = createRequire(import.meta.url)(
  process.env.PLAYWRIGHT_MODULE ||
    "/Users/nat/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright",
);
const browser = await chromium.launch(),
  errors = [],
  calls = [];
let app, stub;
const roots = { calendar: ".calendar-v14", settings: ".settings-v16", night: '[data-testid="night-v2"]' };
const button = (p, name) => p.getByRole("button", { name, exact: true });
async function setup(long = false, options = {}) {
  await app?.close();
  const data = batch3Data(long);
  if(options.extraEvents) data.events.push(...options.extraEvents);
  stub = batch3Stub(data, options);
  app = await fixture({ discovery: { calendarHelper: { platform: "darwin", run: stub.run } } });
  await app.repository.write(data.state, { initialize: true });
  return data;
}
async function open(width, route) {
  const c = await browser.newContext({
    viewport: { width, height: 1000 },
    timezoneId: "Asia/Shanghai",
    reducedMotion: "reduce",
  });
  const p = await c.newPage();
  p.setDefaultTimeout(10000);
  p.on("pageerror", (e) => errors.push(String(e)));
  p.on("request", (r) => calls.push(r.url()));
  await batch3Routes(p);
  await p.goto(app.url + "/#" + route);
  await p.locator(roots[route]).waitFor();
  if (route === "calendar") await p.locator(".cal-grid").waitFor();
  if (route === "night") await p.locator('[data-testid="night-loading"]').waitFor({ state: "hidden" });
  return p;
}
async function focusCycle(p) {
  const dialog = p.getByRole("dialog"),
    controls = dialog.locator('button:not(:disabled),a[href],input:not(:disabled),textarea:not(:disabled),select:not(:disabled),[tabindex="0"]');
  await controls.last().focus();
  await p.keyboard.press("Tab");
  assert.equal(await controls.first().evaluate((e) => e === document.activeElement), true, "Tab回环");
  await controls.first().focus();
  await p.keyboard.press("Shift+Tab");
  assert.equal(await controls.last().evaluate((e) => e === document.activeElement), true, "Shift+Tab回环");
}
async function returnedFocus(entry) {
  assert.equal(await entry.evaluate((e) => e === document.activeElement), true, "关闭后回到触发入口");
}
async function axisChecks(p, data, width, long) {
  const scroller=p.locator('.cal-scroll');
  const firstLabel=await scroller.evaluate(e=>{
    const r=e.querySelectorAll('.cal-hours span')[8].getBoundingClientRect(),box=e.getBoundingClientRect();
    return {top:r.top,bottom:r.bottom,min:box.top+e.clientTop,max:box.bottom-e.clientTop};
  });
  assert(firstLabel.top>=firstLabel.min && firstLabel.bottom<=firstLabel.max,"初始08:00整点标签完整露出");
  const hour=p.locator('.cal-day[data-date="2026-10-04"] .cal-event-marker[data-event-id="b3-day-6"]');
  await p.waitForFunction(({long})=>{
    const e=document.querySelector('.cal-day[data-date="2026-10-04"] .cal-event-marker[data-event-id="b3-day-6"] .cal-event-title');
    return e && (long ? e.hidden : !e.hidden);
  },{long});
  if(!long) {
    const title=await hour.evaluate(e=>{
      const t=e.querySelector('.cal-event-title'),r=t.getBoundingClientRect(),b=e.getBoundingClientRect();
      return {text:t.textContent,hidden:t.hidden,scrollHeight:t.scrollHeight,clientHeight:t.clientHeight,scrollWidth:t.scrollWidth,clientWidth:t.clientWidth,left:r.left,right:r.right,top:r.top,bottom:r.bottom,min:b.left,max:b.right,start:b.top,end:b.bottom};
    });
    assert(title.scrollHeight<=title.clientHeight+1 && title.scrollWidth<=title.clientWidth+1,"块内完整标题scroll尺寸无溢出");
    assert.equal(title.text,data.events.find(e=>e.id==='b3-day-6').title,"一小时块显示完整标题");
    if(width===1440 && await p.evaluate(()=>CSS.supports('text-wrap','balance'))) {
      const lines=await hour.locator('.cal-event-title').evaluate(e=>{
        const node=e.firstChild,rows=new Map();
        for(let i=0;i<node.textContent.length;i++) {
          if(!node.textContent[i].trim()) continue;
          const range=document.createRange();range.setStart(node,i);range.setEnd(node,i+1);
          const y=range.getBoundingClientRect().top;rows.set(y,(rows.get(y)||'')+node.textContent[i]);
        }
        return {wrap:getComputedStyle(e).textWrap,rows:[...rows.values()]};
      });
      assert.equal(lines.wrap,'balance','时间轴标题平衡换行');
      assert(lines.rows.at(-1).length>1,'一小时标题末行无孤字');
      // 原清单已取消；全文在详情/编辑验证。
    }
    assert(!title.hidden && title.left>=title.min && title.right<=title.max && title.top>=title.start && title.bottom<=title.end,"全文在真实色块内，无省略/裁切/溢出");
  }
  const short=p.locator('.cal-day[data-date="2026-10-04"] .cal-event-marker[data-event-id="b3-overlap-3"]');
  assert.equal(await short.locator('.cal-event-title').isVisible(),false,"15分钟块无截断文字");
  const duration=await short.evaluate(e=>e.getBoundingClientRect().height/e.closest('.cal-lane').getBoundingClientRect().height);
  assert(Math.abs(duration-15/1440)<.0001,"15分钟视觉仍为真实时长比例");
  // 使用真实鼠标中心点击，各重叠列均可选择；取消编辑不写入。
  for(const id of ['b3-day-6','b3-overlap-0','b3-overlap-1','b3-overlap-2','b3-overlap-3','b3-cross']) {
    const event=data.events.find(e=>e.id===id), visual=p.locator(`.cal-day[data-date="2026-10-04"] .cal-event-marker[data-event-id="${id}"]`);
    await visual.scrollIntoViewIfNeeded();
    const box=await visual.boundingBox();
    await p.mouse.click(box.x+box.width/2,box.y+box.height/2);
    if(event.workbench) {
      const dialog=p.getByRole('dialog',{name:'修改规划块',exact:true});await dialog.waitFor();
      assert.equal(await dialog.getByLabel('一句话').inputValue(),event.title,'点击正确规划块');
      await p.keyboard.press('Escape');await dialog.waitFor({state:'detached'});
      assert.equal(await p.evaluate(()=>document.activeElement?.classList.contains('cal-marker-hit')),true,'Esc回到轴上点击入口');
    } else {
      const detail=p.getByRole('dialog',{name:'日程详情'});await detail.waitFor();
      assert.equal(await detail.locator('h2').innerText(),event.title,'只读详情显示完整标题');
      assert.match(await detail.innerText(),new RegExp(event.calendar));
      assert.equal(await detail.locator('input,textarea').count(),0);await p.keyboard.press('Escape');await detail.waitFor({state:'detached'});
      assert.equal(await p.evaluate(()=>document.activeElement?.classList.contains('cal-marker-hit')),true,'只读详情Esc回焦时间轴');
    }
  }
  if(!long) {
    // 在15分钟块透明的44px余量里拖动，仍走原15分钟吸附创建，不触发编辑。
    await short.scrollIntoViewIfNeeded();
    const transparentPoint=()=>short.evaluate(e=>{
      const lane=e.closest('.cal-lane'),b=e.getBoundingClientRect();
      const hit=[...lane.querySelectorAll('.cal-marker-hit')].find(x=>{const r=x.getBoundingClientRect();return b.top>=r.top && b.bottom<=r.bottom});
      const r=hit.getBoundingClientRect(),l=lane.getBoundingClientRect();
      return {x:l.left+8,y:r.bottom-2,to:r.bottom+28,start:Math.round(((r.bottom-2-l.top)/l.height)*1440/15)*15,end:Math.round(((r.bottom+28-l.top)/l.height)*1440/15)*15};
    });
    let point=await transparentPoint();
    await p.mouse.click(point.x,point.y);
    const nearest=p.getByRole('dialog',{name:'日程详情'});await nearest.waitFor();
    assert.equal(await nearest.locator('h2').innerText(),data.events.find(e=>e.id==='b3-overlap-0').title,'透明余量未移动选最近只读块');
    assert.equal(await p.getByRole('dialog',{name:'新建规划块',exact:true}).count(),0,'未移动不创建');await p.keyboard.press('Escape');
    await short.scrollIntoViewIfNeeded();point=await transparentPoint();
    await p.mouse.move(point.x,point.y);await p.mouse.down();await p.mouse.move(point.x,point.to,{steps:5});await p.mouse.up();
    const dialog=p.getByRole('dialog',{name:'新建规划块',exact:true});await dialog.waitFor();
    const hm=m=>String(Math.floor(m/60)).padStart(2,'0')+':'+String(m%60).padStart(2,'0');
    assert.equal(await dialog.getByLabel('开始',{exact:true}).inputValue(),hm(point.start),'透明余量拖动保留原起点吸附');
    assert.equal(await dialog.getByLabel('结束',{exact:true}).inputValue(),hm(point.end),'透明余量拖动保留原终点吸附');
    await p.keyboard.press('Escape');await dialog.waitFor({state:'detached'});
  }
  assert.equal(stub.writes().length,0,'轴点击、定位和取消拖建无写入');
  await geometry(p,roots.calendar,width+'轴真实点击后');await axe(p,'轴真实点击后');
}
try {
  for (const long of [false, true]) {
    const data = await setup(long);
    for (const width of [320, 390, 1440])
      for (const route of Object.keys(roots)) {
        const p = await open(width, route);
        await geometry(p, roots[route], width + route + " long=" + long);
        await axe(p, route);
        if (route === "calendar") {
          assert.equal(stub.writes().length, 0, "加载无写入");
          if (width < 900) {
            for(let i=0;i<6;i++)await button(p,'前一天').click();
            for(let i=0;i<7;i++) {
              assert.equal(await p.locator('.cal-day').count(),1);
              assert.equal(await p.locator('.cal-current-line').count(),i===6?1:0,'仅今天有当前线');
              assert(await p.locator(`.cal-event-marker[data-event-id="b3-day-${i}"]`).count(),'七天事件可达');
              await geometry(p,roots[route],'七天可达');if(i<6)await button(p,'后一天').click();
            }
          }
          await axisChecks(p,data,width,long);
          assert.match(await p.locator(".cal-current-line").getAttribute("style"), /top: 41\.6667%/, "固定本机10:00映射24小时轴");
          assert(await p.locator('.cal-allday-chip[data-event-id="b3-allday"]').count(),'全天入口保留');
          for(const e of data.events.filter(e=>e.id.startsWith('b3-overlap'))) {
            await clickCalendarEvent(p,e.id);const d=p.getByRole('dialog');await d.waitFor();
            assert.equal(e.workbench?await d.getByLabel('一句话').inputValue():await d.locator('h2').innerText(),e.title,'重叠事件全文可达');
            await p.keyboard.press('Escape');await d.waitFor({state:'detached'});
          }
          const marker = p.locator('.cal-event-marker[data-event-id="b3-overlap-3"]');
          assert.match(await marker.getAttribute("style"), /height: 1\.04167%/);
          assert.equal(await marker.getAttribute("aria-hidden"), "true");
          assert.equal(await marker.locator("button").count(), 0);
          await clickCalendarEvent(p,"b3-day-6");
          await p.getByRole("dialog", { name: "修改规划块" }).waitFor();
          const fullTitle = await p.getByLabel("一句话").inputValue();
          assert.equal(
            await p.getByLabel("一句话").evaluate((e) => e.scrollHeight <= e.clientHeight + 1),
            true,
            "标题全文自动伸展",
          );
          assert.equal(
            fullTitle,
            data.events.find(e=>e.id==="b3-day-6").title,
          );
          assert.equal(stub.writes().length, 0, "编辑确认前无写入");
          await geometry(p, ".modal", "日历修改");
          await axe(p, route);
          await focusCycle(p);
          await button(p.getByRole("dialog"), "取消").click();
          assert.equal(await p.evaluate(()=>document.activeElement?.classList.contains("cal-marker-hit")),true,"关闭后回到轴入口");
          await p.getByRole("region", { name: "24小时时间轴" }).focus();
          await p.keyboard.press("ArrowDown");
          assert.equal(
            await p
              .getByRole("region", { name: "24小时时间轴" })
              .evaluate((e) => e === document.activeElement),
            true,
          );
        }
        if (route === "settings") {
          for (const [category, entry] of [
            ["资讯", "配置网络访问"],
            ["学习书架", "配置学习书架"],
            ["授权与安全", "配置模型连接"],
          ]) {
            await p
              .getByRole("radiogroup", { name: "设置分类" })
              .getByRole("radio", { name: category, exact: true })
              .click();
            await geometry(p, roots[route], category);
            await button(p, entry).click();
            assert.equal(await p.getByRole("dialog").count(), 1);
            if (entry === "配置网络访问")
              await button(p, "允许访问 aihot.news 公开接口").waitFor();
            await geometry(p, ".drawer", entry);
            await axe(p, entry);
            await focusCycle(p);
            await p.keyboard.press("Escape");
            assert.equal(await p.getByRole("dialog").count(), 0);
            assert.equal(
              await button(p, entry).evaluate((e) => document.activeElement === e),
              true,
              "抽屉关闭焦点回归",
            );
          }
        }
        if (route === "night") {
          assert.equal(await p.locator('[data-testid="night-library"] [data-chip-id]').count(), 7);
          assert.equal(await p.locator('[data-testid^="night-slot-"]').count(), 4);
          assert.equal(await p.locator('.night-v1-legacy, .night-v14, .nv-legacy').count(), 0);
          assert.equal(await button(p, "编辑夜巡草稿").count(), 0);
        }
        if (!long && width === 390) await motion(p, roots[route],geometry);
        await p.context().close();
      }
  }
  // 实际运行中改变宽度，完整标题按新尺寸重测，不能沿用首次判断。
  await setup(false,{extraEvents:[{id:'resize-title',calendar:'工作台',workbench:true,
    title:'完整标题随宽度重测EnglishWithoutSpaces'.repeat(2),start:'2026-10-04T16:00:00+08:00',end:'2026-10-04T17:00:00+08:00',allDay:false,modified:'2026-10-04T08:00:00+08:00'}]});
  const resizing=await open(1440,'calendar');
  for(const width of [1440,390,1440]) {
    await resizing.setViewportSize({width,height:1000});
    await resizing.waitForFunction(hidden=>document.querySelector('.cal-event-marker[data-event-id="resize-title"] .cal-event-title')?.hidden===hidden,width===1440);
    if(width===390) assert.equal(await resizing.locator('.cal-event-marker[data-event-id="resize-title"] .cal-event-title').innerText(),'完整标题随宽度重测EnglishWithoutSpaces'.repeat(2));
    await geometry(resizing,roots.calendar,'运行中标题重测'+width);
  }
  assert.equal(stub.writes().length,0,'宽度变化无写入');
  await resizing.context().close();
  // 新标题呈现仍保持原单行输入的回车提交和原写入 payload。
  await setup();
  let q = await open(390, "calendar");
  await button(q, "新建规划块").click();
  const block = q.getByRole("dialog");
  for (const close of ["取消", "关闭", "Escape"]) {
    if (close === "Escape") await q.keyboard.press(close);
    else await button(block, close).click();
    await block.waitFor({ state: "detached" });
    await returnedFocus(button(q, "新建规划块"));
    await button(q, "新建规划块").click();
  }
  await block.getByLabel("一句话").fill("完整合成标题");
  const expectedDate = await block.getByLabel("日期").inputValue(),
    expectedStart = await block.getByLabel("开始").inputValue(),
    expectedEnd = await block.getByLabel("结束").inputValue();
  const titleInput = block.getByLabel("一句话");
  await titleInput.evaluate((e) => {
    window.calendarSubmits = 0;
    e.form.addEventListener("submit", () => window.calendarSubmits++);
  });
  for (const options of [{ isComposing: true }, { isComposing: false, keyCode: 229 }]) {
    await titleInput.dispatchEvent("keydown", { key: "Enter", bubbles: true, ...options });
    assert.equal(await q.evaluate(() => window.calendarSubmits), 0, "输入法确认Enter无submit事件");
    assert.equal(stub.writes().length, 0, "输入法确认Enter不提交");
    assert.equal(await block.count(), 1);
  }
  let release, received, postCount = 0;
  const gate = new Promise((resolve) => { release = resolve; });
  const firstRequest = new Promise((resolve) => { received = resolve; });
  await q.route("**/api/calendar/blocks/create", async (r) => {
    postCount++;
    received();
    const response = await r.fetch();
    await gate;
    await r.fulfill({ response });
  });
  try {
    await titleInput.press("Enter");
    assert.equal(await q.evaluate(() => window.calendarSubmits), 1, "普通Enter仅一次submit");
    await q.waitForFunction(() => [...document.querySelectorAll('[role="dialog"] button')].some(e => e.type === "submit" && e.disabled));
    await firstRequest;
    await titleInput.press("Enter");
    assert.equal(await q.evaluate(() => window.calendarSubmits), 1, "忙碌Enter无重复submit事件");
    assert.equal(postCount, 1, "忙碌期间Enter仅一次请求");
  } finally {
    release();
  }
  await block.waitFor({ state: "detached" });
  assert.equal(stub.writes().length, 1);
  assert.deepEqual(stub.writes()[0].input, {
    title: "完整合成标题",
    start: new Date(expectedDate + "T" + expectedStart + ":00+08:00").toISOString(),
    end: new Date(expectedDate + "T" + expectedEnd + ":00+08:00").toISOString(),
    notes: "",
  });
  await q.context().close();
  await setup();
  q = await open(390, "settings");
  await q
    .getByRole("radiogroup", { name: "设置分类" })
    .getByRole("radio", { name: "资讯", exact: true })
    .click();
  await button(q, "配置网络访问").click();
  const toggle = button(q, "允许访问 aihot.news 公开接口"),
    beforePosts = calls.filter((url) => url.endsWith("/api/aihot/settings")).length;
  assert.equal(await toggle.getAttribute("aria-pressed"), "true");
  await toggle.click();
  assert.equal(await toggle.getAttribute("aria-pressed"), "false");
  assert.equal(
    calls.filter((url) => url.endsWith("/api/aihot/settings")).length,
    beforePosts,
    "切开关仅改草稿",
  );
  await button(q, "保存 AI HOT 设置").click();
  await q.locator(".toast.tone-success").waitFor();
  assert.equal(calls.filter((url) => url.endsWith("/api/aihot/settings")).length, beforePosts + 1);
  await button(q, "关闭提示").click();
  for (const key of ["Tab", "Shift+Tab"]) {
    await q.locator("body").evaluate((e) => { e.tabIndex = -1; e.focus(); });
    await q.keyboard.press(key);
    assert.equal(await q.getByRole("dialog").evaluate(e => e.contains(document.activeElement)), true, "提示外焦点重新进入抽屉");
  }
  await q.route("**/api/aihot", (r) => r.fulfill({ status: 503, json: { error: "合成刷新失败" } }));
  await q.keyboard.press("Escape");
  await q.getByText(/读取配置失败：合成刷新失败/).waitFor();
  assert.equal(await q.getByText(/当前允许访问/).count(), 0, "旧配置不冒充当前状态");
  assert.equal(calls.filter((url) => url.endsWith("/api/aihot/settings")).length, beforePosts + 1, "刷新失败不写入");
  await geometry(q, roots.settings, "缓存后刷新失败");
  await axe(q, "缓存后刷新失败");
  await q.unroute("**/api/aihot");
  await button(q, "配置网络访问").click();
  await q.getByRole("button", {name: "允许访问 aihot.news 公开接口", exact: true}).waitFor();
  assert.equal(await toggle.getAttribute("aria-pressed"), "false", "保存关闭持久存在");
  await q.keyboard.press("Escape");
  await q.getByText(/当前关闭访问/).waitFor();
  await q.context().close();
  q = await open(320, "settings");
  await q.route("**/api/aihot", (r) =>
    r.fulfill({ status: 503, json: { error: "合成配置读取失败" } }),
  );
  await q.reload();
  await q
    .getByRole("radiogroup", { name: "设置分类" })
    .getByRole("radio", { name: "资讯", exact: true })
    .click();
  await q.getByText(/读取配置失败：合成配置读取失败/).waitFor();
  await geometry(q, roots.settings, "配置读取失败");
  await axe(q, "配置读取失败");
  await q.context().close();
  assert.equal(
    // The v2 page reads /api/night-v2/status; that GET is not a legacy night run.
    calls.some((url) => /\/api\/(?:schedule|night)(?:\/|$)/.test(url)),
    false,
    "无夜巡执行请求",
  );
  for (const access of ["notDetermined", "denied"]) {
    await setup(false, { calendar: access, reminders: access });
    const c = await browser.newContext({
      viewport: { width: 320, height: 1000 },
      reducedMotion: "reduce",
    });
    const p = await c.newPage();
    await batch3Routes(p);
    await p.goto(app.url + "/#calendar");
    await p.locator(".cal-permission").waitFor();
    assert.equal(await p.locator(".cal-grid").count(), 0);
    assert.equal(stub.writes().length, 0);
    await geometry(p, roots.calendar, access);
    await axe(p, access);
    await c.close();
  }
  assert.deepEqual(errors, []);
  console.log(
    "PASS 批次3：日历/设置/新版夜巡双宽与窄屏边界、axe、运行中reduce、七天入口、长/全天/跨日/重叠/15分钟、单一抽屉焦点、旧夜巡 UI 缺席、未授权/拒绝无写入",
  );
} finally {
  await browser.close();
  await app?.close();
}
