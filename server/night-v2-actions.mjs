// 夜巡 v2 早上动作。只有注入的合成适配器可产生 Git/主库副作用；默认生产模式禁用。
import { createHash, randomUUID } from 'node:crypto';
import { realpathSync } from 'node:fs';
import { createLocalCapabilityState } from './local-capability-state.mjs';
import { nightV2Of } from '../src/night-v2-model.js';

const SCHEMA = 'night-v2-actions-ledger';
const ACTIONS = new Set(['merge', 'day', 'continue', 'discard']);
const TARGETS = new Set(['note', 'pending', 'knowledge']);
const SECTIONS = new Set(['learning', 'project', 'cognition']);
const FINISHED = new Set(['merged', 'dispatched', 'queued', 'discarded', 'saved',
  'preview_acknowledged', 'conflict', 'not_started']);
const SHA = /^[a-f0-9]{40}(?:[a-f0-9]{24})?$/;
const RUN_ID = /^[a-f0-9-]{36}$/;
const SLOT_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,99}$/;
const clone = value => structuredClone(value);
const digest = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const error = (code, message, status = 409) => { const e = new Error(message);
  e.code = code; e.status = status; throw e; };
const blank = () => ({ schema: SCHEMA, operations: [] });

function validateLedger(value) {
  if (!value || value.schema !== SCHEMA || !Array.isArray(value.operations) ||
    value.operations.length > 500 || value.operations.some(op =>
      !op || !RUN_ID.test(op.id) || !['action', 'suggestion'].includes(op.type) ||
      !['previewed', 'executing', 'unknown', ...FINISHED].includes(op.status) ||
      !op.lock || !RUN_ID.test(op.lock.runId) || !SLOT_ID.test(op.lock.slotId)))
    error('INVALID_ACTION_LEDGER', '夜巡早上动作记录无效', 503);
  return value;
}

function clockDate(clock) {
  const date = new Date(clock());
  if (!Number.isFinite(date.getTime())) error('INVALID_CLOCK', '夜巡早上动作时间无效');
  return date;
}

function pathIsSafe(value) {
  return typeof value === 'string' && value.length > 0 && value.length <= 500 &&
    !value.startsWith('/') && !value.split('/').some(part => !part || part === '.' || part === '..') &&
    !/[\x00-\x1f\x7f]/.test(value);
}

function normalizeFiles(value) {
  if (!Array.isArray(value) || value.length > 200) return null;
  const seen = new Set(), files = [];
  for (const file of value) {
    if (!file || Object.keys(file).sort().join('|') !== 'added|deleted|path|status' ||
      !pathIsSafe(file.path) || seen.has(file.path) ||
      !['added', 'modified', 'deleted', 'renamed'].includes(file.status) ||
      !Number.isSafeInteger(file.added) || file.added < 0 ||
      !Number.isSafeInteger(file.deleted) || file.deleted < 0) return null;
    seen.add(file.path); files.push(clone(file));
  }
  return files;
}

function decisionOf(op) {
  const result = op.result;
  return { schema: 'night-v2-action-result', operationId: op.id,
    action: op.type === 'action' ? op.lock.action : `suggestion:${op.lock.target}`,
    runId: op.lock.runId, slotId: op.lock.slotId,
    status: result?.status ?? (op.status === 'previewed' ? 'not_started' : op.status),
    at: result?.at ?? null,
    ...(result?.mergeSha ? { mergeSha: result.mergeSha } : {}),
    ...(result?.retainUntil ? { retainUntil: result.retainUntil } : {}),
    ...(result?.targetId ? { targetId: result.targetId } : {}) };
}

function previewOf(op) {
  const lock = op.lock;
  return { schema: 'night-v2-action-preview', operationId: op.id, token: op.token,
    action: lock.action, runId: lock.runId, slotId: lock.slotId,
    reportRevision: lock.reportRevision, sourceHash: lock.sourceHash,
    planHash: lock.planHash, projectId: lock.projectId, branch: lock.branch,
    lastGreenSha: lock.lastGreenSha, mainSha: lock.mainSha,
    branchSha: lock.branchSha, files: clone(lock.files), conflict: lock.conflict,
    expiresAt: op.expiresAt, canConfirm: lock.canConfirm, reason: lock.reason,
    backlog: clone(lock.backlog), replaceLastNightSlots: lock.replaceLastNightSlots === true };
}

