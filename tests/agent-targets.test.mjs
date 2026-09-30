import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { openRepository } from "../server/repository.mjs";
import { seed } from "../src/store.js";
import { createAgentTargets } from "../server/agent-targets.mjs";

async function setup() {
  const directory = await mkdtemp(join(tmpdir(), "guiji-targets-"));
  const repository = await openRepository(directory);
  await repository.write(seed(), { initialize: true });
  await repository.updateConnections(() => ({
    roots: [],
    projects: [],
    agents: [],
    github: { status: "not_connected", login: "", message: "", at: "" },
    projectScannedAt: "",
    agentScannedAt: "",
    errors: [],
    truncated: false,
  }));
  const programs = [
    {
      id: "program-codex",
      path: "/fixture/bin/codex",
      kind: "CLI",
      status: "present",
      version: {
        status: "known",
        value: "0.154.0",
        source: "安装包",
        evidencePath: "/fixture/codex-package.json",
        message: "",
      },
    },
  ];
  const inventory = {
    agentId: "codex",
    homes: [
      {
        id: "home-default",
        path: "/fixture/.codex",
        label: "默认 Home",
        source: "默认目录",
        status: "present",
        skills: [],
        errors: [],
      },
    ],
    errors: [],
    truncated: false,
  };
  const agent = {
    id: "codex",
    status: "detected",
    programs: programs.map(({ path, kind }) => ({ path, kind })),
    errors: [],
  };
  let now = Date.parse("2026-09-26T00:00:00Z");
  const adapters = {
    detectAgents: async () => ({ items: [agent] }),
    inspectAgentInventory: async () => structuredClone(inventory),
    inspectAgentPrograms: async () => structuredClone(programs),
  };
  const manager = createAgentTargets(repository, adapters, () => now);
  return {
    repository,
    manager,
    inventory,
    programs,
    agent,
    adapters,
    advance: (n) => {
      now += n;
    },
    close: async () => {
      await repository.close();
      await rm(directory, { recursive: true, force: true });
    },
  };
}

test("明确选择程序和 Home 后保存管理目标；重开、编辑保持身份且不生成运行状态", async () => {
  const f = await setup();
  try {
    const before = await f.repository.read();
    const options = await f.manager.options({ agentId: "codex" });
    assert.deepEqual(await f.repository.read(), before);
    const input = {
      token: options.token,
      label: "个人 Codex",
      programId: "program-codex",
      homeId: "home-default",
      revision: before.revision,
    };
    const saved = await f.manager.save(input);
    const target = saved.connections.agentTargets[0];
    assert.equal(target.label, "个人 Codex");
    assert.equal(target.program.path, "/fixture/bin/codex");
    assert.equal(target.home.path, "/fixture/.codex");
    assert.equal(target.running, undefined);
    assert.match(
      target.bindingId,
      /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/,
    );
    assert.deepEqual((await f.repository.read()).connections.agentTargets, [
      target,
    ]);
    const fresh = await f.manager.options({ agentId: "codex" });
    assert.equal(fresh.targets[0].status, "available");
    const renamed = await f.manager.save({
      ...input,
      token: fresh.token,
      id: target.id,
      label: "工作 Codex",
      revision: saved.revision,
    });
    assert.equal(renamed.connections.agentTargets[0].id, target.id);
    assert.equal(renamed.connections.agentTargets[0].label, "工作 Codex");
    assert.equal(
      renamed.connections.agentTargets[0].bindingId,
      target.bindingId,
    );
    assert.deepEqual(renamed.assets, before.assets);
  } finally {
    await f.close();
  }
});

test("改绑程序或 Home 会轮换 bindingId，A→B→A 不恢复旧绑定代次", async () => {
  const f = await setup();
  try {
    const save = async (id) => {
      const options = await f.manager.options({ agentId: "codex" });
      return f.manager.save({
        token: options.token,
        label: "Codex",
        programId: f.programs[0].id,
        homeId: f.inventory.homes[0].id,
        revision: options.revision,
        ...(id ? { id } : {}),
      });
    };
    const initial = (await save()).connections.agentTargets[0];
    const seen = new Set([initial.bindingId]);
    for (const change of [
      () => {
        f.programs[0].path = "/fixture/other/codex";
      },
      () => {
        f.programs[0].kind = "App";
      },
      () => {
        f.inventory.homes[0].id = "home-new-identity";
      },
      () => {
        f.inventory.homes[0].path = "/fixture/new-home";
      },
      () => {
        f.programs[0].path = initial.program.path;
        f.programs[0].kind = initial.program.kind;
        f.inventory.homes[0].id = initial.home.id;
        f.inventory.homes[0].path = initial.home.path;
      },
    ]) {
      change();
      f.agent.programs = f.programs.map(({ path, kind }) => ({ path, kind }));
      const target = (await save(initial.id)).connections.agentTargets[0];
      assert.equal(target.id, initial.id);
      assert.equal(target.createdAt, initial.createdAt);
      assert.equal(seen.has(target.bindingId), false);
      seen.add(target.bindingId);
      const unchanged = (await save(initial.id)).connections.agentTargets[0];
      assert.equal(unchanged.bindingId, target.bindingId);
    }
    assert.equal(seen.size, 6);
    const returned = (await f.repository.read()).connections.agentTargets[0];
    assert.deepEqual(returned.program, initial.program);
    assert.deepEqual(returned.home, initial.home);
    assert.notEqual(returned.bindingId, initial.bindingId);
  } finally {
    await f.close();
  }
});

