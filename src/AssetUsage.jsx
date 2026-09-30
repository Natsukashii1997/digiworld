import React, { useEffect, useRef, useState } from "react";
import { flyData } from "./data-flight.js";
import { transferFeedback } from "./transfer.js";
import { request } from "./api.js";
import { usageOf, usageTime } from "./asset-usage.js";
import { Button, Badge } from "./components.jsx";
import { Odometer } from "./Odometer.jsx";

export function useAssetActivity(asset, state, adoptState) {
  const key = `workbench-activity-${asset.id}`;
  const [pending, setPending] = useState(() => {
    try {
      return JSON.parse(sessionStorage.getItem(key)) || null;
    } catch {
      return null;
    }
  });
  const [busy, setBusy] = useState(false),
    [message, setMessage] = useState("");
  const [absentRevision, setAbsentRevision] = useState(null);
  const locked = useRef(false);
  const latest = useRef(state);
  latest.current = state;
  function remember(value) {
    setPending(value);
    try {
      // Unconfirmed feedback text stays in component memory only.
      if (value)
        sessionStorage.setItem(
          key,
          JSON.stringify(
            value.kind === "feedback"
              ? { id: value.id, assetId: value.assetId }
              : value,
          ),
        );
      else sessionStorage.removeItem(key);
    } catch {
      /* The visible pending state still prevents a blind retry. */
    }
  }
  const [confirmedFeedback, setConfirmedFeedback] = useState(null);
  function accept(result) {
    if (result.record.kind === "feedback")
      setConfirmedFeedback(result.record.id);
    adoptState(result.state);
    remember(null);
    setAbsentRevision(null);
    setMessage(
      result.record.kind === "feedback" ? "反馈已保存" : "使用记录已保存",
    );
  }
  async function query(value = pending) {
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
        accept(result);
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
      if (!reason && value.action === "copy-skill") {
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
    if (locked.current) return;
    locked.current = true;
    setBusy(true);
    try {
      await query();
    } finally {
      locked.current = false;
      setBusy(false);
    }
  }
  useEffect(() => {
    if (pending) runQuery();
  }, []);
  async function submit(payload, revision) {
    try {
      const result = await request("/asset-activity", {
        ...payload,
        expectedRevision: revision,
      });
      accept(result);
      return true;
    } catch (error) {
      const outcome = await query(payload);
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
    if (locked.current || pending) return false;
    // 在点击的同步阶段记下触发按钮：复制期间焦点变化不会让“数据飞入”的起点漂移
    copyOrigin.current = document.activeElement;
    locked.current = true;
    setBusy(true);
    return true;
  }
  function endCopy() {
    copyOrigin.current = null;
    locked.current = false;
    setBusy(false);
  }
  async function record(values, fromCopy = false) {
    if ((locked.current && !fromCopy) || pending) return false;
    const origin =
      fromCopy && values.kind === "use" ? copyOrigin.current || document.activeElement : null;
    locked.current = true;
    setBusy(true);
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
        flyData(origin);
      }, 0);
    try {
      return await submit(payload, latest.current.revision);
    } finally {
      locked.current = false;
      setBusy(false);
    }
  }
  async function retry() {
    if (locked.current || !pending?.kind || absentRevision === null) return;
    locked.current = true;
    setBusy(true);
    try {
      await submit(pending, absentRevision);
    } finally {
      locked.current = false;
      setBusy(false);
    }
  }
  function dismissAbsent() {
    if (absentRevision === null || busy) return;
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
