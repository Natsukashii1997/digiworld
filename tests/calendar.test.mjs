// 路线 v3 5.2 日历与 todo（服务端）：平台检测、助手输出解析、权限、写后回读核对、冲突以回读为准。
// EventKit 本身在云端（Linux）无法验证，这里用桩助手（tests/calendar-fixture.mjs）只替换子进程输出。
import test from "node:test";
import assert from "node:assert/strict";
import {
  detectPlatform,
  parseHelperOutput,
  reconcile,
  createCalendarHelper,
  createCalendar,
  HELPER_SCRIPT,
} from "../server/calendar.mjs";
import { createStubHelper } from "./calendar-fixture.mjs";
import { existsSync, readFileSync } from "node:fs";

const at = (h, m = 0, d = 30) => new Date(Date.UTC(2026, 8, d, h, m)).toISOString();
const service = (stub, platform = "darwin") =>
  createCalendar({ helper: createCalendarHelper({ platform, run: stub.run }) });

test("平台检测：非 macOS 如实返回不可用，不调用助手", async () => {
  assert.equal(detectPlatform("darwin").supported, true);
  const linux = detectPlatform("linux");
  assert.equal(linux.supported, false);
  assert.match(linux.reason, /macOS/);
  const stub = createStubHelper();
  const cal = service(stub, "linux");
  const status = await cal.status();
  assert.equal(status.available, false);
  assert.match(status.reason, /macOS/);
  const week = await cal.week({ from: at(0), to: at(0, 0, 31) });
  assert.equal(week.available, false);
  const todos = await cal.todos();
  assert.equal(todos.available, false);
  await assert.rejects(
    cal.createBlock({ title: "写方案", start: at(9), end: at(10) }),
    (e) => e.status === 503 && /不可用/.test(e.message),
  );
  assert.equal(stub.calls.length, 0);
});

test("助手输出解析：只接受约定形状，异常输出一律拒绝", () => {
  const event = {
    id: "ev-1",
    calendar: "工作台",
    workbench: true,
    title: "写方案",
    start: at(9),
    end: at(10),
    allDay: false,
    modified: at(8),
  };
  const ok = parseHelperOutput(JSON.stringify({ ok: true, access: { calendar: "authorized", reminders: "denied" }, events: [event] }) + "\n");
  assert.equal(ok.ok, true);
  assert.deepEqual(ok.events, [event]);
  assert.equal(ok.access.reminders, "denied");
  const longNotes = parseHelperOutput(JSON.stringify({ ok: true, events: [{ ...event, notesOverflow: true }] }));
  assert.equal(longNotes.events[0].notesOverflow, true);
  const todo = { id: "rm-1", title: "交报告", completed: false, due: null, modified: at(8) };
  assert.deepEqual(parseHelperOutput(JSON.stringify({ ok: true, reminders: [todo], list: "工作台" })).reminders, [todo]);
  const conflict = parseHelperOutput(JSON.stringify({ ok: false, error: "conflict", message: "已被修改", current: event }));
  assert.equal(conflict.error, "conflict");
  assert.deepEqual(conflict.current, event);
  // 助手可能先打印系统警告，最后一行才是结果。
  assert.equal(parseHelperOutput(`warning: something\n${JSON.stringify({ ok: true, access: { calendar: "authorized", reminders: "authorized" } })}\n`).ok, true);
  for (const bad of [
    "",
    "not json",
    "[]",
    JSON.stringify({ ok: "yes" }),
    JSON.stringify({ ok: true, access: { calendar: "maybe", reminders: "authorized" } }),
    JSON.stringify({ ok: true, events: [{ ...event, start: "明天" }] }),
    JSON.stringify({ ok: true, events: [{ ...event, title: 42 }] }),
    JSON.stringify({ ok: true, events: [{ ...event, title: "x".repeat(2001) }] }),
    JSON.stringify({ ok: true, events: "none" }),
    JSON.stringify({ ok: true, reminders: [{ ...todo, completed: "no" }] }),
    JSON.stringify({ ok: true, deleted: true }),
    JSON.stringify({ ok: true, found: true }),
    JSON.stringify({ ok: false, error: "boom" }),
  ])
    assert.throws(() => parseHelperOutput(bad), /助手输出/, bad);
});

