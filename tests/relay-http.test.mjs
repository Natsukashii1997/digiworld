// 接力HTTP门：合成DI、临时库、动态端口，不创建真实会话适配器。
import { test } from "node:test";
import assert from "node:assert/strict";
import { fixture } from "./fixture.mjs";
test("接力HTTP继承token/同源保护、四POST白名单；越权字段不调用适配器", async () => {
  const calls = [],
    mock = Object.fromEntries(
      ["list", "prepare", "clear", "open"].map((action) => [
        action,
        async (data) => {
          calls.push({ action, data });
          return { action };
        },
      ]),
    );
  const app = await fixture({ discovery: { relaySessions: mock } });
  try {
    const token = (
      await (
        await fetch(app.url + "/api/session", {
          headers: { "X-Workbench-Client": "1" },
        })
      ).json()
    ).token;
    const send = (path, body, headers = {}, method = "POST") =>
      fetch(app.url + "/api/relay-sessions/" + path, {
        method,
        headers: { "Content-Type": "application/json", ...headers },
        ...(method === "POST" ? { body: JSON.stringify(body) } : {}),
      });
    assert.equal(
      (await send("list", { pageId: "fixture-page-00000001" })).status,
      403,
    );
    assert.equal(calls.length, 0);
    assert.equal(
      (
        await send(
          "list",
          { pageId: "fixture-page-00000001" },
          {
            "X-Workbench-Token": token,
            Origin: "https://synthetic-invalid.test",
          },
        )
      ).status,
      403,
    );
    assert.equal(calls.length, 0);
    for (const [action, data] of [
      ["list", { pageId: "fixture-page-00000001", earlier: false }],
      [
        "prepare",
        { pageId: "fixture-page-00000001", id: "1".padStart(64, "0") },
      ],
      ["clear", { pageId: "fixture-page-00000001" }],
      ["open", { agentId: "codex" }],
    ]) {
      const headers = { "X-Workbench-Token": token };
      assert.equal(
        (
          await send(
            action,
            { ...data, path: "/unapproved", prompt: "不要输入" },
            headers,
          )
        ).status,
        400,
      );
      assert.equal(calls.length, 0);
    }
    assert.equal(
      (await send("list", {}, { "X-Workbench-Token": token }, "GET")).status,
      404,
    );
    assert.equal(
      (
        await send(
          "list",
          { pageId: "fixture-page-00000001", earlier: false },
          { "X-Workbench-Token": token },
        )
      ).status,
      200,
    );
    assert.deepEqual(calls, [
      {
        action: "list",
        data: { pageId: "fixture-page-00000001", earlier: false },
      },
    ]);
  } finally {
    await app.close();
  }
});
