import React from 'react';

// Uses the already-read Git evidence. File names suggest review areas only;
// this does not infer business effects or send source text to a model.
export function DiffSummary({ comparison }) {
  const files = comparison.files || [];
  const numeric = files.filter(file => Number.isSafeInteger(file.added) && Number.isSafeInteger(file.deleted));
  const added = numeric.reduce((sum, file) => sum + file.added, 0);
  const deleted = numeric.reduce((sum, file) => sum + file.deleted, 0);
  const binary = files.length - numeric.length;
  const groups = [
    ['页面与样式', /(?:\.(?:jsx|tsx|css|scss|html)$)/i, '打开涉及的页面，检查主要操作和窄屏显示。'],
    ['服务与数据', /(?:^|\/)(?:server|api|migrations?|schema)(?:\/|\.)|\.(?:sql)$/i, '核对数据读写、失败后的恢复和原有接口。'],
    ['依赖与运行配置', /(?:^|\/)(?:package(?:-lock)?\.json|.*lock.*|.*config\.[^.]+|Dockerfile)$/i, '核对运行环境是否需要更新，再验证启动与原有功能。'],
    ['验证代码', /(?:^|\/)(?:tests?|__tests__)(?:\/)|\.(?:test|spec)\./i, '运行相关验证；通过记录需对应这次改动。'],
  ].map(([label, match, suggestion]) => ({label, suggestion, files: files.filter(file => match.test(file.path))})).filter(group => group.files.length);
  return <section className="sp-diff-summary" aria-label="差异摘要与核对建议">
    <h3>这次差异怎么看</h3>
    <p>与存档 <code>{comparison.baseHash.slice(0, 12)}</code> 对比，读取于 {new Date(comparison.observedAt).toLocaleString('zh-CN')}。</p>
    <p>{files.length ? `已跟踪文件中有 ${files.length} 个发生变化；可统计文本新增 ${added} 行、删除 ${deleted} 行${binary ? `；另有 ${binary} 个文件无法按文本行计数` : ''}。` : comparison.text ? '已有正文差异，但文件统计未返回；请以原始差异核对。' : '本次读取没有已跟踪的正文差异。'}</p>
    <p>以下按文件名归类，可能重叠；只是核对建议，业务影响仍需结合正文确认。</p>
    <ul>{groups.map(group => <li key={group.label}><strong>{group.label} · {group.files.length} 个</strong><p>{group.suggestion}</p><details><summary>查看依据文件</summary><ul>{group.files.map(file => <li key={file.path}><code>{file.path}</code></li>)}</ul></details></li>)}</ul>
    {!groups.length && files.length > 0 && <p>先逐份检查下方原始差异，再验证这些文件的使用路径。</p>}
  </section>;
}
