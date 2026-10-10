import { scanProjectUpdate, updateDate } from "./project-update.mjs";
import { stat, access, realpath } from "node:fs/promises";
import { constants } from "node:fs";
import { join, delimiter } from "node:path";
import { homedir } from "node:os";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { digest, failure } from "./repository.mjs";
import { inspectAppIdentity } from "./agent-programs.mjs";

const exec = promisify(execFile);
import { githubKey } from "./project-scan.mjs";
export { scanLocalProjects, githubKey } from "./project-scan.mjs";
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

export async function scanGitHub({ run = exec } = {}) {
  try {
    const options = {
      timeout: 20000,
      maxBuffer: 8 * 1024 * 1024,
      env: { ...process.env, GH_PROMPT_DISABLED: "1", GH_PAGER: "cat" },
    };
    const account = JSON.parse(
      (
        await run(
          "/opt/homebrew/bin/gh",
          ["api", "--hostname", "github.com", "user"],
          options,
        )
      ).stdout,
    );
    const items = [];
    let truncated = false;
    for (let page = 1; page <= 10; page++) {
      const records = JSON.parse(
        (
          await run(
            "/opt/homebrew/bin/gh",
            [
              "api",
              "--hostname",
              "github.com",
              `user/repos?per_page=100&page=${page}&sort=updated&affiliation=owner,collaborator,organization_member`,
            ],
            options,
          )
        ).stdout,
      );
      if (!Array.isArray(records)) throw new Error("invalid");
      for (const r of records) {
        const key = githubKey(r.html_url);
        if (!key) continue;
        items.push({
          name: String(r.name).slice(0, 200),
          repoKey: key,
          githubUrl: `https://github.com/${key}`,
          private: r.private === true,
          description: String(r.description || "").slice(0, 1000),
          language: String(r.language || ""),
          githubSeenAt: new Date().toISOString(),
          updatedAt: String(r.updated_at || ""),
          githubPushedAt: updateDate(r.pushed_at) || undefined,
        });
      }
      if (records.length < 100) break;
      if (page === 10) truncated = true;
    }
    return {
      status: "connected",
      login: String(account.login || ""),
      items,
      truncated,
      at: new Date().toISOString(),
      message: "",
    };
  } catch (error) {
    const detail = String(error.stderr || "");
    return {
      status: "unavailable",
      login: "",
      items: [],
      truncated: false,
      at: new Date().toISOString(),
      message:
        error.code === "ENOENT"
          ? "未找到 GitHub CLI"
          : /auth login|HTTP 401|not logged/.test(detail)
            ? "GitHub 登录已失效，请在终端运行 gh auth login"
            : "GitHub 暂时无法连接；保留上次结果",
    };
  }
}

