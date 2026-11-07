// 驾驶舱 Agent 页与规则页的只读接口（#74）：全部用合成 home，不读真实配置。
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { join, dirname } from "node:path";
import { tmpdir } from "node:os";
import { readCockpitAgents, codexConfig, outline } from "../server/cockpit-agents.mjs";
import { readCockpitRules, vaultPrefIds, parseDoctor, lessonsTitles } from "../server/cockpit-rules.mjs";
import { maskSecrets, cachedRead, MASK } from "../server/cockpit-read.mjs";
import { startServer } from "../server/http.mjs";

const NOW = Date.parse("2026-11-08T10:00:00Z");
const iso = (minutesAgo) => new Date(NOW - minutesAgo * 60000).toISOString();
const SECRETS = ["FAKE-SECRET-settings", "FAKE-SECRET-claudejson", "FAKE-SECRET-toml", "FAKE-SECRET-yaml",
  "FAKE-SECRET-auth", "FAKE-SECRET-acct", "fake@example.com", "OUTSIDE-SECRET", "BODY-PRIVATE-TEXT",
  "sk-FAKEtoken1234567890abcd", "FAKE-SECRET-session"];

async function write(path, text) {
  await fs.mkdir(dirname(path), { recursive: true });
  await fs.writeFile(path, typeof text === "string" ? text : JSON.stringify(text));
}

