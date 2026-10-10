// 逆向工程第一层（路线 v3 支线 B2）：投入素材 → 生成拆解任务包 → 复制给 Agent → 粘贴回复 → 预览报告与候选 → 勾选入库。
// 数据与规则全部在 src/reverse.js；这里只负责界面。Agent 回复里的任何文字都按纯文本渲染。
import React, { useRef, useState } from "react";
import { PageChoices } from "./PageChoices.jsx";
import { COLLAB_AGENTS, agentLabel } from "./collab.js";
import { exactQuoteAnchors } from "./reverse-anchors.js";
import {
  Copy,
  ScanLine,
  Trash2,
  RotateCcw,
  Plus,
  ExternalLink,
} from "lucide-react";
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
  createDraft,
  generateRecordPack,
  recordPackCopy,
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
  const step = !active || active.stage === "draft"
    ? 0
    : active.imports?.length
      ? 4
      : !active.reply
        ? 1
        : parsedOk
          ? 3
          : 2;
  return (
    <>
      <RecordList
        state={state}
        save={save}
        notify={notify}
        activeId={active?.id}
        onOpen={setActiveId}
        onNew={() => setActiveId(null)}
      />
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
          <MaterialForm
            state={state}
            save={save}
            notify={notify}
            onCreated={setActiveId}
          />
        )}
      </section>
    </>
  );
}

export function MaterialForm({ state, save, notify, onCreated }) {
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
          record = (e.nativeEvent.submitter?.value === "draft" ? createDraft : createRecord)({ text, url }, why);
        } catch (err) {
          setError(err.message);
          return;
        }
        setError("");
        if (
          !(await save({
            ...state,
            reverseRecords: [record, ...recordsOf(state)],
          }))
        )
          return;
        setText("");
        setUrl("");
        setWhy("");
        notify(record.stage === "draft" ? "已保存素材草稿；尚未生成任务包" : "已生成拆解任务包");
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
        <input
          value={why}
          onChange={(e) => setWhy(e.target.value)}
          placeholder="一句话即可"
        />
      </label>
      {error && (
        <p className="inline-error" role="alert">
          {error}
        </p>
      )}
      <div className="form-actions">
        <Button secondary type="submit" name="material-action" value="draft">保存素材草稿</Button>
        <Button type="submit" name="material-action" value="pack">生成拆解任务包</Button>
      </div>
    </form>
  );
}

