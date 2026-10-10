import { weekStart } from "../src/knowledge-zones.js";
import { randomUUID } from "node:crypto";
import { failure } from "./repository.mjs";
import {
  inside,
  selectedProfileSource,
  knowledgeSources,
  policyKey,
  revokeOverlaps,
  pendingIdentityOverlap,
  validateExcluded,
} from "./knowledge-access-policy.mjs";

const TTL = 600000;
const SPACE_SCAN_MS = 15000;
const DEFAULT = Object.freeze({
  maxEntries: 5000,
  maxMetadataFiles: 2000,
  maxScanMs: 5000,
  maxFiles: 100,
  maxBytes: 4 * 1024 * 1024,
  maxMs: 2000,
});
const compare = (a, b) => (a < b ? -1 : a > b ? 1 : 0);
function shape(value, required, optional = []) {
  if (
    !value ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    required.some((k) => !Object.hasOwn(value, k)) ||
    Object.keys(value).some((k) => ![...required, ...optional].includes(k))
  )
    throw failure("知识请求字段无效");
}
function notePath(path) {
  if (
    typeof path !== "string" ||
    !path ||
    path.length > 2000 ||
    /[\\:\x00-\x1f\x7f-\x9f]/.test(path) ||
    !/\.md$/i.test(path) ||
    path.split("/").some((p) => !p || p.startsWith(".") || p !== p.trim())
  )
    throw failure("原文应为可见的来源内 Markdown 相对路径");
}
function snippets(content, pattern) {
  const result = [];
  for (const [index, line] of content.split(/\r\n|\r|\n/).entries()) {
    if (result.length >= 3) break;
    const match = pattern.exec(line);
    if (!match) continue;
    const start = Math.max(0, Math.min(match.index - 100, line.length - 300));
    result.push({
      line: index + 1,
      text: line.slice(start, start + 300),
      matchStart: match.index - start,
      matchEnd: match.index - start + match[0].length,
    });
  }
  return result;
}
export function createKnowledgeAccess(
  repository,
  { files, clock = Date.now, limits: requested = {} },
) {
  if (
    Object.entries(requested).some(
      ([k, v]) =>
        !Object.hasOwn(DEFAULT, k) ||
        !Number.isSafeInteger(v) ||
        v < 1 ||
        v > DEFAULT[k],
    )
  )
    throw failure("统一查询预算无效，不能扩大边界");
  const limits = { ...DEFAULT, ...requested },
    cursors = new Map();
  let busy = false;
  const options = (audience) => ({ excludeProfile: audience === "agent" });
  async function snapshot() {
    return repository.withSnapshot({}, (s) => s);
  }
  async function assertScope(key) {
    if (policyKey(await snapshot()) !== key) {
      const e = failure("知识授权或范围已变化，请重新查询", 409);
      e.globalScope = true;
      throw e;
    }
  }
  const eligible = (state, audience) =>
    knowledgeSources(state)
      .filter((s) => audience !== "agent" || s.agentSharing === true)
      .sort((a, b) => compare(a.id, b.id));
  return {
    async setPolicy(input) {
      shape(input, [
        "sourceId",
        "agentSharing",
        "excludedFolders",
        "confirmed",
        "expectedRevision",
      ]);
      if (
        typeof input.sourceId !== "string" ||
        typeof input.agentSharing !== "boolean" ||
        input.confirmed !== true ||
        !Number.isSafeInteger(input.expectedRevision) ||
        input.expectedRevision < 0
      )
        throw failure("请明确确认知识范围并刷新主库版本");
      const excludedFolders = validateExcluded(input.excludedFolders);
      return repository.updateKnowledgeAccess(
        (state) => {
          const source = knowledgeSources(state).find(
            (s) => s.id === input.sourceId,
          );
          if (!source) throw failure("知识源已断开，请刷新", 404);
          if (source.kind === "feishu" && (source.feishuSpaceId === null || !source.feishuVerifiedAt || !source.feishuPrincipalHash))
            throw failure("飞书范围尚未核验，不能开放给 Agent", 409);
          if (source.kind === "feishu" && excludedFolders.length)
            throw failure("飞书请选用更小的 Wiki 节点范围；本机排除文件夹不适用", 400);
          if (input.agentSharing && pendingIdentityOverlap(state, source))
            throw failure("知识目录需重新确认后才能开放给 Agent", 409);
          const changed =
            JSON.stringify(source.excludedFolders || []) !==
            JSON.stringify(excludedFolders);
          const target = {
            ...source,
            agentSharing: input.agentSharing,
            excludedFolders,
            generation: randomUUID(),
          };
          return {
            ...(changed
              ? revokeOverlaps(state, [source.root], {
                  targetId: source.id,
                  target,
                })
              : {
                  connections: {
                    ...state.connections,
                    knowledgeSources: knowledgeSources(state).map((s) =>
                      s.id === source.id ? target : s,
                    ),
                  },
                }),
            ...(state.knowledgeZones &&
            selectedProfileSource(state) &&
            JSON.stringify(source.excludedFolders || []) !==
              JSON.stringify(excludedFolders) &&
            (inside(selectedProfileSource(state).root, source.root) ||
              inside(source.root, selectedProfileSource(state).root))
              ? {
                  knowledgeZones: {
                    ...state.knowledgeZones,
                    profileSharing: false,
                  },
                }
              : {}),
          };
        },
        { expectedRevision: input.expectedRevision },
      );
    },
    async readNote(input, { audience = "agent" } = {}) {
      shape(input, ["sourceId", "path", "expectedSha256"], ["maxChars"]);
      notePath(input.path);
      const charLimit = audience === "user" ? 256 * 1024 : 16000,
        maxChars = input.maxChars ?? charLimit;
      if (
        typeof input.sourceId !== "string" ||
        !/^[a-f0-9]{64}$/.test(input.expectedSha256 || "") ||
        !Number.isSafeInteger(maxChars) ||
        maxChars < 1 ||
        maxChars > charLimit
      )
        throw failure("原文身份、哈希或字数上限无效");
      const state = await snapshot(),
        key = policyKey(state),
        source = eligible(state, audience).find((s) => s.id === input.sourceId);
      if (!source) throw failure("该知识源尚未开放或已断开", 403);
      const { document } = await files.current(
        source,
        input.path,
        options(audience),
      );
      await assertScope(key);
      if (document.sha256 !== input.expectedSha256)
        throw failure("原文已变化，请重新检索", 409);
      if (document.content.length > maxChars)
        throw failure("原文超过本次字数上限，请在源知识库中查看完整原文", 413);
      return {
        sourceId: source.id,
        sourceName: source.name,
        path: document.path,
        content: document.content,
        sha256: document.sha256,
        modifiedAt: document.modifiedAt,
        bytes: document.bytes,
        readAt: new Date(clock()).toISOString(),
        ...(audience === "user" ? { root: source.root } : {}),
      };
    },
    async searchAll(input, { audience = "agent" } = {}) {
      shape(input, ["query"], ["limit", "cursor"]);
      if (
        typeof input.query !== "string" ||
        !input.query.trim() ||
        input.query.trim().length > 100 ||
        /[\x00-\x1f\x7f-\x9f\u2028\u2029]/.test(input.query)
      )
        throw failure("请输入1–100字符的单行短语");
      const limit = input.limit ?? 50;
      if (
        !Number.isSafeInteger(limit) ||
        limit < 1 ||
        limit > 50 ||
        (input.cursor !== undefined &&
          (typeof input.cursor !== "string" || input.cursor.length > 100))
      )
        throw failure("查询上限或游标无效");
      if (busy) throw failure("另一个统一查询正在进行，请稍后重试", 429);
      busy = true;
      try {
        const query = input.query.trim();
        for (const [id, c] of cursors)
          if (c.expires <= clock()) cursors.delete(id);
        let captured;
        if (input.cursor) {
          captured = cursors.get(input.cursor);
          if (
            !captured ||
            captured.audience !== audience ||
            captured.query !== query
          )
            throw failure("统一查询游标已失效，请重新检索", 409);
          await assertScope(captured.key);
          cursors.delete(input.cursor);
        } else {
          const state = await snapshot();
          captured = {
            key: policyKey(state),
            query,
            audience,
            expires: clock() + TTL,
            tasks: eligible(state, audience).map((source) => ({
              source,
              files: null,
              index: 0,
              scanStatus: "unsearched",
              issues: false,
              failed: false,
              attempted: 0,
              read: 0,
            })),
          };
        }
        await assertScope(captured.key);
        const scanStart = clock();
        const scanBudgetMs = requested.maxScanMs === undefined &&
          captured.tasks.some((task) => task.source.root.startsWith("feishu://space/"))
          ? SPACE_SCAN_MS : limits.maxScanMs;
        let entries = 0,
          metadataFiles = 0,
          scanStop = null;
        const sharedBudget = {
          takeEntry() {
            if (clock() - scanStart >= scanBudgetMs) {
              scanStop = "scan_time_limit";
              return false;
            }
            if (entries >= limits.maxEntries) {
              scanStop = "entry_limit";
              return false;
            }
            entries++;
            return true;
          },
          takeFile() {
            if (metadataFiles >= limits.maxMetadataFiles) {
              scanStop = "metadata_file_limit";
              return false;
            }
            metadataFiles++;
            return true;
          },
        };
        let scanIndex = 0;
        async function scanWorker() {
          while (scanIndex < captured.tasks.length) {
            const task = captured.tasks[scanIndex++];
            if (task.files !== null || task.failed) continue;
            if (scanStop) {
              task.scanStatus = "unsearched";
              continue;
            }
            try {
              await assertScope(captured.key);
              const scan = await files.scan(
                task.source,
                { sharedBudget },
                options(audience),
              );
              await assertScope(captured.key);
              task.files = scan.files.sort((a, b) => compare(a.path, b.path));
              task.scanStatus = scan.status;
              task.issues = scan.status !== "complete";
            } catch (e) {
              if (e.globalScope) throw e;
              await assertScope(captured.key);
              task.failed = true;
              if (e.code === "KNOWLEDGE_ROOT_IDENTITY_CHANGED" || /^FEISHU_[A-Z_]+$/.test(e.code || "")) task.code = e.code;
              task.message = e.code === "KNOWLEDGE_ROOT_IDENTITY_CHANGED" ? "知识目录身份变化，需重新确认目录"
                : task.source.kind === "feishu" ? e.message
                : e.status === 403 ? "来源权限不足，无法安全扫描"
                : e.status === 404 ? "来源目录不存在或不可读"
                : "该来源无法安全扫描，请核对目录或权限";
            }
          }
        }
        const scanJobs = await Promise.allSettled([scanWorker(), scanWorker()]);
        const scanFailure = scanJobs.find((r) => r.status === "rejected");
        if (scanFailure) throw scanFailure.reason;
        const started = clock(),
          results = [];
        let attempted = 0,
          bytes = 0,
          stopReason = scanStop;
        const pattern = new RegExp(
          query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"),
          "iu",
        );
        // Select an ordered window before I/O. Result slots are reserved by its
        // size, so no hit is clipped or advanced past a page's limit.
        while (results.length < limit) {
          if (clock() - started >= limits.maxMs) {
            stopReason = "time_limit";
            break;
          }
          if (attempted >= limits.maxFiles) {
            stopReason = "file_limit";
            break;
          }
          const candidates = [];
          const window = Math.min(2, limit - results.length);
          for (const task of captured.tasks) {
            if (task.failed || !task.files || task.index >= task.files.length)
              continue;
            candidates.push({
              task,
              entry: task.files[task.index],
              index: task.index,
            });
            if (candidates.length >= window) break;
          }
          if (candidates.length === 1 && window === 2) {
            const { task, index } = candidates[0];
            if (index + 1 < task.files.length)
              candidates.push({
                task,
                entry: task.files[index + 1],
                index: index + 1,
              });
          }
          if (!candidates.length) break;
          const jobs = [];
          for (const job of candidates) {
            if (attempted >= limits.maxFiles) {
              stopReason = "file_limit";
              break;
            }
            if (clock() - started >= limits.maxMs) {
              stopReason = "time_limit";
              break;
            }
            if (job.entry.bytes > 256 * 1024) {
              attempted++;
              job.task.attempted++;
              jobs.push({ ...job, skip: true });
              continue;
            }
            if (bytes + job.entry.bytes > limits.maxBytes) {
              stopReason = "byte_limit";
              break;
            }
            attempted++;
            bytes += job.entry.bytes;
            job.task.attempted++;
            jobs.push(job);
          }
          if (!jobs.length) {
            if (stopReason) break;
            continue;
          }
          const readJobs = await Promise.allSettled(
            jobs.map(async (job) => {
              if (job.skip)
                return { job, error: failure("单篇超过读取上限", 413) };
              try {
                await assertScope(captured.key);
                const doc = await files.read(
                  job.task.source,
                  job.entry,
                  options(audience),
                );
                await assertScope(captured.key);
                return { job, doc };
              } catch (e) {
                if (e.globalScope) throw e;
                await assertScope(captured.key);
                return { job, error: e };
              }
            }),
          );
          const readFailure = readJobs.find((r) => r.status === "rejected");
          if (readFailure) throw readFailure.reason;
          const readResults = readJobs.map((r) => r.value);
          for (const { job, doc, error } of readResults) {
            const task = job.task;
            if (task.failed) continue;
            if (error) {
              task.index = job.index + 1;
              if (
                error.scope === "source" ||
                [403, 409].includes(error.status) ||
                (task.source.kind === "feishu" && error.status !== 413)
              ) {
                task.failed = true;
                if (error.code === "KNOWLEDGE_ROOT_IDENTITY_CHANGED" || /^FEISHU_[A-Z_]+$/.test(error.code || "")) task.code = error.code;
                task.message = error.code === "KNOWLEDGE_ROOT_IDENTITY_CHANGED" ? "知识目录身份变化，需重新确认目录"
                  : task.source.kind === "feishu" ? error.message
                  : error.status === 403 ? "来源权限不足，无法读取"
                  : error.status === 404 ? "来源文件不存在，需重新扫描"
                  : "该来源文件或目录已变化，请重新扫描后查询";
                for (let i = results.length - 1; i >= 0; i--)
                  if (results[i].sourceId === task.source.id)
                    results.splice(i, 1);
              } else task.issues = true;
              continue;
            }
            task.read++;
            const found = snippets(doc.content, pattern);
            if (found.length) {
              const row = {
                sourceId: task.source.id,
                sourceName: task.source.name,
                sourceKind: task.source.kind,
                title: job.entry.title || job.entry.path.split("/").at(-1).replace(/\.md$/i, ""),
                ...(job.entry.displayPath ? { displayPath: job.entry.displayPath } : {}),
                path: job.entry.path,
                sha256: doc.sha256,
                modifiedAt: doc.modifiedAt,
                bytes: doc.bytes,
                snippets: found,
              };
              if (
                Buffer.byteLength(JSON.stringify([...results, row])) >
                192 * 1024
              ) {
                stopReason = "output_limit";
                break;
              }
              results.push(row);
            }
            task.index = job.index + 1;
          }
          if (
            stopReason &&
            ["byte_limit", "file_limit", "time_limit", "output_limit"].includes(
              stopReason,
            )
          )
            break;
        }
        if (
          results.length >= limit &&
          captured.tasks.some(
            (t) => !t.failed && t.files && t.index < t.files.length,
          )
        )
          stopReason = "result_limit";
        let verifyIndex = 0;
        async function verifyWorker() {
          while (verifyIndex < captured.tasks.length) {
            const task = captured.tasks[verifyIndex++];
            if (task.failed || !task.files) continue;
            try {
              const current = await (files.verifyRoot ? files.verifyRoot(task.source) : files.inspectRoot(task.source.root));
              if (current.root !== task.source.root || current.identity !== task.source.identity) throw failure("目录身份已变化", 409);
            } catch (error) {
              task.failed = true;
              if (error.code === "KNOWLEDGE_ROOT_IDENTITY_CHANGED" || /^FEISHU_[A-Z_]+$/.test(error.code || "")) task.code = error.code;
              task.message = error.code === "KNOWLEDGE_ROOT_IDENTITY_CHANGED" ? "知识目录身份变化，需重新确认目录"
                : task.source.kind === "feishu" ? error.message
                : error.status === 403 ? "结果返回前目录权限不足"
                : error.status === 404 ? "结果返回前目录不存在"
                : "结果返回前目录无法核验，请重新扫描";
              for (let i = results.length - 1; i >= 0; i--)
                if (results[i].sourceId === task.source.id)
                  results.splice(i, 1);
            }
          }
        }
        await Promise.all([verifyWorker(), verifyWorker()]);
        await assertScope(captured.key);
        const coverage = captured.tasks.map((t) => ({
          sourceId: t.source.id,
          sourceName: t.source.name,
          status: t.failed
            ? "failed"
            : t.files === null || (t.files.length > 0 && t.attempted === 0)
              ? "unsearched"
              : t.scanStatus === "complete" &&
                  t.index >= t.files.length &&
                  !t.issues
                ? "complete"
                : "partial",
          scanStatus: t.scanStatus,
          scanned: t.files?.length ?? 0,
          updatedThisWeek: (t.files || []).filter(
            (f) =>
              Date.parse(f.modifiedAt) >= weekStart(clock()) &&
              Date.parse(f.modifiedAt) <= clock(),
          ).length,
          weeklyKnown: t.files !== null && t.scanStatus === "complete" &&
            t.files.every((f) => f.modifiedAt && Number.isFinite(Date.parse(f.modifiedAt))),
          attempted: t.attempted,
          read: t.read,
          stopReason:
            t.scanStatus === "partial"
              ? "scan_partial"
              : t.files === null
                ? scanStop
                : t.index < (t.files?.length ?? 0)
                  ? stopReason
                  : t.issues
                    ? "file_issues"
                    : null,
          ...(t.message ? { message: t.message } : {}),
          ...(t.code ? { code: t.code } : {}),
        }));
        let nextCursor = null;
        if (
          captured.tasks.some(
            (t) => !t.failed && t.files && t.index < t.files.length,
          )
        ) {
          nextCursor = randomUUID();
          if (cursors.size >= 20) cursors.delete(cursors.keys().next().value);
          cursors.set(nextCursor, captured);
        }
        const result = {
          query,
          status: coverage.every((c) => c.status === "complete")
            ? "complete"
            : "partial",
          totalSources: coverage.length,
          searchedSources: coverage.filter((c) =>
            ["complete", "partial"].includes(c.status),
          ).length,
          results: results.sort(
            (a, b) =>
              compare(a.sourceId, b.sourceId) || compare(a.path, b.path),
          ),
          coverage,
          budget: { attempted, bytes, results: results.length, stopReason },
          nextCursor,
          expiresAt: new Date(captured.expires).toISOString(),
          at: new Date(clock()).toISOString(),
        };
        if (Buffer.byteLength(JSON.stringify(result)) > 240 * 1024)
          throw failure("统一查询输出超过安全上限，请缩小本次返回数量", 413);
        return result;
      } finally {
        busy = false;
      }
    },
  };
}
