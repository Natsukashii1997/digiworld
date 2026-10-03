// 路线 v3 切片 2.1/2.2：在推进标记、项目状态卡、停滞标红、安全体检与待处理事项。
// 合成 Git 仓库在临时目录现建（见 project-status-fixture.mjs）；GitHub 可见性用模拟适配器，不依赖真实账号。
import { createRequire } from "node:module";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, readdir, readFile, lstat } from "node:fs/promises";
import { join } from "node:path";
import AxeBuilder from "@axe-core/playwright";
import { projectStatusFixture } from "./project-status-fixture.mjs";

const { chromium } = createRequire(import.meta.url)(
  process.env.PLAYWRIGHT_MODULE ||
    "/Users/nat/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright",
);
const output = process.env.GUIJI_TEST_RESULTS || "test-results";
await mkdir(output, { recursive: true });
const app = await projectStatusFixture();
const browser = await chromium.launch();
const errors = [];
const ok = (s) => console.log("PASS", s);

async function tree(dir) {
  const out = {};
  async function walk(d) {
    for (const e of await readdir(d, { withFileTypes: true })) {
      const p = join(d, e.name);
      const info = await lstat(p);
      if (e.isDirectory()) {
        out[p] = `dir ${info.mtimeMs}`;
        await walk(p);
      } else
        out[p] = `${info.mtimeMs} ${createHash("sha256").update(await readFile(p)).digest("hex")}`;
    }
  }
  await walk(dir);
  return out;
}
async function open(width, route = "projects", height = 1000) {
  const context = await browser.newContext({
    viewport: { width, height },
    reducedMotion: "reduce",
  });
  const page = await context.newPage();
  page.setDefaultTimeout(10000);
  page.on("pageerror", (e) => errors.push(`${width} ${e.message}`));
  await page.goto(`${app.url}/#${route}`);
  await page.locator(".page-heading").waitFor();
  return page;
}
const button = (page, name) => page.getByRole("button", { name, exact: true });
const card = (page, name) =>
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
async function mark(name) {
  const ws = await app.workspace();
  const r = await app.call("/project-status/mark", {
    projectId: await app.projectId(name),
    active: true,
    revision: ws.revision,
  });
  assert.equal(r.status, 200, JSON.stringify(r.body));
}

