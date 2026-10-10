import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";
import { readDaemonCodeRevision } from "./daemon-code-revision.mjs";
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const daemonRuntimeCodeRevision = await readDaemonCodeRevision(root);
const { startServer } = await import("./http.mjs");
const { createKnowledgeAgentStatus } = await import("./knowledge-agent-status.mjs");
if (await readDaemonCodeRevision(root) !== daemonRuntimeCodeRevision) throw new Error("工作台代码在启动期间变化，请在构建完成后重新启动");
const app = await startServer({
  discovery: { daemonRuntimeCodeRevision, daemonCurrentPid: process.pid },
  directory: process.env.WORKBENCH_DATA_DIR || join(root, "data"),
  port: Number(process.env.PORT || 5178),
  staticRoot: join(root, "dist"),
  enableCapabilityScheduler: true,
  mcpClientHealth: createKnowledgeAgentStatus(),
  // 个人说明 MCP 服务（切片 3.3）：默认 127.0.0.1:5179；WORKBENCH_MCP_PORT=off 关闭。
  mcpPort:
    process.env.WORKBENCH_MCP_PORT === "off"
      ? undefined
      : Number(process.env.WORKBENCH_MCP_PORT || 5179),
});
console.log(`数码世界 ${app.url}`);
if (app.mcpUrl) console.log(`个人说明 MCP ${app.mcpUrl}`);
let stopping = false;
for (const signal of ["SIGINT", "SIGTERM"])
  process.on(signal, async () => {
    if (stopping) return;
    stopping = true;
    await app.close();
    process.exit(0);
  });
