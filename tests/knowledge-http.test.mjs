import test from "node:test";
import assert from "node:assert/strict";
import {
  mkdtemp,
  mkdir,
  writeFile,
  readFile,
  rename,
  rm,
} from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { startServer } from "../server/http.mjs";
import { seed } from "../src/store.js";
import { parse, stringify } from "../src/serialization.js";

async function fixture(t) {
  const base = await mkdtemp(join(tmpdir(), "guiji-knowledge-http-"));
  const root = join(base, "合成知识库");
  await mkdir(root);
  const content = "# 合成知识\n权限属于本人。<script>never execute</script>\n";
  await writeFile(join(root, "原则.md"), content);
  const app = await startServer({
    directory: join(base, "data"),
    port: 0,
    discovery: { defaultRoots: () => [join(base, "projects")] },
  });
  t.after(async () => {
    await app.close();
    await rm(base, { recursive: true, force: true });
  });
  const session = await (
    await fetch(app.url + "/api/session", {
      headers: { "X-Workbench-Client": "1" },
    })
  ).json();
  const headers = {
    "Content-Type": "application/json",
    "X-Workbench-Token": session.token,
  };
  const call = async (action, data, custom = headers) => {
    const response = await fetch(app.url + "/api/knowledge/" + action, {
      method: "POST",
      headers: custom,
      body: stringify(data),
    });
    return { status: response.status, body: parse(await response.text()) };
  };
  const state = await app.repository.write(seed(), { initialize: true });
  const connect = {
    name: "合成知识",
    kind: "obsidian",
    root,
    confirmed: true,
    expectedRevision: state.revision,
  };
  return { app, base, root, content, call, headers, state, connect };
}

test("正文查询HTTP只读闭环继承会话/同源/JSON门禁，结果不进入备份", async (t) => {
  const f = await fixture(t);
  const connected = await f.call("connect", f.connect);
  const sourceId = connected.body.connections.knowledgeSources[0].id;
  const scanned = await f.call("scan", { sourceId });
  const input = {
    sourceId,
    scanId: scanned.body.scanId,
    query: "权限属于本人",
    offset: 0,
  };
  assert.equal(
    (await f.call("search", input, { "Content-Type": "application/json" }))
      .status,
    403,
  );
  assert.equal(
    (
      await f.call("search", input, {
        ...f.headers,
        Origin: "https://example.com",
      })
    ).status,
    403,
  );
  assert.equal(
    (
      await f.call("search", input, {
        ...f.headers,
        "Content-Type": "text/plain",
      })
    ).status,
    415,
  );
  const found = await f.call("search", input);
  assert.equal(found.status, 200, found.body.error);
  assert.equal(found.body.results[0].path, "原则.md");
  assert.equal(found.body.results[0].snippets[0].line, 2);
  assert.match(found.body.results[0].snippets[0].text, /权限属于本人/);
  assert.equal(
    (await f.call("search", { ...input, root: f.root })).status,
    400,
  );
  const backup = await (
    await fetch(f.app.url + "/api/backup", { headers: f.headers })
  ).text();
  assert.ok(!backup.includes("权限属于本人"));
  assert.equal(
    (await f.app.repository.read()).revision,
    connected.body.revision,
  );
  assert.equal(await readFile(join(f.root, "原则.md"), "utf8"), f.content);
});

