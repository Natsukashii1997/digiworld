import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { addSlot, nightV2Of } from '../src/night-v2-model.js';
import { createNightV2Harness } from '../server/night-v2-harness.mjs';

const NIGHT = '2026-10-07';
const at = clock => { clock.now = Date.parse('2026-10-07T14:55:00.000Z'); return clock; };
const git = (cwd, ...args) => execFileSync('git', ['-C', cwd, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();

async function fixture(t, chips = ['push'], { mode = 'synthetic', slotIds = [], pollMs = 1000 } = {}) {
  const directory = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'night-v2-harness-')));
  t.after(async () => { await fs.rm(directory, { recursive: true, force: true }); });
  const repo = path.join(directory, 'source');
  await fs.mkdir(repo);
  git(repo, 'init', '-b', 'main');
  git(repo, 'config', 'user.email', 'synthetic@example.invalid');
  git(repo, 'config', 'user.name', 'Synthetic Night');
  await fs.writeFile(path.join(repo, 'README.md'), 'synthetic fixture\n');
  git(repo, 'add', '.'); git(repo, 'commit', '-m', 'fixture base');
  let state = { night: { draft: { time: '23:00', end: '07:00', tasks: [] }, approved: true } };
  for (const [index, chipId] of chips.entries()) state = addSlot(state, {
    chipId, projectId: chipId === 'learn' || chipId === 'brief' ? '' : 'synthetic-project',
    goal: `合成目标 ${index + 1}`, acceptance: [`合成验收 ${index + 1}`],
  }, { id: slotIds[index] ?? `slot-${index + 1}` });
  const clock = at({});
  const controls = { clock, failures: new Map(), quotaPercent: 5, results: [], calls: [], probe: null,
    hold: null, notify: [], checkpoints: new Map(), checkpointCrashOnce: false,
    prepareCrashOnce: false };
  const worktrees = {
    async identity({ slot }) { return { projectId: slot.projectId, realpath: await fs.realpath(repo),
      mainSha: git(repo, 'rev-parse', 'HEAD') }; },
    async prepare({ slot, branch }) {
      const folder = path.join(directory, 'worktrees', slot.id);
      await fs.mkdir(path.dirname(folder), { recursive: true });
      git(repo, 'worktree', 'add', '-b', branch, folder, 'HEAD');
      controls.calls.push(`prepare:${slot.id}`);
      if (controls.prepareCrashOnce) { controls.prepareCrashOnce = false; throw new Error('synthetic lost receipt'); }
      return { path: folder, branch };
    },
    async inspect({ slot, branch }) {
      const folder = path.join(directory, 'worktrees', slot.id);
      try { await fs.stat(folder); }
      catch { return { status: 'absent' }; }
      return { status: 'prepared', worktree: { path: folder, branch } };
    },
    async checkpoint({ kind, slot, round, worktree, operationId }) {
      if (controls.checkpoints.has(operationId)) return { sha: controls.checkpoints.get(operationId) };
      await fs.writeFile(path.join(worktree.path, `round-${round}-${kind}.txt`), `${slot.id}:${kind}:${round}\n`);
      git(worktree.path, 'add', '.'); git(worktree.path, 'commit', '-m', `synthetic ${kind} ${round}`);
      const sha = git(worktree.path, 'rev-parse', 'HEAD');
      git(worktree.path, 'tag', `night-${slot.id}-${round}-${kind}`);
      controls.calls.push(`checkpoint:${kind}:${slot.id}:${round}`);
      controls.checkpoints.set(operationId, sha);
      if (controls.checkpointCrashOnce) { controls.checkpointCrashOnce = false; throw new Error('synthetic lost receipt'); }
      return { sha };
    },
    async restore({ slot, sha, worktree }) {
      git(worktree.path, 'reset', '--hard', sha);
      controls.calls.push(`restore:${slot.id}:${sha}`);
      return { restored: true };
    },
  };
  const options = { directory, readWorkspace: async () => state, clock: () => clock.now,
    deadlinePollMs: pollMs,
    executionMode: mode, worktrees,
    preflight: async ({ id, scope, slot }) => ({ status: controls.failures.get(`${id}:${slot?.id ?? scope}`) ??
      controls.failures.get(id) ?? 'passed', reason: controls.failures.has(id) ? `合成 ${id} 失败` : null }),
    quota: async () => ({ estimatePercent: controls.quotaPercent, rateLimitUntil: null }),
    executeRound: async ({ slot, round, signal }) => {
      controls.calls.push(`execute:${slot.id}:${round}`);
      if (controls.hold) return controls.hold({ slot, round, signal });
      const result = controls.results.shift() ?? { status: 'verified', acceptanceMet: true,
        diffSha256: `diff-${slot.id}-${round}`, testSha256: `test-${slot.id}-${round}`, minutes: 1 };
      if (result instanceof Error) throw result;
      return result;
    },
    probeProcess: async () => controls.probe ?? { status: 'unknown' },
    notify: async message => { controls.notify.push(message); },
  };
  const harness = createNightV2Harness(options);
  const approve = async () => {
    const preview = await harness.preview({ expectedPlanRevision: nightV2Of(state).revision });
    await harness.confirm({ token: preview.token, confirmed: true });
    return preview;
  };
  return { harness, controls, approve, directory, repo, options,
    get state() { return state; }, set state(value) { state = value; } };
}

