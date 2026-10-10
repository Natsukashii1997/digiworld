import {authorizeCapability} from './capability-fixture.mjs';
import test from "node:test";
import assert from "node:assert/strict";
import { readFile, writeFile, chmod, stat } from "node:fs/promises";
import { join } from "node:path";
import { copyFixture } from "./copy-fixture.mjs";

const sentinel = "SYNTHETIC_PRIVATE_HTTP_SENTINEL";
const original = `# 合成配置，保留注释\nmodel = "${sentinel}"\n[tui]\nanimations = true # 保留此注释\nshow_tooltips = false\n`;

async function fixture(t) {
  const app = await copyFixture();
  await authorizeCapability(app,'agent');
  t.after(() => app.close());
  const path = join(app.home, "config.toml");
  await writeFile(path, original);
  await chmod(path, 0o600);
  const session = await (
    await fetch(app.url + "/api/session", {
      headers: { "x-workbench-client": "1" },
    })
  ).json();
  return { ...app, path, token: session.token };
}

function noPrivateContent(value) {
  const serialized = JSON.stringify(value);
  assert.equal(serialized.includes(sentinel), false);
  assert.equal(serialized.includes("保留此注释"), false);
}

test("配置 HTTP 仅对可证明未开始的执行前拒绝返回解锁凭据", async (t) => {
  const app = await fixture(t);
  const state = await app.call("/workspace");
  const preview = await app.call("/agent-config/preview", {
    targetId: app.target.id,
    key: "tui.animations",
    value: false,
    revision: state.revision,
  });
  app.advance(300001);
  const apply = async (token) => {
    const r = await fetch(app.url + "/api/agent-config/apply", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-workbench-token": app.token,
      },
      body: JSON.stringify({ token, revision: state.revision }),
    });
    return { status: r.status, body: await r.json() };
  };
  const refused = await apply(preview.token);
  assert.equal(refused.status, 409);
  assert.equal(refused.body.operationNotStarted, true);
  const unknown = await apply("00000000-0000-4000-8000-000000000000");
  assert.equal(unknown.body.operationNotStarted, undefined);
  assert.equal(await readFile(app.path, "utf8"), original);
});

test("配置 HTTP 显式概览与差异预览只返回白名单，不修改源文件或主库", async (t) => {
  const app = await fixture(t);
  const before = await app.call("/workspace");
  const sourceBefore = await stat(app.path);
  const overview = await app.call("/agent-config/inspect", {
    targetId: app.target.id,
  });
  assert.equal(overview.path, app.path);
  assert.equal(overview.scope, "Home");
  assert.equal(overview.adoption, "unverified");
  assert.deepEqual(
    overview.fields.map(({ key, status, value }) => ({ key, status, value })),
    [
      { key: "tui.animations", status: "configured", value: true },
      { key: "tui.show_tooltips", status: "configured", value: false },
    ],
  );
  const preview = await app.call("/agent-config/preview", {
    targetId: app.target.id,
    key: "tui.animations",
    value: false,
    revision: overview.revision,
  });
  assert.equal(preview.path, app.path);
  assert.equal(preview.beforeValue, true);
  assert.equal(preview.afterValue, false);
  assert.equal(preview.operationId, preview.token);
  assert.equal(preview.adoption, "unverified");
  noPrivateContent(overview);
  noPrivateContent(preview);
  assert.equal(await readFile(app.path, "utf8"), original);
  assert.equal((await stat(app.path)).ino, sourceBefore.ino);
  assert.deepEqual(await app.call("/workspace"), before);
});

