import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createKnowledgeAgentStatus } from "../server/knowledge-agent-status.mjs";
import { startServer } from "../server/http.mjs";

const URL = "http://127.0.0.1:5179/mcp";
const UNKNOWN = { codex: { state: "unknown" }, claude: { state: "unknown" },
  hermes: { state: "unknown" }, openclaw: { state: "unknown" } };

function responses(url = URL) {
  return {
    "codex mcp get workbench-profile --json": JSON.stringify({ name: "workbench-profile", enabled: true,
      transport: { type: "streamable_http", url } }),
    "claude mcp get workbench-profile": `Status: ✔ Connected\nURL: ${url}\n`,
    "hermes mcp test workbench-profile": `Connected\nTransport: Streamable HTTP (${url})\n    search_knowledge  Read-only tool\n`,
    "openclaw mcp show workbench-profile --json": JSON.stringify({ url, transport: "streamable-http" }),
    "openclaw mcp status --json": JSON.stringify({ servers: [{ name: "workbench-profile",
      configured: true, enabled: true, ok: true }] }),
    "openclaw mcp probe workbench-profile --json": JSON.stringify({
      tools: ["workbench-profile__search_knowledge", "workbench-profile__read_note"],
      diagnostics: [],
    }),
  };
}

test("固定原生命令、精确 URL、工具发现与 30 秒去重缓存", async () => {
  let now = Date.parse("2026-10-07T13:00:00.000Z");
  const calls = [];
  const outputs = responses();
  const health = createKnowledgeAgentStatus({ clock: () => now, run: async (file, args, options) => {
    const key = `${file} ${args.join(" ")}`;
    calls.push(key);
    assert.equal(options.shell, undefined);
    assert.equal(options.timeout, 8_000);
    assert.equal(options.maxBuffer, 128 * 1024);
    assert.ok(key in outputs);
    return { stdout: outputs[key], stderr: "private stderr" };
  } });
  const [first, same] = await Promise.all([health(URL), health(URL)]);
  assert.deepEqual(first, same);
  assert.deepEqual(first.agents, Object.fromEntries(Object.keys(UNKNOWN).map(name => [name, { state: "ready" }])));
  assert.equal(first.checkedAt, "2026-10-07T13:00:00.000Z");
  assert.equal(calls.length, 6);
  assert.deepEqual(await health(URL), first);
  assert.equal(calls.length, 6);
  now += 30_001;
  assert.equal((await health(URL)).checkedAt, "2026-10-07T13:00:30.001Z");
  assert.equal(calls.length, 12);
});

test("无 MCP URL 不运行 CLI；缺失、失败与错误 URL 仅返回 unknown 且不泄露原文", async () => {
  const calls = [];
  const outputs = responses("http://127.0.0.1:5999/mcp");
  outputs["openclaw mcp show workbench-profile --json"] = JSON.stringify({ url: URL, transport: "streamable-http" });
  outputs["openclaw mcp status --json"] = JSON.stringify({ servers: [{ name: "workbench-profile",
    configured: true, enabled: false, ok: true }] });
  const health = createKnowledgeAgentStatus({ run: async (file, args) => {
    const key = `${file} ${args.join(" ")}`;
    calls.push(key);
    if (file === "hermes") throw new Error("private CLI error");
    return { stdout: outputs[key] + "\nsecret token", stderr: "private stderr" };
  } });
  assert.deepEqual((await health(null)).agents, UNKNOWN);
  assert.deepEqual((await health("https://example.com/mcp")).agents, UNKNOWN);
  assert.equal(calls.length, 0);
  const result = await health(URL);
  assert.deepEqual(result.agents, UNKNOWN);
  assert.ok(!JSON.stringify(result).includes("secret"));
  assert.ok(!JSON.stringify(result).includes("private"));
  assert.ok(!calls.some(call => call.includes("mcp probe")), "禁用状态不探测工具");
});

test("HTTP 接口继承会话门禁并只发固定状态；未注入时不执行探针", async t => {
  const base = await mkdtemp(join(tmpdir(), "guiji-agent-status-"));
  let calls = 0;
  const app = await startServer({ directory: join(base, "data"), port: 0, mcpPort: 0,
    mcpClientHealth: async url => {
      calls++;
      assert.equal(url, app.mcpUrl);
      return { checkedAt: "2026-10-07T13:00:00.000Z", agents: {
        codex: { state: "ready", raw: "secret token" },
        claude: { state: "ready" }, hermes: { state: "broken", raw: "private" },
        openclaw: { state: "unknown" }, extra: { state: "ready" },
      }, stdout: "private stdout" };
    } });
  t.after(async () => { await app.close(); await rm(base, { recursive: true, force: true }); });
  assert.equal((await fetch(app.url + "/api/knowledge/mcp-clients")).status, 403);
  const session = await (await fetch(app.url + "/api/session", {
    headers: { "X-Workbench-Client": "1" },
  })).json();
  const response = await fetch(app.url + "/api/knowledge/mcp-clients", {
    headers: { "X-Workbench-Token": session.token },
  });
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.deepEqual(body, { checkedAt: "2026-10-07T13:00:00.000Z", agents: {
    codex: { state: "ready" }, claude: { state: "ready" },
    hermes: { state: "unknown" }, openclaw: { state: "unknown" },
  } });
  assert.equal(calls, 1);
  assert.ok(!JSON.stringify(body).includes("secret"));

  const noMcp = await startServer({ directory: join(base, "other-data"), port: 0,
    mcpClientHealth: async () => { throw new Error("should not be called"); } });
  t.after(() => noMcp.close());
  const noMcpSession = await (await fetch(noMcp.url + "/api/session", {
    headers: { "X-Workbench-Client": "1" },
  })).json();
  const absent = await (await fetch(noMcp.url + "/api/knowledge/mcp-clients", {
    headers: { "X-Workbench-Token": noMcpSession.token },
  })).json();
  assert.deepEqual(absent.agents, UNKNOWN);
  assert.ok(!Number.isNaN(Date.parse(absent.checkedAt)));
});