async function ledgerValue(directory) {
  const folder = path.join(directory, 'night-v2-ledger');
  const files = (await fs.readdir(folder)).filter(name => /^[a-f0-9-]{36}\.json$/.test(name));
  const rows = await Promise.all(files.map(async name => JSON.parse(await fs.readFile(path.join(folder, name), 'utf8'))));
  return rows.sort((a, b) => a.sequence - b.sequence).at(-1).after;
}

test('默认禁用且 v1 批准不能启动 v2；无运行状态只读', async t => {
  const f = await fixture(t, ['push'], { mode: 'disabled' });
  const status = await f.harness.status();
  assert.equal(status.executionMode, "disabled");
  assert.deepEqual({ schema: status.schema, runId: status.runId, status: status.status,
    planRevision: status.planRevision, checks: status.checks },
  { schema: 'night-v2-status', runId: null, status: 'planning', planRevision: 1,
    checks: { passed: 0, total: 0, items: [] } });
  await assert.rejects(f.harness.preview({ expectedPlanRevision: 1 }), { code: 'EXECUTION_DISABLED' });
  await assert.rejects(f.harness.checkStart({ nightDate: NIGHT }), { code: 'EXECUTION_DISABLED' });
  await assert.rejects(f.harness.stop({ runId: 'old-v1-approval' }), { code: 'RUN_NOT_FOUND' });
  assert.deepEqual(f.controls.calls, []);
});

test('批准锁计划、模板历史和项目身份；计划改动需重新预览', async t => {
  const f = await fixture(t);
  await assert.rejects(f.harness.checkStart({ nightDate: NIGHT }), { code: 'V2_APPROVAL_REQUIRED' });
  const preview = await f.harness.preview({ expectedPlanRevision: 1 });
  assert.equal(preview.slots[0].chipRevision, 1);
  await assert.rejects(f.harness.confirm({ token: preview.token, confirmed: false }), { code: 'CONFIRM_REQUIRED' });
  f.state = addSlot(f.state, { chipId: 'brief', goal: '另一份简报', acceptance: ['一页'] }, { id: 'slot-extra' });
  await assert.rejects(f.harness.confirm({ token: preview.token, confirmed: true }), { code: 'PLAN_CHANGED' });
  await f.approve();
  f.state = addSlot(f.state, { chipId: 'brief', goal: '第三份简报', acceptance: ['一页'] }, { id: 'slot-more' });
  await assert.rejects(f.harness.checkStart({ nightDate: NIGHT }), { code: 'PLAN_CHANGED' });
});

test('六类预检逐槽留痕，全局阻断与 23:30 前复检边界', async t => {
  const f = await fixture(t, ['push', 'test', 'learn']);
  await f.approve();
  f.controls.failures.set('power', 'failed');
  let view = await f.harness.checkStart({ nightDate: NIGHT });
  assert.equal(view.status, 'blocked');
  assert.equal(view.checks.total, 6);
  assert.equal(view.checks.passed, 5);
  assert.equal(view.checks.items.length, 12);
  assert.equal(view.canRecheck, true);
  f.controls.failures.clear();
  f.controls.failures.set('backlog:slot-1', 'failed');
  view = await f.harness.checkStart({ nightDate: NIGHT });
  assert.equal(view.status, 'blocked'); // 普通重复调用只读，不绕过复检门禁。
  assert.equal(view.checks.passed, 5);
  view = await f.harness.recheck({ runId: view.runId });
  assert.equal(view.status, 'ready');
  assert.deepEqual(view.slots.map(slot => slot.status), ['skipped', 'pending', 'pending']);
  assert.equal(view.checks.passed, 5);
  assert.equal(view.canRecheck, false);
  f.controls.clock.now = Date.parse('2026-10-07T15:30:00.000Z');
  assert.equal((await f.harness.status()).canRecheck, false);
  await assert.rejects(f.harness.recheck({ runId: view.runId }), { code: 'RECHECK_CLOSED' });
  await assert.rejects(f.harness.checkStart({ nightDate: '2026-02-30' }), { code: 'INVALID_NIGHT_DATE' });
});

