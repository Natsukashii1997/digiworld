import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Button } from './components.jsx';
import { request } from './api.js';
import { useAgentPending } from './useAgentPending.js';

const call = (action, input) => request('/capabilities/agent/pool-publish-' + action, input, 'POST', false);
const permissionCall = (action, input) => request('/capabilities/agent/pool-permission-' + action, input, 'POST', false);
const completed = value => value?.closed === true || ['matches_after', 'changed'].includes(value?.status);

// Candidate entry point. A server-side one-time admission receipt is required;
// checking either UI box cannot issue or replace that receipt.
export function SkillPoolPublish({ asset, version, state, onBusy }) {
  const targets = (state.connections?.agentTargets || []).filter(t => t.agentId === 'codex' && t.program.kind === 'CLI');
  const [open, setOpen] = useState(false), [targetId, setTargetId] = useState('');
  const [permission, setPermission] = useState(null), [permissionPlan, setPermissionPlan] = useState(null);
  const [plan, setPlan] = useState(null), [rollbackPlan, setRollbackPlan] = useState(null);
  const [result, setResult] = useState(null), [history, setHistory] = useState(null);
  const [error, setError] = useState(''), [message, setMessage] = useState(''), [busy, setBusy] = useState(false);
  const [reviewed, setReviewed] = useState(false), [scopeAccepted, setScopeAccepted] = useState(false);
  const busyRef = useRef(false);
  // One outstanding pool operation per browser profile, across asset/target views.
  // The UUID survives unmount and reload, and check seals a missing UUID server-side.
  const pending = useAgentPending({ scope: 'pool-publish', targetTuple: 'skill-pool-publish-v1' });
  const permissionPending = useAgentPending({ scope: 'pool-permission', targetTuple: 'skill-pool-permission-v1' });
  const unresolved = !!pending.id || !!permissionPending.id;
  const locked = busy || unresolved || !pending.ready || !permissionPending.ready;

  const run = useCallback(async task => {
    if (busyRef.current) return null;
    busyRef.current = true; setBusy(true); onBusy?.(true); setError('');
    try { return await task(); }
    catch (cause) { setError(cause?.message || '共享池操作失败'); return null; }
    finally { busyRef.current = false; setBusy(false); onBusy?.(false); }
  }, [onBusy]);
  async function loadPermission() {
    const value = await run(() => permissionCall('status', {}));
    if (value) setPermission(value);
  }
  useEffect(() => { if (open) loadPermission(); }, [open]);
  function clearReview() { setPlan(null); setReviewed(false); setScopeAccepted(false); }
  async function previewPermission() {
    if (locked || !permission) return;
    const value = await run(() => permissionCall('preview', { enabled: !permission.enabled }));
    if (value) { setPermissionPlan(value); clearReview(); setMessage(''); }
  }
  async function settlePermission(value, id) {
    if (!value) { setMessage('共享池授权结果未知；已保留原编号，只查询原操作。'); return; }
    if (value.status === 'verified' || value.closed === true || value.status === 'not_applied') {
      if (!permissionPending.setId('', id)) { setMessage('授权结果已核对，但本机待查编号未清除；保持停止新操作。'); return; }
      setMessage(value.status === 'not_applied' ? '原编号未产生共享池授权，已封闭；可重新预览本次授权。' : '共享池独立授权已核对；请重新预览操作。');
      await loadPermission();
    } else setMessage('共享池授权仍未知；保留原编号。');
  }
  async function applyPermission() {
    if (busyRef.current || !permissionPlan || locked) return;
    const original = permissionPlan;
    if (!permissionPending.setId(original.operationId)) { setMessage('浏览器未能保存授权编号，尚未开始。'); return; }
    setPermissionPlan(null);
    const value = await run(() => permissionCall('apply', { token: original.token, operationId: original.operationId, confirmed: true }));
    await settlePermission(value, original.operationId);
  }
  async function checkPermission() {
    const id = permissionPending.id;
    if (!id || busyRef.current) return;
    const value = await run(() => permissionCall('check', { operationId: id }));
    await settlePermission(value, id);
  }
  async function preview() {
    if (!targetId || locked) return;
    const value = await run(() => call('preview', { targetId, assetId: asset.id, versionId: version.id, revision: state.revision }));
    if (value) { setPlan(value); setResult(null); setReviewed(false); setScopeAccepted(false); }
  }
  async function settle(value, id) {
    if (!value) { setMessage('共享池结果未知；已保留原编号，只查询原操作。'); return; }
    setResult(value);
    if (completed(value)) {
      if (!pending.setId('', id)) setMessage('服务端已核对原编号，但浏览器未清除待查标记；保持停止新操作。');
      else setMessage('');
      clearReview(); setRollbackPlan(null);
    } else setMessage('原操作仍未知；保留编号，不重复提交。');
  }
  async function apply() {
    if (busyRef.current || !plan || locked || !permission?.enabled || plan.admission !== 'approved' || !reviewed || !scopeAccepted) return;
    const original = plan;
    if (!pending.setId(original.operationId)) { setMessage('浏览器未能保存操作编号，尚未开始发布。'); return; }
    clearReview();
    const value = await run(() => call('apply', { token: original.token, revision: original.revision,
      packageHash: original.packageHash, admissionReceiptId: original.admissionReceiptId,
      scopeConfirmed: true, reviewConfirmed: true }));
    await settle(value, original.operationId);
  }
  async function check() {
    const id = pending.id;
    if (!id || busyRef.current) return;
    const value = await run(() => call('check', { operationId: id }));
    await settle(value, id);
  }
  async function loadHistory() {
    if (!targetId || busyRef.current) return;
    const value = await run(() => call('history', { targetId }));
    if (value) setHistory(value.items);
  }
  async function chooseRecord(operationId) {
    if (busyRef.current || unresolved) return;
    const value = await run(() => call('check', { operationId }));
    if (value) { setResult(value); setRollbackPlan(null); setMessage(''); }
  }
  async function previewRollback() {
    if (!result || result.kind !== 'publish' || locked) return;
    const value = await run(() => call('rollback-preview', { operationId: result.operationId, revision: state.revision }));
    if (value) setRollbackPlan(value);
  }
  async function applyRollback() {
    if (busyRef.current || !rollbackPlan || locked || !permission?.enabled) return;
    const original = rollbackPlan;
    if (!pending.setId(original.operationId)) { setMessage('浏览器未能保存撤回编号，尚未开始。'); return; }
    setRollbackPlan(null);
    const value = await run(() => call('rollback', { token: original.token, revision: original.revision, scopeConfirmed: true }));
    await settle(value, original.operationId);
  }
  return <section className="agent-publish-entry" aria-label="Skill 共享池发布">
    <Button secondary type="button" disabled={busy} aria-expanded={open} onClick={() => setOpen(!open)}>{open ? '收起共享池发布' : '预览发布到共享池'}</Button>
    {open && <div className="capability-console agent-write-console">
      <h3>发布固定版本到 Codex 原生共享池</h3>
      <p>仅新增到本机共享池空名称，不覆盖、不挂载 Claude/Hermes。服务端阻断已发现的失效链接激活。文件回读不代表 Agent 已采用。</p>
      <p>固定版本：<code>{version.id.slice(0,8)}</code>。独立共享池授权：{permission === null ? '未读取' : permission.enabled ? '已开启' : '关闭'}；真实发布还需本次固定版本安全准入回执。</p><details><summary>核验固定版本</summary><code>{version.id}</code></details>
      <div className="heading-actions"><Button secondary type="button" disabled={busy} onClick={loadPermission}>刷新共享池授权</Button><Button secondary type="button" disabled={locked || !permission} onClick={previewPermission}>{permission?.enabled ? '预览关闭共享池授权' : '预览开启共享池授权'}</Button></div>
      {permissionPlan && <div className="capability-operation"><p>{permissionPlan.scope}</p><p>授权从 {permissionPlan.beforeEnabled ? '开启' : '关闭'} 调整为 {permissionPlan.enabled ? '开启' : '关闭'}；本次不发布任何 Skill。</p><Button secondary type="button" disabled={busy} onClick={() => setPermissionPlan(null)}>取消</Button><Button type="button" disabled={locked} onClick={applyPermission}>确认共享池独立授权</Button></div>}
      {permissionPending.error && <p role="alert">{permissionPending.error}</p>}
      {permissionPending.id && <p role="alert">授权原编号：<code>{permissionPending.id}</code>。<Button secondary type="button" disabled={busy} onClick={checkPermission}>查询原授权结果</Button></p>}
      <label>Codex 管理目标 <select value={targetId} disabled={locked} onChange={event => { setTargetId(event.target.value); setHistory(null); setResult(null); setRollbackPlan(null); clearReview(); }}><option value="">请选择</option>{targets.map(target => <option key={target.id} value={target.id}>{target.label}</option>)}</select></label>
      {!targets.length && <p role="status">先在智能体群登记本机标准 Codex CLI 目标。</p>}
      {!plan && <Button type="button" disabled={!targetId || locked} onClick={preview}>预览精确版本与共享范围</Button>}
      {plan && <div className="capability-operation">
        <p>目标：<code>{plan.to}</code></p><p>完整包 SHA256：<code>{plan.packageHash}</code></p>
        <p>范围：{plan.scope}</p><p>已发现受影响链接：{plan.knownLinks.length}；Agent 采用：未验证。</p>
        <p>安全准入：{plan.admission === 'approved' ? `精确版本审查回执 ${plan.admissionReceiptId}` : '尚未通过或尚未接入；发布保持关闭'}。</p>
        <details><summary>查看 {plan.files.length} 项文件、模式与摘要</summary><ul>{plan.files.map(file => <li key={file.path}><code>{file.path}</code> · {file.directory ? '目录' : '文件'} · {file.mode.toString(8)}{file.sha256 && <> · <code>{file.sha256}</code></>}</li>)}</ul></details>
        <label><input type="checkbox" checked={reviewed} onChange={event => setReviewed(event.target.checked)} />我已在资产详情阅读此固定版本完整内容，并核对包摘要</label>
        <label><input type="checkbox" checked={scopeAccepted} onChange={event => setScopeAccepted(event.target.checked)} />我理解其他读取共享池的程序也可能发现此 Skill</label>
        <div className="form-actions"><Button secondary type="button" disabled={busy} onClick={clearReview}>取消预览</Button><Button type="button" disabled={locked || !permission?.enabled || plan.admission !== 'approved' || !reviewed || !scopeAccepted} onClick={apply}>确认发布到共享池</Button></div>
      </div>}
      {pending.error && <p role="alert">{pending.error}</p>}
      {pending.id && <p role="alert">原操作编号：<code>{pending.id}</code>。<Button secondary type="button" disabled={busy} onClick={check}>查询原发布或撤回结果</Button></p>}
      {result && <div role="status"><p>{result.closed ? "原编号已封闭，未开始发布或撤回。" : result.message || "结果仍需核对，请查询原操作。"}</p><details><summary>查看操作核验信息</summary><p>原编号：<code>{result.operationId}</code></p><p>记录状态：<code>{result.status}</code></p></details>{!pending.id && result.kind === 'publish' && result.status === 'matches_after' && !rollbackPlan && <Button secondary type="button" disabled={locked} onClick={previewRollback}>预览非破坏撤回</Button>}</div>}
      {rollbackPlan && <div className="capability-operation"><p>将本工作台发布的目录从 <code>{rollbackPlan.from}</code> 移入私有保留区 <code>{rollbackPlan.to}</code>，文件仍保留。</p><Button secondary type="button" disabled={busy} onClick={() => setRollbackPlan(null)}>取消撤回</Button><Button type="button" disabled={locked || !permission?.enabled} onClick={applyRollback}>确认撤回并回读</Button></div>}
      {targetId && <section aria-label="共享池操作记录"><Button secondary type="button" disabled={busy || unresolved} onClick={loadHistory}>读取当前绑定的共享池操作记录</Button>{history && <ul>{history.length === 0 && <li>当前绑定暂无记录。</li>}{history.map(row => <li key={row.operationId}>{row.name} · {row.kind} · {row.at} <Button secondary type="button" disabled={busy || unresolved} onClick={() => chooseRecord(row.operationId)}>查原操作</Button></li>)}</ul>}</section>}
      {unresolved && <p role="alert">待查编号未结束；先查询原操作，不重复提交。</p>}
      {message && <p role="status">{message}</p>}{error && <p role="alert" className="inline-error">{error}</p>}
    </div>}
  </section>;
}
