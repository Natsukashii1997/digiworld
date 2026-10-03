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
      scrolls: 0,
      reverseRecords: 0,
    },
    scrollEntriesAdded: 0,
    learningLinksAdded: 0,
    learningBooksAdded: 0,
    silverAdded: { wall: 0, categories: 0, items: 0 },
    agentRolesAdded: 0,
    activityAdded: 0,
    collabAdded: 0,
    candidatesAdded: 0,
    newVersions: 0,
    knowledgeVersions: 0,
    kept: 0,
    settings: "保留当前主库的模型与夜间计划",
  };
  if (!current) {
    for (const name of Object.keys(summary.added))
      summary.added[name] = (input[name] || []).length;
    summary.activityAdded = (input.assetActivity || []).length;
    summary.collabAdded = (input.collabLog || []).length;
    summary.candidatesAdded = (input.revisionCandidates || []).length;
    for (const name of Object.keys(summary.silverAdded))
      summary.silverAdded[name] = (input.silver?.[name] || []).length;
    summary.agentRolesAdded = (input.agentRoles || []).length;
    summary.settings = "采用备份中的配置草稿；连接结果需重新扫描";
    // 简报已读状态与连接一样是本机状态（项目 ID 来自本机扫描），不随备份恢复。
    const { connections, briefReads, ...content } = input;
    if (input.learning) {
      // 书架文件夹是本机读取授权，不随备份恢复，需要在设置里重新指定。
      content.learning = { ...input.learning, folders: [] };
      summary.learningLinksAdded = input.learning.links.length;
      summary.learningBooksAdded = input.learning.books.length;
    }
    // 个人说明共享是本机授权，与连接一样不随备份恢复；规则与建议保留。
    if (content.knowledgeZones)
      content.knowledgeZones = { ...content.knowledgeZones, profileSharing: false };
    return { state: { ...content, revision: 0 }, summary };
  }
  const next = structuredClone(current);
  for (const name of Object.keys(summary.added)) {
    if (["knowledgeTasks", "scrolls", "reverseRecords"].includes(name)) continue;
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
  if (input.scrolls?.length) mergeScrolls(next, input.scrolls, summary);
  if (input.learning) mergeLearning(next, input.learning, summary);
  if (input.silver) mergeSilver(next, input.silver, summary);
  if (input.agentRoles?.length) {
    // 角色卡：当前库已有的卡保留当前编辑，只补上备份独有的卡。
    next.agentRoles ||= [];
    for (const role of input.agentRoles)
      if (!next.agentRoles.some((r) => r.agentId === role.agentId)) {
        next.agentRoles.push(structuredClone(role));
        summary.agentRolesAdded++;
      }
  }
  // 逆向记录（支线 B2）：只做加法。缺失的记录整条追加；同 ID 保留当前库（回复与入库结果以当前为准）。
  if (input.reverseRecords?.length) {
    next.reverseRecords ||= [];
    const known = new Set(next.reverseRecords.map((r) => r.id));
    for (const record of input.reverseRecords) {
      if (known.has(record.id)) {
        summary.kept++;
        continue;
      }
      next.reverseRecords.push(structuredClone(record));
      known.add(record.id);
      summary.added.reverseRecords++;
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
  // 协同操作留痕：按 ID 并集，只追加；同 ID 内容不同视为冲突，整次不导入。
  if (input.collabLog?.length) {
    next.collabLog ||= [];
    const records = new Map(next.collabLog.map((r) => [r.id, r]));
    for (const record of input.collabLog) {
      const old = records.get(record.id);
      if (old && !equivalent(old, record))
        throw Object.assign(new Error("操作留痕记录存在冲突，本次不会导入任何记录"), { status: 409 });
      if (!old) {
        next.collabLog.push(record);
        records.set(record.id, record);
        summary.collabAdded++;
      }
    }
  }
  if (input.revisionCandidates?.length)
    mergeCandidates(next, input.revisionCandidates, summary);
  validateState(next);
  return { state: next, summary };
}

// 改版候选（进化回路 v1）：按 ID 并集。同 ID 的正文等身份字段必须一致；
// 当前仍待处理而备份已决定时采用备份的决定（对应新版本随资产版本一起并入）；
// 当前已决定时保留当前；两边决定不同视为冲突，整次不导入。
function mergeCandidates(next, incoming, summary) {
  next.revisionCandidates ||= [];
  const conflict = () =>
    Object.assign(new Error("改版候选存在冲突，本次不会导入任何记录"), {
      status: 409,
    });
  const identity = ({ status, decidedAt, adoptedVersionId, returnReason, ...rest }) =>
    rest;
  for (const candidate of incoming) {
    const index = next.revisionCandidates.findIndex((c) => c.id === candidate.id);
    if (index === -1) {
      next.revisionCandidates.push(structuredClone(candidate));
      summary.candidatesAdded++;
      continue;
    }
    const existing = next.revisionCandidates[index];
    if (!equivalent(identity(existing), identity(candidate))) throw conflict();
    if (existing.status === "pending") {
      if (candidate.status !== "pending")
        next.revisionCandidates[index] = structuredClone(candidate);
    } else if (candidate.status !== "pending" && !equivalent(existing, candidate))
      throw conflict();
    summary.kept++;
  }
}

// 焚决（切片 1.3）：卷与条目是可变记录，没有版本。合并只做加法：
// 缺失的卷整卷追加；已有卷保留当前库的名称、顺序与编辑，只在末尾追加备份独有的条目；
// 两边都有的条目计次取较大值（计次只增不减）。同一条目 ID 落在不同卷里视为冲突。
function mergeScrolls(next, incoming, summary) {
  next.scrolls ||= [];
  const owner = new Map();
  for (const s of next.scrolls)
    for (const e of s.entries) owner.set(e.id, s.id);
  const conflict = () =>
    Object.assign(new Error("焚决条目存在冲突，本次不会导入任何记录"), {
      status: 409,
    });
  for (const scroll of incoming) {
    const existing = next.scrolls.find((s) => s.id === scroll.id);
    if (!existing) {
      if (scroll.entries.some((e) => owner.has(e.id))) throw conflict();
      next.scrolls.push(structuredClone(scroll));
      for (const e of scroll.entries) owner.set(e.id, scroll.id);
      summary.added.scrolls++;
      continue;
    }
    for (const entry of scroll.entries) {
      const at = owner.get(entry.id);
      if (at !== undefined && at !== scroll.id) throw conflict();
      const current = existing.entries.find((e) => e.id === entry.id);
      if (!current) {
        existing.entries.push(structuredClone(entry));
        owner.set(entry.id, scroll.id);
        summary.scrollEntriesAdded++;
      } else if (entry.uses > current.uses) {
        current.uses = entry.uses;
        if (entry.lastUsedAt) current.lastUsedAt = entry.lastUsedAt;
      }
    }
    summary.kept++;
  }
}

// 学习成长（切片 5.4）：与焚决一样只做加法。缺失的链接与书的状态追加；已有记录保留当前库的编辑与状态；
// 同一链接（URL 相同）已在当前库时不重复收藏。书架文件夹是本机读取授权，不随备份导入。
function mergeLearning(next, incoming, summary) {
  const hasContent = incoming.links.length || incoming.books.length;
  if (!next.learning && !hasContent) return;
  next.learning ||= { folders: [], books: [], links: [] };
  const linkIds = new Set(next.learning.links.map((l) => l.id)),
    urls = new Set(next.learning.links.map((l) => l.url)),
    bookIds = new Set(next.learning.books.map((b) => b.id));
  for (const link of incoming.links) {
    if (linkIds.has(link.id) || urls.has(link.url)) {
      summary.kept++;
      continue;
    }
    next.learning.links.push(structuredClone(link));
    linkIds.add(link.id);
    urls.add(link.url);
    summary.learningLinksAdded++;
  }
  for (const book of incoming.books) {
    if (bookIds.has(book.id)) {
      summary.kept++;
      continue;
    }
    next.learning.books.push(structuredClone(book));
    bookIds.add(book.id);
    summary.learningBooksAdded++;
  }
}

// 银饰计划（路线 v3 5.5）：欣赏图、品类、已填格都是可变记录。合并只做加法：
// 缺失的记录追加，已有记录保留当前库的编辑；同一已填格在两边属于不同品类视为冲突，整次不导入。
// 图片文件不随备份走（备份只含主库），缺失的图片在界面上显示为“图片缺失”。
function mergeSilver(next, incoming, summary) {
  next.silver ||= { wall: [], categories: [], items: [] };
  const target = next.silver;
  for (const name of ["wall", "categories", "items"]) {
    const existing = new Map(target[name].map((r) => [r.id, r]));
    for (const record of incoming[name]) {
      const old = existing.get(record.id);
      if (old) {
        if (name === "items" && old.categoryId !== record.categoryId)
          throw Object.assign(new Error("银饰收藏存在冲突，本次不会导入任何记录"), {
            status: 409,
          });
        summary.kept++;
        continue;
      }
      target[name].push(structuredClone(record));
      existing.set(record.id, record);
      summary.silverAdded[name]++;
    }
  }
}
