import { flyData } from './data-flight.js';
import React, { useEffect, useRef, useState } from "react";
import { Button } from "./components.jsx";
import { request } from "./api.js";
import { savepointThresholds } from "./settings-v16.js";
import { RosterReadonlyNote } from "./roster-readonly.jsx";
// 两入口复用同一个表单和服务；不另存设置。表单草稿保留开启时 revision，冲突由服务拒绝。
// 项目名册只读（#71）：扫描目录、手工登记已下线，这里只保留停滞与未存档提醒两项显示偏好。
export function ProjectSettings({ state, adoptState, notify, onBusyChange }) {
  const c = state.connections || {},
    thresholds = savepointThresholds(c);
  const [days, setDays] = useState(String(c.projectStallDays || 7)),
    [warn, setWarn] = useState(String(thresholds.warn)),
    [danger, setDanger] = useState(String(thresholds.danger)),
    [revision, setRevision] = useState(state.revision),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const fieldsDirty = useRef({ days: false, reminder: false }),
    base = useRef(c),
    lock = useRef(false);
  const [pending, setPending] = useState(false);
  function reconcile(next, group) {
    const nc = next.connections || {},
      nt = savepointThresholds(nc),
      old = savepointThresholds(base.current);
    if (group) fieldsDirty.current[group] = false;
    const conflict =
      (fieldsDirty.current.days &&
        (nc.projectStallDays || 7) !== (base.current.projectStallDays || 7)) ||
      (fieldsDirty.current.reminder &&
        (nt.warn !== old.warn || nt.danger !== old.danger));
    if (!fieldsDirty.current.days) setDays(String(nc.projectStallDays || 7));
    if (!fieldsDirty.current.reminder) {
      setWarn(String(nt.warn));
      setDanger(String(nt.danger));
    }
    if (conflict) {
      setPending(true);
      setError("其他入口已更改正在编辑的设置，请先重新读取设置再确认。");
    } else {
      base.current = nc;
      setRevision(next.revision);
    }
  }
  // Other pages can advance the workspace revision while this drawer is open.
  // Rebase untouched fields before the user saves a different setting.
  useEffect(() => {
    if (!lock.current && !pending && state.revision > revision) reconcile(state);
  }, [state.revision]);
  async function reread() {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    onBusyChange?.(true);
    try {
      const next = await request("/workspace", undefined, "GET", false);
      adoptState(next);
      fieldsDirty.current = { days: false, reminder: false };
      reconcile(next);
      setPending(false);
      setError("");
    } catch (e) {
      setError(e.message);
    } finally {
      lock.current = false;
      setBusy(false);
      onBusyChange?.(false);
    }
  }

  async function run(fn, group) {
    if (lock.current || pending) return;
    lock.current = true;
    setBusy(true);
    onBusyChange?.(true);
    setError("");
    try {
      const next = await fn();
      adoptState(next);
      flyData();
      reconcile(next, group);
      return next;
    } catch (e) {
      setError(e.message);
      if (!e.status || e.status === 409 || e.unknownResult) setPending(true);
      notify(e.message, "error");
    } finally {
      lock.current = false;
      setBusy(false);
      onBusyChange?.(false);
    }
  }
  return (
    <div className="asset-form st-panel">
      <RosterReadonlyNote />
      <form
        className="asset-form"
        onSubmit={async (e) => {
          e.preventDefault();
          if (
            await run(
              () =>
                request(
                  "/project-status/settings",
                  { stallDays: Number(days), revision },
                  "POST",
                  false,
                ),
              "days",
            )
          )
            notify(`停滞阈值已保存为 ${days} 天`);
        }}
      >
        <label>
          停滞阈值（天）
          <input
            type="number"
            min={1}
            max={365}
            step={1}
            required
            value={days}
            disabled={busy || pending}
            onChange={(e) => {
              fieldsDirty.current.days = true;
              setDays(e.target.value);
            }}
          />
        </label>
        <Button
          secondary
          disabled={
            busy || pending || Number(days) === (c.projectStallDays || 7)
          }
        >
          保存阈值
        </Button>
      </form>
      <form
        className="asset-form"
        onSubmit={async (e) => {
          e.preventDefault();
          if (
            await run(
              () =>
                request(
                  "/project-status/settings",
                  {
                    savepointWarnDays: Number(warn),
                    savepointDangerDays: Number(danger),
                    revision,
                  },
                  "POST",
                  false,
                ),
              "reminder",
            )
          )
            notify("未存档提醒阈值已保存");
        }}
      >
        <h3>未存档提醒</h3>
        <div className="form-row">
          <label>
            黄色提醒（天）
            <input
              type="number"
              min={1}
              max={364}
              step={1}
              required
              value={warn}
              disabled={busy || pending}
              onChange={(e) => {
                fieldsDirty.current.reminder = true;
                setWarn(e.target.value);
              }}
            />
          </label>
          <label>
            红色提醒（天）
            <input
              type="number"
              min={2}
              max={365}
              step={1}
              required
              value={danger}
              disabled={busy || pending}
              onChange={(e) => {
                fieldsDirty.current.reminder = true;
                setDanger(e.target.value);
              }}
            />
          </label>
        </div>
        <p className="body-copy">
          超过黄色天数时，项目空间显示未存档天数；黄色须小于红色。
        </p>
        <Button secondary disabled={busy || pending}>
          保存未存档提醒
        </Button>
      </form>
      {error && (
        <p className="inline-error" role="alert">
          {error}
        </p>
      )}
      {pending && (
        <Button secondary disabled={busy} onClick={reread}>
          重新读取设置
        </Button>
      )}
    </div>
  );
}
