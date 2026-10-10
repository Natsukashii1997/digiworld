// 夜巡 v2 的独立服务端编排。所有宿主动作都必须通过显式注入的合成适配器。
import { createHash, randomUUID } from 'node:crypto';
import { realpathSync } from 'node:fs';
import { nightV2Of } from '../src/night-v2-model.js';
import { createLocalCapabilityState } from './local-capability-state.mjs';

const SCHEMA = 'night-v2-ledger';
const STATUS_SCHEMA = 'night-v2-status';
const CHECK_IDS = ['power', 'disk', 'quota', 'backlog', 'worktree', 'executor'];
const GLOBAL_CHECKS = new Set(['power', 'disk', 'quota']);
const terminal = new Set(['completed', 'stopped', 'interrupted', 'global-redline']);
const clone = value => structuredClone(value);
const fail = (code, message) => { const error = new Error(message); error.code = code;
  error.status = code === 'EXECUTION_DISABLED' ? 403 : code === 'RUN_NOT_FOUND' ? 404 : 409; throw error; };
const iso = value => new Date(value).toISOString();
const stable = value => Array.isArray(value) ? value.map(stable) : value && typeof value === 'object' ?
  Object.fromEntries(Object.keys(value).sort().map(key => [key, stable(value[key])])) : value;
const hash = value => createHash('sha256').update(JSON.stringify(stable(value))).digest('hex');
const blank = () => ({ schema: SCHEMA, preview: null, approval: null, run: null, history: [] });
const datePattern = /^\d{4}-\d{2}-\d{2}$/;
const branchFor = (nightDate, slot) => slot.continueFrom?.branch ?? `night/${nightDate}-${slot.chipId.toLowerCase()
  .replace(/[^a-z0-9-]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '').slice(0, 24) || 'chip'}-${hash(slot.id ?? slot.slotId).slice(0, 10)}`;
const receiptRefPattern = /^night-v2-artifact:[A-Za-z0-9._-]{1,96}$/;
const sha256Pattern = /^[a-f0-9]{64}$/;

function validateLedger(value) {
  if (!value || value.schema !== SCHEMA || !Array.isArray(value.history) || value.history.length > 400 ||
    !Object.hasOwn(value, 'preview') || !Object.hasOwn(value, 'approval') || !Object.hasOwn(value, 'run'))
    fail('INVALID_LEDGER', '夜巡 v2 本机执行记录无效');
  return value;
}

function clockDate(clock) {
  const value = typeof clock === 'function' ? clock() : Date.now();
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) fail('INVALID_CLOCK', '夜巡时间无效');
  return date;
}

function shanghaiDate(date) {
  return new Date(date.getTime() + 8 * 3600_000).toISOString().slice(0, 10);
}

function windowTimes(nightDate, window) {
  const midnight = datePattern.test(nightDate) ? new Date(`${nightDate}T00:00:00+08:00`) : new Date(NaN);
  if (Number.isNaN(midnight.getTime()) || shanghaiDate(midnight) !== nightDate)
    fail('INVALID_NIGHT_DATE', '夜巡日期无效');
  const start = new Date(`${nightDate}T${window.start}:00+08:00`);
  let end = new Date(`${nightDate}T${window.end}:00+08:00`);
  if (end <= start) end = new Date(end.getTime() + 86400_000);
  return { start, end, announce: new Date(start.getTime() - 3600_000),
    preflight: new Date(start.getTime() - 5 * 60_000),
    recheckUntil: new Date(start.getTime() + 30 * 60_000),
    noNewSlot: new Date(end.getTime() - 30 * 60_000) };
}

function publicStatus(run, planRevision, now) {
  if (!run) return { schema: STATUS_SCHEMA, runId: null, nightDate: null, status: 'planning',
    planRevision, serverNow: now.toISOString(), recheckUntil: null, canRecheck: false,
    checks: { passed: 0, total: 0, items: [] }, currentSlotId: null, slots: [],
    quotaEstimatePercent: null, stopRequestedAt: null };
  return { schema: STATUS_SCHEMA, runId: run.id, nightDate: run.nightDate, status: run.status,
    planRevision: run.planRevision, serverNow: now.toISOString(), recheckUntil: run.recheckUntil,
    canRecheck: run.status === 'blocked' && now.getTime() < Date.parse(run.recheckUntil),
    checks: clone(run.checks), currentSlotId: run.currentSlotId,
    slots: run.slots.map(slot => ({ slotId: slot.slotId, chipId: slot.chipId, status: slot.status,
      round: slot.round, maxRounds: slot.maxRounds, startedAt: slot.startedAt, endedAt: slot.endedAt })),
    quotaEstimatePercent: run.quotaEstimatePercent, stopRequestedAt: run.stopRequestedAt };
}

function lockedSlot(plan, slot) {
  const chip = plan.chips.find(item => item.id === slot.chipId);
  const revision = chip?.templateHistory.find(item => item.revision === slot.chipRevision);
  if (!revision) fail('TEMPLATE_MISSING', '夜巡芯片锁定版本不存在');
  return { ...clone(slot), template: clone(revision.snapshot), code: chip.code,
    maxRounds: slot.brakeOverrides?.maxRounds ?? revision.snapshot.brake.maxRounds,
    maxMinutes: slot.brakeOverrides?.maxMinutes ?? revision.snapshot.brake.maxMinutes };
}

function newRun(approval, nightDate, now) {
  const times = windowTimes(nightDate, approval.plan.window);
  return { id: randomUUID(), nightDate, status: 'announced', planRevision: approval.planRevision,
    planHash: approval.planHash, createdAt: now.toISOString(), announcedAt: null,
    recheckUntil: times.recheckUntil.toISOString(), checks: { passed: 0, total: 0, items: [] },
    currentSlotId: null, quotaEstimatePercent: null, stopRequestedAt: null, rateLimitUntil: null,
    slots: approval.plan.slots.map(slot => ({ slotId: slot.id, chipId: slot.chipId,
      status: 'pending', round: 0, maxRounds: slot.maxRounds, maxMinutes: slot.maxMinutes,
      startedAt: null, endedAt: null, worktree: null,
      lastGreenSha: slot.continueFrom?.lastGreenSha ?? null, wipSha: null,
      consecutiveFailures: 0, lastFingerprint: null, unchangedRounds: 0,
      roundInFlight: false, prepareInFlight: false, firstFailure: null, logs: [], fromWhere: null })) };
}

