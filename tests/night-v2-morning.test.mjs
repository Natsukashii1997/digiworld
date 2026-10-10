import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { addSlot, nightV2Of } from '../src/night-v2-model.js';
import { createNightV2Harness } from '../server/night-v2-harness.mjs';
import { createNightV2Morning } from '../server/night-v2-morning.mjs';
import { createLocalCapabilityState } from '../server/local-capability-state.mjs';

const NIGHT = '2026-10-07';
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const git = (cwd, ...args) => execFileSync('git', ['-C', cwd, ...args],
  { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();

function contentFor(chipId, branch) {
  if (chipId === 'learn') return { topic: '合成主题', whyLearn: '验证一个判断',
    steps: [{ tag: '新增', sourceIds: ['a'], learned: '新证据', correction: '' }],
    insights: [{ text: '两个来源印证的发现', sourceIds: ['a', 'b'], verification: 'crosschecked' }],
    suggestions: { learning: ['补读方法'], project: ['写测试'], cognition: ['保留反例'] },
    sources: [{ id: 'a', title: '来源 A', url: 'https://example.org/a' },
      { id: 'b', title: '来源 B', url: 'https://example.org/b' }] };
  if (chipId === 'push') return { branch,
    changedFiles: [{ path: 'src/synthetic.js', added: 2, deleted: 0 }],
    rounds: [{ round: 1, executor: 'codex', reviewer: 'claude', result: 'accepted',
      evidence: 'synthetic-review:1' }],
    mainConflict: { status: 'clean', evidence: 'synthetic-conflict-check:1' } };
  return { cases: [{ id: 'case-1', name: '正常路径', status: 'passed', expected: '通过',
    actual: '通过', evidence: 'synthetic-test:1' }],
    defects: [], newTests: [{ path: 'tests/synthetic.test.js', result: 'passed',
      evidence: 'synthetic-test:2' }] };
}

async function fixture(t, chipIds = ['learn', 'push', 'test']) {
  const directory = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'night-v2-morning-')));
  t.after(async () => { await fs.rm(directory, { recursive: true, force: true }); });
  const repo = path.join(directory, 'source');
  await fs.mkdir(repo);
  git(repo, 'init', '-b', 'main');
  git(repo, 'config', 'user.email', 'synthetic@example.invalid');
  git(repo, 'config', 'user.name', 'Synthetic Night');
  await fs.writeFile(path.join(repo, 'README.md'), 'synthetic repo\n');
  git(repo, 'add', '.'); git(repo, 'commit', '-m', 'fixture base');
  let state = {};
  for (const chipId of chipIds) state = addSlot(state, {
    chipId, projectId: chipId === 'learn' ? '' : 'synthetic-project',
    goal: `合成 ${chipId} 目标`, acceptance: [`${chipId} 验收一`, `${chipId} 验收二`],
  }, { id: `slot-${chipId}` });
  const controls = { time: Date.parse('2026-10-07T14:55:00.000Z'), artifacts: new Map(),
    receipts: new Map(), outputMode: new Map(), acceptanceMode: new Map() };
  const worktrees = {
    async identity({ slot }) { return { projectId: slot.projectId,
      realpath: await fs.realpath(repo), mainSha: git(repo, 'rev-parse', 'HEAD') }; },
    async prepare({ slot, branch }) {
      const target = path.join(directory, 'worktrees', slot.id);
      await fs.mkdir(path.dirname(target), { recursive: true });
      git(repo, 'worktree', 'add', '-b', branch, target, 'HEAD');
      return { path: target, branch, appOwned: true };
    },
    async checkpoint({ kind, slot, round, worktree }) {
      await fs.writeFile(path.join(worktree.path, `round-${round}-${kind}.txt`), `${slot.id}:${kind}\n`);
      git(worktree.path, 'add', '.'); git(worktree.path, 'commit', '-m', `synthetic ${kind}`);
      return { sha: git(worktree.path, 'rev-parse', 'HEAD') };
    },
  };
  const harness = createNightV2Harness({ directory, readWorkspace: async () => state,
    clock: () => controls.time, executionMode: 'synthetic', worktrees,
    preflight: async () => ({ status: 'passed' }),
    quota: async () => ({ estimatePercent: 5 }),
    executeRound: async ({ runId, slot, worktree }) => {
      const outputKind = { learn: 'learning-report', push: 'branch-delivery',
        test: 'test-report' }[slot.chipId];
      const item = { schema: 'night-v2-output', version: 1, kind: outputKind,
        runId, slotId: slot.id, summary: `${slot.chipId} 合成结果`,
        acceptance: slot.acceptance.map((criterion, index) => ({ criterion,
          status: controls.acceptanceMode.get(slot.id) === 'unmet' && index === 1 ? 'unmet' : 'met',
          evidence: `synthetic:${slot.id}:${index}` })),
        content: contentFor(slot.chipId, worktree.branch) };
      if (controls.outputMode.get(slot.id) === 'invalid') delete item.content.cases?.[0]?.evidence;
      if (controls.outputMode.get(slot.id) === 'cross-source') item.slotId = 'slot-other';
      const bytes = Buffer.from(JSON.stringify(item));
      const artifactRef = `night-v2-artifact:${slot.id}-1`;
      controls.artifacts.set(artifactRef, bytes);
      const receipt = { artifactRef, sha256: sha(bytes) };
      controls.receipts.set(slot.id, receipt);
      return { status: 'verified', acceptanceMet: true, diffSha256: 'diff-1',
        testSha256: 'test-1', minutes: 1, outputReceipt: receipt };
    },
  });
  const morning = createNightV2Morning({ directory,
    readRunSource: ({ runId }) => harness.morningSource({ runId }),
    readArtifact: async ({ artifactRef }) => {
      if (!controls.artifacts.has(artifactRef))
        throw Object.assign(new Error('synthetic missing artifact'), { code: 'ENOENT' });
      return controls.artifacts.get(artifactRef);
    }, clock: () => controls.time });
  const start = async () => {
    const preview = await harness.preview({ expectedPlanRevision: nightV2Of(state).revision });
    await harness.confirm({ token: preview.token, confirmed: true });
    const checked = await harness.checkStart({ nightDate: NIGHT });
    controls.time = Date.parse('2026-10-07T15:00:00.000Z');
    for (let i = 0; i < chipIds.length + 1; i++) await harness.tick();
    return checked.runId;
  };
  return { directory, harness, morning, controls, start,
    get state() { return state; }, set state(value) { state = value; } };
}

