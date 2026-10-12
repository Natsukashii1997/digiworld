import { flyData } from './data-flight.js';
import React, { useRef, useState } from "react";
import { Button } from "./components.jsx";
import { request } from "./api.js";
import { portfolioSections } from "./projects-v16.js";

const choices = [
  ["main", "独立项目"],
  ["asset", "知识或工具资产"],
  ["task", "任务或阶段成果"],
  ["candidate", "待核项目"],
  ["component", "附属组件或阶段材料"],
  ["hidden", "文件容器或隐藏来源"],
];

export function ProjectCatalogEditor({ project, state, adoptState, notify }) {
  const current = (state.connections?.projectCatalog || []).find((item) => item.projectId === project.id);
  const initial = useRef(JSON.stringify(current || null));
  const [name, setName] = useState(current?.displayName || project.name);
  const [section, setSection] = useState(current?.section || "pending");
  const [view, setView] = useState(current?.view || "candidate");
  const [parentId, setParentId] = useState(current?.parentId || "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const parents = (state.connections?.projectCatalog || []).filter((item) =>
    item.view === "main" && item.projectId !== project.id,
  );
  async function save(event) {
    event.preventDefault();
    if (busy) return;
    const latest = (state.connections?.projectCatalog || []).find((item) => item.projectId === project.id);
    if (JSON.stringify(latest || null) !== initial.current) {
      setError("此项目的整理信息已变化，请关闭详情后重新打开。");
      return;
    }
    if (!name.trim()) { setError("请输入展示名。"); return; }
    setBusy(true);
    setError("");
    try {
      const item = {
        projectId: project.id,
        displayName: name.trim(),
        section,
        view,
        ...(view === "component" && parentId ? { parentId } : {}),
        ...(current?.note ? { note: current.note } : {}),
      };
      const items = [...(state.connections?.projectCatalog || []).filter((entry) => entry.projectId !== project.id), item];
      const next = await request("/project-catalog/apply", { revision: state.revision, items });
      adoptState(next);
      flyData();
      initial.current = JSON.stringify(item);
      notify("项目展示信息已保存", "success");
    } catch (cause) {
      setError(cause.message);
      notify(cause.message, "error");
    } finally { setBusy(false); }
  }
  return <form className="project-catalog-editor" onSubmit={save}>
    <h3>项目展示</h3>
    <p className="detail-footnote">只改变工作台里的名称和归类，磁盘路径与项目事实源保持原位。</p>
    <label>展示名<input value={name} maxLength={120} onChange={(event)=>setName(event.target.value)} /></label>
    <label>位置<select value={view} onChange={(event)=>{
      const next = event.target.value;
      setView(next);
      if (next === "main" && !portfolioSections.some((item) => item.id === section)) setSection("business");
    }}>
      {choices.map(([id,label])=><option key={id} value={id}>{label}</option>)}
    </select></label>
    {view === "main" && <label>分区<select value={section} onChange={(event)=>setSection(event.target.value)}>
      {portfolioSections.map((item)=><option key={item.id} value={item.id}>{item.label}</option>)}
    </select></label>}
    {view === "component" && <label>归属项目<select value={parentId} onChange={(event)=>setParentId(event.target.value)}>
      <option value="">暂不指定</option>
      {parents.map((item)=><option key={item.projectId} value={item.projectId}>{item.displayName}</option>)}
    </select></label>}
    {error && <p className="inline-error" role="alert">{error}</p>}
    <Button type="submit" disabled={busy}>{busy ? "保存中…" : "保存展示信息"}</Button>
  </form>;
}

export function ManualProjectForm({ state, adoptState, notify }) {
  const [path, setPath] = useState("");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function add(event) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      const next = await request("/project-catalog/apply", {
        revision: state.revision,
        manualProjects: [{ path: path.trim(), name: name.trim() || undefined }],
      });
      adoptState(next);
      flyData();
      setPath(""); setName("");
      notify("目录已登记到待归类，请打开项目详情设置展示位置", "success");
    } catch (cause) {
      setError(cause.message);
      notify(cause.message, "error");
    } finally { setBusy(false); }
  }
  return <form className="project-catalog-editor" onSubmit={add}>
    <h3>手工登记本地项目</h3>
    <p className="detail-footnote">适用于扫描跳过的 outputs 项目或没有代码标记的应用。登记只保存目录指针，不读取目录正文。</p>
    <label>绝对目录路径<input value={path} onChange={(event)=>setPath(event.target.value)} placeholder="/Users/…/Documents/…" /></label>
    <label>初始名称<input value={name} onChange={(event)=>setName(event.target.value)} placeholder="留空则使用目录名" /></label>
    {error && <p className="inline-error" role="alert">{error}</p>}
    <Button type="submit" disabled={busy || !path.trim()}>{busy ? "登记中…" : "登记目录"}</Button>
  </form>;
}
