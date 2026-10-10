import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createCapabilityUsage, capabilityUseOutcome } from "../server/capability-usage.mjs";
import { startProfileMcp } from "../server/profile-mcp.mjs";
import { calendarFixture } from "./calendar-v16-fixture.mjs";

test("本地最小使用留痕：从无、七天内、过期、损坏未知，不保存工具参数", async () => {
  const directory = await mkdtemp(join(tmpdir(), "workbench-cap-use-"));
  let now = Date.UTC(2026, 9, 6, 12);
  try {
    const usage = createCapabilityUsage(directory, { clock: () => now });
    assert.equal((await usage.summary()).agents.codex.state, "unknown");
    await usage.record("knowledge", "verified", "Codex");
    await usage.record("calendar", "failed");
    let summary = await usage.summary();
    assert.equal(summary.agents.codex.state, "connected");
    assert.equal(summary.capabilities.calendar.outcome, "failed");
    const data = await readFile(join(directory, "capability-use.json"), "utf8");
    assert.equal(data.includes("工具参数"), false);
    assert.deepEqual(Object.keys(JSON.parse(data).items[0]).sort(), ["at", "capability", "clientName", "id", "outcome"]);
    now += 8 * 24 * 60 * 60 * 1000;
    summary = await usage.summary();
    assert.equal(summary.agents.codex.state, "not_connected");
    await usage.record("vault");
    assert.equal((await usage.summary()).agents.codex.state, "not_connected");
    await writeFile(join(directory, "capability-use.json"), "corrupt", { mode: 0o600 });
    await assert.rejects(usage.summary(), /不可核验/);
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test("结果语义保守：未知回执和变更不标成功，客户端名称只保留已知 ID", async () => {
  assert.equal(capabilityUseOutcome({ state:"unknown" }), "unknown");
  assert.equal(capabilityUseOutcome({ status:"changed" }), "unknown");
  assert.equal(capabilityUseOutcome({ status:"matches_before" }), "failed");
  assert.equal(capabilityUseOutcome({ status:"matches_after" }), "verified");
  assert.equal(capabilityUseOutcome({ check:{ matches:false } }), "unknown");
  assert.equal(capabilityUseOutcome({ verified:true }), "verified");
  assert.equal(capabilityUseOutcome({}), "unknown");
  const directory = await mkdtemp(join(tmpdir(), "workbench-cap-use-names-"));
  let now = Date.UTC(2026, 9, 6, 12);
  try {
    const usage = createCapabilityUsage(directory, { clock: () => now });
    await usage.record("knowledge", "verified", "Unrecognized agent");
    await usage.record("knowledge", "verified", "Claude Code");
    const rows = JSON.parse(await readFile(join(directory, "capability-use.json"), "utf8")).items;
    assert.deepEqual(rows.map(row => row.clientName), [null, "claude"]);
    now -= 60_000;
    assert.equal((await usage.summary()).agents.claude.state, "unknown", "未来时间不能算七天内连接");
    assert.equal((await usage.summary()).capabilities.knowledge.outcome, "unknown", "未来时间不能标已核验使用");
  } finally { await rm(directory, { recursive:true, force:true }); }
});

test("MCP 只把握手客户端名与实际已知工具调用关联；握手和列工具不算接入", async () => {
  const directory = await mkdtemp(join(tmpdir(), "workbench-mcp-use-"));
  const usage = createCapabilityUsage(directory);
  const profile = { readProfile: async () => ({ files:[], omitted:[] }), propose: async () => ({ id:"synthetic" }) };
  const mcp = await startProfileMcp({ profile, usage, port:0 });
  let id = 0;
  const call = async (method, params, session) => fetch(mcp.url, { method:"POST", headers:{ "content-type":"application/json", ...(session ? { "Mcp-Session-Id":session } : {}) }, body:JSON.stringify({ jsonrpc:"2.0", id:++id, method, params }) });
  try {
    const init = await call("initialize", { protocolVersion:"2025-06-18", clientInfo:{ name:"Codex", version:"synthetic" } });
    const session = init.headers.get("Mcp-Session-Id");
    assert.ok(session);
    await call("tools/list", {}, session);
    assert.equal((await usage.summary()).agents.codex.state, "unknown");
    await call("tools/call", { name:"unknown", arguments:{} }, session);
    assert.equal((await usage.summary()).agents.codex.state, "unknown");
    await call("tools/call", { name:"read_profile", arguments:{} });
    assert.equal((await usage.summary()).agents.codex.state, "unknown", "没有会话头的旧客户端调用不能归属");
    await call("tools/call", { name:"read_profile", arguments:{} }, session);
    assert.equal((await usage.summary()).agents.codex.state, "connected");
  } finally { await mcp.close(); await rm(directory, { recursive:true, force:true }); }
});

test("HTTP 权限总表留痕只在日历实际读取后出现，状态读取本身不算使用", async () => {
  const app = await calendarFixture();
  const token = (await (await fetch(`${app.url}/api/session`, { headers:{ "X-Workbench-Client":"1" } })).json()).token;
  const call = async (path, data) => {
    const response = await fetch(`${app.url}/api${path}`, { method:data === undefined ? "GET" : "POST",
      headers:{ "X-Workbench-Token":token, ...(data === undefined ? {} : { "Content-Type":"application/json" }) },
      ...(data === undefined ? {} : { body:JSON.stringify(data) }) });
    assert.equal(response.status, 200);
    return response.json();
  };
  try {
    assert.equal((await call("/capability-usage")).capabilities.calendar, null);
    await call("/calendar/status");
    assert.equal((await call("/capability-usage")).capabilities.calendar, null);
    await call("/calendar/week", { from:"2026-10-04T00:00:00.000Z", to:"2026-10-12T00:00:00.000Z" });
    const row = (await call("/capability-usage")).capabilities.calendar;
    assert.equal(row.outcome, "verified");
    assert.equal(row.capability, "calendar");
  } finally { await app.close(); }
});
