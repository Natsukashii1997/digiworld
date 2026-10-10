import { failure } from "./repository.mjs";
import { randomUUID } from "node:crypto";
import {
  exact,
  revision,
  identifier,
  manifestHash,
} from "./knowledge-compilation-schema.mjs";
import { assertEvidenceAuthorization } from "./knowledge-compilation.mjs";
import { createKnowledgeWriteJournal } from "./knowledge-write-journal.mjs";

// Impact is a point-in-time observation over fixed evidence, never a new
// knowledge-validity registry. The journal contributes historical pointers only.
export function createKnowledgeMaintenance(
  repository,
  { compilation, files, clock = Date.now },
) {
  const journal = createKnowledgeWriteJournal(repository.directory);
  const plans = new Map();
  const running = new Map(),
    generations = new Map();
  const generation = (taskId) => generations.get(taskId) || 0;
  function requireIdle(taskId) {
    if (running.has(taskId))
      throw failure("已有重新整理请求仍在处理，请先核对结果", 409);
  }
  const stamp = () => new Date(clock()).toISOString();
  const taskOf = (state, id) => {
    const task = state.knowledgeTasks?.find((item) => item.id === id);
    if (!task) throw failure("原整理任务不存在，请刷新", 404);
    return task;
  };
  const authorized = (evidence) =>
    repository.withSnapshot({}, (state) =>
      assertEvidenceAuthorization(state, evidence),
    );
  async function recheck(evidence) {
    await authorized(evidence);
    for (const item of evidence) {
      await authorized([item]);
      const document = await files.read({ id: item.sourceId, generation: item.generation, root: item.root, identity: item.identity }, item);
      if (document.sha256 !== item.sha256)
        throw failure("预览后的来源内容又发生变化，请重新预览", 409);
    }
    await authorized(evidence);
  }
  return {
    async recover(input) {
      exact(input, ["taskId"]);
      identifier(input.taskId);
      // Retire not-yet-started confirmations, including previews whose I/O is
      // still running. A delayed request cannot start after a negative lookup.
      return repository.withSnapshot({}, (state) => {
        taskOf(state, input.taskId);
        generations.set(input.taskId, generation(input.taskId) + 1);
        for (const [id, plan] of plans)
          if (plan.parent.id === input.taskId) plans.delete(id);
        return {
          state,
          pending: running.has(input.taskId),
          latestTaskId:
            state.knowledgeTasks.findLast(
              (task) => task.basedOn?.taskId === input.taskId,
            )?.id || null,
        };
      });
    },
    async preview(input) {
      exact(input, ["taskId"]);
      identifier(input.taskId);
      requireIdle(input.taskId);
      const startedGeneration = generation(input.taskId);
      const captured = await repository.withSnapshot({}, (state) => {
        const task = taskOf(state, input.taskId);
        assertEvidenceAuthorization(state, task.evidence);
        return { task, revision: state.revision };
      });
      const evidence = [],
        documents = [];
      for (const old of captured.task.evidence) {
        await authorized([old]);
        const { selected, document } = await files.current({ id: old.sourceId, generation: old.generation, root: old.root, identity: old.identity }, old.path);
        const next = {
          ...old,
          id: randomUUID(),
          ...selected,
          sha256: document.sha256,
          readAt: stamp(),
        };
        evidence.push(next);
        documents.push({
          path: next.path,
          root: next.root,
          sourceName: next.sourceName,
          oldSha256: old.sha256,
          sha256: next.sha256,
          content: document.content,
        });
      }
      await recheck(evidence);
      await repository.withSnapshot(
        { expectedRevision: captured.revision },
        (state) => assertEvidenceAuthorization(state, evidence),
      );
      requireIdle(input.taskId);
      if (startedGeneration !== generation(input.taskId))
        throw failure("预览期间已核对或取消旧请求，请重新预览", 409);
      for (const [id, plan] of plans)
        if (plan.expires <= clock()) plans.delete(id);
      if (plans.size >= 30) throw failure("预览数量达到上限，请稍后再试", 429);
      const previewId = randomUUID(),
        taskId = randomUUID(),
        expires = clock() + 300000;
      plans.set(previewId, {
        taskId,
        parent: captured.task,
        evidence,
        revision: captured.revision,
        expires,
        generation: startedGeneration,
      });
      return {
        previewId,
        taskId,
        question: captured.task.question,
        documents,
        expiresAt: new Date(expires).toISOString(),
      };
    },
    async create(input) {
      exact(input, ["previewId", "confirmed"]);
      identifier(input.previewId);
      if (input.confirmed !== true)
        throw failure("请确认只创建新任务并保留旧历史");
      const requestId = `renew-${input.previewId}`;
      // Claim synchronously before any await. Recovery can then distinguish an
      // active request from one it can safely cancel before it ever starts.
      let plan = plans.get(input.previewId);
      plans.delete(input.previewId);
      if (
        plan &&
        (plan.expires <= clock() ||
          plan.generation !== generation(plan.parent.id))
      )
        plan = null;
      if (plan) {
        requireIdle(plan.parent.id);
        running.set(plan.parent.id, input.previewId);
      }
      try {
        const prior = await repository.withSnapshot({}, (state) => {
          const task = state.knowledgeTasks?.find(
            (item) => item.requestId === requestId,
          );
          if (!task) return null;
          assertEvidenceAuthorization(state, task.evidence);
          return { state, taskId: task.id };
        });
        if (prior) return prior;
        if (!plan)
          throw failure("重新整理预览已失效，请刷新任务后重新预览", 409);
        await repository.withSnapshot(
          { expectedRevision: plan.revision },
          (state) => {
            const parent = taskOf(state, plan.parent.id);
            if (parent.manifestHash !== plan.parent.manifestHash)
              throw failure("原任务身份已变化", 409);
            assertEvidenceAuthorization(state, plan.evidence);
          },
        );
        await recheck(plan.evidence);
        const next = {
          schema: 1,
          id: plan.taskId,
          requestId,
          question: plan.parent.question,
          createdAt: stamp(),
          evidence: plan.evidence,
          candidates: [],
          archived: false,
          basedOn: {
            taskId: plan.parent.id,
            manifestHash: plan.parent.manifestHash,
          },
        };
        next.manifestHash = manifestHash(next);
        const state = await repository.updateKnowledge(
          (tasks, current) => {
            if (plan.expires <= clock())
              throw failure("确认期间预览过期，请重新预览", 409);
            assertEvidenceAuthorization(current, next.evidence);
            if (tasks.length >= 50)
              throw failure("整理任务已达到50个上限", 413);
            return [...tasks, next];
          },
          { expectedRevision: plan.revision },
        );
        return { state, taskId: next.id };
      } finally {
        if (plan) running.delete(plan.parent.id);
      }
    },
    async impact(input) {
      exact(input, ["offset", "expectedRevision"]);
      revision(input.expectedRevision);
      revision(input.offset);
      const tasks = await repository.withSnapshot(
        { expectedRevision: input.expectedRevision },
        (state) => state.knowledgeTasks || [],
      );
      if (input.offset > tasks.length)
        throw failure("检查位置无效，请重新检查", 409);
      let rows = [],
        recordsAvailable = true;
      try {
        rows = await journal.list();
      } catch {
        recordsAvailable = false;
      }
      const items = [],
        started = clock();
      for (const task of tasks.slice(input.offset, input.offset + 5)) {
        if (items.length && clock() - started >= 5000) break;
        const check = await compilation.check({ taskId: task.id });
        const affected = new Set(
          check.items
            .filter((item) => item.status !== "unchanged")
            .map((item) => item.evidenceId),
        );
        items.push({
          ...check,
          question: task.question,
          archived: task.archived,
          items: check.items.map((item) => ({
            ...item,
            path: task.evidence.find((e) => e.id === item.evidenceId).path,
            sourceName: task.evidence.find((e) => e.id === item.evidenceId)
              .sourceName,
          })),
          candidates: affected.size
            ? task.candidates.map((version) => ({
                id: version.id,
                title: version.candidate.title,
                claims: version.candidate.claims
                  .filter((claim) =>
                    claim.evidenceIds.some((id) => affected.has(id)),
                  )
                  .map(({ id, text }) => ({ id, text })),
                conflicts: version.candidate.conflicts.filter((item) =>
                  item.evidenceIds.some((id) => affected.has(id)),
                ),
                relations: version.candidate.relations.filter((item) =>
                  item.evidenceIds.some((id) => affected.has(id)),
                ),
              }))
            : [],
          saved: {
            status: recordsAvailable ? "available" : "unavailable",
            items: rows
              .filter((item) => item.row.taskId === task.id)
              .map((item) => ({
                operationId: item.row.id,
                versionId: item.row.versionId,
                root: item.row.source.root,
                path: item.row.path,
                createdAt: item.row.createdAt,
                receipt: item.rolledBack
                  ? "withdrawn"
                  : item.rollbackStarted || !item.applied
                    ? "pending"
                    : "saved",
              })),
          },
        });
      }
      await repository.withSnapshot(
        { expectedRevision: input.expectedRevision },
        () => {},
      );
      const end = input.offset + items.length;
      return {
        revision: input.expectedRevision,
        checkedAt: new Date(clock()).toISOString(),
        total: tasks.length,
        offset: input.offset,
        nextOffset: end < tasks.length ? end : null,
        items,
      };
    },
  };
}
