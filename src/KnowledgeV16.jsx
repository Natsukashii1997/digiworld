import React, { useEffect, useRef, useState } from "react";
import {
  BookOpen,
  FileText,
  Plus,
  Search,
  Lock,
  LockOpen,
  X,
  ArrowUpRight,
  Copy,
  RefreshCw,
} from "lucide-react";
import { Button, Dialog, PageHeading } from "./components.jsx";
import { request } from "./api.js";
import { KnowledgeForm, KnowledgeSource } from "./Knowledge.jsx";
import { KnowledgeClip } from "./KnowledgeClip.jsx";
import { KnowledgeCandidate } from "./KnowledgeCandidate.jsx";
import {
  ZoneRules,
  ProfilePanel,
  useZoneSummary,
  zonesConfig,
  vaultOf,
  mcpExamples,
} from "./KnowledgeZones.jsx";
import { weekStart, zoneOf } from "./knowledge-zones.js";
import { AGENT_CAST, CHARACTERS } from "./characters.js";
import { AgentSprite } from "./v14.jsx";
import "./knowledge-v16.css";

const sourceHue = (source) =>
  source.kind === "obsidian" ? "168,145,255" : source.kind === "feishu" ? "83,158,255" : "77,227,255";
const wholeFeishuSpace = (source) => source?.kind === "feishu" && source.root?.startsWith("feishu://space/");
const sourceType = (source) =>
  source.kind === "obsidian" ? "OBSIDIAN" : wholeFeishuSpace(source) ? "FEISHU SPACE" : source.kind === "feishu" ? "FEISHU" : "MARKDOWN";
const titleOf = (path) => path.split("/").at(-1).replace(/\.md$/i, "");

