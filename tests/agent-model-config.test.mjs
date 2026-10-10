// Candidate synthetic-only service tests. Copy into project tests/ with the two server modules.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createAgentModelConfig } from '../server/agent-model-config.mjs';
import { readConfigFile } from '../server/config-file.mjs';

const original = '# PRIVATE_SENTINEL_DO_NOT_STORE\nmodel = "old-model" # unchanged\n[profiles.dev]\nmodel = "nested"\n';
async function fixture(t, { enabled = true, filesystem = fs, initial = original, checkMetadata = async () => null } = {}) {
  const base = await fs.realpath(await fs.mkdtemp(join(tmpdir(), 'guiji-agent-model-')));
  const data = join(base, 'data'), home = join(base, 'home');
  await fs.mkdir(data, { mode: 0o700 });
  await fs.mkdir(home, { mode: 0o700 });
  const path = join(home, 'config.toml');
  await fs.writeFile(path, initial, { mode: 0o600 });
  const state = { revision: 7 };
  let queue = Promise.resolve();
  const repository = { directory: data, read: async () => state,
    withSnapshot(_options, operation) {
      const result = queue.then(() => operation(state));
      queue = result.catch(() => {});
      return result;
    } };
  let generation = 'initial', homeSignature = 'b'.repeat(64), programSignature = 'c'.repeat(64);
  const targetSignature = 'a'.repeat(64);
  const target = { id: 'codex-one', agentId: 'codex', label: 'Synthetic Codex' };
  const scope = async (_state, id, expected) => {
    assert.equal(id, target.id);
    const place = { target, targetSignature, homeSignature, programSignature };
    if (expected && ['targetSignature', 'homeSignature', 'programSignature']
      .some(key => expected[key] !== place[key]))
      throw Object.assign(new Error('target changed'), { status: 409 });
    return place;
  };
  const configAt = async () => {
    const file = await readConfigFile(path);
    return { path, file, text: new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(file.bytes) };
  };
  const settings = { get: async () => ({ enabled, generation }),
    assertEnabled: async () => {
      if (!enabled) throw Object.assign(new Error('gate off'), { status: 409 });
      return { enabled, generation };
    } };
  let now = Date.parse('2026-10-07T00:00:00.000Z');
  const make = options => createAgentModelConfig(repository, {
    settings, filesystem: options?.filesystem || filesystem, scope, configAt,
    checkMetadata, clock: () => now,
  });
  t.after(async () => fs.rm(base, { recursive: true, force: true }));
  return { base, data, home, path, state, make, api: make(),
    setEnabled(value) { enabled = value; }, changeGeneration() { generation = '1'.repeat(8) + '-1111-4111-8111-' + '1'.repeat(12); },
    changeProgram() { programSignature = 'd'.repeat(64); },
    changeHome() { homeSignature = 'e'.repeat(64); },
    advance(ms) { now += ms; } };
}
const input = p => ({ token: p.token, revision: p.revision });

test('off gate blocks confirm; enabled preview, write receipt, repeat/restart check and rollback preserve other bytes', async t => {
  const f = await fixture(t, { enabled: false });
  let p = await f.api.preview({ targetId: 'codex-one', modelId: 'new-model', revision: f.state.revision });
  assert.equal(p.beforeModel, 'old-model');
  assert.equal(p.afterModel, 'new-model');
  assert.equal(p.canConfirm, false);
  await assert.rejects(f.api.apply(input(p)), e => e.operationNotStarted === true);
  assert.equal(await fs.readFile(f.path, 'utf8'), original);
  f.setEnabled(true);
  p = await f.api.preview({ targetId: 'codex-one', modelId: 'new-model', revision: f.state.revision });
  assert.equal((await f.api.apply(input(p))).status, 'verified');
  const changed = await fs.readFile(f.path, 'utf8');
  assert.equal(changed, original.replace('"old-model"', '"new-model"'));
  assert.equal((await f.api.apply(input(p))).status, 'verified');
  assert.equal((await f.make().check({ id: p.operationId })).status, 'verified');
  const record = await fs.readFile(join(f.data, 'agent-model-operations', p.operationId + '.json'), 'utf8');
  assert.ok(!record.includes('PRIVATE_SENTINEL'));
  assert.ok(!record.includes('[profiles.dev]'));
  const undo = await f.api.rollbackPreview({ id: p.operationId, revision: f.state.revision });
  assert.equal(undo.afterModel, 'old-model');
  assert.equal((await f.api.rollback(input(undo))).status, 'verified');
  assert.equal(await fs.readFile(f.path, 'utf8'), original);
});

test('empty existing config inserts only a top-level model and rollback removes it', async t => {
  const f = await fixture(t, { initial: '' });
  const p = await f.api.preview({ targetId: 'codex-one', modelId: 'synthetic-model', revision: f.state.revision });
  assert.equal(p.beforeModel, null);
  assert.equal((await f.api.apply(input(p))).status, 'verified');
  assert.equal(await fs.readFile(f.path, 'utf8'), 'model = "synthetic-model"\n');
  const undo = await f.api.rollbackPreview({ id: p.operationId, revision: f.state.revision });
  assert.equal((await f.api.rollback(input(undo))).status, 'verified');
  assert.equal(await fs.readFile(f.path, 'utf8'), '');
});

