import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { createNightV2Actions } from '../server/night-v2-actions.mjs';
import { addSlot, nightV2Of } from '../src/night-v2-model.js';

const git = (cwd, ...args) => execFileSync('git', ['-C', cwd, ...args],
  { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
const exists = async value => fs.stat(value).then(() => true, () => false);

async function fixture(t, { mode = 'synthetic' } = {}) {
  const directory = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'night-v2-actions-')));
  t.after(async () => { await fs.rm(directory, { recursive: true, force: true }); });
  const mainPath = path.join(directory, 'main'), worktreePath = path.join(directory, 'worktrees', 'push');
  await fs.mkdir(mainPath);
  git(mainPath, 'init', '-b', 'main');
  git(mainPath, 'config', 'user.email', 'synthetic@example.invalid');
  git(mainPath, 'config', 'user.name', 'Synthetic Night');
  await fs.writeFile(path.join(mainPath, 'README.md'), 'base\n');
  git(mainPath, 'add', '.'); git(mainPath, 'commit', '-m', 'base');
  const branch = 'night/2026-10-07-push-safe';
  await fs.mkdir(path.dirname(worktreePath));
  git(mainPath, 'worktree', 'add', '-b', branch, worktreePath, 'HEAD');
  await fs.mkdir(path.join(worktreePath, 'src'));
  await fs.writeFile(path.join(worktreePath, 'src', 'synthetic.js'), 'export const value = 1;\n');
  git(worktreePath, 'add', '.'); git(worktreePath, 'commit', '-m', 'synthetic green');
  const branchSha = git(worktreePath, 'rev-parse', 'HEAD');
  const changedFiles = [{ path: 'src/synthetic.js', status: 'added', added: 1, deleted: 0 }];
  const runId = randomUUID(), slotId = 'slot-push';
  const sourceSlot = { slotId, chipId: 'push', chipRevision: 1, projectId: 'project-1',
    chip: { id: 'push', code: 'C-02', name: '继续跑项目', color: 'orange', icon: 'push',
      output: 'branch', executor: 'codex', reviewer: 'claude' },
    goal: '合成项目目标', acceptance: ['合成验收'], outputKind: 'branch', status: 'completed',
    round: 1, maxRounds: 12, startedAt: '2026-10-07T15:00:00.000Z',
    endedAt: '2026-10-07T15:10:00.000Z', branch, lastGreenSha: branchSha,
    wipSha: null, firstFailure: null, fromWhere: '验收通过', logs: [] };
  const source = { schema: 'night-v2-morning-source', runId, nightDate: '2026-10-07',
    runStatus: 'completed', planHash: 'a'.repeat(64), planRevision: 1,
    window: { start: '23:00', end: '07:00' }, quotaEstimatePercent: 5,
    checks: { passed: 6, total: 6 }, stopRequestedAt: null, slots: [sourceSlot] };
  const reportSlot = { slotId, chipId: 'push', chipRevision: 1, chip: sourceSlot.chip,
    goal: sourceSlot.goal, status: 'completed', outputKind: 'branch',
    validation: { status: 'valid', issues: [] },
    acceptance: [{ criterion: '合成验收', status: 'met', evidence: 'synthetic:test' }],
    summary: '合成通过', startedAt: sourceSlot.startedAt, endedAt: sourceSlot.endedAt,
    roundCount: 1, branch, lastGreenSha: branchSha, wipSha: null, firstFailure: null,
    fromWhere: '验收通过' };
  const report = { schema: 'night-v2-morning', reportId: `night-v2-morning-${runId}`,
    runId, nightDate: '2026-10-07', readyAt: '2026-10-07T23:05:00.000Z',
    generatedAt: '2026-10-07T23:05:00.000Z', revision: 1, planHash: source.planHash,
    slots: [reportSlot] };
  const controls = { time: Date.parse('2026-10-08T00:00:00.000Z'), conflict: 'clean',
    mergeThrowsAfterEffect: false, actions: new Map(), continuation: new Map(),
    greenReachable: true, suggestions: new Map(), calls: [], sources: [source], reports: new Map([[runId, report]]),
    outputs: new Map() };
  controls.outputs.set(`${runId}:${slotId}`, { schema: 'night-v2-output-view', runId, slotId,
    validation: { status: 'valid', issues: [] }, output: { schema: 'night-v2-output', version: 1,
      kind: 'branch-delivery', runId, slotId, summary: '合成通过',
      acceptance: [{ criterion: '合成验收', status: 'met', evidence: 'synthetic:test' }],
      content: { branch, changedFiles: changedFiles.map(({ path, added, deleted }) =>
        ({ path, added, deleted })), rounds: [], mainConflict: { status: 'clean', evidence: 'synthetic' } } } });
  const morning = {
    async read({ runId: id }) { const value = controls.reports.get(id);
      if (!value) throw Object.assign(new Error('missing'), { code: 'REPORT_NOT_FOUND' });
      return structuredClone(value); },
    async output({ runId: id, slotId: sid }) { return structuredClone(controls.outputs.get(`${id}:${sid}`)); },
  };
  const harness = {
    async morningSource({ runId: id }) { const value = controls.sources.find(row => row.runId === id);
      if (!value) throw Object.assign(new Error('missing'), { code: 'RUN_NOT_FOUND' });
      return structuredClone(value); },
    async listMorningSources() { return { schema: 'night-v2-morning-sources', items: structuredClone(controls.sources) }; },
  };
  const branchAdapter = {
    async inspect({ projectId, branch: asked, lastGreenSha }) {
      controls.calls.push('inspect');
      return { projectId, branch: asked, mainPath, worktreePath,
        mainSha: git(mainPath, 'rev-parse', 'HEAD'), branchSha,
        changedFiles: structuredClone(changedFiles), conflict: controls.conflict,
        containsGreen: controls.greenReachable && lastGreenSha === branchSha };
    },
    async merge({ operationId, branch: asked, expectedMainSha, expectedBranchSha }) {
      controls.calls.push('merge');
      assert.equal(expectedMainSha, git(mainPath, 'rev-parse', 'HEAD'));
      assert.equal(expectedBranchSha, branchSha);
      git(mainPath, 'merge', '--no-ff', asked, '-m', 'synthetic local merge');
      const mergeSha = git(mainPath, 'rev-parse', 'HEAD');
      controls.actions.set(operationId, { status: 'merged', mergeSha });
      if (controls.mergeThrowsAfterEffect) throw new Error('lost response');
      return { mergeSha };
    },
    async removeWorktree({ operationId, path: target }) {
      controls.calls.push('removeWorktree');
      git(mainPath, 'worktree', 'remove', '--force', target);
      controls.actions.set(operationId, { status: 'discarded', worktreeExists: false,
        branchExists: true });
      return { removed: true };
    },
    async query({ operationId }) { controls.calls.push('query');
      return controls.actions.get(operationId) ?? { status: 'not_started' }; },
  };
  const writeContinuation = async ({ phase, operationId, newSlotId, source: locked }) => {
    controls.calls.push(`continue:${phase}`);
    assert.equal(locked.lastGreenSha, branchSha);
    if (phase === 'apply') controls.continuation.set(operationId, newSlotId);
    return controls.continuation.has(operationId) ?
      { status: 'queued', targetId: controls.continuation.get(operationId) } : { status: 'not_started' };
  };
  const writeSuggestion = async ({ phase, operationId, source: locked }) => {
    controls.calls.push(`suggestion:${phase}`);
    if (phase === 'apply') controls.suggestions.set(operationId,
      `${locked.target}-${operationId.slice(0, 8)}`);
    return controls.suggestions.has(operationId) ?
      { status: 'saved', targetId: controls.suggestions.get(operationId) } : { status: 'not_started' };
  };
  const makeService = overrides => createNightV2Actions({ directory, morning, harness,
    repository: { read: async () => ({ nightV2: nightV2Of({}),
      projects: [{ id: 'project-1' }] }) }, branchAdapter, clock: () => controls.time,
    executionMode: mode, writeContinuation, writeSuggestion, ...overrides });
  const service = makeService();
  return { directory, mainPath, worktreePath, runId, slotId, branch, branchSha,
    source, report, controls, service, makeService };
}