function morningSourceOf(run, approval) {
  if (!run || !approval || run.planHash !== approval.planHash)
    fail('MORNING_SOURCE_UNKNOWN', '夜巡锁定计划或执行记录不可回读');
  return { schema: 'night-v2-morning-source', runId: run.id, nightDate: run.nightDate,
    runStatus: run.status, planHash: run.planHash, planRevision: run.planRevision,
    window: clone(approval.plan.window), quotaEstimatePercent: run.quotaEstimatePercent,
    checks: { passed: run.checks.passed, total: run.checks.total },
    stopRequestedAt: run.stopRequestedAt,
    slots: run.slots.map(slot => {
      const locked = approval.plan.slots.find(item => item.id === slot.slotId);
      if (!locked) fail('MORNING_SOURCE_UNKNOWN', '夜巡锁定插槽不可回读');
      return { slotId: slot.slotId, chipId: slot.chipId,
        chipRevision: locked.chipRevision, projectId: locked.projectId,
        chip: { id: locked.chipId, code: locked.code, name: locked.template.name,
          color: locked.template.color, icon: locked.template.icon,
          output: locked.template.output, executor: locked.executor, reviewer: locked.reviewer },
        goal: locked.goal, acceptance: clone(locked.acceptance), outputKind: locked.template.output,
        status: slot.status, round: slot.round, maxRounds: slot.maxRounds,
        startedAt: slot.startedAt, endedAt: slot.endedAt,
        branch: slot.worktree?.branch ?? null, lastGreenSha: slot.lastGreenSha,
        wipSha: slot.wipSha, firstFailure: clone(slot.firstFailure), fromWhere: slot.fromWhere,
        logs: slot.logs.map(log => ({ round: log.round, at: log.at, status: log.status,
          reason: log.reason, acceptanceMet: log.acceptanceMet,
          greenSha: log.greenSha, wipSha: log.wipSha,
          outputReceipt: clone(log.outputReceipt ?? null),
          outputReceiptIssue: log.outputReceiptIssue ?? null })) };
    }) };
}

function archiveRun(value) {
  if (!value.run || !terminal.has(value.run.status) ||
    value.history.some(item => item.runId === value.run.id)) return;
  if (value.history.length >= 400)
    fail('HISTORY_LIMIT', '夜巡历史已达容量上限，需先安全归档，不能静默丢弃旧来源');
  value.history.push({ nightDate: value.run.nightDate, runId: value.run.id,
    status: value.run.status, planHash: value.run.planHash,
    source: morningSourceOf(value.run, value.approval) });
}

function sanitizedResult(result) {
  if (!result || !['verified', 'failed', 'rate_limited', 'redline_task', 'redline_global', 'unknown'].includes(result.status))
    fail('INVALID_EXECUTOR_RESULT', '合成执行者结果无效，不能推断成功');
  const short = value => typeof value === 'string' ? value.slice(0, 500) : null;
  const receipt = result.outputReceipt;
  const validReceipt = receipt && Object.keys(receipt).sort().join('|') === 'artifactRef|sha256' &&
    receiptRefPattern.test(receipt.artifactRef) && sha256Pattern.test(receipt.sha256);
  return { status: result.status, diffSha256: short(result.diffSha256),
    testSha256: short(result.testSha256), acceptanceMet: result.acceptanceMet === true,
    minutes: Number.isFinite(result.minutes) && result.minutes >= 0 ? result.minutes : 0,
    rateLimitUntil: result.rateLimitUntil && Number.isFinite(Date.parse(result.rateLimitUntil)) ?
      iso(result.rateLimitUntil) : null, reason: short(result.reason),
    greenSha: short(result.greenSha), wipSha: short(result.wipSha),
    outputReceipt: validReceipt ? { artifactRef: receipt.artifactRef, sha256: receipt.sha256 } : null,
    outputReceiptIssue: receipt && !validReceipt ? '产物引用或 SHA-256 回执无效' : null };
}

