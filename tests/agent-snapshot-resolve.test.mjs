import assert from 'node:assert/strict';
import { test } from 'node:test';
import fs from 'node:fs/promises';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createAgentSnapshots, snapshotBindingIdentity } from '../server/agent-snapshots.mjs';
import { digest, failure, openRepository } from '../server/repository.mjs';
import { seed } from '../src/store.js';

const id = n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const query = input => ({targetId: input.targetId, operationId: input.operationId});

async function fixture(t, { filesystem = fs, pauseConfig = null } = {}) {
  const directory = await fs.realpath(await mkdtemp(join(tmpdir(), 'snapshot-resolve-synthetic-')));
  let repository = await openRepository(directory);
  t.after(async () => { await repository.close(); await fs.rm(directory, { recursive: true, force: true }); });
  await repository.write(seed(), { initialize: true });
  const at = '2026-10-07T00:00:00.000Z';
  await repository.updateConnections(c => ({
    roots: [], projects: [], agents: [],
    github: { status: 'not_connected', login: '', message: '', at: '' },
    projectScannedAt: '', agentScannedAt: '', errors: [], truncated: false,
    ...c, agentTargets: [{
    schema: 1, id: 'synthetic-target', agentId: 'codex', bindingId: 'binding-a', label: '合成目标',
    program: { path: '/synthetic/cli', kind: 'CLI' },
    home: { id: 'synthetic-home', path: '/synthetic/home', label: '合成 Home' },
    createdAt: at, updatedAt: at,
  }] }));
  let binding = 'a';
  const text = 'synthetic config without real host access';
  const config = { file: { hash: digest(text), identity: 'synthetic-inode-a' }, text };
  const scope = async (state, targetId, expected) => {
    if (!state.connections?.agentTargets?.some(target => target.id === targetId)) throw failure('合成目标不存在', 409);
    const place = {
      target: { agentId: 'codex' },
      targetSignature: digest('target-' + binding),
      homeSignature: digest('home-' + binding),
      programSignature: digest('program-' + binding),
    };
    if (expected && ['targetSignature', 'homeSignature', 'programSignature'].some(key => place[key] !== expected[key]))
      throw failure('目标绑定、程序或 Home 身份已变化', 409);
    return place;
  };
  const configAt = async place => { if (pauseConfig) await pauseConfig(); return config; };
  const inspect = () => ({ fields: [
    { key: 'tui.animations', status: 'configured', value: true },
    { key: 'tui.show_tooltips', status: 'unset', value: null },
  ] });
  const manager = () => createAgentSnapshots(repository, { filesystem, scope, configAt, inspect });
  const request = async operationId => {
    const place = await scope(await repository.read(), 'synthetic-target');
    return { targetId: 'synthetic-target', revision: (await repository.read()).revision,
      sourceSha256: config.file.hash,
      sourceIdentity: digest(JSON.stringify([place.targetSignature, place.homeSignature, place.programSignature, config.file.identity])),
      operationId };
  };
  return { directory, get repository() { return repository; }, manager, request,
    rebind: () => { binding = 'b'; },
    async reopen() { await repository.close(); repository = await openRepository(directory); },
  };
}

test('resolve wins queue: durable not_saved closes UUID before delayed save', async t => {
  const f = await fixture(t), manager = f.manager(), input = await f.request(id(271));
  const [resolved, late] = await Promise.allSettled([manager.resolve(query(input)), manager.save(input)]);
  assert.deepEqual(resolved.value, { status: 'not_saved', operationId: input.operationId });
  assert.equal(late.status, 'rejected');
  assert.equal(late.reason.status, 409);
  await assert.rejects(fs.lstat(join(f.directory, 'agent-config-snapshots', input.operationId + '.json')), { code: 'ENOENT' });
  const closure = JSON.parse(await fs.readFile(join(f.directory, 'agent-config-snapshot-closures', input.operationId + '.json')));
  assert.deepEqual(Object.keys(closure).sort(), ['at', 'id', 'schema', 'targetId']);
  const { packDirectory } = await import('../server/full-backup.mjs');
  const backup = await packDirectory(f.directory);
  assert.ok(backup.manifest.files.some(file => file.path === 'agent-config-snapshot-closures/' + input.operationId + '.json'));
  await f.reopen();
  assert.deepEqual(await f.manager().resolve(query(input)), { status: 'not_saved', operationId: input.operationId });
  await assert.rejects(f.manager().save(input), error => error.status === 409);
});

