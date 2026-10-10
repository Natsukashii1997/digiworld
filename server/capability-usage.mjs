// Local metadata only. No arguments, paths, document bodies, credentials or session content enter this file.
import fs from "node:fs/promises";
import { constants } from "node:fs";
import { randomUUID } from "node:crypto";
import { join, resolve } from "node:path";
import { failure } from "./repository.mjs";

export const USAGE_CAPABILITIES = ["vault", "knowledge", "savepoints", "calendar", "agent", "model", "daemon", "night"];
export const MCP_AGENTS = ["claude", "codex", "hermes", "openclaw"];
const aliases = { "claude code": "claude", "claude-code": "claude", claude: "claude", codex: "codex", hermes: "hermes", openclaw: "openclaw" };
const MAX_BYTES = 4 * 1024 * 1024;
const WEEK = 7 * 24 * 60 * 60 * 1000;
const validAt = (value) => typeof value === "string" && /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(value) && Number.isFinite(Date.parse(value));
const bad = () => failure("本地能力使用记录不可核验", 503);
function checkRow(row) {
  if (!row || Array.isArray(row) || Object.keys(row).sort().join() !== "at,capability,clientName,id,outcome" ||
      typeof row.id !== "string" || !/^[a-f0-9-]{36}$/.test(row.id) || !validAt(row.at) ||
      !USAGE_CAPABILITIES.includes(row.capability) || !["verified", "failed", "unknown"].includes(row.outcome) ||
      !(row.clientName === null || MCP_AGENTS.includes(row.clientName))) throw bad();
  return row;
}
export function mcpAgentId(name) { return aliases[String(name || "").trim().toLowerCase()] || null; }
export function capabilityUseOutcome(value) {
  if (value?.conflict === true) return "failed";
  if (value?.check?.matches === false) return "unknown";
  if (value?.verified === true || value?.check?.matches === true) return "verified";
  const state = value?.status ?? value?.state;
  if (["verified", "rolled_back", "matches_after"].includes(state)) return "verified";
  if (["failed", "matches_before", "not_applied"].includes(state)) return "failed";
  return "unknown";
}
export function createCapabilityUsage(directory, { filesystem = fs, clock = Date.now } = {}) {
  const root = resolve(directory), path = join(root, "capability-use.json");
  let queue = Promise.resolve(), writeError = false, rootIdentity = null, rootCanonical = null;
  async function checkRoot() {
    const info = await filesystem.lstat(root);
    if (!info.isDirectory() || info.isSymbolicLink()) throw bad();
    const identity = `${info.dev}:${info.ino}:${info.birthtimeMs}`;
    const canonical = await filesystem.realpath(root);
    if (rootIdentity && (rootIdentity !== identity || rootCanonical !== canonical)) throw bad();
    rootIdentity = identity; rootCanonical = canonical;
    return identity;
  }
  async function read() {
    const identity = await checkRoot();
    let file;
    try { file = await filesystem.open(path, constants.O_RDONLY | constants.O_NOFOLLOW); }
    catch (error) { if (error.code === "ENOENT") return []; throw bad(); }
    try {
      const stat = await file.stat();
      if (!stat.isFile() || stat.nlink !== 1 || stat.mode & 0o077 || stat.uid !== process.getuid?.() || stat.size > MAX_BYTES) throw bad();
      const value = JSON.parse(await file.readFile({ encoding: "utf8" }));
      if (value?.schema !== 1 || !Array.isArray(value.items) || value.items.length > 20000) throw bad();
      value.items.forEach(checkRow);
      if (await checkRoot() !== identity) throw bad();
      return value.items;
    } catch { throw bad(); }
    finally { await file.close(); }
  }
  async function write(items) {
    const identity = await checkRoot();
    const data = JSON.stringify({ schema: 1, items });
    if (Buffer.byteLength(data) > MAX_BYTES) throw bad();
    const temporary = join(root, `.capability-use-${randomUUID()}.tmp`);
    let file;
    try {
      file = await filesystem.open(temporary, "wx", 0o600);
      await file.writeFile(data); await file.sync(); await file.close(); file = null;
      if (await checkRoot() !== identity) throw bad();
      await filesystem.rename(temporary, path);
      const dir = await filesystem.open(root, constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW);
      try { await dir.sync(); } finally { await dir.close(); }
    } catch (error) {
      await file?.close().catch(() => {});
      await filesystem.unlink(temporary).catch(() => {});
      throw error;
    }
  }
  return {
    async record(capability, outcome = "verified", clientName = null) {
      if (!USAGE_CAPABILITIES.includes(capability) || !["verified", "failed", "unknown"].includes(outcome)) throw bad();
      const safeClient = mcpAgentId(clientName);
      const row = checkRow({ id: randomUUID(), at: new Date(clock()).toISOString(), capability, outcome, clientName: safeClient });
      const task = queue.catch(() => {}).then(async () => {
        const previous = await read();
        const cutoff = clock() - WEEK;
        const recent = previous.filter((item) => Date.parse(item.at) >= cutoff);
        // Keep one older receipt per capability and identified client so "曾用过" remains distinguishable from "从无".
        const older = new Map();
        for (const item of previous.filter((item) => Date.parse(item.at) < cutoff).sort((a, b) => b.at.localeCompare(a.at))) {
          const key = item.clientName ? `client:${item.clientName}` : `cap:${item.capability}`;
          if (!older.has(key)) older.set(key, item);
        }
        const items = [...older.values(), ...recent, row];
        if (items.length > 20000) throw bad();
        await write(items);
        const found = (await read()).some((item) => item.id === row.id);
        if (!found) throw bad();
        writeError = false;
        return row;
      }).catch((error) => { writeError = true; throw error; });
      queue = task;
      return task;
    },
    async summary() {
      await queue.catch(() => {});
      if (writeError) throw bad();
      const items = await read();
      const latest = (rows) => rows.sort((a, b) => b.at.localeCompare(a.at))[0] || null;
      const now = clock();
      const capabilities = Object.fromEntries(USAGE_CAPABILITIES.map((id) => {
        const row = latest(items.filter((item) => item.capability === id));
        return [id, row && Date.parse(row.at) > now ? { ...row, outcome: "unknown" } : row];
      }));
      const agents = Object.fromEntries(MCP_AGENTS.map((id) => {
        const row = latest(items.filter((item) => item.capability === "knowledge" && mcpAgentId(item.clientName) === id));
        const age = row ? now - Date.parse(row.at) : null;
        return [id, { state: !row || age < 0 ? "unknown" : age <= WEEK ? "connected" : "not_connected", at: row?.at || null }];
      }));
      return { capabilities, agents };
    },
  };
}
