import { batch1State } from "./ui-v14-batch1-fixture.mjs";
import { createStubHelper } from "./calendar-fixture.mjs";
export const FIXED_NOW = "2026-10-04T10:00:00+08:00";
export function batch3Data(long = false) {
  const state = batch1State();
  state.night = {
    time: "23:00",
    end: "07:00",
    budget: "20",
    task: long
      ? "允许处理的合成草稿EnglishWithoutSpaces".repeat(25)
      : "只读核对指定合成资料，输出待确认清单",
    enabled: false,
  };
  state.model = {
    provider: "合成提供商",
    model: "synthetic-model",
    endpoint: "https://example.com/api",
  };
  const local = (d, h, m = 0) =>
    new Date(
      `2026-${d < 31 ? "09" : "10"}-${String(d < 31 ? d : d - 30).padStart(2, "0")}T${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:00+08:00`,
    ).toISOString();
  const title = long ? "完整事件长中文EnglishWithoutSpaces".repeat(6) : "写交接与回归";
  const events = Array.from({ length: 7 }, (_, i) => ({
    id: `b3-day-${i}`,
    calendar: i % 2 ? "公司" : "工作台",
    workbench: !(i % 2),
    title: `${i + 1}. ${title}`,
    start: local(28 + i, 9),
    end: local(28 + i, 10),
    allDay: false,
    modified: local(27, 8),
  }));
  events.push(
    ...Array.from({ length: 4 }, (_, i) => ({
      id: `b3-overlap-${i}`,
      calendar: i === 0 ? "公司" : "工作台",
      workbench: i !== 0,
      title: `重叠${i + 1} ${title}`,
      start: local(34, 14),
      end: local(34, 14, i === 3 ? 15 : 45),
      allDay: false,
      modified: local(27, 8),
    })),
    {
      id: "b3-allday",
      calendar: "公司",
      workbench: false,
      title: `全天 ${title}`,
      start: local(34, 0),
      end: local(35, 0),
      allDay: true,
      modified: local(27, 8),
    },
    {
      id: "b3-cross",
      calendar: "公司",
      workbench: false,
      title: `跨午夜 ${title}`,
      start: local(33, 23, 30),
      end: local(34, 1),
      allDay: false,
      modified: local(27, 8),
    },
  );
  const todos = ["过去", "今天", "未来", "未设期限"].map((label, i) => ({
    id: `b3-todo-${i}`,
    title: label + " · " + title,
    completed: false,
    due: i === 3 ? null : local(33 + i, 17),
    modified: local(27, 8),
  }));
  return { state, events, todos };
}
export function batch3Stub(data, options = {}) {
  return createStubHelper({ ...data, now: () => new Date(FIXED_NOW), ...options });
}
export async function batch3Routes(page) {
  await page.addInitScript(
    ({ now }) => {
      const NativeDate = Date;
      globalThis.Date = class extends NativeDate {
        constructor(...args) {
          super(...(args.length ? args : [now]));
        }
        static now() {
          return new NativeDate(now).getTime();
        }
      };
    },
    { now: FIXED_NOW },
  );
  // 只替换合成会话的目录文字，保留随机端口的原会话令牌。
  await page.route("**/api/session", async (r) => {
    const response = await r.fetch();
    const body = await response.json();
    await r.fulfill({ response, json: { ...body, directory: "/synthetic/工作台" } });
  });
}