async function fixture(run) {
  const base = await fs.realpath(await fs.mkdtemp(join(tmpdir(), "cockpit-")));
  const home = join(base, "home");
  const work = join(home, "Documents", "ChatGPT", "个人", "work");
  const kit = join(work, "agent-kit");
  const state = join(home, "Library", "Application Support", "agent-kit");
  try {
    // 白名单外的文件：只能经符号链接或名册路径指过去，必须读不到。
    await write(join(base, "outside", "secret.md"), "## 外面\nOUTSIDE-SECRET\n");
    await write(join(base, "outside", "proj", "AGENTS.md"), "OUTSIDE-SECRET\n");

    const claudeMd = "# CLAUDE.md\n\n## 0. 回复语言\n中文\nAPI_KEY=sk-FAKEtoken1234567890abcd\n\n## 7. 跨项目沉淀\n- 全局坑里这几条每次都要守：\n  - G-01 证据\n  - G-03 全量测试\n\n## 9. UI 设计出三版\n共用出处：Vault P-08\n\n## 14. AI 接入写进设置\n共用出处：Vault P-13\n";
    await write(join(home, ".claude", "CLAUDE.md"), claudeMd);
    await write(join(kit, "global", "claude", "CLAUDE.md"), claudeMd);
    await write(join(kit, "global", "codex", "AGENTS.md"), "# 仓库版\n<!-- personal:me -->\n");
    await write(join(state, "personal", "codex.md"), "<!-- personal:me -->\n个人段\n<!-- /personal:me -->\n");
    await write(join(home, ".claude", "settings.json"), {
      modelSettings: { "claude-opus-5-5": {} }, env: { ANTHROPIC_API_KEY: "FAKE-SECRET-settings" },
      permissions: { defaultMode: "bypassPermissions", deny: ["a", "b"] },
      hooks: { PreToolUse: [{ matcher: "Bash", hooks: [{ command: "node /x/agent-kit/runtime/hooks/guard-git.mjs --token FAKE-SECRET-settings" }] }],
        UserPromptSubmit: [{ hooks: [{ command: "python3 ~/.claude/hooks/context-handoff/context_handoff.py" }] }] },
    });
    await write(join(home, ".claude.json"), { oauthAccount: { emailAddress: "fake@example.com" },
      mcpServers: { "vault-read": { env: { TOKEN: "FAKE-SECRET-claudejson" } }, rea: {} } });
    await write(join(home, ".claude", "projects", "p1", "memory", "a.md"), "x");
    await write(join(home, ".claude", "projects", "p1", "memory", "MEMORY.md"), "x");
    await write(join(home, ".claude", "projects", "p1", "sessions", "s.jsonl"), "FAKE-SECRET-session");
    // Skill：一个来自 my-skills，一个链到 ~/.agents/skills，一个仅本机。
    await write(join(work, "my-skills", "skills", "mine-a", "SKILL.md"), "x");
    await write(join(home, ".agents", "skills", "shared-b", "SKILL.md"), "x");
    await fs.symlink(join(work, "my-skills", "skills", "mine-a"), join(home, ".agents", "skills", "mine-a"));
    await fs.mkdir(join(home, ".claude", "skills", "local-c"), { recursive: true });
    await fs.symlink(join(work, "my-skills", "skills", "mine-a"), join(home, ".claude", "skills", "mine-a"));
    await fs.symlink(join(home, ".agents", "skills", "shared-b"), join(home, ".claude", "skills", "shared-b"));

    await write(join(home, ".codex", "AGENTS.md"), "# Codex\n\n## 角色\n见 P-08\n");
    await write(join(home, ".codex", "config.toml"), 'model = "gpt-test"\nmodel_reasoning_effort = "high"\napproval_policy = "on-request"\nsandbox_mode = "workspace-write"\napi_key = "FAKE-SECRET-toml"\n\n[mcp_servers.workbench-profile]\nenv = { TOKEN = "FAKE-SECRET-toml" }\n[mcp_servers.workbench-profile.env]\nX = "FAKE-SECRET-toml"\n');
    await write(join(home, ".codex", "config.toml.bak"), "FAKE-SECRET-toml");
    await write(join(home, ".codex", "auth.json"), { token: "FAKE-SECRET-auth" });
    await write(join(home, ".codex", "hooks.json"), { hooks: { SessionStart: [{}, {}], PreToolUse: [{}] } });
    await write(join(home, ".codex", "rules", "agent-kit.rules"), "x");

    await write(join(home, ".hermes", "SOUL.md"), "# 猛鬼兽\n\n## 性格\n温和\n");
    await write(join(home, ".hermes", "config.yaml"), "model:\n  default: gpt-sol\n  provider: openai-codex\nfallback_model:\n  model: deepseek-flash\n  api_key: FAKE-SECRET-yaml\nmcp_servers:\n  vault-read:\n    env:\n      TOKEN: FAKE-SECRET-yaml\n");
    await write(join(home, ".hermes", "gateway_state.json"), { gateway_state: "running", code_version: "0.22.2", updated_at: iso(2), platforms: { feishu: { state: "connected", error_message: "FAKE-SECRET-yaml" } }, argv: ["--token", "FAKE-SECRET-yaml"] });
    await write(join(home, ".hermes", "auth.json"), { t: "FAKE-SECRET-auth" });
    await fs.mkdir(join(home, ".hermes", "skills", "productivity"), { recursive: true });
    await write(join(home, ".hermes", "memories", "USER.md"), "BODY-PRIVATE-TEXT");
    const agumon = join(home, ".hermes", "profiles", "agumon");
    await fs.mkdir(agumon, { recursive: true });
    await fs.symlink(join(base, "outside", "secret.md"), join(agumon, "SOUL.md"));
    await write(join(agumon, "gateway_state.json"), { gateway_state: "running", updated_at: iso(60), platforms: {} });

    await write(join(home, "Library", "Application Support", "app.postpane.mac", "last-account-readings.json"), { providers: [
      { provider: "claude", checkedAt: iso(5), account: { email: "fake@example.com", id: "FAKE-SECRET-acct" }, quotas: [
        { shortLabel: "5h", usedPercent: 7.04, resetAt: iso(-60), status: "normal", account: "FAKE-SECRET-acct" },
        { shortLabel: "Cloud", usedPercent: 96.6, resetAt: iso(600), status: "critical", observedAt: iso(3000) }] },
      { provider: "codex", checkedAt: iso(120), quotas: [{ shortLabel: "Weekly", usedPercent: 21, status: "normal" }] }] });

    // 规则页来源
    await write(join(home, "Documents", "Obsidian Vault", "个人上下文", "当前人机协作偏好.md"),
      "## 当前条目\n\n| ID | 当前内容 | 确认依据 | 适用范围 | 失效 |\n|---|---|---|---|---|\n| P-01 | BODY-PRIVATE-TEXT 中文 | 常浩 2026-10-20 | 全部 | 改变时 |\n| P-08 | BODY-PRIVATE-TEXT 三版 | 常浩 2026-10-29 | 全部 | 改变时 |\n| P-13 | BODY-PRIVATE-TEXT 接入 | 常浩 2026-11-07 | 应用 | 改变时 |\n");
    await write(join(state, "reviews", "2026-11-07-全局规则审核包.md"),
      "# 审核包\n\n## 3. 编号对照\n\n| 编号 | 内容（简） | Claude | Codex | Hermes | Vault |\n|---|---|---|---|---|---|\n| P-01 | 中文结论先行 | 部分：§0 只管中文 | 有 | 无 | 有 |\n| P-08 | UI 出三版 | 有：§9，**不发截图** | 有 | 有（索引） | 有 |\n\n## 4. 初审发现\n\n**A. 真源**\n\n- A1　三处都像真源，没有写改哪几处\n\n**B. 冲突**\n\n- B1　要不要提议交接：两边相反\n\n## 5. 问题\n- B9　不该算进来\n");
    await write(join(kit, "LESSONS.md"), "# LESSONS\n\n## 怎么写\n\n## G-01 证据放 /tmp（2026-10-24 提升）\n\n## G-03 没跑全量测试（2026-10-24 提升）\n\n## G-20 Mac 睡眠（2026-11-07 新增）\n");
    await write(join(kit, "工程流程.md"), "x");
    await write(join(state, "lessons-hits.jsonl"), [
      { time: "2026-11-05T10:00:00Z", ids: ["G-03", "G-01"] }, { time: "2026-11-06T10:00:00Z", ids: ["G-03"] }, "坏行",
    ].map((r) => (typeof r === "string" ? r : JSON.stringify(r))).join("\n"));
    await write(join(state, "doctor", "doctor-20261101T0100.txt"), "开始 2026-11-01T01:00:00Z\n✗ 旧报告\n");
    await write(join(state, "doctor", "doctor-20261107T0415.txt"), "开始 2026-11-07T04:15:34Z\n✓ Claude 权限规则与 hook\n    2 条拒绝规则\n⚠ 全局指令 codex 与仓库版一致\n    不一致\n· 近 7 天坑提醒命中\n    G-03×2\n合计：✓1 ⚠1 ✗0\n");
    await write(join(work, "niuma-home", "AGENTS.md"), "a\nb\n");
    await write(join(work, "niuma-home", "docs", "LESSONS.md"), "## L-01 x\n## L-02 y\n");
    await write(join(work, "niuma-home", "docs", "adr", "0001-x.md"), "x");
    await write(join(work, "digital-twin", "projects.json"), { projects: [
      { name: "牛马之家", type: "product", path: "~/Documents/ChatGPT/个人/work/niuma-home" },
      { name: "越界项目", type: "product", path: join(base, "outside", "proj") },
      { name: "回跳项目", type: "product", path: "~/Documents/ChatGPT/个人/work/../../../../../outside/proj" },
    ] });
    await run({ base, home });
  } finally {
    await fs.rm(base, { recursive: true, force: true });
  }
}

