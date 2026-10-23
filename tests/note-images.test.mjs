import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createHash } from 'node:crypto';
import { createNoteImages } from '../server/note-images.mjs';

const png = () => new Uint8Array(Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=', 'base64'));
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
async function fixture(run) {
  const root = await fs.realpath(await fs.mkdtemp(join(tmpdir(), 'workbench-note-images-')));
  try { await run(root, createNoteImages(root)); }
  finally { await fs.rm(root, { recursive: true, force: true }); }
}

test('便签图片按内容寻址保存、权限固定，新实例回读不依赖内存或主库', () => fixture(async (root, images) => {
  const data = png(), stored = await images.store({ data });
  assert.deepEqual(stored, { id: `${sha(data)}.png`, type: 'image/png', size: data.length });
  assert.deepEqual(await createNoteImages(root).read(stored.id), { ...stored, data });
  assert.equal((await fs.stat(join(root, 'note-images'))).mode & 0o777, 0o700);
  assert.equal((await fs.stat(join(root, 'note-images', stored.id))).mode & 0o777, 0o600);
  assert.deepEqual(await fs.readdir(root), ['note-images']);
}));

test('相同图片重复、同实例和不同实例并发均去重，来源字节后续修改不影响已提交内容', () => fixture(async (root, images) => {
  const bytes = png(), original = new Uint8Array(bytes);
  const first = images.store({ data: bytes }); bytes[bytes.length - 1] ^= 1;
  const results = await Promise.all([first, ...Array.from({ length: 5 }, (_, index) =>
    (index % 2 ? createNoteImages(root) : images).store({ data: original }))]);
  assert.ok(results.every(value => value.id === results[0].id));
  assert.deepEqual(await fs.readdir(join(root, 'note-images')), [results[0].id]);
  assert.deepEqual((await images.read(results[0].id)).data, original);
  assert.equal((await fs.stat(join(root, 'note-images', results[0].id))).nlink, 1);
}));

test('缺失图片读取为404且不创建目录；编号、额外字段、空图、格式和超限拒绝', () => fixture(async (root, images) => {
  await assert.rejects(images.read(`${'a'.repeat(64)}.png`), { status: 404 });
  assert.deepEqual(await fs.readdir(root), []);
  for (const id of [null, '../image.png', `${'A'.repeat(64)}.png`, `${'a'.repeat(64)}.svg`, `${'a'.repeat(64)}.png/extra`])
    await assert.rejects(images.read(id), { status: 400 });
  for (const input of [null, [], {}, { data: [] }, { data: png(), path: '../x' }, { data: new Uint8Array() }, { data: new Uint8Array(20) }])
    await assert.rejects(images.store(input), { status: 400 });
  await assert.rejects(images.store({ data: new Uint8Array(8 * 1024 * 1024 + 1) }), { status: 413 });
  assert.deepEqual(await fs.readdir(root), []);
}));

test('支持 PNG/JPG/WebP 签名，ID后缀与实际格式不符拒绝', () => fixture(async (root, images) => {
  for (const [extension, type, data] of [
    ['png', 'image/png', png()],
    ['jpg', 'image/jpeg', new Uint8Array([255, 216, 255, 224, 0, 0, 0, 0, 0, 0, 0, 0])],
    ['webp', 'image/webp', new Uint8Array([82, 73, 70, 70, 4, 0, 0, 0, 87, 69, 66, 80])],
  ]) {
    const stored = await images.store({ data });
    assert.equal(stored.id, `${sha(data)}.${extension}`);
    assert.equal(stored.type, type);
  }
  const stored = await images.store({ data: png() });
  const wrongId = stored.id.replace(/\.png$/, '.jpg');
  await fs.rename(join(root, 'note-images', stored.id), join(root, 'note-images', wrongId));
  await assert.rejects(images.read(wrongId), /格式|SHA256/);
}));

test('符号链接、硬链接、内容篡改和宽权限不被读取或当成去重成功', () => fixture(async (root, images) => {
  const stored = await images.store({ data: png() }), path = join(root, 'note-images', stored.id);
  await fs.link(path, join(root, 'hardlink'));
  await assert.rejects(images.read(stored.id), { status: 409 });
  await fs.unlink(join(root, 'hardlink'));
  await fs.chmod(path, 0o644);
  await assert.rejects(images.read(stored.id), { status: 409 });
  await fs.chmod(path, 0o600);
  const modified = png(); modified[modified.length - 1] ^= 1;
  await fs.writeFile(path, modified);
  await assert.rejects(images.read(stored.id), /SHA256/);
  await assert.rejects(images.store({ data: png() }), /SHA256/);
  await fs.unlink(path);
  await fs.writeFile(join(root, 'target'), png(), { mode: 0o600 });
  await fs.symlink(join(root, 'target'), path);
  await assert.rejects(images.read(stored.id), { status: 409 });
  await assert.rejects(images.store({ data: png() }), { status: 409 });
}));

test('图片目录链接、祖先链接及服务持有的目录被替换时拒绝', () => fixture(async (root, images) => {
  const target = join(root, 'target'); await fs.mkdir(target, { mode: 0o700 });
  await fs.symlink(target, join(root, 'note-images'));
  await assert.rejects(images.store({ data: png() }), { status: 409 });
  await fs.unlink(join(root, 'note-images'));
  const stored = await images.store({ data: png() });
  const alias = join(root, 'alias'); await fs.symlink(root, alias);
  await assert.rejects(createNoteImages(alias).read(stored.id), { status: 409 });
  await fs.rename(join(root, 'note-images'), join(root, 'old-images'));
  await fs.mkdir(join(root, 'note-images'), { mode: 0o700 });
  await assert.rejects(images.read(stored.id), { status: 409 });
  await assert.rejects(images.store({ data: png() }), { status: 409 });
}));

test('打开文件时被同名替换不能绕过单FD身份校验', () => fixture(async (root, images) => {
  const stored = await images.store({ data: png() }), path = join(root, 'note-images', stored.id);
  let replaced = false;
  const filesystem = new Proxy(fs, { get(target, key) {
    if (key !== 'open') return target[key];
    return async (name, ...rest) => {
      if (name === path && !replaced) {
        replaced = true;
        await fs.rename(path, join(root, 'old-image'));
        await fs.writeFile(path, png(), { mode: 0o600 });
      }
      return target.open(name, ...rest);
    };
  } });
  await assert.rejects(createNoteImages(root, { filesystem }).read(stored.id), /身份变化/);
}));

test('部分写入、同步和发布磁盘失败均不留下半成品或临时文件，可明确重试', () => fixture(async (root) => {
  for (const stage of ['writeFile', 'sync', 'link']) {
    const filesystem = new Proxy(fs, { get(target, key) {
      if (key === 'link' && stage === 'link') return async () => { throw Object.assign(Error('synthetic publish full'), { code: 'ENOSPC' }); };
      if (key !== 'open' || stage === 'link') return target[key];
      return async (name, ...rest) => {
        const handle = await target.open(name, ...rest);
        if (!String(name).includes('.upload-')) return handle;
        return new Proxy(handle, { get(opened, method) {
          if (method === stage) return async (...args) => {
            if (method === 'writeFile') await opened.writeFile(args[0].slice(0, 8));
            throw Object.assign(Error(`synthetic ${stage} full`), { code: 'ENOSPC' });
          };
          const value = opened[method]; return typeof value === 'function' ? value.bind(opened) : value;
        } });
      };
    } });
    await assert.rejects(createNoteImages(root, { filesystem }).store({ data: png() }), { code: 'ENOSPC' });
    assert.deepEqual(await fs.readdir(join(root, 'note-images')), []);
  }
  const images = createNoteImages(root), stored = await images.store({ data: png() });
  assert.deepEqual((await images.read(stored.id)).data, png());
}));
