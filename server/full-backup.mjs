// 完整备份（路线 v3 5.1；产品定义 v1.1 §4.8）：整个数据目录打包为单个 zip（fflate），
// 内含 manifest.json（每个文件的路径、大小、SHA256）与 data/<相对路径>。
// 恢复只写到一个新的数据目录副本：先在同级暂存目录写出并逐个校验、确认主库可读，再改名为目标；
// 从不覆盖当前数据目录。切换到恢复出的目录由用户手动完成（停止工作台后改 WORKBENCH_DATA_DIR 或改名）。
// 普通导出（/api/backup，JSON 合并）保持现状。
import { lstat, mkdir, open, readdir, readFile, rename, rm } from "node:fs/promises";
import { basename, dirname, join, relative, resolve, isAbsolute } from "node:path";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { unzipSync, zipSync, strToU8, strFromU8 } from "fflate";
import { openRepository } from "./repository.mjs";
import { createBackupRecords } from "./backup-records.mjs";
import { FULL_BACKUP_LIMITS as LIMITS, FULL_BACKUP_LIMIT_MESSAGE } from "../src/full-backup-contract.js";

import {createRestoreOperations, RESTORE_MARKER, restoreId} from "./full-backup-operations.mjs";

export const BACKUP_FORMAT = "workbench-full-backup";
const fail = (message, status = 400) => Object.assign(new Error(message), { status });
const sha = (bytes) => createHash("sha256").update(bytes).digest("hex");

// 不进入备份的运行时文件：主库写锁（含 SQLite 附属文件）、各模块写入中的临时文件、系统杂项。
function excluded(path) {
  const name = path.split("/").at(-1);
  return (
    /^\.writer-lock\.sqlite(-journal|-wal|-shm)?$/.test(path) ||
    /^\.CURRENT-.+\.tmp$/.test(name) ||
    /^\.guiji-config-.+\.tmp$/.test(name) ||
    /^\.upload-/.test(name) ||
    /^\..+-[0-9a-f-]{36}\.tmp$/.test(name) ||
    name === ".DS_Store" || path === RESTORE_MARKER
  );
}

function safePath(path) {
  return (
    typeof path === "string" &&
    path.length > 0 &&
    path.length <= 1024 &&
    !path.includes("\\") &&
    !path.includes("\0") &&
    !path.startsWith("/") &&
    path.split("/").every((part) => part && part !== "." && part !== "..")
  );
}

// 不随完整备份的目录：路径 → 写进清单 skipped 的原因。设置页「需打包」的统计（storage-status.mjs）用同一张表。
export const BACKUP_SKIPPED_DIRECTORIES = Object.freeze({
  "reverse-evidence": "REA原始证据不随备份，请单独复制reverse-evidence目录；摘要和日志已保留",
  // 语音识别模型约 256 MB，地址、大小和哈希固定在 local-speech-model.mjs，缺了会按哈希重新下载（#118）。
  "collection/models": "语音识别模型不随备份：恢复后第一次转写视频时会自动重新下载（约 256 MB，需能访问 huggingface.co），也可以手动复制 collection/models 目录",
});
const RETIRED_SILVER = "silver";
// 这个数据目录相对路径会不会进新生成的完整备份（不判断符号链接等文件类型，由遍历方自己处理）。
export function inBackupScope(path) {
  if (excluded(path)) return false;
  return ![...Object.keys(BACKUP_SKIPPED_DIRECTORIES), RETIRED_SILVER].some((dir) => path === dir || path.startsWith(dir + "/"));
}

// 遍历数据目录：只收普通文件；符号链接与其他类型不跟随，记入 skipped。
async function walk(root, { omitSilver = false } = {}) {
  const files = [],
    skipped = [];
  async function visit(dir, prefix) {
    const names = (await readdir(dir)).sort();
    for (const name of names) {
      const path = prefix ? `${prefix}/${name}` : name;
      if (excluded(path)) continue;
      if (BACKUP_SKIPPED_DIRECTORIES[path]) { skipped.push({ path, reason: BACKUP_SKIPPED_DIRECTORIES[path] }); continue; }
      // 旧备份恢复后可能仍有退役目录；不让它进入新生成的备份。
      if(omitSilver && path === RETIRED_SILVER){skipped.push({path,reason:"退役银饰图片目录不进入新备份"});continue;}
      const full = join(dir, name);
      const info = await lstat(full);
      if (info.isSymbolicLink()) skipped.push({ path, reason: "符号链接不跟随" });
      else if (info.isDirectory()) await visit(full, path);
      else if (info.isFile()) files.push(path);
      else skipped.push({ path, reason: "不是普通文件" });
    }
  }
  await visit(root, "");
  return { files: files.sort(), skipped };
}

