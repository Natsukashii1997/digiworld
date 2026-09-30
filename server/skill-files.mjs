import { lstat, opendir, open, realpath } from "node:fs/promises";
import { constants } from "node:fs";
import { join, resolve, relative, isAbsolute, basename } from "node:path";
import { homedir } from "node:os";
import { createHash } from "node:crypto";
import { inspectSkill, validateSkillFiles } from "../src/skill-package.js";

const failure = (message, status = 400) =>
  Object.assign(new Error(message), { status });
const LIMIT = 25 * 1024 * 1024;
function sensitive(name) {
  return (
    /^(?:\.env(?:\..*)?|auth\.json|credentials.*|secrets?(?:\..*)?|tokens?\.(?:json|ya?ml)|id_(?:rsa|dsa|ecdsa|ed25519)(?:\..*)?)$/i.test(
      name,
    ) ||
    /\.(?:pem|key|p12|pfx|kdbx|keystore)$/i.test(name) ||
    [
      ".git",
      ".svn",
      ".hg",
      "node_modules",
      ".venv",
      "venv",
      ".ssh",
      ".aws",
      ".gnupg",
      ".config",
      ".netrc",
      ".npmrc",
      ".pypirc",
      "keys",
      "private-keys",
    ].includes(name.toLowerCase())
  );
}
function safeName(name) {
  if (sensitive(name))
    throw failure(
      `包内含敏感凭据、依赖或版本控制路径「${name}」，未收录完整包`,
    );
}
const stamp = (info) =>
  JSON.stringify([
    info.dev,
    info.ino,
    info.size,
    info.mtimeMs,
    info.ctimeMs,
    info.mode,
    info.nlink,
  ]);
function ordinary(info) {
  if (info.isSymbolicLink()) throw failure("完整包不能包含符号链接");
  if (!info.isDirectory() && !info.isFile())
    throw failure("完整包不能包含特殊文件，仅支持普通文件和目录");
  if (info.isFile() && info.nlink !== 1) throw failure("完整包不能包含硬链接");
  if (info.mode & 0o7000) throw failure("完整包不能包含特殊权限");
}
async function boundedFile(target, expected, remaining) {
  const handle = await open(
    target,
    constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK,
  );
  try {
    const before = await handle.stat();
    ordinary(before);
    if (!before.isFile() || stamp(before) !== stamp(expected))
      throw failure("来源文件发生变化，请重新预览", 409);
    if (before.size > remaining) throw failure("完整包超过 25 MiB 限制", 413);
    const buffer = Buffer.alloc(Math.min(before.size + 1, remaining + 1));
    let length = 0;
    while (length < buffer.length) {
      const { bytesRead } = await handle.read(
        buffer,
        length,
        buffer.length - length,
        null,
      );
      if (!bytesRead) break;
      length += bytesRead;
    }
    const after = await handle.stat(),
      current = await lstat(target);
    if (
      length !== before.size ||
      stamp(before) !== stamp(after) ||
      stamp(current) !== stamp(before)
    )
      throw failure("读取期间来源文件发生变化，请重新预览", 409);
    return new Uint8Array(buffer.subarray(0, length));
  } finally {
    await handle.close();
  }
}
const within = (root, path) => {
  const part = relative(root, path);
  return (
    part === "" ||
    (!isAbsolute(part) && part !== ".." && !part.startsWith("../"))
  );
};
function normalizeRoots(roots) {
  if (!Array.isArray(roots) || !roots.length || roots.length > 20)
    throw failure("请选择 1 至 20 个具体 Skill 根目录");
  const broad = new Set([
    "/",
    "/Users",
    "/Volumes",
    "/System",
    "/System/Volumes/Data",
    "/Library",
    "/Applications",
    "/private",
    "/private/tmp",
    "/private/var",
    "/private/var/folders",
    "/var/folders",
    "/tmp",
    "/var",
    "/home",
    homedir(),
    ...[
      "Documents",
      "Desktop",
      "Downloads",
      "Library",
      ".codex",
      ".agents",
      ".hermes",
    ].map((name) => join(homedir(), name)),
  ]);
  return [
    ...new Set(
      roots.map((root) => {
        if (
          typeof root !== "string" ||
          root.length > 2000 ||
          !isAbsolute(root) ||
          /[\x00-\x1f\x7f]/.test(root)
        )
          throw failure("Skill 根目录须为绝对路径");
        const path = resolve(root);
        if (broad.has(path) || /^\/(?:Volumes|Users|home)\/[^/]+$/.test(path))
          throw failure("扫描范围过大，请选择具体 Skill 根目录");
        return path;
      }),
    ),
  ];
}
export const defaultSkillRoots = (home = homedir()) =>
  [".codex", ".agents", ".hermes"].map((name) => resolve(home, name, "skills"));

