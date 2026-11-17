import test from 'node:test';
import assert from 'node:assert/strict';
import { createKeychainAdapter } from '../server/keychain-adapter.mjs';

for (const exists of [undefined, null, 0, 'false', {}, []]) test(`安全审计：钥匙串 has 的非布尔响应 ${JSON.stringify(exists)} 不能当作不存在`, async () => {
  const calls = [];
  const adapter = createKeychainAdapter({ runHelper: async payload => {
    calls.push(payload.action);
    return { ok: true, ...(exists === undefined ? {} : { exists }) };
  } });
  await assert.rejects(adapter.createBackup('anthropic', '00000000-0000-4000-8000-000000000001'),
    error => error.code === 'KEYCHAIN_UNAVAILABLE' && error.reasonCode === 'HELPER_READBACK');
  assert.deepEqual(calls, ['has'], '无法确认存在性时，不得继续读取或改写凭据');
});

for (const exists of [false, true]) test(`安全审计：钥匙串 has 合法布尔值 ${exists} 保持原行为`, async () => {
  const adapter = createKeychainAdapter({ runHelper: async () => ({ ok: true, exists }) });
  assert.equal(await adapter.has('openai/main'), exists);
});
