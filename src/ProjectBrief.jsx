// 项目空间第二批：世界总览“今日项目简报”卡。每个在推进项目一段话（昨天到今天、唯一下一步、卡点），
// 由服务端按本机数据的确定规则生成，不调用任何模型。可“标为已读”（存主库）；内容变化后提示“有更新”。
// 每段带一键开工，复用 2.4 的开工口令与留痕。
import React, { useCallback, useEffect, useRef, useState } from "react";
import { ArrowUpRight, Check, RefreshCw } from "lucide-react";
import { Badge, Button } from "./components.jsx";
import { request } from "./api.js";
import { StartWork } from "./ProjectStatus.jsx";
import "./project-brief.css";

const READ = {
  read: ["success", "已读"],
  changed: ["warning", "有更新"],
  unread: ["muted", "未读"],
};

function useBrief(activeKey) {
  const [brief, setBrief] = useState({ items: [], error: "", loaded: true });
  const run = useRef(0);
  const load = useCallback(async (refresh = false) => {
    const id = ++run.current;
    setBrief((prev) => ({ ...prev, error: "", loaded: false }));
    try {
      const result = await request("/project-brief/today", refresh ? { refresh: true } : {});
      if (id === run.current) setBrief({ ...result, error: "", loaded: true });
    } catch (e) {
      if (id === run.current) setBrief({ items: [], error: e.message || "读取失败", loaded: true });
    }
  }, []);
  useEffect(() => {
    if (!activeKey) {
      run.current++;
      setBrief({ items: [], error: "", loaded: true });
    } else load();
  }, [activeKey, load]);
  return [brief, load, setBrief];
}

function BriefParagraph({ item, onRead, busy, adoptState, notify }) {
  const [tone, label] = READ[item.read] || READ.unread;
  return (
    <article
      className={`brief-item ${item.read === "read" ? "is-read" : ""}`}
      aria-label={`项目简报：${item.name}`}
    >
      <header>
        <h3>{item.name}</h3>
        <Badge tone={tone}>{label}</Badge>
      </header>
      {/* 用户 2026-10-03：每个小标题及其内容单独一行。 */}
      <div className="brief-text">
        <p>
          <strong>昨天到今天：</strong>
          {item.happened.join("；")}。
        </p>
        <p>
          <strong>今天的唯一下一步：</strong>
          {item.next}。
        </p>
        <p>
          <strong>卡点：</strong>
          {item.blockers.length ? item.blockers.join("；") : "未发现"}。
        </p>
      </div>
      <div className="brief-actions">
        <Button
          secondary
          disabled={busy || item.read === "read"}
          onClick={() => onRead([item])}
        >
          <Check size={16} />
          {item.read === "read" ? "已读" : "标为已读"}
        </Button>
        <StartWork item={item} adoptState={adoptState} notify={notify} label="一键开工" />
      </div>
    </article>
  );
}

export function HomeBrief({ state, adoptState, notify, navigate }) {
  const active = (state.connections?.projects || []).filter((p) => p.active);
  const activeKey = active.map((p) => p.id).join(",");
  const [brief, load, setBrief] = useBrief(activeKey);
  const [busy, setBusy] = useState(false);
  async function markRead(items) {
    setBusy(true);
    try {
      const next = await request("/project-brief/read", {
        date: brief.date,
        items: items.map((i) => ({ projectId: i.projectId, digest: i.digest })),
      });
      adoptState(next);
      const ids = new Set(items.map((i) => i.projectId));
      setBrief((prev) => ({
        ...prev,
        items: prev.items.map((i) => (ids.has(i.projectId) ? { ...i, read: "read" } : i)),
      }));
      notify(items.length > 1 ? "今日简报已全部标为已读" : `已读：${items[0].name}`);
    } catch (e) {
      notify(e.message, "error");
    } finally {
      setBusy(false);
    }
  }
  const unread = brief.items.filter((i) => i.read !== "read");
  return (
    <section className="home-section home-brief" aria-labelledby="home-brief-title">
      <div className="section-title">
        <span className="section-index">C</span>
        <h2 id="home-brief-title">今日项目简报</h2>
        <p>
          {brief.date
            ? `统计区间：昨天 0:00 至今 · 由本机数据按规则生成，不调用模型`
            : "由本机数据按规则生成，不调用模型"}
        </p>
      </div>
      {!active.length ? (
        <p className="recent-empty">
          还没有在推进项目。在项目空间把项目标为“在推进”，这里每天给出一段简报。
        </p>
      ) : (
        <>
          <div className="brief-tools">
            <Button secondary disabled={!brief.loaded} onClick={() => load(true)}>
              <RefreshCw size={16} className={brief.loaded ? "" : "spinning"} />
              刷新简报
            </Button>
            <Button
              secondary
              disabled={busy || !brief.loaded || !unread.length}
              onClick={() => markRead(unread)}
            >
              <Check size={16} />
              全部标为已读
            </Button>
          </div>
          {brief.error && (
            <p className="inline-error" role="alert">
              简报读取失败：{brief.error}
            </p>
          )}
          {!brief.loaded && !brief.items.length && (
            <p className="recent-empty" role="status">
              正在汇总在推进项目的 CURRENT、Git 与 GitHub…
            </p>
          )}
          <div className="brief-list">
            {brief.items.map((item) => (
              <BriefParagraph
                key={item.projectId}
                item={item}
                busy={busy}
                onRead={markRead}
                adoptState={adoptState}
                notify={notify}
              />
            ))}
          </div>
        </>
      )}
      <button className="plan-link" onClick={() => navigate("projects")}>
        <span>查看项目空间</span>
        <ArrowUpRight size={15} />
      </button>
    </section>
  );
}
