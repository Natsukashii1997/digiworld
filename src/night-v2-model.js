// 夜巡 v2 的纯数据合同。v1 draft/approval 不进入本计划，所有调用者必须单独确认 v2。
const SCHEMA = 'night-v2';
const ACTORS = ['claude', 'codex'];
const OUTPUT_IDS = ['report', 'list', 'branch', 'brief'];
const EDIT_FIELDS = ['name', 'color', 'icon', 'output', 'canEditCode', 'network', 'brake',
  'executor', 'reviewer', 'templatePrompt', 'acceptance'];
const COLORS = [
  ['violet', '紫晶', '168,145,255'],
  ['orange', '熔橙', '255,138,36'],
  ['cyan', '冰蓝', '77,227,255'],
  ['pink', '樱粉', '255,143,184'],
  ['yellow', '暖金', '255,209,102'],
  ['mint', '薄荷', '143,227,196'],
];

const deepFreeze = value => {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.values(value).forEach(deepFreeze);
    Object.freeze(value);
  }
  return value;
};
const copy = value => structuredClone(value);
const bad = message => { throw new Error(message); };
const plain = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const exactKeys = (value, keys) => plain(value) &&
  Object.keys(value).sort().join('|') === [...keys].sort().join('|');
const text = (value, max = 2000) => typeof value === 'string' && value.trim().length > 0 && [...value].length <= max;
const optionalText = (value, max = 2000) => typeof value === 'string' && [...value].length <= max;
const ident = value => typeof value === 'string' && /^[A-Za-z0-9][A-Za-z0-9._:-]{0,99}$/.test(value);
const projectIdent = value => typeof value === 'string' && /^[A-Za-z0-9_-]{1,100}$/.test(value);
const timestamp = value => value === null || (typeof value === 'string' && !Number.isNaN(Date.parse(value)));
const lines = (value, { allowEmpty = false, max = 20, each = 500 } = {}) =>
  Array.isArray(value) && value.length <= max && (allowEmpty || value.length > 0) && value.every(item => text(item, each));
const parseLines = value => Array.isArray(value) ? value.map(item => String(item).trim()) :
  typeof value === 'string' ? value.split(/\r?\n/).map(item => item.trim()).filter(Boolean) : value;
const snapshotOf = chip => Object.fromEntries(EDIT_FIELDS.map(key => [key, copy(chip[key])]));
const validSnapshot = item => plain(item) &&
  exactKeys(item, EDIT_FIELDS) &&
  text(item.name, 80) && NIGHT_V2_COLORS.some(color => color.id === item.color) &&
  NIGHT_V2_ICONS.some(icon => icon.id === item.icon) && OUTPUT_IDS.includes(item.output) &&
  typeof item.canEditCode === 'boolean' && ['off', 'readonly'].includes(item.network) &&
  (!item.canEditCode || item.network === 'off') && plain(item.brake) &&
  exactKeys(item.brake, ['maxRounds', 'maxMinutes']) &&
  Number.isSafeInteger(item.brake.maxRounds) && item.brake.maxRounds >= 1 && item.brake.maxRounds <= 100 &&
  Number.isSafeInteger(item.brake.maxMinutes) && item.brake.maxMinutes >= 1 && item.brake.maxMinutes <= 480 &&
  ACTORS.includes(item.executor) && (item.reviewer === null || ACTORS.includes(item.reviewer)) &&
  item.reviewer !== item.executor && text(item.templatePrompt, 20000) && lines(item.acceptance);

export const NIGHT_V2_COLORS = deepFreeze(COLORS.map(([id, label, hue]) => ({ id, label, hue })));
export const NIGHT_V2_ICONS = deepFreeze([
  { id: 'learn', label: '学习' }, { id: 'push', label: '推进' },
  { id: 'test', label: '测试' }, { id: 'review', label: '审查' },
  { id: 'deps', label: '巡检' }, { id: 'brief', label: '简报' },
]);
export const NIGHT_V2_OUTPUTS = deepFreeze([
  { id: 'report', label: '报告' }, { id: 'list', label: '清单' },
  { id: 'branch', label: '分支' }, { id: 'brief', label: '一页简报' },
]);

