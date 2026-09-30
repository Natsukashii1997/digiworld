// 智能体角色卡与派活推荐（路线 v3 4.3；产品定义 v1.2 §4.3；基线 D26、D28）。
// 角色卡可编辑，编辑后存主库 agentRoles；常驻项目只从已登记项目的“下一步”交接字段推断，推断不了留空。
// 派活推荐只在本页按擅长关键词匹配，推荐 1–2 个并写理由；只推荐，不指派、不执行，不发任何请求。
import React, { useState } from "react";
import { Button, Dialog, Badge } from "./components.jsx";
import {
  COST_LABEL,
  TIER_LABEL,
  rolesOf,
  saveRole,
  inferProjects,
  recommendAgents,
  parseList,
  parseProjects,
  NOTE_MAX,
} from "./agent-roles.js";
import "./silver-agents.css";

function RoleEditor({ state, role, inferred, save, notify, onClose }) {
  const [strengths, setStrengths] = useState(role.strengths.join("，")),
    [cost, setCost] = useState(role.cost),
    [projects, setProjects] = useState((role.edited ? role.projects : inferred).join("，")),
    [note, setNote] = useState(role.note),
    [busy, setBusy] = useState(false);
  async function submit(e) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    try {
      const ok = await save({
        ...state,
        agentRoles: saveRole(state, role.agentId, {
          strengths: parseList(strengths),
          cost,
          projects: parseProjects(projects),
          note,
        }),
      });
      if (ok) {
        onClose();
        notify(`已保存 ${role.name} 的角色卡`);
      }
    } finally {
      setBusy(false);
    }
  }
  return (
    <Dialog title={`编辑角色卡：${role.name}`} onClose={onClose}>
      <form className="asset-form" onSubmit={submit}>
        <label>
          擅长关键词（用逗号或空格分隔）
          <input value={strengths} onChange={(e) => setStrengths(e.target.value)} placeholder="例如：重构，测试，界面" />
        </label>
        <label>
          成本
          <select value={cost} onChange={(e) => setCost(e.target.value)}>
            {Object.entries(COST_LABEL).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <label>
          常驻项目（用逗号分隔）
          <input value={projects} onChange={(e) => setProjects(e.target.value)} />
        </label>
        <label>
          备注
          <textarea rows={3} maxLength={NOTE_MAX} value={note} onChange={(e) => setNote(e.target.value)} />
        </label>
        <p className="helper">派活推荐只按“擅长关键词”在任务描述里的出现次数匹配；关键词越具体，推荐越准。</p>
        <div className="form-actions">
          <Button disabled={busy}>保存角色卡</Button>
        </div>
      </form>
    </Dialog>
  );
}

function Recommend({ roles }) {
  const [text, setText] = useState(""),
    [result, setResult] = useState(null);
  return (
    <section className="role-recommend" aria-labelledby="role-recommend-title">
      <h3 id="role-recommend-title">派活推荐</h3>
      <p className="helper">只推荐，不指派、不执行。按角色卡的擅长关键词匹配，由你拍板交给谁。</p>
      <form
        className="role-recommend-form"
        onSubmit={(e) => {
          e.preventDefault();
          setResult(recommendAgents(text, roles));
        }}
      >
        <label>
          任务描述
          <textarea rows={2} value={text} onChange={(e) => setText(e.target.value)} placeholder="例如：重构登录模块并补测试" />
        </label>
        <div className="form-actions">
          <Button>推荐人选</Button>
        </div>
      </form>
      <div aria-live="polite">
        {result &&
          (result.length ? (
            <ol className="role-picks">
              {result.map((r, i) => (
                <li className="role-pick" key={r.agentId}>
                  <strong>
                    {i === 0 ? "首选" : "备选"} · {r.name}
                  </strong>
                  <Badge>{TIER_LABEL[r.tier]}</Badge>
                  <span>{r.reason}</span>
                </li>
              ))}
            </ol>
          ) : (
            <p className="helper">没有匹配的擅长关键词。可以换个说法，或在角色卡里补充擅长关键词。</p>
          ))}
      </div>
    </section>
  );
}

export function AgentRoles({ state, save, notify }) {
  const roles = rolesOf(state);
  const [editing, setEditing] = useState(null);
  const editingRole = roles.find((r) => r.agentId === editing);
  return (
    <section id="agent-roles" className="agent-roles" aria-labelledby="agent-roles-title">
      <div className="section-title">
        <span className="section-index">角</span>
        <h2 id="agent-roles-title">角色卡</h2>
        <p>主力 3 个、附属 2 个：擅长什么、成本高低、常驻哪些项目。内容由你编辑。</p>
      </div>
      <ul className="role-cards">
        {roles.map((role) => {
          const inferred = inferProjects(state, role.agentId);
          const projects = role.edited && role.projects.length ? role.projects.join("、") : inferred.length ? `${inferred.join("、")}（推断）` : "—";
          return (
            <li key={role.agentId}>
              <article className="role-card">
                <header>
                  <h3>{role.name}</h3>
                  <Badge tone={role.tier === "main" ? "" : "muted"}>{TIER_LABEL[role.tier]}</Badge>
                </header>
                {!role.edited && <small className="role-draft">草拟默认，未经你确认</small>}
                <dl>
                  <dt>擅长</dt>
                  <dd>
                    {role.strengths.length ? (
                      <span className="role-tags">
                        {role.strengths.map((s) => (
                          <span key={s}>{s}</span>
                        ))}
                      </span>
                    ) : (
                      "—"
                    )}
                  </dd>
                  <dt>成本</dt>
                  <dd>{COST_LABEL[role.cost]}</dd>
                  <dt>常驻项目</dt>
                  <dd>{projects}</dd>
                  <dt>备注</dt>
                  <dd>{role.note || "—"}</dd>
                </dl>
                <Button secondary aria-label={`编辑 ${role.name} 角色卡`} onClick={() => setEditing(role.agentId)}>
                  编辑
                </Button>
              </article>
            </li>
          );
        })}
      </ul>
      <Recommend roles={roles} />
      {editingRole && (
        <RoleEditor
          state={state}
          role={editingRole}
          inferred={inferProjects(state, editingRole.agentId)}
          save={save}
          notify={notify}
          onClose={() => setEditing(null)}
        />
      )}
    </section>
  );
}
