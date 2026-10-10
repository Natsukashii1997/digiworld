// 路线 v3 切片 3.2 / 3.3：知识仓库三区视图、“我的知识”本周指标（页头与世界总览）、划分规则可见可改、
// 个人说明 MCP 共享开关与接入配置示例、待处理中个人说明修改建议的预览采纳与拒绝。
// 只用临时合成 Vault；每一步核对 Vault 文件字节不变。44px、axe、390 宽无横向溢出。
import { createRequire } from "node:module";
import assert from "node:assert/strict";
import AxeBuilder from "@axe-core/playwright";
import { mkdtemp, mkdir, writeFile, readFile, readdir, rm, utimes, realpath } from "node:fs/promises";
import { createHash } from "node:crypto";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { startServer } from "../server/http.mjs";
import { seed } from "../src/store.js";
import { parse, stringify } from "../src/serialization.js";
const { chromium } = createRequire(import.meta.url)(
  process.env.PLAYWRIGHT_MODULE ||
    "/Users/nat/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright",
);
const output = process.env.GUIJI_TEST_RESULTS || "test-results/knowledge-zones";
await mkdir(output, { recursive: true });

const ABOUT = "# 关于我\n\n## 工作\n我在合成公司负责 AI 流程。\n\n## 偏好\n结论先行。\n";
const OLD = new Date(Date.now() - 30 * 86400000);
const base = await realpath(await mkdtemp(join(tmpdir(), "guiji-zones-ui-")));
const root = join(base, "合成Vault");
async function put(path, text, old = false) {
  await mkdir(join(root, path, ".."), { recursive: true });
  await writeFile(join(root, path), text);
  if (old) await utimes(join(root, path), OLD, OLD);
}
await put("GET NOTES/订阅一.md", "# 订阅一\n");
await put("GET NOTES/子/订阅二.md", "# 订阅二\n", true);
await put("个人上下文/关于我.md", ABOUT, true);
await put("个人上下文/沟通.md", "# 沟通\n先给结论。\n", true);
await put("决定/方法A.md", "# 方法A\n");
await put("项目/经验.md", "# 经验\n", true);
await put("个人上下文副本/草稿.md", "# 不是个人说明\n");
async function vaultDigest() {
  const out = [];
  async function walk(dir) {
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) await walk(path);
      else out.push(path + ":" + createHash("sha256").update(await readFile(path)).digest("hex"));
    }
  }
  await walk(root);
  return out.sort().join("\n");
}
const vaultBefore = await vaultDigest();
const unchanged = async (label) => assert.equal(await vaultDigest(), vaultBefore, `${label}：Vault 被改动`);

const app = await startServer({
  directory: join(base, "data"),
  port: 0,
  mcpPort: 0,
  staticRoot: process.env.GUIJI_TEST_DIST || join(import.meta.dirname, "../dist"),
  discovery: { defaultRoots: () => [join(base, "projects")] },
});
const session = await (await fetch(app.url + "/api/session", { headers: { "X-Workbench-Client": "1" } })).json();
const api = async (path, data) => {
  const response = await fetch(app.url + "/api/" + path, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Workbench-Token": session.token },
    body: stringify(data),
  });
  const body = parse(await response.text());
  if (!response.ok) throw new Error(`${path} ${response.status} ${body.error}`);
  return body;
};
const initial = await app.repository.write(seed(), { initialize: true });
await api("knowledge/connect", { name: "合成 Vault", kind: "obsidian", root, confirmed: true, expectedRevision: initial.revision });
const stored = () => app.repository.read();

