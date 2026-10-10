import React, { useCallback, useEffect, useRef, useState } from 'react';
import { AlertTriangle, ArrowRight, Check, GitBranch, LockKeyhole, Search, X } from 'lucide-react';
import { request } from './api.js';
import './night-v2-actions.css';

const ACTION_LABELS = { merge: '合并到 main', day: '派白天处理', continue: '今晚续跑', discard: '丢弃 worktree' };
const TARGET_LABELS = { note: '转随手记', pending: '转待处理', knowledge: '预览知识仓库建议' };
const RESULT_LABELS = {
  merged: '已本地合并', dispatched: '已生成白天派单', queued: '已排入今晚候选',
  discarded: 'worktree 已丢弃', conflict: '发现冲突，未合并', saved: '已保存并回读',
  preview_acknowledged: '已确认预览，尚未写入知识仓库',
  unknown: '操作结果未知', not_started: '原操作未开始',
};
const terminal = new Set(['merged', 'dispatched', 'queued', 'discarded', 'conflict', 'saved', 'preview_acknowledged', 'not_started']);
const actionPaths = { preview: '/night-v2/actions/preview', confirm: '/night-v2/actions/confirm', query: '/night-v2/actions/query' };
const suggestionPaths = { preview: '/night-v2/actions/suggestion-preview', confirm: '/night-v2/actions/suggestion-confirm', query: '/night-v2/actions/suggestion-query' };

const arr = value => Array.isArray(value) ? value : [];
const errorText = error => error?.message || '服务端暂时无法确认，请查询原操作。';
const pendingKey = (mode, payload) => mode === 'suggestion'
  ? `night-v2-suggestion:${payload.runId}:${payload.slotId}:${payload.target}:${payload.section}:${payload.index}`
  : `night-v2-action:${payload.runId}:${payload.slotId}`;
function remembered(key) { try { return window.sessionStorage.getItem(key); } catch { return null; } }
function remember(key, operationId) { try { window.sessionStorage.setItem(key, operationId); } catch { /* 页面内仍保留 operationId */ } }
function forget(key) { try { window.sessionStorage.removeItem(key); } catch { /* 查询仍以服务端回执为准 */ } }

export function useNightV2Decisions(runId) {
  const [state, setState] = useState({ kind: 'loading', items: [], backlog: [] });
  const sequence = useRef(0);
  const read = useCallback(async () => {
    if (!runId) return;
    const current = ++sequence.current;
    setState(old => ({ ...old, kind: 'loading' }));
    try {
      const value = await request(`/night-v2/actions/decisions?runId=${encodeURIComponent(runId)}`);
      if (value?.schema !== 'night-v2-decisions' || !Array.isArray(value.items) || !Array.isArray(value.backlog))
        throw new Error('早上决策回执不完整。');
      if (current === sequence.current) setState({ kind: 'ready', items: value.items, backlog: value.backlog });
    } catch (error) { if (current === sequence.current) setState(old => ({ ...old, kind: 'error', error: errorText(error) })); }
  }, [runId]);
  useEffect(() => { read(); return () => { sequence.current += 1; }; }, [read]);
  return { ...state, read };
}

export function decisionFor(decisions, slotId) {
  return arr(decisions?.items).filter(item => item.slotId === slotId).at(-1) || null;
}

