import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, rm, realpath } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { startServer } from "../server/http.mjs";
import { seed } from "../src/store.js";
import { stringify, parse } from "../src/serialization.js";

export async function contextFixture() {
  const dir = await realpath(await mkdtemp(join(tmpdir(), "guiji-context-")));
  const root = join(dir, "projects", "example");
  await mkdir(root, { recursive: true });
  await writeFile(
    join(root, "CURRENT.md"),
    "# 当前状态\n目标：上线作品集\n下一步：检查移动端\n",
  );
  await writeFile(
    join(root, "AGENTS.md"),
    "仅修改当前项目；发布需人工确认。\n",
  );
  const app = await startServer({
    directory: join(dir, "data"),
    port: 0,
    staticRoot: process.env.WORKBENCH_TEST_STATIC_ROOT || join(import.meta.dirname, "../dist"),
    discovery: {
      defaultRoots: () => [join(dir, "projects")],
      scanLocalProjects: async () => ({
        items: [
          {
            id: "project-context",
            name: "作品集",
            localPaths: [root],
            repoKey: "",
            kind: "Node",
          },
        ],
        errors: [],
        truncated: false,
        at: new Date().toISOString(),
      }),
      scanGitHub: async () => ({
        status: "not_connected",
        items: [],
        truncated: false,
        message: "",
        at: new Date().toISOString(),
      }),
      detectAgents: async () => ({ items: [], at: new Date().toISOString() }),
    },
  });
  const session = await (
    await fetch(app.url + "/api/session", {
      headers: { "x-workbench-client": "1" },
    })
  ).json();
  const headers = {
    "x-workbench-token": session.token,
    "content-type": "application/json",
  };
  const call = async (
    path,
    data,
    method = data === undefined ? "GET" : "POST",
  ) => {
    const r = await fetch(app.url + "/api" + path, {
      method,
      headers,
      ...(data === undefined ? {} : { body: stringify(data) }),
    });
    return { status: r.status, body: parse(await r.text()) };
  };
  await call("/workspace", { state: seed(), initialize: true }, "PUT");
  assert.equal((await call("/scan/projects", {})).status, 200);
  let stopped = false;
  async function stop() {
    if (!stopped) {
      stopped = true;
      await app.close();
    }
  }
  return {
    ...app,
    dir,
    root,
    call,
    headers,
    stop,
    input: {
      projectId: "project-context",
      root,
      currentPath: "CURRENT.md",
      rulesPath: "AGENTS.md",
    },
    async close() {
      await stop();
      await rm(dir, { recursive: true, force: true });
    },
  };
}
