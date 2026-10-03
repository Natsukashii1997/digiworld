// 项目空间第二批：GitHub 面板（只读 gh + 缓存 + 未知回退）与世界总览“今日项目简报”（规则生成、标为已读、一键开工）。
// 合成 Git 仓库在临时目录现建；gh 用本地桩脚本（见 project-brief-fixture.mjs），不调用真实 GitHub。
import { createRequire } from "node:module";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, readdir, readFile, lstat, writeFile } from "node:fs/promises";
import { join } from "node:path";
import AxeBuilder from "@axe-core/playwright";
import { projectBriefFixture, git } from "./project-brief-fixture.mjs";
import { readOnlyGhArgs } from "../server/project-github.mjs";

const { chromium } = createRequire(import.meta.url)(
  process.env.PLAYWRIGHT_MODULE ||
    "/Users/nat/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright",
);
const output = process.env.GUIJI_TEST_RESULTS || "test-results";
await mkdir(output, { recursive: true });
const app = await projectBriefFixture();
const browser = await chromium.launch();
const errors = [];
const ok = (s) => console.log("PASS", s);
const sha = (text) => createHash("sha256").update(text).digest("hex");

async function tree(dir) {
  const out = {};
  async function walk(d) {
    for (const e of await readdir(d, { withFileTypes: true })) {
      const p = join(d, e.name);
      const info = await lstat(p);
      if (e.isDirectory()) {
        out[p] = `dir ${info.mtimeMs}`;
        await walk(p);
      } else out[p] = `${info.mtimeMs} ${sha(await readFile(p))}`;
    }
  }
  await walk(dir);
  return out;
}
async function open(width, route = "home", height = 1000) {
  const context = await browser.newContext({
    viewport: { width, height },
    reducedMotion: "reduce",
    permissions: ["clipboard-read", "clipboard-write"],
  });
  const page = await context.newPage();
  page.setDefaultTimeout(10000);
  page.on("pageerror", (e) => errors.push(`${width} ${e.message}`));
  await page.goto(`${app.url}/#${route}`);
  await page.locator("main h1").first().waitFor();
  return page;
}
const button = (scope, name) => scope.getByRole("button", { name, exact: true });
const briefCard = (page) => page.getByRole("region", { name: "今日项目简报" });
const brief = (page, name) =>
  page.getByRole("article", { name: `项目简报：${name}`, exact: true });
const statusCard = (page, name) =>
  page.getByRole("article", { name: `项目状态卡：${name}`, exact: true });
