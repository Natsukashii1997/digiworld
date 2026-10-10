import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { addSlot, nightV2Of } from '../src/night-v2-model.js';
import { createNightV2Harness } from '../server/night-v2-harness.mjs';

const NIGHT = '2026-10-07';
const GREEN = 'a'.repeat(40);
const source = { runId: '11111111-1111-4111-8111-111111111111', slotId: 'old-slot',
  projectId: 'project-demo', branch: 'night/2026-10-06-push-old', lastGreenSha: GREEN,
  operationId: '22222222-2222-4222-8222-222222222222' };

async function fixture(t, { continuation = true, backlog = 0, baseSha = GREEN,
  verified = true } = {}) {
  const directory = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'night-v2-continue-')));
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  const main = path.join(directory, 'main');
  const worktree = path.join(directory, 'worktree');
  await fs.mkdir(main);
  await fs.mkdir(worktree);
  const state = addSlot({}, { chipId: 'push', projectId: 'project-demo', goal: '接着修复合成问题',
    acceptance: ['隔离测试通过'], ...(continuation ? { continueFrom: source } : {}) }, { id: 'next-slot' });
  let time = Date.parse('2026-10-07T14:55:00Z');
  let prepared = null;
  const harness = createNightV2Harness({ directory, readWorkspace: async () => state,
    clock: () => time, executionMode: 'synthetic',
    verifyContinuation: async () => verified,
    countUnresolvedBranches: async () => backlog,
    worktrees: {
      identity: async ({ slot }) => ({ projectId: slot.projectId, realpath: main, mainSha: GREEN }),
      prepare: async input => { prepared = input; return { path: worktree, branch: input.branch, baseSha }; },
      checkpoint: async () => ({ sha: 'b'.repeat(40) }),
    },
    preflight: async () => ({ status: 'passed' }),
    quota: async () => ({ estimatePercent: 5 }),
    executeRound: async () => ({ status: 'verified', acceptanceMet: true,
      diffSha256: 'diff', testSha256: 'test', minutes: 1 }),
  });
  return { harness, state, setTime: value => { time = Date.parse(value); }, get prepared() { return prepared; } };
}

test('旧插槽仍可验证；续跑槽必须由服务端核验原操作', async t => {
  const plain = await fixture(t, { continuation: false });
  assert.equal(nightV2Of(plain.state).slots[0].continueFrom, undefined);
  const continued = await fixture(t, { verified: false });
  assert.deepEqual(nightV2Of(continued.state).slots[0].continueFrom, source);
  await assert.rejects(continued.harness.preview({ expectedPlanRevision: 1 }),
    { code: 'CONTINUATION_UNVERIFIED' });
});

test('续跑沿用旧分支和最后绿提交；适配器不能从别的提交建立', async t => {
  const okay = await fixture(t);
  const preview = await okay.harness.preview({ expectedPlanRevision: 1 });
  assert.equal(preview.slots[0].branch, source.branch);
  await okay.harness.confirm({ token: preview.token, confirmed: true });
  await okay.harness.checkStart({ nightDate: NIGHT });
  okay.setTime('2026-10-07T15:00:00Z');
  await okay.harness.tick();
  assert.equal(okay.prepared.branch, source.branch);
  assert.deepEqual(okay.prepared.slot.continueFrom, source);
  const sources = await okay.harness.listMorningSources();
  assert.equal(sources.items.length, 1);
  assert.equal(sources.items[0].slots[0].lastGreenSha, 'b'.repeat(40));

  const bad = await fixture(t, { baseSha: 'c'.repeat(40) });
  const offer = await bad.harness.preview({ expectedPlanRevision: 1 });
  await bad.harness.confirm({ token: offer.token, confirmed: true });
  await bad.harness.checkStart({ nightDate: NIGHT });
  bad.setTime('2026-10-07T15:00:00Z');
  const status = await bad.harness.tick();
  assert.equal(status.status, 'unknown');
  assert.equal(status.slots[0].status, 'unknown');
});

test('跨夜同项目三条未决分支挡住推进芯片，检查项保留明确原因', async t => {
  const f = await fixture(t, { backlog: 3 });
  const preview = await f.harness.preview({ expectedPlanRevision: 1 });
  await f.harness.confirm({ token: preview.token, confirmed: true });
  const status = await f.harness.checkStart({ nightDate: NIGHT });
  assert.equal(status.status, 'blocked');
  assert.equal(status.slots[0].status, 'skipped');
  const backlog = status.checks.items.find(item => item.id === 'backlog');
  assert.equal(backlog.status, 'failed');
  assert.match(backlog.reason, /3 个未处理分支/);
});
