// #122 数据目录迁出代码仓库：正式入口默认用应用目录下的 data，WORKBENCH_DATA_DIR 仍优先。
// 用临时 HOME 起正式入口（端口 0、MCP 关），不碰真实数据目录。
import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, realpath, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { workbenchDataDirectory } from "../server/launch-agent.mjs";

const root = dirname(dirname(fileURLToPath(import.meta.url)));

test("默认数据目录在应用目录下、代码仓库外", () => {
  assert.equal(workbenchDataDirectory("/synthetic/home"), "/synthetic/home/Library/Application Support/PersonalAIWorkbench/data");
  assert.ok(relative(root, workbenchDataDirectory(root)).length > 0);
  assert.ok(relative(root, workbenchDataDirectory("/synthetic/home")).startsWith(".."), "不在代码仓库里");
});

async function startEntry(env) {
  const child = spawn(process.execPath, [join(root, "server", "index.mjs")], {
    cwd: root,
    env: { PATH: process.env.PATH, PORT: "0", WORKBENCH_MCP_PORT: "off", ...env },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let output = "";
  const ready = new Promise((resolve, reject) => {
    child.stdout.on("data", (chunk) => { output += chunk; if (/数码世界 http/.test(output)) resolve(); });
    child.stderr.on("data", (chunk) => { output += chunk; });
    child.on("exit", (code) => reject(new Error(`正式入口提前退出（${code}）：${output}`)));
  });
  try { await ready; } catch (error) { child.kill("SIGKILL"); throw error; }
  return async () => { const exited = new Promise((r) => child.once("exit", r)); child.kill("SIGTERM"); await exited; };
}

test("正式入口：不设 WORKBENCH_DATA_DIR 用应用目录下的 data；设了就用设的", async () => {
  const base = await realpath(await mkdtemp(join(tmpdir(), "data-dir-122-")));
  try {
    const home = join(base, "home");
    let stop = await startEntry({ HOME: home });
    try { assert.ok((await stat(join(workbenchDataDirectory(home), ".writer-lock.sqlite"))).isFile(), "默认位置被主库占用（写锁）"); }
    finally { await stop(); }
    const custom = join(base, "custom");
    stop = await startEntry({ HOME: join(base, "home2"), WORKBENCH_DATA_DIR: custom });
    try {
      assert.ok((await stat(join(custom, ".writer-lock.sqlite"))).isFile(), "环境变量指定的位置被主库占用");
      await assert.rejects(stat(workbenchDataDirectory(join(base, "home2"))), { code: "ENOENT" }, "设了环境变量就不碰默认位置");
    } finally { await stop(); }
  } finally { await rm(base, { recursive: true, force: true }); }
});
