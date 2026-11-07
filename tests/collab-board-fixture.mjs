// 路线 v3 切片 2.3/2.4 的合成项目：沿用 2.1/2.2 的四个合成 Git 仓库，
// 再把“协同项目”的 CURRENT.md 换成带状态链标题的版本，并加入合成交接文档。
// 全部在临时目录现建，不碰真实用户目录、GitHub 账号或真实主库。
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import {
  mkdtemp,
  mkdir,
  writeFile,
  rm,
  realpath,
  symlink,
  utimes,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { startServer } from "../server/http.mjs";
import { seedProjects } from "./seed-projects.mjs";
import { seed } from "../src/store.js";
import { stringify, parse } from "../src/serialization.js";
import { buildProjects, fakeVisibility } from "./project-status-fixture.mjs";

const exec = promisify(execFile);

export const BOARD_CURRENT = `# 合成协同项目 · 唯一当前状态

## 协作状态

| 字段 | 当前值 |
|---|---|
| state_id | P-20260930-14 |
| 当前写入者 | 无 |
| 当前任务 | 状态卡返修已交接 |
| 唯一下一步 | Codex 读回 14，独立复核状态卡返修 |
| 最新交接 | [Claude 返修 14](docs/agents/handoffs/2026-09-30-claude-14.md)；[Codex 复核 13](docs/agents/handoffs/2026-09-30-codex-review-13.md) |

## 当前事实

- 正文不参与阶段推断。

## Claude 认领 11（P-20260929-11）

- 登记写入者。

## Claude 实现状态卡（P-20260929-12）

- 实现完成。

## Codex 独立复核（P-20260930-13）

- 两项返修。

## Claude 返修（P-20260930-14）

- 返修完成，待复核。
`;

export const HANDOFF_FILES = [
  "2026-09-29-claude-11.md",
  "2026-09-29-claude-12.md",
  "2026-09-30-codex-review-13.md",
  "2026-09-30-claude-14.md",
];

async function git(cwd, args) {
  await exec(
    "/usr/bin/git",
    [
      "-c",
      "user.name=合成测试",
      "-c",
      "user.email=fixture@example.invalid",
      "-c",
      "commit.gpgsign=false",
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
      },
    },
  );
}

export async function buildBoardProjects(base, now = Date.now()) {
  const paths = await buildProjects(base, now);
  const handoffs = join(paths.collab, "docs", "agents", "handoffs");
  await mkdir(handoffs, { recursive: true });
  await writeFile(join(paths.collab, "CURRENT.md"), BOARD_CURRENT);
  await writeFile(join(paths.collab, "AGENTS.md"), "# 合成入口\n先读 CURRENT.md。\n");
  await writeFile(join(paths.collab, "COLLABORATION.md"), "# 合成协作规则\n");
  for (const [i, name] of HANDOFF_FILES.entries()) {
    const file = join(handoffs, name);
    // 正文是私人交接内容的替身：工作台只读文件名与修改时间，不应出现在任何接口结果里。
    await writeFile(file, `# 合成交接 ${i}\n正文不应被工作台读取：BODY-MARKER-${i}\n`);
    const at = new Date(now - (HANDOFF_FILES.length - i) * 3600000);
    await utimes(file, at, at);
  }
  // 不是 .md 的文件与指向项目外的符号链接都不进时间线。
  await writeFile(join(handoffs, "notes.txt"), "不是交接文档\n");
  await symlink("../../../README.md", join(handoffs, "2026-09-30-link.md"));
  await git(paths.collab, ["add", "-A"]);
  await git(paths.collab, ["commit", "-q", "-m", "board"]);
  return paths;
}

export async function collabBoardFixture({ visibility = fakeVisibility, clock = Date.now } = {}) {
  const dir = await realpath(await mkdtemp(join(tmpdir(), "guiji-board-")));
  const paths = await buildBoardProjects(dir);
  const app = await startServer({
    clock,
    directory: join(dir, "data"),
    port: 0,
    staticRoot: process.env.WORKBENCH_TEST_STATIC_ROOT || join(import.meta.dirname, "../dist"),
    discovery: {
      defaultRoots: () => [paths.projects],
      detectAgents: async () => ({ items: [], at: new Date().toISOString() }),
      repoVisibility: visibility,
    },
  });
  // 准备步骤失败时也关掉已启动的服务并清理，否则监听句柄让整个测试文件永不退出。
  try {
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
    await seedProjects(app.repository, { roots: [paths.projects] });
    const workspace = async () => (await call("/workspace")).body;
    const projectId = async (name) =>
      (await workspace()).connections.projects.find((p) => p.name === name)?.id;
    async function mark(name, active = true) {
      const ws = await workspace();
      const r = await call("/project-status/mark", {
        projectId: await projectId(name),
        active,
        revision: ws.revision,
      });
      assert.equal(r.status, 200, JSON.stringify(r.body));
      return r.body;
    }
    return {
      ...app,
      dir,
      paths,
      call,
      workspace,
      projectId,
      mark,
      async close() {
        await app.close();
        await rm(dir, { recursive: true, force: true });
      },
    };
  } catch (error) {
    await app.close().catch(() => {}); await rm(dir, { recursive: true, force: true });
    throw error;
  }
}