export function mergeProjects(
  previous,
  locals,
  remotes,
  { protectedIds = [], locations = [], at, remoteComplete = true } = {},
) {
  const items = [];
  const protectedSet = new Set([
    ...protectedIds,
    ...previous.filter((p) => p.identityConflict).map((p) => p.id),
  ]);
  const mayCombine = (a, b) =>
    !a ||
    !b ||
    a.id === b.id ||
    !(protectedSet.has(a.id) && protectedSet.has(b.id));
  const currentPaths = new Set(locals.flatMap((p) => p.localPaths));
  function append(item, candidateId) {
    let id =
      candidateId || item.id || "github-" + digest(item.repoKey).slice(0, 24);
    if (items.some((p) => p.id === id))
      id =
        "project-" +
        digest((item.repoKey || "") + JSON.stringify(item.localPaths)).slice(
          0,
          24,
        );
    const result = { ...item, id };
    items.push(result);
    return result;
  }
  for (const input of locals) {
    const local = { ...input };
    const pathOwner = previous.find((p) =>
      p.localPaths.some((path) => local.localPaths.includes(path)),
    );
    const unconfirmedDirectory = local.localPaths.some((path) => {
      const old = pathOwner?.locations?.find((p) => p.path === path);
      const observed = locations.find((p) => p.path === path);
      return (
        old?.observedIdentity ||
        old?.status === "changed" ||
        (old?.identity &&
          observed?.identity &&
          old.identity !== observed.identity)
      );
    });
    if (unconfirmedDirectory) local.repoKey = pathOwner?.repoKey || "";
    if (local.repoKey === undefined) {
      const priorPath = previous.find((p) =>
        p.localPaths.some((path) => local.localPaths.includes(path)),
      );
      local.repoKey = priorPath?.repoKey || "";
    }
    const candidates = previous.filter(
      (p) => (local.repoKey && p.repoKey === local.repoKey) || p === pathOwner,
    );
    const protectedCandidates = candidates.filter((p) =>
      protectedSet.has(p.id),
    );
    const prior =
      pathOwner && protectedSet.has(pathOwner.id)
        ? pathOwner
        : protectedCandidates.length === 1
          ? protectedCandidates[0]
          : pathOwner || candidates[0];
    const existing = items.find(
      (p) =>
        (p.id === prior?.id ||
          (local.repoKey && p.repoKey === local.repoKey)) &&
        p.repoKey === local.repoKey &&
        mayCombine(p, prior),
    );
    if (existing) {
      existing.localPaths = [
        ...new Set([...existing.localPaths, ...local.localPaths]),
      ];
      continue;
    }
    // A new origin must not inherit the previous remote's metadata.
    const base = prior?.repoKey === local.repoKey ? prior : {};
    append(
      {
        ...base,
        ...(prior?.relationVersion
          ? { relationVersion: prior.relationVersion }
          : {}),
        ...(prior?.aliases ? { aliases: prior.aliases } : {}),
        ...local,
        localPaths: [...local.localPaths],
        seenThisScan: true,
      },
      prior?.id,
    );
  }
  for (const remote of remotes) {
    const existing = items.filter((p) => p.repoKey === remote.repoKey);
    if (existing.length)
      for (const p of existing)
        Object.assign(p, remote, { id: p.id, localPaths: p.localPaths });
    else {
      const prior = previous.find((p) => p.repoKey === remote.repoKey);
      append(
        {
          ...prior,
          ...remote,
          localPaths: (prior?.localPaths || []).filter(
            (path) => !currentPaths.has(path),
          ),
          seenThisScan: true,
        },
        prior?.id,
      );
    }
  }
  for (const prior of previous) {
    const exactTarget = items.find((p) => p.id === prior.id);
    if (exactTarget && (exactTarget.repoKey === prior.repoKey || !prior.githubUrl || !prior.repoKey)) {
      exactTarget.localPaths = [
        ...new Set([...exactTarget.localPaths, ...prior.localPaths.filter((path) => !currentPaths.has(path))]),
      ];
      continue;
    }
    const target = items.find(
      (p) =>
        p.repoKey === prior.repoKey &&
        (p.id === prior.id || (prior.repoKey && mayCombine(p, prior))),
    );
    const remainingPaths = prior.localPaths.filter(
      (path) => !currentPaths.has(path),
    );
    if (target) {
      target.localPaths = [
        ...new Set([...target.localPaths, ...remainingPaths]),
      ];
      continue;
    }
    if (!prior.manual && !protectedSet.has(prior.id) && !remainingPaths.length && !prior.githubUrl && prior.localPaths.length)
      continue;
    append(
      { ...prior, localPaths: remainingPaths, seenThisScan: false },
      prior.id,
    );
  }
  for (const p of items) {
    const absorbed = previous.filter(
      (old) =>
        old.id !== p.id &&
        !items.some((item) => item.id === old.id) &&
        (old.localPaths.some((path) => p.localPaths.includes(path)) ||
          (old.repoKey && old.repoKey === p.repoKey)),
    );
    const aliases = [
      ...new Set([
        ...(p.aliases || []),
        ...absorbed.flatMap((old) => [old.id, ...(old.aliases || [])]),
      ]),
    ].filter((id) => id !== p.id);
    if (aliases.length) p.aliases = aliases;
    // 在推进标记是用户意图，跟随稳定项目 ID（含被吸收的历史身份），不因远端变化而丢失。
    if (
      previous.some(
        (old) =>
          old.active === true &&
          (old.id === p.id || (p.aliases || []).includes(old.id)),
      )
    )
      p.active = true;
    else delete p.active;
    p.identityConflict =
      !!p.repoKey &&
      items.some((other) => other.id !== p.id && other.repoKey === p.repoKey);
    p.locations = p.localPaths.map((path) => {
      const old =
        (previous.find((item) => item.id === p.id)?.locations || []).find(
          (l) => l.path === path,
        ) ||
        previous
          .flatMap((item) => item.locations || [])
          .find((l) => l.path === path);
      const observed = locations.find((l) => l.path === path);
      const status =
        observed?.status || (currentPaths.has(path) ? "present" : "unknown");
      const changed =
        !!old?.identity &&
        !!observed?.identity &&
        old.identity !== observed.identity;
      const identity = old?.identity || observed?.identity;
      const observedIdentity = changed
        ? observed.identity
        : observed?.identity === identity
          ? undefined
          : old?.observedIdentity;
      return {
        path,
        status: changed ? "changed" : status,
        ...(identity ? { identity } : {}),
        ...(observedIdentity ? { observedIdentity } : {}),
        ...(observed?.checkedAt || at
          ? { checkedAt: observed?.checkedAt || at }
          : {}),
        ...(changed
          ? { message: "目录身份已变化，请重新确认" }
          : observed?.message
            ? { message: observed.message }
            : {}),
      };
    });
  }
  for (const p of items) p.recentUpdate = scanProjectUpdate(p, locals, remotes, {at,remoteComplete});
  return items.sort((a, b) => a.name.localeCompare(b.name, "zh"));
}