test('串行独立 worktree 本地提交与 06:30 后不启新槽', async t => {
  const f = await fixture(t, ['push', 'test']);
  await f.approve();
  let view = await f.harness.checkStart({ nightDate: NIGHT });
  f.controls.clock.now = Date.parse('2026-10-07T15:00:00.000Z');
  view = await f.harness.tick();
  assert.equal(view.slots[0].status, 'completed');
  assert.equal(view.slots[1].status, 'pending');
  assert.deepEqual(f.controls.calls.filter(call => call.startsWith('execute:')), ['execute:slot-1:1']);
  view = await f.harness.tick();
  assert.equal(view.slots[1].status, 'completed');
  view = await f.harness.tick();
  assert.equal(view.status, 'completed');
  assert.deepEqual(f.controls.calls.filter(call => call.startsWith('prepare:')), ['prepare:slot-1', 'prepare:slot-2']);
  assert.notEqual(git(f.repo, 'rev-parse', 'HEAD'), git(path.join(f.directory, 'worktrees/slot-1'), 'rev-parse', 'HEAD'));

  const second = await fixture(t, ['push', 'test']);
  await second.approve();
  await second.harness.checkStart({ nightDate: NIGHT });
  second.controls.clock.now = Date.parse('2026-10-07T22:30:00.000Z'); // 06:30 Shanghai
  const late = await second.harness.tick();
  assert.equal(late.status, 'completed');
  assert.deepEqual(late.slots.map(slot => slot.status), ['skipped', 'skipped']);
  assert.deepEqual(second.controls.calls, []);
});

test('停止今晚立刻可见且不会再开新轮次', async t => {
  const f = await fixture(t);
  await f.approve(); await f.harness.checkStart({ nightDate: NIGHT });
  f.controls.clock.now = Date.parse('2026-10-07T15:00:00.000Z');
  let resolveRound;
  let entered;
  const enteredPromise = new Promise(resolve => { entered = resolve; });
  f.controls.hold = ({ signal }) => new Promise(resolve => { resolveRound = resolve; entered(signal); });
  const pending = f.harness.tick();
  const signal = await enteredPromise;
  let view = await f.harness.status();
  assert.equal(view.status, 'running');
  view = await f.harness.stop({ runId: view.runId });
  assert.equal(view.status, 'stopping');
  assert.equal(signal.aborted, true);
  resolveRound({ status: 'verified', acceptanceMet: true, diffSha256: 'd', testSha256: 't' });
  view = await pending;
  assert.equal(view.status, 'stopped');
  const count = f.controls.calls.filter(call => call.startsWith('execute:')).length;
  await f.harness.tick();
  assert.equal(f.controls.calls.filter(call => call.startsWith('execute:')).length, count);
});

test('任务卡死、连续失败、全局红线与额度刹车有独立结果', async t => {
  const stuck = await fixture(t);
  await stuck.approve(); await stuck.harness.checkStart({ nightDate: NIGHT });
  stuck.controls.clock.now = Date.parse('2026-10-07T15:00:00.000Z');
  stuck.controls.results.push(
    { status: 'verified', acceptanceMet: false, diffSha256: 'same', testSha256: 'same' },
    { status: 'verified', acceptanceMet: false, diffSha256: 'same', testSha256: 'same' });
  await stuck.harness.tick();
  let view = await stuck.harness.tick();
  assert.equal(view.slots[0].status, 'failed');
  assert.equal(view.currentSlotId, null);

  const redline = await fixture(t);
  await redline.approve(); await redline.harness.checkStart({ nightDate: NIGHT });
  redline.controls.clock.now = Date.parse('2026-10-07T15:00:00.000Z');
  redline.controls.results.push({ status: 'redline_global', reason: '合成凭据红线' });
  view = await redline.harness.tick();
  assert.equal(view.status, 'global-redline');
  assert.equal(redline.controls.calls.some(call => call.startsWith('checkpoint:')), false);

  const quota = await fixture(t);
  await quota.approve();
  quota.controls.quotaPercent = 20.1;
  view = await quota.harness.checkStart({ nightDate: NIGHT });
  assert.equal(view.status, 'blocked');
  assert.equal(view.quotaEstimatePercent, 20.1);
});