export function useNightV2Operation(onResolved) {
  const [view, setView] = useState(null);
  const opener = useRef(null);
  const attempt = useRef(0);
  const confirmInFlight = useRef(false);
  const onResolvedRef = useRef(onResolved);
  onResolvedRef.current = onResolved;

  const close = useCallback(() => {
    if (['confirming', 'querying'].includes(view?.phase)) return;
    attempt.current += 1;
    setView(old => old ? { ...old, visible: false } : old);
    setTimeout(() => opener.current?.focus?.(), 0);
  }, [view?.phase]);

  const open = useCallback(async (mode, payload, source) => {
    if (view?.phase === 'unknown' || view?.phase === 'confirming') {
      setView(old => old ? { ...old, visible: true } : old);
      return;
    }
    opener.current = source || document.activeElement;
    const previous = remembered(pendingKey(mode, payload));
    if (previous) {
      setView({ visible: true, mode, payload, phase: 'unknown',
        preview: { operationId: previous, runId: payload.runId, slotId: payload.slotId },
        error: '上次确认结果尚未查明；先查询原操作，不创建新的预览。' });
      return;
    }
    const current = ++attempt.current;
    setView({ visible: true, mode, payload, phase: 'previewing' });
    try {
      const preview = await request((mode === 'suggestion' ? suggestionPaths : actionPaths).preview, payload);
      const schema = mode === 'suggestion' ? 'night-v2-suggestion-preview' : 'night-v2-action-preview';
      if (preview?.schema !== schema || preview.runId !== payload.runId || preview.slotId !== payload.slotId ||
        typeof preview.operationId !== 'string' || typeof preview.token !== 'string' ||
        (mode === 'action' && preview.action !== payload.action) ||
        (mode === 'suggestion' && (preview.target !== payload.target || preview.section !== payload.section || preview.index !== payload.index)))
        throw new Error('预览身份与本次选择不一致，已停止操作。');
      if (current === attempt.current) setView({ visible: true, mode, payload, phase: 'review', preview });
    } catch (error) {
      if (current === attempt.current) setView({ visible: true, mode, payload, phase: 'error', error: errorText(error) });
    }
  }, [view?.phase]);

  const readOriginal = useCallback(async (currentView, previousError = '') => {
    const { mode, preview } = currentView;
    try {
      const result = await request(`${(mode === 'suggestion' ? suggestionPaths : actionPaths).query}?operationId=${encodeURIComponent(preview.operationId)}`);
      if (!['night-v2-action-result', 'night-v2-suggestion-result'].includes(result?.schema) ||
        result.operationId !== preview.operationId || result.runId !== preview.runId || result.slotId !== preview.slotId)
        throw new Error('查询到的不是本次操作回执。');
      if (result.status === 'unknown') {
        remember(pendingKey(mode, currentView.payload), preview.operationId);
        setView({ ...currentView, phase: 'unknown', result, error: previousError || '原操作仍未确认，请继续查询原操作。', visible: true });
        return;
      }
      if (!terminal.has(result.status)) throw new Error('原操作状态尚未可靠回读。');
      forget(pendingKey(mode, currentView.payload));
      setView({ ...currentView, phase: 'done', result, error: previousError, visible: true });
      try { await onResolvedRef.current?.(result); } catch { /* 原操作已确认；列表可手动重读 */ }
    } catch (error) {
      remember(pendingKey(mode, currentView.payload), preview.operationId);
      setView({ ...currentView, phase: 'unknown', error: `${previousError ? `${previousError} ` : ''}${errorText(error)}`, visible: true });
    }
  }, []);

  const confirm = useCallback(async () => {
    if (confirmInFlight.current || view?.phase !== 'review' || view.preview?.canConfirm !== true || !view.preview.operationId) return;
    confirmInFlight.current = true;
    const currentView = { ...view, phase: 'confirming', visible: true };
    setView(currentView);
    remember(pendingKey(view.mode, view.payload), view.preview.operationId);
    let error = '';
    try {
      const result = await request((view.mode === 'suggestion' ? suggestionPaths : actionPaths).confirm,
        { operationId: view.preview.operationId, token: view.preview.token, confirmed: true });
      if (!['night-v2-action-result', 'night-v2-suggestion-result'].includes(result?.schema) || result.operationId !== view.preview.operationId)
        error = '确认响应身份不符；只查询原操作。';
    } catch (cause) { error = `确认响应未收到：${errorText(cause)}`; }
    try { await readOriginal(currentView, error); }
    finally { confirmInFlight.current = false; }
  }, [view, readOriginal]);

  const query = useCallback(async () => {
    if (!view?.preview?.operationId || view.phase !== 'unknown') return;
    const currentView = { ...view, phase: 'querying', visible: true };
    setView(currentView);
    await readOriginal(currentView);
  }, [view, readOriginal]);

  return {
    view, close, confirm, query,
    openAction: (payload, source) => open('action', payload, source),
    openSuggestion: (payload, source) => open('suggestion', payload, source),
    recoverAction: (decision, source) => {
      if (!decision?.operationId) return;
      opener.current = source || document.activeElement;
      setView({ visible: true, mode: 'action', phase: 'unknown',
        payload: { runId: decision.runId, slotId: decision.slotId, action: decision.action },
        preview: { operationId: decision.operationId, runId: decision.runId, slotId: decision.slotId },
        error: '原操作结果未知；只查询该操作编号，不再次确认。' });
      remember(pendingKey('action', decision), decision.operationId);
    },
  };
}

