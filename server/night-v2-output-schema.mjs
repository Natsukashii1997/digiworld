// 夜巡 v2 产物是合成执行者交回的待验证数据，不构成批准或执行指令。
const KINDS = Object.freeze({
  learn: 'learning-report', push: 'branch-delivery', test: 'test-report',
  review: 'review-list', deps: 'deps-list', brief: 'daily-brief',
});
const CUSTOM_KINDS = Object.freeze({ report: 'custom-report', list: 'custom-list',
  branch: 'custom-branch', brief: 'custom-brief' });
const MAX_BYTES = 64 * 1024;
const plain = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const keys = (value, expected) => plain(value) &&
  Object.keys(value).sort().join('|') === [...expected].sort().join('|');
const str = (value, max = 2000, empty = false) => typeof value === 'string' &&
  (empty || value.trim().length > 0) && [...value].length <= max && !/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/.test(value);
const arr = (value, predicate, min = 0, max = 100) => Array.isArray(value) &&
  value.length >= min && value.length <= max && value.every(predicate);
const enumOf = (value, allowed) => allowed.includes(value);
const nonNegative = value => Number.isSafeInteger(value) && value >= 0;
const line = value => str(value, 1000);
const ref = value => str(value, 500);
const sourceRef = value => keys(value, ['id', 'title', 'url']) &&
  str(value.id, 100) && line(value.title) && str(value.url, 2000) && /^https?:\/\/[^\s/@]+(?:[^\s]*)$/i.test(value.url);
const briefLine = value => keys(value, ['text', 'sourceRef']) && line(value.text) && ref(value.sourceRef);

export const NIGHT_V2_OUTPUT_KINDS = Object.freeze({ ...KINDS, custom: CUSTOM_KINDS });
export const NIGHT_V2_OUTPUT_MAX_BYTES = MAX_BYTES;

export function expectedNightV2OutputKind(chipId, outputKind) {
  return KINDS[chipId] ?? CUSTOM_KINDS[outputKind] ?? null;
}

