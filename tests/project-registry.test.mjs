import test from "node:test";
import assert from "node:assert/strict";
import { mergeProjects } from "../server/discovery.mjs";

test("同路径换目录时不使用新目录的 remote 改写或合并原项目", () => {
  const a = {
    id: "a",
    name: "甲",
    repoKey: "owner/a",
    localPaths: ["/projects/a"],
    locations: [
      { path: "/projects/a", status: "present", identity: "a".repeat(64) },
    ],
  };
  const b = {
    id: "b",
    name: "乙",
    repoKey: "owner/b",
    localPaths: [],
    githubUrl: "https://github.com/owner/b",
  };
  const observed = [
    { path: "/projects/a", status: "present", identity: "b".repeat(64) },
  ];
  const result = mergeProjects([a, b], [{ ...a, repoKey: "owner/b" }], [], {
    locations: observed,
  });
  assert.equal(result.length, 2);
  assert.equal(result.find((p) => p.id === "a").repoKey, "owner/a");
  assert.equal(result.find((p) => p.id === "a").locations[0].status, "changed");
});

test("本地项目后补 GitHub 关联保留已有 Current 的稳定项目 ID", () => {
  const local = {
    id: "local-a",
    name: "本地项目",
    localPaths: ["/projects/a"],
    repoKey: "",
  };
  const remote = {
    id: "github-b",
    name: "远端项目",
    localPaths: [],
    repoKey: "owner/repo",
    githubUrl: "https://github.com/owner/repo",
  };
  const result = mergeProjects(
    [local, remote],
    [{ ...local, repoKey: "owner/repo" }],
    [remote],
    { protectedIds: [local.id] },
  );
  assert.equal(result.length, 1);
  assert.equal(result[0].id, "local-a");
  assert.deepEqual(result[0].localPaths, ["/projects/a"]);
});

test("逐目录观测区分缺失、未核实和更换；重复扫描不能自动接纳新目录身份", () => {
  const identity = "a".repeat(64),
    replacement = "b".repeat(64);
  const project = {
    id: "a",
    name: "项目",
    repoKey: "",
    localPaths: ["/projects/a", "/projects/old"],
    locations: [{ path: "/projects/a", status: "present", identity }],
  };
  const local = {
    id: "new",
    name: "项目",
    repoKey: "",
    localPaths: ["/projects/a"],
  };
  const locations = [
    {
      path: "/projects/a",
      status: "present",
      identity: replacement,
      checkedAt: "2026-09-26T12:00:00Z",
    },
    {
      path: "/projects/old",
      status: "missing",
      checkedAt: "2026-09-26T12:00:00Z",
    },
  ];
  let result = mergeProjects([project], [local], [], { locations });
  assert.equal(
    result[0].locations.find((l) => l.path === "/projects/a").status,
    "changed",
  );
  assert.equal(
    result[0].locations.find((l) => l.path === "/projects/a").identity,
    identity,
  );
  assert.equal(
    result[0].locations.find((l) => l.path === "/projects/old").status,
    "missing",
  );
  result = mergeProjects(result, [local], [], { locations });
  assert.equal(result[0].locations[0].status, "changed");
  const unknown = mergeProjects(result, [], [], { locations: [] });
  assert.equal(unknown[0].locations[0].status, "unknown");
  assert.equal(unknown[0].locations[0].observedIdentity, replacement);
  assert.equal(unknown[0].locations[1].status, "unknown");
});

test("两个已有 Current 的项目同 remote 时保留两 ID 和各自目录，不按扫描顺序吞并", () => {
  const a = { id: "a", name: "甲", localPaths: ["/projects/a"], repoKey: "" };
  const b = {
    id: "b",
    name: "乙",
    localPaths: ["/projects/b"],
    repoKey: "owner/repo",
  };
  const locals = [{ ...a, repoKey: "owner/repo" }, b];
  for (const ordered of [locals, [...locals].reverse()]) {
    const result = mergeProjects([a, b], ordered, [], {
      protectedIds: ["a", "b"],
    });
    assert.equal(result.length, 2);
    assert.deepEqual(result.find((p) => p.id === "a").localPaths, [
      "/projects/a",
    ]);
    assert.deepEqual(result.find((p) => p.id === "b").localPaths, [
      "/projects/b",
    ]);
    assert.ok(result.every((p) => p.identityConflict));
  }
});
