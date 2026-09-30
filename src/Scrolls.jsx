// 焚决（路线 v3 切片 1.3；1.3b 迁入资产仓库）：用户自建的“卷”，每卷是有序的碎片列表。
// 用户 2026-09-30 纠正：焚决是资产仓库的第五种类型，不单独占导航。卷以卡片出现在资产仓库，
// 点开后在详情抽屉里编辑；回收区在“焚决”类型标签下方。
// 条目可打标签、按标签筛选、一键复制（复制成功才计一次）；删除进回收区可恢复；条目不做版本。
import React, { useState } from "react";
import {
  ArrowDown,
  ArrowUp,
  Copy,
  PenLine,
  RotateCcw,
  Trash2,
  Archive,
} from "lucide-react";
import { Badge, Button, Cover, Dialog, Empty, TypeIcon } from "./components.jsx";
import { copy } from "./Assets.jsx";
import {
  scrollsOf,
  orderScrolls,
  liveEntries,
  parseTags,
  shortText,
  renameScroll,
  deleteScroll,
  restoreScroll,
  addEntry,
  editEntry,
  deleteEntry,
  restoreEntry,
  countUse,
  moveEntry,
  scrollSerials,
  scrollStats,
  NAME_MAX,
  TEXT_MAX,
} from "./scrolls.js";