test('合并预览列真实文件，确认只本地合并并回读；重复确认不重放', async t => {
  const f = await fixture(t);
  const preview = await f.service.preview({ runId: f.runId, slotId: f.slotId,
    action: 'merge', expectedReportRevision: 1 });
  assert.equal(preview.canConfirm, true);
  assert.equal(preview.files[0].path, 'src/synthetic.js');
  assert.equal(preview.conflict, 'clean');
  const first = await f.service.confirm({ operationId: preview.operationId, token: preview.token,
    confirmed: true });
  assert.equal(first.status, 'merged');
  assert.equal(first.mergeSha, git(f.mainPath, 'rev-parse', 'HEAD'));
  const again = await f.service.confirm({ operationId: preview.operationId, token: preview.token,
    confirmed: true });
  assert.deepEqual(again, first);
  assert.equal(f.controls.calls.filter(item => item === 'merge').length, 1);
  assert.equal(await f.service.countUnresolvedBranches({ projectId: 'project-1' }), 0);
  assert.equal((await f.service.decisions({ runId: f.runId })).items[0].status, 'merged');
});

test('同一物理分支在旧合并后新一夜继续写入，旧决策不抵扣新积压', async t => {
  const f = await fixture(t);
  const preview = await f.service.preview({ runId: f.runId, slotId: f.slotId,
    action: 'merge', expectedReportRevision: 1 });
  assert.equal((await f.service.confirm({ operationId: preview.operationId,
    token: preview.token, confirmed: true })).status, 'merged');
  await fs.writeFile(path.join(f.worktreePath, 'src', 'later.js'), 'export const later = true;\n');
  git(f.worktreePath, 'add', '.'); git(f.worktreePath, 'commit', '-m', 'next night green');
  const next = structuredClone(f.source);
  next.runId = randomUUID(); next.nightDate = '2026-10-08';
  next.slots[0].slotId = 'slot-next-night';
  next.slots[0].endedAt = '2026-10-08T15:10:00.000Z';
  next.slots[0].lastGreenSha = git(f.worktreePath, 'rev-parse', 'HEAD');
  f.controls.sources.push(next);
  assert.equal(await f.service.countUnresolvedBranches({ projectId: 'project-1' }), 1);
});

