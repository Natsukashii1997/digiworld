import test from "node:test";
import {authorizeCapability} from "./capability-fixture.mjs";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { join } from "node:path";
import { knowledgeFixture } from "./knowledge-fixture.mjs";
import { manifestHash } from "../server/knowledge-compilation-schema.mjs";

async function fixture(run, options = {}) {
  const f = await knowledgeFixture(options);
  try {
    const state = (
      await f.call("/knowledge/connect", {
        name: "维护合成库",
        kind: "obsidian",
        root: f.root,
        confirmed: true,
        expectedRevision: (await f.workspace()).revision,
      })
    ).body;
    const source = state.connections.knowledgeSources[0];
    const scan = (await f.call("/knowledge/scan", { sourceId: source.id }))
      .body;
    const selected = {
      sourceId: source.id,
      scanId: scan.scanId,
      path: "专题/判断原则.md",
    };
    const original = (await f.call("/knowledge/read", selected)).body;
    async function create(index) {
      const result = await f.call("/knowledge/tasks/create", {
        question: `维护问题 ${index}`,
        selections: [{ ...selected, expectedSha256: original.sha256 }],
        confirmed: true,
        requestId: `maintenance-${index}`,
        expectedRevision: (await f.workspace()).revision,
      });
      assert.equal(result.status, 200);
      const task = result.body.state.knowledgeTasks.find(
        (t) => t.id === result.body.taskId,
      );
      const received = await f.call("/knowledge/tasks/receive", {
        taskId: task.id,
        expectedRevision: result.body.state.revision,
        candidate: {
          schema: 1,
          taskId: task.id,
          manifestHash: task.manifestHash,
          title: `判断 ${index}`,
          summary: "保留判断边界",
          claims: [
            {
              id: "claim-1",
              text: "只代表这个案例",
              kind: "analysis",
              evidenceIds: [task.evidence[0].id],
            },
          ],
          conflicts: [],
          unknowns: ["其他场景未知"],
          relations: [],
        },
      });
      assert.equal(received.status, 200);
      return received.body.state.knowledgeTasks.find((t) => t.id === task.id);
    }
    await authorizeCapability(f,'vault',{sourceId:source.id,notesFolder:'随手记',profileFolders:[]});
    await run({ ...f, source, original, create });
  } finally {
    await f.close();
  }
}

test("一份资料变化定位多个任务的候选主张，不修改任务或原文", () =>
  fixture(async (f) => {
    const first = await f.create(1),
      second = await f.create(2);
    const before = await f.workspace();
    await f.changeFile();
    const response = await f.call("/knowledge/maintenance/impact", {
      offset: 0,
      expectedRevision: before.revision,
    });
    assert.equal(response.status, 200);
    assert.equal(response.body.total, 2);
    assert.equal(response.body.nextOffset, null);
    assert.deepEqual(
      response.body.items.map((t) => t.taskId),
      [first.id, second.id],
    );
    for (const item of response.body.items) {
      assert.equal(item.status, "changed");
      assert.deepEqual(
        item.candidates[0].claims.map((c) => c.id),
        ["claim-1"],
      );
      assert.equal(item.saved.status, "available");
      assert.deepEqual(item.saved.items, []);
    }
    assert.deepEqual(await f.workspace(), before);
    assert.equal(
      await fs.readFile(join(f.root, "专题/判断原则.md"), "utf8"),
      "# 更新后的合成原文\n",
    );
  }));

