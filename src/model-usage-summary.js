// Only explicit local request receipts participate. Configuration writes are
// excluded; deleted results and rollback never imply refunded model usage.
export function modelUsageSummary(rows) {
  const seen = new Set();
  const groups = new Map();
  for (const row of rows || []) {
    if (!row?.operationId || seen.has(row.operationId) || row.action === 'credentials') continue;
    seen.add(row.operationId);
    const source = row.action === 'single-book' ? '单书请求' : row.action === 'connection-test' ? '连接测试' : '未分类请求';
    const key = JSON.stringify([source,row.provider||'提供方未知',row.model||'模型未知']);
    if (!groups.has(key)) groups.set(key,{key,source,provider:row.provider||'提供方未知',model:row.model||'模型未知',count:0,unknown:0,input:0,output:0,usageKnown:0,cost:0,costKnown:0});
    const g=groups.get(key);g.count++;
    if (!['verified','rolled_back','not_started','not_applied','failed'].includes(row.status)) g.unknown++;
    const valid=n=>Number.isSafeInteger(n)&&n>=0;
    if(valid(row.usage?.input_tokens)&&valid(row.usage?.output_tokens)) {g.input+=row.usage.input_tokens;g.output+=row.usage.output_tokens;g.usageKnown++;}
    if(valid(row.costMicrosUsd)){g.cost+=row.costMicrosUsd;g.costKnown++;}
  }
  return [...groups.values()];
}