test('冲突不半合并；派白天写本地派单回执且不抵扣物理分支', async t => {
  const f = await fixture(t);
  f.controls.conflict = 'conflict';
  const merge = await f.service.preview({ runId: f.runId, slotId: f.slotId,
    action: 'merge', expectedReportRevision: 1 });
  assert.equal(merge.canConfirm, false);
  assert.match(merge.reason, /冲突/);
  await assert.rejects(f.service.confirm({ operationId: merge.operationId, token: merge.token,
    confirmed: true }), { code: 'ACTION_BLOCKED' });
  assert.equal(f.controls.calls.includes('merge'), false);
  const day = await f.service.preview({ runId: f.runId, slotId: f.slotId,
    action: 'day', expectedReportRevision: 1 });
  assert.equal(day.canConfirm, true);
  const result = await f.service.confirm({ operationId: day.operationId, token: day.token,
    confirmed: true });
  assert.equal(result.status, 'dispatched');
  assert.equal((await f.service.query({ operationId: day.operationId })).targetId, result.targetId);
  assert.equal(await f.service.countUnresolvedBranches({ projectId: 'project-1' }), 1);
});

test('合并已生效但响应丢失先未知再 query；预览后 main 漂移拒绝确认', async t => {
  const f = await fixture(t);
  f.controls.mergeThrowsAfterEffect = true;
  const p = await f.service.preview({ runId: f.runId, slotId: f.slotId, action: 'merge',
    expectedReportRevision: 1 });
  const unknown = await f.service.confirm({ operationId: p.operationId, token: p.token,
    confirmed: true });
  assert.equal(unknown.status, 'unknown');
  assert.equal(f.controls.calls.filter(item => item === 'merge').length, 1);
  const readback = await f.service.query({ operationId: p.operationId });
  assert.equal(readback.status, 'merged');
  assert.equal(f.controls.calls.filter(item => item === 'merge').length, 1);

  const other = await fixture(t);
  const stale = await other.service.preview({ runId: other.runId, slotId: other.slotId,
    action: 'merge', expectedReportRevision: 1 });
  await fs.writeFile(path.join(other.mainPath, 'after.txt'), 'drift\n');
  git(other.mainPath, 'add', '.'); git(other.mainPath, 'commit', '-m', 'main drift');
  await assert.rejects(other.service.confirm({ operationId: stale.operationId, token: stale.token,
    confirmed: true }), { code: 'BRANCH_CHANGED' });
  assert.equal(other.controls.calls.includes('merge'), false);
});

