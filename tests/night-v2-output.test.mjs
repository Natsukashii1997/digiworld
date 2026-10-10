import test from 'node:test';
import assert from 'node:assert/strict';
import { expectedNightV2OutputKind, validateNightV2Output } from '../server/night-v2-output-schema.mjs';

const RUN = '11111111-1111-4111-8111-111111111111';
const slot = (chipId, outputKind, extra = {}) => ({ runId: RUN, slotId: `slot-${chipId}`,
  chipId, outputKind, acceptance: ['第一条', '第二条'], branch: null, ...extra });
const envelope = (source, content) => ({ schema: 'night-v2-output', version: 1,
  kind: expectedNightV2OutputKind(source.chipId, source.outputKind),
  runId: source.runId, slotId: source.slotId, summary: '合成产物摘要',
  acceptance: source.acceptance.map(criterion => ({ criterion, status: 'met', evidence: '合成验收证据' })),
  content });
const branch = { branch: 'night/2026-10-07-push-safe',
  changedFiles: [{ path: 'src/example.js', added: 3, deleted: 1 }],
  rounds: [{ round: 1, executor: 'codex', reviewer: 'claude', result: 'accepted', evidence: '合成复核记录' }],
  mainConflict: { status: 'clean', evidence: '合成 merge-base 检查' } };
const brief = { completed: [{ text: '完成一项', sourceRef: 'inbox:item-1' }],
  unresolved: [{ text: '待决定', owner: '常浩', sourceRef: 'inbox:item-2' }],
  priorities: [{ text: '处理早上验收', sourceRef: 'night:slot-1' }] };
const contents = {
  learn: { topic: '合成主题', whyLearn: '理解边界',
    steps: [{ tag: '修正', sourceIds: ['a'], learned: '记录事实', correction: '修正前提' }],
    insights: [{ text: '两来源印证的洞见', sourceIds: ['a', 'b'], verification: 'crosschecked' }],
    suggestions: { learning: ['继续验证'], project: ['调整测试'], cognition: ['保留待证'] },
    sources: [{ id: 'a', title: '官方文档 A', url: 'https://example.org/a' },
      { id: 'b', title: '官方文档 B', url: 'https://example.org/b' }] },
  push: branch,
  test: { cases: [{ id: 'case-1', name: '正常路径', status: 'passed', expected: '成功',
    actual: '成功', evidence: 'test.log:1' }],
    defects: [{ id: 'bug-1', reproduction: '输入空值', expected: '提示错误', actual: '未提示',
      evidence: 'test.log:2', possibleCause: '边界校验缺失' }],
    newTests: [{ path: 'tests/example.test.js', result: 'passed', evidence: 'test.log:3' }] },
  review: { scope: 'src/example.js', risks: [{ location: 'src/example.js:3', evidence: 'diff:3',
    impact: '失败路径丢失', verification: '复跑负例', reviewer: 'codex', status: 'confirmed' }] },
  deps: { scope: 'package-lock.json', advisories: [{ package: 'example', version: '1.0.0',
    affectedVersions: '<1.0.1', source: 'https://example.org/advisory',
    applicability: 'pending', evidence: 'lockfile:3' }] },
  brief,
};

test('六内置类型与自定义四形态按锁定产出形态校验', () => {
  for (const [chipId, content] of Object.entries(contents)) {
    const outputKind = { learn: 'report', push: 'branch', test: 'report', review: 'list',
      deps: 'list', brief: 'brief' }[chipId];
    const source = slot(chipId, outputKind, chipId === 'push' ? { branch: branch.branch } : {});
    const result = validateNightV2Output(source, envelope(source, content));
    assert.equal(result.status, 'valid', `${chipId}: ${result.issues.join(',')}`);
    assert.equal(result.output.kind, expectedNightV2OutputKind(chipId, outputKind));
  }
  for (const [outputKind, content] of Object.entries({
    report: { sections: [{ heading: '结论', text: '合成报告', evidence: 'doc:1' }] },
    list: { items: [{ text: '一条清单', evidence: 'doc:1' }] },
    branch, brief,
  })) {
    const source = slot('custom-1', outputKind, outputKind === 'branch' ? { branch: branch.branch } : {});
    assert.equal(validateNightV2Output(source, envelope(source, content)).status, 'valid', outputKind);
  }
});

test('错来源、缺逐条验收、未知字段、跨来源洞见和分支不一致均无效', () => {
  const source = slot('learn', 'report');
  const wrongRun = envelope(source, contents.learn); wrongRun.runId = 'another-run';
  assert.equal(validateNightV2Output(source, wrongRun).status, 'invalid');
  const wrongSlot = envelope(source, contents.learn); wrongSlot.slotId = 'slot-other';
  assert.equal(validateNightV2Output(source, wrongSlot).status, 'invalid');
  const missingAcceptance = envelope(source, contents.learn); missingAcceptance.acceptance.pop();
  assert.match(validateNightV2Output(source, missingAcceptance).issues.join(' '), /验收/);
  const injected = envelope(source, contents.learn); injected.execute = true;
  assert.equal(validateNightV2Output(source, injected).status, 'invalid');
  const crossSource = envelope(source, structuredClone(contents.learn));
  crossSource.content.insights[0].sourceIds = ['a', 'unknown'];
  assert.match(validateNightV2Output(source, crossSource).issues.join(' '), /来源/);
  const onlyOne = envelope(source, structuredClone(contents.learn));
  onlyOne.content.insights[0].sourceIds = ['a'];
  assert.equal(validateNightV2Output(source, onlyOne).status, 'invalid');
  const oneSource = envelope(source, structuredClone(contents.learn));
  oneSource.content.sources.pop();
  oneSource.content.insights[0].sourceIds = ['a'];
  oneSource.content.insights[0].verification = 'pending';
  assert.equal(validateNightV2Output(source, oneSource).status, 'invalid');
  const allPending = envelope(source, structuredClone(contents.learn));
  allPending.content.insights[0].verification = 'pending';
  assert.equal(validateNightV2Output(source, allPending).status, 'invalid');
  const branchSlot = slot('push', 'branch', { branch: branch.branch });
  const mismatched = envelope(branchSlot, { ...branch, branch: 'night/other' });
  assert.equal(validateNightV2Output(branchSlot, mismatched).status, 'invalid');
  const noVerifiedBranch = slot('push', 'branch');
  assert.equal(validateNightV2Output(noVerifiedBranch,
    envelope(noVerifiedBranch, branch)).status, 'invalid');
});

test('报告与通告不能缺关键证据；一页简报有长度上限', () => {
  const testSlot = slot('test', 'report');
  const missing = envelope(testSlot, structuredClone(contents.test));
  missing.content.defects[0].evidence = '';
  assert.equal(validateNightV2Output(testSlot, missing).status, 'invalid');
  const depSlot = slot('deps', 'list');
  const advisory = envelope(depSlot, structuredClone(contents.deps));
  delete advisory.content.advisories[0].affectedVersions;
  assert.equal(validateNightV2Output(depSlot, advisory).status, 'invalid');
  const briefSlot = slot('brief', 'brief');
  const long = envelope(briefSlot, structuredClone(contents.brief));
  long.content.priorities[0].text = '长'.repeat(3000);
  assert.equal(validateNightV2Output(briefSlot, long).status, 'invalid');
});
