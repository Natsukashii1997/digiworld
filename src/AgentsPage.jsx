// Agent 页（#74）：定稿 C「单个档案」+ C1「立绘档案」（docs/design/cockpit/agent-三版.html）。
// 只读：数据来自 GET /api/cockpit/agents；ChatGPT 不计入。
import React, { useMemo, useRef, useState } from "react";
import { PageHeading } from "./components.jsx";
import { Pixel } from "./pixel.jsx";
import { LcdText } from "./v14.jsx";
import { useCockpit, ReadOnlyBar, CockpitState, Pill, Dot, SourceTime, fmtTime } from "./cockpit-ui.jsx";
import "./cockpit.css";

// 形象对应（常浩 10-05、11-07 定）：head 是头像裁切 [x, y, w, h]，s 是立绘放大倍数。
const CHAR = {
  claude: { key: "metalgreymon16", name: "机械暴龙兽", head: [28, 2, 26, 26], s: 4, tint: "var(--orange)" },
  codex: { key: "machinedramon16", name: "机械邪龙兽", head: [30, 17, 26, 26], s: 4, tint: "var(--cyan)" },
  hermes: { key: "bakemon", name: "猛鬼兽", head: [8, 0, 28, 28], s: 5, tint: "var(--violet)" },
  agumon: { key: "agumon16", name: "亚古兽", head: [3, 0, 28, 28], s: 4, tint: "var(--yellow)" },
};
const MASK = "••••••••";

function Gauge({ label, pct, level, note }) {
  const on = Math.round(Math.min(100, Math.max(0, pct ?? 0)) / 5);
  const tone = level === "ok" ? "var(--lcd)" : level === "warn" ? "var(--yellow)" : "var(--faint)";
  return (
    <div className="ck-gauge" style={{ "--s": tone }}>
      <span>{label}</span>
      <div className="ck-seg" aria-hidden="true">{Array.from({ length: 20 }, (_, k) => <i key={k} className={k < on ? "on" : ""} />)}</div>
      <span className="ck-pct">{pct == null ? "—" : <LcdText text={`${pct}%`} px={2} label={`${label} 已用 ${pct}%`} />}</span>
      <span className="ck-rs">{note}</span>
    </div>
  );
}

function Gauges({ agent }) {
  if (agent.quota?.rows?.length)
    return (
      <>
        {agent.quota.rows.map((r) => (
          <Gauge key={r.label} label={r.label} pct={r.usedPercent} level={r.state !== "ok" ? "warn" : r.level}
            note={r.state === "ok" ? (r.resetAt ? `${fmtTime(r.resetAt)} 重置` : "重置时间未知") : `读数停在 ${fmtTime(r.observedAt)} · 过期`} />
        ))}
        <span className="ck-src"><b>来源</b> 驿窗 HUD 快照 · {fmtTime(agent.quota.checkedAt)}</span>
      </>
    );
  if (agent.online) {
    const o = agent.online, fresh = o.freshness === "ok";
    const platforms = o.platforms.map((p) => `${p.name === "feishu" ? "飞书" : p.name} ${p.state}`).join(" · ");
    return (
      <>
        <div className="ck-gauge" style={{ "--s": fresh && o.state === "running" ? "var(--lcd)" : "var(--yellow)" }}>
          <span>网关</span>
          <div className="ck-seg" aria-hidden="true">{Array.from({ length: 20 }, (_, k) => <i key={k} className={o.state === "running" ? "on" : ""} />)}</div>
          <span className="ck-pct"><LcdText text={o.state === "running" ? "ON" : "OFF"} px={2} label={o.state} /></span>
          <span className="ck-rs">{[o.state === "running" ? "运行中" : o.state, o.version, platforms].filter(Boolean).join(" · ")} · {fmtTime(o.updatedAt)}{!fresh && " · 过期"}</span>
        </div>
        <span className="ck-src">额度：没有接入可核验的来源，不显示</span>
      </>
    );
  }
  return <Gauge label="额度" pct={null} level="unk" note="未知：本机没有可核验的来源" />;
}