test('结果未知必须查询；最后绿提交恢复且过 07:00 不恢复', async t => {
  const f = await fixture(t);
  await f.approve(); await f.harness.checkStart({ nightDate: NIGHT });
  f.controls.clock.now = Date.parse('2026-10-07T15:00:00.000Z');
  f.controls.results.push({ status: 'verified', acceptanceMet: false,
    diffSha256: 'first', testSha256: 'first' }, new Error('synthetic crash'));
  await f.harness.tick();
  let view = await f.harness.tick();
  assert.equal(view.status, 'unknown');
  const count = f.controls.calls.filter(call => call.startsWith('execute:')).length;
  await f.harness.tick();
  assert.equal(f.controls.calls.filter(call => call.startsWith('execute:')).length, count);
  await assert.rejects(f.harness.resume({ runId: view.runId }), { code: 'PROCESS_UNKNOWN' });
  f.controls.probe = { status: 'stopped' };
  view = await f.harness.check({ runId: view.runId });
  assert.equal(view.status, 'interrupted');
  view = await f.harness.resume({ runId: view.runId });
  assert.equal(view.status, 'running');
  assert.ok(f.controls.calls.some(call => call.startsWith('restore:slot-1:')));
  f.controls.clock.now = Date.parse('2026-10-07T23:00:00.000Z'); // 07:00 Shanghai
  await assert.rejects(f.harness.resume({ runId: view.runId }), { code: 'RESUME_FORBIDDEN' });
  view = await f.harness.tick();
  assert.equal(view.status, 'interrupted');
});

test('单槽任务红线只跳过该槽；连续三败、轮次和时长分别刹车', async t => {
  const taskRedline = await fixture(t, ['push', 'test']);
  await taskRedline.approve(); await taskRedline.harness.checkStart({ nightDate: NIGHT });
  taskRedline.controls.clock.now = Date.parse('2026-10-07T15:00:00.000Z');
  taskRedline.controls.results.push({ status: 'redline_task', reason: '合成任务边界' });
  let view = await taskRedline.harness.tick();
  assert.equal(view.slots[0].status, 'failed');
  assert.equal(view.status, 'ready');
  view = await taskRedline.harness.tick();
  assert.equal(view.slots[1].status, 'completed');

  const failures = await fixture(t);
  await failures.approve(); await failures.harness.checkStart({ nightDate: NIGHT });
  failures.controls.clock.now = Date.parse('2026-10-07T15:00:00.000Z');
  failures.controls.results.push(...[1, 2, 3].map(i => ({ status: 'failed',
    diffSha256: `diff-${i}`, testSha256: `tests-${i}`, reason: `失败 ${i}` })));
  for (let i = 0; i < 3; i++) view = await failures.harness.tick();
  assert.equal(view.slots[0].status, 'failed');
  assert.equal(failures.controls.calls.filter(item => item.startsWith('execute:')).length, 3);

  const rounds = await fixture(t, ['test']);
  await rounds.approve(); await rounds.harness.checkStart({ nightDate: NIGHT });
  rounds.controls.clock.now = Date.parse('2026-10-07T15:00:00.000Z');
  rounds.controls.results.push(...[1, 2, 3, 4].map(i => ({ status: 'verified',
    acceptanceMet: false, diffSha256: `diff-${i}`, testSha256: `tests-${i}` })));
  for (let i = 0; i < 4; i++) view = await rounds.harness.tick();
  assert.equal(view.slots[0].status, 'failed');
  assert.equal(view.slots[0].round, 4);

  const duration = await fixture(t, ['test']);
  await duration.approve(); await duration.harness.checkStart({ nightDate: NIGHT });
  duration.controls.clock.now = Date.parse('2026-10-07T15:00:00.000Z');
  duration.controls.results.push({ status: 'verified', acceptanceMet: false,
    diffSha256: 'first', testSha256: 'first', minutes: 0 });
  view = await duration.harness.tick();
  assert.equal(view.slots[0].status, 'running');
  duration.controls.clock.now += 45 * 60_000;
  view = await duration.harness.tick();
  assert.equal(view.slots[0].status, 'failed');
  assert.equal(duration.controls.calls.filter(item => item.startsWith('execute:')).length, 1);
});

