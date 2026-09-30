import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { startServer } from "../server/http.mjs";

export async function fixture({ discovery = {} } = {}) {
  const directory = await mkdtemp(join(tmpdir(), "guiji-ui-"));
  const calls = { projects: 0, agents: 0 };
  const stamp = () => new Date().toISOString();
  const app = await startServer({
    directory,
    port: 0,
    staticRoot: join(import.meta.dirname, "../dist"),
    discovery: {
      inspectAgentInventory: async (agentId) => ({
        agentId,
        at: stamp(),
        homes: [],
        errors: [],
        truncated: false,
      }),
      defaultRoots: () => ["/fixture/projects", "/fixture/work"],
      scanLocalProjects: async () => {
        calls.projects++;
        return {
          items: [
            {
              id: "project-a",
              name: "我的网站",
              kind: "Git",
              repoKey: "tester/website",
              localPaths: ["/fixture/projects/website"],
              branch: "main",
              localSeenAt: stamp(),
            },
            {
              id: "project-b",
              name: "知识编译器",
              kind: "Node",
              repoKey: "",
              localPaths: ["/fixture/work/compiler"],
              localSeenAt: stamp(),
            },
          ],
          errors: [],
          truncated: false,
          at: stamp(),
        };
      },
      scanGitHub: async () => ({
        items: [
          {
            name: "我的网站",
            repoKey: "tester/website",
            githubUrl: "https://github.com/tester/website",
            private: true,
            githubSeenAt: stamp(),
          },
          {
            name: "远端项目",
            repoKey: "tester/remote",
            githubUrl: "https://github.com/tester/remote",
            githubSeenAt: stamp(),
          },
        ],
        status: "connected",
        login: "tester",
        message: "",
        truncated: false,
        at: stamp(),
      }),
      detectAgents: async () => {
        calls.agents++;
        return {
          at: stamp(),
          items: [
            {
              id: "codex",
              name: "Codex",
              kind: "开发 Agent",
              status: "detected",
              programs: [{ path: "/fixture/bin/codex", kind: "CLI" }],
              configFound: true,
            },
            {
              id: "hermes",
              name: "Hermes",
              kind: "通用 Agent",
              status: "detected",
              programs: [{ path: "/fixture/bin/hermes", kind: "CLI" }],
              configFound: true,
            },
            {
              id: "claude-code",
              name: "Claude Code",
              kind: "开发 Agent",
              status: "config_only",
              programs: [],
              configFound: true,
            },
          ],
        };
      },
      ...discovery,
    },
  });
  return {
    ...app,
    calls,
    async close() {
      await app.close();
      await rm(directory, { recursive: true, force: true });
    },
  };
}
