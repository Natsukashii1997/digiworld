import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = resolve(fileURLToPath(new URL('..', import.meta.url)));
const project = '/Users/nat/Documents/ChatGPT/个人/work/digiworld';
const digest = value => createHash('sha256').update(value).digest('hex');

async function loadCandidate() {
  const source = await readFile(join(here, 'server/controlled-execution.mjs'), 'utf8');
  const portable = source.replace(/from '\.\/([^']+)'/g, (_, name) =>
    `from '${pathToFileURL(join(project, 'server', name)).href}'`);
  const temp = await realpath(await mkdtemp(join(tmpdir(), 'guiji-controlled-module-')));
  const path = join(temp, 'controlled-execution.mjs');
  await writeFile(path, portable);
  const loaded = await import(pathToFileURL(path).href);
  return { ...loaded, remove: () => rm(temp, { recursive: true, force: true }) };
}
const candidate = await loadCandidate();
const { createControlledExecution } = candidate;
test.after(candidate.remove);

const plan = (steps = 1) => ({ schema: 1, projectId: 'project-1', targetId: 'codex',
  taskKind: 'verification', goal: 'Verify a synthetic module',
  acceptance: ['Synthetic result has a checked SHA'],
  budget: { maxMinutesPerStep: 1, maxTurnsPerStep: 2 },
  steps: Array.from({ length: steps }, (_, index) => ({ id: `step-${index + 1}`,
    goal: index ? 'Review synthetic evidence' : 'Run synthetic verification',
    acceptance: ['Artifact SHA matches'] })),
});

async function fixture(t, { mode = 'synthetic', executeRound, scheduleDeadline, onGrant } = {}) {
  const directory = await realpath(await mkdtemp(join(tmpdir(), 'guiji-controlled-')));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const artifacts = new Map(), processes = new Map();
  let calls = 0, grants = 0;
  const adapter = {
    async discover() { return { recognized: true, identity: digest('synthetic-executor'),
      canExecute: true, canStop: true, canProbe: true, canCollect: true,
      hardLimits: true, isolation: 'synthetic' }; },
    async executeRound(input) {
      calls++;
      if (executeRound) return executeRound(input, { artifacts, processes });
      const content = `Synthetic verified artifact for ${input.step.id}`;
      const artifactRef = `controlled-artifact:${input.runId}-${input.step.id}`;
      artifacts.set(artifactRef, Buffer.from(content));
      const result = { status: 'verified', acceptanceMet: true,
        outputReceipt: { artifactRef, sha256: digest(content) } };
      processes.set(input.runId, { status: 'stopped', result });
      return result;
    },
    async probeProcess({ runId }) { return processes.get(runId) || { status: 'unknown' }; },
    async stop({ runId }) { processes.set(runId, { status: 'stopped' }); return { requested: true }; },
    async readArtifact({ artifactRef }) { return artifacts.get(artifactRef); },
  };
  const resolveTarget = async ({ projectId, targetId }) => ({ projectId, targetId,
    identity: digest('synthetic-target'), workspaceRef: 'synthetic-workspace' });
  const authorizeRun = async ({ runId, planHash, targetIdentity, executionMode, scope }) => {
    assert.equal(scope, 'controlled-execution');
    assert.equal(executionMode, 'synthetic');
    grants++;
    await onGrant?.(grants);
    return { enabled: true, runId, planHash, targetIdentity, generation: 'synthetic-grant-v1' };
  };
  const service = createControlledExecution({ directory, executionMode: mode,
    adapter, resolveTarget, authorizeRun, scheduleDeadline });
  const createRun = async (steps = 1) => {
    const preview = await service.preview({ plan: plan(steps) });
    const confirmed = await service.confirm({ runId: preview.runId,
      planHash: preview.planHash, confirmed: true });
    return { preview, confirmed };
  };
  return { directory, service, adapter, artifacts, processes, resolveTarget,
    authorizeRun, createRun, get calls() { return calls; }, get grants() { return grants; } };
}

async function until(service, runId, expected) {
  for (let attempt = 0; attempt < 50; attempt++) {
    const result = await service.status({ runId });
    if (result.status === expected) return result;
    await new Promise(resolve => setTimeout(resolve, 2));
  }
  assert.fail(`run ${runId} did not reach ${expected}`);
}
async function untilCalls(fixture, expected) {
  for (let attempt = 0; attempt < 50; attempt++) {
    if (fixture.calls === expected) return;
    await new Promise(resolve => setTimeout(resolve, 2));
  }
  assert.fail(`executor did not receive ${expected} call(s)`);
}
async function untilRelease(getRelease) {
  for (let attempt = 0; attempt < 50; attempt++) {
    if (getRelease()) return getRelease();
    await new Promise(resolve => setTimeout(resolve, 2));
  }
  assert.fail('grant did not reach the controlled delay');
}

