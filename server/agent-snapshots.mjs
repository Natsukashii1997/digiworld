import { createConfigJournal } from './config-journal.mjs';
import { digest, failure } from './repository.mjs';

const UUID = /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/;
const HASH = /^[a-f0-9]{64}$/;
const KEYS = {
  codex: ['tui.animations', 'tui.show_tooltips'],
  hermes: ['display.bell_on_complete', 'display.show_reasoning'],
};
const exact = (v, keys) => v && typeof v === 'object' && !Array.isArray(v) &&
  Object.keys(v).length === keys.length && keys.every(k => Object.hasOwn(v, k));
export const snapshotBindingIdentity = place => digest(JSON.stringify([place.targetSignature, place.homeSignature, place.programSignature]));
export const snapshotSourceIdentity = (place, file) => digest(JSON.stringify([place.targetSignature, place.homeSignature, place.programSignature, file.identity]));
const bad = () => failure('白名单快照记录无效；请保留原记录，不继续保存', 503);
const validInput = input => exact(input, ['targetId', 'revision', 'sourceSha256', 'sourceIdentity', 'operationId']) &&
  typeof input.targetId === 'string' && /^[-\w]{1,100}$/.test(input.targetId) &&
  Number.isSafeInteger(input.revision) && input.revision >= 0 &&
  typeof input.sourceSha256 === 'string' && HASH.test(input.sourceSha256) &&
  typeof input.sourceIdentity === 'string' && HASH.test(input.sourceIdentity) &&
  typeof input.operationId === 'string' && UUID.test(input.operationId);
const validResolveInput = input => exact(input, ['targetId', 'operationId']) &&
  typeof input.targetId === 'string' && /^[-\w]{1,100}$/.test(input.targetId) &&
  typeof input.operationId === 'string' && UUID.test(input.operationId);
const sameInput = (row, input) => row.id === input.operationId && row.targetId === input.targetId &&
  row.revision === input.revision && row.sourceSha256 === input.sourceSha256 && row.sourceIdentity === input.sourceIdentity;

export function validateAgentSnapshot(row) {
  if (!exact(row, ['schema', 'id', 'targetId', 'agentId', 'revision', 'sourceSha256',
    'targetSignature', 'homeSignature', 'programSignature', 'sourceIdentity', 'at', 'fields']) ||
    row.schema !== 1 || !UUID.test(row.id) || !/^[-\w]{1,100}$/.test(row.targetId) ||
    !KEYS[row.agentId] || !Number.isSafeInteger(row.revision) || row.revision < 0 ||
    ![row.sourceSha256, row.targetSignature, row.homeSignature, row.programSignature, row.sourceIdentity].every(v => typeof v === 'string' && HASH.test(v)) ||
    typeof row.at !== 'string' || !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(row.at) || !Number.isFinite(Date.parse(row.at)) ||
    !Array.isArray(row.fields) || row.fields.length !== KEYS[row.agentId].length) throw bad();
  row.fields.forEach((field, i) => {
    if (!exact(field, ['key', 'status', 'value']) || field.key !== KEYS[row.agentId][i] ||
      !['configured', 'unset', 'unsupported'].includes(field.status) ||
      (field.status === 'configured' ? typeof field.value !== 'boolean' : field.value !== null)) throw bad();
  });
  return row;
}

// A durable UUID tombstone. It contains only the request identity, never config
// text or a prior binding's display values. A delayed save must check it first.
export function validateSnapshotClosure(row) {
  if (!exact(row, ['schema', 'id', 'targetId', 'at']) ||
    row.schema !== 1 || !UUID.test(row.id) || !/^[-\w]{1,100}$/.test(row.targetId) ||
    typeof row.at !== 'string' || !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(row.at) ||
    !Number.isFinite(Date.parse(row.at))) throw bad();
  return row;
}

