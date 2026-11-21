// #120 主库快照保留：规则边界、保存时清理的开关、存量归档脚本。只用临时目录和合成文件。
import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, readdir, readFile, rm, utimes, writeFile, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID, createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { openRepository } from "../server/repository.mjs";
import { planRetention, pruneSnapshots, listSnapshots, RETENTION_SWITCH } from "../server/snapshot-retention.mjs";
import { archiveSnapshots } from "../scripts/snapshot-archive.mjs";
import { seed } from "../src/store.js";

const DAY = 86400000, NOW = new Date(2026, 10, 21, 12, 0, 0).getTime(); // 本机时区 11-21 中午
const at = (daysAgo, hour = 12) => new Date(2026, 10, 21 - daysAgo, hour, 0, 0).getTime();
const entry = (revision, mtimeMs) => ({ file: `${revision}-${randomUUID()}.json`, revision, mtimeMs });
const sha = (b) => createHash("sha256").update(b).digest("hex");
const temp = async (fn) => { const dir = await mkdtemp(join(tmpdir(), "snap-ret-")); try { return await fn(dir); } finally { await rm(dir, { recursive: true, force: true }); } };

test("规则：14 天内全留，更早的每天留修订号最大的 1 个，至少留最近 N 个，当前指针永远留", () => {
  const old = [entry(1, at(30, 9)), entry(2, at(30, 18)), entry(3, at(20, 8)), entry(4, at(20, 9)), entry(5, at(20, 23))];
  const recent = [entry(6, at(13, 10)), entry(7, at(13, 11)), entry(8, at(1)), entry(9, at(0, 11))];
  const { keep, remove } = planRetention([...recent, ...old], { now: NOW, keepLatest: 2 });
  const files = (list) => list.map((e) => e.file);
  assert.deepEqual(keep, files([old[1], old[4], ...recent]), "30 天前留 2，20 天前留 5，14 天内全留");
  assert.deepEqual(remove, files([old[0], old[2], old[3]]));
  // 至少留最近 N 个：N 大于总数时一个都不删。
  assert.deepEqual(planRetention([...old, ...recent], { now: NOW }).remove, []);
  // 当前指针指向的旧快照也留。
  assert.ok(planRetention([...old, ...recent], { now: NOW, keepLatest: 2, current: old[0].file }).keep.includes(old[0].file));
  // 正好 14 天的算在 14 天内。
  const edge = entry(10, NOW - 14 * DAY), before = entry(11, NOW - 14 * DAY - 1), last = entry(12, NOW);
  assert.deepEqual(planRetention([edge, before, last, entry(13, NOW - 14 * DAY - 2)], { now: NOW, keepLatest: 1 }).remove.length, 1, "分界外同一天两个只留 1 个");
  assert.ok(planRetention([edge, last], { now: NOW, keepLatest: 1 }).keep.includes(edge.file));
});

async function fakeSnapshots(directory, count, mtimeMs) {
  const files = [];
  for (let i = 0; i < count; i++) {
    const file = `0-${randomUUID()}.json`;
    await writeFile(join(directory, "snapshots", file), `{"synthetic":${i}}`);
    await utimes(join(directory, "snapshots", file), mtimeMs / 1000, mtimeMs / 1000);
    files.push(file);
  }
  return files;
}

test("保存时清理：没有开关不删；有开关按规则删，主库照常读写，名字不合规的不动", () => temp(async (dir) => {
  const repository = await openRepository(dir, { onPruneError: (e) => assert.fail(e) });
  try {
    await repository.write(seed(), { initialize: true });
    await fakeSnapshots(dir, 250, Date.now() - 40 * DAY);
    await writeFile(join(dir, "snapshots", "notes.txt"), "不是快照");
    const before = (await readdir(join(dir, "snapshots"))).length;
    let state = await repository.read();
    state = await repository.write({ ...state, notes: [...state.notes] }, {}); // 内容不变也会新修订
    assert.equal((await readdir(join(dir, "snapshots"))).length, before + 1, "没有开关：一个都不删");
    await writeFile(join(dir, RETENTION_SWITCH), "{}");
    state = await repository.write(state, {});
    const left = await listSnapshots(dir);
    assert.ok(left.length >= 200 && left.length < before, `按规则删掉一部分（剩 ${left.length}）`);
    assert.deepEqual(planRetention(left, { current: JSON.parse(await readFile(join(dir, "CURRENT.json"), "utf8")).file }).remove, [], "删完后再算一遍没有可删的");
    assert.ok((await readdir(join(dir, "snapshots"))).includes("notes.txt"));
    assert.equal((await repository.read()).revision, state.revision);
    for (const r of [1, 2, 3]) assert.ok(left.some((e) => e.revision === r), `真实修订 ${r} 都在最近 200 个里`);
  } finally { await repository.close(); }
}));

