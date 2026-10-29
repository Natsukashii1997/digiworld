// 逆向工程孵蛋 3C 第 1 批（#33）：八格、追问包、拆格放回、每轮与校验。只用合成记录，不读 data/。
import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createSpecimen } from '../src/reverse-recipe.js';
import { SLOTS, SLOT_IDS, slotState, hatchScore, initialHatch, hatchOf, buildHatchPack, buildOrganizePack, parseHatchReply, applyHatchReply, editSlot, appendHatchRound, packHashOf, legacyRounds, cellsOf, generateHatchSkill, hatchTitleOf, hatchSlotsText } from '../src/reverse-hatch.js';
import { validateReverseRecords } from '../server/schema.mjs';
import { validateReverseHistory } from '../server/reverse-schema.mjs';

const ev = (c) => 'ev_' + c.repeat(64);
const sha = (s) => createHash('sha256').update(s).digest('hex');
const web = (url, feature) => ({ kind: 'web', url, feature, clues: ['migration', 'handoff'], authorized: true });
const result = (obs, infer, unknown) => {
  const pack = `# 任务包 ${obs}/${infer}/${unknown}`;
  return { conclusions: [...Array(obs).fill('观察'), ...Array(infer).fill('推断')].map((mark, i) => ({ text: `结论 ${i + 1}`, mark, evidence: [ev('a')] })),
    unknowns: Array.from({ length: unknown }, (_, i) => ({ id: 'u' + (i + 1), text: `未知 ${i + 1}` })), pack };
};
const aiRound = (id, at, target, res) => ({
  version: { id, at, executor: 'codex', target, result: res, packHash: sha(res.pack) },
  run: { id, status: 'completed', startedAt: at, finishedAt: at, version: '6.4.0', target, log: [], sequence: 0, truncated: false, executor: 'codex', packVersionId: id },
});
const state = (...records) => ({ reverseRecords: records });

// 三条照正式库形状造的合成记录（网址换成 example.test）：网站两轮、网站被挡一轮、本机文件没有轮次。
function furnace() {
  const r = createSpecimen({ type: 'FN', title: 'Agent迁移和上下文接力功能', target: web('https://app.example.test/agents', 'Agent迁移和上下文接力功能') });
  r.createdAt = '2026-10-15T02:00:00.000Z';
  const a = aiRound('pv-1015', '2026-10-15T03:00:00.000Z', web('https://app.example.test/community', 'Agent迁移和上下文接力功能'), result(2, 1, 4));
  const b = aiRound('pv-1016', '2026-10-16T03:00:00.000Z', structuredClone(r.material.target), result(7, 1, 9));
  r.packVersions = [a.version, b.version]; r.reaRuns = [a.run, b.run]; r.activePackVersionId = 'pv-1016';
  return r;
}
function community() {
  const r = createSpecimen({ type: 'FN', title: '全部', target: web('https://app.example.test/community', '全部') });
  r.reaRuns = [{ id: 'run-1015', status: 'failed', startedAt: '2026-10-15T01:00:00.000Z', finishedAt: '2026-10-15T01:02:00.000Z', version: '6.3.0', target: structuredClone(r.material.target), log: [], sequence: 0, truncated: false, error: { kind: 'result', code: 'REA_EXIT', message: '取证失败' } }];
  return r;
}
function fixtureBin() {
  return createSpecimen({ type: 'FN', title: '验收 · 原生 REA 全能力 · 自建样本', target: { kind: 'local', path: '/fixture/reverse-native572/fixture-bin', feature: '只读确认 Mach-O 架构、文件 SHA256 和 add_demo 符号', authorized: true } });
}
const reply = (parts) => parts.map(([name, known, miss]) => `## ${name}\n已知：${known}\n缺：${miss}`).join('\n\n');
const FULL = SLOTS.map((s) => [s.name, `${s.name}已知`, '无']);