const browser = await chromium.launch();
const errors = [];
const ok = (s) => console.log("PASS", s);
async function open(width, hash, height = 1000) {
  const context = await browser.newContext({ viewport: { width, height }, reducedMotion: "reduce" });
  const page = await context.newPage();
  page.setDefaultTimeout(10000);
  page.on("pageerror", (e) => errors.push(`${width} ${e.message}`));
  await page.goto(`${app.url}/#${hash}`);
  await page.locator(".page-heading, .home, .hx").first().waitFor();
  return page;
}
const button = (scope, name) => scope.getByRole("button", { name, exact: true });
async function atLeast44(locator, name) {
  const box = await locator.boundingBox();
  assert.ok(box, `${name} 不可见`);
  assert.ok(box.width >= 44 && box.height >= 44, `${name} 点击区域 ${box.width}x${box.height}，应至少 44px`);
}
async function axe(page, label) {
  const result = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
  assert.deepEqual(result.violations.map((v) => `${label}: ${v.id} ${v.nodes.map((n) => n.target).join(" ")}`), []);
}
async function noOverflow(page, label) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  assert.ok(overflow <= 0, `${label} 横向溢出 ${overflow}px`);
}
async function until(check, label) {
  for (let i = 0; i < 50; i++) {
    if (await check()) return;
    await new Promise((r) => setTimeout(r, 100));
  }
  assert.fail(`等待超时：${label}`);
}
const zonesSection = (page) => page.getByRole("region", { name: "三区视图" });
const zoneTab = (page, label) => zonesSection(page).getByRole("group", { name: "知识分区" }).getByRole("button", { name: new RegExp(`^${label}`) });
const metric = (page) => page.locator(".page-heading .zone-metric");
// UI v14e：划分规则与个人说明 MCP 收进页头“规则与 MCP”抽屉；抽屉是模态，操作页面前先关上。
const rulesDrawer = (page) => page.getByRole("dialog", { name: "规则与 MCP" });
async function openRules(page) {
  await button(page, "规则与 MCP").click();
  await rulesDrawer(page).waitFor();
}
async function closeRules(page) {
  await button(rulesDrawer(page), "关闭").click();
  await rulesDrawer(page).waitFor({ state: "detached" });
}
async function mcpCall(url, name, args) {
  const response = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name, arguments: args } }),
  });
  return (await response.json()).result;
}

