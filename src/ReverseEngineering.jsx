// 逆向工程第一层（路线 v3 支线 B2）：投入素材 → 生成拆解任务包 → 复制给 Agent → 粘贴回复 → 预览报告与候选 → 勾选入库。
// 数据与规则全部在 src/reverse.js；这里只负责界面。Agent 回复里的任何文字都按纯文本渲染。
import React, { useState } from "react";
import { Copy, ScanLine, Trash2, RotateCcw, Plus, ExternalLink } from "lucide-react";
import { Button, Badge, Steps } from "./components.jsx";
import { copy } from "./Assets.jsx";
import { current } from "./store.js";
import { scrollsOf, orderScrolls, shortText } from "./scrolls.js";
import {
  SECTIONS,
  CANDIDATE_LABEL,
  recordsOf,
  liveRecords,
  shortId,
  createRecord,
  parseReply,
  saveReply,
  importCandidates,
  deleteRecord,
  restoreRecord,
  recordStatus,
} from "./reverse.js";

const STEPS = ["投入素材", "复制任务包给 Agent", "粘贴回复", "确认入库"];
const MARK_TONE = { 原文观察: "success", 推断: "warning", 已验证: "" };
const day = (at) => at.slice(0, 10);

export function ReverseWorkbench({ state, save, notify }) {
  const records = recordsOf(state);
  const [activeId, setActiveId] = useState(null);
  const active = records.find((r) => r.id === activeId && !r.deletedAt);
  const parsedOk = active?.reply ? parseReply(active.reply).ok : false;
  const step = !active ? 0 : active.imports?.length ? 4 : !active.reply ? 1 : parsedOk ? 3 : 2;
  return (
    <>
      <section className="reverse-workbench" aria-label="逆向工程工作区">
        <Steps items={STEPS} current={step} label="逆向流程" />
        {active ? (
          <RecordPanel
            key={active.id}
            record={active}
            state={state}
            save={save}
            notify={notify}
            onNew={() => setActiveId(null)}
          />
        ) : (
          <MaterialForm state={state} save={save} notify={notify} onCreated={setActiveId} />
        )}
      </section>
      <RecordList
        state={state}
        save={save}
        notify={notify}
        activeId={active?.id}
        onOpen={setActiveId}
      />
    </>
  );
}

function MaterialForm({ state, save, notify, onCreated }) {
  const [text, setText] = useState(""),
    [url, setUrl] = useState(""),
    [why, setWhy] = useState(""),
    [error, setError] = useState("");
  return (
    <form
      className="asset-form reverse-form"
      noValidate
      onSubmit={async (e) => {
        e.preventDefault();
        let record;
        try {
          record = createRecord({ text, url }, why);
        } catch (err) {
          setError(err.message);
          return;
        }
        setError("");
        if (!(await save({ ...state, reverseRecords: [record, ...recordsOf(state)] }))) return;
        setText("");
        setUrl("");
        setWhy("");
        notify("已生成拆解任务包");
        onCreated(record.id);
      }}
    >
      <h2 className="reverse-title">投入素材</h2>
      <p className="helper">
        第一类对象是“好内容”：文章、帖子、prompt。粘贴原文、填写链接，或两者都填。
      </p>
      <label>
        素材原文
        <textarea
          rows={7}
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="把你觉得好的文章、帖子或 prompt 原文粘贴到这里"
        />
      </label>
      <label>
        素材链接
        <input
          type="url"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="https://"
          aria-describedby="reverse-url-hint"
        />
        <small id="reverse-url-hint" className="helper">
          只记录链接，工作台不会联网抓取正文
        </small>
      </label>
      <label>
        我觉得好在哪里（可选）
        <input value={why} onChange={(e) => setWhy(e.target.value)} placeholder="一句话即可" />
      </label>
      {error && (
        <p className="inline-error" role="alert">
          {error}
        </p>
      )}
      <div className="form-actions">
        <Button>生成拆解任务包</Button>
      </div>
    </form>
  );
}

