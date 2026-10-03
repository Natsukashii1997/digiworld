// 项目空间第二批（GitHub 面板 + 每日项目简报）的合成环境：
// - 沿用 2.1/2.2 的四个合成 Git 仓库（见 project-status-fixture.mjs），在临时目录现建；
// - “协同项目”换成带今天状态标题的 CURRENT.md，并在统计区间内加入交接文档与 3 个新提交；
// - gh 用本地桩脚本代替：按 data.json 返回合成 JSON，把每次调用的参数记到 calls.jsonl；
//   mode 文件可切到“未登录”“输出损坏”。全程不调用真实 GitHub、不读任何凭据。
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import {
  mkdtemp,
  mkdir,
  writeFile,
  readFile,
  rm,
  realpath,
  chmod,
  utimes,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { startServer } from "../server/http.mjs";
import { createGhRunner } from "../server/project-github.mjs";
import { seed } from "../src/store.js";
import { stringify, parse } from "../src/serialization.js";
import { buildProjects, fakeVisibility } from "./project-status-fixture.mjs";

const exec = promisify(execFile);
export const HOUR = 3600000;
export const DAY = 24 * HOUR;

const pad = (n) => String(n).padStart(2, "0");
export const ymd = (ms) => {
  const d = new Date(ms);
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}`;
};
export const isoDay = (ms) => {
  const d = new Date(ms);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

// 今天的状态标题（日期随运行日变化，保证落在“昨天 0 点至今”的统计区间内）。
export function briefCurrent(now) {
  return `# 合成协同项目 · 唯一当前状态

## 协作状态

| 字段 | 当前值 |
|---|---|
| state_id | P-${ymd(now)}-21 |
| 当前写入者 | 无 |
| 唯一下一步 | Codex 复核 21 号 GitHub 面板 |
| 最新交接 | [Claude 实现 21](docs/agents/handoffs/${isoDay(now)}-claude-21.md) |

## Claude 认领 19（P-20250101-19）

- 很早以前的一节，不在统计区间内。

## Claude 实现 GitHub 面板（P-${ymd(now)}-21）

- 今天的一节。
`;
}

// 合成 GitHub 数据：以运行时刻为基准生成时间，保证“区间内 / 区间外”稳定。
export function ghData(now) {
  const at = (ms) => new Date(now - ms).toISOString();
  return {
    "tester/collab": {
      repo: { default_branch: "main", private: true },
      open: [
        {
          number: 7,
          title: "状态卡返修",
          url: "https://github.com/tester/collab/pull/7",
          isDraft: false,
          author: { login: "tester" },
          createdAt: at(3 * HOUR),
          updatedAt: at(2 * HOUR),
        },
        {
          number: 5,
          title: "很早的草稿",
          url: "https://github.com/tester/collab/pull/5",
          isDraft: true,
          author: { login: "tester" },
          createdAt: at(10 * DAY),
          updatedAt: at(9 * DAY),
        },
      ],
      merged: [
        {
          number: 6,
          title: "接入停滞雷达",
          url: "https://github.com/tester/collab/pull/6",
          mergedAt: at(5 * HOUR),
        },
        {
          number: 4,
          title: "初始化",
          url: "https://github.com/tester/collab/pull/4",
          mergedAt: at(20 * DAY),
        },
      ],
      issues: [
        {
          number: 3,
          title: "状态卡在窄屏折行",
          url: "https://github.com/tester/collab/issues/3",
          createdAt: at(4 * DAY),
          updatedAt: at(4 * DAY),
        },
      ],
      runs: [
        {
          databaseId: 902,
          workflowName: "CI",
          headBranch: "main",
          status: "completed",
          conclusion: "failure",
          event: "push",
          createdAt: at(90 * 60000),
          updatedAt: at(HOUR),
          url: "https://github.com/tester/collab/actions/runs/902",
        },
        {
          databaseId: 901,
          workflowName: "CI",
          headBranch: "main",
          status: "completed",
          conclusion: "success",
          event: "push",
          createdAt: at(3 * DAY),
          updatedAt: at(3 * DAY),
          url: "https://github.com/tester/collab/actions/runs/901",
        },
      ],
    },
    // 泄露项目：GitHub 返回 403（无权限）。
    "tester/leaky": "denied",
  };
}

// gh 桩：只认 api GET / pr list / issue list / run list 四种调用；其余一律按未知子命令失败。
const STUB = `
const fs = require("fs");
const path = require("path");
const dir = __dirname;
const args = process.argv.slice(2);
fs.appendFileSync(path.join(dir, "calls.jsonl"), JSON.stringify(args) + "\\n");
let mode = "ok";
try { mode = fs.readFileSync(path.join(dir, "mode"), "utf8").trim(); } catch {}
if (mode === "auth") {
  process.stderr.write("To get started with GitHub CLI, please run:  gh auth login\\n");
  process.exit(4);
}
if (mode === "garbage") { process.stdout.write("<html>not json"); process.exit(0); }
const data = JSON.parse(fs.readFileSync(path.join(dir, "data.json"), "utf8"));
const flag = (name) => { const i = args.indexOf(name); return i === -1 ? undefined : args[i + 1]; };
const key = args[0] === "api" ? String(args.at(-1)).replace(/^repos\\//, "") : flag("--repo");
const repo = data[key];
if (!repo) { process.stderr.write("HTTP 404: Not Found (https://api.github.com/repos/" + key + ")\\n"); process.exit(1); }
if (repo === "denied") { process.stderr.write("HTTP 403: Resource not accessible by integration\\n"); process.exit(1); }
const limit = Number(flag("--limit") || 1000);
const out = (v) => { process.stdout.write(JSON.stringify(v)); process.exit(0); };
if (args[0] === "api" && flag("--method") === "GET") out(repo.repo);
if (args[0] === "pr" && args[1] === "list") {
  if (repo.failPulls) { process.stderr.write("GraphQL: something went wrong\\n"); process.exit(1); }
  out((flag("--state") === "merged" ? repo.merged : repo.open).slice(0, limit));
}
if (args[0] === "issue" && args[1] === "list") out(repo.issues.slice(0, limit));
if (args[0] === "run" && args[1] === "list") {
  if (repo.failRuns) { process.stderr.write("HTTP 500: server error\\n"); process.exit(1); }
  out(repo.runs.filter((r) => r.headBranch === flag("--branch")).slice(0, limit));
}
process.stderr.write("unknown command " + args.join(" ") + "\\n");
process.exit(1);
`;

export async function writeGhStub(dir, data) {
  await mkdir(dir, { recursive: true });
  const path = join(dir, "gh");
  await writeFile(path, `#!${process.execPath}\n${STUB}`);
  await chmod(path, 0o755);
  await writeFile(join(dir, "data.json"), JSON.stringify(data));
  return {
    path,
    dir,
    async mode(value) {
      await writeFile(join(dir, "mode"), value);
    },
    async data(value) {
      await writeFile(join(dir, "data.json"), JSON.stringify(value));
    },
    async calls() {
      try {
        return (await readFile(join(dir, "calls.jsonl"), "utf8"))
          .split("\n")
          .filter(Boolean)
          .map((l) => JSON.parse(l));
      } catch (e) {
        if (e.code === "ENOENT") return [];
        throw e;
      }
    },
  };
}

export async function git(cwd, args, date) {
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
        ...(stamp ? { GIT_AUTHOR_DATE: stamp, GIT_COMMITTER_DATE: stamp } : {}),
      },
    },
  );
}

