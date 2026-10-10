import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createCapabilitySettings } from '../server/capability-settings.mjs';
import { createAgentModelPermissions } from '../server/agent-model-permissions.mjs';
import { createAgentModelConfig } from '../server/agent-model-config.mjs';
import { readConfigFile } from '../server/config-file.mjs';
import { createCapabilitiesHttp } from '../server/capabilities-http.mjs';
import { openRepository } from '../server/repository.mjs';
import { seed } from '../src/store.js';

function repository(directory) {
  let queue = Promise.resolve();
  return { directory, withSnapshot(_options, operation) {
    const result = queue.then(() => operation({ revision: 1 }));
    queue = result.catch(() => {});
    return result;
  } };
}

async function fixture(t) {
  const directory = await fs.realpath(await mkdtemp(join(tmpdir(), 'agent-model-permissions-synthetic-')));
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  const repo = repository(directory);
  return { directory, repo, legacy: createCapabilitySettings(repo),
    model: createAgentModelPermissions(repo) };
}

const input = preview => ({ token: preview.token, operationId: preview.operationId, confirmed: true });
const enableLegacyAgent = async legacy => {
  const preview = await legacy.preview({ capability: 'agent', enabled: true, options: {} });
  assert.equal((await legacy.apply(input(preview))).status, 'verified');
};

test('legacy Agent grant cannot activate the separate default-off model permission', async t => {
  const f = await fixture(t);
  await enableLegacyAgent(f.legacy);
  assert.equal((await f.legacy.get('agent')).enabled, true);
  assert.equal((await f.model.get('agent')).enabled, false);
  assert.equal((await f.model.status()).enabled, false);
  await assert.rejects(f.model.assertEnabled('agent'), /默认关闭/);
  assert.throws(() => f.model.get('night'), /仅支持内部授权槽/);
  assert.deepEqual(Object.keys(await f.model.status()).sort(),
    ['enabled', 'generation', 'reauthorizationRequired']);
});

test('model service uses only its injected permission, even when legacy Agent write is on', async t => {
  const f = await fixture(t);
  await enableLegacyAgent(f.legacy);
  const home = join(f.directory, 'synthetic-home');
  await fs.mkdir(home, { mode: 0o700 });
  const path = join(home, 'config.toml');
  const original = 'model = "old-model"\n';
  await fs.writeFile(path, original, { mode: 0o600 });
  const scope = async (_state, targetId, expected) => {
    assert.equal(targetId, 'synthetic-codex');
    const place = { target: { id: targetId, agentId: 'codex', label: 'synthetic' },
      targetSignature: 'a'.repeat(64), homeSignature: 'b'.repeat(64),
      programSignature: 'c'.repeat(64) };
    if (expected) for (const key of ['targetSignature', 'homeSignature', 'programSignature'])
      assert.equal(expected[key], place[key]);
    return place;
  };
  const configAt = async () => {
    const file = await readConfigFile(path);
    return { path, file, text: new TextDecoder('utf-8', { fatal: true }).decode(file.bytes) };
  };
  const service = createAgentModelConfig(f.repo, { settings: f.model, scope,
    configAt, filesystem: fs, checkMetadata: async () => null });
  const first = await service.preview({ targetId: 'synthetic-codex',
    modelId: 'new-model', revision: 1 });
  assert.equal(first.canConfirm, false);
  await assert.rejects(service.apply({ token: first.token, revision: 1 }),
    error => error.operationNotStarted === true);
  assert.equal(await fs.readFile(path, 'utf8'), original);
  const grant = await f.model.preview({ enabled: true });
  assert.equal((await f.model.apply(input(grant))).status, 'verified');
  const second = await service.preview({ targetId: 'synthetic-codex',
    modelId: 'new-model', revision: 1 });
  assert.equal(second.canConfirm, true);
  assert.equal((await service.apply({ token: second.token, revision: 1 })).status, 'verified');
  assert.equal(await fs.readFile(path, 'utf8'), 'model = "new-model"\n');
  const stale = await service.preview({ targetId: 'synthetic-codex',
    modelId: 'next-model', revision: 1 });
  const revoke = await f.model.preview({ enabled: false });
  assert.equal((await f.model.apply(input(revoke))).status, 'verified');
  await assert.rejects(service.apply({ token: stale.token, revision: 1 }),
    error => error.operationNotStarted === true);
  assert.equal(await fs.readFile(path, 'utf8'), 'model = "new-model"\n');
});

test('independent grant, generation change, revoke, and exact read-back', async t => {
  const f = await fixture(t);
  const before = await f.model.get('agent');
  const grant = await f.model.preview({ enabled: true });
  assert.equal(grant.beforeEnabled, false);
  assert.equal(grant.enabled, true);
  assert.ok(!Object.hasOwn(grant, 'before'));
  const result = await f.model.apply(input(grant));
  assert.equal(result.status, 'verified');
  assert.equal((await f.model.status()).enabled, true);
  assert.equal((await f.model.check({ operationId: grant.operationId })).status, 'verified');
  assert.notEqual((await f.model.get('agent')).generation, before.generation);
  assert.equal((await f.model.status()).enabled, true);
  const revoke = await f.model.preview({ enabled: false });
  assert.equal(revoke.beforeEnabled, true);
  assert.equal((await f.model.apply(input(revoke))).status, 'verified');
  assert.equal((await f.model.status()).enabled, false);
  await assert.rejects(f.model.assertEnabled('agent'), /默认关闭/);
});

