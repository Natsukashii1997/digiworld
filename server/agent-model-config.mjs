// Bounded Codex user-default model setting. Construction performs no host access.
import { randomUUID } from 'node:crypto';
import { TextDecoder } from 'node:util';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { createConfigJournal } from './config-journal.mjs';
import { atomicReplaceConfig } from './config-file.mjs';
import { guardCapabilityFilesystem } from './guarded-capability-filesystem.mjs';
import { digest, failure } from './repository.mjs';
import { isSafeModelId, inspectCodexModel, planCodexModel } from './codex-model-document.mjs';

const UUID = /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/;
const HASH = /^[a-f0-9]{64}$/;
const ID = /^[\w-]{1,100}$/;
const validModelId = isSafeModelId;
const exact = (v, keys) => v && typeof v === 'object' && !Array.isArray(v) &&
  Object.keys(v).length === keys.length && keys.every(k => Object.hasOwn(v, k));
const reject = (message, status = 409) => { throw failure(message, status); };
const validGeneration = value => value === 'initial' || UUID.test(value) ||
  Number.isSafeInteger(value) && value >= 0;
const instant = value => typeof value === 'string' &&
  /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(value) && Number.isFinite(Date.parse(value));
const run = promisify(execFile);
// Unlike config-file's general adapter, this narrow slice never needs to set
// com.apple.provenance. Refuse all xattrs so metadata inspection stays read-only.
async function strictNoMetadata(path, options = {}) {
  if (process.platform !== 'darwin') reject('当前系统尚不支持安全模型配置写入', 409);
  const commandOptions = { encoding: 'utf8', timeout: 2000, maxBuffer: 32768,
    env: { ...process.env, LC_ALL: 'C', LANG: 'C' } };
  try {
    const { stdout: permissions } = await run('/bin/ls', ['-lde', path], commandOptions);
    const { stdout: attributes } = await run('/usr/bin/xattr', [path], commandOptions);
    if (!/^-[rwxstST-]{9}([+@]?)\s/.test(permissions) ||
      /^-[rwxstST-]{9}\+/.test(permissions) || /^\s*\d+:/m.test(permissions) ||
      attributes.trim() || Object.hasOwn(options, 'preserve') &&
        options.preserve?.provenance !== null) throw Error('unsupported');
    return { provenance: null };
  } catch { reject('配置含 ACL/扩展属性或无法核验，未写入', 409); }
}

function validPatch(patch) {
  return exact(patch, ['offset', 'before', 'after']) && Number.isSafeInteger(patch.offset) &&
    patch.offset >= 0 && patch.offset <= 256 * 1024 &&
    [patch.before, patch.after].every(value => typeof value === 'string' &&
      Buffer.byteLength(value) <= 1024 && !/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/.test(value));
}
export function validateAgentModelOperation(row) {
  if (!exact(row, ['schema', 'id', 'kind', 'restores', 'targetId', 'targetSignature',
    'homeSignature', 'programSignature', 'generation', 'revision', 'beforeHash',
    'afterHash', 'beforeModel', 'afterModel', 'mode', 'uid', 'gid', 'patch', 'at']) ||
    row.schema !== 1 || !UUID.test(row.id) || !['apply', 'restore'].includes(row.kind) ||
    (row.kind === 'apply' ? row.restores !== null : !UUID.test(row.restores)) ||
    !ID.test(row.targetId) || ![row.targetSignature, row.homeSignature,
      row.programSignature, row.beforeHash, row.afterHash].every(v => typeof v === 'string' && HASH.test(v)) ||
    row.beforeHash === row.afterHash || !validGeneration(row.generation) ||
    !Number.isSafeInteger(row.revision) || row.revision < 0 ||
    !(row.beforeModel === null || validModelId(row.beforeModel)) ||
    !(row.afterModel === null || validModelId(row.afterModel)) ||
    (row.kind === 'apply' && row.afterModel === null) ||
    !Number.isInteger(row.mode) || row.mode < 0 || row.mode > 0o777 ||
    ![row.uid, row.gid].every(v => Number.isSafeInteger(v) && v >= 0 && v <= 0xffffffff) ||
    !validPatch(row.patch) || !instant(row.at)) reject('Codex 模型操作记录无效', 503);
  return row;
}
function validateIdentityReceipt(row) {
  if (!exact(row, ['schema', 'id', 'targetId', 'afterHash', 'afterIdentity', 'at']) ||
    row.schema !== 1 || !UUID.test(row.id) || !ID.test(row.targetId) || !HASH.test(row.afterHash) ||
    typeof row.afterIdentity !== 'string' || row.afterIdentity.length > 1000 || !instant(row.at))
    reject('Codex 模型回读身份记录无效', 503);
  return row;
}
function validateClosed(row) {
  if (!exact(row, ['schema', 'id', 'at']) || row.schema !== 1 ||
    !UUID.test(row.id) || !instant(row.at)) reject('模型封闭记录无效', 503);
  return row;
}