test('check wins the shared queue, durably closes absent UUID, and delayed confirm cannot write after restart', async t => {
  const f = await fixture(t);
  const p = await f.api.preview({ targetId: 'codex-one', modelId: 'synthetic-model', revision: f.state.revision });
  const checked = f.api.check({ id: p.operationId });
  const delayed = f.api.apply(input(p));
  assert.equal((await checked).status, 'not_started');
  assert.equal((await delayed).closed, true);
  assert.equal(await fs.readFile(f.path, 'utf8'), original);
  assert.equal((await f.make().check({ id: p.operationId })).closed, true);
  assert.equal((await f.make().apply(input(p))).closed, true);
  assert.equal(await fs.readFile(f.path, 'utf8'), original);
  const marker = JSON.parse(await fs.readFile(join(f.data, 'agent-model-closed', p.operationId + '.json'), 'utf8'));
  assert.deepEqual(Object.keys(marker).sort(), ['at', 'id', 'schema']);
});

test('confirm wins the shared queue; check sees the prepared operation, not a false closure', async t => {
  const f = await fixture(t);
  const p = await f.api.preview({ targetId: 'codex-one', modelId: 'synthetic-model', revision: f.state.revision });
  const applied = f.api.apply(input(p));
  const checked = f.api.check({ id: p.operationId });
  assert.equal((await applied).status, 'verified');
  assert.equal((await checked).status, 'verified');
  await assert.rejects(fs.stat(join(f.data, 'agent-model-closed', p.operationId + '.json')),
    e => e.code === 'ENOENT');
});

test('known pre-prepare rejection keeps the UUID until a check durably closes its preview', async t => {
  const f = await fixture(t);
  const p = await f.api.preview({ targetId: 'codex-one', modelId: 'synthetic-model', revision: f.state.revision });
  f.setEnabled(false);
  await assert.rejects(f.api.apply(input(p)), e => e.operationNotStarted === true);
  assert.equal((await f.api.check({ id: p.operationId })).closed, true);
  f.setEnabled(true);
  assert.equal((await f.api.apply(input(p))).closed, true);
  assert.equal(await fs.readFile(f.path, 'utf8'), original);
});

test('preview binds gate generation, Home/program signatures, file identity and TTL', async t => {
  const f = await fixture(t);
  let p = await f.api.preview({ targetId: 'codex-one', modelId: 'new-model', revision: f.state.revision });
  f.changeGeneration();
  await assert.rejects(f.api.apply(input(p)), e => e.operationNotStarted === true);
  p = await f.api.preview({ targetId: 'codex-one', modelId: 'new-model', revision: f.state.revision });
  f.changeProgram();
  await assert.rejects(f.api.apply(input(p)), e => e.operationNotStarted === true);
  p = await f.api.preview({ targetId: 'codex-one', modelId: 'new-model', revision: f.state.revision });
  const prior = await fs.readFile(f.path);
  await fs.rename(f.path, f.path + '.old');
  await fs.writeFile(f.path, prior, { mode: 0o600 });
  await assert.rejects(f.api.apply(input(p)), e => e.operationNotStarted === true);
  p = await f.api.preview({ targetId: 'codex-one', modelId: 'new-model', revision: f.state.revision });
  f.advance(300001);
  await assert.rejects(f.api.apply(input(p)), e => e.operationNotStarted === true);
  assert.equal(await fs.readFile(f.path, 'utf8'), original);
});

test('after rename response loss remains unknown and cannot be replayed or rolled back without identity receipt', async t => {
  let lost = false;
  const filesystem = new Proxy(fs, { get(target, key) {
    if (key === 'rename') return async (from, to) => {
      const value = await target.rename(from, to);
      if (!lost && to.endsWith('/config.toml')) { lost = true; throw Error('PRIVATE_SENTINEL'); }
      return value;
    };
    const value = target[key];
    return typeof value === 'function' ? value.bind(target) : value;
  } });
  const f = await fixture(t, { filesystem });
  const p = await f.api.preview({ targetId: 'codex-one', modelId: 'new-model', revision: f.state.revision });
  const result = await f.api.apply(input(p));
  assert.equal(result.status, 'unknown');
  assert.equal((await f.make({ filesystem: fs }).check({ id: p.operationId })).status, 'unknown');
  assert.equal((await f.api.apply(input(p))).status, 'unknown');
  await assert.rejects(f.make({ filesystem: fs }).preview({ targetId: 'codex-one',
    modelId: 'another-model', revision: f.state.revision }),
  e => e.status === 409 && e.message.includes(p.operationId));
  f.changeProgram();
  await assert.rejects(f.make({ filesystem: fs }).preview({ targetId: 'codex-one',
    modelId: 'another-model', revision: f.state.revision }),
  e => e.status === 409 && e.message.includes(p.operationId));
  await assert.rejects(f.api.rollbackPreview({ id: p.operationId, revision: f.state.revision }));
  assert.ok((await fs.readFile(f.path, 'utf8')).includes('new-model'));
});

test('suspected token in source model never enters preview, response, or journal', async t => {
  const f = await fixture(t);
  await fs.writeFile(f.path, 'model = "sk-proj-testtoken"\n# PRIVATE_SENTINEL\n', { mode: 0o600 });
  await assert.rejects(f.api.inspect({ targetId: 'codex-one' }),
    e => !String(e).includes('sk-proj-testtoken'));
  await assert.rejects(f.api.preview({ targetId: 'codex-one', modelId: 'new-model',
    revision: f.state.revision }), e => !String(e).includes('sk-proj-testtoken'));
  assert.deepEqual(await fs.readdir(f.data), []);
});


test('unsupported metadata is rejected before preparing a host-write journal', async t => {
  const f = await fixture(t, {checkMetadata:async()=>{throw Object.assign(Error('synthetic metadata unsupported'),{status:409});}});
  await assert.rejects(f.api.preview({targetId:'codex-one',modelId:'new-model',revision:f.state.revision}),/metadata unsupported/);
  assert.deepEqual(await fs.readdir(f.data),[]);
  assert.equal(await fs.readFile(f.path,'utf8'),original);
});