test('default disabled discovers no target and cannot start execution', async t => {
  const f = await fixture(t, { mode: 'disabled' });
  assert.equal(f.service.capabilities().enabled, false);
  await assert.rejects(f.service.preview({ plan: plan() }), /能力未接入/);
  assert.equal((await f.service.list()).items.length, 0);
});

test('one bounded synthetic target saves status, verifies artifact and allows readback', async t => {
  const f = await fixture(t);
  const { preview, confirmed } = await f.createRun();
  assert.equal(confirmed.status, 'ready');
  assert.equal(confirmed.run.authGeneration, 'synthetic-grant-v1');
  const started = await f.service.start({ runId: preview.runId });
  assert.equal(started.newlyStarted, true);
  const final = await until(f.service, preview.runId, 'completed');
  assert.equal(final.run.steps[0].status, 'verified');
  const artifact = await f.service.collect({ runId: preview.runId, stepId: 'step-1' });
  assert.match(artifact.content, /Synthetic verified artifact/);
  assert.equal(artifact.artifact.sha256, digest(artifact.content));
  assert.equal(f.calls, 1);
  const duplicate = await f.service.start({ runId: preview.runId });
  assert.equal(duplicate.status, 'completed');
  assert.equal(f.calls, 1);
});

test('two-step workflow needs a separate human gate and explicit second start', async t => {
  const f = await fixture(t);
  const { preview } = await f.createRun(2);
  assert.deepEqual(preview.budgetSummary, { scope: 'per-step', stepCount: 2,
    allocatedMinutesAcrossSteps: 2, allocatedTurnsAcrossSteps: 4,
    excludesHumanGateWait: true });
  await f.service.start({ runId: preview.runId });
  await until(f.service, preview.runId, 'awaiting_gate');
  assert.equal(f.calls, 1);
  assert.equal((await f.service.start({ runId: preview.runId })).status, 'awaiting_gate');
  assert.equal(f.calls, 1);
  const gate = await f.service.gatePreview({ runId: preview.runId });
  assert.equal(gate.firstStep.status, 'verified');
  await assert.rejects(f.service.gate({ runId: preview.runId,
    gateHash: digest('wrong'), confirmed: true }), /人工门预览已变化/);
  const approved = await f.service.gate({ runId: preview.runId,
    gateHash: gate.gateHash, confirmed: true });
  assert.equal(approved.status, 'ready');
  assert.equal(f.calls, 1);
  await f.service.start({ runId: preview.runId });
  await until(f.service, preview.runId, 'completed');
  assert.equal(f.calls, 2);
});

test('missing original confirmation is durably closed, delayed confirm cannot create a run', async t => {
  const f = await fixture(t);
  const preview = await f.service.preview({ plan: plan() });
  const closed = await f.service.resolve({ runId: preview.runId });
  assert.deepEqual(closed, { status: 'not_started', closed: true });
  const late = await f.service.confirm({ runId: preview.runId,
    planHash: preview.planHash, confirmed: true });
  assert.equal(late.status, 'not_started');
  assert.equal((await f.service.list()).items.length, 0);
  const restarted = createControlledExecution({ directory: f.directory,
    executionMode: 'synthetic', adapter: f.adapter,
    resolveTarget: f.resolveTarget, authorizeRun: f.authorizeRun });
  assert.equal((await restarted.resolve({ runId: preview.runId })).status, 'not_started');
});

test('unknown process after restart remains unknown and never replays step', async t => {
  const f = await fixture(t, { executeRound: async (input, { processes }) => {
    processes.set(input.runId, { status: 'unknown' });
    return new Promise(() => {});
  } });
  const { preview } = await f.createRun();
  await f.service.start({ runId: preview.runId });
  await untilCalls(f, 1);
  assert.equal(f.calls, 1);
  const restarted = createControlledExecution({ directory: f.directory,
    executionMode: 'synthetic', adapter: f.adapter,
    resolveTarget: f.resolveTarget, authorizeRun: f.authorizeRun });
  const checked = await restarted.check({ runId: preview.runId });
  assert.equal(checked.status, 'unknown');
  assert.equal((await restarted.start({ runId: preview.runId })).status, 'unknown');
  assert.equal(f.calls, 1);
});

test('stop asks adapter, probes original process and does not claim completion', async t => {
  const f = await fixture(t, { executeRound: async (input, { processes }) => {
    processes.set(input.runId, { status: 'running' });
    return new Promise(() => {});
  } });
  const { preview } = await f.createRun();
  await f.service.start({ runId: preview.runId });
  await untilCalls(f, 1);
  const result = await f.service.stop({ runId: preview.runId });
  assert.equal(result.status, 'stopped');
  assert.equal(result.run.steps[0].status, 'stopped');
  assert.equal(f.calls, 1);
});

