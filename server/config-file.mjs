import * as fs from "node:fs/promises";
import { constants } from "node:fs";
import { createHash, randomUUID } from "node:crypto";
import { isAbsolute, resolve, dirname, parse, join } from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execute = promisify(execFile);

class ConfigFileError extends Error {
  constructor(message, status = 403) {
    super(message);
    this.status = status;
  }
}
const fail = (message, status) => new ConfigFileError(message, status);
const LIMIT = 256 * 1024;
function sanitized(error) {
  if (error instanceof ConfigFileError) return error;
  return fail(
    ["ENOENT", "ENOTDIR"].includes(error?.code)
      ? "配置文件不存在"
      : "无法安全访问配置文件",
    ["ENOENT", "ENOTDIR"].includes(error?.code)
      ? 404
      : ["EACCES", "EPERM", "ELOOP"].includes(error?.code)
        ? 403
        : 503,
  );
}
function ordinary(info, limit = LIMIT) {
  if (
    info.isSymbolicLink() ||
    !info.isFile() ||
    info.nlink !== 1 ||
    info.mode & 0o7000 ||
    typeof process.getuid !== "function" ||
    info.uid !== process.getuid()
  )
    throw fail("配置须为本人所有、无链接及特殊权限的普通文件");
  if (info.size > limit)
    throw fail(`配置超过 ${Math.round(limit / 1024)} KiB 限制`, 413);
}

async function inspectPath(path, filesystem, limit = LIMIT) {
  if (
    typeof path !== "string" ||
    !isAbsolute(path) ||
    resolve(path) !== path ||
    /[\x00-\x1f\x7f]/.test(path) ||
    path.length > 4096
  )
    throw fail("配置路径须为固定绝对路径", 400);
  const parents = [];
  for (let current = dirname(path); ; current = dirname(current)) {
    parents.unshift(current);
    if (current === parse(current).root) break;
  }
  const chain = [];
  for (const parent of parents) {
    const info = await filesystem.lstat(parent);
    if (info.isSymbolicLink() || !info.isDirectory())
      throw fail("配置路径不能包含链接或特殊目录");
    chain.push([parent, info.dev, info.ino, info.mode, info.uid]);
  }
  const info = await filesystem.lstat(path);
  ordinary(info, limit);
  return { info, chain: JSON.stringify(chain) };
}

const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");
const identity = (s) =>
  JSON.stringify([
    s.dev,
    s.ino,
    s.size,
    s.mtimeMs,
    s.ctimeMs,
    s.mode,
    s.nlink,
    s.uid,
    s.gid,
  ]);

// limit 默认 256 KiB；独立操作记录可传更大的对称上限（写入方用同一上限校验）。
export async function readConfigFile(
  path,
  { filesystem = fs, limit = LIMIT } = {},
) {
  try {
    const checked = await inspectPath(path, filesystem, limit);
    const handle = await filesystem.open(
      path,
      constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK,
    );
    try {
      const before = await handle.stat();
      ordinary(before, limit);
      if (identity(before) !== identity(checked.info))
        throw fail("配置文件已变化，请重新预览", 409);
      const read = async () => {
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
        if (length !== before.size) throw fail("读取期间配置已变化", 409);
        return buffer.subarray(0, length);
      };
      const bytes = await read();
      const repeated = await read();
      const after = await handle.stat();
      const current = await inspectPath(path, filesystem, limit);
      if (
        identity(before) !== identity(after) ||
        identity(before) !== identity(current.info) ||
        current.chain !== checked.chain ||
        hash(bytes) !== hash(repeated)
      )
        throw fail("读取期间配置或目录已变化", 409);
      return {
        bytes,
        hash: hash(bytes),
        identity: identity(before),
        mode: before.mode & 0o777,
        uid: before.uid,
        gid: before.gid,
      };
    } finally {
      await handle.close();
    }
  } catch (error) {
    throw sanitized(error);
  }
}