const git = async () => "2026-11-07\tLESSONS 新增 G-20（#31） (#32)\n2026-11-05\t机器执行层落地\n";
const opts = (home) => ({ home, clock: () => NOW, git });

function assertNoSecrets(text, where) {
  for (const s of SECRETS) assert.ok(!text.includes(s), `${where} 里出现了 ${s}`);
}

test("Agent：4 个 Agent 的字段、来源与读取时间；ChatGPT 不计入", () => fixture(async ({ home }) => {
  const value = await readCockpitAgents(opts(home));
  assert.deepEqual(value.agents.map((a) => a.id), ["claude", "codex", "hermes", "agumon"]);
  assert.equal(value.readAt, new Date(NOW).toISOString());
  const [claude, codex, hermes, agumon] = value.agents;
  assert.equal(claude.model.main, "Opus 5.5");
  assert.equal(claude.model.deny, 2);
  assert.equal(claude.model.permission, "跳过确认");
  assert.deepEqual(claude.mcp, ["vault-read", "rea"]);
  assert.deepEqual(claude.skills.parts, [["链到 ~/.agents/skills 等", 1], ["来自 my-skills", 1], ["仅本机", 1]]);
  assert.deepEqual(claude.skills.mineList, ["mine-a"]);
  assert.deepEqual(claude.hooks.map((h) => [h.name, h.origin, h.desc]), [
    ["guard-git", "agent-kit", "危险 git 操作先问或直接拒绝"], ["context-handoff", "本机", "上下文到一半时提醒交接"]]);
  assert.equal(claude.instructions.sync.level, "ok");
  assert.deepEqual(claude.instructions.prefs, ["P-08", "P-13"]);
  assert.equal(claude.instructions.toc[0].num, "§0");
  assert.ok(claude.instructions.text.includes(MASK), "指令正文里的疑似密钥要打码");
  // 额度：5 小时新鲜，云端会话的读数停在两天前 → 过期；总状态提示过期条数。
  assert.deepEqual(claude.quota.rows.map((r) => [r.label, r.usedPercent, r.state, r.level]), [["5 小时", 7, "ok", "ok"], ["云端会话", 96.6, "stale", "warn"]]);
  assert.deepEqual(claude.status, { level: "warn", text: "可用 · 1 项读数过期" });
  for (const s of claude.sources) assert.ok(s.path.startsWith("~"), s.path);

  assert.equal(codex.model.main, "gpt-test");
  assert.equal(codex.model.permission, "按需确认 · 可写工作区");
  assert.deepEqual(codex.mcp, ["workbench-profile"]);
  assert.equal(codex.instructions.sync.level, "warn");
  assert.deepEqual(codex.skills.mineList, ["mine-a"]);
  assert.equal(codex.quota.rows[0].state, "stale", "codex 的额度快照两小时前，过期");
  assert.equal(codex.hooks[0].name, "hooks.json · 3 条");

  assert.equal(hermes.model.main, "gpt-sol");
  assert.match(hermes.model.note, /deepseek-flash/);
  assert.deepEqual(hermes.mcp, ["vault-read"]);
  assert.deepEqual(hermes.status, { level: "ok", text: "网关运行中 · 飞书已连接" });
  assert.equal(hermes.skills.total, 1);
  assert.equal(hermes.instructions.sync.level, "unk");

  // 企业分身：SOUL.md 指向白名单外 → 读不到，显示未知；网关一小时没更新 → 过期。
  assert.equal(agumon.instructions.state, "missing");
  assert.equal(agumon.instructions.text, undefined);
  assert.deepEqual(agumon.status, { level: "warn", text: "网关读数过期" });
  assert.equal(agumon.sources.find((s) => s.label === "指令").state, "missing");
  assert.equal(agumon.model, null, "没有 config.yaml 时模型为未知");

  assertNoSecrets(JSON.stringify(value), "Agent 响应");
}));

