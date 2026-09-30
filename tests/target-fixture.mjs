import {
  mkdtemp,
  mkdir,
  readFile,
  realpath,
  rm,
  writeFile,
} from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { pathToFileURL } from "node:url";
import { startServer } from "../server/http.mjs";
import { seed } from "../src/store.js";
import { parse, stringify } from "../src/serialization.js";

// Public filesystem/API fixture; never inspects or changes a real Agent Home.
export async function targetFixture() {
  const root = await realpath(
    await mkdtemp(join(tmpdir(), "guiji-target-browser-")),
  );
  const programRoot = join(root, "synthetic-programs");
  const home = join(root, "synthetic-user", ".codex");
  const profile = join(
    root,
    "synthetic-user",
    ".codex-work-profile-with-a-long-directory-name",
  );
  const sourceSentinel = "隔离配置哨兵：目标关联不应读取或修改此配置。\n";
  for (const directory of [
    programRoot,
    join(home, "skills"),
    join(profile, "skills"),
  ])
    await mkdir(directory, { recursive: true });
  await writeFile(join(home, "config.toml"), sourceSentinel);
  const programs = [
    {
      id: "fixture-cli",
      path: join(programRoot, "codex"),
      kind: "CLI",
      status: "present",
      version: {
        status: "known",
        value: "0.154.0",
        source: "安装包",
        evidencePath: join(programRoot, "package.json"),
        message: "",
      },
    },
    {
      id: "fixture-app",
      path: join(programRoot, "Codex Desktop.app"),
      kind: "App",
      status: "present",
      version: {
        status: "unknown",
        value: "",
        source: "",
        evidencePath: "",
        message: "无可核验安装元数据",
      },
    },
  ];
  for (const program of programs)
    await writeFile(program.path, "SYNTHETIC PROGRAM - NEVER EXECUTE\n");
  let mode = "success";
  let now = Date.now();
  let pending;
  const stamp = () => new Date(now).toISOString();
  function inventory(agentId) {
    return {
      agentId,
      at: stamp(),
      homes: [
        {
          id: "fixture-default",
          path: home,
          label: "默认 Home",
          source: "默认目录",
          status: "present",
          skills: [
            {
              path: join(home, "skills"),
              label: "个人 Skill 目录",
              status: "present",
              scope: "home",
            },
          ],
          errors: [],
        },
        {
          id: "fixture-profile",
          path: profile,
          label: "工作 Profile",
          source: "命名 Profile",
          status: "present",
          skills: [],
          errors: [],
        },
        {
          id: "fixture-missing",
          path: join(root, "missing-home"),
          label: "缺失 Home",
          source: "目录候选",
          status: "missing",
          skills: [],
          errors: [],
        },
        {
          id: "fixture-shared",
          path: join(root, "shared-skills"),
          label: "共享用户资产",
          source: "用户共享资产",
          status: "present",
          skills: [],
          errors: [],
        },
      ],
      errors: [],
      truncated: false,
    };
  }
  const app = await startServer({
    directory: join(root, "database"),
    port: 0,
    staticRoot: join(import.meta.dirname, "../dist"),
    clock: () => now,
    discovery: {
      defaultRoots: () => [],
      detectAgents: async () => ({
        at: stamp(),
        items: [
          {
            id: "codex",
            name: "Codex",
            kind: "开发 Agent",
            status: "detected",
            programs: programs.map(({ path, kind }) => ({ path, kind })),
            configFound: true,
            errors: [],
          },
        ],
      }),
      inspectAgentPrograms: async () => structuredClone(programs),
      inspectAgentInventory: async (agentId) => {
        if (mode === "failure")
          throw Object.assign(new Error("合成目标目录暂不可读"), {
            status: 503,
          });
        if (mode === "pending")
          await new Promise((resolve) => {
            pending = resolve;
          });
        const value = inventory(agentId);
        if (mode === "partial") {
          value.homes = value.homes.slice(0, 1);
          value.errors = [{ path: profile, message: "合成 Profile 枚举失败" }];
        }
        if (mode === "missing") value.homes[0].status = "missing";
        if (mode === "profile-missing") value.homes[1].status = "missing";
        if (mode === "truncated") value.truncated = true;
        return value;
      },
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
  const call = async (
    path,
    data,
    method = data === undefined ? "GET" : "POST",
  ) => {
    const response = await fetch(app.url + "/api" + path, {
      method,
      headers,
      ...(data === undefined ? {} : { body: stringify(data) }),
    });
    const result = parse(await response.text());
    if (!response.ok)
      throw Object.assign(
        new Error(result.error || `HTTP ${response.status}`),
        { status: response.status },
      );
    return result;
  };
  await call(
    "/workspace",
    { state: { ...seed(), assets: [] }, initialize: true },
    "PUT",
  );
  await call("/scan/agents", {});
  return {
    ...app,
    root,
    home,
    profile,
    programs,
    call,
    setMode(value) {
      mode = value;
    },
    advance(ms) {
      now += ms;
    },
    release() {
      const resolve = pending;
      pending = null;
      resolve?.();
    },
    async sourceUnchanged() {
      if (
        (await readFile(join(home, "config.toml"), "utf8")) !== sourceSentinel
      )
        return false;
      for (const program of programs)
        if (
          (await readFile(program.path, "utf8")) !==
          "SYNTHETIC PROGRAM - NEVER EXECUTE\n"
        )
          return false;
      return true;
    },
    async close() {
      pending?.();
      await app.close();
      await rm(root, { recursive: true, force: true });
    },
  };
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  const fixture = await targetFixture();
  console.log(
    JSON.stringify({ url: fixture.url, root: fixture.root, pid: process.pid }),
  );
  let closing = false;
  for (const signal of ["SIGINT", "SIGTERM"])
    process.on(signal, async () => {
      if (closing) return;
      closing = true;
      await fixture.close();
      process.exit(0);
    });
}