async function atLeast44(locator, name) {
  const box = await locator.boundingBox();
  assert.ok(box, `${name} 不可见`);
  assert.ok(
    box.width >= 44 && box.height >= 44,
    `${name} 点击区域 ${box.width}x${box.height}，应至少 44px`,
  );
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
async function noOverflow(page, label) {
  const extra = await page.evaluate(
    () => document.documentElement.scrollWidth - window.innerWidth,
  );
  assert.ok(extra <= 0, `${label} 横向溢出 ${extra}px`);
}
async function ghCallsReadOnly() {
  const calls = await app.gh.calls();
  for (const args of calls) assert.deepEqual(readOnlyGhArgs(args), args);
  return calls;
}

try {
  // 1. 没有在推进项目：简报卡只给提示，不请求简报与 GitHub 面板，gh 一次都不调用。
  const page = await open(1440);
  const requests = [];
  page.on("request", (r) => {
    if (/\/api\/(project-brief|project-github)\//.test(r.url())) requests.push(r.url());
  });
  await briefCard(page).getByRole("heading", { name: "今日项目简报" }).waitFor();
  await briefCard(page).getByText("还没有在推进项目", { exact: false }).waitFor();
  await page.goto(`${app.url}/#projects`);
  await page.getByRole("region", { name: "在推进项目" }).getByText("在推进 · 0").waitFor();
  assert.deepEqual(requests, []);
  assert.deepEqual(await app.gh.calls(), []);
  ok("没有在推进项目时不查询 GitHub、不生成简报");

  // 2. 三个在推进项目：项目空间状态卡里的 GitHub 面板。
  for (const name of ["协同项目", "泄露项目", "无协议项目"]) await app.mark(name);
  const before = await tree(app.paths.projects);
  await page.reload();
  const collab = statusCard(page, "协同项目");
  await collab.waitFor();
  const gh = collab.getByLabel("GitHub");
  await gh.getByText("tester/collab", { exact: true }).waitFor();
  await gh.getByText("打开的 PR · 2", { exact: true }).waitFor();
  const pr7 = gh.getByRole("link", { name: "#7 状态卡返修" });
  await pr7.waitFor();
  assert.equal(await pr7.getAttribute("href"), "https://github.com/tester/collab/pull/7");
  assert.equal(await pr7.getAttribute("target"), "_blank");
  assert.match(await pr7.getAttribute("rel"), /noopener/);
  await gh.getByRole("link", { name: "#5 很早的草稿（草稿）" }).waitFor();
  await gh.getByText("最近合并 · 2", { exact: true }).waitFor();
  await gh.getByRole("link", { name: /^#6 接入停滞雷达 · / }).waitFor();
  await gh.getByText("打开的 Issue · 1", { exact: true }).waitFor();
  await gh.getByRole("link", { name: "#3 状态卡在窄屏折行" }).waitFor();
  await gh.getByText("失败", { exact: true }).waitFor();
  await gh.getByRole("link", { name: /^CI · main · / }).waitFor();
  await gh.getByText(/^更新于 .+ · 本机 gh 只读查询$/).waitFor();
  await statusCard(page, "泄露项目")
    .getByLabel("GitHub")
    .getByText("未知 · 没有权限或仓库不存在", { exact: false })
    .waitFor();
  await statusCard(page, "无协议项目")
    .getByLabel("GitHub")
    .getByText("没有 GitHub 远程，不查询 GitHub。")
    .waitFor();
  await atLeast44(button(page, "刷新 GitHub"), "刷新 GitHub");
  await atLeast44(pr7, "PR 链接");
  await axe(page, "projects-github-1440");
  await collab.screenshot({ path: join(output, "projects-brief-github-card.png") });
  const calls = await ghCallsReadOnly();
  assert.ok(calls.length >= 6, `gh 调用 ${calls.length} 次`);
  ok("GitHub 面板显示打开的 PR、最近合并、Issue 与默认分支 CI，无权限显示未知，无远程不查询");

  // 3. 世界总览“今日项目简报”：每个在推进项目一段话。
  await page.goto(`${app.url}/#home`);
  const card = briefCard(page);
  const collabBrief = brief(page, "协同项目");
  await collabBrief.waitFor();
  const collabText = await collabBrief.locator(".brief-text").innerText();
  for (const part of [
    "昨天到今天：",
    "CURRENT 新增 1 个状态",
    "新增交接 1 份：",
    "新提交 4 个",
    "新开 PR 1 个（#7 状态卡返修）",
    "合并 PR 1 个（#6 接入停滞雷达）",
    "CI 由成功变为失败",
    "今天的唯一下一步：Codex 复核 21 号 GitHub 面板",
    "卡点：默认分支 CI 失败（CI）",
  ])
    assert.ok(collabText.includes(part), `协同项目简报缺少：${part}\n${collabText}`);
  assert.doesNotMatch(collabText, /BODY-MARKER|#5|#4|很早|初始化/);
  await collabBrief.getByText("未读", { exact: true }).waitFor();
  const leakyText = await brief(page, "泄露项目").locator(".brief-text").innerText();
  assert.match(leakyText, /GitHub 情况未知（没有权限或仓库不存在）/);
  assert.match(leakyText, /今天的唯一下一步：未知（项目里没有 CURRENT\.md）/);
  assert.match(leakyText, /安全体检发现 3 项问题/);
  const bareText = await brief(page, "无协议项目").locator(".brief-text").innerText();
  assert.match(bareText, /昨天到今天：没有记录到新的变化/);
  assert.match(bareText, /已 30 天没有状态更新或提交/);
  // 用户 2026-10-03：区间改为从上次标为已读起，没标过从昨天 0:00 起；每条写明统计起点。
  await card.getByText("统计区间：从上次标为已读起，没标过从昨天 0:00 起", { exact: false }).waitFor();
  await collabBrief.getByText(/^统计自 \d\d\/\d\d 00:00 起$/).waitFor();
  for (const name of ["刷新简报", "全部标为已读"]) await atLeast44(button(card, name), name);
  await atLeast44(button(collabBrief, "标为已读"), "标为已读");
  await atLeast44(button(collabBrief, "一键开工"), "一键开工");
  await atLeast44(collabBrief.getByLabel("开工 Agent"), "开工 Agent 选择");
  await axe(page, "home-brief-1440");
  await card.screenshot({ path: join(output, "projects-brief-home-1440.png") });
  ok("今日项目简报逐项写出昨天到今天的变化、唯一下一步与卡点");

  // 4. 标为已读：写入主库，刷新后仍是已读。
  await button(collabBrief, "标为已读").click();
  await collabBrief.getByText("已读", { exact: true }).first().waitFor();
  assert.equal(await button(collabBrief, "已读").isDisabled(), true);
  let reads = (await app.workspace()).briefReads;
  assert.equal(reads.length, 1);
  assert.equal(reads[0].projectId, await app.projectId("协同项目"));
  await page.reload();
  await brief(page, "协同项目").waitFor();
  await button(brief(page, "协同项目"), "已读").waitFor();
  await brief(page, "泄露项目").getByText("未读", { exact: true }).waitFor();
  ok("标为已读存入主库，刷新后保持");

  // 5. 一键开工：复用 2.4 的开工口令，确认后复制并计入协同留痕。
  const leaky = brief(page, "泄露项目");
  await leaky.getByLabel("开工 Agent").selectOption({ label: "Claude Code" });
  await button(leaky, "一键开工").click();
  const dialog = page.getByRole("dialog", { name: "开工口令：泄露项目" });
  const prompt = await dialog.getByLabel("口令预览").innerText();
  for (const part of [
    "开工：Claude Code",
    `项目路径：${app.paths.leaky}`,
    "唯一下一步：未知（项目里没有 CURRENT.md；先向用户确认）",
  ])
    assert.ok(prompt.includes(part), `开工口令缺少 ${part}\n${prompt}`);
  await axe(page, "brief-start-dialog");
  await button(dialog, "确认并复制").click();
  await dialog.waitFor({ state: "detached" });
  assert.equal(await page.evaluate(() => navigator.clipboard.readText()), prompt);
  const log = (await app.workspace()).collabLog || [];
  assert.equal(log.length, 1);
  assert.deepEqual(
    [log[0].kind, log[0].agent, log[0].promptSha256],
    ["start", "claude-code", sha(prompt)],
  );
  ok("简报里的一键开工生成开工口令，复制后计入留痕");

  // 6. 全部标为已读。
  await button(briefCard(page), "全部标为已读").click();
  await button(brief(page, "泄露项目"), "已读").waitFor();
  await button(brief(page, "无协议项目"), "已读").waitFor();
  assert.equal((await app.workspace()).briefReads.length, 3);
  assert.equal(await button(briefCard(page), "全部标为已读").isDisabled(), true);
  ok("全部标为已读");

  // 7. 只读：面板与简报全过程不修改项目文件（含 .git）。
  assert.deepEqual(await tree(app.paths.projects), before);
  ok("全过程未修改任何项目文件");

  // 8. 项目又有新提交：刷新简报后显示“有更新”（内容指纹变了），可以再次标为已读。
  await writeFile(join(app.paths.collab, "step-3.md"), "第 3 步\n");
  await git(app.paths.collab, ["add", "-A"]);
  await git(app.paths.collab, ["commit", "-q", "-m", "第 3 步"]);
  await button(briefCard(page), "刷新简报").click();
  await brief(page, "协同项目").getByText("有更新", { exact: true }).waitFor();
  assert.match(await brief(page, "协同项目").locator(".brief-text").innerText(), /新提交 5 个/);
  await button(brief(page, "协同项目"), "标为已读").click();
  await button(brief(page, "协同项目"), "已读").waitFor();
  reads = (await app.workspace()).briefReads;
  assert.equal(reads.length, 3);
  ok("内容变化后显示“有更新”，再次标为已读只替换当天记录");

  // 9. gh 未登录：刷新后如实显示“未知”，不弹错误、不要求登录。
  await app.gh.mode("auth");
  await page.goto(`${app.url}/#projects`);
  await statusCard(page, "协同项目").waitFor();
  await button(page, "刷新 GitHub").click();
  const unknown = statusCard(page, "协同项目").getByLabel("GitHub");
  await unknown.getByText(/^未知 · gh 未登录（上次成功查询：.+）$/).waitFor();
  assert.equal(await page.getByRole("alert").count(), 0);
  assert.doesNotMatch(
    await page.getByRole("region", { name: "在推进项目" }).innerText(),
    /请.{0,6}登录|gh auth login/,
  );
  await unknown.screenshot({ path: join(output, "projects-brief-github-unknown.png") });
  await page.goto(`${app.url}/#home`);
  await button(briefCard(page), "刷新简报").click();
  await brief(page, "协同项目")
    .getByText(/GitHub 情况未知（gh 未登录）/)
    .waitFor();
  await ghCallsReadOnly();
  ok("gh 未登录时面板与简报都显示未知，不报错、不要求登录");

  // 10. 390 宽：无横向溢出、控件不小于 44px、axe 无违规。
  const narrow = await open(390, "home", 844);
  await brief(narrow, "协同项目").waitFor();
  await noOverflow(narrow, "390 世界总览");
  await atLeast44(button(brief(narrow, "协同项目"), "一键开工"), "390 一键开工");
  await atLeast44(button(briefCard(narrow), "刷新简报"), "390 刷新简报");
  await axe(narrow, "home-brief-390");
  await briefCard(narrow).screenshot({ path: join(output, "projects-brief-home-390.png") });
  await narrow.goto(`${app.url}/#projects`);
  await statusCard(narrow, "协同项目").getByLabel("GitHub").waitFor();
  await noOverflow(narrow, "390 项目空间");
  await atLeast44(button(narrow, "刷新 GitHub"), "390 刷新 GitHub");
  await axe(narrow, "projects-github-390");
  ok("390 宽无横向溢出、44px、axe 无违规");

  assert.deepEqual(errors, []);
  ok("无页面脚本错误");
} finally {
  await browser.close();
  await app.close();
}