test('今晚续跑绑定旧绿点与确定槽 ID；三条积压阻断 push，丢弃后恢复', async t => {
  const f = await fixture(t);
  const extra1 = structuredClone(f.source), extra2 = structuredClone(f.source);
  extra1.runId = randomUUID(); extra1.slots[0].slotId = 'slot-old-1';
  extra1.slots[0].branch = 'night/2026-10-06-push-old-1';
  extra2.runId = randomUUID(); extra2.slots[0].slotId = 'slot-old-2';
  extra2.slots[0].branch = 'night/2026-10-05-push-old-2';
  f.controls.sources.push(extra1, extra2);
  assert.equal(await f.service.countUnresolvedBranches({ projectId: 'project-1' }), 3);
  let p = await f.service.preview({ runId: f.runId, slotId: f.slotId,
    action: 'continue', expectedReportRevision: 1 });
  assert.equal(p.canConfirm, false);
  assert.match(p.reason, /3 个/);
  const discard = await f.service.preview({ runId: f.runId, slotId: f.slotId,
    action: 'discard', expectedReportRevision: 1 });
  assert.equal(discard.canConfirm, true);
  const done = await f.service.confirm({ operationId: discard.operationId,
    token: discard.token, confirmed: true });
  assert.equal(done.status, 'discarded');
  assert.equal(done.retainUntil, '2026-10-15T00:00:00.000Z');
  assert.equal(await exists(f.worktreePath), false);
  assert.equal(git(f.mainPath, 'show-ref', '--verify', `refs/heads/${f.branch}`).length > 0, true);
  assert.equal(await f.service.countUnresolvedBranches({ projectId: 'project-1' }), 2);

  const next = await fixture(t);
  p = await next.service.preview({ runId: next.runId, slotId: next.slotId,
    action: 'continue', expectedReportRevision: 1 });
  assert.equal(p.canConfirm, true);
  const queued = await next.service.confirm({ operationId: p.operationId,
    token: p.token, confirmed: true });
  assert.equal(queued.status, 'queued');
  assert.match(queued.targetId, /^resume-[a-f0-9]{24}$/);
  assert.equal(await next.service.countUnresolvedBranches({ projectId: 'project-1' }), 1);
  const samePhysicalBranch = structuredClone(next.source);
  samePhysicalBranch.runId = randomUUID(); samePhysicalBranch.slots[0].slotId = 'slot-next-night';
  next.controls.sources.push(samePhysicalBranch);
  assert.equal(await next.service.countUnresolvedBranches({ projectId: 'project-1' }), 1);
  const discardAfterQueued = await next.service.preview({ runId: next.runId,
    slotId: next.slotId, action: 'discard', expectedReportRevision: 1 });
  assert.equal(discardAfterQueued.canConfirm, true);
  assert.equal((await next.service.confirm({ operationId: discardAfterQueued.operationId,
    token: discardAfterQueued.token, confirmed: true })).status, 'discarded');
  assert.equal(await next.service.countUnresolvedBranches({ projectId: 'project-1' }), 0);
});