export function createAgentModelConfig(repository, { settings, filesystem, scope, configAt,
  checkMetadata = strictNoMetadata, clock = Date.now }) {
  const journal = createConfigJournal(repository.directory, {
    filesystem, folder: 'agent-model-operations', validate: validateAgentModelOperation,
    label: 'Codex 默认模型',
  });
  const receipts = createConfigJournal(repository.directory, {
    filesystem, folder: 'agent-model-identities', validate: validateIdentityReceipt,
    label: 'Codex 模型身份回执',
  });
  const closed = createConfigJournal(repository.directory, {
    filesystem, folder: 'agent-model-closed', validate: validateClosed,
    label: 'Codex 模型封闭编号',
  });
  const previews = new Map();
  const at = () => new Date(clock()).toISOString();
  async function target(state, targetId, expected) {
    const place = await scope(state, targetId, expected);
    if (place.target.agentId !== 'codex') reject('首版仅支持 Codex CLI 默认模型', 409);
    const source = await configAt(place);
    await scope(state, targetId, place);
    return { place, source };
  }
  async function gate(generation) {
    const live = await settings.assertEnabled('agent');
    if (!live.enabled || live.generation !== generation) reject('Agent 写入授权已变化，请重新预览', 409);
  }
  function remember(plan, state, generation) {
    for (const [id, row] of previews) if (row.expires <= clock()) previews.delete(id);
    if (previews.size >= 20) reject('Codex 模型预览过多，请等待过期', 409);
    const token = randomUUID(), expires = clock() + 300000;
    previews.set(token, { ...plan, expires, generation, revision: state.revision });
    return { token, operationId: token, revision: state.revision, kind: plan.kind,
      targetId: plan.place.target.id, label: plan.place.target.label,
      beforeModel: plan.beforeModel, afterModel: plan.afterModel,
      beforeHash: plan.beforeHash, afterHash: plan.afterHash,
      expiresAt: new Date(expires).toISOString(),
      canConfirm: plan.enabled,
      scope: '仅 Codex 用户级默认模型；项目配置、profile 和启动参数可覆盖',
      adoption: 'unverified',
      notice: '只修改未来新会话的用户默认配置；模型 ID 可用性和实际运行采用仍未验证。' };
  }
  function summary(row) {
    return { operationId: row.id, kind: row.kind, targetId: row.targetId,
      beforeModel: row.beforeModel, afterModel: row.afterModel, at: row.at,
      completedAt: row.completedAt || null, adoption: 'unverified' };
  }
  const closedResult = id => ({ operationId: id, status: 'not_started', closed: true,
    adoption: 'unverified', reason: '原编号已持久封闭，迟到的确认请求不会执行' });
  async function checkRow(row, state) {
    try {
      const { source } = await target(state, row.targetId, row);
      const receipt = await receipts.get(row.id);
      const intact = receipt && receipt.targetId === row.targetId && receipt.afterHash === row.afterHash;
      const status = intact && source.file.hash === row.afterHash &&
        source.file.identity === receipt.afterIdentity && source.file.mode === row.mode &&
        source.file.uid === row.uid && source.file.gid === row.gid ? 'verified' :
        receipt ? 'changed' : 'unknown';
      return { ...summary(row), status,
        reason: status === 'verified' ? '用户默认配置与本次写后身份一致；目标新会话采用未验证' :
          status === 'unknown' ? '操作记录存在，但写后身份回执缺失；不得重试同一写入' :
            '目标配置或文件身份已变动；不能按旧操作恢复' };
    } catch {
      return { operationId: row.id, status: 'unknown', adoption: 'unverified',
        reason: '目标绑定、来源或记录无法核验；未重放写入' };
    }
  }
  async function ensureNoUnknown(state, place) {
    for (const row of await journal.list()) {
      if (row.targetId !== place.target.id) continue;
      const sameBinding = ['targetSignature', 'homeSignature', 'programSignature']
        .every(k => row[k] === place[k]);
      // A new client binding key must not hide an old prepared write. A
      // persisted identity receipt proves a completed old write; otherwise
      // preserve the unknown barrier even after rebinding the same target ID.
      if (sameBinding ? (await checkRow(row, state)).status === 'unknown' :
        !(await receipts.get(row.id)))
        reject(`此前模型操作 ${row.id} 的结果未知；先查询原编号，不能开启新写入`, 409);
    }
  }
  function reverse(original, source) {
    if (source.file.hash !== original.afterHash) reject('配置已变化，不能恢复原模型操作');
    const p = original.patch, current = source.file.bytes;
    const after = Buffer.from(p.after), before = Buffer.from(p.before);
    if (!current.subarray(p.offset, p.offset + after.length).equals(after))
      reject('原操作差异已变化，不能恢复');
    const priorBytes = Buffer.concat([current.subarray(0, p.offset), before,
      current.subarray(p.offset + after.length)]);
    if (digest(priorBytes) !== original.beforeHash) reject('原配置校验失败，不能恢复');
    let priorText;
    try { priorText = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(priorBytes); }
    catch { reject('原配置编码不支持恢复'); }
    const proof = planCodexModel(priorText, original.afterModel);
    if (proof.text !== source.text || JSON.stringify(proof.patch) !== JSON.stringify(p))
      reject('原操作不属于安全的顶层模型变更，不能恢复');
    return { text: priorText, patch: { offset: p.offset, before: p.after, after: p.before },
      beforeModel: original.afterModel, afterModel: original.beforeModel,
      afterHash: original.beforeHash };
  }
  async function confirm(input, kind) {
    if (!exact(input, ['token', 'revision']) || typeof input.token !== 'string' || !UUID.test(input.token) ||
      !Number.isSafeInteger(input.revision) || input.revision < 0)
      reject('Codex 模型确认请求无效', 400);
    return repository.withSnapshot({}, async state => {
      if (await closed.get(input.token)) {
        previews.delete(input.token);
        return closedResult(input.token);
      }
      const existing = await journal.get(input.token);
      if (existing) return checkRow(existing, state);
      const p = previews.get(input.token);
      if (!p || p.kind !== kind || p.expires <= clock() || input.revision !== p.revision ||
        state.revision !== p.revision) throw Object.assign(failure('预览已过期或主库已变化，请重新预览', 409), { operationNotStarted: true });
      let row, source, change;
      const guard = async () => {
        await gate(p.generation);
        if (p.expires <= clock() || state.revision !== p.revision) reject('模型预览或主库版本已变化');
        await scope(state, p.place.target.id, p.place);
        await gate(p.generation);
      };
      try {
        await guard();
        ({ source } = await target(state, p.place.target.id, p.place));
        await checkMetadata(source.path);
        await ensureNoUnknown(state, p.place);
        if (source.file.hash !== p.beforeHash || source.file.identity !== p.beforeIdentity ||
          source.file.mode !== p.mode || source.file.uid !== p.uid || source.file.gid !== p.gid)
          reject('配置文件已变化，请重新预览');
        change = kind === 'apply' ? planCodexModel(source.text, p.afterModel) :
          reverse(await journal.get(p.restores), source);
        if (change.afterHash && change.afterHash !== p.afterHash ||
          digest(Buffer.from(change.text)) !== p.afterHash ||
          JSON.stringify(change.patch) !== JSON.stringify(p.patch))
          reject('Codex 模型差异已变化，请重新预览');
        row = { schema: 1, id: input.token, kind, restores: p.restores || null,
          targetId: p.place.target.id, targetSignature: p.place.targetSignature,
          homeSignature: p.place.homeSignature, programSignature: p.place.programSignature,
          generation: p.generation, revision: p.revision,
          beforeHash: p.beforeHash, afterHash: p.afterHash,
          beforeModel: p.beforeModel, afterModel: p.afterModel,
          mode: source.file.mode, uid: source.file.uid, gid: source.file.gid,
          patch: change.patch, at: at() };
        await journal.prepare(row, { guard });
      } catch (error) {
        let persisted;
        try { persisted = await journal.get(input.token); }
        catch {
          throw Object.assign(failure('模型记录无法回读；只查询原编号', 503),
            { unknownResult: true });
        }
        if (!persisted)
          throw Object.assign(failure(error?.status ? error.message : '模型执行前校验失败',
            error?.status || 503), { operationNotStarted: true });
        throw Object.assign(failure('模型操作是否开始无法确认；只查询原编号', 503),
          { unknownResult: true });
      }
      previews.delete(input.token);
      try {
        const result = await atomicReplaceConfig(source.path, source.file,
          Buffer.from(change.text),
          { filesystem: guardCapabilityFilesystem(filesystem, guard), verifyScope: guard,
            ...(checkMetadata ? { checkMetadata } : {}) });
        await receipts.prepare({ schema: 1, id: row.id, targetId: row.targetId,
          afterHash: row.afterHash, afterIdentity: result.identity, at: at() }, { guard });
        await journal.complete(row.id, at(), { guard });
        return { ...await checkRow(await journal.get(row.id), state), newlyStarted: true };
      } catch {
        return { ...await checkRow(row, state), newlyStarted: true,
          notice: '执行或回读未确认；仅按原操作编号查询，不重新提交' };
      }
    });
  }
  const api = {
    async inspect(input) {
      if (!exact(input, ['targetId']) || typeof input.targetId !== 'string' || !ID.test(input.targetId))
        reject('Codex 模型目标无效', 400);
      return repository.withSnapshot({}, async state => {
        const { place, source } = await target(state, input.targetId);
        const found = inspectCodexModel(source.text);
        return { targetId: input.targetId, label: place.target.label,
          revision: state.revision, model: found.model, provider: found.provider,
          sha256: source.file.hash, adoption: 'unverified',
          scope: 'Codex 用户默认配置；新会话实际模型未验证' };
      });
    },
    async preview(input) {
      if (!exact(input, ['targetId', 'modelId', 'revision']) || !ID.test(input.targetId) ||
        !validModelId(input.modelId) || !Number.isSafeInteger(input.revision) || input.revision < 0)
        reject('Codex 模型预览参数无效', 400);
      return repository.withSnapshot({ expectedRevision: input.revision }, async state => {
        const { place, source } = await target(state, input.targetId);
        await checkMetadata(source.path);
        await ensureNoUnknown(state, place);
        const change = planCodexModel(source.text, input.modelId), g = await settings.get('agent');
        if (!change.changed) reject('当前默认模型已是此值，请选择其他模型 ID', 409);
        return remember({ kind: 'apply', place, beforeModel: change.beforeModel,
          afterModel: change.afterModel, beforeHash: source.file.hash,
          afterHash: digest(Buffer.from(change.text)), beforeIdentity: source.file.identity,
          mode: source.file.mode, uid: source.file.uid, gid: source.file.gid,
          patch: change.patch, restores: null, enabled: g.enabled }, state, g.generation);
      });
    },
    apply: input => confirm(input, 'apply'),
    rollback: input => confirm(input, 'restore'),
    async check(input) {
      if (!exact(input, ['id']) || !UUID.test(input.id)) reject('模型操作编号无效', 400);
      return repository.withSnapshot({}, async state => {
        const row = await journal.get(input.id);
        if (row) return checkRow(row, state);
        if (await closed.get(input.id)) return closedResult(input.id);
        // The same repository queue serializes this with confirm. If check
        // wins, this durable one-shot tombstone rejects any delayed confirm;
        // if confirm wins, its prepared row is visible above. No Home I/O.
        await closed.prepare({ schema: 1, id: input.id, at: at() });
        previews.delete(input.id);
        return closedResult(input.id);
      });
    },
    async history(input) {
      if (!exact(input, ['targetId']) || !ID.test(input.targetId)) reject('模型历史目标无效', 400);
      return repository.withSnapshot({}, async state => {
        const place = await scope(state, input.targetId);
        if (place.target.agentId !== 'codex') reject('首版仅支持 Codex CLI 默认模型', 409);
        const rows = (await journal.list()).filter(row => row.targetId === input.targetId &&
          ['targetSignature', 'homeSignature', 'programSignature'].every(k => row[k] === place[k]));
        return { items: rows.map(row => ({ ...summary(row), status: 'unchecked' })) };
      });
    },
    async rollbackPreview(input) {
      if (!exact(input, ['id', 'revision']) || !UUID.test(input.id) ||
        !Number.isSafeInteger(input.revision) || input.revision < 0)
        reject('模型恢复预览参数无效', 400);
      return repository.withSnapshot({ expectedRevision: input.revision }, async state => {
        const original = await journal.get(input.id);
        if (!original || original.kind !== 'apply') reject('仅支持恢复原始模型设置操作');
        const checked = await checkRow(original, state);
        if (checked.status !== 'verified') reject('原模型操作写后文件或身份不一致，不能恢复');
        const { place, source } = await target(state, original.targetId, original);
        await checkMetadata(source.path);
        await ensureNoUnknown(state, place);
        const change = reverse(original, source), g = await settings.get('agent');
        return remember({ kind: 'restore', place, beforeModel: change.beforeModel,
          afterModel: change.afterModel, beforeHash: source.file.hash,
          afterHash: change.afterHash, beforeIdentity: source.file.identity,
          mode: source.file.mode, uid: source.file.uid, gid: source.file.gid,
          patch: change.patch, restores: original.id, enabled: g.enabled }, state, g.generation);
      });
    },
  };
  return api;
}