test("预览当前原文后确认创建关联新任务，旧候选保留且重复确认不重复创建", () =>
  fixture(async (f) => {
    const originalTask = await f.create(1);
    const before = await f.workspace();
    await f.changeFile();
    const preview = await f.call("/knowledge/maintenance/preview", {
      taskId: originalTask.id,
    });
    assert.equal(preview.status, 200);
    assert.equal(
      preview.body.documents[0].oldSha256,
      originalTask.evidence[0].sha256,
    );
    assert.notEqual(
      preview.body.documents[0].sha256,
      originalTask.evidence[0].sha256,
    );
    assert.equal(preview.body.documents[0].content, "# 更新后的合成原文\n");
    assert.deepEqual(await f.workspace(), before);
    assert.equal(
      (
        await f.call("/knowledge/maintenance/create", {
          previewId: preview.body.previewId,
          confirmed: false,
        })
      ).status,
      400,
    );
    const result = await f.call("/knowledge/maintenance/create", {
      previewId: preview.body.previewId,
      confirmed: true,
    });
    assert.equal(result.status, 200);
    const next = result.body.state.knowledgeTasks.find(
      (t) => t.id === result.body.taskId,
    );
    assert.deepEqual(next.basedOn, {
      taskId: originalTask.id,
      manifestHash: originalTask.manifestHash,
    });
    assert.equal(next.evidence[0].sha256, preview.body.documents[0].sha256);
    assert.deepEqual(next.candidates, []);
    assert.deepEqual(
      result.body.state.knowledgeTasks.find((t) => t.id === originalTask.id),
      originalTask,
    );
    assert.equal(
      JSON.stringify(result.body.state).includes("# 更新后的合成原文"),
      false,
    );
    const replay = await f.call("/knowledge/maintenance/create", {
      previewId: preview.body.previewId,
      confirmed: true,
    });
    assert.equal(replay.status, 200);
    assert.equal(replay.body.taskId, next.id);
    assert.equal(replay.body.state.revision, result.body.state.revision);
    await f.restart();
    assert.deepEqual(
      (await f.workspace()).knowledgeTasks.find((t) => t.id === next.id)
        .basedOn,
      next.basedOn,
    );
  }));

test("影响核查分批不自动读后续任务，状态变化拒绝续查，归档任务仍可追溯", () =>
  fixture(async (f) => {
    for (let index = 0; index < 6; index++) await f.create(index);
    const state = await f.workspace();
    let report = await f.call("/knowledge/maintenance/impact", {
      offset: 0,
      expectedRevision: state.revision,
    });
    assert.equal(report.body.items.length, 5);
    assert.equal(report.body.nextOffset, 5);
    assert.equal(report.body.total, 6);
    assert.ok(
      report.body.items.every(
        (item) => item.status === "unchanged" && item.candidates.length === 0,
      ),
    );
    report = await f.call("/knowledge/maintenance/impact", {
      offset: 5,
      expectedRevision: state.revision,
    });
    assert.equal(report.body.items.length, 1);
    assert.equal(report.body.nextOffset, null);
    const archived = await f.call("/knowledge/tasks/archive", {
      taskId: state.knowledgeTasks[0].id,
      expectedRevision: state.revision,
    });
    assert.equal(
      (
        await f.call("/knowledge/maintenance/impact", {
          offset: 5,
          expectedRevision: state.revision,
        })
      ).status,
      409,
    );
    report = await f.call("/knowledge/maintenance/impact", {
      offset: 0,
      expectedRevision: archived.body.state.revision,
    });
    assert.equal(report.body.items[0].archived, true);
  }));

test("已保存候选只报告历史位置，日志损坏明确不可用，不冒充没有保存记录", () =>
  fixture(async (f) => {
    const task = await f.create(1);
    await fs.mkdir(join(f.root, "00 待整理/工作/个人"), { recursive: true });
    const preview = (
      await f.call("/knowledge/writes/preview", {
        taskId: task.id,
        versionId: task.candidates[0].id,
        targetSourceId: f.source.id,
        domain: "工作/个人",
        filename: "已存候选.md",
      })
    ).body;
    const applied = await f.call("/knowledge/writes/apply", {
      previewId: preview.previewId,
      confirmed: true,
    });
    assert.equal(applied.status, 200);
    await f.changeFile();
    const input = {
      offset: 0,
      expectedRevision: (await f.workspace()).revision,
    };
    const result = (await f.call("/knowledge/maintenance/impact", input)).body
      .items[0];
    assert.equal(result.saved.items[0].receipt, "saved");
    assert.equal(result.saved.items[0].path, "00 待整理/工作/个人/已存候选.md");
    assert.equal(result.saved.items[0].versionId, task.candidates[0].id);
    await fs.writeFile(
      join(f.directory, "knowledge-writes", "broken.json"),
      "broken",
    );
    const broken = (await f.call("/knowledge/maintenance/impact", input)).body
      .items[0];
    assert.equal(broken.saved.status, "unavailable");
    assert.equal(broken.status, "changed");
  }));

