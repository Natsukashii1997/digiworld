// 路线 v3 切片 2.3/2.4：协同看板（模板 #1 阶段条、笔在谁手上）、操作留痕时间线、
// 一键派发（预览 → 确认 → 复制 → 计入留痕）与一键开工。合成 Git 仓库与合成 CURRENT.md 在临时目录现建。
import { createRequire } from "node:module";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, readdir, readFile, lstat } from "node:fs/promises";
import { join } from "node:path";
import AxeBuilder from "@axe-core/playwright";
import { collabBoardFixture, HANDOFF_FILES } from "./collab-board-fixture.mjs";

const { chromium } = createRequire(import.meta.url)(
  process.env.PLAYWRIGHT_MODULE ||
    "/Users/nat/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright",
);
const output = process.env.GUIJI_TEST_RESULTS || "test-results";
await mkdir(output, { recursive: true });
const app = await collabBoardFixture();
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
      } else if (e.isSymbolicLink()) out[p] = `link ${info.mtimeMs}`;
      else out[p] = `${info.mtimeMs} ${sha(await readFile(p))}`;
    }
  }
  await walk(dir);
  return out;
}
async function open(width, route = "collab", height = 1000) {
  const context = await browser.newContext({
    viewport: { width, height },
    reducedMotion: "reduce",
    permissions: ["clipboard-read", "clipboard-write"],
  });
  const page = await context.newPage();
  page.setDefaultTimeout(10000);
  page.on("pageerror", (e) => errors.push(`${width} ${e.message}`));
  await page.goto(`${app.url}/#${route}`);
  await page.locator(".page-heading").waitFor();
  return page;
}
const button = (scope, name) => scope.getByRole("button", { name, exact: true });
const board = (page, name) =>
  page.getByRole("article", { name: `协同看板：${name}`, exact: true });
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
const log = async () => (await app.workspace()).collabLog || [];