function RecordPanel({ record, state, save, notify, onNew }) {
  const locked = !!record.imports?.length;
  const [draft, setDraft] = useState(record.reply || ""),
    [result, setResult] = useState(() => (record.reply ? parseReply(record.reply) : null)),
    [picks, setPicks] = useState([]),
    [scrollId, setScrollId] = useState(""),
    [importError, setImportError] = useState("");
  const done = new Map((record.imports || []).map((i) => [i.index, i]));
  const scrolls = orderScrolls(scrollsOf(state));
  const candidates = result?.ok ? result.candidates : [];
  const needsScroll = candidates.some((c) => c.type === "scroll" && !done.has(c.index));
  const toggle = (index, on) =>
    setPicks((prev) => (on ? [...prev, index] : prev.filter((i) => i !== index)));
  async function parse() {
    const next = parseReply(draft);
    setImportError("");
    setPicks([]);
    if (!locked && draft !== (record.reply || "")) {
      let updated;
      try {
        updated = saveReply(state, record.id, draft);
      } catch (e) {
        setResult({ ok: false, error: e.message });
        return;
      }
      if (!(await save(updated))) return;
    }
    setResult(next);
  }
  async function importPicked() {
    let made;
    try {
      made = importCandidates(state, record.id, { picks, scrollId, candidates });
    } catch (e) {
      setImportError(e.message);
      return;
    }
    setImportError("");
    if (!(await save(made.state))) return;
    setPicks([]);
    notify(`已入库 ${made.results.length} 项`);
  }
  return (
    <div className="reverse-record">
      <div className="reverse-record-head">
        <div>
          <h2 className="reverse-title">{record.title}</h2>
          <p className="helper">
            {shortId(record.id)} · {day(record.createdAt)} · {recordStatus(record)}
          </p>
        </div>
        <Button secondary type="button" onClick={onNew}>
          <Plus size={16} />
          投入新素材
        </Button>
      </div>
      {record.material.url && (
        <p className="reverse-link">
          素材链接（未抓取）：
          <a href={record.material.url} target="_blank" rel="noreferrer noopener">
            {record.material.url}
            <ExternalLink size={13} />
          </a>
        </p>
      )}

      <h3>复制给 Agent</h3>
      {/* label 与文本框分开：否则只读文本框的内容会并入它的可访问名称。 */}
      <label htmlFor="reverse-pack">拆解任务包</label>
      <textarea id="reverse-pack" className="reverse-pack" rows={9} readOnly value={record.pack} />
      <div className="form-actions">
        <Button type="button" onClick={() => copy(record.pack, notify)}>
          <Copy size={16} />
          复制任务包
        </Button>
      </div>

      <h3>回收 Agent 回复</h3>
      <p className="helper">
        把 Agent 的完整回复粘贴到这里。只接受任务包规定的 JSON；解析不了会说明原因，不会猜。
        {locked && " 这条记录已入库，回复已锁定。"}
      </p>
      <label htmlFor="reverse-reply">Agent 回复</label>
      <textarea
          id="reverse-reply"
          rows={8}
          value={draft}
          readOnly={locked}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="```json …```"
        />
      <div className="form-actions">
        <Button type="button" secondary onClick={parse}>
          解析回复
        </Button>
      </div>
      {result && !result.ok && (
        <p className="inline-error" role="alert">
          {result.error}
        </p>
      )}
      {result?.ok && (
        <>
          {result.issues.length > 0 && (
            <div className="subtle-notice reverse-issues" role="note">
              <ul>
                {result.issues.map((issue) => (
                  <li key={issue}>{issue}</li>
                ))}
              </ul>
            </div>
          )}
          <section className="reverse-report" aria-label="拆解报告">
            <h3>拆解报告</h3>
            {result.report.summary && <p className="reverse-summary">{result.report.summary}</p>}
            {SECTIONS.map(([key, label]) => (
              <div key={key} className="reverse-section">
                <h4>{label}</h4>
                {result.report[key].length ? (
                  <ul>
                    {result.report[key].map((p, i) => (
                      <li key={i}>
                        <Badge tone={MARK_TONE[p.mark]}>{p.mark}</Badge>
                        <span>{p.text}</span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="helper">（没有内容）</p>
                )}
              </div>
            ))}
          </section>
          <div className="reverse-candidates" role="group" aria-label="候选资产">
            <h3>候选资产</h3>
            {!candidates.length && <p className="helper">回复里没有可入库的候选。</p>}
            {candidates.map((c) => {
              const imported = done.has(c.index);
              return (
                <label key={c.index} className={`candidate-pick ${imported ? "imported" : ""}`}>
                  <input
                    type="checkbox"
                    aria-label={`候选 ${c.index + 1}：${CANDIDATE_LABEL[c.type]} ${shortText(c.type === "prompt" ? c.title : c.text)}`}
                    checked={imported || picks.includes(c.index)}
                    disabled={imported}
                    onChange={(e) => toggle(c.index, e.target.checked)}
                  />
                  <span className="candidate-body">
                    <span className="candidate-meta">
                      <span>候选 {c.index + 1}</span>
                      <Badge>{CANDIDATE_LABEL[c.type]}</Badge>
                      <Badge tone={MARK_TONE[c.mark]}>{c.mark}</Badge>
                      {imported && <Badge tone="success">已入库</Badge>}
                    </span>
                    {c.type === "prompt" && <strong>{c.title}</strong>}
                    {c.type === "prompt" && c.description && <span className="helper">{c.description}</span>}
                    <span className="candidate-text">{c.type === "prompt" ? c.content : c.text}</span>
                    {c.tags.length > 0 && (
                      <span className="candidate-tags">{c.tags.map((t) => `#${t}`).join(" ")}</span>
                    )}
                  </span>
                </label>
              );
            })}
            {needsScroll &&
              (scrolls.length ? (
                <label>
                  焚决条目写入卷
                  <select value={scrollId} onChange={(e) => setScrollId(e.target.value)}>
                    <option value="">请选择卷</option>
                    {scrolls.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                  </select>
                </label>
              ) : (
                <p className="helper">还没有卷。先到资产仓库的“焚决”标签建一卷，再回来入库焚决条目。</p>
              ))}
            {importError && (
              <p className="inline-error" role="alert">
                {importError}
              </p>
            )}
            {candidates.length > 0 && (
              <div className="form-actions">
                <Button type="button" disabled={!picks.length} onClick={importPicked}>
                  确认入库（{picks.length} 项）
                </Button>
              </div>
            )}
          </div>
        </>
      )}
      {locked && <ImportResults record={record} state={state} />}
    </div>
  );
}

function ImportResults({ record, state }) {
  return (
    <section className="reverse-results" aria-label="入库结果">
      <h3>入库结果</h3>
      <ul>
        {record.imports.map((i) => {
          if (i.kind === "scroll") {
            const scroll = scrollsOf(state).find((s) => s.id === i.scrollId);
            const entry = scroll?.entries.find((e) => e.id === i.entryId);
            return (
              <li key={i.index}>
                候选 {i.index + 1} → 焚决「{scroll?.name || "卷已不存在"}」
                {entry ? `：${shortText(entry.text)}` : ""}
                {(scroll?.deletedAt || entry?.deletedAt) && "（已在回收区）"}
              </li>
            );
          }
          const asset = state.assets.find((a) => a.id === i.assetId);
          return (
            <li key={i.index}>
              候选 {i.index + 1} → Prompt「{asset ? current(asset).title : "资产已不存在"}」
              {asset?.archived && "（已归档）"}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function RecordList({ state, save, notify, activeId, onOpen }) {
  const [recycle, setRecycle] = useState(false);
  const records = recordsOf(state);
  const live = liveRecords(records);
  const deleted = records.filter((r) => r.deletedAt);
  const write = async (next, message) => {
    if (await save({ ...state, reverseRecords: next })) notify(message);
  };
  return (
    <section className="reverse-list" aria-label="逆向记录">
      <div className="section-head">
        <h2>
          逆向记录 <span className="count">{live.length}</span>
        </h2>
      </div>
      {live.length ? (
        <div className="rows-panel">
          {live.map((r) => (
            <div className={`record-row ${r.id === activeId ? "active" : ""}`} key={r.id}>
              <ScanLine size={20} />
              <div>
                <strong>{r.title}</strong>
                <p>
                  {shortId(r.id)} · {day(r.createdAt)} · {recordStatus(r)}
                </p>
              </div>
              <button
                className="text-button"
                aria-label={`打开逆向记录 ${r.title}`}
                onClick={() => {
                  onOpen(r.id);
                  document.querySelector(".reverse-workbench")?.scrollIntoView({ block: "start" });
                }}
              >
                打开
              </button>
              <button
                className="text-button danger-text"
                aria-label={`删除逆向记录 ${r.title}`}
                onClick={() => write(deleteRecord(records, r.id), "已移入回收区，可恢复")}
              >
                <Trash2 size={15} />
                删除
              </button>
            </div>
          ))}
        </div>
      ) : (
        <p className="helper reverse-empty">还没有逆向记录。投入第一份素材后，这里会列出每次拆解。</p>
      )}
      {deleted.length > 0 && (
        <div className="scroll-recycle">
          <button
            className="text-button recycle-toggle"
            aria-expanded={recycle}
            onClick={() => setRecycle(!recycle)}
          >
            回收区 {deleted.length}
          </button>
          {recycle && (
            <div className="recycle-list">
              {deleted.map((r) => (
                <div className="recycle-row" key={r.id}>
                  <span>{r.title}</span>
                  <button
                    className="text-button"
                    aria-label={`恢复逆向记录 ${r.title}`}
                    onClick={() => write(restoreRecord(records, r.id), "已恢复逆向记录")}
                  >
                    <RotateCcw size={15} />
                    恢复
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </section>
  );
}