// The sole supported xattr is preserved byte-for-byte, never exposed in results.
// No ACL/quarantine/unknown-attribute stripping is permitted. Some macOS hosts
// silently retain provenance after `xattr -d`, so every mutation is read back.
async function defaultMetadataCheck(path, options = {}) {
  if (process.platform !== "darwin")
    throw fail("此平台尚不能可靠核验配置扩展属性，未写入");
  try {
    const commandOptions = {
      encoding: "utf8",
      timeout: 2000,
      maxBuffer: 32768,
      env: { ...process.env, LC_ALL: "C", LANG: "C" },
    };
    const run = (args) => execute("/usr/bin/xattr", args, commandOptions);
    const { stdout: listing } = await execute(
      "/bin/ls",
      ["-lde", path],
      commandOptions,
    );
    const mode = listing.match(/^-[rwxstST-]{9}([+@]?)\s/);
    if (!mode || mode[1] === "+" || /^\s*\d+:/m.test(listing))
      throw fail("配置包含不支持的 ACL，未写入");
    const read = async () => {
      const { stdout: attributes } = await run([path]);
      const names = attributes.trim().split(/\r?\n/).filter(Boolean);
      if (names.some((name) => name !== "com.apple.provenance"))
        throw fail("配置包含不支持的扩展属性，未写入");
      if (!names.length) return { provenance: null };
      const { stdout } = await run(["-px", "com.apple.provenance", path]);
      const provenance = stdout.replace(/\s/g, "").toLowerCase();
      if (!/^(?:[0-9a-f]{2}){1,4096}$/.test(provenance))
        throw fail("无法可靠核验系统来源属性，未写入");
      return { provenance };
    };
    let metadata = await read();
    if (Object.hasOwn(options, "preserve")) {
      const wanted = options.preserve;
      if (
        !wanted ||
        !(
          wanted.provenance === null ||
          /^(?:[0-9a-f]{2}){1,4096}$/.test(wanted.provenance)
        )
      )
        throw fail("系统来源属性核验无效，未写入");
      if (wanted.provenance !== metadata.provenance) {
        if (wanted.provenance === null)
          await run(["-d", "com.apple.provenance", path]);
        else
          await run(["-wx", "com.apple.provenance", wanted.provenance, path]);
      }
      metadata = await read();
      if (metadata.provenance !== wanted.provenance)
        throw fail("无法精确保留系统来源属性，未写入");
    }
    return metadata;
  } catch (error) {
    if (error instanceof ConfigFileError) throw error;
    throw fail("无法可靠核验配置 ACL 或扩展属性，未写入");
  }
}

