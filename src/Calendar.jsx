// 日历页（生活区，路线 v3 5.2）：周视图 + 今天；在时间轴上拖出规划块并写一句话，写入 macOS“工作台”日历；
// 其他日历的会议只读；夜巡窗口（草稿）；旁边是“工作台”提醒事项列表的 todo。
// 权威在 macOS 日历与提醒事项：每次写入后以服务端回读结果为准，冲突时提示并显示回读内容。
// 所有写入都来自用户点击；首次使用先说明需要的权限，点击后才申请。
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CalendarPlus, ChevronLeft, ChevronRight, RefreshCw, ShieldCheck, BellRing, Plus } from "lucide-react";
import { request } from "./api.js";
import { Button, Dialog, PageHeading } from "./components.jsx";
import {
  DAY_MINUTES,
  addDays,
  dayList,
  dueText,
  eventsOfDay,
  fromLocalInput,
  hm,
  hmOf,
  localIso,
  nightSegments,
  snap,
  spanText,
  startOfDay,
  startOfWeek,
  toLocalInput,
  ymd,
} from "./calendar.js";
import "./calendar.css";

const WEEKDAYS = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"];
const dayLabel = (d) => `${WEEKDAYS[d.getDay()]} ${d.getMonth() + 1}/${d.getDate()}`;
const HOURS = Array.from({ length: 24 }, (_, h) => h);

// 状态 + 本周事件 + todo 的读取；读取失败如实显示，不用本地缓存冒充。
export function useCalendarData(range) {
  const [status, setStatus] = useState(null),
    [week, setWeek] = useState(null),
    [todos, setTodos] = useState(null),
    [error, setError] = useState("");
  const from = range?.from,
    to = range?.to;
  const load = useCallback(async () => {
    try {
      const s = await request("/calendar/status");
      setStatus(s);
      setError("");
      if (!s.available) return;
      const [w, t] = await Promise.all([
        s.access.calendar === "authorized" && from
          ? request("/calendar/week", { from, to })
          : Promise.resolve(null),
        s.access.reminders === "authorized" ? request("/calendar/todos", {}) : Promise.resolve(null),
      ]);
      setWeek(w);
      setTodos(t);
    } catch (e) {
      setError(e.message || "读取失败");
    }
  }, [from, to]);
  useEffect(() => {
    load();
  }, [load]);
  return { status, week, todos, error, reload: load, setWeek, setTodos };
}

function Unavailable({ reason }) {
  return (
    <div className="cal-unavailable" role="status">
      <h2>日历暂不可用</h2>
      <p>{reason}</p>
      <p className="cal-muted">
        工作台不另存日程：权威数据在 macOS 日历与提醒事项。在装有工作台的 Mac 上运行时，这里会显示你的规划与 todo。
      </p>
    </div>
  );
}

const ACCESS_LABEL = {
  authorized: "已授权",
  notDetermined: "尚未授权",
  denied: "已拒绝",
  restricted: "受系统限制",
  writeOnly: "只有写入权限",
};

function Permission({ access, onGranted, notify }) {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const askable = access.calendar === "notDetermined" || access.reminders === "notDetermined";
  return (
    <div className="cal-permission">
      <ShieldCheck size={22} aria-hidden="true" />
      <div>
        <h2>首次使用需要授权</h2>
        <p>
          工作台需要读写 macOS 日历与提醒事项：只在“工作台”日历和“工作台”提醒事项列表中新建和修改（不存在时自动新建），其他日历只读显示，不会删除任何条目。
        </p>
        <p className="cal-muted">
          日历：{ACCESS_LABEL[access.calendar] || access.calendar} · 提醒事项：
          {ACCESS_LABEL[access.reminders] || access.reminders}
          {askable
            ? "。点击后系统会弹出授权对话框。"
            : "。请到“系统设置 → 隐私与安全性 → 日历 / 提醒事项”中允许工作台，再点刷新。"}
        </p>
        {error && (
          <p className="inline-error" role="alert">
            {error}
          </p>
        )}
        {askable && (
          <Button
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              setError("");
              try {
                const result = await request("/calendar/access", {});
                if (result.access.calendar === "authorized") notify("已获得日历权限");
                onGranted();
              } catch (e) {
                setError(e.message);
              } finally {
                setBusy(false);
              }
            }}
          >
            {busy ? "正在申请…" : "授权日历与提醒事项"}
          </Button>
        )}
      </div>
    </div>
  );
}

