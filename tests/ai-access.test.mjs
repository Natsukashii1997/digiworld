// P-13「AI 接入」只读登记：执行方状态、功能清单、对外开放、数据对象；全部合成数据，不碰钥匙串、CLI 与网络。
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createAiAccess, credentialStates, COLLECTION_TOOL_NAMES } from '../server/ai-access.mjs';
import { openRepository } from '../server/repository.mjs';
import { startServer } from '../server/http.mjs';
import { seed } from '../src/store.js';

const probes = (claude, codex) => ({ claude: async () => claude, codex: async () => codex });
const access = ({ state = {}, model = {}, history = [], claude = true, codex = true } = {}) => createAiAccess({
  readState: async () => state, modelStatus: async () => model, modelHistory: async () => history,
  probes: probes(claude, codex), now: () => Date.parse('2026-11-07T12:00:00.000Z') });

test('API Key 只按最近一次连接写入回执判断：已配置 / 已撤回 / 结果未知 / 未配置', () => {
  assert.deepEqual(credentialStates([]), { anthropic: '未配置', openai: '未配置' });
  assert.deepEqual(credentialStates([
    { action: 'credentials', provider: 'anthropic', status: 'verified', at: '2026-11-01T00:00:00Z' },
    { action: 'credentials', provider: 'anthropic', status: 'rolled_back', at: '2026-11-02T00:00:00Z' },
    { action: 'credentials', provider: 'openai', status: 'unknown', at: '2026-11-01T00:00:00Z' },
    { action: 'single-book', provider: 'openai', status: 'verified', at: '2026-11-03T00:00:00Z' },
  ]), { anthropic: '已撤回', openai: '结果未知' });
  assert.equal(credentialStates([
    { action: 'credentials', provider: 'openai', status: 'rolled_back', at: '2026-11-01T00:00:00Z' },
    { action: 'credentials', provider: 'openai', status: 'verified', at: '2026-11-04T00:00:00Z' },
  ]).openai, '已配置');
});

test('执行方状态：CLI 只查是否安装，不冒充已登录；Key 只显示配置状态', async () => {
  const result = await access({ claude: true, codex: false,
    history: [{ action: 'credentials', provider: 'anthropic', status: 'verified', at: '2026-11-01T00:00:00Z' }] }).status();
  const byId = Object.fromEntries(result.executors.map(e => [e.id, e]));
  assert.equal(result.checkedAt, '2026-11-07T12:00:00.000Z');
  assert.deepEqual(Object.keys(byId), ['claude', 'codex', 'anthropic', 'openai']);
  assert.equal(byId.claude.state, '已安装（登录与额度未检查）');
  assert.equal(byId.claude.available, true);
  assert.equal(byId.codex.state, '未安装');
  assert.equal(byId.codex.available, false);
  assert.equal(byId.anthropic.state, 'Key 已配置');
  assert.equal(byId.openai.state, 'Key 未配置');
  for (const e of result.executors) assert.ok(['本机 CLI', '官方 API'].includes(e.access));
});

test('切换默认执行方后，跟随默认的逆向功能随之变化；未设置时按逆向页默认 Codex', async () => {
  const before = await access().status();
  assert.equal(before.defaultExecutor.value, 'codex');
  assert.deepEqual(before.defaultExecutor.appliesTo, ['reverse']);
  const reverse = s => s.features.find(f => f.id === 'reverse');
  assert.equal(reverse(before).executor, 'Codex');
  assert.match(reverse(before).access, /桌面版 Codex/);
  const after = await access({ state: { reverseSettings: { threshold: 90, executor: 'claude' } } }).status();
  assert.equal(after.defaultExecutor.label, 'Claude Code');
  assert.equal(reverse(after).executor, 'Claude Code');
  assert.match(reverse(after).access, /claude -p/);
  const rea = await access({ state: { reverseSettings: { threshold: 90, executor: 'rea' } } }).status();
  assert.equal(reverse(rea).access, '不调用 AI');
});

test('功能清单每行都写清谁做、怎么接、读什么、写到哪、去留；只支持单家的写明原因', async () => {
  const result = await access({ model: { enabled: true, provider: 'anthropic', model: 'claude-haiku-4-5-20251001' } }).status();
  assert.deepEqual(result.features.map(f => f.id), ['reverse', 'book-model', 'night-v1', 'night-v2', 'knowledge-compilation']);
  for (const f of result.features) {
    for (const key of ['name', 'decision', 'ticket', 'executor', 'follows', 'access', 'reads', 'writes', 'trail', 'supports'])
      assert.ok(typeof f[key] === 'string' && f[key].length > 0, `${f.id}.${key}`);
    assert.equal(f.decision, '已下线', '#111 起应用内不再调用 AI');
    if (f.supports.startsWith('仅支持')) assert.match(f.supports, /：.+/);
  }
  const book = result.features.find(f => f.id === 'book-model');
  assert.equal(book.executor, 'Claude（官方 API） · claude-haiku-4-5-20251001');
  assert.equal(book.enabled, true);
  assert.equal((await access().status()).features.find(f => f.id === 'book-model').executor, '未选');
});

test('对外开放与工具源码一致；数据对象、本机模型单列，不进切换', async () => {
  const result = await access().status();
  const profile = result.exposures.find(e => e.id === 'profile-mcp');
  assert.equal(profile.state, '未启用');
  assert.deepEqual(profile.reads, ['read_profile', 'search_knowledge', 'read_note']);
  assert.deepEqual(profile.writes.map(w => w.split('（')[0]), ['propose_profile_change', 'reverse_report']);
  const source = await fs.readFile(new URL('../server/collection-mcp.mjs', import.meta.url), 'utf8');
  const declared = [...source.matchAll(/name:'([a-z_]+)'/g)].map(m => m[1]);
  assert.deepEqual(declared, COLLECTION_TOOL_NAMES);
  assert.ok(result.dataObjects.length >= 5);
  assert.ok(result.localModels.every(m => /不属于可切换执行方/.test(m.detail)));
});

test('HTTP：GET /api/ai-access 读工作区里的逆向执行器与模型能力状态，响应不含密钥字段', async t => {
  const directory = await fs.realpath(await fs.mkdtemp(join(tmpdir(), 'ai-access-synthetic-')));
  const repository = await openRepository(directory);
  await repository.write({ ...seed(), reverseSettings: { threshold: 90, executor: 'claude' } }, { initialize: true });
  await repository.close();
  const app = await startServer({ directory, port: 0, staticRoot: join(import.meta.dirname, '../dist'),
    discovery: { defaultRoots: () => [], aiAccessProbes: probes(true, false) } });
  t.after(async () => { await app.close(); await fs.rm(directory, { recursive: true, force: true }); });
  const session = await (await fetch(app.url + '/api/session', { headers: { 'x-workbench-client': '1' } })).json();
  const response = await fetch(app.url + '/api/ai-access', { headers: { 'x-workbench-token': session.token } });
  assert.equal(response.status, 200);
  const result = await response.json();
  assert.equal(result.defaultExecutor.value, 'claude');
  assert.equal(result.features.find(f => f.id === 'reverse').executor, 'Claude Code');
  assert.equal(result.executors.find(e => e.id === 'codex').state, '未安装');
  assert.equal(result.features.find(f => f.id === 'book-model').enabled, false);
  assert.equal(result.exposures.find(e => e.id === 'profile-mcp').state, 'MCP 服务未启用');
  assert.doesNotMatch(JSON.stringify(result), /"(key|apiKey|token|secret)"\s*:/i);
});
