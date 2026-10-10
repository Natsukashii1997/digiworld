// T06 candidate: bounded, injected execution. Construction performs no host I/O.
// Production remains disabled until a verified target adapter and per-run grant exist.
import { createHash, randomUUID } from 'node:crypto';
import { TextDecoder } from 'node:util';
import { createLocalCapabilityState } from './local-capability-state.mjs';

const ID = /^[A-Za-z0-9_-]{1,100}$/;
const UUID = /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/;
const SHA = /^[a-f0-9]{64}$/;
const ARTIFACT = /^controlled-artifact:[A-Za-z0-9._-]{1,96}$/;
const STATES = new Set(['ready', 'starting', 'running', 'awaiting_gate', 'stopping', 'stopped', 'cancelled',
  'completed', 'failed', 'unknown']);
const STEP_STATES = new Set(['pending', 'ready', 'starting', 'running', 'verified', 'failed',
  'stopped', 'cancelled', 'unknown']);
const MAX_ARTIFACT = 64 * 1024;
const PREVIEW_MS = 5 * 60 * 1000;
const exact = (value, keys) => value && typeof value === 'object' && !Array.isArray(value) &&
  Object.keys(value).length === keys.length && keys.every(key => Object.hasOwn(value, key));
const clone = value => structuredClone(value);
const stamp = clock => new Date(clock()).toISOString();
const stable = value => Array.isArray(value) ? value.map(stable) : value && typeof value === 'object' ?
  Object.fromEntries(Object.keys(value).sort().map(key => [key, stable(value[key])])) : value;
const hash = value => createHash('sha256').update(JSON.stringify(stable(value))).digest('hex');
const bytesHash = value => createHash('sha256').update(value).digest('hex');
const fail = (code, message, status = 409) => {
  throw Object.assign(new Error(message), { code, status });
};
const line = (value, max) => typeof value === 'string' && value.trim() &&
  value.length <= max && !/[\x00-\x1f\x7f-\x9f]/.test(value);
const text = (value, max) => typeof value === 'string' && value.trim() &&
  value.length <= max && !/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f-\x9f]/.test(value);

export function validateControlledPlan(plan) {
  if (!exact(plan, ['schema', 'projectId', 'targetId', 'taskKind', 'goal',
    'acceptance', 'budget', 'steps']) || plan.schema !== 1 ||
    !ID.test(plan.projectId || '') || !ID.test(plan.targetId || '') ||
    plan.taskKind !== 'verification' || !text(plan.goal, 1000) ||
    !Array.isArray(plan.acceptance) || plan.acceptance.length < 1 ||
    plan.acceptance.length > 5 || plan.acceptance.some(item => !text(item, 300)) ||
    !exact(plan.budget, ['maxMinutesPerStep', 'maxTurnsPerStep']) ||
    !Number.isSafeInteger(plan.budget.maxMinutesPerStep) || plan.budget.maxMinutesPerStep < 1 ||
    plan.budget.maxMinutesPerStep > 60 || !Number.isSafeInteger(plan.budget.maxTurnsPerStep) ||
    plan.budget.maxTurnsPerStep < 1 || plan.budget.maxTurnsPerStep > 12 ||
    !Array.isArray(plan.steps) || ![1, 2].includes(plan.steps.length))
    fail('PLAN_INVALID', '受控任务须有单目标、逐条验收和每步预算', 400);
  for (const [index, step] of plan.steps.entries())
    if (!exact(step, ['id', 'goal', 'acceptance']) || step.id !== `step-${index + 1}` ||
      !text(step.goal, 1000) || !Array.isArray(step.acceptance) ||
      step.acceptance.length < 1 || step.acceptance.length > 5 ||
      step.acceptance.some(item => !text(item, 300)))
      fail('PLAN_INVALID', '每一步都须有明确目标和可核验验收标准', 400);
  return plan;
}