// 指令全文：按目录分节，点目录滚到对应一节；打码处高亮。
function Reader({ agent }) {
  const i = agent.instructions;
  const [current, setCurrent] = useState(0);
  const preRef = useRef(null);
  const sections = useMemo(() => {
    if (!i?.text) return [];
    const lines = i.text.split("\n");
    const level = lines.some((l) => l.startsWith("## ")) ? "## " : "# ";
    const out = [{ lines: [] }];
    let skippedTitle = level === "# ";
    for (const line of lines) {
      if (line.startsWith(level)) {
        if (skippedTitle) { skippedTitle = false; out[0].lines.push(line); continue; }
        out.push({ lines: [line] });
      } else out.at(-1).lines.push(line);
    }
    return out;
  }, [i?.text]);
  if (i?.state !== "ok")
    return (
      <div className="ck-card">
        <span className="ck-lbl">全局指令</span>
        <p className="ck-muted" style={{ margin: 0 }}>未知：本机读不到 <span className="ck-mono">{i?.path}</span>，可能不存在或不在读取白名单里。</p>
      </div>
    );
  const jump = (k) => {
    setCurrent(k);
    const pre = preRef.current, el = pre?.querySelector(`[data-sec="${k + 1}"]`);
    if (pre && el) pre.scrollTop = el.offsetTop - pre.offsetTop - 8;
  };
  return (
    <div className="ck-reader">
      <nav className="ck-toc" aria-label="指令目录">
        {i.toc.map((t, k) => (
          <button type="button" key={k} aria-current={k === current} onClick={() => jump(k)}>
            <span>{t.num ? `${t.num} ` : ""}{t.title}</span>
            {t.prefs.slice(0, 1).map((p) => <span key={p} className="ck-chip p">{p}</span>)}
          </button>
        ))}
      </nav>
      <div className="ck-doc">
        <div className="ck-doc-meta">
          <span className="ck-mono" style={{ fontSize: 12.5 }}>{i.path}</span>
          <span className="ck-note">{i.lines} 行 · 更新于 {fmtTime(i.updatedAt)}</span>
          <Pill level={i.sync.level}>{i.sync.text}</Pill>
        </div>
        <pre ref={preRef} tabIndex={0} aria-label={`${agent.name} 全局指令全文`}>
          {sections.map((s, k) => (
            <span key={k} data-sec={k}>
              {s.lines.map((line, n) => (
                <React.Fragment key={n}>
                  <Line text={line} />{"\n"}
                </React.Fragment>
              ))}
            </span>
          ))}
        </pre>
        <div className="ck-src"><b>来源</b> {i.origin}</div>
        <div className="ck-wl">
          <div><b>按白名单读取</b>只读指令、模型名、Skill 目录、MCP 名字和运行状态文件；疑似密钥一律打码。</div>
          <div><b>不读取</b>{agent.skipped.join("、")}</div>
        </div>
      </div>
    </div>
  );
}
function Line({ text }) {
  const parts = text.split(MASK);
  const body = parts.flatMap((p, k) => (k ? [<span key={`m${k}`} className="mask">{MASK}</span>, p] : [p]));
  return /^#{1,6} /.test(text) ? <span className="h">{body}</span> : <>{body}</>;
}

function SideCards({ agent, mySkillsTotal }) {
  const { model, skills, mcp, hooks, sources } = agent;
  return (
    <>
      <div className="ck-card">
        <h4>模型<span className="ck-lbl">MODEL</span></h4>
        {model ? (
          <>
            <dl className="ck-kv">
              <dt>主模型</dt><dd className="ck-mono">{model.main}</dd>
              {model.id && <><dt>说明</dt><dd>{model.id}</dd></>}
              <dt>权限</dt><dd>{model.permission}{model.deny ? ` · 拒绝规则 ${model.deny} 条` : ""}</dd>
            </dl>
            <span className="ck-src">{model.note}</span>
          </>
        ) : <span className="ck-muted ck-small">未知：本机读不到</span>}
      </div>
      <div className="ck-card">
        <h4>Skill<span className="ck-lbl">{skills ? `${skills.total} 个` : "未知"}</span></h4>
        {skills ? (
          <>
            <ul className="ck-list">{skills.parts.map(([label, n]) => <li key={label}><span>{label}</span><span className="who ck-mono">{n}</span></li>)}</ul>
            {skills.mineList.length ? <div className="ck-chips">{skills.mineList.map((s) => <span key={s} className="ck-chip my">{s}</span>)}</div>
              : <span className="ck-note">没有装 my-skills 的 Skill{mySkillsTotal ? `（库里共 ${mySkillsTotal} 个）` : ""}</span>}
          </>
        ) : <span className="ck-muted ck-small">未知：本机读不到</span>}
      </div>
      <div className="ck-card">
        <h4>MCP<span className="ck-lbl">{mcp ? `${mcp.length} 个` : "未知"}</span></h4>
        {mcp ? (
          <>
            {mcp.length ? <div className="ck-chips">{mcp.map((m) => <span key={m} className="ck-chip">{m}</span>)}</div> : <span className="ck-note">没有配置</span>}
            <span className="ck-src">只读名字，不读连接参数</span>
          </>
        ) : <span className="ck-muted ck-small">未知：本机读不到</span>}
      </div>
      <div className="ck-card">
        <h4>Hook<span className="ck-lbl">{hooks == null ? "未知" : hooks.length ? `${hooks.length} 组` : "无"}</span></h4>
        {hooks?.length ? (
          <ul className="ck-list">
            {hooks.map((h) => (
              <li key={h.name} className="ck-hook"><span className="ck-mono">{h.name}</span><span className="who">{h.origin}</span>{h.desc && <span className="ck-note">{h.desc}</span>}</li>
            ))}
          </ul>
        ) : <span className="ck-muted ck-small">{hooks == null ? "未知：本机读不到" : "没有配置 hook"}</span>}
      </div>
      <div className="ck-card">
        <h4>来源与读取时间</h4>
        <ul className="ck-list">
          {sources.map((s) => (
            <li key={s.label} className="ck-srcrow">
              <span className="ck-muted">{s.label}</span>
              <span className="ck-mono">{s.path}{s.note && <span className="ck-faint"> · {s.note}</span>}</span>
              <span className="who ck-mono"><SourceTime at={s.at} state={s.state} /></span>
            </li>
          ))}
        </ul>
        <span className="ck-src"><b>不读取</b> {agent.skipped.join("、")}</span>
      </div>
    </>
  );
}

