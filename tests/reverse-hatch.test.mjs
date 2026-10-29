// 逆向工程孵蛋 3C 第 1 批（#33）：八格、追问包、拆格放回、每轮与校验。只用合成记录，不读 data/。
import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createSpecimen } from '../src/reverse-recipe.js';
import { SLOTS, SLOT_IDS, slotState, hatchScore, initialHatch, hatchOf, buildHatchPack, buildOrganizePack, parseHatchReply, applyHatchReply, editSlot, appendHatchRound, packHashOf, legacyRounds } from '../src/reverse-hatch.js';
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
  assert.deepEqual(pv.hatch.rounds.at(-1), { ...r.hatch.rounds.at(-1), status: 'back', backAt: at });
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