export function createNightV2Harness({ directory, readWorkspace, clock = Date.now, preflight,
  worktrees, executeRound, quota, notify, probeProcess, executionMode = 'disabled',
  deadlinePollMs = 1000, countUnresolvedBranches, verifyContinuation } = {}) {
  if (typeof directory !== 'string' || !directory || typeof readWorkspace !== 'function')
    fail('INVALID_HARNESS', '夜巡 v2 需要独立记录目录与工作台读取器');
  if (!Number.isSafeInteger(deadlinePollMs) || deadlinePollMs < 1 || deadlinePollMs > 60_000)
    fail('INVALID_HARNESS', '夜巡 watchdog 检查间隔无效');
  directory = realpathSync(directory);
  const ledger = createLocalCapabilityState(directory, { folder: 'night-v2-ledger', initial: blank(),
    validateValue: validateLedger, clock: () => clockDate(clock).getTime() });
  const active = new Map();
  const activePrepare = new Set();
  let tickBusy = false;
  const now = () => clockDate(clock);
  const enabled = () => { if (executionMode !== 'synthetic') fail('EXECUTION_DISABLED', '夜巡 v2 真实执行未获授权'); };
  const workspace = async () => nightV2Of(await readWorkspace());
  const read = async () => (await ledger.read()).value;
  async function write(transform, action, targetRef = '') {
    for (let attempt = 0; attempt < 3; attempt++) {
      const before = await ledger.read();
      const after = transform(clone(before.value));
      try { return (await ledger.write(after, { expectedSha256: before.sha256, action, targetRef })).value; }
      catch (error) { if (!/已变化/.test(String(error.message)) || attempt === 2) throw error; }
    }
  }
  const view = async () => {
    const state = await read();
    let revision = state.run?.planRevision ?? null;
    try { revision = (await workspace()).revision; } catch { /* 停止入口仍必须可用。 */ }
    return { ...publicStatus(state.run, revision, now()), executionMode };
  };

  async function status() { return view(); }
  async function morningSource({ runId } = {}) {
    const state = await read();
    if (state.run?.id === runId && state.approval?.planHash === state.run.planHash)
      return morningSourceOf(state.run, state.approval);
    const archived = state.history.find(item => item.runId === runId);
    if (archived?.source) return clone(archived.source);
    fail('RUN_NOT_FOUND', '找不到可回读的夜巡锁定记录');
  }
  async function listMorningSources() {
    const state = await read();
    const items = state.history.filter(item => item.source).map(item => clone(item.source));
    if (state.run && state.approval?.planHash === state.run.planHash &&
      !items.some(item => item.runId === state.run.id))
      items.push(morningSourceOf(state.run, state.approval));
    return { schema: 'night-v2-morning-sources', items };
  }
  async function checkContinuation(plan) {
    for (const slot of plan.slots) {
      if (!slot.continueFrom) continue;
      if (typeof verifyContinuation !== 'function')
        fail('CONTINUATION_UNVERIFIED', '续跑来源无法核验，不能批准');
      let verified;
      try { verified = await verifyContinuation({ slot: clone(slot), source: clone(slot.continueFrom) }); }
      catch { fail('CONTINUATION_UNVERIFIED', '续跑来源核验不明，不能批准'); }
      if (verified !== true) fail('CONTINUATION_UNVERIFIED', '续跑来源已变化，不能批准');
    }
  }
  async function stop({ runId } = {}) {
    const current = await read();
    if (!current.run || current.run.id !== runId) fail('RUN_NOT_FOUND', '找不到今晚夜巡');
    if (!current.run.stopRequestedAt) await write(value => {
      if (value.run?.id !== runId) fail('RUN_NOT_FOUND', '找不到今晚夜巡');
      value.run.stopRequestedAt = now().toISOString();
      if (!terminal.has(value.run.status)) {
        const slot = value.run.slots.find(item => item.slotId === value.run.currentSlotId);
        if (slot?.roundInFlight || slot?.prepareInFlight) {
          value.run.status = active.has(runId) ? 'stopping' : 'unknown';
          if (slot.prepareInFlight && activePrepare.has(runId)) value.run.status = 'stopping';
          slot.status = value.run.status;
          slot.fromWhere = value.run.status === 'stopping' ? '已请求停止，等待操作回执' :
            '停止时进程或 worktree 状态未知，需先查询';
        } else {
          value.run.status = 'stopped'; value.run.currentSlotId = null;
          if (slot && ['running', 'paused', 'preparing'].includes(slot.status)) {
            slot.status = 'interrupted'; slot.endedAt = now().toISOString();
          }
        }
      }
      return value;
    }, 'stop-request', runId);
    active.get(runId)?.abort();
    return view();
  }
  async function recheck({ runId } = {}) {
    enabled();
    const current = await read();
    if (!current.run || current.run.id !== runId) fail('RUN_NOT_FOUND', '找不到今晚夜巡');
    if (current.run.status !== 'blocked' || now() >= new Date(current.run.recheckUntil))
      fail('RECHECK_CLOSED', '重新检查窗口已关闭');
    return checkStart({ nightDate: current.run.nightDate, recheck: true });
  }

  async function identitiesFor(plan) {
    if (typeof worktrees?.identity !== 'function') fail('IDENTITY_UNAVAILABLE', '没有可验证的隔离项目身份');
    const identities = [];
    for (const slot of plan.slots) {
      const identity = await worktrees.identity({ slot: clone(slot) });
      if (!identity || typeof identity.realpath !== 'string' || !identity.realpath.startsWith('/') ||
        typeof identity.mainSha !== 'string' || !identity.mainSha ||
        (slot.template.canEditCode && identity.projectId !== slot.projectId) ||
        (!slot.projectId && identity.realpath === process.cwd()))
        fail('IDENTITY_MISMATCH', '夜巡项目身份或隔离工作区无效');
      let actualPath;
      try { actualPath = realpathSync(identity.realpath); }
      catch { fail('IDENTITY_MISMATCH', '夜巡项目实际路径不可访问'); }
      identities.push({ slotId: slot.id, projectId: slot.projectId,
        realpath: actualPath, mainSha: identity.mainSha,
        appOwned: identity.appOwned === true || actualPath.startsWith(`${directory}/`),
        executor: slot.executor, reviewer: slot.reviewer });
    }
    return identities;
  }

  function verifiedWorktree(worktree, branch, locked, identities, otherSlots) {
    if (!worktree || typeof worktree.path !== 'string' || !worktree.path.startsWith('/') ||
      worktree.branch !== branch) fail('WORKTREE_INVALID', '隔离 worktree 回执无效');
    let actualPath;
    try { actualPath = realpathSync(worktree.path); }
    catch { fail('WORKTREE_INVALID', '隔离 worktree 实际路径不可访问'); }
    const source = identities.find(item => item.slotId === locked.id)?.realpath;
    if (!source || actualPath === source || actualPath === directory ||
      actualPath === realpathSync(process.cwd()) ||
      otherSlots.some(item => item.slotId !== locked.id && item.worktree?.path &&
        realpathSync(item.worktree.path) === actualPath) ||
      (!locked.projectId && !(worktree.appOwned === true || actualPath.startsWith(`${directory}/`))))
      fail('WORKTREE_INVALID', '隔离 worktree 与主检出或其他槽路径重叠');
    if (locked.continueFrom && worktree.baseSha !== locked.continueFrom.lastGreenSha)
      fail('WORKTREE_INVALID', '续跑 worktree 未从锁定的最后绿提交建立');
    return { ...worktree, path: actualPath };
  }

  async function approvedPlan() {
    const state = await read();
    if (!state.approval) fail('V2_APPROVAL_REQUIRED', '夜巡 v2 尚未单独批准');
    const plan = await workspace();
    if (plan.revision !== state.approval.planRevision || hash(plan) !== state.approval.workspaceHash)
      fail('PLAN_CHANGED', '夜巡计划或模板历史已变，需重新预览批准');
    const identities = await identitiesFor(state.approval.plan);
    if (hash(identities) !== state.approval.identityHash)
      fail('IDENTITY_CHANGED', '项目或执行者身份已变，需重新预览批准');
    await checkContinuation(state.approval.plan);
    return state.approval;
  }

  // 以下入口只供合成夹具调用；默认 disabled 不会落批准或触发宿主执行。
  async function preview({ expectedPlanRevision } = {}) {
    enabled();
    const plan = await workspace();
    if (!Number.isSafeInteger(expectedPlanRevision) || expectedPlanRevision !== plan.revision)
      fail('PLAN_REVISION_CONFLICT', '夜巡计划 revision 冲突，请重新读取');
    if (!plan.slots.length) fail('EMPTY_PLAN', '今晚没有夜巡插槽');
    await checkContinuation(plan);
    const locked = { ...clone(plan), slots: plan.slots.map(slot => lockedSlot(plan, slot)) };
    const identities = await identitiesFor(locked);
    const pending = { token: randomUUID(), planRevision: plan.revision,
      workspaceHash: hash(plan), planHash: hash({ plan: locked, identities }),
      identityHash: hash(identities), plan: locked, identities,
      expiresAt: new Date(now().getTime() + 10 * 60_000).toISOString() };
    await write(value => { value.preview = pending; return value; }, 'preview', pending.planHash);
    return { schema: 'night-v2-preview', token: pending.token, planRevision: pending.planRevision,
      planHash: pending.planHash, expiresAt: pending.expiresAt,
      slots: locked.slots.map(slot => ({ slotId: slot.id, chipId: slot.chipId,
        chipRevision: slot.chipRevision, projectId: slot.projectId, goal: slot.goal,
        acceptance: clone(slot.acceptance), executor: slot.executor, reviewer: slot.reviewer,
        branch: branchFor('{date}', slot) })) };
  }

  async function confirm({ token, confirmed } = {}) {
    enabled();
    if (confirmed !== true || typeof token !== 'string') fail('CONFIRM_REQUIRED', '夜巡 v2 需要明确确认');
    const state = await read(), pending = state.preview;
    if (!pending || pending.token !== token || now() > new Date(pending.expiresAt))
      fail('PREVIEW_EXPIRED', '夜巡预览已失效，请重新预览');
    const plan = await workspace();
    if (plan.revision !== pending.planRevision || hash(plan) !== pending.workspaceHash)
      fail('PLAN_CHANGED', '夜巡计划或模板历史已变，需重新预览');
    await checkContinuation(plan);
    const identities = await identitiesFor(pending.plan);
    if (hash(identities) !== pending.identityHash) fail('IDENTITY_CHANGED', '夜巡项目身份已变化');
    await write(value => {
      if (value.preview?.token !== token) fail('PREVIEW_EXPIRED', '夜巡预览已失效');
      if (value.run && !terminal.has(value.run.status)) fail('RUN_ACTIVE', '已有夜巡，不能更换批准计划');
      archiveRun(value);
      value.approval = { schema: 'night-v2-approval', id: randomUUID(), approvedAt: now().toISOString(),
        planRevision: pending.planRevision, workspaceHash: pending.workspaceHash,
        planHash: pending.planHash, identityHash: pending.identityHash,
        plan: pending.plan, identities: pending.identities };
      value.preview = null;
      return value;
    }, 'approve', pending.planHash);
    return { schema: 'night-v2-approval', approved: true, planRevision: pending.planRevision,
      planHash: pending.planHash };
  }

  async function announce({ nightDate } = {}) {
    enabled();
    const approval = await approvedPlan();
    windowTimes(nightDate, approval.plan.window);
    const state = await read();
    if (state.run?.nightDate === nightDate) return view();
    if (state.run && !terminal.has(state.run.status)) fail('RUN_ACTIVE', '已有未结束夜巡');
    if (state.history.some(item => item.nightDate === nightDate)) fail('NIGHT_ALREADY_USED', '该夜巡日期已有执行记录');
    const created = newRun(approval, nightDate, now());
    created.announcedAt = now().toISOString();
    await write(value => {
      if (value.run && !terminal.has(value.run.status)) fail('RUN_ACTIVE', '已有未结束夜巡');
      archiveRun(value);
      value.run = created;
      return value;
    }, 'announce', nightDate);
    if (typeof notify === 'function') await notify({ kind: 'announcement', runId: created.id,
      nightDate, slots: created.slots.length });
    return view();
  }

  async function oneCheck(id, scope, slot, plan, nightDate, identities) {
    try {
      if (id === 'backlog' && slot?.chipId === 'push' && typeof countUnresolvedBranches === 'function') {
        const count = await countUnresolvedBranches({ projectId: slot.projectId });
        if (!Number.isSafeInteger(count) || count < 0)
          return { id, scope, slotId: slot.id, status: 'unknown', reason: '同项目未决分支数不可回读', estimate: null };
        if (count >= 3)
          return { id, scope, slotId: slot.id, status: 'failed',
            reason: `同项目已有 ${count} 个未处理分支，暂停推进芯片`, estimate: null };
      }
      if (id === 'quota' && typeof quota === 'function') {
        const result = await quota({ plan, nightDate, slot: null });
        const estimate = result?.estimatePercent;
        const known = Number.isFinite(estimate) && estimate >= 0 && estimate <= 100;
        return { id, scope, slotId: null,
          status: known ? estimate <= 20 ? 'passed' : 'failed' : 'unknown',
          reason: known ? estimate <= 20 ? null : '每周额度估算超过 20%' : '额度估算不可用',
          estimate: known ? estimate : null };
      }
      if (typeof preflight !== 'function') return { id, scope, slotId: slot?.id ?? null,
        status: 'unknown', reason: '预检适配器不可用' };
      if (id === 'worktree' && !slot.projectId &&
        !identities.find(item => item.slotId === slot.id)?.appOwned)
        return { id, scope, slotId: slot.id, status: 'failed',
          reason: '无项目只读槽缺少应用持有的隔离工作区', estimate: null };
      const result = await preflight({ id, scope, slot: slot ? clone(slot) : null,
        plan: clone(plan), nightDate, now: now().toISOString() });
      let checked = ['passed', 'failed', 'unknown'].includes(result?.status) ? result.status : 'unknown';
      if (id === 'disk' && Number.isFinite(result?.availableGb))
        checked = result.availableGb >= 10 ? checked : 'failed';
      if (id === 'backlog' && Number.isInteger(result?.unresolvedBranches))
        checked = result.unresolvedBranches >= 0 && result.unresolvedBranches < 3 ? checked : 'failed';
      if (id === 'power' && (result?.externalPower === false || result?.sleepProtected === false))
        checked = 'failed';
      if (id === 'worktree' && (result?.canCreate === false || result?.mainBusy === true))
        checked = 'failed';
      if (id === 'executor' && result?.recognized === false) checked = 'failed';
      return { id, scope, slotId: slot?.id ?? null,
        status: checked,
        reason: typeof result?.reason === 'string' ? result.reason.slice(0, 500) :
          checked === 'failed' ? `${id} 未达开工阈值` : null,
        estimate: id === 'quota' && Number.isFinite(result?.estimatePercent) ? result.estimatePercent : null };
    } catch {
      return { id, scope, slotId: slot?.id ?? null, status: 'unknown', reason: '预检结果不明', estimate: null };
    }
  }

  async function checkStart({ nightDate, recheck = false } = {}) {
    enabled();
    const approval = await approvedPlan();
    const times = windowTimes(nightDate, approval.plan.window);
    const time = now();
    if (time < times.preflight || time >= times.end) fail('START_WINDOW_CLOSED', '不在夜巡开工检查窗口');
    let state = await read();
    if (time >= times.recheckUntil && (state.run?.nightDate !== nightDate || state.run.status === 'announced'))
      fail('START_WINDOW_CLOSED', '今晚开工检查窗口已关闭');
    if (state.run?.nightDate !== nightDate) {
      if (recheck) fail('RUN_NOT_FOUND', '找不到可复检的夜巡');
      await announce({ nightDate });
      state = await read();
    } else if (recheck && (state.run.status !== 'blocked' || time >= times.recheckUntil))
      fail('RECHECK_CLOSED', '重新检查窗口已关闭');
    else if (!recheck && state.run.status !== 'announced')
      return view();
    const items = [];
    for (const id of CHECK_IDS.filter(item => GLOBAL_CHECKS.has(item)))
      items.push(await oneCheck(id, 'global', null, approval.plan, nightDate, approval.identities));
    for (const slot of approval.plan.slots)
      for (const id of CHECK_IDS.filter(item => !GLOBAL_CHECKS.has(item)))
        items.push(await oneCheck(id, 'slot', slot, approval.plan, nightDate, approval.identities));
    const globalFailed = items.some(item => item.scope === 'global' && item.status !== 'passed');
    const failedSlots = new Set(items.filter(item => item.scope === 'slot' && item.status !== 'passed').map(item => item.slotId));
    const quotaItem = items.find(item => item.id === 'quota' && item.scope === 'global');
    const result = await write(value => {
      if (value.run?.id !== state.run.id || value.run.stopRequestedAt) fail('RUN_CHANGED', '夜巡状态已变化');
      value.run.checks = { passed: CHECK_IDS.filter(id => items.filter(item => item.id === id)
        .every(item => item.status === 'passed')).length,
        total: CHECK_IDS.length, items: items.map(({ estimate, ...item }) => item) };
      value.run.quotaEstimatePercent = quotaItem?.estimate ?? null;
      value.run.slots.forEach(slot => {
        slot.status = failedSlots.has(slot.slotId) ? 'skipped' : 'pending';
        slot.fromWhere = failedSlots.has(slot.slotId) ? '预检未通过' : null;
      });
      value.run.status = globalFailed || value.run.slots.every(slot => slot.status === 'skipped') ? 'blocked' : 'ready';
      return value;
    }, recheck ? 'recheck' : 'check-start', nightDate);
    return publicStatus(result.run, result.run.planRevision, now());
  }

  async function markUnknown(runId, slotId, reason) {
    await write(value => {
      if (value.run?.id !== runId) fail('RUN_CHANGED', '夜巡状态已变化');
      value.run.status = 'unknown';
      value.run.currentSlotId = slotId;
      const slot = value.run.slots.find(item => item.slotId === slotId);
      if (slot) {
        slot.status = 'unknown';
        slot.fromWhere = reason;
        if (!slot.firstFailure) slot.firstFailure = { at: now().toISOString(), reason };
      }
      return value;
    }, 'unknown-result', runId);
    return view();
  }

  async function checkpoint(kind, run, slot, locked) {
    if (typeof worktrees?.checkpoint !== 'function') fail('CHECKPOINT_UNAVAILABLE', '没有独立 worktree 提交打标适配器');
    // 适配器必须用 operationId 幂等提交并回读同一 SHA：崩溃后 check 可能再次请求同一打标。
    const operationId = `${run.id}:${slot.slotId}:${slot.round}:${kind}`;
    const value = await worktrees.checkpoint({ kind, runId: run.id, nightDate: run.nightDate,
      slot: clone(locked), round: slot.round, worktree: clone(slot.worktree), operationId });
    if (typeof value?.sha !== 'string' || !value.sha) fail('CHECKPOINT_UNKNOWN', '安全提交打标结果不明');
    return value.sha;
  }

  async function quotaAfter(run, slot, result) {
    if (typeof quota !== 'function') return { estimatePercent: null, rateLimitUntil: null };
    try {
      const value = await quota({ runId: run.id, nightDate: run.nightDate,
        slot: clone(slot), round: slot.round, result: clone(result) });
      return { estimatePercent: Number.isFinite(value?.estimatePercent) &&
        value.estimatePercent >= 0 && value.estimatePercent <= 100 ? value.estimatePercent : null,
        rateLimitUntil: value?.rateLimitUntil && Number.isFinite(Date.parse(value.rateLimitUntil)) ?
          iso(value.rateLimitUntil) : null };
    } catch { return { estimatePercent: null, rateLimitUntil: null }; }
  }

  async function awaitExecutor(task, controller, deadline) {
    let timer;
    const runner = Promise.resolve().then(() => {
      if (controller.signal.aborted) return { kind: 'aborted-before-start' };
      return task();
    }).then(value => value?.kind === 'aborted-before-start' ? { kind: 'aborted' } : { kind: 'result', value },
      () => ({ kind: 'error' }));
    const watchdog = new Promise(resolve => {
      const inspect = () => {
        if (controller.signal.aborted) { resolve({ kind: 'aborted' }); return; }
        const remaining = deadline - now().getTime();
        if (remaining <= 0) {
          controller.abort();
          resolve({ kind: 'deadline' });
          return;
        }
        timer = setTimeout(inspect, Math.max(1, Math.min(remaining, deadlinePollMs)));
      };
      inspect();
    });
    try { return await Promise.race([runner, watchdog]); }
    finally { clearTimeout(timer); }
  }

  async function finishRound(runId, slotId, rawResult) {
    let result;
    try { result = sanitizedResult(rawResult); }
    catch { return markUnknown(runId, slotId, '执行者结果格式无效，需先查询'); }
    if (result.status === 'unknown') return markUnknown(runId, slotId, '执行者明确报告结果未知，需先查询');
    const before = await read();
    if (before.run?.id !== runId) fail('RUN_CHANGED', '夜巡状态已变化');
    const slotBefore = before.run.slots.find(item => item.slotId === slotId);
    if (!slotBefore?.roundInFlight) return view();
    const locked = before.approval.plan.slots.find(item => item.id === slotId);
    // Runner-provided SHAs are claims, not verified checkpoints. Only a green
    // checkpoint read back by the worktree adapter may become a resume point.
    let greenSha = null, wipSha = null;
    if (result.status !== 'redline_global' && result.status !== 'unknown') {
      try {
        if (result.status === 'verified') greenSha = await checkpoint('green', before.run, slotBefore, locked);
        else wipSha = await checkpoint('wip', before.run, slotBefore, locked);
      } catch { return markUnknown(runId, slotId, '提交打标结果不明，禁止重放'); }
    }
    const meter = await quotaAfter(before.run, slotBefore, result);
    const updated = await write(value => {
      const run = value.run;
      if (run?.id !== runId) fail('RUN_CHANGED', '夜巡状态已变化');
      const slot = run.slots.find(item => item.slotId === slotId);
      if (!slot?.roundInFlight) return value;
      slot.roundInFlight = false;
      slot.lastGreenSha = greenSha ?? slot.lastGreenSha;
      slot.wipSha = wipSha ?? slot.wipSha;
      const fingerprint = result.diffSha256 !== null && result.testSha256 !== null ?
        `${result.diffSha256}:${result.testSha256}` : null;
      slot.unchangedRounds = fingerprint && fingerprint === slot.lastFingerprint ? slot.unchangedRounds + 1 : 0;
      slot.lastFingerprint = fingerprint;
      if (result.status === 'failed') slot.consecutiveFailures += 1;
      else if (result.status === 'verified') slot.consecutiveFailures = 0;
      slot.spentMinutes = (slot.spentMinutes ?? 0) + result.minutes;
      slot.logs.push({ round: slot.round, at: now().toISOString(), status: result.status,
        reason: result.reason, diffSha256: result.diffSha256, testSha256: result.testSha256,
        greenSha, wipSha, acceptanceMet: result.acceptanceMet,
        outputReceipt: result.outputReceipt, outputReceiptIssue: result.outputReceiptIssue });
      if ((result.status === 'failed' || result.status.startsWith('redline')) && !slot.firstFailure)
        slot.firstFailure = { at: now().toISOString(), reason: result.reason ?? result.status };
      // 估算值单调增加；合成 quota 读数与轮次、时长共同计入，任何未知值都刹车。
      run.quotaEstimatePercent = meter.estimatePercent === null ? null : Math.max(
        meter.estimatePercent, (run.quotaEstimatePercent ?? 0) + 0.5 + result.minutes / 60);
      if (result.status === 'redline_global') {
        run.status = 'global-redline'; slot.status = 'failed'; slot.endedAt = now().toISOString();
      } else if (run.stopRequestedAt) {
        run.status = 'stopped'; slot.status = 'interrupted'; slot.fromWhere = '用户停止今晚';
        slot.endedAt = now().toISOString();
      } else if (now() >= windowTimes(run.nightDate, value.approval.plan.window).end) {
        run.status = 'interrupted'; slot.status = 'interrupted';
        slot.fromWhere = '超过夜巡结束时间'; slot.endedAt = now().toISOString();
      } else if (meter.estimatePercent === null || run.quotaEstimatePercent > 20) {
        run.status = 'interrupted'; slot.status = 'interrupted';
        slot.fromWhere = meter.estimatePercent === null ? '额度估算未知' : '每周额度估算达到 20%';
        slot.endedAt = now().toISOString();
      } else if (result.status === 'verified' && result.acceptanceMet && meter.rateLimitUntil) {
        slot.status = 'completed'; slot.endedAt = now().toISOString();
        slot.fromWhere = '验收通过；后续槽等待额度窗口重置';
        run.rateLimitUntil = meter.rateLimitUntil;
        run.status = new Date(meter.rateLimitUntil) < windowTimes(run.nightDate, value.approval.plan.window).end ?
          'paused' : 'interrupted';
        run.currentSlotId = null;
      } else if (result.status === 'rate_limited' || meter.rateLimitUntil) {
        const until = result.rateLimitUntil ?? meter.rateLimitUntil;
        run.rateLimitUntil = until;
        if (!until || new Date(until) >= windowTimes(run.nightDate, value.approval.plan.window).end) {
          run.status = 'interrupted'; slot.status = 'interrupted';
          slot.fromWhere = '限流重置超过夜巡窗口或时间不明'; slot.endedAt = now().toISOString();
        } else { run.status = 'paused'; slot.status = 'paused'; slot.fromWhere = `限流暂停至 ${until}`; }
      } else if (result.status === 'redline_task' || slot.consecutiveFailures >= 3 ||
        slot.unchangedRounds >= 1 || slot.round >= slot.maxRounds ||
        slot.spentMinutes >= slot.maxMinutes ||
        now().getTime() - Date.parse(slot.startedAt) >= slot.maxMinutes * 60_000) {
        slot.status = 'failed'; slot.endedAt = now().toISOString();
        slot.fromWhere = result.status === 'redline_task' ? '任务红线' :
          slot.consecutiveFailures >= 3 ? '连续失败 3 轮' : slot.unchangedRounds >= 1 ?
            '连续 2 轮 diff 与测试结果未变化' : slot.round >= slot.maxRounds ?
              '轮次上限' : '单槽时长上限';
        run.status = 'ready'; run.currentSlotId = null;
      } else if (result.status === 'verified' && result.acceptanceMet) {
        slot.status = 'completed'; slot.endedAt = now().toISOString();
        slot.fromWhere = '验收逐条通过'; run.status = 'ready'; run.currentSlotId = null;
      } else {
        slot.status = 'running'; run.status = 'running';
      }
      if (terminal.has(run.status)) run.currentSlotId = null;
      return value;
    }, 'round-result', `${runId}:${slotId}:${slotBefore.round}`);
    return publicStatus(updated.run, updated.run.planRevision, now());
  }

  async function tick() {
    enabled();
    if (tickBusy) return view();
    tickBusy = true;
    try {
      const state = await read(), run = state.run;
      if (!run || !['ready', 'running', 'paused'].includes(run.status)) return view();
      await approvedPlan();
      const times = windowTimes(run.nightDate, state.approval.plan.window), time = now();
      if (run.stopRequestedAt) {
        await write(value => { value.run.status = 'stopped'; value.run.currentSlotId = null; return value; },
          'stop-final', run.id);
        return view();
      }
      if (time >= times.end) {
        await write(value => {
          value.run.status = 'interrupted';
          const current = value.run.slots.find(item => item.slotId === value.run.currentSlotId);
          if (current) { current.status = 'interrupted'; current.endedAt = now().toISOString();
            current.fromWhere = '超过夜巡结束时间'; }
          value.run.currentSlotId = null;
          return value;
        }, 'window-end', run.id);
        return view();
      }
      if (time < times.start) return view();
      if (run.status === 'paused') {
        if (!run.rateLimitUntil || time < new Date(run.rateLimitUntil)) return view();
        await write(value => {
          value.run.status = 'running'; value.run.rateLimitUntil = null;
          const slot = value.run.slots.find(item => item.slotId === value.run.currentSlotId);
          if (slot) slot.status = 'running';
          return value;
        }, 'rate-limit-reset', run.id);
      }
      const fresh = await read();
      let slot = fresh.run.slots.find(item => item.slotId === fresh.run.currentSlotId);
      if (slot?.prepareInFlight) return markUnknown(run.id, slot.slotId,
        'worktree 建立回执未持久化，需先查询，禁止重复创建');
      if (slot?.roundInFlight) return view(); // 结果不明时只许 check 查询，绝不重放。
      if (!slot) {
        slot = fresh.run.slots.find(item => item.status === 'pending');
        if (!slot || time >= times.noNewSlot) {
          await write(value => {
            value.run.slots.forEach(item => { if (item.status === 'pending') {
              item.status = 'skipped'; item.endedAt = now().toISOString(); item.fromWhere = '06:30 后不开新槽';
            } });
            value.run.status = 'completed'; value.run.currentSlotId = null;
            return value;
          }, 'night-finish', run.id);
          return view();
        }
      }
      const locked = fresh.approval.plan.slots.find(item => item.id === slot.slotId);
      if (!locked) fail('SLOT_MISSING', '夜巡锁定插槽不存在');
      if (slot.startedAt && (time.getTime() - Date.parse(slot.startedAt) >= slot.maxMinutes * 60_000 ||
        (slot.spentMinutes ?? 0) >= slot.maxMinutes)) {
        await write(value => {
          const current = value.run.slots.find(item => item.slotId === slot.slotId);
          current.status = 'failed'; current.endedAt = now().toISOString();
          current.fromWhere = '单槽时长上限'; value.run.status = 'ready'; value.run.currentSlotId = null;
          return value;
        }, 'slot-time-limit', `${run.id}:${slot.slotId}`);
        return view();
      }
      let worktree = slot.worktree;
      if (!worktree) {
        if (typeof worktrees?.prepare !== 'function') return markUnknown(run.id, slot.slotId, '没有独立 worktree 适配器');
        const branch = branchFor(run.nightDate, locked);
        activePrepare.add(run.id);
        let beforePrepare;
        try {
          await write(value => {
            if (value.run.stopRequestedAt) return value;
            value.run.status = 'running'; value.run.currentSlotId = slot.slotId;
            const current = value.run.slots.find(item => item.slotId === slot.slotId);
            current.status = 'preparing'; current.prepareInFlight = true;
            return value;
          }, 'prepare-worktree', `${run.id}:${slot.slotId}`);
          beforePrepare = await read();
        } catch (error) { activePrepare.delete(run.id); throw error; }
        if (beforePrepare.run?.stopRequestedAt) {
          activePrepare.delete(run.id);
          await write(value => {
            const current = value.run.slots.find(item => item.slotId === slot.slotId);
            current.prepareInFlight = false; current.status = 'interrupted';
            current.endedAt = now().toISOString(); current.fromWhere = '创建 worktree 前收到停止请求';
            value.run.status = 'stopped'; value.run.currentSlotId = null;
            return value;
          }, 'stop-before-prepare', run.id);
          return view();
        }
        try {
          worktree = await worktrees.prepare({ runId: run.id, nightDate: run.nightDate,
            slot: clone(locked), branch });
          worktree = verifiedWorktree(worktree, branch, locked,
            fresh.approval.identities, fresh.run.slots);
        } catch { return markUnknown(run.id, slot.slotId, 'worktree 建立结果未知，禁止重试创建'); }
        finally { activePrepare.delete(run.id); }
      }
      const prepared = await write(value => {
        const current = value.run.slots.find(item => item.slotId === slot.slotId);
        if (value.run.stopRequestedAt) {
          current.worktree = clone(worktree); current.prepareInFlight = false;
          current.status = 'interrupted'; current.endedAt = now().toISOString();
          current.fromWhere = '停止后保留已确认的隔离 worktree';
          value.run.status = 'stopped'; value.run.currentSlotId = null;
          return value;
        }
        current.worktree = clone(worktree);
        current.prepareInFlight = false;
        current.status = 'running'; current.startedAt ??= now().toISOString();
        current.round += 1; current.roundInFlight = true;
        value.run.status = 'running'; value.run.currentSlotId = slot.slotId;
        return value;
      }, 'round-start', `${run.id}:${slot.slotId}:${slot.round + 1}`);
      if (prepared.run.status === 'stopped') return view();
      if (typeof executeRound !== 'function') return markUnknown(run.id, slot.slotId, '没有合成执行者适配器');
      const controller = new AbortController();
      active.set(run.id, controller);
      const beforeExecution = await read();
      if (beforeExecution.run?.stopRequestedAt) {
        active.delete(run.id);
        await write(value => {
          const current = value.run.slots.find(item => item.slotId === slot.slotId);
          current.roundInFlight = false; current.status = 'interrupted';
          current.endedAt = now().toISOString(); current.fromWhere = '执行前收到停止请求';
          value.run.status = 'stopped'; value.run.currentSlotId = null;
          return value;
        }, 'stop-before-execution', run.id);
        return view();
      }
      let result;
      try {
        const started = prepared.run.slots.find(item => item.slotId === slot.slotId);
        const deadline = Math.min(Date.parse(started.startedAt) + started.maxMinutes * 60_000,
          times.end.getTime());
        if (now().getTime() >= deadline) {
          controller.abort();
          return markUnknown(run.id, slot.slotId, '执行前已到单槽或夜窗期限，禁止启动；需查询持久轮次');
        }
        const outcome = await awaitExecutor(() => executeRound({ runId: run.id, nightDate: run.nightDate,
          slot: clone(locked), round: slot.round + 1, worktree: clone(worktree),
          signal: controller.signal, quotaEstimatePercent: prepared.run.quotaEstimatePercent }),
        controller, deadline);
        if (outcome.kind !== 'result') return markUnknown(run.id, slot.slotId,
          outcome.kind === 'deadline' ? '执行期限已到，已发出中止信号；进程结果需查询' :
            outcome.kind === 'aborted' ? '停止请求已发出；进程结果需查询' :
              '执行进程结果未知，需先查询');
        result = outcome.value;
      } catch { return markUnknown(run.id, slot.slotId, '执行进程结果未知，需先查询'); }
      finally { active.delete(run.id); }
      return finishRound(run.id, slot.slotId, result);
    } finally { tickBusy = false; }
  }

  async function check({ runId } = {}) {
    enabled();
    const state = await read(), run = state.run;
    if (!run || run.id !== runId) fail('RUN_NOT_FOUND', '找不到今晚夜巡');
    const slot = run.slots.find(item => item.slotId === run.currentSlotId);
    if (slot?.prepareInFlight) {
      if (activePrepare.has(runId)) return view();
      if (typeof worktrees?.inspect !== 'function') return markUnknown(runId, slot.slotId,
        'worktree 查询适配器不可用，禁止重建');
      const locked = state.approval.plan.slots.find(item => item.id === slot.slotId);
      const branch = branchFor(run.nightDate, locked);
      let inspected;
      try { inspected = await worktrees.inspect({ runId, nightDate: run.nightDate,
        slot: clone(state.approval.plan.slots.find(item => item.id === slot.slotId)), branch }); }
      catch { return markUnknown(runId, slot.slotId, 'worktree 查询结果不明，禁止重建'); }
      if (!['prepared', 'absent'].includes(inspected?.status))
        return markUnknown(runId, slot.slotId, 'worktree 查询结果不明，禁止重建');
      let verified = null;
      if (inspected.status === 'prepared') {
        try { verified = verifiedWorktree(inspected.worktree, branch, locked,
          state.approval.identities, run.slots); }
        catch { return markUnknown(runId, slot.slotId, 'worktree 回读身份无效，禁止执行'); }
      }
      await write(value => {
        const current = value.run.slots.find(item => item.slotId === slot.slotId);
        current.prepareInFlight = false;
        current.worktree = inspected.status === 'prepared' ? clone(verified) : null;
        current.status = value.run.stopRequestedAt ? 'interrupted' : 'pending';
        current.fromWhere = value.run.stopRequestedAt ? '停止后 worktree 状态已查询' :
          inspected.status === 'prepared' ? 'worktree 回读确认，待执行' : '确认未创建 worktree，可重新建立';
        if (value.run.stopRequestedAt) current.endedAt = now().toISOString();
        value.run.status = value.run.stopRequestedAt ? 'stopped' : 'ready';
        value.run.currentSlotId = null;
        return value;
      }, 'inspect-worktree', runId);
      return view();
    }
    if (!slot || !slot.roundInFlight) return view();
    if (typeof probeProcess !== 'function') return markUnknown(runId, slot.slotId, '进程查询适配器不可用');
    let probe;
    try { probe = await probeProcess({ runId, slot: clone(slot), round: slot.round,
      worktree: clone(slot.worktree) }); }
    catch { return markUnknown(runId, slot.slotId, '进程查询结果不明'); }
    if (probe?.status === 'running') return view();
    if (probe?.status === 'stopped' && probe.result) return finishRound(runId, slot.slotId, probe.result);
    if (probe?.status === 'stopped' && slot.lastGreenSha) {
      await write(value => {
        const current = value.run.slots.find(item => item.slotId === slot.slotId);
        current.roundInFlight = false; current.status = 'interrupted';
        current.fromWhere = '进程已停止、末轮结果未知；只能从最后绿提交恢复';
        value.run.status = 'interrupted';
        return value;
      }, 'process-stopped-unknown', runId);
      return view();
    }
    return markUnknown(runId, slot.slotId, '进程已停止但结果未知，禁止重放');
  }

  async function resume({ runId } = {}) {
    enabled();
    let state = await read(), run = state.run;
    if (!run || run.id !== runId) fail('RUN_NOT_FOUND', '找不到今晚夜巡');
    if (!['interrupted', 'unknown'].includes(run.status) || run.stopRequestedAt)
      fail('RESUME_FORBIDDEN', '该夜巡不能自动恢复');
    const times = windowTimes(run.nightDate, state.approval.plan.window);
    if (now() >= times.end) fail('RESUME_WINDOW_CLOSED', '07:00 后不能续跑');
    const preparing = run.slots.find(item => item.slotId === run.currentSlotId && item.prepareInFlight);
    if (preparing) return check({ runId });
    let slot = run.slots.find(item => item.slotId === run.currentSlotId) ??
      run.slots.find(item => ['interrupted', 'unknown'].includes(item.status));
    if (!slot || !slot.lastGreenSha || !slot.worktree)
      fail('LAST_GREEN_MISSING', '没有可验证的最后绿提交，需人工接手');
    if (run.status === 'interrupted' &&
      slot.fromWhere !== '进程已停止、末轮结果未知；只能从最后绿提交恢复')
      fail('RESUME_FORBIDDEN', '该中断由时间或额度等硬闸触发，不能恢复');
    if (run.status === 'unknown' && !slot.roundInFlight)
      fail('PROCESS_UNKNOWN', '末轮状态未确认，禁止恢复');
    if (slot.roundInFlight) {
      const checked = await check({ runId });
      if (checked.status === 'unknown' || checked.status === 'running')
        fail('PROCESS_UNKNOWN', '原执行进程尚未确认停止，禁止重放');
      state = await read(); run = state.run;
      if (run.status !== 'interrupted') return checked;
      slot = run.slots.find(item => item.slotId === slot.slotId);
      if (slot.fromWhere !== '进程已停止、末轮结果未知；只能从最后绿提交恢复')
        fail('RESUME_FORBIDDEN', '该中断不能自动恢复');
    }
    if (typeof worktrees?.restore !== 'function') fail('RESTORE_UNAVAILABLE', '最后绿恢复适配器不可用');
    const locked = state.approval.plan.slots.find(item => item.id === slot.slotId);
    const restored = await worktrees.restore({ runId, nightDate: run.nightDate,
      slot: clone(locked), sha: slot.lastGreenSha, worktree: clone(slot.worktree) });
    if (restored?.restored !== true) fail('RESTORE_UNKNOWN', '最后绿提交恢复结果不明');
    await write(value => {
      const target = value.run.slots.find(item => item.slotId === slot.slotId);
      if (target.roundInFlight) fail('PROCESS_UNKNOWN', '原执行进程尚未确认停止');
      target.status = 'running'; target.fromWhere = `从最后绿提交 ${target.lastGreenSha} 续跑`;
      target.consecutiveFailures = 0; target.unchangedRounds = 0;
      value.run.status = 'running'; value.run.currentSlotId = slot.slotId;
      return value;
    }, 'resume-last-green', runId);
    return view();
  }
  return { status, morningSource, listMorningSources, preview, confirm, announce, checkStart, tick,
    stop, recheck, check, resume };
}