test("清理失败不影响这次保存：报告错误，主库照常前进", { skip: process.platform !== "darwin" && "用 chflags 造删不掉的文件，只在 macOS 跑" }, () => temp(async (dir) => {
  const errors = [];
  const repository = await openRepository(dir, { onPruneError: (e) => errors.push(e.code || e.message) });
  let locked;
  try {
    await repository.write(seed(), { initialize: true });
    await mkdir(join(dir, "not-a-switch"));
    await fakeSnapshots(dir, 250, Date.now() - 40 * DAY);
    // 开关是目录时当作没打开：不删、不报错。
    await mkdir(join(dir, RETENTION_SWITCH));
    let state = await repository.write(await repository.read(), {});
    assert.deepEqual(errors, []);
    assert.equal((await listSnapshots(dir)).length, 252);
    await rm(join(dir, RETENTION_SWITCH), { recursive: true });
    await writeFile(join(dir, RETENTION_SWITCH), "{}");
    // 让第一个该删的快照删不掉（系统不可改标记），清理会在这里失败。
    const current = JSON.parse(await readFile(join(dir, "CURRENT.json"), "utf8")).file;
    locked = join(dir, "snapshots", planRetention(await listSnapshots(dir), { current }).remove[0]);
    await promisify(execFile)("/usr/bin/chflags", ["uchg", locked]);
    state = await repository.write(state, {});
    assert.equal(state.revision, 3, "保存照常前进");
    assert.deepEqual(errors, ["EPERM"], "清理失败被报告");
    assert.equal((await repository.read()).revision, 3, "主库照常可读");
  } finally {
    if (locked) await promisify(execFile)("/usr/bin/chflags", ["nouchg", locked]);
    await repository.close();
  }
}));

test("存量归档：预览不改文件；--apply 打包到数据目录外、核对哈希后删除并打开开关；服务在跑或归档目录在数据目录里都拒绝", () => temp(async (root) => {
  const data = join(root, "data"), archive = join(root, "archive"), log = () => {};
  const repository = await openRepository(data);
  await repository.write(seed(), { initialize: true });
  const fakes = await fakeSnapshots(data, 230, Date.now() - 40 * DAY);
  const hashes = Object.fromEntries(await Promise.all(fakes.map(async (f) => [f, sha(await readFile(join(data, "snapshots", f)))])));
  await assert.rejects(archiveSnapshots({ data, archive, apply: true, log }), /另一服务使用/, "服务在跑（写锁被占）就拒绝");
  await repository.close();
  await assert.rejects(archiveSnapshots({ data, archive: join(data, "archive"), apply: true, log }), /不能在数据目录里面/);
  const before = (await readdir(join(data, "snapshots"))).sort();
  const preview = await archiveSnapshots({ data, archive, log });
  assert.equal(preview.applied, false);
  assert.ok(preview.remove > 0);
  assert.deepEqual((await readdir(join(data, "snapshots"))).sort(), before, "预览不改文件");
  const done = await archiveSnapshots({ data, archive, apply: true, log });
  assert.equal(done.remove, preview.remove);
  assert.equal((await listSnapshots(data)).length, preview.keep);
  assert.ok((await stat(join(data, RETENTION_SWITCH))).isFile(), "打开了保存时自动清理");
  const manifest = JSON.parse(await readFile(done.manifest, "utf8"));
  assert.equal(Object.keys(manifest.files).length, done.remove);
  for (const [file, hash] of Object.entries(manifest.files)) assert.equal(hash, hashes[file]);
  const check = join(root, "check"); await mkdir(check);
  await promisify(execFile)("/usr/bin/tar", ["-xzf", done.archive, "-C", check]);
  assert.equal((await readdir(check)).length, done.remove, "归档包里正好是删掉的那些");
  const reopened = await openRepository(data);
  try { assert.equal((await reopened.read()).revision, 1, "主库照常可读"); } finally { await reopened.close(); }
}));