test('save wins queue: resolve waits and returns only current-bound saved whitelist', async t => {
  let entered, release;
  const started = new Promise(resolve => { entered = resolve; });
  const held = new Promise(resolve => { release = resolve; });
  let block = false;
  const f = await fixture(t, { pauseConfig: async () => { if (block) { block = false; entered(); await held; } } });
  const manager = f.manager(), input = await f.request(id(272));
  block = true;
  const saving = manager.save(input);
  await started;
  const resolving = manager.resolve(query(input));
  let resolvedEarly = false;
  resolving.then(() => { resolvedEarly = true; });
  await Promise.resolve();
  assert.equal(resolvedEarly, false);
  release();
  const [saved, result] = await Promise.all([saving, resolving]);
  assert.equal(saved.status, 'saved');
  assert.deepEqual(result, { status: 'saved', operationId: input.operationId, snapshot: saved });
  await assert.rejects(fs.lstat(join(f.directory, 'agent-config-snapshot-closures', input.operationId + '.json')), { code: 'ENOENT' });
});

test('lost closure response stays unknown first, next resolve sees durable closure; late save rejected', async t => {
  let inject = true;
  const filesystem = new Proxy(fs, { get(target, key) {
    if (key === 'rename') return async (from, to) => {
      const value = await target.rename(from, to);
      if (inject && String(to).includes('/agent-config-snapshot-closures/')) { inject = false; throw Error('PRIVATE_SENTINEL'); }
      return value;
    };
    return target[key];
  } });
  const f = await fixture(t, { filesystem }), manager = f.manager(), input = await f.request(id(273));
  await assert.rejects(manager.resolve(query(input)), error => error.status === 503 && !error.message.includes('PRIVATE_SENTINEL'));
  await f.reopen();
  assert.deepEqual(await f.manager().resolve(query(input)), { status: 'not_saved', operationId: input.operationId });
  await assert.rejects(f.manager().save(input), error => error.status === 409);
});

test('closure fails before durable write: resolve stays unknown and original save may win', async t => {
  let inject = true;
  const filesystem = new Proxy(fs, { get(target, key) {
    if (key === 'open') return async (path, ...rest) => {
      if (inject && String(path).includes('/agent-config-snapshot-closures/') && String(path).endsWith('.tmp')) {
        inject = false; throw Error('PRIVATE_SENTINEL');
      }
      return target.open(path, ...rest);
    };
    return target[key];
  } });
  const f = await fixture(t, { filesystem }), manager = f.manager(), input = await f.request(id(275));
  await assert.rejects(manager.resolve(query(input)), error => error.status === 503 && !error.message.includes('PRIVATE_SENTINEL'));
  await assert.rejects(fs.lstat(join(f.directory, 'agent-config-snapshot-closures', input.operationId + '.json')), { code: 'ENOENT' });
  const saved = await manager.save(input);
  assert.equal(saved.status, 'saved');
  assert.equal((await manager.resolve(query(input))).status, 'saved');
});

test('rebound target returns binding_changed without historical values or source SHA', async t => {
  const f = await fixture(t), manager = f.manager(), input = await f.request(id(274));
  await manager.save(input);
  f.rebind();
  assert.notEqual(snapshotBindingIdentity({targetSignature:digest('target-a'),homeSignature:digest('home-a'),programSignature:digest('program-a')}),
    snapshotBindingIdentity({targetSignature:digest('target-b'),homeSignature:digest('home-b'),programSignature:digest('program-b')}));
  assert.deepEqual(await manager.resolve(query(input)), { status: 'binding_changed', operationId: input.operationId });
  await assert.rejects(manager.read({ id: input.operationId }), /身份已变化/);
  assert.equal((await manager.history({ targetId: input.targetId })).items.length, 0);
  await assert.rejects(manager.resolve({ ...query(input), targetId: 'different-target' }), error => error.status === 409);
});