// 主库指针与快照是否一致：CURRENT.json → snapshots/<file> 的 SHA256 与修订号。
function mainDatabase(read) {
  const pointer = read("CURRENT.json");
  if (!pointer) return null;
  let head;
  try {
    head = JSON.parse(strFromU8(pointer));
  } catch {
    throw fail("备份中的主库指针无法解析");
  }
  const snapshot =
    typeof head?.file === "string" && /^\d+-[a-f0-9-]+\.json$/.test(head.file)
      ? read(`snapshots/${head.file}`)
      : null;
  if (!snapshot || sha(snapshot) !== head.sha256 || !Number.isSafeInteger(head.revision))
    throw fail("备份中的主库快照与指针不一致");
  return { revision: head.revision, file: head.file };
}

export async function packDirectory(directory, { clock = Date.now } = {}) {
  const { files: paths, skipped } = await walk(directory, { omitSilver:true });
  if (paths.length > LIMITS.files) throw fail("数据目录文件过多，无法打包", 413);
  const entries = {},
    files = [];
  let total = 0;
  for (const path of paths) {
    const pathOnDisk = join(directory, ...path.split("/"));
    if (total + (await lstat(pathOnDisk)).size > LIMITS.dataBytes) throw fail("需打包的数据超过 1 GiB，无法打包为单个文件",413);
    const bytes = await readFile(pathOnDisk);
    total += bytes.length;
    if (total > LIMITS.dataBytes) throw fail("需打包的数据超过 1 GiB，无法打包为单个文件", 413);
    entries[`data/${path}`] = bytes;
    files.push({ path, size: bytes.length, sha256: sha(bytes) });
  }
  const byPath = new Map(files.map((f) => [f.path, entries[`data/${f.path}`]]));
  mainDatabase((p) => byPath.get(p));
  const manifest = {
    format: BACKUP_FORMAT,
    schema: 1,
    createdAt: new Date(clock()).toISOString(),
    totalBytes: total,
    files,
    skipped,
  };
  entries["manifest.json"] = strToU8(JSON.stringify(manifest, null, 2));
  if (entries["manifest.json"].length > LIMITS.manifestBytes) throw fail("完整备份清单超过 64 MiB 上限", 413);
  const bytes = zipSync(entries, { level: 6 });
  if (bytes.length > LIMITS.archiveBytes) throw fail(FULL_BACKUP_LIMIT_MESSAGE, 413);
  return { bytes, manifest };
}

// 解包并逐项核对：清单格式、路径安全、文件集合与清单完全一致、每个文件大小与 SHA256。
export function inspectBackup(bytes) {
  if (!(bytes instanceof Uint8Array) || bytes.length === 0) throw fail("完整备份文件为空");
  if (bytes.length > LIMITS.archiveBytes) throw fail(FULL_BACKUP_LIMIT_MESSAGE, 413);
  let declared = 0,
    count = 0,
    entries;
  const names = new Set();
  try {
    entries = unzipSync(bytes, {
      filter(file) {
        if (names.has(file.name)) throw fail("完整备份含重复文件");
        names.add(file.name);
        if (!Number.isSafeInteger(file.originalSize) || file.originalSize < 0) throw fail("完整备份文件大小无效");
        if (file.compression === 0 && file.size !== file.originalSize) throw fail("完整备份文件大小声明不一致");
        if (file.name === "manifest.json") {
          if (file.originalSize > LIMITS.manifestBytes) throw fail("完整备份清单超过 64 MiB 上限", 413);
        } else declared += file.originalSize;
        if (++count > LIMITS.files + 1 || declared > LIMITS.dataBytes) throw fail("完整备份解压后过大", 413);
        return true;
      },
    });
  } catch (error) {
    if (error.status) throw error;
    throw fail("不是有效的完整备份文件（无法解压）");
  }
  if (!entries["manifest.json"]) throw fail("完整备份缺少清单 manifest.json");
  if (entries["manifest.json"].length > LIMITS.manifestBytes) throw fail("完整备份清单超过 64 MiB 上限",413);
  if (Object.entries(entries).reduce((n,[name,raw])=>n+(name === "manifest.json" ? 0 : raw.length),0) > LIMITS.dataBytes) throw fail("完整备份解压后过大",413);
  let manifest;
  try {
    manifest = JSON.parse(strFromU8(entries["manifest.json"]));
  } catch {
    throw fail("完整备份清单无法解析");
  }
  if (manifest?.format !== BACKUP_FORMAT || manifest.schema !== 1 || !Array.isArray(manifest.files))
    throw fail("不是本工作台的完整备份文件（格式或版本不符）");
  const seen = new Set();
  for (const file of manifest.files) {
    if (
      !safePath(file?.path) || file.path === RESTORE_MARKER ||
      !Number.isSafeInteger(file.size) || file.size < 0 ||
      !/^[a-f0-9]{64}$/.test(file.sha256 || "") ||
      seen.has(file.path)
    )
      throw fail("完整备份清单含有无效或越界的路径");
    seen.add(file.path);
  }
  const extra = Object.keys(entries).filter(
    (name) => name !== "manifest.json" && !(name.startsWith("data/") && seen.has(name.slice(5))),
  );
  if (extra.length) throw fail(`完整备份含有清单之外的文件：${extra[0]}`);
  const files = new Map();
  let total = 0;
  for (const file of manifest.files) {
    const data = entries[`data/${file.path}`];
    if (!data) throw fail(`完整备份缺少清单中的文件：${file.path}`);
    if (data.length !== file.size || sha(data) !== file.sha256)
      throw fail(`完整备份校验失败：${file.path} 的 SHA256 与清单不一致，文件可能被篡改`);
    files.set(file.path, data);
    total += data.length;
  }
  if (total !== manifest.totalBytes || total > LIMITS.dataBytes || manifest.files.length > LIMITS.files) throw fail("完整备份清单总量与文件不一致");
  return { manifest, files, mainDatabase: mainDatabase((p) => files.get(p)) };
}

