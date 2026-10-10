import {clickCalendarEvent} from "./calendar-v16-helpers.mjs";
// 路线 v3 5.2 日历与 todo（浏览器回归，桩助手，不访问 EventKit）：
// 不可用状态如实显示；首次使用说明权限、点击后才申请；周视图 + 今天；拖出规划块写一句话写入“工作台”日历并回读；
// 其他日历的会议只读；夜巡 v2 计划窗口；修改冲突以回读为准；todo 勾选完成、设提醒时间、新建；世界总览“时间安排”；
// 页面加载不产生任何写入；44px、axe、390 无横溢。
import { createRequire } from "node:module";
import assert from "node:assert/strict";
import AxeBuilder from "@axe-core/playwright";
import { mkdir } from "node:fs/promises";
import { fixture } from "./fixture.mjs";
import { createStubHelper } from "./calendar-fixture.mjs";
import { seed } from "../src/store.js";
const { chromium } = createRequire(import.meta.url)(
  process.env.PLAYWRIGHT_MODULE ||
    "/Users/nat/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright",
);

const base = new Date();
const local = (offset, h, m = 0) =>
  new Date(base.getFullYear(), base.getMonth(), base.getDate() + offset, h, m).toISOString();
const ymd = (offset) => {
  const d = new Date(base.getFullYear(), base.getMonth(), base.getDate() + offset);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};
const stub = createStubHelper({
  calendar: "notDetermined",
  reminders: "notDetermined",
  events: [
    { id: "m1", calendar: "公司", workbench: false, title: "周会", start: local(0, 9), end: local(0, 10), allDay: false, modified: local(-1, 8) },
    { id: "p1", calendar: "工作台", workbench: true, title: "写方案", start: local(0, 14), end: local(0, 15, 30), allDay: false, modified: local(-1, 8) },
  ],
  todos: [
    { id: "t1", title: "交报告", completed: false, due: null, modified: local(-1, 8) },
    { id: "t2", title: "回邮件", completed: false, due: local(0, 17), modified: local(-1, 8) },
    { id: "t3", title: "超过一天的已办", completed: true, completedAt: new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString(), due: null, modified: local(-2, 8) },
    { id: "t4", title: "无完成日期的已办", completed: true, completedAt: null, due: null, modified: local(-2, 8) },
    { id: "t5", title: "一天内的已办", completed: true, completedAt: new Date(Date.now() - 23 * 60 * 60 * 1000).toISOString(), due: null, modified: local(-1, 8) },
  ],
});
const app = await fixture({ discovery: { calendarHelper: { platform: "darwin", run: stub.run } } });
await app.repository.write(seed(), { initialize: true });
const off = await fixture({ discovery: { calendarHelper: { platform: "linux", run: stub.run } } });
await off.repository.write(seed(), { initialize: true });
await mkdir("test-results", { recursive: true });
const browser = await chromium.launch();
const errors = [];
const ok = (s) => console.log("PASS", s);

async function open(target, width, hash, height = 1000) {
  const context = await browser.newContext({ viewport: { width, height }, reducedMotion: "reduce" });
  const page = await context.newPage();
  page.setDefaultTimeout(10000);
  page.on("pageerror", (e) => errors.push(`${width} ${e.message}`));
  await page.goto(`${target.url}/#${hash}`);
  await page.locator("main h1").first().waitFor();
  return page;
}
const radio = (scope,name)=>scope.getByRole("radio",{name,exact:true});
const button = (scope, name) => scope.getByRole("button", { name, exact: true });
async function atLeast44(locator, name) {
  const box = await locator.boundingBox();
  assert.ok(box, `${name} 不可见`);
  assert.ok(box.width >= 44 && box.height >= 44, `${name} 点击区域 ${box.width}x${box.height}，应至少 44px`);
}
async function axe(page, label) {
  const result = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
  assert.deepEqual(
    result.violations.map((v) => `${label}: ${v.id} ${v.nodes.map((n) => n.target).join(" ")}`),
    [],
  );
}
async function noOverflow(page, label) {
  const over = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
  assert.ok(over <= 0, `${label} 横向溢出 ${over}px`);
}
async function until(check, label) {
  for (let i = 0; i < 50; i++) {
    if (await check()) return;
    await new Promise((r) => setTimeout(r, 100));
  }
  assert.fail(`等待超时：${label}`);
}
async function toast(page, pattern) {
  const t = page.locator(".toast").last();
  await t.waitFor();
  assert.match(await t.innerText(), pattern);
  await button(t, "关闭提示").click();
  await t.waitFor({ state: "detached" });
}
const day = (page, offset) => page.locator(`.cal-day[data-date="${ymd(offset)}"]`);
const eventMarker = (page,title) => page.locator(".cal-event-marker").filter({hasText:title}).first();
const todoPanel = (page) => page.locator(".cal-todo");