test("Agent：缺失的来源显示未知，不抛错", async () => {
  const base = await fs.realpath(await fs.mkdtemp(join(tmpdir(), "cockpit-empty-")));
  try {
    const value = await readCockpitAgents({ home: base, clock: () => NOW });
    for (const a of value.agents) {
      assert.equal(a.instructions.state, "missing");
      assert.equal(a.status.level, "unk");
      assert.ok(a.sources.every((s) => s.state === "missing" || s.label === "Skill"));
    }
  } finally { await fs.rm(base, { recursive: true, force: true }); }
});

test("规则：六块数据、偏好只取编号与出处、过期与未知", () => fixture(async ({ home }) => {
  const value = await readCockpitRules(opts(home));
  // 1 个人偏好：标题来自审核包或 CLAUDE.md 节标题；正文不出现。
  assert.deepEqual(value.prefs.map((p) => [p.id, p.title, p.basis, p.claude.level, p.hermes.level, p.agumon.level, p.reviewed]), [
    ["P-01", "中文结论先行", "常浩 2026-10-20", "p", "n", "u", true],
    ["P-08", "UI 出三版", "常浩 2026-10-29", "y", "y", "u", true],
    ["P-13", "AI 接入写进设置", "常浩 2026-11-07", "u", "u", "u", false]]);
  assert.equal(value.prefs[1].claude.note, "§9，不发截图");
  assert.equal(value.layers.pref.restricted, true);
  // 2 落地对照里的两份全局指令比对
  assert.equal(value.layers.land.sync.claude.level, "ok");
  assert.equal(value.layers.land.sync.codex.level, "warn");
  // 3 工程约束：命中次数与「每次都要守」
  assert.deepEqual(value.lessons.map((g) => [g.id, g.date, g.kind, g.hits, g.must]), [
    ["G-01", "2026-10-24", "提升", 1, true], ["G-03", "2026-10-24", "提升", 2, true], ["G-20", "2026-11-07", "新增", 0, false]]);
  assert.equal(value.layers.eng.hitsSince, "2026-11-05T10:00:00Z");
  // 4 机器守护：取最新一份自检；一天前的不算过期
  assert.equal(value.doctor.at, "2026-11-07T04:15:34Z");
  assert.deepEqual([value.doctor.ok, value.doctor.warn, value.doctor.fail, value.doctor.state], [1, 1, 0, "ok"]);
  assert.equal(value.guards.find((g) => g.id === "deny").evidence, "2 条拒绝规则");
  assert.equal(value.guards.find((g) => g.id === "sync").level, "warn");
  // 5 项目规则：名册里指向工作目录外的项目不读
  assert.deepEqual(value.projects.map((p) => [p.name, p.readable, p.agents, p.lessons, p.adr]), [
    ["牛马之家", true, 3, 2, 1], ["越界项目", false, null, null, null], ["回跳项目", false, null, null, null]]);
  assert.deepEqual(value.memory, { count: 1, location: "~/.claude/projects/*/memory/" });
  // 6 问题与变更：第 4 节以外的条目不算；冲突排前
  assert.deepEqual(value.issues.map((i) => [i.id, i.group, i.title]), [["B1", "冲突", "要不要提议交接"], ["A1", "真源", "三处都像真源，没有写改哪几处"]]);
  assert.equal(value.layers.issue.count, 1);
  assert.deepEqual(value.changes[0], { date: "2026-11-07", subject: "LESSONS 新增 G-20（#31）", ref: "agent-kit #32" });
  assertNoSecrets(JSON.stringify(value), "规则响应");
}));