export async function previewRestore(directory, bytes) {
  const { manifest, files, mainDatabase: db } = inspectBackup(bytes);
  const current = new Map();
  for (const path of (await walk(directory)).files)
    current.set(path, sha(await readFile(join(directory, ...path.split("/")))));
  const summary = { added: [], conflict: [], missing: [], same: 0 };
  for (const file of manifest.files) {
    const have = current.get(file.path);
    if (have === undefined) summary.added.push(file.path);
    else if (have !== file.sha256) summary.conflict.push(file.path);
    else summary.same++;
  }
  summary.missing = [...current.keys()].filter((path) => !files.has(path));
  return { manifest, summary, mainDatabase: db };
}

const within = (parent, child) => {
  const rel = relative(parent, child);
  return rel === "" || (!rel.startsWith("..") && !isAbsolute(rel));
};

async function exists(path) {
  try {
    await lstat(path);
    return true;
  } catch (error) {
    if (error.code === "ENOENT") return false;
    throw error;
  }
}

async function durableWrite(path, bytes) {
  const handle = await open(path, "wx", 0o600);
  try {
    await handle.writeFile(bytes);
    await handle.sync();
  } finally {
    await handle.close();
  }
}

// 恢复到新的数据目录：目标必须不存在，且与当前目录互不包含。
export async function restoreTo(bytes, target, { current, marker, afterRename } = {}) {
  const { manifest, files } = inspectBackup(bytes);
  target = resolve(target);
  if (current && (within(resolve(current), target) || within(target, resolve(current))))
    throw fail("恢复目标不能是当前数据目录、其子目录或上级目录", 409);
  if (await exists(target)) throw fail("恢复目标已存在，不覆盖已有目录", 409);
  const staging = join(dirname(target), `.${basename(target)}.partial-${randomBytes(6).toString("hex")}`);
  await mkdir(staging, { mode: 0o700 });
  try {
    for (const file of manifest.files) {
      const parts = file.path.split("/");
      if (parts.length > 1) await mkdir(join(staging, ...parts.slice(0, -1)), { recursive: true, mode: 0o700 });
      await durableWrite(join(staging, ...parts), files.get(file.path));
    }
    // 写后回读：逐个文件重新计算 SHA256。
    let verified = 0;
    for (const file of manifest.files) {
      const raw = await readFile(join(staging, ...file.path.split("/")));
      if (sha(raw) !== file.sha256) throw fail(`恢复后校验失败：${file.path}`, 500);
      verified++;
    }
    // 主库能被工作台按正常流程打开并通过校验（打开会建立写锁文件，随即关闭）。
    let db = null;
    if (files.has("CURRENT.json")) {
      const repository = await openRepository(staging);
      try {
        const state = await repository.read();
        db = { revision: state.revision };
      } finally {
        await repository.close();
      }
    }
    if (await exists(target)) throw fail("恢复目标已存在，不覆盖已有目录", 409);
    if (marker) await durableWrite(join(staging, RESTORE_MARKER), JSON.stringify(marker));
    const staged = await open(staging, "r");
    try { await staged.sync(); } finally { await staged.close(); }
    await rename(staging, target);
    const parent = await open(dirname(target), "r");
    try { await parent.sync(); } finally { await parent.close(); }
    await afterRename?.();
    return { target, verified, mainDatabase: db };
  } catch (error) {
    await rm(staging, { recursive: true, force: true });
    throw error;
  }
}

