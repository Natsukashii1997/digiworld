import { failure } from './repository.mjs';
const CODES = { local: ['directory_budget', 'depth', 'git_time_budget'], remote: ['github_page_limit'] };
const integer = n => Number.isSafeInteger(n) && n >= 0 && n <= 1000000;
function exact(value, fields) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).some(k => !fields.includes(k))) throw failure('扫描诊断格式无效');
}
export function validateProjectScanDiagnostics(value) {
  exact(value, ['version', 'at', 'local', 'remote']);
  if (value.version !== 1 || typeof value.at !== 'string' || !Number.isFinite(Date.parse(value.at))) throw failure('扫描诊断版本或时间无效');
  for (const side of ['local', 'remote']) {
    const d = value[side];
    if (d === undefined) continue;
    const counters = side === 'local' ? ['visited', 'knownRequested', 'knownChecked', 'gitReads', 'maxDirectories', 'maxDepth', 'maxUpdateReads'] : ['pages', 'records', 'maxPages', 'pageSize'];
    exact(d, [...counters, 'reasons']);
    if (counters.some(k => !integer(d[k])) || !Array.isArray(d.reasons) || d.reasons.length > CODES[side].length) throw failure('扫描诊断计数无效');
    const seen = new Set();
    for (const r of d.reasons) {
      exact(r, ['code', 'limit', 'used', 'samples']);
      if (!CODES[side].includes(r.code) || seen.has(r.code) || !integer(r.limit) || !integer(r.used) || !Array.isArray(r.samples) || r.samples.length > 5 || r.samples.some(p => typeof p !== 'string' || p.length > 2000 || /[\x00-\x1f\x7f]/.test(p))) throw failure('扫描诊断原因无效');
      seen.add(r.code);
    }
  }
}
