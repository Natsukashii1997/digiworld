import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, link, readFile, rm, stat, realpath, symlink, readdir, rename } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { createReverseNative } from '../server/reverse-native.mjs';
import { openRepository } from '../server/repository.mjs';

for (const target of ['native', 'writer-lock']) test(`安全审计：${target} SQLite 初始化拒绝硬链接且不改原库`, async () => {
  const folder = await realpath(await mkdtemp(join(tmpdir(), 'digiworld-sqlite-security-')));
  const directory = join(folder, 'data');
  const parent = target === 'native' ? join(directory, 'reverse-evidence/native') : directory;
  await mkdir(parent, { recursive: true });
  const outside = join(folder, 'other.sqlite');
  const db = new DatabaseSync(outside);
  db.exec("CREATE TABLE sentinel(value TEXT); INSERT INTO sentinel VALUES ('synthetic')");
  db.close();
  const before = await readFile(outside), mode = (await stat(outside)).mode;
  await link(outside, join(parent, target === 'native' ? 'sessions.sqlite' : '.writer-lock.sqlite'));
  let service;
  try {
    await assert.rejects(async () => {
      service = target === 'native'
        ? await createReverseNative({ repository: { directory }, connect: async () => { throw Error('测试禁止原生连接'); } })
        : await openRepository(directory);
    }, /硬链接|普通文件/);
    assert.deepEqual(await readFile(outside), before);
    assert.equal((await stat(outside)).mode, mode);
  } finally {
    await service?.close();
    await rm(folder, { recursive: true, force: true });
  }
});

for (const when of ['before-open', 'after-open']) test(`安全审计：snapshots ${when} 链接绕界被拒绝且根外无快照`, async () => {
  const folder = await realpath(await mkdtemp(join(tmpdir(), 'digiworld-snapshots-security-')));
  const directory = join(folder, 'data'), outside = join(folder, 'outside');
  await mkdir(directory); await mkdir(outside);
  let repository;
  try {
    if (when === 'before-open') {
      await symlink(outside, join(directory, 'snapshots'));
      await assert.rejects(async () => { repository = await openRepository(directory); }, /快照.*(?:目录|身份)|链接/);
    } else {
      repository = await openRepository(directory);
      await rename(join(directory, 'snapshots'), join(directory, 'old-snapshots'));
      await symlink(outside, join(directory, 'snapshots'));
      const { seed } = await import('../src/store.js');
      await assert.rejects(repository.write(seed(), { initialize: true }), /快照.*(?:目录|身份)|链接/);
      await assert.rejects(repository.read(), /快照.*(?:目录|身份)|链接/);
    }
    assert.deepEqual(await readdir(outside), []);
  } finally {
    await repository?.close(); await rm(folder, { recursive: true, force: true });
  }
});
