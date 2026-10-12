import { flyDataOnce } from './data-flight.js';
import { flyData } from './data-flight.js';
import React, { useEffect, useRef, useState } from 'react';
import { Button } from './components.jsx';
import { request, session } from './api.js';
import './knowledge-clip.css';

import { LEGACY_KNOWLEDGE_CLIP_PREFIX, knowledgeClipScopePrefix,
  legacyKnowledgeClipPending, readKnowledgeClipPending,
  persistKnowledgeClipPending, clearKnowledgeClipPending } from './knowledge-clip-pending.js';

const STORAGE_ERROR = '本机待查编号不可用，已停止新建候选；请保留当前页面。';
const LEGACY_ERROR = '发现未绑定数据目录的旧待查编号；已停止新建候选。请保留原浏览器资料，在原数据目录核对后迁移。';

export function KnowledgeClip({ row, document, revision, adoptState, notify, onBusyChange, recoveryOnly = false }) {
  const suggested = row?.snippets?.[0]?.text?.trim() || '';
  const [excerpt, setExcerpt] = useState(
    suggested && document?.content.includes(suggested) ? suggested : '',
  );
  const [preview, setPreview] = useState(null);
  const [confirmed, setConfirmed] = useState(false);
  const [pendingIds, setPendingIds] = useState([]);
  const [ready, setReady] = useState(false);
  const [rootIdentity, setRootIdentity] = useState('');
  const [legacyIds, setLegacyIds] = useState([]);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const lock = useRef(false);
  useEffect(() => {
    let current = true, sync;
    session().then(value => {
      const identity = value?.dataRootIdentity;
      const stored = readKnowledgeClipPending(localStorage, identity);
      const legacy = legacyKnowledgeClipPending(localStorage);
      if (!current) return;
      setRootIdentity(identity); setPendingIds(stored); setLegacyIds(legacy);
      setReady(!legacy.length); setError(legacy.length ? LEGACY_ERROR : '');
      sync = event => {
        if (event.key !== null && !event.key?.startsWith(knowledgeClipScopePrefix(identity)) &&
          !event.key?.startsWith(LEGACY_KNOWLEDGE_CLIP_PREFIX)) return;
        try {
          const currentIds = readKnowledgeClipPending(localStorage, identity);
          const old = legacyKnowledgeClipPending(localStorage);
          // A peer's clear cannot terminate this tab's unresolved request.
          setPendingIds(previous => [...new Set([...previous, ...currentIds])].sort());
          setLegacyIds(old);
          if (old.length) { setReady(false); setError(LEGACY_ERROR); }
          else { setReady(true); setError(previous => previous === LEGACY_ERROR ? '' : previous); }
        } catch { setReady(false); setError(STORAGE_ERROR); }
      };
      window.addEventListener('storage', sync);
    }).catch(() => {
      if (current) { setError(STORAGE_ERROR); setReady(false); }
    });
    return () => { current = false; if (sync) window.removeEventListener('storage', sync); };
  }, []);
  async function run(mode, id = '') {
    if (lock.current || !rootIdentity || (mode !== 'check' && (!ready || pendingIds.length)) ||
      (mode === 'check' && !pendingIds.includes(id)) ||
      (recoveryOnly && mode !== 'check')) return;
    if (mode === 'preview' && (!excerpt.trim() || excerpt.length > 2000)) return;
    if (mode === 'confirm' && (!preview || !confirmed)) return;
    lock.current = true;
    onBusyChange?.(true);
    setBusy(mode);
    setError('');
    try {
      if (mode !== 'check' && legacyKnowledgeClipPending(localStorage).length) {
        setReady(false); setError(LEGACY_ERROR); return;
      }
      if (mode === 'preview') {
        const result = await request('/knowledge/clip/preview', {
          sourceId: row.sourceId, path: row.path,
          expectedSha256: document.sha256, excerpt,
        }, 'POST', false);
        setPreview(result);
        setConfirmed(false);
      } else if (mode === 'confirm') {
        const operationId = preview.operationId;
        if (!persistKnowledgeClipPending(localStorage, operationId, rootIdentity)) {
          setReady(false); setError(STORAGE_ERROR); return;
        }
        setPendingIds(old => [...new Set([...old, operationId])].sort());
        const result = await request('/knowledge/clip/confirm', {
          operationId, revision: preview.revision, confirmed: true,
        }, 'POST', false);
        if (!result.closed || result.status !== 'saved') throw Error('保存结果待核对，请查询原编号。');
        adoptState(result.state);
        if (!clearKnowledgeClipPending(localStorage, operationId, rootIdentity)) {
          setError('候选已保存，但本机待查编号清理失败；请查询原编号。'); return;
        }
        setPendingIds(old => old.filter(value => value !== operationId));
        setPreview(null);
        setConfirmed(false);
        notify('待整理候选已保存到工作台本机主库；原文和 Vault 未改动'); flyDataOnce(`knowledge-clip:${operationId}`);
      } else {
        const result = await request('/knowledge/clip/check', { operationId: id }, 'POST', false);
        if (!result.closed || !['saved', 'not_started'].includes(result.status))
          throw Error('原编号结果仍未知，请稍后再查。');
        if (result.status === 'saved') adoptState(result.state);
        if (!clearKnowledgeClipPending(localStorage, id, rootIdentity)) {
          setError('原编号已核实，但本机待查记录清理失败，请保留此编号。'); return;
        }
        setPendingIds(old => old.filter(value => value !== id));
        if (result.status === 'saved') {
          setPreview(null); setConfirmed(false);
          flyDataOnce(`knowledge-clip:${id}`);notify('已找回本机待整理候选');
        } else {
          setPreview(null); setConfirmed(false);
          notify('原编号确认未开始且已封闭，可重新预览');
        }
      }
    } catch (failure) {
      setError(mode === 'confirm'
        ? `${failure.message}。保存结果待核对，请只查询原编号，不要重复确认。`
        : failure.message);
      if (mode === 'preview') { setPreview(null); setConfirmed(false); }
    } finally {
      lock.current = false;
      onBusyChange?.(false);
      setBusy('');
    }
  }
  const local = !!row && row.sourceKind !== 'feishu';
  return <section className="knowledge-clip" aria-label={recoveryOnly ? '核对剪藏是否保存' : '剪藏为待整理候选'}>
    <h4>{recoveryOnly ? '核对剪藏是否保存' : '剪藏为待整理候选'}</h4>
    <p>{recoveryOnly ? '剪藏时若网络中断或提示结果不明，可在这里用原操作编号核对是否已保存；不会再次保存，也不会读取原文。' :
      '选择原文中的一段话，核对来源后保存到工作台本机待处理。不会移动原文，也不会写入 Vault。'}</p>
    {!recoveryOnly && !local && <p role="status">飞书来源的候选保存尚未开放；当前仍可只读查看原文。</p>}
    {(local || recoveryOnly) && <>
      {pendingIds.length > 0 && <div role="status">
        <p>有 {pendingIds.length} 个保存结果待核对。请先查询原编号，不要再次提交。</p>
        {pendingIds.slice(0, 10).map(id => <p key={id}><code>{id}</code>{' '}
          <Button secondary disabled={!!busy || !rootIdentity} onClick={() => run('check', id)}>
            {busy === 'check' ? '查询中…' : '查询原编号'}
          </Button></p>)}
        {pendingIds.length > 10 && <p>先核对这 10 个编号，其余 {pendingIds.length - 10} 个会继续保留并随后显示。</p>}
      </div>}
      {legacyIds.length > 0 && <div role="alert"><p>{LEGACY_ERROR}</p>
        <p>旧编号：{legacyIds.slice(0, 10).map(id => <code key={id}>{id} </code>)}</p>
        {legacyIds.length > 10 && <p>另有 {legacyIds.length - 10} 个旧编号保留在本机。</p>}
        <p>不能用当前数据目录的“未开始”结果清除这些旧编号。</p></div>}
      {recoveryOnly && ready && pendingIds.length === 0 && <p role="status">本机没有需要核对的剪藏。</p>}
      {!recoveryOnly && <>
      <label>原文摘录（最多 2000 字）
        <textarea rows={5} maxLength={2000} value={excerpt}
          disabled={!!busy || pendingIds.length > 0}
          onChange={event => { setExcerpt(event.target.value); setPreview(null); setConfirmed(false); }} />
      </label>
      <Button secondary disabled={!ready || !!busy || pendingIds.length > 0 || !excerpt.trim()}
        onClick={() => run('preview')}>{busy === 'preview' ? '核对中…' : '预览来源与保存位置'}</Button>
      {preview && <div className="knowledge-clip-preview" role="region" aria-label="剪藏确认预览">
        <p><strong>来源：</strong>{preview.sourceName}/{preview.path}</p>
        <p><strong>来源身份：</strong><code>{preview.sourceIdentity}</code></p>
        <p><strong>原文 SHA-256：</strong><code>{preview.sha256}</code></p>
        <p><strong>摘录：</strong></p><blockquote>{preview.excerpt}</blockquote>
        <p><strong>保存到：</strong>{preview.location}</p>
        <p>{preview.notice}</p>
        <p>预览有效至 {new Date(preview.expiresAt).toLocaleString('zh-CN')}</p>
        <label><input type="checkbox" checked={confirmed} disabled={!!busy || pendingIds.length > 0}
          onChange={event => setConfirmed(event.target.checked)} />
          我已核对来源、摘录及本机待整理位置</label>
        <Button disabled={!ready || !!busy || pendingIds.length > 0 || !confirmed}
          onClick={() => run('confirm')}>{busy === 'confirm' ? '保存中…' : '确认保存待整理候选'}</Button>
      </div>}
      </>}
    </>}
    {error && <p className="inline-error" role="alert">{error}</p>}
  </section>;
}
