import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import { resolve } from "node:path";
import { createConfigJournal } from "./config-journal.mjs";
import { failure } from "./repository.mjs";

export function validateBackupRecord(row) {
  const keys = ["schema","id","kind","at","sha256","bytes","files"];
  if (!row || Array.isArray(row) || Object.keys(row).length !== keys.length ||
      keys.some((key) => !Object.hasOwn(row,key)) || row.schema !== 1 || row.kind !== "full-backup" ||
      !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(row.id) ||
      !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(row.at) || !Number.isFinite(Date.parse(row.at)) ||
      !/^[a-f0-9]{64}$/.test(row.sha256) || !Number.isSafeInteger(row.bytes) || row.bytes < 1 ||
      !Number.isSafeInteger(row.files) || row.files < 0)
    throw failure("备份生成记录无效",503);
  return row;
}

// 仅记录服务端生成且解包校验通过，不声称用户的下载文件已经落盘。
export function createBackupRecords(directory, { filesystem = fs, clock = Date.now } = {}) {
  const root = resolve(directory);
  let stored = null,rootIdentity = null,canonical = null;
  async function journal() {
    const before = await filesystem.lstat(root);
    if (!before.isDirectory() || before.isSymbolicLink()) throw failure("备份数据目录身份无效",503);
    const identity = `${before.dev}:${before.ino}:${before.birthtimeMs}`;
    const actual = await filesystem.realpath(root);
    if (rootIdentity && (rootIdentity !== identity || canonical !== actual))
      throw failure("备份数据目录身份已变化",503);
    const after = await filesystem.lstat(root);
    if (after.isSymbolicLink() || `${after.dev}:${after.ino}:${after.birthtimeMs}` !== identity)
      throw failure("备份数据目录核对期间变化",503);
    if (!stored) {
      canonical = actual; rootIdentity = identity;
      stored = createConfigJournal(canonical,{filesystem,folder:"backup-records",validate:validateBackupRecord,label:"备份"});
    }
    return stored;
  }
  return {
    async record({ sha256, bytes, files }) {
      const at = new Date(clock()).toISOString();
      const row = { schema:1,id:randomUUID(),kind:"full-backup",at,sha256,bytes,files };
      const store = await journal();
      await store.prepare(row);
      let readback;
      try { readback = await store.complete(row.id,at); }
      catch { throw Object.assign(failure("备份已生成，但成功记录回读未知；请核对生成记录",503),{ unknownResult:true,operationId:row.id }); }
      if (readback.sha256 !== sha256 || readback.completedAt !== at)
        throw failure("备份已生成，但成功记录回读未知，请核对记录后再决定是否重做",503);
      return { id:row.id,at,sha256 };
    },
    async latest() {
      const records = await (await journal()).list();
      const row = records.find((item) => item.completedAt);
      const pending = records.filter((item) => !item.completedAt).length;
      return row ? { state:"ok",at:row.completedAt,sha256:row.sha256,bytes:row.bytes,files:row.files,pending }
        : { state:pending ? "pending" : "none",pending };
    },
  };
}
