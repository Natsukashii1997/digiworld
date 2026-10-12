import { Reading, ReadReveal } from './ScanMotion.jsx';
import { copyText } from './data-flight.js';
// 派单168：接力台 → 选角 → 发车 → 当前伙伴档案。所有读取和打开都由显式动作触发。
import React, { useEffect, useRef, useState } from "react";
import {
  ArrowRight,
  ChevronDown,
  ChevronUp,
  Clock3,
  Copy,
  FolderGit2,
  History,
  MessagesSquare,
  PenLine,
  RefreshCw,
} from "lucide-react";
import { AgentRoles } from "./AgentRoles.jsx";
import { AgentContents } from "./AgentContents.jsx";
import { HealthAudit } from "./HealthAudit.jsx";
import { AgentWriteLaunch } from "./AgentWriteUI.jsx";
import { Relay } from "./WorkspacePages.jsx";
import { Button, Dialog, PageHeading } from "./components.jsx";
import { AgentSprite, useReducedMotion } from "./v14.jsx";
import { castOf, characterOf } from "./characters.js";
import { request } from "./api.js";
import "./agents-v16.css";
import {RelayLaunch} from "./RelayLaunch.jsx";
const names = {
  "claude-code": "Claude Code",
  codex: "Codex",
  hermes: "Hermes",
  openclaw: "OpenClaw",
};
const time = (value) =>
  value
    ? new Date(value)
        .toLocaleString("zh-CN", {
          year: "numeric",
          month: "2-digit",
          day: "2-digit",
          hour: "2-digit",
          minute: "2-digit",
          hour12: false,
        })
        .replace(" ", " ")
    : "未记录时间";