// 新建 / 修改规划块的对话框。
function BlockDialog({ draft, onClose, onSaved, notify, setNotice }) {
  const editing = !!draft.event;
  const [title, setTitle] = useState(draft.event?.title || ""),
    [date, setDate] = useState(draft.date),
    [start, setStart] = useState(draft.start),
    [end, setEnd] = useState(draft.end),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  async function submit(e) {
    e.preventDefault();
    setError("");
    if (!title.trim()) return setError("请写一句话");
    if (end <= start) return setError("结束时间需要晚于开始时间");
    setBusy(true);
    try {
      const payload = { title, start: localIso(date, start), end: localIso(date, end) };
      const result = editing
        ? await request("/calendar/blocks/update", {
            id: draft.event.id,
            expectedModified: draft.event.modified,
            ...payload,
          })
        : await request("/calendar/blocks/create", payload);
      if (result.conflict || !result.check.matches) {
        setNotice(result.message);
        notify(result.message, "warning");
      } else notify(result.message);
      onSaved(result.block);
    } catch (e) {
      // 结果未知：关闭对话框并刷新，以系统日历回读为准；其他错误留在对话框里。
      if (e.unknownResult) {
        setNotice(e.message);
        notify(e.message, "error");
        onSaved(null);
      } else setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Dialog title={editing ? "修改规划块" : "新建规划块"} onClose={() => !busy && onClose()}>
      <form className="asset-form" onSubmit={submit}>
        <p className="form-intro">
          {editing
            ? "保存前会核对日历应用里是否已被改过；已被改过时不写入，以回读为准。"
            : "写入 macOS“工作台”日历，写完回读核对；手机经 iCloud 同步后也能看到。"}
        </p>
        <label>
          一句话
          <input
            autoFocus
            required
            maxLength={200}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="这段时间做什么"
          />
        </label>
        <div className="form-row">
          <label>
            日期
            <input type="date" required value={date} onChange={(e) => setDate(e.target.value)} />
          </label>
          <label>
            开始
            <input type="time" required step={900} value={start} onChange={(e) => setStart(e.target.value)} />
          </label>
          <label>
            结束
            <input type="time" required step={900} value={end} onChange={(e) => setEnd(e.target.value)} />
          </label>
        </div>
        {error && (
          <p className="inline-error" role="alert">
            {error}
          </p>
        )}
        <div className="form-actions">
          <Button type="button" secondary disabled={busy} onClick={onClose}>
            取消
          </Button>
          <Button type="submit" disabled={busy}>
            {busy ? "正在写入…" : editing ? "保存修改" : "写入“工作台”日历"}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}

function DayColumn({ day, events, night, drag, onPointerDown, onEdit }) {
  const { timed } = eventsOfDay(events, day);
  const key = ymd(day);
  const pct = (m) => `${(m / DAY_MINUTES) * 100}%`;
  return (
    <div className="cal-day" data-date={key} role="group" aria-label={dayLabel(day)}>
      <div className="cal-lane" onPointerDown={(e) => onPointerDown(e, key)}>
        {HOURS.map((h) => (
          <span key={h} className="cal-hour-line" style={{ top: pct(h * 60) }} aria-hidden="true" />
        ))}
        {nightSegments(night).map(([a, b]) => (
          <div key={a} className="cal-night" style={{ top: pct(a), height: pct(b - a) }} aria-hidden="true">
            {a > 0 && <span>夜巡窗口 · 草稿</span>}
          </div>
        ))}
        {timed.map(({ event, top, bottom, column, columns }) => {
          const style = {
            top: pct(top),
            height: pct(bottom - top),
            left: `calc(${(column / columns) * 100}% + 2px)`,
            width: `calc(${100 / columns}% - 4px)`,
          };
          return event.workbench ? (
            <button
              key={event.id}
              type="button"
              className="cal-block"
              style={style}
              aria-label={`规划块 ${event.title} ${spanText(event)}，点击修改`}
              onClick={() => onEdit(event)}
            >
              <strong>{event.title}</strong>
              <span>{spanText(event)}</span>
            </button>
          ) : (
            <div
              key={event.id}
              className="cal-meeting"
              style={style}
              role="note"
              aria-label={`会议 ${event.title} ${spanText(event)}（${event.calendar}，只读）`}
            >
              <strong>{event.title}</strong>
              <span>
                {spanText(event)} · {event.calendar}
              </span>
            </div>
          );
        })}
        {drag?.date === key && (
          <div
            className="cal-ghost"
            style={{ top: pct(Math.min(drag.from, drag.to)), height: pct(Math.max(Math.abs(drag.to - drag.from), 15)) }}
            aria-hidden="true"
          >
            {hmOf(Math.min(drag.from, drag.to))}–{hmOf(Math.max(drag.from, drag.to, Math.min(drag.from, drag.to) + 15))}
          </div>
        )}
      </div>
    </div>
  );
}

function TodoItem({ item, onWrite }) {
  const [editing, setEditing] = useState(false),
    [due, setDue] = useState(toLocalInput(item.due)),
    // 写入进行中先显示点击后的状态；回读结果到达后整条按回读替换（冲突时回到回读值）。
    [pending, setPending] = useState(null);
  const checked = pending ?? item.completed;
  return (
    <li className={`todo-item ${checked ? "done" : ""}`}>
      <label className="todo-check">
        <input
          type="checkbox"
          checked={checked}
          disabled={pending !== null}
          aria-label={`完成 ${item.title}`}
          onChange={async (e) => {
            const next = e.target.checked;
            setPending(next);
            await onWrite(item, { completed: next });
            setPending(null);
          }}
        />
        <span className="todo-title">{item.title}</span>
      </label>
      <div className="todo-meta">
        {item.due && (
          <span className="todo-due">
            <BellRing size={13} aria-hidden="true" />
            提醒 {dueText(item.due)}
          </span>
        )}
        {!editing && (
          <button type="button" className="todo-link" onClick={() => setEditing(true)} aria-label={`设提醒 ${item.title}`}>
            {item.due ? "改提醒" : "设提醒"}
          </button>
        )}
      </div>
      {editing && (
        <div className="todo-due-form">
          <label>
            <span className="sr-only">{item.title} 的提醒时间</span>
            <input
              type="datetime-local"
              aria-label={`${item.title} 的提醒时间`}
              value={due}
              onChange={(e) => setDue(e.target.value)}
            />
          </label>
          <Button
            type="button"
            disabled={!due}
            onClick={async () => {
              if (await onWrite(item, { due: fromLocalInput(due) })) setEditing(false);
            }}
          >
            保存提醒
          </Button>
          {item.due && (
            <Button
              type="button"
              secondary
              onClick={async () => {
                if (await onWrite(item, { due: null })) setEditing(false);
              }}
            >
              清除提醒
            </Button>
          )}
          <Button type="button" secondary onClick={() => setEditing(false)}>
            取消
          </Button>
        </div>
      )}
    </li>
  );
}

function TodoPanel({ todos, access, notify, setNotice, reload }) {
  const [text, setText] = useState(""),
    [busy, setBusy] = useState(false),
    [items, setItems] = useState(todos?.reminders || null);
  useEffect(() => setItems(todos?.reminders || null), [todos]);
  // 写入后以回读为准替换这一条；冲突时同样以回读替换并提示。
  async function write(item, patch) {
    setBusy(true);
    try {
      const result = await request("/calendar/todos/update", {
        id: item.id,
        expectedModified: item.modified,
        ...patch,
      });
      setItems((list) => list.map((x) => (x.id === item.id ? result.reminder : x)));
      if (result.conflict || !result.check.matches) {
        setNotice(result.message);
        notify(result.message, "warning");
        return false;
      }
      notify(result.message);
      return true;
    } catch (e) {
      notify(e.message, "error");
      if (e.unknownResult) reload();
      return false;
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="cal-todo" aria-labelledby="cal-todo-title">
      <div className="cal-todo-head">
        <h2 id="cal-todo-title">todo · 工作台提醒事项</h2>
        <p>读写 macOS 提醒事项里的“工作台”列表，手机也能收到提醒。</p>
      </div>
      {access?.reminders !== "authorized" ? (
        <p className="cal-muted" role="status">
          {todos?.reason || `提醒事项${ACCESS_LABEL[access?.reminders] || "未授权"}，授权后显示。`}
        </p>
      ) : !items ? (
        <p className="cal-muted" role="status">
          正在读取提醒事项…
        </p>
      ) : (
        <>
          {items.length ? (
            <ul className="todo-list">
              {items.map((item) => (
                <TodoItem key={`${item.id}-${item.modified}`} item={item} onWrite={write} />
              ))}
            </ul>
          ) : (
            <p className="cal-muted">“工作台”列表里还没有 todo。</p>
          )}
          <form
            className="todo-add"
            onSubmit={async (e) => {
              e.preventDefault();
              if (!text.trim()) return;
              setBusy(true);
              try {
                const result = await request("/calendar/todos/create", { title: text });
                setItems((list) => [...list, result.reminder]);
                setText("");
                notify(result.message, result.check.matches ? "success" : "warning");
              } catch (err) {
                notify(err.message, "error");
                if (err.unknownResult) reload();
              } finally {
                setBusy(false);
              }
            }}
          >
            <label>
              <span className="sr-only">新 todo</span>
              <input
                aria-label="新 todo"
                maxLength={200}
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder="防止遗忘的一件事"
              />
            </label>
            <Button type="submit" disabled={busy || !text.trim()}>
              <Plus size={16} />
              添加到提醒事项
            </Button>
          </form>
        </>
      )}
    </section>
  );
}

export function CalendarPage({ state, notify }) {
  const [mode, setMode] = useState("week"),
    [anchor, setAnchor] = useState(() => startOfDay(new Date())),
    [draft, setDraft] = useState(null),
    [drag, setDrag] = useState(null),
    [notice, setNotice] = useState("");
  const first = mode === "week" ? startOfWeek(anchor) : startOfDay(anchor);
  const days = useMemo(() => dayList(first, mode === "week" ? 7 : 1), [first.getTime(), mode]);
  const range = useMemo(
    () => ({ from: days[0].toISOString(), to: addDays(days.at(-1), 1).toISOString() }),
    [days],
  );
  const { status, week, todos, error, reload } = useCalendarData(range);
  const scroller = useRef(null);
  const dragRef = useRef(null);
  const ready = status?.available && status.access.calendar === "authorized";
  useEffect(() => {
    // 首次显示时滚到早上 8 点附近。
    if (ready && scroller.current && !scroller.current.dataset.scrolled) {
      scroller.current.scrollTop = scroller.current.scrollHeight * (8 / 24);
      scroller.current.dataset.scrolled = "1";
    }
  }, [ready, week]);

  function minuteAt(e) {
    const rect = e.currentTarget.getBoundingClientRect();
    return snap(((e.clientY - rect.top) / rect.height) * DAY_MINUTES);
  }
  function onPointerDown(e, date) {
    if (e.button !== 0 || e.target.closest(".cal-block, .cal-meeting")) return;
    const lane = e.currentTarget;
    const at = minuteAt(e);
    dragRef.current = { date, from: at, to: at };
    setDrag(dragRef.current);
    lane.setPointerCapture?.(e.pointerId);
    const move = (ev) => {
      const rect = lane.getBoundingClientRect();
      const to = snap(((ev.clientY - rect.top) / rect.height) * DAY_MINUTES);
      dragRef.current = { ...dragRef.current, to };
      setDrag(dragRef.current);
    };
    const up = () => {
      lane.removeEventListener("pointermove", move);
      lane.removeEventListener("pointerup", up);
      lane.removeEventListener("pointercancel", up);
      const d = dragRef.current;
      dragRef.current = null;
      setDrag(null);
      if (!d) return;
      let a = Math.min(d.from, d.to),
        b = Math.max(d.from, d.to);
      if (b - a < 15) b = Math.min(DAY_MINUTES - 1, a + 60);
      if (a >= DAY_MINUTES) a = DAY_MINUTES - 60;
      setDraft({ date: d.date, start: hmOf(a), end: b >= DAY_MINUTES ? "23:59" : hmOf(b) });
    };
    lane.addEventListener("pointermove", move);
    lane.addEventListener("pointerup", up);
    lane.addEventListener("pointercancel", up);
  }

  const step = mode === "week" ? 7 : 1;
  const today = startOfDay(new Date());
  return (
    <section className="cal-page">
      <PageHeading page="calendar" />
      {error && (
        <p className="inline-error" role="alert">
          读取日历失败：{error}
        </p>
      )}
      {!status && !error && (
        <p className="cal-muted" role="status">
          正在连接本机日历小助手…
        </p>
      )}
      {status && !status.available && <Unavailable reason={status.reason} />}
      {status?.available &&
        (status.access.calendar !== "authorized" || status.access.reminders !== "authorized") && (
          <Permission access={status.access} onGranted={reload} notify={notify} />
        )}
      {notice && (
        <div className="cal-notice" role="alert">
          <span>{notice}</span>
          <button type="button" className="todo-link" onClick={() => setNotice("")}>
            知道了
          </button>
        </div>
      )}
      {status?.available && (
        <div className="cal-layout">
          <div className="cal-main">
            <div className="cal-toolbar">
              <div className="cal-toggle" role="group" aria-label="日历视图">
                <Button secondary aria-pressed={mode === "week"} onClick={() => setMode("week")}>
                  周
                </Button>
                <Button
                  secondary
                  aria-pressed={mode === "day"}
                  onClick={() => {
                    setMode("day");
                    setAnchor(today);
                  }}
                >
                  今天
                </Button>
              </div>
              <div className="cal-nav">
                <Button secondary aria-label={mode === "week" ? "上一周" : "前一天"} onClick={() => setAnchor(addDays(anchor, -step))}>
                  <ChevronLeft size={16} />
                </Button>
                <strong className="cal-range">
                  {mode === "week"
                    ? `${days[0].getMonth() + 1}/${days[0].getDate()} – ${days[6].getMonth() + 1}/${days[6].getDate()}`
                    : dayLabel(days[0])}
                </strong>
                <Button secondary aria-label={mode === "week" ? "下一周" : "后一天"} onClick={() => setAnchor(addDays(anchor, step))}>
                  <ChevronRight size={16} />
                </Button>
              </div>
              <div className="cal-actions">
                <Button secondary aria-label="刷新" onClick={reload}>
                  <RefreshCw size={16} />
                </Button>
                {ready && (
                  <Button
                    onClick={() => {
                      const now = new Date();
                      const at = snap(now.getHours() * 60 + now.getMinutes() + 30, 30);
                      const start = Math.min(at, DAY_MINUTES - 60);
                      setDraft({ date: ymd(mode === "day" ? days[0] : today), start: hmOf(start), end: hmOf(start + 60) });
                    }}
                  >
                    <CalendarPlus size={16} />
                    新建规划块
                  </Button>
                )}
              </div>
            </div>
            <ul className="cal-legend">
              <li className="lg-block">规划块（“工作台”日历，可改）</li>
              <li className="lg-meeting">其他日历的会议（只读）</li>
              <li className="lg-night">
                夜巡窗口 · 草稿 {state.night.time}–{state.night.end}
              </li>
              <li className="lg-milestone">项目里程碑：项目空间暂未提供里程碑数据（可选，尚未接入）</li>
            </ul>
            {!ready ? (
              <p className="cal-muted" role="status">
                {week?.reason || "日历授权后显示周视图。"}
              </p>
            ) : !week ? (
              <p className="cal-muted" role="status">
                正在读取日历…
              </p>
            ) : week.events === null || week.available === false ? (
              <p className="cal-muted" role="status">
                {week.reason}
              </p>
            ) : (
              <div className={`cal-grid ${mode}`} style={{ "--days": days.length }}>
                <div className="cal-heads">
                  <span className="cal-gutter" aria-hidden="true" />
                  {days.map((d) => {
                    const allDay = eventsOfDay(week.events, d).allDay;
                    return (
                      <div key={ymd(d)} className={`cal-day-head ${ymd(d) === ymd(today) ? "today" : ""}`}>
                        <strong>{dayLabel(d)}</strong>
                        {allDay.map((e) => (
                          <span key={e.id} className={`cal-allday ${e.workbench ? "mine" : ""}`}>
                            全天 · {e.title}
                          </span>
                        ))}
                      </div>
                    );
                  })}
                </div>
                <div className="cal-scroll" ref={scroller}>
                  <div className="cal-body">
                    <div className="cal-hours" aria-hidden="true">
                      {HOURS.map((h) => (
                        <span key={h} style={{ top: `${(h / 24) * 100}%` }}>
                          {String(h).padStart(2, "0")}:00
                        </span>
                      ))}
                    </div>
                    {days.map((d) => (
                      <DayColumn
                        key={ymd(d)}
                        day={d}
                        events={week.events}
                        night={state.night}
                        drag={drag}
                        onPointerDown={onPointerDown}
                        onEdit={(event) =>
                          setDraft({
                            event,
                            date: ymd(new Date(event.start)),
                            start: hm(new Date(event.start)),
                            end: hm(new Date(event.end)),
                          })
                        }
                      />
                    ))}
                  </div>
                </div>
                <p className="cal-muted cal-hint">在时间轴上按住拖动，拖出一个规划块；也可以点“新建规划块”。</p>
              </div>
            )}
          </div>
          <TodoPanel
            todos={todos}
            access={status.access}
            notify={notify}
            setNotice={setNotice}
            reload={reload}
          />
        </div>
      )}
      {draft && (
        <BlockDialog
          key={draft.event?.id || "new"}
          draft={draft}
          notify={notify}
          setNotice={setNotice}
          onClose={() => setDraft(null)}
          onSaved={() => {
            setDraft(null);
            reload();
          }}
        />
      )}
    </section>
  );
}

// 世界总览“时间安排”：今天的规划块与未完成 todo；不可用 / 未授权时如实说明。
export function HomeSchedule({ navigate }) {
  const range = useMemo(() => {
    const d = startOfDay(new Date());
    return { from: d.toISOString(), to: addDays(d, 1).toISOString() };
  }, []);
  const { status, week, todos, error } = useCalendarData(range);
  if (error) return <p className="schedule-note">读取日历失败：{error}</p>;
  if (!status) return <p className="schedule-note">正在读取日历…</p>;
  if (!status.available) return <p className="schedule-note">日历不可用：{status.reason}</p>;
  const blocks = (week?.events || []).filter((e) => e.workbench);
  const open = (todos?.reminders || []).filter((t) => !t.completed);
  return (
    <div className="home-plan">
      {status.access.calendar !== "authorized" || status.access.reminders !== "authorized" ? (
        <p className="schedule-note">
          日历与提醒事项尚未全部授权（日历：{ACCESS_LABEL[status.access.calendar]}；提醒事项：
          {ACCESS_LABEL[status.access.reminders]}），到日历页授权后这里显示今天的安排。
        </p>
      ) : null}
      {week?.events && (
        <div>
          <h3>今天的规划</h3>
          {blocks.length ? (
            <ul>
              {blocks.map((e) => (
                <li key={e.id}>
                  <span className="home-plan-time">{spanText(e)}</span>
                  {e.title}
                </li>
              ))}
            </ul>
          ) : (
            <p className="schedule-note">今天还没有规划块。</p>
          )}
        </div>
      )}
      {todos?.reminders && (
        <div>
          <h3>todo · {open.length}</h3>
          {open.length ? (
            <ul>
              {open.slice(0, 6).map((t) => (
                <li key={t.id}>
                  {t.due && <span className="home-plan-time">{dueText(t.due)}</span>}
                  {t.title}
                </li>
              ))}
            </ul>
          ) : (
            <p className="schedule-note">没有未完成的 todo。</p>
          )}
        </div>
      )}
    </div>
  );
}
