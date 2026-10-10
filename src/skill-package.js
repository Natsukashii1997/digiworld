import { Inflate, zipSync, strToU8, strFromU8 } from "fflate";
import { safePath } from "./store.js";

const fail = (message) => {
  throw new Error(message);
};
export const fileBytes = (file) =>
  file.text ? strToU8(file.data) : new Uint8Array(file.data);

export function inspectSkill(files) {
  if (!files.length || files.length > 300) fail("最多支持 300 个文件与目录");
  const entries = files.filter(
    (f) => /(^|\/)SKILL\.md$/.test(f.path) && !f.directory,
  );
  if (!entries.length) fail("没有找到 SKILL.md，请导入完整 Skill 包");
  if (entries.length !== 1) fail("包含多个 SKILL.md，请分别导入每个 Skill");
  const entry = entries[0],
    root = entry.path.slice(0, -8);
  const content = strFromU8(fileBytes(entry));
  const frontmatter = content.match(
    /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/,
  )?.[1];
  const name = frontmatter?.match(
    /^name:\s*["']?([a-z0-9]+(?:-[a-z0-9]+)*)["']?\s*$/m,
  )?.[1];
  return {
    entry: entry.path,
    root,
    content,
    name: name && name.length <= 64 ? name : null,
    permissionsKnown: files.every((f) => f.mode !== undefined),
  };
}

export function validateSkillFiles(files) {
  const { root } = inspectSkill(files);
  const paths = new Map();
  let total = 0;
  for (const f of files) {
    if (
      !safePath(f.path) ||
      f.path.split("/").some((p) => p === ".") ||
      /[\x00-\x1f\x7f:]/.test(f.path)
    )
      fail("Skill 包含不安全路径");
    const key = f.path.normalize("NFC").toLowerCase();
    if (paths.has(key)) fail("Skill 包含重复或大小写冲突路径");
    paths.set(key, f.directory === true);
    if (
      root &&
      !f.path.startsWith(root) &&
      !(f.directory && root.startsWith(f.path + "/"))
    )
      fail("Skill 包含入口目录以外的文件，请分别打包");
    if (
      f.mode !== undefined &&
      (!Number.isInteger(f.mode) || f.mode < 0 || f.mode > 0o777)
    )
      fail("文件权限不安全");
    const data = fileBytes(f);
    if (f.directory && data.length) fail("目录不能包含文件字节");
    total += data.length;
    if (total > 25 * 1024 * 1024) fail("解压内容超过 25 MB 限制");
  }
  for (const path of paths.keys()) {
    const parts = path.split("/");
    for (let n = 1; n < parts.length; n++)
      if (paths.get(parts.slice(0, n).join("/")) === false)
        fail("Skill 包含文件与目录冲突");
  }
}

export function buildSkillZip(files) {
  for (const f of files.filter(
    (f) => f.text && /(^|\/)media-manifest\.json$/.test(f.path),
  )) {
    let manifest;
    try {
      manifest = JSON.parse(f.data);
    } catch {
      fail("媒体清单JSON无效，不能生成缺图包");
    }
    if (manifest?.kind !== "guiji-local-media/v1") continue;
    const root = f.path.slice(0, -"media-manifest.json".length);
    if (!Array.isArray(manifest.entries)) fail("Skill媒体清单无效");
    for (const m of manifest.entries) {
      const image = files.find(
        (x) => x.path === root + m.path && !x.directory && !x.text,
      );
      if (!image || fileBytes(image).length !== m.size)
        fail("媒体尚未展开；请用本机交付复制完整Skill，不能导出缺图包");
    }
  }
  validateSkillFiles(files);
  const entries = Object.create(null);
  for (const f of [...files].sort((a, b) => (a.path < b.path ? -1 : 1))) {
    const options = { level: 6, mtime: new Date(1980, 0, 1) };
    if (f.mode !== undefined) {
      options.os = 3;
      options.attrs = ((f.directory ? 0o40000 : 0o100000) | f.mode) << 16;
    }
    if (f.directory) options.attrs = (options.attrs || 0) | 16;
    entries[f.path + (f.directory ? "/" : "")] = [fileBytes(f), options];
  }
  return zipSync(entries);
}

// Inspect the central directory before inflation: fflate's filter doesn't expose
// Unix type/permissions and collapses duplicate names into one object key.
export function readSkillZip(bytes) {
  if (bytes.length > 10 * 1024 * 1024) fail("请导入 10 MB 以内的 ZIP 包");
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const u16 = (n) => view.getUint16(n, true),
    u32 = (n) => view.getUint32(n, true);
  let end = bytes.length - 22;
  while (
    end >= Math.max(0, bytes.length - 65557) &&
    (u32(end) !== 0x06054b50 || end + 22 + u16(end + 20) !== bytes.length)
  )
    end--;
  if (end < 0 || end < bytes.length - 65557) fail("ZIP 格式无效");
  const count = u16(end + 10),
    start = u32(end + 16);
  if (
    u16(end + 4) ||
    u16(end + 6) ||
    count !== u16(end + 8) ||
    start + u32(end + 12) !== end ||
    count === 65535
  )
    fail("不支持分卷或 ZIP64 格式");
  if (count > 300) fail("最多支持 300 个文件与目录");
  const metadata = [];
  let offset = start,
    total = 0;
  for (let n = 0; n < count; n++) {
    if (offset + 46 > end || u32(offset) !== 0x02014b50) fail("ZIP 目录损坏");
    const flags = u16(offset + 8),
      compression = u16(offset + 10),
      size = u32(offset + 24);
    const length = u16(offset + 28),
      next = offset + 46 + length + u16(offset + 30) + u16(offset + 32);
    if (next > end || flags & 1 || ![0, 8].includes(compression))
      fail("不支持加密或此压缩格式");
    const encoded = bytes.subarray(offset + 46, offset + 46 + length);
    if (!(flags & 2048) && encoded.some((b) => b > 127))
      fail("文件名需使用 UTF-8 编码");
    const name = new TextDecoder("utf-8", { fatal: true }).decode(encoded);
    const unix = [3, 19].includes(bytes[offset + 5]),
      attrs = u32(offset + 38),
      mode = attrs >>> 16,
      kind = mode & 0o170000;
    if (unix && kind && ![0o100000, 0o40000].includes(kind))
      fail("不支持符号链接或特殊文件");
    if (unix && mode & 0o7000) fail("文件包含不安全特殊权限");
    const directory = name.endsWith("/");
    if (
      (((unix && kind === 0o40000) || attrs & 16) && !directory) ||
      (directory && unix && kind === 0o100000)
    )
      fail("ZIP 文件类型不一致");
    const local = u32(offset + 42),
      compressed = u32(offset + 20);
    if (
      local + 30 > start ||
      u32(local) !== 0x04034b50 ||
      u16(local + 6) !== flags ||
      u16(local + 8) !== compression
    )
      fail("ZIP 文件头不一致");
    const dataStart = local + 30 + u16(local + 26) + u16(local + 28);
    if (
      dataStart + compressed > start ||
      u16(local + 26) !== length ||
      !encoded.every((b, i) => b === bytes[local + 30 + i])
    )
      fail("ZIP 文件头或长度损坏");
    total += size;
    if (total > 25 * 1024 * 1024) fail("解压内容超过 25 MB 限制");
    metadata.push({
      name,
      path: directory ? name.slice(0, -1) : name,
      directory,
      size,
      crc: u32(offset + 16),
      dataStart,
      compressed,
      compression,
      ...(unix && mode ? { mode: mode & 0o777 } : {}),
    });
    offset = next;
  }
  if (offset !== end) fail("ZIP 目录长度不一致");
  // Validate every path/type before decoding any file.
  validateSkillFiles(
    metadata.map((f) => ({ ...f, data: new Uint8Array(), text: false })),
  );
  const files = metadata.map(
    ({
      path,
      directory,
      mode,
      size,
      crc,
      dataStart,
      compressed,
      compression,
    }) => {
      const compressedBytes = bytes.subarray(dataStart, dataStart + compressed);
      const data =
        compression === 0
          ? compressedBytes.slice()
          : inflateBounded(compressedBytes, size);
      if (!data || data.length !== size || crc32(data) !== crc)
        fail("ZIP 文件校验失败，请重新打包");
      return {
        path,
        data,
        text: false,
        ...(directory ? { directory: true } : {}),
        ...(mode === undefined ? {} : { mode }),
      };
    },
  );
  files.sort((a, b) => (a.path < b.path ? -1 : 1));
  return { files, ...inspectSkill(files) };
}

// Decode only validated entry slices. Small compressed chunks bound intermediate
// buffers; stop as soon as actual output exceeds the declared, capped length.
function inflateBounded(compressed, size) {
  const output = new Uint8Array(size);
  let written = 0;
  const stream = new Inflate((chunk) => {
    if (written + chunk.length > size)
      fail("ZIP 实际展开长度超过声明，请重新打包");
    output.set(chunk, written);
    written += chunk.length;
  });
  for (let offset = 0; offset < compressed.length; offset += 1024)
    stream.push(
      compressed.subarray(offset, offset + 1024),
      offset + 1024 >= compressed.length,
    );
  if (!compressed.length || written !== size) fail("ZIP 展开长度不一致");
  return output;
}

function crc32(data) {
  let crc = -1;
  for (const byte of data) {
    crc ^= byte;
    for (let n = 0; n < 8; n++) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
  }
  return (crc ^ -1) >>> 0;
}
