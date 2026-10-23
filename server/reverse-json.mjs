import { createReadStream } from 'node:fs';
import { filterRelayText } from '../src/relay-prompt.js';

// Streaming JSON visitor: retain only a token and a bounded-depth path, never a
// graph/object. Huge source strings are validated but deliberately not retained.
export async function visitJson(file, visit, { signal } = {}) {
  const stack = [{ kind: 'root', state: 'value', path: [] }];
  let mode = '', token = '', clipped = false, escape = false, unicode = 0;
  const invalid = () => { throw new Error('REA 输出不是完整有效 JSON'); };
  const current = () => stack.at(-1);
  const path = () => { const f = current(); return f.kind === 'root' ? [] : [...f.path, f.kind === 'array' ? f.count : f.key]; };
  const consume = () => {
    const f = current();
    if (!['value', 'first'].includes(f.state)) invalid();
    f.state = 'comma'; if (f.kind === 'array') f.count++;
  };
  const scalar = value => { const p = path(); consume(); visit(p, value, 'scalar'); };
  function punctuation(c) {
    const f = current();
    if (c === '{' || c === '[') {
      const p = path(); consume();
      if (stack.length > 128) invalid();
      stack.push({ kind: c === '{' ? 'object' : 'array', state: c === '{' ? 'keyFirst' : 'first', path: p, count: 0 });
    } else if (c === '}' || c === ']') {
      if (f.kind !== (c === '}' ? 'object' : 'array') || !['comma', 'first', 'keyFirst'].includes(f.state)) invalid();
      stack.pop(); visit(f.path, f.count, f.kind);
    } else if (c === ':') { if (f.state !== 'colon') invalid(); f.state = 'value'; }
    else if (c === ',') { if (f.state !== 'comma' || f.kind === 'root') invalid(); f.state = f.kind === 'object' ? 'key' : 'value'; }
    else invalid();
  }
  const decoder = new TextDecoder('utf-8', { fatal: true });
  for await (const bytes of createReadStream(file, { signal })) {
    const chunk = decoder.decode(bytes, { stream: true });
    for (const c of chunk) {
      if (mode === 'string') {
        if (unicode) { if (!/[a-f\d]/i.test(c)) invalid(); unicode--; }
        else if (escape) { if (!'"\\/bfnrtu'.includes(c)) invalid(); if (c === 'u') unicode = 4; escape = false; }
        else if (c === '\\') escape = true;
        else if (c === '"') {
          if (!clipped) token += c;
          const f = current();
          if (['key', 'keyFirst'].includes(f.state)) { if (clipped) invalid(); f.key = JSON.parse(token); f.state = 'colon'; }
          else scalar(clipped ? null : JSON.parse(token));
          mode = ''; token = ''; continue;
        } else if (c.charCodeAt(0) < 32) invalid();
        if (token.length < 8192) token += c; else clipped = true;
        continue;
      }
      if (mode === 'atom') {
        if (!/[ \t\r\n,}\]]/.test(c)) { if (token.length > 100) invalid(); token += c; continue; }
        let value; try { value = JSON.parse(token); } catch { invalid(); }
        if (typeof value === 'object' && value !== null || typeof value === 'string' || !Number.isFinite(value) && typeof value === 'number') invalid();
        scalar(value); mode = ''; token = '';
      }
      if (/[ \t\r\n]/.test(c)) continue;
      if (c === '"') { mode = 'string'; token = '"'; clipped = false; }
      else if ('{}[]:,'.includes(c)) punctuation(c);
      else { mode = 'atom'; token = c; }
    }
  }
  decoder.decode();
  if (mode === 'atom') { try { scalar(JSON.parse(token)); } catch { invalid(); } mode = ''; }
  if (mode || stack.length !== 1 || current().state !== 'comma') invalid();
}

export async function summarizeEvidence(file, kind, options) {
  const result = { kind, limitations: 0, integrityMismatches: 0, clues: [] };
  const fields = {
    evidence_id: 'evidenceId',
    'normalized_result.root_artifact_sha256': 'sha256',
    'normalized_result.statistics.modules': 'modules',
    'normalized_result.statistics.parsed_javascript_files': 'parsedJavaScriptFiles',
    'normalized_result.summary.ipc.literal_channels': 'ipcChannels',
    'normalized_result.summary.native_addon_bindings': 'nativeBindings',
    'normalized_result.capture.scripts_observed': 'scriptsObserved',
    'normalized_result.capture.scripts_analyzed': 'scriptsAnalyzed',
    'normalized_result.completeness.status': 'coverage',
    'normalized_result.summary.matched_seeds': 'hits',
  };
  const locations = new Set(), selected = new Set();
  await visitJson(file, (path, value, type) => {
    const key = path.join('.');
    if (type === 'scalar' && fields[key]) { if (selected.has(key)) throw new Error('REA摘要含重复关键字段'); selected.add(key); result[fields[key]] = value; }
    if (type === 'array' && key === 'normalized_result.limitations') result.limitations = value;
    if (type === 'array' && key === 'normalized_result.integrity_contradictions') result.integrityMismatches = value;
    if (type === 'array' && key === 'normalized_result.unknowns') result.unknowns = value;
    if (kind === 'trace' && type === 'scalar' && typeof value === 'string' &&
        /^normalized_result\.graph\.nodes\.\d+\.(identity|observations)\./.test(key) &&
        /(?:path|channel|file)$/.test(key) && locations.size < 5) locations.add(filterRelayText(value).text.slice(0, 500));
  }, options);
  if (!/^ev_[a-f0-9]{64}$/.test(result.evidenceId || '')) throw new Error('REA 摘要缺少有效 Evidence ID');
  const counts = kind === 'electron' ? ['modules', 'parsedJavaScriptFiles', 'ipcChannels', 'nativeBindings'] : kind === 'web' ? ['scriptsObserved', 'scriptsAnalyzed'] : ['hits'];
  if (counts.some(k => !Number.isSafeInteger(result[k]) || result[k] < 0)) throw new Error('REA 摘要统计字段缺失或版本不兼容');
  if (kind === 'electron' && !/^[a-f0-9]{64}$/.test(result.sha256 || '')) throw new Error('REA 摘要缺少目标 SHA256');
  if (kind === 'trace') result.locations = [...locations];
  return result;
}

export async function browserTargets(file, options) {
  const targets = [];
  await visitJson(file, (path, value, type) => {
    if (type !== 'scalar' || path.length !== 4 || path[0] !== 'normalized_result' || path[1] !== 'targets') return;
    const index = path[2];
    if (!Number.isSafeInteger(index) || index < 0) throw new Error('Chrome页面列表结构无效');
    if (index >= 200) throw new Error('Chrome 页面超过 200 个，请关闭无关调试页');
    if (['target_id', 'type', 'url', 'title'].includes(path[3])) {
      const target=targets[index] ||= {};
      if(Object.hasOwn(target,path[3]))throw new Error('Chrome页面含重复字段');
      target[path[3]]=value;
    }
  }, options);
  return targets.filter(Boolean);
}
