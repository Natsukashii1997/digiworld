import React from 'react';
import {modelUsageSummary} from './model-usage-summary.js';
export function ModelUsageSummary({rows}) {
  const groups=modelUsageSummary(rows);
  return <section aria-label="模型用量按来源汇总" className="model-usage-summary">
    <h3>按来源核对用量</h3>
    <p>范围：本机已读取的模型操作回执，按操作编号去重。Token 来自提供方回执；费用是按价格算出的本机估算，实际账单未知。未知项未按零计入。</p>
    {groups.length ? <ul>{groups.map(g=><li key={g.key}>
      <strong>{g.source} · {g.provider} · {g.model}</strong>
      <p>{g.count} 次记录{g.unknown ? `，其中 ${g.unknown} 次结果未知` : ''}。</p>
      <p>{g.usageKnown ? `已知部分：输入 ${g.input.toLocaleString()}、输出 ${g.output.toLocaleString()} Token（${g.usageKnown}/${g.count} 次有完整回执）` : 'Token 未知：没有完整回执'}。</p>
      <p>{g.costKnown ? `已知费用估算 $${(g.cost/1e6).toFixed(6)} USD（${g.costKnown}/${g.count} 次）` : '费用估算未知'}；账单未核验。</p>
    </li>)}</ul> : <p>当前没有可汇总的请求回执。</p>}
    <p>外部 Agent 会话、工作流执行及夜巡用量尚未合并，不能由这里推算全工作台总量。移除本机结果不会扣减已发生的用量。</p>
  </section>;
}