for (const mode of ["expired", "changed", "disconnected", "revision"]) {
  test(`重新整理确认时${mode}不能创建新任务`, () =>
    fixture(async (f) => {
      const task = await f.create(1);
      const preview = (
        await f.call("/knowledge/maintenance/preview", { taskId: task.id })
      ).body;
      const initial = await f.workspace();
      if (mode === "expired") f.advance(300001);
      if (mode === "changed") await f.changeFile();
      if (mode === "disconnected")
        await f.call("/knowledge/remove", {
          sourceId: f.source.id,
          confirmed: true,
          expectedRevision: initial.revision,
        });
      if (mode === "revision")
        await f.call("/knowledge/tasks/archive", {
          taskId: task.id,
          expectedRevision: initial.revision,
        });
      const result = await f.call("/knowledge/maintenance/create", {
        previewId: preview.previewId,
        confirmed: true,
      });
      assert.equal(result.status, 409);
      assert.equal((await f.workspace()).knowledgeTasks.length, 1);
    }));
}

test("断开来源只报告撤权且不预览当前文件，丢失文件不能报告一致", () =>
  fixture(async (f) => {
    const task = await f.create(1);
    await fs.rename(
      join(f.root, "专题/判断原则.md"),
      join(f.root, "保留原文.md"),
    );
    const missing = (
      await f.call("/knowledge/maintenance/impact", {
        offset: 0,
        expectedRevision: (await f.workspace()).revision,
      })
    ).body;
    assert.equal(missing.items[0].status, "unavailable");
    assert.equal(
      (await f.call("/knowledge/maintenance/preview", { taskId: task.id }))
        .status,
      404,
    );
    await f.call("/knowledge/remove", {
      sourceId: f.source.id,
      confirmed: true,
      expectedRevision: (await f.workspace()).revision,
    });
    const revoked = (
      await f.call("/knowledge/maintenance/impact", {
        offset: 0,
        expectedRevision: (await f.workspace()).revision,
      })
    ).body;
    assert.equal(revoked.items[0].status, "revoked");
    assert.equal(
      (await f.call("/knowledge/maintenance/preview", { taskId: task.id }))
        .status,
      409,
    );
  }));

test("关联任务备份恢复保留原历史但不恢复读取权限，非法父关系全部拒绝", () =>
  fixture(async (f) => {
    const originalTask = await f.create(1);
    const plan = (
      await f.call("/knowledge/maintenance/preview", {
        taskId: originalTask.id,
      })
    ).body;
    await f.call("/knowledge/maintenance/create", {
      previewId: plan.previewId,
      confirmed: true,
    });
    const backup = (await f.call("/backup")).body;
    const target = await knowledgeFixture();
    try {
      const preview = await target.call("/import/preview", backup);
      assert.equal(preview.status, 200);
      const restored = await target.call("/import/confirm", {
        backup,
        token: preview.body.token,
      });
      assert.equal(restored.status, 200);
      assert.deepEqual(
        restored.body.knowledgeTasks,
        backup.state.knowledgeTasks,
      );
      assert.equal(restored.body.connections?.knowledgeSources?.length || 0, 0);
      assert.equal(
        (
          await target.call("/knowledge/maintenance/preview", {
            taskId: plan.taskId,
          })
        ).status,
        409,
      );
      for (const alter of [
        (tasks) => {
          tasks[1].basedOn.taskId = "missing";
        },
        (tasks) => {
          tasks[1].basedOn.taskId = tasks[1].id;
        },
        (tasks) => {
          tasks[1].basedOn.manifestHash = "a".repeat(64);
        },
        (tasks) => {
          tasks[1].basedOn = null;
        },
        (tasks) => {
          tasks[0] = null;
        },
      ]) {
        const invalid = structuredClone(backup);
        alter(invalid.state.knowledgeTasks);
        assert.equal(
          (await target.call("/import/preview", invalid)).status,
          400,
        );
        assert.deepEqual(await target.workspace(), restored.body);
      }
      // A schema-valid rewrite of lineage still cannot rewrite existing history.
      const rewritten = structuredClone(backup);
      delete rewritten.state.knowledgeTasks[1].basedOn;
      rewritten.state.knowledgeTasks[1].manifestHash = manifestHash(
        rewritten.state.knowledgeTasks[1],
      );
      assert.equal(
        (await target.call("/import/preview", rewritten)).status,
        409,
      );
      const old = structuredClone(backup);
      old.state.knowledgeTasks.pop();
      const oldPlan = await target.call("/import/preview", old);
      const merged = await target.call("/import/confirm", {
        backup: old,
        token: oldPlan.body.token,
      });
      assert.equal(merged.body.knowledgeTasks.length, 2);
    } finally {
      await target.close();
    }
  }));