// 焚决详情抽屉：与资产详情同样式；卷被删除或不存在时由调用方关闭。
export function ScrollDetail({ scroll: selected, state, save, notify, onClose }) {
  const all = scrollsOf(state);
  const [body, setBody] = useState(""),
    [tagText, setTagText] = useState(""),
    [filter, setFilter] = useState(null),
    [editing, setEditing] = useState(null),
    [renaming, setRenaming] = useState(false);
  const entries = liveEntries(selected);
  const tags = [...new Set(entries.flatMap((e) => e.tags))];
  const activeFilter = filter && tags.includes(filter) ? filter : null;
  const shown = activeFilter
    ? entries.filter((e) => e.tags.includes(activeFilter))
    : entries;
  const { uses } = scrollStats(selected);
  const persist = (scrolls) => save({ ...state, scrolls });

  async function add(e) {
    e.preventDefault();
    if (!body.trim()) return;
    const { scrolls } = addEntry(all, selected.id, body.trim(), parseTags(tagText));
    if (!(await persist(scrolls))) return;
    setBody("");
    setTagText("");
    notify(`已加入「${selected.name}」`);
  }
  async function copyEntry(entry) {
    if (!(await copy(entry.text, notify))) return;
    await persist(countUse(all, selected.id, entry.id));
  }

  return (
    <Dialog title="焚决详情" onClose={onClose} drawer>
      <Cover
        type="Scroll"
        serial={scrollSerials(all)[selected.id]}
        version={null}
        uses={uses}
        large
      />
      <div className="detail-content scroll-detail">
        <div className="detail-type">
          <Badge>
            <TypeIcon type="Scroll" size={13} />
            焚决
          </Badge>
          <span className="detail-version">{entries.length} 条 · 复制 {uses} 次</span>
        </div>
        <header className="scroll-head">
          {renaming ? (
            <form
              className="scroll-rename"
              onSubmit={async (e) => {
                e.preventDefault();
                const name = new FormData(e.currentTarget).get("name");
                if (!String(name).trim()) return;
                if (await persist(renameScroll(all, selected.id, String(name))))
                  setRenaming(false);
              }}
            >
              <input
                name="name"
                defaultValue={selected.name}
                maxLength={NAME_MAX}
                aria-label="卷名称"
                autoFocus
              />
              <Button>保存卷名</Button>
              <button
                type="button"
                className="text-button"
                onClick={() => setRenaming(false)}
              >
                取消
              </button>
            </form>
          ) : (
            <>
              <h2>{selected.name}</h2>
              <div className="scroll-actions">
                <button className="text-button" onClick={() => setRenaming(true)}>
                  <PenLine size={15} />
                  重命名卷
                </button>
                <button
                  className="text-button danger-text"
                  onClick={async () => {
                    if (!(await persist(deleteScroll(all, selected.id)))) return;
                    notify(`卷「${selected.name}」已移入回收区，可恢复`);
                    onClose();
                  }}
                >
                  <Trash2 size={15} />
                  删除卷
                </button>
              </div>
            </>
          )}
        </header>

        <form className="entry-composer" onSubmit={add}>
          <textarea
            value={body}
            maxLength={TEXT_MAX}
            onChange={(e) => setBody(e.target.value)}
            placeholder="一句心法、一段 prompt 碎片，或一条判断准则……"
            aria-label="新条目正文"
            rows={3}
          />
          <div className="entry-composer-row">
            <input
              value={tagText}
              onChange={(e) => setTagText(e.target.value)}
              placeholder="标签，用空格或逗号分隔"
              aria-label="新条目标签"
            />
            <Button disabled={!body.trim()}>加入此卷</Button>
          </div>
        </form>

        {tags.length > 0 && (
          <div className="tag-filter" role="group" aria-label="按标签筛选">
            <button
              className="tag-chip"
              aria-pressed={!activeFilter}
              onClick={() => setFilter(null)}
            >
              全部
            </button>
            {tags.map((t) => (
              <button
                key={t}
                className="tag-chip"
                aria-pressed={activeFilter === t}
                onClick={() => setFilter(activeFilter === t ? null : t)}
              >
                #{t}
              </button>
            ))}
          </div>
        )}

        {!entries.length ? (
          <Empty title="这一卷还是空的">
            在上面写下第一条，按顺序排列，随时调整。
          </Empty>
        ) : (
          <ol className="scroll-entries">
            {shown.map((e) => {
              const i = entries.indexOf(e);
              const name = shortText(e.text);
              if (editing === e.id)
                return (
                  <li className="scroll-entry editing" key={e.id}>
                    <form
                      className="entry-edit"
                      onSubmit={async (ev) => {
                        ev.preventDefault();
                        const data = new FormData(ev.currentTarget);
                        const text = String(data.get("text")).trim();
                        if (!text) return;
                        if (
                          await persist(
                            editEntry(all, selected.id, e.id, text, parseTags(String(data.get("tags")))),
                          )
                        )
                          setEditing(null);
                      }}
                    >
                      <textarea
                        name="text"
                        defaultValue={e.text}
                        maxLength={TEXT_MAX}
                        rows={3}
                        aria-label="编辑条目正文"
                        autoFocus
                      />
                      <input
                        name="tags"
                        defaultValue={e.tags.join(" ")}
                        aria-label="编辑条目标签"
                      />
                      <div className="entry-edit-actions">
                        <Button>保存条目</Button>
                        <button
                          type="button"
                          className="text-button"
                          onClick={() => setEditing(null)}
                        >
                          取消
                        </button>
                      </div>
                    </form>
                  </li>
                );
              return (
                <li className="scroll-entry" key={e.id}>
                  <span className="entry-index" aria-hidden="true">
                    {String(i + 1).padStart(2, "0")}
                  </span>
                  <div className="entry-main">
                    <p className="entry-text">{e.text}</p>
                    {e.tags.length > 0 && (
                      <div className="entry-tags">
                        {e.tags.map((t) => (
                          <span className="entry-tag" key={t}>
                            #{t}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                  <div className="entry-uses" title="复制成功的次数">
                    <b className="entry-uses-count" aria-hidden="true">
                      {e.uses}
                    </b>
                    <small aria-hidden="true">次</small>
                    <span className="sr-only">已复制 {e.uses} 次</span>
                  </div>
                  <div className="entry-actions">
                    <button
                      className="icon-button entry-copy"
                      aria-label={`复制条目：${name}`}
                      title="复制"
                      onClick={() => copyEntry(e)}
                    >
                      <Copy size={16} />
                    </button>
                    <button
                      className="icon-button"
                      aria-label={`上移条目：${name}`}
                      title="上移"
                      disabled={i === 0}
                      onClick={() => persist(moveEntry(all, selected.id, e.id, -1))}
                    >
                      <ArrowUp size={16} />
                    </button>
                    <button
                      className="icon-button"
                      aria-label={`下移条目：${name}`}
                      title="下移"
                      disabled={i === entries.length - 1}
                      onClick={() => persist(moveEntry(all, selected.id, e.id, 1))}
                    >
                      <ArrowDown size={16} />
                    </button>
                    <button
                      className="icon-button"
                      aria-label={`编辑条目：${name}`}
                      title="编辑"
                      onClick={() => setEditing(e.id)}
                    >
                      <PenLine size={16} />
                    </button>
                    <button
                      className="icon-button"
                      aria-label={`删除条目：${name}`}
                      title="删除（进回收区）"
                      onClick={async () => {
                        if (await persist(deleteEntry(all, selected.id, e.id)))
                          notify("条目已移入回收区，可恢复");
                      }}
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                </li>
              );
            })}
          </ol>
        )}
        <p className="handoff-note">
          条目不做版本；删除的卷与条目进“焚决”标签下方的回收区，可恢复。
        </p>
      </div>
    </Dialog>
  );
}

// 焚决回收区：已删的卷与（未删卷中）已删的条目，放在资产仓库“焚决”类型标签下方。
export function ScrollRecycle({ state, save }) {
  const all = scrollsOf(state);
  const [open, setOpen] = useState(false);
  const deletedScrolls = all.filter((s) => s.deletedAt);
  const deletedEntries = orderScrolls(all).flatMap((s) =>
    s.entries.filter((e) => e.deletedAt).map((e) => [s, e]),
  );
  const count = deletedScrolls.length + deletedEntries.length;
  const persist = (scrolls) => save({ ...state, scrolls });
  return (
    <section className="scroll-recycle" aria-label="焚决回收区">
      <button
        className="text-button recycle-toggle"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        <Archive size={15} />
        回收区 {count}
      </button>
      {open && (
        <div className="recycle-list">
          {!count && <p className="body-copy">回收区是空的。</p>}
          {deletedScrolls.map((s) => (
            <div className="recycle-row" key={s.id}>
              <span>
                <small>卷</small>
                {s.name}
              </span>
              <button
                className="icon-button"
                aria-label={`恢复卷 ${s.name}`}
                title="恢复"
                onClick={() => persist(restoreScroll(all, s.id))}
              >
                <RotateCcw size={16} />
              </button>
            </div>
          ))}
          {deletedEntries.map(([s, e]) => (
            <div className="recycle-row" key={e.id}>
              <span>
                <small>{s.name}</small>
                {shortText(e.text)}
              </span>
              <button
                className="icon-button"
                aria-label={`恢复条目：${shortText(e.text)}`}
                title="恢复"
                onClick={() => persist(restoreEntry(all, s.id, e.id))}
              >
                <RotateCcw size={16} />
              </button>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
