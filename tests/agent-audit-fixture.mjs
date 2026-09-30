// Disposable metadata + Skill source fixture. Never uses the user's Agent directories.
import { fixture } from "./fixture.mjs";
import { inspectAgentInventory } from "../server/agent-inventory.mjs";
import { mkdir, mkdtemp, writeFile, rm, realpath } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
const home = await realpath(
  await mkdtemp(join(tmpdir(), "guiji-agent-audit-")),
);
for (const path of [
  ".hermes/skills/design-review",
  ".hermes/profiles/research/skills",
  ".codex/skills",
  ".agents/skills",
])
  await mkdir(join(home, path), { recursive: true });
await writeFile(
  join(home, ".hermes/skills/design-review/SKILL.md"),
  "---\nname: design-review\ndescription: 合成设计验收样本\n---\n# 设计检查\n核对层级、间距、失败恢复。\n",
);
const app = await fixture({
  discovery: {
    inspectAgentInventory: (agentId) =>
      inspectAgentInventory(agentId, { home, environment: {} }),
  },
});
console.log(JSON.stringify({ url: app.url, home, pid: process.pid }));
let closing = false;
for (const signal of ["SIGINT", "SIGTERM"])
  process.on(signal, async () => {
    if (closing) return;
    closing = true;
    await app.close();
    await rm(home, { recursive: true, force: true });
    process.exit(0);
  });