test("四个维护入口均要求本机会话凭证，未授权请求没有副作用", () =>
  fixture(async (f) => {
    await f.create(1);
    const before = await f.workspace();
    for (const action of ["impact", "preview", "create", "recover"]) {
      const response = await fetch(
        `${f.url}/api/knowledge/maintenance/${action}`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: "{}",
        },
      );
      assert.equal(response.status, 403);
    }
    assert.deepEqual(await f.workspace(), before);
  }));

test("来源替换、链接和超大文件不能通过当前版本预览", () =>
  fixture(async (f) => {
    const task = await f.create(1);
    const path = join(f.root, "专题/判断原则.md");
    const preserved = join(f.root, "专题/保留.md");
    await fs.rename(path, preserved);
    await fs.symlink(preserved, path);
    assert.equal(
      (await f.call("/knowledge/maintenance/preview", { taskId: task.id }))
        .status,
      403,
    );
    await fs.unlink(path);
    await fs.writeFile(path, "X".repeat(256 * 1024 + 1));
    assert.equal(
      (await f.call("/knowledge/maintenance/preview", { taskId: task.id }))
        .status,
      413,
    );
    await f.replaceRoot();
    assert.equal(
      (await f.call("/knowledge/maintenance/preview", { taskId: task.id }))
        .status,
      409,
    );
    assert.equal((await f.workspace()).knowledgeTasks.length, 1);
  }));

for (const action of ["impact", "preview", "create"]) {
  test(`${action}读取途中撤权拒绝整次结果，不阻塞撤权请求`, async () => {
    let beforeOpen = async () => {};
    await fixture(
      async (f) => {
        const task = await f.create(1);
        const plan =
          action === "create"
            ? (
                await f.call("/knowledge/maintenance/preview", {
                  taskId: task.id,
                })
              ).body
            : null;
        const before = await f.workspace();
        beforeOpen = async () => {
          beforeOpen = async () => {};
          const removed = await f.call("/knowledge/remove", {
            sourceId: f.source.id,
            confirmed: true,
            expectedRevision: before.revision,
          });
          assert.equal(removed.status, 200);
        };
        const data =
          action === "impact"
            ? { offset: 0, expectedRevision: before.revision }
            : action === "preview"
              ? { taskId: task.id }
              : { previewId: plan.previewId, confirmed: true };
        const result = await f.call(`/knowledge/maintenance/${action}`, data);
        assert.equal(result.status, 409);
        assert.equal(result.body.documents, undefined);
        assert.equal(result.body.items, undefined);
        assert.equal((await f.workspace()).knowledgeTasks.length, 1);
      },
      {
        filesystem: {
          ...fs,
          async open(...args) {
            await beforeOpen();
            return fs.open(...args);
          },
        },
      },
    );
  });
}

