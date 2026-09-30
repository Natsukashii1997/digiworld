import fs from "node:fs/promises";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { constants } from "node:fs";
import { readConfigFile } from "./config-file.mjs";
import { failure } from "./repository.mjs";
import { knowledgeTextHash, candidatePath } from "./knowledge-write-files.mjs";
import {
  exact,
  identifier,
  sha,
  string,
} from "./knowledge-compilation-schema.mjs";

const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
const bad = () =>
  failure("候选保存记录无效或不可访问，已停止写入；请保留本机记录", 503);
function validate(row) {
  exact(row, [
    "schema",
    "id",
    "taskId",
    "versionId",
    "versionHash",
    "source",
    "path",
    "parentIdentity",
    "domain",
    "filename",
    "content",
    "sha256",
    "createdAt",
  ]);
  if (row.schema !== 1 || !uuid.test(row.id)) throw bad();
  identifier(row.taskId);
  identifier(row.versionId);
  sha(row.versionHash);
  sha(row.sha256);
  string(row.content, 128 * 1024, { multiline: true });
  string(row.parentIdentity, 16000);
  string(row.createdAt, 40);
  if (
    !Number.isFinite(Date.parse(row.createdAt)) ||
    knowledgeTextHash(row.content) !== row.sha256 ||
    candidatePath(row.domain, row.filename) !== row.path
  )
    throw bad();
  exact(row.source, ["id", "root", "identity", "generation"]);
  identifier(row.source.id);
  identifier(row.source.generation);
  sha(row.source.identity);
  string(row.source.root, 2000);
  return row;
}

// Immutable prepared record + immutable receipts. Stored separately from asset
// backups, with complete recovery text; never infer target success from a log.
export function createKnowledgeWriteJournal(
  directory,
  { filesystem = fs } = {},
) {
  const root = join(directory, "knowledge-writes");
  async function folder(create = false) {
    if (create)
      try {
        await filesystem.mkdir(root, { mode: 0o700 });
      } catch (error) {
        if (error.code !== "EEXIST") throw bad();
      }
    try {
      const info = await filesystem.lstat(root);
      if (
        !info.isDirectory() ||
        info.isSymbolicLink() ||
        info.uid !== process.getuid() ||
        info.mode & 0o077 ||
        (await filesystem.realpath(root)) !== root
      )
        throw bad();
      return `${info.dev}:${info.ino}:${info.birthtimeMs}`;
    } catch (error) {
      if (!create && error.code === "ENOENT") return null;
      throw bad();
    }
  }
  const location = (id, kind) => {
    if (
      !uuid.test(id) ||
      !["prepared", "applied", "rollback-started", "rolled-back"].includes(kind)
    )
      throw bad();
    return join(root, `${id}.${kind}.json`);
  };
  async function read(id, kind) {
    const path = location(id, kind),
      identity = await folder();
    if (!identity) return null;
    try {
      await filesystem.lstat(path);
    } catch (error) {
      if (error.code === "ENOENT") return null;
      throw bad();
    }
    try {
      const file = await readConfigFile(path, { filesystem });
      if (file.mode !== 0o600 || (await folder()) !== identity) throw bad();
      const row = JSON.parse(
        new TextDecoder("utf-8", { fatal: true }).decode(file.bytes),
      );
      if (kind === "prepared") validate(row);
      else {
        exact(row, ["id", "at", "fingerprint"]);
        if (!Number.isFinite(Date.parse(row.at))) throw bad();
        sha(row.fingerprint);
      }
      if (row.id !== id) throw bad();
      return row;
    } catch {
      throw bad();
    }
  }
  async function sync(path) {
    const handle = await filesystem.open(
      path,
      constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW,
    );
    try {
      await handle.sync();
    } finally {
      await handle.close();
    }
  }
  async function store(id, kind, row) {
    const identity = await folder(true);
    await sync(directory);
    if ((await folder()) !== identity || (await read(id, kind))) throw bad();
    const temporary = join(root, `.${randomUUID()}.tmp`);
    const file = await filesystem.open(temporary, "wx", 0o600);
    const owned = await file.stat();
    try {
      await file.writeFile(JSON.stringify(row));
      await file.sync();
      await file.close();
      if ((await folder()) !== identity || (await read(id, kind))) throw bad();
      await filesystem.rename(temporary, location(id, kind));
      await sync(root);
      if (JSON.stringify(await read(id, kind)) !== JSON.stringify(row))
        throw bad();
    } finally {
      await file.close().catch(() => {});
      try {
        const info = await filesystem.lstat(temporary);
        if (
          (await folder()) === identity &&
          info.isFile() &&
          info.dev === owned.dev &&
          info.ino === owned.ino
        )
          await filesystem.unlink(temporary);
      } catch {
        /* Retain any unowned or ambiguous artifact. */
      }
    }
  }
  const api = {
    async get(id) {
      const row = await read(id, "prepared");
      if (!row) return null;
      return {
        row,
        applied: await read(id, "applied"),
        rollbackStarted: await read(id, "rollback-started"),
        rolledBack: await read(id, "rolled-back"),
      };
    },
    async list() {
      if (!(await folder())) return [];
      const names = await filesystem.readdir(root);
      if (names.length > 1500) throw bad();
      const ids = new Set();
      for (const name of names) {
        if (/^\.[a-f0-9-]+\.tmp$/.test(name)) continue;
        const match = name.match(
          /^([a-f0-9-]+)\.(prepared|applied|rollback-started|rolled-back)\.json$/,
        );
        if (!match || !uuid.test(match[1])) throw bad();
        ids.add(match[1]);
      }
      const rows = [];
      for (const id of ids) {
        const row = await api.get(id);
        if (!row) throw bad();
        rows.push(row);
      }
      return rows.sort((a, b) =>
        b.row.createdAt.localeCompare(a.row.createdAt),
      );
    },
    async prepare(row) {
      validate(row);
      if (Buffer.byteLength(JSON.stringify(row)) > 240 * 1024)
        throw failure("候选记录超过本机保存上限", 413);
      const rows = await api.list();
      if (rows.length >= 250)
        throw failure("本机候选保存记录已达 250 条上限", 413);
      if (rows.some((item) => item.row.id === row.id))
        throw failure("操作已存在，请核对结果，不要重放", 409);
      await store(row.id, "prepared", row);
    },
    async receipt(id, kind, at, fingerprint) {
      if (!(await read(id, "prepared"))) throw bad();
      sha(fingerprint);
      if (!Number.isFinite(Date.parse(at))) throw bad();
      const row = { id, at, fingerprint };
      if (!(await read(id, kind))) await store(id, kind, row);
    },
  };
  return api;
}