test('stop request and a late execute result remain stopping until process probe confirms exit', async t => {
  let deliver;
  const f = await fixture(t, { executeRound: async (input, { processes }) => {
    processes.set(input.runId, { status: 'running' });
    return new Promise(resolve => { deliver = resolve; });
  } });
  f.adapter.stop = async () => ({ requested: true });
  const { preview } = await f.createRun();
  await f.service.start({ runId: preview.runId });
  await untilCalls(f, 1);
  const requested = await f.service.stop({ runId: preview.runId });
  assert.equal(requested.status, 'stopping');
  deliver({ status: 'failed', reason: 'late response' });
  await new Promise(resolve => setTimeout(resolve, 10));
  assert.equal((await f.service.status({ runId: preview.runId })).status, 'stopping');
  f.processes.set(preview.runId, { status: 'stopped' });
  const checked = await f.service.check({ runId: preview.runId });
  assert.equal(checked.status, 'stopped');
  assert.equal(checked.run.steps[0].result.acceptanceMet, false);
});

test('a plan not yet executing is cancelled without claiming that a process stopped', async t => {
  const f = await fixture(t);
  const { preview } = await f.createRun();
  const cancelled = await f.service.stop({ runId: preview.runId });
  assert.equal(cancelled.status, 'cancelled');
  assert.equal(cancelled.run.steps[0].status, 'ready');
});

test('timeout remains probeable and stoppable by original ID until exit is confirmed', { timeout: 5000 }, async t => {
  let releaseLaunch, announceLaunch, announceExecution, fireDeadline;
  const launchReached = new Promise(resolve => { announceLaunch = resolve; });
  const executionEntered = new Promise(resolve => { announceExecution = resolve; });
  const f = await fixture(t, {
    onGrant: count => count === 4 ? new Promise(resolve => {
      releaseLaunch = resolve;
      announceLaunch();
    }) : undefined,
    scheduleDeadline: (fire, milliseconds) => {
      assert.equal(milliseconds, 60_000);
      fireDeadline = fire;
      return setTimeout(fire, milliseconds);
    },
    executeRound: async (input, { processes }) => {
      processes.set(input.runId, { status: 'running' });
      announceExecution();
      return new Promise(() => {});
    },
  });
  f.adapter.stop = async () => ({ requested: true });
  const { preview } = await f.createRun();
  await f.service.start({ runId: preview.runId });
  // start returns a durable starting state; async launch I/O has no 100ms guarantee.
  await launchReached;
  assert.equal((await f.service.status({ runId: preview.runId })).status, 'starting');
  assert.equal(f.calls, 0);
  assert.equal(fireDeadline, undefined, 'execution budget starts only when launch is ready');
  releaseLaunch();
  await executionEntered;
  assert.equal(f.calls, 1);
  fireDeadline();
  const timedOut = await until(f.service, preview.runId, 'unknown');
  assert.ok(timedOut.run.stopRequestedAt);
  assert.equal((await f.service.check({ runId: preview.runId })).processStatus, 'running');
  const requested = await f.service.stop({ runId: preview.runId });
  assert.equal(requested.status, 'stopping');
  f.processes.set(preview.runId, { status: 'stopped' });
  const confirmed = await f.service.check({ runId: preview.runId });
  assert.equal(confirmed.status, 'stopped');
  assert.equal((await f.service.start({ runId: preview.runId })).status, 'stopped');
  assert.equal(f.calls, 1);
});

test('check during durable starting cannot mark an unlaunched executor unknown', async t => {
  let release;
  const f = await fixture(t, { onGrant: count => count === 4 ?
    new Promise(resolve => { release = resolve; }) : undefined });
  const { preview } = await f.createRun();
  const started = await f.service.start({ runId: preview.runId });
  assert.equal(started.status, 'starting');
  const checked = await f.service.check({ runId: preview.runId });
  assert.equal(checked.status, 'starting');
  assert.equal(checked.processStatus, 'not-launched');
  assert.equal(f.calls, 0);
  (await untilRelease(() => release))();
  await until(f.service, preview.runId, 'completed');
  assert.equal(f.calls, 1);
});

test('stop during durable starting cancels before executor call', async t => {
  let release;
  const f = await fixture(t, { onGrant: count => count === 4 ?
    new Promise(resolve => { release = resolve; }) : undefined });
  const { preview } = await f.createRun();
  await f.service.start({ runId: preview.runId });
  assert.equal((await f.service.stop({ runId: preview.runId })).status, 'cancelled');
  (await untilRelease(() => release))();
  await new Promise(resolve => setTimeout(resolve, 10));
  assert.equal(f.calls, 0);
  assert.equal((await f.service.check({ runId: preview.runId })).status, 'cancelled');
});