test('限流窗口等待重置，额度每轮重估未知即停，07:00 精确边界', async t => {
  const limit = await fixture(t);
  await limit.approve(); await limit.harness.checkStart({ nightDate: NIGHT });
  limit.controls.clock.now = Date.parse('2026-10-07T15:00:00.000Z');
  limit.controls.results.push({ status: 'rate_limited',
    rateLimitUntil: '2026-10-07T15:10:00.000Z', reason: '五小时额度窗口' });
  let view = await limit.harness.tick();
  assert.equal(view.status, 'paused');
  const before = limit.controls.calls.filter(item => item.startsWith('execute:')).length;
  await limit.harness.tick();
  assert.equal(limit.controls.calls.filter(item => item.startsWith('execute:')).length, before);
  limit.controls.clock.now = Date.parse('2026-10-07T15:10:00.000Z');
  view = await limit.harness.tick();
  assert.equal(view.slots[0].status, 'completed');

  const budget = await fixture(t);
  await budget.approve();
  budget.controls.quotaPercent = 19.8;
  await budget.harness.checkStart({ nightDate: NIGHT });
  budget.controls.clock.now = Date.parse('2026-10-07T15:00:00.000Z');
  view = await budget.harness.tick();
  assert.equal(view.status, 'interrupted');
  assert.ok(view.quotaEstimatePercent > 20);
  await assert.rejects(budget.harness.resume({ runId: view.runId }), { code: 'RESUME_FORBIDDEN' });

  const unknown = await fixture(t);
  await unknown.approve(); await unknown.harness.checkStart({ nightDate: NIGHT });
  unknown.controls.clock.now = Date.parse('2026-10-07T15:00:00.000Z');
  unknown.controls.hold = async () => { unknown.controls.quotaPercent = NaN;
    return { status: 'verified', acceptanceMet: true, diffSha256: 'd', testSha256: 't' }; };
  view = await unknown.harness.tick();
  assert.equal(view.status, 'interrupted');
  assert.equal(view.quotaEstimatePercent, null);

  const exactEnd = await fixture(t);
  await exactEnd.approve();
  exactEnd.controls.clock.now = Date.parse('2026-10-07T23:00:00.000Z');
  await assert.rejects(exactEnd.harness.checkStart({ nightDate: NIGHT }), { code: 'START_WINDOW_CLOSED' });
});

test('持久 ledger 重启后保留进行状态且末轮未知不重放；分支名安全', async t => {
  const f = await fixture(t, ['push'], { slotIds: ['slot:colon'] });
  const preview = await f.approve();
  assert.match(preview.slots[0].branch, /^night\/\{date\}-push-[a-f0-9]{10}$/);
  await f.harness.checkStart({ nightDate: NIGHT });
  f.controls.clock.now = Date.parse('2026-10-07T15:00:00.000Z');
  f.controls.results.push(new Error('synthetic crash'));
  let view = await f.harness.tick();
  assert.equal(view.status, 'unknown');
  const count = f.controls.calls.filter(item => item.startsWith('execute:')).length;
  const restarted = createNightV2Harness(f.options);
  view = await restarted.status();
  assert.equal(view.status, 'unknown');
  await restarted.tick();
  assert.equal(f.controls.calls.filter(item => item.startsWith('execute:')).length, count);
  assert.ok(f.controls.calls.includes('prepare:slot:colon'));
});

test('无项目只读槽缺少应用持有的隔离源时只跳过该槽', async t => {
  const f = await fixture(t, ['learn', 'push']);
  const unowned = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'night-v2-unowned-')));
  t.after(async () => { await fs.rm(unowned, { recursive: true, force: true }); });
  const worktrees = { ...f.options.worktrees, async identity({ slot }) {
    const base = await f.options.worktrees.identity({ slot });
    return slot.id === 'slot-1' ? { ...base, realpath: unowned } : base;
  } };
  const harness = createNightV2Harness({ ...f.options, worktrees });
  const preview = await harness.preview({ expectedPlanRevision: nightV2Of(f.state).revision });
  await harness.confirm({ token: preview.token, confirmed: true });
  const view = await harness.checkStart({ nightDate: NIGHT });
  assert.equal(view.status, 'ready');
  assert.deepEqual(view.slots.map(slot => slot.status), ['skipped', 'pending']);
  assert.match(view.checks.items.find(item => item.id === 'worktree' && item.slotId === 'slot-1').reason, /隔离工作区/);
});

