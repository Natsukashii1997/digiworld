import test from "node:test";
import assert from "node:assert/strict";
import {
  mkdtemp,
  mkdir,
  writeFile,
  readFile,
  rm,
  symlink,
  lstat,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { openRepository } from "../server/repository.mjs";
import { projectDirectory } from "../server/project-context.mjs";
import { createSavepoints } from "../server/savepoints.mjs";
import {
  createSavepointGit,
  savepointGitArgs,
  inspectGit,
  DEFAULT_IGNORE,
} from "../server/savepoint-git.mjs";
import { readOnlyGhArgs } from "../server/project-github.mjs";
import { seed } from "../src/store.js";
const exec = promisify(execFile),
  identity = [
    "-c",
    "user.name=合成测试",
    "-c",
    "user.email=fixture@example.invalid",
  ],
  run = createSavepointGit({ identity, globalConfig: "/dev/null" });
async function fixture({ nogit = false, afterCommit } = {}) {
  const base = await mkdtemp(join(tmpdir(), "guiji-savepoints-")),
    root = join(base, "project"),
    data = join(base, "data");
  await mkdir(root);
  await mkdir(data);
  const git = async (args) =>
    (
      await exec(
        "/usr/bin/git",
        [
          ...identity,
          "-c",
          "core.hooksPath=/dev/null",
          "-c",
          "commit.gpgSign=false",
          ...args,
        ],
        {
          cwd: root,
          env: {
            ...process.env,
            GIT_CONFIG_GLOBAL: "/dev/null",
            GIT_CONFIG_NOSYSTEM: "1",
          },
        },
      )
    ).stdout;
  await writeFile(join(root, "README.md"), "initial\n");
  if (!nogit) {
    await git(["init", "--template=", "--initial-branch=main"]);
    await git(["add", "README.md"]);
    await git(["commit", "-m", "WB-20261001-1 · initial"]);
    await writeFile(join(root, "README.md"), "updated\n");
  }
  const dir = await projectDirectory([base], root),
    repository = await openRepository(data),
    state = seed();
  await repository.write(state, { initialize: true });
  await repository.updateConnections(() => ({
    roots: [base],
    projects: [
      {
        id: "test-project",
        name: "合成项目",
        kind: "Git",
        localPaths: [root],
        active: true,
        locations: [{ path: root, status: "present", identity: dir.identity }],
        repoKey: "",
        identityConflict: false,
      },
    ],
    agents: [],
    github: { status: "not_connected", login: "", message: "", at: "" },
    errors: [],
    truncated: false,
    projectScannedAt: new Date().toISOString(),
    agentScannedAt: "",
  }));
  const service = createSavepoints(repository, { run, afterCommit });
  return {
    base,
    root,
    repository,
    service,
    git,
    async close() {
      await rm(base, { recursive: true, force: true });
    },
  };
}
test("inspect worktree statistics, Current default message, selected commit and read-back", async () => {
  const f = await fixture();
  try {
    await mkdir(join(f.root, "src"));
    await writeFile(join(f.root, "src/new.js"), "line1\nline2\n");
    await writeFile(
      join(f.root, "CURRENT.md"),
      "| state_id | WB-20261006-7 |\n| 当前任务 | 测试存档 |\n",
    );
    const v = await f.service.inspect({ projectId: "test-project" });
    assert.equal(v.state, "main");
    assert.equal(v.stats.added, 2);
    assert.equal(v.stats.modified, 1);
    assert.equal(v.ahead, null);
    const p = await f.service.preview({
      projectId: "test-project",
      mode: "commit",
    });
    assert.match(p.message, /WB-20261006-7.*测试存档/);
    const r = await f.service.confirm({
      id: p.id,
      files: ["src/new.js"],
      message: "WB-20261006-8 · only new",
      confirmed: true,
    });
    assert.equal(r.state, "verified");
    assert.equal(
      (await f.git(["show", "--format=", "--name-only", "HEAD"])).trim(),
      "src/new.js",
    );
    assert.match(await f.git(["status", "--short"]), /README/);
    assert.equal((await f.service.query({ id: p.id })).hash, r.hash);
    assert.equal(
      (
        await f.service.confirm({
          id: p.id,
          files: ["src/new.js"],
          message: "repeat",
          confirmed: true,
        })
      ).hash,
      r.hash,
    );
  } finally {
    await f.close();
  }
});
test("unselected staged contents remain unchanged with commit --only", async () => {
  const f = await fixture();
  try {
    await writeFile(join(f.root, "outside.txt"), "outside staged\n");
    await f.git(["add", "outside.txt"]);
    const before = await f.git(["ls-files", "--stage", "outside.txt"]);
    const p = await f.service.preview({
      projectId: "test-project",
      mode: "commit",
    });
    const r = await f.service.confirm({
      id: p.id,
      files: ["README.md"],
      message: "selected only",
      confirmed: true,
    });
    assert.equal(r.state, "verified");
    assert.equal(await f.git(["ls-files", "--stage", "outside.txt"]), before);
    assert.equal(
      (await f.git(["diff", "--cached", "--name-only"])).trim(),
      "outside.txt",
    );
    assert.equal(
      (await f.git(["show", "--format=", "--name-only", "HEAD"])).trim(),
      "README.md",
    );
  } finally {
    await f.close();
  }
});
test("deleted file committed without resetting any other files", async () => {
  const f = await fixture();
  try {
    await rm(join(f.root, "README.md"));
    const p = await f.service.preview({
      projectId: "test-project",
      mode: "commit",
    });
    const r = await f.service.confirm({
      id: p.id,
      files: ["README.md"],
      message: "delete selected",
      confirmed: true,
    });
    assert.equal(r.state, "verified");
  } finally {
    await f.close();
  }
});
test("init preserves existing ignore and creates first selected savepoint", async () => {
  const f = await fixture({ nogit: true });
  try {
    await writeFile(join(f.root, ".gitignore"), "cache/\n");
    await mkdir(join(f.root, "cache"));
    await writeFile(join(f.root, "cache/ignored.txt"), "ignored");
    const p = await f.service.preview({
      projectId: "test-project",
      mode: "init",
    });
    assert.ok(!p.files.some((x) => x.path.startsWith("cache/")));
    const r = await f.service.confirm({
      id: p.id,
      files: ["README.md", ".gitignore"],
      message: "first savepoint",
      confirmed: true,
    });
    assert.equal(r.state, "verified");
    assert.equal(
      await readFile(join(f.root, ".gitignore"), "utf8"),
      "cache/\n",
    );
  } finally {
    await f.close();
  }
});
test("credentials, large file and symlink blocked, ignored file excluded", async () => {
  const f = await fixture();
  try {
    await writeFile(join(f.root, ".gitignore"), "ignored.txt\n");
    await writeFile(join(f.root, "ignored.txt"), "not listed");
    await writeFile(join(f.root, ".env"), "password=synthetic-secret-value\n");
    await writeFile(join(f.root, "big.bin"), Buffer.alloc(51 * 1024 * 1024));
    await symlink("README.md", join(f.root, "link"));
    const v = await f.service.inspect({ projectId: "test-project" });
    assert.ok(!v.files.some((x) => x.path === "ignored.txt"));
    for (const name of [".env", "big.bin", "link"]) {
      const x = v.files.find((x) => x.path === name);
      assert.ok(x.blocked);
      assert.equal(x.selected, false);
    }
    assert.ok(!JSON.stringify(v).includes("synthetic-secret-value"));
    const p = await f.service.preview({
      projectId: "test-project",
      mode: "commit",
    });
    await assert.rejects(
      f.service.confirm({
        id: p.id,
        files: [".env"],
        message: "bad",
        confirmed: true,
      }),
      /安全预览/,
    );
  } finally {
    await f.close();
  }
});
test("unknown commit result is queried, not replayed, persists across service restart", async () => {
  let count = 0;
  const f = await fixture({
    afterCommit: async () => {
      count++;
      throw Error("lost reply");
    },
  });
  try {
    const p = await f.service.preview({
        projectId: "test-project",
        mode: "commit",
      }),
      r = await f.service.confirm({
        id: p.id,
        files: ["README.md"],
        message: "lost reply saved",
        confirmed: true,
      });
    assert.equal(r.state, "unknown");
    await assert.rejects(
      f.service.preview({ projectId: "test-project", mode: "commit" }),
      /未知/,
    );
    const restarted = createSavepoints(f.repository, { run });
    const found = await restarted.query({ id: p.id });
    assert.equal(found.state, "verified");
    assert.equal(count, 1);
  } finally {
    await f.close();
  }
});
test("preview file or project revision change blocks before Git add", async () => {
  const f = await fixture();
  try {
    const p = await f.service.preview({
      projectId: "test-project",
      mode: "commit",
    });
    await writeFile(join(f.root, "README.md"), "changed again");
    await assert.rejects(
      f.service.confirm({
        id: p.id,
        files: ["README.md"],
        message: "stale",
        confirmed: true,
      }),
      /工作区/,
    );
    assert.equal((await f.git(["diff", "--cached", "--name-only"])).trim(), "");
    const next = await f.service.preview({
      projectId: "test-project",
      mode: "commit",
    });
    await f.repository.updateConnections((c) => ({
      ...c,
      projects: c.projects.map((p) => ({ ...p, active: false })),
    }));
    await assert.rejects(
      f.service.confirm({
        id: next.id,
        files: ["README.md"],
        message: "stale",
        confirmed: true,
      }),
      /登记或身份/,
    );
  } finally {
    await f.close();
  }
});
test("detached, custom filter, submodule and merge conflict are read-only", async () => {
  for (const kind of ["detached", "filter", "submodule", "merge"]) {
    const f = await fixture();
    try {
      if (kind === "detached") await f.git(["checkout", "--detach"]);
      if (kind === "filter")
        await f.git(["config", "filter.evil.clean", "touch /should-never-run"]);
      if (kind === "submodule")
        await f.git([
          "update-index",
          "--add",
          "--cacheinfo",
          "160000," + (await f.git(["rev-parse", "HEAD"])).trim() + ",sub",
        ]);
      if (kind === "merge")
        await writeFile(
          join(f.root, ".git/MERGE_HEAD"),
          (await f.git(["rev-parse", "HEAD"])).trim(),
        );
      const r = await f.service.inspect({ projectId: "test-project" });
      assert.equal(r.readOnly, true);
      await assert.rejects(
        f.service.preview({ projectId: "test-project", mode: "commit" }),
      );
    } finally {
      await f.close();
    }
  }
});
test("arbitrary Git and gh write shapes rejected before invocation", () => {
  for (const args of [
    ["push"],
    ["fetch"],
    ["reset", "--hard"],
    ["checkout", "main"],
    ["rebase"],
    ["stash"],
    ["config", "user.name", "x"],
    ["add", "-A", "--", "../x"],
    ["commit", "--amend"],
    ["diff", "--ext-diff"],
  ])
    assert.throws(() => savepointGitArgs(args));
  readOnlyGhArgs([
    "api",
    "--method",
    "GET",
    "--hostname",
    "github.com",
    "repos/a/b/commits?per_page=20&page=1",
  ]);
  for (const args of [
    [
      "api",
      "--method",
      "POST",
      "--hostname",
      "github.com",
      "repos/a/b/commits",
    ],
    [
      "api",
      "--method",
      "GET",
      "--hostname",
      "github.com",
      "repos/a/b/contents/private",
    ],
  ])
    assert.throws(() => readOnlyGhArgs(args));
});
test("write-time HEAD/index/revision changes stop the next Git write", async () => {
  for (const kind of [
    "head-before-add",
    "head-before-commit",
    "index",
    "revision",
  ]) {
    const f = await fixture();
    try {
      let armed = false,
        diffs = 0;
      const writes = [];
      const injected = async (root, args, opts) => {
        const result = await run(root, args, opts);
        if (
          armed &&
          args[0] === "diff" &&
          args.includes("--numstat") &&
          ++diffs === (kind === "head-before-commit" ? 4 : 2)
        ) {
          if (kind.startsWith("head"))
            await f.git([
              "commit",
              "--allow-empty",
              "-m",
              "external parallel commit",
            ]);
          if (kind === "index") {
            await writeFile(join(f.root, "outside.txt"), "external");
            await f.git(["add", "outside.txt"]);
          }
          if (kind === "revision")
            await f.repository.updateConnections((c) => ({
              ...c,
              projects: c.projects.map((p) => ({
                ...p,
                name: "changed registration",
              })),
            }));
        }
        if (armed && ["add", "commit"].includes(args[0])) writes.push(args[0]);
        return result;
      };
      const service = createSavepoints(f.repository, { run: injected }),
        p = await service.preview({
          projectId: "test-project",
          mode: "commit",
        });
      armed = true;
      const result = await service.confirm({
        id: p.id,
        files: ["README.md"],
        message: "guarded",
        confirmed: true,
      });
      assert.equal(result.state, "unknown");
      assert.deepEqual(writes, kind === "head-before-commit" ? ["add"] : []);
      assert.equal(
        (await service.pending({ projectId: "test-project" })).items.length,
        1,
      );
    } finally {
      await f.close();
    }
  }
});
test("same-head branch switch and index flags invalidate preview", async () => {
  for (const kind of ["branch", "flags"]) {
    const f = await fixture();
    try {
      const p = await f.service.preview({
        projectId: "test-project",
        mode: "commit",
      });
      if (kind === "branch") {
        await f.git(["branch", "same-head"]);
        await f.git(["symbolic-ref", "HEAD", "refs/heads/same-head"]);
      } else await f.git(["update-index", "--assume-unchanged", "README.md"]);
      await assert.rejects(
        f.service.confirm({
          id: p.id,
          files: ["README.md"],
          message: "stale",
          confirmed: true,
        }),
        /工作区/,
      );
      assert.equal(
        (await f.git(["log", "-1", "--format=%s"])).trim(),
        "WB-20261001-1 · initial",
      );
    } finally {
      await f.close();
    }
  }
});
test("query-time registration change keeps the operation unresolved", async () => {
  const f = await fixture({
    afterCommit: async () => {
      throw Error("lost reply");
    },
  });
  try {
    const p = await f.service.preview({
      projectId: "test-project",
      mode: "commit",
    });
    assert.equal(
      (
        await f.service.confirm({
          id: p.id,
          files: ["README.md"],
          message: "saved but unknown",
          confirmed: true,
        })
      ).state,
      "unknown",
    );
    let changed = false;
    const service = createSavepoints(f.repository, {
      run: async (root, args, opts) => {
        const value = await run(root, args, opts);
        if (args[0] === "ls-tree" && !changed) {
          changed = true;
          await f.repository.updateConnections((c) => ({
            ...c,
            projects: c.projects.map((p) => ({
              ...p,
              name: "revoked during query",
            })),
          }));
        }
        return value;
      },
    });
    assert.equal((await service.query({ id: p.id })).state, "unknown");
    assert.equal(
      (await service.pending({ projectId: "test-project" })).items.length,
      1,
    );
  } finally {
    await f.close();
  }
});
test("Git metadata parent links are read-only without touching the outside target", async () => {
  for (const name of ["refs", "logs", "objects"]) {
    const f = await fixture();
    try {
      const external = join(f.base, "outside");
      await mkdir(external);
      await writeFile(join(external, "marker"), "unchanged");
      await rm(join(f.root, ".git", name), { recursive: true, force: true });
      await symlink(external, join(f.root, ".git", name));
      const v = await f.service.inspect({ projectId: "test-project" });
      assert.equal(v.readOnly, true);
      await assert.rejects(
        f.service.preview({ projectId: "test-project", mode: "commit" }),
      );
      assert.equal(
        await readFile(join(external, "marker"), "utf8"),
        "unchanged",
      );
    } finally {
      await f.close();
    }
  }
});
test("init preview applies default ignore without changing the project; selected ignore is mandatory", async () => {
  const f = await fixture({ nogit: true });
  try {
    await mkdir(join(f.root, "node_modules"));
    await writeFile(join(f.root, "node_modules/skip.js"), "ignored");
    await writeFile(join(f.root, ".env.local"), "fake config");
    const p = await f.service.preview({
      projectId: "test-project",
      mode: "init",
    });
    assert.ok(p.files.some((x) => x.path === ".gitignore" && x.generated));
    assert.ok(
      !p.files.some(
        (x) => x.path.startsWith("node_modules/") || x.path === ".env.local",
      ),
    );
    await assert.rejects(lstat(join(f.root, ".git")), { code: "ENOENT" });
    await assert.rejects(
      f.service.confirm({
        id: p.id,
        files: ["README.md"],
        message: "missing ignore",
        confirmed: true,
      }),
      /须包含/,
    );
    const done = await f.service.confirm({
      id: p.id,
      files: ["README.md", ".gitignore"],
      message: "first selected",
      confirmed: true,
    });
    assert.equal(done.state, "verified");
    assert.equal(
      await readFile(join(f.root, ".gitignore"), "utf8"),
      DEFAULT_IGNORE,
    );
  } finally {
    await f.close();
  }
});
test("quoted filenames, nested deletions and annotated tag point at the right commit", async () => {
  const f = await fixture();
  try {
    await mkdir(join(f.root, "nested"));
    await writeFile(join(f.root, "nested/file.txt"), "nested");
    await f.git(["add", "nested"]);
    await f.git(["commit", "-m", "nested baseline"]);
    await rm(join(f.root, "nested"), { recursive: true });
    await writeFile(join(f.root, 'a "quoted" file.txt'), "quoted\n");
    const p = await f.service.preview({
      projectId: "test-project",
      mode: "commit",
    });
    const done = await f.service.confirm({
      id: p.id,
      files: ["nested/file.txt", 'a "quoted" file.txt'],
      message: "quoted and deleted",
      confirmed: true,
    });
    assert.equal(done.state, "verified");
    await f.git(["tag", "-a", "v-test", "-m", "annotated"]);
    const v = await f.service.inspect({ projectId: "test-project" });
    assert.deepEqual(v.commits[0].tags, ["v-test"]);
    assert.equal(
      v.commits[0].files.find((x) => x.path === 'a "quoted" file.txt').kind,
      "A",
    );
    assert.equal(
      v.commits[0].files.find((x) => x.path === "nested/file.txt").kind,
      "D",
    );
  } finally {
    await f.close();
  }
});
test("verified result stays tied to its SHA after later commits and unrelated staging", async () => {
  const f = await fixture();
  try {
    const p = await f.service.preview({
        projectId: "test-project",
        mode: "commit",
      }),
      done = await f.service.confirm({
        id: p.id,
        files: ["README.md"],
        message: "original result",
        confirmed: true,
      });
    assert.equal(done.state, "verified");
    for (let i = 0; i < 21; i++)
      await f.git(["commit", "--allow-empty", "-m", "later " + i]);
    await writeFile(join(f.root, "later-staged.txt"), "later");
    await f.git(["add", "later-staged.txt"]);
    const again = await f.service.confirm({
      id: p.id,
      files: ["README.md"],
      message: "do not replay",
      confirmed: true,
    });
    assert.equal(again.state, "verified");
    assert.equal(again.hash, done.hash);
    assert.equal((await f.git(["rev-list", "--count", "HEAD"])).trim(), "23");
    assert.equal(
      (await f.service.pending({ projectId: "test-project" })).items.length,
      0,
    );
  } finally {
    await f.close();
  }
});
test("cloud missing fields and wrong SHA fail; bounded valid pages report partial", async () => {
  const f = await fixture();
  try {
    await f.repository.updateConnections((c) => ({
      ...c,
      projects: c.projects.map((p) => ({
        ...p,
        localPaths: [],
        locations: [],
        repoKey: "synthetic/cloud",
      })),
    }));
    const hash = "a".repeat(40),
      commit = {
        sha: hash,
        commit: {
          message: "cloud commit",
          committer: { date: "2026-10-06T01:00:00Z" },
        },
      },
      file = {
        filename: "src/a.js",
        status: "added",
        additions: 1,
        deletions: 0,
      };
    for (const bad of [
      { ...commit },
      { ...commit, sha: "b".repeat(40), files: [] },
      { ...commit, files: [{ ...file, additions: -1 }] },
    ]) {
      const svc = createSavepoints(f.repository, {
        run,
        gh: async () => JSON.stringify(bad),
      });
      await assert.rejects(
        svc.detail({ projectId: "test-project", hash }),
        /不完整/,
      );
    }
    const svc = createSavepoints(f.repository, {
      run,
      gh: async (args) =>
        JSON.stringify(
          args.at(-1).includes("tags?")
            ? Array.from({ length: 100 }, (_, i) => ({
                name: "v" + i,
                commit: { sha: hash },
              }))
            : args.at(-1).includes("commits?")
              ? Array(20).fill(commit)
              : { ...commit, files: Array(300).fill(file) },
        ),
    });
    assert.equal(
      (await svc.detail({ projectId: "test-project", hash })).partial,
      true,
    );
    const v = await svc.inspect({ projectId: "test-project" });
    assert.equal(v.hasMore, true);
    assert.equal(v.tagPartial, true);
    assert.equal(v.readOnly, true);
    const malformed = createSavepoints(f.repository, {
      run,
      gh: async () => JSON.stringify([{ sha: hash }]),
    });
    await assert.rejects(
      malformed.inspect({ projectId: "test-project" }),
      /不完整/,
    );
  } finally {
    await f.close();
  }
});
test("per-project locks reject simultaneous confirmations without another commit", async () => {
  const f = await fixture();
  let release;
  const gate = new Promise((r) => (release = r));
  let reached;
  const atAdd = new Promise((r) => (reached = r));
  try {
    const first = createSavepoints(f.repository, {
        run: async (root, args, opts) => {
          if (args[0] === "add") {
            reached();
            await gate;
          }
          return run(root, args, opts);
        },
      }),
      second = createSavepoints(f.repository, { run });
    const a = await first.preview({
        projectId: "test-project",
        mode: "commit",
      }),
      b = await first.preview({ projectId: "test-project", mode: "commit" }),
      c = await second.preview({ projectId: "test-project", mode: "commit" }),
      input = (p) => ({
        id: p.id,
        files: ["README.md"],
        message: "one operation",
        confirmed: true,
      });
    const writing = first.confirm(input(a));
    await atAdd;
    await assert.rejects(first.confirm(input(b)), /进行/);
    await assert.rejects(second.confirm(input(c)), /存档锁/);
    release();
    assert.equal((await writing).state, "verified");
    assert.equal((await f.git(["rev-list", "--count", "HEAD"])).trim(), "2");
  } finally {
    release();
    await f.close();
  }
});
test("preflight reads are bounded even when a file grows; ordinary 2MiB files remain selectable", async () => {
  const f = await fixture();
  try {
    const {readBoundedHandle, candidateFile} = await import('../server/savepoint-git.mjs');
    let read = 0;
    await assert.rejects(readBoundedHandle({async read(buffer,offset,length){buffer.fill(65,offset,offset+length);read+=length;return {bytesRead:length};}}, 65536), /读取上限/);
    assert.equal(read,65537,'growing handle consumes at most bound plus one probe byte');
    await writeFile(join(f.root,'ordinary.txt'), 'a'.repeat(2*1024*1024));
    const c=await candidateFile(f.root,'ordinary.txt');
    assert.equal(c.blocked,null);assert.equal(c.bytes,2*1024*1024);assert.equal(c.added,1);
  } finally {await f.close();}
});
test("large CURRENT keeps complete header defaults and elapsed age preserves 25h/73h boundaries", async () => {
  const f=await fixture();
  try {
    await writeFile(join(f.root,'CURRENT.md'),'| 字段 | 当前值 |\n|---|---|\n| state_id | WB-20261006-191 |\n| 当前任务 | 合成完整头部任务 |\n| 唯一下一步 | 合成下一步 |\n\n'+'正文'.repeat(50000));
    const p=await f.service.preview({projectId:'test-project',mode:'commit'});
    assert.equal(p.message,'WB-20261006-191 · 合成完整头部任务');
    const last=Date.parse((await f.service.inspect({projectId:'test-project'})).last.at);
    for(const hours of [24,25,72,73]){
      const svc=createSavepoints(f.repository,{run,clock:()=>new Date(last+hours*3600000)});
      const v=await svc.inspect({projectId:'test-project'});
      assert.equal(v.days,Math.floor(hours/24));assert.equal(v.ageDays,hours/24);
      assert.equal(v.ageDays>1,hours>24);assert.equal(v.ageDays>3,hours>72);
    }
  } finally {await f.close();}
});
test("two services and two locations of one project cannot confirm concurrently before journal preparation", async () => {
  const f=await fixture();let release, reached;
  const gate=new Promise(r=>release=r),paused=new Promise(r=>reached=r);
  try {
    const other=join(f.base,'other');await mkdir(other);await writeFile(join(other,'README.md'),'initial\n');
    const gitOther=async args=>(await exec('/usr/bin/git',[...identity,'-c','core.hooksPath=/dev/null','-c','commit.gpgSign=false',...args],{cwd:other,env:{...process.env,GIT_CONFIG_GLOBAL:'/dev/null',GIT_CONFIG_NOSYSTEM:'1'}})).stdout;
    await gitOther(['init','--template=','--initial-branch=main']);await gitOther(['add','README.md']);await gitOther(['commit','-m','other initial']);await writeFile(join(other,'README.md'),'updated\n');
    const dir=await projectDirectory([f.base],other);
    await f.repository.updateConnections(c=>({...c,projects:c.projects.map(p=>({...p,localPaths:[f.root,other],locations:[...p.locations,{path:other,status:'present',identity:dir.identity}]}))}));
    let armed=false;
    const first=createSavepoints(f.repository,{run:async(root,args,opts)=>{if(armed&&args[0]==='status'){armed=false;reached();await gate;}return run(root,args,opts);}}),second=createSavepoints(f.repository,{run});
    const a=await first.preview({projectId:'test-project',root:f.root,mode:'commit'}),b=await second.preview({projectId:'test-project',root:other,mode:'commit'});
    const input=p=>({id:p.id,files:['README.md'],message:'one project one operation',confirmed:true});
    armed=true;const writing=first.confirm(input(a));await paused;
    await assert.rejects(second.confirm(input(b)),/存档锁/);
    assert.equal((await gitOther(['rev-list','--count','HEAD'])).trim(),'1');
    release();assert.equal((await writing).state,'verified');
  } finally {release();await f.close();}
});
