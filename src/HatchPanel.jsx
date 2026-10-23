// 孵化面板（阶段 2 主线串联 C 批）：随手记、收藏共用四个去向——投递到项目、孵成资产、收入焚决、归档。
// 去向状态从目标侧的引用推导（capture-routes.js），面板只发起写入；写入走公共写入能力：先查询、不自动重放。
import React, { useRef, useState } from "react";
import { Archive, ArchiveRestore, Flame, Layers, Send } from "lucide-react";
import { Button, Dialog, StatusBadge } from "./components.jsx";
import { request } from "./api.js";
import { settleAttempt } from "./write-attempt.js";
import "./hatch.css";

const day = (value) => {
  const d = new Date(value);
  return Number.isFinite(d.getTime()) ? `${d.getMonth() + 1}/${d.getDate()}` : "";
};
export function routeText(route, { scrolls = [] } = {}) {
  if (route.to === "project")
    return `${route.relayedAt ? "已交代" : "已投递"} · ${route.projectName || "项目已不在列表"} · ${day(route.relayedAt || route.at)}`;
  if (route.to === "asset") return `已孵成资产 · ${route.title.length > 20 ? route.title.slice(0, 20) + "…" : route.title}`;
  if (route.to === "scroll") return `已收入焚决 · ${scrolls.find((s) => s.id === route.scrollId)?.name || "原卷"}`;
  return `已归档 · ${day(route.at)}`;
}
const TONE = { project: "info", asset: "ok", scroll: "warn", archive: "idle" };
const tone = (route) => (route.to === "project" && route.relayedAt ? "ok" : TONE[route.to]);

// 便签与收藏卡上的去向徽记；没有去向不显示（待孵化由计数表达）。
export function RouteBadges({ routes, scrolls, skip = [] }) {
  const shown = routes.filter((r) => !skip.includes(r.to));
  if (!shown.length) return null;
  return (
    <span className="route-badges">
      {shown.map((route, i) => (
        <StatusBadge key={i} tone={tone(route)}>{routeText(route, { scrolls })}</StatusBadge>
      ))}
    </span>
  );
}

const OUTCOME = {
  absent: "没有查到这次写入，可以再点一次；会先核对，不会重复写。",
  conflict: "这条记录已在别处变化，请刷新后核对。",
  unconfirmed: "写入结果暂时无法核实，请稍后再看；再点会先核对。",
  unknown: "写入结果暂时无法核实，请稍后再看；再点会先核对。",
};

// capture：{ kind: "note" | "collection", id, title }；routes：这条捕获当前的全部去向。
export function HatchPanel({ capture, routes, projects, scrolls, adoptState, notify, navigate, onHatchAsset, onRefine, onClose }) {
  const [busy, setBusy] = useState(""), [status, setStatus] = useState("");
  const lock = useRef(false);
  const archived = routes.some((r) => r.to === "archive");
  const delivered = new Set(routes.filter((r) => r.to === "project").map((r) => r.projectId));
  const refined = routes.find((r) => r.to === "scroll");
  const slots = projects.filter((p) => p.active === true).sort((a, b) => a.name.localeCompare(b.name, "zh"));
  async function write(key, send, reached, done) {
    if (lock.current) return;
    lock.current = true;
    setBusy(key);
    setStatus("");
    try {
      const result = await settleAttempt("retry", {
        send,
        check: async () => {
          const value = await reached();
          return { state: value.ok ? "done" : "absent", value };
        },
      });
      if (result.outcome === "done") {
        result.value.adopt?.();
        notify(done);
      } else setStatus(OUTCOME[result.outcome]);
    } finally {
      lock.current = false;
      setBusy("");
    }
  }
  const deliver = (project) =>
    write(
      `deliver-${project.id}`,
      () => request("/project-desk/deliver", { projectId: project.id, kind: capture.kind, id: capture.id }),
      async () => {
        const state = await request("/workspace");
        const entry = (state.projectDesk || []).find((e) => e.projectId === project.id);
        return { ok: !!entry?.inbox.some((i) => i.kind === capture.kind && i.id === capture.id), adopt: () => adoptState(state) };
      },
      `已投递到「${project.name}」`,
    );
  const archive = () =>
    capture.kind === "note"
      ? write(
          "archive",
          () => request(`/notes/${capture.id}/archive`, { archived: !archived }),
          async () => {
            const state = await request("/workspace");
            const note = state.notes.find((n) => n.id === capture.id);
            return { ok: !!note && (note.archivedAt !== undefined) === !archived, adopt: () => adoptState(state) };
          },
          archived ? "已撤销归档" : "已归档",
        )
      : write(
          "archive",
          () => request(`/collection/notes/${capture.id}/archive`, { archived: !archived }),
          async () => {
            const result = await request("/collection/notes");
            return { ok: (result.archived?.[capture.id] !== undefined) === !archived, adopt: () => capture.onArchived?.(result) };
          },
          archived ? "已撤销归档" : "已归档",
        );
  return (
    <Dialog title="孵化" onClose={() => { if (!lock.current) onClose(); }}>
      <div className="hatch-panel">
        <p className="hatch-subject">
          <b>{capture.title}</b>
          <small>{capture.kind === "note" ? "随手记" : "个人收藏"}</small>
        </p>
        {routes.length ? <RouteBadges routes={routes} scrolls={scrolls} /> : <p className="hatch-pending">待孵化：还没有去向。</p>}
        <section aria-labelledby="hatch-deliver">
          <h3 id="hatch-deliver"><Send size={14} aria-hidden="true" />投递到项目</h3>
          {slots.length ? (
            <ul className="hatch-slots">
              {slots.map((project) => (
                <li key={project.id}>
                  <Button secondary disabled={!!busy || delivered.has(project.id)} onClick={() => deliver(project)}>
                    {busy === `deliver-${project.id}` ? "投递中…" : delivered.has(project.id) ? `已投递 · ${project.name}` : `投递到「${project.name}」`}
                  </Button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="hatch-empty">
              存档槽里还没有在推进的项目。
              <button type="button" className="text-button" onClick={() => { onClose(); navigate("projects"); }}>去项目空间放一个</button>
            </p>
          )}
        </section>
        <div className="hatch-actions">
          <Button secondary disabled={!!busy} onClick={() => { onClose(); onHatchAsset(capture); }}>
            <Layers size={16} aria-hidden="true" />孵成资产
          </Button>
          <Button secondary disabled={!!busy || !!refined} onClick={() => { onClose(); onRefine(capture); }}>
            <Flame size={16} aria-hidden="true" />{refined ? "已收入焚决" : "收入焚决"}
          </Button>
          <Button secondary disabled={!!busy} onClick={archive}>
            {archived ? <ArchiveRestore size={16} aria-hidden="true" /> : <Archive size={16} aria-hidden="true" />}
            {busy === "archive" ? "处理中…" : archived ? "撤销归档" : "归档"}
          </Button>
        </div>
        {status && <p className="hatch-status" role="status">{status}</p>}
      </div>
    </Dialog>
  );
}