// Immutable local records. The atomic record itself is the snapshot; there is
// no host write to replay and no authority to restore or migrate this history.
export function createAgentSnapshots(repository, { filesystem, scope, configAt, inspect, clock = Date.now }) {
  const journal = createConfigJournal(repository.directory, {
    filesystem, folder: 'agent-config-snapshots', validate: validateAgentSnapshot, label: '白名单快照',
  });
  const closures = createConfigJournal(repository.directory, {
    filesystem, folder: 'agent-config-snapshot-closures', validate: validateSnapshotClosure, label: '快照封闭编号',
  });
  const publicRow = row => ({ schema: 1, id: row.id, targetId: row.targetId,
    agentId: row.agentId, revision: row.revision, sha256: row.sourceSha256,
    fields: row.fields, at: row.at, status: 'saved', adoption: 'unverified' });
  async function bound(state, row) {
    await scope(state, row.targetId, row);
    return publicRow(row);
  }
  return {
    async save(input) {
      if (!validInput(input)) throw Object.assign(failure('快照保存请求无效', 400), {operationNotStarted:true});
      let definitelyNotStarted = false;
      try { return await repository.withSnapshot({}, async state => {
        // The same repository queue serializes resolve and save. A resolve that
        // wins the queue permanently excludes this UUID from later writes.
        if (await closures.get(input.operationId)) throw Object.assign(failure('该快照编号已封闭，原操作未保存；请重新读取后使用新编号', 409), {operationNotStarted:true});
        const existing = await journal.get(input.operationId);
        if (existing) {
          if (!sameInput(existing, input))
            throw failure('该编号属于另一份快照，请查询原记录', 409);
          return bound(state, existing);
        }
        definitelyNotStarted = true;
        if (state.revision !== input.revision) throw failure('主库已变化，请重新读取快照', 409);
        const place = await scope(state, input.targetId), source = await configAt(place);
        if (snapshotSourceIdentity(place, source.file) !== input.sourceIdentity) throw failure('源配置或目标身份已变化，请重新读取快照', 409);
        if (source.file.hash !== input.sourceSha256) throw failure('源配置已变化，请重新读取快照', 409);
        const row = { schema: 1, id: input.operationId, targetId: input.targetId, agentId: place.target.agentId,
          revision: state.revision, sourceSha256: source.file.hash, sourceIdentity: input.sourceIdentity, targetSignature: place.targetSignature,
          homeSignature: place.homeSignature, programSignature: place.programSignature, at: new Date(clock()).toISOString(),
          fields: inspect(place.target.agentId, source.text).fields.map(({ key, status, value }) => ({ key, status, value })) };
        const guard = async () => {
          await scope(state, input.targetId, place);
          const current = await configAt(place);
          if (current.file.hash !== source.file.hash || current.file.identity !== source.file.identity)
            throw failure('保存期间源配置已变化，请查询原快照编号', 409);
        };
        await guard();
        try {
          definitelyNotStarted = false;
          await journal.prepare(row, { guard });
          const stored = await journal.get(row.id);
          if (!stored) throw bad();
          return await bound(state, stored);
        } catch {
          throw failure('快照保存结果未确认；请查询原编号，不要重复保存', 503);
        }
      }); } catch (error) {
        if (definitelyNotStarted) error.operationNotStarted = true;
        throw error;
      }
    },
    async resolve(input) {
      if (!validResolveInput(input)) throw failure('快照结果核对请求无效', 400);
      return repository.withSnapshot({}, async state => {
        const row = await journal.get(input.operationId);
        const closed = await closures.get(input.operationId);
        if (row && closed) throw bad();
        if (row) {
          if (row.targetId !== input.targetId) throw failure('该编号不属于当前目标', 409);
          const target = state.connections?.agentTargets?.find(item => item.id === row.targetId);
          if (!target || target.agentId !== row.agentId || target.program?.kind !== 'CLI')
            return { status: 'binding_changed', operationId: row.id };
          const place = await scope(state, row.targetId);
          if (['targetSignature', 'homeSignature', 'programSignature'].some(key => place[key] !== row[key]))
            return { status: 'binding_changed', operationId: row.id };
          return { status: 'saved', operationId: row.id, snapshot: publicRow(row) };
        }
        if (closed) {
          if (closed.targetId !== input.targetId) throw failure('该编号不属于当前目标', 409);
          return { status: 'not_saved', operationId: input.operationId };
        }
        const closure = { schema: 1, id: input.operationId, targetId: input.targetId,
          at: new Date(clock()).toISOString() };
        try {
          await closures.prepare(closure);
          if (!await closures.get(closure.id)) throw bad();
        } catch {
          // A failed/ambiguous durable write cannot certify non-execution.
          throw failure('快照结果仍未知；请保留原编号并再次核对', 503);
        }
        return { status: 'not_saved', operationId: input.operationId };
      });
    },
    async read(input) {
      if (!exact(input, ['id']) || typeof input.id !== 'string' || !UUID.test(input.id)) throw failure('快照编号无效', 400);
      const row = await journal.get(input.id);
      if (!row) throw failure('未找到此快照；尚不能确认已保存', 404);
      return bound(await repository.read(), row);
    },
    async history(input) {
      if (!exact(input, ['targetId']) || typeof input.targetId !== 'string') throw failure('快照目标无效', 400);
      const place = await scope(await repository.read(), input.targetId);
      const items = (await journal.list()).filter(row => row.targetId === input.targetId &&
        ['targetSignature', 'homeSignature', 'programSignature'].every(k => row[k] === place[k]));
      return { items: items.map(row => ({ id: row.id, at: row.at, sha256: row.sourceSha256, revision: row.revision })),
        scope: '仅当前绑定身份的本机白名单历史；不代表当前配置或运行采用' };
    },
  };
}
