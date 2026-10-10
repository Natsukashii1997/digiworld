import {agentContentCard} from "./agents-v16-helpers.mjs";
// G3 · 智能体群内容清单：展开清单；本机 Skill 收录入口已移除，
// 开关预览不写入、体检摘要与待处理、44px、axe、390 宽无横溢。只用合成 Agent 家目录。
import { createRequire } from "node:module";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import assert from "node:assert/strict";
import AxeBuilder from "@axe-core/playwright";
import { startServer } from "../server/http.mjs";
import { readAgentContents } from "../server/agent-contents.mjs";
import { parse, stringify } from "../src/serialization.js";
import { contentsFixture, contentsState } from "./agent-contents-fixture.mjs";

const { chromium } = createRequire(import.meta.url)(
  process.env.PLAYWRIGHT_MODULE ||
    "/Users/nat/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright",
);
const fixture = await contentsFixture();
const database = await mkdtemp(join(tmpdir(), "guiji-agents-inventory-db-"));
const reads = [];
const detected = (id, name) => ({
  id,
  name,
  kind: "开发 Agent",
  status: "detected",
  programs: [{ path: join(fixture.base, "bin", id), kind: "CLI" }],
  configFound: true,
});
const app = await startServer({
  directory: database,
  port: 0,
  staticRoot: process.env.WORKBENCH_TEST_STATIC_ROOT || join(import.meta.dirname, "../dist"),
  discovery: {
    defaultRoots: () => [],
    detectAgents: async () => ({
      at: new Date().toISOString(),
      items: [
        detected("codex", "Codex"),
        detected("claude-code", "Claude Code"),
        detected("hermes", "Hermes"),
        detected("openclaw", "OpenClaw"),
      ],
    }),
    inspectAgentInventory: async (agentId) => ({
      agentId,
      at: new Date().toISOString(),
      homes: [],
      errors: [],
      truncated: false,
    }),
    readAgentContents: (agentId) => {
      reads.push(agentId);
      return readAgentContents(agentId, {
        home: fixture.user,
        filesystem: fixture.filesystem,
      });
    },
  },
});
const browser = await chromium.launch();
const errors = [];
const ok = (s) => console.log("PASS", s);
const session = await (
  await fetch(app.url + "/api/session", { headers: { "x-workbench-client": "1" } })
).json();
async function call(path, data, method = "POST") {
  const response = await fetch(app.url + "/api" + path, {
    method,
    headers: {
      "x-workbench-token": session.token,
      "content-type": "application/json",
    },
    ...(data === undefined ? {} : { body: stringify(data) }),
  });
  const value = parse(await response.text());
  if (!response.ok) throw new Error(value.error || `HTTP ${response.status}`);
  return value;
}
async function axe(page, label) {
  const result = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
    .analyze();
  assert.deepEqual(
    result.violations.map(
      (v) => `${label}: ${v.id} ${v.nodes.map((n) => n.target).join(" ")}`,
    ),
    [],
  );
}
async function minTargets(scope, label) {
  const small = await scope.evaluateAll((els) =>
    els
      .filter((el) => el.offsetParent !== null)
      .map((el) => [el.getAttribute("aria-label") || el.textContent.trim(), el.getBoundingClientRect()])
      .filter(([, r]) => r.height < 44 || r.width < 44)
      .map(([name, r]) => `${name} ${Math.round(r.width)}x${Math.round(r.height)}`),
  );
  assert.deepEqual(small, [], `${label} 存在小于 44px 的控件`);
}
async function noOverflow(page, label) {
  const over = await page.evaluate(
    () => document.documentElement.scrollWidth - innerWidth,
  );
  assert.ok(over <= 0, `${label} 横向溢出 ${over}px`);
}
async function open(width, hash = "agents") {
  const context = await browser.newContext({
    viewport: { width, height: 1000 },
    reducedMotion: "reduce",
  });
  const page = await context.newPage();
  page.setDefaultTimeout(10000);
  page.on("pageerror", (e) => errors.push(`${width} ${e.message}`));
  await page.goto(`${app.url}/#${hash}`);
  await page.locator("main h1").first().waitFor();
  return page;
}
const card = (page) => page.locator(".agent-contents-card").first();
const chooseGroup = (contents, name) => contents.getByRole("group", { name: "内容分组" }).getByRole("button", { name: new RegExp(`^${name}`) }).click();
const pendingCount = async (page) =>
  Number(
    (await page.locator(".topbar-inbox").getAttribute("aria-label")).match(/\d+/)[0],
  );

