import test from "node:test";
import assert from "node:assert/strict";
import {
  writeFile,
  readFile,
  rm,
  symlink,
  link,
  mkdir,
  rename,
} from "node:fs/promises";
import { join } from "node:path";
import { contextFixture } from "./context-fixture.mjs";
import { createProjectContext } from "../server/project-context.mjs";

test("来源子目录同字节替换使旧预览和旧绑定失效，重新确认后可交接", async () => {
  const app = await contextFixture();
  try {
    const docs = join(app.root, "docs");
    await mkdir(docs);
    await writeFile(join(docs, "CURRENT.md"), "# 同字节子目录来源\n");
    const input = {
      ...app.input,
      currentPath: "docs/CURRENT.md",
      rulesPath: "",
    };
    const before = (await app.call("/project-context/preview", input)).body;
    const bound = await app.call("/project-context/bind", {
      ...input,
      fingerprint: before.fingerprint,
      revision: (await app.call("/workspace")).body.revision,
    });
    assert.equal(bound.status, 200);
    await rename(docs, join(app.root, "docs-before"));
    await mkdir(docs);
    await writeFile(join(docs, "CURRENT.md"), "# 同字节子目录来源\n");
    const after = (await app.call("/project-context/preview", input)).body;
    assert.notEqual(after.fingerprint, before.fingerprint);
    assert.notEqual(
      after.identity.directoryStamp,
      before.identity.directoryStamp,
    );
    assert.equal(
      (
        await app.call("/project-context/prepare", {
          projectId: input.projectId,
          fingerprint: after.fingerprint,
        })
      ).status,
      409,
    );
    assert.equal(
      (
        await app.call("/project-context/bind", {
          ...input,
          fingerprint: before.fingerprint,
          revision: bound.body.revision,
        })
      ).status,
      409,
    );
    const rebound = await app.call("/project-context/bind", {
      ...input,
      fingerprint: after.fingerprint,
      revision: bound.body.revision,
    });
    assert.equal(rebound.status, 200);
    assert.equal(
      (
        await app.call("/project-context/prepare", {
          projectId: input.projectId,
          fingerprint: after.fingerprint,
        })
      ).status,
      200,
    );
  } finally {
    await app.close();
  }
});

test("交接末端不能返回已被替换为符号链接的来源指针", async () => {
  const app = await contextFixture();
  try {
    const p = (await app.call("/project-context/preview", app.input)).body;
    await app.call("/project-context/bind", {
      ...app.input,
      revision: (await app.call("/workspace")).body.revision,
      fingerprint: p.fingerprint,
    });
    let reads = 0;
    const context = createProjectContext({
      async read() {
        const state = await app.repository.read();
        if (++reads === 2) {
          await rename(
            join(app.root, "CURRENT.md"),
            join(app.root, "original.md"),
          );
          await symlink("original.md", join(app.root, "CURRENT.md"));
        }
        return state;
      },
    });
    await assert.rejects(
      context.prepare({
        projectId: app.input.projectId,
        fingerprint: p.fingerprint,
      }),
      (e) => e.status === 400 || e.status === 409,
    );
  } finally {
    await app.close();
  }
});

test("旧连接兼容读取且保留来源草稿，缺目录指纹时必须重新保存才能交接", async () => {
  const app = await contextFixture();
  try {
    const legacy = {
      ...app.input,
      repoKey: "",
      boundAt: new Date().toISOString(),
    };
    await app.repository.updateConnections((c) => ({
      ...c,
      contextBindings: [legacy],
    }));
    const p = (await app.call("/project-context/preview", app.input)).body;
    assert.equal(p.identity.relationVersion, "");
    assert.equal(
      (
        await app.call("/project-context/prepare", {
          projectId: app.input.projectId,
          fingerprint: p.fingerprint,
        })
      ).status,
      409,
    );
    const old = (await app.call("/workspace")).body;
    assert.deepEqual(old.connections.contextBindings, [legacy]);
    const saved = await app.call("/project-context/bind", {
      ...app.input,
      revision: old.revision,
      fingerprint: p.fingerprint,
    });
    assert.equal(saved.status, 200);
    assert.equal(
      saved.body.connections.contextBindings[0].currentPath,
      legacy.currentPath,
    );
    assert.equal(
      saved.body.connections.contextBindings[0].rulesPath,
      legacy.rulesPath,
    );
    assert.equal(
      (
        await app.call("/project-context/prepare", {
          projectId: app.input.projectId,
          fingerprint: p.fingerprint,
        })
      ).status,
      200,
    );
  } finally {
    await app.close();
  }
});