function validateContent(kind, value, slot, issues) {
  if (!plain(value)) { issues.push('content 必须是对象'); return; }
  switch (kind) {
    case 'learning-report': {
      if (!keys(value, ['topic', 'whyLearn', 'steps', 'insights', 'suggestions', 'sources']) ||
        !str(value.topic, 300) || !str(value.whyLearn, 2000) ||
        !arr(value.sources, sourceRef, 2, 50) ||
        new Set(value.sources?.map(item => item.id)).size !== value.sources?.length ||
        !arr(value.steps, step => keys(step, ['tag', 'sourceIds', 'learned', 'correction']) &&
          enumOf(step.tag, ['起点', '修正', '印证', '新增', '结论']) &&
          arr(step.sourceIds, id => str(id, 100), 1, 20) &&
          str(step.learned, 3000) && str(step.correction, 3000, true), 1, 50) ||
        !arr(value.insights, insight => keys(insight, ['text', 'sourceIds', 'verification']) &&
          str(insight.text, 3000) && arr(insight.sourceIds, id => str(id, 100), 1, 20) &&
          enumOf(insight.verification, ['crosschecked', 'pending']) &&
          (insight.verification !== 'crosschecked' || new Set(insight.sourceIds).size >= 2), 1, 30) ||
        !value.insights?.some(insight => insight.verification === 'crosschecked') ||
        !keys(value.suggestions, ['learning', 'project', 'cognition']) ||
        !arr(value.suggestions?.learning, line, 1, 20) ||
        !arr(value.suggestions?.project, line, 1, 20) ||
        !arr(value.suggestions?.cognition, line, 1, 20)) {
        issues.push('学习报告字段、来源、步骤、洞见或三类建议无效'); break;
      }
      const sourceIds = new Set(value.sources.map(item => item.id));
      for (const row of [...value.steps, ...value.insights]) {
        if (row.sourceIds.some(id => !sourceIds.has(id))) {
          issues.push('学习报告引用了未列出的来源'); break;
        }
      }
      break;
    }
    case 'test-report':
      if (!keys(value, ['cases', 'defects', 'newTests']) ||
        !arr(value.cases, item => keys(item, ['id', 'name', 'status', 'expected', 'actual', 'evidence']) &&
          str(item.id, 100) && line(item.name) && enumOf(item.status, ['passed', 'failed', 'blocked']) &&
          line(item.expected) && line(item.actual) && ref(item.evidence), 1, 100) ||
        !arr(value.defects, item => keys(item, ['id', 'reproduction', 'expected', 'actual', 'evidence', 'possibleCause']) &&
          str(item.id, 100) && line(item.reproduction) && line(item.expected) && line(item.actual) &&
          ref(item.evidence) && str(item.possibleCause, 2000), 0, 100) ||
        !arr(value.newTests, item => keys(item, ['path', 'result', 'evidence']) &&
          str(item.path, 500) && enumOf(item.result, ['passed', 'failed', 'not-run']) && ref(item.evidence), 0, 100))
        issues.push('测试报告用例、缺陷或新增测试字段无效');
      break;
    case 'branch-delivery':
    case 'custom-branch':
      if (!keys(value, ['branch', 'changedFiles', 'rounds', 'mainConflict']) ||
        !str(value.branch, 200) || !slot.branch || value.branch !== slot.branch ||
        !arr(value.changedFiles, item => keys(item, ['path', 'added', 'deleted']) &&
          str(item.path, 500) && nonNegative(item.added) && nonNegative(item.deleted), 0, 200) ||
        !arr(value.rounds, item => keys(item, ['round', 'executor', 'reviewer', 'result', 'evidence']) &&
          Number.isSafeInteger(item.round) && item.round >= 1 &&
          enumOf(item.executor, ['claude', 'codex']) &&
          (item.reviewer === null || enumOf(item.reviewer, ['claude', 'codex'])) &&
          enumOf(item.result, ['accepted', 'returned', 'failed']) && ref(item.evidence), 1, 100) ||
        !keys(value.mainConflict, ['status', 'evidence']) ||
        !enumOf(value.mainConflict?.status, ['clean', 'conflict', 'unknown']) ||
        !ref(value.mainConflict?.evidence))
        issues.push('分支交付、改动、轮次或 main 冲突检查无效');
      break;
    case 'review-list':
      if (!keys(value, ['scope', 'risks']) || !line(value.scope) ||
        !arr(value.risks, item => keys(item, ['location', 'evidence', 'impact', 'verification', 'reviewer', 'status']) &&
          str(item.location, 500) && ref(item.evidence) && line(item.impact) && line(item.verification) &&
          enumOf(item.reviewer, ['claude', 'codex']) && enumOf(item.status, ['confirmed', 'pending']), 0, 100))
        issues.push('代码审查范围、风险证据或复核字段无效');
      break;
    case 'deps-list':
      if (!keys(value, ['scope', 'advisories']) || !line(value.scope) ||
        !arr(value.advisories, item => keys(item, ['package', 'version', 'affectedVersions', 'source', 'applicability', 'evidence']) &&
          str(item.package, 200) && str(item.version, 100) && str(item.affectedVersions, 200) &&
          str(item.source, 2000) && enumOf(item.applicability, ['confirmed', 'pending', 'not-applicable']) &&
          ref(item.evidence), 0, 100))
        issues.push('依赖通告版本、适用性或来源字段无效');
      break;
    case 'daily-brief':
    case 'custom-brief':
      if (!keys(value, ['completed', 'unresolved', 'priorities']) ||
        !arr(value.completed, briefLine, 0, 50) ||
        !arr(value.unresolved, item => keys(item, ['text', 'owner', 'sourceRef']) &&
          line(item.text) && line(item.owner) && ref(item.sourceRef), 0, 50) ||
        !arr(value.priorities, briefLine, 1, 50) || JSON.stringify(value).length > 4000)
        issues.push('一页简报字段无效或超过一页上限');
      break;
    case 'custom-report':
      if (!keys(value, ['sections']) || !arr(value.sections,
        item => keys(item, ['heading', 'text', 'evidence']) && line(item.heading) &&
          str(item.text, 5000) && ref(item.evidence), 1, 50))
        issues.push('自定义报告章节或证据字段无效');
      break;
    case 'custom-list':
      if (!keys(value, ['items']) || !arr(value.items,
        item => keys(item, ['text', 'evidence']) && line(item.text) && ref(item.evidence), 1, 100))
        issues.push('自定义清单条目或证据字段无效');
      break;
    default: issues.push('未支持的产出类型');
  }
}

// slot 必须来自服务端批准时锁定的计划，不接受客户端临时提交的验收标准。
export function validateNightV2Output(slot, payload) {
  const issues = [];
  const expectedKind = expectedNightV2OutputKind(slot?.chipId, slot?.outputKind);
  if (!expectedKind || !Array.isArray(slot?.acceptance))
    return { status: 'invalid', issues: ['锁定插槽或产出形态无效'], output: null };
  let size;
  try { size = Buffer.byteLength(JSON.stringify(payload)); }
  catch { size = Infinity; }
  if (size > MAX_BYTES) issues.push('产出超过 64 KiB 上限');
  if (!keys(payload, ['schema', 'version', 'kind', 'runId', 'slotId', 'summary', 'acceptance', 'content']) ||
    payload.schema !== 'night-v2-output' || payload.version !== 1 || payload.kind !== expectedKind ||
    payload.runId !== slot.runId || payload.slotId !== slot.slotId || !str(payload.summary, 500))
    issues.push('产出信封与锁定任务不符');
  if (!arr(payload?.acceptance, item => keys(item, ['criterion', 'status', 'evidence']) &&
    line(item.criterion) && enumOf(item.status, ['met', 'unmet', 'unknown']) &&
    str(item.evidence, 1000, item.status === 'unknown'), slot.acceptance.length, slot.acceptance.length) ||
    payload.acceptance?.some((item, index) => item.criterion !== slot.acceptance[index]))
    issues.push('验收标准未逐条对应锁定计划');
  validateContent(expectedKind, payload?.content, slot, issues);
  return { status: issues.length ? 'invalid' : 'valid', issues,
    output: issues.length ? null : structuredClone(payload) };
}
