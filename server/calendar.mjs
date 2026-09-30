// 日历与 todo（路线 v3 5.2；产品定义 v1.2 §4.8、v1.1 §4.5；基线 D13、D38、Q31）。
// 权威数据在 macOS 日历与提醒事项；工作台只通过本机小助手（calendar-helper.swift，EventKit）读写，
// 只在“工作台”日历 / 提醒事项列表中新建与修改，写后回读；冲突以回读为准并提示。
// 非 macOS、助手不可运行、未授权时如实返回“不可用 / 未授权”，不做替代存储。
// 注意：EventKit 部分在云端（Linux）无法验证，需本机 macOS 实测；测试注入桩 run。
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";

export const HELPER_SCRIPT = fileURLToPath(new URL("./calendar-helper.swift", import.meta.url));
export const WORKBENCH_NAME = "工作台";
const ACCESS = ["authorized", "writeOnly", "denied", "restricted", "notDetermined"];
const ERRORS = ["denied", "not_found", "conflict", "readonly", "invalid", "failed"];
const exec = promisify(execFile);
const fail = (message, status = 400, extra = {}) =>
  Object.assign(new Error(message), { status, ...extra });

export function detectPlatform(platform = process.platform) {
  return platform === "darwin"
    ? { supported: true, reason: "" }
    : {
        supported: false,
        reason: "日历与提醒事项只在 macOS 上可用（需要本机小助手通过 EventKit 访问）",
      };
}

// ---- 助手输出解析：只接受约定形状 ----
const bad = (why) => fail(`日历助手输出无法解析：${why}`, 502);
const isIso = (v) => typeof v === "string" && /^\d{4}-\d{2}-\d{2}T/.test(v) && !Number.isNaN(Date.parse(v));
const text = (v, max) => typeof v === "string" && v.length <= max;
function checkAccess(access) {
  if (
    !access ||
    typeof access !== "object" ||
    !ACCESS.includes(access.calendar) ||
    !ACCESS.includes(access.reminders)
  )
    throw bad("权限状态无效");
  return { calendar: access.calendar, reminders: access.reminders };
}
function checkEvent(e) {
  if (
    !e ||
    typeof e !== "object" ||
    !text(e.id, 512) ||
    !e.id ||
    !text(e.calendar, 200) ||
    typeof e.workbench !== "boolean" ||
    !text(e.title, 2000) ||
    !isIso(e.start) ||
    !isIso(e.end) ||
    typeof e.allDay !== "boolean" ||
    !(e.modified === null || isIso(e.modified))
  )
    throw bad("日历条目格式无效");
  const { id, calendar, workbench, title, start, end, allDay, modified } = e;
  return { id, calendar, workbench, title, start, end, allDay, modified };
}
function checkReminder(r) {
  if (
    !r ||
    typeof r !== "object" ||
    !text(r.id, 512) ||
    !r.id ||
    !text(r.title, 2000) ||
    typeof r.completed !== "boolean" ||
    !(r.due === null || isIso(r.due)) ||
    !(r.modified === null || isIso(r.modified))
  )
    throw bad("提醒事项格式无效");
  const { id, title, completed, due, modified } = r;
  return { id, title, completed, due, modified };
}
const checkCurrent = (c) => ("completed" in c ? checkReminder(c) : checkEvent(c));

export function parseHelperOutput(stdout) {
  const line = String(stdout ?? "")
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
    .at(-1);
  if (!line) throw bad("没有输出");
  let value;
  try {
    value = JSON.parse(line);
  } catch {
    throw bad("不是 JSON");
  }
  if (!value || typeof value !== "object" || Array.isArray(value) || typeof value.ok !== "boolean")
    throw bad("缺少 ok 字段");
  const result = { ok: value.ok };
  if (value.access !== undefined) result.access = checkAccess(value.access);
  if (!value.ok) {
    if (!ERRORS.includes(value.error)) throw bad("错误类型未知");
    result.error = value.error;
    result.message = text(value.message, 500) ? value.message : "";
    if (value.current !== undefined) {
      if (!value.current || typeof value.current !== "object") throw bad("回读内容无效");
      result.current = checkCurrent(value.current);
    }
    return result;
  }
  if (value.events !== undefined) {
    if (!Array.isArray(value.events)) throw bad("events 不是列表");
    result.events = value.events.map(checkEvent);
  }
  if (value.event !== undefined) result.event = checkEvent(value.event);
  if (value.reminders !== undefined) {
    if (!Array.isArray(value.reminders)) throw bad("reminders 不是列表");
    result.reminders = value.reminders.map(checkReminder);
  }
  if (value.reminder !== undefined) result.reminder = checkReminder(value.reminder);
  if (value.list !== undefined) {
    if (!text(value.list, 200)) throw bad("列表名无效");
    result.list = value.list;
  }
  return result;
}