try {
  // 1. 非 macOS：日历页与世界总览如实显示不可用，没有任何写入入口。
  const offPage = await open(off, 1440, "calendar");
  await offPage.getByRole("heading", { name: "日历", level: 1 }).waitFor();
  const offBox = offPage.locator(".cal-unavailable");
  await offBox.getByText("只在 macOS 上可用").waitFor();
  assert.equal(await button(offPage, "新建规划块").count(), 0);
  assert.equal(await button(offPage, "授权日历与提醒事项").count(), 0);
  assert.equal(await offPage.locator(".nav-item", { hasText: "日历" }).locator(".nav-flag.planned").count(), 0, "日历不再标规划中");
  await axe(offPage, "calendar unavailable");
  // 首页第二版恢复只读“今日”区，平台不可用时必须诚实显示状态。
  await offPage.goto(`${off.url}/#home`);
  await offPage.locator(".hx-mod-a").waitFor();
  await offPage.locator(".hx-mod-a").getByText(/只在 macOS 上可用|本机日历未接入/).waitFor();
  assert.equal(await offPage.locator(".hx-mod-a button").count(), 1, "首页今日只读，不新增系统写入入口");
  await offPage.context().close();
  ok("非 macOS：日历页与首页今日卡如实显示“不可用”，没有写入入口");

  // 2. 首次使用：说明需要日历与提醒事项权限；点击前不申请、不写入。
  const page = await open(app, 1440, "calendar");
  const permission = page.locator(".cal-permission");
  await permission.getByRole("heading", { name: "首次使用需要授权" }).waitFor();
  await permission.getByText(/日历与提醒事项/).first().waitFor();
  await permission.getByText(/“工作台”日历/).first().waitFor();
  assert.equal(stub.calls.some((c) => c.command === "request-access"), false, "未点击不申请权限");
  const grant = button(page, "授权日历与提醒事项");
  await atLeast44(grant, "授权按钮");
  await axe(page, "calendar permission");
  await grant.click();
  await toast(page, /已获得日历权限/);
  await page.locator(".cal-grid").waitFor();
  assert.equal(stub.calls.filter((c) => c.command === "request-access").length, 1);
  assert.equal(stub.writes().length, 0, "页面加载与授权不产生写入");
  ok("首次使用说明需要日历与提醒事项权限；只在点击“授权”后申请，页面加载没有任何写入");

  // 3. 周视图：7 天、会议只读、规划块、夜巡 v2 计划窗口。
  assert.equal(await page.locator(".cal-day").count(), 7);
  const today = day(page, 0);
  await clickCalendarEvent(page,"m1",ymd(0));
  let readOnly=page.getByRole("dialog",{name:"日程详情"});await readOnly.waitFor();
  assert.match(await readOnly.innerText(),/公司/);assert.match(await readOnly.innerText(),/只读/);
  assert.equal(await readOnly.locator("input,textarea").count(),0,"其他日历无编辑入口");await page.keyboard.press("Escape");
  await eventMarker(page,"写方案").waitFor();
  assert.ok((await today.locator(".cal-night").count())>=1,"夜巡窗口仍存在");
  assert.equal(await page.locator('.cal-legend').count(),0,'图例按批准迁入帮助');
  await button(page,'这页怎么用').click();await page.getByRole('dialog').getByText(/夜巡 v2 计划窗口/).waitFor();await page.keyboard.press('Escape');
  assert.equal(await page.getByText(/项目里程碑/).count(),0,'批准取消里程碑占位');
  for (const name of ["周", "今天", "上一周", "下一周", "新建规划块", "刷新"])
    await atLeast44(["周","今天"].includes(name)?radio(page,name):button(page,name), name);
  assert.equal(await radio(page, "周").getAttribute("aria-checked"), "true");
  await axe(page, "calendar week 1440");
  ok("周视图：7 天；其他日历的会议只读显示；“工作台”规划块可点；夜巡 v2 窗口只读；里程碑来源如实说明");

  // 4. 在时间轴上拖出规划块并写一句话。
  const lane = today.locator(".cal-lane");
  // 把时间轴滚到 9:30 附近，并让滚动区在视口中间，10:00–11:00 都可见。
  await page.locator(".cal-scroll").evaluate((el) => {
    el.scrollTop = el.scrollHeight * (9.5 / 24);
    el.scrollIntoView({ block: "center" });
  });
  const y = (minutes) => lane.evaluate((el, m) => {
    const r = el.getBoundingClientRect();
    return r.top + (m / 1440) * r.height;
  }, minutes);
  const box = await lane.boundingBox();
  const lane10 = await y(10 * 60 + 5),
    lane11 = await y(11 * 60 + 5);
  await page.mouse.move(box.x + box.width / 2, lane10);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2, (lane10 + lane11) / 2, { steps: 4 });
  await page.mouse.move(box.x + box.width / 2, lane11, { steps: 4 });
  await page.mouse.up();
  const dialog = page.getByRole("dialog", { name: "新建规划块" });
  await dialog.waitFor();
  assert.equal(await dialog.getByLabel("开始").inputValue(), "10:00");
  assert.equal(await dialog.getByLabel("结束").inputValue(), "11:00");
  assert.equal(await dialog.getByLabel("日期").inputValue(), ymd(0));
  assert.equal(stub.writes().length, 0, "拖动只打开对话框，不写入");
  await dialog.getByLabel("一句话").fill("读论文");
  await axe(page, "calendar create dialog");
  await atLeast44(button(dialog, "写入“工作台”日历"), "写入按钮");
  await button(dialog, "写入“工作台”日历").click();
  await toast(page, /回读核对一致/);
  assert.deepEqual(stub.writes().at(-1), {
    command: "create-event",
    input: { title: "读论文", start: local(0, 10), end: local(0, 11), notes: "" },
  });
  await eventMarker(page,"读论文").waitFor();
  ok("在时间轴上拖出 10:00–11:00，写一句话后写入“工作台”日历，回读一致并显示");

  // 5. 修改规划块：日历应用里已改过 → 以回读为准并提示。
  await clickCalendarEvent(page,stub.store.events.find(e=>e.title==="读论文").id,ymd(0));
  const edit = page.getByRole("dialog", { name: "修改规划块" });
  await edit.waitFor();
  const created = stub.store.events.find((e) => e.title === "读论文");
  stub.external.editEvent(created.id, { title: "读论文（手机上改过）" });
  await edit.getByLabel("一句话").fill("读两篇论文");
  await button(edit, "保存修改").click();
  await page.locator(".cal-notice[role=alert]").getByText(/以回读为准/).waitFor();
  await eventMarker(page,"读论文（手机上改过）").waitFor();
  assert.equal(stub.store.events.find((e) => e.id === created.id).title, "读论文（手机上改过）", "冲突时不写入");
  await atLeast44(button(page, "知道了"), "关闭提示");
  await button(page, "知道了").click();
  assert.equal(await page.locator(".cal-notice").count(), 0);
  ok("修改冲突：日历应用里已改过时不写入，以回读为准显示并提示");

  // 6. todo：列表、勾选完成、设提醒时间、新建；冲突以回读为准。
  const todo = todoPanel(page);
  await todo.getByText("交报告").waitFor();
  await todo.getByText("回邮件").waitFor();
  const check = todo.getByRole("checkbox", { name: "完成 交报告" });
  await atLeast44(todo.locator("label.todo-check").first(), "todo 勾选区");
  await check.check();
  await until(() => stub.store.todos.find((t) => t.id === "t1").completed === true, "勾选写入");
  await until(async () => (await check.isChecked()) === true, "回读后仍为已完成");
  await button(page, "刷新").click();
  for (const title of ["交报告", "一天内的已办", "无完成日期的已办"]) {
    const completed = todo.getByRole("checkbox", { name: `完成 ${title}` });
    await completed.waitFor();
    assert.equal(await completed.isChecked(), true, `${title} 在刷新后仍可见且已勾选`);
  }
  assert.equal(await todo.getByText("超过一天的已办").count(), 0, "超过 24 小时的已办不再显示");
  assert.equal(stub.writes().at(-1).command, "update-reminder");
  await button(todo, "设提醒 回邮件").click();
  await todo.getByLabel("提醒时间 回邮件").fill(`${ymd(1)}T08:30`);
  await button(todo, "保存提醒").click();
  await until(() => stub.store.todos.find((t) => t.id === "t2").due === local(1, 8, 30), "提醒时间写入");
  await todo.getByText(/08:30/).waitFor();
  await todo.getByLabel("新 todo").fill("买牛奶");
  await atLeast44(button(todo, "添加到提醒事项"), "添加 todo");
  await button(todo, "添加到提醒事项").click();
  await todo.getByText("买牛奶").waitFor();
  assert.equal(stub.store.todos.at(-1).title, "买牛奶");
  stub.external.editTodo("t2", { title: "回邮件（提醒事项里改过）" });
  await todo.getByRole("checkbox", { name: "完成 回邮件" }).check();
  await page.locator(".cal-notice[role=alert]").getByText(/以回读为准/).waitFor();
  await todo.getByText("回邮件（提醒事项里改过）").waitFor();
  assert.equal(stub.store.todos.find((t) => t.id === "t2").completed, false, "冲突时不写入");
  await toast(page, /提醒事项应用里已修改过/);
  await axe(page, "calendar todo");
  await page.screenshot({ path: "test-results/calendar-1440.png", fullPage: true });
  ok("todo：勾选完成、设提醒时间、新建都写入“工作台”提醒事项并回读；冲突不写入，以回读为准提示");

  // 7. 今天视图。
  await radio(page, "今天").click();
  assert.equal(await radio(page, "今天").getAttribute("aria-checked"), "true");
  assert.equal(await page.locator(".cal-day").count(), 1);
  await eventMarker(page,"周会").waitFor();
  for (const name of ["前一天", "后一天"]) await atLeast44(["周","今天"].includes(name)?radio(page,name):button(page,name), name);
  ok("今天视图：只显示今天一列，可前后翻天");

  // 8. 第二版首页今日卡只读复用已授权日历与 todo。
  await page.goto(`${app.url}/#home`);
  await page.locator(".hx-mod-a").waitFor();
  await page.locator(".hx-mod-a .hx-blk").first().waitFor();
  assert.equal(await page.locator(".hx-mod-a .hx-blk").count(), 3, "两段原有日程与本测试新建规划块均以时间轴显示");
  await page.locator(".hx-mod-a").getByText("回邮件", { exact: false }).waitFor();
  assert.equal(await page.locator(".hx-mod-a button").count(), 1, "首页今日只保留去日历入口");
  // 备注与删除只作用于“工作台”规划块。取消不写，确认后独立回读；未知结果不得重放。
  await page.goto(`${app.url}/#calendar`);
  await page.locator(".cal-grid").waitFor();
  await clickCalendarEvent(page, created.id, ymd(0));
  let block = page.getByRole("dialog", { name: "修改规划块" });
  await block.getByLabel("备注（可留空）").fill("附：先读方法章节");
  await button(block, "保存修改").click();
  await toast(page, /回读核对一致/);
  assert.equal(stub.store.events.find((e) => e.id === created.id).notes, "附：先读方法章节");
  await clickCalendarEvent(page, created.id, ymd(0));
  block = page.getByRole("dialog", { name: "修改规划块" });
  assert.equal(await block.getByLabel("备注（可留空）").inputValue(), "附：先读方法章节");
  const deletesBefore = stub.writes().filter((c) => c.command === "delete-event").length;
  await button(block, "删除规划块").click();
  await block.getByText(/此操作不能撤销，请再次确认/).waitFor();
  await button(block, "取消删除").click();
  assert.equal(stub.writes().filter((c) => c.command === "delete-event").length, deletesBefore);
  await button(block, "删除规划块").click();
  await button(block, "确认删除规划块").click();
  await toast(page, /已删除|回读/);
  assert.equal(stub.store.events.some((e) => e.id === created.id), false);
  assert.equal(stub.writes().filter((c) => c.command === "delete-event").length, deletesBefore + 1);
  await clickCalendarEvent(page, "p1", ymd(0));
  block = page.getByRole("dialog", { name: "修改规划块" });
  stub.external.deleteReadbackFailsOnce();
  await button(block, "删除规划块").click();
  await button(block, "确认删除规划块").click();
  await toast(page, /目前已不在日历|仍见该规划块/);
  assert.equal(stub.writes().filter((c) => c.command === "delete-event").length, deletesBefore + 2, "未知结果只写一次");
  assert.equal(stub.store.events.some((e) => e.id === "p1"), false, "独立回读后状态为缺失");
  ok("规划块备注回读；删除需二次确认，取消零写入；结果未知只按标识独立回读而不重放");
  await page.context().close();
  ok("世界总览今日卡只读显示已授权安排，写入仍在日历页");

  // 9. 390 宽：无横向溢出、44px、axe。
  const mobile = await open(app, 390, "calendar", 844);
  await mobile.locator(".cal-grid").waitFor();
  await noOverflow(mobile, "390 calendar week");
  for (const name of ["周", "今天", "新建规划块"]) await atLeast44(["周","今天"].includes(name)?radio(mobile,name):button(mobile,name), `390 ${name}`);
  await atLeast44(todoPanel(mobile).locator("label.todo-check").first(), "390 todo 勾选区");
  await axe(mobile, "calendar 390");
  await button(mobile, "新建规划块").click();
  const kb = mobile.getByRole("dialog", { name: "新建规划块" });
  await kb.waitFor();
  await noOverflow(mobile, "390 create dialog");
  await button(kb, "取消").click();
  await mobile.screenshot({ path: "test-results/calendar-390.png", fullPage: true });
  await mobile.goto(`${app.url}/#home`);
  await mobile.locator(".hx-mod-a").waitFor();
  await mobile.locator(".hx-mod-a .hx-blk").first().waitFor();
  await noOverflow(mobile, "390 home");
  await mobile.context().close();
  ok("390 宽：日历页、新建对话框与世界总览无横向溢出，控件 44px，axe 通过");

  assert.deepEqual(errors, []);
  console.log("calendar-todo-browser: all passed");
} finally {
  await browser.close();
  await app.close();
  await off.close();
}
