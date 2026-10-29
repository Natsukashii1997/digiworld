import { openSettingsDrawer, openCapabilityMore, capabilitySwitch } from "./settings-entry.mjs";
import { createRequire } from "node:module";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import assert from "node:assert/strict";
import AxeBuilder from "@axe-core/playwright";
import {
  compilationFixture,
  makeCandidate,
  principle,
  retrospective,
} from "./compilation-fixture.mjs";

const require = createRequire(import.meta.url);
const { chromium } = require(
  process.env.PLAYWRIGHT_MODULE ||
    "/Users/nat/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright",
);
const output =
  process.env.GUIJI_TEST_RESULTS || "test-results/knowledge-compilation";
await mkdir(output, { recursive: true });
const app = await compilationFixture();
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({
  viewport: { width: 1280, height: 900 },
  reducedMotion: "reduce",
});
const page = await context.newPage();
page.setDefaultTimeout(7000);
const report = { flows: [], axe: [], errors: [], geometry: [], failure: null };
page.on("pageerror", (error) => report.errors.push(error.message));
const b = (name) => page.getByRole("button", { name, exact: true });
const dialog = () =>
  page.getByRole("dialog", { name: "整理任务", exact: true });
const question = "如何修订合成项目的审核原则，哪些仍需确认？";
async function shot(name) {
  if (await b("关闭提示").count()) await b("关闭提示").click();
  await page.screenshot({ path: join(output, name + ".png"), fullPage: true });
}
async function axe(name) {
  const r = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
    .analyze();
  report.axe.push({ state: name, violations: r.violations });
  assert.deepEqual(r.violations, []);
}
async function connect(name, root) {
  await b("连接知识源").click();
  await page.getByLabel("来源名称", { exact: true }).fill(name);
  await page.getByLabel("目录绝对路径", { exact: true }).fill(root);
  await page.getByLabel("我确认仅只读访问此目录", { exact: true }).check();
  await b("确认连接").click();
  await page.getByRole("heading", { name, exact: true }).waitFor();
}
async function add(path) {
  await b("扫描文件").click();
  await page.getByText("扫描完成", { exact: true }).waitFor();
  await b(path).click();
  await b("加入整理").click();
  assert.equal(await b("已加入整理").isDisabled(), true);
}
async function chooseFile(candidate, name = "candidate.json") {
  await page.getByLabel("候选 JSON 文件", { exact: true }).setInputFiles({
    name,
    mimeType: "application/json",
    buffer: Buffer.from(
      typeof candidate === "string" ? candidate : JSON.stringify(candidate),
    ),
  });
}
try {
  await page.goto(app.url + "/#knowledge");
  await page.getByRole("region", { name: "知识整理", exact: true }).waitFor();
  await shot("01-empty-1280");
  await axe("空态");
  await connect("合成会议", app.roots[0]);
  await add("专题/判断原则.md");
  await connect("合成复盘", app.roots[1]);
  await add("复盘.md");
  await page.getByText("已选择 2 / 5 份资料", { exact: true }).waitFor();
  await page.getByLabel("整理问题", { exact: true }).fill(question);
  await page
    .getByLabel("我确认仅交给本人 Codex，任务与候选保存在工作台", {
      exact: true,
    })
    .check();
  await shot("02-multi-source-1280");
  await axe("跨来源选择");
  await b("创建整理任务").click();
  await dialog().waitFor();
  let state = await app.workspace();
  assert.equal(state.knowledgeTasks.length, 1);
  const task = state.knowledgeTasks[0];
  assert.equal(task.evidence.length, 2);
  assert.equal(new Set(task.evidence.map((v) => v.sourceId)).size, 2);
  assert.ok(!JSON.stringify(state).includes(principle));
  report.flows.push(
    "两个来源查看原文后加入整理、去重禁用、明确本人范围后创建并持久保存",
  );
  await page
    .getByLabel("我确认仅将任务文本交给本人 Codex", { exact: true })
    .check();
  await b("准备任务文本").click();
  const text = page.getByRole("textbox", { name: "整理任务文本", exact: true });
  await text.waitFor();
  assert.ok((await text.inputValue()).includes(task.manifestHash));
  assert.ok(!(await text.inputValue()).includes(principle));
  await page.evaluate(() =>
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: {
        writeText: async () => {
          throw new Error("Denied");
        },
      },
    }),
  );
  await b("复制任务文本").click();
  assert.ok((await text.inputValue()).includes(task.id));
  await shot("03-task-packet-1280");
  await axe("任务文本与复制回退");
  report.flows.push(
    "任务包只含版本指针与候选合同，不含来源正文；剪贴板失败仍可手动复制",
  );
  await chooseFile("{not valid JSON");
  await b("导入候选").click();
  await dialog().getByRole("alert").waitFor();
  assert.equal(
    await page
      .getByLabel("候选 JSON 文件", { exact: true })
      .evaluate((el) => el.files.length),
    1,
  );
  const candidate = makeCandidate(task);
  await chooseFile({ ...candidate, approved: true });
  await b("导入候选").click();
  await dialog().getByRole("alert").waitFor();
  assert.equal((await app.workspace()).knowledgeTasks[0].candidates.length, 0);
  await chooseFile(candidate);
  await b("导入候选").click();
  await dialog().getByText(candidate.title, { exact: true }).waitFor();
  assert.equal((await app.workspace()).knowledgeTasks[0].candidates.length, 1);
  assert.equal(await page.evaluate(() => window.candidateExecuted), undefined);
  assert.equal(await dialog().locator("script").count(), 0);
  await b("核对来源").click();
  await dialog()
    .getByText(/^本次核对：与创建时一致/)
    .waitFor();
  await shot("04-candidate-check-1280");
  await axe("候选主张和来源核对");
  report.flows.push(
    "非法JSON/自报approved被拒且保留文件；合法候选显示主张、冲突、未知、关系，脚本只作文字，核对不等于采纳",
  );
  await chooseFile(candidate);
  await b("导入候选").click();
  await b("导入候选").waitFor();
  await page.waitForFunction(
    () => document.querySelector('input[type="file"]')?.files.length === 0,
  );
  assert.equal((await app.workspace()).knowledgeTasks[0].candidates.length, 1);
  report.flows.push("同候选重复导入无新版本，导入后旧来源检查撤回");
  for (const width of [375, 430, 1280]) {
    await page.setViewportSize({ width, height: 900 });
    const geometry = await page.evaluate(() => ({
      scroll: document.documentElement.scrollWidth,
      width: innerWidth,
      dialog: (() => {
        const r = document
          .querySelector('[role="dialog"]')
          .getBoundingClientRect();
        return { x: r.x, width: r.width };
      })(),
    }));
    report.geometry.push(geometry);
    assert.ok(geometry.scroll <= width, JSON.stringify(geometry));
    assert.ok(geometry.dialog.x >= 0 && geometry.dialog.width <= width);
    await shot("05-candidate-" + width);
    await axe("候选详情宽度" + width);
  }
  await page.reload();
  await b("打开整理任务：" + question).click();
  await dialog().getByText(candidate.title, { exact: true }).waitFor();
  assert.equal(
    await page
      .getByRole("textbox", { name: "整理任务文本", exact: true })
      .count(),
    0,
  );
  assert.equal(
    await dialog()
      .getByText(/^本次核对：与创建时一致/)
      .count(),
    0,
  );
  assert.equal((await app.workspace()).knowledgeTasks[0].candidates.length, 1);
  report.flows.push("刷新后任务和候选保留，旧任务包及当前有效检查不恢复");
  await app.changeFile(
    "专题/判断原则.md",
    principle + "\n更正：该记录不可作为最新原则。\n",
  );
  await b("核对来源").click();
  await dialog()
    .getByText(/^本次核对：来源已变/)
    .waitFor();
  await page
    .getByLabel("我确认仅将任务文本交给本人 Codex", { exact: true })
    .check();
  await b("准备任务文本").click();
  await dialog().getByRole("alert").waitFor();
  assert.equal(
    await page
      .getByRole("textbox", { name: "整理任务文本", exact: true })
      .count(),
    0,
  );
  await shot("06-source-changed-1280");
  await axe("来源变化拦截");
  report.flows.push(
    "真实合成文件更正后旧证据显示来源已变，准备任务失败，不静默换新版",
  );
  await b("归档任务").click();
  await b("取消归档").click();
  assert.equal((await app.workspace()).knowledgeTasks[0].archived, false);
  await b("归档任务").click();
  await b("确认归档").click();
  await dialog().waitFor({ state: "hidden" });
  await b("已归档").click();
  await b("打开整理任务：" + question).click();
  assert.equal((await app.workspace()).knowledgeTasks[0].archived, true);
  assert.equal(await b("导入候选").count(), 0);
  await shot("07-archived-1280");
  await axe("归档历史");
  report.flows.push(
    "取消归档无变化；确认后进入可读历史，禁止继续导入或生成任务",
  );
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "设置", exact: true }).click();
  await openSettingsDrawer(page, "数据与备份");
  const backup = (await app.call("/backup")).body;
  await page.getByLabel("导入备份文件", { exact: true }).setInputFiles({
    name: "backup.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(backup)),
  });
  const preview = page.getByRole("dialog", {
    name: "确认合并备份",
    exact: true,
  });
  await preview.getByText("新增整理任务", { exact: true }).waitFor();
  await preview.getByText("追加候选版本", { exact: true }).waitFor();
  await shot("08-backup-preview-1280");
  await axe("包含整理候选的恢复预览");
  await b("取消").click();
  report.flows.push("备份恢复预览明确显示任务和候选版本数量，取消不改已有历史");
  assert.deepEqual(await app.originals(), [
    principle + "\n更正：该记录不可作为最新原则。\n",
    retrospective,
  ]);
  assert.deepEqual(report.errors, []);
} catch (error) {
  report.failure = error.stack;
  await page
    .screenshot({ path: join(output, "failure.png"), fullPage: true })
    .catch(() => {});
  process.exitCode = 1;
} finally {
  await writeFile(join(output, "report.json"), JSON.stringify(report, null, 2));
  console.log(
    JSON.stringify(
      {
        flows: report.flows.length,
        axe: report.axe.length,
        errors: report.errors,
        failure: report.failure,
      },
      null,
      2,
    ),
  );
  await browser.close();
  await app.close();
}
