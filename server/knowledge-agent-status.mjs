import { execFile } from "node:child_process";
import { dirname } from "node:path";
import { promisify } from "node:util";

const exec = promisify(execFile);
const AGENTS = ["codex", "claude", "hermes", "openclaw"];
const TIMEOUT_MS = 8_000;
const MAX_BUFFER = 128 * 1024;

const unknownAgents = () => Object.fromEntries(AGENTS.map(name => [name, { state: "unknown" }]));
const checkedAt = clock => new Date(clock()).toISOString();

export function sanitizeKnowledgeAgentStatus(value, clock = Date.now) {
  const time = value?.checkedAt;
  return {
    checkedAt: typeof time === "string" && /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(time) &&
      new Date(time).toISOString() === time ? time : checkedAt(clock),
    agents: Object.fromEntries(AGENTS.map(name => [name, {
      state: value?.agents?.[name]?.state === "ready" ? "ready" : "unknown",
    }])),
  };
}

function expectedLocalUrl(url) {
  if (typeof url !== "string" || !/^http:\/\/127\.0\.0\.1:\d+\/mcp$/.test(url)) return false;
  const port = Number(new URL(url).port);
  return port > 0 && port <= 65535;
}

function json(stdout) {
  try { return JSON.parse(stdout); } catch { return null; }
}

function containsExactUrl(stdout, url) {
  return [...stdout.matchAll(/https?:\/\/[^\s)"'<>{}\],;]+/g)].some(match => match[0] === url);
}

export function createKnowledgeAgentStatus({ run = exec, clock = Date.now, ttlMs = 30_000 } = {}) {
  let cache = null;
  let pending = null;
  const options = {
    timeout: TIMEOUT_MS,
    maxBuffer: MAX_BUFFER,
    windowsHide: true,
    env: { ...process.env, PATH: `${dirname(process.execPath)}:${process.env.PATH || ""}` },
  };
  async function output(file, args) {
    try {
      const result = await run(file, args, options);
      return typeof result?.stdout === "string" ? result.stdout : null;
    } catch {
      return null;
    }
  }
  async function codex(url) {
    const data = json(await output("codex", ["mcp", "get", "workbench-profile", "--json"]));
    return data?.name === "workbench-profile" && data.enabled === true &&
      data.transport?.type === "streamable_http" && data.transport.url === url;
  }
  async function claude(url) {
    const raw = await output("claude", ["mcp", "get", "workbench-profile"]);
    return typeof raw === "string" && containsExactUrl(raw, url) &&
      /^\s*Status:\s*(?:[✓✔]\s*)?Connected\s*$/m.test(raw);
  }
  async function hermes(url) {
    const raw = await output("hermes", ["mcp", "test", "workbench-profile"]);
    return typeof raw === "string" && containsExactUrl(raw, url) &&
      /\bConnected\b/.test(raw) && /^\s*search_knowledge\b/m.test(raw);
  }
  async function openclaw(url) {
    const shown = json(await output("openclaw", ["mcp", "show", "workbench-profile", "--json"]));
    if (shown?.url !== url || shown.transport !== "streamable-http") return false;
    const status = json(await output("openclaw", ["mcp", "status", "--json"]));
    const entry = status?.servers?.find?.(item => item?.name === "workbench-profile");
    if (entry?.configured !== true || entry.enabled !== true || entry.ok !== true) return false;
    const probe = json(await output("openclaw", ["mcp", "probe", "workbench-profile", "--json"]));
    return Array.isArray(probe?.tools) &&
      probe.tools.includes("workbench-profile__search_knowledge") &&
      probe.tools.includes("workbench-profile__read_note") &&
      Array.isArray(probe.diagnostics) && probe.diagnostics.length === 0;
  }
  return async function health(url) {
    if (!expectedLocalUrl(url)) return { checkedAt: checkedAt(clock), agents: unknownAgents() };
    const now = Number(clock());
    if (cache?.url === url && now < cache.expires) return cache.value;
    if (pending?.url === url) return pending.promise;
    const promise = (async () => {
      const checks = await Promise.allSettled([codex(url), claude(url), hermes(url), openclaw(url)]);
      const value = {
        checkedAt: checkedAt(clock),
        agents: Object.fromEntries(AGENTS.map((name, index) => [name, {
          state: checks[index].status === "fulfilled" && checks[index].value === true ? "ready" : "unknown",
        }])),
      };
      cache = { url, expires: Number(clock()) + ttlMs, value };
      return value;
    })();
    pending = { url, promise };
    try { return await promise; }
    finally { if (pending?.promise === promise) pending = null; }
  };
}