test("回读核对：逐字段比较写入值与回读值", () => {
  const want = { title: "写方案", start: at(9), end: at(10) };
  assert.deepEqual(reconcile(want, { ...want, id: "x" }), { matches: true, differences: [] });
  // 时间按时刻比较，不按字符串（助手可能输出不同时区写法）。
  assert.equal(reconcile(want, { ...want, start: "2026-09-30T17:00:00+08:00" }).matches, true);
  assert.deepEqual(reconcile(want, { ...want, title: "别的" }).differences, ["title"]);
  assert.deepEqual(reconcile({ completed: true }, { completed: false }).differences, ["completed"]);
  assert.deepEqual(reconcile({ due: null }, { due: at(9) }).differences, ["due"]);
});

test("系统日历已有超长备注不拖垮整周读取，改标题也不覆盖备注", async () => {
  const original = "长备注".repeat(1000);
  const stub = createStubHelper({ events: [{ id: "long", calendar: "工作台", workbench: true,
    title: "原计划", start: at(9), end: at(10), allDay: false, modified: at(8), notes: original }] });
  const cal = service(stub);
  const week = await cal.week({ from: at(0), to: at(0, 0, 31) });
  assert.equal(week.events[0].notesOverflow, true);
  assert.equal(week.events[0].notes, undefined);
  const changed = await cal.updateBlock({ id: "long", expectedModified: at(8), title: "新计划", start: at(9), end: at(10) });
  assert.equal(changed.check.matches, true);
  assert.equal(stub.store.events[0].notes, original);
});

test("未授权：读取返回需要授权，写入被拒绝；申请权限只在显式调用时发生", async () => {
  const stub = createStubHelper({ calendar: "notDetermined", reminders: "denied" });
  const cal = service(stub);
  const status = await cal.status();
  assert.equal(status.available, true);
  assert.deepEqual(status.access, { calendar: "notDetermined", reminders: "denied" });
  const week = await cal.week({ from: at(0), to: at(0, 0, 31) });
  assert.equal(week.events, null);
  assert.match(week.reason, /未授权|需要授权/);
  const todos = await cal.todos();
  assert.equal(todos.reminders, null);
  assert.match(todos.reason, /未授权/);
  await assert.rejects(cal.createBlock({ title: "写方案", start: at(9), end: at(10) }), (e) => e.status === 409);
  assert.equal(stub.writes().length, 0);
  assert.equal(stub.calls.some((c) => c.command === "request-access"), false);
  const granted = await cal.requestAccess();
  assert.equal(granted.access.calendar, "authorized");
  assert.equal(stub.calls.filter((c) => c.command === "request-access").length, 1);
});

test("系统拒绝完全访问时申请权限不能虚报成功", async () => {
  const helper = createCalendarHelper({ platform: "darwin", run: async command => ({ stdout: JSON.stringify(
    command === "request-access"
      ? { ok: false, error: "failed", message: "日历授权未完成：系统没有授予完全访问", access: { calendar: "notDetermined", reminders: "authorized" } }
      : { ok: true, access: { calendar: "notDetermined", reminders: "authorized" } },
  ) + "\n" }) });
  await assert.rejects(createCalendar({ helper }).requestAccess(), error =>
    error.status === 409 && /日历授权未完成/.test(error.message));
});