test("恢复查询不把仍执行的创建当作未创建，未开始的旧确认会被作废", async () => {
  let beforeOpen = async () => {},
    release,
    reached;
  const held = new Promise((resolve) => {
    release = resolve;
  });
  const ready = new Promise((resolve) => {
    reached = resolve;
  });
  let creating;
  await fixture(
    async (f) => {
      try {
        const task = await f.create(1);
        const plan = (
          await f.call("/knowledge/maintenance/preview", { taskId: task.id })
        ).body;
        beforeOpen = async () => {
          beforeOpen = async () => {};
          reached();
          await held;
        };
        creating = f.call("/knowledge/maintenance/create", {
          previewId: plan.previewId,
          confirmed: true,
        });
        await ready;
        const recovery = await f.call("/knowledge/maintenance/recover", {
          taskId: task.id,
        });
        assert.equal(recovery.status, 200);
        assert.equal(recovery.body.pending, true);
        assert.equal(recovery.body.state.knowledgeTasks.length, 1);
        assert.equal(
          (await f.call("/knowledge/maintenance/preview", { taskId: task.id }))
            .status,
          409,
        );
        release();
        assert.equal((await creating).status, 200);
        const finished = await f.call("/knowledge/maintenance/recover", {
          taskId: task.id,
        });
        assert.equal(finished.body.pending, false);
        assert.equal(finished.body.state.knowledgeTasks.length, 2);
        const neverStarted = (
          await f.call("/knowledge/maintenance/preview", { taskId: task.id })
        ).body;
        const cancelled = await f.call("/knowledge/maintenance/recover", {
          taskId: task.id,
        });
        assert.equal(cancelled.body.pending, false);
        assert.equal(
          (
            await f.call("/knowledge/maintenance/create", {
              previewId: neverStarted.previewId,
              confirmed: true,
            })
          ).status,
          409,
        );
        assert.equal((await f.workspace()).knowledgeTasks.length, 2);
      } finally {
        release();
        await creating?.catch(() => {});
      }
    },
    {
      filesystem: {
        ...fs,
        async open(...args) {
          await beforeOpen();
          return fs.open(...args);
        },
      },
    },
  );
});

test("确认读取途中到期不能写入；影响检查耗时达到预算后保留明确下一批", async () => {
  let beforeOpen = async () => {};
  await fixture(
    async (f) => {
      const task = await f.create(1);
      await f.create(2);
      const plan = (
        await f.call("/knowledge/maintenance/preview", { taskId: task.id })
      ).body;
      beforeOpen = async () => {
        beforeOpen = async () => {};
        f.advance(300001);
      };
      assert.equal(
        (
          await f.call("/knowledge/maintenance/create", {
            previewId: plan.previewId,
            confirmed: true,
          })
        ).status,
        409,
      );
      assert.equal((await f.workspace()).knowledgeTasks.length, 2);
      beforeOpen = async () => {
        f.advance(5001);
      };
      const report = await f.call("/knowledge/maintenance/impact", {
        offset: 0,
        expectedRevision: (await f.workspace()).revision,
      });
      assert.equal(report.status, 200);
      assert.equal(report.body.items.length, 1);
      assert.equal(report.body.nextOffset, 1);
      assert.equal(report.body.total, 2);
    },
    {
      filesystem: {
        ...fs,
        async open(...args) {
          await beforeOpen();
          return fs.open(...args);
        },
      },
    },
  );
});

for (const replacement of ["file", "directory"]) {
  test(`同字节${replacement}替换使旧预览失效，重新预览捕获新身份并保留历史`, () =>
    fixture(async (f) => {
      const task = await f.create(1);
      const before = await f.workspace();
      const plan = await f.call("/knowledge/maintenance/preview", {
        taskId: task.id,
      });
      assert.equal(plan.status, 200);
      const path = join(f.root, "专题/判断原则.md");
      const bytes = await fs.readFile(path);
      if (replacement === "file") {
        await fs.rename(path, path + ".previous");
      } else {
        await fs.rename(join(f.root, "专题"), join(f.root, "专题.previous"));
        await fs.mkdir(join(f.root, "专题"));
      }
      await fs.writeFile(path, bytes);
      const stale = await f.call("/knowledge/maintenance/create", {
        previewId: plan.body.previewId,
        confirmed: true,
      });
      assert.equal(stale.status, 409);
      assert.deepEqual(await f.workspace(), before);
      const fresh = await f.call("/knowledge/maintenance/preview", {
        taskId: task.id,
      });
      assert.equal(fresh.status, 200);
      assert.equal(fresh.body.documents[0].sha256, task.evidence[0].sha256);
      const renewed = await f.call("/knowledge/maintenance/create", {
        previewId: fresh.body.previewId,
        confirmed: true,
      });
      assert.equal(renewed.status, 200);
      const next = renewed.body.state.knowledgeTasks.find(
        (t) => t.id === renewed.body.taskId,
      );
      assert.notEqual(
        next.evidence[0].fingerprint,
        task.evidence[0].fingerprint,
      );
      assert.deepEqual(
        renewed.body.state.knowledgeTasks.find((t) => t.id === task.id),
        task,
      );
      assert.deepEqual(await fs.readFile(path), bytes);
    }));
}

