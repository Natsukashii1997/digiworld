import { validateState, equivalent } from "./schema.mjs";
export function backupState(input) {
  if (input?.format === "guiji-backup") {
    if (input.schema !== 1)
      throw Object.assign(new Error("不支持的备份版本"), { status: 400 });
    input = input.state;
  }
  return validateState(input);
}
export function mergeBackup(current, incoming) {
  const input = backupState(incoming);
  const summary = {
    added: {
      assets: 0,
      notes: 0,
      projects: 0,
      agents: 0,
      references: 0,
      knowledgeTasks: 0,
    },
    activityAdded: 0,
    newVersions: 0,
    knowledgeVersions: 0,
    kept: 0,
    settings: "保留当前主库的模型与夜间计划",
  };
  if (!current) {
    for (const name of Object.keys(summary.added))
      summary.added[name] = (input[name] || []).length;
    summary.activityAdded = (input.assetActivity || []).length;
    summary.settings = "采用备份中的配置草稿；连接结果需重新扫描";
    const { connections, ...content } = input;
    return { state: { ...content, revision: 0 }, summary };
  }
  const next = structuredClone(current);
  for (const name of Object.keys(summary.added)) {
    if (name === "knowledgeTasks") continue;
    const lookup = new Map(next[name].map((item, index) => [item.id, index]));
    for (const item of input[name]) {
      if (!lookup.has(item.id)) {
        next[name].push(item);
        summary.added[name]++;
        continue;
      }
      const index = lookup.get(item.id),
        existing = next[name][index];
      if (name === "assets") {
        if (
          existing.type !== item.type ||
          existing.demo !== item.demo ||
          existing.createdAt !== item.createdAt ||
          !equivalent(existing.origin, item.origin) ||
          !existing.versions
            .slice(0, Math.min(existing.versions.length, item.versions.length))
            .every((v, i) => equivalent(v, item.versions[i]))
        )
          throw Object.assign(
            new Error(
              `资产「${item.versions.at(-1).title}」存在版本冲突。本次不会导入任何记录。`,
            ),
            { status: 409 },
          );
        if (item.versions.length > existing.versions.length) {
          summary.newVersions +=
            item.versions.length - existing.versions.length;
          next.assets[index] = { ...existing, versions: item.versions };
        }
      }
      summary.kept++;
    }
  }
  if (input.knowledgeTasks?.length) {
    next.knowledgeTasks ||= [];
    for (const task of input.knowledgeTasks) {
      const index = next.knowledgeTasks.findIndex(
        (value) => value.id === task.id,
      );
      const request = next.knowledgeTasks.find(
        (value) => value.requestId === task.requestId,
      );
      if (request && request.id !== task.id)
        throw Object.assign(
          new Error("知识整理请求存在身份冲突，本次不会导入任何记录"),
          { status: 409 },
        );
      if (index === -1) {
        next.knowledgeTasks.push(task);
        summary.added.knowledgeTasks++;
        continue;
      }
      const existing = next.knowledgeTasks[index];
      const { candidates, archived, ...identity } = task;
      const {
        candidates: versions,
        archived: wasArchived,
        ...oldIdentity
      } = existing;
      if (
        !equivalent(identity, oldIdentity) ||
        !versions
          .slice(0, Math.min(versions.length, candidates.length))
          .every((version, i) => equivalent(version, candidates[i]))
      )
        throw Object.assign(
          new Error("知识整理任务存在历史分叉，本次不会导入任何记录"),
          { status: 409 },
        );
      if (candidates.length > versions.length)
        summary.knowledgeVersions += candidates.length - versions.length;
      next.knowledgeTasks[index] = {
        ...existing,
        archived: wasArchived || archived,
        candidates: candidates.length > versions.length ? candidates : versions,
      };
      summary.kept++;
    }
  }
  if (input.assetActivity?.length) {
    next.assetActivity ||= [];
    const records = new Map(next.assetActivity.map((r) => [r.id, r]));
    for (const record of input.assetActivity) {
      const old = records.get(record.id);
      if (old && !equivalent(old, record))
        throw Object.assign(new Error("使用或反馈记录存在冲突，本次不会导入任何记录"), { status: 409 });
      if (!old) {
        next.assetActivity.push(record);
        records.set(record.id, record);
        summary.activityAdded++;
      }
    }
  }
  validateState(next);
  return { state: next, summary };
}
