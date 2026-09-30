// Disposable, local-only fixture for manual browser review. Never uses the real library.
import { fixture } from "./fixture.mjs";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const directory = await mkdtemp(join(tmpdir(), "guiji-source-audit-"));
const root = join(directory, "skills");
const source = join(root, "design-review");
await mkdir(join(source, "references"), { recursive: true });
await writeFile(
  join(source, "SKILL.md"),
  "---\nname: design-review\ndescription: 合成界面验收样本\n---\n# 设计检查\n核对层级、间距、边界与失败恢复。\n",
);
await writeFile(
  join(source, "references", "checklist.md"),
  "# 核对项\n- 主次操作清晰\n- 长路径能换行\n- 失败后能恢复\n",
);
const app = await fixture();
console.log(JSON.stringify({ url: app.url, root, pid: process.pid }));
let closing = false;
for (const signal of ["SIGINT", "SIGTERM"])
  process.on(signal, async () => {
    if (closing) return;
    closing = true;
    await app.close();
    await rm(directory, { recursive: true, force: true });
    process.exit(0);
  });