test("配置 HTTP 确认后回读并保留历史，显式恢复原字节与权限且不宣称采用", async (t) => {
  const app = await fixture(t);
  const before = await app.call("/workspace");
  const preview = await app.call("/agent-config/preview", {
    targetId: app.target.id,
    key: "tui.animations",
    value: false,
    revision: before.revision,
  });
  const applied = await app.call("/agent-config/apply", {
    token: preview.token,
    revision: preview.revision,
  });
  assert.equal(applied.id, preview.operationId);
  assert.equal(applied.status, "matches_after");
  assert.equal(applied.adoption, "unverified");
  assert.equal(
    await readFile(app.path, "utf8"),
    original.replace("animations = true", "animations = false"),
  );
  assert.equal((await stat(app.path)).mode & 0o777, 0o600);
  const checked = await app.call("/agent-config/check", { id: applied.id });
  assert.equal(checked.status, "matches_after");
  const history = await app.call("/agent-config/history", {
    targetId: app.target.id,
  });
  assert.equal(history.items.length, 1);
  assert.equal(history.items[0].id, applied.id);
  assert.equal(history.items[0].status, "unchecked");
  assert.equal(history.items[0].adoption, "unverified");

  const restoredPreview = await app.call("/agent-config/restore-preview", {
    id: applied.id,
    revision: before.revision,
  });
  assert.equal(restoredPreview.kind, "restore");
  assert.equal(restoredPreview.restores, applied.id);
  assert.equal(restoredPreview.beforeValue, false);
  assert.equal(restoredPreview.afterValue, true);
  assert.equal(
    await readFile(app.path, "utf8"),
    original.replace("animations = true", "animations = false"),
  );
  const restored = await app.call("/agent-config/apply", {
    token: restoredPreview.token,
    revision: restoredPreview.revision,
  });
  assert.equal(restored.status, "matches_after");
  assert.equal(restored.adoption, "unverified");
  assert.equal(await readFile(app.path, "utf8"), original);
  assert.equal((await stat(app.path)).mode & 0o777, 0o600);
  assert.equal(
    (await app.call("/agent-config/check", { id: applied.id })).status,
    "matches_before",
  );
  const finalHistory = await app.call("/agent-config/history", {
    targetId: app.target.id,
  });
  assert.equal(finalHistory.items.length, 2);
  assert.equal(
    finalHistory.items.find((item) => item.kind === "restore").restores,
    applied.id,
  );
  for (const result of [
    applied,
    checked,
    history,
    restoredPreview,
    restored,
    finalHistory,
  ])
    noPrivateContent(result);
  assert.deepEqual(await app.call("/workspace"), before);
});

test("所有配置 HTTP 动作拒绝无会话、跨站、GET 和任意路径字段", async (t) => {
  const app = await fixture(t);
  const before = await app.call("/workspace");
  const inputs = {
    inspect: { targetId: app.target.id },
    preview: {
      targetId: app.target.id,
      key: "tui.animations",
      value: false,
      revision: before.revision,
    },
    apply: { token: "unknown-preview", revision: before.revision },
    check: { id: "unknown-operation" },
    history: { targetId: app.target.id },
    "restore-preview": { id: "unknown-operation", revision: before.revision },
  };
  for (const [action, input] of Object.entries(inputs)) {
    const url = app.url + "/api/agent-config/" + action;
    const headers = {
      "content-type": "application/json",
      "x-workbench-token": app.token,
    };
    assert.equal(
      (
        await fetch(url, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(input),
        })
      ).status,
      403,
      `${action}: unauthenticated`,
    );
    assert.equal(
      (
        await fetch(url, {
          method: "POST",
          headers: { ...headers, origin: "https://untrusted.example" },
          body: JSON.stringify(input),
        })
      ).status,
      403,
      `${action}: cross-origin`,
    );
    assert.equal((await fetch(url, { headers })).status, 404, `${action}: GET`);
    const forged = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify({ ...input, path: "/unapproved/config.toml" }),
    });
    assert.equal(forged.status, 400, `${action}: arbitrary path`);
    noPrivateContent(await forged.json());
  }
  assert.equal(await readFile(app.path, "utf8"), original);
  assert.deepEqual(await app.call("/workspace"), before);
  assert.deepEqual(
    await app.call("/agent-config/history", { targetId: app.target.id }),
    { items: [] },
  );
});

