export const LEGACY_KNOWLEDGE_CLIP_PREFIX = 'workbench:knowledge-clip:pending:v1:';
const PREFIX = 'workbench:knowledge-clip:pending:v2:';
const UUID = /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/;
const SHA = /^[a-f0-9]{64}$/;

export function knowledgeClipScopePrefix(identity) {
  if (!SHA.test(identity || '')) throw Error('本机数据目录身份无法核验');
  return PREFIX + identity + ':';
}

export function legacyKnowledgeClipPending(storage) {
  const ids = [];
  for (let i = 0; i < storage.length; i++) {
    const key = storage.key(i);
    if (!key?.startsWith(LEGACY_KNOWLEDGE_CLIP_PREFIX)) continue;
    const id = key.slice(LEGACY_KNOWLEDGE_CLIP_PREFIX.length);
    if (!UUID.test(id) || storage.getItem(key) !== id) throw Error('旧待查编号无效');
    ids.push(id);
  }
  return ids.sort();
}

export function readKnowledgeClipPending(storage, identity) {
  const prefix = knowledgeClipScopePrefix(identity), ids = [];
  for (let i = 0; i < storage.length; i++) {
    const key = storage.key(i);
    if (!key?.startsWith(prefix)) continue;
    const id = key.slice(prefix.length);
    if (!UUID.test(id) || storage.getItem(key) !== id)
      throw Error('待查编号无效');
    ids.push(id);
  }
  return ids.sort();
}

export function persistKnowledgeClipPending(storage, id, identity) {
  if (!UUID.test(id)) return false;
  const key = knowledgeClipScopePrefix(identity) + id;
  storage.setItem(key, id);
  return storage.getItem(key) === id;
}

export function clearKnowledgeClipPending(storage, id, identity) {
  if (!UUID.test(id)) return false;
  const key = knowledgeClipScopePrefix(identity) + id;
  const current = storage.getItem(key);
  if (current === null) return true;
  if (current !== id) return false;
  storage.removeItem(key);
  return storage.getItem(key) === null;
}
