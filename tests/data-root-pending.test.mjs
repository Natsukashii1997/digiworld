import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, realpath, rename, mkdir, rm, chmod } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { webcrypto } from 'node:crypto';
import { readDataRootIdentity } from '../server/data-root-identity.mjs';
import { agentPendingKey, scopedAgentPendingKey, agentPendingQueue,
  retainAgentPending, legacyAgentPendingIds } from '../src/useAgentPending.js';
import { legacyKnowledgeClipPending, readKnowledgeClipPending,
  persistKnowledgeClipPending, clearKnowledgeClipPending } from '../src/knowledge-clip-pending.js';
import { startServer } from '../server/http.mjs';

const a = '11111111-1111-4111-8111-111111111111';
const b = '22222222-2222-4222-8222-222222222222';
function storage() {
  const map = new Map();
  return { get length() { return map.size; }, key: n => [...map.keys()][n] ?? null,
    getItem: key => map.get(key) ?? null,
    setItem: (key, value) => map.set(key, value),
    removeItem: key => map.delete(key), keys: () => [...map.keys()] };
}
async function roots(t) {
  const base = await realpath(await mkdtemp(join(tmpdir(), 'guiji-root-scope-')));
  const first = join(base, 'first'), second = join(base, 'second');
  await mkdir(first, { mode: 0o700 }); await mkdir(second, { mode: 0o700 });
  t.after(() => rm(base, { recursive: true, force: true }));
  return { base, first, second };
}

test('opaque root identity is stable for one directory, differs across roots and replacement, and fails closed if missing', async t => {
  const { base, first, second } = await roots(t);
  const firstId = await readDataRootIdentity(first), secondId = await readDataRootIdentity(second);
  assert.match(firstId, /^[a-f0-9]{64}$/);
  assert.equal(firstId, await readDataRootIdentity(first));
  assert.notEqual(firstId, secondId);
  assert.ok(!firstId.includes(base));
  await rename(first, join(base, 'old-first'));
  await mkdir(first, { mode: 0o700 });
  assert.notEqual(firstId, await readDataRootIdentity(first));
  await assert.rejects(readDataRootIdentity(join(base, 'absent')), /不可核验/);
});

test('agent pending UUIDs remain recoverable only in their original root scope; legacy keys are quarantined', async t => {
  const { first, second } = await roots(t);
  const firstId = await readDataRootIdentity(first), secondId = await readDataRootIdentity(second);
  const tuple = JSON.stringify(['synthetic-target', '/synthetic/private/home']);
  const keyA = await scopedAgentPendingKey('agent-model', tuple, firstId, webcrypto.subtle);
  const keyB = await scopedAgentPendingKey('agent-model', tuple, secondId, webcrypto.subtle);
  assert.notEqual(keyA, keyB);
  assert.ok(!keyA.includes('/synthetic/'));
  const s = storage();
  assert.equal(retainAgentPending(s, keyA, a), true);
  assert.deepEqual(agentPendingQueue(s, keyB), []);
  assert.deepEqual(agentPendingQueue(s, keyA), [a]);
  const oldKey = await agentPendingKey('agent-model', tuple, webcrypto.subtle);
  s.setItem(oldKey + ':operation:' + b, b);
  assert.deepEqual(legacyAgentPendingIds(s, 'agent-model'), [b]);
  assert.deepEqual(agentPendingQueue(s, keyB), [], 'legacy UUID is never adopted into a different root');
  assert.deepEqual(agentPendingQueue(s, keyA), [a], 'original scoped UUID is retained');
});

test('knowledge clip pending closure in another root cannot erase the original UUID', async t => {
  const { first, second } = await roots(t);
  const firstId = await readDataRootIdentity(first), secondId = await readDataRootIdentity(second);
  const s = storage();
  assert.equal(persistKnowledgeClipPending(s, a, firstId), true);
  assert.deepEqual(readKnowledgeClipPending(s, secondId), []);
  assert.equal(clearKnowledgeClipPending(s, a, secondId), true);
  assert.deepEqual(readKnowledgeClipPending(s, firstId), [a]);
  s.setItem('workbench:knowledge-clip:pending:v1:' + b, b);
  assert.deepEqual(legacyKnowledgeClipPending(s), [b]);
  assert.deepEqual(readKnowledgeClipPending(s, secondId), []);
});

test('large valid recovery queues remain readable while new writes stay gated by unresolved IDs', async t => {
  const { first } = await roots(t);
  const identity = await readDataRootIdentity(first), s = storage();
  const ids = Array.from({ length: 24 }, (_, index) =>
    `${String(index + 1).padStart(8, '0')}-1111-4111-8111-111111111111`);
  for (const id of ids) {
    assert.equal(persistKnowledgeClipPending(s, id, identity), true);
    s.setItem('workbench:knowledge-clip:pending:v1:' + id, id);
  }
  assert.deepEqual(readKnowledgeClipPending(s, identity), ids);
  assert.deepEqual(legacyKnowledgeClipPending(s), ids);
  const tuple = JSON.stringify(['synthetic']);
  const key = await scopedAgentPendingKey('agent-model', tuple, identity, webcrypto.subtle);
  const old = await agentPendingKey('agent-model', tuple, webcrypto.subtle);
  for (const id of ids) {
    s.setItem(key + ':operation:' + id, id);
    s.setItem(old + ':operation:' + id, id);
  }
  assert.deepEqual(agentPendingQueue(s, key), ids);
  assert.deepEqual(legacyAgentPendingIds(s, 'agent-model'), ids);
});

test('/api/session publishes the same opaque root identity only after explicit session request', async t => {
  const { first } = await roots(t);
  const app = await startServer({ directory: first, port: 0 });
  t.after(() => app.close());
  const response = await fetch(app.url + '/api/session', {
    headers: { 'X-Workbench-Client': '1' },
  });
  assert.equal(response.status, 200);
  const value = await response.json();
  assert.equal(value.dataRootIdentity, await readDataRootIdentity(first));
  assert.match(value.dataRootIdentity, /^[a-f0-9]{64}$/);
  await chmod(first, 0o777);
  const unavailable = await fetch(app.url + '/api/session', {
    headers: { 'X-Workbench-Client': '1' },
  });
  assert.equal(unavailable.status, 200, 'legacy workspace remains available on identity failure');
  const fallback = await unavailable.json();
  assert.equal(fallback.dataRootIdentity, null);
  assert.match(fallback.dataRootIdentityError, /身份不可核验/);
});
