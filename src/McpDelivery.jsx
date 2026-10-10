import React from 'react';
import { Copy, Download, PenLine } from 'lucide-react';
import { Button } from './components.jsx';
import { codexMcpDelivery } from './mcp-config.js';

export function McpDelivery({ version, targets, targetId, onTarget, onCopy, onDownload, onEdit, busy }) {
  const codexTargets = (targets || []).filter(target => target.agentId === 'codex' &&
    target.program?.kind === 'CLI' && typeof target.home?.path === 'string' && target.home.path.startsWith('/'));
  let delivery = null, error = '';
  if (targetId) {
    try { delivery = codexMcpDelivery(version, targets || [], targetId); }
    catch (cause) { error = cause.message; }
  }
  return <div className="mcp-delivery" aria-label="MCP 配置目标交付">
    <p>当前仅支持生成 Codex CLI 用户配置的 TOML 片段。先选择已登记目标；复制或下载都不会写入 Agent 配置，也不证明它已加载。</p>
    <label>已登记 Codex CLI 目标
      <select aria-label="MCP 配置交付目标" value={targetId} onChange={event => onTarget(event.target.value)} disabled={busy}>
        <option value="">请选择目标</option>
        {codexTargets.map(target => <option key={target.id} value={target.id}>{target.label}</option>)}
      </select>
    </label>
    {!codexTargets.length && <p role="status">尚无已登记 Codex CLI 目标；暂不能生成目标片段。</p>}
    {error && <p role="alert">{error}</p>}
    {delivery && <>
      <p>固定版本 <code>{delivery.versionId.slice(0,8)}</code> · 采用状态未验证</p>
      <details><summary>核验详情</summary><p>完整版本编号：<code>{delivery.versionId}</code></p><p>格式：{delivery.format}</p></details>
      <pre className="content-preview" aria-label="Codex MCP TOML 片段">{delivery.content}</pre>
      <div className="detail-actions">
        <Button type="button" disabled={busy} onClick={onCopy}><Copy size={16} />复制 Codex 配置片段</Button>
        <Button secondary type="button" disabled={busy} onClick={onDownload}><Download size={16} />下载 TOML 片段</Button>
      </div>
    </>}
    <button className="outlined-icon" aria-label="编辑 MCP 配置资产" title="编辑并保存为新版本" disabled={busy} onClick={onEdit}><PenLine size={17} /></button>
  </div>;
}
