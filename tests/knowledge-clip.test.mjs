import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';

import { validateKnowledgeTasks, validateKnowledgeHistory } from '../server/knowledge-compilation-schema.mjs';
import { failure } from '../server/repository.mjs';
import { createKnowledgeFiles } from '../server/knowledge-files.mjs';
import { createPolicyKnowledgeFiles } from '../server/knowledge-access-policy.mjs';
import { createKnowledgeClip } from '../server/knowledge-clip.mjs';
const digest = text => createHash('sha256').update(text).digest('hex');

async function fixture() {
  const directory = await realpath(await mkdtemp(join(tmpdir(), 'guiji-knowledge-clip-')));
  let content = '# Alpha\nA selected sentence about a synthetic topic.\n';
  let permission = true;
  let delayRead = null;
  let reads = 0;
  const source = {
    schema: 1, id: 'source-1', name: 'Synthetic Markdown', kind: 'markdown',
    root: directory, identity: digest('root-identity'), generation: randomUUID(),
    agentSharing: false, excludedFolders: [],
  };
  let state = { revision: 0, knowledgeTasks: [], connections: { knowledgeSources: [source] } };
  let queue = Promise.resolve();
  const serial = action => {
    const result = queue.then(action);
    queue = result.catch(() => {});
    return result;
  };
  const repository = {
    directory,
    read: async () => state,
    withSnapshot({ expectedRevision } = {}, action) {
      return serial(() => {
        if (expectedRevision !== undefined && state.revision !== expectedRevision)
          throw failure('revision changed', 409);
        return action(state);
      });
    },
    updateKnowledge(update, { expectedRevision, allowNoop = false } = {}) {
      return serial(async () => {
        if (!allowNoop && expectedRevision !== state.revision)
          throw failure('revision changed', 409);
        const nextTasks = await update(state.knowledgeTasks, state);
        if (JSON.stringify(nextTasks) === JSON.stringify(state.knowledgeTasks)) return state;
        if (expectedRevision !== state.revision) throw failure('revision changed', 409);
        validateKnowledgeTasks(nextTasks);
        validateKnowledgeHistory(state.knowledgeTasks, nextTasks);
        state = { ...state, revision: state.revision + 1, knowledgeTasks: nextTasks };
        return state;
      });
    },
  };
  const files = {
    async current() {
      reads++;
      if (delayRead && reads === 2) await delayRead.promise;
      if (!permission) throw failure('source permission expired', 403);
      return {
        selected: { path: 'note.md', bytes: Buffer.byteLength(content),
          modifiedAt: '2026-10-07T00:00:00.000Z', fingerprint: digest(content + ':metadata') },
        document: { path: 'note.md', content, bytes: Buffer.byteLength(content),
          modifiedAt: '2026-10-07T00:00:00.000Z', sha256: digest(content) },
      };
    },
  };
  let now = Date.parse('2026-10-07T00:00:00.000Z');
  const service = createKnowledgeClip(repository, { files, clock: () => now });
  const selection = () => ({ sourceId: source.id, path: 'note.md',
    expectedSha256: digest(content), excerpt: 'A selected sentence about a synthetic topic.' });
  return { directory, source, repository, service, selection,
    get state() { return state; },
    set content(value) { content = value; },
    set permission(value) { permission = value; },
    set delayRead(value) { delayRead = value; },
    tick(ms) { now += ms; },
    close: () => rm(directory, { recursive: true, force: true }),
  };
}

test('one complete local source read saves one compilation candidate in main state', async t => {
  const f = await fixture(); t.after(f.close);
  const preview = await f.service.preview(f.selection());
  assert.equal(preview.location, '工作台本机主库 · 知识待整理候选');
  assert.equal(preview.sha256, f.selection().expectedSha256);
  const saved = await f.service.confirm({ operationId: preview.operationId,
    revision: preview.revision, confirmed: true });
  assert.equal(saved.status, 'saved');
  assert.equal(f.state.knowledgeTasks.length, 1);
  assert.equal(f.state.knowledgeTasks[0].candidates[0].candidate.claims[0].kind, 'source_statement');
  assert.equal(f.state.knowledgeTasks[0].candidates[0].candidate.summary, f.selection().excerpt);
  const second = await f.service.confirm({ operationId: preview.operationId,
    revision: preview.revision, confirmed: true });
  assert.equal(second.taskId, saved.taskId);
  assert.equal(f.state.knowledgeTasks.length, 1);
  assert.equal((await f.service.check({ operationId: preview.operationId })).status, 'saved');
});