test('上一夜未改的满四槽计划可清槽续跑，预览锁定替换条件', async t => {
  const f = await fixture(t);
  let state = {};
  const ids = ['slot-push', 'slot-extra-1', 'slot-extra-2', 'slot-extra-3'];
  for (const [index, id] of ids.entries()) state = addSlot(state, {
    chipId: index === 0 ? 'push' : 'learn', projectId: index === 0 ? 'project-1' : '',
    goal: `目标 ${id}`, acceptance: ['合成验收'] }, { id });
  const plan = nightV2Of(state);
  f.source.planRevision = plan.revision;
  f.source.slots = plan.slots.map((slot, index) => ({ ...structuredClone(f.source.slots[0]),
    slotId: slot.id, chipId: slot.chipId, chipRevision: slot.chipRevision,
    projectId: slot.projectId, goal: slot.goal, acceptance: structuredClone(slot.acceptance),
    branch: index === 0 ? f.branch : `night/2026-10-07-extra-${index}` }));
  const service = f.makeService({ repository: { read: async () => ({ ...state,
    projects: [{ id: 'project-1' }] }) } });
  const p = await service.preview({ runId: f.runId, slotId: f.slotId,
    action: 'continue', expectedReportRevision: 1 });
  assert.equal(p.canConfirm, true);
  assert.equal(p.replaceLastNightSlots, true);
  assert.equal((await service.confirm({ operationId: p.operationId,
    token: p.token, confirmed: true })).status, 'queued');
});

test('续跑不受 main 冲突和新提交阻断，但旧绿点不可达即阻断', async t => {
  const f = await fixture(t);
  f.controls.conflict = 'conflict';
  const p = await f.service.preview({ runId: f.runId, slotId: f.slotId,
    action: 'continue', expectedReportRevision: 1 });
  assert.equal(p.canConfirm, true);
  await fs.writeFile(path.join(f.mainPath, 'later.txt'), 'new main commit\n');
  git(f.mainPath, 'add', '.'); git(f.mainPath, 'commit', '-m', 'new main commit');
  const result = await f.service.confirm({ operationId: p.operationId, token: p.token,
    confirmed: true });
  assert.equal(result.status, 'queued');
  const other = await fixture(t);
  other.controls.greenReachable = false;
  const blocked = await other.service.preview({ runId: other.runId, slotId: other.slotId,
    action: 'continue', expectedReportRevision: 1 });
  assert.equal(blocked.canConfirm, false);
  assert.match(blocked.reason, /绿提交不可达/);
});

