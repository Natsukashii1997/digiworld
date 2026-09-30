import { StoragePanel } from "./StoragePanel.jsx";
import { AiHotSettings, ShelfSettings } from "./LifePages.jsx";
import { retainedDemoIds } from "./asset-origin.js";
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
  List,
  ListOrdered,
  ListChecks,
} from "lucide-react";
import { Button, Badge, Empty, PageHeading, Dialog } from "./components.jsx";
import { Pixel } from "./pixel.jsx";
import { uid, now, current } from "./store.js";
import { copy, download } from "./Assets.jsx";
import { ReverseWorkbench } from "./ReverseEngineering.jsx";
import { ProjectContext } from "./ProjectContext.jsx";
import {
  NOTE_FORMAT,
  NOTE_MAX,
  INKS,
  inline,
  plainText,
  parseNote,
  toggleTask,
  applyList,
  applyInk,
} from "./rich-note.js";
import { scrollsOf, orderScrolls, addEntry } from "./scrolls.js";

export function Relay({ state, adoptState, notify, onClose }) {
  const [mode, setMode] = useState("manual"),
    [projectId, setProjectId] = useState("");
  const discovered = state.connections?.projects || [];
  const selected = discovered.find((p) => p.id === projectId);
  const [project, setProject] = useState(""),
    [goal, setGoal] = useState(""),
    [facts, setFacts] = useState(""),
    [next, setNext] = useState(""),
    [boundary, setBoundary] = useState("仅继续分析；外部写入需另行确认");
  const text = `# 项目上下文接力\n\n项目：${project || "未指定"}\n目标：${goal}\n\n## 已确认事实与成果\n${facts}\n\n## 权限与禁止事项\n${boundary}\n\n## 唯一下一步\n${next}\n\n生成时间：${new Date().toLocaleString("zh-CN")}\n本接力包由用户编写，目标 Agent 须核验当前事实。`;
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
            copy(text, notify);
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
function NoteBody({ note, onToggle, bodyRef }) {
  if (note.format !== NOTE_FORMAT)
    return (
      <div className="note-body" ref={bodyRef}>
        <p>{note.text}</p>
      </div>
    );
  const spans = (text) =>
    inline(text).map((part, i) =>
      part.ink ? (
        <span key={i} className={`ink-${part.ink}`}>
          {part.text}
        </span>
      ) : (
        <React.Fragment key={i}>{part.text}</React.Fragment>
      ),
    );
  return (
    <div className="note-body" ref={bodyRef}>
      {parseNote(note.text).map((block) => {
        const key = block.items[0].index;
        if (block.type === "ul")
          return (
            <ul className="note-ul" key={key}>
              {block.items.map((item) => (
                <li key={item.index}>{spans(item.text)}</li>
              ))}
            </ul>
          );
        if (block.type === "ol")
          return (
            <ol className="note-ol" key={key} start={block.start}>
              {block.items.map((item) => (
                <li key={item.index}>{spans(item.text)}</li>
              ))}
            </ol>
          );
        if (block.type === "tasks")
          return (
            <ul className="note-tasks" key={key}>
              {block.items.map((item) => (
                <li key={item.index} className={item.checked ? "done" : ""}>
                  <label className="note-task">
                    <input
                      type="checkbox"
                      checked={item.checked}
                      aria-label={plainText(item.text) || "未命名任务"}
                      onChange={() => onToggle(item.index)}
                    />
                    <span>{spans(item.text)}</span>
                  </label>
                </li>
              ))}
            </ul>
          );
        return (
          <p key={key}>
            {block.items.map((item, i) => (
              <React.Fragment key={item.index}>
                {i > 0 && <br />}
                {spans(item.text)}
              </React.Fragment>
            ))}
          </p>
        );
      })}
    </div>
  );
}
// 选区完全落在这条随手记正文里时才采用，避免把页面其他文字炼进去。
function selectionIn(element) {
  const selection = window.getSelection?.();
  if (!element || !selection || selection.isCollapsed || !selection.rangeCount)
    return "";
  if (
    !element.contains(selection.anchorNode) ||
    !element.contains(selection.focusNode)
  )
    return "";
  return selection.toString().trim();
}
function NoteCard({ note, scrolls, onEdit, onToggle, onRefine, notify }) {
  const body = useRef(null),
    captured = useRef(null);
  // 勾选先在界面上生效，保存失败再退回主库里的版本。
  const [shown, setShown] = useState(note.text);
  useEffect(() => setShown(note.text), [note.text]);
  async function toggle(index) {
    const next = toggleTask(shown, index);
    setShown(next);
    if (!(await onToggle(next))) setShown(note.text);
  }
  const target = note.refined
    ? scrolls.find((s) => s.id === note.refined.scrollId)
    : null;
  const whole = note.format === NOTE_FORMAT ? plainText(note.text) : note.text;
  return (
    <article className={`note-card ${note.refined ? "refined" : ""}`}>
      <time>{new Date(note.at).toLocaleString("zh-CN")}</time>
      <NoteBody note={{ ...note, text: shown }} onToggle={toggle} bodyRef={body} />
      {note.refined && (
        <p className="note-refined">
          <Flame size={14} />
          已炼 · {target && !target.deletedAt ? target.name : "卷已移入回收区"}
        </p>
      )}
      <footer>
        <div>
          <button className="text-button" onClick={onEdit}>
            编辑
          </button>
          <button
            className="icon-button"
            aria-label="复制随手记"
            onClick={() => copy(whole, notify)}
          >
            <Copy size={15} />
          </button>
        </div>
        {!note.refined && (
          <button
            className="text-button refine-button"
            onMouseDown={() => (captured.current = selectionIn(body.current))}
            onClick={() => {
              const text = captured.current ?? selectionIn(body.current);
              captured.current = null;
              onRefine(text || whole.trim(), !!text);
            }}
          >
            <Flame size={15} />
            炼入焚决
          </button>
        )}
      </footer>
    </article>
  );
}
function RefineDialog({ draft, scrolls, onClose, onConfirm, navigate }) {
  const live = orderScrolls(scrolls);
  const [scrollId, setScrollId] = useState(live[0]?.id || "");
  return (
    <Dialog title="炼入焚决" onClose={onClose}>
      <form
        className="asset-form refine-form"
        onSubmit={(e) => {
          e.preventDefault();
          if (scrollId) onConfirm(scrollId);
        }}
      >
        <p className="body-copy">
          {draft.partial ? "把选中的文字" : "把整条随手记"}
          作为新条目加入所选卷的末尾，原随手记标记为“已炼”。
        </p>
        <blockquote className="refine-preview">{draft.text}</blockquote>
        {live.length ? (
          <>
            <label>
              目标卷
              <select value={scrollId} onChange={(e) => setScrollId(e.target.value)}>
                {live.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </label>
            <Button type="submit">
              <Flame size={16} />
              炼入
            </Button>
          </>
        ) : (
          <>
            <p className="body-copy">还没有卷。先到资产仓库的“焚决”标签建一卷，再回来炼入。</p>
            {/* 焚决已迁入资产仓库（切片 1.3b）：#scrolls 旧路由落到资产仓库并选中“焚决”标签。 */}
            <Button type="button" secondary onClick={() => navigate("scrolls")}>
              去焚决建卷
            </Button>
          </>
        )}
      </form>
    </Dialog>
  );
}
export function Notes({ state, save, notify, navigate }) {
  const [text, setText] = useState(""),
    [editId, setEditId] = useState(null),
    [refining, setRefining] = useState(null);
  const editor = useRef(null),
    pendingSelection = useRef(null);
  const scrolls = scrollsOf(state);
  useEffect(() => {
    const range = pendingSelection.current;
    if (!range || !editor.current) return;
    pendingSelection.current = null;
    editor.current.focus();
    editor.current.setSelectionRange(range[0], range[1]);
  }, [text]);
  function format(apply, arg) {
    const el = editor.current;
    const result = apply(text, el.selectionStart, el.selectionEnd, arg);
    if (result.value.length > NOTE_MAX) {
      notify(`单条随手记最多 ${NOTE_MAX} 字`, "warning");
      return;
    }
    pendingSelection.current = [result.start, result.end];
    setText(result.value);
  }
  async function submit(e) {
    e.preventDefault();
    if (!text.trim()) return;
    const value = text.trim().replace(/[\x00-\x08\x0b-\x1f\x7f]/g, "");
    if (
      !(await save({
        ...state,
        notes: editId
          ? state.notes.map((n) =>
              n.id === editId
                ? { ...n, text: value, at: now(), format: NOTE_FORMAT }
                : n,
            )
          : [
              { id: uid(), text: value, at: now(), format: NOTE_FORMAT },
              ...state.notes,
            ],
      }))
    )
      return;
    setText("");
    setEditId(null);
    notify("已保存本地随手记");
  }
  async function refine(scrollId) {
    const { note, text: entryText } = refining;
    const { scrolls: next, entry } = addEntry(scrolls, scrollId, entryText);
    const at = now();
    const success = await save({
      ...state,
      scrolls: next,
      notes: state.notes.map((n) =>
        n.id === note.id
          ? { ...n, refined: { scrollId, entryId: entry.id, at } }
          : n,
      ),
    });
    if (!success) return;
    setRefining(null);
    notify(`已炼入「${next.find((s) => s.id === scrollId).name}」`);
  }
  return (
    <>
      <PageHeading page="notes" />
      <form className="note-composer" onSubmit={submit}>
        <div>
          <PenLine size={17} />
          <span>{editId ? "修改这条想法" : "此刻在想什么？"}</span>
        </div>
        <div className="note-toolbar" role="toolbar" aria-label="随手记格式">
          {[
            ["无序列表", List, "ul"],
            ["有序列表", ListOrdered, "ol"],
            ["任务列表", ListChecks, "task"],
          ].map(([label, Icon, kind]) => (
            <button
              key={kind}
              type="button"
              className="icon-button"
              aria-label={label}
              title={label}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => format(applyList, kind)}
            >
              <Icon size={17} />
            </button>
          ))}
          <span className="note-toolbar-sep" aria-hidden="true" />
          {INKS.map(([ink, label]) => (
            <button
              key={ink}
              type="button"
              className={`icon-button ink-swatch ink-${ink}`}
              aria-label={label}
              title={`${label}字`}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => format(applyInk, ink)}
            >
              <span aria-hidden="true">A</span>
            </button>
          ))}
        </div>
        <textarea
          ref={editor}
          value={text}
          maxLength={NOTE_MAX}
          onChange={(e) => setText(e.target.value)}
          placeholder="一个念头、一个问题，或一件值得继续探索的事……"
          aria-label="随手记内容"
          aria-describedby="note-syntax"
          rows={5}
        />
        <footer>
          <span id="note-syntax">
            只保存在本应用 · “- ”列表、“1. ”编号、“- [ ] ”任务、“[文字]{"{red}"}”字色
          </span>
          <div>
            {editId && (
              <button
                type="button"
                className="text-button"
                onClick={() => {
                  setText("");
                  setEditId(null);
                }}
              >
                取消编辑
              </button>
            )}
            <Button disabled={!text.trim()}>
              {editId ? "保存修改" : "留下这个想法"}
              <ArrowUpRight size={16} />
            </Button>
          </div>
        </footer>
      </form>
      <div className="section-head">
        <h2>
          最近的想法 <span className="count">{state.notes.length}</span>
        </h2>
      </div>
      {!state.notes.length ? (
        <Empty title="还没有记录">
          想到就写，分类和归位都可以之后再说。
        </Empty>
      ) : (
        <div className="notes-grid">
          {state.notes.map((n) => (
            <NoteCard
              key={n.id}
              note={n}
              scrolls={scrolls}
              notify={notify}
              onEdit={() => {
                setEditId(n.id);
                setText(n.text);
                window.scrollTo({ top: 0, behavior: "smooth" });
              }}
              onToggle={(text) =>
                save({
                  ...state,
                  notes: state.notes.map((x) =>
                    x.id === n.id ? { ...x, text } : x,
                  ),
                })
              }
              onRefine={(text, partial) =>
                setRefining({ note: n, text: text.slice(0, NOTE_MAX), partial })
              }
            />
          ))}
        </div>
      )}
      {refining && (
        <RefineDialog
          draft={refining}
          scrolls={scrolls}
          navigate={navigate}
          onClose={() => setRefining(null)}
          onConfirm={refine}
        />
      )}
    </>
  );
}