function PreviewFacts({ preview, mode }) {
  if (mode === 'suggestion') return <div className="nv-action-facts"><div><b>来源</b><span>已校验学习报告 · {preview.section} 第 {Number(preview.index) + 1} 条</span></div><div><b>目标</b><span>{TARGET_LABELS[preview.target] || '目标待回读'}</span></div><div className="wide"><b>将转移的原文</b><p>{preview.text || '原文待回读'}</p></div>{preview.target === 'knowledge' && <p className="nv-action-warning wide" role="status">确认只会在本机记录“已预览”；不会读取或写入真实知识仓库。</p>}<div className="wide"><b>预览有效期</b><span>{preview.expiresAt || '待回读'}</span></div></div>;
  const files = arr(preview.files);
  return <div className="nv-action-facts">
    <div><b>项目</b><span>{preview.projectId || '待回读'}</span></div>
    <div><b>分支</b><code>{preview.branch || '待回读'}</code></div>
    {preview.action === 'continue' && preview.replaceLastNightSlots === true && <p className="nv-action-warning wide" role="status">确认后将清空仍与昨夜锁定版本一致的插槽，再加入这张续跑卡；确认时服务端会重新核对计划。</p>}
    {preview.action === 'continue' && preview.replaceLastNightSlots !== true && <p className="nv-action-warning wide" role="status">将保留分支并把续跑卡加入当前计划；具体插槽变化以确认后的工作台回读为准。</p>}
    {preview.action === 'discard' && <p className="nv-action-warning wide" data-testid="night-branch-retention">将删除此 worktree；分支按服务端规则保留 7 天，具体到期日以操作回执为准。</p>}
    {preview.backlog?.blocked && <p className="nv-action-warning wide" data-testid="night-project-backlog">项目有 {preview.backlog.count} 个未决分支，继续跑项目已暂停。</p>}
    {preview.action === 'merge' && <div className="wide"><b>合并前冲突检查</b><span>{preview.conflict === 'clean' ? '当前检查无冲突；确认时仍须重新校验' : preview.conflict === 'conflict' ? '有冲突；不可合并，可派 Codex 白天处理' : '检查结果未知；不可据此合并'}</span></div>}
    {preview.action === 'merge' && <div className="wide"><b>拟合入文件 · {files.length}</b><ul className="nv-action-files">{files.map((file, index) => <li key={`${file.path}-${index}`}><code>{file.path}</code><span>{file.status || '改动'} · +{file.added ?? '?'} −{file.deleted ?? '?'}</span></li>)}</ul></div>}
    <div><b>最后绿提交</b><code>{preview.lastGreenSha || '待回读'}</code></div>
    <div><b>main / 分支 SHA</b><code>{preview.mainSha || '待回读'} / {preview.branchSha || '待回读'}</code></div>
    <div><b>晨报 revision / 预览有效期</b><span>{preview.reportRevision ?? '待回读'} · {preview.expiresAt || '待回读'}</span></div>
    <div className="wide"><b>锁定来源校验</b><code>source {preview.sourceHash || '待回读'} · plan {preview.planHash || '待回读'}</code></div>
  </div>;
}

