import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, writeFile, rm, rename } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createReaUpdater } from '../server/rea-update.mjs';
import { fakeUpdate } from './fake-rea-update.mjs';

async function withJournal(record, run) {
  const directory = await mkdtemp(join(tmpdir(), 'rea-recovery-'));
  const file = join(directory, 'rea-updates/state.json');
  const fake = fakeUpdate();
  const original = JSON.stringify(record);
  let updater;
  try {
    await mkdir(join(directory, 'rea-updates'), { mode: 0o700 });
    await writeFile(file, original, { mode: 0o600 });
    updater = await createReaUpdater({ directory, ...fake });
    await run({ updater, fake, file, original, directory });
  } finally {
    await updater?.close();
    await rm(directory, { recursive: true, force: true });
  }
}

test('旧目录未写入的网络失败不误判为待查询；重开仍可重新检查且保留旧记录', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'rea-recovery-'));
  const file = join(directory, 'rea-updates/state.json');
  const original = JSON.stringify({ identity: 'previous-directory', state: 'network_failed', checkedAt: '2026-10-18T14:54:05.584Z', message: '合成网络失败' });
  const fake = fakeUpdate();
  let updater;
  try {
    await mkdir(join(directory, 'rea-updates'), { mode: 0o700 });
    await writeFile(file, original, { mode: 0o600 });
    for (let attempt = 0; attempt < 2; attempt++) {
      updater = await createReaUpdater({ directory, ...fake });
      assert.equal(updater.read().state, 'idle', '没有执行更新的历史失败不应弹出写入结果待核对');
      assert.equal(updater.unresolved, false);
      assert.equal(await readFile(file, 'utf8'), original);
      assert.equal(fake.control.network, 0);
      assert.equal(fake.calls.length, 0);
      await updater.close();
    }
    updater = await createReaUpdater({ directory, ...fake });
    assert.equal((await updater.check()).state, 'available');
    assert.equal(fake.control.yes, 0);
  } finally {
    await updater?.close();
    await rm(directory, { recursive: true, force: true });
  }
});

test('没有未决写入的旧检查或预演失效；旧计划三个阶段都不能确认，新流程仍需明确确认', async () => {
  for (const state of ['idle', 'current', 'available', 'syncing', 'network_failed', 'preview', 'adaptation_failed', 'preview_failed']) {
    await withJournal({ identity: 'previous-directory', state, version: '99.0.0', current: { version: '99.0.0' }, plan: { version: '99.0.0' }, planId: 'old-plan', planHash: 'old-hash', expiresAt: Number.MAX_SAFE_INTEGER, compatibility: { ok: true }, releaseUrl: 'https://invalid.example' }, async ({ updater, fake, file, original }) => {
      const recovered = updater.read();
      assert.equal(recovered.state, 'idle', state);
      for (const field of ['version', 'current', 'plan', 'planId', 'planHash', 'expiresAt', 'compatibility', 'releaseUrl']) assert.equal(recovered[field], undefined, field);
      assert.notEqual(updater.versionForDoctor(), '99.0.0');
      assert.equal((await updater.query()).state, 'idle');
      assert.equal(fake.calls.length, 0);
      assert.equal(fake.control.network, 0);
      assert.equal(await readFile(file, 'utf8'), original);
      await assert.rejects(updater.confirm({ planId: 'old-plan' }), /失效/);
      assert.equal((await updater.check()).state, 'available');
      await assert.rejects(updater.confirm({ planId: 'old-plan' }), /失效/);
      const preview = await updater.preview();
      assert.equal(preview.state, 'preview');
      await assert.rejects(updater.confirm({ planId: 'old-plan' }), /失效/);
      assert.equal(fake.control.yes, 0);
      assert.equal((await updater.confirm({ planId: preview.planId })).state, 'succeeded');
      assert.equal(fake.control.yes, 1);
    });
  }
});

test('跨身份已写入或不明记录仍阻断；缺失身份和待持久化记录不自动清除', async () => {
  const records = ['writing', 'unknown', 'mismatch', 'write_failed', 'succeeded', 'future-state', undefined].map(state => ({ identity: 'previous-directory', state }));
  records.push({ state: 'network_failed' }, { identity: '', state: 'preview' }, { identity: 'previous-directory', state: 'preview_failed', persistencePending: true });
  for (const record of records) {
    await withJournal({ ...record, plan: { version: '6.5.0' }, planId: 'old-plan' }, async ({ updater, fake, file, original }) => {
      assert.equal(updater.read().state, 'unknown');
      assert.equal(updater.unresolved, true);
      await assert.rejects(updater.check(), /查询/);
      await assert.rejects(updater.preview(), /查询/);
      await assert.rejects(updater.confirm({ planId: 'old-plan' }), /身份/);
      await assert.rejects(updater.query(), /身份/);
      assert.equal(fake.control.network, 0);
      assert.equal(fake.calls.length, 0);
      assert.equal(await readFile(file, 'utf8'), original);
    });
  }
});

test('恢复后网络失败和预演失败均可明确重试，不提前执行更新', async () => {
  await withJournal({ identity: 'previous-directory', state: 'network_failed' }, async ({ updater, fake }) => {
    fake.control.mode = 'network';
    assert.equal((await updater.check()).state, 'network_failed');
    fake.control.mode = 'ok';
    assert.equal((await updater.check()).state, 'available');
    fake.control.mode = 'preview-fail';
    assert.equal((await updater.preview()).state, 'preview_failed');
    fake.control.mode = 'ok';
    const preview = await updater.preview();
    assert.equal(preview.state, 'preview');
    assert.equal(fake.control.yes, 0);
    assert.equal((await updater.confirm({ planId: preview.planId })).state, 'succeeded');
    assert.equal(fake.control.yes, 1);
  });
});

test('当前身份的预演重启后保留，明确确认后幂等回读', async () => {
  await withJournal({ identity: 'previous-directory', state: 'network_failed' }, async ({ updater, fake, directory, file }) => {
    await updater.check();
    const preview = await updater.preview();
    const saved = await readFile(file, 'utf8');
    await updater.close();
    const restored = await createReaUpdater({ directory, ...fake });
    try {
      assert.equal(restored.read().state, 'preview');
      assert.equal(restored.read().planId, preview.planId);
      assert.equal(await readFile(file, 'utf8'), saved);
      assert.equal((await restored.confirm({ planId: preview.planId })).state, 'succeeded');
      assert.equal((await restored.confirm({ planId: preview.planId })).state, 'succeeded');
      assert.equal(fake.control.yes, 1);
    } finally { await restored.close(); }
  });
});

test('恢复后若目录再被替换，所有操作仍被身份校验阻止', async () => {
  await withJournal({ identity: 'previous-directory', state: 'network_failed' }, async ({ updater, fake, directory }) => {
    const moved = directory + '-original';
    await rename(directory, moved);
    await mkdir(directory, { mode: 0o700 });
    try {
      for (const action of ['check', 'preview', 'query', 'confirm']) await assert.rejects(updater[action]({ planId: 'old-plan' }), /身份/);
      assert.equal(fake.calls.length, 0);
      assert.equal(fake.control.network, 0);
    } finally {
      await rm(directory, { recursive: true, force: true });
      await rename(moved, directory);
    }
  });
});
