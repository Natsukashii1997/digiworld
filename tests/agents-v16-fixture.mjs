// 固定合成输入，与v16确认稿对齐；无真实会话、应用、目录或模型调用。
import { fixture } from "./fixture.mjs";
import { seed } from "../src/store.js";
import { buildRelayPrompt } from "../src/relay-prompt.js";
export const TITLE = "UI v16 · 智能体群页面简报",
  STAMP = "2026-10-04T20:12:00.000Z";
export const AGENTS = [
  ["claude-code", "Claude Code"],
  ["codex", "Codex"],
  ["hermes", "Hermes"],
  ["openclaw", "OpenClaw"],
  ["doubao", "豆包工作"],
];
export const contentResult = (id, brokenLinks = 2) => ({
  agentId: id,
  at: STAMP,
  home: { path: "/fixture", status: "present" },
  health: { brokenLinks, drift: 0, unreadable: 0 },
  groups: {
    skills: {
      root: "/fixture/skills",
      status: "ok",
      items: Array.from({ length: 128 }, (_, i) => ({
        id: "skill-" + i,
        name: "合成Skill" + i,
        source: i < brokenLinks ? "broken" : "copy",
        path: "/fixture/skills/s" + i,
        match: { status: "none" },
        toggle: { action: "blocked", effect: "合成资料只读" },
      })),
    },
    configs: { root: "/fixture/config", status: "ok", items: [] },
    plugins: { root: "/fixture/plugins", status: "ok", items: [] },
    mcp: { status: "not_read", reason: "不读取MCP正文" },
  },
});
export async function agentsV16Fixture() {
  const calls = { list: 0, prepare: 0, clear: 0, open: [], contents: 0 },
    model = {
      empty: false,
      fail: false,
      copyFail: false,
      delayList: null,
      delayPrepare: null,
      partial: false,
      healthBrokenLinks: null,
    };
  const messages = [
    { role: "user", text: "1. 就这四个，2. 横向滑动的一排" },
    {
      role: "assistant",
      text: "已确认会话来源为四位伙伴；390 宽角色卡横向滑动……",
    },
    { role: "user", text: "亚古兽太大了，让他小一点和加布兽一样大……" },
    {
      role: "assistant",
      text: "确认，开始出 1440 和 390 视觉稿；亚古兽缩小到和加布兽一样大。",
    },
  ];
  const prompt = buildRelayPrompt({
    title: TITLE,
    agentName: "Claude Code",
    project: "~/work/personal-ai-workbench",
    updatedAt: "10/05 04:12",
    next: "Claude 出智能体群 1440 + 390 视觉稿",
    messages,
  });
  const app = await fixture({
    discovery: {
      detectAgents: async () => ({
        at: STAMP,
        items: AGENTS.map(([id, name]) => ({
          id,
          name,
          kind: "合成伙伴",
          status: "detected",
          programs: [{ kind: "App", path: "/fixture/" + id + ".app" }],
          configFound: true,
        })),
      }),
      readAgentContents: async (id) => {
        calls.contents++;
        return contentResult(id, model.healthBrokenLinks ?? 2);
      },
      relaySessions: {
        async list() {
          calls.list++;
          if (model.delayList) await model.delayList;
          if (model.fail)
            throw Object.assign(new Error("合成目录不可读"), { status: 400 });
          return {
            sessions: model.empty
              ? []
              : Array.from({ length: 15 }, (_, i) => ({
                  id: (i + 1).toString(16).padStart(64, "0"),
                  title: i ? TITLE + " · " + i : TITLE,
                  agentId: "claude-code",
                  project: "~/work/personal-ai-workbench",
                  updatedAt: STAMP,
                  rounds: 42,
                })),
            sources: AGENTS.slice(0, 4).map(([agentId]) => ({
              agentId,
              status:
                model.partial && ["hermes", "openclaw"].includes(agentId)
                  ? "unsupported"
                  : "ok",
              reason:
                model.partial && ["hermes", "openclaw"].includes(agentId)
                  ? "暂不支持读取"
                  : "",
            })),
            skipped: 0,
            incomplete: false,
          };
        },
        async prepare() {
          calls.prepare++;
          if (model.delayPrepare) await model.delayPrepare;
          return { ...prompt, nextStatus: "ok" };
        },
        clear() {
          calls.clear++;
          return { cleared: true };
        },
        open({ agentId }) {
          calls.open.push(agentId);
          return {
            opened: agentId === "codex",
            reason: "没找到 " + agentId + " 的应用，提示词已复制",
          };
        },
      },
    },
  });
  const state = seed();
  state.assets = [state.assets[0]];
  state.notes = [{ id: "visual-note", at: STAMP, text: "合成资料" }];
  state.agentRoles = [
    {
      agentId: "codex",
      strengths: ["代码实现", "重构", "测试", "修复", "审查", "命令行"],
      cost: "medium",
      projects: ["personal-ai-workbench", "ai-ui-users"],
      note: "大量开发与全量回归；交接写进 handoffs。",
      updatedAt: STAMP,
    },
  ];
  await app.repository.write(state, { initialize: true });
  await app.repository.updateConnections(() => ({
    roots: ["/fixture"],
    projects: [],
    agents: AGENTS.map(([id, name]) => ({
      id,
      name,
      kind: "合成伙伴",
      status: "detected",
      programs: [{ kind: "App", path: "/fixture/" + id + ".app" }],
      configFound: true,
    })),
    github: { status: "not_connected", login: "", at: "", message: "" },
    agentScannedAt: STAMP,
    projectScannedAt: STAMP,
    errors: [],
    truncated: false,
  }));
  return { ...app, relayCalls: calls, model, prompt: prompt.prompt };
}
