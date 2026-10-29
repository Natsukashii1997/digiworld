import {filterRelayText} from "./relay-prompt.js";
import { NightV16 } from './NightV16.jsx';
import React, { useEffect, useRef, useState } from "react";
import {
  Plus,
  ArrowUpRight,
  ArrowRight,
  Folder,
  BookOpen,
  Link2,
  Monitor,
  Terminal,
  ShieldCheck,
  RefreshCw,
  Moon,
  Sun,
  Check,
  Clock,
  ChevronRight,
  PenLine,
  Copy,
  Download,
  Archive,
  GitBranch,
  FileText,
  Unplug,
  Settings2,
  ExternalLink,
  Layers,
  Sparkles,
  Trash2,
  ScanLine,
  Flame,
} from "lucide-react";
import { Button, Empty, PageHeading, Dialog } from "./components.jsx";
import { Pixel } from "./pixel.jsx";
import { uid, now, current } from "./store.js";
import { copy, download } from "./Assets.jsx";
import { ReverseWorkbench } from "./ReverseEngineering.jsx";
import {ReverseHatch} from './ReverseHatch.jsx';
import { HistoryArchive } from "./HistoryArchive.jsx";
import "./reverse-v14.css";
import "./settings-v14.css";
import { PageChoices } from "./PageChoices.jsx";
import { ProjectContext } from "./ProjectContext.jsx";
import { orderScrolls } from "./scrolls.js";

export function Relay({ state, adoptState, notify, onClose }) {
  const [generatedAt] = useState(() => new Date().toLocaleString("zh-CN"));
  const [mode, setMode] = useState("manual"),
    [projectId, setProjectId] = useState("");
  const discovered = state.connections?.projects || [];
  const selected = discovered.find((p) => p.id === projectId);
  const [project, setProject] = useState(""),
    [goal, setGoal] = useState(""),
    [facts, setFacts] = useState(""),
    [next, setNext] = useState(""),
    [boundary, setBoundary] = useState("仅继续分析；外部写入需另行确认");
  const text = `# 项目上下文接力\n\n项目：${project || "未指定"}\n目标：${goal}\n\n## 已确认事实与成果\n${facts}\n\n## 权限与禁止事项\n${boundary}\n\n## 唯一下一步\n${next}\n\n生成时间：${generatedAt}\n本接力包由用户编写，目标 Agent 须核验当前事实。`;
  const preview = filterRelayText(text);
  return (
    <Dialog title="准备上下文接力" onClose={onClose}>
      <div className="segmented">
        <button
          aria-pressed={mode === "manual"}
          className={mode === "manual" ? "active" : ""}
          onClick={() => setMode("manual")}
        >
          手动编写
        </button>
        <button
          aria-pressed={mode === "project"}
          className={mode === "project" ? "active" : ""}
          onClick={() => setMode("project")}
        >
          从项目来源生成
        </button>
      </div>
      {mode === "project" ? (
        <div className="asset-form">
          <label>
            选择已发现项目
            <select
              value={projectId}
              onChange={(e) => setProjectId(e.target.value)}
            >
              <option value="">请选择项目</option>
              {discovered.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} · {p.repoKey || p.localPaths[0]}
                </option>
              ))}
            </select>
          </label>
          {!discovered.length && (
            <p className="body-copy">请先在项目空间扫描本地项目。</p>
          )}
          {selected && (
            <ProjectContext
              key={selected.id}
              project={selected}
              state={state}
              adoptState={adoptState}
              notify={notify}
            />
          )}
        </div>
      ) : (
        <form
          className="asset-form"
          onSubmit={(e) => {
            e.preventDefault();
            copy(preview.text, notify);
          }}
        >
          <div className="form-intro">
            <p>填写并检查后复制，不读取其他 Agent 的聊天记录。</p>
          </div>
          <label>
            项目名称
            <input
              value={project}
              onChange={(e) => setProject(e.target.value)}
              list="project-names"
            />
            <datalist id="project-names">
              {[...state.projects, ...(state.connections?.projects || [])].map(
                (p) => (
                  <option key={p.id}>{p.name}</option>
                ),
              )}
            </datalist>
          </label>
          <label>
            当前目标
            <input
              required
              value={goal}
              onChange={(e) => setGoal(e.target.value)}
            />
          </label>
          <label>
            已确认事实与成果指针
            <textarea
              required
              rows={4}
              value={facts}
              onChange={(e) => setFacts(e.target.value)}
            />
          </label>
          <label>
            唯一下一步
            <input
              required
              value={next}
              onChange={(e) => setNext(e.target.value)}
            />
          </label>
          <label>
            权限边界
            <textarea
              required
              rows={2}
              value={boundary}
              onChange={(e) => setBoundary(e.target.value)}
            />
          </label>
          <p>接力包预览（所见即复制）{preview.count > 0 && ` · 已隐去 ${preview.count} 段疑似凭据`}</p>
          <pre className="relay-manual-preview" tabIndex={0}>{preview.text}</pre>
          <Button type="submit">
            <Copy size={16} />
            复制接力包
          </Button>
        </form>
      )}
    </Dialog>
  );
}

