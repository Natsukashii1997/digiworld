// 探针 7：0o000 文件对 root 与普通用户的读取差异（skill-files.test.mjs:198、D-R4 的 chmod 0o555）。
import { mkdtemp, writeFile, chmod, readFile, rm, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
const dir = await mkdtemp(join(tmpdir(), "probe-perm-"));
const file = join(dir, "SKILL.md");
await writeFile(file, "入口");
await chmod(file, 0o000);
try { await readFile(file); console.log(`uid=${process.getuid()} 读取 0o000 文件：成功（权限位被绕过）`); }
catch (e) { console.log(`uid=${process.getuid()} 读取 0o000 文件：${e.code}`); }
const ro = join(dir, "ro"); await mkdir(ro); await chmod(ro, 0o555);
try { await writeFile(join(ro, "x.tmp"), "x"); console.log(`uid=${process.getuid()} 在 0o555 目录建文件：成功（权限位被绕过）`); }
catch (e) { console.log(`uid=${process.getuid()} 在 0o555 目录建文件：${e.code}`); }
await chmod(ro, 0o755); await chmod(file, 0o600); await rm(dir, { recursive: true, force: true });