export async function discoverSkills(input) {
  const roots = normalizeRoots(input),
    items = [],
    errors = [],
    found = new Set();
  let directories = 0,
    inspectedEntries = 0,
    truncated = false,
    exhausted = false;
  function blocked(path, root, message) {
    items.push({
      id: createHash("sha256").update(path).digest("hex"),
      path,
      root,
      name: basename(path),
      status: "blocked",
      message,
    });
  }
  function candidate(path, root, location) {
    if (found.has(location)) return;
    found.add(location);
    items.push({
      id: createHash("sha256").update(location).digest("hex"),
      path,
      root,
      name: basename(path),
      status: "candidate",
      message: "尚未核验完整包",
    });
  }
  async function visit(path, root, depth = 0) {
    if (exhausted) return;
    if (directories >= 3000 || items.length >= 500) {
      truncated = true;
      exhausted = true;
      errors.push({
        path,
        message:
          directories >= 3000
            ? "扫描达到 3000 个目录限制，请缩小范围"
            : "扫描达到 500 个候选限制，请缩小范围",
      });
      return;
    }
    directories++;
    try {
      safeName(basename(path));
      const info = await lstat(path);
      if (info.isSymbolicLink()) {
        try {
          if (path === root)
            throw failure("扫描根不能是符号链接，请添加真实 Skill 根目录");
          const { location } = await packageDirectory(roots, path);
          const entry = await lstat(join(location, "SKILL.md"));
          if (!entry.isFile())
            throw failure(
              "目录别名目标须直接包含普通 SKILL.md，请添加真实 Skill 根目录",
            );
          candidate(path, root, location);
        } catch (error) {
          blocked(
            path,
            root,
            error.status
              ? error.message
              : "无法核验目录别名，请添加真实 Skill 根目录",
          );
        }
        return;
      }
      if (!info.isDirectory()) throw failure("扫描根必须是普通目录");
      const directory = await packageDirectory(roots, path, false);
      const entries = [];
      for await (const entry of await opendir(path)) {
        if (++inspectedEntries > 10000) {
          truncated = true;
          exhausted = true;
          errors.push({
            path,
            message: "扫描达到 10000 项元数据限制，请缩小范围",
          });
          return;
        }
        entries.push(entry);
        if (entry.name === "SKILL.md") break;
      }
      if (
        (await packageDirectory(roots, path, false)).stamp !==
          directory.stamp ||
        stamp(await lstat(path)) !== stamp(info)
      )
        throw failure("扫描期间来源目录发生变化，请重新扫描", 409);
      const entry = entries.find((f) => f.name === "SKILL.md");
      if (entry) {
        if (!entry.isFile()) blocked(path, root, "SKILL.md 不是普通文件");
        else candidate(path, root, directory.location);
        return;
      }
      const children = entries
        .filter((f) => f.isDirectory() || f.isSymbolicLink())
        .sort((a, b) => a.name.localeCompare(b.name));
      if (depth >= 4 && children.length) {
        truncated = true;
        errors.push({
          path,
          message: "扫描达到深度 4 限制，请添加更具体的根目录",
        });
        return;
      }
      for (const child of children) {
        if (exhausted) break;
        await visit(join(path, child.name), root, depth + 1);
      }
    } catch (error) {
      errors.push({
        path,
        message: error.status
          ? error.message
          : ["ENOENT", "ENOTDIR"].includes(error.code)
            ? "目录不存在"
            : ["EACCES", "EPERM"].includes(error.code)
              ? "没有读取目录的权限"
              : "无法读取 Skill 目录",
      });
    }
  }
  for (const root of roots) await visit(root, root);
  return { roots, items, errors, truncated, at: new Date().toISOString() };
}
async function packageDirectory(roots, path, allowAlias = true) {
  if (
    typeof path !== "string" ||
    !isAbsolute(path) ||
    /[\x00-\x1f\x7f]/.test(path)
  )
    throw failure("请选择扫描范围内的 Skill 目录");
  path = resolve(path);
  let root = roots
      .filter((r) => within(r, path))
      .sort((a, b) => b.length - a.length)[0],
    canonicalInput = false;
  if (!root) {
    for (const source of roots) {
      try {
        const info = await lstat(source);
        if (info.isSymbolicLink() || !info.isDirectory()) continue;
        const canonical = await realpath(source);
        if (within(canonical, path)) {
          root = source;
          canonicalInput = true;
          break;
        }
      } catch {
        /* Missing alternative roots do not grant access. */
      }
    }
  }
  if (!root) throw failure("Skill 目录不在本次明确扫描范围内");
  let cursor = root;
  const parts = relative(canonicalInput ? await realpath(root) : root, path)
      .split("/")
      .filter(Boolean),
    chain = [];
  for (const part of ["", ...parts]) {
    if (part) cursor = join(cursor, part);
    safeName(basename(cursor));
    const info = await lstat(cursor);
    if (
      info.isSymbolicLink() &&
      allowAlias &&
      part &&
      cursor === join(root, ...parts)
    ) {
      const target = await packageDirectory(
        roots,
        await realpath(cursor),
        false,
      );
      return {
        location: target.location,
        stamp: JSON.stringify([chain, cursor, stamp(info), target.stamp]),
      };
    }
    if (info.isSymbolicLink() || !info.isDirectory())
      throw failure(
        "Skill 目录不能经过符号链接或非目录；请添加真实 Skill 根目录",
      );
    chain.push([cursor, info.dev, info.ino]);
  }
  const location = await realpath(path),
    canonicalRoot = await realpath(root);
  normalizeRoots([canonicalRoot]);
  if (location !== join(canonicalRoot, ...parts))
    throw failure("Skill 目录链发生变化，请重新预览", 409);
  return { location, stamp: JSON.stringify([location, chain]) };
}

