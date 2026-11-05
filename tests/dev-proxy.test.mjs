import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { fixture } from "./fixture.mjs";

const root = join(import.meta.dirname, "..");

test("会话版本号取自 package.json，不另写一份", async () => {
  const app = await fixture();
  try {
    const { version } = JSON.parse(
      await readFile(join(root, "package.json"), "utf8"),
    );
    const session = await (
      await fetch(app.url + "/api/session", {
        headers: { "x-workbench-client": "1" },
      })
    ).json();
    assert.equal(session.version, version);
  } finally {
    await app.close();
  }
});

test("开发页面经代理访问本机服务，只接受自身来源，外部来源仍被拒绝", async () => {
  const app = await fixture();
  process.env.WORKBENCH_API_PORT = new URL(app.url).port;
  // 开发服务器创建失败时也要关掉 fixture，否则监听句柄让整个测试文件永不退出。
  let dev;
  try {
    const { createServer } = await import("vite");
    dev = await createServer({
      root,
      configFile: join(root, "vite.config.js"),
      server: { port: 0 },
      logLevel: "silent",
    });
    await dev.listen();
    const own = `http://127.0.0.1:${dev.httpServer.address().port}`;
    const session = await fetch(own + "/api/session", {
      headers: { "x-workbench-client": "1", origin: own },
    });
    assert.equal(session.status, 200);
    const { token } = await session.json();
    const workspace = await fetch(own + "/api/workspace", {
      headers: { "x-workbench-token": token, origin: own },
    });
    assert.equal(workspace.status, 200);
    for (const origin of ["https://evil.example", app.url.replace("127.0.0.1", "localhost")])
      assert.equal(
        (
          await fetch(own + "/api/session", {
            headers: { "x-workbench-client": "1", origin },
          })
        ).status,
        403,
      );
    assert.equal((await fetch(own + "/api/workspace")).status, 403);
  } finally {
    await dev?.close();
    delete process.env.WORKBENCH_API_PORT;
    await app.close();
  }
});