test('check wins wrapper queue and durably closes an absent UUID before delayed apply', async t => {
  const f = await fixture(t);
  const grant = await f.model.preview({ enabled: true });
  const checked = f.model.check({ operationId: grant.operationId });
  const delayed = f.model.apply(input(grant));
  assert.deepEqual(await checked, { operationId: grant.operationId,
    status: 'not_started', closed: true,
    reason: '原授权编号已持久封闭，迟到的确认不会执行' });
  assert.equal((await delayed).closed, true);
  assert.equal((await f.model.status()).enabled, false);
  const restarted = createAgentModelPermissions(f.repo);
  assert.equal((await restarted.check({ operationId: grant.operationId })).closed, true);
  assert.equal((await restarted.apply(input(grant))).closed, true);
  assert.equal((await restarted.status()).enabled, false);
});

test('apply wins wrapper queue and check observes verified authorization', async t => {
  const f = await fixture(t);
  const grant = await f.model.preview({ enabled: true });
  const applied = f.model.apply(input(grant));
  const checked = f.model.check({ operationId: grant.operationId });
  assert.equal((await applied).status, 'verified');
  assert.equal((await checked).status, 'verified');
  await assert.rejects(fs.stat(join(f.directory, 'agent-model-permission-closed',
    grant.operationId + '.json')), { code: 'ENOENT' });
});

test('lost closure response remains unknown until the original ID is rechecked', async t => {
  const f = await fixture(t);
  const grant = await f.model.preview({ enabled: true });
  let lose = true;
  const filesystem = new Proxy(fs, { get(target, key) {
    if (key === 'rename') return async (from, to) => {
      const result = await target.rename(from, to);
      if (lose && String(to).includes('/agent-model-permission-closed/')) {
        lose = false; throw Error('PRIVATE_SENTINEL');
      }
      return result;
    };
    const value = target[key];
    return typeof value === 'function' ? value.bind(target) : value;
  } });
  const interrupted = createAgentModelPermissions(f.repo, { filesystem });
  await assert.rejects(interrupted.check({ operationId: grant.operationId }),
    error => error.status === 503 && !error.message.includes('PRIVATE_SENTINEL'));
  const restarted = createAgentModelPermissions(f.repo);
  assert.equal((await restarted.check({ operationId: grant.operationId })).closed, true);
  assert.equal((await restarted.apply(input(grant))).closed, true);
  assert.equal((await restarted.status()).enabled, false);
});

test('copied permission journal on a new data root requires fresh authorization', async t => {
  const f = await fixture(t);
  const grant = await f.model.preview({ enabled: true });
  assert.equal((await f.model.apply(input(grant))).status, 'verified');
  const other = await fs.realpath(await mkdtemp(join(tmpdir(), 'agent-model-permissions-restore-')));
  t.after(() => fs.rm(other, { recursive: true, force: true }));
  await fs.cp(join(f.directory, 'agent-model-permissions'),
    join(other, 'agent-model-permissions'), { recursive: true });
  const restored = createAgentModelPermissions(repository(other));
  const status = await restored.status();
  assert.equal(status.enabled, false);
  assert.equal(status.reauthorizationRequired, true);
  assert.equal((await restored.check({operationId:grant.operationId})).status, 'not_applied');
  await assert.rejects(restored.assertEnabled('agent'), /默认关闭/);
});

test('factory construction is host-I/O free and folder selector rejects other names', () => {
  const never = new Proxy({}, { get() { throw Error('construction touched filesystem'); } });
  const repo = { directory: '/synthetic/not-read', withSnapshot() { throw Error('not called'); } };
  assert.ok(createAgentModelPermissions(repo, { filesystem: never }));
  assert.throws(() => createCapabilitySettings(repo, { journalFolder: '../other' }),
    /日志目录无效/);
});

test('HTTP exposes only explicit POST model-permission status, preview, apply, and check', async t => {
  const directory = await fs.realpath(await mkdtemp(join(tmpdir(), 'agent-model-permission-http-')));
  const repo = await openRepository(directory);
  t.after(async () => { await repo.close(); await fs.rm(directory, { recursive: true, force: true }); });
  await repo.write(seed(), { initialize: true });
  const http = createCapabilitiesHttp(repo, { adapters: { capabilityFilesystem: fs } });
  const route = suffix => '/api/capabilities/agent/model-permission-' + suffix;
  assert.equal((await http.dispatch(route('status'), 'POST', {})).value.enabled, false);
  const preview = (await http.dispatch(route('preview'), 'POST', { enabled: true })).value;
  assert.equal(preview.enabled, true);
  assert.equal(preview.beforeEnabled, false);
  assert.equal((await http.dispatch(route('apply'), 'POST', input(preview))).value.status, 'verified');
  assert.equal((await http.dispatch(route('check'), 'POST',
    { operationId: preview.operationId })).value.status, 'verified');
  assert.equal((await http.dispatch(route('status'), 'POST', {})).value.enabled, true);
  await assert.rejects(http.dispatch(route('status'), 'POST', { extra: true }),
    error => error.status === 400);
  await assert.rejects(http.dispatch(route('status'), 'GET'),
    error => error.status === 404);
});