test("维护预览最多30份，过期清理后可恢复且旧计划不能创建", () =>
  fixture(async (f) => {
    const task = await f.create(1),
      before = await f.workspace();
    let first;
    for (let i = 0; i < 30; i++) {
      const plan = await f.call("/knowledge/maintenance/preview", {
        taskId: task.id,
      });
      assert.equal(plan.status, 200);
      first ||= plan.body.previewId;
    }
    assert.equal(
      (await f.call("/knowledge/maintenance/preview", { taskId: task.id }))
        .status,
      429,
    );
    assert.deepEqual(await f.workspace(), before);
    f.advance(300001);
    assert.equal(
      (await f.call("/knowledge/maintenance/preview", { taskId: task.id }))
        .status,
      200,
    );
    assert.equal(
      (
        await f.call("/knowledge/maintenance/create", {
          previewId: first,
          confirmed: true,
        })
      ).status,
      409,
    );
    assert.deepEqual(await f.workspace(), before);
  }));

test("50任务容量拒绝重新整理且不改revision或旧历史", () =>
  fixture(async (f) => {
    for (let i = 0; i < 50; i++) await f.create(i);
    const before = await f.workspace();
    const plan = await f.call("/knowledge/maintenance/preview", {
      taskId: before.knowledgeTasks[0].id,
    });
    assert.equal(plan.status, 200);
    const rejected = await f.call("/knowledge/maintenance/create", {
      previewId: plan.body.previewId,
      confirmed: true,
    });
    assert.equal(rejected.status, 413);
    assert.deepEqual(await f.workspace(), before);
    const recovery = await f.call("/knowledge/maintenance/recover", {
      taskId: before.knowledgeTasks[0].id,
    });
    assert.equal(recovery.body.pending, false);
    assert.equal(recovery.body.latestTaskId, null);
  }));

test("恢复查询作废仍在读取的预览，迟到结果不泄出原文并允许重新预览", async () => {
  let beforeOpen = async () => {},
    release,
    reached,
    previewing;
  const held = new Promise((resolve) => {
    release = resolve;
  });
  const ready = new Promise((resolve) => {
    reached = resolve;
  });
  await fixture(
    async (f) => {
      try {
        const task = await f.create(1),
          before = await f.workspace();
        beforeOpen = async () => {
          beforeOpen = async () => {};
          reached();
          await held;
        };
        previewing = f.call("/knowledge/maintenance/preview", {
          taskId: task.id,
        });
        await ready;
        const lookup = await f.call("/knowledge/maintenance/recover", {
          taskId: task.id,
        });
        assert.equal(lookup.status, 200);
        assert.equal(lookup.body.pending, false);
        release();
        const retired = await previewing;
        assert.equal(retired.status, 409);
        assert.equal(retired.body.documents, undefined);
        assert.equal(retired.body.previewId, undefined);
        assert.deepEqual(await f.workspace(), before);
        assert.equal(
          (await f.call("/knowledge/maintenance/preview", { taskId: task.id }))
            .status,
          200,
        );
      } finally {
        release();
        await previewing?.catch(() => {});
      }
    },
    {
      filesystem: {
        ...fs,
        async open(...args) {
          await beforeOpen();
          return fs.open(...args);
        },
      },
    },
  );
});

