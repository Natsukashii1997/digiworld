// 便签图片只保存在当前数据根内；正文和恢复草稿仅引用内容寻址 ID。
import fs from 'node:fs/promises';
import { constants } from 'node:fs';
import { join, resolve, parse } from 'node:path';
import { createHash, randomBytes } from 'node:crypto';
import { sniffImage } from './image-type.mjs';
import { failure } from './repository.mjs';

const MAX_BYTES = 8 * 1024 * 1024;
const ID = /^([a-f0-9]{64})\.(png|jpg|webp)$/;
const MIME = { png: 'image/png', jpg: 'image/jpeg', webp: 'image/webp' };
const identity = value => [value.dev, value.ino, value.birthtimeMs].join(':');
const digest = data => createHash('sha256').update(data).digest('hex');
const metadata = ({ id, type, size }) => ({ id, type, size });

export function createNoteImages(directory, { filesystem = fs } = {}) {
  const dataRoot = resolve(directory), root = join(dataRoot, 'note-images');
  let dataChain, imagesIdentity;
  const pending = new Map();

  async function unchanged(items) {
    for (const item of items) {
      const info = await filesystem.lstat(item.path);
      if (!info.isDirectory() || info.isSymbolicLink() || identity(info) !== item.id)
        throw failure('便签图片目录身份已变化', 409);
    }
  }

  async function chain(create = false) {
    const ancestors = [];
    let cursor = parse(dataRoot).root;
    for (const part of dataRoot.slice(cursor.length).split('/').filter(Boolean)) {
      cursor = join(cursor, part);
      const info = await filesystem.lstat(cursor);
      if (!info.isDirectory() || info.isSymbolicLink())
        throw failure('便签图片祖先不能是链接或非目录', 409);
      ancestors.push({ path: cursor, id: identity(info) });
    }
    if (!ancestors.length) {
      const info = await filesystem.lstat(dataRoot);
      if (!info.isDirectory() || info.isSymbolicLink()) throw failure('便签数据目录无效', 409);
      ancestors.push({ path: dataRoot, id: identity(info) });
    }
    if (await filesystem.realpath(dataRoot) !== dataRoot)
      throw failure('便签数据目录身份无效', 409);
    if (dataChain) await unchanged(dataChain);
    else dataChain = ancestors;
    await unchanged(ancestors);
    if (create && !imagesIdentity) {
      try { await filesystem.mkdir(root, { mode: 0o700 }); }
      catch (error) { if (error.code !== 'EEXIST') throw error; }
    }
    let info;
    try { info = await filesystem.lstat(root); }
    catch (error) {
      if (error.code === 'ENOENT' && imagesIdentity)
        throw failure('便签图片目录身份已变化', 409);
      throw error;
    }
    if (!info.isDirectory() || info.isSymbolicLink() ||
        (info.mode & 0o777) !== 0o700 ||
        await filesystem.realpath(root) !== join(dataRoot, 'note-images'))
      throw failure('便签图片目录身份或权限无效', 409);
    if (imagesIdentity && identity(info) !== imagesIdentity)
      throw failure('便签图片目录身份已变化', 409);
    imagesIdentity = identity(info);
    await unchanged(ancestors);
    return [...ancestors, { path: root, id: imagesIdentity }];
  }

  async function read(id) {
    const match = typeof id === 'string' && ID.exec(id);
    if (!match) throw failure('便签图片编号无效');
    let handle;
    try {
      const guards = await chain(), path = join(root, id);
      await unchanged(guards);
      const before = await filesystem.lstat(path);
      if (!before.isFile() || before.isSymbolicLink() || before.nlink !== 1 ||
          before.size <= 0 || before.size > MAX_BYTES || (before.mode & 0o777) !== 0o600)
        throw failure('便签图片身份、权限或大小不符', 409);
      await unchanged(guards);
      handle = await filesystem.open(path, constants.O_RDONLY | constants.O_NOFOLLOW);
      const opened = await handle.stat();
      if (!opened.isFile() || opened.nlink !== 1 || identity(opened) !== identity(before))
        throw failure('便签图片读取时身份变化', 409);
      await unchanged(guards);
      const bytes = new Uint8Array(before.size + 1);
      let count = 0;
      while (count < bytes.length) {
        const result = await handle.read(bytes, count, bytes.length - count, count);
        if (!result.bytesRead) break;
        count += result.bytesRead;
      }
      const after = await handle.stat(), named = await filesystem.lstat(path);
      if (count !== before.size || identity(after) !== identity(before) ||
          identity(named) !== identity(before) || after.mtimeMs !== before.mtimeMs ||
          after.size !== before.size || named.nlink !== 1 || (named.mode & 0o777) !== 0o600)
        throw failure('便签图片读取期间变化', 409);
      const data = bytes.slice(0, count);
      if (sniffImage(data) !== match[2] || digest(data) !== match[1])
        throw failure('便签图片格式或 SHA256 校验失败', 409);
      await unchanged(guards);
      return { id, type: MIME[match[2]], size: count, data };
    } catch (error) {
      if (error.code === 'ENOENT') throw failure('本机便签图片不存在，请恢复完整备份或重新粘贴', 404);
      throw error;
    } finally { await handle?.close(); }
  }

  async function storeOne(data, id, type) {
    const result = { id, type, size: data.length };
    const guards = await chain(true), path = join(root, id);
    try { return metadata(await read(id)); }
    catch (error) { if (error.status !== 404) throw error; }
    const temp = join(root, `.upload-${randomBytes(10).toString('hex')}`);
    let handle, tempIdentity, removed = false;
    async function ownsTemp() {
      await unchanged(guards);
      const info = await filesystem.lstat(temp);
      if (!info.isFile() || info.isSymbolicLink() || identity(info) !== tempIdentity)
        throw failure('临时便签图片所有权变化，保留现场待核对', 409);
    }
    try {
      await unchanged(guards);
      handle = await filesystem.open(temp, 'wx', 0o600);
      tempIdentity = identity(await handle.stat());
      await ownsTemp();
      await handle.writeFile(data);
      await handle.sync();
      await handle.close(); handle = null;
      await ownsTemp();
      // 不覆盖已有实体；同图并发只采纳回读校验通过的内容。
      try { await filesystem.link(temp, path); }
      catch (error) { if (error.code !== 'EEXIST') throw error; }
      await ownsTemp();
      await filesystem.unlink(temp); removed = true;
      const stored = await read(id);
      if (stored.size !== result.size || stored.type !== result.type)
        throw failure('便签图片保存回读不符', 409);
      return result;
    } finally {
      await handle?.close();
      if (tempIdentity && !removed) { await ownsTemp(); await filesystem.unlink(temp); }
    }
  }

  async function store(input) {
    if (!input || typeof input !== 'object' || Array.isArray(input) ||
        Object.keys(input).some(key => key !== 'data') || !(input.data instanceof Uint8Array))
      throw failure('便签图片请求无效');
    if (!input.data.length) throw failure('便签图片不能为空');
    if (input.data.length > MAX_BYTES) throw failure('单张便签图片不能超过 8 MB', 413);
    const data = new Uint8Array(input.data), kind = sniffImage(data);
    if (!kind) throw failure('只支持 PNG、JPG、WebP 图片');
    const id = `${digest(data)}.${kind}`;
    if (pending.has(id)) return pending.get(id);
    const operation = storeOne(data, id, MIME[kind]).finally(() => pending.delete(id));
    pending.set(id, operation);
    return operation;
  }
  return { store, read };
}
