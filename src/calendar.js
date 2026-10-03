// 日历页的纯函数（路线 v3 5.2）：周起点、日期键、时间轴布局、夜巡窗口分段、拖动取整。
// 全部按浏览器本地时区计算；写入时转成 ISO 时刻交给服务端。
export const DAY_MINUTES = 24 * 60;
export const SNAP = 15;

const pad = (n) => String(n).padStart(2, "0");
export const ymd = (date) =>
  `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
export const hm = (date) => `${pad(date.getHours())}:${pad(date.getMinutes())}`;
export const hmOf = (minutes) => `${pad(Math.floor(minutes / 60) % 24)}:${pad(minutes % 60)}`;

export function startOfDay(date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}
export function addDays(date, n) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + n);
}
// 周一为一周第一天。
export function startOfWeek(date) {
  const d = startOfDay(date);
  return addDays(d, -((d.getDay() + 6) % 7));
}
export function dayList(start, count) {
  return Array.from({ length: count }, (_, i) => addDays(start, i));
}
export function localIso(dateKey, time) {
  const [y, m, d] = dateKey.split("-").map(Number);
  const [h, min] = time.split(":").map(Number);
  return new Date(y, m - 1, d, h, min).toISOString();
}
export const snap = (minutes, step = SNAP) =>
  Math.max(0, Math.min(DAY_MINUTES, Math.round(minutes / step) * step));

// 某一天内的事件片段：[top, bottom) 分钟，跨天事件裁到当天；全天事件单列。
export function eventsOfDay(events, day) {
  const from = startOfDay(day).getTime(),
    to = addDays(day, 1).getTime();
  const timed = [],
    allDay = [];
  for (const e of events || []) {
    const s = Date.parse(e.start),
      t = Date.parse(e.end);
    if (!(t > from && s < to)) continue;
    if (e.allDay) {
      allDay.push(e);
      continue;
    }
    timed.push({
      event: e,
      top: Math.max(0, (s - from) / 60000),
      bottom: Math.min(DAY_MINUTES, (t - from) / 60000),
    });
  }
  // 重叠的片段并排：贪心分列。
  timed.sort((a, b) => a.top - b.top || b.bottom - a.bottom);
  const ends = [];
  for (const item of timed) {
    let col = ends.findIndex((end) => end <= item.top);
    if (col === -1) col = ends.push(0) - 1;
    ends[col] = item.bottom;
    item.column = col;
  }
  for (const item of timed) {
    const overlapping = timed.filter((o) => o.top < item.bottom && o.bottom > item.top);
    item.columns = Math.max(...overlapping.map((o) => o.column)) + 1;
  }
  return { timed, allDay };
}

// 夜巡窗口（草稿）在某天里的分段：23:00–07:00 → [0, 420) 与 [1380, 1440)。
export function nightSegments(night) {
  if (!night?.time || !night?.end) return [];
  const toMin = (t) => {
    const [h, m] = t.split(":").map(Number);
    return h * 60 + m;
  };
  const a = toMin(night.time),
    b = toMin(night.end);
  if (a === b) return [];
  return a < b ? [[a, b]] : [[0, b], [a, DAY_MINUTES]].filter(([x, y]) => y > x);
}

export function spanText(event) {
  if (event.allDay) return "全天";
  return `${hm(new Date(event.start))}–${hm(new Date(event.end))}`;
}
export function dueText(iso) {
  const d = new Date(iso);
  return `${d.getMonth() + 1}/${d.getDate()} ${hm(d)}`;
}
// datetime-local 输入框的值 ↔ ISO。
export function toLocalInput(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  return `${ymd(d)}T${hm(d)}`;
}
export function fromLocalInput(value) {
  const [date, time] = String(value).split("T");
  if (!date || !time) return null;
  return localIso(date, time.slice(0, 5));
}
