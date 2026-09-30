import assert from "node:assert/strict";
import {
  mkdtemp,
  mkdir,
  writeFile,
  readFile,
  rename,
  realpath,
  rm,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { parseArgs, promisify } from "node:util";
import { execFile } from "node:child_process";
import { startServer } from "../server/http.mjs";
import { scanLocalProjects } from "../server/project-scan.mjs";
import { seed } from "../src/store.js";
import { parse, stringify } from "../src/serialization.js";

export const identityCurrent =
  "# P01 合成项目\n当前目标：核验项目身份\n下一步：只读对齐\n";
const git = promisify(execFile);

export async function projectIdentityFixture({
  staticRoot = process.env.GUIJI_TEST_DIST ||
    join(import.meta.dirname, "../dist"),
  port = 0,
} = {}) {
  const base = await realpath(
    await mkdtemp(join(tmpdir(), "guiji-identity-ui-")),
  );
  const root = join(base, "projects"),
    directory = join(base, "database");
  const original = join(root, "P01原项目");
  let offset = 0,
    app,
    headers,
    closed = false,
    parked = 0;
  const clock = () => Date.now() + offset;
  async function addProject(name, content = identityCurrent) {
    assert.match(name, /^[^/\\.][^/\\]*$/);
    const path = join(root, name);
    await mkdir(path, { recursive: true });
    await writeFile(join(path, "CURRENT.md"), content, { flag: "wx" });
    await writeFile(
      join(path, "AGENTS.md"),
      "仅合成测试，不授予外部动作权限。\n",
      { flag: "wx" },
    );
    return path;
  }
  await addProject("P01原项目");
  async function boot() {
    app = await startServer({
      directory,
      port,
      staticRoot,
      clock,
      discovery: {
        defaultRoots: () => [root],
        scanLocalProjects,
        scanGitHub: async () => ({
          status: "not_connected",
          login: "",
          items: [],
          truncated: false,
          message: "",
          at: new Date(clock()).toISOString(),
        }),
        detectAgents: async () => ({
          items: [],
          at: new Date(clock()).toISOString(),
        }),
      },
    });
    const session = await (
      await fetch(app.url + "/api/session", {
        headers: { "x-workbench-client": "1" },
      })
    ).json();
    headers = {
      "x-workbench-token": session.token,
      "content-type": "application/json",
    };
  }
  async function call(
    path,
    input,
    method = input === undefined ? "GET" : "POST",
  ) {
    const response = await fetch(app.url + "/api" + path, {
      method,
      headers,
      ...(input === undefined ? {} : { body: stringify(input) }),
    });
    return { status: response.status, body: parse(await response.text()) };
  }
  async function scan() {
    const result = await call("/scan/projects", {});
    assert.equal(result.status, 200, JSON.stringify(result.body));
    return result.body;
  }
  async function workspace() {
    const result = await call("/workspace");
    assert.equal(result.status, 200);
    return result.body;
  }
  async function projectAt(path) {
    const project = (await workspace()).connections.projects.find((p) =>
      p.localPaths.includes(path),
    );
    assert.ok(project, `Expected synthetic project at ${path}`);
    return project;
  }
  async function bind(projectId, path) {
    const input = {
      projectId,
      root: path,
      currentPath: "CURRENT.md",
      rulesPath: "AGENTS.md",
    };
    const preview = await call("/project-context/preview", input);
    assert.equal(preview.status, 200, JSON.stringify(preview.body));
    const result = await call("/project-context/bind", {
      ...input,
      fingerprint: preview.body.fingerprint,
      revision: (await workspace()).revision,
    });
    assert.equal(result.status, 200, JSON.stringify(result.body));
    return result.body;
  }
  try {
    await boot();
    const initialized = await call(
      "/workspace",
      { state: seed(), initialize: true },
      "PUT",
    );
    assert.equal(initialized.status, 200);
    await scan();
  } catch (error) {
    await app?.close();
    await rm(base, { recursive: true, force: true });
    throw error;
  }
  return {
    base,
    root,
    original,
    directory,
    staticRoot,
    get url() {
      return app.url;
    },
    get repository() {
      return app.repository;
    },
    call,
    scan,
    workspace,
    projectAt,
    bind,
    addProject,
    advance(ms) {
      offset += ms;
    },
    resetClock() {
      offset = 0;
    },
    async newVersion() {
      return app.repository.updateConnections((c) => ({ ...c }));
    },
    async unknownLocation(path) {
      assert.equal(path.startsWith(root + "/"), true);
      return app.repository.updateConnections((c) => ({
        ...c,
        projects: c.projects.map((project) => ({
          ...project,
          locations: project.locations?.map((location) =>
            location.path === path
              ? {
                  ...location,
                  status: "unknown",
                  checkedAt: new Date(clock()).toISOString(),
                  message: "合成观测暂时不可用，保留已发现的身份变化",
                }
              : location,
          ),
        })),
      }));
    },
    async move(path, name) {
      assert.equal(path.startsWith(root + "/"), true);
      assert.match(name, /^[^/\\.][^/\\]*$/);
      const destination = join(root, name);
      await rename(path, destination);
      return destination;
    },
    async replace(path) {
      assert.equal(path.startsWith(root + "/"), true);
      const content = await readFile(join(path, "CURRENT.md"), "utf8");
      const previous = join(base, `preserved-directory-${++parked}`);
      await rename(path, previous);
      await addProject(path.slice(root.length + 1), content);
      return previous;
    },
    async remote(path, repoKey) {
      assert.equal(path.startsWith(root + "/"), true);
      assert.match(repoKey, /^[a-zA-Z0-9_.-]+\/[a-zA-Z0-9_.-]+$/);
      const env = {
        ...Object.fromEntries(
          Object.entries(process.env).filter(
            ([key]) => !key.startsWith("GIT_"),
          ),
        ),
        GIT_CONFIG_NOSYSTEM: "1",
        GIT_CONFIG_GLOBAL: "/dev/null",
        GIT_TERMINAL_PROMPT: "0",
      };
      await git("/usr/bin/git", ["init", "--quiet", "--template=", path], {
        env,
      });
      await git(
        "/usr/bin/git",
        [
          "-C",
          path,
          "config",
          "--local",
          "remote.origin.url",
          `https://github.com/${repoKey}.git`,
        ],
        { env },
      );
    },
    async restart() {
      await app.close();
      await boot();
    },
    async close() {
      if (closed) return;
      closed = true;
      await app.close();
      await rm(base, { recursive: true, force: true });
    },
  };
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  const { values } = parseArgs({
    options: {
      dist: { type: "string" },
      port: { type: "string", default: "0" },
    },
  });
  const app = await projectIdentityFixture({
    staticRoot: values.dist,
    port: Number(values.port),
  });
  console.log(
    JSON.stringify({
      url: app.url,
      base: app.base,
      original: app.original,
      projectId: (await app.projectAt(app.original)).id,
      staticRoot: app.staticRoot,
    }),
  );
  for (const signal of ["SIGINT", "SIGTERM"])
    process.once(signal, async () => {
      await app.close();
      process.exit(0);
    });
}
