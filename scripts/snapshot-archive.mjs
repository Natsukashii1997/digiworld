#!/usr/bin/env node
// 主库快照存量归档（#120）：按保留规则找出要清的旧快照，打包放到数据目录外，核对后再删，并打开「保存时自动清理」的开关。
// 用法：node scripts/snapshot-archive.mjs <数据目录> <归档目录> [--apply]
//   不带 --apply 只预览，不改任何文件。带 --apply 才归档、核对、删除、写开关。
// 先占住主库写锁：数码世界服务在跑时会被拒绝，要先停服务。
import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { mkdir, mkdtemp, readFile, realpath, rm, unlink, writeFile } from "node:fs/promises";
import { basename, join, relative, resolve, isAbsolute } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { openRepository } from "../server/repository.mjs";
import { currentSnapshot, enableRetention, listSnapshots, planRetention, retentionEnabled } from "../server/snapshot-retention.mjs";

const run = promisify(execFile);
const sha = (bytes) => createHash("sha256").update(bytes).digest("hex");
const mb = (bytes) => `${(bytes / 1e6).toFixed(1)} MB`;
const inside = (child, parent) => { const r = relative(parent, child); return r === "" || (!r.startsWith("..") && !isAbsolute(r)); };

export async function archiveSnapshots({ data, archive, apply = false, now = Date.now(), log = console.log }) {
  const dataDir = await realpath(resolve(data));
  await mkdir(resolve(archive), { recursive: true, mode: 0o700 });
  const archiveDir = await realpath(resolve(archive));
  if (inside(archiveDir, dataDir) || inside(dataDir, archiveDir)) throw new Error("归档目录不能在数据目录里面（或反过来），请放到数据目录外");
  const repository = await openRepository(dataDir); // 服务在跑会在这里被拒绝
  try {
    const state = await repository.read();
    if (!state) throw new Error("数据目录里没有主库，未做任何改动");
    const entries = await listSnapshots(dataDir), current = await currentSnapshot(dataDir);
    const { keep, remove } = planRetention(entries, { now, current });
    const size = new Map(entries.map((e) => [e.file, e.size]));
    const bytes = (files) => files.reduce((sum, f) => sum + size.get(f), 0);
    const summary = { revision: state.revision, total: entries.length, keep: keep.length, keepBytes: bytes(keep), remove: remove.length, removeBytes: bytes(remove), alreadyEnabled: await retentionEnabled(dataDir) };
    log(`主库修订 ${summary.revision}；快照 ${summary.total} 个。按规则留 ${summary.keep} 个（${mb(summary.keepBytes)}），清 ${summary.remove} 个（${mb(summary.removeBytes)}）。`);
    if (!apply) { log("预览完成，没有改动任何文件。加 --apply 才归档并删除。"); return { ...summary, applied: false }; }
    if (!remove.length) {
      await enableRetention(dataDir, { enabledAt: new Date(now).toISOString(), archive: null, removed: 0 });
      log("没有要清的快照；已打开保存时自动清理。");
      return { ...summary, applied: true, archive: null };
    }
    const snapshots = join(dataDir, "snapshots"), stamp = new Date(now).toISOString().slice(0, 10);
    const name = `snapshots-r${remove[0].split("-")[0]}-r${remove.at(-1).split("-")[0]}-${stamp}`;
    const tarPath = join(archiveDir, `${name}.tar.gz`), listPath = join(archiveDir, `${name}.list`), manifestPath = join(archiveDir, `${name}.manifest.json`);
    const hashes = {};
    for (const file of remove) hashes[file] = sha(await readFile(join(snapshots, file)));
    await writeFile(listPath, remove.join("\n") + "\n", { flag: "wx", mode: 0o600 });
    await writeFile(manifestPath, JSON.stringify({ createdAt: new Date(now).toISOString(), revision: state.revision, files: hashes }, null, 2) + "\n", { flag: "wx", mode: 0o600 });
    await run("/usr/bin/tar", ["-czf", tarPath, "-C", snapshots, "-T", listPath]);
    // 解到临时目录逐个核对：文件数和每个文件的 sha256 都对上才删。
    const check = await mkdtemp(join(archiveDir, ".verify-"));
    try {
      await run("/usr/bin/tar", ["-xzf", tarPath, "-C", check]);
      for (const file of remove)
        if (sha(await readFile(join(check, file))) !== hashes[file]) throw new Error(`归档核对失败：${file} 哈希不一致，没有删除任何快照`);
      const { stdout } = await run("/usr/bin/tar", ["-tzf", tarPath], { maxBuffer: 16 * 1024 * 1024 });
      if (stdout.trim().split("\n").length !== remove.length) throw new Error("归档核对失败：包内文件数不一致，没有删除任何快照");
    } finally { await rm(check, { recursive: true, force: true }); }
    for (const file of remove) await unlink(join(snapshots, file));
    await enableRetention(dataDir, { enabledAt: new Date(now).toISOString(), archive: tarPath, removed: remove.length });
    const after = await listSnapshots(dataDir);
    if (after.length !== keep.length) throw new Error(`删除后剩 ${after.length} 个快照，应为 ${keep.length} 个，请核对`);
    if ((await repository.read()).revision !== state.revision) throw new Error("删除后主库读不回原修订，请从归档包恢复");
    log(`已归档到 ${tarPath}（${basename(manifestPath)} 记了每个文件的 sha256），核对通过，删除 ${remove.length} 个，剩 ${after.length} 个；已打开保存时自动清理。`);
    return { ...summary, applied: true, archive: tarPath, manifest: manifestPath };
  } finally { await repository.close(); }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2), apply = args.includes("--apply"), [data, archive] = args.filter((a) => a !== "--apply");
  if (!data || !archive) { console.error("用法：node scripts/snapshot-archive.mjs <数据目录> <归档目录> [--apply]"); process.exit(2); }
  archiveSnapshots({ data, archive, apply }).catch((error) => { console.error(error.message); process.exit(1); });
}