test("交接末端再次核验目录链，不接受读取后发生的同字节目录替换", async () => {
  const app = await contextFixture();
  try {
    const p = (await app.call("/project-context/preview", app.input)).body;
    await app.call("/project-context/bind", {
      ...app.input,
      revision: (await app.call("/workspace")).body.revision,
      fingerprint: p.fingerprint,
    });
    let reads = 0;
    const context = createProjectContext({
      async read() {
        const state = await app.repository.read();
        if (++reads === 2) {
          await rename(app.root, app.root + "-original");
          await mkdir(app.root);
          for (const name of ["CURRENT.md", "AGENTS.md"])
            await writeFile(
              join(app.root, name),
              await readFile(join(app.root + "-original", name)),
            );
        }
        return state;
      },
    });
    await assert.rejects(
      context.prepare({
        projectId: app.input.projectId,
        fingerprint: p.fingerprint,
      }),
      (e) => e.status === 409,
    );
  } finally {
    await app.close();
  }
});

test("已知目录更换不能通过预览或后续未知扫描绕过确认，普通未知观测可以主动读取核实", async () => {
  const app = await contextFixture();
  try {
    for (const location of [
      { path: app.root, status: "changed" },
      {
        path: app.root,
        status: "unknown",
        identity: "a".repeat(64),
        observedIdentity: "b".repeat(64),
      },
    ]) {
      await app.repository.updateConnections((c) => ({
        ...c,
        projects: c.projects.map((p) => ({ ...p, locations: [location] })),
      }));
      const blocked = await app.call("/project-context/preview", app.input);
      assert.equal(blocked.status, 409);
      assert.match(blocked.body.error, /重新确认目录/);
      assert.equal(blocked.body.documents, undefined);
    }
    for (const status of [
      "missing",
      "unknown",
      "out_of_scope",
      "unrecognized",
    ]) {
      await app.repository.updateConnections((c) => ({
        ...c,
        projects: c.projects.map((p) => ({
          ...p,
          locations: [{ path: app.root, status }],
        })),
      }));
      assert.equal(
        (await app.call("/project-context/preview", app.input)).status,
        200,
      );
    }
    await rename(app.root, app.root + "-missing");
    assert.equal(
      (await app.call("/project-context/preview", app.input)).status,
      404,
    );
  } finally {
    await app.close();
  }
});

test("显式重关联轮换代次后保留旧指针，但旧预览和旧连接不能继续交接", async () => {
  const app = await contextFixture();
  try {
    const first = (await app.call("/project-context/preview", app.input)).body;
    const initial = (await app.call("/workspace")).body;
    assert.equal(
      (
        await app.call("/project-context/bind", {
          ...app.input,
          fingerprint: first.fingerprint,
          revision: initial.revision,
        })
      ).status,
      200,
    );
    const before = (await app.call("/workspace")).body.connections
      .contextBindings[0];
    await app.repository.updateConnections((c) => ({
      ...c,
      projects: c.projects.map((p) => ({
        ...p,
        relationVersion: "relation-next",
      })),
    }));
    const fresh = (await app.call("/project-context/preview", app.input)).body;
    assert.notEqual(fresh.fingerprint, first.fingerprint);
    assert.equal(fresh.identity.relationVersion, "relation-next");
    for (const fingerprint of [first.fingerprint, fresh.fingerprint])
      assert.equal(
        (
          await app.call("/project-context/prepare", {
            projectId: app.input.projectId,
            fingerprint,
          })
        ).status,
        409,
      );
    const state = (await app.call("/workspace")).body;
    assert.deepEqual(state.connections.contextBindings[0], before);
    assert.equal(
      (
        await app.call("/project-context/bind", {
          ...app.input,
          fingerprint: first.fingerprint,
          revision: state.revision,
        })
      ).status,
      409,
    );
    assert.equal(
      (
        await app.call("/project-context/bind", {
          ...app.input,
          fingerprint: fresh.fingerprint,
          revision: state.revision,
        })
      ).status,
      200,
    );
    assert.equal(
      (
        await app.call("/project-context/prepare", {
          projectId: app.input.projectId,
          fingerprint: fresh.fingerprint,
        })
      ).status,
      200,
    );
  } finally {
    await app.close();
  }
});

