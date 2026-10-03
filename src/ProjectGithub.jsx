// 项目空间第二批：GitHub 面板。只读显示在推进项目的打开 PR、最近合并、打开 Issue 与默认分支 CI。
// 数据来自服务端用本机 gh 做的只读查询（带缓存与查询时间）；查不到就如实写“未知”，不要求登录。
import React, { useCallback, useEffect, useRef, useState } from "react";
import { RefreshCw } from "lucide-react";
import { Badge, Button } from "./components.jsx";
import { request } from "./api.js";
import "./project-github.css";

// 每类最多列 3 条，其余写“等 N 条”（用户 2026-10-03）。
const SHOW = { open: 3, merged: 3, issues: 3 };
export const CI_TEXT = {
  success: ["success", "成功"],
  failure: ["danger", "失败"],
  running: ["warning", "运行中"],
  cancelled: ["muted", "已取消"],
  other: ["muted", "其他结果"],
  none: ["muted", "没有运行记录"],
};
export const clock = (value) =>
  value
    ? new Date(value).toLocaleString("zh-CN", {
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
      })
    : "未知";

// 只在“在推进”集合变化时查询；没有在推进项目时不发请求。只采用最后一次请求的结果。
export function useGithubPanel(activeIds) {
  const [panel, setPanel] = useState({ items: [], error: "", loaded: true });
  const run = useRef(0);
  const load = useCallback(async (refresh = false) => {
    const id = ++run.current;
    setPanel((prev) => ({ ...prev, error: "", loaded: false }));
    try {
      const result = await request("/project-github/panel", refresh ? { refresh: true } : {});
      if (id === run.current) setPanel({ ...result, error: "", loaded: true });
    } catch (e) {
      if (id === run.current)
        setPanel({ items: [], error: e.message || "读取失败", loaded: true });
    }
  }, []);
  useEffect(() => {
    if (!activeIds) {
      run.current++;
      setPanel({ items: [], error: "", loaded: true });
    } else load();
  }, [activeIds, load]);
  return [panel, load];
}

function Rows({ label, section, items, render, empty }) {
  if (section?.state !== "ok")
    return (
      <div className="gh-row">
        <span>{label}</span>
        <span className="gh-muted">未知{section?.message ? ` · ${section.message}` : ""}</span>
      </div>
    );
  return (
    <div className="gh-row">
      <span>
        {label} · {section.items.length}
        {section.truncated ? "+" : ""}
      </span>
      {items.length ? (
        <ul>
          {items.map((item) => (
            <li key={item.number}>{render(item)}</li>
          ))}
          {section.items.length > items.length && (
            <li className="gh-muted">
              等 {section.items.length - items.length}
              {section.truncated ? "+" : ""} 条
            </li>
          )}
        </ul>
      ) : (
        <span className="gh-muted">{empty}</span>
      )}
    </div>
  );
}

const link = (item, extra = "") =>
  item.url ? (
    <a className="gh-link" href={item.url} target="_blank" rel="noopener noreferrer">
      #{item.number} {item.title}
      {extra}
    </a>
  ) : (
    <span className="gh-link">
      #{item.number} {item.title}
      {extra}
    </span>
  );

export function GithubBlock({ github, loading, onRefresh }) {
  if (!github)
    return (
      <div className="status-github" aria-label="GitHub">
        <h4>GitHub</h4>
        <p className="gh-muted">{loading ? "正在读取 GitHub 情况…" : "未知 · 没有读取结果"}</p>
      </div>
    );
  if (github.state === "none")
    return (
      <div className="status-github" aria-label="GitHub">
        <h4>GitHub</h4>
        <p className="gh-muted">{github.message}，不查询 GitHub。</p>
      </div>
    );
  const refresh = onRefresh && (
    <Button secondary disabled={loading} onClick={onRefresh}>
      <RefreshCw size={16} className={loading ? "spinning" : ""} />
      刷新 GitHub
    </Button>
  );
  if (github.state !== "ok")
    return (
      <div className="status-github" aria-label="GitHub">
        <h4>
          GitHub <Badge tone="muted">未知</Badge>
        </h4>
        <p className="gh-muted">
          未知 · {github.message}
          {github.lastSuccessAt ? `（上次成功查询：${clock(github.lastSuccessAt)}）` : ""}
        </p>
        <small className="status-note">查询于 {clock(github.fetchedAt)}；只读查询，不需要在这里登录。</small>
        {refresh}
      </div>
    );
  const ci = github.ci;
  const [tone, label] =
    ci.state === "ok" ? CI_TEXT[ci.status] || CI_TEXT.other : ["muted", "未知"];
  return (
    <div className="status-github" aria-label="GitHub">
      <h4>
        GitHub
        <code>{github.repoKey}</code>
      </h4>
      <Rows
        label="打开的 PR"
        section={github.openPrs}
        items={github.openPrs?.items?.slice(0, SHOW.open) || []}
        render={(p) => link(p, p.draft ? "（草稿）" : "")}
        empty="没有"
      />
      <Rows
        label="最近合并"
        section={github.mergedPrs}
        items={github.mergedPrs?.items?.slice(0, SHOW.merged) || []}
        render={(p) => link(p, p.mergedAt ? ` · ${clock(p.mergedAt)}` : "")}
        empty="没有"
      />
      <Rows
        label="打开的 Issue"
        section={github.issues}
        items={github.issues?.items?.slice(0, SHOW.issues) || []}
        render={(i) => link(i)}
        empty="没有"
      />
      <div className="gh-row">
        <span>默认分支 CI</span>
        <span className={`gh-ci ${tone}`}>
          <Badge tone={tone}>{label}</Badge>
          {ci.state === "ok" && ci.latest ? (
            <>
              {" "}
              {ci.latest.url ? (
                <a className="gh-link" href={ci.latest.url} target="_blank" rel="noopener noreferrer">
                  {ci.latest.workflow || "workflow"} · {github.defaultBranch} · {clock(ci.latest.updatedAt || ci.latest.createdAt)}
                </a>
              ) : (
                <span>
                  {ci.latest.workflow} · {github.defaultBranch}
                </span>
              )}
            </>
          ) : ci.state === "ok" ? null : (
            <span className="gh-muted"> {ci.message}</span>
          )}
        </span>
      </div>
      <small className="status-note">
        更新于 {clock(github.fetchedAt)}
        {github.cached ? "（缓存）" : ""} · 本机 gh 只读查询
      </small>
      {refresh}
    </div>
  );
}