const pad = (n) => String(n).padStart(2, "0");
const stamp = (ms) => {
  const d = new Date(ms);
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
};

export function createFullBackup(repository, { clock = Date.now, records = createBackupRecords(repository.directory, { clock }), afterRename } = {}) {
  const directory = resolve(repository.directory);
  const previews = new Map(), active = new Set();
  const operations = createRestoreOperations(directory);
  function prune() {
    for (const [token, item] of previews) if (item.expires <= clock()) previews.delete(token);
  }
  return {
    async create() {
      // 在主库写队列内打包，打包期间主库不会提交新修订。
      const { bytes, manifest, operation } = await repository.withSnapshot({}, async () => {
        const packed = await packDirectory(directory, { clock });
        inspectBackup(packed.bytes); // 服务端重新解包核对 SHA256，成功后才留生成回执。
        const operation = await records.record({ sha256:sha(packed.bytes),bytes:packed.bytes.length,files:packed.manifest.files.length });
        return { ...packed,operation };
      });
      return {
        filename: `数码世界-完整备份-${stamp(clock())}.zip`,
        bytes,
        operation,
        manifest: { createdAt: manifest.createdAt, totalBytes: manifest.totalBytes, files: manifest.files, skipped: manifest.skipped },
      };
    },
    async preview(input) {
      const bytes = input?.bytes;
      if (!(bytes instanceof Uint8Array)) throw fail("请选择完整备份文件（.zip）");
      if (bytes.length > LIMITS.archiveBytes) throw fail(FULL_BACKUP_LIMIT_MESSAGE, 413);
      const result = await previewRestore(directory, bytes);
      prune();
      const operationId = randomUUID(), target = operations.target(operationId);
      const token = randomBytes(16).toString("hex");
      previews.clear(); // 只保留最近一次预览，避免在内存中积压大文件
      previews.set(token, { bytes, target, operationId, expires: clock() + 10 * 60 * 1000 });
      const current = await repository.read().catch(() => null);
      return {
        token,
        operationId,
        target,
        current: { directory, revision: current?.revision ?? null },
        backup: {
          createdAt: result.manifest.createdAt,
          files: result.manifest.files.length,
          totalBytes: result.manifest.totalBytes,
          skipped: result.manifest.skipped || [],
        },
        mainDatabase: result.mainDatabase,
        summary: result.summary,
      };
    },
    async scope() { return {identity:await operations.scope()}; },
    operation(id) { return operations.result(id, {running:active.has(id)}); },
    async restore(input) {
      prune();
      const item = previews.get(input?.token), id = input?.operationId || item?.operationId;
      if (!restoreId(id)) throw Object.assign(fail("预览已失效，请重新选择备份文件并预览",409),{operationNotStarted:true});
      if (active.has(id)) return {operationId:id,status:'processing'};
      active.add(id);
      try {
        const existing = await operations.get(id);
        if (existing) {
          if (sha(String(input?.token)) !== existing.tokenSha) throw fail('恢复编号与原预览不一致，请核对原操作',409);
          return operations.result(id);
        }
        if (!item || item.operationId !== id) throw Object.assign(fail("预览已失效，请重新选择备份文件并预览",409),{operationNotStarted:true});
        const {manifest,mainDatabase} = inspectBackup(item.bytes);
        const plan = await operations.prepare({id,bytes:item.bytes,token:input.token,manifest,mainDatabase,at:new Date(clock()).toISOString()});
        previews.delete(input.token);
        try {
          const result = await restoreTo(item.bytes, item.target, {current:directory,marker:operations.marker(plan),afterRename});
          await operations.complete(id,new Date(clock()).toISOString());
          return {...result,operationId:id,status:'complete'};
        } catch (cause) {
          throw Object.assign(fail('恢复结果待核对，请使用原操作编号查询，不要重复恢复',503),{unknownResult:true,cause});
        }
      } finally {active.delete(id);}
    },
    close() {
      previews.clear();
    },
  };
}
