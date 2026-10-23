import { flyData } from './data-flight.js';
import { Reading, ReadReveal } from './ScanMotion.jsx';
// 待处理 · 个人说明修改建议（路线 v3 切片 3.3，D30）。Agent 通过本机 MCP 提交的建议在这里逐条处理：
// 采纳 = 预览差异 → 本人勾选确认；拒绝需二次确认。两者都经专用接口写主库，不经通用保存。
// 采纳记录保留原链路；已确认建议通过独立Vault入口预览、备份、写回与回读。
import { VaultWriteEntry } from "./VaultWriteUI.jsx";
import React, { useEffect, useRef, useState } from "react";
import { Eye, X, RefreshCw, ArrowRight, ChevronUp, Check } from "lucide-react";
import { Button, Dialog } from "./components.jsx";
import { TextDifference } from "./AssetHistory.jsx";
import { request } from "./api.js";
import { diffText } from "./version-diff.js";
import "./knowledge-zones.css";
import { inboxTime } from "./inbox-time.js";

const time = (value) =>
  new Date(value).toLocaleString("zh-CN", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" });
const DECIDED = {
  confirmed: "已确认采纳 · 写入结果以 Vault 操作回执为准",
  rejected: "已拒绝",
};

function InboxDifference({ before, after }) {
  const diff = diffText(before, after);
  if (diff.mode === "full") return <div className="ib-full-diff"><p className="ib-status">正文较长，保留改前与改后两版全文。</p><h4>改前全文</h4><pre aria-label="改前全文" tabIndex={0}>{before}</pre><h4>改后全文</h4><pre aria-label="改后全文" tabIndex={0}>{after}</pre></div>;
  return <pre aria-label="逐行差异" tabIndex={0}>{diff.rows.map((row,index)=><span key={index} className={row.type==="added"?"add":row.type==="removed"?"del":"ctx"}>{row.text}</span>)}</pre>;
}

export function ProfileProposals({ state, adoptState, notify, navigate, inbox = false, onBusyChange, children }) {
  const proposals = state.profileProposals || [];
  const pending = proposals.filter((p) => p.status === "pending");
  const decided = proposals
    .filter((p) => p.status !== "pending")
    .sort((a, b) => b.decidedAt.localeCompare(a.decidedAt))
    .slice(0, 10);
  const [preview, setPreview] = useState(null);
  const [rejecting, setRejecting] = useState(null);
  const [previewFailed, setPreviewFailed] = useState(null);
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
    onBusyChange?.(kind !== "refresh");
    setError("");
    try {
      await operation();
    } catch (failure) {
      setError(failure.message);
    } finally {
      lock.current = false;
      setBusy("");
      onBusyChange?.(false);
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
      setPreview(null);
      setPreviewFailed(proposal.id);
      setPreview(await request("/knowledge/profile/proposals/preview", { id: proposal.id }));
      setPreviewFailed(null);
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
      flyData();
      setPreview(null);
      notify("已确认采纳，可在最近处理里预览写回个人说明");
    });
  const reject = () =>
    run("reject", async () => {
      const latest = await request("/workspace");
      const next = await request("/knowledge/profile/proposals/reject", {
        id: rejecting.id,
        expectedRevision: latest.revision,
      });
      adoptState(next);
      flyData();
      setRejecting(null);
      setPreview(null);
      setPreviewFailed(null);
      notify("已拒绝这条建议，Vault 未改动");
    });
  if (inbox) return <><section className="ib-proposals" aria-label="个人说明修改建议">
    <ReadReveal pending={busy==="refresh"||busy.startsWith("preview-")} ready={!error}/>
    <ul>{pending.map(p=><li key={p.id} data-item-id={`profile-${p.id}`} className={`ib-card${preview?.id===p.id || preview?.proposalId===p.id ? " open" : ""}`} aria-label={`建议：${p.path}`}>
      <button className="ib-card-btn" aria-expanded={preview?.proposalId===p.id || preview?.id===p.id} onClick={()=>preview?.proposalId===p.id || preview?.id===p.id ? setPreview(null) : openPreview(p)} disabled={!!busy}>
        <span className="ib-card-main"><b>{p.proposer} 建议修改个人说明</b><small>{p.path} · {p.reason}</small></span><span className="ib-card-side"><time className="en" dateTime={p.createdAt}>{inboxTime(p.createdAt)}</time><span className="ib-go">{busy===`preview-${p.id}`?<Reading mini label="读取建议差异"/>:preview?.proposalId===p.id || preview?.id===p.id?"收起":"查看"} {preview?.proposalId===p.id || preview?.id===p.id ? <ChevronUp size={13}/> : <ArrowRight size={13}/>}</span></span>
      </button>
      {(preview?.proposalId===p.id || preview?.id===p.id) && <div className="ib-diff" role="region" aria-label="预览个人说明修改">
        <div className="ib-diff-head"><span className="en">PROFILE · {p.path}</span><span>{p.proposer} 提出</span></div>
        {preview.baseChanged&&<p role="status" className="inline-error">Agent 提出建议后文件已被修改过，请仔细核对差异。</p>}
        <InboxDifference before={preview.before} after={preview.after}/>
        <p className="ib-status">采纳先保存记录；写入个人说明须从建议记录中另行预览、确认。</p>
        <label className="knowledge-confirm"><input type="checkbox" checked={agreed} onChange={e=>setAgreed(e.target.checked)}/>我已核对差异，确认采纳这条建议</label>
        {error&&<p className="inline-error" role="alert">{error}</p>}
        <div className="ib-diff-act"><Button disabled={!agreed||!!busy} onClick={confirm}><Check size={15}/>{busy==="confirm"?"确认中…":"采纳"}</Button><Button secondary disabled={!!busy} onClick={()=>setRejecting(p)}><X size={15}/>拒绝</Button></div>
      </div>}
      {error && previewFailed===p.id && !rejecting && <div className="ib-diff"><p role="alert" className="inline-error">{error}</p><Button secondary disabled={!!busy} onClick={()=>setRejecting(p)}><X size={15}/>拒绝</Button></div>}
      {rejecting?.id===p.id && <div className="ib-diff" role="region" aria-label="拒绝这条建议"><p>拒绝后不能恢复为待处理；Vault 不会改动。</p>{error&&<p className="inline-error" role="alert">{error}</p>}<div className="ib-diff-act"><Button disabled={!!busy} onClick={reject}>{busy==="reject"?"处理中…":"确认拒绝"}</Button><Button secondary disabled={!!busy} onClick={()=>setRejecting(null)}>取消</Button></div></div>}
    </li>)}</ul>
    {error&&!preview&&!rejecting&&!previewFailed&&<p role="alert" className="inline-error">{error}</p>}
    </section>
    {children}
    <details className="ib-proposal-records"><summary>建议记录与回读</summary><Button secondary disabled={!!busy} onClick={()=>refresh(true)}><RefreshCw size={16}/>{busy==="refresh"?<Reading mini label="读取建议"/>:"读回最新建议"}</Button>{decided.length>0&&<><h4>最近处理</h4><ul className="proposal-decided">{decided.map(p=><li key={p.id}><span>{p.path} · {p.proposer}</span><span>{DECIDED[p.status]}</span>{p.status==="confirmed"&&<VaultWriteEntry proposalId={p.id} navigate={navigate}/>}</li>)}</ul></>}</details>
  </>;
  return (
    <section className="inbox-section" aria-labelledby="profile-proposals-title">
      <div className="section-title">
        <h2 id="profile-proposals-title">个人说明修改建议 · {pending.length}</h2>
        <p>Agent 通过本机 MCP 提交；预览差异后采纳，或拒绝</p>
      </div>
      <div className="proposal-actions">
        <Button secondary disabled={!!busy} onClick={() => refresh(true)}>
          <RefreshCw size={16} />
          <ReadReveal pending={busy==="refresh"} ready={!error}/>{busy === "refresh" ? <Reading mini label="读取建议"/> : "读回最新建议"}
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
                  <ReadReveal pending={busy===`preview-${p.id}`} ready={!!preview&&!error}/>{busy === `preview-${p.id}` ? <Reading mini label="读取建议差异"/> : "预览差异"}
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
                {p.status === "confirmed" && <VaultWriteEntry proposalId={p.id} navigate={navigate}/>}
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
              确认后先保存采纳记录，再从“最近处理”预览写回个人说明；开启受控写入后，审阅差异、确认备份并写后回读。
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
