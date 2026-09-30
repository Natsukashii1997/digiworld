import * as filesystem from "node:fs/promises";
import { createHash } from "node:crypto";
import { resolve, join } from "node:path";
import { homedir } from "node:os";
import { constants } from "node:fs";

class KnowledgeFileError extends Error {
  constructor(message, status = 403) {
    super(message);
    this.status = status;
  }
}
const fail = (message, status) => new KnowledgeFileError(message, status);
function sanitized(error) {
  if (error instanceof KnowledgeFileError) return error;
  if (["ENOENT", "ENOTDIR"].includes(error?.code))
    return fail("来源不存在，请检查目录或重新扫描", 404);
  if (["EACCES", "EPERM", "ELOOP"].includes(error?.code))
    return fail("无权安全读取来源，请检查目录权限", 403);
  return fail("暂时无法核验来源，请重新扫描", 503);
}
function ordinaryDirectory(info) {
  if (info.isSymbolicLink() || !info.isDirectory())
    throw fail("知识路径必须是真实目录，不能经过链接或特殊文件");
}
function ordinaryFile(info) {
  if (info.isSymbolicLink() || !info.isFile() || info.nlink !== 1)
    throw fail("仅允许普通单链接 Markdown 文件，已跳过链接或特殊文件");
}
const excluded = (name) =>
  name.startsWith(".") ||
  /^(?:node_modules|vendor|dist|build|target|cache|caches|keychains|secrets?|credentials?|tokens?|passwords?|private[-_]?keys?)(?:[._-]|$)/i.test(
    name,
  ) ||
  name.toLowerCase().endsWith(".app");
function rootPath(value) {
  if (
    typeof value !== "string" ||
    !value.startsWith("/") ||
    value.length > 2000 ||
    /[\\:\x00-\x1f\x7f]/.test(value) ||
    value.split("/").some((part) => part === "." || part === "..")
  )
    throw fail("请输入不含越界片段的知识目录绝对路径", 400);
  const root = resolve(value);
  const broad = new Set([
    "/",
    "/Users",
    "/home",
    "/Volumes",
    "/tmp",
    "/private",
    "/private/tmp",
    "/var",
    "/private/var",
    "/var/folders",
    "/private/var/folders",
    homedir(),
    ...["Documents", "Desktop", "Downloads", "Library"].map((name) =>
      join(homedir(), name),
    ),
  ]);
  if (
    [...broad].some((value) => value.toLowerCase() === root.toLowerCase()) ||
    /^\/(?:Volumes|mnt)\/[^/]+$/i.test(root) ||
    /^\/(?:Users|home)\/[^/]+(?:\/(?:Documents|Desktop|Downloads|Library))?$/i.test(
      root,
    ) ||
    /^\/(?:System|Library|Applications|bin|sbin|usr|etc|dev|proc|sys|run)(?:\/|$)/i.test(
      root,
    ) ||
    /^\/(?:private\/)?(?:etc|var\/(?:log|db|run|root|cache))(?:\/|$)/i.test(
      root,
    ) ||
    root.split("/").filter(Boolean).some(excluded)
  )
    throw fail("请选择具体知识目录；不能连接宽泛、隐藏、依赖、秘密或系统目录");
  return root;
}
function documentPath(value) {
  if (
    typeof value !== "string" ||
    value.length > 1000 ||
    !/\.md$/i.test(value) ||
    /[\\:\x00-\x1f\x7f]/.test(value) ||
    value.split("/").some((part) => !part || excluded(part))
  )
    throw fail("请选择知识目录内可见且非秘密文件的 Markdown 相对路径", 400);
  return value;
}

const hash = (value) => createHash("sha256").update(value).digest("hex");
const directoryIdentity = (root, info) =>
  hash(JSON.stringify([root, info.dev, info.ino, info.birthtimeMs]));
const fileIdentity = (info) =>
  JSON.stringify([
    info.dev,
    info.ino,
    info.birthtimeMs,
    info.size,
    info.mtimeMs,
    info.ctimeMs,
    info.mode,
    info.nlink,
    info.uid,
    info.gid,
  ]);
const fingerprint = (path, chain, info) =>
  hash(JSON.stringify([path, chain, fileIdentity(info)]));
const DEFAULT_LIMITS = Object.freeze({
  maxEntries: 5000,
  maxFiles: 2000,
  maxDepth: 8,
  maxMs: 5000,
  maxBytes: 256 * 1024,
});