function preset(id, code, name, color, icon, output, canEditCode, network, brake, executor, reviewer, prompt, acceptance) {
  const chip = { id, kind: 'chip', origin: 'builtin', code, name, color, icon, output, canEditCode, network,
    brake, executor, reviewer, templatePrompt: prompt, templateRevision: 1, acceptance };
  return { ...chip, templateHistory: [{ revision: 1, at: null, prompt, snapshot: snapshotOf(chip) }] };
}

export const NIGHT_V2_PRESETS = deepFreeze([
  preset('learn', 'C-01', '深度学习', 'violet', 'learn', 'report', false, 'readonly',
    { maxRounds: 4, maxMinutes: 45 }, 'claude', null,
    '围绕{主题}做深度学习：先写现有理解与三个待验证问题；按顺序记录高质量来源、获得的事实和理解修正；关键洞见至少两个来源交叉印证，否则标待证；结合{项目}给出学习、项目、认知三方面建议。只读网页，不登录或提交表单，不读真实 Vault。',
    ['至少五个有链接的高质量来源', '每条关键洞见至少两个来源印证，否则标待证', '学习、项目、认知三类建议各至少一条']),
  preset('push', 'C-02', '继续跑项目', 'orange', 'push', 'branch', true, 'off',
    { maxRounds: 12, maxMinutes: 180 }, 'codex', 'claude',
    '在独立 worktree 继续推进{项目}的明确目标。每轮小步修改并运行相关测试与构建，按验收逐条留证据；受阻记录首败和下一步。从不推送、安装依赖、合并主线或修改主目录 CURRENT。',
    ['目标验收逐条有测试或可回读证据', '保留变更文件、轮次和最后绿提交', '给出与 main 的冲突检查结果']),
  preset('test', 'C-03', '测试白天功能', 'cyan', 'test', 'report', true, 'off',
    { maxRounds: 4, maxMinutes: 45 }, 'codex', null,
    '对{项目}指定的白天功能做合成和隔离测试。先明确期望与失败路径，再运行用例；缺陷需保存复现、期望、实际、证据和可能原因；新增测试只提交本地独立分支。',
    ['列出运行的用例及结果', '缺陷逐条有复现与证据', '记录新增测试及其运行结果']),
  preset('review', 'C-04', '代码审查', 'pink', 'review', 'list', false, 'off',
    { maxRounds: 4, maxMinutes: 45 }, 'claude', 'codex',
    '只读审查{项目}指定范围，按风险列出位置、证据、影响和验证方法；未经证据支持的不宣称缺陷。另一 Agent 复核重要发现。',
    ['每条风险附文件位置或复现证据', '重要发现经另一 Agent 复核', '区分确认缺陷与待验证疑点']),
  preset('deps', 'C-05', '依赖巡检', 'yellow', 'deps', 'list', false, 'readonly',
    { maxRounds: 4, maxMinutes: 20 }, 'codex', null,
    '只读检查{项目}已有依赖与公开安全通告，列出版本、来源、适用范围和证据。只报告，不升级或安装。',
    ['每条通告附来源与受影响版本', '区分已确认适用与待核实', '不更改依赖或锁文件']),
  preset('brief', 'C-06', '明日简报', 'mint', 'brief', 'brief', false, 'off',
    { maxRounds: 4, maxMinutes: 10 }, 'claude', null,
    '依据工作台已有资料，形成一页明日简报：已完成、未决、明日优先事项与证据指针。只读已有资料，不替用户作批准或对外发送。',
    ['一页内列出明日优先事项', '每个关键结论有已有资料指针', '明确未决项和责任人']),
  { id: 'custom', kind: 'custom-entry', code: 'C-07', name: '自定义芯片', color: 'mint', icon: 'brief', output: null },
]);

function emptyPlan() {
  return { schema: SCHEMA, revision: 0, chips: copy(NIGHT_V2_PRESETS.filter(item => item.kind === 'chip')),
    slots: [], window: { start: '23:00', end: '07:00' }, supplementArchive: [], approval: null };
}

