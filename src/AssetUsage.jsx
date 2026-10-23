import { flyDataOnce } from './data-flight.js';
import React, { useEffect, useRef, useState } from "react";
import { transferFeedback } from "./transfer.js";
import { request } from "./api.js";
import { usageOf, usageTime } from "./asset-usage.js";
import { Button, Badge } from "./components.jsx";
import { Odometer } from "./Odometer.jsx";

// Cards and details share a gate and recovery ID for each asset. Feedback text
// remains in its originating component; only its ID is shared or persisted.
const activitySessions = new Map();
const activityChanged = "workbench-asset-activity-changed";
function activitySession(key) {
  if (!activitySessions.has(key)) {
    let pending = null;
    try { pending = JSON.parse(sessionStorage.getItem(key)) || null; } catch {}
    activitySessions.set(key, { pending, owner: null });
  }
  return activitySessions.get(key);
}

export function useAssetActivity(asset, state, adoptState) {
  const key = `workbench-activity-${asset.id}`;
  const session = activitySession(key);
  const owner = useRef(Symbol(key));
  const [pending, setPending] = useState(() => session.pending);
  const pendingRef = useRef(pending);
  const [busy, setBusy] = useState(() => !!session.owner),
    [message, setMessage] = useState("");
  const [absentRevision, setAbsentRevision] = useState(null);
  const latest = useRef(state);
  latest.current = state;
  function announce() {
    window.dispatchEvent(new CustomEvent(activityChanged, { detail: { key, source: owner.current } }));
  }
  function acquire() {
    if (session.owner) return false;
    session.owner = owner.current;
    setBusy(true);
    announce();
    return true;
  }
  function release() {
    if (session.owner !== owner.current) return;
    session.owner = null;
    setBusy(false);
    announce();
  }
  useEffect(() => {
    const sync = (event) => {
      if (event && (event.detail.key !== key || event.detail.source === owner.current)) return;
      setBusy(!!session.owner);
      if (pendingRef.current?.id !== session.pending?.id) {
        pendingRef.current = session.pending;
        setPending(session.pending);
        setAbsentRevision(null);
        setMessage("");
      }
    };
    window.addEventListener(activityChanged, sync);
    sync();
    return () => window.removeEventListener(activityChanged, sync);
  }, [key]);
  function remember(value) {
    pendingRef.current = value;
    setPending(value);
    session.pending = value?.kind === "feedback" ? { id: value.id, assetId: value.assetId } : value;
    try {
      // Unconfirmed feedback text stays in component memory only.
      if (value)
        sessionStorage.setItem(
          key,
          JSON.stringify(session.pending),
        );
      else sessionStorage.removeItem(key);
    } catch {
      /* The visible pending state still prevents a blind retry. */
    }
    announce();
  }
  const [confirmedFeedback, setConfirmedFeedback] = useState(null);
  function accept(result, { feedback = true } = {}) {
    if (result.record.kind === "feedback")
      setConfirmedFeedback(result.record.id);
    adoptState(result.state);
    if (feedback) flyDataOnce(`asset-activity:${result.record.id}`);
    remember(null);
    setAbsentRevision(null);
    setMessage(
      result.record.kind === "feedback" ? "反馈已保存" : "使用记录已保存",
    );
  }
  async function query(value = pendingRef.current, { feedback = true } = {}) {
    if (!value) return "unknown";
    setAbsentRevision(null);
    try {
      const read = () =>
        request(`/asset-activity?id=${encodeURIComponent(value.id)}`);
      const found = (result) => {
        if (result.record === null) return false;
        if (!result.record || typeof result.record !== "object")
          throw new Error("Incomplete activity result");
        if (Object.entries(value).some(([k, v]) => result.record[k] !== v))
          throw new Error("Activity ID mismatch");
        accept(result, { feedback });
        return true;
      };
      const unavailableAsset = (result) => {
        if (
          !Number.isSafeInteger(result.state?.revision) ||
          !Array.isArray(result.state?.assets)
        )
          throw new Error("Incomplete activity query");
        const target = result.state.assets.find((a) => a.id === value.assetId);
        if (!target || target.archived) return "资产不存在或已归档";
        if (!Array.isArray(target.versions))
          throw new Error("Incomplete asset query");
        if (
          value.versionId &&
          !target.versions.some((v) => v.id === value.versionId)
        )
          return "原版本已不可用";
        return "";
      };
      let result = await read();
      // A committed record remains authoritative after archiving or link expiry.
      if (found(result)) return "found";
      let reason = unavailableAsset(result);
      if (!reason && (value.action === "copy-skill" || (value.action === "copy-design" && value.deliveryId))) {
        const links = await request(
          `/deliveries?assetId=${encodeURIComponent(value.assetId)}`,
        );
        if (
          !Array.isArray(links) ||
          links.some(
            (link) =>
              !link ||
              ![link.id, link.assetId, link.versionId].every(
                (id) => typeof id === "string" && id.length > 0,
              ),
          )
        )
          throw new Error("Incomplete delivery query");
        const active = links.some(
          (link) =>
            link.id === value.deliveryId &&
            link.assetId === value.assetId &&
            link.versionId === value.versionId,
        );
        // Recheck the ID after the second request: another client may have committed.
        result = await read();
        if (found(result)) return "found";
        reason = unavailableAsset(result) || (active ? "" : "原安装链接已失效");
      }
      adoptState(result.state);
      if (reason) {
        remember(null);
        setMessage(
          `${value.kind === "use" ? "复制已成功，但" : ""}${reason}，本次记录未保存，已停止补记。`,
        );
        return "unavailable";
      }
      setAbsentRevision(result.state.revision);
      setMessage(
        value.kind === "use"
          ? "复制已成功，记录尚未保存；可补记，无需再次复制。"
          : "尚未找到反馈记录；可保留评价后重新保存。",
      );
      return "absent";
    } catch {
      setMessage("记录结果未知，请先查询记录；此时不能补记或重新提交。");
      return "unknown";
    }
  }
  async function runQuery() {
    if (!acquire()) return;
    try {
      await query();
    } finally {
      release();
    }
  }
  useEffect(() => {
    if (pending) runQuery();
  }, []);
  async function submit(payload, revision, feedback = true) {
    try {
      const result = await request("/asset-activity", {
        ...payload,
        expectedRevision: revision,
      });
      accept(result, { feedback });
      return true;
    } catch (error) {
      const outcome = await query(payload, { feedback });
      if (outcome === "absent" && error.status === 400) {
        // Definitive validation rejection: keep the editable feedback draft.
        remember(null);
        setAbsentRevision(null);
        setMessage(error.message);
      }
      return outcome === "found";
    }
  }
  const copyOrigin = useRef(null);
  function beginCopy() {
    if (session.pending || !acquire()) return false;
    // 在点击的同步阶段记下触发按钮：复制期间焦点变化不会让“数据飞入”的起点漂移
    copyOrigin.current = document.activeElement;
    return true;
  }
  function endCopy() {
    copyOrigin.current = null;
    release();
  }
  async function record(values, fromCopy = false) {
    const heldByCopy = fromCopy && session.owner === owner.current;
    if (session.pending || (!heldByCopy && !acquire())) return false;
    const origin =
      fromCopy && values.kind === "use" ? copyOrigin.current || document.activeElement : null;
    const payload = {
      id: crypto.randomUUID(),
      assetId: asset.id,
      versionId: asset.versions.at(-1).id,
      ...(values.kind === "use" ? { usedAt: new Date().toISOString() } : {}),
      ...values,
    };
    remember(payload);
    setMessage("");
    // 复制已成功、记录与恢复信息已生成后，再异步播放“数据传送”（装饰，不影响记录结果）
    if (origin)
      setTimeout(() => {
        transferFeedback(origin);
        
      }, 0);
    try {
      // copyText already reports the successful copy; its automatic usage record shares that feedback.
      return await submit(payload, latest.current.revision, !fromCopy);
    } finally {
      if (!heldByCopy) release();
    }
  }
  async function retry() {
    if (!pendingRef.current?.kind || absentRevision === null || !acquire()) return;
    try {
      await submit(pendingRef.current, absentRevision);
    } finally {
      release();
    }
  }
  function dismissAbsent() {
    if (absentRevision === null || session.owner) return;
    remember(null);
    setMessage("未保存此条记录");
    setAbsentRevision(null);
  }
  return {
    record,
    confirmedFeedback,
    beginCopy,
    endCopy,
    pending,
    busy,
    message,
    absentRevision,
    query: runQuery,
    retry,
    dismissAbsent,
  };
}