try {
  const before = await tree(app.paths.projects);
  const page = await open(1440);

  // 1. 没有在推进项目时：只显示空提示，不发体检请求。
  const inspects = [];
  page.on("request", (r) => {
    if (r.url().includes("/api/project-status/inspect")) inspects.push(r.url());
  });
  await page.getByRole("region", { name: "在推进项目" }).getByText("在推进 · 0").waitFor();
  assert.equal(inspects.length, 0);
  ok("没有在推进项目时不读取项目文件");

  // 2. 在项目详情里标为在推进 → 状态卡逐项显示 CURRENT 协作状态表。
  await page.locator(".project-discovery-row").filter({ hasText: "协同项目" }).click();
  const toggle = button(page, "标为在推进");
  await atLeast44(toggle, "在推进开关");
  await axe(page, "project-drawer");
  await toggle.click();
  await button(page, "取消在推进").waitFor();
  assert.equal(await button(page, "取消在推进").getAttribute("aria-pressed"), "true");
  assert.equal(
    (await app.workspace()).connections.projects.find((p) => p.name === "协同项目").active,
    true,
  );
  await page.keyboard.press("Escape");
  const collab = card(page, "协同项目");
  await collab.waitFor();
  for (const text of [
    "P-20260930-12",
    "Codex（认领12：状态卡复核）",
    "Claude 读回 12 并合入",
    "Codex 认领12",
    "docs/handoffs/12.md",
  ])
    await collab.getByText(text, { exact: true }).waitFor();
  await collab.getByText("7 天内有更新").waitFor();
  await collab.getByText("未发现问题").waitFor();
  await collab.getByText("私有", { exact: true }).waitFor();
  await page
    .locator(".project-discovery-row")
    .filter({ hasText: "协同项目" })
    .getByText("在推进", { exact: true })
    .waitFor();
  ok("标为在推进后状态卡与 CURRENT 表头逐项一致");

  // 3. 另两个合成仓库：无 CURRENT 的停滞标红；跟踪 .env 的体检有问题。
  await mark("无协议项目");
  await mark("泄露项目");
  await page.reload();
  const bare = card(page, "无协议项目");
  await bare.waitFor();
  await bare.getByText("未装协同协议").waitFor();
  await bare.getByText("停滞 30 天").waitFor();
  assert.match(await bare.getAttribute("class"), /stalled/);
  await bare.getByText("没有远程").waitFor();
  const leaky = card(page, "泄露项目");
  await leaky.getByText("3 项问题").waitFor();
  await leaky.getByText("2 个被跟踪：.env、data/app.sqlite").waitFor();
  await leaky.getByText("1 个", { exact: true }).waitFor();
  await leaky.getByText("公开", { exact: true }).waitFor();
  assert.doesNotMatch(await leaky.getAttribute("class"), /stalled/);
  ok("无 CURRENT 如实显示未装协同协议，30 天无提交标红，体检识别被跟踪的 .env 与公开远程");

  await page.getByRole("region", { name: "在推进项目" }).screenshot({
    path: join(output, "project-status-1440-active-list.png"),
  });
  await collab.screenshot({ path: join(output, "project-status-card.png") });
  await leaky.screenshot({ path: join(output, "project-status-safety-issues.png") });

  // 4. 停滞阈值可在页面调整并保存；读回后不再标红，再改回 7。
  const days = page.getByLabel("停滞阈值（天）");
  await atLeast44(days, "停滞阈值输入框");
  await atLeast44(button(page, "重新体检"), "重新体检按钮");
  await days.fill("40");
  await atLeast44(button(page, "保存阈值"), "保存阈值按钮");
  await button(page, "保存阈值").click();
  await bare.getByText("40 天内有更新").waitFor();
  assert.doesNotMatch(await bare.getAttribute("class"), /stalled/);
  assert.equal((await app.workspace()).connections.projectStallDays, 40);
  await days.fill("7");
  await button(page, "保存阈值").click();
  await bare.getByText("停滞 30 天").waitFor();
  ok("停滞阈值调整后保存并重新判断");
  await axe(page, "projects-1440");
  ok("axe 项目空间 1440 无违规");

  // 5. 待处理：体检问题与停滞各一条，只汇总和跳转。
  const inbox = page.getByRole("button", { name: /^待处理 \d+ 项$/ });
  const count = Number((await inbox.getAttribute("aria-label")).match(/\d+/)[0]);
  assert.ok(count >= 3, `待处理 ${count} 项`);
  await inbox.click();
  const safetyItem = page.getByRole("button", {
    name: /项目「泄露项目」安全体检发现 3 项问题/,
  });
  await safetyItem.waitFor();
  await page.getByRole("button", { name: /项目「无协议项目」安全体检发现 1 项问题/ }).waitFor();
  const stallItem = page.getByRole("button", {
    name: /项目「无协议项目」已 30 天没有状态更新或提交/,
  });
  await stallItem.waitFor();
  assert.equal(
    await page.getByRole("button", { name: /项目「协同项目」/ }).count(),
    0,
  );
  await atLeast44(safetyItem, "待处理事项");
  await axe(page, "inbox-1440");
  await page.locator(".inbox-section").first().screenshot({
    path: join(output, "project-status-inbox.png"),
  });
  await safetyItem.click();
  await page.waitForURL(/#projects$/);
  await card(page, "泄露项目").waitFor();
  ok("待处理列出体检与停滞事项，点击跳到项目空间");

  // 6. 390 宽：无横向溢出，控件不小于 44px。
  const narrow = await open(390, "projects", 844);
  await card(narrow, "协同项目").waitFor();
  await card(narrow, "泄露项目").getByText("3 项问题").waitFor();
  await noOverflow(narrow, "390 项目空间");
  await atLeast44(button(narrow, "保存阈值"), "390 保存阈值");
  await atLeast44(button(narrow, "重新体检"), "390 重新体检");
  await axe(narrow, "projects-390");
  await narrow.goto(`${app.url}/#inbox`);
  await narrow.getByRole("button", { name: /项目「泄露项目」安全体检/ }).waitFor();
  await noOverflow(narrow, "390 待处理");
  ok("390 宽无横向溢出、44px、axe 无违规");

  // 7. 只读：全过程项目文件（含 .git）逐字节不变。
  assert.deepEqual(await tree(app.paths.projects), before);
  ok("全过程未修改任何项目文件");
  assert.deepEqual(errors, []);
  ok("无页面脚本错误");
} finally {
  await browser.close();
  await app.close();
}
