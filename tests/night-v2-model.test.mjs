import test from 'node:test';
import assert from 'node:assert/strict';
import {
  NIGHT_V2_PRESETS, NIGHT_V2_COLORS, NIGHT_V2_ICONS, NIGHT_V2_OUTPUTS,
  nightV2Of, validateNightV2, setWindow, addSlot, updateSlot, removeSlot, reorderSlots,
  reviseChip, createCustomChip, duplicateCustomChip, deleteCustomChip,
  topicCandidates, archiveSupplement,
} from '../src/night-v2-model.js';

const AT = '2026-10-06T12:00:00.000Z';
const draft = (chipId = 'learn', n = 1) => ({
  chipId, projectId: 'project-demo', goal: `合成目标 ${n}`,
  acceptance: [`验收 ${n}`], tonightSupplement: `今晚关注 ${n}`,
});

test('六份预置模板与自定义入口为数据，v1 草稿/批准不激活 v2', () => {
  assert.deepEqual(NIGHT_V2_PRESETS.map(item => item.id),
    ['learn', 'push', 'test', 'review', 'deps', 'brief', 'custom']);
  assert.equal(NIGHT_V2_PRESETS.at(-1).kind, 'custom-entry');
  assert.equal(NIGHT_V2_COLORS.length, 6);
  assert.equal(NIGHT_V2_ICONS.length, 6);
  assert.deepEqual(NIGHT_V2_OUTPUTS.map(item => item.id), ['report', 'list', 'branch', 'brief']);
  const initial = nightV2Of({ night: { draft: { time: '23:00', end: '07:00', tasks: [] }, approved: true } });
  assert.equal(initial.schema, 'night-v2');
  assert.equal(initial.approval, null);
  assert.equal(initial.slots.length, 0);
  assert.equal(initial.chips.length, 6);
  assert.deepEqual(initial.window, { start: '23:00', end: '07:00' });
  assert.throws(() => nightV2Of({ nightV2: null }), /计划无效/);
  assert.throws(() => addSlot({}, { ...draft('custom') }), /请选择可用/);
});

test('独立夜巡窗口按计划 revision 保存，旧 v1 时间不自动覆盖', () => {
  const old = { night: { time: '21:00', end: '09:00', approved: true } };
  assert.deepEqual(nightV2Of(old).window, { start: '23:00', end: '07:00' });
  assert.throws(() => setWindow(old, { start: '24:00', end: '07:00' }), /时间窗口无效/);
  assert.throws(() => setWindow(old, { start: '23:00', end: '23:00' }), /时间窗口无效/);
  assert.throws(() => setWindow(old, { start: '22:30', end: '07:00', approval: true }), /时间窗口无效/);
  const next = setWindow(old, { start: '22:30', end: '06:45' }, { expectedRevision: 0 });
  assert.equal(nightV2Of(next).revision, 1);
  assert.deepEqual(nightV2Of(next).window, { start: '22:30', end: '06:45' });
  assert.deepEqual(old.night, { time: '21:00', end: '09:00', approved: true });
  assert.equal(nightV2Of(next).approval, null);
  assert.throws(() => setWindow(next, { start: '23:00', end: '07:00' }, { expectedRevision: 0 }), /revision 冲突/);
});

test('四槽上限、验收与目标阈值、顺序和纯函数不可变性', () => {
  let state = {}, old = state;
  assert.throws(() => addSlot(state, { chipId: 'learn', goal: '目标', acceptance: [] }), /插槽数据无效/);
  assert.throws(() => addSlot(state, { chipId: 'learn', goal: ' ', acceptance: ['验收'] }), /插槽数据无效/);
  assert.throws(() => addSlot(state, { chipId: 'learn', goal: '目标', acceptance: ['验收'], tonightSupplement: '字'.repeat(601) }), /插槽数据无效/);
  for (let n = 1; n <= 4; n++) {
    state = addSlot(state, draft(['learn', 'push', 'test', 'brief'][n - 1], n), { id: `slot-${n}` });
  }
  assert.deepEqual(old, {});
  assert.deepEqual(nightV2Of(state).slots.map(item => item.id), ['slot-1', 'slot-2', 'slot-3', 'slot-4']);
  assert.throws(() => addSlot(state, draft(), { id: 'slot-5' }), /插槽已满/);
  old = state;
  state = reorderSlots(state, 3, 0, { expectedRevision: 4 });
  assert.deepEqual(nightV2Of(state).slots.map(item => item.id), ['slot-4', 'slot-1', 'slot-2', 'slot-3']);
  assert.deepEqual(nightV2Of(old).slots.map(item => item.id), ['slot-1', 'slot-2', 'slot-3', 'slot-4']);
  assert.throws(() => reorderSlots(state, 0, 4), /顺序无效/);
  assert.throws(() => removeSlot(state, 'slot-1', { expectedRevision: 4 }), /revision 冲突/);
  state = removeSlot(state, 'slot-1', { expectedRevision: 5 });
  assert.equal(nightV2Of(state).slots.length, 3);
});