test('07:05 前无报告；三类有效产物翻面、逐条验收和重复调和幂等', async t => {
  const f = await fixture(t);
  const runId = await f.start();
  const source = await f.harness.morningSource({ runId });
  assert.equal(source.schema, 'night-v2-morning-source');
  assert.equal(source.slots[1].chipRevision, 1);
  assert.equal(source.slots[1].logs[0].outputReceipt.artifactRef, 'night-v2-artifact:slot-push-1');
  f.controls.time = Date.parse('2026-10-07T23:04:59.000Z');
  assert.deepEqual(await f.morning.reconcile({ runId }), {
    schema: 'night-v2-morning-reconcile', runId, status: 'not_due',
    readyAt: '2026-10-07T23:05:00.000Z', revision: null });
  assert.deepEqual((await f.morning.list()).items, []);
  await assert.rejects(f.morning.read({ runId }), { code: 'REPORT_NOT_FOUND' });
  f.controls.time += 1000;
  const first = await f.morning.reconcile({ runId });
  assert.deepEqual({ status: first.status, revision: first.revision }, { status: 'ready', revision: 1 });
  const same = await f.morning.reconcile({ runId });
  assert.equal(same.revision, 1);
  const report = await f.morning.read({ runId });
  assert.equal(report.reportId, `night-v2-morning-${runId}`);
  assert.deepEqual(report.counts, { completed: 3, partial: 0, failed: 0, notStarted: 0, unknown: 0 });
  assert.equal(report.slots[0].chip.name, '深度学习');
  assert.deepEqual(report.slots[0].acceptance.map(item => item.status), ['met', 'met']);
  assert.equal(report.slots[1].branch.startsWith('night/'), true);
  assert.equal(report.slots[1].roundCount, 1);
  assert.equal(report.newFindings[0].sourceCount, 2);
  assert.equal(report.quotaEstimatePercent > 5, true);
  assert.equal(report.checks.total, 6);
  assert.equal(Object.hasOwn(report.slots[0], '_outputReceipt'), false);
  const output = await f.morning.output({ runId, slotId: 'slot-learn' });
  assert.equal(output.validation.status, 'valid');
  assert.equal(output.output.kind, 'learning-report');
  const list = await f.morning.list();
  assert.equal(list.items[0].reportId, report.reportId);
  assert.equal(list.items[0].decisionPending, true);
});

