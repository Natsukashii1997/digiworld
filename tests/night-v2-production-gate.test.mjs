import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { inspectNightV2Adapter } from '../server/night-v2-production-gate.mjs';

const scope = () => ({ runId: randomUUID(), nightDate: '2026-10-07',
  planHash: 'a'.repeat(64), slotId: 'slot-1', targetId: 'codex',
  projectId: 'project-1', worktreeIdentity: 'b'.repeat(64),
  maxMinutes: 45, maxRounds: 4 });
const discover = async ({ targetId, projectId, worktreeIdentity, maxMinutes, maxRounds }) => ({
  recognized: true, identity: 'c'.repeat(64), targetId, projectId,
  worktreeIdentity, maxMinutes, maxRounds,
  canExecute: true, canStop: true, canProbe: true,
  canCollect: true, hardLimits: true, isolation: 'worktree',
});
const authorizeRun = async input => ({ ...input, enabled: true,
  expiresAt: '2026-10-08T00:00:00.000Z', generation: 'synthetic-night-grant' });

test('missing adapter or grant stays unavailable', async () => {
  const result = await inspectNightV2Adapter({ scope: scope() });
  assert.equal(result.readyForIsolationTest, false);
  assert.equal(result.productionReady, false);
});
test('exact synthetic adapter and independent night grant pass only contract readiness', async () => {
  const result = await inspectNightV2Adapter({ scope: scope(), discover,
    authorizeRun, clock: () => Date.parse('2026-10-07T20:00:00.000Z') });
  assert.equal(result.readyForIsolationTest, true);
  assert.equal(result.productionReady, false);
});
test('wrong scope, missing hard stop, and expired authorization fail closed', async () => {
  const locked = scope();
  const wrong = await inspectNightV2Adapter({ scope: locked, discover,
    authorizeRun: async input => ({ ...await authorizeRun(input), scope: 'agent' }),
    clock: () => Date.parse('2026-10-07T20:00:00.000Z') });
  assert.equal(wrong.readyForIsolationTest, false);
  const noStop = await inspectNightV2Adapter({ scope: locked,
    discover: async input => ({ ...await discover(input), canStop: false }),
    authorizeRun, clock: () => Date.parse('2026-10-07T20:00:00.000Z') });
  assert.equal(noStop.readyForIsolationTest, false);
  const expired = await inspectNightV2Adapter({ scope: locked, discover,
    authorizeRun, clock: () => Date.parse('2026-10-08T01:00:00.000Z') });
  assert.equal(expired.readyForIsolationTest, false);
});
test('same run and plan hash cannot authorize a different minute or round budget', async () => {
  const locked = scope();
  const changedGrant = await inspectNightV2Adapter({ scope: locked, discover,
    authorizeRun: async input => ({ ...await authorizeRun(input), maxMinutes: input.maxMinutes + 1 }),
    clock: () => Date.parse('2026-10-07T20:00:00.000Z') });
  assert.equal(changedGrant.readyForIsolationTest, false);
  const changedAdapter = await inspectNightV2Adapter({ scope: locked,
    discover: async input => ({ ...await discover(input), maxRounds: input.maxRounds + 1 }),
    authorizeRun, clock: () => Date.parse('2026-10-07T20:00:00.000Z') });
  assert.equal(changedAdapter.readyForIsolationTest, false);
});
