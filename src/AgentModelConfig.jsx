import { flyDataOnce } from './data-flight.js';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Button } from './components.jsx';
import { request } from './api.js';
import { useCapabilityAction } from './capability-ui-core.jsx';
import { useAgentPending } from './useAgentPending.js';

const call = (path, input) => request('/capabilities/agent/model-' + path, input, 'POST', false);
const shown = value => value === null ? '未设置（将使用更高或更低层的默认值）' : value;

// This panel edits only Codex's user-level default for future sessions.
// It never reads the raw config into the browser or starts a model request.
export function AgentModelConfig({ targetId, bindingTuple, revision, disabled, onBusyChange, onUnresolvedChange }) {
  const action = useCapabilityAction(onBusyChange);
  const [view, setView] = useState(null);
  const [modelId, setModelId] = useState('');
  const [plan, setPlan] = useState(null);
  const [result, setResult] = useState(null);
  const [history, setHistory] = useState(null);
  const pointers = useRef({model:'',permission:''});
  const pendingChanged = useCallback(id => {pointers.current.model=id;onUnresolvedChange?.(!!id||!!pointers.current.permission);}, [onUnresolvedChange]);
  const permissionChanged = useCallback(id => {pointers.current.permission=id;onUnresolvedChange?.(!!id||!!pointers.current.model);}, [onUnresolvedChange]);
  const permissionPending = useAgentPending({scope:'model-permission',targetTuple:'codex-user-model-permission-v1',onIdChange:permissionChanged});
  const [permission,setPermission] = useState(null),[permissionPlan,setPermissionPlan] = useState(null);
  const modelWriteEnabled = permission?.enabled === true;

  const pendingRecord = useAgentPending({ scope: 'agent-model', targetTuple: bindingTuple,
    onIdChange: pendingChanged });
  const pendingId = pendingRecord.id;
  const [message, setMessage] = useState('');
  const locked = !pendingRecord.ready || !permissionPending.ready || disabled || action.busy || !!pendingId || !!permissionPending.id;
  useEffect(() => () => { onUnresolvedChange?.(false); }, [onUnresolvedChange]);

  const pending = pendingRecord.setId;
  async function loadPermission() {
    const value=await action.run(()=>call('permission-status',{}));
    if(value)setPermission(value);
  }
  async function previewPermission() {
    if(action.isBusy()||locked||!permission)return;
    const value=await action.run(()=>call('permission-preview',{enabled:!permission.enabled}));
    if(value){setPermissionPlan(value);setPlan(null);setMessage('');}
  }
  async function refreshPermissionResult(value,id) {
    if(value?.status==='verified'||value?.status==='not_applied'||value?.closed===true){
      if(permissionPending.setId('',id)){
        setPermissionPlan(null);setPlan(null);
        setMessage(value.status==='not_applied'?'原编号未产生模型配置授权，已封闭；可重新预览本次授权。':value.closed===true?'原授权操作已结束且未执行。':'模型配置授权已回读；请重新预览模型修改。');
        await loadPermission();
      }else setMessage('授权结果已核对，但本机待查编号尚未清除；先保留原编号。');
    }else setMessage('授权结果未确认，请查询原授权编号；暂不提交新的设置。');
  }
  async function confirmPermission() {
    if(action.isBusy()||locked||!permissionPlan)return;
    const original=permissionPlan;
    if(!permissionPending.setId(original.operationId)){setMessage('无法保留授权操作编号，尚未开始授权变更。');return;}
    setPermissionPlan(null);
    const value=await action.run(()=>call('permission-apply',{token:original.token,operationId:original.operationId,confirmed:true}));
    await refreshPermissionResult(value,original.operationId);
  }
  async function checkPermission() {
    const id=permissionPending.id;if(!id||action.isBusy())return;
    const value=await action.run(()=>call('permission-check',{operationId:id}));
    if(value)await refreshPermissionResult(value,id);
  }
  async function inspect() {
    const value = await action.run(() => call('inspect', { targetId }));
    if (value) { setView(value); setModelId(value.model || ''); setPlan(null); setMessage(''); }
  }
  async function preview(event) {
    event.preventDefault();
    if (locked || !modelId) return;
    const value = await action.run(() => call('preview', { targetId, modelId, revision }));
    if (value) { setPlan(value); setResult(null); setMessage(''); }
  }
  async function rollbackPreview(id) {
    if (locked) return;
    const value = await action.run(() => call('rollback-preview', { id, revision }));
    if (value) { setPlan(value); setResult(null); setMessage(''); }
  }
  async function confirm() {
    if (action.isBusy() || !plan || locked || !modelWriteEnabled) return;
    const original = plan;
    if (!pending(original.operationId)) {
      setMessage('浏览器无法可靠保存原操作编号，执行已停止；请允许本机站点存储后重新预览。');
      return;
    }
    setPlan(null);
    const value = await action.run(() => call(original.kind === 'restore' ? 'rollback' : 'apply',
      { token: original.token, revision: original.revision }));
    if (value) {
      setResult(value);
      if (value.status === 'verified' || value.closed === true) {
        if (value.status === 'verified' && value.closed !== true) flyDataOnce(`agent-model:${original.operationId}`);
        if (!pending('', original.operationId)) setMessage('结果已确认，但浏览器未能清除待查标记；本窗口仍停止新写入。');
        else setMessage(value.closed === true ? '服务端已封闭原编号，确认没有执行；若还有待查编号，请继续核对。' : '');
        setView(null); setHistory(null);
      }
      else setMessage('写入或回读尚未确认；只查询原编号，不重复提交。');
    } else if (action.lastError.current?.operationNotStarted) {
      setMessage('执行前已拒绝；仍保留原编号。请查询原操作，待服务端确认封闭后再开始新写入。');
    } else setMessage('结果未知；已保留原编号，重新打开后仍可查询。');
  }
  async function check(id = pendingId) {
    if (!id) return;
    const value = await action.run(() => call('check', { id }));
    if (value) {
      setResult(value);
      if (id === pendingId && (value.status === 'verified' || value.closed === true)) {
        if (value.status === 'verified' && value.closed !== true) flyDataOnce(`agent-model:${id}`);
        if (!pending('', id)) setMessage('结果已确认，但浏览器未能清除待查标记；本窗口仍停止新写入。');
        else setMessage(value.closed === true ? '服务端已封闭原编号，确认没有执行；若还有待查编号，请继续核对。' : '');
        setView(null); setHistory(null);
      } else if (value.status === 'not_started') {
        setMessage('本次查询尚未形成可安全结束的记录；保留原编号并稍后再查。');
      } else if (value.status !== 'verified') {
        setMessage('当前结果仍未证实，停止新写入；保留原编号与本机记录。');
      }
    }
  }
  async function loadHistory() {
    const value = await action.run(() => call('history', { targetId }));
    if (value) setHistory(value.items);
  }
  return <section className="agent-model-config" aria-label="Codex 用户默认模型">
    <h3>Codex 新会话默认模型</h3>
    <p>仅处理此已登记 Codex CLI 的用户配置顶层 <code>model</code>；项目配置、profile 与启动参数可能覆盖。不会切换运行中的会话，不迁移 API Key，也不调用模型。</p>
    <div className="agent-write-gate" aria-label="Codex 模型配置独立授权">
      <p>模型配置写入独立授权：{permission ? permission.enabled ? '已开启' : '关闭' : '尚未读取，保持关闭'}。旧的 Agent 写入开关不会开放这项能力。</p>
      <div className="heading-actions">
        <Button secondary type="button" disabled={action.busy} onClick={loadPermission}>读取模型配置授权</Button>
        <Button secondary type="button" disabled={locked||!permission} onClick={previewPermission}>{permission?.enabled?'预览关闭模型配置写入':'预览开启模型配置写入'}</Button>
      </div>
      {permission?.reauthorizationRequired&&<p>数据目录来自恢复或身份已变化，需重新授权。</p>}
      {permissionPlan&&<div role="region" aria-label="模型配置授权预览"><p>{permissionPlan.enabled?'将允许':'将关闭'}登记 Codex CLI 用户默认模型的受控修改和恢复。不会授权其他配置、凭据或模型调用；每次修改仍需单独预览确认。</p><div className="form-actions">
        <Button secondary type="button" disabled={action.busy} onClick={()=>setPermissionPlan(null)}>取消模型配置授权预览</Button>
        <Button type="button" disabled={locked} onClick={confirmPermission}>确认模型配置授权</Button>
      </div></div>}
      {permissionPending.error&&<p role="alert">{permissionPending.error}</p>}
      {permissionPending.id&&<div><p>待查授权编号：<code>{permissionPending.id}</code></p><Button secondary type="button" disabled={action.busy} onClick={checkPermission}>查询原模型授权结果</Button></div>}
    </div>
    {pendingRecord.error && <p className="inline-error" role="alert">{pendingRecord.error}</p>}
    <Button secondary type="button" disabled={locked} onClick={inspect}>读取当前用户默认模型</Button>
    {view && <p>当前用户默认：<strong>{shown(view.model)}</strong> · 配置 SHA256：<code>{view.sha256}</code>。实际新会话采用未验证。</p>}
    <form onSubmit={preview} className="capability-form">
      <label>目标模型 ID<input value={modelId} maxLength={128} autoComplete="off" disabled={locked}
        onChange={event => { setModelId(event.target.value); setPlan(null); }}
        placeholder="输入目标模型 ID" /></label>
      <Button type="submit" disabled={locked || !modelId}>预览默认模型修改</Button>
    </form>
    {plan && <div className="capability-operation" role="region" aria-label="Codex 模型变更预览">
      <p>当前：<strong>{shown(plan.beforeModel)}</strong> → 目标：<strong>{shown(plan.afterModel)}</strong></p>
      <small>写前 SHA256：{plan.beforeHash}；写后 SHA256：{plan.afterHash}；预览有效至 {plan.expiresAt}</small>
      <p>{plan.notice}</p>
      {!modelWriteEnabled && <p role="status">模型配置独立授权未开启或未读取；核对后请重新预览。</p>}
      <div className="form-actions">
        <Button secondary type="button" disabled={action.busy} onClick={() => setPlan(null)}>取消本次预览</Button>
        <Button type="button" disabled={locked || !modelWriteEnabled || !plan.canConfirm} onClick={confirm}>
          {plan.kind === 'restore' ? '确认恢复原默认模型' : '确认修改用户默认模型'}
        </Button>
      </div>
    </div>}
    {action.error && <p className="inline-error" role="alert">{action.error}</p>}
    {message && <p role="status">{message}</p>}
    {pendingId && <p role="status">原操作编号：<code>{pendingId}</code>。结果未确认，已停止新写入。
      <Button secondary type="button" disabled={action.busy} onClick={() => check(pendingId)}>查询原操作结果</Button>
    </p>}
    {result && <div role="status"><strong>{result.status === 'verified' ? '用户默认配置已写入并回读' :
      result.closed === true ? '原操作已封闭，确认未执行' : result.status === 'unknown' ? '结果未知' :
        result.status === 'changed' ? '配置已发生外部变动' : '操作状态待核对'}</strong>
      <p>{result.reason || result.notice || '目标新会话实际采用仍未验证。'}</p>
      <small>操作编号：{result.operationId}</small></div>}
    <Button secondary type="button" disabled={disabled || action.busy} onClick={loadHistory}>读取当前绑定的模型操作历史</Button>
    {history && <ul>{history.length === 0 && <li>当前绑定尚无模型操作记录。</li>}
      {history.map(row => <li key={row.operationId}><strong>{row.kind === 'restore' ? '恢复' : '修改'} · {shown(row.beforeModel)} → {shown(row.afterModel)}</strong>
        <small>{row.at} · {row.operationId} · 历史记录，尚未核对当前文件</small>
        <Button secondary type="button" disabled={disabled || action.busy} onClick={() => check(row.operationId)}>查询当前文件</Button>
        {row.kind === 'apply' && <Button secondary type="button" disabled={locked}
          onClick={() => rollbackPreview(row.operationId)}>预览恢复此操作</Button>}</li>)}
    </ul>}
    <p>文件回读只证明用户默认配置。请在授权的目标新会话中另行核验实际模型。</p>
  </section>;
}