test('学习建议只取已验证单条：便签/待处理回读，知识仓库仅预览', async t => {
  const f = await fixture(t);
  const source = f.controls.sources[0], slot = source.slots[0];
  slot.chipId = 'learn'; slot.projectId = ''; slot.branch = null; slot.outputKind = 'report';
  slot.chip = { ...slot.chip, id: 'learn', name: '深度学习', output: 'report' };
  const report = f.controls.reports.get(f.runId), row = report.slots[0];
  row.chipId = 'learn'; row.branch = null; row.chip = structuredClone(slot.chip);
  const output = f.controls.outputs.get(`${f.runId}:${f.slotId}`);
  output.output.kind = 'learning-report';
  output.output.content = { suggestions: { learning: ['读来源 A'], project: ['补项目测试'],
    cognition: ['保留反例'] } };
  const note = await f.service.suggestionPreview({ runId: f.runId, slotId: f.slotId,
    target: 'note', section: 'project', index: 0 });
  assert.equal(note.text, '补项目测试');
  const duplicate = await f.service.suggestionPreview({ runId: f.runId, slotId: f.slotId,
    target: 'note', section: 'project', index: 0 });
  const races = await Promise.allSettled([note, duplicate].map(item =>
    f.service.suggestionConfirm({ operationId: item.operationId,
      token: item.token, confirmed: true })));
  assert.equal(races.filter(item => item.status === 'fulfilled').length, 1);
  assert.equal(races.filter(item => item.status === 'rejected').length, 1);
  assert.equal(races.find(item => item.status === 'rejected').reason.code, 'ALREADY_DECIDED');
  const saved = races.find(item => item.status === 'fulfilled').value;
  assert.equal(saved.status, 'saved');
  assert.equal(f.controls.calls.filter(item => item === 'suggestion:apply').length, 1);
  await assert.rejects(f.service.suggestionPreview({ runId: f.runId, slotId: f.slotId,
    target: 'note', section: 'project', index: 0 }), { code: 'ALREADY_DECIDED' });
  assert.equal((await f.service.suggestionQuery({ operationId: saved.operationId })).targetId, saved.targetId);
  const pending = await f.service.suggestionPreview({ runId: f.runId, slotId: f.slotId,
    target: 'pending', section: 'cognition', index: 0 });
  assert.equal((await f.service.suggestionConfirm({ operationId: pending.operationId,
    token: pending.token, confirmed: true })).status, 'saved');
  const knowledge = await f.service.suggestionPreview({ runId: f.runId, slotId: f.slotId,
    target: 'knowledge', section: 'learning', index: 0 });
  assert.equal(knowledge.canConfirm, true);
  assert.equal(knowledge.previewOnly, true);
  const acknowledged = await f.service.suggestionConfirm({ operationId: knowledge.operationId,
    token: knowledge.token, confirmed: true });
  assert.equal(acknowledged.status, 'preview_acknowledged');
  assert.equal(f.controls.calls.some(item => item === 'suggestion:apply' && item.target === 'knowledge'), false);
});

test('生产默认禁执行，预览和查询安全；并发/重复确认不重放', async t => {
  const f = await fixture(t, { mode: 'disabled' });
  const p = await f.service.preview({ runId: f.runId, slotId: f.slotId,
    action: 'merge', expectedReportRevision: 1 });
  assert.equal(p.canConfirm, false);
  assert.match(p.reason, /未授权/);
  await assert.rejects(f.service.confirm({ operationId: p.operationId, token: p.token,
    confirmed: true }), { code: 'EXECUTION_DISABLED' });
  assert.equal((await f.service.query({ operationId: p.operationId })).status, 'not_started');
  assert.equal(f.controls.calls.includes('merge'), false);
  const source = f.controls.sources[0], slot = source.slots[0];
  slot.chipId = 'learn'; slot.projectId = ''; slot.branch = null; slot.outputKind = 'report';
  slot.chip = { ...slot.chip, id: 'learn', name: '深度学习', output: 'report' };
  const row = f.controls.reports.get(f.runId).slots[0];
  row.chipId = 'learn'; row.branch = null; row.chip = structuredClone(slot.chip);
  const output = f.controls.outputs.get(`${f.runId}:${f.slotId}`);
  output.output.kind = 'learning-report';
  output.output.content = { suggestions: { learning: ['读来源 A'], project: [], cognition: [] } };
  const note = await f.service.suggestionPreview({ runId: f.runId, slotId: f.slotId,
    target: 'note', section: 'learning', index: 0 });
  assert.equal(note.canConfirm, false);
  assert.match(note.reason, /未授权/);
  await assert.rejects(f.service.suggestionConfirm({ operationId: note.operationId,
    token: note.token, confirmed: true }), { code: 'EXECUTION_DISABLED' });
  const knowledge = await f.service.suggestionPreview({ runId: f.runId, slotId: f.slotId,
    target: 'knowledge', section: 'learning', index: 0 });
  assert.equal(knowledge.canConfirm, true);
  assert.equal((await f.service.suggestionConfirm({ operationId: knowledge.operationId,
    token: knowledge.token, confirmed: true })).status, 'preview_acknowledged');
  assert.equal(f.controls.calls.includes('suggestion:apply'), false);
});