test("legacy 目标同绑定编辑不补写 bindingId，首次真正改绑才生成", async () => {
  const f = await setup();
  try {
    const legacy = {
      schema: 1,
      id: "legacy-target",
      agentId: "codex",
      label: "旧目标",
      program: { path: "/fixture/bin/codex", kind: "CLI" },
      home: { id: "home-default", path: "/fixture/.codex", label: "默认 Home" },
      createdAt: "2026-09-01T00:00:00.000Z",
      updatedAt: "2026-09-01T00:00:00.000Z",
    };
    await f.repository.updateConnections((c) => ({
      ...c,
      agentTargets: [legacy],
    }));
    const save = async (label) => {
      const options = await f.manager.options({ agentId: "codex" });
      return f.manager.save({
        token: options.token,
        id: legacy.id,
        label,
        programId: "program-codex",
        homeId: f.inventory.homes[0].id,
        revision: options.revision,
      });
    };
    const renamed = (await save("只改名称")).connections.agentTargets[0];
    assert.equal(Object.hasOwn(renamed, "bindingId"), false);
    const sameBinding = (await save("只改名称")).connections.agentTargets[0];
    assert.equal(Object.hasOwn(sameBinding, "bindingId"), false);
    assert.equal(sameBinding.id, legacy.id);
    f.inventory.homes[0].path = "/fixture/another-home";
    const rebound = (await save("已改绑")).connections.agentTargets[0];
    assert.match(
      rebound.bindingId,
      /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/,
    );
    assert.equal(rebound.id, legacy.id);
    const stable = (await save("再次改名称")).connections.agentTargets[0];
    assert.equal(stable.bindingId, rebound.bindingId);
  } finally {
    await f.close();
  }
});

test("复查或主库排队期间过期、被容量淘汰的选项不能提交", async () => {
  for (const phase of ["inspect", "queued", "evicted"]) {
    const f = await setup();
    try {
      const before = await f.repository.read();
      const o = await f.manager.options({ agentId: "codex" });
      if (phase === "queued") {
        const update = f.repository.updateConnections;
        f.repository.updateConnections = (transform, options) =>
          update((connections) => {
            f.advance(300001);
            return transform(connections);
          }, options);
      } else {
        const inspect = f.adapters.inspectAgentPrograms;
        f.adapters.inspectAgentPrograms = async (...args) => {
          f.adapters.inspectAgentPrograms = inspect;
          if (phase === "inspect") f.advance(300001);
          else
            for (let i = 0; i < 20; i++)
              await f.manager.options({ agentId: "codex" });
          return inspect(...args);
        };
      }
      await assert.rejects(
        f.manager.save({
          token: o.token,
          label: "过期目标",
          programId: "program-codex",
          homeId: "home-default",
          revision: before.revision,
        }),
        { status: 409 },
        phase,
      );
      assert.deepEqual(await f.repository.read(), before, phase);
    } finally {
      await f.close();
    }
  }
});

test("候选和保存接口拒绝任意路径、无版本写入、非法名称与额外字段", async () => {
  const f = await setup();
  try {
    await assert.rejects(f.manager.options({ agentId: "codex", home: "/" }), {
      status: 400,
    });
    const options = await f.manager.options({ agentId: "codex" });
    const input = {
      token: options.token,
      programId: "program-codex",
      homeId: "home-default",
      label: "目标",
      revision: (await f.repository.read()).revision,
    };
    for (const bad of [
      null,
      [],
      { ...input, revision: undefined },
      { ...input, label: " " },
      { ...input, label: "a\nb" },
      { ...input, label: 7 },
      { ...input, path: "/etc/passwd" },
      { ...input, bindingId: "forged-binding" },
      { ...input, id: null },
    ])
      await assert.rejects(f.manager.save(bad), { status: 400 });
    assert.equal(
      (await f.repository.read()).connections.agentTargets,
      undefined,
    );
  } finally {
    await f.close();
  }
});

