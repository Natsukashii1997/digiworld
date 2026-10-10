// 晨报只投影服务端锁定的夜巡记录与经 SHA-256 回读的应用产物。
// 导入和构造均不执行宿主命令、通知或定时任务。
import { createHash } from 'node:crypto';
import { realpathSync } from 'node:fs';
import { createLocalCapabilityState } from './local-capability-state.mjs';
import { NIGHT_V2_OUTPUT_MAX_BYTES, validateNightV2Output } from './night-v2-output-schema.mjs';

const SCHEMA = 'night-v2-morning-ledger';
const clone = value => structuredClone(value);
const sha = value => createHash('sha256').update(value).digest('hex');
const jsonHash = value => sha(JSON.stringify(value));
const fail = (code, message, status = 409) => { const error = new Error(message);
  error.code = code; error.status = status; throw error; };
const validId = value => typeof value === 'string' && /^[A-Za-z0-9][A-Za-z0-9._:-]{0,99}$/.test(value);
const validRunId = value => typeof value === 'string' && /^[a-f0-9-]{36}$/.test(value);
const receiptPattern = /^night-v2-artifact:[A-Za-z0-9._-]{1,96}$/;
const hashPattern = /^[a-f0-9]{64}$/;
const blank = () => ({ schema: SCHEMA, reports: [] });

function validateLedger(value) {
  if (!value || value.schema !== SCHEMA || !Array.isArray(value.reports) || value.reports.length > 300 ||
    value.reports.some(item => !validRunId(item.runId) || !Number.isSafeInteger(item.revision) ||
      item.revision < 1 || item.report?.schema !== 'night-v2-morning'))
    fail('INVALID_MORNING_LEDGER', '夜巡 v2 晨报记录无效');
  return value;
}

function dueAt(source) {
  if (source?.schema !== 'night-v2-morning-source' || !validRunId(source.runId) ||
    !/^\d{4}-\d{2}-\d{2}$/.test(source.nightDate) ||
    !/^\d{2}:\d{2}$/.test(source.window?.start) || !/^\d{2}:\d{2}$/.test(source.window?.end))
    fail('MORNING_SOURCE_INVALID', '夜巡锁定日期或时间窗无效');
  const start = new Date(`${source.nightDate}T${source.window.start}:00+08:00`);
  let end = new Date(`${source.nightDate}T${source.window.end}:00+08:00`);
  const localDate = new Date(start.getTime() + 8 * 3600_000).toISOString().slice(0, 10);
  if (!Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime()) || localDate !== source.nightDate)
    fail('MORNING_SOURCE_INVALID', '夜巡锁定日期或时间窗无效');
  if (end <= start) end = new Date(end.getTime() + 86400_000);
  return new Date(end.getTime() + 5 * 60_000).toISOString();
}

function slotReceipt(slot) {
  return [...slot.logs].reverse().find(log => log.outputReceipt)?.outputReceipt ?? null;
}

function missingState(error) {
  return error?.code === 'ENOENT' || error?.code === 'ARTIFACT_NOT_FOUND';
}

async function inspectOutput(readArtifact, source, slot, receipt) {
  if (!receipt) return { status: 'missing', issues: slot.logs.some(log => log.outputReceiptIssue) ?
    ['产物引用回执无效'] : ['没有产物回执'], output: null };
  if (!receiptPattern.test(receipt.artifactRef) || !hashPattern.test(receipt.sha256))
    return { status: 'unknown', issues: ['产物引用或 SHA-256 回执无效'], output: null };
  if (typeof readArtifact !== 'function')
    return { status: 'unknown', issues: ['应用产物回读器不可用'], output: null };
  let raw;
  try {
    const returned = await readArtifact({ artifactRef: receipt.artifactRef,
      runId: source.runId, slotId: slot.slotId });
    raw = returned?.bytes ?? returned;
  } catch (error) {
    return { status: missingState(error) ? 'missing' : 'unknown',
      issues: [missingState(error) ? '产物文件缺失' : '产物回读结果不明'], output: null };
  }
  if (!Buffer.isBuffer(raw) && typeof raw !== 'string')
    return { status: 'unknown', issues: ['产物回读类型无效'], output: null };
  const bytes = Buffer.isBuffer(raw) ? raw : Buffer.from(raw, 'utf8');
  if (bytes.byteLength > NIGHT_V2_OUTPUT_MAX_BYTES)
    return { status: 'invalid', issues: ['产物超过 64 KiB 上限'], output: null };
  if (sha(bytes) !== receipt.sha256)
    return { status: 'unknown', issues: ['产物 SHA-256 与锁定回执不符'], output: null };
  let payload;
  try { payload = JSON.parse(bytes.toString('utf8')); }
  catch { return { status: 'invalid', issues: ['产物不是有效 JSON'], output: null }; }
  return validateNightV2Output({ ...slot, runId: source.runId }, payload);
}