test('无效 schema/来源交叉记部分完成；逐条未满足不由 runner 布尔值覆盖', async t => {
  const f = await fixture(t, ['learn', 'push', 'test']);
  f.controls.outputMode.set('slot-test', 'invalid');
  f.controls.outputMode.set('slot-learn', 'cross-source');
  f.controls.acceptanceMode.set('slot-push', 'unmet');
  const runId = await f.start();
  f.controls.time = Date.parse('2026-10-07T23:05:00.000Z');
  await f.morning.reconcile({ runId });
  const report = await f.morning.read({ runId });
  assert.deepEqual(report.counts, { completed: 0, partial: 3, failed: 0, notStarted: 0, unknown: 0 });
  assert.deepEqual(report.slots.map(item => item.validation.status), ['invalid', 'valid', 'invalid']);
  assert.equal(report.slots[1].acceptance[1].status, 'unmet');
  assert.equal((await f.morning.output({ runId, slotId: 'slot-test' })).output, null);
  assert.equal(report.newFindings.length, 0);
});

test('SHA 不符为未知且不暴露正文；修复来源后追加 revision，不覆写旧报告', async t => {
  const f = await fixture(t, ['test']);
  const runId = await f.start();
  f.controls.time = Date.parse('2026-10-07T23:05:00.000Z');
  await f.morning.reconcile({ runId });
  const original = await f.morning.read({ runId });
  assert.equal(original.counts.completed, 1);
  const receipt = f.controls.receipts.get('slot-test');
  f.controls.artifacts.set(receipt.artifactRef, Buffer.from('{"forged":true}'));
  const view = await f.morning.output({ runId, slotId: 'slot-test' });
  assert.equal(view.validation.status, 'unknown');
  assert.equal(view.output, null);
  const second = await f.morning.reconcile({ runId });
  assert.equal(second.revision, 2);
  assert.equal(second.status, 'unknown');
  const revised = await f.morning.read({ runId });
  assert.equal(revised.counts.unknown, 1);
  assert.equal(revised.revision, 2);
  assert.equal(revised.previousSha256?.length, 64);
  assert.equal((await f.morning.reconcile({ runId })).revision, 2);
});

test('缺失产物为部分完成，回读不可用为未知；旧 v1 数据不构成晨报来源', async t => {
  const f = await fixture(t, ['test']);
  const runId = await f.start();
  const receipt = f.controls.receipts.get('slot-test');
  f.controls.artifacts.delete(receipt.artifactRef);
  f.controls.time = Date.parse('2026-10-07T23:05:00.000Z');
  await f.morning.reconcile({ runId });
  const missing = await f.morning.read({ runId });
  assert.equal(missing.slots[0].validation.status, 'missing');
  assert.equal(missing.slots[0].status, 'partial');
  const unavailable = createNightV2Morning({ directory: f.directory,
    readRunSource: ({ runId: id }) => f.harness.morningSource({ runId: id }),
    clock: () => f.controls.time });
  await unavailable.reconcile({ runId });
  assert.equal((await unavailable.read({ runId })).slots[0].status, 'unknown');
  await assert.rejects(unavailable.reconcile({ runId: 'old-v1-approval' }), { code: 'RUN_NOT_FOUND' });
});

