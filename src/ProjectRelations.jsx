// 项目空间「项目关系」页签（#79）：上面关系轨道（三圈同心 + 信息卡），下面支撑流桑基（底座 → 产品 → 当前状态），两图联动。
// 只读：数据来自 GET /api/projects-space/relations（#78）；关系以数字分身名册为准，另从各项目 AGENTS.md 和技能调用统计自动读出。
// 视觉照定稿 docs/design/projects-space-v3/项目关系-定稿.html；关系页专用颜色写在 project-relations.css，不动 tokens.css。
import React, { useCallback, useEffect, useRef, useState } from "react";
import { SourceReadError } from "./components.jsx";
import { request } from "./api.js";
import "./project-relations.css";

// 第一次切到「项目关系」才读；之后切回来沿用上次读数，点页头刷新才重读。
export function useRelations(active) {
  const [data, setData] = useState(null), [error, setError] = useState(""), [loading, setLoading] = useState(false);
  const live = useRef(true), asked = useRef(false);
  useEffect(() => () => { live.current = false; }, []);
  const load = useCallback(async (refresh = false) => {
    asked.current = true;
    setLoading(true);
    try {
      const value = await request(refresh ? "/projects-space/relations?refresh=1" : "/projects-space/relations");
      if (!live.current) return null;
      setData(value);
      setError("");
      return value;
    } catch (e) {
      if (live.current) setError(e.message);
      return null;
    } finally {
      if (live.current) setLoading(false);
    }
  }, []);
  useEffect(() => { if (active && !asked.current) void load(); }, [active, load]);
  return { data, error, loading, load };
}

const hhmm = (iso) => { const d = new Date(iso); return Number.isNaN(+d) ? "" : `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`; };
const rosterLabel = (v) => (v ? (/^\d/.test(v) ? `v${v}` : v) : "");

// 页头右侧：项目数、关系数、近 30 天产品提交、名册版本与读取时间。
export function RelationStats({ data }) {
  const nodes = data?.nodes || [], edges = data?.edges || [];
  const products = nodes.filter((n) => n.type === "product" && typeof n.c30 === "number");
  const commits = products.length ? products.reduce((a, n) => a + n.c30, 0) : null;
  const ver = rosterLabel(data?.roster?.version), at = data?.at ? hhmm(data.at) : "";
  return (
    <div className="pr-stats" aria-live="polite">
      <span><b>{data ? nodes.length : "—"}</b>项目</span>
      <span><b>{data ? edges.length : "—"}</b>关系</span>
      <span><b>{commits ?? "—"}</b>近 30 天产品提交</span>
      {(ver || at) && <span className="src">{[ver && `名册 ${ver}`, at && `读取于 ${at}`].filter(Boolean).join(" · ")}</span>}
    </div>
  );
}

export function ProjectRelations({ rel, onSettings }) {
  const { data, error, loading, load } = rel;
  const empty = data?.roster?.state === "ok" && !data.edges.length;
  return (
    <div className="pr-page" id="pr-panel" role="tabpanel" aria-labelledby="ps-page-relations">
      <SourceReadError title="项目关系" error={error} retained={!!data} onRetry={() => load()} />
      {!data && loading && <p className="ps-loading" role="status">读取名册、各项目 AGENTS.md 与读数中…</p>}
      {data?.roster?.state === "error" && (
        <p className="ps-roster-error" role="status">名册读不到：{data.roster.message}（{data.roster.path}）
          <button type="button" className="g5-link" onClick={onSettings}>去设置</button></p>
      )}
      {data?.roster?.state === "ok" && (
        <>
          <section className="pr-card" aria-label="项目关系图">
            <div className="pr-head"><h2>RELATION ORBIT</h2>
              <span className="crumb">项目之间 · {data.nodes.length} 个项目 · {data.edges.length} 条关系</span></div>
            {empty && <p className="pr-empty">还没有关系：名册里补 relations，或项目 AGENTS.md 引用底座后自动连上。</p>}
          </section>
          <section className="pr-card" aria-label="底座支撑桑基图">
            <div className="pr-head"><h2>SUPPORT FLOW</h2><span className="crumb">底座 → 产品 → 当前状态 · 宽度＝近 30 天提交</span></div>
          </section>
        </>
      )}
    </div>
  );
}