export function NightV2OperationDialog({ flow }) {
  const { view, close, confirm, query } = flow;
  const dialog = useRef(null);
  const first = useRef(null);
  const body = useRef(null);
  useEffect(() => {
    if (!view?.visible) return undefined;
    const old = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    first.current?.focus();
    return () => { document.body.style.overflow = old; };
  }, [view?.visible]);
  useEffect(() => {
    if (view?.visible && ['confirming', 'querying', 'unknown', 'done'].includes(view.phase))
      body.current?.scrollTo(0, 0);
  }, [view?.phase, view?.visible]);
  if (!view?.visible) return null;
  const suggestion = view.mode === 'suggestion';
  const preview = view.preview;
  const title = suggestion ? TARGET_LABELS[view.payload.target] || '建议转移' : ACTION_LABELS[view.payload.action] || '早上处理';
  const blocked = preview?.canConfirm !== true;
  const result = view.result;
  const unknown = view.phase === 'unknown';
  function onKeyDown(event) {
    if (event.key === 'Escape') { event.preventDefault(); close(); return; }
    if (event.key !== 'Tab') return;
    const controls = [...dialog.current.querySelectorAll('button:not([disabled]),[tabindex="0"]')];
    if (!controls.length) return;
    if (event.shiftKey && document.activeElement === controls[0]) { event.preventDefault(); controls.at(-1).focus(); }
    else if (!event.shiftKey && document.activeElement === controls.at(-1)) { event.preventDefault(); controls[0].focus(); }
  }
  return <div className="nv-action-scrim" onMouseDown={event => { if (event.target === event.currentTarget) close(); }}>
    <section ref={dialog} className="nv-action-dialog" role="dialog" aria-modal="true" aria-label={`${title}预览与确认`} data-testid={suggestion ? 'night-suggestion-dialog' : 'night-action-dialog'} onKeyDown={onKeyDown}>
      <header><div><span className="nv-mono">MORNING DECISION · {suggestion ? 'SUGGESTION' : view.payload.action?.toUpperCase()}</span><h2>{title}</h2></div><button ref={first} type="button" className="nv-action-close" aria-label="关闭预览" onClick={close}><X size={19} /></button></header>
      <div ref={body} className="nv-action-body" tabIndex={0} role="region" aria-label="操作预览与回读内容">
        {view.phase === 'previewing' && <p role="status">正在读取服务端预览…</p>}
        {view.phase === 'error' && <p role="alert" className="nv-action-warning">预览失败：{view.error}</p>}
        {view.phase === 'confirming' && <p role="status">已发送一次确认，正在查询原操作回执…</p>}
        {view.phase === 'querying' && <p role="status">正在查询原操作回执…</p>}
        {unknown && <p className="nv-action-unknown" data-testid={suggestion ? 'night-suggestion-unknown' : 'night-action-unknown'} role="alert"><AlertTriangle size={18} />{view.error || '操作结果未知。仅查询原操作，不再次发送确认。'}</p>}
        {view.phase === 'done' && <div className={`nv-action-result${['conflict', 'not_started'].includes(result?.status) ? ' caution' : ''}`} data-testid={suggestion ? 'night-suggestion-result' : 'night-action-result'} role="status">{['conflict', 'not_started'].includes(result?.status) ? <AlertTriangle size={19} /> : <Check size={19} />}<div><b>{RESULT_LABELS[result?.status] || '结果待核对'}</b><p>原操作 {result?.operationId || preview?.operationId} · {result?.at || '时间待回读'}</p>{view.error && <p>{view.error}</p>}{result?.mergeSha && <p>本地合并提交：{result.mergeSha}</p>}{result?.targetId && <p>目标编号：{result.targetId}</p>}{result?.retainUntil && <p data-testid="night-branch-retention">分支保留至 {result.retainUntil}</p>}</div></div>}
        {preview?.token && <section data-testid={suggestion ? 'night-suggestion-preview' : 'night-action-preview'}><p className="nv-action-intro">{view.phase === 'review' ? '以下对象来自锁定夜巡与服务端当次预览；确认前请核对范围。' : '以下是本次操作的锁定预览依据，可继续向下核对。'}</p><PreviewFacts preview={preview} mode={view.mode} />{preview.reason && <p className="nv-action-warning" role="status">{preview.reason}</p>}{preview.conflict === 'conflict' && <p className="nv-action-warning" data-testid="night-action-conflict">检测到冲突，本次不合并；可另预览“派白天处理”。</p>}</section>}
      </div>
      <footer><span className="nv-action-footnote"><LockKeyhole size={14} />仅在本机；不会推送或写 Vault</span><div><button type="button" className="nv-nbtn" onClick={close}>关闭</button>{view.phase === 'review' && !blocked && <button type="button" className="nv-nbtn pri" data-testid={suggestion ? 'night-suggestion-confirm' : 'night-action-confirm'} onClick={confirm}><ArrowRight size={15} />{suggestion && view.payload.target === 'knowledge' ? '确认已预览' : `确认${title}`}</button>}{unknown && <button type="button" className="nv-nbtn pri" data-testid={suggestion ? 'night-suggestion-query' : 'night-action-query'} onClick={query}><Search size={15} />查询原操作</button>}</div></footer>
    </section>
  </div>;
}

export function NightV2ActionButton({ action, slotId, onClick, disabled = false, primary = false, testId }) {
  return <button type="button" className={`nv-nbtn${primary ? ' pri' : ''}`} data-testid={testId || `night-action-open-${slotId}-${action}`} disabled={disabled} onClick={onClick}>{action === 'merge' && <GitBranch size={15} />}{ACTION_LABELS[action] || action}</button>;
}

export function NightV2SuggestionButton({ target, section, index, onClick, disabled = false }) {
  return <button type="button" className="nv-nbtn" data-testid={`night-suggestion-open-${section}-${index}-${target}`} disabled={disabled} onClick={onClick}>{TARGET_LABELS[target]}</button>;
}