test("知识接口需要本机会话和同源，连接-扫描-原文-断开完整只读闭环", async (t) => {
  const f = await fixture(t);
  assert.equal(
    (await f.call("connect", f.connect, { "Content-Type": "application/json" }))
      .status,
    403,
  );
  assert.equal(
    (
      await f.call("connect", f.connect, {
        ...f.headers,
        Origin: "https://example.com",
      })
    ).status,
    403,
  );
  assert.equal(
    (
      await f.call("connect", f.connect, {
        ...f.headers,
        "Content-Type": "text/plain",
      })
    ).status,
    415,
  );
  const connected = await f.call("connect", f.connect);
  assert.equal(connected.status, 200, connected.body.error);
  assert.deepEqual(connected.body.connections.roots, [
    join(f.base, "projects"),
  ]);
  const source = connected.body.connections.knowledgeSources[0];
  const scanned = await f.call("scan", { sourceId: source.id });
  assert.equal(scanned.status, 200, scanned.body.error);
  assert.deepEqual(
    scanned.body.files.map((v) => v.path),
    ["原则.md"],
  );
  const read = await f.call("read", {
    sourceId: source.id,
    scanId: scanned.body.scanId,
    path: "原则.md",
  });
  assert.equal(read.status, 200, read.body.error);
  assert.equal(read.body.content, f.content);
  const backup = parse(
    await (
      await fetch(f.app.url + "/api/backup", { headers: f.headers })
    ).text(),
  );
  assert.ok(!stringify(backup).includes("never execute"));
  assert.equal(
    (
      await f.call("remove", {
        sourceId: source.id,
        expectedRevision: connected.body.revision,
        confirmed: true,
      })
    ).status,
    200,
  );
  assert.equal(
    (
      await f.call("read", {
        sourceId: source.id,
        scanId: scanned.body.scanId,
        path: "原则.md",
      })
    ).status,
    404,
  );
  assert.equal(await readFile(join(f.root, "原则.md"), "utf8"), f.content);
});

test("文件或来源目录变化必须重扫/重新确认；并发连接不会覆盖", async (t) => {
  const f = await fixture(t);
  const results = await Promise.all([
    f.call("connect", f.connect),
    f.call("connect", f.connect),
  ]);
  assert.deepEqual(results.map((v) => v.status).sort(), [200, 409]);
  const connected = results.find((v) => v.status === 200).body;
  const source = connected.connections.knowledgeSources[0];
  const scanned = (await f.call("scan", { sourceId: source.id })).body;
  await writeFile(join(f.root, "原则.md"), "# Updated synthetic body");
  const stale = await f.call("read", {
    sourceId: source.id,
    scanId: scanned.scanId,
    path: "原则.md",
  });
  assert.equal(stale.status, 409, stale.body.error);
  await rename(f.root, f.root + "-old");
  await mkdir(f.root);
  await writeFile(join(f.root, "新来源.md"), "# New synthetic source");
  assert.equal((await f.call("scan", { sourceId: source.id })).status, 409);
  const renewed = await f.call("reconfirm", {
    sourceId: source.id,
    expectedRevision: connected.revision,
    confirmed: true,
  });
  assert.equal(renewed.status, 200, renewed.body.error);
  assert.equal(renewed.body.connections.knowledgeSources[0].id, source.id);
  const fresh = await f.call("scan", { sourceId: source.id });
  assert.deepEqual(
    fresh.body.files.map((v) => v.path),
    ["新来源.md"],
  );
});

test("首次通用保存与备份导入都不能创建知识读取授权", async (t) => {
  const f = await fixture(t);
  const connected = await f.call("connect", f.connect);
  const fresh = await startServer({
    directory: join(f.base, "fresh-database"),
    port: 0,
  });
  t.after(() => fresh.close());
  const session = await (
    await fetch(fresh.url + "/api/session", {
      headers: { "X-Workbench-Client": "1" },
    })
  ).json();
  const headers = {
    "X-Workbench-Token": session.token,
    "Content-Type": "application/json",
  };
  const call = async (path, data, method = "POST") => {
    const response = await fetch(fresh.url + "/api" + path, {
      method,
      headers,
      body: stringify(data),
    });
    return { status: response.status, body: parse(await response.text()) };
  };
  assert.equal(
    (
      await call(
        "/workspace",
        { state: connected.body, initialize: true },
        "PUT",
      )
    ).status,
    400,
  );
  assert.equal(
    (await call("/workspace", { state: seed(), initialize: true }, "PUT"))
      .status,
    200,
  );
  const preview = await call("/import/preview", connected.body);
  assert.equal(preview.status, 200);
  const restored = await call("/import/confirm", {
    backup: connected.body,
    token: preview.body.token,
  });
  assert.equal(restored.status, 200, restored.body.error);
  assert.equal((await fresh.repository.read()).connections, undefined);
});
