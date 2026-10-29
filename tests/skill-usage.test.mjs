// 项目空间第二版第 2 批（issue #9）：实战采集。只用临时目录里的合成会话记录与合成技能目录，
// 不读真实 ~/.claude、~/.codex；开关关着时用打桩的文件系统证明一次都没碰会话目录。
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { mkdtemp, mkdir, writeFile, readFile, rm, realpath, utimes } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  createSkillUsage, skillName, projectOf, claudeSkillsInLine, codexSkillsInLine,
} from "../server/skill-usage.mjs";

const NOW = Date.parse("2026-10-29T12:00:00Z");
const DAY = 86400000;
const SECRET = "这是一段对话正文-不应出现在缓存里";

test("技能名：插件前缀合并；格式不对的丢弃", () => {
  assert.deepEqual(skillName("mattpocock-skills:tdd"), { name: "tdd", plugin: "mattpocock-skills" });
  assert.deepEqual(skillName("/grill-me"), { name: "grill-me", plugin: "" });
  assert.equal(skillName("a b"), null);
});

test("会话目录归属：项目目录、仓库内 worktree、外置 worktree 按仓库名", () => {
  const projects = [{ id: "dw", path: "/w/personal-ai-workbench" }, { id: "nm", path: "/w/work-desk" }];
  assert.equal(projectOf("/w/personal-ai-workbench", projects), "dw");
  assert.equal(projectOf("/w/personal-ai-workbench/.claude/worktrees/x", projects), "dw");
  assert.equal(projectOf("/Users/u/.codex/worktrees/ab12/work-desk/src", projects), "nm");
  assert.equal(projectOf("/w/work-desk-ui-bitmap", projects), null, "名字相近的另一目录不算");
  assert.equal(projectOf("relative/path", projects), null);
  const nested = [{ id: "outer", path: "/w/work" }, { id: "inner", path: "/w/work/agent-kit" }];
  assert.equal(projectOf("/w/work/agent-kit/src", nested), "inner", "目录嵌套时归到最深的那个");
  assert.equal(projectOf("/w/work/other", nested), "outer");
});

test("Claude 记录：Skill 工具调用与用户斜杠命令计数，内置命令不算", () => {
  const tool = { message: { role: "assistant", content: [{ type: "tool_use", name: "Skill", input: { skill: "p:tdd" } }, { type: "tool_use", name: "Bash", input: {} }] } };
  assert.deepEqual(claudeSkillsInLine(tool), [{ name: "tdd", plugin: "p" }]);
  const slash = { message: { role: "user", content: "<command-name>/grill-me</command-name> <command-name>/clear</command-name>" } };
  assert.deepEqual(claudeSkillsInLine(slash), [{ name: "grill-me", plugin: "" }]);
  const echoed = { message: { role: "assistant", content: [{ type: "text", text: "<command-name>/grill-me</command-name>" }] } };
  assert.deepEqual(claudeSkillsInLine(echoed), [], "助手消息里的命令字样不算");
});

test("Codex 记录：只认用户消息里的 $已装技能；读技能文件不算", () => {
  const installed = new Set(["tdd", "to-spec"]);
  assert.deepEqual(codexSkillsInLine({ payload: { type: "user_message", message: "用 $tdd 和 $nope，再 $to-spec" } }, installed), ["tdd", "to-spec"]);
  assert.deepEqual(codexSkillsInLine({ payload: { type: "function_call_output", output: "cat ~/.agents/skills/tdd/SKILL.md $tdd" } }, installed), []);
  assert.deepEqual(codexSkillsInLine({ payload: { type: "message", role: "user", content: [{ type: "input_text", text: "$tdd" }] } }, installed), ["tdd"]);
});

async function sessionsFixture() {
  const base = await realpath(await mkdtemp(join(tmpdir(), "skill-usage-")));
  const home = join(base, "home");
  const work = join(home, "work");
  const dw = join(work, "personal-ai-workbench"), nm = join(work, "work-desk");
  const claudeRoot = join(home, ".claude/projects"), codexRoot = join(home, ".codex/sessions");
  const skills = { "Matt Pocock": join(home, ".agents/skills"), "自建": join(home, "my-skills/skills") };
  for (const d of [dw, nm, join(claudeRoot, "-w-dw"), join(claudeRoot, "-w-old"), join(codexRoot, "2026/10/28"), skills["Matt Pocock"], skills["自建"]])
    await mkdir(d, { recursive: true });
  for (const s of ["tdd", "grill-me", "to-spec"]) await mkdir(join(skills["Matt Pocock"], s));
  await mkdir(join(skills["自建"], "kb-note"));
  const iso = (daysAgo) => new Date(NOW - daysAgo * DAY).toISOString();
  const jsonl = (rows) => rows.map((r) => JSON.stringify(r)).join("\n") + "\n";
  await writeFile(join(claudeRoot, "-w-dw", "s1.jsonl"), jsonl([
    { type: "user", cwd: dw, timestamp: iso(1), message: { role: "user", content: `<command-name>/grill-me</command-name> ${SECRET}` } },
    { type: "assistant", cwd: dw, timestamp: iso(1), message: { role: "assistant", content: [{ type: "tool_use", name: "Skill", input: { skill: "mattpocock-skills:tdd" } }] } },
    { type: "assistant", cwd: join(dw, ".claude/worktrees/feat"), timestamp: iso(2), message: { role: "assistant", content: [{ type: "tool_use", name: "Skill", input: { skill: "tdd" } }] } },
    { type: "user", cwd: dw, timestamp: iso(2), message: { role: "user", content: "<command-name>/clear</command-name>" } },
    { type: "assistant", cwd: dw, timestamp: iso(40), message: { role: "assistant", content: [{ type: "tool_use", name: "Skill", input: { skill: "tdd" } }] } },
    "坏行",
  ]));
  await writeFile(join(claudeRoot, "-w-dw", "s2.jsonl"), jsonl([
    { type: "user", cwd: nm, timestamp: iso(3), message: { role: "user", content: "<command-name>/kb-note</command-name>" } },
    { type: "user", cwd: "/somewhere/else", timestamp: iso(3), message: { role: "user", content: "<command-name>/grill-me</command-name>" } },
  ]));
  // 超过 30 天没改过的会话文件整个不读
  const old = join(claudeRoot, "-w-old", "old.jsonl");
  await writeFile(old, jsonl([{ cwd: dw, timestamp: iso(1), message: { role: "user", content: "<command-name>/grill-me</command-name>" } }]));
  await utimes(old, new Date(NOW - 45 * DAY), new Date(NOW - 45 * DAY));
  await writeFile(join(codexRoot, "2026/10/28", "rollout-1.jsonl"), jsonl([
    { timestamp: iso(1), type: "session_meta", payload: { cwd: join(home, ".codex/worktrees/ab/personal-ai-workbench") } },
    { timestamp: iso(1), type: "response_item", payload: { type: "function_call_output", output: "read skills/tdd/SKILL.md $tdd" } },
    { timestamp: iso(1), type: "event_msg", payload: { type: "user_message", message: `请按 $to-spec 写 ${SECRET}` } },
  ]));
  const roster = async () => ({ state: "ok", projects: [{ id: "personal-ai-workbench", path: dw }, { id: "work-desk", path: nm }] });
  return { base, home, claudeRoot, codexRoot, skills, roster, data: join(base, "data") };
}

