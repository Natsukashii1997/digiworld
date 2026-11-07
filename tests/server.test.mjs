import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { startServer } from "../server/http.mjs";
import { seed } from "../src/store.js";
import { stringify, parse } from "../src/serialization.js";
import http from "node:http";
import { fixture } from "./fixture.mjs";

test("Agent 目标接口受会话保护、拒绝浏览器路径且只更新主库关系", async () => {
  const app = await fixture({
    discovery: {
      inspectAgentInventory: async () => ({
        homes: [
          {
            id: "home-one",
            path: "/fixture/home",
            label: "默认 Home",
            source: "默认目录",
            status: "present",
          },
        ],
        errors: [],
        truncated: false,
      }),
      inspectAgentPrograms: async () => [
        {
          id: "program-one",
          path: "/fixture/bin/codex",
          kind: "CLI",
          status: "present",
          version: { status: "unknown" },
        },
      ],
    },
  });
  try {
    const { token } = await (
      await fetch(app.url + "/api/session", {
        headers: { "x-workbench-client": "1" },
      })
    ).json();
    const headers = {
      "x-workbench-token": token,
      "content-type": "application/json",
    };
    const call = (path, data, extra = headers) =>
      fetch(app.url + "/api" + path, {
        method: "POST",
        headers: extra,
        body: JSON.stringify(data),
      });
    await fetch(app.url + "/api/workspace", {
      method: "PUT",
      headers,
      body: stringify({ state: seed(), initialize: true }),
    });
    await call("/scan/agents", {});
    const before = await (
      await fetch(app.url + "/api/workspace", { headers })
    ).json();
    assert.equal(
      (await call("/agent-targets/options", { agentId: "codex" }, {})).status,
      403,
    );
    assert.equal(
      (
        await call(
          "/agent-targets/options",
          { agentId: "codex" },
          { ...headers, origin: "https://example.com" },
        )
      ).status,
      403,
    );
    assert.equal(
      (
        await call("/agent-targets/options", {
          agentId: "codex",
          path: "/etc/passwd",
        })
      ).status,
      400,
    );
    const options = await (
      await call("/agent-targets/options", { agentId: "codex" })
    ).json();
    const afterOptions = await (
      await fetch(app.url + "/api/workspace", { headers })
    ).json();
    assert.deepEqual(afterOptions, before);
    const saved = await call("/agent-targets/save", {
      token: options.token,
      label: "测试目标",
      programId: "program-one",
      homeId: "home-one",
      revision: before.revision,
    });
    assert.equal(saved.status, 200);
    const state = await saved.json();
    assert.equal(state.connections.agentTargets.length, 1);
    assert.deepEqual(state.assets, before.assets);
    assert.equal(
      (
        await call("/agent-targets/remove", {
          id: state.connections.agentTargets[0].id,
          revision: state.revision,
        })
      ).status,
      200,
    );
  } finally {
    await app.close();
  }
});

test("Agent 目录检查仅接受已支持身份、受会话保护且不写主库", async () => {
  const calls = [];
  const expected = {
    agentId: "codex",
    at: "2026-09-26T00:00:00.000Z",
    homes: [],
    errors: [],
    truncated: false,
  };
  const app = await fixture({
    discovery: {
      inspectAgentInventory: async (id) => {
        calls.push(id);
        return expected;
      },
    },
  });
  try {
    const session = await (
      await fetch(app.url + "/api/session", {
        headers: { "x-workbench-client": "1" },
      })
    ).json();
    const headers = {
      "x-workbench-token": session.token,
      "content-type": "application/json",
    };
    const call = (data, extra = headers) =>
      fetch(app.url + "/api/agent-inventory", {
        method: "POST",
        headers: extra,
        body: stringify(data),
      });
    const state = () =>
      fetch(app.url + "/api/workspace", { headers }).then((r) => r.text());
    const before = await state();
    assert.equal(
      (await call({ agentId: "codex" }, { "content-type": "application/json" }))
        .status,
      403,
    );
    assert.equal(
      (
        await call(
          { agentId: "codex" },
          { ...headers, origin: "https://example.com" },
        )
      ).status,
      403,
    );
    for (const data of [
      null,
      [],
      {},
      { agentId: "unknown" },
      { agentId: "codex", home: "/" },
    ])
      assert.equal((await call(data)).status, 400);
    const response = await call({ agentId: "codex" });
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), expected);
    assert.deepEqual(calls, ["codex"]);
    assert.equal(await state(), before);
  } finally {
    await app.close();
  }
});

test("Agent 扫描结果自动存入主库且不可伪造；项目扫描接口已下线（#71）", async () => {
  const app = await fixture();
  try {
    const session = await (
      await fetch(app.url + "/api/session", {
        headers: { "x-workbench-client": "1" },
      })
    ).json();
    const headers = {
      "x-workbench-token": session.token,
      "content-type": "application/json",
    };
    const call = async (path, data, method = "POST") => {
      const r = await fetch(app.url + "/api" + path, {
        method,
        headers,
        body: stringify(data),
      });
      return { status: r.status, body: parse(await r.text()) };
    };
    await call("/workspace", { state: seed(), initialize: true }, "PUT");
    const retired = await call("/scan/projects", {});
    assert.equal(retired.status, 410);
    assert.match(retired.body.error, /digital-twin\/projects\.json/);
    const agents = await call("/scan/agents", {});
    assert.equal(agents.status, 200);
    assert.equal(agents.body.connections.agents.length, 3);
    const forged = structuredClone(agents.body);
    forged.connections.roots = ["/"];
    assert.equal(
      (await call("/workspace", { state: forged }, "PUT")).status,
      400,
    );
  } finally {
    await app.close();
  }
});
test("本地 API 需本页会话令牌，拒绝跨域和伪造 Host；保存后可回读", async () => {
  const directory = await mkdtemp(join(tmpdir(), "guiji-http-"));
  let app;
  try {
    app = await startServer({
      directory,
      port: 0,
      staticRoot: join(import.meta.dirname, "../dist"),
    });
    const url = app.url;
    assert.equal((await fetch(url + "/api/workspace")).status, 403);
    assert.equal(
      (
        await fetch(url + "/api/session", {
          headers: {
            "x-workbench-client": "1",
            origin: "https://evil.example",
          },
        })
      ).status,
      403,
    );
    const invalidHost = await new Promise((resolve, reject) => {
      http
        .get(
          url + "/api/session",
          { headers: { "x-workbench-client": "1", host: "evil.example" } },
          (res) => {
            res.resume();
            resolve(res.statusCode);
          },
        )
        .on("error", reject);
    });
    assert.equal(invalidHost, 403);
    const session = await (
      await fetch(url + "/api/session", {
        headers: { "x-workbench-client": "1" },
      })
    ).json();
    const headers = {
      "x-workbench-token": session.token,
      "content-type": "application/json",
    };
    const save = await fetch(url + "/api/workspace", {
      method: "PUT",
      headers,
      body: stringify({ state: seed(), initialize: true }),
    });
    assert.equal(save.status, 200);
    const state = parse(
      await (await fetch(url + "/api/workspace", { headers })).text(),
    );
    assert.equal(state.revision, 1);
    assert.equal(state.assets.length, 6);
  } finally {
    await app?.close();
    await rm(directory, { recursive: true, force: true });
  }
});