// Caller supplies a server-derived path and owns durable operation journaling.
// Checks detect ordinary concurrent edits; path-based rename is not an OS CAS.
// A process crash can leave a private staging file: never glob-clean such files.
export async function atomicReplaceConfig(
  path,
  expected,
  nextBytes,
  {
    verifyScope = async () => {},
    filesystem = fs,
    checkMetadata = defaultMetadataCheck,
  } = {},
) {
  if (
    !expected ||
    !/^[a-f0-9]{64}$/.test(expected.hash) ||
    typeof expected.identity !== "string" ||
    expected.identity.length > 1000 ||
    !Number.isInteger(expected.mode) ||
    expected.mode < 0 ||
    expected.mode > 0o777 ||
    expected.uid !== process.getuid() ||
    !Number.isSafeInteger(expected.gid) ||
    expected.gid < 0 ||
    expected.gid > 0xffffffff ||
    !Buffer.isBuffer(nextBytes)
  )
    throw fail("配置写入参数无效", 400);
  if (nextBytes.length > LIMIT) throw fail("配置超过 256 KiB 限制", 413);
  const next = Buffer.from(nextBytes);
  const verify = async () => {
    try {
      await verifyScope();
    } catch {
      throw fail("配置范围已变化，请重新预览", 409);
    }
  };
  await verify();
  const current = await readConfigFile(path, { filesystem });
  if (
    current.identity !== expected.identity ||
    current.hash !== expected.hash ||
    current.mode !== expected.mode ||
    current.uid !== expected.uid ||
    current.gid !== expected.gid
  )
    throw fail("配置文件已变化，请重新预览", 409);
  let originalMetadata;
  try {
    originalMetadata = await checkMetadata(path);
  } catch (error) {
    throw sanitized(error);
  }
  let initialPath;
  try {
    initialPath = await inspectPath(path, filesystem);
  } catch (error) {
    throw sanitized(error);
  }
  const temporary = join(dirname(path), `.guiji-config-${randomUUID()}.tmp`);
  let owned,
    renameAttempted = false;
  try {
    const handle = await filesystem.open(
      temporary,
      constants.O_WRONLY |
        constants.O_CREAT |
        constants.O_EXCL |
        constants.O_NOFOLLOW,
      0o600,
    );
    try {
      owned = await handle.stat();
      await handle.writeFile(next);
      await handle.sync();
      if (owned.gid !== initialPath.info.gid)
        await handle.chown(initialPath.info.uid, initialPath.info.gid);
      await handle.chmod(expected.mode);
      await handle.sync();
      const stagedBeforeMetadata = await inspectPath(temporary, filesystem);
      if (
        stagedBeforeMetadata.chain !== initialPath.chain ||
        stagedBeforeMetadata.info.dev !== owned.dev ||
        stagedBeforeMetadata.info.ino !== owned.ino
      )
        throw fail("临时配置路径已变化，未修改属性", 409);
      const stagedMetadata = await checkMetadata(temporary, {
        preserve: originalMetadata,
      });
      if (JSON.stringify(stagedMetadata) !== JSON.stringify(originalMetadata))
        throw fail("临时配置属性未与原文件对齐，未写入", 409);
      await handle.sync();
    } finally {
      await handle.close();
    }
    const staged = await readConfigFile(temporary, { filesystem });
    const stagedPath = await inspectPath(temporary, filesystem);
    if (
      staged.hash !== hash(next) ||
      staged.mode !== expected.mode ||
      stagedPath.chain !== initialPath.chain ||
      stagedPath.info.dev !== owned.dev ||
      stagedPath.info.ino !== owned.ino
    )
      throw fail("临时配置已变化，未替换原文件", 409);
    if (
      JSON.stringify(await checkMetadata(path)) !==
      JSON.stringify(originalMetadata)
    )
      throw fail("配置属性已变化，请重新预览", 409);
    await verify();
    const latest = await readConfigFile(path, { filesystem });
    const finalPath = await inspectPath(path, filesystem);
    if (
      latest.identity !== expected.identity ||
      latest.hash !== expected.hash ||
      finalPath.chain !== initialPath.chain
    )
      throw fail("写入前配置或目录已变化，请重新预览", 409);
    renameAttempted = true;
    await filesystem.rename(temporary, path);
    const directory = await filesystem.open(
      dirname(path),
      constants.O_RDONLY | constants.O_NOFOLLOW,
    );
    try {
      await directory.sync();
    } finally {
      await directory.close();
    }
    await verify();
    if (
      JSON.stringify(await checkMetadata(path)) !==
      JSON.stringify(originalMetadata)
    )
      throw fail("写后配置属性核对不一致", 409);
    const result = await readConfigFile(path, { filesystem });
    const written = await inspectPath(path, filesystem);
    if (
      result.hash !== hash(next) ||
      result.mode !== expected.mode ||
      result.uid !== expected.uid ||
      written.info.gid !== initialPath.info.gid ||
      written.chain !== initialPath.chain ||
      written.info.dev !== owned.dev ||
      written.info.ino !== owned.ino
    )
      throw fail("写后配置核对不一致", 409);
    return result;
  } catch (error) {
    if (owned) {
      try {
        const current = await inspectPath(temporary, filesystem);
        if (
          current.chain === initialPath.chain &&
          current.info.dev === owned.dev &&
          current.info.ino === owned.ino
        )
          await filesystem.unlink(temporary);
      } catch {
        /* Never follow or delete a replacement temporary path. */
      }
    }
    if (renameAttempted)
      throw Object.assign(
        fail("配置写入结果未知，请先重新核对；未自动回滚", 503),
        { outcome: "unknown" },
      );
    throw sanitized(error);
  }
}
