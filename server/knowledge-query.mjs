import { failure } from "./repository.mjs";

const DEFAULT_LIMITS = Object.freeze({
  maxFiles: 100,
  maxBytes: 4 * 1024 * 1024,
  maxMs: 2000,
  maxResults: 50,
});

export function createKnowledgeQuery({
  files,
  clock = Date.now,
  limits: requested = {},
}) {
  if (
    !requested ||
    typeof requested !== "object" ||
    Array.isArray(requested) ||
    Object.entries(requested).some(
      ([key, value]) =>
        !Object.hasOwn(DEFAULT_LIMITS, key) ||
        !Number.isSafeInteger(value) ||
        value < 1 ||
        value > DEFAULT_LIMITS[key],
    )
  )
    throw failure("正文查询预算无效，不能扩大读取边界", 400);
  const limits = { ...DEFAULT_LIMITS, ...requested };
  let busy = false;
  async function verifyRoot(source) {
    let current;
    try {
      current = await files.inspectRoot(source.root);
    } catch (error) {
      throw failure(
        "无法核验知识目录，请重新确认连接",
        [400, 403, 404, 409, 503].includes(error?.status) ? error.status : 503,
      );
    }
    if (current.root !== source.root || current.identity !== source.identity)
      throw failure("知识目录身份已变化，请重新确认连接", 409);
  }
  return {
    async search({ source, entries, query, offset, assertCurrent }) {
      if (
        typeof query !== "string" ||
        /[\x00-\x1f\x7f-\x9f\u2028\u2029]/.test(query) ||
        !query.trim() ||
        query.trim().length > 100
      )
        throw failure("请输入 1–100 字符的单行正文关键词", 400);
      if (
        !Number.isSafeInteger(offset) ||
        offset < 0 ||
        offset > entries.length ||
        (entries.length && offset === entries.length)
      )
        throw failure("查询位置已无效，请重新查询", 400);
      if (busy) throw failure("另一个正文查询正在读取，请稍后重试", 429);
      busy = true;
      try {
        query = query.trim();
        const started = clock();
        await assertCurrent();
        await verifyRoot(source);
        const results = [];
        const issues = [];
        const pattern = new RegExp(
          query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"),
          "iu",
        );
        let bytes = 0;
        let attempted = 0,
          read = 0,
          nextOffset = offset,
          stopReason = null;
        for (const entry of entries.slice(offset)) {
          if (clock() - started >= limits.maxMs) {
            stopReason = "time_limit";
            break;
          }
          if (attempted >= limits.maxFiles) {
            stopReason = "file_limit";
            break;
          }
          if (results.length >= limits.maxResults) {
            stopReason = "result_limit";
            break;
          }
          if (entry.bytes > Math.min(256 * 1024, limits.maxBytes)) {
            attempted++;
            nextOffset++;
            issues.push({
              path: entry.path,
              message: "文件超过单篇或整批读取预算，已跳过",
            });
            continue;
          }
          if (bytes + entry.bytes > limits.maxBytes) {
            stopReason = "byte_limit";
            break;
          }
          await assertCurrent();
          if (clock() - started >= limits.maxMs) {
            stopReason = "time_limit";
            break;
          }
          attempted++;
          nextOffset++;
          bytes += entry.bytes;
          let original, readError;
          try {
            original = await files.read(source, entry);
          } catch (error) {
            readError = error;
          }
          await assertCurrent();
          if (readError) {
            if (
              readError.scope === "source" ||
              [403, 409].includes(readError.status)
            )
              throw failure(
                "文件或目录不再安全可读，请重新确认连接并扫描后查询",
                409,
              );
            issues.push({
              path: entry.path,
              message: "文件无法安全读取，已跳过；请检查编码、权限或重新扫描",
            });
            continue;
          }
          read++;
          const snippets = [];
          original.content.split(/\r\n|\r|\n/).forEach((line, index) => {
            if (snippets.length >= 3) return;
            const match = pattern.exec(line);
            if (!match) return;
            const start = Math.max(
              0,
              Math.min(match.index - 100, line.length - 300),
            );
            const text = line.slice(start, start + 300);
            snippets.push({
              line: index + 1,
              text,
              matchStart: match.index - start,
              matchEnd: match.index - start + match[0].length,
            });
          });
          if (snippets.length)
            results.push({
              path: entry.path,
              sha256: original.sha256,
              modifiedAt: original.modifiedAt,
              bytes: original.bytes,
              snippets,
            });
        }
        if (nextOffset >= entries.length) nextOffset = null;
        await verifyRoot(source);
        await assertCurrent();
        return {
          query,
          offset,
          nextOffset,
          total: entries.length,
          attempted,
          read,
          bytes,
          status:
            nextOffset === null && !issues.length ? "complete" : "partial",
          stopReason,
          results,
          issues,
          at: new Date(clock()).toISOString(),
        };
      } finally {
        busy = false;
      }
    },
  };
}
