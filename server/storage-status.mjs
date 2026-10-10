import fs from "node:fs/promises";
import { join, resolve } from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { createBackupRecords } from "./backup-records.mjs";
import { failure } from "./repository.mjs";

const exec = promisify(execFile);
const identity = (info) => [info.dev,info.ino,info.birthtimeMs].join(":");
const relativeParts = (input) => {
  if (typeof input !== "string" || input.length > 1024 || /[\\\x00-\x1f\x7f]/.test(input))
    throw failure("只允许数据目录内的相对路径");
  if (input === "") return [];
  const parts = input.split("/");
  if (parts.some((part) => !part || part === "." || part === ".."))
    throw failure("路径不能越出数据目录");
  return parts;
};
function shape(input) {
  if (!input || typeof input !== "object" || Array.isArray(input) ||
      Object.keys(input).some((key) => key !== "path")) throw failure("访达请求字段无效");
}

// 只计算普通单链接文件的逻辑字节数。跳过链接和特殊类型，不读取任何文件正文。
export async function measureDataDirectory(directory, { filesystem = fs, limit = 100000 } = {}) {
  const root = resolve(directory), rootInfo = await filesystem.lstat(root);
  if (!rootInfo.isDirectory() || rootInfo.isSymbolicLink()) throw failure("数据目录身份无效",409);
  const canonical = await filesystem.realpath(root), checks = [], skipped = [];
  let bytes = 0, files = 0, entries = 0;
  async function visit(path, relative) {
    const before = await filesystem.lstat(path);
    if (!before.isDirectory() || before.isSymbolicLink() ||
        await filesystem.realpath(path) !== (relative ? join(canonical,relative) : canonical))
      throw failure("目录扫描期间身份变化",409);
    const names = (await filesystem.readdir(path)).sort();
    checks.push({ path,id:identity(before),mtime:before.mtimeMs,size:before.size });
    for (const name of names) {
      if (++entries > limit) throw failure("目录文件过多，大小待核实",413);
      const full = join(path,name), key = relative ? `${relative}/${name}` : name;
      const info = await filesystem.lstat(full);
      if (info.isSymbolicLink()) { skipped.push({ path:key,reason:"符号链接不跟随" }); continue; }
      if (info.isDirectory()) { await visit(full,key); continue; }
      if (!info.isFile() || info.nlink !== 1) {
        skipped.push({ path:key,reason:info.isFile() ? "硬链接不计入" : "特殊文件不计入" }); continue;
      }
      bytes += info.size; files++;
      if (!Number.isSafeInteger(bytes)) throw failure("目录大小超过整数上限",413);
      checks.push({ path:full,id:identity(info),mtime:info.mtimeMs,size:info.size });
    }
  }
  await visit(root,"");
  for (const check of checks) {
    const after = await filesystem.lstat(check.path);
    if (after.isSymbolicLink() || identity(after) !== check.id || after.mtimeMs !== check.mtime || after.size !== check.size)
      throw failure("目录内容扫描期间变化，大小待核实",409);
  }
  if (identity(await filesystem.lstat(root)) !== identity(rootInfo)) throw failure("数据目录身份已变化",409);
  return { bytes,files,skipped };
}

export function createStorageStatus(repository, {
  filesystem = fs, records = createBackupRecords(repository.directory), platform = process.platform,
  runOpen = (path) => exec("/usr/bin/open",["-R",path],{timeout:5000,maxBuffer:64*1024}),
} = {}) {
  const root = resolve(repository.directory);
  async function selected(input) {
    shape(input);
    const parts = relativeParts(input.path ?? ""), chain = [];
    let path = root;
    const canonical = await filesystem.realpath(root);
    for (const part of ["",...parts]) {
      if (part) path = join(path,part);
      const info = await filesystem.lstat(path);
      if (info.isSymbolicLink() || (path === root && !info.isDirectory()) ||
          (path !== join(root,...parts) && !info.isDirectory()) ||
          (info.isFile() && info.nlink !== 1))
        throw failure("路径经过符号链接或非目录",409);
      chain.push({ path,id:identity(info) });
    }
    if (await filesystem.realpath(path) !== join(canonical,...parts))
      throw failure("路径越出数据目录",409);
    return { path,chain };
  }
  return {
    async status() {
      let size,lastBackup;
      try { size = { state:"ok",...(await measureDataDirectory(root,{filesystem})) }; }
      catch (error) { size = { state:"unknown",reason:error.status ? error.message : "数据目录大小不可读取" }; }
      try { lastBackup = await records.latest(); }
      catch { lastBackup = { state:"unknown",reason:"备份成功记录不可读取" }; }
      return { directory:root,size,lastBackup,finderAvailable:platform === "darwin" };
    },
    async reveal(input = {}) {
      if (platform !== "darwin") throw failure("访达入口仅在 macOS 可用",503);
      const picked = await selected(input);
      // 在启动外部程序之前最后一次复核整条路径链。
      for (const check of picked.chain) {
        const info = await filesystem.lstat(check.path);
        if (info.isSymbolicLink() || identity(info) !== check.id) throw failure("目录身份已变化",409);
      }
      try { await runOpen(picked.path); }
      catch { throw failure("访达显示请求未得到确认，请先查看访达再决定是否重做",503); }
      return { requested:true,path:picked.path };
    },
  };
}
