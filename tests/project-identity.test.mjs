import test from "node:test";
import assert from "node:assert/strict";
import {
  mkdtemp,
  mkdir,
  writeFile,
  readFile,
  realpath,
  rename,
  rm,
} from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { openRepository } from "../server/repository.mjs";
import { seed } from "../src/store.js";
import { mergeProjects } from "../server/discovery.mjs";
import {
  scanLocalProjects,
  inspectProjectLocation,
} from "../server/project-scan.mjs";
import { createProjectIdentity } from "../server/project-identity.mjs";
import { createProjectContext } from "../server/project-context.mjs";

async function fixture(run) {
  const base = await realpath(
    await mkdtemp(join(tmpdir(), "guiji-project-identity-")),
  );
  const root = join(base, "projects"),
    original = join(root, "原项目");
  await mkdir(original, { recursive: true });
  await writeFile(
    join(original, "CURRENT.md"),
    "# 合成项目\n下一步：检查样例\n",
  );
  const repository = await openRepository(join(base, "data"));
  let now = Date.parse("2026-09-26T12:00:00Z");
  const manager = createProjectIdentity(repository, { clock: () => now });
  const rescan = async () => {
    const state = await repository.read();
    const scanned = await scanLocalProjects([root], {
      knownPaths:
        state.connections?.projects.flatMap((p) => p.localPaths) || [],
    });
    return repository.updateConnections((c) => ({
      ...(c || {
        roots: [root],
        agents: [],
        github: { status: "not_connected", login: "", message: "", at: "" },
        agentScannedAt: "",
        errors: [],
        truncated: false,
      }),
      projects: mergeProjects(c?.projects || [], scanned.items, [], {
        locations: scanned.locations,
        protectedIds: c?.contextBindings?.map((b) => b.projectId) || [],
        at: scanned.at,
      }),
      projectScannedAt: scanned.at,
    }));
  };
  try {
    await repository.write(seed(), { initialize: true });
    const initial = await rescan();
    await run({
      base,
      root,
      original,
      repository,
      manager,
      rescan,
      initial,
      context: createProjectContext(repository, () => now),
      advance: (ms) => {
        now += ms;
      },
    });
  } finally {
    await repository.close();
    await rm(base, { recursive: true, force: true });
  }
}

test("目录移动后明确重关联保留原项目 ID 与 Current 指针，重扫不产生重复", () =>
  fixture(async (f) => {
    const project = f.initial.connections.projects[0];
    const input = {
      projectId: project.id,
      root: f.original,
      currentPath: "CURRENT.md",
    };
    const before = await f.context.preview(input);
    await f.context.bind({
      ...input,
      fingerprint: before.fingerprint,
      revision: f.initial.revision,
    });
    const destination = join(f.root, "新位置");
    await rename(f.original, destination);
    const scanned = await f.rescan();
    const candidate = scanned.connections.projects.find((p) =>
      p.localPaths.includes(destination),
    );
    assert.equal(scanned.connections.projects.length, 2);
    const preview = await f.manager.preview({
      mode: "merge",
      projectId: project.id,
      candidateId: candidate.id,
      replacePath: f.original,
      revision: scanned.revision,
    });
    assert.deepEqual(preview.newPaths, [destination]);
    assert.equal(preview.contextNeedsReview, true);
    assert.equal((await f.repository.read()).revision, scanned.revision);
    const result = await f.manager.confirm({
      token: preview.token,
      revision: preview.revision,
    });
    assert.equal(result.connections.projects.length, 1);
    assert.equal(result.connections.projects[0].id, project.id);
    assert.deepEqual(result.connections.projects[0].aliases, [candidate.id]);
    assert.deepEqual(
      result.connections.contextBindings,
      scanned.connections.contextBindings,
    );
    assert.equal(
      await readFile(join(destination, "CURRENT.md"), "utf8"),
      "# 合成项目\n下一步：检查样例\n",
    );
    await assert.rejects(
      f.context.prepare({
        projectId: project.id,
        fingerprint: before.fingerprint,
      }),
    );
    const repeat = await f.rescan();
    assert.equal(repeat.connections.projects.length, 1);
    assert.equal(repeat.connections.projects[0].id, project.id);
    assert.deepEqual(repeat.connections.projects[0].localPaths, [destination]);
    const refreshed = await f.context.preview({ ...input, root: destination });
    await f.context.bind({
      ...input,
      root: destination,
      fingerprint: refreshed.fingerprint,
      revision: repeat.revision,
    });
    assert.ok(
      await f.context.prepare({
        projectId: project.id,
        fingerprint: refreshed.fingerprint,
      }),
    );
  }));

async function additional(f) {
  const path = join(f.root, "候选");
  await mkdir(path);
  await writeFile(join(path, "CURRENT.md"), "# 候选样例\n");
  const state = await f.rescan();
  const project = state.connections.projects.find((p) =>
    p.localPaths.includes(f.original),
  );
  const candidate = state.connections.projects.find((p) =>
    p.localPaths.includes(path),
  );
  return {
    path,
    project,
    candidate,
    state,
    input: {
      mode: "merge",
      projectId: project.id,
      candidateId: candidate.id,
      replacePath: "",
      revision: state.revision,
    },
  };
}

