import { createReaProcess } from '../server/reverse-process.mjs';
import { fileURLToPath } from 'node:url';
import { mkdtemp, realpath, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { startServer } from "../server/http.mjs";

export async function fixture({ discovery = {}, nightV2 = {}, controlledExecution = {}, reverse = {}, reverseNative = {}, reaUpdate = {} } = {}) {
  const directory = await realpath(await mkdtemp(join(tmpdir(), "guiji-ui-")));
  // 全盘项目扫描已删除（#73），calls.projects 恒为 0，留给旧断言核对「没有扫描」。
  const calls = { projects: 0, agents: 0 };
  const stamp = () => new Date().toISOString();
  const app = await startServer({
    directory,
    port: 0,
    staticRoot: process.env.WORKBENCH_TEST_STATIC_ROOT || join(import.meta.dirname, "../dist"),
    nightV2,
    reaUpdate: {execute:createReaProcess({command:process.execPath,prefix:[fileURLToPath(new URL('./fake-rea.mjs',import.meta.url))]}),fetchImpl:async()=>{throw Error('合成测试禁止外网');},probe:async()=>[],...reaUpdate},
    controlledExecution,
    reverseNative: {connect:async()=>{throw new Error('合成测试禁止真实原生 Codex');},...reverseNative},
    reverse: { executeAi:async()=>{throw new Error('合成测试禁止真实AI调用');},execute: createReaProcess({command:process.execPath,prefix:[fileURLToPath(new URL("./fake-rea.mjs",import.meta.url))]}), ...reverse },
    discovery: {
      calendarHelper: { platform: "linux", run: async () => { throw new Error("合成测试禁止宿主日历"); } },
      inspectAgentInventory: async (agentId) => ({
        agentId,
        at: stamp(),
        homes: [],
        errors: [],
        truncated: false,
      }),
      defaultRoots: () => ["/fixture/projects", "/fixture/work"],
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
      // 项目空间第二版：默认指向临时目录里不存在的名册，任何浏览器测试都不会读到真实的数字分身名册。
      projectsSpace: { rosterPath: join(directory, "no-roster.json") },
      // #93 Skill 页：默认把 home 指到临时目录（里面没有 my-skills），任何浏览器测试都不会读到真实的 my-skills 与调用记录。
      mySkills: { home: join(directory, "fake-home"), git: async () => null },
      ...discovery,
    },
  });
  return {
    ...app,
    directory,
    calls,
    async close() {
      await app.close();
      await rm(directory, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
    },
  };
}
