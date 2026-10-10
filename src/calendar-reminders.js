import { useCallback, useEffect, useRef, useState } from "react";
import { request } from "./api.js";

// App 拥有这一份临时快照；不写主库，也不申请权限。时钟/返回前台/显式刷新均补算。
export function useCalendarReminders() {
  const [calendarTodos, setTodos] = useState({ loaded: false, reminders: [] });
  const [calendarNow, setNow] = useState(Date.now);
  const generation = useRef(0);
  const publishCalendarTodos = useCallback((reminder) => {
    generation.current++;
    setTodos(previous => ({...previous, reminders: previous.reminders.some(x=>x.id===reminder.id) ? previous.reminders.map(x=>x.id===reminder.id?reminder:x) : [...previous.reminders,reminder]}));
    setNow(Date.now());
  }, []);
  const refreshCalendarTodos = useCallback(async () => {
    const id = ++generation.current;
    setNow(Date.now());
    try {
      const status = await request("/calendar/status");
      if (!status.available) {
        if (id === generation.current) setTodos({loaded:false,reminders:[],access:status.access,reason:status.reason,error:status.supported === false ? "" : status.reason || "日历小助手不可用"});
        return;
      }
      const authorized = status.access?.reminders === "authorized";
      const permissionError = ["denied", "restricted"].includes(status.access?.reminders)
        ? "提醒事项权限未授权或已变更，待处理状态待核实。" : "";
      const result = authorized ? await request("/calendar/todos", {})
        : { available: false, reminders: [], reason: permissionError };
      if (id === generation.current) setTodos({
        ...result, access: status.access, reminders: result.reminders || [],
        loaded: authorized && result.available !== false && Array.isArray(result.reminders),
        error: permissionError || (authorized && (result.available === false || !Array.isArray(result.reminders))
          ? result.reason || "提醒事项读取结果不完整" : ""),
      });
    } catch (error) {
      if (id === generation.current) setTodos({ loaded: false, reminders: [], error: error.message });
    }
  }, []);
  useEffect(() => {
    refreshCalendarTodos();
    const timer = window.setInterval(refreshCalendarTodos, 60000);
    const visible = () => { if (document.visibilityState === "visible") refreshCalendarTodos(); };
    window.addEventListener("focus", refreshCalendarTodos);
    document.addEventListener("visibilitychange", visible);
    return () => {
      generation.current++;
      window.clearInterval(timer);
      window.removeEventListener("focus", refreshCalendarTodos);
      document.removeEventListener("visibilitychange", visible);
    };
  }, [refreshCalendarTodos]);
  return { calendarTodos, calendarNow, refreshCalendarTodos, publishCalendarTodos };
}