test("部分依据变化只列相关主张冲突关系，多版本保存/撤回/未知记录不冒充文件现状", () =>
  fixture(async (f) => {
    const paths = ["专题/判断原则.md", "第二依据.md", "第三依据.md"];
    for (const path of paths.slice(1))
      await fs.writeFile(join(f.root, path), `# 合成 ${path}\n`);
    const scan = (await f.call("/knowledge/scan", { sourceId: f.source.id }))
      .body;
    const selections = [];
    for (const path of paths) {
      const selected = { sourceId: f.source.id, scanId: scan.scanId, path };
      const doc = await f.call("/knowledge/read", selected);
      assert.equal(doc.status, 200);
      selections.push({ ...selected, expectedSha256: doc.body.sha256 });
    }
    const created = await f.call("/knowledge/tasks/create", {
      question: "三份依据只有一份变化",
      selections,
      confirmed: true,
      requestId: "partial-evidence",
      expectedRevision: (await f.workspace()).revision,
    });
    assert.equal(created.status, 200);
    const task = created.body.state.knowledgeTasks.find(
      (t) => t.id === created.body.taskId,
    );
    const ids = paths.map(
      (path) => task.evidence.find((e) => e.path === path).id,
    );
    const versions = [];
    for (let i = 0; i < 2; i++) {
      const received = await f.call("/knowledge/tasks/receive", {
        taskId: task.id,
        expectedRevision: (await f.workspace()).revision,
        candidate: {
          schema: 1,
          taskId: task.id,
          manifestHash: task.manifestHash,
          title: `判断版本${i + 1}`,
          summary: "分清变化与稳定依据",
          claims: ids.map((id, index) => ({
            id: `c${index + 1}`,
            text: `主张${index + 1}`,
            kind: "analysis",
            evidenceIds: [id],
          })),
          conflicts: [
            { text: "受影响冲突", evidenceIds: [ids[0], ids[1]] },
            { text: "稳定冲突", evidenceIds: [ids[1], ids[2]] },
          ],
          relations: [
            { text: "受影响关系", evidenceIds: [ids[0]] },
            { text: "稳定关系", evidenceIds: [ids[2]] },
          ],
          unknowns: [],
        },
      });
      assert.equal(received.status, 200);
      versions.push(
        received.body.state.knowledgeTasks
          .find((t) => t.id === task.id)
          .candidates.at(-1),
      );
    }
    await fs.mkdir(join(f.root, "00 待整理/工作/个人"), { recursive: true });
    const saved = [];
    for (const [index, version] of [
      versions[0],
      versions[1],
      versions[1],
    ].entries()) {
      const plan = await f.call("/knowledge/writes/preview", {
        taskId: task.id,
        versionId: version.id,
        targetSourceId: f.source.id,
        domain: "工作/个人",
        filename: `合成保存${index}.md`,
      });
      assert.equal(plan.status, 200);
      const applied = await f.call("/knowledge/writes/apply", {
        previewId: plan.body.previewId,
        confirmed: true,
      });
      assert.equal(applied.status, 200);
      saved.push({
        id: applied.body.id,
        path: plan.body.path,
        versionId: version.id,
      });
    }
    const rollback = await f.call("/knowledge/writes/rollback-preview", {
      operationId: saved[1].id,
    });
    assert.equal(rollback.status, 200);
    assert.equal(
      (
        await f.call("/knowledge/writes/rollback", {
          previewId: rollback.body.previewId,
          confirmed: true,
        })
      ).status,
      200,
    );
    // Simulate a missing applied receipt after prepared was durable, only in this synthetic journal.
    await fs.unlink(
      join(f.directory, "knowledge-writes", `${saved[2].id}.applied.json`),
    );
    // A missing saved target must not erase its historical pointer or be read by impact.
    await fs.unlink(join(f.root, saved[0].path));
    const before = await f.workspace();
    await f.changeFile();
    const result = await f.call("/knowledge/maintenance/impact", {
      offset: 0,
      expectedRevision: before.revision,
    });
    assert.equal(result.status, 200);
    const row = result.body.items[0];
    assert.equal(row.status, "changed");
    assert.equal(
      row.items.filter((item) => item.status === "changed").length,
      1,
    );
    assert.equal(
      row.items.filter((item) => item.status === "unchanged").length,
      2,
    );
    assert.deepEqual(
      row.candidates.map((c) => c.id),
      versions.map((v) => v.id),
    );
    for (const candidate of row.candidates) {
      assert.deepEqual(candidate.claims, [{ id: "c1", text: "主张1" }]);
      assert.deepEqual(
        candidate.conflicts.map((c) => c.text),
        ["受影响冲突"],
      );
      assert.deepEqual(
        candidate.relations.map((c) => c.text),
        ["受影响关系"],
      );
    }
    assert.equal(row.saved.status, "available");
    assert.equal(row.saved.items.length, 3);
    for (const [i, item] of saved.entries()) {
      const record = row.saved.items.find((r) => r.operationId === item.id);
      assert.equal(record.versionId, item.versionId);
      assert.equal(record.path, item.path);
      assert.equal(record.receipt, ["saved", "withdrawn", "pending"][i]);
    }
    assert.deepEqual(await f.workspace(), before);
    assert.equal(
      await fs.readFile(join(f.root, paths[0]), "utf8"),
      "# 更新后的合成原文\n",
    );
  }));