test('prepare 结果在持久化前丢失，重启后先 inspect 才可继续，不重复建 branch', async t => {
  const f = await fixture(t);
  await f.approve(); await f.harness.checkStart({ nightDate: NIGHT });
  f.controls.clock.now = Date.parse('2026-10-07T15:00:00.000Z');
  f.controls.prepareCrashOnce = true;
  let view = await f.harness.tick();
  assert.equal(view.status, 'unknown');
  assert.deepEqual(f.controls.calls.filter(item => item.startsWith('prepare:')), ['prepare:slot-1']);
  const restarted = createNightV2Harness(f.options);
  await restarted.tick();
  assert.deepEqual(f.controls.calls.filter(item => item.startsWith('prepare:')), ['prepare:slot-1']);
  view = await restarted.check({ runId: view.runId });
  assert.equal(view.status, 'ready');
  view = await restarted.tick();
  assert.equal(view.slots[0].status, 'completed');
  assert.deepEqual(f.controls.calls.filter(item => item.startsWith('prepare:')), ['prepare:slot-1']);
});

test('checkpoint 提交后回执丢失，确定性 operationId 回读同 SHA 且不重复提交', async t => {
  const f = await fixture(t);
  await f.approve(); await f.harness.checkStart({ nightDate: NIGHT });
  f.controls.clock.now = Date.parse('2026-10-07T15:00:00.000Z');
  const result = { status: 'verified', acceptanceMet: true, diffSha256: 'd', testSha256: 't' };
  f.controls.results.push(result);
  f.controls.checkpointCrashOnce = true;
  let view = await f.harness.tick();
  assert.equal(view.status, 'unknown');
  const commits = f.controls.calls.filter(item => item.startsWith('checkpoint:'));
  assert.equal(commits.length, 1);
  const restarted = createNightV2Harness(f.options);
  f.controls.probe = { status: 'stopped', result };
  view = await restarted.check({ runId: view.runId });
  assert.equal(view.slots[0].status, 'completed');
  assert.equal(f.controls.calls.filter(item => item.startsWith('checkpoint:')).length, 1);
  assert.equal(f.controls.checkpoints.size, 1);
});

test('执行者伪造 SHA 不能成为绿点或 WIP，三种非绿结果均不信任', async t => {
  for (const status of ['failed', 'rate_limited', 'redline_global']) {
    const f = await fixture(t);
    await f.approve(); await f.harness.checkStart({ nightDate: NIGHT });
    f.controls.clock.now = Date.parse('2026-10-07T15:00:00.000Z');
    f.controls.results.push({ status, greenSha: 'forged-green', wipSha: 'forged-wip',
      diffSha256: 'd', testSha256: 't', rateLimitUntil: '2026-10-07T15:10:00.000Z' });
    await f.harness.tick();
    const slot = (await ledgerValue(f.directory)).run.slots[0];
    assert.notEqual(slot.lastGreenSha, 'forged-green');
    assert.notEqual(slot.wipSha, 'forged-wip');
    assert.notEqual(slot.logs[0].greenSha, 'forged-green');
    assert.notEqual(slot.logs[0].wipSha, 'forged-wip');
    if (status === 'redline_global') {
      assert.equal(slot.lastGreenSha, null);
      assert.equal(slot.wipSha, null);
    } else assert.match(slot.wipSha, /^[a-f0-9]{40}$/);
  }
});

