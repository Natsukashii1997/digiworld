import fs from "node:fs/promises";
import {guardCapabilityFilesystem} from "./guarded-capability-filesystem.mjs";
import { constants } from "node:fs";
import { join, resolve } from "node:path";
import { randomUUID } from "node:crypto";
import { failure } from "./repository.mjs";
import { readConfigFile } from "./config-file.mjs";

const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
const hash = /^[a-f0-9]{64}$/;
const bad = () =>
  failure("配置变更记录无效或不可访问，已停止变更；请保留本机记录。", 503);
const exact = (value, keys) =>
  value &&
  typeof value === "object" &&
  !Array.isArray(value) &&
  Object.keys(value).length === keys.length &&
  keys.every((k) => Object.hasOwn(value, k));
const instant = (v) =>
  typeof v === "string" &&
  /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(v) &&
  Number.isFinite(Date.parse(v));

export function validateConfigOperation(r) {
  if (
    !exact(r, [
      "schema",
      "id",
      "kind",
      "restores",
      "targetId",
      "agentId",
      "key",
      "beforeValue",
      "afterValue",
      "targetSignature",
      "homeSignature",
      "beforeHash",
      "afterHash",
      "mode",
      "uid",
      "gid",
      "patch",
      "at",
    ])
  )
    throw bad();
  const keys =
    r.agentId === "codex"
      ? ["tui.animations", "tui.show_tooltips"]
      : r.agentId === "hermes"
        ? ["display.bell_on_complete", "display.show_reasoning"]
        : [];
  if (
    r.schema !== 1 ||
    !uuid.test(r.id) ||
    !["apply", "restore"].includes(r.kind) ||
    (r.kind === "apply" ? r.restores !== null : !uuid.test(r.restores)) ||
    typeof r.targetId !== "string" ||
    !/^[\w-]{1,100}$/.test(r.targetId) ||
    !keys.includes(r.key) ||
    ![r.beforeValue, r.afterValue].every(
      (v) => v === null || typeof v === "boolean",
    ) ||
    ![r.targetSignature, r.homeSignature, r.beforeHash, r.afterHash].every(
      (v) => typeof v === "string" && hash.test(v),
    ) ||
    r.beforeHash === r.afterHash ||
    !Number.isInteger(r.mode) ||
    r.mode < 0 ||
    r.mode > 0o777 ||
    ![r.uid, r.gid].every(
      (value) =>
        Number.isSafeInteger(value) && value >= 0 && value <= 0xffffffff,
    ) ||
    !instant(r.at)
  )
    throw bad();
  const p = r.patch;
  if (
    !exact(p, ["offset", "before", "after"]) ||
    !Number.isSafeInteger(p.offset) ||
    p.offset < 0 ||
    p.offset > 256 * 1024
  )
    throw bad();
  const words = new Set([
    ...r.key.split("."),
    "true",
    "false",
    "yes",
    "no",
    "on",
    "off",
  ]);
  for (const part of [p.before, p.after]) {
    if (
      typeof part !== "string" ||
      part.length > 1024 ||
      !/^[\t\r\n =:{},.A-Za-z_]*$/.test(part) ||
      (part.match(/[A-Za-z_]+/g) || []).some((w) => !words.has(w.toLowerCase()))
    )
      throw bad();
  }
  if (p.before === p.after) throw bad();
  return r;
}