function validateLedger(value) {
  if (!exact(value, ['schema', 'runs', 'closedIds']) ||
    value.schema !== 'controlled-execution-v1' || !Array.isArray(value.runs) ||
    value.runs.length > 10 || !Array.isArray(value.closedIds) ||
    value.closedIds.length > 100 || new Set(value.closedIds).size !== value.closedIds.length ||
    value.closedIds.some(id => !UUID.test(id)) ||
    Buffer.byteLength(JSON.stringify(value)) > 512 * 1024)
    fail('LEDGER_INVALID', '受控执行本机记录无效或已满', 503);
  const ids = new Set();
  for (const run of value.runs) {
    if (!run || !UUID.test(run.id || '') || ids.has(run.id) ||
      !STATES.has(run.status) || !SHA.test(run.planHash || '') ||
      !SHA.test(run.target?.identity || '') || !SHA.test(run.adapterIdentity || '') ||
      !Array.isArray(run.steps) || run.steps.length !== run.plan?.steps?.length ||
      !Number.isSafeInteger(run.currentStep) || run.currentStep < 0 ||
      run.currentStep >= run.steps.length || !line(run.authGeneration, 100))
      fail('LEDGER_INVALID', '受控执行本机记录无效', 503);
    validateControlledPlan(run.plan);
    ids.add(run.id);
    for (const step of run.steps) if (!STEP_STATES.has(step.status))
      fail('LEDGER_INVALID', '受控执行步骤状态无效', 503);
  }
  if (value.closedIds.some(id => ids.has(id)))
    fail('LEDGER_INVALID', '受控执行编号状态冲突', 503);
  return value;
}

function validDiscovery(value, mode) {
  return value?.recognized === true && SHA.test(value.identity || '') &&
    value.canExecute === true && value.canStop === true &&
    value.canProbe === true && value.canCollect === true &&
    value.hardLimits === true && value.isolation === mode;
}
function validTarget(value, plan) {
  return value?.projectId === plan.projectId && value?.targetId === plan.targetId &&
    SHA.test(value.identity || '') && line(value.workspaceRef, 200);
}
function receiptOf(result) {
  const receipt = result?.outputReceipt;
  return exact(receipt, ['artifactRef', 'sha256']) &&
    ARTIFACT.test(receipt.artifactRef || '') && SHA.test(receipt.sha256 || '')
    ? receipt : null;
}
function gateHash(run) {
  const first = run.steps[0];
  return hash([run.id, run.planHash, first.artifact?.sha256,
    first.result?.acceptanceMet, run.adapterIdentity]);
}
function publicRun(run) {
  return clone(run);
}

