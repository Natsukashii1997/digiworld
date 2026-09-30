import test from "node:test";
import assert from "node:assert/strict";
import {
  mkdtemp,
  mkdir,
  writeFile,
  readFile,
  realpath,
  rm,
  rename,
  cp,
  symlink,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { openRepository } from "../server/repository.mjs";
import { createSkillCopies } from "../server/skill-copies.mjs";
import { inspectAgentInventory } from "../server/agent-inventory.mjs";
import { readLocalSkill } from "../server/skill-files.mjs";
import { seed, makeAsset, revise } from "../src/store.js";

async function fixture(t) {
  const base = await realpath(await mkdtemp(join(tmpdir(), "guiji-copies-")));
  const home = join(base, "user"),
    root = join(home, ".codex", "skills"),
    source = join(root, "example");
  await mkdir(join(source, "assets"), { recursive: true });
  await writeFile(
    join(source, "SKILL.md"),
    "---\nname: example\n---\n# 完整包\n",
  );
  await writeFile(
    join(source, "assets", "bytes.bin"),
    new Uint8Array([0, 128, 255]),
  );
  await writeFile(
    join(home, ".codex", "config.toml"),
    "PRIVATE CONFIG SENTINEL\n",
  );
  const original = await readLocalSkill([root], source);
  const asset = makeAsset({
    type: "Skill",
    title: "测试 Skill",
    files: original.files,
    content: original.content,
  });
  const repository = await openRepository(join(base, "db"));
  await repository.write({ ...seed(), assets: [asset] }, { initialize: true });
  const adapters = {
    inspectAgentInventory: (agentId) =>
      inspectAgentInventory(agentId, { home, environment: {} }),
  };
  const inventory = await adapters.inspectAgentInventory("codex");
  const h = inventory.homes.find((h) => h.path === join(home, ".codex"));
  const at = "2026-09-26T00:00:00Z";
  const target = {
    schema: 1,
    id: "target-one",
    agentId: "codex",
    label: "合成 Codex",
    program: { path: join(base, "codex"), kind: "CLI" },
    home: { id: h.id, path: h.path, label: h.label },
    createdAt: at,
    updatedAt: at,
  };
  await repository.updateConnections(() => ({
    roots: [],
    projects: [],
    agents: [],
    github: { status: "not_connected", login: "", message: "", at: "" },
    projectScannedAt: "",
    agentScannedAt: "",
    errors: [],
    truncated: false,
    agentTargets: [target],
  }));
  let now = Date.parse(at);
  const manager = createSkillCopies(repository, adapters, () => now);
  const input = {
    assetId: asset.id,
    versionId: asset.versions[0].id,
    targetId: target.id,
  };
  async function preview(selection = input) {
    const scan = await manager.discover(selection);
    return manager.preview({
      token: scan.token,
      candidateId: scan.items.find((c) => c.status === "candidate").id,
    });
  }
  t.after(async () => {
    await repository.close();
    await rm(base, { recursive: true, force: true });
  });
  return {
    base,
    home,
    root,
    source,
    original,
    asset,
    target,
    repository,
    manager,
    input,
    adapters,
    preview,
    advance: (ms) => (now += ms),
  };
}

test("明确发现、预览后关联固定版本；重开、核对、解除只改变关系", async (t) => {
  const f = await fixture(t),
    before = await f.repository.read();
  const p = await f.preview();
  assert.equal(p.comparison.status, "identical");
  assert.equal(p.location, f.source);
  assert.equal(p.content, undefined);
  assert.equal(p.files, undefined);
  assert.deepEqual(await f.repository.read(), before);
  const saved = await f.manager.bind({ token: p.token, revision: p.revision });
  const copy = saved.connections.skillCopies[0];
  assert.equal(copy.versionId, f.input.versionId);
  assert.equal(copy.location, f.source);
  assert.equal(copy.status, undefined);
  assert.deepEqual((await f.repository.read()).connections.skillCopies, [copy]);
  assert.equal((await f.manager.check({ id: copy.id })).status, "identical");
  assert.equal((await f.repository.read()).revision, saved.revision);
  const removed = await f.manager.remove({
    id: copy.id,
    revision: saved.revision,
  });
  assert.deepEqual(removed.connections.skillCopies, []);
  assert.deepEqual(await readLocalSkill([f.root], f.source), f.original);
  assert.equal(
    await readFile(join(f.home, ".codex", "config.toml"), "utf8"),
    "PRIVATE CONFIG SENTINEL\n",
  );
});

test("主库排队期间副本变化必须拒绝确认，不能保存旧预览", async (t) => {
  const f = await fixture(t),
    p = await f.preview(),
    before = await f.repository.read();
  const update = f.repository.updateConnections;
  f.repository.updateConnections = (transform, options) =>
    update(async (c) => {
      await writeFile(join(f.source, "SKILL.md"), "# changed in queue\n");
      return transform(c);
    }, options);
  await assert.rejects(
    f.manager.bind({ token: p.token, revision: p.revision }),
    { status: 409 },
  );
  assert.deepEqual(await f.repository.read(), before);
});

test("资产更新仍核对固定旧版；显式改版保持关联 ID，响应丢失重试不重复", async (t) => {
  const f = await fixture(t),
    p = await f.preview();
  const saved = await f.manager.bind({ token: p.token, revision: p.revision }),
    copy = saved.connections.skillCopies[0];
  const retried = await f.manager.bind({
    token: p.token,
    revision: p.revision,
  });
  assert.deepEqual(retried, saved);
  const newer = revise(f.asset, {
    title: "新版本",
    files: f.asset.versions[0].files.map((file) =>
      file.path === "SKILL.md"
        ? { ...file, text: true, data: "# NEW VERSION\n" }
        : file,
    ),
  });
  await f.repository.updateAssets(() => [newer], {
    expectedRevision: saved.revision,
  });
  const checked = await f.manager.check({ id: copy.id });
  assert.equal(checked.status, "identical");
  assert.equal(checked.versionNumber, 1);
  assert.equal(checked.hasNewVersion, true);
  const next = await f.preview({ ...f.input, versionId: newer.versions[1].id });
  assert.equal(next.comparison.status, "different");
  assert.equal(next.existingCopy.id, copy.id);
  assert.equal(next.existingCopy.versionNumber, 1);
  const remapped = await f.manager.bind({
    token: next.token,
    revision: next.revision,
  });
  assert.equal(remapped.connections.skillCopies.length, 1);
  assert.equal(remapped.connections.skillCopies[0].id, copy.id);
  assert.equal(
    remapped.connections.skillCopies[0].versionId,
    newer.versions[1].id,
  );
  await assert.rejects(
    f.manager.bind({ token: p.token, revision: p.revision }),
    { status: 409 },
  );
  assert.deepEqual(
    (await readLocalSkill([f.root], f.source)).files,
    f.original.files,
  );
});

test("副本变化、消失、符号链接受阻与权限未知均如实显示且不持久化当前成功", async (t) => {
  const f = await fixture(t),
    p = await f.preview();
  const saved = await f.manager.bind({ token: p.token, revision: p.revision }),
    copy = saved.connections.skillCopies[0];
  await writeFile(
    join(f.source, "assets", "bytes.bin"),
    new Uint8Array([1, 2]),
  );
  assert.equal((await f.manager.check({ id: copy.id })).status, "different");
  await rename(f.source, join(f.root, "moved"));
  assert.equal((await f.manager.check({ id: copy.id })).status, "missing");
  const outside = join(f.base, "outside");
  await cp(join(f.root, "moved"), outside, { recursive: true });
  await symlink(outside, f.source);
  assert.equal((await f.manager.check({ id: copy.id })).status, "blocked");
  assert.deepEqual(await f.repository.read(), saved);
});

test("预览后替换同内容目录、Home 根或目标绑定均不能确认", async (t) => {
  for (const phase of ["package", "root", "home", "target"]) {
    await t.test(phase, async (t) => {
      const f = await fixture(t),
        p = await f.preview();
      if (phase === "target")
        await f.repository.updateConnections((c) => ({
          ...c,
          agentTargets: [
            {
              ...c.agentTargets[0],
              program: {
                ...c.agentTargets[0].program,
                path: join(f.base, "other-codex"),
              },
            },
          ],
        }));
      else {
        const directory =
          phase === "package"
            ? f.source
            : phase === "root"
              ? f.root
              : join(f.home, ".codex");
        const moved = directory + "-old";
        await rename(directory, moved);
        await cp(moved, directory, { recursive: true });
      }
      const before = await f.repository.read();
      await assert.rejects(
        f.manager.bind({ token: p.token, revision: p.revision }),
        { status: 409 },
      );
      assert.deepEqual(await f.repository.read(), before);
    });
  }
});

test("改绑、解除与归档保留关系但停止读取，目录身份替换需要重新关联", async (t) => {
  for (const phase of [
    "target_changed",
    "target_missing",
    "asset_unavailable",
    "directory_changed",
  ]) {
    await t.test(phase, async (t) => {
      const f = await fixture(t),
        p = await f.preview();
      const saved = await f.manager.bind({
          token: p.token,
          revision: p.revision,
        }),
        copy = saved.connections.skillCopies[0];
      if (phase === "asset_unavailable")
        await f.repository.updateAssets(
          (assets) => assets.map((a) => ({ ...a, archived: true })),
          { expectedRevision: saved.revision },
        );
      else if (phase === "directory_changed") {
        await rename(f.root, f.root + "-old");
        await cp(f.root + "-old", f.root, { recursive: true });
      } else
        await f.repository.updateConnections((c) => ({
          ...c,
          agentTargets:
            phase === "target_missing"
              ? []
              : c.agentTargets.map((v) => ({
                  ...v,
                  home: { ...v.home, path: join(f.base, "new-home") },
                })),
        }));
      if (phase !== "directory_changed")
        f.adapters.inspectAgentInventory = () => {
          throw new Error("不应读取失效目标");
        };
      const checked = await f.manager.check({ id: copy.id });
      assert.equal(
        checked.status,
        phase === "directory_changed" ? "target_changed" : phase,
      );
      assert.deepEqual((await f.repository.read()).connections.skillCopies, [
        copy,
      ]);
    });
  }
});

test("扫描与确认令牌过期、淘汰、提交时过期均拒绝；并发确认只新增一次", async (t) => {
  for (const phase of [
    "scan_expired",
    "scan_evicted",
    "preview_expired",
    "preview_evicted",
    "queued_expired",
    "concurrent",
  ]) {
    await t.test(phase, async (t) => {
      const f = await fixture(t);
      if (phase.startsWith("scan_")) {
        const s = await f.manager.discover(f.input);
        if (phase === "scan_expired") f.advance(300001);
        else for (let i = 0; i < 20; i++) await f.manager.discover(f.input);
        await assert.rejects(
          f.manager.preview({ token: s.token, candidateId: s.items[0].id }),
          { status: 409 },
        );
        return;
      }
      const p = await f.preview(),
        before = await f.repository.read();
      if (phase === "preview_expired") f.advance(300001);
      if (phase === "preview_evicted")
        for (let i = 0; i < 20; i++) await f.preview();
      if (phase === "queued_expired") {
        const update = f.repository.updateConnections;
        f.repository.updateConnections = (transform, options) =>
          update((c) => {
            f.advance(300001);
            return transform(c);
          }, options);
      }
      const input = { token: p.token, revision: p.revision };
      if (phase === "concurrent") {
        const results = await Promise.allSettled([
          f.manager.bind(input),
          f.manager.bind(input),
        ]);
        assert.ok(results.some((r) => r.status === "fulfilled"));
        assert.equal(
          (await f.repository.read()).connections.skillCopies.length,
          1,
        );
      } else {
        await assert.rejects(f.manager.bind(input), { status: 409 });
        assert.deepEqual(await f.repository.read(), before);
      }
    });
  }
});

test("部分目录发现不能推断不存在；共享 Home、不完整元数据及客户端路径拒绝", async (t) => {
  const f = await fixture(t),
    before = await f.repository.read(),
    inspect = f.adapters.inspectAgentInventory;
  f.adapters.inspectAgentInventory = async (id) => ({
    ...(await inspect(id)),
    truncated: true,
  });
  await assert.rejects(f.manager.discover(f.input), { status: 409 });
  f.adapters.inspectAgentInventory = async (id) => {
    const value = await inspect(id);
    value.homes[0].source = "用户共享";
    return value;
  };
  await assert.rejects(f.manager.discover(f.input), { status: 404 });
  f.adapters.inspectAgentInventory = inspect;
  for (const input of [
    { ...f.input, path: f.source },
    { ...f.input, roots: [f.root] },
    { ...f.input, targetId: "../outside" },
  ])
    await assert.rejects(f.manager.discover(input), { status: 400 });
  assert.deepEqual(await f.repository.read(), before);
});

test("清理示例不得移除被副本关系引用的 Skill；通用写入不能伪造关系", async (t) => {
  const f = await fixture(t);
  const demo = makeAsset({
    type: "Skill",
    title: "被关联的示例",
    demo: true,
    files: f.original.files,
  });
  const before = await f.repository.read();
  await f.repository.updateAssets((assets) => [...assets, demo], {
    expectedRevision: before.revision,
  });
  const p = await f.preview({
    ...f.input,
    assetId: demo.id,
    versionId: demo.versions[0].id,
  });
  const saved = await f.manager.bind({ token: p.token, revision: p.revision });
  await assert.rejects(
    f.repository.write({
      ...saved,
      assets: saved.assets.filter((a) => a.id !== demo.id),
    }),
    { status: 400 },
  );
  await assert.rejects(
    f.repository.write({
      ...saved,
      connections: { ...saved.connections, skillCopies: [] },
    }),
    { status: 400 },
  );
});

test("核对过程中目标被改绑，不返回当前一致", async (t) => {
  const f = await fixture(t),
    p = await f.preview();
  const saved = await f.manager.bind({ token: p.token, revision: p.revision }),
    copy = saved.connections.skillCopies[0];
  const inspect = f.adapters.inspectAgentInventory;
  f.adapters.inspectAgentInventory = async (id) => {
    f.adapters.inspectAgentInventory = inspect;
    const result = await inspect(id);
    await f.repository.updateConnections((c) => ({
      ...c,
      agentTargets: c.agentTargets.map((v) => ({
        ...v,
        program: { ...v.program, path: join(f.base, "new-program") },
      })),
    }));
    return result;
  };
  const checked = await f.manager.check({ id: copy.id });
  assert.equal(checked.status, "blocked");
  assert.equal(checked.comparison, undefined);
});

test("旧包权限未知不会冒充完全一致，改名不使固定关系失效", async (t) => {
  const f = await fixture(t),
    before = await f.repository.read();
  const newer = revise(f.asset, {
    files: f.asset.versions[0].files.map(({ mode, ...file }) => file),
  });
  await f.repository.updateAssets(() => [newer], {
    expectedRevision: before.revision,
  });
  const p = await f.preview({ ...f.input, versionId: newer.versions[1].id });
  assert.equal(p.comparison.status, "unverified");
  assert.equal(p.comparison.permissionsKnown, false);
  const saved = await f.manager.bind({ token: p.token, revision: p.revision });
  await f.repository.updateConnections((c) => ({
    ...c,
    agentTargets: c.agentTargets.map((target) => ({
      ...target,
      label: "已改名",
    })),
  }));
  const checked = await f.manager.check({
    id: saved.connections.skillCopies[0].id,
  });
  assert.equal(checked.status, "unverified");
  assert.ok(
    checked.comparison.files.every((file) =>
      file.changes.includes("mode_unknown"),
    ),
  );
});