test('可改代码芯片入槽或更新必须绑定格式正确的项目，直写计划也不能绕过', () => {
  assert.throws(() => addSlot({}, { chipId: 'push', goal: '推进项目', acceptance: ['测试通过'] }), /插槽数据无效/);
  assert.throws(() => addSlot({}, { chipId: 'test', goal: '测试功能', acceptance: ['列出缺陷'], projectId: '../other' }), /插槽数据无效/);
  let state = addSlot({}, { chipId: 'push', goal: '推进项目', acceptance: ['测试通过'], projectId: 'project-demo' }, { id: 'slot-project' });
  assert.throws(() => updateSlot(state, 'slot-project', { projectId: '' }), /插槽数据无效/);
  assert.throws(() => validateNightV2({ ...nightV2Of(state), slots: [{ ...nightV2Of(state).slots[0], projectId: '' }] }), /插槽数据无效/);
  state = createCustomChip(state, { name: '合成代码任务', templatePrompt: '仅修改合成 worktree',
    acceptance: ['构建通过'], canEditCode: true }, { id: 'custom-code', at: AT });
  assert.throws(() => addSlot(state, { chipId: 'custom-code', goal: '合成代码修改', acceptance: ['构建通过'] }), /插槽数据无效/);
  assert.equal(nightV2Of(addSlot(state, { chipId: 'custom-code', goal: '合成代码修改',
    acceptance: ['构建通过'], projectId: 'project-demo' }, { id: 'slot-custom' })).slots.length, 2);
  assert.equal(nightV2Of(addSlot({}, { chipId: 'learn', goal: '跨项目学习', acceptance: ['两份来源'] }, { id: 'slot-readonly' })).slots[0].projectId, '');
});

test('插槽编辑逐条验收与今晚补充边界，归档用后清空且留原文', () => {
  let state = addSlot({}, draft(), { id: 'slot-a' });
  assert.throws(() => updateSlot(state, 'slot-a', { acceptance: [] }), /插槽数据无效/);
  assert.throws(() => updateSlot(state, 'slot-a', { tonightSupplement: '好'.repeat(601) }), /插槽数据无效/);
  assert.throws(() => updateSlot(state, 'slot-a', { secretToken: 'x' }), /修改无效/);
  state = updateSlot(state, 'slot-a', { topic: '新的合成主题', acceptance: ['条件 A', '条件 B'],
    tonightSupplement: '只用今晚的提示' }, { expectedRevision: 1 });
  assert.deepEqual(nightV2Of(state).slots[0].acceptance, ['条件 A', '条件 B']);
  state = archiveSupplement(state, 'slot-a', { at: AT, expectedRevision: 2 });
  assert.equal(nightV2Of(state).slots[0].tonightSupplement, '');
  assert.deepEqual(nightV2Of(state).supplementArchive[0],
    { slotId: 'slot-a', chipId: 'learn', at: AT, text: '只用今晚的提示' });
  assert.strictEqual(archiveSupplement(state, 'slot-a'), state);
});

test('模板 revision CAS 保存完整历史，已入槽任务锁定原版本', () => {
  let state = addSlot({}, draft('learn'), { id: 'slot-learn' });
  assert.throws(() => reviseChip(state, 'learn', { templatePrompt: '改动' }, { expectedRevision: 0 }), /revision 冲突/);
  const prior = nightV2Of(state).chips.find(chip => chip.id === 'learn');
  state = reviseChip(state, 'learn', {
    templatePrompt: '新长期模板', color: 'cyan', acceptance: ['新版验收'],
    brake: { maxRounds: 5, maxMinutes: 50 },
  }, { expectedRevision: 1, at: AT });
  const chip = nightV2Of(state).chips.find(item => item.id === 'learn');
  assert.equal(chip.templateRevision, 2);
  assert.equal(chip.templateHistory.length, 2);
  assert.equal(chip.templateHistory[0].snapshot.color, 'violet');
  assert.deepEqual(chip.templateHistory[0].snapshot.acceptance, prior.acceptance);
  assert.equal(chip.templateHistory[1].snapshot.color, 'cyan');
  assert.equal(chip.templateHistory[1].snapshot.brake.maxRounds, 5);
  assert.equal(chip.templateHistory[1].prompt, '新长期模板');
  assert.equal(nightV2Of(state).slots[0].chipRevision, 1);
  assert.throws(() => reviseChip(state, 'learn', { color: 'pink' }, { expectedRevision: 1 }), /revision 冲突/);
  assert.throws(() => validateNightV2({ ...nightV2Of(state),
    chips: nightV2Of(state).chips.map(item => item.id === 'learn' ? { ...item, color: 'pink' } : item) }),
  /模板与历史不一致/);
});

