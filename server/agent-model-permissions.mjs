// Candidate T04: a separate, default-off authorization for Codex model config.
// Construction does no host I/O. Only the internal agent slot is exposed.
import fs from 'node:fs/promises';
import { createCapabilitySettings } from './capability-settings.mjs';
import { createConfigJournal } from './config-journal.mjs';
import { failure } from './repository.mjs';

const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
const exact = (value, keys) => value && typeof value === 'object' &&
  !Array.isArray(value) && Object.keys(value).length === keys.length &&
  keys.every(key => Object.hasOwn(value, key));
const instant = value => typeof value === 'string' &&
  /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(value) &&
  Number.isFinite(Date.parse(value));
const reject = (message, status = 400) => { throw failure(message, status); };

export function validateAgentModelPermissionClosure(row) {
  if (!exact(row, ['schema', 'id', 'at']) || row.schema !== 1 ||
    !UUID.test(row.id) || !instant(row.at))
    reject('模型授权封闭记录无效；请保留原编号', 503);
  return row;
}

export function createAgentModelPermissions(repository, {
  filesystem = fs, clock = Date.now,
} = {}) {
  const settings = createCapabilitySettings(repository, {
    filesystem, clock, journalFolder: 'agent-model-permissions',
  });
  const closed = createConfigJournal(repository.directory, {
    filesystem, folder: 'agent-model-permission-closed',
    validate: validateAgentModelPermissionClosure, label: '模型授权封闭编号',
  });
  let queue = Promise.resolve();
  function serial(operation) {
    const current = queue.then(operation, operation);
    queue = current.catch(() => {});
    return current;
  }
  const closedResult = operationId => ({ operationId, status: 'not_started',
    closed: true, reason: '原授权编号已持久封闭，迟到的确认不会执行' });
  function slot(capability) {
    if (capability !== 'agent') reject('模型配置仅支持内部授权槽', 400);
  }
  return {
    // These two methods are consumed only by createAgentModelConfig. The
    // service must not receive the legacy Agent write settings instance.
    get(capability) { slot(capability); return settings.get('agent'); },
    assertEnabled(capability) { slot(capability); return settings.assertEnabled('agent'); },
    async status() {
      const value = await settings.read();
      return { enabled: value.enabled.agent, generation: value.generation,
        reauthorizationRequired: value.reauthorizationRequired };
    },
    async preview(input) {
      if (!exact(input, ['enabled']) || typeof input.enabled !== 'boolean')
        reject('模型配置授权预览参数无效');
      const value = await settings.preview({ capability: 'agent',
        enabled: input.enabled, options: {} });
      return { token: value.token, operationId: value.operationId,
        enabled: value.after.enabled.agent, beforeEnabled: value.before.enabled.agent,
        expiresAt: value.expiresAt,
        scope: '仅授权 Codex 用户默认模型配置写入；与 Agent 内容写入授权分离' };
    },
    apply(input) {
      if (!exact(input, ['token', 'operationId', 'confirmed']) ||
        typeof input.token !== 'string' || !UUID.test(input.operationId) ||
        input.confirmed !== true) reject('模型配置授权确认参数无效');
      return serial(async () => {
        if (await closed.get(input.operationId)) return closedResult(input.operationId);
        const value = await settings.apply(input);
        return { operationId: value.operationId, status: value.status };
      });
    },
    check(input) {
      if (!exact(input, ['operationId']) || !UUID.test(input.operationId))
        reject('模型授权操作编号无效');
      return serial(async () => {
        const id = input.operationId;
        if (await closed.get(id)) return closedResult(id);
        const value = await settings.check(id);
        if (value.status !== 'not_started') return value;
        try {
          await closed.prepare({ schema: 1, id, at: new Date(clock()).toISOString() });
          if (!await closed.get(id)) reject('授权封闭回读失败', 503);
        } catch {
          // A failed or ambiguous closure never certifies non-execution.
          reject('模型授权结果仍未知；保留原编号再次核对', 503);
        }
        return closedResult(id);
      });
    },
  };
}
