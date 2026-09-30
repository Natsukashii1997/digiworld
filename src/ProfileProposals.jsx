// 待处理 · 个人说明修改建议（路线 v3 切片 3.3，D30）。Agent 通过本机 MCP 提交的建议在这里逐条处理：
// 采纳 = 预览差异 → 本人勾选确认；拒绝需二次确认。两者都经专用接口写主库，不经通用保存。
// 采纳后写入 Vault 的接口尚未实现：现有受控写入只允许在“00 待整理”新建文件，覆盖个人说明文件需本机实现与验证。
import React, { useEffect, useRef, useState } from "react";
import { Eye, X, RefreshCw } from "lucide-react";
import { Button, Dialog } from "./components.jsx";
import { TextDifference } from "./AssetHistory.jsx";
import { request } from "./api.js";
import "./knowledge-zones.css";

const time = (value) =>
  new Date(value).toLocaleString("zh-CN", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" });
const DECIDED = {
  confirmed: "已确认 · 待写入 Vault（需本机验证）",
  rejected: "已拒绝",
};

export function ProfileProposals({ state, adoptState, notify, index = "B" }) {
  const proposals = state.profileProposals || [];
  const pending = proposals.filter((p) => p.status === "pending");
  const decided = proposals
    .filter((p) => p.status !== "pending")
    .sort((a, b) => b.decidedAt.localeCompare(a.decidedAt))
    .slice(0, 10);
  const [preview, setPreview] = useState(null);
  const [rejecting, setRejecting] = useState(null);
  const [agreed, setAgreed] = useState(false);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const lock = useRef(false);
  // 建议由 Agent 在工作台之外提交，进入本页时先读回最新主库。
  useEffect(() => {
    refresh(false);
  }, []);
  async function run(kind, operation) {
    if (lock.current) return;
    lock.current = true;
    setBusy(kind);
    setError("");
    try {
      await operation();
    } catch (failure) {
      setError(failure.message);
    } finally {
      lock.current = false;
      setBusy("");
    }
  }
  const refresh = (announce = true) =>
    run("refresh", async () => {
      adoptState(await request("/workspace"));
      if (announce) notify("已读回最新的待处理建议");
    });
  const openPreview = (proposal) =>
    run(`preview-${proposal.id}`, async () => {
      setAgreed(false);
      setPreview(await request("/knowledge/profile/proposals/preview", { id: proposal.id }));
    });
  const confirm = () =>
    run("confirm", async () => {
      const latest = await request("/workspace");
      const next = await request("/knowledge/profile/proposals/confirm", {
        previewId: preview.previewId,
        confirmed: true,
        expectedRevision: latest.revision,
      });
      adoptState(next);
      setPreview(null);
      notify("已确认采纳，等待写入 Vault（需本机验证）");
    });
  const reject = () =>
    run("reject", async () => {
      const latest = await request("/workspace");
      const next = await request("/knowledge/profile/proposals/reject", {
        id: rejecting.id,
        expectedRevision: latest.revision,
      });
      adoptState(next);
      setRejecting(null);
      notify("已拒绝这条建议，Vault 未改动");
    });
  return (
    <section className="inbox-section" aria-labelledby="profile-proposals-title">
      <div className="section-title">
        <span className="section-index">{index}</span>
        <h2 id="profile-proposals-title">个人说明修改建议 · {pending.length}</h2>
        <p>Agent 通过本机 MCP 提交；预览差异后采纳，或拒绝</p>
      </div>
      <div className="proposal-actions">
        <Button secondary disabled={!!busy} onClick={() => refresh(true)}>
          <RefreshCw size={16} />
          {busy === "refresh" ? "读取中…" : "读回最新建议"}
        </Button>
      </div>
      {error && !preview && !rejecting && (
        <p className="inline-error" role="alert">
          {error}
        </p>
      )}
      {pending.length ? (
        <div className="proposal-list">
          {pending.map((p) => (
            <article key={p.id} className="proposal-card" aria-label={`建议：${p.path}`}>
              <header>
                <h3>{p.path}</h3>
                <span className="proposal-meta">
                  来自 <strong>{p.proposer}</strong> · {time(p.createdAt)}
                </span>
              </header>
              <p className="proposal-reason">{p.reason}</p>
              <div className="proposal-paragraphs">
                <div>
                  <small>原段落</small>
                  <p>{p.original}</p>
                </div>
                <div>
                  <small>建议段落</small>
                  <p>{p.proposed}</p>
                </div>
              </div>
              <div className="proposal-actions">
                <Button disabled={!!busy} onClick={() => openPreview(p)}>
                  <Eye size={16} />
                  {busy === `preview-${p.id}` ? "读取中…" : "预览差异"}
                </Button>
                <Button secondary disabled={!!busy} onClick={() => setRejecting(p)}>
                  <X size={16} />
                  拒绝
                </Button>
              </div>
            </article>
          ))}
        </div>
      ) : (
        <p className="zones-note">没有待处理的个人说明修改建议。</p>
      )}
      {decided.length > 0 && (
        <>
          <h3 className="proposal-decided-title">最近处理</h3>
          <ul className="proposal-decided">
            {decided.map((p) => (
              <li key={p.id}>
                <span>
                  {p.path} · {p.proposer}
                </span>
                <span>{DECIDED[p.status]}</span>
              </li>
            ))}
          </ul>
        </>
      )}
      {preview && (
        <Dialog title="预览个人说明修改" onClose={() => !lock.current && setPreview(null)}>
          <div className="proposal-dialog">
            <p className="context-receipt">
              {preview.path} · 当前正文 SHA-256 {preview.baseSha256.slice(0, 12)}
            </p>
            {preview.baseChanged && (
              <p className="inline-error" role="status">
                Agent 提出建议后文件已被修改过，请仔细核对差异。
              </p>
            )}
            <TextDifference before={preview.before} after={preview.after} />
            <p className="zones-note">
              确认后只记录采纳结果。把新正文写入 Vault 需本机验证：现有受控写入只允许在“00 待整理”新建文件，覆盖个人说明文件的写入接口尚未实现。
            </p>
            <label className="knowledge-confirm">
              <input type="checkbox" checked={agreed} onChange={(e) => setAgreed(e.target.checked)} />
              我已核对差异，确认采纳这条建议
            </label>
            {error && (
              <p className="inline-error" role="alert">
                {error}
              </p>
            )}
            <div className="proposal-actions">
              <Button disabled={!agreed || !!busy} onClick={confirm}>
                {busy === "confirm" ? "确认中…" : "确认采纳"}
              </Button>
              <Button secondary disabled={!!busy} onClick={() => setPreview(null)}>
                取消
              </Button>
            </div>
          </div>
        </Dialog>
      )}
      {rejecting && (
        <Dialog title="拒绝这条建议" onClose={() => !lock.current && setRejecting(null)}>
          <div className="proposal-dialog">
            <p>
              拒绝来自 {rejecting.proposer} 对 {rejecting.path} 的修改建议。拒绝后不能恢复为待处理；Vault 不会改动。
            </p>
            {error && (
              <p className="inline-error" role="alert">
                {error}
              </p>
            )}
            <div className="proposal-actions">
              <Button disabled={!!busy} onClick={reject}>
                {busy === "reject" ? "处理中…" : "确认拒绝"}
              </Button>
              <Button secondary disabled={!!busy} onClick={() => setRejecting(null)}>
                取消
              </Button>
            </div>
          </div>
        </Dialog>
      )}
    </section>
  );
}