test('自定义芯片必填验收，增删改复制均不继承批准', () => {
  assert.throws(() => createCustomChip({}, { name: '周报', templatePrompt: '整理本周', acceptance: [] },
    { id: 'custom-report', at: AT }), /芯片数据无效/);
  let state = createCustomChip({}, { name: '周报', templatePrompt: '整理本周', acceptance: ['列出证据'],
    color: 'mint', icon: 'brief', output: 'brief' }, { id: 'custom-report', at: AT });
  assert.equal(nightV2Of(state).chips.at(-1).templateRevision, 1);
  state = reviseChip(state, 'custom-report', { name: '周报草稿', templatePrompt: '新模板' },
    { expectedRevision: 1, at: AT });
  assert.equal(nightV2Of(state).chips.at(-1).templateHistory[0].snapshot.name, '周报');
  state = duplicateCustomChip(state, 'custom-report', { id: 'custom-copy', at: AT });
  const copied = nightV2Of(state).chips.at(-1);
  assert.equal(copied.id, 'custom-copy');
  assert.equal(copied.origin, 'custom');
  assert.equal(copied.templateRevision, 1);
  assert.equal(copied.templatePrompt, '新模板');
  assert.equal(nightV2Of(state).approval, null);
  assert.throws(() => deleteCustomChip(state, 'learn'), /只能删除自定义/);
  state = addSlot(state, { ...draft('custom-copy'), goal: '生成合成周报' }, { id: 'slot-copy' });
  assert.throws(() => deleteCustomChip(state, 'custom-copy'), /先拔掉/);
  state = removeSlot(state, 'slot-copy');
  state = deleteCustomChip(state, 'custom-copy');
  assert.ok(!nightV2Of(state).chips.some(chip => chip.id === 'custom-copy'));
});

test('主题三候选只用已有项目、AI HOT 收藏和随手记，空连接不遮蔽旧项目', () => {
  const state = { connections: { projects: [] }, projects: [{ id: 'p1', name: '首页改造' }],
    learning: { links: [{ id: 'l1', origin: 'aihot', title: 'Agent 记忆分层' },
      { id: 'l2', origin: 'manual', title: '不应入选' },
      { id: 'l3', origin: 'aihot', title: '已删除', deletedAt: AT }] },
    notes: [{ id: 'n1', text: '# Loop 工程停止条件\n更详细的正文' }] };
  assert.deepEqual(topicCandidates(state).map(item => item.source), ['项目空间', 'AI HOT 收藏', '随手记']);
  assert.deepEqual(topicCandidates(state).map(item => item.title), ['首页改造', 'Agent 记忆分层', 'Loop 工程停止条件']);
  assert.deepEqual(topicCandidates({}, { limit: 3 }), []);
  assert.throws(() => topicCandidates(state, { limit: 4 }), /上限无效/);
});

test('客户端 v2 计划拒绝伪造批准及未知执行/秘密字段', () => {
  const plan = nightV2Of({});
  assert.throws(() => validateNightV2({ ...plan, approval: { schema: 'night-v2-approval', planRevision: 0 } }),
    /不能包含执行授权/);
  assert.throws(() => validateNightV2({ ...plan, executorSecret: 'synthetic' }), /计划无效/);
  assert.throws(() => validateNightV2({ ...plan, chips: plan.chips.map((chip, i) => i === 0 ?
    { ...chip, apiKey: 'synthetic' } : chip) }), /芯片数据无效/);
  const state = addSlot({}, draft(), { id: 'slot-a' });
  assert.throws(() => validateNightV2({ ...nightV2Of(state), slots: [{ ...nightV2Of(state).slots[0],
    runApproval: 'synthetic' }] }), /插槽数据无效/);
});
