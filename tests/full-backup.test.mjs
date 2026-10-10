// 路线 v3 5.1 完整备份：整个数据目录打包为单个文件（fflate zip），含清单与每个文件 SHA256；
// 恢复前预览（新增 / 冲突 / 缺失），确认后恢复到新的数据目录副本并校验，不覆盖当前目录。
import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, readFile, readdir, rm, symlink, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, dirname, basename } from "node:path";
import { createHash } from "node:crypto";
import { unzipSync, zipSync, strToU8, strFromU8 } from "fflate";
import { openRepository } from "../server/repository.mjs";
import {
  packDirectory,
  inspectBackup,
  previewRestore,
  restoreTo,
  BACKUP_FORMAT,
} from "../server/full-backup.mjs";
import { seed } from "../src/store.js";
import { fixture } from "./fixture.mjs";
import { parse, stringify } from "../src/serialization.js";

async function request(app, path, data) {
  const { token } = await (
    await fetch(`${app.url}/api/session`, { headers: { "x-workbench-client": "1" } })
  ).json();
  const response = await fetch(app.url + path, {
    method: "POST",
    headers: { "x-workbench-token": token, "content-type": "application/json" },
    body: stringify(data),
  });
  const result = parse(await response.text());
  if (!response.ok) throw Object.assign(new Error(result.error), { status: response.status });
  return result;
}

const sha = (bytes) => createHash("sha256").update(bytes).digest("hex");
const PNG = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3, 4]);

async function dataDir() {
  const directory = await mkdtemp(join(tmpdir(), "guiji-full-"));
  const repository = await openRepository(directory);
  await repository.write(seed(), { initialize: true });
  await mkdir(join(directory, "config-operations"), { mode: 0o700 });
  await writeFile(join(directory, "config-operations", "op-1.json"), '{"id":"op-1"}');
  await mkdir(join(directory, "knowledge-writes", "w1"), { recursive: true, mode: 0o700 });
  await writeFile(join(directory, "knowledge-writes", "w1", "prepared.json"), '{"id":"w1"}');
  await mkdir(join(directory, "silver"), { mode: 0o700 });
  await writeFile(join(directory, "silver", `${sha(PNG)}.png`), PNG);
  await mkdir(join(directory, "reverse-media"), {mode:0o700});
  await writeFile(join(directory, "reverse-media", `${sha(PNG)}.png`), PNG);
  await mkdir(join(directory, "aihot"), { mode: 0o700 });
  await writeFile(join(directory, "aihot", "cache.json"), '{"items":[]}');
  // 临时文件与锁不进入备份；符号链接不跟随。
  await writeFile(join(directory, ".CURRENT-abc.tmp"), "partial");
  await symlink("/etc/hostname", join(directory, "outside-link"));
  return { directory, repository };
}
const clock = () => Date.parse("2026-09-30T08:00:00.000Z");

test("打包：主库快照、配置日志、知识写入日志、各集合；175排银饰图片实体，清单含每个文件 SHA256", async () => {
  const { directory, repository } = await dataDir();
  try {
    const { bytes, manifest } = await packDirectory(directory, { clock });
    assert.ok(bytes instanceof Uint8Array);
    assert.equal(manifest.format, BACKUP_FORMAT);
    assert.equal(manifest.schema, 1);
    assert.equal(manifest.createdAt, "2026-09-30T08:00:00.000Z");
    const paths = manifest.files.map((f) => f.path);
    for (const expected of [
      "CURRENT.json",
      "config-operations/op-1.json",
      "knowledge-writes/w1/prepared.json",
      `reverse-media/${sha(PNG)}.png`,
      
      "aihot/cache.json",
    ])
      assert.ok(paths.includes(expected), expected);
    assert.ok(paths.some((p) => /^snapshots\/1-[a-f0-9-]+\.json$/.test(p)), "主库快照");
    assert.ok(!paths.some((p) => p.includes("writer-lock") || p.endsWith(".tmp")), "不含锁与临时文件");
    assert.ok(!paths.includes("outside-link"));
    assert.deepEqual(manifest.skipped, [{ path: "outside-link", reason: "符号链接不跟随" }, {path:"silver",reason:"银饰图片只存本机，不进入新完整备份"}]);
    assert.equal(paths.some(p=>p.startsWith("silver/")),false,"175批准：新完整ZIP排银饰实体");
    assert.deepEqual([...paths].sort(), paths, "清单按路径排序，便于比对");
    const entries = unzipSync(bytes);
    assert.deepEqual(Object.keys(entries).sort(), ["manifest.json", ...paths.map((p) => `data/${p}`)].sort());
    const inZip = JSON.parse(strFromU8(entries["manifest.json"]));
    assert.deepEqual(inZip, manifest);
    for (const file of manifest.files) {
      const raw = await readFile(join(directory, file.path));
      assert.equal(file.sha256, sha(raw), file.path);
      assert.equal(file.size, raw.length, file.path);
    }
  } finally {
    await repository.close();
    await rm(directory, { recursive: true, force: true });
  }
});

