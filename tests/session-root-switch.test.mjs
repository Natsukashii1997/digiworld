import test from 'node:test';
import assert from 'node:assert/strict';

const rootA = 'a'.repeat(64), rootB = 'b'.repeat(64);
const sessionResponse = (token, dataRootIdentity) =>
  new Response(JSON.stringify({ token, dataRootIdentity }), { status: 200 });

test('a 403 session refresh on a different data root never retries the original POST', async () => {
  const originalFetch = globalThis.fetch;
  const calls = [];
  try {
    let sessions = 0;
    globalThis.fetch = async (url, options = {}) => {
      calls.push({ url, method: options.method || 'GET', token: options.headers?.['X-Workbench-Token'] });
      if (url === '/api/session')
        return sessionResponse(++sessions === 1 ? 'token-a' : 'token-b',
          sessions === 1 ? rootA : rootB);
      if (url === '/api/synthetic')
        return new Response(JSON.stringify({ error: 'session expired' }), { status: 403 });
      throw Error('unexpected URL');
    };
    const { request } = await import(`../src/api.js?root-switch=${Date.now()}`);
    await assert.rejects(request('/synthetic', { marker: 'one' }, 'POST'), /刷新工作台/);
    assert.deepEqual(calls.map(call => [call.url, call.method]), [
      ['/api/session', 'GET'], ['/api/synthetic', 'POST'], ['/api/session', 'GET'],
    ]);
    assert.equal(calls.filter(call => call.url === '/api/synthetic').length, 1);
    assert.equal(calls[1].token, 'token-a');
    await assert.rejects(request('/synthetic', { marker: 'two' }, 'POST'), /刷新工作台/);
    assert.equal(calls.filter(call => call.url === '/api/synthetic').length, 1);
  } finally { globalThis.fetch = originalFetch; }
});

test('legacy session without identity remains readable but a new root identity requires reload', async () => {
  const originalFetch = globalThis.fetch;
  try {
    let sessions = 0, writes = 0;
    globalThis.fetch = async (url) => {
      if (url === '/api/session') return sessionResponse(`token-${++sessions}`,
        sessions === 1 ? undefined : rootA);
      if (url === '/api/legacy') {
        writes++;
        return new Response(writes === 1 ? '{}' : '{}', { status: writes === 1 ? 403 : 200 });
      }
      throw Error('unexpected URL');
    };
    const { request, session } = await import(`../src/api.js?legacy-root=${Date.now()}`);
    assert.equal((await session()).dataRootIdentity, null);
    await assert.rejects(request('/legacy'), /刷新工作台/);
    assert.equal(writes, 1);
  } finally { globalThis.fetch = originalFetch; }
});
