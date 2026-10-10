import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { startServer } from '../server/http.mjs';
import { seed } from '../src/store.js';

test('v2 HTTP defaults to a read-only planning status; stop needs an active v2 run', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'guiji-night-v2-http-'));
  let app;
  try {
    app = await startServer({ directory, port: 0, staticRoot: join(import.meta.dirname, '../dist') });
    await app.repository.write(seed(), { initialize: true });
    assert.notEqual(new URL(app.url).port, '5178');

    const unauthenticated = await fetch(`${app.url}/api/night-v2/status`);
    assert.equal(unauthenticated.status, 403);
    const session = await fetch(`${app.url}/api/session`, { headers: { 'X-Workbench-Client': '1' } });
    assert.equal(session.status, 200);
    const { token } = await session.json();
    const headers = { 'X-Workbench-Token': token };
    const status = await fetch(`${app.url}/api/night-v2/status`, { headers });
    assert.equal(status.status, 200);
    const receipt = await status.json();
    assert.equal(receipt.schema, 'night-v2-status');
    assert.equal(receipt.status, 'planning');
    assert.equal(receipt.runId, null);

    const stop = await fetch(`${app.url}/api/night-v2/stop`, {
      method: 'POST', headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({ runId: 'synthetic-missing' }),
    });
    assert.notEqual(stop.status, 200);
    const after = await fetch(`${app.url}/api/night-v2/status`, { headers });
    assert.equal((await after.json()).status, 'planning');

    const morningUnauth = await fetch(`${app.url}/api/night-v2/morning-reports`);
    assert.equal(morningUnauth.status, 403);
    const morning = await fetch(`${app.url}/api/night-v2/morning-reports`, { headers });
    assert.equal(morning.status, 200);
    assert.deepEqual(await morning.json(), { schema: 'night-v2-morning-list', items: [], decisions: [] });
    const missingRun = await fetch(`${app.url}/api/night-v2/morning/reconcile`, {
      method: 'POST', headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({ runId: 'synthetic-missing' }),
    });
    assert.notEqual(missingRun.status, 200);
  } finally {
    await app?.close();
    await rm(directory, { recursive: true, force: true });
  }
});