test("规则：自检超过 7 天算过期，来源缺失算未知", async () => {
  await fixture(async ({ home }) => {
    const value = await readCockpitRules({ home, clock: () => NOW + 10 * 86400000, git });
    assert.equal(value.doctor.state, "stale");
    assert.equal(value.layers.guard.state, "stale");
  });
  const base = await fs.realpath(await fs.mkdtemp(join(tmpdir(), "cockpit-empty-")));
  try {
    const value = await readCockpitRules({ home: base, clock: () => NOW, git: async () => { throw new Error("不该调用 git"); } });
    for (const [k, layer] of Object.entries(value.layers)) assert.equal(layer.state, "missing", k);
    assert.equal(value.prefs, null);
    assert.equal(value.changes, null);
  } finally { await fs.rm(base, { recursive: true, force: true }); }
});

test("解析与打码的边界", () => {
  assert.deepEqual(codexConfig('model = "m"\n[profiles.x]\nmodel = "other"\n[mcp_servers."quoted name"]\n[mcp_servers.a.env]\n'), { model: "m", mcp: ["quoted name"] });
  assert.deepEqual(outline("# 标题\n\n# 一\n见 P-01 和 P-01\n# 二\n").map((t) => [t.title, t.prefs]), [["一", ["P-01"]], ["二", []]]);
  assert.deepEqual(vaultPrefIds("| P-02 | 正文 | 依据 | x |\n| 其他 | a | b |"), [{ id: "P-02", basis: "依据" }]);
  assert.deepEqual(lessonsTitles("## G-07 标题（2026-10-24 提升）\n## G-99 没有日期\n").map((g) => [g.id, g.title, g.date]), [["G-07", "标题", "2026-10-24"], ["G-99", "没有日期", null]]);
  assert.equal(parseDoctor("✓ a\n    细节\n✗ b\n").fail, 1);
  for (const raw of ['token = "abc123"', "API_KEY=sk-abcdefghijk", "secret: hunter2", "ghp_abcdefghijklmnopqrstu", "app_secret: xyz"])
    assert.ok(!maskSecrets(raw).match(/abc123|sk-abcdefghijk|hunter2|ghp_abcdefghijklmnopqrstu|xyz/), raw);
  assert.equal(maskSecrets("普通正文 model = gpt"), "普通正文 model = gpt");
});