test("配置 HTTP 拒绝非白名单、错误类型、无效 JSON 与不支持的配置而不回显正文", async (t) => {
  const app = await fixture(t);
  const before = await app.call("/workspace");
  const valid = {
    targetId: app.target.id,
    key: "tui.animations",
    value: false,
    revision: before.revision,
  };
  const rejects = async (action, input, status = 400) => {
    await assert.rejects(
      app.call("/agent-config/" + action, input),
      (error) => {
        assert.equal(error.status, status);
        noPrivateContent(error.message);
        return true;
      },
    );
  };
  for (const input of [
    { ...valid, key: "model" },
    { ...valid, key: "mcp_servers.enabled" },
    { ...valid, value: sentinel },
    { ...valid, revision: -1 },
    { ...valid, content: sentinel },
    null,
    [],
  ])
    await rejects("preview", input);
  await rejects("inspect", { targetId: "not-a-saved-target" }, 409);
  const malformed = await fetch(app.url + "/api/agent-config/preview", {
    method: "POST",
    headers: {
      "x-workbench-token": app.token,
      "content-type": "application/json",
    },
    body: `{"private":"${sentinel}`,
  });
  assert.equal(malformed.status, 400);
  noPrivateContent(await malformed.json());
  const wrongType = await fetch(app.url + "/api/agent-config/inspect", {
    method: "POST",
    headers: { "x-workbench-token": app.token, "content-type": "text/plain" },
    body: JSON.stringify({ targetId: app.target.id }),
  });
  assert.equal(wrongType.status, 415);
  assert.equal(await readFile(app.path, "utf8"), original);

  const unsupported = original.replace(
    "animations = true",
    `animations = "${sentinel}"`,
  );
  await writeFile(app.path, unsupported);
  const overview = await app.call("/agent-config/inspect", {
    targetId: app.target.id,
  });
  const field = overview.fields.find((item) => item.key === "tui.animations");
  assert.equal(field.status, "unsupported");
  assert.equal(field.value, null);
  noPrivateContent(overview);
  await rejects("preview", valid);
  assert.equal(await readFile(app.path, "utf8"), unsupported);

  const invalidSyntax = `model = "${sentinel}"\n[tui\nanimations = true\n`;
  await writeFile(app.path, invalidSyntax);
  await rejects("inspect", { targetId: app.target.id });
  await rejects("preview", valid);
  assert.equal(await readFile(app.path, "utf8"), invalidSyntax);
  assert.deepEqual(await app.call("/workspace"), before);
  assert.deepEqual(
    await app.call("/agent-config/history", { targetId: app.target.id }),
    { items: [] },
  );
});

test("Codex App 不冒充 CLI 配置目标，过期预览不能通过 HTTP 写入", async (t) => {
  const app = await fixture(t);
  const state = await app.call("/workspace");
  const preview = await app.call("/agent-config/preview", {
    targetId: app.target.id,
    key: "tui.animations",
    value: false,
    revision: state.revision,
  });
  app.advance(300001);
  await assert.rejects(
    app.call("/agent-config/apply", {
      token: preview.token,
      revision: preview.revision,
    }),
    { status: 409 },
  );
  assert.equal(await readFile(app.path, "utf8"), original);
  const unsupportedState = await app.repository.updateConnections(
    (connections) => ({
      ...connections,
      agentTargets: connections.agentTargets.map((target) => ({
        ...target,
        program: { ...target.program, kind: "App" },
      })),
    }),
  );
  await assert.rejects(
    app.call("/agent-config/inspect", { targetId: app.target.id }),
    { status: 400 },
  );
  await assert.rejects(
    app.call("/agent-config/preview", {
      targetId: app.target.id,
      key: "tui.animations",
      value: false,
      revision: unsupportedState.revision,
    }),
    { status: 400 },
  );
  assert.deepEqual(await app.call("/workspace"), unsupportedState);
  assert.equal(await readFile(app.path, "utf8"), original);
  assert.deepEqual(
    await app.call("/agent-config/history", { targetId: app.target.id }),
    { items: [] },
  );
});
