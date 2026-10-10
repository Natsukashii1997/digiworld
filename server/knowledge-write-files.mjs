import fs from "node:fs/promises";
import { constants } from "node:fs";
import { join, dirname } from "node:path";
import { createHash } from "node:crypto";
import { createKnowledgeFiles } from "./knowledge-files.mjs";
import { readConfigFile } from "./config-file.mjs";
import { failure } from "./repository.mjs";

export const knowledgeTextHash = (text) =>
  createHash("sha256").update(text).digest("hex");
export function candidatePath(domain, filename) {
  if (
    !["生活", "工作/个人", "工作/团队"].includes(domain) ||
    typeof filename !== "string" ||
    filename.length > 120 ||
    !/^[^./\\\s][^/\\:\x00-\x1f\x7f<>?*|"#\[\]]*\.md$/.test(filename) ||
    filename !== filename.trim()
  )
    throw failure("请选择领域及有效的 Markdown 文件名");
  return `00 待整理/${domain}/${filename}`;
}
function validatePath(path) {
  if (typeof path !== "string") throw failure("候选保存位置无效");
  const match = path.match(/^00 待整理\/(生活|工作\/个人|工作\/团队)\/(.+)$/);
  if (!match || candidatePath(match[1], match[2]) !== path)
    throw failure("只允许保存到指定待整理目录");
}
function safe(error) {
  if (error.constructor?.name === "ConfigFileError")
    return failure(
      "无法核验候选文件：仅支持本人所有、未变化的普通文件（最多 256 KiB）",
      error.status,
    );
  if (error.status) return error;
  if (error.code === "EEXIST") return failure("目标文件已存在，不能覆盖", 409);
  if (["ENOENT", "ENOTDIR"].includes(error.code))
    return failure("待整理目录不存在，请先在知识库中建立所选目录", 404);
  return failure("无法安全访问候选目标，请检查权限和目录", 503);
}

// Restricted new-file writer. No directory creation, existing-file overwrite,
// or arbitrary path support. Path checks are observational, not OS-level CAS.
export function createKnowledgeWriteFiles({ filesystem = fs } = {}) {
  const knowledge = createKnowledgeFiles({ fs: filesystem });
  async function chain(source, path) {
    validatePath(path);
    const root = await knowledge.inspectRoot(source.root);
    if (root.root !== source.root || root.identity !== source.identity)
      throw failure("目标知识库身份已变化", 409);
    const parts = [[root.root, root.identity]];
    let directory = root.root;
    for (const part of path.split("/").slice(0, -1)) {
      directory = join(directory, part);
      const info = await filesystem.lstat(directory);
      if (
        !info.isDirectory() ||
        info.isSymbolicLink() ||
        info.uid !== process.getuid()
      )
        throw failure("待整理目录必须是本人拥有的真实目录", 403);
      parts.push([directory, info.dev, info.ino, info.birthtimeMs]);
    }
    return JSON.stringify(parts);
  }
  async function inspect(source, path) {
    try {
      const parentIdentity = await chain(source, path);
      const absolutePath = join(source.root, path);
      let exists = true;
      try {
        await filesystem.lstat(absolutePath);
      } catch (error) {
        if (error.code === "ENOENT") exists = false;
        else throw error;
      }
      if (!exists) {
        if ((await chain(source, path)) !== parentIdentity)
          throw failure("目标目录已变化", 409);
        return null;
      }
      const result = await readConfigFile(absolutePath, { filesystem });
      if ((await chain(source, path)) !== parentIdentity)
        throw failure("读取期间目标目录已变化", 409);
      return {
        path,
        parentIdentity,
        fingerprint: knowledgeTextHash(parentIdentity + result.identity),
        sha256: result.hash,
        content: new TextDecoder("utf-8", { fatal: true }).decode(result.bytes),
      };
    } catch (error) {
      throw safe(error);
    }
  }
  async function preview(source, path) {
    try {
      const parentIdentity = await chain(source, path);
      if (await inspect(source, path))
        throw failure("目标文件已存在，不能覆盖", 409);
      if ((await chain(source, path)) !== parentIdentity)
        throw failure("目标目录已变化", 409);
      return { path, parentIdentity };
    } catch (error) {
      throw safe(error);
    }
  }
  async function syncDirectory(source, path) {
    const handle = await filesystem.open(
      dirname(join(source.root, path)),
      constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW,
    );
    try {
      await handle.sync();
    } finally {
      await handle.close();
    }
  }
  return {
    inspect,
    preview,
    async create(source, target, content,{guard=async()=>{}}={}) {
      if (
        typeof content !== "string" ||
        Buffer.byteLength(content) > 256 * 1024
      )
        throw failure("候选正文超过保存上限", 413);
      let attempted = false,
        owned;
      try {
        const current = await preview(source, target.path);
        if (current.parentIdentity !== target.parentIdentity)
          throw failure("保存目录已变化，请重新预览", 409);
        await guard();
        // Any ambiguity after exclusive creation must be resolved from the journal.
        const handle = await filesystem.open(
          join(source.root, target.path),
          constants.O_WRONLY |
            constants.O_CREAT |
            constants.O_EXCL |
            constants.O_NOFOLLOW,
          0o600,
        );
        attempted = true;
        try {
          owned = await handle.stat();
          if ((await chain(source, target.path)) !== target.parentIdentity)
            throw failure("保存目录已变化", 409);
          await guard();
          await handle.writeFile(content, "utf8");
          await handle.sync();
        } finally {
          await handle.close();
        }
        await syncDirectory(source, target.path);
        const written = await inspect(source, target.path);
        const actual = await filesystem.lstat(join(source.root, target.path));
        if (
          !written ||
          actual.dev !== owned.dev ||
          actual.ino !== owned.ino ||
          written.parentIdentity !== target.parentIdentity ||
          written.sha256 !== knowledgeTextHash(content)
        )
          throw failure("保存后回读不一致", 409);
        return written;
      } catch (error) {
        if (attempted)
          throw Object.assign(
            failure("候选保存结果未知，请先核对操作记录；未自动重试", 503),
            { outcome: "unknown" },
          );
        throw safe(error);
      }
    },
    async remove(source, expected,{guard=async()=>{}}={}) {
      let attempted = false;
      try {
        const current = await inspect(source, expected.path);
        if (
          !current ||
          current.fingerprint !== expected.fingerprint ||
          current.sha256 !== expected.sha256
        )
          throw failure("文件已变化或缺失，不能撤回", 409);
        await guard();
        const afterGuard=await inspect(source,expected.path);
        if(!afterGuard||afterGuard.fingerprint!==expected.fingerprint||afterGuard.sha256!==expected.sha256)throw failure('核验期间文件归属已变化，不能撤回',409);
        attempted = true;
        await filesystem.unlink(join(source.root, expected.path));
        await syncDirectory(source, expected.path);
        if (
          (await chain(source, expected.path)) !== expected.parentIdentity ||
          (await inspect(source, expected.path))
        )
          throw failure("撤回后核验不一致", 409);
        return { path: expected.path, absent: true };
      } catch (error) {
        if (attempted)
          throw Object.assign(
            failure("撤回结果未知，请先核对记录；未自动重试", 503),
            { outcome: "unknown" },
          );
        throw safe(error);
      }
    },
  };
}