test("同路径目录被替换，即使来源字节相同也必须重新预览保存后才能交接", async () => {
  const app = await contextFixture();
  try {
    const first = (await app.call("/project-context/preview", app.input)).body;
    const initial = (await app.call("/workspace")).body;
    assert.equal(
      (
        await app.call("/project-context/bind", {
          ...app.input,
          fingerprint: first.fingerprint,
          revision: initial.revision,
        })
      ).status,
      200,
    );
    const oldRoot = app.root + "-original";
    await rename(app.root, oldRoot);
    await mkdir(app.root);
    for (const name of ["CURRENT.md", "AGENTS.md"])
      await writeFile(
        join(app.root, name),
        await readFile(join(oldRoot, name)),
      );
    const fresh = (await app.call("/project-context/preview", app.input)).body;
    assert.notEqual(fresh.fingerprint, first.fingerprint);
    assert.match(fresh.identity.directoryStamp, /^[a-f0-9]{64}$/);
    for (const fingerprint of [first.fingerprint, fresh.fingerprint])
      assert.equal(
        (
          await app.call("/project-context/prepare", {
            projectId: app.input.projectId,
            fingerprint,
          })
        ).status,
        409,
      );
    const state = (await app.call("/workspace")).body;
    assert.equal(
      (
        await app.call("/project-context/bind", {
          ...app.input,
          fingerprint: first.fingerprint,
          revision: state.revision,
        })
      ).status,
      409,
    );
    assert.equal(
      (
        await app.call("/project-context/bind", {
          ...app.input,
          fingerprint: fresh.fingerprint,
          revision: state.revision,
        })
      ).status,
      200,
    );
    assert.equal(
      (
        await app.call("/project-context/prepare", {
          projectId: app.input.projectId,
          fingerprint: fresh.fingerprint,
        })
      ).status,
      200,
    );
  } finally {
    await app.close();
  }
});

test("扫描后的祖先目录替换不能经符号链接进入隐藏来源", async () => {
  const app = await contextFixture();
  try {
    const base = join(app.dir, "projects");
    await mkdir(join(base, "group"));
    const nested = join(base, "group", "example");
    await rename(app.root, nested);
    await app.repository.updateConnections((c) => ({
      ...c,
      projects: c.projects.map((p) => ({
        ...p,
        localPaths: [nested],
        locations: [],
      })),
    }));
    const input = { ...app.input, root: nested };
    assert.equal(
      (await app.call("/project-context/preview", input)).status,
      200,
    );
    await rename(join(base, "group"), join(base, ".private"));
    await symlink(".private", join(base, "group"));
    const result = await app.call("/project-context/preview", input);
    assert.equal(result.status, 400);
    assert.match(result.body.error, /符号链接|隐藏/);
    assert.equal(result.body.documents, undefined);
  } finally {
    await app.close();
  }
});

test("指定项目来源可预览；原文保真、只读、不自动形成新状态正本", async () => {
  const app = await contextFixture();
  try {
    const before = (await app.call("/workspace")).body;
    const r = await app.call("/project-context/preview", app.input);
    assert.equal(r.status, 200);
    assert.equal(r.body.documents.length, 2);
    assert.equal(
      r.body.documents[0].content,
      "# 当前状态\n目标：上线作品集\n下一步：检查移动端\n",
    );
    assert.equal(r.body.documents[1].role, "rules");
    assert.match(r.body.fingerprint, /^[a-f0-9]{64}$/);
    assert.equal((await app.call("/workspace")).body.revision, before.revision);
    assert.equal(
      await readFile(join(app.root, "AGENTS.md"), "utf8"),
      "仅修改当前项目；发布需人工确认。\n",
    );
  } finally {
    await app.close();
  }
});

test("连接只保存指针；同版生成本机交接包，更新/并发冲突阻断旧预览，解绑保留原文件", async () => {
  const app = await contextFixture();
  try {
    const preview = (await app.call("/project-context/preview", app.input))
      .body;
    const before = (await app.call("/workspace")).body;
    const bound = await app.call("/project-context/bind", {
      ...app.input,
      fingerprint: preview.fingerprint,
      revision: before.revision,
    });
    assert.equal(bound.status, 200);
    const pointer = bound.body.connections.contextBindings[0];
    assert.equal(pointer.currentPath, "CURRENT.md");
    assert.equal(JSON.stringify(pointer).includes("上线作品集"), false);
    const again = await app.call("/project-context/bind", {
      ...app.input,
      fingerprint: preview.fingerprint,
      revision: before.revision,
    });
    assert.equal(again.status, 409);
    const pack = await app.call("/project-context/prepare", {
      projectId: app.input.projectId,
      fingerprint: preview.fingerprint,
    });
    assert.equal(pack.status, 200);
    assert.ok(pack.body.text.includes(preview.documents[0].sha256));
    assert.match(pack.body.text, /未发送|不代表已接收/);
    assert.match(pack.body.text, /仅限本机/);
    assert.equal(pack.body.text.includes("上线作品集"), false);
    await writeFile(
      join(app.root, "CURRENT.md"),
      "# 当前状态\n最新纠正：只做本机版本\n",
    );
    assert.equal(
      (
        await app.call("/project-context/prepare", {
          projectId: app.input.projectId,
          fingerprint: preview.fingerprint,
        })
      ).status,
      409,
    );
    const refreshed = (await app.call("/project-context/preview", app.input))
      .body;
    assert.notEqual(refreshed.fingerprint, preview.fingerprint);
    assert.equal(
      (
        await app.call("/project-context/prepare", {
          projectId: app.input.projectId,
          fingerprint: refreshed.fingerprint,
        })
      ).status,
      200,
    );
    const unbound = await app.call("/project-context/unbind", {
      projectId: app.input.projectId,
      revision: bound.body.revision,
    });
    assert.equal(unbound.status, 200);
    assert.equal(unbound.body.connections.contextBindings.length, 0);
    assert.equal(
      (
        await app.call("/project-context/prepare", {
          projectId: app.input.projectId,
          fingerprint: refreshed.fingerprint,
        })
      ).status,
      409,
    );
    assert.match(
      await readFile(join(app.root, "CURRENT.md"), "utf8"),
      /最新纠正/,
    );
  } finally {
    await app.close();
  }
});