function assertChip(chip) {
  if (!exactKeys(chip, ['id', 'kind', 'origin', 'code', ...EDIT_FIELDS, 'templateRevision', 'templateHistory']) ||
    !ident(chip.id) || !['builtin', 'custom'].includes(chip.origin) ||
    chip.kind !== 'chip' || !text(chip.code, 24) || !text(chip.name, 80) ||
    !NIGHT_V2_COLORS.some(item => item.id === chip.color) ||
    !NIGHT_V2_ICONS.some(item => item.id === chip.icon) || !OUTPUT_IDS.includes(chip.output) ||
    typeof chip.canEditCode !== 'boolean' || !['off', 'readonly'].includes(chip.network) ||
    chip.canEditCode && chip.network !== 'off' || !exactKeys(chip.brake, ['maxRounds', 'maxMinutes']) ||
    !Number.isSafeInteger(chip.brake.maxRounds) || chip.brake.maxRounds < 1 || chip.brake.maxRounds > 100 ||
    !Number.isSafeInteger(chip.brake.maxMinutes) || chip.brake.maxMinutes < 1 || chip.brake.maxMinutes > 480 ||
    !ACTORS.includes(chip.executor) || chip.reviewer !== null && !ACTORS.includes(chip.reviewer) ||
    chip.reviewer === chip.executor || !text(chip.templatePrompt, 20000) ||
    !Number.isSafeInteger(chip.templateRevision) || chip.templateRevision < 1 ||
    !lines(chip.acceptance) || !Array.isArray(chip.templateHistory) ||
    chip.templateHistory.length !== chip.templateRevision)
    bad('夜巡芯片数据无效');
  chip.templateHistory.forEach((entry, index) => {
    if (!exactKeys(entry, ['revision', 'at', 'prompt', 'snapshot']) ||
      entry.revision !== index + 1 || !timestamp(entry.at) || !text(entry.prompt, 20000) ||
      !validSnapshot(entry.snapshot) || entry.prompt !== entry.snapshot.templatePrompt)
      bad('夜巡芯片模板历史无效');
  });
  if (JSON.stringify(chip.templateHistory.at(-1).snapshot) !== JSON.stringify(snapshotOf(chip)))
    bad('夜巡芯片模板与历史不一致');
}

function assertSlot(slot, chips) {
  const chip = chips.find(item => item.id === slot?.chipId);
  const fields = ['id', 'chipId', 'chipRevision', 'projectId', 'goal', 'acceptance', 'taskRedlines',
    'executor', 'reviewer', 'topic', 'tonightSupplement', 'context', 'referenceFiles', 'uncertainIf', 'brakeOverrides'];
  if (!exactKeys(slot, Object.hasOwn(slot || {}, 'continueFrom') ? [...fields, 'continueFrom'] : fields) ||
    !ident(slot.id) || !chip ||
    !Number.isSafeInteger(slot.chipRevision) || slot.chipRevision < 1 ||
    !chip.templateHistory.some(entry => entry.revision === slot.chipRevision) ||
    !(slot.projectId === '' ? !chip.canEditCode : projectIdent(slot.projectId)) ||
    !text(slot.goal, 2000) || !lines(slot.acceptance) ||
    !lines(slot.taskRedlines, { allowEmpty: true }) || !ACTORS.includes(slot.executor) ||
    slot.reviewer !== null && !ACTORS.includes(slot.reviewer) || slot.reviewer === slot.executor ||
    !optionalText(slot.topic, 300) || !optionalText(slot.tonightSupplement, 600) ||
    !optionalText(slot.context, 4000) || !lines(slot.referenceFiles, { allowEmpty: true, max: 20, each: 500 }) ||
    !optionalText(slot.uncertainIf, 1000) ||
    slot.brakeOverrides !== null && (!exactKeys(slot.brakeOverrides, ['maxRounds', 'maxMinutes']) ||
      !Number.isSafeInteger(slot.brakeOverrides.maxRounds) || slot.brakeOverrides.maxRounds < 1 || slot.brakeOverrides.maxRounds > 100 ||
      !Number.isSafeInteger(slot.brakeOverrides.maxMinutes) || slot.brakeOverrides.maxMinutes < 1 || slot.brakeOverrides.maxMinutes > 480))
    bad('夜巡插槽数据无效');
  if (Object.hasOwn(slot, 'continueFrom')) {
    const source = slot.continueFrom;
    if (!chip.canEditCode || !projectIdent(slot.projectId) ||
      !exactKeys(source, ['runId', 'slotId', 'projectId', 'branch', 'lastGreenSha', 'operationId']) ||
      !/^[a-f0-9-]{36}$/.test(source.runId) || !ident(source.slotId) ||
      source.projectId !== slot.projectId || !/^night\/[A-Za-z0-9._/-]{1,120}$/.test(source.branch) ||
      !/^[a-f0-9]{7,64}$/.test(source.lastGreenSha) || !/^[a-f0-9-]{36}$/.test(source.operationId))
      bad('夜巡续跑来源无效');
  }
}