test("校验与篡改检测：改内容、改清单、缺文件、多文件、越界路径都被拒绝", async () => {
  const { directory, repository } = await dataDir();
  try {
    const { bytes, manifest } = await packDirectory(directory, { clock });
    assert.equal(inspectBackup(bytes).manifest.files.length, manifest.files.length);
    const entries = unzipSync(bytes);
    const rezip = (change) => {
      const copy = { ...entries };
      change(copy);
      return zipSync(copy);
    };
    const target = "data/config-operations/op-1.json";
    const cases = {
      改内容: rezip((c) => (c[target] = strToU8('{"id":"evil"}'))),
      缺文件: rezip((c) => delete c[target]),
      多文件: rezip((c) => (c["data/extra.json"] = strToU8("{}"))),
      改清单: rezip((c) => {
        const m = JSON.parse(strFromU8(c["manifest.json"]));
        m.files[0].sha256 = "0".repeat(64);
        c["manifest.json"] = strToU8(JSON.stringify(m));
      }),
      越界路径: rezip((c) => {
        const m = JSON.parse(strFromU8(c["manifest.json"]));
        m.files.push({ path: "../escape.json", size: 2, sha256: sha(strToU8("{}")) });
        c["manifest.json"] = strToU8(JSON.stringify(m));
        c["data/../escape.json"] = strToU8("{}");
      }),
      无清单: rezip((c) => delete c["manifest.json"]),
      错格式: rezip((c) => {
        const m = JSON.parse(strFromU8(c["manifest.json"]));
        m.format = "guiji-backup";
        c["manifest.json"] = strToU8(JSON.stringify(m));
      }),
      不是压缩包: strToU8("hello"),
    };
    for (const [name, broken] of Object.entries(cases))
      assert.throws(() => inspectBackup(broken), (e) => e.status === 400 && /备份/.test(e.message), name);
    assert.throws(() => inspectBackup(cases.改内容), /校验失败|SHA256/);
  } finally {
    await repository.close();
    await rm(directory, { recursive: true, force: true });
  }
});

test("恢复前预览：列出新增、冲突、缺失", async () => {
  const { directory, repository } = await dataDir();
  try {
    const { bytes } = await packDirectory(directory, { clock });
    // 备份之后当前目录又变了：改一个、删一个、加一个。
    await writeFile(join(directory, "config-operations", "op-1.json"), '{"id":"op-1","changed":true}');
    await rm(join(directory, "aihot", "cache.json"));
    await writeFile(join(directory, "config-operations", "op-2.json"), '{"id":"op-2"}');
    const preview = await previewRestore(directory, bytes);
    assert.deepEqual(preview.summary.conflict, ["config-operations/op-1.json"]);
    assert.deepEqual(preview.summary.added, ["aihot/cache.json"]);
    assert.ok(preview.summary.missing.includes("config-operations/op-2.json"));
    assert.equal(preview.summary.missing.some((p) => p.includes("writer-lock") || p.endsWith(".tmp")), false);
    assert.ok(preview.summary.same >= 4);
    assert.equal(preview.manifest.files.length, preview.summary.same + 2);
    assert.equal(preview.mainDatabase.revision, 1);
  } finally {
    await repository.close();
    await rm(directory, { recursive: true, force: true });
  }
});

