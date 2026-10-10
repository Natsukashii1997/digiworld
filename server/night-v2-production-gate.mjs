// T07 candidate only: validates the independent grant and adapter evidence
// required before a future production bridge can be wired into night-v2.
// This module never starts a process, schedules a timer, or enables the harness.
const SHA = /^[a-f0-9]{64}$/;
const UUID = /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/;
const ID = /^[A-Za-z0-9_-]{1,100}$/;
const fail = (code, message) => {
  throw Object.assign(new Error(message), { code, status: 409 });
};
const equal = (a, b) => a === b && a !== undefined && a !== null;

export function validateNightV2RunScope(scope) {
  if (!scope || typeof scope !== 'object' || !UUID.test(scope.runId || '') ||
    !/^\d{4}-\d\d-\d\d$/.test(scope.nightDate || '') ||
    !SHA.test(scope.planHash || '') || !ID.test(scope.slotId || '') ||
    !ID.test(scope.targetId || '') || !ID.test(scope.projectId || '') ||
    !SHA.test(scope.worktreeIdentity || '') ||
    !Number.isSafeInteger(scope.maxMinutes) || scope.maxMinutes < 1 || scope.maxMinutes > 180 ||
    !Number.isSafeInteger(scope.maxRounds) || scope.maxRounds < 1 || scope.maxRounds > 12)
    fail('NIGHT_SCOPE_INVALID', '夜巡锁定运行、目标、worktree 或预算身份无效');
  return scope;
}

export async function inspectNightV2Adapter({ scope, discover, authorizeRun, clock = Date.now } = {}) {
  validateNightV2RunScope(scope);
  if (typeof discover !== 'function' || typeof authorizeRun !== 'function')
    return { readyForIsolationTest: false, productionReady: false,
      reason: '目标能力发现或夜巡专属授权适配器未接入' };
  let capability, grant;
  try {
    capability = await discover({ targetId: scope.targetId,
      projectId: scope.projectId, worktreeIdentity: scope.worktreeIdentity,
      maxMinutes: scope.maxMinutes, maxRounds: scope.maxRounds });
    grant = await authorizeRun({ scope: 'night-v2', runId: scope.runId,
      nightDate: scope.nightDate, planHash: scope.planHash,
      slotId: scope.slotId, projectId: scope.projectId,
      targetId: scope.targetId, worktreeIdentity: scope.worktreeIdentity,
      maxMinutes: scope.maxMinutes, maxRounds: scope.maxRounds });
  } catch {
    return { readyForIsolationTest: false, productionReady: false,
      reason: '能力或本次夜巡授权无法核验' };
  }
  const supports = capability?.recognized === true &&
    SHA.test(capability.identity || '') &&
    equal(capability.targetId, scope.targetId) &&
    equal(capability.projectId, scope.projectId) &&
    equal(capability.worktreeIdentity, scope.worktreeIdentity) &&
    equal(capability.maxMinutes, scope.maxMinutes) &&
    equal(capability.maxRounds, scope.maxRounds) &&
    capability.canExecute === true && capability.canStop === true &&
    capability.canProbe === true && capability.canCollect === true &&
    capability.hardLimits === true && capability.isolation === 'worktree';
  const approved = grant?.enabled === true && grant.scope === 'night-v2' &&
    equal(grant.runId, scope.runId) && equal(grant.nightDate, scope.nightDate) &&
    equal(grant.planHash, scope.planHash) && equal(grant.slotId, scope.slotId) &&
    equal(grant.projectId, scope.projectId) && equal(grant.targetId, scope.targetId) &&
    equal(grant.worktreeIdentity, scope.worktreeIdentity) &&
    equal(grant.maxMinutes, scope.maxMinutes) &&
    equal(grant.maxRounds, scope.maxRounds) &&
    Number.isFinite(Date.parse(grant.expiresAt)) && Date.parse(grant.expiresAt) > clock();
  if (!supports || !approved)
    return { readyForIsolationTest: false, productionReady: false,
      reason: !supports ? '目标适配器未证明停止、查询、回收、硬预算及 worktree 隔离' :
        '本夜、此槽、此计划与 worktree 的独立授权缺失或过期' };
  return { readyForIsolationTest: true, productionReady: false,
    adapterIdentity: capability.identity, grantGeneration: grant.generation || null,
    reason: '仅满足注入式合同检查；真实 CLI、调度、常驻与首夜采用尚未验证' };
}
