import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { spawn } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { openRepository } from "../server/repository.mjs";
import { seed, makeAsset, current, revise } from "../src/store.js";

async function withRepository(fn) {
  const dir = await mkdtemp(join(tmpdir(), "guiji-repository-"));
  let r;
  try {
    r = await openRepository(dir);
    await fn(r, dir);
  } finally {
    await r?.close();
    await rm(dir, { recursive: true, force: true });
  }
}

test("外部配置事务的快照锁不增加主库版本，且与目标编辑串行", () =>
  withRepository(async r => {
    const initial=await r.write(seed(),{initialize:true});
    let release;
    const gate=new Promise(resolve=>{release=resolve;});
    let entered;
    const started=new Promise(resolve=>{entered=resolve;});
    const operation=r.withSnapshot({expectedRevision:initial.revision},async state=>{
      entered(); await gate; return state.revision;
    });
    await started;
    let written=false;
    const write=r.write(initial).then(value=>{written=true;return value;});
    await new Promise(resolve=>setImmediate(resolve));
    assert.equal(written,false);
    release();
    assert.equal(await operation,initial.revision);
    assert.equal((await write).revision,initial.revision+1);
    await assert.rejects(r.withSnapshot({expectedRevision:initial.revision},()=>assert.fail("stale callback executed")),/主库已变化/);
  }));

test("子进程异常终止后可重新打开；活跃写入进程仍排他锁定", async () => {
  const dir = await mkdtemp(join(tmpdir(), "guiji-crash-"));
  let child, reopened;
  try {
    const moduleURL = new URL("../server/repository.mjs", import.meta.url).href;
    const seedURL = new URL("../src/store.js", import.meta.url).href;
    child = spawn(
      process.execPath,
      [
        "--input-type=module",
        "-e",
        `import{openRepository}from ${JSON.stringify(moduleURL)};import{seed}from ${JSON.stringify(seedURL)};const r=await openRepository(${JSON.stringify(dir)});await r.write(seed(),{initialize:true});console.log('READY');setInterval(()=>{},1000);`,
      ],
      { stdio: ["ignore", "pipe", "pipe"] },
    );
    await new Promise((resolve, reject) => {
      child.stdout.once("data", resolve);
      child.once("error", reject);
      child.once("exit", (code) => code && reject(new Error("child failed")));
    });
    await assert.rejects(openRepository(dir));
    const exited = new Promise((resolve) => child.once("exit", resolve));
    child.kill("SIGKILL");
    await exited;
    reopened = await openRepository(dir);
    assert.equal((await reopened.read()).revision, 1);
  } finally {
    child?.kill("SIGKILL");
    await reopened?.close();
    await rm(dir, { recursive: true, force: true });
  }
});

test("主库保存后关闭再打开，中文内容和完整二进制文件仍可读取", async () => {
  const dir = await mkdtemp(join(tmpdir(), "guiji-repository-"));
  let repository;
  try {
    repository = await openRepository(dir);
    const input = seed();
    input.assets = [
      makeAsset({
        type: "Skill",
        title: "真实完整包",
        content: "中文说明",
        files: [
          { path: "SKILL.md", data: "# 测试", text: true },
          {
            path: "assets/中文.bin",
            data: new Uint8Array([0, 255, 128]),
            text: false,
          },
        ],
      }),
    ];
    const saved = await repository.write(input, { initialize: true });
    assert.equal(saved.revision, 1);
    await repository.close();
    repository = await openRepository(dir);
    const reloaded = await repository.read();
    assert.equal(current(reloaded.assets[0]).title, "真实完整包");
    assert.deepEqual(
      Array.from(current(reloaded.assets[0]).files[1].data),
      [0, 255, 128],
    );
  } finally {
    await repository?.close();
    await rm(dir, { recursive: true, force: true });
  }
});

test("兼容旧版编辑器在版本中保存的 type 字段", () =>
  withRepository(async (r) => {
    const input = seed();
    input.assets[0] = revise(input.assets[0], {
      type: "Skill",
      title: "旧版修改",
    });
    const stored = await r.write(input, { initialize: true });
    assert.equal(current(stored.assets[0]).title, "旧版修改");
  }));

test("并发写入只接纳一个版本，禁止篡改既有 Skill 历史和危险路径", () =>
  withRepository(async (r) => {
    const start = await r.write(seed(), { initialize: true });
    const attempts = await Promise.allSettled([
      r.write({
        ...start,
        notes: [
          {
            id: crypto.randomUUID(),
            text: "第一条",
            at: new Date().toISOString(),
          },
        ],
      }),
      r.write({ ...start, notes: [] }),
    ]);
    assert.equal(attempts.filter((a) => a.status === "fulfilled").length, 1);
    const fresh = await r.read();
    const changed = structuredClone(fresh);
    changed.assets[0].versions[0].content = "篡改";
    await assert.rejects(r.write(changed), /历史版本不可覆盖/);
    const invalid = structuredClone(fresh);
    invalid.assets.push(
      makeAsset({
        type: "Skill",
        title: "危险",
        files: [
          { path: "SKILL.md", data: "内容", text: true },
          { path: "../escape", data: "不允许", text: true },
        ],
      }),
    );
    await assert.rejects(r.write(invalid), /文件路径/);
    assert.equal((await r.read()).revision, fresh.revision);
  }));

test("备份恢复先预览，只增加缺失记录和兼容版本；过期预览和冲突不能写入", () =>
  withRepository(async (r) => {
    const initial = seed();
    initial.assets = [
      makeAsset({ type: "Prompt", title: "资产", content: "第一版" }),
    ];
    const first = await r.write(initial, { initialize: true });
    const backup = structuredClone(first);
    backup.assets[0] = revise(backup.assets[0], { content: "第二版" });
    backup.notes = [
      {
        id: crypto.randomUUID(),
        text: "备份中的想法",
        at: new Date().toISOString(),
      },
    ];
    const preview = await r.previewImport(backup);
    assert.equal(preview.summary.newVersions, 1);
    assert.equal(preview.summary.added.notes, 1);
    assert.equal((await r.read()).assets[0].versions.length, 1);
    const merged = await r.importBackup(backup, preview.token);
    assert.equal(merged.assets[0].versions.length, 2);
    assert.equal(merged.notes[0].text, "备份中的想法");
    await assert.rejects(r.importBackup(backup, preview.token), /预览已过期/);
    const conflict = structuredClone(backup);
    conflict.assets[0].versions[0].content = "冲突";
    await assert.rejects(r.previewImport(conflict), /版本冲突/);
    assert.equal((await r.read()).revision, merged.revision);
  }));
