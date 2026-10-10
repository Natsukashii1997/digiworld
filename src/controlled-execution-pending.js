import { scopedAgentPendingKey, agentPendingQueue,
  retainAgentPending, settleAgentPending } from './useAgentPending.js';

const UUID = /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/;
const LEGACY_PREFIX = 'workbench:controlled-execution:pending:v1:';
const SCOPE = 'controlled-execution';
// Every run in one data root is in the same ledger. Project or target selection
// must not hide an unresolved UUID from another selection in that root.
const TUPLE = JSON.stringify(['controlled-execution', 'all-runs']);

export const controlledPendingKey = (dataRootIdentity, subtle) =>
  scopedAgentPendingKey(SCOPE, TUPLE, dataRootIdentity, subtle);

export function legacyControlledPending(storage) {
  const ids = new Set();
  for (let n = 0; n < storage.length; n++) {
    const key = storage.key(n);
    if (!key?.startsWith(LEGACY_PREFIX)) continue;
    const id = key.slice(LEGACY_PREFIX.length);
    if (!UUID.test(id) || storage.getItem(key) !== id)
      throw Error('旧待查编号无效');
    ids.add(id);
  }
  return [...ids].sort();
}

export const readControlledPending = (storage, key) => agentPendingQueue(storage, key);

export function rememberControlledPending(storage, key, id) {
  if (agentPendingQueue(storage, key).length) return false;
  return retainAgentPending(storage, key, id, '');
}

export function forgetControlledPending(storage, key, id) {
  settleAgentPending(storage, key, id);
  return !agentPendingQueue(storage, key).includes(id);
}

export const controlledLegacyPrefix = LEGACY_PREFIX;
