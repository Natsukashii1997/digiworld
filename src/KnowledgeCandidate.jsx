import React, { useRef, useState } from 'react';
import { Button } from './components.jsx';
import { request } from './api.js';

export function KnowledgeCandidate({ task, revision, adoptState, notify, onBusyChange }) {
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [unknown, setUnknown] = useState(false);
  const [error, setError] = useState('');
  const lock = useRef(false);
  const version = task?.candidates.at(-1);
  if (!task || !version) return <p role="status">候选已变化，请刷新待处理列表。</p>;
  async function act(queryOnly = false) {
    if (lock.current || (!queryOnly && (!confirmed || unknown))) return;
    lock.current = true; setBusy(true); onBusyChange?.(true); setError('');
    try {
      const state = queryOnly ? await request('/workspace', undefined, 'GET', false)
        : (await request('/knowledge/tasks/archive', { taskId: task.id, expectedRevision: revision }, 'POST', false)).state;
      const current = state?.knowledgeTasks?.find(item => item.id === task.id);
      if (!current) throw Error('候选未找到，请保留此页并核对当前主库。');
      adoptState(state); setUnknown(false);
      if (current.archived) notify('候选已归档，退出待处理；原文和正式知识未改动');
      else setError('当前候选仍未归档，可以核对后重新确认。');
    } catch (e) { setUnknown(true); setError(e.message + '；先核对当前归档状态。'); }
    finally { lock.current = false; setBusy(false); onBusyChange?.(false); }
  }
  return <section className="knowledge-clip" aria-label="本机待整理候选">
    <h3>{version.candidate.title}</h3>
    <p>仅保存于工作台本机主库；原文与 Vault 未改动，也未晋升正式知识。</p>
    <p><strong>摘录：</strong></p><blockquote>{version.candidate.summary}</blockquote>
    <p><strong>来源：</strong>{task.evidence.map(item => `${item.sourceName}/${item.path}`).join('；')}</p>
    <details><summary>核验详情</summary>{task.evidence.map(item => <p key={item.id}><code>SHA-256 · {item.sha256}</code></p>)}</details>
    {task.archived ? <p role="status">已归档。候选内容仍保留在工作台本机主库及备份内。</p> : <>
      <p>后续整理需另行选择；归档会退出待处理，保留候选，不会改写正式知识。</p>
      <label><input type="checkbox" checked={confirmed} disabled={busy || unknown}
        onChange={event => setConfirmed(event.target.checked)} />我已核对，暂不继续整理这份候选</label>
      <Button disabled={busy || unknown || !confirmed} onClick={() => act()}>归档并退出待处理</Button>
    </>}
    {unknown && <Button secondary disabled={busy} onClick={() => act(true)}>核对归档状态</Button>}
    {error && <p role="alert" className="inline-error">{error}</p>}
  </section>;
}