try {
  const before = await tree(app.paths.projects);

  // 1. 没有在推进项目：协同页可用（不再是规划页），提示去项目空间标记，不读取项目文件。
  const page = await open(1440);
  const boards = [];
  page.on("request", (r) => {
    if (r.url().includes("/api/collab/board")) boards.push(r.url());
  });
  await page.getByRole("heading", { name: "还没有在推进项目" }).waitFor();
  assert.equal(await page.getByText("尚未开发，这个页面不会执行任何动作").count(), 0);
  assert.equal(boards.length, 0);
  await atLeast44(button(page, "去项目空间标记"), "去项目空间标记");
  await axe(page, "collab-empty");
  ok("没有在推进项目时协同页给出去处，不读取项目文件");

  // 2. 看板：模板 #1 阶段条、当前阶段与依据、笔在谁手上，均来自合成 CURRENT.md。
  await app.mark("协同项目");
  await app.mark("无协议项目");
  await page.reload();
  const collab = board(page, "协同项目");
  await collab.waitFor();
  const stages = collab.getByRole("list", { name: "模板 #1 流程阶段" });
  assert.deepEqual(
    (await stages.getByRole("listitem").allInnerTexts()).map((t) => t.replace(/\s+/g, "")),
    ["1认领", "2实现", "3复核", "4返修", "5验收"],
  );
  assert.equal(
    (await stages.locator('[aria-current="step"]').innerText()).replace(/\s+/g, ""),
    "4返修",
  );
  await collab.getByText("当前阶段：返修").waitFor();
  await collab.getByText("依据最新状态标题中的“返修”").waitFor();
  await collab.getByText("无人持笔（写入者为“无”）").waitFor();
  await collab.getByText("P-20260930-14", { exact: true }).waitFor();
  await collab.getByText("Codex 读回 14，独立复核状态卡返修", { exact: true }).waitFor();
  const bare = board(page, "无协议项目");
  await bare.getByText("当前阶段：未知").waitFor();
  assert.equal(await bare.locator('[aria-current="step"]').count(), 0);
  await bare.getByText("项目里没有 CURRENT.md").waitFor();
  await bare.getByText("未知（读不到当前写入者）").waitFor();
  ok("看板阶段条、当前阶段与持笔者与合成 CURRENT 一致；推断不了显示未知");

  // 3. 操作留痕：状态链 4 节 + 交接文档 4 份（不含 notes.txt 与符号链接），可展开全部。
  const timeline = page.getByRole("region", { name: "操作留痕：协同项目" });
  await timeline.getByRole("heading", { name: "操作留痕 · 8" }).waitFor();
  assert.equal(await timeline.getByRole("listitem").count(), 8);
  for (const title of [
    "Claude 返修（P-20260930-14）",
    "Codex 独立复核（P-20260930-13）",
    "Claude 实现状态卡（P-20260929-12）",
    "Claude 认领 11（P-20260929-11）",
    ...HANDOFF_FILES,
  ])
    await timeline.getByText(title, { exact: true }).waitFor();
  assert.equal(await timeline.getByText("notes.txt").count(), 0);
  assert.equal(await timeline.getByText("2026-09-30-link.md").count(), 0);
  assert.equal(await page.getByText(/BODY-MARKER/).count(), 0);
  await collab.screenshot({ path: join(output, "collab-board-1440.png") });
  ok("时间线列出每一节状态与每一份交接文档，只用文件名与时间");

  // 4. 一键派发：选下一棒 → 预览完整口令 → 取消不计；确认后复制并计入留痕。
  const picker = collab.getByLabel("下一棒");
  await atLeast44(picker, "下一棒选择");
  await atLeast44(button(collab, "生成派发口令"), "生成派发口令");
  await picker.selectOption({ label: "Codex" });
  await button(collab, "生成派发口令").click();
  let dialog = page.getByRole("dialog", { name: "派发口令：协同项目" });
  await dialog.waitFor();
  const preview = await dialog.getByLabel("口令预览").innerText();
  for (const part of [
    "下一棒：Codex",
    `项目路径：${app.paths.collab}`,
    "1. AGENTS.md",
    "2. CURRENT.md",
    "3. COLLABORATION.md",
    "最新交接：docs/agents/handoffs/2026-09-30-claude-14.md",
    "state_id P-20260930-14",
    "流程阶段：返修",
    "唯一下一步：Codex 读回 14，独立复核状态卡返修",
    "验收标准",
    "禁止事项",
    "要回交的证据",
  ])
    assert.ok(preview.includes(part), `口令缺少 ${part}`);
  // 口令里不能有交接正文、本机会话令牌或请求头名（“禁止事项”里的“Token”一词是规则文字，不是凭据）。
  const { token } = await (
    await fetch(app.url + "/api/session", { headers: { "x-workbench-client": "1" } })
  ).json();
  assert.ok(token && !preview.includes(token), "口令包含本机会话令牌");
  assert.doesNotMatch(preview, /BODY-MARKER|x-workbench/i);
  await axe(page, "dispatch-dialog");
  await atLeast44(button(dialog, "确认并复制"), "确认并复制");
  await dialog.screenshot({ path: join(output, "collab-dispatch-dialog.png") });
  await button(dialog, "取消").click();
  await dialog.waitFor({ state: "detached" });
  assert.equal((await log()).length, 0);

  await button(collab, "生成派发口令").click();
  dialog = page.getByRole("dialog", { name: "派发口令：协同项目" });
  await button(dialog, "确认并复制").click();
  await dialog.waitFor({ state: "detached" });
  const copied = await page.evaluate(() => navigator.clipboard.readText());
  assert.equal(copied, preview);
  let records = await log();
  assert.equal(records.length, 1);
  assert.equal(records[0].kind, "dispatch");
  assert.equal(records[0].agent, "codex");
  assert.equal(records[0].stateId, "P-20260930-14");
  assert.equal(records[0].stage, "rework");
  assert.equal(records[0].promptSha256, sha(copied));
  assert.equal(Object.hasOwn(records[0], "prompt"), false);
  await timeline.getByText("复制派发口令给 Codex（输入状态 P-20260930-14）").waitFor();
  await timeline.getByRole("heading", { name: "操作留痕 · 9" }).waitFor();
  await page.getByText("口令已复制，已计入操作留痕").waitFor();
  ok("派发口令字段完整；取消不计；确认后剪贴板与预览一致，留痕只存指纹");

  // 5. 复制失败：不计入留痕，给出可手动选取的提示。
  await page.evaluate(() => {
    Object.defineProperty(navigator.clipboard, "writeText", {
      configurable: true,
      value: () => Promise.reject(new Error("denied")),
    });
  });
  await picker.selectOption({ label: "Hermes" });
  await button(collab, "生成派发口令").click();
  dialog = page.getByRole("dialog", { name: "派发口令：协同项目" });
  await dialog.getByText("下一棒：Hermes").waitFor();
  await button(dialog, "确认并复制").click();
  await dialog.getByRole("alert").getByText(/复制失败，口令没有进入剪贴板，也没有计入留痕/).waitFor();
  assert.equal((await log()).length, 1);
  await page.keyboard.press("Escape");
  await dialog.waitFor({ state: "detached" });
  ok("剪贴板拒绝时不计入留痕");

  // 6. 刷新后时间线仍能读回主库里的派发记录；展开全部。
  await page.reload();
  const again = page.getByRole("region", { name: "操作留痕：协同项目" });
  await again.getByText("复制派发口令给 Codex（输入状态 P-20260930-14）").waitFor();
  await atLeast44(button(again, "展开全部 9 条"), "展开全部");
  await button(again, "展开全部 9 条").click();
  assert.equal(await again.getByRole("listitem").count(), 9);
  await axe(page, "collab-1440");
  ok("留痕写入本机主库，刷新后读回；axe 协同页无违规");

  // 7. 一键开工（项目空间的在推进项目卡）：生成开工口令，确认后复制，计入留痕。
  const projects = await open(1440, "projects");
  const statusCard = projects.getByRole("article", { name: "项目状态卡：协同项目", exact: true });
  await statusCard.waitFor();
  const startPicker = statusCard.getByLabel("开工 Agent");
  await atLeast44(startPicker, "开工 Agent 选择");
  await startPicker.selectOption({ label: "Claude Code" });
  await atLeast44(button(statusCard, "生成开工口令"), "生成开工口令");
  await button(statusCard, "生成开工口令").click();
  dialog = projects.getByRole("dialog", { name: "开工口令：协同项目" });
  const startText = await dialog.getByLabel("口令预览").innerText();
  for (const part of [
    "开工：Claude Code",
    `项目路径：${app.paths.collab}`,
    "1. AGENTS.md",
    "2. CURRENT.md",
    "唯一下一步：Codex 读回 14，独立复核状态卡返修",
  ])
    assert.ok(startText.includes(part), `开工口令缺少 ${part}`);
  await axe(projects, "start-dialog");
  await button(dialog, "确认并复制").click();
  await dialog.waitFor({ state: "detached" });
  assert.equal(await projects.evaluate(() => navigator.clipboard.readText()), startText);
  records = await log();
  assert.equal(records.length, 2);
  assert.deepEqual(
    [records[1].kind, records[1].agent, records[1].promptSha256],
    ["start", "claude-code", sha(startText)],
  );
  ok("一键开工口令字段齐全，确认后复制并计入留痕");

  // 8. 390 宽：看板、时间线与口令弹窗无横向溢出，控件不小于 44px，axe 无违规。
  const narrow = await open(390, "collab", 844);
  const small = board(narrow, "协同项目");
  await small.getByText("当前阶段：返修").waitFor();
  await noOverflow(narrow, "390 协同页");
  await atLeast44(small.getByLabel("下一棒"), "390 下一棒");
  await atLeast44(button(small, "生成派发口令"), "390 生成派发口令");
  for (const item of await small.getByRole("list", { name: "模板 #1 流程阶段" }).getByRole("listitem").all())
    await atLeast44(item, "390 阶段");
  await axe(narrow, "collab-390");
  await small.screenshot({ path: join(output, "collab-board-390.png") });
  await button(small, "生成派发口令").click();
  const narrowDialog = narrow.getByRole("dialog", { name: "派发口令：协同项目" });
  await narrowDialog.waitFor();
  await noOverflow(narrow, "390 派发弹窗");
  await atLeast44(button(narrowDialog, "确认并复制"), "390 确认并复制");
  await axe(narrow, "dispatch-dialog-390");
  await narrow.keyboard.press("Escape");
  await narrow.goto(`${app.url}/#projects`);
  await narrow.getByRole("article", { name: "项目状态卡：协同项目", exact: true }).waitFor();
  await noOverflow(narrow, "390 项目空间");
  ok("390 宽无横向溢出、44px、axe 无违规");

  // 9. 只读：全过程项目文件（含 .git 与交接文档）逐字节不变。
  assert.deepEqual(await tree(app.paths.projects), before);
  ok("全过程未修改任何项目文件");
  assert.deepEqual(errors, []);
  ok("无页面脚本错误");
} finally {
  await browser.close();
  await app.close();
}
