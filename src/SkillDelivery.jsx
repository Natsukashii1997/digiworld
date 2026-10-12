import { Reading, ReadReveal } from './ScanMotion.jsx';
import { copyText } from './data-flight.js';
import React, { useEffect, useState, useRef } from "react";
import { Copy, Download, PenLine, RefreshCw } from "lucide-react";
import { request } from "./api.js";
import { Button, Badge } from "./components.jsx";

export function SkillDelivery({ asset, version, onExport, onEdit, notify, onCopyStart, onCopyEnd, onUsed, usageBlocked = false }) {
  const [busy, setBusy] = useState(false),
    [delivery, setDelivery] = useState(null);
  const [copied, setCopied] = useState(false),
    [error, setError] = useState("");
  const [links, setLinks] = useState([]),
    [listError, setListError] = useState("");
  const [loading, setLoading] = useState(true),
    [time, setTime] = useState(Date.now());
  async function refresh(checkingId = delivery?.id) {
    setLoading(true);
    try {
      const next = await request(
        "/deliveries?assetId=" + encodeURIComponent(asset.id),
      );
      setLinks(next);
      if (checkingId && !next.some((link) => link.id === checkingId))
        setDelivery((previous) =>
          previous?.id === checkingId
            ? { ...previous, invalid: true }
            : previous,
        );
      setListError("");
    } catch (e) {
      setListError(e.message);
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    refresh();
    const timer = setInterval(() => setTime(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [asset.id]);
  const locked = useRef(false);
  async function generate() {
    if (locked.current || usageBlocked || (onCopyStart && !onCopyStart())) return;
    locked.current = true;
    setBusy(true);
    setError("");
    setCopied(false);
    setDelivery(null);
    let generatedId = null;
    try {
      const next = await request("/deliveries", {
        assetId: asset.id,
        versionId: version.id,
      });
      setDelivery(next);
      generatedId = next.id;
      try {
        await copyText(next.instructions);
      } catch {
        setError("复制失败：请选中下方口令手动复制，或允许剪贴板访问后重试。");
        return;
      }
      setCopied(true);
      notify("本机安装口令已复制");
      await onUsed?.("copy-skill", { deliveryId: next.id });
      try {
        await request("/deliveries/copied", { id: next.id });
      } catch {
        setError(
          "剪贴板已复制，但服务未确认记录状态。请刷新链接状态核对是否仍有效。",
        );
      }
    } catch (e) {
      setError(e.message + "；可重试或单独导出 ZIP 并附给 Agent。");
    } finally {
      await refresh(generatedId);
      setBusy(false);
      locked.current = false;
      onCopyEnd?.();
    }
  }
  async function revoke(id) {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      await request("/deliveries/revoke", { id });
      if (delivery?.id === id) {
        setDelivery(null);
        setCopied(false);
      }
      setLinks((previous) => previous.filter((link) => link.id !== id));
      notify("链接已撤销，已下载的副本不受影响");
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  const expired =
    delivery && (delivery.invalid || Date.parse(delivery.expiresAt) <= time);
  const visibleLinks = links.filter(
    (link) => Date.parse(link.expiresAt) > time,
  );
  return (
    <section className="skill-delivery" aria-label="Skill 本机交付">
      <div className="detail-actions">
        <Button onClick={generate} disabled={busy || usageBlocked}>
          <Copy size={16} />
          {busy ? "正在处理…" : "复制本机安装口令"}
        </Button>
        <button
          className="outlined-icon"
          aria-label="编辑资产"
          onClick={onEdit}
        >
          <PenLine size={18} />
        </button>
      </div>
      <div className="delivery-meta">
        <Badge tone="muted">仅限本机</Badge>
        <span>10 分钟有效 · 工作台服务需保持运行</span>
      </div>
      <Button secondary onClick={onExport}>
        <Download size={16} />
        导出完整 Skill 包
      </Button>
      {delivery && (
        <div className="delivery-result">
          <strong role="status">
            {expired
              ? "链接已失效，请重新复制"
              : copied
                ? listError
                  ? "口令已复制 · 链接状态待核对"
                  : "口令已复制 · 未验证安装"
                : "链接已生成 · 尚未复制"}
          </strong>
          <span>
            v{delivery.versionNumber}.0 · {delivery.fileCount} 项 ·{" "}
            {new Date(delivery.expiresAt).toLocaleTimeString("zh-CN", {
              hour12: false,
            })}{" "}
            到期
          </span>
          {!delivery.permissionsKnown && (
            <small>
              源包权限信息不完整；如需精确还原，请重新导入原始 ZIP。
            </small>
          )}
        </div>
      )}
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {delivery && !copied && !expired && (
        <label className="delivery-fallback">
          安装口令文本
          <textarea
            readOnly
            rows={7}
            value={delivery.instructions}
            onFocus={(e) => e.target.select()}
          />
        </label>
      )}
      <details className="delivery-links">
        <ReadReveal pending={loading} ready={!listError}/>
        <summary>
          本机有效链接
          {loading
            ? <Reading mini label="读取本机有效链接"/>
            : listError
              ? " · 状态未知"
              : ` · ${visibleLinks.length}`}
        </summary>
        <Button secondary onClick={() => refresh()} disabled={loading || busy}>
          <RefreshCw size={14} />
          刷新链接状态
        </Button>
        {listError && (
          <p role="alert" className="error">
            {listError}
          </p>
        )}
        {!loading && !listError && !visibleLinks.length && (
          <p className="helper">暂无有效链接</p>
        )}
        {visibleLinks.map((link) => (
          <div className="delivery-link-row" key={link.id}>
            <div>
              <strong>
                v{link.versionNumber}.0 ·{" "}
                {link.copiedAt ? "已复制" : "未确认复制"}
              </strong>
              <span>
                {new Date(link.expiresAt).toLocaleTimeString("zh-CN", {
                  hour12: false,
                })}{" "}
                到期 · 下载请求 {link.downloads} 次
              </span>
            </div>
            <button
              className="text-button danger-text"
              onClick={() => revoke(link.id)}
              disabled={busy}
              aria-label="撤销链接"
            >
              撤销
            </button>
          </div>
        ))}
      </details>
    </section>
  );
}
