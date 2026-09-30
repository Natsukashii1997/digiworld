import assert from "node:assert/strict";
import {
  mkdtemp,
  realpath,
  mkdir,
  writeFile,
  readFile,
  rm,
} from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { startServer } from "../server/http.mjs";
import { createKnowledgeFiles } from "../server/knowledge-files.mjs";
import { seed } from "../src/store.js";
import { stringify, parse } from "../src/serialization.js";

export const queryText =
  "# 合成正文\n正文独有的 Needle 与中文判断。\n<script>window.queryExecuted=true</script>\n";

export async function knowledgeQueryFixture({
  staticRoot = process.env.GUIJI_TEST_DIST ||
    join(import.meta.dirname, "../dist"),
  limits,
  queryLimits,
  port = 0,
} = {}) {
  const base = await realpath(await mkdtemp(join(tmpdir(), "guiji-query-ui-")));
  const root = join(base, "sources", "正文查询合成来源");
  const emptyRoot = join(base, "sources", "空知识库");
  const directory = join(base, "database");
  await mkdir(join(root, "专题"), { recursive: true });
  await mkdir(emptyRoot, { recursive: true });
  await writeFile(join(root, "专题", "判断原则.md"), queryText);
  await writeFile(join(root, "长文.md"), "# 无关键词\n这是另一份合成资料。\n");
  let offset = 0;
  const clock = () => Date.now() + offset;
  const app = await startServer({
    directory,
    staticRoot,
    port,
    clock,
    discovery: {
      knowledgeFiles: createKnowledgeFiles({
        clock,
        ...(limits ? { limits } : {}),
      }),
      knowledgeQueryLimits: queryLimits,
      defaultRoots: () => [],
      scanLocalProjects: async () => ({
        items: [],
        errors: [],
        truncated: false,
        at: new Date(clock()).toISOString(),
      }),
      scanGitHub: async () => ({
        status: "not_connected",
        items: [],
        truncated: false,
        message: "",
        at: new Date(clock()).toISOString(),
      }),
      detectAgents: async () => ({
        items: [],
        at: new Date(clock()).toISOString(),
      }),
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
  async function call(
    path,
    data,
    method = data === undefined ? "GET" : "POST",
  ) {
    const response = await fetch(app.url + "/api" + path, {
      method,
      headers,
      ...(data === undefined ? {} : { body: stringify(data) }),
    });
    return { status: response.status, body: parse(await response.text()) };
  }
  assert.equal(
    (await call("/workspace", { state: seed(), initialize: true }, "PUT"))
      .status,
    200,
  );
  return {
    base,
    root,
    emptyRoot,
    directory,
    url: app.url,
    call,
    workspace: async () => (await call("/workspace")).body,
    advance(ms) {
      offset += ms;
    },
    resetClock() {
      offset = 0;
    },
    async changeFile(path, content) {
      assert.ok(["专题/判断原则.md", "长文.md"].includes(path));
      await writeFile(join(root, path), content);
    },
    original: () => readFile(join(root, "专题", "判断原则.md"), "utf8"),
    async close() {
      await app.close();
      await rm(base, { recursive: true, force: true });
    },
  };
}