function suggestionOf(op) {
  const lock = op.lock;
  return { schema: 'night-v2-suggestion-preview', operationId: op.id, token: op.token,
    runId: lock.runId, slotId: lock.slotId, target: lock.target,
    section: lock.section, index: lock.index, text: lock.text,
    expiresAt: op.expiresAt, canConfirm: lock.canConfirm,
    previewOnly: lock.target === 'knowledge', reason: lock.reason };
}

function sameSuggestion(left, right) {
  return left.runId === right.runId && left.slotId === right.slotId &&
    left.target === right.target && left.section === right.section &&
    left.index === right.index;
}

export function createNightV2Actions({ directory, morning, harness, repository,
  branchAdapter, clock = Date.now, executionMode = 'disabled',
  writeContinuation, writeSuggestion } = {}) {
  if (typeof directory !== 'string' || !directory || typeof morning?.read !== 'function' ||
    typeof morning?.output !== 'function' || typeof harness?.morningSource !== 'function')
    error('INVALID_ACTION_SERVICE', '夜巡早上动作缺少本机记录与锁定来源', 503);
  directory = realpathSync(directory);
  const ledger = createLocalCapabilityState(directory, { folder: 'night-v2-actions', initial: blank(),
    validateValue: validateLedger, clock: () => clockDate(clock).getTime() });
  const now = () => clockDate(clock);
  const read = async () => (await ledger.read()).value;
  const enabled = () => { if (executionMode !== 'synthetic')
    error('EXECUTION_DISABLED', '夜巡 v2 真实早上动作未获授权', 403); };
  const opById = (state, id) => state.operations.find(item => item.id === id);
  async function write(transform, action, targetRef = '') {
    for (let attempt = 0; attempt < 3; attempt++) {
      const prior = await ledger.read();
      const next = transform(clone(prior.value));
      try { return (await ledger.write(next, { expectedSha256: prior.sha256, action, targetRef })).value; }
      catch (e) { if (!/已变化/.test(String(e.message)) || attempt === 2) throw e; }
    }
  }

  async function locked(runId, slotId, expectedReportRevision) {
    if (!RUN_ID.test(runId ?? '') || !SLOT_ID.test(slotId ?? ''))
      error('SLOT_NOT_FOUND', '夜巡插槽编号无效', 404);
    let report;
    try { report = await morning.read({ runId }); }
    catch (e) { if (e.code === 'REPORT_NOT_FOUND') error('REPORT_NOT_FOUND', '晨报尚未生成', 404); throw e; }
    if (expectedReportRevision !== undefined && report.revision !== expectedReportRevision)
      error('REPORT_CHANGED', '晨报版本已变化，请重新预览');
    const reportSlot = report.slots?.find(item => item.slotId === slotId);
    if (!reportSlot) error('SLOT_NOT_FOUND', '晨报中找不到该插槽', 404);
    const source = await harness.morningSource({ runId });
    const slot = source.slots?.find(item => item.slotId === slotId);
    if (!slot || source.planHash !== report.planHash ||
      slot.chipId !== reportSlot.chipId || slot.chipRevision !== reportSlot.chipRevision ||
      slot.branch !== reportSlot.branch)
      error('SOURCE_CHANGED', '锁定夜巡来源与晨报不一致');
    return { report, reportSlot, source, slot, sourceHash: digest(source) };
  }

  async function sources() {
    if (typeof harness.listMorningSources !== 'function')
      error('SOURCES_UNAVAILABLE', '夜巡跨夜锁定来源不可回读，不能判断分支积压', 503);
    const value = await harness.listMorningSources();
    const items = Array.isArray(value) ? value : value?.items;
    if (!Array.isArray(items)) error('SOURCES_UNAVAILABLE', '夜巡跨夜来源结果无效', 503);
    return items;
  }

  async function countUnresolvedBranches({ projectId } = {}) {
    if (typeof projectId !== 'string' || !/^[A-Za-z0-9_-]{1,100}$/.test(projectId))
      error('PROJECT_INVALID', '项目编号无效', 400);
    const [all, state] = await Promise.all([sources(), read()]);
    const latestByBranch = new Map();
    for (const source of all) {
      for (const slot of source?.slots ?? []) {
        if (slot.projectId !== projectId || !slot.branch) continue;
        // 续跑沿原 branch 跨夜出现多次；积压按物理分支计，不按运行次数计。
        const key = `${projectId}:${slot.branch}`;
        const prior = latestByBranch.get(key);
        const observedAt = Date.parse(slot.endedAt ?? slot.startedAt ?? '');
        if (!prior || source.nightDate > prior.nightDate ||
          (source.nightDate === prior.nightDate && observedAt > prior.observedAt))
          latestByBranch.set(key, { nightDate: source.nightDate, observedAt,
            runId: source.runId, slotId: slot.slotId, branch: slot.branch });
      }
    }
    let count = 0;
    for (const latest of latestByBranch.values()) {
      const settled = state.operations.some(op => op.type === 'action' &&
        op.lock.projectId === projectId && op.lock.branch === latest.branch &&
        ['merged', 'discarded'].includes(op.result?.status) &&
        ((op.lock.runId === latest.runId && op.lock.slotId === latest.slotId) ||
          (Number.isFinite(latest.observedAt) &&
            Date.parse(op.result.at ?? '') >= latest.observedAt)));
      if (!settled) count++;
    }
    return count;
  }

  async function inspectBranch(source, slot, action) {
    if (!slot.branch || typeof branchAdapter?.inspect !== 'function')
      return { status: 'unknown', reason: '分支或只读 Git 检查器不可用' };
    let value;
    try { value = await branchAdapter.inspect({ runId: source.runId, slotId: slot.slotId,
      projectId: slot.projectId, branch: slot.branch, lastGreenSha: slot.lastGreenSha, action }); }
    catch { return { status: 'unknown', reason: '分支身份与冲突检查结果不明' }; }
    const files = normalizeFiles(value?.changedFiles);
    if (!value || value.projectId !== slot.projectId || value.branch !== slot.branch ||
      !SHA.test(value.mainSha) || !SHA.test(value.branchSha) || !files ||
      !['clean', 'conflict', 'unknown'].includes(value.conflict))
      return { status: 'unknown', reason: '分支身份、文件清单或冲突回执无效' };
    let mainPath = null, worktreePath = null;
    if (typeof value.mainPath === 'string' && typeof value.worktreePath === 'string') {
      try { mainPath = realpathSync(value.mainPath); worktreePath = realpathSync(value.worktreePath); }
      catch { return { status: 'unknown', reason: '主检出或隔离 worktree 路径不可回读' }; }
    }
    if (['merge', 'continue', 'discard'].includes(action) &&
      (!mainPath || !worktreePath || mainPath === worktreePath ||
      worktreePath.startsWith(`${mainPath}/`) || mainPath.startsWith(`${worktreePath}/`) ||
      worktreePath === directory || worktreePath === realpathSync(process.cwd())))
      return { status: 'unknown', reason: '无法证明操作目标是独立 worktree' };
    return { status: 'ok', mainSha: value.mainSha, branchSha: value.branchSha,
      files, conflict: value.conflict, mainPath, worktreePath,
      containsGreen: value.containsGreen === true };
  }

  async function continuationPlan(slot, source) {
    if (typeof repository?.read !== 'function')
      return { valid: false, reason: '当前夜巡计划不可回读', revision: null };
    let state, plan;
    try { state = await repository.read(); plan = nightV2Of(state); }
    catch { return { valid: false, reason: '当前夜巡计划不可回读', revision: null }; }
    const replacesLastNight = plan.revision === source.planRevision &&
      plan.slots.length === source.slots.length && plan.slots.every((current, index) => {
        const prior = source.slots[index];
        return current.id === prior.slotId && current.chipId === prior.chipId &&
          current.chipRevision === prior.chipRevision &&
          current.projectId === prior.projectId && current.goal === prior.goal &&
          JSON.stringify(current.acceptance) === JSON.stringify(prior.acceptance);
      });
    if (!replacesLastNight && plan.slots.length >= 4)
      return { valid: false, reason: '今晚四个插槽已满', revision: plan.revision,
        replacesLastNight: false };
    const chip = plan.chips.find(item => item.id === slot.chipId);
    if (!chip) return { valid: false, reason: '原芯片类型已不可用', revision: plan.revision };
    if (chip.canEditCode && !slot.projectId)
      return { valid: false, reason: '代码芯片缺少锁定项目 ID', revision: plan.revision };
    const projects = [...(state?.connections?.projects ?? []), ...(state?.projects ?? [])];
    if (slot.projectId && projects.length && !projects.some(item => item.id === slot.projectId))
      return { valid: false, reason: '原项目 ID 已不在当前工作台', revision: plan.revision };
    return { valid: true, reason: null, revision: plan.revision, replacesLastNight };
  }

  async function preview({ runId, slotId, action, expectedReportRevision } = {}) {
    if (!ACTIONS.has(action)) error('ACTION_INVALID', '早上动作无效', 400);
    const { report, reportSlot, source, slot, sourceHash } = await locked(
      runId, slotId, expectedReportRevision);
    const backlogCount = slot.projectId ? await countUnresolvedBranches({ projectId: slot.projectId }) : 0;
    const backlog = { projectId: slot.projectId, count: backlogCount, blocked: backlogCount >= 3 };
    const state = await read();
    if (state.operations.some(op => op.type === 'action' && op.lock.runId === runId &&
      op.lock.slotId === slotId && ['executing', 'unknown'].includes(op.status)))
      error('ACTION_UNKNOWN', '该插槽已有结果不明的操作，请先查询');
    const terminalDecision = state.operations.find(op => op.type === 'action' &&
      op.lock.runId === runId && op.lock.slotId === slotId &&
      (['merged', 'discarded'].includes(op.result?.status) ||
        (action === 'continue' && op.result?.status === 'queued')));
    if (terminalDecision) error('ALREADY_DECIDED', '该分支已处理或已有续跑槽，不能重复操作');
    const branchCheck = slot.branch ? await inspectBranch(source, slot, action) :
      { status: 'unknown', reason: '该插槽没有可核查的本地分支' };
    let canConfirm = true, reason = null;
    if (action !== 'day' && branchCheck.status !== 'ok') {
      canConfirm = false; reason = branchCheck.reason;
    }
    if (action === 'merge') {
      const output = await morning.output({ runId, slotId });
      if (reportSlot.status !== 'completed' || reportSlot.validation?.status !== 'valid' ||
        output.validation?.status !== 'valid' || !slot.lastGreenSha ||
        !['branch-delivery', 'custom-branch'].includes(output.output?.kind)) {
        canConfirm = false; reason = '分支未完成逐条验收或产物无法可靠回读';
      } else if (branchCheck.status === 'ok') {
        const reported = output.output.content.changedFiles.map(item => item.path).sort();
        const actual = branchCheck.files.map(item => item.path).sort();
        if (branchCheck.branchSha !== slot.lastGreenSha) {
          canConfirm = false; reason = '分支顶端不是最后绿提交，不能把未验收 WIP 合入 main';
        } else if (JSON.stringify(reported) !== JSON.stringify(actual)) {
          canConfirm = false; reason = '实际改动文件与交付产物不一致';
        }
      }
    }
    const plan = action === 'continue' ? await continuationPlan(slot, source) : null;
    if (action === 'continue' && (!slot.lastGreenSha || !plan.valid ||
      branchCheck.containsGreen !== true ||
      (slot.chipId === 'push' && backlog.blocked) || typeof writeContinuation !== 'function')) {
      canConfirm = false;
      reason = backlog.blocked && slot.chipId === 'push' ? '同项目未决分支达到 3 个，暂缓继续跑项目' :
        !plan.valid ? plan.reason : '最后绿提交不可达或续跑写入器不可用';
    }
    if (action === 'discard' && branchCheck.status === 'ok' && !branchCheck.worktreePath) {
      canConfirm = false; reason = '待删除 worktree 路径未核实';
    }
    if (action === 'merge' && branchCheck.status === 'ok' && branchCheck.conflict !== 'clean') {
      canConfirm = false; reason = branchCheck.conflict === 'conflict' ?
        '与 main 存在冲突，请派白天交 Codex 处理' : '与 main 的冲突检查未知';
    }
    if (action === 'day' && state.operations.some(op => op.type === 'action' &&
      op.lock.runId === runId && op.lock.slotId === slotId && op.result?.status === 'dispatched')) {
      canConfirm = false; reason = '已生成白天派单，可在动作回执中回读';
    }
    if (executionMode !== 'synthetic') {
      canConfirm = false; reason = '真实晨间操作尚未授权';
    }
    const operation = { id: randomUUID(), type: 'action', status: 'previewed', token: randomUUID(),
      createdAt: now().toISOString(), expiresAt: new Date(now().getTime() + 10 * 60_000).toISOString(),
      startedAt: null, result: null,
      lock: { action, runId, slotId, reportRevision: report.revision,
        sourceHash, planHash: source.planHash, projectId: slot.projectId,
        chipId: slot.chipId, goal: slot.goal, acceptance: clone(slot.acceptance),
        branch: slot.branch, lastGreenSha: slot.lastGreenSha,
        mainSha: branchCheck.mainSha ?? null, branchSha: branchCheck.branchSha ?? null,
        mainPath: branchCheck.mainPath ?? null, worktreePath: branchCheck.worktreePath ?? null,
        files: branchCheck.files ?? [], conflict: branchCheck.conflict ?? 'unknown',
        containsGreen: branchCheck.containsGreen ?? false,
        canConfirm, reason, backlog, continuationPlanRevision: plan?.revision ?? null,
        sourcePlanRevision: source.planRevision,
        replaceLastNightSlots: plan?.replacesLastNight === true } };
    if (action === 'day' && !slot.branch) operation.lock.conflict = 'not_applicable';
    await write(value => { value.operations.push(operation); return value; }, 'action-preview', operation.id);
    return previewOf(operation);
  }

  async function assertFresh(op) {
    if (now() >= new Date(op.expiresAt)) error('PREVIEW_EXPIRED', '预览已过期，请重新预览');
    const { report, source, slot, sourceHash } = await locked(op.lock.runId, op.lock.slotId,
      op.lock.reportRevision);
    if (sourceHash !== op.lock.sourceHash || source.planHash !== op.lock.planHash ||
      slot.projectId !== op.lock.projectId || slot.branch !== op.lock.branch ||
      slot.lastGreenSha !== op.lock.lastGreenSha)
      error('SOURCE_CHANGED', '夜巡锁定来源已变化，请重新预览');
    if (op.lock.action !== 'day') {
      const current = await inspectBranch(source, slot, op.lock.action);
      if (current.status !== 'ok' || current.branchSha !== op.lock.branchSha ||
        current.mainPath !== op.lock.mainPath ||
        current.worktreePath !== op.lock.worktreePath ||
        JSON.stringify(current.files) !== JSON.stringify(op.lock.files) ||
        (op.lock.action === 'merge' && (current.mainSha !== op.lock.mainSha ||
          current.conflict !== op.lock.conflict)) ||
        (op.lock.action === 'continue' && current.containsGreen !== true))
        error('BRANCH_CHANGED', '分支、主线、文件集或冲突状态已变化，请重新预览');
    }
    if (op.lock.action === 'continue' && op.lock.chipId === 'push' &&
      await countUnresolvedBranches({ projectId: op.lock.projectId }) >= 3)
      error('BACKLOG_BLOCKED', '同项目未决分支达到 3 个，暂缓继续跑项目');
    if (op.lock.action === 'continue') {
      const plan = await continuationPlan(slot, source);
      if (!plan.valid || plan.revision !== op.lock.continuationPlanRevision ||
        plan.replacesLastNight !== op.lock.replaceLastNightSlots)
        error('PLAN_CHANGED', '当前夜巡计划或插槽容量已变化，请重新预览');
    }
    return { report, source, slot };
  }

  async function claim(opId, token, type) {
    for (let attempt = 0; attempt < 3; attempt++) {
      const before = await ledger.read();
      const op = opById(before.value, opId);
      if (!op || op.type !== type) error('ACTION_NOT_FOUND', '早上动作编号不存在', 404);
      if (op.token !== token) error('CONFIRM_REQUIRED', '确认令牌不匹配');
      if (op.status !== 'previewed') return { claimed: false, op };
      if (type === 'action' && before.value.operations.some(other => other.id !== opId &&
        other.type === 'action' && other.lock.runId === op.lock.runId &&
        other.lock.slotId === op.lock.slotId &&
        (['executing', 'unknown'].includes(other.status) ||
          ['merged', 'discarded'].includes(other.result?.status) ||
          (op.lock.action === 'continue' && other.result?.status === 'queued') ||
          (op.lock.action === 'day' && other.result?.status === 'dispatched'))))
        error('ALREADY_DECIDED', '该分支已有其他早上动作，请先回读');
      if (type === 'suggestion' && before.value.operations.some(other => other.id !== opId &&
        other.type === 'suggestion' && sameSuggestion(other.lock, op.lock) &&
        (['executing', 'unknown'].includes(other.status) ||
          ['saved', 'preview_acknowledged'].includes(other.result?.status))))
        error('ALREADY_DECIDED', '同一建议已在写入或已保存，请先回读');
      if (!op.lock.canConfirm) error('ACTION_BLOCKED', op.lock.reason || '此动作不能确认');
      if (now() >= new Date(op.expiresAt)) error('PREVIEW_EXPIRED', '预览已过期');
      const next = clone(before.value);
      const target = opById(next, opId);
      target.status = 'executing'; target.startedAt = now().toISOString();
      if (target.lock.action === 'discard')
        target.lock.retainUntil = new Date(Date.parse(target.startedAt) + 7 * 86400_000).toISOString();
      try {
        await ledger.write(next, { expectedSha256: before.sha256, action: 'action-start', targetRef: opId });
        return { claimed: true, op: target };
      } catch (e) {
        if (!/已变化/.test(String(e.message)) || attempt === 2) throw e;
      }
    }
  }

  async function finish(opId, result) {
    const state = await write(value => {
      const op = opById(value, opId);
      if (!op) error('ACTION_NOT_FOUND', '早上动作编号不存在', 404);
      if (FINISHED.has(op.status)) return value;
      op.status = result.status;
      op.result = { ...result, at: now().toISOString() };
      return value;
    }, 'action-result', opId);
    return decisionOf(opById(state, opId));
  }

  async function markUnknown(opId) {
    const state = await write(value => {
      const op = opById(value, opId);
      if (op && !FINISHED.has(op.status)) op.status = 'unknown';
      return value;
    }, 'action-unknown', opId);
    return decisionOf(opById(state, opId));
  }

  async function confirm({ operationId, token, confirmed } = {}) {
    if (confirmed !== true) error('CONFIRM_REQUIRED', '需明确确认早上动作');
    enabled();
    const existing = opById(await read(), operationId);
    if (!existing || existing.type !== 'action') error('ACTION_NOT_FOUND', '早上动作编号不存在', 404);
    if (existing.token !== token) error('CONFIRM_REQUIRED', '确认令牌不匹配');
    if (existing.status !== 'previewed') return decisionOf(existing);
    await assertFresh(existing);
    const claimed = await claim(operationId, token, 'action');
    if (!claimed.claimed) return decisionOf(claimed.op);
    const op = claimed.op, lock = op.lock;
    if (lock.action === 'day') return finish(operationId, { status: 'dispatched',
      targetId: `night-day-${digest([lock.runId, lock.slotId]).slice(0, 20)}` });
    if (lock.action === 'continue') {
      try {
        await writeContinuation({ phase: 'apply', operationId, source: clone(lock),
          newSlotId: `resume-${digest([lock.runId, lock.slotId]).slice(0, 24)}` });
      } catch { return markUnknown(operationId); }
      return query({ operationId });
    }
    if (lock.action === 'merge') {
      if (typeof branchAdapter?.merge !== 'function') return markUnknown(operationId);
      try { await branchAdapter.merge({ operationId, branch: lock.branch,
        expectedMainSha: lock.mainSha, expectedBranchSha: lock.branchSha,
        projectId: lock.projectId, runId: lock.runId, slotId: lock.slotId }); }
      catch { return markUnknown(operationId); }
      return query({ operationId });
    }
    if (typeof branchAdapter?.removeWorktree !== 'function') return markUnknown(operationId);
    try { await branchAdapter.removeWorktree({ operationId, branch: lock.branch,
      path: lock.worktreePath, projectId: lock.projectId, runId: lock.runId, slotId: lock.slotId }); }
    catch { return markUnknown(operationId); }
    return query({ operationId });
  }

  async function query({ operationId } = {}) {
    const op = opById(await read(), operationId);
    if (!op || op.type !== 'action') error('ACTION_NOT_FOUND', '早上动作编号不存在', 404);
    if (FINISHED.has(op.status) || op.status === 'previewed') return decisionOf(op);
    if (op.lock.action === 'day') return finish(operationId, { status: 'dispatched',
      targetId: `night-day-${digest([op.lock.runId, op.lock.slotId]).slice(0, 20)}` });
    if (op.lock.action === 'continue') {
      if (typeof writeContinuation !== 'function') return markUnknown(operationId);
      let value;
      try { value = await writeContinuation({ phase: 'query', operationId,
        source: clone(op.lock), newSlotId: `resume-${digest([op.lock.runId, op.lock.slotId]).slice(0, 24)}` }); }
      catch { return markUnknown(operationId); }
      if (value?.status === 'queued' && typeof value.targetId === 'string')
        return finish(operationId, { status: 'queued', targetId: value.targetId });
      if (value?.status === 'not_started') return finish(operationId, { status: 'not_started' });
      return markUnknown(operationId);
    }
    if (typeof branchAdapter?.query !== 'function') return markUnknown(operationId);
    let value;
    try { value = await branchAdapter.query({ operationId, action: op.lock.action,
      branch: op.lock.branch, projectId: op.lock.projectId }); }
    catch { return markUnknown(operationId); }
    if (op.lock.action === 'merge' && value?.status === 'merged' && SHA.test(value.mergeSha))
      return finish(operationId, { status: 'merged', mergeSha: value.mergeSha });
    if (op.lock.action === 'merge' && value?.status === 'conflict')
      return finish(operationId, { status: 'conflict' });
    if (op.lock.action === 'discard' && value?.status === 'discarded' &&
      value.worktreeExists === false && value.branchExists === true)
      return finish(operationId, { status: 'discarded', retainUntil: op.lock.retainUntil });
    if (value?.status === 'not_started') return finish(operationId, { status: 'not_started' });
    return markUnknown(operationId);
  }

  async function decisions({ runId } = {}) {
    if (runId !== undefined && !RUN_ID.test(runId)) error('RUN_NOT_FOUND', '夜巡编号无效', 404);
    const [state, all] = await Promise.all([read(), sources()]);
    const items = state.operations.filter(op => op.type === 'action' &&
      (!runId || op.lock.runId === runId) && op.status !== 'previewed').map(op => ({
      runId: op.lock.runId, slotId: op.lock.slotId, action: op.lock.action,
      status: decisionOf(op).status, operationId: op.id, at: op.result?.at ?? op.startedAt,
      ...(op.result?.retainUntil ? { retainUntil: op.result.retainUntil } : {}) }));
    const projects = [...new Set(all.flatMap(source => source.slots?.map(slot => slot.projectId) ?? [])
      .filter(Boolean))];
    const backlog = [];
    for (const projectId of projects) {
      const count = await countUnresolvedBranches({ projectId });
      backlog.push({ projectId, count, blocked: count >= 3 });
    }
    return { schema: 'night-v2-decisions', items, backlog };
  }

  async function suggestionPreview({ runId, slotId, target, section, index } = {}) {
    if (!TARGETS.has(target) || !SECTIONS.has(section) || !Number.isSafeInteger(index) || index < 0)
      error('SUGGESTION_INVALID', '请选择有效的学习建议与目标', 400);
    const { report, source, sourceHash } = await locked(runId, slotId);
    const output = await morning.output({ runId, slotId });
    if (output.validation?.status !== 'valid' || output.output?.kind !== 'learning-report')
      error('SUGGESTION_UNAVAILABLE', '学习产物无法可靠回读');
    const text = output.output.content.suggestions?.[section]?.[index];
    if (typeof text !== 'string' || !text.trim())
      error('SUGGESTION_NOT_FOUND', '学习建议不存在', 404);
    if ((await read()).operations.some(op => op.type === 'suggestion' &&
      sameSuggestion(op.lock, { runId, slotId, target, section, index }) &&
      (['executing', 'unknown'].includes(op.status) ||
        ['saved', 'preview_acknowledged'].includes(op.result?.status))))
      error('ALREADY_DECIDED', '同一建议已在写入或已保存，请先回读');
    const operation = { id: randomUUID(), type: 'suggestion', status: 'previewed', token: randomUUID(),
      createdAt: now().toISOString(), expiresAt: new Date(now().getTime() + 10 * 60_000).toISOString(),
      startedAt: null, result: null,
      lock: { runId, slotId, target, section, index, text, reportRevision: report.revision,
        sourceHash, planHash: source.planHash, outputHash: digest(output.output),
        canConfirm: target === 'knowledge' || executionMode === 'synthetic',
        reason: target === 'knowledge' ? '仅确认已预览，不写入知识仓库' :
          executionMode === 'synthetic' ? null : '真实晨间操作尚未授权' } };
    await write(value => { value.operations.push(operation); return value; }, 'suggestion-preview', operation.id);
    return suggestionOf(operation);
  }

  async function suggestionConfirm({ operationId, token, confirmed } = {}) {
    if (confirmed !== true) error('CONFIRM_REQUIRED', '需明确确认建议转写');
    const op = opById(await read(), operationId);
    if (!op || op.type !== 'suggestion') error('ACTION_NOT_FOUND', '建议转写编号不存在', 404);
    if (op.token !== token) error('CONFIRM_REQUIRED', '确认令牌不匹配');
    if (op.status !== 'previewed') return decisionOf(op);
    if (op.lock.target !== 'knowledge') {
      enabled();
      if (typeof writeSuggestion !== 'function') error('SUGGESTION_UNAVAILABLE', '本机建议写入器不可用');
    }
    const { report, sourceHash } = await locked(op.lock.runId, op.lock.slotId, op.lock.reportRevision);
    const output = await morning.output({ runId: op.lock.runId, slotId: op.lock.slotId });
    if (report.revision !== op.lock.reportRevision || sourceHash !== op.lock.sourceHash ||
      output.validation?.status !== 'valid' || digest(output.output) !== op.lock.outputHash)
      error('SOURCE_CHANGED', '建议或晨报来源已变化，请重新预览');
    const claimed = await claim(operationId, token, 'suggestion');
    if (!claimed.claimed) return decisionOf(claimed.op);
    if (claimed.op.lock.target === 'knowledge')
      return finish(operationId, { status: 'preview_acknowledged' });
    try { await writeSuggestion({ phase: 'apply', operationId, source: clone(claimed.op.lock),
      target: claimed.op.lock.target, text: claimed.op.lock.text }); }
    catch { return markUnknown(operationId); }
    return suggestionQuery({ operationId });
  }

  async function suggestionQuery({ operationId } = {}) {
    const op = opById(await read(), operationId);
    if (!op || op.type !== 'suggestion') error('ACTION_NOT_FOUND', '建议转写编号不存在', 404);
    if (FINISHED.has(op.status) || op.status === 'previewed') return decisionOf(op);
    if (typeof writeSuggestion !== 'function') return markUnknown(operationId);
    let value;
    try { value = await writeSuggestion({ phase: 'query', operationId,
      source: clone(op.lock), target: op.lock.target, text: op.lock.text }); }
    catch { return markUnknown(operationId); }
    if (value?.status === 'saved' && typeof value.targetId === 'string')
      return finish(operationId, { status: 'saved', targetId: value.targetId });
    if (value?.status === 'not_started') return finish(operationId, { status: 'not_started' });
    return markUnknown(operationId);
  }

  return { preview, confirm, query, decisions, countUnresolvedBranches,
    suggestionPreview, suggestionConfirm, suggestionQuery };
}
