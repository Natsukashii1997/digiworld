// 日历页（生活区，路线 v3 5.2）：周视图 + 今天；在时间轴上拖出规划块并写一句话，写入 macOS“工作台”日历；
// 其他日历的会议只读；夜巡 v2 计划窗口只读展示；旁边是“工作台”提醒事项列表的 todo。
// 权威在 macOS 日历与提醒事项：每次写入后以服务端回读结果为准，冲突时提示并显示回读内容。
// 所有写入都来自用户点击；首次使用先说明需要的权限，点击后才申请。
import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { CalendarPlus, ChevronLeft, ChevronRight, RefreshCw, ShieldCheck, BellRing, Plus, Check, Trash2 } from "lucide-react";
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
  todoIsDue,
} from "./calendar.js";
import "./calendar.css";
import "./calendar-v14.css";
import "./calendar-v16.css";
import { PageChoices } from "./PageChoices.jsx";
import { nightV2Of } from "./night-v2-model.js";

const WEEKDAYS = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"];
const dayLabel = (d) => `${WEEKDAYS[d.getDay()]} ${d.getMonth() + 1}/${d.getDate()}`;
const HOURS = Array.from({ length: 24 }, (_, h) => h);

// 状态 + 本周事件 + todo 的读取；读取失败如实显示，不用本地缓存冒充。
export function useCalendarData(range) {
  const [status, setStatus] = useState(null),
    [week, setWeek] = useState(null),
    [error, setError] = useState("");
  const generation = useRef(0);
  const from = range?.from,
    to = range?.to;
  const load = useCallback(async () => {
    const id = ++generation.current;
    try {
      const s = await request("/calendar/status");
      if (id !== generation.current) return;
      setStatus(s);
      setError("");
      if (!s.available) { setWeek(null); return; }
      const w = s.access.calendar === "authorized" && from ? await request("/calendar/week", {from,to}) : null;
      if (id !== generation.current) return;
      setWeek(w);
    } catch (e) {
      if (id === generation.current) { setStatus(null); setWeek(null); setError(e.message || "读取失败"); }
    }
  }, [from, to]);
  useEffect(() => {
    load();
    return () => { generation.current++; };
  }, [load]);
  return { status, week, error, reload: load };
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

export function Permission({ access, onGranted, notify }) {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const askable = access.calendar === "notDetermined" || access.reminders === "notDetermined";
  return (
    <div className="cal-permission">
      <ShieldCheck size={22} aria-hidden="true" />
      <div>
        <h2>首次使用需要授权</h2>
        <p>
          工作台需要读写 macOS 日历与提醒事项：只在“工作台”日历和“工作台”提醒事项列表中新建和修改（不存在时自动新建）；“工作台”规划块可经二次确认删除，其他日历只读显示，提醒事项不提供删除。
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
  const host = useRef(null);
  useLayoutEffect(() => {
    const anchor = draft.anchor, root = host.current;
    if (!anchor || !root) return;
    const card = root.querySelector(".modal");
    anchor.classList.add("cal-editing");
    const place = () => {
      const a = anchor.getBoundingClientRect(), box = card.getBoundingClientRect();
      const right = a.right + 12;
      const left = right + box.width <= innerWidth - 12 ? right : a.left - box.width - 12;
      root.style.setProperty("--edit-left", `${Math.max(12, Math.min(left, innerWidth - box.width - 12))}px`);
      root.style.setProperty("--edit-top", `${Math.max(12, Math.min(a.top, innerHeight - box.height - 12))}px`);
    };
    const observer = new ResizeObserver(place);
    observer.observe(card); observer.observe(anchor);
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    place();
    return () => {
      anchor.classList.remove("cal-editing"); observer.disconnect();
      window.removeEventListener("resize", place); window.removeEventListener("scroll", place, true);
    };
  }, [draft.anchor]);
  const [title, setTitle] = useState(draft.event?.title || ""),
    [notes, setNotes] = useState(draft.event?.notes || ""),
    [date, setDate] = useState(draft.date),
    [endDate, setEndDate] = useState(draft.endDate || draft.date),
    [allDay, setAllDay] = useState(draft.event?.allDay || false),
    [start, setStart] = useState(draft.start),
    [end, setEnd] = useState(draft.end),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [deleteConfirm, setDeleteConfirm] = useState(false),
    [deleteUnknown, setDeleteUnknown] = useState(false);
  async function submit(e) {
    e.preventDefault();
    setError("");
    if (!title.trim()) return setError("请写一句话");
    if (endDate < date || (!allDay && endDate === date && end <= start))
      return setError("结束时间需要晚于开始时间");
    setBusy(true);
    try {
      const exclusiveEnd = allDay ? ymd(addDays(new Date(`${endDate}T12:00:00`), 1)) : endDate;
      const payload = {
        title, start: localIso(date, allDay ? "00:00" : start),
        end: localIso(exclusiveEnd, allDay ? "00:00" : end),
        ...(draft.event?.notesOverflow ? {} : { notes }),
        ...(allDay || draft.event?.allDay ? { allDay } : {}),
      };
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
  async function checkDeleted() {
    try {
      const found = await request("/calendar/blocks/check", { id: draft.event.id });
      const message = found.state === "absent"
        ? "回读确认该规划块目前已不在日历；无法判定是否由本次操作造成。"
        : "回读仍见该规划块，未再次删除。请刷新后重新打开并确认。";
      setNotice(message);
      notify(message, found.state === "absent" ? "info" : "warning");
      onSaved(null);
    } catch (e) {
      setDeleteUnknown(true);
      setError(`删除结果仍未知：${e.message}。先在系统日历核对，勿重复删除。`);
    }
  }
  async function deleteBlock() {
    if (!editing || !deleteConfirm || busy || deleteUnknown) return;
    setError(""); setBusy(true);
    try {
      const result = await request("/calendar/blocks/delete", {
        id: draft.event.id, expectedModified: draft.event.modified, confirmed: true,
      });
      setNotice(result.message);
      notify(result.message, result.conflict ? "warning" : "info");
      onSaved(null);
    } catch (e) {
      if (e.operationNotStarted || e.status === 400 || e.status === 409) {
        setError(e.message);
      } else {
        setDeleteUnknown(true);
        setError(`${e.message}。正在按条目标识独立核对，勿重复删除。`);
        await checkDeleted();
      }
    } finally { setBusy(false); }
  }
  return (
    <div ref={host} className={draft.anchor ? "cal-anchored-editor" : "cal-new-editor"}><Dialog recoverFocus title={editing ? "修改规划块" : "新建规划块"} onClose={() => !busy && onClose()}>
      <form className="asset-form calendar-block-form" onSubmit={submit}>
        <p className="cal-editor-eyebrow">PLAN BLOCK · {draft.event?.calendar || "工作台"}</p>
        <p className="form-intro">
          {editing
            ? "保存前会核对日历应用里是否已被改过；已被改过时不写入，以回读为准。"
            : "写入 macOS“工作台”日历，写完回读核对；手机经 iCloud 同步后也能看到。"}
        </p>
        <label>
          一句话
          <textarea
            rows={1}
            ref={(el) => { if (el) { el.style.height = "auto"; el.style.height = `${el.scrollHeight + 2}px`; } }}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.nativeEvent.isComposing && e.nativeEvent.keyCode !== 229) {
                e.preventDefault();
                if (!busy) e.currentTarget.form.requestSubmit();
              }
            }}
            required
            maxLength={200}
            value={title}
            onChange={(e) => setTitle(e.target.value.replace(/[\r\n]/g, ""))}
            placeholder="这段时间做什么"
          />
        </label>
        <label>
          备注（可留空）
          <textarea rows={2} maxLength={2000} value={notes} disabled={draft.event?.notesOverflow === true} onChange={(e) => setNotes(e.target.value)} placeholder="补充这段规划的说明" />
        </label>
        {draft.event?.notesOverflow && <p className="form-intro" role="note">系统日历中的现有备注超过 2000 字。这里不读取或覆盖该备注；请在系统日历中缩短后再编辑。</p>}
        <PageChoices label="规划块时段类型" className="cal-toggle"
          choices={[["timed", "指定时间"], ["all-day", "全天"]]}
          value={allDay ? "all-day" : "timed"} onChange={(value) => setAllDay(value === "all-day")} />
        <div className="form-row">
          <label>
            日期
            <input type="date" required value={date} onChange={(e) => {
              if (endDate === date) setEndDate(e.target.value);
              setDate(e.target.value);
            }} />
          </label>
          <label>
            截止日
            <input type="date" required min={date} value={endDate} onChange={(e) => setEndDate(e.target.value)} />
          </label>
          {!allDay && <label>
            开始
            <input type="time" required step={900} value={start} onChange={(e) => setStart(e.target.value)} />
          </label>}
          {!allDay && <label>
            结束
            <input type="time" required step={900} value={end} onChange={(e) => setEnd(e.target.value)} />
          </label>}
        </div>
        {allDay && <p className="form-intro">截止日包含当天；写入日历时使用次日零点作为结束边界。</p>}
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
        {editing && draft.event.modified === null && <p className="form-intro" role="note">系统日历没有提供这条规划块的修改版本，无法安全删除。请在系统日历中核对后处理。</p>}
        {editing && draft.event.modified !== null && <div className="cal-delete-zone">
          {deleteUnknown ? <Button type="button" secondary disabled={busy} onClick={checkDeleted}>核对删除结果</Button>
            : deleteConfirm ? <>
              <p role="note">将删除“工作台”规划块「{draft.event.title}」· {spanText(draft.event)}。此操作不能撤销，请再次确认。</p>
              <div className="form-actions"><Button type="button" secondary disabled={busy} onClick={() => setDeleteConfirm(false)}>取消删除</Button><Button type="button" className="cal-delete-confirm" disabled={busy} onClick={deleteBlock}>确认删除规划块</Button></div>
            </> : <Button type="button" secondary className="cal-delete-trigger" disabled={busy} onClick={() => setDeleteConfirm(true)}><Trash2 size={16} aria-hidden="true" />删除规划块</Button>}
        </div>}
      </form>
    </Dialog></div>
  );
}

// 只在完整内容实际放得下时显示：先试“标题 + 时间”，放不下再试只放标题，仍放不下就不显示文字；
// 测量使用当前字体与块的真实尺寸。
const TIME_FONT = '500 10px ui-monospace, "SF Mono", Menlo, Consolas, monospace';
function EventMarker({ event, style }) {
  const marker = useRef(null), [fit, setFit] = useState("none");
  const time = `${spanText(event)}${event.calendar ? ` · ${event.calendar}` : ""}`;
  useLayoutEffect(() => {
    const el = marker.current;
    let active = true;
    const fits = (withTime) => {
      const css = getComputedStyle(el.querySelector(".cal-event-title"));
      const probe = document.createElement("span");
      Object.assign(probe.style, {
        position: "fixed", visibility: "hidden", pointerEvents: "none", display: "block",
        left: "0", top: "0", width: `${Math.max(0, el.clientWidth - 11)}px`,
        font: css.font, lineHeight: css.lineHeight, letterSpacing: css.letterSpacing,
        textWrap: css.textWrap, whiteSpace: "normal", overflowWrap: "anywhere",
      });
      probe.textContent = event.title;
      if (withTime) {
        const small = document.createElement("small");
        Object.assign(small.style, { display: "block", marginTop: "2px", font: TIME_FONT, lineHeight: "1.3", overflowWrap: "anywhere" });
        small.textContent = time;
        probe.append(small);
      }
      document.body.append(probe);
      const height = probe.getBoundingClientRect().height;
      const fitsWidth = probe.scrollWidth <= probe.clientWidth + 0.5;
      probe.remove();
      return el.clientWidth > 11 && fitsWidth && height <= el.clientHeight - 8;
    };
    const measure = () => {
      if (!active) return;
      setFit(fits(true) ? "full" : fits(false) ? "title" : "none");
    };
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    measure();
    document.fonts.ready.then(measure);
    return () => { active = false; observer.disconnect(); };
  }, [event.title, time]);
  return <div ref={marker} data-event-id={event.id}
    className={`cal-event-marker ${event.workbench ? "mine" : "readonly"}`}
    aria-hidden="true" style={style}>
    <span className="cal-event-title" hidden={fit === "none"}>{event.title}</span>
    <small className="cal-event-time" hidden={fit !== "full"}>{time}</small>
  </div>;
}

function DayColumn({ day, events, night, drag, now, onPointerDown, onEvent, onChoose }) {
  const { timed } = eventsOfDay(events, day);
  const key = ymd(day),
    pct = (m) => `${(m / DAY_MINUTES) * 100}%`;
  const lane = useRef(null), gesture = useRef(null), [laneHeight, setLaneHeight] = useState(0);
  useLayoutEffect(() => {
    const el = lane.current, observer = new ResizeObserver(() => setLaneHeight(el.clientHeight));
    observer.observe(el);
    setLaneHeight(el.clientHeight);
    return () => observer.disconnect();
  }, []);
  // 相交的44px命中范围合并成一个入口，避免短块或多列重叠块的透明按钮互相遮盖。
  const hits = [];
  for (const entry of [...timed].sort((a, b) => a.top - b.top)) {
    const center = (entry.top + entry.bottom) / 2 / DAY_MINUTES * laneHeight;
    const size = Math.max(44, (entry.bottom - entry.top) / DAY_MINUTES * laneHeight);
    const top = Math.max(0, Math.min(laneHeight - size, center - size / 2));
    const last = hits.at(-1);
    if (last && top <= last.bottom) {
      last.bottom = Math.max(last.bottom, top + size);
      last.entries.push(entry);
    } else hits.push({ top, bottom: top + size, entries: [entry] });
  }
  const rects = (entries) => entries.map(({ event }) => ({
    event, rect: [...lane.current.querySelectorAll(".cal-event-marker")]
      .find((el) => el.dataset.eventId === event.id).getBoundingClientRect(),
  }));
  const contains = (r, x, y) => x >= r.left && x <= r.right && y >= r.top && y <= r.bottom;
  function select(e, entries) {
    if (gesture.current?.moved) { gesture.current = null; return; }
    const positions = rects(entries);
    const hit = positions.find(({ rect }) => contains(rect, e.clientX, e.clientY)) ||
      positions.reduce((best, item) => {
        const distance = ({ rect: r }) => Math.hypot(Math.max(r.left - e.clientX, 0, e.clientX - r.right), Math.max(r.top - e.clientY, 0, e.clientY - r.bottom));
        return distance(item) < distance(best) ? item : best;
      });
    e.currentTarget.focus({ preventScroll: true });
    gesture.current = null;
    onEvent(hit.event, key);
  }
  return (
    <div className={`cal-day ${key === ymd(now) ? "today" : ""}`} data-date={key} role="group" aria-label={dayLabel(day)}>
      <div ref={lane} className="cal-lane" onPointerDown={(e) => onPointerDown(e, key)}>
        {HOURS.map((h) => (
          <span key={h} className="cal-hour-line" style={{ top: pct(h * 60) }} aria-hidden="true" />
        ))}
        {nightSegments(night).map(([a, b]) => (
          <div
            key={a}
            className="cal-night"
            style={{ top: pct(a), height: pct(b - a) }}
            aria-hidden="true"
          >{b-a>=60&&<span>夜巡窗口<small>{hmOf(a)}–{hmOf(b)}</small></span>}</div>
        ))}
        {timed.map(({ event, top, bottom, column, columns }) => (
          <EventMarker key={event.id} event={event}
            style={{
              top: pct(top),
              height: pct(bottom - top),
              left: `calc(${(column / columns) * 100}% + 2px)`,
              width: `max(1px, calc(${100 / columns}% - 4px))`,
            }}
          />
        ))}
        {laneHeight > 0 && hits.map((hit) => (
          <button key={hit.entries.map(({ event }) => event.id).join("/")}
            type="button" className="cal-marker-hit"
            aria-label={`时间轴 ${dayLabel(day)}：${hit.entries.map(({ event }) => event.title).join("；")}`}
            style={{ top: hit.top, height: hit.bottom - hit.top }}
            onPointerDown={(e) => {
              e.stopPropagation();
              if (e.button !== 0) return;
              const onMarker = rects(hit.entries).some(({ rect }) => contains(rect, e.clientX, e.clientY));
              gesture.current = { x: e.clientX, y: e.clientY, pointerId: e.pointerId, onMarker, moved: false };
              e.currentTarget.setPointerCapture(e.pointerId);
            }}
            onPointerMove={(e) => {
              const start = gesture.current;
              if (!start || start.onMarker || start.moved || Math.hypot(e.clientX - start.x, e.clientY - start.y) < 4) return;
              start.moved = true;
              onPointerDown({ button: 0, target: lane.current, currentTarget: lane.current,
                clientY: start.y, pointerId: start.pointerId }, key, e);
            }}
            onClick={(e) => e.detail === 0 ? (hit.entries.length === 1 ? onEvent(hit.entries[0].event, key) : onChoose({ events: hit.entries.map(x => x.event), date: key })) : select(e, hit.entries)}
          ><span className="sr-only">打开时间轴事件；重叠事件可逐项选择</span></button>
        ))}
        {key === ymd(now) && (
          <div
            className="cal-current-line"
            style={{ top: pct(now.getHours() * 60 + now.getMinutes()) }}
            aria-hidden="true"
          />
        )}
        {drag?.date === key && (
          <div
            className="cal-ghost"
            aria-hidden="true"
            style={{
              top: pct(Math.min(drag.from, drag.to)),
              height: pct(Math.max(Math.abs(drag.to - drag.from), 15)),
            }}
          />
        )}
      </div>
    </div>
  );
}


function TodoItem({ item, onWrite, now, disabled }) {
  const [editing, setEditing] = useState(false), [due, setDue] = useState(toLocalInput(item.due)), [pending, setPending] = useState(null);
  const checked = pending ?? item.completed, isDue = todoIsDue(item, now);
  return <li className={`todo-item ${checked ? "done" : ""} ${isDue ? "due" : ""}`}>
    <label className="todo-check">
      <input type="checkbox" checked={checked} disabled={disabled || pending !== null} aria-label={`完成 ${item.title}`} onChange={async e => {setPending(e.target.checked);await onWrite(item,{completed:e.target.checked});setPending(null);}}/>
      <span className="cal-check-box" aria-hidden="true">{checked && <Check size={12}/>}</span>
    </label>
    <button className="todo-link todo-time-edit" type="button" disabled={disabled} aria-label={`设提醒 ${item.title}`} onClick={()=>{setDue(toLocalInput(item.due));setEditing({...item});}}>
      <span className="todo-main"><span className="todo-title">{item.title}</span>{!checked&&<span className="todo-due-text">{isDue && <span className="cal-due-dot" aria-hidden="true"/>}{isDue&&"已到点 · "}<BellRing size={11}/>{item.due ? (item.dueHasTime === false ? dueText(item.due).split(" ")[0] : dueText(item.due)) : "未设时间"}</span>}</span>
    </button>
    {editing && <Dialog recoverFocus title={`提醒时间 · ${item.title}`} onClose={()=>!disabled&&setEditing(false)}>
      <form className="todo-due-form" onSubmit={async e=>{e.preventDefault();if(await onWrite(editing,{due:fromLocalInput(due)}))setEditing(false);}}>
        <label>提醒时间<input type="datetime-local" aria-label={`提醒时间 ${item.title}`} value={due} onChange={e=>setDue(e.target.value)} required/></label>
        <p className="cal-muted">仅工作台到点标记；不新增系统闹钟。已有条目的旧闹钟保持原样。</p>
        <div className="form-actions"><Button type="button" secondary disabled={disabled} onClick={()=>setEditing(false)}>取消</Button>{item.due&&<Button type="button" secondary disabled={disabled} onClick={async()=>{if(await onWrite(editing,{due:null}))setEditing(false);}}>清除提醒</Button>}<Button type="submit" disabled={disabled || !due}>保存提醒</Button></div>
      </form>
    </Dialog>}
  </li>;
}

function TodoPanel({ todos, access, notify, setNotice, reload, now, onRead }) {
  const [text, setText] = useState(""),
    [busy, setBusy] = useState(false);
  const items = access?.reminders === "authorized" && todos?.loaded && !todos.error ? todos.reminders : null;
  // 写入后以回读为准替换这一条；冲突时同样以回读替换并提示。
  async function write(item, patch) {
    setBusy(true);
    try {
      const result = await request("/calendar/todos/update", {
        id: item.id,
        expectedModified: item.modified,
        ...patch,
      });
      onRead(result.reminder);
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
        <h2 id="cal-todo-title"><span className="cal-en">TODO</span>TodoList <b>{items ? items.filter(x=>!x.completed).length : "—"}</b><small className="cal-todo-count-label">未完成</small></h2>
      </div>
      {access?.reminders !== "authorized" ? (
        <p className="cal-muted" role="status">
          {todos?.reason || `提醒事项${ACCESS_LABEL[access?.reminders] || "未授权"}，授权后显示。`}
        </p>
      ) : !items ? (
        <p className="cal-muted" role="status">
          {todos?.error ? "读取失败，点击刷新重试。" : todos?.reason || "正在读取提醒事项…"}
        </p>
      ) : (
        <>
          {items.length ? (
            <ul className="todo-list">
              {items.map((item) => (
                <TodoItem key={item.id} item={item} onWrite={write} now={now} disabled={busy} />
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
                onRead(result.reminder);
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
                placeholder="别忘了的一件事……"
              />
            </label>
            <Button type="submit" secondary aria-label="添加到提醒事项" disabled={busy || !text.trim()}>
              <Plus size={16} />
            </Button>
          </form>
        </>
      )}
    </section>
  );
}

export function CalendarPage({ state, notify, calendarTodos, calendarNow, refreshCalendarTodos, publishCalendarTodos }) {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 60000);
    return () => window.clearInterval(timer);
  }, []);
  const [narrow, setNarrow] = useState(
    () => typeof window !== "undefined" && window.matchMedia("(max-width:900px)").matches,
  );
  const [selectedDay, setSelectedDay] = useState(() => ymd(new Date())),
    [eventDetail, setEventDetail] = useState(null), [eventChoices,setEventChoices] = useState(null), [help,setHelp] = useState(false);
  useEffect(() => {
    const media = window.matchMedia("(max-width:900px)");
    const change = () => setNarrow(media.matches);
    media.addEventListener("change", change);
    return () => media.removeEventListener("change", change);
  }, []);
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
  const { status, week, error, reload: reloadWeek } = useCalendarData(range);
  const reload = () => { reloadWeek(); refreshCalendarTodos(); };
  const scroller = useRef(null);
  const dragRef = useRef(null);
  const access = status?.access;
  const ready = status?.available && access?.calendar === "authorized";
  useEffect(() => {
    // 首次显示时滚到早上 8 点附近。
    if (ready && scroller.current && !scroller.current.dataset.scrolled) {
      scroller.current.scrollTop = scroller.current.scrollHeight * (8 / 24);
      const label = scroller.current.querySelectorAll(".cal-hours span")[8];
      const top = scroller.current.getBoundingClientRect().top + scroller.current.clientTop + 4;
      if (label) scroller.current.scrollTop -= Math.max(0, top - label.getBoundingClientRect().top);
      scroller.current.dataset.scrolled = "1";
    }
  }, [ready, week]);

  function minuteAt(e) {
    const rect = e.currentTarget.getBoundingClientRect();
    return snap(((e.clientY - rect.top) / rect.height) * DAY_MINUTES);
  }
  function onPointerDown(e, date, currentPointer) {
    if (e.button !== 0 || e.target.closest(".cal-block, .cal-meeting, .cal-event-marker")) return;
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
    if (currentPointer) move(currentPointer);
  }

  const step = mode === "week" ? 7 : 1;
  const today = startOfDay(now);
  // 选中的一天：优先用户选的；不在当前范围时落到今天，再落到范围第一天。
  const activeKey = days.some((d) => ymd(d) === selectedDay)
    ? selectedDay
    : days.some((d) => ymd(d) === ymd(today))
      ? ymd(today)
      : ymd(days[0]);
  const activeDay = days.find((d) => ymd(d) === activeKey);
  const shownDays = narrow && mode === "week" ? [activeDay] : days;
  const rangeText =
    mode === "week"
      ? `${days[0].getMonth() + 1}/${days[0].getDate()} – ${days[6].getMonth() + 1}/${days[6].getDate()}`
      : dayLabel(days[0]);
  const isoThursday = new Date(Date.UTC(anchor.getFullYear(), anchor.getMonth(), anchor.getDate()));
  isoThursday.setUTCDate(isoThursday.getUTCDate() + 4 - (isoThursday.getUTCDay() || 7));
  const weekNumber = Math.ceil(
    ((isoThursday - new Date(Date.UTC(isoThursday.getUTCFullYear(), 0, 1))) / 86400000 + 1) / 7,
  );
  function openEvent(event, date) {
    setEventChoices(null);
    if (event.workbench) editEvent(event, date); else setEventDetail(event);
  }
  const editEvent = (event, selectedDate) =>
    setDraft({
      event,
      anchor: [...document.querySelectorAll(".calendar-v16 [data-event-id]")].find(el => el.dataset.eventId === event.id && (!selectedDate || el.closest("[data-date]")?.dataset.date === selectedDate)) || [...document.querySelectorAll(".calendar-v16 [data-event-id]")].find(el => el.dataset.eventId === event.id),
      date: ymd(new Date(event.start)),
      endDate: ymd(event.allDay ? addDays(new Date(event.end), -1) : new Date(event.end)),
      start: hm(new Date(event.start)),
      end: hm(new Date(event.end)),
    });
  return (
    <section className="cal-page calendar-v14 calendar-v16">
      <PageHeading page="calendar" help={<button className="page-help" aria-label="这页怎么用" onClick={()=>setHelp(true)}>?</button>} />
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

      {notice && (
        <div className="cal-notice" role="alert">
          <span>{notice}</span>
          <button type="button" className="todo-link" onClick={() => setNotice("")}>
            知道了
          </button>
        </div>
      )}
      {status?.available && (
        <>
          <div className="cal-head">
            <div className="cal-bar">
              <div className="calendar-mast">
                <p>WEEK {weekNumber} · {rangeText}</p>
                <h2><b>{anchor.getFullYear()}</b> 年 <b>{anchor.getMonth() + 1}</b> 月</h2>
              </div>
              <div className="cal-tools"><PageChoices
                label="日历视图"
                className="cal-toggle"
                choices={[
                  ["week", "周"],
                  ["day", "今天"],
                ]}
                value={mode}
                onChange={(value) => {
                  setMode(value);
                  if (value === "day") setAnchor(today);
                }}
              />
              <div className="cal-nav">
                <Button
                  secondary
                  aria-label={mode === "week" ? "上一周" : "前一天"}
                  onClick={() => setAnchor(addDays(anchor, -step))}
                >
                  <ChevronLeft size={16} />
                </Button>
                <Button
                  secondary
                  aria-label={mode === "week" ? "下一周" : "后一天"}
                  onClick={() => setAnchor(addDays(anchor, step))}
                >
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
                      setDraft({
                        date: ymd(mode === "day" ? days[0] : today),
                        start: hmOf(start),
                        end: hmOf(start + 60),
                      });
                    }}
                  >
                    <CalendarPlus size={16} />
                    新建规划块
                  </Button>
                )}
              </div></div>
            </div>
          </div>
          {(access?.calendar !== "authorized" || access?.reminders !== "authorized") && <Permission access={access} onGranted={reload} notify={notify}/>}
          {(ready || access?.reminders === "authorized") && <TodoPanel todos={calendarTodos} access={access} notify={notify} setNotice={setNotice} reload={reload} now={calendarNow} onRead={publishCalendarTodos}/>}
          {calendarTodos?.error && <p className="inline-error" role="alert">提醒事项读取失败：{calendarTodos.error}</p>}
          <div className="cal-layout">
          <div className="cal-main">
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
              <>
                {narrow && mode === "week" && <div className="cal-mobile-dates"><Button secondary aria-label="前一天" onClick={()=>{const d=addDays(activeDay,-1);setSelectedDay(ymd(d));if(!days.some(x=>ymd(x)===ymd(d)))setAnchor(d);}}><ChevronLeft size={16}/></Button><span>{dayLabel(activeDay)}</span><Button secondary aria-label="后一天" onClick={()=>{const d=addDays(activeDay,1);setSelectedDay(ymd(d));if(!days.some(x=>ymd(x)===ymd(d)))setAnchor(d);}}><ChevronRight size={16}/></Button></div>}
                <div className={`cal-grid ${mode}`} style={{ "--days": shownDays.length }}>
                  <div className="cal-heads">
                    <span className="cal-gutter" aria-hidden="true" />
                    {!narrow && mode === "week" ? (
                      <PageChoices
                        label="选择日历日期"
                        className="cal-head-days"
                        choices={shownDays.map((d) => [
                          ymd(d),
                          <>
                            <span aria-hidden="true">{WEEKDAYS[d.getDay()]}</span>
                            <strong aria-hidden="true" className={ymd(d) === ymd(today) ? "today" : ""}>
                              {d.getDate()}
                            </strong>
                            <span className="sr-only">{dayLabel(d)}</span>
                          </>,
                        ])}
                        value={activeKey}
                        onChange={setSelectedDay}
                      />
                    ) : (
                      shownDays.map((d) => (
                        <div
                          key={ymd(d)}
                          className={`cal-day-head ${ymd(d) === ymd(today) ? "today" : ""}`}
                        >
                          <span>{WEEKDAYS[d.getDay()]}</span>
                          <strong>{d.getDate()}</strong>
                        </div>
                      ))
                    )}
                  </div>
                  <div className="cal-allday-row">
                    <span className="cal-gutter cal-allday-label">全天</span>
                    {shownDays.map((d) => (
                      <div className="cal-allday-cell" key={ymd(d)}>
                        {eventsOfDay(week.events, d).allDay.map((event) => (
                          <button
                            key={event.id}
                            type="button"
                            data-event-id={event.id}
                            className={`cal-allday-chip ${event.workbench ? "mine" : ""}`}
                            aria-label={`全天行 ${dayLabel(d)}：${event.title}`}
                            onClick={() => openEvent(event, ymd(d))}
                          >
                            {event.title}
                          </button>
                        ))}
                      </div>
                    ))}
                  </div>
                  <div
                    className="cal-scroll"
                    ref={scroller}
                    tabIndex={0}
                    role="region"
                    aria-label="24小时时间轴"
                  >
                    <div className="cal-body">
                      <div className="cal-hours" aria-hidden="true">
                        {HOURS.map((h) => (
                          <span key={h} style={{ top: `${(h / 24) * 100}%` }}>
                            {String(h).padStart(2, "0")}:00
                          </span>
                        ))}
                      </div>
                      {shownDays.map((d) => (
                        <DayColumn
                          key={ymd(d)}
                          day={d}
                          events={week.events}
                          night={nightV2Of(state).window}
                          drag={drag}
                          now={now}
                          onPointerDown={onPointerDown}
                          onEvent={openEvent}
                          onChoose={setEventChoices}
                        />
                      ))}
                    </div>
                  </div>
                </div>
                {drag && (
                  <p className="cal-muted" role="status">
                    正在选择 {drag.date} · {hmOf(Math.min(drag.from, drag.to))}–
                    {hmOf(Math.max(drag.from, drag.to, Math.min(drag.from, drag.to) + 15))}
                  </p>
                )}
              </>
            )}
          </div>

          </div>
        </>
      )}
      {help && <Dialog recoverFocus title="日历怎么用" onClose={()=>setHelp(false)}><div className="cal-help"><p>拖动时间轴新建规划块；点块或键盘 Enter 打开详情，Esc 关闭。橙色规划块可编辑、写备注，并可二次确认删除；青色其他日历只读；紫色虚线是夜巡 v2 计划窗口；红线标记本机当前时间。</p><p>日历与 TodoList 的权威数据在 macOS 日历与提醒事项。只修改“工作台”条目，删除仅限“工作台”规划块，写后回读核对。到点未完成事项进入待处理主线，工作台打开或返回前台时补算；不弹提醒卡。</p><p>新建和改期只保存到期时间，不新增系统闹钟。旧条目已有的系统闹钟保持原样。没有具体时间的事项不判定已到点。</p></div></Dialog>}
      {eventDetail && <Dialog recoverFocus title="日程详情" onClose={()=>setEventDetail(null)}><div className="cal-detail"><span className="cal-en">READ ONLY · 只读</span><h2>{eventDetail.title}</h2><p>{eventDetail.calendar} · {ymd(new Date(eventDetail.start))} · {spanText(eventDetail)}</p><p>{eventDetail.allDay ? `结束边界 ${ymd(new Date(eventDetail.end))}（不含）` : `结束 ${ymd(new Date(eventDetail.end))} ${hm(new Date(eventDetail.end))}`}</p></div></Dialog>}
      {eventChoices && <Dialog recoverFocus title="选择重叠事件" onClose={()=>setEventChoices(null)}><div className="cal-choices">{eventChoices.events.map(event=><Button key={event.id} secondary onClick={()=>openEvent(event,eventChoices.date)}>{event.title} · {spanText(event)} · {event.calendar}{!event.workbench&&" · 只读"}</Button>)}</div></Dialog>}
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