export function AgentsV16({
  state,
  save,
  adoptState,
  notify,
  onSelect,
  agentContents = {},
  setAgentContents = () => {},
  healthAudit,
  setHealthAudit,
  agentAnchor,
  agentJump,
  discoveryBusy,
  discoveryError,
  detect,
  configuration,
}) {
  const [picked, setPicked] = useState("codex"),
    [tab, setTab] = useState(agentAnchor === "agent-health" ? "体检" : "档案"),
    [help, setHelp] = useState(false),
    [all, setAll] = useState(false),
    [manual, setManual] = useState(false),
    [chooser, setChooser] = useState(false),
    [relayVisible, setRelayVisible] = useState(false);
  const [loaded, setLoaded] = useState(false),
    [listing, setListing] = useState({ sessions: [], sources: [], skipped: 0 }),
    [chosen, setChosen] = useState(null),
    [prepared, setPrepared] = useState(null),
    [open, setOpen] = useState(false),
    [seen, setSeen] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [receipt, setReceipt] = useState("");
  const lock = useRef(false),
    alive = useRef(true),
    scope = useRef(null),
    generation = useRef(0);
  const reduced = useReducedMotion();
  useEffect(() => {
    let key = crypto.randomUUID();
    scope.current = key;
    alive.current = true;
    generation.current++;
    const clear = () => {
      alive.current = false;
      generation.current++;
      request("/relay-sessions/clear", { pageId: key }, "POST", true, {
        keepalive: true,
      }).catch(() => {});
    };
    const restore = (event) => {
      if (!event.persisted || alive.current) return;
      key = crypto.randomUUID();
      scope.current = key;
      alive.current = true;
      generation.current++;
      lock.current = false;
      setBusy(false);
      setLoaded(false);
      setListing({ sessions: [], sources: [], skipped: 0 });
      setChosen(null);
      setPrepared(null);
      setOpen(false);
      setSeen(false);
      setReceipt("");
      setError("");
      setRelayVisible(false);
    };
    window.addEventListener("pageshow", restore);
    window.addEventListener("pagehide", clear);
    return () => {
      window.removeEventListener("pagehide", clear);
      window.removeEventListener("pageshow", restore);
      clear();
    };
  }, []);
  useEffect(() => {
    if (agentAnchor === "agent-health") setTab("体检");
    if (agentJump?.id) {
      setPicked(agentJump.id);
      setTab(agentJump.tab || "内容");
    }
  }, [agentAnchor, agentJump?.id, agentJump?.tab, agentJump?.key]);
  async function prepare(s, n, expand = false) {
    setPrepared(null);
    setSeen(false);
    setOpen(false);
    if (!s) return;
    const result = await request("/relay-sessions/prepare", {
      pageId: scope.current,
      id: s.id,
    });
    if (alive.current && generation.current === n) {
      setPrepared(result);
      if (expand) {
        setOpen(true);
        setSeen(true);
      }
    }
  }
  async function find(earlier) {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setError("");
    setReceipt("");
    setPrepared(null);
    setOpen(false);
    setSeen(false);
    const n = ++generation.current;
    try {
      const list = await request("/relay-sessions/list", {
        pageId: scope.current,
        earlier,
      });
      if (!alive.current || generation.current !== n) return;
      setListing(list);
      setLoaded(true);
      setChosen(list.sessions[0] || null);
    } catch (e) {
      if (alive.current && generation.current === n) setError(e.message);
    } finally {
      if (generation.current === n) {
        lock.current = false;
        if (alive.current) setBusy(false);
      }
    }
  }
  async function choose(s, expand = false) {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setError("");
    setReceipt("");
    setChosen(s);
    setChooser(false);
    const n = ++generation.current;
    try {
      if (expand) await prepare(s, n, true);
      else {
        setPrepared(null);
        setOpen(false);
        setSeen(false);
      }
    } catch (e) {
      if (alive.current && generation.current === n) setError(e.message);
    } finally {
      if (generation.current === n) {
        lock.current = false;
        if (alive.current) setBusy(false);
      }
    }
  }
  async function copy(openApp) {
    if (lock.current || !prepared) return;
    if (!seen) {
      setOpen(true);
      setSeen(true);
      notify("请先预览提示词，再复制或带过去");
      return;
    }
    lock.current = true;
    setBusy(true);
    setError("");
    setReceipt("");
    const n = generation.current;
    try {
      await copyText(prepared.prompt);
      if (!alive.current || generation.current !== n) return;
      setReceipt("TRANSFER OK · 提示词已复制");
      notify("提示词已复制");
      if (openApp) {
        try {
          const r = await request("/relay-sessions/open", { agentId: picked });
          if (alive.current && generation.current === n) {
            setReceipt(
              r.opened ? "TRANSFER OK · 已打开应用，请粘贴发送" : r.reason,
            );
            notify(r.opened ? "已打开应用，请粘贴发送" : r.reason);
          }
        } catch (e) {
          if (alive.current && generation.current === n) {
            setError(`提示词已复制；打开应用未确认：${e.message}`);
          }
        }
      }
    } catch {
      if (alive.current && generation.current === n) {
        setOpen(true);
        setError("复制失败，请从预览中手动复制；应用尚未打开");
      }
    } finally {
      if (generation.current === n) {
        lock.current = false;
        if (alive.current) setBusy(false);
      }
    }
  }
  const cast = castOf(chosen?.agentId),
    target = state.connections?.agents?.find((a) => a.id === picked),
    targetName = target?.name || names[picked] || "豆包工作",
    character = Object.hasOwn(names, picked)
      ? characterOf(picked)?.name || targetName
      : targetName;
  const agents = state.connections?.agents || [];
  const partial =
    listing.incomplete ||
    listing.skipped > 0 ||
    listing.sources.some((s) => s.status !== "ok");
  const launch = relayVisible && chosen && <RelayLaunch open={open} busy={busy} prepared={prepared} picked={picked} targetName={targetName} character={character} copy={copy} onPreview={()=>{if(!prepared){choose(chosen,true);return;}setOpen(!open);setSeen(true);}}/>;
  function toggleRelay() {
    if (relayVisible) {
      setRelayVisible(false);
      setReceipt("");
      return;
    }
    setRelayVisible(true);
    if (!loaded) find(false);
  }
  return (
    <>
      <PageHeading
        page="agents"
        help={
          <button
            type="button"
            className="page-help"
            aria-label="这页怎么用"
            onClick={() => setHelp(true)}
          >
            ?
          </button>
        }
        action={<span className="agent-head-actions">
          <button type="button" className="relay-entry" aria-expanded={relayVisible} onClick={toggleRelay}>
            <span aria-hidden="true">⇄</span> 上下文接力
          </button>
          <button
            type="button"
            className="icon-btn"
            aria-label="重新检测本机入口"
            disabled={discoveryBusy}
            onClick={() => detect()}
          >
            {discoveryBusy ? <Reading mini label="检测本机入口"/> : <RefreshCw size={18}/> }
          </button>
        </span>}
      />
      <ReadReveal pending={discoveryBusy} ready={!discoveryError}/>
      {discoveryError && (
        <p role="alert" className="inline-error">
          {discoveryError}
        </p>
      )}
      {relayVisible && <section
        className={`relay m-screen${loaded && !chosen ? " is-empty" : ""}`}
        aria-labelledby="relay-title"
        aria-busy={busy}
      >
        <div className="relay-top">
          <span className="en">CONTINUE · 接着哪段会话</span>
          <span className="relay-tools">
            {chosen && (
              <button
                type="button"
                className="text-btn"
                disabled={busy}
                onClick={() => setChooser(true)}
              >
                换一段 <b>{listing.sessions.length}</b>
                <ChevronDown size={15} />
              </button>
            )}
            {loaded && (
              <button
                type="button"
                className="text-btn"
                disabled={busy}
                onClick={() => find(true)}
              >
                <History size={15} />
                找更早的
              </button>
            )}
          </span>
        </div>
        {chosen ? (
          <>
            <span className="relay-field-label">会话名称</span>
            <h2 id="relay-title" className="relay-title">
              {chosen.title || "未命名会话"}
            </h2>
            <div className="relay-meta">
              <span
                className="from"
                style={{ "--hue": cast?.hue || "140,178,255" }}
              >
                <span className="mini">
                  <AgentSprite
                    agent={chosen.agentId}
                    mode="body"
                    className="sprite"
                  />
                </span>
                <span className="relay-meta-value"><small>来源 AI</small>{names[chosen.agentId] || chosen.agentId}</span>
              </span>
              <span>
                <FolderGit2 size={14} />
                <span className="relay-meta-value"><small>项目</small>{chosen.project || "未记录项目目录"}</span>
              </span>
              <span>
                <Clock3 size={14} />
                <span className="relay-meta-value"><small>最近更新</small>{time(chosen.updatedAt)}</span>
              </span>
              <span>
                <MessagesSquare size={14} />
                <span className="relay-meta-value"><small>会话轮数</small>{chosen.rounds} 轮</span>
              </span>
            </div>
            {prepared?.quote && (
              <p className="relay-quote">“{prepared.quote}”</p>
            )}
          </>
        ) : (
          <>
            <h2 id="relay-title" className="relay-title muted">
              {!loaded
                ? "找一段会话，继续往前做"
                : partial
                  ? "暂未找到可读取的最近会话"
                  : "没找到最近 7 天的会话"}
            </h2>
            {loaded && (
              <p className="relay-quote">
                {partial
                  ? "已读取范围内没有最近记录；部分伙伴暂不支持或读取受阻，可在「?」查看范围。"
                  : "四位伙伴的本机会话里，最近 7 天没有新记录。可以找更早的，或者手动写一段交接。"}
              </p>
            )}
            <div className="relay-actions">
              {!loaded && <Button secondary disabled={busy} onClick={() => find(false)}>
                <History size={16} />{busy ? <Reading mini label="读取中…"/> : "重新查找会话"}
              </Button>}
              <Button secondary disabled={busy} onClick={() => setManual(true)}>
                <PenLine size={16} />
                手动写一段
              </Button>
            </div>
          </>
        )}
        {error && (
          <p role="alert" className="inline-error">
            {error}
          </p>
        )}
      </section>}
      <AgentRoles
        state={state}
        save={save}
        notify={notify}
        agents={agents}
        results={agentContents}
        healthAudit={healthAudit}
        picked={picked}
        onPick={(id) => {
          setPicked(id);
          setReceipt("");
        }}
        sourceId={relayVisible ? chosen?.agentId : undefined}
        launch={launch}
        tab={tab}
        onTab={setTab}
        renderContents={(id) => (
          <AgentContents
            roleCard
            state={state}
            agents={agents.filter((a) => a.id === id)}
            results={agentContents}
            onResult={(key, value) =>
              setAgentContents((p) => ({ ...p, [key]: value }))
            }
          />
        )}
        renderHealth={(id) => (
          <HealthAudit
            healthAudit={healthAudit}
            agentId={id}
            onResult={setHealthAudit}
            notify={notify}
          />
        )}
        renderConfiguration={(id) => (
          <>
            <div className="role-config-head">
              <h3>本机入口检测</h3>
              {["codex", "hermes"].includes(id) && <AgentWriteLaunch state={state} agentId={id} />}
            </div>
            {configuration({ picked: id, roleCard: true })}
            <button
              type="button"
              className="text-btn"
              onClick={() => setAll(true)}
            >
              全部本机入口与旧登记记录
            </button>
          </>
        )}
      />
      {relayVisible && receipt && (
        <p className="relay-receipt" role="status" key={receipt}>
          {receipt}
        </p>
      )}
      {help && (
        <Dialog title="智能体群 · 这页怎么用" onClose={() => setHelp(false)}>
          <div className="asset-form">
            <p>
              选会话 → 选伙伴 → 预览提示词 → 复制并打开应用，粘贴发送由你完成。
            </p>
            <p>
              本机应用与命令行入口 · 覆盖 {agents.length || 11}{" "}
              种入口；检测到不代表已登录或可控制。更新于{" "}
              {time(state.connections?.agentScannedAt)}
            </p>
            <p>点击页首「上下文接力」后才读取会话列表元数据；选定会话并预览时才读取正文。</p>
            <p>
              仅本机内存使用，离页丢弃；不存主库、不备份、不上传。每次复制前先预览；只打开已检测应用，不输入、不发送。
            </p>
            <h3>读取范围</h3>
            <ul>
              {(listing.sources.length
                ? listing.sources
                : [
                    {
                      agentId: "claude-code",
                      status: "not_read",
                      reason: "尚未读取",
                    },
                    {
                      agentId: "codex",
                      status: "not_read",
                      reason: "尚未读取",
                    },
                    {
                      agentId: "hermes",
                      status: "unsupported",
                      reason: "暂不支持读取；SQLite 适配与位置授权尚未完成",
                    },
                    {
                      agentId: "openclaw",
                      status: "unsupported",
                      reason: "暂不支持读取；SQLite 适配与位置授权尚未完成",
                    },
                  ]
              ).map((s) => (
                <li key={s.agentId}>
                  {names[s.agentId]} ·{" "}
                  {s.status === "ok"
                    ? "已扫描批准范围"
                    : s.reason || "尚未读取"}
                </li>
              ))}
            </ul>
            {listing.skipped > 0 && <p>有 {listing.skipped} 段无法读取。</p>}
            <Button
              secondary
              onClick={() => {
                setHelp(false);
                setManual(true);
              }}
            >
              手动写一段 / 从项目来源生成
            </Button>
            <Button
              secondary
              onClick={() => {
                setHelp(false);
                setAll(true);
              }}
            >
              全部本机入口
            </Button>
          </div>
        </Dialog>
      )}
      {chooser && (
        <Dialog title="换一段会话" onClose={() => setChooser(false)}>
          <div className="relay-choices">
            {listing.sessions.map((s) => (
              <button type="button" className="relay-choice" key={s.id} disabled={busy} onClick={() => choose(s)}>
                <b>{s.title || "未命名会话"}</b>
                <span><small>来源 AI</small>{names[s.agentId] || s.agentId}</span>
                <span><small>最近更新</small>{time(s.updatedAt)}</span>
              </button>
            ))}
          </div>
        </Dialog>
      )}
      {all && (
        <Dialog title="全部本机入口" drawer onClose={() => setAll(false)}>
          {configuration({ picked, showAll: true })}
        </Dialog>
      )}
      {manual && (
        <Relay
          state={state}
          adoptState={adoptState}
          notify={notify}
          onClose={() => setManual(false)}
        />
      )}
    </>
  );
}