// Plain-text chapter anchors preserve every original character and skip code fences.
function profileLines(content) {
  let fence = null;
  return content.split("\n").map((text, index) => {
    const marker = /^ {0,3}(`{3,}|~{3,})/.exec(text)?.[1];
    if (marker) {
      if (!fence) fence = marker;
      else if (marker[0] === fence[0] && marker.length >= fence.length)
        fence = null;
      return { text, index, title: null };
    }
    return {
      text,
      index,
      title: fence
        ? null
        : /^ {0,3}#{1,6}[ \t]+(.+?)(?:[ \t]+#+)?[ \t]*$/.exec(text)?.[1] ||
          null,
    };
  });
}

// Approved hub geometry. Lines describe metadata connection, never Agent permissions.
function HubLines({
  count,
  right = false,
  active = [],
  failed = [],
  broken = false,
}) {
  return (
    <svg
      className="kh-lines"
      viewBox="0 0 100 420"
      preserveAspectRatio="none"
      aria-hidden="true"
    >
      {Array.from({ length: count }, (_, index) => {
        const y = count === 1 ? 210 : 36 + (index * 348) / (count - 1);
        const path = right
          ? `M0 210 C50 210 50 ${y} 100 ${y}`
          : `M0 ${y} C50 ${y} 50 210 100 210`;
        const brokenLine = broken || failed[index];
        return (
          <g key={index}>
            <path
              d={path}
              className={brokenLine ? "broken" : active[index] ? "on" : "off"}
            />
            {active[index] && !brokenLine && <path d={path} className="flow" />}
          </g>
        );
      })}
    </svg>
  );
}

export function SourcePolicy({ source, busy, blocked, onSave }) {
  const remote = source.kind === "feishu";
  const [sharing, setSharing] = useState(source.agentSharing === true),
    [excluded, setExcluded] = useState(
      (source.excludedFolders || []).join("\n"),
    ),
    [confirmed, setConfirmed] = useState(false);
  useEffect(() => {
    setSharing(source.agentSharing === true);
    setExcluded((source.excludedFolders || []).join("\n"));
    setConfirmed(false);
  }, [source.id, source.generation]);
  return (
    <form
      className="kh-policy"
      onSubmit={(e) => {
        e.preventDefault();
        if (confirmed)
          onSave({
            sourceId: source.id,
            agentSharing: sharing,
            excludedFolders: excluded
              ? excluded.split("\n").filter((v) => v.length > 0)
              : [],
          });
      }}
    >
      <h3>Agent 只读范围</h3>
      <p>
        {remote
          ? "默认关闭。仅开放已核验的这个 Wiki 节点及其子树中的可读 Docx；个人说明单独授权。若需缩小范围，请断开后登记更具体的节点。"
          : "默认关闭。个人说明单独授权；排除范围也约束本人检索，并保护重叠来源。范围变更会关闭相关重叠来源的旧授权。"}
      </p>
      {remote && <p className="detail-footnote">开放后，同机可连接本机知识 MCP 的其他进程也可能读取此源；请按这个访问范围决定是否开放。</p>}
      <label className="confirm-line">
        <input
          type="checkbox"
          checked={sharing}
          disabled={busy || blocked}
          onChange={(e) => {
            setSharing(e.target.checked);
            setConfirmed(false);
          }}
        />
        开放知识给 Agent
      </label>
      {!remote && <label>
        排除文件夹（每行一个相对目录）
        <textarea
          aria-label="排除文件夹（每行一个相对目录）"
          rows={4}
          value={excluded}
          disabled={busy || blocked}
          onChange={(e) => {
            setExcluded(e.target.value);
            setConfirmed(false);
          }}
          placeholder="例如：排除资料"
        />
      </label>}
      <label className="confirm-line">
        <input
          type="checkbox"
          checked={confirmed}
          disabled={busy || blocked}
          onChange={(e) => setConfirmed(e.target.checked)}
        />
        我已核对知识开放与排除范围
      </label>
      <Button disabled={!confirmed || busy || blocked}>保存知识范围</Button>
    </form>
  );
}

function FeishuConnectForm({ busy, pending, error, onSubmit, onRefresh, onCancel }) {
  const [name, setName] = useState("");
  const [wikiUrl, setWikiUrl] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  return <form className="asset-form" onSubmit={(event) => {
    event.preventDefault();
    if (confirmed) onSubmit({ name, wikiUrl });
  }}>
    <p className="form-intro">只登记你明确选定的飞书 Wiki 节点及其子树。登记不访问账号；之后由你亲自授权，再点“核验范围”。</p>
    <label>来源名称<input required maxLength={100} value={name} disabled={!!busy || pending}
      onChange={(event) => setName(event.target.value)} /></label>
    <label>Wiki 节点链接或 token<input required value={wikiUrl} disabled={!!busy || pending}
      placeholder="https://feishu.cn/wiki/…" onChange={(event) => setWikiUrl(event.target.value)} /></label>
    <p className="detail-footnote">仅保存节点位置、空间身份和必要状态；不保存登录凭据或文档正文。当前只读取 Docx 文本，其他类型显示部分覆盖。</p>
    <label className="knowledge-confirm"><input type="checkbox" checked={confirmed} disabled={!!busy || pending}
      onChange={(event) => setConfirmed(event.target.checked)} />
      <span>我确认仅登记这个节点及其子树，不自动开放给 Agent</span></label>
    {error && <p className="inline-error" role="alert">{error}</p>}
    {pending && <p role="status">登记结果待核对，请先刷新连接列表。</p>}
    <div className="heading-actions"><Button type="button" secondary disabled={!!busy} onClick={onCancel}>取消</Button>
      {pending ? <Button type="button" disabled={!!busy} onClick={onRefresh}>刷新连接核对</Button>
        : <Button type="submit" disabled={!!busy || !confirmed}>{busy ? "处理中…" : "登记飞书来源"}</Button>}
    </div>
  </form>;
}

function FeishuSpaceConnectForm({ busy, pending, error, onSubmit, onRefresh, onCancel }) {
  const [listed, setListed] = useState(null);
  const [loadError, setLoadError] = useState("");
  const [spaceId, setSpaceId] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  useEffect(() => {
    let active = true;
    request("/knowledge/feishu/spaces")
      .then((result) => { if (active) setListed(result); })
      .catch((failure) => { if (active) setLoadError(failure.message); });
    return () => { active = false; };
  }, []);
  const space = listed?.spaces?.find((item) => item.spaceId === spaceId);
  return <form className="asset-form" onSubmit={(event) => {
    event.preventDefault();
    if (space && confirmed) onSubmit({ name: space.name, spaceId: space.spaceId });
  }}>
    <p className="form-intro">选择一个飞书 Wiki 知识空间。只读范围包含该空间所有顶层节点及其子树；不会自动开放给 Agent。</p>
    <label>飞书知识空间<select required value={spaceId} disabled={!!busy || pending || !listed}
      onChange={(event) => setSpaceId(event.target.value)}>
      <option value="">{listed ? "请选择知识空间" : "正在读取可访问的知识空间…"}</option>
      {(listed?.spaces || []).map((item) => <option key={item.spaceId} value={item.spaceId}>{item.name}</option>)}
    </select></label>
    {listed?.partial && <p role="status">空间列表未完整返回；未显示的空间暂不能在这里选择。</p>}
    {loadError && <p className="inline-error" role="alert">{loadError}</p>}
    <p className="detail-footnote">仅保存空间位置、本人身份摘要与核验状态。当前只检索原生 Docx 文本；文件、表格和快捷方式显示为部分覆盖，正文不保存到工作台。</p>
    <label className="knowledge-confirm"><input type="checkbox" checked={confirmed} disabled={!!busy || pending || !space}
      onChange={(event) => setConfirmed(event.target.checked)} />
      <span>我确认只读接入这个知识空间及其子树，Agent 共享保持关闭</span></label>
    {error && <p className="inline-error" role="alert">{error}</p>}
    {pending && <p role="status">登记结果待核对，请先刷新连接列表。</p>}
    <div className="heading-actions"><Button type="button" secondary disabled={!!busy} onClick={onCancel}>取消</Button>
      {pending ? <Button type="button" disabled={!!busy} onClick={onRefresh}>刷新连接核对</Button>
        : <Button type="submit" disabled={!!busy || !space || !confirmed}>{busy ? "处理中…" : "登记整个知识空间"}</Button>}
    </div>
  </form>;
}

function FeishuRemoveForm({ source, busy, pending, error, onSubmit, onRefresh, onCancel }) {
  const [confirmed, setConfirmed] = useState(false);
  return <form className="asset-form" onSubmit={(event) => { event.preventDefault(); if (confirmed) onSubmit({ sourceId: source.id }); }}>
    <strong>{source.name}</strong>
    <p className="detail-footnote">只移除工作台中的飞书连接和 Agent 开放状态，不删除或修改飞书文档。</p>
    <label className="knowledge-confirm"><input type="checkbox" checked={confirmed} disabled={!!busy || pending}
      onChange={(event) => setConfirmed(event.target.checked)} /><span>我确认仅断开这个飞书知识源</span></label>
    {error && <p className="inline-error" role="alert">{error}</p>}
    {pending && <p role="status">断开结果待核对，请先刷新连接列表。</p>}
    <div className="heading-actions"><Button type="button" secondary disabled={!!busy} onClick={onCancel}>取消</Button>
      {pending ? <Button type="button" disabled={!!busy} onClick={onRefresh}>刷新连接核对</Button>
        : <Button type="submit" disabled={!!busy || !confirmed}>{busy ? "处理中…" : "确认断开"}</Button>}
    </div>
  </form>;
}

export function KnowledgeV16({ state, adoptState, notify, navigate, onKnowledgeRead, knowledgeJump }) {
  const sources = state.connections?.knowledgeSources || [];
  const sourceHealth = state.connections?.knowledgeSourceHealth || [];
  const scopeBlocked = (source) => !!source && sourceHealth.some((health) => {
    if (health.status !== "needs_reconfirmation") return false;
    const pendingSource = sources.find((item) => item.id === health.sourceId);
    const a = source.root?.normalize("NFC").toLowerCase(), b = pendingSource?.root?.normalize("NFC").toLowerCase();
    return a && b && (a === b || a.startsWith(`${b}/`) || b.startsWith(`${a}/`));
  });
  const config = zonesConfig(state),
    vault = vaultOf(state);
  const [summary, setSummary] = useZoneSummary();
  useEffect(()=>{ if(summary.loaded)onKnowledgeRead?.(summary); },[summary,onKnowledgeRead]);
  const [profileMeta, setProfileMeta] = useState(null);
  const [sourceEpoch, setSourceEpoch] = useState(0);
  const [query, setQuery] = useState(""),
    [result, setResult] = useState(null),
    [filter, setFilter] = useState("");
  const [drawer, setDrawer] = useState(null),
    [document, setDocument] = useState(null);
  const [counts, setCounts] = useState({}),
    [busy, setBusy] = useState(""),
    [error, setError] = useState("");
  const [pending, setPending] = useState(false),
    [fallback, setFallback] = useState("");
  const [agentUse, setAgentUse] = useState(null);
  const [mcpClients, setMcpClients] = useState(null);
  const clientCheck = useRef(0);
  function loadMcpClients() {
    const ticket = ++clientCheck.current;
    setMcpClients(null);
    request("/knowledge/mcp-clients")
      .then((value) => {
        if (ticket === clientCheck.current)
          setMcpClients(value?.agents ? value : { error: true });
      })
      .catch(() => {
        if (ticket === clientCheck.current) setMcpClients({ error: true });
      });
  }
  useEffect(() => {
    let active = true;
    const load = () => request("/capability-usage").then((value) => { if (active) setAgentUse(value); })
      .catch((error) => { if (active) setAgentUse({ error: error.message }); });
    load(); window.addEventListener("focus", load);
    return () => { active = false; window.removeEventListener("focus", load); };
  }, []);
  useEffect(() => {
    loadMcpClients();
    window.addEventListener("focus", loadMcpClients);
    return () => {
      clientCheck.current++;
      window.removeEventListener("focus", loadMcpClients);
    };
  }, []);
  const sequence = useRef(0),
    lock = useRef(false),
    clipBusy = useRef(false);
  useEffect(() => {
    if (knowledgeJump?.taskId) {
      const task = (state.knowledgeTasks || []).find(item => item.id === knowledgeJump.taskId);
      if (task) setDrawer({ mode: "candidate", taskId: task.id });
      return;
    }
    const source = sources.find((item) => item.id === knowledgeJump?.id);
    if (source) setDrawer({ mode:"source", source });
  }, [knowledgeJump?.key]);
  const profilePolicyKey = JSON.stringify([config.sourceId, config.rules]);
  useEffect(() => {
    sequence.current++;
    lock.current = false;
    setBusy("");
    setDocument(null);
    setProfileMeta(null);
  }, [profilePolicyKey]);
  const sourceKey = sources
    .map((s) => `${s.id}:${s.generation}:${s.root}:${s.identity}`)
    .join("|");
  useEffect(() => {
    sequence.current++;
    lock.current = false;
    setResult(null);
    setDocument(null);
    setCounts({});
    setProfileMeta(null);
    setBusy("");
    setDrawer((current) => {
      if (current?.mode !== "source") return current;
      const updated = sources.find((s) => s.id === current.source.id);
      return updated ? { ...current, source: updated } : null;
    });
  }, [sourceKey]);
  useEffect(
    () => () => {
      sequence.current++;
    },
    [],
  );
  const valid = (ticket) => ticket === sequence.current;
  function changeQuery(value) {
    sequence.current++;
    lock.current = false;
    setBusy("");
    setQuery(value);
    setResult(null);
    setDocument(null);
    setError("");
    setFilter("");
  }
  async function copy(text) {
    try {
      await navigator.clipboard.writeText(text);
      setFallback("");
      notify("接入配置已复制");
    } catch {
      setFallback(text);
      setDrawer({ mode: "copy" });
    }
  }
  function agentConfig(agent) {
    const url = summary.mcp?.url;
    if (!url) {
      setDrawer({ mode: "profile" });
      notify(
        summary.loadError
          ? "MCP 状态未知，请先重新核验"
          : "MCP 未运行，请在个人说明中核对地址",
        "warning",
      );
      return;
    }
    const example = mcpExamples(url).find((item) => item.agent === agent.name);
    copy(
      example?.text ||
        JSON.stringify(
          { mcpServers: { "workbench-profile": { url } } },
          null,
          2,
        ),
    );
  }
  async function refresh() {
    if (lock.current) return;
    lock.current = true;
    const ticket = ++sequence.current;
    setResult(null);
    setDocument(null);
    setCounts({});
    setProfileMeta(null);
    setBusy("refresh");
    setSourceEpoch((v) => v + 1);
    request("/capability-usage").then(setAgentUse).catch((e) => setAgentUse({ error: e.message }));
    loadMcpClients();
    try {
      const [workspaceResult, summaryResult] = await Promise.allSettled([
        request("/workspace"),
        request("/knowledge/zones/summary", {}),
      ]);
      if (!valid(ticket)) return;
      if (summaryResult.status === "fulfilled")
        setSummary({ ...summaryResult.value, loaded: true, loadError: null });
      else
        setSummary({ latest: null, mcp: null, loaded: true, loadError: summaryResult.reason?.message || "三区摘要读取失败" });
      if (workspaceResult.status === "fulfilled") {
        const next = workspaceResult.value;
        adoptState(next);
        setPending(false);
        setError("");
        setDrawer((d) => {
          if (!d) return null;
          const connected = next.connections?.knowledgeSources || [];
          if (d.mode === "connect")
            return connected.some((source) => source.root === d.input?.root) ? null : d;
          if (d.source) {
            const updated = connected.find((source) => source.id === d.source.id);
            return !updated || updated.generation !== d.source.generation ? null : { ...d, source: updated };
          }
          return d;
        });
        notify("连接状态已刷新，请核对列表");
      } else setError(workspaceResult.reason?.message || "连接状态读取失败");
    } catch (failure) {
      if (valid(ticket)) {
        setError(failure.message);
        setSummary({
          latest: null,
          mcp: null,
          loaded: true,
          loadError: failure.message,
        });
      }
    } finally {
      if (valid(ticket)) {
        lock.current = false;
        setBusy("");
      }
    }
  }
  async function mutate(mode, input) {
    if (lock.current || pending) return;
    lock.current = true;
    const ticket = ++sequence.current;
    setBusy(mode);
    setError("");
    setDrawer((d) => d && { ...d, input });
    try {
      const next = await request(
        `/knowledge/${mode}`,
        { ...input, confirmed: true, expectedRevision: state.revision },
        "POST",
        false,
      );
      if (!valid(ticket)) return;
      adoptState(next);
      setDrawer(
        ["reconfirm", "policy", "feishu/verify"].includes(mode)
          ? {
              mode: "source",
              source: next.connections.knowledgeSources.find(
                (s) => s.id === input.sourceId,
              ),
            }
          : null,
      );
      notify(
        mode === "policy"
          ? "知识范围已保存，请重新查询"
          : mode === "feishu/verify"
            ? "飞书来源范围已核验；Agent 共享仍需单独授权"
          : ["feishu/connect", "feishu/connect-space"].includes(mode)
            ? "飞书来源已登记，需本人授权并核验后才可读取"
          : mode === "reconfirm"
            ? "目录已重新确认，回执已保存；请重新扫描并单独决定是否开放给 Agent"
          : mode === "remove"
            ? "已断开连接，源文件未改动"
            : "知识源已连接，尚未扫描",
      );
    } catch (failure) {
      if (valid(ticket)) {
        setError(failure.message);
        if (!failure.status || failure.status === 409) setPending(true);
      }
    } finally {
      if (valid(ticket)) {
        lock.current = false;
        setBusy("");
      }
    }
  }
  async function search(continuingSource = null) {
    if (lock.current || pending || !query.trim() || !sources.length) return;
    if (
      query.trim().length > 100 ||
      /[\x00-\x1f\x7f-\x9f\u2028\u2029]/.test(query)
    ) {
      setError("请输入1–100字符的单行短语。");
      return;
    }
    lock.current = true;
    const ticket = ++sequence.current;
    setBusy("search");
    setError("");
    if (!continuingSource) setResult(null);
    setDocument(null);
    try {
      const previous = continuingSource ? result : null;
      const found = await request("/knowledge/search-all", {
        query: query.trim(),
        ...(previous?.nextCursor ? { cursor: previous.nextCursor } : {}),
      });
      if (!valid(ticket)) return;
      const failed = new Set(
        found.coverage
          .filter((c) => c.status === "failed")
          .map((c) => c.sourceId),
      );
      const rows = [
        ...(previous?.results || []).filter((r) => !failed.has(r.sourceId)),
        ...found.results,
      ];
      const stats = {};
      for (const c of found.coverage) {
        const source = sources.find((s) => s.id === c.sourceId);
        if (source)
          stats[c.sourceId] = {
            generation: source.generation,
            status: c.status,
            code: c.code,
            total: c.scanned,
            changed: c.updatedThisWeek ?? 0,
            weeklyKnown: c.weeklyKnown === true,
            partial: c.scanStatus !== "complete",
          };
      }
      setCounts(stats);
      setResult({
        ...found,
        results: rows,
        coverage: found.coverage.map((c) => ({
          ...c,
          name: c.sourceName,
          total: c.scanned,
          expiresAt: found.expiresAt,
        })),
      });
      if (found.coverage.some((item) => item.code === "KNOWLEDGE_ROOT_IDENTITY_CHANGED"))
        request("/workspace").then((next) => { if (valid(ticket)) adoptState(next); }).catch(() => {});
    } catch (failure) {
      if (valid(ticket)) {
        setResult(null);
        setError(failure.message);
        if (failure.status === 409) request("/workspace").then(adoptState).catch(() => {});
      }
    } finally {
      if (valid(ticket)) {
        lock.current = false;
        setBusy("");
      }
    }
  }
  async function openResult(row) {
    if (lock.current) return;
    lock.current = true;
    const ticket = ++sequence.current;
    setBusy("read");
    setError("");
    setDocument(null);
    setDrawer({ mode: "note", row });
    try {
      const value = await request("/knowledge/read-note", {
        sourceId: row.sourceId,
        path: row.path,
        expectedSha256: row.sha256,
      });
      if (!valid(ticket)) return;
      if (value.sha256 !== row.sha256)
        throw new Error("原文已变化，请重新检索。");
      setDocument(value);
    } catch (failure) {
      if (valid(ticket)) {
        setResult(null);
        setError(failure.message);
        if (failure.status === 409) request("/workspace").then(adoptState).catch(() => {});
      }
    } finally {
      if (valid(ticket)) {
        lock.current = false;
        setBusy("");
      }
    }
  }
  async function previewProfile() {
    if (!vault || lock.current) return;
    lock.current = true;
    const ticket = ++sequence.current;
    setBusy("profile");
    setError("");
    setDocument(null);
    try {
      const value = await request("/knowledge/profile/read-preview", {});
      if (valid(ticket)) {
        setDocument({ ...value, profile: true });
        const headings = value.files.flatMap((f) =>
          profileLines(f.content).filter((l) => l.title),
        );
        const modified = value.files
          .map((f) => f.modifiedAt)
          .filter((v) => Number.isFinite(Date.parse(v)))
          .sort((a, b) => Date.parse(b) - Date.parse(a))[0];
        setProfileMeta({
          chapters: headings.length || value.files.length,
          chars: value.files.reduce((n, f) => n + f.content.length, 0),
          partial: value.partial,
          modified,
        });
      }
    } catch (failure) {
      if (valid(ticket)) setError(failure.message);
    } finally {
      if (valid(ticket)) {
        lock.current = false;
        setBusy("");
      }
    }
  }
  function closeDrawer() {
    if (
      clipBusy.current ||
      busy &&
      ["connect", "feishu/connect", "feishu/connect-space", "remove", "reconfirm", "source"].includes(drawer?.mode)
    )
      return;
    sequence.current++;
    lock.current = false;
    setBusy("");
    setDrawer(null);
    setDocument(null);
    setError("");
  }
  useEffect(() => {
    if (!result) return;
    const expires = result.coverage
      .map((c) => Date.parse(c.expiresAt))
      .filter(Number.isFinite);
    if (!expires.length) return;
    const timer = setTimeout(
      () => {
        sequence.current++;
        lock.current = false;
        setBusy("");
        setResult(null);
        setDocument(null);
        setError("检索已过期，请重新查询。");
      },
      Math.max(0, Math.min(...expires) - Date.now()),
    );
    return () => clearTimeout(timer);
  }, [result]);
  const shown =
    result?.results.filter((r) => !filter || r.sourceId === filter) || [];
  const pendingProposals = (state.profileProposals || []).filter(
    (p) => p.status === "pending",
  ).length;
  const mcp = summary.mcp;
  const agentTotal = AGENT_CAST.length;
  const readyCount = AGENT_CAST.filter((agent) => mcpClients?.agents?.[agent.id]?.state === "ready").length;
  return (
    <>
      <PageHeading
        page="knowledge"
        help={
          <button
            className="page-help"
            aria-label="知识仓库说明"
            onClick={() => setDrawer({ mode: "help" })}
          >
            ?
          </button>
        }
        action={
          <Button
            disabled={!!busy || pending}
            onClick={() => setDrawer({ mode: "connect" })}
          >
            <Plus size={16} />
            接入知识库
          </Button>
        }
      />
      {pending && (
        <p className="inline-error" role="status">
          操作结果待核对。请先刷新连接核对，不要重复提交。
          <Button
            secondary
            onClick={() => refresh().catch((e) => setError(e.message))}
          >
            刷新连接核对
          </Button>
        </p>
      )}
      {summary.loadError && (
        <p role="status" className="inline-error">
          MCP 状态未知，摘要读取失败。
          <Button secondary disabled={!!busy} onClick={refresh}>
            重新核验 MCP 状态
          </Button>
        </p>
      )}
      {error && !drawer && (
        <p role="alert" className="inline-error">
          {error}
        </p>
      )}
      <section className="kh-search-sec" aria-label="跨库检索">
        <Button secondary onClick={() => setDrawer({ mode: "clip/recovery" })}>
          核对剪藏是否保存
        </Button>
        <span className="kh-clip-recovery-hint">仅在保存结果不明时使用</span>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            search();
          }}
        >
          <label className="kh-search">
            <Search size={20} />
            <input
              type="search"
              aria-label="跨库检索"
              value={query}
              onChange={(e) => changeQuery(e.target.value)}
              placeholder="在所有知识库里找……"
              onKeyDown={(e) => {
                if (e.nativeEvent.isComposing && e.key === "Enter")
                  e.preventDefault();
              }}
            />
            {query ? (
              <button
                type="button"
                className="kh-clear icon-button"
                aria-label="清空"
                onClick={() => changeQuery("")}
              >
                <X size={16} />
              </button>
            ) : (
              <span className="kh-scope en">{sources.length} 个库</span>
            )}
            {query && (
              <button
                type="submit"
                className="kh-submit"
                disabled={!!busy || pending || !sources.length}
              >
                检索
              </button>
            )}
          </label>
        </form>
        {busy === "search" && <p role="status">正在查询知识库…</p>}
        {result && (
          <>
            <div className="kh-res-head">
              <div className="kh-filter" role="group" aria-label="按源筛选">
                {[{ id: "", name: "全部" }, ...sources].map((s) => (
                  <button
                    key={s.id}
                    type="button"
                    aria-pressed={filter === s.id}
                    className={filter === s.id ? "on" : ""}
                    onClick={() => setFilter(s.id)}
                  >
                    {s.name}
                    <b>
                      {
                        result.results.filter(
                          (r) => !s.id || r.sourceId === s.id,
                        ).length
                      }
                    </b>
                  </button>
                ))}
              </div>
              <span className="kh-res-n" role="status">
                {result.totalSources} 个库中 {result.searchedSources} 个已查 ·{" "}
                {result.results.length} 条命中
              </span>
            </div>
            {result.coverage.some((c) => c.status !== "complete") && (
              <details className="kh-coverage">
                <summary>查询覆盖与未完成范围</summary>
                {result.coverage.map((c) => (
                  <p key={c.sourceId}>
                    {c.name}：
                    {c.status === "failed"
                      ? c.message
                      : c.status === "complete"
                        ? "查询完成"
                        : c.status === "unsearched"
                          ? "尚未查询，范围未知"
                          : `部分查询：已扫描 ${c.scanned} 篇、已尝试 ${c.attempted} 篇；其余范围未知`}
                  </p>
                ))}
              </details>
            )}
            <ol className="kh-results">
              {shown.map((r) => (
                <li key={`${r.sourceId}:${r.path}`}>
                  <button
                    className="kh-res"
                    style={{ "--hue": sourceHue({ kind: r.sourceKind }) }}
                    onClick={() => openResult(r)}
                    disabled={!!busy}
                    aria-label={`查看原文：${r.sourceName}/${r.displayPath || r.path}`}
                  >
                    <span className="kh-res-tag en">
                      {sourceType({ kind: r.sourceKind })}
                    </span>
                    <span className="kh-res-main">
                      <b>{r.title}</b>
                      <span className="pj-path">
                        {r.sourceName}/{r.displayPath || r.path}
                      </span>
                      <span className="kh-ex">
                        {r.snippets?.map((s, i) => (
                          <React.Fragment key={i}>
                            {s.text.slice(0, s.matchStart)}
                            <mark>
                              {s.text.slice(s.matchStart, s.matchEnd)}
                            </mark>
                            {s.text.slice(s.matchEnd)}{" "}
                          </React.Fragment>
                        ))}
                      </span>
                    </span>
                    <ArrowUpRight size={16} />
                  </button>
                </li>
              ))}
            </ol>
            {result.nextCursor && (
              <Button
                secondary
                disabled={!!busy}
                onClick={() => search("continue")}
              >
                继续查询
              </Button>
            )}
            {!shown.length && (
              <p role="status">
                {result.coverage.some((c) => c.status !== "complete")
                  ? "已查范围未命中；其余范围仍未知。"
                  : "当前查询范围未找到该短语。"}
              </p>
            )}
          </>
        )}
      </section>
      <div className="sec-head kh-hub-head">
        <h2 className="en-head">
          <span className="en">HUB</span>数据中枢
        </h2>
        <span className="sec-meta" aria-live="polite">{sources.length} 个库 · {mcpClients?.error ? `${agentTotal} 位接入状态未知` : mcpClients?.agents ? `${readyCount}/${agentTotal} 位已核实就绪` : `${agentTotal} 位接入核验中`}</span>
      </div>
      <section className="kh-hub" aria-label="数据中枢">
        <div className="kh-col kh-srcs" style={{ minHeight: 420 }}>
          {sources.map((s) => {
            const stat =
              counts[s.id]?.generation === s.generation && counts[s.id];
            const health = sourceHealth.find((item) => item.sourceId === s.id);
            return (
              <button
                key={s.id}
                className={`kh-src${s.kind === "feishu" && (!s.feishuSpaceId || scopeBlocked(s) || stat?.status === "failed") ? " warn" : stat?.status === "failed" ? " failed" : ""}`}
                style={{ "--hue": sourceHue(s) }}
                aria-label={s.name}
                aria-describedby={`kh-source-status-${s.id} kh-source-lock-${s.id}`}
                onClick={() => setDrawer({ mode: "source", source: s })}
              >
                <span className="kh-src-ic">
                  {s.kind === "obsidian" ? (
                    <BookOpen size={20} />
                  ) : (
                    <FileText size={20} />
                  )}
                </span>
                <span className="kh-src-main">
                  <span className="en">{sourceType(s)}</span>
                  <b>{s.name}</b>
                  <span className="kh-src-meta" id={`kh-source-status-${s.id}`}>
                    {s.kind === "feishu" && !s.feishuSpaceId
                      ? "需授权 · 来源范围待核验"
                      : s.kind === "feishu" && ["FEISHU_AUTH_REQUIRED", "FEISHU_NEEDS_VERIFICATION"].includes(stat?.code)
                      ? "需授权 · 读取暂停"
                      : s.kind === "feishu" && health?.status === "needs_reconfirmation"
                      ? "需重新核验 · 读取暂停"
                      : s.kind === "feishu" && stat?.status === "failed"
                      ? "飞书读取失败 · 范围未知"
                      : health?.status === "needs_reconfirmation"
                      ? "需重新确认目录 · 读取暂停"
                      : scopeBlocked(s)
                      ? "重叠目录待确认 · 读取暂停"
                      : stat?.status === "failed"
                      ? "读取失败 · 核对目录或权限"
                      : stat?.status === "unsearched"
                        ? "篇数未知 · 尚未查询"
                        : stat
                          ? `${stat.partial ? "仅扫描 " : ""}${stat.total} 篇${s.kind === "feishu" ? ` · ${stat.weeklyKnown ? `本周更新 +${stat.changed}` : "本周更新未知"}` : ` · 本周更新 +${stat.changed}`}`
                          : "篇数未知 · 尚未扫描"}
                  </span>
                </span>
                <span
                  className={`kh-lock${s.agentSharing ? " open" : ""}`}
                  id={`kh-source-lock-${s.id}`}
                  title={s.agentSharing ? "已开放给 Agent" : "未开放给 Agent"}
                >
                  {s.agentSharing ? <LockOpen size={13} /> : <Lock size={13} />}
                  <span className="sr-only">{s.agentSharing ? "已开放给 Agent" : "未开放给 Agent"}</span>
                </span>
              </button>
            );
          })}
          <button
            className="kh-src kh-add"
            onClick={() => setDrawer({ mode: "connect" })}
          >
            <Plus size={18} />
            <b>{sources.length ? "接入知识库" : "接入第一个知识库"}</b>
          </button>
        </div>
        <HubLines
          broken={
            summary.loaded &&
            !summary.loadError &&
            sources.length > 0 &&
            !mcp?.url
          }
          count={Math.max(1, sources.length + 1)}
          active={sources.map((s) => !(s.kind === "feishu" && (!s.feishuSpaceId || scopeBlocked(s))) && counts[s.id]?.status !== "failed")}
          failed={sources.map((s) => (s.kind === "feishu" && (!s.feishuSpaceId || scopeBlocked(s))) || counts[s.id]?.status === "failed")}
        />
        <div className="kh-center">
          <button
            className={`kh-chip${!sources.length ? " dim" : summary.loaded && !summary.loadError && mcp && !mcp.url ? " down" : ""}`}
            aria-label="个人说明与 MCP"
            onClick={() => setDrawer({ mode: "profile" })}
          >
            <span className="kh-chip-pins" aria-hidden="true" />
            <span className="kh-chip-core">
              <span className="en">PROFILE · MCP</span>
              <b>个人说明</b>
              <span className="kh-chip-line">
                {sources.length
                  ? vault && profileMeta
                    ? `已预览 ${profileMeta.chapters} 章 · ${profileMeta.chars} 字${profileMeta.partial ? " · 部分" : ""}`
                    : vault ? "章节 / 字数未知 · 打开预览" : "未找到 · 先接入本机个人说明知识源"
                  : "未找到 · 先接入含个人说明的知识库"}
              </span>
              {vault && (
                <span className="kh-chip-modified">
                  {profileMeta?.modified
                    ? `预览最近修改 ${new Date(profileMeta.modified).toLocaleString("zh-CN", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" })}`
                    : "最近修改未知"}
                </span>
              )}
              <span
                className={`kh-mcp ${summary.loadError ? "idle" : mcp?.url ? "ok" : sources.length ? "bad" : "idle"}`}
              >
                <i />
                {summary.loadError
                  ? "MCP 状态未知"
                  : mcp?.url
                    ? `MCP 运行中 · ${new URL(mcp.url).host}`
                    : summary.loaded
                      ? "MCP 未运行"
                      : "MCP 状态读取中"}
              </span>
            </span>
            {pendingProposals > 0 && (
              <span className="kh-badge" title="待采纳建议">
                {pendingProposals}
              </span>
            )}
          </button>
        </div>
        <HubLines right count={agentTotal}
          active={AGENT_CAST.map((agent) => mcpClients?.agents?.[agent.id]?.state === "ready")}
        />
        <div className="kh-col kh-agents" style={{ minHeight: 420 }}>
          {AGENT_CAST.map((a) => {
            const clientState = mcpClients?.agents?.[a.id]?.state;
            const connection = mcpClients?.error
              ? ["接入状态未知", "状态未知"]
              : !mcpClients?.agents
                ? ["接入核验中", "核验中"]
                : clientState === "ready"
                  ? ["接入就绪", "就绪"]
                  : ["接入待核实", "待核实"];
            const usageState = agentUse?.agents?.[a.id]?.state;
            const usage = agentUse?.error
              ? ["读取失败 · 未知", "调用未知"]
              : !agentUse?.agents
                ? ["读取中", "读取中"]
                : usageState === "connected"
                  ? ["近 7 天有调用", "近期调用"]
                  : usageState === "not_connected"
                    ? ["超过 7 天未见调用", "久未调用"]
                    : ["未见可归属调用", "未见记录"];
            return <button
              key={a.id}
              className={`kh-agent${clientState === "ready" ? " on" : ""}`}
              style={{ "--hue": a.hue }}
              aria-label={`${CHARACTERS[a.character].name} · ${connection[0]} · 调用：${usage[0]} · 复制配置`}
              onClick={() => agentConfig(a)}
            >
              <span className="kh-agent-av">
                <AgentSprite agent={a.id} mode="body" fit={a.id === "openclaw" ? 60 : undefined} />
              </span>
              <span className="kh-agent-main">
                <b>{CHARACTERS[a.character].name}</b>
                <span className="kh-agent-st">
                  <span className="kh-agent-st-full"><span className="kh-agent-ready">{connection[0]} · 复制配置</span><span className="kh-agent-use">调用：{usage[0]}</span></span>
                  <span className="kh-agent-st-mobile" aria-hidden="true"><span className="kh-agent-ready">{connection[1]}</span><span className="kh-agent-use">{usage[1]}</span><em>复制配置</em></span>
                </span>
              </span>
            </button>
          })}
        </div>
        <div className="kh-more">
          <span className="en">MORE</span>
          <button
            className="kh-more-item"
            onClick={() => agentConfig({ name: "其他伙伴" })}
          >
            其他伙伴 · 复制配置
          </button>
        </div>
      </section>
      <p className="kh-hub-note">亮态表示本机 MCP 接入核验就绪，知识源仍须单独开放。未见调用留痕不代表客户端未接通。</p>
      {drawer && (
        <Dialog
          drawer
          title={
            drawer.mode === "profile"
              ? "个人说明与 MCP"
              : drawer.mode === "source"
                ? drawer.source.name
                : drawer.mode === "feishu/connect"
                  ? "登记飞书 Wiki 知识源"
                : drawer.mode === "feishu/connect-space"
                  ? "登记整个飞书知识空间"
                : drawer.mode === "note"
                  ? "原文预览"
                : drawer.mode === "candidate"
                  ? "待整理候选"
                : drawer.mode === "clip/recovery"
                  ? "核对剪藏是否保存"
                  : drawer.mode === "help"
                    ? "知识仓库说明"
                    : drawer.mode === "copy"
                      ? "接入配置"
                      : drawer.mode === "connect"
                        ? "连接知识源"
                  : drawer.mode === "remove"
                          ? "断开知识源"
                          : "重新确认目录"
          }
          onClose={closeDrawer}
        >
          <div className="kh-drawer">
            {error &&
              !["connect", "feishu/connect", "feishu/connect-space", "remove", "reconfirm"].includes(drawer.mode) && (
                <p className="inline-error" role="alert">
                  {error}
                </p>
              )}
            {drawer.mode === "feishu/connect" && <FeishuConnectForm
              busy={busy} pending={pending} error={error}
              onSubmit={(input) => mutate("feishu/connect", input)}
              onRefresh={refresh} onCancel={() => setDrawer({ mode: "connect" })} />}
            {drawer.mode === "feishu/connect-space" && <FeishuSpaceConnectForm
              busy={busy} pending={pending} error={error}
              onSubmit={(input) => mutate("feishu/connect-space", input)}
              onRefresh={refresh} onCancel={() => setDrawer({ mode: "connect" })} />}
            {["connect", "remove", "reconfirm"].includes(drawer.mode) &&
              !(drawer.mode === "remove" && drawer.source?.kind === "feishu") && (
              <>
              <KnowledgeForm
                mode={drawer.mode}
                source={drawer.source}
                busy={busy}
                pending={pending}
                error={error}
                onSubmit={(input) => mutate(drawer.mode, input)}
                onRefresh={refresh}
                onCancel={() =>
                  drawer.source
                    ? setDrawer({ mode: "source", source: drawer.source })
                    : closeDrawer()
                }
              />
              {drawer.mode === "connect" && <Button type="button" secondary disabled={!!busy || pending}
                onClick={() => { setError(""); setDrawer({ mode: "feishu/connect" }); }}>
                登记飞书 Wiki 节点
              </Button>}
              {drawer.mode === "connect" && <Button type="button" secondary disabled={!!busy || pending}
                onClick={() => { setError(""); setDrawer({ mode: "feishu/connect-space" }); }}>
                登记整个飞书知识空间
              </Button>}
              </>
            )}
            {drawer.mode === "remove" && drawer.source?.kind === "feishu" &&
              <FeishuRemoveForm source={drawer.source} busy={busy} pending={pending} error={error}
                onSubmit={(input) => mutate("remove", input)} onRefresh={refresh}
                onCancel={() => setDrawer({ mode: "source", source: drawer.source })} />}
            {drawer.mode === "source" && (
              <>
                {drawer.source.kind !== "feishu" && sourceHealth.find((item) => item.sourceId === drawer.source.id)?.status === "confirmed" &&
                  <p className="form-intro" role="status">目录重新确认回执已保存 · {new Date(sourceHealth.find((item) => item.sourceId === drawer.source.id).confirmedAt).toLocaleString("zh-CN")}。Agent 共享仍需单独授权。</p>}
                {drawer.source.kind === "feishu" ? <section className="kh-feishu-source" aria-label="飞书知识源范围">
                  <p>{wholeFeishuSpace(drawer.source)
                    ? "只读范围：所选 Wiki 空间内所有顶层节点及其子树；当前仅覆盖 Docx 文本。快捷方式与其他类型不读取，查询会标示部分覆盖。"
                    : "只读范围：所选 Wiki 节点及其子树；当前仅覆盖 Docx 文本。快捷方式与其他文档类型不读取，查询会标示部分覆盖。"}</p>
                  <code className="knowledge-path">{wholeFeishuSpace(drawer.source) ? "Wiki 空间" : "Wiki 节点"}：{drawer.source.root.split("/").at(-1)}</code>
                  <p role="status">{scopeBlocked(drawer.source)
                    ? "授权或范围已变化，读取暂停；请重新核验。Agent 共享已关闭。"
                    : drawer.source.feishuSpaceId
                    ? `已核验空间 ${drawer.source.feishuSpaceId} · ${new Date(drawer.source.feishuVerifiedAt).toLocaleString("zh-CN")}`
                    : "需本人授权并核验，读取暂停；Agent 共享保持关闭。"}</p>
                  <div className="heading-actions">
                    <Button secondary disabled={!!busy || pending} onClick={() => mutate("feishu/verify", { sourceId: drawer.source.id })}>
                      <RefreshCw size={16} />核验范围
                    </Button>
                    <Button secondary disabled={!!busy || pending} onClick={() => setDrawer({ mode: "remove", source: drawer.source })}>
                      断开连接
                    </Button>
                  </div>
                </section> : <KnowledgeSource
                  key={`${drawer.source.id}:${drawer.source.generation}`}
                  source={
                    sources.find((s) => s.id === drawer.source.id) ||
                    drawer.source
                  }
                  blocked={pending || !!busy}
                  needsReconfirmation={scopeBlocked(drawer.source)}
                  notify={notify}
                  selections={[]}
                  refreshEpoch={sourceEpoch}
                  onRefresh={refresh}
                  onManage={(mode) =>
                    setDrawer({ mode, source: drawer.source })
                  }
                />}
                {drawer.source.kind === "obsidian" && (
                  <ZoneRules
                    state={state}
                    sources={sources}
                    vault={drawer.source}
                    adoptState={adoptState}
                    notify={notify}
                    blocked={pending || scopeBlocked(drawer.source)}
                  />
                )}
                <SourcePolicy
                  source={drawer.source}
                  busy={!!busy}
                  blocked={pending || scopeBlocked(drawer.source) || (drawer.source.kind === "feishu" && !drawer.source.feishuSpaceId)}
                  onSave={(input) => mutate("policy", input)}
                />
              </>
            )}
            {drawer.mode === "profile" && (
              <>
                <Button
                  secondary
                  disabled={!vault || !!busy}
                  onClick={previewProfile}
                >
                  <BookOpen size={16} />
                  {busy === "profile" ? "读取中…" : "预览个人说明"}
                </Button>
                {document?.profile && (
                  <section aria-label="个人说明正文">
                    <nav aria-label="个人说明章节">
                      {document.files.flatMap((f, i) => {
                        const chapters = profileLines(f.content).filter(
                          (l) => l.title,
                        );
                        return (
                          chapters.length
                            ? chapters
                            : [{ index: null, title: titleOf(f.path) }]
                        ).map((chapter) => (
                          <button
                            key={`${f.path}:${chapter.index}`}
                            type="button"
                            onClick={() =>
                              globalThis.document
                                .getElementById(
                                  chapter.index === null
                                    ? `kh-profile-${i}`
                                    : `kh-profile-${i}-${chapter.index}`,
                                )
                                ?.scrollIntoView({ block: "start" })
                            }
                          >
                            {chapter.title}
                          </button>
                        ));
                      })}
                    </nav>
                    {document.files.map((f, i) => (
                      <article id={`kh-profile-${i}`} key={f.path}>
                        <h3>{titleOf(f.path)}</h3>
                        <pre tabIndex={0}>
                          {profileLines(f.content).map((line, index, lines) => (
                            <React.Fragment key={index}>
                              <span
                                id={
                                  line.title
                                    ? `kh-profile-${i}-${index}`
                                    : undefined
                                }
                              >
                                {line.text}
                              </span>
                              {index < lines.length - 1 ? "\n" : ""}
                            </React.Fragment>
                          ))}
                        </pre>
                        {f.truncated && (
                          <p>本篇已达预览字数上限，显示部分原文。</p>
                        )}
                      </article>
                    ))}
                    {!document.files.length && (
                      <p>当前个人说明范围没有 Markdown 文件。</p>
                    )}
                    {document.partial && (
                      <p>仅预览部分范围，未列出的内容仍未知。</p>
                    )}
                  </section>
                )}
                <ProfilePanel
                  state={state}
                  config={config}
                  vault={vault}
                  mcp={mcp}
                  adoptState={adoptState}
                  notify={notify}
                  navigate={navigate}
                  blocked={pending || scopeBlocked(vault)}
                />
                <Button
                  secondary
                  disabled={!mcp?.url}
                  onClick={() => copy(mcpExamples(mcp.url)[0].text)}
                >
                  <Copy size={16} />
                  复制 MCP 接入配置
                </Button>
              </>
            )}
            {drawer.mode === "note" &&
              (document ? (
                <>
                  <h3>{drawer.row.title}</h3>
                  <code className="knowledge-path">
                    {document.sourceName}/{drawer.row.displayPath || document.path}
                  </code>
                  <pre className="knowledge-original" tabIndex={0}>
                    {document.content}
                  </pre>
                  <code className="context-hash">
                    SHA-256 · {document.sha256}
                  </code>
                  <KnowledgeClip key={`${drawer.row.sourceId}:${drawer.row.path}:${document.sha256}`}
                    row={drawer.row} document={document} revision={state.revision}
                    adoptState={adoptState} notify={notify}
                    onBusyChange={value => { clipBusy.current = value; }} />
                  {sources.find((s) => s.id === document.sourceId)?.kind ===
                    "obsidian" && (
                    <a
                      className="button secondary"
                      href={`obsidian://open?path=${encodeURIComponent(`${document.root}/${document.path}`)}`}
                    >
                      在 Obsidian 中打开
                    </a>
                  )}
                </>
              ) : busy === "read" ? (
                <p role="status">正在读取所选原文…</p>
              ) : null)}
            {drawer.mode === "candidate" && <KnowledgeCandidate key={drawer.taskId}
              task={(state.knowledgeTasks || []).find(item => item.id === drawer.taskId)}
              revision={state.revision} adoptState={adoptState} notify={notify}
              onBusyChange={value => { clipBusy.current = value; }} />}
            {drawer.mode === "clip/recovery" &&
              <KnowledgeClip recoveryOnly adoptState={adoptState} notify={notify}
                onBusyChange={value => { clipBusy.current = value; }} />}
            {drawer.mode === "help" && (
              <p>
                知识仓库只读检索已连接的本机目录与本人核验的飞书 Wiki 节点。开放给 Agent
                需要本人授权；个人说明单独授权。篇数依据扫描元数据。Agent
                卡片亮态表示本机工作台 MCP 配置或探针核验就绪，不表示 Obsidian、飞书正文或个人说明已向 Agent 开放。
                下方调用留痕按客户端握手时自报名称归属，区分近 7 天有调用、超过 7 天未见调用和未见可归属调用；未见调用不代表未接通，也不代替当前接入核验。
              </p>
            )}
            {drawer.mode === "copy" && (
              <label>
                复制失败，请手动选择接入配置
                <textarea
                  readOnly
                  rows={6}
                  value={fallback}
                  onFocus={(e) => e.target.select()}
                />
              </label>
            )}
          </div>
        </Dialog>
      )}
    </>
  );
}
