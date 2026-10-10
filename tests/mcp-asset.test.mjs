import test from 'node:test';
import assert from 'node:assert/strict';
import { validateMcpConfig, codexMcpDelivery } from '../src/mcp-config.js';
import { makeAsset, current, revise, restore, seed } from '../src/store.js';
import { validateState } from '../server/schema.mjs';
import { validateActivity } from '../server/asset-activity-schema.mjs';
import { compareVersions } from '../src/version-diff.js';
import { stringify, parse } from '../src/serialization.js';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openRepository } from '../server/repository.mjs';
import { packDirectory, inspectBackup } from '../server/full-backup.mjs';

const config = () => ({ schema: 1, transport: 'streamable-http', serverId: 'openai_docs',
  origin: 'https://developers.openai.com', path: '/mcp', credentialEnvVar: 'DOCS_MCP_TOKEN' });
const asset = () => makeAsset({ type: 'MCP', title: 'openai_docs', mcpConfig: config() });
const target = { id: 'codex-one', agentId: 'codex', label: '合成 Codex CLI',
  program: { kind: 'CLI', path: '/fixture/bin/codex' },
  home: { id: 'home-one', path: '/fixture/home/codex', label: '合成 Home' } };

test('MCP 仅接受公开 HTTP 地址和环境变量名，拒绝额外执行及凭据字段', () => {
  assert.deepEqual(validateMcpConfig(config()), config());
  assert.deepEqual(validateMcpConfig({ ...config(), origin: 'http://localhost:3456' }).origin, 'http://localhost:3456');
  for (const changed of [
    { origin: 'https://user:pass@example.com' }, { origin: 'https://example.com/path' },
    { origin: 'https://example.com?q=x' }, { origin: 'https://example.com#frag' },
    { origin: 'http://example.com' }, { path: '/mcp?token=secret' }, { path: '/%2e%2e' },
    { credentialEnvVar: 'actual-token-value' }, { credentialEnvVar: 'TOKEN=secret' },
    { transport: 'stdio' }, { headers: { Authorization: 'secret' } },
    { command: 'echo secret' }, { env: { KEY: 'secret' } }, { hook: 'onStart' },
  ]) assert.throws(() => validateMcpConfig({ ...config(), ...changed }));
});

test('资产固定版本、恢复、序列化及服务端导入校验保留 MCP 结构', () => {
  const first = asset();
  const state = { ...seed(), assets: [first] };
  assert.doesNotThrow(() => validateState(state));
  const copy = parse(stringify(state));
  assert.deepEqual(current(copy.assets[0]).mcpConfig, config());
  assert.doesNotThrow(() => validateState(copy));
  const next = revise(first, { mcpConfig: { ...config(), path: '/mcp/v2' } });
  assert.equal(current(first).mcpConfig.path, '/mcp');
  assert.equal(current(next).mcpConfig.path, '/mcp/v2');
  assert.equal(compareVersions(current(first), current(next)).fields.find(f => f.key === 'mcpConfig').label, 'MCP 配置');
  const restored = restore(next, current(first).id);
  assert.equal(current(restored).mcpConfig.path, '/mcp');
  assert.equal(current(restored).restoredFrom, current(first).id);
  assert.doesNotThrow(() => validateState({ ...state, assets: [restored] }));
  for (const invalidVersion of [
    { content: 'hidden-token' }, { description: 'hidden-token' },
    { files: [{ path: 'script.sh', text: true, data: 'echo secret' }] },
    { candidateId: 'candidate-1' }, { mcpConfig: { ...config(), headers: { X: 'secret' } } },
  ]) {
    const poisoned = structuredClone(first);
    Object.assign(poisoned.versions[0], invalidVersion);
    assert.throws(() => validateState({ ...state, assets: [poisoned] }));
  }
  assert.throws(() => makeAsset({ type: 'MCP', title: 'openai_docs', mcpConfig: config(), content: 'token' }));
  assert.throws(() => revise(first, { type: 'Prompt' }));
});

test('须显式选择登记目标，生成官方 Codex TOML 片段；导出不写宿主', () => {
  const version = current(asset());
  assert.throws(() => codexMcpDelivery(version, [target], ''));
  assert.throws(() => codexMcpDelivery(version, [target], 'unknown'));
  assert.throws(() => codexMcpDelivery(version, [{ ...target, agentId: 'hermes' }], target.id));
  const result = codexMcpDelivery(version, [target], target.id);
  assert.equal(result.content, '[mcp_servers."openai_docs"]\nurl = "https://developers.openai.com/mcp"\nbearer_token_env_var = "DOCS_MCP_TOKEN"\n');
  assert.equal(result.adoption, 'unverified');
  assert.equal(result.versionId, version.id);
  assert.match(result.filename, /^mcp-openai_docs-[a-f0-9]{8}\.toml$/);
});

test('MCP 复制计为专属动作，不可伪装 Prompt 使用', () => {
  const a = asset(), v = current(a), state = { ...seed(), assets: [a] };
  const base = { schema: 1, id: 'use-mcp', assetId: a.id, versionId: v.id,
    at: '2026-10-07T00:00:00.000Z', kind: 'use' };
  assert.doesNotThrow(() => validateActivity({ ...state, assetActivity: [{ ...base, action: 'copy-mcp-config' }] }));
  assert.throws(() => validateActivity({ ...state, assetActivity: [{ ...base, action: 'copy-prompt' }] }));
});

test('合成主库完整备份仍可还原 MCP 及旧类型固定版本', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'mcp-asset-backup-'));
  let repository;
  try {
    repository = await openRepository(directory);
    const initial = seed();
    initial.assets.push(makeAsset({ type: 'Rule', title: '合成规则', content: '固定规则正文' }));
    initial.assets.push(asset());
    await repository.write(initial, { initialize: true });
    const packed = await packDirectory(directory);
    const inspected = inspectBackup(packed.bytes);
    assert.equal(inspected.mainDatabase.revision, 1);
    assert.ok(inspected.files.has(`snapshots/${inspected.mainDatabase.file}`));
    const read = await repository.read();
    assert.equal(read.assets.find(item => item.type === 'MCP').versions[0].mcpConfig.serverId, 'openai_docs');
    assert.equal(read.assets.filter(item => item.type !== 'MCP').length, initial.assets.length - 1);
  } finally {
    await repository?.close();
    await rm(directory, { recursive: true, force: true });
  }
});

test("MCP comparison ignores property order without ignoring changed values",()=>{const config={schema:1,transport:"streamable-http",serverId:"docs",origin:"https://example.com",path:"/mcp",credentialEnvVar:null};const reversed=Object.fromEntries(Object.entries(config).reverse());assert.equal(compareVersions({mcpConfig:config},{mcpConfig:reversed}).identical,true);assert.equal(compareVersions({mcpConfig:config},{mcpConfig:{...reversed,path:"/other"}}).identical,false);});
