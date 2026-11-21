// 主库快照保留（#120，规则 2026-11-21 常浩定）：
// 最近 14 天的全留；更早的每个自然日（本机时区，按文件修改时间）只留修订号最大的 1 个；
// 另外至少留最近 200 个；CURRENT.json 指向的那个永远留。文件名不是「修订号-uuid.json」的不动。
// 清理只在数据目录里有开关文件时进行：开关由存量归档脚本在归档核对通过后写入（scripts/snapshot-archive.mjs）。
import { lstat, readdir, readFile, unlink, writeFile } from "node:fs/promises";
import { join } from "node:path";

export const SNAPSHOT_RETENTION = Object.freeze({ keepDays: 14, keepLatest: 200 });
export const RETENTION_SWITCH = "snapshot-retention.json";
const NAME = /^(\d+)-[a-f0-9-]+\.json$/;
const DAY = 24 * 60 * 60 * 1000;
const localDay = (ms) => {
  const d = new Date(ms);
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
};

// entries: [{ file, revision, mtimeMs }]。返回要留的和要删的文件名（都按修订号从小到大）。
export function planRetention(entries, { now = Date.now(), current, keepDays = SNAPSHOT_RETENTION.keepDays, keepLatest = SNAPSHOT_RETENTION.keepLatest } = {}) {
  const sorted = [...entries].sort((a, b) => a.revision - b.revision || a.file.localeCompare(b.file));
  const keep = new Set(sorted.slice(-keepLatest).map((e) => e.file));
  if (current) keep.add(current);
  const lastOfDay = new Map();
  for (const entry of sorted) {
    if (entry.mtimeMs >= now - keepDays * DAY) keep.add(entry.file);
    else lastOfDay.set(localDay(entry.mtimeMs), entry.file);
  }
  for (const file of lastOfDay.values()) keep.add(file);
  return {
    keep: sorted.filter((e) => keep.has(e.file)).map((e) => e.file),
    remove: sorted.filter((e) => !keep.has(e.file)).map((e) => e.file),
  };
}

// 列出快照目录里名字合规的普通文件（不跟随链接）。
export async function listSnapshots(directory) {
  const folder = join(directory, "snapshots"), entries = [];
  for (const file of await readdir(folder)) {
    const match = NAME.exec(file);
    if (!match) continue;
    const info = await lstat(join(folder, file));
    if (info.isFile() && !info.isSymbolicLink())
      entries.push({ file, revision: Number(match[1]), mtimeMs: info.mtimeMs, size: info.size });
  }
  return entries;
}

export async function currentSnapshot(directory) {
  return JSON.parse(await readFile(join(directory, "CURRENT.json"), "utf8")).file;
}

export async function retentionEnabled(directory) {
  try { return (await lstat(join(directory, RETENTION_SWITCH))).isFile(); }
  catch (error) { if (error.code === "ENOENT") return false; throw error; }
}

export async function enableRetention(directory, record) {
  await writeFile(join(directory, RETENTION_SWITCH), JSON.stringify({ ...SNAPSHOT_RETENTION, ...record }, null, 2) + "\n", { mode: 0o600 });
}

// 主库保存成功后调用：开关不在就什么都不做。返回删掉的文件名。
export async function pruneSnapshots(directory, { now = Date.now() } = {}) {
  if (!(await retentionEnabled(directory))) return [];
  const { remove } = planRetention(await listSnapshots(directory), { now, current: await currentSnapshot(directory) });
  for (const file of remove) await unlink(join(directory, "snapshots", file));
  return remove;
}