export function Night({ state, save, notify }) {
  const [draft, setDraft] = useState(state.night);
  return (
    <>
      <PageHeading page="night" />
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          if (!(await save({ ...state, night: { ...draft, enabled: false } })))
            return;
          notify("夜间计划已保存为草稿，没有启用调度");
        }}
        className="night-form"
      >
        <div className="section-head">
          <div>
            <h2>夜间计划</h2>
            <p>
              先想清楚时间、预算和允许做的事。调度、预检、停止与晨间接管尚未实现，保存不会触发任何运行。
            </p>
          </div>
          <Badge tone="muted">草稿</Badge>
        </div>
        <div className="form-row">
          <label>
            开始时间
            <input
              type="time"
              required
              value={draft.time}
              onChange={(e) => setDraft({ ...draft, time: e.target.value })}
            />
          </label>
          <label>
            最晚停止
            <input
              type="time"
              required
              value={draft.end}
              onChange={(e) => setDraft({ ...draft, end: e.target.value })}
            />
          </label>
          <label>
            预算上限（元 / 次）
            <input
              type="number"
              required
              min="0"
              max="10000"
              value={draft.budget}
              onChange={(e) => setDraft({ ...draft, budget: e.target.value })}
            />
          </label>
        </div>
        <label>
          允许处理的内容
          <textarea
            rows={4}
            value={draft.task}
            onChange={(e) => setDraft({ ...draft, task: e.target.value })}
            placeholder="例如：对指定的资料做去重检查，输出待确认清单，不改动原文件。"
          />
        </label>
        <Button type="submit">保存计划草稿</Button>
      </form>
      <section className="settings-panel night-gaps">
        <span className="night-ghost" aria-hidden="true">
          <Pixel sprite="bakemon" size={86} />
        </span>
        <div className="section-head">
          <div>
            <h2>真正运行前还缺什么</h2>
            <p>夜间任务要安全地无人值守，需要以下条件逐项到位。目前都还没有实现。</p>
          </div>
          <Badge tone="muted">规划中</Badge>
        </div>
        <ol className="gap-list">
          {[
            ["允许的任务与输入", "只跑事先定义好的任务，输入来自指定位置"],
            ["可修改的范围", "哪些文件能改、哪些只能读"],
            ["时间与成本上限", "到点或超预算就停止，不把“未定”当成无限"],
            ["成功与终止条件", "什么算完成，什么情况转人工"],
            ["结果落点与收据", "成果放在哪里，失败留下可核对的记录"],
            ["晨间接管", "早上无需翻日志就能知道完成了什么、卡在哪里"],
          ].map(([name, note]) => (
            <li key={name}>
              <strong>{name}</strong>
              <span>{note}</span>
            </li>
          ))}
        </ol>
      </section>
    </>
  );
}

