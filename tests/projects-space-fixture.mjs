// 项目空间第二版的合成环境：临时目录里现建 Git 仓库（见 project-status-fixture.mjs）、合成名册、合成项目卡与 gh 桩。
// 不读真实名册、Vault、~/.claude、~/.codex 与 data/。接口测试与浏览器测试共用。
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, rm, realpath } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { startServer } from "../server/http.mjs";
import { seed } from "../src/store.js";
import { stringify, parse } from "../src/serialization.js";
import { buildProjects } from "./project-status-fixture.mjs";

export async function spaceFixture({ roster, gh, staticRoot, skillUsage } = {}) {
  const dir = await realpath(await mkdtemp(join(tmpdir(), "projects-space-")));
  const paths = await buildProjects(dir);
  const outside = join(dir, "没扫描的项目");
  await mkdir(outside);
  const rosterPath = join(dir, "projects.json");
  await writeFile(rosterPath, JSON.stringify(roster ?? { projects: [
    { id: "collab", name: "协同项目", path: paths.collab, card: "10 项目/协同.md", github: "tester/collab" },
    { id: "bare", name: "无协议项目", path: paths.bare },
    { id: "leaky", name: "泄露项目", path: paths.leaky },
    { id: "docs", name: "文档项目", path: paths.docs },
    { id: "gone", name: "已删项目", path: join(dir, "不存在") },
    { id: "outside", name: "没扫描", path: outside },
  ] }));
  const calls = [];
  const fakeGh = gh ?? (async (args) => {
    calls.push(args);
    const repo = args.find((a) => /^tester\//.test(a)) || args.at(-1).replace(/^repos\//, "");
    if (repo.includes("leaky")) throw Object.assign(new Error("HTTP 502"), { code: 1, stderr: "HTTP 502" });
    if (args[0] === "api") return JSON.stringify({ default_branch: "main", private: true });
    if (args[0] === "pr") return args.includes("open") ? JSON.stringify([{ number: 7, title: "PR", url: "https://github.com/tester/collab/pull/7" }]) : "[]";
    if (args[0] === "issue") return JSON.stringify([
      { number: 5, title: "待人验", labels: [{ name: "ready-for-human" }] },
      { number: 3, title: "修窄屏", url: "https://github.com/tester/collab/issues/3", labels: [{ name: "ready-for-agent" }] },
      { number: 8, title: "未分流", labels: [{ name: "needs-triage" }] },
    ]);
    return "[]";
  });
  const app = await startServer({
    directory: join(dir, "data"),
    port: 0,
    staticRoot: staticRoot ?? join(dir, "static"),
    discovery: {
      defaultRoots: () => [paths.projects],
      scanGitHub: async () => ({ status: "not_connected", items: [], truncated: false, message: "", at: new Date().toISOString() }),
      detectAgents: async () => ({ items: [], at: new Date().toISOString() }),
      repoVisibility: async () => ({ state: "unknown" }),
      githubCli: fakeGh,
      ...(skillUsage ? { skillUsage } : {}),
      projectsSpace: {
        rosterPath,
        readCard: async (card) => (card ? { state: "ok", one: "合成一句话", goal: "合成目标", not: "合成不做", url: "obsidian://x" } : { state: "absent" }),
      },
    },
  });
  const session = await (await fetch(app.url + "/api/session", { headers: { "x-workbench-client": "1" } })).json();
  const headers = { "x-workbench-token": session.token, "content-type": "application/json" };
  const call = async (path, data, method = data === undefined ? "GET" : "POST") => {
    const r = await fetch(app.url + "/api" + path, { method, headers, ...(data === undefined ? {} : { body: stringify(data) }) });
    return { status: r.status, body: parse(await r.text()) };
  };
  await call("/workspace", { state: seed(), initialize: true }, "PUT");
  assert.equal((await call("/scan/projects", {})).status, 200);
  return { ...app, dir, paths, call, calls, rosterPath, async close() { await app.close(); await rm(dir, { recursive: true, force: true }); } };
}

