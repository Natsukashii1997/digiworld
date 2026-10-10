import {AgentsV16} from "./AgentsV16.jsx";
import React, {useEffect,useRef,useState} from "react";
import {ArrowUpRight} from "lucide-react";
import {Badge,Empty} from "./components.jsx";
import {scan} from "./api.js";
import {AgentInventory} from "./AgentInventory.jsx";

function useDiscovery(kind, state, adoptState, notify) {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const started = useRef(false);
  async function run(data = {}) {
    setBusy(true);
    setError("");
    try {
      const next = await scan(kind, data);
      adoptState(next);
      return next;
    } catch (e) {
      setError(e.message);
      notify(e.message, "error");
      return null;
    } finally {
      setBusy(false);
    }
  }
  useEffect(() => {
    if (
      !started.current &&
      !state.connections?.[
        kind === "projects" ? "projectScannedAt" : "agentScannedAt"
      ]
    ) {
      started.current = true;
      run();
    }
  }, []);
  return { busy, error, run };
}
function Filters({ options, value, onChange }) {
  return (
    <div className="segmented">
      {options.map(([id, label]) => (
        <button
          key={id}
          aria-pressed={id === value}
          className={id === value ? "active" : ""}
          onClick={() => onChange(id)}
        >
          {label}
        </button>
      ))}
    </div>
  );
}
function LegacyRecords({ records }) {
  if (!records.length) return null;
  return (
    <details className="legacy-records">
      <summary>旧登记记录 · {records.length}</summary>
      {records.map((r) => (
        <div key={r.id}>
          <strong>{r.name}</strong>
          <p>{r.location || r.path || r.note || "未验证"}</p>
        </div>
      ))}
    </details>
  );
}
export {ProjectsV16 as Projects} from "./ProjectsV16.jsx";

export function Agents(props) {
  const {state,adoptState,notify}=props;
  const {busy,error,run}=useDiscovery("agents",state,adoptState,notify);
  return <AgentsV16 {...props} discoveryBusy={busy} discoveryError={error} detect={run} configuration={(configProps)=><AgentDiscovery {...props} {...configProps}/>}/>;
}
function AgentDiscovery({state,adoptState,notify,onSelect,picked,showAll=false,roleCard=false,discoveryBusy=false,discoveryError=""}) {
  const agents=state.connections?.agents||[],targets=state.connections?.agentTargets||[];
  const [filter,setFilter]=useState(agents.find(a=>a.id===picked)?.status||"detected"),[selected,setSelected]=useState(null);
  const selectedAgent=agents.find(a=>a.id===selected);
  const labels={detected:"已检测",config_only:"配置痕迹",not_detected:"未检测",unknown:"检测受阻"};
  useEffect(()=>setFilter(agents.find(a=>a.id===picked)?.status||"detected"),[picked]);
  const busy=false;
  return <>
      <section className={`agent-discovery${roleCard?" in-role-card":""}`} aria-label="本机入口检测">
        {!roleCard && <div className="v14-sh">
          <h2 id="agent-discovery-title">本机入口检测</h2>
          <span className="v14-sub">只读取程序与配置目录是否存在，不运行任何 Agent。</span>
        </div>}
        {showAll && <div className="discovery-toolbar">
          <Filters
            value={filter}
            onChange={setFilter}
            options={Object.entries(labels).map(([key, label]) => [
              key,
              `${label} ${agents.filter((a) => (showAll || a.id === picked) && a.status === key).length}`,
            ])}
          />
        </div>}
        <div className="agent-discovery-grid">
          {agents
            .filter((a) => (showAll ? a.status === filter : a.id === picked))
            .map((a) => (
              <button
                className="agent-discovery-card"
                data-agent={a.id}
                aria-label={`查看 ${a.name} 本机入口详情`}
                key={a.id}
                onClick={() => setSelected(a.id)}
              >
                <span className="agent-card-top">
                  {!roleCard && <AgentMark agent={a} />}
                  <Badge tone={a.status === "unknown" ? "warning" : "muted"}>
                    {labels[a.status]}
                  </Badge>
                </span>
                {!roleCard && <strong>{a.name}</strong>}
                <span className="agent-kind">{a.kind}</span>
                <EvidenceLadder
                  agent={a}
                  targets={targets.filter((t) => t.agentId === a.id).length}
                />
                <span className="agent-card-foot">
                  {a.programs.length
                    ? `${a.programs.length} 个程序入口`
                    : a.configFound
                      ? "仅发现配置目录"
                      : "未发现程序或配置"}
                  <ArrowUpRight size={16} />
                </span>
              </button>
            ))}
        </div>
        {!agents.filter((a) => (showAll ? a.status === filter : a.id === picked)).length && (roleCard ?
          <p className="role-discovery-empty">{discoveryError ? "本机入口检测失败，当前结果未知。" : discoveryBusy||!state.connections?.agentScannedAt ? "本机入口尚未完成检测。" : `本机未发现${({codex:"Codex","claude-code":"Claude Code",hermes:"Hermes",openclaw:"OpenClaw",doubao:"豆包工作"}[picked]||picked)}的入口记录。可用页首「重新检测本机入口」更新。`}</p>
          : <Empty
            sprite="machinedramon16"
            title={busy ? "正在检测本机 Agent…" : "没有处于这个状态的 Agent"}
          >
            {busy ? "只读取程序与配置目录是否存在，不运行任何 Agent。" : null}
          </Empty>
        )}
        <LegacyRecords records={showAll ? state.agents : state.agents.filter(r => [r.id,r.agentId].includes(picked) || r.name === ({codex:"Codex","claude-code":"Claude Code",hermes:"Hermes",openclaw:"OpenClaw",doubao:"豆包工作"}[picked]))} />
      </section>

      {selectedAgent&&<AgentInventory key={selectedAgent.id} agent={selectedAgent} state={state} adoptState={adoptState} labels={labels} notify={notify} onClose={()=>setSelected(null)} onSelect={id=>{setSelected(null);onSelect(id);}}/>}
  </>;
}

// 每个 Agent 一枚像素风标识：名称缩写 + 由 ID 派生的稳定色相。
function AgentMark({ agent }) {
  const words = agent.name.split(/[\s-]+/).filter(Boolean);
  const initials =
    words.length > 1
      ? words.map((w) => w[0]).join("").slice(0, 2)
      : agent.name.slice(0, 2);
  const hue =
    [...agent.id].reduce((h, ch) => (h * 31 + ch.charCodeAt(0)) % 360, 7) || 0;
  return (
    <span className="agent-mark" style={{ "--hue": hue }} aria-hidden="true">
      {initials.toUpperCase()}
    </span>
  );
}
// 证据阶梯：检测到程序 → 已确认管理目标 → 支持受控配置。只按真实数据点亮。
const MANAGED = ["codex", "hermes"];
function EvidenceLadder({ agent, targets }) {
  const steps = [
    [
      agent.programs.length > 0,
      agent.programs.length ? "检测到程序" : agent.configFound ? "仅配置痕迹" : "未检测到",
    ],
    [targets > 0, targets ? `管理目标 ${targets}` : "未设管理目标"],
    [
      MANAGED.includes(agent.id) && targets > 0,
      MANAGED.includes(agent.id)
        ? targets
          ? "可受控配置"
          : "设目标后可受控配置"
        : "暂不支持管理",
    ],
  ];
  return (
    <ol className="evidence-ladder" aria-label="管理证据">
      {steps.map(([on, text], i) => (
        <li key={i} className={on ? "on" : ""}>
          <i aria-hidden="true" />
          {text}
        </li>
      ))}
    </ol>
  );
}
