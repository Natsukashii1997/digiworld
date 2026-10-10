import React, { useEffect, useRef, useState } from "react";
import { Button } from "./components.jsx";
import { request, scan } from "./api.js";
import { savepointThresholds } from "./settings-v16.js";
import { ManualProjectForm } from "./ProjectCatalog.jsx";
// 两入口复用同一个表单和服务；不另存设置。表单草稿保留开启时 revision，冲突由服务拒绝。
export function ProjectSettings({ state, adoptState, notify, onBusyChange }) {
  const c = state.connections || {},
    thresholds = savepointThresholds(c);
  const [roots, setRoots] = useState(c.roots?.join("\n") || ""),
    [days, setDays] = useState(String(c.projectStallDays || 7)),
    [warn, setWarn] = useState(String(thresholds.warn)),
    [danger, setDanger] = useState(String(thresholds.danger)),
    [revision, setRevision] = useState(state.revision),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const dirty = useRef(false),
    fieldsDirty = useRef({ days: false, reminder: false }),
    base = useRef(c),
    lock = useRef(false);
  const [pending, setPending] = useState(false);
  function reconcile(next, group) {
    const nc = next.connections || {},
      nt = savepointThresholds(nc),
      old = savepointThresholds(base.current);
    if (group === "roots") dirty.current = false;
    else if (group) fieldsDirty.current[group] = false;
    const nextRoots = (nc.roots || []).join("\n"),
      previousRoots = (base.current.roots || []).join("\n");
    const conflict =
      (dirty.current && nextRoots !== previousRoots) ||
      (fieldsDirty.current.days &&
        (nc.projectStallDays || 7) !== (base.current.projectStallDays || 7)) ||
      (fieldsDirty.current.reminder &&
        (nt.warn !== old.warn || nt.danger !== old.danger));
    if (!dirty.current) setRoots(nextRoots);
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
  // Project-page auto scan can advance the workspace revision while this drawer
  // is open. Rebase untouched fields before the user saves a different setting.
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
      dirty.current = false;
      fieldsDirty.current = { days: false, reminder: false };
      reconcile(next);
      setRoots(next.connections?.roots?.join("\n") || "");
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

  useEffect(() => {
    let alive = true;
    request("/connections")
      .then((v) => {
        if (alive && !dirty.current) setRoots(v.roots.join("\n"));
      })
      .catch((e) => {
        if (alive) setError(e.message);
      });
    return () => {
      alive = false;
    };
  }, []);
  async function run(fn, group) {
    if (lock.current || pending) return;
    lock.current = true;
    setBusy(true);
    onBusyChange?.(true);
    setError("");
    try {
      const next = await fn();
      adoptState(next);
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
      <form
        className="asset-form"
        onSubmit={async (e) => {
          e.preventDefault();
          const next = await run(() =>
            scan("projects", {
              roots: roots
                .split("\n")
                .map((s) => s.trim())
                .filter(Boolean),
            }), "roots",
          );
          if (next) {
            notify("扫描目录已保存并读取");
          }
        }}
      >
        <h3>扫描目录</h3>
        <label>
          本地项目目录（每行一个绝对路径）
          <textarea
            rows={4}
            required
            value={roots}
            disabled={busy || pending}
            onChange={(e) => {
              dirty.current = true;
              setRoots(e.target.value);
            }}
          />
        </label>
        <p className="body-copy">
          只读取项目标记、Git
          远端与最近提交时间；不读取源码内容，不跟随子目录符号链接。
        </p>
        <Button type="submit" disabled={busy || pending}>
          {busy ? "扫描中…" : "保存并扫描"}
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
          超过黄色天数提示，超过红色天数进入待处理；黄色须小于红色。
        </p>
        <Button secondary disabled={busy || pending}>
          保存未存档提醒
        </Button>
      </form>
      <ManualProjectForm state={state} adoptState={adoptState} notify={notify} />
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
