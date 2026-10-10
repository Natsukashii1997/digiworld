import React, { useState } from 'react';
import { Button } from './components.jsx';
import { request } from './api.js';
import { useAgentPending } from './useAgentPending.js';

const call = (path, input) => request('/capabilities/agent/snapshot-' + path, input, 'POST', false);

export function AgentSnapshots({ targetId, targetTuple, snapshot, action, disabled, onInvalidate }) {
  const [rows, setRows] = useState(null);
  const [saved, setSaved] = useState(null);
  const [message, setMessage] = useState('');
  const pending = useAgentPending({scope:'snapshot', targetTuple});
  function clearPending(expectedId = pending.id) {
    if (pending.setId('', expectedId)) return true;
    setMessage('结果已核对，但浏览器未能清除待查标记；请保留原编号，当前停止新保存。');
    return false;
  }
  async function save() {
    if (action.isBusy() || pending.id || !pending.ready || !snapshot) return;
    const operationId = crypto.randomUUID();
    if (!pending.setId(operationId)) { setMessage('浏览器无法保留原操作编号，尚未开始保存。'); return; }
    setMessage('');
    const value = await action.run(() => call('save', {
      targetId, revision: snapshot.revision, sourceSha256: snapshot.sha256, sourceIdentity: snapshot.sourceIdentity, operationId,
    }));
    if (value) {
      setSaved(value); setRows(null);
      if (clearPending(operationId)) setMessage('白名单快照已保存并回读；后续创建完整备份时将包含它。');
    } else if (action.lastError.current?.operationNotStarted) {
      onInvalidate?.();
      if (clearPending(operationId)) setMessage('本次未保存，请重新读取当前配置后再保存。');
    } else setMessage('保存结果未确认，请查询原编号；关闭标签后重新打开仍可核对。');
  }
  async function resolvePending() {
    const value = await action.run(() => call('resolve', {targetId, operationId:pending.id}));
    if (!value) return;
    if (value.status === 'saved') {
      setSaved(value.snapshot); setRows(null);
      if (clearPending()) setMessage('已从本机记录回读；这是历史状态，Agent 运行采用尚未验证。');
    } else if (value.status === 'not_saved') {
      onInvalidate?.(); setSaved(null);
      if (clearPending()) setMessage('已确认未保存，原编号已结束；请重新读取当前配置后再保存。');
    } else if (value.status === 'binding_changed') {
      onInvalidate?.(); setSaved(null); setRows(null);
      if (clearPending()) setMessage('已确认原记录属于旧绑定，未带入旧快照；请重新读取当前目标配置。');
    }
  }
  async function read(id) {
    const value = await action.run(() => call('read', { id }));
    if (value) {
      setSaved(value);
      setMessage('已从本机记录回读；这是历史状态，Agent 运行采用尚未验证。');
    }
  }
  async function history() {
    const value = await action.run(() => call('history', { targetId }));
    if (value) { setRows(value.items); setSaved(null); }
  }
  return <section className="agent-snapshots" aria-label="本机配置快照历史">
    <h4>本机快照历史</h4>
    <p>保存已读取的白名单字段，用于对照历史；不会修改 Agent 配置。改绑后的目标需重新留存快照。</p>
    <div className="heading-actions">
      <Button secondary type="button" disabled={disabled || !snapshot || !pending.ready || !!pending.id} onClick={save}>保存这份白名单快照</Button>
      <Button secondary type="button" disabled={action.busy} onClick={history}>读取本机快照历史</Button>
    </div>
    {pending.error && <p role="alert">{pending.error}</p>}
    {message && <p role="status">{message}</p>}
    {pending.id && <div><p>原编号：<code>{pending.id}</code></p><Button secondary type="button" disabled={action.busy} onClick={resolvePending}>查询这次快照保存结果</Button></div>}
    {rows && <ul>{rows.length === 0 && <li>当前绑定尚无已存快照。</li>}{rows.map(row => <li key={row.id}>
      <strong>{new Date(row.at).toLocaleString('zh-CN')}</strong><small>来源版本 {row.revision} · <code>{row.sha256.slice(0, 12)}</code></small>
      <Button secondary type="button" disabled={action.busy} aria-label={`回读快照 ${row.id}`} onClick={() => read(row.id)}>回读这份快照</Button>
    </li>)}</ul>}
    {saved && <div aria-label="已存快照详情"><p>记录编号：<code>{saved.id}</code> · {new Date(saved.at).toLocaleString('zh-CN')}</p>
      <ul>{saved.fields.map(field => <li key={field.key}><code>{field.key}</code>：{field.status === 'configured' ? String(field.value) : field.status === 'unset' ? '当时未配置' : '当时布局不支持'}</li>)}</ul>
      <p>这份历史记录只用于对照；配置迁移仍从当前目标重新读取。</p>
    </div>}
  </section>;
}