try {
  // 1. 知识仓库页：页头指标先显示“尚未统计”，统计三区后显示“我的知识”本周新增或更新篇数。
  const page = await open(1440, "knowledge");
  await zonesSection(page).waitFor();
  assert.match(await metric(page).innerText(), /我的知识.*本周.*—/s);
  await button(zonesSection(page), "统计三区").click();
  await until(async () => /\+2/.test(await metric(page).innerText()), "页头指标 +2");
  assert.match(await zoneTab(page, "输入区").innerText(), /2\s*篇[\s\S]*本周 \+1/);
  assert.match(await zoneTab(page, "我的知识").innerText(), /3\s*篇[\s\S]*本周 \+2/);
  assert.match(await zoneTab(page, "个人说明").innerText(), /2\s*篇[\s\S]*本周 \+0/);
  await zoneTab(page, "个人说明").click();
  const profileList = zonesSection(page).getByRole("list", { name: "个人说明 文件" });
  assert.deepEqual(
    (await profileList.getByRole("listitem").allInnerTexts()).map((t) => t.split("\n")[0]),
    ["个人上下文/关于我.md", "个人上下文/沟通.md"],
  );
  await atLeast44(button(zonesSection(page), "统计三区"), "统计三区");
  await atLeast44(zoneTab(page, "我的知识"), "分区按钮");
  await unchanged("统计");
  ok("页头指标：统计三区后显示我的知识本周 +2；三区篇数与本周新增或更新正确；个人说明文件清单；Vault 不变");

  // 2. 划分规则可见可改：新增“项目/** → 输入区”，保存到主库后重新统计生效；恢复默认。
  await openRules(page);
  const rules = page.getByRole("form", { name: "划分规则" });
  assert.equal(await rules.getByLabel("规则 1 文件夹").inputValue(), "GET NOTES");
  assert.equal(await rules.getByLabel("规则 2 文件夹").inputValue(), "个人上下文");
  await rules.getByText("其余文件 → 我的知识").waitFor();
  await button(rules, "添加规则").click();
  await rules.getByLabel("规则 3 文件夹").fill("项目");
  await rules.getByLabel("规则 3 归入").selectOption("input");
  await button(rules, "保存规则").click();
  await until(async () => (await stored()).knowledgeZones?.rules.length === 3, "规则保存到主库");
  assert.deepEqual((await stored()).knowledgeZones.rules[2], { pattern: "项目/**", zone: "input" });
  await closeRules(page);
  await button(zonesSection(page), "统计三区").click();
  await until(async () => /3\s*篇/.test(await zoneTab(page, "输入区").innerText()), "新规则生效");
  assert.match(await zoneTab(page, "我的知识").innerText(), /2\s*篇/);
  // 越界规则在页面上被拦下，不提交。
  await openRules(page);
  await rules.getByLabel("规则 3 文件夹").fill("../外部");
  await button(rules, "保存规则").click();
  await rules.getByRole("alert").waitFor();
  assert.equal((await stored()).knowledgeZones.rules[2].pattern, "项目/**");
  await button(rules, "恢复默认").click();
  await button(rules, "保存规则").click();
  await until(async () => (await stored()).knowledgeZones.rules.length === 2, "恢复默认规则");
  await closeRules(page);
  await button(zonesSection(page), "统计三区").click();
  await until(async () => /3\s*篇/.test(await zoneTab(page, "我的知识").innerText()), "默认规则统计");
  await openRules(page);
  await atLeast44(button(rules, "保存规则"), "保存规则");
  await atLeast44(rules.getByLabel("规则 1 文件夹"), "规则输入框");
  await unchanged("规则");
  ok("划分规则可见可改：新增规则保存到主库并影响统计；越界规则被拦下；恢复默认");

  // 3. 个人说明：开启 MCP 读取需要本人确认；显示 MCP 地址与三个 Agent 的接入配置示例。
  const profile = page.getByRole("region", { name: "个人说明" });
  await profile.getByText("未开启").first().waitFor();
  assert.equal(await button(profile, "开启 MCP 读取").isDisabled(), true);
  await profile.getByLabel("我确认允许本机 Agent 通过 MCP 读取“个人上下文”正文").check();
  await button(profile, "开启 MCP 读取").click();
  await until(async () => (await stored()).knowledgeZones?.profileSharing === true, "开启共享");
  await button(profile, "关闭 MCP 读取").waitFor();
  const mcpUrl = (await profile.locator(".mcp-url").innerText()).trim();
  assert.match(mcpUrl, /^http:\/\/127\.0\.0\.1:\d+\/mcp$/);
  const examples = profile.getByRole("region", { name: "接入配置示例" });
  for (const agent of ["Codex", "Claude Code", "Hermes"])
    await examples.getByRole("heading", { name: agent, exact: true }).waitFor();
  const exampleText = await examples.innerText();
  assert.ok(exampleText.includes(mcpUrl), "配置示例使用实际 MCP 地址");
  assert.match(exampleText, /claude mcp add --transport http/);
  assert.match(exampleText, /\[mcp_servers\.workbench-profile\]/);
  assert.match(exampleText, /mcp_servers:/);
  assert.match(exampleText, /不会自动修改/);
  await atLeast44(button(profile, "关闭 MCP 读取"), "关闭 MCP 读取");
  await axe(page, "knowledge-1440");
  await page.screenshot({ path: join(output, "knowledge-zones-1440.png"), fullPage: true });
  ok("个人说明：确认后开启 MCP 读取；显示 MCP 地址与 Codex、Claude Code、Hermes 配置示例（只显示）；axe 无违规");

  // 4. Agent 通过 MCP 读取个人说明并提交两条建议（模拟 Agent 调用）。
  const read = await mcpCall(mcpUrl, "read_profile", {});
  assert.equal(read.isError, false);
  assert.equal(read.structuredContent.files[0].content, ABOUT);
  const outside = await mcpCall(mcpUrl, "read_profile", { path: "决定/方法A.md" });
  assert.equal(outside.isError, true);
  const p1 = await mcpCall(mcpUrl, "propose_profile_change", {
    path: "个人上下文/关于我.md",
    original: "结论先行。",
    proposed: "结论先行，零寒暄。",
    reason: "多次会话中用户要求去掉寒暄",
    proposer: "Claude Code",
  });
  assert.equal(p1.isError, false);
  const p2 = await mcpCall(mcpUrl, "propose_profile_change", {
    path: "个人上下文/沟通.md",
    original: "先给结论。",
    proposed: "先给结论，再给依据。",
    reason: "测试拒绝流程",
    proposer: "Codex",
  });
  assert.equal(p2.isError, false);
  await unchanged("提交建议");
  ok("MCP：read_profile 返回正文、越界路径被拒；propose_profile_change 只进入待处理，Vault 不变");

  // 5. 待处理：两条建议显示在顶栏计数与待处理页；预览差异→确认采纳；另一条拒绝。
  await page.goto(`${app.url}/#inbox`);
  const proposals = page.getByRole("region", { name: "个人说明修改建议" });
  // 验收201批准：记录区在支线所有任务卡之后，已移出纯建议region。
  const records = page.getByRole("dialog", { name: "待处理", exact: true }).locator(".ib-proposal-records");
  assert.equal(await records.count(), 1, "建议记录区唯一");
  await page.waitForFunction(()=>document.querySelectorAll(".ib-proposals .ib-card").length===2);
  await proposals.getByText("个人上下文/关于我.md · 多次会话中用户要求去掉寒暄").waitFor();
  const card1 = proposals.getByRole("listitem", { name: "建议：个人上下文/关于我.md" });
  await card1.getByText("Claude Code 建议修改个人说明").waitFor();
  await card1.getByText("个人上下文/关于我.md · 多次会话中用户要求去掉寒暄").waitFor();
  await atLeast44(card1.getByRole("button").first(), "查看建议");
  await card1.getByRole("button").first().click();
  const dialog = page.getByRole("region", { name: "预览个人说明修改" });
  await dialog.getByLabel("逐行差异").waitFor();
  await dialog.locator("pre").getByText("结论先行，零寒暄。").waitFor();
  await dialog.getByText("采纳先保存记录；写入个人说明须从建议记录中另行预览、确认。",{exact:true}).waitFor();
  assert.equal(await button(dialog, "采纳").isDisabled(), true);
  await axe(page, "inbox-preview-dialog");
  await page.screenshot({ path: join(output, "profile-preview-1440.png"), fullPage: false });
  await dialog.getByLabel("我已核对差异，确认采纳这条建议").check();
  await atLeast44(button(dialog, "采纳"), "确认采纳");
  await button(dialog, "采纳").click();
  await dialog.waitFor({ state: "detached" });
  await until(async () => (await stored()).profileProposals.find((p) => p.path === "个人上下文/关于我.md").status === "confirmed", "确认采纳");
  await page.waitForFunction(()=>document.querySelectorAll(".ib-proposals .ib-card").length===1);
  await records.locator("summary").click();
  await records.getByText("已确认采纳 · 写入结果以 Vault 操作回执为准",{exact:true}).waitFor();
  assert.equal(await records.getByRole('button',{name:/预览写回个人说明/}).count(),1);
  await unchanged("确认采纳（写入需本机验证）");

  const card2 = proposals.getByRole("listitem", { name: "建议：个人上下文/沟通.md" });
  await card2.getByRole("button").first().click();
  await button(card2, "拒绝").click();
  const rejectDialog = page.getByRole("region", { name: "拒绝这条建议" });
  await button(rejectDialog, "确认拒绝").click();
  await rejectDialog.waitFor({ state: "detached" });
  await until(async () => (await stored()).profileProposals.find((p) => p.path === "个人上下文/沟通.md").status === "rejected", "拒绝");
  await page.waitForFunction(()=>document.querySelectorAll(".ib-proposals .ib-card").length===0);
  if (!await records.getAttribute("open").then(v=>v!==null)) await records.locator("summary").click();
  await records.getByText("已拒绝").waitFor();
  await axe(page, "inbox-1440");
  await page.screenshot({ path: join(output, "inbox-proposals-1440.png"), fullPage: true });
  await unchanged("拒绝");
  ok("待处理：建议进入顶栏与待处理页；预览差异→核对勾选→确认采纳（不写 Vault，标注需本机验证）；拒绝需二次确认");

  // 6. v16 世界总览保留“查知识”入口；本周指标已在知识仓库页头核验。
  const home = await open(1440, "home");
  await button(home, "查知识").click();
  await zonesSection(home).waitFor();
  ok("世界总览：查知识入口进入知识仓库");

  // 7. 390 宽：知识仓库与待处理无横向溢出，axe 无违规。
  const narrow = await open(390, "knowledge", 844);
  await zonesSection(narrow).waitFor();
  await button(zonesSection(narrow), "统计三区").click();
  await until(async () => /\+2/.test(await metric(narrow).innerText()), "390 指标");
  await noOverflow(narrow, "390 知识仓库");
  await atLeast44(button(zonesSection(narrow), "统计三区"), "390 统计三区");
  await openRules(narrow);
  await atLeast44(button(narrow.getByRole("form", { name: "划分规则" }), "添加规则"), "390 添加规则");
  await noOverflow(narrow, "390 规则与 MCP 抽屉");
  await closeRules(narrow);
  await axe(narrow, "knowledge-390");
  await narrow.screenshot({ path: join(output, "knowledge-zones-390.png"), fullPage: false });
  await narrow.goto(`${app.url}/#inbox`);
  await narrow.getByRole("region", { name: "个人说明修改建议" }).waitFor();
  await noOverflow(narrow, "390 待处理");
  await axe(narrow, "inbox-390");
  ok("390 宽：知识仓库与待处理无横向溢出，控件至少 44px，axe 无违规");

  await unchanged("全程");
  assert.deepEqual(errors, []);
  console.log("knowledge-zones-browser 全部通过");
} finally {
  await browser.close();
  await app.close();
  await rm(base, { recursive: true, force: true });
}
