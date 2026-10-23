import test from "node:test";
import assert from "node:assert/strict";
import {
  mkdtemp,
  mkdir,
  writeFile,
  rm,
  rename,
  symlink,
} from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import * as filesystem from "node:fs/promises";
import {
  scanLocalProjects,
  inspectProjectLocation,
} from "../server/project-scan.mjs";

async function fixture(t) {
  const root = await mkdtemp(join(tmpdir(), "guiji-project-scan-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  return root;
}

test("项目扫描与单项目检查给出真实目录身份和兼容项目记录", async (t) => {
  const root = await fixture(t);
  const path = join(root, "网站");
  await mkdir(path);
  await writeFile(
    join(path, "package.json"),
    "private project body not consumed",
  );
  const scan = await scanLocalProjects([root]);
  const observation = scan.locations.find((row) => row.path === path);
  assert.equal(observation.status, "present");
  assert.match(observation.identity, /^[a-f0-9]{64}$/);
  assert.match(observation.scopeSignature, /^[a-f0-9]{64}$/);
  assert.equal(observation.repoKey, "");
  assert.equal(observation.kind, "Node");
  assert.ok(!Number.isNaN(Date.parse(observation.checkedAt)));
  assert.equal(scan.items.length, 1);
  assert.match(scan.items[0].id, /^local-[a-f0-9]{24}$/);
  assert.deepEqual(scan.items[0].localPaths, [path]);
  assert.equal(scan.items[0].name, "网站");
  assert.equal(scan.visited, 2);
  assert.equal(scan.truncated, false);
  assert.deepEqual(scan.errors, []);
  assert.equal(
    (await inspectProjectLocation([root], path)).identity,
    observation.identity,
  );
});

test("范围外与排除目录不探测；已知符号链接为未知，不能借重叠根穿透链接", async (t) => {
  const root = await fixture(t);
  const project = join(root, "project");
  await mkdir(project);
  await writeFile(join(project, "package.json"), "{}");
  for (const name of [".hidden", "node_modules", "Tool.app"]) {
    await mkdir(join(root, name));
    await writeFile(join(root, name, "package.json"), "{}");
  }
  const alias = join(root, "alias");
  await symlink(project, alias);
  const scan = await scanLocalProjects([root], { knownPaths: [alias] });
  assert.deepEqual(
    scan.items.map((row) => row.name),
    ["project"],
  );
  assert.equal(
    scan.locations.find((row) => row.path === alias)?.status,
    "unknown",
  );
  assert.equal(
    (await inspectProjectLocation([root], join(root, ".hidden"))).status,
    "out_of_scope",
  );
  assert.equal(
    (await inspectProjectLocation([root], join(root, "node_modules"))).status,
    "out_of_scope",
  );
  assert.equal(
    (await inspectProjectLocation([root], `${root}-outside`)).status,
    "out_of_scope",
  );
  assert.equal(
    (await inspectProjectLocation([alias], alias)).status,
    "unknown",
  );
  assert.equal(
    (await inspectProjectLocation([root, alias], alias)).status,
    "unknown",
  );
  const linkedRoot = await scanLocalProjects([alias]);
  assert.equal(linkedRoot.items.length, 0);
  assert.equal(linkedRoot.locations[0].status, "unknown");
});

test("目录改名保留底层身份，新路径重新签名；旧目录仅实际检查后为缺失", async (t) => {
  const root = await fixture(t);
  const before = join(root, "before");
  const after = join(root, "after");
  await mkdir(before);
  await writeFile(join(before, "CURRENT.md"), "not read");
  const original = await inspectProjectLocation([root], before);
  await rename(before, after);
  const scan = await scanLocalProjects([root], { knownPaths: [before] });
  const moved = scan.locations.find((row) => row.path === after);
  assert.equal(moved.identity, original.identity);
  assert.notEqual(moved.scopeSignature, original.scopeSignature);
  assert.equal(
    scan.locations.find((row) => row.path === before)?.status,
    "missing",
  );
  assert.equal(
    (await inspectProjectLocation([root], before)).status,
    "missing",
  );
  await rm(after, { recursive: true });
  assert.equal((await inspectProjectLocation([root], after)).status, "missing");
});

test("扫描截断与已知路径优先探测共享预算，未探测目录不冒充缺失", async (t) => {
  const root = await fixture(t);
  const project = join(root, "project");
  const absent = join(root, "absent");
  await mkdir(project);
  await writeFile(join(project, "package.json"), "{}");
  const scan = await scanLocalProjects([root], {
    maxDirectories: 1,
    knownPaths: [project, absent],
  });
  assert.equal(scan.visited, 1);
  assert.equal(scan.truncated, true);
  assert.equal(scan.items.length, 1);
  assert.equal(
    scan.locations.find((row) => row.path === absent)?.status,
    "unknown",
  );
  assert.equal(
    scan.locations.find((row) => row.path === project)?.status,
    "present",
  );
  const shallow = await scanLocalProjects([root], {
    maxDepth: 0,
    maxDirectories: 2,
    knownPaths: [project, absent],
  });
  assert.equal(shallow.visited, 2);
  assert.equal(shallow.truncated, true);
  assert.equal(
    shallow.locations.find((row) => row.path === project)?.status,
    "present",
  );
  assert.equal(shallow.items.length, 1);
  assert.equal(
    shallow.locations.find((row) => row.path === absent)?.status,
    "missing",
  );
});

test("Git 远端已知为空与读取失败区分，GitHub 地址仅规范化而不访问远端", async (t) => {
  const root = await fixture(t);
  const valid = join(root, "valid");
  const invalid = join(root, "invalid");
  await mkdir(valid);
  await mkdir(join(invalid, ".git"), { recursive: true });
  const git = promisify(execFile);
  await git("/usr/bin/git", ["init", "--quiet", valid]);
  const empty = await inspectProjectLocation([root], valid);
  assert.equal(empty.status, "present");
  assert.equal(empty.repoKey, "");
  await git("/usr/bin/git", [
    "-C",
    valid,
    "remote",
    "add",
    "origin",
    "git@github.com:Example/Workbench.git",
  ]);
  const scan = await scanLocalProjects([root]);
  assert.equal(
    scan.locations.find((row) => row.path === valid)?.repoKey,
    "example/workbench",
  );
  const broken = scan.locations.find((row) => row.path === invalid);
  assert.equal(broken.status, "present");
  assert.equal(broken.kind, "Git");
  assert.ok(!Object.hasOwn(broken, "repoKey"));
  assert.ok(
    !Object.hasOwn(
      scan.items.find((row) => row.name === "invalid"),
      "repoKey",
    ),
  );
  assert.ok(
    scan.errors.some((message) => message.includes("Git 远端读取失败")),
  );
  const { githubKey } = await import("../server/project-scan.mjs");
  assert.equal(
    githubKey("https://github.com/Example/Workbench.git"),
    "example/workbench",
  );
  assert.equal(
    githubKey("ssh://git@github.com/Example/Workbench.git"),
    "example/workbench",
  );
  assert.equal(githubKey("https://not-github.com/Example/Workbench"), "");
});

test("扫描拒绝过宽、相对或无界参数；所有参数在探测前校验", async (t) => {
  const root = await fixture(t);
  let probes = 0;
  const blocked = {
    async lstat() {
      probes++;
      assert.fail("无效参数不得探测文件系统");
    },
    async readdir() {
      probes++;
      assert.fail("无效参数不得探测文件系统");
    },
  };
  for (const roots of [
    ["/"],
    ["relative"],
    Array(13).fill(root),
    [root, null],
  ]) {
    await assert.rejects(scanLocalProjects(roots, { filesystem: blocked }));
  }
  for (const opts of [
    { maxDirectories: Infinity },
    { maxDirectories: -1 },
    { maxDirectories: 0.5 },
    { maxDepth: Infinity },
    { maxDepth: -1 },
    { knownPaths: "wrong" },
    { knownPaths: [root, "relative"] },
  ])
    await assert.rejects(
      scanLocalProjects([root], { ...opts, filesystem: blocked }),
    );
  await assert.rejects(
    inspectProjectLocation([root], "relative", { filesystem: blocked }),
  );
  assert.equal(probes, 0);
  const zero = await scanLocalProjects([root], {
    maxDirectories: 0,
    knownPaths: [join(root, "absent")],
  });
  assert.equal(zero.visited, 0);
  assert.equal(zero.locations.at(-1).status, "unknown");
});

test("实际 ENOTDIR 可判缺失，读取受阻为未知；空目录为未识别而非缺失", async (t) => {
  const root = await fixture(t);
  const file = join(root, "file");
  await writeFile(file, "not a directory");
  assert.equal(
    (await inspectProjectLocation([root], join(file, "project"))).status,
    "missing",
  );
  const empty = join(root, "empty");
  await mkdir(empty);
  assert.equal(
    (await inspectProjectLocation([root], empty)).status,
    "unrecognized",
  );
  const denied = await inspectProjectLocation([root], empty, {
    filesystem: {
      ...filesystem,
      async readdir() {
        throw Object.assign(new Error("PRIVATE ERROR BODY"), {
          code: "EACCES",
        });
      },
    },
  });
  assert.equal(denied.status, "unknown");
  assert.ok(!JSON.stringify(denied).includes("PRIVATE"));
  assert.ok(!Object.hasOwn(denied, "identity"));
});

test("Git 标记是链接时不解析其目标，也不误报远端已知为空", async (t) => {
  const root = await fixture(t);
  const project = join(root, "project");
  const privateGit = join(root, ".outside-git");
  await mkdir(project);
  await mkdir(privateGit);
  await writeFile(join(project, "package.json"), "{}");
  await symlink(privateGit, join(project, ".git"));
  const observed = await inspectProjectLocation([root], project);
  assert.equal(observed.status, "present");
  assert.ok(!Object.hasOwn(observed, "repoKey"));
  assert.match(observed.message, /Git/);
  await rm(join(project, "package.json"));
  assert.equal(
    (await inspectProjectLocation([root], project)).status,
    "unknown",
  );
});

test("同一真实根的系统别名只扫描一次，同时容许根以上系统别名", async (t) => {
  const root = await fixture(t);
  const canonical = await filesystem.realpath(root);
  await mkdir(join(root, "project"));
  await writeFile(join(root, "project", "package.json"), "{}");
  const scan = await scanLocalProjects([root, canonical]);
  assert.equal(scan.items.length, 1);
  assert.equal(scan.items[0].name, "project");
  assert.equal(
    (await inspectProjectLocation([root], join(root, "project"))).status,
    "present",
  );
});

test("检查期间祖先目录被替换，即使项目本身 inode 未变也只报告未知", async (t) => {
  const root = await fixture(t);
  const parent = join(root, "parent");
  const path = join(parent, "project");
  await mkdir(path, { recursive: true });
  await writeFile(join(path, "package.json"), "{}");
  let swapped = false;
  const observed = await inspectProjectLocation([root], path, {
    filesystem: {
      ...filesystem,
      async readdir(value, options) {
        const entries = await filesystem.readdir(value, options);
        if (value === path && !swapped) {
          swapped = true;
          await rename(parent, join(root, "old-parent"));
          await mkdir(parent);
          await rename(join(root, "old-parent", "project"), path);
        }
        return entries;
      },
    },
  });
  assert.equal(observed.status, "unknown");
  assert.ok(!Object.hasOwn(observed, "identity"));
  assert.match(observed.message, /变化/);
});

test("批准根以上别名变向后，即使根 inode 保持也使规范化范围签名失效", async (t) => {
  const fixtureRoot = await fixture(t);
  const physical = join(fixtureRoot, "physical");
  const moved = join(fixtureRoot, "moved");
  const alias = join(fixtureRoot, "alias");
  await mkdir(join(physical, "vault", "project"), { recursive: true });
  await writeFile(join(physical, "vault", "project", "package.json"), "{}");
  await symlink(physical, alias);
  const root = join(alias, "vault");
  const path = join(root, "project");
  let swapped = false;
  const observed = await inspectProjectLocation([root], path, {
    filesystem: {
      ...filesystem,
      async readdir(value, options) {
        const entries = await filesystem.readdir(value, options);
        if (value === path && !swapped) {
          swapped = true;
          await rename(physical, moved);
          await rm(alias);
          await symlink(moved, alias);
        }
        return entries;
      },
    },
  });
  assert.equal(observed.status, "unknown");
  assert.match(observed.message, /变化/);
});