try {
  const state = await contentsState(fixture);
  // 普通写入不能建立来源关系：只放入不带 origin 的资产（同内容、旧版本）。
  await call(
    "/workspace",
    { state: { ...state, assets: state.assets.filter((a) => !a.origin) }, initialize: true },
    "PUT",
  );
  await call("/scan/agents", {});
  const before = await fixture.snapshot();

  // 1. 每个已检测、支持清单的 Agent 一张卡；未展开前不读取、不下结论
  const page = await open(1280);
  const section = page.locator("#agent-contents");
  for(const [id,name] of [["claude-code","Claude Code"],["codex","Codex"],["hermes","Hermes"],["openclaw","OpenClaw"]]) {
    const currentCard=await agentContentCard(page,id,name);
    await section.getByRole("heading",{name:"内容清单",exact:true}).waitFor();
    assert.equal(await section.locator(".agent-contents-card").count(),1);
    assert.match(await page.locator(".role-check").innerText(),/未检查/);
    assert.equal(reads.length,0,`${name} 未展开前不得读取目录`);
  }
  await agentContentCard(page,"claude-code","Claude Code");
  const pendingBefore=await pendingCount(page);
  ok("四位伙伴分别一张内容卡；未展开零读取");

  // 2. 展开 Claude Code：Skill / 配置文件 / 插件 / MCP 分组，来源与仓库比对
  const claude = card(page, "Claude Code");
  const expand = claude.getByRole("button", { name: "展开清单" });
  await expand.click();
  await claude.getByRole("button", { name: "收起清单" }).waitFor();
  assert.equal(
    await claude.getByRole("button", { name: "收起清单" }).getAttribute("aria-expanded"),
    "true",
  );
  const skills = claude.getByRole("region", { name: "Claude Code · Skill" });
  await skills.locator(".agent-content-item").first().waitFor();
  const row = (name) =>
    skills.locator(".agent-content-item", {
      has: page.locator(`strong:text-is("${name}")`),
    });
  await row("shared-writer").locator("summary").click();
  assert.match(await row("shared-writer").innerText(), /共享池链接[\s\S]*当前版本同内容/);
  assert.match(await row("gone-helper").innerText(), /失效链接/);
  await row("local-notes").locator("summary").click();
  assert.match(await row("local-notes").innerText(), /独立副本[\s\S]*未收录同内容/);
  assert.match(await row("outside-link").innerText(), /外部链接/);
  assert.equal(
    await row("shared-writer").getByRole("button", { name: /存入资产仓库/ }).count(),
    0,
    "已同内容收录的 Skill 不再提供存入",
  );
  await chooseGroup(claude,"配置");
  const configs = claude.getByRole("region", { name: "Claude Code · 配置文件" });
  assert.match(await configs.innerText(), /settings\.json[\s\S]*字节/);
  assert.match(await configs.innerText(), /settings\.local\.json[\s\S]*未发现/);
  assert.doesNotMatch(await claude.innerText(), /哨兵/, "不显示配置正文");
  await chooseGroup(claude,"插件");
  assert.match(
    await claude.getByRole("region", { name: "Claude Code · 插件" }).innerText(),
    /marketplaces/,
  );
  await chooseGroup(claude,"MCP");
  assert.match(
    await claude.getByRole("region", { name: "Claude Code · MCP" }).innerText(),
    /未读取 · .*配置正文/,
  );
  ok("展开清单按 Skill/配置文件/插件/MCP 分组；链接分类与仓库比对正确，不显示配置正文");

  // 3. 体检摘要与待处理
  assert.match(await page.locator(".role-check").innerText(), /失效链接 1/);
  await agentContentCard(page,"hermes","Hermes");
  const hermes = card(page, "Hermes");
  await hermes.getByRole("button", { name: "展开清单" }).click();
  await chooseGroup(hermes,"插件");
  await hermes.getByRole("region", { name: "Hermes · 插件" }).waitFor();
  assert.match(
    await hermes.getByRole("region", { name: "Hermes · 插件" }).innerText(),
    /无法读取 · 没有读取权限/,
  );
  await chooseGroup(hermes,"Skill");
  assert.match(
    await hermes.locator(".agent-content-item", { has: page.locator('strong:text-is("locked-skill")') }).innerText(),
    /无法读取/,
  );
  assert.match(await page.locator(".role-check").innerText(), /无法读取 2/);
  await agentContentCard(page,"codex","Codex");
  const codex = card(page, "Codex");
  await codex.getByRole("button", { name: "展开清单" }).click();
  await codex.getByRole("region", { name: "Codex · Skill" }).locator(".agent-content-item").first().waitFor();
  const oldSkill=codex.locator(".agent-content-item", { has: page.locator('strong:text-is("codex-old")') });
  await oldSkill.locator("summary").click();
  assert.match(
    await oldSkill.innerText(),
    /第 1 版同内容，落后于第 2 版/,
  );
  assert.match(await page.locator(".role-check").innerText(), /与仓库不一致 1/);
  await page.waitForFunction(
    (n) => Number(document.querySelector(".topbar-inbox").getAttribute("aria-label").match(/\d+/)[0]) === n,
    pendingBefore + 3,
  );
  await page.locator(".topbar-inbox").click();
  await page.getByRole("dialog",{name:"待处理",exact:true}).waitFor();
  const item = page.locator(".ib-card", { hasText: "Claude Code：1 条失效链接" });
  await item.waitFor();
  assert.match(await page.locator(".ib-card", { hasText: "Hermes：" }).innerText(), /2 项无法读取/);
  assert.match(await page.locator(".ib-card", { hasText: "Codex：" }).innerText(), /1 个副本与仓库版本不一致/);
  await item.locator(".ib-card-btn").click();
  await page.locator("#agent-contents").waitFor();
  assert.match(await page.locator(".role-check").innerText(), /失效链接 1/);
  ok("卡片体检摘要正确；三条问题汇总进顶栏待处理，点击回到智能体群且保留上次结果");

  // 4. 开关预览：说明将移动哪条链接，标注需单独授权；不写入任何文件
  const claude2 = card(page, "Claude Code");
  await claude2.getByRole("button", { name: "展开清单" }).click();
  await claude2.getByRole("button", { name: "开关预览：shared-writer" }).click();
  const toggle = page.getByRole("dialog", { name: "开关预览" });
  await toggle.waitFor();
  const text = await toggle.innerText();
  assert.match(text, new RegExp(`停用将移动[\\s\\S]*${join(fixture.claude, "skills", "shared-writer").replace(/[.]/g, "\\.")}`));
  assert.match(text, /skills\.disabled/);
  assert.match(text, /只移动链接本身/);
  assert.match(text, /需要用户单独授权后在本机执行/);
  await minTargets(toggle.locator("button"), "开关预览");
  await axe(page, "开关预览");
  await toggle.getByRole("button", { name: "关闭预览" }).click();
  await toggle.waitFor({ state: "detached" });
  await claude2.getByRole("button", { name: "开关预览：gone-helper" }).click();
  assert.match(await page.getByRole("dialog", { name: "开关预览" }).innerText(), /没有可执行的停用动作[\s\S]*失效/);
  await page.keyboard.press("Escape");
  assert.equal(await fixture.snapshot(), before, "开关预览后合成目录必须不变");
  ok("开关预览给出移动计划与恢复方式，标注需单独授权；合成目录逐字节不变");

  // 5. 44px、axe（展开状态）
  await minTargets(page.locator("#agent-contents button"), "内容清单");
  await axe(page, "内容清单展开");
  ok("内容清单控件不小于 44px；展开状态 axe 通过");

  // 6. 展开内容清单只读展示来源，不再从此处进入本机 Skill 收录。
  assert.equal(await claude2.getByRole("button", { name: /存入资产仓库/ }).count(), 0);
  assert.equal(await page.getByRole("dialog", { name: "收录本机 Skill", exact: true }).count(), 0);
  assert.equal(
    (await call("/workspace", undefined, "GET")).assets.some(
      (a) => a.origin?.location === join(fixture.claude, "skills", "local-notes"),
    ),
    false,
  );
  assert.equal(await fixture.snapshot(), before, "查看清单不改 Agent 目录");
  ok("Agent 内容清单无本机 Skill 收录入口；查看保持只读");

  // 7. 390 宽：展开后无横向溢出，控件仍不小于 44px
  const narrow = await open(390);
  await agentContentCard(narrow,"claude-code","Claude Code");
  const narrowCard = card(narrow, "Claude Code");
  await narrowCard.getByRole("button", { name: "展开清单" }).click();
  await narrowCard.getByRole("region", { name: "Claude Code · Skill" }).locator(".agent-content-item").first().waitFor();
  await noOverflow(narrow, "390 内容清单");
  await minTargets(narrow.locator("#agent-contents button"), "390 内容清单");
  await axe(narrow, "390 内容清单");
  ok("390 宽展开清单无横向溢出，控件 44px，axe 通过");

  assert.deepEqual(errors, []);
  console.log("agents-inventory-browser: all passed");
} finally {
  await browser.close();
  await app.close();
  await fixture.close();
  await rm(database, { recursive: true, force: true });
}
