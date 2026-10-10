// 知识仓库三区视图与个人说明（路线 v3 切片 3.2 / 3.3；产品定义 v1.2 §4.4；D30、D32）。
// 三区只是按文件夹规则划分的视图：统计只读元数据，不移动、不改写任何 Vault 文件。
import React, { useCallback, useEffect, useRef, useState } from "react";
import { BarChart3, Plus, RotateCcw, Save, Trash2, ArrowUpRight } from "lucide-react";
import { Badge, Button, Dialog } from "./components.jsx";
import { DeviceShell, LcdCount, ResultChip, useFlash, useReducedMotion } from "./v14.jsx";
import { request } from "./api.js";
import {
  ZONES,
  DEFAULT_ZONE_RULES,
  validateZoneRules,
  profileFolders,
} from "./knowledge-zones.js";
import "./knowledge-zones.css";

const DEFAULT_MCP_URL = "http://127.0.0.1:5179/mcp";
const time = (value) =>
  new Date(value).toLocaleString("zh-CN", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" });
export const zonesConfig = (state) =>
  state.knowledgeZones || { rules: DEFAULT_ZONE_RULES, sourceId: null, profileSharing: false };
export function vaultOf(state) {
  const sources = (state.connections?.knowledgeSources || []).filter((s) => s.kind !== "feishu");
  const { sourceId } = zonesConfig(state);
  if (sourceId) return sources.find((s) => s.id === sourceId) || null;
  return sources.find((s) => s.kind === "obsidian") || sources[0] || null;
}

// 读取最近一次三区统计摘要与 MCP 服务地址（只在服务内存里，重启后需重新统计）。
export function useZoneSummary() {
  const [summary, setSummary] = useState({ latest: null, mcp: null, loaded: false });
  const sequence = useRef(0);
  // A newer explicit refresh or stats update retires the initial in-flight load.
  const updateSummary = useCallback((value) => {
    sequence.current++;
    setSummary(value);
  }, []);
  useEffect(() => {
    let alive = true;
    const ticket = ++sequence.current;
    request("/knowledge/zones/summary", {})
      .then((value) => alive && ticket === sequence.current && setSummary({ ...value, loaded: true }))
      .catch((error) => alive && ticket === sequence.current && setSummary({ latest: null, mcp: null, loaded: true, loadError: error.message }));
    return () => { alive = false; };
  }, []);
  return [summary, updateSummary];
}

// 主要指标：“我的知识”本周新增或更新篇数（按修改时间）。
export function ZoneMetric({ latest }) {
  const mine = latest?.zones?.mine;
  return (
    <span
      className="zone-metric"
      title={latest ? `统计于 ${time(latest.at)}，按文件修改时间，自本周一起` : "尚未统计三区"}
    >
      <small>我的知识 · 本周</small>
      <strong>{mine ? `+${mine.changedThisWeek}` : "—"}</strong>
      <small>{mine ? `共 ${mine.total} 篇` : "尚未统计"}</small>
    </span>
  );
}

// 三区视图（UI v14e：ZONE MONITOR 设备屏）。统计成功时液晶窗翻转一次、旁边出现一次“已重新统计”；
// 失败用稳定提示。近 7 天趋势来自本机留存回执，起点之前无记录、读取失败未知，不编历史。
const ZONE_KEYS = { input: "INPUT", mine: "MINE", profile: "PROFILE" };
const ZONE_COLORS = { input: "#2fb3d1", mine: "var(--orange)", profile: "var(--lcd)" };
export function KnowledgeZones({ state, adoptState, notify, summary, onSummary, navigate, blocked, rulesOpen, onRules }) {
  const sources = state.connections?.knowledgeSources || [];
  const config = zonesConfig(state);
  const vault = vaultOf(state);
  const [stats, setStats] = useState(null);
  const [zone, setZone] = useState("mine");
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [runs, setRuns] = useState(0);
  const lock = useRef(false);
  const flash = useFlash();
  const reduced = useReducedMotion();
  // 读数开机扫亮后再翻转一次。
  useEffect(() => {
    if (!runs) return;
    const timer = setTimeout(flash.fire, reduced ? 0 : 560);
    return () => clearTimeout(timer);
  }, [runs]);
  async function run(kind, operation) {
    if (lock.current) return;
    lock.current = true;
    setBusy(kind);
    setError("");
    flash.reset();
    try {
      await operation();
    } catch (failure) {
      setError(failure.message);
    } finally {
      lock.current = false;
      setBusy("");
    }
  }
  const count = () =>
    run("stats", async () => {
      const result = await request("/knowledge/zones/stats", { sourceId: vault.id });
      setStats(result);
      const { files, ...latest } = result;
      onSummary((current) => ({ ...current, latest }));
      setRuns((n) => n + 1);
    });
  const shown = stats?.sourceId === vault?.id ? stats : null;
  // 目录读取顺序随文件系统而异（APFS 与 ext4 不同），显示前按路径排序，让列表在各平台一致。
  const zoneFiles = shown
    ? shown.files
        .filter((f) => f.zone === zone)
        .sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0))
    : [];
  const label = ZONES.find((z) => z.id === zone).label;
  const total = shown ? ZONES.reduce((n, z) => n + shown.zones[z.id].total, 0) : 0;
  const trend = shown?.trend || (summary?.trend?.sourceId === vault?.id ? summary.trend : null);
  const share = (id) => (total ? `${((shown.zones[id].total / total) * 100).toFixed(1)}%` : "—");
  return (
    <section id="k-zones" className="knowledge-zones knowledge-anchor" aria-labelledby="k-zones-title">
      <DeviceShell plate="ZONE MONITOR" className="zone-shell reveal">
        <header className="zones-head">
          <h2 id="k-zones-title">三区视图</h2>
          <span className="zones-when">
            {shown
              ? `统计于 ${time(shown.at)} · 本周自 ${new Date(shown.weekStart).toLocaleDateString("zh-CN", { month: "numeric", day: "numeric" })}（周一）`
              : vault
                ? `“${vault.name}” · 尚未统计`
                : "尚未连接知识源"}
          </span>
          <ResultChip flash={flash}>已重新统计</ResultChip>
          <div className="zones-actions">
            <Button secondary disabled={!vault || !!busy || blocked} onClick={count}>
              <BarChart3 size={16} />
              {busy === "stats" ? "统计中…" : "统计三区"}
            </Button>
            <Button secondary className="ghost" onClick={() => onRules(true)}>
              划分规则
            </Button>
          </div>
        </header>
        <p className="zones-note">
          按文件夹规则把 {vault ? `“${vault.name}”` : "Vault"} 分成三区，只读统计，不移动、不改写任何文件。
          {!vault && " 先连接一个 Obsidian 知识源，再统计三区。"}
          {shown && (
            <span role="status">
              {" "}
              按修改时间统计，新增与更新合计
              {shown.status === "partial" ? ` · 部分扫描，${shown.issues} 处未计入` : ""}。
            </span>
          )}
        </p>
        {error && (
          <p className="inline-error" role="alert">
            {error}
          </p>
        )}
        <div className="zone-board" role="group" aria-label="知识分区" ref={flash.ref}>
          {ZONES.map((z) => {
            const value = shown?.zones[z.id];
            return (
              <button
                key={z.id}
                type="button"
                className={`zone-unit zone-${z.id}`}
                aria-pressed={zone === z.id}
                onClick={() => setZone(z.id)}
              >
                <span className="zone-cell" aria-hidden="true">
                  <span className="zk">
                    <span>{ZONE_KEYS[z.id]}</span>
                    {z.id === "mine" && <span className="mk" />}
                  </span>
                  <span className="num">
                    <LcdCount key={runs} value={value ? value.total : "---"} px={6} pad={4} label={null} />
                    <small>篇</small>
                  </span>
                </span>
                <span className="zone-col">
                  <strong>
                    <i style={{ background: ZONE_COLORS[z.id] }} aria-hidden="true" />
                    {z.label}
                    {z.id === "mine" && <Badge>主要指标</Badge>}
                  </strong>
                  <span className="sr-only">{value ? value.total : "—"} 篇</span>
                  <small className={`zone-week${value?.changedThisWeek ? "" : " flat"}`}>
                    本周 +{value ? value.changedThisWeek : "—"}（新增或更新）
                  </small>
                  <span className="zone-trend">
                    <span className="bars" aria-hidden="true">
                      {(trend?.zones?.[z.id] || Array.from({length:7},(_,i) => ({date:i,status:"unrecorded",total:null}))).map((point) => {
                        const max = Math.max(1,...(trend?.zones?.[z.id] || []).map((value) => value.total || 0));
                        return <i key={point.date} data-status={point.status} title={`${point.date}：${point.total === null ? point.status === "unknown" ? "未知" : "无记录" : point.total}`}
                          style={point.total === null ? undefined : {height:`${point.total / max * 100}%`,background:"var(--orange)",border:0}} />;
                      })}
                    </span>
                    <small>近 7 天本机写入 / 整理记录{!trend?.zones ? " · 待接入数据" : ""}</small>
                    {trend?.zones?.[z.id] && <small>{trend.zones[z.id].map((point) => `${point.date.slice(5)}：${point.total === null ? point.status === "unknown" ? "未知" : "无记录" : point.total}`).join(" · ")}</small>}
                    {trend?.zones?.[z.id] && <span className="sr-only">{trend.zones[z.id].map((point) => `${point.date}：${point.total === null ? point.status === "unknown" ? "未知" : "无记录" : `写入 ${point.written}，整理 ${point.organized}`}`).join("；")}</span>}
                  </span>
                  <em>{z.hint}</em>
                </span>
              </button>
            );
          })}
        </div>
        {trend && <p className="zones-note">{trend.meaning || trend.reason}{trend.state === "partial" ? " 写入回执不可读取，趋势按未知显示。" : ""}</p>}
        <div className="zone-share">
          <div className="k">
            <span>三区占比（同一刻度{shown ? `，共 ${total} 篇` : ""}）</span>
            {shown && <span>统计于 {time(shown.at)}</span>}
          </div>
          <div className="bar" aria-hidden="true">
            {shown && total ? (
              ZONES.map((z) => (
                <i key={z.id} style={{ flex: shown.zones[z.id].total, background: ZONE_COLORS[z.id] }} />
              ))
            ) : (
              <i className="zone-share-empty" />
            )}
          </div>
          <div className="legend">
            {ZONES.map((z) => (
              <span className="legend-item" key={z.id} style={{ "--c": ZONE_COLORS[z.id] }}>
                <i className="legend-swatch" aria-hidden="true" />
                <span className="legend-label">{z.label} {shown ? `${shown.zones[z.id].total} 篇 · ${share(z.id)}` : "—"}</span>
              </span>
            ))}
          </div>
        </div>
      </DeviceShell>
      {shown && (
        <div className="zone-files">
          {zoneFiles.length ? (
            <ul aria-label={`${label} 文件`}>
              {zoneFiles.slice(0, 50).map((file) => (
                <li key={file.path}>
                  <div className="zone-file-path">{file.path}</div>
                  <div className="zone-file-meta">
                    修改于 {time(file.modifiedAt)}
                    {file.changedThisWeek && <Badge tone="warning">本周</Badge>}
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <p className="zones-note">{label}里没有 Markdown 文件。</p>
          )}
          {zoneFiles.length > 50 && <p className="zones-note">只列出前 50 篇，共 {zoneFiles.length} 篇。</p>}
        </div>
      )}
      {rulesOpen && (
        <Dialog drawer title="规则与 MCP" onClose={() => onRules(false)}>
          <div className="zone-drawer">
            <ZoneRules
              state={state}
              sources={sources}
              vault={vault}
              adoptState={adoptState}
              notify={notify}
              blocked={blocked}
            />
            <ProfilePanel
              state={state}
              config={config}
              vault={vault}
              mcp={summary.mcp}
              adoptState={adoptState}
              notify={notify}
              navigate={navigate}
              blocked={blocked}
            />
          </div>
        </Dialog>
      )}
    </section>
  );
}

const toDraft = (rules) => rules.map((r) => ({ folder: r.pattern.slice(0, -3), zone: r.zone }));
export function ZoneRules({ state, sources, vault, adoptState, notify, blocked }) {
  const config = zonesConfig(state);
  const [draft, setDraft] = useState(() => toDraft(config.rules));
  const [sourceId, setSourceId] = useState(vault?.id || "");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const saved = JSON.stringify(config.rules);
  useEffect(() => {
    setDraft(toDraft(config.rules));
  }, [saved]);
  useEffect(() => {
    setSourceId(vault?.id || "");
  }, [vault?.id]);
  const update = (index, patch) =>
    setDraft((rows) => rows.map((row, i) => (i === index ? { ...row, ...patch } : row)));
  async function submit(event) {
    event.preventDefault();
    if (busy) return;
    let rules;
    try {
      rules = validateZoneRules(draft.map((row) => ({ pattern: `${row.folder.trim()}/**`, zone: row.zone })));
    } catch (failure) {
      setError(failure.message);
      return;
    }
    setBusy(true);
    setError("");
    try {
      const next = await request("/knowledge/zones/rules", {
        rules,
        sourceId: sourceId || null,
        expectedRevision: state.revision,
      });
      adoptState(next);
      notify("划分规则已保存，重新统计后生效");
    } catch (failure) {
      setError(failure.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <form className="zone-rules" aria-label="划分规则" onSubmit={submit}>
      <div className="zone-rules-head">
        <h3>划分规则</h3>
        <p>按顺序匹配，第一条命中的规则生效。规则只影响视图与个人说明的范围，不移动文件。</p>
      </div>
      {sources.length > 1 && (
        <label className="zone-source">
          三区视图适用的知识源
          <select value={sourceId} onChange={(e) => setSourceId(e.target.value)}>
            {sources.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </label>
      )}
      <ol className="zone-rule-list">
        {draft.map((row, index) => (
          <li key={index} className="zone-rule">
            <span className="zone-rule-input">
              <input
                aria-label={`规则 ${index + 1} 文件夹`}
                value={row.folder}
                onChange={(e) => update(index, { folder: e.target.value })}
                placeholder="Vault 内文件夹，例如 GET NOTES"
              />
              <span aria-hidden="true">/**</span>
            </span>
            <span className="zone-rule-arrow" aria-hidden="true">
              →
            </span>
            <select
              aria-label={`规则 ${index + 1} 归入`}
              value={row.zone}
              onChange={(e) => update(index, { zone: e.target.value })}
            >
              {ZONES.map((z) => (
                <option key={z.id} value={z.id}>
                  {z.label}
                </option>
              ))}
            </select>
            <button
              type="button"
              className="icon-button zone-rule-remove"
              aria-label={`删除规则 ${index + 1}`}
              onClick={() => setDraft((rows) => rows.filter((_, i) => i !== index))}
            >
              <Trash2 size={16} />
            </button>
          </li>
        ))}
      </ol>
      <p className="zone-rule-fallback">其余文件 → 我的知识</p>
      {error && (
        <p className="inline-error" role="alert">
          {error}
        </p>
      )}
      <div className="zone-rule-actions">
        <Button
          type="button"
          secondary
          disabled={draft.length >= 20}
          onClick={() => setDraft((rows) => [...rows, { folder: "", zone: "input" }])}
        >
          <Plus size={16} />
          添加规则
        </Button>
        <Button type="button" secondary onClick={() => setDraft(toDraft(DEFAULT_ZONE_RULES))}>
          <RotateCcw size={16} />
          恢复默认
        </Button>
        <Button type="submit" disabled={busy || blocked}>
          <Save size={16} />
          {busy ? "保存中…" : "保存规则"}
        </Button>
      </div>
    </form>
  );
}

export function mcpExamples(url) {
  return [
    {
      agent: "Codex",
      where: "~/.codex/config.toml",
      text: `[mcp_servers.workbench-profile]\nurl = "${url}"`,
    },
    {
      agent: "Claude Code",
      where: "终端",
      text: `claude mcp add --transport http workbench-profile ${url}`,
    },
    {
      agent: "Hermes",
      where: "~/.hermes/config.yaml",
      text: `mcp_servers:\n  workbench-profile:\n    url: "${url}"`,
    },
  ];
}
export function ProfilePanel({ state, config, vault, mcp, adoptState, notify, navigate, blocked }) {
  const [agreed, setAgreed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const folders = profileFolders(config.rules);
  const pending = (state.profileProposals || []).filter((p) => p.status === "pending").length;
  const url = mcp?.url || DEFAULT_MCP_URL;
  async function toggle(enabled) {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      const next = await request("/knowledge/profile/sharing", {
        enabled,
        confirmed: true,
        expectedRevision: state.revision,
      });
      adoptState(next);
      setAgreed(false);
      notify(enabled ? "已允许本机 Agent 通过 MCP 读取个人说明" : "已关闭 MCP 读取个人说明");
    } catch (failure) {
      setError(failure.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="profile-panel" aria-labelledby="k-profile-title">
      <header className="zones-heading">
        <div>
          <h3 id="k-profile-title">个人说明</h3>
          <p>
            权威来源：{vault ? `“${vault.name}”中的 ` : "Vault 中的 "}
            {folders.length ? folders.map((f) => `“${f}”`).join("、") : "（规则里没有个人说明区）"}
            文件夹。Agent 通过本机 MCP 服务读取；它们只能提交修改建议，进入待处理，由你采纳或拒绝。
          </p>
        </div>
        <Badge tone={config.profileSharing ? "success" : "muted"}>
          {config.profileSharing ? "MCP 读取已开启" : "未开启"}
        </Badge>
      </header>
      <dl className="profile-facts">
        <div>
          <dt>MCP 地址</dt>
          <dd>
            {mcp?.url ? (
              <code className="mcp-url">{mcp.url}</code>
            ) : (
              <span>{mcp?.error || "读取中…"}</span>
            )}
          </dd>
        </div>
        <div>
          <dt>工具</dt>
          <dd>read_profile（读取，单篇与总量有字数上限）· propose_profile_change（提交修改建议）</dd>
        </div>
        <div>
          <dt>待处理建议</dt>
          <dd className="profile-pending">
            <span>{pending} 条</span>
            {navigate && (
              <button type="button" className="plan-link" onClick={() => navigate("inbox")}>
                <span>去待处理</span>
                <ArrowUpRight size={15} />
              </button>
            )}
          </dd>
        </div>
      </dl>
      {config.profileSharing ? (
        <Button secondary disabled={busy || blocked} onClick={() => toggle(false)}>
          {busy ? "处理中…" : "关闭 MCP 读取"}
        </Button>
      ) : (
        <div className="profile-share">
          <label className="knowledge-confirm">
            <input type="checkbox" checked={agreed} onChange={(e) => setAgreed(e.target.checked)} />
            我确认允许本机 Agent 通过 MCP 读取“个人上下文”正文
          </label>
          <Button disabled={!agreed || busy || blocked || !vault} onClick={() => toggle(true)}>
            {busy ? "处理中…" : "开启 MCP 读取"}
          </Button>
        </div>
      )}
      {error && (
        <p className="inline-error" role="alert">
          {error}
        </p>
      )}
      <section className="mcp-examples" aria-labelledby="k-mcp-examples">
        <h4 id="k-mcp-examples">接入配置示例</h4>
        <p className="zones-note">
          以下只是示例文字，工作台不会自动修改任何 Agent 配置。各 Agent 对 HTTP MCP 的支持与配置写法以其当前版本为准，需本机验证。
          {!mcp?.url && ` MCP 服务当前未启动，示例使用默认地址 ${DEFAULT_MCP_URL}。`}
        </p>
        <div className="mcp-example-grid">
          {mcpExamples(url).map((item) => (
            <article key={item.agent} className="mcp-example" aria-labelledby={`mcp-${item.agent.replace(/\s/g, "")}`}>
              <h5 id={`mcp-${item.agent.replace(/\s/g, "")}`}>{item.agent}</h5>
              <small>{item.where}</small>
              <pre tabIndex={0}>{item.text}</pre>
            </article>
          ))}
        </div>
      </section>
    </section>
  );
}
