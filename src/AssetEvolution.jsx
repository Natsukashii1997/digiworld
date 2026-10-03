// 进化回路 v1（产品定义 v1.1 §4.6；v1.2 §4.7 工作台只做薄控制面）：资产详情里的“改版进化”。
// 需改进 → 生成改版任务包（复制给 Agent）→ 粘贴回复 → 改版候选 → 与当前版本比较 → 采用或退回；
// 证据只按本资产显示采用前后的复制次数与“需改进”比例。不调用任何 Agent 或模型。
import React, { useRef, useState } from "react";
import { Copy, FileText } from "lucide-react";
import { Button, Badge } from "./components.jsx";
import { current } from "./store.js";
import { TextDifference } from "./AssetHistory.jsx";
import {
  buildRevisionPacket,
  parseRevisionReply,
  addCandidate,
  adoptCandidate,
  returnCandidate,
  revisionEvidence,
  candidatesOf,
  revisable,
  CANDIDATE_LIMITS,
} from "./evolution.js";

const percent = (s) =>
  s.improveRatio === null
    ? "无反馈"
    : `${Math.round(s.improveRatio * 100)}%（${s.improve}/${s.feedback}）`;
const when = (at) => new Date(at).toLocaleString("zh-CN");

export function AssetEvolution({ asset, state, save, notify, copyText }) {
  const v = current(asset);
  const number = (versionId) =>
    asset.versions.findIndex((x) => x.id === versionId) + 1;
  const activity = state.assetActivity || [];
  const candidates = candidatesOf(state, asset.id);
  const pending = candidates.filter((c) => c.status === "pending");
  const decided = candidates.filter((c) => c.status !== "pending").reverse();
  const evidence = revisionEvidence(asset, activity, state.revisionCandidates || []);
  const needsImprove = activity.some(
    (r) =>
      r.assetId === asset.id &&
      r.versionId === v.id &&
      r.kind === "feedback" &&
      r.rating === "improve",
  );
  const [packet, setPacket] = useState("");
  const [replyText, setReplyText] = useState("");
  const [error, setError] = useState("");
  const [returning, setReturning] = useState(null);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);
  if (!revisable(asset) || (!needsImprove && !candidates.length && !evidence.length))
    return null;

  async function commit(next, message) {
    if (lock.current) return false;
    lock.current = true;
    setBusy(true);
    try {
      const saved = await save(next);
      if (saved && message) notify(message);
      return saved;
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  async function saveCandidate() {
    setError("");
    let next;
    try {
      next = addCandidate(state, asset.id, parseRevisionReply(replyText));
    } catch (e) {
      setError(e.message);
      return;
    }
    if (await commit(next, "已存为改版候选，请与当前版本比较后决定"))
      setReplyText("");
    else setError("候选没有保存，粘贴的回复仍保留，可以核对后重试。");
  }
  async function adopt(candidate) {
    setError("");
    let next;
    try {
      next = adoptCandidate(state, candidate.id);
    } catch (e) {
      setError(e.message);
      return;
    }
    if (await commit(next, `已采用为 v${asset.versions.length + 1}.0；原历史保留，未同步到 Agent`))
      setPacket("");
    else setError("采用没有完成，历史与候选都未改变，请核对后重试。");
  }
  async function confirmReturn(candidate) {
    setError("");
    let next;
    try {
      next = returnCandidate(state, candidate.id, reason);
    } catch (e) {
      setError(e.message);
      return;
    }
    if (await commit(next, "候选已退回")) {
      setReturning(null);
      setReason("");
    } else setError("退回没有保存，请核对后重试。");
  }

  return (
    <section className="asset-evolution" aria-label="改版进化">
      <header>
        <h3>改版进化</h3>
        <Badge tone="muted">不自动调用 Agent</Badge>
      </header>
      {needsImprove && !pending.length && (
        <>
          <p className="helper">
            当前版本有“需改进”反馈。生成任务包交给你选的 Agent，拿到回复后粘贴回来，工作台只解析、不调用模型。
          </p>
          {!packet ? (
            <div className="heading-actions">
              <Button onClick={() => setPacket(buildRevisionPacket(asset, activity))}>
                <FileText size={16} />
                生成改版任务包
              </Button>
            </div>
          ) : (
            <>
              <section className="evolution-packet" aria-label="改版任务包">
                <pre tabIndex={0}>{packet}</pre>
              </section>
              <div className="heading-actions">
                <Button secondary onClick={() => copyText(packet)}>
                  <Copy size={16} />
                  复制任务包
                </Button>
              </div>
            </>
          )}
        </>
      )}
      {!pending.length && (needsImprove || packet) && (
        <div className="evolution-reply">
          <label>
            粘贴 Agent 回复
            <textarea
              rows={6}
              value={replyText}
              disabled={busy}
              onChange={(e) => setReplyText(e.target.value)}
            />
          </label>
          <p className="helper">
            只解析两对标记之间的新版本正文与改动说明；所有内容都按纯文本保存。
          </p>
          <div className="heading-actions">
            <Button disabled={busy || !replyText.trim()} onClick={saveCandidate}>
              解析并存为候选
            </Button>
          </div>
        </div>
      )}
      {error && (
        <p role="alert" className="inline-error">
          {error}
        </p>
      )}
      {pending.map((c) => {
        const stale = c.baseVersionId !== v.id;
        return (
          <section className="evolution-candidate" aria-label="改版候选比较" key={c.id}>
            <h4>
              当前 v{asset.versions.length}.0 → 候选
            </h4>
            <p className="context-receipt">
              候选 {c.id.slice(0, 8)} · 基于 v{number(c.baseVersionId)}.0 · 粘贴于 {when(c.createdAt)}
            </p>
            <div className="evolution-note">
              <strong>改动说明</strong>
              <pre>{c.changeNote}</pre>
            </div>
            <TextDifference before={v.content} after={c.content} />
            <details className="evolution-side">
              <summary>并排查看全文</summary>
              <div className="evolution-columns">
                <div>
                  <strong>当前 v{asset.versions.length}.0</strong>
                  <pre>{v.content || "（空）"}</pre>
                </div>
                <div>
                  <strong>候选</strong>
                  <pre>{c.content}</pre>
                </div>
              </div>
            </details>
            {stale && (
              <p className="context-receipt">
                当前版本在候选生成后已变化，不能直接采用；可以退回后重新生成任务包。
              </p>
            )}
            {returning === c.id ? (
              <div className="evolution-return">
                <label>
                  退回原因（可选）
                  <textarea
                    rows={2}
                    maxLength={CANDIDATE_LIMITS.returnReason}
                    value={reason}
                    disabled={busy}
                    onChange={(e) => setReason(e.target.value)}
                  />
                </label>
                <div className="heading-actions">
                  <Button disabled={busy} onClick={() => confirmReturn(c)}>
                    确认退回
                  </Button>
                  <Button
                    secondary
                    disabled={busy}
                    onClick={() => {
                      setReturning(null);
                      setReason("");
                    }}
                  >
                    取消退回
                  </Button>
                </div>
              </div>
            ) : (
              <div className="heading-actions">
                {!stale && (
                  <Button disabled={busy} onClick={() => adopt(c)}>
                    采用为新版本
                  </Button>
                )}
                <Button
                  secondary
                  disabled={busy}
                  onClick={() => {
                    setError("");
                    setReturning(c.id);
                  }}
                >
                  退回
                </Button>
              </div>
            )}
          </section>
        );
      })}
      {evidence.length > 0 && (
        <section className="evolution-evidence" aria-label="改版证据">
          <h4>改版证据</h4>
          <p className="helper">
            只按本资产已有的复制记录与反馈计算：被替换的版本 → 采用生成的版本。
          </p>
          <ul>
            {evidence.map((row) => (
              <li key={row.candidateId}>
                <strong>
                  v{row.before.number}.0 → v{row.after.number}.0
                </strong>
                <span>采用于 {when(row.adoptedAt)}</span>
                <span>
                  复制 {row.before.uses} 次 → {row.after.uses} 次
                </span>
                <span>
                  需改进 {percent(row.before)} → {percent(row.after)}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}
      {decided.length > 0 && (
        <section className="evolution-decided" aria-label="已处理的候选">
          <h4>已处理的候选 · {decided.length}</h4>
          <ul>
            {decided.map((c) => (
              <li key={c.id}>
                <Badge tone="muted">
                  {c.status === "adopted" ? "已采用" : "已退回"}
                </Badge>
                <span>
                  候选 {c.id.slice(0, 8)} · {when(c.decidedAt)}
                  {c.status === "adopted"
                    ? ` · 生成 v${number(c.adoptedVersionId)}.0`
                    : c.returnReason
                      ? ` · 原因：${c.returnReason}`
                      : " · 未写原因"}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </section>
  );
}