test("规划块：输入校验，写入“工作台”日历后回读核对", async () => {
  const stub = createStubHelper({
    events: [
      { id: "m1", calendar: "公司", workbench: false, title: "周会", start: at(2), end: at(3), allDay: false, modified: at(0) },
    ],
  });
  const cal = service(stub);
  for (const bad of [
    { title: "", start: at(9), end: at(10) },
    { title: "x".repeat(201), start: at(9), end: at(10) },
    { title: "倒序", start: at(10), end: at(9) },
    { title: "太长", start: at(0), end: at(1, 0, 31) },
    { title: "坏时间", start: "明天", end: at(10) },
  ])
    await assert.rejects(cal.createBlock(bad), (e) => e.status === 400, JSON.stringify(bad));
  assert.equal(stub.writes().length, 0);
  const created = await cal.createBlock({ title: " 写方案 ", start: at(9), end: at(10, 30) });
  assert.equal(created.block.title, "写方案");
  assert.equal(created.block.workbench, true);
  assert.equal(created.check.matches, true);
  assert.deepEqual(stub.writes()[0], { command: "create-event", input: { title: "写方案", start: at(9), end: at(10, 30) } });
  const week = await cal.week({ from: at(0), to: at(0, 0, 31) });
  assert.deepEqual(week.events.map((e) => [e.title, e.workbench]), [["周会", false], ["写方案", true]]);
  // 回读与写入不一致：以回读为准，并如实提示。
  stub.external.driftNextTitle("写方案（系统改）");
  const drifted = await cal.createBlock({ title: "读论文", start: at(11), end: at(12) });
  assert.equal(drifted.check.matches, false);
  assert.deepEqual(drifted.check.differences, ["title"]);
  assert.equal(drifted.block.title, "写方案（系统改）");
  assert.match(drifted.message, /以回读为准/);
});

test("修改规划块：冲突以回读为准并提示；其他日历只读", async () => {
  const stub = createStubHelper({
    events: [
      { id: "m1", calendar: "公司", workbench: false, title: "周会", start: at(2), end: at(3), allDay: false, modified: at(0) },
    ],
  });
  const cal = service(stub);
  const { block } = await cal.createBlock({ title: "写方案", start: at(9), end: at(10) });
  const moved = await cal.updateBlock({ id: block.id, title: "写方案", start: at(13), end: at(14), expectedModified: block.modified });
  assert.equal(moved.conflict, false);
  assert.equal(moved.block.start, at(13));
  assert.equal(moved.check.matches, true);
  stub.external.editEvent(block.id, { title: "在日历应用里改过" });
  const clash = await cal.updateBlock({ id: block.id, title: "我的改法", start: at(15), end: at(16), expectedModified: moved.block.modified });
  assert.equal(clash.conflict, true);
  assert.equal(clash.block.title, "在日历应用里改过");
  assert.match(clash.message, /以回读为准/);
  assert.equal(stub.store.events.find((e) => e.id === block.id).title, "在日历应用里改过");
  await assert.rejects(
    cal.updateBlock({ id: "m1", title: "改周会", start: at(2), end: at(3), expectedModified: at(0) }),
    (e) => e.status === 409 && /工作台/.test(e.message),
  );
  await assert.rejects(
    cal.updateBlock({ id: block.id, title: "缺少版本", start: at(2), end: at(3) }),
    (e) => e.status === 400,
  );
});