test("快照：先回旧快照、过期后台刷新，refresh 才等现读", async () => {
  let now = 0, calls = 0;
  const read = cachedRead(async () => ++calls, { maxAgeMs: 100, clock: () => now });
  assert.equal(await read(), 1);
  assert.equal(await read(), 1);
  now = 200;
  assert.equal(await read(), 1, "过期也先回旧快照");
  await new Promise((r) => setImmediate(r));
  assert.equal(await read(), 2, "后台已刷新");
  assert.equal(await read({ refresh: true }), 3);
});

test("HTTP：两个 GET 走来源与 token 校验，不收路径参数，响应与日志都没有密钥", () => fixture(async ({ base, home }) => {
  const logged = [];
  const originals = { log: console.log, error: console.error, warn: console.warn, info: console.info };
  for (const k of Object.keys(originals)) console[k] = (...a) => { logged.push(a.map(String).join(" ")); };
  const app = await startServer({
    directory: join(base, "database"), port: 0, staticRoot: join(import.meta.dirname, "../dist"),
    discovery: {
      defaultRoots: () => [],
      cockpitAgents: cachedRead(() => readCockpitAgents(opts(home))),
      cockpitRules: cachedRead(() => readCockpitRules(opts(home))),
    },
  });
  try {
    const session = await (await fetch(app.url + "/api/session", { headers: { "x-workbench-client": "1" } })).json();
    const get = (path, headers = {}) => fetch(app.url + path, { headers: { "x-workbench-token": session.token, ...headers } });
    assert.equal((await fetch(app.url + "/api/cockpit/agents")).status, 403, "没有 token");
    assert.equal((await get("/api/cockpit/agents", { origin: "http://evil.example" })).status, 403, "跨站来源");
    assert.equal((await get("/api/cockpit/rules", { "sec-fetch-site": "cross-site" })).status, 403, "跨站请求");
    assert.equal((await fetch(app.url + "/api/cockpit/agents", { method: "POST", headers: { "x-workbench-token": session.token, "content-type": "application/json" }, body: "{}" })).status, 404, "只有 GET");
    for (const path of ["/api/cockpit/agents", "/api/cockpit/rules"]) {
      const response = await get(path + "?path=/etc/passwd&home=/&refresh=1");
      assert.equal(response.status, 200);
      const text = await response.text();
      assert.ok(!text.includes("root:"), "不接受前端传路径");
      assertNoSecrets(text, path);
      assert.ok(JSON.parse(text).readAt);
    }
  } finally {
    await app.close();
    Object.assign(console, originals);
  }
  assertNoSecrets(logged.join("\n"), "服务日志");
}));