export function createKnowledgeFiles({
  fs = filesystem,
  clock = Date.now,
  limits: requested = {},
} = {}) {
  if (
    !requested ||
    typeof requested !== "object" ||
    Array.isArray(requested) ||
    Object.entries(requested).some(
      ([key, value]) =>
        !Object.hasOwn(DEFAULT_LIMITS, key) ||
        !Number.isSafeInteger(value) ||
        value < 0 ||
        value > DEFAULT_LIMITS[key],
    )
  )
    throw fail("知识访问限制无效，不能扩大读取边界", 400);
  const limits = Object.freeze({ ...DEFAULT_LIMITS, ...requested });
  async function inspectRoot(path) {
    path = rootPath(path);
    try {
      const before = await fs.lstat(path);
      ordinaryDirectory(before);
      const root = rootPath(await fs.realpath(path));
      const after = await fs.lstat(path);
      ordinaryDirectory(after);
      const identity = directoryIdentity(root, before);
      if (
        identity !== directoryIdentity(root, after) ||
        (await fs.realpath(path)) !== root
      )
        throw fail("知识目录已变化，请重新连接", 409);
      return { root, identity };
    } catch (error) {
      throw sanitized(error);
    }
  }
  async function authorized(source) {
    rootPath(source?.root);
    if (!/^[a-f0-9]{64}$/.test(source?.identity || ""))
      throw fail("知识连接无效，请重新连接", 400);
    const current = await inspectRoot(source.root);
    if (current.root !== source.root || current.identity !== source.identity)
      throw fail("知识目录身份已变化，请重新确认连接", 409);
    return current;
  }
  async function directoryChain(source, relativePath) {
    try {
      await authorized(source);
      const chain = [[source.root, source.identity]];
      let path = source.root;
      for (const part of relativePath.split("/").filter(Boolean)) {
        path = join(path, part);
        const info = await fs.lstat(path);
        ordinaryDirectory(info);
        chain.push([path, directoryIdentity(path, info)]);
      }
      return chain;
    } catch (error) {
      const safe = sanitized(error);
      safe.scope = "source";
      throw safe;
    }
  }
  async function scan(source) {
    await authorized(source);
    const files = [],
      issues = [];
    let visited = 0,
      skipped = 0,
      stopped = false;
    const started = clock();
    function budget(path) {
      if (stopped) return false;
      const message =
        clock() - started >= limits.maxMs
          ? "扫描时间达到上限，请缩小来源目录后重试"
          : visited >= limits.maxEntries
            ? "扫描条目达到上限，请缩小来源目录后重试"
            : files.length >= limits.maxFiles
              ? "Markdown 文件数达到上限，请缩小来源目录后重试"
              : "";
      if (!message) return true;
      issues.push({ path, message });
      stopped = true;
      return false;
    }
    async function walk(path, depth) {
      const start = files.length;
      const issueStart = issues.length;
      try {
        if (!budget(path)) return;
        const chain = await directoryChain(source, path);
        const directory = await fs.opendir(join(source.root, path), {
          bufferSize: 1,
        });
        try {
          // Path-based checks are observational, not an OS-atomic sandbox.
          // Recheck before enumerating; later instability withdraws all subtree output.
          if (
            JSON.stringify(await directoryChain(source, path)) !==
            JSON.stringify(chain)
          )
            throw fail("扫描期间目录身份发生变化，请重新扫描", 409);
          while (budget(path)) {
            const entry = await directory.read();
            if (!entry) break;
            visited++;
            const child = path ? `${path}/${entry.name}` : entry.name;
            if (excluded(entry.name)) {
              skipped++;
              continue;
            }
            if (
              entry.isSymbolicLink() ||
              (!entry.isDirectory() && !entry.isFile())
            ) {
              skipped++;
              issues.push({ path: child, message: "已跳过链接或特殊文件" });
              continue;
            }
            if (entry.isDirectory()) {
              if (depth >= limits.maxDepth) {
                skipped++;
                issues.push({
                  path: child,
                  message: "目录深度达到上限，未继续扫描",
                });
              } else await walk(child, depth + 1);
              continue;
            }
            if (!/\.md$/i.test(entry.name)) {
              skipped++;
              continue;
            }
            try {
              documentPath(child);
              const info = await fs.lstat(join(source.root, child));
              ordinaryFile(info);
              files.push({
                path: child,
                bytes: info.size,
                modifiedAt: new Date(info.mtimeMs).toISOString(),
                fingerprint: fingerprint(child, chain, info),
              });
            } catch (error) {
              skipped++;
              issues.push({ path: child, message: sanitized(error).message });
            }
          }
        } finally {
          await directory.close();
        }
        if (
          JSON.stringify(await directoryChain(source, path)) !==
          JSON.stringify(chain)
        )
          throw fail("扫描期间目录身份发生变化，请重新扫描", 409);
      } catch (error) {
        files.splice(start);
        issues.splice(issueStart);
        if (!path) throw sanitized(error);
        skipped++;
        issues.push({ path, message: sanitized(error).message });
      }
    }
    await walk("", 0);
    await authorized(source);
    return {
      status: issues.length ? "partial" : "complete",
      files,
      issues,
      skipped,
      visited,
    };
  }
  async function read(source, selected) {
    try {
      const path = documentPath(selected?.path);
      if (!/^[a-f0-9]{64}$/.test(selected?.fingerprint || ""))
        throw fail("文件凭证无效，请重新扫描后选择", 400);
      const chain = await directoryChain(
        source,
        path.split("/").slice(0, -1).join("/"),
      );
      const absolutePath = join(source.root, path);
      const info = await fs.lstat(absolutePath);
      ordinaryFile(info);
      if (info.size > limits.maxBytes)
        throw fail("单篇原文超过读取上限（最多 256 KiB），请选择较小文件", 413);
      if (fingerprint(path, chain, info) !== selected.fingerprint)
        throw fail("文件已变化，请重新扫描后选择", 409);
      const handle = await fs.open(
        absolutePath,
        constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK,
      );
      try {
        const before = await handle.stat();
        ordinaryFile(before);
        if (fileIdentity(before) !== fileIdentity(info))
          throw fail("文件已变化，请重新扫描后选择", 409);
        async function boundedRead() {
          const buffer = Buffer.alloc(before.size + 1);
          let length = 0;
          while (length < buffer.length) {
            const { bytesRead } = await handle.read(
              buffer,
              length,
              buffer.length - length,
              length,
            );
            if (!bytesRead) break;
            length += bytesRead;
          }
          if (length !== before.size)
            throw fail("读取期间文件大小发生变化，请重新扫描", 409);
          return buffer.subarray(0, length);
        }
        const bytes = await boundedRead();
        const repeated = await boundedRead();
        const after = await handle.stat();
        const afterChain = await directoryChain(
          source,
          path.split("/").slice(0, -1).join("/"),
        );
        const current = await fs.lstat(absolutePath);
        ordinaryFile(current);
        if (
          fileIdentity(before) !== fileIdentity(after) ||
          JSON.stringify(chain) !== JSON.stringify(afterChain) ||
          fileIdentity(before) !== fileIdentity(current) ||
          hash(bytes) !== hash(repeated)
        )
          throw fail("读取期间文件或目录已变化，请重新扫描", 409);
        let content;
        try {
          content = new TextDecoder("utf-8", {
            fatal: true,
            ignoreBOM: true,
          }).decode(bytes);
        } catch {
          throw fail("原文不是有效的 UTF-8 文本，请转换编码后重试", 400);
        }
        if (content.includes("\0"))
          throw fail("原文包含二进制内容，不能作为 Markdown 查看", 400);
        return {
          path,
          absolutePath,
          content,
          bytes: bytes.length,
          sha256: hash(bytes),
          modifiedAt: new Date(after.mtimeMs).toISOString(),
        };
      } finally {
        await handle.close();
      }
    } catch (error) {
      throw sanitized(error);
    }
  }
  async function current(source, relativePath) {
    try {
      const path = documentPath(relativePath);
      const parent = path.split("/").slice(0, -1).join("/");
      const chain = await directoryChain(source, parent);
      const info = await fs.lstat(join(source.root, path));
      ordinaryFile(info);
      const selected = {
        path,
        bytes: info.size,
        modifiedAt: new Date(info.mtimeMs).toISOString(),
        fingerprint: fingerprint(path, chain, info),
      };
      // read checks the captured metadata and directory chain again, twice reads
      // bounded bytes, then verifies identity. No whole-directory scan is needed.
      return { selected, document: await read(source, selected) };
    } catch (error) {
      throw sanitized(error);
    }
  }
  return { inspectRoot, scan, read, current, limits };
}
