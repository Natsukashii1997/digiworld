// 日历与 todo 的桩助手（路线 v3 5.2）：在内存里模拟本机小助手（server/calendar-helper.swift）的命令行输出。
// 只替换最底层的 run(command, input) → { stdout }，服务端的输出解析、权限判断、回读核对与冲突处理照常运行。
// external.* 模拟“在系统日历 / 提醒事项应用里改了同一条”，用来制造冲突。
export function createStubHelper({
  calendar = "authorized",
  reminders = "authorized",
  events = [],
  todos = [],
  now = () => new Date(),
} = {}) {
  const access = { calendar, reminders };
  const store = {
    events: events.map((e) => ({ ...e })),
    todos: todos.map((t) => ({ ...t })),
  };
  const calls = [];
  let seq = 0,
    tick = 0;
  // 回读篡改：下一次写入后，助手回读到的标题与写入不一致（模拟系统侧同时修改）。
  let driftNextTitle = null;
  const stamp = () => new Date(now().getTime() + ++tick * 1000).toISOString();
  const out = (value) => ({ stdout: JSON.stringify(value) + "\n" });
  const denied = (kind) =>
    out({ ok: false, error: "denied", message: `${kind}未授权`, access });
  function run(command, input = {}) {
    calls.push({ command, input });
    switch (command) {
      case "status":
        return out({ ok: true, access });
      case "request-access":
        if (access.calendar === "notDetermined") access.calendar = "authorized";
        if (access.reminders === "notDetermined") access.reminders = "authorized";
        return out({ ok: true, access });
      case "events": {
        if (access.calendar !== "authorized") return denied("日历");
        const from = Date.parse(input.from),
          to = Date.parse(input.to);
        return out({
          ok: true,
          access,
          events: store.events.filter(
            (e) => Date.parse(e.end) > from && Date.parse(e.start) < to,
          ),
        });
      }
      case "create-event": {
        if (access.calendar !== "authorized") return denied("日历");
        const event = {
          id: `ev-${++seq}`,
          calendar: "工作台",
          workbench: true,
          title: driftNextTitle ?? input.title,
          start: input.start,
          end: input.end,
          allDay: false,
          modified: stamp(),
        };
        driftNextTitle = null;
        store.events.push(event);
        return out({ ok: true, access, event });
      }
      case "update-event": {
        if (access.calendar !== "authorized") return denied("日历");
        const event = store.events.find((e) => e.id === input.id);
        if (!event) return out({ ok: false, error: "not_found", message: "日历里已找不到这条" });
        if (!event.workbench)
          return out({ ok: false, error: "readonly", message: "只能修改“工作台”日历里的条目" });
        if (event.modified !== input.expectedModified)
          return out({ ok: false, error: "conflict", message: "系统日历里已被修改", current: event });
        Object.assign(event, {
          title: input.title,
          start: input.start,
          end: input.end,
          modified: stamp(),
        });
        return out({ ok: true, access, event });
      }
      case "reminders":
        if (access.reminders !== "authorized") return denied("提醒事项");
        return out({ ok: true, access, list: "工作台", reminders: store.todos });
      case "create-reminder": {
        if (access.reminders !== "authorized") return denied("提醒事项");
        const reminder = {
          id: `rm-${++seq}`,
          title: input.title,
          completed: false,
          due: input.due ?? null,
          modified: stamp(),
        };
        store.todos.push(reminder);
        return out({ ok: true, access, reminder });
      }
      case "update-reminder": {
        if (access.reminders !== "authorized") return denied("提醒事项");
        const reminder = store.todos.find((t) => t.id === input.id);
        if (!reminder) return out({ ok: false, error: "not_found", message: "提醒事项里已找不到这条" });
        if (reminder.modified !== input.expectedModified)
          return out({ ok: false, error: "conflict", message: "提醒事项里已被修改", current: reminder });
        for (const key of ["title", "completed", "due"])
          if (key in input) reminder[key] = input[key];
        reminder.modified = stamp();
        return out({ ok: true, access, reminder });
      }
      default:
        throw Object.assign(new Error(`unknown command ${command}`), { code: 64 });
    }
  }
  return {
    run,
    calls,
    access,
    store,
    writes: () => calls.filter((c) => /^(create|update)-/.test(c.command)),
    external: {
      editEvent(id, patch) {
        Object.assign(store.events.find((e) => e.id === id), patch, { modified: stamp() });
      },
      editTodo(id, patch) {
        Object.assign(store.todos.find((t) => t.id === id), patch, { modified: stamp() });
      },
      driftNextTitle(title) {
        driftNextTitle = title;
      },
    },
  };
}