export function HistoryPage({ state, save, notify, select }) {
  const archived = state.assets.filter((a) => a.archived);
  return (
    <>
      <PageHeading page="history" />
      <div className="section-head">
        <h2>
          有多个版本的资产{" "}
          <span className="count">
            {state.assets.filter((a) => a.versions.length > 1).length}
          </span>
        </h2>
      </div>
      <div className="rows-panel">
        {state.assets
          .filter((a) => a.versions.length > 1)
          .map((a) => (
            <button
              className="record-row clickable-row"
              key={a.id}
              onClick={() => select(a.id)}
            >
              <GitBranch size={21} />
              <div>
                <strong>{current(a).title}</strong>
                <p>
                  v1.0 → v{a.versions.length}.0 · {a.versions.length}{" "}
                  个完整版本 · {a.archived ? "已归档" : "使用中"}
                </p>
              </div>
              <ChevronRight size={17} />
            </button>
          ))}
        {!state.assets.some((a) => a.versions.length > 1) && (
          <Empty icon={GitBranch} title="还没有资产被修改过">
            在资产详情里点“编辑”并保存，就会产生第二个版本，并可在这里追溯和恢复。
          </Empty>
        )}
      </div>
      <div className="section-head">
        <h2>
          归档资产 <span className="count">{archived.length}</span>
        </h2>
      </div>
      {archived.length ? (
        <div className="rows-panel">
          {archived.map((a) => (
            <div className="record-row" key={a.id}>
              <Archive size={20} />
              <div>
                <strong>{current(a).title}</strong>
                <p>{a.type} · 历史版本已保留</p>
              </div>
              <button
                className="text-button"
                onClick={async () => {
                  if (
                    !(await save({
                      ...state,
                      assets: state.assets.map((x) =>
                        x.id === a.id ? { ...x, archived: false } : x,
                      ),
                    }))
                  )
                    return;
                  notify("已恢复到资产库");
                }}
              >
                恢复资产
              </button>
            </div>
          ))}
        </div>
      ) : (
        <Empty icon={Archive} title="没有归档资产">
          暂时不用的资产可以归档，历史版本完整保留，随时恢复。
        </Empty>
      )}
    </>
  );
}