// 随手记（路线 v3 切片 1.4）：受限 Markdown 富文本，只存本应用；唯一去向是“炼入焚决”。
// 炼入对话框已移到 RefineDialog.jsx（阶段 2：收藏页也要用，避免把整套工作区页面带进收藏）。
export { RefineDialog } from "./RefineDialog.jsx";
export function Night(props) {
  return <NightV16 {...props} />;
}


export function HistoryPage(props) {
  return (
    <HistoryArchive {...props} />
  );
}

export function References(props) {return <ReverseHatch {...props}/>;}
function LegacyReferences({ state, save, notify }) {
  const [modal, setModal] = useState(false),
    [title, setTitle] = useState(""),
    [url, setUrl] = useState(""),
    [note, setNote] = useState("");
  return (
    <div className="reverse-v14">
      <PageHeading
        page="references"
        action={
          <Button onClick={() => setModal(true)}>
            <Plus size={17} />
            保存参考
          </Button>
        }
      />
      <div className="subtle-notice">
        <ShieldCheck size={17} />
        只分析你提供的或公开的材料；报告区分“原文观察 / 推断 / 已验证”，不用于绕过授权或复制私有代码。
      </div>
      <ReverseWorkbench state={state} save={save} notify={notify} />
      <div className="section-head">
        <h2>
          参考链接 <span className="count">{state.references.length}</span>
        </h2>
      </div>
      {!state.references.length ? (
        <Empty
          icon={ScanLine}
          title="还没有参考"
          action={
            <Button secondary onClick={() => setModal(true)}>
              添加第一份参考
              <ArrowUpRight size={16} />
            </Button>
          }
        >
          一个好设计、一段巧妙的交互、一份开源实现，都可以从一条拆解笔记开始。
        </Empty>
      ) : (
        <div className="notes-grid">
          {state.references.map((r) => (
            <article key={r.id} className="note-card">
              <Badge>参考资料</Badge>
              <h3>{r.title}</h3>
              <p>{r.note}</p>
              <a
                className="text-button"
                href={r.url}
                target="_blank"
                rel="noreferrer"
              >
                查看来源
                <ExternalLink size={15} />
              </a>
            </article>
          ))}
        </div>
      )}
      {modal && (
        <Dialog title="保存参考" onClose={() => setModal(false)}>
          <form
            className="asset-form"
            onSubmit={async (e) => {
              e.preventDefault();
              let u;
              try {
                u = new URL(url);
                if (!["http:", "https:"].includes(u.protocol))
                  throw new Error();
              } catch {
                notify("请填写有效的 http 或 https 链接", "error");
                return;
              }
              try {
                if (
                  !(await save({
                    ...state,
                    references: [
                      { id: uid(), title, url: u.href, note },
                      ...state.references,
                    ],
                  }))
                )
                  return;
                setModal(false);
                setTitle("");
                setUrl("");
                setNote("");
                notify("参考资料已保存");
              } catch (error) {
                notify(error.message || "保存失败，内容仍保留在表单中", "error");
              }
            }}
          >
            <label>
              参考名称
              <input
                required
                value={title}
                onChange={(e) => setTitle(e.target.value)}
              />
            </label>
            <label>
              来源链接
              <input
                type="url"
                required
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="https://"
              />
            </label>
            <label>
              值得学习的地方
              <textarea
                rows={6}
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder={"看到了什么：页面、交互或代码里可以直接观察到的事实\n我的推断：为什么这样做，标注“推测”\n打算怎么用：想借鉴到哪个项目或资产"}
              />
            </label>
            <Button>保存参考</Button>
          </form>
        </Dialog>
      )}
    </div>
  );
}

export { SettingsV16 as Settings } from "./SettingsV16.jsx";