test('mismatched excerpt and incomplete permission read cannot create a candidate', async t => {
  const f = await fixture(); t.after(f.close);
  await assert.rejects(f.service.preview({ ...f.selection(), excerpt: 'invented conclusion' }), /摘录与当前完整原文/);
  f.permission = false;
  await assert.rejects(f.service.preview(f.selection()), /permission expired/);
  assert.equal(f.state.knowledgeTasks.length, 0);
});

test('changed source between preview and confirm blocks write; check closes original ID', async t => {
  const f = await fixture(); t.after(f.close);
  const preview = await f.service.preview(f.selection());
  f.content = '# Alpha\nReplaced synthetic text.\n';
  await assert.rejects(f.service.confirm({ operationId: preview.operationId,
    revision: preview.revision, confirmed: true }), /原文已变化/);
  assert.equal(f.state.knowledgeTasks.length, 0);
  assert.deepEqual((await f.service.check({ operationId: preview.operationId })).status, 'not_started');
  const replay = await f.service.confirm({ operationId: preview.operationId,
    revision: preview.revision, confirmed: true });
  assert.equal(replay.closed, true);
  assert.equal(replay.status, 'not_started');
});

test('check wins over delayed confirm and durable closure blocks replay after restart', async t => {
  const f = await fixture(); t.after(f.close);
  const preview = await f.service.preview(f.selection());
  let release;
  const promise = new Promise(resolve => { release = resolve; });
  f.delayRead = { promise };
  const confirming = f.service.confirm({ operationId: preview.operationId,
    revision: preview.revision, confirmed: true });
  // Wait until confirm has left the repository queue and is inside its second read.
  await new Promise(resolve => setImmediate(resolve));
  const checked = await f.service.check({ operationId: preview.operationId });
  assert.equal(checked.status, 'not_started');
  release();
  await assert.rejects(confirming, /编号已封闭/);
  assert.equal(f.state.knowledgeTasks.length, 0);
  const restarted = createKnowledgeClip(f.repository, {
    files: { current: async () => { throw Error('must not read'); } },
    clock: () => Date.parse('2026-10-07T00:00:00.000Z'),
  });
  const afterRestart = await restarted.confirm({ operationId: preview.operationId,
    revision: preview.revision, confirmed: true });
  assert.equal(afterRestart.status, 'not_started');
});

test('expired preview does not write; original ID can be closed', async t => {
  const f = await fixture(); t.after(f.close);
  const preview = await f.service.preview(f.selection());
  f.tick(5 * 60 * 1000 + 1);
  await assert.rejects(f.service.confirm({ operationId: preview.operationId,
    revision: preview.revision, confirmed: true }), /预览已失效/);
  const checked = await f.service.check({ operationId: preview.operationId });
  assert.equal(checked.status, 'not_started');
  assert.equal(f.state.knowledgeTasks.length, 0);
});

test('authorization or source generation drift after preview blocks save', async t => {
  const f = await fixture(); t.after(f.close);
  const preview = await f.service.preview(f.selection());
  f.source.generation = randomUUID();
  await assert.rejects(f.service.confirm({ operationId: preview.operationId,
    revision: preview.revision, confirmed: true }), /知识授权或范围已变化/);
  assert.equal(f.state.knowledgeTasks.length, 0);
});

test('real local Markdown adapter reads complete synthetic file before main-state save', async t => {
  const f = await fixture(); t.after(f.close);
  const raw = createKnowledgeFiles();
  const text = '# Alpha\nA selected sentence about a synthetic topic.\n';
  await writeFile(join(f.directory, 'note.md'), text);
  f.source.identity = (await raw.inspectRoot(f.directory)).identity;
  const guarded = createPolicyKnowledgeFiles(f.repository, raw);
  const service = createKnowledgeClip(f.repository, { files: guarded,
    clock: () => Date.parse('2026-10-07T00:00:00.000Z') });
  const preview = await service.preview({ sourceId: f.source.id, path: 'note.md',
    expectedSha256: digest(text), excerpt: 'A selected sentence about a synthetic topic.' });
  const saved = await service.confirm({ operationId: preview.operationId,
    revision: preview.revision, confirmed: true });
  assert.equal(saved.status, 'saved');
  assert.equal(f.state.knowledgeTasks[0].evidence[0].sha256, digest(text));
});
