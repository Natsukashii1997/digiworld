import { stat, access, realpath } from "node:fs/promises";
import { constants } from "node:fs";
import { join, delimiter } from "node:path";
import { homedir } from "node:os";
import { inspectAppIdentity } from "./agent-programs.mjs";

export const defaultRoots = () => [
  join(homedir(), "Documents", "ChatGPT"),
  join(homedir(), "Documents", "AI 项目"),
];
const CATALOG = [
  {
    id: "codex",
    name: "Codex",
    kind: "开发 Agent",
    command: "codex",
    apps: ["Codex.app", "ChatGPT.app"],
    config: ".codex",
  },
  {
    id: "hermes",
    name: "Hermes",
    kind: "通用 Agent",
    command: "hermes",
    apps: [],
    config: ".hermes",
  },
  {
    id: "claude-code",
    name: "Claude Code",
    kind: "开发 Agent",
    command: "claude",
    apps: [],
    config: ".claude",
  },
  {
    id: "cursor",
    name: "Cursor",
    kind: "开发工具",
    command: "cursor",
    apps: ["Cursor.app"],
    config: ".cursor",
  },
  {
    id: "opencode",
    name: "OpenCode",
    kind: "开发 Agent",
    command: "opencode",
    apps: ["OpenCode.app"],
    config: ".config/opencode",
  },
  {
    id: "gemini-cli",
    name: "Gemini CLI",
    kind: "开发 Agent",
    command: "gemini",
    apps: [],
    config: ".gemini",
  },
  {
    id: "aider",
    name: "Aider",
    kind: "开发 Agent",
    command: "aider",
    apps: [],
    config: ".aider",
  },
  {
    id: "openclaw",
    name: "OpenClaw",
    kind: "通用 Agent",
    command: "openclaw",
    apps: ["OpenClaw.app"],
    config: ".openclaw",
  },
  {
    id: "windsurf",
    name: "Windsurf",
    kind: "开发工具",
    command: "windsurf",
    apps: ["Windsurf.app"],
    config: ".codeium/windsurf",
  },
  { id: "claude-app", name: "Claude", kind: "桌面助手", apps: ["Claude.app"] },
  { id: "chatgpt", name: "ChatGPT", kind: "桌面助手", apps: ["ChatGPT.app"] },
];
function probeError(error, path, errors) {
  if (!["ENOENT", "ENOTDIR"].includes(error.code))
    errors.push(`${path}：探测未完成（${error.code || "I/O"}）`);
}
async function isDirectory(path, errors) {
  try {
    return (await stat(path)).isDirectory();
  } catch (error) {
    probeError(error, path, errors);
    return false;
  }
}
export async function detectAgents({
  home = homedir(),
  executableDirs,
  appDirs,
} = {}) {
  executableDirs ??= [
    ...new Set([
      ...(process.env.PATH || "").split(delimiter),
      join(home, ".local/bin"),
      "/opt/homebrew/bin",
      "/usr/local/bin",
    ]),
  ].filter(Boolean);
  appDirs ??= ["/Applications", join(home, "Applications")];
  const items = [],
    appIdentities = new Map();
  for (const entry of CATALOG) {
    const programs = [],
      errors = [];
    if (entry.command)
      for (const dir of executableDirs) {
        const candidate = join(dir, entry.command);
        try {
          await access(candidate, constants.X_OK);
          if ((await stat(candidate)).isFile()) {
            const resolved = await realpath(candidate);
            if (!programs.some((p) => p.path === resolved))
              programs.push({ path: resolved, kind: "CLI" });
          }
        } catch (error) {
          probeError(error, candidate, errors);
        }
      }
    for (const base of appDirs)
      for (const app of entry.apps) {
        const candidate = join(base, app);
        if (!(await isDirectory(candidate, errors))) continue;
        if (app === "ChatGPT.app") {
          if (!appIdentities.has(candidate))
            appIdentities.set(candidate, await inspectAppIdentity(candidate));
          const identity = appIdentities.get(candidate);
          if (identity.status !== "present") {
            errors.push(`${candidate}：应用身份无法核验`);
            continue;
          }
          const expectedIdentity =
            entry.id === "codex" ? "com.openai.codex" : "com.openai.chat";
          if (identity.identifier !== expectedIdentity) continue;
        }
        programs.push({ path: candidate, kind: "App" });
      }
    const configFound =
      !!entry.config && (await isDirectory(join(home, entry.config), errors));
    items.push({
      id: entry.id,
      name: entry.name,
      kind: entry.kind,
      status: errors.length
        ? "unknown"
        : programs.length
          ? "detected"
          : configFound
            ? "config_only"
            : "not_detected",
      programs,
      configFound,
      errors,
    });
  }
  return { at: new Date().toISOString(), items };
}

export function mergeAgents(previous, detected) {
  return detected.map((agent) => {
    if (agent.status !== "unknown") return agent;
    const old = previous.find((a) => a.id === agent.id);
    const programs = [...agent.programs];
    for (const p of old?.programs || [])
      if (!programs.some((item) => item.path === p.path)) programs.push(p);
    return {
      ...agent,
      programs,
      configFound: agent.configFound || !!old?.configFound,
    };
  });
}
