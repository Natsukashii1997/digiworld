// 路线 v3 切片 2.1/2.2 的合成项目：在临时目录里现建 Git 仓库，不碰真实用户目录与 GitHub 账号。
// - 协同项目：有 CURRENT.md 协作状态表，刚提交，远程为（模拟的）私有 GitHub 仓库，工作区干净。
// - 无协议项目：没有 CURRENT.md，唯一提交在 30 天前，没有远程。
// - 泄露项目：跟踪了 .env 与 data/app.sqlite，远程为（模拟的）公开仓库，有 1 个未提交改动。
// - 文档项目：不是 Git 仓库，也没有 CURRENT.md，只有 package.json（活动时间读不到）。
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import {
  mkdtemp,
  mkdir,
  writeFile,
  rm,
  realpath,
  utimes,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { startServer } from "../server/http.mjs";
import { seed } from "../src/store.js";
import { stringify, parse } from "../src/serialization.js";

const exec = promisify(execFile);
const DAY = 86400000;
export const CURRENT_SAMPLE = `# 协同项目 · 唯一当前状态

## 协作状态

| 字段 | 当前值 |
|---|---|
| state_id | P-20260930-12 |
| 更新时间 | 2026-09-30 |
| 当前写入者 | **Codex（认领12：状态卡复核）** |
| 当前任务 | 复核状态卡 |
| 唯一下一步 | Claude 读回 12 并合入 |
| 最新交接 | [Codex 认领12](docs/handoffs/12.md)；[Claude 认领11](docs/handoffs/11.md) |

## 当前事实

- 其余正文不参与解析。
`;

async function git(cwd, args, date) {
  const stamp = date ? new Date(date).toISOString() : undefined;
  await exec(
    "/usr/bin/git",
    [
      "-c",
      "user.name=合成测试",
      "-c",
      "user.email=fixture@example.invalid",
      "-c",
      "commit.gpgsign=false",
      "-c",
      "init.defaultBranch=main",
      ...args,
    ],
    {
      cwd,
      env: {
        ...Object.fromEntries(
          Object.entries(process.env).filter(([k]) => !k.startsWith("GIT_")),
        ),
        GIT_CONFIG_GLOBAL: "/dev/null",
        GIT_CONFIG_NOSYSTEM: "1",
        ...(stamp
          ? { GIT_AUTHOR_DATE: stamp, GIT_COMMITTER_DATE: stamp }
          : {}),
      },
    },
  );
}

export async function buildProjects(base, now = Date.now()) {
  const projects = join(base, "projects");
  const collab = join(projects, "协同项目"),
    bare = join(projects, "无协议项目"),
    leaky = join(projects, "泄露项目"),
    docs = join(projects, "文档项目");
  for (const p of [collab, bare, leaky, docs]) await mkdir(p, { recursive: true });

  await writeFile(join(collab, "CURRENT.md"), CURRENT_SAMPLE);
  await writeFile(join(collab, "README.md"), "协同项目\n");
  await git(collab, ["init", "-q"]);
  await git(collab, ["remote", "add", "origin", "https://github.com/tester/collab.git"]);
  await git(collab, ["add", "-A"]);
  await git(collab, ["commit", "-q", "-m", "init"], now - 2 * 3600000);
  await utimes(join(collab, "CURRENT.md"), new Date(now - 3600000), new Date(now - 3600000));

  await writeFile(join(bare, "README.md"), "没有协同协议\n");
  await git(bare, ["init", "-q"]);
  await git(bare, ["add", "-A"]);
  await git(bare, ["commit", "-q", "-m", "init"], now - 30 * DAY);

  await writeFile(join(leaky, "README.md"), "泄露项目\n");
  await writeFile(join(leaky, ".env"), "TOKEN=synthetic-not-a-secret\n");
  await mkdir(join(leaky, "data"));
  await writeFile(join(leaky, "data", "app.sqlite"), "synthetic");
  await writeFile(join(leaky, "notes.md"), "普通文件\n");
  await git(leaky, ["init", "-q"]);
  await git(leaky, ["remote", "add", "origin", "git@github.com:tester/leaky.git"]);
  await git(leaky, ["add", "-A"]);
  await git(leaky, ["commit", "-q", "-m", "init"], now - DAY);
  await writeFile(join(leaky, "notes.md"), "普通文件（未提交的修改）\n");

  await writeFile(join(docs, "package.json"), "{}\n");
  return { projects, collab, bare, leaky, docs };
}

// 模拟 gh 的只读查询结果：collab 私有、leaky 公开、其他一律未知（拿不到）。
export const fakeVisibility = async (repoKey) =>
  repoKey === "tester/collab"
    ? { state: "private" }
    : repoKey === "tester/leaky"
      ? { state: "public" }
      : { state: "unknown", message: "未找到 GitHub CLI" };

export async function projectStatusFixture({ visibility = fakeVisibility } = {}) {
  const dir = await realpath(await mkdtemp(join(tmpdir(), "guiji-status-")));
  const paths = await buildProjects(dir);
  const app = await startServer({
    directory: join(dir, "data"),
    port: 0,
    staticRoot: join(import.meta.dirname, "../dist"),
    discovery: {
      defaultRoots: () => [paths.projects],
      scanGitHub: async () => ({
        status: "not_connected",
        items: [],
        truncated: false,
        message: "",
        at: new Date().toISOString(),
      }),
      detectAgents: async () => ({ items: [], at: new Date().toISOString() }),
      repoVisibility: visibility,
    },
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
  const call = async (path, data, method = data === undefined ? "GET" : "POST") => {
    const r = await fetch(app.url + "/api" + path, {
      method,
      headers,
      ...(data === undefined ? {} : { body: stringify(data) }),
    });
    return { status: r.status, body: parse(await r.text()) };
  };
  await call("/workspace", { state: seed(), initialize: true }, "PUT");
  const scanned = await call("/scan/projects", {});
  assert.equal(scanned.status, 200, JSON.stringify(scanned.body));
  const workspace = async () => (await call("/workspace")).body;
  const projectId = async (name) =>
    (await workspace()).connections.projects.find((p) => p.name === name)?.id;
  return {
    ...app,
    dir,
    paths,
    call,
    workspace,
    projectId,
    async close() {
      await app.close();
      await rm(dir, { recursive: true, force: true });
    },
  };
}
