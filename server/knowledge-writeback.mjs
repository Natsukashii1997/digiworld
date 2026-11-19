import { randomUUID } from "node:crypto";
import { failure } from "./repository.mjs";
import {
  exact,
  identifier,
  validateCandidate,
} from "./knowledge-compilation-schema.mjs";
import { assertEvidenceAuthorization } from "./knowledge-compilation.mjs";
import {
  createKnowledgeWriteFiles,
  candidatePath,
  knowledgeTextHash,
} from "./knowledge-write-files.mjs";
import { createKnowledgeWriteJournal } from "./knowledge-write-journal.mjs";

const text = (value) =>
  value.replace(/[\\`*_{}\[\]<>()#!|~>]/g, "\\$&").replace(/\n/g, "\n> ");
function render(task, version, source, domain, at) {
  const candidate = version.candidate;
  const lines = [
    "---",
    "type: knowledge-candidate",
    `domain: ${domain}`,
    "status: 待整理",
    "retrieval: 停用",
    "sensitivity: 受限",
    "access_scope: 本人 Obsidian 与个人 Codex",
    `created: ${at.slice(0, 10)}`,
    "tags: [知识整理]",
    `workbench_task: ${task.id}`,
    `workbench_candidate: ${version.id}`,
    `candidate_sha256: ${version.sha256}`,
  ];
  const local = task.evidence.filter((item) => item.root === source.root);
  if (local.some((item) => /[\[\]|#]/.test(item.path)))
    throw failure(
      "来源路径含不能可靠生成 Wiki 引用的字符，未生成保存预览",
      400,
    );
  if (local.length)
    lines.push(
      "source_refs:",
      ...local.map((item) => `  - ${JSON.stringify(`[[${item.path}]]`)}`),
    );
  lines.push(
    "---",
    "",
    `# ${text(candidate.title)}`,
    "",
    "> 待整理候选，尚未采纳为正式知识；不得用作当前有效结论。",
    "",
    "## 综合",
    "",
    `> ${text(candidate.summary)}`,
    "",
    "## 主张与证据",
    "",
  );
  const reference = (ids) =>
    ids
      .map((id) => `E${task.evidence.findIndex((item) => item.id === id) + 1}`)
      .join("、");
  const kinds = {
    source_statement: "来源陈述（尚未独立核实）",
    analysis: "分析判断",
    hypothesis: "待验证假设",
  };
  for (const claim of candidate.claims)
    lines.push(
      `### ${text(claim.id)} · ${kinds[claim.kind]}`,
      "",
      `> ${text(claim.text)}`,
      "",
      `依据：${reference(claim.evidenceIds)}`,
      "",
    );
  for (const [key, title] of [
    ["conflicts", "待核对冲突"],
    ["relations", "关联线索"],
  ]) {
    lines.push(`## ${title}`, "");
    if (!candidate[key].length) lines.push("未列出，不表示已排除。", "");
    for (const item of candidate[key])
      lines.push(
        `> ${text(item.text)}`,
        "",
        `依据：${reference(item.evidenceIds)}`,
        "",
      );
  }
  lines.push(
    "## 未知与边界",
    "",
    ...candidate.unknowns.map((item) => `> ${text(item)}\n`),
  );
  if (!candidate.unknowns.length) lines.push("未列出，不表示没有未知。", "");
  lines.push("## 来源版本", "");
  for (const [index, item] of task.evidence.entries())
    lines.push(
      `### E${index + 1}`,
      "",
      `来源：${text(item.sourceName)}`,
      "",
      `位置：${text(item.root + "/" + item.path)}`,
      "",
      `SHA-256：${item.sha256}`,
      "",
      `读取时间：${item.readAt}`,
      "",
    );
  return lines.join("\n");
}