test("重复关联不增目标、并发更新被保护；解除只删除工作台关系", async () => {
  const f = await setup();
  try {
    const o = await f.manager.options({ agentId: "codex" });
    const input = {
      token: o.token,
      label: "Codex",
      programId: "program-codex",
      homeId: "home-default",
      revision: o.revision,
    };
    const first = await f.manager.save(input);
    await assert.rejects(f.manager.save({ ...input, label: "旧页面" }), {
      status: 409,
    });
    const again = await f.manager.save({ ...input, revision: first.revision });
    assert.equal(again.connections.agentTargets.length, 1);
    assert.equal(
      again.connections.agentTargets[0].id,
      first.connections.agentTargets[0].id,
    );
    assert.equal(
      again.connections.agentTargets[0].bindingId,
      first.connections.agentTargets[0].bindingId,
    );
    await assert.rejects(
      f.manager.save({
        ...input,
        label: "重复另一名",
        revision: again.revision,
      }),
      { status: 409 },
    );
    const removed = await f.manager.remove({
      id: first.connections.agentTargets[0].id,
      revision: again.revision,
    });
    assert.deepEqual(removed.connections.agentTargets, []);
    assert.deepEqual(removed.assets, first.assets);
    assert.equal(
      (await f.manager.options({ agentId: "codex" })).homes[0].status,
      "present",
    );
  } finally {
    await f.close();
  }
});

test("过期、部分枚举、程序消失和目录变化都不能沿用旧选择写入；目标不会自动丢失", async () => {
  const f = await setup();
  try {
    const o = await f.manager.options({ agentId: "codex" });
    const input = {
      token: o.token,
      label: "Codex",
      programId: "program-codex",
      homeId: "home-default",
      revision: o.revision,
    };
    const saved = await f.manager.save(input);
    const edited = {
      ...input,
      id: saved.connections.agentTargets[0].id,
      label: "修改",
      revision: saved.revision,
    };
    f.inventory.truncated = true;
    assert.equal(
      (await f.manager.options({ agentId: "codex" })).targets[0].status,
      "unknown",
    );
    await assert.rejects(f.manager.save(edited), { status: 409 });
    f.inventory.truncated = false;
    f.programs[0].status = "missing";
    assert.equal(
      (await f.manager.options({ agentId: "codex" })).targets[0].status,
      "program_missing",
    );
    await assert.rejects(f.manager.save(edited), { status: 409 });
    f.programs[0].status = "present";
    f.inventory.homes[0].status = "blocked";
    assert.equal(
      (await f.manager.options({ agentId: "codex" })).targets[0].status,
      "blocked",
    );
    await assert.rejects(f.manager.save(edited), { status: 409 });
    f.inventory.homes[0].status = "present";
    f.advance(300000);
    await assert.rejects(f.manager.save(edited), { status: 409 });
    assert.deepEqual(await f.repository.read(), saved);
  } finally {
    await f.close();
  }
});

test("共享资产不冒充 Home，通用保存和备份导入不能制造目标", async () => {
  const f = await setup();
  try {
    f.inventory.homes.push({
      ...f.inventory.homes[0],
      id: "shared",
      path: "/fixture/.agents",
      source: "用户共享",
    });
    const o = await f.manager.options({ agentId: "codex" });
    assert.equal(o.homes.length, 1);
    await assert.rejects(
      f.manager.save({
        token: o.token,
        label: "Codex",
        programId: "program-codex",
        homeId: "shared",
        revision: o.revision,
      }),
      { status: 409 },
    );
    const state = await f.manager.save({
      token: o.token,
      label: "Codex",
      programId: "program-codex",
      homeId: "home-default",
      revision: o.revision,
    });
    const tampered = structuredClone(state);
    tampered.connections.agentTargets[0].home.path = "/etc";
    await assert.rejects(f.repository.write(tampered), { status: 400 });
    const preview = await f.repository.previewImport(tampered);
    const restored = await f.repository.importBackup(tampered, preview.token);
    assert.deepEqual(
      restored.connections.agentTargets,
      state.connections.agentTargets,
    );
  } finally {
    await f.close();
  }
});

test("选择到保存间同路径的程序或目录被替换，旧选择必须失效", async () => {
  const f = await setup();
  try {
    f.programs[0].identity = "program-original";
    f.inventory.homes[0].identity = "home-original";
    const o = await f.manager.options({ agentId: "codex" });
    const input = {
      token: o.token,
      label: "Codex",
      programId: "program-codex",
      homeId: "home-default",
      revision: o.revision,
    };
    f.programs[0].identity = "program-replaced";
    await assert.rejects(f.manager.save(input), { status: 409 });
    f.programs[0].identity = "program-original";
    f.inventory.homes[0].identity = "home-replaced";
    await assert.rejects(f.manager.save(input), { status: 409 });
    assert.equal(
      (await f.repository.read()).connections.agentTargets,
      undefined,
    );
  } finally {
    await f.close();
  }
});