export function RecordPanel({ record, state, save, notify, onNew }) {
  const locked = !!record.imports?.length;
  const [draft, setDraft] = useState(record.reply || ""),
    [result, setResult] = useState(() =>
      record.reply ? parseReply(record.reply) : null,
    ),
    [picks, setPicks] = useState([]),
    [scrollId, setScrollId] = useState(""),
    [importError, setImportError] = useState("");
  const [agentId, setAgentId] = useState(""), [copyBusy, setCopyBusy] = useState(false), [copyError, setCopyError] = useState("");
  const copyLock = useRef(false);
  const anchors = exactQuoteAnchors(record.material.text, result?.ok ? result.report : null);
  const done = new Map((record.imports || []).map((i) => [i.index, i]));
  const scrolls = orderScrolls(scrollsOf(state));
  const candidates = result?.ok ? result.candidates : [];
  const needsScroll = candidates.some(
    (c) => c.type === "scroll" && !done.has(c.index),
  );
  const toggle = (index, on) =>
    setPicks((prev) =>
      on ? [...prev, index] : prev.filter((i) => i !== index),
    );
  async function copyPack() {
    if (copyLock.current || !agentId) return;
    copyLock.current = true; setCopyBusy(true); setCopyError("");
    try {
      if (!(await copy(record.pack, notify))) return;
      if (!(await save(recordPackCopy(state, record.id, {agentId}))))
        setCopyError("任务包已复制，但复制回执未保存；请刷新核对，不要为补记而重复复制。");
    } catch (e) { setCopyError(e.message); }
    finally { copyLock.current = false; setCopyBusy(false); }
  }
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
      made = importCandidates(state, record.id, {
        picks,
        scrollId,
        candidates,
      });
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
            {shortId(record.id)} · {day(record.createdAt)} ·{" "}
            {recordStatus(record)}
          </p>
        </div>
        <Button secondary type="button" onClick={onNew} aria-label={`为 ${record.title}（${record.id}）投入新素材`}>
          <Plus size={16} />
          投入新素材
        </Button>
      </div>
      <div className="reverse-clip">
        <article className="reverse-paper" aria-label="原文剪报">
          <small>素材原文 · {day(record.createdAt)}</small>
          <h3>{record.title}</h3>
          <p>{record.material.text ? anchors.segments.map((segment,i) => segment.numbers.length ?
            <mark key={i} title={`对应批注 ${segment.numbers.join("、")}`}>{segment.text}<sup aria-label={`对应批注 ${segment.numbers.join("、")}`}>{segment.numbers.join("、")}</sup></mark> :
            <React.Fragment key={i}>{segment.text}</React.Fragment>) : "只有链接，未抓取正文。"}</p>
          {record.why && (
            <p className="reverse-paper-why">
              <b>我觉得好在哪里</b>
              <br />
              {record.why}
            </p>
          )}
          <small>荧光仅标出精确引用；引用缺失、不匹配或不唯一时标为未定位。</small>
        </article>
        <div className="reverse-annotations">
          {result?.ok ? (
            <section className="reverse-report" aria-label="拆解报告">
              <h3>拆解报告</h3>
              {result.report.summary && (
                <p className="reverse-summary">{result.report.summary}</p>
              )}
              {SECTIONS.map(([key, label]) => (
                <div key={key} className="reverse-section">
                  <h4>{label}</h4>
                  {result.report[key].length ? (
                    <ul>
                      {result.report[key].map((p, i) => (
                        <li key={i}>
                          <Badge tone={MARK_TONE[p.mark]}>{p.mark}</Badge>
                          <small>{(() => { const a=anchors.points.find(a=>a.section===key&&a.index===i); return a?.status === "located" ? `原文锚点 ${a.number}` : `未定位 · ${a?.reason || "未提供精确引用句"}`; })()}</small>
                          <span className="reverse-mark-line">
                            <mark className={`reverse-mark mark-${key}`}>
                              {p.text}
                            </mark>
                          </span>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="helper">（没有内容）</p>
                  )}
                </div>
              ))}
            </section>
          ) : (
            <p className="helper">
              批注待接入数据：解析有效报告后，显示 Agent
              的结构、手法与可复用分析。
            </p>
          )}
        </div>
      </div>
      {record.material.url && (
        <p className="reverse-link">
          素材链接（未抓取）：
          <a
            href={record.material.url}
            target="_blank"
            rel="noreferrer noopener"
          >
            {record.material.url}
            <ExternalLink size={13} />
          </a>
        </p>
      )}

      {record.stage === "draft" ? <div className="form-actions">
        <Button type="button" onClick={async()=>{if(await save(generateRecordPack(state,record.id))) notify("已生成拆解任务包；尚未复制给 Agent");}}>生成任务包</Button>
      </div> : <>
      <h3>复制给 Agent</h3>
      {/* label 与文本框分开：否则只读文本框的内容会并入它的可访问名称。 */}
      <label htmlFor="reverse-pack">拆解任务包</label>
      <textarea
        id="reverse-pack"
        className="reverse-pack"
        rows={9}
        readOnly
        value={record.pack}
      />
      <div className="form-actions">
        <PageChoices label={`任务包接收 Agent：${record.title}`} choices={COLLAB_AGENTS.map(a=>[a.id,a.label])} value={agentId} onChange={setAgentId} />
        <Button type="button" disabled={!agentId || copyBusy} onClick={copyPack}>
          <Copy size={16} />
          复制任务包
        </Button>
      </div>

      {copyError && <p className="inline-error" role="alert">{copyError}</p>}
      <p className="helper">{record.copies?.length ? `最近复制给 ${agentLabel(record.copies.at(-1).agentId)} · ${record.copies.at(-1).at}；已复制不代表已派发。` : "尚无复制回执；任务包生成不代表已派发。"}</p>
      <h3>回收 Agent 回复</h3>
      <p className="helper">
        把 Agent 的完整回复粘贴到这里。只接受任务包规定的
        JSON；解析不了会说明原因，不会猜。
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

          <div
            className="reverse-candidates"
            role="group"
            aria-label="候选资产"
          >
            <h3>候选资产</h3>
            {!candidates.length && (
              <p className="helper">回复里没有可入库的候选。</p>
            )}
            {candidates.map((c) => {
              const imported = done.has(c.index);
              return (
                <label
                  key={c.index}
                  className={`candidate-pick ${imported ? "imported" : ""}`}
                >
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
                    {c.type === "prompt" && c.description && (
                      <span className="helper">{c.description}</span>
                    )}
                    <CandidateText
                      text={c.type === "prompt" ? c.content : c.text}
                    />
                    {c.tags.length > 0 && (
                      <span className="candidate-tags">
                        {c.tags.map((t) => `#${t}`).join(" ")}
                      </span>
                    )}
                  </span>
                </label>
              );
            })}
            {needsScroll &&
              (scrolls.length ? (
                <label>
                  焚决条目写入卷
                  <select
                    value={scrollId}
                    onChange={(e) => setScrollId(e.target.value)}
                  >
                    <option value="">请选择卷</option>
                    {scrolls.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                  </select>
                </label>
              ) : (
                <p className="helper">
                  还没有卷。先到资产仓库的“焚决”标签建一卷，再回来入库焚决条目。
                </p>
              ))}
            {importError && (
              <p className="inline-error" role="alert">
                {importError}
              </p>
            )}
            {candidates.length > 0 && (
              <div className="form-actions">
                <Button
                  type="button"
                  disabled={!picks.length}
                  onClick={importPicked}
                >
                  确认入库（{picks.length} 项）
                </Button>
              </div>
            )}
          </div>
        </>
      )}
      {locked && <ImportResults record={record} state={state} />}
      </>}
    </div>
  );
}

// 长候选默认折叠：只显示前 6 行（且不超过 360 字），可展开全文（用户 2026-10-03）。
const FOLD_LINES = 6;
const FOLD_CHARS = 360;
function CandidateText({ text }) {
  const [open, setOpen] = useState(false);
  const lines = text.split("\n");
  const long = lines.length > FOLD_LINES || text.length > FOLD_CHARS;
  const shown =
    !long || open
      ? text
      : lines.slice(0, FOLD_LINES).join("\n").slice(0, FOLD_CHARS) + "…";
  return (
    <>
      <span className="candidate-text">{shown}</span>
      {long && (
        <Button
          type="button"
          secondary
          className="candidate-fold"
          aria-expanded={open}
          onClick={(e) => {
            // 按钮在 label 里，阻止默认行为，避免顺带勾选候选。
            e.preventDefault();
            setOpen(!open);
          }}
        >
          {open ? "收起" : `展开全文（共 ${lines.length} 行）`}
        </Button>
      )}
    </>
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
              候选 {i.index + 1} → Prompt「
              {asset ? current(asset).title : "资产已不存在"}」
              {asset?.archived && "（已归档）"}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function RecordList({ state, save, notify, activeId, onOpen, onNew }) {
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
      <div
        className="reverse-board"
        role="radiogroup"
        aria-label="选择逆向记录"
      >
        {["素材", "交给 Agent", "报告待确认", "已入库"].map((label, column) => {
          const list = live.filter((r) =>
            column === 1
              ? r.stage !== "draft" && !r.imports?.length && (!r.reply || !parseReply(r.reply).ok)
              : column === 2
                ? !!r.reply && parseReply(r.reply).ok && !r.imports?.length
                : column === 3
                  ? !!r.imports?.length
                  : r.stage === "draft",
          );
          return (
            <section className="reverse-lane" key={label}>
              <h3>
                {label}
                <span> · {list.length}</span>
              </h3>
              {column === 0 && (
                <>
                  <p>已保存、尚未生成任务包的素材。</p>
                  <button
                    className="reverse-add"
                    aria-label="看板投入新素材"
                    onClick={onNew}
                  >
                    投入新素材
                  </button>
                </>
              )}
              {column === 1 && <p>任务包已生成；复制回执仅表示已复制，不代表派发。</p>}
              {list.map((r) => (
                <div
                  className={`record-row reverse-board-card ${r.id === activeId ? "active" : ""}`}
                  key={r.id}
                >
                  <button
                    className="reverse-card-select"
                    role="radio"
                    aria-checked={r.id === activeId}
                    aria-label={`打开逆向记录 ${r.title}`}
                    tabIndex={
                      r.id === activeId || (!activeId && r === live[0]) ? 0 : -1
                    }
                    onKeyDown={(e) => {
                      const cards = [
                          ...e.currentTarget
                            .closest('[role="radiogroup"]')
                            .querySelectorAll('[role="radio"]'),
                        ],
                        i = cards.indexOf(e.currentTarget);
                      const j =
                        e.key === "Home"
                          ? 0
                          : e.key === "End"
                            ? cards.length - 1
                            : ["ArrowRight", "ArrowDown"].includes(e.key)
                              ? (i + 1) % cards.length
                              : ["ArrowLeft", "ArrowUp"].includes(e.key)
                                ? (i + cards.length - 1) % cards.length
                                : null;
                      if (j === null) return;
                      e.preventDefault();
                      cards[j].focus();
                      cards[j].click();
                    }}
                    onClick={() => onOpen(r.id)}
                  >
                    <small>
                      {shortId(r.id)} · {day(r.createdAt)}
                    </small>
                    <strong>{r.title}</strong>
                    <small>
                      {r.reply && !r.imports?.length && !parseReply(r.reply).ok
                        ? "回复解析未通过 · 待修正"
                        : recordStatus(r)}
                    </small>
                  </button>
                  <button
                    className="text-button danger-text"
                    aria-label={`删除逆向记录 ${r.title}`}
                    onClick={() =>
                      write(deleteRecord(records, r.id), "已移入回收区，可恢复")
                    }
                  >
                    <Trash2 size={15} />
                    删除
                  </button>
                </div>
              ))}
              {!list.length && <p>暂无记录</p>}
            </section>
          );
        })}
      </div>
      {!live.length && (
        <p className="helper reverse-empty">
          还没有逆向记录。投入第一份素材后，这里会列出每次拆解。
        </p>
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
                    onClick={() =>
                      write(restoreRecord(records, r.id), "已恢复逆向记录")
                    }
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