export function References({ state, save, notify }) {
  const [modal, setModal] = useState(false),
    [title, setTitle] = useState(""),
    [url, setUrl] = useState(""),
    [note, setNote] = useState("");
  return (
    <>
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
    </>
  );
}

export function Settings({ state, save, notify, adoptState }) {
  const [model, setModel] = useState(state.model),
    [confirm, setConfirm] = useState(false);
  const retainedDemos = retainedDemoIds(
    state.assets,
    state.connections?.skillCopies,
    state.assetActivity,
  );
  const removableDemos = state.assets.filter(
    (a) => a.demo && !retainedDemos.has(a.id),
  );
  return (
    <>
      <PageHeading page="settings" />
      <section className="settings-panel">
        <div className="section-head">
          <div>
            <h2>模型与 API</h2>
            <p>
              只记录你打算使用的连接。不保存密钥、不发起请求，也不会切换任何
              Agent 的模型。
            </p>
          </div>
          <Badge tone="muted">未连接</Badge>
        </div>
        <form
          className="settings-form"
          onSubmit={async (e) => {
            e.preventDefault();
            if (!(await save({ ...state, model }))) return;
            notify("模型配置草稿已保存；尚未验证或采用");
          }}
        >
          <div className="form-row">
            <label>
              提供商
              <input
                value={model.provider}
                onChange={(e) =>
                  setModel({ ...model, provider: e.target.value })
                }
                placeholder="例如 OpenAI / DeepSeek"
              />
            </label>
            <label>
              模型 ID
              <input
                value={model.model}
                onChange={(e) => setModel({ ...model, model: e.target.value })}
                placeholder="以提供商实际可用模型为准"
              />
            </label>
          </div>
          <label>
            API 地址（不含密钥）
            <input
              type="url"
              value={model.endpoint}
              onChange={(e) => setModel({ ...model, endpoint: e.target.value })}
              placeholder="https://…"
            />
          </label>
          <Button secondary>保存配置草稿</Button>
        </form>
      </section>
      <AiHotSettings notify={notify} />
      <ShelfSettings state={state} notify={notify} adoptState={adoptState} />
      <StoragePanel state={state} adoptState={adoptState} notify={notify} />
      <section className="settings-panel">
        <div className="setting-row">
          <div>
            <strong>移除演示资产</strong>
            <p>仅移除标记为示例的资产，保留你的其他记录。</p>
          </div>
          <button
            className="text-button danger-text"
            onClick={() => setConfirm(true)}
          >
            移除示例
          </button>
        </div>
      </section>
      {confirm && (
        <Dialog title="移除演示资产" onClose={() => setConfirm(false)}>
          <div className="asset-form">
            <p className="body-copy">
              将移除 {removableDemos.length}{" "}
              份演示资产（包含对示例的修改和历史版本）。此操作不能在应用内撤销；如需保留，请先导出。
            </p>
            {retainedDemos.size > 0 && (
              <p className="context-receipt">
                保留 {retainedDemos.size}{" "}
                份被工作流历史、个人改版、目标副本或使用反馈引用的示例，确保来源仍可找回。
              </p>
            )}
            <div className="form-actions">
              <Button secondary onClick={() => setConfirm(false)}>
                取消
              </Button>
              <Button
                onClick={async () => {
                  if (
                    !(await save({
                      ...state,
                      assets: state.assets.filter(
                        (a) => !a.demo || retainedDemos.has(a.id),
                      ),
                    }))
                  )
                    return;
                  setConfirm(false);
                  notify("已移除未被引用的示例；个人资产及历史引用保留");
                }}
              >
                确认移除
              </Button>
            </div>
          </div>
        </Dialog>
      )}
    </>
  );
}
