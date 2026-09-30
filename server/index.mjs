import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";
import { startServer } from "./http.mjs";
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const app = await startServer({
  directory: process.env.WORKBENCH_DATA_DIR || join(root, "data"),
  port: Number(process.env.PORT || 5178),
  staticRoot: join(root, "dist"),
});
console.log(`数码世界 ${app.url}`);
let stopping = false;
for (const signal of ["SIGINT", "SIGTERM"])
  process.on(signal, async () => {
    if (stopping) return;
    stopping = true;
    await app.close();
    process.exit(0);
  });