// 回读核对：逐字段比较写入值与回读值；时间按时刻比较。
export function reconcile(requested, readback) {
  const differences = [];
  for (const [key, want] of Object.entries(requested)) {
    const got = readback?.[key];
    const same = ["start", "end", "due"].includes(key)
      ? (want ?? null) === null
        ? (got ?? null) === null
        : got != null && Date.parse(want) === Date.parse(got)
      : want === got;
    if (!same) differences.push(key);
  }
  return { matches: differences.length === 0, differences };
}

// ---- 本机小助手：子进程调用 ----
async function runSwift(command, input, { timeoutMs }) {
  return exec("/usr/bin/swift", [HELPER_SCRIPT, command, JSON.stringify(input ?? {})], {
    timeout: timeoutMs,
    maxBuffer: 4 * 1024 * 1024,
  });
}

export function createCalendarHelper({
  platform = process.platform,
  run = runSwift,
  timeoutMs = 30000,
} = {}) {
  const detected = detectPlatform(platform);
  return {
    platform: detected,
    async call(command, input = {}) {
      if (!detected.supported) throw fail(detected.reason, 503, { unsupported: true });
      let output;
      try {
        output = await run(command, input, { timeoutMs });
      } catch (error) {
        throw fail(
          error?.killed || error?.signal === "SIGTERM"
            ? "本机小助手超时没有返回"
            : error?.code === "ENOENT"
              ? "找不到 swift 运行环境（需要安装 Xcode 命令行工具）"
              : "本机小助手运行失败",
          503,
          { helperFailed: true },
        );
      }
      return parseHelperOutput(output?.stdout);
    },
  };
}

// ---- 输入校验 ----
function title(value) {
  if (typeof value !== "string" || !value.trim()) throw fail("请写一句话");
  const t = value.trim();
  if (t.length > 200) throw fail("一句话不超过 200 字");
  return t;
}
function when(value, label) {
  if (!isIso(value)) throw fail(`${label}无效`);
  return new Date(value).toISOString();
}
function span(input) {
  const start = when(input?.start, "开始时间"),
    end = when(input?.end, "结束时间");
  const ms = Date.parse(end) - Date.parse(start);
  if (ms <= 0) throw fail("结束时间需要晚于开始时间");
  if (ms > 24 * 3600 * 1000) throw fail("规划块不超过 24 小时");
  return { start, end };
}
function version(input) {
  if (typeof input?.id !== "string" || !input.id || input.id.length > 512) throw fail("条目标识无效");
  if (!(input.expectedModified === null || isIso(input.expectedModified)))
    throw fail("缺少回读版本，请刷新后再改");
  return { id: input.id, expectedModified: input.expectedModified };
}

const ACCESS_TEXT = {
  notDetermined: "尚未授权，需要你在页面上点击授权",
  denied: "已被拒绝，请在“系统设置 → 隐私与安全性”中允许",
  restricted: "受系统限制，无法授权",
  writeOnly: "只有写入权限，无法回读；请在“系统设置 → 隐私与安全性”中改为完全访问",
};
const accessReason = (kind, state) =>
  `${kind === "calendar" ? "日历" : "提醒事项"}未授权：${ACCESS_TEXT[state] || state}`;