test("多目录关联保留两处文件，响应重放不重复写入，历史别名跨扫描保留", () =>
  fixture(async (f) => {
    const { input, candidate } = await additional(f);
    const preview = await f.manager.preview(input);
    const [a, b] = await Promise.allSettled([
      f.manager.confirm(previewInput(preview)),
      f.manager.confirm(previewInput(preview)),
    ]);
    assert.equal(a.status, "fulfilled");
    assert.equal(b.status, "rejected");
    const state = await f.repository.read();
    assert.equal(state.revision, input.revision + 1);
    assert.equal(state.connections.projects[0].localPaths.length, 2);
    assert.equal(
      await readFile(join(f.original, "CURRENT.md"), "utf8"),
      "# 合成项目\n下一步：检查样例\n",
    );
    const scanned = await f.rescan();
    assert.equal(scanned.connections.projects.length, 1);
    assert.ok(scanned.connections.projects[0].aliases.includes(candidate.id));
  }));
const previewInput = (p) => ({ token: p.token, revision: p.revision });

test("重新确认不能将另一个冲突或未核实目录一并改绑远端", () =>
  fixture(async (f) => {
    const { input, path } = await additional(f);
    const p = await f.manager.preview(input);
    await f.manager.confirm(previewInput(p));
    const state = await f.repository.updateConnections((c) => ({
      ...c,
      projects: c.projects.map((project) => ({
        ...project,
        repoKey: "owner/old",
      })),
    }));
    for (const status of ["present", "unknown"]) {
      const manager = createProjectIdentity(f.repository, {
        inspect: async (roots, selected) => ({
          ...(await inspectProjectLocation(roots, selected)),
          status: selected === path ? status : "present",
          repoKey: selected === path ? "owner/old" : "owner/new",
        }),
      });
      await assert.rejects(
        manager.preview({
          mode: "accept",
          projectId: input.projectId,
          path: f.original,
          revision: state.revision,
        }),
        /暂不支持拆分/,
      );
    }
    assert.equal((await f.repository.read()).revision, state.revision);
  }));

test("重新确认更换目录明确展示并接受新远端，不要求无限重扫且保留原 ID", () =>
  fixture(async (f) => {
    const original = f.initial.connections.projects[0];
    const state = await f.repository.updateConnections((c) => ({
      ...c,
      projects: c.projects.map((p) => ({
        ...p,
        repoKey: "owner/old",
        githubUrl: "https://github.com/owner/old",
        description: "旧仓库信息",
      })),
    }));
    const manager = createProjectIdentity(f.repository, {
      inspect: async (roots, path) => ({
        ...(await inspectProjectLocation(roots, path)),
        repoKey: "owner/new",
      }),
    });
    const p = await manager.preview({
      mode: "accept",
      projectId: original.id,
      path: f.original,
      revision: state.revision,
    });
    assert.equal(p.oldRepoKey, "owner/old");
    assert.equal(p.repoKey, "owner/new");
    const changed = await manager.confirm(previewInput(p));
    const saved = changed.connections.projects[0];
    assert.equal(saved.id, original.id);
    assert.equal(saved.repoKey, "owner/new");
    assert.equal(saved.githubUrl, "https://github.com/owner/new");
    assert.equal(saved.description, undefined);
    assert.equal(
      await readFile(join(f.original, "CURRENT.md"), "utf8"),
      "# 合成项目\n下一步：检查样例\n",
    );
  }));

test("尚未重新扫描的同路径目录替换，不能用直接保存 Current 绕过目录确认", () =>
  fixture(async (f) => {
    const project = f.initial.connections.projects[0];
    await rename(f.original, join(f.base, "原件保留"));
    await mkdir(f.original);
    await writeFile(
      join(f.original, "CURRENT.md"),
      "# 合成项目\n下一步：检查样例\n",
    );
    await assert.rejects(
      f.context.preview({
        projectId: project.id,
        root: f.original,
        currentPath: "CURRENT.md",
      }),
      /目录已更换/,
    );
    const scanned = await f.rescan();
    const accepted = await f.manager.preview({
      mode: "accept",
      projectId: project.id,
      path: f.original,
      revision: scanned.revision,
    });
    await f.manager.confirm(previewInput(accepted));
    assert.ok(
      await f.context.preview({
        projectId: project.id,
        root: f.original,
        currentPath: "CURRENT.md",
      }),
    );
  }));

