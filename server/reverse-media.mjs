// 逆向媒体仅存在指定数据根。读取从同一 FD 校验身份、大小、格式与内容寻址 SHA。
import fs from "node:fs/promises";
import { constants } from "node:fs";
import { join, resolve, parse } from "node:path";
import { createHash, randomBytes } from "node:crypto";
import { sniffImage } from "./image-type.mjs";
import { validateMedia } from "../src/reverse-recipe.js";
import { failure } from "./repository.mjs";
const mime = { png: "image/png", jpg: "image/jpeg", webp: "image/webp" };
const identity = (s) => [s.dev, s.ino, s.birthtimeMs].join(":");
export function createReverseMedia(directory, { filesystem = fs } = {}) {
  const dataRoot = resolve(directory),
    root = join(dataRoot, "reverse-media");
  async function chain(create = false) {
    const ancestors = [];
    let cursor = parse(dataRoot).root;
    for (const part of dataRoot
      .slice(cursor.length)
      .split("/")
      .filter(Boolean)) {
      cursor = join(cursor, part);
      const s = await filesystem.lstat(cursor);
      if (!s.isDirectory() || s.isSymbolicLink())
        throw failure("媒体祖先不能是链接或非目录", 409);
      ancestors.push({ path: cursor, id: identity(s) });
    }
    const parent = await filesystem.lstat(dataRoot);
    if (!parent.isDirectory() || parent.isSymbolicLink())
      throw failure("媒体数据目录身份无效", 409);
    const canonical = await filesystem.realpath(dataRoot);
    if (create) await filesystem.mkdir(root, { mode: 0o700, recursive: true });
    const info = await filesystem.lstat(root);
    if (
      !info.isDirectory() ||
      info.isSymbolicLink() ||
      (await filesystem.realpath(root)) !== join(canonical, "reverse-media")
    )
      throw failure("媒体目录不能是链接", 409);
    return [
      ...ancestors,
      { path: dataRoot, id: identity(parent) },
      { path: root, id: identity(info) },
    ];
  }
  async function unchanged(items) {
    for (const c of items) {
      const s = await filesystem.lstat(c.path);
      if (!s.isDirectory() || s.isSymbolicLink() || identity(s) !== c.id)
        throw failure("媒体目录身份已变化", 409);
    }
  }
  async function read(metadata) {
    validateMedia(metadata);
    let handle;
    try {
      const guards = await chain(),
        path = join(dataRoot, metadata.path);
      await unchanged(guards);
      const before = await filesystem.lstat(path);
      await unchanged(guards);
      if (
        !before.isFile() ||
        before.isSymbolicLink() ||
        before.nlink !== 1 ||
        before.size !== metadata.size
      )
        throw failure("媒体身份或大小不符", 409);
      handle = await filesystem.open(
        path,
        constants.O_RDONLY | constants.O_NOFOLLOW,
      );
      const opened = await handle.stat();
      if (
        identity(opened) !== identity(before) ||
        opened.nlink !== 1 ||
        !opened.isFile()
      )
        throw failure("媒体读取时身份变化", 409);
      await unchanged(guards);
      const bytes = new Uint8Array(metadata.size + 1);
      let n = 0;
      while (n < bytes.length) {
        const result = await handle.read(bytes, n, bytes.length - n, n);
        if (!result.bytesRead) break;
        n += result.bytesRead;
      }
      const after = await handle.stat(),
        named = await filesystem.lstat(path);
      if (
        n !== metadata.size ||
        identity(after) !== identity(before) ||
        identity(named) !== identity(before) ||
        after.mtimeMs !== before.mtimeMs ||
        after.size !== before.size ||
        named.nlink !== 1
      )
        throw failure("媒体读取期间变化", 409);
      const data = bytes.slice(0, n),
        kind = sniffImage(data);
      if (
        mime[kind] !== metadata.type ||
        createHash("sha256").update(data).digest("hex") !== metadata.sha256
      )
        throw failure("媒体格式或SHA256校验失败", 409);
      await unchanged(guards);
      return { ...metadata, data, localPath: path };
    } catch (e) {
      if (e.code === "ENOENT")
        throw failure("本机媒体不存在，请恢复完整备份或重新投入图片", 404);
      throw e;
    } finally {
      await handle?.close();
    }
  }
  async function storeOne(input) {
    if (
      !input ||
      typeof input !== "object" ||
      Array.isArray(input) ||
      Object.keys(input).some((k) => k !== "data") ||
      !(input.data instanceof Uint8Array)
    )
      throw failure("图片请求无效");
    const bytes = new Uint8Array(input.data);
    if (bytes.length > 8 * 1024 * 1024)
      throw failure("单张图片不能超过8 MB", 413);
    const kind = sniffImage(bytes);
    if (!kind) throw failure("只支持png、jpg、webp图片");
    const sha256 = createHash("sha256").update(bytes).digest("hex"),
      metadata = {
        path: `reverse-media/${sha256}.${kind}`,
        size: bytes.length,
        sha256,
        type: mime[kind],
      };
    const guards = await chain(true),
      path = join(dataRoot, metadata.path);
    try {
      await filesystem.lstat(path);
      await read(metadata);
      return metadata;
    } catch (e) {
      if (e.code !== "ENOENT" && e.status !== 404) throw e;
    }
    const temp = join(root, `.upload-${randomBytes(10).toString("hex")}`);
    let handle,
      tempId,
      removed = false;
    async function ownsTemp() {
      await unchanged(guards);
      const s = await filesystem.lstat(temp);
      if (!s.isFile() || s.isSymbolicLink() || identity(s) !== tempId)
        throw failure("临时图片所有权变化，保留现场待核对", 409);
    }
    try {
      await unchanged(guards);
      handle = await filesystem.open(temp, "wx", 0o600);
      tempId = identity(await handle.stat());
      await ownsTemp();
      await handle.writeFile(bytes);
      await handle.sync();
      await handle.close();
      handle = null;
      await ownsTemp();
      // link 是不可覆盖的原子发布；并发相同图只采纳已有且校验通过的文件。
      try {
        await filesystem.link(temp, path);
      } catch (e) {
        if (e.code !== "EEXIST") throw e;
      }
      await ownsTemp();
      await filesystem.unlink(temp);
      removed = true;
      await read(metadata);
      return metadata;
    } finally {
      await handle?.close();
      if (tempId && !removed) {
        await ownsTemp();
        await filesystem.unlink(temp);
      }
    }
  }
  const pending = new Map();
  async function store(input) {
    if (
      !input ||
      typeof input !== "object" ||
      Array.isArray(input) ||
      Object.keys(input).some((k) => k !== "data") ||
      !(input.data instanceof Uint8Array) ||
      input.data.length > 8 * 1024 * 1024
    )
      return storeOne(input);
    const key = createHash("sha256").update(input.data).digest("hex");
    if (pending.has(key)) return pending.get(key);
    const operation = storeOne(input).finally(() => pending.delete(key));
    pending.set(key, operation);
    return operation;
  }
  return {
    store,
    read,
    async locate(input) {
      if (
        !input ||
        typeof input !== "object" ||
        Object.keys(input).some((k) => k !== "media") ||
        !Array.isArray(input.media) ||
        input.media.length > 32
      )
        throw failure("媒体定位请求无效");
      return Promise.all(
        input.media.map(async (m) => {
          const { data, ...result } = await read(m);
          return result;
        }),
      );
    },
  };
}