test("规划块备注与受控删除：旧请求保留备注，删除须确认/版本/归属且独立回读", async () => {
  const stub = createStubHelper({ events: [
    { id: "outside", calendar: "公司", workbench: false, title: "公司会议", start: at(9), end: at(10), allDay: false, modified: at(8) },
  ] });
  const cal = service(stub);
  const created = await cal.createBlock({ title: "写方案", start: at(11), end: at(12), notes: "第一行\n第二行" });
  assert.equal(created.block.notes, "第一行\n第二行");
  assert.equal(created.check.matches, true);
  const oldUpdate = await cal.updateBlock({ id: created.block.id, expectedModified: created.block.modified, title: "改期", start: at(13), end: at(14) });
  assert.equal(oldUpdate.block.notes, "第一行\n第二行", "旧调用未提交备注时保留原值");
  const cleared = await cal.updateBlock({ id: created.block.id, expectedModified: oldUpdate.block.modified, title: "改期", start: at(13), end: at(14), notes: "" });
  assert.equal(cleared.block.notes, "");
  assert.equal(cleared.check.matches, true);
  assert.deepEqual((await cal.checkBlock({ id: cleared.block.id })).state, "present");
  const writes = stub.writes().length;
  await assert.rejects(cal.deleteBlock({ id: cleared.block.id, expectedModified: cleared.block.modified }), /二次确认/);
  await assert.rejects(cal.deleteBlock({ id: cleared.block.id, expectedModified: null, confirmed: true }), /缺少可核对/);
  await assert.rejects(cal.deleteBlock({ id: "outside", expectedModified: at(8), confirmed: true }), /工作台/);
  assert.equal(stub.writes().length, writes + 1, "仅直打非工作台 API 到达助手，未实际删除");
  stub.external.editEvent(cleared.block.id, { title: "外部已改" });
  const clash = await cal.deleteBlock({ id: cleared.block.id, expectedModified: cleared.block.modified, confirmed: true });
  assert.equal(clash.conflict, true);
  assert.equal(clash.block.title, "外部已改");
  assert.equal((await cal.checkBlock({ id: cleared.block.id })).state, "present");
  const current = stub.store.events.find(e => e.id === cleared.block.id);
  const deleted = await cal.deleteBlock({ id: current.id, expectedModified: current.modified, confirmed: true });
  assert.equal(deleted.deleted, true);
  assert.equal(deleted.verified, true);
  assert.equal((await cal.checkBlock({ id: current.id })).state, "absent");
  await assert.rejects(cal.deleteBlock({ id: current.id, expectedModified: current.modified, confirmed: true }), /找不到/);
  assert.equal(stub.store.events.some(e => e.id === "outside"), true);
});

test("删除提交后回读失败保持未知，按 id 查重后不重放", async () => {
  const stub = createStubHelper();
  const cal = service(stub);
  const { block } = await cal.createBlock({ title: "待删", start: at(9), end: at(10) });
  stub.external.deleteReadbackFailsOnce();
  await assert.rejects(cal.deleteBlock({ id: block.id, expectedModified: block.modified, confirmed: true }), e => e.unknownResult === true && /结果未知/.test(e.message));
  assert.equal((await cal.checkBlock({ id: block.id })).state, "absent");
  assert.equal(stub.writes().filter(c => c.command === "delete-event").length, 1);
});

test("todo：新建、勾选完成、设提醒时间，写后回读；冲突以回读为准", async () => {
  const stub = createStubHelper();
  const cal = service(stub);
  await assert.rejects(cal.createTodo({ title: "   " }), (e) => e.status === 400);
  await assert.rejects(cal.createTodo({ title: "交报告", due: "下午" }), (e) => e.status === 400);
  const { reminder } = await cal.createTodo({ title: "交报告" });
  assert.equal(reminder.completed, false);
  assert.equal(reminder.due, null);
  const done = await cal.updateTodo({ id: reminder.id, completed: true, expectedModified: reminder.modified });
  assert.equal(done.conflict, false);
  assert.equal(done.reminder.completed, true);
  assert.equal(done.check.matches, true);
  assert.deepEqual(stub.writes().at(-1).input, { id: reminder.id, completed: true, expectedModified: reminder.modified });
  const due = await cal.updateTodo({ id: reminder.id, due: at(9), expectedModified: done.reminder.modified });
  assert.equal(due.reminder.due, at(9));
  stub.external.editTodo(reminder.id, { completed: false });
  const clash = await cal.updateTodo({ id: reminder.id, completed: true, expectedModified: due.reminder.modified });
  assert.equal(clash.conflict, true);
  assert.equal(clash.reminder.completed, false);
  assert.match(clash.message, /以回读为准/);
  const list = await cal.todos();
  assert.equal(list.list, "工作台");
  assert.deepEqual(list.reminders.map((r) => [r.title, r.completed]), [["交报告", false]]);
  await assert.rejects(cal.updateTodo({ id: reminder.id, expectedModified: clash.reminder.modified }), (e) => e.status === 400);
});

