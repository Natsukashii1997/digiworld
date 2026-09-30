import test from "node:test";
import assert from "node:assert/strict";
import { request as httpRequest } from "node:http";
import { mkdtemp, mkdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { startServer } from "../server/http.mjs";
import { seed } from "../src/store.js";
import { parse, stringify } from "../src/serialization.js";

async function fixture(t, scan = async () => ({ items: [], locations: [] })) {
  const directory = await mkdtemp(join(tmpdir(), "guiji-project-http-"));
  const root = join(directory, "projects");
  const path = join(root, "existing");
  await mkdir(path, { recursive: true });
  const at = "2026-09-26T12:00:00.000Z";
  let elapsed = 0;
  const app = await startServer({
    directory: join(directory, "data"),
    port: 0,
    staticRoot: join(import.meta.dirname, "../dist"),
    clock: () => Date.parse(at) + elapsed,
    discovery: {
      defaultRoots: () => [root],
      inspectProjectLocation: async (roots, selected) => {
        assert.deepEqual(roots, [root]);
        assert.ok(selected.startsWith(root + "/"));
        return {
          path: selected,
          status: "present",
          identity: "a".repeat(64),
          scopeSignature: "b".repeat(64),
          checkedAt: at,
          repoKey: "",
          kind: "Node",
        };
      },
      scanLocalProjects: async (...args) => ({
        errors: [],
        truncated: false,
        at,
        ...(await scan(...args)),
      }),
      scanGitHub: async () => ({
        status: "not_connected",
        login: "",
        items: [],
        message: "",
        truncated: false,
        at,
      }),
      detectAgents: async () => ({ items: [], at }),
    },
  });
  t.after(async () => {
    await app.close();
    await rm(directory, { recursive: true, force: true });
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
    const response = await fetch(app.url + "/api" + path, {
      method,
      headers,
      ...(data === undefined ? {} : { body: stringify(data) }),
    });
    return { status: response.status, body: parse(await response.text()) };
  };
  assert.equal(
    (await call("/workspace", { state: seed(), initialize: true }, "PUT"))
      .status,
    200,
  );
  await app.repository.updateConnections(() => ({
    roots: [root],
    projects: [
      {
        id: "stable-project",
        name: "原项目",
        repoKey: "",
        localPaths: [path],
        kind: "Node",
      },
    ],
    agents: [],
    github: { status: "not_connected", login: "", message: "", at: "" },
    projectScannedAt: "",
    agentScannedAt: "",
    errors: [],
    truncated: false,
  }));
  return {
    ...app,
    root,
    path,
    directory,
    at,
    headers,
    call,
    advance(ms) {
      elapsed += ms;
    },
  };
}

test("项目扫描 HTTP 将已登记目录交给扫描器并保存逐目录观测", async (t) => {
  let argumentsSeen;
  const app = await fixture(t, async (roots, options) => {
    argumentsSeen = { roots, options };
    return {
      items: [],
      locations: [{ path: app.path, status: "missing", checkedAt: app.at }],
    };
  });
  const scanned = await app.call("/scan/projects", {});
  assert.equal(scanned.status, 200);
  assert.deepEqual(argumentsSeen.options?.knownPaths, [app.path]);
  assert.deepEqual(argumentsSeen.roots, [app.root]);
  assert.deepEqual(scanned.body.connections.projects[0].locations, [
    {
      path: app.path,
      status: "missing",
      checkedAt: app.at,
    },
  ]);
  assert.equal(scanned.body.connections.projects[0].id, "stable-project");
});

test("扫描期间范围被另一操作改变时拒绝迟到结果，不覆盖最新目录范围", async (t) => {
  let release, entered;
  const gate = new Promise((resolve) => {
    release = resolve;
  });
  const started = new Promise((resolve) => {
    entered = resolve;
  });
  const app = await fixture(t, async () => {
    entered();
    await gate;
    return { items: [], locations: [] };
  });
  const pending = app.call("/scan/projects", {});
  await started;
  const changedRoot = join(app.directory, "new-scope");
  const changed = await app.repository.updateConnections((c) => ({
    ...c,
    roots: [changedRoot],
  }));
  release();
  const result = await pending;
  assert.equal(result.status, 409);
  assert.match(result.body.error, /扫描范围|目录范围/);
  assert.deepEqual((await app.call("/workspace")).body, changed);
});

test("扫描 HTTP 不折叠各自已有 Current 连接的两个同远端项目", async (t) => {
  const app = await fixture(t, async () => ({
    items: [
      {
        id: "scan-first",
        name: "甲",
        localPaths: [app.path],
        repoKey: "owner/shared",
      },
      {
        id: "scan-second",
        name: "乙",
        localPaths: [join(app.root, "second")],
        repoKey: "owner/shared",
      },
    ],
    locations: [],
  }));
  const state = await app.repository.updateConnections((c) => {
    const projects = [
      ...c.projects,
      {
        id: "second-project",
        name: "乙",
        localPaths: [join(app.root, "second")],
        repoKey: "",
      },
    ];
    return {
      ...c,
      projects,
      contextBindings: projects.map((p) => ({
        projectId: p.id,
        root: p.localPaths[0],
        repoKey: "",
        currentPath: "CURRENT.md",
        rulesPath: "",
        boundAt: app.at,
      })),
    };
  });
  const result = await app.call("/scan/projects", {});
  assert.equal(result.status, 200);
  assert.deepEqual(result.body.connections.projects.map((p) => p.id).sort(), [
    "second-project",
    "stable-project",
  ]);
  assert.deepEqual(
    result.body.connections.contextBindings,
    state.connections.contextBindings,
  );
  assert.equal(
    result.body.connections.projects.every((p) => p.identityConflict === true),
    true,
  );
});

test("目录重新确认 HTTP 预览不写主库，确认保留项目 ID 并轮换关联代次", async (t) => {
  const app = await fixture(t);
  const before = (await app.call("/workspace")).body;
  const preview = await app.call("/project-identity/preview", {
    mode: "accept",
    projectId: "stable-project",
    path: app.path,
    revision: before.revision,
  });
  assert.equal(preview.status, 200);
  assert.equal(preview.body.project.id, "stable-project");
  assert.deepEqual(preview.body.newPaths, [app.path]);
  assert.deepEqual((await app.call("/workspace")).body, before);
  const confirmed = await app.call("/project-identity/confirm", {
    token: preview.body.token,
    revision: preview.body.revision,
  });
  assert.equal(confirmed.status, 200);
  assert.equal(confirmed.body.connections.projects[0].id, "stable-project");
  assert.equal(
    confirmed.body.connections.projects[0].relationVersion,
    preview.body.token,
  );
  assert.equal(
    confirmed.body.connections.projects[0].locations[0].identity,
    "a".repeat(64),
  );
  assert.deepEqual((await app.call("/workspace")).body, confirmed.body);
  assert.equal(
    (
      await app.call("/project-identity/confirm", {
        token: preview.body.token,
        revision: preview.body.revision,
      })
    ).status,
    409,
  );
});

test("项目关联 HTTP 继承会话、同源、JSON、POST与固定动作边界", async (t) => {
  const app = await fixture(t);
  const before = (await app.call("/workspace")).body;
  const inputs = {
    preview: {
      mode: "accept",
      projectId: "stable-project",
      path: app.path,
      revision: before.revision,
    },
    confirm: { token: "unknown", revision: before.revision },
  };
  for (const [action, input] of Object.entries(inputs)) {
    const url = app.url + "/api/project-identity/" + action;
    for (const [index, headers] of [
      { "content-type": "application/json" },
      { ...app.headers, origin: "https://outside.example" },
      { ...app.headers, "sec-fetch-site": "cross-site" },
    ].entries())
      assert.equal(
        (await fetch(url, { method: "POST", headers, body: stringify(input) }))
          .status,
        403,
        `boundary ${index}`,
      );
    const badHost = await new Promise((resolve, reject) => {
      const request = httpRequest(
        url,
        {
          method: "POST",
          headers: { ...app.headers, host: "outside.example" },
        },
        (response) => {
          response.resume();
          response.on("end", () => resolve(response.statusCode));
        },
      );
      request.on("error", reject);
      request.end(stringify(input));
    });
    assert.equal(badHost, 403);
    assert.equal((await fetch(url, { headers: app.headers })).status, 404);
    assert.equal(
      (
        await fetch(url, {
          method: "PUT",
          headers: app.headers,
          body: stringify(input),
        })
      ).status,
      404,
    );
    assert.equal(
      (
        await fetch(url, {
          method: "POST",
          headers: { ...app.headers, "content-type": "text/plain" },
          body: stringify(input),
        })
      ).status,
      415,
    );
    assert.equal(
      (await fetch(url, { method: "POST", headers: app.headers, body: "{" }))
        .status,
      400,
    );
    assert.equal(
      (
        await app.call("/project-identity/" + action, {
          ...input,
          arbitraryPath: "/unapproved/private",
        })
      ).status,
      400,
    );
  }
  assert.equal((await app.call("/project-identity/delete", {})).status, 404);
  assert.equal(
    (
      await app.call("/project-identity/preview", {
        ...inputs.preview,
        path: join(app.directory, "unregistered"),
      })
    ).status,
    400,
  );
  assert.deepEqual((await app.call("/workspace")).body, before);
});

test("关联已发现目录 HTTP 保留原 ID 与 Current 指针，只改变关系元数据", async (t) => {
  const app = await fixture(t);
  const candidatePath = join(app.root, "candidate");
  const before = await app.repository.updateConnections((c) => ({
    ...c,
    projects: [
      ...c.projects,
      {
        id: "candidate-project",
        name: "候选",
        repoKey: "",
        localPaths: [candidatePath],
      },
    ],
    contextBindings: [
      {
        projectId: "stable-project",
        root: app.path,
        repoKey: "",
        currentPath: "CURRENT.md",
        rulesPath: "AGENTS.md",
        boundAt: app.at,
      },
    ],
  }));
  const preview = await app.call("/project-identity/preview", {
    mode: "merge",
    projectId: "stable-project",
    candidateId: "candidate-project",
    replacePath: "",
    revision: before.revision,
  });
  assert.equal(preview.status, 200);
  assert.equal(preview.body.contextNeedsReview, true);
  assert.deepEqual(preview.body.newPaths, [app.path, candidatePath]);
  assert.deepEqual((await app.call("/workspace")).body, before);
  const saved = await app.call("/project-identity/confirm", {
    token: preview.body.token,
    revision: preview.body.revision,
  });
  assert.equal(saved.status, 200);
  assert.deepEqual(
    saved.body.connections.projects.map((p) => p.id),
    ["stable-project"],
  );
  assert.deepEqual(saved.body.connections.projects[0].aliases, [
    "candidate-project",
  ]);
  assert.deepEqual(
    saved.body.connections.contextBindings,
    before.connections.contextBindings,
  );
});

test("项目关联 HTTP 拒绝过期、旧 revision 与未知 token，不推进状态", async (t) => {
  const app = await fixture(t);
  const before = (await app.call("/workspace")).body;
  const preview = await app.call("/project-identity/preview", {
    mode: "accept",
    projectId: "stable-project",
    path: app.path,
    revision: before.revision,
  });
  assert.equal(preview.status, 200);
  assert.equal(
    (
      await app.call("/project-identity/confirm", {
        token: preview.body.token,
        revision: before.revision + 1,
      })
    ).status,
    409,
  );
  assert.equal(
    (
      await app.call("/project-identity/confirm", {
        token: "unknown",
        revision: before.revision,
      })
    ).status,
    409,
  );
  app.advance(300001);
  assert.equal(
    (
      await app.call("/project-identity/confirm", {
        token: preview.body.token,
        revision: before.revision,
      })
    ).status,
    409,
  );
  assert.deepEqual((await app.call("/workspace")).body, before);
});