test("开关关着：read 只回未开启，refresh 拒绝；全程不碰会话与技能目录", async () => {
  const f = await sessionsFixture();
  try {
    await mkdir(f.data);
    const touched = [];
    const spy = new Proxy(fs, { get: (t, k) => typeof t[k] === "function" ? (...a) => { touched.push([k, String(a[0])]); return t[k](...a); } : t[k] });
    let opened = 0;
    const usage = createSkillUsage({
      directory: f.data, clock: () => NOW, enabled: async () => false, roster: f.roster, filesystem: spy,
      lines: () => { opened++; return [][Symbol.iterator](); },
      home: f.home, claudeRoot: f.claudeRoot, codexRoot: f.codexRoot, skillDirs: f.skills,
    });
    assert.deepEqual(await usage.read(), { state: "off" });
    await assert.rejects(usage.refresh(), (e) => e.status === 409 && /未开启/.test(e.message));
    assert.deepEqual(touched, []);
    assert.equal(opened, 0);
    await assert.rejects(readFile(join(f.data, "skill-usage.json")), { code: "ENOENT" });
  } finally {
    await rm(f.base, { recursive: true, force: true });
  }
});

test("正式入口默认打开实战；模块本身默认关（测试里起的服务不碰真实会话目录）", async () => {
  const entry = await readFile(new URL("../server/index.mjs", import.meta.url), "utf8");
  assert.match(entry, /skillUsage: \{ enabled: async \(\) => true \}/);
  const f = await sessionsFixture();
  try {
    await mkdir(f.data);
    const usage = createSkillUsage({ directory: f.data, clock: () => NOW, roster: f.roster,
      home: f.home, claudeRoot: f.claudeRoot, codexRoot: f.codexRoot, skillDirs: f.skills });
    assert.deepEqual(await usage.read(), { state: "off" });
  } finally {
    await rm(f.base, { recursive: true, force: true });
  }
});

test("开关开着：按项目统计次数、最近日期、会话数与来源；Codex 点名单列；缓存里没有正文与路径", async () => {
  const f = await sessionsFixture();
  try {
    await mkdir(f.data);
    const usage = createSkillUsage({
      directory: f.data, clock: () => NOW, enabled: async () => true, roster: f.roster,
      home: f.home, claudeRoot: f.claudeRoot, codexRoot: f.codexRoot, skillDirs: f.skills,
    });
    assert.deepEqual(await usage.read(), { state: "empty" });
    await assert.rejects(usage.refresh({ path: "/etc" }), /不接受参数/);
    const r = await usage.refresh();
    assert.equal(r.state, "ok");
    const dw = r.projects["personal-ai-workbench"], nm = r.projects["work-desk"];
    assert.deepEqual(dw.skills, [
      { name: "tdd", src: "mattpocock-skills", n: 2, last: "2026-10-28" },
      { name: "grill-me", src: "Matt Pocock", n: 1, last: "2026-10-28" },
    ]);
    assert.equal(dw.calls, 3);
    assert.equal(dw.sessions, 1);
    assert.deepEqual(dw.codex, [{ name: "to-spec", n: 1, last: "2026-10-28" }]);
    assert.deepEqual(nm.skills, [{ name: "kb-note", src: "自建", n: 1, last: "2026-10-26" }]);
    assert.equal(nm.sessions, 1);

    const raw = await readFile(join(f.data, "skill-usage.json"), "utf8");
    assert.doesNotMatch(raw, new RegExp(SECRET));
    assert.doesNotMatch(raw, /\.jsonl|\/home\/|\.claude|\.codex|cwd|content|message/);
    const saved = JSON.parse(raw);
    assert.deepEqual(Object.keys(saved).sort(), ["at", "days", "projects", "schema"]);
    for (const p of Object.values(saved.projects)) {
      assert.deepEqual(Object.keys(p).sort(), ["calls", "codex", "sessions", "skills"]);
      for (const s of p.skills) assert.deepEqual(Object.keys(s).sort(), ["last", "n", "name", "src"]);
    }
    assert.equal((await usage.read()).state, "ok");
  } finally {
    await rm(f.base, { recursive: true, force: true });
  }
});
