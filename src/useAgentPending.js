import { useCallback, useEffect, useRef, useState } from 'react';
import { session } from './api.js';

// Only an operation UUID is stored. The target tuple is hashed before it is
// used in a localStorage key, so Home/program paths never enter browser storage.
const UUID = /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/;
const ID = /^[a-zA-Z0-9_-]{1,100}$/;
const SCOPE = /^[a-z][a-z0-9-]{0,39}$/;
const PREFIX = 'workbench:agent-pending:v1:';
const ROOT_PREFIX = 'workbench:agent-pending:v2:';
const SHA = /^[a-f0-9]{64}$/;
const ERROR = '本机待查记录不可用，已停止新写入。';
const LEGACY_ERROR = '发现未绑定数据目录的旧待查编号；已停止新写入。请保留原浏览器资料，并在原数据目录核对后迁移。';

export function agentTargetTuple(target) {
  if (!target || !ID.test(target.id || '') ||
    typeof target.agentId !== 'string' || !target.agentId ||
    typeof target.program?.path !== 'string' || !target.program.path ||
    typeof target.program?.kind !== 'string' || !target.program.kind ||
    typeof target.home?.id !== 'string' || !target.home.id ||
    typeof target.home?.path !== 'string' || !target.home.path ||
    !(target.bindingId === undefined || ID.test(target.bindingId))) return null;
  // Mirrors the stable target signature fields used by server/agent-write.
  // Labels and update timestamps are excluded so a rename keeps the scope.
  return JSON.stringify([target.id, target.agentId, target.program.path,
    target.program.kind, target.home.id, target.home.path, target.bindingId || null]);
}

export async function agentPendingKey(scope, targetTuple, subtle = globalThis.crypto?.subtle) {
  if (!SCOPE.test(scope || '') || typeof targetTuple !== 'string' || !targetTuple ||
    !subtle?.digest) throw Error('待查记录作用域无法核验');
  const hash = await subtle.digest('SHA-256', new TextEncoder().encode(targetTuple));
  const hex = [...new Uint8Array(hash)].map(byte => byte.toString(16).padStart(2, '0')).join('');
  if (!/^[a-f0-9]{64}$/.test(hex)) throw Error('待查记录作用域无法核验');
  return PREFIX + scope + ':' + hex;
}

export async function scopedAgentPendingKey(scope, targetTuple, dataRootIdentity,
  subtle = globalThis.crypto?.subtle) {
  if (!SHA.test(dataRootIdentity || '')) throw Error('数据目录身份无法核验');
  const legacy = await agentPendingKey(scope, targetTuple, subtle);
  return ROOT_PREFIX + dataRootIdentity + ':' + legacy.slice(PREFIX.length);
}

export function legacyAgentPendingIds(storage, scope) {
  if (!SCOPE.test(scope || '')) throw Error('旧待查作用域无效');
  const prefix = PREFIX + scope + ':', ids = new Set();
  for (let n = 0; n < storage.length; n++) {
    const key = storage.key(n);
    if (!key?.startsWith(prefix)) continue;
    const suffix = key.slice(prefix.length);
    const match = suffix.match(/^([a-f0-9]{64})(?::operation:([a-f0-9-]{36}))?$/);
    const id = storage.getItem(key);
    if (!match || !UUID.test(id || '') || match[2] && match[2] !== id)
      throw Error('旧待查编号无效');
    ids.add(id);
  }
  return [...ids].sort();
}

export function readAgentPending(storage, key) {
  const id = storage.getItem(key);
  if (id === null) return '';
  if (!UUID.test(id)) throw Error('本机待查编号无效');
  return id;
}

export function writeAgentPending(storage, key, id, expectedCurrent = '') {
  if (id && !UUID.test(id)) return false;
  const current = readAgentPending(storage, key);
  if (current !== expectedCurrent) return false;
  if (id) storage.setItem(key, id);
  else storage.removeItem(key);
  return readAgentPending(storage, key) === id;
}

// Each attempted operation also gets its own key. Concurrent tabs can replace
// the legacy focus pointer, but cannot overwrite each other's recovery UUID.
export function agentPendingQueue(storage, key) {
  const prefix = key + ':operation:';
  const ids = new Set();
  const primary = readAgentPending(storage, key);
  for (let n = 0; n < storage.length; n++) {
    const name = storage.key(n);
    if (!name?.startsWith(prefix)) continue;
    const id = name.slice(prefix.length);
    if (!UUID.test(id) || storage.getItem(name) !== id) throw Error('本机待查编号无效');
    ids.add(id);
  }
  if (primary) ids.add(primary);
  return primary ? [primary, ...[...ids].filter(id => id !== primary).sort()] : [...ids].sort();
}