// Independent, local-only journal. It contains bounded inverse patches, never
// full config text. A prepared record alone is not proof of a file write.
// Rule templates reuse the same storage with their own folder and validator.
export function createConfigJournal(
  directory,
  {
    filesystem = fs,
    folder: name = "config-operations",
    validate = validateConfigOperation,
    label = "配置",
    readLimit = 256 * 1024,
  } = {},
) {
  const root = join(resolve(directory), name);
  const bad = () =>
    failure(`${label}变更记录无效或不可访问，已停止变更；请保留本机记录。`, 503);
  async function folder(create = false) {
    if (create) await filesystem.mkdir(root, { mode: 0o700 });
    let info;
    try {
      info = await filesystem.lstat(root);
    } catch (e) {
      if (e.code === "ENOENT" && !create) return false;
      throw bad();
    }
    if (
      !info.isDirectory() ||
      info.isSymbolicLink() ||
      info.uid !== process.getuid?.() ||
      info.mode & 0o077 ||
      (await filesystem.realpath(root)) !== root
    )
      throw bad();
    return `${info.dev}:${info.ino}`;
  }
  async function existingFolder(create = false) {
    if (!create) return folder();
    try {
      return await folder(true);
    } catch (e) {
      if (e.code !== "EEXIST") throw e;
      return folder();
    }
  }
  async function read(id, receipt = false) {
    if (typeof id !== "string" || !uuid.test(id)) throw bad();
    if (!(await folder())) return null;
    const path = join(root, id + (receipt ? ".receipt.json" : ".json"));
    try {
      await filesystem.lstat(path);
    } catch (e) {
      if (e.code === "ENOENT") return null;
      throw bad();
    }
    try {
      const file = await readConfigFile(path, { filesystem, limit: readLimit });
      if (file.mode !== 0o600) throw bad();
      const data = JSON.parse(
        new TextDecoder("utf-8", { fatal: true }).decode(file.bytes),
      );
      if (receipt) {
        if (
          !exact(data, ["schema", "id", "at"]) ||
          data.schema !== 1 ||
          data.id !== id ||
          !instant(data.at)
        )
          throw bad();
      } else if (validate(data).id !== id) throw bad();
      return data;
    } catch {
      throw bad();
    }
  }
  async function store(id, data, receipt = false) {
    // 写入与读取同一上限：写得进去的记录，一定读得回来。
    if (Buffer.byteLength(JSON.stringify(data)) > readLimit)
      throw failure(`${label}变更记录超过 ${Math.round(readLimit / 1024)} KiB 读取上限，未写入`, 413);
    const before = await existingFolder(true);
    // The record cannot be durable while its newly created directory entry is
    // not. Repeat on later attempts as an earlier parent sync may have failed.
    try {
      const parent = await filesystem.open(
        resolve(directory),
        constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW,
      );
      try {
        await parent.sync();
      } finally {
        await parent.close();
      }
      if ((await folder()) !== before) throw bad();
    } catch {
      throw bad();
    }
    const temp = join(root, `.${id}-${randomUUID()}.tmp`);
    const path = join(root, id + (receipt ? ".receipt.json" : ".json"));
    let file, created;
    try {
      file = await filesystem.open(temp, "wx", 0o600);
      created = await file.stat();
      await file.writeFile(JSON.stringify(data));
      await file.sync();
      await file.close();
      file = null;
      if ((await folder()) !== before) throw bad();
      try {
        await filesystem.lstat(path);
        throw bad();
      } catch (e) {
        if (e.code !== "ENOENT") throw e;
      }
      await filesystem.rename(temp, path);
      const dir = await filesystem.open(root, "r");
      try {
        await dir.sync();
      } finally {
        await dir.close();
      }
    } finally {
      await file?.close().catch(() => {});
      if (created)
        try {
          const current = await filesystem.lstat(temp);
          if (
            current.isFile() &&
            !current.isSymbolicLink() &&
            current.dev === created.dev &&
            current.ino === created.ino
          )
            await filesystem.unlink(temp);
        } catch {}
    }
  }
  const api = {
    async get(id) {
      const value = await read(id);
      if (!value) return null;
      const receipt = await read(id, true);
      return { ...value, completedAt: receipt?.at || null };
    },
    async list() {
      if (!(await folder())) return [];
      const names = await filesystem.readdir(root);
      if (names.length > 2000)
        throw failure(`${label}变更记录达到读取上限，已停止变更`, 503);
      const rows = [];
      for (const name of names) {
        if (/^\.[a-f0-9-]+\.tmp$/.test(name)) continue;
        const match = name.match(/^([a-f0-9-]+)(\.receipt)?\.json$/);
        if (!match || !uuid.test(match[1])) throw bad();
        const row = await api.get(match[1]);
        if (!row) throw bad();
        if (!match[2]) rows.push(row);
      }
      return rows.sort(
        (a, b) => b.at.localeCompare(a.at) || a.id.localeCompare(b.id),
      );
    },
    async prepare(record, {guard} = {}) {
      if (guard) return createConfigJournal(directory, {filesystem:guardCapabilityFilesystem(filesystem,guard),folder:name,validate,label,readLimit}).prepare(record);
      validate(record);
      const rows = await api.list();
      if (rows.length >= 500)
        throw failure(`${label}变更记录达到500条，未执行新写入`, 409);
      const existing = rows.find((r) => r.id === record.id);
      if (existing)
        throw failure(`此${label}操作已存在，请核对结果，不要重复应用`, 409);
      await store(record.id, record);
      return api.get(record.id);
    },
    async complete(id, at, {guard} = {}) {
      if (guard) return createConfigJournal(directory, {filesystem:guardCapabilityFilesystem(filesystem,guard),folder:name,validate,label,readLimit}).complete(id,at);
      if (!instant(at) || !(await read(id))) throw bad();
      if (!(await read(id, true))) await store(id, { schema: 1, id, at }, true);
      return api.get(id);
    },
  };
  return api;
}
