import {
  mkdtemp,
  mkdir,
  writeFile,
  readFile,
  realpath,
  rm,
  chmod,
} from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { pathToFileURL } from "node:url";
import { startServer } from "../server/http.mjs";
import { inspectAgentInventory } from "../server/agent-inventory.mjs";
import { makeAsset, seed, revise } from "../src/store.js";
import { parse, stringify } from "../src/serialization.js";

export async function copyFixture({ staticRoot } = {}) {
  const base = await realpath(await mkdtemp(join(tmpdir(), "guiji-copy-ui-")));
  const user = join(base, "synthetic-user");
  const home = join(user, ".codex");
  const root = join(home, "skills");
  const location = join(
    root,
    "copy-sample-with-a-deliberately-long-unbroken-segment-abcdefghijklmnopqrstuvwxyz",
  );
  const alternate = join(root, "other-candidate");
  const content =
    "---\nname: copy-sample\ndescription: 隔离副本测试\n---\n# 原始版本\n只读核对，不执行。\n";
  const binary = new Uint8Array([0, 128, 255]);
  for (const directory of [
    join(location, "assets"),
    join(location, "empty"),
    alternate,
  ]) {
    await mkdir(directory, { recursive: true });
    await chmod(directory, 0o755);
  }
  await writeFile(join(location, "SKILL.md"), content, { mode: 0o644 });
  await writeFile(join(location, "assets", "sample.bin"), binary, {
    mode: 0o644,
  });
  await writeFile(join(alternate, "SKILL.md"), "# 另一候选\n", { mode: 0o644 });
  const sentinel = "配置哨兵，不允许读取或修改真实配置。\n";
  await writeFile(join(home, "config.toml"), sentinel);
  const program = {
    id: "synthetic-codex",
    path: join(base, "codex"),
    kind: "CLI",
    status: "present",
    identity: "synthetic-program-identity",
    version: {
      status: "known",
      value: "0.154.0",
      source: "合成安装包",
      evidencePath: "",
      message: "",
    },
  };
  await writeFile(program.path, "SYNTHETIC - NEVER EXECUTE\n");
  const asset = makeAsset({
    type: "Skill",
    title: "副本核对测试",
    content,
    files: [
      { path: "SKILL.md", text: true, data: content, mode: 0o644 },
      {
        path: "assets",
        directory: true,
        text: false,
        data: new Uint8Array(),
        mode: 0o755,
      },
      { path: "assets/sample.bin", text: false, data: binary, mode: 0o644 },
      {
        path: "empty",
        directory: true,
        text: false,
        data: new Uint8Array(),
        mode: 0o755,
      },
    ],
  });
  asset.id = "copy-test-asset";
  asset.versions[0].id = "copy-version-one";
  let offset = 0,
    mode = "success";
  const clock = () => Date.now() + offset;
  const app = await startServer({
    directory: join(base, "database"),
    port: 0,
    staticRoot: staticRoot || join(import.meta.dirname, "../dist"),
    clock,
    discovery: {
      defaultRoots: () => [],
      detectAgents: async () => ({
        at: new Date(clock()).toISOString(),
        items: [
          {
            id: "codex",
            name: "Codex",
            kind: "开发 Agent",
            status: "detected",
            programs: [{ path: program.path, kind: program.kind }],
            configFound: true,
            errors: [],
          },
        ],
      }),
      inspectAgentPrograms: async () => [structuredClone(program)],
      inspectAgentInventory: async (agentId) => {
        if (mode === "failure")
          throw Object.assign(new Error("合成目录读取失败"), { status: 503 });
        const value = await inspectAgentInventory(agentId, {
          home: user,
          environment: {},
        });
        if (mode === "partial")
          value.errors.push({ path: root, message: "合成目录检查不完整" });
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
  let target;
  try {
    await call(
      "/workspace",
      { state: { ...seed(), assets: [asset] }, initialize: true },
      "PUT",
    );
    await call("/scan/agents", {});
    const options = await call("/agent-targets/options", { agentId: "codex" });
    const targetState = await call("/agent-targets/save", {
      token: options.token,
      label: "隔离 Codex",
      programId: program.id,
      homeId: options.homes.find((h) => h.path === home).id,
      revision: options.revision,
    });
    target = targetState.connections.agentTargets[0];
  } catch (error) {
    await app.close();
    await rm(base, { recursive: true, force: true });
    throw error;
  }
  return {
    ...app,
    base,
    user,
    home,
    root,
    location,
    alternate,
    asset,
    target,
    content,
    call,
    setMode(value) {
      mode = value;
    },
    advance(ms) {
      offset += ms;
    },
    async changeSource() {
      await writeFile(
        join(location, "SKILL.md"),
        content + "\n新增了本机内容。\n",
      );
    },
    async restoreSource() {
      await writeFile(join(location, "SKILL.md"), content);
    },
    async newVersion() {
      const state = await call("/workspace");
      const original = state.assets.find((a) => a.id === asset.id);
      const next = revise(original, {
        content: content + "\n资产新版。\n",
        files: original.versions[0].files.map((f) =>
          f.path === "SKILL.md"
            ? { ...f, data: content + "\n资产新版。\n" }
            : f,
        ),
      });
      return call(
        "/workspace",
        {
          state: {
            ...state,
            assets: state.assets.map((a) => (a.id === asset.id ? next : a)),
          },
        },
        "PUT",
      );
    },
    async sourceUnchanged() {
      return (
        (await readFile(join(home, "config.toml"), "utf8")) === sentinel &&
        (await readFile(join(location, "SKILL.md"), "utf8")) === content
      );
    },
    async close() {
      await app.close();
      await rm(base, { recursive: true, force: true });
    },
  };
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  const app = await copyFixture();
  console.log(
    JSON.stringify({ url: app.url, root: app.base, pid: process.pid }),
  );
  let closing = false;
  for (const signal of ["SIGINT", "SIGTERM"])
    process.on(signal, async () => {
      if (closing) return;
      closing = true;
      await app.close();
      process.exit(0);
    });
}