export function retainAgentPending(storage, key, id, expected = '') {
  if (!UUID.test(id)) return false;
  const operationKey = key + ':operation:' + id;
  storage.setItem(operationKey, id);
  if (storage.getItem(operationKey) !== id) return false;
  // A failed compare leaves this attempted UUID recoverable. The caller has
  // not sent the request and can query it to obtain a durable closure.
  return writeAgentPending(storage, key, id, expected);
}

export function settleAgentPending(storage, key, id) {
  if (!UUID.test(id)) throw Error('本机待查编号无效');
  const operationKey = key + ':operation:' + id;
  if (storage.getItem(operationKey) !== null && storage.getItem(operationKey) !== id)
    throw Error('本机待查编号无效');
  storage.removeItem(operationKey);
  if (storage.getItem(operationKey) !== null) throw Error('本机待查记录清理未确认');
  if (storage.getItem(key) === id) storage.removeItem(key);
  if (storage.getItem(key) === id) throw Error('本机待查记录清理未确认');
  return agentPendingQueue(storage, key)[0] || '';
}

// ready starts false and remains false on digest, storage, or record errors.
// setId verifies the storage read-back before changing in-memory state. A
// failed clear retains the old id, keeping the UI in recovery mode.
export function useAgentPending({ scope, targetTuple, onIdChange }) {
  const [state, setState] = useState({ key: '', ready: false, error: '', id: '', legacyIds: [] });
  const live = useRef(state), active = useRef(false);
  const update = value => { live.current = value; setState(value); };
  useEffect(() => {
    let current = true;
    active.current = true;
    update({ key: '', ready: false, error: '', id: '', legacyIds: [] });
    session().then(value => scopedAgentPendingKey(scope, targetTuple,
      value?.dataRootIdentity)).then(key => {
      const id = agentPendingQueue(localStorage, key)[0] || '';
      const legacyIds = legacyAgentPendingIds(localStorage, scope);
      if (current) {
        onIdChange?.(id);
        update({ key, ready: !legacyIds.length, error: legacyIds.length ? LEGACY_ERROR : '', id, legacyIds });
      }
    }).catch(() => {
      if (current) update({ key: '', ready: false, error: ERROR, id: '', legacyIds: [] });
    });
    return () => { current = false; active.current = false; };
  }, [scope, targetTuple, onIdChange]);

  useEffect(() => {
    if (!state.key) return undefined;
    function onStorage(event) {
      const value = live.current;
      if (event.key !== value.key && !event.key?.startsWith(value.key + ':operation:') &&
        !event.key?.startsWith(PREFIX + scope + ':') && event.key !== null) return;
      try {
        const id = agentPendingQueue(localStorage, value.key)[0] || '';
        const legacyIds = legacyAgentPendingIds(localStorage, scope);
        // Another tab cannot settle this tab's unresolved operation. Keep the
        // original UUID until its own server query returns a terminal result.
        const retained = value.id && value.id !== id ? value.id : id;
        onIdChange?.(retained);
        update({ ...value, id: retained, legacyIds,
          ready: !legacyIds.length,
          error: legacyIds.length ? LEGACY_ERROR : '' });
      } catch { update({ ...value, ready: false, error: ERROR }); }
    }
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, [onIdChange, scope, state.key]);

  const setId = useCallback((id, expectedId) => {
    // An awaited save still owns the callback from its first render. Read the
    // current ID synchronously so its terminal response can clear exactly that
    // pending UUID, without clearing a different tab's operation.
    const value = live.current;
    if (!active.current || !value.key) return false;
    if (id && value.id && id !== value.id) return false;
    const expected = expectedId === undefined ? value.id : expectedId;
    try {
      if (!id) {
        if (!expected || value.id !== expected) return false;
        const next = settleAgentPending(localStorage, value.key, expected);
        onIdChange?.(next);
        update({ ...value, id: next });
        return true;
      }
      const legacyIds = legacyAgentPendingIds(localStorage, scope);
      if (!value.ready || value.error || legacyIds.length) {
        update({ ...value, ready: false,
          error: legacyIds.length ? LEGACY_ERROR : value.error || ERROR, legacyIds });
        return false;
      }
      if (!retainAgentPending(localStorage, value.key, id, expected)) {
        update({ ...value, ready: false, error: ERROR });
        return false;
      }
      onIdChange?.(id);
      update({ ...value, id });
      return true;
    } catch {
      update({ ...value, ready: false, error: ERROR });
      return false;
    }
  }, [onIdChange, scope]);

  return { ready: state.ready, error: state.error, id: state.id,
    legacyIds: state.legacyIds, setId };
}
