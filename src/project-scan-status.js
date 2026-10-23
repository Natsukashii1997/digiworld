export function projectScanNotice(connections) {
  const d = connections?.projectScanDiagnostics;
  const at = connections?.projectScannedAt;
  const stamp = at && Number.isFinite(Date.parse(at)) ? `扫描于 ${new Date(at).toLocaleString('zh-CN')}。` : '';
  if (!d) return `${stamp}历史扫描不完整，具体原因未记录；重新扫描后可查看原因。`;
  const labels = { directory_budget: '目录数量', depth: '目录深度', git_time_budget: 'Git 时间读取次数', github_page_limit: 'GitHub 分页数' };
  const reasons = [...(d.local?.reasons || []), ...(d.remote?.reasons || [])];
  return `${stamp}${reasons.map(r => `${labels[r.code]}达到上限 ${r.limit}`).join('；')}。尚未核实的部分保留原记录。`;
}