test('prepare 与 inspect 的 .. / symlink 路径别名不得指向主检出或其他槽', async t => {
  const mainAlias = await fixture(t);
  await mainAlias.approve(); await mainAlias.harness.checkStart({ nightDate: NIGHT });
  mainAlias.controls.clock.now = Date.parse('2026-10-07T15:00:00.000Z');
  await fs.mkdir(path.join(mainAlias.repo, 'nested'));
  const originalPrepare = mainAlias.options.worktrees.prepare;
  mainAlias.options.worktrees.prepare = async args => ({ ...await originalPrepare(args),
    path: path.join(mainAlias.repo, 'nested', '..') });
  let view = await mainAlias.harness.tick();
  assert.equal(view.status, 'unknown');
  assert.equal(mainAlias.controls.calls.some(item => item.startsWith('execute:')), false);

  const symlink = await fixture(t, ['push', 'test']);
  await symlink.approve(); await symlink.harness.checkStart({ nightDate: NIGHT });
  symlink.controls.clock.now = Date.parse('2026-10-07T15:00:00.000Z');
  await symlink.harness.tick();
  const first = path.join(symlink.directory, 'worktrees', 'slot-1');
  const alias = path.join(symlink.directory, 'other-slot-link');
  await fs.symlink(first, alias, 'dir');
  const normalPrepare = symlink.options.worktrees.prepare;
  symlink.options.worktrees.prepare = async args => args.slot.id === 'slot-2' ?
    { ...await normalPrepare(args), path: alias } : normalPrepare(args);
  view = await symlink.harness.tick();
  assert.equal(view.status, 'unknown');
  assert.deepEqual(symlink.controls.calls.filter(item => item.startsWith('execute:')), ['execute:slot-1:1']);

  const inspect = await fixture(t);
  await inspect.approve(); await inspect.harness.checkStart({ nightDate: NIGHT });
  inspect.controls.clock.now = Date.parse('2026-10-07T15:00:00.000Z');
  inspect.controls.prepareCrashOnce = true;
  view = await inspect.harness.tick();
  assert.equal(view.status, 'unknown');
  inspect.options.worktrees.inspect = async ({ branch }) => ({ status: 'prepared',
    worktree: { path: inspect.repo, branch } });
  view = await inspect.harness.check({ runId: view.runId });
  assert.equal(view.status, 'unknown');
});

test('执行者挂起跨单槽时限和 07:00 时中止并持久 unknown，不盲重放', async t => {
  for (const boundary of ['maxMinutes', 'nightEnd']) {
    const f = await fixture(t, ['push'], { pollMs: 5 });
    await f.approve(); await f.harness.checkStart({ nightDate: NIGHT });
    f.controls.clock.now = Date.parse('2026-10-07T15:00:00.000Z');
    let entered;
    const started = new Promise(resolve => { entered = resolve; });
    f.controls.hold = ({ signal }) => { entered(signal); return new Promise(() => {}); };
    const pending = f.harness.tick();
    const signal = await started;
    f.controls.clock.now = boundary === 'maxMinutes' ?
      Date.parse('2026-10-07T18:00:00.000Z') : Date.parse('2026-10-07T23:00:00.000Z');
    const view = await pending;
    assert.equal(view.status, 'unknown');
    assert.equal(signal.aborted, true);
    assert.equal((await ledgerValue(f.directory)).run.slots[0].roundInFlight, true);
    const calls = f.controls.calls.filter(item => item.startsWith('execute:')).length;
    await f.harness.tick();
    assert.equal(f.controls.calls.filter(item => item.startsWith('execute:')).length, calls);
  }
});

test('prepare 待回执时停止保留查询上下文，回执成功或丢失均不执行', async t => {
  for (const lostReceipt of [false, true]) {
    const f = await fixture(t);
    await f.approve(); await f.harness.checkStart({ nightDate: NIGHT });
    f.controls.clock.now = Date.parse('2026-10-07T15:00:00.000Z');
    const prepare = f.options.worktrees.prepare;
    let entered, release;
    const started = new Promise(resolve => { entered = resolve; });
    const gate = new Promise(resolve => { release = resolve; });
    f.options.worktrees.prepare = async args => { entered(); await gate; return prepare(args); };
    f.controls.prepareCrashOnce = lostReceipt;
    const pending = f.harness.tick();
    await started;
    let view = await f.harness.status();
    view = await f.harness.stop({ runId: view.runId });
    assert.equal(view.status, 'stopping');
    assert.equal(view.currentSlotId, 'slot-1');
    assert.equal((await f.harness.check({ runId: view.runId })).status, 'stopping');
    release();
    view = await pending;
    if (lostReceipt) {
      assert.equal(view.status, 'unknown');
      view = await f.harness.check({ runId: view.runId });
    }
    assert.equal(view.status, 'stopped');
    assert.equal(view.currentSlotId, null);
    assert.equal(f.controls.calls.some(item => item.startsWith('execute:')), false);
    assert.ok((await ledgerValue(f.directory)).run.slots[0].worktree);
  }
});