export function createControlledExecution({ directory, clock = Date.now,
  executionMode = 'disabled', adapter, resolveTarget, authorizeRun,
  scheduleDeadline = setTimeout } = {}) {
  if (typeof directory !== 'string' || !directory)
    fail('SERVICE_INVALID', '受控执行需要独立本机记录目录', 503);
  const ledger = createLocalCapabilityState(directory, {
    folder: 'controlled-execution-ledger',
    initial: { schema: 'controlled-execution-v1', runs: [], closedIds: [] },
    validateValue: validateLedger, clock,
  });
  const previews = new Map();
  const active = new Map();
  const available = () => executionMode === 'synthetic' &&
    ['discover', 'executeRound', 'probeProcess', 'stop', 'readArtifact']
      .every(name => typeof adapter?.[name] === 'function') &&
    typeof resolveTarget === 'function' && typeof authorizeRun === 'function';
  const requireAvailable = () => {
    if (!available()) fail('EXECUTION_DISABLED',
      '受控执行能力未接入；本机只能查看既有记录，不能启动目标', 403);
  };
  const read = async () => (await ledger.read()).value;
  const runOf = (value, id) => {
    const run = value.runs.find(item => item.id === id);
    if (!run) fail('RUN_NOT_FOUND', '找不到此受控执行编号', 404);
    return run;
  };
  async function update(transform, action, targetRef) {
    for (let attempt = 0; attempt < 3; attempt++) {
      const before = await ledger.read();
      const after = transform(clone(before.value));
      try { return (await ledger.write(after, { expectedSha256: before.sha256,
        action, targetRef })).value; }
      catch (error) {
        if (!/已变化/.test(String(error.message)) || attempt === 2) throw error;
      }
    }
  }
  async function binding(plan, expected) {
    requireAvailable();
    const target = await resolveTarget({ projectId: plan.projectId,
      targetId: plan.targetId, taskKind: plan.taskKind });
    if (!validTarget(target, plan)) fail('TARGET_UNKNOWN', '目标或项目身份无法核验');
    const discovered = await adapter.discover({ target: clone(target),
      taskKind: plan.taskKind, budget: clone(plan.budget) });
    if (!validDiscovery(discovered, 'synthetic'))
      fail('ADAPTER_UNVERIFIED', '执行者缺少可探测、可停止、可回收或硬预算能力');
    if (expected && (target.identity !== expected.target.identity ||
      discovered.identity !== expected.adapterIdentity ||
      target.workspaceRef !== expected.target.workspaceRef))
      fail('TARGET_DRIFT', '项目、执行者或隔离位置已变化，请重新预览');
    return { target, adapterIdentity: discovered.identity };
  }
  async function grant(runId, planHash, targetIdentity, generation) {
    requireAvailable();
    const receipt = await authorizeRun({ scope: 'controlled-execution', runId,
      planHash, targetIdentity, executionMode: 'synthetic' });
    if (receipt?.enabled !== true || receipt.runId !== runId ||
      receipt.planHash !== planHash || receipt.targetIdentity !== targetIdentity ||
      !line(receipt.generation, 100) || generation && receipt.generation !== generation)
      fail('RUN_AUTH_REQUIRED', '当前任务没有独立授权，不能启动');
    return receipt.generation;
  }
  async function artifactBytes(receipt) {
    const output = await adapter.readArtifact(clone(receipt));
    const bytes = Buffer.isBuffer(output) ? output :
      typeof output === 'string' ? Buffer.from(output, 'utf8') : null;
    if (!bytes || bytes.length < 1 || bytes.length > MAX_ARTIFACT ||
      bytesHash(bytes) !== receipt.sha256)
      fail('ARTIFACT_UNKNOWN', '产物不完整或 SHA-256 不符，不能当作完成');
    return bytes;
  }
  async function boundedStop(run) {
    if (typeof adapter?.stop !== 'function') return false;
    let timer;
    try {
      return await Promise.race([
        Promise.resolve().then(() => adapter.stop({ runId: run.id,
          stepId: run.steps[run.currentStep].id, target: clone(run.target) }))
          .then(() => true, () => false),
        new Promise(resolve => {
          timer = setTimeout(() => resolve(false), 5000);
          timer.unref?.();
        }),
      ]);
    } finally { clearTimeout(timer); }
  }
  async function finish(runId, stepIndex, outcome) {
    let status = 'unknown', artifact = null, reason = '执行结果或产物未能完整核验';
    const receipt = receiptOf(outcome);
    if (outcome?.status === 'verified' && outcome.acceptanceMet === true && receipt) {
      try {
        const bytes = await artifactBytes(receipt);
        artifact = { ...receipt, bytes: bytes.length };
        status = 'verified'; reason = '验收回执与产物 SHA-256 已核验';
      } catch { /* Unknown is preserved. No replay. */ }
    } else if (outcome?.status === 'failed') {
      status = 'failed'; reason = line(outcome.reason, 300) ? outcome.reason : '执行者报告失败';
    }
    const value = await update(value => {
      const run = runOf(value, runId), step = run.steps[stepIndex];
      if (run.currentStep !== stepIndex ||
        !['running', 'stopping'].includes(run.status) || step.status !== 'running') return value;
      // A stop request is only a request. The original process must be probed
      // before a running step can be recorded as stopped.
      if (run.stopRequestedAt) return value;
      step.status = status;
      step.finishedAt = stamp(clock);
      step.result = { status: step.status, acceptanceMet: status === 'verified', reason };
      step.artifact = artifact;
      run.status = status === 'verified' ?
        run.steps.length === 2 && stepIndex === 0 ? 'awaiting_gate' : 'completed' : status;
      return value;
    }, 'finish-step', runId);
    return value.runs.find(item => item.id === runId);
  }
  async function markUnknown(runId, reason, { stopRequested = false } = {}) {
    return update(value => {
      const run = runOf(value, runId);
      if (!['running', 'stopping'].includes(run.status)) return value;
      if (stopRequested && !run.stopRequestedAt) run.stopRequestedAt = stamp(clock);
      run.status = 'unknown';
      const step = run.steps[run.currentStep];
      step.status = 'unknown'; step.finishedAt = stamp(clock);
      step.result = { status: 'unknown', acceptanceMet: false, reason };
      return value;
    }, 'mark-unknown', runId);
  }
  async function cancelStarting(runId, reason) {
    return update(value => {
      const run = runOf(value, runId);
      if (run.status !== 'starting') return value;
      run.status = 'cancelled';
      const step = run.steps[run.currentStep];
      step.status = 'cancelled'; step.finishedAt = stamp(clock);
      step.result = { status: 'cancelled', acceptanceMet: false, reason };
      return value;
    }, 'cancel-before-launch', runId);
  }
  async function confirmStopped(runId) {
    return update(value => {
      const run = runOf(value, runId);
      if (!['stopping', 'unknown'].includes(run.status) || !run.stopRequestedAt) return value;
      const step = run.steps[run.currentStep];
      if (!['running', 'unknown'].includes(step.status)) return value;
      run.status = 'stopped';
      step.status = 'stopped'; step.finishedAt = stamp(clock);
      step.result = { status: 'stopped', acceptanceMet: false,
        reason: '原进程已回查确认停止；本步骤未作为验收成果' };
      step.artifact = null;
      return value;
    }, 'confirm-process-stopped', runId);
  }
  async function runStep(run) {
    const stepIndex = run.currentStep, controller = new AbortController();
    active.set(run.id, { controller, launched: false });
    let timeout;
    try {
      await binding(run.plan, run);
      await grant(run.id, run.planHash, run.target.identity, run.authGeneration);
      const latest = runOf(await read(), run.id);
      if (latest.status !== 'starting' || latest.stopRequestedAt)
        return;
      const launched = await update(value => {
        const current = runOf(value, run.id);
        if (current.status !== 'starting' || current.stopRequestedAt ||
          current.steps[stepIndex].status !== 'starting') return value;
        current.status = 'running';
        current.steps[stepIndex].status = 'running';
        current.steps[stepIndex].startedAt = stamp(clock);
        return value;
      }, 'begin-process-launch', run.id);
      if (runOf(launched, run.id).status !== 'running') return;
      let fire;
      const deadline = new Promise(resolve => {
        fire = () => resolve({ timeout: true });
        timeout = scheduleDeadline(fire, run.plan.budget.maxMinutesPerStep * 60_000);
        timeout.unref?.();
      });
      active.get(run.id).launched = true;
      const execution = Promise.resolve(adapter.executeRound({
        runId: run.id, projectId: run.plan.projectId, targetId: run.plan.targetId,
        target: clone(run.target), taskKind: run.plan.taskKind,
        goal: run.plan.goal, acceptance: clone(run.plan.acceptance),
        step: clone(run.plan.steps[stepIndex]), budget: clone(run.plan.budget),
        signal: controller.signal,
      })).then(result => ({ result }), () => ({ error: true }));
      const outcome = await Promise.race([execution, deadline]);
      if (outcome.timeout) {
        controller.abort();
        await boundedStop(run);
        await markUnknown(run.id, '时间预算已到，已请求停机，原进程待查询；禁止重放',
          { stopRequested: true });
        return;
      }
      if (outcome.error) { await markUnknown(run.id, '执行者结果未知；先查询原进程'); return; }
      await finish(run.id, stepIndex, outcome.result);
    } catch {
      await cancelStarting(run.id, '启动前目标或授权核验失败；未调用执行者').catch(() => {});
      await markUnknown(run.id, '目标、授权或执行结果无法核验；禁止重放').catch(() => {});
    } finally {
      clearTimeout(timeout);
      active.delete(run.id);
    }
  }

  const service = {
    capabilities() { return { enabled: available(), executionMode,
      productionReady: false,
      reason: available() ? '仅合成执行适配器可用；未接入真实 Agent' :
        '真实执行适配器与本任务独立授权未接入，不能启动' }; },
    async list() {
      const value = await read();
      return { items: value.runs.map(publicRun), closedIds: [...value.closedIds],
        capabilities: service.capabilities() };
    },
    async preview(input) {
      if (!exact(input, ['plan'])) fail('REQUEST_INVALID', '预览字段无效', 400);
      const plan = clone(validateControlledPlan(input.plan));
      const target = await binding(plan);
      const id = randomUUID(), planHash = hash([plan, target]);
      const authGeneration = await grant(id, planHash, target.target.identity);
      for (const [key, value] of previews) if (value.expires <= clock()) previews.delete(key);
      if (previews.size >= 20) fail('PREVIEW_LIMIT', '待确认预览过多');
      const expires = clock() + PREVIEW_MS;
      previews.set(id, { id, plan, planHash, ...target, authGeneration, expires });
      return { runId: id, planHash, plan, target, expiresAt: new Date(expires).toISOString(),
        budgetSummary: { scope: 'per-step', stepCount: plan.steps.length,
          allocatedMinutesAcrossSteps: plan.steps.length * plan.budget.maxMinutesPerStep,
          allocatedTurnsAcrossSteps: plan.steps.length * plan.budget.maxTurnsPerStep,
          excludesHumanGateWait: true },
        authorization: { scope: 'controlled-execution', generation: authGeneration,
          runId: id, planHash, targetIdentity: target.target.identity },
        notice: '仅合成适配器；确认后仍需明确点击开始，每一步都可查状态和停止。' };
    },
    async confirm(input) {
      if (!exact(input, ['runId', 'planHash', 'confirmed']) ||
        !UUID.test(input.runId || '') || !SHA.test(input.planHash || '') ||
        input.confirmed !== true) fail('REQUEST_INVALID', '确认字段无效', 400);
      const existing = await read();
      if (existing.closedIds.includes(input.runId)) return { status: 'not_started', closed: true };
      const old = existing.runs.find(item => item.id === input.runId);
      if (old) {
        if (old.planHash !== input.planHash) fail('ID_CONFLICT', '相同编号的计划指纹不一致');
        return { status: old.status, run: publicRun(old), closed: true };
      }
      const preview = previews.get(input.runId);
      if (!preview || preview.expires <= clock() || preview.planHash !== input.planHash)
        fail('PREVIEW_EXPIRED', '预览已失效，请查询原编号后重新预览');
      await binding(preview.plan, preview);
      await grant(preview.id, preview.planHash, preview.target.identity, preview.authGeneration);
      const state = await update(value => {
        if (value.closedIds.includes(input.runId)) return value;
        if (value.runs.some(item => item.id === input.runId)) return value;
        if (value.runs.length >= 10) fail('RUN_LIMIT', '受控执行记录已满，不能覆盖旧结果');
        const run = { id: preview.id, planHash: preview.planHash,
          plan: clone(preview.plan), target: clone(preview.target),
          adapterIdentity: preview.adapterIdentity, authGeneration: preview.authGeneration,
          mode: 'synthetic', status: 'ready', currentStep: 0,
          createdAt: stamp(clock), approvedAt: stamp(clock), stopRequestedAt: null,
          steps: preview.plan.steps.map((step, index) => ({ id: step.id,
            status: index === 0 ? 'ready' : 'pending', startedAt: null,
            finishedAt: null, result: null, artifact: null })) };
        value.runs.push(run);
        return value;
      }, 'confirm-plan', input.runId);
      previews.delete(input.runId);
      const run = state.runs.find(item => item.id === input.runId);
      return run ? { status: run.status, run: publicRun(run), closed: true } :
        { status: 'not_started', closed: true };
    },
    async resolve(input) {
      if (!exact(input, ['runId']) || !UUID.test(input.runId || ''))
        fail('REQUEST_INVALID', '待查编号无效', 400);
      const value = await update(value => {
        if (value.runs.some(item => item.id === input.runId) ||
          value.closedIds.includes(input.runId)) return value;
        if (value.closedIds.length >= 100) fail('CLOSED_LIMIT', '封闭编号已满，不能安全解除待决');
        value.closedIds.push(input.runId);
        return value;
      }, 'close-absent', input.runId);
      previews.delete(input.runId);
      const run = value.runs.find(item => item.id === input.runId);
      return run ? { status: run.status, run: publicRun(run), closed: true } :
        { status: 'not_started', closed: true };
    },
    async status(input) {
      if (!exact(input, ['runId']) || !UUID.test(input.runId || ''))
        fail('REQUEST_INVALID', '运行编号无效', 400);
      const value = await read(), run = value.runs.find(item => item.id === input.runId);
      return run ? { status: run.status, run: publicRun(run) } :
        { status: value.closedIds.includes(input.runId) ? 'not_started' : 'unknown' };
    },
    async start(input) {
      if (!exact(input, ['runId']) || !UUID.test(input.runId || ''))
        fail('REQUEST_INVALID', '启动编号无效', 400);
      requireAvailable();
      const run = runOf(await read(), input.runId);
      if (run.status !== 'ready') return { status: run.status, run: publicRun(run) };
      await binding(run.plan, run);
      await grant(run.id, run.planHash, run.target.identity, run.authGeneration);
      let claimed = false;
      const value = await update(value => {
        claimed = false;
        const current = runOf(value, input.runId);
        if (current.status !== 'ready' || current.steps[current.currentStep].status !== 'ready') return value;
        claimed = true;
        current.status = 'starting';
        current.steps[current.currentStep].status = 'starting';
        return value;
      }, 'start-step', input.runId);
      const current = runOf(value, input.runId);
      if (claimed) void runStep(publicRun(current));
      return { status: current.status, run: publicRun(current), newlyStarted: claimed };
    },
    async check(input) {
      if (!exact(input, ['runId']) || !UUID.test(input.runId || ''))
        fail('REQUEST_INVALID', '查询编号无效', 400);
      let run = runOf(await read(), input.runId);
      if (run.status === 'starting') {
        if (!active.has(run.id)) run = runOf(await cancelStarting(run.id,
          '启动准备未完成且没有原进程；已安全取消'), run.id);
        return { status: run.status, run: publicRun(run), processStatus: 'not-launched' };
      }
      if (!['running', 'stopping', 'unknown'].includes(run.status))
        return { status: run.status, run: publicRun(run) };
      if (typeof adapter?.probeProcess !== 'function') {
        const value = await markUnknown(run.id, '进程查询能力不可用；禁止重放');
        run = runOf(value, run.id);
        return { status: run.status, run: publicRun(run) };
      }
      let probe;
      try { probe = await adapter.probeProcess({ runId: run.id,
        stepId: run.steps[run.currentStep].id, target: clone(run.target) }); }
      catch { probe = { status: 'unknown' }; }
      if (probe?.status === 'stopped' && run.stopRequestedAt) {
        run = runOf(await confirmStopped(run.id), run.id);
      } else if (probe?.status === 'stopped' && probe.result && run.status !== 'unknown') {
        run = await finish(run.id, run.currentStep, probe.result);
      } else if (probe?.status !== 'running' && run.status !== 'unknown' &&
        !active.has(run.id)) {
        const value = await markUnknown(run.id, '进程已停止但结果未知，或查询失败；禁止重放');
        run = runOf(value, run.id);
      }
      return { status: run.status, run: publicRun(run),
        processStatus: ['running', 'stopped'].includes(probe?.status) ? probe.status : 'unknown' };
    },
    async stop(input) {
      if (!exact(input, ['runId']) || !UUID.test(input.runId || ''))
        fail('REQUEST_INVALID', '停止编号无效', 400);
      const value = await update(value => {
        const run = runOf(value, input.runId);
        if (['completed', 'failed', 'stopped', 'cancelled'].includes(run.status)) return value;
        if (!run.stopRequestedAt) run.stopRequestedAt = stamp(clock);
        if (run.status === 'running' || run.status === 'unknown') run.status = 'stopping';
        else if (run.status === 'starting') {
          run.status = 'cancelled';
          const step = run.steps[run.currentStep];
          step.status = 'cancelled'; step.finishedAt = stamp(clock);
          step.result = { status: 'cancelled', acceptanceMet: false,
            reason: '执行者调用前已取消' };
        } else if (run.status !== 'stopping') run.status = 'cancelled';
        return value;
      }, 'stop-request', input.runId);
      let run = runOf(value, input.runId);
      if (run.status === 'stopping') {
        active.get(run.id)?.controller.abort();
        await boundedStop(run);
        return service.check({ runId: run.id });
      }
      return { status: run.status, run: publicRun(run) };
    },
    async gate(input) {
      if (!exact(input, ['runId', 'gateHash', 'confirmed']) ||
        !UUID.test(input.runId || '') || !SHA.test(input.gateHash || '') ||
        input.confirmed !== true) fail('REQUEST_INVALID', '人工门确认字段无效', 400);
      const prior = runOf(await read(), input.runId);
      if (prior.status !== 'awaiting_gate' || prior.steps.length !== 2 ||
        prior.steps[0].status !== 'verified' || gateHash(prior) !== input.gateHash)
        fail('GATE_CHANGED', '第一步结果或人工门预览已变化');
      await binding(prior.plan, prior);
      await grant(prior.id, prior.planHash, prior.target.identity, prior.authGeneration);
      const value = await update(value => {
        const run = runOf(value, input.runId);
        if (run.status !== 'awaiting_gate' || gateHash(run) !== input.gateHash)
          fail('GATE_CHANGED', '第一步结果已变化，请重新核对');
        run.status = 'ready'; run.currentStep = 1; run.steps[1].status = 'ready';
        return value;
      }, 'approve-gate', input.runId);
      return { status: 'ready', run: publicRun(runOf(value, input.runId)) };
    },
    async gatePreview(input) {
      if (!exact(input, ['runId']) || !UUID.test(input.runId || ''))
        fail('REQUEST_INVALID', '人工门预览编号无效', 400);
      const run = runOf(await read(), input.runId);
      if (run.status !== 'awaiting_gate' || run.steps[0].status !== 'verified')
        fail('GATE_UNAVAILABLE', '第一步尚未完成验收与产物回收');
      return { runId: run.id, gateHash: gateHash(run),
        firstStep: clone(run.steps[0]), nextStep: clone(run.plan.steps[1]),
        notice: '核对第一步证据与下一步目标后确认；确认本身不会启动第二步。' };
    },
    async collect(input) {
      if (!exact(input, ['runId', 'stepId']) || !UUID.test(input.runId || '') ||
        !['step-1', 'step-2'].includes(input.stepId))
        fail('REQUEST_INVALID', '产物回收字段无效', 400);
      const run = runOf(await read(), input.runId);
      const step = run.steps.find(item => item.id === input.stepId);
      if (!step || step.status !== 'verified' || !step.artifact)
        fail('ARTIFACT_UNAVAILABLE', '该步骤没有已核验产物');
      if (typeof adapter?.readArtifact !== 'function')
        fail('ARTIFACT_UNAVAILABLE', '产物读取适配器未接入');
      const bytes = await artifactBytes(step.artifact);
      let content;
      try { content = new TextDecoder('utf-8', { fatal: true }).decode(bytes); }
      catch { fail('ARTIFACT_UNAVAILABLE', '本片仅回收完整 UTF-8 文本产物'); }
      return { runId: run.id, stepId: step.id, artifact: clone(step.artifact), content };
    },
  };
  return service;
}