test('07:05 仍在运行且无回执只报未知，不声称完成', async t => {
  const f = await fixture(t, ['test']);
  const preview = await f.harness.preview({ expectedPlanRevision: nightV2Of(f.state).revision });
  await f.harness.confirm({ token: preview.token, confirmed: true });
  const checked = await f.harness.checkStart({ nightDate: NIGHT });
  f.controls.time = Date.parse('2026-10-07T23:05:00.000Z');
  const result = await f.morning.reconcile({ runId: checked.runId });
  assert.equal(result.status, 'unknown');
  const report = await f.morning.read({ runId: checked.runId });
  assert.equal(report.runStatus, 'ready');
  assert.equal(report.slots[0].validation.status, 'missing');
  assert.equal(report.slots[0].status, 'not_started');
  assert.equal(report.counts.completed, 0);
});

test('报告生成后来源变化，GET output 返回未知而不泄露旧产物', async t => {
  const f = await fixture(t, ['test']);
  const runId = await f.start();
  f.controls.time = Date.parse('2026-10-07T23:05:00.000Z');
  await f.morning.reconcile({ runId });
  const alteredSource = createNightV2Morning({ directory: f.directory,
    readRunSource: async args => {
      const source = await f.harness.morningSource(args);
      source.slots[0].goal = '来源被改变';
      return source;
    },
    readArtifact: async ({ artifactRef }) => f.controls.artifacts.get(artifactRef),
    clock: () => f.controls.time });
  const view = await alteredSource.output({ runId, slotId: 'slot-test' });
  assert.equal(view.validation.status, 'unknown');
  assert.equal(view.output, null);
});

test('计划换版后旧夜巡仍从服务端冻结记录回读，不取当前 workspace', async t => {
  const f = await fixture(t, ['push']);
  const runId = await f.start();
  const original = await f.harness.morningSource({ runId });
  f.state = addSlot(f.state, { chipId: 'brief', goal: '新计划', acceptance: ['一页'] },
    { id: 'slot-new' });
  const preview = await f.harness.preview({ expectedPlanRevision: nightV2Of(f.state).revision });
  await f.harness.confirm({ token: preview.token, confirmed: true });
  const archived = await f.harness.morningSource({ runId });
  assert.deepEqual(archived, original);
});

test('历史达到容量时阻断新批准，不静默删除旧来源', async t => {
  const f = await fixture(t, ['push']);
  const runId = await f.start();
  const journal = createLocalCapabilityState(f.directory, {
    folder: 'night-v2-ledger',
    initial: { schema: 'night-v2-ledger', preview: null, approval: null, run: null, history: [] },
    validateValue: value => value,
  });
  const before = await journal.read();
  const extended = structuredClone(before.value);
  extended.history = Array.from({ length: 400 }, (_, index) => ({
    nightDate: `old-${index}`, runId: `synthetic-${index}`, status: 'completed', planHash: 'legacy',
  }));
  await journal.write(extended, { expectedSha256: before.sha256, action: 'synthetic-fill' });
  const preview = await f.harness.preview({ expectedPlanRevision: nightV2Of(f.state).revision });
  await assert.rejects(f.harness.confirm({ token: preview.token, confirmed: true }), { code: 'HISTORY_LIMIT' });
  const after = await journal.read();
  assert.equal(after.value.history.length, 400);
  assert.equal(after.value.history[0].runId, 'synthetic-0');
  assert.equal((await f.harness.morningSource({ runId })).runId, runId);
});
