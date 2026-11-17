import test from 'node:test';
import assert from 'node:assert/strict';
import { createGetClient } from '../server/collection/get-client.mjs';

const key = 'SYNTHETIC_GET_PRIVATE_KEY_123456';
for (const field of ['content', 'title', 'extra', 'property-name']) test(`安全审计：GET 在 ${field} 回显当前 Key 时不能返回或持久化正文`, async () => {
  const note = { note_id: 'note-123', title: '合成正常标题', content: '合成正常正文' };
  const payload = { success: true, data: { note } };
  if (field === 'extra') payload.extra = { nested: [key] };
  else if (field === 'property-name') payload[key] = 'not-a-secret-value';
  else note[field] = `before ${key} after`;
  const session = await createGetClient({
    readCredentials: async () => ({ clientId: 'cli_fixture', key }),
    fetchImpl: async () => new Response(JSON.stringify(payload)),
  }).session();
  await assert.rejects(session.detail('note-123'), error => {
    assert.equal(error.kind, 'unknown');
    assert.ok(!error.message.includes(key));
    return true;
  });
});

test('安全审计：GET 正常正文保持原样，固定官方地址且禁止重定向', async () => {
  const content = '# 合成正文\n\n完整保留。';
  const session = await createGetClient({
    readCredentials: async () => ({ clientId: 'cli_fixture', key }),
    fetchImpl: async (url, options) => {
      assert.ok(url.startsWith('https://openapi.biji.com/open/api/v1/'));
      assert.equal(options.redirect, 'error');
      return new Response(JSON.stringify({ success: true, data: { note: { note_id: 'note-123', title: '标题', content } } }));
    },
  }).session();
  assert.equal((await session.detail('note-123')).content, content);
});

for (const escapedKey of ['SYNTHETIC_"QUOTED_KEY_123', 'SYNTHETIC_\\ESCAPED_KEY_123']) test('安全审计：GET 拒绝 JSON 转义后的完整凭据回显', async () => {
  const session = await createGetClient({
    readCredentials: async () => ({ clientId: 'cli_fixture', key: escapedKey }),
    fetchImpl: async () => new Response(JSON.stringify({ success: true, data: { note: {
      note_id: 'note-123', title: '标题', content: escapedKey,
    } } })),
  }).session();
  await assert.rejects(session.detail('note-123'), error => error.kind === 'unknown' && !error.message.includes(escapedKey));
});