test("来源边界拒绝越界、隐藏路径、符号与硬链接、超限、非 UTF-8；未授权和缺失不伪报成功", async () => {
  const app = await contextFixture();
  try {
    for (const path of [
      "../CURRENT.md",
      "/CURRENT.md",
      ".private/state.md",
      "docs/../CURRENT.md",
      "CURRENT.txt",
      "docs\\CURRENT.md",
    ])
      assert.equal(
        (
          await app.call("/project-context/preview", {
            ...app.input,
            currentPath: path,
          })
        ).status,
        400,
        path,
      );
    await symlink(join(app.root, "CURRENT.md"), join(app.root, "alias.md"));
    await link(join(app.root, "CURRENT.md"), join(app.root, "hard.md"));
    assert.equal(
      (
        await app.call("/project-context/preview", {
          ...app.input,
          currentPath: "alias.md",
        })
      ).status,
      400,
    );
    assert.equal(
      (
        await app.call("/project-context/preview", {
          ...app.input,
          currentPath: "hard.md",
        })
      ).status,
      400,
    );
    await rm(join(app.root, "hard.md"));
    await writeFile(join(app.root, "large.md"), "x".repeat(65537));
    assert.equal(
      (
        await app.call("/project-context/preview", {
          ...app.input,
          currentPath: "large.md",
        })
      ).status,
      413,
    );
    await writeFile(join(app.root, "bad.md"), Buffer.from([0xff, 0xfe]));
    assert.equal(
      (
        await app.call("/project-context/preview", {
          ...app.input,
          currentPath: "bad.md",
        })
      ).status,
      400,
    );
    assert.equal(
      (
        await app.call("/project-context/preview", {
          ...app.input,
          rulesPath: "missing.md",
        })
      ).status,
      404,
    );
    assert.equal(
      (
        await app.call("/project-context/preview", {
          ...app.input,
          root: app.dir,
        })
      ).status,
      404,
    );
    assert.equal(
      (
        await fetch(app.url + "/api/project-context/preview", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(app.input),
        })
      ).status,
      403,
    );
    assert.equal(
      (
        await app.call("/project-context/preview", {
          ...app.input,
          rulesPath: "",
        })
      ).body.documents.length,
      1,
    );
  } finally {
    await app.close();
  }
});

test("重启保留连接，备份不含来源正文；范围收缩与身份变化不能继续交接", async () => {
  const app = await contextFixture();
  let reopened;
  try {
    const p = (await app.call("/project-context/preview", app.input)).body;
    const rev = (await app.call("/workspace")).body.revision;
    await app.call("/project-context/bind", {
      ...app.input,
      fingerprint: p.fingerprint,
      revision: rev,
    });
    const backup = (await app.call("/backup")).body;
    assert.equal(backup.state.connections.contextBindings.length, 1);
    assert.equal(JSON.stringify(backup).includes("上线作品集"), false);
    await app.repository.updateConnections((c) => ({
      ...c,
      projects: c.projects.map((x) => ({ ...x, repoKey: "new/repo" })),
    }));
    assert.equal(
      (
        await app.call("/project-context/prepare", {
          projectId: app.input.projectId,
          fingerprint: p.fingerprint,
        })
      ).status,
      409,
    );
    await app.repository.updateConnections((c) => ({ ...c, roots: [] }));
    assert.equal(
      (await app.call("/project-context/preview", app.input)).status,
      409,
    );
    await app.stop();
    // Restart persistence is verified through a second read-only repository owner after the writer closes.
    const { openRepository } = await import("../server/repository.mjs");
    reopened = await openRepository(join(app.dir, "data"));
    assert.equal(
      (await reopened.read()).connections.contextBindings[0].currentPath,
      "CURRENT.md",
    );
  } finally {
    await reopened?.close();
    await app.close();
  }
});