test('八格：状态由已知和缺推出，计分只看八个固定格', () => {
  assert.deepEqual(SLOT_IDS, ['use', 'shape', 'data', 'flow', 'ui', 'edge', 'write', 'check']);
  assert.equal(slotState({ known: 'a', miss: '' }), 'full');
  assert.equal(slotState({ known: 'a', miss: 'b' }), 'half');
  assert.equal(slotState({ known: '', miss: 'b' }), 'empty');
  assert.equal(slotState(undefined), 'empty');
  const h = initialHatch(fixtureBin(), '2026-10-29T00:00:00.000Z');
  assert.equal(h.slots.use.known, '只读确认 Mach-O 架构、文件 SHA256 和 add_demo 符号');
  assert.deepEqual(hatchScore(h), { full: 1, half: 0, empty: 7 });
  assert.deepEqual(h.rounds, []);
});

test('旧记录没有 hatch 也能读：校验通过、起点只有用途一格、不改写旧字段', () => {
  for (const r of [furnace(), community(), fixtureBin()]) {
    const before = structuredClone(r);
    validateReverseRecords([r]);
    assert.deepEqual(hatchScore(hatchOf(r)), { full: 1, half: 0, empty: 7 });
    buildHatchPack(r); buildOrganizePack(r); legacyRounds(r);
    assert.deepEqual(r, before);
  }
  const untyped = { id: 'old-1', title: '一段原文', createdAt: '2026-10-01T00:00:00.000Z', material: { text: '一段原文', url: '' }, why: '', pack: '旧任务包' };
  validateReverseRecords([untyped]);
  assert.equal(hatchOf(untyped).slots.use.known, '一段原文');
});

// 与样稿的差异：样稿把炉子第 1 轮写成「阻断」，那是结论正文里的说法；旧字段只能推出「部分」+ 目标已改（retargeted）。
test('三条合成记录推出的每轮：轮数、日期、谁、观察/推断/未知与样稿一致，状态按旧字段推出', () => {
  const f = legacyRounds(furnace());
  assert.deepEqual(f.map((r) => [r.n, r.at.slice(5, 10), r.by, r.obs, r.infer, r.unknown]), [[1, '10-15', 'codex', 2, 1, 4], [2, '10-16', 'codex', 7, 1, 9]]);
  assert.deepEqual(f.map((r) => [r.status, r.target, r.retargeted]), [['partial', 'https://app.example.test/community', true], ['partial', 'https://app.example.test/agents', false]]);
  const c = legacyRounds(community());
  assert.deepEqual(c.map((r) => [r.n, r.at.slice(5, 10), r.by, r.status, r.error]), [[1, '10-15', 'rea', 'failed', 'REA_EXIT']]);
  assert.deepEqual(legacyRounds(fixtureBin()), []);
  const blocked = community(); blocked.reaRuns[0].error = { kind: 'target', code: 'TARGET_URL_MISMATCH', message: '目标不匹配' };
  assert.equal(legacyRounds(blocked)[0].status, 'blocked');
  const running = community(); running.reaRuns[0] = { ...running.reaRuns[0], status: 'running', error: undefined, finishedAt: undefined };
  assert.deepEqual(legacyRounds(running), []);
});