export function validateNightV2(value) {
  if (!exactKeys(value, ['schema', 'revision', 'chips', 'slots', 'window', 'supplementArchive', 'approval']) ||
    value.schema !== SCHEMA || !Number.isSafeInteger(value.revision) || value.revision < 0 ||
    !Array.isArray(value.chips) || !Array.isArray(value.slots) || value.slots.length > 4 ||
    !exactKeys(value.window, ['start', 'end']) || !clockTime(value.window.start) ||
    !clockTime(value.window.end) || value.window.start === value.window.end ||
    !Array.isArray(value.supplementArchive) || value.supplementArchive.length > 1000 ||
    value.approval !== null) bad('夜巡 v2 计划无效：客户端计划不能包含执行授权');
  const chipIds = new Set();
  value.chips.forEach(chip => { assertChip(chip); if (chipIds.has(chip.id)) bad('夜巡芯片 ID 重复'); chipIds.add(chip.id); });
  if (NIGHT_V2_PRESETS.filter(item => item.kind === 'chip').some(item => !chipIds.has(item.id)) || chipIds.has('custom'))
    bad('夜巡内置芯片缺失或自定义入口被当作芯片');
  const slotIds = new Set();
  value.slots.forEach(slot => { assertSlot(slot, value.chips); if (slotIds.has(slot.id)) bad('夜巡插槽 ID 重复'); slotIds.add(slot.id); });
  value.supplementArchive.forEach(entry => {
    if (!exactKeys(entry, ['slotId', 'chipId', 'at', 'text']) ||
      !ident(entry.slotId) || !ident(entry.chipId) || !timestamp(entry.at) ||
      !text(entry.text, 600)) bad('夜巡今晚补充归档无效');
  });
  return value;
}

const clockTime = value => typeof value === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(value);

export function nightV2Of(state) {
  return validateNightV2(state && Object.hasOwn(state, 'nightV2') ? state.nightV2 : emptyPlan());
}

export function setWindow(state, window, { expectedRevision } = {}) {
  const plan = nightV2Of(state);
  if (!exactKeys(window, ['start', 'end']) || !clockTime(window.start) || !clockTime(window.end) ||
    window.start === window.end) bad('夜巡时间窗口无效');
  if (expectedRevision !== undefined && expectedRevision !== plan.revision) bad('夜巡计划 revision 冲突，请重新读取');
  if (window.start === plan.window.start && window.end === plan.window.end) return state;
  return withPlan(state, { ...plan, window: { ...window } }, expectedRevision);
}

function withPlan(state, plan, expectedRevision) {
  const old = nightV2Of(state);
  if (expectedRevision !== undefined && old.revision !== expectedRevision) bad('夜巡计划 revision 冲突，请重新读取');
  const next = validateNightV2({ ...plan, schema: SCHEMA, revision: old.revision + 1, approval: null });
  return { ...state, nightV2: next };
}

function uniqueId(plan, explicit, prefix) {
  const id = explicit ?? `${prefix}-${crypto.randomUUID()}`;
  if (!ident(id) || plan.chips.some(chip => chip.id === id) || plan.slots.some(slot => slot.id === id)) bad('夜巡 ID 无效或重复');
  return id;
}

export function addSlot(state, draft, { id, expectedRevision } = {}) {
  const plan = nightV2Of(state);
  if (!plain(draft) || plan.slots.length >= 4) bad('夜巡插槽已满或任务无效');
  const chip = plan.chips.find(item => item.id === draft.chipId);
  if (!chip) bad('请选择可用的夜巡芯片');
  const acceptance = draft.acceptance === undefined ? copy(chip.acceptance) : parseLines(draft.acceptance);
  const slot = {
    id: uniqueId(plan, id ?? draft.id, 'slot'), chipId: chip.id, chipRevision: chip.templateRevision,
    projectId: draft.projectId ?? '', goal: draft.goal ?? draft.topic ?? '', acceptance,
    taskRedlines: parseLines(draft.taskRedlines ?? []),
    executor: draft.executor ?? chip.executor, reviewer: draft.reviewer === undefined ? chip.reviewer : draft.reviewer,
    topic: draft.topic ?? '', tonightSupplement: draft.tonightSupplement ?? '', context: draft.context ?? '',
    referenceFiles: parseLines(draft.referenceFiles ?? []), uncertainIf: draft.uncertainIf ?? '',
    brakeOverrides: draft.brakeOverrides ?? null,
    ...(draft.continueFrom ? { continueFrom: copy(draft.continueFrom) } : {}),
  };
  assertSlot(slot, plan.chips);
  return withPlan(state, { ...plan, slots: [...plan.slots, slot] }, expectedRevision);
}

