import { randomUUID } from 'node:crypto';
import { createConfigJournal } from './config-journal.mjs';
import { failure } from './repository.mjs';
import {
  knowledgeSources,
  pendingIdentityOverlap,
  policyKey,
} from './knowledge-access-policy.mjs';
import {
  compilationHash,
  manifestHash,
  validateCandidate,
} from './knowledge-compilation-schema.mjs';

const UUID = /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/;
const SHA = /^[a-f0-9]{64}$/;
const PREVIEW_MS = 5 * 60 * 1000;
const LOCATION = '工作台本机主库 · 知识待整理候选';
const exact = (value, keys) => value && typeof value === 'object' && !Array.isArray(value) &&
  Object.keys(value).length === keys.length && keys.every(key => Object.hasOwn(value, key));
const instant = value => typeof value === 'string' &&
  /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(value) &&
  Number.isFinite(Date.parse(value));
const reject = (message, status = 400) => { throw failure(message, status); };
const knownNotStarted = id => ({ operationId: id, status: 'not_started', closed: true,
  message: '本机待查编号已封闭；迟到的确认不会再保存候选。' });

function validateClosed(row) {
  if (!exact(row, ['schema', 'id', 'at']) || row.schema !== 1 ||
    !UUID.test(row.id) || !instant(row.at)) reject('知识剪藏待查记录无效', 503);
  return row;
}
function sourceOf(state, id) {
  const source = knowledgeSources(state).find(item => item.id === id);
  if (!source) reject('知识源已断开，请重新检索', 409);
  if (!['markdown', 'obsidian'].includes(source.kind))
    reject('首批只支持本机 Markdown 命中；飞书来源尚未开放候选保存', 403);
  if (pendingIdentityOverlap(state, source)) reject('知识目录身份待重新确认，请先核对来源', 409);
  return source;
}
function validatePath(path) {
  if (typeof path !== 'string' || !path || path.length > 1000 ||
    !/\.md$/i.test(path) || /[\\:\x00-\x1f\x7f-\x9f]/.test(path) ||
    path.split('/').some(part => !part || part.startsWith('.') || part !== part.trim()))
    reject('所选原文路径无效');
}
function validateExcerpt(excerpt) {
  if (typeof excerpt !== 'string' || !excerpt.trim() || excerpt.length > 2000 ||
    /[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/.test(excerpt))
    reject('摘录应为原文中的 1–2000 字，不含控制字符');
}

// T08 first slice: one explicitly selected local Markdown result. Neither
// preview nor confirm writes a source file, Vault, or a Feishu resource.
export function createKnowledgeClip(repository, { files, clock = Date.now }) {
  const previews = new Map();
  const closures = createConfigJournal(repository.directory, {
    folder: 'knowledge-clip-closed', validate: validateClosed,
    label: '知识剪藏封闭编号',
  });
  const at = () => new Date(clock()).toISOString();
  const taskOf = (state, id) => (state.knowledgeTasks || []).find(task => task.requestId === id);

  async function readCurrent(sourceId, path, expectedSha256, expectedKey) {
    const captured = await repository.withSnapshot({}, state => {
      const source = sourceOf(state, sourceId);
      const key = policyKey(state);
      if (expectedKey && expectedKey !== key) reject('知识授权或范围已变化，请重新预览', 409);
      return { source, key, revision: state.revision };
    });
    // Policy files recheck source scope before and after full bounded read.
    // Keep this I/O outside repository's serial queue: identity revocation may
    // itself need that queue.
    const { selected, document } = await files.current(captured.source, path);
    await repository.withSnapshot({}, state => {
      const live = sourceOf(state, sourceId);
      if (policyKey(state) !== captured.key || live.root !== captured.source.root ||
        live.identity !== captured.source.identity || live.generation !== captured.source.generation)
        reject('读取期间知识授权或来源身份已变化，请重新检索', 409);
    });
    if (document.sha256 !== expectedSha256)
      reject('原文已变化，请重新检索并阅读', 409);
    return { ...captured, selected, document };
  }

  function buildTask(preview) {
    const name = preview.document.path.split('/').at(-1).replace(/\.md$/i, '');
    const title = `待整理摘录 · ${name}`.slice(0, 200);
    const evidence = [{
      id: randomUUID(), sourceId: preview.source.id, sourceName: preview.source.name,
      root: preview.source.root, identity: preview.source.identity,
      generation: preview.source.generation, path: preview.document.path,
      bytes: preview.selected.bytes, modifiedAt: preview.selected.modifiedAt,
      fingerprint: preview.selected.fingerprint, sha256: preview.document.sha256,
      readAt: preview.readAt,
    }];
    const task = { schema: 1, id: randomUUID(), requestId: preview.id,
      question: `整理摘录：${name}`.slice(0, 500), createdAt: at(),
      evidence, candidates: [], archived: false };
    task.manifestHash = manifestHash(task);
    const candidate = { schema: 1, taskId: task.id, manifestHash: task.manifestHash,
      title, summary: preview.excerpt,
      claims: [{ id: 'clip-1', text: preview.excerpt, kind: 'source_statement',
        evidenceIds: [evidence[0].id] }], conflicts: [], unknowns: [], relations: [] };
    validateCandidate(candidate, task);
    task.candidates.push({ id: randomUUID(), receivedAt: at(),
      sha256: compilationHash(candidate), candidate });
    return task;
  }

  return {
    async preview(input) {
      if (!exact(input, ['sourceId', 'path', 'expectedSha256', 'excerpt']) ||
        typeof input.sourceId !== 'string' || !/^[a-zA-Z0-9_-]{1,100}$/.test(input.sourceId) ||
        !SHA.test(input.expectedSha256 || '')) reject('知识剪藏预览字段无效');
      validatePath(input.path);
      validateExcerpt(input.excerpt);
      const captured = await readCurrent(input.sourceId, input.path, input.expectedSha256);
      if (!captured.document.content.includes(input.excerpt))
        reject('摘录与当前完整原文不一致，请重新选择原文', 409);
      for (const [id, item] of previews) if (item.expires <= clock()) previews.delete(id);
      if (previews.size >= 20) reject('待确认剪藏预览过多，请稍后重试', 409);
      const id = randomUUID(), expires = clock() + PREVIEW_MS;
      previews.set(id, { id, ...captured, excerpt: input.excerpt,
        readAt: at(), expires });
      return { operationId: id, revision: captured.revision,
        expiresAt: new Date(expires).toISOString(),
        sourceName: captured.source.name, sourceKind: captured.source.kind,
        sourceIdentity: captured.source.identity,
        sourceGeneration: captured.source.generation,
        path: captured.document.path, sha256: captured.document.sha256,
        excerpt: input.excerpt, location: LOCATION,
        notice: '只保存工作台本机待整理候选；原文与 Vault 不变，也未晋升正式知识。' };
    },
    async confirm(input) {
      if (!exact(input, ['operationId', 'revision', 'confirmed']) ||
        !UUID.test(input.operationId || '') || !Number.isSafeInteger(input.revision) ||
        input.revision < 0 || input.confirmed !== true)
        reject('知识剪藏确认字段无效');
      const prior = await repository.withSnapshot({}, async state => {
        const task = taskOf(state, input.operationId);
        const closed = await closures.get(input.operationId);
        if (task && closed) reject('知识剪藏编号状态冲突，请保留记录', 503);
        if (task) return { status: 'saved', closed: true, taskId: task.id, state };
        if (closed) return knownNotStarted(input.operationId);
        return null;
      });
      if (prior) return prior;
      const p = previews.get(input.operationId);
      if (!p || p.expires <= clock() || input.revision !== p.revision)
        reject('预览已失效，请查询原编号后重新预览', 409);
      const current = await readCurrent(p.source.id, p.document.path, p.document.sha256, p.key);
      if (current.selected.fingerprint !== p.selected.fingerprint ||
        current.selected.bytes !== p.selected.bytes ||
        current.selected.modifiedAt !== p.selected.modifiedAt ||
        !current.document.content.includes(p.excerpt))
        reject('来源内容或身份已变化，请重新阅读和预览', 409);
      const verified = { ...p, readAt: at() };
      let taskId;
      const state = await repository.updateKnowledge(async (tasks, live) => {
        const existing = taskOf(live, input.operationId);
        const closed = await closures.get(input.operationId);
        if (existing && closed) reject('知识剪藏编号状态冲突，请保留记录', 503);
        if (existing) { taskId = existing.id; return tasks; }
        if (closed) reject('该编号已封闭，迟到的确认不会保存候选', 409);
        const source = sourceOf(live, p.source.id);
        if (policyKey(live) !== p.key || source.root !== p.source.root ||
          source.identity !== p.source.identity || source.generation !== p.source.generation ||
          live.revision !== p.revision || p.expires <= clock())
          reject('知识范围或主库版本已变化，请重新预览', 409);
        if (tasks.length >= 50) reject('整理任务已达到 50 个上限', 413);
        const task = buildTask(verified);
        taskId = task.id;
        return [...tasks, task];
      }, { expectedRevision: p.revision, allowNoop: true });
      previews.delete(input.operationId);
      return { operationId: input.operationId, status: 'saved', closed: true,
        taskId, state, location: LOCATION };
    },
    async check(input) {
      if (!exact(input, ['operationId']) || !UUID.test(input.operationId || ''))
        reject('知识剪藏待查编号无效');
      return repository.withSnapshot({}, async state => {
        const task = taskOf(state, input.operationId);
        const closed = await closures.get(input.operationId);
        if (task && closed) reject('知识剪藏编号状态冲突，请保留记录', 503);
        if (task) return { operationId: input.operationId, status: 'saved',
          closed: true, taskId: task.id, state, location: LOCATION };
        if (!closed) {
          await closures.prepare({ schema: 1, id: input.operationId, at: at() });
          if (!await closures.get(input.operationId)) reject('待查编号封闭回读未确认，请保留原编号', 503);
        }
        previews.delete(input.operationId);
        return knownNotStarted(input.operationId);
      });
    },
  };
}