test("恢复到隔离目录：新目录逐个校验 SHA256、主库可读，不改当前目录；目标已存在或在当前目录内则拒绝", async () => {
  const { directory, repository } = await dataDir();
  const parent = await mkdtemp(join(tmpdir(), "guiji-restore-"));
  try {
    const { bytes, manifest } = await packDirectory(directory, { clock });
    const before = await readFile(join(directory, "CURRENT.json"), "utf8");
    await writeFile(join(directory, "config-operations", "op-1.json"), '{"id":"op-1","changed":true}');
    const target = join(parent, "data-restored");
    const result = await restoreTo(bytes, target, { current: directory });
    assert.equal(result.target, target);
    assert.equal(result.verified, manifest.files.length);
    assert.equal(result.mainDatabase.revision, 1);
    for (const file of manifest.files)
      assert.equal(sha(await readFile(join(target, file.path))), file.sha256, file.path);
    assert.equal((await stat(target)).mode & 0o777, 0o700);
    // 当前目录保持原样（包括备份后的修改）。
    assert.equal(await readFile(join(directory, "config-operations", "op-1.json"), "utf8"), '{"id":"op-1","changed":true}');
    assert.equal(await readFile(join(directory, "CURRENT.json"), "utf8"), before);
    // 恢复出的副本能被工作台打开并读出同一份主库。
    const restored = await openRepository(target);
    assert.deepEqual((await restored.read()).assets.map((a) => a.id), (await repository.read()).assets.map((a) => a.id));
    await restored.close();
    await assert.rejects(restoreTo(bytes, target, { current: directory }), (e) => e.status === 409);
    await assert.rejects(restoreTo(bytes, directory, { current: directory }), (e) => e.status === 409);
    await assert.rejects(restoreTo(bytes, join(directory, "inner"), { current: directory }), (e) => e.status === 409);
    // 篡改的备份不会写出任何文件。
    const entries = unzipSync(bytes);
    entries["data/config-operations/op-1.json"] = strToU8("tampered");
    const bad = join(parent, "bad");
    await assert.rejects(restoreTo(zipSync(entries), bad, { current: directory }), (e) => e.status === 400);
    await assert.rejects(stat(bad), { code: "ENOENT" });
  } finally {
    await repository.close();
    await rm(directory, { recursive: true, force: true });
    await rm(parent, { recursive: true, force: true });
  }
});

test("HTTP：创建完整备份 → 预览 → 确认恢复到新目录；预览凭据一次有效", async () => {
  const app = await fixture();
  let target;
  try {
    await app.repository.write(seed(), { initialize: true });
    const created = await request(app, "/api/full-backup/create", {});
    assert.match(created.filename, /^数码世界-完整备份-\d{8}-\d{6}\.zip$/);
    assert.ok(created.bytes instanceof Uint8Array);
    assert.equal(created.manifest.files.length, inspectBackup(created.bytes).manifest.files.length);
    const preview = await request(app, "/api/full-backup/preview", { bytes: created.bytes });
    assert.match(preview.token, /^[a-f0-9]{32,}$/);
    assert.equal(preview.summary.conflict.length, 0);
    assert.match(preview.target, new RegExp(`^${dirname(app.repository.directory).replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`));
    assert.match(basename(preview.target), /^.+-恢复-\d{8}-\d{6}$/);
    const restored = await request(app, "/api/full-backup/restore", { token: preview.token });
    target = restored.target;
    assert.equal(target, preview.target);
    assert.equal(restored.verified, created.manifest.files.length);
    assert.ok((await readdir(target)).includes("CURRENT.json"));
    await assert.rejects(request(app, "/api/full-backup/restore", { token: preview.token }), /预览已失效/);
  } finally {
    await app.close();
    if (target) await rm(target, { recursive: true, force: true });
  }
});