export function removeSlot(state, slotId, { expectedRevision } = {}) {
  const plan = nightV2Of(state);
  if (!plan.slots.some(slot => slot.id === slotId)) bad('找不到夜巡插槽');
  return withPlan(state, { ...plan, slots: plan.slots.filter(slot => slot.id !== slotId) }, expectedRevision);
}

const SLOT_EDIT_FIELDS = ['projectId', 'goal', 'acceptance', 'taskRedlines', 'executor', 'reviewer',
  'topic', 'tonightSupplement', 'context', 'referenceFiles', 'uncertainIf', 'brakeOverrides'];
export function updateSlot(state, slotId, changes, { expectedRevision } = {}) {
  const plan = nightV2Of(state), slot = plan.slots.find(item => item.id === slotId);
  if (!slot || !plain(changes) || Object.keys(changes).some(key => !SLOT_EDIT_FIELDS.includes(key)))
    bad('夜巡插槽修改无效');
  if (!Object.keys(changes).length) return state;
  const next = { ...slot, ...changes,
    acceptance: changes.acceptance === undefined ? slot.acceptance : parseLines(changes.acceptance),
    taskRedlines: changes.taskRedlines === undefined ? slot.taskRedlines : parseLines(changes.taskRedlines),
    referenceFiles: changes.referenceFiles === undefined ? slot.referenceFiles : parseLines(changes.referenceFiles),
  };
  assertSlot(next, plan.chips);
  return withPlan(state, { ...plan, slots: plan.slots.map(item => item.id === slotId ? next : item) }, expectedRevision);
}

export function reorderSlots(state, fromIndex, toIndex, { expectedRevision } = {}) {
  const plan = nightV2Of(state);
  if (!Number.isInteger(fromIndex) || !Number.isInteger(toIndex) || fromIndex < 0 || toIndex < 0 ||
    fromIndex >= plan.slots.length || toIndex >= plan.slots.length) bad('夜巡插槽顺序无效');
  if (expectedRevision !== undefined && expectedRevision !== plan.revision) bad('夜巡计划 revision 冲突，请重新读取');
  if (fromIndex === toIndex) return state;
  const slots = [...plan.slots], [moving] = slots.splice(fromIndex, 1);
  slots.splice(toIndex, 0, moving);
  return withPlan(state, { ...plan, slots }, expectedRevision);
}

export function reviseChip(state, chipId, changes, { expectedRevision, at = new Date().toISOString(), expectedPlanRevision } = {}) {
  const plan = nightV2Of(state), chip = plan.chips.find(item => item.id === chipId);
  if (!chip || !plain(changes) || Object.keys(changes).some(key => !EDIT_FIELDS.includes(key))) bad('夜巡芯片修改无效');
  if (expectedRevision === undefined || expectedRevision !== chip.templateRevision) bad('夜巡模板 revision 冲突，请重新读取');
  if (!timestamp(at)) bad('夜巡模板修订时间无效');
  const acceptance = changes.acceptance === undefined ? chip.acceptance : parseLines(changes.acceptance);
  const next = { ...chip, ...changes, acceptance,
    templateRevision: chip.templateRevision + 1,
    templateHistory: [...chip.templateHistory, { revision: chip.templateRevision + 1, at,
      prompt: changes.templatePrompt ?? chip.templatePrompt,
      snapshot: snapshotOf({ ...chip, ...changes, acceptance }) }],
  };
  assertChip(next);
  return withPlan(state, { ...plan, chips: plan.chips.map(item => item.id === chipId ? next : item) }, expectedPlanRevision);
}

