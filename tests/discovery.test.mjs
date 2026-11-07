import test from "node:test";
import assert from "node:assert/strict";
import {
  mkdtemp,
  mkdir,
  writeFile,
  symlink,
  chmod,
  rm,
  realpath,
} from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  scanLocalProjects,
  detectAgents,
  mergeProjects,
} from "../server/discovery.mjs";
import { macOnly, PLUTIL, VOLUME_UUID } from "./mac-only.mjs";
test("扫描范围内自动发现项目，忽略依赖/符号链接；Agent 程序与配置痕迹区分", macOnly(VOLUME_UUID), async () => {
  const dir = await mkdtemp(join(tmpdir(), "guiji-discovery-"));
  try {
    await mkdir(join(dir, "website"));
    await writeFile(join(dir, "website", "package.json"), "{}");
    await mkdir(join(dir, "node_modules", "fake"), { recursive: true });
    await writeFile(join(dir, "node_modules", "fake", "package.json"), "{}");
    await symlink(join(dir, "website"), join(dir, "alias"));
    const scan = await scanLocalProjects([dir]);
    assert.equal(scan.items.length, 1);
    assert.equal(scan.items[0].name, "website");
    await mkdir(join(dir, "bin"));
    await writeFile(join(dir, "bin", "codex"), "not executed");
    await chmod(join(dir, "bin", "codex"), 0o700);
    await mkdir(join(dir, ".hermes"));
    const agents = await detectAgents({
      home: dir,
      executableDirs: [join(dir, "bin")],
      appDirs: [],
    });
    assert.equal(agents.items.find((a) => a.id === "codex").status, "detected");
    assert.equal(
      agents.items.find((a) => a.id === "hermes").status,
      "config_only",
    );
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("ChatGPT.app 错误、缺失或受阻的 bundle 身份不冒充任一品牌", async () => {
  const dir = await realpath(
    await mkdtemp(join(tmpdir(), "guiji-app-identity-")),
  );
  try {
    const app = join(dir, "ChatGPT.app");
    await mkdir(join(app, "Contents"), { recursive: true });
    const metadata = join(app, "Contents/Info.plist");
    const assertNotDetected = async () => {
      const result = await detectAgents({
        home: dir,
        executableDirs: [],
        appDirs: [dir],
      });
      for (const id of ["codex", "chatgpt"]) {
        const agent = result.items.find((item) => item.id === id);
        assert.equal(agent.programs.length, 0, `${id} 不应因文件名被误认`);
        assert.notEqual(agent.status, "detected");
      }
    };
    await writeFile(
      metadata,
      JSON.stringify({ CFBundleIdentifier: "com.example.unrelated" }),
    );
    await assertNotDetected();
    await writeFile(
      metadata,
      JSON.stringify({ CFBundleShortVersionString: "1.0" }),
    );
    await assertNotDetected();
    await rm(metadata);
    await assertNotDetected();
    const linked = join(dir, "linked.plist");
    await writeFile(
      linked,
      JSON.stringify({ CFBundleIdentifier: "com.openai.chat" }),
    );
    await symlink(linked, metadata);
    await assertNotDetected();
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("ChatGPT.app 的 Codex bundle 身份归入 Codex，原 ChatGPT 身份不变", macOnly(PLUTIL), async () => {
  const dir = await realpath(await mkdtemp(join(tmpdir(), "guiji-app-alias-")));
  try {
    const app = join(dir, "ChatGPT.app");
    await mkdir(join(app, "Contents"), { recursive: true });
    const metadata = join(app, "Contents/Info.plist");
    await writeFile(
      metadata,
      JSON.stringify({
        CFBundleIdentifier: "com.openai.codex",
        CFBundleShortVersionString: "26.917.71314",
      }),
    );
    const detect = () =>
      detectAgents({ home: dir, executableDirs: [], appDirs: [dir] });
    let result = await detect();
    assert.deepEqual(result.items.find((a) => a.id === "codex").programs, [
      { path: app, kind: "App" },
    ]);
    assert.equal(
      result.items.find((a) => a.id === "chatgpt").programs.length,
      0,
    );
    await writeFile(
      metadata,
      JSON.stringify({
        CFBundleIdentifier: "com.openai.chat",
        CFBundleShortVersionString: "1.2026.100",
      }),
    );
    result = await detect();
    assert.equal(result.items.find((a) => a.id === "codex").programs.length, 0);
    assert.deepEqual(result.items.find((a) => a.id === "chatgpt").programs, [
      { path: app, kind: "App" },
    ]);
    await writeFile(metadata, "invalid plist");
    result = await detect();
    assert.equal(result.items.find((a) => a.id === "codex").status, "unknown");
    assert.equal(
      result.items.find((a) => a.id === "chatgpt").status,
      "unknown",
    );
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
test("本地 remote 与 GitHub 自动归并为一项；重新扫描保持稳定 ID", () => {
  const local = {
    id: "local-1",
    name: "repo",
    localPaths: ["/project/repo"],
    repoKey: "owner/repo",
    kind: "Git",
    branch: "main",
  };
  const remote = {
    name: "repo",
    repoKey: "owner/repo",
    githubUrl: "https://github.com/owner/repo",
    private: true,
  };
  const result = mergeProjects([], [local], [remote]);
  assert.equal(result.length, 1);
  assert.equal(result[0].localPaths[0], "/project/repo");
  assert.ok(result[0].githubUrl);
  const repeated = mergeProjects(result, [local], [remote]);
  assert.equal(repeated[0].id, result[0].id);
  assert.equal(repeated.length, 1);
});

test("后续补 remote 合并已有两条记录；换 remote 解除旧关联", () => {
  const local = {
    id: "local-1",
    name: "repo",
    localPaths: ["/project/repo"],
    repoKey: "",
    kind: "Git",
  };
  const remote = {
    name: "repo",
    repoKey: "owner/repo",
    githubUrl: "https://github.com/owner/repo",
    private: true,
  };
  const first = mergeProjects([], [local], [remote]);
  assert.equal(first.length, 2);
  const linked = mergeProjects(
    first,
    [{ ...local, repoKey: "owner/repo" }],
    [remote],
  );
  assert.equal(linked.length, 1);
  const moved = mergeProjects(linked, [{ ...local, repoKey: "owner/new" }], []);
  const current = moved.find((p) => p.localPaths.includes("/project/repo"));
  assert.equal(current.repoKey, "owner/new");
  assert.equal(current.githubUrl, undefined);
  assert.equal(
    moved.find((p) => p.githubUrl === remote.githubUrl).localPaths.length,
    0,
  );
  const removed = mergeProjects(linked, [local], []);
  assert.equal(removed.find((p) => p.localPaths.length).githubUrl, undefined);
});

test("不可读取的探测位置标记未知，不当作未安装", async () => {
  const dir = await mkdtemp(join(tmpdir(), "guiji-probe-error-"));
  try {
    await symlink(join(dir, "loop"), join(dir, "loop"));
    const detected = await detectAgents({
      home: dir,
      executableDirs: [join(dir, "loop")],
      appDirs: [],
    });
    const codex = detected.items.find((a) => a.id === "codex");
    assert.equal(codex.status, "unknown");
    assert.ok(codex.errors.length);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("Git 元数据读取失败保留上次关联并报告未知", async () => {
  const dir = await mkdtemp(join(tmpdir(), "guiji-git-error-"));
  try {
    await mkdir(join(dir, ".git"));
    const scan = await scanLocalProjects([dir]);
    assert.ok(scan.errors.length);
    const previous = [
      {
        id: "old",
        name: "old",
        repoKey: "owner/repo",
        localPaths: [dir],
        githubUrl: "https://github.com/owner/repo",
      },
    ];
    const merged = mergeProjects(previous, scan.items, []);
    assert.equal(
      merged.find((p) => p.localPaths.includes(dir)).repoKey,
      "owner/repo",
    );
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
