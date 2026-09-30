// 探针 1：atomicReplaceConfig 在非 darwin 上是否在 rename 之前被元数据检查拦下。
// 只在临时目录里建合成文件；不改 src/ server/ tests/。
// 用法：node docs/agents/handoffs/cloud-env-diff-probes/probe-metadata-guard.mjs
import fs from "node:fs/promises";
import { mkdtemp, writeFile, readFile, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { readConfigFile, atomicReplaceConfig } from "../../../../server/config-file.mjs";

const dir = await mkdtemp(join(tmpdir(), "probe-meta-"));
const path = join(dir, "config.toml");
await writeFile(path, "animations = true\n", { mode: 0o600 });
console.log("platform=%s uid=%s", process.platform, process.getuid());

const calls = [];
const traced = {
  ...fs,
  rename: async (a, b) => { calls.push("rename"); return fs.rename(a, b); },
  open: async (p, ...rest) => { calls.push("open " + p.split("/").pop()); return fs.open(p, ...rest); },
};

// 1) 默认 checkMetadata（生产路径）
let current = await readConfigFile(path);
const inoBefore = (await stat(path)).ino;
try {
  await atomicReplaceConfig(path, current, Buffer.from("animations = false\n"), { filesystem: traced });
  console.log("[default] 写入成功");
} catch (e) {
  console.log("[default] 抛出 status=%s message=%s outcome=%s", e.status, e.message, e.outcome);
}
console.log("[default] 调用序列:", calls.join(" | ") || "(无)");
console.log("[default] rename 是否被调用:", calls.includes("rename"));
console.log("[default] 文件内容:", JSON.stringify(await readFile(path, "utf8")), "inode 不变:", (await stat(path)).ino === inoBefore);
console.log("[default] 目录残留:", (await fs.readdir(dir)).join(","));

// 2) 注入一个不做 xattr 的 checkMetadata，验证 Linux 上的 rename/inode/权限/回读语义本身可用
calls.length = 0;
current = await readConfigFile(path);
try {
  const r = await atomicReplaceConfig(path, current, Buffer.from("animations = false\n"), {
    filesystem: traced,
    checkMetadata: async () => ({ provenance: null }),
  });
  console.log("[stubbed] 写入成功 mode=%s uid=%s", r.mode.toString(8), r.uid);
} catch (e) {
  console.log("[stubbed] 抛出 status=%s message=%s", e.status, e.message);
}
console.log("[stubbed] rename 是否被调用:", calls.includes("rename"));
console.log("[stubbed] 文件内容:", JSON.stringify(await readFile(path, "utf8")), "inode 已换:", (await stat(path)).ino !== inoBefore);
await rm(dir, { recursive: true, force: true });