function outcome(slot, inspected) {
  if (inspected.status === 'unknown' || ['unknown', 'preparing', 'running', 'paused'].includes(slot.status))
    return 'unknown';
  if (['pending', 'skipped'].includes(slot.status)) return 'not_started';
  if (inspected.status === 'invalid') return 'partial';
  if (slot.status === 'failed') return 'failed';
  if (inspected.status === 'missing') return slot.status === 'interrupted' &&
    /未知|不明|需查询/.test(slot.fromWhere ?? '') ? 'unknown' : 'partial';
  if (slot.status === 'completed' && inspected.output.acceptance.every(item => item.status === 'met'))
    return 'completed';
  return 'partial';
}

function publicReport(report) {
  const copy = clone(report);
  delete copy._fingerprint;
  delete copy._sourceHash;
  for (const slot of copy.slots) delete slot._outputReceipt;
  return copy;
}

function listing(report) {
  return { reportId: report.reportId, runId: report.runId, nightDate: report.nightDate,
    readyAt: report.readyAt, generatedAt: report.generatedAt, status: report.status,
    revision: report.revision, counts: clone(report.counts),
    quotaEstimatePercent: report.quotaEstimatePercent, decisionPending: true };
}

export function createNightV2Morning({ directory, readRunSource, readArtifact, clock = Date.now } = {}) {
  if (typeof directory !== 'string' || !directory || typeof readRunSource !== 'function')
    fail('INVALID_MORNING_SERVICE', '晨报需要独立记录目录与锁定夜巡读取器');
  directory = realpathSync(directory);
  const ledger = createLocalCapabilityState(directory, { folder: 'night-v2-morning', initial: blank(),
    validateValue: validateLedger, clock: () => new Date(clock()).getTime() });
  const now = () => { const date = new Date(clock());
    if (!Number.isFinite(date.getTime())) fail('INVALID_CLOCK', '晨报时间无效');
    return date; };
  const readLedger = async () => (await ledger.read()).value;
  const current = (state, runId) => [...state.reports].reverse().find(item => item.runId === runId);

  async function build(source, readyAt) {
    if (!Array.isArray(source.slots) || !hashPattern.test(source.planHash))
      fail('MORNING_SOURCE_INVALID', '锁定计划摘要无效');
    const slots = [];
    const newFindings = [];
    for (const slot of source.slots) {
      if (!validId(slot.slotId) || !Array.isArray(slot.acceptance) || !Array.isArray(slot.logs))
        fail('MORNING_SOURCE_INVALID', '锁定插槽摘要无效');
      const receipt = slotReceipt(slot);
      const inspected = await inspectOutput(readArtifact, source, slot, receipt);
      const status = outcome(slot, inspected);
      const acceptance = inspected.status === 'valid' ? inspected.output.acceptance.map(clone) :
        slot.acceptance.map(criterion => ({ criterion, status: 'unknown', evidence: '' }));
      slots.push({ slotId: slot.slotId, chipId: slot.chipId, chipRevision: slot.chipRevision,
        chip: clone(slot.chip), goal: slot.goal, status, outputKind: slot.outputKind,
        validation: { status: inspected.status, issues: clone(inspected.issues) },
        acceptance, summary: inspected.status === 'valid' ? inspected.output.summary : null,
        startedAt: slot.startedAt, endedAt: slot.endedAt, roundCount: slot.round,
        branch: slot.branch, lastGreenSha: slot.lastGreenSha, wipSha: slot.wipSha,
        firstFailure: clone(slot.firstFailure), fromWhere: slot.fromWhere,
        _outputReceipt: receipt ? clone(receipt) : null });
      if (inspected.status === 'valid' && inspected.output.kind === 'learning-report')
        for (const insight of inspected.output.content.insights)
          newFindings.push({ slotId: slot.slotId, text: insight.text,
            sourceCount: new Set(insight.sourceIds).size, verification: insight.verification });
    }
    const counts = { completed: 0, partial: 0, failed: 0, notStarted: 0, unknown: 0 };
    for (const slot of slots) counts[slot.status === 'not_started' ? 'notStarted' : slot.status] += 1;
    const status = counts.unknown > 0 ||
      ['announced', 'ready', 'running', 'paused', 'stopping', 'unknown'].includes(source.runStatus) ?
      'unknown' : 'ready';
    return { schema: 'night-v2-morning', reportId: `night-v2-morning-${source.runId}`,
      runId: source.runId, nightDate: source.nightDate, readyAt, generatedAt: null,
      revision: null, previousSha256: null, status, runStatus: source.runStatus,
      planHash: source.planHash, planRevision: source.planRevision,
      quotaEstimatePercent: source.quotaEstimatePercent, checks: clone(source.checks),
      stopRequestedAt: source.stopRequestedAt, counts, slots, newFindings,
      _fingerprint: null, _sourceHash: jsonHash(source) };
  }

  async function reconcile({ runId } = {}) {
    if (!validRunId(runId)) fail('RUN_NOT_FOUND', '晨报夜巡编号无效', 404);
    const source = await readRunSource({ runId });
    if (source?.runId !== runId) fail('MORNING_SOURCE_INVALID', '晨报来源夜巡编号不符');
    const readyAt = dueAt(source);
    if (now().getTime() < Date.parse(readyAt))
      return { schema: 'night-v2-morning-reconcile', runId, status: 'not_due', readyAt, revision: null };
    const report = await build(source, readyAt);
    report._fingerprint = jsonHash({ source, projection: report.slots.map(slot => ({
      slotId: slot.slotId, validation: slot.validation, status: slot.status,
      summary: slot.summary, acceptance: slot.acceptance })) });
    for (let attempt = 0; attempt < 3; attempt++) {
      const before = await ledger.read();
      const latest = current(before.value, runId);
      if (latest?.report._fingerprint === report._fingerprint)
        return { schema: 'night-v2-morning-reconcile', runId, status: latest.report.status,
          readyAt, revision: latest.revision };
      const revision = (latest?.revision ?? 0) + 1;
      const next = clone(before.value);
      const snapshot = { ...clone(report), revision, generatedAt: now().toISOString(),
        previousSha256: latest ? jsonHash(latest.report) : null };
      next.reports.push({ runId, revision, report: snapshot });
      if (next.reports.length > 300) next.reports.splice(0, next.reports.length - 300);
      try {
        await ledger.write(next, { expectedSha256: before.sha256, action: 'morning-reconcile',
          targetRef: runId });
        return { schema: 'night-v2-morning-reconcile', runId, status: snapshot.status,
          readyAt, revision };
      } catch (error) {
        if (!/已变化/.test(String(error.message)) || attempt === 2) throw error;
      }
    }
  }

  async function list() {
    const state = await readLedger();
    const latest = new Map();
    for (const item of state.reports) latest.set(item.runId, item.report);
    return { schema: 'night-v2-morning-list', items: [...latest.values()]
      .sort((a, b) => b.readyAt.localeCompare(a.readyAt)).map(listing) };
  }

  async function read({ runId } = {}) {
    if (!validRunId(runId)) fail('REPORT_NOT_FOUND', '晨报编号无效', 404);
    const item = current(await readLedger(), runId);
    if (!item) fail('REPORT_NOT_FOUND', '晨报尚未生成', 404);
    return publicReport(item.report);
  }

  async function output({ runId, slotId } = {}) {
    if (!validRunId(runId) || !validId(slotId)) fail('OUTPUT_NOT_FOUND', '产物编号无效', 404);
    const item = current(await readLedger(), runId);
    const projected = item?.report.slots.find(slot => slot.slotId === slotId);
    if (!projected) fail('OUTPUT_NOT_FOUND', '产物尚未生成', 404);
    if (projected.validation.status !== 'valid' || !projected._outputReceipt)
      return { schema: 'night-v2-output-view', runId, slotId,
        validation: clone(projected.validation), output: null };
    let source;
    try { source = await readRunSource({ runId }); }
    catch { return { schema: 'night-v2-output-view', runId, slotId,
      validation: { status: 'unknown', issues: ['锁定夜巡来源不可回读'] }, output: null }; }
    const slot = source?.slots?.find(row => row.slotId === slotId);
    if (!slot || source.planHash !== item.report.planHash ||
      jsonHash(source) !== item.report._sourceHash ||
      JSON.stringify(slotReceipt(slot)) !== JSON.stringify(projected._outputReceipt))
      return { schema: 'night-v2-output-view', runId, slotId,
        validation: { status: 'unknown', issues: ['锁定夜巡来源已变化'] }, output: null };
    const inspected = await inspectOutput(readArtifact, source, slot, projected._outputReceipt);
    return { schema: 'night-v2-output-view', runId, slotId,
      validation: { status: inspected.status, issues: inspected.issues },
      output: inspected.status === 'valid' ? inspected.output : null };
  }

  return { reconcile, list, read, output };
}
