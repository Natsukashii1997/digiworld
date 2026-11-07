import assert from "node:assert/strict";
import {
  mkdtemp,
  realpath,
  mkdir,
  writeFile,
  rename,
  rm,
  readFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { parseArgs } from "node:util";
import { startServer } from "../server/http.mjs";
import { createKnowledgeFiles } from "../server/knowledge-files.mjs";
import { seed } from "../src/store.js";
import { parse, stringify } from "../src/serialization.js";

export const knowledgeText =
  "# 合成知识原文\n仅供浏览器测试，不是真实个人资料。\n<script>window.knowledgeExecuted=true</script>\n![外部图片](https://example.invalid/private.png)\n";

export async function knowledgeFixture({
  staticRoot = process.env.GUIJI_TEST_DIST ||
    join(import.meta.dirname, "../dist"),
  port = 0,
  limits,
  filesystem,
} = {}) {
  const base = await realpath(
    await mkdtemp(join(tmpdir(), "guiji-knowledge-ui-")),
  );
  const root = join(base, "sources", "合成知识库");
  const emptyRoot = join(base, "sources", "空知识库");
  const directory = join(base, "database");
  await mkdir(join(root, "专题"), { recursive: true });
  await mkdir(emptyRoot, { recursive: true });
  await writeFile(join(root, "专题", "判断原则.md"), knowledgeText);
  await writeFile(
    join(root, "长文.md"),
    "# 长文\n" + "中英文_LongEvidence_".repeat(4000),
  );
  await writeFile(join(root, "普通附件.txt"), "不是 Markdown");
  let app,
    headers,
    offset = 0,
    replaced = 0;
  const clock = () => Date.now() + offset;
  async function boot() {
    app = await startServer({
      directory,
      port,
      staticRoot,
      clock,
      discovery: {
        knowledgeFiles: createKnowledgeFiles({
          clock,
          ...(limits ? { limits } : {}),
          ...(filesystem ? { fs: filesystem } : {}),
        }),
        defaultRoots: () => [],
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
    headers = {
      "x-workbench-token": session.token,
      "content-type": "application/json",
    };
  }
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
  await boot();
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
    staticRoot,
    get url() {
      return app.url;
    },
    call,
    async addSource(name) {
      assert.match(name, /^[^/\\.][^/\\]*$/);
      const path = join(base, "sources", name);
      await mkdir(path);
      return path;
    },
    async workspace() {
      return (await call("/workspace")).body;
    },
    advance(ms) {
      offset += ms;
    },
    resetClock() {
      offset = 0;
    },
    async changeFile() {
      await writeFile(
        join(root, "专题", "判断原则.md"),
        "# 更新后的合成原文\n",
      );
    },
    async replaceRoot() {
      const parked = join(base, "preserved-source-" + ++replaced);
      await rename(root, parked);
      await mkdir(root);
      await writeFile(join(root, "新来源.md"), "# 重新确认后的合成来源\n");
      return parked;
    },
    async original() {
      return readFile(join(root, "专题", "判断原则.md"), "utf8");
    },
    async restart() {
      await app.close();
      await boot();
    },
    async close() {
      await app.close();
      await rm(base, { recursive: true, force: true });
    },
  };
}

if (
  process.argv[1] &&
  pathToFileURL(process.argv[1]).href === import.meta.url
) {
  const { values } = parseArgs({
    options: {
      dist: { type: "string" },
      port: { type: "string", default: "0" },
    },
  });
  const fixture = await knowledgeFixture({
    ...(values.dist ? { staticRoot: values.dist } : {}),
    port: Number(values.port),
  });
  console.log(
    JSON.stringify({
      url: fixture.url,
      base: fixture.base,
      root: fixture.root,
      emptyRoot: fixture.emptyRoot,
      staticRoot: fixture.staticRoot,
    }),
  );
  for (const signal of ["SIGINT", "SIGTERM"])
    process.once(signal, async () => {
      await fixture.close();
      process.exit(0);
    });
}