test("助手失败：读取如实报不可用，写入报结果未知、需刷新核对", async () => {
  let fail = null;
  const stub = createStubHelper();
  const helper = createCalendarHelper({
    platform: "darwin",
    run: async (command, input) => {
      // onlyWrites：状态检查正常，写入命令本身失败（写入已发出、结果未知）。
      if (fail && (!fail.onlyWrites || /^(create|update)-/.test(command))) throw fail;
      return stub.run(command, input);
    },
  });
  const cal = createCalendar({ helper });
  fail = Object.assign(new Error("spawn swift ENOENT"), { code: "ENOENT" });
  const status = await cal.status();
  assert.equal(status.available, false);
  assert.match(status.reason, /助手/);
  fail = Object.assign(new Error("timeout"), { killed: true, signal: "SIGTERM" });
  // 写入前的状态检查就失败：写入没有发出，如实报不可用。
  await assert.rejects(
    cal.createBlock({ title: "写方案", start: at(9), end: at(10) }),
    (e) => e.status === 503 && /不可用/.test(e.message) && e.operationNotStarted === true,
  );
  fail.onlyWrites = true;
  await assert.rejects(
    cal.createBlock({ title: "写方案", start: at(9), end: at(10) }),
    (e) => e.status === 503 && /结果未知/.test(e.message) && e.unknownResult === true,
  );
  fail = null;
  const garbled = createCalendar({
    helper: createCalendarHelper({ platform: "darwin", run: async () => ({ stdout: "{broken" }) }),
  });
  assert.equal((await garbled.status()).available, false);
});

test("本机小助手脚本存在，使用 EventKit，命令与服务端一致", () => {
  assert.ok(existsSync(HELPER_SCRIPT), HELPER_SCRIPT);
  const source = readFileSync(HELPER_SCRIPT, "utf8");
  assert.match(source, /import EventKit/);
  for (const command of ["status", "request-access", "events", "create-event", "update-event", "lookup-event", "delete-event", "reminders", "create-reminder", "update-reminder"])
    assert.match(source, new RegExp(`"${command}"`), command);
  // 只在“工作台”日历 / 列表里新建和修改。
  assert.match(source, /"工作台"/);
  assert.match(source, /需本机验证/);
});

test("日历页纯函数：周一为周起点、夜巡窗口分段、重叠并排、拖动取整", async () => {
  const { startOfWeek, ymd, nightSegments, eventsOfDay, snap, localIso, fromLocalInput, toLocalInput } = await import("../src/calendar.js");
  assert.equal(ymd(startOfWeek(new Date(2026, 8, 30))), "2026-09-28", "周三 → 周一");
  assert.equal(ymd(startOfWeek(new Date(2026, 9, 4))), "2026-09-28", "周日仍属本周");
  assert.deepEqual(nightSegments({ start: "23:00", end: "07:00" }), [[0, 420], [1380, 1440]]);
  assert.deepEqual(nightSegments({ start: "01:00", end: "05:00" }), [[60, 300]]);
  assert.equal(snap(10 * 60 + 5), 600);
  assert.equal(snap(10 * 60 + 8), 615);
  const day = new Date(2026, 8, 30);
  const ev = (id, h1, h2, extra = {}) => ({ id, title: id, start: new Date(2026, 8, 30, h1).toISOString(), end: new Date(2026, 8, 30, h2).toISOString(), allDay: false, ...extra });
  const { timed, allDay } = eventsOfDay(
    [ev("a", 9, 11), ev("b", 10, 12), ev("c", 13, 14), ev("d", 0, 23, { allDay: true }), { ...ev("x", 22, 23), end: new Date(2026, 9, 1, 2).toISOString() }],
    day,
  );
  assert.deepEqual(allDay.map((e) => e.id), ["d"]);
  const by = Object.fromEntries(timed.map((t) => [t.event.id, t]));
  assert.deepEqual([by.a.column, by.b.column, by.c.column], [0, 1, 0]);
  assert.deepEqual([by.a.columns, by.c.columns], [2, 1]);
  assert.equal(by.x.bottom, 1440, "跨天事件裁到当天");
  assert.equal(localIso("2026-09-30", "10:00"), new Date(2026, 8, 30, 10).toISOString());
  assert.equal(fromLocalInput(toLocalInput(new Date(2026, 8, 30, 8, 30).toISOString())), new Date(2026, 8, 30, 8, 30).toISOString());
});