export async function readLocalSkill(roots, path) {
  try {
    return await readPackage(roots, path);
  } catch (error) {
    if (error.status) throw error;
    if (["ENOENT", "ENOTDIR"].includes(error.code))
      throw failure("来源文件或目录不存在，请重新扫描", 404);
    if (["EACCES", "EPERM"].includes(error.code))
      throw failure("没有读取来源的权限，请检查目录和文件权限", 403);
    if (error.code === "ELOOP")
      throw failure("来源路径含符号链接或读取期间发生变化，请重新预览", 409);
    throw failure(
      error.code ? "无法读取完整包，请检查文件类型和目录权限" : error.message,
    );
  }
}
async function readPackage(roots, path) {
  roots = normalizeRoots(roots);
  const directory = await packageDirectory(roots, path),
    { location } = directory,
    nodes = [],
    directories = [];
  async function collect(directory, prefix = "") {
    const original = await lstat(directory);
    ordinary(original);
    directories.push([directory, stamp(original)]);
    for await (const entry of await opendir(directory)) {
      const name = entry.name;
      safeName(name);
      const target = join(directory, name),
        relative = prefix + name;
      if (relative.length > 500) throw failure("包内文件路径超过 500 字符限制");
      const info = await lstat(target),
        directoryEntry = info.isDirectory();
      ordinary(info);
      nodes.push({ target, path: relative, info });
      if (nodes.length > 300) throw failure("最多支持 300 个文件与目录");
      if (directoryEntry) await collect(target, relative + "/");
    }
  }
  await collect(location);
  if (!nodes.some((node) => node.path === "SKILL.md" && node.info.isFile()))
    throw failure("所选目录须直接包含 SKILL.md 入口");
  validateSkillFiles(
    nodes.map((node) => ({
      path: node.path,
      text: false,
      data: new Uint8Array(),
      mode: node.info.mode & 0o777,
      ...(node.info.isDirectory() ? { directory: true } : {}),
    })),
  );
  const files = [];
  let readBytes = 0;
  for (const node of nodes) {
    const isDirectory = node.info.isDirectory(),
      data = isDirectory
        ? new Uint8Array()
        : await boundedFile(node.target, node.info, LIMIT - readBytes);
    readBytes += data.length;
    files.push({
      path: node.path,
      text: false,
      data,
      mode: node.info.mode & 0o777,
      ...(isDirectory ? { directory: true } : {}),
    });
  }
  for (const [target, original] of directories)
    if (
      stamp(await lstat(target)) !== original ||
      !within(location, await realpath(target))
    )
      throw failure("读取期间来源目录发生变化，请重新预览", 409);
  if ((await packageDirectory(roots, path)).stamp !== directory.stamp)
    throw failure("Skill 目录链发生变化，请重新预览", 409);
  files.sort((a, b) => (a.path < b.path ? -1 : 1));
  validateSkillFiles(files);
  const inspected = inspectSkill(files),
    hash = createHash("sha256");
  let content;
  try {
    content = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(
      files.find((f) => f.path === inspected.entry).data,
    );
  } catch {
    throw failure("SKILL.md 入口必须是 UTF-8 文本");
  }
  if (content.includes("\0")) throw failure("SKILL.md 入口不能包含二进制内容");
  if (content.length > 1000000)
    throw failure("SKILL.md 正文超过 100 万字符主库限额，未截断内容", 413);
  let bytes = 0;
  for (const file of files) {
    hash.update(
      JSON.stringify([
        file.path,
        file.directory === true,
        file.mode,
        file.data.length,
      ]) + "\n",
    );
    hash.update(file.data);
    hash.update("\n");
    bytes += file.data.length;
  }
  return {
    location,
    files,
    identity: createHash("sha256").update(directory.stamp).digest("hex"),
    content,
    name: inspected.name || basename(location),
    fingerprint: hash.digest("hex"),
    bytes,
  };
}
