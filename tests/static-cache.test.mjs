import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

test('首页不落盘（no-store），带哈希的静态资源仍按 no-cache 回源校验', async () => {
  const root = await mkdtemp(join(tmpdir(), 'guiji-static-'));
  await mkdir(join(root, 'assets'));
  await writeFile(join(root, 'index.html'), '<!doctype html><script type="module" src="/assets/index-abc.js"></script>');
  await writeFile(join(root, 'assets/index-abc.js'), 'export {};');
  process.env.WORKBENCH_TEST_STATIC_ROOT = root;
  const { fixture } = await import('./fixture.mjs');
  const app = await fixture();
  try {
    const page = await fetch(app.url + '/');
    assert.equal(page.status, 200);
    assert.equal(page.headers.get('cache-control'), 'no-store');
    const asset = await fetch(app.url + '/assets/index-abc.js');
    assert.equal(asset.status, 200);
    assert.equal(asset.headers.get('cache-control'), 'no-cache');
  } finally {
    await app.close();
    await rm(root, { recursive: true, force: true });
  }
});
