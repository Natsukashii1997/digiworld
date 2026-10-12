import { Reading, ReadReveal } from './ScanMotion.jsx';
import React, { useEffect, useRef, useState } from 'react';
import { Button, Dialog } from './components.jsx';
import { request, session } from './api.js';
import { controlledPendingKey, controlledLegacyPrefix, legacyControlledPending,
  readControlledPending, rememberControlledPending,
  forgetControlledPending } from './controlled-execution-pending.js';
import './controlled-execution.css';

const STORAGE_ERROR = '本机数据目录或待查记录无法核验，已停止新建运行。';
const LEGACY_ERROR = '发现未绑定数据目录的旧待查编号。请保留原浏览器资料，在原数据目录核对；不能用当前目录的“未开始”清除。';

export function ControlledExecutionDrawer({ open, onClose, projectId, targetId }) {
  const [loaded, setLoaded] = useState(null);
  const [pending, setPending] = useState([]);
  const [pendingKey, setPendingKey] = useState('');
  const [legacyIds, setLegacyIds] = useState([]);
  const [storageReady, setStorageReady] = useState(false);
  const [goal, setGoal] = useState('');
  const [acceptance, setAcceptance] = useState('');
  const [second, setSecond] = useState(false);
  const [secondGoal, setSecondGoal] = useState('');
  const [preview, setPreview] = useState(null);
  const [confirmed, setConfirmed] = useState(false);
  const [selected, setSelected] = useState('');
  const [gate, setGate] = useState(null);
  const [gateConfirmed, setGateConfirmed] = useState(false);
  const [artifact, setArtifact] = useState(null);
  const [processProbe, setProcessProbe] = useState('');
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const lock = useRef(false);
  useEffect(() => {
    if (!open) return;
    let current = true, key = '';
    setPendingKey(''); setPending([]); setLegacyIds([]);
    setLoaded(null); setStorageReady(false);
    session().then(value => controlledPendingKey(value.dataRootIdentity)).then(scopedKey => {
      key = scopedKey;
      const ids = readControlledPending(localStorage, key);
      const legacy = legacyControlledPending(localStorage);
      if (!current) return;
      setPendingKey(key); setPending(ids); setLegacyIds(legacy);
      setStorageReady(!legacy.length);
      if (legacy.length) setError(LEGACY_ERROR);
    }).catch(() => {
      if (current) { setStorageReady(false); setError(STORAGE_ERROR); }
    });
    request('/controlled-execution/list', {}, 'POST', false)
      .then(value => { if (current) setLoaded(value); })
      .catch(failure => { if (current) setError(failure.message); });
    function onStorage(event) {
      if (!current || !key || event.key !== null &&
        event.key !== key && !event.key.startsWith(key + ':operation:') &&
        !event.key.startsWith(controlledLegacyPrefix)) return;
      try {
        const found = readControlledPending(localStorage, key);
        const legacy = legacyControlledPending(localStorage);
        // A peer tab clearing its pointer does not prove this tab's original
        // request reached a terminal state. Query it before clearing locally.
        setPending(old => [...new Set([...old, ...found])].sort());
        setLegacyIds(old => [...new Set([...old, ...legacy])].sort());
        if (legacy.length) { setStorageReady(false); setError(LEGACY_ERROR); }
      } catch { setStorageReady(false); setError(STORAGE_ERROR); }
    }
    window.addEventListener('storage', onStorage);
    return () => { current = false; window.removeEventListener('storage', onStorage); };
  }, [open]);
  useEffect(() => { setPreview(null); setConfirmed(false); }, [projectId, targetId]);
  if (!open) return null;
  const capabilities = loaded?.capabilities;
  const runs = loaded?.items || [];
  const run = runs.find(item => item.id === selected) || runs.at(-1);
  const close = () => { if (!lock.current) onClose(); };
  async function refresh() {
    const result = await request('/controlled-execution/list', {}, 'POST', false);
    setLoaded(result);
    return result;
  }
  async function act(mode, payload = {}) {
    if (lock.current) return;
    if (mode === 'resolve' && (!pendingKey || !pending.includes(payload.runId))) return;
    if (['start', 'gate'].includes(mode) && (!storageReady || !pendingKey)) return;
    if (mode !== 'resolve' && pending.length && ['preview', 'confirm'].includes(mode)) return;
    lock.current = true;
    setBusy(mode); setError('');
    try {
      if (mode === 'preview') {
        const plan = { schema: 1, projectId, targetId, taskKind: 'verification',
          goal: goal.trim(), acceptance: [acceptance.trim()],
          budget: { maxMinutesPerStep: 15, maxTurnsPerStep: 4 },
          steps: [{ id: 'step-1', goal: goal.trim(), acceptance: [acceptance.trim()] },
            ...(second ? [{ id: 'step-2', goal: secondGoal.trim(), acceptance: [acceptance.trim()] }] : [])] };
        const result = await request('/controlled-execution/preview', { plan }, 'POST', false);
        setPreview(result); setConfirmed(false);
      } else if (mode === 'confirm') {
        if (!preview || !confirmed || !storageReady || !pendingKey ||
          legacyControlledPending(localStorage).length) return;
        if (!rememberControlledPending(localStorage, pendingKey, preview.runId)) {
          setStorageReady(false); throw Error('待查编号保存失败，未开始确认');
        }
        setPending(old => [...new Set([...old, preview.runId])].sort());
        const result = await request('/controlled-execution/confirm', {
          runId: preview.runId, planHash: preview.planHash, confirmed: true,
        }, 'POST', false);
        if (!result.closed || !result.run) throw Error('确认结果待核对');
        if (!forgetControlledPending(localStorage, pendingKey, preview.runId))
          throw Error('本机待查编号无法清除，请查询原编号');
        setPending(old => [...new Set([...old.filter(id => id !== preview.runId),
          ...readControlledPending(localStorage, pendingKey)])].sort());
        setSelected(result.run.id); setPreview(null); setConfirmed(false);
        await refresh();
      } else if (mode === 'resolve') {
        const result = await request('/controlled-execution/resolve', {
          runId: payload.runId }, 'POST', false);
        if (!result.closed) throw Error('原运行仍未知');
        if (!pendingKey || !forgetControlledPending(localStorage, pendingKey, payload.runId))
          throw Error('原编号已核实，但本机待查记录无法清除');
        setPending(old => [...new Set([...old.filter(id => id !== payload.runId),
          ...readControlledPending(localStorage, pendingKey)])].sort());
        if (result.run) setSelected(result.run.id);
        setPreview(null); setConfirmed(false);
        await refresh();
      } else if (mode === 'list') {
        await refresh();
      } else if (mode === 'gate-preview') {
        const result = await request('/controlled-execution/gate-preview', {
          runId: run.id }, 'POST', false);
        setGate(result); setGateConfirmed(false);
      } else if (mode === 'gate') {
        if (!gate || !gateConfirmed) return;
        await request('/controlled-execution/gate', { runId: run.id,
          gateHash: gate.gateHash, confirmed: true }, 'POST', false);
        setGate(null); setGateConfirmed(false);
        await refresh();
      } else if (mode === 'collect') {
        const result = await request('/controlled-execution/collect', {
          runId: run.id, stepId: payload.stepId }, 'POST', false);
        setArtifact(result);
      } else if (mode === 'check' || mode === 'stop') {
        // Unknown outcome still owns its original process. Probe or request
        // stop by the same run ID; neither action starts a new execution.
        const result = await request(`/controlled-execution/${mode}`,
          { runId: run.id }, 'POST', false);
        setProcessProbe(result.processStatus || 'unknown');
        await refresh();
      } else {
        // Start is never retried automatically. If transport fails, use check.
        await request(`/controlled-execution/${mode}`, { runId: run.id }, 'POST', false);
        await refresh();
      }
    } catch (failure) {
      setError(mode === 'start' || mode === 'confirm'
        ? `${failure.message}。原操作结果待核对，请查询状态，不要重放。`
        : failure.message);
    } finally { lock.current = false; setBusy(''); }
  }
  return <Dialog drawer title="受控执行" onClose={close}>
    <div className="controlled-execution">
      <ReadReveal pending={!loaded&&!error} ready={!!loaded&&!error}/>
      <p>单目标验证任务 · 工作流 C。每一步都有状态、停止与产物回收；两步任务需要你确认第一步后才会开放第二步。</p>
      {!loaded && <p role="status"><Reading label="正在读取本机运行记录"/></p>}
      {capabilities && <p role="status" className={capabilities.enabled ? '' : 'inline-error'}>
        {capabilities.reason}。当前不是生产运行验收。
      </p>}
      {error && <p role="alert" className="inline-error">{error}</p>}
      {pending.length > 0 && <section aria-label="原编号待核对">
        <h3>原确认待核对</h3>
        {pending.slice(0, 10).map(id => <p key={id}><code>{id}</code>{' '}
          <Button secondary disabled={!!busy} onClick={() => act('resolve', { runId: id })}>
            查询原编号
          </Button></p>)}
        {pending.length > 10 && <p>先核对这 10 个编号，其余 {pending.length - 10} 个会保留并随后显示。</p>}
      </section>}
      {legacyIds.length > 0 && <section role="alert" aria-label="旧编号待人工核对">
        <p>{LEGACY_ERROR}</p>
        <p>{legacyIds.slice(0, 10).map(id => <code key={id}>{id} </code>)}</p>
        {legacyIds.length > 10 && <p>另有 {legacyIds.length - 10} 个旧编号保留在本机。</p>}
      </section>}
      {capabilities?.enabled && storageReady && !pending.length && <section aria-label="新建合成受控任务">
        <h3>新建单目标验证</h3>
        <p>当前项目：{projectId || '未选择'} · 执行目标：{targetId || '未选择'}</p>
        <label>目标<input value={goal} maxLength={1000} disabled={!!busy}
          onChange={event => { setGoal(event.target.value); setPreview(null); }} /></label>
        <label>可核验标准<input value={acceptance} maxLength={300} disabled={!!busy}
          onChange={event => { setAcceptance(event.target.value); setPreview(null); }} /></label>
        <label><input type="checkbox" checked={second} disabled={!!busy}
          onChange={event => { setSecond(event.target.checked); setPreview(null); }} />两步任务</label>
        {second && <label>第二步目标<input value={secondGoal} maxLength={1000} disabled={!!busy}
          onChange={event => { setSecondGoal(event.target.value); setPreview(null); }} /></label>}
        <p>每步目标限额 15 分钟、4 轮；两步最多分配 30 分钟、8 轮，人工确认等待另计。到时会请求停机并查询原进程，结果不明时停在待查。</p>
        <Button secondary disabled={!!busy || !projectId || !targetId || !goal.trim() ||
          !acceptance.trim() || second && !secondGoal.trim()}
          onClick={() => act('preview')}>预览锁定目标与预算</Button>
        {preview && <div className="controlled-preview">
          <p>项目 {preview.plan.projectId} · 目标 {preview.plan.targetId}</p>
          <details><summary>核验详情</summary>
            <p>计划 SHA-256：<code>{preview.planHash}</code></p>
            <p>目标身份：<code>{preview.target.target.identity}</code></p>
            <p>本次授权编号：<code>{preview.authorization.runId}</code></p>
          </details>
          <p>逐步预算合计：{preview.budgetSummary.allocatedMinutesAcrossSteps} 分钟、{preview.budgetSummary.allocatedTurnsAcrossSteps} 轮；人工门等待另计。</p>
          <p>有效至 {new Date(preview.expiresAt).toLocaleString('zh-CN')}</p>
          <label><input type="checkbox" checked={confirmed} disabled={!!busy}
            onChange={event => setConfirmed(event.target.checked)} />
            我确认只运行这份锁定的合成任务与预算</label>
          <Button disabled={!confirmed || !!busy} onClick={() => act('confirm')}>确认计划</Button>
        </div>}
      </section>}
      <section aria-label="受控执行记录">
        <h3>本机运行状态</h3>
        <Button secondary disabled={!!busy} onClick={() => act('list')}>刷新记录</Button>
        {runs.length > 0 && <label>查看运行
          <select value={run?.id || ''} onChange={event => { setSelected(event.target.value); setGate(null); setArtifact(null); setProcessProbe(''); }}>
            {runs.map(item => <option key={item.id} value={item.id}>{item.plan.goal} · {item.status}</option>)}
          </select></label>}
        {!runs.length && <p>暂无受控执行记录。</p>}
        {run && <div className="controlled-run">
          <p><strong>{run.plan.goal}</strong> · {run.status}</p>
          <p>运行编号：<code>{run.id.slice(0, 8)}</code></p>
          <details><summary>完整运行编号</summary><code>{run.id}</code></details>
          <ol>{run.steps.map(step => <li key={step.id}>
            <strong>{step.id} · {step.status}</strong>
            {step.result && <span>{step.result.reason}</span>}
            {step.artifact && <Button secondary disabled={!!busy}
              onClick={() => act('collect', { stepId: step.id })}>取回已核验产物</Button>}
          </li>)}</ol>
          <div className="heading-actions">
            {run.status === 'ready' && capabilities?.enabled && storageReady && pendingKey &&
              <Button disabled={!!busy} onClick={() => act('start')}>开始当前步骤</Button>}
            {['starting', 'running', 'stopping', 'unknown'].includes(run.status) && <>
              <Button secondary disabled={!!busy} onClick={() => act('check')}>查询原进程</Button>
              <Button secondary disabled={!!busy} onClick={() => act('stop')}>请求停止</Button>
            </>}
            {run.status === 'awaiting_gate' &&
              <Button secondary disabled={!!busy} onClick={() => act('gate-preview')}>核对第一步与下一步</Button>}
          </div>
          {run.status === 'unknown' && <p role="alert">原进程结果未知；可用原编号继续查询或请求停止，不会自动重放。原编号：<code>{run.id}</code></p>}
          {processProbe && ['starting', 'running', 'stopping', 'unknown'].includes(run.status) &&
            <p role="status">最近一次进程回查：{processProbe === 'not-launched' ? '尚未调用执行者' : processProbe === 'running' ? '仍在运行' : processProbe === 'stopped' ? '已退出，结果待核对' : '无法确认'}</p>}
          {gate && <div className="controlled-preview">
            <p>第一步：{gate.firstStep.result.reason} · SHA-256 <code>{gate.firstStep.artifact.sha256}</code></p>
            <p>第二步：{gate.nextStep.goal}</p><p>{gate.notice}</p>
            <label><input type="checkbox" checked={gateConfirmed} disabled={!!busy}
              onChange={event => setGateConfirmed(event.target.checked)} />
              我已核对第一步证据，允许开放第二步</label>
            <Button disabled={!gateConfirmed || !!busy || !storageReady || !pendingKey}
              onClick={() => act('gate')}>确认人工门</Button>
          </div>}
          {artifact?.runId === run.id && <div className="controlled-preview">
            <p>产物 SHA-256：<code>{artifact.artifact.sha256}</code></p>
            <pre tabIndex={0}>{artifact.content}</pre>
          </div>}
        </div>}
      </section>
    </div>
  </Dialog>;
}
