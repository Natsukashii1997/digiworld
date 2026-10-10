import test from 'node:test';
import assert from 'node:assert/strict';
import { webcrypto } from 'node:crypto';
import { controlledPendingKey, legacyControlledPending,
  readControlledPending, rememberControlledPending,
  forgetControlledPending } from '../src/controlled-execution-pending.js';

const identityA = 'a'.repeat(64), identityB = 'b'.repeat(64);
const id = '11111111-1111-4111-8111-111111111111';
function storage() {
  const map = new Map();
  return { get length() { return map.size; }, key: n => [...map.keys()][n] ?? null,
    getItem: key => map.get(key) ?? null,
    setItem: (key, value) => map.set(key, value),
    removeItem: key => map.delete(key) };
}

test('controlled run UUID is recoverable only under its data root identity', async () => {
  const first = await controlledPendingKey(identityA, webcrypto.subtle);
  const second = await controlledPendingKey(identityB, webcrypto.subtle);
  assert.notEqual(first, second);
  const local = storage();
  assert.equal(rememberControlledPending(local, first, id), true);
  assert.deepEqual(readControlledPending(local, first), [id]);
  assert.deepEqual(readControlledPending(local, second), []);
  assert.equal(forgetControlledPending(local, second, id), true);
  assert.deepEqual(readControlledPending(local, first), [id]);
  assert.equal(forgetControlledPending(local, first, id), true);
  assert.deepEqual(readControlledPending(local, first), []);
});

test('old global UUIDs are quarantined and large legal queues remain readable', async () => {
  const key = await controlledPendingKey(identityA, webcrypto.subtle);
  const local = storage();
  const ids = Array.from({ length: 24 }, (_, index) =>
    `${String(index + 1).padStart(8, '0')}-1111-4111-8111-111111111111`);
  for (const item of ids) {
    local.setItem(`workbench:controlled-execution:pending:v1:${item}`, item);
    local.setItem(`${key}:operation:${item}`, item);
  }
  assert.deepEqual(legacyControlledPending(local), ids);
  assert.deepEqual(readControlledPending(local, key), ids);
  assert.equal(rememberControlledPending(local, key,
    '99999999-1111-4111-8111-111111111111'), false);
});