// 在 2.1/2.2 的合成仓库上补出“昨天到今天”的变化：协同项目有今天的状态标题、1 份新交接、
// 1 份区间外的旧交接（修改时间是新的，但文件名日期早于昨天，模拟重新检出）、3 个新提交。
export async function buildBriefProjects(base, now = Date.now()) {
  const paths = await buildProjects(base, now);
  const { collab } = paths;
  await writeFile(join(collab, "CURRENT.md"), briefCurrent(now));
  const handoffs = join(collab, "docs", "agents", "handoffs");
  await mkdir(handoffs, { recursive: true });
  const fresh = `${isoDay(now)}-claude-21.md`;
  await writeFile(join(handoffs, fresh), "# 合成交接 21\n\nBODY-MARKER 正文不应出现在简报里。\n");
  await writeFile(join(handoffs, "2025-01-01-claude-19.md"), "# 旧交接\n");
  await git(collab, ["add", "-A"]);
  await git(collab, ["commit", "-q", "-m", "交接 21"], now - 50 * 60000);
  for (const [i, ago] of [
    [1, 40 * 60000],
    [2, 30 * 60000],
  ]) {
    await writeFile(join(collab, `step-${i}.md`), `第 ${i} 步\n`);
    await git(collab, ["add", "-A"]);
    await git(collab, ["commit", "-q", "-m", `第 ${i} 步`], now - ago);
  }
  const t = new Date(now - 20 * 60000);
  await utimes(join(collab, "CURRENT.md"), t, t);
  return { ...paths, freshHandoff: fresh };
}

export async function projectBriefFixture({ clock, visibility = fakeVisibility } = {}) {
  const now = clock ? clock() : Date.now();
  const dir = await realpath(await mkdtemp(join(tmpdir(), "guiji-brief-")));
  const paths = await buildBriefProjects(dir, now);
  const gh = await writeGhStub(join(dir, "gh-stub"), ghData(now));
  const app = await startServer({
    directory: join(dir, "data"),
    port: 0,
    staticRoot: join(import.meta.dirname, "../dist"),
    ...(clock ? { clock } : {}),
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
      githubCli: createGhRunner({ paths: [gh.path] }),
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
  async function mark(name, active = true) {
    const ws = await workspace();
    const r = await call("/project-status/mark", {
      projectId: await projectId(name),
      active,
      revision: ws.revision,
    });
    assert.equal(r.status, 200, JSON.stringify(r.body));
  }
  return {
    ...app,
    dir,
    paths,
    gh,
    now,
    call,
    workspace,
    projectId,
    mark,
    async close() {
      await app.close();
      await rm(dir, { recursive: true, force: true });
    },
  };
}