export function createCustomChip(state, draft, { id, at = new Date().toISOString(), expectedRevision } = {}) {
  const plan = nightV2Of(state);
  if (!plain(draft) || !timestamp(at)) bad('自定义芯片无效');
  const chipId = uniqueId(plan, id ?? draft.id, 'custom');
  const prompt = draft.templatePrompt ?? '';
  const chip = {
    id: chipId, kind: 'chip', origin: 'custom', code: draft.code ?? `C-${String(plan.chips.length + 1).padStart(2, '0')}`,
    name: draft.name ?? '', color: draft.color ?? 'mint', icon: draft.icon ?? 'brief', output: draft.output ?? 'report',
    canEditCode: draft.canEditCode ?? false, network: draft.network ?? 'off',
    brake: draft.brake ?? { maxRounds: 4, maxMinutes: 45 }, executor: draft.executor ?? 'claude', reviewer: draft.reviewer ?? null,
    templatePrompt: prompt, templateRevision: 1,
    acceptance: parseLines(draft.acceptance ?? []),
  };
  chip.templateHistory = [{ revision: 1, at, prompt, snapshot: snapshotOf(chip) }];
  assertChip(chip);
  return withPlan(state, { ...plan, chips: [...plan.chips, chip] }, expectedRevision);
}

export function duplicateCustomChip(state, chipId, { id, at = new Date().toISOString(), expectedRevision } = {}) {
  const plan = nightV2Of(state), source = plan.chips.find(chip => chip.id === chipId);
  if (!source) bad('找不到要复制的夜巡芯片');
  return createCustomChip(state, { ...source, id: undefined, name: `${source.name} 副本`, code: undefined }, { id, at, expectedRevision });
}

export const duplicateChip = duplicateCustomChip;

export function deleteCustomChip(state, chipId, { expectedRevision } = {}) {
  const plan = nightV2Of(state), chip = plan.chips.find(item => item.id === chipId);
  if (!chip || chip.origin !== 'custom') bad('只能删除自定义芯片');
  if (plan.slots.some(slot => slot.chipId === chipId)) bad('请先拔掉正在使用的自定义芯片');
  return withPlan(state, { ...plan, chips: plan.chips.filter(item => item.id !== chipId) }, expectedRevision);
}

function noteTitle(note) {
  if (text(note?.title, 300)) return note.title.trim();
  if (typeof note?.text !== 'string') return '';
  return note.text.split(/\r?\n/).map(line => line.replace(/^\s*#{1,6}\s*/, '').trim()).find(Boolean) ?? '';
}
export function topicCandidates(state, { limit = 3 } = {}) {
  if (!Number.isSafeInteger(limit) || limit < 0 || limit > 3) bad('主题候选上限无效');
  const projects = [...(Array.isArray(state?.connections?.projects) ? state.connections.projects : []),
    ...(Array.isArray(state?.projects) ? state.projects : [])];
  const links = state?.learning?.links ?? [];
  const notes = state?.notes ?? [];
  const groups = [
    Array.isArray(projects) ? projects.filter(item => item?.active !== false).map(item => ({ id: `project:${item.id}`, title: item.name ?? item.title ?? '', source: '项目空间', sourceId: item.id })) : [],
    Array.isArray(links) ? links.filter(item => item?.origin === 'aihot' && !item.deletedAt).map(item => ({ id: `aihot:${item.id}`, title: item.title ?? '', source: 'AI HOT 收藏', sourceId: item.id })) : [],
    Array.isArray(notes) ? notes.filter(item => !item?.deletedAt).map(item => ({ id: `note:${item.id}`, title: noteTitle(item), source: '随手记', sourceId: item.id })) : [],
  ];
  const seen = new Set(), result = [];
  const take = candidate => {
    if (!ident(candidate.sourceId) || !text(candidate.title, 300)) return;
    const key = candidate.title.trim().toLocaleLowerCase();
    if (seen.has(key) || result.length >= limit) return;
    seen.add(key); result.push({ ...candidate, title: candidate.title.trim() });
  };
  groups.forEach(group => group[0] && take(group[0]));
  groups.forEach(group => group.slice(1).forEach(take));
  return result;
}

export function archiveSupplement(state, slotId, { at = new Date().toISOString(), expectedRevision } = {}) {
  const plan = nightV2Of(state), slot = plan.slots.find(item => item.id === slotId);
  if (!slot || !timestamp(at)) bad('今晚补充归档目标无效');
  if (!slot.tonightSupplement.trim()) return state;
  return withPlan(state, {
    ...plan, slots: plan.slots.map(item => item.id === slotId ? { ...item, tonightSupplement: '' } : item),
    supplementArchive: [...plan.supplementArchive, { slotId, chipId: slot.chipId, at, text: slot.tonightSupplement }],
  }, expectedRevision);
}