test("已有来源连接和已知不同远端拒绝吞并，原项目与指针完整保留", () =>
  fixture(async (f) => {
    const { input, path, candidate } = await additional(f);
    const binding = {
      projectId: candidate.id,
      root: path,
      currentPath: "CURRENT.md",
    };
    const cp = await f.context.preview(binding);
    const bound = await f.context.bind({
      ...binding,
      fingerprint: cp.fingerprint,
      revision: input.revision,
    });
    await assert.rejects(
      f.manager.preview({ ...input, revision: bound.revision }),
      /已有 Current/,
    );
    assert.equal((await f.repository.read()).connections.projects.length, 2);
    let state = await f.context.unbind({
      projectId: candidate.id,
      revision: bound.revision,
    });
    state = await f.repository.updateConnections((c) => ({
      ...c,
      projects: c.projects.map((p) => ({
        ...p,
        repoKey: p.id === candidate.id ? "owner/b" : "owner/a",
      })),
    }));
    await assert.rejects(
      f.manager.preview({ ...input, revision: state.revision }),
      /关联不同/,
    );
    assert.equal((await f.repository.read()).revision, state.revision);
  }));

test("只允许替换实际缺失的旧目录，未知、范围外、现存目录均不作为缺失", () =>
  fixture(async (f) => {
    const { input } = await additional(f);
    await assert.rejects(
      f.manager.preview({ ...input, replacePath: f.original }),
      /未证实缺失/,
    );
    await rename(f.original, join(f.base, "保留原件"));
    for (const status of ["unknown", "out_of_scope"]) {
      const manager = createProjectIdentity(f.repository, {
        inspect: async (roots, path) =>
          path === f.original
            ? { path, status, checkedAt: new Date().toISOString() }
            : inspectProjectLocation(roots, path),
      });
      await assert.rejects(
        manager.preview({ ...input, replacePath: f.original }),
        /未证实缺失/,
      );
    }
    assert.equal((await f.repository.read()).revision, input.revision);
  }));

test("目录替换需显式接纳；旧预览遇相同路径新身份后失效", () =>
  fixture(async (f) => {
    const { input, path } = await additional(f);
    const preview = await f.manager.preview(input);
    await rename(path, join(f.base, "旧候选保留"));
    await mkdir(path);
    await writeFile(join(path, "CURRENT.md"), "# 候选样例\n");
    await assert.rejects(f.manager.confirm(previewInput(preview)), /变化/);
    const scanned = await f.rescan(),
      candidate = scanned.connections.projects.find(
        (p) => p.id === input.candidateId,
      );
    assert.equal(candidate.locations[0].status, "changed");
    await assert.rejects(
      f.manager.preview({ ...input, revision: scanned.revision }),
      /身份已变化/,
    );
    const accept = await f.manager.preview({
      mode: "accept",
      projectId: candidate.id,
      path,
      revision: scanned.revision,
    });
    const accepted = await f.manager.confirm(previewInput(accept));
    const updated = accepted.connections.projects.find(
      (p) => p.id === candidate.id,
    );
    assert.equal(updated.locations[0].status, "present");
    assert.equal(updated.locations[0].observedIdentity, undefined);
    assert.notEqual(
      updated.locations[0].identity,
      candidate.locations[0].identity,
    );
    const merge = await f.manager.preview({
      ...input,
      revision: accepted.revision,
    });
    assert.equal(
      (await f.manager.confirm(previewInput(merge))).connections.projects
        .length,
      1,
    );
  }));

test("五分钟过期、主库/范围变化、令牌驱逐与服务重启均拒绝旧确认", () =>
  fixture(async (f) => {
    const { input } = await additional(f);
    const preview = await f.manager.preview(input);
    f.advance(300001);
    await assert.rejects(f.manager.confirm(previewInput(preview)), /失效/);
    const next = await f.manager.preview(input);
    await assert.rejects(
      createProjectIdentity(f.repository).confirm(previewInput(next)),
      /失效/,
    );
    const expired = await f.manager.preview(input);
    for (let i = 0; i < 20; i++) await f.manager.preview(input);
    await assert.rejects(f.manager.confirm(previewInput(expired)), /失效/);
    await f.repository.updateConnections((c) => ({ ...c, roots: [] }));
    await assert.rejects(f.manager.confirm(previewInput(next)), /失效|更新/);
    assert.equal((await f.repository.read()).connections.projects.length, 2);
  }));

test("陌生字段、任意未登记目录和缺失版本被拒绝且不触发探测", () =>
  fixture(async (f) => {
    let probes = 0;
    const manager = createProjectIdentity(f.repository, {
      inspect: () => {
        probes++;
        throw new Error("must not probe");
      },
    });
    const projectId = f.initial.connections.projects[0].id;
    await assert.rejects(
      manager.preview({
        mode: "accept",
        projectId,
        path: "/",
        revision: f.initial.revision,
      }),
      /已登记/,
    );
    await assert.rejects(
      manager.preview({ mode: "accept", projectId, path: f.original }),
      /版本/,
    );
    await assert.rejects(
      manager.preview({
        mode: "accept",
        projectId,
        path: f.original,
        revision: f.initial.revision,
        unchecked: true,
      }),
      /无效/,
    );
    assert.equal(probes, 0);
  }));