function Dossier({ agent, mySkillsTotal }) {
  const c = CHAR[agent.id];
  const i = agent.instructions;
  const facts = [
    // 点阵字只认半角符号：未知写「-」。
    [agent.hooks == null ? "-" : agent.hooks.length, "Hook 组"],
    [agent.skills ? agent.skills.total : "-", "Skill"],
    [agent.skills ? `${agent.skills.mine}/${mySkillsTotal ?? "?"}` : "-", "来自 my-skills"],
    [agent.mcp ? agent.mcp.length : "-", "MCP"],
  ];
  return (
    <div className="ck-dossier">
      <section className="ck-hero" style={{ "--tint": c.tint }} aria-label={`${agent.name} 档案`}>
        <div className="ck-portrait">
          <span className="corner tl" /><span className="corner tr" /><span className="corner bl" /><span className="corner br" />
          <div className="ck-stage"><Pixel sprite={c.key} scale={c.s} title={c.name} /></div>
          <h3>{c.name}</h3>
          <span className="ck-pxlabel">{agent.en} · {agent.role}</span>
        </div>
        <div className="ck-ident-r">
          <div className="ck-ident">
            <h3>{agent.name}</h3>
            <p>{agent.desc}</p>
            <div className="ck-meta"><span className="ck-chip">{agent.entry}</span><Pill level={agent.status.level}>{agent.status.text}</Pill></div>
            <dl className="ck-kv" style={{ marginTop: 4 }}>
              <dt>模型</dt><dd className="ck-mono">{agent.model ? <>{agent.model.main}{agent.model.id && <span className="ck-muted"> · {agent.model.id}</span>}</> : "未知"}</dd>
              <dt>指令</dt><dd>{i.state === "ok" ? <><span className="ck-mono">{i.path}</span> · {i.lines} 行</> : "未知"}</dd>
            </dl>
            <div className="ck-facts">
              {facts.map(([v, label]) => <div key={label}><b><LcdText text={v} px={3} label={`${label} ${v}`} /></b><span>{label}</span></div>)}
            </div>
          </div>
          <div className="ck-gbox"><span className="ck-lbl">运行</span><Gauges agent={agent} /></div>
        </div>
      </section>
      <div className="ck-cols">
        <div className="ck-stack">
          <div className="ck-secbar">
            <h2 className="ck-sec">全局指令</h2>
            {i.state === "ok" && <span className="ck-note">{i.prefs.length ? "紫色编号＝这一节对应 Vault 里的个人偏好" : "指令文件没写偏好编号"}</span>}
          </div>
          <Reader key={agent.id} agent={agent} />
        </div>
        <div className="ck-stack"><SideCards agent={agent} mySkillsTotal={mySkillsTotal} /></div>
      </div>
    </div>
  );
}

export function AgentsPage() {
  const { data, error, busy, reload } = useCockpit("/cockpit/agents");
  const [sel, setSel] = useState("claude");
  const agent = data?.agents.find((a) => a.id === sel) || data?.agents[0];
  return (
    <div className="cockpit ck-agents">
      <PageHeading page="agents" action={<ReadOnlyBar readAt={data?.readAt} busy={busy} onRefresh={reload} />} />
      <CockpitState data={data} error={error} reload={reload} label="Agent 档案" />
      {data && (
        <div className="ck-c1">
          <div className="ck-roster" role="tablist" aria-label="选择 Agent">
            {data.agents.map((a) => {
              const c = CHAR[a.id];
              return (
                <button type="button" role="tab" key={a.id} aria-selected={a.id === agent.id} style={{ "--tint": c.tint }} onClick={() => setSel(a.id)}>
                  <span className="ck-ava"><Pixel sprite={c.key} crop={c.head} scale={2} /></span>
                  <span style={{ minWidth: 0 }}><b>{a.name}</b><small>{c.name}</small></span>
                  <Dot level={a.status.level} />
                </button>
              );
            })}
            <div className="ck-legend"><span><Dot level="ok" />正常</span><span><Dot level="warn" />要看一眼</span><span><Dot level="unk" />未知</span></div>
          </div>
          <Dossier agent={agent} mySkillsTotal={data.mySkillsTotal} />
        </div>
      )}
    </div>
  );
}