export function createKnowledgeWriteback(
  repository,
  {
    files,
    writer = createKnowledgeWriteFiles(),
    journal = createKnowledgeWriteJournal(repository.directory),
    clock = Date.now,
    settings,
  },
) {
  const previews = new Map();
  const stamp = () => new Date(clock()).toISOString();
  function sourceOf(state, id) {
    const source = state.connections?.knowledgeSources?.find(
      (value) => value.id === id,
    );
    if (!source || source.kind !== "obsidian")
      throw failure("请选择已连接的 Obsidian 知识库", 409);
    return {
      id: source.id,
      root: source.root,
      identity: source.identity,
      generation: source.generation,
    };
  }
  function authorized(state, source) {
    const current = sourceOf(state, source.id);
    if (JSON.stringify(current) !== JSON.stringify(source))
      throw failure("保存目标授权已变化，请重新连接并预览", 409);
  }
  async function authorizeVault(state,source,plan){
    if(!settings)throw failure('Vault 写入默认关闭，请先在设置授权',409);
    const gate=await settings.assertEnabled('vault');authorized(state,source);
    if(gate.options.sourceId!==source.id)throw failure('候选写入须使用当前明确授权的Vault来源',409);
    const optionsHash=knowledgeTextHash(JSON.stringify(gate.options));
    if(plan&&(clock()>=plan.expires||gate.generation!==plan.authorizationGeneration||optionsHash!==plan.authorizationOptionsHash))throw failure('Vault授权代次或范围已变化，请重新预览',409);
    return{authorizationGeneration:gate.generation,authorizationOptionsHash:optionsHash};
  }
  function chosen(state, taskId, versionId) {
    const task = state.knowledgeTasks?.find((item) => item.id === taskId);
    const version = task?.candidates.find((item) => item.id === versionId);
    if (!task || task.archived || !version)
      throw failure("候选不可保存，任务已归档或版本不存在", 409);
    validateCandidate(version.candidate, task);
    assertEvidenceAuthorization(state, task.evidence);
    return { task, version };
  }
  async function evidence(task) {
    for (const item of task.evidence) {
      const document = await files.read(
        { id: item.sourceId, generation: item.generation, root: item.root, identity: item.identity },
        {
          path: item.path,
          bytes: item.bytes,
          modifiedAt: item.modifiedAt,
          fingerprint: item.fingerprint,
        },
      );
      if (document.sha256 !== item.sha256)
        throw failure("来源已变化，请重新整理后再保存", 409);
    }
  }
  function remember(plan) {
    for (const [key, value] of previews)
      if (clock() >= value.expires) previews.delete(key);
    if (previews.size >= 30) previews.delete(previews.keys().next().value);
    const previewId = randomUUID();
    previews.set(previewId, { ...plan, expires: clock() + 300000 });
    return { previewId, expiresAt: new Date(clock() + 300000).toISOString() };
  }
  function consume(input, kind) {
    exact(input, ["previewId", "confirmed"]);
    identifier(input.previewId);
    if (input.confirmed !== true)
      throw failure("请审阅精确目标与全文并确认本次操作");
    const plan = previews.get(input.previewId);
    previews.delete(input.previewId);
    if (!plan || plan.kind !== kind || clock() >= plan.expires)
      throw failure("预览已失效，请先核对历史，再重新预览", 409);
    return plan;
  }
  async function operation(id) {
    identifier(id);
    const record = await journal.get(id);
    if (!record) throw failure("保存记录不存在", 404);
    return record;
  }
  async function observe(record, state) {
    const { row, applied, rollbackStarted, rolledBack } = record;
    let status = "unknown",
      current = null;
    try {
      await authorizeVault(state,row.source);
      current = await writer.inspect(row.source, row.path);
      if (!current) {
        const absent = await writer.preview(row.source, row.path);
        status =
          absent.parentIdentity !== row.parentIdentity
            ? "changed"
            : rolledBack || rollbackStarted
              ? "rolled_back"
              : applied
                ? "missing"
                : "not_applied";
      } else if (rolledBack) status = "changed";
      else if (
        current.sha256 === row.sha256 &&
        current.parentIdentity === row.parentIdentity
      )
        status =
          applied && current.fingerprint === applied.fingerprint
            ? "applied"
            : "matching_unverified";
      else status = "changed";
    } catch {
      status = "unavailable";
    }
    return {
      id: row.id,
      taskId: row.taskId,
      versionId: row.versionId,
      path: row.path,
      root: row.source.root,
      createdAt: row.createdAt,
      sha256: row.sha256,
      status,
      content: row.content,
      canRollback: status === "applied" && !rollbackStarted,
      recoveryOnly: !applied,
      checkedAt: stamp(),
    };
  }
  async function noPendingTarget(source, path) {
    const rows = await journal.list();
    if (
      rows.some(
        ({ row, applied, rollbackStarted, rolledBack }) =>
          row.source.root === source.root &&
          row.path === path &&
          (!applied || (rollbackStarted && !rolledBack)),
      )
    )
      throw failure("此位置有未决操作，请先核对记录，不要重复保存", 409);
  }
  return {
    async preview(input) {
      exact(input, [
        "taskId",
        "versionId",
        "targetSourceId",
        "domain",
        "filename",
      ]);
      identifier(input.taskId);
      identifier(input.versionId);
      identifier(input.targetSourceId);
      const path = candidatePath(input.domain, input.filename);
      const captured = await repository.withSnapshot({}, async (state) => {
        const { task } = chosen(state, input.taskId, input.versionId);
        const source = sourceOf(state, input.targetSourceId);
        const authorization = await authorizeVault(state, source);
        return { task, source, authorization, revision: state.revision };
      });
      // Policy reads can persist source revocation through the repository queue.
      // Keep them outside that queue, then revalidate the captured revision.
      await evidence(captured.task);
      return repository.withSnapshot({ expectedRevision: captured.revision }, async (state) => {
        const { task, version } = chosen(state, input.taskId, input.versionId);
        const { source, authorization } = captured;
        await authorizeVault(state, source, { ...authorization, expires: Infinity });
        await noPendingTarget(source, path);
        const target = await writer.preview(source, path);
        const createdAt = stamp(),
          content = render(task, version, source, input.domain, createdAt);
        const row = {
          schema: 1,
          id: randomUUID(),
          taskId: task.id,
          versionId: version.id,
          versionHash: version.sha256,
          source,
          ...target,
          domain: input.domain,
          filename: input.filename,
          content,
          sha256: knowledgeTextHash(content),
          createdAt,
        };
        return {
          ...remember({ kind: "apply", row, ...authorization }),
          operationId: row.id,
          path,
          root: source.root,
          content,
          sha256: row.sha256,
          crossSource: task.evidence.some((item) => item.root !== source.root),
        };
      });
    },
    async apply(input) {
      const plan = consume(input, "apply"),
        { row } = plan;
      const captured = await repository.withSnapshot({}, async (state) => {
        const { task, version } = chosen(state, row.taskId, row.versionId);
        if (version.sha256 !== row.versionHash)
          throw failure("候选版本已变化", 409);
        await authorizeVault(state, row.source, plan);
        return { task, revision: state.revision };
      });
      await evidence(captured.task);
      const written = await repository.withSnapshot({ expectedRevision: captured.revision }, async (state) => {
        chosen(state, row.taskId, row.versionId);
        await authorizeVault(state, row.source, plan);
        await noPendingTarget(row.source, row.path);
        const target = await writer.preview(row.source, row.path);
        if (
          target.parentIdentity !== row.parentIdentity ||
          clock() >= plan.expires
        )
          throw failure("预览已失效，请重新预览", 409);
        await journal.prepare(row);
        if (clock() >= plan.expires)
          throw failure("持久化准备期间预览过期，请核对记录；未写入候选", 409);
        return writer.create(row.source, target, row.content,{guard:()=>authorizeVault(state,row.source,plan)});
      });
      try {
        await evidence(captured.task);
      } catch {
        throw failure(
          "候选已写入但来源复核失败，请先核对记录；未认定保存成功",
          503,
        );
      }
      // 文件已经写进去了，回执只记这个事实：不再比主库版本、不再看预览过期和候选状态。
      // 否则这段时间里别处提交一次主库、或预览刚好到期，就会留下一条解不开的未决记录。
      return repository.withSnapshot({}, async (state) => {
        await journal.receipt(row.id, "applied", stamp(), written.fingerprint);
        const result = await observe(await operation(row.id), state);
        if (result.status !== "applied")
          throw failure("候选已写入，结果待核对，请检查操作记录", 503);
        return result;
      });
    },
    async history(input) {
      exact(input, ["taskId"]);
      identifier(input.taskId);
      return repository.withSnapshot({}, async (state) => ({
        items: await Promise.all(
          (await journal.list())
            .filter(({ row }) => row.taskId === input.taskId)
            .map((record) => observe(record, state)),
        ),
      }));
    },
    async check(input) {
      exact(input, ["operationId"]);
      identifier(input.operationId);
      return repository.withSnapshot({}, async (state) =>
        observe(await operation(input.operationId), state),
      );
    },
    async "rollback-preview"(input) {
      exact(input, ["operationId"]);
      identifier(input.operationId);
      return repository.withSnapshot({}, async (state) => {
        const record = await operation(input.operationId);
        const authorization=await authorizeVault(state,record.row.source);
        const result = await observe(record, state);
        if (!result.canRollback)
          throw failure(
            "文件已变化、归属不明或存在未决撤回，不能自动撤回",
            409,
          );
        const expected = await writer.inspect(
          record.row.source,
          record.row.path,
        );
        if (expected?.fingerprint !== record.applied.fingerprint)
          throw failure("文件已变化，请重新核对", 409);
        return {
          ...result,
          ...remember({
            kind: "rollback",
            ...authorization,
            operationId: record.row.id,
            expected,
          }),
        };
      });
    },
    async rollback(input) {
      const plan = consume(input, "rollback");
      return repository.withSnapshot({}, async (state) => {
        const record = await operation(plan.operationId);
        await authorizeVault(state,record.row.source,plan);
        const result = await observe(record, state);
        if (!result.canRollback || clock() >= plan.expires)
          throw failure("撤回预览已失效，请重新核对", 409);
        await journal.receipt(
          record.row.id,
          "rollback-started",
          stamp(),
          plan.expected.fingerprint,
        );
        if (clock() >= plan.expires)
          throw failure("撤回准备期间预览过期，请核对记录；未删除候选", 409);
        await writer.remove(record.row.source, plan.expected,{guard:()=>authorizeVault(state,record.row.source,plan)});
        await journal.receipt(
          record.row.id,
          "rolled-back",
          stamp(),
          plan.expected.fingerprint,
        );
        const final = await observe(await operation(record.row.id), state);
        if (final.status !== "rolled_back")
          throw failure("撤回结果待核对，请检查记录", 503);
        return final;
      });
    },
  };
}