test('追问包：已知、只问勾上的格子、八格回答格式、过滤凭据，轮次号随已有轮次', () => {
  const r = furnace();
  r.why = '交接很顺 password: hunter2hunter2';
  r.hatch = editSlot(r, 'data', { known: '产物：migration-packages、context-packs', miss: '包的格式和字段' }, '2026-10-29T01:00:00.000Z');
  const pack = buildHatchPack(r, { asked: ['flow', 'data'] });
  assert.match(pack, /^# 拆解任务 · 第 3 轮：Agent迁移和上下文接力功能/, '接着旧记录的两轮往下数');
  assert.ok(pack.includes('参照物：https://app.example.test/agents'));
  assert.ok(pack.includes('- 数据：产物：migration-packages、context-packs'));
  assert.ok(pack.indexOf('1. 数据：包的格式和字段') < pack.indexOf('2. 流程：这一格还空着'), '按八格顺序列问题');
  assert.ok(!pack.includes('结构：这一格还空着'), '没勾的格子不问');
  for (const s of SLOTS) assert.ok(pack.includes(`## ${s.name}\n已知：…\n缺：…`));
  assert.ok(pack.includes('rea MCP'));
  assert.ok(!pack.includes('hunter2'));
  assert.match(buildHatchPack(r), /先做一次完整取证/);
  r.hatch = appendHatchRound(r, { by: 'codex', asked: ['data'], packHash: sha(pack) });
  assert.match(buildHatchPack(r), /第 4 轮/);
  assert.match(buildHatchPack(fixtureBin()), /第 1 轮/);
  const text = createSpecimen({ type: 'TXT', text: '原文段落', why: '节奏' });
  const tp = buildHatchPack(text);
  assert.ok(tp.includes('## 素材\n原文段落') && !tp.includes('rea MCP'));
});

test('按八格整理：只整理当前结论与未知，没有结论时为空', () => {
  const p = buildOrganizePack(furnace());
  assert.ok(p.includes('2026-10-16') && p.includes('[观察] 结论 1') && p.includes('[推断] 结论 8') && p.includes('9. 未知 9'));
  assert.ok(p.includes('不重新取证') && p.includes('## 验收\n已知：…'));
  assert.equal(buildOrganizePack(fixtureBin()), '');
});

test('八格回答：全对、乱序、缺节、多出的节、空节、重复、代码块', () => {
  const all = parseHatchReply(reply(FULL));
  assert.deepEqual(Object.keys(all.slots), SLOT_IDS);
  assert.deepEqual(all.slots.write, { known: '写入与回滚已知', miss: '' });
  assert.deepEqual(all.missing, []); assert.deepEqual(all.unplaced, []);

  const shuffled = parseHatchReply(reply([...FULL].reverse()));
  assert.deepEqual(shuffled.slots, all.slots);

  const partial = parseHatchReply(reply([['数据', '包有三类', '字段格式？'], ['流程', '无', '谁先发起？']]));
  assert.deepEqual(partial.slots, { data: { known: '包有三类', miss: '字段格式？' }, flow: { known: '', miss: '谁先发起？' } });
  assert.deepEqual(partial.missing, ['use', 'shape', 'ui', 'edge', 'write', 'check']);

  const extra = parseHatchReply('先说一句开场白\n\n' + reply([['用途', '迁移', '无'], ['其他', '额外发现', '无']]) + '\n\n## 用途\n已知：第二次写用途\n缺：无\n\n## 界面\n\n## 边界\n随手写的一段，没标已知或缺\n已知：只能迁移自己的 Agent\n缺：…');
  assert.deepEqual(extra.slots.use, { known: '迁移', miss: '' }, '重复的节不覆盖第一次');
  assert.ok(!('ui' in extra.slots), '空节当作没回答');
  assert.deepEqual(extra.slots.edge, { known: '只能迁移自己的 Agent', miss: '' });
  assert.deepEqual(extra.unplaced.map((u) => u.label), ['开头', '其他', '重复的「用途」', '「边界」里没标已知或缺的部分']);
  assert.ok(extra.unplaced[1].text.includes('额外发现'), '分不进格的原样保留');

  const fenced = parseHatchReply('```markdown\n## 结构\n已知：两支\n多行续写\n缺：无\n```');
  assert.deepEqual(fenced.slots.shape, { known: '两支\n多行续写', miss: '' });
  assert.deepEqual(fenced.unplaced, []);

  const code = parseHatchReply('## 流程\n已知：先导出\n```bash\n# 导出命令\n缺：这行是代码\n```\n缺：谁来导入？');
  assert.deepEqual(code.slots.flow, { known: '先导出\n```bash\n# 导出命令\n缺：这行是代码\n```', miss: '谁来导入？' }, '代码块里的 # 和「缺：」都是正文');

  const dotted = parseHatchReply(reply([['界面', '三栏', '无。'], ['验收', '暂无。', '怎么验？']]));
  assert.deepEqual(dotted.slots, { ui: { known: '三栏', miss: '' }, check: { known: '', miss: '怎么验？' } }, '带句号的「无。」也算空');
});

test('八格回答：超长截到 2000 字、多出部分进分不进格；凭据过滤；整份超限拒绝', () => {
  const long = parseHatchReply(reply([['数据', '甲'.repeat(2100), '乙']]));
  assert.equal(long.slots.data.known.length, 2000);
  assert.deepEqual(long.unplaced, [{ label: '「数据」已知超出 2000 字的部分', text: '甲'.repeat(100) }]);
  const secret = parseHatchReply(reply([['边界', '接口要带 token: abcd1234efgh5678', '无']]) + '\n-----BEGIN RSA PRIVATE KEY-----\nxyz\n-----END RSA PRIVATE KEY-----');
  assert.equal(secret.redactions, 2);
  assert.ok(!JSON.stringify(secret).includes('abcd1234') && !JSON.stringify(secret).includes('xyz'));
  assert.throws(() => parseHatchReply('x'.repeat(200001)), /20 万字/);
  assert.throws(() => parseHatchReply(null), /文本/);
});

test('放回结论：预览列出变化；手改过的格子默认不覆盖，勾选后才覆盖；sent 轮次改成 back', () => {
  const r = furnace();
  r.hatch = editSlot(r, 'data', { known: '我自己写的数据', miss: '' }, '2026-10-29T01:00:00.000Z');
  r.hatch = appendHatchRound(r, { by: 'claude', asked: ['data', 'flow'], packHash: sha('p'), at: '2026-10-29T02:00:00.000Z' });
  const parsed = parseHatchReply(reply([['数据', 'Agent 给的数据', '字段？'], ['流程', '三步', '无'], ['用途', r.hatch.slots.use.known, '']]));
  const at = '2026-10-29T03:00:00.000Z';
  const pv = applyHatchReply(r, parsed, { at });
  assert.deepEqual(pv.changes.map((c) => [c.id, c.from.state, c.to.state]), [['flow', 'empty', 'full']]);
  assert.deepEqual(pv.kept.map((k) => k.id), ['data']);
  assert.deepEqual(pv.hatch.slots.data, r.hatch.slots.data, '手改的格子不被覆盖');
  assert.deepEqual(pv.hatch.slots.flow, { known: '三步', miss: '', at });
  assert.deepEqual(pv.hatch.rounds.at(-1), { ...r.hatch.rounds.at(-1), status: 'back', backAt: at, cells: 'feffeeee' }, '放回时记下这一轮的八格快照');
  const forced = applyHatchReply(r, parsed, { at, overwrite: ['data'] });
  assert.deepEqual(forced.hatch.slots.data, { known: 'Agent 给的数据', miss: '字段？', at }, '覆盖后去掉手改标记');
  validateReverseRecords([{ ...r, hatch: pv.hatch }]);
  validateReverseHistory(state(r), state({ ...r, hatch: pv.hatch }));
});

test('校验：hatch 形状与长度', () => {
  const r = fixtureBin();
  r.hatch = initialHatch(r, '2026-10-29T00:00:00.000Z');
  validateReverseRecords([r]);
  const bad = (mut, re) => { const x = structuredClone(r); mut(x.hatch, x); assert.throws(() => validateReverseRecords([x]), re); };
  bad((h) => { h.version = 2; }, /八格版本/);
  bad((h) => { delete h.slots.check; }, /八格不完整/);
  bad((h) => { h.slots.extra = h.slots.use; }, /逆向字段无效/);
  bad((h) => { h.slots.data.known = 'x'.repeat(2001); }, /格子已知/);
  bad((h) => { h.slots.data.miss = 'a\u0007b'; }, /格子缺/);
  bad((h) => { h.slots.data.edited = false; }, /手改标记/);
  bad((h) => { h.rounds = [{ n: 2, at: '2026-10-29T00:00:00.000Z', by: 'codex', asked: [], status: 'sent', packHash: sha('p') }]; }, /序号/);
  bad((h) => { h.rounds = [{ n: 1, at: '2026-10-29T00:00:00.000Z', by: 'rea', asked: [], status: 'sent', packHash: sha('p') }]; }, /执行者/);
  bad((h) => { h.rounds = [{ n: 1, at: '2026-10-29T00:00:00.000Z', by: 'codex', asked: ['data', 'data'], status: 'sent', packHash: sha('p') }]; }, /轮次格子/);
  bad((h) => { h.rounds = [{ n: 1, at: '2026-10-29T00:00:00.000Z', by: 'codex', asked: [], status: 'sent', backAt: '2026-10-29T00:00:00.000Z', packHash: sha('p') }]; }, /轮次状态/);
  bad((h) => { h.rounds = [{ n: 1, at: '2026-10-29T00:00:00.000Z', by: 'codex', asked: [], status: 'back', packHash: 'x' }]; }, /摘要/);
  bad((h, x) => { x.hatchSkills = [{ assetId: 'a1', versionId: 'v1', at: '2026-10-29T00:00:00.000Z', slotsHash: 'nope' }]; }, /孵化回执/);
});

test('轮次只追加：可加新轮、sent → back；不可改写、删除、回退', async () => {
  const r = furnace();
  const pack = buildHatchPack(r, { asked: ['data'] });
  const packHash = await packHashOf(pack);
  assert.equal(packHash, sha(pack));
  const one = { ...r, hatch: appendHatchRound(r, { by: 'codex', asked: ['data'], packHash, at: '2026-10-29T01:00:00.000Z' }) };
  validateReverseHistory(state(r), state(one));
  const back = { ...one, hatch: applyHatchReply(one, parseHatchReply(reply([['数据', '甲', '无']])), { at: '2026-10-29T02:00:00.000Z' }).hatch };
  validateReverseHistory(state(one), state(back));
  const two = { ...back, hatch: appendHatchRound(back, { by: 'claude', asked: [], packHash, at: '2026-10-29T03:00:00.000Z' }) };
  validateReverseHistory(state(back), state(two));
  const reject = (prev, mut) => { const n = structuredClone(prev); mut(n.hatch); assert.throws(() => validateReverseHistory(state(prev), state(n)), /轮次只能追加/); };
  reject(two, (h) => { h.rounds[0].asked = ['flow']; });
  reject(two, (h) => { h.rounds.pop(); });
  reject(two, (h) => { h.rounds[0].backAt = '2026-10-29T09:00:00.000Z'; });
  reject(back, (h) => { h.rounds[0].status = 'sent'; delete h.rounds[0].backAt; });
  const reordered = structuredClone(back); reordered.hatch.rounds[0] = Object.fromEntries(Object.entries(back.hatch.rounds[0]).reverse());
  validateReverseHistory(state(back), state(reordered));
  const sentReordered = structuredClone(one); const r0 = sentReordered.hatch.rounds[0];
  sentReordered.hatch.rounds[0] = { backAt: '2026-10-29T02:00:00.000Z', status: 'back', packHash: r0.packHash, asked: r0.asked, by: r0.by, at: r0.at, n: r0.n };
  validateReverseHistory(state(one), state(sentReordered), {});
  assert.throws(() => validateReverseHistory(state(two), state({ ...two, hatch: undefined })), /轮次只能追加/);
  let many = r;
  for (let i = 0; i < 50; i++) many = { ...many, hatch: appendHatchRound(many, { by: 'codex', packHash }) };
  validateReverseRecords([many]);
  assert.throws(() => appendHatchRound(many, { by: 'codex', packHash }), /最多 50 轮/);
});

test('孵化回执只能经孵化确认写入，已有回执不可改写或删除', () => {
  const r = furnace();
  const receipt = { assetId: 'asset-1', versionId: 'ver-1', at: '2026-10-29T04:00:00.000Z', slotsHash: sha('slots') };
  const next = { ...r, hatchSkills: [receipt] };
  validateReverseRecords([next]);
  assert.throws(() => validateReverseHistory(state(r), state(next)), /孵化回执只能通过孵化确认写入/);
  validateReverseHistory(state(r), state(next), { allowReverseSkill: true });
  const more = { ...next, hatchSkills: [receipt, { ...receipt, versionId: 'ver-2', slotsHash: sha('slots2') }] };
  validateReverseHistory(state(next), state(more), { allowReverseSkill: true });
  assert.throws(() => validateReverseHistory(state(more), state(next), { allowReverseSkill: true }), /不可改写或删除/);
  assert.throws(() => validateReverseHistory(state(next), state({ ...next, hatchSkills: [{ ...receipt, versionId: 'ver-9' }] }), { allowReverseSkill: true }), /不可改写或删除/);
  validateReverseHistory(null, state(next));
  validateReverseHistory(state(), state(next), { allowReverseImport: true });
});

test('手改一格：只能改八格之一，存为 edited 并清洗长度与控制字符', () => {
  const r = fixtureBin();
  const h = editSlot(r, 'ui', { known: '  三栏\u0007布局 ', miss: 'x'.repeat(2500) }, '2026-10-29T00:00:00.000Z');
  assert.deepEqual(h.slots.ui, { known: '三栏布局', miss: 'x'.repeat(2000), edited: true, at: '2026-10-29T00:00:00.000Z' });
  assert.equal(r.hatch, undefined, '不改原记录');
  assert.throws(() => editSlot(r, 'nope', {}), /没有这一格/);
  validateReverseRecords([{ ...r, hatch: h }]);
});

test('孵化成 Skill：填上的写正文、半格写已知和缺、空格进局限；标未经复刻验证；附追问包与 source.json', async () => {
  const { planSkillVersion } = await import('../src/skill-version.js');
  const { inspectSkill } = await import('../src/skill-package.js');
  const r = furnace();
  r.hatch = applyHatchReply(r, parseHatchReply(reply([['结构', '三栏', '无'], ['数据', '会话列表', '同步频率'], ['验收', '能接力', '无']]))).hatch;
  const v = generateHatchSkill(r);
  assert.equal(v.title, hatchTitleOf(r));
  assert.match(v.content, /^---\nname: reverse-hatch-[a-z0-9-]+\n/);
  assert.match(v.content, /未经复刻验证/);
  assert.match(v.content, /## 结构\n三栏/);
  assert.match(v.content, /## 数据（只知道一半）\n已知：会话列表\n缺：同步频率/);
  const limits = v.content.split('## 局限（还没弄清楚）')[1];
  for (const name of ['流程', '界面', '边界', '写入与回滚']) assert.match(limits, new RegExp(`- ${name}：`));
  assert.doesNotMatch(limits, /- 结构|- 验收/);
  assert.match(v.content, /第 2 轮结论/, '轮次接着旧记录往下数');
  assert.deepEqual(v.files.map((f) => f.path), ['SKILL.md', 'task-pack.md', 'source.json']);
  const pack = v.files[1].data;
  assert.match(pack, /不是哪一轮发出的原文/);
  assert.match(pack, /最近一轮：第 2 轮（旧流程记录，没有 packHash）/);
  assert.match(pack, /## 这一轮只回答这些格子/);
  assert.doesNotMatch(pack.split('## 这一轮只回答这些格子')[1].split('## 做法')[0], /结构|验收/);
  const source = JSON.parse(v.files[2].data);
  assert.equal(source.recordId, r.id); assert.equal(source.validation, '未经复刻验证');
  assert.deepEqual(source.hatch.slots.shape, r.hatch.slots.shape);
  planSkillVersion(v); assert.ok(inspectSkill(v.files).name, 'SKILL.md 的 name 合规');
});

test('孵化成 Skill：名字可改且实时进原文；空名、超长名拒绝；凭据过滤；slotsHash 只随八格变', () => {
  const r = fixtureBin();
  assert.match(generateHatchSkill(r, { title: '  我的\n拆解 ' }).content, /^# 我的 拆解$/m);
  assert.throws(() => generateHatchSkill(r, { title: '  ' }), /请填写 Skill 名字/);
  assert.throws(() => generateHatchSkill(r, { title: 'x'.repeat(81) }), /最多 80 字/);
  const fresh = generateHatchSkill(r);
  assert.match(fresh.content, /还没交出过追问包/);
  assert.equal(fresh.score.empty, 7);
  const leaked = { ...r, hatch: editSlot(r, 'data', { known: '令牌 sk-ant-api03-' + 'a'.repeat(40) }) };
  assert.doesNotMatch(generateHatchSkill(leaked).files.map((f) => f.data).join(''), /sk-ant-api03-a{40}/);
  const text = hatchSlotsText(r);
  assert.equal(hatchSlotsText({ ...r, hatch: { ...hatchOf(r), rounds: [{ n: 1 }] } }), text, '轮次不影响');
  assert.notEqual(hatchSlotsText(leaked), text);
  assert.notEqual(hatchSlotsText({ ...r, why: '一步到位' }), text, '改了好在哪里也算新状态');
  assert.match(generateHatchSkill({ ...r, why: '一步到位' }).content, /## 用途\n[^\n]+\n好在哪里：一步到位\n/, '写在用途下方');
});

test('分不进格的段落：只存最近一次放回的，截断超长、清掉没有的；校验形状；轮次快照只能在放回时写', () => {
  const r = fixtureBin(), at = '2026-10-29T03:00:00.000Z';
  const first = applyHatchReply(r, parseHatchReply('开头一段\n\n## 用途\n已知：x\n缺：无\n\n## 其他\n' + 'y'.repeat(6000)), { at });
  assert.equal(first.hatch.unplaced.at, at);
  assert.deepEqual(first.hatch.unplaced.items.map((u) => u.label), ['开头', '其他']);
  assert.match(first.hatch.unplaced.items[1].text, /…（超出部分未保存）$/);
  validateReverseRecords([{ ...r, hatch: first.hatch }]);
  const next = applyHatchReply({ ...r, hatch: first.hatch }, parseHatchReply('## 结构\n已知：三栏\n缺：无'), { at });
  assert.equal(next.hatch.unplaced, undefined, '这次没有就清掉');
  assert.throws(() => validateReverseRecords([{ ...r, hatch: { ...first.hatch, unplaced: { at, items: [] } } }]), /为空/);
  assert.throws(() => validateReverseRecords([{ ...r, hatch: { ...first.hatch, unplaced: { at, items: [{ label: 'x', text: 'y', extra: 1 }] } } }]));
  assert.equal(cellsOf(initialHatch(r).slots), 'feeeeeee');
  // 快照：sent 轮次不能带；已放回的快照不能再改
  const sent = { ...r, hatch: appendHatchRound(r, { by: 'codex', packHash: sha('p'), at }) };
  assert.throws(() => validateReverseRecords([{ ...sent, hatch: { ...sent.hatch, rounds: [{ ...sent.hatch.rounds[0], cells: 'ffffffff' }] } }]), /轮次状态无效/);
  const back = { ...sent, hatch: applyHatchReply(sent, parseHatchReply('## 结构\n已知：三栏\n缺：无'), { at }).hatch };
  validateReverseHistory(state(sent), state(back));
  const moved = { ...back, hatch: { ...back.hatch, rounds: [{ ...back.hatch.rounds[0], cells: 'ffffffff' }] } };
  assert.throws(() => validateReverseHistory(state(back), state(moved)), /轮次只能追加/);
});

test('按八格整理：只有分不进格的段落时也能生成，只整理不取证', () => {
  const r = fixtureBin();
  assert.equal(buildOrganizePack(r), '', '什么都没有时为空');
  r.hatch = applyHatchReply(r, parseHatchReply('## 其他\n顺带发现：有个隐藏开关'), { at: '2026-10-29T03:00:00.000Z' }).hatch;
  const pack = buildOrganizePack(r);
  assert.match(pack, /只整理下面的段落，不重新取证/);
  assert.match(pack, /## 上次放回时分不进格的段落\n### 其他\n顺带发现：有个隐藏开关/);
  assert.doesNotMatch(pack, /## 结论/);
});

test('分不进格超过 20 段：多出的并进最后一段并注明，不悄悄丢掉', () => {
  const r = fixtureBin();
  const raw = Array.from({ length: 23 }, (_, i) => `## 杂项${i + 1}\n内容${i + 1}`).join('\n\n');
  const h = applyHatchReply(r, parseHatchReply(raw), { at: '2026-10-29T03:00:00.000Z' }).hatch;
  assert.equal(h.unplaced.items.length, 20);
  assert.equal(h.unplaced.items[19].label, '其余 4 段（合并）');
  assert.match(h.unplaced.items[19].text, /【杂项20】\n内容20[\s\S]*【杂项23】\n内容23/);
  validateReverseRecords([{ ...r, hatch: h }]);
});