export function createCalendar({ helper = createCalendarHelper() } = {}) {
  const unsupported = () => ({ available: false, reason: helper.platform.reason });
  const unavailable = (error) => ({
    available: false,
    reason: error.unsupported ? error.message : `本机小助手不可用：${error.message}`,
  });
  // 写入前确认平台与权限；这一步失败时写入尚未发出。
  async function ready(kind) {
    let result;
    try {
      result = await helper.call("status");
    } catch (error) {
      throw fail(`日历助手不可用：${error.message}`, 503, { operationNotStarted: true });
    }
    if (result.access?.[kind] !== "authorized")
      throw fail(accessReason(kind, result.access?.[kind]), 409, { operationNotStarted: true });
  }
  // 发出写入：此后助手失败即结果未知，必须刷新核对，不能假设成功或失败。
  async function write(command, input, kind) {
    await ready(kind);
    let result;
    try {
      result = await helper.call(command, input);
    } catch (error) {
      throw fail(
        `写入结果未知：${error.message}。请刷新后核对${kind === "calendar" ? "日历" : "提醒事项"}，再决定是否重做`,
        503,
        { unknownResult: true },
      );
    }
    if (result.ok) return result;
    if (result.error === "conflict") return result;
    const label = kind === "calendar" ? "日历" : "提醒事项";
    const messages = {
      denied: accessReason(kind, result.access?.[kind] || "denied"),
      not_found: `${label}里已找不到这条，请刷新`,
      readonly: "只能修改“工作台”日历里的条目，其他日历只读",
      invalid: `${label}拒绝了这次写入：${result.message || "内容无效"}`,
      failed: `${label}写入失败：${result.message || "原因未知"}，请刷新核对`,
    };
    throw fail(messages[result.error], result.error === "failed" ? 502 : 409);
  }
  const confirmed = (check, label) =>
    check.matches
      ? `已写入“工作台”${label}，回读核对一致`
      : `回读与写入不一致（${check.differences.join("、")}），已以回读为准`;
  const conflicted = (label) =>
    `${label}应用里已修改过这条，你的修改没有写入；已以回读为准显示最新内容`;

  return {
    async status() {
      if (!helper.platform.supported) return unsupported();
      try {
        const result = await helper.call("status");
        return {
          available: true,
          access: result.access,
          calendarName: WORKBENCH_NAME,
          listName: WORKBENCH_NAME,
        };
      } catch (error) {
        return unavailable(error);
      }
    },
    // 只在用户点击“授权”时调用；系统会弹出权限对话框。
    async requestAccess() {
      try {
        const result = await helper.call("request-access");
        return { available: true, access: result.access };
      } catch (error) {
        throw fail(`无法申请权限：${error.message}`, 503);
      }
    },
    async week(input = {}) {
      const from = when(input.from, "开始日期"),
        to = when(input.to, "结束日期");
      if (Date.parse(to) <= Date.parse(from) || Date.parse(to) - Date.parse(from) > 42 * 86400000)
        throw fail("日期范围无效");
      if (!helper.platform.supported) return unsupported();
      try {
        const result = await helper.call("events", { from, to });
        if (!result.ok)
          return {
            available: true,
            access: result.access,
            events: null,
            reason: accessReason("calendar", result.access?.calendar || "denied"),
          };
        const events = [...result.events].sort(
          (a, b) => Date.parse(a.start) - Date.parse(b.start) || a.title.localeCompare(b.title),
        );
        return { available: true, access: result.access, events };
      } catch (error) {
        return unavailable(error);
      }
    },
    async todos() {
      if (!helper.platform.supported) return unsupported();
      try {
        const result = await helper.call("reminders");
        if (!result.ok)
          return {
            available: true,
            access: result.access,
            reminders: null,
            reason: accessReason("reminders", result.access?.reminders || "denied"),
          };
        return { available: true, access: result.access, list: result.list || WORKBENCH_NAME, reminders: result.reminders };
      } catch (error) {
        return unavailable(error);
      }
    },
    async createBlock(input) {
      const want = { title: title(input?.title), ...span(input) };
      const result = await write("create-event", want, "calendar");
      const check = reconcile(want, result.event);
      return { block: result.event, check, message: confirmed(check, "日历") };
    },
    async updateBlock(input) {
      const target = version(input);
      const want = { title: title(input?.title), ...span(input) };
      const result = await write("update-event", { id: target.id, ...want, expectedModified: target.expectedModified }, "calendar");
      if (!result.ok)
        return { conflict: true, block: result.current, message: conflicted("日历") };
      const check = reconcile(want, result.event);
      return { conflict: false, block: result.event, check, message: confirmed(check, "日历") };
    },
    async createTodo(input) {
      const want = { title: title(input?.title) };
      if (input?.due !== undefined && input.due !== null) want.due = when(input.due, "提醒时间");
      const result = await write("create-reminder", want, "reminders");
      const check = reconcile({ ...want, due: want.due ?? null }, result.reminder);
      return { reminder: result.reminder, check, message: confirmed(check, "提醒事项列表") };
    },
    async updateTodo(input) {
      const target = version(input);
      const want = {};
      if (input.title !== undefined) want.title = title(input.title);
      if (input.completed !== undefined) {
        if (typeof input.completed !== "boolean") throw fail("完成状态无效");
        want.completed = input.completed;
      }
      if (input.due !== undefined) want.due = input.due === null ? null : when(input.due, "提醒时间");
      if (!Object.keys(want).length) throw fail("没有要修改的内容");
      const result = await write("update-reminder", { id: target.id, ...want, expectedModified: target.expectedModified }, "reminders");
      if (!result.ok)
        return { conflict: true, reminder: result.current, message: conflicted("提醒事项") };
      const check = reconcile(want, result.reminder);
      return { conflict: false, reminder: result.reminder, check, message: confirmed(check, "提醒事项列表") };
    },
  };
}