export function AssetUsage({ asset, state, activity }) {
  const summary = usageOf(asset, state.assetActivity);
  // 上一次渲染看到的次数（同一资产）：第一次使用时“从未使用”换成计数，
  // 数字从 0 滚到 1，而不是直接出现（R87-S1）。
  const seen = useRef({ id: asset.id, count: summary.count });
  const rollFrom = seen.current.id === asset.id ? seen.current.count : summary.count;
  useEffect(() => {
    seen.current = { id: asset.id, count: summary.count };
  }, [asset.id, summary.count]);
  const [rating, setRating] = useState(null),
    [note, setNote] = useState("");
  useEffect(() => {
    if (activity.confirmedFeedback) {
      setRating(null);
      setNote("");
    }
  }, [activity.confirmedFeedback]);
  async function saveFeedback() {
    const use = summary.currentUses.reduce(
      (a, b) => (!a || usageTime(b) >= usageTime(a) ? b : a),
      null,
    );
    const ok = await activity.record({
      kind: "feedback",
      rating,
      note: note.trim(),
      ...(use ? { useId: use.id } : {}),
    });
    if (ok) {
      setRating(null);
      setNote("");
    }
  }
  return (
    <section className="asset-usage" aria-label="使用记录与反馈">
      <header>
        <h3>使用记录与反馈</h3>
        <Badge tone="muted">仅本机保存</Badge>
      </header>
      <p data-testid="usage-count">
        {summary.count ? (
          <>
            已使用 <Odometer value={summary.count} from={rollFrom} /> 次 · 最近{" "}
            {new Date(summary.lastAt).toLocaleString("zh-CN")}
          </>
        ) : (
          "从未使用"
        )}
      </p>
      <p className="helper">
        {summary.evidence}。计次以成功复制为准；导出保存与 Agent
        实际采用尚不可确认。
      </p>
      {summary.feedback && (
        <p>
          最近反馈：{summary.feedback.rating === "good" ? "好用" : "需改进"}
          {summary.feedback.note && ` · ${summary.feedback.note}`}
        </p>
      )}
      {!rating ? (
        <div className="heading-actions">
          <Button
            secondary
            disabled={activity.busy || !!activity.pending}
            onClick={() => setRating("good")}
          >
            好用
          </Button>
          <Button
            secondary
            disabled={activity.busy || !!activity.pending}
            onClick={() => setRating("improve")}
          >
            需改进
          </Button>
        </div>
      ) : (
        <div className="usage-feedback-form">
          <p>本次评价：{rating === "good" ? "好用" : "需改进"}</p>
          <label>
            反馈备注（可选）
            <textarea
              rows={3}
              maxLength={500}
              value={note}
              disabled={activity.busy || !!activity.pending}
              onChange={(e) => setNote(e.target.value)}
            />
          </label>
          <p className="helper">
            只填写效果评价，请勿粘贴正文、密钥、链接或完整路径。
          </p>
          <div className="heading-actions">
            <Button
              disabled={activity.busy || !!activity.pending}
              onClick={saveFeedback}
            >
              保存反馈
            </Button>
            <Button
              secondary
              disabled={activity.busy || !!activity.pending}
              onClick={() => {
                setRating(null);
                setNote("");
              }}
            >
              取消反馈
            </Button>
          </div>
        </div>
      )}
      {activity.message && <p role="status">{activity.message}</p>}
      {activity.pending && (
        <div className="heading-actions">
          <Button secondary disabled={activity.busy} onClick={activity.query}>
            查询记录
          </Button>
          {activity.absentRevision !== null && (
            <>
              {activity.pending.kind && (
                <Button disabled={activity.busy} onClick={activity.retry}>
                  补记记录
                </Button>
              )}
              <Button
                secondary
                disabled={activity.busy}
                onClick={activity.dismissAbsent}
              >
                暂不保存此记录
              </Button>
            </>
          )}
        </div>
      )}
    </section>
  );
}
